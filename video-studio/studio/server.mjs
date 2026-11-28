import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { ensureProjectDspStems } from '../engine/audio-dsp.mjs';
import { mixProjectAudio } from '../engine/audio-mix.mjs';
import { computeActCacheKey, generateProjectVoiceovers, readCacheManifest } from '../engine/audio-vo.mjs';
import { runBuildPipeline } from '../engine/build-pipeline.mjs';
import { exportVerticalVideo } from '../engine/export-social.mjs';
import {
  assertValidProjectId,
  ENGINE_DIR,
  getProjectPaths,
  listProjectIds,
  PROJECTS_DIR,
  resolveFfmpegBinaries,
  resolveProjectRelative,
  STUDIO_DIR,
} from '../engine/paths.mjs';
import { inspectProjectQa } from '../engine/qa-inspect.mjs';
import { renderProjectVideo } from '../engine/render-video.mjs';
import { loadProjectConfig, ProjectValidationError, validateProjectConfig } from '../engine/schema.mjs';
import { BIT_DEPTH, CHANNELS, inspectWavBuffer, SAMPLE_RATE } from '../engine/wav.mjs';
import { createProjectFromTemplate } from '../scripts/new-project.mjs';

const execFileAsync = promisify(execFile);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const jobs = new Map();

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readBodyBuffer(req, maxBytes = MAX_UPLOAD_BYTES) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const err = new Error(`Upload exceeds ${Math.round(maxBytes / (1024 * 1024))} MB limit.`);
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const buf = await readBodyBuffer(req, 2 * 1024 * 1024);
  if (buf.length === 0) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    const err = new Error('Invalid JSON request body.');
    err.statusCode = 400;
    throw err;
  }
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function serveFileWithRanges(req, res, filePath, extraHeaders = {}) {
  const stat = await fs.stat(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const rangeHeader = req.headers.range;

  if (rangeHeader && stat.size > 0) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(stat.size - 1, Number(match[2])) : stat.size - 1;
      if (start <= end && start < stat.size) {
        const chunkLen = end - start + 1;
        const fh = await fs.open(filePath, 'r');
        try {
          const buf = Buffer.allocUnsafe(chunkLen);
          await fh.read(buf, 0, chunkLen, start);
          res.writeHead(206, {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkLen,
            ...extraHeaders,
          });
          res.end(buf);
          return;
        } finally {
          await fh.close();
        }
      }
    }
  }

  const data = await fs.readFile(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': data.length,
    'Accept-Ranges': 'bytes',
    ...extraHeaders,
  });
  res.end(data);
}

async function buildProjectSummary(id) {
  try {
    const { config, paths } = await loadProjectConfig(id);
    return {
      id: config.id,
      name: config.name,
      valid: true,
      video: config.video,
      actCount: config.acts.length,
      hasMasterWav: await fileExists(paths.masterWavPath),
      hasFinal16x9: await fileExists(paths.final16x9Path),
      hasFinal9x16: await fileExists(paths.final9x16Path),
      hasQaSheet: await fileExists(paths.qaSheetPath),
    };
  } catch (error) {
    return {
      id,
      name: id,
      valid: false,
      error: error.message,
    };
  }
}

async function inspectAudioEntry(absPath, relPath) {
  try {
    const buf = await fs.readFile(absPath);
    const tech = inspectWavBuffer(buf);
    return { file: relPath, ready: true, tech };
  } catch {
    return { file: relPath, ready: false, tech: null };
  }
}

