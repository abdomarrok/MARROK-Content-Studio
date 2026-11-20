import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkClientAuthSession,
  clearClientSessionToken,
  getClientSessionToken,
  submitClientLogin,
} from './clientSessionToken.ts';

describe('clientSessionToken: proxy 503 HTML intercept & auth session helpers', () => {
  beforeEach(() => {
    clearClientSessionToken();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects Nginx HTTP 200 HTML warmup intercept when /api/health is OK as unconfigured auth (HTTP 503)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url === '/api/auth/session') {
        return new Response('<!doctype html><html><title>Starting Server...</title></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      if (url === '/api/health') {
        return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('', { status: 404 });
    });

    const session = await checkClientAuthSession();
    expect(session.authenticated).toBe(false);
    expect(session.authConfigured).toBe(false);
    expect(session.warmingUp).toBeUndefined();
  });

  it('marks warmingUp when both /api/auth/session and /api/health return proxy HTML', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<!doctype html><html><title>Starting Server...</title></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const session = await checkClientAuthSession();
    expect(session.authenticated).toBe(false);
    expect(session.authConfigured).toBe(true);
    expect(session.warmingUp).toBe(true);
  });

  it('returns clear unconfigured auth message instead of "Sign-in failed (200)" on intercepted login', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url === '/api/auth/login') {
        return new Response('<!doctype html><html><title>Starting Server...</title></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      if (url === '/api/health') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('', { status: 404 });
    });

    const login = await submitClientLogin('admin', 'secret');
    expect(login.ok).toBe(false);
    expect(login.authConfigured).toBe(false);
    expect(login.error).toContain('ADMIN_USERNAME');
    expect(login.error).not.toContain('Sign-in failed (200)');
  });

  it('stores bearer session token on successful login and surfaces invalid credentials on 401', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Invalid credentials.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authenticated: true,
            username: 'admin',
            token: 'payload.sig123',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );

    const failed = await submitClientLogin('admin', 'wrong');
    expect(failed).toEqual({
      ok: false,
      authConfigured: true,
      error: 'Invalid credentials.',
    });

    const succeeded = await submitClientLogin('admin', 'right');
    expect(succeeded).toEqual({
      ok: true,
      authConfigured: true,
      username: 'admin',
    });
    expect(getClientSessionToken()).toBe('payload.sig123');
  });
});
