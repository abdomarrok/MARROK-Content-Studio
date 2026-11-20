import type {
  SlideData,
  SlideVisualSpec,
  ThemePalette,
  VisualSystemOptions,
} from '../../../types.ts';
import { drawRoundRect } from '../background.ts';
import { SAFE_CONTENT_CENTER_X, SAFE_CONTENT_WIDTH, SAFE_MARGIN_LEFT } from '../constants.ts';
import { loadWebImage, safeDrawImage } from '../imageLoader.ts';
import { buildThemedSvgBlueprint } from '../svgBlueprint.ts';
import { fitTextInBox } from '../textLayout.ts';
import { deriveVisualSpecFromSlide } from '../../synthesis/visualSpecBuilder.ts';

const CARD_X = SAFE_MARGIN_LEFT;
const CARD_Y = 240;
const CARD_W = SAFE_CONTENT_WIDTH;
const CARD_H = 490;
const CARD_RADIUS = 28;

const FONT_SANS = '"Plus Jakarta Sans", sans-serif';
const FONT_MONO = '"JetBrains Mono", monospace';

function drawCardFrame(
  ctx: CanvasRenderingContext2D,
  theme: ThemePalette,
  spec: SlideVisualSpec,
  options?: { rightBadge?: string }
): { innerX: number; innerTop: number; innerW: number; innerBottom: number } {
  // Subtle ambient radial glow
  ctx.save();
  const glow = ctx.createRadialGradient(
    CARD_X + CARD_W / 2,
    CARD_Y + CARD_H / 2,
    30,
    CARD_X + CARD_W / 2,
    CARD_Y + CARD_H / 2,
    CARD_W / 1.7
  );
  glow.addColorStop(0, `${theme.accent}16`);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(CARD_X - 24, CARD_Y - 24, CARD_W + 48, CARD_H + 48);
  ctx.restore();

  // Single-elevation flat dark surface with crisp 2px border
  drawRoundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, CARD_RADIUS, theme.surface, theme.surfaceBorder, 2);

  // Subtle top neon hairline
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2;
  ctx.moveTo(CARD_X + CARD_RADIUS + 8, CARD_Y);
  ctx.lineTo(CARD_X + CARD_W - CARD_RADIUS - 8, CARD_Y);
  ctx.stroke();
  ctx.restore();

  const innerX = CARD_X + 34;
  const innerW = CARD_W - 68;
  let innerTop = CARD_Y + 30;
  let innerBottom = CARD_Y + CARD_H - 26;

  // Optional header row (eyebrow + optional right delta badge)
  const eyebrow = (spec.eyebrow || '').trim().toUpperCase();
  const headerTitle = (spec.title || '').trim();
  const rightBadge = (options?.rightBadge || '').trim();

  if (eyebrow || rightBadge) {
    ctx.save();
    let badgeReservedW = 0;
    if (rightBadge) {
      ctx.font = `700 20px ${FONT_MONO}`;
      const badgeW = Math.min(280, ctx.measureText(rightBadge).width + 26);
      const badgeH = 34;
      const badgeX = innerX + innerW - badgeW;
      const badgeY = innerTop - 4;
      drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 8, `${theme.accent}1A`, `${theme.accent}66`, 1.2);
      ctx.fillStyle = theme.accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rightBadge.slice(0, 26), badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);
      badgeReservedW = badgeW + 16;
    }

    if (eyebrow) {
      const fitEye = fitTextInBox(ctx, eyebrow, innerW - badgeReservedW, 20, FONT_MONO, '700', {
        maxLines: 1,
        minFontSize: 16,
        ellipsis: true,
      });
      ctx.font = `700 ${fitEye.fontSize}px ${FONT_MONO}`;
      ctx.fillStyle = theme.accent;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(fitEye.lines[0] || eyebrow, innerX, innerTop);
    }
    ctx.restore();
    innerTop += 34;
  }

  if (headerTitle && spec.kind !== 'callout') {
    ctx.save();
    const fitTitle = fitTextInBox(ctx, headerTitle, innerW, 26, FONT_SANS, '800', {
      maxLines: 1,
      minFontSize: 20,
      ellipsis: true,
    });
    ctx.font = `800 ${fitTitle.fontSize}px ${FONT_SANS}`;
    ctx.fillStyle = theme.textWhite;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(fitTitle.lines[0] || headerTitle, innerX, innerTop);
    ctx.restore();
    innerTop += fitTitle.fontSize + 14;

    // Hairline separator
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = `${theme.surfaceBorder}`;
    ctx.lineWidth = 1;
    ctx.moveTo(innerX, innerTop - 4);
    ctx.lineTo(innerX + innerW, innerTop - 4);
    ctx.stroke();
    ctx.restore();
    innerTop += 8;
  }

  // Optional bottom footnote strip
  const footnote = (spec.footnote || '').trim();
  if (footnote) {
    ctx.save();
    const footY = CARD_Y + CARD_H - 34;
    ctx.beginPath();
    ctx.strokeStyle = `${theme.surfaceBorder}`;
    ctx.lineWidth = 1;
    ctx.moveTo(innerX, footY - 12);
    ctx.lineTo(innerX + innerW, footY - 12);
    ctx.stroke();

    const fitFoot = fitTextInBox(ctx, footnote, innerW, 18, FONT_MONO, '500', {
      maxLines: 1,
      minFontSize: 15,
      ellipsis: true,
    });
    ctx.font = `500 ${fitFoot.fontSize}px ${FONT_MONO}`;
    ctx.fillStyle = theme.textMuted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitFoot.lines[0] || footnote, innerX, footY + 6);
    ctx.restore();
    innerBottom = footY - 22;
  }

  return { innerX, innerTop, innerW, innerBottom };
}

