import type { CarouselData, GraphicalElementId, SlideData, TextAlignment } from '../../types.ts';
import { getCanvasDimensionSpec } from './constants.ts';
import { computeSlideLayoutAwareness } from './layoutAwareness.ts';

export interface ElementBounds {
  id: GraphicalElementId;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  topPct: string;
  leftPct: string;
  widthPct: string;
  heightPct: string;
  scale?: number;
  align?: TextAlignment;
  hidden?: boolean;
}

/**
 * Computes exact pixel coordinates and percentage bounds
 * for all interactive elements on a slide across any active dimension preset,
 * powered by the non-overlapping Slide Layout Awareness Engine.
 */
export function computeSlideElementBounds(
  slide: SlideData,
  carousel?: CarouselData,
  slideIndex?: number
): Record<GraphicalElementId, ElementBounds> {
  const bounds: Partial<Record<GraphicalElementId, ElementBounds>> = {};
  const spec = getCanvasDimensionSpec(carousel?.dimensionPreset);
  const layout = computeSlideLayoutAwareness(slide, carousel, slideIndex);

  const toPct = (val: number, total: number) => `${((val / total) * 100).toFixed(2)}%`;

  const makeBound = (
    id: GraphicalElementId,
    label: string,
    x: number,
    y: number,
    width: number,
    height: number,
    extra?: { scale?: number; align?: TextAlignment; hidden?: boolean }
  ): ElementBounds => ({
    id,
    label,
    x,
    y,
    width,
    height,
    leftPct: toPct(x, spec.width),
    topPct: toPct(y, spec.height),
    widthPct: toPct(width, spec.width),
    heightPct: toPct(height, spec.height),
    ...extra,
  });

  // 1. Header Badge
  bounds.headerBadge = makeBound(
    'headerBadge',
    'Top MARROK Header',
    layout.headerBadge.x,
    layout.headerBadge.y,
    layout.headerBadge.width,
    layout.headerBadge.height,
    {
      scale: layout.headerBadge.scale,
      hidden: layout.headerBadge.hidden,
    }
  );

  // 2. Graphic Card (incorporates scale around card center)
  if (layout.graphicCard) {
    const cardLabel =
      slide.type === 'hub'
        ? 'Central Hub & Orbital Satellites'
        : slide.type === 'number'
        ? 'Big Number & Metric Badge'
        : slide.type === 'code'
        ? 'Code Window Terminal'
        : slide.type === 'compare'
        ? 'Comparison Columns'
        : slide.type === 'subjectPair'
        ? 'Subject Pair Migration Visual'
        : slide.type === 'metric'
        ? 'Metrics Grid Card'
        : slide.type === 'image'
        ? 'Architecture Image Canvas'
        : 'Technical Diagram Card';

    const gScale = layout.graphicCard.scale ?? 1;
    const scaledW = layout.graphicCard.width * gScale;
    const scaledH = layout.graphicCard.height * gScale;
    const scaledX = layout.graphicCard.x + (layout.graphicCard.width - scaledW) / 2;
    const scaledY = layout.graphicCard.effectiveTop;

    bounds.graphicCard = makeBound(
      'graphicCard',
      cardLabel,
      scaledX,
      scaledY,
      scaledW,
      scaledH,
      {
        scale: gScale,
        hidden: layout.graphicCard.hidden,
      }
    );
  }

  // 3. CTA Buttons / Attribution
  if (layout.ctaButton) {
    bounds.ctaButton = makeBound(
      'ctaButton',
      'CTA Pill Button',
      layout.ctaButton.x,
      layout.ctaButton.y,
      layout.ctaButton.width,
      layout.ctaButton.height,
      {
        scale: layout.ctaButton.scale,
        hidden: layout.ctaButton.hidden,
      }
    );
  }
  if (layout.attributionCard) {
    bounds.attributionCard = makeBound(
      'attributionCard',
      'Attribution & Creator Card',
      layout.attributionCard.x,
      layout.attributionCard.y,
      layout.attributionCard.width,
      layout.attributionCard.height,
      {
        scale: layout.attributionCard.scale,
        hidden: layout.attributionCard.hidden,
      }
    );
  }

  const resolveTextBoxX = (width: number, dx: number, align: TextAlignment = 'center') => {
    if (align === 'left') return spec.safeMarginLeft + dx;
    if (align === 'right') return spec.safeMarginRight - width + dx;
    return spec.safeTextCenterX - width / 2 + dx;
  };

  // 4. Content Text Blocks (heights already reflect per-element scale from layoutAwareness)
  if (layout.titleBlock) {
    bounds.titleBlock = makeBound(
      'titleBlock',
      'English Headline',
      resolveTextBoxX(spec.safeTextWidthTitle, layout.titleBlock.dx, layout.titleBlock.align),
      layout.titleBlock.top,
      spec.safeTextWidthTitle,
      layout.titleBlock.height,
      {
        scale: layout.titleBlock.scale,
        align: layout.titleBlock.align,
        hidden: layout.titleBlock.hidden,
      }
    );
  }

  if (layout.arabicTitleBlock) {
    bounds.arabicTitleBlock = makeBound(
      'arabicTitleBlock',
      'Arabic Headline',
      resolveTextBoxX(spec.safeTextWidthTitle, layout.arabicTitleBlock.dx, layout.arabicTitleBlock.align),
      layout.arabicTitleBlock.top,
      spec.safeTextWidthTitle,
      layout.arabicTitleBlock.height,
      {
        scale: layout.arabicTitleBlock.scale,
        align: layout.arabicTitleBlock.align,
        hidden: layout.arabicTitleBlock.hidden,
      }
    );
  }

  if (layout.bodyBlock) {
    bounds.bodyBlock = makeBound(
      'bodyBlock',
      'English Technical Details',
      resolveTextBoxX(spec.safeTextWidthBody, layout.bodyBlock.dx, layout.bodyBlock.align),
      layout.bodyBlock.top,
      spec.safeTextWidthBody,
      layout.bodyBlock.height,
      {
        scale: layout.bodyBlock.scale,
        align: layout.bodyBlock.align,
        hidden: layout.bodyBlock.hidden,
      }
    );
  }

  if (layout.arabicBodyBlock) {
    bounds.arabicBodyBlock = makeBound(
      'arabicBodyBlock',
      'Arabic Technical Details',
      resolveTextBoxX(spec.safeTextWidthBody, layout.arabicBodyBlock.dx, layout.arabicBodyBlock.align),
      layout.arabicBodyBlock.top,
      spec.safeTextWidthBody,
      layout.arabicBodyBlock.height,
      {
        scale: layout.arabicBodyBlock.scale,
        align: layout.arabicBodyBlock.align,
        hidden: layout.arabicBodyBlock.hidden,
      }
    );
  }

  if (layout.takeawaysBlock) {
    bounds.takeawaysBlock = makeBound(
      'takeawaysBlock',
      'Key Takeaways Bento List',
      layout.takeawaysBlock.x,
      layout.takeawaysBlock.y,
      layout.takeawaysBlock.width,
      layout.takeawaysBlock.height,
      {
        scale: layout.takeawaysBlock.scale,
        hidden: layout.takeawaysBlock.hidden,
      }
    );
  }

  return bounds as Record<GraphicalElementId, ElementBounds>;
}

