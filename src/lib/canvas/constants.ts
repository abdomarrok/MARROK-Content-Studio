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

export const ACCEPTED_SINGLE_SLIDE_MEDIA_ACCEPT =
  'image/*,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov';

export const SUPPORTED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
] as const;

export function isVideoMimeType(mime?: string | null): boolean {
  if (!mime) return false;
  const clean = mime.toLowerCase().trim();
  return (
    clean === 'video/mp4' ||
    clean === 'video/webm' ||
    clean === 'video/quicktime' ||
    clean.startsWith('video/')
  );
}

export function isVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  if (clean.startsWith('data:video/')) return true;
  return /\.(mp4|webm|mov)(\?.*|#.*)?$/i.test(clean);
}

export function isVideoFile(file?: { type?: string; name?: string } | null): boolean {
  if (!file) return false;
  if (isVideoMimeType(file.type)) return true;
  if (file.name && /\.(mp4|webm|mov)$/i.test(file.name.trim())) return true;
  return false;
}

export function isVideoSlide(slide?: Partial<SlideData> | null): boolean {
  if (!slide) return false;
  if (slide.mediaType === 'video') return Boolean(slide.videoUrl || slide.imageUrl);
  if (slide.videoUrl && slide.videoUrl.trim().length > 0) return true;
  if (isVideoMimeType(slide.videoMimeType) && Boolean(slide.videoUrl || slide.imageUrl)) return true;
  return isVideoUrl(slide.imageUrl);
}

export function getSlideMediaType(slide?: Partial<SlideData> | null): 'image' | 'video' {
  return isVideoSlide(slide) ? 'video' : 'image';
}

export function getSlideMediaUrl(slide?: Partial<SlideData> | null): string {
  if (!slide) return '';
  if (isVideoSlide(slide)) {
    return (slide.videoUrl || slide.imageUrl || '').trim();
  }
  return (slide.imageUrl || slide.videoUrl || '').trim();
}

export interface WhiteCardMediaGeometry {
  cardX: number;
  cardY: number;
  cardW: number;
  cardH: number;
  cardR: number;
  cardRadius: number;
  pad: number;
  innerPad: number;
  imgX: number;
  imgY: number;
  imgW: number;
  imgH: number;
  innerX: number;
  innerY: number;
  innerW: number;
  innerH: number;
  innerBorderRadius: number;
  fit: 'contain' | 'cover';
  isWhiteBg: boolean;
  scale: number;
  cardLeftPct: string;
  cardTopPct: string;
  cardWidthPct: string;
  cardHeightPct: string;
  innerLeftPct: string;
  innerTopPct: string;
  innerWidthPct: string;
  innerHeightPct: string;
}

/**
 * Computes exact pixel and percentage coordinates for the central white rounded card
 * and its inner padded media container across any active dimension preset (e.g. 1080x1440 IG_GRID).
 */
export function computeWhiteCardMediaGeometry(
  spec: CanvasDimensionSpec,
  slide?: Partial<SlideData> | null
): WhiteCardMediaGeometry {
  const effectiveType = slide?.type || 'poster';
  const transform = getArchetypeGraphicTransform(spec, effectiveType, slide);
  const ov = slide?.layoutOverrides?.graphicCard;
  const gScale = ov?.scale ?? 1;
  const gDx = ov?.dx ?? 0;
  const gDy = ov?.dy ?? 0;

  const cardW = Math.round(transform.cardW * gScale);
  const cardH = Math.round(transform.cardH * gScale);
  const cardX = Math.round(transform.cardX + (transform.cardW - cardW) / 2 + gDx);
  const cardY = Math.round(transform.cardY + (transform.cardH - cardH) / 2 + gDy);
  const effectiveScale = Number((transform.scale * gScale).toFixed(3));
  const cardRadius = Math.max(16, Math.round(32 * effectiveScale));

  const isHero = isHeroImageSlide(slide, effectiveType);
  const basePad = isHero ? 18 : 24;
  const innerPad = Math.max(10, Math.round(basePad * effectiveScale));
  const innerX = cardX + innerPad;
  const innerY = cardY + innerPad;
  const innerW = Math.max(40, cardW - innerPad * 2);
  const innerH = Math.max(40, cardH - innerPad * 2);
  const innerBorderRadius = slide?.videoBorderRadius ?? 8;
  const fit: 'contain' | 'cover' = slide?.imageFit || 'contain';
  const isWhiteBg =
    slide?.imageBgStyle === 'white' ||
    (!slide?.imageBgStyle && (isHero || isVideoSlide(slide)));

  const toPct = (v: number, total: number) => `${((v / total) * 100).toFixed(2)}%`;

  return {
    cardX,
    cardY,
    cardW,
    cardH,
    cardR: cardRadius,
    cardRadius,
    pad: innerPad,
    innerPad,
    imgX: innerX,
    imgY: innerY,
    imgW: innerW,
    imgH: innerH,
    innerX,
    innerY,
    innerW,
    innerH,
    innerBorderRadius,
    fit,
    isWhiteBg,
    scale: effectiveScale,
    cardLeftPct: toPct(cardX, spec.width),
    cardTopPct: toPct(cardY, spec.height),
    cardWidthPct: toPct(cardW, spec.width),
    cardHeightPct: toPct(cardH, spec.height),
    innerLeftPct: toPct(innerX, spec.width),
    innerTopPct: toPct(innerY, spec.height),
    innerWidthPct: toPct(innerW, spec.width),
    innerHeightPct: toPct(innerH, spec.height),
  };
}

