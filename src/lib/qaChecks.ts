/**
 * qaChecks.ts — Pre-export Quality Assurance checks (Spec §10)
 *
 * Automated checks that block or warn before export:
 * - Slide count (8–10 per spec, 3–12 relaxed for current archetypes)
 * - Character limits on titles and bodies
 * - Arabic line-ending lint (no Latin word + punctuation at line end)
 * - Text overflow (content past safe zone y=1760)
 * - Missing credit on CTA slide for third-party sources
 * - Placeholder detection ("CHANNEL NAME", "Lorem", etc.)
 * - First-frame (Slide 1) readability
 */

import { CarouselData, SlideData, ThemePalette } from '../types';
import {
  CanvasDimensionSpec,
  MIN_BODY_FONT_SIZE,
  MIN_FOOTER_FONT_SIZE,
  MIN_TITLE_FONT_SIZE,
  getCanvasDimensionSpec,
} from './canvas/constants.ts';
import { computeSlideLayoutAwareness } from './canvas/layoutAwareness.ts';
import { sanitizeSvgBlueprintMarkup } from './canvas/svgBlueprint.ts';
import { isPlaceholderOrEmptyBrandValue } from './bundledTechSvgs.ts';

// ─── Character Limits (Spec §8) ────────────────────────────────────
export const CHAR_LIMITS = {
  enTitle: 45,
  arTitle: 40,
  enBody: 140,
  arBody: 150,
  iconLabel: 16,
  hookTitle: 78,    // 6-12 word viral Slide 1 hook headline (2-line @ 96px)
  hookArTitle: 68,  // 6-12 word Arabic Slide 1 hook headline matching EN span without mid-clause truncation
} as const;

export const SINGLE_SLIDE_CHAR_LIMITS = {
  enTitle: 55,
  arTitle: 50,
  enBody: 220,
  arBody: 230,
  takeawayEn: 75,
  takeawayAr: 80,
  iconLabel: 16,
  hookTitle: 78,
  hookArTitle: 68,
} as const;

export const PLATFORM_CAPTION_CHAR_LIMITS = {
  instagram: 2200,
  tiktok: 2200,
  linkedin: 3000,
} as const;

// ─── QA Result Types ────────────────────────────────────────────────
export type QASeverity = 'pass' | 'warn' | 'fail';

export interface QACheckResult {
  id: string;
  severity: QASeverity;
  slideIndex?: number;       // undefined = deck-level check
  field?: string;
  message: string;
  value?: string | number;   // current value for display
  limit?: string | number;   // limit for display
}

export interface QAReport {
  results: QACheckResult[];
  passCount: number;
  warnCount: number;
  failCount: number;
  canExport: boolean;        // true if no 'fail' results
}

// ─── Individual Check Functions ─────────────────────────────────────

/** Check slide count is within acceptable range */
function checkSlideCount(slides: SlideData[], isSingleSlide: boolean = false): QACheckResult {
  const count = slides.length;
  if (isSingleSlide && count === 1) {
    return {
      id: 'slide-count',
      severity: 'pass',
      message: '1 slide — Single-Slide Post format.',
      value: 1,
      limit: '1',
    };
  }
  if (count < 3) {
    return { id: 'slide-count', severity: 'fail', message: `Only ${count} slide(s). Minimum is 3.`, value: count, limit: '3–12' };
  }
  if (count > 12) {
    return { id: 'slide-count', severity: 'warn', message: `${count} slides is very long. Consider trimming to 8–10.`, value: count, limit: '8–10' };
  }
  if (count < 5) {
    return { id: 'slide-count', severity: 'warn', message: `${count} slides is short. Spec recommends 8–10 for full carousels.`, value: count, limit: '8–10' };
  }
  return { id: 'slide-count', severity: 'pass', message: `${count} slides — within range.`, value: count };
}

/**
 * Checks deck caption length against social platform limits:
 * - Instagram & TikTok: 2,200 characters
 * - LinkedIn: 3,000 characters
 */
export function checkPlatformCaptionLimits(carousel: CarouselData): QACheckResult {
  const len = (carousel.caption || '').trim().length;
  if (len > PLATFORM_CAPTION_CHAR_LIMITS.linkedin) {
    return {
      id: 'caption-platform-limit',
      severity: 'warn',
      field: 'caption',
      message: `Caption is ${len} chars — exceeds Instagram/TikTok (${PLATFORM_CAPTION_CHAR_LIMITS.instagram}) and LinkedIn (${PLATFORM_CAPTION_CHAR_LIMITS.linkedin}) limits.`,
      value: len,
      limit: PLATFORM_CAPTION_CHAR_LIMITS.instagram,
    };
  }
  if (len > PLATFORM_CAPTION_CHAR_LIMITS.instagram) {
    return {
      id: 'caption-platform-limit',
      severity: 'warn',
      field: 'caption',
      message: `Caption is ${len} chars — exceeds Instagram & TikTok limit (${PLATFORM_CAPTION_CHAR_LIMITS.instagram} chars; fits LinkedIn ${PLATFORM_CAPTION_CHAR_LIMITS.linkedin}).`,
      value: len,
      limit: PLATFORM_CAPTION_CHAR_LIMITS.instagram,
    };
  }
  return {
    id: 'caption-platform-limit',
    severity: 'pass',
    field: 'caption',
    message: `Caption length (${len} chars) fits Instagram, TikTok (≤2,200) & LinkedIn (≤3,000).`,
    value: len,
    limit: PLATFORM_CAPTION_CHAR_LIMITS.instagram,
  };
}

/** Check character limits on a single slide's text fields */
function checkCharLimits(slide: SlideData, idx: number, isHook: boolean, isSingleSlide: boolean = false): QACheckResult[] {
  const results: QACheckResult[] = [];
  const limits = isSingleSlide ? SINGLE_SLIDE_CHAR_LIMITS : CHAR_LIMITS;
  const enTitleLimit = isHook ? limits.hookTitle : limits.enTitle;
  const arTitleLimit = isHook ? limits.hookArTitle : limits.arTitle;

  if (slide.enTitle && slide.enTitle.length > enTitleLimit) {
    results.push({
      id: `char-en-title-${idx}`,
      severity: 'warn',
      slideIndex: idx,
      field: 'enTitle',
      message: `EN title is ${slide.enTitle.length} chars (limit: ${enTitleLimit}).`,
      value: slide.enTitle.length,
      limit: enTitleLimit,
    });
  }

  if (slide.arTitle && slide.arTitle.length > arTitleLimit) {
    results.push({
      id: `char-ar-title-${idx}`,
      severity: 'warn',
      slideIndex: idx,
      field: 'arTitle',
      message: `AR title is ${slide.arTitle.length} chars (limit: ${arTitleLimit}).`,
      value: slide.arTitle.length,
      limit: arTitleLimit,
    });
  }

  if (slide.enBody && slide.enBody.length > limits.enBody) {
    results.push({
      id: `char-en-body-${idx}`,
      severity: 'warn',
      slideIndex: idx,
      field: 'enBody',
      message: `EN body is ${slide.enBody.length} chars (limit: ${limits.enBody}).`,
      value: slide.enBody.length,
      limit: limits.enBody,
    });
  }

  if (slide.arBody && slide.arBody.length > limits.arBody) {
    results.push({
      id: `char-ar-body-${idx}`,
      severity: 'warn',
      slideIndex: idx,
      field: 'arBody',
      message: `AR body is ${slide.arBody.length} chars (limit: ${limits.arBody}).`,
      value: slide.arBody.length,
      limit: limits.arBody,
    });
  }

  // Check takeaway bullets
  if (slide.takeaways && slide.takeaways.length > 0) {
    if (slide.takeaways.length > 3) {
      results.push({
        id: `takeaways-count-${idx}`,
        severity: 'warn',
        slideIndex: idx,
        field: 'takeaways',
        message: `Slide has ${slide.takeaways.length} key takeaway bullets. Limit to 3 for optimal visual balance.`,
        value: slide.takeaways.length,
        limit: 3,
      });
    }

    const tLimits = isSingleSlide ? SINGLE_SLIDE_CHAR_LIMITS : { takeawayEn: 75, takeawayAr: 80 };
    for (let tIdx = 0; tIdx < slide.takeaways.length; tIdx++) {
      const item = slide.takeaways[tIdx];
      if (item.en && item.en.length > tLimits.takeawayEn) {
        results.push({
          id: `char-takeaway-en-${idx}-${tIdx}`,
          severity: 'warn',
          slideIndex: idx,
          field: `takeaways[${tIdx}].en`,
          message: `Takeaway #${tIdx + 1} EN is ${item.en.length} chars (limit: ${tLimits.takeawayEn}).`,
          value: item.en.length,
          limit: tLimits.takeawayEn,
        });
      }
      if (item.ar && item.ar.length > tLimits.takeawayAr) {
        results.push({
          id: `char-takeaway-ar-${idx}-${tIdx}`,
          severity: 'warn',
          slideIndex: idx,
          field: `takeaways[${tIdx}].ar`,
          message: `Takeaway #${tIdx + 1} AR is ${item.ar.length} chars (limit: ${tLimits.takeawayAr}).`,
          value: item.ar.length,
          limit: tLimits.takeawayAr,
        });
      }
    }
  }

  // Check icon labels
  if (slide.icons) {
    for (let i = 0; i < slide.icons.length; i++) {
      const label = slide.icons[i].label;
      if (label && label.length > limits.iconLabel) {
        results.push({
          id: `char-icon-label-${idx}-${i}`,
          severity: 'warn',
          slideIndex: idx,
          field: `icons[${i}].label`,
          message: `Icon label "${label}" is ${label.length} chars (limit: ${limits.iconLabel}).`,
          value: label.length,
          limit: limits.iconLabel,
        });
      }
    }
  }

  return results;
}

/**
 * Arabic line-ending and BiDi punctuation lint (Spec §8):
 * - No Arabic line should end with a Latin word followed by punctuation.
 * - No colon or punctuation should directly touch a Latin word in an Arabic string (e.g. "رحلة :Scion").
 */
function hasArabicPunctuationJump(text?: string): boolean {
  if (!text) return false;
  // Ends with Latin word + punctuation
  const badEndingPattern = /[A-Za-z0-9]+[.?!،؟:؛]\s*$/;
  // Colon touching Latin word
  const colonTouchingLatin = /:[a-zA-Z0-9]|[a-zA-Z0-9]:/;
  return text.split(/\n/).some((line) => badEndingPattern.test(line.trim()) || colonTouchingLatin.test(line.trim()));
}

function checkArabicLineEndings(slide: SlideData, idx: number): QACheckResult[] {
  const results: QACheckResult[] = [];

  const fieldsToCheck: { key: keyof SlideData; label: string }[] = [
    { key: 'arTitle', label: 'AR title' },
    { key: 'arBody', label: 'AR body' },
    { key: 'arCredit', label: 'AR credit' },
  ];

  for (const { key, label } of fieldsToCheck) {
    const text = slide[key];
    if (typeof text !== 'string' || !text) continue;

    // Check for colon touching Latin word (BiDi scrambling bug)
    if (/:[a-zA-Z0-9]|[a-zA-Z0-9]:/.test(text)) {
      results.push({
        id: `arabic-bidi-colon-${idx}-${key}`,
        severity: 'fail',
        slideIndex: idx,
        field: key,
        message: `Slide ${idx + 1} ${label}: colon touches Latin word, causing BiDi order reversal. Separate colon or remove it.`,
      });
    }

    // Check line endings
    const lines = text.split(/\n/);
    for (const line of lines) {
      if (hasArabicPunctuationJump(line)) {
        results.push({
          id: `arabic-line-end-${idx}-${key}`,
          severity: 'fail',
          slideIndex: idx,
          field: key,
          message: `Slide ${idx + 1} ${label}: ends with Latin word + punctuation ("${line.trim().slice(-20)}"). Rephrase so the line ends with an Arabic word.`,
        });
        break;
      }
    }
  }

  return results;
}

