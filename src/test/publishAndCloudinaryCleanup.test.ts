import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import {
  signCloudinaryParams,
  computeFreePlanQuotaStats,
  sweepExpiredCloudinaryAssets,
} from '../../api/controllers/publishController.ts';
import { saveStoredPosts } from '../../api/controllers/postsController.ts';
import {
  buildMetricoolCsvRowFromDeck,
  computeWeeklyScheduleSlots,
  deriveMetricoolAltTexts,
  deriveMetricoolDocumentTitle,
  deriveMetricoolTikTokTitle,
  generateMetricoolBulkCsv,
  OFFICIAL_METRICOOL_CSV_HEADERS,
} from '../lib/publish/publishClient.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';
import type { SavedPostRecord } from '../types.ts';

describe('Publishing, Weekly Queue & Cloudinary Auto-Cleanup Engine', () => {
  const tmpFile = path.join(os.tmpdir(), `marrok-publish-test-${Date.now()}.json`);

  beforeEach(async () => {
    process.env.POSTS_STORAGE_FILE = tmpFile;
    process.env.CLOUDINARY_CLOUD_NAME = 'dug1cw6ux';
    process.env.CLOUDINARY_API_KEY = '286517213493826';
    process.env.CLOUDINARY_API_SECRET = 'test_secret_for_signature';
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.POSTS_STORAGE_FILE;
    try {
      await fs.unlink(tmpFile);
    } catch {
      // ignore
    }
  });

  it('computes deterministic SHA-1 Cloudinary signatures with alphabetically sorted keys', () => {
    const sig1 = signCloudinaryParams(
      {
        timestamp: 1730000000,
        public_id: 'post_1_s1',
        folder: 'marrok_staging',
      },
      'my_api_secret'
    );
    const sig2 = signCloudinaryParams(
      {
        folder: 'marrok_staging',
        public_id: 'post_1_s1',
        timestamp: 1730000000,
      },
      'my_api_secret'
    );
    expect(sig1).toBe(sig2);
    expect(sig1).toMatch(/^[a-f0-9]{40}$/);
  });

  it('tracks Metricool 20/month quota and Buffer 10/channel active queue slots accurately', () => {
    const nowIso = new Date().toISOString();
    const currentMonthKey = nowIso.slice(0, 7);
    const futureIso = new Date(Date.now() + 48 * 3600_000).toISOString();

    const mockPosts: SavedPostRecord[] = [
      {
        id: 'p_tt_1',
        title: 'TikTok Scheduled Post',
        category: 'AI',
        postStatus: 'posted',
        createdAt: nowIso,
        updatedAt: nowIso,
        postedAt: nowIso,
        creatorHandle: '@MARROK',
        slideCount: 6,
        qaPassed: true,
        deck: DEFAULT_STARTER_DECK,
        scheduledFor: futureIso,
        publishTargets: ['tiktok', 'instagram'],
        countedInMetricoolMonth: currentMonthKey,
        cloudinaryPublicIds: ['marrok_staging/p_tt_1_s1', 'marrok_staging/p_tt_1_s2'],
      },
      {
        id: 'p_cleaned_1',
        title: 'Already Cleaned Post',
        category: 'SYSTEMS',
        postStatus: 'posted',
        createdAt: nowIso,
        updatedAt: nowIso,
        postedAt: nowIso,
        creatorHandle: '@MARROK',
        slideCount: 4,
        qaPassed: true,
        deck: DEFAULT_STARTER_DECK,
        publishTargets: ['linkedin'],
        cloudinaryPublicIds: ['marrok_staging/p_cleaned_1_s1'],
        cloudinaryCleanedAt: nowIso,
      },
    ];

    const stats = computeFreePlanQuotaStats(mockPosts);
    expect(stats.metricoolUsedThisMonth).toBe(1);
    expect(stats.metricoolMonthlyLimit).toBe(20);
    expect(stats.stagedCloudinarySlidesCount).toBe(2);
    expect(stats.cleanedCloudinaryPostsCount).toBe(1);

    const igChannel = stats.channels.find((c) => c.service === 'instagram');
    expect(igChannel?.queuedCount).toBe(1);
  });

  it('automatically sweeps and destroys Cloudinary assets for expired scheduled posts while keeping future scheduled posts intact', async () => {
    const pastScheduledIso = new Date(Date.now() - 3 * 3600_000).toISOString(); // 3 hours ago
    const futureScheduledIso = new Date(Date.now() + 24 * 3600_000).toISOString(); // tomorrow

    const seedPosts: SavedPostRecord[] = [
      {
        id: 'post_expired',
        title: 'Expired Scheduled Post',
        category: 'AI',
        postStatus: 'posted',
        createdAt: pastScheduledIso,
        updatedAt: pastScheduledIso,
        creatorHandle: '@MARROK',
        slideCount: 2,
        qaPassed: true,
        deck: DEFAULT_STARTER_DECK,
        scheduledFor: pastScheduledIso,
        cloudinaryPublicIds: ['local_staging/exp_s1', 'local_staging/exp_s2'],
      },
      {
        id: 'post_future',
        title: 'Future Scheduled Post',
        category: 'AI',
        postStatus: 'posted',
        createdAt: futureScheduledIso,
        updatedAt: futureScheduledIso,
        creatorHandle: '@MARROK',
        slideCount: 3,
        qaPassed: true,
        deck: DEFAULT_STARTER_DECK,
        scheduledFor: futureScheduledIso,
        cloudinaryPublicIds: ['local_staging/fut_s1', 'local_staging/fut_s2'],
      },
    ];

    await saveStoredPosts(seedPosts);

    const sweep = await sweepExpiredCloudinaryAssets();
    expect(sweep.cleanedPostIds).toEqual(['post_expired']);
    expect(sweep.cleanedPublicIds).toEqual(['local_staging/exp_s1', 'local_staging/exp_s2']);
    expect(sweep.remainingStagedCount).toBe(2);

    const expiredRecord = sweep.updatedPosts.find((p) => p.id === 'post_expired');
    const futureRecord = sweep.updatedPosts.find((p) => p.id === 'post_future');
    expect(expiredRecord?.cloudinaryCleanedAt).toBeDefined();
    expect(futureRecord?.cloudinaryCleanedAt).toBeUndefined();
  });

  it('generates the exact 99-column Official Metricool CSV template with auto-filled TikTok Title, Alt Texts, First Comment, and LinkedIn PDF Carousel', () => {
    expect(OFFICIAL_METRICOOL_CSV_HEADERS).toHaveLength(99);
    expect(OFFICIAL_METRICOOL_CSV_HEADERS[0]).toBe('Text');
    expect(OFFICIAL_METRICOOL_CSV_HEADERS[98]).toBe('Brand name');

    const ttTitle = deriveMetricoolTikTokTitle(DEFAULT_STARTER_DECK);
    expect(ttTitle.length).toBeLessThanOrEqual(90);
    expect(ttTitle.length).toBeGreaterThan(0);

    const docTitle = deriveMetricoolDocumentTitle(DEFAULT_STARTER_DECK);
    expect(docTitle.length).toBeLessThanOrEqual(58);

    const altTexts = deriveMetricoolAltTexts(DEFAULT_STARTER_DECK);
    expect(altTexts.length).toBe(DEFAULT_STARTER_DECK.slides.length);

    const row = buildMetricoolCsvRowFromDeck({
      deck: DEFAULT_STARTER_DECK,
      scheduledDateIso: '2026-11-10T18:00:00.000Z',
      targets: ['tiktok', 'instagram', 'linkedin'],
      imageUrls: [
        'https://res.cloudinary.com/dug1cw6ux/image/upload/v1/marrok_staging/s1.jpg',
        'https://res.cloudinary.com/dug1cw6ux/image/upload/v1/marrok_staging/s2.jpg',
      ],
      templateOptions: {
        linkedInImagesAsCarousel: true,
        tiktokAutoAddMusic: true,
        brandName: 'Marrok',
      },
    });

    const csv = generateMetricoolBulkCsv([row]);
    const [headerLine, dataLine] = csv.split('\r\n');
    expect(headerLine).toContain(
      'Text,Date,Time,Draft,Facebook,Twitter/X,LinkedIn,GBP,Instagram,Pinterest,TikTok,Youtube,Threads,Bluesky,Picture Url 1,Picture Url 2'
    );
    expect(headerLine).toContain('TikTok Title,TikTok disable comments');
    expect(headerLine).toContain('LinkedIn Images as Carousel,Threads Reply Control,Threads Is Spoiler,Threads Post Type,Brand name');
    expect(dataLine).toContain('https://res.cloudinary.com/dug1cw6ux/image/upload/v1/marrok_staging/s1.jpg');
    expect(dataLine).toContain('PUBLIC_TO_EVERYONE');
    expect(dataLine).toContain('Marrok');
  });

  it('computes future weekly schedule slots matching the selected cadence', () => {
    const slots = computeWeeklyScheduleSlots(4, '2026-11-06', 'mon-wed-fri', '18:30');
    expect(slots).toHaveLength(4);
    for (const slot of slots) {
      expect(slot.timePart).toBe('18:30:00');
      const day = new Date(slot.isoDate).getDay();
      expect([1, 3, 5]).toContain(day);
    }
  });
});