function drawBarChart(
  ctx: CanvasRenderingContext2D,
  spec: SlideVisualSpec,
  theme: ThemePalette
) {
  const { innerX, innerTop, innerW, innerBottom } = drawCardFrame(ctx, theme, spec, {
    rightBadge: spec.deltaBadge,
  });

  const bars = (spec.bars || []).slice(0, 6);
  if (bars.length === 0) return;

  const maxAbs = Math.max(...bars.map((b) => Math.abs(b.value || 0)), 1);
  const availH = Math.max(140, innerBottom - innerTop);
  const orientation = spec.orientation || 'horizontal';

  if (orientation === 'vertical') {
    const colGap = 18;
    const colW = Math.floor((innerW - colGap * (bars.length - 1)) / bars.length);
    const labelZoneH = 54;
    const valueZoneH = 34;
    const plotTop = innerTop + valueZoneH;
    const plotBottom = innerBottom - labelZoneH;
    const plotH = Math.max(90, plotBottom - plotTop);

    // Horizontal reference grid lines
    ctx.save();
    ctx.strokeStyle = `${theme.surfaceBorder}`;
    ctx.lineWidth = 1;
    for (let g = 0; g <= 3; g += 1) {
      const gy = plotBottom - (plotH * g) / 3;
      ctx.beginPath();
      ctx.moveTo(innerX, gy);
      ctx.lineTo(innerX + innerW, gy);
      ctx.stroke();
    }
    ctx.restore();

    bars.forEach((bar, i) => {
      const bx = innerX + i * (colW + colGap);
      const ratio = Math.max(0.08, Math.min(1, Math.abs(bar.value) / maxAbs));
      const bh = Math.round(plotH * ratio);
      const by = plotBottom - bh;
      const isAccent = bar.isWinner || bar.tone === 'accent';
      const isAlert = bar.tone === 'alert';
      const fill = isAlert ? `${theme.alert}38` : isAccent ? `${theme.accent}35` : 'rgba(148,163,184,0.18)';
      const stroke = isAlert ? theme.alert : isAccent ? theme.accent : 'rgba(148,163,184,0.45)';

      drawRoundRect(ctx, bx + 8, by, Math.max(24, colW - 16), bh, 10, fill, stroke, isAccent || isAlert ? 2 : 1.5);

      const valText = bar.displayValue || `${bar.value}${spec.unit || ''}`;
      ctx.save();
      ctx.font = `800 22px ${FONT_MONO}`;
      ctx.fillStyle = isAlert ? theme.alert : isAccent ? theme.accent : theme.textWhite;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(valText.slice(0, 14), bx + colW / 2, by - 8);

      const fitLbl = fitTextInBox(ctx, bar.label, colW, 20, FONT_SANS, '700', {
        maxLines: 2,
        minFontSize: 16,
        lineHeightFactor: 1.15,
        ellipsis: true,
      });
      ctx.font = `700 ${fitLbl.fontSize}px ${FONT_SANS}`;
      ctx.fillStyle = isAccent ? theme.textWhite : theme.textEnBody;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      fitLbl.lines.forEach((ln, li) => {
        ctx.fillText(ln, bx + colW / 2, plotBottom + 10 + li * fitLbl.lineHeight);
      });
      ctx.restore();
    });
    return;
  }

  // Horizontal benchmark bars (clean left label, full track, tabular monospace right value)
  const rowGap = bars.length >= 5 ? 10 : 14;
  const rowH = Math.min(64, Math.floor((availH - rowGap * (bars.length - 1)) / bars.length));
  const labelW = Math.min(230, Math.round(innerW * 0.3));
  const valueW = 148;
  const trackX = innerX + labelW + 14;
  const trackW = Math.max(160, innerW - labelW - valueW - 28);

  bars.forEach((bar, i) => {
    const ry = innerTop + i * (rowH + rowGap);
    const barH = Math.min(34, Math.max(24, rowH - 12));
    const barY = ry + Math.round((rowH - barH) / 2);
    const ratio = Math.max(0.06, Math.min(1, Math.abs(bar.value) / maxAbs));
    const fillW = Math.max(18, Math.round(trackW * ratio));

    const isAccent = bar.isWinner || bar.tone === 'accent';
    const isAlert = bar.tone === 'alert';
    const fillColor = isAlert
      ? `${theme.alert}38`
      : isAccent
      ? `${theme.accent}36`
      : 'rgba(148, 163, 184, 0.22)';
    const strokeColor = isAlert
      ? theme.alert
      : isAccent
      ? theme.accent
      : 'rgba(148, 163, 184, 0.45)';

    // Track background
    drawRoundRect(ctx, trackX, barY, trackW, barH, 8, 'rgba(255,255,255,0.03)', `${theme.surfaceBorder}`, 1);
    // Value bar
    drawRoundRect(ctx, trackX, barY, fillW, barH, 8, fillColor, strokeColor, isAccent || isAlert ? 2 : 1.2);

    // Left series label
    ctx.save();
    const fitLbl = fitTextInBox(ctx, bar.label, labelW, 22, FONT_SANS, isAccent ? '800' : '600', {
      maxLines: 1,
      minFontSize: 17,
      ellipsis: true,
    });
    ctx.font = `${isAccent ? '800' : '600'} ${fitLbl.fontSize}px ${FONT_SANS}`;
    ctx.fillStyle = isAccent ? theme.textWhite : theme.textEnBody;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitLbl.lines[0] || bar.label, innerX, ry + rowH / 2);

    // Right tabular monospace figure
    const valText = bar.displayValue || `${bar.value}${spec.unit || ''}`;
    const fitVal = fitTextInBox(ctx, valText, valueW, 23, FONT_MONO, '800', {
      maxLines: 1,
      minFontSize: 18,
      ellipsis: true,
    });
    ctx.font = `800 ${fitVal.fontSize}px ${FONT_MONO}`;
    ctx.fillStyle = isAlert ? theme.alert : isAccent ? theme.accent : theme.textWhite;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitVal.lines[0] || valText, innerX + innerW, ry + rowH / 2);
    ctx.restore();
  });
}

