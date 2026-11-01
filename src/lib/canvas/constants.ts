import type { CanvasDimensionPreset, SlideData } from '../../types.ts';

/**
 * Canvas Dimensions & Safe Zone Constants
 * Refined for TikTok Photo Mode / Feed (1080x1920 9:16) and Instagram Feed / Reels:
 * - Top header safe area: y >= 112px (clears TikTok LIVE / Following / For You / Search bar)
 * - Right safe margin: x <= 930px on TikTok (150px right clearance for avatar/like/comment/save/share icons)
 * - Left safe margin: x >= 84px
 * - Optical text & card ceiling on TikTok: y <= 1555px (clears 365px bottom photo dots, caption & sound drawer)
 * - Pagination dots on TikTok: y = 1605px (sits cleanly above caption block)
 */
export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;

export const SAFE_MARGIN_LEFT = 84;
export const SAFE_MARGIN_RIGHT = 930;
export const SAFE_CONTENT_WIDTH = SAFE_MARGIN_RIGHT - SAFE_MARGIN_LEFT;
export const SAFE_CONTENT_CENTER_X = (SAFE_MARGIN_LEFT + SAFE_MARGIN_RIGHT) / 2;
export const SAFE_TEXT_WIDTH_TITLE = 840;
export const SAFE_TEXT_WIDTH_BODY = 810;
export const SAFE_TEXT_CENTER_X = 507;

export const SAFE_HEADER_Y = 120;
export const SAFE_FOOTER_CEILING_Y = 1555;
export const SAFE_MAX_Y = 1650;
export const PAGINATION_DOT_Y = 1605;

export const GRID_SPACING = 108;
export const GRID_LINE_WIDTH = 2;

export const FONT_TITLE_EN = '"Plus Jakarta Sans", sans-serif';
export const FONT_TITLE_AR = '"Cairo", sans-serif';
export const FONT_BODY_EN = '"Plus Jakarta Sans", sans-serif';
export const FONT_BODY_AR = '"Cairo", sans-serif';
export const FONT_MONO = '"JetBrains Mono", monospace';

export interface CanvasDimensionSpec {
  id: CanvasDimensionPreset;
  label: string;
  shortLabel: string;
  platform: 'tiktok' | 'instagram';
  width: number;
  height: number;
  aspectRatioLabel: '9:16' | '4:5' | '3:4' | '1:1';
  safeMarginLeft: number;
  safeMarginRight: number;
  safeContentWidth: number;
  safeTextCenterX: number;
  safeTextWidthTitle: number;
  safeTextWidthBody: number;
  headerY: number;
  graphicScale: number;
  graphicOffsetX: number;
  graphicOffsetY: number;
  safeFooterCeilingY: number;
  paginationDotY: number;
  cadRefLabel: string;
}

export interface ArchetypeGraphicTransform {
  scale: number;
  translateX: number;
  translateY: number;
  cardX: number;
  cardY: number;
  cardW: number;
  cardH: number;
}

