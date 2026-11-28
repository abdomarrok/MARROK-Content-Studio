import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { parseCliArgs, resolveFfmpegBinaries } from './paths.mjs';
import { renderProjectVideo } from './render-video.mjs';
import { loadProjectConfig } from './schema.mjs';

const execFileAsync = promisify(execFile);

/**
 * Export 9:16 vertical social video (`output/final-9x16.mp4`, 1080x1920)
 * using either 'padded' (16:9 framed over brand matte), 'crop', or 'native' (?aspect=9:16 render).
 */
export async function exportVerticalVideo(project, projectPaths, options = {}) {
  const { ffmpeg } = await resolveFfmpegBinaries();
  const ve = project.video.verticalExport || {
    enabled: true,
    mode: 'padded',
    backgroundColor: '#0D0D0D',
  };
  const mode = options.mode || ve.mode || 'padded';
  const bg = (ve.backgroundColor || '#0D0D0D').replace('#', '0x');
  const outPath = options.outPath || projectPaths.final9x16Path;
  const log = options.log || console.log;

  await fs.mkdir(path.dirname(outPath), { recursive: true });

  if (mode === 'native') {
    const verticalSilentPath = path.join(projectPaths.outputDir, 'silent-9x16.mp4');
    await renderProjectVideo(project, projectPaths, {
      aspect: '9:16',
      outPath: verticalSilentPath,
      onProgress: options.onProgress,
      signal: options.signal,
      log,
    });

    let hasAudio = false;
    try {
      await fs.access(projectPaths.masterWavPath);
      hasAudio = true;
    } catch {
      // silent fallback
    }

    if (hasAudio) {
      await execFileAsync(ffmpeg, [
        '-y',
        '-v', 'error',
        '-i', verticalSilentPath,
        '-i', projectPaths.masterWavPath,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
        outPath,
      ]);
    } else {
      await fs.copyFile(verticalSilentPath, outPath);
    }
    return { outPath, mode };
  }

  let sourceVideo = null;
  let sourceHasAudio = false;
  for (const candidate of [projectPaths.final16x9Path, projectPaths.silentMp4Path]) {
    try {
      await fs.access(candidate);
      sourceVideo = candidate;
      sourceHasAudio = candidate === projectPaths.final16x9Path;
      break;
    } catch {
      // continue
    }
  }
  if (!sourceVideo) {
    throw new Error(
      `No 16:9 render found for "${project.id}". Run render or build-video before vertical export.`
    );
  }

  const vf =
    mode === 'crop'
      ? 'crop=ih*9/16:ih,scale=1080:1920:flags=lanczos,setsar=1'
      : `scale=1080:-2:flags=lanczos,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=${bg},setsar=1`;

  const args = ['-y', '-v', 'error', '-i', sourceVideo];
  let hasExternalAudio = false;
  if (!sourceHasAudio) {
    try {
      await fs.access(projectPaths.masterWavPath);
      args.push('-i', projectPaths.masterWavPath);
      hasExternalAudio = true;
    } catch {
      // no audio
    }
  }

  args.push('-vf', vf, '-c:v', 'libx264', '-crf', String(project.video.crf), '-preset', project.video.preset, '-pix_fmt', 'yuv420p');
  if (sourceHasAudio) {
    args.push('-c:a', 'aac', '-b:a', '192k');
  } else if (hasExternalAudio) {
    args.push('-map', '0:v:0', '-map', '1:a:0', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  } else {
    args.push('-an');
  }
  args.push('-movflags', '+faststart', outPath);

  log(`[vertical] Exporting 1080x1920 (${mode}) -> ${path.relative(projectPaths.root, outPath)}`);
  await execFileAsync(ffmpeg, args);

  return { outPath, mode };
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  (async () => {
    const { flags } = parseCliArgs(process.argv.slice(2));
    const projectId = String(flags.project || '').trim();
    if (!projectId) {
      throw new Error('Usage: node engine/export-social.mjs --project <id> [--mode padded|native|crop]');
    }
    const { config, paths } = await loadProjectConfig(projectId);
    const res = await exportVerticalVideo(config, paths, {
      mode: flags.mode ? String(flags.mode) : undefined,
    });
    console.log(`[vertical] Done: ${path.relative(paths.root, res.outPath)} (mode=${res.mode})`);
  })().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  });
}
