import { normalizePunctuation, stripMarkdown } from './markdown.ts';

/**
 * Standard technical metrics translator for natural Arabic presentation.
 * Converts trailing Latin unit tokens that cause BiDi punctuation inversion (e.g. "510 GB.")
 * into safe, natural Arabic words or un-flippable token structures.
 */
export function sanitizeMetricForArabic(rawMetric: string): string {
  if (!rawMetric) return '';
  const clean = normalizePunctuation(stripMarkdown(rawMetric)).trim();

  // Handle standard storage/memory units
  if (/\b(\d+(?:\.\d+)?)\s*GB\b/i.test(clean)) {
    return clean.replace(/\b(\d+(?:\.\d+)?)\s*GB\b/gi, '$1 جيجابايت');
  }
  if (/\b(\d+(?:\.\d+)?)\s*TB\b/i.test(clean)) {
    return clean.replace(/\b(\d+(?:\.\d+)?)\s*TB\b/gi, '$1 تيرابايت');
  }
  if (/\b(\d+(?:\.\d+)?)\s*MB\b/i.test(clean)) {
    return clean.replace(/\b(\d+(?:\.\d+)?)\s*MB\b/gi, '$1 ميجابايت');
  }

  // Handle speed / latency units
  if (/\b(\d+(?:\.\d+)?)\s*ms\b/i.test(clean)) {
    return clean.replace(/\b(\d+(?:\.\d+)?)\s*ms\b/gi, '$1 مللي ثانية');
  }
  if (/\b(\d+(?:\.\d+)?)\s*s\b/i.test(clean)) {
    return clean.replace(/\b(\d+(?:\.\d+)?)\s*s\b/gi, '$1 ثواني');
  }
  if (/\b(\d+(?:\.\d+)?)\s*μs\b/i.test(clean)) {
    return clean.replace(/\b(\d+(?:\.\d+)?)\s*μs\b/gi, '$1 ميكروثانية');
  }

  // Handle multipliers: 10x -> 10 أضعاف or 10x
  if (/\b(\d+(?:\.\d+)?)\s*x\b/i.test(clean)) {
    return clean.replace(/\b(\d+(?:\.\d+)?)\s*x\b/gi, '$1 ضعفاً');
  }

  // Strip trailing periods so BiDi won't invert
  return clean.replace(/[.?!]$/, '');
}

/**
 * Removes legacy artificial "المعتمد" suffixes that were previously appended after English terms
 * (e.g. "Durable Objects المعتمد." -> "Durable Objects.").
 */
export function stripLegacyArabicFiller(arabicText: string): string {
  if (!arabicText) return '';
  return arabicText.replace(
    /([A-Za-z0-9$€£%+._\-/:]+)\s+المعتمد(?=\s*[.?!،؟]*\s*$)/g,
    '$1'
  );
}

/**
 * Fixes Arabic line ending punctuation without injecting artificial words like "المعتمد".
 * Strips any legacy "المعتمد" filler and places an invisible Unicode Right-to-Left Mark (\u200F)
 * between a trailing Latin token and final punctuation so the period stays on the left in RTL.
 */
export function fixArabicPunctuation(arabicText: string): string {
  if (!arabicText) return '';
  const cleaned = stripLegacyArabicFiller(arabicText.trim());
  return cleaned.replace(/([a-zA-Z0-9_\-]+)\s*([.?!،؟])$/, '$1\u200F$2');
}

/**
 * Sanitizes Arabic slide titles and body text to prevent BiDi reordering bugs (Spec §8).
 * - Strips raw English markdown headers accidentally prepended (like ":Deepseek 4.1 Flash 1017 #")
 * - Fixes colons touching Latin words (e.g. "رحلة :Scion" -> "رحلة Scion")
 * - Replaces trailing Latin unit abbreviations that have natural Arabic equivalents
 * - Strips trailing periods from Arabic slide titles (slide graphic titles never need periods)
 */
