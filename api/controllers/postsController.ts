import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { Request, Response } from 'express';
import type {
  CarouselData,
  SavedPostRecord,
  SavedPostStatus,
  SavedPostStorageEngine,
} from '../../src/types.ts';
import { getServerConfig } from '../config.ts';
import { parseCarouselData } from '../../src/lib/validation/carousel.ts';
import { sanitizeFullCarousel } from '../../src/lib/textSanitizer.ts';
import { runQAChecks } from '../../src/lib/qaChecks.ts';
import { runPlatformRiskChecks } from '../../src/lib/riskChecks.ts';
import {
  DEFAULT_POSTS_PAGE_SIZE,
  MAX_POSTS_PAGE_SIZE,
  decodePostsCursor,
  encodePostsCursor,
  getPostgresPool,
  queryPostgresPostById,
  queryPostgresPosts,
  queryPostgresPostsPage,
  queryPostgresDeletedIds,
  upsertPostgresPost,
  upsertPostgresPostsBatch,
  deletePostgresPost,
  clearPostgresDeletedTombstone,
  type DecodedPostsCursor,
  type PostsStatusFilter,
} from '../db/postgres.ts';

const MAX_SAVED_POSTS = 500;
const VALID_STATUS_FILTERS = new Set<PostsStatusFilter>(['validated', 'posted', 'scheduled']);

function compareSavedPostsDesc(a: SavedPostRecord, b: SavedPostRecord): number {
  const aMs = Date.parse(a.updatedAt || a.createdAt || '');
  const bMs = Date.parse(b.updatedAt || b.createdAt || '');
  const safeA = Number.isFinite(aMs) ? aMs : 0;
  const safeB = Number.isFinite(bMs) ? bMs : 0;
  if (safeB !== safeA) return safeB - safeA;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

function matchesStatusFilter(post: SavedPostRecord, status?: PostsStatusFilter): boolean {
  if (!status) return true;
  if (status === 'posted') return post.postStatus === 'posted';
  if (status === 'validated') return post.postStatus === 'validated';
  if (status === 'scheduled') {
    return post.postStatus !== 'posted' && Boolean(post.scheduledFor);
  }
  return true;
}

function isStrictlyBeforeCursor(post: SavedPostRecord, cursor: DecodedPostsCursor): boolean {
  const postMs = Date.parse(post.updatedAt || post.createdAt || '');
  const cursorMs = Date.parse(cursor.updatedAt);
  const safePostMs = Number.isFinite(postMs) ? postMs : 0;
  const safeCursorMs = Number.isFinite(cursorMs) ? cursorMs : 0;
  if (safePostMs !== safeCursorMs) {
    return safePostMs < safeCursorMs;
  }
  return post.id < cursor.id;
}

export class VaultPersistenceUnavailableError extends Error {
  status: number;
  code: string;
  constructor(
    message = 'Durable Vault persistence is unavailable.',
    status = 503,
    code = 'VAULT_PERSISTENCE_UNAVAILABLE'
  ) {
    super(message);
    this.name = 'VaultPersistenceUnavailableError';
    this.status = status;
    this.code = code;
  }
}

function isProductionServerlessVaultRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnv = (env.NODE_ENV || '').trim().toLowerCase();
  const isVitest = env.VITEST === 'true' || nodeEnv === 'test';
  if (isVitest) return false;
  const isServerless = Boolean(
    env.VERCEL ||
      env.VERCEL_ENV ||
      env.NETLIFY ||
      env.AWS_LAMBDA_FUNCTION_NAME
  );
  return isServerless && nodeEnv === 'production';
}

const serverDeletedIdsMemory = new Set<string>();

function resolveDeletedIdsFilePath(env: NodeJS.ProcessEnv = process.env): string {
  const { filePath } = resolveStorageFilePath(env);
  return `${filePath}.deleted.json`;
}

async function readDeletedIdsFromDisk(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const target = resolveDeletedIdsFilePath(env);
  try {
    const raw = await fs.readFile(target, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    }
  } catch {
    // Ignore if file does not exist yet
  }
  return [];
}

async function writeDeletedIdsToDisk(
  ids: Iterable<string>,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const target = resolveDeletedIdsFilePath(env);
  const list = Array.from(new Set(ids)).slice(0, 500);
  try {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(list, null, 2), 'utf-8');
  } catch {
    // Non-fatal if read-only
  }
}

export async function loadServerDeletedPostIds(
  env: NodeJS.ProcessEnv = process.env
): Promise<Set<string>> {
  const combined = new Set<string>();
  const isCustomTestStore = Boolean(env.POSTS_STORAGE_FILE && env.POSTS_STORAGE_FILE.trim());
  if (!isCustomTestStore) {
    for (const id of serverDeletedIdsMemory) combined.add(id);
  }

  const diskIds = await readDeletedIdsFromDisk(env);
  for (const id of diskIds) combined.add(id);

  const config = getServerConfig(env);
  if (config.databaseUrl) {
    try {
      const pool = getPostgresPool(config.databaseUrl);
      if (pool) {
        const pgDeleted = await queryPostgresDeletedIds(pool);
        for (const id of pgDeleted) combined.add(id);
      }
    } catch {
      // Ignore Postgres tombstone read errors
    }
  }

  return combined;
}

