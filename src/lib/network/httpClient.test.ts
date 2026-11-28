import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchAuthedJson,
  fetchJsonWithTimeout,
  getCustomGeminiHeaders,
  HttpClientError,
  withRetry,
} from './httpClient.ts';
import {
  clearClientSessionToken,
  setClientSessionToken,
} from '../security/clientSessionToken.ts';

describe('Shared HTTP Client (httpClient)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearClientSessionToken();
    try {
      window.localStorage.removeItem('marrok_custom_gemini_key');
      window.localStorage.removeItem('marrok_custom_gemini_backup_key');
    } catch {
      // ignore in non-browser envs
    }
  });

  it('parses valid JSON responses and passes headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, count: 3 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const data = await fetchJsonWithTimeout<{ ok: boolean; count: number }>(
      'https://example.com/api/items',
      {
        headers: { Authorization: 'Bearer token-1' },
        contextLabel: 'Items API',
      }
    );

    expect(data).toEqual({ ok: true, count: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
  });

  it('detects HTML proxy/warmup responses and throws HttpClientError with isHtmlResponse=true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!doctype html><html><body>Warming up</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      )
    );

    await expect(
      fetchJsonWithTimeout('https://example.com/api/posts', { contextLabel: 'Vault Sync' })
    ).rejects.toMatchObject({
      name: 'HttpClientError',
      isHtmlResponse: true,
      status: 200,
    });
  });

  it('surfaces JSON error messages on non-2xx responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Upstream quota exceeded' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    await expect(
      fetchJsonWithTimeout('https://example.com/api/music', { contextLabel: 'Music API' })
    ).rejects.toMatchObject({
      name: 'HttpClientError',
      status: 429,
      message: 'Upstream quota exceeded',
    });
  });

  it('retries transient 503 failures and does not retry 401 auth errors', async () => {
    let transientCalls = 0;
    const result = await withRetry(
      async () => {
        transientCalls++;
        if (transientCalls < 3) {
          throw new HttpClientError('Service unavailable', {
            status: 503,
            url: 'https://example.com/read',
          });
        }
        return 'ok';
      },
      { retries: 2, baseDelayMs: 1 }
    );
    expect(result).toBe('ok');
    expect(transientCalls).toBe(3);

    let authCalls = 0;
    await expect(
      withRetry(
        async () => {
          authCalls++;
          throw new HttpClientError('Unauthorized', {
            status: 401,
            url: 'https://example.com/read',
          });
        },
        { retries: 3, baseDelayMs: 1 }
      )
    ).rejects.toThrow('Unauthorized');
    expect(authCalls).toBe(1);
  });

  it('fetchAuthedJson injects credentials, Bearer token, JSON body, and optional Gemini headers', async () => {
    setClientSessionToken('session-tok-abc');
    window.localStorage.setItem('marrok_custom_gemini_key', 'AIzaPrimary123');
    window.localStorage.setItem('marrok_custom_gemini_backup_key', 'AIzaBackup456');

    expect(getCustomGeminiHeaders()).toEqual({
      'x-gemini-key': 'AIzaPrimary123',
      'x-gemini-backup-key': 'AIzaBackup456',
    });

    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ saved: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    // Without includeGeminiKeys
    const res1 = await fetchAuthedJson<{ saved: boolean }>('/api/posts', {
      method: 'POST',
      body: { id: 'p-1' },
    });
    expect(res1).toEqual({ saved: true });
    const [, init1] = fetchMock.mock.calls[0];
    expect(init1.credentials).toBe('include');
    expect(init1.body).toBe(JSON.stringify({ id: 'p-1' }));
    const h1 = init1.headers as Record<string, string>;
    expect(h1.Authorization).toBe('Bearer session-tok-abc');
    expect(h1['Content-Type']).toBe('application/json');
    expect(h1['x-gemini-key']).toBeUndefined();

    // With includeGeminiKeys: true
    await fetchAuthedJson<{ saved: boolean }>('/api/refine-slide', {
      method: 'POST',
      body: { mode: 'sync_ar' },
      includeGeminiKeys: true,
    });
    const [, init2] = fetchMock.mock.calls[1];
    const h2 = init2.headers as Record<string, string>;
    expect(h2['x-gemini-key']).toBe('AIzaPrimary123');
    expect(h2['x-gemini-backup-key']).toBe('AIzaBackup456');
  });

  it('fetchAuthedJson NEVER retries any 4xx response (400/401/403/404/409/413/422) even when retries > 0', async () => {
    for (const status of [400, 401, 403, 404, 409, 413, 422]) {
      const fetchMock = vi.fn().mockImplementation(async () =>
        new Response(JSON.stringify({ error: `HTTP ${status} failure` }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        fetchAuthedJson(`/api/test-${status}`, {
          retries: 2,
          retryDelayMs: 1,
        })
      ).rejects.toMatchObject({
        name: 'HttpClientError',
        status,
        message: `HTTP ${status} failure`,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('fetchAuthedJson retries transient 503 when retries > 0 and aborts cleanly on timeout', async () => {
    let attempts = 0;
    const retryMock = vi.fn().mockImplementation(async () => {
      attempts++;
      if (attempts === 1) {
        return new Response(JSON.stringify({ error: 'Temporarily unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', retryMock);

    const data = await fetchAuthedJson<{ ok: boolean }>('/api/flaky', {
      retries: 1,
      retryDelayMs: 1,
    });
    expect(data).toEqual({ ok: true });
    expect(retryMock).toHaveBeenCalledTimes(2);

    // Timeout aborts via AbortController and does NOT retry
    const slowMock = vi.fn().mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason ?? new DOMException('Timed out', 'TimeoutError'));
          });
        })
    );
    vi.stubGlobal('fetch', slowMock);

    await expect(
      fetchAuthedJson('/api/slow', {
        timeoutMs: 15,
        retries: 2,
        retryDelayMs: 1,
      })
    ).rejects.toThrow();
    expect(slowMock).toHaveBeenCalledTimes(1);
  });
});
