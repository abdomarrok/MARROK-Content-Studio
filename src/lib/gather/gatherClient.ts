import type {
  CarouselData,
  PostFormat,
  PublishTargetPlatform,
  SavedPostRecord,
} from '../../types.ts';
import { analyzePostHistoryCadence } from '../theme/cadenceEngine.ts';
import { runAutonomousPipeline } from '../autonomousPipeline.ts';
import { condenseCarouselToSingleSlide, synthesizeCarousel } from '../synthesizer.ts';
import { saveValidPost } from '../storage/postsVaultClient.ts';
import {
  managePublishedPost,
  resolveNextFutureSlotForTime,
} from '../publish/publishClient.ts';

export type GatherSourceType =
  | 'reddit'
  | 'hn'
  | 'lobsters'
  | 'rss'
  | 'github'
  | 'custom-url'
  | 'curated';

export interface GatheredTopicItem {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  sourceType: GatherSourceType;
  author?: string;
  brand: string;
  brandUrl: string;
  domainCategory:
    | 'REVERSE ENGINEERING'
    | 'AI AGENTS & MODELS'
    | 'LINUX KERNEL'
    | 'KUBERNETES & CLOUD'
    | 'DISTRIBUTED SYSTEMS';
  publishedAt: string;
  score: number;
  summary: string;
  extractedMetrics: string[];
  recommendedFormat: 'carousel' | 'single' | 'reel';
  synthesisPrompt: string;
}

export interface GatheredCandidatePost {
  id: string;
  topic: GatheredTopicItem;
  deck: CarouselData;
  draftTitle: string;
  themeId: string;
  postFormat: PostFormat;
  generatedAt: string;
}

export interface TopicRadarResponse {
  ok: boolean;
  cached: boolean;
  fetchedAt: string;
  topics: GatheredTopicItem[];
  warning?: string;
}

export interface ExtractUrlResponse {
  ok: boolean;
  topic: GatheredTopicItem;
  rawTextLength: number;
}

const DISMISSED_TOPICS_KEY = 'marrok_dismissed_gather_topic_ids_v1';
const CUSTOM_RSS_FEEDS_KEY = 'marrok_custom_rss_feeds_v1';
const candidateDeckCache = new Map<string, GatheredCandidatePost>();

export function getDismissedGatherTopicIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_TOPICS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

export function dismissGatherTopicId(topicId: string): void {
  try {
    const current = getDismissedGatherTopicIds();
    current.add(topicId);
    localStorage.setItem(DISMISSED_TOPICS_KEY, JSON.stringify(Array.from(current).slice(-250)));
    candidateDeckCache.delete(topicId);
  } catch {
    // Ignore storage errors
  }
}

export function clearDismissedGatherTopicIds(): void {
  try {
    localStorage.removeItem(DISMISSED_TOPICS_KEY);
  } catch {
    // Ignore
  }
}

export function getSavedCustomRssFeeds(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_RSS_FEEDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function saveCustomRssFeeds(urls: string[]): void {
  try {
    const clean = Array.from(new Set(urls.map((u) => u.trim()).filter(Boolean))).slice(0, 6);
    localStorage.setItem(CUSTOM_RSS_FEEDS_KEY, JSON.stringify(clean));
  } catch {
    // Ignore
  }
}

/**
 * Fetches aggregated technical & social trend topics from /api/gather/radar.
 */
export async function fetchTopicRadar(options?: {
  source?: string;
  category?: string;
  refresh?: boolean;
  customRssUrls?: string[];
}): Promise<TopicRadarResponse> {
  const params = new URLSearchParams();
  if (options?.source && options.source !== 'all') {
    params.set('source', options.source);
  }
  if (options?.category && options.category !== 'all') {
    params.set('category', options.category);
  }
  if (options?.refresh) {
    params.set('refresh', 'true');
  }
  const rssList = options?.customRssUrls ?? getSavedCustomRssFeeds();
  if (rssList.length > 0) {
    params.set('customRss', rssList.join(','));
  }

  const query = params.toString();
  const res = await fetch(`/api/gather/radar${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch topic radar (${res.status})`);
  }

  return (await res.json()) as TopicRadarResponse;
}

/**
 * Extracts clean article content, metrics, and metadata from any public https:// URL.
 */
