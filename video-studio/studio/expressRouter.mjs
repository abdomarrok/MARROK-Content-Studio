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
  PROJECTS_DIR,
  resolveFfmpegBinaries,
  resolveProjectRelative,
} from '../engine/paths.mjs';
import { inspectProjectQa } from '../engine/qa-inspect.mjs';
import { renderProjectVideo } from '../engine/render-video.mjs';
import { loadProjectConfig, ProjectValidationError, validateProjectConfig } from '../engine/schema.mjs';
import { BIT_DEPTH, CHANNELS, inspectWavBuffer, SAMPLE_RATE } from '../engine/wav.mjs';
import { createProjectFromTemplate } from '../scripts/new-project.mjs';

const execFileAsync = promisify(execFile);

const SESSION_COOKIE_NAME = '__Host-marrok_session';
export const MAX_COMPLETED_JOBS = 50;
export const PREVIEW_TOKEN_TTL_SECONDS = 3600; // 1 hour

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

function toBase64Url(input) {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input) {
  const str = String(input || '');
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return Buffer.from(padded, 'base64');
}

function constantTimeEqualText(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a || ''), 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(String(b || ''), 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function getRuntimeAuthConfig() {
  const username = String(process.env.ADMIN_USERNAME || '').trim();
  const passwordHash = String(process.env.ADMIN_PASSWORD_HASH || '').trim();
  const sessionSecret = String(process.env.SESSION_SECRET || '').trim();
  const validHash = /^scrypt\$[0-9a-f]{16,}\$[0-9a-f]{128}$/i.test(passwordHash);
  const configured = Boolean(username && validHash && sessionSecret.length >= 16);
  return { configured, username, sessionSecret };
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
  const sig = crypto.createHmac('sha256', sessionSecret).update(payload).digest();
  return `${payload}.${toBase64Url(sig)}`;
}

export function verifyVideoPreviewOrSessionToken(
  token,
  authCfg = getRuntimeAuthConfig(),
  nowMs = Date.now()
) {
  if (!token || typeof token !== 'string' || !authCfg.configured) {
    return false;
  }
  const trimmed = token.trim();
  const parts = trimmed.split('.');

  // 1. Short-lived path-scoped preview token: vprev.<exp>.<sig>
  if (parts.length === 3 && parts[0] === 'vprev') {
    const exp = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(exp) || nowMs >= exp * 1000) {
      return false;
    }
    let actualSig;
    try {
      actualSig = fromBase64Url(parts[2]);
    } catch {
      return false;
    }
    const expectedSig = crypto
      .createHmac('sha256', authCfg.sessionSecret)
      .update(`vprev.${parts[1]}`)
      .digest();
    return (
      actualSig.length === expectedSig.length &&
      crypto.timingSafeEqual(actualSig, expectedSig)
    );
  }

  // 2. Standard signed session token: <payloadBase64Url>.<sigBase64Url>
  if (parts.length === 2 && parts[0] && parts[1]) {
    let actualSig;
    try {
      actualSig = fromBase64Url(parts[1]);
    } catch {
      return false;
    }
    const expectedSig = crypto
      .createHmac('sha256', authCfg.sessionSecret)
      .update(parts[0])
      .digest();
    if (
      actualSig.length !== expectedSig.length ||
      !crypto.timingSafeEqual(actualSig, expectedSig)
    ) {
      return false;
    }
    try {
      const parsed = JSON.parse(fromBase64Url(parts[0]).toString('utf8'));
      if (
        !parsed ||
        typeof parsed.sub !== 'string' ||
        typeof parsed.exp !== 'number' ||
        nowMs >= parsed.exp * 1000
      ) {
        return false;
      }
      return constantTimeEqualText(parsed.sub, authCfg.username);
    } catch {
      return false;
    }
  }

  return false;
}

function parseCookieToken(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return '';
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    if (key !== SESSION_COOKIE_NAME) continue;
    const rawVal = pair.slice(idx + 1).trim();
    try {
      return decodeURIComponent(rawVal);
    } catch {
      return rawVal;
    }
  }
  return '';
}

function extractBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return '';
  const trimmed = authHeader.trim();
  if (!/^bearer\s+/i.test(trimmed)) return '';
  return trimmed.replace(/^bearer\s+/i, '').trim();
}

function authorizeVideoProjectPreview(req, pathToken = '') {
  const authCfg = getRuntimeAuthConfig();
  if (!authCfg.configured) {
    return {
      ok: false,
      status: 503,
      error: 'Server authentication is not configured (fail closed).',
    };
  }

  const queryToken = typeof req.query?.token === 'string' ? req.query.token : '';
  const cookieToken = parseCookieToken(req.headers.cookie);
  const bearerToken = extractBearerToken(req.headers.authorization);

  const candidates = [pathToken, queryToken, cookieToken, bearerToken].filter(Boolean);
  for (const candidate of candidates) {
    if (verifyVideoPreviewOrSessionToken(candidate, authCfg)) {
      return { ok: true, status: 200 };
    }
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

  const authCfg = getRuntimeAuthConfig();
  return {
    config,
    previewToken: authCfg.configured ? createVideoPreviewToken(authCfg.sessionSecret) : null,
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
          vertical: opts.vertical !== undefined ? Boolean(opts.vertical) : true,
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

async function handleServeVideoProjectPreview(req, res, pathToken = '') {
  try {
    const auth = authorizeVideoProjectPreview(req, pathToken);
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
 */
export function registerVideoStudioRoutes(app) {
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
    return handleServeVideoProjectPreview(req, res, req.params.token);
  });

  // Session cookie / Bearer token preview route
  app.get('/video-projects/:id/*', async (req, res) => {
    return handleServeVideoProjectPreview(req, res, '');
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
    const authCfg = getRuntimeAuthConfig();
    res.json({
      serverAvailable: true,
      localRenderAvailable: true,
      ffmpegAvailable,
      previewToken: authCfg.configured ? createVideoPreviewToken(authCfg.sessionSecret) : null,
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
      res.status(201).json({ ok: true, project: await getFullProjectDetails(config.id) });
    } catch (error) {
      sendError(res, error);
    }
  });

  api.get('/projects/:id', async (req, res) => {
    try {
      const projectId = assertValidProjectId(req.params.id);
      res.json(await getFullProjectDetails(projectId));
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
      res.json({ ok: true, project: await getFullProjectDetails(projectId) });
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
        project: await getFullProjectDetails(projectId),
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
        project: await getFullProjectDetails(projectId),
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