export async function recordServerDeletedPostId(
  id: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const clean = String(id || '').trim();
  if (!clean) return;
  serverDeletedIdsMemory.add(clean);

  const config = getServerConfig(env);
  if (config.databaseUrl) {
    try {
      const pool = getPostgresPool(config.databaseUrl);
      if (!pool) {
        throw new VaultPersistenceUnavailableError(
          'PostgreSQL pool is unavailable for post deletion.'
        );
      }
      await deletePostgresPost(pool, clean);
      return;
    } catch (pgErr) {
      if (pgErr instanceof VaultPersistenceUnavailableError) throw pgErr;
      console.error('[PostsController] Failed to record deletion tombstone in Postgres:', pgErr);
      throw new VaultPersistenceUnavailableError(
        `Durable Vault delete failed in PostgreSQL: ${pgErr instanceof Error ? pgErr.message : 'database error'}`
      );
    }
  }

  const current = await loadServerDeletedPostIds(env);
  current.add(clean);
  await writeDeletedIdsToDisk(current, env);
}

export async function clearServerDeletedPostId(
  id: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const clean = String(id || '').trim();
  if (!clean) return;
  serverDeletedIdsMemory.delete(clean);

  const config = getServerConfig(env);
  if (config.databaseUrl) {
    try {
      const pool = getPostgresPool(config.databaseUrl);
      if (!pool) {
        throw new VaultPersistenceUnavailableError(
          'PostgreSQL pool is unavailable to clear deletion tombstone.'
        );
      }
      await clearPostgresDeletedTombstone(pool, clean);
      return;
    } catch (pgErr) {
      if (pgErr instanceof VaultPersistenceUnavailableError) throw pgErr;
      console.warn('[PostsController] Failed to clear tombstone in Postgres:', pgErr);
      throw new VaultPersistenceUnavailableError(
        `Durable Vault tombstone update failed in PostgreSQL: ${pgErr instanceof Error ? pgErr.message : 'database error'}`
      );
    }
  }

  const current = await loadServerDeletedPostIds(env);
  if (current.has(clean)) {
    current.delete(clean);
    await writeDeletedIdsToDisk(current, env);
  }
}

/**
 * @deprecated Legacy cross-origin Vault sync is permanently retired in Phase 2.2.
 * Returns null unconditionally to enforce single authoritative PostgreSQL storage.
 */
export function shouldSyncWithRemoteVault(_env?: NodeJS.ProcessEnv): string | null {
  return null;
}

export function getBundledSeedPosts(): SavedPostRecord[] {
  return [];
}

/**
 * Resolves a writable file path for ephemeral test/serverless fallback storage.
 * Primary persistence uses Neon PostgreSQL + Browser IndexedDB without local repo JSON seed files.
 */
export function resolveStorageFilePath(env: NodeJS.ProcessEnv = process.env): {
  filePath: string;
  engine: SavedPostStorageEngine;
} {
  if (env.POSTS_STORAGE_FILE && env.POSTS_STORAGE_FILE.trim()) {
    return {
      filePath: env.POSTS_STORAGE_FILE.trim(),
      engine: env.VERCEL || env.VERCEL_ENV ? 'vercel-tmp' : 'local-disk',
    };
  }
  return {
    filePath: path.join(os.tmpdir(), 'marrok-saved-posts.json'),
    engine: 'vercel-tmp',
  };
}

async function readFromFileStore(env: NodeJS.ProcessEnv = process.env): Promise<{
  posts: SavedPostRecord[];
  engine: SavedPostStorageEngine;
}> {
  const { filePath, engine } = resolveStorageFilePath(env);
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { posts: parsed, engine };
    }
  } catch {
    // Return empty list when ephemeral store has not been written yet
  }
  return { posts: [], engine };
}

async function writeToFileStore(
  posts: SavedPostRecord[],
  env: NodeJS.ProcessEnv = process.env
): Promise<SavedPostStorageEngine> {
  const resolved = resolveStorageFilePath(env);
  const filePath = resolved.filePath;
  const engine = resolved.engine;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(posts, null, 2), 'utf-8');
    return engine;
  } catch {
    const tmpFallback = path.join(os.tmpdir(), 'marrok-saved-posts.json');
    await fs.mkdir(path.dirname(tmpFallback), { recursive: true });
    await fs.writeFile(tmpFallback, JSON.stringify(posts, null, 2), 'utf-8');
    return 'vercel-tmp';
  }
}

/**
 * READ-PURE loader for GET endpoints (/api/posts, /api/publish/status).
 * Authoritative source is Neon Serverless PostgreSQL.
 * Ephemeral file store is strictly for local dev/testing environments.
 */