/**
 * Determines whether a slide is in Full Meme / Video Card Mode (captionless card filling the safe zone with no slide text below).
 */
export function isFullMemeSlide(slide?: Partial<SlideData> | null, slideTypeOverride?: SlideData['type']): boolean {
  if (!slide) return false;
  const effectiveType = slideTypeOverride || slide.type;
  if (effectiveType !== 'image' && effectiveType !== 'poster') return false;
  if (slide.imageFrameMode === 'full') return true;
  if (
    slide.imageUrl === '/assets/aistudio/1793547809949_4a78bc04.jpg' &&
    slide.imageCaption === 'EXPECTATIONS VS. REALITY // AI ERA'
  ) {
    return true;
  }
  if (slide.imageFrameMode === 'hero' || slide.imageFrameMode === 'standard') return false;
  // On poster/image slides with an attached imageUrl or videoUrl and no explicit mode, default to full captionless card if text is hidden/empty
  const hasMedia = Boolean(slide.imageUrl || isVideoSlide(slide));
  if (!hasMedia) return false;
  const ov = slide.layoutOverrides;
  const hasVisibleTitle = !ov?.titleBlock?.hidden && Boolean((slide.enTitle || '').trim());
  const hasVisibleArTitle = !ov?.arabicTitleBlock?.hidden && Boolean((slide.arTitle || '').trim());
  const hasVisibleBody = !ov?.bodyBlock?.hidden && Boolean((slide.enBody || '').trim());
  const hasVisibleArBody = !ov?.arabicBodyBlock?.hidden && Boolean((slide.arBody || '').trim());
  return !hasVisibleTitle && !hasVisibleArTitle && !hasVisibleBody && !hasVisibleArBody;
}

/**
 * Determines whether a slide uses the tall Hero Meme / Visual Frame (820px native height on 9:16) or Full Meme Frame (1140px).
 */
export function isHeroImageSlide(slide?: Partial<SlideData> | null, slideTypeOverride?: SlideData['type']): boolean {
  if (!slide) return false;
  if (isFullMemeSlide(slide, slideTypeOverride)) return true;
  const effectiveType = slideTypeOverride || slide.type;
  if (effectiveType !== 'image' && effectiveType !== 'poster') return false;
  if (slide.imageFrameMode === 'hero') return true;
  if (slide.imageFrameMode === 'standard') return false;
  // On poster slides with an attached imageUrl or videoUrl, default to hero frame unless explicitly standard
  return effectiveType === 'poster' && Boolean(slide.imageUrl || isVideoSlide(slide));
}

/**
 * Computes center-locked, header-safe graphic transform and bounding box for a given dimension preset and archetype.
 * - Preserves exact 1:1 native coordinates on `tiktok-9:16`.
 * - Horizontally aligns the archetype's visual center (`540` for hub/number, `518` for cta, `507` for card archetypes)
 *   directly onto `spec.safeTextCenterX` on all Instagram presets so graphics never drift left.
 * - Anchors top Y below the MARROK header + SYS_REF line on compact aspect ratios (`4:5`, `3:4`, `1:1`).
 * - Supports both Full Meme Frame (`baseCardY = 220, baseCardH = 1140` with zero text below) and
 *   Hero Meme + Headline Frame (`baseCardY = 200, baseCardH = 820`) across all 5 social formats.
 */
export function getArchetypeGraphicTransform(
  spec: CanvasDimensionSpec,
  slideType: SlideData['type'] = 'row',
  slideContext?: Partial<SlideData> | null
): ArchetypeGraphicTransform {
  const isFullMeme = isFullMemeSlide(slideContext, slideType);
  const isHeroImage = isHeroImageSlide(slideContext, slideType);
  let baseCardY = 240;
  let baseCardH = 490;
  let nativeCenterX = SAFE_CONTENT_CENTER_X; // 507 for standard cards drawn at x=84, w=846

  if (slideType === 'hub') {
    baseCardY = 190;
    baseCardH = 790;
    nativeCenterX = 540;
  } else if (isFullMeme) {
    baseCardY = 220;
    baseCardH = 1140;
    nativeCenterX = SAFE_CONTENT_CENTER_X;
  } else if (isHeroImage) {
    baseCardY = 200;
    baseCardH = 820;
    nativeCenterX = SAFE_CONTENT_CENTER_X;
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
  const headerClearance = slideType === 'hub' || isHeroImage ? 72 : 82;
  const targetTopY = spec.headerY + headerClearance;

  // In Full Meme mode (no caption below), maximize scale to fill the safe zone between header and footer
  let scale: number;
  if (isFullMeme) {
    const availH = Math.max(400, spec.safeFooterCeilingY - targetTopY - 20);
    const maxScaleW = spec.safeContentWidth / SAFE_CONTENT_WIDTH;
    const maxScaleH = availH / baseCardH;
    scale = Number(Math.min(1, maxScaleW, maxScaleH).toFixed(3));
  } else {
    const isTallOrDense = slideType === 'hub' || isHeroImage || slideType === 'poster' || slideType === 'cta';
    scale = isTallOrDense
      ? spec.graphicScale
      : Number(Math.min(0.86, spec.graphicScale * 1.14).toFixed(3));
  }

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