const ARABIC_TRANSLATED_TERM_RULES: Array<{
  pattern: RegExp;
  translatedLabel: string;
  englishTerm: string;
}> = [
  {
    pattern: /(?:^|[\s،.(])(?:ال)?مقابس(?:\s+الشبكة|\s+الشبكية)?(?=$|[\s،.)!؟])/u,
    translatedLabel: 'المقابس / مقابس الشبكة',
    englishTerm: 'Sockets',
  },
  {
    pattern: /زمن\s+(?:ال)?استجابة|(?<=^|[\s،.(])(?:ال)?كمون(?=$|[\s،.)!؟])/u,
    translatedLabel: 'زمن الاستجابة / الكمون',
    englishTerm: 'Latency',
  },
  {
    pattern: /(?:ذاكرة\s+)?(?:ال)?تخزين\s+(?:ال)?مؤقت|الذاكرة\s+(?:ال)?مؤقتة|(?<=^|[\s،.(])الكاش(?=$|[\s،.)!؟])/u,
    translatedLabel: 'الذاكرة المؤقتة / التخزين المؤقت',
    englishTerm: 'Cache',
  },
  {
    pattern: /(?:^|[\s،.(])(?:ال)?عنقود(?:ية)?(?=$|[\s،.)!؟])/u,
    translatedLabel: 'العنقود',
    englishTerm: 'Cluster',
  },
  {
    pattern: /واجه(?:ة|ات)\s+(?:ال)?برمج(?:ة|ية)(?:\s+التطبيقات)?/u,
    translatedLabel: 'واجهة برمجة التطبيقات',
    englishTerm: 'API',
  },
  {
    pattern: /طابور\s+الرسائل|طوابير\s+الرسائل|صفوف\s+الانتظار/u,
    translatedLabel: 'طابور/صفوف الرسائل',
    englishTerm: 'Queue',
  },
  {
    pattern: /موازن\s+(?:ال)?أحمال|توازن\s+(?:ال)?أحمال/u,
    translatedLabel: 'موازن الأحمال',
    englishTerm: 'Load Balancer',
  },
  {
    pattern: /بروتوكول\s+رافت|(?<=^|[\s،.(])رافت(?=$|[\s،.)!؟])/u,
    translatedLabel: 'رافت',
    englishTerm: 'Raft',
  },
  {
    pattern: /(?:^|[\s،.(])كافكا(?=$|[\s،.)!؟])/u,
    translatedLabel: 'كافكا',
    englishTerm: 'Kafka',
  },
  {
    pattern: /(?:^|[\s،.(])بوستجرس(?:كيول)?(?=$|[\s،.)!؟])/u,
    translatedLabel: 'بوستجرس',
    englishTerm: 'Postgres',
  },
  {
    pattern: /(?:^|[\s،.(])ريديس(?=$|[\s،.)!؟])/u,
    translatedLabel: 'ريديس',
    englishTerm: 'Redis',
  },
  {
    pattern: /(?:^|[\s،.(])دوكر(?=$|[\s،.)!؟])/u,
    translatedLabel: 'دوكر',
    englishTerm: 'Docker',
  },
  {
    pattern: /(?:^|[\s،.(])كوبرنيتيس(?=$|[\s،.)!؟])/u,
    translatedLabel: 'كوبرنيتيس',
    englishTerm: 'Kubernetes',
  },
  {
    pattern: /جيجابايت|غيغابايت/u,
    translatedLabel: 'جيجابايت',
    englishTerm: 'GB',
  },
  {
    pattern: /ميجابايت|ميغابايت/u,
    translatedLabel: 'ميجابايت',
    englishTerm: 'MB',
  },
  {
    pattern: /تيرابايت/u,
    translatedLabel: 'تيرابايت',
    englishTerm: 'TB',
  },
  {
    pattern: /كيلوبايت/u,
    translatedLabel: 'كيلوبايت',
    englishTerm: 'KB',
  },
  {
    pattern: /مللي\s+ثانية|ميلي\s+ثانية|ملي\s+ثانية/u,
    translatedLabel: 'مللي ثانية',
    englishTerm: 'ms',
  },
  {
    pattern: /ميكروثانية|ميكرو\s+ثانية/u,
    translatedLabel: 'ميكروثانية',
    englishTerm: 'μs',
  },
  {
    pattern: /نانوثانية|نانو\s+ثانية/u,
    translatedLabel: 'نانوثانية',
    englishTerm: 'ns',
  },
];

/**
 * Emit a non-blocking warning ONLY when an Arabic technical term or unit appears translated into Arabic
 * instead of kept in English Latin script (e.g. "Sockets", "Latency", "Cache", "Cluster", "GB", "ms").
 */
function checkArabicTranslatedTechTerms(slide: SlideData, idx: number): QACheckResult[] {
  const results: QACheckResult[] = [];
  const fields: Array<{ key: string; text?: string }> = [
    { key: 'arTitle', text: slide.arTitle },
    { key: 'arBody', text: slide.arBody },
    ...(slide.takeaways || []).map((t, tIdx) => ({
      key: `takeaways[${tIdx}].ar`,
      text: t.ar,
    })),
  ];

  for (const { key, text } of fields) {
    if (!text || typeof text !== 'string') continue;
    const found: Array<{ translatedLabel: string; englishTerm: string }> = [];
    for (const rule of ARABIC_TRANSLATED_TERM_RULES) {
      if (rule.pattern.test(text)) {
        found.push({ translatedLabel: rule.translatedLabel, englishTerm: rule.englishTerm });
      }
    }
    if (found.length > 0) {
      const summary = found
        .map((f) => `"${f.translatedLabel}" → "${f.englishTerm}"`)
        .join(', ');
      results.push({
        id: `translated-tech-term-${idx}-${key}`,
        severity: 'warn',
        slideIndex: idx,
        field: key,
        message: `Slide ${idx + 1} (${key}): Translated technical term detected (${summary}). Keep technical terms in English inside the Arabic sentence.`,
        value: found.map((f) => f.translatedLabel).join(', '),
        limit: 'Keep English term',
      });
    }
  }

  return results;
}

/**
 * Spec §8 Headline Rule:
 * - Slide 1 Hook: Strictly 2 to 5 words, ending in '.', '?', or '!'. Zero colons.
 * - CTA Slide: Up to 8 words, ending in '?', '!', or '.'. Allows question hooks.
 * - Content Slides: Up to 8 words, clean punctuation, no trailing colons.
 */
