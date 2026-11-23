import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { Server } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { app } from '../../api/index.ts';
import {
  DEFAULT_POSTS_PAGE_SIZE,
  MAX_POSTS_PAGE_SIZE,
  decodePostsCursor,
  encodePostsCursor,
  isNeonPooledConnectionString,
  pingPostgresPool,
  queryPostgresPostsPage,
  resetPostgresPoolForTesting,
  resolvePostgresPoolConfig,
  setPostgresPoolForTesting,
} from '../../api/db/postgres.ts';
import {
  deleteSingleStoredPost,
  loadStoredPostsPage,
  saveStoredPosts,
  upsertSingleStoredPost,
} from '../../api/controllers/postsController.ts';
import {
  isValidRequestId,
  resolveOrCreateRequestId,
} from '../../api/config.ts';
import {
  SESSION_COOKIE_NAME,
  createSignedSessionToken,
  hashPasswordScrypt,
  resetAuthStateForTest,
} from '../lib/security/sessionAuth.ts';
import {
  loadVaultPosts,
  loadVaultPostsPage,
} from '../lib/storage/postsVaultClient.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';
import type { SavedPostRecord, SavedPostStatus } from '../types.ts';

function makePost(
  id: string,
  updatedAt: string,
  overrides: Partial<SavedPostRecord> = {}
): SavedPostRecord {
  const status: SavedPostStatus = overrides.postStatus ?? 'validated';
  return {
    id,
    title: overrides.title ?? `Post ${id}`,
    category: overrides.category ?? 'SYSTEMS ARCHITECTURE',
    postStatus: status,
    createdAt: updatedAt,
    updatedAt,
    postedAt: status === 'posted' ? updatedAt : undefined,
    creatorHandle: 'MARROK',
    slideCount: DEFAULT_STARTER_DECK.slides.length,
    qaPassed: true,
    deck: {
      ...DEFAULT_STARTER_DECK,
      id,
      slides: DEFAULT_STARTER_DECK.slides.map((s, idx) =>
        idx === 0 ? { ...s, enTitle: overrides.title ?? `Post ${id}` } : s
      ),
    },
    ...overrides,
  };
}

function toMockDbRow(post: SavedPostRecord): Record<string, unknown> {
  return {
    id: post.id,
    title: post.title,
    category: post.category,
    post_status: post.postStatus,
    title_signature: `${post.title.toLowerCase()}::carousel`,
    creator_handle: post.creatorHandle,
    slide_count: post.slideCount,
    qa_passed: post.qaPassed,
    scheduled_for: post.scheduledFor ? new Date(post.scheduledFor) : null,
    publish_targets: post.publishTargets ?? [],
    hosted_slide_urls: post.hostedSlideUrls ?? [],
    tiktok_hosted_slide_urls: post.tiktokHostedSlideUrls ?? [],
    cloudinary_public_ids: post.cloudinaryPublicIds ?? [],
    cloudinary_cleaned_at: null,
    buffer_post_ids: post.bufferPostIds ?? [],
    zernio_post_ids: post.zernioPostIds ?? [],
    deck: post.deck,
    created_at: new Date(post.createdAt),
    updated_at: new Date(post.updatedAt),
    posted_at: post.postedAt ? new Date(post.postedAt) : null,
  };
}

/**
 * In-memory PostgreSQL query simulator that enforces exact SQL keyset cursor semantics:
 * `ORDER BY updated_at DESC, id DESC` and `(updated_at, id) < ($ts, $id)`.
 */
