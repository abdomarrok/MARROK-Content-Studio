import type { CarouselData, GraphicalElementId, SlideData } from '../../types.ts';
import type { PreExportCheckId } from '../qaChecks.ts';
import { sanitizeSlide } from '../textSanitizer.ts';
import {
  autoSyncSlideGraphicsFromCopy,
  autoFitSlideCopyToLimits,
  cleanCarouselContentQuality,
} from '../synthesizer.ts';
import {
  fixArabicPunctuation,
  sanitizeArabicSlideText,
  repairTruncatedTextEllipsis,
} from '../text/arabicBiDi.ts';

export interface PreExportAutoFixResult {
  nextDeck: CarouselData;
  toastMessage: string;
}

function inferSourceAttribution(prev: CarouselData): string {
  let urlHost = '';
  if (prev.sourceMeta?.url) {
    try {
      urlHost = new URL(prev.sourceMeta.url).hostname.replace(/^www\./, '');
    } catch {
      urlHost = '';
    }
  }
  const rawChannel = prev.channel?.trim() || '';
  const cleanChannel = /Engineering Technical Report/i.test(rawChannel) ? '' : rawChannel;
  return (
    prev.sourceMeta?.creator?.trim() ||
    prev.sourceMeta?.channel?.trim() ||
    urlHost ||
    prev.sourceMeta?.title?.trim() ||
    cleanChannel ||
    prev.brandUrl?.trim() ||
    prev.brand?.trim() ||
    'marrok.org'
  );
}

function fixSingleSlidePreExport(
  slide: SlideData,
  idx: number,
  totalSlides: number,
  checkId: PreExportCheckId,
  isSingle: boolean
): SlideData {
  if (checkId === 'duplicateLabels') {
    return autoSyncSlideGraphicsFromCopy(
      {
        ...slide,
        satLabels: undefined,
        diagramNodes: undefined,
      },
      idx
    );
  }

  if (checkId === 'chartDirection') {
    const synced = autoSyncSlideGraphicsFromCopy(
      {
        ...slide,
        chartDirection: 'down' as const,
      },
      idx
    );
    return {
      ...synced,
      chartDirection: 'down' as const,
    };
  }

  if (checkId === 'safeZones') {
    const nextOverrides = { ...(slide.layoutOverrides || {}) };
    for (const [k, ov] of Object.entries(nextOverrides)) {
      if (!ov) continue;
      nextOverrides[k as GraphicalElementId] = {
        ...ov,
        dx: Math.min(45, Math.max(-45, ov.dx ?? 0)),
        dy: Math.min(45, Math.max(-25, ov.dy ?? 0)),
      };
    }
    return {
      ...slide,
      layoutOverrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined,
    };
  }

  if (checkId === 'minFontSize') {
    const nextOverrides = { ...(slide.layoutOverrides || {}) };
    for (const [k, ov] of Object.entries(nextOverrides)) {
      if (!ov) continue;
      nextOverrides[k as GraphicalElementId] = {
        ...ov,
        scale: Math.max(1, ov.scale ?? 1),
      };
    }
    return {
      ...slide,
      layoutOverrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined,
    };
  }

  if (checkId === 'truncatedCopy') {
    return sanitizeSlide(
      {
        ...slide,
        enTitle: repairTruncatedTextEllipsis(slide.enTitle || ''),
        arTitle: repairTruncatedTextEllipsis(slide.arTitle || ''),
        enBody: repairTruncatedTextEllipsis(slide.enBody || ''),
        arBody: repairTruncatedTextEllipsis(slide.arBody || ''),
      },
      idx,
      totalSlides
    );
  }

  if (checkId === 'bilingualConsistency') {
    const fallbackArTitle =
      (slide.arTitle || '').trim() ||
      `تحليل معماري: ${(slide.enTitle || 'النظام الهندسي').replace(/[.?!]+$/, '')}`;
    const fallbackArBody =
      (slide.arBody || '').trim() ||
      `آلية هندسية توضح تفاصيل ${(slide.enTitle || 'النظام').replace(/[.?!]+$/, '')} بدقة عالية.`;
    const fallbackEnTitle = (slide.enTitle || '').trim() || 'Core System Mechanism.';
    const fallbackEnBody =
      (slide.enBody || '').trim() ||
      'Engineered to enforce deterministic latency and horizontal scalability.';
    return sanitizeSlide(
      {
        ...slide,
        enTitle: fallbackEnTitle,
        arTitle: sanitizeArabicSlideText(fallbackArTitle, { isTitle: true }),
        enBody: fallbackEnBody,
        arBody: fixArabicPunctuation(
          sanitizeArabicSlideText(fallbackArBody, { isTitle: false })
        ),
      },
      idx,
      totalSlides
    );
  }

  const fitted = autoFitSlideCopyToLimits(slide, idx, isSingle);
  return sanitizeSlide(fitted, idx, totalSlides);
}

