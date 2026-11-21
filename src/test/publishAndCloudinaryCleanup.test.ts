import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import {
  signCloudinaryParams,
  computeDispatchFingerprint,
  computeFreePlanQuotaStats,
  sweepExpiredCloudinaryAssets,
  recoverAndRetryOutboxDispatches,
  handleGetPublishStatus,
  handleGetPublishOutbox,
  handleRecoverPublishOutbox,
  handleDispatchPublish,
  handleManagePublishedPost,
} from '../../api/controllers/publishController.ts';
import {
  checkpointLocalOutboxRecord,
  createNewOutboxRecord,
} from '../lib/publish/publishOutbox.ts';
import { loadStoredPosts, saveStoredPosts } from '../../api/controllers/postsController.ts';
import {
  runScheduledPromotion,
  config as scheduledPromoteConfig,
} from '../../netlify/functions/scheduled-promote.ts';
import {
  buildLocalScheduledIso,
  buildMetricoolCsvRowFromDeck,
  computeWeeklyScheduleSlots,
  deriveMetricoolAltTexts,
  deriveMetricoolDocumentTitle,
  deriveMetricoolTikTokTitle,
  stripLeadingDuplicateTikTokTitle,
  derivePostLifecycleStage,
  formatLocalDateTimeParts,
  generateMetricoolBulkCsv,
  getLocalTodayDateStr,
  OFFICIAL_METRICOOL_CSV_HEADERS,
  parseApiResponseJson,
  uploadDeckSlidesForPublishing,
} from '../lib/publish/publishClient.ts';
import { CANVAS_DIMENSION_PRESETS, getArchetypeGraphicTransform } from '../lib/canvas/constants.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';
import type { SavedPostRecord } from '../types.ts';