export async function loadStoredPosts(
  env: NodeJS.ProcessEnv = process.env,
  options: { strictDatabase?: boolean } = {}
): Promise<{
  posts: SavedPostRecord[];
  storageEngine: SavedPostStorageEngine;
  isCloudPersistent: boolean;
  deletedIds?: string[];
}> {
  const config = getServerConfig(env);
  const deletedIds = await loadServerDeletedPostIds(env);

  // 1. Authoritative Neon Serverless PostgreSQL Cloud Persistence (READ-PURE)
  if (config.databaseUrl) {
    try {
      const pool = getPostgresPool(config.databaseUrl);
      if (pool) {
        const pgPosts = (await queryPostgresPosts(pool)).filter((p) => !deletedIds.has(p.id));
        return {
          posts: deduplicateSavedPosts(pgPosts),
          storageEngine: 'neon-postgres',
          isCloudPersistent: true,
          deletedIds: Array.from(deletedIds),
        };
      }
      if (options.strictDatabase) {
        throw new VaultPersistenceUnavailableError(
          'PostgreSQL pool is unavailable for Vault reads.',
          502
        );
      }
    } catch (pgErr) {
      if (pgErr instanceof VaultPersistenceUnavailableError) throw pgErr;
      if (options.strictDatabase) {
        console.error('[PostsStore] Neon PostgreSQL query failed (fail-closed):', pgErr);
        throw new VaultPersistenceUnavailableError(
          `Neon PostgreSQL read failed: ${pgErr instanceof Error ? pgErr.message : 'database error'}`,
          502
        );
      }
      console.warn('[PostsStore] Neon PostgreSQL query failed, falling back to ephemeral store:', pgErr);
    }
  } else if (
    options.strictDatabase &&
    isProductionServerlessVaultRuntime(env)
  ) {
    throw new VaultPersistenceUnavailableError(
      'DATABASE_URL is required for durable Vault persistence in production serverless environments.',
      503
    );
  }

  // 2. Ephemeral Local File Store (strictly for local dev & offline test runners)
  const { posts: rawLocalPosts, engine } = await readFromFileStore(env);
  const localPosts = deduplicateSavedPosts(rawLocalPosts.filter((p) => !deletedIds.has(p.id)));

  return {
    posts: localPosts,
    storageEngine: engine,
    isCloudPersistent: engine === 'local-disk',
    deletedIds: Array.from(deletedIds),
  };
}

export interface LoadStoredPostsPageOptions {
  strictDatabase?: boolean;
  limit?: number;
  cursor?: DecodedPostsCursor | null;
  status?: PostsStatusFilter;
}

export interface LoadStoredPostsPageResult {
  posts: SavedPostRecord[];
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
  storageEngine: SavedPostStorageEngine;
  isCloudPersistent: boolean;
  deletedIds: string[];
}

/**
 * READ-PURE keyset-paginated loader for GET /api/posts.
 * Uses deterministic `(updated_at DESC, id DESC)` ordering so identical timestamps,
 * concurrent updates, and deletions never skip or duplicate records across page boundaries.
 */
export async function loadStoredPostsPage(
  env: NodeJS.ProcessEnv = process.env,
  options: LoadStoredPostsPageOptions = {}
): Promise<LoadStoredPostsPageResult> {
  const config = getServerConfig(env);
  const deletedIds = await loadServerDeletedPostIds(env);
  const safeLimit = Math.max(
    1,
    Math.min(MAX_POSTS_PAGE_SIZE, Math.floor(options.limit ?? DEFAULT_POSTS_PAGE_SIZE))
  );

  // 1. Authoritative Neon Serverless PostgreSQL
  if (config.databaseUrl) {
    try {
      const pool = getPostgresPool(config.databaseUrl);
      if (pool) {
        const page = await queryPostgresPostsPage(pool, {
          limit: safeLimit,
          cursor: options.cursor ?? null,
          status: options.status,
        });
        const visiblePosts = page.posts.filter((p) => !deletedIds.has(p.id));
        return {
          posts: visiblePosts,
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          limit: page.limit,
          storageEngine: 'neon-postgres',
          isCloudPersistent: true,
          deletedIds: Array.from(deletedIds),
        };
      }
      if (options.strictDatabase) {
        throw new VaultPersistenceUnavailableError(
          'PostgreSQL pool is unavailable for Vault reads.',
          502
        );
      }
    } catch (pgErr) {
      if (pgErr instanceof VaultPersistenceUnavailableError) throw pgErr;
      if (options.strictDatabase) {
        console.error('[PostsStore] Neon PostgreSQL paginated query failed (fail-closed):', pgErr);
        throw new VaultPersistenceUnavailableError(
          `Neon PostgreSQL read failed: ${pgErr instanceof Error ? pgErr.message : 'database error'}`,
          502
        );
      }
      console.warn('[PostsStore] Neon PostgreSQL paginated query failed, falling back to ephemeral store:', pgErr);
    }
  } else if (options.strictDatabase && isProductionServerlessVaultRuntime(env)) {
    throw new VaultPersistenceUnavailableError(
      'DATABASE_URL is required for durable Vault persistence in production serverless environments.',
      503
    );
  }

  // 2. Ephemeral Local File Store (local dev & offline tests) — mirrors exact SQL keyset semantics
  const { posts: rawLocalPosts, engine } = await readFromFileStore(env);
  const byId = new Map<string, SavedPostRecord>();
  for (const post of rawLocalPosts) {
    if (!post || typeof post.id !== 'string' || deletedIds.has(post.id)) continue;
    const prev = byId.get(post.id);
    if (!prev || isIncomingPostPreferred(post, prev)) {
      byId.set(post.id, post);
    }
  }

  const ordered = Array.from(byId.values())
    .filter((p) => matchesStatusFilter(p, options.status))
    .sort(compareSavedPostsDesc);

  const afterCursor = options.cursor
    ? ordered.filter((p) => isStrictlyBeforeCursor(p, options.cursor!))
    : ordered;

  const hasMore = afterCursor.length > safeLimit;
  const pagePosts = hasMore ? afterCursor.slice(0, safeLimit) : afterCursor;
  const tail = pagePosts[pagePosts.length - 1];
  const nextCursor = hasMore && tail ? encodePostsCursor(tail.updatedAt, tail.id) : null;

  return {
    posts: pagePosts,
    nextCursor,
    hasMore,
    limit: safeLimit,
    storageEngine: engine,
    isCloudPersistent: engine === 'local-disk',
    deletedIds: Array.from(deletedIds),
  };
}

