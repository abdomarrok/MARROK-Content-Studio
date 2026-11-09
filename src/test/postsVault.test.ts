import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { describe, it, expect, afterEach } from 'vitest';
import { getServerConfig, normalizeGenerationModel } from '../../api/config.ts';
import {
  resolveStorageFilePath,
  validateAndBuildPostRecord,
  mergePostLists,
  saveStoredPosts,
  loadStoredPosts,
} from '../../api/controllers/postsController.ts';
import {
  resetModelCooldownsForTest,
  recordModelUnavailable,
  getPrioritizedModels,
  formatModelFallbackReason,
} from '../../api/controllers/generateController.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';

describe('Gemini Model Deprecation Upgrade & Vercel Persistence Vault', () => {
  const testFilePath = path.join(os.tmpdir(), `marrok-test-posts-${Date.now()}.json`);

  afterEach(async () => {
    resetModelCooldownsForTest();
    try {
      await fs.unlink(testFilePath);
    } catch {
      // Ignore if not created
    }
  });

  it('upgrades deprecated gemini-2.5/2.0/1.5 models to gemini-3.8-flash and gemini-3.1-flash-lite', () => {
    expect(normalizeGenerationModel('gemini-2.5-flash')).toBe('gemini-3.8-flash');
    expect(normalizeGenerationModel('gemini-2.5-flash-lite')).toBe('gemini-3.1-flash-lite');

    const cfg = getServerConfig({
      GEMINI_GENERATION_MODELS: 'gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash',
    });
    expect(cfg.generationModels).toEqual(['gemini-3.8-flash', 'gemini-3.1-flash-lite']);
  });

  it('deprioritizes models experiencing HTTP 503 high demand and formats fallback notices cleanly', () => {
    const models = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    const highDemandErr = new Error(
      '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary."}}'
    );

    recordModelUnavailable('gemini-3.8-flash', highDemandErr);

    const prioritized = getPrioritizedModels(models, new Set(['gemini-3.8-flash']));
    expect(prioritized[0]).toBe('gemini-3.1-flash-lite');
    expect(prioritized[1]).toBe('gemini-flash-latest');
    expect(prioritized[2]).toBe('gemini-3.8-flash');

    const reason = formatModelFallbackReason(highDemandErr);
    expect(reason).toBe('HTTP 503/429 temporary high demand');
    expect(reason).not.toContain('{"error"');
  });

  it('routes file fallback to os.tmpdir() on Vercel serverless to prevent EROFS errors', () => {
    const vercelResolved = resolveStorageFilePath({ VERCEL: '1' });
    expect(vercelResolved.engine).toBe('vercel-tmp');
    expect(vercelResolved.filePath.startsWith(os.tmpdir())).toBe(true);

    const localResolved = resolveStorageFilePath({});
    expect(localResolved.engine).toBe('local-disk');
    expect(localResolved.filePath).toContain(path.join('data', 'saved-posts.json'));
  });

  it('rejects invalid decks and validates & builds SavedPostRecord for valid posts (carousel and single-slide)', () => {
    const invalidRes = validateAndBuildPostRecord({
      deck: { slides: [{ enTitle: 'Only one slide.' }] },
    });
    expect(invalidRes.ok).toBe(false);

    const validRes = validateAndBuildPostRecord({
      deck: DEFAULT_STARTER_DECK,
      postStatus: 'posted',
      allowOverride: true,
    });
    expect(validRes.ok).toBe(true);
    if (validRes.ok) {
      expect(validRes.record.postStatus).toBe('posted');
      expect(validRes.record.postedAt).toBeDefined();
      expect(validRes.record.deck.sourceMeta?.userReviewed).toBe(true);
      expect(validRes.record.slideCount).toBe(DEFAULT_STARTER_DECK.slides.length);
    }

    const singleSlideDeck = {
      ...DEFAULT_STARTER_DECK,
      postFormat: 'single' as const,
      slides: [
        {
          ...DEFAULT_STARTER_DECK.slides[0],
          enCredit: 'Source: MARROK',
          arCredit: 'المصدر: MARROK',
        },
      ],
    };
    const singleValidRes = validateAndBuildPostRecord({
      deck: singleSlideDeck,
      postStatus: 'validated',
      allowOverride: true,
    });
    expect(singleValidRes.ok).toBe(true);
    if (singleValidRes.ok) {
      expect(singleValidRes.record.slideCount).toBe(1);
      expect(singleValidRes.record.deck.postFormat).toBe('single');
    }
  });

  it('persists and reconciles saved posts across server and client lists', async () => {
    const env = { POSTS_STORAGE_FILE: testFilePath, VERCEL: '1' };
    const built = validateAndBuildPostRecord({
      id: 'post_scion_1',
      deck: DEFAULT_STARTER_DECK,
      postStatus: 'validated',
      allowOverride: true,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const engine = await saveStoredPosts([built.record], env);
    expect(engine).toBe('vercel-tmp');

    const loaded = await loadStoredPosts(env);
    expect(loaded.posts).toHaveLength(1);
    expect(loaded.posts[0].id).toBe('post_scion_1');

    // Merge with newer status update
    const newerRecord = {
      ...built.record,
      postStatus: 'posted' as const,
      updatedAt: new Date(Date.now() + 5000).toISOString(),
    };
    const merged = mergePostLists(loaded.posts, [newerRecord]);
    expect(merged).toHaveLength(1);
    expect(merged[0].postStatus).toBe('posted');
  });

  it('hydrates bundled data/saved-posts.json on Vercel cold start when /tmp is empty', async () => {
    const tmpVercelFile = path.join(os.tmpdir(), 'marrok-saved-posts.json');
    try {
      await fs.unlink(tmpVercelFile);
    } catch {
      // Ignore if not present
    }

    const coldStartLoaded = await loadStoredPosts({ VERCEL: '1' });
    expect(coldStartLoaded.storageEngine).toBe('vercel-tmp');
    expect(coldStartLoaded.posts.length).toBeGreaterThanOrEqual(1);
    expect(coldStartLoaded.posts.some((p) => p.title === 'Is Your Voice Still Yours?')).toBe(true);
  });

  it('deduplicates repeated drafts with different UUIDs that share the same normalized title and format', () => {
    const first = validateAndBuildPostRecord({
      id: 'post_dup_old',
      deck: { ...DEFAULT_STARTER_DECK, id: 'post_dup_old' },
      postStatus: 'validated',
      allowOverride: true,
    });
    const second = validateAndBuildPostRecord({
      id: 'post_dup_new',
      deck: { ...DEFAULT_STARTER_DECK, id: 'post_dup_new' },
      postStatus: 'validated',
      allowOverride: true,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const olderRecord = { ...first.record, updatedAt: '2026-10-29T13:36:14.000Z' };
    const newerRecord = { ...second.record, updatedAt: '2026-10-29T14:03:02.000Z' };

    const merged = mergePostLists([olderRecord], [newerRecord]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('post_dup_new');
  });

  it('preserves zernioPostIds, tiktokHostedSlideUrls, poster takeaways, and layoutOverrides when updating an existing record', () => {
    const existingBuild = validateAndBuildPostRecord({
      id: 'post_scheduled_tt',
      deck: DEFAULT_STARTER_DECK,
      postStatus: 'validated',
      allowOverride: true,
    });
    expect(existingBuild.ok).toBe(true);
    if (!existingBuild.ok) return;

    const existingWithZernio = {
      ...existingBuild.record,
      scheduledFor: '2026-12-01T18:00:00.000Z',
      publishTargets: ['instagram' as const, 'tiktok' as const],
      hostedSlideUrls: ['https://res.cloudinary.com/demo/slide1_4x5.jpg'],
      tiktokHostedSlideUrls: ['https://res.cloudinary.com/demo/slide1_9x16.jpg'],
      bufferPostIds: ['buf_123'],
      zernioPostIds: ['zer_999'],
    };

    const editedPosterDeck = {
      ...DEFAULT_STARTER_DECK,
      id: 'post_scheduled_tt',
      postFormat: 'single' as const,
      dimensionPreset: 'tiktok-9:16' as const,
      slides: [
        {
          ...DEFAULT_STARTER_DECK.slides[0],
          type: 'poster' as const,
          enCredit: 'Source: MARROK',
          arCredit: 'المصدر: MARROK',
          takeaways: [
            { en: 'Zero Trust', ar: 'انعدام الثقة', icon: 'shield' },
          ],
          layoutOverrides: {
            titleBlock: { dx: 10, dy: -20, scale: 1.1 },
          },
        },
      ],
    };

    const updated = validateAndBuildPostRecord({
      id: 'post_scheduled_tt',
      deck: editedPosterDeck,
      postStatus: 'validated',
      allowOverride: true,
      existingRecord: existingWithZernio,
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;

    expect(updated.record.zernioPostIds).toEqual(['zer_999']);
    expect(updated.record.tiktokHostedSlideUrls).toEqual([
      'https://res.cloudinary.com/demo/slide1_9x16.jpg',
    ]);
    expect(updated.record.bufferPostIds).toEqual(['buf_123']);
    expect(updated.record.deck.slides[0].type).toBe('poster');
    expect(updated.record.deck.slides[0].takeaways).toHaveLength(1);
    expect(updated.record.deck.slides[0].layoutOverrides?.titleBlock?.dy).toBe(-20);
  });

  it('prevents deleted post resurrection across devices via deletedIds tombstones in mergePostLists', () => {
    const built = validateAndBuildPostRecord({
      id: 'post_to_delete',
      deck: DEFAULT_STARTER_DECK,
      postStatus: 'validated',
      allowOverride: true,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;

    const deletedSet = new Set(['post_to_delete']);
    const merged = mergePostLists([], [built.record], deletedSet);
    expect(merged).toHaveLength(0);
  });
});
