import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PALETTES,
  type CanvasDimensionPreset,
  type CarouselData,
  type HookVariant,
  type SlideData,
} from '../types.ts';
import {
  filterRelevantHookVariants,
  switchCarouselPostFormat,
} from '../lib/studio/formatWorkspace.ts';
import { condenseCarouselToSingleSlide } from '../lib/synthesis/singleSlideCondenser.ts';
import { enforceHeadlineSpecRule } from '../lib/text/headlines.ts';
import { parseCarouselData } from '../lib/validation/carousel.ts';
import { computeSlideLayoutAwareness } from '../lib/canvas/layoutAwareness.ts';
import { getCanvasDimensionSpec } from '../lib/canvas/constants.ts';

function buildUberCarousel(): CarouselData {
  return {
    id: 'post-uber-9999',
    postFormat: 'carousel',
    theme: 'enterprise',
    category: 'DISTRIBUTED SYSTEMS',
    brand: 'MARROK',
    brandUrl: 'marrok.org',
    channel: 'UberEngineering',
    caption: 'How Uber engineered 99.99% multi-region availability.',
    slides: [
      {
        type: 'row',
        storyRole: 'hook',
        enTitle: 'Uber hits 99.99% uptime.',
        arTitle: 'تحقيق توافر 99.99% في أنظمة Uber',
        enBody: '',
        arBody: '',
        metricValue: '99.99%',
        metricLabel: 'UPTIME',
      },
      {
        type: 'row',
        enTitle: 'Active-active failover eliminates cold regions.',
        arTitle: 'التحويل النشط المتزامن يلغي المناطق الباردة.',
        enBody: 'Traffic drains from degraded zones in under 30 seconds without dropping live dispatch state.',
        arBody: 'يتم تحويل حركة المرور من المناطق المتأثرة خلال أقل من 30 ثانية دون فقدان الجلسات.',
      },
      {
        type: 'compare',
        enTitle: 'Regional isolation stops cascading outages.',
        arTitle: 'العزل الإقليمي يوقف الأعطال المتسلسلة.',
        enBody: 'Each city cluster enforces hard blast-radius fences around storage writes.',
        arBody: 'كل عنقود يفرض حدود عزل صارمة حول عمليات الكتابة.',
      },
      {
        type: 'cta',
        enTitle: 'Would your failover survive a region loss?',
        arTitle: 'هل يصمد نظامك عند سقوط منطقة كاملة؟',
        enBody: 'Test active-active drain paths before an incident forces it.',
        arBody: 'اختبر مسارات التحويل قبل وقوع العطل الفعلي.',
        enCredit: 'UberEngineering',
        arCredit: 'UberEngineering',
      },
    ],
  };
}

