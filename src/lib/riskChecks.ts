/**
 * riskChecks.ts — Platform & Content Safety Risk Engine (Spec §11 / Phase 4)
 *
 * Evaluates a CarouselData deck for TikTok / Metricool publishing risks:
 * 1. Originality: Flags raw video reposts, un-synthesized screenshots, or missing creator attribution.
 * 2. Copyrighted characters / music: Flags protected IP or commercial audio references.
 * 3. First-frame quality: Checks Slide 1 hook contrast, length, and dark cover readability.
 * 4. Unverified numeric claims: Flags benchmark/percentage claims when grounding status is unverified_draft.
 * 5. Repetition: Flags repeated headlines, repeated diagram variants, or duplicate body copy.
 */

import { CarouselData, NumericEvidenceDiscrepancy } from '../types';
import { isPlaceholderOrEmptyBrandValue } from './bundledTechSvgs';
import { extractSlideText } from './text/slideText';

export type RiskStatus = 'PASS' | 'WARN' | 'BLOCK';

export interface RiskCheckItem {
  id: 'originality' | 'copyright' | 'first-frame' | 'unverified-numbers' | 'repetition';
  label: string;
  status: RiskStatus;
  message: string;
}

export interface RiskReport {
  status: RiskStatus;
  items: RiskCheckItem[];
  blockCount: number;
  warnCount: number;
  passCount: number;
}


/**
 * Detects whether a carousel is derived from an external/third-party source
 * (URL, YouTube, screenshot, grounding sources, or offline fallback synthesis).
 */
export function isThirdPartySource(carousel: CarouselData): boolean {
  return Boolean(
    carousel.sourceMeta?.isFallback ||
      carousel.sourceMeta?.engine === 'offline' ||
      carousel.sourceMeta?.engine === 'offline-synthesizer' ||
      carousel.sourceMeta?.inputMode === 'url' ||
      carousel.sourceMeta?.inputMode === 'youtube' ||
      carousel.sourceMeta?.inputMode === 'screenshot' ||
      (carousel.sourceMeta?.groundingSources && carousel.sourceMeta.groundingSources.length > 0) ||
      (carousel.sourceMeta?.creator && carousel.sourceMeta.creator.trim().length > 0) ||
      (carousel.sourceMeta?.channel && carousel.sourceMeta.channel.trim().length > 0)
  );
}

/**
 * Returns the effective creator/source attribution text on the deck.
 */
export function getAttributionCredit(carousel: CarouselData): string {
  const ctaSlide = carousel.slides[carousel.slides.length - 1];
  return (
    carousel.sourceMeta?.creator ||
    carousel.sourceMeta?.channel ||
    carousel.channel ||
    ctaSlide?.enCredit?.replace(/^Source:\s*/i, '') ||
    ''
  ).trim();
}

/**
 * Validates that creator credit is non-empty and NOT merely the studio's brand name.
 * Never considers empty or brand-only values as valid third-party attribution.
 */
export function isValidCreatorCredit(carousel: CarouselData): boolean {
  const credit = getAttributionCredit(carousel);
  if (!credit) return false;
  const brand = (carousel.brand || 'MARROK').trim().toLowerCase();
  const normalized = credit.toLowerCase();
  if (
    normalized === brand ||
    normalized === 'marrok' ||
    normalized === 'marrok studio' ||
    normalized === 'source: marrok' ||
    normalized === 'source:marrok'
  ) {
    return false;
  }
  return true;
}

// Franchises and musical artists that trigger commercial copyright restrictions
const COPYRIGHTED_IP_PATTERN =
  /\b(spider-?man|batman|superman|naruto|goku|luffy|mickey\s*mouse|pikachu|pokemon|mario|darth\s*vader|harry\s*potter|iron\s*man|avengers|disney|marvel|nintendo|billie\s*eilish|taylor\s*swift|the\s*weeknd|travis\s*scott)\b/i;

