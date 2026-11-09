import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initPostgresSchema,
  queryPostgresPosts,
  upsertPostgresPost,
  updatePostgresPostStatus,
  deletePostgresPost,
  resetPostgresPoolForTesting,
} from '../../api/db/postgres.ts';
import { loadStoredPosts, saveStoredPosts } from '../../api/controllers/postsController.ts';
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
    expect(sql).toContain('ALTER TABLE saved_posts ADD COLUMN IF NOT EXISTS cloudinary_cleaned_at TIMESTAMPTZ');
    expect(sql).toContain('idx_saved_posts_status');
    expect(sql).toContain('idx_saved_posts_updated_at');

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
      deck: DEFAULT_STARTER_DECK,
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
    expect(saved.deck.theme).toBe(DEFAULT_STARTER_DECK.theme);

    const queried = await queryPostgresPosts(mockPool);
    expect(queried).toHaveLength(1);
    expect(queried[0].id).toBe('post_test_neon_1');
    expect(queried[0].cloudinaryCleanedAt).toBe(nowIso);
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
});
