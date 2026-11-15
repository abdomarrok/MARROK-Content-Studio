/**
 * Shared Input Sufficiency Guard (UI + Pipeline + Offline Synthesizer + /api/generate)
 *
 * Rejects empty, trivial, or thin inputs (< 20 chars OR < 4 meaningful words)
 * when no readable media context is attached, preventing generic placeholder decks.
 */

export interface SourceSufficiencyInput {
  prompt?: string | null;
  imageFileName?: string | null;
  hasMedia?: boolean;
  categoryHint?: string | null;
  postFormat?: string;
}

export interface SourceSufficiencyResult {
  isSufficient: boolean;
  reason: string;
  charCount: number;
  meaningfulWordCount: number;
}

export class InsufficientSourceError extends Error {
  readonly code = 'INSUFFICIENT_SOURCE' as const;
  readonly details: SourceSufficiencyResult;

  constructor(result: SourceSufficiencyResult) {
    super(result.reason);
    this.name = 'InsufficientSourceError';
    this.details = result;
  }
}

const THIN_STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
  'it', 'this', 'that', 'these', 'those', 'about', 'into', 'over', 'after', 'before',
  'make', 'create', 'build', 'generate', 'write', 'post', 'deck', 'carousel', 'slide',
  'slides', 'topic', 'something', 'anything', 'test', 'demo', 'sample', 'please', 'pls',
  'how', 'why', 'what', 'when', 'where', 'which', 'who', 'can', 'could', 'would', 'should',
  // Arabic stop words
  'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تلك', 'كيف', 'لماذا',
  'ما', 'ماذا', 'متى', 'أين', 'عن', 'حول', 'ان', 'أن', 'كان', 'يكون', 'هو', 'هي',
  'أو', 'ثم', 'بل', 'لكن', 'حتى', 'منذ', 'عند', 'بين', 'نحو', 'فوق', 'تحت', 'ضد',
  'اصنع', 'اكتب', 'انشئ', 'أنشئ', 'موضوع', 'بوست', 'منشور', 'شريحة', 'سلايد',
]);

const GENERIC_CAMERA_FILENAME_RE = /^(?:IMG|DSC|PXL|SCREENSHOT|SCREEN_SHOT|PHOTO|IMAGE|PIC|FILE|UNTITLED|CLIP|VIDEO|AUDIO|DOC)[-_ \d.]*$/i;
const BARE_NUMERIC_FILENAME_RE = /^[\d_-]+\.[a-z0-9]{2,5}$/i;

