import { CarouselData, SlideData } from '../../types.ts';
import { QACheckResult } from './types.ts';
import {
  CHAR_LIMITS,
  SINGLE_SLIDE_CHAR_LIMITS,
  PLATFORM_CAPTION_CHAR_LIMITS,
  ARABIC_TRANSLATED_TERM_RULES,
} from './constants.ts';

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
export function checkCharLimits(
  slide: SlideData,
  idx: number,
  isHook: boolean,
  isSingleSlide: boolean = false
): QACheckResult[] {
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
export function hasArabicPunctuationJump(text?: string): boolean {
  if (!text) return false;
  // Ends with Latin word + punctuation
  const badEndingPattern = /[A-Za-z0-9]+[.?!،؟:؛]\s*$/;
  // Colon touching Latin word
  const colonTouchingLatin = /:[a-zA-Z0-9]|[a-zA-Z0-9]:/;
  return text.split(/\n/).some((line) => badEndingPattern.test(line.trim()) || colonTouchingLatin.test(line.trim()));
}

export function checkArabicLineEndings(slide: SlideData, idx: number): QACheckResult[] {
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

/**
 * Emit a non-blocking warning ONLY when an Arabic technical term or unit appears translated into Arabic
 * instead of kept in English Latin script (e.g. "Sockets", "Latency", "Cache", "Cluster", "GB", "ms").
 */
export function checkArabicTranslatedTechTerms(slide: SlideData, idx: number): QACheckResult[] {
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
export function checkHeadlineSpecRule(slide: SlideData, idx: number, totalSlides: number): QACheckResult[] {
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

/** Check for raw markdown syntax in slide fields */
export function checkMarkdownAndPunctuation(slide: SlideData, idx: number): QACheckResult[] {
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

export function checkBilingualTranslationFidelity(slide: SlideData, idx: number): QACheckResult[] {
  if (slide.standaloneMeme || slide.imageFrameMode === 'full') return [];
  const results: QACheckResult[] = [];

  const enTitle = (slide.enTitle || '').trim();
  const arTitle = (slide.arTitle || '').trim();
  const enBody = (slide.enBody || '').trim();
  const coverTeaserAr = (slide.coverTeaserAr || '').trim();

  // 1. Detect duplicated Slide 1 AR headline and AR cover teaser
  if (idx === 0 && arTitle && coverTeaserAr) {
    const normTitle = arTitle.replace(/[.؟!،\s]+/g, ' ').trim();
    const normTeaser = coverTeaserAr.replace(/[.؟!،\s]+/g, ' ').trim();
    if (normTitle && normTitle === normTeaser) {
      results.push({
        id: `bilingual-ar-teaser-dup-${idx}`,
        severity: 'warn',
        slideIndex: idx,
        field: 'coverTeaserAr',
        message: 'Slide 1 Arabic teaser duplicates the Arabic headline. Click Sync AR to translate the teaser independently.',
      });
    }
  }

  // 2. Detect off-topic canned SQL Arabic fallback when slide is not SQL
  const isSqlSlide = /\b(?:sql|psql|postgres|pgvector|query\s+planner|select\s+from)\b|<=>/i.test(
    `${enTitle} ${enBody}`
  );
  if (!isSqlSlide && /الاستعلام عبر الشيفرة البرمجية/.test(`${arTitle} ${coverTeaserAr}`)) {
    results.push({
      id: `bilingual-offtopic-ar-${idx}`,
      severity: 'warn',
      slideIndex: idx,
      field: 'arTitle',
      message: 'Arabic copy contains an off-topic SQL template phrase. Click Sync AR to re-translate from English.',
    });
  }

  // 3. Detect missing CVE identifier anchor in Arabic headline when present in English headline
  const cveInEn = enTitle.match(/\bCVE-\d{4}-\d{4,7}\b/i)?.[0];
  if (cveInEn && arTitle && !arTitle.toUpperCase().includes(cveInEn.toUpperCase())) {
    results.push({
      id: `bilingual-missing-cve-${idx}`,
      severity: 'warn',
      slideIndex: idx,
      field: 'arTitle',
      message: `Arabic headline is missing "${cveInEn.toUpperCase()}" from the English headline. Click Sync AR to preserve exact CVE IDs.`,
    });
  }

  // 4. Detect broken passive-attribution glue in Slide 1 English hook
  if (
    idx === 0 &&
    enTitle &&
    (/\b(?:how|why|when|where)\s+(?:discovered|reported|disclosed|announced|published|found)\s+by\b/i.test(enTitle) ||
      /^(?:discovered|reported|disclosed|announced)\s+by\b/i.test(enTitle))
  ) {
    results.push({
      id: `hook-grammar-fragment-${idx}`,
      severity: 'warn',
      slideIndex: idx,
      field: 'enTitle',
      message: 'Slide 1 hook contains passive attribution or broken grammar. Reframe around stakes, threat, and an open loop.',
    });
  }

  return results;
}
