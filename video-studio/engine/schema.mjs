import fs from 'node:fs/promises';
import { getProjectPaths, isValidProjectId, resolveProjectRelative } from './paths.mjs';

const VALID_PROVIDERS = new Set(['elevenlabs', 'gemini']);
const VALID_VERTICAL_MODES = new Set(['padded', 'native', 'crop']);
const VALID_SOURCES = new Set(['dsp', 'file']);
const VALID_PRESETS = new Set([
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow',
]);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ACT_ID_RE = /^[a-zA-Z0-9_-]{1,48}$/;

export class ProjectValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'ProjectValidationError';
    this.issues = issues;
    this.statusCode = 400;
  }
}

function isPlainObject(val) {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function assertPositiveNumber(val, pathLabel, issues) {
  if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) {
    issues.push(`${pathLabel} must be a positive finite number`);
    return null;
  }
  return val;
}

function assertNonNegativeNumber(val, pathLabel, issues) {
  if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
    issues.push(`${pathLabel} must be a non-negative finite number`);
    return null;
  }
  return val;
}

function validateVoiceSettings(settings, pathLabel, issues) {
  if (settings === undefined || settings === null) return {};
  if (!isPlainObject(settings)) {
    issues.push(`${pathLabel} must be an object`);
    return {};
  }
  const out = {};
  for (const key of ['stability', 'similarity_boost', 'style']) {
    if (settings[key] !== undefined) {
      if (typeof settings[key] !== 'number' || !Number.isFinite(settings[key]) || settings[key] < 0 || settings[key] > 1) {
        issues.push(`${pathLabel}.${key} must be a number between 0 and 1`);
      } else {
        out[key] = settings[key];
      }
    }
  }
  if (settings.use_speaker_boost !== undefined) {
    if (typeof settings.use_speaker_boost !== 'boolean') {
      issues.push(`${pathLabel}.use_speaker_boost must be a boolean`);
    } else {
      out.use_speaker_boost = settings.use_speaker_boost;
    }
  }
  if (settings.speed !== undefined) {
    if (typeof settings.speed !== 'number' || !Number.isFinite(settings.speed) || settings.speed < 0.7 || settings.speed > 1.2) {
      issues.push(`${pathLabel}.speed must be a number between 0.7 and 1.2`);
    } else {
      out.speed = settings.speed;
    }
  }
  return out;
}

function validateVoiceBlock(voice, pathLabel, issues, isOverride = false) {
  if (!isPlainObject(voice)) {
    issues.push(`${pathLabel} must be an object`);
    return null;
  }
  const out = {};
  if (voice.provider !== undefined) {
    if (!VALID_PROVIDERS.has(voice.provider)) {
      issues.push(`${pathLabel}.provider must be "elevenlabs" or "gemini"`);
    } else {
      out.provider = voice.provider;
    }
  } else if (!isOverride) {
    issues.push(`${pathLabel}.provider is required ("elevenlabs" or "gemini")`);
  }

  if (voice.voiceId !== undefined) {
    if (typeof voice.voiceId !== 'string' || !voice.voiceId.trim()) {
      issues.push(`${pathLabel}.voiceId must be a non-empty string`);
    } else {
      out.voiceId = voice.voiceId.trim();
    }
  } else if (!isOverride) {
    issues.push(`${pathLabel}.voiceId is required`);
  }

  if (voice.modelId !== undefined) {
    if (typeof voice.modelId !== 'string' || !voice.modelId.trim()) {
      issues.push(`${pathLabel}.modelId must be a non-empty string`);
    } else {
      out.modelId = voice.modelId.trim();
    }
  } else if (!isOverride) {
    out.modelId = out.provider === 'gemini' ? 'gemini-2.5-flash-preview-tts' : 'eleven_multilingual_v2';
  }

  if (voice.seed !== undefined && voice.seed !== null) {
    if (!Number.isInteger(voice.seed) || voice.seed < 0) {
      issues.push(`${pathLabel}.seed must be a non-negative integer`);
    } else {
      out.seed = voice.seed;
    }
  }

  if (voice.settings !== undefined) {
    out.settings = validateVoiceSettings(voice.settings, `${pathLabel}.settings`, issues);
  } else if (!isOverride) {
    out.settings = {};
  }

  return out;
}

/**
 * Validate and normalize a project.json configuration object.
 * Throws ProjectValidationError listing every schema violation.
 */
