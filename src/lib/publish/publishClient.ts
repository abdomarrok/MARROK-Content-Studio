import type {
  BufferChannelInfo,
  CanvasDimensionPreset,
  CarouselData,
  PublishScheduleMode,
  PublishTargetPlatform,
  SavedPostRecord,
  ThemePalette,
} from '../../types.ts';
import { renderSlideToCanvas } from '../canvas/renderSlide.ts';
import { syncLocalVaultAfterManage } from '../storage/postsVaultClient.ts';

export type WeeklyCadencePreset = 'mon-wed-fri' | 'tue-thu-sat' | 'weekdays' | 'daily';

export type ChannelRoutingMode = 'hybrid-buffer-api' | 'all-metricool-csv';

export interface PublishStatusResponse {
  cloudinaryConfigured: boolean;
  cloudinaryCloudName: string | null;
  bufferApiConfigured: boolean;
  zernioApiConfigured?: boolean;
  zernioMcpUrl?: string;
  autoCleanedPostIds: string[];
  currentMonthKey: string;
  metricoolUsedThisMonth: number;
  metricoolMonthlyLimit: number;
  bufferQueueLimitPerChannel: number;
  stagedCloudinarySlidesCount: number;
  cleanedCloudinaryPostsCount: number;
  channels: BufferChannelInfo[];
}

export interface UploadPublishMediaResponse {
  postId: string;
  urls: string[];
  publicIds: string[];
  provider: 'cloudinary' | 'local-staging';
}

export interface TikTokCommercialTrack {
  musicSoundId: string;
  trackId: string;
  name: string;
  artist: string;
  genres: string[];
  durationSec: number;
  previewUrl: string;
  thumbnailUrl?: string;
  rank: number;
}

export interface TikTokMusicCatalogResponse {
  configured: boolean;
  accountId: string | null;
  username?: string;
  tracks: TikTokCommercialTrack[];
}

export interface DispatchPublishPayload {
  postId?: string;
  deck?: CarouselData;
  title?: string;
  caption?: string;
  mode: PublishScheduleMode;
  dueAt?: string;
  timezone?: string;
  targets: PublishTargetPlatform[];
  imageUrls: string[];
  tiktokImageUrls?: string[];
  cloudinaryPublicIds: string[];
  autoCleanupImmediate?: boolean;
  tiktokSettings?: {
    privacyLevel?: string;
    photoCoverIndex?: number;
    autoAddMusic?: boolean;
    allowComment?: boolean;
    title?: string;
    musicSoundId?: string;
  };
}

export interface ChannelDispatchResult {
  service: PublishTargetPlatform;
  provider: 'buffer' | 'zernio' | 'metricool-csv';
  ok: boolean;
  bufferPostId?: string;
  zernioPostId?: string;
  message?: string;
}

export interface DispatchPublishResponse {
  ok: boolean;
  mode: PublishScheduleMode;
  scheduledFor: string | null;
  cloudinaryCleaned: boolean;
  cleanedPublicIds: string[];
  post: SavedPostRecord | null;
  bufferDispatchedCount?: number;
  bufferFailedCount?: number;
  channelResults?: ChannelDispatchResult[];
  warnings?: string[];
  quotaStats: Omit<
    PublishStatusResponse,
    | 'cloudinaryConfigured'
    | 'cloudinaryCloudName'
    | 'bufferApiConfigured'
    | 'zernioApiConfigured'
    | 'zernioMcpUrl'
    | 'autoCleanedPostIds'
  >;
}

export interface MetricoolTemplateOptions {
  linkedInImagesAsCarousel: boolean;
  tiktokAutoAddMusic: boolean;
  tiktokPostPrivacy: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY' | 'FOLLOWER_OF_CREATOR';
  tiktokPhotoCoverIndex: number;
  tiktokDisableComments: boolean;
  tiktokDisableDuet: boolean;
  tiktokDisableStitch: boolean;
  tiktokAiGenerated: boolean;
  instagramPostType: 'POST' | 'REEL' | 'TRIAL_REEL' | 'STORY';
  facebookPostType: 'POST' | 'REEL' | 'STORY';
  shortener: boolean;
  isDraft: boolean;
  brandName: string;
}

export const DEFAULT_METRICOOL_TEMPLATE_OPTIONS: MetricoolTemplateOptions = {
  linkedInImagesAsCarousel: true,
  tiktokAutoAddMusic: true,
  tiktokPostPrivacy: 'PUBLIC_TO_EVERYONE',
  tiktokPhotoCoverIndex: 0,
  tiktokDisableComments: false,
  tiktokDisableDuet: false,
  tiktokDisableStitch: false,
  tiktokAiGenerated: false,
  instagramPostType: 'POST',
  facebookPostType: 'POST',
  shortener: false,
  isDraft: false,
  brandName: 'Marrok',
};

