import pg from 'pg';
import type {
  PublishTargetPlatform,
  SavedPostRecord,
  SavedPostStatus,
  TriageAction,
  TriageDecisionRecord,
  TriageSkipReason,
} from '../../src/types.ts';

const VALID_PUBLISH_TARGETS = new Set<PublishTargetPlatform>([
  'instagram',
  'facebook',
  'linkedin',
  'tiktok',
]);

function parsePublishTargets(raw: unknown): PublishTargetPlatform[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const filtered = raw.filter(
    (item): item is PublishTargetPlatform =>
      typeof item === 'string' && VALID_PUBLISH_TARGETS.has(item as PublishTargetPlatform)
  );
  return filtered.length > 0 ? filtered : [];
}
import { readRuntimeEnv } from '../../src/lib/security/env.ts';

const { Pool } = pg;

let poolInstance: pg.Pool | null = null;
let schemaInitialized = false;

export function resolvePostgresSslConfig(
  connectionString: string,
  env: NodeJS.ProcessEnv = process.env
): false | { rejectUnauthorized: boolean; ca?: string } {
  try {
    const parsed = new URL(connectionString);
    const isLocalHost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1';
    if (isLocalHost && parsed.searchParams.get('sslmode') === 'disable') {
      return false;
    }
  } catch {
    // Enforce TLS verification by default
  }

  const caCert =
    readRuntimeEnv('PG_CA_CERT', env) || readRuntimeEnv('DATABASE_CA_CERT', env);

  return {
    rejectUnauthorized: true,
    ...(caCert ? { ca: caCert.replace(/\\n/g, '\n') } : {}),
  };
}

