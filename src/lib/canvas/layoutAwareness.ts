import type {
  CarouselData,
  CanvasDimensionPreset,
  GraphicalElementId,
  SlideData,
  ElementLayoutOverride,
  SlideCompositionPreset,
  TextAlignment,
} from '../../types.ts';
import {
  FONT_TITLE_EN,
  FONT_TITLE_AR,
  FONT_BODY_EN,
  FONT_BODY_AR,
  CanvasDimensionSpec,
  getCanvasDimensionSpec,
  getArchetypeGraphicTransform,
  isFullMemeSlide,
  isHeroImageSlide,
} from './constants.ts';
import { fitTextInBox } from './textLayout.ts';

export const MIN_GAP_GRAPHIC_TO_TITLE = 44;
export const MIN_GAP_TITLES = 18;
export const MIN_GAP_TITLE_TO_BODY = 36;
export const MIN_GAP_BODIES = 22;
export const MIN_GAP_TO_FOOTER = 24;

export interface TextBlockLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  top: number;
  bottom: number;
  height: number;
  firstBaselineY: number;
  dx: number;
  dy: number;
  scale: number;
  opacity: number;
  align: TextAlignment;
  hidden: boolean;
}

export interface GraphicCardLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  effectiveTop: number;
  effectiveBottom: number;
  dx: number;
  dy: number;
  scale: number;
  opacity: number;
  hidden: boolean;
}

export interface ComputedSlideLayout {
  slideType: string;
  dimensionPreset: CanvasDimensionPreset;
  compositionPreset: SlideCompositionPreset;
  freeMoveLayout: boolean;
  canvasWidth: number;
  canvasHeight: number;
  headerBadge: {
    x: number;
    y: number;
    width: number;
    height: number;
    dx: number;
    dy: number;
    scale: number;
    opacity: number;
    hidden: boolean;
  };
  graphicCard?: GraphicCardLayout;
  titleBlock?: TextBlockLayout;
  arabicTitleBlock?: TextBlockLayout;
  bodyBlock?: TextBlockLayout;
  arabicBodyBlock?: TextBlockLayout;
  takeawaysBlock?: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    bottom: number;
    dx: number;
    dy: number;
    scale: number;
    opacity: number;
    hidden: boolean;
  };
  ctaButton?: {
    x: number;
    y: number;
    width: number;
    height: number;
    dx: number;
    dy: number;
    scale: number;
    opacity: number;
    hidden: boolean;
  };
  attributionCard?: {
    x: number;
    y: number;
    width: number;
    height: number;
    dx: number;
    dy: number;
    scale: number;
    opacity: number;
    hidden: boolean;
  };
  hasCollisionWarning: boolean;
  collisionDetails?: string[];
}

/**
 * Applies a 1-click Slide Composition Preset to a slide, setting clean defaults
 * for layoutOverrides, compositionPreset, and freeMoveLayout.
 */
export function applySlideCompositionPreset(
  slide: SlideData,
  preset: SlideCompositionPreset
): SlideData {
  const existingOverrides = slide.layoutOverrides || {};
  const preserveVisibility = (id: GraphicalElementId): ElementLayoutOverride => {
    const prev = existingOverrides[id];
    return prev?.hidden ? { hidden: true } : {};
  };

  if (preset === 'standard') {
    return {
      ...slide,
      compositionPreset: 'standard',
      freeMoveLayout: false,
      layoutOverrides: undefined,
    };
  }

  if (preset === 'headline-first') {
    return {
      ...slide,
      compositionPreset: 'headline-first',
      freeMoveLayout: false,
      layoutOverrides: {
        headerBadge: { ...preserveVisibility('headerBadge') },
        titleBlock: { ...preserveVisibility('titleBlock'), scale: 1.02, align: 'center' },
        arabicTitleBlock: { ...preserveVisibility('arabicTitleBlock'), scale: 1.02, align: 'center' },
        graphicCard: { ...preserveVisibility('graphicCard'), scale: 0.92 },
        bodyBlock: { ...preserveVisibility('bodyBlock'), align: 'center' },
        arabicBodyBlock: { ...preserveVisibility('arabicBodyBlock'), align: 'center' },
      },
    };
  }

  if (preset === 'visual-hero') {
    return {
      ...slide,
      compositionPreset: 'visual-hero',
      freeMoveLayout: false,
      layoutOverrides: {
        graphicCard: { ...preserveVisibility('graphicCard'), scale: 1.12, dy: 12 },
        titleBlock: { ...preserveVisibility('titleBlock'), scale: 0.94, align: 'center' },
        arabicTitleBlock: { ...preserveVisibility('arabicTitleBlock'), scale: 0.94, align: 'center' },
        bodyBlock: { ...preserveVisibility('bodyBlock'), scale: 0.92, align: 'center' },
        arabicBodyBlock: { ...preserveVisibility('arabicBodyBlock'), scale: 0.92, align: 'center' },
      },
    };
  }

  if (preset === 'split-balanced') {
    return {
      ...slide,
      compositionPreset: 'split-balanced',
      freeMoveLayout: false,
      layoutOverrides: {
        graphicCard: { ...preserveVisibility('graphicCard'), scale: 0.96 },
        titleBlock: { ...preserveVisibility('titleBlock'), align: 'left' },
        arabicTitleBlock: { ...preserveVisibility('arabicTitleBlock'), align: 'right' },
        bodyBlock: { ...preserveVisibility('bodyBlock'), align: 'left' },
        arabicBodyBlock: { ...preserveVisibility('arabicBodyBlock'), align: 'right' },
      },
    };
  }

  // compact-editorial
  return {
    ...slide,
    compositionPreset: 'compact-editorial',
    freeMoveLayout: false,
    layoutOverrides: {
      graphicCard: { ...preserveVisibility('graphicCard'), scale: 0.9, dy: -10 },
      titleBlock: { ...preserveVisibility('titleBlock'), scale: 0.9, dy: -8, align: 'center' },
      arabicTitleBlock: { ...preserveVisibility('arabicTitleBlock'), scale: 0.9, dy: -4, align: 'center' },
      bodyBlock: { ...preserveVisibility('bodyBlock'), scale: 0.9, dy: -4, align: 'center' },
      arabicBodyBlock: { ...preserveVisibility('arabicBodyBlock'), scale: 0.9, dy: -4, align: 'center' },
    },
  };
}

// Cached measure canvas context
let measureCtx: CanvasRenderingContext2D | null = null;
let hasAttemptedContext = false;
function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!hasAttemptedContext) {
    hasAttemptedContext = true;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      measureCtx = canvas.getContext('2d');
    } catch (_) {
      measureCtx = null;
    }
  }
  return measureCtx;
}

const MAX_LAYOUT_CACHE_ENTRIES = 160;
const slideLayoutCache = new Map<string, ComputedSlideLayout>();

function cloneTextBlock(block?: TextBlockLayout): TextBlockLayout | undefined {
  if (!block) return undefined;
  return {
    ...block,
    lines: [...block.lines],
  };
}

function cloneComputedLayout(layout: ComputedSlideLayout): ComputedSlideLayout {
  return {
    ...layout,
    headerBadge: { ...layout.headerBadge },
    graphicCard: layout.graphicCard ? { ...layout.graphicCard } : undefined,
    titleBlock: cloneTextBlock(layout.titleBlock),
    arabicTitleBlock: cloneTextBlock(layout.arabicTitleBlock),
    bodyBlock: cloneTextBlock(layout.bodyBlock),
    arabicBodyBlock: cloneTextBlock(layout.arabicBodyBlock),
    takeawaysBlock: layout.takeawaysBlock ? { ...layout.takeawaysBlock } : undefined,
    ctaButton: layout.ctaButton ? { ...layout.ctaButton } : undefined,
    attributionCard: layout.attributionCard ? { ...layout.attributionCard } : undefined,
    collisionDetails: layout.collisionDetails ? [...layout.collisionDetails] : undefined,
  };
}

function buildSlideLayoutCacheKey(
  slide: SlideData,
  hasCtx: boolean,
  preset: CanvasDimensionPreset,
  creatorHandle: string
): string {
  const takeawaysKey = slide.takeaways
    ? slide.takeaways.map((t) => `${t.en || ''}:${t.ar || ''}:${t.icon || ''}`).join(';')
    : '';
  const overridesKey = slide.layoutOverrides ? JSON.stringify(slide.layoutOverrides) : '';
  const compPreset = slide.compositionPreset || 'standard';
  const freeMove = slide.freeMoveLayout ? 1 : 0;
  const heroFrame = isFullMemeSlide(slide) ? 'full' : isHeroImageSlide(slide) ? 'hero' : 'std';
  const ctaAndCreditKey = `${slide.ctaText || ''}|${slide.enCredit || ''}|${slide.arCredit || ''}|${slide.url || ''}|${creatorHandle}`;
  return `${hasCtx ? 1 : 0}|${preset}|${compPreset}|${freeMove}|${heroFrame}|${slide.type || ''}|${slide.enTitle || ''}|${slide.arTitle || ''}|${slide.enBody || ''}|${slide.arBody || ''}|${takeawaysKey}|${ctaAndCreditKey}|${overridesKey}`;
}

function storeComputedLayout(key: string, layout: ComputedSlideLayout): ComputedSlideLayout {
  if (slideLayoutCache.has(key)) {
    slideLayoutCache.delete(key);
  } else if (slideLayoutCache.size >= MAX_LAYOUT_CACHE_ENTRIES) {
    const oldestKey = slideLayoutCache.keys().next().value;
    if (oldestKey !== undefined) {
      slideLayoutCache.delete(oldestKey);
    }
  }
  slideLayoutCache.set(key, cloneComputedLayout(layout));
  return layout;
}

/**
 * Slide Layout Awareness Engine:
 * Computes exact positions, bounds, and baseline coordinates for all elements on a slide
 * across TikTok 9:16 (1080x1920) and Instagram (4:5 1080x1350, 3:4 1080x1440, 1:1 1080x1080, 9:16 1080x1920).
 * Supports:
 * - Standard Cascade Mode & Free-Move Mode (`slide.freeMoveLayout`)
 * - 1-Click Composition Presets including `headline-first` (Titles above Graphic Card, Body below)
 * - Per-element Scale (`0.6x..1.5x`) for both graphic cards and all text blocks
 * - Per-element Alignment (`left | center | right`), Opacity (`0.1..1.0`), and Visibility (`hidden`)
 */
