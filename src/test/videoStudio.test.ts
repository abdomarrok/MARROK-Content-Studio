import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import { app as baseApiApp } from '../../api/index.ts';
import { hashPasswordScrypt, resetAuthStateForTest } from '../lib/security/sessionAuth.ts';
import { registerVideoStudioRoutes } from '../../video-studio/studio/expressRouter.mjs';
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

  describe('4. Express Fail-Closed Auth & Restricted Preview Surface', () => {
    let server: Server;
    let baseUrl = '';
    let bearerToken = '';

    const prevUser = process.env.ADMIN_USERNAME;
    const prevHash = process.env.ADMIN_PASSWORD_HASH;
    const prevSecret = process.env.SESSION_SECRET;

    beforeAll(async () => {
      resetAuthStateForTest();
      process.env.ADMIN_USERNAME = 'video-tester';
      process.env.ADMIN_PASSWORD_HASH = hashPasswordScrypt('test-password-123!');
      process.env.SESSION_SECRET = 'super-secret-signing-key-for-video-studio-tests';

      const testApp = express();
      testApp.use(baseApiApp);
      registerVideoStudioRoutes(testApp);

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

    afterAll(async () => {
      if (prevUser === undefined) delete process.env.ADMIN_USERNAME;
      else process.env.ADMIN_USERNAME = prevUser;
      if (prevHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
      else process.env.ADMIN_PASSWORD_HASH = prevHash;
      if (prevSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = prevSecret;

      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('rejects unauthenticated /api/video-studio/* with 401 and allows authenticated requests (200)', async () => {
      const unauthCap = await fetch(`${baseUrl}/api/video-studio/capabilities`);
      expect(unauthCap.status).toBe(401);

      const unauthProj = await fetch(`${baseUrl}/api/video-studio/projects`);
      expect(unauthProj.status).toBe(401);

      const authedCap = await fetch(`${baseUrl}/api/video-studio/capabilities`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      expect(authedCap.status).toBe(200);
      const capJson = await authedCap.json();
      expect(capJson.localRenderAvailable).toBe(true);

      const authedProj = await fetch(`${baseUrl}/api/video-studio/projects/marrok-brand-film`, {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      expect(authedProj.status).toBe(200);
      const projJson = await authedProj.json();
      expect(projJson.config.id).toBe('marrok-brand-film');
    });

    it('allows /video-projects/:id/scene.html & assets/* while blocking project.json, audio/*, and output/* (403)', async () => {
      const sceneRes = await fetch(`${baseUrl}/video-projects/marrok-brand-film/scene.html?embed=1`);
      expect(sceneRes.status).toBe(200);

      const sdkRes = await fetch(`${baseUrl}/engine/motion-sdk.js`);
      expect(sdkRes.status).toBe(200);

      const blockedConfig = await fetch(`${baseUrl}/video-projects/marrok-brand-film/project.json`);
      expect(blockedConfig.status).toBe(403);

      const blockedAudio = await fetch(`${baseUrl}/video-projects/marrok-brand-film/audio/master.wav`);
      expect(blockedAudio.status).toBe(403);

      const blockedOutput = await fetch(`${baseUrl}/video-projects/marrok-brand-film/output/final-16x9.mp4`);
      expect(blockedOutput.status).toBe(403);
    });
  });
});