function drawSequenceDiagram(
  ctx: CanvasRenderingContext2D,
  spec: SlideVisualSpec,
  theme: ThemePalette
) {
  const { innerX, innerTop, innerW, innerBottom } = drawCardFrame(ctx, theme, spec);
  const actors = (spec.actors && spec.actors.length >= 2 ? spec.actors : ['Client', 'Service', 'Store']).slice(0, 4);
  const steps = (spec.steps || []).slice(0, 6);

  const actorBoxW = Math.min(188, Math.floor((innerW - (actors.length - 1) * 18) / actors.length));
  const actorBoxH = 48;
  const actorCenters = actors.map((_, idx) => {
    if (actors.length === 1) return innerX + innerW / 2;
    const span = innerW - actorBoxW;
    return innerX + actorBoxW / 2 + (span * idx) / (actors.length - 1);
  });

  // 1. Vertical lifelines
  const lineStartY = innerTop + actorBoxH;
  const lineEndY = innerBottom - 8;
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = `${theme.surfaceBorder}`;
  ctx.lineWidth = 2;
  for (const cx of actorCenters) {
    ctx.beginPath();
    ctx.moveTo(cx, lineStartY);
    ctx.lineTo(cx, lineEndY);
    ctx.stroke();
  }
  ctx.restore();

  // 2. Actor header boxes
  actors.forEach((actor, idx) => {
    const cx = actorCenters[idx];
    const bx = cx - actorBoxW / 2;
    const isPrimary = idx === 1 || (actors.length === 2 && idx === 1);
    drawRoundRect(
      ctx,
      bx,
      innerTop,
      actorBoxW,
      actorBoxH,
      12,
      isPrimary ? `${theme.accent}1A` : theme.baseBg,
      isPrimary ? theme.accent : theme.surfaceBorder,
      isPrimary ? 2 : 1.5
    );
    ctx.save();
    const fitActor = fitTextInBox(ctx, actor, actorBoxW - 18, 20, FONT_SANS, '800', {
      maxLines: 1,
      minFontSize: 15,
      ellipsis: true,
    });
    ctx.font = `800 ${fitActor.fontSize}px ${FONT_SANS}`;
    ctx.fillStyle = isPrimary ? theme.accent : theme.textWhite;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitActor.lines[0] || actor, cx, innerTop + actorBoxH / 2 + 1);
    ctx.restore();
  });

  // 3. Numbered message arrows
  if (steps.length === 0) return;
  const usableH = Math.max(120, lineEndY - lineStartY - 20);
  const stepSpacing = usableH / steps.length;

  steps.forEach((step, idx) => {
    const fromIdx = Math.max(0, Math.min(actors.length - 1, step.from));
    const toIdx = Math.max(0, Math.min(actors.length - 1, step.to));
    const y = lineStartY + 26 + idx * stepSpacing + Math.min(18, stepSpacing * 0.25);
    const x1 = actorCenters[fromIdx];
    const x2 = actorCenters[toIdx];
    const isAlert = step.style === 'alert';
    const isDashed = step.style === 'dashed';
    const color = isAlert ? theme.alert : isDashed ? theme.textMuted : theme.accent;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.4;
    if (isDashed) ctx.setLineDash([7, 5]);

    if (fromIdx === toIdx) {
      // Self-call loop
      const loopW = 54;
      const loopH = 22;
      ctx.beginPath();
      ctx.moveTo(x1, y - loopH / 2);
      ctx.lineTo(x1 + loopW, y - loopH / 2);
      ctx.lineTo(x1 + loopW, y + loopH / 2);
      ctx.lineTo(x1 + 6, y + loopH / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1 + 2, y + loopH / 2);
      ctx.lineTo(x1 + 14, y + loopH / 2 - 6);
      ctx.lineTo(x1 + 14, y + loopH / 2 + 6);
      ctx.closePath();
      ctx.fill();
    } else {
      const dir = x2 > x1 ? 1 : -1;
      const startX = x1 + dir * 6;
      const endX = x2 - dir * 8;
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();

      // Arrowhead
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(endX + dir * 4, y);
      ctx.lineTo(endX - dir * 10, y - 7);
      ctx.lineTo(endX - dir * 10, y + 7);
      ctx.closePath();
      ctx.fill();

      // Origin node dot
      ctx.beginPath();
      ctx.arc(x1, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Step label centered above arrow
    const labelMidX = fromIdx === toIdx ? x1 + 92 : (x1 + x2) / 2;
    const maxLblW = fromIdx === toIdx ? 180 : Math.max(150, Math.abs(x2 - x1) - 20);
    const fullLabel = `${idx + 1}. ${step.label}${step.tag ? ` (${step.tag})` : ''}`;
    const fitStep = fitTextInBox(ctx, fullLabel, maxLblW, 19, FONT_MONO, '700', {
      maxLines: 1,
      minFontSize: 14,
      ellipsis: true,
    });
    const text = fitStep.lines[0] || fullLabel;
    ctx.font = `700 ${fitStep.fontSize}px ${FONT_MONO}`;
    const textW = ctx.measureText(text).width + 14;
    drawRoundRect(ctx, labelMidX - textW / 2, y - 28, textW, 24, 6, theme.surface, 'transparent', 0);
    ctx.fillStyle = isAlert ? theme.alert : theme.textWhite;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, labelMidX, y - 16);
    ctx.restore();
  });
}

