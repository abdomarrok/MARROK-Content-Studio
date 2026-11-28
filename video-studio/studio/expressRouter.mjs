import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import express from 'express';
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
  MIME_TYPES,
  PROJECTS_DIR,
  resolveFfmpegBinaries,
  resolveProjectRelative,
  toTitleCaseSlug,
} from '../engine/paths.mjs';
import { inspectProjectQa } from '../engine/qa-inspect.mjs';
import { renderProjectVideo } from '../engine/render-video.mjs';
import { loadProjectConfig, ProjectValidationError, validateProjectConfig } from '../engine/schema.mjs';
import { BIT_DEPTH, CHANNELS, inspectWavBuffer, SAMPLE_RATE } from '../engine/wav.mjs';
import { createProjectFromTemplate } from '../scripts/new-project.mjs';

const execFileAsync = promisify(execFile);

export const MAX_COMPLETED_JOBS = 50;
export const PREVIEW_TOKEN_TTL_SECONDS = 3600; // 1 hour
export const MAX_REEL_SCENE_HTML_BYTES = 512 * 1024; // 512 KB cap for promoted Reel scene.html

function cleanVoLine(str) {
  return String(str || '')
    .replace(/\|/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveReelActNarrationText(scene, languageMode, index) {
  if (!scene || typeof scene !== 'object') {
    return `Act ${index + 1}`;
  }
  const enTitle = cleanVoLine(scene.enTitle);
  const enBody = cleanVoLine(scene.enBody);
  const arTitle = cleanVoLine(scene.arTitle);
  const arBody = cleanVoLine(scene.arBody);
  const primaryText = cleanVoLine(scene.text);
  const ctaText = cleanVoLine(scene.ctaText);
  const label = cleanVoLine(scene.label);

  const joinParts = (title, body) => {
    if (title && body) {
      return /[.?!؟]$/.test(title) ? `${title} ${body}` : `${title}. ${body}`;
    }
    return title || body || '';
  };

  let candidate = '';
  if (languageMode === 'ar') {
    candidate = joinParts(arTitle, arBody) || primaryText || joinParts(enTitle, enBody) || ctaText || label;
  } else if (languageMode === 'en') {
    candidate = joinParts(enTitle, enBody) || primaryText || joinParts(arTitle, arBody) || ctaText || label;
  } else {
    candidate = joinParts(enTitle, enBody) || joinParts(arTitle, arBody) || primaryText || ctaText || label;
  }
  return candidate || `Act ${index + 1}`;
}

/**
 * Promote a Create -> Reel (MotionReelData + compiled deterministic scene.html) into a
 * native 9:16 (1080x1920 @ 60fps, verticalExport.enabled=false) Film Studio project.
 */
export async function createProjectFromReel({ id, name, reelConfig, sceneHtml, overwrite = false }) {
  const projectId = assertValidProjectId(String(id || '').trim());
  const paths = getProjectPaths(projectId);

  if (!overwrite) {
    try {
      await fs.access(paths.root);
      const err = new Error(`Project "${projectId}" already exists at ${paths.root}`);
      err.statusCode = 409;
      throw err;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  if (!reelConfig || typeof reelConfig !== 'object' || Array.isArray(reelConfig)) {
    throw new ProjectValidationError('reelConfig must be a non-null object', ['reelConfig must be an object']);
  }

  if (typeof sceneHtml !== 'string' || !sceneHtml.trim()) {
    throw new ProjectValidationError('sceneHtml must be a non-empty HTML string', ['sceneHtml is required']);
  }

  const htmlBytes = Buffer.byteLength(sceneHtml, 'utf8');
  if (htmlBytes > MAX_REEL_SCENE_HTML_BYTES) {
    const err = new Error(`sceneHtml exceeds maximum allowed size (${MAX_REEL_SCENE_HTML_BYTES} bytes).`);
    err.statusCode = 413;
    throw err;
  }

  if (!sceneHtml.includes('window.renderAt')) {
    throw new ProjectValidationError(
      'sceneHtml must expose window.renderAt(t, dt) for deterministic Film Studio capture',
      ['sceneHtml missing window.renderAt']
    );
  }

  const rawScenes =
    Array.isArray(reelConfig.scenes) && reelConfig.scenes.length > 0
      ? reelConfig.scenes
      : [
          {
            id: 'scene-1',
            label: 'Act 1 — Opening Hook',
            from: 0,
            to: Number(reelConfig.duration) || 15,
            text: name || toTitleCaseSlug(projectId),
          },
        ];

  const maxSceneTo = rawScenes.reduce((acc, s) => Math.max(acc, Number(s?.to) || 0), 0);
  const rawDur = Number(reelConfig.duration);
  const durationSec = Number(
    Math.max(
      2,
      Math.min(
        120,
        Number.isFinite(rawDur) && rawDur >= maxSceneTo && rawDur > 0
          ? rawDur
          : Math.max(rawDur || 0, maxSceneTo, 4)
      )
    ).toFixed(2)
  );

  const languageMode =
    reelConfig.languageMode === 'ar' || reelConfig.languageMode === 'en'
      ? reelConfig.languageMode
      : 'bilingual';

  const acts = [];
  const sfx = [];
  const fallbackSlot = durationSec / rawScenes.length;

  for (let i = 0; i < rawScenes.length; i++) {
    const scene = rawScenes[i] || {};
    const actId = `act${i + 1}`;
    const label =
      typeof scene.label === 'string' && scene.label.trim()
        ? scene.label.trim()
        : `Act ${i + 1}`;

    const rawFrom = Number(scene.from);
    const startSec = Number(
      Math.max(
        0,
        Math.min(
          durationSec - 0.25,
          Number.isFinite(rawFrom) && rawFrom >= 0 ? rawFrom : i * fallbackSlot
        )
      ).toFixed(2)
    );

    const nextFrom =
      i + 1 < rawScenes.length && Number.isFinite(Number(rawScenes[i + 1]?.from))
        ? Number(rawScenes[i + 1].from)
        : durationSec;
    const rawTo = Number(scene.to);
    const targetEnd = Math.min(
      durationSec,
      Number.isFinite(rawTo) && rawTo > startSec
        ? rawTo
        : Math.max(startSec + 0.5, nextFrom > startSec ? nextFrom : startSec + fallbackSlot)
    );

    const windowSec = Math.max(0.25, targetEnd - startSec);
    const maxDurationSec = Number(
      Math.max(
        0.25,
        Math.min(durationSec - startSec, windowSec > 1.2 ? windowSec - 0.15 : windowSec)
      ).toFixed(2)
    );

    const text = deriveReelActNarrationText(scene, languageMode, i);
    const voiceOverride =
      scene.voiceOverride && typeof scene.voiceOverride === 'object' && !Array.isArray(scene.voiceOverride)
        ? scene.voiceOverride
        : null;

    acts.push({
      id: actId,
      label,
      startSec,
      maxDurationSec,
      text,
      voiceOverride,
    });

    if (i > 0 && i <= 6 && startSec > 0 && startSec <= durationSec) {
      const isLast = i === rawScenes.length - 1;
      sfx.push({
        id: isLast ? `shimmer-${i}` : `whoosh-${i}`,
        source: 'dsp',
        dspPreset: isLast ? 'shimmer' : 'whoosh',
        file: isLast ? 'audio/shimmer.wav' : 'audio/whoosh.wav',
        atSec: Number(Math.max(0, Math.min(durationSec, startSec)).toFixed(2)),
        volume: isLast ? 0.18 : 0.15,
      });
    }
  }

  const rawBg = typeof reelConfig?.brand?.bgColor === 'string' ? reelConfig.brand.bgColor.trim() : '';
  const backgroundColor = /^#[0-9a-fA-F]{6}$/.test(rawBg) ? rawBg : '#080D11';

  const fadeOutDurationSec = Number(Math.min(1.5, Math.max(0.4, durationSec * 0.1)).toFixed(2));
  const fadeOutStartSec = Number(Math.max(0, durationSec - fadeOutDurationSec).toFixed(2));
  const swellAtSec = Number((durationSec * 0.62).toFixed(2));

  const rawConfig = {
    id: projectId,
    name: (name && String(name).trim()) || toTitleCaseSlug(projectId),
    video: {
      width: 1080,
      height: 1920,
      fps: 60,
      durationSec,
      crf: 16,
      preset: 'slow',
      verticalExport: {
        enabled: false,
        mode: 'native',
        backgroundColor,
      },
    },
    voice: {
      provider: 'elevenlabs',
      voiceId: 'XrExE9yKIg1WjnnlVkGX',
      modelId: 'eleven_multilingual_v2',
      seed: 4242,
      settings: {
        stability: 0.55,
        similarity_boost: 0.78,
        style: 0.12,
        use_speaker_boost: true,
      },
    },
    acts,
    music: {
      source: 'dsp',
      file: 'audio/music.wav',
      gainDb: -14,
      fadeOutStartSec,
      fadeOutDurationSec,
      swellAtSec,
      ducking: {
        threshold: 0.03,
        ratio: 8,
        attackMs: 20,
        releaseMs: 500,
      },
    },
    sfx,
  };

  // Validate generated project.json against schema.mjs BEFORE writing to disk
  const validated = validateProjectConfig(rawConfig, projectId);

  await fs.mkdir(paths.assetsDir, { recursive: true });
  await fs.mkdir(paths.audioDir, { recursive: true });
  await fs.mkdir(paths.outputDir, { recursive: true });
  await fs.writeFile(paths.configPath, JSON.stringify(validated, null, 2) + '\n', 'utf8');
  await fs.writeFile(paths.scenePath, sceneHtml, 'utf8');

  return { config: validated, paths };
}

const jobs = new Map();

export function resetVideoStudioJobsForTest() {
  for (const job of jobs.values()) {
    if (job.status === 'running' && job.controller) {
      job.controller.abort();
    }
  }
  jobs.clear();
}

export function getVideoStudioJobsSize() {
  return jobs.size;
}

function pruneCompletedJobs() {
  const completedIds = [];
  for (const [id, job] of jobs.entries()) {
    if (job.status !== 'running') {
      completedIds.push(id);
    }
  }
  while (completedIds.length > MAX_COMPLETED_JOBS) {
    const oldestId = completedIds.shift();
    if (oldestId) {
      jobs.delete(oldestId);
    }
  }
}

function findActiveJob() {
  for (const job of jobs.values()) {
    if (job.status === 'running') {
      return job;
    }
  }
  return null;
}

/**
 * Generates a short-lived HMAC-signed path-scoped preview token (`vprev.<exp>.<sig>`)
 * so `<iframe src="/video-projects/s/:token/:id/scene.html">` works even when third-party
 * cookies are blocked AND relative `./assets/*` URLs automatically inherit `:token`.
 */
export function createVideoPreviewToken(
  sessionSecret = String(process.env.SESSION_SECRET || '').trim(),
  ttlSeconds = PREVIEW_TOKEN_TTL_SECONDS,
  nowMs = Date.now()
) {
  if (!sessionSecret || sessionSecret.length < 16) {
    return '';
  }
  const exp = Math.floor(nowMs / 1000) + Math.max(30, Math.floor(ttlSeconds));
  const payload = `vprev.${exp}`;
  const sig = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Verifies a path-scoped preview token (`vprev.<exp>.<sig>`) using constant-time HMAC comparison.
 */
export function verifyVideoPreviewToken(token, sessionSecret, nowMs = Date.now()) {
  if (!token || typeof token !== 'string' || !sessionSecret || sessionSecret.length < 16) {
    return false;
  }
  const parts = token.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'vprev') {
    return false;
  }
  const exp = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(exp) || nowMs >= exp * 1000) {
    return false;
  }
  const actualSig = Buffer.from(parts[2], 'base64url');
  const expectedSig = crypto
    .createHmac('sha256', sessionSecret)
    .update(`vprev.${parts[1]}`)
    .digest();
  return (
    actualSig.length === expectedSig.length &&
    crypto.timingSafeEqual(actualSig, expectedSig)
  );
}

async function authorizeVideoProjectPreview(req, pathToken = '', authBridge = null) {
  if (
    !authBridge ||
    typeof authBridge.getAuthConfig !== 'function' ||
    typeof authBridge.verifySessionRequest !== 'function'
  ) {
    return {
      ok: false,
      status: 503,
      error: 'Server authentication verifier is not configured (fail closed).',
    };
  }

  const authCfg = authBridge.getAuthConfig();
  if (!authCfg?.configured) {
    return {
      ok: false,
      status: 503,
      error: 'Server authentication is not configured (fail closed).',
    };
  }

  const queryToken = typeof req.query?.token === 'string' ? req.query.token : '';
  const pathOrQueryTokens = [pathToken, queryToken].filter(Boolean);

  for (const candidate of pathOrQueryTokens) {
    if (verifyVideoPreviewToken(candidate, authCfg.sessionSecret)) {
      return { ok: true, status: 200 };
    }
  }

  const sessionValid = await authBridge.verifySessionRequest(req, authCfg, pathOrQueryTokens);
  if (sessionValid) {
    return { ok: true, status: 200 };
  }

  return {
    ok: false,
    status: 401,
    error: 'Authentication required to access video project preview.',
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

async function sendFileWithRange(req, res, filePath, isDownload = false) {
  const stat = await fs.stat(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const baseHeaders = {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'bytes',
    ...(isDownload ? { 'Content-Disposition': `attachment; filename="${path.basename(filePath)}"` } : {}),
  };

  const pipeStream = (stream) =>
    new Promise((resolve, reject) => {
      stream.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).end('Stream read error');
        } else {
          res.destroy(err);
        }
        reject(err);
      });
      res.on('close', () => {
        stream.destroy();
        resolve();
      });
      stream.on('end', resolve);
      stream.pipe(res);
    });

  const rangeHeader = req.headers.range;
  if (rangeHeader && stat.size > 0) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(stat.size - 1, Number(match[2])) : stat.size - 1;
      if (start <= end && start < stat.size) {
        const chunkLen = end - start + 1;
        res.writeHead(206, {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': chunkLen,
        });
        await pipeStream(createReadStream(filePath, { start, end }));
        return;
      }
    }
  }

  res.writeHead(200, {
    ...baseHeaders,
    'Content-Length': stat.size,
  });
  if (stat.size === 0) {
    res.end();
    return;
  }
  await pipeStream(createReadStream(filePath));
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
      error: error instanceof Error ? error.message : 'Invalid config',
    };
  }
}

