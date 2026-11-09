export type ThemeMode = 'security' | 'engineering' | 'cyber' | 'violet' | 'blueprint' | 'monochrome' | 'emerald' | 'custom';

// Dynamic category type accepting any detected or custom domain
export type CategoryType = string;

export type SlideType = 'hub' | 'row' | 'number' | 'metric' | 'code' | 'compare' | 'image' | 'cta' | 'poster';

export interface SlideTakeawayItem {
  en: string;
  ar: string;
  icon?: string;
}

export interface IconLabelPair {
  icon: string;
  label: string;
}

export interface DiagramNode {
  label: string;
  sublabel?: string;
  status?: string;
  icon?: string;
}

export type DiagramVariant =
  | 'topology'
  | 'stack'
  | 'isolation'
  | 'takeaway'
  | 'scatter'
  | 'graph'
  | 'clusters'
  | 'split'
  | 'features';


export interface SlideData {
  type: SlideType;
  // Hub properties
  centerIcon?: string;
  centerTag?: string; // Center pill label for the hub (e.g. 'SYSTEM CORE', 'ENVOY MESH')
  satIcons?: string[];
  satLabels?: string[]; // Technical labels for the satellite nodes around the hub
  // Dynamic Labeled Technical Diagram properties (replaces static icon boxes)
  diagramVariant?: DiagramVariant;
  diagramNodes?: DiagramNode[]; // The 3 nodes, layers, or cells illustrating this specific slide
  diagramEdges?: string[];     // Protocol/action/dataflow labels on the connectors between nodes
  diagramFooter?: string;      // Bottom telemetry or summary spec line inside the diagram
  // Row properties
  icons?: IconLabelPair[];
  // Number Archetype properties (Spec §7 & §9.4: Big accent number step counter e.g. "01", "02")
  stepNumber?: string;       // e.g. "01", "02", "03"
  stepLabel?: string;        // e.g. "STEP 01", "PHASE 02", "KEY POINT"
  // Metric Card Archetype properties
  metricValue?: string;      // e.g. "200x", "0ms", "99.9%", "45GB"
  metricLabel?: string;      // e.g. "THROUGHPUT MULTIPLIER", "P99 LATENCY"
  metricDiff?: string;       // e.g. "▲ 12x vs legacy baseline", "▼ 85% memory overhead"
  metricIcon?: string;       // e.g. "zap", "gauge", "activity", "cpu"
  // Code / Terminal Window Archetype properties
  codeSnippet?: string;      // Multi-line code, bash, assembly or diff
  codeLanguage?: string;     // e.g. "bash", "rust", "python", "sql", "c"
  codeFileName?: string;     // e.g. "deploy.sh", "main.rs", "kernel.c"
  // Compare / Side-by-Side Archetype properties
  compareLeftTitle?: string;  // e.g. "Legacy Git"
  compareLeftBody?: string;   // e.g. "Full history clone\nBloated .git folder\nStalls at 100GB"
  compareRightTitle?: string; // e.g. "Scion / MARROK"
  compareRightBody?: string;  // e.g. "Lazy checkout\nVirtual file system\nInstant CI builds"
  // Image / Video / Web Visual & Branded Meme Archetype properties
  mediaType?: 'image' | 'video'; // Dynamic media type in central card ('image' | 'video')
  imageUrl?: string;          // Direct URL, local asset path, or data URL of meme, diagram, logo, or photo
  videoUrl?: string;          // Object URL, data URL, or asset path of video (.mp4, .webm, .mov)
  videoMimeType?: string;     // Video MIME type ('video/mp4' | 'video/webm' | 'video/quicktime')
  videoFileName?: string;     // Uploaded video filename
  videoDuration?: number;     // Video duration in seconds
  videoMuted?: boolean;       // Preview/export mute toggle (defaults to true in preview)
  videoPlaying?: boolean;     // Preview playback state (defaults to true)
  videoBorderRadius?: number; // Inner video border radius in px (defaults to 8px in contain mode)
  imageCaption?: string;      // Micro-badge label for the image/video
  imageFit?: 'contain' | 'cover'; // Fit mode inside the central card (defaults to contain)
  imageFilter?: 'hud' | 'invert' | 'tint' | 'clean'; // Theme integration filter (hud = blueprint dark blend, invert = dark mode inversion, tint = accent wash, clean = original)
  imageFrameMode?: 'full' | 'hero' | 'standard'; // 'full' = full-height captionless meme (1140px on 9:16, hides slide text below), 'hero' = tall meme + headline (820px), 'standard' = 430px card
  imageBgStyle?: 'theme' | 'white' | 'obsidian'; // Inner card backdrop fill (white is ideal for light-background memes)
  brandWatermark?: 'none' | 'bottom-right' | 'top-right' | 'bottom-left'; // Optional MARROK corner watermark badge on the image card
  imagePrompt?: string;       // Prompt used to generate or edit with gemini-nano-banana-2.1
  imageModel?: string;        // Model used (e.g. gemini-nano-banana-2.1)
  imageZoom?: number;         // Image framing zoom inside card (1.0 to 2.5, default 1.0)
  imagePanX?: number;         // Image horizontal pan percentage (-100 to +100, default 0)
  imagePanY?: number;         // Image vertical pan percentage (-100 to +100, default 0)
  // Key Takeaway Bullets (Single-Slide & Dense Infographic Posters)
  takeaways?: SlideTakeawayItem[];
  // Titles & Body
  enTitle?: string;
  arTitle?: string;
  enBody?: string;
  arBody?: string;
  ctaText?: string;
  url?: string;
  enCredit?: string;
  arCredit?: string;
  // Slide composition & Direct Graphical Control Overrides (Spec §21)
  compositionPreset?: SlideCompositionPreset;
  freeMoveLayout?: boolean;
  layoutOverrides?: Partial<Record<GraphicalElementId, ElementLayoutOverride>>;
}