function drawTimeline(
  ctx: CanvasRenderingContext2D,
  spec: SlideVisualSpec,
  theme: ThemePalette
) {
  const { innerX, innerTop, innerW, innerBottom } = drawCardFrame(ctx, theme, spec);
  const events = (spec.events || []).slice(0, 5);
  if (events.length === 0) return;

  const availH = Math.max(160, innerBottom - innerTop);
  const rowH = Math.floor(availH / events.length);
  const timeColW = 132;
  const spineX = innerX + timeColW + 26;
  const contentX = spineX + 30;
  const contentW = innerX + innerW - contentX;

  // Vertical timeline spine
  const firstCy = innerTop + rowH / 2;
  const lastCy = innerTop + (events.length - 1) * rowH + rowH / 2;
  if (events.length > 1) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = `${theme.surfaceBorder}`;
    ctx.lineWidth = 3;
    ctx.moveTo(spineX, firstCy);
    ctx.lineTo(spineX, lastCy);
    ctx.stroke();
    ctx.restore();
  }

  events.forEach((ev, idx) => {
    const ry = innerTop + idx * rowH;
    const cy = ry + rowH / 2;
    const severity = ev.severity || 'info';
    const nodeColor =
      severity === 'incident'
        ? '#F43F5E'
        : severity === 'warn'
        ? '#F59E0B'
        : severity === 'resolved'
        ? '#10B981'
        : theme.accent;

    // Hairline divider between rows
    if (idx > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.moveTo(contentX, ry);
      ctx.lineTo(innerX + innerW, ry);
      ctx.stroke();
      ctx.restore();
    }

    // Left tabular monospace timestamp
    ctx.save();
    const fitTime = fitTextInBox(ctx, ev.time, timeColW, 20, FONT_MONO, '800', {
      maxLines: 1,
      minFontSize: 15,
      ellipsis: true,
    });
    ctx.font = `800 ${fitTime.fontSize}px ${FONT_MONO}`;
    ctx.fillStyle = nodeColor;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitTime.lines[0] || ev.time, innerX + timeColW, cy);
    ctx.restore();

    // Node ring & dot on spine
    ctx.save();
    ctx.beginPath();
    ctx.arc(spineX, cy, 11, 0, Math.PI * 2);
    ctx.fillStyle = theme.surface;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = nodeColor;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(spineX, cy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = nodeColor;
    ctx.fill();
    ctx.restore();

    // Right event title + optional impact detail
    ctx.save();
    const hasDetail = Boolean((ev.detail || '').trim());
    const titleY = hasDetail ? cy - 13 : cy;
    const fitTitle = fitTextInBox(ctx, ev.title, contentW, 22, FONT_SANS, '800', {
      maxLines: 1,
      minFontSize: 17,
      ellipsis: true,
    });
    ctx.font = `800 ${fitTitle.fontSize}px ${FONT_SANS}`;
    ctx.fillStyle = theme.textWhite;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitTitle.lines[0] || ev.title, contentX, titleY);

    if (hasDetail) {
      const fitDetail = fitTextInBox(ctx, ev.detail!, contentW, 18, FONT_SANS, '500', {
        maxLines: 1,
        minFontSize: 15,
        ellipsis: true,
      });
      ctx.font = `500 ${fitDetail.fontSize}px ${FONT_SANS}`;
      ctx.fillStyle = theme.textMuted;
      ctx.fillText(fitDetail.lines[0] || ev.detail!, contentX, cy + 14);
    }
    ctx.restore();
  });
}

