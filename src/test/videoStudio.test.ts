import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import { app as baseApiApp } from '../../api/index.ts';
import {
  getAuthConfigStatus,
  hashPasswordScrypt,
  resetAuthStateForTest,
  revokeSessionToken,
  verifySessionRequestOrTokens,
} from '../lib/security/sessionAuth.ts';
import {
  createVideoPreviewToken,
  getVideoStudioJobsSize,
  MAX_COMPLETED_JOBS,
  MAX_REEL_SCENE_HTML_BYTES,
  registerVideoStudioRoutes,
  resetVideoStudioJobsForTest,
} from '../../video-studio/studio/expressRouter.mjs';
import { getMotionTemplate } from '../lib/motion/index.ts';
import type { MotionReelData } from '../types.ts';
import {
  loadProjectConfig,
  ProjectValidationError,
  resolveEffectiveActVoice,
  validateProjectConfig,
} from '../../video-studio/engine/schema.mjs';
import { buildFfmpegMixPlan } from '../../video-studio/engine/audio-mix.mjs';
import { DSP_SYNTHESIZERS, synthesizeMusicWav } from '../../video-studio/engine/audio-dsp.mjs';
import {
  encodeWav24Stereo,
  inspectWavBuffer,
  measureStereoRmsDb,
  normalizeStereoToHeadroom,
} from '../../video-studio/engine/wav.mjs';
import { computeActCacheKey, generateProjectVoiceovers } from '../../video-studio/engine/audio-vo.mjs';
import { getProjectPaths } from '../../video-studio/engine/paths.mjs';

function makeDummyWav(durationSec = 0.4): Buffer {
  const frames = Math.round(durationSec * 48000);
  const l = new Float32Array(frames);
  const r = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const s = Math.sin((2 * Math.PI * 330 * i) / 48000) * 0.5;
    l[i] = s;
    r[i] = s;
  }
  normalizeStereoToHeadroom(l, r, -3.0);
  return encodeWav24Stereo(l, r, 48000);
}

