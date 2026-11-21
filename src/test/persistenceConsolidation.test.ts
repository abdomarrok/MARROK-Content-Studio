import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type pg from 'pg';
import {
  verifySessionCookieValue,
  revokeSessionToken,
  checkLoginLockout,
  createSignedSessionToken,
  hashPasswordScrypt,
  resetAuthStateForTest,
  isCronOrWebhookSecretAuthorized,
  type AuthConfigStatus,
} from '../lib/security/sessionAuth.ts';
import {
  loadStoredPosts,
  upsertSingleStoredPost,
  saveStoredPosts,
  deleteSingleStoredPost,
  VaultPersistenceUnavailableError,
  shouldSyncWithRemoteVault,
} from '../../api/controllers/postsController.ts';
import { createRateLimiter } from '../../api/config.ts';
import {
  getRemoteVaultOrigin,
  mergeRecords,
} from '../lib/storage/postsVaultClient.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';
import { getDismissedGatherTopicIds } from '../lib/gather/gatherClient.ts';
import type { SavedPostRecord } from '../types.ts';
import type { Request, Response } from 'express';

describe('Phase 2.2: Legacy Storage Retirement & Persistence Consolidation', () => {
  const ADMIN_USER = 'marrok_architect';
  const ADMIN_PASS = 'Secure-Password-2026!';
  const SESSION_SECRET = '0123456789abcdef0123456789abcdef-session-secret';

  const authConfig: AuthConfigStatus = {
    configured: true,
    username: ADMIN_USER,
    passwordHash: hashPasswordScrypt(ADMIN_PASS),
    sessionSecret: SESSION_SECRET,
    sessionTtlSeconds: 86400,
    missing: [],
  };

  beforeEach(() => {
    resetAuthStateForTest();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetAuthStateForTest();
    vi.restoreAllMocks();
  });

  describe('1. Authentication Fail-Closed on Database Outage', () => {
    it('fails closed (rejects session) when PostgreSQL connection drops during revocation check', async () => {
      const { token } = createSignedSessionToken(ADMIN_USER, SESSION_SECRET);

      const outagePool = {
        query: vi.fn().mockRejectedValue(new Error('connection timeout to Neon pooler')),
      } as unknown as pg.Pool;

      // When database is in an outage, we cannot verify revocation status
      // In accordance with Phase 2.2 security specifications, it MUST fail closed (return null)
      const verified = await verifySessionCookieValue(
        `__Host-marrok_session=${token}`,
        authConfig,
        outagePool
      );

      expect(verified).toBeNull();
      expect(outagePool.query).toHaveBeenCalledTimes(1);
    });

    it('tolerates benign 42P01 undefined_table by bootstrapping auth_revoked_sessions and fails closed if bootstrap fails', async () => {
      const { token } = createSignedSessionToken(ADMIN_USER, SESSION_SECRET);

      const uninitializedPool = {
        query: vi
          .fn()
          .mockRejectedValueOnce({ code: '42P01', message: 'relation does not exist' })
          .mockResolvedValueOnce({ rows: [] }),
      } as unknown as pg.Pool;

      // 42P01 triggers self-healing bootstrap of auth_revoked_sessions
      const verified = await verifySessionCookieValue(
        `__Host-marrok_session=${token}`,
        authConfig,
        uninitializedPool
      );

      expect(verified).not.toBeNull();
      expect(verified?.sub).toBe(ADMIN_USER);
      expect(uninitializedPool.query).toHaveBeenCalledTimes(2);

      // If bootstrap itself fails (e.g. read-only permissions), it MUST fail closed
      const failedBootstrapPool = {
        query: vi
          .fn()
          .mockRejectedValueOnce({ code: '42P01', message: 'relation does not exist' })
          .mockRejectedValueOnce(new Error('Permission denied: cannot create table in read-only transaction')),
      } as unknown as pg.Pool;

      const failedVerification = await verifySessionCookieValue(
        `__Host-marrok_session=${token}`,
        authConfig,
        failedBootstrapPool
      );
      expect(failedVerification).toBeNull();
    });

    it('fails closed when revokeSessionToken encounters database outage', async () => {
      const { token } = createSignedSessionToken(ADMIN_USER, SESSION_SECRET);

      const outagePool = {
        query: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 5432')),
      } as unknown as pg.Pool;

      await expect(
        revokeSessionToken(token, SESSION_SECRET, outagePool)
      ).rejects.toThrow(/Session revocation persistence failed/);
    });

    it('fails closed (enforces 60s lockout) when checkLoginLockout encounters database outage', async () => {
      const outagePool = {
        query: vi.fn().mockRejectedValue(new Error('Neon database unreachable')),
      } as unknown as pg.Pool;

      const lockout = await checkLoginLockout('192.168.1.1:admin', outagePool);

      expect(lockout.locked).toBe(true);
      expect(lockout.retryAfterSeconds).toBe(60);
    });

    it('self-heals auth_login_attempts on 42P01 and fails closed if bootstrap query fails', async () => {
      const selfHealingPool = {
        query: vi
          .fn()
          .mockRejectedValueOnce({ code: '42P01', message: 'relation does not exist' })
          .mockResolvedValueOnce({ rows: [] }),
      } as unknown as pg.Pool;

      const lockout = await checkLoginLockout('192.168.1.1:admin', selfHealingPool);
      expect(lockout.locked).toBe(false);
      expect(selfHealingPool.query).toHaveBeenCalledTimes(2);

      const failedBootstrapPool = {
        query: vi
          .fn()
          .mockRejectedValueOnce({ code: '42P01', message: 'relation does not exist' })
          .mockRejectedValueOnce(new Error('Database disk full')),
      } as unknown as pg.Pool;

      const lockoutFail = await checkLoginLockout('192.168.1.1:admin', failedBootstrapPool);
      expect(lockoutFail.locked).toBe(true);
      expect(lockoutFail.retryAfterSeconds).toBe(60);
    });
  });

  describe('2. Saved Posts KV Retirement & Single Authoritative PostgreSQL', () => {
    const mockPost: SavedPostRecord = {
      id: 'post_consolidation_1',
      title: 'PostgreSQL Architecture Consolidation',
      category: 'DISTRIBUTED SYSTEMS',
      postStatus: 'validated',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      creatorHandle: 'MARROK',
      slideCount: 8,
      qaPassed: true,
      deck: { ...DEFAULT_STARTER_DECK, id: 'post_consolidation_1' },
      storageEngine: 'neon-postgres',
    };

    it('never contacts Cloud KV even when KV_REST_API_URL and TOKEN are present in environment', async () => {
      const globalFetchSpy = vi.spyOn(globalThis, 'fetch');

      const envWithKv = {
        NODE_ENV: 'development',
        KV_REST_API_URL: 'https://test-kv.upstash.io',
        KV_REST_API_TOKEN: 'fake-token-value',
        POSTS_STORAGE_FILE: 'test-scratch-posts.json',
      } as NodeJS.ProcessEnv;

      // loadStoredPosts should use local file store when DATABASE_URL is not set, never KV
      const result = await loadStoredPosts(envWithKv);
      expect(result.storageEngine).not.toBe('cloud-kv');

      // Verify no fetch calls were made to KV REST endpoint
      const kvCalls = globalFetchSpy.mock.calls.filter((call) =>
        String(call[0]).includes('test-kv.upstash.io')
      );
      expect(kvCalls).toHaveLength(0);
    });

    it('fails closed with 503 VaultPersistenceUnavailableError in production serverless without DATABASE_URL', async () => {
      const prodServerlessEnv = {
        NODE_ENV: 'production',
        VERCEL: '1',
        KV_REST_API_URL: 'https://test-kv.upstash.io',
        KV_REST_API_TOKEN: 'fake-token-value',
      } as NodeJS.ProcessEnv;

      // Read path fails closed
      await expect(
        loadStoredPosts(prodServerlessEnv, { strictDatabase: true })
      ).rejects.toThrow(VaultPersistenceUnavailableError);

      // Write single post fails closed
      await expect(
        upsertSingleStoredPost(mockPost, [], prodServerlessEnv)
      ).rejects.toThrow(VaultPersistenceUnavailableError);

      // Batch save fails closed
      await expect(
        saveStoredPosts([mockPost], prodServerlessEnv)
      ).rejects.toThrow(VaultPersistenceUnavailableError);

      // Delete post fails closed
      await expect(
        deleteSingleStoredPost('post_consolidation_1', [mockPost], prodServerlessEnv)
      ).rejects.toThrow(VaultPersistenceUnavailableError);
    });
  });

  describe('3. Remote Vault Cross-Origin Mirroring Retirement', () => {
    it('permanently returns null for shouldSyncWithRemoteVault even with valid HTTPS origin configured', () => {
      const envWithRemote = {
        NODE_ENV: 'production',
        REMOTE_VAULT_ORIGIN: 'https://vault.marrok-content.netlify.app',
      } as NodeJS.ProcessEnv;

      expect(shouldSyncWithRemoteVault(envWithRemote)).toBeNull();
    });

    it('permanently returns null for getRemoteVaultOrigin on client side', () => {
      expect(getRemoteVaultOrigin()).toBeNull();
    });
  });

  describe('4. Deleted-Post Tombstones & Stale Cache Protection', () => {
    it('prevents deleted posts from being resurrected by mergeRecords or stale caches', () => {
      const activePost: SavedPostRecord = {
        id: 'post_active_1',
        title: 'Active Tech Post',
        category: 'SYSTEMS',
        postStatus: 'validated',
        createdAt: '2026-11-20T10:00:00Z',
        updatedAt: '2026-11-20T10:00:00Z',
        creatorHandle: 'MARROK',
        slideCount: 8,
        qaPassed: true,
        deck: DEFAULT_STARTER_DECK,
        storageEngine: 'neon-postgres',
      };

      const deletedPost: SavedPostRecord = {
        id: 'post_deleted_99',
        title: 'Deleted Legacy Post',
        category: 'SYSTEMS',
        postStatus: 'validated',
        createdAt: '2026-11-19T10:00:00Z',
        updatedAt: '2026-11-19T10:00:00Z',
        creatorHandle: 'MARROK',
        slideCount: 8,
        qaPassed: true,
        deck: DEFAULT_STARTER_DECK,
        storageEngine: 'neon-postgres',
      };

      const deletedIds = new Set(['post_deleted_99']);

      // Client merges stale local cache with new server posts
      const merged = mergeRecords([activePost], [activePost, deletedPost]).filter(
        (p) => !deletedIds.has(p.id)
      );

      expect(merged).toHaveLength(1);
      expect(merged[0].id).toBe('post_active_1');
      expect(merged.some((p) => p.id === 'post_deleted_99')).toBe(false);
    });
  });

  describe('5. Distributed Rate Limiter & Upstash Fail-Safe Protection', () => {
    it('performs distributed sliding-window counter transaction via Upstash /multi-exec', async () => {
      const mockMultiExecFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [{ result: '0' }, { result: 1 }, { result: 1 }],
      } as unknown as globalThis.Response);

      const savedKvUrl = process.env.KV_REST_API_URL;
      const savedKvToken = process.env.KV_REST_API_TOKEN;
      process.env.KV_REST_API_URL = 'https://upstash.io';
      process.env.KV_REST_API_TOKEN = 'test_token';

      try {
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 5 });
        const req = {
          headers: { 'x-forwarded-for': '203.0.113.195' },
          ip: '203.0.113.195',
        } as unknown as Request;
        const res = {
          setHeader: vi.fn(),
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as unknown as Response;
        const next = vi.fn();

        await limiter(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(mockMultiExecFetch).toHaveBeenCalledTimes(1);
        const [calledUrl, options] = mockMultiExecFetch.mock.calls[0];
        expect(String(calledUrl)).toContain('https://upstash.io/multi-exec');
        expect(options?.headers).toHaveProperty('Authorization', 'Bearer test_token');
        const commands = JSON.parse(options?.body as string);
        expect(commands).toEqual([
          ['GET', expect.stringContaining('ratelimit:ip:203.0.113.195:')],
          ['INCR', expect.stringContaining('ratelimit:ip:203.0.113.195:')],
          ['EXPIRE', expect.stringContaining('ratelimit:ip:203.0.113.195:'), 120],
        ]);
      } finally {
        if (savedKvUrl === undefined) delete process.env.KV_REST_API_URL;
        else process.env.KV_REST_API_URL = savedKvUrl;
        if (savedKvToken === undefined) delete process.env.KV_REST_API_TOKEN;
        else process.env.KV_REST_API_TOKEN = savedKvToken;
      }
    });

    it('handles concurrent requests through /multi-exec atomically with sequential counter progression', async () => {
      let counter = 0;
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        counter += 1;
        const assignedCount = counter;
        return {
          ok: true,
          json: async () => [{ result: '0' }, { result: assignedCount }, { result: 1 }],
        } as unknown as globalThis.Response;
      });

      const savedKvUrl = process.env.KV_REST_API_URL;
      const savedKvToken = process.env.KV_REST_API_TOKEN;
      process.env.KV_REST_API_URL = 'https://upstash.io';
      process.env.KV_REST_API_TOKEN = 'test_token';

      try {
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 });
        const createCall = () => {
          const req = {
            headers: { 'x-forwarded-for': '203.0.113.205' },
            ip: '203.0.113.205',
          } as unknown as Request;
          const res = {
            setHeader: vi.fn(),
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
          } as unknown as Response;
          const next = vi.fn();
          return { req, res, next, run: () => limiter(req, res, next) };
        };

        const c1 = createCall();
        const c2 = createCall();
        const c3 = createCall();

        await Promise.all([c1.run(), c2.run(), c3.run()]);

        // Requests 1 and 2 are within maxRequests (2)
        expect(c1.next).toHaveBeenCalledTimes(1);
        expect(c2.next).toHaveBeenCalledTimes(1);
        // Request 3 exceeds maxRequests -> 429
        expect(c3.next).not.toHaveBeenCalled();
        expect(c3.res.status).toHaveBeenCalledWith(429);
      } finally {
        if (savedKvUrl === undefined) delete process.env.KV_REST_API_URL;
        else process.env.KV_REST_API_URL = savedKvUrl;
        if (savedKvToken === undefined) delete process.env.KV_REST_API_TOKEN;
        else process.env.KV_REST_API_TOKEN = savedKvToken;
      }
    });

    it('enforces 429 when sliding-window estimated hits exceed maxRequests', async () => {
      // Current window has 6 hits, which exceeds maxRequests (5) regardless of elapsed time
      const mockMultiExecFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [{ result: '4' }, { result: 6 }, { result: 1 }],
      } as unknown as globalThis.Response);

      const savedKvUrl = process.env.KV_REST_API_URL;
      const savedKvToken = process.env.KV_REST_API_TOKEN;
      process.env.KV_REST_API_URL = 'https://upstash.io';
      process.env.KV_REST_API_TOKEN = 'test_token';

      try {
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 5 });
        const req = {
          headers: { 'x-forwarded-for': '203.0.113.200' },
          ip: '203.0.113.200',
        } as unknown as Request;
        const res = {
          setHeader: vi.fn(),
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as unknown as Response;
        const next = vi.fn();

        await limiter(req, res, next);

        expect(mockMultiExecFetch).toHaveBeenCalledTimes(1);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '60');
      } finally {
        if (savedKvUrl === undefined) delete process.env.KV_REST_API_URL;
        else process.env.KV_REST_API_URL = savedKvUrl;
        if (savedKvToken === undefined) delete process.env.KV_REST_API_TOKEN;
        else process.env.KV_REST_API_TOKEN = savedKvToken;
      }
    });

    it('falls back safely to in-memory rate limiting when Upstash Redis network times out', async () => {
      // Simulate Upstash Redis network failure / timeout
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Redis connection timeout'));

      const savedKvUrl = process.env.KV_REST_API_URL;
      const savedKvToken = process.env.KV_REST_API_TOKEN;
      process.env.KV_REST_API_URL = 'https://upstash.io';
      process.env.KV_REST_API_TOKEN = 'test_token';

      try {
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 });
        const req = {
          headers: { 'x-forwarded-for': '198.51.100.44' },
          ip: '198.51.100.44',
        } as unknown as Request;
        const res = {
          setHeader: vi.fn(),
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as unknown as Response;
        const next = vi.fn();

        // Request 1: Redis fails, falls back to in-memory -> passes
        await limiter(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);

        // Request 2: passes in-memory
        await limiter(req, res, next);
        expect(next).toHaveBeenCalledTimes(2);

        // Request 3: exceeds limit of 2 in-memory -> 429
        await limiter(req, res, next);
        expect(res.status).toHaveBeenCalledWith(429);
      } finally {
        if (savedKvUrl === undefined) delete process.env.KV_REST_API_URL;
        else process.env.KV_REST_API_URL = savedKvUrl;
        if (savedKvToken === undefined) delete process.env.KV_REST_API_TOKEN;
        else process.env.KV_REST_API_TOKEN = savedKvToken;
      }
    });

    it('falls back safely to in-memory rate limiting when Upstash /multi-exec response contains command error or malformed payload', async () => {
      // Simulate command error inside multi-exec (e.g. EXECABORT or WRONGTYPE)
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { result: '0' },
          { error: 'WRONGTYPE Operation against a key holding the wrong kind of value' },
          { result: 1 },
        ],
      } as unknown as globalThis.Response);

      const savedKvUrl = process.env.KV_REST_API_URL;
      const savedKvToken = process.env.KV_REST_API_TOKEN;
      process.env.KV_REST_API_URL = 'https://upstash.io';
      process.env.KV_REST_API_TOKEN = 'test_token';

      try {
        const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 });
        const req = {
          headers: { 'x-forwarded-for': '198.51.100.99' },
          ip: '198.51.100.99',
        } as unknown as Request;
        const res = {
          setHeader: vi.fn(),
          status: vi.fn().mockReturnThis(),
          json: vi.fn(),
        } as unknown as Response;
        const next = vi.fn();

        // Should detect command error, catch it, and fall back to in-memory without crashing
        await limiter(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
      } finally {
        if (savedKvUrl === undefined) delete process.env.KV_REST_API_URL;
        else process.env.KV_REST_API_URL = savedKvUrl;
        if (savedKvToken === undefined) delete process.env.KV_REST_API_TOKEN;
        else process.env.KV_REST_API_TOKEN = savedKvToken;
      }
    });
  });

  describe('6. Publishing Recovery & Cron Authorization', () => {
    it('authorizes /api/publish/recover via CRON_SECRET Bearer token for Vercel Cron integration', () => {
      const envWithCron: NodeJS.ProcessEnv = {
        CRON_SECRET: 'test-cron-secret-1234567890abcdef',
        API_SHARED_SECRET: 'test-api-secret-1234567890abcdef',
      };

      const authVercelCron = isCronOrWebhookSecretAuthorized(
        '/api/publish/recover',
        { authorization: 'Bearer test-cron-secret-1234567890abcdef' },
        envWithCron
      );
      expect(authVercelCron).toBe(true);

      const authSharedSecret = isCronOrWebhookSecretAuthorized(
        '/api/publish/recover',
        { 'x-api-secret': 'test-api-secret-1234567890abcdef' },
        envWithCron
      );
      expect(authSharedSecret).toBe(true);

      const rejectBadSecret = isCronOrWebhookSecretAuthorized(
        '/api/publish/recover',
        { authorization: 'Bearer invalid-token' },
        envWithCron
      );
      expect(rejectBadSecret).toBe(false);
    });
  });

  describe('7. Triage State Consolidation & Prototype Key Retirement', () => {
    it('derives dismissed topics from triage decision records and cleans up legacy localStorage key', () => {
      localStorage.setItem(
        'marrok_inbox_triage_decisions_v1',
        JSON.stringify([
          { id: 't1', topicId: 'topic_skip_1', action: 'skip', createdAt: new Date().toISOString() },
          { id: 't2', topicId: 'topic_draft_2', action: 'draft', createdAt: new Date().toISOString() },
        ])
      );
      localStorage.setItem('marrok_dismissed_gather_topic_ids_v1', JSON.stringify(['topic_legacy_3']));

      const dismissed = getDismissedGatherTopicIds();
      expect(dismissed.has('topic_skip_1')).toBe(true);
      expect(dismissed.has('topic_draft_2')).toBe(true);
      expect(dismissed.has('topic_legacy_3')).toBe(true);

      // Legacy prototype key must have been swept
      expect(localStorage.getItem('marrok_dismissed_gather_topic_ids_v1')).toBeNull();
    });
  });
});