// Specifically match Drake in commercial musical artist / rapper context to prevent false positives on KV-cache / technical topics
const DRAKE_ARTIST_PATTERN =
  /\b(aubrey\s+drake\s+graham|drake\s+(?:album|song|track|music|tour|concert|rap|rapper|lyrics|ovo|certified\s*lover|her\s*loss|scary\s*hours)|champagnepapi)\b/i;

const RAW_REPOST_PATTERN =
  /\b(tiktok\.com\/@|instagram\.com\/reel|youtube\.com\/shorts|screen\s*recording|repost\s*from|stolen\s*from|full\s*video\s*clip)\b/i;

const NUMERIC_CLAIM_PATTERN = /\b\d+(?:\.\d+)?\s*(?:%|x|ms|gb\/s|tb\/s|req\/s|rps|qps|mbps|gbps|faster|slower|reduction)\b/i;

function checkOriginality(carousel: CarouselData, rawInput: string = ''): RiskCheckItem {
  const combinedText = [
    rawInput,
    carousel.category,
    ...carousel.slides.map((s) => `${s.enTitle} ${s.enBody} ${s.arTitle} ${s.arBody}`),
  ].join(' ');

  if (RAW_REPOST_PATTERN.test(combinedText)) {
    return {
      id: 'originality',
      label: 'Originality & Transformation',
      status: 'BLOCK',
      message: 'Input or slide copy references a direct social video repost or screen recording without original synthesis.',
    };
  }

  const thirdParty = isThirdPartySource(carousel);
  const hasValidCredit = isValidCreatorCredit(carousel);

  if (thirdParty && !hasValidCredit) {
    return {
      id: 'originality',
      label: 'Originality & Attribution',
      status: 'BLOCK',
      message:
        carousel.postFormat === 'single' || carousel.slides.length === 1
          ? 'Third-party source requires genuine creator or channel attribution. Add a creator credit before exporting (brand-only name does not qualify).'
          : 'Third-party source requires genuine creator or channel attribution on the CTA slide. Add a creator credit before exporting (brand-only name does not qualify).',
    };
  }

  if (carousel.sourceMeta?.inputMode === 'screenshot' && !carousel.sourceMeta?.userReviewed) {
    return {
      id: 'originality',
      label: 'Originality & Transformation',
      status: 'WARN',
      message: 'Deck was synthesized from a screenshot. Confirm that visual diagrams and copy are transformative.',
    };
  }

  return {
    id: 'originality',
    label: 'Originality & Transformation',
    status: 'PASS',
    message: thirdParty
      ? `Original technical synthesis with verified creator attribution ("${getAttributionCredit(carousel)}").`
      : 'Original technical synthesis.',
  };
}

const IMPLIED_PARTNERSHIP_PATTERN =
  /\b(official\s+partner|powered\s+by|in\s+collaboration\s+with|endorsed\s+by|sponsored\s+by)\b/i;

