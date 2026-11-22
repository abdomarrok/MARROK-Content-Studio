import type {
  ElementLayoutOverride,
  GraphicalElementId,
  SlideCompositionPreset,
  SlideData,
  TextAlignment,
} from '../../../types.ts';
import {
  CanvasDimensionSpec,
  FONT_TITLE_AR,
  FONT_TITLE_EN,
  MIN_TITLE_FONT_SIZE,
  getArchetypeGraphicTransform,
} from '../constants.ts';
import { fitTextInBox } from '../textLayout.ts';
import type { ComputedSlideLayout, GraphicCardLayout, TextBlockLayout } from './types.ts';

/**
 * CTA Slide Layout Awareness Handler
 */
export function computeCtaSlideLayout(
  slide: SlideData,
  headerBadge: ComputedSlideLayout['headerBadge'],
  ctx: CanvasRenderingContext2D | null,
  overrides: Partial<Record<GraphicalElementId, ElementLayoutOverride>>,
  spec: CanvasDimensionSpec,
  _compositionPreset: SlideCompositionPreset,
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

  const ctaTitleMinFloor = Math.max(MIN_TITLE_FONT_SIZE, spec.minTitleFontSize ?? MIN_TITLE_FONT_SIZE);
  const ctaFontScale = spec.height < 1920 ? Math.max(0.76, spec.graphicScale + 0.08) : 1;
  let enFontSize = Math.max(ctaTitleMinFloor, Math.round(56 * ctaFontScale * tScale));
  let enLineHeight = enFontSize * 1.2;
  let enTitleH = Math.round(enFontSize * 1.22);
  let enTitleLines = rawEnTitle ? [rawEnTitle] : [];

  let arFontSize = Math.max(ctaTitleMinFloor, Math.round(50 * ctaFontScale * arTScale));
  let arLineHeight = arFontSize * 1.35;
  let arTitleH = Math.round(arFontSize * 1.48);
  let arTitleLines = rawArTitle ? [rawArTitle] : [];

  if (ctx) {
    if (rawEnTitle) {
      const enFit = fitTextInBox(ctx, rawEnTitle, spec.safeTextWidthTitle, enFontSize, FONT_TITLE_EN, '800', {
        maxLines: tScale > 1.15 ? 3 : 2,
        minFontSize: Math.max(ctaTitleMinFloor, Math.round(28 * Math.min(1, tScale))),
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
        minFontSize: Math.max(ctaTitleMinFloor, Math.round(26 * Math.min(1, arTScale))),
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
    compositionPreset: _compositionPreset,
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
