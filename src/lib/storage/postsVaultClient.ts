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
import { withClientAuthHeaders } from '../security/clientSessionToken.ts';

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

async function readApiErrorPayload(
  res: Response,
  fallbackMessage: string
): Promise<{ message: string; code?: string }> {
  try {
    const payload = (await res.json()) as {
      error?: string;
      details?: string[];
      code?: string;
    };
    const errMsg = payload?.error || fallbackMessage;
    const details = Array.isArray(payload?.details) && payload.details[0] ? ` (${payload.details[0]})` : '';
    return { message: `${errMsg}${details}`, code: payload?.code };
  } catch {
    return { message: `${fallbackMessage} (HTTP ${res.status})` };
  }
}

let cachedBundledPosts: SavedPostRecord[] | null = null;

async function loadBundledClientSeedPostsLazy(): Promise<SavedPostRecord[]> {
  if (cachedBundledPosts !== null) return cachedBundledPosts;
  try {
    const mod = await import('./bundledSavedPosts.ts');
    cachedBundledPosts = Array.isArray(mod.BUNDLED_SAVED_POSTS) ? mod.BUNDLED_SAVED_POSTS : [];
    return cachedBundledPosts;
  } catch {
    cachedBundledPosts = [];
    return [];
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

async function readLocalVault(options?: { includeOfflineSeed?: boolean }): Promise<SavedPostRecord[]> {
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

  if (storedItems.length === 0 && options?.includeOfflineSeed) {
    const bundled = (await loadBundledClientSeedPostsLazy()).filter((p) => !deletedIds.has(p.id));
    return mergeRecords(storedItems, bundled).filter((p) => !deletedIds.has(p.id));
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

function mergeRecords(
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

function getRemoteVaultOrigin(): string | null {
  if (typeof window === 'undefined') return null;
  if (import.meta.env?.MODE === 'test') return null;
  const configured = (import.meta.env?.VITE_REMOTE_VAULT_ORIGIN || '')
    .trim()
    .replace(/\/+$/, '');
  if (!configured || !configured.startsWith('https://')) return null;
  if (window.location.origin === configured) return null;
  return configured;
}

export interface VaultLoadResult {
  posts: SavedPostRecord[];
  storageEngine: SavedPostStorageEngine;
  isCloudPersistent: boolean;
  offlineFallback?: boolean;
}

/**
 * Loads saved validated/posted carousels from /api/posts and reconciles with the local IndexedDB cache.
 * Surfaces 400/401/403/503 auth & configuration errors directly instead of silently masking them.
 * Falls back to honest offline IndexedDB storage ONLY on network failures or transient 5xx outages.
 */
export async function loadVaultPosts(): Promise<VaultLoadResult> {
  let deletedIds = readDeletedIds();
  const localPosts = await readLocalVault();
  const remoteOrigin = getRemoteVaultOrigin();

  try {
    const [res, remoteRes] = await Promise.all([
      fetch('/api/posts', {
        method: 'GET',
        credentials: 'include',
        headers: withClientAuthHeaders({ Accept: 'application/json' }),
      }),
      remoteOrigin
        ? fetch(`${remoteOrigin}/api/posts`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    let remotePosts: SavedPostRecord[] = [];
    if (remoteRes && remoteRes.ok) {
      try {
        const remoteData = (await remoteRes.json()) as {
          posts?: SavedPostRecord[];
          deletedIds?: string[];
        };
        deletedIds = mergeServerDeletedIds(remoteData.deletedIds);
        remotePosts = (Array.isArray(remoteData.posts) ? remoteData.posts : []).filter(
          (p) => !deletedIds.has(p.id)
        );
      } catch {
        // Ignore remote parse error
      }
    }

    if (!res.ok) {
      const { message, code } = await readApiErrorPayload(res, 'Failed to load Vault posts');
      if (isNonFallbackHttpStatus(res.status)) {
        throw new VaultApiError(message, res.status, code);
      }
      throw new Error(message);
    }

    const data = (await res.json()) as {
      posts?: SavedPostRecord[];
      deletedIds?: string[];
      storageEngine?: SavedPostStorageEngine;
      isCloudPersistent?: boolean;
    };
    deletedIds = mergeServerDeletedIds(data.deletedIds);
    const serverPosts = (Array.isArray(data.posts) ? data.posts : [])
      .filter((p) => !deletedIds.has(p.id))
      .map((p) => ({ ...p, offlineDraft: false }));
    const filteredLocalPosts = localPosts.filter((p) => !deletedIds.has(p.id));
    const mergedServerAndRemote = mergeRecords(remotePosts, serverPosts);
    const merged = mergeRecords(mergedServerAndRemote, filteredLocalPosts).filter(
      (p) => !deletedIds.has(p.id)
    );

    await writeLocalVault(merged);

    const deletedIdsArray = Array.from(deletedIds);

    // Sync any unsynced offline local drafts back up to the authenticated server when online
    if (merged.length > serverPosts.length) {
      fetch('/api/posts', {
        method: 'POST',
        credentials: 'include',
        headers: withClientAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ syncPosts: merged, deletedIds: deletedIdsArray }),
      }).catch(() => {
        // Non-blocking background sync
      });
    }

    if (remoteOrigin && merged.length > remotePosts.length) {
      fetch(`${remoteOrigin}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncPosts: merged, deletedIds: deletedIdsArray }),
      }).catch(() => {
        // Non-blocking background sync
      });
    }

    return {
      posts: merged,
      storageEngine: data.storageEngine || 'local-disk',
      isCloudPersistent: Boolean(data.isCloudPersistent),
      offlineFallback: false,
    };
  } catch (err) {
    if (err instanceof VaultApiError) {
      throw err;
    }
    console.warn('[PostsVaultClient] Backend unreachable (network/5xx), serving offline IndexedDB Vault:', err);
  }

  const rawOfflinePosts =
    localPosts.length > 0 ? localPosts : await readLocalVault({ includeOfflineSeed: true });
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
  };
}

export interface SaveValidPostParams {
  deck: CarouselData;
  postStatus?: SavedPostStatus;
  title?: string;
  allowOverride?: boolean;
  userReviewed?: boolean;
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
  const reviewedDeck: CarouselData = {
    ...params.deck,
    sourceMeta: {
      ...params.deck.sourceMeta,
      userReviewed: params.userReviewed ?? true,
    },
  };

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      credentials: 'include',
      headers: withClientAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        id: reviewedDeck.id,
        deck: reviewedDeck,
        postStatus: params.postStatus || 'validated',
        title: params.title,
        allowOverride: params.allowOverride ?? true,
      }),
    });

    if (!res.ok) {
      const { message, code } = await readApiErrorPayload(res, 'Failed to validate and save post');
      if (isNonFallbackHttpStatus(res.status)) {
        throw new VaultApiError(message, res.status, code);
      }
      throw new Error(message);
    }

    const payload = (await res.json()) as { post: SavedPostRecord };
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

    const remoteOrigin = getRemoteVaultOrigin();
    if (remoteOrigin) {
      fetch(`${remoteOrigin}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          syncPosts: updatedLocal,
          deletedIds: Array.from(readDeletedIds()),
        }),
      }).catch(() => {});
    }

    return savedPost;
  } catch (err) {
    if (err instanceof VaultApiError) {
      throw err;
    }

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
  const remoteOrigin = getRemoteVaultOrigin();

  try {
    const res = await fetch(`/api/posts/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      credentials: 'include',
      headers: withClientAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ postStatus }),
    });

    if (!res.ok) {
      const { message, code } = await readApiErrorPayload(res, 'Failed to update post status');
      if (isNonFallbackHttpStatus(res.status)) {
        throw new VaultApiError(message, res.status, code);
      }
      throw new Error(message);
    }

    const data = (await res.json()) as { post: SavedPostRecord };
    const updatedPost: SavedPostRecord = { ...data.post, offlineDraft: false };
    const updatedList = [updatedPost, ...currentLocal.filter((p) => p.id !== id)];
    await writeLocalVault(updatedList);
    if (remoteOrigin) {
      fetch(`${remoteOrigin}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          syncPosts: updatedList,
          deletedIds: Array.from(readDeletedIds()),
        }),
      }).catch(() => {});
    }
    return updatedPost;
  } catch (err) {
    if (err instanceof VaultApiError) {
      throw err;
    }
    // Fallback to offline local update ONLY on network error or transient 5xx outage
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

  fetch('/api/posts', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ syncPosts: updatedList, deletedIds: deletedIdsArray }),
  }).catch(() => {});

  if (remoteOrigin) {
    fetch(`${remoteOrigin}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncPosts: updatedList, deletedIds: deletedIdsArray }),
    }).catch(() => {});
  }

  return updatedRecord;
}

/**
 * Deletes a saved post from both /api/posts and the Browser IndexedDB Vault.
 * Surfaces 400/401/403/503 errors directly instead of removing locally while unauthorized.
 */
export async function deleteSavedPost(id: string): Promise<SavedPostRecord[]> {
  const remoteOrigin = getRemoteVaultOrigin();

  try {
    const res = await fetch(`/api/posts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: withClientAuthHeaders(),
    });

    if (!res.ok) {
      const { message, code } = await readApiErrorPayload(res, 'Failed to delete saved post');
      if (isNonFallbackHttpStatus(res.status)) {
        throw new VaultApiError(message, res.status, code);
      }
      throw new Error(message);
    }

    if (remoteOrigin) {
      void fetch(`${remoteOrigin}/api/posts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }).catch(() => null);
    }
  } catch (err) {
    if (err instanceof VaultApiError) {
      throw err;
    }
    // Continue removing locally on transient network/5xx outage
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
    const res = await fetch('/api/posts', {
      method: 'POST',
      credentials: 'include',
      headers: withClientAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        syncPosts: merged,
        deletedIds: Array.from(readDeletedIds()),
      }),
    });
    if (!res.ok) {
      const { message, code } = await readApiErrorPayload(res, 'Failed to sync imported Vault posts');
      if (isNonFallbackHttpStatus(res.status)) {
        throw new VaultApiError(message, res.status, code);
      }
    }
  } catch (err) {
    if (err instanceof VaultApiError) {
      throw err;
    }
    // Non-fatal if offline (network/5xx)
  }

  return merged;
}
