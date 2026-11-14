import type { CarouselData, SlideData } from '../../types.ts';
import { normalizePunctuation, stripMarkdown } from './markdown.ts';
import { repairTruncatedTextEllipsis, sanitizeArabicSlideText } from './arabicBiDi.ts';
import { enforceHeadlineSpecRule } from './headlines.ts';

/**
 * Sanitizes English slide text to ensure clean typography, no markdown,
 * and proper sentence endings without orphan dots or truncated "and..." endings.
 */
export function sanitizeEnglishSlideText(
  text: string,
  options: { isTitle?: boolean } = {}
): string {
  if (!text) return '';

  let clean = stripMarkdown(text);
  clean = normalizePunctuation(clean);
  clean = repairTruncatedTextEllipsis(clean);

  // Strip stray leading colons, dashes
  clean = clean.replace(/^[:\-\s]+/, '').trim();

  // Remove trailing period preceded by space e.g. "Speedup ." -> "Speedup."
  clean = clean.replace(/\s+\.$/, '.');

  if (options.isTitle) {
    // Slide titles: allow clean period or question mark, but avoid double colons
    clean = clean.replace(/[:.]\s*:\s*/g, ': ');
  }

  return clean;
}

export function deriveSlideHookKicker(
  slide: SlideData,
  slideIndex: number = 0,
  totalSlides: number = 8
): string {
  if (slide.hookKicker && slide.hookKicker.trim().length > 0) {
    return stripMarkdown(slide.hookKicker)
      .replace(/^[:\-•\s]+|[:\-•\s]+$/g, '')
      .toUpperCase()
      .slice(0, 34);
  }

  const isCta = (totalSlides > 1 && slideIndex === totalSlides - 1) || slide.type === 'cta';
  if (isCta) return 'ENGINEERING DEBATE';

  const fullText = `${slide.enTitle || ''} ${slide.enBody || ''}`;
  const metricMatch = fullText.match(
    /(?:\$\s*\d+(?:[.,]\d+)?\s*(?:T|B|M|K|trillion|billion|million)?|\b\d+(?:[.,]\d+)?\s*(?:x|%|ms|μs|ns|GB\/s|MB\/s|GB|MB|TB|KB|GW|rps|req\/s|T|B|M|K)\b)/i
  );
  const rawMetric = metricMatch ? metricMatch[0].replace(/\s+/g, '').toUpperCase().slice(0, 10) : '';

  if (slideIndex === 0) {
    if (slide.type === 'compare' || /\bvs\.?\b|\bversus\b/i.test(slide.enTitle || '')) {
      return rawMetric ? `ARCHITECTURE SHOWDOWN • ${rawMetric}` : 'ARCHITECTURE SHOWDOWN';
    }
    if (slide.type === 'metric' || rawMetric) {
      return `BENCHMARK SHOCK • ${rawMetric || 'VERIFIED'}`;
    }
    if (/cve|zero[- ]?day|breach|exploit|vulnerability|sandbox|isolation/i.test(fullText)) {
      return 'SECURITY POSTMORTEM';
    }
    if (/\$|valuation|loss|deficit|capital|subsid|funding|stipend/i.test(fullText)) {
      return 'ECOSYSTEM ECONOMICS';
    }
    return 'ENGINEERING BREAKDOWN';
  }

  if (
    slide.diagramVariant === 'takeaway' ||
    (totalSlides >= 5 && slideIndex === totalSlides - 2)
  ) {
    return rawMetric ? `THE HIDDEN CATCH • ${rawMetric}` : 'ARCHITECTURAL VERDICT';
  }

  if (slide.type === 'compare') {
    return 'HEAD-TO-HEAD CONTRAST';
  }
  if (slide.type === 'metric') {
    return rawMetric ? `PRODUCTION METRIC • ${rawMetric}` : 'PRODUCTION BENCHMARK';
  }
  if (slide.type === 'code') {
    return slide.codeLanguage
      ? `IMPLEMENTATION • ${slide.codeLanguage.toUpperCase().slice(0, 12)}`
      : 'IMPLEMENTATION SPEC';
  }
  if (slide.type === 'number') {
    return `STAGE ${slide.stepNumber || String(slideIndex).padStart(2, '0')} • MECHANISM`;
  }
  if (slide.diagramVariant === 'isolation') {
    return 'BLAST RADIUS & ISOLATION';
  }
  if (slide.diagramVariant === 'stack') {
    return 'EXECUTION STACK';
  }
  if (slide.diagramVariant === 'clusters' || slide.diagramVariant === 'graph') {
    return 'SCALE TOPOLOGY';
  }
  if (slideIndex === 1) {
    return rawMetric ? `THE BOTTLENECK • ${rawMetric}` : 'THE CORE BOTTLENECK';
  }
  return rawMetric ? `SYSTEM MECHANISM • ${rawMetric}` : 'SYSTEM ARCHITECTURE';
}

