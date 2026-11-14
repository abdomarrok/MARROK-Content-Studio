import { CarouselData, ThemePalette } from '../../types.ts';
import { drawMarrokVectorBadge } from '../icons.ts';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRID_SPACING,
  GRID_LINE_WIDTH,
  CanvasDimensionSpec,
  getCanvasDimensionSpec,
} from './constants.ts';

/**
 * Draw rounded rectangle helper with fallback for browsers without native ctx.roundRect
 */
export function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillColor?: string,
  strokeColor?: string,
  lineWidth?: number
) {
  ctx.save();
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
  }
  ctx.closePath();

  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor && lineWidth) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 1. Solid Base Background
 */
export function drawBaseBackground(
  ctx: CanvasRenderingContext2D,
  theme: ThemePalette,
  spec?: CanvasDimensionSpec
) {
  const w = spec?.width ?? ctx.canvas?.width ?? CANVAS_WIDTH;
  const h = spec?.height ?? ctx.canvas?.height ?? CANVAS_HEIGHT;
  ctx.fillStyle = theme.baseBg;
  ctx.fillRect(0, 0, w, h);
}

/**
 * 2. Radial Gradient Glow
 */
export function drawRadialGlow(
  ctx: CanvasRenderingContext2D,
  theme: ThemePalette,
  spec?: CanvasDimensionSpec
) {
  const w = spec?.width ?? ctx.canvas?.width ?? CANVAS_WIDTH;
  const h = spec?.height ?? ctx.canvas?.height ?? CANVAS_HEIGHT;
  const glowY = Math.round(h * 0.36);
  const glowR = Math.round(Math.min(w, h) * 0.66);
  const glow = ctx.createRadialGradient(w / 2, glowY, 0, w / 2, glowY, glowR);
  glow.addColorStop(0, theme.radialGlow);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

/**
 * 3. Engineering Grid Lines (108px spacing, 2px stroke)
 * Batched into a single path stroke for O(1) GPU command submission.
 */
export function drawEngineeringGrid(
  ctx: CanvasRenderingContext2D,
  theme: ThemePalette,
  spec?: CanvasDimensionSpec
) {
  const w = spec?.width ?? ctx.canvas?.width ?? CANVAS_WIDTH;
  const h = spec?.height ?? ctx.canvas?.height ?? CANVAS_HEIGHT;
  ctx.save();
  ctx.strokeStyle = theme.gridLine;
  ctx.lineWidth = GRID_LINE_WIDTH;
  ctx.beginPath();
  for (let x = 0; x <= w; x += GRID_SPACING) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0; y <= h; y += GRID_SPACING) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * 3b. Canvas Background CAD Reticles & Safe-Zone Tick Marks
 * Batched into a single path stroke for all crosshairs and ticks.
 */
export function drawCadReticles(
  ctx: CanvasRenderingContext2D,
  theme: ThemePalette,
  spec?: CanvasDimensionSpec
) {
  const resolved = spec || getCanvasDimensionSpec();
  const leftX = resolved.safeMarginLeft;
  const rightX = resolved.safeMarginRight;
  const topY = Math.min(resolved.headerY + (resolved.height < 1920 ? 58 : 44), 256);
  const midY = Math.round(resolved.height * 0.48);
  const botY = resolved.safeFooterCeilingY + 8;

  ctx.save();
  ctx.strokeStyle = `${theme.accent}4D`;
  ctx.lineWidth = 1.5;

  const cadCrosshairPoints = [
    { x: leftX, y: topY },
    { x: rightX, y: topY },
    { x: leftX, y: midY },
    { x: rightX, y: midY },
    { x: leftX, y: botY },
    { x: rightX, y: botY },
  ];
  const arm = 10;
  ctx.beginPath();
  for (const pt of cadCrosshairPoints) {
    ctx.moveTo(pt.x - arm, pt.y);
    ctx.lineTo(pt.x + arm, pt.y);
    ctx.moveTo(pt.x, pt.y - arm);
    ctx.lineTo(pt.x, pt.y + arm);
  }

  for (let ty = topY + 160; ty < botY - 80; ty += 180) {
    ctx.moveTo(leftX, ty);
    ctx.lineTo(leftX + 6, ty);
    ctx.moveTo(rightX, ty);
    ctx.lineTo(rightX - 6, ty);
  }
  ctx.stroke();
  // Step 6: Deleted 12px SYS_REF text label (all visible text must be >= 24px at 1080x1920)
  ctx.restore();
}

/**
 * 4. Header: Top-Left Authentic MARROK Vector Badge + Full Wordmark "MARROK" + Pulsing Accent Dot
 * + Top-Right Slide-Type Corner Tag (BENCHMARK, ARCHITECTURE, COST, PROBLEM, TAKEAWAY, ACTION) at >=24px
 */
export function drawHeader(
  ctx: CanvasRenderingContext2D,
  carousel: CarouselData,
  theme: ThemePalette,
  categoryTag: string,
  spec?: CanvasDimensionSpec
) {
  const resolved = spec || getCanvasDimensionSpec(carousel?.dimensionPreset);
  ctx.save();
  const displayBrandText = 'MARROK';

  // Crisp compact authentic MARROK vector logo badge (32x32px)
  const logoBadgeSize = 32;
  const logoBadgeX = resolved.headerMarginLeft ?? resolved.safeMarginLeft;
  const logoBadgeY = resolved.headerY;

  // Ambient badge glow matching studio header
  ctx.save();
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur = 8;
  drawRoundRect(ctx, logoBadgeX, logoBadgeY, logoBadgeSize, logoBadgeSize, 8, '#0D0D0D', `${theme.accent}66`, 1.2);
  ctx.restore();

  // Render authentic SVG vector mark inside badge using Path2D
  drawMarrokVectorBadge(
    ctx,
    logoBadgeX + logoBadgeSize / 2,
    logoBadgeY + logoBadgeSize / 2,
    logoBadgeSize - 4,
    theme.accent,
    'transparent'
  );

  // Brand Wordmark: clean 12px gap between the badge and full MARROK wordmark
  const brandTextX = logoBadgeX + logoBadgeSize + 12;
  ctx.font = '800 38px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(displayBrandText, brandTextX, logoBadgeY + 30);

  // Pulsing Accent Dot next to Brand wordmark
  const brandWidth = ctx.measureText(displayBrandText).width;
  const dotX = brandTextX + brandWidth + 12;
  ctx.beginPath();
  ctx.arc(dotX, logoBadgeY + 17, 7.5, 0, Math.PI * 2);
  ctx.fillStyle = theme.accent;
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  // Top-Right Corner Tag (omitted on Meme posts or when categoryTag is empty)
  // Enforces >= 24px at 1080x1920 (never shrinks below 24px on 9:16)
  const cleanCategory = (categoryTag || '').trim();
  if (cleanCategory && carousel.postFormat !== 'meme') {
    const headerRightX = resolved.headerMarginRight ?? resolved.safeMarginRight;
    const minLeftClearanceX = dotX + 26;
    const maxCategoryW = Math.max(180, headerRightX - minLeftClearanceX);
    const minTagSize = resolved.height >= 1920 ? 24 : 20;
    let catFontSize = 26;
    ctx.font = `700 ${catFontSize}px "Plus Jakarta Sans", sans-serif`;
    while (catFontSize > minTagSize && ctx.measureText(cleanCategory).width > maxCategoryW) {
      catFontSize -= 1;
      ctx.font = `700 ${catFontSize}px "Plus Jakarta Sans", sans-serif`;
    }
    ctx.fillStyle = theme.categoryTag;
    ctx.textAlign = 'right';
    ctx.fillText(cleanCategory, headerRightX, logoBadgeY + 27);
  }
  ctx.restore();
}

/**
 * 7. Safe-Zone Source & Brand Footer:
 * - Slide dots and swipe chips removed from artwork (TikTok shows its own).
 * - Renders "Source: <name>" on the left and "@MARROK" on the right at 24px
 *   strictly above TikTok's bottom 420px UI zone (y <= 1480 at 1080x1920).
 */
export function drawPaginationFooter(
  ctx: CanvasRenderingContext2D,
  _slideIndex: number,
  _totalSlides: number,
  theme: ThemePalette,
  carousel?: CarouselData,
  slide?: CarouselData['slides'][number],
  spec?: CanvasDimensionSpec
) {
  const resolved = spec || getCanvasDimensionSpec(carousel?.dimensionPreset);
  const isFullMediaCard =
    (slide?.imageFrameMode === 'full' || Boolean(slide?.standaloneMeme)) &&
    Boolean(slide?.imageUrl || slide?.videoUrl);

  // Place footer above the bottom 420px TikTok UI zone (y = 1472 <= 1480 on 1080x1920)
  const footerY =
    resolved.height >= 1920 && !isFullMediaCard
      ? 1472
      : resolved.paginationDotY;

  const rawBrand = 'MARROK';
  const lastSlide = carousel?.slides?.[carousel.slides.length - 1];
  const rawCredit = (
    isFullMediaCard
      ? slide?.enCredit || slide?.arCredit || ''
      : slide?.enCredit ||
        slide?.arCredit ||
        carousel?.sourceMeta?.creator ||
        carousel?.sourceMeta?.channel ||
        carousel?.channel ||
        lastSlide?.enCredit ||
        ''
  )
    .replace(/^Source:\s*/i, '')
    .replace(/^Based on\s+/i, '')
    .split(/\.\s+The numbers/i)[0]
    .trim();

  const leftX = resolved.safeMarginLeft;
  const rightX = resolved.safeMarginRight;
  const fontSize = resolved.height >= 1920 ? 24 : 20;

  ctx.save();
  ctx.textBaseline = 'middle';

  // Left segment: "Source: <name>" at 24px when source is available
  if (rawCredit && !isFullMediaCard && slide?.type !== 'cta') {
    const cleanSource = rawCredit.length > 34 ? rawCredit.slice(0, 34).trim() : rawCredit;
    ctx.font = `700 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'left';
    const prefix = 'Source: ';
    ctx.fillText(prefix, leftX, footerY);
    const prefixW = ctx.measureText(prefix).width;
    ctx.font = `600 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = theme.textEnBody || '#cbd5e1';
    ctx.fillText(cleanSource, leftX + prefixW, footerY);
  }

  // Right segment: Persistent MARROK badge + @MARROK at 24px
  const handleText = `@${rawBrand}`;
  ctx.font = `700 ${fontSize}px "JetBrains Mono", "Plus Jakarta Sans", monospace`;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(handleText, rightX, footerY);

  const handleW = ctx.measureText(handleText).width;
  const badgeSize = 24;
  const badgeX = rightX - handleW - badgeSize - 10;
  const badgeY = footerY - badgeSize / 2;

  drawRoundRect(ctx, badgeX, badgeY, badgeSize, badgeSize, 6, '#0D0D0D', `${theme.accent}66`, 1);
  drawMarrokVectorBadge(
    ctx,
    badgeX + badgeSize / 2,
    badgeY + badgeSize / 2,
    badgeSize - 4,
    theme.accent,
    'transparent'
  );

  ctx.restore();
}

