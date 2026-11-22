import type {
  CarouselData,
  GraphicalElementId,
  SlideData,
} from '../../../types.ts';
import { getCanvasDimensionSpec } from '../constants.ts';
import {
  MIN_GAP_BODIES,
  MIN_GAP_GRAPHIC_TO_TITLE,
  MIN_GAP_TITLES,
  MIN_GAP_TITLE_TO_BODY,
} from './constants.ts';
import { computeSlideLayoutAwareness } from './slideLayoutEngine.ts';

/**
 * Layout-Aware Drag Clamping:
 * Enforces horizontal and vertical safe-zone boundary and collision limits during viewport dragging and nudging.
 */
export function clampElementDrag(
  elementId: GraphicalElementId,
  desiredDx: number,
  desiredDy: number,
  slide: SlideData,
  carousel?: CarouselData,
  slideIndex?: number
): { dx: number; dy: number } {
  const spec = getCanvasDimensionSpec(carousel?.dimensionPreset);

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

  const layout = computeSlideLayoutAwareness(baseSlide, carousel, slideIndex);
  const ceilingY =
    layout.swipeCueBox && !layout.swipeCueBox.hidden
      ? layout.swipeCueBox.y - 14
      : spec.safeFooterCeilingY;
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
      (layout.arabicTitleBlock && !layout.arabicTitleBlock.hidden
        ? layout.arabicTitleBlock.height + MIN_GAP_TITLES
        : 0) +
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
    const anchorAbove =
      (layout.arabicBodyBlock && !layout.arabicBodyBlock.hidden
        ? layout.arabicBodyBlock.bottom
        : layout.bodyBlock && !layout.bodyBlock.hidden
        ? layout.bodyBlock.bottom
        : layout.arabicTitleBlock && !layout.arabicTitleBlock.hidden
        ? layout.arabicTitleBlock.bottom
        : layout.titleBlock && !layout.titleBlock.hidden
        ? layout.titleBlock.bottom
        : layout.graphicCard && !layout.graphicCard.hidden
        ? layout.graphicCard.effectiveBottom
        : headerFloorY) + MIN_GAP_BODIES;
    minDy = Math.round(Math.min(0, anchorAbove - layout.takeawaysBlock.top));
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