describe('Video Studio Core Engine & Express Integration', () => {
  describe('1. Project Schema Validation & Overrides', () => {
    it('validates marrok-brand-film config and supports per-act voiceOverride merging', async () => {
      const { config } = await loadProjectConfig('marrok-brand-film');
      expect(config.id).toBe('marrok-brand-film');
      expect(config.acts).toHaveLength(6);
      expect(config.video.durationSec).toBe(37);

      const custom = validateProjectConfig({
        id: 'override-demo',
        name: 'Override Demo',
        video: { width: 1920, height: 1080, fps: 60, durationSec: 15 },
        voice: {
          provider: 'elevenlabs',
          voiceId: 'XrExE9yKIg1WjnnlVkGX',
          modelId: 'eleven_multilingual_v2',
          seed: 4242,
          settings: { stability: 0.55 },
        },
        acts: [
          { id: 'act1', startSec: 0.5, maxDurationSec: 3.0, text: 'English.', voiceOverride: null },
          {
            id: 'act2',
            startSec: 4.5,
            maxDurationSec: 4.0,
            text: 'Arabic.',
            voiceOverride: { provider: 'gemini', voiceId: 'Kore', settings: { style: 0.2 } },
          },
        ],
        music: null,
        sfx: [],
      });

      const v1 = resolveEffectiveActVoice(custom, custom.acts[0]);
      const v2 = resolveEffectiveActVoice(custom, custom.acts[1]);
      expect(v1.provider).toBe('elevenlabs');
      expect(v2.provider).toBe('gemini');
      expect(v2.voiceId).toBe('Kore');
      expect(v2.modelId).toBe('gemini-2.5-flash-preview-tts');
      expect(v2.settings.stability).toBe(0.55);
      expect(v2.settings.style).toBe(0.2);
    });

    it('rejects invalid slugs, odd dimensions, and path traversal with ProjectValidationError', () => {
      expect(() =>
        validateProjectConfig({
          id: 'Bad_Slug!',
          name: 'Bad',
          video: { width: 1921, height: 1080, fps: 60, durationSec: 10 },
          voice: { provider: 'elevenlabs', voiceId: 'v', modelId: 'm' },
          acts: [{ id: 'act1', startSec: 8, maxDurationSec: 5, text: 'Too long' }],
          sfx: [{ id: 's1', source: 'file', file: '../secret.wav', atSec: 1 }],
        })
      ).toThrow(ProjectValidationError);
    });
  });

  describe('2. Dynamic FFmpeg Filtergraph Builder (No FFmpeg Binary Required)', () => {
    it('builds MARROK filtergraph with apad before asplit=2 and deduplicates shared SFX only when N > 1', async () => {
      const { config, paths } = await loadProjectConfig('marrok-brand-film');
      const plan = buildFfmpegMixPlan(config, paths);

      expect(plan.voCount).toBe(6);
      expect(plan.sfxPlacementCount).toBe(7);
      expect(plan.inputFiles).toHaveLength(12);
      expect(plan.filterComplex).toMatch(/apad=whole_dur=37\.000,asplit=2\[vo_sc\]\[vo_mix\]/);
      expect(plan.filterComplex).toMatch(/sidechaincompress=threshold=0\.04:ratio=4:attack=20:release=260/);
      expect(plan.filterComplex).toMatch(/afade=t=out:st=35\.5:d=1\.5/);
      expect(plan.filterComplex.match(/asplit=/g) || []).toHaveLength(3);
    });

    it('handles 0-act music-only + 0-SFX projects without sidechaincompress or asplit', () => {
      const cfg = validateProjectConfig({
        id: 'music-only',
        name: 'Music Only',
        video: { width: 1920, height: 1080, fps: 60, durationSec: 12 },
        voice: null,
        acts: [],
        music: {
          source: 'dsp',
          file: 'audio/music.wav',
          gainDb: -12,
          fadeOutStartSec: 10.5,
          fadeOutDurationSec: 1.5,
          ducking: { threshold: 0.03, ratio: 8, attackMs: 20, releaseMs: 500 },
        },
        sfx: [],
      });
      const plan = buildFfmpegMixPlan(cfg, getProjectPaths('music-only'));
      expect(plan.voCount).toBe(0);
      expect(plan.sfxPlacementCount).toBe(0);
      expect(plan.filterComplex).not.toMatch(/sidechaincompress/);
      expect(plan.filterComplex).not.toMatch(/asplit=/);
    });
  });

  describe('3. DSP Synthesizers & SHA-256 Voiceover Hash Cache (Mocked Fetch)', () => {
    it('synthesizes 48kHz 24-bit stereo stems with -3 dBFS headroom and custom durations', () => {
      let wav37: Buffer | null = null;
      for (const [name, synth] of Object.entries(DSP_SYNTHESIZERS)) {
        const wav = synth(48000);
        if (name === 'music.wav') wav37 = wav;
        const info = inspectWavBuffer(wav);
        expect(info.isPcm, `${name} PCM`).toBe(true);
        expect(info.sampleRate, `${name} SR`).toBe(48000);
        expect(info.bitsPerSample, `${name} bits`).toBe(24);
        expect(info.channels, `${name} ch`).toBe(2);
        expect(info.peakDb).toBeLessThanOrEqual(-2.85);
        expect(info.peakDb).toBeGreaterThanOrEqual(-3.15);
      }

      const customMusic = synthesizeMusicWav(48000, { durationSec: 10, swellAtSec: 6 });
      const info10 = inspectWavBuffer(customMusic);
      expect(info10.durationSec).toBe(10.0);

      expect(wav37).not.toBeNull();
      const musicBuf = wav37!;
      const dataSize = musicBuf.length - 44;
      const frames = dataSize / 6;
      const l = new Float32Array(frames);
      const r = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        const p = 44 + i * 6;
        let lv = musicBuf[p] | (musicBuf[p + 1] << 8) | (musicBuf[p + 2] << 16);
        if (lv & 0x800000) lv |= ~0xffffff;
        let rv = musicBuf[p + 3] | (musicBuf[p + 4] << 8) | (musicBuf[p + 5] << 16);
        if (rv & 0x800000) rv |= ~0xffffff;
        l[i] = lv / 8388608;
        r[i] = rv / 8388608;
      }
      expect(measureStereoRmsDb(l, r, 23.2, 29.5, 48000)).toBeGreaterThan(
        measureStereoRmsDb(l, r, 5.0, 10.0, 48000) + 1.5
      );
    }, 15000);

    it('skips TTS API calls on SHA-256 cache hit and invalidates only affected acts on change or --force', async () => {
      const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vitest-vo-cache-'));
      const audioDir = path.join(tmpRoot, 'audio');
      const paths = { root: tmpRoot, audioDir, cacheManifestPath: path.join(audioDir, '.cache-manifest.json') };

      const cfg = validateProjectConfig({
        id: 'cache-run',
        name: 'Cache Run',
        video: { width: 1920, height: 1080, fps: 60, durationSec: 12 },
        voice: { provider: 'elevenlabs', voiceId: 'XrExE9yKIg1WjnnlVkGX', modelId: 'eleven_multilingual_v2', seed: 4242 },
        acts: [
          { id: 'act1', startSec: 0.5, maxDurationSec: 3.0, text: 'Line one.' },
          { id: 'act2', startSec: 4.5, maxDurationSec: 3.0, text: 'Line two.', voiceOverride: { provider: 'gemini', voiceId: 'Kore' } },
        ],
        music: null,
        sfx: [],
      });

      const apiCalls: string[] = [];
      const fakeFetch = async (url: string) => {
        apiCalls.push(String(url));
        if (String(url).includes('generativelanguage.googleapis.com')) {
          return {
            ok: true,
            json: async () => ({
              candidates: [{ content: { parts: [{ inlineData: { data: Buffer.alloc(24000).toString('base64'), mimeType: 'audio/L16;rate=24000' } }] } }],
            }),
          };
        }
        return { ok: true, headers: { get: () => 'audio/wav' }, arrayBuffer: async () => makeDummyWav(0.5) };
      };
      const fakeMaster = async (_buf: Buffer, _ct: string, outPath: string) => {
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, makeDummyWav(0.5));
        return { durationSec: 0.5, wavInfo: { peakDb: -3.0 } };
      };

      try {
        const env = { ELEVENLABS_API_KEY: 'test-el', GEMINI_API_KEY: 'test-gem' };
        await generateProjectVoiceovers(cfg, paths, { fetchImpl: fakeFetch, masterFn: fakeMaster, env, log: () => {} });
        expect(apiCalls).toHaveLength(2);

        apiCalls.length = 0;
        const r2 = await generateProjectVoiceovers(cfg, paths, { fetchImpl: fakeFetch, masterFn: fakeMaster, env, log: () => {} });
        expect(apiCalls).toHaveLength(0);
        expect(r2.every((r: { cached: boolean }) => r.cached)).toBe(true);

        const hashBefore = computeActCacheKey(cfg, cfg.acts[1], 1);
        cfg.acts[0].text = 'Edited line one.';
        expect(computeActCacheKey(cfg, cfg.acts[1], 1)).toBe(hashBefore);

        const r3 = await generateProjectVoiceovers(cfg, paths, { fetchImpl: fakeFetch, masterFn: fakeMaster, env, log: () => {} });
        expect(apiCalls).toHaveLength(1);
        expect(r3[0].cached).toBe(false);
        expect(r3[1].cached).toBe(true);

        apiCalls.length = 0;
        await generateProjectVoiceovers(cfg, paths, { force: true, fetchImpl: fakeFetch, masterFn: fakeMaster, env, log: () => {} });
        expect(apiCalls).toHaveLength(2);
      } finally {
        await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
      }
    });
  });

  describe('4. Express Fail-Closed Auth, Capabilities, Concurrency Lock, Write Isolation & Scoped Preview Surface', () => {
    let server: Server;
    let baseUrl = '';
    let bearerToken = '';

    const prevUser = process.env.ADMIN_USERNAME;
    const prevHash = process.env.ADMIN_PASSWORD_HASH;
    const prevSecret = process.env.SESSION_SECRET;
    const prevDeployContext = process.env.DEPLOY_CONTEXT;
    const prevAllowPreviewWrites = process.env.ALLOW_PREVIEW_WRITES;

    beforeAll(async () => {
      resetAuthStateForTest();
      resetVideoStudioJobsForTest();
      process.env.ADMIN_USERNAME = 'video-tester';
      process.env.ADMIN_PASSWORD_HASH = hashPasswordScrypt('test-password-123!');
      process.env.SESSION_SECRET = 'super-secret-signing-key-for-video-studio-tests';
      delete process.env.DEPLOY_CONTEXT;
      delete process.env.ALLOW_PREVIEW_WRITES;

      const testApp = express();
      testApp.use(baseApiApp);
      registerVideoStudioRoutes(testApp, {
        getAuthConfig: getAuthConfigStatus,
        verifySessionRequest: (req, authCfg, candidateTokens) =>
          verifySessionRequestOrTokens(req.headers, authCfg, null, candidateTokens),
      });

      await new Promise<void>((resolve) => {
        server = testApp.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (addr && typeof addr === 'object') {
            baseUrl = `http://127.0.0.1:${addr.port}`;
          }
          resolve();
        });
      });

      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'video-tester', password: 'test-password-123!' }),
      });
      const loginData = await loginRes.json();
      bearerToken = loginData.token;
    });

    afterEach(() => {
      resetVideoStudioJobsForTest();
      if (prevDeployContext === undefined) delete process.env.DEPLOY_CONTEXT;
      else process.env.DEPLOY_CONTEXT = prevDeployContext;
      if (prevAllowPreviewWrites === undefined) delete process.env.ALLOW_PREVIEW_WRITES;
      else process.env.ALLOW_PREVIEW_WRITES = prevAllowPreviewWrites;
    });

    afterAll(async () => {
      resetVideoStudioJobsForTest();
      if (prevUser === undefined) delete process.env.ADMIN_USERNAME;
      else process.env.ADMIN_USERNAME = prevUser;
      if (prevHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
      else process.env.ADMIN_PASSWORD_HASH = prevHash;
      if (prevSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = prevSecret;

      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('rejects unauthenticated /api/video-studio/* with 401 and returns separated serverAvailable/ffmpegAvailable + previewToken when authenticated', async () => {
      const unauthCap = await fetch(`${baseUrl}/api/video-studio/capabilities`);
      expect(unauthCap.status).toBe(401);

      const unauthProj = await fetch(`${baseUrl}/api/video-studio/projects`);
      expect(unauthProj.status).toBe(401);

      const authedCap = await fetch(`${baseUrl}/api/video-studio/capabilities`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      expect(authedCap.status).toBe(200);
      const capJson = await authedCap.json();
      expect(capJson.serverAvailable).toBe(true);
      expect(capJson.localRenderAvailable).toBe(true);
      expect(typeof capJson.ffmpegAvailable).toBe('boolean');
      expect(typeof capJson.previewToken).toBe('string');
      expect(capJson.previewToken.startsWith('vprev.')).toBe(true);

      const authedProj = await fetch(`${baseUrl}/api/video-studio/projects/marrok-brand-film`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      expect(authedProj.status).toBe(200);
      const projJson = await authedProj.json();
      expect(projJson.config.id).toBe('marrok-brand-film');
      expect(typeof projJson.previewToken).toBe('string');
    });

    it('protects /video-projects/* with session auth AND path-scoped preview token (/video-projects/s/:token/:id/*) while keeping /engine/motion-sdk.js static-only', async () => {
      // Static SDK remains accessible
      const sdkRes = await fetch(`${baseUrl}/engine/motion-sdk.js`);
      expect(sdkRes.status).toBe(200);

      // Unauthenticated /video-projects/:id/scene.html is rejected (401)
      const unauthSceneRes = await fetch(`${baseUrl}/video-projects/marrok-brand-film/scene.html?embed=1`);
      expect(unauthSceneRes.status).toBe(401);

      // Invalid or expired path-scoped preview token is rejected (401)
      const invalidTokenRes = await fetch(
        `${baseUrl}/video-projects/s/vprev.12345.invalidsig/marrok-brand-film/scene.html?embed=1`
      );
      expect(invalidTokenRes.status).toBe(401);

      const expiredToken = createVideoPreviewToken(
        process.env.SESSION_SECRET!,
        60,
        Date.now() - 120_000
      );
      const expiredRes = await fetch(
        `${baseUrl}/video-projects/s/${expiredToken}/marrok-brand-film/scene.html?embed=1`
      );
      expect(expiredRes.status).toBe(401);

      // Authenticated with Bearer header on /video-projects/:id/scene.html succeeds (200)
      const bearerSceneRes = await fetch(`${baseUrl}/video-projects/marrok-brand-film/scene.html?embed=1`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      expect(bearerSceneRes.status).toBe(200);

      // Authenticated with path-scoped preview token on scene.html AND relative ./assets/* succeeds (200 & 206 Range)
      const validPreviewToken = createVideoPreviewToken(process.env.SESSION_SECRET!, 600);
      const scopedSceneRes = await fetch(
        `${baseUrl}/video-projects/s/${validPreviewToken}/marrok-brand-film/scene.html?embed=1`
      );
      expect(scopedSceneRes.status).toBe(200);

      const scopedAssetRangeRes = await fetch(
        `${baseUrl}/video-projects/s/${validPreviewToken}/marrok-brand-film/assets/52997ef7-be0b-4fdf-8975-07856ea48856.jfif`,
        {
          headers: { Range: 'bytes=0-31' },
        }
      );
      expect(scopedAssetRangeRes.status).toBe(206);
      const rangeBuf = Buffer.from(await scopedAssetRangeRes.arrayBuffer());
      expect(rangeBuf.length).toBe(32);

      // Even with a valid token, non-preview files (project.json, audio/*, output/*) remain blocked (403)
      const blockedConfig = await fetch(
        `${baseUrl}/video-projects/s/${validPreviewToken}/marrok-brand-film/project.json`
      );
      expect(blockedConfig.status).toBe(403);

      const blockedAudio = await fetch(
        `${baseUrl}/video-projects/s/${validPreviewToken}/marrok-brand-film/audio/master.wav`
      );
      expect(blockedAudio.status).toBe(403);

      const blockedOutput = await fetch(
        `${baseUrl}/video-projects/s/${validPreviewToken}/marrok-brand-film/output/final-16x9.mp4`
      );
      expect(blockedOutput.status).toBe(403);

      // Revoked session tokens are rejected on /video-projects/* via the canonical sessionAuth verifier
      const tempLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'video-tester', password: 'test-password-123!' }),
      });
      const tempToken = (await tempLoginRes.json()).token as string;
      const beforeRevoke = await fetch(`${baseUrl}/video-projects/marrok-brand-film/scene.html?embed=1`, {
        headers: { Authorization: `Bearer ${tempToken}` },
      });
      expect(beforeRevoke.status).toBe(200);
      await revokeSessionToken(tempToken, process.env.SESSION_SECRET!);
      const afterRevoke = await fetch(`${baseUrl}/video-projects/marrok-brand-film/scene.html?embed=1`, {
        headers: { Authorization: `Bearer ${tempToken}` },
      });
      expect(afterRevoke.status).toBe(401);
    });

    it('enforces ALLOW_PREVIEW_WRITES deploy-preview write isolation on mutating /api/video-studio/* requests', async () => {
      process.env.DEPLOY_CONTEXT = 'deploy-preview';
      process.env.ALLOW_PREVIEW_WRITES = 'false';

      // Read-only GET still works in preview mode
      const getRes = await fetch(`${baseUrl}/api/video-studio/projects`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      expect(getRes.status).toBe(200);

      // Mutating POST/PUT is blocked with 403
      const blockedJobRes = await fetch(`${baseUrl}/api/video-studio/projects/marrok-brand-film/jobs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'noop-test' }),
      });
      expect(blockedJobRes.status).toBe(403);

      // Setting ALLOW_PREVIEW_WRITES=true permits the mutation
      process.env.ALLOW_PREVIEW_WRITES = 'true';
      const allowedJobRes = await fetch(`${baseUrl}/api/video-studio/projects/marrok-brand-film/jobs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'noop-test', holdMs: 20 }),
      });
      expect(allowedJobRes.status).toBe(202);
    });

    it('enforces single-active-job concurrency lock (409 Conflict) and caps completed job history to 50 entries', async () => {
      // Launch a long-enough noop-test job
      const firstJobRes = await fetch(`${baseUrl}/api/video-studio/projects/marrok-brand-film/jobs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'noop-test', holdMs: 400 }),
      });
      expect(firstJobRes.status).toBe(202);
      const firstJob = await firstJobRes.json();
      expect(firstJob.jobId).toBeTruthy();

      // Launching a second job while the first is running returns 409 Conflict
      const conflictRes = await fetch(`${baseUrl}/api/video-studio/projects/marrok-brand-film/jobs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'noop-test', holdMs: 50 }),
      });
      expect(conflictRes.status).toBe(409);
      const conflictBody = await conflictRes.json();
      expect(conflictBody.activeJobId).toBe(firstJob.jobId);

      // Cancel the first job and verify a new job can run
      const cancelRes = await fetch(`${baseUrl}/api/video-studio/jobs/${firstJob.jobId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      expect(cancelRes.status).toBe(200);
      await new Promise((r) => setTimeout(r, 30));

      // Run 55 fast jobs sequentially and verify the jobs Map stays capped at MAX_COMPLETED_JOBS (50)
      for (let i = 0; i < 55; i++) {
        const res = await fetch(`${baseUrl}/api/video-studio/projects/marrok-brand-film/jobs`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ type: 'noop-test', holdMs: 10 }),
        });
        expect(res.status).toBe(202);
        await new Promise((r) => setTimeout(r, 18));
      }
      expect(getVideoStudioJobsSize()).toBeLessThanOrEqual(MAX_COMPLETED_JOBS);
    });

    it('accepts raw binary and application/json asset uploads without express.json() stream consumption conflict', async () => {
      const testAssetPath = path.join(
        getProjectPaths('marrok-brand-film').assetsDir,
        'vitest-temp-upload.json'
      );
      try {
        const payload = JSON.stringify({ hello: 'video-studio-raw-upload' });
        const uploadRes = await fetch(
          `${baseUrl}/api/video-studio/projects/marrok-brand-film/assets?filename=vitest-temp-upload.json&target=assets`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${bearerToken}`,
              'Content-Type': 'application/json',
            },
            body: payload,
          }
        );
        expect(uploadRes.status).toBe(200);
        const uploadBody = await uploadRes.json();
        expect(uploadBody.ok).toBe(true);
        expect(uploadBody.file).toBe('assets/vitest-temp-upload.json');

        const savedText = await fs.readFile(testAssetPath, 'utf8');
        expect(JSON.parse(savedText)).toEqual({ hello: 'video-studio-raw-upload' });
      } finally {
        await fs.rm(testAssetPath, { force: true }).catch(() => {});
      }
    });

    it('promotes Create -> Reel into a validated 1080x1920 Film Studio project with deterministic window.renderAt scene.html and enforces preview write isolation', async () => {
      const testProjectId = 'reel-vitest-promoted';
      const promotedPaths = getProjectPaths(testProjectId);

      const sampleReelConfig: MotionReelData = {
        templateId: 'marrok-slides',
        duration: 13.5,
        languageMode: 'bilingual',
        sfxEnabled: true,
        sfxProfile: 'warm-foley',
        defaultTransition: 'auto',
        brand: {
          name: 'MARROK',
          accentColor: '#37E2C0',
          bgColor: '#080D11',
          textColor: '#FFFFFF',
          font: 'Cairo',
          direction: 'rtl',
        },
        scenes: [
          {
            id: 'scene-1',
            label: 'Slide 01 · Hook',
            text: 'WHY GIT FAILS AUTONOMOUS AGENTS',
            enTitle: 'WHY GIT FAILS AUTONOMOUS AGENTS',
            enBody: 'Version control assumes human commit cadence, not millisecond agent swarms.',
            arTitle: 'لماذا يفشل Git مع الوكلاء المستقلين',
            arBody: 'أنظمة التحكم في الإصدارات صممت للبشر.',
            slideType: 'hub',
            from: 0,
            to: 4.5,
            springK: 220,
            springD: 20,
          },
          {
            id: 'scene-2',
            label: 'Slide 02 · Takeaways',
            text: 'Kernel Isolation | Zero-Trust Mesh | Instant Scale',
            enTitle: 'CORE ARCHITECTURAL PILLARS',
            slideType: 'row',
            from: 4.5,
            to: 9.0,
            springK: 210,
            springD: 22,
          },
          {
            id: 'scene-3',
            label: 'Slide 03 · CTA',
            text: 'FOLLOW @MARROK',
            enTitle: 'FOLLOW @MARROK',
            enBody: 'Deep engineering breakdowns every week.',
            slideType: 'cta',
            from: 9.0,
            to: 13.5,
            springK: 220,
            springD: 20,
          },
        ],
      };

      const compiledSceneHtml = getMotionTemplate('marrok-slides').toHTML(sampleReelConfig);
      expect(compiledSceneHtml).toContain('window.renderAt = (t, dt) =>');
      expect(compiledSceneHtml).toContain('window.seek = (t) =>');
      expect(compiledSceneHtml).toContain("__params.get('render') === '1' || __params.get('embed') === '1'");
      expect(compiledSceneHtml).toContain("msg.type === 'studio:scrub'");
      expect(compiledSceneHtml).toContain('window.__STUDIO_READY__');

      try {
        // 1. Deploy preview write isolation blocks POST /api/video-studio/projects/from-reel with 403
        process.env.DEPLOY_CONTEXT = 'deploy-preview';
        process.env.ALLOW_PREVIEW_WRITES = 'false';
        const previewBlockedRes = await fetch(`${baseUrl}/api/video-studio/projects/from-reel`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: testProjectId,
            name: 'Vitest Promoted Reel',
            reelConfig: sampleReelConfig,
            sceneHtml: compiledSceneHtml,
          }),
        });
        expect(previewBlockedRes.status).toBe(403);

        delete process.env.DEPLOY_CONTEXT;
        delete process.env.ALLOW_PREVIEW_WRITES;

        // 2. Rejects invalid slug (path traversal) with 400
        const badSlugRes = await fetch(`${baseUrl}/api/video-studio/projects/from-reel`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: '../bad-slug',
            reelConfig: sampleReelConfig,
            sceneHtml: compiledSceneHtml,
          }),
        });
        expect(badSlugRes.status).toBe(400);

        // 3. Rejects HTML missing window.renderAt with 400
        const nonDeterministicHtmlRes = await fetch(`${baseUrl}/api/video-studio/projects/from-reel`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: testProjectId,
            reelConfig: sampleReelConfig,
            sceneHtml: '<!doctype html><html><body>No renderAt</body></html>',
          }),
        });
        expect(nonDeterministicHtmlRes.status).toBe(400);

        // 4. Rejects oversized sceneHtml (> MAX_REEL_SCENE_HTML_BYTES) with 413
        const oversizedHtml = `<!doctype html><script>window.renderAt=()=>{};//${'a'.repeat(
          MAX_REEL_SCENE_HTML_BYTES + 128
        )}</script>`;
        const oversizedRes = await fetch(`${baseUrl}/api/video-studio/projects/from-reel`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: testProjectId,
            reelConfig: sampleReelConfig,
            sceneHtml: oversizedHtml,
          }),
        });
        expect(oversizedRes.status).toBe(413);

        // 5. Valid promotion creates native 1080x1920 @ 60fps project with verticalExport.enabled=false and acts[].text
        const promoteRes = await fetch(`${baseUrl}/api/video-studio/projects/from-reel`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: testProjectId,
            name: 'Why Git Fails Autonomous Agents (9:16 Reel)',
            reelConfig: sampleReelConfig,
            sceneHtml: compiledSceneHtml,
            overwrite: true,
          }),
        });
        expect(promoteRes.status).toBe(201);
        const promoteBody = await promoteRes.json();
        expect(promoteBody.ok).toBe(true);

        const cfg = promoteBody.project.config;
        expect(cfg.id).toBe(testProjectId);
        expect(cfg.video.width).toBe(1080);
        expect(cfg.video.height).toBe(1920);
        expect(cfg.video.fps).toBe(60);
        expect(cfg.video.durationSec).toBe(13.5);
        expect(cfg.video.verticalExport.enabled).toBe(false);
        expect(cfg.video.verticalExport.mode).toBe('native');

        expect(cfg.acts).toHaveLength(3);
        expect(cfg.acts[0].id).toBe('act1');
        expect(cfg.acts[0].startSec).toBe(0);
        expect(cfg.acts[0].maxDurationSec).toBeGreaterThan(0);
        expect(cfg.acts[0].startSec + cfg.acts[0].maxDurationSec).toBeLessThanOrEqual(cfg.video.durationSec);
        expect(cfg.acts[0].text).toContain('WHY GIT FAILS AUTONOMOUS AGENTS');
        expect(cfg.acts[1].startSec).toBe(4.5);
        expect(cfg.acts[2].startSec).toBe(9.0);

        // Verify disk files validate cleanly via loadProjectConfig
        const { config: diskCfg } = await loadProjectConfig(testProjectId);
        expect(diskCfg.video.width).toBe(1080);
        expect(diskCfg.video.height).toBe(1920);
        const diskHtml = await fs.readFile(promotedPaths.scenePath, 'utf8');
        expect(diskHtml).toContain('window.renderAt');
      } finally {
        await fs.rm(promotedPaths.root, { recursive: true, force: true }).catch(() => {});
      }
    });
  });
});