async function getFullProjectDetails(projectId) {
  const { config, paths } = await loadProjectConfig(projectId);
  const manifest = await readCacheManifest(paths.cacheManifestPath);
  const actsCache = manifest.acts || {};

  const actStems = [];
  for (let i = 0; i < config.acts.length; i++) {
    const act = config.acts[i];
    const rel = `audio/${act.id}.wav`;
    const abs = resolveProjectRelative(paths.root, rel);
    const entry = await inspectAudioEntry(abs, rel);
    const expectedHash = computeActCacheKey(config, act, i);
    const cached = Boolean(entry.ready && actsCache[act.id]?.hash === expectedHash);
    const exceedsMax = Boolean(entry.ready && entry.tech && entry.tech.durationSec > act.maxDurationSec + 0.02);
    actStems.push({
      id: act.id,
      label: act.label,
      startSec: act.startSec,
      maxDurationSec: act.maxDurationSec,
      cached,
      exceedsMaxDuration: exceedsMax,
      ...entry,
    });
  }

  let musicStem = null;
  if (config.music) {
    const abs = resolveProjectRelative(paths.root, config.music.file);
    musicStem = {
      source: config.music.source,
      gainDb: config.music.gainDb,
      ...(await inspectAudioEntry(abs, config.music.file)),
    };
  }

  const sfxStems = [];
  const seenSfx = new Set();
  for (const item of config.sfx || []) {
    if (seenSfx.has(item.file)) continue;
    seenSfx.add(item.file);
    const abs = resolveProjectRelative(paths.root, item.file);
    sfxStems.push({
      id: item.id,
      source: item.source,
      ...(await inspectAudioEntry(abs, item.file)),
    });
  }

  const masterStem = await inspectAudioEntry(paths.masterWavPath, 'audio/master.wav');

  let assetFiles = [];
  try {
    const entries = await fs.readdir(paths.assetsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const st = await fs.stat(path.join(paths.assetsDir, e.name));
      assetFiles.push({ name: e.name, path: `assets/${e.name}`, sizeBytes: st.size });
    }
  } catch {
    // assets dir missing
  }

  let qaReport = null;
  try {
    qaReport = JSON.parse(await fs.readFile(paths.qaReportPath, 'utf8'));
  } catch {
    // not generated yet
  }

  const silentFastPath = path.join(paths.outputDir, 'silent-fast.mp4');
  const finalFastPath = path.join(paths.outputDir, 'final-fast.mp4');

  return {
    config,
    stems: {
      acts: actStems,
      music: musicStem,
      sfx: sfxStems,
      master: masterStem,
    },
    assets: assetFiles,
    outputs: {
      silent: await fileExists(paths.silentMp4Path),
      silentFast: await fileExists(silentFastPath),
      final16x9: await fileExists(paths.final16x9Path),
      finalFast: await fileExists(finalFastPath),
      final9x16: await fileExists(paths.final9x16Path),
      qaSheet: await fileExists(paths.qaSheetPath),
    },
    qaReport,
  };
}

function createJob(projectId, type) {
  const id = crypto.randomUUID().slice(0, 12);
  const controller = new AbortController();
  const job = {
    id,
    projectId,
    type,
    status: 'running',
    controller,
    events: [],
    listeners: new Set(),
  };
  jobs.set(id, job);
  return job;
}

function emitJobEvent(job, eventName, data) {
  const entry = { event: eventName, data };
  job.events.push(entry);
  if (job.events.length > 200) job.events.shift();
  const serialized = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of job.listeners) {
    res.write(serialized);
  }
}

function startBackgroundJob(projectId, type, opts = {}) {
  const job = createJob(projectId, type);
  const log = (msg) => emitJobEvent(job, 'log', { message: String(msg) });
  const onProgress = (p) => emitJobEvent(job, 'progress', p);

  (async () => {
    try {
      const { config, paths } = await loadProjectConfig(projectId);
      let result = null;
      if (type === 'render') {
        result = await renderProjectVideo(config, paths, {
          onProgress,
          signal: job.controller.signal,
          log,
        });
      } else if (type === 'render-fast') {
        result = await renderProjectVideo(config, paths, {
          fast: true,
          onProgress,
          signal: job.controller.signal,
          log,
        });
      } else if (type === 'vertical') {
        onProgress({ stage: 'vertical', pct: 15 });
        result = await exportVerticalVideo(config, paths, {
          onProgress,
          signal: job.controller.signal,
          log,
        });
      } else if (type === 'qa') {
        onProgress({ stage: 'qa', pct: 35 });
        result = await inspectProjectQa(config, paths);
      } else if (type === 'build') {
        result = await runBuildPipeline(projectId, {
          vertical: opts.vertical !== undefined ? Boolean(opts.vertical) : true,
          fast: Boolean(opts.fast),
          force: Boolean(opts.force),
          onProgress,
          signal: job.controller.signal,
          log,
        });
      } else {
        throw new Error(`Unsupported job type: ${type}`);
      }

      job.status = 'done';
      emitJobEvent(job, 'done', { jobId: job.id, type, result });
    } catch (error) {
      if (job.controller.signal.aborted || /cancelled/i.test(error.message)) {
        job.status = 'cancelled';
        emitJobEvent(job, 'cancelled', { jobId: job.id, message: 'Job cancelled by user.' });
      } else {
        job.status = 'error';
        emitJobEvent(job, 'error', { jobId: job.id, message: error.message });
      }
    } finally {
      for (const res of job.listeners) {
        res.end();
      }
      job.listeners.clear();
    }
  })();

  return job;
}