describe('Per-post isolated format workspaces & Single Slide Poster fixes', () => {
  it('preserves independent edits across Carousel -> Single Slide -> Meme -> Motion Reel -> Carousel without overwriting Slide 1', () => {
    const theme = DEFAULT_PALETTES.enterprise;
    const original = buildUberCarousel();

    // 1. Switch Carousel -> Single Slide (seeds once from real Carousel copy)
    const toSingle = switchCarouselPostFormat(original, 'single', {
      activeSlideIndex: 0,
      theme,
    });
    expect(toSingle.restoredFromSnapshot).toBe(false);
    expect(toSingle.nextCarousel.postFormat).toBe('single');
    expect(toSingle.nextCarousel.slides).toHaveLength(1);
    expect(toSingle.nextCarousel.formatDrafts?.carousel?.slides).toHaveLength(4);

    // 2. Edit the Single Slide heavily
    const editedSingle: CarouselData = {
      ...toSingle.nextCarousel,
      slides: [
        {
          ...toSingle.nextCarousel.slides[0],
          enTitle: 'My Custom Single Poster Title.',
          enBody: 'Custom single-slide editorial summary.',
          takeaways: [{ en: 'Only one custom takeaway', ar: 'نقطة مخصصة واحدة', icon: 'zap' }],
        },
      ],
    };

    // 3. Switch Single Slide -> Meme -> Motion Reel -> Carousel
    const toMeme = switchCarouselPostFormat(editedSingle, 'meme', {
      activeSlideIndex: 0,
      theme,
    });
    expect(toMeme.nextCarousel.postFormat).toBe('meme');
    expect(toMeme.nextCarousel.formatDrafts?.single?.slides[0].enTitle).toBe(
      'My Custom Single Poster Title.'
    );

    const toReel = switchCarouselPostFormat(toMeme.nextCarousel, 'reel', {
      activeSlideIndex: 0,
      theme,
    });
    expect(toReel.nextCarousel.postFormat).toBe('reel');

    const backToCarousel = switchCarouselPostFormat(toReel.nextCarousel, 'carousel', {
      activeSlideIndex: 0,
      theme,
    });
    expect(backToCarousel.restoredFromSnapshot).toBe(true);
    expect(backToCarousel.nextCarousel.postFormat).toBe('carousel');
    expect(backToCarousel.nextCarousel.slides).toHaveLength(4);
    // Crucial: Carousel Slide 1 must NOT be overwritten by Single Slide or Meme edits!
    expect(backToCarousel.nextCarousel.slides[0].enTitle).toBe('Uber hits 99.99% uptime.');
    expect(backToCarousel.nextCarousel.slides[0].enBody).toBe('');
    expect(backToCarousel.nextCarousel.slides[1].enTitle).toBe(
      'Active-active failover eliminates cold regions.'
    );

    // 4. Switch back to Single Slide -> restores exact Single Slide edits verbatim!
    const backToSingle = switchCarouselPostFormat(backToCarousel.nextCarousel, 'single', {
      activeSlideIndex: 0,
      theme,
    });
    expect(backToSingle.restoredFromSnapshot).toBe(true);
    expect(backToSingle.nextCarousel.slides[0].enTitle).toBe('My Custom Single Poster Title.');
    expect(backToSingle.nextCarousel.slides[0].enBody).toBe('Custom single-slide editorial summary.');
    expect(backToSingle.nextCarousel.slides[0].takeaways).toHaveLength(1);
  });

  it('keeps formatDrafts isolated per post and round-trips safely through parseCarouselData', () => {
    const theme = DEFAULT_PALETTES.enterprise;
    const postA = switchCarouselPostFormat(buildUberCarousel(), 'single', {
      activeSlideIndex: 0,
      theme,
    }).nextCarousel;

    // Validate postA persists its carousel snapshot inside formatDrafts
    const parsedA = parseCarouselData(postA);
    expect(parsedA).not.toBeNull();
    expect(parsedA!.formatDrafts?.carousel?.slides).toHaveLength(4);

    // Post B is a completely separate post loaded from Vault (no formatDrafts from Post A)
    const postB: CarouselData = {
      id: 'post-rust-proxy',
      postFormat: 'single',
      theme: 'cyber',
      category: 'NETWORKING',
      caption: 'Cloudflare Pingora cuts CPU 70%.',
      slides: [
        {
          type: 'poster',
          enTitle: 'Pingora cuts CPU by 70%.',
          arTitle: 'Pingora يخفض استهلاك المعالج 70%',
          enBody: 'Multithreaded Rust connection pooling replaces NGINX workers.',
          arBody: 'تجميع اتصالات Rust متعدد الخيوط يحل محل عمليات NGINX.',
          takeaways: [],
        },
      ],
    };

    const postBToCarousel = switchCarouselPostFormat(postB, 'carousel', {
      activeSlideIndex: 0,
      theme,
    }).nextCarousel;

    // Must never inherit Post A's Uber slides!
    expect(postBToCarousel.slides[0].enTitle).toBe('Pingora cuts CPU by 70%.');
    expect(postBToCarousel.slides.some((s) => /uber/i.test(s.enTitle || ''))).toBe(false);
  });

  it('pulls only real slide copy and real takeaways in condenseCarouselToSingleSlide with zero generic filler', () => {
    const uberCarousel = buildUberCarousel();
    const condensed = condenseCarouselToSingleSlide(uberCarousel);
    const poster = condensed.slides[0];

    expect(poster.enTitle).toBe('Uber hits 99.99% uptime.');
    // Pulls real Slide 2 body since Slide 1 hook had empty body (never generic boilerplate)
    expect(poster.enBody).toBe(
      'Traffic drains from degraded zones in under 30 seconds without dropping live dispatch state.'
    );
    expect(poster.enBody).not.toMatch(/consolidated architectural overview/i);
    expect(poster.arBody).not.toMatch(/نظرة شاملة ومكثفة على الآليات المعمارية/);
    // Does not force fake diagramVariant/diagramFooter when source slides had none
    expect(poster.diagramVariant).toBeUndefined();
    expect(poster.diagramFooter).toBeUndefined();
    // Extracts only the 2 real middle slides (never pads to 3 with generic domain filler)
    expect(poster.takeaways).toHaveLength(2);
    expect(poster.takeaways![0].en).toContain('Active-active failover');
    expect(poster.takeaways![1].en).toContain('Regional isolation');

    // A deck with NO middle slides and NO body must produce empty takeaways & empty body (zero filler)
    const minimalDeck: CarouselData = {
      postFormat: 'carousel',
      theme: 'cyber',
      category: 'SYSTEMS',
      caption: 'Minimal',
      slides: [
        {
          type: 'row',
          enTitle: 'Bare headline only.',
          arTitle: 'عنوان فقط',
          enBody: '',
          arBody: '',
        },
      ],
    };
    const minimalSingle = condenseCarouselToSingleSlide(minimalDeck);
    expect(minimalSingle.slides[0].enBody).toBe('');
    expect(minimalSingle.slides[0].arBody).toBe('');
    expect(minimalSingle.slides[0].takeaways).toEqual([]);
  });

  it('preserves decimal points and dotted tech names in enforceHeadlineSpecRule (99.99% never becomes 9999%)', () => {
    expect(enforceHeadlineSpecRule('Uber hits 99.99% uptime.', { isHook: true })).toBe(
      'Uber hits 99.99% uptime.'
    );
    expect(enforceHeadlineSpecRule('Tail latency drops to 0.4ms', { isHook: true })).toBe(
      'Tail latency drops to 0.4ms.'
    );
    expect(enforceHeadlineSpecRule('Node.js cuts CPU 3.5x.', { isHook: true })).toBe(
      'Node.js cuts CPU 3.5x.'
    );
    expect(enforceHeadlineSpecRule('Next.js v15.2 router benchmarks', { isHook: false })).toBe(
      'Next.js v15.2 router benchmarks.'
    );
  });

  it('filters out off-topic stale hookVariants (e.g. Postgres/Docker on an Uber uptime deck)', () => {
    const stalePostgresHooks: HookVariant[] = [
      {
        tag: 'Contrarian',
        framework: 'Contrarian',
        score: 86,
        enTitle: 'Why Postgres connection pooling breaks before teams notice Docker Containers.',
        arTitle: 'لماذا تفشل مجمعات اتصالات Postgres داخل حاويات Docker',
        enBody: '',
        arBody: '',
      },
      {
        tag: 'Mistake Callout',
        framework: 'Mistake Callout',
        score: 86,
        enTitle: 'The Docker Containers mistake when Postgres connection pooling fails.',
        arTitle: 'خطأ شائع في حاويات Docker مع Postgres',
        enBody: '',
        arBody: '',
      },
    ];

    const uberDeck = buildUberCarousel();
    expect(
      filterRelevantHookVariants(stalePostgresHooks, uberDeck.slides, uberDeck.category)
    ).toBeUndefined();

    const matchingUberHook: HookVariant = {
      tag: 'Specific Metric',
      framework: 'Specific Metric',
      score: 91,
      enTitle: 'How Uber sustains 99.99% uptime across active regions.',
      arTitle: 'كيف تحافظ Uber على توافر 99.99% عبر المناطق النشطة',
      enBody: '',
      arBody: '',
    };

    const filtered = filterRelevantHookVariants(
      [...stalePostgresHooks, matchingUberHook],
      uberDeck.slides,
      uberDeck.category
    );
    expect(filtered).toHaveLength(1);
    expect(filtered![0].enTitle).toContain('Uber');
  });

  it('prevents Single Slide Poster schematic/title overlap and gives takeaway rows bilingual vertical clearance across all presets', () => {
    const presets: CanvasDimensionPreset[] = ['tiktok-9:16', 'ig-4:5', 'ig-3:4', 'ig-1:1', 'ig-9:16'];
    const posterSlide: SlideData = {
      type: 'poster',
      enTitle: 'Uber hits 99.99% uptime.',
      arTitle: 'تحقيق توافر 99.99% في أنظمة Uber',
      enBody: 'Traffic drains from degraded zones in under 30 seconds without dropping live dispatch state.',
      arBody: 'يتم تحويل حركة المرور من المناطق المتأثرة خلال أقل من 30 ثانية دون فقدان الجلسات.',
      metricValue: '99.99%',
      metricLabel: 'UPTIME',
      diagramVariant: 'isolation',
      takeaways: [
        { en: 'Active-active failover eliminates cold regions', ar: 'التحويل النشط يلغي المناطق الباردة', icon: 'zap' },
        { en: 'Regional isolation stops cascading outages', ar: 'العزل الإقليمي يوقف الأعطال المتسلسلة', icon: 'shield' },
        { en: 'Automated traffic draining completes in 30s', ar: 'تصريف الحركة الآلي يكتمل خلال 30 ثانية', icon: 'layers' },
      ],
    };

    for (const preset of presets) {
      const spec = getCanvasDimensionSpec(preset);
      const layout = computeSlideLayoutAwareness(posterSlide, {
        brand: 'MARROK',
        category: 'DISTRIBUTED SYSTEMS',
        theme: 'enterprise',
        caption: 'Uber uptime poster',
        postFormat: 'single',
        dimensionPreset: preset,
        slides: [posterSlide],
      });

      expect(layout.graphicCard).toBeDefined();
      expect(layout.titleBlock).toBeDefined();
      expect(layout.takeawaysBlock).toBeDefined();

      // Title must start strictly below the schematic card's true effectiveBottom
      expect(layout.titleBlock!.top).toBeGreaterThanOrEqual(layout.graphicCard!.effectiveBottom + 20);
      // Takeaways must stay cleanly below the Arabic body and inside safeFooterCeilingY
      expect(layout.takeawaysBlock!.top).toBeGreaterThanOrEqual(layout.arabicBodyBlock!.bottom + 10);
      expect(layout.takeawaysBlock!.bottom).toBeLessThanOrEqual(spec.safeFooterCeilingY + 1);

      // Each takeaway row must be tall enough to prevent EN (top LTR) and AR (bottom RTL) overlap
      const gap = spec.height < 1920 ? 10 : 12;
      const perRowH = (layout.takeawaysBlock!.height - 2 * gap) / 3;
      if (spec.height >= 1920) {
        expect(perRowH).toBeGreaterThanOrEqual(94);
      } else {
        expect(perRowH).toBeGreaterThanOrEqual(68);
      }
    }
  });

  it('never throws InsufficientSourceError when switching a thin Single Slide or blank Meme to Carousel', () => {
    const theme = DEFAULT_PALETTES.enterprise;
    const blankMemeDeck: CarouselData = {
      postFormat: 'meme',
      theme: 'cyber',
      category: 'TECH',
      caption: '',
      slides: [
        {
          type: 'image',
          standaloneMeme: true,
          imageFrameMode: 'full',
          imageUrl: 'data:image/png;base64,abc',
          enTitle: '',
          arTitle: '',
          enBody: '',
          arBody: '',
        },
      ],
    };

    expect(() =>
      switchCarouselPostFormat(blankMemeDeck, 'carousel', {
        activeSlideIndex: 0,
        theme,
        promptInput: '',
      })
    ).not.toThrow();

    const switched = switchCarouselPostFormat(blankMemeDeck, 'carousel', {
      activeSlideIndex: 0,
      theme,
      promptInput: '',
    });
    expect(switched.nextCarousel.postFormat).toBe('carousel');
    expect(switched.nextCarousel.slides.length).toBeGreaterThanOrEqual(3);
    expect(switched.nextCarousel.slides[0].imageUrl).toBe('data:image/png;base64,abc');
    expect(switched.nextCarousel.formatDrafts?.meme?.slides[0].standaloneMeme).toBe(true);
  });
});