function checkHeadlineSpecRule(slide: SlideData, idx: number, totalSlides: number): QACheckResult[] {
  const results: QACheckResult[] = [];
  if (!slide.enTitle || typeof slide.enTitle !== 'string') return results;

  const title = slide.enTitle.trim();
  const words = title.split(/\s+/).filter(Boolean);
  const isHook = idx === 0 || slide.type === 'hub';
  const isCta = idx === totalSlides - 1 || slide.type === 'cta';

  if (isHook) {
    if (title.includes(':')) {
      results.push({
        id: `headline-colon-${idx}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'enTitle',
        message: `Slide 1 hook contains a colon (':'). Hooks must not contain colons.`,
        value: title,
      });
    }

    if (!/[.?!]$/.test(title)) {
      results.push({
        id: `headline-punctuation-${idx}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'enTitle',
        message: `Slide 1 hook must end with '.', '?', or '!'.`,
        value: title,
      });
    }

    const minWords = totalSlides === 1 ? 2 : 6;
    if (words.length < minWords || words.length > 12) {
      results.push({
        id: `headline-length-${idx}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'enTitle',
        message: `Slide 1 hook has ${words.length} words (rule is 6 to 12 words). Adjust length to 6–12 words.`,
        value: words.length,
        limit: '6–12 words',
      });
    } else if (totalSlides === 1 && words.length < 6) {
      results.push({
        id: `headline-length-${idx}`,
        severity: 'warn',
        slideIndex: idx,
        field: 'enTitle',
        message: `Slide 1 hook has ${words.length} words (recommended 6 to 12 words).`,
        value: words.length,
        limit: '6–12 words',
      });
    }
  } else if (isCta) {
    if (title.includes(':')) {
      results.push({
        id: `headline-colon-${idx}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'enTitle',
        message: `CTA slide title contains a colon (':'). Remove colon.`,
        value: title,
      });
    }

    if (!/[.?!]$/.test(title)) {
      results.push({
        id: `headline-punctuation-${idx}`,
        severity: 'warn',
        slideIndex: idx,
        field: 'enTitle',
        message: `CTA slide title should end with '?' or '.'.`,
        value: title,
      });
    }

    if (words.length > 8) {
      results.push({
        id: `headline-length-${idx}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'enTitle',
        message: `CTA slide headline has ${words.length} words (limit is 8 words). Shorten to 8 words or less.`,
        value: words.length,
        limit: '≤ 8 words',
      });
    }
  } else {
    // Content slide titles: up to 8 words
    if (title.endsWith(':') || /::/.test(title)) {
      results.push({
        id: `headline-colon-${idx}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'enTitle',
        message: `Slide ${idx + 1} title ends with a colon. Remove trailing colon.`,
        value: title,
      });
    }

    if (words.length > 8) {
      results.push({
        id: `headline-length-${idx}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'enTitle',
        message: `Slide ${idx + 1} title has ${words.length} words (spec allows up to 8 words). Shorten to 8 words or less.`,
        value: words.length,
        limit: '≤ 8 words',
      });
    }
  }

  return results;
}

// ─── Known Boilerplate & Template Patterns ─────────────────────────
const KNOWN_BOILERPLATE_PATTERNS: { pattern: RegExp; description: string }[] = [
  {
    pattern: /A breakdown of technical mechanisms/i,
    description: 'Generic fallback template summary ("A breakdown of technical mechanisms...")',
  },
  {
    pattern: /(?:technical|architectural)\s+breakdown\s+of\b/i,
    description: 'Template cliché ("technical breakdown of ...")',
  },
  {
    pattern: /\bcore\s+mechanisms\b/i,
    description: 'Template cliché ("core mechanisms")',
  },
  {
    pattern: /\boperational\s+boundaries\b/i,
    description: 'Template cliché ("operational boundaries")',
  },
  {
    pattern: /\bThe\s+core\s+trade-?off\b/i,
    description: 'Template cliché ("The core trade-off")',
  },
  {
    pattern: /\bproduction\s+trade-?offs?\b/i,
    description: 'Template cliché ("production trade-offs")',
  },
  {
    pattern: /\barchitectural\s+trade-?offs?\b/i,
    description: 'Template cliché ("architectural trade-offs")',
  },
  {
    pattern: /^Join the discussion\b/i,
    description: 'Generic CTA boilerplate ("Join the discussion")',
  },
  {
    pattern: /النقلة المعمارية لمنظومة/i,
    description: 'Generic template Arabic title ("النقلة المعمارية لمنظومة...")',
  },
  {
    pattern: /تحليل معماري لمنظومة|تحليل هندسي معمق|الآليات الأساسية|الحدود التشغيلية|المقايضة الجوهرية|مقايضات الإنتاج|تنازلات الإنتاج|آليات النظام الأساسية|كيف تعمل منظومة .* تحت الضغط|شارك في النقاش/i,
    description: 'Template Arabic cliché or literal echo of English template',
  },
  {
    pattern: /هذا العنصر يعرض|تفاصيل هندسية عامة|وصف تقني عام|نص عربي تجريبي/i,
    description: 'Generic Arabic filler copy instead of specific technical explanation',
  },
  {
    pattern: /\sالمعتمد(?:\s*[.?!،؟]*$|\s)/,
    description: 'Fake Arabic placeholder word ("المعتمد") — use pure RTL BiDi isolation instead',
  },
  {
    pattern: /When system frequency increases, legacy architectures become memory bottlenecks/i,
    description: 'Generic fallback body ("When system frequency increases...")',
  },
  {
    pattern: /A breakdown of technical mechanisms, benchmarks, and production architecture/i,
    description: 'Boilerplate body text',
  },
  {
    pattern: /\b\d+(?:png|jpg|jpeg|webp|svg)\b/i,
    description: 'Raw file name or extension in copy (e.g. "20760png")',
  },
  {
    pattern: /\.(?:png|jpe?g|webp|svg|gif)\b/i,
    description: 'Raw image file extension in slide text (e.g. ".png")',
  },
  {
    pattern: /\b(?:IMG|DSC|PXL|Screenshot|Screen\s*Shot)[-_ \d]+\b/i,
    description: 'Auto-generated camera or screenshot filename in copy',
  },
];

export const CONTENT_QUALITY_FILLER_LABELS = new Set([
  'TECH',
  'TECH HUMOR',
  'HUMOR',
  'OPINION',
  'TELEMETRY STAT',
  'EXPOSURE METRIC',
  'BOUNDARIES',
  'VERIFICATION',
  'OBSERVABILITY',
  'STORES TRILLIONS',
  'SYSTEM INGRESS',
  'TRAFFIC INGRESS',
  'EXECUTION CORE',
  'TARGET STATE',
  'PLACEHOLDER',
  'SAMPLE METRIC',
]);

/**
 * Content Quality Gate:
 * Blocks export on template clichés, topic-repeating headlines, Hub node echoes/fillers,
 * literal Arabic template echoes, and Slide 1 multi-slide violations.
 */
export function checkContentQuality(carousel: CarouselData): QACheckResult[] {
  const results: QACheckResult[] = [];
  const slides = carousel.slides || [];
  const isSingleSlide = carousel.postFormat === 'single' || slides.length === 1;
  const categoryNorm = (carousel.category || '').trim().toUpperCase();
  const categoryTokens = new Set(
    categoryNorm
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3)
  );

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    if (s.standaloneMeme || s.imageFrameMode === 'full') continue;

    // 1. Headline merely repeats category / topic name without adding a claim or insight
    const cleanHeadline = (s.enTitle || '').trim();
    if (cleanHeadline && categoryTokens.size > 0) {
      const hTokens = cleanHeadline
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3);
      if (hTokens.length > 0 && hTokens.length <= 4) {
        const allInCategory = hTokens.every((t) => categoryTokens.has(t));
        const hasNumberOrQuestion = /\d|\?/.test(cleanHeadline);
        if (allInCategory && !hasNumberOrQuestion) {
          results.push({
            id: `content-quality-headline-echo-${i}`,
            severity: 'fail',
            slideIndex: i,
            field: 'enTitle',
            message: `Slide ${i + 1} headline ("${cleanHeadline}") merely repeats the topic/category name instead of a specific hook or insight.`,
          });
        }
      }
    }

    // 2. Slide 1 Hook discipline on multi-slide decks: zero body copy & <= 12 words
    if (i === 0 && !isSingleSlide && slides.length > 1) {
      if ((s.enBody || '').trim() || (s.arBody || '').trim()) {
        results.push({
          id: `content-quality-slide1-body-0`,
          severity: 'fail',
          slideIndex: 0,
          field: 'enBody',
          message: 'Slide 1 Hook must contain zero body copy (leave enBody & arBody blank on multi-slide decks).',
        });
      }
      const wordCount = cleanHeadline ? cleanHeadline.split(/\s+/).filter(Boolean).length : 0;
      if (wordCount > 12) {
        results.push({
          id: `content-quality-slide1-words-0`,
          severity: 'fail',
          slideIndex: 0,
          field: 'enTitle',
          message: `Slide 1 Hook has ${wordCount} words (max 12 words for scannability).`,
        });
      }
      if (s.type !== 'poster') {
        const teaserEnLen = (s.coverTeaserEn || '').trim().length;
        const teaserArLen = (s.coverTeaserAr || '').trim().length;
        if (teaserEnLen > 68) {
          results.push({
            id: 'content-quality-slide1-teaser-en-len',
            severity: 'warn',
            slideIndex: 0,
            field: 'coverTeaserEn',
            message: `Slide 1 English cover teaser is ${teaserEnLen} chars (keep <= 68 chars for clean 1-line cover framing).`,
          });
        }
        if (teaserArLen > 68) {
          results.push({
            id: 'content-quality-slide1-teaser-ar-len',
            severity: 'warn',
            slideIndex: 0,
            field: 'coverTeaserAr',
            message: `Slide 1 Arabic cover teaser is ${teaserArLen} chars (keep <= 68 chars for clean 1-line cover framing).`,
          });
        }
        if (
          s.coverStyle === 'metric-split' &&
          !/\d/.test(`${s.metricValue || ''} ${s.enTitle || ''} ${s.coverTeaserEn || ''}`)
        ) {
          results.push({
            id: 'content-quality-slide1-metric-split-digits',
            severity: 'warn',
            slideIndex: 0,
            field: 'coverStyle',
            message:
              'Slide 1 uses "Metric Split" cover style without a verified numeric figure — consider "Headline Hero" or add a grounded stat.',
          });
        }
      }
    }

    // 3. Hub node labels: no filler labels, no category/title echoes
    if (s.satLabels && s.satLabels.length > 0) {
      const titleTokens = new Set(
        `${s.enTitle || ''} ${s.centerTag || ''}`
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length >= 3)
      );
      for (const rawLbl of s.satLabels) {
        const norm = (rawLbl || '').trim().toUpperCase();
        if (!norm) continue;
        if (CONTENT_QUALITY_FILLER_LABELS.has(norm)) {
          results.push({
            id: `content-quality-filler-label-${i}`,
            severity: 'fail',
            slideIndex: i,
            field: 'satLabels',
            message: `Slide ${i + 1} Hub node "${norm}" is generic filler — replace with a real noun/term quoted from the source.`,
          });
          break;
        }
        if (categoryNorm && norm === categoryNorm) {
          results.push({
            id: `content-quality-hub-echo-${i}`,
            severity: 'fail',
            slideIndex: i,
            field: 'satLabels',
            message: `Slide ${i + 1} Hub node "${norm}" echoes the category badge instead of a distinct source concept.`,
          });
          break;
        }
        const lblTokens = norm.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
        if (lblTokens.length === 1 && (categoryTokens.has(lblTokens[0]) || titleTokens.has(lblTokens[0]))) {
          results.push({
            id: `content-quality-hub-echo-${i}`,
            severity: 'fail',
            slideIndex: i,
            field: 'satLabels',
            message: `Slide ${i + 1} Hub node "${norm}" echoes the headline/topic ("${s.enTitle}"). Quote distinct source nouns.`,
          });
          break;
        }
      }
      if (s.type === 'hub' && (!s.hubNodeReasons || s.hubNodeReasons.length === 0)) {
        results.push({
          id: `content-quality-hub-provenance-${i}`,
          severity: 'fail',
          slideIndex: i,
          field: 'satLabels',
          message: `Slide ${i + 1} Hub nodes lack source-quoted provenance justification.`,
        });
      }
    }

    // 4. Metric / Diagram filler label check
    if (CONTENT_QUALITY_FILLER_LABELS.has((s.metricLabel || '').trim().toUpperCase())) {
      results.push({
        id: `content-quality-metric-filler-${i}`,
        severity: 'fail',
        slideIndex: i,
        field: 'metricLabel',
        message: `Slide ${i + 1} metric label "${s.metricLabel}" is generic filler.`,
      });
    }
    if (s.diagramNodes && s.diagramNodes.length > 0) {
      const badNode = s.diagramNodes.find((n) =>
        CONTENT_QUALITY_FILLER_LABELS.has((n.label || '').trim().toUpperCase())
      );
      if (badNode) {
        results.push({
          id: `content-quality-node-filler-${i}`,
          severity: 'fail',
          slideIndex: i,
          field: 'diagramNodes',
          message: `Slide ${i + 1} diagram node "${badNode.label}" is generic filler.`,
        });
      }
    }

    // 5. Literal Arabic echo check: arTitle/arBody with >= 3 words must actually contain Arabic letters
    for (const arKey of ['arTitle', 'arBody'] as const) {
      const arText = (s[arKey] || '').trim();
      if (arText && !/[\u0600-\u06FF]/.test(arText) && arText.split(/\s+/).length >= 3) {
        results.push({
          id: `content-quality-arabic-missing-${i}-${arKey}`,
          severity: 'fail',
          slideIndex: i,
          field: arKey,
          message: `Slide ${i + 1} ${arKey} contains English-only text ("${arText.slice(0, 32)}") instead of genuine Arabic.`,
        });
      }
    }
    results.push(...checkBoilerplatePhrases(s, i));
  }

  // Also flag template clichés in the deck caption if present
  const captionText = (carousel.caption || '').trim();
  if (captionText) {
    for (const { pattern, description } of KNOWN_BOILERPLATE_PATTERNS) {
      if (pattern.test(captionText)) {
        results.push({
          id: 'content-quality-caption-boilerplate',
          severity: 'fail',
          field: 'caption',
          message: `Deck caption contains template cliché: ${description}.`,
        });
        break;
      }
    }
  }

  return results;
}

/** Check that slide does not contain unedited generic boilerplate phrases */
function checkBoilerplatePhrases(slide: SlideData, idx: number): QACheckResult[] {
  const results: QACheckResult[] = [];
  const fieldsToCheck: (keyof SlideData)[] = ['enTitle', 'arTitle', 'enBody', 'arBody', 'ctaText'];

  for (const field of fieldsToCheck) {
    const val = slide[field];
    if (typeof val !== 'string' || !val) continue;

    for (const { pattern, description } of KNOWN_BOILERPLATE_PATTERNS) {
      if (pattern.test(val)) {
        results.push({
          id: `boilerplate-${idx}-${field}`,
          severity: 'fail',
          slideIndex: idx,
          field,
          message: `Slide ${idx + 1} ${field} contains known template boilerplate: ${description}. Replace with authentic content.`,
          value: val.substring(0, 50),
        });
        break;
      }
    }
  }

  return results;
}

/** Check that no two slides share identical body copy */
function checkDuplicateBodyText(slides: SlideData[]): QACheckResult[] {
  const results: QACheckResult[] = [];
  const seenEn = new Map<string, number>();
  const seenAr = new Map<string, number>();

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];

    // Normalize English body
    const en = (slide.enBody || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (en.length > 20) {
      if (seenEn.has(en)) {
        const prevIdx = seenEn.get(en)!;
        results.push({
          id: `duplicate-en-body-${i}`,
          severity: 'fail',
          slideIndex: i,
          field: 'enBody',
          message: `Slide ${i + 1} English body is identical to Slide ${prevIdx + 1}. Each slide must have unique copy.`,
          value: slide.enBody?.substring(0, 60),
        });
      } else {
        seenEn.set(en, i);
      }
    }

    // Normalize Arabic body
    const ar = (slide.arBody || '')
      .replace(/[^\u0600-\u06FF\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (ar.length > 20) {
      if (seenAr.has(ar)) {
        const prevIdx = seenAr.get(ar)!;
        results.push({
          id: `duplicate-ar-body-${i}`,
          severity: 'fail',
          slideIndex: i,
          field: 'arBody',
          message: `Slide ${i + 1} Arabic body is identical to Slide ${prevIdx + 1}. Each slide must have unique copy.`,
          value: slide.arBody?.substring(0, 60),
        });
      } else {
        seenAr.set(ar, i);
      }
    }
  }

  return results;
}

/** Check that CTA slide has credit lines when applicable */
function checkCreditPresence(slides: SlideData[]): QACheckResult[] {
  const results: QACheckResult[] = [];
  const ctaSlides = slides.filter((s) => s.type === 'cta');

  for (const cta of ctaSlides) {
    const idx = slides.indexOf(cta);
    if (!cta.enCredit && !cta.arCredit) {
      results.push({
        id: `missing-credit-${idx}`,
        severity: 'warn',
        slideIndex: idx,
        field: 'enCredit',
        message: `CTA slide ${idx + 1} has no source attribution. Add credit lines for third-party content.`,
      });
    }
  }

  return results;
}

/** Check for leftover placeholder text, empty brand fields, or default labels */
function checkPlaceholders(slide: SlideData, idx: number): QACheckResult[] {
  const results: QACheckResult[] = [];
  const placeholderPatterns = [
    /CHANNEL NAME/i,
    /YOUR (?:BRAND|NAME|COMPANY)/i,
    /Lorem ipsum/i,
    /\bTODO\b/i,
    /\bTBD\b/i,
    /PLACEHOLDER/i,
    /\[INSERT/i,
    /XXX/,
    /\bSystem\s+[AB12]\b/i,
    /\bCompany\s+[AB12]\b/i,
    /\bBrand\s+[AB12]\b/i,
    /\bProduct\s+[AB12]\b/i,
    /\bTool\s+[AB12]\b/i,
    /\bPIPELINE\s+MIGRATION\b/i,
    /\bDATASTREAM\s+MIGRATION\b/i,
  ];

  const textFields: (keyof SlideData)[] = ['enTitle', 'arTitle', 'enBody', 'arBody', 'enCredit', 'arCredit', 'ctaText'];

  for (const field of textFields) {
    const text = slide[field];
    if (typeof text !== 'string') continue;

    for (const pattern of placeholderPatterns) {
      if (pattern.test(text)) {
        results.push({
          id: `placeholder-${idx}-${field}`,
          severity: 'fail',
          slideIndex: idx,
          field,
          message: `Slide ${idx + 1} ${field} contains placeholder text: "${text.substring(0, 40)}..."`,
        });
        break;
      }
    }
  }

  // Strict check for Subject Pair empty or placeholder brand fields / default labels
  if (slide.type === 'subjectPair' || slide.subjectPair) {
    const pair = slide.subjectPair;
    if (
      !pair ||
      isPlaceholderOrEmptyBrandValue(pair.beforeSystem) ||
      isPlaceholderOrEmptyBrandValue(pair.afterSystem)
    ) {
      results.push({
        id: `placeholder-${idx}-subjectPair-brands`,
        severity: 'fail',
        slideIndex: idx,
        field: 'subjectPair',
        message: `Slide ${idx + 1}: Subject Pair has empty or placeholder system names ("${pair?.beforeSystem || ''}" / "${pair?.afterSystem || ''}"). Extract two real system names from the source or switch layout.`,
      });
    }
    if (pair?.flowLabel && isPlaceholderOrEmptyBrandValue(pair.flowLabel)) {
      results.push({
        id: `placeholder-${idx}-subjectPair-flowLabel`,
        severity: 'fail',
        slideIndex: idx,
        field: 'subjectPair',
        message: `Slide ${idx + 1}: Subject Pair flow label contains default placeholder text ("${pair.flowLabel}").`,
      });
    }
    if (pair?.storyOwner && isPlaceholderOrEmptyBrandValue(pair.storyOwner)) {
      results.push({
        id: `placeholder-${idx}-subjectPair-storyOwner`,
        severity: 'fail',
        slideIndex: idx,
        field: 'subjectPair',
        message: `Slide ${idx + 1}: Subject Pair story owner contains placeholder text ("${pair.storyOwner}").`,
      });
    }
  }

  // Strict check for Compare empty or placeholder column labels
  if (slide.type === 'compare') {
    if (
      isPlaceholderOrEmptyBrandValue(slide.compareLeftTitle) ||
      isPlaceholderOrEmptyBrandValue(slide.compareRightTitle)
    ) {
      results.push({
        id: `placeholder-${idx}-compare-titles`,
        severity: 'fail',
        slideIndex: idx,
        field: 'compareLeftTitle',
        message: `Slide ${idx + 1}: Compare layout has empty or placeholder column titles ("${slide.compareLeftTitle || ''}" / "${slide.compareRightTitle || ''}").`,
      });
    }
  }

  // Strict check for Diagram Nodes containing placeholder text
  if (Array.isArray(slide.diagramNodes)) {
    for (const node of slide.diagramNodes) {
      if (isPlaceholderOrEmptyBrandValue(node.label)) {
        results.push({
          id: `placeholder-${idx}-diagramNodes`,
          severity: 'fail',
          slideIndex: idx,
          field: 'diagramNodes',
          message: `Slide ${idx + 1}: Diagram node contains empty or placeholder label ("${node.label || ''}").`,
        });
        break;
      }
    }
  }

  return results;
}

/** Check first slide (hook/hub) has meaningful content for thumbnail readability */
function checkFirstFrame(slides: SlideData[], isSingleSlide: boolean = false): QACheckResult[] {
  const results: QACheckResult[] = [];
  if (slides.length === 0) return results;

  const first = slides[0];
  const validCoverTypes: SlideData['type'][] = [
    'hub',
    'row',
    'metric',
    'compare',
    'subjectPair',
    'code',
    'number',
    'poster',
    'image',
    'visual',
  ];
  if (!isSingleSlide && !validCoverTypes.includes(first.type)) {
    results.push({
      id: 'first-frame-type',
      severity: 'warn',
      slideIndex: 0,
      message: `Slide 1 type is "${first.type}" — use a visual cover archetype (hub, metric, compare, subjectPair, visual, or row) for best thumbnail impact.`,
    });
  }

  const isCaptionlessMeme = Boolean(first.imageUrl) || first.imageFrameMode === 'full';
  if ((!first.enTitle || first.enTitle.length < 3) && !isCaptionlessMeme) {
    results.push({
      id: 'first-frame-title',
      severity: 'fail',
      slideIndex: 0,
      field: 'enTitle',
      message: 'Slide 1 has no English headline. The cover must be readable at thumbnail size.',
    });
  }

  return results;
}

/** Check that the last slide is a CTA */
function checkLastSlideCta(slides: SlideData[], isSingleSlide: boolean = false): QACheckResult {
  if (slides.length === 0) {
    return { id: 'last-slide-cta', severity: 'fail', message: 'No slides in deck.' };
  }
  if (isSingleSlide && slides.length === 1) {
    return {
      id: 'last-slide-cta',
      severity: 'pass',
      message: 'Single-slide post carries standalone footer attribution.',
    };
  }
  const last = slides[slides.length - 1];
  if (last.type !== 'cta') {
    return {
      id: 'last-slide-cta',
      severity: 'warn',
      slideIndex: slides.length - 1,
      message: `Last slide type is "${last.type}" — should be "cta" for engagement.`,
    };
  }
  return { id: 'last-slide-cta', severity: 'pass', message: 'Last slide is CTA.' };
}

/** Check for raw markdown syntax in slide fields */
function checkMarkdownAndPunctuation(slide: SlideData, idx: number): QACheckResult[] {
  const results: QACheckResult[] = [];
  const textFields: (keyof SlideData)[] = ['enTitle', 'arTitle', 'enBody', 'arBody'];

  for (const field of textFields) {
    const text = slide[field];
    if (typeof text !== 'string' || !text) continue;

    if (/(?:^|\s)#+(?=\s|[a-zA-Z0-9\u0600-\u06FF])/.test(text)) {
      results.push({
        id: `raw-markdown-hash-${idx}-${field}`,
        severity: 'warn',
        slideIndex: idx,
        field,
        message: `Slide ${idx + 1} ${field} has raw markdown '#' symbols. Remove '#' for clean canvas typography.`,
      });
    }

    if (/\s+\./.test(text) || /\.{2,}/.test(text) || /\.:/.test(text)) {
      results.push({
        id: `broken-punctuation-${idx}-${field}`,
        severity: 'warn',
        slideIndex: idx,
        field,
        message: `Slide ${idx + 1} ${field} has broken punctuation (e.g. ' .', '..', or '.:'). Clean up punctuation.`,
      });
    }

    if (/\bshady\s+ai\b/i.test(text)) {
      results.push({
        id: `non-standard-term-shady-ai-${idx}-${field}`,
        severity: 'warn',
        slideIndex: idx,
        field,
        message: `Slide ${idx + 1} ${field} uses "Shady AI", which is not a standard industry term ("Shadow AI" is). Verify the source claim before posting.`,
      });
    }
  }

  return results;
}

/**
 * Validate archetype-specific fields (codeLanguage, diff prefixes, metric diff polarity, compare titles, cta)
 */
function checkArchetypeFields(slide: SlideData, idx: number): QACheckResult[] {
  const results: QACheckResult[] = [];

  if (slide.type === 'code') {
    if (!slide.codeSnippet || slide.codeSnippet.trim().length === 0) {
      results.push({
        id: `archetype-code-missing-snippet-${idx}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'codeSnippet',
        message: `Slide ${idx + 1} (code archetype) is missing a codeSnippet.`,
      });
    } else {
      const lines = slide.codeSnippet.split('\n');
      if (lines.length > 7) {
        results.push({
          id: `archetype-code-lines-${idx}`,
          severity: 'warn',
          slideIndex: idx,
          field: 'codeSnippet',
          message: `Slide ${idx + 1} code snippet has ${lines.length} lines (recommended: max 7 for canvas window).`,
          value: lines.length,
          limit: '≤ 7 lines',
        });
      }

      // Check for terminal diff highlighting prefixes ($, +, -, ✔, >, #)
      const hasDiffPrefixes = lines.some((l) => /^[+$>\-✔#]/.test(l.trim()));
      if (!hasDiffPrefixes) {
        results.push({
          id: `archetype-code-prefixes-${idx}`,
          severity: 'warn',
          slideIndex: idx,
          field: 'codeSnippet',
          message: `Slide ${idx + 1} code lines lack diff prefixes ($, +, -, ✔) for terminal syntax highlighting.`,
        });
      }
    }

    if (!slide.codeLanguage || slide.codeLanguage.trim().length === 0) {
      results.push({
        id: `archetype-code-language-${idx}`,
        severity: 'warn',
        slideIndex: idx,
        field: 'codeLanguage',
        message: `Slide ${idx + 1} (code archetype) has no codeLanguage badge specified (e.g. BASH, TS, RUST, YAML).`,
      });
    }
  } else if (slide.type === 'metric') {
    const hasHookClaimCard = Boolean(slide.hookClaimCard?.statement);
    if (!hasHookClaimCard) {
      if (!slide.metricValue || slide.metricValue.trim().length === 0) {
        results.push({
          id: `archetype-metric-missing-value-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'metricValue',
          message: `Slide ${idx + 1} (metric archetype) has no metricValue.`,
        });
      }

      if (!slide.metricDiff || slide.metricDiff.trim().length === 0) {
        results.push({
          id: `archetype-metric-missing-diff-${idx}`,
          severity: 'warn',
          slideIndex: idx,
          field: 'metricDiff',
          message: `Slide ${idx + 1} (metric archetype) is missing a metricDiff comparison badge.`,
        });
      } else {
        // Confirm polarity indicator exists (▲, ▼, +, -)
        const hasPolarity = /[▲▼+\-]/.test(slide.metricDiff);
        if (!hasPolarity) {
          results.push({
            id: `archetype-metric-polarity-${idx}`,
            severity: 'warn',
            slideIndex: idx,
            field: 'metricDiff',
            message: `Slide ${idx + 1} metricDiff ("${slide.metricDiff}") lacks a polarity indicator (▲ or ▼).`,
          });
        }
      }
    }
  } else if (slide.type === 'compare') {
    if (!slide.compareLeftTitle || !slide.compareRightTitle) {
      results.push({
        id: `archetype-compare-titles-${idx}`,
        severity: 'warn',
        slideIndex: idx,
        field: 'compareLeftTitle',
        message: `Slide ${idx + 1} (compare archetype) is missing left or right comparison column titles.`,
      });
    }
  } else if (slide.type === 'cta') {
    if (!slide.ctaText || slide.ctaText.trim().length === 0) {
      results.push({
        id: `archetype-cta-missing-text-${idx}`,
        severity: 'warn',
        slideIndex: idx,
        field: 'ctaText',
        message: `Slide ${idx + 1} (CTA archetype) has no action button text.`,
      });
    }
  } else if (slide.type === 'subjectPair') {
    const pair = slide.subjectPair;
    if (!pair || (!pair.beforeSystem && !pair.afterSystem)) {
      results.push({
        id: `archetype-subjectpair-missing-systems-${idx}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'subjectPair',
        message: `Slide ${idx + 1} (subjectPair archetype) must specify before and after systems.`,
      });
    } else {
      if ((pair.logoWidthPct ?? 11) > 14) {
        results.push({
          id: `archetype-subjectpair-logo-size-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'subjectPair.logoWidthPct',
          message: `Slide ${idx + 1}: Subject Pair logo width (${pair.logoWidthPct}%) exceeds 14% max limit.`,
          value: `${pair.logoWidthPct}%`,
          limit: '≤ 14%',
        });
      }
      let logoCount = 0;
      if (!pair.beforeAsText && pair.beforeLogoKey) logoCount++;
      if (!pair.afterAsText && pair.afterLogoKey) logoCount++;
      if (logoCount > 2) {
        results.push({
          id: `archetype-subjectpair-logo-count-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'subjectPair',
          message: `Slide ${idx + 1}: Subject Pair has ${logoCount} logos (max 2 logos allowed).`,
          value: logoCount,
          limit: '≤ 2 logos',
        });
      }
      if (pair.isEdited || pair.isNonLibrarySource) {
        results.push({
          id: `archetype-subjectpair-edited-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'subjectPair',
          message: `Slide ${idx + 1}: Edited or non-library logo detected in Subject Pair. Use unedited bundled SVG or text name.`,
        });
      }
      if (pair.isMerged || pair.isOverlapping) {
        results.push({
          id: `archetype-subjectpair-merged-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'subjectPair',
          message: `Slide ${idx + 1}: Logos cannot be merged, blended, overlapped, or combined.`,
        });
      }
      if (pair.usesMascot) {
        results.push({
          id: `archetype-subjectpair-mascot-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'subjectPair',
          message: `Slide ${idx + 1}: Mascots are disallowed. Use official mark or styled text name.`,
        });
      }
    }
  } else if (slide.type === 'visual') {
    const spec = slide.visualSpec;
    if (!spec || !spec.kind) {
      results.push({
        id: `archetype-visual-missing-spec-${idx}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'visualSpec',
        message: `Slide ${idx + 1} (visual archetype) is missing a visualSpec configuration.`,
      });
    } else if (spec.kind === 'bar-chart') {
      if (!spec.bars || spec.bars.length === 0) {
        results.push({
          id: `archetype-visual-bars-empty-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} (bar-chart visual) needs at least 1 data bar.`,
        });
      }
    } else if (spec.kind === 'sequence') {
      if (!spec.actors || spec.actors.length < 2 || !spec.steps || spec.steps.length === 0) {
        results.push({
          id: `archetype-visual-sequence-incomplete-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} (sequence visual) requires at least 2 actors and 1 step.`,
        });
      }
    } else if (spec.kind === 'timeline') {
      if (!spec.events || spec.events.length < 2) {
        results.push({
          id: `archetype-visual-timeline-incomplete-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} (timeline visual) requires at least 2 chronological events.`,
        });
      }
    } else if (spec.kind === 'matrix') {
      if (!spec.quadrants || spec.quadrants.length < 2) {
        results.push({
          id: `archetype-visual-matrix-incomplete-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} (matrix visual) requires at least 2 populated quadrants.`,
        });
      }
    } else if (spec.kind === 'table') {
      if (!spec.columns || spec.columns.length < 2 || !spec.rows || spec.rows.length === 0) {
        results.push({
          id: `archetype-visual-table-incomplete-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} (table visual) requires at least 2 columns and 1 data row.`,
        });
      }
    } else if (spec.kind === 'callout') {
      if (!spec.quote?.trim() && !spec.statValue?.trim()) {
        results.push({
          id: `archetype-visual-callout-empty-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} (callout visual) needs a quote statement or hero stat value.`,
        });
      }
    } else if (spec.kind === 'svg') {
      const sanitized = sanitizeSvgBlueprintMarkup(spec.svgCode || '', spec.viewBox);
      if (!sanitized.isValid) {
        results.push({
          id: `archetype-visual-svg-invalid-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} (custom SVG visual) has empty or invalid SVG markup.`,
        });
      } else if (sanitized.warnings.length > 0) {
        results.push({
          id: `archetype-visual-svg-sanitized-${idx}`,
          severity: 'warn',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} custom SVG had unsafe elements/attributes stripped during sanitization: ${sanitized.warnings[0]}`,
        });
      }
    }
  }

  return results;
}

/**
 * Check Arabic RTL text safe-zone bounds (right margin clearance >= 135px and vertical boundary y <= 1760)
 */
function checkArabicSafeZone(slide: SlideData, idx: number, spec = getCanvasDimensionSpec()): QACheckResult[] {
  const results: QACheckResult[] = [];
  const scaleFactor = spec.height / 1920;
  const ceiling = spec.safeFooterCeilingY;

  if (slide.arBody) {
    const lines = slide.arBody.split('\n');
    const maxRecommendedLines = spec.height <= 1080 ? 3 : 4;
    if (lines.length > maxRecommendedLines) {
      results.push({
        id: `arabic-safezone-lines-${idx}`,
        severity: 'warn',
        slideIndex: idx,
        field: 'arBody',
        message: `Slide ${idx + 1} Arabic body has ${lines.length} lines (max ${maxRecommendedLines} recommended to clear fixed footer ceiling y=${ceiling}).`,
        value: lines.length,
        limit: `≤ ${maxRecommendedLines} lines`,
      });
    }

    // Check for overly long unbroken words/tokens in Arabic body that could clip on the right
    const words = slide.arBody.split(/\s+/);
    for (const w of words) {
      if (w.length > 35) {
        results.push({
          id: `arabic-safezone-word-length-${idx}`,
          severity: 'warn',
          slideIndex: idx,
          field: 'arBody',
          message: `Slide ${idx + 1} Arabic body contains an unbroken string of ${w.length} chars ("${w.slice(0, 15)}..."), which may overflow the right safe-zone margin.`,
        });
        break;
      }
    }
    // Check for explicit vertical offset pushing text below active preset footer ceiling
    const arDy = slide.layoutOverrides?.arabicBodyBlock?.dy ?? 0;
    const enDy = slide.layoutOverrides?.bodyBlock?.dy ?? 0;
    const maxArDy = Math.round(120 * scaleFactor);
    const maxEnDy = Math.round(160 * scaleFactor);
    if (arDy > maxArDy || enDy > maxEnDy) {
      results.push({
        id: `vertical-overflow-${idx}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'layoutOverrides',
        message: `Slide ${idx + 1} vertical offset pushes text past the y=${ceiling} footer ceiling (${spec.shortLabel}).`,
        value: Math.max(arDy, enDy),
        limit: `y ≤ ${ceiling}`,
      });
    }
  }

  return results;
}

/**
 * Check if key text or diagram elements violate active preset safe zones (scaled proportionally from 9:16 to 4:5 and 1:1).
 */
function checkTikTokSafeZoneViolations(slide: SlideData, idx: number, spec = getCanvasDimensionSpec()): QACheckResult[] {
  const results: QACheckResult[] = [];
  const overrides = slide.layoutOverrides;
  if (!overrides) return results;

  const hScale = spec.height / 1920;
  const wScale = (spec.safeContentWidth || 846) / 846;

  const headerDy = overrides.headerBadge?.dy ?? 0;
  const graphicDy = overrides.graphicCard?.dy ?? 0;
  const titleDy = overrides.titleBlock?.dy ?? 0;
  const arTitleDy = overrides.arabicTitleBlock?.dy ?? 0;
  const bodyDy = overrides.bodyBlock?.dy ?? 0;
  const arBodyDy = overrides.arabicBodyBlock?.dy ?? 0;

  if (
    headerDy < Math.round(-35 * hScale) ||
    graphicDy < Math.round(-75 * hScale) ||
    titleDy < Math.round(-140 * hScale)
  ) {
    results.push({
      id: `tiktok-safezone-top-${idx}`,
      severity: 'fail',
      slideIndex: idx,
      field: 'layoutOverrides',
      message: `Slide ${idx + 1}: Key element sits inside the top UI safe margin (${spec.shortLabel}). Auto-fix to restore top clearance.`,
    });
  }

  if (
    bodyDy > Math.round(75 * hScale) ||
    arBodyDy > Math.round(55 * hScale) ||
    graphicDy > Math.round(140 * hScale) ||
    titleDy > Math.round(110 * hScale) ||
    arTitleDy > Math.round(95 * hScale)
  ) {
    results.push({
      id: `tiktok-safezone-bottom-${idx}`,
      severity: 'fail',
      slideIndex: idx,
      field: 'layoutOverrides',
      message: `Slide ${idx + 1}: Key text or diagram sits past the bottom footer safe ceiling (y=${spec.safeFooterCeilingY}, ${spec.shortLabel}).`,
    });
  }

  const maxRightDx = Math.round(65 * wScale);
  for (const [elKey, ov] of Object.entries(overrides)) {
    if (ov && !ov.hidden && (ov.dx ?? 0) > maxRightDx) {
      results.push({
        id: `tiktok-safezone-right-${idx}-${elKey}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'layoutOverrides',
        message: `Slide ${idx + 1}: Element "${elKey}" sits past the right safe-zone margin (dx=+${ov.dx}px, limit=${maxRightDx}px).`,
      });
      break;
    }
  }

  return results;
}

/**
 * Check for truncated descriptions ending with trailing "and...", "or...", "with...", or any ellipsis "…" / "..."
 */
function checkTruncatedDescriptions(slide: SlideData, idx: number): QACheckResult[] {
  const results: QACheckResult[] = [];
  const fields: Array<{ key: 'enTitle' | 'arTitle' | 'enBody' | 'arBody'; label: string }> = [
    { key: 'enTitle', label: 'EN title' },
    { key: 'arTitle', label: 'AR title' },
    { key: 'enBody', label: 'EN body' },
    { key: 'arBody', label: 'AR body' },
  ];

  for (const { key, label } of fields) {
    const val = (slide[key] || '').trim();
    if (!val) continue;
    if (
      /\b(?:and|or|with|to|for|in|of|by)\s*(?:\.{2,}|…)\s*$/i.test(val) ||
      /,\s*(?:and|or)?\s*(?:\.{2,}|…)\s*$/i.test(val) ||
      /(?:\.{3}|…)\s*$/.test(val)
    ) {
      results.push({
        id: `truncated-description-${idx}-${key}`,
        severity: 'fail',
        slideIndex: idx,
        field: key,
        message: `Slide ${idx + 1} ${label}: Truncated text ("${val.slice(-24)}") detected. Never end a line with "…".`,
        value: val,
      });
    }
  }

  return results;
}

/**
 * Check minimum font sizes across ALL aspect ratios (9:16, 3:4, 4:5, 1:1):
 * - Title & body text must be >= 24px (MIN_TITLE_FONT_SIZE / MIN_BODY_FONT_SIZE)
 * - Footer text/badge must be >= 22px (MIN_FOOTER_FONT_SIZE)
 */
function checkMinFontSizeViolation(
  slide: SlideData,
  idx: number,
  spec: CanvasDimensionSpec,
  carousel: CarouselData
): QACheckResult[] {
  const results: QACheckResult[] = [];
  const overrides = slide.layoutOverrides;

  if (overrides) {
    for (const [elKey, ov] of Object.entries(overrides)) {
      if (!ov || ov.hidden || ov.scale === undefined) continue;
      const isTextEl =
        elKey === 'titleBlock' ||
        elKey === 'arabicTitleBlock' ||
        elKey === 'bodyBlock' ||
        elKey === 'arabicBodyBlock';
      const isCompact = spec.height < 1920;
      const baseNominalFont =
        elKey === 'titleBlock' || elKey === 'arabicTitleBlock'
          ? isCompact
            ? 62
            : 72
          : isCompact
          ? spec.height <= 1080
            ? 34
            : 38
          : 44;
      const scaledNominalFont = Math.round(baseNominalFont * ov.scale);
      if (ov.scale < 0.75 || (isTextEl && scaledNominalFont < MIN_BODY_FONT_SIZE)) {
        results.push({
          id: `min-font-size-${idx}-${elKey}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'layoutOverrides',
          message: `Slide ${idx + 1}: "${elKey}" scale (${Math.round(ov.scale * 100)}%) shrinks text below the ${MIN_BODY_FONT_SIZE}px minimum on ${spec.shortLabel}.`,
          value: isTextEl ? `${scaledNominalFont}px` : `${Math.round(ov.scale * 100)}%`,
          limit: `≥ ${MIN_BODY_FONT_SIZE}px`,
        });
      }
    }
  }

  // Verify resolved layout awareness typography sizes strictly meet the >=24px floor on this aspect ratio
  if (!(slide.standaloneMeme || slide.imageFrameMode === 'full')) {
    const layout = computeSlideLayoutAwareness(slide, carousel, idx);
    const textBlocks: Array<{
      key: string;
      minPx: number;
      block: typeof layout.titleBlock;
    }> = [
      { key: 'titleBlock', minPx: MIN_TITLE_FONT_SIZE, block: layout.titleBlock },
      { key: 'arabicTitleBlock', minPx: MIN_TITLE_FONT_SIZE, block: layout.arabicTitleBlock },
      { key: 'coverTeaserBlock', minPx: MIN_BODY_FONT_SIZE, block: layout.coverTeaserBlock },
      { key: 'arabicCoverTeaserBlock', minPx: MIN_BODY_FONT_SIZE, block: layout.arabicCoverTeaserBlock },
      { key: 'bodyBlock', minPx: MIN_BODY_FONT_SIZE, block: layout.bodyBlock },
      { key: 'arabicBodyBlock', minPx: MIN_BODY_FONT_SIZE, block: layout.arabicBodyBlock },
    ];
    for (const { key, minPx, block } of textBlocks) {
      if (block && !block.hidden && block.lines.length > 0 && block.fontSize < minPx) {
        results.push({
          id: `min-font-size-${idx}-${key}-computed`,
          severity: 'fail',
          slideIndex: idx,
          field: key,
          message: `Slide ${idx + 1}: "${key}" resolved to ${block.fontSize}px on ${spec.shortLabel} (minimum ${minPx}px required across all ratios).`,
          value: `${block.fontSize}px`,
          limit: `≥ ${minPx}px`,
        });
      }
    }
  }

  return results;
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = (hex || '#000000').replace(/[^0-9a-fA-F]/g, '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  const padded = clean.padEnd(6, '0').slice(0, 6);
  return [
    parseInt(padded.slice(0, 2), 16),
    parseInt(padded.slice(2, 4), 16),
    parseInt(padded.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function computeWcagContrastRatio(fgHex: string, bgHex: string): number {
  const lumA = relativeLuminance(parseHexRgb(fgHex));
  const lumB = relativeLuminance(parseHexRgb(bgHex));
  const brightest = Math.max(lumA, lumB);
  const darkest = Math.min(lumA, lumB);
  return Number(((brightest + 0.05) / (darkest + 0.05)).toFixed(2));
}

export type PreExportCheckId =
  | 'contentQuality'
  | 'overflow'
  | 'contrast'
  | 'minFontSize'
  | 'safeZones'
  | 'truncatedCopy'
  | 'bilingualConsistency'
  | 'duplicateLabels'
  | 'chartDirection'
  | 'unverifiedNumbers'
  | 'missingSource'
  | 'brandLogoSafety';

export interface PreExportCheckItem {
  id: PreExportCheckId;
  label: string;
  passed: boolean;
  detail: string;
  fixLabel: string;
  slideIndex?: number;
}

const MEANINGLESS_LABEL_PATTERN =
  /\b(?:EXPOSURE\s+METRIC|DROPPING\s+EXPOSURE|NODE\s*0[1-9]|SYS_REF|TECHNICAL|STORES\s+TRILLIONS|PLACEHOLDER|SAMPLE\s+METRIC)\b/i;

const DROP_MESSAGE_PATTERN =
  /\b(?:drop(?:ping|ped|s)?|slashed|cut(?:ting)?|reduc(?:ed|ing|tion)|lower(?:ed|ing)?|fell|down\s+from|from\s+\d+\s*(?:ms|s|%)\s+to\s+\d+)\b/i;

const PARTNERSHIP_CLAIM_PATTERN =
  /\b(?:official\s+partner|powered\s+by|in\s+collaboration\s+with|endorsed\s+by|sponsored\s+by)\b/i;

export function runPreExportChecklist(
  carousel: CarouselData,
  theme?: ThemePalette
): PreExportCheckItem[] {
  const qa = runQAChecks(carousel);
  const slides = carousel.slides || [];

  // 1. Text Overflow
  const overflowFailure = qa.results.find(
    (r) =>
      r.severity === 'fail' &&
      (r.id.startsWith('char-limit-') ||
        r.id.startsWith('vertical-overflow-') ||
        r.id.startsWith('headline-length-'))
  );

  // 2. Contrast (WCAG AA >= 4.5:1)
  const bgHex = theme?.baseBg || '#070c10';
  const bodyHex = theme?.textEnBody || '#cbd5e1';
  const titleHex = theme?.textWhite || '#f8fafc';
  const accentHex = theme?.accent || '#2dd4bf';
  const bodyContrast = computeWcagContrastRatio(bodyHex, bgHex);
  const titleContrast = computeWcagContrastRatio(titleHex, bgHex);
  const accentContrast = computeWcagContrastRatio(accentHex, bgHex);
  const minContrast = Math.min(bodyContrast, titleContrast);
  const contrastPassed = minContrast >= 4.5 && accentContrast >= 3.0;

  // 3. Minimum Font Size (>= 24px at 1080x1920)
  const minFontFailure = qa.results.find(
    (r) => r.severity === 'fail' && r.id.startsWith('min-font-size-')
  );

  // 4. TikTok Safe Zones (top ~150px, bottom ~420px, right ~120px)
  const safeZoneFailure = qa.results.find(
    (r) =>
      r.severity === 'fail' &&
      (r.id.startsWith('tiktok-safezone-') || r.id.startsWith('vertical-overflow-'))
  );

  // 5. Truncated Descriptions ("and…")
  const truncatedFailure = qa.results.find(
    (r) => r.severity === 'fail' && r.id.startsWith('truncated-description-')
  );

  // 6. Arabic / English Consistency & BiDi
  let bilingualIssueSlide: number | undefined;
  let bilingualDetail = 'EN & AR copy paired with equal weight & BiDi isolation';
  const bidiFailure = qa.results.find(
    (r) =>
      r.severity === 'fail' &&
      (r.id.startsWith('arabic-bidi-') || r.id.startsWith('arabic-line-end-'))
  );
  if (bidiFailure) {
    bilingualIssueSlide = bidiFailure.slideIndex;
    bilingualDetail = bidiFailure.message;
  } else {
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      if (s.standaloneMeme || s.imageFrameMode === 'full') continue;
      const hasEnTitle = Boolean((s.enTitle || '').trim());
      const hasArTitle = Boolean((s.arTitle || '').trim());
      const hasEnBody = Boolean((s.enBody || '').trim());
      const hasArBody = Boolean((s.arBody || '').trim());
      if ((hasEnTitle && !hasArTitle) || (!hasEnTitle && hasArTitle)) {
        bilingualIssueSlide = i;
        bilingualDetail = `Slide ${i + 1} is missing ${hasEnTitle ? 'Arabic' : 'English'} headline`;
        break;
      }
      // Slide 1 Hook never shows body text on multi-slide decks
      const isSlide1Hook = i === 0 && slides.length > 1;
      if (!isSlide1Hook && s.type !== 'cta' && ((hasEnBody && !hasArBody) || (!hasEnBody && hasArBody))) {
        bilingualIssueSlide = i;
        bilingualDetail = `Slide ${i + 1} is missing ${hasEnBody ? 'Arabic' : 'English'} body copy`;
        break;
      }
    }
  }

  // 7. Distinct Diagram & Metric Labels (No duplicates or meaningless filler labels)
  let duplicateLabelSlide: number | undefined;
  let duplicateLabelDetail = 'All diagram nodes & metric labels are distinct source terms';
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    if (MEANINGLESS_LABEL_PATTERN.test(`${s.metricLabel || ''} ${s.metricDiff || ''}`)) {
      duplicateLabelSlide = i;
      duplicateLabelDetail = `Slide ${i + 1}: Meaningless metric label ("${s.metricLabel || s.metricDiff}"). Use real source terms.`;
      break;
    }
    const labels: string[] = [];
    if (s.type === 'hub' && s.satLabels && s.satLabels.length > 0) {
      labels.push(...s.satLabels);
    } else if (s.diagramNodes && s.diagramNodes.length > 0) {
      labels.push(...s.diagramNodes.map((n) => n.label));
    } else if (s.icons && s.icons.length > 0) {
      labels.push(...s.icons.map((ic) => ic.label));
    }
    const normalized = labels.map((l) => (l || '').trim().toUpperCase()).filter(Boolean);
    const unique = new Set(normalized);
    if (normalized.length > 0 && unique.size < normalized.length) {
      duplicateLabelSlide = i;
      duplicateLabelDetail = `Slide ${i + 1}: Duplicate node labels detected (${normalized.join(' / ')}). Need distinct labels.`;
      break;
    }
    if (normalized.some((l) => MEANINGLESS_LABEL_PATTERN.test(l))) {
      duplicateLabelSlide = i;
      duplicateLabelDetail = `Slide ${i + 1}: Generic filler node label detected. Replace with distinct content terms.`;
      break;
    }
  }

  // 8. Chart Direction vs Message (a "drop" must visibly go down, and focal metric must be the "after" win)
  let chartMismatchSlide: number | undefined;
  let chartMismatchDetail = 'Chart direction & after-value win match slide message';
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    if (s.type !== 'metric') continue;
    const text = `${s.enTitle || ''} ${s.enBody || ''} ${s.metricDiff || ''}`;
    const isDrop = DROP_MESSAGE_PATTERN.test(text);
    // Check if text has "from X to Y" where X is shown instead of Y
    const fromToMatch = `${s.enTitle || ''} ${s.enBody || ''}`.match(
      /\bfrom\s+(\d+(?:\.\d+)?\s*(?:ms|s|%|x|gb|mb|tb|nodes)?)\s+to\s+(\d+(?:\.\d+)?\s*(?:ms|s|%|x|gb|mb|tb|nodes)?)\b/i
    );
    if (
      fromToMatch &&
      s.metricValue &&
      s.metricValue.trim().toLowerCase() === fromToMatch[1].trim().toLowerCase() &&
      fromToMatch[1].trim().toLowerCase() !== fromToMatch[2].trim().toLowerCase()
    ) {
      chartMismatchSlide = i;
      chartMismatchDetail = `Slide ${i + 1}: Shows "before" value (${fromToMatch[1]}) instead of the "after" win (${fromToMatch[2]}).`;
      break;
    }
    if (isDrop && s.chartDirection === 'up') {
      chartMismatchSlide = i;
      chartMismatchDetail = `Slide ${i + 1}: Message describes a drop/reduction, but chart slopes upward.`;
      break;
    }
  }

  // 9. Verify Numbers Against Source
  let unverifiedNumSlide: number | undefined;
  let unverifiedNumDetail = 'All slide numbers confirmed against source';
  const deckNumbersVerified =
    Boolean(carousel.sourceMeta?.verifiedNumbers) ||
    Boolean(carousel.sourceMeta?.userReviewed) ||
    Boolean(carousel.sourceMeta?.humanApproved) ||
    carousel.sourceMeta?.status === 'verified_live';
  if (!deckNumbersVerified) {
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      if (s.numbersVerified) continue;
      const hasNumber = /\b\d+(?:\.\d+)?\s*(?:%|x|ms|s|gb|tb|mb|k|m|b|nodes|checkouts)\b/i.test(
        `${s.metricValue || ''} ${s.enTitle || ''} ${s.enBody || ''}`
      );
      if (hasNumber) {
        unverifiedNumSlide = i;
        unverifiedNumDetail = `Slide ${i + 1} contains numeric claims — verify against source to unlock export`;
        break;
      }
    }
  }

  // 10. Source Attribution Present ("Source: <name>")
  const sourceName = (
    carousel.sourceMeta?.creator ||
    carousel.sourceMeta?.channel ||
    carousel.channel ||
    slides[slides.length - 1]?.enCredit ||
    ''
  ).trim();
  const hasAnySourceAttribution = Boolean(sourceName);

  // 11. Brand Assets & IP Safety (<=8% slide width, never hero/center, max 1 per slide, no partnership wording)
  let brandSafetySlide: number | undefined;
  let brandSafetyDetail = 'Third-party companies shown safely (styled text or locked ≤8% badge, no endorsement claims)';
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const combinedText = `${s.enTitle || ''} ${s.enBody || ''} ${s.arTitle || ''} ${s.arBody || ''}`;
    if (PARTNERSHIP_CLAIM_PATTERN.test(combinedText)) {
      brandSafetySlide = i;
      brandSafetyDetail = `Slide ${i + 1}: Contains implied partnership wording ("official", "powered by", "in collaboration with").`;
      break;
    }
    const cfg = s.brandLogoConfig;
    if (cfg && cfg.mode === 'official_icon') {
      if ((cfg.maxWidthPct ?? 8) > 8) {
        brandSafetySlide = i;
        brandSafetyDetail = `Slide ${i + 1}: Brand icon exceeds 8% max slide width (${cfg.maxWidthPct}%).`;
        break;
      }
      if (cfg.placement === 'hero' || cfg.placement === 'center') {
        brandSafetySlide = i;
        brandSafetyDetail = `Slide ${i + 1}: Brand logo cannot be the hero focal point or center of a diagram.`;
        break;
      }
      if ((cfg.countOnSlide ?? 1) > 1) {
        brandSafetySlide = i;
        brandSafetyDetail = `Slide ${i + 1}: More than 1 third-party brand icon on slide.`;
        break;
      }
      if (cfg.isEdited || cfg.isNonLibrarySource) {
        brandSafetySlide = i;
        brandSafetyDetail = `Slide ${i + 1}: Edited or non-library logo detected. Use official Simple Icons SVG or text name.`;
        break;
      }
    }
    const pair = s.subjectPair;
    if (s.type === 'subjectPair' || pair) {
      if (
        !pair ||
        isPlaceholderOrEmptyBrandValue(pair.beforeSystem) ||
        isPlaceholderOrEmptyBrandValue(pair.afterSystem)
      ) {
        brandSafetySlide = i;
        brandSafetyDetail = `Slide ${i + 1}: Subject Pair has empty or placeholder system names ("${pair?.beforeSystem || ''}" / "${pair?.afterSystem || ''}").`;
        break;
      }
      if (pair.flowLabel && isPlaceholderOrEmptyBrandValue(pair.flowLabel)) {
        brandSafetySlide = i;
        brandSafetyDetail = `Slide ${i + 1}: Subject Pair flow label contains default placeholder text ("${pair.flowLabel}").`;
        break;
      }
      if ((pair.logoWidthPct ?? 11) > 14) {
        brandSafetySlide = i;
        brandSafetyDetail = `Slide ${i + 1}: Subject Pair logo exceeds 14% max slide width (${pair.logoWidthPct}% > 14%).`;
        break;
      }
      let logoCount = 0;
      if (!pair.beforeAsText && pair.beforeLogoKey) logoCount++;
      if (!pair.afterAsText && pair.afterLogoKey) logoCount++;
      if (logoCount > 2) {
        brandSafetySlide = i;
        brandSafetyDetail = `Slide ${i + 1}: Subject Pair exceeds 2-logo limit (${logoCount} > 2).`;
        break;
      }
      if (pair.isEdited || pair.isNonLibrarySource) {
        brandSafetySlide = i;
        brandSafetyDetail = `Slide ${i + 1}: Edited or non-library logo detected in Subject Pair. Use official bundled SVG or text name.`;
        break;
      }
      if (pair.isMerged || pair.isOverlapping) {
        brandSafetySlide = i;
        brandSafetyDetail = `Slide ${i + 1}: Logos cannot be merged, blended, overlapped, or combined.`;
        break;
      }
      if (pair.usesMascot) {
        brandSafetySlide = i;
        brandSafetyDetail = `Slide ${i + 1}: Mascots are disallowed. Use official mark or styled text name.`;
        break;
      }
    }
  }

  // 0. Content Quality & Originality (clichés, topic echoes, filler labels, placeholders, Arabic literal templates)
  const contentQualityFailure = qa.results.find(
    (r) =>
      r.severity === 'fail' &&
      (r.id.startsWith('content-quality-') ||
        r.id.startsWith('boilerplate-') ||
        r.id.startsWith('placeholder-'))
  );

  return [
    {
      id: 'contentQuality',
      label: 'Content Quality & Source Grounding',
      passed: !contentQualityFailure,
      detail: contentQualityFailure
        ? contentQualityFailure.message
        : 'Original copy, source-quoted labels, natural Arabic & clean Slide 1 hook',
      fixLabel: 'Auto-Clean Content',
      slideIndex: contentQualityFailure?.slideIndex,
    },
    {
      id: 'overflow',
      label: 'Text Overflow & Limits',
      passed: !overflowFailure,
      detail: overflowFailure
        ? overflowFailure.message
        : `All ${slides.length} slide headlines & bodies fit within bounds`,
      fixLabel: 'Auto-Fit Text',
      slideIndex: overflowFailure?.slideIndex,
    },
    {
      id: 'contrast',
      label: 'Contrast (WCAG AA)',
      passed: contrastPassed,
      detail: contrastPassed
        ? `Body ${bodyContrast}:1 · Headline ${titleContrast}:1 · Accent ${accentContrast}:1 (AA Pass)`
        : `Low contrast (${minContrast}:1 < 4.5:1 AA minimum)`,
      fixLabel: 'Fix Contrast',
    },
    {
      id: 'minFontSize',
      label: 'Minimum Font Size (≥24px text, ≥22px footer)',
      passed: !minFontFailure,
      detail: minFontFailure
        ? minFontFailure.message
        : `Title & body ≥ ${MIN_TITLE_FONT_SIZE}px and footer ≥ ${MIN_FOOTER_FONT_SIZE}px across 9:16, 3:4, 4:5, 1:1`,
      fixLabel: 'Restore ≥24px',
      slideIndex: minFontFailure?.slideIndex,
    },
    {
      id: 'safeZones',
      label: 'TikTok Safe Zones',
      passed: !safeZoneFailure,
      detail: safeZoneFailure
        ? safeZoneFailure.message
        : 'Clear of top 150px, bottom 420px & right 120px TikTok UI zones',
      fixLabel: 'Auto-Fix Zones',
      slideIndex: safeZoneFailure?.slideIndex,
    },
    {
      id: 'truncatedCopy',
      label: 'Truncated Copy ("…")',
      passed: !truncatedFailure,
      detail: truncatedFailure
        ? truncatedFailure.message
        : 'Zero truncated lines or trailing ellipses ("…")',
      fixLabel: 'Fix Truncation',
      slideIndex: truncatedFailure?.slideIndex,
    },
    {
      id: 'bilingualConsistency',
      label: 'AR / EN Consistency & BiDi',
      passed: bilingualIssueSlide === undefined && !bidiFailure,
      detail: bilingualDetail,
      fixLabel: 'Fix AR/EN BiDi',
      slideIndex: bilingualIssueSlide,
    },
    {
      id: 'duplicateLabels',
      label: 'Distinct Diagram & Metric Labels',
      passed: duplicateLabelSlide === undefined,
      detail: duplicateLabelDetail,
      fixLabel: 'Deduplicate Labels',
      slideIndex: duplicateLabelSlide,
    },
    {
      id: 'chartDirection',
      label: 'Chart Direction & After-Win',
      passed: chartMismatchSlide === undefined,
      detail: chartMismatchDetail,
      fixLabel: 'Fix Chart Direction',
      slideIndex: chartMismatchSlide,
    },
    {
      id: 'unverifiedNumbers',
      label: 'Numbers Verified vs Source',
      passed: unverifiedNumSlide === undefined,
      detail: unverifiedNumDetail,
      fixLabel: 'Verify Numbers',
      slideIndex: unverifiedNumSlide,
    },
    {
      id: 'missingSource',
      label: 'Source Attribution ("Source: <name>")',
      passed: hasAnySourceAttribution,
      detail: hasAnySourceAttribution
        ? `Source displayed on slide: ${sourceName.replace(/^Source:\s*/i, '')}`
        : 'Missing source attribution — add Source: <name> before export',
      fixLabel: 'Set Source',
    },
    {
      id: 'brandLogoSafety',
      label: 'Brand Assets & Subject Pair IP Safety (≤14% pair / ≤8% badge)',
      passed: brandSafetySlide === undefined,
      detail: brandSafetyDetail,
      fixLabel: 'Replace Logo with Text Name',
      slideIndex: brandSafetySlide,
    },
  ];
}

export interface QACheckOptions {
  exportFormat?: 'jpg' | 'jpeg' | 'png';
  width?: number;
  height?: number;
}

// ─── Main QA Runner ─────────────────────────────────────────────────

/**
 * Run all QA checks on a carousel deck. Returns a full report.
 */
export function runQAChecks(carousel: CarouselData, options: QACheckOptions = {}): QAReport {
  const results: QACheckResult[] = [];
  const { slides } = carousel;

  // Export format & dimension gate (TikTok requires 1080x1920 JPG, never PNG)
  if (options.exportFormat === 'png') {
    results.push({
      id: 'export-format-png',
      severity: 'fail',
      message: 'PNG export is disallowed for TikTok carousels. Slides must export as 1080x1920 JPG.',
      value: 'png',
      limit: 'jpg',
    });
  }
  if (
    (options.width !== undefined && options.width !== 1080) ||
    (options.height !== undefined && options.height !== 1920)
  ) {
    results.push({
      id: 'export-dimensions',
      severity: 'fail',
      message: `Invalid export dimensions (${options.width}x${options.height}). Slides must be 1080x1920 (9:16).`,
      value: `${options.width}x${options.height}`,
      limit: '1080x1920',
    });
  }

  const isSingleSlide = carousel.postFormat === 'single' || slides.length === 1;

  // Deck-level checks
  results.push(checkSlideCount(slides, isSingleSlide));
  results.push(checkPlatformCaptionLimits(carousel));
  results.push(checkLastSlideCta(slides, isSingleSlide));
  results.push(...checkCreditPresence(slides));
  results.push(...checkFirstFrame(slides, isSingleSlide));
  results.push(...checkDuplicateBodyText(slides));
  results.push(...checkContentQuality(carousel));

  // Check if deck is an unreviewed draft (either offline fallback or ungrounded draft)
  if (
    (carousel.sourceMeta?.isFallback || carousel.sourceMeta?.status === 'unverified_draft') &&
    !carousel.sourceMeta?.userReviewed
  ) {
    results.push({
      id: 'fallback-draft-blocker',
      severity: 'fail',
      message: 'Unverified draft detected. Review slide copy and click "I reviewed this" before export.',
      field: 'sourceMeta.userReviewed',
    });
  }

  const spec = getCanvasDimensionSpec(carousel.dimensionPreset);

  // Deck-level minimum typography & footer checks across every aspect ratio (9:16, 3:4, 4:5, 1:1)
  if (spec.minTitleFontSize < MIN_TITLE_FONT_SIZE || spec.minBodyFontSize < MIN_BODY_FONT_SIZE) {
    results.push({
      id: 'min-font-size-preset',
      severity: 'fail',
      field: 'dimensionPreset',
      message: `${spec.shortLabel}: Minimum title/body font size is below ${MIN_BODY_FONT_SIZE}px (title=${spec.minTitleFontSize}px, body=${spec.minBodyFontSize}px).`,
      value: `${Math.min(spec.minTitleFontSize, spec.minBodyFontSize)}px`,
      limit: `≥ ${MIN_BODY_FONT_SIZE}px`,
    });
  }
  if (spec.footerFontSize < MIN_FOOTER_FONT_SIZE || spec.footerBadgeSize < MIN_FOOTER_FONT_SIZE) {
    results.push({
      id: 'min-font-size-footer',
      severity: 'fail',
      field: 'dimensionPreset',
      message: `${spec.shortLabel}: Footer font/badge size (${Math.min(spec.footerFontSize, spec.footerBadgeSize)}px) is below the ${MIN_FOOTER_FONT_SIZE}px minimum.`,
      value: `${Math.min(spec.footerFontSize, spec.footerBadgeSize)}px`,
      limit: `≥ ${MIN_FOOTER_FONT_SIZE}px`,
    });
  }

  // Per-slide checks
  for (let i = 0; i < slides.length; i++) {
    const isHook = i === 0 || slides[i].type === 'hub';
    results.push(...checkHeadlineSpecRule(slides[i], i, slides.length));
    results.push(...checkCharLimits(slides[i], i, isHook, isSingleSlide));
    results.push(...checkArabicLineEndings(slides[i], i));
    results.push(...checkArabicTranslatedTechTerms(slides[i], i));
    results.push(...checkArabicSafeZone(slides[i], i, spec));
    results.push(...checkTikTokSafeZoneViolations(slides[i], i, spec));
    results.push(...checkTruncatedDescriptions(slides[i], i));
    results.push(...checkMinFontSizeViolation(slides[i], i, spec, carousel));
    results.push(...checkArchetypeFields(slides[i], i));
    results.push(...checkMarkdownAndPunctuation(slides[i], i));
    results.push(...checkPlaceholders(slides[i], i));
  }

  const passCount = results.filter((r) => r.severity === 'pass').length;
  const warnCount = results.filter((r) => r.severity === 'warn').length;
  const failCount = results.filter((r) => r.severity === 'fail').length;

  return {
    results,
    passCount,
    warnCount,
    failCount,
    canExport: failCount === 0,
  };
}

// ─── Gatherer Quality Gate & Originality Detector ───────────────────

const SUMMARY_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'are', 'was', 'were',
  'have', 'has', 'had', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must',
  'how', 'why', 'what', 'when', 'where', 'which', 'who', 'than', 'then', 'they', 'their',
  'there', 'here', 'more', 'most', 'some', 'such', 'only', 'over', 'under', 'between',
  'about', 'using', 'used', 'uses', 'make', 'makes', 'also', 'very', 'just', 'still',
]);

