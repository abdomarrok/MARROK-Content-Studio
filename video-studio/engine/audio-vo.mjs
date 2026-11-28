import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { ensureProjectDspStems } from './audio-dsp.mjs';
import { mixProjectAudio } from './audio-mix.mjs';
import { loadEnv, parseCliArgs, resolveFfmpegBinaries, resolveProjectRelative } from './paths.mjs';
import { loadProjectConfig, resolveEffectiveActVoice } from './schema.mjs';
import { CHANNELS, inspectWavBuffer, SAMPLE_RATE } from './wav.mjs';

const execFileAsync = promisify(execFile);

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const TARGET_PEAK_DB = -3.0;
const PREFERRED_ELEVENLABS_VOICES = ['Matilda', 'Alice', 'Rachel'];
const FALLBACK_PREMADE_VOICES = [
  { voice_id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda' },
  { voice_id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice' },
  { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) sorted[key] = canonicalize(value[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Determine previous/next stitching texts only for adjacent acts using the same provider+voiceId+modelId.
 */
export function getActStitchContext(project, index) {
  const acts = project.acts || [];
  const current = resolveEffectiveActVoice(project, acts[index]);
  const sameVoice = (otherAct) => {
    if (!otherAct) return false;
    const other = resolveEffectiveActVoice(project, otherAct);
    return (
      other.provider === current.provider &&
      other.voiceId === current.voiceId &&
      other.modelId === current.modelId
    );
  };

  return {
    previousText: index > 0 && sameVoice(acts[index - 1]) ? acts[index - 1].text : null,
    nextText: index < acts.length - 1 && sameVoice(acts[index + 1]) ? acts[index + 1].text : null,
  };
}

/**
 * Deterministic SHA-256 content hash for a single act's TTS inputs and mastering target.
 */
export function computeActCacheKey(project, act, index) {
  const voice = resolveEffectiveActVoice(project, act);
  const { previousText, nextText } = getActStitchContext(project, index);
  const payload = canonicalize({
    version: 1,
    actId: act.id,
    text: act.text,
    maxDurationSec: act.maxDurationSec,
    provider: voice.provider,
    voiceId: voice.voiceId,
    modelId: voice.modelId,
    seed: voice.seed ?? null,
    settings: voice.settings || {},
    previousText,
    nextText,
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    targetPeakDb: TARGET_PEAK_DB,
  });

  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function readCacheManifest(manifestPath) {
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { acts: {} };
  } catch {
    return { acts: {} };
  }
}

async function writeCacheManifest(manifestPath, manifest) {
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

async function fetchWithRetry(fetchImpl, url, options = {}, retries = 2) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, options);
      if (res.ok) return res;
      const body = await res.text().catch(() => '');
      const snippet = body.slice(0, 400).trim();
      const err = new Error(`HTTP ${res.status} ${res.statusText}${snippet ? `: ${snippet}` : ''}`);
      err.status = res.status;
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        lastError = err;
        continue;
      }
      throw err;
    } catch (error) {
      if (error?.status && error.status < 500 && error.status !== 429) throw error;
      lastError = error;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function resolveElevenLabsVoiceId(apiKey, requestedVoiceId, fetchImpl) {
  if (requestedVoiceId && requestedVoiceId.toLowerCase() !== 'auto') {
    return requestedVoiceId;
  }
  try {
    const res = await fetchWithRetry(fetchImpl, `${ELEVENLABS_BASE_URL}/voices`, {
      method: 'GET',
      headers: { 'xi-api-key': apiKey, Accept: 'application/json' },
    });
    const data = await res.json();
    const voices = Array.isArray(data?.voices) ? data.voices : [];
    for (const pref of PREFERRED_ELEVENLABS_VOICES) {
      const target = pref.toLowerCase();
      const found = voices.find((v) => {
        const n = String(v?.name || '').trim().toLowerCase();
        return n === target || n.startsWith(`${target} `) || new RegExp(`\\b${target}\\b`, 'i').test(n);
      });
      if (found?.voice_id) return found.voice_id;
    }
    const female = voices.find((v) => String(v?.labels?.gender || '').toLowerCase() === 'female');
    if (female?.voice_id) return female.voice_id;
    if (voices[0]?.voice_id) return voices[0].voice_id;
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) {
      return FALLBACK_PREMADE_VOICES[0].voice_id;
    }
    throw error;
  }
  return FALLBACK_PREMADE_VOICES[0].voice_id;
}

async function synthesizeViaElevenLabs({ apiKey, voice, text, previousText, nextText, fetchImpl }) {
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is missing in .env or environment variables.');
  }
  const voiceId = await resolveElevenLabsVoiceId(apiKey, voice.voiceId, fetchImpl);
  const body = {
    text,
    model_id: voice.modelId || 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.55,
      similarity_boost: 0.78,
      style: 0.12,
      use_speaker_boost: true,
      ...(voice.settings || {}),
    },
  };
  if (Number.isInteger(voice.seed)) body.seed = voice.seed;
  if (previousText) body.previous_text = previousText;
  if (nextText) body.next_text = nextText;

  const res = await fetchWithRetry(
    fetchImpl,
    `${ELEVENLABS_BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(body),
    }
  );

  const rawBuffer = Buffer.from(await res.arrayBuffer());
  if (rawBuffer.length === 0) {
    throw new Error('ElevenLabs returned an empty audio buffer.');
  }
  const contentType = res.headers?.get?.('content-type') || 'audio/mpeg';
  return { rawBuffer, contentType };
}

function parseSampleRateFromMime(mimeType) {
  const match = /rate=(\d+)/i.exec(String(mimeType || ''));
  return match ? Number(match[1]) : 24000;
}

async function synthesizeViaGeminiRest({ apiKey, voice, text, fetchImpl }) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing in .env or environment variables.');
  }
  const modelId = voice.modelId || 'gemini-2.5-flash-preview-tts';
  const url = `${GEMINI_BASE_URL}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetchWithRetry(fetchImpl, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice.voiceId || 'Kore',
            },
          },
        },
      },
    }),
  });

  const json = await res.json();
  const audioPart = json?.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);
  if (!audioPart?.inlineData?.data) {
    throw new Error(`Gemini TTS (${modelId}) returned no inline audio data.`);
  }
  return {
    rawBuffer: Buffer.from(audioPart.inlineData.data, 'base64'),
    contentType: audioPart.inlineData.mimeType || 'audio/L16;codec=pcm;rate=24000',
  };
}

