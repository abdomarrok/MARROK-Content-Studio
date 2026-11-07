import { SlideData, ThemePalette, VisualSystemOptions } from '../../../types.ts';
import { loadWebImage, loadIconImage, safeDrawImage, drawTintedImage } from '../imageLoader.ts';
import { drawRoundRect } from '../background.ts';
import { fitTextInBox } from '../textLayout.ts';
import {
  SAFE_CONTENT_WIDTH,
  SAFE_MARGIN_LEFT,
  isFullMemeSlide,
  isHeroImageSlide,
  isVideoSlide,
} from '../constants.ts';
import { drawMarrokVectorBadge } from '../../icons.ts';

/**
 * Draws the 3 technical corner registration marks (top-left, top-right, bottom-left)
 * layered cleanly above the media container inside the central card.
 */
export function drawCardCornerRegistrationMarks(
  ctx: CanvasRenderingContext2D,
  cardX: number,
  cardY: number,
  cardW: number,
  cardH: number,
  theme: ThemePalette,
  bgStyle: string = 'white'
) {
  const brk = 18;
  ctx.save();
  ctx.strokeStyle = bgStyle === 'white' ? `${theme.accent}90` : `${theme.accent}65`;
  ctx.lineWidth = 2.2;

  // Top-Left registration mark
  ctx.beginPath();
  ctx.moveTo(cardX + 22, cardY + 22 + brk);
  ctx.lineTo(cardX + 22, cardY + 22);
  ctx.lineTo(cardX + 22 + brk, cardY + 22);
  ctx.stroke();

  // Top-Right registration mark
  ctx.beginPath();
  ctx.moveTo(cardX + cardW - 22 - brk, cardY + 22);
  ctx.lineTo(cardX + cardW - 22, cardY + 22);
  ctx.lineTo(cardX + cardW - 22, cardY + 22 + brk);
  ctx.stroke();

  // Bottom-Left registration mark
  ctx.beginPath();
  ctx.moveTo(cardX + 22, cardY + cardH - 22 - brk);
  ctx.lineTo(cardX + 22, cardY + cardH - 22);
  ctx.lineTo(cardX + 22 + brk, cardY + cardH - 22);
  ctx.stroke();

  ctx.restore();
}

/**
 * Archetype 6: Image / Video / Web Visual & Branded Meme Card
 * Supports:
 * - Full Meme/Video Frame (`cardY = 220, cardH = 1140`, captionless), Hero Frame (`cardY = 200, cardH = 820`), and Standard Card (`cardY = 240, cardH = 430`)
 * - Inner Matte Backdrops (`theme`, `white`, `obsidian`) so light-background memes & videos look crisp
 * - Contain (default for 16:9/landscape videos with 8px rounded corners) & Cover (fills inner padded card)
 * - Layered corner registration marks (top-left, top-right, bottom-left) & bottom-right `@MARROK` badge overlay above media
 */