export interface MetricoolCsvRowInput {
  id?: string;
  postTitle?: string;
  text: string;
  scheduledDateIso: string;
  isDraft?: boolean;
  targets: PublishTargetPlatform[];
  imageUrls: string[];
  altTexts?: string[];
  documentTitle?: string;
  firstCommentText?: string;
  tiktokTitle?: string;
  templateOptions?: Partial<MetricoolTemplateOptions>;
}

export interface ScheduledSlotAssignment {
  index: number;
  isoDate: string;
  datePart: string; // YYYY-MM-DD
  timePart: string; // HH:mm:ss
  readableLabel: string;
}

/**
 * Exact 99-column header specification from Metricool's official Mtr_calendar_template.csv
 */
export const OFFICIAL_METRICOOL_CSV_HEADERS: readonly string[] = [
  'Text',
  'Date',
  'Time',
  'Draft',
  'Facebook',
  'Twitter/X',
  'LinkedIn',
  'GBP',
  'Instagram',
  'Pinterest',
  'TikTok',
  'Youtube',
  'Threads',
  'Bluesky',
  'Picture Url 1',
  'Picture Url 2',
  'Picture Url 3',
  'Picture Url 4',
  'Picture Url 5',
  'Picture Url 6',
  'Picture Url 7',
  'Picture Url 8',
  'Picture Url 9',
  'Picture Url 10',
  'Alt text picture 1',
  'Alt text picture 2',
  'Alt text picture 3',
  'Alt text picture 4',
  'Alt text picture 5',
  'Alt text picture 6',
  'Alt text picture 7',
  'Alt text picture 8',
  'Alt text picture 9',
  'Alt text picture 10',
  'Document title',
  'Shortener',
  'Video Thumbnail Url',
  'Video Cover Frame',
  'Twitter/X Can reply',
  'Twitter/X Type',
  'Twitter/X Poll Duration minutes',
  'Twitter/X Poll Option 1',
  'Twitter/X Poll Option 2',
  'Twitter/X Poll Option 3',
  'Twitter/X Poll Option 4',
  'Pinterest Board',
  'Pinterest Pin Title',
  'Pinterest Pin Link',
  'Pinterest Pin New Format',
  'Pinterest AI generated content',
  'Pinterest AI generated person',
  'Instagram Post Type',
  'Instagram Show Reel On Feed',
  'Instagram Trial Reel Share Automatically',
  'Youtube Video Title',
  'Youtube Video Type',
  'Youtube Video Privacy',
  'Youtube video for kids',
  'Youtube AI generated content',
  'Youtube notify subscribers',
  'Youtube Video Category',
  'Youtube Video Tags',
  'Youtube playlist',
  'GBP Post Type',
  'Facebook Post Type',
  'Facebook Title',
  'First Comment Text',
  'TikTok Title',
  'TikTok disable comments',
  'TikTok disable duet',
  'TikTok disable stitch',
  'TikTok Post Privacy',
  'TikTok Branded Content',
  'TikTok Your Brand',
  'TikTok Auto Add Music',
  'TikTok Photo Cover Index',
  'TikTok musicId',
  'TikTok music title',
  'TikTok music author',
  'TikTok music previewUrl',
  'TikTok music thumbnailUrl',
  'TikTok music soundVolume',
  'TikTok music originalVolume',
  'TikTok music startMillis',
  'TikTok music endMillis',
  'TikTok Ai generated content',
  'LinkedIn Type',
  'LinkedIn Poll Question',
  'LinkedIn Poll Option 1',
  'LinkedIn Poll Option 2',
  'LinkedIn Poll Option 3',
  'LinkedIn Poll Option 4',
  'LinkedIn Poll Duration',
  'LinkedIn Show link preview',
  'LinkedIn Images as Carousel',
  'Threads Reply Control',
  'Threads Is Spoiler',
  'Threads Post Type',
  'Brand name',
];

/**
 * Strips any leading paragraph or hook from a TikTok caption if it duplicates the TikTok title,
 * preventing TikTok Photo Mode from displaying the identical headline twice in a row.
 */
