import {
  MotionBrandConfig,
  MotionSceneConfig,
  MotionTemplateConfig,
} from '../../types.ts';
import { MARROK_LOGO_PATHS, drawMarrokVectorBadge } from '../icons.ts';
import { DEFAULT_BRAND, MOTION_W, MOTION_H, clamp, spring } from './base.ts';
import { isolateEmbeddedLatinInArabic } from '../text/arabicBiDi.ts';

export const SAFE_LEFT = 82;
export const SAFE_RIGHT = 945;
export const SAFE_WIDTH = SAFE_RIGHT - SAFE_LEFT; // 863px
export const SAFE_CENTER_X = (SAFE_LEFT + SAFE_RIGHT) / 2; // 513.5px

const MAX_RGBA_CACHE_ENTRIES = 256;
const rgbaCache = new Map<string, string>();

const MAX_MOTION_WRAP_CACHE_ENTRIES = 512;
const motionWrapCache = new Map<string, string[]>();

export function hexToRgba(hex: string, alpha: number): string {
  const quantizedAlpha = Math.round(alpha * 1000) / 1000;
  const cacheKey = `${hex || ''}|${quantizedAlpha}`;
  const cached = rgbaCache.get(cacheKey);
  if (cached) return cached;

  const clean = (hex || '#6EA0FF').replace('#', '').trim();
  let result: string;
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 110;
    const g = parseInt(clean[1] + clean[1], 16) || 160;
    const b = parseInt(clean[2] + clean[2], 16) || 255;
    result = `rgba(${r}, ${g}, ${b}, ${quantizedAlpha})`;
  } else {
    const r = parseInt(clean.slice(0, 2), 16) || 110;
    const g = parseInt(clean.slice(2, 4), 16) || 160;
    const b = parseInt(clean.slice(4, 6), 16) || 255;
    result = `rgba(${r}, ${g}, ${b}, ${quantizedAlpha})`;
  }

  if (rgbaCache.size >= MAX_RGBA_CACHE_ENTRIES) {
    const oldestKey = rgbaCache.keys().next().value;
    if (oldestKey !== undefined) rgbaCache.delete(oldestKey);
  }
  rgbaCache.set(cacheKey, result);
  return result;
}

/**
 * Word-wraps text into lines that fit within maxWidth on the given Canvas 2D context.
 * Uses a bounded LRU cache keyed by font, maxWidth, maxLines, and context metric probe.
 */
export function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 3
): string[] {
  const cleaned = (text || '').trim();
  if (!cleaned) return [];

  let probeWidth = 0;
  try {
    probeWidth = Math.round((ctx.measureText('MW0').width || 0) * 100);
  } catch {
    probeWidth = 0;
  }

  const cacheKey = `${ctx.font || ''}|${maxWidth}|${maxLines}|${probeWidth}|${cleaned}`;
  const cached = motionWrapCache.get(cacheKey);
  if (cached) {
    return [...cached];
  }

  const words = cleaned.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width <= maxWidth || !currentLine) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
      if (lines.length >= maxLines - 1) {
        break;
      }
    }
  }

  const consumedWords = lines.join(' ').split(/\s+/).filter(Boolean).length;
  const remainingWords = words.slice(consumedWords);
  if (remainingWords.length > 0) {
    let lastLine = remainingWords.join(' ');
    if (ctx.measureText(lastLine).width > maxWidth) {
      while (lastLine.length > 3 && ctx.measureText(`${lastLine}…`).width > maxWidth) {
        lastLine = lastLine.slice(0, -1).trim();
      }
      lastLine = `${lastLine}…`;
    }
    lines.push(lastLine);
  } else if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  const finalLines = lines.slice(0, maxLines);
  if (motionWrapCache.has(cacheKey)) {
    motionWrapCache.delete(cacheKey);
  } else if (motionWrapCache.size >= MAX_MOTION_WRAP_CACHE_ENTRIES) {
    const oldestKey = motionWrapCache.keys().next().value;
    if (oldestKey !== undefined) motionWrapCache.delete(oldestKey);
  }
  motionWrapCache.set(cacheKey, finalLines);
  return [...finalLines];
}