export function computeSlideLayoutAwareness(
  slide: SlideData,
  carousel?: CarouselData
): ComputedSlideLayout {
  const ctx = getMeasureContext();
  const spec = getCanvasDimensionSpec(carousel?.dimensionPreset);
  const creatorHandle =
    carousel?.sourceMeta?.creator ||
    carousel?.sourceMeta?.channel ||
    carousel?.channel ||
    carousel?.brand ||
    '';
  const cacheKey = buildSlideLayoutCacheKey(slide, Boolean(ctx), spec.id, creatorHandle);
  const cached = slideLayoutCache.get(cacheKey);
  if (cached) {
    return cloneComputedLayout(cached);
  }

  const overrides = slide.layoutOverrides || {};
  const compositionPreset: SlideCompositionPreset = slide.compositionPreset || 'standard';
  const freeMove = Boolean(slide.freeMoveLayout);

  const clampBoxDx = (baseLeft: number, width: number, desiredDx: number): number => {
    if (width >= spec.safeContentWidth) {
      return Math.round(spec.safeTextCenterX - width / 2 - baseLeft);
    }
    const minDx = spec.safeMarginLeft - baseLeft;
    const maxDx = spec.safeMarginRight - (baseLeft + width);
    return Math.round(Math.max(minDx, Math.min(maxDx, desiredDx)));
  };

  const clampTextDx = (boxWidth: number, desiredDx: number, align: TextAlignment = 'center'): number => {
    const effW = Math.min(boxWidth, spec.safeContentWidth);
    if (align === 'left') {
      const maxDx = Math.max(0, spec.safeContentWidth - effW);
      return Math.round(Math.max(0, Math.min(maxDx, desiredDx)));
    }
    if (align === 'right') {
      const minDx = -Math.max(0, spec.safeContentWidth - effW);
      return Math.round(Math.max(minDx, Math.min(0, desiredDx)));
    }
    const minDx = spec.safeMarginLeft - (spec.safeTextCenterX - effW / 2);
    const maxDx = spec.safeMarginRight - (spec.safeTextCenterX + effW / 2);
    const lo = Math.min(minDx, maxDx);
    const hi = Math.max(minDx, maxDx);
    return Math.round(Math.max(lo, Math.min(hi, desiredDx)));
  };

  // 1. Header Badge Layout (clamped to safe zone)
  const headerOverride = overrides.headerBadge;
  const headerLeftX = spec.headerMarginLeft ?? spec.safeMarginLeft;
  const headerRightX = spec.headerMarginRight ?? spec.safeMarginRight;
  const headerBaseW = headerRightX - headerLeftX;
  const headerTopY = Math.max(40, spec.headerY - 12);
  const headerScale = Math.max(0.6, Math.min(1, headerOverride?.scale ?? 1));
  const clampedHeaderDx = clampBoxDx(headerLeftX, headerBaseW * headerScale, headerOverride?.dx || 0);
  const minHeaderDy = Math.max(-24, spec.headerY - 24 - headerTopY);
  const maxHeaderDy = Math.max(0, spec.safeFooterCeilingY - 72 - headerTopY);
  const clampedHeaderDy = Math.max(minHeaderDy, Math.min(maxHeaderDy, headerOverride?.dy || 0));
  const headerBadge = {
    x: headerLeftX + clampedHeaderDx,
    y: headerTopY + clampedHeaderDy,
    width: headerBaseW,
    height: 72,
    dx: clampedHeaderDx,
    dy: clampedHeaderDy,
    scale: headerScale,
    opacity: headerOverride?.opacity ?? 1,
    hidden: Boolean(headerOverride?.hidden),
  };

  const headerSafeFloorY = headerBadge.hidden ? spec.headerY : headerBadge.y + headerBadge.height;

  // 2. CTA Slide Layout Awareness
  if (slide.type === 'cta') {
    return storeComputedLayout(
      cacheKey,
      computeCtaSlideLayout(slide, headerBadge, ctx, overrides, spec, compositionPreset, freeMove)
    );
  }

  // 3. Base Graphic Card Transform & Overrides
  const graphicOverride = overrides.graphicCard;
  const rawGDx = graphicOverride?.dx || 0;
  let gDy = graphicOverride?.dy || 0;
  let gScale = graphicOverride?.scale ?? 1;
  const gOpacity = graphicOverride?.opacity ?? 1;
  const gHidden = Boolean(graphicOverride?.hidden);

  const { cardX, cardY: defaultCardY, cardW, cardH } = getArchetypeGraphicTransform(spec, slide.type, slide);
  const gDx = clampBoxDx(cardX + (cardW - cardW * gScale) / 2, cardW * gScale, rawGDx);

  // 4. Content Slide Text Measurement & Scaling Pass
  const rawEnTitle = (slide.enTitle || '').trim();
  const rawArTitle = (slide.arTitle || '').trim();
  const rawEnBody = (slide.enBody || '').trim();
  const rawArBody = (slide.arBody || '').trim();

  const titleOverride = overrides.titleBlock;
  const arTitleOverride = overrides.arabicTitleBlock;
  const bodyOverride = overrides.bodyBlock;
  const arBodyOverride = overrides.arabicBodyBlock;
  const takeawaysOverride = overrides.takeawaysBlock;

  const titleScale = titleOverride?.scale ?? 1;
  const arTitleScale = arTitleOverride?.scale ?? 1;
  const bodyScale = bodyOverride?.scale ?? 1;
  const arBodyScale = arBodyOverride?.scale ?? 1;
  const takeawaysScale = Math.min(1, takeawaysOverride?.scale ?? 1);

  const isFullMeme = isFullMemeSlide(slide);
  const titleHidden = isFullMeme || Boolean(titleOverride?.hidden);
  const arTitleHidden = isFullMeme || Boolean(arTitleOverride?.hidden);
  const bodyHidden = isFullMeme || Boolean(bodyOverride?.hidden);
  const arBodyHidden = isFullMeme || Boolean(arBodyOverride?.hidden);
  const takeawaysHidden = isFullMeme || Boolean(takeawaysOverride?.hidden);

  const isCompactAspect = spec.height < 1920;
  const gapGraphicToTitle = isCompactAspect
    ? Math.max(22, Math.round(MIN_GAP_GRAPHIC_TO_TITLE * spec.graphicScale))
    : MIN_GAP_GRAPHIC_TO_TITLE;
  const minGapTitles = isCompactAspect
    ? Math.max(12, Math.round(MIN_GAP_TITLES * spec.graphicScale))
    : MIN_GAP_TITLES;
  const minGapTitleToBody = isCompactAspect
    ? Math.max(20, Math.round(MIN_GAP_TITLE_TO_BODY * spec.graphicScale))
    : MIN_GAP_TITLE_TO_BODY;
  const minGapBodies = isCompactAspect
    ? Math.max(14, Math.round(MIN_GAP_BODIES * spec.graphicScale))
    : MIN_GAP_BODIES;

  // Takeaway reservation (suppressed in tall Hero Meme Frame / Full Meme mode so the meme has clean vertical space)
  const isHeroImage = isHeroImageSlide(slide);
  const hasTakeaways = !isHeroImage && !isFullMeme && Boolean(slide.takeaways && slide.takeaways.length > 0);
  const takeawayCount = hasTakeaways ? Math.min(3, slide.takeaways!.length) : 0;
  const baseTakeawayRowH = (takeawayCount === 1 ? 84 : takeawayCount === 2 ? 80 : 76) * takeawaysScale;
  const takeawayRowH = isCompactAspect
    ? Math.max(54, Math.round(baseTakeawayRowH * Math.max(0.78, spec.graphicScale)))
    : Math.round(baseTakeawayRowH);
  const takeawayGap = isCompactAspect ? 10 : 12;
  const takeawaysTotalH = hasTakeaways ? takeawayCount * takeawayRowH + (takeawayCount - 1) * takeawayGap : 0;
  const activeTakeawaysH = hasTakeaways && !takeawaysHidden ? takeawaysTotalH : 0;
  const takeawayClearance = activeTakeawaysH > 0 ? activeTakeawaysH + minGapBodies : 0;

  // Ensure graphic card top never rises above headerSafeFloorY in standard/cascade modes
  if (!gHidden && compositionPreset !== 'headline-first') {
    const tempCy = defaultCardY + cardH / 2;
    const rawEffTop = tempCy - (cardH / 2) * gScale + gDy;
    if (rawEffTop < headerSafeFloorY) {
      gDy += headerSafeFloorY - rawEffTop;
    }
  }

  const tempCy = defaultCardY + cardH / 2;
  const tempEffectiveBottom = gHidden ? headerSafeFloorY : tempCy + (cardH / 2) * gScale + gDy;
  const baseTextCeilingY = gHidden
    ? headerSafeFloorY + 16
    : compositionPreset === 'headline-first'
    ? Math.max(136, headerSafeFloorY + (isCompactAspect ? 18 : 28)) + cardH * gScale + (isCompactAspect ? 42 : 66)
    : Math.max(defaultCardY + cardH, tempEffectiveBottom);

  const totalAvailableHeight = Math.max(
    180,
    spec.safeFooterCeilingY - baseTextCeilingY - gapGraphicToTitle - takeawayClearance
  );

  // Dynamic font fitting pass: taller 9:16 canvases use larger body copy so vertical space feels cohesive
  const initialScaleBase = isCompactAspect ? Math.max(0.74, spec.graphicScale + 0.08) : 1.04;
  let textScale = hasTakeaways
    ? Math.min(0.9, initialScaleBase * 0.9)
    : totalAvailableHeight >= 940
    ? 1.08
    : initialScaleBase;
  let bodyCap = hasTakeaways ? 2 : isCompactAspect && spec.height <= 1080 ? 3 : 4;
  const minAllowedScale = isCompactAspect ? 0.52 : 0.62;

  const measureTextPass = (scale: number, cap: number) => {
    const baseBodyTarget = isCompactAspect ? 40 : 45;
    const baseBodyMin = isCompactAspect ? 26 : 28;
    const enTitleTarget = Math.max(28, 74 * scale * titleScale);
    const arTitleTarget = Math.max(26, 70 * scale * arTitleScale);
    const enBodyTarget = Math.max(22, baseBodyTarget * scale * bodyScale);
    const arBodyTarget = Math.max(22, baseBodyTarget * scale * arBodyScale);

    const enTitleMin = Math.max(24, Math.round((isCompactAspect ? 34 : 42) * Math.min(1, titleScale)));
    const arTitleMin = Math.max(24, Math.round((isCompactAspect ? 32 : 40) * Math.min(1, arTitleScale)));
    const enBodyMin = Math.max(20, Math.round(baseBodyMin * Math.min(1, bodyScale)));
    const arBodyMin = Math.max(20, Math.round(baseBodyMin * Math.min(1, arBodyScale)));

    let enTitle = { lines: rawEnTitle ? [rawEnTitle] : [], fontSize: enTitleTarget, lineHeight: enTitleTarget * 1.19 };
    let arTitle = { lines: rawArTitle ? [rawArTitle] : [], fontSize: arTitleTarget, lineHeight: arTitleTarget * 1.457 };
    let enBody = { lines: rawEnBody ? [rawEnBody] : [], fontSize: enBodyTarget, lineHeight: enBodyTarget * 1.42 };
    let arBody = { lines: rawArBody ? [rawArBody] : [], fontSize: arBodyTarget, lineHeight: arBodyTarget * 1.526 };

    if (ctx) {
      if (rawEnTitle) {
        enTitle = fitTextInBox(ctx, rawEnTitle, spec.safeTextWidthTitle, enTitleTarget, FONT_TITLE_EN, '800', {
          maxLines: titleScale > 1.15 ? 3 : 2,
          minFontSize: enTitleMin,
          lineHeightFactor: 1.19,
        });
      }
      if (rawArTitle) {
        arTitle = fitTextInBox(ctx, rawArTitle, spec.safeTextWidthTitle, arTitleTarget, FONT_TITLE_AR, '800', {
          maxLines: arTitleScale > 1.15 ? 3 : 2,
          minFontSize: arTitleMin,
          lineHeightFactor: 1.457,
        });
      }
      if (rawEnBody) {
        enBody = fitTextInBox(ctx, rawEnBody, spec.safeTextWidthBody, enBodyTarget, FONT_BODY_EN, '400', {
          maxLines: cap,
          minFontSize: enBodyMin,
          lineHeightFactor: 1.42,
        });
      }
      if (rawArBody) {
        arBody = fitTextInBox(ctx, rawArBody, spec.safeTextWidthBody, arBodyTarget, FONT_BODY_AR, '400', {
          maxLines: cap,
          minFontSize: arBodyMin,
          lineHeightFactor: 1.526,
        });
      }
    }

    const enTitleHeight =
      enTitle.lines.length > 0 ? (enTitle.lines.length - 1) * enTitle.lineHeight + enTitle.fontSize * 1.05 : 0;
    const arTitleHeight =
      arTitle.lines.length > 0 ? (arTitle.lines.length - 1) * arTitle.lineHeight + arTitle.fontSize * 1.08 : 0;
    const enBodyHeight =
      enBody.lines.length > 0 ? (enBody.lines.length - 1) * enBody.lineHeight + enBody.fontSize * 1.05 : 0;
    const arBodyHeight =
      arBody.lines.length > 0 ? (arBody.lines.length - 1) * arBody.lineHeight + arBody.fontSize * 1.08 : 0;

    const effEnTitleH = titleHidden ? 0 : enTitleHeight;
    const effArTitleH = arTitleHidden ? 0 : arTitleHeight;
    const effEnBodyH = bodyHidden ? 0 : enBodyHeight;
    const effArBodyH = arBodyHidden ? 0 : arBodyHeight;

    const gapTitles = effEnTitleH > 0 && effArTitleH > 0 ? minGapTitles : 0;
    const gapTitlesToBody =
      (effEnTitleH > 0 || effArTitleH > 0) && (effEnBodyH > 0 || effArBodyH > 0) ? minGapTitleToBody : 0;
    const gapBodies = effEnBodyH > 0 && effArBodyH > 0 ? minGapBodies : 0;

    const totalStackHeight =
      effEnTitleH + gapTitles + effArTitleH + gapTitlesToBody + effEnBodyH + gapBodies + effArBodyH;

    return {
      enTitle,
      arTitle,
      enBody,
      arBody,
      gapTitles,
      gapTitlesToBody,
      gapBodies,
      enTitleHeight,
      arTitleHeight,
      enBodyHeight,
      arBodyHeight,
      effEnTitleH,
      effArTitleH,
      effEnBodyH,
      effArBodyH,
      totalStackHeight,
    };
  };

  let measured = measureTextPass(textScale, bodyCap);

  // Progressive compression to guarantee zero overlap and footer safety
  while (measured.totalStackHeight > totalAvailableHeight - 20 && textScale > minAllowedScale) {
    textScale = Math.max(minAllowedScale, textScale - 0.05);
    measured = measureTextPass(textScale, bodyCap);
  }
  while (measured.totalStackHeight > totalAvailableHeight - 15 && bodyCap > 2) {
    bodyCap -= 1;
    measured = measureTextPass(textScale, bodyCap);
  }

  // If graphic card was pushed down or scaled large enough that even compressed text + takeaways would overflow
  // spec.safeFooterCeilingY, pull graphicCard up (down to headerSafeFloorY) or reduce gScale so both fit in safe zone
  if (!gHidden && !freeMove && compositionPreset !== 'headline-first') {
    const hasVisibleTextOrTakeaways = measured.totalStackHeight > 0 || takeawayClearance > 0;
    if (hasVisibleTextOrTakeaways) {
      const maxAllowedGraphicBottom =
        spec.safeFooterCeilingY - gapGraphicToTitle - measured.totalStackHeight - takeawayClearance;
      const cy = defaultCardY + cardH / 2;
      let curBottom = cy + (cardH / 2) * gScale + gDy;
      let curTop = cy - (cardH / 2) * gScale + gDy;

      if (curBottom > maxAllowedGraphicBottom) {
        const upRoom = Math.max(0, curTop - headerSafeFloorY);
        const shiftUp = Math.min(curBottom - maxAllowedGraphicBottom, upRoom);
        gDy -= shiftUp;
        curTop -= shiftUp;
        curBottom -= shiftUp;

        if (curBottom > maxAllowedGraphicBottom && cardH > 0) {
          const maxFitH = Math.max(140, maxAllowedGraphicBottom - headerSafeFloorY);
          gScale = Math.max(0.45, Number((maxFitH / cardH).toFixed(3)));
          const newHalfH = (cardH * gScale) / 2;
          gDy = headerSafeFloorY + newHalfH - cy;
        }
      }
    } else {
      const cy = defaultCardY + cardH / 2;
      const curBottom = cy + (cardH / 2) * gScale + gDy;
      if (curBottom > spec.safeFooterCeilingY) {
        gDy -= curBottom - spec.safeFooterCeilingY;
      }
    }
  }

  // 5. Layout Awareness: Guaranteed Non-Overlapping Stacking (Standard vs Headline-First vs Free-Move)
  let graphicCard: GraphicCardLayout;
  let titleBlock: TextBlockLayout | undefined;
  let arabicTitleBlock: TextBlockLayout | undefined;
  let bodyBlock: TextBlockLayout | undefined;
  let arabicBodyBlock: TextBlockLayout | undefined;
  let takeawaysBlock: ComputedSlideLayout['takeawaysBlock'] | undefined;

  const tAlign: TextAlignment = titleOverride?.align || 'center';
  const arTAlign: TextAlignment = arTitleOverride?.align || 'center';
  const bAlign: TextAlignment = bodyOverride?.align || 'center';
  const arBAlign: TextAlignment = arBodyOverride?.align || 'center';

  const tDx = clampTextDx(spec.safeTextWidthTitle, titleOverride?.dx || 0, tAlign);
  const arTDx = clampTextDx(spec.safeTextWidthTitle, arTitleOverride?.dx || 0, arTAlign);
  const bDx = clampTextDx(spec.safeTextWidthBody, bodyOverride?.dx || 0, bAlign);
  const arBDx = clampTextDx(spec.safeTextWidthBody, arBodyOverride?.dx || 0, arBAlign);

  if (compositionPreset === 'headline-first') {
    // Editorial Headline-First composition:
    // 1) English & Arabic Headlines at top (below headerBadge)
    // 2) Graphic Card in middle
    // 3) English & Arabic Body + Takeaways below Graphic Card
    const topStart = Math.max(136, headerSafeFloorY + (isCompactAspect ? 16 : 24));
    let gapHeadlineToCard = isCompactAspect ? 18 : 28;
    let gapCardToBody = isCompactAspect ? 20 : 30;

    // Auto-scale graphicCard in headline-first mode if vertical stack exceeds safeFooterCeilingY
    if (!gHidden && !freeMove) {
      const headlinesH = measured.effEnTitleH + measured.gapTitles + measured.effArTitleH;
      const bodiesH = measured.effEnBodyH + measured.gapBodies + measured.effArBodyH;
      const neededNoCard = topStart + headlinesH + gapHeadlineToCard + gapCardToBody + bodiesH + takeawayClearance;
      const maxCardSpace = spec.safeFooterCeilingY - neededNoCard;
      if (cardH * gScale > maxCardSpace && cardH > 0) {
        gScale = Math.max(0.42, Number((Math.max(130, maxCardSpace) / cardH).toFixed(3)));
        if (cardH * gScale > maxCardSpace) {
          gapHeadlineToCard = 12;
          gapCardToBody = 14;
        }
      }
    }

    const tDy = titleOverride?.dy || 0;
    const actualTitleTop = freeMove ? topStart + tDy : Math.max(headerSafeFloorY + 8, topStart + tDy);
    const actualTitleBottom = actualTitleTop + measured.enTitleHeight;
    if (measured.enTitle.lines.length > 0) {
      titleBlock = {
        lines: measured.enTitle.lines,
        fontSize: measured.enTitle.fontSize,
        lineHeight: measured.enTitle.lineHeight,
        top: actualTitleTop,
        bottom: actualTitleBottom,
        height: measured.enTitleHeight,
        firstBaselineY: actualTitleTop + measured.enTitle.fontSize * 0.82,
        dx: tDx,
        dy: tDy,
        scale: titleScale,
        opacity: titleOverride?.opacity ?? 1,
        align: tAlign,
        hidden: titleHidden,
      };
    }

    const prevTitleBottom = titleBlock && !titleHidden ? titleBlock.bottom : topStart;
    const arTDy = arTitleOverride?.dy || 0;
    const naturalArTitleTop = prevTitleBottom + (titleBlock && !titleHidden ? measured.gapTitles : 0);
    const actualArTitleTop = freeMove
      ? naturalArTitleTop + arTDy
      : Math.max(prevTitleBottom + measured.gapTitles, naturalArTitleTop + arTDy);
    const actualArTitleBottom = actualArTitleTop + measured.arTitleHeight;
    if (measured.arTitle.lines.length > 0) {
      arabicTitleBlock = {
        lines: measured.arTitle.lines,
        fontSize: measured.arTitle.fontSize,
        lineHeight: measured.arTitle.lineHeight,
        top: actualArTitleTop,
        bottom: actualArTitleBottom,
        height: measured.arTitleHeight,
        firstBaselineY: actualArTitleTop + measured.arTitle.fontSize * 0.82,
        dx: arTDx,
        dy: arTDy,
        scale: arTitleScale,
        opacity: arTitleOverride?.opacity ?? 1,
        align: arTAlign,
        hidden: arTitleHidden,
      };
    }

    const headlinesBottom =
      arabicTitleBlock && !arTitleHidden
        ? arabicTitleBlock.bottom
        : titleBlock && !titleHidden
        ? titleBlock.bottom
        : topStart;

    const scaledCardH = cardH * gScale;
    const minCardTop = headlinesBottom + gapHeadlineToCard;
    const desiredCardTop = freeMove ? minCardTop + gDy : Math.max(minCardTop, minCardTop + gDy);
    const cardCenterY = desiredCardTop + scaledCardH / 2;
    const unscaledCardY = cardCenterY - cardH / 2;
    const effectiveTop = cardCenterY - scaledCardH / 2;
    const effectiveBottom = cardCenterY + scaledCardH / 2;

    graphicCard = {
      x: cardX + gDx,
      y: unscaledCardY,
      width: cardW,
      height: cardH,
      effectiveTop,
      effectiveBottom,
      dx: gDx,
      dy: gDy,
      scale: gScale,
      opacity: gOpacity,
      hidden: gHidden,
    };

    const postCardAnchor = gHidden ? headlinesBottom + minGapTitleToBody : effectiveBottom + gapCardToBody;
    const bDy = bodyOverride?.dy || 0;
    const actualBodyTop = freeMove ? postCardAnchor + bDy : Math.max(postCardAnchor, postCardAnchor + bDy);
    const actualBodyBottom = actualBodyTop + measured.enBodyHeight;

    if (measured.enBody.lines.length > 0) {
      bodyBlock = {
        lines: measured.enBody.lines,
        fontSize: measured.enBody.fontSize,
        lineHeight: measured.enBody.lineHeight,
        top: actualBodyTop,
        bottom: actualBodyBottom,
        height: measured.enBodyHeight,
        firstBaselineY: actualBodyTop + measured.enBody.fontSize * 0.82,
        dx: bDx,
        dy: bDy,
        scale: bodyScale,
        opacity: bodyOverride?.opacity ?? 1,
        align: bAlign,
        hidden: bodyHidden,
      };
    }

    const prevBodyBottom = bodyBlock && !bodyHidden ? bodyBlock.bottom : postCardAnchor;
    const arBDy = arBodyOverride?.dy || 0;
    const naturalArBodyTop = prevBodyBottom + (bodyBlock && !bodyHidden ? measured.gapBodies : 0);
    const actualArBodyTop = freeMove
      ? naturalArBodyTop + arBDy
      : Math.max(prevBodyBottom + (bodyBlock && !bodyHidden ? measured.gapBodies : 0), naturalArBodyTop + arBDy);
    const actualArBodyBottom = actualArBodyTop + measured.arBodyHeight;

    if (measured.arBody.lines.length > 0) {
      arabicBodyBlock = {
        lines: measured.arBody.lines,
        fontSize: measured.arBody.fontSize,
        lineHeight: measured.arBody.lineHeight,
        top: actualArBodyTop,
        bottom: actualArBodyBottom,
        height: measured.arBodyHeight,
        firstBaselineY: actualArBodyTop + measured.arBody.fontSize * 0.82,
        dx: arBDx,
        dy: arBDy,
        scale: arBodyScale,
        opacity: arBodyOverride?.opacity ?? 1,
        align: arBAlign,
        hidden: arBodyHidden,
      };
    }
  } else {
    // Standard / Visual-Hero / Split-Balanced / Compact-Editorial order:
    // Graphic Card at top, followed by Title -> Arabic Title -> Body -> Arabic Body -> Takeaways
    const cy = defaultCardY + cardH / 2;
    const effectiveTop = cy - (cardH / 2) * gScale + gDy;
    const effectiveBottom = cy + (cardH / 2) * gScale + gDy;

    graphicCard = {
      x: cardX + gDx,
      y: defaultCardY + gDy,
      width: cardW,
      height: cardH,
      effectiveTop,
      effectiveBottom,
      dx: gDx,
      dy: gDy,
      scale: gScale,
      opacity: gOpacity,
      hidden: gHidden,
    };

    const textCeilingY = gHidden
      ? headerSafeFloorY + 20
      : Math.max(defaultCardY + cardH * Math.min(1, gScale), effectiveBottom);

    const remainingCushion = Math.max(0, spec.safeFooterCeilingY - textCeilingY - gapGraphicToTitle - takeawayClearance - measured.totalStackHeight);
    const naturalTopCushion = Math.min(Math.max(remainingCushion * 0.24, gapGraphicToTitle), 88);
    const baseTitleTop = textCeilingY + naturalTopCushion;

    // Title Block
    const tDy = titleOverride?.dy || 0;
    const actualTitleTop = freeMove
      ? baseTitleTop + tDy
      : Math.max(textCeilingY + gapGraphicToTitle, baseTitleTop + tDy);
    const titleFirstBaselineY = actualTitleTop + measured.enTitle.fontSize * 0.82;
    const actualTitleBottom = actualTitleTop + measured.enTitleHeight;

    if (measured.enTitle.lines.length > 0) {
      titleBlock = {
        lines: measured.enTitle.lines,
        fontSize: measured.enTitle.fontSize,
        lineHeight: measured.enTitle.lineHeight,
        top: actualTitleTop,
        bottom: actualTitleBottom,
        height: measured.enTitleHeight,
        firstBaselineY: titleFirstBaselineY,
        dx: tDx,
        dy: tDy,
        scale: titleScale,
        opacity: titleOverride?.opacity ?? 1,
        align: tAlign,
        hidden: titleHidden,
      };
    }

    // Arabic Title Block
    const arTDy = arTitleOverride?.dy || 0;
    const naturalPrevTitleBottom = baseTitleTop + measured.effEnTitleH;
    const cascadePrevTitleBottom = titleBlock && !titleHidden ? titleBlock.bottom : textCeilingY;
    const naturalArabicTop = (freeMove ? naturalPrevTitleBottom : cascadePrevTitleBottom) + measured.gapTitles;
    const actualArabicTop = freeMove
      ? naturalArabicTop + arTDy
      : Math.max(cascadePrevTitleBottom + measured.gapTitles, naturalArabicTop + arTDy);
    const arabicFirstBaselineY = actualArabicTop + measured.arTitle.fontSize * 0.82;
    const actualArabicBottom = actualArabicTop + measured.arTitleHeight;

    if (measured.arTitle.lines.length > 0) {
      arabicTitleBlock = {
        lines: measured.arTitle.lines,
        fontSize: measured.arTitle.fontSize,
        lineHeight: measured.arTitle.lineHeight,
        top: actualArabicTop,
        bottom: actualArabicBottom,
        height: measured.arTitleHeight,
        firstBaselineY: arabicFirstBaselineY,
        dx: arTDx,
        dy: arTDy,
        scale: arTitleScale,
        opacity: arTitleOverride?.opacity ?? 1,
        align: arTAlign,
        hidden: arTitleHidden,
      };
    }

    // English Body Block
    const bDy = bodyOverride?.dy || 0;
    const naturalPrevHeadlineBottom = naturalPrevTitleBottom + measured.gapTitles + measured.effArTitleH;
    const cascadePrevHeadlineBottom =
      arabicTitleBlock && !arTitleHidden
        ? arabicTitleBlock.bottom
        : titleBlock && !titleHidden
        ? titleBlock.bottom
        : textCeilingY;
    const naturalBodyTop =
      (freeMove ? naturalPrevHeadlineBottom : cascadePrevHeadlineBottom) + measured.gapTitlesToBody;
    const actualBodyTop = freeMove
      ? naturalBodyTop + bDy
      : Math.max(cascadePrevHeadlineBottom + measured.gapTitlesToBody, naturalBodyTop + bDy);
    const bodyFirstBaselineY = actualBodyTop + measured.enBody.fontSize * 0.82;
    const actualBodyBottom = actualBodyTop + measured.enBodyHeight;

    if (measured.enBody.lines.length > 0) {
      bodyBlock = {
        lines: measured.enBody.lines,
        fontSize: measured.enBody.fontSize,
        lineHeight: measured.enBody.lineHeight,
        top: actualBodyTop,
        bottom: actualBodyBottom,
        height: measured.enBodyHeight,
        firstBaselineY: bodyFirstBaselineY,
        dx: bDx,
        dy: bDy,
        scale: bodyScale,
        opacity: bodyOverride?.opacity ?? 1,
        align: bAlign,
        hidden: bodyHidden,
      };
    }

    // Arabic Body Block
    const arBDy = arBodyOverride?.dy || 0;
    const naturalPrevBodyBottom = naturalPrevHeadlineBottom + measured.gapTitlesToBody + measured.effEnBodyH;
    const cascadePrevBodyBottom = bodyBlock && !bodyHidden ? bodyBlock.bottom : cascadePrevHeadlineBottom;
    const naturalArBodyTop = (freeMove ? naturalPrevBodyBottom : cascadePrevBodyBottom) + measured.gapBodies;
    const actualArBodyTop = freeMove
      ? naturalArBodyTop + arBDy
      : Math.max(cascadePrevBodyBottom + measured.gapBodies, naturalArBodyTop + arBDy);
    const arBodyFirstBaselineY = actualArBodyTop + measured.arBody.fontSize * 0.82;
    const actualArBodyBottom = actualArBodyTop + measured.arBodyHeight;

    if (measured.arBody.lines.length > 0) {
      arabicBodyBlock = {
        lines: measured.arBody.lines,
        fontSize: measured.arBody.fontSize,
        lineHeight: measured.arBody.lineHeight,
        top: actualArBodyTop,
        bottom: actualArBodyBottom,
        height: measured.arBodyHeight,
        firstBaselineY: arBodyFirstBaselineY,
        dx: arBDx,
        dy: arBDy,
        scale: arBodyScale,
        opacity: arBodyOverride?.opacity ?? 1,
        align: arBAlign,
        hidden: arBodyHidden,
      };
    }
  }

  // 5b. Takeaways Block
  if (hasTakeaways) {
    const prevBottom =
      (arabicBodyBlock && !arBodyHidden ? arabicBodyBlock.bottom : 0) ||
      (bodyBlock && !bodyHidden ? bodyBlock.bottom : 0) ||
      (arabicTitleBlock && !arTitleHidden ? arabicTitleBlock.bottom : 0) ||
      (titleBlock && !titleHidden ? titleBlock.bottom : 0) ||
      graphicCard.effectiveBottom;
    const scaledWidth = Math.round(spec.safeContentWidth * takeawaysScale);
    const baseTakeawayLeft = spec.safeTextCenterX - scaledWidth / 2;
    const tDx = clampBoxDx(baseTakeawayLeft, scaledWidth, takeawaysOverride?.dx || 0);
    const tDy = takeawaysOverride?.dy || 0;
    const naturalTop = prevBottom + minGapBodies;
    const actualTop = freeMove ? naturalTop + tDy : Math.max(prevBottom + minGapBodies, naturalTop + tDy);
    const centeredX = baseTakeawayLeft + tDx;
    takeawaysBlock = {
      x: centeredX,
      y: actualTop,
      width: scaledWidth,
      height: takeawaysTotalH,
      top: actualTop,
      bottom: actualTop + takeawaysTotalH,
      dx: tDx,
      dy: tDy,
      scale: takeawaysScale,
      opacity: takeawaysOverride?.opacity ?? 1,
      hidden: takeawaysHidden,
    };
  }

  // 6. Universal Safe-Zone Vertical Enforcement Pass
  const shiftTextBlock = (block: TextBlockLayout | undefined, deltaY: number) => {
    if (!block || deltaY === 0) return;
    block.top += deltaY;
    block.bottom += deltaY;
    block.firstBaselineY += deltaY;
  };

  if (freeMove) {
    // In Free-Move mode, keep independent layer positioning while clamping each element inside [headerSafeFloorY, safeFooterCeilingY]
    if (!graphicCard.hidden) {
      if (graphicCard.effectiveTop < headerSafeFloorY) {
        const d = headerSafeFloorY - graphicCard.effectiveTop;
        graphicCard.y += d;
        graphicCard.effectiveTop += d;
        graphicCard.effectiveBottom += d;
      }
      if (graphicCard.effectiveBottom > spec.safeFooterCeilingY) {
        const d = graphicCard.effectiveBottom - spec.safeFooterCeilingY;
        graphicCard.y -= d;
        graphicCard.effectiveTop -= d;
        graphicCard.effectiveBottom -= d;
      }
    }
    for (const block of [titleBlock, arabicTitleBlock, bodyBlock, arabicBodyBlock]) {
      if (!block || block.hidden) continue;
      if (block.top < headerSafeFloorY) {
        shiftTextBlock(block, headerSafeFloorY - block.top);
      }
      if (block.bottom > spec.safeFooterCeilingY) {
        shiftTextBlock(block, -(block.bottom - spec.safeFooterCeilingY));
      }
    }
    if (takeawaysBlock && !takeawaysBlock.hidden) {
      if (takeawaysBlock.top < headerSafeFloorY) {
        const d = headerSafeFloorY - takeawaysBlock.top;
        takeawaysBlock.top += d;
        takeawaysBlock.bottom += d;
        takeawaysBlock.y += d;
      }
      if (takeawaysBlock.bottom > spec.safeFooterCeilingY) {
        const d = takeawaysBlock.bottom - spec.safeFooterCeilingY;
        takeawaysBlock.top -= d;
        takeawaysBlock.bottom -= d;
        takeawaysBlock.y -= d;
      }
    }
  } else if (compositionPreset === 'headline-first') {
    // Headline-first ceiling compression pass
    const getLowestHeadlineFirstY = () =>
      (takeawaysBlock && !takeawaysHidden ? takeawaysBlock.bottom : 0) ||
      (arabicBodyBlock && !arBodyHidden ? arabicBodyBlock.bottom : 0) ||
      (bodyBlock && !bodyHidden ? bodyBlock.bottom : 0) ||
      (!graphicCard.hidden ? graphicCard.effectiveBottom : 0) ||
      (arabicTitleBlock && !arTitleHidden ? arabicTitleBlock.bottom : 0) ||
      (titleBlock && !titleHidden ? titleBlock.bottom : 0) ||
      headerSafeFloorY;

    let overflow = getLowestHeadlineFirstY() - spec.safeFooterCeilingY;
    if (overflow > 0 && titleBlock) {
      const topSlack = Math.max(0, titleBlock.top - (headerSafeFloorY + 8));
      const shift = Math.min(overflow, topSlack);
      if (shift > 0) {
        shiftTextBlock(titleBlock, -shift);
        shiftTextBlock(arabicTitleBlock, -shift);
        graphicCard.y -= shift;
        graphicCard.effectiveTop -= shift;
        graphicCard.effectiveBottom -= shift;
        shiftTextBlock(bodyBlock, -shift);
        shiftTextBlock(arabicBodyBlock, -shift);
        if (takeawaysBlock) {
          takeawaysBlock.top -= shift;
          takeawaysBlock.bottom -= shift;
          takeawaysBlock.y -= shift;
        }
        overflow -= shift;
      }
    }
    if (overflow > 0) {
      // Tighten excess positive dy offsets from top to bottom while preserving minimum gaps
      const minArTitleTop =
        titleBlock && !titleHidden ? titleBlock.bottom + measured.gapTitles : headerSafeFloorY + 8;
      if (arabicTitleBlock && !arTitleHidden && arabicTitleBlock.top > minArTitleTop) {
        const shift = Math.min(overflow, arabicTitleBlock.top - minArTitleTop);
        shiftTextBlock(arabicTitleBlock, -shift);
        graphicCard.y -= shift;
        graphicCard.effectiveTop -= shift;
        graphicCard.effectiveBottom -= shift;
        shiftTextBlock(bodyBlock, -shift);
        shiftTextBlock(arabicBodyBlock, -shift);
        if (takeawaysBlock) {
          takeawaysBlock.top -= shift;
          takeawaysBlock.bottom -= shift;
          takeawaysBlock.y -= shift;
        }
        overflow -= shift;
      }

      const headlinesBottom =
        arabicTitleBlock && !arTitleHidden
          ? arabicTitleBlock.bottom
          : titleBlock && !titleHidden
          ? titleBlock.bottom
          : headerSafeFloorY + 8;
      const minCardTop = headlinesBottom + 14;
      if (overflow > 0 && !graphicCard.hidden && graphicCard.effectiveTop > minCardTop) {
        const shift = Math.min(overflow, graphicCard.effectiveTop - minCardTop);
        graphicCard.y -= shift;
        graphicCard.effectiveTop -= shift;
        graphicCard.effectiveBottom -= shift;
        shiftTextBlock(bodyBlock, -shift);
        shiftTextBlock(arabicBodyBlock, -shift);
        if (takeawaysBlock) {
          takeawaysBlock.top -= shift;
          takeawaysBlock.bottom -= shift;
          takeawaysBlock.y -= shift;
        }
        overflow -= shift;
      }
      const postCardMin = graphicCard.hidden ? headlinesBottom + minGapTitleToBody : graphicCard.effectiveBottom + 16;
      if (overflow > 0 && bodyBlock && !bodyHidden && bodyBlock.top > postCardMin) {
        const shift = Math.min(overflow, bodyBlock.top - postCardMin);
        shiftTextBlock(bodyBlock, -shift);
        shiftTextBlock(arabicBodyBlock, -shift);
        if (takeawaysBlock) {
          takeawaysBlock.top -= shift;
          takeawaysBlock.bottom -= shift;
          takeawaysBlock.y -= shift;
        }
        overflow -= shift;
      }
      const prevBodyBtm = bodyBlock && !bodyHidden ? bodyBlock.bottom + measured.gapBodies : postCardMin;
      if (overflow > 0 && arabicBodyBlock && !arBodyHidden && arabicBodyBlock.top > prevBodyBtm) {
        const shift = Math.min(overflow, arabicBodyBlock.top - prevBodyBtm);
        shiftTextBlock(arabicBodyBlock, -shift);
        if (takeawaysBlock) {
          takeawaysBlock.top -= shift;
          takeawaysBlock.bottom -= shift;
          takeawaysBlock.y -= shift;
        }
        overflow -= shift;
      }
      const prevTakeawayAnchor =
        (arabicBodyBlock && !arBodyHidden ? arabicBodyBlock.bottom : 0) ||
        (bodyBlock && !bodyHidden ? bodyBlock.bottom : 0) ||
        graphicCard.effectiveBottom;
      if (overflow > 0 && takeawaysBlock && !takeawaysHidden && takeawaysBlock.top > prevTakeawayAnchor + minGapBodies) {
        const shift = Math.min(overflow, takeawaysBlock.top - (prevTakeawayAnchor + minGapBodies));
        takeawaysBlock.top -= shift;
        takeawaysBlock.bottom -= shift;
        takeawaysBlock.y -= shift;
      }
    }
  } else {
    // Standard / Visual-Hero / Split-Balanced / Compact-Editorial ceiling compression pass
    const textCeilingY = gHidden
      ? headerSafeFloorY + 20
      : graphicCard.effectiveBottom;
    const getStackLowestY = () =>
      (takeawaysBlock && !takeawaysHidden ? takeawaysBlock.bottom : 0) ||
      (arabicBodyBlock && !arBodyHidden ? arabicBodyBlock.bottom : 0) ||
      (bodyBlock && !bodyHidden ? bodyBlock.bottom : 0) ||
      (arabicTitleBlock && !arTitleHidden ? arabicTitleBlock.bottom : 0) ||
      (titleBlock && !titleHidden ? titleBlock.bottom : 0) ||
      textCeilingY;

    let footerOverflow = getStackLowestY() - spec.safeFooterCeilingY;

    // Step 6a: Shift entire text stack up into any cushion above titleBlock
    if (footerOverflow > 0 && titleBlock) {
      const maxUpwardShift = Math.max(0, titleBlock.top - (textCeilingY + gapGraphicToTitle));
      const shift = Math.min(footerOverflow, maxUpwardShift);
      if (shift > 0) {
        shiftTextBlock(titleBlock, -shift);
        shiftTextBlock(arabicTitleBlock, -shift);
        shiftTextBlock(bodyBlock, -shift);
        shiftTextBlock(arabicBodyBlock, -shift);
        if (takeawaysBlock) {
          takeawaysBlock.top -= shift;
          takeawaysBlock.bottom -= shift;
          takeawaysBlock.y -= shift;
        }
        footerOverflow -= shift;
      }
    }

    // Step 6b: Compress any excess positive dy gaps between stacked blocks from top to bottom
    if (footerOverflow > 0) {
      const minArTitleTop =
        (titleBlock && !titleHidden ? titleBlock.bottom + measured.gapTitles : textCeilingY + gapGraphicToTitle);
      if (arabicTitleBlock && !arTitleHidden && arabicTitleBlock.top > minArTitleTop) {
        const shift = Math.min(footerOverflow, arabicTitleBlock.top - minArTitleTop);
        shiftTextBlock(arabicTitleBlock, -shift);
        shiftTextBlock(bodyBlock, -shift);
        shiftTextBlock(arabicBodyBlock, -shift);
        if (takeawaysBlock) {
          takeawaysBlock.top -= shift;
          takeawaysBlock.bottom -= shift;
          takeawaysBlock.y -= shift;
        }
        footerOverflow -= shift;
      }

      const minBodyTop =
        (arabicTitleBlock && !arTitleHidden
          ? arabicTitleBlock.bottom + measured.gapTitlesToBody
          : titleBlock && !titleHidden
          ? titleBlock.bottom + measured.gapTitlesToBody
          : textCeilingY + gapGraphicToTitle);
      if (footerOverflow > 0 && bodyBlock && !bodyHidden && bodyBlock.top > minBodyTop) {
        const shift = Math.min(footerOverflow, bodyBlock.top - minBodyTop);
        shiftTextBlock(bodyBlock, -shift);
        shiftTextBlock(arabicBodyBlock, -shift);
        if (takeawaysBlock) {
          takeawaysBlock.top -= shift;
          takeawaysBlock.bottom -= shift;
          takeawaysBlock.y -= shift;
        }
        footerOverflow -= shift;
      }

      const minArBodyTop =
        (bodyBlock && !bodyHidden ? bodyBlock.bottom + measured.gapBodies : minBodyTop);
      if (footerOverflow > 0 && arabicBodyBlock && !arBodyHidden && arabicBodyBlock.top > minArBodyTop) {
        const shift = Math.min(footerOverflow, arabicBodyBlock.top - minArBodyTop);
        shiftTextBlock(arabicBodyBlock, -shift);
        if (takeawaysBlock) {
          takeawaysBlock.top -= shift;
          takeawaysBlock.bottom -= shift;
          takeawaysBlock.y -= shift;
        }
        footerOverflow -= shift;
      }

      const minTakeawaysTop =
        ((arabicBodyBlock && !arBodyHidden ? arabicBodyBlock.bottom : 0) ||
          (bodyBlock && !bodyHidden ? bodyBlock.bottom : 0) ||
          (arabicTitleBlock && !arTitleHidden ? arabicTitleBlock.bottom : 0) ||
          (titleBlock && !titleHidden ? titleBlock.bottom : 0) ||
          textCeilingY) + minGapBodies;
      if (footerOverflow > 0 && takeawaysBlock && !takeawaysHidden && takeawaysBlock.top > minTakeawaysTop) {
        const shift = Math.min(footerOverflow, takeawaysBlock.top - minTakeawaysTop);
        takeawaysBlock.top -= shift;
        takeawaysBlock.bottom -= shift;
        takeawaysBlock.y -= shift;
      }
    }
  }

  // Final Unconditional Safe-Zone Boundary Guard across all modes
  if (!graphicCard.hidden) {
    const maxSafeCardH = Math.max(120, spec.safeFooterCeilingY - headerSafeFloorY);
    if (graphicCard.effectiveBottom - graphicCard.effectiveTop > maxSafeCardH && graphicCard.height > 0) {
      const clampedScale = Number((maxSafeCardH / graphicCard.height).toFixed(3));
      const cCenter = (graphicCard.effectiveTop + graphicCard.effectiveBottom) / 2;
      graphicCard.scale = clampedScale;
      graphicCard.effectiveTop = cCenter - (graphicCard.height * clampedScale) / 2;
      graphicCard.effectiveBottom = cCenter + (graphicCard.height * clampedScale) / 2;
    }
    if (graphicCard.effectiveTop < headerSafeFloorY) {
      const d = headerSafeFloorY - graphicCard.effectiveTop;
      graphicCard.y += d;
      graphicCard.effectiveTop += d;
      graphicCard.effectiveBottom += d;
    }
    if (graphicCard.effectiveBottom > spec.safeFooterCeilingY) {
      const d = graphicCard.effectiveBottom - spec.safeFooterCeilingY;
      graphicCard.y -= d;
      graphicCard.effectiveTop -= d;
      graphicCard.effectiveBottom -= d;
    }
  }
  for (const block of [titleBlock, arabicTitleBlock, bodyBlock, arabicBodyBlock]) {
    if (!block || block.hidden) continue;
    if (block.top < headerSafeFloorY) {
      shiftTextBlock(block, headerSafeFloorY - block.top);
    }
    if (block.bottom > spec.safeFooterCeilingY) {
      shiftTextBlock(block, -(block.bottom - spec.safeFooterCeilingY));
    }
  }
  if (takeawaysBlock && !takeawaysBlock.hidden) {
    if (takeawaysBlock.top < headerSafeFloorY) {
      const d = headerSafeFloorY - takeawaysBlock.top;
      takeawaysBlock.top += d;
      takeawaysBlock.bottom += d;
      takeawaysBlock.y += d;
    }
    if (takeawaysBlock.bottom > spec.safeFooterCeilingY) {
      const d = takeawaysBlock.bottom - spec.safeFooterCeilingY;
      takeawaysBlock.top -= d;
      takeawaysBlock.bottom -= d;
      takeawaysBlock.y -= d;
    }
  }

  return storeComputedLayout(cacheKey, {
    slideType: slide.type,
    dimensionPreset: spec.id,
    compositionPreset,
    freeMoveLayout: freeMove,
    canvasWidth: spec.width,
    canvasHeight: spec.height,
    headerBadge,
    graphicCard,
    titleBlock,
    arabicTitleBlock,
    bodyBlock,
    arabicBodyBlock,
    takeawaysBlock,
    hasCollisionWarning: false,
  });
}