async function handleAudioOrAssetUpload(req, res, projectId, url) {
  const { paths } = await loadProjectConfig(projectId);
  const rawName = url.searchParams.get('filename') || req.headers['x-file-name'] || '';
  const target = url.searchParams.get('target') === 'audio' ? 'audio' : 'assets';
  const safeName = path.basename(String(rawName).trim()).replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safeName || safeName.startsWith('.')) {
    return sendJson(res, 400, { error: 'Valid filename query param or x-file-name header is required.' });
  }

  const rawBuf = await readBodyBuffer(req);
  if (rawBuf.length === 0) {
    return sendJson(res, 400, { error: 'Empty upload body.' });
  }

  if (target === 'audio') {
    const { ffmpeg } = await resolveFfmpegBinaries();
    const outName = safeName.toLowerCase().endsWith('.wav') ? safeName : `${path.parse(safeName).name}.wav`;
    const destPath = resolveProjectRelative(paths.root, `audio/${outName}`);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-upload-'));
    const tmpIn = path.join(tmpDir, safeName);
    try {
      await fs.writeFile(tmpIn, rawBuf);
      await execFileAsync(ffmpeg, [
        '-y',
        '-v', 'error',
        '-i', tmpIn,
        '-ar', String(SAMPLE_RATE),
        '-ac', String(CHANNELS),
        '-c:a', `pcm_s${BIT_DEPTH}le`,
        '-map_metadata', '-1',
        destPath,
      ]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
    return sendJson(res, 200, { ok: true, file: `audio/${outName}` });
  }

  const destPath = resolveProjectRelative(paths.root, `assets/${safeName}`);
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, rawBuf);
  return sendJson(res, 200, { ok: true, file: `assets/${safeName}`, sizeBytes: rawBuf.length });
}

