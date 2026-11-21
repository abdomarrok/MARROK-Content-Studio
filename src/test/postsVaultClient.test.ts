import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadVaultPosts,
  saveValidPost,
  updateSavedPostStatus,
  deleteSavedPost,
  VaultApiError,
} from '../lib/storage/postsVaultClient.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';

describe('Phase B2 — Honest Client IndexedDB Fallback & Error Surfacing', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('surfaces 401, 403, and 503 explicitly from loadVaultPosts instead of silently falling back to offline storage', async () => {
    for (const status of [401, 403, 503]) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ error: `Blocked with HTTP ${status}` }), { status })
      );

      await expect(loadVaultPosts()).rejects.toSatisfy(
        (err: unknown) => err instanceof VaultApiError && err.status === status
      );
    }
  });

  it('falls back to IndexedDB/local vault with offlineDraft=true ONLY on network or transient 5xx (500/502) failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Upstream timeout' }), { status: 502 })
    );

    const res = await loadVaultPosts();
    expect(res.storageEngine).toBe('browser-vault');
    expect(res.isCloudPersistent).toBe(false);
    expect(res.offlineFallback).toBe(true);
    expect(res.posts.every((p) => p.offlineDraft === true)).toBe(true);
  });

  it('surfaces 400, 401, 403, and 503 on saveValidPost without writing any fake offline record', async () => {
    for (const status of [400, 401, 403, 503]) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: status === 400 ? 'Invalid carousel payload' : `Auth/Config error ${status}`,
            details: ['Validation or session failure'],
          }),
          { status }
        )
      );

      await expect(
        saveValidPost({
          deck: { ...DEFAULT_STARTER_DECK, id: `post_err_${status}` },
          postStatus: 'validated',
          allowOverride: true,
        })
      ).rejects.toSatisfy(
        (err: unknown) => err instanceof VaultApiError && err.status === status
      );

      expect(window.localStorage.getItem('marrok_posts_vault_fallback_v1')).toBeNull();
    }
  });

  it('never forges qaPassed=true on offline fallback: sets offlineDraft=true and preserves failed QA status', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const failingQaDeck = {
      ...DEFAULT_STARTER_DECK,
      id: 'post_offline_failing_qa',
      slides: [
        {
          ...DEFAULT_STARTER_DECK.slides[0],
          enTitle: 'A technical breakdown of Redis.',
          arTitle: 'تحليل تقني متكامل.',
          enBody: 'Core mechanisms and operational boundaries.',
          arBody: 'الآليات الأساسية.',
        },
        ...DEFAULT_STARTER_DECK.slides.slice(1),
      ],
    };

    const saved = await saveValidPost({
      deck: failingQaDeck,
      postStatus: 'validated',
      allowOverride: true,
    });

    expect(saved.offlineDraft).toBe(true);
    expect(saved.storageEngine).toBe('browser-vault');
    expect(saved.qaPassed).toBe(false);
    expect(saved.qualityPassed).toBe(false);
  });

  it('surfaces 401/403/503 on updateSavedPostStatus and deleteSavedPost instead of mutating local Vault', async () => {
    window.localStorage.setItem(
      'marrok_posts_vault_fallback_v1',
      JSON.stringify([
        {
          id: 'post_protected_1',
          title: 'Protected Post',
          category: 'SECURITY',
          postStatus: 'validated',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          creatorHandle: 'MARROK',
          slideCount: 1,
          qaPassed: true,
          deck: DEFAULT_STARTER_DECK,
        },
      ])
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 })
    );
    await expect(updateSavedPostStatus('post_protected_1', 'posted')).rejects.toSatisfy(
      (err: unknown) => err instanceof VaultApiError && err.status === 401
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Session secret not configured' }), { status: 503 })
    );
    await expect(deleteSavedPost('post_protected_1')).rejects.toSatisfy(
      (err: unknown) => err instanceof VaultApiError && err.status === 503
    );

    // Local record and deletedIds must remain intact when delete failed with 503
    const rawLocal = JSON.parse(
      window.localStorage.getItem('marrok_posts_vault_fallback_v1') || '[]'
    );
    expect(rawLocal).toHaveLength(1);
    expect(rawLocal[0].id).toBe('post_protected_1');
  });

  it('drops stale synced local cache entries absent from server while keeping and syncing only genuine offlineDraft records', async () => {
    const nowIso = new Date().toISOString();
    window.localStorage.setItem(
      'marrok_posts_vault_fallback_v1',
      JSON.stringify([
        {
          id: 'post_stale_cached_1',
          title: 'Stale Cached Post',
          category: 'SECURITY',
          postStatus: 'validated',
          createdAt: nowIso,
          updatedAt: nowIso,
          creatorHandle: 'MARROK',
          slideCount: DEFAULT_STARTER_DECK.slides.length,
          qaPassed: true,
          offlineDraft: false,
          deck: { ...DEFAULT_STARTER_DECK, id: 'post_stale_cached_1' },
        },
        {
          id: 'post_genuine_offline_draft_1',
          title: 'Genuine Offline Draft',
          category: 'DISTRIBUTED SYSTEMS',
          postStatus: 'validated',
          createdAt: nowIso,
          updatedAt: nowIso,
          creatorHandle: 'MARROK',
          slideCount: DEFAULT_STARTER_DECK.slides.length,
          qaPassed: true,
          offlineDraft: true,
          deck: {
            ...DEFAULT_STARTER_DECK,
            id: 'post_genuine_offline_draft_1',
            slides: DEFAULT_STARTER_DECK.slides.map((s, idx) =>
              idx === 0 ? { ...s, enTitle: 'Unique Offline Draft Title' } : s
            ),
          },
        },
      ])
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            posts: [],
            deletedIds: [],
            storageEngine: 'neon-postgres',
            isCloudPersistent: true,
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            posts: [],
            deletedIds: [],
            storageEngine: 'neon-postgres',
            isCloudPersistent: true,
          }),
          { status: 200 }
        )
      );

    const res = await loadVaultPosts();
    expect(res.posts.map((p) => p.id)).toEqual(['post_genuine_offline_draft_1']);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const syncBody = JSON.parse(String(fetchSpy.mock.calls[1][1]?.body || '{}'));
    expect(syncBody.syncPosts.map((p: any) => p.id)).toEqual(['post_genuine_offline_draft_1']);

    const cachedAfter = JSON.parse(
      window.localStorage.getItem('marrok_posts_vault_fallback_v1') || '[]'
    );
    expect(cachedAfter.map((p: any) => p.id)).toEqual(['post_genuine_offline_draft_1']);
  });
});
