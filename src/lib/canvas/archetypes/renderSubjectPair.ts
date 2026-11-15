import { SlideData, ThemePalette, VisualSystemOptions } from '../../../types.ts';
import { loadIconImage, safeDrawImage } from '../imageLoader.ts';
import { drawRoundRect } from '../background.ts';
import { fitTextInBox } from '../textLayout.ts';
import { CanvasDimensionSpec, SAFE_CONTENT_CENTER_X, SAFE_CONTENT_WIDTH, SAFE_MARGIN_LEFT } from '../constants.ts';
import { getBundledOfficialLogoDataUrl, isPlaceholderOrEmptyBrandValue } from '../../bundledTechSvgs.ts';
import { drawRowSlide } from './renderRow.ts';

/**
 * Archetype: Subject Pair (Before to After, A vs B, X Migrates to Y)
 *
 * Hard Rules Enforced:
 * 1. Never renders placeholders ("System A", "System B", "PIPELINE MIGRATION", or hardcoded defaults).
 *    If beforeSystem or afterSystem is empty or placeholder, falls back immediately to drawRowSlide.
 * 2. Max 2 official third-party logos per slide (slots BEFORE & AFTER), each max 14% of slide width (151px at 1080px).
 * 3. Story owner (e.g. Discord, Stripe, Cloudflare) rendered as styled typography wordmark when present, hidden when empty.
 * 4. Chat bubbles + database stack only drawn when creativeMotif === 'chat-to-db' (messaging + storage stories);
 *    all other system migrations/comparisons draw a clean directional vector flow stream.
 * 5. All labels strictly >= 24px at 1080px width.
 */