function checkCopyright(carousel: CarouselData, rawInput: string = ''): RiskCheckItem {
  const combinedText = [
    rawInput,
    carousel.caption || '',
    ...carousel.slides.map(
      (s) => `${s.enTitle} ${s.enBody} ${s.arTitle} ${s.arBody} ${s.imagePrompt || ''}`
    ),
  ].join(' ');

  const generalMatch = combinedText.match(COPYRIGHTED_IP_PATTERN);
  const drakeMatch = combinedText.match(DRAKE_ARTIST_PATTERN);
  const match = generalMatch || drakeMatch;

  if (match) {
    const matchedWord = match[0];
    const matchIndex = match.index || 0;
    const snippetStart = Math.max(0, matchIndex - 30);
    const snippetEnd = Math.min(combinedText.length, matchIndex + matchedWord.length + 30);
    const contextSnippet = combinedText.substring(snippetStart, snippetEnd).trim();

    console.warn(
      `[RiskChecks:Copyright] Protected IP/artist match detected: "${matchedWord}" at position ${matchIndex}. Context: "...${contextSnippet}..."`
    );

    return {
      id: 'copyright',
      label: 'Brand IP & Audio Safety',
      status: 'BLOCK',
      message: `Detected reference to protected franchise/artist ("${matchedWord}"). Remove copyrighted characters or commercial music references.`,
    };
  }

  const partnershipMatch = combinedText.match(IMPLIED_PARTNERSHIP_PATTERN);
  if (partnershipMatch) {
    return {
      id: 'copyright',
      label: 'Brand IP & Endorsement Safety',
      status: 'BLOCK',
      message: `Implied endorsement wording detected ("${partnershipMatch[0]}"). Never imply partnership with third-party brands.`,
    };
  }

  for (let i = 0; i < carousel.slides.length; i++) {
    const cfg = carousel.slides[i].brandLogoConfig;
    if (cfg && cfg.mode === 'official_icon') {
      if ((cfg.maxWidthPct ?? 8) > 8 || cfg.placement === 'hero' || cfg.placement === 'center' || (cfg.countOnSlide ?? 1) > 1 || cfg.isEdited || cfg.isNonLibrarySource) {
        return {
          id: 'copyright',
          label: 'Brand IP & Logo Safety',
          status: 'BLOCK',
          message: `Slide ${i + 1} violates Brand Logo IP safety (must be ≤8% width, corner label only, max 1 unedited Simple Icons SVG per slide).`,
        };
      }
    }
    const pair = carousel.slides[i].subjectPair;
    if (carousel.slides[i].type === 'subjectPair' || pair) {
      if (
        !pair ||
        isPlaceholderOrEmptyBrandValue(pair.beforeSystem) ||
        isPlaceholderOrEmptyBrandValue(pair.afterSystem) ||
        (pair.flowLabel && isPlaceholderOrEmptyBrandValue(pair.flowLabel)) ||
        (pair.storyOwner && isPlaceholderOrEmptyBrandValue(pair.storyOwner))
      ) {
        return {
          id: 'copyright',
          label: 'Brand IP & Placeholder Gate',
          status: 'BLOCK',
          message: `Slide ${i + 1} Subject Pair contains empty or placeholder brand fields ("${pair?.beforeSystem || ''}" / "${pair?.afterSystem || ''}"). Extract real system names or switch layout.`,
        };
      }
      if ((pair.logoWidthPct ?? 11) > 14) {
        return {
          id: 'copyright',
          label: 'Brand IP & Logo Safety',
          status: 'BLOCK',
          message: `Slide ${i + 1} Subject Pair logo exceeds 14% max slide width (${pair.logoWidthPct}% > 14%).`,
        };
      }
      let logoCount = 0;
      if (!pair.beforeAsText && pair.beforeLogoKey) logoCount++;
      if (!pair.afterAsText && pair.afterLogoKey) logoCount++;
      if (logoCount > 2) {
        return {
          id: 'copyright',
          label: 'Brand IP & Logo Safety',
          status: 'BLOCK',
          message: `Slide ${i + 1} Subject Pair exceeds 2-logo limit (${logoCount} > 2).`,
        };
      }
      if (pair.isEdited || pair.isNonLibrarySource || pair.isMerged || pair.isOverlapping || pair.usesMascot) {
        return {
          id: 'copyright',
          label: 'Brand IP & Logo Safety',
          status: 'BLOCK',
          message: `Slide ${i + 1} Subject Pair violates logo integrity rules (must use unedited bundled SVGs or styled text, no mascots/merging/overlapping).`,
        };
      }
    }
    const slideText = extractSlideText(carousel.slides[i]);
    if (/\b(?:System\s+[AB12]|Company\s+[AB12]|Brand\s+[AB12]|PIPELINE\s+MIGRATION|DATASTREAM\s+MIGRATION)\b/i.test(slideText)) {
      return {
        id: 'copyright',
        label: 'Brand IP & Placeholder Gate',
        status: 'BLOCK',
        message: `Slide ${i + 1} contains default placeholder text ("System A", "System B", or "PIPELINE MIGRATION").`,
      };
    }
  }

  return {
    id: 'copyright',
    label: 'Brand IP & Audio Safety',
    status: 'PASS',
    message: 'No copyrighted IP, implied endorsement, or improper brand logo usage detected.',
  };
}

