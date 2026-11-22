import type { CarouselData } from '../../types.ts';
import {
  getCanvasDimensionSpec,
  MIN_BODY_FONT_SIZE,
  MIN_FOOTER_FONT_SIZE,
  MIN_TITLE_FONT_SIZE,
} from '../canvas/constants.ts';
import {
  checkContentQuality,
  checkDuplicateBodyText,
  checkPlaceholders,
} from './contentQualityChecks.ts';
import {
  checkArabicSafeZone,
  checkArchetypeFields,
  checkCreditPresence,
  checkFirstFrame,
  checkLastSlideCta,
  checkMinFontSizeViolation,
  checkSlideCount,
  checkTikTokSafeZoneViolations,
  checkTruncatedDescriptions,
} from './structuralChecks.ts';
import {
  checkArabicLineEndings,
  checkArabicTranslatedTechTerms,
  checkBilingualTranslationFidelity,
  checkCharLimits,
  checkHeadlineSpecRule,
  checkMarkdownAndPunctuation,
  checkPlatformCaptionLimits,
} from './textChecks.ts';
import type { QACheckOptions, QACheckResult, QAReport } from './types.ts';

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
    results.push(...checkBilingualTranslationFidelity(slides[i], i));
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