// Offscreen cache for static 1080x1920 grid + CAD reticles overlay when cameraPanX is quantized
const MAX_GRID_CACHE_ENTRIES = 8;
const offscreenGridCache = new Map<string, OffscreenCanvas>();

function getCachedOffscreenGridOverlay(
  gridShiftQuantized: number,
  showCadReticles: boolean
): OffscreenCanvas | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const key = `${gridShiftQuantized}|${showCadReticles ? 1 : 0}`;
  const existing = offscreenGridCache.get(key);
  if (existing) return existing;

  try {
    const offscreen = new OffscreenCanvas(MOTION_W, MOTION_H);
    const oCtx = offscreen.getContext('2d');
    if (!oCtx) return null;

    oCtx.strokeStyle = 'rgba(255, 255, 255, 0.032)';
    oCtx.lineWidth = 1;
    oCtx.beginPath();
    for (let x = -108 + gridShiftQuantized; x <= MOTION_W + 108; x += 108) {
      oCtx.moveTo(x, 0);
      oCtx.lineTo(x, MOTION_H);
    }
    for (let y = 0; y <= MOTION_H; y += 108) {
      oCtx.moveTo(0, y);
      oCtx.lineTo(MOTION_W, y);
    }
    oCtx.stroke();

    if (showCadReticles) {
      const crosshairs = [
        { x: 60, y: 195 },
        { x: 945, y: 195 },
        { x: 60, y: 1710 },
        { x: 945, y: 1710 },
      ];
      oCtx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      oCtx.lineWidth = 1.5;
      const arm = 8;
      oCtx.beginPath();
      for (const pt of crosshairs) {
        oCtx.moveTo(pt.x - arm, pt.y);
        oCtx.lineTo(pt.x + arm, pt.y);
        oCtx.moveTo(pt.x, pt.y - arm);
        oCtx.lineTo(pt.x, pt.y + arm);
      }
      oCtx.stroke();

      oCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      oCtx.lineWidth = 1;
      oCtx.beginPath();
      for (let y = 324; y <= 1620; y += 216) {
        oCtx.moveTo(941, y);
        oCtx.lineTo(949, y);
      }
      for (let x = 162; x <= 864; x += 216) {
        oCtx.moveTo(x, 1706);
        oCtx.lineTo(x, 1714);
      }
      oCtx.stroke();
    }

    if (offscreenGridCache.size >= MAX_GRID_CACHE_ENTRIES) {
      const oldestKey = offscreenGridCache.keys().next().value;
      if (oldestKey !== undefined) offscreenGridCache.delete(oldestKey);
    }
    offscreenGridCache.set(key, offscreen);
    return offscreen;
  } catch {
    return null;
  }
}

/**
 * 1. Base Background + Radial Ambient Glow + 108px Engineering Grid + CAD Reticles
 * Matches MARROK's static slide background.ts 1:1 with subtle live motion pulse.
 */
