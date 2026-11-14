import { SlideData, ThemePalette, VisualSystemOptions } from '../../../types.ts';
import { fitTextInBox } from '../textLayout.ts';
import { loadIconImage, drawTintedImage } from '../imageLoader.ts';
import { drawRoundRect } from '../background.ts';
import { resolveSmartSlideVisuals } from '../../synthesis/smartVisualDefaults.ts';

const DEFAULT_ICON_LABELS: Record<string, string> = {
  server: 'SERVICE POD',
  database: 'STORAGE',
  gauge: 'TELEMETRY',
  users: 'IDENTITY',
  robot: 'AI AGENT',
  gitMerge: 'VCS ENGINE',
  cpu: 'EXEC ENGINE',
  box: 'CONTAINER',
  activity: 'HEALTH P99',
  shieldAlert: 'POLICY GATE',
  lock: 'CRYPTO CORE',
  network: 'NETWORK',
  key: 'AUTH / KEY',
  code: 'VIRTUAL FS',
  terminal: 'CLI GATEWAY',
  cloud: 'CLOUD HOST',
  zap: 'LOW LATENCY',
  hardDrive: 'DISK / WAL',
};

/**
 * Archetype 1: Hub (Slide 1 Hero Diagram)
 * Renders center hero box with 5 distinct surrounding orbital satellites, spoke connectors,
 * orbital cause → effect flow arrows, and min 24px readable labels at 1080x1920.
 */
