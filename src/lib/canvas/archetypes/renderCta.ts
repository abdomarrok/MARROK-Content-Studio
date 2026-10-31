import { CarouselData, SlideData, ThemePalette, VisualSystemOptions } from '../../../types.ts';
import { fitTextInBox } from '../textLayout.ts';
import { loadIconImage, safeDrawImage } from '../imageLoader.ts';
import { drawRoundRect } from '../background.ts';
import { drawMarrokVectorBadge } from '../../icons.ts';
import { getCanvasDimensionSpec, getArchetypeGraphicTransform } from '../constants.ts';
import { computeSlideLayoutAwareness } from '../layoutAwareness.ts';

/**
 * Archetype 8: Standardized Marrok Closer (CTA Slide)
 * Renders isometric emblem with authentic MARROK vector logo, domain hook,
 * high-contrast bilingual CTA button, URL, and verified attribution card.
 * Fully synchronized with computeSlideLayoutAwareness across TikTok 9:16 and Instagram 4:5 / 3:4 / 1:1 / 9:16.
 */
export async function drawCtaSlide(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  carousel: CarouselData,
  theme: ThemePalette,
  _options: VisualSystemOptions,
  _themeMode: string = 'engineering'
): Promise<number> {
  const spec = getCanvasDimensionSpec(carousel?.dimensionPreset);
  const layout = computeSlideLayoutAwareness(slide, carousel);
  const centerX = spec.safeTextCenterX;
  const ctaTransform = getArchetypeGraphicTransform(spec, 'cta');

  // Render Upper Emblem & Brand Header inside scaled graphic space
  if (!layout.graphicCard?.hidden) {
    ctx.save();
    const gCx = centerX;
    const gCy = ctaTransform.cardY + ctaTransform.cardH / 2;
    const shiftX = layout.graphicCard?.dx || 0;
    const shiftY = layout.graphicCard ? layout.graphicCard.y - ctaTransform.cardY : 0;
    const s = layout.graphicCard?.scale ?? 1;
    if (shiftX !== 0 || shiftY !== 0 || s !== 1) {
      ctx.translate(gCx + shiftX, gCy + shiftY);
      ctx.scale(s, s);
      ctx.translate(-gCx, -gCy);
    }
    if (layout.graphicCard?.opacity !== undefined && layout.graphicCard.opacity < 1) {
      ctx.globalAlpha *= Math.max(0.1, Math.min(1, layout.graphicCard.opacity));
    }
    if (
      ctaTransform.scale !== 1 ||
      ctaTransform.translateX !== 0 ||
      ctaTransform.translateY !== 0
    ) {
      ctx.translate(ctaTransform.translateX, ctaTransform.translateY);
      ctx.scale(ctaTransform.scale, ctaTransform.scale);
    }

    const emblemX = 518;
    const emblemY = 390;
    const calRadius = 132;

    // 1. Outer 45° Calibration Ring & Cardinal CAD Reticles
    ctx.save();
    ctx.beginPath();
    ctx.arc(emblemX, emblemY, calRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `${theme.accent}35`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Outer segmented dashed ring
    ctx.beginPath();
    ctx.arc(emblemX, emblemY, calRadius + 10, 0, Math.PI * 2);
    ctx.strokeStyle = `${theme.accent}22`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 8 Calibration Tick Marks at 45° intervals
    ctx.strokeStyle = `${theme.accent}80`;
    ctx.lineWidth = 2;
    for (let a = 0; a < 360; a += 45) {
      const rad = (a * Math.PI) / 180;
      const x1 = emblemX + (calRadius - 6) * Math.cos(rad);
      const y1 = emblemY + (calRadius - 6) * Math.sin(rad);
      const x2 = emblemX + (calRadius + 6) * Math.cos(rad);
      const y2 = emblemY + (calRadius + 6) * Math.sin(rad);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Outer cardinal CAD reticles (+) at 0°, 90°, 180°, 270°
    const reticleOffset = calRadius + 18;
    const cardAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
    for (const ang of cardAngles) {
      const rx = emblemX + reticleOffset * Math.cos(ang);
      const ry = emblemY + reticleOffset * Math.sin(ang);
      ctx.beginPath();
      ctx.moveTo(rx - 5, ry);
      ctx.lineTo(rx + 5, ry);
      ctx.moveTo(rx, ry - 5);
      ctx.lineTo(rx, ry + 5);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Layered Isometric Cube / Diamond Geometry
    const cubeR = 74;
    const vAngles = [-Math.PI / 2, -Math.PI / 6, Math.PI / 6, Math.PI / 2, (5 * Math.PI) / 6, (-5 * Math.PI) / 6];
    const pts = vAngles.map((ang) => ({
      x: emblemX + cubeR * Math.cos(ang),
      y: emblemY + cubeR * Math.sin(ang),
    }));

    // Ambient glow behind cube
    ctx.save();
    const cubeGlow = ctx.createRadialGradient(emblemX, emblemY, 10, emblemX, emblemY, 130);
    cubeGlow.addColorStop(0, `${theme.accent}26`);
    cubeGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = cubeGlow;
    ctx.fillRect(emblemX - 130, emblemY - 130, 260, 260);

    // Facet 1: Top Diamond
    ctx.beginPath();
    ctx.moveTo(emblemX, emblemY);
    ctx.lineTo(pts[5].x, pts[5].y);
    ctx.lineTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.closePath();
    ctx.fillStyle = `${theme.accent}26`;
    ctx.fill();
    ctx.strokeStyle = `${theme.accent}66`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Facet 2: Left Diamond
    ctx.beginPath();
    ctx.moveTo(emblemX, emblemY);
    ctx.lineTo(pts[5].x, pts[5].y);
    ctx.lineTo(pts[4].x, pts[4].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.closePath();
    ctx.fillStyle = '#0c151c';
    ctx.fill();
    ctx.strokeStyle = `${theme.accent}55`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Facet 3: Right Diamond
    ctx.beginPath();
    ctx.moveTo(emblemX, emblemY);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.closePath();
    ctx.fillStyle = `${theme.accent}14`;
    ctx.fill();
    ctx.strokeStyle = `${theme.accent}55`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Outer Hexagon Perimeter
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // 3. Central Core: Authentic MARROK Vector Emblem
    const coreSize = 54;
    const coreX = emblemX - coreSize / 2;
    const coreY = emblemY - coreSize / 2;

    ctx.save();
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 14;
    drawRoundRect(ctx, coreX, coreY, coreSize, coreSize, 14, '#081216', theme.accent, 2);
    ctx.restore();

    drawMarrokVectorBadge(ctx, emblemX, emblemY, coreSize - 6, theme.accent, 'transparent');
    ctx.restore();

    // 4. Brand Wordmark & Domain Hook Badge directly below emblem
    ctx.save();
    const ctaBrand = carousel.brand || 'MARROK';
    const fitBrand = fitTextInBox(ctx, ctaBrand, 850, 50, '"Plus Jakarta Sans", sans-serif', '800', {
      minFontSize: 28,
    });
    ctx.font = `800 ${fitBrand.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fitBrand.lines[0] || ctaBrand, emblemX, 550);

    // Accent Divider Line: 90x5 pill
    drawRoundRect(ctx, emblemX - 45, 566, 90, 5, 2.5, theme.accent);

    // Micro Domain Category Badge
    const ctaCategory = (carousel.category || 'SOFTWARE ARCHITECTURE').toUpperCase();
    const fitCategory = fitTextInBox(ctx, ctaCategory, 568, 15, '"Plus Jakarta Sans", monospace', '700', {
      minFontSize: 10,
    });
    ctx.font = `700 ${fitCategory.fontSize}px "Plus Jakarta Sans", monospace`;
    const categoryLabel = fitCategory.lines[0] || ctaCategory;
    const catMetrics = ctx.measureText(categoryLabel);
    const catBadgeW = Math.min(catMetrics.width + 32, 600);
    const catBadgeH = 30;
    drawRoundRect(ctx, emblemX - catBadgeW / 2, 588, catBadgeW, catBadgeH, 8, `${theme.accent}14`, `${theme.accent}45`, 1);
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(categoryLabel, emblemX, 588 + catBadgeH / 2);
    ctx.restore();
    ctx.restore();
  }

  const resolveAlignX = (align: 'left' | 'center' | 'right' = 'center', dx: number = 0) => {
    if (align === 'left') return { x: spec.safeMarginLeft + dx, textAlign: 'left' as CanvasTextAlign };
    if (align === 'right') return { x: spec.safeMarginRight + dx, textAlign: 'right' as CanvasTextAlign };
    return { x: centerX + dx, textAlign: 'center' as CanvasTextAlign };
  };

  // 5. Domain Question Hook (Synchronized with layout.titleBlock & layout.arabicTitleBlock)
  if (layout.titleBlock && !layout.titleBlock.hidden && layout.titleBlock.lines.length > 0) {
    const tb = layout.titleBlock;
    const { x, textAlign } = resolveAlignX(tb.align, tb.dx);
    ctx.save();
    if (tb.opacity !== undefined && tb.opacity < 1) {
      ctx.globalAlpha *= Math.max(0.1, Math.min(1, tb.opacity));
    }
    ctx.font = `800 ${tb.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = textAlign;
    ctx.textBaseline = 'alphabetic';
    let lineY = tb.firstBaselineY;
    for (const line of tb.lines) {
      ctx.fillText(line, x, lineY);
      lineY += tb.lineHeight;
    }
    ctx.restore();
  }

  if (layout.arabicTitleBlock && !layout.arabicTitleBlock.hidden && layout.arabicTitleBlock.lines.length > 0) {
    const atb = layout.arabicTitleBlock;
    const { x, textAlign } = resolveAlignX(atb.align, atb.dx);
    ctx.save();
    if (atb.opacity !== undefined && atb.opacity < 1) {
      ctx.globalAlpha *= Math.max(0.1, Math.min(1, atb.opacity));
    }
    ctx.font = `800 ${atb.fontSize}px "Cairo", sans-serif`;
    ctx.fillStyle = theme.accent;
    ctx.textAlign = textAlign;
    ctx.direction = 'rtl';
    ctx.textBaseline = 'alphabetic';
    let lineY = atb.firstBaselineY;
    for (const line of atb.lines) {
      ctx.fillText(line, x, lineY);
      lineY += atb.lineHeight;
    }
    ctx.restore();
  }

  // 6. High-Contrast Bilingual CTA Pill Button (Synchronized with layout.ctaButton)
  const ctaScale = layout.ctaButton?.scale ?? 1;
  const btn = layout.ctaButton || {
    x: centerX - 320,
    y: Math.round(spec.safeFooterCeilingY - 260),
    width: 640,
    height: 96,
    dx: 0,
    dy: 0,
    scale: 1,
    opacity: 1,
    hidden: false,
  };
  const pillW = btn.width;
  const pillH = btn.height;
  const pillX = btn.x;
  const pillY = btn.y;

  const ctaFontScale = spec.height < 1920 ? Math.max(0.82, spec.graphicScale + 0.1) : 1;
  if (!btn.hidden) {
    ctx.save();
    if (btn.opacity !== undefined && btn.opacity < 1) {
      ctx.globalAlpha *= Math.max(0.1, Math.min(1, btn.opacity));
    }
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 14;
    drawRoundRect(ctx, pillX, pillY, pillW, pillH, Math.round(pillH / 2), theme.accent);
    ctx.restore();

    // Sanitize CTA text against commercial service claims
    let rawCta = slide.ctaText || 'Join discussion  •  شارك برأيك';
    if (/architecture review|hire|consulting|book a call/i.test(rawCta)) {
      rawCta = 'Join discussion  •  شارك برأيك';
    }

    ctx.save();
    if (btn.opacity !== undefined && btn.opacity < 1) {
      ctx.globalAlpha *= Math.max(0.1, Math.min(1, btn.opacity));
    }
    ctx.font = `800 ${Math.round(36 * ctaFontScale * ctaScale)}px "Cairo", "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#081216';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rawCta, pillX + pillW / 2, pillY + pillH / 2);
    ctx.restore();
  }

  // 7. Verified Website URL & 8. Bilingual Source Attribution Card
  const attr = layout.attributionCard || {
    x: centerX - 390,
    y: spec.safeFooterCeilingY - 104,
    width: 780,
    height: 92,
    dx: 0,
    dy: 0,
    scale: 1,
    opacity: 1,
    hidden: false,
  };
  const cardX = attr.x;
  const cardY = attr.y;
  const cardW = attr.width;
  const cardH = attr.height;

  const displayUrl = carousel.brandUrl || slide.url || 'marrok.org';
  const urlY = Math.max(pillY + pillH + 28, cardY - Math.round(16 * ctaFontScale));

  if (!attr.hidden) {
    ctx.save();
    if (attr.opacity !== undefined && attr.opacity < 1) {
      ctx.globalAlpha *= Math.max(0.1, Math.min(1, attr.opacity));
    }

    ctx.save();
    const fitUrl = fitTextInBox(ctx, displayUrl, cardW, Math.round(30 * ctaFontScale), '"JetBrains Mono", monospace', '600', {
      minFontSize: 20,
    });
    ctx.font = `600 ${fitUrl.fontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#E2E8EC';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fitUrl.lines[0] || displayUrl, centerX, urlY);
    ctx.restore();

    drawRoundRect(ctx, cardX, cardY, cardW, cardH, 20, `${theme.surface}99`, theme.surfaceBorder, 1.5);

    // 1. Miniature authentic MARROK logo badge
    const mBadgeSize = Math.min(44, cardH - 24);
    const mBadgeX = cardX + 20;
    const mBadgeY = cardY + (cardH - mBadgeSize) / 2;
    drawRoundRect(ctx, mBadgeX, mBadgeY, mBadgeSize, mBadgeSize, 10, '#0D0D0D', `${theme.accent}55`, 1.2);
    drawMarrokVectorBadge(
      ctx,
      mBadgeX + mBadgeSize / 2,
      mBadgeY + mBadgeSize / 2,
      mBadgeSize - 6,
      theme.accent,
      'transparent'
    );

    // 2. Verified shield icon badge alongside MARROK badge
    const sBadgeSize = mBadgeSize;
    const sBadgeX = mBadgeX + mBadgeSize + 10;
    const sBadgeY = cardY + (cardH - sBadgeSize) / 2;
    drawRoundRect(ctx, sBadgeX, sBadgeY, sBadgeSize, sBadgeSize, 10, `${theme.accent}20`, `${theme.accent}65`, 1.2);
    const shieldImg = await loadIconImage('shieldAlert', theme.accent);
    safeDrawImage(ctx, shieldImg, sBadgeX + 10, sBadgeY + 10, sBadgeSize - 20, sBadgeSize - 20);

    // 3. Attribution text tier with creator and channel support
    const textStartX = sBadgeX + sBadgeSize + 16;
    const creator = carousel.sourceMeta?.creator || carousel.sourceMeta?.channel;
    const sourceTitle = carousel.sourceMeta?.title || 'Engineering Architecture';

    const defaultEnCredit = creator
      ? `Source: ${creator} • ${sourceTitle}`
      : `Technical Analysis // ${sourceTitle}`;
    const defaultArCredit = creator
      ? `المصدر: ${creator} • تحليل هندسي موثق`
      : `توثيق وتحليل تقني // ${sourceTitle}`;

    const enCredit = slide.enCredit || defaultEnCredit;
    const arCredit = slide.arCredit || defaultArCredit;

    const creditMaxWidth = Math.max(200, cardX + cardW - textStartX - 20);

    ctx.save();
    const fitEnCredit = fitTextInBox(ctx, enCredit, creditMaxWidth, 23, '"Plus Jakarta Sans", sans-serif', '600', {
      minFontSize: 14,
    });
    ctx.font = `600 ${fitEnCredit.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#CBD5E1';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fitEnCredit.lines[0] || enCredit, textStartX, cardY + Math.round(cardH * 0.43));
    ctx.restore();

    ctx.save();
    const fitArCredit = fitTextInBox(ctx, arCredit, creditMaxWidth, 23, '"Cairo", sans-serif', '600', {
      minFontSize: 14,
    });
    ctx.font = `600 ${fitArCredit.fontSize}px "Cairo", sans-serif`;
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'left';
    ctx.direction = 'rtl';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fitArCredit.lines[0] || arCredit, textStartX, cardY + Math.round(cardH * 0.8));
    ctx.restore();

    ctx.restore();
  }

  return cardY + cardH;
}