export function drawMarrokReelBackground(
  ctx: CanvasRenderingContext2D,
  config: MotionTemplateConfig,
  globalTime: number,
  cameraPanX = 0,
  cameraZoom = 1
): void {
  const b: MotionBrandConfig = { ...DEFAULT_BRAND, ...(config?.brand || {}) };
  const bg = b.bgColor || '#080A12';
  const accent = b.accentColor || '#6EA0FF';

  // Solid OLED base fill
  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, MOTION_W, MOTION_H);

  // Radial ambient glow centered at (540, 690), radius 720px with subtle breathing + camera pan parallax
  const glowCenterX = 540 + cameraPanX * 0.25;
  const pulse = 0.14 + 0.03 * Math.sin(globalTime * 2.0) + (cameraZoom - 1) * 0.8;
  const grad = ctx.createRadialGradient(glowCenterX, 690, 0, glowCenterX, 690, 720 * cameraZoom);
  grad.addColorStop(0, hexToRgba(accent, clamp(pulse, 0.08, 0.28)));
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, MOTION_W, MOTION_H);

  const gridShiftX = ((cameraPanX * 0.5) % 108 + 108) % 108;
  const gridShiftQuantized = Math.round(gridShiftX * 2) / 2;
  const showCadReticles = config.showCadReticles !== false;
  const cachedGrid = getCachedOffscreenGridOverlay(gridShiftQuantized, showCadReticles);

  if (cachedGrid && typeof ctx.drawImage === 'function') {
    ctx.drawImage(cachedGrid, 0, 0);
    ctx.restore();
    return;
  }

  // Fallback direct batched path rendering (e.g. non-OffscreenCanvas or test mocks)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.032)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -108 + gridShiftX; x <= MOTION_W + 108; x += 108) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, MOTION_H);
  }
  for (let y = 0; y <= MOTION_H; y += 108) {
    ctx.moveTo(0, y);
    ctx.lineTo(MOTION_W, y);
  }
  ctx.stroke();

  if (showCadReticles) {
    const crosshairs = [
      { x: 60, y: 195 },
      { x: 945, y: 195 },
      { x: 60, y: 1710 },
      { x: 945, y: 1710 },
    ];
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    const arm = 8;
    ctx.beginPath();
    for (const pt of crosshairs) {
      ctx.moveTo(pt.x - arm, pt.y);
      ctx.lineTo(pt.x + arm, pt.y);
      ctx.moveTo(pt.x, pt.y - arm);
      ctx.lineTo(pt.x, pt.y + arm);
    }
    ctx.stroke();

    // Subtle right & bottom safe-zone ticks batched into single path
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = 324; y <= 1620; y += 216) {
      ctx.moveTo(941, y);
      ctx.lineTo(949, y);
    }
    for (let x = 162; x <= 864; x += 216) {
      ctx.moveTo(x, 1706);
      ctx.lineTo(x, 1714);
    }
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * 2. Authentic MARROK Slide Header
 * Renders the 32x32 glowing MARROK vector logo badge, MARROK wordmark, pulsing dot, and right-aligned category tag.
 */
