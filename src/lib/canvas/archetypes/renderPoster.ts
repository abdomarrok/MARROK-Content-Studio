import { SlideData, SlideTakeawayItem, ThemePalette, VisualSystemOptions } from '../../../types.ts';
import { drawRoundRect } from '../background.ts';
import { CanvasDimensionSpec, SAFE_CONTENT_WIDTH, SAFE_MARGIN_LEFT, isVideoSlide } from '../constants.ts';
import { fitTextInBox } from '../textLayout.ts';
import { loadIconImage, safeDrawImage } from '../imageLoader.ts';
import { drawRowSlide } from './renderRow.ts';
import { drawImageSlide } from './renderImage.ts';

/**
 * Archetype 9: Infographic, Branded Meme & Video Poster (`poster`)
 * Dedicated single-slide format supporting:
 * 1. Hero Meme / Image / Video Frame (when `slide.imageUrl` or `slide.videoUrl` is set) with corner registration marks and `@MARROK` watermark.
 * 2. Compact CAD Schematic Card at y = 200 (height 430px) with optional benchmark metric pill.
 */
export async function drawPosterSlide(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  options: VisualSystemOptions,
  brandName: string = 'MARROK',
  videoElement?: HTMLVideoElement | null,
  spec?: CanvasDimensionSpec
): Promise<number> {
  const topY = 200;
  const cardW = SAFE_CONTENT_WIDTH;
  const cardH = 430;
  const cardX = SAFE_MARGIN_LEFT;

  const hasVisualMedia = Boolean(slide.imageUrl || isVideoSlide(slide) || videoElement);

  // Render Hero Meme / Image / Video card if media is attached, otherwise render the schematic diagram card
  const graphicEnd = hasVisualMedia
    ? await drawImageSlide(ctx, slide, theme, options, brandName, videoElement, spec)
    : await drawRowSlide(ctx, slide, theme, options);

  // If slide has a metricValue and is a schematic diagram (no image/video), draw a metric badge in the top right of the card
  if (slide.metricValue && !hasVisualMedia) {
    ctx.save();
    const badgeW = 260;
    const badgeH = 58;
    const badgeX = cardX + cardW - badgeW - 16;
    const badgeY = topY + 16;

    // Glowing metric backdrop
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 10;
    drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 10, 'rgba(10, 15, 26, 0.88)', `${theme.accent}99`, 1.2);
    ctx.shadowBlur = 0;

    // Value text
    ctx.font = '800 26px "JetBrains Mono", monospace';
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(slide.metricValue.slice(0, 8), badgeX + 16, badgeY + badgeH / 2);

    // Label / Diff text
    const labelText = (slide.metricLabel || slide.metricDiff || 'BENCHMARK').slice(0, 16);
    ctx.font = '600 15px "JetBrains Mono", sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(labelText, badgeX + 90, badgeY + badgeH / 2);

    ctx.restore();
  }

  return Math.max(topY + cardH, graphicEnd);
}

/**
 * Draws the 3 Bento Takeaway cards in the vertical space computed by layoutAwareness.
 * Meets mobile typography floor (>= 26px font) and safe-zone boundaries (x <= 945, y <= 1710).
 */
export async function drawTakeawaysBlock(
  ctx: CanvasRenderingContext2D,
  takeaways: SlideTakeawayItem[],
  theme: ThemePalette,
  bounds: { x?: number; width?: number; top: number; bottom: number; height: number; dx?: number; dy?: number },
  _options?: VisualSystemOptions
): Promise<void> {
  if (!takeaways || takeaways.length === 0) return;

  const count = Math.min(3, takeaways.length);
  const cardX = bounds.x !== undefined ? bounds.x : SAFE_MARGIN_LEFT + (bounds.dx || 0);
  const cardW = bounds.width !== undefined ? bounds.width : SAFE_CONTENT_WIDTH;
  const totalH = bounds.height;
  const gap = count > 1 ? (totalH < 200 ? 10 : 12) : 0;
  const rowH = Math.max(46, Math.floor((totalH - (count - 1) * gap) / count));

  ctx.save();

  for (let i = 0; i < count; i++) {
    const item = takeaways[i];
    const rowY = bounds.top + i * (rowH + gap);

    // Clean Bento Card Container
    drawRoundRect(
      ctx,
      cardX,
      rowY,
      cardW,
      rowH,
      12,
      'rgba(18, 24, 38, 0.72)',
      `${theme.accent}40`,
      1.2
    );

    // Left Number / Icon Badge
    const badgeSize = Math.min(44, Math.max(32, rowH - 16));
    const badgeX = cardX + 14;
    const badgeY = rowY + (rowH - badgeSize) / 2;

    drawRoundRect(
      ctx,
      badgeX,
      badgeY,
      badgeSize,
      badgeSize,
      8,
      `${theme.accent}1F`,
      `${theme.accent}80`,
      1
    );

    // Draw icon or fallback number
    const iconKey = item.icon || (i === 0 ? 'zap' : i === 1 ? 'layers' : 'checkCircle');
    const iconImg = await loadIconImage(iconKey, theme.accent);

    if (iconImg) {
      safeDrawImage(ctx, iconImg, badgeX + 7, badgeY + 7, badgeSize - 14, badgeSize - 14);
    } else {
      ctx.font = '800 18px "JetBrains Mono", monospace';
      ctx.fillStyle = theme.accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`0${i + 1}`, badgeX + badgeSize / 2, badgeY + badgeSize / 2);
    }

    // Text Zone between badge and right edge
    const textStartX = badgeX + badgeSize + 16;
    const textW = cardW - (badgeSize + 40);
    const isCompactRow = rowH < 64;

    // English Takeaway (Top line / Left)
    const fitEn = fitTextInBox(
      ctx,
      item.en,
      textW,
      isCompactRow ? 22 : 26,
      '"Plus Jakarta Sans", sans-serif',
      '700',
      { maxLines: 1, minFontSize: isCompactRow ? 18 : 24 }
    );

    ctx.font = `700 ${fitEn.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.direction = 'ltr';
    ctx.textBaseline = 'top';
    ctx.fillText(fitEn.lines[0] || item.en, textStartX, rowY + (isCompactRow ? 7 : 12));

    // Arabic Takeaway (Bottom line / RTL)
    if (item.ar) {
      const fitAr = fitTextInBox(
        ctx,
        item.ar,
        textW,
        isCompactRow ? 20 : 24,
        '"Cairo", sans-serif',
        '600',
        { maxLines: 1, minFontSize: isCompactRow ? 17 : 22 }
      );

      ctx.font = `600 ${fitAr.fontSize}px "Cairo", sans-serif`;
      ctx.fillStyle = theme.accent;
      ctx.textAlign = 'right';
      ctx.direction = 'rtl';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fitAr.lines[0] || item.ar, cardX + cardW - 16, rowY + rowH - (isCompactRow ? 6 : 10));
    }
  }

  ctx.restore();
}
