import pg from 'pg';
import type { SavedPostRecord, SavedPostStatus } from '../../src/types.ts';

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;
let schemaInitialized = false;

export function getPostgresPool(connectionString?: string): pg.Pool | null {
  const url = connectionString || process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url || !url.trim()) return null;

  if (!poolInstance) {
    poolInstance = new Pool({
      connectionString: url.trim(),
      ssl: {
        rejectUnauthorized: false,
      },
      connectionTimeoutMillis: 5000,
      max: 5,
    });

    poolInstance.on('error', (err) => {
      console.warn('[NeonPostgres] Pool error:', err.message);
    });
  }

  return poolInstance;
}

export function resetPostgresPoolForTesting(): void {
  if (poolInstance) {
    void poolInstance.end().catch(() => {});
    poolInstance = null;
  }
  schemaInitialized = false;
}

export async function initPostgresSchema(pool: pg.Pool): Promise<void> {
  if (schemaInitialized) return;

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS saved_posts (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(120),
      post_status VARCHAR(32) NOT NULL DEFAULT 'validated',
      title_signature VARCHAR(255),
      creator_handle VARCHAR(100),
      slide_count INTEGER NOT NULL DEFAULT 1,
      qa_passed BOOLEAN NOT NULL DEFAULT true,
      scheduled_for TIMESTAMPTZ,
      publish_targets JSONB,
      hosted_slide_urls JSONB,
      tiktok_hosted_slide_urls JSONB,
      cloudinary_public_ids JSONB,
      cloudinary_cleaned_at TIMESTAMPTZ,
      buffer_post_ids JSONB,
      zernio_post_ids JSONB,
      deck JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      posted_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS deleted_post_tombstones (
      id VARCHAR(64) PRIMARY KEY,
      deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE saved_posts ADD COLUMN IF NOT EXISTS cloudinary_cleaned_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_saved_posts_status ON saved_posts(post_status);
    CREATE INDEX IF NOT EXISTS idx_saved_posts_scheduled_for ON saved_posts(scheduled_for);
    CREATE INDEX IF NOT EXISTS idx_saved_posts_updated_at ON saved_posts(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_saved_posts_signature ON saved_posts(title_signature);
  `;

  await pool.query(createTableSql);
  schemaInitialized = true;
}

function rowToSavedPostRecord(row: Record<string, unknown>): SavedPostRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    category: String(row.category || 'SYSTEMS ARCHITECTURE'),
    postStatus: (row.post_status as SavedPostStatus) || 'validated',
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    postedAt: row.posted_at
      ? row.posted_at instanceof Date
        ? row.posted_at.toISOString()
        : String(row.posted_at)
      : undefined,
    creatorHandle: row.creator_handle ? String(row.creator_handle) : 'MARROK',
    slideCount: Number(row.slide_count) || 1,
    qaPassed: Boolean(row.qa_passed),
    scheduledFor: row.scheduled_for
      ? row.scheduled_for instanceof Date
        ? row.scheduled_for.toISOString()
        : String(row.scheduled_for)
      : undefined,
    publishTargets: Array.isArray(row.publish_targets) ? (row.publish_targets as any) : undefined,
    hostedSlideUrls: Array.isArray(row.hosted_slide_urls) ? (row.hosted_slide_urls as string[]) : undefined,
    tiktokHostedSlideUrls: Array.isArray(row.tiktok_hosted_slide_urls)
      ? (row.tiktok_hosted_slide_urls as string[])
      : undefined,
    cloudinaryPublicIds: Array.isArray(row.cloudinary_public_ids)
      ? (row.cloudinary_public_ids as string[])
      : undefined,
    cloudinaryCleanedAt: row.cloudinary_cleaned_at
      ? row.cloudinary_cleaned_at instanceof Date
        ? row.cloudinary_cleaned_at.toISOString()
        : String(row.cloudinary_cleaned_at)
      : undefined,
    bufferPostIds: Array.isArray(row.buffer_post_ids) ? (row.buffer_post_ids as string[]) : undefined,
    zernioPostIds: Array.isArray(row.zernio_post_ids) ? (row.zernio_post_ids as string[]) : undefined,
    deck: (typeof row.deck === 'object' && row.deck !== null ? row.deck : JSON.parse(String(row.deck))) as any,
    storageEngine: 'neon-postgres',
  };
}

export async function queryPostgresPosts(pool: pg.Pool): Promise<SavedPostRecord[]> {
  await initPostgresSchema(pool);
  const result = await pool.query(
    'SELECT * FROM saved_posts ORDER BY updated_at DESC LIMIT 100;'
  );
  return result.rows.map(rowToSavedPostRecord);
}

export async function queryPostgresDeletedIds(pool: pg.Pool): Promise<string[]> {
  await initPostgresSchema(pool);
  try {
    const result = await pool.query(
      'SELECT id FROM deleted_post_tombstones ORDER BY deleted_at DESC LIMIT 500;'
    );
    if (!result || !Array.isArray(result.rows)) return [];
    return result.rows
      .map((r: Record<string, unknown>) => String(r.id || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function countPostgresPosts(pool: pg.Pool): Promise<number> {
  await initPostgresSchema(pool);
  const result = await pool.query('SELECT COUNT(*) AS count FROM saved_posts;');
  return parseInt(String(result.rows[0]?.count || '0'), 10);
}

export async function upsertPostgresPost(
  pool: pg.Pool,
  post: SavedPostRecord,
  titleSignature?: string
): Promise<SavedPostRecord> {
  await initPostgresSchema(pool);

  const sql = `
    INSERT INTO saved_posts (
      id, title, category, post_status, title_signature, creator_handle,
      slide_count, qa_passed, scheduled_for, publish_targets, hosted_slide_urls,
      tiktok_hosted_slide_urls, cloudinary_public_ids, cloudinary_cleaned_at,
      buffer_post_ids, zernio_post_ids, deck, created_at, updated_at, posted_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14,
      $15, $16, $17, $18, $19, $20
    )
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      category = EXCLUDED.category,
      post_status = EXCLUDED.post_status,
      title_signature = EXCLUDED.title_signature,
      creator_handle = EXCLUDED.creator_handle,
      slide_count = EXCLUDED.slide_count,
      qa_passed = EXCLUDED.qa_passed,
      scheduled_for = EXCLUDED.scheduled_for,
      publish_targets = EXCLUDED.publish_targets,
      hosted_slide_urls = EXCLUDED.hosted_slide_urls,
      tiktok_hosted_slide_urls = EXCLUDED.tiktok_hosted_slide_urls,
      cloudinary_public_ids = EXCLUDED.cloudinary_public_ids,
      cloudinary_cleaned_at = COALESCE(EXCLUDED.cloudinary_cleaned_at, saved_posts.cloudinary_cleaned_at),
      buffer_post_ids = EXCLUDED.buffer_post_ids,
      zernio_post_ids = EXCLUDED.zernio_post_ids,
      deck = EXCLUDED.deck,
      updated_at = EXCLUDED.updated_at,
      posted_at = CASE
        WHEN EXCLUDED.post_status = 'posted' THEN COALESCE(EXCLUDED.posted_at, saved_posts.posted_at)
        ELSE NULL
      END
    RETURNING *;
  `;

  const values = [
    post.id,
    post.title,
    post.category,
    post.postStatus,
    titleSignature || null,
    post.creatorHandle || 'MARROK',
    post.slideCount,
    post.qaPassed,
    post.scheduledFor ? new Date(post.scheduledFor) : null,
    JSON.stringify(post.publishTargets || []),
    JSON.stringify(post.hostedSlideUrls || []),
    JSON.stringify(post.tiktokHostedSlideUrls || []),
    JSON.stringify(post.cloudinaryPublicIds || []),
    post.cloudinaryCleanedAt ? new Date(post.cloudinaryCleanedAt) : null,
    JSON.stringify(post.bufferPostIds || []),
    JSON.stringify(post.zernioPostIds || []),
    JSON.stringify(post.deck),
    post.createdAt ? new Date(post.createdAt) : new Date(),
    post.updatedAt ? new Date(post.updatedAt) : new Date(),
    post.postedAt ? new Date(post.postedAt) : null,
  ];

  const result = await pool.query(sql, values);
  return rowToSavedPostRecord(result.rows[0]);
}

export async function updatePostgresPostStatus(
  pool: pg.Pool,
  id: string,
  postStatus: SavedPostStatus,
  postedAt?: string
): Promise<SavedPostRecord | null> {
  await initPostgresSchema(pool);

  const now = new Date();
  const sql = `
    UPDATE saved_posts
    SET post_status = $2,
        updated_at = $3,
        posted_at = CASE
          WHEN $2 = 'posted' THEN COALESCE($4, posted_at, $3)
          ELSE posted_at
        END
    WHERE id = $1
    RETURNING *;
  `;

  const values = [id, postStatus, now, postedAt ? new Date(postedAt) : null];
  const result = await pool.query(sql, values);
  if (result.rows.length === 0) return null;
  return rowToSavedPostRecord(result.rows[0]);
}

export async function deletePostgresPost(pool: pg.Pool, id: string): Promise<boolean> {
  await initPostgresSchema(pool);
  try {
    await pool.query(
      `INSERT INTO deleted_post_tombstones (id, deleted_at) VALUES ($1, NOW())
       ON CONFLICT (id) DO UPDATE SET deleted_at = NOW();`,
      [id]
    );
  } catch {
    // Non-fatal if mock pool in unit test does not handle tombstone table
  }
  const result = await pool.query('DELETE FROM saved_posts WHERE id = $1;', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function clearPostgresDeletedTombstone(pool: pg.Pool, id: string): Promise<void> {
  await initPostgresSchema(pool);
  try {
    await pool.query('DELETE FROM deleted_post_tombstones WHERE id = $1;', [id]);
  } catch {
    // Non-fatal
  }
}

