import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type {
  CarouselData,
  SavedPostRecord,
  SavedPostStatus,
  SavedPostStorageEngine,
} from '../../src/types.ts';
import { getServerConfig } from '../config.ts';
import { readRuntimeEnv } from '../../src/lib/security/env.ts';
import { isAllowedProxyUrl, resolveAndValidateHost } from './proxyController.ts';
import { parseCarouselData } from '../../src/lib/validation/carousel.ts';
import { sanitizeFullCarousel } from '../../src/lib/textSanitizer.ts';
import { runQAChecks } from '../../src/lib/qaChecks.ts';
import { runPlatformRiskChecks } from '../../src/lib/riskChecks.ts';
import { BUNDLED_SAVED_POSTS } from '../../src/lib/storage/bundledSavedPosts.ts';
import {
  getPostgresPool,
  queryPostgresPosts,
  queryPostgresDeletedIds,
  upsertPostgresPost,
  upsertPostgresPostsBatch,
  deletePostgresPost,
  clearPostgresDeletedTombstone,
} from '../db/postgres.ts';

const KV_STORAGE_KEY = 'marrok:saved_posts:v1';
const MAX_SAVED_POSTS = 100;

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
  const current = await loadServerDeletedPostIds(env);
  current.add(clean);
  await writeDeletedIdsToDisk(current, env);

  const config = getServerConfig(env);
  if (config.databaseUrl) {
    try {
      const pool = getPostgresPool(config.databaseUrl);
      if (pool) {
        await deletePostgresPost(pool, clean);
      }
    } catch (pgErr) {
      console.warn('[PostsController] Failed to record tombstone in Postgres:', pgErr);
    }
  }
}

export async function clearServerDeletedPostId(
  id: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const clean = String(id || '').trim();
  if (!clean) return;
  serverDeletedIdsMemory.delete(clean);
  const current = await loadServerDeletedPostIds(env);
  if (current.has(clean)) {
    current.delete(clean);
    await writeDeletedIdsToDisk(current, env);
  }
  const config = getServerConfig(env);
  if (config.databaseUrl) {
    try {
      const pool = getPostgresPool(config.databaseUrl);
      if (pool) {
        await clearPostgresDeletedTombstone(pool, clean);
      }
    } catch {
      // Ignore
    }
  }
}

export function shouldSyncWithRemoteVault(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const isTest = Boolean(env.POSTS_STORAGE_FILE || env.NODE_ENV === 'test' || env.VITEST);
  if (isTest) return null;
  const origin = (readRuntimeEnv('REMOTE_VAULT_ORIGIN', env) || '').trim().replace(/\/+$/, '');
  if (!origin || !origin.startsWith('https://')) return null;
  if (!isAllowedProxyUrl(origin, false)) return null;
  return origin;
}

async function fetchRemoteVaultPosts(remoteOrigin: string): Promise<SavedPostRecord[] | null> {
  try {
    const parsed = new URL(remoteOrigin);
    if (!(await resolveAndValidateHost(parsed.hostname))) return null;
    const res = await fetch(`${remoteOrigin}/api/posts`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { posts?: SavedPostRecord[] };
    return Array.isArray(data?.posts) ? data.posts : null;
  } catch {
    return null;
  }
}

async function pushPostsToRemoteVault(
  remoteOrigin: string,
  posts: SavedPostRecord[]
): Promise<void> {
  try {
    await fetch(`${remoteOrigin}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncPosts: posts }),
      signal: AbortSignal.timeout(3500),
    });
  } catch {
    // Non-fatal if offline
  }
}

export function getBundledSeedPosts(): SavedPostRecord[] {
  if (!Array.isArray(BUNDLED_SAVED_POSTS)) return [];
  return BUNDLED_SAVED_POSTS;
}

/**
 * Resolves a writable file path for file-based storage.
 * On Vercel Serverless Functions (/var/task is read-only), always uses os.tmpdir()
 * so file operations never throw EROFS: read-only file system.
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
  const isVercel = Boolean(env.VERCEL || env.VERCEL_ENV);
  if (isVercel) {
    return {
      filePath: path.join(os.tmpdir(), 'marrok-saved-posts.json'),
      engine: 'vercel-tmp',
    };
  }
  return {
    filePath: path.join(process.cwd(), 'data', 'saved-posts.json'),
    engine: 'local-disk',
  };
}

async function readFromKv(url: string, token: string): Promise<SavedPostRecord[] | null> {
  try {
    const cleanUrl = url.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/get/${ encodeURIComponent(KV_STORAGE_KEY) }`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string | null };
    if (!data || !data.result) return [];
    const parsed = JSON.parse(data.result);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[PostsStore] Cloud KV read failed, falling back to file store:', err);
    return null;
  }
}

async function writeToKv(url: string, token: string, posts: SavedPostRecord[]): Promise<boolean> {
  try {
    const cleanUrl = url.replace(/\/+$/, '');
    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', KV_STORAGE_KEY, JSON.stringify(posts)]),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    console.warn('[PostsStore] Cloud KV write failed, falling back to file store:', err);
    return false;
  }
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
    // Try os.tmpdir() fallback if local ./data was not readable
    const tmpFallback = path.join(os.tmpdir(), 'marrok-saved-posts.json');
    if (tmpFallback !== filePath) {
      try {
        const rawTmp = await fs.readFile(tmpFallback, 'utf-8');
        const parsedTmp = JSON.parse(rawTmp);
        if (Array.isArray(parsedTmp)) {
          return { posts: parsedTmp, engine: 'vercel-tmp' };
        }
      } catch {
        // Ignore if file does not exist yet
      }
    }

    // On Vercel cold start (/tmp empty) when no custom test file override is set,
    // hydrate initial posts from the repository's bundled seed posts.
    if (!env.POSTS_STORAGE_FILE) {
      const repoSeedPath = path.join(process.cwd(), 'data', 'saved-posts.json');
      if (repoSeedPath !== filePath) {
        try {
          const rawSeed = await fs.readFile(repoSeedPath, 'utf-8');
          const parsedSeed = JSON.parse(rawSeed);
          if (Array.isArray(parsedSeed) && parsedSeed.length > 0) {
            return { posts: parsedSeed, engine };
          }
        } catch {
          // Fall through to statically bundled module import
        }
      }
      const bundled = getBundledSeedPosts();
      if (bundled.length > 0) {
        return { posts: bundled, engine };
      }
    }
  }
  return { posts: [], engine };
}