export function stripLeadingDuplicateTikTokTitle(description: string, title?: string): string {
  if (!description || !title) return description || '';
  const cleanTitle = title.trim();
  if (!cleanTitle) return description;

  const normalize = (str: string) =>
    str
      .toLowerCase()
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .replace(/[⚡️🔥✨🚀🔹•\n\r\t.,:;!?\-_/\\|()[\]{}'"]+/g, ' ')
      .trim();

  const normTitle = normalize(cleanTitle);
  if (!normTitle) return description;

  const lines = description.split(/\r?\n/);
  let firstNonEmptyIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().length > 0) {
      firstNonEmptyIdx = i;
      break;
    }
  }

  if (firstNonEmptyIdx === -1) return description;

  const firstLine = lines[firstNonEmptyIdx].trim();
  const normFirstLine = normalize(firstLine);

  // Split title parts (e.g. 'EN | AR')
  const titleParts = cleanTitle.split('|').map((p) => normalize(p)).filter((p) => p.length >= 6);

  const isDuplicate =
    normFirstLine === normTitle ||
    (normFirstLine.length >= 8 && normTitle.includes(normFirstLine)) ||
    (normTitle.length >= 8 && normFirstLine.includes(normTitle)) ||
    titleParts.some(
      (tp) =>
        (tp.length >= 8 && normFirstLine.includes(tp)) ||
        (normFirstLine.length >= 8 && tp.includes(normFirstLine))
    );

  if (isDuplicate) {
    const remainingLines = lines.slice(firstNonEmptyIdx + 1);
    while (remainingLines.length > 0 && remainingLines[0].trim().length === 0) {
      remainingLines.shift();
    }
    const result = remainingLines.join('\n').trim();
    return result || description;
  }

  return description;
}

/**
 * Auto-derives a TikTok Title (<= 90 characters) from a CarouselData deck for Metricool TikTok photo posts.
 */
export function deriveMetricoolTikTokTitle(deck: CarouselData): string {
  const firstSlide = deck.slides[0];
  const en = (firstSlide?.enTitle || deck.category || 'MARROK Engineering Brief').trim();
  const ar = (firstSlide?.arTitle || '').trim();
  const combined = ar ? `${en} | ${ar}` : en;
  if (combined.length <= 90) return combined;
  if (en.length <= 90) return en;
  return `${en.slice(0, 87).trim()}...`;
}

/**
 * Auto-derives a LinkedIn Document Title (<= 58 characters) for LinkedIn PDF Carousel posts.
 */
export function deriveMetricoolDocumentTitle(deck: CarouselData): string {
  const raw = (deck.slides[0]?.enTitle || deck.category || 'MARROK Architecture Brief').trim();
  if (raw.length <= 58) return raw;
  return `${raw.slice(0, 55).trim()}...`;
}

/**
 * Auto-derives the First Comment Text from verified citations, sources, or takeaway summary.
 */
export function deriveMetricoolFirstComment(deck: CarouselData): string {
  if (deck.firstComment && deck.firstComment.trim().length > 0) {
    return deck.firstComment.trim();
  }
  const parts: string[] = [];
  const facts = deck.facts || [];
  const grounding = deck.sourceMeta?.groundingSources || [];
  if (facts.length > 0) {
    const topFacts = facts
      .slice(0, 3)
      .map(
        (f) =>
          `• ${f.text}${f.sourceTitle ? ` — ${f.sourceTitle}` : ''}${
            f.sourceUrl ? ` (${f.sourceUrl})` : ''
          }`
      )
      .join('\n');
    parts.push(`Sources & Benchmarks // المصادر:\n${topFacts}`);
  } else if (grounding.length > 0) {
    const topSources = grounding
      .slice(0, 3)
      .map((g) => `• ${g.title} (${g.url})`)
      .join('\n');
    parts.push(`Sources // المصادر:\n${topSources}`);
  } else if (deck.sourceMeta?.title) {
    parts.push(
      `Reference // المصدر: ${deck.sourceMeta.title}${
        deck.sourceMeta.url ? ` (${deck.sourceMeta.url})` : ''
      }`
    );
  }
  parts.push('Save this breakdown for your next architecture review // احفظ هذا المنشور للرجوع إليه.');
  return parts.join('\n\n');
}

/**
 * Auto-derives up to 10 Alt Text strings from the deck's slides for accessibility & SEO.
 */