async function getFullProjectDetails(projectId, getAuthConfig) {
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

  const assetFiles = [];
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
    // no qa report yet
  }

  const authCfg = typeof getAuthConfig === 'function' ? getAuthConfig() : null;
  return {
    config,
    previewToken: authCfg?.configured ? createVideoPreviewToken(authCfg.sessionSecret) : null,
    stems: {
      acts: actStems,
      music: musicStem,
      sfx: sfxStems,
      master: masterStem,
    },
    assets: assetFiles,
    outputs: {
      silent: await fileExists(paths.silentMp4Path),
      silentFast: await fileExists(path.join(paths.outputDir, 'silent-fast.mp4')),
      final16x9: await fileExists(paths.final16x9Path),
      finalFast: await fileExists(path.join(paths.outputDir, 'final-fast.mp4')),
      final9x16: await fileExists(paths.final9x16Path),
      qaSheet: await fileExists(paths.qaSheetPath),
    },
    qaReport,
  };
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
  const id = crypto.randomUUID().slice(0, 12);
  const controller = new AbortController();
  const job = {
    id,
    projectId,
    type,
    status: 'running',
    createdAt: Date.now(),
    controller,
    events: [],
    listeners: new Set(),
  };
  jobs.set(id, job);
  pruneCompletedJobs();

  const log = (msg) => emitJobEvent(job, 'log', { message: String(msg) });
  const onProgress = (p) => emitJobEvent(job, 'progress', p);

  (async () => {
    try {
      const { config, paths } = await loadProjectConfig(projectId);
      let result = null;
      if (type === 'render') {
        result = await renderProjectVideo(config, paths, { onProgress, signal: job.controller.signal, log });
      } else if (type === 'render-fast') {
        result = await renderProjectVideo(config, paths, {
          fast: true,
          onProgress,
          signal: job.controller.signal,
          log,
        });
      } else if (type === 'vertical') {
        onProgress({ stage: 'vertical', pct: 15 });
        result = await exportVerticalVideo(config, paths, { onProgress, signal: job.controller.signal, log });
      } else if (type === 'qa') {
        onProgress({ stage: 'qa', pct: 35 });
        result = await inspectProjectQa(config, paths);
      } else if (type === 'build') {
        result = await runBuildPipeline(projectId, {
          vertical: opts.vertical !== undefined ? Boolean(opts.vertical) : undefined,
          fast: Boolean(opts.fast),
          force: Boolean(opts.force),
          onProgress,
          signal: job.controller.signal,
          log,
        });
      } else if (type === 'noop-test' && (process.env.VITEST || process.env.NODE_ENV === 'test')) {
        const waitMs = Math.min(2000, Math.max(10, Number(opts.holdMs) || 80));
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, waitMs);
          job.controller.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new Error('Job cancelled'));
            },
            { once: true }
          );
        });
        result = { noop: true };
      } else {
        throw new Error(`Unsupported job type: ${type}`);
      }

      job.status = 'done';
      emitJobEvent(job, 'done', { jobId: job.id, type, result });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Job failed';
      if (job.controller.signal.aborted || /cancelled/i.test(msg)) {
        job.status = 'cancelled';
        emitJobEvent(job, 'cancelled', { jobId: job.id, message: 'Job cancelled by user.' });
      } else {
        job.status = 'error';
        emitJobEvent(job, 'error', { jobId: job.id, message: msg });
      }
    } finally {
      for (const res of job.listeners) {
        res.end();
      }
      job.listeners.clear();
      pruneCompletedJobs();
    }
  })();

  return job;
}

