import type { CarouselData, CoverStyle, HookFramework, HookVariant, SlideData, SlideType } from '../../types.ts';
import { extractCleanSubject } from '../text/headlines.ts';
import { sanitizeCoverTeaserText } from '../text/sanitizer.ts';

export const PROVEN_HOOK_FRAMEWORKS: readonly HookFramework[] = [
  'Contrarian',
  'Specific Metric',
  'Mistake Callout',
  'Curiosity Gap',
] as const;

export const BANNED_HOOK_CLICHE_PATTERNS: readonly RegExp[] = [
  /\bultimate\s+guide\b/gi,
  /\bunlock(?:ing|ed|s)?\b/gi,
  /\bgame[- ]?chang(?:ing|er|ers)\b/gi,
  /\brevolutioniz(?:e|ing|ed)\b/gi,
  /\blet'?s\s+dive\s+in\b/gi,
  /\bin\s+today'?s\s+fast[- ]?paced\b/gi,
];

export const GENERIC_HOOK_FILLER_PATTERNS: readonly RegExp[] = [
  /\bshifts?\s+the\s+model\b/gi,
  /\bshifts?\s+real[- ]world\s+outcomes\b/gi,
  /المقارنة\s+الحقيقية\s+في/gi,
  /الأنظمة\s+المعمارية/gi,
  /\bunder\s+real\s+production\s+traffic\b/gi,
  /\bhidden\s+pipeline\s+bottlenecks\b/gi,
  /\bcosting\s+engineering\s+teams\s+speed\b/gi,
  /\badvice\s+breaks\s+under\b/gi,
  /\bwhat\s+breaks\s+first\s+in\b/gi,
  /\bthe\s+real\s+constraint\s+limiting\b/gi,
  /\bbreaks?\s+without\s+clarity\b/gi,
  /\bquietly\s+slows?\s+teams\s+down\b/gi,
  /\beverything\s+you\s+need\s+to\s+know\b/gi,
  /\ba\s+closer\s+look\s+at\b/gi,
  /\bexplained\s+simply\b/gi,
  /\bsystem\s+architecture\s*,?\s*explained\b/gi,
  /\btechnical\s+breakdown\s+of\b/gi,
];

const EMOJI_STRIP_RE = /[\p{Extended_Pictographic}\uFE0F]/gu;
const DANGLING_TRAILING_WORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'to',
  'in',
  'on',
  'at',
  'for',
  'from',
  'with',
  'by',
  'and',
  'or',
  'but',
  'as',
  'into',
  'under',
  'when',
  'where',
  'while',
  'because',
  'instead',
]);

export interface HookScoreBreakdown {
  score: number;
  wordCount: number;
  subheadlineWordCount: number;
  hasNegativeViolation: boolean;
  reasons: string[];
}