export function deriveMetricoolAltTexts(deck: CarouselData): string[] {
  return deck.slides.slice(0, 10).map((slide, idx) => {
    const en = (slide.enTitle || '').trim();
    const ar = (slide.arTitle || '').trim();
    const body = (slide.enBody || '').trim();
    const base = [
      `Slide ${idx + 1}: ${en}`,
      ar ? `(${ar})` : '',
      body ? `— ${body}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    return base.slice(0, 220);
  });
}

/**
 * Builds a complete MetricoolCsvRowInput from a CarouselData deck with auto-populated template fields.
 */
export function buildMetricoolCsvRowFromDeck(params: {
  id?: string;
  postTitle?: string;
  deck: CarouselData;
  scheduledDateIso: string;
  targets: PublishTargetPlatform[];
  imageUrls: string[];
  templateOptions?: Partial<MetricoolTemplateOptions>;
  customText?: string;
  customTikTokTitle?: string;
  customFirstComment?: string;
  customDocumentTitle?: string;
  customAltTexts?: string[];
}): MetricoolCsvRowInput {
  const {
    id,
    postTitle,
    deck,
    scheduledDateIso,
    targets,
    imageUrls,
    templateOptions,
    customText,
    customTikTokTitle,
    customFirstComment,
    customDocumentTitle,
    customAltTexts,
  } = params;

  const fallbackText =
    deck.caption ||
    `${deck.slides[0]?.enTitle || 'MARROK'}\n${deck.slides[0]?.arTitle || ''}\n\n${
      deck.slides[0]?.enBody || ''
    }\n\n#MARROK #SystemDesign`;

  return {
    id: id || deck.id,
    postTitle: postTitle || deck.slides[0]?.enTitle || 'Untitled Post',
    text: customText !== undefined ? customText : fallbackText,
    scheduledDateIso,
    isDraft: templateOptions?.isDraft ?? false,
    targets,
    imageUrls,
    altTexts: customAltTexts || deriveMetricoolAltTexts(deck),
    documentTitle: customDocumentTitle ?? deriveMetricoolDocumentTitle(deck),
    firstCommentText: customFirstComment ?? deriveMetricoolFirstComment(deck),
    tiktokTitle: (customTikTokTitle ?? deriveMetricoolTikTokTitle(deck)).slice(0, 90),
    templateOptions,
  };
}

/**
 * Renders all slides of a CarouselData deck to Q95 JPEG data URLs at the requested dimension preset.
 */
export async function renderDeckSlidesToDataUrls(
  carousel: CarouselData,
  preset: CanvasDimensionPreset = 'ig-4:5',
  customPalette?: ThemePalette,
  onProgress?: (current: number, total: number) => void
): Promise<{ index: number; dataUrl: string }[]> {
  const results: { index: number; dataUrl: string }[] = [];
  const total = carousel.slides.length;
  const deckForPreset: CarouselData = {
    ...carousel,
    dimensionPreset: preset,
  };

  for (let i = 0; i < total; i++) {
    onProgress?.(i + 1, total);
    await new Promise((r) => setTimeout(r, 0));
    const canvas = await renderSlideToCanvas(deckForPreset, i, undefined, customPalette);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    results.push({ index: i, dataUrl });
  }

  return results;
}

/**
 * Renders a deck's slides and uploads them to Cloudinary (via /api/publish/upload-media).
 */
export async function uploadDeckSlidesForPublishing(
  carousel: CarouselData,
  preset: CanvasDimensionPreset = 'ig-4:5',
  customPalette?: ThemePalette,
  onProgress?: (stage: string) => void
): Promise<UploadPublishMediaResponse> {
  const postId = carousel.id || `post_${Date.now()}`;
  const slides = await renderDeckSlidesToDataUrls(
    carousel,
    preset,
    customPalette,
    (cur, tot) => onProgress?.(`Rendering slide ${cur}/${tot} (${preset})...`)
  );

  const CHUNK_SIZE = 2;
  const allUrls: string[] = [];
  const allPublicIds: string[] = [];
  let provider: 'cloudinary' | 'local-staging' = 'cloudinary';

  for (let i = 0; i < slides.length; i += CHUNK_SIZE) {
    const chunk = slides.slice(i, i + CHUNK_SIZE);
    const startIdx = i + 1;
    const endIdx = Math.min(i + CHUNK_SIZE, slides.length);
    onProgress?.(`Uploading slides ${startIdx}${endIdx > startIdx ? `–${endIdx}` : ''} of ${slides.length} (${preset})...`);

    const res = await fetch('/api/publish/upload-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, slides: chunk }),
    });

    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || `Media upload failed on slide ${startIdx} (${res.status})`);
    }

    const data = (await res.json()) as UploadPublishMediaResponse;
    allUrls.push(...(data.urls || []));
    allPublicIds.push(...(data.publicIds || []));
    if (data.provider) provider = data.provider;
  }

  return {
    postId,
    urls: allUrls,
    publicIds: allPublicIds,
    provider,
  };
}