export const CANVAS_DIMENSION_PRESETS: Record<CanvasDimensionPreset, CanvasDimensionSpec> = {
  'tiktok-9:16': {
    id: 'tiktok-9:16',
    label: 'TikTok 9:16 (1080×1920)',
    shortLabel: 'TikTok 9:16',
    platform: 'tiktok',
    width: 1080,
    height: 1920,
    aspectRatioLabel: '9:16',
    safeMarginLeft: SAFE_MARGIN_LEFT,
    safeMarginRight: SAFE_MARGIN_RIGHT,
    safeContentWidth: SAFE_CONTENT_WIDTH,
    safeTextCenterX: SAFE_TEXT_CENTER_X,
    safeTextWidthTitle: SAFE_TEXT_WIDTH_TITLE,
    safeTextWidthBody: SAFE_TEXT_WIDTH_BODY,
    headerY: SAFE_HEADER_Y,
    graphicScale: 1,
    graphicOffsetX: 0,
    graphicOffsetY: 0,
    safeFooterCeilingY: SAFE_FOOTER_CEILING_Y,
    paginationDotY: PAGINATION_DOT_Y,
    cadRefLabel: 'SYS_REF // 1080x1920.TIKTOK_SAFE',
  },
  'ig-4:5': {
    id: 'ig-4:5',
    label: 'Instagram 4:5 (1080×1350)',
    shortLabel: 'IG 4:5',
    platform: 'instagram',
    width: 1080,
    height: 1350,
    aspectRatioLabel: '4:5',
    safeMarginLeft: 84,
    safeMarginRight: 996,
    safeContentWidth: 912,
    safeTextCenterX: 540,
    safeTextWidthTitle: 880,
    safeTextWidthBody: 850,
    headerY: 64,
    graphicScale: 0.72,
    graphicOffsetX: 151,
    graphicOffsetY: 16,
    safeFooterCeilingY: 1245,
    paginationDotY: 1295,
    cadRefLabel: 'SYS_REF // 1080x1350.IG_PORTRAIT',
  },
  'ig-3:4': {
    id: 'ig-3:4',
    label: 'Instagram 3:4 (1080×1440)',
    shortLabel: 'IG 3:4',
    platform: 'instagram',
    width: 1080,
    height: 1440,
    aspectRatioLabel: '3:4',
    safeMarginLeft: 84,
    safeMarginRight: 996,
    safeContentWidth: 912,
    safeTextCenterX: 540,
    safeTextWidthTitle: 880,
    safeTextWidthBody: 850,
    headerY: 72,
    graphicScale: 0.76,
    graphicOffsetX: 130,
    graphicOffsetY: 18,
    safeFooterCeilingY: 1330,
    paginationDotY: 1382,
    cadRefLabel: 'SYS_REF // 1080x1440.IG_GRID',
  },
  'ig-1:1': {
    id: 'ig-1:1',
    label: 'Instagram 1:1 (1080×1080)',
    shortLabel: 'IG 1:1',
    platform: 'instagram',
    width: 1080,
    height: 1080,
    aspectRatioLabel: '1:1',
    safeMarginLeft: 80,
    safeMarginRight: 1000,
    safeContentWidth: 920,
    safeTextCenterX: 540,
    safeTextWidthTitle: 890,
    safeTextWidthBody: 860,
    headerY: 52,
    graphicScale: 0.54,
    graphicOffsetX: 248,
    graphicOffsetY: 22,
    safeFooterCeilingY: 990,
    paginationDotY: 1036,
    cadRefLabel: 'SYS_REF // 1080x1080.IG_SQUARE',
  },
  'ig-9:16': {
    id: 'ig-9:16',
    label: 'IG Reels / Story 9:16 (1080×1920)',
    shortLabel: 'IG 9:16',
    platform: 'instagram',
    width: 1080,
    height: 1920,
    aspectRatioLabel: '9:16',
    safeMarginLeft: 84,
    safeMarginRight: 960,
    safeContentWidth: 876,
    safeTextCenterX: 522,
    safeTextWidthTitle: 850,
    safeTextWidthBody: 820,
    headerY: 112,
    graphicScale: 1,
    graphicOffsetX: 15,
    graphicOffsetY: 0,
    safeFooterCeilingY: 1620,
    paginationDotY: 1670,
    cadRefLabel: 'SYS_REF // 1080x1920.IG_REELS',
  },
};

export const CANVAS_DIMENSION_PRESET_LIST: CanvasDimensionSpec[] = [
  CANVAS_DIMENSION_PRESETS['tiktok-9:16'],
  CANVAS_DIMENSION_PRESETS['ig-4:5'],
  CANVAS_DIMENSION_PRESETS['ig-3:4'],
  CANVAS_DIMENSION_PRESETS['ig-1:1'],
  CANVAS_DIMENSION_PRESETS['ig-9:16'],
];

