import pg from 'pg';
import type {
  PublishDispatchState,
  PublishFailureCategory,
  PublishOutboxOperation,
  PublishOutboxPayloadSnapshot,
  PublishOutboxRecord,
  PublishScheduleMode,
  PublishTargetPlatform,
  SavedPostRecord,
  SavedPostStatus,
  TriageAction,
  TriageDecisionRecord,
  TriageSkipReason,
} from '../../src/types.ts';
import {
  StaleOutboxLeaseError,
  createNewOutboxRecord,
  evaluateExistingOutboxClaim,
  type ClaimOutboxDispatchOutcome,
  type ClaimOutboxDispatchParams,
} from '../../src/lib/publish/publishOutbox.ts';

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

    CREATE TABLE IF NOT EXISTS publish_outbox (
      id VARCHAR(80) PRIMARY KEY,
      post_id VARCHAR(64) NOT NULL,
      dispatch_fingerprint VARCHAR(64) NOT NULL UNIQUE,
      state VARCHAR(32) NOT NULL DEFAULT 'pending',
      mode VARCHAR(32) NOT NULL DEFAULT 'addToQueue',
      due_at TIMESTAMPTZ,
      timezone VARCHAR(64),
      targets JSONB NOT NULL DEFAULT '[]'::jsonb,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      lease_owner VARCHAR(128),
      lease_expires_at TIMESTAMPTZ,
      lease_generation INTEGER NOT NULL DEFAULT 0,
      next_retry_at TIMESTAMPTZ,
      last_error_category VARCHAR(48),
      last_error_message TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      operations JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    ALTER TABLE saved_posts ADD COLUMN IF NOT EXISTS cloudinary_cleaned_at TIMESTAMPTZ;
    ALTER TABLE publish_outbox ADD COLUMN IF NOT EXISTS lease_generation INTEGER NOT NULL DEFAULT 0;

    CREATE INDEX IF NOT EXISTS idx_saved_posts_status ON saved_posts(post_status);
    CREATE INDEX IF NOT EXISTS idx_saved_posts_scheduled_for ON saved_posts(scheduled_for);
    CREATE INDEX IF NOT EXISTS idx_saved_posts_updated_at ON saved_posts(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_saved_posts_signature ON saved_posts(title_signature);
    CREATE INDEX IF NOT EXISTS idx_inbox_triage_created_at ON inbox_triage_decisions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_inbox_triage_topic_id ON inbox_triage_decisions(topic_id);
    CREATE INDEX IF NOT EXISTS idx_publish_outbox_post_id ON publish_outbox(post_id);
    CREATE INDEX IF NOT EXISTS idx_publish_outbox_state ON publish_outbox(state);
    CREATE INDEX IF NOT EXISTS idx_publish_outbox_lease_expires ON publish_outbox(lease_expires_at);
    CREATE INDEX IF NOT EXISTS idx_publish_outbox_next_retry ON publish_outbox(next_retry_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_publish_outbox_active_post ON publish_outbox(post_id) WHERE state = 'dispatching';
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
  const sourceMetaExtended = sourceMeta as
    | (typeof sourceMeta & {
        outboxDispatchId?: string;
        outboxState?: PublishDispatchState;
        lastPublishError?: string;
      })
    | undefined;
  const outboxDispatchId =
    typeof sourceMetaExtended?.outboxDispatchId === 'string'
      ? sourceMetaExtended.outboxDispatchId
      : undefined;
  const outboxState =
    typeof sourceMetaExtended?.outboxState === 'string'
      ? sourceMetaExtended.outboxState
      : undefined;
  const lastPublishError =
    typeof sourceMetaExtended?.lastPublishError === 'string'
      ? sourceMetaExtended.lastPublishError
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
    ...(outboxDispatchId ? { outboxDispatchId } : {}),
    ...(outboxState ? { outboxState } : {}),
    ...(lastPublishError ? { lastPublishError } : {}),
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
    post.lastDispatchedAt !== undefined ||
    post.outboxDispatchId !== undefined ||
    post.outboxState !== undefined ||
    post.lastPublishError !== undefined
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
            ...(post.outboxDispatchId !== undefined
              ? { outboxDispatchId: post.outboxDispatchId }
              : {}),
            ...(post.outboxState !== undefined ? { outboxState: post.outboxState } : {}),
            ...(post.lastPublishError !== undefined
              ? { lastPublishError: post.lastPublishError }
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

function parseJsonColumn<T>(raw: unknown, fallback: T): T {
  if (raw && typeof raw === 'object') return raw as T;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function rowToOutboxRecord(row: Record<string, unknown>): PublishOutboxRecord {
  const targets = parsePublishTargets(parseJsonColumn(row.targets, [])) || [];
  const payload = parseJsonColumn<PublishOutboxPayloadSnapshot>(row.payload, {
    caption: '',
    mode: ((row.mode as PublishScheduleMode) || 'addToQueue'),
    targets,
    imageUrls: [],
    tiktokImageUrls: [],
    cloudinaryPublicIds: [],
  });
  const operations = parseJsonColumn<
    Partial<Record<PublishTargetPlatform, PublishOutboxOperation>>
  >(row.operations, {});

  return {
    id: String(row.id),
    postId: String(row.post_id),
    dispatchFingerprint: String(row.dispatch_fingerprint),
    state: (row.state as PublishDispatchState) || 'pending',
    mode: (row.mode as PublishScheduleMode) || 'addToQueue',
    dueAt: row.due_at
      ? row.due_at instanceof Date
        ? row.due_at.toISOString()
        : String(row.due_at)
      : undefined,
    timezone: row.timezone ? String(row.timezone) : undefined,
    targets,
    attemptCount: Number(row.attempt_count ?? 0),
    maxAttempts: Number(row.max_attempts ?? 3),
    leaseOwner: row.lease_owner ? String(row.lease_owner) : null,
    leaseExpiresAt: row.lease_expires_at
      ? row.lease_expires_at instanceof Date
        ? row.lease_expires_at.toISOString()
        : String(row.lease_expires_at)
      : null,
    leaseGeneration: Number(row.lease_generation ?? 0),
    nextRetryAt: row.next_retry_at
      ? row.next_retry_at instanceof Date
        ? row.next_retry_at.toISOString()
        : String(row.next_retry_at)
      : null,
    lastErrorCategory: row.last_error_category
      ? (String(row.last_error_category) as PublishFailureCategory)
      : null,
    lastErrorMessage: row.last_error_message ? String(row.last_error_message) : null,
    payload,
    operations,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at || new Date().toISOString()),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at || new Date().toISOString()),
    completedAt: row.completed_at
      ? row.completed_at instanceof Date
        ? row.completed_at.toISOString()
        : String(row.completed_at)
      : null,
  };
}

/**
 * Atomically claims or resumes a durable publishing outbox dispatch in PostgreSQL.
 * Coordinates across serverless instances using row leases (`lease_owner`, `lease_expires_at`)
 * and unique `dispatch_fingerprint` + active `post_id` guards.
 */
export async function claimPostgresOutboxDispatch(
  pool: pg.Pool,
  params: ClaimOutboxDispatchParams
): Promise<ClaimOutboxDispatchOutcome> {
  await initPostgresSchema(pool);
  const nowDate = new Date(params.nowMs ?? Date.now());

  const runClaim = async (queryFn: pg.Pool['query']): Promise<ClaimOutboxDispatchOutcome> => {
    const activePostRes = await queryFn(
      `SELECT * FROM publish_outbox
       WHERE post_id = $1
         AND dispatch_fingerprint <> $2
         AND state = 'dispatching'
         AND lease_expires_at > $3
       LIMIT 1
       FOR UPDATE;`,
      [params.postId, params.dispatchFingerprint, nowDate]
    );
    if (activePostRes.rows && activePostRes.rows.length > 0) {
      return {
        status: 'in_flight',
        record: rowToOutboxRecord(activePostRes.rows[0] as Record<string, unknown>),
      };
    }

    if (params.cancelExistingBeforeDispatch) {
      await queryFn(
        `UPDATE publish_outbox
         SET state = 'cancelled',
             lease_owner = NULL,
             lease_expires_at = NULL,
             lease_generation = lease_generation + 1,
             next_retry_at = NULL,
             updated_at = $2
         WHERE post_id = $1
           AND dispatch_fingerprint <> $3
           AND state NOT IN ('completed', 'cancelled')
           AND NOT (state = 'dispatching' AND lease_expires_at > $2);`,
        [params.postId, nowDate, params.dispatchFingerprint]
      );
    }

    const existingRes = await queryFn(
      'SELECT * FROM publish_outbox WHERE dispatch_fingerprint = $1 LIMIT 1 FOR UPDATE;',
      [params.dispatchFingerprint]
    );

    if (!existingRes.rows || existingRes.rows.length === 0) {
      const created = createNewOutboxRecord(params);
      const insertSql = `
        INSERT INTO publish_outbox (
          id, post_id, dispatch_fingerprint, state, mode, due_at, timezone,
          targets, attempt_count, max_attempts, lease_owner, lease_expires_at,
          next_retry_at, last_error_category, last_error_message, payload, operations,
          created_at, updated_at, completed_at, lease_generation
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8::jsonb, $9, $10, $11, $12,
          $13, $14, $15, $16::jsonb, $17::jsonb,
          $18, $19, $20, $21
        )
        ON CONFLICT DO NOTHING
        RETURNING *;
      `;
      const insertRes = await queryFn(insertSql, [
        created.id,
        created.postId,
        created.dispatchFingerprint,
        created.state,
        created.mode,
        created.dueAt ? new Date(created.dueAt) : null,
        created.timezone || null,
        JSON.stringify(created.targets),
        created.attemptCount,
        created.maxAttempts,
        created.leaseOwner || null,
        created.leaseExpiresAt ? new Date(created.leaseExpiresAt) : null,
        null,
        null,
        null,
        JSON.stringify(created.payload),
        JSON.stringify(created.operations),
        new Date(created.createdAt),
        new Date(created.updatedAt),
        null,
        created.leaseGeneration ?? 1,
      ]);

      if (insertRes.rows && insertRes.rows.length > 0) {
        return {
          status: 'claimed',
          record: rowToOutboxRecord(insertRes.rows[0] as Record<string, unknown>),
          recoveredFromInterrupt: false,
        };
      }

      // Lost unique-constraint race against concurrent serverless instance (same fingerprint OR active post_id)
      const racedRes = await queryFn(
        'SELECT * FROM publish_outbox WHERE dispatch_fingerprint = $1 LIMIT 1;',
        [params.dispatchFingerprint]
      );
      if (racedRes.rows && racedRes.rows.length > 0) {
        const racedRecord = rowToOutboxRecord(racedRes.rows[0] as Record<string, unknown>);
        if (racedRecord.state === 'completed') {
          return { status: 'already_completed', record: racedRecord };
        }
        return { status: 'in_flight', record: racedRecord };
      }

      const activeRaceRes = await queryFn(
        `SELECT * FROM publish_outbox
         WHERE post_id = $1 AND state = 'dispatching'
         LIMIT 1;`,
        [params.postId]
      );
      if (activeRaceRes.rows && activeRaceRes.rows.length > 0) {
        return {
          status: 'in_flight',
          record: rowToOutboxRecord(activeRaceRes.rows[0] as Record<string, unknown>),
        };
      }
      return { status: 'in_flight', record: created };
    }

    const existingRecord = rowToOutboxRecord(existingRes.rows[0] as Record<string, unknown>);
    const outcome = evaluateExistingOutboxClaim(existingRecord, params);
    if (outcome.status !== 'claimed') {
      if (
        outcome.status === 'permanent_or_exhausted' &&
        existingRecord.state === 'dispatching' &&
        outcome.record.state !== 'dispatching'
      ) {
        // Persist finalized state so expired exhausted dispatching rows release active lease index
        await checkpointPostgresOutboxRecord(pool, outcome.record).catch(() => undefined);
      }
      return outcome;
    }

    const next = outcome.record;
    const nextGeneration = next.leaseGeneration ?? (existingRecord.leaseGeneration ?? 0) + 1;
    const updateSql = `
      UPDATE publish_outbox
      SET id = $2,
          state = $3,
          mode = $4,
          due_at = $5,
          timezone = $6,
          targets = $7::jsonb,
          attempt_count = $8,
          max_attempts = $9,
          lease_owner = $10,
          lease_expires_at = $11,
          next_retry_at = $12,
          last_error_category = $13,
          last_error_message = $14,
          payload = $15::jsonb,
          operations = $16::jsonb,
          updated_at = $17,
          completed_at = $18,
          lease_generation = $19
      WHERE dispatch_fingerprint = $1
        AND (
          state IN ('pending', 'partially_completed', 'failed_retryable', 'cancelled')
          OR (state = 'dispatching' AND (lease_expires_at IS NULL OR lease_expires_at <= $20))
        )
      RETURNING *;
    `;
    const updatedRes = await queryFn(updateSql, [
      next.dispatchFingerprint,
      next.id,
      next.state,
      next.mode,
      next.dueAt ? new Date(next.dueAt) : null,
      next.timezone || null,
      JSON.stringify(next.targets),
      next.attemptCount,
      next.maxAttempts,
      next.leaseOwner || null,
      next.leaseExpiresAt ? new Date(next.leaseExpiresAt) : null,
      next.nextRetryAt ? new Date(next.nextRetryAt) : null,
      next.lastErrorCategory || null,
      next.lastErrorMessage || null,
      JSON.stringify(next.payload),
      JSON.stringify(next.operations),
      new Date(next.updatedAt),
      next.completedAt ? new Date(next.completedAt) : null,
      nextGeneration,
      nowDate,
    ]);

    if (!updatedRes.rows || updatedRes.rows.length === 0) {
      const latestRes = await queryFn(
        'SELECT * FROM publish_outbox WHERE dispatch_fingerprint = $1 LIMIT 1;',
        [params.dispatchFingerprint]
      );
      if (latestRes.rows && latestRes.rows.length > 0) {
        return {
          status: 'in_flight',
          record: rowToOutboxRecord(latestRes.rows[0] as Record<string, unknown>),
        };
      }
      return { status: 'in_flight', record: existingRecord };
    }

    return {
      status: 'claimed',
      record: rowToOutboxRecord(updatedRes.rows[0] as Record<string, unknown>),
      recoveredFromInterrupt: outcome.recoveredFromInterrupt,
    };
  };

  const hasConnect = typeof (pool as unknown as { connect?: unknown }).connect === 'function';
  if (hasConnect) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const outcome = await runClaim(client.query.bind(client) as pg.Pool['query']);
      await client.query('COMMIT');
      return outcome;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  return runClaim(pool.query.bind(pool));
}

export async function checkpointPostgresOutboxRecord(
  pool: pg.Pool,
  record: PublishOutboxRecord
): Promise<PublishOutboxRecord> {
  await initPostgresSchema(pool);
  const expectedGeneration =
    typeof record.leaseGeneration === 'number' && Number.isFinite(record.leaseGeneration)
      ? record.leaseGeneration
      : null;

  const sql = `
    UPDATE publish_outbox
    SET state = $2,
        targets = $3::jsonb,
        attempt_count = $4,
        lease_owner = $5,
        lease_expires_at = $6,
        next_retry_at = $7,
        last_error_category = $8,
        last_error_message = $9,
        operations = $10::jsonb,
        updated_at = $11,
        completed_at = $12
    WHERE dispatch_fingerprint = $1
      AND ($13::integer IS NULL OR lease_generation = $13)
      AND (state <> 'cancelled' OR $2 = 'cancelled')
    RETURNING *;
  `;
  const result = await pool.query(sql, [
    record.dispatchFingerprint,
    record.state,
    JSON.stringify(record.targets),
    record.attemptCount,
    record.leaseOwner ?? null,
    record.leaseExpiresAt ? new Date(record.leaseExpiresAt) : null,
    record.nextRetryAt ? new Date(record.nextRetryAt) : null,
    record.lastErrorCategory ?? null,
    record.lastErrorMessage ?? null,
    JSON.stringify(record.operations),
    new Date(record.updatedAt || new Date().toISOString()),
    record.completedAt ? new Date(record.completedAt) : null,
    expectedGeneration,
  ]);
  if (result.rows && result.rows.length > 0) {
    return rowToOutboxRecord(result.rows[0] as Record<string, unknown>);
  }

  // Distinguish missing row from fencing/cancellation conflict
  const currentRes = await pool.query(
    'SELECT * FROM publish_outbox WHERE dispatch_fingerprint = $1 LIMIT 1;',
    [record.dispatchFingerprint]
  );
  if (currentRes.rows && currentRes.rows.length > 0) {
    const current = currentRes.rows[0] as Record<string, unknown>;
    const currentGen = Number(current.lease_generation ?? 0);
    if (String(current.state || '') === 'cancelled' && record.state !== 'cancelled') {
      throw new StaleOutboxLeaseError(
        'Outbox dispatch was cancelled while worker was in flight; rejecting state transition.'
      );
    }
    throw new StaleOutboxLeaseError(
      `Stale worker attempted checkpoint (stored generation ${currentGen} !== worker ${expectedGeneration}).`
    );
  }

  return record;
}

export async function queryPostgresOutboxDispatches(
  pool: pg.Pool,
  options: {
    postId?: string;
    recoverableOnly?: boolean;
    ignoreBackoff?: boolean;
    nowMs?: number;
    limit?: number;
  } = {}
): Promise<PublishOutboxRecord[]> {
  await initPostgresSchema(pool);
  const safeLimit = Math.max(1, Math.min(200, Number(options.limit) || 100));
  const nowDate = new Date(options.nowMs ?? Date.now());
  const ignoreBackoff = Boolean(options.ignoreBackoff);

  if (options.postId) {
    const res = await pool.query(
      `SELECT * FROM publish_outbox WHERE post_id = $1 ORDER BY updated_at DESC LIMIT $2;`,
      [options.postId, safeLimit]
    );
    const rows = (res.rows || []).map((r) => rowToOutboxRecord(r as Record<string, unknown>));
    if (!options.recoverableOnly) return rows;
    return rows.filter((r) => {
      if (r.attemptCount >= r.maxAttempts) return false;
      const leaseMs = r.leaseExpiresAt ? Date.parse(r.leaseExpiresAt) : NaN;
      const nextRetryMs = r.nextRetryAt ? Date.parse(r.nextRetryAt) : NaN;
      const backoffReady = ignoreBackoff || !Number.isFinite(nextRetryMs) || nextRetryMs <= nowDate.getTime();
      return (
        (backoffReady && (r.state === 'partially_completed' || r.state === 'failed_retryable')) ||
        (r.state === 'dispatching' && (!Number.isFinite(leaseMs) || leaseMs <= nowDate.getTime()))
      );
    });
  }

  if (options.recoverableOnly) {
    const res = await pool.query(
      `SELECT * FROM publish_outbox
       WHERE attempt_count < max_attempts
         AND (
           (
             state IN ('partially_completed', 'failed_retryable')
             AND ($3::boolean = true OR next_retry_at IS NULL OR next_retry_at <= $1)
           )
           OR (state = 'dispatching' AND (lease_expires_at IS NULL OR lease_expires_at <= $1))
         )
       ORDER BY updated_at ASC
       LIMIT $2;`,
      [nowDate, safeLimit, ignoreBackoff]
    );
    return (res.rows || []).map((r) => rowToOutboxRecord(r as Record<string, unknown>));
  }

  const res = await pool.query(
    `SELECT * FROM publish_outbox ORDER BY updated_at DESC LIMIT $1;`,
    [safeLimit]
  );
  return (res.rows || []).map((r) => rowToOutboxRecord(r as Record<string, unknown>));
}

export async function cancelPostgresOutboxDispatchesForPost(
  pool: pg.Pool,
  postId: string
): Promise<void> {
  await initPostgresSchema(pool);
  await pool.query(
    `UPDATE publish_outbox
     SET state = 'cancelled',
         lease_owner = NULL,
         lease_expires_at = NULL,
         lease_generation = lease_generation + 1,
         next_retry_at = NULL,
         updated_at = NOW()
     WHERE post_id = $1
       AND state NOT IN ('completed', 'cancelled');`,
    [postId]
  );
}