const VALID_HTTP_URL_RE = /https?:\/\/((?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d{2,5})?(\/[^\s?#]*)?(?:\?[^\s#]*)?(?:#[^\s]*)?/gi;
const ARABIC_CHAR_RE = /[\u0600-\u06FF]/;

function extractMeaningfulTextFromUrls(raw: string): string {
  const tokens: string[] = [];
  for (const match of raw.matchAll(VALID_HTTP_URL_RE)) {
    const host = (match[1] || '').replace(/^www\./i, '').split('.')[0] || '';
    const pathSlug = (match[2] || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[/_\-.+~]+/g, ' ').trim();
    if (host && host.length >= 2) tokens.push(host);
    if (pathSlug) tokens.push(pathSlug);
  }
  return tokens.join(' ').trim();
}

function hasValidSourceUrl(raw: string): boolean {
  for (const match of raw.matchAll(VALID_HTTP_URL_RE)) {
    const host = (match[1] || '').toLowerCase();
    // Require a real public-looking domain (e.g. discord.com, sqlite.org, sub.domain.io)
    const parts = host.split('.').filter(Boolean);
    if (parts.length >= 2 && parts[0].length >= 2 && parts[parts.length - 1].length >= 2) {
      return true;
    }
  }
  return false;
}

function normalizeMeaningfulText(raw: string, includeUrlSlugTokens: boolean = false): string {
  const urlSlug = includeUrlSlugTokens ? extractMeaningfulTextFromUrls(raw || '') : '';
  const stripped = (raw || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/#[A-Za-z0-9_\u0600-\u06FF]+/g, ' ')
    .replace(/[.,!?;:'"()[\]{}<>@$%^&*+=~`|\\/—–\-_…،؛؟]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [stripped, urlSlug].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function isSemanticMediaFilename(filename?: string | null): boolean {
  const raw = (filename || '').trim();
  if (!raw) return false;
  if (BARE_NUMERIC_FILENAME_RE.test(raw)) return false;
  const base = raw.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim();
  if (!base || GENERIC_CAMERA_FILENAME_RE.test(base)) return false;
  const cleaned = normalizeMeaningfulText(base);
  return cleaned.length >= 12 && countMeaningfulWords(cleaned) >= 2;
}

export function countMeaningfulWords(text: string, includeUrlSlugTokens: boolean = false): number {
  const cleaned = normalizeMeaningfulText(text, includeUrlSlugTokens);
  if (!cleaned) return 0;
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  let count = 0;
  for (const token of tokens) {
    const lower = token.toLowerCase();
    // Require at least 2 characters and exclude common filler/stop words and bare file extensions
    if (token.length < 2) continue;
    if (THIN_STOP_WORDS.has(lower)) continue;
    if (/^(?:png|jpg|jpeg|webp|gif|svg|mp4|webm|mov|html|php|aspx)$/i.test(lower)) continue;
    count += 1;
  }
  return count;
}

export function validateSourceSufficiency(input: SourceSufficiencyInput): SourceSufficiencyResult {
  const rawPrompt = (input.prompt || '').trim();
  const containsUrl = hasValidSourceUrl(rawPrompt);
  const normalizedPrompt = normalizeMeaningfulText(rawPrompt, containsUrl);
  const charCount = normalizedPrompt.length;
  const meaningfulWordCount = countMeaningfulWords(rawPrompt, containsUrl);

  // Media attachment (screenshot/image OCR/video) intentionally enables generation
  // unless an explicit prompt was entered with no real text.
  if (input.hasMedia) {
    return {
      isSufficient: true,
      reason: 'Media source attached for visual synthesis.',
      charCount,
      meaningfulWordCount,
    };
  }

  // If imageFileName alone was supplied without image binary data, only allow it when semantic
  if (!rawPrompt && input.imageFileName) {
    if (isSemanticMediaFilename(input.imageFileName)) {
      const cleanedName = normalizeMeaningfulText(
        input.imageFileName.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ')
      );
      return {
        isSufficient: true,
        reason: 'Descriptive media filename supplied.',
        charCount: cleanedName.length,
        meaningfulWordCount: countMeaningfulWords(cleanedName),
      };
    }
    return {
      isSufficient: false,
      reason:
        'Please provide a real topic, URL, or paste source notes (at least 20 characters / 4 words EN, or concise Arabic claim) or attach a readable screenshot.',
      charCount: 0,
      meaningfulWordCount: 0,
    };
  }

  // Valid source URLs (e.g. engineering blog URLs, papers, docs) are accepted directly
  if (containsUrl && charCount >= 6) {
    return {
      isSufficient: true,
      reason: 'Valid source URL provided for extraction.',
      charCount,
      meaningfulWordCount: Math.max(1, meaningfulWordCount),
    };
  }

  // Concise Arabic topics/claims carry high semantic density per word (allow >= 12 chars & >= 3 meaningful Arabic words)
  const hasArabic = ARABIC_CHAR_RE.test(normalizedPrompt);
  if (hasArabic) {
    if (charCount >= 12 && meaningfulWordCount >= 3) {
      return {
        isSufficient: true,
        reason: 'Arabic source meets minimum length and word sufficiency requirements.',
        charCount,
        meaningfulWordCount,
      };
    }
    return {
      isSufficient: false,
      reason:
        'النص أو الموضوع قصير جداً. يرجى لصق مقال أو فكرة واضحة (3 كلمات عربية ذات معنى على الأقل) أو رابط مصدر قبل التوليد.',
      charCount,
      meaningfulWordCount,
    };
  }

  if (!rawPrompt || charCount < 20 || meaningfulWordCount < 4) {
    return {
      isSufficient: false,
      reason:
        'Source is too thin to generate a real deck. Please paste an article excerpt, valid URL, or brief with at least 20 characters and 4 meaningful words.',
      charCount,
      meaningfulWordCount,
    };
  }

  return {
    isSufficient: true,
    reason: 'Source meets minimum length and word sufficiency requirements.',
    charCount,
    meaningfulWordCount,
  };
}
