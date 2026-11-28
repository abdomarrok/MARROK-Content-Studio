import { describe, expect, it } from 'vitest';
import {
  synthesizeCarousel,
  validateSourceSufficiency,
  InsufficientSourceError,
  applyHookEngineToSlide1,
  cleanCarouselContentQuality,
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
import { getCanvasDimensionSpec, MIN_BODY_FONT_SIZE, MIN_FOOTER_FONT_SIZE, MIN_TITLE_FONT_SIZE } from '../lib/canvas/constants.ts';
import {
  isolateEmbeddedLatinInArabic,
  sanitizeArabicSlideText,
  sanitizeMetricForArabic,
  splitArabicForBidiRender,
} from '../lib/text/arabicBiDi.ts';
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

    for (const [preset, expectedMaxY] of [
      ['tiktok-9:16', 1428],
      ['ig-9:16', 1428],
      ['ig-3:4', 1190],
      ['ig-4:5', 1125],
      ['ig-1:1', 895],
    ] as const) {
      const spec = getCanvasDimensionSpec(preset);
      expect(spec.minTitleFontSize, `${preset} minTitleFontSize`).toBeGreaterThanOrEqual(MIN_TITLE_FONT_SIZE);
      expect(spec.minBodyFontSize, `${preset} minBodyFontSize`).toBeGreaterThanOrEqual(MIN_BODY_FONT_SIZE);
      expect(spec.footerFontSize, `${preset} footerFontSize`).toBeGreaterThanOrEqual(MIN_FOOTER_FONT_SIZE);
      expect(spec.footerBadgeSize, `${preset} footerBadgeSize`).toBeGreaterThanOrEqual(MIN_FOOTER_FONT_SIZE);

      const awareness = computeSlideLayoutAwareness(slide, {
        theme: 'teal',
        category: 'SYSTEMS',
        caption: '',
        dimensionPreset: preset,
        slides: [slide],
      });
      expect(awareness.arabicBodyBlock!.bottom, `${preset} footer ceiling`).toBeLessThanOrEqual(expectedMaxY);
      expect(awareness.arabicBodyBlock!.top, `${preset} body-ar gap`).toBeGreaterThan(awareness.bodyBlock!.bottom);
      expect(awareness.titleBlock!.fontSize, `${preset} en title min font`).toBeGreaterThanOrEqual(24);
      expect(awareness.arabicTitleBlock!.fontSize, `${preset} ar title min font`).toBeGreaterThanOrEqual(24);
      expect(awareness.bodyBlock!.fontSize, `${preset} en body min font`).toBeGreaterThanOrEqual(24);
      expect(awareness.arabicBodyBlock!.fontSize, `${preset} ar body min font`).toBeGreaterThanOrEqual(24);
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

  it('keeps English technical terms & number+unit pairs unrewritten and BiDi-isolated in Arabic copy', () => {
    expect(sanitizeArabicSlideText('يعمل محلياً بدلاً من المقابس التقليدية.')).toBe(
      'يعمل محلياً بدلاً من المقابس التقليدية.'
    );
    expect(sanitizeArabicSlideText('يعمل محلياً عبر Sockets مع Latency أقل من 15ms وذاكرة 510 GB.')).toBe(
      'يعمل محلياً عبر Sockets مع Latency أقل من 15ms وذاكرة 510 GB\u200F.'
    );
    expect(sanitizeMetricForArabic('510 GB.')).toBe('510 GB');
    expect(sanitizeMetricForArabic('15ms')).toBe('15ms');

    const isolated = isolateEmbeddedLatinInArabic(
      'يعتمد Raft على Postgres و Kafka لخفض p99 حتى 15ms في كل Cluster.'
    );
    expect(isolated).toContain('\u2066Raft\u2069');
    expect(isolated).toContain('\u2066Postgres\u2069');
    expect(isolated).toContain('\u2066Kafka\u2069');
    expect(isolated).toContain('\u2066p99\u2069');
    expect(isolated).toContain('\u206615ms\u2069');
    expect(isolated).toContain('\u2066Cluster\u2069');
    expect(isolated.endsWith('\u2069.') || isolated.includes('\u2069\u200F.')).toBe(true);

    const segs = splitArabicForBidiRender('متوسط Latency هو 510 GB.');
    expect(segs).toEqual([
      { text: 'متوسط ', isLtr: false },
      { text: 'Latency', isLtr: true },
      { text: ' هو ', isLtr: false },
      { text: '510 GB', isLtr: true },
      { text: '.', isLtr: false },
    ]);
  });

  it('auto-cleans Slide 3 "Verification" filler diagram node, filler metricLabel, Hub echoes, and template clichés in one pass', () => {
    const brokenDeck: CarouselData = {
      theme: 'teal',
      category: 'AI SYSTEMS',
      sourceMeta: { title: 'Grokbot Automated Verification' },
      caption: 'Technical breakdown of Grokbot production trade-offs.',
      slides: [
        {
          type: 'metric',
          enTitle: 'Can human review survive AI scale?',
          arTitle: 'هل يمكن للمراجعة البشرية الصمود؟',
          enBody: 'Should not exist on slide 1.',
          arBody: 'محتوى إضافي غير مطلوب.',
          metricValue: '70%',
          metricLabel: 'VERIFICATION',
        },
        {
          type: 'hub',
          satLabels: ['TECH', 'AI SYSTEMS', 'VERIFICATION', 'BOUNDARIES', 'OBSERVABILITY'],
          enTitle: 'Automated agent pipelines.',
          arTitle: 'خطوط الوكلاء الآلية.',
          enBody: 'Grokbot ships 11,000 PRs monthly with a 0.5% revert rate across workers.',
          arBody: 'يشحن النظام 11,000 طلب دمج شهرياً بمعدل تراجع 0.5%.',
        },
        {
          type: 'row',
          enTitle: 'Automated verification gates.',
          arTitle: 'بوابات التحقق الآلي.',
          enBody: 'Teams dedicate 70% of agent tokens to verification before merging code.',
          arBody: 'تخصص الفرق 70% من الرموز لعمليات التحقق قبل دمج الشيفرة.',
          diagramNodes: [
            { label: 'Verification', sublabel: 'Static pass', status: 'ACTIVE', icon: 'shieldAlert' },
            { label: 'Agent Tokens', sublabel: '70% allocation', status: 'VERIFIED', icon: 'cpu' },
            { label: 'Merge Queue', sublabel: '0.5% revert', status: 'SECURED', icon: 'gitMerge' },
          ],
        },
        {
          type: 'cta',
          enTitle: 'Review your pipeline today.',
          arTitle: 'راجع مسار النشر اليوم.',
          enBody: 'Keep p99 stable.',
          arBody: 'حافظ على استقرار الأداء.',
          ctaText: 'Join the discussion',
        },
      ],
    };

    const beforePreExport = runPreExportChecklist(brokenDeck, DEFAULT_PALETTES.teal);
    const beforeCq = beforePreExport.find((c) => c.id === 'contentQuality');
    expect(beforeCq?.passed).toBe(false);

    const cleaned = cleanCarouselContentQuality(
      brokenDeck,
      'Grokbot ships 11,000 PRs monthly with 0.5% revert rate and 70% tokens on automated verification'
    );

    // Slide 3 diagram nodes must NOT contain "Verification" or any filler label
    const slide3Labels = (cleaned.slides[2].diagramNodes || []).map((n) => n.label.toUpperCase());
    expect(slide3Labels.length).toBe(3);
    expect(slide3Labels).not.toContain('VERIFICATION');

    // Slide 1 metricLabel must NOT be "VERIFICATION"
    expect((cleaned.slides[0].metricLabel || '').toUpperCase()).not.toBe('VERIFICATION');

    // Content Quality Gate and full checkContentQuality must pass cleanly with zero fails
    const afterFails = checkContentQuality(cleaned).filter((r) => r.severity === 'fail');
    expect(afterFails).toEqual([]);

    const afterPreExport = runPreExportChecklist(cleaned, DEFAULT_PALETTES.teal);
    const afterCq = afterPreExport.find((c) => c.id === 'contentQuality');
    expect(afterCq?.passed).toBe(true);
  });
});