/**
 * Deeply sanitizes a single slide to guarantee crisp, defect-free rendering on canvas and UI.
 */
export function sanitizeSlide(
  slide: SlideData,
  slideIndex: number = 0,
  totalSlides: number = 8
): SlideData {
  const safeType =
    slide.type || (slideIndex === 0 ? 'hub' : totalSlides > 1 && slideIndex === totalSlides - 1 ? 'cta' : 'row');
  const isHook = slideIndex === 0;
  const isCta = (totalSlides > 1 && slideIndex === totalSlides - 1) || safeType === 'cta';

  return {
    ...slide,
    type: safeType,
    hookKicker: slide.hookKicker
      ? stripMarkdown(slide.hookKicker).toUpperCase().slice(0, 34)
      : deriveSlideHookKicker({ ...slide, type: safeType }, slideIndex, totalSlides),
    enTitle: slide.enTitle
      ? enforceHeadlineSpecRule(slide.enTitle, { isHook, isCta })
      : slide.enTitle,
    arTitle: slide.arTitle
      ? sanitizeArabicSlideText(slide.arTitle, { isTitle: true })
      : slide.arTitle,
    enBody: slide.enBody
      ? sanitizeEnglishSlideText(slide.enBody, { isTitle: false })
      : slide.enBody,
    arBody: slide.arBody
      ? sanitizeArabicSlideText(slide.arBody, { isTitle: false })
      : slide.arBody,
    metricValue: slide.metricValue
      ? normalizePunctuation(stripMarkdown(slide.metricValue))
      : slide.metricValue,
    metricLabel: slide.metricLabel
      ? stripMarkdown(slide.metricLabel).toUpperCase()
      : slide.metricLabel,
    metricDiff: slide.metricDiff
      ? normalizePunctuation(stripMarkdown(slide.metricDiff))
      : slide.metricDiff,
    compareLeftTitle: slide.compareLeftTitle
      ? stripMarkdown(slide.compareLeftTitle)
      : slide.compareLeftTitle,
    compareRightTitle: slide.compareRightTitle
      ? stripMarkdown(slide.compareRightTitle)
      : slide.compareRightTitle,
    ctaText: slide.ctaText
      ? stripMarkdown(slide.ctaText)
      : slide.ctaText,
    satLabels: slide.satLabels
      ? slide.satLabels.map((l) => stripMarkdown(l))
      : slide.satLabels,
    diagramVariant: slide.diagramVariant,
    diagramNodes: slide.diagramNodes
      ? slide.diagramNodes.map((n) => ({
          ...n,
          label: stripMarkdown(n.label || ''),
          sublabel: n.sublabel ? stripMarkdown(n.sublabel) : undefined,
          status: n.status ? stripMarkdown(n.status).toUpperCase() : undefined,
        }))
      : slide.diagramNodes,
    diagramEdges: slide.diagramEdges
      ? slide.diagramEdges.map((e) => stripMarkdown(e))
      : slide.diagramEdges,
    diagramFooter: slide.diagramFooter
      ? stripMarkdown(slide.diagramFooter)
      : slide.diagramFooter,
  };
}

/**
 * Cleans the full caption text to eliminate markdown headings, duplicate prefixes,
 * double punctuation, and strips non-breaking spaces (\u00A0).
 */