function sendError(res, error) {
  const statusCode = error instanceof ProjectValidationError ? 400 : Number(error?.statusCode) || 500;
  res.status(statusCode).json({
    error: error?.message || 'Internal server error',
    ...(error?.issues ? { issues: error.issues } : {}),
  });
}

async function handleServeVideoProjectPreview(req, res, pathToken = '', authBridge = null) {
  try {
    const auth = await authorizeVideoProjectPreview(req, pathToken, authBridge);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const projectId = assertValidProjectId(req.params.id);
    const rawRel = decodeURIComponent(req.params[0] || 'scene.html').replace(/^\/+/, '');
    const rel = rawRel === '' ? 'scene.html' : rawRel;

    // Strictly restrict preview route to scene.html and assets/* (never project.json, audio/*, or output/*)
    const isAllowed =
      rel === 'scene.html' ||
      (rel.startsWith('assets/') && !path.basename(rel).startsWith('.'));
    if (!isAllowed) {
      return res.status(403).json({
        error: 'Access to project config, audio, and outputs is restricted to /api/video-studio.',
      });
    }

    const projectPaths = getProjectPaths(projectId);
    const absPath = resolveProjectRelative(projectPaths.root, rel);
    if (!(await fileExists(absPath))) {
      return res.status(404).send('Not found');
    }
    return await sendFileWithRange(req, res, absPath, false);
  } catch (error) {
    return res.status(400).send(error instanceof Error ? error.message : 'Bad request');
  }
}