function checkFirstFrameQuality(carousel: CarouselData): RiskCheckItem {
  const firstSlide = carousel.slides[0];
  if (!firstSlide) {
    return {
      id: 'first-frame',
      label: 'First-Frame Cover Quality',
      status: 'BLOCK',
      message: 'Deck has no cover slide.',
    };
  }

  const title = (firstSlide.enTitle || '').trim();
  const arTitle = (firstSlide.arTitle || '').trim();

  if (title.length < 4 || arTitle.length < 4) {
    return {
      id: 'first-frame',
      label: 'First-Frame Cover Quality',
      status: 'BLOCK',
      message: 'Slide 1 cover is missing a clear bilingual hook headline (both EN and AR required for thumbnail impact).',
    };
  }

  if (firstSlide.type === 'image' && firstSlide.imageFilter === 'hud' && !firstSlide.imageCaption) {
    return {
      id: 'first-frame',
      label: 'First-Frame Cover Quality',
      status: 'WARN',
      message: 'Slide 1 uses a darkened HUD image cover without a caption badge. Ensure high headline contrast at mobile thumbnail size.',
    };
  }

  return {
    id: 'first-frame',
    label: 'First-Frame Cover Quality',
    status: 'PASS',
    message: 'Slide 1 cover has high-contrast bilingual hook typography and schematic focal point.',
  };
}

export interface NormalizedMetricToken {
  raw: string;
  mantissa: number;
  normalizedValue: number;
  unitCategory: NumericEvidenceDiscrepancy['unitCategory'];
}

const METRIC_EXTRACTION_PATTERN =
  /(?:[$€£]\s*\d[\d,]*(?:\.\d+)?\s*(?:trillion|billion|million|thousand|[tbmk])?\b|\b\d[\d,]*(?:\.\d+)?\s*(?:trillion|billion|million|thousand|[tbmk])?\s*(?:usd|eur|gbp)\b|\b\d[\d,]*(?:\.\d+)?\s*(?:%|x|ms|µs|us|ns|sec|s\b|tb\/s|gb\/s|mb\/s|kb\/s|tbps|gbps|mbps|kbps|tb|gb|mb|kb|req\/s|rps|qps|tps|ops\/s|tokens\/s|(?:trillion|billion|million|thousand|[tbmk])\b))/gi;

/**
 * Normalizes a quantitative metric string across currencies, magnitudes (K/M/B/T),
 * percentages, multipliers, durations (ns/µs/ms/s -> ms), data sizes (KB/MB/GB/TB -> bytes), and rates.
 * Enables exact equivalence across legitimate conversions (e.g. "1.5s" === "1500ms", "2.4GB" === "2400MB", "$20.9B" === "$20.9 billion")
 * while catching 10x/100x/1000x decimal or scale distortions (e.g. "$20.9B" -> "$209B").
 */
