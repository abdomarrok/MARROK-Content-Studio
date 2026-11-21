import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Server } from 'node:http';
import { app } from '../../../api/index.ts';
import netlifyApiHandler, * as netlifyApiModule from '../../../netlify/functions/api.ts';
import * as netlifyAuthModule from '../../../netlify/functions/auth.ts';
import {
  SESSION_COOKIE_NAME,
  createSignedSessionToken,
  hashPasswordScrypt,
  isValidScryptHashFormat,
  resetAuthStateForTest,
  verifyPasswordConstantTime,
} from './sessionAuth.ts';

describe('Phase A1 & A2: Universal API Auth, Login Hardening, Strict CORS & Netlify Gateway', () => {
  let server: Server;
  let baseUrl = '';

  const ADMIN_USER = 'marrok_owner';
  const ADMIN_PASS = 'Correct-Horse-Battery-99!';
  const SESSION_SECRET = '0123456789abcdef0123456789abcdef-marrok-session';
  const CRON_SECRET = 'cron-automation-secret-value-12345';
  const TG_SECRET = 'tg-webhook-secret-value-67890';

  const savedEnv = { ...process.env };

  function setValidAuthEnv() {
    process.env.ADMIN_USERNAME = ADMIN_USER;
    process.env.ADMIN_PASSWORD_HASH = hashPasswordScrypt(ADMIN_PASS);
    process.env.SESSION_SECRET = SESSION_SECRET;
    process.env.API_SHARED_SECRET = CRON_SECRET;
    process.env.TELEGRAM_WEBHOOK_SECRET = TG_SECRET;
    delete process.env.DEPLOY_CONTEXT;
    delete process.env.ALLOW_PREVIEW_WRITES;
  }

  beforeAll(async () => {
    setValidAuthEnv();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    process.env = { ...savedEnv };
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    resetAuthStateForTest();
    setValidAuthEnv();
  });

  it('verifies scrypt password hashes constantly and rejects mismatched hashes', () => {
    const hash = hashPasswordScrypt(ADMIN_PASS);
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(verifyPasswordConstantTime(ADMIN_PASS, hash)).toBe(true);
    expect(verifyPasswordConstantTime('wrong-password', hash)).toBe(false);
    expect(verifyPasswordConstantTime(ADMIN_PASS, 'invalid-format')).toBe(false);
  });

  it('fails CLOSED returning 503 across API and login routes when auth secrets are missing', async () => {
    delete process.env.SESSION_SECRET;
    delete process.env.ADMIN_PASSWORD_HASH;

    const getPosts = await fetch(`${baseUrl}/api/posts`);
    expect(getPosts.status).toBe(503);

    const postWrite = await fetch(`${baseUrl}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(postWrite.status).toBe(503);

    const loginAttempt = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    expect(loginAttempt.status).toBe(503);

    const sessionCheck = await fetch(`${baseUrl}/api/auth/session`);
    expect(sessionCheck.status).toBe(503);
  });

  it('fails CLOSED returning 503 when ADMIN_PASSWORD_HASH has a malformed scrypt$ format', async () => {
    const validHash = hashPasswordScrypt(ADMIN_PASS);
    expect(isValidScryptHashFormat(validHash)).toBe(true);
    expect(isValidScryptHashFormat('scrypt$truncated')).toBe(false);
    expect(isValidScryptHashFormat(`scrypt$$${'a'.repeat(128)}`)).toBe(false);
    expect(isValidScryptHashFormat(`scrypt$${'z'.repeat(32)}$${'a'.repeat(128)}`)).toBe(false);

    process.env.ADMIN_PASSWORD_HASH = `scrypt$$${'a'.repeat(128)}`;

    const sessionCheck = await fetch(`${baseUrl}/api/auth/session`);
    expect(sessionCheck.status).toBe(503);
    const sessionBody = (await sessionCheck.json()) as { authConfigured?: boolean };
    expect(sessionBody.authConfigured).toBe(false);

    const loginAttempt = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    expect(loginAttempt.status).toBe(503);
  });

  it('rejects unauthenticated requests (401) across ALL protected /api/* routes (GET & POST/PATCH/DELETE)', async () => {
    const protectedEndpoints: Array<{ method: string; path: string; body?: unknown }> = [
      { method: 'GET', path: '/api/posts' },
      { method: 'GET', path: '/api/posts/post_123' },
      { method: 'POST', path: '/api/posts', body: {} },
      { method: 'PATCH', path: '/api/posts/post_123/status', body: { postStatus: 'posted' } },
      { method: 'DELETE', path: '/api/posts/post_123' },
      { method: 'GET', path: '/api/publish/status' },
      { method: 'GET', path: '/api/publish/tiktok-music' },
      { method: 'POST', path: '/api/publish/upload-media', body: {} },
      { method: 'POST', path: '/api/publish/dispatch', body: {} },
      { method: 'POST', path: '/api/publish/manage-post', body: {} },
      { method: 'POST', path: '/api/publish/recover', body: {} },
      { method: 'POST', path: '/api/publish/cleanup-media', body: {} },
      { method: 'GET', path: '/api/gather/radar' },
      { method: 'POST', path: '/api/gather/extract-url', body: { url: 'https://example.com' } },
      { method: 'POST', path: '/api/gather/autopilot', body: {} },
      { method: 'POST', path: '/api/gather/telegram-webhook', body: {} },
      { method: 'GET', path: '/api/proxy-image?url=https://example.com/a.png' },
      { method: 'GET', path: '/api/search-media?q=rust' },
      { method: 'POST', path: '/api/generate', body: { prompt: 'Rust systems engineering performance notes' } },
      { method: 'POST', path: '/api/generate-image', body: { prompt: 'blueprint diagram' } },
      { method: 'POST', path: '/api/refine-slide', body: {} },
    ];

    for (const ep of protectedEndpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: ep.body ? { 'Content-Type': 'application/json' } : undefined,
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      expect(res.status, `${ep.method} ${ep.path} must require authentication`).toBe(401);
    }
  });

  it('issues strict __Host- HttpOnly Secure SameSite=Lax cookie without Domain, checks expiry, and revokes on logout', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers.get('set-cookie') || '';
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie.toLowerCase()).not.toContain('domain=');

    const cookiePair = setCookie.split(';')[0];

    // Authenticated GET /api/posts works cleanly
    const authedPosts = await fetch(`${baseUrl}/api/posts`, {
      headers: { Cookie: cookiePair },
    });
    expect(authedPosts.status).not.toBe(401);
    expect(authedPosts.status).toBe(200);

    // Expired token is rejected
    const expired = createSignedSessionToken(
      ADMIN_USER,
      SESSION_SECRET,
      60,
      Date.now() - 120_000
    );
    const expiredRes = await fetch(`${baseUrl}/api/posts`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(expired.token)}` },
    });
    expect(expiredRes.status).toBe(401);

    // Logout revokes token jti and rejects subsequent replay
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookiePair },
    });
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers.get('set-cookie') || '').toContain('Max-Age=0');

    const replayRes = await fetch(`${baseUrl}/api/posts`, {
      headers: { Cookie: cookiePair },
    });
    expect(replayRes.status).toBe(401);
  });

  it('enforces failed-attempt rate limit and temporary 429 lockout with Retry-After', async () => {
    for (let i = 0; i < 4; i++) {
      const failRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: ADMIN_USER, password: `bad-guess-${i}` }),
      });
      expect(failRes.status).toBe(401);
    }

    const fifthRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: 'bad-guess-5' }),
    });
    expect(fifthRes.status).toBe(429);
    expect(Number(fifthRes.headers.get('retry-after'))).toBeGreaterThan(0);

    // Even valid password is blocked during active lockout
    const lockedValidRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    expect(lockedValidRes.status).toBe(429);
  });

  it('allows cron/webhook secrets strictly on designated routes and never on /api/posts', async () => {
    const rejectedPosts = await fetch(`${baseUrl}/api/posts`, {
      headers: { 'x-api-secret': CRON_SECRET },
    });
    expect(rejectedPosts.status).toBe(401);

    const badWebhook = await fetch(`${baseUrl}/api/gather/telegram-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-bot-api-secret-token': 'wrong-secret',
      },
      body: JSON.stringify({}),
    });
    expect(badWebhook.status).toBe(401);

    const validCleanup = await fetch(`${baseUrl}/api/publish/cleanup-media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-secret': CRON_SECRET,
      },
      body: JSON.stringify({}),
    });
    expect(validCleanup.status).not.toBe(401);

    const validRecover = await fetch(`${baseUrl}/api/publish/recover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-secret': CRON_SECRET,
      },
      body: JSON.stringify({}),
    });
    expect(validRecover.status).not.toBe(401);
  });

  it('enforces strict CORS allowlist and rejects cross-origin writes from unauthorized origins', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    const cookiePair = (loginRes.headers.get('set-cookie') || '').split(';')[0];

    const evilWrite = await fetch(`${baseUrl}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://malicious.attacker.org',
        Cookie: cookiePair,
      },
      body: JSON.stringify({}),
    });
    expect(evilWrite.status).toBe(403);
    expect(evilWrite.headers.get('access-control-allow-origin')).toBeNull();

    const allowedRead = await fetch(`${baseUrl}/api/posts`, {
      headers: {
        Origin: 'https://marrok-content.netlify.app',
        Cookie: cookiePair,
      },
    });
    expect(allowedRead.status).toBe(200);
    expect(allowedRead.headers.get('access-control-allow-origin')).toBe(
      'https://marrok-content.netlify.app'
    );
  });

  it('blocks production DB/publish writes inside Deploy Preview contexts', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    });
    const cookiePair = (loginRes.headers.get('set-cookie') || '').split(';')[0];

    process.env.DEPLOY_CONTEXT = 'deploy-preview';
    const previewWrite = await fetch(`${baseUrl}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookiePair,
      },
      body: JSON.stringify({}),
    });
    expect(previewWrite.status).toBe(403);
  });

  it('bridges Netlify Functions v2 Web Request/Response directly on /api/* (never HTML fallback)', async () => {
    const unauth = await netlifyApiHandler(
      new Request('https://marrok-content.netlify.app/api/posts'),
      {} as never
    );
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get('content-type') || '').toContain('application/json');

    const login = await netlifyApiHandler(
      new Request('https://marrok-content.netlify.app/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://marrok-content.netlify.app',
        },
        body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
      }),
      {} as never
    );
    expect(login.status).toBe(200);
    const cookieHeader = (login.headers.get('set-cookie') || '').split(';')[0];
    expect(cookieHeader).toContain(`${SESSION_COOKIE_NAME}=`);

    const authed = await netlifyApiHandler(
      new Request('https://marrok-content.netlify.app/api/posts', {
        headers: {
          origin: 'https://marrok-content.netlify.app',
          cookie: cookieHeader,
        },
      }),
      {} as never
    );
    expect(authed.status).toBe(200);
    expect(authed.headers.get('access-control-allow-origin')).toBe(
      'https://marrok-content.netlify.app'
    );
  });

  it('exports named D.handler(event, context) for ___netlify-bootstrap.mjs Lambda invocations', async () => {
    expect(typeof netlifyApiModule.handler).toBe('function');
    expect(typeof netlifyAuthModule.handler).toBe('function');

    const sessionRes = await netlifyAuthModule.handler({
      httpMethod: 'GET',
      path: '/api/auth/session',
      rawUrl: 'https://marrok-content.netlify.app/.netlify/functions/api/auth/session',
      headers: {
        host: 'marrok-content.netlify.app',
        origin: 'https://marrok-content.netlify.app',
      },
    });
    expect(sessionRes.statusCode).toBe(200);
    expect(JSON.parse(sessionRes.body)).toMatchObject({
      authenticated: false,
      authConfigured: true,
    });

    const loginRes = await netlifyApiModule.handler({
      httpMethod: 'POST',
      path: '/.netlify/functions/api/auth/login',
      rawUrl: 'https://marrok-content.netlify.app/.netlify/functions/api/auth/login',
      headers: {
        host: 'marrok-content.netlify.app',
        origin: 'https://marrok-content.netlify.app',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
      isBase64Encoded: false,
    });
    expect(loginRes.statusCode).toBe(200);
    const setCookieHeader =
      loginRes.multiValueHeaders?.['Set-Cookie']?.[0] ||
      loginRes.headers['set-cookie'] ||
      '';
    expect(setCookieHeader).toContain(`${SESSION_COOKIE_NAME}=`);

    const cookiePair = setCookieHeader.split(';')[0];
    const postsRes = await netlifyApiModule.handler({
      httpMethod: 'GET',
      path: '/.netlify/functions/api/posts',
      rawUrl: 'https://marrok-content.netlify.app/.netlify/functions/api/posts',
      headers: {
        host: 'marrok-content.netlify.app',
        origin: 'https://marrok-content.netlify.app',
        cookie: cookiePair,
      },
    });
    expect(postsRes.statusCode).toBe(200);
    const parsedPosts = JSON.parse(postsRes.body);
    expect(Array.isArray(parsedPosts.posts)).toBe(true);
  });
});