export function countHeadlineWords(text: string | undefined): number {
  if (!text) return 0;
  return text
    .replace(/[.?!،؟—–]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function containsBannedHookCliche(text: string | undefined): boolean {
  if (!text) return false;
  return BANNED_HOOK_CLICHE_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

export function containsGenericHookFiller(text: string | undefined): boolean {
  if (!text) return false;
  return GENERIC_HOOK_FILLER_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

export function containsEmoji(text: string | undefined): boolean {
  if (!text) return false;
  EMOJI_STRIP_RE.lastIndex = 0;
  return EMOJI_STRIP_RE.test(text);
}

/**
 * Strips emojis, colons (":"), and banned clichés from slide / hook copy.
 * Preserves URL protocols if ever present outside slide headlines.
 */
export function stripNegativeSlideConstraints(
  text: string | undefined,
  options: { stripColons?: boolean; stripCliches?: boolean } = {}
): string {
  if (!text) return '';
  const { stripColons = true, stripCliches = true } = options;
  let clean = text.replace(EMOJI_STRIP_RE, '');
  if (stripColons) {
    clean = clean.replace(/\s*:\s*/g, ' ').replace(/:/g, '');
  }
  if (stripCliches) {
    clean = clean
      .replace(/\bthe\s+ultimate\s+guide\s+(?:to|for)\b/gi, 'How teams fail with')
      .replace(/\bultimate\s+guide\b/gi, 'engineering analysis')
      .replace(/\bunlock(?:ing|ed)?\b/gi, 'expose')
      .replace(/\bgame[- ]?chang(?:ing|er|ers)\b/gi, 'architectural shift')
      .replace(/\brevolutioniz(?:e|ing|ed)\b/gi, 'reshape')
      .replace(/\blet'?s\s+dive\s+in\b/gi, '');
  }
  return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Keeps optional Slide 1 sub-headline strictly under 8 words (< 8 words) with zero negative constraints.
 */
export function clampOptionalSubheadline(text: string | undefined, maxWords: number = 7): string {
  const clean = stripNegativeSlideConstraints(text, { stripColons: true, stripCliches: true });
  if (!clean) return '';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return clean;
  const sliced = words.slice(0, maxWords).join(' ').replace(/[,;:\-—–]+$/, '').trim();
  return /[.?!]$/.test(sliced) ? sliced : `${sliced}.`;
}

function normalizeSentenceEnding(text: string, fallbackQuestion = false): string {
  const clean = text.replace(/[:;]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (/[.?!]$/.test(clean)) return clean;
  const isQuestion =
    fallbackQuestion ||
    /^(?:(?:why|how|what|when|where|which|who)\s+(?:do|does|did|is|are|can|could|should|will|would)|is|are|can|could|does|did|should|will|would|do)\b/i.test(
      clean
    );
  return `${clean}${isQuestion ? '?' : '.'}`;
}

function lowerFirst(text: string): string {
  if (!text) return '';
  const firstToken = text.split(/\s+/)[0] || '';
  if (/^[A-Z]{2,}/.test(firstToken)) return text;
  if (/^(?:Postgres|PostgreSQL|Redis|Valkey|Kafka|Cassandra|ScyllaDB|MongoDB|Discord|Stripe|Docker|Kubernetes|Linux|SQLite|PgBouncer|Rust|Go|Python|Anthropic|Scion|Cloudflare|Nginx|Pingora)\b/.test(firstToken)) {
    return text;
  }
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function stripLeadingHookStarter(text: string): string {
  return text.replace(/^(?:how|why|what|when|where)\s+(?:does|do|did|is|are|to)?\s*/i, '').trim();
}

function tokenizeWords(text: string): string[] {
  return text
    .replace(/(?<!\d)[.?!،؟—–]+|[.?!،؟—–]+(?!\d)/g, ' ')
    .replace(/[,;]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function fitHookToWordRange(
  rawTitle: string,
  paddingSources: string[] = [],
  forceQuestion = false
): string {
  let clean = stripNegativeSlideConstraints(rawTitle, { stripColons: true, stripCliches: true })
    .replace(/[.?!]+$/, '')
    .trim();

  let words = tokenizeWords(clean);
  const existingSet = new Set(words.map((w) => w.toLowerCase()));

  if (words.length > 0 && words.length < 6) {
    for (const src of paddingSources) {
      if (words.length >= 8) break;
      const candidateWords = tokenizeWords(
        stripNegativeSlideConstraints(src, { stripColons: true, stripCliches: true })
      );
      for (const w of candidateWords) {
        if (words.length >= 10) break;
        if (!existingSet.has(w.toLowerCase())) {
          words.push(w);
          existingSet.add(w.toLowerCase());
        }
      }
    }
  }

  if (words.length > 12) {
    words = words.slice(0, 12);
  }
  while (
    words.length > 6 &&
    (DANGLING_TRAILING_WORDS.has(words[words.length - 1].toLowerCase()) ||
      /^(?:lets|makes|keeps|gives|shows|needs)$/i.test(words[words.length - 1]))
  ) {
    words.pop();
  }

  clean = words.join(' ').replace(/[,;:\-—–]+$/, '').trim();
  const wantsQuestion = forceQuestion || /\?$/.test(rawTitle.trim());
  return normalizeSentenceEnding(clean, wantsQuestion);
}

interface Slide2AnchorSignals {
  subject: string;
  arSubject: string;
  metric: string;
  slide2Title: string;
  slide2BodyClause: string;
  slide2Problem: string;
  slide2ArTitle: string;
  slide2ArClause: string;
  slide3Mechanism: string;
  slide3ArTitle: string;
  compareBefore: string;
  compareAfter: string;
  nodeLabels: string[];
  keyTokens: string[];
  slide2Tokens: string[];
  paddingPool: string[];
}

function cleanClause(text: string | undefined, maxWords: number = 14): string {
  if (!text) return '';
  const stripped = stripNegativeSlideConstraints(text, { stripColons: true, stripCliches: true });
  if (!stripped || containsGenericHookFiller(stripped)) return '';
  const firstClause = stripped.split(/(?<!\d)(?<=[.!?])\s+|\n+/)[0] || stripped;
  const cleaned = firstClause.replace(/[.?!،؟]+$/, '').replace(/\s+/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return cleaned;
  return words.slice(0, maxWords).join(' ').replace(/[,;:\-—–]+$/, '').trim();
}

function cleanArabicClause(text: string | undefined): string {
  if (!text) return '';
  const stripped = stripNegativeSlideConstraints(text, { stripColons: true, stripCliches: false });
  if (!stripped || containsGenericHookFiller(stripped)) return '';
  const firstClause = stripped.split(/(?<!\d)\.(?!\d)|[؟!،\n]+/)[0] || stripped;
  return firstClause.trim();
}

function extractBodyContextSignals(slides: SlideData[], rawSourceText: string = ''): Slide2AnchorSignals {
  const slide2 = slides.length > 1 ? slides[1] : slides[0];
  const slide3 = slides.length > 2 ? slides[2] : slide2;
  const bodySlides = slides.length > 1 ? slides.slice(1) : slides;

  const slide2Combined = [
    slide2?.enTitle || '',
    slide2?.enBody || '',
    slide2?.compareLeftTitle || '',
    slide2?.compareLeftBody || '',
    slide2?.metricValue || '',
    slide2?.metricBeforeValue || '',
    slide2?.metricDiff || '',
    slide2?.hookClaimCard?.statement || '',
    ...(slide2?.diagramNodes || []).map((n) => `${n.label} ${n.sublabel || ''}`),
  ]
    .filter(Boolean)
    .join(' ');

  const allBodyCombined = [
    slide2Combined,
    ...bodySlides.slice(1).map((s) => `${s.enTitle || ''} ${s.enBody || ''} ${s.metricValue || ''} ${s.metricDiff || ''}`),
    rawSourceText,
  ]
    .filter(Boolean)
    .join(' ');

  const { cleanSubject, arSubject: rawArSubject } = extractCleanSubject(
    `${slide2?.enTitle || ''} ${slide2?.enBody || ''} ${rawSourceText}`.trim() || slides[0]?.enTitle || ''
  );

  const slide2Title = cleanClause(slide2?.enTitle, 11);
  const slide2BodyClause = cleanClause(
    slide2?.enBody ||
      slide2?.compareLeftBody?.replace(/^•\s*/gm, '') ||
      slide2?.hookClaimCard?.statement ||
      slide3?.enBody,
    12
  );
  const slide3Mechanism = cleanClause(
    slide3?.enTitle || slide2?.compareRightTitle || slide3?.enBody,
    10
  );

  const slide2MetricFromFields = (slide2?.metricValue || slide2?.metricBeforeValue || '').trim();
  const metricSource = `${slide2MetricFromFields} ${slide2Combined} ${allBodyCombined}`;
  const metricMatch = metricSource.match(
    /(?:\$\s*\d+(?:[.,]\d+)?\s*(?:T|B|M|K)\b|\b\d+(?:[.,]\d+)?\s*(?:x|%|ms|μs|ns|GB\/s|MB\/s|GB|MB|TB|KB|GW|rps|req\/s)\b)/i
  );
  const metric = (metricMatch?.[0] || '').replace(/\s+/g, '').trim();

  const failureVerbRe =
    /\b(?:stall|exhaust|spike|fail|crash|block|drop|leak|consume|inflate|break|overflow|overload|bottleneck|drain|contend|timeout|pause|slow|waste)\w*\b/i;

  const slide2Problem =
    (failureVerbRe.test(slide2BodyClause) && slide2BodyClause.split(/\s+/).length >= 5
      ? slide2BodyClause
      : '') ||
    slide2Title ||
    slide2BodyClause ||
    cleanClause(rawSourceText, 10);

  const nodeLabels = (slide2?.diagramNodes || slide3?.diagramNodes || [])
    .map((n) => stripNegativeSlideConstraints(n.label, { stripColons: true }))
    .filter(Boolean);

  const compareBeforeRaw = cleanClause(slide2?.compareLeftTitle, 6);
  const compareAfterRaw = cleanClause(slide2?.compareRightTitle, 6);
  const compareBefore = /^(?:without|before)\s+/i.test(compareBeforeRaw)
    ? compareBeforeRaw.replace(/^(?:without|before)\s+/i, '').toLowerCase()
    : compareBeforeRaw;
  const compareAfter = /^(?:with|after)\s+/i.test(compareAfterRaw)
    ? compareAfterRaw.replace(/^(?:with|after)\s+/i, '').toLowerCase()
    : compareAfterRaw;

  const stopWords = new Set([
    'this', 'that', 'with', 'from', 'your', 'into', 'when', 'what', 'where', 'which',
    'about', 'there', 'their', 'these', 'those', 'under', 'without', 'around', 'before',
    'after', 'during', 'across', 'every', 'most', 'real', 'when', 'teams',
  ]);

  const extractTokens = (txt: string) =>
    Array.from(
      new Set(
        txt
          .toLowerCase()
          .replace(/[^a-z0-9$%+\-\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length >= 4 && !stopWords.has(w))
      )
    );

  const slide2Tokens = extractTokens(slide2Combined).slice(0, 14);
  const keyTokens = Array.from(new Set([...slide2Tokens, ...extractTokens(allBodyCombined)])).slice(0, 22);

  const subject =
    cleanSubject && cleanSubject !== 'System Architecture'
      ? cleanSubject
      : nodeLabels[0] || slide2Title.split(/\s+/).slice(0, 3).join(' ') || 'Production Systems';

  const arSubject =
    rawArSubject && rawArSubject !== 'الأنظمة المعمارية'
      ? rawArSubject
      : subject;

  const slide2ArTitle = cleanArabicClause(slide2?.arTitle);
  const slide2ArClause = cleanArabicClause(slide2?.arBody);
  const slide3ArTitle = cleanArabicClause(slide3?.arTitle);

  const paddingPool = [
    slide2BodyClause,
    slide2Title,
    slide3Mechanism,
    nodeLabels.join(' '),
    compareBefore,
    compareAfter,
    subject,
  ].filter(Boolean);

  return {
    subject,
    arSubject,
    metric,
    slide2Title,
    slide2BodyClause,
    slide2Problem,
    slide2ArTitle,
    slide2ArClause,
    slide3Mechanism,
    slide3ArTitle,
    compareBefore,
    compareAfter,
    nodeLabels,
    keyTokens,
    slide2Tokens,
    paddingPool,
  };
}

export function inferHookFramework(variant: Pick<HookVariant, 'framework' | 'tag' | 'enTitle'>): HookFramework {
  if (variant.framework && PROVEN_HOOK_FRAMEWORKS.includes(variant.framework)) {
    return variant.framework;
  }
  const combined = `${variant.tag || ''} ${variant.enTitle || ''}`.toLowerCase();
  if (/metric|number|stat|bench|\$\d|\d+%|\d+ms|\d+x|\d+mb|\d+gb/.test(combined)) {
    return 'Specific Metric';
  }
  if (/mistake|wrong|trap|fail|broken|costly|avoid|error|choke|stall|exhaust|drain/.test(combined)) {
    return 'Mistake Callout';
  }
  if (/contrarian|myth|actually|vs|reality|lie|reverse|counter|don'?t|stop|instead/.test(combined)) {
    return 'Contrarian';
  }
  return 'Curiosity Gap';
}

export function scoreHookVariant(
  variant: HookVariant,
  bodySlides: SlideData[] = [],
  rawSourceText: string = ''
): HookScoreBreakdown {
  const title = (variant.enTitle || '').trim();
  const sub = (variant.enBody || '').trim();
  const wordCount = countHeadlineWords(title);
  const subheadlineWordCount = countHeadlineWords(sub);
  const signals = extractBodyContextSignals(
    bodySlides.length > 0 ? [{ type: 'row', enTitle: '', arTitle: '', enBody: '', arBody: '' }, ...bodySlides] : [],
    rawSourceText
  );

  let score = 34;
  const reasons: string[] = [];
  let hasNegativeViolation = false;

  // 1. Slide 1 Word Count Hard Constraint (6 to 12 words)
  if (wordCount >= 6 && wordCount <= 12) {
    score += 20;
    reasons.push(`6-12 words (${wordCount}w)`);
  } else if (wordCount === 5 || (wordCount >= 13 && wordCount <= 14)) {
    score += 6;
    reasons.push(`Near target length (${wordCount}w)`);
  } else {
    score -= 15;
    reasons.push(`Outside 6-12 word target (${wordCount}w)`);
  }

  // 2. Optional sub-headline constraint (< 8 words)
  if (subheadlineWordCount === 0 || subheadlineWordCount < 8) {
    score += 5;
  } else {
    score -= 12;
    reasons.push(`Sub-headline exceeds 7 words (${subheadlineWordCount}w)`);
  }

  // 3. Specificity (numbers / concrete domain + Slide 2 failure/metric grounding)
  if (/(?:\$\s*\d+|\b\d+(?:[.,]\d+)?\s*(?:x|%|ms|μs|ns|GB|MB|TB|KB|GW|T|B|M|K)\b)/i.test(title)) {
    score += 18;
    reasons.push('Specific number/metric');
  }
  const titleLower = title.toLowerCase();
  const slide2Overlap = signals.slide2Tokens.filter((tok) => titleLower.includes(tok)).length;
  const bodyOverlap = signals.keyTokens.filter((tok) => titleLower.includes(tok)).length;
  if (slide2Overlap >= 2) {
    score += 12;
    reasons.push('Derived from Slide 2 specifics');
  } else if (bodyOverlap >= 2) {
    score += 8;
    reasons.push('Grounded in body specifics');
  } else if (slide2Overlap === 1 || bodyOverlap === 1) {
    score += 4;
  }

  // 4. Scroll-stopping framework strength
  if (
    /\b(?:why|never|stop|wrong|mistake|cost|stall|exhaust|break|broke|fail|fails|secret|instead|vs|actually|when|without|avoid)\b/i.test(
      title
    ) ||
    title.endsWith('?')
  ) {
    score += 10;
    reasons.push('Strong scroll-stopping tension');
  } else {
    score += 2;
  }

  // 5. Bilingual RTL completeness
  if (countHeadlineWords(variant.arTitle) >= 3) {
    score += 5;
  } else {
    score -= 6;
  }

  // 6. Negative constraints & generic filler audit
  if (containsBannedHookCliche(title) || containsBannedHookCliche(sub)) {
    score -= 45;
    hasNegativeViolation = true;
    reasons.push('Banned cliché detected');
  }
  if (
    containsGenericHookFiller(title) ||
    containsGenericHookFiller(variant.arTitle) ||
    containsGenericHookFiller(sub) ||
    containsGenericHookFiller(variant.arBody)
  ) {
    score -= 45;
    hasNegativeViolation = true;
    reasons.push('Generic filler phrase detected');
  }
  if (title.includes(':') || (variant.arTitle || '').includes(':') || sub.includes(':')) {
    score -= 25;
    hasNegativeViolation = true;
    reasons.push('Contains prohibited colon');
  }
  if (containsEmoji(title) || containsEmoji(variant.arTitle) || containsEmoji(sub) || containsEmoji(variant.arBody)) {
    score -= 25;
    hasNegativeViolation = true;
    reasons.push('Contains prohibited emoji');
  }
  if (/^(?:overview\s+of|introduction\s+to|all\s+about|summary\s+of)\b/i.test(title)) {
    score -= 20;
    hasNegativeViolation = true;
    reasons.push('Generic summary framing');
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    wordCount,
    subheadlineWordCount,
    hasNegativeViolation,
    reasons,
  };
}

function buildArabicHookFromSlide2(
  signals: Slide2AnchorSignals,
  angle: 'contrarian' | 'metric' | 'mistake' | 'curiosity-why' | 'curiosity-how'
): string {
  const arTitle = signals.slide2ArTitle;
  const arClause = signals.slide2ArClause;
  const arS3 = signals.slide3ArTitle;
  const metric = signals.metric;
  const topic = signals.arSubject;

  const ensureArabicRtl = (raw: string): string => {
    const clean = stripNegativeSlideConstraints(raw, { stripColons: true, stripCliches: false })
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return '';
    // Keep English Latin terms inside Arabic copy without trailing Latin+dot BiDi breaks
    if (/[A-Za-z0-9][.?!]$/.test(clean)) {
      const punc = clean.slice(-1);
      return `${clean.slice(0, -1)} فعلياً${punc}`;
    }
    return clean;
  };

  if (angle === 'metric') {
    if (metric && arClause && arClause.includes(metric)) return ensureArabicRtl(arClause);
    if (metric && arTitle) return ensureArabicRtl(`${arTitle} (${metric})`);
    if (arClause) return ensureArabicRtl(arClause);
  }

  if (angle === 'mistake') {
    if (arClause && arClause !== arTitle) return ensureArabicRtl(arClause);
    if (arTitle) return ensureArabicRtl(arTitle);
  }

  if (angle === 'contrarian') {
    if (arTitle && arS3 && arTitle !== arS3) {
      return ensureArabicRtl(`${arTitle} بدلاً من الافتراضات الشائعة`);
    }
    if (arTitle) return ensureArabicRtl(arTitle);
  }

  if (angle === 'curiosity-why') {
    if (arTitle) {
      const noQ = arTitle.replace(/[؟?]+$/, '').trim();
      if (/^(?:لماذا|كيف|ما|هل)\b/.test(noQ)) return ensureArabicRtl(`${noQ}؟`);
      return ensureArabicRtl(`لماذا يظهر أثر ${noQ} عند التشغيل؟`);
    }
  }

  if (angle === 'curiosity-how') {
    if (arS3 && arS3 !== arTitle) return ensureArabicRtl(arS3);
    if (arClause) return ensureArabicRtl(arClause);
  }

  return ensureArabicRtl(arTitle || arClause || `أين يتعطل ${topic} تحت الضغط الفعلي؟`);
}

export function clampCoverTeaser(
  text: string | undefined,
  isArabic: boolean = false,
  maxChars: number = 68
): string {
  const clean = sanitizeCoverTeaserText(
    stripNegativeSlideConstraints(text, { stripColons: true, stripCliches: !isArabic }),
    isArabic
  );
  if (!clean) return '';
  if (clean.length <= maxChars) return clean;
  const sliced = clean.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(' ');
  const trimmed = (lastSpace > 16 ? sliced.slice(0, lastSpace) : sliced)
    .replace(/[,;:\-—–]+$/, '')
    .trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  while (!isArabic && words.length > 4 && DANGLING_TRAILING_WORDS.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  const finalStr = words.join(' ').replace(/[,;:\-—–]+$/, '').trim();
  if (!finalStr) return clean.slice(0, maxChars).trim();
  return /[.?!؟]$/.test(finalStr) ? finalStr : `${finalStr}.`.slice(0, maxChars);
}

export function inferCoverStyleForHook(
  framework?: HookFramework | string,
  slide?: Partial<SlideData>,
  coverArchetype?: SlideType
): CoverStyle {
  const effectiveType = coverArchetype || slide?.type;
  const text = `${slide?.enTitle || ''} ${slide?.enBody || ''} ${slide?.metricValue || ''}`.trim();
  const hasRealMetric =
    Boolean(slide?.metricValue && /\d/.test(slide.metricValue)) ||
    /(?:\$\s*\d+|\b\d+(?:[.,]\d+)?\s*(?:%|x|X|ms|μs|ns|KB|MB|GB|TB|GW|rps|req\/s)\b)/i.test(text);

  if (
    effectiveType === 'subjectPair' ||
    effectiveType === 'visual' ||
    effectiveType === 'code' ||
    Boolean(slide?.subjectPair) ||
    (Boolean(slide?.visualSpec) && slide?.visualSpec?.kind !== 'callout')
  ) {
    return 'visual-teaser';
  }
  if (
    effectiveType === 'compare' ||
    framework === 'Contrarian' ||
    /\b(?:vs\.?|versus|instead\s+of|rather\s+than)\b/i.test(text)
  ) {
    return 'versus-hook';
  }
  if ((effectiveType === 'metric' || framework === 'Specific Metric') && hasRealMetric) {
    return 'metric-split';
  }
  return 'headline-hero';
}

function buildCoverTeaserPairFromSignals(
  signals: Slide2AnchorSignals,
  angle: 'contrarian' | 'metric' | 'mistake' | 'curiosity-why' | 'curiosity-how' = 'metric'
): { coverTeaserEn: string; coverTeaserAr: string } {
  const metricPart = signals.metric ? `${signals.metric} ` : '';
  const enCandidates: Record<typeof angle, string> = {
    contrarian: signals.compareBefore && signals.compareAfter
      ? `${signals.compareBefore} vs ${signals.compareAfter} under load`
      : signals.slide2BodyClause || `How ${signals.subject} behaves under real contention`,
    metric: signals.metric && signals.slide2Title
      ? `${metricPart}measured across ${signals.subject} execution paths`
      : signals.slide2BodyClause || signals.slide2Title || `${signals.subject} runtime breakdown`,
    mistake: signals.slide2Problem || signals.slide2BodyClause || `Where ${signals.subject} stalls first in production`,
    'curiosity-why': signals.slide3Mechanism
      ? `Inside ${signals.slide3Mechanism} and production constraints`
      : signals.slide2BodyClause || `What triggers bottlenecks across ${signals.subject}`,
    'curiosity-how': signals.nodeLabels.length >= 2
      ? `${signals.nodeLabels.slice(0, 3).join(' -> ')} runtime flow`
      : signals.slide2BodyClause || `Step-by-step trace of ${signals.subject}`,
  };

  const arCandidates: Record<typeof angle, string> = {
    contrarian: signals.slide2ArTitle || signals.slide2ArClause || `مقارنة الأداء الفعلي في ${signals.arSubject}`,
    metric: signals.metric && signals.slide2ArTitle
      ? `${signals.slide2ArTitle} بمؤشر ${signals.metric}`
      : signals.slide2ArClause || signals.slide2ArTitle || `تفاصيل الأداء الهندسي في ${signals.arSubject}`,
    mistake: signals.slide2ArClause || signals.slide2ArTitle || `أين يظهر الاختناق الأول في ${signals.arSubject}`,
    'curiosity-why': signals.slide3ArTitle || signals.slide2ArTitle || `تفاصيل المسار الداخلي في ${signals.arSubject}`,
    'curiosity-how': signals.slide2ArClause || signals.slide3ArTitle || `تتبع عملي لبنية ${signals.arSubject}`,
  };

  const rawEn = containsGenericHookFiller(enCandidates[angle])
    ? `${signals.subject} architecture and runtime limits`
    : enCandidates[angle];
  const rawAr = containsGenericHookFiller(arCandidates[angle])
    ? `تتبع عملي لبنية ${signals.arSubject}`
    : arCandidates[angle];

  return {
    coverTeaserEn: clampCoverTeaser(rawEn, false, 68),
    coverTeaserAr: clampCoverTeaser(rawAr, true, 68),
  };
}

export function deriveCoverTeaserForSlide(
  slide: SlideData,
  deckSlides: SlideData[] = []
): { coverTeaserEn: string; coverTeaserAr: string } {
  const existingEn = slide.coverTeaserEn ? clampCoverTeaser(slide.coverTeaserEn, false, 68) : '';
  const existingAr = slide.coverTeaserAr ? clampCoverTeaser(slide.coverTeaserAr, true, 68) : '';
  if (existingEn && existingAr) {
    return { coverTeaserEn: existingEn, coverTeaserAr: existingAr };
  }
  const signals = extractBodyContextSignals(deckSlides.length > 0 ? deckSlides : [slide]);
  const generated = buildCoverTeaserPairFromSignals(signals, slide.coverStyle === 'versus-hook' ? 'contrarian' : 'metric');
  return {
    coverTeaserEn: existingEn || generated.coverTeaserEn,
    coverTeaserAr: existingAr || generated.coverTeaserAr,
  };
}

/**
 * Generates 5 Hook Variations across Contrarian, Specific Metric, Mistake Callout, and Curiosity Gap
 * dynamically derived from Slide 2's specific problem, metric, or architectural failure
 * (6-12 words headline, optional <8 words sub-headline, zero generic filler, zero clichés/colons/emojis).
 */
export function buildBodyFirstHookVariations(
  slides: SlideData[],
  rawSourceText: string = '',
  existingVariants: HookVariant[] = []
): HookVariant[] {
  const signals = extractBodyContextSignals(slides, rawSourceText);
  const { subject, metric, slide2Title, slide2BodyClause, slide2Problem, slide3Mechanism, compareBefore, compareAfter, paddingPool } =
    signals;

  const probLead = stripLeadingHookStarter(slide2Problem || slide2Title || slide2BodyClause || subject);
  const s3Clean = stripLeadingHookStarter(slide3Mechanism);
  const s2TitleClean = stripLeadingHookStarter(slide2Title);
  const altClause =
    slide2BodyClause && slide2BodyClause.toLowerCase() !== probLead.toLowerCase()
      ? slide2BodyClause
      : s3Clean || s2TitleClean;

  const contrarianRaw =
    compareBefore && compareAfter && compareBefore.toLowerCase() !== compareAfter.toLowerCase()
      ? `Skipping ${compareBefore} stalls ${subject} before ${compareAfter} helps`
      : s3Clean && s3Clean.toLowerCase() !== probLead.toLowerCase()
        ? `Stop ignoring how ${lowerFirst(probLead)} overrides ${lowerFirst(s3Clean)}`
        : `Why ${lowerFirst(probLead)} breaks before teams notice ${subject}`;

  const metricRaw = metric
    ? altClause && altClause.toLowerCase().includes(metric.toLowerCase())
      ? altClause
      : probLead.toLowerCase().includes(metric.toLowerCase())
        ? probLead
        : `How ${lowerFirst(probLead)} triggers ${metric} overhead in ${subject}`
    : slide2BodyClause && tokenizeWords(slide2BodyClause).length >= 6
      ? slide2BodyClause
      : `How ${lowerFirst(probLead)} changes ${lowerFirst(s3Clean || subject)}`;

  const mistakeRaw =
    tokenizeWords(slide2BodyClause).length >= 6 &&
    /\b(?:stall|exhaust|consume|block|fail|drop|spike|leak|break|overhead|unpooled|manual)\w*\b/i.test(slide2BodyClause)
      ? slide2BodyClause
      : `The ${subject} mistake when ${lowerFirst(probLead)}`;

  const curiosityWhyRaw = `Why does ${lowerFirst(probLead)} hurt ${subject}?`;

  const s3VerbSafe = s3Clean.replace(/\bconnects\b/gi, 'connect').replace(/\bbreaks\b/gi, 'break');
  const curiosityHowRaw =
    s3VerbSafe && s3VerbSafe.toLowerCase() !== s2TitleClean.toLowerCase()
      ? `How does ${lowerFirst(s3VerbSafe)} fix ${lowerFirst(s2TitleClean || probLead)}?`
      : `What breaks inside ${subject} when ${lowerFirst(probLead)}?`;

  const templateAngles: Array<'contrarian' | 'metric' | 'mistake' | 'curiosity-why' | 'curiosity-how'> = [
    'contrarian',
    'metric',
    'mistake',
    'curiosity-why',
    'curiosity-how',
  ];

  const dynamicTemplates: HookVariant[] = [
    {
      framework: 'Contrarian',
      tag: 'Contrarian',
      coverArchetype: 'compare',
      coverStyle: 'versus-hook',
      centerIcon: 'shieldAlert',
      hookKicker: 'CONTRARIAN TAKE',
      enTitle: fitHookToWordRange(contrarianRaw, paddingPool, false),
      arTitle: buildArabicHookFromSlide2(signals, 'contrarian'),
      enBody: '',
      arBody: '',
      ...buildCoverTeaserPairFromSignals(signals, templateAngles[0]),
    },
    {
      framework: 'Specific Metric',
      tag: 'Specific Metric',
      coverArchetype: metric ? 'metric' : 'compare',
      coverStyle: metric ? 'metric-split' : 'versus-hook',
      centerIcon: 'gauge',
      hookKicker: metric ? `MEASURED SHIFT ${metric.toUpperCase()}` : 'SLIDE 2 EVIDENCE',
      enTitle: fitHookToWordRange(metricRaw, paddingPool, false),
      arTitle: buildArabicHookFromSlide2(signals, 'metric'),
      enBody: '',
      arBody: '',
      ...buildCoverTeaserPairFromSignals(signals, templateAngles[1]),
    },
    {
      framework: 'Mistake Callout',
      tag: 'Mistake Callout',
      coverArchetype: 'row',
      coverStyle: 'visual-teaser',
      centerIcon: 'alertTriangle',
      hookKicker: 'FAILURE MODE',
      enTitle: fitHookToWordRange(mistakeRaw, paddingPool, false),
      arTitle: buildArabicHookFromSlide2(signals, 'mistake'),
      enBody: '',
      arBody: '',
      ...buildCoverTeaserPairFromSignals(signals, templateAngles[2]),
    },
    {
      framework: 'Curiosity Gap',
      tag: 'Curiosity Gap',
      coverArchetype: 'row',
      coverStyle: 'headline-hero',
      centerIcon: 'zap',
      hookKicker: 'ROOT CAUSE',
      enTitle: fitHookToWordRange(curiosityWhyRaw, paddingPool, true),
      arTitle: buildArabicHookFromSlide2(signals, 'curiosity-why'),
      enBody: '',
      arBody: '',
      ...buildCoverTeaserPairFromSignals(signals, templateAngles[3]),
    },
    {
      framework: 'Curiosity Gap',
      tag: 'Curiosity Gap',
      coverArchetype: 'compare',
      coverStyle: 'visual-teaser',
      centerIcon: 'layers',
      hookKicker: 'THE MECHANISM',
      enTitle: fitHookToWordRange(curiosityHowRaw, paddingPool, true),
      arTitle: buildArabicHookFromSlide2(signals, 'curiosity-how'),
      enBody: '',
      arBody: '',
      ...buildCoverTeaserPairFromSignals(signals, templateAngles[4]),
    },
  ];

  const defaultTeasers = buildCoverTeaserPairFromSignals(signals, 'metric');
  const normalizedExisting: HookVariant[] = (existingVariants || [])
    .filter(
      (v) =>
        v &&
        v.enTitle &&
        v.arTitle &&
        !containsGenericHookFiller(v.enTitle) &&
        !containsGenericHookFiller(v.arTitle)
    )
    .map((v) => {
      const framework = inferHookFramework(v);
      const cleanEnTitle = fitHookToWordRange(v.enTitle, paddingPool);
      const cleanArTitle = stripNegativeSlideConstraints(v.arTitle);
      const cleanEnBody = clampOptionalSubheadline(v.enBody, 7);
      const cleanArBody = clampOptionalSubheadline(v.arBody, 7);
      const teaserEn = v.coverTeaserEn
        ? clampCoverTeaser(v.coverTeaserEn, false, 68)
        : cleanEnBody
          ? clampCoverTeaser(cleanEnBody, false, 68)
          : defaultTeasers.coverTeaserEn;
      const teaserAr = v.coverTeaserAr
        ? clampCoverTeaser(v.coverTeaserAr, true, 68)
        : cleanArBody
          ? clampCoverTeaser(cleanArBody, true, 68)
          : defaultTeasers.coverTeaserAr;
      const coverStyle =
        v.coverStyle ||
        inferCoverStyleForHook(
          framework,
          { enTitle: cleanEnTitle, enBody: cleanEnBody },
          v.coverArchetype
        );
      return {
        ...v,
        framework,
        tag: v.tag ? stripNegativeSlideConstraints(v.tag) : framework,
        enTitle: cleanEnTitle,
        arTitle: cleanArTitle,
        enBody: cleanEnBody,
        arBody: cleanArBody,
        coverStyle,
        coverTeaserEn: teaserEn,
        coverTeaserAr: teaserAr,
        ...(v.hookKicker ? { hookKicker: stripNegativeSlideConstraints(v.hookKicker).toUpperCase().slice(0, 32) } : {}),
      };
    });

  const result: HookVariant[] = [...normalizedExisting];
  const seenTitles = new Set(result.map((v) => v.enTitle.toLowerCase()));

  // Ensure every proven framework is represented, then fill to 5 total hook variations
  for (const template of dynamicTemplates) {
    if (result.length >= 5) break;
    const hasFramework = result.some((v) => v.framework === template.framework);
    if (!hasFramework && !seenTitles.has(template.enTitle.toLowerCase())) {
      result.push(template);
      seenTitles.add(template.enTitle.toLowerCase());
    }
  }

  for (const template of dynamicTemplates) {
    if (result.length >= 5) break;
    if (!seenTitles.has(template.enTitle.toLowerCase())) {
      result.push(template);
      seenTitles.add(template.enTitle.toLowerCase());
    }
  }

  return result.slice(0, 5);
}

/**
 * Enforces the Viral Copywriter & Conversion Strategist Hook Tier pipeline:
 * 1. Cleans body slides (zero emojis, zero banned clichés, zero colons in titles).
 * 2. Generates / normalizes 5 Hook Variations across Contrarian, Specific Metric, Mistake Callout, and Curiosity Gap
 *    dynamically derived from Slide 2's specific problem, metric, or architectural failure.
 * 3. Scores all 5 against virality heuristics and selects the highest-scoring option for Slide 1.
 * 4. Enforces Slide 1 length (6-12 words headline, optional <8 words sub-headline).
 */
export function applyViralHookTierSelection(
  carousel: CarouselData,
  rawSourceText: string = '',
  options: { preserveValidSlide1?: boolean } = {}
): CarouselData {
  if (!carousel.slides || carousel.slides.length === 0) {
    return carousel;
  }

  const isSingle = carousel.postFormat === 'single' || carousel.slides.length === 1;
  const cleanedSlides: SlideData[] = carousel.slides.map((slide, idx) => {
    const cleanEnTitle = stripNegativeSlideConstraints(slide.enTitle, {
      stripColons: idx === 0 || idx === carousel.slides.length - 1,
      stripCliches: true,
    });
    const cleanArTitle = stripNegativeSlideConstraints(slide.arTitle, {
      stripColons: idx === 0 || idx === carousel.slides.length - 1,
      stripCliches: false,
    });
    const cleanEnBody =
      idx === 0 && !isSingle
        ? clampOptionalSubheadline(slide.enBody, 7)
        : stripNegativeSlideConstraints(slide.enBody, { stripColons: false, stripCliches: true });
    const cleanArBody =
      idx === 0 && !isSingle
        ? clampOptionalSubheadline(slide.arBody, 7)
        : stripNegativeSlideConstraints(slide.arBody, { stripColons: false, stripCliches: false });

    return {
      ...slide,
      enTitle: cleanEnTitle,
      arTitle: cleanArTitle,
      enBody: cleanEnBody,
      arBody: cleanArBody,
      ...(slide.hookKicker
        ? { hookKicker: stripNegativeSlideConstraints(slide.hookKicker).toUpperCase().slice(0, 32) }
        : {}),
    };
  });

  const fiveHooks = buildBodyFirstHookVariations(
    cleanedSlides,
    rawSourceText,
    carousel.hookVariants || []
  );

  const bodySlides = cleanedSlides.length > 1 ? cleanedSlides.slice(1) : cleanedSlides;
  const scoredHooks = fiveHooks
    .map((hook) => {
      const breakdown = scoreHookVariant(hook, bodySlides, rawSourceText);
      return {
        ...hook,
        score: breakdown.score,
        selectionReason: breakdown.reasons.slice(0, 3).join(' • '),
      };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map((hook, idx) => ({
      ...hook,
      selected: idx === 0,
    }));

  const winner = scoredHooks[0];
  if (!winner) {
    return { ...carousel, slides: cleanedSlides };
  }

  const currentSlide1 = cleanedSlides[0];
  const currentSlide1Score = scoreHookVariant(
    {
      tag: 'Current',
      enTitle: currentSlide1.enTitle || '',
      arTitle: currentSlide1.arTitle || '',
      enBody: currentSlide1.enBody || '',
      arBody: currentSlide1.arBody || '',
    },
    bodySlides,
    rawSourceText
  );

  const slide1IsInvalid =
    currentSlide1Score.hasNegativeViolation ||
    currentSlide1Score.wordCount < 6 ||
    currentSlide1Score.wordCount > 12;

  const shouldPromoteWinner =
    slide1IsInvalid ||
    (!options.preserveValidSlide1 && (winner.score || 0) > currentSlide1Score.score);

  const signals = extractBodyContextSignals(cleanedSlides, rawSourceText);
  const fallbackTeasers = buildCoverTeaserPairFromSignals(signals, 'metric');
  const preserveCoverTeaserEn = currentSlide1.coverTeaserEn
    ? clampCoverTeaser(currentSlide1.coverTeaserEn, false, 68)
    : clampOptionalSubheadline(currentSlide1.enBody, 7)
      ? clampCoverTeaser(currentSlide1.enBody, false, 68)
      : '';
  const preserveCoverTeaserAr = currentSlide1.coverTeaserAr
    ? clampCoverTeaser(currentSlide1.coverTeaserAr, true, 68)
    : clampOptionalSubheadline(currentSlide1.arBody, 7)
      ? clampCoverTeaser(currentSlide1.arBody, true, 68)
      : '';

  if (shouldPromoteWinner && !isSingle) {
    cleanedSlides[0] = {
      ...currentSlide1,
      storyRole: 'hook',
      compositionPreset: currentSlide1.manualLayoutLocked
        ? currentSlide1.compositionPreset
        : 'headline-first',
      enTitle: fitHookToWordRange(winner.enTitle, signals.paddingPool),
      arTitle: winner.arTitle || currentSlide1.arTitle,
      enBody: '',
      arBody: '',
      coverStyle:
        winner.coverStyle ||
        currentSlide1.coverStyle ||
        inferCoverStyleForHook(winner.framework, currentSlide1, winner.coverArchetype),
      coverTeaserEn: winner.coverTeaserEn || preserveCoverTeaserEn || fallbackTeasers.coverTeaserEn,
      coverTeaserAr: winner.coverTeaserAr || preserveCoverTeaserAr || fallbackTeasers.coverTeaserAr,
      showSwipeCue: currentSlide1.showSwipeCue ?? true,
      hookKicker: winner.hookKicker || currentSlide1.hookKicker,
      ...(winner.coverArchetype && currentSlide1.type === 'hub'
        ? { type: winner.coverArchetype }
        : {}),
    };
  } else if (!isSingle && currentSlide1 && !currentSlide1.standaloneMeme) {
    cleanedSlides[0] = {
      ...currentSlide1,
      storyRole: 'hook',
      compositionPreset: currentSlide1.manualLayoutLocked
        ? currentSlide1.compositionPreset
        : 'headline-first',
      enBody: '',
      arBody: '',
      coverStyle:
        currentSlide1.coverStyle ||
        inferCoverStyleForHook(winner.framework, currentSlide1),
      coverTeaserEn: preserveCoverTeaserEn || winner.coverTeaserEn || fallbackTeasers.coverTeaserEn,
      coverTeaserAr: preserveCoverTeaserAr || winner.coverTeaserAr || fallbackTeasers.coverTeaserAr,
      showSwipeCue: currentSlide1.showSwipeCue ?? true,
    };
  }

  return {
    ...carousel,
    screenHook: stripNegativeSlideConstraints(
      carousel.screenHook || winner.enTitle,
      { stripColons: true, stripCliches: true }
    ),
    hookVariants: scoredHooks,
    slides: cleanedSlides,
  };
}
