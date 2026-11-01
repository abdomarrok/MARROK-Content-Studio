import type { CarouselData, SlideData, SlideTakeawayItem } from '../../types.ts';

/**
 * Seeds up to 3 high-signal bilingual takeaway bullets for single-slide infographic posters.
 */
export function seedSingleSlideTakeaways(
  slide: Partial<SlideData>,
  category: string = 'SYSTEMS'
): SlideTakeawayItem[] {
  if (slide.takeaways && slide.takeaways.length >= 2) {
    return slide.takeaways.slice(0, 3);
  }

  const catUpper = (category || '').toUpperCase();
  const slideText = `${slide.enTitle || ''} ${slide.enBody || ''} ${slide.arTitle || ''} ${slide.arBody || ''} ${catUpper}`;
  const isFinancialOrMacro =
    /\$|\b(?:valuation|billion|trillion|loss|losses|deficit|capital|financing|circular|subsid|taxpayer|retiree|s&p|pension|401k|revenue|spend|spent|cash[- ]?out|stake|economy|economic|inflation|energy\s+bill|gigawatt|nuclear|market|investor|debt|financial|wall\s+street)\b|مليار|تريليون|خسائر|تمويل|تقييم|ضرائب|متقاعد|طاقة|اقتصاد|استثمار|دعم\s+حكومي/i.test(
      slideText
    );

  if (isFinancialOrMacro) {
    return [
      {
        en: 'Massive capital commitments outpace current unit revenue.',
        ar: 'التزامات رأسمالية ضخمة تتجاوز العوائد التشغيلية الحالية.',
        icon: 'dollarSign',
      },
      {
        en: 'Circular vendor financing concentrates systemic market exposure.',
        ar: 'التمويل الدائري بين الموردين يضاعف مخاطر التركز السوقي.',
        icon: 'landmark',
      },
      {
        en: 'Grid power demand and public backstops shift risk to consumers.',
        ar: 'استهلاك الطاقة والضمانات العامة ينقلان التكلفة للمستهلكين.',
        icon: 'scales',
      },
    ];
  }

  if (catUpper.includes('SECURITY') || catUpper.includes('CYBER') || catUpper.includes('AUTH')) {
    return [
      {
        en: 'Zero-trust cryptographic verification at every boundary.',
        ar: 'التحقق التشفيري الصارم عند كل حد أمني.',
        icon: 'shield',
      },
      {
        en: 'Decoupled identity provider prevents single-point compromise.',
        ar: 'فصل مزود الهوية يمنع انهيار المنظومة بالكامل.',
        icon: 'key',
      },
      {
        en: 'Sub-millisecond token revocation with distributed Bloom filters.',
        ar: 'إلغاء التوكنات بأجزاء من الملي ثانية عبر مرشحات بلوم.',
        icon: 'zap',
      },
    ];
  }

  if (catUpper.includes('DATABASE') || catUpper.includes('STORAGE') || catUpper.includes('SQL')) {
    return [
      {
        en: 'Decoupled compute and storage eliminates replication bottlenecks.',
        ar: 'فصل المعالجة عن التخزين يلغي اختناقات النسخ.',
        icon: 'database',
      },
      {
        en: 'Read replicas scale horizontally with predictable p99 latency.',
        ar: 'توسع النسخ المتطابقة أفقياً بزمن استجابة p99 مستقر.',
        icon: 'layers',
      },
      {
        en: 'Write-ahead log streaming ensures zero data-loss durability.',
        ar: 'تدفق سجلات الكتابة المسبقة يضمن سلامة البيانات.',
        icon: 'checkCircle',
      },
    ];
  }

  if (catUpper.includes('AI') || catUpper.includes('MODEL') || catUpper.includes('LLM')) {
    return [
      {
        en: 'Sparse MoE routing activates only relevant expert parameters.',
        ar: 'توجيه الخبراء المتفرق يفعل فقط المعاملات المطلوبة.',
        icon: 'cpu',
      },
      {
        en: 'KV cache compression slashes inference memory footprint by 4x.',
        ar: 'ضغط ذاكرة التخزين المؤقت يقلص استهلاك الذاكرة 4 أضعاف.',
        icon: 'gauge',
      },
      {
        en: 'Speculative decoding yields 2.5x speedups with zero loss.',
        ar: 'فك الترميز التخميني يحقق تسريعاً بمقدار 2.5x دون فاقد.',
        icon: 'zap',
      },
    ];
  }

  // Default robust systems engineering takeaways
  return [
    {
      en: 'Modular decoupled boundaries maintain clean separation of concerns.',
      ar: 'الحدود المعيارية المستقلة تحافظ على عزل المسؤوليات.',
      icon: 'layers',
    },
    {
      en: 'Predictable sub-second latency under extreme production load.',
      ar: 'استجابة فائقة السرعة ومتوقعة تحت أعلى أحمال الإنتاج.',
      icon: 'activity',
    },
    {
      en: 'Zero-downtime deployment pipeline with automated blue-green rollback.',
      ar: 'نشر فوري دون انقطاع مع ارتداد آلي سلس.',
      icon: 'checkCircle',
    },
  ];
}