export async function extractArticleFromUrl(url: string): Promise<ExtractUrlResponse> {
  const res = await fetch('/api/gather/extract-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url.trim() }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Failed to extract URL (${res.status})`);
  }
  return data as ExtractUrlResponse;
}

function normalizeWords(str: string): string[] {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !/^(with|from|into|how|what|when|that|this|over|under)$/.test(w));
}

/**
 * Checks if a gathered topic is already represented in the user's Vault posts
 * (matching either exact URL or >= 65% title keyword overlap).
 */
export function isTopicAlreadyInVault(
  topic: GatheredTopicItem,
  savedPosts: SavedPostRecord[]
): SavedPostRecord | null {
  const cleanTopicUrl = (topic.url || '').trim().toLowerCase().replace(/\/+$/, '');
  const topicWords = normalizeWords(topic.title);

  for (const post of savedPosts) {
    const postBrandUrl = (post.deck?.brandUrl || '').trim().toLowerCase().replace(/\/+$/, '');
    const postSourceUrls = (post.deck?.sourceMeta?.groundingSources || []).map((s) =>
      (s.url || '').trim().toLowerCase().replace(/\/+$/, '')
    );

    if (
      cleanTopicUrl &&
      (postBrandUrl === cleanTopicUrl || postSourceUrls.includes(cleanTopicUrl))
    ) {
      return post;
    }

    if (topicWords.length >= 3) {
      const postWords = new Set(normalizeWords(post.title || post.deck?.slides?.[0]?.enTitle || ''));
      const matched = topicWords.filter((w) => postWords.has(w)).length;
      if (matched / topicWords.length >= 0.65) {
        return post;
      }
    }
  }

  return null;
}

/**
 * Builds a single GatheredCandidatePost (with auto-generated Draft Carousel Title and bilingual Slide Outlines)
 * from a GatheredTopicItem without polluting the user's saved Vault posts.
 */
export function buildCandidateFromTopicSync(
  topic: GatheredTopicItem,
  assignedThemeId: string,
  formatOverride: 'auto' | PostFormat = 'auto'
): GatheredCandidatePost {
  const targetFormat: PostFormat =
    formatOverride !== 'auto' ? formatOverride : topic.recommendedFormat || 'carousel';

  const cacheKey = `${topic.id}|${targetFormat}`;
  const existing = candidateDeckCache.get(cacheKey);
  if (existing) {
    return {
      ...existing,
      themeId: assignedThemeId,
      deck: {
        ...existing.deck,
        theme: assignedThemeId,
      },
    };
  }

  let deck = synthesizeCarousel({
    prompt: topic.synthesisPrompt,
    categoryHint: topic.domainCategory,
    postFormat: targetFormat === 'single' ? 'single' : 'carousel',
  });

  if (targetFormat === 'single' && deck.slides.length > 1) {
    deck = condenseCarouselToSingleSlide(deck);
  }

  const draftTitle = deck.slides[0]?.enTitle || topic.title;
  const enrichedDeck: CarouselData = {
    ...deck,
    id: `candidate_${topic.id}`,
    theme: assignedThemeId,
    category: topic.domainCategory || deck.category || 'SYSTEMS ARCHITECTURE',
    brand: topic.brand || deck.brand || 'MARROK',
    brandUrl: topic.brandUrl || deck.brandUrl || 'marrok.org',
    postFormat: targetFormat,
    sourceMeta: {
      ...deck.sourceMeta,
      title: topic.title,
      creator: topic.author || topic.sourceName,
      channel: topic.sourceName,
      published: topic.publishedAt,
      url: topic.url,
      userReviewed: false,
      groundingSources: [
        { title: topic.title, url: topic.url },
        ...(deck.sourceMeta?.groundingSources || []),
      ],
    },
  };

  const candidate: GatheredCandidatePost = {
    id: topic.id,
    topic,
    deck: enrichedDeck,
    draftTitle,
    themeId: assignedThemeId,
    postFormat: targetFormat,
    generatedAt: new Date().toISOString(),
  };

  candidateDeckCache.set(cacheKey, candidate);
  return candidate;
}

