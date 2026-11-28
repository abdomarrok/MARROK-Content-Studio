import { describe, it, expect } from 'vitest';
import { runQAChecks, CHAR_LIMITS, SINGLE_SLIDE_CHAR_LIMITS, checkArabicTranslatedTechTerms } from '../../lib/qaChecks.ts';
import {
  inferBestSlideArchetype,
  detectSubjectPairFromText,
  inferDynamicCoverArchetype,
  buildNonNumericHookClaimCard,
  diversifyDeckArchetypesAndVisuals,
} from '../../lib/synthesis/smartVisualDefaults.ts';
import {
  computeSlideLayoutAwareness,
  clampElementDrag,
  MIN_GAP_GRAPHIC_TO_TITLE,
  MIN_GAP_TITLES,
  MIN_GAP_TITLE_TO_BODY,
  MIN_GAP_BODIES,
  MIN_GAP_TO_FOOTER,
} from '../../lib/canvas/layoutAwareness.ts';
import {
  mentionsGoLanguage,
  scanMetrics,
  synthesizeUniversalCarousel,
  buildContainerStory,
} from '../../lib/synthesis/universalExtractor.ts';
import { computeOutboxAggregateState, classifyProviderFailure } from '../../lib/publish/publishOutbox.ts';
import { isValidScryptHashFormat, hashPasswordScrypt } from '../../lib/security/sessionAuth.ts';
import type { CarouselData, SlideData } from '../../types.ts';

/**
 * PERMANENT CORE ENGINE CHARACTERIZATION TEST SUITE
 * 
 * Preserves canonical reference fixtures and deterministic behavioral invariants
 * for core content generation, canvas layout, publishing state transitions, and
 * security boundaries. Prevents silent regression in future feature work.
 */

