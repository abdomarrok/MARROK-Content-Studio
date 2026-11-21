import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import {
  initPostgresSchema,
  queryPostgresPosts,
  upsertPostgresPost,
  upsertPostgresPostsBatch,
  updatePostgresPostStatus,
  deletePostgresPost,
  claimPostgresOutboxDispatch,
  checkpointPostgresOutboxRecord,
  resetPostgresPoolForTesting,
  setPostgresPoolForTesting,
} from '../../api/db/postgres.ts';
import {
  loadStoredPosts,
  upsertSingleStoredPost,
} from '../../api/controllers/postsController.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';
import type { SavedPostRecord } from '../types.ts';

describe('Neon PostgreSQL Vault Persistence & Safe Fallbacks', () => {
  beforeEach(() => {
    resetPostgresPoolForTesting();
  });

  afterEach(() => {
    resetPostgresPoolForTesting();
    vi.restoreAllMocks();
  });

  it('initializes schema and creates indexes idempotently', async () => {
    const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
    const mockPool = {
      query: mockQuery,
      on: vi.fn(),
    } as any;

    await initPostgresSchema(mockPool);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS saved_posts');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS publish_outbox');
    expect(sql).toContain('ALTER TABLE saved_posts ADD COLUMN IF NOT EXISTS cloudinary_cleaned_at TIMESTAMPTZ');
    expect(sql).toContain('idx_saved_posts_status');
    expect(sql).toContain('idx_saved_posts_updated_at');
    expect(sql).toContain('idx_publish_outbox_post_id');
    expect(sql).toContain('idx_publish_outbox_lease_expires');

    // Calling it again should be cached and not re-query
    await initPostgresSchema(mockPool);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('upserts a saved post record with serialized JSONB deck and cloudinaryCleanedAt and parses it on query', async () => {
    const nowIso = new Date().toISOString();
    const mockRow = {
      id: 'post_test_neon_1',
      title: 'Distributed Consensus Architecture',
      category: 'DISTRIBUTED SYSTEMS',
      post_status: 'validated',
      title_signature: 'distributed consensus architecture::carousel',
      creator_handle: 'MARROK',
      slide_count: 8,
      qa_passed: true,
      scheduled_for: null,
      publish_targets: ['instagram', 'tiktok'],
      hosted_slide_urls: ['https://res.cloudinary.com/test/image/upload/slide1.jpg'],
      tiktok_hosted_slide_urls: ['https://res.cloudinary.com/test/image/upload/slide1_tiktok.jpg'],
      cloudinary_public_ids: [],
      cloudinary_cleaned_at: new Date(nowIso),
      buffer_post_ids: ['buf_123'],
      zernio_post_ids: ['zern_456'],
      deck: {
        ...DEFAULT_STARTER_DECK,
        sourceMeta: {
          ...DEFAULT_STARTER_DECK.sourceMeta,
          qualityPassed: true,
          groundingVerified: true,
          humanApproved: false,
          userReviewed: false,
          publishFailed: true,
        },
      },
      created_at: new Date(nowIso),
      updated_at: new Date(nowIso),
      posted_at: null,
    };

    const mockPool = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('CREATE TABLE')) return { rows: [] };
        if (sql.includes('INSERT INTO saved_posts')) return { rows: [mockRow] };
        if (sql.includes('SELECT * FROM saved_posts')) return { rows: [mockRow] };
        return { rows: [] };
      }),
      on: vi.fn(),
    } as any;

    const testRecord: SavedPostRecord = {
      id: 'post_test_neon_1',
      title: 'Distributed Consensus Architecture',
      category: 'DISTRIBUTED SYSTEMS',
      postStatus: 'validated',
      createdAt: nowIso,
      updatedAt: nowIso,
      creatorHandle: 'MARROK',
      slideCount: 8,
      qaPassed: true,
      qualityPassed: true,
      groundingVerified: true,
      humanApproved: false,
      publishFailed: true,
      publishTargets: ['instagram', 'tiktok'],
      hostedSlideUrls: ['https://res.cloudinary.com/test/image/upload/slide1.jpg'],
      cloudinaryPublicIds: [],
      cloudinaryCleanedAt: nowIso,
      deck: DEFAULT_STARTER_DECK,
    };

    const saved = await upsertPostgresPost(mockPool, testRecord);
    expect(saved.id).toBe('post_test_neon_1');
    expect(saved.storageEngine).toBe('neon-postgres');
    expect(saved.title).toBe('Distributed Consensus Architecture');
    expect(saved.cloudinaryCleanedAt).toBe(nowIso);
    expect(saved.qualityPassed).toBe(true);
    expect(saved.groundingVerified).toBe(true);
    expect(saved.humanApproved).toBe(false);
    expect(saved.publishFailed).toBe(true);
    expect(saved.deck.theme).toBe(DEFAULT_STARTER_DECK.theme);

    const queried = await queryPostgresPosts(mockPool);
    expect(queried).toHaveLength(1);
    expect(queried[0].id).toBe('post_test_neon_1');
    expect(queried[0].cloudinaryCleanedAt).toBe(nowIso);
    expect(queried[0].qualityPassed).toBe(true);
    expect(queried[0].groundingVerified).toBe(true);
    expect(queried[0].humanApproved).toBe(false);
    expect(queried[0].publishFailed).toBe(true);
    expect(queried[0].storageEngine).toBe('neon-postgres');
  });

  it('updates post status and deletes post cleanly', async () => {
    const mockRow = {
      id: 'post_test_status',
      title: 'Status Test Post',
      post_status: 'posted',
      created_at: new Date(),
      updated_at: new Date(),
      posted_at: new Date(),
      deck: DEFAULT_STARTER_DECK,
      qa_passed: true,
      slide_count: 5,
    };

    const mockPool = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('CREATE TABLE')) return { rows: [] };
        if (sql.includes('UPDATE saved_posts')) return { rows: [mockRow] };
        if (sql.includes('DELETE FROM saved_posts')) return { rowCount: 1, rows: [] };
        return { rows: [] };
      }),
      on: vi.fn(),
    } as any;

    const updated = await updatePostgresPostStatus(mockPool, 'post_test_status', 'posted');
    expect(updated).not.toBeNull();
    expect(updated?.postStatus).toBe('posted');

    const deleted = await deletePostgresPost(mockPool, 'post_test_status');
    expect(deleted).toBe(true);
  });

  it('gracefully falls back to local disk storage when PostgreSQL connection throws an error', async () => {
    // When DATABASE_URL is malformed or unreachable, loadStoredPosts should log a warning and fallback without crashing
    const envWithFailingDb: NodeJS.ProcessEnv = {
      DATABASE_URL: 'postgresql://fake_user:fake_pass@unreachable.invalid:5432/fake_db',
      POSTS_STORAGE_FILE: undefined,
    };

    const result = await loadStoredPosts(envWithFailingDb);
    expect(result).toBeDefined();
    expect(Array.isArray(result.posts)).toBe(true);
    // Should fallback to local-disk or vercel-tmp
    expect(['local-disk', 'vercel-tmp', 'browser-vault']).toContain(result.storageEngine);
  });

  it('uses transactional UNNEST bulk upsert (BEGIN + 1 UNNEST query + COMMIT) and issues ROLLBACK on failure', async () => {
    const queries: string[] = [];
    const clientQuery = vi.fn().mockImplementation(async (sql: string) => {
      queries.push(sql.trim().split(/\s+/).slice(0, 4).join(' '));
      if (sql.includes('INSERT INTO saved_posts')) {
        return {
          rows: [
            {
              id: 'p1',
              title: 'Batch Post 1',
              post_status: 'validated',
              deck: DEFAULT_STARTER_DECK,
              qa_passed: true,
              slide_count: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
            {
              id: 'p2',
              title: 'Batch Post 2',
              post_status: 'validated',
              deck: DEFAULT_STARTER_DECK,
              qa_passed: true,
              slide_count: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue({ query: clientQuery, release }),
      on: vi.fn(),
    } as any;

    const now = new Date().toISOString();
    const makePost = (id: string, title: string): SavedPostRecord => ({
      id,
      title,
      category: 'SYSTEMS',
      postStatus: 'validated',
      createdAt: now,
      updatedAt: now,
      creatorHandle: 'MARROK',
      slideCount: 1,
      qaPassed: true,
      deck: DEFAULT_STARTER_DECK,
    });

    const saved = await upsertPostgresPostsBatch(mockPool, [
      makePost('p1', 'Batch Post 1'),
      makePost('p2', 'Batch Post 2'),
    ]);
    expect(saved).toHaveLength(2);
    expect(queries[0]).toBe('BEGIN');
    expect(queries[1]).toContain('INSERT INTO saved_posts');
    expect(queries[2]).toBe('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);

    // Must execute single UNNEST statement instead of 100 individual INSERT statements
    const unnestSql = clientQuery.mock.calls.find((c) => String(c[0]).includes('INSERT INTO saved_posts'))?.[0];
    expect(unnestSql).toContain('SELECT * FROM UNNEST');

    // Verify ROLLBACK when UNNEST fails inside transaction
    const rollbackQueries: string[] = [];
    const failingClientQuery = vi.fn().mockImplementation(async (sql: string) => {
      rollbackQueries.push(sql.trim());
      if (sql.includes('INSERT INTO saved_posts')) {
        throw new Error('simulated constraint violation');
      }
      return { rows: [] };
    });
    const failingPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue({ query: failingClientQuery, release: vi.fn() }),
      on: vi.fn(),
    } as any;

    await expect(
      upsertPostgresPostsBatch(failingPool, [makePost('p3', 'Err 1'), makePost('p4', 'Err 2')])
    ).rejects.toThrow('simulated constraint violation');
    expect(rollbackQueries).toContain('BEGIN');
    expect(rollbackQueries).toContain('ROLLBACK');
    expect(rollbackQueries).not.toContain('COMMIT');
  });

  it('executes single-row INSERT via upsertSingleStoredPost and keeps loadStoredPosts strictly read-pure', async () => {
    const executedSql: string[] = [];
    const now = new Date().toISOString();
    const mockRow = {
      id: 'single_row_1',
      title: 'Single Row Post',
      category: 'AI',
      post_status: 'validated',
      deck: DEFAULT_STARTER_DECK,
      qa_passed: true,
      slide_count: 1,
      created_at: new Date(now),
      updated_at: new Date(now),
      scheduled_for: new Date(Date.now() - 3600_000), // overdue in DB, must NOT be mutated by GET/load
      posted_at: null,
    };

    const mockPool = {
      query: vi.fn().mockImplementation(async (sql: string) => {
        executedSql.push(sql);
        if (sql.includes('CREATE TABLE')) return { rows: [] };
        if (sql.includes('SELECT id FROM deleted_post_tombstones')) return { rows: [] };
        if (sql.includes('SELECT * FROM saved_posts')) return { rows: [mockRow] };
        if (sql.includes('INSERT INTO saved_posts')) return { rows: [mockRow] };
        return { rows: [] };
      }),
      on: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    } as any;

    setPostgresPoolForTesting(mockPool);
    const fakeEnv: NodeJS.ProcessEnv = {
      DATABASE_URL: 'postgresql://user:pass@ep-test.neon.tech/neondb',
      POSTS_STORAGE_FILE: path.join(os.tmpdir(), `marrok-pg-single-test-${Date.now()}.json`),
    };

    const existingList: SavedPostRecord[] = Array.from({ length: 15 }, (_, idx) => ({
      id: `existing_${idx}`,
      title: `Existing ${idx}`,
      category: 'AI',
      postStatus: 'validated',
      createdAt: now,
      updatedAt: now,
      creatorHandle: 'MARROK',
      slideCount: 1,
      qaPassed: true,
      deck: DEFAULT_STARTER_DECK,
    }));

    const targetPost: SavedPostRecord = {
      id: 'single_row_1',
      title: 'Single Row Post',
      category: 'AI',
      postStatus: 'validated',
      createdAt: now,
      updatedAt: now,
      creatorHandle: 'MARROK',
      slideCount: 1,
      qaPassed: true,
      deck: DEFAULT_STARTER_DECK,
    };

    const engine = await upsertSingleStoredPost(targetPost, existingList, fakeEnv);
    expect(engine).toBe('neon-postgres');

    // Exactly ONE INSERT INTO saved_posts call, NOT 15!
    const insertCalls = executedSql.filter((s) => s.includes('INSERT INTO saved_posts'));
    expect(insertCalls).toHaveLength(1);

    // loadStoredPosts must be 100% read-pure: zero INSERT/UPDATE/DELETE queries even when overdue rows exist
    executedSql.length = 0;
    const loaded = await loadStoredPosts(fakeEnv);
    expect(loaded.storageEngine).toBe('neon-postgres');
    expect(loaded.posts[0]?.postStatus).toBe('validated'); // NOT promoted on GET
    const writeCallsDuringGet = executedSql.filter((s) =>
      /\b(INSERT|UPDATE|DELETE)\b/i.test(s)
    );
    expect(writeCallsDuringGet).toEqual([]);
  });

  it('atomically claims, leases, and checkpoints publish_outbox records in PostgreSQL transactions', async () => {
    const outboxRows = new Map<string, Record<string, unknown>>();
    const clientQueries: string[] = [];

    const executeSql = async (sql: string, values: unknown[] = []) => {
      if (sql.includes('CREATE TABLE')) return { rows: [] };
      if (sql.includes('FROM publish_outbox') && sql.includes('dispatch_fingerprint <>')) {
        const postId = String(values[0]);
        const fp = String(values[1]);
        const now = values[2] as Date;
        for (const r of outboxRows.values()) {
          if (
            r.post_id === postId &&
            r.dispatch_fingerprint !== fp &&
            r.state === 'dispatching' &&
            r.lease_expires_at instanceof Date &&
            r.lease_expires_at.getTime() > now.getTime()
          ) {
            return { rows: [r] };
          }
        }
        return { rows: [] };
      }
      if (sql.includes('SELECT * FROM publish_outbox WHERE dispatch_fingerprint = $1')) {
        const row = outboxRows.get(String(values[0]));
        return { rows: row ? [row] : [] };
      }
      if (sql.includes('INSERT INTO publish_outbox')) {
        const fp = String(values[2]);
        if (outboxRows.has(fp)) return { rows: [] };
        const row: Record<string, unknown> = {
          id: values[0],
          post_id: values[1],
          dispatch_fingerprint: fp,
          state: values[3],
          mode: values[4],
          due_at: values[5],
          timezone: values[6],
          targets: JSON.parse(String(values[7])),
          attempt_count: values[8],
          max_attempts: values[9],
          lease_owner: values[10],
          lease_expires_at: values[11],
          next_retry_at: values[12],
          last_error_category: values[13],
          last_error_message: values[14],
          payload: JSON.parse(String(values[15])),
          operations: JSON.parse(String(values[16])),
          created_at: values[17],
          updated_at: values[18],
          completed_at: values[19],
        };
        outboxRows.set(fp, row);
        return { rows: [row] };
      }
      if (sql.includes('UPDATE publish_outbox') && sql.includes('SET state = $2,')) {
        const fp = String(values[0]);
        const existing = outboxRows.get(fp);
        if (!existing) return { rows: [] };
        const updated = {
          ...existing,
          state: values[1],
          targets: JSON.parse(String(values[2])),
          attempt_count: values[3],
          lease_owner: values[4],
          lease_expires_at: values[5],
          next_retry_at: values[6],
          last_error_category: values[7],
          last_error_message: values[8],
          operations: JSON.parse(String(values[9])),
          updated_at: values[10],
          completed_at: values[11],
        };
        outboxRows.set(fp, updated);
        return { rows: [updated] };
      }
      return { rows: [] };
    };

    const release = vi.fn();
    const mockPool = {
      query: vi.fn().mockImplementation(executeSql),
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockImplementation(async (sql: string, vals?: unknown[]) => {
          clientQueries.push(sql.trim().split(/\s+/)[0]);
          return executeSql(sql, vals);
        }),
        release,
      }),
      on: vi.fn(),
    } as any;

    const nowMs = Date.parse('2026-11-21T15:00:00.000Z');
    const claim1 = await claimPostgresOutboxDispatch(mockPool, {
      postId: 'post_pg_outbox_1',
      dispatchFingerprint: 'fp_pg_1',
      mode: 'shareNow',
      targets: ['instagram', 'tiktok'],
      payload: {
        caption: 'PG Outbox Test',
        mode: 'shareNow',
        targets: ['instagram', 'tiktok'],
        imageUrls: ['https://cdn.example.com/1.jpg'],
        tiktokImageUrls: ['https://cdn.example.com/1_tt.jpg'],
        cloudinaryPublicIds: ['s1'],
      },
      leaseOwner: 'lambda_1',
      leaseDurationMs: 60_000,
      nowMs,
    });

    expect(claim1.status).toBe('claimed');
    expect(clientQueries).toContain('BEGIN');
    expect(clientQueries).toContain('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);

    // Concurrent second serverless instance trying to dispatch the same post_id must be rejected as in_flight
    const concurrentOtherFp = await claimPostgresOutboxDispatch(mockPool, {
      postId: 'post_pg_outbox_1',
      dispatchFingerprint: 'fp_pg_different',
      mode: 'shareNow',
      targets: ['instagram'],
      payload: {
        caption: 'Different payload while active',
        mode: 'shareNow',
        targets: ['instagram'],
        imageUrls: ['https://cdn.example.com/1.jpg'],
        tiktokImageUrls: [],
        cloudinaryPublicIds: [],
      },
      leaseOwner: 'lambda_2',
      leaseDurationMs: 60_000,
      nowMs: nowMs + 10_000,
    });
    expect(concurrentOtherFp.status).toBe('in_flight');

    // Checkpoint completed state and confirm replay
    if (claim1.status === 'claimed') {
      await checkpointPostgresOutboxRecord(mockPool, {
        ...claim1.record,
        state: 'completed',
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: new Date(nowMs + 5000).toISOString(),
        operations: {
          instagram: {
            service: 'instagram',
            provider: 'buffer',
            state: 'succeeded',
            attemptCount: 1,
            remotePostId: 'buf_pg_1',
            bufferPostId: 'buf_pg_1',
            updatedAt: new Date(nowMs + 2000).toISOString(),
            completedAt: new Date(nowMs + 2000).toISOString(),
          },
          tiktok: {
            service: 'tiktok',
            provider: 'zernio',
            state: 'succeeded',
            attemptCount: 1,
            remotePostId: 'zernio_pg_1',
            zernioPostId: 'zernio_pg_1',
            updatedAt: new Date(nowMs + 4000).toISOString(),
            completedAt: new Date(nowMs + 4000).toISOString(),
          },
        },
      });

      const replay = await claimPostgresOutboxDispatch(mockPool, {
        postId: 'post_pg_outbox_1',
        dispatchFingerprint: 'fp_pg_1',
        mode: 'shareNow',
        targets: ['instagram', 'tiktok'],
        payload: claim1.record.payload,
        leaseOwner: 'lambda_3',
        nowMs: nowMs + 20_000,
      });
      expect(replay.status).toBe('already_completed');
    }
  });
});