/**
 * Fetches current publishing status, connected channels, free plan quotas,
 * and triggers an automatic cleanup sweep of expired scheduled Cloudinary assets.
 */
export async function fetchPublishStatus(): Promise<PublishStatusResponse> {
  const res = await fetch('/api/publish/status', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch publish status (${res.status})`);
  }
  return (await res.json()) as PublishStatusResponse;
}

/**
 * Fetches trending licensed tracks from Zernio's TikTok Commercial Music Library.
 */
export async function fetchTikTokCommercialMusic(): Promise<TikTokMusicCatalogResponse> {
  const res = await fetch('/api/publish/tiktok-music', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch TikTok music catalog (${res.status})`);
  }
  return (await res.json()) as TikTokMusicCatalogResponse;
}

/**
 * Dispatches a post to Buffer GraphQL API / Vault schedule ledger.
 * When mode === 'shareNow', the server automatically destroys the staged Cloudinary assets after dispatch.
 */
export async function dispatchPostPublish(
  payload: DispatchPublishPayload
): Promise<DispatchPublishResponse> {
  const res = await fetch('/api/publish/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData.error || `Publish dispatch failed (${res.status})`);
  }

  const data = (await res.json()) as DispatchPublishResponse;
  if (data.post) {
    await syncLocalVaultAfterManage({ updatedPost: data.post });
  }
  return data;
}

export type PostLifecycleStage = 'draft' | 'scheduled' | 'posted' | 'attention';

export type PostManageAction = 'reschedule' | 'unschedule' | 'cancelAndDelete';

export interface ManagePublishedPostPayload {
  postId: string;
  action: PostManageAction;
  scheduledFor?: string;
  publishTargets?: PublishTargetPlatform[];
  requeueBuffer?: boolean;
}

export interface ManagePublishedPostResponse {
  ok: boolean;
  action: PostManageAction;
  deletedId?: string;
  cancelledBufferIds: string[];
  cleanedPublicIds?: string[];
  bufferPostIds?: string[];
  post: SavedPostRecord | null;
  posts: SavedPostRecord[];
  warnings: string[];
  quotaStats: Omit<
    PublishStatusResponse,
    'cloudinaryConfigured' | 'cloudinaryCloudName' | 'bufferApiConfigured' | 'autoCleanedPostIds'
  >;
}

/**
 * Classifies a SavedPostRecord into one of the 4 canonical Post Management lifecycle stages:
 * - 'attention': QA failed (!qaPassed)
 * - 'scheduled': scheduledFor is in the future (> nowMs)
 * - 'posted': postStatus === 'posted' OR scheduledFor time has arrived (<= nowMs)
 * - 'draft': postStatus === 'validated' and not scheduled
 */
export function derivePostLifecycleStage(
  post: SavedPostRecord,
  nowMs: number = Date.now()
): PostLifecycleStage {
  if (post.qaPassed === false) {
    return 'attention';
  }
  const scheduledMs = post.scheduledFor ? Date.parse(post.scheduledFor) : NaN;
  if (Number.isFinite(scheduledMs)) {
    if (scheduledMs > nowMs) {
      return 'scheduled';
    }
    return 'posted';
  }
  if (post.postStatus === 'posted') {
    return 'posted';
  }
  return 'draft';
}

/**
 * Executes a post management lifecycle action (reschedule, unschedule, or cancelAndDelete)
 * against /api/publish/manage-post and synchronizes the local IndexedDB Vault cache.
 */
export async function managePublishedPost(
  payload: ManagePublishedPostPayload
): Promise<ManagePublishedPostResponse> {
  const res = await fetch('/api/publish/manage-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData.error || `Post management action failed (${res.status})`);
  }

  const data = (await res.json()) as ManagePublishedPostResponse;
  await syncLocalVaultAfterManage({
    updatedPost: data.post,
    deletedId: data.deletedId,
  });
  return data;
}

/**
 * Triggers Cloudinary media cleanup (destroy) for specific publicIds, a postId,
 * all expired scheduled posts, or all staged assets (`forceAll`).
 */
