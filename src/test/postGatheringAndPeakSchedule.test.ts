import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import {
  classifyEngineeringDomain,
  CURATED_ENGINEERING_TOPICS,
  extractQuantitativeMetrics,
  handleExtractUrlContent,
  handleGetTopicRadar,
  recommendPostFormat,
  stripHtmlToCleanText,
} from '../../api/controllers/mediaController.ts';
import {
  computePeakProgramScheduleSlots,
  DAILY_PEAK_TIME_SLOTS,
  isLocalSlotInFuture,
  resolveNextFutureSlotForTime,
} from '../lib/publish/publishClient.ts';
import {
  generateGatheredCandidatesInBackground,
  isTopicAlreadyInVault,
  synthesizeGatheredTopicsForReview,
} from '../lib/gather/gatherClient.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';
import type { SavedPostRecord } from '../types.ts';

describe('Automated Post Gathering, Review Queue & Peak-Hour (10 · 12 · 18) Program Engine', () => {
  const tmpFile = path.join(os.tmpdir(), `marrok-gather-test-${Date.now()}.json`);

  beforeEach(() => {
    process.env.POSTS_STORAGE_FILE = tmpFile;
  });

  afterEach(async () => {
    delete process.env.POSTS_STORAGE_FILE;
    try {
      await fs.unlink(tmpFile);
    } catch {
      // ignore
    }
  });

  it('classifies engineering domains, extracts quantitative metrics, and recommends post format accurately', () => {
    expect(
      classifyEngineeringDomain('Zero-day CVE-2026-1024 vulnerability in mTLS sandbox')
    ).toBe('REVERSE ENGINEERING');
    expect(
      classifyEngineeringDomain('DeepSeek MLA KV-cache compression for LLM inference on H100 GPUs')
    ).toBe('AI AGENTS & MODELS');
    expect(
      classifyEngineeringDomain('Linux kernel eBPF XDP ring buffer and io_uring zero-copy')
    ).toBe('LINUX KERNEL');
    expect(
      classifyEngineeringDomain('Kubernetes Envoy service mesh and Firecracker microVM isolates')
    ).toBe('KUBERNETES & CLOUD');

    const metrics = extractQuantitativeMetrics(
      'Reduced CPU by 70%, dropped p99 latency from 125ms to 15ms at 1.4M req/s'
    );
    expect(metrics).toEqual(['70%', '125ms', '15ms', '1.4M']);

    expect(
      recommendPostFormat(
        'How We Re-Architected Our Storage Engine Under the Hood',
        'Deep dive into multi-zone Raft consensus...',
        metrics
      )
    ).toBe('carousel');

    expect(
      recommendPostFormat(
        'Kernel 6.12 Benchmark Release',
        'Short benchmark summary with 4.2x throughput gain and 35% lower memory.',
        ['4.2x', '35%']
      )
    ).toBe('single');
  });

  it('strips HTML script/style clutter into clean technical reader text', () => {
    const dirtyHtml = `
      <html>
        <head><style>.ads { display:none }</style><script>alert(1)</script></head>
        <body>
          <nav>Home | Pricing | Login</nav>
          <article>
            <h1>How Pingora Replaces NGINX at Scale</h1>
            <p>By sharing connection pools across worker threads in Rust, CPU usage dropped by 70% across production edge POPs.</p>
          </article>
        </body>
      </html>
    `;
    const clean = stripHtmlToCleanText(dirtyHtml);
    expect(clean).toContain('How Pingora Replaces NGINX at Scale');
    expect(clean).toContain('CPU usage dropped by 70%');
    expect(clean).not.toContain('alert(1)');
  });

  it('never offers past schedule slots and automatically rolls passed today slots to tomorrow', () => {
    expect(DAILY_PEAK_TIME_SLOTS).toEqual(['10:00', '12:00', '18:00']);

    // Simulate current local time at 14:30 on 2026-11-09 (so 10:00 and 12:00 Today have already passed!)
    const afternoonNow = new Date(2026, 10, 9, 14, 30, 0, 0);

    expect(isLocalSlotInFuture('2026-11-09', '10:00', afternoonNow)).toBe(false);
    expect(isLocalSlotInFuture('2026-11-09', '12:00', afternoonNow)).toBe(false);
    expect(isLocalSlotInFuture('2026-11-09', '18:00', afternoonNow)).toBe(true);

    // Clicking 10:00 on 2026-11-09 at 14:30 must automatically roll to Tomorrow (2026-11-10 at 10:00)
    const rolledMorning = resolveNextFutureSlotForTime('2026-11-09', '10:00', afternoonNow);
    expect(rolledMorning.datePart).toBe('2026-11-10');
    expect(rolledMorning.timeShort).toBe('10:00');
    expect(rolledMorning.rolledToTomorrow).toBe(true);

    // Clicking 18:00 on 2026-11-09 at 14:30 stays on Today (2026-11-09 at 18:00) since 18:00 is still in the future
    const futureEvening = resolveNextFutureSlotForTime('2026-11-09', '18:00', afternoonNow);
    expect(futureEvening.datePart).toBe('2026-11-09');
    expect(futureEvening.timeShort).toBe('18:00');
    expect(futureEvening.rolledToTomorrow).toBe(false);

    // computePeakProgramScheduleSlots starting Today (2026-11-09) at 14:30 must skip 10:00 and 12:00 Today
    const todaySlots = computePeakProgramScheduleSlots(
      3,
      '2026-11-09',
      '3x-daily',
      new Set(),
      afternoonNow
    );
    expect(todaySlots[0]).toMatchObject({ datePart: '2026-11-09', timePart: '18:00:00' });
    expect(todaySlots[1]).toMatchObject({ datePart: '2026-11-10', timePart: '10:00:00' });
    expect(todaySlots[2]).toMatchObject({ datePart: '2026-11-10', timePart: '12:00:00' });
  });

  it('detects topics already saved in the Vault and generates background candidate outlines without mixing user posts', async () => {
    const sampleTopic = CURATED_ENGINEERING_TOPICS[0];
    const vaultPost: SavedPostRecord = {
      id: 'existing_1',
      title: sampleTopic.title,
      category: sampleTopic.domainCategory,
      postStatus: 'validated',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      creatorHandle: '@MARROK',
      slideCount: 8,
      qaPassed: true,
      deck: {
        ...DEFAULT_STARTER_DECK,
        brandUrl: sampleTopic.url,
      },
    };

    expect(isTopicAlreadyInVault(sampleTopic, [vaultPost])?.id).toBe('existing_1');
    expect(isTopicAlreadyInVault(CURATED_ENGINEERING_TOPICS[1], [vaultPost])).toBeNull();

    // Background gatherer must exclude `sampleTopic` (already in Vault) and generate slide outlines only for new topics
    const candidates = await generateGatheredCandidatesInBackground(
      CURATED_ENGINEERING_TOPICS.slice(0, 3),
      [vaultPost]
    );
    expect(candidates).toHaveLength(2);
    expect(candidates.some((c) => c.id === sampleTopic.id)).toBe(false);
    expect(candidates[0].draftTitle.length).toBeGreaterThan(5);
    expect(candidates[0].deck.slides.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].themeId).not.toBe(candidates[1].themeId);
  });

  it('synthesizes gathered topics into the Pending Human Review Queue (userReviewed: false) with non-repeating color cadence', async () => {
    const batchTopics = CURATED_ENGINEERING_TOPICS.slice(0, 3);
    const result = await synthesizeGatheredTopicsForReview(batchTopics, [], {
      useFastLocalEngine: true,
    });

    expect(result.failedTopics).toHaveLength(0);
    expect(result.createdPosts).toHaveLength(3);

    // Every gathered post must require human review first (`userReviewed === false`) and have no auto-schedule
    for (const post of result.createdPosts) {
      expect(post.deck.sourceMeta?.userReviewed).toBe(false);
      expect(post.scheduledFor).toBeUndefined();
      expect(post.postStatus).toBe('validated');
    }

    // Consecutive batch posts must rotate theme colors (never repeating the same color back-to-back)
    expect(result.createdPosts[0].deck.theme).not.toBe(result.createdPosts[1].deck.theme);
    expect(result.createdPosts[1].deck.theme).not.toBe(result.createdPosts[2].deck.theme);
  });

  it('serves /api/gather/radar and blocks private/loopback URLs on /api/gather/extract-url', async () => {
    let statusCode = 200;
    let jsonPayload: any = null;
    const mockRes: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: any) {
        jsonPayload = body;
        return this;
      },
    };

    await handleGetTopicRadar(
      { query: { source: 'blogs', category: 'all' } } as any,
      mockRes
    );
    expect(statusCode).toBe(200);
    expect(jsonPayload.ok).toBe(true);
    expect(Array.isArray(jsonPayload.topics)).toBe(true);
    expect(jsonPayload.topics.length).toBeGreaterThan(0);

    // Verify SSRF protection blocks localhost/private URLs on extract-url
    await handleExtractUrlContent(
      { body: { url: 'https://127.0.0.1/internal-admin' } } as any,
      mockRes
    );
    expect(statusCode).toBe(400);
    expect(jsonPayload.error).toContain('Invalid or blocked URL');
  });
});
