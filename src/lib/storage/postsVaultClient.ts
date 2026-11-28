import type {
  CarouselData,
  SavedPostRecord,
  SavedPostStatus,
  SavedPostStorageEngine,
} from '../../types.ts';
import { parseCarouselData } from '../validation/carousel.ts';
import { sanitizeFullCarousel } from '../textSanitizer.ts';
import { runQAChecks } from '../qaChecks.ts';
import { findNonPersistableBlobVideoSlides } from '../media/blobUrlRegistry.ts';
import { fetchAuthedJson, HttpClientError } from '../network/httpClient.ts';

const IDB_NAME = 'marrok_posts_vault_v1';
const IDB_STORE = 'saved_posts';
const IDB_VERSION = 1;
const FALLBACK_LS_KEY = 'marrok_posts_vault_fallback_v1';
const DELETED_IDS_LS_KEY = 'marrok_posts_deleted_ids_v1';

export class VaultApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'VaultApiError';
    this.status = status;
    this.code = code;
  }
}

function isNonFallbackHttpStatus(status: number): boolean {
  // Explicit client / auth / validation / unconfigured service responses (4xx and 503) must surface
  // directly to the caller and never fall back silently to local IndexedDB.
  return (status >= 400 && status < 500) || status === 503;
}

function rethrowVaultApiErrorIfNonFallback(err: unknown): void {
  if (err instanceof VaultApiError) {
    throw err;
  }
  if (err instanceof HttpClientError && isNonFallbackHttpStatus(err.status)) {
    throw new VaultApiError(err.message, err.status, err.code);
  }
}