describe('Publishing, Weekly Queue & Cloudinary Auto-Cleanup Engine', () => {
  const tmpFile = path.join(os.tmpdir(), `marrok-publish-test-${Date.now()}.json`);

  beforeEach(async () => {
    process.env.POSTS_STORAGE_FILE = tmpFile;
    process.env.CLOUDINARY_CLOUD_NAME = 'test_cloud_name';
    process.env.CLOUDINARY_API_KEY = 'test_cloudinary_api_key';
    process.env.CLOUDINARY_API_SECRET = 'test_secret_for_signature';
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.POSTS_STORAGE_FILE;
    delete process.env.BUFFER_API_KEY;
    delete process.env.ZERNIO_API_KEY;
    try {
      await fs.unlink(tmpFile);
    } catch {
      // ignore
    }
    try {
      await fs.unlink(`${tmpFile}.outbox.json`);
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

  it('automatically sweeps and destroys Cloudinary assets for expired scheduled posts while keeping future and recent shareNow posts intact', async () => {
    const pastScheduledIso = new Date(Date.now() - 3 * 3600_000).toISOString(); // 3 hours ago
    const futureScheduledIso = new Date(Date.now() + 24 * 3600_000).toISOString(); // tomorrow
    const recentShareNowIso = new Date(Date.now() - 5 * 60_000).toISOString(); // 5 minutes ago

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
      {
        id: 'post_recent_share_now',
        title: 'Recent ShareNow Post',
        category: 'AI',
        postStatus: 'posted',
        createdAt: recentShareNowIso,
        updatedAt: recentShareNowIso,
        postedAt: recentShareNowIso,
        creatorHandle: '@MARROK',
        slideCount: 1,
        qaPassed: true,
        deck: DEFAULT_STARTER_DECK,
        cloudinaryPublicIds: ['local_staging/now_s1'],
      },
    ];

    await saveStoredPosts(seedPosts);

    const sweep = await sweepExpiredCloudinaryAssets();
    expect(sweep.cleanedPostIds).toEqual(['post_expired']);
    expect(sweep.cleanedPublicIds).toEqual(['local_staging/exp_s1', 'local_staging/exp_s2']);
    expect(sweep.remainingStagedCount).toBe(3);

    const expiredRecord = sweep.updatedPosts.find((p) => p.id === 'post_expired');
    const futureRecord = sweep.updatedPosts.find((p) => p.id === 'post_future');
    const recentShareNowRecord = sweep.updatedPosts.find((p) => p.id === 'post_recent_share_now');
    expect(expiredRecord?.cloudinaryCleanedAt).toBeDefined();
    expect(expiredRecord?.cloudinaryPublicIds).toEqual([]);
    expect(futureRecord?.cloudinaryCleanedAt).toBeUndefined();
    expect(recentShareNowRecord?.cloudinaryCleanedAt).toBeUndefined();

    // A second sweep should be a complete no-op and never re-clean post_expired
    const secondSweep = await sweepExpiredCloudinaryAssets();
    expect(secondSweep.cleanedPostIds).toEqual([]);
    expect(secondSweep.cleanedPublicIds).toEqual([]);
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
        'https://res.cloudinary.com/test_cloud_name/image/upload/v1/marrok_staging/s1.jpg',
        'https://res.cloudinary.com/test_cloud_name/image/upload/v1/marrok_staging/s2.jpg',
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
    expect(dataLine).toContain('https://res.cloudinary.com/test_cloud_name/image/upload/v1/marrok_staging/s1.jpg');
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

  it('preserves same-day local calendar dates without shifting evening times to the next UTC day', () => {
    const todayLocal = getLocalTodayDateStr(new Date(2026, 10, 7, 23, 15, 0));
    expect(todayLocal).toBe('2026-11-07');

    const iso = buildLocalScheduledIso('2026-11-07', '22:45');
    const parts = formatLocalDateTimeParts(iso);
    expect(parts.datePart).toBe('2026-11-07');
    expect(parts.timePart).toBe('22:45:00');
    expect(parts.timeShort).toBe('22:45');

    // Verify daily cadence starts on the exact requested startDateStr without bumping to tomorrow
    const dailySlots = computeWeeklyScheduleSlots(2, '2026-11-07', 'daily', '18:00');
    expect(dailySlots[0]?.datePart).toBe('2026-11-07');
    expect(dailySlots[0]?.timePart).toBe('18:00:00');
    expect(dailySlots[1]?.datePart).toBe('2026-11-08');
  });

  it('classifies post lifecycle stages and supports reschedule, unschedule, and cancelAndDelete via handleManagePublishedPost', async () => {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const futureIso = new Date(nowMs + 12 * 3600_000).toISOString();

    const baseDraft: SavedPostRecord = {
      id: 'post_manage_1',
      title: 'Managed Carousel Post',
      category: 'SYSTEMS',
      postStatus: 'validated',
      createdAt: nowIso,
      updatedAt: nowIso,
      creatorHandle: '@MARROK',
      slideCount: 6,
      qaPassed: true,
      deck: DEFAULT_STARTER_DECK,
      cloudinaryPublicIds: ['local_staging/mg_s1'],
    };

    expect(derivePostLifecycleStage(baseDraft, nowMs)).toBe('draft');
    expect(derivePostLifecycleStage({ ...baseDraft, qaPassed: false }, nowMs)).toBe('attention');
    expect(
      derivePostLifecycleStage({ ...baseDraft, postStatus: 'posted', scheduledFor: futureIso }, nowMs)
    ).toBe('scheduled');
    expect(
      derivePostLifecycleStage({ ...baseDraft, postStatus: 'posted', postedAt: nowIso }, nowMs)
    ).toBe('posted');

    await saveStoredPosts([baseDraft]);

    const invokeManage = async (body: Record<string, unknown>) => {
      let statusCode = 200;
      let jsonBody: any = null;
      const req = { body } as any;
      const res = {
        status(code: number) {
          statusCode = code;
          return this;
        },
        json(payload: unknown) {
          jsonBody = payload;
          return this;
        },
      } as any;
      await handleManagePublishedPost(req, res);
      return { statusCode, jsonBody };
    };

    // 1. Reschedule draft into a future slot (stays 'validated' + 'scheduled' stage, NOT 'posted')
    const rescheduleRes = await invokeManage({
      postId: 'post_manage_1',
      action: 'reschedule',
      scheduledFor: futureIso,
      publishTargets: ['instagram', 'linkedin'],
    });
    expect(rescheduleRes.statusCode).toBe(200);
    expect(rescheduleRes.jsonBody.post.postStatus).toBe('validated');
    expect(rescheduleRes.jsonBody.post.postedAt).toBeUndefined();
    expect(rescheduleRes.jsonBody.post.scheduledFor).toBe(futureIso);
    expect(rescheduleRes.jsonBody.post.publishTargets).toEqual(['instagram', 'linkedin']);
    expect(derivePostLifecycleStage(rescheduleRes.jsonBody.post, nowMs)).toBe('scheduled');

    // 2. Unschedule (Cancel Schedule) back to draft
    const unscheduleRes = await invokeManage({
      postId: 'post_manage_1',
      action: 'unschedule',
    });
    expect(unscheduleRes.statusCode).toBe(200);
    expect(unscheduleRes.jsonBody.post.postStatus).toBe('validated');
    expect(unscheduleRes.jsonBody.post.scheduledFor).toBeUndefined();
    expect(derivePostLifecycleStage(unscheduleRes.jsonBody.post, nowMs)).toBe('draft');

    // 3. Cancel & Delete from Vault
    const deleteRes = await invokeManage({
      postId: 'post_manage_1',
      action: 'cancelAndDelete',
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.jsonBody.deletedId).toBe('post_manage_1');
    expect(deleteRes.jsonBody.posts).toHaveLength(0);
  });

  it('sends metadata.instagram.type = "post" for multi-image carousels on Buffer and dispatches TikTok photo carousels via Zernio API v1', async () => {
    process.env.BUFFER_API_KEY = 'buf_test_key_123';
    process.env.ZERNIO_API_KEY = 'zernio_test_key_456';

    const capturedBufferRequests: any[] = [];
    const capturedZernioPostRequests: any[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === 'https://api.buffer.com') {
        const parsed = JSON.parse(String(init?.body || '{}'));
        if (String(parsed.query || '').includes('GetMarrokChannels')) {
          return new Response(
            JSON.stringify({
              data: {
                account: {
                  organizations: [
                    {
                      id: 'org_1',
                      channels: [
                        { id: 'buf_ig_1', name: 'marrok_org', service: 'instagram' },
                        { id: 'buf_li_1', name: 'Marrok', service: 'linkedin' },
                      ],
                    },
                  ],
                },
              },
            }),
            { status: 200 }
          );
        }
        capturedBufferRequests.push(parsed);
        return new Response(
          JSON.stringify({
            data: {
              createPost: {
                post: { id: `buf_post_${capturedBufferRequests.length}` },
              },
            },
          }),
          { status: 200 }
        );
      }

      if (url === 'https://zernio.com/api/v1/accounts') {
        return new Response(
          JSON.stringify({
            accounts: [
              {
                _id: 'zernio_tt_acc_1',
                platform: 'tiktok',
                username: 'Marrok',
                enabled: true,
              },
            ],
          }),
          { status: 200 }
        );
      }

      if (url === 'https://zernio.com/api/v1/posts') {
        const parsed = JSON.parse(String(init?.body || '{}'));
        capturedZernioPostRequests.push(parsed);
        return new Response(
          JSON.stringify({
            post: { _id: 'zernio_post_tt_99' },
          }),
          { status: 200 }
        );
      }

      return new Response('{}', { status: 200 });
    });

    let statusCode = 200;
    let jsonBody: any = null;
    const req = {
      body: {
        postId: 'post_hybrid_1',
        deck: DEFAULT_STARTER_DECK,
        title: 'MCP vs UTCP',
        caption: 'Bilingual EN + AR test caption #MARROK',
        mode: 'shareNow',
        targets: ['instagram', 'linkedin', 'tiktok'],
        imageUrls: [
          'https://cdn.example.com/ig_4x5_slide1.jpg',
          'https://cdn.example.com/ig_4x5_slide2.jpg',
        ],
        tiktokImageUrls: [
          'https://cdn.example.com/tt_9x16_slide1.jpg',
          'https://cdn.example.com/tt_9x16_slide2.jpg',
        ],
        cloudinaryPublicIds: ['s1', 's2'],
        tiktokSettings: {
          privacyLevel: 'PUBLIC_TO_EVERYONE',
          photoCoverIndex: 0,
          autoAddMusic: true,
          allowComment: true,
          title: 'MCP vs UTCP Architecture',
        },
      },
    } as any;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        jsonBody = payload;
        return this;
      },
    } as any;

    await handleDispatchPublish(req, res);

    expect(statusCode).toBe(200);
    expect(jsonBody.ok).toBe(true);
    expect(jsonBody.bufferFailedCount).toBe(0);

    // Verify Instagram Buffer GraphQL payload uses type: 'post' (NEVER 'carousel') with 4:5 imageUrls
    const igReq = capturedBufferRequests.find(
      (r) => r.variables?.input?.metadata?.instagram
    );
    expect(igReq).toBeDefined();
    expect(igReq.variables.input.metadata.instagram.type).toBe('post');
    expect(igReq.variables.input.assets).toHaveLength(2);
    expect(igReq.variables.input.assets[0].image.url).toBe(
      'https://cdn.example.com/ig_4x5_slide1.jpg'
    );

    // Verify TikTok Zernio REST API v1 payload uses 9:16 tiktokImageUrls, camelCase autoAddMusic, and musicSoundInfo
    expect(capturedZernioPostRequests).toHaveLength(1);
    const ttReq = capturedZernioPostRequests[0];
    expect(ttReq.publishNow).toBe(true);
    expect(ttReq.platforms[0].platform).toBe('tiktok');
    expect(ttReq.platforms[0].accountId).toBe('zernio_tt_acc_1');
    expect(ttReq.mediaItems).toEqual([
      { type: 'image', url: 'https://cdn.example.com/tt_9x16_slide1.jpg' },
      { type: 'image', url: 'https://cdn.example.com/tt_9x16_slide2.jpg' },
    ]);
    expect(ttReq.tiktokSettings.mediaType).toBe('photo');
    expect(ttReq.tiktokSettings.autoAddMusic).toBe(true);
    expect(ttReq.tiktokSettings.musicSoundInfo?.musicSoundId).toBeDefined();
    expect(ttReq.tiktokSettings.media_type).toBe('photo');
    expect(ttReq.tiktokSettings.content_preview_confirmed).toBe(true);
    expect(ttReq.tiktokSettings.express_consent_given).toBe(true);

    // Verify channelResults report Buffer ✓ for IG/LI and Zernio ✓ for TikTok
    const igResult = jsonBody.channelResults.find((c: any) => c.service === 'instagram');
    const ttResult = jsonBody.channelResults.find((c: any) => c.service === 'tiktok');
    expect(igResult).toMatchObject({ provider: 'buffer', ok: true });
    expect(ttResult).toMatchObject({ provider: 'zernio', ok: true, zernioPostId: 'zernio_post_tt_99' });
  });

  it('strips redundant leading headline from TikTok caption when it duplicates the title', () => {
    const fullCaption =
      '⚡ مستقبل Java في عصر الذكاء الاصطناعي: كيف تتطور اللغة؟\n\nتنتقل Java من كونها لغة تعتمد على المعالج المركزي (CPU) إلى منصة تدعم الحوسبة غير المتجانسة.\n\n#Java #AI';
    const ttTitle = 'The future of Java in AI. | مستقبل Java في عصر الذكاء الاصطناعي';

    const cleaned = stripLeadingDuplicateTikTokTitle(fullCaption, ttTitle);
    expect(cleaned.startsWith('تنتقل Java من كونها لغة تعتمد')).toBe(true);
    expect(cleaned.includes('⚡ مستقبل Java')).toBe(false);

    // If title does not duplicate the first line, preserve the caption intact
    const uniqueCaption = 'Architecture overview of Java FFM.\n\nKey takeaways:';
    expect(stripLeadingDuplicateTikTokTitle(uniqueCaption, 'Something Else Entirely')).toBe(uniqueCaption);
  });

  it('configures TikTok 9:16 safe-zone header at y=206 and insets margins to clear TikTok Photo Mode buttons', () => {
    const ttSpec = CANVAS_DIMENSION_PRESETS['tiktok-9:16'];
    expect(ttSpec.headerY).toBe(206);
    expect(ttSpec.headerMarginLeft).toBe(136);
    expect(ttSpec.headerMarginRight).toBe(920);

    const transform = getArchetypeGraphicTransform(ttSpec, 'row');
    expect(transform.cardY).toBe(266);
    expect(transform.translateY).toBe(26);
  });

  it('auto-promotes due scheduled posts (scheduledFor <= now) to postStatus="posted" during sweep while retaining staged Cloudinary assets until +1h', async () => {
    const tenMinutesAgoIso = new Date(Date.now() - 10 * 60_000).toISOString();
    const seedPosts: SavedPostRecord[] = [
      {
        id: 'post_due_just_now',
        title: 'Due Scheduled Post',
        category: 'AI',
        postStatus: 'validated',
        createdAt: tenMinutesAgoIso,
        updatedAt: tenMinutesAgoIso,
        creatorHandle: '@MARROK',
        slideCount: 2,
        qaPassed: true,
        deck: DEFAULT_STARTER_DECK,
        scheduledFor: tenMinutesAgoIso,
        cloudinaryPublicIds: ['local_staging/due_s1', 'local_staging/due_s2'],
      },
    ];

    await saveStoredPosts(seedPosts);
    const sweep = await sweepExpiredCloudinaryAssets();
    const promoted = sweep.updatedPosts.find((p) => p.id === 'post_due_just_now');
    expect(promoted?.postStatus).toBe('posted');
    expect(promoted?.postedAt).toBe(tenMinutesAgoIso);
    expect(promoted?.scheduledFor).toBeUndefined();
    // Staged Cloudinary images must still be retained because only 10 minutes (< 1 hour) have elapsed since scheduledFor
    expect(sweep.cleanedPostIds).toEqual([]);
    expect(promoted?.cloudinaryPublicIds).toEqual(['local_staging/due_s1', 'local_staging/due_s2']);
  });

  it('never deletes Cloudinary assets when publishFailed=true, when humanApproved=false, or on un-dispatched slot reservations, and persists publishFailed when Buffer/Zernio dispatch fails', async () => {
    const threeHoursAgoIso = new Date(Date.now() - 3 * 3600_000).toISOString();
    const seedPosts: SavedPostRecord[] = [
      {
        id: 'post_failed_publish',
        title: 'Failed Scheduled Publish',
        category: 'AI',
        postStatus: 'validated',
        publishFailed: true,
        createdAt: threeHoursAgoIso,
        updatedAt: threeHoursAgoIso,
        creatorHandle: '@MARROK',
        slideCount: 2,
        qaPassed: true,
        deck: DEFAULT_STARTER_DECK,
        scheduledFor: threeHoursAgoIso,
        cloudinaryPublicIds: ['local_staging/fail_s1', 'local_staging/fail_s2'],
      },
      {
        id: 'post_unapproved_auto',
        title: 'Unapproved Automated Draft',
        category: 'AI',
        postStatus: 'validated',
        humanApproved: false,
        createdAt: threeHoursAgoIso,
        updatedAt: threeHoursAgoIso,
        creatorHandle: '@MARROK',
        slideCount: 2,
        qaPassed: true,
        deck: {
          ...DEFAULT_STARTER_DECK,
          sourceMeta: {
            ...DEFAULT_STARTER_DECK.sourceMeta,
            humanApproved: false,
            userReviewed: false,
          },
        },
        scheduledFor: threeHoursAgoIso,
        cloudinaryPublicIds: ['local_staging/unapproved_s1'],
      },
      {
        id: 'post_slot_only_reservation',
        title: 'Telegram Slot Reservation Without Staged Media',
        category: 'AI',
        postStatus: 'validated',
        createdAt: threeHoursAgoIso,
        updatedAt: threeHoursAgoIso,
        creatorHandle: '@MARROK',
        slideCount: 2,
        qaPassed: true,
        deck: DEFAULT_STARTER_DECK,
        scheduledFor: threeHoursAgoIso,
        cloudinaryPublicIds: [],
      },
    ];

    await saveStoredPosts(seedPosts);
    const sweep = await sweepExpiredCloudinaryAssets();
    expect(sweep.cleanedPostIds).toEqual([]);
    const failedPost = sweep.updatedPosts.find((p) => p.id === 'post_failed_publish');
    const unapprovedPost = sweep.updatedPosts.find((p) => p.id === 'post_unapproved_auto');
    const slotOnlyPost = sweep.updatedPosts.find((p) => p.id === 'post_slot_only_reservation');
    expect(failedPost?.postStatus).toBe('validated');
    expect(failedPost?.cloudinaryPublicIds).toEqual(['local_staging/fail_s1', 'local_staging/fail_s2']);
    expect(unapprovedPost?.postStatus).toBe('validated');
    expect(unapprovedPost?.cloudinaryPublicIds).toEqual(['local_staging/unapproved_s1']);
    expect(slotOnlyPost?.postStatus).toBe('validated');
    expect(slotOnlyPost?.scheduledFor).toBe(threeHoursAgoIso);

    // Verify handleDispatchPublish marks publishFailed=true and keeps postStatus='validated' when Buffer API fails
    process.env.BUFFER_API_KEY = 'buf_failing_key';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ message: 'Buffer upstream outage' }] }), {
        status: 502,
      })
    );

    let dispatchBody: any = null;
    const res = {
      status() {
        return this;
      },
      json(payload: unknown) {
        dispatchBody = payload;
        return this;
      },
    } as any;

    await handleDispatchPublish(
      {
        body: {
          postId: 'post_dispatch_err_1',
          deck: DEFAULT_STARTER_DECK,
          title: 'Failing Dispatch Test',
          mode: 'shareNow',
          targets: ['instagram'],
          imageUrls: ['https://cdn.example.com/s1.jpg'],
          cloudinaryPublicIds: ['local_staging/disp_err_s1'],
        },
      } as any,
      res
    );

    expect(dispatchBody.bufferFailedCount).toBe(1);
    expect(dispatchBody.post.publishFailed).toBe(true);
    expect(dispatchBody.post.postStatus).toBe('validated');
    expect(dispatchBody.post.postedAt).toBeUndefined();
  });

  it('keeps GET /api/publish/status strictly read-pure and delegates overdue promotion & +1h cleanup to Netlify Scheduled Function scheduled-promote', async () => {
    expect(scheduledPromoteConfig.schedule).toBe('*/15 * * * *');

    const tenMinutesAgoIso = new Date(Date.now() - 10 * 60_000).toISOString();
    const seedPosts: SavedPostRecord[] = [
      {
        id: 'post_cron_due_1',
        title: 'Overdue Staged Approved Post',
        category: 'AI',
        postStatus: 'validated',
        humanApproved: true,
        createdAt: tenMinutesAgoIso,
        updatedAt: tenMinutesAgoIso,
        creatorHandle: '@MARROK',
        slideCount: 2,
        qaPassed: true,
        deck: DEFAULT_STARTER_DECK,
        scheduledFor: tenMinutesAgoIso,
        cloudinaryPublicIds: ['local_staging/cron_s1'],
      },
      {
        id: 'post_cron_unapproved',
        title: 'Overdue Unapproved Post',
        category: 'AI',
        postStatus: 'validated',
        humanApproved: false,
        createdAt: tenMinutesAgoIso,
        updatedAt: tenMinutesAgoIso,
        creatorHandle: '@MARROK',
        slideCount: 2,
        qaPassed: true,
        deck: {
          ...DEFAULT_STARTER_DECK,
          sourceMeta: { ...DEFAULT_STARTER_DECK.sourceMeta, humanApproved: false },
        },
        scheduledFor: tenMinutesAgoIso,
        cloudinaryPublicIds: ['local_staging/cron_unapproved_s1'],
      },
    ];

    await saveStoredPosts(seedPosts);

    // 1. GET /api/publish/status must be 100% read-pure (zero DB promotion mutations)
    let statusBody: any = null;
    await handleGetPublishStatus(
      { headers: {} } as any,
      {
        status() {
          return this;
        },
        json(payload: unknown) {
          statusBody = payload;
          return this;
        },
      } as any
    );
    expect(statusBody).toBeDefined();
    expect(statusBody.autoCleanedPostIds).toEqual([]);

    const afterGet = await loadStoredPosts();
    expect(afterGet.posts.find((p) => p.id === 'post_cron_due_1')?.postStatus).toBe('validated');

    // 2. Non-production Netlify Deploy Preview context must skip promotion cleanly
    const previewRun = await runScheduledPromotion({ CONTEXT: 'deploy-preview' });
    expect(previewRun.ok).toBe(true);
    expect(previewRun.skipped).toBe(true);
    expect(previewRun.promotedCount).toBe(0);

    const afterPreview = await loadStoredPosts();
    expect(afterPreview.posts.find((p) => p.id === 'post_cron_due_1')?.postStatus).toBe('validated');

    // 3. Production scheduled execution promotes eligible overdue post while leaving unapproved post untouched
    const prodRun = await runScheduledPromotion({ CONTEXT: 'production' });
    expect(prodRun.ok).toBe(true);
    expect(prodRun.skipped).toBeUndefined();
    expect(prodRun.promotedPostIds).toEqual(['post_cron_due_1']);

    const afterProd = await loadStoredPosts();
    expect(afterProd.posts.find((p) => p.id === 'post_cron_due_1')?.postStatus).toBe('posted');
    expect(afterProd.posts.find((p) => p.id === 'post_cron_unapproved')?.postStatus).toBe('validated');
  });

  it('prevents duplicate Buffer/Zernio posts on repeated dispatch requests via idempotent replay fingerprint', async () => {
    const dueIso = new Date(Date.now() + 3600_000).toISOString();
    const reviewedDeck = {
      ...DEFAULT_STARTER_DECK,
      id: 'post_idempotent_1',
      sourceMeta: {
        ...DEFAULT_STARTER_DECK.sourceMeta,
        userReviewed: true,
        humanApproved: true,
        verifiedNumbers: true,
      },
    };

    const requestBody = {
      postId: 'post_idempotent_1',
      deck: reviewedDeck,
      title: 'Idempotent Dispatch Test',
      caption: 'Testing idempotent replay protection.',
      mode: 'customScheduled',
      dueAt: dueIso,
      targets: ['instagram', 'tiktok'],
      imageUrls: ['https://res.cloudinary.com/demo/image/upload/slide1.jpg'],
      tiktokImageUrls: ['https://res.cloudinary.com/demo/image/upload/slide1_9x16.jpg'],
      cloudinaryPublicIds: ['marrok_staging/slide1'],
    };

    let firstResponse: any = null;
    await handleDispatchPublish(
      { body: requestBody } as any,
      {
        status() {
          return this;
        },
        json(payload: unknown) {
          firstResponse = payload;
          return this;
        },
      } as any
    );

    expect(firstResponse?.ok).toBe(true);
    expect(firstResponse?.idempotentReplay).toBe(false);
    expect(typeof firstResponse?.dispatchFingerprint).toBe('string');
    expect(firstResponse?.post?.lastDispatchFingerprint).toBe(firstResponse?.dispatchFingerprint);

    // Second identical dispatch must short-circuit with idempotentReplay: true
    let secondResponse: any = null;
    await handleDispatchPublish(
      { body: requestBody } as any,
      {
        status() {
          return this;
        },
        json(payload: unknown) {
          secondResponse = payload;
          return this;
        },
      } as any
    );

    expect(secondResponse?.ok).toBe(true);
    expect(secondResponse?.idempotentReplay).toBe(true);
    expect(secondResponse?.dispatchFingerprint).toBe(firstResponse?.dispatchFingerprint);
  });

  it('produces distinct dispatch fingerprints when timezone or tiktokSettings change', () => {
    const base = {
      postId: 'post_fp_1',
      mode: 'customScheduled',
      dueAt: '2026-12-01T18:00:00.000Z',
      timezone: 'Africa/Algiers',
      targets: ['instagram', 'tiktok'],
      text: 'Hello world',
      imageUrls: ['https://cdn.example.com/1.jpg'],
      tiktokImageUrls: ['https://cdn.example.com/1_tt.jpg'],
      tiktokSettings: {
        privacyLevel: 'PUBLIC_TO_EVERYONE',
        autoAddMusic: true,
        musicSoundInfo: { musicSoundId: '7000018757057955842' },
      },
    };

    const fp1 = computeDispatchFingerprint(base);
    const fpReorderedKeys = computeDispatchFingerprint({
      ...base,
      targets: ['tiktok', 'instagram'],
      tiktokSettings: {
        musicSoundInfo: { musicSoundId: '7000018757057955842' },
        autoAddMusic: true,
        privacyLevel: 'PUBLIC_TO_EVERYONE',
      },
    });
    const fpDiffTimezone = computeDispatchFingerprint({
      ...base,
      timezone: 'UTC',
    });
    const fpDiffMusic = computeDispatchFingerprint({
      ...base,
      tiktokSettings: {
        ...base.tiktokSettings,
        musicSoundInfo: { musicSoundId: '6999990790927845377' },
      },
    });

    expect(fp1).toBe(fpReorderedKeys);
    expect(fp1).not.toBe(fpDiffTimezone);
    expect(fp1).not.toBe(fpDiffMusic);
  });

  it('safely parses JSON and detects HTML error / warmup pages without throwing unhandled SyntaxError', async () => {
    // 1. Normal JSON success
    const successRes = new Response(JSON.stringify({ ok: true, count: 5 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const parsed = await parseApiResponseJson<{ ok: boolean; count: number }>(successRes, 'Test Endpoint');
    expect(parsed).toEqual({ ok: true, count: 5 });

    // 2. HTTP 500 error with JSON body
    const errRes = new Response(JSON.stringify({ error: 'Database connection failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
    await expect(parseApiResponseJson(errRes, 'DB Query')).rejects.toThrow('Database connection failed');

    // 3. HTML warmup page intercepted by Nginx (status 200, text/html)
    const warmupHtml = '<!doctype html><html lang="en"><head><title>App Starting</title></head><body>Warming up</body></html>';
    const warmupRes = new Response(warmupHtml, {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
    await expect(parseApiResponseJson(warmupRes, 'Media upload for slide 1')).rejects.toThrow(
      /Cloudinary media staging is not configured or server proxy returned an HTML page/i
    );

    // 4. General HTML response on another endpoint
    const generalHtmlRes = new Response('<html><body>502 Bad Gateway</body></html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    });
    await expect(parseApiResponseJson(generalHtmlRes, 'Fetch publish status')).rejects.toThrow(
      /Fetch publish status received an HTML response from the server proxy \(HTTP 502\)/i
    );
  });

  it('rejects uploadDeckSlidesForPublishing with actionable Cloudinary error when proxy returns HTML warmup page', async () => {
    const warmupHtml = '<!doctype html><html lang="en"><head><title>Warmup</title></head><body>Loading...</body></html>';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(warmupHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      )
    );

    const testDeck = {
      ...DEFAULT_STARTER_DECK,
      slides: [DEFAULT_STARTER_DECK.slides[0]],
    };

    await expect(
      uploadDeckSlidesForPublishing(testDeck, 'tiktok-9:16')
    ).rejects.toThrow(
      /Cloudinary media staging is not configured or server proxy returned an HTML page/i
    );
  });

  it('persists partial outbox success and recovers failed target without creating duplicate remote posts', async () => {
    process.env.BUFFER_API_KEY = 'buf_partial_test';
    process.env.ZERNIO_API_KEY = 'zernio_partial_test';

    let bufferCreateCalls = 0;
    let zernioPostCalls = 0;
    let shouldZernioFail = true;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === 'https://api.buffer.com') {
        const parsed = JSON.parse(String(init?.body || '{}'));
        if (String(parsed.query || '').includes('GetMarrokChannels')) {
          return new Response(
            JSON.stringify({
              data: {
                account: {
                  organizations: [
                    {
                      id: 'org_1',
                      channels: [
                        { id: 'buf_ig_1', name: 'marrok_org', service: 'instagram' },
                      ],
                    },
                  ],
                },
              },
            }),
            { status: 200 }
          );
        }
        bufferCreateCalls++;
        return new Response(
          JSON.stringify({
            data: { createPost: { post: { id: `buf_ig_unique_${bufferCreateCalls}` } } },
          }),
          { status: 200 }
        );
      }

      if (url === 'https://zernio.com/api/v1/accounts') {
        return new Response(
          JSON.stringify({
            accounts: [
              { _id: 'z_tt_1', platform: 'tiktok', username: 'Marrok', enabled: true },
            ],
          }),
          { status: 200 }
        );
      }

      if (url.includes('/tiktok/commercial-music')) {
        return new Response(
          JSON.stringify({ tracks: [{ id: '7000018757057955842', name: 'Test Track' }] }),
          { status: 200 }
        );
      }

      if (url === 'https://zernio.com/api/v1/posts') {
        zernioPostCalls++;
        if (shouldZernioFail) {
          return new Response(JSON.stringify({ error: 'Zernio upstream 502' }), { status: 502 });
        }
        return new Response(
          JSON.stringify({ post: { _id: `zernio_tt_recovered_${zernioPostCalls}` } }),
          { status: 200 }
        );
      }

      return new Response('{}', { status: 200 });
    });

    const reviewedDeck = {
      ...DEFAULT_STARTER_DECK,
      id: 'post_partial_recovery_1',
      sourceMeta: {
        ...DEFAULT_STARTER_DECK.sourceMeta,
        userReviewed: true,
        humanApproved: true,
        verifiedNumbers: true,
      },
    };

    const requestBody = {
      postId: 'post_partial_recovery_1',
      deck: reviewedDeck,
      title: 'Partial Failure Recovery Test',
      caption: 'Testing partial outbox checkpointing.',
      mode: 'shareNow',
      targets: ['instagram', 'tiktok'],
      imageUrls: ['https://cdn.example.com/ig_1.jpg'],
      tiktokImageUrls: ['https://cdn.example.com/tt_1.jpg'],
      cloudinaryPublicIds: ['marrok_staging/p1'],
    };

    const invokeDispatch = async () => {
      let statusCode = 200;
      let jsonBody: any = null;
      await handleDispatchPublish(
        { body: requestBody } as any,
        {
          status(code: number) {
            statusCode = code;
            return this;
          },
          json(payload: unknown) {
            jsonBody = payload;
            return this;
          },
        } as any
      );
      return { statusCode, jsonBody };
    };

    // 1. First run: Instagram succeeds (buf_ig_unique_1), TikTok fails 502 -> partially_completed
    const first = await invokeDispatch();
    expect(first.statusCode).toBe(200);
    expect(bufferCreateCalls).toBe(1);
    expect(zernioPostCalls).toBe(2); // initial + music fallback retry inside dispatchToZernioApi
    expect(first.jsonBody.outbox.state).toBe('partially_completed');
    expect(first.jsonBody.outbox.operations.instagram).toMatchObject({
      state: 'succeeded',
      bufferPostId: 'buf_ig_unique_1',
    });
    expect(first.jsonBody.outbox.operations.tiktok).toMatchObject({
      state: 'failed_retryable',
      failureCategory: 'upstream_5xx',
      statusCode: 502,
    });
    expect(first.jsonBody.post.bufferPostIds).toEqual(['buf_ig_unique_1']);
    expect(first.jsonBody.post.publishFailed).toBe(true);

    // 2. Recover via POST /api/publish/recover (simulating scheduled or manual recovery) after Zernio recovers
    shouldZernioFail = false;
    let recoverBody: any = null;
    await handleRecoverPublishOutbox(
      { body: { postId: 'post_partial_recovery_1', ignoreBackoff: true } } as any,
      {
        status() {
          return this;
        },
        json(payload: unknown) {
          recoverBody = payload;
          return this;
        },
      } as any
    );

    expect(recoverBody.ok).toBe(true);
    expect(recoverBody.completedIds).toHaveLength(1);
    // CRITICAL INVARIANT: Buffer createPost must NOT be called a second time!
    expect(bufferCreateCalls).toBe(1);

    // Inspect outbox via GET /api/publish/outbox and Vault via loadStoredPosts
    let outboxQueryBody: any = null;
    await handleGetPublishOutbox(
      { query: { postId: 'post_partial_recovery_1' } } as any,
      {
        status() {
          return this;
        },
        json(payload: unknown) {
          outboxQueryBody = payload;
          return this;
        },
      } as any
    );
    expect(outboxQueryBody.dispatches[0].state).toBe('completed');
    expect(outboxQueryBody.dispatches[0].operations.instagram.bufferPostId).toBe('buf_ig_unique_1');
    expect(outboxQueryBody.dispatches[0].operations.tiktok.state).toBe('succeeded');
    expect(outboxQueryBody.dispatches[0].operations.tiktok.zernioPostId).toMatch(/^zernio_tt_recovered_/);

    const storedAfter = await loadStoredPosts();
    const postAfter = storedAfter.posts.find((p) => p.id === 'post_partial_recovery_1');
    expect(postAfter?.publishFailed).toBe(false);
    expect(postAfter?.bufferPostIds).toEqual(['buf_ig_unique_1']);
    expect(postAfter?.zernioPostIds).toHaveLength(1);

    // 3. Re-submitting identical payload now replays idempotently with 0 additional API calls
    const beforeReplayBuffer = bufferCreateCalls;
    const beforeReplayZernio = zernioPostCalls;
    const replay = await invokeDispatch();
    expect(replay.jsonBody.idempotentReplay).toBe(true);
    expect(bufferCreateCalls).toBe(beforeReplayBuffer);
    expect(zernioPostCalls).toBe(beforeReplayZernio);
  });

  it('rejects concurrent cross-instance leases with 409 and safely recovers expired leases', async () => {
    process.env.BUFFER_API_KEY = 'buf_lease_test';
    let bufferCalls = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input: any, init?: any) => {
      const parsed = JSON.parse(String(init?.body || '{}'));
      if (String(parsed.query || '').includes('GetMarrokChannels')) {
        return new Response(
          JSON.stringify({
            data: {
              account: {
                organizations: [
                  {
                    id: 'org_1',
                    channels: [
                      { id: 'buf_ig_1', name: 'marrok_org', service: 'instagram' },
                      { id: 'buf_li_1', name: 'Marrok', service: 'linkedin' },
                    ],
                  },
                ],
              },
            },
          }),
          { status: 200 }
        );
      }
      bufferCalls++;
      return new Response(
        JSON.stringify({
          data: { createPost: { post: { id: `buf_lease_post_${bufferCalls}` } } },
        }),
        { status: 200 }
      );
    });

    const payloadBody = {
      postId: 'post_lease_test_1',
      deck: {
        ...DEFAULT_STARTER_DECK,
        id: 'post_lease_test_1',
        sourceMeta: {
          ...DEFAULT_STARTER_DECK.sourceMeta,
          userReviewed: true,
          humanApproved: true,
          verifiedNumbers: true,
        },
      },
      title: 'Lease Recovery Test',
      caption: 'Testing cross-instance lease.',
      mode: 'shareNow' as const,
      targets: ['instagram', 'linkedin'] as ('instagram' | 'linkedin')[],
      imageUrls: ['https://cdn.example.com/1.jpg'],
    };

    const fp = computeDispatchFingerprint({
      postId: payloadBody.postId,
      title: payloadBody.title,
      mode: payloadBody.mode,
      targets: payloadBody.targets,
      text: payloadBody.caption,
      imageUrls: payloadBody.imageUrls,
      tiktokImageUrls: payloadBody.imageUrls,
    });

    // Simulate another serverless instance currently holding an active unexpired lease
    const activeLeaseRecord = createNewOutboxRecord({
      postId: payloadBody.postId,
      dispatchFingerprint: fp,
      mode: 'shareNow',
      targets: ['instagram', 'linkedin'],
      payload: {
        postId: payloadBody.postId,
        title: payloadBody.title,
        caption: payloadBody.caption,
        mode: 'shareNow',
        targets: ['instagram', 'linkedin'],
        imageUrls: payloadBody.imageUrls,
        tiktokImageUrls: payloadBody.imageUrls,
        cloudinaryPublicIds: [],
      },
      leaseOwner: 'remote_lambda_instance_99',
      leaseDurationMs: 120_000,
    });
    activeLeaseRecord.operations.instagram = {
      service: 'instagram',
      provider: 'buffer',
      state: 'succeeded',
      attemptCount: 1,
      remotePostId: 'buf_already_posted_before_crash',
      bufferPostId: 'buf_already_posted_before_crash',
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    activeLeaseRecord.operations.linkedin = {
      service: 'linkedin',
      provider: 'buffer',
      state: 'dispatching',
      attemptCount: 1,
      updatedAt: new Date().toISOString(),
    };
    await checkpointLocalOutboxRecord(activeLeaseRecord);

    // Active unexpired lease rejects new request with 409 DISPATCH_IN_FLIGHT
    let conflictStatus = 200;
    let conflictBody: any = null;
    await handleDispatchPublish(
      { body: payloadBody } as any,
      {
        status(code: number) {
          conflictStatus = code;
          return this;
        },
        json(payload: unknown) {
          conflictBody = payload;
          return this;
        },
      } as any
    );
    expect(conflictStatus).toBe(409);
    expect(conflictBody.code).toBe('DISPATCH_IN_FLIGHT');
    expect(bufferCalls).toBe(0);

    // Expire the lease to simulate remote worker crash; recovery must ONLY dispatch LinkedIn!
    await checkpointLocalOutboxRecord({
      ...activeLeaseRecord,
      leaseExpiresAt: new Date(Date.now() - 10_000).toISOString(),
    });

    const recovery = await recoverAndRetryOutboxDispatches({
      postId: payloadBody.postId,
      ignoreBackoff: true,
    });
    expect(recovery.completedIds).toHaveLength(1);
    expect(bufferCalls).toBe(1); // Only LinkedIn dispatched; Instagram was preserved!
  });

  it('classifies HTTP 400/401 as failed_permanent and stops retries after permanent or exhausted attempts', async () => {
    process.env.BUFFER_API_KEY = 'buf_perm_fail_key';
    let fetchCalls = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url === 'https://api.buffer.com') {
        const parsed = JSON.parse(String(init?.body || '{}'));
        if (String(parsed.query || '').includes('GetMarrokChannels')) {
          return new Response(
            JSON.stringify({
              data: {
                account: {
                  organizations: [
                    { id: 'org_1', channels: [{ id: 'buf_ig_1', service: 'instagram' }] },
                  ],
                },
              },
            }),
            { status: 200 }
          );
        }
        fetchCalls++;
        return new Response(JSON.stringify({ error: 'Invalid Bearer token' }), { status: 401 });
      }
      return new Response('{}', { status: 200 });
    });

    const body = {
      postId: 'post_perm_fail_1',
      deck: {
        ...DEFAULT_STARTER_DECK,
        id: 'post_perm_fail_1',
        sourceMeta: {
          ...DEFAULT_STARTER_DECK.sourceMeta,
          userReviewed: true,
          humanApproved: true,
          verifiedNumbers: true,
        },
      },
      title: 'Permanent Fail Test',
      caption: 'Invalid token test',
      mode: 'shareNow',
      targets: ['instagram'],
      imageUrls: ['https://cdn.example.com/1.jpg'],
    };

    const callDispatch = async () => {
      let statusCode = 200;
      let jsonBody: any = null;
      await handleDispatchPublish(
        { body } as any,
        {
          status(code: number) {
            statusCode = code;
            return this;
          },
          json(payload: unknown) {
            jsonBody = payload;
            return this;
          },
        } as any
      );
      return { statusCode, jsonBody };
    };

    const first = await callDispatch();
    expect(first.statusCode).toBe(200);
    expect(first.jsonBody.outbox.state).toBe('failed_permanent');
    expect(first.jsonBody.outbox.lastErrorCategory).toBe('auth_config');
    expect(fetchCalls).toBe(1);

    // Subsequent retry must refuse to hit external API again (422 DISPATCH_PERMANENT_FAILURE)
    const second = await callDispatch();
    expect(second.statusCode).toBe(422);
    expect(second.jsonBody.code).toBe('DISPATCH_PERMANENT_FAILURE');
    expect(fetchCalls).toBe(1);
  });
});