export function sanitizeCaption(caption: string): string {
  if (!caption) return '';

  return caption
    .replace(/\u00A0/g, ' ')
    .split('\n')
    .map((line) => {
      // Don't strip hashtags from the hashtags line at the bottom
      if (line.trim().startsWith('#') && line.includes(' #')) {
        return line.trim();
      }
      // Strip markdown header hashes inside caption text
      let cleaned = line.replace(/^#+\s*/, '').trim();
      cleaned = normalizePunctuation(cleaned);
      return cleaned;
    })
    .join('\n')
    // Remove triple or more empty newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const GENERIC_TRADEOFF_EN_TITLE_RE =
  /^(?:the\s+)?(?:core|engineering|key|main|critical|central|fundamental|ultimate|economic|systemic)?\s*(?:trade-?offs?|verdict|takeaways?|catch|bottom\s+line)(?:\s+and\s+limitations)?[.?!]?$/i;

const GENERIC_TRADEOFF_AR_TITLE_RE =
  /^(?:المقايضة|المفاضلة|الخلاصة|الحكم|النتيجة)\s*(?:الجوهرية|الأساسية|الهندسية|الاقتصادية|التقنية|النهائية)?[.؟!]?$/;

const GENERIC_CTA_EN_TITLE_RE =
  /^(?:join\s+(?:the\s+)?discussion|share\s+your\s+(?:thoughts|take)|what\s+do\s+you\s+think|let'?s\s+discuss|drop\s+a\s+comment)[.?!]?$/i;

const GENERIC_CTA_AR_TITLE_RE =
  /^(?:شارك\s+(?:في\s+)?النقاش|شارك\s+برأيك|انضم\s+(?:إلى\s+|لل)?النقاش|شاركنا\s+(?:رأيك|في\s+النقاش)|ما\s+رأيك)[.؟!]?$/;

const TEXTBOOK_GERUND_EN_TITLE_RE =
  /^(?:defining|managing|understanding|exploring|introducing|examining|overview\s+of|connecting)\s+(?:the\s+)?(.+?)[.?!]?$/i;

function truncateAtWordBoundary(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const sliced = clean.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > 12 ? sliced.slice(0, lastSpace) : sliced).replace(/[,;:\-—–]+$/, '').trim();
}

function sharpenTextbookGerundHeadline(enTitle: string, slide: SlideData): string {
  const match = enTitle.trim().match(TEXTBOOK_GERUND_EN_TITLE_RE);
  if (!match) return enTitle;

  const subject = match[1].replace(/[.?!]+$/, '').trim();
  const body = (slide.enBody || '').trim();
  const bodyMetricMatch = body.match(
    /(?:\$\s*\d+(?:[.,]\d+)?\s*(?:T|B|M|K|trillion|billion|million)?|\b\d+(?:[.,]\d+)?\s*(?:x|%|ms|μs|ns|GB\/s|MB\/s|GB|MB|TB|KB|GW|rps|req\/s)\b)/i
  );

  if (bodyMetricMatch) {
    const metric = bodyMetricMatch[0].trim();
    const candidate = `How ${subject} hits ${metric}.`;
    if (candidate.length <= 45) return candidate;
  }

  const candidateHow = `How ${subject} works at scale.`;
  if (candidateHow.length <= 45) return candidateHow;

  const capSubject = subject.charAt(0).toUpperCase() + subject.slice(1);
  return `${truncateAtWordBoundary(capSubject, 42)}.`;
}

function deriveSpecificTradeoffEnTitle(slide: SlideData): string {
  const candidateSource = (slide.takeaways?.[0]?.en || slide.enBody || '').trim();
  if (candidateSource) {
    const sentences = candidateSource
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const firstSentence = sentences[0] || candidateSource;
    const strippedSentence = firstSentence
      .replace(/^(?:the\s+(?:core\s+)?(?:trade-?off|verdict|catch|lesson)\s*(?:is\s+that|:|-|—)\s*)/i, '')
      .replace(/^the\s+/i, '')
      .replace(/[.?!]+$/, '')
      .trim();

    if (strippedSentence.length >= 8 && strippedSentence.length <= 42) {
      const cap = strippedSentence.charAt(0).toUpperCase() + strippedSentence.slice(1);
      return `${cap}.`;
    }

    const firstClause = strippedSentence
      .split(/[;:,—–]|\s+(?:while|because|requiring|meaning|where|so\s+that)\s+/i)[0]
      .trim();
    const fitted = truncateAtWordBoundary(firstClause || strippedSentence, 42)
      .replace(/\s+(?:and|or|vs\.?|to|for|with|in|of|by|on|at|the|a|an)$/i, '')
      .trim();
    if (fitted.length >= 8) {
      const cap = fitted.charAt(0).toUpperCase() + fitted.slice(1);
      return `${cap}.`;
    }
  }

  return 'Balancing speed, control, and resilience.';
}

function deriveSpecificTradeoffArTitle(slide: SlideData): string {
  const candidateSource = (slide.takeaways?.[0]?.ar || slide.arBody || '').trim();
  if (candidateSource) {
    const firstClause = candidateSource
      .split(/[.؟!،؛]/)[0]
      .replace(/^(?:المقايضة|المفاضلة|الخلاصة)\s*[:\-—]?\s*/, '')
      .trim();
    const fitted = truncateAtWordBoundary(firstClause, 38);
    if (fitted.length >= 6) {
      return fitted;
    }
  }
  return 'معادلة الأداء والموثوقية في الإنتاج';
}

function deriveSpecificCtaEnTitle(slide: SlideData, hookTitle?: string): string {
  const body = (slide.enBody || '').trim();
  const questionMatch = body.match(/[^.?!]*\?/);
  if (questionMatch && questionMatch[0].trim().length >= 10) {
    const q = questionMatch[0].trim().replace(/\?+$/, '').trim();
    const fitted = truncateAtWordBoundary(q, 43)
      .replace(/\s+(?:and|or|vs\.?|to|for|with|in|of|by|on|at|from|about|into|the|a|an)$/i, '')
      .trim();
    const cap = fitted.charAt(0).toUpperCase() + fitted.slice(1);
    return `${cap}?`;
  }

  const discussOnMatch = body.match(/join\s+the\s+discussion\s+on\s+([^.?!]+)/i);
  if (discussOnMatch && discussOnMatch[1]) {
    const topic = truncateAtWordBoundary(discussOnMatch[1].trim(), 26);
    return `How do you handle ${topic}?`;
  }

  const cleanHook = (hookTitle || '')
    .replace(/^the\s+/i, '')
    .replace(/\s+(?:gamble|crisis|explained)[.?!]?$/i, '')
    .replace(/[.?!]+$/, '')
    .trim();
  if (cleanHook.length >= 4 && cleanHook.length <= 24) {
    return `How does ${cleanHook} fit your stack?`;
  }

  return 'How does this fit your production stack?';
}

function deriveSpecificCtaArTitle(slide: SlideData): string {
  const body = (slide.arBody || '').trim();
  const questionMatch = body.match(/[^.؟!?]*[؟?]/);
  if (questionMatch && questionMatch[0].trim().length >= 8) {
    const q = questionMatch[0].trim().replace(/[؟?]+$/, '').trim();
    const fitted = truncateAtWordBoundary(q, 38);
    return `${fitted}؟`;
  }

  const discussAboutMatch = body.match(/(?:حول|عن)\s+([^.؟!]+)/);
  if (discussAboutMatch && discussAboutMatch[1]) {
    const topic = truncateAtWordBoundary(discussAboutMatch[1].trim(), 24);
    return `كيف تتعامل مع ${topic}؟`;
  }

  return 'كيف يؤثر هذا التحول على بيئة عملك؟';
}

/**
 * Eliminates repetitive boilerplate slide titles ("The core trade-off.", "Join the discussion."),
 * rewrites dry textbook gerund titles ("Defining the X protocol."), strips redundant leading "The "
 * prefixes across Slides 2–7, and ensures every slide has a crisp contextual hookKicker.
 */
export function repairAndDeRepeatSlideHeadlines(slides: SlideData[]): SlideData[] {
  if (!Array.isArray(slides) || slides.length === 0) return slides;
  const hookTitle = slides[0]?.enTitle || '';

  return slides.map((slide, idx) => {
    const isLastCta = (slides.length > 1 && idx === slides.length - 1) || slide.type === 'cta';
    const isTakeaway =
      slide.diagramVariant === 'takeaway' ||
      (slides.length >= 5 && idx === slides.length - 2 && !isLastCta);

    let enTitle = (slide.enTitle || '').trim();
    let arTitle = (slide.arTitle || '').trim();

    if (isLastCta) {
      if (!enTitle || GENERIC_CTA_EN_TITLE_RE.test(enTitle)) {
        enTitle = deriveSpecificCtaEnTitle(slide, hookTitle);
      }
      if (!arTitle || GENERIC_CTA_AR_TITLE_RE.test(arTitle)) {
        arTitle = deriveSpecificCtaArTitle(slide);
      }
    } else if (isTakeaway || GENERIC_TRADEOFF_EN_TITLE_RE.test(enTitle) || GENERIC_TRADEOFF_AR_TITLE_RE.test(arTitle)) {
      if (GENERIC_TRADEOFF_EN_TITLE_RE.test(enTitle)) {
        enTitle = deriveSpecificTradeoffEnTitle(slide);
      }
      if (GENERIC_TRADEOFF_AR_TITLE_RE.test(arTitle)) {
        arTitle = deriveSpecificTradeoffArTitle(slide);
      }
    } else if (idx >= 1 && TEXTBOOK_GERUND_EN_TITLE_RE.test(enTitle)) {
      enTitle = sharpenTextbookGerundHeadline(enTitle, slide);
    }

    // Strip repetitive leading "The " on mid-deck content slides (Slides 2..N-1)
    // while preserving intentional colons like "THE CATCH: ..."
    if (
      idx >= 1 &&
      !isLastCta &&
      /^The\s+[A-Za-z0-9$]/i.test(enTitle) &&
      !/^The\s+\w+\s*:/i.test(enTitle)
    ) {
      const withoutThe = enTitle.replace(/^The\s+/i, '').trim();
      if (withoutThe.split(/\s+/).length >= 2) {
        enTitle = withoutThe.charAt(0).toUpperCase() + withoutThe.slice(1);
      }
    }

    const hookKicker = deriveSlideHookKicker({ ...slide, enTitle, arTitle }, idx, slides.length);

    return {
      ...slide,
      hookKicker,
      enTitle,
      arTitle,
    };
  });
}

/**
 * Comprehensive sanitize function for full CarouselData before rendering or saving.
 * Permanently locks brand identity to MARROK ('MARROK' / 'marrok.org') while preserving
 * external article attribution in `channel` and `sourceMeta`.
 */
export function sanitizeFullCarousel(carousel: CarouselData): CarouselData {
  const slideCount = carousel.slides?.length || 8;
  const rawBrand = stripMarkdown(carousel.brand || '').trim();
  const isExternalBrand = Boolean(rawBrand && !/^m?arrok$/i.test(rawBrand));
  const preservedChannel =
    carousel.channel || (isExternalBrand ? rawBrand : carousel.sourceMeta?.channel);

  const rawBrandUrl = (carousel.brandUrl || '').trim();
  const isExternalBrandUrl = Boolean(
    rawBrandUrl && !/^(?:https?:\/\/)?(?:www\.)?m?arrok\.org\/?$/i.test(rawBrandUrl)
  );
  const existingSourceUrl = (carousel.sourceMeta?.url || '').trim();
  const shouldPreserveSourceUrl =
    isExternalBrandUrl &&
    (!existingSourceUrl || /^(?:https?:\/\/)?(?:www\.)?m?arrok\.org\/?$/i.test(existingSourceUrl));

  const sanitizedSlides = (carousel.slides || []).map((s, idx) =>
    sanitizeSlide(s, idx, slideCount)
  );
  const deRepeatedSlides = repairAndDeRepeatSlideHeadlines(sanitizedSlides);

  return {
    ...carousel,
    category: stripMarkdown(carousel.category || '').toUpperCase(),
    brand: 'MARROK',
    brandUrl: 'marrok.org',
    ...(preservedChannel ? { channel: preservedChannel } : {}),
    ...(shouldPreserveSourceUrl
      ? {
          sourceMeta: {
            ...carousel.sourceMeta,
            url: rawBrandUrl,
            ...(isExternalBrand && !carousel.sourceMeta?.creator ? { creator: rawBrand } : {}),
          },
        }
      : {}),
    caption: sanitizeCaption(carousel.caption || ''),
    shortCaption: carousel.shortCaption ? sanitizeCaption(carousel.shortCaption) : undefined,
    firstComment: carousel.firstComment ? sanitizeCaption(carousel.firstComment) : undefined,
    screenHook: carousel.screenHook
      ? sanitizeEnglishSlideText(carousel.screenHook, { isTitle: true }).replace(/[.?!]$/, '')
      : undefined,
    slides: deRepeatedSlides,
    hookVariants: (carousel.hookVariants || []).map((h) => ({
      ...h,
      enTitle: sanitizeEnglishSlideText(h.enTitle, { isTitle: true }),
      arTitle: sanitizeArabicSlideText(h.arTitle, { isTitle: true }),
      enBody: sanitizeEnglishSlideText(h.enBody, { isTitle: false }),
      arBody: sanitizeArabicSlideText(h.arBody, { isTitle: false }),
      ...(h.hookKicker ? { hookKicker: stripMarkdown(h.hookKicker).toUpperCase().slice(0, 34) } : {}),
    })),
  };
}