async function writeToFileStore(
  posts: SavedPostRecord[],
  env: NodeJS.ProcessEnv = process.env
): Promise<SavedPostStorageEngine> {
  const resolved = resolveStorageFilePath(env);
  const isVitestDefaultRepoFile =
    Boolean(env.VITEST || process.env.VITEST) &&
    !env.POSTS_STORAGE_FILE &&
    resolved.filePath === path.join(process.cwd(), 'data', 'saved-posts.json');
  const filePath = isVitestDefaultRepoFile
    ? path.join(os.tmpdir(), 'marrok-vitest-saved-posts.json')
    : resolved.filePath;
  const engine = resolved.engine;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(posts, null, 2), 'utf-8');

    // Only rewrite a custom dev seed target when explicitly requested via SYNC_BUNDLED_SEED=true
    // and BUNDLED_SEED_TARGET (never reference .ts source paths with path.join in serverless functions
    // because @vercel/nft / @netlify/zip-it-and-ship-it traces them as function entry overrides).
    const explicitSeedTarget = readRuntimeEnv('BUNDLED_SEED_TARGET', env);
    if (
      engine === 'local-disk' &&
      !env.POSTS_STORAGE_FILE &&
      env.SYNC_BUNDLED_SEED === 'true' &&
      explicitSeedTarget
    ) {
      try {
        const tsContent = `import type { SavedPostRecord } from '../../types.ts';\n\n/**\n * Bundled repository seed posts for the Saved & Posted Vault.\n */\nexport const BUNDLED_SAVED_POSTS: SavedPostRecord[] = ${JSON.stringify(posts, null, 2)};\n`;
        await fs.writeFile(path.resolve(process.cwd(), explicitSeedTarget), tsContent, 'utf-8');
      } catch {
        // Non-fatal if source tree is read-only
      }
    }

    return engine;
  } catch {
    // Fallback to os.tmpdir() if the directory is read-only (e.g. custom serverless container)
    const tmpFallback = path.join(os.tmpdir(), 'marrok-saved-posts.json');
    await fs.mkdir(path.dirname(tmpFallback), { recursive: true });
    await fs.writeFile(tmpFallback, JSON.stringify(posts, null, 2), 'utf-8');
    return 'vercel-tmp';
  }
}

/**
 * READ-PURE loader for GET endpoints (/api/posts, /api/publish/status).
 * Never mutates Postgres rows, never writes disk files, and never promotes scheduled posts on GET.
 */
