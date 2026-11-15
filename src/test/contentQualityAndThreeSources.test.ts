import { describe, expect, it } from 'vitest';
import {
  synthesizeCarousel,
  validateSourceSufficiency,
  InsufficientSourceError,
  applyHookEngineToSlide1,
} from '../lib/synthesizer.ts';
import { enrichAndPaceCarousel } from '../lib/autonomousPipeline.ts';
import {
  checkContentQuality,
  runQAChecks,
  runPreExportChecklist,
} from '../lib/qaChecks.ts';
import { runPlatformRiskChecks } from '../lib/riskChecks.ts';
import { getPublishBlockers } from '../components/studio/PublishChecklist.tsx';
import { computeSlideLayoutAwareness } from '../lib/canvas/layoutAwareness.ts';
import { DEFAULT_PALETTES } from '../types.ts';
import type { CarouselData } from '../types.ts';

function runFullEngineOnSource(prompt: string, sourceLabel: string): CarouselData {
  const raw = synthesizeCarousel({
    prompt,
    postFormat: 'carousel',
  });
  raw.sourceMeta = {
    ...(raw.sourceMeta || {}),
    status: 'verified_live',
    userReviewed: true,
    verifiedNumbers: true,
    creator: sourceLabel,
    channel: sourceLabel,
  };
  const enriched = enrichAndPaceCarousel(raw, prompt);
  enriched.slides[0] = applyHookEngineToSlide1(enriched.slides[0], false, prompt);
  enriched.slides = enriched.slides.map((s) => ({ ...s, numbersVerified: true }));
  if (enriched.slides.length > 0) {
    const lastIdx = enriched.slides.length - 1;
    enriched.slides[lastIdx] = {
      ...enriched.slides[lastIdx],
      enCredit: `Source: ${sourceLabel}`,
      arCredit: `المصدر: ${sourceLabel}`,
    };
  }
  return enriched;
}