export function getPostgresPool(connectionString?: string): pg.Pool | null {
  const url =
    connectionString ||
    readRuntimeEnv('DATABASE_URL') ||
    readRuntimeEnv('POSTGRES_URL') ||
    readRuntimeEnv('NETLIFY_DATABASE_URL') ||
    readRuntimeEnv('NETLIFY_DATABASE_URL_UNPOOLED');
  if (!url || !url.trim()) return null;

  if (!poolInstance) {
    const cleanUrl = url.trim();
    poolInstance = new Pool({
      connectionString: cleanUrl,
      ssl: resolvePostgresSslConfig(cleanUrl),
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

export function setPostgresPoolForTesting(pool: pg.Pool | null): void {
  poolInstance = pool;
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

    CREATE TABLE IF NOT EXISTS inbox_triage_decisions (
      id VARCHAR(64) PRIMARY KEY,
      topic_id VARCHAR(128) NOT NULL,
      topic_signature VARCHAR(255),
      source_domain VARCHAR(255) NOT NULL,
      domain_category VARCHAR(120) NOT NULL,
      action VARCHAR(32) NOT NULL,
      reason VARCHAR(64),
      snooze_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE saved_posts ADD COLUMN IF NOT EXISTS cloudinary_cleaned_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_saved_posts_status ON saved_posts(post_status);
    CREATE INDEX IF NOT EXISTS idx_saved_posts_scheduled_for ON saved_posts(scheduled_for);
    CREATE INDEX IF NOT EXISTS idx_saved_posts_updated_at ON saved_posts(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_saved_posts_signature ON saved_posts(title_signature);
    CREATE INDEX IF NOT EXISTS idx_inbox_triage_created_at ON inbox_triage_decisions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_inbox_triage_topic_id ON inbox_triage_decisions(topic_id);
  `;

  await pool.query(createTableSql);
  schemaInitialized = true;
}

function rowToSavedPostRecord(row: Record<string, unknown>): SavedPostRecord {
  const parsedDeck = (
    typeof row.deck === 'object' && row.deck !== null ? row.deck : JSON.parse(String(row.deck))
  ) as SavedPostRecord['deck'];
  const qaPassed = Boolean(row.qa_passed);
  const sourceMeta = parsedDeck?.sourceMeta;
  const qualityPassed =
    sourceMeta?.qualityPassed !== undefined ? Boolean(sourceMeta.qualityPassed) : qaPassed;
  const groundingVerified =
    sourceMeta?.groundingVerified !== undefined
      ? Boolean(sourceMeta.groundingVerified)
      : undefined;
  const humanApproved =
    sourceMeta?.humanApproved !== undefined
      ? Boolean(sourceMeta.humanApproved)
      : sourceMeta?.userReviewed !== undefined
      ? Boolean(sourceMeta.userReviewed)
      : undefined;
  const verifiedNumbers =
    sourceMeta?.verifiedNumbers !== undefined
      ? Boolean(sourceMeta.verifiedNumbers)
      : undefined;
  const publishFailed =
    sourceMeta?.publishFailed !== undefined ? Boolean(sourceMeta.publishFailed) : undefined;
  const lastDispatchFingerprint =
    typeof sourceMeta?.lastDispatchFingerprint === 'string'
      ? sourceMeta.lastDispatchFingerprint
      : undefined;
  const lastDispatchedAt =
    typeof sourceMeta?.lastDispatchedAt === 'string'
      ? sourceMeta.lastDispatchedAt
      : undefined;

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
    qaPassed,
    qualityPassed,
    ...(groundingVerified !== undefined ? { groundingVerified } : {}),
    ...(humanApproved !== undefined ? { humanApproved } : {}),
    ...(verifiedNumbers !== undefined ? { verifiedNumbers } : {}),
    ...(publishFailed !== undefined ? { publishFailed } : {}),
    ...(lastDispatchFingerprint ? { lastDispatchFingerprint } : {}),
    ...(lastDispatchedAt ? { lastDispatchedAt } : {}),
    scheduledFor: row.scheduled_for
      ? row.scheduled_for instanceof Date
        ? row.scheduled_for.toISOString()
        : String(row.scheduled_for)
      : undefined,
    publishTargets: parsePublishTargets(row.publish_targets),
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
    deck: parsedDeck,
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

function preparePostRowParams(post: SavedPostRecord, titleSignature?: string) {
  const deckToPersist =
    post.qualityPassed !== undefined ||
    post.groundingVerified !== undefined ||
    post.humanApproved !== undefined ||
    post.publishFailed !== undefined ||
    post.lastDispatchFingerprint !== undefined ||
    post.lastDispatchedAt !== undefined
      ? {
          ...post.deck,
          sourceMeta: {
            ...post.deck?.sourceMeta,
            ...(post.qualityPassed !== undefined ? { qualityPassed: post.qualityPassed } : {}),
            ...(post.groundingVerified !== undefined
              ? { groundingVerified: post.groundingVerified }
              : {}),
            ...(post.humanApproved !== undefined
              ? {
                  humanApproved: post.humanApproved,
                  userReviewed: post.humanApproved,
                }
              : {}),
            ...(post.publishFailed !== undefined ? { publishFailed: post.publishFailed } : {}),
            ...(post.lastDispatchFingerprint !== undefined
              ? { lastDispatchFingerprint: post.lastDispatchFingerprint }
              : {}),
            ...(post.lastDispatchedAt !== undefined
              ? { lastDispatchedAt: post.lastDispatchedAt }
              : {}),
          },
        }
      : post.deck;

  return {
    id: post.id,
    title: post.title,
    category: post.category,
    postStatus: post.postStatus,
    titleSignature: titleSignature || null,
    creatorHandle: post.creatorHandle || 'MARROK',
    slideCount: post.slideCount,
    qaPassed: post.qaPassed,
    scheduledFor: post.scheduledFor ? new Date(post.scheduledFor).toISOString() : null,
    publishTargets: JSON.stringify(post.publishTargets || []),
    hostedSlideUrls: JSON.stringify(post.hostedSlideUrls || []),
    tiktokHostedSlideUrls: JSON.stringify(post.tiktokHostedSlideUrls || []),
    cloudinaryPublicIds: JSON.stringify(post.cloudinaryPublicIds || []),
    cloudinaryCleanedAt: post.cloudinaryCleanedAt
      ? new Date(post.cloudinaryCleanedAt).toISOString()
      : null,
    bufferPostIds: JSON.stringify(post.bufferPostIds || []),
    zernioPostIds: JSON.stringify(post.zernioPostIds || []),
    deck: JSON.stringify(deckToPersist),
    createdAt: (post.createdAt ? new Date(post.createdAt) : new Date()).toISOString(),
    updatedAt: (post.updatedAt ? new Date(post.updatedAt) : new Date()).toISOString(),
    postedAt: post.postedAt ? new Date(post.postedAt).toISOString() : null,
  };
}

const UPSERT_ON_CONFLICT_SQL = `
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

export async function upsertPostgresPost(
  pool: pg.Pool,
  post: SavedPostRecord,
  titleSignature?: string
): Promise<SavedPostRecord> {
  await initPostgresSchema(pool);

  const p = preparePostRowParams(post, titleSignature);
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
    ${UPSERT_ON_CONFLICT_SQL}
  `;

  const values = [
    p.id,
    p.title,
    p.category,
    p.postStatus,
    p.titleSignature,
    p.creatorHandle,
    p.slideCount,
    p.qaPassed,
    p.scheduledFor ? new Date(p.scheduledFor) : null,
    p.publishTargets,
    p.hostedSlideUrls,
    p.tiktokHostedSlideUrls,
    p.cloudinaryPublicIds,
    p.cloudinaryCleanedAt ? new Date(p.cloudinaryCleanedAt) : null,
    p.bufferPostIds,
    p.zernioPostIds,
    p.deck,
    new Date(p.createdAt),
    new Date(p.updatedAt),
    p.postedAt ? new Date(p.postedAt) : null,
  ];

  const result = await pool.query(sql, values);
  return rowToSavedPostRecord(result.rows[0]);
}

/**
 * Atomically upserts multiple SavedPostRecords inside a single BEGIN/COMMIT transaction
 * using a single parameterized UNNEST bulk INSERT ... ON CONFLICT statement.
 */
export async function upsertPostgresPostsBatch(
  pool: pg.Pool,
  posts: SavedPostRecord[],
  getSignature?: (post: SavedPostRecord) => string
): Promise<SavedPostRecord[]> {
  if (posts.length === 0) return [];
  if (posts.length === 1) {
    const sig = getSignature ? getSignature(posts[0]) : undefined;
    return [await upsertPostgresPost(pool, posts[0], sig)];
  }

  await initPostgresSchema(pool);

  const prepared = posts.map((post) =>
    preparePostRowParams(post, getSignature ? getSignature(post) : undefined)
  );

  const unnestSql = `
    INSERT INTO saved_posts (
      id, title, category, post_status, title_signature, creator_handle,
      slide_count, qa_passed, scheduled_for, publish_targets, hosted_slide_urls,
      tiktok_hosted_slide_urls, cloudinary_public_ids, cloudinary_cleaned_at,
      buffer_post_ids, zernio_post_ids, deck, created_at, updated_at, posted_at
    )
    SELECT * FROM UNNEST(
      $1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[], $5::varchar[], $6::varchar[],
      $7::integer[], $8::boolean[], $9::timestamptz[], $10::jsonb[], $11::jsonb[],
      $12::jsonb[], $13::jsonb[], $14::timestamptz[],
      $15::jsonb[], $16::jsonb[], $17::jsonb[], $18::timestamptz[], $19::timestamptz[], $20::timestamptz[]
    )
    ${UPSERT_ON_CONFLICT_SQL}
  `;

  const colArrays = [
    prepared.map((r) => r.id),
    prepared.map((r) => r.title),
    prepared.map((r) => r.category),
    prepared.map((r) => r.postStatus),
    prepared.map((r) => r.titleSignature),
    prepared.map((r) => r.creatorHandle),
    prepared.map((r) => r.slideCount),
    prepared.map((r) => r.qaPassed),
    prepared.map((r) => r.scheduledFor),
    prepared.map((r) => r.publishTargets),
    prepared.map((r) => r.hostedSlideUrls),
    prepared.map((r) => r.tiktokHostedSlideUrls),
    prepared.map((r) => r.cloudinaryPublicIds),
    prepared.map((r) => r.cloudinaryCleanedAt),
    prepared.map((r) => r.bufferPostIds),
    prepared.map((r) => r.zernioPostIds),
    prepared.map((r) => r.deck),
    prepared.map((r) => r.createdAt),
    prepared.map((r) => r.updatedAt),
    prepared.map((r) => r.postedAt),
  ];

  const hasConnect = typeof (pool as unknown as { connect?: unknown }).connect === 'function';
  if (hasConnect) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(unnestSql, colArrays);
      await client.query('COMMIT');
      return (result.rows || []).map(rowToSavedPostRecord);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  await pool.query('BEGIN');
  try {
    const result = await pool.query(unnestSql, colArrays);
    await pool.query('COMMIT');
    return (result.rows || []).map(rowToSavedPostRecord);
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    throw err;
  }
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
  const runDelete = async (queryFn: pg.Pool['query']) => {
    try {
      await queryFn(
        `INSERT INTO deleted_post_tombstones (id, deleted_at) VALUES ($1, NOW())
         ON CONFLICT (id) DO UPDATE SET deleted_at = NOW();`,
        [id]
      );
    } catch {
      // Non-fatal if mock pool in unit test does not handle tombstone table
    }
    const result = await queryFn('DELETE FROM saved_posts WHERE id = $1;', [id]);
    return (result.rowCount ?? 0) > 0;
  };

  const hasConnect = typeof (pool as unknown as { connect?: unknown }).connect === 'function';
  if (hasConnect) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const deleted = await runDelete(client.query.bind(client) as pg.Pool['query']);
      await client.query('COMMIT');
      return deleted;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  return runDelete(pool.query.bind(pool));
}

export async function clearPostgresDeletedTombstone(pool: pg.Pool, id: string): Promise<void> {
  await initPostgresSchema(pool);
  try {
    await pool.query('DELETE FROM deleted_post_tombstones WHERE id = $1;', [id]);
  } catch {
    // Non-fatal
  }
}

function rowToTriageDecision(row: Record<string, unknown>): TriageDecisionRecord {
  return {
    id: String(row.id),
    topicId: String(row.topic_id || ''),
    topicSignature: row.topic_signature ? String(row.topic_signature) : undefined,
    sourceDomain: String(row.source_domain || ''),
    domainCategory: String(row.domain_category || 'DISTRIBUTED SYSTEMS'),
    action: (row.action as TriageAction) || 'skip',
    reason: row.reason ? (String(row.reason) as TriageSkipReason) : undefined,
    snoozeUntil: row.snooze_until
      ? row.snooze_until instanceof Date
        ? row.snooze_until.toISOString()
        : String(row.snooze_until)
      : null,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || new Date().toISOString()),
  };
}

export async function queryPostgresTriageDecisions(
  pool: pg.Pool,
  limit = 250
): Promise<TriageDecisionRecord[]> {
  await initPostgresSchema(pool);
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 250));
  const result = await pool.query(
    `SELECT * FROM inbox_triage_decisions ORDER BY created_at DESC LIMIT $1;`,
    [safeLimit]
  );
  return (result.rows || []).map(rowToTriageDecision);
}

export async function insertPostgresTriageDecision(
  pool: pg.Pool,
  decision: TriageDecisionRecord
): Promise<TriageDecisionRecord> {
  await initPostgresSchema(pool);
  const sql = `
    INSERT INTO inbox_triage_decisions (
      id, topic_id, topic_signature, source_domain, domain_category,
      action, reason, snooze_until, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (id) DO UPDATE SET
      action = EXCLUDED.action,
      reason = EXCLUDED.reason,
      snooze_until = EXCLUDED.snooze_until,
      created_at = EXCLUDED.created_at
    RETURNING *;
  `;
  const values = [
    decision.id,
    decision.topicId,
    decision.topicSignature || null,
    decision.sourceDomain,
    decision.domainCategory,
    decision.action,
    decision.reason || null,
    decision.snoozeUntil ? new Date(decision.snoozeUntil) : null,
    decision.createdAt ? new Date(decision.createdAt) : new Date(),
  ];
  const result = await pool.query(sql, values);
  return rowToTriageDecision(result.rows[0]);
}

export async function deletePostgresTriageDecision(pool: pg.Pool, id: string): Promise<boolean> {
  await initPostgresSchema(pool);
  const result = await pool.query('DELETE FROM inbox_triage_decisions WHERE id = $1;', [id]);
  return (result.rowCount ?? 0) > 0;
}


