import { once } from 'node:events';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { ENGINE_DIR, MIME_TYPES, parseCliArgs, resolveFfmpegBinaries } from './paths.mjs';
import { loadProjectConfig } from './schema.mjs';

function startEphemeralServer(projectRoot) {
  const normalizedRoot = path.resolve(projectRoot);
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        const pathname = decodeURIComponent(url.pathname);
        let filePath;
        if (pathname.startsWith('/engine/') || pathname.startsWith('/video-engine/')) {
          const prefix = pathname.startsWith('/video-engine/') ? '/video-engine/' : '/engine/';
          const rel = pathname.slice(prefix.length);
          filePath = path.resolve(ENGINE_DIR, rel);
          if (filePath !== ENGINE_DIR && !filePath.startsWith(ENGINE_DIR + path.sep)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
          }
        } else {
          const rel = pathname === '/' ? 'scene.html' : pathname.replace(/^\/+/, '');
          filePath = path.resolve(normalizedRoot, rel);
          if (filePath !== normalizedRoot && !filePath.startsWith(normalizedRoot + path.sep)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
          }
        }
        const data = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Content-Length': data.length,
          'Cache-Control': 'no-store',
        });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

/**
 * Render project scene.html deterministically frame-by-frame to an H.264 silent MP4.
 */
export async function renderProjectVideo(project, projectPaths, options = {}) {
  const { ffmpeg: ffmpegBin } = await resolveFfmpegBinaries();
  const isFast = Boolean(options.fast);
  const aspect = options.aspect ? String(options.aspect) : '';

  let width = Number(options.width) || project.video.width;
  let height = Number(options.height) || project.video.height;
  let fps = Number(options.fps) || project.video.fps;
  let crf = Number.isInteger(options.crf) ? options.crf : project.video.crf;
  let preset = options.preset || project.video.preset;

  if (aspect === '9:16') {
    width = 1080;
    height = 1920;
  } else if (aspect === '1:1') {
    width = 1080;
    height = 1080;
  }

  if (isFast) {
    if (aspect === '9:16') {
      width = 720;
      height = 1280;
    } else if (aspect === '1:1') {
      width = 720;
      height = 720;
    } else {
      width = 1280;
      height = 720;
    }
    fps = Math.min(fps, 30);
    crf = 23;
    preset = 'ultrafast';
  }

  const totalFrames = Math.round(project.video.durationSec * fps);
  const outPath =
    options.outPath || (isFast ? projectPaths.silentFastMp4Path : projectPaths.silentMp4Path);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const { server, port } = await startEphemeralServer(projectPaths.root);

  let browser;
  let ffmpegProc;
  const onProgress = options.onProgress || (() => {});
  const log = options.log || console.log;
  const signal = options.signal;

  const abortHandler = () => {
    if (ffmpegProc && ffmpegProc.exitCode === null) {
      ffmpegProc.kill('SIGKILL');
    }
  };
  if (signal) {
    if (signal.aborted) {
      server.close();
      throw new Error('Render cancelled.');
    }
    signal.addEventListener('abort', abortHandler, { once: true });
  }

  try {
    browser = await chromium.launch({
      args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
    });
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });

    const query = new URLSearchParams({ render: '1' });
    if (aspect) query.set('aspect', aspect);
    const sceneUrl = `http://127.0.0.1:${port}/scene.html?${query.toString()}`;

    await page.goto(sceneUrl, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      if (window.__STUDIO_READY__) {
        await window.__STUDIO_READY__;
      }
      await Promise.all(
        [...document.images].map((img) =>
          img.complete ? img.decode().catch(() => {}) : new Promise((r) => {
            img.addEventListener('load', () => img.decode().catch(() => {}).finally(r), { once: true });
            img.addEventListener('error', r, { once: true });
          })
        )
      );
    });

    ffmpegProc = spawn(
      ffmpegBin,
      [
        '-y',
        '-f', 'image2pipe',
        '-vcodec', 'png',
        '-r', String(fps),
        '-i', 'pipe:0',
        '-an',
        '-c:v', 'libx264',
        '-crf', String(crf),
        '-preset', preset,
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outPath,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] }
    );

    const stderrChunks = [];
    ffmpegProc.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    const dt = 1 / fps;
    const startMs = Date.now();

    for (let frame = 0; frame < totalFrames; frame++) {
      if (signal?.aborted) {
        throw new Error('Render cancelled.');
      }
      const time = frame * dt;
      await page.evaluate(([t, delta]) => window.renderAt(t, delta), [time, dt]);
      const buffer = await page.screenshot({ type: 'png' });
      if (!ffmpegProc.stdin.write(buffer)) {
        await once(ffmpegProc.stdin, 'drain');
      }

      if (frame === 0 || (frame + 1) % Math.max(1, Math.round(fps / 2)) === 0 || frame === totalFrames - 1) {
        const done = frame + 1;
        const pct = Math.round((done / totalFrames) * 100);
        const elapsed = (Date.now() - startMs) / 1000;
        const etaSec = done > 0 ? Math.max(0, Math.round((elapsed / done) * (totalFrames - done))) : 0;
        onProgress({ frame: done, totalFrames, pct, etaSec, time });
        if (done % fps === 0 || done === totalFrames) {
          log(`[render] Frame ${done}/${totalFrames} (${pct}% · ETA ${etaSec}s)`);
        }
      }
    }

    ffmpegProc.stdin.end();
    const [exitCode, sig] = await once(ffmpegProc, 'close');
    if (exitCode !== 0) {
      const stderrText = Buffer.concat(stderrChunks).toString('utf8').slice(-600);
      throw new Error(`FFmpeg render exited with code ${exitCode} (${sig || 'none'}): ${stderrText}`);
    }

    return {
      outPath,
      width,
      height,
      fps,
      totalFrames,
      durationSec: project.video.durationSec,
      fast: isFast,
    };
  } finally {
    if (signal) signal.removeEventListener('abort', abortHandler);
    if (ffmpegProc && ffmpegProc.exitCode === null) ffmpegProc.kill('SIGKILL');
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  (async () => {
    const { flags } = parseCliArgs(process.argv.slice(2));
    const projectId = String(flags.project || '').trim();
    if (!projectId) {
      throw new Error('Usage: npm run render -- --project <id> [--fast] [--aspect 9:16]');
    }
    const { config, paths } = await loadProjectConfig(projectId);
    const result = await renderProjectVideo(config, paths, {
      fast: Boolean(flags.fast),
      aspect: flags.aspect ? String(flags.aspect) : '',
      outPath: flags.out ? path.resolve(paths.root, String(flags.out)) : undefined,
    });
    console.log(
      `[render] Saved ${path.relative(paths.root, result.outPath)} (${result.width}x${result.height} @ ${result.fps}fps, ${result.totalFrames} frames)`
    );
  })().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  });
}
