import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'node:http';
import dns from 'node:dns';
import { app } from '../../../api/index.ts';
import { shouldSyncWithRemoteVault } from '../../../api/controllers/postsController.ts';
import {
  handleUploadPublishMedia,
  validateStagingSlideDataUrl,
} from '../../../api/controllers/publishController.ts';
import { fetchSafeRemoteText } from '../../../api/controllers/proxyController.ts';
import { fetchCustomRssFeed } from '../../../api/controllers/mediaController.ts';
import { resolvePostgresSslConfig } from '../../../api/db/postgres.ts';
import { hashPasswordScrypt } from './sessionAuth.ts';

describe('Phase A3–A7 Security Hardening: Remote Vault, Cloudinary Upload, RSS SSRF & DB TLS', () => {
  let server: Server;
  let baseUrl = '';
  const savedEnv = { ...process.env };
  const ADMIN_USER = 'marrok_owner';
  const ADMIN_PASS = 'Hardened-Pass-2026!';

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.ADMIN_USERNAME = ADMIN_USER;
    process.env.ADMIN_PASSWORD_HASH = hashPasswordScrypt(ADMIN_PASS);
    process.env.SESSION_SECRET = 'phase-a-session-secret-0123456789abcdef';
    delete process.env.REMOTE_VAULT_ORIGIN;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    delete process.env.PG_CA_CERT;
    delete process.env.DATABASE_CA_CERT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...savedEnv };
  });

  it('A3: remote vault sync is permanently retired in Phase 2.2 and returns null unconditionally', () => {
    const cleanEnv = { NODE_ENV: 'production' } as NodeJS.ProcessEnv;
    expect(shouldSyncWithRemoteVault(cleanEnv)).toBeNull();

    const withVercelUnset = { ...cleanEnv, REMOTE_VAULT_ORIGIN: '' } as NodeJS.ProcessEnv;
    expect(shouldSyncWithRemoteVault(withVercelUnset)).toBeNull();

    const withPrivateTarget = {
      ...cleanEnv,
      REMOTE_VAULT_ORIGIN: 'https://127.0.0.1:8080',
    } as NodeJS.ProcessEnv;
    expect(shouldSyncWithRemoteVault(withPrivateTarget)).toBeNull();

    const withValidOrigin = {
      ...cleanEnv,
      REMOTE_VAULT_ORIGIN: 'https://vault.marrok-content.netlify.app/',
    } as NodeJS.ProcessEnv;
    expect(shouldSyncWithRemoteVault(withValidOrigin)).toBeNull();
  });

  it('A4: rejects unconfigured Cloudinary uploads with explicit 503 and validates MIME and byte size', async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });

    try {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
      });
      expect(loginRes.status).toBe(200);
      const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const uploadUnconfigured = await fetch(`${baseUrl}/api/publish/upload-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          postId: 'test_post_1',
          slides: [{ index: 0, dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }],
        }),
      });
      expect(uploadUnconfigured.status).toBe(503);
      const errBody = (await uploadUnconfigured.json()) as { error?: string };
      expect(errBody.error).toContain('Cloudinary media staging is not configured');

      // Ensure uguu.se was NEVER called
      const calledUrls = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(calledUrls.some((u) => u.includes('uguu.se'))).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // MIME check: SVG or HTML data URLs rejected with 415
    expect(validateStagingSlideDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=').ok).toBe(false);
    expect(validateStagingSlideDataUrl('data:text/html;base64,PHNjcmlwdD4=').ok).toBe(false);
    expect(validateStagingSlideDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toMatchObject({
      ok: true,
      mimeType: 'image/jpeg',
    });

    // Oversize > 4 MB rejected cleanly with 413
    const hugeB64 = Buffer.alloc(4 * 1024 * 1024 + 64, 0xff).toString('base64');
    const oversizeCheck = validateStagingSlideDataUrl(`data:image/jpeg;base64,${hugeB64}`);
    expect(oversizeCheck).toMatchObject({ ok: false, status: 413 });

    // Controller direct check returns 415 on disallowed MIME when Cloudinary env IS configured
    process.env.CLOUDINARY_CLOUD_NAME = 'marrok_cloud';
    process.env.CLOUDINARY_API_KEY = 'cld_key';
    process.env.CLOUDINARY_API_SECRET = 'cld_secret';
    let controllerStatus = 200;
    let controllerJson: unknown = null;
    await handleUploadPublishMedia(
      {
        body: {
          postId: 'post_mime_test',
          slides: [{ index: 0, dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }],
        },
      } as never,
      {
        status(code: number) {
          controllerStatus = code;
          return this;
        },
        json(payload: unknown) {
          controllerJson = payload;
          return this;
        },
      } as never
    );
    expect(controllerStatus).toBe(415);
    expect((controllerJson as { error?: string })?.error).toContain('Unsupported slide MIME type');
  });

  it('A5: blocks RSS/URL 302 redirects to 169.254.169.254 and 127.0.0.1, enforces hop limits, and caps response size', async () => {
    vi.spyOn(dns.promises, 'lookup').mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ] as never);

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: unknown) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url === 'https://evil-redirector.example.com/feed.xml') {
        return new Response('', {
          status: 302,
          headers: { Location: 'https://169.254.169.254/latest/meta-data/iam/security-credentials/' },
        });
      }
      if (url === 'https://loopback-redirect.example.com/feed.xml') {
        return new Response('', {
          status: 301,
          headers: { Location: 'http://127.0.0.1:8080/internal-admin' },
        });
      }
      if (url.startsWith('https://hop-loop.example.com/')) {
        const hopNum = Number(url.split('hop=')[1] || '0');
        return new Response('', {
          status: 302,
          headers: { Location: `https://hop-loop.example.com/?hop=${hopNum + 1}` },
        });
      }
      if (url === 'https://giant-feed.example.com/huge.xml') {
        const giantXml = `<rss><channel><item><title>OK</title><description>${'A'.repeat(
          250_000
        )}</description></item></channel></rss>`;
        return new Response(giantXml, {
          status: 200,
          headers: { 'Content-Type': 'application/xml' },
        });
      }
      return new Response('Unexpected fetch target in SSRF test', { status: 500 });
    });

    // 1. Redirect to AWS/GCP/Azure metadata IP 169.254.169.254 must throw/block BEFORE second fetch
    await expect(fetchSafeRemoteText('https://evil-redirector.example.com/feed.xml')).rejects.toThrow(
      /SSRF_BLOCKED/i
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://evil-redirector.example.com/feed.xml',
      expect.objectContaining({ redirect: 'manual' })
    );

    // 2. RSS wrapper returns [] safely on redirect to 169.254.169.254 or 127.0.0.1
    const rssMetaItems = await fetchCustomRssFeed('https://evil-redirector.example.com/feed.xml');
    expect(rssMetaItems).toEqual([]);
    const rssLoopbackItems = await fetchCustomRssFeed('https://loopback-redirect.example.com/feed.xml');
    expect(rssLoopbackItems).toEqual([]);
    // Verify 169.254.169.254 and 127.0.0.1 were NEVER fetched
    const calledUrls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes('169.254.169.254') || u.includes('127.0.0.1'))).toBe(
      false
    );

    // 3. Hop limit stops redirect chains (> maxHops = 3)
    await expect(
      fetchSafeRemoteText('https://hop-loop.example.com/?hop=0', { maxHops: 2 })
    ).rejects.toThrow(/Exceeded maximum redirect hops/i);

    // 4. Response byte size cap truncates stream safely when rejectOversize=false and throws when true
    const capped = await fetchSafeRemoteText('https://giant-feed.example.com/huge.xml', {
      maxBytes: 1024,
    });
    expect(capped.byteLength).toBeLessThanOrEqual(1024);

    await expect(
      fetchSafeRemoteText('https://giant-feed.example.com/huge.xml', {
        maxBytes: 1024,
        rejectOversize: true,
      })
    ).rejects.toThrow(/RESPONSE_TOO_LARGE/i);
  });

  it('A6: enforces rejectUnauthorized=true on Neon/Postgres TLS connections with optional CA cert', () => {
    const neonSsl = resolvePostgresSslConfig(
      'postgresql://user:pass@ep-cool-rain-12345.us-east-2.aws.neon.tech/neondb?sslmode=require'
    );
    expect(neonSsl).toEqual({ rejectUnauthorized: true });

    const withCa = resolvePostgresSslConfig(
      'postgresql://user:pass@ep-cool-rain.aws.neon.tech/neondb',
      {
        PG_CA_CERT: '-----BEGIN CERTIFICATE-----\\nTESTCA\\n-----END CERTIFICATE-----',
      } as NodeJS.ProcessEnv
    );
    expect(withCa).toEqual({
      rejectUnauthorized: true,
      ca: '-----BEGIN CERTIFICATE-----\nTESTCA\n-----END CERTIFICATE-----',
    });

    const localDisabled = resolvePostgresSslConfig(
      'postgresql://postgres:postgres@localhost:5432/marrok_dev?sslmode=disable'
    );
    expect(localDisabled).toBe(false);
  });
});