function drawMatrix(
  ctx: CanvasRenderingContext2D,
  spec: SlideVisualSpec,
  theme: ThemePalette
) {
  const { innerX, innerTop, innerW, innerBottom } = drawCardFrame(ctx, theme, spec);
  const quadrants = spec.quadrants || [];

  const axisTopH = 26;
  const axisBottomH = 32;
  const gridTop = innerTop + axisTopH;
  const gridBottom = innerBottom - axisBottomH;
  const gridH = Math.max(160, gridBottom - gridTop);
  const gap = 14;
  const cellW = Math.floor((innerW - gap) / 2);
  const cellH = Math.floor((gridH - gap) / 2);

  // Y-axis top label
  ctx.save();
  ctx.font = `700 16px ${FONT_MONO}`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`▲ ${(spec.yAxisHigh || 'HIGH IMPACT').toUpperCase()}`, innerX + innerW / 2, innerTop);
  ctx.restore();

  // 4 Quadrant cards (0: top-left, 1: top-right, 2: bottom-left, 3: bottom-right)
  for (let i = 0; i < 4; i += 1) {
    const q = quadrants[i] || { title: `Quadrant ${i + 1}`, detail: '' };
    const col = i % 2;
    const row = Math.floor(i / 2);
    const qx = innerX + col * (cellW + gap);
    const qy = gridTop + row * (cellH + gap);
    const isHighlight = Boolean(q.highlight);

    drawRoundRect(
      ctx,
      qx,
      qy,
      cellW,
      cellH,
      16,
      isHighlight ? `${theme.accent}18` : theme.baseBg,
      isHighlight ? theme.accent : theme.surfaceBorder,
      isHighlight ? 2 : 1.4
    );

    ctx.save();
    const fitQTitle = fitTextInBox(ctx, q.title, cellW - 32, 22, FONT_SANS, '800', {
      maxLines: 2,
      minFontSize: 17,
      lineHeightFactor: 1.2,
      ellipsis: true,
    });
    ctx.font = `800 ${fitQTitle.fontSize}px ${FONT_SANS}`;
    ctx.fillStyle = isHighlight ? theme.accent : theme.textWhite;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let textCursorY = qy + 18;
    fitQTitle.lines.forEach((ln) => {
      ctx.fillText(ln, qx + 18, textCursorY);
      textCursorY += fitQTitle.lineHeight;
    });

    if (q.detail) {
      const fitDetail = fitTextInBox(ctx, q.detail, cellW - 32, 18, FONT_SANS, '500', {
        maxLines: 2,
        minFontSize: 15,
        lineHeightFactor: 1.25,
        ellipsis: true,
      });
      ctx.font = `500 ${fitDetail.fontSize}px ${FONT_SANS}`;
      ctx.fillStyle = isHighlight ? theme.textWhite : theme.textMuted;
      textCursorY += 6;
      fitDetail.lines.forEach((ln) => {
        if (textCursorY + fitDetail.fontSize <= qy + cellH - 10) {
          ctx.fillText(ln, qx + 18, textCursorY);
          textCursorY += fitDetail.lineHeight;
        }
      });
    }
    ctx.restore();
  }

  // Bottom X-axis endpoints
  ctx.save();
  ctx.font = `700 16px ${FONT_MONO}`;
  ctx.fillStyle = theme.textMuted;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillText(`◀ ${(spec.xAxisLow || 'LOW').toUpperCase()}`, innerX, innerBottom);
  ctx.textAlign = 'right';
  ctx.fillStyle = theme.accent;
  ctx.fillText(`${(spec.xAxisHigh || 'HIGH').toUpperCase()} ▶`, innerX + innerW, innerBottom);
  ctx.restore();
}

