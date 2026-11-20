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
  cveId: string;
  isSecurityTopic: boolean;
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

const PASSIVE_ATTRIBUTION_RE =
  /^(?:discovered|reported|disclosed|published|announced|found|identified|revealed|spotted|uncovered)\s+by\b|^(?:the\s+)?(?:security\s+)?research(?:ers?|\s+team)\s+(?:at|from)\b/i;

export function isPassiveAttributionClause(text: string | undefined): boolean {
  if (!text) return false;
  return PASSIVE_ATTRIBUTION_RE.test(text.trim());
}

export function isGrammaticallyBrokenHook(text: string | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (isPassiveAttributionClause(trimmed)) return true;
  if (
    /\b(?:how|why|when|where)\s+(?:discovered|reported|disclosed|announced|published|found|released|created|built|designed|written|spotted|identified)\s+by\b/i.test(
      trimmed
    )
  ) {
    return true;
  }
  if (/\b(?:how|why)\s+(?:the\s+)?(?:a|an)\s*$/i.test(trimmed)) return true;
  return false;
}

function cleanClause(text: string | undefined, maxWords: number = 14): string {
  if (!text) return '';
  const stripped = stripNegativeSlideConstraints(text, { stripColons: true, stripCliches: true });
  if (!stripped || containsGenericHookFiller(stripped)) return '';
  const clauses = stripped
    .split(/(?<!\d)(?<=[.!?])\s+|\n+/)
    .map((c) => c.replace(/[.?!،؟]+$/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const chosen = clauses.find((c) => !isPassiveAttributionClause(c) && c.split(/\s+/).length >= 3) || '';
  if (!chosen) return '';
  const words = chosen.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return chosen;
  const trimmed = words.slice(0, maxWords);
  while (
    trimmed.length > 4 &&
    (DANGLING_TRAILING_WORDS.has(trimmed[trimmed.length - 1].toLowerCase()) ||
      /^(?:lets|let|makes|make|keeps|keep|gives|give|shows|show|needs|need|allows|allow|helps|help|runs|run|uses|use)$/i.test(
        trimmed[trimmed.length - 1]
      ))
  ) {
    trimmed.pop();
  }
  return trimmed.join(' ').replace(/[,;:\-—–]+$/, '').trim();
}

function cleanArabicClause(text: string | undefined, allowSqlFallback: boolean = false): string {
  if (!text) return '';
  const stripped = stripNegativeSlideConstraints(text, { stripColons: true, stripCliches: false });
  if (!stripped || containsGenericHookFiller(stripped)) return '';
  if (!allowSqlFallback && /^الاستعلام عبر الشيفرة البرمجية\.?$/.test(stripped.trim())) return '';
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

  const cveMatch = allBodyCombined.match(/\bCVE-\d{4}-\d{4,7}\b/i);
  const cveId = cveMatch ? cveMatch[0].toUpperCase() : '';
  const isSecurityTopic =
    Boolean(cveId) ||
    /\b(?:vulnerability|zero[- ]?day|exploit|remote\s+code\s+execution|\brce\b|sandbox\s+escape|cvss|privilege\s+escalation|java4shell|log4shell|shellshock|openjdk|security\s+advisory|malicious\s+payload|unpatched|attack\s+surface|critical\s+flaw)\b|ثغرة|اختراق|أمن\s+سيبراني/i.test(
      allBodyCombined
    );
  const isSqlTopic = /\b(?:sql|psql|postgres|pgvector|query\s+planner)\b|<=>/i.test(allBodyCombined);

  const slide2ArTitle = cleanArabicClause(slide2?.arTitle, isSqlTopic);
  const slide2ArClause = cleanArabicClause(slide2?.arBody, isSqlTopic);
  const slide3ArTitle = cleanArabicClause(slide3?.arTitle, isSqlTopic);

  const paddingPool = [
    slide2BodyClause,
    slide2Title,
    slide3Mechanism,
    nodeLabels.join(' '),
    compareBefore,
    compareAfter,
    cveId,
    subject,
  ].filter(Boolean);

  return {
    subject,
    arSubject,
    cveId,
    isSecurityTopic,
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

  // 4. Scroll-stopping high-stakes & open-loop strength
  if (
    /\b(?:why|how|never|stop|wrong|mistake|cost|stall|exhaust|break|broke|fail|fails|expose|exposes|exposed|hijack|takeover|breach|unpatched|silent|silently|risk|threat|exploit|secret|instead|vs|actually|when|without|avoid|before)\b/i.test(
      title
    ) ||
    title.endsWith('?')
  ) {
    score += 12;
    reasons.push('High-stakes open-loop tension');
  } else {
    score += 2;
  }

  // 5. Bilingual RTL completeness
  if (countHeadlineWords(variant.arTitle) >= 3) {
    score += 5;
  } else {
    score -= 6;
  }

  // 6. Negative constraints, grammar integrity & generic filler audit
  if (isGrammaticallyBrokenHook(title)) {
    score -= 50;
    hasNegativeViolation = true;
    reasons.push('Broken grammar or passive attribution fragment');
  }
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
  const cveAnchor = signals.cveId || topic;

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

  if (signals.isSecurityTopic) {
    const secTemplates: Record<typeof angle, string> = {
      contrarian: `ثغرة ${cveAnchor} تعرض خوادم ${topic} للاختراق الصامت`,
      metric: metric
        ? `خطورة ${cveAnchor} (${metric}) تهدد بيئة ${topic} فوراً`
        : `كيف يتجاوز ${cveAnchor} عزل ${topic} في الإنتاج؟`,
      mistake: `تأخير ترقيع ${cveAnchor} يترك خوادم ${topic} مكشوفة`,
      'curiosity-why': `كيف تسمح ثغرة ${cveAnchor} بالسيطرة على ${topic}؟`,
      'curiosity-how': `مسار استغلال ${cveAnchor} وخطوات الإغلاق الفوري`,
    };
    return ensureArabicRtl(secTemplates[angle]);
  }

  if (angle === 'metric') {
    if (metric && arClause && arClause.includes(metric)) return ensureArabicRtl(arClause);
    if (metric && arTitle) return ensureArabicRtl(`${arTitle} بمؤشر ${metric} فعلياً`);
    if (arClause) return ensureArabicRtl(arClause);
  }

  if (angle === 'mistake') {
    if (arClause && arClause !== arTitle) return ensureArabicRtl(arClause);
    if (arTitle) return ensureArabicRtl(`الخطأ المكلف في ${topic} عند التشغيل الفعلي`);
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
    effectiveType === 'row' ||
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
  angle: 'contrarian' | 'metric' | 'mistake' | 'curiosity-why' | 'curiosity-how' = 'metric',
  excludeArTitle?: string
): { coverTeaserEn: string; coverTeaserAr: string } {
  const metricPart = signals.metric ? `${signals.metric} ` : '';
  const safeBodyClause =
    signals.slide2BodyClause && !isPassiveAttributionClause(signals.slide2BodyClause)
      ? signals.slide2BodyClause
      : '';
  const secAnchor = signals.cveId || signals.subject;

  const enCandidates: Record<typeof angle, string> = signals.isSecurityTopic
    ? {
        contrarian: `How ${secAnchor} escapes runtime checks and what to patch first`,
        metric: signals.metric
          ? `${metricPart}exposure across ${signals.subject} and the patch window`
          : `See the exact ${secAnchor} exploit chain and emergency fix`,
        mistake: `Three steps to audit exposed ${signals.subject} nodes right now`,
        'curiosity-why': `Inside the ${secAnchor} attack path from input to host`,
        'curiosity-how': `Step-by-step ${secAnchor} breakdown and containment checklist`,
      }
    : {
        contrarian:
          signals.compareBefore && signals.compareAfter
            ? `${signals.compareBefore} vs ${signals.compareAfter} under real load`
            : safeBodyClause || `See why ${signals.subject} breaks under real contention`,
        metric:
          signals.metric && signals.slide2Title
            ? `${metricPart}impact measured across ${signals.subject} paths`
            : safeBodyClause || `The real numbers behind ${signals.subject} at scale`,
        mistake:
          (signals.slide2Problem && !isPassiveAttributionClause(signals.slide2Problem)
            ? signals.slide2Problem
            : safeBodyClause) || `Where ${signals.subject} silently fails first in production`,
        'curiosity-why': signals.slide3Mechanism
          ? `Inside ${signals.slide3Mechanism} and the hidden failure trigger`
          : safeBodyClause || `What triggers the bottleneck across ${signals.subject}`,
        'curiosity-how':
          signals.nodeLabels.length >= 2
            ? `${signals.nodeLabels.slice(0, 3).join(' -> ')} runtime trace inside`
            : safeBodyClause || `Step-by-step trace of how ${signals.subject} behaves`,
      };

  const arCandidates: Record<typeof angle, string> = signals.isSecurityTopic
    ? {
        contrarian: `تفاصيل مسار الاستغلال وخطوات العزل الفوري لخوادم ${signals.arSubject}`,
        metric: signals.metric
          ? `تقييم الأثر الفعلي بمؤشر ${signals.metric} وخطة التحديث العاجل`
          : `تتبع عملي لمسار الثغرة وكيفية تأمين ${signals.arSubject} فوراً`,
        mistake: `ثلاث خطوات فورية لفحص الإصدارات المتأثرة وإغلاق الثغرة`,
        'curiosity-why': `من الإدخال غير الموثوق إلى التنفيذ الفعلي داخل ${signals.arSubject}`,
        'curiosity-how': `تفكيك عملي لسلسلة الهجوم وأولويات الحماية في الإنتاج`,
      }
    : {
        contrarian: `الفارق الحقيقي في الأداء عند تشغيل ${signals.arSubject} تحت الضغط`,
        metric: signals.metric
          ? `قياس الأثر الفعلي بمؤشر ${signals.metric} داخل ${signals.arSubject}`
          : `الأرقام والتفاصيل الهندسية التي تحسم أداء ${signals.arSubject}`,
        mistake: `أين يبدأ التعطل الصامت في ${signals.arSubject} وكيف تتجنبه`,
        'curiosity-why': `تفكيك المسار الداخلي والسبب الجذري وراء هذا الاختناق`,
        'curiosity-how': `تتبع خطوة بخطوة لبنية ${signals.arSubject} في بيئة الإنتاج`,
      };

  const rawEn =
    containsGenericHookFiller(enCandidates[angle]) || isPassiveAttributionClause(enCandidates[angle])
      ? `See the exact failure chain and fix inside ${signals.subject}`
      : enCandidates[angle];

  let rawAr = containsGenericHookFiller(arCandidates[angle])
    ? `تتبع عملي لبنية ${signals.arSubject} في بيئة الإنتاج`
    : arCandidates[angle];

  if (excludeArTitle && rawAr.trim().replace(/[.؟!]+$/, '') === excludeArTitle.trim().replace(/[.؟!]+$/, '')) {
    rawAr = signals.isSecurityTopic
      ? `خطوات الفحص والعزل الفوري لتأمين خوادم ${signals.arSubject}`
      : `تتبع خطوة بخطوة لما يحدث داخل ${signals.arSubject} فعلياً`;
  }

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
  const {
    subject,
    cveId,
    isSecurityTopic,
    metric,
    slide2Title,
    slide2BodyClause,
    slide2Problem,
    slide3Mechanism,
    compareBefore,
    compareAfter,
    paddingPool,
  } = signals;

  const rawProbLead = stripLeadingHookStarter(slide2Problem || slide2Title || slide2BodyClause || subject);
  const probLead = isPassiveAttributionClause(rawProbLead) ? `${subject} production failure` : rawProbLead;
  const s3Clean = stripLeadingHookStarter(slide3Mechanism);
  const s2TitleClean = stripLeadingHookStarter(slide2Title);
  const altClause =
    slide2BodyClause &&
    !isPassiveAttributionClause(slide2BodyClause) &&
    slide2BodyClause.toLowerCase() !== probLead.toLowerCase()
      ? slide2BodyClause
      : s3Clean || s2TitleClean;

  const secAnchor = cveId || subject;
  const subjectHasCve = Boolean(cveId && subject.toUpperCase().includes(cveId));
  const secTarget = subjectHasCve ? subject : cveId ? `${cveId} inside ${subject}` : subject;

  const contrarianRaw = isSecurityTopic
    ? `One unpatched ${subject} server lets ${secAnchor} compromise your stack`
    : compareBefore && compareAfter && compareBefore.toLowerCase() !== compareAfter.toLowerCase()
      ? `Skipping ${compareBefore} breaks ${subject} before ${compareAfter} helps`
      : s3Clean && s3Clean.toLowerCase() !== probLead.toLowerCase() && !isPassiveAttributionClause(s3Clean)
        ? `Why ${lowerFirst(probLead)} silently breaks ${subject} in production`
        : `Why ${lowerFirst(probLead)} breaks before teams notice ${subject}`;

  const metricRaw = isSecurityTopic
    ? metric
      ? `How ${secAnchor} turns ${metric} exposure into full host takeover`
      : `How ${secTarget} bypasses runtime isolation before teams patch`
    : metric
      ? altClause && altClause.toLowerCase().includes(metric.toLowerCase())
        ? altClause
        : probLead.toLowerCase().includes(metric.toLowerCase())
          ? probLead
          : `How ${lowerFirst(probLead)} triggers ${metric} overhead in ${subject}`
      : `How ${lowerFirst(s2TitleClean || probLead)} changes ${lowerFirst(s3Clean || subject)} performance`;

  const mistakeRaw = isSecurityTopic
    ? `Waiting to patch ${secAnchor} leaves ${subject} production exposed`
    : tokenizeWords(slide2BodyClause).length >= 6 &&
      !isPassiveAttributionClause(slide2BodyClause) &&
      /\b(?:stall|exhaust|consume|block|fail|drop|spike|leak|break|overhead|unpooled|manual)\w*\b/i.test(slide2BodyClause)
      ? slide2BodyClause
      : `The costly ${subject} mistake hiding inside ${lowerFirst(probLead)}`;

  const curiosityWhyRaw = isSecurityTopic
    ? `How does ${secAnchor} hijack ${subject} without triggering alerts?`
    : `Why does ${lowerFirst(probLead)} silently break ${subject} under load?`;

  const s3VerbSafe = s3Clean.replace(/\bconnects\b/gi, 'connect').replace(/\bbreaks\b/gi, 'break');
  const curiosityHowRaw = isSecurityTopic
    ? `What happens when ${secAnchor} hits an unpatched ${subject} node?`
    : s3VerbSafe && s3VerbSafe.toLowerCase() !== s2TitleClean.toLowerCase() && !isPassiveAttributionClause(s3VerbSafe)
      ? `How does ${lowerFirst(s3VerbSafe)} stop ${lowerFirst(s2TitleClean || probLead)}?`
      : `What breaks inside ${subject} when ${lowerFirst(probLead)} hits?`;

  const templateAngles: Array<'contrarian' | 'metric' | 'mistake' | 'curiosity-why' | 'curiosity-how'> = [
    'contrarian',
    'metric',
    'mistake',
    'curiosity-why',
    'curiosity-how',
  ];

  const makeTemplateVariant = (
    idx: number,
    config: Omit<HookVariant, 'arTitle' | 'enBody' | 'arBody' | 'coverTeaserEn' | 'coverTeaserAr'>
  ): HookVariant => {
    const angle = templateAngles[idx];
    const arTitle = buildArabicHookFromSlide2(signals, angle);
    return {
      ...config,
      arTitle,
      enBody: '',
      arBody: '',
      ...buildCoverTeaserPairFromSignals(signals, angle, arTitle),
    };
  };

  const dynamicTemplates: HookVariant[] = [
    makeTemplateVariant(0, {
      framework: 'Contrarian',
      tag: isSecurityTopic ? 'Critical Threat' : 'Contrarian',
      coverArchetype: isSecurityTopic ? 'row' : 'compare',
      coverStyle: isSecurityTopic ? 'visual-teaser' : 'versus-hook',
      centerIcon: 'shieldAlert',
      hookKicker: isSecurityTopic ? (cveId ? `CRITICAL CVE • ${cveId}` : 'CRITICAL THREAT') : 'CONTRARIAN TAKE',
      enTitle: fitHookToWordRange(contrarianRaw, paddingPool, false),
    }),
    makeTemplateVariant(1, {
      framework: 'Specific Metric',
      tag: isSecurityTopic ? 'Exploit Impact' : 'Specific Metric',
      coverArchetype: metric ? 'metric' : 'row',
      coverStyle: metric ? 'metric-split' : 'visual-teaser',
      centerIcon: isSecurityTopic ? 'shieldAlert' : 'gauge',
      hookKicker: metric
        ? `MEASURED SHIFT ${metric.toUpperCase()}`
        : isSecurityTopic
          ? 'SECURITY ADVISORY'
          : 'SLIDE 2 EVIDENCE',
      enTitle: fitHookToWordRange(metricRaw, paddingPool, false),
    }),
    makeTemplateVariant(2, {
      framework: 'Mistake Callout',
      tag: 'Mistake Callout',
      coverArchetype: 'row',
      coverStyle: 'visual-teaser',
      centerIcon: 'alertTriangle',
      hookKicker: isSecurityTopic ? 'EXPOSURE RISK' : 'FAILURE MODE',
      enTitle: fitHookToWordRange(mistakeRaw, paddingPool, false),
    }),
    makeTemplateVariant(3, {
      framework: 'Curiosity Gap',
      tag: 'Curiosity Gap',
      coverArchetype: 'row',
      coverStyle: 'headline-hero',
      centerIcon: 'zap',
      hookKicker: isSecurityTopic ? 'EXPLOIT CHAIN' : 'ROOT CAUSE',
      enTitle: fitHookToWordRange(curiosityWhyRaw, paddingPool, true),
    }),
    makeTemplateVariant(4, {
      framework: 'Curiosity Gap',
      tag: 'Curiosity Gap',
      coverArchetype: 'compare',
      coverStyle: 'versus-hook',
      centerIcon: 'layers',
      hookKicker: isSecurityTopic ? 'PATCH VS EXPOSED' : 'THE MECHANISM',
      enTitle: fitHookToWordRange(curiosityHowRaw, paddingPool, true),
    }),
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
    const resolvedSlideType: SlideType =
      winner.coverArchetype && currentSlide1.type === 'hub'
        ? winner.coverArchetype
        : currentSlide1.type;
    const alignedCoverStyle: CoverStyle =
      resolvedSlideType === 'compare'
        ? 'versus-hook'
        : resolvedSlideType === 'metric'
          ? 'metric-split'
          : resolvedSlideType === 'row' || resolvedSlideType === 'subjectPair' || resolvedSlideType === 'code'
            ? 'visual-teaser'
            : winner.coverStyle ||
              currentSlide1.coverStyle ||
              inferCoverStyleForHook(winner.framework, currentSlide1, resolvedSlideType);

    const nextArTitle = winner.arTitle || currentSlide1.arTitle;
    let nextCoverTeaserAr = winner.coverTeaserAr || preserveCoverTeaserAr || fallbackTeasers.coverTeaserAr;
    if (
      nextArTitle &&
      nextCoverTeaserAr &&
      nextCoverTeaserAr.trim().replace(/[.؟!]+$/, '') === nextArTitle.trim().replace(/[.؟!]+$/, '')
    ) {
      nextCoverTeaserAr = buildCoverTeaserPairFromSignals(signals, 'curiosity-how', nextArTitle).coverTeaserAr;
    }

    cleanedSlides[0] = {
      ...currentSlide1,
      type: resolvedSlideType,
      storyRole: 'hook',
      compositionPreset: currentSlide1.manualLayoutLocked
        ? currentSlide1.compositionPreset
        : 'headline-first',
      enTitle: fitHookToWordRange(winner.enTitle, signals.paddingPool),
      arTitle: nextArTitle,
      enBody: '',
      arBody: '',
      coverStyle: alignedCoverStyle,
      coverTeaserEn: winner.coverTeaserEn || preserveCoverTeaserEn || fallbackTeasers.coverTeaserEn,
      coverTeaserAr: nextCoverTeaserAr,
      showSwipeCue: currentSlide1.showSwipeCue ?? true,
      hookKicker: winner.hookKicker || currentSlide1.hookKicker,
    };
  } else if (!isSingle && currentSlide1 && !currentSlide1.standaloneMeme) {
    const alignedExistingCoverStyle: CoverStyle =
      currentSlide1.type === 'compare'
        ? 'versus-hook'
        : currentSlide1.type === 'row' || currentSlide1.type === 'subjectPair' || currentSlide1.type === 'code'
          ? 'visual-teaser'
          : currentSlide1.coverStyle ||
            inferCoverStyleForHook(winner.framework, currentSlide1, currentSlide1.type);
    const existingArTitle = currentSlide1.arTitle || '';
    let nextCoverTeaserAr = preserveCoverTeaserAr || winner.coverTeaserAr || fallbackTeasers.coverTeaserAr;
    if (
      existingArTitle &&
      nextCoverTeaserAr &&
      nextCoverTeaserAr.trim().replace(/[.؟!]+$/, '') === existingArTitle.trim().replace(/[.؟!]+$/, '')
    ) {
      nextCoverTeaserAr = buildCoverTeaserPairFromSignals(signals, 'curiosity-how', existingArTitle).coverTeaserAr;
    }
    cleanedSlides[0] = {
      ...currentSlide1,
      storyRole: 'hook',
      compositionPreset: currentSlide1.manualLayoutLocked
        ? currentSlide1.compositionPreset
        : 'headline-first',
      enBody: '',
      arBody: '',
      coverStyle: alignedExistingCoverStyle,
      coverTeaserEn: preserveCoverTeaserEn || winner.coverTeaserEn || fallbackTeasers.coverTeaserEn,
      coverTeaserAr: nextCoverTeaserAr,
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