describe('Content Quality Engine, Footer Safe Ceiling & 3-Source Verification', () => {
  it('blocks empty or thin inputs before synthesis (< 20 chars or < 4 meaningful words)', () => {
    expect(validateSourceSufficiency({ prompt: '' }).isSufficient).toBe(false);
    expect(validateSourceSufficiency({ prompt: 'AI' }).isSufficient).toBe(false);
    expect(validateSourceSufficiency({ prompt: 'cloud billing' }).isSufficient).toBe(false);
    expect(
      validateSourceSufficiency({ prompt: '', imageFileName: '20760.png', hasMedia: false }).isSufficient
    ).toBe(false);
    expect(
      validateSourceSufficiency({ prompt: '', imageFileName: '20760.png', hasMedia: true }).isSufficient
    ).toBe(true);

    expect(() => synthesizeCarousel({ prompt: 'too short' })).toThrow(InsufficientSourceError);

    // Valid source URLs and concise Arabic prompts must be accepted
    expect(
      validateSourceSufficiency({
        prompt: 'https://discord.com/blog/how-discord-stores-trillions-of-messages',
      }).isSufficient
    ).toBe(true);
    expect(
      validateSourceSufficiency({
        prompt: 'كيف تقلل زمن استجابة قواعد البيانات',
      }).isSufficient
    ).toBe(true);
  });

  it('blocks export in Content Quality gate and marks P. OK status as BLOCK on clichés, filler labels, missing hub provenance, and Slide 1 body', () => {
    const pollutedDeck: CarouselData = {
      theme: 'teal',
      category: 'TECH HUMOR',
      sourceMeta: { title: 'Tech Humor' },
      caption: 'Technical breakdown of Tech Humor and production trade-offs.',
      slides: [
        {
          type: 'hub',
          satLabels: ['TECH', 'TECH HUMOR', 'TELEMETRY STAT', 'Core', 'Boundaries'],
          enTitle: 'A breakdown of technical mechanisms behind Tech Humor',
          arTitle: 'تحليل معماري لمنظومة الفكاهة التقنية المعتمد',
          enBody: 'Operational boundaries should not appear on slide 1.',
          arBody: 'This should fail bilingual consistency.',
        },
        {
          type: 'row',
          enTitle: 'Core mechanisms',
          arTitle: 'آلية النظام',
          enBody: 'Every software team knows how this works.',
          arBody: 'تحليل هندسي معمق للمنظومة.',
        },
        {
          type: 'number',
          enTitle: 'Real queue limits',
          arTitle: 'حدود الطابور الفعلية',
          enBody: 'Teams talk constantly about production trade-offs under load.',
          arBody: 'مقايضات الإنتاج والنظام.',
        },
        {
          type: 'cta',
          enTitle: 'Test action',
          arTitle: 'جرب الآن',
          enBody: 'Follow for more.',
          arBody: 'تابعنا للمزيد.',
          ctaText: 'Save this deck',
        },
      ],
    };

    const cqIssues = checkContentQuality(pollutedDeck);
    expect(cqIssues.some((r) => r.severity === 'fail')).toBe(true);
    expect(cqIssues.some((r) => r.id.startsWith('content-quality-hub-provenance-'))).toBe(true);
    expect(cqIssues.some((r) => /production\s+trade-?offs/i.test(r.message))).toBe(true);

    const qa = runQAChecks(pollutedDeck);
    const checklist = runPreExportChecklist(pollutedDeck, DEFAULT_PALETTES.teal);
    const cqGate = checklist.find((c) => c.id === 'contentQuality');
    expect(cqGate?.passed).toBe(false);

    const risk = runPlatformRiskChecks(pollutedDeck, 'Tech Humor');
    const blockers = getPublishBlockers(
      pollutedDeck,
      false,
      true,
      qa,
      risk,
      DEFAULT_PALETTES.teal
    );
    expect(blockers.contentQualityStatus).toBe('BLOCK');
    expect(blockers.isReady).toBe(false);
    expect(blockers.blockersCount).toBeGreaterThan(0);
  });

  it('reserves fixed footer ceiling across 9:16, 4:5, and 1:1 so wrapped Arabic body copy never overlaps English body or @MARROK footer', () => {
    const slide = {
      type: 'row' as const,
      diagramVariant: 'stack' as const,
      icons: [
        { icon: 'server', label: 'Ingress Proxy' },
        { icon: 'database', label: 'SQLite WAL' },
        { icon: 'zap', label: 'Worker Pool' },
      ],
      enTitle: 'Queue isolation saves tail latency.',
      arTitle: 'عزل الصفوف يحمي زمن الاستجابة.',
      enBody:
        'Moving noisy bulk jobs out of the primary checkout queue keeps p95 response steady even during traffic spikes and cold cache rebuilds.',
      arBody:
        'نقل المهام الخلفية الثقيلة إلى صف مستقل يمنع تباطؤ طلبات الدفع الأساسية، ويحافظ على استقرار الأداء واستجابة الخوادم حتى أثناء ذروة الضغط وإعادة بناء الذاكرة المؤقتة.',
    };

    for (const [preset, expectedMaxY, minBody] of [
      ['tiktok-9:16', 1428, 24],
      ['ig-4:5', 1125, 20],
      ['ig-1:1', 895, 18],
    ] as const) {
      const awareness = computeSlideLayoutAwareness(slide, {
        theme: 'teal',
        category: 'SYSTEMS',
        caption: '',
        dimensionPreset: preset,
        slides: [slide],
      });
      expect(awareness.arabicBodyBlock!.bottom, `${preset} footer ceiling`).toBeLessThanOrEqual(expectedMaxY);
      expect(awareness.arabicBodyBlock!.top, `${preset} body-ar gap`).toBeGreaterThan(awareness.bodyBlock!.bottom);
      expect(awareness.arabicBodyBlock!.fontSize, `${preset} ar min font`).toBeGreaterThanOrEqual(minBody);
      expect(awareness.bodyBlock!.fontSize, `${preset} en min font`).toBeGreaterThanOrEqual(minBody);
    }
  });

  it('produces distinct, non-template, QA-clean Slide 1 previews across 3 real sources (numbers, non-numeric, humor/opinion)', () => {
    const numericSource =
      'Discord migrated trillions of messages from Cassandra onto ScyllaDB with a Rust shard-per-core data service, cutting p99 read latency from 125ms down to 15ms and reducing cluster footprint from 177 nodes to 72 nodes.';
    const nonNumericSource =
      'SQLite runs inside the same memory process as your application instead of over TCP sockets. Removing the network serialization hop lets local queries complete before an external database even parses the packet header.';
    const humorOpinionSource =
      'Senior engineers spend three months automating a Kafka mesh and distributed Kubernetes service discovery just to serve a startup with fourteen paying users. Boring Postgres on one reliable VPS would have shipped features before lunch.';

    const numericDeck = runFullEngineOnSource(numericSource, 'Discord Engineering Blog');
    const nonNumericDeck = runFullEngineOnSource(nonNumericSource, 'SQLite Architecture Notes');
    const humorDeck = runFullEngineOnSource(humorOpinionSource, 'Founder Engineering Essay');

    const cases = [
      { kind: 'NUMERIC SOURCE', deck: numericDeck, prompt: numericSource },
      { kind: 'NON-NUMERIC SOURCE', deck: nonNumericDeck, prompt: nonNumericSource },
      { kind: 'HUMOR / OPINION SOURCE', deck: humorDeck, prompt: humorOpinionSource },
    ];

    const previews: Array<Record<string, unknown>> = [];

    for (const item of cases) {
      const slide1 = item.deck.slides[0];
      const checklist = runPreExportChecklist(item.deck, DEFAULT_PALETTES.teal);
      const cqGate = checklist.find((c) => c.id === 'contentQuality');
      const cqFails = checkContentQuality(item.deck).filter((r) => r.severity === 'fail');

      expect(cqFails, `${item.kind} contentQuality failures`).toEqual([]);
      expect(cqGate?.passed, `${item.kind} pre-export contentQuality`).toBe(true);
      expect(slide1.enBody, `${item.kind} slide 1 enBody`).toBe('');
      expect(slide1.arBody, `${item.kind} slide 1 arBody`).toBe('');
      expect(slide1.enTitle?.trim().split(/\s+/).length).toBeLessThanOrEqual(12);
      expect(slide1.arTitle?.trim().split(/\s+/).length).toBeLessThanOrEqual(12);

      // Verify source-quoted hub nodes exist somewhere or on Slide 1 with reasons
      const hubSlides = item.deck.slides.filter(
        (s) => s.type === 'hub' || (s.satLabels && s.satLabels.length > 0)
      );
      for (const h of hubSlides) {
        expect(h.satLabels?.some((l) => /tech\s*humor|telemetry\s*stat/i.test(l))).toBe(false);
        expect(h.hubNodeReasons?.length ?? 0).toBeGreaterThan(0);
      }

      previews.push({
        kind: item.kind,
        category: item.deck.category,
        slideCount: item.deck.slides.length,
        slide1Type: slide1.type,
        enTitle: slide1.enTitle,
        arTitle: slide1.arTitle,
        metricBeforeValue: slide1.metricBeforeValue,
        metricValue: slide1.metricValue,
        metricDiff: slide1.metricDiff,
        hookClaimCard: slide1.hookClaimCard,
        satLabels: slide1.satLabels,
        hubNodeReasons: slide1.hubNodeReasons,
        sourceAttribution: item.deck.slides[item.deck.slides.length - 1]?.enCredit,
      });
    }

    // Numeric Slide 1 must capture the 125ms -> 15ms win
    expect(numericDeck.slides[0].metricValue).toMatch(/15ms/i);
    expect(numericDeck.slides[0].metricBeforeValue).toMatch(/125ms/i);

    // Non-numeric & Humor Slide 1 must use hookClaimCard instead of fabricated numbers
    expect(nonNumericDeck.slides[0].hookClaimCard).toBeDefined();
    expect(humorDeck.slides[0].hookClaimCard).toBeDefined();

    console.info('=== 3-SOURCE SLIDE 1 PREVIEWS ===\n' + JSON.stringify(previews, null, 2));
  });
});