/**
 * Persists a single SavedPostRecord cleanly with a single-row UPSERT in Postgres.
 * Fails closed in production serverless when PostgreSQL is unavailable.
 */
export async function upsertSingleStoredPost(
  post: SavedPostRecord,
  existingListHint?: SavedPostRecord[],
  env: NodeJS.ProcessEnv = process.env
): Promise<SavedPostStorageEngine> {
  const config = getServerConfig(env);
  const sig = normalizePostTitleSignature(post);

  // 1. Authoritative Neon Serverless PostgreSQL (single-row UPSERT; fail-closed on PG failure)
  if (config.databaseUrl) {
    try {
      const pool = getPostgresPool(config.databaseUrl);
      if (!pool) {
        throw new VaultPersistenceUnavailableError(
          'PostgreSQL pool is unavailable for post save.'
        );
      }
      await upsertPostgresPost(pool, post, sig);
      return 'neon-postgres';
    } catch (pgErr) {
      if (pgErr instanceof VaultPersistenceUnavailableError) throw pgErr;
      console.error('[PostsStore] Neon PostgreSQL single-row upsert failed (fail-closed):', pgErr);
      throw new VaultPersistenceUnavailableError(
        `Durable Vault save failed in PostgreSQL: ${pgErr instanceof Error ? pgErr.message : 'database error'}`
      );
    }
  }

  // Never silently claim durable write success onto ephemeral /tmp in production serverless
  if (isProductionServerlessVaultRuntime(env)) {
    throw new VaultPersistenceUnavailableError(
      'DATABASE_URL is required for durable Vault persistence in production serverless environments.'
    );
  }

  const baseList = existingListHint ?? (await loadStoredPosts(env)).posts;
  const merged = deduplicateSavedPosts([post, ...baseList.filter((p) => p.id !== post.id)]).slice(
    0,
    MAX_SAVED_POSTS
  );

  return await writeToFileStore(merged, env);
}

/**
 * Deletes a single post and persists tombstone without rewriting remaining Postgres rows.
 */
export async function deleteSingleStoredPost(
  id: string,
  existingListHint?: SavedPostRecord[],
  env: NodeJS.ProcessEnv = process.env
): Promise<SavedPostStorageEngine> {
  const cleanId = String(id || '').trim();
  const config = getServerConfig(env);

  if (cleanId) {
    await recordServerDeletedPostId(cleanId, env);
  }

  if (config.databaseUrl) {
    const pool = getPostgresPool(config.databaseUrl);
    if (!pool) {
      throw new VaultPersistenceUnavailableError(
        'PostgreSQL pool is unavailable for post delete.'
      );
    }
    return 'neon-postgres';
  }

  if (isProductionServerlessVaultRuntime(env)) {
    throw new VaultPersistenceUnavailableError(
      'DATABASE_URL is required for durable Vault deletion in production serverless environments.'
    );
  }

  const baseList = existingListHint ?? (await loadStoredPosts(env)).posts;
  const filtered = baseList.filter((p) => p.id !== cleanId);

  return await writeToFileStore(filtered, env);
}

export async function saveStoredPosts(
  posts: SavedPostRecord[],
  env: NodeJS.ProcessEnv = process.env
): Promise<SavedPostStorageEngine> {
  const deduped = deduplicateSavedPosts(posts);
  const sorted = [...deduped]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_SAVED_POSTS);

  const config = getServerConfig(env);

  // 1. Authoritative Neon Serverless PostgreSQL (Transactional UNNEST Batch; fail-closed on PG failure)
  if (config.databaseUrl) {
    try {
      const pool = getPostgresPool(config.databaseUrl);
      if (!pool) {
        throw new VaultPersistenceUnavailableError(
          'PostgreSQL pool is unavailable for batch save.'
        );
      }
      await upsertPostgresPostsBatch(pool, sorted, normalizePostTitleSignature);
      return 'neon-postgres';
    } catch (pgErr) {
      if (pgErr instanceof VaultPersistenceUnavailableError) throw pgErr;
      console.error('[PostsStore] Neon PostgreSQL batch save failed (fail-closed):', pgErr);
      throw new VaultPersistenceUnavailableError(
        `Durable Vault batch save failed in PostgreSQL: ${pgErr instanceof Error ? pgErr.message : 'database error'}`
      );
    }
  }

  if (isProductionServerlessVaultRuntime(env)) {
    throw new VaultPersistenceUnavailableError(
      'DATABASE_URL is required for durable Vault persistence in production serverless environments.'
    );
  }

  return await writeToFileStore(sorted, env);
}