export async function loadStoredPosts(env: NodeJS.ProcessEnv = process.env): Promise<{
  posts: SavedPostRecord[];
  storageEngine: SavedPostStorageEngine;
  isCloudPersistent: boolean;
  deletedIds?: string[];
}> {
  const config = getServerConfig(env);
  const deletedIds = await loadServerDeletedPostIds(env);

  // 1. Neon Serverless PostgreSQL Cloud Persistence (READ-PURE)
  if (config.databaseUrl) {
    try {
      const pool = getPostgresPool(config.databaseUrl);
      if (pool) {
        const pgPosts = (await queryPostgresPosts(pool)).filter((p) => !deletedIds.has(p.id));
        if (pgPosts.length > 0) {
          return {
            posts: deduplicateSavedPosts(pgPosts),
            storageEngine: 'neon-postgres',
            isCloudPersistent: true,
            deletedIds: Array.from(deletedIds),
          };
        }
        const { posts: seedCandidates } = await readFromFileStore(env);
        const seeds = deduplicateSavedPosts(
          (seedCandidates.length > 0 ? seedCandidates : getBundledSeedPosts()).filter(
            (s) => !deletedIds.has(s.id)
          )
        );
        return {
          posts: seeds,
          storageEngine: 'neon-postgres',
          isCloudPersistent: true,
          deletedIds: Array.from(deletedIds),
        };
      }
    } catch (pgErr) {
      console.warn('[PostsStore] Neon PostgreSQL query failed, falling back to local file store:', pgErr);
    }
  }

  // 2. Vercel KV / Upstash Redis (READ-PURE)
  if (config.kvRestUrl && config.kvRestToken) {
    const kvPosts = await readFromKv(config.kvRestUrl, config.kvRestToken);
    if (kvPosts !== null) {
      const seeded = deduplicateSavedPosts(
        (kvPosts.length > 0 ? kvPosts : getBundledSeedPosts()).filter((p) => !deletedIds.has(p.id))
      );
      return {
        posts: seeded,
        storageEngine: 'cloud-kv',
        isCloudPersistent: true,
        deletedIds: Array.from(deletedIds),
      };
    }
  }

  const { posts: rawLocalPosts, engine } = await readFromFileStore(env);
  const localPosts = deduplicateSavedPosts(rawLocalPosts.filter((p) => !deletedIds.has(p.id)));

  const remoteOrigin = shouldSyncWithRemoteVault(env);
  if (remoteOrigin) {
    const remotePosts = await fetchRemoteVaultPosts(remoteOrigin);
    if (remotePosts && remotePosts.length > 0) {
      const merged = mergePostLists(localPosts, remotePosts, deletedIds);
      return {
        posts: merged,
        storageEngine: engine,
        isCloudPersistent: true,
        deletedIds: Array.from(deletedIds),
      };
    }
  }

  return {
    posts: localPosts,
    storageEngine: engine,
    isCloudPersistent: engine === 'local-disk',
    deletedIds: Array.from(deletedIds),
  };
}

/**
 * Persists a single SavedPostRecord cleanly with a single-row UPSERT in Postgres
 * instead of rewriting all 100 Vault rows.
 */
export async function upsertSingleStoredPost(
  post: SavedPostRecord,
  existingListHint?: SavedPostRecord[],
  env: NodeJS.ProcessEnv = process.env
): Promise<SavedPostStorageEngine> {
  const config = getServerConfig(env);
  const sig = normalizePostTitleSignature(post);

  // 1. Neon Serverless PostgreSQL: 1 single-row INSERT ... ON CONFLICT DO UPDATE
  if (config.databaseUrl) {
    try {
      const pool = getPostgresPool(config.databaseUrl);
      if (pool) {
        await upsertPostgresPost(pool, post, sig);
        if (existingListHint) {
          const next = deduplicateSavedPosts([
            post,
            ...existingListHint.filter((p) => p.id !== post.id),
          ]);
          void writeToFileStore(next, env);
        }
        return 'neon-postgres';
      }
    } catch (pgErr) {
      console.warn('[PostsStore] Neon PostgreSQL single-row upsert failed, falling back:', pgErr);
    }
  }

  const baseList = existingListHint ?? (await loadStoredPosts(env)).posts;
  const merged = deduplicateSavedPosts([post, ...baseList.filter((p) => p.id !== post.id)]).slice(
    0,
    MAX_SAVED_POSTS
  );

  if (config.kvRestUrl && config.kvRestToken) {
    const ok = await writeToKv(config.kvRestUrl, config.kvRestToken, merged);
    if (ok) return 'cloud-kv';
  }

  const engine = await writeToFileStore(merged, env);
  const remoteOrigin = shouldSyncWithRemoteVault(env);
  if (remoteOrigin) {
    void pushPostsToRemoteVault(remoteOrigin, merged);
  }
  return engine;
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
    try {
      const pool = getPostgresPool(config.databaseUrl);
      if (pool) {
        if (existingListHint) {
          void writeToFileStore(
            existingListHint.filter((p) => p.id !== cleanId),
            env
          );
        }
        return 'neon-postgres';
      }
    } catch {
      // Fallback below if Postgres unavailable
    }
  }

  const baseList = existingListHint ?? (await loadStoredPosts(env)).posts;
  const filtered = baseList.filter((p) => p.id !== cleanId);

  if (config.kvRestUrl && config.kvRestToken) {
    const ok = await writeToKv(config.kvRestUrl, config.kvRestToken, filtered);
    if (ok) return 'cloud-kv';
  }

  const engine = await writeToFileStore(filtered, env);
  const remoteOrigin = shouldSyncWithRemoteVault(env);
  if (remoteOrigin && cleanId) {
    void pushPostsToRemoteVault(remoteOrigin, filtered);
  }
  return engine;
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

  // 1. Neon Serverless PostgreSQL Cloud Persistence (Transactional UNNEST Batch)
  if (config.databaseUrl) {
    try {
      const pool = getPostgresPool(config.databaseUrl);
      if (pool) {
        await upsertPostgresPostsBatch(pool, sorted, normalizePostTitleSignature);
        void writeToFileStore(sorted, env);
        return 'neon-postgres';
      }
    } catch (pgErr) {
      console.warn('[PostsStore] Neon PostgreSQL batch save failed, falling back to file store:', pgErr);
    }
  }

  // 2. Vercel KV / Upstash Redis
  if (config.kvRestUrl && config.kvRestToken) {
    const ok = await writeToKv(config.kvRestUrl, config.kvRestToken, sorted);
    if (ok) {
      return 'cloud-kv';
    }
  }

  const engine = await writeToFileStore(sorted, env);
  const remoteOrigin = shouldSyncWithRemoteVault(env);
  if (remoteOrigin) {
    void pushPostsToRemoteVault(remoteOrigin, sorted);
  }
  return engine;
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
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
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
  const humanApproved =
    input.humanApproved !== undefined
      ? input.humanApproved
      : input.isAutomatedRun
      ? false
      : true;

  sanitizedDeck.sourceMeta = {
    ...sanitizedDeck.sourceMeta,
    userReviewed: humanApproved,
    humanApproved,
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
  };

  return { ok: true, record };
}