function extensionForContentType(contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('l16') || ct.includes('pcm')) return '.pcm';
  if (ct.includes('wav')) return '.wav';
  if (ct.includes('ogg')) return '.ogg';
  if (ct.includes('flac')) return '.flac';
  return '.mp3';
}

/**
 * Convert raw TTS audio into 48 kHz 24-bit stereo PCM WAV, trim leading silence (-50dB),
 * tighten internal pauses only if exceeding maxDurationSec, and peak-normalize to -3.0 dBFS.
 */
export async function masterVoiceoverFile(rawBuffer, contentType, outPath, maxDurationSec) {
  const { ffmpeg, ffprobe } = await resolveFfmpegBinaries();
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-vo-'));
  const ext = extensionForContentType(contentType);
  const rawPath = path.join(tmpDir, `raw${ext}`);
  const trimmedPath = path.join(tmpDir, 'trimmed.wav');
  const tightenedPath = path.join(tmpDir, 'tightened.wav');
  const pacedPath = path.join(tmpDir, 'paced.wav');

  try {
    await fs.writeFile(rawPath, rawBuffer);
    const isRawPcm =
      ext === '.pcm' &&
      !(rawBuffer.length >= 12 && rawBuffer.toString('ascii', 0, 4) === 'RIFF');
    const inputArgs = isRawPcm
      ? ['-f', 's16le', '-ar', String(parseSampleRateFromMime(contentType)), '-ac', '1', '-i', rawPath]
      : ['-i', rawPath];

    await execFileAsync(ffmpeg, [
      '-y',
      '-v', 'error',
      ...inputArgs,
      '-af',
      'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-54dB,areverse',
      '-ar', String(SAMPLE_RATE),
      '-ac', String(CHANNELS),
      '-c:a', 'pcm_f32le',
      trimmedPath,
    ]);

    const probeDuration = async (p) => {
      const { stdout } = await execFileAsync(ffprobe, [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        p,
      ]);
      return Number(stdout.trim());
    };

    let activePath = trimmedPath;
    let currentDur = await probeDuration(activePath);

    if (Number.isFinite(maxDurationSec) && currentDur > maxDurationSec) {
      await execFileAsync(ffmpeg, [
        '-y',
        '-v', 'error',
        '-i', activePath,
        '-af',
        'silenceremove=stop_periods=-1:stop_duration=0.08:stop_silence=0.09:stop_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-54dB,areverse',
        '-ar', String(SAMPLE_RATE),
        '-ac', String(CHANNELS),
        '-c:a', 'pcm_f32le',
        tightenedPath,
      ]);
      activePath = tightenedPath;
      currentDur = await probeDuration(activePath);

      if (currentDur > maxDurationSec) {
        const targetMax = Math.max(0.5, maxDurationSec - 0.12);
        const ratio = Math.min(1.25, Math.max(1.01, currentDur / targetMax));
        await execFileAsync(ffmpeg, [
          '-y',
          '-v', 'error',
          '-i', activePath,
          '-af', `atempo=${ratio.toFixed(4)}`,
          '-ar', String(SAMPLE_RATE),
          '-ac', String(CHANNELS),
          '-c:a', 'pcm_f32le',
          pacedPath,
        ]);
        activePath = pacedPath;
      }
    }

    const { stderr: detectStderr } = await execFileAsync(ffmpeg, [
      '-y',
      '-v', 'info',
      '-i', activePath,
      '-af', 'volumedetect',
      '-f', 'null',
      '-',
    ]);
    const match = /max_volume:\s*([-\d.]+)\s*dB/i.exec(detectStderr);
    if (!match) {
      throw new Error('FFmpeg volumedetect failed to measure peak amplitude.');
    }
    const maxVol = Number(match[1]);
    if (!Number.isFinite(maxVol) || maxVol <= -80) {
      throw new Error(`Generated voiceover audio is silent (max_volume=${match[1]} dB).`);
    }

    const gainDb = TARGET_PEAK_DB - maxVol;
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await execFileAsync(ffmpeg, [
      '-y',
      '-v', 'error',
      '-i', activePath,
      '-af', `volume=${gainDb.toFixed(3)}dB`,
      '-ar', String(SAMPLE_RATE),
      '-ac', String(CHANNELS),
      '-c:a', 'pcm_s24le',
      '-map_metadata', '-1',
      outPath,
    ]);

    const durationSec = await probeDuration(outPath);
    const wavInfo = inspectWavBuffer(await fs.readFile(outPath));
    return {
      durationSec: Number.isFinite(durationSec) ? durationSec : wavInfo.durationSec,
      wavInfo,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function isValidCachedStem(filePath) {
  try {
    const info = inspectWavBuffer(await fs.readFile(filePath));
    return info.isPcm && info.sampleRate === 48000 && info.bitsPerSample === 24 && info.channels === 2;
  } catch {
    return false;
  }
}

/**
 * Generate or load cached voiceover stems for a project.
 */
export async function generateProjectVoiceovers(project, projectPaths, options = {}) {
  const force = Boolean(options.force);
  const actFilter = options.actId ? String(options.actId).trim() : null;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const log = options.log || console.log;
  const masterFn = options.masterFn || masterVoiceoverFile;
  const env = options.env || (await loadEnv());

  if (actFilter && !(project.acts || []).some((a) => a.id === actFilter)) {
    throw new Error(`Unknown act "${actFilter}" in project "${project.id}".`);
  }

  await fs.mkdir(projectPaths.audioDir, { recursive: true });
  const manifest = await readCacheManifest(projectPaths.cacheManifestPath);
  manifest.acts = manifest.acts || {};

  const results = [];
  for (let i = 0; i < (project.acts || []).length; i++) {
    const act = project.acts[i];
    if (actFilter && act.id !== actFilter) continue;

    const outRel = `audio/${act.id}.wav`;
    const outPath = resolveProjectRelative(projectPaths.root, outRel);
    const hash = computeActCacheKey(project, act, i);
    const cachedEntry = manifest.acts[act.id];

    if (!force && cachedEntry?.hash === hash && (await isValidCachedStem(outPath))) {
      const wavInfo = inspectWavBuffer(await fs.readFile(outPath));
      log(`[cache hit] ${outRel}: ${wavInfo.durationSec.toFixed(3)}s (<= ${act.maxDurationSec.toFixed(2)}s)`);
      results.push({
        actId: act.id,
        file: outRel,
        cached: true,
        hash,
        durationSec: wavInfo.durationSec,
        wavInfo,
        exceedsMaxDuration: wavInfo.durationSec > act.maxDurationSec + 0.02,
      });
      continue;
    }

    const voice = resolveEffectiveActVoice(project, act);
    const { previousText, nextText } = getActStitchContext(project, i);
    log(`[tts] Generating ${outRel} via ${voice.provider} (${voice.voiceId})...`);

    const synth =
      voice.provider === 'gemini'
        ? await synthesizeViaGeminiRest({
            apiKey: env.GEMINI_API_KEY,
            voice,
            text: act.text,
            fetchImpl,
          })
        : await synthesizeViaElevenLabs({
            apiKey: env.ELEVENLABS_API_KEY,
            voice,
            text: act.text,
            previousText,
            nextText,
            fetchImpl,
          });

    const mastered = await masterFn(synth.rawBuffer, synth.contentType, outPath, act.maxDurationSec);
    manifest.acts[act.id] = {
      hash,
      provider: voice.provider,
      voiceId: voice.voiceId,
      modelId: voice.modelId,
      durationSec: mastered.durationSec,
      updatedAt: new Date().toISOString(),
    };
    await writeCacheManifest(projectPaths.cacheManifestPath, manifest);

    const exceeds = mastered.durationSec > act.maxDurationSec + 0.02;
    log(
      `[generated] ${outRel}: ${mastered.durationSec.toFixed(3)}s | peak=${mastered.wavInfo.peakDb} dBFS | ${exceeds ? `EXCEEDS ${act.maxDurationSec}s` : `OK (<= ${act.maxDurationSec}s)`}`
    );
    results.push({
      actId: act.id,
      file: outRel,
      cached: false,
      hash,
      durationSec: mastered.durationSec,
      wavInfo: mastered.wavInfo,
      exceedsMaxDuration: exceeds,
    });
  }

  return results;
}

/**
 * Populate .cache-manifest.json for existing valid stems during project migration
 * so existing paid voiceovers are preserved without re-calling TTS APIs.
 */
export async function seedCacheManifestFromExisting(project, projectPaths) {
  const manifest = await readCacheManifest(projectPaths.cacheManifestPath);
  manifest.acts = manifest.acts || {};

  for (let i = 0; i < (project.acts || []).length; i++) {
    const act = project.acts[i];
    const outPath = resolveProjectRelative(projectPaths.root, `audio/${act.id}.wav`);
    if (await isValidCachedStem(outPath)) {
      const wavInfo = inspectWavBuffer(await fs.readFile(outPath));
      const voice = resolveEffectiveActVoice(project, act);
      manifest.acts[act.id] = {
        hash: computeActCacheKey(project, act, i),
        provider: voice.provider,
        voiceId: voice.voiceId,
        modelId: voice.modelId,
        durationSec: wavInfo.durationSec,
        seededFromMigration: true,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  await writeCacheManifest(projectPaths.cacheManifestPath, manifest);
  return manifest;
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  (async () => {
    const { flags } = parseCliArgs(process.argv.slice(2));
    const projectId = String(flags.project || '').trim();
    if (!projectId) {
      throw new Error('Usage: npm run audio -- --project <id> [--act <actId>] [--force]');
    }
    const { config, paths } = await loadProjectConfig(projectId);
    const voResults = await generateProjectVoiceovers(config, paths, {
      actId: flags.act ? String(flags.act) : null,
      force: Boolean(flags.force),
    });
    await ensureProjectDspStems(config, paths, { force: Boolean(flags.force) });
    if (!flags['no-mix']) {
      const mix = await mixProjectAudio(config, paths);
      console.log(
        `[audio] Master mix ready: audio/master.wav (${mix.wavInfo.durationSec.toFixed(3)}s, VO=${mix.voCount}, SFX=${mix.sfxPlacementCount})`
      );
    }
    const overruns = voResults.filter((r) => r.exceedsMaxDuration);
    if (overruns.length > 0) {
      console.warn(
        `WARNING: ${overruns.map((o) => `${o.actId} (${o.durationSec.toFixed(3)}s)`).join(', ')} exceeded maxDurationSec.`
      );
      process.exitCode = 2;
    }
  })().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  });
}