function normalizePostTitleSignature(post: SavedPostRecord): string {
  const rawTitle = (post.title || post.deck?.slides?.[0]?.enTitle || '')
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, '');
  const format = post.deck?.postFormat || (post.slideCount === 1 ? 'single' : 'carousel');
  return rawTitle ? `${rawTitle}::${format}` : `id::${post.id}`;
}

function isIncomingPostPreferred(candidate: SavedPostRecord, current: SavedPostRecord): boolean {
  const candTime = Date.parse(candidate.updatedAt || candidate.createdAt || '');
  const currTime = Date.parse(current.updatedAt || current.createdAt || '');
  if (Number.isFinite(candTime) && Number.isFinite(currTime) && candTime !== currTime) {
    return candTime > currTime;
  }

  // If timestamps are identical, prefer records that have already been Cloudinary-cleaned
  if (candidate.cloudinaryCleanedAt && !current.cloudinaryCleanedAt) return true;
  if (current.cloudinaryCleanedAt && !candidate.cloudinaryCleanedAt) return false;

  // Prefer 'posted' over 'validated' when timestamps are equal
  if (candidate.postStatus === 'posted' && current.postStatus !== 'posted') return true;
  if (current.postStatus === 'posted' && candidate.postStatus !== 'posted') return false;

  // Prefer records that have live Buffer/Zernio IDs or scheduledFor when timestamps are equal
  const candHasRemote =
    Boolean(candidate.zernioPostIds?.length) ||
    Boolean(candidate.bufferPostIds?.length) ||
    Boolean(candidate.scheduledFor);
  const currHasRemote =
    Boolean(current.zernioPostIds?.length) ||
    Boolean(current.bufferPostIds?.length) ||
    Boolean(current.scheduledFor);
  if (candHasRemote && !currHasRemote) return true;
  if (currHasRemote && !candHasRemote) return false;

  return true;
}

/**
 * Deduplicates a list of SavedPostRecords by ID and by normalized (title + postFormat) signature,
 * keeping the most recently updated or published record so repeated saves of the same draft never multiply.
 */
export function deduplicateSavedPosts(posts: SavedPostRecord[]): SavedPostRecord[] {
  const byId = new Map<string, SavedPostRecord>();
  for (const post of posts) {
    if (!post || typeof post.id !== 'string') continue;
    const prev = byId.get(post.id);
    if (!prev || isIncomingPostPreferred(post, prev)) {
      byId.set(post.id, post);
    }
  }

  const bySignature = new Map<string, SavedPostRecord>();
  for (const post of byId.values()) {
    const sig = normalizePostTitleSignature(post);
    const prev = bySignature.get(sig);
    if (!prev || isIncomingPostPreferred(post, prev)) {
      bySignature.set(sig, post);
    }
  }

  return Array.from(bySignature.values())
    .sort(compareSavedPostsDesc)
    .slice(0, MAX_SAVED_POSTS);
}

/**
 * Merges two lists of SavedPostRecords by ID and normalized title signature, keeping the most recently updated version,
 * and pruning any IDs present in the server deletedIds tombstone set.
 */
export function mergePostLists(
  existing: SavedPostRecord[],
  incoming: SavedPostRecord[],
  deletedIds?: Set<string>
): SavedPostRecord[] {
  const filteredExisting = deletedIds
    ? existing.filter((p) => p && typeof p.id === 'string' && !deletedIds.has(p.id))
    : existing;

  const validIncoming: SavedPostRecord[] = [];
  for (const post of incoming) {
    if (!post || typeof post.id !== 'string') continue;
    if (deletedIds && deletedIds.has(post.id)) continue;
    const isSingleSlideCandidate =
      post.slideCount === 1 ||
      post.deck?.postFormat === 'single' ||
      post.deck?.postFormat === 'reel' ||
      (Array.isArray(post.deck?.slides) && post.deck.slides.length === 1);
    const parsedDeck = parseCarouselData(post.deck, {
      minSlides: isSingleSlideCandidate ? 1 : 3,
      requireSlideContent: true,
    });
    if (!parsedDeck) continue;
    validIncoming.push({
      ...post,
      deck: sanitizeFullCarousel(parsedDeck),
    });
  }
  return deduplicateSavedPosts([...filteredExisting, ...validIncoming]);
}

export interface ValidatePostInput {
  id?: string;
  deck: unknown;
  title?: string;
  postStatus?: SavedPostStatus;
  allowOverride?: boolean;
  existingRecord?: SavedPostRecord;
  isAutomatedRun?: boolean;
  humanApproved?: boolean;
}