/**
 * CTA Slide Layout Awareness Handler
 */
function computeCtaSlideLayout(
  slide: SlideData,
  headerBadge: ComputedSlideLayout['headerBadge'],
  ctx: CanvasRenderingContext2D | null,
  overrides: Partial<Record<GraphicalElementId, ElementLayoutOverride>>,
  spec: CanvasDimensionSpec,
  compositionPreset: SlideCompositionPreset,
  freeMove: boolean
): ComputedSlideLayout {
  const headerSafeFloorY = headerBadge.hidden ? spec.headerY : headerBadge.y + headerBadge.height;

  const clampBoxDx = (baseLeft: number, width: number, desiredDx: number): number => {
    if (width >= spec.safeContentWidth) {
      return Math.round(spec.safeTextCenterX - width / 2 - baseLeft);
    }
    const minDx = spec.safeMarginLeft - baseLeft;
    const maxDx = spec.safeMarginRight - (baseLeft + width);
    return Math.round(Math.max(minDx, Math.min(maxDx, desiredDx)));
  };

  const clampTextDx = (boxWidth: number, desiredDx: number, align: TextAlignment = 'center'): number => {
    const effW = Math.min(boxWidth, spec.safeContentWidth);
    if (align === 'left') {
      const maxDx = Math.max(0, spec.safeContentWidth - effW);
      return Math.round(Math.max(0, Math.min(maxDx, desiredDx)));
    }
    if (align === 'right') {
      const minDx = -Math.max(0, spec.safeContentWidth - effW);
      return Math.round(Math.max(minDx, Math.min(0, desiredDx)));
    }
    const minDx = spec.safeMarginLeft - (spec.safeTextCenterX - effW / 2);
    const maxDx = spec.safeMarginRight - (spec.safeTextCenterX + effW / 2);
    const lo = Math.min(minDx, maxDx);
    const hi = Math.max(minDx, maxDx);
    return Math.round(Math.max(lo, Math.min(hi, desiredDx)));
  };

  const gOverride = overrides.graphicCard;
  let gDy = gOverride?.dy || 0;
  let gScale = gOverride?.scale ?? 1;
  const gOpacity = gOverride?.opacity ?? 1;
  const gHidden = Boolean(gOverride?.hidden);

  const { cardX, cardY: baseCardY, cardW, cardH: baseCardH } = getArchetypeGraphicTransform(spec, 'cta');
  const gDx = clampBoxDx(cardX + (cardW - cardW * gScale) / 2, cardW * gScale, gOverride?.dx || 0);

  const rawEnTitle = (slide.enTitle || '').trim();
  const rawArTitle = (slide.arTitle || '').trim();

  const titleOverride = overrides.titleBlock;
  const arTitleOverride = overrides.arabicTitleBlock;
  const tScale = titleOverride?.scale ?? 1;
  const arTScale = arTitleOverride?.scale ?? 1;

  const ctaFontScale = spec.height < 1920 ? Math.max(0.76, spec.graphicScale + 0.08) : 1;
  let enFontSize = Math.round(56 * ctaFontScale * tScale);
  let enLineHeight = enFontSize * 1.2;
  let enTitleH = Math.round(68 * ctaFontScale * tScale);
  let enTitleLines = rawEnTitle ? [rawEnTitle] : [];

  let arFontSize = Math.round(50 * ctaFontScale * arTScale);
  let arLineHeight = arFontSize * 1.35;
  let arTitleH = Math.round(74 * ctaFontScale * arTScale);
  let arTitleLines = rawArTitle ? [rawArTitle] : [];

  if (ctx) {
    if (rawEnTitle) {
      const enFit = fitTextInBox(ctx, rawEnTitle, spec.safeTextWidthTitle, enFontSize, FONT_TITLE_EN, '800', {
        maxLines: tScale > 1.15 ? 3 : 2,
        minFontSize: Math.round(28 * Math.min(1, tScale)),
        lineHeightFactor: 1.2,
      });
      enTitleLines = enFit.lines;
      enFontSize = enFit.fontSize;
      enLineHeight = enFit.lineHeight;
      enTitleH = enFit.lines.length * enFit.lineHeight;
    }
    if (rawArTitle) {
      const arFit = fitTextInBox(ctx, rawArTitle, spec.safeTextWidthTitle, arFontSize, FONT_TITLE_AR, '800', {
        maxLines: arTScale > 1.15 ? 3 : 2,
        minFontSize: Math.round(26 * Math.min(1, arTScale)),
        lineHeightFactor: 1.35,
      });
      arTitleLines = arFit.lines;
      arFontSize = arFit.fontSize;
      arLineHeight = arFit.lineHeight;
      arTitleH = arFit.lines.length * arFit.lineHeight;
    }
  }

  // Attribution & CTA button dimensions (capped to safeContentWidth)
  const attrOverride = overrides.attributionCard;
  const attrScale = Math.min(1.15, attrOverride?.scale ?? 1);
  const cardH = Math.round(92 * Math.max(0.82, ctaFontScale) * attrScale);
  const cardWAttr = Math.min(spec.safeContentWidth, Math.round(Math.min(780, spec.safeContentWidth) * attrScale));

  const ctaOverride = overrides.ctaButton;
  const ctaScale = Math.min(1.2, ctaOverride?.scale ?? 1);
  const pillW = Math.min(spec.safeContentWidth, Math.round(640 * Math.max(0.84, ctaFontScale) * ctaScale));
  const pillH = Math.round(96 * Math.max(0.8, ctaFontScale) * ctaScale);

  const titleGap = Math.round(16 * ctaFontScale);
  const gapCardToTitle = Math.round(28 * ctaFontScale);
  const minReservedBelowGraphic =
    gapCardToTitle + enTitleH + titleGap + arTitleH + 16 + pillH + Math.round(36 * ctaFontScale) + cardH + 12;

  const cy = baseCardY + baseCardH / 2;
  if (!gHidden) {
    let rawTop = cy - (baseCardH / 2) * gScale + gDy;
    if (rawTop < headerSafeFloorY) {
      gDy += headerSafeFloorY - rawTop;
      rawTop = headerSafeFloorY;
    }
    const maxGraphicBottom = freeMove ? spec.safeFooterCeilingY : spec.safeFooterCeilingY - minReservedBelowGraphic;
    let rawBottom = cy + (baseCardH / 2) * gScale + gDy;
    if (rawBottom > maxGraphicBottom) {
      const upRoom = Math.max(0, rawTop - headerSafeFloorY);
      const shiftUp = Math.min(rawBottom - maxGraphicBottom, upRoom);
      gDy -= shiftUp;
      rawTop -= shiftUp;
      rawBottom -= shiftUp;
      if (rawBottom > maxGraphicBottom && baseCardH > 0) {
        const maxFitH = Math.max(120, maxGraphicBottom - headerSafeFloorY);
        gScale = Math.max(0.45, Number((maxFitH / baseCardH).toFixed(3)));
        gDy = headerSafeFloorY + (baseCardH * gScale) / 2 - cy;
      }
    }
  }

  const effectiveTop = cy - (baseCardH / 2) * gScale + gDy;
  const effectiveBottom = cy + (baseCardH / 2) * gScale + gDy;

  const graphicCard: GraphicCardLayout = {
    x: cardX + gDx,
    y: baseCardY + gDy,
    width: cardW,
    height: baseCardH,
    effectiveTop,
    effectiveBottom,
    dx: gDx,
    dy: gDy,
    scale: gScale,
    opacity: gOpacity,
    hidden: gHidden,
  };

  // Titles start below the graphic emblem (or move within safe bounds in freeMove mode):
  const tAlign: TextAlignment = titleOverride?.align || 'center';
  const arTAlign: TextAlignment = arTitleOverride?.align || 'center';
  const tDx = clampTextDx(spec.safeTextWidthTitle, titleOverride?.dx || 0, tAlign);
  const tDy = titleOverride?.dy || 0;
  const minTitleStart = gHidden ? headerSafeFloorY + 24 : effectiveBottom + gapCardToTitle;
  const maxTitleStart = spec.safeFooterCeilingY - (enTitleH + titleGap + arTitleH + 16 + pillH + 28 + cardH + 12);
  const rawTitleTop = freeMove
    ? minTitleStart + tDy
    : Math.max(minTitleStart, Math.min(maxTitleStart, baseCardY + baseCardH + Math.round(40 * ctaFontScale) + tDy));
  const actualTitleTop = Math.max(
    headerSafeFloorY,
    Math.min(spec.safeFooterCeilingY - enTitleH, rawTitleTop)
  );
  const titleFirstBaselineY = actualTitleTop + enFontSize * 0.82;
  const actualTitleBottom = actualTitleTop + enTitleH;

  const titleBlock: TextBlockLayout = {
    lines: enTitleLines,
    fontSize: enFontSize,
    lineHeight: enLineHeight,
    top: actualTitleTop,
    bottom: actualTitleBottom,
    height: enTitleH,
    firstBaselineY: titleFirstBaselineY,
    dx: tDx,
    dy: tDy,
    scale: tScale,
    opacity: titleOverride?.opacity ?? 1,
    align: tAlign,
    hidden: Boolean(titleOverride?.hidden),
  };

  const arTDx = clampTextDx(spec.safeTextWidthTitle, arTitleOverride?.dx || 0, arTAlign);
  const arTDy = arTitleOverride?.dy || 0;
  const maxArabicTop = spec.safeFooterCeilingY - (arTitleH + 16 + pillH + 28 + cardH + 12);
  const rawArabicTop = freeMove
    ? actualTitleBottom + titleGap + arTDy
    : Math.max(actualTitleBottom + titleGap, Math.min(maxArabicTop, actualTitleBottom + titleGap + arTDy));
  const actualArabicTop = Math.max(
    headerSafeFloorY,
    Math.min(spec.safeFooterCeilingY - arTitleH, rawArabicTop)
  );
  const arabicFirstBaselineY = actualArabicTop + arFontSize * 0.82;
  const actualArabicBottom = actualArabicTop + arTitleH;

  const arabicTitleBlock: TextBlockLayout = {
    lines: arTitleLines,
    fontSize: arFontSize,
    lineHeight: arLineHeight,
    top: actualArabicTop,
    bottom: actualArabicBottom,
    height: arTitleH,
    firstBaselineY: arabicFirstBaselineY,
    dx: arTDx,
    dy: arTDy,
    scale: arTScale,
    opacity: arTitleOverride?.opacity ?? 1,
    align: arTAlign,
    hidden: Boolean(arTitleOverride?.hidden),
  };

  // Attribution card anchored safely above spec.safeFooterCeilingY:
  const maxCardY = spec.safeFooterCeilingY - cardH - 12;
  const desiredCardY = maxCardY + (attrOverride?.dy || 0);
  const minGapAboveAttr = Math.round(130 * ctaFontScale);
  const baseAttrLeft = spec.safeTextCenterX - cardWAttr / 2;
  const clampedAttrDx = clampBoxDx(baseAttrLeft, cardWAttr, attrOverride?.dx || 0);
  const clampedAttrY = freeMove
    ? Math.max(headerSafeFloorY, Math.min(maxCardY, desiredCardY))
    : Math.min(Math.max(actualArabicBottom + minGapAboveAttr, desiredCardY), maxCardY);

  const attributionCard = {
    x: baseAttrLeft + clampedAttrDx,
    y: clampedAttrY,
    width: cardWAttr,
    height: cardH,
    dx: clampedAttrDx,
    dy: attrOverride?.dy || 0,
    scale: attrScale,
    opacity: attrOverride?.opacity ?? 1,
    hidden: Boolean(attrOverride?.hidden),
  };

  // CTA Pill Button in the remaining vertical pocket:
  const urlY = attributionCard.y - Math.round(36 * ctaFontScale);
  const availablePillGap = Math.max(48, urlY - actualArabicBottom - pillH);
  const naturalPillY = Math.min(
    Math.max(actualArabicBottom + availablePillGap * 0.42, actualArabicBottom + 18),
    urlY - pillH - 14
  );
  const basePillLeft = spec.safeTextCenterX - pillW / 2;
  const clampedCtaDx = clampBoxDx(basePillLeft, pillW, ctaOverride?.dx || 0);
  const actualPillY = freeMove
    ? Math.max(headerSafeFloorY, Math.min(spec.safeFooterCeilingY - pillH, naturalPillY + (ctaOverride?.dy || 0)))
    : Math.min(
        Math.max(actualArabicBottom + 16, naturalPillY + (ctaOverride?.dy || 0)),
        Math.max(actualArabicBottom + 16, urlY - pillH - 12)
      );

  const ctaButton = {
    x: basePillLeft + clampedCtaDx,
    y: actualPillY,
    width: pillW,
    height: pillH,
    dx: clampedCtaDx,
    dy: ctaOverride?.dy || 0,
    scale: ctaScale,
    opacity: ctaOverride?.opacity ?? 1,
    hidden: Boolean(ctaOverride?.hidden),
  };

  return {
    slideType: 'cta',
    dimensionPreset: spec.id,
    compositionPreset,
    freeMoveLayout: freeMove,
    canvasWidth: spec.width,
    canvasHeight: spec.height,
    headerBadge,
    graphicCard,
    titleBlock,
    arabicTitleBlock,
    ctaButton,
    attributionCard,
    hasCollisionWarning: false,
  };
}