export function sanitizeArabicSlideText(
  text: string,
  options: { isTitle?: boolean } = {}
): string {
  if (!text) return '';

  let clean = stripMarkdown(text);
  clean = normalizePunctuation(clean);
  clean = stripLegacyArabicFiller(clean);

  // Remove rogue Latin title copy-pastes at the start of Arabic strings
  // E.g. ":Deepseek 4.1 Flash 1017 # قفزة في الأداء" -> "قفزة في الأداء"
  clean = clean.replace(/^[\s:#\-_]*[a-zA-Z0-9.\-_ ]+[:#\-_]+\s*(?=[\u0600-\u06FF])/g, '');

  // Strip leading colons, hashes, dashes
  clean = clean.replace(/^[:#\-_،؛\s]+/, '').trim();

  // Fix colons adjacent to Latin characters which causes BiDi character order scrambling
  // E.g. ":Anthropic" -> " Anthropic", "Scion:" -> "Scion "
  clean = clean.replace(/:\s*([a-zA-Z0-9])/g, ' $1').replace(/([a-zA-Z0-9])\s*:/g, '$1 ');

  // Prevent trailing Latin unit with period inversion (e.g. "510 GB." or "510 .GB" -> "510 جيجابايت")
  clean = clean
    .replace(/\b(\d+(?:\.\d+)?)\s*\.?GB\.?/gi, '$1 جيجابايت')
    .replace(/\b(\d+(?:\.\d+)?)\s*\.?TB\.?/gi, '$1 تيرابايت')
    .replace(/\b(\d+(?:\.\d+)?)\s*\.?MB\.?/gi, '$1 ميجابايت')
    .replace(/\b(\d+(?:\.\d+)?)\s*\.?ms\.?/gi, '$1 مللي ثانية');

  // Translate math inequalities and constraints into natural Arabic words
  // Eliminates severe BiDi glyph flipping like "('150 >" from "< $150" across line wraps
  clean = clean
    .replace(/<=\s*([\$€£]?\s*\d+(?:\.\d+)?)/g, 'بحد أقصى $1')
    .replace(/>=\s*([\$€£]?\s*\d+(?:\.\d+)?)/g, 'بحد أدنى $1')
    .replace(/<\s*([\$€£]?\s*\d+(?:\.\d+)?)/g, 'أقل من $1')
    .replace(/>\s*([\$€£]?\s*\d+(?:\.\d+)?)/g, 'أكثر من $1')
    .replace(/\(\s*['"]?([^\)]*?)(أقل من|أكثر من|بحد أقصى|بحد أدنى)([^)]*?)['"]?\s*\)/g, '($1$2$3)');

  // Fix orphan Latin words on their own line (prevents "Zero-Trust" hanging alone on line 2)
  const lines = clean.split('\n');
  if (lines.length > 1) {
    const fixedLines: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // If line is just a single Latin token, merge with previous line
      if (line && /^[a-zA-Z0-9\-_.]+$/.test(line) && fixedLines.length > 0) {
        fixedLines[fixedLines.length - 1] = `${fixedLines[fixedLines.length - 1]} ${line}`;
      } else {
        fixedLines.push(line);
      }
    }
    clean = fixedLines.join('\n');
  }

  // If title, never end with a period or colon (prevents BiDi flipping on line end)
  if (options.isTitle) {
    clean = clean.replace(/[.:;،؛\s]+$/, '').trim();
  } else {
    clean = clean.replace(/([a-zA-Z0-9_\-]+)\s*([.?!،؟])$/, '$1\u200F$2');
  }

  return repairTruncatedTextEllipsis(clean);
}

/**
 * Wraps embedded Latin words, multi-word technical terms (e.g. "Durable Objects", "Workers"),
 * and technical metrics inside an RTL Arabic line with Unicode Left-to-Right Isolate
 * (\u2066 ... \u2069) plus Right-to-Left Marks (\u200F) anchoring line boundaries and trailing
 * punctuation so Canvas 2D and native text renderers never scramble word order or flip periods.
 */
export function isolateEmbeddedLatinInArabic(text: string): string {
  if (!text) return '';
  const cleaned = stripLegacyArabicFiller(text);
  if (!/[\u0600-\u06FF]/.test(cleaned) || !/[A-Za-z0-9]/.test(cleaned)) {
    return cleaned;
  }
  const stripped = cleaned.replace(/[\u200E\u200F\u2066\u2067\u2068\u2069\u202A-\u202E]/g, '');
  // Isolate each embedded Latin/numeric phrase (without swallowing trailing sentence punctuation)
  const isolated = stripped.replace(
    /([A-Za-z0-9$€£%+][A-Za-z0-9$€£%+._\-/:]*[A-Za-z0-9%+]?(?:\s+[A-Za-z0-9$€£%+][A-Za-z0-9$€£%+._\-/:]*[A-Za-z0-9%+]?)*)/g,
    '\u2066$1\u2069\u200F'
  );
  // Anchor both ends of the line with Right-to-Left Marks (\u200F) so leading Latin words stay on the right
  // and trailing punctuation (e.g. ".") stays on the far left of the RTL line.
  return `\u200F${isolated}\u200F`;
}

/**
 * Splits an Arabic string into segments of RTL Arabic and LTR Latin/numeric runs
 * so React DOM components can render `dir="rtl"` with `<bdi dir="ltr">` around embedded English.
 */
export function splitArabicForBidiRender(
  text: string
): Array<{ text: string; isLtr: boolean }> {
  if (!text) return [];
  const clean = stripLegacyArabicFiller(
    text.replace(/[\u200E\u200F\u2066\u2067\u2068\u2069\u202A-\u202E]/g, '')
  );
  const regex =
    /([A-Za-z0-9$€£%+][A-Za-z0-9$€£%+._\-/:]*[A-Za-z0-9%+]?(?:\s+[A-Za-z0-9$€£%+][A-Za-z0-9$€£%+._\-/:]*[A-Za-z0-9%+]?)*)/g;
  const segments: Array<{ text: string; isLtr: boolean }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(clean)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: clean.slice(lastIndex, match.index), isLtr: false });
    }
    segments.push({ text: match[0], isLtr: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < clean.length) {
    segments.push({ text: clean.slice(lastIndex), isLtr: false });
  }
  return segments;
}

/**
 * Detects and repairs truncated trailing descriptions like
 * "core mechanisms, operational boundaries, and..." or "...و"
 * so slide copy never ends in a dangling conjunction or silent ellipsis.
 */
export function repairTruncatedTextEllipsis(text: string): string {
  if (!text) return '';
  let clean = text.trim();

  // Case 1: ", item, and..." -> " and item."
  clean = clean.replace(
    /,\s*([^,.;:?!…]+?),\s*(?:and|or|with|plus|including|as well as)\s*(?:\.{2,}|…)+\s*$/i,
    ' and $1.'
  );

  // Case 2: Trailing English conjunction or preposition before ellipsis ("...and...", "...for...")
  clean = clean.replace(
    /[,;:\s]+\b(?:and|or|with|for|to|in|of|by|from|into|including|such as|like|versus|vs\.?)\s*(?:\.{2,}|…)+\s*$/i,
    '.'
  );

  // Case 3: Trailing Arabic conjunction before ellipsis ("...و", "و...")
  clean = clean.replace(/[,،؛\s]+(?:و|أو|مع|في|من|إلى|على)\s*(?:\.{2,}|…)+\s*$/, '.');

  // Case 4: Generic trailing ellipsis after a complete clause
  if (/(?:\.{3}|…)\s*$/.test(clean)) {
    clean = clean
      .replace(/[,;،؛:\s]*(?:\.{3}|…)+\s*$/, '')
      .replace(/\s+\b(?:and|or|with|for|to|in|of|by|the|a|an)$/i, '')
      .trim();
    if (clean && !/[.?!؟]$/.test(clean) && !/[\u0600-\u06FF]$/.test(clean)) {
      clean = `${clean}.`;
    }
  }

  return clean;
}