export function validateAndBuildPostRecord(
  input: ValidatePostInput
): { ok: true; record: SavedPostRecord } | { ok: false; error: string; details?: string[] } {
  const parsedDeck = parseCarouselData(input.deck, {
    minSlides: 3,
    requireSlideContent: true,
  });

  if (!parsedDeck) {
    return {
      ok: false,
      error: 'Invalid carousel payload. A valid post requires at least 3 slides with content (or 1 slide in Single-Slide mode).',
    };
  }

  const sanitizedDeck: CarouselData = sanitizeFullCarousel(parsedDeck);
  const blobSlides = sanitizedDeck.slides
    .map((s, idx) => ({ idx, url: typeof s.videoUrl === 'string' ? s.videoUrl.trim() : '' }))
    .filter((item) => item.url.toLowerCase().startsWith('blob:'));
  if (blobSlides.length > 0) {
    return {
      ok: false,
      error: 'Slides with temporary browser blob: video URLs cannot be saved to the persistent Vault. Export the MP4 or clear the local video clip first.',
      details: blobSlides.map((b) => `Slide ${b.idx + 1}: ephemeral ${b.url.slice(0, 28)}...`),
    };
  }
  const explicitMetaApproved =
    sanitizedDeck.sourceMeta?.humanApproved ?? sanitizedDeck.sourceMeta?.userReviewed;
  const humanApproved =
    input.humanApproved !== undefined
      ? Boolean(input.humanApproved)
      : input.isAutomatedRun
      ? false
      : explicitMetaApproved !== undefined
      ? Boolean(explicitMetaApproved)
      : true;
  const verifiedNumbers = Boolean(
    sanitizedDeck.sourceMeta?.verifiedNumbers ?? input.existingRecord?.verifiedNumbers ?? false
  );

  sanitizedDeck.sourceMeta = {
    ...sanitizedDeck.sourceMeta,
    userReviewed: humanApproved,
    humanApproved,
    verifiedNumbers,
  };

  const qaReport = runQAChecks(sanitizedDeck);
  const riskReport = runPlatformRiskChecks(sanitizedDeck);
  const qualityPassed = qaReport.canExport && riskReport.status !== 'BLOCK';
  const groundingVerified = Boolean(
    sanitizedDeck.sourceMeta?.groundingVerified ??
      (sanitizedDeck.sourceMeta?.isSearchGrounded &&
        (sanitizedDeck.sourceMeta?.groundingSources?.length ?? 0) > 0)
  );

  sanitizedDeck.sourceMeta = {
    ...sanitizedDeck.sourceMeta,
    qualityPassed,
    groundingVerified,
    humanApproved,
    verifiedNumbers,
  };

  if (!qualityPassed && !input.allowOverride) {
    const failMessages = [
      ...qaReport.results.filter((r) => r.severity === 'fail').map((r) => r.message),
      ...riskReport.items.filter((i) => i.status === 'BLOCK').map((i) => i.message),
    ];
    return {
      ok: false,
      error: 'Post failed QA or Platform Safety checks. Resolve issues or enable Override to save.',
      details: failMessages,
    };
  }

  const nowIso = new Date().toISOString();
  const postId =
    (typeof input.id === 'string' && input.id.trim()) ||
    (typeof sanitizedDeck.id === 'string' && sanitizedDeck.id.trim()) ||
    input.existingRecord?.id ||
    `post_${crypto.randomUUID().slice(0, 12)}`;

  const postStatus: SavedPostStatus =
    input.postStatus === 'posted' ? 'posted' : 'validated';

  const ctaSlide = sanitizedDeck.slides[sanitizedDeck.slides.length - 1];
  const creatorHandle =
    (
      sanitizedDeck.sourceMeta?.creator ||
      sanitizedDeck.sourceMeta?.channel ||
      sanitizedDeck.channel ||
      ctaSlide?.enCredit?.replace(/^Source:\s*/i, '') ||
      sanitizedDeck.brand ||
      'MARROK'
    ).trim() || 'MARROK';

  // Ensure the deck itself carries its ID
  sanitizedDeck.id = postId;

  const derivedTitle =
    (typeof input.title === 'string' && input.title.trim()) ||
    sanitizedDeck.slides[0]?.enTitle ||
    sanitizedDeck.category ||
    'Untitled Carousel';

  const record: SavedPostRecord = {
    id: postId,
    title: derivedTitle.slice(0, 160),
    category: (sanitizedDeck.category || 'SYSTEMS ARCHITECTURE').slice(0, 120),
    postStatus,
    createdAt: input.existingRecord?.createdAt || nowIso,
    updatedAt: nowIso,
    postedAt:
      postStatus === 'posted'
        ? input.existingRecord?.postedAt || nowIso
        : input.existingRecord?.postedAt,
    creatorHandle: creatorHandle.slice(0, 100),
    slideCount: sanitizedDeck.slides.length,
    qaPassed: qualityPassed,
    qualityPassed,
    groundingVerified,
    humanApproved,
    verifiedNumbers,
    deck: sanitizedDeck,
    scheduledFor: input.existingRecord?.scheduledFor,
    publishTargets: input.existingRecord?.publishTargets,
    hostedSlideUrls: input.existingRecord?.hostedSlideUrls,
    tiktokHostedSlideUrls: input.existingRecord?.tiktokHostedSlideUrls,
    cloudinaryPublicIds: input.existingRecord?.cloudinaryPublicIds,
    cloudinaryCleanedAt: input.existingRecord?.cloudinaryCleanedAt,
    bufferPostIds: input.existingRecord?.bufferPostIds,
    zernioPostIds: input.existingRecord?.zernioPostIds,
    countedInMetricoolMonth: input.existingRecord?.countedInMetricoolMonth,
    lastDispatchFingerprint: input.existingRecord?.lastDispatchFingerprint,
    lastDispatchedAt: input.existingRecord?.lastDispatchedAt,
  };

  return { ok: true, record };
}

