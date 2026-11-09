import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import {
  signCloudinaryParams,
  computeFreePlanQuotaStats,
  sweepExpiredCloudinaryAssets,
  handleDispatchPublish,
  handleManagePublishedPost,
} from '../../api/controllers/publishController.ts';
import { saveStoredPosts } from '../../api/controllers/postsController.ts';
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
} from '../lib/publish/publishClient.ts';
import { CANVAS_DIMENSION_PRESETS, getArchetypeGraphicTransform } from '../lib/canvas/constants.ts';
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
    delete process.env.BUFFER_API_KEY;
    delete process.env.ZERNIO_API_KEY;
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
});