/**
 * GET /api/posts
 * Lists all saved validated/posted carousels along with active storage engine metadata and deletion tombstones.
 */
export async function handleListPosts(_req: Request, res: Response) {
  try {
    const { posts, storageEngine, isCloudPersistent, deletedIds } = await loadStoredPosts();
    return res.json({
      posts,
      storageEngine,
      isCloudPersistent,
      deletedIds: deletedIds || [],
    });
  } catch (err) {
    console.error('[PostsController] Failed to list posts:', err);
    return res.status(500).json({ error: 'Failed to load saved posts' });
  }
}

/**
 * GET /api/posts/:id
 * Retrieves a single saved post by ID.
 */
export async function handleGetPost(req: Request, res: Response) {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'Post ID is required' });
  }
  const { posts, storageEngine } = await loadStoredPosts();
  const found = posts.find((p) => p.id === id);
  if (!found) {
    return res.status(404).json({ error: 'Saved post not found' });
  }
  return res.json({ post: { ...found, storageEngine } });
}

/**
 * POST /api/posts
 * Validates and persists a valid/posted carousel, or reconciles a client vault batch.
 */
export async function handleSavePost(req: Request, res: Response) {
  try {
    const body = req.body || {};

    // Mode 1: Batch reconciliation from client IndexedDB Vault (e.g. after Vercel cold start)
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
      const { posts: existing } = await loadStoredPosts();
      const merged = mergePostLists(existing, body.syncPosts as SavedPostRecord[], deletedIds);
      const storageEngine = await saveStoredPosts(merged);
      return res.json({
        posts: merged,
        storageEngine,
        isCloudPersistent:
          storageEngine === 'neon-postgres' ||
          storageEngine === 'cloud-kv' ||
          storageEngine === 'local-disk',
        deletedIds: Array.from(deletedIds),
      });
    }

    // Mode 2: Single post validation and save
    const { posts: existing } = await loadStoredPosts();
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

    const { posts } = await loadStoredPosts();
    const idx = posts.findIndex((p) => p.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Saved post not found' });
    }

    const nowIso = new Date().toISOString();
    const updated: SavedPostRecord = {
      ...posts[idx],
      postStatus,
      updatedAt: nowIso,
      postedAt: postStatus === 'posted' ? posts[idx].postedAt || nowIso : undefined,
    };

    const storageEngine = await upsertSingleStoredPost(updated, posts);

    return res.json({
      post: { ...updated, storageEngine },
      storageEngine,
    });
  } catch (err) {
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
    const remoteOrigin = shouldSyncWithRemoteVault();
    if (remoteOrigin && id) {
      try {
        await fetch(`${remoteOrigin}/api/posts/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          signal: AbortSignal.timeout(2500),
        });
      } catch {
        // Non-fatal if remote is unreachable
      }
    }
    const { posts } = await loadStoredPosts();
    const storageEngine = await deleteSingleStoredPost(id, posts);

    return res.json({
      deletedId: id,
      storageEngine,
    });
  } catch (err) {
    console.error('[PostsController] Failed to delete post:', err);
    return res.status(500).json({ error: 'Failed to delete saved post' });
  }
}