/**
 * GET /api/posts
 * Lists saved validated/posted/scheduled carousels using deterministic keyset cursor pagination
 * (`ORDER BY updated_at DESC, id DESC`).
 * Query parameters:
 *   - limit: optional integer in [1..100] (defaults to 50, values > 100 clamped to 100)
 *   - cursor: optional opaque base64url keyset cursor from previous page's `nextCursor`
 *   - status: optional filter ('all' | 'validated' | 'posted' | 'scheduled')
 */
export async function handleListPosts(req: Request, res: Response) {
  try {
    const query = (req.query || {}) as Record<string, unknown>;

    let limit = DEFAULT_POSTS_PAGE_SIZE;
    if (query.limit !== undefined && query.limit !== '') {
      const rawLimit = Array.isArray(query.limit) ? query.limit[0] : query.limit;
      const strLimit = String(rawLimit).trim();
      if (!/^\d+$/.test(strLimit)) {
        return res.status(400).json({
          error: 'Invalid pagination limit. Provide a positive integer.',
          code: 'INVALID_PAGINATION_LIMIT',
        });
      }
      const parsedLimit = Number.parseInt(strLimit, 10);
      if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
        return res.status(400).json({
          error: 'Invalid pagination limit. Must be >= 1.',
          code: 'INVALID_PAGINATION_LIMIT',
        });
      }
      limit = Math.min(MAX_POSTS_PAGE_SIZE, parsedLimit);
    }

    let decodedCursor: DecodedPostsCursor | null = null;
    if (query.cursor !== undefined && query.cursor !== '') {
      const rawCursor = Array.isArray(query.cursor) ? query.cursor[0] : query.cursor;
      const decoded = decodePostsCursor(rawCursor);
      if (!decoded.ok) {
        return res.status(400).json({
          error: decoded.error,
          code: 'INVALID_PAGINATION_CURSOR',
        });
      }
      decodedCursor = decoded.cursor;
    }

    let statusFilter: PostsStatusFilter | undefined;
    if (query.status !== undefined && query.status !== '') {
      const rawStatus = Array.isArray(query.status) ? query.status[0] : query.status;
      const normalized = String(rawStatus).trim().toLowerCase();
      if (normalized && normalized !== 'all') {
        if (!VALID_STATUS_FILTERS.has(normalized as PostsStatusFilter)) {
          return res.status(400).json({
            error: 'Invalid status filter. Allowed values: all, validated, posted, scheduled.',
            code: 'INVALID_STATUS_FILTER',
          });
        }
        statusFilter = normalized as PostsStatusFilter;
      }
    }

    const page = await loadStoredPostsPage(process.env, {
      strictDatabase: true,
      limit,
      cursor: decodedCursor,
      status: statusFilter,
    });

    return res.json({
      posts: page.posts,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      limit: page.limit,
      storageEngine: page.storageEngine,
      isCloudPersistent: page.isCloudPersistent,
      deletedIds: page.deletedIds,
    });
  } catch (err) {
    if (err instanceof VaultPersistenceUnavailableError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('[PostsController] Failed to list posts:', err);
    return res.status(500).json({ error: 'Failed to load saved posts' });
  }
}

/**
 * GET /api/posts/:id
 * Retrieves a single saved post by ID (supports direct point lookup in PostgreSQL beyond page 1).
 */
export async function handleGetPost(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'Post ID is required' });
    }
    const config = getServerConfig(process.env);
    if (config.databaseUrl) {
      const pool = getPostgresPool(config.databaseUrl);
      if (!pool) {
        throw new VaultPersistenceUnavailableError(
          'PostgreSQL pool is unavailable for post lookup.',
          502
        );
      }
      try {
        const found = await queryPostgresPostById(pool, id);
        if (!found) {
          return res.status(404).json({ error: 'Saved post not found' });
        }
        return res.json({ post: { ...found, storageEngine: 'neon-postgres' as const } });
      } catch (pgErr) {
        throw new VaultPersistenceUnavailableError(
          `Neon PostgreSQL post lookup failed: ${pgErr instanceof Error ? pgErr.message : 'database error'}`,
          502
        );
      }
    }

    const { posts, storageEngine } = await loadStoredPosts(process.env, { strictDatabase: true });
    const found = posts.find((p) => p.id === id);
    if (!found) {
      return res.status(404).json({ error: 'Saved post not found' });
    }
    return res.json({ post: { ...found, storageEngine } });
  } catch (err) {
    if (err instanceof VaultPersistenceUnavailableError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('[PostsController] Failed to load post:', err);
    return res.status(500).json({ error: 'Failed to load saved post' });
  }
}

/**
 * POST /api/posts
 * Validates and persists a valid/posted carousel, or reconciles a client vault batch.
 */
