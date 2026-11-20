import type {
  MetricEvidenceItem,
  SavedPostRecord,
  SlideData,
} from '../../types.ts';
import { CHAR_LIMITS, SINGLE_SLIDE_CHAR_LIMITS } from '../qaChecks.ts';
import {
  extractDomainClean,
  formatShortInboxDate,
  sanitizeFeedDisplayText,
  sanitizeSafeHttpUrl,
} from '../gather/inboxEngine.ts';

export interface DraftClaimEvidenceItem {
  id: string;
  label: string;
  slideIndices: number[];
  sourceQuote: string | null;
  sourceUrl?: string;
  verified: boolean;
  discrepancyMessage?: string;
}

export interface DraftReadinessReport {
  canShip: boolean;
  remainingSteps: string[];
  summaryLabel: string;
  unverifiedClaimsCount: number;
  verifiedClaimsCount: number;
  totalClaimsCount: number;
  overflowSlideIndices: number[];
  hasMarrokAngle: boolean;
}

export interface DraftSourceDisplay {
  domain: string | null;
  safeUrl: string | null;
  updatedLabel: string;
}

// Matches real quantitative claims (percentages, multipliers, currency, scale/unit suffixes)
// while skipping bare step counters ("01", "Slide 2") and calendar years ("2026").
const QUANTITATIVE_METRIC_RE =
  /(?:[$€£]\s?\d[\d,.]*\s*[KMBTkmbt]?|\b\d+(?:\.\d+)?\s*(?:%|x\b|X\b|ms\b|µs\b|us\b|ns\b|s\b|sec\b|min\b|hrs?\b|KB\b|MB\b|GB\b|TB\b|PB\b|k\b|K\b|M\b|B\b|T\b|rps\b|qps\b|req\/s|tok\/s|tokens\/s|GW\b|MW\b|fps\b))/g;

const YEAR_OR_STEP_RE = /^(?:19\d{2}|20\d{2}|0?\d)$/;

function normalizeMetricKey(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, '');
  const numPart = cleaned.match(/[$€£]?\d+(?:\.\d+)?(?:%|x|k|m|b|t|ms|µs|us|ns|kb|mb|gb|tb|pb)?/);
  return numPart ? numPart[0] : cleaned;
}

function extractNumericToken(raw: string): string {
  const m = raw.match(/[$€£]?\d+(?:\.\d+)?/);
  return m ? m[0].toLowerCase() : '';
}

function isMeaningfulMetricLabel(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 64) return false;
  if (YEAR_OR_STEP_RE.test(trimmed)) return false;
  if (!/\d/.test(trimmed)) return false;
  // Filter broken fragments like "4." or "S5" or "2026"
  if (/^\d+\.$/.test(trimmed)) return false;
  if (/^s\d+$/i.test(trimmed)) return false;
  return true;
}

function findMatchingSlideIndices(slides: SlideData[], label: string): number[] {
  const lowerLabel = label.toLowerCase().trim();
  const numToken = extractNumericToken(label);
  const matches: number[] = [];

  slides.forEach((slide, idx) => {
    const haystack = [
      slide.metricValue || '',
      slide.metricDiff || '',
      slide.enTitle || '',
      slide.enBody || '',
      slide.arTitle || '',
      slide.arBody || '',
    ]
      .join(' ')
      .toLowerCase();

    if (!haystack.trim()) return;
    if (
      (lowerLabel && haystack.includes(lowerLabel)) ||
      (numToken && numToken.length >= 2 && new RegExp(`(?<!\\d)${numToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d)`).test(haystack))
    ) {
      matches.push(idx);
    }
  });

  return matches;
}