export type GraphicalElementId =
  | 'headerBadge'
  | 'graphicCard'
  | 'titleBlock'
  | 'arabicTitleBlock'
  | 'bodyBlock'
  | 'arabicBodyBlock'
  | 'takeawaysBlock'
  | 'ctaButton'
  | 'attributionCard';

export type TextAlignment = 'left' | 'center' | 'right';

export type SlideCompositionPreset =
  | 'standard'
  | 'headline-first'
  | 'split-balanced'
  | 'visual-hero'
  | 'compact-editorial';

export interface ElementLayoutOverride {
  dx?: number;            // Horizontal offset in canvas pixels (-260 to +260)
  dy?: number;            // Vertical offset in canvas pixels (-600 to +600)
  scale?: number;         // Scale factor multiplier (0.6 to 1.5)
  opacity?: number;       // Opacity multiplier (0.1 to 1.0)
  align?: TextAlignment;  // Per-block horizontal text alignment ('left' | 'center' | 'right')
  hidden?: boolean;       // Whether the element is hidden on the slide
}

export interface HookVariant {
  tag: string; // e.g., "Curiosity", "Hard Metrics", "Problem / Contrast"
  enTitle: string;
  arTitle: string;
  enBody: string;
  arBody: string;
  centerIcon?: string;
}

export interface CaptionVariant {
  style: string; // e.g., "Bulletins & Metrics", "Narrative Breakdown"
  caption: string;
}