export async function handleSavePost(req: Request, res: Response) {
  try {
    const body = req.body || {};

    // Mode 1: Batch reconciliation from client IndexedDB Vault (offline drafts only)
    if (Array.isArray(body.syncPosts)) {
      const deletedIds = await loadServerDeletedPostIds();
      if (Array.isArray(body.deletedIds)) {
        for (const rawDelId of body.deletedIds) {
          if (typeof rawDelId === 'string' && rawDelId.trim()) {
            await recordServerDeletedPostId(rawDelId.trim());
            deletedIds.add(rawDelId.trim());
          }
        }
      }
      const { posts: existing } = await loadStoredPosts(process.env, { strictDatabase: true });
      const merged = mergePostLists(existing, body.syncPosts as SavedPostRecord[], deletedIds);
      const storageEngine = await saveStoredPosts(merged);
      return res.json({
        posts: merged,
        storageEngine,
        isCloudPersistent:
          storageEngine === 'neon-postgres' ||
          storageEngine === 'local-disk',
        deletedIds: Array.from(deletedIds),
      });
    }

    // Mode 2: Single post validation and save
    const { posts: existing } = await loadStoredPosts(process.env, { strictDatabase: true });
    const incomingId =
      (typeof body.id === 'string' && body.id.trim()) ||
      (typeof body.deck?.id === 'string' && body.deck.id.trim()) ||
      undefined;
    const candidateTitle = (
      (typeof body.title === 'string' && body.title.trim()) ||
      body.deck?.slides?.[0]?.enTitle ||
      ''
    )
      .trim()
      .toLowerCase()
      .replace(/[.!?]+$/, '');
    const candidateFormat =
      body.deck?.postFormat || (body.deck?.slides?.length === 1 ? 'single' : 'carousel');
    const candidateSig = candidateTitle ? `${candidateTitle}::${candidateFormat}` : '';

    const existingRecord =
      (incomingId ? existing.find((p) => p.id === incomingId) : undefined) ||
      (candidateSig ? existing.find((p) => normalizePostTitleSignature(p) === candidateSig) : undefined);

    const validation = validateAndBuildPostRecord({
      id: existingRecord?.id || incomingId,
      deck: body.deck,
      title: body.title,
      postStatus: body.postStatus === 'posted' ? 'posted' : 'validated',
      allowOverride: Boolean(body.allowOverride),
      existingRecord,
    });

    if (!validation.ok) {
      return res.status(400).json({
        error: validation.error,
        details: validation.details,
      });
    }

    // Explicitly saving a post clears any prior deletion tombstone for its ID
    await clearServerDeletedPostId(validation.record.id);

    const storageEngine = await upsertSingleStoredPost(validation.record, existing);
    const savedRecord: SavedPostRecord = {
      ...validation.record,
      storageEngine,
    };

    return res.status(existingRecord ? 200 : 201).json({
      post: savedRecord,
      storageEngine,
    });
  } catch (err) {
    if (err instanceof VaultPersistenceUnavailableError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('[PostsController] Failed to save post:', err);
    return res.status(500).json({ error: 'Failed to save valid post' });
  }
}

/**
 * PATCH /api/posts/:id/status
 * Toggles a saved post between 'validated' and 'posted'.
 */
export async function handleUpdatePostStatus(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    const postStatus: SavedPostStatus =
      req.body?.postStatus === 'posted' ? 'posted' : 'validated';

    const config = getServerConfig(process.env);
    let existingPost: SavedPostRecord | null = null;
    let listHint: SavedPostRecord[] | undefined;

    if (config.databaseUrl) {
      const pool = getPostgresPool(config.databaseUrl);
      if (!pool) {
        throw new VaultPersistenceUnavailableError(
          'PostgreSQL pool is unavailable for post status update.',
          502
        );
      }
      try {
        existingPost = await queryPostgresPostById(pool, id);
      } catch (pgErr) {
        throw new VaultPersistenceUnavailableError(
          `Neon PostgreSQL status lookup failed: ${pgErr instanceof Error ? pgErr.message : 'database error'}`,
          502
        );
      }
    } else {
      const { posts } = await loadStoredPosts(process.env, { strictDatabase: true });
      listHint = posts;
      existingPost = posts.find((p) => p.id === id) ?? null;
    }

    if (!existingPost) {
      return res.status(404).json({ error: 'Saved post not found' });
    }

    const nowIso = new Date().toISOString();
    const updated: SavedPostRecord = {
      ...existingPost,
      postStatus,
      updatedAt: nowIso,
      postedAt: postStatus === 'posted' ? existingPost.postedAt || nowIso : undefined,
    };

    const storageEngine = await upsertSingleStoredPost(updated, listHint);

    return res.json({
      post: { ...updated, storageEngine },
      storageEngine,
    });
  } catch (err) {
    if (err instanceof VaultPersistenceUnavailableError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('[PostsController] Failed to update post status:', err);
    return res.status(500).json({ error: 'Failed to update post status' });
  }
}

/**
 * DELETE /api/posts/:id
 * Deletes a saved post from the backend store and records a deletion tombstone.
 */
export async function handleDeletePost(req: Request, res: Response) {
  try {
    const id = String(req.params.id || '').trim();
    const { posts } = await loadStoredPosts(process.env, { strictDatabase: true });
    const storageEngine = await deleteSingleStoredPost(id, posts);

    return res.json({
      deletedId: id,
      storageEngine,
    });
  } catch (err) {
    if (err instanceof VaultPersistenceUnavailableError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('[PostsController] Failed to delete post:', err);
    return res.status(500).json({ error: 'Failed to delete saved post' });
  }
}