export function validateProjectConfig(raw, expectedId = null) {
  const issues = [];
  if (!isPlainObject(raw)) {
    throw new ProjectValidationError('project.json root must be a JSON object', ['root must be an object']);
  }

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!isValidProjectId(id)) {
    issues.push('id must match /^[a-z0-9][a-z0-9-]{0,62}$/');
  } else if (expectedId && id !== expectedId) {
    issues.push(`id "${id}" does not match folder name "${expectedId}"`);
  }

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) {
    issues.push('name must be a non-empty string');
  }

  // Video block
  if (!isPlainObject(raw.video)) {
    issues.push('video must be an object');
  }
  const v = isPlainObject(raw.video) ? raw.video : {};
  const width = v.width === undefined ? 1920 : v.width;
  const height = v.height === undefined ? 1080 : v.height;
  const fps = v.fps === undefined ? 60 : v.fps;
  const crf = v.crf === undefined ? 16 : v.crf;
  const preset = v.preset === undefined ? 'slow' : v.preset;

  if (!Number.isInteger(width) || width < 16 || width % 2 !== 0) {
    issues.push('video.width must be an even integer >= 16');
  }
  if (!Number.isInteger(height) || height < 16 || height % 2 !== 0) {
    issues.push('video.height must be an even integer >= 16');
  }
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps < 1 || fps > 120) {
    issues.push('video.fps must be between 1 and 120');
  }
  const durationSec = assertPositiveNumber(v.durationSec, 'video.durationSec', issues) ?? 1;
  if (!Number.isInteger(crf) || crf < 0 || crf > 51) {
    issues.push('video.crf must be an integer between 0 and 51');
  }
  if (typeof preset !== 'string' || !VALID_PRESETS.has(preset)) {
    issues.push(`video.preset must be one of: ${[...VALID_PRESETS].join(', ')}`);
  }

  const veRaw = v.verticalExport === undefined ? { enabled: false, mode: 'padded', backgroundColor: '#0D0D0D' } : v.verticalExport;
  let verticalExport = { enabled: false, mode: 'padded', backgroundColor: '#0D0D0D' };
  if (!isPlainObject(veRaw)) {
    issues.push('video.verticalExport must be an object');
  } else {
    const enabled = veRaw.enabled === undefined ? false : veRaw.enabled;
    const mode = veRaw.mode === undefined ? 'padded' : veRaw.mode;
    const backgroundColor = veRaw.backgroundColor === undefined ? '#0D0D0D' : veRaw.backgroundColor;
    if (typeof enabled !== 'boolean') issues.push('video.verticalExport.enabled must be a boolean');
    if (!VALID_VERTICAL_MODES.has(mode)) {
      issues.push('video.verticalExport.mode must be "padded", "native", or "crop"');
    }
    if (typeof backgroundColor !== 'string' || !HEX_COLOR_RE.test(backgroundColor)) {
      issues.push('video.verticalExport.backgroundColor must be a #RRGGBB hex color');
    }
    verticalExport = { enabled: Boolean(enabled), mode, backgroundColor };
  }

  // Voice block (optional only if acts is empty, otherwise required)
  const actsRaw = raw.acts === undefined ? [] : raw.acts;
  if (!Array.isArray(actsRaw)) {
    issues.push('acts must be an array');
  }
  const actsList = Array.isArray(actsRaw) ? actsRaw : [];

  let voice = null;
  if (raw.voice !== undefined && raw.voice !== null) {
    voice = validateVoiceBlock(raw.voice, 'voice', issues, false);
  } else if (actsList.length > 0) {
    issues.push('voice configuration is required when acts are defined');
  }

  // Acts
  const seenActIds = new Set();
  const acts = [];
  for (let i = 0; i < actsList.length; i++) {
    const act = actsList[i];
    const p = `acts[${i}]`;
    if (!isPlainObject(act)) {
      issues.push(`${p} must be an object`);
      continue;
    }
    const actId = typeof act.id === 'string' ? act.id.trim() : '';
    if (!ACT_ID_RE.test(actId)) {
      issues.push(`${p}.id must match /^[a-zA-Z0-9_-]{1,48}$/`);
    } else if (seenActIds.has(actId)) {
      issues.push(`Duplicate act id "${actId}"`);
    }
    seenActIds.add(actId);

    const label = typeof act.label === 'string' && act.label.trim() ? act.label.trim() : actId;
    const startSec = assertNonNegativeNumber(act.startSec, `${p}.startSec`, issues) ?? 0;
    const maxDurationSec = assertPositiveNumber(act.maxDurationSec, `${p}.maxDurationSec`, issues) ?? 1;
    if (startSec + maxDurationSec > durationSec + 0.05) {
      issues.push(`${p} cue window (${startSec} + ${maxDurationSec}) exceeds video.durationSec (${durationSec})`);
    }
    const text = typeof act.text === 'string' ? act.text.trim() : '';
    if (!text) {
      issues.push(`${p}.text must be a non-empty string`);
    }
    let voiceOverride = null;
    if (act.voiceOverride !== undefined && act.voiceOverride !== null) {
      voiceOverride = validateVoiceBlock(act.voiceOverride, `${p}.voiceOverride`, issues, true);
    }

    acts.push({
      id: actId,
      label,
      startSec,
      maxDurationSec,
      text,
      voiceOverride,
    });
  }

  // Music (optional / null allowed)
  let music = null;
  if (raw.music !== undefined && raw.music !== null) {
    if (!isPlainObject(raw.music)) {
      issues.push('music must be an object or null');
    } else {
      const m = raw.music;
      const source = m.source === undefined ? 'dsp' : m.source;
      if (!VALID_SOURCES.has(source)) {
        issues.push('music.source must be "dsp" or "file"');
      }
      const file = typeof m.file === 'string' ? m.file.trim() : '';
      if (!file) {
        issues.push('music.file must be a non-empty relative path');
      } else {
        try {
          resolveProjectRelative('/project', file);
        } catch (err) {
          issues.push(`music.file: ${err.message}`);
        }
      }

      const gainDb = m.gainDb === undefined ? -14 : m.gainDb;
      if (typeof gainDb !== 'number' || !Number.isFinite(gainDb) || gainDb < -60 || gainDb > 12) {
        issues.push('music.gainDb must be between -60 and 12');
      }

      const fadeOutDurationSec = m.fadeOutDurationSec === undefined ? 1.5 : m.fadeOutDurationSec;
      const fadeOutStartSec = m.fadeOutStartSec === undefined ? Math.max(0, durationSec - fadeOutDurationSec) : m.fadeOutStartSec;
      assertNonNegativeNumber(fadeOutStartSec, 'music.fadeOutStartSec', issues);
      assertNonNegativeNumber(fadeOutDurationSec, 'music.fadeOutDurationSec', issues);

      let swellAtSec = m.swellAtSec;
      if (swellAtSec !== undefined && swellAtSec !== null) {
        assertNonNegativeNumber(swellAtSec, 'music.swellAtSec', issues);
      } else {
        swellAtSec = null;
      }

      const dRaw = isPlainObject(m.ducking) ? m.ducking : {};
      if (m.ducking !== undefined && !isPlainObject(m.ducking)) {
        issues.push('music.ducking must be an object');
      }
      const threshold = dRaw.threshold === undefined ? 0.03 : dRaw.threshold;
      const ratio = dRaw.ratio === undefined ? 8 : dRaw.ratio;
      const attackMs = dRaw.attackMs === undefined ? 20 : dRaw.attackMs;
      const releaseMs = dRaw.releaseMs === undefined ? 500 : dRaw.releaseMs;
      if (typeof threshold !== 'number' || threshold <= 0 || threshold > 1) {
        issues.push('music.ducking.threshold must be in (0, 1]');
      }
      if (typeof ratio !== 'number' || ratio < 1 || ratio > 20) {
        issues.push('music.ducking.ratio must be between 1 and 20');
      }
      if (typeof attackMs !== 'number' || attackMs < 0.01 || attackMs > 2000) {
        issues.push('music.ducking.attackMs must be between 0.01 and 2000');
      }
      if (typeof releaseMs !== 'number' || releaseMs < 0.01 || releaseMs > 9000) {
        issues.push('music.ducking.releaseMs must be between 0.01 and 9000');
      }

      music = {
        source,
        file,
        gainDb,
        fadeOutStartSec,
        fadeOutDurationSec,
        swellAtSec,
        preset: typeof m.preset === 'string' ? m.preset.trim() : null,
        ducking: { threshold, ratio, attackMs, releaseMs },
      };
    }
  }

  // SFX (0..N allowed)
  const sfxRaw = raw.sfx === undefined ? [] : raw.sfx;
  if (!Array.isArray(sfxRaw)) {
    issues.push('sfx must be an array');
  }
  const sfx = [];
  if (Array.isArray(sfxRaw)) {
    const seenSfxIds = new Set();
    for (let i = 0; i < sfxRaw.length; i++) {
      const item = sfxRaw[i];
      const p = `sfx[${i}]`;
      if (!isPlainObject(item)) {
        issues.push(`${p} must be an object`);
        continue;
      }
      const sfxId = typeof item.id === 'string' ? item.id.trim() : '';
      if (!ACT_ID_RE.test(sfxId)) {
        issues.push(`${p}.id must match /^[a-zA-Z0-9_-]{1,48}$/`);
      } else if (seenSfxIds.has(sfxId)) {
        issues.push(`Duplicate sfx id "${sfxId}"`);
      }
      seenSfxIds.add(sfxId);

      const source = item.source === undefined ? 'dsp' : item.source;
      if (!VALID_SOURCES.has(source)) {
        issues.push(`${p}.source must be "dsp" or "file"`);
      }
      const file = typeof item.file === 'string' ? item.file.trim() : '';
      if (!file) {
        issues.push(`${p}.file must be a non-empty relative path`);
      } else {
        try {
          resolveProjectRelative('/project', file);
        } catch (err) {
          issues.push(`${p}.file: ${err.message}`);
        }
      }

      const atSec = assertNonNegativeNumber(item.atSec, `${p}.atSec`, issues) ?? 0;
      if (atSec > durationSec) {
        issues.push(`${p}.atSec (${atSec}) exceeds video.durationSec (${durationSec})`);
      }

      let volume = item.volume;
      let volumeDb = item.volumeDb;
      if (volume !== undefined && volume !== null) {
        if (typeof volume !== 'number' || !Number.isFinite(volume) || volume <= 0 || volume > 4) {
          issues.push(`${p}.volume must be a positive number <= 4`);
        }
      }
      if (volumeDb !== undefined && volumeDb !== null) {
        if (typeof volumeDb !== 'number' || !Number.isFinite(volumeDb) || volumeDb < -60 || volumeDb > 12) {
          issues.push(`${p}.volumeDb must be between -60 and 12`);
        }
      }
      if (volume === undefined && volumeDb === undefined) {
        volume = 1.0;
      }

      sfx.push({
        id: sfxId,
        source,
        file,
        atSec,
        ...(volume !== undefined && volume !== null ? { volume } : {}),
        ...(volumeDb !== undefined && volumeDb !== null ? { volumeDb } : {}),
        ...(typeof item.dspPreset === 'string' && item.dspPreset.trim() ? { dspPreset: item.dspPreset.trim() } : {}),
      });
    }
  }

  if (issues.length > 0) {
    throw new ProjectValidationError(
      `Invalid project.json${id ? ` (${id})` : ''}:\n- ${issues.join('\n- ')}`,
      issues
    );
  }

  return {
    id,
    name,
    video: {
      width,
      height,
      fps,
      durationSec,
      crf,
      preset,
      verticalExport,
    },
    voice,
    acts,
    music,
    sfx,
  };
}