export function drawMarrokReelHeader(
  ctx: CanvasRenderingContext2D,
  config: MotionTemplateConfig,
  globalTime: number,
  categoryOverride?: string
): void {
  const b: MotionBrandConfig = { ...DEFAULT_BRAND, ...(config?.brand || {}) };
  const accent = b.accentColor || '#6EA0FF';
  const brandName = (b.name || 'MARROK').toUpperCase();
  const category = (
    categoryOverride ||
    config.category ||
    b.category ||
    'AI + SECURITY'
  ).toUpperCase();

  ctx.save();
  ctx.direction = 'ltr';
  ctx.textBaseline = 'alphabetic';

  const logoSize = 32;
  const logoX = 82;
  const logoY = 112;
  const cx = logoX + logoSize / 2;
  const cy = logoY + logoSize / 2;

  // 1. Glowing dark rounded badge plate matching drawHeader in background.ts
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 10 + 4 * Math.sin(globalTime * 3);
  ctx.fillStyle = '#0D0D0D';
  ctx.strokeStyle = hexToRgba(accent, 0.45);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(logoX, logoY, logoSize, logoSize, 8);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 2. Crisp vector MARROK logo inside the badge
  drawMarrokVectorBadge(ctx, cx, cy, logoSize - 4, accent, 'transparent');

  // 3. MARROK Wordmark (exact 38px Plus Jakarta Sans at y = 142 matching static slides)
  const textX = logoX + logoSize + 12;
  ctx.font = '800 38px "Plus Jakarta Sans", "Outfit", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText(brandName, textX, 142);

  // 4. Pulsing Accent Dot next to wordmark
  const brandWidth = ctx.measureText(brandName).width;
  const dotPulse = 7.0 + 1.0 * Math.sin(globalTime * 4.5);
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 10;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(textX + brandWidth + 12, 129, dotPulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 5. Right-aligned Category Tag at x = 945, y = 140
  ctx.font = '400 30px "Plus Jakarta Sans", "Outfit", sans-serif';
  ctx.fillStyle = '#A0A5B1';
  ctx.textAlign = 'right';
  ctx.fillText(category, SAFE_RIGHT, 140);

  ctx.restore();
}

/**
 * 3. Authentic MARROK Attribution & Single Smooth Progress Bar Footer
 * Renders @MARROK handle and a single smooth bottom progress bar inside the safe zone (no redundant dots or counters).
 */
export function drawMarrokReelFooter(
  ctx: CanvasRenderingContext2D,
  config: MotionTemplateConfig,
  globalTime: number,
  _activeSceneIdx = 0,
  _totalScenes = 1,
  _fractionalSceneIdx?: number
): void {
  const b: MotionBrandConfig = { ...DEFAULT_BRAND, ...(config?.brand || {}) };
  const accent = b.accentColor || '#6EA0FF';
  const brandName = (b.name || 'MARROK').toUpperCase();
  const channel = (config.channel || b.channel || brandName).replace(/^@/, '');

  const footerY = 1826;
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textBaseline = 'middle';

  // Left handle watermark
  ctx.font = '600 26px "Plus Jakarta Sans", "Outfit", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.textAlign = 'left';
  ctx.fillText(`@${channel}`, SAFE_LEFT, footerY);

  // Single smooth bottom progress bar inside safe zone at y = 1858
  const duration = Math.max(1, config.duration || 20);
  const progress = clamp(globalTime / duration, 0, 1);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.beginPath();
  ctx.roundRect(SAFE_LEFT, 1858, SAFE_WIDTH, 6, 3);
  ctx.fill();

  if (progress > 0.002) {
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 10;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(SAFE_LEFT, 1858, Math.max(8, SAFE_WIDTH * progress), 6, 3);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

/**
 * 4. MARROK Elevated Surface Card (Persistent Diagram Frame without internal debug labels)
 */
export function drawMarrokSurfaceCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: string,
  surfaceColor = '#12131C',
  surfaceBorder = '#252838',
  _leftMicroLabel = '',
  _rightMicroLabel = '',
  revealProgress = 1
): void {
  const s = clamp(revealProgress, 0, 1);
  if (s <= 0.01) return;

  ctx.save();
  if (s < 0.999) {
    const slideOffsetY = (1 - s) * 24;
    ctx.translate(0, slideOffsetY);
    ctx.globalAlpha = s;
  }

  // Card dark surface fill
  ctx.fillStyle = surfaceColor;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 24);
  ctx.fill();

  // Subtle radial inner glow inside card
  const innerGrad = ctx.createRadialGradient(
    x + w / 2,
    y + h / 2,
    10,
    x + w / 2,
    y + h / 2,
    Math.max(w, h) * 0.65
  );
  innerGrad.addColorStop(0, hexToRgba(accent, 0.12));
  innerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 24);
  ctx.fill();

  // Card border stroke
  ctx.strokeStyle = surfaceBorder;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 24);
  ctx.fill();
  ctx.stroke();

  // Glowing top accent bar
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(x + 32, y, Math.max(40, (w - 64) * s), 4, 2);
  ctx.fill();

  ctx.restore();
}

function easeOutReveal(t: number, delaySec: number, durationSec = 0.15): number {
  const raw = clamp((t - delaySec) / Math.max(0.01, durationSec), 0, 1);
  return 1 - Math.pow(1 - raw, 3);
}

/**
 * 5. Animated Bilingual Slide Copy Block (EN Title + AR Title + EN Body + AR Body)
 * Staggers English Title, Arabic Title, and Body ~3 frames apart with an ease-out curve
 * so body copy reaches 100% opacity within <= 0.25s at high-contrast 42px/44px typography.
 */