async function handleRequest(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    // UI entrypoint
    if ((pathname === '/' || pathname === '/index.html') && req.method === 'GET') {
      return await serveFileWithRanges(req, res, path.join(STUDIO_DIR, 'public', 'index.html'), {
        'Cache-Control': 'no-store',
      });
    }

    // Engine static files (e.g. /engine/motion-sdk.js)
    if (pathname.startsWith('/engine/') && req.method === 'GET') {
      const rel = pathname.slice('/engine/'.length);
      const target = path.resolve(ENGINE_DIR, rel);
      if (!target.startsWith(ENGINE_DIR)) {
        return sendJson(res, 403, { error: 'Forbidden' });
      }
      return await serveFileWithRanges(req, res, target, { 'Cache-Control': 'no-store' });
    }

    // Serve project static files (/projects/:id/...)
    if (pathname.startsWith('/projects/') && (req.method === 'GET' || req.method === 'HEAD')) {
      const parts = pathname.slice('/projects/'.length).split('/');
      const projectId = parts.shift();
      assertValidProjectId(projectId);
      const relPath = parts.join('/') || 'scene.html';
      const projectPaths = getProjectPaths(projectId);
      const filePath = resolveProjectRelative(projectPaths.root, relPath);
      if (path.basename(filePath).startsWith('.')) {
        return sendJson(res, 403, { error: 'Forbidden' });
      }
      if (!(await fileExists(filePath))) {
        return sendJson(res, 404, { error: `Not found: ${relPath}` });
      }
      const isDownload = url.searchParams.get('download') === '1';
      const extraHeaders = {
        'Cache-Control': 'no-store',
        ...(isDownload ? { 'Content-Disposition': `attachment; filename="${path.basename(filePath)}"` } : {}),
      };
      if (req.method === 'HEAD') {
        const st = await fs.stat(filePath);
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
          'Content-Length': st.size,
          'Accept-Ranges': 'bytes',
          ...extraHeaders,
        });
        res.end();
        return;
      }
      return await serveFileWithRanges(req, res, filePath, extraHeaders);
    }

    // API: List / Create projects
    if (pathname === '/api/projects' && req.method === 'GET') {
      const ids = await listProjectIds();
      const projects = [];
      for (const id of ids) {
        projects.push(await buildProjectSummary(id));
      }
      return sendJson(res, 200, { projects });
    }

    if (pathname === '/api/projects' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const { config } = await createProjectFromTemplate({
        id: String(body.id || '').trim(),
        name: body.name ? String(body.name) : undefined,
        durationSec: body.durationSec !== undefined ? Number(body.durationSec) : undefined,
      });
      return sendJson(res, 201, { ok: true, project: await getFullProjectDetails(config.id) });
    }

    // API: SSE job stream & cancel
    const jobStreamMatch = /^\/api\/jobs\/([^/]+)\/stream$/.exec(pathname);
    if (jobStreamMatch && req.method === 'GET') {
      const job = jobs.get(jobStreamMatch[1]);
      if (!job) return sendJson(res, 404, { error: 'Unknown job id.' });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      for (const evt of job.events) {
        res.write(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
      }
      if (job.status === 'running') {
        job.listeners.add(res);
        req.on('close', () => job.listeners.delete(res));
      } else {
        res.end();
      }
      return;
    }

    const jobCancelMatch = /^\/api\/jobs\/([^/]+)\/cancel$/.exec(pathname);
    if (jobCancelMatch && req.method === 'POST') {
      const job = jobs.get(jobCancelMatch[1]);
      if (!job) return sendJson(res, 404, { error: 'Unknown job id.' });
      job.controller.abort();
      return sendJson(res, 200, { ok: true, status: 'cancelling' });
    }

    // API: Project-specific routes (/api/projects/:id...)
    const projMatch = /^\/api\/projects\/([^/]+)(\/.*)?$/.exec(pathname);
    if (projMatch) {
      const projectId = assertValidProjectId(projMatch[1]);
      const sub = projMatch[2] || '';

      if (sub === '' && req.method === 'GET') {
        return sendJson(res, 200, await getFullProjectDetails(projectId));
      }

      if (sub === '' && req.method === 'PUT') {
        const body = await readJsonBody(req);
        const { paths } = await loadProjectConfig(projectId);
        const validated = validateProjectConfig(body, projectId);
        await fs.writeFile(paths.configPath, JSON.stringify(validated, null, 2) + '\n', 'utf8');
        return sendJson(res, 200, { ok: true, project: await getFullProjectDetails(projectId) });
      }

      if (sub === '/audio/vo' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const { config, paths } = await loadProjectConfig(projectId);
        const voResults = await generateProjectVoiceovers(config, paths, {
          actId: body.actId ? String(body.actId) : null,
          force: Boolean(body.force),
        });
        await ensureProjectDspStems(config, paths);
        const mix = await mixProjectAudio(config, paths);
        return sendJson(res, 200, {
          ok: true,
          voResults,
          masterDurationSec: mix.wavInfo.durationSec,
          project: await getFullProjectDetails(projectId),
        });
      }

      if (sub === '/audio/mix' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const { config, paths } = await loadProjectConfig(projectId);
        const mix = await mixProjectAudio(config, paths, { forceDsp: Boolean(body.forceDsp) });
        return sendJson(res, 200, {
          ok: true,
          masterDurationSec: mix.wavInfo.durationSec,
          project: await getFullProjectDetails(projectId),
        });
      }

      if (sub === '/assets' && req.method === 'POST') {
        return await handleAudioOrAssetUpload(req, res, projectId, url);
      }

      if (sub === '/jobs' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const type = String(body.type || 'build');
        const job = startBackgroundJob(projectId, type, body);
        return sendJson(res, 202, { ok: true, jobId: job.id, type });
      }
    }

    return sendJson(res, 404, { error: 'Route not found' });
  } catch (error) {
    const statusCode = error instanceof ProjectValidationError ? 400 : Number(error?.statusCode) || 500;
    return sendJson(res, statusCode, {
      error: error.message || 'Internal server error',
      ...(error.issues ? { issues: error.issues } : {}),
    });
  }
}

export async function startStudioServer(options = {}) {
  const port = options.port !== undefined ? Number(options.port) : Number(process.env.PORT) || 3000;
  const host = options.host || '127.0.0.1';
  await fs.mkdir(PROJECTS_DIR, { recursive: true });
  const server = http.createServer(handleRequest);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const addr = server.address();
  return { server, host, port: addr.port };
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  startStudioServer({ host: '0.0.0.0' })
    .then(({ port }) => {
      console.log(`MARROK Video Studio running at http://localhost:${port}`);
    })
    .catch((err) => {
      console.error(`Failed to start studio server: ${err.message}`);
      process.exitCode = 1;
    });
}