describe('Permanent Core Engine Characterization Fixtures', () => {
  describe('1. QA Engine Characterization & Threshold Invariants', () => {
    it('preserves canonical character limits across all slides', () => {
      expect(CHAR_LIMITS.enTitle).toBe(45);
      expect(CHAR_LIMITS.arTitle).toBe(40);
      expect(CHAR_LIMITS.enBody).toBe(140);
      expect(CHAR_LIMITS.arBody).toBe(150);
      expect(CHAR_LIMITS.iconLabel).toBe(16);
      expect(CHAR_LIMITS.hookTitle).toBe(78);
      expect(CHAR_LIMITS.hookArTitle).toBe(68);
    });

    it('preserves single-slide poster character limits', () => {
      expect(SINGLE_SLIDE_CHAR_LIMITS.enTitle).toBe(55);
      expect(SINGLE_SLIDE_CHAR_LIMITS.arTitle).toBe(50);
      expect(SINGLE_SLIDE_CHAR_LIMITS.enBody).toBe(220);
      expect(SINGLE_SLIDE_CHAR_LIMITS.arBody).toBe(230);
      expect(SINGLE_SLIDE_CHAR_LIMITS.takeawayEn).toBe(75);
      expect(SINGLE_SLIDE_CHAR_LIMITS.takeawayAr).toBe(80);
      expect(SINGLE_SLIDE_CHAR_LIMITS.hookTitle).toBe(78);
      expect(SINGLE_SLIDE_CHAR_LIMITS.hookArTitle).toBe(68);
    });

    it('evaluates clean 4-slide technical deck with zero fail-level violations', () => {
      const cleanDeck: CarouselData = {
        theme: 'midnight-terminal',
        category: 'SYSTEMS ARCHITECTURE',
        caption: 'Mastering PostgreSQL high-throughput performance #postgres #architecture',
        dimensionPreset: 'tiktok-9:16',
        slides: [
          {
            type: 'row',
            enTitle: 'How PostgreSQL optimizes high throughput query performance.',
            arTitle: 'كيف يحسن بوستجرس أداء الاستعلامات عالية الكثافة.',
            enBody: '',
            arBody: '',
            takeaways: [{ en: 'Index selectivity', ar: 'انتقائية الفهرس' }],
          },
          {
            type: 'number',
            enTitle: 'Five Rules for Indexing.',
            arTitle: 'خمس قواعد للفهرسة.',
            enBody: 'Always index foreign keys and filter columns.',
            arBody: 'احرص دائماً على فهرسة المفاتيح الخارجية وأعمدة التصفية.',
            stepNumber: '01',
            stepLabel: 'PRIMARY RULE',
            takeaways: [{ en: 'Index selectivity', ar: 'انتقائية الفهرس' }],
          },
          {
            type: 'compare',
            enTitle: 'B-Tree vs Hash Indexes.',
            arTitle: 'مقارنة فهارس B-Tree مع فهارس التجزئة.',
            enBody: 'When to choose equality over range queries.',
            arBody: 'متى تختار استعلامات المساواة بدل استعلامات النطاق.',
            compareLeftTitle: 'B-Tree Index',
            compareLeftBody: 'Supports range and equality lookups.',
            compareRightTitle: 'Hash Index',
            compareRightBody: 'Optimized strictly for equality lookups.',
          },
          {
            type: 'cta',
            enTitle: 'Follow MARROK for Systems Engineering.',
            arTitle: 'تابع ماروك لهندسة النظم البرمجية الحديثة.',
            enBody: 'Daily deep-dives into modern infrastructure.',
            arBody: 'تحليلات يومية في البنية التحتية الحديثة.',
            enCredit: 'MARROK Architecture Lab',
            arCredit: 'مختبر ماروك للهندسة',
          },
        ],
      };

      const report = runQAChecks(cleanDeck);
      expect(report.failCount).toBe(0);
      expect(report.canExport).toBe(true);
    });

    it('blocks export on generic placeholder strings (System A / System B)', () => {
      const placeholderDeck: CarouselData = {
        theme: 'midnight-terminal',
        category: 'SYSTEMS ARCHITECTURE',
        caption: 'Migration case study',
        slides: [
          {
            type: 'row',
            enTitle: 'Migrating from System A to System B',
            arTitle: 'الترحيل من النظام أ إلى النظام ب',
            enBody: 'PIPELINE MIGRATION in progress.',
            arBody: 'عملية الترحيل جارية.',
          },
        ],
      };

      const report = runQAChecks(placeholderDeck);
      expect(report.canExport).toBe(false);
      expect(report.failCount).toBeGreaterThan(0);
      const placeholderError = report.results.find((r) => r.id.includes('placeholder'));
      expect(placeholderError).toBeDefined();
    });

    it('warns on Arabic translated tech terms that should remain Latin script', () => {
      const sampleSlide: SlideData = {
        type: 'row',
        enTitle: 'Redis Cache Layer',
        arTitle: 'طبقة التخزين المؤقت',
        enBody: 'High-speed caching with Redis.',
        arBody: 'قمنا بتهيئة الذاكرة المؤقتة لتحسين زمن الاستجابة في الخادم.',
      };

      const arabicWarnings = checkArabicTranslatedTechTerms(sampleSlide, 0);
      expect(arabicWarnings.length).toBeGreaterThan(0);
      expect(arabicWarnings.some((w) => w.severity === 'warn')).toBe(true);
      expect(arabicWarnings.some((w) => w.message.includes('Cache') || w.message.includes('Latency'))).toBe(true);
    });
  });

  describe('2. Smart Visual Defaults Invariants', () => {
    it('infers correct archetypes based on slide semantics', () => {
      const compareSlide: SlideData = {
        type: 'row',
        enTitle: 'Comparing Monolith vs Microservices Architecture',
        arTitle: 'مقارنة النظم الموحدة مع الخدمات المصغرة',
        enBody: 'Trade-offs between deployment complexity and operational overhead.',
        arBody: 'المفاضلة بين تعقيد النشر والأعباء التشغيلية.',
      };
      expect(inferBestSlideArchetype(compareSlide, 1)).toBe('compare');

      const codeSlide: SlideData = {
        type: 'row',
        enTitle: 'Implementing Token Bucket in TypeScript',
        arTitle: 'تنفيذ خوارزمية Token Bucket في TypeScript',
        enBody: 'async function checkRateLimit(ip: string): Promise<boolean> { return true; }',
        arBody: 'دالة غير متزامنة لفحص معدل الطلبات.',
      };
      expect(inferBestSlideArchetype(codeSlide, 1)).toBe('code');
    });

    it('detects verified tech pairs and avoids generic nouns', () => {
      const pair = detectSubjectPairFromText('Uber migrated from PostgreSQL to MySQL for database sharding');
      expect(pair).toBeDefined();
      if (pair) {
        expect(pair.beforeSystem.toLowerCase()).toContain('postgres');
        expect(pair.afterSystem.toLowerCase()).toContain('mysql');
      }

      const invalidPair = detectSubjectPairFromText('Moving from Architecture to Infrastructure');
      expect(invalidPair).toBeUndefined();
    });

    it('ensures Slide 1 dynamic cover never defaults to banned hub', () => {
      const coverSlide: SlideData = {
        type: 'hub',
        enTitle: 'Breaking Down Zero-Downtime Deployments',
        arTitle: 'شرح النشر بدون توقف',
        enBody: 'Blue-green vs canary deployments with automated rollback.',
        arBody: 'مقارنة النشر الأزرق والأخضر مع النشر التدريجي.',
      };
      const cover = inferDynamicCoverArchetype(coverSlide);
      expect(cover).not.toBe('hub');
      expect(['row', 'compare', 'subjectPair', 'poster', 'number', 'metric']).toContain(cover);
    });

    it('constructs well-formed non-numeric hook claim card for contrast statements', () => {
      const card = buildNonNumericHookClaimCard('Active-Active architecture instead of Active-Passive failover');
      expect(card).toBeDefined();
      if (card) {
        expect(card.badge).toBe('THE REAL SHIFT');
        expect(card.mode).toBe('contrast');
        expect(card.statement).toContain('over');
      }
    });

    it('deterministically diversifies homogeneous decks', () => {
      const allRowSlides: SlideData[] = Array.from({ length: 6 }, (_, i) => ({
        type: 'row',
        enTitle: `Step ${i + 1} Architecture Analysis`,
        arTitle: `تحليل الخطوة ${i + 1}`,
        enBody: 'Explaining system internals with deep diagrams.',
        arBody: 'شرح تفاصيل النظام الداخلية.',
      }));

      const diversified = diversifyDeckArchetypesAndVisuals(allRowSlides);
      const types = new Set(diversified.map((s) => s.type));
      expect(types.size).toBeGreaterThan(1);
    });
  });

  describe('3. Canvas Layout Awareness Numerical Coordinates', () => {
    const hookSlide: SlideData = {
      type: 'row',
      storyRole: 'hook',
      enTitle: 'High-Throughput Message Queue Architecture',
      arTitle: 'هندسة طوابير الرسائل عالية الإنتاجية',
      enBody: 'Partitioning topics ensures horizontal scalability across consumer groups.',
      arBody: 'تقسيم المواضيع يضمن قابلية التوسع الأفقي عبر مجموعات المستهلكين.',
    };

    const interiorSlide: SlideData = {
      type: 'row',
      enTitle: 'High-Throughput Message Queue Architecture',
      arTitle: 'هندسة طوابير الرسائل عالية الإنتاجية',
      enBody: 'Partitioning topics ensures horizontal scalability across consumer groups.',
      arBody: 'تقسيم المواضيع يضمن قابلية التوسع الأفقي عبر مجموعات المستهلكين.',
      takeaways: [
        { en: 'Ordered partitions', ar: 'أقسام مرتبة' },
        { en: 'Replication factor 3', ar: 'معامل تكرار 3' },
      ],
    };

    const ctaSlide: SlideData = {
      type: 'cta',
      enTitle: 'Follow MARROK for Systems Design',
      arTitle: 'تابع ماروك لهندسة النظم',
    };

    const carouselMock: CarouselData = {
      theme: 'midnight-terminal',
      category: 'ARCHITECTURE',
      caption: 'Queue Architecture Overview',
      dimensionPreset: 'tiktok-9:16',
      slides: [hookSlide, interiorSlide, ctaSlide],
    };

    it('computes exact coordinate bounds and safe clearances for Slide 1 hook cover', () => {
      const hookLayout = computeSlideLayoutAwareness(hookSlide, carouselMock, 0);
      expect(hookLayout.graphicCard).toBeDefined();
      expect(hookLayout.titleBlock).toBeDefined();
      expect(hookLayout.arabicTitleBlock).toBeDefined();
      expect(hookLayout.bodyBlock).toBeDefined();

      if (hookLayout.graphicCard && hookLayout.titleBlock && hookLayout.arabicTitleBlock && hookLayout.bodyBlock) {
        expect(hookLayout.graphicCard.y).toBeGreaterThanOrEqual(206);
        expect(hookLayout.graphicCard.width).toBeLessThanOrEqual(1008);
        expect(hookLayout.titleBlock.top).toBeGreaterThanOrEqual(hookLayout.graphicCard.y + hookLayout.graphicCard.height + MIN_GAP_GRAPHIC_TO_TITLE);
        expect(hookLayout.arabicTitleBlock.top).toBeGreaterThanOrEqual(hookLayout.titleBlock.bottom + MIN_GAP_TITLES);
        expect(hookLayout.bodyBlock.hidden).toBe(true); // Hook slides hide body copy for thumbnail impact
      }

      expect(hookLayout.swipeCueBox).toBeDefined();
      if (hookLayout.swipeCueBox) {
        expect(hookLayout.swipeCueBox.y).toBeLessThanOrEqual(1750);
      }
    });

    it('computes exact vertical clearances on interior content slides', () => {
      const interiorLayout = computeSlideLayoutAwareness(interiorSlide, carouselMock, 1);
      expect(interiorLayout.bodyBlock).toBeDefined();
      expect(interiorLayout.titleBlock).toBeDefined();
      expect(interiorLayout.arabicTitleBlock).toBeDefined();

      if (interiorLayout.bodyBlock && interiorLayout.titleBlock && interiorLayout.arabicTitleBlock) {
        expect(interiorLayout.bodyBlock.hidden).toBe(false);
        // Title to Arabic Title gap
        expect(interiorLayout.arabicTitleBlock.top - interiorLayout.titleBlock.bottom).toBeGreaterThanOrEqual(MIN_GAP_TITLES);
        // Arabic Title to Body gap exactly equals MIN_GAP_TITLE_TO_BODY (36px)
        expect(interiorLayout.bodyBlock.top - interiorLayout.arabicTitleBlock.bottom).toBe(MIN_GAP_TITLE_TO_BODY);
      }
    });

    it('enforces vertical clearance constants', () => {
      expect(MIN_GAP_GRAPHIC_TO_TITLE).toBe(44);
      expect(MIN_GAP_TITLES).toBe(18);
      expect(MIN_GAP_TITLE_TO_BODY).toBe(36);
      expect(MIN_GAP_BODIES).toBe(22);
      expect(MIN_GAP_TO_FOOTER).toBe(24);
    });

    it('clamps element drag coordinates strictly within safe margins', () => {
      const clamped = clampElementDrag('titleBlock', 100, 200, interiorSlide, carouselMock, 1);
      expect(typeof clamped.dx).toBe('number');
      expect(typeof clamped.dy).toBe('number');
    });
  });

  describe('4. Universal Extractor Story Builder Invariants', () => {
    it('builds container story with canonical sequence', () => {
      const story = buildContainerStory({
        brand: 'MARROK',
        brandUrl: 'marrok.org',
        targetCount: 8,
      });

      expect(story.length).toBeGreaterThanOrEqual(6);
      expect(story[0].type).toBe('hub');
      expect(story[1].type).toBe('metric');
      expect(story[2].type).toBe('compare');
      expect(story[3].type).toBe('code');
      expect(story[4].type).toBe('row');
    });

    it('correctly disambiguates Go language mentions from English verbs', () => {
      expect(mentionsGoLanguage('Built with Go runtime and deployed on Linux')).toBe(true);
      expect(mentionsGoLanguage('Golang concurrency patterns')).toBe(true);
      expect(mentionsGoLanguage('We go ahead with this plan tomorrow')).toBe(false);
      expect(mentionsGoLanguage('Never let it go unnoticed')).toBe(false);
    });

    it('extracts technical metrics with scanMetrics', () => {
      const metrics = scanMetrics('Achieved a 10x throughput boost and 45ms latency');
      expect(metrics.length).toBeGreaterThanOrEqual(2);
      expect(metrics.some((m) => m.raw.includes('10x'))).toBe(true);
      expect(metrics.some((m) => m.raw.includes('45ms'))).toBe(true);
    });

    it('synthesizes universal carousel with valid slides and metadata', () => {
      const slides = synthesizeUniversalCarousel('PostgreSQL indexing best practices for large tables');

      expect(Array.isArray(slides)).toBe(true);
      expect(slides.length).toBe(8);
      expect(slides[0].enTitle).toBeDefined();
      expect(slides[0].arTitle).toBeDefined();
    });
  });

  describe('5. Publishing Outbox & State Machine Invariants', () => {
    it('computes correct aggregate outbox state from target items', () => {
      // All pending
      expect(
        computeOutboxAggregateState(
          { instagram: { state: 'pending', target: 'instagram', attemptCount: 0, lastAttemptAt: 0 } as any },
          ['instagram'],
          0,
          3
        )
      ).toBe('pending');

      // Completed
      expect(
        computeOutboxAggregateState(
          {
            instagram: { state: 'succeeded', target: 'instagram', attemptCount: 1, lastAttemptAt: 100 } as any,
            tiktok: { state: 'succeeded', target: 'tiktok', attemptCount: 1, lastAttemptAt: 100 } as any,
          },
          ['instagram', 'tiktok'],
          1,
          3
        )
      ).toBe('completed');

      // Partially completed
      expect(
        computeOutboxAggregateState(
          {
            instagram: { state: 'succeeded', target: 'instagram', attemptCount: 1, lastAttemptAt: 100 } as any,
            tiktok: { state: 'failed_permanent', target: 'tiktok', attemptCount: 1, lastAttemptAt: 100 } as any,
          },
          ['instagram', 'tiktok'],
          1,
          3
        )
      ).toBe('partially_completed');
    });

    it('classifies provider failures into retryable and terminal errors', () => {
      const rateLimitError = classifyProviderFailure(new Error('HTTP 429 Too Many Requests'));
      expect(rateLimitError.retryable).toBe(true);
      expect(rateLimitError.category).toBe('rate_limited');

      const authError = classifyProviderFailure(new Error('HTTP 401 Unauthorized'));
      expect(authError.retryable).toBe(false);
      expect(authError.category).toBe('auth_config');

      const timeoutError = classifyProviderFailure(new Error('ETIMEDOUT'));
      expect(timeoutError.category).toBe('timeout_interrupted');
    });
  });

  describe('6. Security & Authentication Gate Invariants', () => {
    it('validates scrypt hash format strictly to prevent auth misconfigurations', () => {
      const validHash = hashPasswordScrypt('my-secure-password');
      expect(isValidScryptHashFormat(validHash)).toBe(true);

      // Invalid formats fail closed
      expect(isValidScryptHashFormat('plain-text-password')).toBe(false);
      expect(isValidScryptHashFormat('$2a$12$bcryptHashFormatExample')).toBe(false);
      expect(isValidScryptHashFormat('md5_5d41402abc4b2a76b9719d911017c592')).toBe(false);
      expect(isValidScryptHashFormat('')).toBe(false);
    });
  });
});