export interface ExtractedFact {
  text: string;
  type: 'number' | 'date' | 'name' | 'quote' | 'claim';
  verified: 'verified' | 'partially_verified' | 'unconfirmed' | 'unverified';
  evidence?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

export interface GroundingSource {
  title: string;
  url: string;
}

export interface PostSourceMeta {
  type?: 'article' | 'screenshot' | 'youtube' | 'notes';
  inputMode?: string;
  title?: string;
  creator?: string;
  channel?: string;
  url?: string;
  published?: string;
  groundingQueries?: string[];
  groundingSources?: GroundingSource[];
  isSearchGrounded?: boolean;
  isFallback?: boolean;
  engine?: 'grounded' | 'ungrounded' | 'offline' | 'gemini-ai' | 'offline-synthesizer';
  model?: string;
  status?: 'verified_live' | 'unverified_draft';
  userReviewed?: boolean;
}

export type PostFormat = 'carousel' | 'single' | 'reel';

export type CanvasDimensionPreset =
  | 'tiktok-9:16'
  | 'ig-4:5'
  | 'ig-3:4'
  | 'ig-1:1'
  | 'ig-9:16';

export type MotionTemplateId =
  | 'marrok-slides'
  | 'kinetic-text'
  | 'brand-intro'
  | 'product-showcase';

export type MotionTransitionType =
  | 'auto'
  | 'morph'
  | 'depth'
  | 'kinetic-wipe'
  | 'whip-pan';

export type MotionSfxType = 'click' | 'pop' | 'thump' | 'whoosh' | 'chime';

export type MotionSfxProfile = 'warm-foley' | 'minimal-sub' | 'silent';

export interface MotionBrandConfig {
  name: string;
  accentColor: string;
  bgColor: string;
  textColor: string;
  font: string;
  direction: 'rtl' | 'ltr';
  surfaceColor?: string;
  surfaceBorder?: string;
  alertColor?: string;
  category?: string;
  channel?: string;
}

export interface MotionSceneConfig {
  id: string;
  label: string;
  text: string;
  from: number;
  to: number;
  springK: number;
  springD: number;
  transition?: MotionTransitionType;
  // Rich MARROK slide fields so every scene can render like an animated MARROK slide
  slideType?: SlideType;
  enTitle?: string;
  arTitle?: string;
  enBody?: string;
  arBody?: string;
  stepNumber?: string;
  metricValue?: string;
  metricLabel?: string;
  codeSnippet?: string;
  nodes?: string[];
  ctaText?: string;
}

export interface MotionTemplateConfig {
  brand: MotionBrandConfig;
  duration: number;
  scenes: MotionSceneConfig[];
  category?: string;
  channel?: string;
  showCadReticles?: boolean;
  defaultTransition?: MotionTransitionType;
  sfxProfile?: MotionSfxProfile;
}

export interface MotionTemplateMeta {
  id: MotionTemplateId;
  name: string;
  description: string;
  category: string;
  tags: string[];
}

export interface MotionCueItem {
  t: number;
  type: MotionSfxType;
  amp: number;
}

export interface MotionReelData {
  templateId: MotionTemplateId;
  brand: MotionBrandConfig;
  duration: number;
  scenes: MotionSceneConfig[];
  sfxEnabled?: boolean;
  sfxProfile?: MotionSfxProfile;
  defaultTransition?: MotionTransitionType;
  languageMode?: 'ar' | 'en' | 'bilingual';
  category?: string;
  channel?: string;
  showCadReticles?: boolean;
}

export interface CarouselData {
  id?: string;
  postFormat?: PostFormat;
  dimensionPreset?: CanvasDimensionPreset;
  theme: string;
  category: string;
  brand?: string;    // Brand wordmark / watermark (defaults to 'MARROK' or creator handle)
  brandUrl?: string; // Website URL or handle (defaults to 'marrok.org')
  channel?: string;  // Creator / channel attribution handle
  caption: string;
  firstComment?: string; // Spec §8 & §18: Pinned first comment with reference links
  shortCaption?: string; // Spec §8: 2-line short caption variant
  screenHook?: string;   // Spec §8: 3-second on-screen hook
  sourceMeta?: PostSourceMeta; // Spec §4 & §11: Source metadata
  facts?: ExtractedFact[];     // Spec §4 & §11: Extracted and verified facts
  notesForHuman?: string[];    // Spec §11 & §18: Human review notes and caveats
  scheduleSlot?: string;       // Spec §14 & §17: Recommended posting slot (e.g. "18:00 DZ")
  captionVariants?: CaptionVariant[];
  hookVariants?: HookVariant[];
  slides: SlideData[];
  reelConfig?: MotionReelData;
  visualOptions?: VisualSystemOptions; // Phase 1-3 visual graphics system toggles
}

export interface VisualSystemOptions {
  showCadReticles?: boolean;   // Corner CAD crosshairs (+) and boundary ticks (default true)
  showSparklines?: boolean;    // Acceleration sparkline curve & gauge meter on metric slides (default true)
  terminalScanlines?: boolean; // Subtle 3.5% CRT scanline grid on code terminal slides (default true)
}

export interface ThemePalette {
  id: string;
  name: string;
  baseBg: string;         // Canvas background hex
  radialGlow: string;     // Radial ambient glow
  gridLine: string;       // Grid line stroke rgba
  surface: string;        // Elevated card surface hex
  surfaceBorder: string;  // Border stroke hex
  accent: string;         // Primary neon accent hex
  alert: string;          // Secondary / alert accent hex
  iconStroke: string;     // Dark stroke for icons inside colored badges
  textWhite: string;      // Bold headlines & titles
  textEnBody: string;     // English body text
  textArBody: string;     // Arabic body text
  microLabel: string;     // Micro card labels
  categoryTag: string;    // Category badge color
  textMuted: string;      // Footer and secondary metadata
  // Visual graphics system toggles
  showCadReticles?: boolean;
  showSparklines?: boolean;
  terminalScanlines?: boolean;
}

export type ThemeConfig = ThemePalette;

export type SavedPostStatus = 'validated' | 'posted';

export type SavedPostStorageEngine =
  | 'neon-postgres'
  | 'cloud-kv'
  | 'vercel-tmp'
  | 'local-disk'
  | 'browser-vault';

export type PublishTargetPlatform = 'instagram' | 'facebook' | 'linkedin' | 'tiktok';

export type PublishScheduleMode = 'shareNow' | 'addToQueue' | 'customScheduled';

export interface BufferChannelInfo {
  id: string;
  name: string;
  service: PublishTargetPlatform;
  handle: string;
  queuedCount: number;
  queueLimit: number;
  provider: 'buffer' | 'zernio' | 'metricool';
}

export interface SavedPostRecord {
  id: string;
  title: string;
  category: string;
  postStatus: SavedPostStatus;
  createdAt: string;
  updatedAt: string;
  postedAt?: string;
  creatorHandle: string;
  slideCount: number;
  qaPassed: boolean;
  storageEngine?: SavedPostStorageEngine;
  deck: CarouselData;
  // Publishing, Scheduling & Cloudinary Auto-Cleanup Metadata
  scheduledFor?: string;
  publishTargets?: PublishTargetPlatform[];
  hostedSlideUrls?: string[];
  tiktokHostedSlideUrls?: string[];
  cloudinaryPublicIds?: string[];
  cloudinaryCleanedAt?: string;
  bufferPostIds?: string[];
  zernioPostIds?: string[];
  countedInMetricoolMonth?: string;
}

// Re-export immutable palette repositories for backwards compatibility
export { DEFAULT_PALETTES, SPEC_PALETTES, THEME_CONFIGS } from './lib/theme/palettes.ts';


