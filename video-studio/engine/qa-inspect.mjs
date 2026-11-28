import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { parseCliArgs, resolveFfmpegBinaries, resolveProjectRelative } from './paths.mjs';
import { loadProjectConfig } from './schema.mjs';
import { inspectWavBuffer } from './wav.mjs';

const execFileAsync = promisify(execFile);

async function probeMedia(ffprobe, filePath) {
  try {
    await fs.access(filePath);
  } catch {
    return null;
  }
  const { stdout } = await execFileAsync(ffprobe, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);
  const parsed = JSON.parse(stdout);
  const videoStream = (parsed.streams || []).find((s) => s.codec_type === 'video') || null;
  const audioStream = (parsed.streams || []).find((s) => s.codec_type === 'audio') || null;
  return {
    exists: true,
    durationSec: Number(parsed.format?.duration || 0),
    sizeBytes: Number(parsed.format?.size || 0),
    bitRate: Number(parsed.format?.bit_rate || 0),
    video: videoStream
      ? {
          codec: videoStream.codec_name,
          width: videoStream.width,
          height: videoStream.height,
          fps: videoStream.r_frame_rate,
          pixFmt: videoStream.pix_fmt,
          nbFrames: Number(videoStream.nb_frames || 0),
          durationSec: Number(videoStream.duration || parsed.format?.duration || 0),
        }
      : null,
    audio: audioStream
      ? {
          codec: audioStream.codec_name,
          sampleRate: Number(audioStream.sample_rate || 0),
          channels: Number(audioStream.channels || 0),
          bitsPerSample: Number(audioStream.bits_per_sample || 0),
          bitRate: Number(audioStream.bit_rate || 0),
          durationSec: Number(audioStream.duration || parsed.format?.duration || 0),
        }
      : null,
  };
}

function buildKeyTimestamps(project) {
  const dur = project.video.durationSec;
  const points = [];
  if (project.acts && project.acts.length > 0) {
    for (const act of project.acts) {
      const mid = Math.min(dur - 0.15, Math.max(0.1, act.startSec + Math.min(act.maxDurationSec * 0.65, 2.2)));
      points.push(Number(mid.toFixed(2)));
    }
  } else {
    const count = 6;
    for (let i = 0; i < count; i++) {
      points.push(Number((((i + 0.5) / count) * dur).toFixed(2)));
    }
  }
  // Ensure opening and ending frames are well-represented while capping at 9 tiles
  if (points.length < 6) {
    for (const frac of [0.1, 0.3, 0.5, 0.7, 0.85, 0.96]) {
      if (points.length >= 6) break;
      points.push(Number((dur * frac).toFixed(2)));
    }
  }
  return [...new Set(points)].sort((a, b) => a - b).slice(0, 9);
}