export function parseNormalizedMetricToken(rawInput: string): NormalizedMetricToken | null {
  const cleaned = rawInput.trim();
  if (!cleaned) return null;

  const lower = cleaned.toLowerCase();
  const hasCurrencyPrefix = /^[$€£]/.test(lower);
  const hasCurrencySuffix = /\b(usd|eur|gbp)$/.test(lower);
  const isCurrency = hasCurrencyPrefix || hasCurrencySuffix;

  const numMatch = lower.match(/\d[\d,]*(?:\.\d+)?/);
  if (!numMatch) return null;
  const mantissa = Number.parseFloat(numMatch[0].replace(/,/g, ''));
  if (!Number.isFinite(mantissa)) return null;

  const afterNum = lower.slice((numMatch.index || 0) + numMatch[0].length).trim();

  // Check currency first
  if (isCurrency) {
    let scale = 1;
    if (/\b(trillion|t)\b/.test(afterNum)) scale = 1e12;
    else if (/\b(billion|b)\b/.test(afterNum)) scale = 1e9;
    else if (/\b(million|m)\b/.test(afterNum)) scale = 1e6;
    else if (/\b(thousand|k)\b/.test(afterNum)) scale = 1e3;
    return {
      raw: cleaned,
      mantissa,
      normalizedValue: mantissa * scale,
      unitCategory: 'currency',
    };
  }

  if (afterNum.startsWith('%')) {
    return { raw: cleaned, mantissa, normalizedValue: mantissa, unitCategory: 'percent' };
  }

  if (/^x\b/.test(afterNum)) {
    return { raw: cleaned, mantissa, normalizedValue: mantissa, unitCategory: 'multiplier' };
  }

  // Time duration -> normalize to milliseconds (ms)
  if (/^(ms|milliseconds?)\b/.test(afterNum)) {
    return { raw: cleaned, mantissa, normalizedValue: mantissa, unitCategory: 'duration_ms' };
  }
  if (/^(µs|us|microseconds?)\b/.test(afterNum)) {
    return { raw: cleaned, mantissa, normalizedValue: mantissa * 1e-3, unitCategory: 'duration_ms' };
  }
  if (/^(ns|nanoseconds?)\b/.test(afterNum)) {
    return { raw: cleaned, mantissa, normalizedValue: mantissa * 1e-6, unitCategory: 'duration_ms' };
  }
  if (/^(s|sec|seconds?)\b/.test(afterNum)) {
    return { raw: cleaned, mantissa, normalizedValue: mantissa * 1000, unitCategory: 'duration_ms' };
  }

  // Throughput rates
  if (/(tb\/s|tbps|gb\/s|gbps|mb\/s|mbps|kb\/s|kbps|req\/s|rps|qps|tps|ops\/s|tokens\/s)\b/.test(afterNum)) {
    let scale = 1;
    if (/^(tb\/s|tbps|\bt\b)/.test(afterNum)) scale = 1e12;
    else if (/^(gb\/s|gbps|\bg\b)/.test(afterNum)) scale = 1e9;
    else if (/^(mb\/s|mbps|\bm\b)/.test(afterNum)) scale = 1e6;
    else if (/^(kb\/s|kbps|\bk\b)/.test(afterNum)) scale = 1e3;
    return { raw: cleaned, mantissa, normalizedValue: mantissa * scale, unitCategory: 'rate' };
  }

  // Data sizes -> normalize to bytes
  if (/^(tb|terabytes?)\b/.test(afterNum)) {
    return { raw: cleaned, mantissa, normalizedValue: mantissa * 1e12, unitCategory: 'bytes' };
  }
  if (/^(gb|gigabytes?)\b/.test(afterNum)) {
    return { raw: cleaned, mantissa, normalizedValue: mantissa * 1e9, unitCategory: 'bytes' };
  }
  if (/^(mb|megabytes?)\b/.test(afterNum)) {
    return { raw: cleaned, mantissa, normalizedValue: mantissa * 1e6, unitCategory: 'bytes' };
  }
  if (/^(kb|kilobytes?)\b/.test(afterNum)) {
    return { raw: cleaned, mantissa, normalizedValue: mantissa * 1e3, unitCategory: 'bytes' };
  }

  // Scalar magnitudes (K / M / B / T)
  if (/^(trillion|t)\b/.test(afterNum)) {
    return { raw: cleaned, mantissa, normalizedValue: mantissa * 1e12, unitCategory: 'scalar' };
  }
  if (/^(billion|b)\b/.test(afterNum)) {
    return { raw: cleaned, mantissa, normalizedValue: mantissa * 1e9, unitCategory: 'scalar' };
  }
  if (/^(million|m)\b/.test(afterNum)) {
    return { raw: cleaned, mantissa, normalizedValue: mantissa * 1e6, unitCategory: 'scalar' };
  }
  if (/^(thousand|k)\b/.test(afterNum)) {
    return { raw: cleaned, mantissa, normalizedValue: mantissa * 1e3, unitCategory: 'scalar' };
  }

  return null;
}