export function drawAnimatedBilingualSlideCopy(
  ctx: CanvasRenderingContext2D,
  scene: MotionSceneConfig,
  brand: MotionBrandConfig,
  t: number,
  startY = 920
): void {
  const accent = brand.accentColor || '#6EA0FF';
  const textColor = brand.textColor || '#FFFFFF';

  // Determine English & Arabic titles/bodies with smart fallbacks from scene.text
  const hasArabicChars = /[\u0600-\u06FF]/.test(scene.text || '');
  const enTitle =
    scene.enTitle?.trim() ||
    (!hasArabicChars && !scene.text?.includes('|') ? scene.text?.trim() : '') ||
    scene.label?.toUpperCase() ||
    'SYSTEM ARCHITECTURE';
  const arTitle =
    scene.arTitle?.trim() ||
    (hasArabicChars && !scene.text?.includes('|') ? scene.text?.trim() : '') ||
    'هندسة الأنظمة المتقدمة';
  const enBody = scene.enBody?.trim() || '';
  const arBody = scene.arBody?.trim() || '';

  let cursorY = startY;

  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // 1. English Headline (Plus Jakarta Sans 800, 52px, LTR, White, 0.00s..0.15s ease-out)
  if (enTitle) {
    const enEase = easeOutReveal(t, 0.0, 0.15);
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.font = '800 52px "Plus Jakarta Sans", "Outfit", sans-serif';
    const enLines = wrapCanvasLines(ctx, enTitle.toUpperCase(), SAFE_WIDTH, 2);

    enLines.forEach((line) => {
      ctx.save();
      ctx.globalAlpha = enEase;
      ctx.translate(SAFE_LEFT, cursorY + (1 - enEase) * 14);
      ctx.fillStyle = textColor;
      ctx.fillText(line, 0, 0, SAFE_WIDTH);
      ctx.restore();
      cursorY += 64;
    });
    ctx.restore();
  }

  cursorY += 12;

  // 2. Arabic Headline (Cairo 800, 50px, RTL, Accent Color, +1.5 frames / 0.05s..0.20s ease-out)
  if (arTitle) {
    const arEase = easeOutReveal(t, 0.05, 0.15);
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = '800 50px "Cairo", "Noto Sans Arabic", sans-serif';
    const arLines = wrapCanvasLines(ctx, arTitle, SAFE_WIDTH, 2);

    arLines.forEach((line) => {
      ctx.save();
      ctx.globalAlpha = arEase;
      ctx.translate(SAFE_RIGHT, cursorY + (1 - arEase) * 14);
      ctx.fillStyle = accent;
      ctx.fillText(isolateEmbeddedLatinInArabic(line), 0, 0, SAFE_WIDTH);
      ctx.restore();
      cursorY += 66;
    });
    ctx.restore();
  }

  // 3. Expanding Accent Divider Line between Headlines and Body (0.08s..0.22s ease-out)
  const divEase = easeOutReveal(t, 0.08, 0.14);
  ctx.save();
  ctx.fillStyle = accent;
  ctx.globalAlpha = divEase * 0.9;
  ctx.beginPath();
  ctx.roundRect(SAFE_LEFT, cursorY - 20, Math.max(8, SAFE_WIDTH * divEase), 5, 2.5);
  ctx.fill();
  ctx.restore();

  cursorY += 36;

  // 4. English Body Copy (500 42px Plus Jakarta Sans, #F1F5F9 high-contrast, +3 frames / 0.10s..0.25s ease-out)
  const bodyEase = easeOutReveal(t, 0.10, 0.15); // Reaches 100% opacity at t = 0.25s
  if (enBody) {
    ctx.save();
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.font = '500 42px "Plus Jakarta Sans", "Outfit", sans-serif';
    const bodyLines = wrapCanvasLines(ctx, enBody, SAFE_WIDTH - 32, 3);
    const lineH = 56;
    const blockH = bodyLines.length * lineH;

    ctx.globalAlpha = bodyEase;
    ctx.fillStyle = hexToRgba(accent, 0.85);
    ctx.beginPath();
    ctx.roundRect(SAFE_LEFT, cursorY - 36, 6, Math.max(16, (blockH - 8) * bodyEase), 3);
    ctx.fill();

    ctx.fillStyle = '#F1F5F9';
    bodyLines.forEach((line, idx) => {
      ctx.fillText(
        line,
        SAFE_LEFT + 26,
        cursorY + idx * lineH + (1 - bodyEase) * 12,
        SAFE_WIDTH - 32
      );
    });
    ctx.restore();
    cursorY += blockH + 34;
  }

  // 5. Arabic Body Copy (600 44px Cairo, #FFFFFF bright high-contrast, reaches 100% opacity by t = 0.25s)
  if (arBody && cursorY <= 1720) {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = '600 44px "Cairo", "Noto Sans Arabic", sans-serif';
    const arBodyLines = wrapCanvasLines(ctx, arBody, SAFE_WIDTH - 32, 3);
    const lineH = 60;
    const blockH = arBodyLines.length * lineH;

    ctx.globalAlpha = bodyEase;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(SAFE_RIGHT - 6, cursorY - 38, 6, Math.max(16, (blockH - 8) * bodyEase), 3);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    arBodyLines.forEach((line, idx) => {
      ctx.fillText(
        isolateEmbeddedLatinInArabic(line),
        SAFE_RIGHT - 26,
        cursorY + idx * lineH + (1 - bodyEase) * 12,
        SAFE_WIDTH - 32
      );
    });
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Self-contained JS helper injected into standalone HTML exports so exported .html files
 * render the exact same MARROK vector logo, radial glow, 108px grid, CAD reticles, header, and single progress bar footer.
 */
export const MARROK_CHROME_SCRIPT = `
const MARROK_LOGO_PATHS = ${JSON.stringify(MARROK_LOGO_PATHS)};

function hexToRgba(hex, alpha) {
  const clean = (hex || '#6EA0FF').replace('#', '').trim();
  const r = parseInt(clean.slice(0, 2), 16) || 110;
  const g = parseInt(clean.slice(2, 4), 16) || 160;
  const b = parseInt(clean.slice(4, 6), 16) || 255;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

function drawMarrokVectorBadge(ctx, cx, cy, size, accentColor, bgColor) {
  if (bgColor && bgColor !== 'transparent') {
    ctx.save();
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(cx - size / 2, cy - size / 2, size, size, size * 0.22);
    ctx.fill();
    ctx.restore();
  }
  const scale = size / 240;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-MARROK_LOGO_PATHS.center.x, -MARROK_LOGO_PATHS.center.y);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill(new Path2D(MARROK_LOGO_PATHS.pathMain));
  ctx.fill(new Path2D(MARROK_LOGO_PATHS.pathRightBottom));
  ctx.fill(new Path2D(MARROK_LOGO_PATHS.pathLeftFrame));
  ctx.fillStyle = accentColor || '#6EA0FF';
  ctx.fill(new Path2D(MARROK_LOGO_PATHS.pathAccent));
  ctx.restore();
}

function drawMarrokChrome(ctx, config, globalTime) {
  const b = config.brand || {};
  const bg = b.bgColor || '#080A12';
  const accent = b.accentColor || '#6EA0FF';
  const brandName = (b.name || 'MARROK').toUpperCase();
  const category = (config.category || b.category || 'AI + SECURITY').toUpperCase();

  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const grad = ctx.createRadialGradient(540, 690, 0, 540, 690, 720);
  grad.addColorStop(0, hexToRgba(accent, 0.14 + 0.03 * Math.sin(globalTime * 2)));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.032)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 108) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 0; y <= H; y += 108) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();

  const pts = [{x:60,y:195},{x:945,y:195},{x:60,y:1710},{x:945,y:1710}];
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  for (const pt of pts) {
    ctx.beginPath();
    ctx.moveTo(pt.x - 8, pt.y); ctx.lineTo(pt.x + 8, pt.y);
    ctx.moveTo(pt.x, pt.y - 8); ctx.lineTo(pt.x, pt.y + 8);
    ctx.stroke();
  }

  // Header Badge + MARROK Logo
  ctx.save();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#0D0D0D';
  ctx.beginPath();
  ctx.roundRect(82, 112, 32, 32, 7);
  ctx.fill();
  ctx.restore();
  drawMarrokVectorBadge(ctx, 98, 128, 32, accent, 'transparent');

  ctx.direction = 'ltr';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '800 38px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText(brandName, 126, 142);
  const bw = ctx.measureText(brandName).width;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(126 + bw + 12, 129, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '400 30px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#A0A5B1';
  ctx.textAlign = 'right';
  ctx.fillText(category, 945, 140);
  ctx.restore();
}

function drawMarrokFooter(ctx, config, globalTime) {
  const b = config.brand || {};
  const accent = b.accentColor || '#6EA0FF';
  const brandName = (b.name || 'MARROK').toUpperCase();
  const footerY = 1826;
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textBaseline = 'middle';
  ctx.font = '600 26px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'left';
  ctx.fillText('@' + brandName, 82, footerY);

  const duration = Math.max(1, config.duration || 20);
  const progress = clamp(globalTime / duration, 0, 1);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.roundRect(82, 1858, 863, 6, 3);
  ctx.fill();

  if (progress > 0.002) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(82, 1858, Math.max(8, 863 * progress), 6, 3);
    ctx.fill();
  }
  ctx.restore();
}
`;
