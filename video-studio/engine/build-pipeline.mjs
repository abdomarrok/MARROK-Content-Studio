import { execFile } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { ensureProjectDspStems } from './audio-dsp.mjs';
import { mixProjectAudio } from './audio-mix.mjs';
import { generateProjectVoiceovers } from './audio-vo.mjs';
import { exportVerticalVideo } from './export-social.mjs';
import { parseCliArgs, resolveFfmpegBinaries } from './paths.mjs';
import { inspectProjectQa } from './qa-inspect.mjs';
import { renderProjectVideo } from './render-video.mjs';
import { loadProjectConfig } from './schema.mjs';

const execFileAsync = promisify(execFile);

/**
 * Full deterministic video production pipeline:
 * 1) VO (hash-cached) + DSP -> 2) Mix master.wav -> 3) Render silent.mp4 ->
 * 4) Mux final-16x9.mp4 -> 5) Optional 9:16 vertical export -> 6) QA inspection & contact sheet.
 */
export async function runBuildPipeline(projectId, options = {}) {
  const { config, paths } = await loadProjectConfig(projectId);
  const { ffmpeg } = await resolveFfmpegBinaries();
  const log = options.log || console.log;
  const onProgress = options.onProgress || (() => {});
  const signal = options.signal;

  onProgress({ stage: 'audio-vo', pct: 5 });
  await generateProjectVoiceovers(config, paths, {
    force: Boolean(options.force),
    log,
  });

  onProgress({ stage: 'audio-dsp', pct: 12 });
  await ensureProjectDspStems(config, paths, { force: Boolean(options.force) });

  onProgress({ stage: 'audio-mix', pct: 18 });
  await mixProjectAudio(config, paths, { requireAllVoiceovers: true });

  onProgress({ stage: 'render', pct: 22 });
  const renderRes = await renderProjectVideo(config, paths, {
    fast: Boolean(options.fast),
    signal,
    log,
    onProgress: (p) => {
      onProgress({
        stage: 'render',
        frame: p.frame,
        totalFrames: p.totalFrames,
        pct: 22 + Math.round(p.pct * 0.63),
        etaSec: p.etaSec,
      });
    },
  });

  onProgress({ stage: 'mux', pct: 88 });
  const finalOutPath = options.fast
    ? path.join(paths.outputDir, 'final-fast.mp4')
    : paths.final16x9Path;

  await execFileAsync(ffmpeg, [
    '-y',
    '-v', 'error',
    '-i', renderRes.outPath,
    '-i', paths.masterWavPath,
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    finalOutPath,
  ]);
  log(`[mux] Built ${path.relative(paths.root, finalOutPath)}`);

  let verticalRes = null;
  if (options.vertical || (options.vertical === undefined && config.video.verticalExport?.enabled)) {
    onProgress({ stage: 'vertical', pct: 92 });
    verticalRes = await exportVerticalVideo(config, paths, { signal, log });
  }

  onProgress({ stage: 'qa', pct: 96 });
  const qa = await inspectProjectQa(config, paths);
  onProgress({ stage: 'done', pct: 100 });

  return {
    projectId: config.id,
    final16x9Path: finalOutPath,
    final9x16Path: verticalRes?.outPath || null,
    qa,
  };
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  (async () => {
    const { flags } = parseCliArgs(process.argv.slice(2));
    const projectId = String(flags.project || '').trim();
    if (!projectId) {
      throw new Error('Usage: npm run build-video -- --project <id> [--vertical] [--fast] [--force]');
    }
    const res = await runBuildPipeline(projectId, {
      vertical: flags.vertical !== undefined ? Boolean(flags.vertical) : undefined,
      fast: Boolean(flags.fast),
      force: Boolean(flags.force),
    });
    console.log(`[build-video] Complete for ${res.projectId}. QA passed=${res.qa.passed}`);
    if (!res.qa.passed) {
      process.exitCode = 1;
    }
  })().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  });
}