function drawComparisonTable(
  ctx: CanvasRenderingContext2D,
  spec: SlideVisualSpec,
  theme: ThemePalette
) {
  const { innerX, innerTop, innerW, innerBottom } = drawCardFrame(ctx, theme, spec);
  const columns = (spec.columns && spec.columns.length >= 2 ? spec.columns : ['Dimension', 'Baseline', 'Target']).slice(0, 4);
  const rows = (spec.rows || []).slice(0, 5);
  const highlightCol = typeof spec.highlightColumn === 'number' ? spec.highlightColumn : -1;

  const colCount = columns.length;
  const firstColW = Math.round(innerW * (colCount === 2 ? 0.45 : colCount === 3 ? 0.32 : 0.28));
  const otherColW = Math.floor((innerW - firstColW) / Math.max(1, colCount - 1));
  const colWidths = columns.map((_, i) => (i === 0 ? firstColW : otherColW));
  const colXs: number[] = [];
  let accX = innerX;
  for (const w of colWidths) {
    colXs.push(accX);
    accX += w;
  }

  const headerH = 48;
  const bodyTop = innerTop + headerH;
  const availBodyH = Math.max(120, innerBottom - bodyTop);
  const rowH = rows.length > 0 ? Math.min(68, Math.floor(availBodyH / rows.length)) : 56;
  const tableTotalH = headerH + rowH * rows.length;

  // Highlight column backdrop
  if (highlightCol >= 0 && highlightCol < colCount) {
    drawRoundRect(
      ctx,
      colXs[highlightCol] + 2,
      innerTop,
      colWidths[highlightCol] - 4,
      tableTotalH,
      12,
      `${theme.accent}14`,
      `${theme.accent}44`,
      1.2
    );
  }

  // Header band
  drawRoundRect(ctx, innerX, innerTop, innerW, headerH, 10, 'rgba(255,255,255,0.04)', `${theme.surfaceBorder}`, 1);

  columns.forEach((col, cIdx) => {
    const isHi = cIdx === highlightCol;
    ctx.save();
    const fitCol = fitTextInBox(ctx, col.toUpperCase(), colWidths[cIdx] - 20, 18, FONT_MONO, '800', {
      maxLines: 1,
      minFontSize: 14,
      ellipsis: true,
    });
    ctx.font = `800 ${fitCol.fontSize}px ${FONT_MONO}`;
    ctx.fillStyle = isHi ? theme.accent : theme.textMuted;
    ctx.textAlign = cIdx === 0 ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    const tx = cIdx === 0 ? colXs[cIdx] + 14 : colXs[cIdx] + colWidths[cIdx] - 14;
    ctx.fillText(fitCol.lines[0] || col.toUpperCase(), tx, innerTop + headerH / 2 + 1);
    ctx.restore();
  });

  // Data rows
  rows.forEach((row, rIdx) => {
    const ry = bodyTop + rIdx * rowH;
    if (rIdx > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.moveTo(innerX + 4, ry);
      ctx.lineTo(innerX + innerW - 4, ry);
      ctx.stroke();
      ctx.restore();
    }

    columns.forEach((_, cIdx) => {
      const cellText = (row[cIdx] || '—').trim();
      const isHi = cIdx === highlightCol;
      const looksNumeric = /^[$€£+-]?\d/.test(cellText);
      const fontFamily = cIdx > 0 && looksNumeric ? FONT_MONO : FONT_SANS;
      ctx.save();
      const fitCell = fitTextInBox(
        ctx,
        cellText,
        colWidths[cIdx] - 20,
        20,
        fontFamily,
        isHi || cIdx === 0 ? '700' : '500',
        { maxLines: 2, minFontSize: 15, lineHeightFactor: 1.18, ellipsis: true }
      );
      ctx.font = `${isHi || cIdx === 0 ? '700' : '500'} ${fitCell.fontSize}px ${fontFamily}`;
      ctx.fillStyle = isHi ? theme.textWhite : cIdx === 0 ? theme.textWhite : theme.textEnBody;
      ctx.textAlign = cIdx === 0 ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      const tx = cIdx === 0 ? colXs[cIdx] + 14 : colXs[cIdx] + colWidths[cIdx] - 14;
      const startY = ry + rowH / 2 - ((fitCell.lines.length - 1) * fitCell.lineHeight) / 2;
      fitCell.lines.forEach((ln, li) => {
        ctx.fillText(ln, tx, startY + li * fitCell.lineHeight);
      });
      ctx.restore();
    });
  });
}