/**
 * Merge project.voice with an optional act.voiceOverride.
 */
export function resolveEffectiveActVoice(project, act) {
  const base = project.voice || {};
  const ov = act?.voiceOverride || {};
  const provider = ov.provider ?? base.provider;
  const modelId =
    ov.modelId ??
    (ov.provider && ov.provider !== base.provider
      ? ov.provider === 'gemini'
        ? 'gemini-2.5-flash-preview-tts'
        : 'eleven_multilingual_v2'
      : base.modelId);

  return {
    provider,
    voiceId: ov.voiceId ?? base.voiceId,
    modelId,
    seed: ov.seed !== undefined ? ov.seed : base.seed,
    settings: {
      ...(base.settings || {}),
      ...(ov.settings || {}),
    },
  };
}

export async function loadProjectConfig(projectId) {
  const paths = getProjectPaths(projectId);
  let rawText;
  try {
    rawText = await fs.readFile(paths.configPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      const err = new Error(`Project "${projectId}" not found (${paths.configPath}).`);
      err.statusCode = 404;
      throw err;
    }
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new ProjectValidationError(`Malformed JSON in ${paths.configPath}: ${error.message}`, [error.message]);
  }

  return {
    config: validateProjectConfig(parsed, projectId),
    paths,
  };
}