export async function drawImageSlide(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  _options: VisualSystemOptions,
  brandName: string = 'MARROK',
  videoElement?: HTMLVideoElement | null
): Promise<number> {
  const isFullMeme = isFullMemeSlide(slide);
  const isHeroFrame = isHeroImageSlide(slide);
  const isVideo = isVideoSlide(slide) || Boolean(videoElement);
  const cardX = SAFE_MARGIN_LEFT;
  const cardY = isFullMeme ? 220 : isHeroFrame || slide.type === 'poster' ? 200 : 240;
  const cardW = SAFE_CONTENT_WIDTH;
  const cardH = isFullMeme ? 1140 : isHeroFrame ? 820 : 430;
  const radius = 32;

  // 1. Soft ambient theme glow behind the card matching active post theme
  ctx.save();
  const glowGrad = ctx.createRadialGradient(
    cardX + cardW / 2,
    cardY + cardH / 2,
    40,
    cardX + cardW / 2,
    cardY + cardH / 2,
    cardW / 1.4
  );
  glowGrad.addColorStop(0, `${theme.accent}22`);
  glowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(cardX - 40, cardY - 40, cardW + 80, cardH + 80);
  ctx.restore();

  // 2. Card surface fill: supports 'white' matte for white-background memes & videos, 'obsidian', or active theme surface
  const bgStyle = slide.imageBgStyle || (isVideo ? 'white' : 'theme');
  const cardSurfaceFill =
    bgStyle === 'white'
      ? '#F8FAFC'
      : bgStyle === 'obsidian'
      ? '#05070B'
      : theme.surface;

  drawRoundRect(ctx, cardX, cardY, cardW, cardH, radius, cardSurfaceFill, theme.surfaceBorder, 2.5);

  // 3. Clip inside card for blueprint grid and visual rendering
  ctx.save();
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(cardX, cardY, cardW, cardH, radius);
  } else {
    ctx.rect(cardX, cardY, cardW, cardH);
  }
  ctx.clip();

  // Technical blueprint grid (subtle on dark backdrops, omitted on crisp white backdrop)
  if (bgStyle !== 'white') {
    ctx.strokeStyle = `${theme.accent}0A`;
    ctx.lineWidth = 1;
    const gridStep = 32;
    for (let gx = cardX; gx <= cardX + cardW; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(gx, cardY);
      ctx.lineTo(gx, cardY + cardH);
      ctx.stroke();
    }
    for (let gy = cardY; gy <= cardY + cardH; gy += gridStep) {
      ctx.beginPath();
      ctx.moveTo(cardX, gy);
      ctx.lineTo(cardX + cardW, gy);
      ctx.stroke();
    }
  }

  const pad = isHeroFrame ? 18 : 24;
  const availW = cardW - pad * 2;
  const availH = cardH - pad * 2;
  const innerX = cardX + pad;
  const innerY = cardY + pad;
  const innerRadius = slide.videoBorderRadius ?? 8;

  if (videoElement && videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
    // Draw live or seeked <video> frame inside the padded white card
    const vidAspect = videoElement.videoWidth / videoElement.videoHeight;
    const availAspect = availW / availH;
    let dw = availW;
    let dh = availH;
    let dx = innerX;
    let dy = innerY;

    if (slide.imageFit === 'cover') {
      if (vidAspect > availAspect) {
        dh = availH;
        dw = availH * vidAspect;
        dx = innerX + (availW - dw) / 2;
      } else {
        dw = availW;
        dh = availW / vidAspect;
        dy = innerY + (availH - dh) / 2;
      }
    } else {
      if (vidAspect > availAspect) {
        dw = availW;
        dh = availW / vidAspect;
      } else {
        dh = availH;
        dw = availH * vidAspect;
      }
      dx = innerX + (availW - dw) / 2;
      dy = innerY + (availH - dh) / 2;
    }

    const zoom = Math.max(0.5, Math.min(3.0, slide.imageZoom ?? 1));
    const panX = Math.max(-100, Math.min(100, slide.imagePanX ?? 0));
    const panY = Math.max(-100, Math.min(100, slide.imagePanY ?? 0));

    dw = dw * zoom;
    dh = dh * zoom;
    dx = innerX + (availW - dw) / 2 + (panX / 100) * (availW * 0.45);
    dy = innerY + (availH - dh) / 2 + (panY / 100) * (availH * 0.45);

    ctx.save();
    // Clip to inner padded area (for cover) or video bounding box with subtle 8px rounded corners (for contain)
    const clipX = slide.imageFit === 'cover' ? innerX : Math.max(innerX, dx);
    const clipY = slide.imageFit === 'cover' ? innerY : Math.max(innerY, dy);
    const clipW = slide.imageFit === 'cover' ? availW : Math.min(availW, dw);
    const clipH = slide.imageFit === 'cover' ? availH : Math.min(availH, dh);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(clipX, clipY, clipW, clipH, innerRadius);
    } else {
      ctx.rect(clipX, clipY, clipW, clipH);
    }
    ctx.clip();
    try {
      ctx.drawImage(videoElement, dx, dy, dw, dh);
    } catch {
      // ignore transient video frame readiness error
    }
    ctx.restore();
  } else if (slide.imageUrl && !isVideo) {
    const isUploadedOrPreset =
      isHeroFrame ||
      slide.imageUrl.startsWith('data:') ||
      slide.imageUrl.includes('/assets/');
    const filterMode = slide.imageFilter || (isUploadedOrPreset ? 'clean' : 'hud');
    const isSvg = slide.imageUrl.toLowerCase().includes('.svg') || slide.imageUrl.includes('simple-icons');
    const svgColor = filterMode === 'clean' ? undefined : theme.accent;
    const img = await loadWebImage(slide.imageUrl, svgColor);

    if (img.width > 0 && img.height > 0) {
      const imgAspect = img.width / img.height;
      const cardAspect = cardW / cardH;
      let dw = cardW;
      let dh = cardH;
      let dx = cardX;
      let dy = cardY;

      if (slide.imageFit === 'cover') {
        if (imgAspect > cardAspect) {
          dh = cardH;
          dw = cardH * imgAspect;
          dx = cardX + (cardW - dw) / 2;
        } else {
          dw = cardW;
          dh = cardW / imgAspect;
          dy = cardY + (cardH - dh) / 2;
        }
      } else {
        const availAspect = availW / availH;

        if (imgAspect > availAspect) {
          dw = availW;
          dh = availW / imgAspect;
        } else {
          dh = availH;
          dw = availH * imgAspect;
        }
        dx = cardX + (cardW - dw) / 2;
        dy = cardY + (cardH - dh) / 2;
      }

      const zoom = Math.max(0.5, Math.min(3.0, slide.imageZoom ?? 1));
      const panX = Math.max(-100, Math.min(100, slide.imagePanX ?? 0));
      const panY = Math.max(-100, Math.min(100, slide.imagePanY ?? 0));

      dw = dw * zoom;
      dh = dh * zoom;
      dx = cardX + (cardW - dw) / 2 + (panX / 100) * (cardW * 0.45);
      dy = cardY + (cardH - dh) / 2 + (panY / 100) * (cardH * 0.45);

      ctx.save();
      if (filterMode === 'invert') {
        ctx.filter = 'invert(0.92) hue-rotate(180deg) contrast(1.2) brightness(0.95)';
        safeDrawImage(ctx, img, dx, dy, dw, dh);
      } else if ((filterMode === 'hud' || filterMode === 'tint') && isSvg) {
        drawTintedImage(ctx, img, dx, dy, dw, dh, theme.accent);
      } else if (filterMode === 'tint') {
        drawTintedImage(ctx, img, dx, dy, dw, dh, theme.accent);
      } else if (filterMode === 'hud') {
        ctx.filter = 'contrast(1.1) brightness(1.02)';
        safeDrawImage(ctx, img, dx, dy, dw, dh);
      } else {
        safeDrawImage(ctx, img, dx, dy, dw, dh);
      }
      ctx.restore();
    }
  } else if (!isVideo) {
    ctx.save();
    const pIcon = await loadIconImage('codeFile', theme.accent);
    const centerX = cardX + cardW / 2;
    const centerY = cardY + cardH / 2;
    safeDrawImage(ctx, pIcon, centerX - 36, centerY - 68, 72, 72);
    const placeholder = fitTextInBox(
      ctx,
      'Upload a meme/image/video or pick a preset in Visual Layout',
      cardW - 80,
      24,
      '"Plus Jakarta Sans", sans-serif',
      '600',
      { minFontSize: 14 }
    );
    ctx.font = `600 ${placeholder.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = bgStyle === 'white' ? '#475569' : theme.textMuted;
    ctx.textAlign = 'center';
    ctx.fillText(
      placeholder.lines[0] || 'Upload a meme/image/video or pick a preset in Visual Layout',
      centerX,
      centerY + 42
    );
    ctx.restore();
  }

  // Layer the 3 corner registration marks (top-left, top-right, bottom-left) ABOVE the media container
  drawCardCornerRegistrationMarks(ctx, cardX, cardY, cardW, cardH, theme, bgStyle);

  ctx.restore(); // End clipping

  // 4. Top border neon accent line
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 3;
  ctx.moveTo(cardX + 60, cardY);
  ctx.lineTo(cardX + cardW - 60, cardY);
  ctx.stroke();
  ctx.restore();

  // 5. Optional Image/Video Caption / Micro-badge matching theme (omitted in Full Meme mode unless custom)
  if (slide.imageCaption && !isFullMeme) {
    ctx.save();
    const badgeText = slide.imageCaption.toUpperCase();
    const maxBadgeW = Math.min(540, cardW - 240);
    const fitCaption = fitTextInBox(
      ctx,
      badgeText,
      maxBadgeW - 36,
      20,
      '"Plus Jakarta Sans", monospace',
      '700',
      { minFontSize: 12 }
    );
    ctx.font = `700 ${fitCaption.fontSize}px "Plus Jakarta Sans", monospace`;
    const captionText = fitCaption.lines[0] || badgeText;
    const bW = Math.min(ctx.measureText(captionText).width + 36, maxBadgeW);
    const bH = 42;
    const bX = cardX + 24;
    const bY = cardY + cardH - 58;
    drawRoundRect(ctx, bX, bY, bW, bH, 12, 'rgba(10, 15, 26, 0.90)', theme.surfaceBorder, 1.5);

    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(captionText, bX + 18, bY + bH / 2);
    ctx.restore();
  }

  // 6. Optional MARROK Corner Brand Watermark Badge (layered above media)
  const watermarkPos = slide.brandWatermark ?? (isHeroFrame || isVideo ? 'bottom-right' : 'none');
  if (watermarkPos && watermarkPos !== 'none') {
    ctx.save();
    const cleanBrand = (brandName || 'MARROK').replace(/^@/, '').trim() || 'MARROK';
    const wmText = `@${cleanBrand}`;
    ctx.font = '800 18px "JetBrains Mono", "Plus Jakarta Sans", monospace';
    const textW = ctx.measureText(wmText).width;
    const wmW = Math.round(28 + 12 + textW + 28);
    const wmH = 44;
    const padWm = 20;

    let wmX = cardX + cardW - wmW - padWm;
    let wmY = cardY + cardH - wmH - padWm;
    if (watermarkPos === 'top-right') {
      wmX = cardX + cardW - wmW - padWm;
      wmY = cardY + padWm;
    } else if (watermarkPos === 'bottom-left') {
      wmX = cardX + padWm;
      wmY = cardY + cardH - wmH - padWm;
    }

    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 12;
    drawRoundRect(ctx, wmX, wmY, wmW, wmH, 12, 'rgba(10, 15, 26, 0.90)', `${theme.accent}88`, 1.5);
    ctx.shadowBlur = 0;

    // Mini glowing MARROK vector emblem
    drawMarrokVectorBadge(ctx, wmX + 22, wmY + wmH / 2, 22, theme.accent, 'transparent');

    // @MARROK text
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(wmText, wmX + 38, wmY + wmH / 2 + 1);

    // Accent dot
    ctx.beginPath();
    ctx.arc(wmX + wmW - 14, wmY + wmH / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = theme.accent;
    ctx.fill();
    ctx.restore();
  }

  return cardY + cardH;
}

