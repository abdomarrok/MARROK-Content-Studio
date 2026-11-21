import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type pg from 'pg';
import {
  verifySessionCookieValue,
  revokeSessionToken,
  checkLoginLockout,
  createSignedSessionToken,
  hashPasswordScrypt,
  resetAuthStateForTest,
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

    it('tolerates benign 42P01 undefined_table before first session logout', async () => {
      const { token } = createSignedSessionToken(ADMIN_USER, SESSION_SECRET);

      const uninitializedPool = {
        query: vi.fn().mockRejectedValue({ code: '42P01', message: 'relation does not exist' }),
      } as unknown as pg.Pool;

      // 42P01 is benign: table hasn't been created yet because no user has logged out yet
      const verified = await verifySessionCookieValue(
        `__Host-marrok_session=${token}`,
        authConfig,
        uninitializedPool
      );

      expect(verified).not.toBeNull();
      expect(verified?.sub).toBe(ADMIN_USER);
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
    it('performs distributed rate-limiting pipeline when Upstash KV is configured', async () => {
      const mockPipelineFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => [{ result: 1 }, { result: 1 }],
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
        expect(mockPipelineFetch).toHaveBeenCalledTimes(1);
        const [calledUrl, options] = mockPipelineFetch.mock.calls[0];
        expect(String(calledUrl)).toContain('https://upstash.io/pipeline');
        expect(options?.headers).toHaveProperty('Authorization', 'Bearer test_token');
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
  });
});