export async function drawHubSlide(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  _options: VisualSystemOptions
): Promise<number> {
  const cx = 540;
  const cy = 600;
  const r = 325;

  const smart = resolveSmartSlideVisuals(slide, 0, false);
  const rawLabels = smart.satLabels && smart.satLabels.length >= 5 ? smart.satLabels : slide.satLabels || smart.satLabels;
  // Default to 5 distinct nodes (or honor up to 5–6 if explicitly supplied)
  const numNodes = rawLabels ? Math.min(5, Math.max(3, rawLabels.length)) : 5;
  const satAngles = Array.from({ length: numNodes }, (_, i) => -90 + (360 / numNodes) * i);

  // 1. Outer orbital circle + directional cause → effect arc arrows between satellite nodes
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = theme.accent + '4D'; // rgba(accent, 0.3)
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Draw directional cause → effect flow chevrons along the orbital ring midpoint between node i and node i+1
  for (let i = 0; i < numNodes; i++) {
    const startDeg = satAngles[i];
    const endDeg = i === numNodes - 1 ? satAngles[0] + 360 : satAngles[i + 1];
    const midDeg = (startDeg + endDeg) / 2;
    const midRad = (midDeg * Math.PI) / 180;
    const mx = cx + r * Math.cos(midRad);
    const my = cy + r * Math.sin(midRad);

    // Highlighted arc segment showing flow direction
    const arcStartRad = ((startDeg + 20) * Math.PI) / 180;
    const arcEndRad = ((endDeg - 20) * Math.PI) / 180;
    if (arcEndRad > arcStartRad) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, arcStartRad, arcEndRad);
      ctx.strokeStyle = `${theme.accent}99`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Tangent arrowhead pointing clockwise (cause → effect flow)
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(midRad + Math.PI / 2);
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Spoke lines radiating through center directly to each active satellite position
  for (const deg of satAngles) {
    const rad = (deg * Math.PI) / 180;
    const x = cx + r * Math.cos(rad);
    const y = cy + r * Math.sin(rad);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.strokeStyle = theme.accent + '4D';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Coordinate crosshairs (+) at the orbital ring tangents
  const tangentCoords = [
    { x: cx + r, y: cy },
    { x: cx - r, y: cy },
    { x: cx, y: cy + r },
    { x: cx, y: cy - r },
  ];
  ctx.strokeStyle = `${theme.accent}80`;
  ctx.lineWidth = 1.5;
  const tArm = 8;
  for (const tc of tangentCoords) {
    ctx.beginPath();
    ctx.moveTo(tc.x - tArm, tc.y);
    ctx.lineTo(tc.x + tArm, tc.y);
    ctx.moveTo(tc.x, tc.y - tArm);
    ctx.lineTo(tc.x, tc.y + tArm);
    ctx.stroke();
  }
  ctx.restore();

  // 2. Clean concentric calibration ring around the 260x260 Center Hero Badge
  ctx.save();
  const calR = 184;
  // Ambient pulse glow behind center hub
  const centerGlow = ctx.createRadialGradient(cx, cy, 60, cx, cy, 230);
  centerGlow.addColorStop(0, `${theme.accent}2E`);
  centerGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = centerGlow;
  ctx.fillRect(cx - 230, cy - 230, 460, 460);

  // Inner calibration circle
  ctx.beginPath();
  ctx.arc(cx, cy, calR, 0, Math.PI * 2);
  ctx.strokeStyle = `${theme.accent}3D`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Outer segmented dashed ring
  ctx.beginPath();
  ctx.arc(cx, cy, calR + 10, 0, Math.PI * 2);
  ctx.strokeStyle = `${theme.accent}26`;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 10]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 12 calibration tick marks at 30° intervals
  ctx.strokeStyle = `${theme.accent}70`;
  ctx.lineWidth = 1.5;
  for (let deg = 0; deg < 360; deg += 30) {
    const rad = (deg * Math.PI) / 180;
    const x1 = cx + (calR - 5) * Math.cos(rad);
    const y1 = cy + (calR - 5) * Math.sin(rad);
    const x2 = cx + (calR + 5) * Math.cos(rad);
    const y2 = cy + (calR + 5) * Math.sin(rad);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();

  // Center Hub Box: 264x264 rounded rect (radius 44) with dark glassmorphic styling
  const centerBoxW = 264;
  const centerBoxH = 264;
  const centerBoxX = cx - centerBoxW / 2;
  const centerBoxY = cy - centerBoxH / 2;
  ctx.save();
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur = 14;
  drawRoundRect(ctx, centerBoxX, centerBoxY, centerBoxW, centerBoxH, 44, '#081216', theme.accent, 2.5);
  ctx.restore();

  // Center Hub Icon: 120x120 in theme.accent (Brand-safe architecture icon, never a third-party logo)
  const centerIconName = smart.centerIcon || slide.centerIcon || 'gitMerge';
  const centerImg = await loadIconImage(centerIconName, theme.accent);
  const iconSize = 120;
  drawTintedImage(ctx, centerImg, cx - iconSize / 2, cy - iconSize / 2 - 18, iconSize, iconSize, theme.accent);

  // Center Core Tag Pill at bottom of center box (min 24px readable typography at 1080x1920)
  const centerText = (smart.centerTag || slide.centerTag || 'SYSTEM CORE').toUpperCase();
  ctx.save();
  const fitCenter = fitTextInBox(
    ctx,
    centerText,
    centerBoxW - 28,
    24,
    '"Plus Jakarta Sans", "JetBrains Mono", sans-serif',
    '800',
    { minFontSize: 24 }
  );
  ctx.font = `800 ${fitCenter.fontSize}px "Plus Jakarta Sans", "JetBrains Mono", sans-serif`;
  const tagMetrics = ctx.measureText(fitCenter.lines[0] || centerText);
  const tagW = Math.max(164, Math.min(centerBoxW - 18, Math.round(tagMetrics.width + 26)));
  drawRoundRect(ctx, cx - tagW / 2, centerBoxY + centerBoxH - 48, tagW, 36, 10, `${theme.accent}22`, `${theme.accent}80`, 1.4);
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitCenter.lines[0] || centerText, cx, centerBoxY + centerBoxH - 30);
  ctx.restore();

  // Satellite Badges with 5 distinct technical labels, step numbers, and min 24px font at 1080x1920
  const satIcons = smart.satIcons && smart.satIcons.length > 0 ? smart.satIcons : slide.satIcons || smart.satIcons;
  const satLabels = rawLabels || smart.satLabels;
  const satW = 228;
  const satH = 132;
  const satIconSize = 48;

  for (let i = 0; i < numNodes; i++) {
    try {
      const rad = (satAngles[i] * Math.PI) / 180;
      const sx = cx + r * Math.cos(rad);
      const sy = cy + r * Math.sin(rad);

      // Glowing connection node at intersection
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, 74, 0, Math.PI * 2);
      ctx.strokeStyle = `${theme.accent}30`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Directional spoke arrow chevrons radiating from center to satellite
      const arrowDist = r * 0.56;
      const ax = cx + arrowDist * Math.cos(rad);
      const ay = cy + arrowDist * Math.sin(rad);
      ctx.translate(ax, ay);
      ctx.rotate(rad);
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, -5);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Dark Glassmorphic Satellite Box
      drawRoundRect(ctx, sx - satW / 2, sy - satH / 2, satW, satH, 22, '#091319', `${theme.accent}85`, 2);

      // Sequence number badge in top-right of satellite (1 → 5 cause/effect order, min 24px)
      ctx.save();
      ctx.font = '800 24px "JetBrains Mono", monospace';
      ctx.fillStyle = `${theme.accent}CC`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`0${i + 1}`, sx + satW / 2 - 14, sy - satH / 2 + 12);
      ctx.restore();

      // Satellite Icon
      const sIconName = satIcons[i % satIcons.length] || 'gitMerge';
      const sImg = await loadIconImage(sIconName, theme.accent);
      drawTintedImage(ctx, sImg, sx - satIconSize / 2, sy - satH / 2 + 14, satIconSize, satIconSize, theme.accent);

      // Crisp Technical Label Pill (min 24px bold font at 1080x1920 for effortless mobile readability)
      const rawLabel = (satLabels[i] || DEFAULT_ICON_LABELS[sIconName] || sIconName.toUpperCase()).trim();
      // Preserve 2-word technical labels up to 16 chars (e.g., "DURABLE OBJECTS", "SPENDING CAPS")
      const shortLabel = rawLabel.length > 16 ? rawLabel.slice(0, 16).trim() : rawLabel;
      const pillW = 214;
      const pillH = 42;
      const pillX = sx - pillW / 2;
      const pillY = sy + satH / 2 - 48;

      drawRoundRect(ctx, pillX, pillY, pillW, pillH, 10, '#060a0d', `${theme.accent}95`, 1.5);
      ctx.save();
      const fitSat = fitTextInBox(
        ctx,
        shortLabel.toUpperCase(),
        pillW - 10,
        24,
        '"Plus Jakarta Sans", "JetBrains Mono", sans-serif',
        '800',
        { minFontSize: 24 }
      );
      ctx.font = `800 ${Math.max(24, fitSat.fontSize)}px "Plus Jakarta Sans", "JetBrains Mono", sans-serif`;
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fitSat.lines[0] || shortLabel.toUpperCase(), sx, pillY + pillH / 2 + 1);
      ctx.restore();
    } catch (satErr) {
      console.warn(`Error rendering satellite ${i}:`, satErr);
    }
  }

  return 980;
}