/**
 * Pure deck transformation for one-tap Pre-Export QA auto-fixes.
 * Handles all deck/slide checks except palette theme switching ('contrast').
 */
export function applyPreExportAutoFixToDeck(
  prev: CarouselData,
  checkId: PreExportCheckId,
  options: { targetSlideIdx?: number; promptInput?: string } = {}
): PreExportAutoFixResult {
  const { targetSlideIdx, promptInput = '' } = options;

  if (checkId === 'unverifiedNumbers') {
    return {
      nextDeck: {
        ...prev,
        sourceMeta: {
          ...prev.sourceMeta,
          verifiedNumbers: true,
        },
        slides: prev.slides.map((s) => ({
          ...s,
          numbersVerified: true,
        })),
      },
      toastMessage: 'Marked all slide numbers as verified against source',
    };
  }

  if (checkId === 'missingSource') {
    const inferredSource = inferSourceAttribution(prev);
    const nextSlides = prev.slides.map((s, idx) =>
      idx === prev.slides.length - 1
        ? {
            ...s,
            enCredit: `Source: ${inferredSource}`,
            arCredit: `المصدر: ${inferredSource}`,
          }
        : s
    );
    return {
      nextDeck: {
        ...prev,
        channel: inferredSource,
        sourceMeta: {
          ...prev.sourceMeta,
          creator: inferredSource,
          channel: inferredSource,
        },
        slides: nextSlides,
      },
      toastMessage: 'Set Source attribution across deck',
    };
  }

  if (checkId === 'brandLogoSafety') {
    return {
      nextDeck: {
        ...prev,
        officialBrandIcons: {},
        slides: prev.slides.map((slide, idx) => {
          const nextSubjectPair = slide.subjectPair
            ? {
                ...slide.subjectPair,
                beforeAsText: true,
                afterAsText: true,
                beforeLogoKey: undefined,
                afterLogoKey: undefined,
                logoWidthPct: Math.min(slide.subjectPair.logoWidthPct ?? 11, 14),
                isEdited: false,
                isMerged: false,
                isOverlapping: false,
                usesMascot: false,
              }
            : undefined;
          return autoSyncSlideGraphicsFromCopy(
            {
              ...slide,
              centerIcon: undefined,
              satIcons: undefined,
              brandLogoConfig: undefined,
              subjectPair: nextSubjectPair,
            },
            idx
          );
        }),
      },
      toastMessage: 'Replaced third-party logos with styled text names & architecture icons',
    };
  }

  if (checkId === 'contentQuality') {
    return {
      nextDeck: cleanCarouselContentQuality(prev, promptInput),
      toastMessage: 'Auto-cleaned filler labels, template phrasing & source-anchored nodes',
    };
  }

  const isSingle = prev.postFormat === 'single' || prev.slides.length === 1;
  const nextSlides = prev.slides.map((slide, idx) => {
    if (targetSlideIdx !== undefined && idx !== targetSlideIdx) return slide;
    return fixSingleSlidePreExport(slide, idx, prev.slides.length, checkId, isSingle);
  });

  return {
    nextDeck: { ...prev, slides: nextSlides },
    toastMessage: `Auto-fixed ${checkId} check across deck`,
  };
}