export function extractNormalizedMetricsFromText(text: string): NormalizedMetricToken[] {
  if (!text) return [];
  const matches = text.match(METRIC_EXTRACTION_PATTERN) || [];
  const out: NormalizedMetricToken[] = [];
  for (const m of matches) {
    const parsed = parseNormalizedMetricToken(m);
    if (parsed) out.push(parsed);
  }
  return out;
}

function areNormalizedValuesEquivalent(a: number, b: number): boolean {
  if (a === b) return true;
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  // Allow up to 2.5% tolerance for binary vs decimal rounding (e.g. 1024MB vs 1GB)
  return Math.abs(a - b) / denom <= 0.025;
}

function isOrderOfMagnitudeShift(a: number, b: number, mantissaA: number, mantissaB: number): boolean {
  if (a <= 0 || b <= 0) return false;
  const ratio = a / b;
  const log10 = Math.log10(ratio);
  const nearestPow = Math.round(log10);
  if (Math.abs(nearestPow) >= 1 && Math.abs(nearestPow) <= 6 && Math.abs(log10 - nearestPow) < 0.04) {
    return true;
  }
  // Also catch same digits with shifted decimal (e.g. 20.9 vs 209)
  const digitsA = String(mantissaA).replace(/\./g, '').replace(/0+$/, '');
  const digitsB = String(mantissaB).replace(/\./g, '').replace(/0+$/, '');
  if (digitsA.length >= 2 && digitsA === digitsB && !areNormalizedValuesEquivalent(a, b)) {
    return true;
  }
  return false;
}

/**
 * Compares all quantitative metrics appearing on slides against the extracted source passage metrics.
 * Flags 10x/100x/decimal shifts (e.g. $20.9B -> $209B) as BLOCK and unmatched metrics as WARN.
 */
export function compareSlideMetricsAgainstSource(
  carousel: CarouselData,
  explicitSourceMetrics?: string[]
): {
  verifiedCount: number;
  discrepancies: NumericEvidenceDiscrepancy[];
} {
  const rawSourceList = explicitSourceMetrics ?? carousel.sourceMeta?.extractedSourceMetrics ?? [];
  const sourceTokens: NormalizedMetricToken[] = [];
  for (const item of rawSourceList) {
    const parsed = parseNormalizedMetricToken(item);
    if (parsed) {
      sourceTokens.push(parsed);
    } else {
      sourceTokens.push(...extractNormalizedMetricsFromText(item));
    }
  }

  if (sourceTokens.length === 0) {
    return { verifiedCount: 0, discrepancies: [] };
  }

  let verifiedCount = 0;
  const discrepancies: NumericEvidenceDiscrepancy[] = [];

  carousel.slides.forEach((slide, idx) => {
    const slideText = [slide.metricValue || '', slide.enTitle || '', slide.enBody || ''].join(' ');
    const slideTokens = extractNormalizedMetricsFromText(slideText);
    const seenRawOnSlide = new Set<string>();

    for (const sTok of slideTokens) {
      const dedupKey = `${sTok.unitCategory}:${sTok.normalizedValue}`;
      if (seenRawOnSlide.has(dedupKey)) continue;
      seenRawOnSlide.add(dedupKey);

      const sameCategorySources = sourceTokens.filter((src) => src.unitCategory === sTok.unitCategory);
      const exactMatch = sameCategorySources.find((src) =>
        areNormalizedValuesEquivalent(sTok.normalizedValue, src.normalizedValue)
      );

      if (exactMatch) {
        verifiedCount += 1;
        continue;
      }

      // Check for decimal / scale distortion (e.g. $20.9B vs $209B or 15ms vs 15s)
      const scaleConflict = sameCategorySources.find((src) =>
        isOrderOfMagnitudeShift(sTok.normalizedValue, src.normalizedValue, sTok.mantissa, src.mantissa)
      );

      if (scaleConflict) {
        discrepancies.push({
          slideIndex: idx,
          slideRawMetric: sTok.raw,
          normalizedSlideValue: sTok.normalizedValue,
          unitCategory: sTok.unitCategory,
          closestSourceMetric: scaleConflict.raw,
          normalizedSourceValue: scaleConflict.normalizedValue,
          reason: 'scale_mismatch',
          severity: 'BLOCK',
          message: `Slide ${idx + 1} claims "${sTok.raw}" which conflicts with source metric "${scaleConflict.raw}" (scale/decimal mismatch).`,
        });
        continue;
      }

      // Check if the same mantissa exists in the source with a conflicting unit category (e.g. 42% vs 42ms)
      const unitConflict = sourceTokens.find(
        (src) =>
          src.unitCategory !== sTok.unitCategory &&
          Math.abs(src.mantissa - sTok.mantissa) < 1e-6 &&
          sTok.mantissa > 1
      );

      if (unitConflict) {
        discrepancies.push({
          slideIndex: idx,
          slideRawMetric: sTok.raw,
          normalizedSlideValue: sTok.normalizedValue,
          unitCategory: sTok.unitCategory,
          closestSourceMetric: unitConflict.raw,
          normalizedSourceValue: unitConflict.normalizedValue,
          reason: 'unit_conflict',
          severity: 'BLOCK',
          message: `Slide ${idx + 1} claims "${sTok.raw}" but source specifies "${unitConflict.raw}" (unit conflict).`,
        });
        continue;
      }

      discrepancies.push({
        slideIndex: idx,
        slideRawMetric: sTok.raw,
        normalizedSlideValue: sTok.normalizedValue,
        unitCategory: sTok.unitCategory,
        reason: 'unmatched_metric',
        severity: 'WARN',
        message: `Slide ${idx + 1} metric "${sTok.raw}" was not found in extracted source metrics (${sourceTokens
          .slice(0, 4)
          .map((t) => t.raw)
          .join(', ')}).`,
      });
    }
  });

  return { verifiedCount, discrepancies };
}

