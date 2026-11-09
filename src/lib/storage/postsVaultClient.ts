import type {
  CarouselData,
  SavedPostRecord,
  SavedPostStatus,
  SavedPostStorageEngine,
} from '../../types.ts';
import { parseCarouselData } from '../validation/carousel.ts';
import { sanitizeFullCarousel } from '../textSanitizer.ts';
import { BUNDLED_SAVED_POSTS } from './bundledSavedPosts.ts';

const IDB_NAME = 'marrok_posts_vault_v1';
const IDB_STORE = 'saved_posts';
const IDB_VERSION = 1;
const FALLBACK_LS_KEY = 'marrok_posts_vault_fallback_v1';
const DELETED_IDS_LS_KEY = 'marrok_posts_deleted_ids_v1';

function getBundledClientSeedPosts(): SavedPostRecord[] {
  if (!Array.isArray(BUNDLED_SAVED_POSTS)) return [];
  return BUNDLED_SAVED_POSTS;
}

function readDeletedIds(): Set<string> {
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

function writeDeletedIds(ids: Set<string>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(DELETED_IDS_LS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Ignore storage quota errors
  }
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
  const bundled = getBundledClientSeedPosts().filter((p) => !deletedIds.has(p.id));
  const db = await openVaultDb();
  if (db) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          const items = Array.isArray(req.result) ? (req.result as SavedPostRecord[]) : [];
          const merged = mergeRecords(items, bundled).filter((p) => !deletedIds.has(p.id));
          resolve(merged);
        };
        req.onerror = () => resolve(bundled);
      } catch {
        resolve(bundled);
      }
    });
  }

  try {
    const raw = localStorage.getItem(FALLBACK_LS_KEY);
    if (!raw) return bundled;
    const parsed = JSON.parse(raw);
    const localItems = Array.isArray(parsed) ? (parsed as SavedPostRecord[]) : [];
    return mergeRecords(localItems, bundled).filter((p) => !deletedIds.has(p.id));
  } catch {
    return bundled;
  }
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

  return Array.from(bySignature.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

const DEFAULT_REMOTE_VAULT_ORIGIN = 'https://marrok-tik-tok-carousel-studio.vercel.app';

function getRemoteVaultOrigin(): string | null {
  if (typeof window === 'undefined') return null;
  if (import.meta.env?.MODE === 'test') return null;
  const configured = (import.meta.env?.VITE_REMOTE_VAULT_ORIGIN || DEFAULT_REMOTE_VAULT_ORIGIN)
    .trim()
    .replace(/\/+$/, '');
  if (!configured) return null;
  if (window.location.origin === configured) return null;
  return configured;
}

export interface VaultLoadResult {
  posts: SavedPostRecord[];
  storageEngine: SavedPostStorageEngine;
  isCloudPersistent: boolean;
}

/**
 * Loads saved validated/posted carousels by reconciling the bundled repository seed posts,
 * backend (/api/posts), remote Vercel deployment vault, and the durable Browser IndexedDB Vault.
 * If the Vercel serverless /tmp store cold-started, automatically re-hydrates /api/posts
 * from the browser's IndexedDB + bundled Vault.
 */
export async function loadVaultPosts(): Promise<VaultLoadResult> {
  const deletedIds = readDeletedIds();
  const localPosts = await readLocalVault();
  const remoteOrigin = getRemoteVaultOrigin();

  try {
    const [res, remoteRes] = await Promise.all([
      fetch('/api/posts', {
        method: 'GET',
        headers: { Accept: 'application/json' },
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
        const remoteData = (await remoteRes.json()) as { posts?: SavedPostRecord[] };
        remotePosts = (Array.isArray(remoteData.posts) ? remoteData.posts : []).filter(
          (p) => !deletedIds.has(p.id)
        );
      } catch {
        // Ignore remote parse error
      }
    }

    if (res.ok) {
      const data = (await res.json()) as {
        posts?: SavedPostRecord[];
        storageEngine?: SavedPostStorageEngine;
        isCloudPersistent?: boolean;
      };
      const serverPosts = (Array.isArray(data.posts) ? data.posts : []).filter(
        (p) => !deletedIds.has(p.id)
      );
      const mergedServerAndRemote = mergeRecords(remotePosts, serverPosts);
      const merged = mergeRecords(mergedServerAndRemote, localPosts).filter(
        (p) => !deletedIds.has(p.id)
      );

      // Persist reconciled set locally
      await writeLocalVault(merged);

      // If client IndexedDB/remote/bundled seed had posts missing from local server, push them up
      if (merged.length > serverPosts.length) {
        fetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ syncPosts: merged }),
        }).catch(() => {
          // Non-blocking background sync
        });
      }

      // If local/IndexedDB had posts missing from remote Vercel server, push them to remote too
      if (remoteOrigin && merged.length > remotePosts.length) {
        fetch(`${remoteOrigin}/api/posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ syncPosts: merged }),
        }).catch(() => {
          // Non-blocking background sync
        });
      }

      return {
        posts: merged,
        storageEngine: data.storageEngine || 'vercel-tmp',
        isCloudPersistent: Boolean(data.isCloudPersistent),
      };
    }
  } catch (err) {
    console.warn('[PostsVaultClient] Backend unreachable, serving from IndexedDB Vault:', err);
  }

  return {
    posts: localPosts,
    storageEngine: 'browser-vault',
    isCloudPersistent: false,
  };
}

export interface SaveValidPostParams {
  deck: CarouselData;
  postStatus?: SavedPostStatus;
  title?: string;
  allowOverride?: boolean;
}

/**
 * Validates and saves a post as 'validated' or 'posted' via /api/posts
 * and mirrors it to the Browser IndexedDB Vault.
 */
export async function saveValidPost(params: SaveValidPostParams): Promise<SavedPostRecord> {
  const deletedIds = readDeletedIds();
  const reviewedDeck: CarouselData = {
    ...params.deck,
    sourceMeta: {
      ...params.deck.sourceMeta,
      userReviewed: true,
    },
  };

  try {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: reviewedDeck.id,
        deck: reviewedDeck,
        postStatus: params.postStatus || 'validated',
        title: params.title,
        allowOverride: params.allowOverride ?? true,
      }),
    });

    const payload = await res.json();
    if (!res.ok) {
      const errMsg = payload?.error || 'Failed to validate and save post';
      const details = Array.isArray(payload?.details) ? ` (${payload.details[0]})` : '';
      throw new Error(`${errMsg}${details}`);
    }

    const savedPost = payload.post as SavedPostRecord;
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
        body: JSON.stringify({ syncPosts: updatedLocal }),
      }).catch(() => {});
    }

    return savedPost;
  } catch (err) {
    // If the error was an explicit 400 validation error from the backend, rethrow it
    if (err instanceof Error && err.message.startsWith('Invalid carousel payload')) {
      throw err;
    }

    // Fallback to durable Browser IndexedDB Vault if serverless endpoint is unreachable
    const nowIso = new Date().toISOString();
    const id = reviewedDeck.id || `post_${Math.random().toString(36).slice(2, 10)}`;
    const sanitized = sanitizeFullCarousel({ ...reviewedDeck, id });
    const postStatus: SavedPostStatus = params.postStatus === 'posted' ? 'posted' : 'validated';
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
      qaPassed: true,
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postStatus }),
    });

    if (res.ok) {
      const data = (await res.json()) as { post: SavedPostRecord };
      const updatedList = [data.post, ...currentLocal.filter((p) => p.id !== id)];
      await writeLocalVault(updatedList);
      if (remoteOrigin) {
        fetch(`${remoteOrigin}/api/posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ syncPosts: updatedList }),
        }).catch(() => {});
      }
      return data.post;
    }
  } catch {
    // Fallback to local update if server cold-started
  }

  if (!existing) {
    throw new Error('Saved post not found');
  }

  const nowIso = new Date().toISOString();
  const updatedRecord: SavedPostRecord = {
    ...existing,
    postStatus,
    updatedAt: nowIso,
    postedAt: postStatus === 'posted' ? existing.postedAt || nowIso : undefined,
  };
  const updatedList = [updatedRecord, ...currentLocal.filter((p) => p.id !== id)];
  await writeLocalVault(updatedList);

  // Sync updated record back to server
  fetch('/api/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ syncPosts: updatedList }),
  }).catch(() => {});

  if (remoteOrigin) {
    fetch(`${remoteOrigin}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncPosts: updatedList }),
    }).catch(() => {});
  }

  return updatedRecord;
}

/**
 * Deletes a saved post from both /api/posts and the Browser IndexedDB Vault.
 */
export async function deleteSavedPost(id: string): Promise<SavedPostRecord[]> {
  const deletedIds = readDeletedIds();
  deletedIds.add(id);
  writeDeletedIds(deletedIds);
  const remoteOrigin = getRemoteVaultOrigin();

  try {
    await Promise.all([
      fetch(`/api/posts/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
      remoteOrigin
        ? fetch(`${remoteOrigin}/api/posts/${encodeURIComponent(id)}`, {
            method: 'DELETE',
          }).catch(() => null)
        : Promise.resolve(null),
    ]);
  } catch {
    // Continue removing from local vault even if network fails
  }

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
    const parsedDeck = parseCarouselData(item.deck || item, {
      minSlides: 3,
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
      qaPassed: item.qaPassed !== false,
      deck: sanitized,
    });
  }

  if (validRecords.length === 0) {
    throw new Error('No valid 3+ slide carousels found in imported JSON file');
  }

  const currentLocal = await readLocalVault();
  const merged = mergeRecords(validRecords, currentLocal);
  await writeLocalVault(merged);

  try {
    await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncPosts: merged }),
    });
  } catch {
    // Non-fatal if offline
  }

  return merged;
}