export async function drawSubjectPairSlide(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  options: VisualSystemOptions,
  spec: CanvasDimensionSpec
): Promise<number> {
  const sp = slide.subjectPair;
  if (
    !sp ||
    isPlaceholderOrEmptyBrandValue(sp.beforeSystem) ||
    isPlaceholderOrEmptyBrandValue(sp.afterSystem)
  ) {
    return drawRowSlide(ctx, slide, theme, options, 0);
  }

  const cardX = SAFE_MARGIN_LEFT;
  const cardY = 240;
  const cardW = SAFE_CONTENT_WIDTH;
  const cardH = 540;
  const radius = 32;

  // 1. Ambient Glow behind card
  ctx.save();
  const pairGlow = ctx.createRadialGradient(
    cardX + cardW / 2,
    cardY + cardH / 2,
    20,
    cardX + cardW / 2,
    cardY + cardH / 2,
    cardW / 1.6
  );
  pairGlow.addColorStop(0, `${theme.accent}1E`);
  pairGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = pairGlow;
  ctx.fillRect(cardX - 30, cardY - 30, cardW + 60, cardH + 60);
  ctx.restore();

  // 2. Main Card Surface & Crisp Border
  drawRoundRect(ctx, cardX, cardY, cardW, cardH, radius, theme.surface, theme.surfaceBorder, 2);

  // 3. Top Accent Line along Card Border
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, cardY);
  ctx.lineTo(cardX + cardW - radius - 10, cardY);
  ctx.stroke();
  ctx.restore();

  // 4. Story Owner Context Strip (only rendered when storyOwner is a real non-empty brand)
  const storyOwner = (sp.storyOwner || '').trim();
  const hasStoryOwner = Boolean(storyOwner) && !isPlaceholderOrEmptyBrandValue(storyOwner);
  if (hasStoryOwner) {
    const wordmarkText = `◆ ${storyOwner.toUpperCase()} ARCHITECTURE CASE`;
    ctx.save();
    ctx.font = '800 24px "Plus Jakarta Sans", monospace';
    const textW = ctx.measureText(wordmarkText).width;
    const badgeW = Math.min(cardW - 72, textW + 40);
    const badgeH = 42;
    const badgeX = SAFE_CONTENT_CENTER_X - badgeW / 2;
    const badgeY = cardY + 22;

    drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 10, `${theme.accent}16`, `${theme.accent}48`, 1.4);

    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(wordmarkText, SAFE_CONTENT_CENTER_X, badgeY + badgeH / 2 + 1);
    ctx.restore();
  }

  // Check whether bottom flowLabel is present and non-placeholder
  const rawFlowLabel = (sp.flowLabel || '').trim();
  const hasFlowLabel = Boolean(rawFlowLabel) && !isPlaceholderOrEmptyBrandValue(rawFlowLabel);

  // 5. Container Dimensions for BEFORE vs AFTER (auto-expanded to fill card cleanly)
  const panelY = hasStoryOwner ? cardY + 80 : cardY + 42;
  const panelH = hasFlowLabel
    ? hasStoryOwner
      ? 368
      : 406
    : hasStoryOwner
    ? 426
    : 456;
  const panelW = 292;
  const leftX = cardX + 32;
  const rightX = cardX + cardW - 32 - panelW;

  // 5a. Left Container: BEFORE (Dimmed Slate Surface)
  drawRoundRect(ctx, leftX, panelY, panelW, panelH, 22, 'rgba(148, 163, 184, 0.08)', 'rgba(148, 163, 184, 0.34)', 1.6);

  // Left Top Badge: "BEFORE" (>= 24px)
  const beforeLabelText = (
    sp.beforeLabel && !isPlaceholderOrEmptyBrandValue(sp.beforeLabel) ? sp.beforeLabel : 'BEFORE'
  ).toUpperCase();
  ctx.save();
  ctx.font = '800 24px "Plus Jakarta Sans", monospace';
  const beforeBadgeTextW = ctx.measureText(beforeLabelText).width;
  const beforeBadgeW = beforeBadgeTextW + 32;
  const beforeBadgeH = 40;
  const beforeBadgeX = leftX + panelW / 2 - beforeBadgeW / 2;
  const beforeBadgeY = panelY + 20;
  drawRoundRect(ctx, beforeBadgeX, beforeBadgeY, beforeBadgeW, beforeBadgeH, 10, 'rgba(148, 163, 184, 0.16)', 'rgba(148, 163, 184, 0.42)', 1.2);
  ctx.fillStyle = '#CBD5E1';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(beforeLabelText, leftX + panelW / 2, beforeBadgeY + beforeBadgeH / 2 + 1);
  ctx.restore();

  // 5b. Right Container: AFTER (Highlighted Theme Accent Surface)
  drawRoundRect(ctx, rightX, panelY, panelW, panelH, 22, `${theme.accent}16`, theme.accent, 2.2);

  // Right Top Badge: "AFTER" (>= 24px)
  const afterLabelText = (
    sp.afterLabel && !isPlaceholderOrEmptyBrandValue(sp.afterLabel) ? sp.afterLabel : 'AFTER'
  ).toUpperCase();
  ctx.save();
  ctx.font = '800 24px "Plus Jakarta Sans", monospace';
  const afterBadgeTextW = ctx.measureText(afterLabelText).width;
  const afterBadgeW = afterBadgeTextW + 32;
  const afterBadgeH = 40;
  const afterBadgeX = rightX + panelW / 2 - afterBadgeW / 2;
  const afterBadgeY = panelY + 20;
  drawRoundRect(ctx, afterBadgeX, afterBadgeY, afterBadgeW, afterBadgeH, 10, `${theme.accent}26`, theme.accent, 1.4);
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(afterLabelText, rightX + panelW / 2, afterBadgeY + afterBadgeH / 2 + 1);
  ctx.restore();

  // 6. Hard IP Constraint: Logo Width Capped strictly <= 14% of slide width (<= 151px on 1080w)
  const maxAllowedLogoPx = Math.floor(spec.width * 0.14); // 151px on 1080
  const requestedPct = Math.max(8, Math.min(14, sp.logoWidthPct ?? 12));
  const rawLogoSize = Math.floor(spec.width * (requestedPct / 100));
  const logoSize = Math.min(maxAllowedLogoPx, Math.min(140, rawLogoSize));
  const logoTopY = Math.round(panelY + (panelH - logoSize) / 2 - 10);

  // 7. Render BEFORE System (Unedited SVG Logo OR Styled Text Fallback)
  const beforeSystemName = sp.beforeSystem.trim();
  const beforeKey = sp.beforeLogoKey || beforeSystemName.toLowerCase();
  const beforeLogoDataUrl = !sp.beforeAsText
    ? getBundledOfficialLogoDataUrl(beforeKey, { colorMode: sp.colorMode || 'official' })
    : null;

  if (beforeLogoDataUrl) {
    const beforeImg = await loadIconImage(beforeLogoDataUrl, theme.accent);
    const bImgX = Math.round(leftX + (panelW - logoSize) / 2);
    safeDrawImage(ctx, beforeImg, bImgX, logoTopY, logoSize, logoSize);
  } else {
    // Styled text fallback badge (>= 24px)
    const textBadgeH = 76;
    const textBadgeY = logoTopY + Math.round((logoSize - textBadgeH) / 2);
    drawRoundRect(ctx, leftX + 22, textBadgeY, panelW - 44, textBadgeH, 14, 'rgba(148, 163, 184, 0.14)', 'rgba(148, 163, 184, 0.38)', 1.5);
    ctx.save();
    const fitBeforeBadge = fitTextInBox(ctx, beforeSystemName.toUpperCase(), panelW - 64, 28, '"Plus Jakarta Sans", sans-serif', '800', {
      minFontSize: 24,
      ellipsis: false,
    });
    ctx.font = `800 ${Math.max(24, fitBeforeBadge.fontSize)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#CBD5E1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitBeforeBadge.lines[0] || beforeSystemName.toUpperCase(), leftX + panelW / 2, textBadgeY + textBadgeH / 2);
    ctx.restore();
  }

  // System Label below Before Slot (>= 24px)
  ctx.save();
  const fitBeforeSystem = fitTextInBox(
    ctx,
    beforeSystemName,
    panelW - 28,
    28,
    '"Plus Jakarta Sans", sans-serif',
    '700',
    { minFontSize: 24, ellipsis: false }
  );
  ctx.font = `700 ${Math.max(24, fitBeforeSystem.fontSize)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#CBD5E1';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitBeforeSystem.lines[0] || beforeSystemName, leftX + panelW / 2, panelY + panelH - 28);
  ctx.restore();

  // 8. Render AFTER System (Unedited SVG Logo OR Styled Text Fallback)
  const afterSystemName = sp.afterSystem.trim();
  const afterKey = sp.afterLogoKey || afterSystemName.toLowerCase();
  const afterLogoDataUrl = !sp.afterAsText
    ? getBundledOfficialLogoDataUrl(afterKey, { colorMode: sp.colorMode || 'official' })
    : null;

  if (afterLogoDataUrl) {
    const afterImg = await loadIconImage(afterLogoDataUrl, theme.accent);
    const aImgX = Math.round(rightX + (panelW - logoSize) / 2);
    safeDrawImage(ctx, afterImg, aImgX, logoTopY, logoSize, logoSize);
  } else {
    // Styled text fallback badge (>= 24px)
    const textBadgeH = 76;
    const textBadgeY = logoTopY + Math.round((logoSize - textBadgeH) / 2);
    drawRoundRect(ctx, rightX + 22, textBadgeY, panelW - 44, textBadgeH, 14, `${theme.accent}22`, theme.accent, 2);
    ctx.save();
    const fitAfterBadge = fitTextInBox(ctx, afterSystemName.toUpperCase(), panelW - 64, 28, '"Plus Jakarta Sans", sans-serif', '800', {
      minFontSize: 24,
      ellipsis: false,
    });
    ctx.font = `800 ${Math.max(24, fitAfterBadge.fontSize)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = theme.textWhite;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitAfterBadge.lines[0] || afterSystemName.toUpperCase(), rightX + panelW / 2, textBadgeY + textBadgeH / 2);
    ctx.restore();
  }

  // System Label below After Slot (>= 24px)
  ctx.save();
  const fitAfterSystem = fitTextInBox(
    ctx,
    afterSystemName,
    panelW - 28,
    28,
    '"Plus Jakarta Sans", sans-serif',
    '800',
    { minFontSize: 24, ellipsis: false }
  );
  ctx.font = `800 ${Math.max(24, fitAfterSystem.fontSize)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = theme.textWhite;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitAfterSystem.lines[0] || afterSystemName, rightX + panelW / 2, panelY + panelH - 28);
  ctx.restore();

  // 9. Procedural Marrok-Drawn Creative Layer between containers
  const bridgeStartX = leftX + panelW + 10;
  const bridgeEndX = rightX - 10;
  const bridgeMidY = panelY + panelH / 2;

  ctx.save();

  if (sp.creativeMotif === 'chat-to-db') {
    // 9A. Messaging + Storage motif: generic chat bubbles compressing into a glowing Marrok database stack
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = `${theme.accent}66`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bridgeStartX + 2, bridgeMidY);
    ctx.lineTo(bridgeEndX - 24, bridgeMidY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead pointing right into the destination
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.moveTo(bridgeEndX - 24, bridgeMidY - 7);
    ctx.lineTo(bridgeEndX - 8, bridgeMidY);
    ctx.lineTo(bridgeEndX - 24, bridgeMidY + 7);
    ctx.closePath();
    ctx.fill();

    // Generic Rounded Chat Bubbles stream (procedural Marrok vector art, NO company mascots)
    const bubbles = [
      { x: bridgeStartX + 8, y: bridgeMidY - 52, w: 36, h: 24, r: 6, lines: 2 },
      { x: bridgeStartX + 36, y: bridgeMidY + 26, w: 32, h: 21, r: 5, lines: 2 },
      { x: bridgeStartX + 60, y: bridgeMidY - 34, w: 28, h: 18, r: 4, lines: 1 },
      { x: bridgeStartX + 80, y: bridgeMidY + 12, w: 24, h: 15, r: 4, lines: 1 },
    ];

    for (const b of bubbles) {
      ctx.save();
      drawRoundRect(ctx, b.x, b.y, b.w, b.h, b.r, `${theme.accent}26`, `${theme.accent}80`, 1.2);
      ctx.fillStyle = `${theme.accent}26`;
      ctx.strokeStyle = `${theme.accent}80`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(b.x + 6, b.y + b.h);
      ctx.lineTo(b.x + 3, b.y + b.h + 4);
      ctx.lineTo(b.x + 10, b.y + b.h);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = `${theme.accent}AA`;
      ctx.lineWidth = 1.5;
      if (b.lines >= 1) {
        ctx.beginPath();
        ctx.moveTo(b.x + 6, b.y + Math.round(b.h * 0.45));
        ctx.lineTo(b.x + b.w - 6, b.y + Math.round(b.h * 0.45));
        ctx.stroke();
      }
      if (b.lines >= 2) {
        ctx.beginPath();
        ctx.moveTo(b.x + 6, b.y + Math.round(b.h * 0.72));
        ctx.lineTo(b.x + b.w - 10, b.y + Math.round(b.h * 0.72));
        ctx.stroke();
      }
      ctx.restore();
    }

    // Glowing Database Stack Glyph (receiving converged stream)
    const dbW = 36;
    const dbH = 40;
    const dbX = bridgeEndX - 44;
    const dbY = bridgeMidY - dbH / 2;
    const dbCx = dbX + dbW / 2;

    ctx.save();
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = theme.accent;
    ctx.fillStyle = `${theme.accent}33`;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.ellipse(dbCx, dbY + 30, dbW / 2, 6, 0, 0, Math.PI);
    ctx.lineTo(dbX, dbY + 22);
    ctx.ellipse(dbCx, dbY + 22, dbW / 2, 6, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(dbCx, dbY + 18, dbW / 2, 6, 0, 0, Math.PI);
    ctx.lineTo(dbX, dbY + 10);
    ctx.ellipse(dbCx, dbY + 10, dbW / 2, 6, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(dbCx, dbY + 8, dbW / 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  } else {
    // 9B. Clean Directional Vector Stream (for non-chat system migrations/comparisons — zero chat bubbles or DB cylinders)
    const offsets = [-24, 0, 24];
    for (const dy of offsets) {
      ctx.save();
      ctx.setLineDash(dy === 0 ? [] : [6, 6]);
      ctx.strokeStyle = dy === 0 ? theme.accent : `${theme.accent}55`;
      ctx.lineWidth = dy === 0 ? 3 : 1.8;
      ctx.beginPath();
      ctx.moveTo(bridgeStartX + 4, bridgeMidY + dy);
      ctx.lineTo(bridgeEndX - 18, bridgeMidY + dy);
      ctx.stroke();
      ctx.restore();
    }

    // Glowing vector pulse nodes along the central axis
    for (const frac of [0.28, 0.56]) {
      const px = bridgeStartX + Math.round((bridgeEndX - bridgeStartX) * frac);
      ctx.save();
      ctx.fillStyle = theme.accent;
      ctx.shadowColor = theme.accent;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(px, bridgeMidY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Crisp arrowhead pointing right into AFTER panel
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.moveTo(bridgeEndX - 24, bridgeMidY - 10);
    ctx.lineTo(bridgeEndX - 4, bridgeMidY);
    ctx.lineTo(bridgeEndX - 24, bridgeMidY + 10);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();

  // 10. Bottom Flow Caption Strip (only drawn when flowLabel is present and non-placeholder, >= 24px)
  if (hasFlowLabel) {
    const flowLabelUpper = rawFlowLabel.toUpperCase();
    ctx.save();
    const fitFlow = fitTextInBox(
      ctx,
      flowLabelUpper,
      cardW - 80,
      24,
      '"Plus Jakarta Sans", monospace',
      '800',
      { minFontSize: 24, ellipsis: false }
    );
    ctx.font = `800 ${Math.max(24, fitFlow.fontSize)}px "Plus Jakarta Sans", monospace`;
    const flowText = fitFlow.lines[0] || flowLabelUpper;
    const flowW = Math.min(cardW - 64, ctx.measureText(flowText).width + 48);
    const flowH = 46;
    const flowX = SAFE_CONTENT_CENTER_X - flowW / 2;
    const flowY = cardY + cardH - 62;

    drawRoundRect(ctx, flowX, flowY, flowW, flowH, 12, `${theme.accent}16`, `${theme.accent}55`, 1.5);

    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(flowText, SAFE_CONTENT_CENTER_X, flowY + flowH / 2 + 1);
    ctx.restore();
  }

  return cardY + cardH;
}