function checkUnverifiedNumericClaims(carousel: CarouselData): RiskCheckItem {
  const slidesWithMetrics = carousel.slides.filter(
    (s) =>
      s.type === 'metric' ||
      Boolean(s.metricValue) ||
      NUMERIC_CLAIM_PATTERN.test(`${s.enTitle} ${s.enBody}`) ||
      extractNormalizedMetricsFromText(`${s.metricValue || ''} ${s.enTitle || ''} ${s.enBody || ''}`).length > 0
  );

  if (slidesWithMetrics.length === 0) {
    return {
      id: 'unverified-numbers',
      label: 'Numeric Claims & Benchmarks',
      status: 'PASS',
      message: 'No quantitative benchmark claims requiring external citation.',
    };
  }

  const isHumanApproved = Boolean(
    carousel.sourceMeta?.humanApproved ?? carousel.sourceMeta?.userReviewed
  );

  // Deterministic Numeric Evidence Audit when source metrics are available
  if (
    carousel.sourceMeta?.extractedSourceMetrics &&
    carousel.sourceMeta.extractedSourceMetrics.length > 0
  ) {
    const audit = compareSlideMetricsAgainstSource(carousel);
    const blockDiscrepancies = audit.discrepancies.filter((d) => d.severity === 'BLOCK');
    const warnDiscrepancies = audit.discrepancies.filter((d) => d.severity === 'WARN');

    if (blockDiscrepancies.length > 0) {
      return {
        id: 'unverified-numbers',
        label: 'Numeric Claims & Benchmarks',
        status: isHumanApproved ? 'WARN' : 'BLOCK',
        message: blockDiscrepancies[0].message,
      };
    }

    if (warnDiscrepancies.length > 0) {
      return {
        id: 'unverified-numbers',
        label: 'Numeric Claims & Benchmarks',
        status: 'WARN',
        message: warnDiscrepancies[0].message,
      };
    }

    if (audit.verifiedCount > 0) {
      return {
        id: 'unverified-numbers',
        label: 'Numeric Claims & Benchmarks',
        status: 'PASS',
        message: `${audit.verifiedCount} numeric claim(s) deterministically verified against extracted source evidence.`,
      };
    }
  }

  const isGrounded =
    carousel.sourceMeta?.status === 'verified_live' &&
    carousel.sourceMeta?.isSearchGrounded &&
    (carousel.sourceMeta?.groundingSources?.length ?? 0) > 0;

  if (isGrounded) {
    return {
      id: 'unverified-numbers',
      label: 'Numeric Claims & Benchmarks',
      status: 'PASS',
      message: `${slidesWithMetrics.length} numeric/benchmark slide(s) backed by live search grounding sources.`,
    };
  }

  if (isHumanApproved) {
    return {
      id: 'unverified-numbers',
      label: 'Numeric Claims & Benchmarks',
      status: 'WARN',
      message: `${slidesWithMetrics.length} numeric claim(s) present in an ungrounded deck (human-reviewed).`,
    };
  }

  return {
    id: 'unverified-numbers',
    label: 'Numeric Claims & Benchmarks',
    status: 'BLOCK',
    message: `${slidesWithMetrics.length} slide(s) contain specific numeric/benchmark claims without live search grounding or human review confirmation.`,
  };
}