/**
 * Accurately finds the graphical element clicked in canvas coordinates.
 */
export function findSlideElementAtPoint(
  canvasX: number,
  canvasY: number,
  boundsMap: Record<GraphicalElementId, ElementBounds>,
  _overrides?: Record<string, { dx?: number; dy?: number; scale?: number; hidden?: boolean }>
): GraphicalElementId | null {
  const pad = 14;

  // Priority order for hit testing: takeaways & text blocks first, then buttons, then graphic card, then header
  const priorityOrder: GraphicalElementId[] = [
    'ctaButton',
    'attributionCard',
    'takeawaysBlock',
    'arabicBodyBlock',
    'bodyBlock',
    'arabicTitleBlock',
    'titleBlock',
    'graphicCard',
    'headerBadge',
  ];

  for (const id of priorityOrder) {
    const bound = boundsMap[id];
    if (!bound || bound.hidden || _overrides?.[id]?.hidden) continue;

    // Bounds from computeSlideElementBounds already incorporate dx, dy, and scale
    const left = bound.x - pad;
    const right = bound.x + bound.width + pad;
    const top = bound.y - pad;
    const bottom = bound.y + bound.height + pad;

    if (canvasX >= left && canvasX <= right && canvasY >= top && canvasY <= bottom) {
      return id;
    }
  }

  return null;
}