/**
 * Distills an 8-slide carousel into a standalone 1-slide Infographic Poster.
 * Extracts hook headlines, central architecture schematics, key benchmark metrics,
 * 3 bilingual takeaway bullets, and author/source attribution cleanly.
 */
export function condenseCarouselToSingleSlide(carousel: CarouselData): CarouselData {
  const slides = carousel.slides || [];
  if (slides.length <= 1 && carousel.postFormat === 'single') {
    return carousel;
  }

  const hookSlide = slides[0] || {};
  const ctaSlide = slides[slides.length - 1] || {};

  // Find standout diagram variant & nodes from any slide
  let diagramVariant = hookSlide.diagramVariant;
  let diagramNodes = hookSlide.diagramNodes;
  let diagramEdges = hookSlide.diagramEdges;
  let diagramFooter = hookSlide.diagramFooter;

  // Find standout metric if available
  let metricValue: string | undefined;
  let metricLabel: string | undefined;
  let metricDiff: string | undefined;
  let metricIcon: string | undefined;

  for (const s of slides) {
    if (!diagramVariant && s.diagramVariant) {
      diagramVariant = s.diagramVariant;
      diagramNodes = s.diagramNodes;
      diagramEdges = s.diagramEdges;
      diagramFooter = s.diagramFooter;
    }
    if (!metricValue && s.metricValue) {
      metricValue = s.metricValue;
      metricLabel = s.metricLabel;
      metricDiff = s.metricDiff;
      metricIcon = s.metricIcon;
    }
  }

  // Extract up to 3 bilingual takeaways from the middle mechanism / comparison slides
  const middleSlides = slides.slice(1, Math.max(1, slides.length - 1));
  const extractedTakeaways: SlideTakeawayItem[] = [];

  for (const s of middleSlides) {
    if (extractedTakeaways.length >= 3) break;
    const enText = (s.enTitle || s.enBody || '').trim().replace(/\.$/, '');
    const arText = (s.arTitle || s.arBody || '').trim();

    if (enText.length >= 6) {
      const enBullet = enText.length > 72 ? `${enText.slice(0, 69)}...` : enText;
      const arBullet = arText.length > 76 ? `${arText.slice(0, 73)}...` : arText || 'ركيزة معمارية أساسية للنظام.';
      extractedTakeaways.push({
        en: enBullet,
        ar: arBullet,
        icon: s.metricIcon || (s.diagramNodes?.[0]?.icon) || 'checkCircle',
      });
    }
  }

  // Fallback to seeded takeaways if fewer than 3 were distilled
  const finalTakeaways = extractedTakeaways.length >= 2
    ? extractedTakeaways
    : seedSingleSlideTakeaways(hookSlide, carousel.category);

  // Preserve credit from CTA slide, carousel channels, or source metadata
  const enCredit = (
    ctaSlide.enCredit ||
    hookSlide.enCredit ||
    carousel.channel ||
    carousel.sourceMeta?.creator ||
    carousel.sourceMeta?.channel ||
    ''
  ).replace(/^Source:\s*/i, '').trim();

  const arCredit = (
    ctaSlide.arCredit ||
    hookSlide.arCredit ||
    enCredit
  ).replace(/^Source:\s*/i, '').trim();

  const singleSlide: SlideData = {
    type: 'poster',
    enTitle: hookSlide.enTitle || 'High-Performance System Architecture',
    arTitle: hookSlide.arTitle || 'معمارية النظم عالية الأداء ومبادئ التصميم',
    enBody: hookSlide.enBody || 'A consolidated architectural overview of production mechanisms, tradeoffs, and system bounds.',
    arBody: hookSlide.arBody || 'نظرة شاملة ومكثفة على الآليات المعمارية والاعتبارات الإنتاجية للنظام.',
    diagramVariant: diagramVariant || 'topology',
    diagramNodes: diagramNodes && diagramNodes.length >= 3 ? diagramNodes : undefined,
    diagramEdges: diagramEdges,
    diagramFooter: diagramFooter || 'CAD_SYS_REF // PRODUCTION VERIFIED ARCHITECTURE',
    metricValue,
    metricLabel,
    metricDiff,
    metricIcon,
    takeaways: finalTakeaways.slice(0, 3),
    enCredit,
    arCredit,
    ctaText: ctaSlide.ctaText || 'Read Full Spec',
    url: ctaSlide.url || carousel.brandUrl || 'marrok.org',
  };

  return {
    ...carousel,
    postFormat: 'single',
    slides: [singleSlide],
  };
}