/**
 * Layout-Aware Drag Clamping:
 * Enforces horizontal and vertical safe-zone boundary and collision limits during viewport dragging and nudging.
 */
export function clampElementDrag(
  elementId: GraphicalElementId,
  desiredDx: number,
  desiredDy: number,
  slide: SlideData,
  carousel?: CarouselData
): { dx: number; dy: number } {
  const spec = getCanvasDimensionSpec(carousel?.dimensionPreset);
  const ceilingY = spec.safeFooterCeilingY;

  // Compute base layout without the dragged element's override to find anchor points and safe horizontal margins
  const baseSlide: SlideData = {
    ...slide,
    layoutOverrides: {
      ...(slide.layoutOverrides || {}),
      [elementId]: {
        ...(slide.layoutOverrides?.[elementId] || {}),
        dx: 0,
        dy: 0,
      },
    },
  };

  const layout = computeSlideLayoutAwareness(baseSlide, carousel);
  const headerFloorY = layout.headerBadge.hidden
    ? spec.headerY
    : layout.headerBadge.y + layout.headerBadge.height;

  // Compute safe horizontal range [minDx, maxDx] so element stays inside [safeMarginLeft, safeMarginRight]
  let minDx = -(spec.safeTextCenterX - spec.safeMarginLeft);
  let maxDx = spec.safeMarginRight - spec.safeTextCenterX;

  if (elementId === 'headerBadge') {
    const leftLimit = spec.headerMarginLeft ?? spec.safeMarginLeft;
    const rightLimit = spec.headerMarginRight ?? spec.safeMarginRight;
    const w = layout.headerBadge.width * layout.headerBadge.scale;
    minDx = leftLimit - layout.headerBadge.x;
    maxDx = rightLimit - (layout.headerBadge.x + w);
  } else if (elementId === 'graphicCard' && layout.graphicCard) {
    const scaledW = layout.graphicCard.width * (layout.graphicCard.scale ?? 1);
    const leftEdge = layout.graphicCard.x + (layout.graphicCard.width - scaledW) / 2;
    minDx = Math.min(0, spec.safeMarginLeft - leftEdge);
    maxDx = Math.max(0, spec.safeMarginRight - (leftEdge + scaledW));
  } else if (
    elementId === 'titleBlock' ||
    elementId === 'arabicTitleBlock' ||
    elementId === 'bodyBlock' ||
    elementId === 'arabicBodyBlock'
  ) {
    const block = layout[elementId];
    const boxW =
      elementId === 'titleBlock' || elementId === 'arabicTitleBlock'
        ? spec.safeTextWidthTitle
        : spec.safeTextWidthBody;
    const align = block?.align || 'center';
    const effW = Math.min(boxW, spec.safeContentWidth);
    if (align === 'left') {
      minDx = 0;
      maxDx = Math.max(0, spec.safeContentWidth - effW);
    } else if (align === 'right') {
      minDx = -Math.max(0, spec.safeContentWidth - effW);
      maxDx = 0;
    } else {
      minDx = spec.safeMarginLeft - (spec.safeTextCenterX - effW / 2);
      maxDx = spec.safeMarginRight - (spec.safeTextCenterX + effW / 2);
    }
  } else if (elementId === 'takeawaysBlock' && layout.takeawaysBlock) {
    minDx = spec.safeMarginLeft - layout.takeawaysBlock.x;
    maxDx = spec.safeMarginRight - (layout.takeawaysBlock.x + layout.takeawaysBlock.width);
  } else if (elementId === 'ctaButton' && layout.ctaButton) {
    minDx = spec.safeMarginLeft - layout.ctaButton.x;
    maxDx = spec.safeMarginRight - (layout.ctaButton.x + layout.ctaButton.width);
  } else if (elementId === 'attributionCard' && layout.attributionCard) {
    minDx = spec.safeMarginLeft - layout.attributionCard.x;
    maxDx = spec.safeMarginRight - (layout.attributionCard.x + layout.attributionCard.width);
  }

  const clampedDx = Math.round(
    Math.max(Math.min(minDx, maxDx), Math.min(Math.max(minDx, maxDx), desiredDx))
  );

  // In Free Move mode or Headline-First preset, clamp vertical movement to the safe zone [headerFloorY, ceilingY]
  if (slide.freeMoveLayout || slide.compositionPreset === 'headline-first') {
    let freeMinDy = -600;
    let freeMaxDy = 600;
    if (elementId === 'graphicCard' && layout.graphicCard) {
      freeMinDy = Math.round(headerFloorY - layout.graphicCard.effectiveTop);
      freeMaxDy = Math.round(ceilingY - layout.graphicCard.effectiveBottom);
    } else if (
      elementId === 'titleBlock' ||
      elementId === 'arabicTitleBlock' ||
      elementId === 'bodyBlock' ||
      elementId === 'arabicBodyBlock'
    ) {
      const b = layout[elementId];
      if (b) {
        freeMinDy = Math.round(headerFloorY - b.top);
        freeMaxDy = Math.round(ceilingY - b.bottom);
      }
    } else if (elementId === 'takeawaysBlock' && layout.takeawaysBlock) {
      freeMinDy = Math.round(headerFloorY - layout.takeawaysBlock.top);
      freeMaxDy = Math.round(ceilingY - layout.takeawaysBlock.bottom);
    }
    const clampedFreeDy = Math.max(
      Math.min(freeMinDy, freeMaxDy),
      Math.min(Math.max(freeMinDy, freeMaxDy), desiredDy)
    );
    return { dx: clampedDx, dy: clampedFreeDy };
  }

  let minDy = -600;
  let maxDy = 600;

  if (elementId === 'headerBadge') {
    minDy = Math.max(-24, spec.headerY - 24 - layout.headerBadge.y);
    maxDy = 80;
  } else if (elementId === 'graphicCard' && layout.graphicCard) {
    minDy = Math.round(headerFloorY - layout.graphicCard.effectiveTop);
    maxDy = Math.min(480, ceilingY - Math.round(320 * spec.graphicScale) - layout.graphicCard.y);
  } else if (elementId === 'titleBlock' && layout.titleBlock && layout.graphicCard) {
    const minTop = layout.graphicCard.effectiveBottom + MIN_GAP_GRAPHIC_TO_TITLE;
    minDy = Math.round(minTop - layout.titleBlock.top);
    const followingH =
      (layout.arabicTitleBlock && !layout.arabicTitleBlock.hidden ? layout.arabicTitleBlock.height + MIN_GAP_TITLES : 0) +
      (layout.bodyBlock && !layout.bodyBlock.hidden ? layout.bodyBlock.height + MIN_GAP_TITLE_TO_BODY : 0) +
      (layout.arabicBodyBlock && !layout.arabicBodyBlock.hidden ? layout.arabicBodyBlock.height + MIN_GAP_BODIES : 0) +
      (layout.takeawaysBlock && !layout.takeawaysBlock.hidden ? layout.takeawaysBlock.height + MIN_GAP_BODIES : 0);
    maxDy = Math.round(Math.max(minDy, ceilingY - followingH - layout.titleBlock.bottom));
  } else if (elementId === 'arabicTitleBlock' && layout.arabicTitleBlock) {
    const minTop =
      (layout.titleBlock && !layout.titleBlock.hidden
        ? layout.titleBlock.bottom
        : layout.graphicCard && !layout.graphicCard.hidden
        ? layout.graphicCard.effectiveBottom
        : headerFloorY) + MIN_GAP_TITLES;
    minDy = Math.round(minTop - layout.arabicTitleBlock.top);
    const followingH =
      (layout.bodyBlock && !layout.bodyBlock.hidden ? layout.bodyBlock.height + MIN_GAP_TITLE_TO_BODY : 0) +
      (layout.arabicBodyBlock && !layout.arabicBodyBlock.hidden ? layout.arabicBodyBlock.height + MIN_GAP_BODIES : 0) +
      (layout.takeawaysBlock && !layout.takeawaysBlock.hidden ? layout.takeawaysBlock.height + MIN_GAP_BODIES : 0);
    maxDy = Math.round(Math.max(minDy, ceilingY - followingH - layout.arabicTitleBlock.bottom));
  } else if (elementId === 'bodyBlock' && layout.bodyBlock) {
    const minTop =
      (layout.arabicTitleBlock && !layout.arabicTitleBlock.hidden
        ? layout.arabicTitleBlock.bottom
        : layout.titleBlock && !layout.titleBlock.hidden
        ? layout.titleBlock.bottom
        : headerFloorY) + MIN_GAP_TITLE_TO_BODY;
    minDy = Math.round(minTop - layout.bodyBlock.top);
    const followingH =
      (layout.arabicBodyBlock && !layout.arabicBodyBlock.hidden ? layout.arabicBodyBlock.height + MIN_GAP_BODIES : 0) +
      (layout.takeawaysBlock && !layout.takeawaysBlock.hidden ? layout.takeawaysBlock.height + MIN_GAP_BODIES : 0);
    maxDy = Math.round(Math.max(minDy, ceilingY - followingH - layout.bodyBlock.bottom));
  } else if (elementId === 'arabicBodyBlock' && layout.arabicBodyBlock) {
    const minTop =
      (layout.bodyBlock && !layout.bodyBlock.hidden
        ? layout.bodyBlock.bottom
        : layout.arabicTitleBlock && !layout.arabicTitleBlock.hidden
        ? layout.arabicTitleBlock.bottom
        : headerFloorY) + MIN_GAP_BODIES;
    minDy = Math.round(minTop - layout.arabicBodyBlock.top);
    const followingH =
      layout.takeawaysBlock && !layout.takeawaysBlock.hidden ? layout.takeawaysBlock.height + MIN_GAP_BODIES : 0;
    maxDy = Math.round(Math.max(minDy, ceilingY - followingH - layout.arabicBodyBlock.bottom));
  } else if (elementId === 'takeawaysBlock' && layout.takeawaysBlock) {
    minDy = -160;
    maxDy = Math.round(Math.max(0, ceilingY - layout.takeawaysBlock.bottom));
  } else if (elementId === 'ctaButton' && layout.ctaButton) {
    minDy = Math.round(headerFloorY - layout.ctaButton.y);
    maxDy = Math.round(ceilingY - (layout.ctaButton.y + layout.ctaButton.height));
  } else if (elementId === 'attributionCard' && layout.attributionCard) {
    minDy = -220;
    maxDy = Math.round(ceilingY - (layout.attributionCard.y + layout.attributionCard.height));
  }

  const clampedDy = Math.max(minDy, Math.min(maxDy, desiredDy));
  return { dx: clampedDx, dy: clampedDy };
}