export function readDeletedIds(): Set<string> {
  if (typeof window === 'undefined' || !window.localStorage) return new Set();
  try {
    const raw = window.localStorage.getItem(DELETED_IDS_LS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function writeDeletedIds(ids: Set<string>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(DELETED_IDS_LS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Ignore storage quota errors
  }
}

export function mergeServerDeletedIds(serverDeletedIds?: unknown): Set<string> {
  const localDeleted = readDeletedIds();
  if (!Array.isArray(serverDeletedIds)) return localDeleted;
  let changed = false;
  for (const rawId of serverDeletedIds) {
    if (typeof rawId === 'string' && rawId.trim() && !localDeleted.has(rawId.trim())) {
      localDeleted.add(rawId.trim());
      changed = true;
    }
  }
  if (changed) {
    writeDeletedIds(localDeleted);
  }
  return localDeleted;
}

function openVaultDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window) || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readLocalVault(): Promise<SavedPostRecord[]> {
  const deletedIds = readDeletedIds();
  const db = await openVaultDb();
  let storedItems: SavedPostRecord[] = [];

  if (db) {
    storedItems = await new Promise<SavedPostRecord[]>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          const items = Array.isArray(req.result) ? (req.result as SavedPostRecord[]) : [];
          resolve(items.filter((p) => p && !deletedIds.has(p.id)));
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  } else {
    try {
      const raw = localStorage.getItem(FALLBACK_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const localItems = Array.isArray(parsed) ? (parsed as SavedPostRecord[]) : [];
        storedItems = localItems.filter((p) => p && !deletedIds.has(p.id));
      }
    } catch {
      storedItems = [];
    }
  }

  return storedItems;
}

async function writeLocalVault(posts: SavedPostRecord[]): Promise<void> {
  const sorted = [...posts].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  const db = await openVaultDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.clear();
        for (const post of sorted) {
          store.put(post);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    return;
  }

  try {
    localStorage.setItem(FALLBACK_LS_KEY, JSON.stringify(sorted));
  } catch {
    // Ignore quota errors in fallback mode
  }
}

function normalizeClientPostSignature(post: SavedPostRecord): string {
  const rawTitle = (post.title || post.deck?.slides?.[0]?.enTitle || '')
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, '');
  const format = post.deck?.postFormat || (post.slideCount === 1 ? 'single' : 'carousel');
  return rawTitle ? `${rawTitle}::${format}` : `id::${post.id}`;
}

function isPreferredClientRecord(candidate: SavedPostRecord, current: SavedPostRecord): boolean {
  const candTime = Date.parse(candidate.updatedAt || candidate.createdAt || '');
  const currTime = Date.parse(current.updatedAt || current.createdAt || '');
  if (Number.isFinite(candTime) && Number.isFinite(currTime) && candTime !== currTime) {
    return candTime > currTime;
  }

  if (candidate.cloudinaryCleanedAt && !current.cloudinaryCleanedAt) return true;
  if (current.cloudinaryCleanedAt && !candidate.cloudinaryCleanedAt) return false;

  if (candidate.postStatus === 'posted' && current.postStatus !== 'posted') return true;
  if (current.postStatus === 'posted' && candidate.postStatus !== 'posted') return false;

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

export function mergeRecords(
  serverPosts: SavedPostRecord[],
  localPosts: SavedPostRecord[]
): SavedPostRecord[] {
  const byId = new Map<string, SavedPostRecord>();
  for (const post of [...localPosts, ...serverPosts]) {
    if (!post || typeof post.id !== 'string') continue;
    const prev = byId.get(post.id);
    if (!prev || isPreferredClientRecord(post, prev)) {
      byId.set(post.id, post);
    }
  }

  const bySignature = new Map<string, SavedPostRecord>();
  const supersededDuplicateIds: string[] = [];

  for (const post of byId.values()) {
    const sig = normalizeClientPostSignature(post);
    const prev = bySignature.get(sig);
    if (!prev) {
      bySignature.set(sig, post);
    } else if (isPreferredClientRecord(post, prev)) {
      if (prev.id !== post.id) supersededDuplicateIds.push(prev.id);
      bySignature.set(sig, post);
    } else {
      if (post.id !== prev.id) supersededDuplicateIds.push(post.id);
    }
  }

  if (supersededDuplicateIds.length > 0) {
    const deleted = readDeletedIds();
    let changed = false;
    for (const dupId of supersededDuplicateIds) {
      if (!deleted.has(dupId)) {
        deleted.add(dupId);
        changed = true;
      }
    }
    if (changed) {
      writeDeletedIds(deleted);
    }
  }

  return Array.from(bySignature.values())
    .map((post) =>
      post.deck && Array.isArray(post.deck.slides)
        ? {
            ...post,
            deck: sanitizeFullCarousel(post.deck),
          }
        : post
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * @deprecated Legacy cross-origin Vault sync is permanently retired in Phase 2.2.
 * Returns null unconditionally to enforce single authoritative PostgreSQL storage.
 */
export function getRemoteVaultOrigin(): string | null {
  return null;
}

export interface VaultLoadResult {
  posts: SavedPostRecord[];
  storageEngine: SavedPostStorageEngine;
  isCloudPersistent: boolean;
  offlineFallback?: boolean;
  hasMore?: boolean;
  nextCursor?: string | null;
}

export interface VaultPageQueryOptions {
  cursor?: string | null;
  limit?: number;
  status?: 'all' | 'validated' | 'posted' | 'scheduled';
}

interface RawPostsApiResponse {
  posts?: SavedPostRecord[];
  nextCursor?: string | null;
  hasMore?: boolean;
  limit?: number;
  deletedIds?: string[];
  storageEngine?: SavedPostStorageEngine;
  isCloudPersistent?: boolean;
}

const MAX_VAULT_PAGES = 20;

function buildPostsEndpointUrl(options?: VaultPageQueryOptions): string {
  if (!options) return '/api/posts';
  const params = new URLSearchParams();
  if (typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0) {
    params.set('limit', String(Math.floor(options.limit)));
  }
  if (typeof options.cursor === 'string' && options.cursor.trim()) {
    params.set('cursor', options.cursor.trim());
  }
  if (options.status && options.status !== 'all') {
    params.set('status', options.status);
  }
  const qs = params.toString();
  return qs ? `/api/posts?${qs}` : '/api/posts';
}

async function fetchPostsPageRaw(options?: VaultPageQueryOptions): Promise<RawPostsApiResponse> {
  try {
    return await fetchAuthedJson<RawPostsApiResponse>(buildPostsEndpointUrl(options), {
      method: 'GET',
      timeoutMs: 20_000,
      contextLabel: 'Failed to load Vault posts',
    });
  } catch (err) {
    rethrowVaultApiErrorIfNonFallback(err);
    throw err;
  }
}

/**
 * Fetches a single cursor-paginated slice from GET /api/posts.
 */
export async function loadVaultPostsPage(
  options: VaultPageQueryOptions = {}
): Promise<VaultLoadResult> {
  const data = await fetchPostsPageRaw(options);
  const deletedIds = mergeServerDeletedIds(data.deletedIds);
  const pagePosts = (Array.isArray(data.posts) ? data.posts : [])
    .filter((p) => p && !deletedIds.has(p.id))
    .map((p) => ({ ...p, offlineDraft: false }));

  return {
    posts: pagePosts,
    storageEngine: data.storageEngine || 'local-disk',
    isCloudPersistent: Boolean(data.isCloudPersistent),
    offlineFallback: false,
    hasMore: Boolean(data.hasMore && data.nextCursor),
    nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
  };
}

/**
 * Loads saved validated/posted carousels from /api/posts, transparently following cursor pages
 * (`nextCursor`) so older posts remain accessible to UI search, status filters, calendar, and cadence engines.
 * Surfaces 400/401/403/503 auth & configuration errors directly instead of silently masking them.
 * Falls back to honest offline IndexedDB storage ONLY on network failures or transient 5xx outages.
 */
export async function loadVaultPosts(): Promise<VaultLoadResult> {
  let deletedIds = readDeletedIds();
  const localPosts = await readLocalVault();

  try {
    const accumulatedServerPosts: SavedPostRecord[] = [];
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    let storageEngine: SavedPostStorageEngine = 'local-disk';
    let isCloudPersistent = false;
    let hasMore = false;
    let lastNextCursor: string | null = null;

    for (let pageIdx = 0; pageIdx < MAX_VAULT_PAGES; pageIdx++) {
      // Keep page 1 URL exact (`/api/posts`) for backward compatibility with existing callers/tests;
      // follow server-issued `nextCursor` on subsequent pages.
      const data = await fetchPostsPageRaw(cursor ? { cursor } : undefined);
      deletedIds = mergeServerDeletedIds(data.deletedIds);
      if (pageIdx === 0) {
        storageEngine = data.storageEngine || 'local-disk';
        isCloudPersistent = Boolean(data.isCloudPersistent);
      }

      const pageItems = (Array.isArray(data.posts) ? data.posts : [])
        .filter((p) => p && !deletedIds.has(p.id))
        .map((p) => ({ ...p, offlineDraft: false }));
      accumulatedServerPosts.push(...pageItems);

      const nextCursor =
        typeof data.nextCursor === 'string' && data.nextCursor.trim().length > 0
          ? data.nextCursor.trim()
          : null;
      const serverHasMore = Boolean(data.hasMore && nextCursor);

      if (!serverHasMore || !nextCursor || seenCursors.has(nextCursor)) {
        hasMore = false;
        lastNextCursor = null;
        break;
      }

      seenCursors.add(nextCursor);
      cursor = nextCursor;
      hasMore = true;
      lastNextCursor = nextCursor;
    }

    // Deduplicate across page boundaries in case a post was updated concurrently while paging
    const serverById = new Map<string, SavedPostRecord>();
    for (const post of accumulatedServerPosts) {
      const prev = serverById.get(post.id);
      if (!prev || isPreferredClientRecord(post, prev)) {
        serverById.set(post.id, post);
      }
    }
    const serverPosts = Array.from(serverById.values());

    const pendingOfflineDrafts = localPosts.filter(
      (p) => p.offlineDraft === true && !deletedIds.has(p.id)
    );
    const merged = mergeRecords(serverPosts, pendingOfflineDrafts).filter(
      (p) => !deletedIds.has(p.id)
    );

    await writeLocalVault(merged);

    const deletedIdsArray = Array.from(deletedIds);

    // Sync ONLY genuine offline-created/edited drafts back up to the authoritative server
    if (pendingOfflineDrafts.length > 0 && merged.length > serverPosts.length) {
      fetchAuthedJson('/api/posts', {
        method: 'POST',
        body: { syncPosts: merged, deletedIds: deletedIdsArray },
        timeoutMs: 20_000,
        contextLabel: 'Background Vault sync',
      }).catch((syncErr) => {
        console.warn('[PostsVaultClient] Background offline draft sync failed:', syncErr);
      });
    }

    return {
      posts: merged,
      storageEngine,
      isCloudPersistent,
      offlineFallback: false,
      hasMore,
      nextCursor: lastNextCursor,
    };
  } catch (err) {
    if (err instanceof VaultApiError) {
      throw err;
    }
    console.warn('[PostsVaultClient] Backend unreachable (network/5xx), serving offline IndexedDB Vault:', err);
  }

  const rawOfflinePosts = localPosts.length > 0 ? localPosts : await readLocalVault();
  const offlinePosts = rawOfflinePosts.map((p) => ({
    ...p,
    offlineDraft: p.offlineDraft ?? true,
    storageEngine: p.storageEngine || ('browser-vault' as const),
  }));

  return {
    posts: offlinePosts,
    storageEngine: 'browser-vault',
    isCloudPersistent: false,
    offlineFallback: true,
    hasMore: false,
    nextCursor: null,
  };
}

export interface SaveValidPostParams {
  deck: CarouselData;
  postStatus?: SavedPostStatus;
  title?: string;
  allowOverride?: boolean;
  userReviewed?: boolean;
  verifiedNumbers?: boolean;
}

/**
 * Validates and saves a post as 'validated' or 'posted' via /api/posts
 * and mirrors it to the Browser IndexedDB cache.
 * Surfaces 400/401/403/503 errors directly; falls back to IndexedDB with `offlineDraft: true`
 * and honest QA status ONLY on network failures or transient 5xx responses (500/502/504).
 */
export async function saveValidPost(params: SaveValidPostParams): Promise<SavedPostRecord> {
  const blobVideoSlides = findNonPersistableBlobVideoSlides(params.deck);
  if (blobVideoSlides.length > 0) {
    throw new VaultApiError(
      'Temporary browser video URLs (blob:) expire when this tab closes and cannot be saved to the Vault. Export the MP4/WebM video directly or clear/replace the video clip before saving.',
      400,
      'NON_PERSISTABLE_BLOB_VIDEO'
    );
  }

  const deletedIds = readDeletedIds();
  const resolvedUserReviewed =
    params.userReviewed !== undefined
      ? params.userReviewed
      : params.deck.sourceMeta?.userReviewed !== undefined
      ? params.deck.sourceMeta.userReviewed
      : true;
  const resolvedVerifiedNumbers =
    params.verifiedNumbers !== undefined
      ? params.verifiedNumbers
      : params.deck.sourceMeta?.verifiedNumbers;

  const reviewedDeck: CarouselData = {
    ...params.deck,
    sourceMeta: {
      ...params.deck.sourceMeta,
      userReviewed: resolvedUserReviewed,
      ...(resolvedVerifiedNumbers !== undefined
        ? { verifiedNumbers: resolvedVerifiedNumbers }
        : {}),
    },
  };

  try {
    const payload = await fetchAuthedJson<{ post: SavedPostRecord }>('/api/posts', {
      method: 'POST',
      timeoutMs: 25_000,
      contextLabel: 'Failed to validate and save post',
      body: {
        id: reviewedDeck.id,
        deck: reviewedDeck,
        postStatus: params.postStatus || 'validated',
        title: params.title,
        allowOverride: params.allowOverride ?? true,
        ...(resolvedVerifiedNumbers !== undefined
          ? { verifiedNumbers: resolvedVerifiedNumbers }
          : {}),
      },
    });
    const savedPost: SavedPostRecord = {
      ...payload.post,
      offlineDraft: false,
    };
    if (deletedIds.has(savedPost.id)) {
      deletedIds.delete(savedPost.id);
      writeDeletedIds(deletedIds);
    }
    const currentLocal = await readLocalVault();
    const updatedLocal = mergeRecords([savedPost], currentLocal);
    await writeLocalVault(updatedLocal);

    return savedPost;
  } catch (err) {
    rethrowVaultApiErrorIfNonFallback(err);
    console.warn('[PostsVaultClient] Save request failed (network/5xx), persisting offline local draft:', err);

    // Network error or transient 5xx (500/502/504): honest offline local draft fallback
    const nowIso = new Date().toISOString();
    const id = reviewedDeck.id || `post_${Math.random().toString(36).slice(2, 10)}`;
    const sanitized = sanitizeFullCarousel({ ...reviewedDeck, id });
    const postStatus: SavedPostStatus = params.postStatus === 'posted' ? 'posted' : 'validated';
    const qaReport = runQAChecks(sanitized);
    const honestQaPassed =
      sanitized.sourceMeta?.qualityPassed === false ? false : Boolean(qaReport.canExport);
    const localRecord: SavedPostRecord = {
      id,
      title: String(params.title || sanitized.slides[0]?.enTitle || 'Saved Post').slice(0, 160),
      category: String(sanitized.category || 'SYSTEMS ARCHITECTURE').slice(0, 120),
      postStatus,
      createdAt: nowIso,
      updatedAt: nowIso,
      postedAt: postStatus === 'posted' ? nowIso : undefined,
      creatorHandle: String(
        sanitized.sourceMeta?.creator ||
          sanitized.sourceMeta?.channel ||
          sanitized.channel ||
          sanitized.brand ||
          'MARROK'
      ).slice(0, 100),
      slideCount: sanitized.slides.length,
      qaPassed: honestQaPassed,
      qualityPassed: honestQaPassed,
      humanApproved: resolvedUserReviewed,
      ...(resolvedVerifiedNumbers !== undefined
        ? { verifiedNumbers: resolvedVerifiedNumbers }
        : {}),
      offlineDraft: true,
      storageEngine: 'browser-vault',
      deck: sanitized,
    };

    if (deletedIds.has(id)) {
      deletedIds.delete(id);
      writeDeletedIds(deletedIds);
    }
    const currentLocal = await readLocalVault();
    const updatedLocal = mergeRecords([localRecord], currentLocal);
    await writeLocalVault(updatedLocal);
    return localRecord;
  }
}

/**
 * Toggles a saved post between 'validated' and 'posted'.
 */
export async function updateSavedPostStatus(
  id: string,
  postStatus: SavedPostStatus
): Promise<SavedPostRecord> {
  const currentLocal = await readLocalVault();
  const existing = currentLocal.find((p) => p.id === id);

  try {
    const data = await fetchAuthedJson<{ post: SavedPostRecord }>(
      `/api/posts/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: { postStatus },
        timeoutMs: 20_000,
        contextLabel: 'Failed to update post status',
      }
    );
    const updatedPost: SavedPostRecord = { ...data.post, offlineDraft: false };
    const updatedList = [updatedPost, ...currentLocal.filter((p) => p.id !== id)];
    await writeLocalVault(updatedList);
    return updatedPost;
  } catch (err) {
    rethrowVaultApiErrorIfNonFallback(err);
    console.warn('[PostsVaultClient] Status update failed (network/5xx), applying offline local update:', err);
  }

  if (!existing) {
    throw new Error('Saved post not found');
  }

  const nowIso = new Date().toISOString();
  const updatedRecord: SavedPostRecord = {
    ...existing,
    postStatus,
    offlineDraft: true,
    storageEngine: 'browser-vault',
    updatedAt: nowIso,
    postedAt: postStatus === 'posted' ? existing.postedAt || nowIso : undefined,
  };
  const updatedList = [updatedRecord, ...currentLocal.filter((p) => p.id !== id)];
  await writeLocalVault(updatedList);

  const deletedIdsArray = Array.from(readDeletedIds());

  fetchAuthedJson('/api/posts', {
    method: 'POST',
    body: { syncPosts: updatedList, deletedIds: deletedIdsArray },
    timeoutMs: 20_000,
    contextLabel: 'Background status sync',
  }).catch((syncErr) => {
    console.warn('[PostsVaultClient] Background offline status sync failed:', syncErr);
  });

  return updatedRecord;
}

/**
 * Deletes a saved post from both /api/posts and the Browser IndexedDB Vault.
 * Surfaces 400/401/403/503 errors directly instead of removing locally while unauthorized.
 */
export async function deleteSavedPost(id: string): Promise<SavedPostRecord[]> {
  try {
    await fetchAuthedJson(`/api/posts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      timeoutMs: 20_000,
      contextLabel: 'Failed to delete saved post',
    });
  } catch (err) {
    rethrowVaultApiErrorIfNonFallback(err);
    console.warn('[PostsVaultClient] Delete request failed (network/5xx), removing locally:', err);
  }

  const deletedIds = readDeletedIds();
  deletedIds.add(id);
  writeDeletedIds(deletedIds);

  const currentLocal = await readLocalVault();
  const remaining = currentLocal.filter((p) => p.id !== id);
  await writeLocalVault(remaining);
  return remaining;
}

/**
 * Synchronizes the local IndexedDB Vault after a post management action (reschedule, unschedule, or cancelAndDelete).
 */
export async function syncLocalVaultAfterManage(options: {
  updatedPost?: SavedPostRecord | null;
  deletedId?: string;
}): Promise<SavedPostRecord[]> {
  const { updatedPost, deletedId } = options;
  const currentLocal = await readLocalVault();

  if (deletedId) {
    const deletedIds = readDeletedIds();
    deletedIds.add(deletedId);
    writeDeletedIds(deletedIds);
    const remaining = currentLocal.filter((p) => p.id !== deletedId);
    await writeLocalVault(remaining);
    return remaining;
  }

  if (updatedPost) {
    const nextList = [updatedPost, ...currentLocal.filter((p) => p.id !== updatedPost.id)];
    await writeLocalVault(nextList);
    return nextList;
  }

  return currentLocal;
}

/**
 * Downloads the entire Saved Posts Vault as a portable .json backup file.
 */
export function exportVaultJson(posts: SavedPostRecord[]): void {
  const blob = new Blob([JSON.stringify(posts, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const datePart = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `marrok-validated-posts-${datePart}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Imports and validates a .json backup file into both IndexedDB and /api/posts.
 */
export async function importVaultJson(jsonText: string): Promise<SavedPostRecord[]> {
  const raw = JSON.parse(jsonText);
  const candidates = Array.isArray(raw) ? raw : Array.isArray(raw?.posts) ? raw.posts : [];
  const validRecords: SavedPostRecord[] = [];

  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue;
    const rawDeck = item.deck || item;
    const isSingleSlideDeck =
      item.slideCount === 1 ||
      rawDeck?.postFormat === 'single' ||
      rawDeck?.postFormat === 'reel' ||
      (Array.isArray(rawDeck?.slides) && rawDeck.slides.length === 1);
    const parsedDeck = parseCarouselData(rawDeck, {
      minSlides: isSingleSlideDeck ? 1 : 3,
      requireSlideContent: true,
    });
    if (!parsedDeck) continue;
    const sanitized = sanitizeFullCarousel(parsedDeck);
    const nowIso = new Date().toISOString();
    const id =
      (typeof item.id === 'string' && item.id.trim()) ||
      sanitized.id ||
      `post_${Math.random().toString(36).slice(2, 10)}`;
    sanitized.id = id;
    sanitized.sourceMeta = { ...sanitized.sourceMeta, userReviewed: true };
    const qaReport = runQAChecks(sanitized);

    validRecords.push({
      id,
      title: String(item.title || sanitized.slides[0]?.enTitle || 'Imported Post').slice(0, 160),
      category: String(item.category || sanitized.category || 'SYSTEMS ARCHITECTURE').slice(0, 120),
      postStatus: item.postStatus === 'posted' ? 'posted' : 'validated',
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : nowIso,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : nowIso,
      postedAt: typeof item.postedAt === 'string' ? item.postedAt : undefined,
      creatorHandle: String(item.creatorHandle || sanitized.brand || 'MARROK').slice(0, 100),
      slideCount: sanitized.slides.length,
      qaPassed:
        typeof item.qaPassed === 'boolean' ? item.qaPassed && qaReport.canExport : qaReport.canExport,
      deck: sanitized,
    });
  }

  if (validRecords.length === 0) {
    throw new Error('No valid posts found in imported JSON file');
  }

  const currentLocal = await readLocalVault();
  const merged = mergeRecords(validRecords, currentLocal);
  await writeLocalVault(merged);

  try {
    await fetchAuthedJson('/api/posts', {
      method: 'POST',
      timeoutMs: 25_000,
      contextLabel: 'Failed to sync imported Vault posts',
      body: {
        syncPosts: merged,
        deletedIds: Array.from(readDeletedIds()),
      },
    });
  } catch (err) {
    rethrowVaultApiErrorIfNonFallback(err);
    console.warn('[PostsVaultClient] Imported Vault posts saved locally; remote sync deferred:', err);
  }

  return merged;
}