/**
 * Mount Video Studio local API routes (protected by api/index.ts auth gate)
 * and authenticated preview routes (/video-projects/s/:token/:id/* & /video-projects/:id/*).
 * Callers must inject canonical session verification from src/lib/security/sessionAuth.ts.
 */
export function registerVideoStudioRoutes(app, authOptions = {}) {
  const authBridge = {
    getAuthConfig: typeof authOptions?.getAuthConfig === 'function' ? authOptions.getAuthConfig : null,
    verifySessionRequest:
      typeof authOptions?.verifySessionRequest === 'function' ? authOptions.verifySessionRequest : null,
  };

  fs.mkdir(PROJECTS_DIR, { recursive: true }).catch(() => {});

  // Restricted static SDK route (strictly serves motion-sdk.js only)
  app.get(['/engine/motion-sdk.js', '/video-engine/motion-sdk.js'], async (req, res) => {
    try {
      await sendFileWithRange(req, res, path.join(ENGINE_DIR, 'motion-sdk.js'), false);
    } catch {
      res.status(404).send('Not found');
    }
  });

  // Path-scoped token preview route so relative ./assets/* URLs inside scene.html inherit :token automatically
  app.get('/video-projects/s/:token/:id/*', async (req, res) => {
    return handleServeVideoProjectPreview(req, res, req.params.token, authBridge);
  });

  // Session cookie / Bearer token preview route
  app.get('/video-projects/:id/*', async (req, res) => {
    return handleServeVideoProjectPreview(req, res, '', authBridge);
  });

  // Authenticated API routes (automatically guarded by api/index.ts auth middleware)
  const api = express.Router();

  api.get('/capabilities', async (_req, res) => {
    let ffmpegAvailable = false;
    try {
      await resolveFfmpegBinaries();
      ffmpegAvailable = true;
    } catch {
      ffmpegAvailable = false;
    }
    const ids = await listProjectIds();
    const authCfg = authBridge.getAuthConfig ? authBridge.getAuthConfig() : null;
    res.json({
      serverAvailable: true,
      localRenderAvailable: true,
      ffmpegAvailable,
      previewToken: authCfg?.configured ? createVideoPreviewToken(authCfg.sessionSecret) : null,
      projectsCount: ids.length,
    });
  });

  api.get('/projects', async (_req, res) => {
    try {
      const ids = await listProjectIds();
      const projects = [];
      for (const id of ids) {
        projects.push(await buildProjectSummary(id));
      }
      res.json({ projects });
    } catch (error) {
      sendError(res, error);
    }
  });

  api.post('/projects', async (req, res) => {
    try {
      const body = req.body || {};
      const { config } = await createProjectFromTemplate({
        id: String(body.id || '').trim(),
        name: body.name ? String(body.name) : undefined,
        durationSec: body.durationSec !== undefined ? Number(body.durationSec) : undefined,
      });
      res.status(201).json({ ok: true, project: await getFullProjectDetails(config.id, authBridge.getAuthConfig) });
    } catch (error) {
      sendError(res, error);
    }
  });

  api.post('/projects/from-reel', async (req, res) => {
    try {
      const body = req.body || {};
      const { config } = await createProjectFromReel({
        id: String(body.id || '').trim(),
        name: body.name ? String(body.name) : undefined,
        reelConfig: body.reelConfig,
        sceneHtml: body.sceneHtml,
        overwrite: Boolean(body.overwrite),
      });
      res.status(201).json({ ok: true, project: await getFullProjectDetails(config.id, authBridge.getAuthConfig) });
    } catch (error) {
      sendError(res, error);
    }
  });

  api.get('/projects/:id', async (req, res) => {
    try {
      const projectId = assertValidProjectId(req.params.id);
      res.json(await getFullProjectDetails(projectId, authBridge.getAuthConfig));
    } catch (error) {
      sendError(res, error);
    }
  });

  api.put('/projects/:id', async (req, res) => {
    try {
      const projectId = assertValidProjectId(req.params.id);
      const { paths } = await loadProjectConfig(projectId);
      const validated = validateProjectConfig(req.body || {}, projectId);
      await fs.writeFile(paths.configPath, JSON.stringify(validated, null, 2) + '\n', 'utf8');
      res.json({ ok: true, project: await getFullProjectDetails(projectId, authBridge.getAuthConfig) });
    } catch (error) {
      sendError(res, error);
    }
  });

  api.post('/projects/:id/audio/vo', async (req, res) => {
    try {
      const projectId = assertValidProjectId(req.params.id);
      const body = req.body || {};
      const { config, paths } = await loadProjectConfig(projectId);
      const voResults = await generateProjectVoiceovers(config, paths, {
        actId: body.actId ? String(body.actId) : null,
        force: Boolean(body.force),
      });
      await ensureProjectDspStems(config, paths);
      const mix = await mixProjectAudio(config, paths);
      res.json({
        ok: true,
        voResults,
        masterDurationSec: mix.wavInfo.durationSec,
        project: await getFullProjectDetails(projectId, authBridge.getAuthConfig),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  api.post('/projects/:id/audio/mix', async (req, res) => {
    try {
      const projectId = assertValidProjectId(req.params.id);
      const body = req.body || {};
      const { config, paths } = await loadProjectConfig(projectId);
      const mix = await mixProjectAudio(config, paths, { forceDsp: Boolean(body.forceDsp) });
      res.json({
        ok: true,
        masterDurationSec: mix.wavInfo.durationSec,
        project: await getFullProjectDetails(projectId, authBridge.getAuthConfig),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  api.post(
    '/projects/:id/assets',
    express.raw({ type: '*/*', limit: '30mb' }),
    async (req, res) => {
      try {
        const projectId = assertValidProjectId(req.params.id);
        const { paths } = await loadProjectConfig(projectId);
        const rawName = String(req.query?.filename || req.headers['x-file-name'] || '').trim();
        const target = req.query?.target === 'audio' ? 'audio' : 'assets';
        const safeName = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '_');
        if (!safeName || safeName.startsWith('.')) {
          return res.status(400).json({ error: 'Valid filename query param or x-file-name header is required.' });
        }

        let rawBuf = Buffer.alloc(0);
        if (Buffer.isBuffer(req.body)) {
          rawBuf = req.body;
        } else if (typeof req.body === 'string' && req.body.length > 0) {
          rawBuf = Buffer.from(req.body, 'utf8');
        } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
          rawBuf = Buffer.from(JSON.stringify(req.body), 'utf8');
        }

        if (rawBuf.length === 0) {
          return res.status(400).json({ error: 'Empty upload body.' });
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
          return res.json({ ok: true, file: `audio/${outName}` });
        }

        const destPath = resolveProjectRelative(paths.root, `assets/${safeName}`);
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.writeFile(destPath, rawBuf);
        return res.json({ ok: true, file: `assets/${safeName}`, sizeBytes: rawBuf.length });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  api.get('/projects/:id/files/*', async (req, res) => {
    try {
      const projectId = assertValidProjectId(req.params.id);
      const rel = decodeURIComponent(req.params[0] || '').replace(/^\/+/, '');
      if (!rel || path.basename(rel).startsWith('.')) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const projectPaths = getProjectPaths(projectId);
      const absPath = resolveProjectRelative(projectPaths.root, rel);
      if (!(await fileExists(absPath))) {
        return res.status(404).json({ error: `File not found: ${rel}` });
      }
      const isDownload = req.query?.download === '1';
      return await sendFileWithRange(req, res, absPath, isDownload);
    } catch (error) {
      return sendError(res, error);
    }
  });

  api.post('/projects/:id/jobs', async (req, res) => {
    try {
      const projectId = assertValidProjectId(req.params.id);
      await loadProjectConfig(projectId);

      // Single-active-job concurrency lock
      const activeJob = findActiveJob();
      if (activeJob) {
        return res.status(409).json({
          error: `Another video job (${activeJob.id}: ${activeJob.type} on ${activeJob.projectId}) is already running.`,
          activeJobId: activeJob.id,
        });
      }

      const body = req.body || {};
      const type = String(body.type || 'build');
      const job = startBackgroundJob(projectId, type, body);
      return res.status(202).json({ ok: true, jobId: job.id, type });
    } catch (error) {
      return sendError(res, error);
    }
  });

  api.get('/jobs/:jobId/stream', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Unknown job id.' });
    }
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
    return undefined;
  });

  api.post('/jobs/:jobId/cancel', (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Unknown job id.' });
    }
    job.controller.abort();
    return res.json({ ok: true, status: 'cancelling' });
  });

  app.use('/api/video-studio', api);
}