function createKeysetMockPostgresPool(initialPosts: SavedPostRecord[]) {
  const rowsById = new Map<string, Record<string, unknown>>();
  for (const post of initialPosts) {
    rowsById.set(post.id, toMockDbRow(post));
  }
  const executedSql: string[] = [];

  const pool = {
    query: vi.fn().mockImplementation(async (sql: string, params: unknown[] = []) => {
      executedSql.push(sql);
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('SELECT 1')) return { rows: [{ ok: 1 }] };
      if (sql.includes('SELECT id FROM deleted_post_tombstones')) return { rows: [] };
      if (sql.includes('SELECT * FROM saved_posts WHERE id = $1')) {
        const found = rowsById.get(String(params[0]));
        return { rows: found ? [found] : [] };
      }
      if (sql.includes('SELECT * FROM saved_posts')) {
        let items = Array.from(rowsById.values());
        if (sql.includes("post_status = 'posted'")) {
          items = items.filter((r) => r.post_status === 'posted');
        } else if (sql.includes("post_status = 'validated'")) {
          items = items.filter((r) => r.post_status === 'validated');
        } else if (sql.includes("post_status <> 'posted' AND scheduled_for IS NOT NULL")) {
          items = items.filter((r) => r.post_status !== 'posted' && r.scheduled_for !== null);
        }

        items.sort((a, b) => {
          const ta = (a.updated_at as Date).getTime();
          const tb = (b.updated_at as Date).getTime();
          if (tb !== ta) return tb - ta;
          const ida = String(a.id);
          const idb = String(b.id);
          return ida < idb ? 1 : ida > idb ? -1 : 0;
        });

        let limitVal = 100;
        if (sql.includes('(updated_at, id) <')) {
          const cursorTs = (params[0] as Date).getTime();
          const cursorId = String(params[1]);
          limitVal = Number(params[2]);
          items = items.filter((r) => {
            const t = (r.updated_at as Date).getTime();
            if (t !== cursorTs) return t < cursorTs;
            return String(r.id) < cursorId;
          });
        } else if (params.length > 0) {
          limitVal = Number(params[params.length - 1]);
        }

        return { rows: items.slice(0, limitVal) };
      }
      return { rows: [] };
    }),
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  } as any;

  return { pool, rowsById, executedSql };
}