function collectSourceSentences(post: SavedPostRecord): string[] {
  const meta = post.deck?.sourceMeta;
  const parts: string[] = [];
  if (meta?.sourceSummary) parts.push(meta.sourceSummary);
  if (meta?.title) parts.push(meta.title);
  for (const fact of post.deck?.facts || []) {
    if (fact.evidence) parts.push(fact.evidence);
    if (fact.text) parts.push(fact.text);
  }

  const rawText = sanitizeFeedDisplayText(parts.join('. '), 3500);
  if (!rawText) return [];

  return rawText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

function findQuoteForMetric(sentences: string[], label: string): string | null {
  if (sentences.length === 0) return null;
  const lowerLabel = label.toLowerCase().trim();
  const numToken = extractNumericToken(label);

  const exact = sentences.find((s) => s.toLowerCase().includes(lowerLabel));
  if (exact) return exact.slice(0, 220);

  if (numToken && numToken.length >= 2) {
    const byNum = sentences.find((s) =>
      new RegExp(`(?<!\\d)${numToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d)`, 'i').test(s)
    );
    if (byNum) return byNum.slice(0, 220);
  }

  return null;
}

/**
 * Extracts all quantitative claims and numbers for a Draft post, merging persisted
 * Inbox `metricEvidence`, `deck.facts`, `numericDiscrepancies`, and numbers appearing
 * directly inside Slides 1..N so the reviewer never verifies claims blindly.
 */
export function extractDraftClaimEvidence(post: SavedPostRecord): DraftClaimEvidenceItem[] {
  const slides = post.deck?.slides || [];
  const meta = post.deck?.sourceMeta;
  const safeSourceUrl =
    sanitizeSafeHttpUrl(meta?.url) ||
    sanitizeSafeHttpUrl(post.deck?.brandUrl) ||
    sanitizeSafeHttpUrl(meta?.groundingSources?.[0]?.url) ||
    undefined;

  const sentences = collectSourceSentences(post);
  const discrepancies = meta?.numericDiscrepancies || [];
  const defaultVerified = Boolean(
    post.verifiedNumbers === true || meta?.verifiedNumbers === true
  );

  const seenByKey = new Map<string, DraftClaimEvidenceItem>();

  const attachDiscrepancy = (label: string, slideIndices: number[]): string | undefined => {
    const key = normalizeMetricKey(label);
    const hit = discrepancies.find(
      (d) =>
        normalizeMetricKey(d.slideRawMetric) === key ||
        (slideIndices.includes(d.slideIndex) &&
          extractNumericToken(d.slideRawMetric) === extractNumericToken(label))
    );
    return hit?.message;
  };

  // 1. Persisted metricEvidence from Inbox or previous Draft verification edits
  for (let i = 0; i < (meta?.metricEvidence || []).length; i++) {
    const ev = meta!.metricEvidence![i];
    const cleanLabel = sanitizeFeedDisplayText(ev.label, 64);
    if (!isMeaningfulMetricLabel(cleanLabel)) continue;
    const key = normalizeMetricKey(cleanLabel);
    if (seenByKey.has(key)) continue;

    const slideIndices = findMatchingSlideIndices(slides, cleanLabel);
    const quote = sanitizeFeedDisplayText(ev.sourceQuote || '', 220) || findQuoteForMetric(sentences, cleanLabel);
    seenByKey.set(key, {
      id: ev.id || `${post.id}_ev_${i}`,
      label: cleanLabel,
      slideIndices,
      sourceQuote: quote || null,
      sourceUrl: sanitizeSafeHttpUrl(ev.sourceUrl) || safeSourceUrl,
      verified: Boolean(ev.verified),
      discrepancyMessage: attachDiscrepancy(cleanLabel, slideIndices),
    });
  }

  // 2. Extracted facts with numbers/claims
  for (let i = 0; i < (post.deck?.facts || []).length; i++) {
    const fact = post.deck!.facts![i];
    if (fact.type !== 'number' && !QUANTITATIVE_METRIC_RE.test(fact.text || '')) continue;
    QUANTITATIVE_METRIC_RE.lastIndex = 0;
    const cleanLabel = sanitizeFeedDisplayText(fact.text, 64);
    if (!isMeaningfulMetricLabel(cleanLabel)) continue;
    const key = normalizeMetricKey(cleanLabel);
    if (seenByKey.has(key)) continue;

    const slideIndices = findMatchingSlideIndices(slides, cleanLabel);
    const quote =
      sanitizeFeedDisplayText(fact.evidence || '', 220) ||
      findQuoteForMetric(sentences, cleanLabel);
    seenByKey.set(key, {
      id: `${post.id}_fact_${i}`,
      label: cleanLabel,
      slideIndices,
      sourceQuote: quote || null,
      sourceUrl: sanitizeSafeHttpUrl(fact.sourceUrl) || safeSourceUrl,
      verified: fact.verified === 'verified' || defaultVerified,
      discrepancyMessage: attachDiscrepancy(cleanLabel, slideIndices),
    });
  }

  // 3. Scan slide titles, bodies, and metric cards so no slide number goes unaudited
  slides.forEach((slide, sIdx) => {
    const candidates: string[] = [];
    if (slide.metricValue && isMeaningfulMetricLabel(slide.metricValue)) {
      const suffix = slide.metricLabel
        ? ` ${sanitizeFeedDisplayText(slide.metricLabel, 24).toLowerCase()}`
        : '';
      candidates.push(`${slide.metricValue.trim()}${suffix}`.trim());
    }

    const scanText = `${slide.enTitle || ''} ${slide.enBody || ''}`;
    let match: RegExpExecArray | null;
    QUANTITATIVE_METRIC_RE.lastIndex = 0;
    while ((match = QUANTITATIVE_METRIC_RE.exec(scanText)) !== null) {
      const token = match[0].trim();
      if (!isMeaningfulMetricLabel(token)) continue;
      // Grab up to 2 short context words immediately following the metric for clarity (e.g. "496k repository downloads")
      const after = scanText.slice(match.index + match[0].length, match.index + match[0].length + 34);
      const contextMatch = after.match(/^\s+([A-Za-z][A-Za-z0-9/-]{1,18}(?:\s+[A-Za-z][A-Za-z0-9/-]{1,18})?)/);
      const contextWord = contextMatch ? contextMatch[1].replace(/[.,;:!?]+$/, '').trim() : '';
      const label = contextWord ? `${token} ${contextWord}` : token;
      candidates.push(label);
    }

    for (const rawCandidate of candidates) {
      const cleanLabel = sanitizeFeedDisplayText(rawCandidate, 52);
      if (!isMeaningfulMetricLabel(cleanLabel)) continue;
      const key = normalizeMetricKey(cleanLabel);
      const existing = seenByKey.get(key);
      if (existing) {
        if (!existing.slideIndices.includes(sIdx)) {
          existing.slideIndices.push(sIdx);
        }
        continue;
      }

      const slideIndices = [sIdx];
      const quote = findQuoteForMetric(sentences, cleanLabel);
      seenByKey.set(key, {
        id: `${post.id}_s${sIdx}_${seenByKey.size}`,
        label: cleanLabel,
        slideIndices,
        sourceQuote: quote,
        sourceUrl: safeSourceUrl,
        verified: defaultVerified,
        discrepancyMessage: attachDiscrepancy(cleanLabel, slideIndices),
      });
    }
  });

  // 4. Fallback to extractedSourceMetrics if deck slides had no numeric tokens yet
  for (let i = 0; i < (meta?.extractedSourceMetrics || []).length; i++) {
    const m = sanitizeFeedDisplayText(meta!.extractedSourceMetrics![i], 52);
    if (!isMeaningfulMetricLabel(m)) continue;
    const key = normalizeMetricKey(m);
    if (seenByKey.has(key)) continue;
    const slideIndices = findMatchingSlideIndices(slides, m);
    seenByKey.set(key, {
      id: `${post.id}_src_${i}`,
      label: m,
      slideIndices,
      sourceQuote: findQuoteForMetric(sentences, m),
      sourceUrl: safeSourceUrl,
      verified: defaultVerified,
      discrepancyMessage: attachDiscrepancy(m, slideIndices),
    });
  }

  return Array.from(seenByKey.values()).slice(0, 8);
}

/**
 * Converts Draft claims back into persisted `MetricEvidenceItem[]` after a single claim toggle
 * and computes whether all claims are verified.
 */
export function toggleDraftClaimEvidence(
  claims: DraftClaimEvidenceItem[],
  claimId: string,
  nextVerified: boolean
): {
  nextClaims: DraftClaimEvidenceItem[];
  allClaimsVerified: boolean;
  nextMetricEvidence: MetricEvidenceItem[];
} {
  const nextClaims = claims.map((c) =>
    c.id === claimId ? { ...c, verified: nextVerified } : c
  );
  const allClaimsVerified =
    nextClaims.length > 0 && nextClaims.every((c) => c.verified);
  const nextMetricEvidence: MetricEvidenceItem[] = nextClaims.map((c) => ({
    id: c.id,
    label: c.label,
    sourceQuote: c.sourceQuote || '',
    ...(c.sourceUrl ? { sourceUrl: c.sourceUrl } : {}),
    verified: c.verified,
  }));
  return { nextClaims, allClaimsVerified, nextMetricEvidence };
}

/**
 * Marks all claims verified or unverified when the reviewer clicks the master
 * "Claims & Numbers Verified" checkbox directly.
 */
export function setAllDraftClaimsVerified(
  claims: DraftClaimEvidenceItem[],
  verified: boolean
): {
  nextClaims: DraftClaimEvidenceItem[];
  nextMetricEvidence: MetricEvidenceItem[];
} {
  const nextClaims = claims.map((c) => ({ ...c, verified }));
  const nextMetricEvidence: MetricEvidenceItem[] = nextClaims.map((c) => ({
    id: c.id,
    label: c.label,
    sourceQuote: c.sourceQuote || '',
    ...(c.sourceUrl ? { sourceUrl: c.sourceUrl } : {}),
    verified,
  }));
  return { nextClaims, nextMetricEvidence };
}

/**
 * Checks which slide indices exceed QA character limits so the compact bilingual slide strip
 * flags exact overflow slides before shipping.
 */
export function findOverflowSlideIndices(post: SavedPostRecord): number[] {
  const slides = post.deck?.slides || [];
  const isSingle =
    post.deck?.postFormat === 'single' ||
    slides.length === 1 ||
    slides[0]?.type === 'poster';
  const limits = isSingle ? SINGLE_SLIDE_CHAR_LIMITS : CHAR_LIMITS;

  const overflow: number[] = [];
  slides.forEach((slide, idx) => {
    const isHook = idx === 0 && slide.type !== 'cta';
    const enTitleLimit = isHook ? limits.hookTitle : limits.enTitle;
    const arTitleLimit = isHook ? limits.hookArTitle : limits.arTitle;
    const enBodyLimit = limits.enBody;
    const arBodyLimit = limits.arBody;

    if (
      (slide.enTitle || '').trim().length > enTitleLimit ||
      (slide.arTitle || '').trim().length > arTitleLimit ||
      (slide.enBody || '').trim().length > enBodyLimit ||
      (slide.arBody || '').trim().length > arBodyLimit
    ) {
      overflow.push(idx);
    }
  });
  return overflow;
}

/**
 * Computes transparent, human-readable readiness status for a Draft card so disabled
 * Publish Now / Schedule actions always explain what step remains.
 */
export function computeDraftReadiness(args: {
  post: SavedPostRecord;
  claims: DraftClaimEvidenceItem[];
  humanReviewed: boolean;
  numbersVerified: boolean;
  marrokAngle: string;
}): DraftReadinessReport {
  const { post, claims, humanReviewed, numbersVerified, marrokAngle } = args;
  const totalClaimsCount = claims.length;
  const verifiedClaimsCount = claims.filter((c) => c.verified).length;
  const unverifiedClaimsCount = totalClaimsCount - verifiedClaimsCount;
  const overflowSlideIndices = findOverflowSlideIndices(post);
  const hasMarrokAngle = marrokAngle.trim().length >= 15;

  const remainingSteps: string[] = [];
  if (!humanReviewed) {
    remainingSteps.push('confirm human review');
  }
  if (!numbersVerified) {
    if (unverifiedClaimsCount > 0) {
      remainingSteps.push(
        `verify ${unverifiedClaimsCount} ${unverifiedClaimsCount === 1 ? 'claim' : 'claims'}`
      );
    } else {
      remainingSteps.push('confirm claims & numbers');
    }
  }

  const canShip = humanReviewed && numbersVerified;
  const summaryLabel = canShip
    ? 'Ready to schedule or publish'
    : `Needs: ${remainingSteps.join(' · ')}`;

  return {
    canShip,
    remainingSteps,
    summaryLabel,
    unverifiedClaimsCount,
    verifiedClaimsCount,
    totalClaimsCount,
    overflowSlideIndices,
    hasMarrokAngle,
  };
}

/**
 * Extracts safe display metadata (source domain, safe external link, relative update time) for a Draft card.
 */
export function extractDraftSourceDisplay(
  post: SavedPostRecord,
  nowMs = Date.now()
): DraftSourceDisplay {
  const rawUrl =
    post.deck?.sourceMeta?.url ||
    post.deck?.sourceMeta?.groundingSources?.[0]?.url ||
    post.deck?.brandUrl;
  const safeUrl = sanitizeSafeHttpUrl(rawUrl);
  const domain = safeUrl
    ? extractDomainClean(safeUrl)
    : post.deck?.sourceMeta?.creator
    ? sanitizeFeedDisplayText(post.deck.sourceMeta.creator, 40)
    : null;
  const updatedLabel = formatShortInboxDate(
    post.deck?.sourceMeta?.published || post.updatedAt || post.createdAt,
    nowMs
  );

  return {
    domain,
    safeUrl,
    updatedLabel,
  };
}
