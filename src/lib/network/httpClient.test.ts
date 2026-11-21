import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchJsonWithTimeout,
  HttpClientError,
  withRetry,
} from './httpClient.ts';

describe('Shared HTTP Client (httpClient)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
});