describe('Phase 2.6.1 Audit — Pagination Safety, Pool Budgets, Request Observability & Readiness', () => {
  let server: Server;
  let baseUrl = '';
  const savedEnv = { ...process.env };
  const ADMIN_USER = 'marrok_auditor';
  const ADMIN_PASS = 'Audit-Pass-2026-Strong!';
  const SESSION_SECRET = '0123456789abcdef0123456789abcdef-phase261-audit';
  let authCookie = '';

  function setAuthEnv() {
    process.env.ADMIN_USERNAME = ADMIN_USER;
    process.env.ADMIN_PASSWORD_HASH = hashPasswordScrypt(ADMIN_PASS);
    process.env.SESSION_SECRET = SESSION_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.NETLIFY_DATABASE_URL;
    delete process.env.NETLIFY_DATABASE_URL_UNPOOLED;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.NETLIFY;
  }

  beforeAll(async () => {
    setAuthEnv();
    const { token } = createSignedSessionToken(ADMIN_USER, SESSION_SECRET);
    authCookie = `${SESSION_COOKIE_NAME}=${token}`;
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
    resetPostgresPoolForTesting();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    resetAuthStateForTest();
    resetPostgresPoolForTesting();
    setAuthEnv();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetPostgresPoolForTesting();
    window.localStorage.clear();
  });

  describe('1. Cursor Pagination Correctness (Keyset, Identical Timestamps, Filters, Concurrent Mutations)', () => {
    it('encodes/decodes valid cursors and rejects malformed, oversized, or injected cursors', () => {
      const iso = '2026-11-22T10:15:30.123Z';
      const encoded = encodePostsCursor(iso, 'post_abc_123');
      const decoded = decodePostsCursor(encoded);
      expect(decoded).toEqual({
        ok: true,
        cursor: { updatedAt: iso, id: 'post_abc_123' },
      });

      const invalidInputs = [
        '',
        '   ',
        'not-valid-base64!!!',
        Buffer.from('not-json').toString('base64url'),
        Buffer.from(JSON.stringify({ u: 'not-a-date', id: 'p1' })).toString('base64url'),
        Buffer.from(JSON.stringify({ u: iso })).toString('base64url'),
        Buffer.from(JSON.stringify({ u: iso, id: '' })).toString('base64url'),
        Buffer.from(JSON.stringify(['array'])).toString('base64url'),
        'a'.repeat(300),
      ];
      for (const bad of invalidInputs) {
        expect(decodePostsCursor(bad).ok).toBe(false);
      }
    });

    it('paginates a large collection (135 posts) across multiple pages with zero skips and zero duplicates', async () => {
      const baseMs = Date.parse('2026-11-22T12:00:00.000Z');
      const posts = Array.from({ length: 135 }, (_, idx) => {
        const id = `post_${String(idx).padStart(3, '0')}`;
        const ts = new Date(baseMs - idx * 60_000).toISOString();
        return makePost(id, ts);
      });

      const { pool, executedSql } = createKeysetMockPostgresPool(posts);
      const collected: SavedPostRecord[] = [];
      let cursor: string | null = null;
      let pages = 0;

      while (true) {
        const decoded = cursor ? decodePostsCursor(cursor) : null;
        const page = await queryPostgresPostsPage(pool, {
          limit: DEFAULT_POSTS_PAGE_SIZE,
          cursor: decoded && decoded.ok ? decoded.cursor : null,
        });
        collected.push(...page.posts);
        pages += 1;
        if (!page.hasMore || !page.nextCursor) break;
        cursor = page.nextCursor;
        expect(pages).toBeLessThan(10);
      }

      expect(pages).toBe(3); // 50 + 50 + 35
      expect(collected).toHaveLength(135);
      expect(new Set(collected.map((p) => p.id)).size).toBe(135);
      expect(collected[0].id).toBe('post_000');
      expect(collected[134].id).toBe('post_134');
      expect(executedSql.some((s) => s.includes('ORDER BY updated_at DESC, id DESC'))).toBe(true);
    });

    it('never skips or duplicates records when 15 posts share the exact same millisecond timestamp', async () => {
      const sameTs = '2026-11-22T12:00:00.000Z';
      const posts = Array.from({ length: 15 }, (_, idx) =>
        makePost(`post_tie_${String(idx).padStart(2, '0')}`, sameTs)
      );

      const { pool } = createKeysetMockPostgresPool(posts);
      const collectedIds: string[] = [];
      let cursor: string | null = null;

      for (let i = 0; i < 6; i++) {
        const decoded = cursor ? decodePostsCursor(cursor) : null;
        const page = await queryPostgresPostsPage(pool, {
          limit: 4,
          cursor: decoded && decoded.ok ? decoded.cursor : null,
        });
        collectedIds.push(...page.posts.map((p) => p.id));
        if (!page.hasMore || !page.nextCursor) break;
        cursor = page.nextCursor;
      }

      expect(collectedIds).toHaveLength(15);
      expect(new Set(collectedIds).size).toBe(15);
      // Strict descending lexicographical ID tie-breaker
      expect(collectedIds[0]).toBe('post_tie_14');
      expect(collectedIds[14]).toBe('post_tie_00');
    });

    it('handles empty collections, status filters (validated/posted/scheduled), concurrent updates, and deletions during pagination', async () => {
      const tmpStore = path.join(os.tmpdir(), `marrok-phase261-page-${Date.now()}.json`);
      const env: NodeJS.ProcessEnv = { POSTS_STORAGE_FILE: tmpStore };

      try {
        // 1. Empty collection
        const emptyPage = await loadStoredPostsPage(env, { limit: 10 });
        expect(emptyPage.posts).toEqual([]);
        expect(emptyPage.hasMore).toBe(false);
        expect(emptyPage.nextCursor).toBeNull();

        // 2. Seed mixed statuses
        const baseMs = Date.parse('2026-11-22T12:00:00.000Z');
        const seeded: SavedPostRecord[] = [
          makePost('p_01', new Date(baseMs - 1000).toISOString(), { postStatus: 'posted' }),
          makePost('p_02', new Date(baseMs - 2000).toISOString(), {
            postStatus: 'validated',
            scheduledFor: '2026-12-01T10:00:00.000Z',
          }),
          makePost('p_03', new Date(baseMs - 3000).toISOString(), { postStatus: 'validated' }),
          makePost('p_04', new Date(baseMs - 4000).toISOString(), { postStatus: 'posted' }),
          makePost('p_05', new Date(baseMs - 5000).toISOString(), {
            postStatus: 'validated',
            scheduledFor: '2026-12-02T10:00:00.000Z',
          }),
          makePost('p_06', new Date(baseMs - 6000).toISOString(), { postStatus: 'validated' }),
        ];
        await saveStoredPosts(seeded, env);

        // Status filter: posted
        const postedPage = await loadStoredPostsPage(env, { limit: 10, status: 'posted' });
        expect(postedPage.posts.map((p) => p.id)).toEqual(['p_01', 'p_04']);

        // Status filter: scheduled (not posted & has scheduledFor)
        const scheduledPage = await loadStoredPostsPage(env, { limit: 10, status: 'scheduled' });
        expect(scheduledPage.posts.map((p) => p.id)).toEqual(['p_02', 'p_05']);

        // 3. Deletion + concurrent update between page 1 and page 2
        const page1 = await loadStoredPostsPage(env, { limit: 2 });
        expect(page1.posts.map((p) => p.id)).toEqual(['p_01', 'p_02']);
        expect(page1.hasMore).toBe(true);
        expect(page1.nextCursor).toBeTruthy();

        // Delete the cursor boundary post (p_02) and concurrently bump p_05 to the newest timestamp
        await deleteSingleStoredPost('p_02', undefined, env);
        await upsertSingleStoredPost(
          makePost('p_05', new Date(baseMs + 5000).toISOString(), { postStatus: 'validated' }),
          undefined,
          env
        );

        const decoded1 = decodePostsCursor(page1.nextCursor!);
        expect(decoded1.ok).toBe(true);
        if (!decoded1.ok) return;

        const page2 = await loadStoredPostsPage(env, { limit: 2, cursor: decoded1.cursor });
        // p_03 and p_04 must NOT be skipped even though p_02 was deleted and p_05 moved forward!
        expect(page2.posts.map((p) => p.id)).toEqual(['p_03', 'p_04']);
        expect(page2.hasMore).toBe(true);

        const decoded2 = decodePostsCursor(page2.nextCursor!);
        expect(decoded2.ok).toBe(true);
        if (!decoded2.ok) return;

        const page3 = await loadStoredPostsPage(env, { limit: 2, cursor: decoded2.cursor });
        expect(page3.posts.map((p) => p.id)).toEqual(['p_06']);
        expect(page3.hasMore).toBe(false);
        expect(page3.nextCursor).toBeNull();
      } finally {
        await fs.rm(tmpStore, { force: true }).catch(() => {});
        await fs.rm(`${tmpStore}.deleted.json`, { force: true }).catch(() => {});
      }
    });

    it('validates cursor, limit, and status query params on HTTP GET /api/posts and clamps oversized limits', async () => {
      const badCursor = await fetch(`${baseUrl}/api/posts?cursor=not_valid_cursor`, {
        headers: { Cookie: authCookie },
      });
      expect(badCursor.status).toBe(400);
      expect((await badCursor.json()).code).toBe('INVALID_PAGINATION_CURSOR');

      const badLimitZero = await fetch(`${baseUrl}/api/posts?limit=0`, {
        headers: { Cookie: authCookie },
      });
      expect(badLimitZero.status).toBe(400);
      expect((await badLimitZero.json()).code).toBe('INVALID_PAGINATION_LIMIT');

      const badLimitText = await fetch(`${baseUrl}/api/posts?limit=abc`, {
        headers: { Cookie: authCookie },
      });
      expect(badLimitText.status).toBe(400);
      expect((await badLimitText.json()).code).toBe('INVALID_PAGINATION_LIMIT');

      const badStatus = await fetch(`${baseUrl}/api/posts?status=archived`, {
        headers: { Cookie: authCookie },
      });
      expect(badStatus.status).toBe(400);
      expect((await badStatus.json()).code).toBe('INVALID_STATUS_FILTER');

      const clampedLimit = await fetch(`${baseUrl}/api/posts?limit=999`, {
        headers: { Cookie: authCookie },
      });
      expect(clampedLimit.status).toBe(200);
      const clampedBody = await clampedLimit.json();
      expect(clampedBody.limit).toBe(MAX_POSTS_PAGE_SIZE);
    });

    it('retrieves a post older than page 1 directly via GET /api/posts/:id in PostgreSQL', async () => {
      const baseMs = Date.parse('2026-11-22T12:00:00.000Z');
      const posts = Array.from({ length: 125 }, (_, idx) =>
        makePost(`post_pg_${idx}`, new Date(baseMs - idx * 60_000).toISOString())
      );
      const { pool } = createKeysetMockPostgresPool(posts);
      process.env.DATABASE_URL = 'postgresql://user:pass@ep-demo-pooler.us-east-2.aws.neon.tech/neondb';
      setPostgresPoolForTesting(pool);

      const res = await fetch(`${baseUrl}/api/posts/post_pg_124`, {
        headers: { Cookie: authCookie },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.post.id).toBe('post_pg_124');
    });
  });

  describe('2. Frontend Pagination Compatibility (postsVaultClient)', () => {
    it('walks all server cursor pages transparently so older posts remain accessible and deduplicates cross-page updates', async () => {
      const baseMs = Date.parse('2026-11-22T12:00:00.000Z');
      const page1Posts = [
        makePost('p_1', new Date(baseMs - 1000).toISOString(), { title: 'Post 1 Updated' }),
        makePost('p_2', new Date(baseMs - 2000).toISOString(), { title: 'Post 2' }),
      ];
      const page2Posts = [
        // Simulate p_1 appearing again due to concurrent edit; client must deduplicate cleanly
        makePost('p_1', new Date(baseMs - 1500).toISOString(), { title: 'Post 1 Older' }),
        makePost('p_3', new Date(baseMs - 3000).toISOString(), { title: 'Post 3 Oldest' }),
      ];

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              posts: page1Posts,
              hasMore: true,
              nextCursor: 'cursor_page_2',
              storageEngine: 'neon-postgres',
              isCloudPersistent: true,
              deletedIds: [],
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              posts: page2Posts,
              hasMore: false,
              nextCursor: null,
              storageEngine: 'neon-postgres',
              isCloudPersistent: true,
              deletedIds: [],
            }),
            { status: 200 }
          )
        );

      const result = await loadVaultPosts();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0][0]).toBe('/api/posts');
      expect(fetchSpy.mock.calls[1][0]).toBe('/api/posts?cursor=cursor_page_2');
      expect(result.posts.map((p) => p.id)).toEqual(['p_1', 'p_2', 'p_3']);
      expect(result.posts.find((p) => p.id === 'p_1')?.title).toBe('Post 1 Updated');
      expect(result.hasMore).toBe(false);
    });

    it('halts cleanly if a misbehaving server repeats the same nextCursor (cycle guard) and supports explicit single-page loads', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              posts: [makePost('p_loop', '2026-11-22T12:00:00.000Z')],
              hasMore: true,
              nextCursor: 'same_cursor_loop',
              storageEngine: 'neon-postgres',
              isCloudPersistent: true,
              deletedIds: [],
            }),
            { status: 200 }
          )
      );

      const result = await loadVaultPosts();
      expect(fetchSpy).toHaveBeenCalledTimes(2); // Page 1 + Page 2 sees repeated cursor and breaks
      expect(result.posts).toHaveLength(1);

      const singlePage = await loadVaultPostsPage({ limit: 25, status: 'posted', cursor: 'abc' });
      expect(singlePage.hasMore).toBe(true);
      expect(singlePage.nextCursor).toBe('same_cursor_loop');
      expect(fetchSpy.mock.calls[2][0]).toBe('/api/posts?limit=25&cursor=abc&status=posted');
    });
  });

  describe('3. Neon Connection Pool Scalability Configuration', () => {
    it('configures explicit timeouts and differentiates Express vs serverless (Vercel/Netlify) pool budgets', () => {
      const pooledUrl = 'postgresql://user:pass@ep-cool-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require';
      const directUrl = 'postgresql://user:pass@ep-cool.us-east-2.aws.neon.tech/neondb?sslmode=require';

      expect(isNeonPooledConnectionString(pooledUrl)).toBe(true);
      expect(isNeonPooledConnectionString(directUrl)).toBe(false);

      const expressCfg = resolvePostgresPoolConfig(pooledUrl, {});
      expect(expressCfg.max).toBe(5);
      expect(expressCfg.allowExitOnIdle).toBe(false);
      expect(expressCfg.connectionTimeoutMillis).toBe(5000);
      expect(expressCfg.idleTimeoutMillis).toBe(10_000);
      expect(expressCfg.statement_timeout).toBe(10_000);
      expect(expressCfg.query_timeout).toBe(10_000);

      const vercelCfg = resolvePostgresPoolConfig(pooledUrl, { VERCEL: '1' });
      expect(vercelCfg.max).toBe(2);
      expect(vercelCfg.allowExitOnIdle).toBe(true);

      const netlifyCfg = resolvePostgresPoolConfig(pooledUrl, { NETLIFY: 'true' });
      expect(netlifyCfg.max).toBe(2);
      expect(netlifyCfg.allowExitOnIdle).toBe(true);

      const customCfg = resolvePostgresPoolConfig(pooledUrl, {
        VERCEL: '1',
        PG_POOL_MAX: '4',
        PG_STATEMENT_TIMEOUT_MS: '8000',
      });
      expect(customCfg.max).toBe(4);
      expect(customCfg.statement_timeout).toBe(8000);
    });
  });

  describe('4. Request Correlation & Log Injection Defense', () => {
    it('validates safe incoming X-Request-Id, replaces injected/malformed values, and exposes header across CORS & error paths', async () => {
      expect(isValidRequestId('req_12345678-abcd')).toBe(true);
      expect(isValidRequestId('short')).toBe(false);
      expect(isValidRequestId('valid-id\r\nInjected: header')).toBe(false);
      expect(isValidRequestId('id with spaces 1234')).toBe(false);
      expect(isValidRequestId('a'.repeat(65))).toBe(false);

      expect(resolveOrCreateRequestId('client_trace-2026.01')).toBe('client_trace-2026.01');
      const replaced = resolveOrCreateRequestId('bad\n{"level":"error","fake":true}');
      expect(replaced.startsWith('req_')).toBe(true);
      expect(replaced).not.toContain('\n');

      // 1. Valid client ID echoed
      const resValid = await fetch(`${baseUrl}/api/health`, {
        headers: { 'X-Request-Id': 'trace-phase261-valid01' },
      });
      expect(resValid.headers.get('x-request-id')).toBe('trace-phase261-valid01');

      // 2. Malformed client ID replaced safely
      const resBad = await fetch(`${baseUrl}/api/health`, {
        headers: { 'X-Request-Id': 'bad id; drop table' },
      });
      const echoedBad = resBad.headers.get('x-request-id') || '';
      expect(echoedBad.startsWith('req_')).toBe(true);
      expect(echoedBad).not.toContain('drop');

      // 3. Error path (401 unauthenticated) still returns X-Request-Id
      const res401 = await fetch(`${baseUrl}/api/posts`);
      expect(res401.status).toBe(401);
      expect(res401.headers.get('x-request-id')).toMatch(/^req_/);

      // 4. CORS exposes X-Request-Id on allowed origin & still sets X-Request-Id on 403 CORS deny
      const resCorsOk = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'https://marrok-content.netlify.app' },
      });
      expect(resCorsOk.status).toBe(200);
      expect(resCorsOk.headers.get('access-control-expose-headers')).toContain('X-Request-Id');
      expect(resCorsOk.headers.get('access-control-allow-headers')).toContain('X-Request-Id');

      const resCorsDeny = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'https://evil.example.com' },
      });
      expect(resCorsDeny.status).toBe(403);
      expect(resCorsDeny.headers.get('x-request-id')).toMatch(/^req_/);
    });
  });

  describe('5. Health Liveness vs Readiness (?probe=ready)', () => {
    it('keeps liveness decoupled from database failures and enforces bounded timeout + zero secret leakage on ?probe=ready', async () => {
      const failingPool = {
        query: vi.fn().mockRejectedValue(
          new Error('password authentication failed for user "secret_user" at ep-secret-host.neon.tech')
        ),
        on: vi.fn(),
        end: vi.fn().mockResolvedValue(undefined),
      } as any;
      process.env.DATABASE_URL = 'postgresql://secret_user:super_secret_pw@ep-secret-host.neon.tech/neondb';
      setPostgresPoolForTesting(failingPool);

      // Liveness MUST stay 200 without invoking PostgreSQL
      const liveRes = await fetch(`${baseUrl}/api/health`);
      expect(liveRes.status).toBe(200);
      const liveBody = await liveRes.json();
      expect(liveBody.status).toBe('ok');
      expect(liveBody.probe).toBe('live');
      expect(failingPool.query).not.toHaveBeenCalled();

      // Readiness MUST return 503 with zero secret/SQL error leakage
      const readyFailRes = await fetch(`${baseUrl}/api/health?probe=ready`);
      expect(readyFailRes.status).toBe(503);
      expect(readyFailRes.headers.get('cache-control')).toBe('no-store');
      const readyFailText = await readyFailRes.text();
      expect(readyFailText).not.toContain('secret_user');
      expect(readyFailText).not.toContain('super_secret_pw');
      expect(readyFailText).not.toContain('ep-secret-host');
      const readyFailBody = JSON.parse(readyFailText);
      expect(readyFailBody.status).toBe('not_ready');
      expect(readyFailBody.checks.database).toBe('unavailable');

      // Healthy Postgres -> 200 ready even when optional integrations (Upstash/Cloudinary/Buffer) are unconfigured
      const healthyPool = {
        query: vi.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
        on: vi.fn(),
        end: vi.fn().mockResolvedValue(undefined),
      } as any;
      setPostgresPoolForTesting(healthyPool);

      const readyOkRes = await fetch(`${baseUrl}/api/health?probe=ready`);
      expect(readyOkRes.status).toBe(200);
      const readyOkBody = await readyOkRes.json();
      expect(readyOkBody.status).toBe('ready');
      expect(readyOkBody.checks.database).toBe('ok');
      expect(typeof readyOkBody.latencyMs).toBe('number');

      // Direct timeout check on pingPostgresPool
      const stalledPool = {
        query: vi.fn().mockImplementation(() => new Promise(() => {})),
      } as any;
      const pingResult = await pingPostgresPool(stalledPool, 300);
      expect(pingResult.ok).toBe(false);
      expect(pingResult.timedOut).toBe(true);
      expect(pingResult.latencyMs).toBeGreaterThanOrEqual(250);
    });
  });
});
