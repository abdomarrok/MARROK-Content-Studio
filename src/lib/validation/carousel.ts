import type {
  CanvasDimensionPreset,
  CaptionVariant,
  CarouselData,
  DiagramNode,
  DiagramVariant,
  ElementLayoutOverride,
  ExtractedFact,
  GraphicalElementId,
  GroundingSource,
  HookVariant,
  IconLabelPair,
  MotionReelData,
  PostFormat,
  PostSourceMeta,
  SlideCompositionPreset,
  SlideData,
  SlideTakeawayItem,
  SlideType,
  TextAlignment,
  VisualSystemOptions,
} from '../../types.ts';

const POST_FORMATS: PostFormat[] = ['carousel', 'single', 'reel'];

const DIMENSION_PRESETS: CanvasDimensionPreset[] = [
  'tiktok-9:16',
  'ig-4:5',
  'ig-3:4',
  'ig-1:1',
  'ig-9:16',
];

const SLIDE_TYPES: SlideType[] = [
  'hub',
  'row',
  'number',
  'metric',
  'code',
  'compare',
  'image',
  'cta',
  'poster',
];

const DIAGRAM_VARIANTS: DiagramVariant[] = [
  'topology',
  'stack',
  'isolation',
  'takeaway',
  'scatter',
  'graph',
  'clusters',
  'split',
  'features',
];

const IMAGE_FITS: Array<NonNullable<SlideData['imageFit']>> = ['contain', 'cover'];
const IMAGE_FILTERS: Array<NonNullable<SlideData['imageFilter']>> = ['hud', 'invert', 'tint', 'clean'];
const IMAGE_FRAME_MODES: Array<NonNullable<SlideData['imageFrameMode']>> = ['full', 'hero', 'standard'];
const IMAGE_BG_STYLES: Array<NonNullable<SlideData['imageBgStyle']>> = ['theme', 'white', 'obsidian'];
const BRAND_WATERMARKS: Array<NonNullable<SlideData['brandWatermark']>> = [
  'none',
  'bottom-right',
  'top-right',
  'bottom-left',
];
const MEDIA_TYPES: Array<NonNullable<SlideData['mediaType']>> = ['image', 'video'];
const COMPOSITION_PRESETS: SlideCompositionPreset[] = [
  'standard',
  'headline-first',
  'split-balanced',
  'visual-hero',
  'compact-editorial',
];
const GRAPHICAL_ELEMENT_IDS: GraphicalElementId[] = [
  'headerBadge',
  'graphicCard',
  'titleBlock',
  'arabicTitleBlock',
  'bodyBlock',
  'arabicBodyBlock',
  'takeawaysBlock',
  'ctaButton',
  'attributionCard',
];
const TEXT_ALIGNMENTS: TextAlignment[] = ['left', 'center', 'right'];

const FACT_TYPES: ExtractedFact['type'][] = ['number', 'date', 'name', 'quote', 'claim'];
const FACT_STATUSES: ExtractedFact['verified'][] = [
  'verified',
  'partially_verified',
  'unconfirmed',
  'unverified',
];

const DEFAULT_MAX_SLIDES = 24;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  key: string,
  maxLength = 4000
): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value.slice(0, maxLength) : undefined;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
  min?: number,
  max?: number
): number | undefined {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  let clamped = value;
  if (min !== undefined) clamped = Math.max(min, clamped);
  if (max !== undefined) clamped = Math.min(max, clamped);
  return clamped;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number
): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean);
  return strings.length > 0 ? strings.slice(0, maxItems) : undefined;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function parseIconPairs(value: unknown): IconLabelPair[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const pairs: IconLabelPair[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const icon = readString(item, 'icon', 500);
    const label = readString(item, 'label', 80);
    if (icon && label) pairs.push({ icon, label });
  }
  return pairs.length > 0 ? pairs.slice(0, 12) : undefined;
}

function parseDiagramNodes(value: unknown): DiagramNode[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const nodes: DiagramNode[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const label = readString(item, 'label', 120);
    if (!label) continue;
    const node: DiagramNode = { label };
    const sublabel = readString(item, 'sublabel', 160);
    const status = readString(item, 'status', 80);
    const icon = readString(item, 'icon', 500);
    if (sublabel) node.sublabel = sublabel;
    if (status) node.status = status;
    if (icon) node.icon = icon;
    nodes.push(node);
  }
  return nodes.length > 0 ? nodes.slice(0, 12) : undefined;
}