function extractMeaningfulTokens(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !SUMMARY_STOP_WORDS.has(w));
}

export interface SummaryOnlyDetectionResult {
  isSummaryOnly: boolean;
  overlapRatio: number;
  reason?: string;
}

/**
 * Detects whether a draft deck or candidate mainly summarizes the source article
 * without adding a sharp product/startup takeaway ("what it means for your product").
 */
export function detectSummaryOnlyDraft(input: {
  title?: string;
  summary?: string;
  marrokAngle?: string;
  slides?: SlideData[];
}): SummaryOnlyDetectionResult {
  const sourceTokens = new Set(extractMeaningfulTokens(`${input.title || ''} ${input.summary || ''}`));
  const slides = input.slides || [];
  const draftBodyText = slides
    .map((s) => `${s.enTitle || ''} ${s.enBody || ''}`)
    .join(' ');
  const draftTokens = extractMeaningfulTokens(draftBodyText);
  const angle = (input.marrokAngle || '').trim();
  const angleTokens = extractMeaningfulTokens(angle);
  const titleTokens = new Set(extractMeaningfulTokens(input.title || ''));

  const angleRepeatsHeadlineOnly =
    angleTokens.length > 0 &&
    titleTokens.size > 0 &&
    angleTokens.filter((t) => !titleTokens.has(t)).length <= 1;

  if (sourceTokens.size < 4 || draftTokens.length === 0) {
    if (!angle || angle.length < 18 || angleRepeatsHeadlineOnly) {
      return {
        isSummaryOnly: true,
        overlapRatio: 1,
        reason: 'Draft repeats headline without an explicit "what it means for your product" angle.',
      };
    }
    return { isSummaryOnly: false, overlapRatio: 0 };
  }

  let overlapCount = 0;
  let novelCount = 0;
  const seenDraft = new Set<string>();
  for (const tok of draftTokens) {
    if (seenDraft.has(tok)) continue;
    seenDraft.add(tok);
    if (sourceTokens.has(tok)) {
      overlapCount += 1;
    } else {
      novelCount += 1;
    }
  }

  const totalUniqueDraft = Math.max(1, overlapCount + novelCount);
  const overlapRatio = Number((overlapCount / totalUniqueDraft).toFixed(2));

  const isMultiSlide = slides.length > 1;
  const hasStrongAngle =
    angle.length >= 24 &&
    !angleRepeatsHeadlineOnly &&
    /\b(for|product|team|teams|startup|startups|sme|smes|scale|cost|latency|production|ship|avoid|adopt|migration|architecture|users|engineering|means|why|cuts?|reduces?)\b/i.test(
      angle
    );

  // A multi-slide draft that shares >62% vocabulary with the raw source summary without novel framing
  // OR lacks an original non-headline product angle triggers a summary-only originality warning.
  if ((isMultiSlide && overlapRatio >= 0.62 && novelCount < 10) || angleRepeatsHeadlineOnly) {
    return {
      isSummaryOnly: true,
      overlapRatio,
      reason: angleRepeatsHeadlineOnly
        ? 'Draft only echoes the source headline — rewrite the Marrok angle to explain what it means for your product.'
        : `Draft mirrors ${Math.round(overlapRatio * 100)}% of the source summary — add original product implications, tradeoffs, or architecture takeaways.`,
    };
  }

  if (!hasStrongAngle && overlapRatio >= 0.55) {
    return {
      isSummaryOnly: true,
      overlapRatio,
      reason: 'Draft reads close to a source summary. Sharpen the Marrok angle with concrete startup/product impact.',
    };
  }

  return { isSummaryOnly: false, overlapRatio };
}