export async function cleanupPublishedCloudinaryMedia(options?: {
  publicIds?: string[];
  postId?: string;
  forceAll?: boolean;
}): Promise<{
  cleanedPublicIds: string[];
  cleanedPostIds: string[];
  remainingStagedCount: number;
  cleanedCloudinaryPostsCount: number;
}> {
  const res = await fetch('/api/publish/cleanup-media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });

  if (!res.ok) {
    throw new Error(`Cloudinary cleanup failed (${res.status})`);
  }

  return await res.json();
}

/**
 * Returns today's date in the user's local timezone formatted as YYYY-MM-DD.
 * Avoids .toISOString().slice(0, 10) which uses UTC and shifts evening times into the next day.
 */
export function getLocalTodayDateStr(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Returns the next upcoming slot time on the SAME local day (HH:mm),
 * clamping late-night times to 23:55 so it never rolls over to tomorrow.
 */
export function getDefaultUpcomingTimeStr(now: Date = new Date()): string {
  const h = now.getHours();
  const m = now.getMinutes();
  if (h >= 23) {
    const safeMin = Math.min(59, Math.max(m + 5, 55));
    return `23:${String(safeMin).padStart(2, '0')}`;
  }
  if (m < 30) {
    return `${String(h).padStart(2, '0')}:30`;
  }
  return `${String(h + 1).padStart(2, '0')}:00`;
}

/**
 * Builds an ISO timestamp from a local YYYY-MM-DD and HH:mm without shifting the local calendar date.
 */
export function buildLocalScheduledIso(dateStr: string, timeStr = '18:00'): string {
  const cleanDate = (dateStr || getLocalTodayDateStr()).trim();
  const cleanTime = (timeStr || '18:00').trim();
  const [y, m, d] = cleanDate.split('-').map((n) => Number.parseInt(n, 10));
  const [hh, mm] = cleanTime.split(':').map((n) => Number.parseInt(n, 10));

  const fallback = new Date();
  const dt = new Date(
    Number.isFinite(y) ? y : fallback.getFullYear(),
    Number.isFinite(m) ? m - 1 : fallback.getMonth(),
    Number.isFinite(d) ? d : fallback.getDate(),
    Number.isFinite(hh) ? hh : 18,
    Number.isFinite(mm) ? mm : 0,
    0,
    0
  );
  return Number.isNaN(dt.getTime()) ? fallback.toISOString() : dt.toISOString();
}

/**
 * Extracts local YYYY-MM-DD and HH:mm(:ss) parts from an ISO date string or Date object.
 */
export function formatLocalDateTimeParts(
  isoOrDate: string | Date,
  fallbackDateStr?: string,
  fallbackTimeStr = '18:00'
): { datePart: string; timePart: string; timeShort: string } {
  const dt = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(dt.getTime())) {
    const safeDate = fallbackDateStr || getLocalTodayDateStr();
    const safeTime = (fallbackTimeStr || '18:00').slice(0, 5);
    return { datePart: safeDate, timePart: `${safeTime}:00`, timeShort: safeTime };
  }
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return {
    datePart: `${yyyy}-${mm}-${dd}`,
    timePart: `${hh}:${min}:00`,
    timeShort: `${hh}:${min}`,
  };
}

/**
 * Computes weekly schedule slots for a batch of Vault posts starting from the exact user-selected startDateStr.
 */
export function computeWeeklyScheduleSlots(
  count: number,
  startDateStr: string,
  cadence: WeeklyCadencePreset = 'mon-wed-fri',
  timeStr = '18:00'
): ScheduledSlotAssignment[] {
  const allowedDays: number[] =
    cadence === 'mon-wed-fri'
      ? [1, 3, 5] // Mon, Wed, Fri
      : cadence === 'tue-thu-sat'
      ? [2, 4, 6] // Tue, Thu, Sat
      : cadence === 'weekdays'
      ? [1, 2, 3, 4, 5]
      : [0, 1, 2, 3, 4, 5, 6]; // Daily

  const [hoursRaw, minutesRaw] = (timeStr || '18:00')
    .split(':')
    .map((n) => Number.parseInt(n, 10));
  const hours = Number.isFinite(hoursRaw) ? hoursRaw : 18;
  const minutes = Number.isFinite(minutesRaw) ? minutesRaw : 0;

  let cursor: Date;
  if (startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr.trim())) {
    const [y, m, d] = startDateStr
      .trim()
      .split('-')
      .map((n) => Number.parseInt(n, 10));
    cursor = new Date(y, m - 1, d, hours, minutes, 0, 0);
  } else {
    cursor = new Date();
    cursor.setHours(hours, minutes, 0, 0);
  }

  if (Number.isNaN(cursor.getTime())) {
    cursor = new Date();
    cursor.setHours(hours, minutes, 0, 0);
  }

  const slots: ScheduledSlotAssignment[] = [];
  let guard = 0;
  while (slots.length < count && guard < 366) {
    guard++;
    const dayOfWeek = cursor.getDay();
    if (allowedDays.includes(dayOfWeek)) {
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, '0');
      const dd = String(cursor.getDate()).padStart(2, '0');
      const hh = String(cursor.getHours()).padStart(2, '0');
      const min = String(cursor.getMinutes()).padStart(2, '0');

      const datePart = `${yyyy}-${mm}-${dd}`;
      const timePart = `${hh}:${min}:00`;
      const readableLabel =
        cursor.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }) + ` · ${hh}:${min}`;

      slots.push({
        index: slots.length,
        isoDate: cursor.toISOString(),
        datePart,
        timePart,
        readableLabel,
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return slots;
}

function escapeCsvCell(val: string): string {
  const normalized = String(val ?? '').replace(/\r\n/g, '\n');
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

/**
 * Generates an official 99-column Metricool Bulk Schedule CSV matching Mtr_calendar_template.csv
 * with Picture Url 1..10, Alt text picture 1..10, Document title, First Comment Text, TikTok Title,
 * LinkedIn Images as Carousel, TikTok Auto Add Music, and Brand name.
 */
export function generateMetricoolBulkCsv(rows: MetricoolCsvRowInput[]): string {
  const lines: string[] = [OFFICIAL_METRICOOL_CSV_HEADERS.join(',')];

  for (const row of rows) {
    const opts: MetricoolTemplateOptions = {
      ...DEFAULT_METRICOOL_TEMPLATE_OPTIONS,
      ...(row.templateOptions || {}),
    };

    const dt = new Date(row.scheduledDateIso);
    const validDate = Number.isNaN(dt.getTime()) ? new Date(Date.now() + 3600_000) : dt;

    const yyyy = validDate.getFullYear();
    const mm = String(validDate.getMonth() + 1).padStart(2, '0');
    const dd = String(validDate.getDate()).padStart(2, '0');
    const hh = String(validDate.getHours()).padStart(2, '0');
    const min = String(validDate.getMinutes()).padStart(2, '0');

    const dateStr = `${yyyy}-${mm}-${dd}`;
    const timeStr = `${hh}:${min}:00`;
    const isDraft = (row.isDraft ?? opts.isDraft) ? 'true' : 'false';

    const fb = row.targets.includes('facebook') ? 'true' : 'false';
    const ig = row.targets.includes('instagram') ? 'true' : 'false';
    const tt = row.targets.includes('tiktok') ? 'true' : 'false';
    const li = row.targets.includes('linkedin') ? 'true' : 'false';

    const picCols: string[] = [];
    const altCols: string[] = [];
    for (let i = 0; i < 10; i++) {
      const picUrl = row.imageUrls[i] || '';
      picCols.push(escapeCsvCell(picUrl));
      const altText = picUrl ? row.altTexts?.[i] || '' : '';
      altCols.push(escapeCsvCell(altText));
    }

    const docTitle = escapeCsvCell((row.documentTitle || '').slice(0, 58));
    const shortener = opts.shortener ? 'true' : 'false';
    const igPostType = escapeCsvCell(opts.instagramPostType || 'POST');
    const igShowReelOnFeed = opts.instagramPostType === 'REEL' ? 'true' : '';
    const fbPostType = escapeCsvCell(opts.facebookPostType || 'POST');
    const firstComment = escapeCsvCell(row.firstCommentText || '');
    const tiktokTitle = escapeCsvCell((row.tiktokTitle || '').slice(0, 90));
    const ttDisableComments = opts.tiktokDisableComments ? 'true' : 'false';
    const ttDisableDuet = opts.tiktokDisableDuet ? 'true' : 'false';
    const ttDisableStitch = opts.tiktokDisableStitch ? 'true' : 'false';
    const ttPrivacy = escapeCsvCell(opts.tiktokPostPrivacy || 'PUBLIC_TO_EVERYONE');
    const ttAutoMusic = opts.tiktokAutoAddMusic ? 'true' : 'false';
    const ttCoverIdx = String(opts.tiktokPhotoCoverIndex ?? 0);
    const ttAiGen = opts.tiktokAiGenerated ? 'true' : 'false';
    const liType = 'POST';
    const liCarousel = opts.linkedInImagesAsCarousel ? 'true' : 'false';
    const brandName = escapeCsvCell(opts.brandName || 'Marrok');

    const rowMap: Record<string, string> = {
      Text: escapeCsvCell(row.text),
      Date: escapeCsvCell(dateStr),
      Time: escapeCsvCell(timeStr),
      Draft: isDraft,
      Facebook: fb,
      'Twitter/X': 'false',
      LinkedIn: li,
      GBP: 'false',
      Instagram: ig,
      Pinterest: 'false',
      TikTok: tt,
      Youtube: 'false',
      Threads: 'false',
      Bluesky: 'false',
      'Picture Url 1': picCols[0],
      'Picture Url 2': picCols[1],
      'Picture Url 3': picCols[2],
      'Picture Url 4': picCols[3],
      'Picture Url 5': picCols[4],
      'Picture Url 6': picCols[5],
      'Picture Url 7': picCols[6],
      'Picture Url 8': picCols[7],
      'Picture Url 9': picCols[8],
      'Picture Url 10': picCols[9],
      'Alt text picture 1': altCols[0],
      'Alt text picture 2': altCols[1],
      'Alt text picture 3': altCols[2],
      'Alt text picture 4': altCols[3],
      'Alt text picture 5': altCols[4],
      'Alt text picture 6': altCols[5],
      'Alt text picture 7': altCols[6],
      'Alt text picture 8': altCols[7],
      'Alt text picture 9': altCols[8],
      'Alt text picture 10': altCols[9],
      'Document title': docTitle,
      Shortener: shortener,
      'Video Thumbnail Url': '',
      'Video Cover Frame': '',
      'Twitter/X Can reply': '',
      'Twitter/X Type': '',
      'Twitter/X Poll Duration minutes': '',
      'Twitter/X Poll Option 1': '',
      'Twitter/X Poll Option 2': '',
      'Twitter/X Poll Option 3': '',
      'Twitter/X Poll Option 4': '',
      'Pinterest Board': '',
      'Pinterest Pin Title': '',
      'Pinterest Pin Link': '',
      'Pinterest Pin New Format': 'false',
      'Pinterest AI generated content': 'false',
      'Pinterest AI generated person': 'false',
      'Instagram Post Type': igPostType,
      'Instagram Show Reel On Feed': igShowReelOnFeed,
      'Instagram Trial Reel Share Automatically': '',
      'Youtube Video Title': '',
      'Youtube Video Type': '',
      'Youtube Video Privacy': '',
      'Youtube video for kids': 'false',
      'Youtube AI generated content': 'false',
      'Youtube notify subscribers': 'true',
      'Youtube Video Category': '',
      'Youtube Video Tags': '',
      'Youtube playlist': '',
      'GBP Post Type': '',
      'Facebook Post Type': fbPostType,
      'Facebook Title': '',
      'First Comment Text': firstComment,
      'TikTok Title': tiktokTitle,
      'TikTok disable comments': ttDisableComments,
      'TikTok disable duet': ttDisableDuet,
      'TikTok disable stitch': ttDisableStitch,
      'TikTok Post Privacy': ttPrivacy,
      'TikTok Branded Content': 'false',
      'TikTok Your Brand': 'false',
      'TikTok Auto Add Music': ttAutoMusic,
      'TikTok Photo Cover Index': ttCoverIdx,
      'TikTok musicId': '',
      'TikTok music title': '',
      'TikTok music author': '',
      'TikTok music previewUrl': '',
      'TikTok music thumbnailUrl': '',
      'TikTok music soundVolume': '',
      'TikTok music originalVolume': '',
      'TikTok music startMillis': '',
      'TikTok music endMillis': '',
      'TikTok Ai generated content': ttAiGen,
      'LinkedIn Type': liType,
      'LinkedIn Poll Question': '',
      'LinkedIn Poll Option 1': '',
      'LinkedIn Poll Option 2': '',
      'LinkedIn Poll Option 3': '',
      'LinkedIn Poll Option 4': '',
      'LinkedIn Poll Duration': '',
      'LinkedIn Show link preview': 'false',
      'LinkedIn Images as Carousel': liCarousel,
      'Threads Reply Control': '',
      'Threads Is Spoiler': 'false',
      'Threads Post Type': '',
      'Brand name': brandName,
    };

    const recordCells = OFFICIAL_METRICOOL_CSV_HEADERS.map((col) => rowMap[col] ?? '');
    lines.push(recordCells.join(','));
  }

  return lines.join('\r\n');
}

/**
 * Triggers a browser download of the generated Metricool Bulk Schedule CSV.
 */
export function downloadMetricoolCsvFile(
  csvContent: string,
  filename = `Mtr_calendar_template_${new Date().toISOString().slice(0, 10)}.csv`
): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