function parseTakeaways(value: unknown): SlideTakeawayItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: SlideTakeawayItem[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) continue;
    const en = readString(raw, 'en', 400);
    const ar = readString(raw, 'ar', 400);
    if (!en && !ar) continue;
    const item: SlideTakeawayItem = {
      en: en || '',
      ar: ar || '',
    };
    const icon = readString(raw, 'icon', 200);
    if (icon) item.icon = icon;
    items.push(item);
  }
  return items.length > 0 ? items.slice(0, 6) : undefined;
}

function parseLayoutOverrides(
  value: unknown
): Partial<Record<GraphicalElementId, ElementLayoutOverride>> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Partial<Record<GraphicalElementId, ElementLayoutOverride>> = {};
  for (const elId of GRAPHICAL_ELEMENT_IDS) {
    const rawOv = value[elId];
    if (!isRecord(rawOv)) continue;
    const ov: ElementLayoutOverride = {};
    const dx = readNumber(rawOv, 'dx', -1000, 1000);
    const dy = readNumber(rawOv, 'dy', -1500, 1500);
    const scale = readNumber(rawOv, 'scale', 0.25, 3.0);
    const opacity = readNumber(rawOv, 'opacity', 0, 1);
    const align = readEnum(rawOv.align, TEXT_ALIGNMENTS);
    const hidden = readBoolean(rawOv, 'hidden');

    if (dx !== undefined) ov.dx = dx;
    if (dy !== undefined) ov.dy = dy;
    if (scale !== undefined) ov.scale = scale;
    if (opacity !== undefined) ov.opacity = opacity;
    if (align !== undefined) ov.align = align;
    if (hidden !== undefined) ov.hidden = hidden;

    if (Object.keys(ov).length > 0) {
      result[elId] = ov;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function parseMotionReelConfig(value: unknown): MotionReelData | undefined {
  if (!isRecord(value)) return undefined;
  if (!isRecord(value.brand) || !Array.isArray(value.scenes)) return undefined;
  return value as unknown as MotionReelData;
}

function parseSlide(
  value: unknown,
  index: number,
  total: number,
  requireContent: boolean
): SlideData | null {
  if (!isRecord(value)) return null;

  let type = readEnum(value.type, SLIDE_TYPES);
  if (!type) {
    if (index === 0) type = 'hub';
    else if (total > 1 && index === total - 1) type = 'cta';
    else type = 'row';
  }

  const slide: SlideData = { type };

  const stringFields: Array<[keyof SlideData, string, number]> = [
    ['centerIcon', 'centerIcon', 500],
    ['centerTag', 'centerTag', 80],
    ['diagramFooter', 'diagramFooter', 240],
    ['stepNumber', 'stepNumber', 16],
    ['stepLabel', 'stepLabel', 40],
    ['metricValue', 'metricValue', 40],
    ['metricLabel', 'metricLabel', 80],
    ['metricDiff', 'metricDiff', 120],
    ['metricIcon', 'metricIcon', 500],
    ['codeSnippet', 'codeSnippet', 6000],
    ['codeLanguage', 'codeLanguage', 40],
    ['codeFileName', 'codeFileName', 100],
    ['compareLeftTitle', 'compareLeftTitle', 100],
    ['compareLeftBody', 'compareLeftBody', 800],
    ['compareRightTitle', 'compareRightTitle', 100],
    ['compareRightBody', 'compareRightBody', 800],
    ['imageUrl', 'imageUrl', 2_500_000],
    ['videoUrl', 'videoUrl', 15_000_000],
    ['videoMimeType', 'videoMimeType', 80],
    ['videoFileName', 'videoFileName', 240],
    ['imageCaption', 'imageCaption', 160],
    ['imagePrompt', 'imagePrompt', 4000],
    ['imageModel', 'imageModel', 120],
    ['enTitle', 'enTitle', 500],
    ['arTitle', 'arTitle', 500],
    ['enBody', 'enBody', 1200],
    ['arBody', 'arBody', 1200],
    ['ctaText', 'ctaText', 160],
    ['url', 'url', 500],
    ['enCredit', 'enCredit', 200],
    ['arCredit', 'arCredit', 200],
  ];

  for (const [target, source, maxLength] of stringFields) {
    const parsed = readString(value, source, maxLength);
    if (parsed !== undefined) {
      (slide as unknown as Record<string, unknown>)[target as string] = parsed;
    }
  }

  const satIcons = readStringArray(value.satIcons, 12, 500);
  const satLabels = readStringArray(value.satLabels, 12, 80);
  const diagramEdges = readStringArray(value.diagramEdges, 8, 120);
  const icons = parseIconPairs(value.icons);
  const diagramNodes = parseDiagramNodes(value.diagramNodes);
  const diagramVariant = readEnum(value.diagramVariant, DIAGRAM_VARIANTS);
  const mediaType = readEnum(value.mediaType, MEDIA_TYPES);
  const imageFit = readEnum(value.imageFit, IMAGE_FITS);
  const imageFilter = readEnum(value.imageFilter, IMAGE_FILTERS);
  const imageFrameMode = readEnum(value.imageFrameMode, IMAGE_FRAME_MODES);
  const imageBgStyle = readEnum(value.imageBgStyle, IMAGE_BG_STYLES);
  const brandWatermark = readEnum(value.brandWatermark, BRAND_WATERMARKS);
  const compositionPreset = readEnum(value.compositionPreset, COMPOSITION_PRESETS);
  const freeMoveLayout = readBoolean(value, 'freeMoveLayout');
  const videoMuted = readBoolean(value, 'videoMuted');
  const videoPlaying = readBoolean(value, 'videoPlaying');
  const videoDuration = readNumber(value, 'videoDuration', 0, 600);
  const videoBorderRadius = readNumber(value, 'videoBorderRadius', 0, 120);
  const imageZoom = readNumber(value, 'imageZoom', 0.5, 4.0);
  const imagePanX = readNumber(value, 'imagePanX', -100, 100);
  const imagePanY = readNumber(value, 'imagePanY', -100, 100);
  const takeaways = parseTakeaways(value.takeaways);
  const layoutOverrides = parseLayoutOverrides(value.layoutOverrides);

  if (satIcons) slide.satIcons = satIcons;
  if (satLabels) slide.satLabels = satLabels;
  if (diagramEdges) slide.diagramEdges = diagramEdges;
  if (icons) slide.icons = icons;
  if (diagramNodes) slide.diagramNodes = diagramNodes;
  if (diagramVariant) slide.diagramVariant = diagramVariant;
  if (mediaType) slide.mediaType = mediaType;
  if (imageFit) slide.imageFit = imageFit;
  if (imageFilter) slide.imageFilter = imageFilter;
  if (imageFrameMode) slide.imageFrameMode = imageFrameMode;
  if (imageBgStyle) slide.imageBgStyle = imageBgStyle;
  if (brandWatermark) slide.brandWatermark = brandWatermark;
  if (compositionPreset) slide.compositionPreset = compositionPreset;
  if (freeMoveLayout !== undefined) slide.freeMoveLayout = freeMoveLayout;
  if (videoMuted !== undefined) slide.videoMuted = videoMuted;
  if (videoPlaying !== undefined) slide.videoPlaying = videoPlaying;
  if (videoDuration !== undefined) slide.videoDuration = videoDuration;
  if (videoBorderRadius !== undefined) slide.videoBorderRadius = videoBorderRadius;
  if (imageZoom !== undefined) slide.imageZoom = imageZoom;
  if (imagePanX !== undefined) slide.imagePanX = imagePanX;
  if (imagePanY !== undefined) slide.imagePanY = imagePanY;
  if (takeaways) slide.takeaways = takeaways;
  if (layoutOverrides) slide.layoutOverrides = layoutOverrides;

  if (requireContent) {
    const hasText = [
      slide.enTitle,
      slide.arTitle,
      slide.enBody,
      slide.arBody,
      slide.codeSnippet,
      slide.metricValue,
      slide.compareLeftTitle,
      slide.compareRightTitle,
      slide.imageUrl,
      slide.videoUrl,
      slide.ctaText,
      slide.diagramFooter,
    ].some((text) => typeof text === 'string' && text.trim().length > 0);
    const hasNodes =
      (slide.diagramNodes?.length ?? 0) > 0 ||
      (slide.icons?.length ?? 0) > 0 ||
      (slide.takeaways?.length ?? 0) > 0;
    if (!hasText && !hasNodes) return null;
  }

  return slide;
}

function parseGroundingSources(value: unknown): GroundingSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sources: GroundingSource[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const title = readString(item, 'title', 300);
    const url = readString(item, 'url', 1000);
    if (title && url) sources.push({ title, url });
  }
  return sources.length > 0 ? sources.slice(0, 20) : undefined;
}

function parseSourceMeta(value: unknown): PostSourceMeta | undefined {
  if (!isRecord(value)) return undefined;

  const meta: PostSourceMeta = {};
  const type = readEnum(value.type, ['article', 'screenshot', 'youtube', 'notes'] as const);
  const engine = readEnum(value.engine, [
    'grounded',
    'ungrounded',
    'offline',
    'gemini-ai',
    'offline-synthesizer',
  ] as const);
  const status = readEnum(value.status, ['verified_live', 'unverified_draft'] as const);

  const title = readString(value, 'title', 500);
  const creator = readString(value, 'creator', 200);
  const channel = readString(value, 'channel', 200);
  const url = readString(value, 'url', 1000);
  const published = readString(value, 'published', 100);
  const model = readString(value, 'model', 120);
  const inputMode = readString(value, 'inputMode', 100);
  const groundingQueries = readStringArray(value.groundingQueries, 20, 300);
  const groundingSources = parseGroundingSources(value.groundingSources);
  const isSearchGrounded = readBoolean(value, 'isSearchGrounded');
  const isFallback = readBoolean(value, 'isFallback');
  const userReviewed = readBoolean(value, 'userReviewed');

  if (type) meta.type = type;
  if (inputMode) meta.inputMode = inputMode;
  if (title) meta.title = title;
  if (creator) meta.creator = creator;
  if (channel) meta.channel = channel;
  if (url) meta.url = url;
  if (published) meta.published = published;
  if (groundingQueries) meta.groundingQueries = groundingQueries;
  if (groundingSources) meta.groundingSources = groundingSources;
  if (isSearchGrounded !== undefined) meta.isSearchGrounded = isSearchGrounded;
  if (isFallback !== undefined) meta.isFallback = isFallback;
  if (engine) meta.engine = engine;
  if (model) meta.model = model;
  if (status) meta.status = status;
  if (userReviewed !== undefined) meta.userReviewed = userReviewed;

  return Object.keys(meta).length > 0 ? meta : undefined;
}

function parseFacts(value: unknown): ExtractedFact[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const facts: ExtractedFact[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const text = readString(item, 'text', 1000);
    if (!text) continue;
    const fact: ExtractedFact = {
      text,
      type: readEnum(item.type, FACT_TYPES) ?? 'claim',
      verified: readEnum(item.verified, FACT_STATUSES) ?? 'unverified',
    };
    const evidence = readString(item, 'evidence', 1000);
    const sourceUrl = readString(item, 'sourceUrl', 1000);
    const sourceTitle = readString(item, 'sourceTitle', 300);
    if (evidence) fact.evidence = evidence;
    if (sourceUrl) fact.sourceUrl = sourceUrl;
    if (sourceTitle) fact.sourceTitle = sourceTitle;
    facts.push(fact);
  }
  return facts.length > 0 ? facts.slice(0, 30) : undefined;
}

function parseCaptionVariants(value: unknown): CaptionVariant[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const variants: CaptionVariant[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const style = readString(item, 'style', 200);
    const caption = readString(item, 'caption', 10_000);
    if (style && caption) variants.push({ style, caption });
  }
  return variants.length > 0 ? variants.slice(0, 10) : undefined;
}

function parseHookVariants(value: unknown): HookVariant[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const variants: HookVariant[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const tag = readString(item, 'tag', 100);
    const enTitle = readString(item, 'enTitle', 500);
    const arTitle = readString(item, 'arTitle', 500);
    const enBody = readString(item, 'enBody', 1200);
    const arBody = readString(item, 'arBody', 1200);
    if (!tag || !enTitle || !arTitle || !enBody || !arBody) continue;
    const variant: HookVariant = { tag, enTitle, arTitle, enBody, arBody };
    const centerIcon = readString(item, 'centerIcon', 500);
    if (centerIcon) variant.centerIcon = centerIcon;
    variants.push(variant);
  }
  return variants.length > 0 ? variants.slice(0, 10) : undefined;
}

function parseVisualOptions(value: unknown): VisualSystemOptions | undefined {
  if (!isRecord(value)) return undefined;
  const options: VisualSystemOptions = {};
  const showCadReticles = readBoolean(value, 'showCadReticles');
  const showSparklines = readBoolean(value, 'showSparklines');
  const terminalScanlines = readBoolean(value, 'terminalScanlines');
  if (showCadReticles !== undefined) options.showCadReticles = showCadReticles;
  if (showSparklines !== undefined) options.showSparklines = showSparklines;
  if (terminalScanlines !== undefined) options.terminalScanlines = terminalScanlines;
  return Object.keys(options).length > 0 ? options : undefined;
}

export interface ParseCarouselOptions {
  minSlides?: number;
  maxSlides?: number;
  requireSlideContent?: boolean;
}

/**
 * Runtime boundary parser for carousel payloads from Gemini, localStorage, and fallbacks.
 * Rejects malformed cores (non-object root, missing/empty slides) and normalizes every
 * optional field to a known-safe shape instead of trusting model or storage JSON.
 */
export function parseCarouselData(
  value: unknown,
  options: ParseCarouselOptions = {}
): CarouselData | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.slides)) return null;

  const explicitFormat = readEnum(value.postFormat, POST_FORMATS);
  const firstSlideRecord = isRecord(value.slides[0]) ? value.slides[0] : null;
  const isPosterOrSingleArchetype =
    firstSlideRecord?.type === 'poster' ||
    Array.isArray(firstSlideRecord?.takeaways) ||
    firstSlideRecord?.imageFrameMode === 'full' ||
    firstSlideRecord?.imageFrameMode === 'hero';
  const isSingleOrReelFormat =
    explicitFormat === 'single' ||
    explicitFormat === 'reel' ||
    (value.slides.length === 1 && isPosterOrSingleArchetype);
  const minSlides = isSingleOrReelFormat ? 1 : Math.max(1, options.minSlides ?? 1);
  const maxSlides = Math.max(minSlides, options.maxSlides ?? DEFAULT_MAX_SLIDES);

  if (value.slides.length < minSlides || value.slides.length > maxSlides) return null;

  const slides: SlideData[] = [];
  for (let index = 0; index < value.slides.length; index += 1) {
    const parsed = parseSlide(
      value.slides[index],
      index,
      value.slides.length,
      options.requireSlideContent ?? false
    );
    if (!parsed) return null;
    slides.push(parsed);
  }

  const carousel: CarouselData = {
    theme: readString(value, 'theme', 80) || 'teal',
    category: readString(value, 'category', 200) || 'SYSTEMS ARCHITECTURE',
    caption: readString(value, 'caption', 20_000) || '',
    slides,
  };

  if (explicitFormat) {
    carousel.postFormat = explicitFormat;
  } else if (slides.length === 1) {
    carousel.postFormat = 'single';
  }

  const dimensionPreset = readEnum(value.dimensionPreset, DIMENSION_PRESETS);
  const id = readString(value, 'id', 200);
  const brand = readString(value, 'brand', 100);
  const brandUrl = readString(value, 'brandUrl', 500);
  const channel = readString(value, 'channel', 200);
  const firstComment = readString(value, 'firstComment', 5000);
  const shortCaption = readString(value, 'shortCaption', 3000);
  const screenHook = readString(value, 'screenHook', 1000);
  const scheduleSlot = readString(value, 'scheduleSlot', 300);
  const sourceMeta = parseSourceMeta(value.sourceMeta);
  const facts = parseFacts(value.facts);
  const notesForHuman = readStringArray(value.notesForHuman, 20, 1000);
  const captionVariants = parseCaptionVariants(value.captionVariants);
  const hookVariants = parseHookVariants(value.hookVariants);
  const visualOptions = parseVisualOptions(value.visualOptions);
  const reelConfig = parseMotionReelConfig(value.reelConfig);

  if (dimensionPreset) carousel.dimensionPreset = dimensionPreset;
  if (id) carousel.id = id;
  if (brand) carousel.brand = brand;
  if (brandUrl) carousel.brandUrl = brandUrl;
  if (channel) carousel.channel = channel;
  if (firstComment) carousel.firstComment = firstComment;
  if (shortCaption) carousel.shortCaption = shortCaption;
  if (screenHook) carousel.screenHook = screenHook;
  if (scheduleSlot) carousel.scheduleSlot = scheduleSlot;
  if (sourceMeta) carousel.sourceMeta = sourceMeta;
  if (facts) carousel.facts = facts;
  if (notesForHuman) carousel.notesForHuman = notesForHuman;
  if (captionVariants) carousel.captionVariants = captionVariants;
  if (hookVariants) carousel.hookVariants = hookVariants;
  if (visualOptions) carousel.visualOptions = visualOptions;
  if (reelConfig) carousel.reelConfig = reelConfig;

  return carousel;
}