function drawEditorialCallout(
  ctx: CanvasRenderingContext2D,
  spec: SlideVisualSpec,
  theme: ThemePalette
) {
  // Zero thick border-l-4 accent bars — clean editorial typography, hairline divider & source stamp
  const { innerX, innerTop, innerW, innerBottom } = drawCardFrame(ctx, theme, spec);
  const isStat = spec.calloutStyle === 'stat' && Boolean((spec.statValue || '').trim());

  let cursorY = innerTop + 6;

  if (isStat) {
    const statVal = (spec.statValue || '').trim();
    ctx.save();
    const fitStat = fitTextInBox(ctx, statVal, innerW, 92, FONT_MONO, '800', {
      maxLines: 1,
      minFontSize: 54,
      ellipsis: false,
    });
    ctx.font = `800 ${fitStat.fontSize}px ${FONT_MONO}`;
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(fitStat.lines[0] || statVal, innerX, cursorY);
    cursorY += fitStat.fontSize + 10;

    if (spec.statLabel) {
      const fitLbl = fitTextInBox(ctx, spec.statLabel.toUpperCase(), innerW, 22, FONT_MONO, '700', {
        maxLines: 1,
        minFontSize: 17,
        ellipsis: true,
      });
      ctx.font = `700 ${fitLbl.fontSize}px ${FONT_MONO}`;
      ctx.fillStyle = theme.textMuted;
      ctx.fillText(fitLbl.lines[0] || spec.statLabel.toUpperCase(), innerX, cursorY);
      cursorY += fitLbl.fontSize + 16;
    }

    if (spec.quote) {
      const fitDesc = fitTextInBox(ctx, spec.quote, innerW, 26, FONT_SANS, '600', {
        maxLines: 3,
        minFontSize: 20,
        lineHeightFactor: 1.32,
        ellipsis: true,
      });
      ctx.font = `600 ${fitDesc.fontSize}px ${FONT_SANS}`;
      ctx.fillStyle = theme.textWhite;
      fitDesc.lines.forEach((ln) => {
        ctx.fillText(ln, innerX, cursorY);
        cursorY += fitDesc.lineHeight;
      });
    }
    ctx.restore();
  } else {
    // Editorial Quotation Layout
    ctx.save();
    ctx.font = '800 84px Georgia, serif';
    ctx.fillStyle = `${theme.accent}55`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('“', innerX - 4, cursorY - 18);
    ctx.restore();

    const quoteText = (spec.quote || spec.title || '').trim();
    if (quoteText) {
      ctx.save();
      const fitQuote = fitTextInBox(ctx, quoteText, innerW - 24, 34, FONT_SANS, '700', {
        maxLines: 5,
        minFontSize: 23,
        lineHeightFactor: 1.34,
        ellipsis: true,
      });
      ctx.font = `700 ${fitQuote.fontSize}px ${FONT_SANS}`;
      ctx.fillStyle = theme.textWhite;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      cursorY += 34;
      fitQuote.lines.forEach((ln) => {
        ctx.fillText(ln, innerX + 8, cursorY);
        cursorY += fitQuote.lineHeight;
      });
      ctx.restore();
    }
  }

  // Attribution & Source footer band (separated by crisp 1px horizontal rule)
  const attrTop = Math.max(cursorY + 14, innerBottom - 74);
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = `${theme.surfaceBorder}`;
  ctx.lineWidth = 1;
  ctx.moveTo(innerX, attrTop);
  ctx.lineTo(innerX + innerW, attrTop);
  ctx.stroke();

  const authorText = [spec.author, spec.role].filter(Boolean).join('  ·  ');
  if (authorText) {
    const fitAuthor = fitTextInBox(ctx, authorText, innerW, 21, FONT_SANS, '700', {
      maxLines: 1,
      minFontSize: 16,
      ellipsis: true,
    });
    ctx.font = `700 ${fitAuthor.fontSize}px ${FONT_SANS}`;
    ctx.fillStyle = theme.textWhite;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(fitAuthor.lines[0] || authorText, innerX, attrTop + 14);
  }

  const evidenceOrSource = spec.source || spec.evidence;
  if (evidenceOrSource) {
    const fitSrc = fitTextInBox(ctx, evidenceOrSource, innerW, 18, FONT_MONO, '500', {
      maxLines: 1,
      minFontSize: 14,
      ellipsis: true,
    });
    ctx.font = `500 ${fitSrc.fontSize}px ${FONT_MONO}`;
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(fitSrc.lines[0] || evidenceOrSource, innerX, attrTop + 44);
  }
  ctx.restore();
}

