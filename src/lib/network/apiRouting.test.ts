import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Server } from 'http';
import { app } from '../../../api/index.ts';
import {
  hashPasswordScrypt,
  resetAuthStateForTest,
} from '../security/sessionAuth.ts';
import authFn, { config as authCfg } from '../../../netlify/functions/auth.ts';
import postsFn, { config as postsCfg } from '../../../netlify/functions/posts.ts';
import generateFn, { config as generateCfg } from '../../../netlify/functions/generate.ts';
import publishFn, { config as publishCfg } from '../../../netlify/functions/publish.ts';
import gatherFn, { config as gatherCfg } from '../../../netlify/functions/gather.ts';
import proxyFn, { config as proxyCfg } from '../../../netlify/functions/proxy.ts';
import fallbackApiFn from '../../../netlify/functions/api.ts';

async function countFilesRecursive(dir: string): Promise<number> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countFilesRecursive(full);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

describe('Netlify & Vercel API Routing + Strict CORS', () => {
  let server: Server;
  let baseUrl: string;
  let sessionCookie = '';

  const prevAdminUser = process.env.ADMIN_USERNAME;
  const prevAdminHash = process.env.ADMIN_PASSWORD_HASH;
  const prevSessionSecret = process.env.SESSION_SECRET;
  const prevGeminiKey = process.env.GEMINI_API_KEY;
  const prevGeminiKeyBackup = process.env.GEMINI_API_KEY_BACKUP;
  const prevGeminiKeys = process.env.GEMINI_API_KEYS;
  const prevDatabaseUrl = process.env.DATABASE_URL;
  const prevPostgresUrl = process.env.POSTGRES_URL;

  beforeAll(async () => {
    resetAuthStateForTest();
    process.env.ADMIN_USERNAME = 'marrok-tester';
    process.env.ADMIN_PASSWORD_HASH = hashPasswordScrypt('test-password-123!');
    process.env.SESSION_SECRET = 'super-secret-signing-key-for-routing-tests';
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY_BACKUP;
    delete process.env.GEMINI_API_KEYS;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'marrok-tester',
        password: 'test-password-123!',
      }),
    });
    const rawCookie = loginRes.headers.get('set-cookie') || '';
    sessionCookie = rawCookie.split(';')[0];
  });

  afterAll(async () => {
    if (prevAdminUser === undefined) delete process.env.ADMIN_USERNAME;
    else process.env.ADMIN_USERNAME = prevAdminUser;
    if (prevAdminHash === undefined) delete process.env.ADMIN_PASSWORD_HASH;
    else process.env.ADMIN_PASSWORD_HASH = prevAdminHash;
    if (prevSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSessionSecret;
    if (prevGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGeminiKey;
    if (prevGeminiKeyBackup === undefined) delete process.env.GEMINI_API_KEY_BACKUP;
    else process.env.GEMINI_API_KEY_BACKUP = prevGeminiKeyBackup;
    if (prevGeminiKeys === undefined) delete process.env.GEMINI_API_KEYS;
    else process.env.GEMINI_API_KEYS = prevGeminiKeys;
    if (prevDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDatabaseUrl;
    if (prevPostgresUrl === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = prevPostgresUrl;

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('keeps /api file count strictly <= 12 to satisfy platform limits', async () => {
    const apiDir = path.resolve(process.cwd(), 'api');
    const fileCount = await countFilesRecursive(apiDir);
    expect(fileCount).toBeLessThanOrEqual(12);
  });

  it('does not statically reference .ts source files via fs/path in postsController (prevents Netlify zip-it-and-ship-it bundle collision)', async () => {
    const src = await fs.readFile(
      path.resolve(process.cwd(), 'api', 'controllers', 'postsController.ts'),
      'utf-8'
    );
    expect(src).not.toMatch(/path\.(join|resolve)\([^)]*bundledSavedPosts\.ts/);
  });

  it('responds 200 OK on minimal /api/health without leaking key counts', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(typeof json.timestamp).toBe('number');
    expect(json.apiKeyCount).toBeUndefined();
    expect(json.hasApiKey).toBeUndefined();
  });

  it('responds 200 OK on un-prefixed /health', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
  });

  it('restores requested route when proxy rewrites /api/* and requires auth', async () => {
    const unauthRadar = await fetch(`${baseUrl}/api/index`, {
      headers: {
        'x-matched-path': '/api/index',
        'x-forwarded-uri': '/api/gather/radar',
      },
    });
    expect(unauthRadar.status).toBe(401);

    const radarRes = await fetch(`${baseUrl}/api/index`, {
      headers: {
        'x-matched-path': '/api/index',
        'x-forwarded-uri': '/api/gather/radar',
        Cookie: sessionCookie,
      },
    });
    expect(radarRes.status).toBe(200);
    const radarJson = await radarRes.json();
    expect(radarJson.ok).toBe(true);
    expect(Array.isArray(radarJson.topics)).toBe(true);
  });

  it('handles OPTIONS preflight cleanly for allowed origins and denies unknown origins', async () => {
    const allowedRes = await fetch(`${baseUrl}/api/health`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://marrok-content.netlify.app' },
    });
    expect(allowedRes.status).toBe(204);
    expect(allowedRes.headers.get('access-control-allow-origin')).toBe(
      'https://marrok-content.netlify.app'
    );
    expect(allowedRes.headers.get('access-control-allow-credentials')).toBe('true');

    const deniedRes = await fetch(`${baseUrl}/api/health`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil-attacker.example' },
    });
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('orders netlify.toml /api/* redirect strictly ahead of SPA fallback without force=true catch-all', async () => {
    const toml = await fs.readFile(path.resolve(process.cwd(), 'netlify.toml'), 'utf-8');
    const apiIdx = toml.indexOf('from = "/api/*"');
    const spaIdx = toml.indexOf('from = "/*"');
    expect(apiIdx).toBeGreaterThan(-1);
    expect(spaIdx).toBeGreaterThan(apiIdx);
    const spaSection = toml.slice(spaIdx);
    expect(spaSection).not.toMatch(/force\s*=\s*true/i);
  });

  it('routes modular Netlify Functions v2 with disjoint config.path sets and enforces auth fail-closed across all domains', async () => {
    const allPaths = [
      ...(Array.isArray(authCfg.path) ? authCfg.path : [authCfg.path]),
      ...(Array.isArray(postsCfg.path) ? postsCfg.path : [postsCfg.path]),
      ...(Array.isArray(generateCfg.path) ? generateCfg.path : [generateCfg.path]),
      ...(Array.isArray(publishCfg.path) ? publishCfg.path : [publishCfg.path]),
      ...(Array.isArray(gatherCfg.path) ? gatherCfg.path : [gatherCfg.path]),
      ...(Array.isArray(proxyCfg.path) ? proxyCfg.path : [proxyCfg.path]),
    ].filter(Boolean);
    expect(new Set(allPaths).size).toBe(allPaths.length);
    expect(allPaths).not.toContain('/api/*');

    const mockCtx = {} as any;
    const origin = 'https://marrok-content.netlify.app';

    // 1. Auth health probe returns 200 without auth
    const healthRes = await authFn(new Request(`${origin}/api/health`), mockCtx);
    expect(healthRes.status).toBe(200);

    // 2. Fallback /.netlify/functions/api/health normalizes to /api/health
    const fallbackHealth = await fallbackApiFn(
      new Request(`${origin}/.netlify/functions/api/health`),
      mockCtx
    );
    expect(fallbackHealth.status).toBe(200);

    // 3. Every protected modular function returns 401 when unauthenticated
    const unauthResponses = await Promise.all([
      postsFn(new Request(`${origin}/api/posts`), mockCtx),
      generateFn(
        new Request(`${origin}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({ prompt: 'Redis benchmark 70%' }),
        }),
        mockCtx
      ),
      publishFn(new Request(`${origin}/api/publish/status`), mockCtx),
      gatherFn(new Request(`${origin}/api/gather/radar`), mockCtx),
      proxyFn(new Request(`${origin}/api/proxy-image?url=https://example.com/a.png`), mockCtx),
    ]);
    for (const r of unauthResponses) {
      expect(r.status).toBe(401);
    }

    // 4. Login via modular auth function issues __Host-marrok_session cookie and authorizes modular posts & gather functions
    const loginRes = await authFn(
      new Request(`${origin}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({
          username: 'marrok-tester',
          password: 'test-password-123!',
        }),
      }),
      mockCtx
    );
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers.get('set-cookie') || '';
    expect(setCookie).toContain('__Host-marrok_session=');
    const cookiePair = setCookie.split(';')[0];

    const authedRadar = await gatherFn(
      new Request(`${origin}/api/gather/radar`, {
        headers: { Origin: origin, Cookie: cookiePair },
      }),
      mockCtx
    );
    expect(authedRadar.status).toBe(200);
    const radarBody = await authedRadar.json();
    expect(radarBody.ok).toBe(true);
  });

  it('enforces auth fail-closed on POST /api/direct-visual and returns sibling-diverse, exclusion-aware layout direction', async () => {
    const unauthRes = await fetch(`${baseUrl}/api/direct-visual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slide: { type: 'row', enTitle: 'Outage Postmortem Timeline', enBody: '14:02 UTC alert -> 14:15 UTC rollback' },
        slideIndex: 2,
        totalSlides: 6,
      }),
    });
    expect(unauthRes.status).toBe(401);

    const mockCtx = {} as any;
    const origin = 'https://marrok-content.netlify.app';
    const netlifyUnauth = await generateFn(
      new Request(`${origin}/api/direct-visual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({
          slide: { type: 'row', enTitle: 'Latency Benchmark', enBody: 'Go hit 450 req/s vs Rust 980 req/s' },
        }),
      }),
      mockCtx
    );
    expect(netlifyUnauth.status).toBe(401);

    const authedRes = await fetch(`${baseUrl}/api/direct-visual`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        slide: {
          type: 'row',
          enTitle: 'Hot Cache vs Disk Tiering',
          enBody: 'Keeping embeddings in RAM (1.2ms) versus NVMe disk (18ms) slashes tail latency.',
        },
        slideIndex: 2,
        totalSlides: 6,
        category: 'SYSTEMS ARCHITECTURE',
        postFormat: 'carousel',
        siblingLayouts: ['S2:compare', 'S4:row:topology'],
        excludeLayouts: ['row:topology', 'compare'],
      }),
    });
    expect(authedRes.status).toBe(200);
    expect(['ungrounded', 'offline']).toContain(authedRes.headers.get('x-marrok-engine'));

    const payload = await authedRes.json();
    expect(payload.chosenLayoutId).toBeTruthy();
    expect(payload.chosenLayoutId).not.toBe('row:topology');
    expect(payload.chosenLayoutId).not.toBe('compare');
    expect(payload.slideUpdates).toBeTruthy();
    expect(typeof payload.rationale).toBe('string');
  });
});