async function generateContactSheet(ffmpeg, videoPath, outPath, project) {
  const timestamps = buildKeyTimestamps(project);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-qa-'));

  try {
    const framePaths = [];
    for (let i = 0; i < timestamps.length; i++) {
      const fp = path.join(tmpDir, `frame_${i}.png`);
      await execFileAsync(ffmpeg, [
        '-y',
        '-v', 'error',
        '-ss', String(timestamps[i]),
        '-i', videoPath,
        '-frames:v', '1',
        '-vf', 'scale=640:-2',
        fp,
      ]);
      framePaths.push(fp);
    }

    const cols = Math.min(3, framePaths.length);
    const rows = Math.ceil(framePaths.length / cols);
    const args = ['-y', '-v', 'error'];
    for (const fp of framePaths) {
      args.push('-i', fp);
    }
    const inputs = framePaths.map((_, i) => `[${i}:v]`).join('');
    args.push(
      '-filter_complex',
      `${inputs}concat=n=${framePaths.length}:v=1:a=0,tile=${cols}x${rows}:padding=8:color=0x0D0D0D[sheet]`,
      '-map', '[sheet]',
      outPath
    );
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await execFileAsync(ffmpeg, args);
    return { timestamps, outPath };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Inspect stems, master audio, and rendered MP4 outputs via ffprobe and generate output/qa-sheet.png.
 */
export async function inspectProjectQa(project, projectPaths) {
  const { ffmpeg, ffprobe } = await resolveFfmpegBinaries();
  const warnings = [];
  const errors = [];

  const final16x9 = await probeMedia(ffprobe, projectPaths.final16x9Path);
  const final9x16 = await probeMedia(ffprobe, projectPaths.final9x16Path);
  const silentMp4 = await probeMedia(ffprobe, projectPaths.silentMp4Path);
  const masterWav = await probeMedia(ffprobe, projectPaths.masterWavPath);

  const expectedDur = project.video.durationSec;
  const expectedFrames = Math.round(expectedDur * project.video.fps);

  if (final16x9) {
    if (Math.abs(final16x9.durationSec - expectedDur) > 0.08) {
      errors.push(`final-16x9.mp4 duration ${final16x9.durationSec}s != expected ${expectedDur}s`);
    }
    if (final16x9.video?.width !== project.video.width || final16x9.video?.height !== project.video.height) {
      errors.push(
        `final-16x9.mp4 resolution ${final16x9.video?.width}x${final16x9.video?.height} != ${project.video.width}x${project.video.height}`
      );
    }
    if (final16x9.video?.nbFrames && Math.abs(final16x9.video.nbFrames - expectedFrames) > 2) {
      warnings.push(`final-16x9.mp4 frame count ${final16x9.video.nbFrames} vs expected ${expectedFrames}`);
    }
    if (!final16x9.audio || final16x9.audio.sampleRate !== 48000) {
      errors.push(`final-16x9.mp4 audio stream missing or sampleRate != 48000`);
    }
  } else {
    warnings.push('output/final-16x9.mp4 has not been built yet.');
  }

  if (masterWav) {
    if (Math.abs(masterWav.durationSec - expectedDur) > 0.08) {
      errors.push(`audio/master.wav duration ${masterWav.durationSec}s != expected ${expectedDur}s`);
    }
    if (masterWav.audio?.sampleRate !== 48000 || masterWav.audio?.channels !== 2) {
      errors.push('audio/master.wav must be 48000 Hz stereo');
    }
  } else {
    warnings.push('audio/master.wav has not been generated yet.');
  }

  const stems = [];
  for (const act of project.acts || []) {
    const rel = `audio/${act.id}.wav`;
    const abs = resolveProjectRelative(projectPaths.root, rel);
    try {
      const info = inspectWavBuffer(await fs.readFile(abs));
      const exceeds = info.durationSec > act.maxDurationSec + 0.02;
      if (exceeds) {
        errors.push(`${rel} duration ${info.durationSec.toFixed(3)}s exceeds maxDurationSec ${act.maxDurationSec}s`);
      }
      stems.push({
        id: act.id,
        file: rel,
        ready: true,
        durationSec: info.durationSec,
        maxDurationSec: act.maxDurationSec,
        peakDb: info.peakDb,
        leadingSilenceMs: info.leadingSilenceMs,
        sampleRate: info.sampleRate,
        bitsPerSample: info.bitsPerSample,
        channels: info.channels,
        exceedsMaxDuration: exceeds,
      });
    } catch {
      stems.push({ id: act.id, file: rel, ready: false, maxDurationSec: act.maxDurationSec });
      warnings.push(`${rel} not generated yet.`);
    }
  }

  let contactSheet = null;
  const sheetSource = final16x9 ? projectPaths.final16x9Path : silentMp4 ? projectPaths.silentMp4Path : null;
  if (sheetSource) {
    contactSheet = await generateContactSheet(ffmpeg, sheetSource, projectPaths.qaSheetPath, project);
  } else {
    warnings.push('No rendered MP4 available to generate output/qa-sheet.png.');
  }

  const report = {
    projectId: project.id,
    checkedAt: new Date().toISOString(),
    passed: errors.length === 0,
    errors,
    warnings,
    outputs: {
      final16x9,
      final9x16,
      silentMp4,
      masterWav,
      qaSheet: contactSheet
        ? { file: 'output/qa-sheet.png', timestamps: contactSheet.timestamps }
        : null,
    },
    stems,
  };

  await fs.mkdir(projectPaths.outputDir, { recursive: true });
  await fs.writeFile(projectPaths.qaReportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return report;
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  (async () => {
    const { flags } = parseCliArgs(process.argv.slice(2));
    const projectId = String(flags.project || '').trim();
    if (!projectId) {
      throw new Error('Usage: npm run qa -- --project <id>');
    }
    const { config, paths } = await loadProjectConfig(projectId);
    const report = await inspectProjectQa(config, paths);
    console.log(
      `[qa] ${config.id}: passed=${report.passed}, errors=${report.errors.length}, warnings=${report.warnings.length}`
    );
    if (report.outputs.final16x9) {
      const f = report.outputs.final16x9;
      console.log(
        `[qa] final-16x9.mp4: ${f.video?.width}x${f.video?.height} @ ${f.video?.fps} (${f.video?.nbFrames} frames), ${f.durationSec.toFixed(3)}s, audio=${f.audio?.codec} ${f.audio?.sampleRate}Hz`
      );
    }
    if (report.outputs.qaSheet) {
      console.log(`[qa] Contact sheet: ${report.outputs.qaSheet.file} @ [${report.outputs.qaSheet.timestamps.join(', ')}]s`);
    }
    if (report.errors.length > 0) {
      console.error('Errors:\n- ' + report.errors.join('\n- '));
      process.exitCode = 1;
    }
  })().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  });
}