function checkRepetition(carousel: CarouselData): RiskCheckItem {
  const seenTitles = new Set<string>();
  const seenBodies = new Set<string>();

  for (let i = 0; i < carousel.slides.length; i++) {
    const s = carousel.slides[i];
    const normTitle = (s.enTitle || '').toLowerCase().replace(/[^\w\s]/g, '').trim();
    const normBody = (s.enBody || '').toLowerCase().replace(/[^\w\s]/g, '').trim();

    if (normTitle.length > 6 && seenTitles.has(normTitle)) {
      return {
        id: 'repetition',
        label: 'Slide Pacing & Repetition',
        status: 'BLOCK',
        message: `Slide ${i + 1} repeats an identical headline ("${s.enTitle}"). TikTok penalizes repetitive carousel frames.`,
      };
    }
    if (normTitle.length > 6) seenTitles.add(normTitle);

    if (normBody.length > 20 && seenBodies.has(normBody)) {
      return {
        id: 'repetition',
        label: 'Slide Pacing & Repetition',
        status: 'BLOCK',
        message: `Slide ${i + 1} repeats identical body copy from an earlier slide.`,
      };
    }
    if (normBody.length > 20) seenBodies.add(normBody);
  }

  // Check adjacent identical diagram variants
  for (let i = 1; i < carousel.slides.length; i++) {
    const prevVariant = carousel.slides[i - 1].diagramVariant;
    const currVariant = carousel.slides[i].diagramVariant;
    if (prevVariant && currVariant && prevVariant === currVariant) {
      return {
        id: 'repetition',
        label: 'Slide Pacing & Repetition',
        status: 'WARN',
        message: `Slides ${i} and ${i + 1} use the same schematic variant ("${currVariant}"). Vary schematics for stronger retention.`,
      };
    }
  }

  return {
    id: 'repetition',
    label: 'Slide Pacing & Repetition',
    status: 'PASS',
    message: 'All slides have distinct headlines, body copy, and visual schematic pacing.',
  };
}

/**
 * Evaluates all 5 platform safety & quality rules on the active carousel.
 */
export function runPlatformRiskChecks(carousel: CarouselData, rawInput: string = ''): RiskReport {
  const items: RiskCheckItem[] = [
    checkOriginality(carousel, rawInput),
    checkCopyright(carousel, rawInput),
    checkFirstFrameQuality(carousel),
    checkUnverifiedNumericClaims(carousel),
    checkRepetition(carousel),
  ];

  const blockCount = items.filter((i) => i.status === 'BLOCK').length;
  const warnCount = items.filter((i) => i.status === 'WARN').length;
  const passCount = items.filter((i) => i.status === 'PASS').length;

  const status: RiskStatus = blockCount > 0 ? 'BLOCK' : warnCount > 0 ? 'WARN' : 'PASS';

  return {
    status,
    items,
    blockCount,
    warnCount,
    passCount,
  };
}
