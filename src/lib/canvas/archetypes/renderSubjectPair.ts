import { SlideData, ThemePalette, VisualSystemOptions } from '../../../types.ts';
import { loadIconImage, safeDrawImage } from '../imageLoader.ts';
import { drawRoundRect } from '../background.ts';
import { fitTextInBox } from '../textLayout.ts';
import { CanvasDimensionSpec, SAFE_CONTENT_CENTER_X, SAFE_CONTENT_WIDTH, SAFE_MARGIN_LEFT } from '../constants.ts';
import { getBundledOfficialLogoDataUrl } from '../../bundledTechSvgs.ts';

/**
 * Archetype: Subject Pair (Before → After, A vs B, X Migrates to Y)
 *
 * Hard Rules Enforced:
 * 1. Max 2 official third-party logos per slide (slots BEFORE & AFTER).
 * 2. Story owner (e.g. Discord) rendered as styled typography wordmark (zero third-party icon, saving slots for the two systems).
 * 3. Each logo strictly <= 14% of slide width (<= 151px on 1080w), verbatim unedited SVG geometry.
 * 4. Procedural Marrok-drawn creative layer: stream of generic rounded chat bubbles (no mascots)
 *    compressing along subtle motion flow lines into a glowing Marrok database stack glyph.
 * 5. All labels (BEFORE, AFTER, system names, wordmark, flow caption) strictly >= 24px.
 */