export interface GathererQualityGateResult {
  passed: boolean;
  blockingReasons: string[];
  warnings: string[];
  isSummaryOnly: boolean;
  summaryOnlyReason?: string;
}

/**
 * Quality Gate run on Inbox Gatherer candidates before Accept / Move to Draft.
 * Blocks EN/AR title mismatch, filler Arabic, template clichés, invalid Slide 1 hubs,
 * 3-in-a-row layout streaks, and missing/trivial Marrok angles.
 */
export function evaluateGathererCandidateQuality(input: {
  title: string;
  draftTitle?: string;
  summary?: string;
  marrokAngle?: string;
  deck: CarouselData;
}): GathererQualityGateResult {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const deck = input.deck;
  const slides = deck?.slides || [];

  // 1. Originality: required editable "Marrok angle"
  const cleanAngle = (input.marrokAngle || deck?.sourceMeta?.marrokAngle || '').trim();
  if (cleanAngle.length < 15) {
    blockingReasons.push(
      'Missing "Marrok angle" (minimum 15 chars explaining what this means for your product).'
    );
  }

  // 2. Run deck content quality checks (template clichés, filler Arabic, topic echoes, Slide 1 rules)
  const contentChecks = checkContentQuality(deck);
  for (const res of contentChecks) {
    if (res.severity === 'fail') {
      if (!blockingReasons.includes(res.message)) {
        blockingReasons.push(res.message);
      }
    } else if (res.severity === 'warn') {
      if (!warnings.includes(res.message)) {
        warnings.push(res.message);
      }
    }
  }

  // 3. EN/AR Title alignment & bilingual completeness per slide
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    if (s.standaloneMeme || s.imageFrameMode === 'full') continue;
    const enTitle = (s.enTitle || '').trim();
    const arTitle = (s.arTitle || '').trim();

    if (!enTitle) {
      blockingReasons.push(`Slide ${i + 1}: Missing English title (enTitle).`);
      continue;
    }

    if (!arTitle || !/[\u0600-\u06FF]/.test(arTitle)) {
      blockingReasons.push(`Slide ${i + 1}: EN/AR title mismatch — missing Arabic translation in arTitle.`);
      continue;
    }

    const enWordCount = enTitle.split(/\s+/).filter(Boolean).length;
    const arWordCount = arTitle.split(/\s+/).filter(Boolean).length;
    if (enWordCount >= 6 && arWordCount <= 1) {
      blockingReasons.push(
        `Slide ${i + 1}: EN/AR title mismatch — English title has ${enWordCount} words while Arabic title has ${arWordCount} word.`
      );
    }

    // Translated tech-term warning
    const arTermWarnings = checkArabicTranslatedTechTerms(s, i);
    for (const w of arTermWarnings) {
      warnings.push(w.message);
    }
  }

  // 4. Storyboard checks: Slide 1 never Hub, and no 3 identical layouts in a row
  const isSingle = deck.postFormat === 'single' || slides.length === 1;
  if (!isSingle && slides.length > 1) {
    if (slides[0]?.type === 'hub') {
      blockingReasons.push('Slide 1 must use a focused Hook layout (not Hub diagram).');
    }
    for (let i = 2; i < slides.length; i++) {
      if (
        slides[i].type === slides[i - 1].type &&
        slides[i - 1].type === slides[i - 2].type &&
        slides[i].type !== 'cta'
      ) {
        blockingReasons.push(
          `Storyboard repeats "${slides[i].type}" 3 times in a row (Slides ${i - 1}–${i + 1}).`
        );
        break;
      }
    }
  }

  // 5. Originality / Summary-only warning
  const summaryAudit = detectSummaryOnlyDraft({
    title: input.title,
    summary: input.summary,
    marrokAngle: cleanAngle,
    slides,
  });
  if (summaryAudit.isSummaryOnly && summaryAudit.reason) {
    warnings.push(summaryAudit.reason);
  }

  return {
    passed: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    isSummaryOnly: summaryAudit.isSummaryOnly,
    summaryOnlyReason: summaryAudit.reason,
  };
}