export function getCanvasDimensionSpec(preset?: CanvasDimensionPreset): CanvasDimensionSpec {
  if (preset && CANVAS_DIMENSION_PRESETS[preset]) {
    return CANVAS_DIMENSION_PRESETS[preset];
  }
  return CANVAS_DIMENSION_PRESETS['tiktok-9:16'];
}

/**
 * Computes center-locked, header-safe graphic transform and bounding box for a given dimension preset and archetype.
 * - Preserves exact 1:1 native coordinates on `tiktok-9:16`.
 * - Horizontally aligns the archetype's visual center (`540` for hub/number, `518` for cta, `507` for card archetypes)
 *   directly onto `spec.safeTextCenterX` on all Instagram presets so graphics never drift left.
 * - Anchors top Y below the MARROK header + SYS_REF line on compact aspect ratios (`4:5`, `3:4`, `1:1`).
 */
export function getArchetypeGraphicTransform(
  spec: CanvasDimensionSpec,
  slideType: SlideData['type'] = 'row'
): ArchetypeGraphicTransform {
  let baseCardY = 240;
  let baseCardH = 490;
  let nativeCenterX = SAFE_CONTENT_CENTER_X; // 507 for standard cards drawn at x=84, w=846

  if (slideType === 'hub') {
    baseCardY = 190;
    baseCardH = 790;
    nativeCenterX = 540;
  } else if (slideType === 'poster') {
    baseCardY = 200;
    baseCardH = 430;
    nativeCenterX = SAFE_CONTENT_CENTER_X;
  } else if (slideType === 'number') {
    baseCardY = 240;
    baseCardH = 430;
    nativeCenterX = 540;
  } else if (slideType === 'cta') {
    baseCardY = 250;
    baseCardH = 390;
    nativeCenterX = 518;
  }

  // Native 1:1 path for default TikTok 9:16 preset
  if (spec.id === 'tiktok-9:16') {
    return {
      scale: 1,
      translateX: 0,
      translateY: 0,
      cardX: SAFE_MARGIN_LEFT,
      cardY: baseCardY,
      cardW: SAFE_CONTENT_WIDTH,
      cardH: baseCardH,
    };
  }

  // On 1920px height (e.g. ig-9:16), keep full scale and center on safeTextCenterX
  if (spec.height >= 1920) {
    const translateX = Math.round(spec.safeTextCenterX - nativeCenterX);
    const cardW = SAFE_CONTENT_WIDTH;
    const cardX = Math.round(spec.safeTextCenterX - cardW / 2);
    return {
      scale: 1,
      translateX,
      translateY: spec.graphicOffsetY,
      cardX,
      cardY: baseCardY + spec.graphicOffsetY,
      cardW,
      cardH: baseCardH,
    };
  }

  // Compact aspect ratios (ig-4:5, ig-3:4, ig-1:1):
  // Use spec.graphicScale for tall Hub/Poster/CTA slides, and a slightly fuller scale for standard 490px cards
  const isTallOrDense = slideType === 'hub' || slideType === 'poster' || slideType === 'cta';
  const scale = isTallOrDense
    ? spec.graphicScale
    : Number(Math.min(0.86, spec.graphicScale * 1.14).toFixed(3));

  const headerClearance = slideType === 'hub' ? 72 : 82;
  const targetTopY = spec.headerY + headerClearance;
  const translateX = Math.round(spec.safeTextCenterX - nativeCenterX * scale);
  const translateY = Math.round(targetTopY - baseCardY * scale);

  const cardW = Math.round(SAFE_CONTENT_WIDTH * scale);
  const cardH = Math.round(baseCardH * scale);
  const cardX = Math.round(spec.safeTextCenterX - cardW / 2);
  const cardY = targetTopY;

  return {
    scale,
    translateX,
    translateY,
    cardX,
    cardY,
    cardW,
    cardH,
  };
}


