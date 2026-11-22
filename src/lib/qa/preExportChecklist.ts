import type { CarouselData, ThemePalette } from '../../types.ts';
import { isPlaceholderOrEmptyBrandValue } from '../bundledTechSvgs.ts';
import { MIN_FOOTER_FONT_SIZE, MIN_TITLE_FONT_SIZE } from '../canvas/constants.ts';
import {
  DROP_MESSAGE_PATTERN,
  MEANINGLESS_LABEL_PATTERN,
  PARTNERSHIP_CLAIM_PATTERN,
} from './constants.ts';
import { runQAChecks } from './qaEngine.ts';
import { computeWcagContrastRatio } from './structuralChecks.ts';
import type { PreExportCheckItem } from './types.ts';

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
