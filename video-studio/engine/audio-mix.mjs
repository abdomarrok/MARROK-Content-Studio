import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { ensureProjectDspStems } from './audio-dsp.mjs';
import { parseCliArgs, resolveFfmpegBinaries, resolveProjectRelative } from './paths.mjs';
import { loadProjectConfig } from './schema.mjs';
import { BIT_DEPTH, CHANNELS, inspectWavBuffer, SAMPLE_RATE } from './wav.mjs';

const execFileAsync = promisify(execFile);

function formatVolumeFilterArg(sfxItem) {
  if (typeof sfxItem.volumeDb === 'number' && Number.isFinite(sfxItem.volumeDb)) {
    return `${sfxItem.volumeDb}dB`;
  }
  const lin = typeof sfxItem.volume === 'number' && Number.isFinite(sfxItem.volume) ? sfxItem.volume : 1;
  return lin.toFixed(4);
}

/**
 * Build an FFmpeg argument array and human-readable filtergraph description
 * for any validated project config (0..N acts, 0..N SFX, optional music).
 */
export function buildFfmpegMixPlan(project, projectPaths, options = {}) {
  const durationSec = project.video.durationSec;
  const durStr = durationSec.toFixed(3);
  const readyVoIds = options.readyActIds ? new Set(options.readyActIds) : null;
  const readySfxFiles = options.readySfxFiles ? new Set(options.readySfxFiles) : null;
  const hasMusic = options.hasMusic !== undefined ? Boolean(options.hasMusic) : Boolean(project.music);

  const inputFiles = [];
  const inputIndexByPath = new Map();
  const addInput = (absPath, labelPath) => {
    if (!inputIndexByPath.has(absPath)) {
      inputIndexByPath.set(absPath, inputFiles.length);
      inputFiles.push({ absPath, labelPath });
    }
    return inputIndexByPath.get(absPath);
  };

  let musicIdx = null;
  if (project.music && hasMusic) {
    const musicAbs = resolveProjectRelative(projectPaths.root, project.music.file);
    musicIdx = addInput(musicAbs, project.music.file);
  }

  const activeActs = (project.acts || []).filter((act) => !readyVoIds || readyVoIds.has(act.id));
  const voInputs = activeActs.map((act) => {
    const rel = `audio/${act.id}.wav`;
    const abs = resolveProjectRelative(projectPaths.root, rel);
    return { act, idx: addInput(abs, rel) };
  });

  // Group SFX placements by resolved file path so shared files only open once and emit asplit=N only when N > 1
  const sfxGroupsMap = new Map();
  for (const item of project.sfx || []) {
    const abs = resolveProjectRelative(projectPaths.root, item.file);
    if (readySfxFiles && !readySfxFiles.has(abs)) continue;
    if (!sfxGroupsMap.has(abs)) {
      sfxGroupsMap.set(abs, { abs, file: item.file, placements: [] });
    }
    sfxGroupsMap.get(abs).placements.push(item);
  }
  const sfxGroups = [...sfxGroupsMap.values()].map((group) => ({
    ...group,
    idx: addInput(group.abs, group.file),
  }));

  const filterParts = [];
  const mixInputs = [];

  if (voInputs.length > 0) {
    const voLabels = [];
    for (let i = 0; i < voInputs.length; i++) {
      const { act, idx } = voInputs[i];
      const delayMs = Math.max(0, Math.round(act.startSec * 1000));
      const lbl = `v${i + 1}`;
      filterParts.push(`[${idx}:a]adelay=${delayMs}|${delayMs}[${lbl}]`);
      voLabels.push(`[${lbl}]`);
    }

    if (voLabels.length === 1) {
      filterParts.push(`${voLabels[0]}apad=whole_dur=${durStr},asplit=2[vo_sc][vo_mix]`);
    } else {
      filterParts.push(
        `${voLabels.join('')}amix=inputs=${voLabels.length}:duration=longest:normalize=0,apad=whole_dur=${durStr},asplit=2[vo_sc][vo_mix]`
      );
    }

    if (musicIdx !== null && project.music) {
      const m = project.music;
      const d = m.ducking;
      filterParts.push(
        `[${musicIdx}:a]volume=${m.gainDb}dB,afade=t=out:st=${m.fadeOutStartSec}:d=${m.fadeOutDurationSec}[mus_base]`
      );
      filterParts.push(
        `[mus_base][vo_sc]sidechaincompress=threshold=${d.threshold}:ratio=${d.ratio}:attack=${d.attackMs}:release=${d.releaseMs}[mus_ducked]`
      );
      mixInputs.push('[mus_ducked]', '[vo_mix]');
    } else {
      filterParts.push(`anullsrc=r=${SAMPLE_RATE}:cl=stereo:d=${durStr}[base_sil]`);
      mixInputs.push('[base_sil]', '[vo_mix]');
    }
  } else if (musicIdx !== null && project.music) {
    const m = project.music;
    filterParts.push(
      `[${musicIdx}:a]volume=${m.gainDb}dB,afade=t=out:st=${m.fadeOutStartSec}:d=${m.fadeOutDurationSec}[mus_only]`
    );
    mixInputs.push('[mus_only]');
  } else {
    filterParts.push(`anullsrc=r=${SAMPLE_RATE}:cl=stereo:d=${durStr}[base_sil]`);
    mixInputs.push('[base_sil]');
  }

  // SFX routing: no asplit when N === 1; asplit=N when N > 1
  let sfxCounter = 0;
  for (const group of sfxGroups) {
    if (group.placements.length === 1) {
      const item = group.placements[0];
      const delayMs = Math.max(0, Math.round(item.atSec * 1000));
      const vol = formatVolumeFilterArg(item);
      const outLbl = `s_${sfxCounter++}`;
      filterParts.push(`[${group.idx}:a]adelay=${delayMs}|${delayMs},volume=${vol}[${outLbl}]`);
      mixInputs.push(`[${outLbl}]`);
    } else {
      const splitLabels = group.placements.map((_, k) => `sp_${group.idx}_${k}`);
      const branches = [`[${group.idx}:a]asplit=${group.placements.length}${splitLabels.map((l) => `[${l}]`).join('')}`];
      for (let k = 0; k < group.placements.length; k++) {
        const item = group.placements[k];
        const delayMs = Math.max(0, Math.round(item.atSec * 1000));
        const vol = formatVolumeFilterArg(item);
        const outLbl = `s_${sfxCounter++}`;
        branches.push(`[${splitLabels[k]}]adelay=${delayMs}|${delayMs},volume=${vol}[${outLbl}]`);
        mixInputs.push(`[${outLbl}]`);
      }
      filterParts.push(branches.join('; '));
    }
  }

  if (mixInputs.length === 1) {
    filterParts.push(`${mixInputs[0]}alimiter=limit=0.89[out]`);
  } else {
    filterParts.push(
      `${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:normalize=0,alimiter=limit=0.89[out]`
    );
  }

  const filterComplex = filterParts.join('; ');
  const outPath = options.outPath || projectPaths.masterWavPath;

  const args = ['-y', '-v', 'error'];
  for (const inp of inputFiles) {
    args.push('-i', inp.absPath);
  }
  args.push(
    '-filter_complex',
    filterComplex,
    '-map',
    '[out]',
    '-t',
    durStr,
    '-ar',
    String(SAMPLE_RATE),
    '-ac',
    String(CHANNELS),
    '-c:a',
    `pcm_s${BIT_DEPTH}le`,
    outPath
  );

  return {
    args,
    filterComplex,
    inputFiles,
    outPath,
    voCount: voInputs.length,
    sfxPlacementCount: sfxCounter,
  };
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure DSP stems (if configured) and mix available stems into audio/master.wav.
 */
export async function mixProjectAudio(project, projectPaths, options = {}) {
  const { ffmpeg } = await resolveFfmpegBinaries();
  await fs.mkdir(projectPaths.audioDir, { recursive: true });
  await ensureProjectDspStems(project, projectPaths, { force: Boolean(options.forceDsp) });

  const readyActIds = [];
  for (const act of project.acts || []) {
    const p = resolveProjectRelative(projectPaths.root, `audio/${act.id}.wav`);
    if (await fileExists(p)) {
      readyActIds.push(act.id);
    } else if (options.requireAllVoiceovers) {
      throw new Error(`Missing voiceover stem: audio/${act.id}.wav. Run audio-vo first.`);
    }
  }

  let hasMusic = false;
  if (project.music) {
    const mp = resolveProjectRelative(projectPaths.root, project.music.file);
    hasMusic = await fileExists(mp);
    if (!hasMusic) {
      throw new Error(`Missing music stem: ${project.music.file}`);
    }
  }

  const readySfxFiles = [];
  for (const item of project.sfx || []) {
    const sp = resolveProjectRelative(projectPaths.root, item.file);
    if (await fileExists(sp)) {
      readySfxFiles.push(sp);
    } else if (item.source === 'file') {
      throw new Error(`Missing custom SFX stem: ${item.file}`);
    }
  }

  const plan = buildFfmpegMixPlan(project, projectPaths, {
    readyActIds,
    readySfxFiles,
    hasMusic,
    outPath: options.outPath || projectPaths.masterWavPath,
  });

  await execFileAsync(ffmpeg, plan.args);
  const wavInfo = inspectWavBuffer(await fs.readFile(plan.outPath));
  return {
    outPath: plan.outPath,
    wavInfo,
    voCount: plan.voCount,
    sfxPlacementCount: plan.sfxPlacementCount,
    filterComplex: plan.filterComplex,
  };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('audio-mix.mjs')) {
  const { flags } = parseCliArgs(process.argv.slice(2));
  if (flags.project) {
    const { config, paths } = await loadProjectConfig(String(flags.project));
    const res = await mixProjectAudio(config, paths, { forceDsp: Boolean(flags.force) });
    console.log(
      `[audio-mix] Built ${path.relative(paths.root, res.outPath)} (${res.wavInfo.durationSec.toFixed(3)}s, ${res.wavInfo.sampleRate}Hz ${res.wavInfo.bitsPerSample}-bit, VO=${res.voCount}, SFX=${res.sfxPlacementCount})`
    );
  }
}