async function drawCustomSvgBlueprint(
  ctx: CanvasRenderingContext2D,
  spec: SlideVisualSpec,
  theme: ThemePalette
) {
  const built = buildThemedSvgBlueprint(spec.svgCode || '', theme, spec.viewBox);

  if (!built.isValid || !built.dataUrl) {
    const { innerX, innerTop, innerW, innerBottom } = drawCardFrame(ctx, theme, {
      ...spec,
      eyebrow: spec.eyebrow || 'CUSTOM SVG BLUEPRINT',
    });
    ctx.save();
    ctx.font = `700 24px ${FONT_MONO}`;
    ctx.fillStyle = theme.textMuted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      'Paste SVG markup or choose a starter blueprint',
      innerX + innerW / 2,
      (innerTop + innerBottom) / 2
    );
    ctx.restore();
    return;
  }

  // Crisp outer container clip
  drawRoundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, CARD_RADIUS, theme.surface, theme.surfaceBorder, 2);

  const img = await loadWebImage(built.dataUrl);
  if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
    const pad = 10;
    const availW = CARD_W - pad * 2;
    const availH = CARD_H - pad * 2;
    const aspect = img.naturalWidth / img.naturalHeight;
    let drawW = availW;
    let drawH = drawW / aspect;
    if (drawH > availH) {
      drawH = availH;
      drawW = drawH * aspect;
    }
    const dx = CARD_X + (CARD_W - drawW) / 2;
    const dy = CARD_Y + (CARD_H - drawH) / 2;
    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(CARD_X + 2, CARD_Y + 2, CARD_W - 4, CARD_H - 4, CARD_RADIUS - 2);
    } else {
      ctx.rect(CARD_X + 2, CARD_Y + 2, CARD_W - 4, CARD_H - 4);
    }
    ctx.clip();
    safeDrawImage(ctx, img, dx, dy, drawW, drawH);
    ctx.restore();
  } else {
    // Headless / jsdom fallback indicator when Image doesn't rasterize SVG
    ctx.save();
    ctx.font = `700 22px ${FONT_MONO}`;
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.title || 'SVG BLUEPRINT', SAFE_CONTENT_CENTER_X, CARD_Y + CARD_H / 2);
    ctx.restore();
  }
}

/**
 * Universal Visual Engine Renderer (`type: 'visual'`):
 * Projects structured data visuals (`bar-chart`, `sequence`, `timeline`, `matrix`, `table`, `callout`)
 * and sanitized theme-tokenized custom SVG blueprints (`svg`) cleanly onto the MARROK Canvas.
 */
export async function drawVisualSlide(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  _options: VisualSystemOptions,
  slideIndex: number = 0
): Promise<number> {
  const spec = slide.visualSpec || deriveVisualSpecFromSlide(slide, undefined, slideIndex);

  switch (spec.kind) {
    case 'bar-chart':
      drawBarChart(ctx, spec, theme);
      break;
    case 'sequence':
      drawSequenceDiagram(ctx, spec, theme);
      break;
    case 'timeline':
      drawTimeline(ctx, spec, theme);
      break;
    case 'matrix':
      drawMatrix(ctx, spec, theme);
      break;
    case 'table':
      drawComparisonTable(ctx, spec, theme);
      break;
    case 'callout':
      drawEditorialCallout(ctx, spec, theme);
      break;
    case 'svg':
      await drawCustomSvgBlueprint(ctx, spec, theme);
      break;
  }

  return 730;
}
