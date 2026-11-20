import { SlideData, SlideTakeawayItem, ThemePalette, VisualSystemOptions } from '../../../types.ts';
import { drawRoundRect } from '../background.ts';
import { CanvasDimensionSpec, SAFE_CONTENT_WIDTH, SAFE_MARGIN_LEFT, isVideoSlide } from '../constants.ts';
import { fitTextInBox } from '../textLayout.ts';
import { loadIconImage, safeDrawImage } from '../imageLoader.ts';
import { drawRowSlide } from './renderRow.ts';
import { drawImageSlide } from './renderImage.ts';
import { isolateEmbeddedLatinInArabic } from '../../text/arabicBiDi.ts';

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
  const topY = 240;
  const cardW = SAFE_CONTENT_WIDTH;
  const cardH = 490;
  const cardX = SAFE_MARGIN_LEFT;

  const hasVisualMedia = Boolean(slide.imageUrl || isVideoSlide(slide) || videoElement);

  // Render Hero Meme / Image / Video card if media is attached, otherwise render the schematic diagram card
  const graphicEnd = hasVisualMedia
    ? await drawImageSlide(ctx, slide, theme, options, brandName, videoElement, spec)
    : await drawRowSlide(ctx, slide, theme, options);

  // If slide has a metricValue and is a schematic diagram (no image/video), draw a crisp measured metric pill
  // tucked neatly in the top-right header bar of the schematic card so it never clips or overlaps the title
  if (slide.metricValue && !hasVisualMedia) {
    ctx.save();
    const cleanMetric = slide.metricValue.trim().slice(0, 14);
    const labelText = (slide.metricLabel || slide.metricDiff || '').trim().slice(0, 14);
    ctx.font = '800 22px "JetBrains Mono", monospace';
    const valWidth = typeof ctx.measureText === 'function' ? ctx.measureText(cleanMetric).width : cleanMetric.length * 14;
    ctx.font = '600 13px "JetBrains Mono", sans-serif';
    const lblWidth =
      labelText && typeof ctx.measureText === 'function'
        ? ctx.measureText(labelText).width
        : labelText.length * 8;
    const badgeW = Math.min(280, Math.max(124, Math.ceil(valWidth + (lblWidth > 0 ? lblWidth + 34 : 28))));
    const badgeH = 38;
    const badgeX = cardX + cardW - badgeW - 14;
    const badgeY = topY + 10;

    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 8;
    drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 8, 'rgba(10, 15, 26, 0.92)', `${theme.accent}AA`, 1.2);
    ctx.shadowBlur = 0;

    ctx.font = '800 22px "JetBrains Mono", monospace';
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(cleanMetric, badgeX + 12, badgeY + badgeH / 2 + 1);

    if (labelText && badgeW >= valWidth + lblWidth + 30) {
      ctx.font = '600 13px "JetBrains Mono", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillText(labelText, badgeX + 20 + valWidth, badgeY + badgeH / 2 + 1);
    }

    ctx.restore();
  }

  return Math.max(topY + cardH, graphicEnd);
}

/**
 * Draws the 3 Bento Takeaway cards in the vertical space computed by layoutAwareness.
 * Enforces separate non-overlapping vertical bands for English (LTR top) and Arabic (RTL bottom).
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
  const gap = count > 1 ? (totalH < 240 ? 10 : 12) : 0;
  const rowH = Math.max(66, Math.floor((totalH - (count - 1) * gap) / count));

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
      'rgba(18, 24, 38, 0.78)',
      `${theme.accent}45`,
      1.2
    );

    // Left Number / Icon Badge
    const badgeSize = Math.min(46, Math.max(34, rowH - 28));
    const badgeX = cardX + 16;
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
      ctx.save();
      ctx.font = '800 18px "JetBrains Mono", monospace';
      ctx.fillStyle = theme.accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`0${i + 1}`, badgeX + badgeSize / 2, badgeY + badgeHOrSize(badgeSize) / 2);
      ctx.restore();
    }

    // Text Zone between badge and right edge
    const textStartX = badgeX + badgeSize + 18;
    const textRightX = cardX + cardW - 18;
    const textW = Math.max(180, textRightX - textStartX);
    const isCompactRow = rowH < 82;
    const hasArabic = Boolean((item.ar || '').trim());

    // English Takeaway (Dedicated upper LTR band, or vertically centered if no Arabic)
    if ((item.en || '').trim()) {
      ctx.save();
      const fitEn = fitTextInBox(
        ctx,
        item.en,
        textW,
        isCompactRow ? 21 : 25,
        '"Plus Jakarta Sans", sans-serif',
        '700',
        { maxLines: 1, minFontSize: isCompactRow ? 17 : 22 }
      );

      ctx.font = `700 ${fitEn.fontSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.direction = 'ltr';
      ctx.textBaseline = 'middle';
      const enCenterY = hasArabic ? rowY + Math.round(rowH * 0.3) : rowY + Math.round(rowH * 0.5);
      ctx.fillText(fitEn.lines[0] || item.en, textStartX, enCenterY);
      ctx.restore();
    }

    // Arabic Takeaway (Dedicated lower RTL band, cleanly separated from English line above)
    if (hasArabic) {
      ctx.save();
      const fitAr = fitTextInBox(
        ctx,
        item.ar,
        textW,
        isCompactRow ? 19 : 23,
        '"Cairo", sans-serif',
        '600',
        { maxLines: 1, minFontSize: isCompactRow ? 16 : 21 }
      );

      ctx.font = `600 ${fitAr.fontSize}px "Cairo", sans-serif`;
      ctx.fillStyle = theme.accent;
      ctx.textAlign = 'right';
      ctx.direction = 'rtl';
      ctx.textBaseline = 'middle';
      const arCenterY = (item.en || '').trim()
        ? rowY + Math.round(rowH * 0.72)
        : rowY + Math.round(rowH * 0.5);
      ctx.fillText(
        isolateEmbeddedLatinInArabic(fitAr.lines[0] || item.ar),
        textRightX,
        arCenterY
      );
      ctx.restore();
    }
  }

  ctx.restore();
}

function badgeHOrSize(size: number): number {
  return size;
}
