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
import { parseCarouselData } from '../../src/lib/validation/carousel.ts';
import { sanitizeFullCarousel } from '../../src/lib/textSanitizer.ts';
import { runQAChecks } from '../../src/lib/qaChecks.ts';
import { runPlatformRiskChecks } from '../../src/lib/riskChecks.ts';
import { BUNDLED_SAVED_POSTS } from '../../src/lib/storage/bundledSavedPosts.ts';

const KV_STORAGE_KEY = 'marrok:saved_posts:v1';
const MAX_SAVED_POSTS = 100;
const DEFAULT_REMOTE_VAULT_ORIGIN = 'https://marrok-tik-tok-carousel-studio.vercel.app';

function shouldSyncWithRemoteVault(env: NodeJS.ProcessEnv = process.env): string | null {
  const isVercel = Boolean(env.VERCEL || env.VERCEL_ENV);
  const isTest = Boolean(env.POSTS_STORAGE_FILE || env.NODE_ENV === 'test' || env.VITEST);
  if (isVercel || isTest) return null;
  const origin = (env.REMOTE_VAULT_ORIGIN || DEFAULT_REMOTE_VAULT_ORIGIN).trim().replace(/\/+$/, '');
  return origin || null;
}

async function fetchRemoteVaultPosts(remoteOrigin: string): Promise<SavedPostRecord[] | null> {
  try {
    const res = await fetch(`${remoteOrigin}/api/posts`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
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
  const { filePath, engine } = resolveStorageFilePath(env);
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(posts, null, 2), 'utf-8');

    // When saving locally in dev/studio, also mirror into src/lib/storage/bundledSavedPosts.ts
    // so git pushes to Vercel automatically include the latest saved posts in the bundle.
    if (engine === 'local-disk' && !env.POSTS_STORAGE_FILE) {
      try {
        const bundledModulePath = path.join(
          process.cwd(),
          'src',
          'lib',
          'storage',
          'bundledSavedPosts.ts'
        );
        const tsContent = `import type { SavedPostRecord } from '../../types.ts';\n\n/**\n * Bundled repository seed posts for the Saved & Posted Vault.\n * Kept inside \`src/lib/storage/\` so Vite/Rolldown and Vercel Serverless builds\n * always resolve it even when runtime \`data/saved-posts.json\` is not present in git.\n */\nexport const BUNDLED_SAVED_POSTS: SavedPostRecord[] = ${JSON.stringify(posts, null, 2)};\n`;
        await fs.writeFile(bundledModulePath, tsContent, 'utf-8');
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

export async function loadStoredPosts(env: NodeJS.ProcessEnv = process.env): Promise<{
  posts: SavedPostRecord[];
  storageEngine: SavedPostStorageEngine;
  isCloudPersistent: boolean;
}> {
  const config = getServerConfig(env);
  if (config.kvRestUrl && config.kvRestToken) {
    const kvPosts = await readFromKv(config.kvRestUrl, config.kvRestToken);
    if (kvPosts !== null) {
      const seeded = kvPosts.length > 0 ? kvPosts : getBundledSeedPosts();
      return {
        posts: seeded,
        storageEngine: 'cloud-kv',
        isCloudPersistent: true,
      };
    }
  }

  const { posts: localPosts, engine } = await readFromFileStore(env);
  const remoteOrigin = shouldSyncWithRemoteVault(env);
  if (remoteOrigin) {
    const remotePosts = await fetchRemoteVaultPosts(remoteOrigin);
    if (remotePosts && remotePosts.length > 0) {
      const merged = mergePostLists(localPosts, remotePosts);
      if (merged.length !== localPosts.length) {
        await writeToFileStore(merged, env);
      }
      if (merged.length > remotePosts.length) {
        void pushPostsToRemoteVault(remoteOrigin, merged);
      }
      return {
        posts: merged,
        storageEngine: engine,
        isCloudPersistent: true,
      };
    }
  }

  return {
    posts: localPosts,
    storageEngine: engine,
    isCloudPersistent: engine === 'local-disk',
  };
}

export async function saveStoredPosts(
  posts: SavedPostRecord[],
  env: NodeJS.ProcessEnv = process.env
): Promise<SavedPostStorageEngine> {
  const sorted = [...posts]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_SAVED_POSTS);

  const config = getServerConfig(env);
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

/**
 * Merges two lists of SavedPostRecords by ID, keeping the most recently updated version.
 */
export function mergePostLists(
  existing: SavedPostRecord[],
  incoming: SavedPostRecord[]
): SavedPostRecord[] {
  const map = new Map<string, SavedPostRecord>();
  for (const post of existing) {
    if (post && typeof post.id === 'string') {
      map.set(post.id, post);
    }
  }
  for (const post of incoming) {
    if (!post || typeof post.id !== 'string') continue;
    const parsedDeck = parseCarouselData(post.deck, { minSlides: 3, requireSlideContent: true });
    if (!parsedDeck) continue;
    const prev = map.get(post.id);
    if (!prev || new Date(post.updatedAt).getTime() >= new Date(prev.updatedAt).getTime()) {
      map.set(post.id, {
        ...post,
        deck: sanitizeFullCarousel(parsedDeck),
      });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, MAX_SAVED_POSTS);
}

export interface ValidatePostInput {
  id?: string;
  deck: unknown;
  title?: string;
  postStatus?: SavedPostStatus;
  allowOverride?: boolean;
  existingRecord?: SavedPostRecord;
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
  // Saving a post as Validated or Posted explicitly confirms human review
  sanitizedDeck.sourceMeta = {
    ...sanitizedDeck.sourceMeta,
    userReviewed: true,
  };

  const qaReport = runQAChecks(sanitizedDeck);
  const riskReport = runPlatformRiskChecks(sanitizedDeck);

  if ((!qaReport.canExport || riskReport.status === 'BLOCK') && !input.allowOverride) {
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
    qaPassed: qaReport.canExport && riskReport.status !== 'BLOCK',
    deck: sanitizedDeck,
    scheduledFor: input.existingRecord?.scheduledFor,
    publishTargets: input.existingRecord?.publishTargets,
    hostedSlideUrls: input.existingRecord?.hostedSlideUrls,
    cloudinaryPublicIds: input.existingRecord?.cloudinaryPublicIds,
    cloudinaryCleanedAt: input.existingRecord?.cloudinaryCleanedAt,
    bufferPostIds: input.existingRecord?.bufferPostIds,
    countedInMetricoolMonth: input.existingRecord?.countedInMetricoolMonth,
  };

  return { ok: true, record };
}

/**
 * GET /api/posts
 * Lists all saved validated/posted carousels along with active storage engine metadata.
 */
export async function handleListPosts(_req: Request, res: Response) {
  try {
    const { posts, storageEngine, isCloudPersistent } = await loadStoredPosts();
    return res.json({
      posts,
      storageEngine,
      isCloudPersistent,
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
      const { posts: existing } = await loadStoredPosts();
      const merged = mergePostLists(existing, body.syncPosts as SavedPostRecord[]);
      const storageEngine = await saveStoredPosts(merged);
      return res.json({
        posts: merged,
        storageEngine,
        isCloudPersistent: storageEngine === 'cloud-kv' || storageEngine === 'local-disk',
      });
    }

    // Mode 2: Single post validation and save
    const { posts: existing } = await loadStoredPosts();
    const incomingId =
      (typeof body.id === 'string' && body.id.trim()) ||
      (typeof body.deck?.id === 'string' && body.deck.id.trim()) ||
      undefined;
    const existingRecord = incomingId ? existing.find((p) => p.id === incomingId) : undefined;

    const validation = validateAndBuildPostRecord({
      id: incomingId,
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

    const updatedList = [
      validation.record,
      ...existing.filter((p) => p.id !== validation.record.id),
    ];
    const storageEngine = await saveStoredPosts(updatedList);
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

    const nextPosts = [...posts];
    nextPosts[idx] = updated;
    const storageEngine = await saveStoredPosts(nextPosts);

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
 * Deletes a saved post from the backend store.
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
    const filtered = posts.filter((p) => p.id !== id);
    const storageEngine = await saveStoredPosts(filtered);

    return res.json({
      deletedId: id,
      storageEngine,
    });
  } catch (err) {
    console.error('[PostsController] Failed to delete post:', err);
    return res.status(500).json({ error: 'Failed to delete saved post' });
  }
}