/**
 * Background Content Gatherer:
 * Takes discovered social/RSS trend topics, excludes any topics already in the user's Vault or dismissed,
 * and automatically generates draft carousel titles and slide outlines in the background with non-repeating
 * theme colors. Never includes the user's own existing saved posts.
 */
export async function generateGatheredCandidatesInBackground(
  topics: GatheredTopicItem[],
  savedPosts: SavedPostRecord[],
  options?: {
    formatOverride?: 'auto' | PostFormat;
    onProgress?: (current: number, total: number, currentTitle: string) => void;
  }
): Promise<GatheredCandidatePost[]> {
  const dismissedIds = getDismissedGatherTopicIds();
  const freshTopics = topics.filter(
    (t) => !dismissedIds.has(t.id) && !isTopicAlreadyInVault(t, savedPosts)
  );

  const candidates: GatheredCandidatePost[] = [];
  const rollingHistory: SavedPostRecord[] = [...savedPosts];

  for (let i = 0; i < freshTopics.length; i++) {
    const topic = freshTopics[i];
    options?.onProgress?.(i + 1, freshTopics.length, topic.title);

    // Yield to browser event loop every 2 items so UI remains 60fps smooth while background generating outlines
    if (i > 0 && i % 2 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const cadence = analyzePostHistoryCadence(rollingHistory, undefined, {
      prompt: topic.synthesisPrompt,
      category: topic.domainCategory,
    });
    const assignedThemeId = cadence.recommendedThemeId || 'teal';

    const candidate = buildCandidateFromTopicSync(
      topic,
      assignedThemeId,
      options?.formatOverride || 'auto'
    );
    candidates.push(candidate);

    // Advance virtual history so every candidate in the gathered list gets a distinct, harmonious theme color
    rollingHistory.unshift({
      id: candidate.id,
      title: candidate.draftTitle,
      category: topic.domainCategory,
      creatorHandle: '@MARROK',
      postStatus: 'posted',
      postedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: candidate.deck.slides.length,
      qaPassed: true,
      deck: candidate.deck,
    });
  }

  return candidates;
}

export interface AcceptCandidatesResult {
  scheduledPosts: SavedPostRecord[];
  failedCandidates: Array<{ title: string; error: string }>;
}

/**
 * Accepts one or more GatheredCandidatePosts, saves them to the Vault as reviewed (`userReviewed: true`),
 * and schedules them into their strictly validated future schedule slots (`10:00` · `12:00` · `18:00`).
 */
export async function acceptGatheredCandidatesIntoSchedule(
  items: Array<{
    candidate: GatheredCandidatePost;
    datePart: string;
    timeShort: string;
    targets: PublishTargetPlatform[];
  }>,
  options?: {
    requeueBuffer?: boolean;
    scheduleImmediately?: boolean;
    onProgress?: (current: number, total: number, title: string) => void;
  }
): Promise<AcceptCandidatesResult> {
  const scheduledPosts: SavedPostRecord[] = [];
  const failedCandidates: Array<{ title: string; error: string }> = [];
  const shouldSchedule = options?.scheduleImmediately !== false;

  for (let i = 0; i < items.length; i++) {
    const { candidate, datePart, timeShort, targets } = items[i];
    options?.onProgress?.(i + 1, items.length, candidate.draftTitle);

    try {
      const cleanDeck: CarouselData = {
        ...candidate.deck,
        id: `gather_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        theme: candidate.themeId,
        postFormat: candidate.postFormat,
        sourceMeta: {
          ...candidate.deck.sourceMeta,
          userReviewed: true,
        },
      };

      const saved = await saveValidPost({
        deck: cleanDeck,
        postStatus: 'validated',
        title: candidate.draftTitle || cleanDeck.slides[0]?.enTitle || candidate.topic.title,
        allowOverride: true,
        userReviewed: true,
      });

      if (shouldSchedule) {
        // Strict Future-Only Guard: guarantee the slot is in the future even if time passed while reviewing
        const safeSlot = resolveNextFutureSlotForTime(datePart, timeShort);
        const managed = await managePublishedPost({
          postId: saved.id,
          action: 'reschedule',
          scheduledFor: safeSlot.isoDate,
          publishTargets: targets.length > 0 ? targets : ['instagram', 'facebook', 'linkedin', 'tiktok'],
          requeueBuffer: options?.requeueBuffer ?? true,
        });
        scheduledPosts.push(managed.post || saved);
      } else {
        scheduledPosts.push(saved);
      }

      // Mark topic as processed so it no longer appears in the unaccepted Content Gatherer inbox
      dismissGatherTopicId(candidate.topic.id);
    } catch (err) {
      failedCandidates.push({
        title: candidate.draftTitle,
        error: err instanceof Error ? err.message : 'Failed to accept and schedule post',
      });
    }
  }

  return { scheduledPosts, failedCandidates };
}

export interface BatchGatherResult {
  createdPosts: SavedPostRecord[];
  failedTopics: Array<{ title: string; error: string }>;
}

/**
 * Legacy helper preserved for backward compatibility & tests:
 * Batch-synthesizes selected gathered topics into the Vault as Pending Human Review drafts (`userReviewed: false`),
 * rotating non-repeating theme palettes via the Feed Color Cadence Engine.
 */
export async function synthesizeGatheredTopicsForReview(
  topics: GatheredTopicItem[],
  existingPosts: SavedPostRecord[],
  options?: {
    formatOverride?: 'auto' | PostFormat;
    useFastLocalEngine?: boolean;
    onProgress?: (current: number, total: number, currentTitle: string) => void;
  }
): Promise<BatchGatherResult> {
  const createdPosts: SavedPostRecord[] = [];
  const failedTopics: Array<{ title: string; error: string }> = [];
  const workingHistory: SavedPostRecord[] = [...existingPosts];

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    options?.onProgress?.(i + 1, topics.length, topic.title);

    try {
      const cadence = analyzePostHistoryCadence(workingHistory, undefined, {
        prompt: topic.synthesisPrompt,
        category: topic.domainCategory,
      });
      const assignedThemeId = cadence.recommendedThemeId || 'teal';
      const targetFormat: PostFormat =
        options?.formatOverride && options.formatOverride !== 'auto'
          ? options.formatOverride
          : topic.recommendedFormat || 'carousel';

      let deck: CarouselData;
      if (options?.useFastLocalEngine) {
        deck = synthesizeCarousel({
          prompt: topic.synthesisPrompt,
          categoryHint: topic.domainCategory,
          postFormat: targetFormat === 'single' ? 'single' : 'carousel',
        });
      } else {
        try {
          deck = await runAutonomousPipeline(topic.synthesisPrompt, {
            categoryHint: topic.domainCategory,
            postFormat: targetFormat === 'single' ? 'single' : 'carousel',
          });
        } catch {
          deck = synthesizeCarousel({
            prompt: topic.synthesisPrompt,
            categoryHint: topic.domainCategory,
            postFormat: targetFormat === 'single' ? 'single' : 'carousel',
          });
        }
      }

      if (targetFormat === 'single' && deck.slides.length > 1) {
        deck = condenseCarouselToSingleSlide(deck);
      }

      const enrichedDeck: CarouselData = {
        ...deck,
        id: `gather_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        theme: assignedThemeId,
        category: topic.domainCategory || deck.category || 'SYSTEMS ARCHITECTURE',
        brand: topic.brand || deck.brand || 'MARROK',
        brandUrl: topic.brandUrl || deck.brandUrl || 'marrok.org',
        postFormat: targetFormat,
        sourceMeta: {
          ...deck.sourceMeta,
          title: topic.title,
          creator: topic.author || topic.sourceName,
          channel: topic.sourceName,
          published: topic.publishedAt,
          url: topic.url,
          userReviewed: false,
          groundingSources: [
            { title: topic.title, url: topic.url },
            ...(deck.sourceMeta?.groundingSources || []),
          ],
        },
      };

      const saved = await saveValidPost({
        deck: enrichedDeck,
        postStatus: 'validated',
        title: topic.title,
        allowOverride: true,
        userReviewed: false,
      });

      createdPosts.push(saved);
      workingHistory.unshift({
        ...saved,
        postStatus: 'posted',
        postedAt: new Date().toISOString(),
      });
    } catch (err) {
      failedTopics.push({
        title: topic.title,
        error: err instanceof Error ? err.message : 'Synthesis failed',
      });
    }
  }

  return { createdPosts, failedTopics };
}