export async function drawSubjectPairSlide(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  _options: VisualSystemOptions,
  spec: CanvasDimensionSpec
): Promise<number> {
  const cardX = SAFE_MARGIN_LEFT;
  const cardY = 240;
  const cardW = SAFE_CONTENT_WIDTH;
  const cardH = 490;
  const radius = 32;

  const sp = slide.subjectPair || {
    beforeSystem: 'Cassandra',
    afterSystem: 'ScyllaDB',
    beforeLogoKey: 'apachecassandra',
    afterLogoKey: 'scylladb',
    beforeLabel: 'BEFORE',
    afterLabel: 'AFTER',
    storyOwner: 'Discord',
    storyOwnerMode: 'text',
    colorMode: 'official',
    logoWidthPct: 11,
    creativeMotif: 'chat-to-db',
    flowLabel: 'CHAT WORKLOAD → COMPACTED SHARDS',
  };

  // 1. Ambient Glow behind card
  ctx.save();
  const pairGlow = ctx.createRadialGradient(
    cardX + cardW / 2,
    cardY + cardH / 2,
    20,
    cardX + cardW / 2,
    cardY + cardH / 2,
    cardW / 1.7
  );
  pairGlow.addColorStop(0, `${theme.accent}1A`);
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

  // 4. Story Owner Context Strip (3-Brand Case: Story Owner rendered as styled text wordmark)
  const storyOwner = (sp.storyOwner || '').trim();
  const hasStoryOwner = Boolean(storyOwner);
  if (hasStoryOwner) {
    const wordmarkText = `◆ ${storyOwner.toUpperCase()} ARCHITECTURE CASE`;
    ctx.save();
    ctx.font = '800 24px "Plus Jakarta Sans", monospace';
    const textW = ctx.measureText(wordmarkText).width;
    const badgeW = Math.min(cardW - 80, textW + 36);
    const badgeH = 38;
    const badgeX = SAFE_CONTENT_CENTER_X - badgeW / 2;
    const badgeY = cardY + 22;

    drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 10, `${theme.accent}14`, `${theme.accent}45`, 1.2);

    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(wordmarkText, SAFE_CONTENT_CENTER_X, badgeY + badgeH / 2 + 1);
    ctx.restore();
  }

  // 5. Container Dimensions for BEFORE vs AFTER
  const panelY = hasStoryOwner ? cardY + 74 : cardY + 44;
  const panelH = 264;
  const panelW = 286;
  const leftX = cardX + 32;
  const rightX = cardX + cardW - 32 - panelW;

  // 5a. Left Container: BEFORE (Dimmed Slate Surface)
  drawRoundRect(ctx, leftX, panelY, panelW, panelH, 20, 'rgba(148, 163, 184, 0.08)', 'rgba(148, 163, 184, 0.32)', 1.5);

  // Left Top Badge: "BEFORE" (>= 24px)
  const beforeLabelText = (sp.beforeLabel || 'BEFORE').toUpperCase();
  ctx.save();
  ctx.font = '800 24px "Plus Jakarta Sans", monospace';
  const beforeBadgeTextW = ctx.measureText(beforeLabelText).width;
  const beforeBadgeW = beforeBadgeTextW + 28;
  const beforeBadgeH = 36;
  const beforeBadgeX = leftX + panelW / 2 - beforeBadgeW / 2;
  const beforeBadgeY = panelY + 16;
  drawRoundRect(ctx, beforeBadgeX, beforeBadgeY, beforeBadgeW, beforeBadgeH, 10, 'rgba(148, 163, 184, 0.16)', 'rgba(148, 163, 184, 0.40)', 1);
  ctx.fillStyle = '#CBD5E1';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(beforeLabelText, leftX + panelW / 2, beforeBadgeY + beforeBadgeH / 2 + 1);
  ctx.restore();

  // 5b. Right Container: AFTER (Highlighted Theme Accent Surface)
  drawRoundRect(ctx, rightX, panelY, panelW, panelH, 20, `${theme.accent}14`, theme.accent, 2);

  // Right Top Badge: "AFTER" (>= 24px)
  const afterLabelText = (sp.afterLabel || 'AFTER').toUpperCase();
  ctx.save();
  ctx.font = '800 24px "Plus Jakarta Sans", monospace';
  const afterBadgeTextW = ctx.measureText(afterLabelText).width;
  const afterBadgeW = afterBadgeTextW + 28;
  const afterBadgeH = 36;
  const afterBadgeX = rightX + panelW / 2 - afterBadgeW / 2;
  const afterBadgeY = panelY + 16;
  drawRoundRect(ctx, afterBadgeX, afterBadgeY, afterBadgeW, afterBadgeH, 10, `${theme.accent}24`, theme.accent, 1.2);
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(afterLabelText, rightX + panelW / 2, afterBadgeY + afterBadgeH / 2 + 1);
  ctx.restore();

  // 6. Hard IP Constraint: Logo Width Capped strictly <= 14% of slide width (<= 151px on 1080w)
  const maxAllowedLogoPx = Math.floor(spec.width * 0.14); // 151px on 1080
  const requestedPct = Math.max(8, Math.min(14, sp.logoWidthPct ?? 11));
  const rawLogoSize = Math.floor(spec.width * (requestedPct / 100));
  const logoSize = Math.min(maxAllowedLogoPx, Math.min(130, rawLogoSize));
  const logoTopY = panelY + 68;

  // 7. Render BEFORE System (Unedited SVG Logo OR Styled Text Fallback)
  const beforeSystemName = (sp.beforeSystem || 'Cassandra').trim();
  const beforeKey = sp.beforeLogoKey || beforeSystemName.toLowerCase();
  const useBeforeLogo = !sp.beforeAsText && Boolean(beforeKey);

  if (useBeforeLogo) {
    const logoDataUrl = getBundledOfficialLogoDataUrl(beforeKey, {
      colorMode: sp.colorMode || 'official',
    });
    const beforeImg = await loadIconImage(logoDataUrl || beforeKey, theme.accent);
    const bImgX = Math.round(leftX + (panelW - logoSize) / 2);
    safeDrawImage(ctx, beforeImg, bImgX, logoTopY, logoSize, logoSize);
  } else {
    // Styled text fallback badge (>= 24px)
    const textBadgeH = 68;
    const textBadgeY = logoTopY + (logoSize - textBadgeH) / 2;
    drawRoundRect(ctx, leftX + 24, textBadgeY, panelW - 48, textBadgeH, 14, 'rgba(148, 163, 184, 0.12)', 'rgba(148, 163, 184, 0.35)', 1.5);
    ctx.save();
    ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#CBD5E1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(beforeSystemName.toUpperCase(), leftX + panelW / 2, textBadgeY + textBadgeH / 2);
    ctx.restore();
  }

  // System Label below Before Slot (>= 24px)
  ctx.save();
  const fitBeforeSystem = fitTextInBox(
    ctx,
    beforeSystemName,
    panelW - 32,
    26,
    '"Plus Jakarta Sans", sans-serif',
    '700',
    { minFontSize: 24, ellipsis: false }
  );
  ctx.font = `700 ${Math.max(24, fitBeforeSystem.fontSize)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#CBD5E1';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitBeforeSystem.lines[0] || beforeSystemName, leftX + panelW / 2, panelY + panelH - 24);
  ctx.restore();

  // 8. Render AFTER System (Unedited SVG Logo OR Styled Text Fallback)
  const afterSystemName = (sp.afterSystem || 'ScyllaDB').trim();
  const afterKey = sp.afterLogoKey || afterSystemName.toLowerCase();
  const useAfterLogo = !sp.afterAsText && Boolean(afterKey);

  if (useAfterLogo) {
    const logoDataUrl = getBundledOfficialLogoDataUrl(afterKey, {
      colorMode: sp.colorMode || 'official',
    });
    const afterImg = await loadIconImage(logoDataUrl || afterKey, theme.accent);
    const aImgX = Math.round(rightX + (panelW - logoSize) / 2);
    safeDrawImage(ctx, afterImg, aImgX, logoTopY, logoSize, logoSize);
  } else {
    // Styled text fallback badge (>= 24px)
    const textBadgeH = 68;
    const textBadgeY = logoTopY + (logoSize - textBadgeH) / 2;
    drawRoundRect(ctx, rightX + 24, textBadgeY, panelW - 48, textBadgeH, 14, `${theme.accent}20`, theme.accent, 2);
    ctx.save();
    ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = theme.textWhite;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(afterSystemName.toUpperCase(), rightX + panelW / 2, textBadgeY + textBadgeH / 2);
    ctx.restore();
  }

  // System Label below After Slot (>= 24px)
  ctx.save();
  const fitAfterSystem = fitTextInBox(
    ctx,
    afterSystemName,
    panelW - 32,
    26,
    '"Plus Jakarta Sans", sans-serif',
    '800',
    { minFontSize: 24, ellipsis: false }
  );
  ctx.font = `800 ${Math.max(24, fitAfterSystem.fontSize)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = theme.textWhite;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitAfterSystem.lines[0] || afterSystemName, rightX + panelW / 2, panelY + panelH - 24);
  ctx.restore();

  // 9. Procedural Marrok-Drawn Creative Layer between containers:
  // Stream of generic rounded chat bubbles (strictly abstract geometric chat shapes, NO mascots)
  // flowing left-to-right along subtle motion flow lines and compressing into a glowing Marrok database stack glyph.
  const bridgeStartX = leftX + panelW + 12;
  const bridgeEndX = rightX - 12;
  const bridgeMidY = panelY + panelH / 2 - 8;

  ctx.save();

  // 9a. Subtle Motion Flow Lines & Directional Arrow
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

  // 9b. Generic Rounded Chat Bubbles stream (procedural Marrok vector art, NO company mascots)
  const bubbles = [
    { x: bridgeStartX + 10, y: bridgeMidY - 46, w: 34, h: 22, r: 6, lines: 2 },
    { x: bridgeStartX + 38, y: bridgeMidY + 24, w: 30, h: 20, r: 5, lines: 2 },
    { x: bridgeStartX + 62, y: bridgeMidY - 32, w: 26, h: 17, r: 4, lines: 1 },
    { x: bridgeStartX + 82, y: bridgeMidY + 12, w: 22, h: 14, r: 4, lines: 1 },
  ];

  for (const b of bubbles) {
    ctx.save();
    // Chat bubble plate
    drawRoundRect(ctx, b.x, b.y, b.w, b.h, b.r, `${theme.accent}26`, `${theme.accent}80`, 1.2);

    // Tiny speech tail at bottom-left
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

    // Procedural text lines inside chat bubble
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

  // 9c. Glowing Database Stack Glyph (receiving converged stream)
  const dbW = 36;
  const dbH = 40;
  const dbX = bridgeEndX - 44;
  const dbY = bridgeMidY - dbH / 2;
  const dbCx = dbX + dbW / 2;

  // DB Glow
  ctx.save();
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = theme.accent;
  ctx.fillStyle = `${theme.accent}33`;
  ctx.lineWidth = 2;

  // Layer 3 (Bottom cylinder)
  ctx.beginPath();
  ctx.ellipse(dbCx, dbY + 30, dbW / 2, 6, 0, 0, Math.PI);
  ctx.lineTo(dbX, dbY + 22);
  ctx.ellipse(dbCx, dbY + 22, dbW / 2, 6, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Layer 2 (Middle cylinder)
  ctx.beginPath();
  ctx.ellipse(dbCx, dbY + 18, dbW / 2, 6, 0, 0, Math.PI);
  ctx.lineTo(dbX, dbY + 10);
  ctx.ellipse(dbCx, dbY + 10, dbW / 2, 6, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Layer 1 (Top cap ellipse)
  ctx.beginPath();
  ctx.ellipse(dbCx, dbY + 8, dbW / 2, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();

  // 10. Bottom Flow Caption Strip (inside card, >= 24px)
  const rawFlowLabel = (sp.flowLabel || 'CHAT WORKLOAD → COMPACTED SHARDS').toUpperCase();
  ctx.save();
  const fitFlow = fitTextInBox(
    ctx,
    rawFlowLabel,
    cardW - 80,
    24,
    '"Plus Jakarta Sans", monospace',
    '800',
    { minFontSize: 24, ellipsis: false }
  );
  ctx.font = `800 ${Math.max(24, fitFlow.fontSize)}px "Plus Jakarta Sans", monospace`;
  const flowText = fitFlow.lines[0] || rawFlowLabel;
  const flowW = Math.min(cardW - 64, ctx.measureText(flowText).width + 48);
  const flowH = 46;
  const flowX = SAFE_CONTENT_CENTER_X - flowW / 2;
  const flowY = cardY + cardH - 58;

  drawRoundRect(ctx, flowX, flowY, flowW, flowH, 12, `${theme.accent}14`, `${theme.accent}55`, 1.5);

  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(flowText, SAFE_CONTENT_CENTER_X, flowY + flowH / 2 + 1);
  ctx.restore();

  return 670;
}
