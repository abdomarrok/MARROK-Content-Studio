import { SlideData, ThemePalette, VisualSystemOptions } from '../../../types.ts';
import { loadWebImage, loadIconImage, safeDrawImage, drawTintedImage } from '../imageLoader.ts';
import { drawRoundRect } from '../background.ts';
import { fitTextInBox } from '../textLayout.ts';
import { SAFE_CONTENT_WIDTH, SAFE_MARGIN_LEFT, isFullMemeSlide, isHeroImageSlide } from '../constants.ts';
import { drawMarrokVectorBadge } from '../../icons.ts';

/**
 * Archetype 6: Image / Web Visual & Branded Meme Card
 * Supports:
 * - Full Meme Frame (`cardY = 220, cardH = 1140`, captionless), Hero Meme Frame (`cardY = 200, cardH = 820`), and Standard Card (`cardY = 240, cardH = 430`)
 * - Inner Matte Backdrops (`theme`, `white`, `obsidian`) so light-background memes look crisp
 * - Theme harmonization filters (`clean`, `hud`, `invert`, `tint`)
 * - Optional MARROK Corner Brand Watermark Badge (`bottom-right`, `top-right`, `bottom-left`)
 */
export async function drawImageSlide(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  _options: VisualSystemOptions,
  brandName: string = 'MARROK'
): Promise<number> {
  const isFullMeme = isFullMemeSlide(slide);
  const isHeroFrame = isHeroImageSlide(slide);
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

  // 2. Card surface fill: supports 'white' matte for white-background memes, 'obsidian', or active theme surface
  const bgStyle = slide.imageBgStyle || 'theme';
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

  // Technical blueprint grid (subtle on dark backdrops, omitted on crisp white meme backdrop)
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

  // Technical corner HUD brackets in theme accent
  const brk = 18;
  ctx.strokeStyle = bgStyle === 'white' ? `${theme.accent}70` : `${theme.accent}45`;
  ctx.lineWidth = 2;
  // Top-Left
  ctx.beginPath();
  ctx.moveTo(cardX + 22, cardY + 22 + brk);
  ctx.lineTo(cardX + 22, cardY + 22);
  ctx.lineTo(cardX + 22 + brk, cardY + 22);
  ctx.stroke();
  // Top-Right
  ctx.beginPath();
  ctx.moveTo(cardX + cardW - 22 - brk, cardY + 22);
  ctx.lineTo(cardX + cardW - 22, cardY + 22);
  ctx.lineTo(cardX + cardW - 22, cardY + 22 + brk);
  ctx.stroke();

  if (slide.imageUrl) {
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
        const pad = isHeroFrame ? 18 : 24;
        const availW = cardW - pad * 2;
        const availH = cardH - pad * 2;
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
  } else {
    ctx.save();
    const pIcon = await loadIconImage('codeFile', theme.accent);
    const centerX = cardX + cardW / 2;
    const centerY = cardY + cardH / 2;
    safeDrawImage(ctx, pIcon, centerX - 36, centerY - 68, 72, 72);
    const placeholder = fitTextInBox(
      ctx,
      'Upload a meme/image or pick a preset in Visual Layout',
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
      placeholder.lines[0] || 'Upload a meme/image or pick a preset in Visual Layout',
      centerX,
      centerY + 42
    );
    ctx.restore();
  }
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

  // 5. Optional Image Caption / Micro-badge matching theme (omitted in Full Meme mode unless custom)
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

  // 6. Optional MARROK Corner Brand Watermark Badge
  const watermarkPos = slide.brandWatermark ?? (isHeroFrame ? 'bottom-right' : 'none');
  if (watermarkPos && watermarkPos !== 'none') {
    ctx.save();
    const cleanBrand = (brandName || 'MARROK').replace(/^@/, '').trim() || 'MARROK';
    const wmText = `@${cleanBrand}`;
    ctx.font = '800 18px "JetBrains Mono", "Plus Jakarta Sans", monospace';
    const textW = ctx.measureText(wmText).width;
    const wmW = Math.round(28 + 12 + textW + 28);
    const wmH = 44;
    const pad = 20;

    let wmX = cardX + cardW - wmW - pad;
    let wmY = cardY + cardH - wmH - pad;
    if (watermarkPos === 'top-right') {
      wmX = cardX + cardW - wmW - pad;
      wmY = cardY + pad;
    } else if (watermarkPos === 'bottom-left') {
      wmX = cardX + pad;
      wmY = cardY + cardH - wmH - pad;
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

