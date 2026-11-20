import type { CarouselData, SlideData, SlideTakeawayItem } from '../../types.ts';
import { extractSlideText } from '../text/slideText.ts';

/**
 * Seeds up to 3 high-signal bilingual takeaway bullets for single-slide infographic posters.
 * Derives points dynamically from the slide's own metrics, comparison columns, diagram nodes,
 * and body sentences before falling back to concise domain-specific points (never DevOps clichés).
 */
export function seedSingleSlideTakeaways(
  slide: Partial<SlideData>,
  category: string = 'SYSTEMS'
): SlideTakeawayItem[] {
  if (slide.takeaways && slide.takeaways.length >= 2) {
    return slide.takeaways.slice(0, 3);
  }

  const derived: SlideTakeawayItem[] = [];
  const usedEn = new Set<string>();
  const clampEn = (txt: string) => {
    const clean = txt.replace(/\s+/g, ' ').trim();
    return clean.length > 75 ? `${clean.slice(0, 72).trim()}...` : clean;
  };
  const clampAr = (txt: string) => {
    const clean = txt.replace(/\s+/g, ' ').trim();
    return clean.length > 80 ? `${clean.slice(0, 77).trim()}...` : clean;
  };
  const pushItem = (item: SlideTakeawayItem) => {
    const norm = item.en.trim().toLowerCase();
    if (!norm || usedEn.has(norm) || derived.length >= 3) return;
    usedEn.add(norm);
    derived.push({
      en: clampEn(item.en),
      ar: clampAr(item.ar),
      icon: item.icon || 'checkCircle',
    });
  };

  // 1. Extract concrete metric takeaway if present
  if (slide.metricValue && slide.metricLabel) {
    pushItem({
      en: `${slide.metricValue} ${slide.metricLabel.toLowerCase()} measured in practice.`,
      ar: `تم قياس ${slide.metricLabel} بمستوى ${slide.metricValue} فعلياً.`,
      icon: slide.metricIcon || 'gauge',
    });
  }

  // 2. Extract concrete compare takeaway if present
  if (slide.compareLeftTitle && slide.compareRightTitle) {
    pushItem({
      en: `Shifting from ${slide.compareLeftTitle} to ${slide.compareRightTitle} changes constraints.`,
      ar: `الانتقال من ${slide.compareLeftTitle} إلى ${slide.compareRightTitle} يغير القيود.`,
      icon: 'arrowRightLeft',
    });
  }

  // 3. Extract concrete sentences from slide body if present
  const enSentences = (slide.enBody || '')
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 16);
  const arSentences = (slide.arBody || '')
    .split(/(?<=[.؟!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);

  for (let i = 0; i < enSentences.length && derived.length < 3; i++) {
    pushItem({
      en: enSentences[i],
      ar: arSentences[i] || slide.arTitle || 'نقطة هندسية مستخلصة من التصميم.',
      icon: i === 0 ? 'zap' : i === 1 ? 'layers' : 'checkCircle',
    });
  }

  // 4. Extract from diagramNodes if distinct Latin labels exist
  if (derived.length < 3 && Array.isArray(slide.diagramNodes)) {
    for (const node of slide.diagramNodes) {
      if (derived.length >= 3) break;
      const lbl = (node.label || '').trim();
      const sub = (node.sublabel || '').trim();
      if (lbl.length >= 3 && !/[\u0600-\u06FF]/.test(lbl)) {
        const sentence = sub ? `${lbl}: ${sub}` : `Core bottleneck centers on ${lbl}.`;
        pushItem({
          en: sentence,
          ar: `المحور الأساسي يرتكز على مسار ${lbl}.`,
          icon: node.icon || 'cpu',
        });
      }
    }
  }

  if (derived.length >= 3) {
    return derived.slice(0, 3);
  }

  const catUpper = (category || slide.category || '').toUpperCase();
  const slideText = `${extractSlideText(slide)} ${catUpper}`;
  const isFinancialOrMacro =
    /\$|\b(?:valuation|billion|trillion|loss|losses|deficit|capital|financing|circular|subsid|taxpayer|retiree|s&p|pension|401k|revenue|spend|spent|cash[- ]?out|stake|economy|economic|inflation|energy\s+bill|gigawatt|nuclear|market|investor|debt|financial|wall\s+street)\b|مليار|تريليون|خسائر|تمويل|تقييم|ضرائب|متقاعد|طاقة|اقتصاد|استثمار|دعم\s+حكومي/i.test(
      slideText
    );

  const fallbackPool: SlideTakeawayItem[] = isFinancialOrMacro
    ? [
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
      ]
    : catUpper.includes('SECURITY') || catUpper.includes('CYBER') || catUpper.includes('AUTH') || /\b(?:security|auth|cve|sandbox|permission|zero[- ]?trust)\b/i.test(slideText)
    ? [
        {
          en: 'Every trust boundary enforces explicit cryptographic verification.',
          ar: 'كل حد أمني يفرض تحققاً تشفيرياً صريحاً دون ثقة مسبقة.',
          icon: 'shield',
        },
        {
          en: 'Least-privilege isolation limits blast radius during compromise.',
          ar: 'عزل الصلاحيات الدنيا يقلص نطاق الضرر عند حدوث اختراق.',
          icon: 'key',
        },
        {
          en: 'Short-lived credentials cut exposure from leaked tokens.',
          ar: 'بيانات الاعتماد قصيرة الأمد تحد من مخاطر تسرب التوكنات.',
          icon: 'zap',
        },
      ]
    : catUpper.includes('DATABASE') || catUpper.includes('STORAGE') || catUpper.includes('SQL') || /\b(?:sql|postgres|redis|database|cache|replica|wal)\b/i.test(slideText)
    ? [
        {
          en: 'Separating compute from storage removes write-lock contention.',
          ar: 'فصل المعالجة عن التخزين يزيل اختناقات أقفال الكتابة.',
          icon: 'database',
        },
        {
          en: 'Read replicas absorb query spikes with steady tail latency.',
          ar: 'النسخ المتطابقة للقراءة تمتص ذروة الاستعلامات بثبات.',
          icon: 'layers',
        },
        {
          en: 'Append-only WAL replication protects durability across failovers.',
          ar: 'نسخ سجلات الكتابة المتتابعة يحفظ سلامة البيانات عند الأعطال.',
          icon: 'checkCircle',
        },
      ]
    : /\b(?:agent|autonomous|coding|developer|copilot|human|workflow|review)\b|وكلاء|مطور/i.test(slideText)
    ? [
        {
          en: 'Autonomous loops generate diffs faster than humans can audit them.',
          ar: 'حلقات الوكلاء تولد التعديلات أسرع من قدرة المراجعة البشرية.',
          icon: 'robot',
        },
        {
          en: 'Sandboxed tests replace manual line-by-line review as the main gate.',
          ar: 'الاختبارات المعزولة تحل محل التدقيق اليدوي كبوابة تحقق رئيسية.',
          icon: 'shieldCheck',
        },
        {
          en: 'Senior engineers shift from syntax typing to constraint ownership.',
          ar: 'يتحول دور المهندس من كتابة الصياغة إلى تصميم القيود والتحقق.',
          icon: 'cpu',
        },
      ]
    : catUpper.includes('AI') || catUpper.includes('MODEL') || catUpper.includes('LLM')
    ? [
        {
          en: 'Routing inference to specialized experts cuts active compute cost.',
          ar: 'توجيه الاستدلال لخبراء متخصصين يخفض تكلفة الحوسبة الفعلية.',
          icon: 'cpu',
        },
        {
          en: 'Quantized KV state shrinks memory pressure at long contexts.',
          ar: 'ضغط حالة الذاكرة يقلص استهلاك الموارد في السياقات الطويلة.',
          icon: 'gauge',
        },
        {
          en: 'Deterministic verification keeps fast decoding grounded.',
          ar: 'التحقق الحتمي يحافظ على موثوقية المخرجات السريعة.',
          icon: 'zap',
        },
      ]
    : [
        {
          en: 'Clear failure domains keep single-component faults contained.',
          ar: 'تحديد نطاقات الأعطال يبقي أثر الخلل محصوراً في مكون واحد.',
          icon: 'layers',
        },
        {
          en: 'Explicit backpressure stops retry storms under peak demand.',
          ar: 'آليات الضغط الخلفي الصريحة تمنع عواصف المحاولات عند الذروة.',
          icon: 'activity',
        },
        {
          en: 'Automated verification catches regressions prior to rollout.',
          ar: 'التحقق الآلي يكتشف التراجعات مبكراً قبل النشر الإنتاجي.',
          icon: 'checkCircle',
        },
      ];

  for (const fb of fallbackPool) {
    if (derived.length >= 3) break;
    pushItem(fb);
  }

  return derived.slice(0, 3);
}

/**
 * Distills a multi-slide carousel into a standalone 1-slide Infographic Poster.
 * Pulls headline, body, graphics/metrics, takeaways, and attribution strictly from
 * real existing slide copy — never invents generic filler paragraphs or fake diagram nodes.
 */
export function condenseCarouselToSingleSlide(carousel: CarouselData): CarouselData {
  const slides = carousel.slides || [];
  if (slides.length <= 1 && carousel.postFormat === 'single') {
    return carousel;
  }

  const hookSlide = slides[0] || ({} as SlideData);
  const lastSlide = slides.length > 1 ? slides[slides.length - 1] : undefined;
  const ctaSlide = lastSlide?.type === 'cta' ? lastSlide : lastSlide || ({} as SlideData);
  const middleSlides =
    slides.length > 2
      ? slides.slice(1, lastSlide?.type === 'cta' ? slides.length - 1 : slides.length)
      : slides.slice(1);

  // Pull real visual/diagram data from slides ONLY when actually present (never invent fake nodes)
  let diagramVariant = hookSlide.diagramVariant;
  let diagramNodes = hookSlide.diagramNodes && hookSlide.diagramNodes.length >= 2 ? hookSlide.diagramNodes : undefined;
  let diagramEdges = hookSlide.diagramEdges;
  let diagramFooter = hookSlide.diagramFooter;

  let metricValue = hookSlide.metricValue;
  let metricLabel = hookSlide.metricLabel;
  let metricDiff = hookSlide.metricDiff;
  let metricIcon = hookSlide.metricIcon;

  let mediaSlide: SlideData | undefined =
    hookSlide.imageUrl || hookSlide.videoUrl ? hookSlide : undefined;

  for (const s of slides) {
    if (!mediaSlide && (s.imageUrl || s.videoUrl)) {
      mediaSlide = s;
    }
    if (!diagramNodes && s.diagramNodes && s.diagramNodes.length >= 2) {
      diagramVariant = s.diagramVariant || diagramVariant;
      diagramNodes = s.diagramNodes;
      diagramEdges = s.diagramEdges;
      diagramFooter = s.diagramFooter || diagramFooter;
    } else if (!diagramVariant && s.diagramVariant) {
      diagramVariant = s.diagramVariant;
      if (s.diagramFooter && !diagramFooter) diagramFooter = s.diagramFooter;
    }
    if (!metricValue && s.metricValue) {
      metricValue = s.metricValue;
      metricLabel = s.metricLabel;
      metricDiff = s.metricDiff;
      metricIcon = s.metricIcon;
    }
  }

  // Pull real body text from Slide 1, or fall back to the first middle slide with actual body copy (never generic boilerplate)
  const firstBodySlide = middleSlides.find((s) => Boolean((s.enBody || '').trim()));
  const resolvedEnBody = (hookSlide.enBody || '').trim() || (firstBodySlide?.enBody || '').trim();
  const resolvedArBody =
    (hookSlide.arBody || '').trim() ||
    (firstBodySlide?.arBody || '').trim() ||
    (middleSlides.find((s) => Boolean((s.arBody || '').trim()))?.arBody || '').trim();

  // Extract up to 3 bilingual takeaways exclusively from real middle slides (or existing explicit hookSlide takeaways)
  const extractedTakeaways: SlideTakeawayItem[] = [];
  const seenEn = new Set<string>();

  for (const s of middleSlides) {
    if (extractedTakeaways.length >= 3) break;
    const enText = (s.enTitle || s.enBody || '').trim().replace(/\.$/, '');
    const arText = (s.arTitle || s.arBody || '').trim();
    const norm = enText.toLowerCase();

    if (enText.length >= 6 && !seenEn.has(norm)) {
      seenEn.add(norm);
      const enBullet = enText.length > 72 ? `${enText.slice(0, 69).trim()}...` : enText;
      const arBullet = arText.length > 76 ? `${arText.slice(0, 73).trim()}...` : arText;
      extractedTakeaways.push({
        en: enBullet,
        ar: arBullet,
        icon: s.metricIcon || s.diagramNodes?.[0]?.icon || 'checkCircle',
      });
    }
  }

  const finalTakeaways: SlideTakeawayItem[] =
    extractedTakeaways.length > 0
      ? extractedTakeaways
      : Array.isArray(hookSlide.takeaways) && hookSlide.takeaways.length > 0
      ? hookSlide.takeaways.slice(0, 3)
      : [];

  // Preserve credit from CTA slide, hook slide, carousel channel, or source metadata
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
    enTitle: (hookSlide.enTitle || '').trim(),
    arTitle: (hookSlide.arTitle || '').trim(),
    enBody: resolvedEnBody,
    arBody: resolvedArBody,
    ...(hookSlide.hookKicker ? { hookKicker: hookSlide.hookKicker } : {}),
    ...(diagramVariant ? { diagramVariant } : {}),
    ...(diagramNodes ? { diagramNodes: diagramNodes.map((n) => ({ ...n })) } : {}),
    ...(diagramEdges
      ? {
          diagramEdges: diagramEdges.map((e) => (Array.isArray(e) ? ([...e] as typeof e) : e)),
        }
      : {}),
    ...(diagramFooter ? { diagramFooter } : {}),
    ...(metricValue ? { metricValue, metricLabel, metricDiff, metricIcon } : {}),
    ...(hookSlide.compareLeftTitle && hookSlide.compareRightTitle
      ? {
          compareLeftTitle: hookSlide.compareLeftTitle,
          compareLeftBody: hookSlide.compareLeftBody,
          compareRightTitle: hookSlide.compareRightTitle,
          compareRightBody: hookSlide.compareRightBody,
        }
      : {}),
    ...(hookSlide.subjectPair ? { subjectPair: { ...hookSlide.subjectPair } } : {}),
    ...(mediaSlide?.imageUrl
      ? {
          imageUrl: mediaSlide.imageUrl,
          imageFrameMode: mediaSlide.imageFrameMode === 'standard' ? 'standard' : 'hero',
          imageFit: mediaSlide.imageFit || 'contain',
          imageBgStyle: mediaSlide.imageBgStyle || 'white',
          imageFilter: mediaSlide.imageFilter || 'clean',
          imageAspectRatio: mediaSlide.imageAspectRatio,
          brandWatermark: mediaSlide.brandWatermark || 'bottom-right',
        }
      : {}),
    ...(mediaSlide?.videoUrl
      ? {
          mediaType: 'video' as const,
          videoUrl: mediaSlide.videoUrl,
          videoMimeType: mediaSlide.videoMimeType,
          videoFileName: mediaSlide.videoFileName,
          videoDuration: mediaSlide.videoDuration,
          videoMuted: mediaSlide.videoMuted ?? true,
          videoPlaying: mediaSlide.videoPlaying ?? true,
          imageFrameMode: mediaSlide.imageFrameMode === 'standard' ? 'standard' : 'hero',
        }
      : {}),
    takeaways: finalTakeaways.slice(0, 3),
    enCredit,
    arCredit,
    ...(ctaSlide.ctaText ? { ctaText: ctaSlide.ctaText } : {}),
    ...(ctaSlide.url || carousel.brandUrl ? { url: ctaSlide.url || carousel.brandUrl } : {}),
  };

  return {
    ...carousel,
    postFormat: 'single',
    slides: [singleSlide],
  };
}
