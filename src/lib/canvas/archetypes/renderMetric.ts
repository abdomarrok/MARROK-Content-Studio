import { SlideData, ThemePalette, VisualSystemOptions } from '../../../types.ts';
import { loadIconImage, drawTintedImage } from '../imageLoader.ts';
import { drawRoundRect } from '../background.ts';
import { fitTextInBox } from '../textLayout.ts';
import { SAFE_CONTENT_CENTER_X, SAFE_CONTENT_WIDTH, SAFE_MARGIN_LEFT } from '../constants.ts';
import { resolveSmartSlideVisuals } from '../../synthesis/smartVisualDefaults.ts';

/**
 * Archetype 3: Metric Card (Benchmark, Speedup, Resource ROI)
 * Renders hero statistic value, sparkline curve, gauge ticks, and delta pill.
 */
export async function drawMetricSlide(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  options: VisualSystemOptions
): Promise<number> {
  const cardX = SAFE_MARGIN_LEFT;
  const cardY = 240;
  const cardW = SAFE_CONTENT_WIDTH;
  const cardH = 430;
  const radius = 32;

  // 1. Soft ambient glow behind metric card
  ctx.save();
  const metricGlow = ctx.createRadialGradient(
    cardX + cardW / 2,
    cardY + cardH / 2,
    30,
    cardX + cardW / 2,
    cardY + cardH / 2,
    cardW / 1.8
  );
  metricGlow.addColorStop(0, `${theme.accent}1A`);
  metricGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = metricGlow;
  ctx.fillRect(cardX - 30, cardY - 30, cardW + 60, cardH + 60);
  ctx.restore();

  // 2. Card background & crisp 2px border
  drawRoundRect(ctx, cardX, cardY, cardW, cardH, radius, theme.surface, theme.surfaceBorder, 2);

  // 3. Top accent neon line along upper card border
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, cardY);
  ctx.lineTo(cardX + cardW - radius - 10, cardY);
  ctx.stroke();
  ctx.restore();

  // 4. Header Row: Metric Icon Badge + Real Source Term Label (>=24px)
  const smart = resolveSmartSlideVisuals(slide, 1, false);
  const iconBadgeSize = 48;
  const iconBadgeX = cardX + 36;
  const iconBadgeY = cardY + 28;
  drawRoundRect(ctx, iconBadgeX, iconBadgeY, iconBadgeSize, iconBadgeSize, 14, `${theme.accent}22`, `${theme.accent}55`, 1.5);

  const mIcon = slide.metricIcon || smart.metricIcon || 'zap';
  const iconImg = await loadIconImage(mIcon, theme.accent);
  drawTintedImage(ctx, iconImg, iconBadgeX + 10, iconBadgeY + 10, 28, 28, theme.accent);

  const rawMetricLabel = slide.metricLabel || smart.metricLabel || 'SYSTEM BENCHMARK';
  const cleanMetricLabel = /EXPOSURE\s+METRIC/i.test(rawMetricLabel)
    ? smart.metricLabel || 'RESPONSE DELAY'
    : rawMetricLabel.toUpperCase();
  const metricLabelX = iconBadgeX + iconBadgeSize + 16;
  ctx.save();
  const fitMetricLabel = fitTextInBox(
    ctx,
    cleanMetricLabel,
    cardX + cardW - metricLabelX - 32,
    24,
    '"Plus Jakarta Sans", monospace',
    '700',
    { minFontSize: 24, ellipsis: false }
  );
  ctx.font = `700 ${Math.max(24, fitMetricLabel.fontSize)}px "Plus Jakarta Sans", monospace`;
  ctx.fillStyle = theme.microLabel;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitMetricLabel.lines[0] || cleanMetricLabel, metricLabelX, iconBadgeY + iconBadgeSize / 2);
  ctx.restore();

  // 5. Before (struck-through) + Giant After Hero Value (always the win!)
  const metricVal = slide.metricValue || smart.metricValue || '10x';
  const beforeVal = (slide.metricBeforeValue || smart.metricBeforeValue || '').trim();
  const heroY = cardY + 178;

  ctx.save();
  if (beforeVal && beforeVal.toLowerCase() !== metricVal.toLowerCase()) {
    // Draw small struck-through old value + arrow + huge new value
    const beforeFontSize = 46;
    const afterFontSize = metricVal.length > 7 ? 88 : 112;

    ctx.font = `700 ${beforeFontSize}px "Plus Jakarta Sans", sans-serif`;
    const beforeW = ctx.measureText(beforeVal).width;

    ctx.font = `800 38px "Plus Jakarta Sans", sans-serif`;
    const arrowText = '  →  ';
    const arrowW = ctx.measureText(arrowText).width;

    ctx.font = `900 ${afterFontSize}px "Plus Jakarta Sans", sans-serif`;
    const afterW = ctx.measureText(metricVal).width;

    const totalW = beforeW + arrowW + afterW;
    const startX = SAFE_CONTENT_CENTER_X - totalW / 2;

    // 5a. Old "before" value in muted slate with red strike-through line
    ctx.font = `700 ${beforeFontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const beforeY = heroY - 14;
    ctx.fillText(beforeVal, startX, beforeY);

    ctx.beginPath();
    ctx.strokeStyle = '#F43F5E';
    ctx.lineWidth = 4;
    ctx.moveTo(startX - 4, beforeY - beforeFontSize * 0.32);
    ctx.lineTo(startX + beforeW + 4, beforeY - beforeFontSize * 0.32);
    ctx.stroke();

    // 5b. Arrow separator
    ctx.font = `800 38px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = theme.accent;
    ctx.fillText(arrowText, startX + beforeW, beforeY - 4);

    // 5c. Huge "after" win value
    ctx.font = `900 ${afterFontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = theme.textWhite;
    ctx.shadowColor = `${theme.accent}50`;
    ctx.shadowBlur = 12;
    ctx.fillText(metricVal, startX + beforeW + arrowW, heroY);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  } else {
    const valFontSize = metricVal.length > 8 ? 86 : metricVal.length > 5 ? 104 : 120;
    const fitMetricVal = fitTextInBox(
      ctx,
      metricVal,
      cardW - 100,
      valFontSize,
      '"Plus Jakarta Sans", sans-serif',
      '900',
      { minFontSize: 64, ellipsis: false }
    );
    ctx.font = `900 ${fitMetricVal.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = theme.textWhite;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = `${theme.accent}50`;
    ctx.shadowBlur = 12;
    ctx.fillText(fitMetricVal.lines[0] || metricVal, SAFE_CONTENT_CENTER_X, heroY);
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }
  ctx.restore();

  // 6. Data-Integrity Chart: Direction matches the message (downward for drops/cuts, upward for gains, bar for comparisons, none when no data)
  const rawDiffText = slide.metricDiff || smart.metricDiff || '▲ Measurable architectural speedup';
  const cleanDiffText = /Dropping\s+Exposure/i.test(rawDiffText)
    ? smart.metricDiff || '8x FASTER RESPONSE'
    : rawDiffText;

  const combinedMsg = `${slide.enTitle || ''} ${slide.enBody || ''} ${cleanDiffText}`;
  const isDropMessage =
    slide.chartDirection === 'down' ||
    smart.chartDirection === 'down' ||
    (!slide.chartDirection &&
      /\b(?:drop(?:ping|ped|s)?|slashed|cut(?:ting)?|reduc(?:ed|ing|tion)|lower(?:ed|ing)?|faster\s+response|from\s+\d+\s*ms\s+to\s+\d+\s*ms)\b/i.test(
        combinedMsg
      ));
  const chartDir = slide.chartDirection || (isDropMessage ? 'down' : smart.chartDirection || 'up');

  if (options.showSparklines && chartDir !== 'none') {
    const meterStartX = cardX + 56;
    const meterEndX = cardX + cardW - 56;
    const meterW = meterEndX - meterStartX;
    const baseY = cardY + 318;
    const peakY = cardY + 232;

    ctx.save();
    if (chartDir === 'bar') {
      // Before / After Horizontal Comparison Bars (>=24px labels)
      const barY1 = cardY + 232;
      const barY2 = cardY + 278;
      drawRoundRect(ctx, meterStartX, barY1, meterW * 0.88, 30, 8, 'rgba(148, 163, 184, 0.22)', 'rgba(148, 163, 184, 0.45)', 1.2);
      drawRoundRect(ctx, meterStartX, barY2, meterW * 0.28, 30, 8, `${theme.accent}33`, theme.accent, 1.8);
    } else {
      const startY = chartDir === 'down' ? peakY : baseY;
      const endY = chartDir === 'down' ? baseY - 10 : peakY;
      const cp1Y = chartDir === 'down' ? peakY + 8 : baseY - 4;
      const cp2Y = chartDir === 'down' ? baseY - 16 : peakY + 18;

      const curveGrad = ctx.createLinearGradient(0, peakY, 0, baseY);
      curveGrad.addColorStop(0, `${theme.accent}26`);
      curveGrad.addColorStop(1, `${theme.accent}00`);

      ctx.beginPath();
      ctx.moveTo(meterStartX, startY);
      ctx.bezierCurveTo(
        meterStartX + meterW * 0.42,
        cp1Y,
        meterStartX + meterW * 0.68,
        cp2Y,
        meterEndX,
        endY
      );
      ctx.lineTo(meterEndX, baseY);
      ctx.lineTo(meterStartX, baseY);
      ctx.closePath();
      ctx.fillStyle = curveGrad;
      ctx.fill();

      // Sparkline Stroke with restrained glow
      ctx.beginPath();
      ctx.moveTo(meterStartX, startY);
      ctx.bezierCurveTo(
        meterStartX + meterW * 0.42,
        cp1Y,
        meterStartX + meterW * 0.68,
        cp2Y,
        meterEndX,
        endY
      );
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = theme.accent;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      // Start & End node circles
      ctx.beginPath();
      ctx.arc(meterStartX, startY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#94A3B8';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(meterEndX, endY, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = theme.accent;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(meterEndX, endY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#081216';
      ctx.fill();

      // Gauge Baseline Axis (Step 6: 12px BASELINE / 50% / PEAK // P99 labels deleted so all text is >=24px)
      ctx.beginPath();
      ctx.strokeStyle = `${theme.accent}40`;
      ctx.lineWidth = 1.5;
      ctx.moveTo(meterStartX, baseY);
      ctx.lineTo(meterEndX, baseY);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 7. Plain-Language Outcome Badge Pill (>=24px)
  const isPositive =
    /[▲+]|faster|speedup|drop|lower|saved|cut|gain|reduction|reduced|boost|zero|0\s*(unauthenticated|vulnerabilit|breach|downtime|unauthorized|exploit|error|packet|leak|fail)|mitigat|eliminat|filter|secur|protect|sub-m/i.test(
      cleanDiffText
    );
  const isNegative =
    (/[▼-]|latency spike|bottleneck|regression|exploit/i.test(cleanDiffText) && !isPositive);

  const deltaAccent = isPositive ? '#10B981' : isNegative ? '#F43F5E' : theme.accent;
  const deltaBg = isPositive ? 'rgba(16, 185, 129, 0.14)' : isNegative ? 'rgba(244, 63, 94, 0.14)' : `${theme.accent}20`;
  const deltaBorder = isPositive ? 'rgba(16, 185, 129, 0.50)' : isNegative ? 'rgba(244, 63, 94, 0.50)' : `${theme.accent}60`;

  ctx.save();
  const fitDiff = fitTextInBox(
    ctx,
    cleanDiffText,
    720,
    24,
    '"Plus Jakarta Sans", monospace',
    '800',
    { minFontSize: 24, ellipsis: false }
  );
  ctx.font = `800 ${Math.max(24, fitDiff.fontSize)}px "Plus Jakarta Sans", monospace`;
  const diffLabel = fitDiff.lines[0] || cleanDiffText;
  const diffMetrics = ctx.measureText(diffLabel);
  const pillW = Math.min(diffMetrics.width + 52, 768);
  const pillH = 50;
  const pillX = SAFE_CONTENT_CENTER_X - pillW / 2;
  const pillY = cardY + cardH - 66;
  drawRoundRect(ctx, pillX, pillY, pillW, pillH, 25, deltaBg, deltaBorder, 1.5);

  ctx.fillStyle = deltaAccent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(diffLabel, SAFE_CONTENT_CENTER_X, pillY + pillH / 2);
  ctx.restore();

  return 670;
}
