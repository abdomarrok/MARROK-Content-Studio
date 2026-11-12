import type {
  CarouselData,
  PostFormat,
  PublishTargetPlatform,
  SavedPostRecord,
} from '../../types.ts';
import { analyzePostHistoryCadence } from '../theme/cadenceEngine.ts';
import { runAutonomousPipeline } from '../autonomousPipeline.ts';
import {
  autoFinalizeCarouselDeck,
  autoFitSlideCopyToLimits,
  autoSyncSlideGraphicsFromCopy,
  condenseCarouselToSingleSlide,
  diversifyDeckArchetypesAndVisuals,
  synthesizeCarousel,
} from '../synthesizer.ts';
import { saveValidPost, syncLocalVaultAfterManage } from '../storage/postsVaultClient.ts';
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
  deck = autoFinalizeCarouselDeck(deck);

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
 * Full AI Synthesis with Deep Article Scraping:
 * Upgrades a gathered candidate post by scraping the full article text from its source URL
 * (when only a short RSS/social snippet is present) and running the full AI synthesis pipeline
 * (`runAutonomousPipeline`) so Slides 2-7 contain deep, article-grounded engineering mechanisms
 * and diverse visual archetypes rather than static offline templates.
 */
export async function synthesizeCandidateWithFullAi(
  candidate: GatheredCandidatePost,
  options?: {
    onStatus?: (msg: string) => void;
  }
): Promise<GatheredCandidatePost> {
  let enrichedTopic: GatheredTopicItem = candidate.topic;
  const targetFormat: PostFormat = candidate.postFormat || 'carousel';

  // 1. Scrape full article text if URL is public HTTP(S) and current summary is short
  if (
    enrichedTopic.url &&
    /^https?:\/\//i.test(enrichedTopic.url) &&
    !enrichedTopic.url.includes('news.ycombinator.com') &&
    (enrichedTopic.summary || '').length < 900
  ) {
    try {
      options?.onStatus?.(`Scraping full article from ${enrichedTopic.brand || enrichedTopic.sourceName}...`);
      const extracted = await extractArticleFromUrl(enrichedTopic.url);
      if (extracted?.ok && extracted.topic?.summary && extracted.topic.summary.length > (enrichedTopic.summary || '').length) {
        enrichedTopic = {
          ...enrichedTopic,
          summary: extracted.topic.summary,
          extractedMetrics:
            extracted.topic.extractedMetrics?.length > 0
              ? extracted.topic.extractedMetrics
              : enrichedTopic.extractedMetrics,
          synthesisPrompt: extracted.topic.synthesisPrompt || enrichedTopic.synthesisPrompt,
        };
      }
    } catch {
      // Proceed with existing topic summary if upstream site blocks scraping or is offline
    }
  }

  // 2. Run full AI synthesis pipeline on the scraped article prompt
  let aiDeck: CarouselData = candidate.deck;
  try {
    options?.onStatus?.(`Synthesizing ${targetFormat === 'single' ? '1-slide infographic' : '8-slide deck'} with AI...`);
    aiDeck = await runAutonomousPipeline(enrichedTopic.synthesisPrompt, {
      categoryHint: enrichedTopic.domainCategory,
      postFormat: targetFormat === 'single' ? 'single' : 'carousel',
      onProgress: options?.onStatus,
    });
    if (targetFormat === 'single' && aiDeck.slides.length > 1) {
      aiDeck = condenseCarouselToSingleSlide(aiDeck);
    }
  } catch {
    // Fallback to upgraded local synthesis with the newly scraped article summary
    aiDeck = synthesizeCarousel({
      prompt: enrichedTopic.synthesisPrompt,
      categoryHint: enrichedTopic.domainCategory,
      postFormat: targetFormat === 'single' ? 'single' : 'carousel',
    });
    if (targetFormat === 'single' && aiDeck.slides.length > 1) {
      aiDeck = condenseCarouselToSingleSlide(aiDeck);
    }
  }
  aiDeck = autoFinalizeCarouselDeck(aiDeck);

  const draftTitle = aiDeck.slides[0]?.enTitle || candidate.draftTitle || enrichedTopic.title;
  const upgradedDeck: CarouselData = {
    ...aiDeck,
    id: candidate.deck.id || `candidate_${enrichedTopic.id}`,
    theme: candidate.themeId,
    category: enrichedTopic.domainCategory || aiDeck.category || 'SYSTEMS ARCHITECTURE',
    brand: enrichedTopic.brand || aiDeck.brand || 'MARROK',
    brandUrl: enrichedTopic.brandUrl || aiDeck.brandUrl || 'marrok.org',
    postFormat: targetFormat,
    sourceMeta: {
      ...aiDeck.sourceMeta,
      title: enrichedTopic.title,
      creator: enrichedTopic.author || enrichedTopic.sourceName,
      channel: enrichedTopic.sourceName,
      published: enrichedTopic.publishedAt,
      url: enrichedTopic.url,
      userReviewed: false,
      groundingSources: [
        { title: enrichedTopic.title, url: enrichedTopic.url },
        ...(aiDeck.sourceMeta?.groundingSources || []),
      ],
    },
  };

  const upgradedCandidate: GatheredCandidatePost = {
    ...candidate,
    topic: enrichedTopic,
    deck: upgradedDeck,
    draftTitle,
    generatedAt: new Date().toISOString(),
  };

  const cacheKey = `${enrichedTopic.id}|${targetFormat}`;
  candidateDeckCache.set(cacheKey, upgradedCandidate);
  return upgradedCandidate;
}

/**
 * Accepts one or more GatheredCandidatePosts, automatically upgrades any offline outline
 * via full article scraping + AI synthesis, saves them to the Vault as reviewed (`userReviewed: true`),
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
    skipAiUpgrade?: boolean;
    onProgress?: (current: number, total: number, title: string) => void;
  }
): Promise<AcceptCandidatesResult> {
  const scheduledPosts: SavedPostRecord[] = [];
  const failedCandidates: Array<{ title: string; error: string }> = [];
  const shouldSchedule = options?.scheduleImmediately !== false;

  for (let i = 0; i < items.length; i++) {
    const { candidate: rawCandidate, datePart, timeShort, targets } = items[i];
    options?.onProgress?.(i + 1, items.length, rawCandidate.draftTitle);

    try {
      // Automatically upgrade candidate with full article scraping & AI synthesis if still an offline outline
      const needsAiUpgrade =
        !options?.skipAiUpgrade &&
        (rawCandidate.deck.sourceMeta?.isFallback !== false ||
          rawCandidate.deck.sourceMeta?.engine === 'offline-synthesizer' ||
          !rawCandidate.deck.sourceMeta?.engine);

      const candidate = needsAiUpgrade
        ? await synthesizeCandidateWithFullAi(rawCandidate)
        : rawCandidate;

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
        title: rawCandidate.draftTitle,
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

const LEGACY_BOILERPLATE_SLIDE_TITLES = new Set([
  'the architectural bottleneck.',
  'the architectural bottleneck',
  'core system architecture.',
  'core system architecture',
  'execution dataflow pipeline.',
  'execution dataflow pipeline',
  'non-blocking processing flow.',
  'non-blocking processing flow',
  'production reliability wins.',
  'production reliability wins',
  'the engineering tradeoff.',
  'the engineering tradeoff',
]);

/**
 * Detects whether a SavedPostRecord's deck contains legacy offline boilerplate slides
 * or repetitive low-signal patterns across Slides 2-7.
 */
export function isBoilerplateOrLowSignalDeck(deck?: CarouselData | null): boolean {
  if (!deck || !Array.isArray(deck.slides) || deck.slides.length <= 2) {
    return false;
  }

  const middleSlides = deck.slides.slice(1, deck.slides.length - 1);
  let boilerplateMatches = 0;
  for (const slide of middleSlides) {
    const cleanTitle = (slide.enTitle || '').trim().toLowerCase();
    if (LEGACY_BOILERPLATE_SLIDE_TITLES.has(cleanTitle)) {
      boilerplateMatches += 1;
    }
    const cleanBody = (slide.enBody || '').trim().toLowerCase();
    if (
      cleanBody.includes('traditional systems degrade under high scale') ||
      cleanBody.includes('decoupled components process data independently') ||
      cleanBody.includes('streamlined pipelines eliminate redundant serialization')
    ) {
      boilerplateMatches += 1;
    }
  }

  return boilerplateMatches >= 2;
}

/**
 * Diversifies a SavedPostRecord's visual archetypes and schematic variants across Slides 2-7
 * in-place and persists the updated record to the Vault.
 */
export async function diversifySavedPostVisuals(
  post: SavedPostRecord
): Promise<SavedPostRecord> {
  if (!post.deck || !Array.isArray(post.deck.slides) || post.deck.slides.length <= 2) {
    return post;
  }

  const diversifiedSlides = diversifyDeckArchetypesAndVisuals(post.deck.slides);
  const updatedDeck: CarouselData = {
    ...post.deck,
    slides: diversifiedSlides,
  };

  const updatedRecord: SavedPostRecord = {
    ...post,
    deck: updatedDeck,
    updatedAt: new Date().toISOString(),
  };

  await syncLocalVaultAfterManage({ updatedPost: updatedRecord });
  try {
    return await saveValidPost({
      deck: updatedDeck,
      postStatus: post.postStatus,
      title: post.title,
      allowOverride: true,
      userReviewed: true,
    });
  } catch {
    return updatedRecord;
  }
}

/**
 * Re-synthesizes an existing Vault post by scraping its primary source URL (if available)
 * or extracting its embedded context, running the Full AI pipeline (with upgraded NLP fallback
 * + visual diversification), and saving the upgraded deck back to the same Vault record.
 */
export async function resynthesizeSavedPostWithDeepAi(
  post: SavedPostRecord,
  options?: {
    onStatus?: (msg: string) => void;
  }
): Promise<SavedPostRecord> {
  const targetFormat: PostFormat =
    post.deck?.postFormat || (post.slideCount === 1 ? 'single' : 'carousel');
  const rawSourceUrl =
    post.deck?.sourceMeta?.url ||
    post.deck?.sourceMeta?.groundingSources?.[0]?.url ||
    (post.deck?.brandUrl && /^https?:\/\//i.test(post.deck.brandUrl) ? post.deck.brandUrl : '');

  let synthesisPrompt = '';
  let scrapedTitle = post.title.replace(/\s*\(Cloudflare\.?$/i, '').trim();
  let scrapedAuthor = post.creatorHandle || post.deck?.sourceMeta?.creator || post.deck?.brand || 'MARROK';
  let scrapedBrand = post.deck?.brand || 'MARROK';
  let scrapedBrandUrl = post.deck?.brandUrl || 'marrok.org';

  if (
    rawSourceUrl &&
    /^https?:\/\//i.test(rawSourceUrl) &&
    !rawSourceUrl.includes('news.ycombinator.com') &&
    !rawSourceUrl.includes('marrok.org')
  ) {
    try {
      options?.onStatus?.(`Scraping full article from ${rawSourceUrl}...`);
      const extracted = await extractArticleFromUrl(rawSourceUrl);
      if (extracted?.ok && extracted.topic?.synthesisPrompt) {
        synthesisPrompt = extracted.topic.synthesisPrompt;
        scrapedTitle = extracted.topic.title || scrapedTitle;
        scrapedAuthor = extracted.topic.author || extracted.topic.sourceName || scrapedAuthor;
        scrapedBrand = extracted.topic.brand || scrapedBrand;
        scrapedBrandUrl = extracted.topic.brandUrl || scrapedBrandUrl;
      }
    } catch {
      // Fallback to existing post context if upstream URL is unreachable
    }
  }

  if (!synthesisPrompt) {
    const existingFacts = (post.deck?.facts || [])
      .map((f) => f.text)
      .filter((t) => t && !t.startsWith('Primary architectural domain:') && !t.startsWith('Brand attribution:'))
      .join('\n• ');
    const captionContext = (post.deck?.caption || '')
      .replace(/⚡[^\n]*\n?/g, '')
      .slice(0, 2400);

    synthesisPrompt = [
      `Technical Topic: ${scrapedTitle}`,
      `Category: ${post.category || post.deck?.category || 'DISTRIBUTED SYSTEMS'}`,
      rawSourceUrl ? `Source URL: ${rawSourceUrl}` : '',
      existingFacts ? `Key Engineering Facts:\n• ${existingFacts}` : '',
      captionContext ? `Technical Summary & Engineering Context:\n${captionContext}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  let upgradedDeck: CarouselData;
  try {
    options?.onStatus?.(`Synthesizing deep technical deck for "${scrapedTitle.slice(0, 36)}"...`);
    upgradedDeck = await runAutonomousPipeline(synthesisPrompt, {
      categoryHint: post.category || post.deck?.category,
      postFormat: targetFormat === 'single' ? 'single' : 'carousel',
      onProgress: options?.onStatus,
    });
    if (targetFormat === 'single' && upgradedDeck.slides.length > 1) {
      upgradedDeck = condenseCarouselToSingleSlide(upgradedDeck);
    }
  } catch {
    upgradedDeck = synthesizeCarousel({
      prompt: synthesisPrompt,
      categoryHint: post.category || post.deck?.category,
      postFormat: targetFormat === 'single' ? 'single' : 'carousel',
    });
    if (targetFormat === 'single' && upgradedDeck.slides.length > 1) {
      upgradedDeck = condenseCarouselToSingleSlide(upgradedDeck);
    }
  }

  if (upgradedDeck.slides.length > 2) {
    upgradedDeck = {
      ...upgradedDeck,
      slides: diversifyDeckArchetypesAndVisuals(upgradedDeck.slides),
    };
  }

  const finalDeck: CarouselData = {
    ...upgradedDeck,
    id: post.id,
    theme: post.deck?.theme || upgradedDeck.theme || 'blueprint',
    category: post.category || upgradedDeck.category || 'DISTRIBUTED SYSTEMS',
    brand: scrapedBrand,
    brandUrl: scrapedBrandUrl,
    postFormat: targetFormat,
    sourceMeta: {
      ...upgradedDeck.sourceMeta,
      title: scrapedTitle,
      creator: scrapedAuthor,
      channel: post.deck?.sourceMeta?.channel || scrapedAuthor,
      url: rawSourceUrl || upgradedDeck.sourceMeta?.url,
      published: post.deck?.sourceMeta?.published || new Date().toISOString(),
      userReviewed: true,
    },
  };

  const finalTitle = finalDeck.slides[0]?.enTitle || scrapedTitle;
  const updatedRecord: SavedPostRecord = {
    ...post,
    title: finalTitle,
    slideCount: finalDeck.slides.length,
    qaPassed: true,
    updatedAt: new Date().toISOString(),
    deck: finalDeck,
  };

  await syncLocalVaultAfterManage({ updatedPost: updatedRecord });
  try {
    const saved = await saveValidPost({
      deck: finalDeck,
      postStatus: post.postStatus,
      title: finalTitle,
      allowOverride: true,
      userReviewed: true,
    });
    return {
      ...saved,
      scheduledFor: post.scheduledFor ?? saved.scheduledFor,
      publishTargets: post.publishTargets ?? saved.publishTargets,
      postedAt: post.postedAt ?? saved.postedAt,
    };
  } catch {
    return updatedRecord;
  }
}

/**
 * 1-Click Single-Slide AI Regeneration:
 * Scrapes the candidate's full article if needed, synthesizes fresh bilingual copy and
 * content-specific graphic elements for the target slide (`slideIndex`), and returns
 * the updated candidate while preserving all other slides and user edits in the deck.
 */
export async function regenerateSingleCandidateSlideWithAi(
  candidate: GatheredCandidatePost,
  slideIndex: number,
  options?: {
    preferredType?: CarouselData['slides'][number]['type'];
    onStatus?: (msg: string) => void;
  }
): Promise<GatheredCandidatePost> {
  const slides = [...(candidate.deck.slides || [])];
  if (slideIndex < 0 || slideIndex >= slides.length) {
    return candidate;
  }

  let enrichedTopic: GatheredTopicItem = candidate.topic;
  if (
    enrichedTopic.url &&
    /^https?:\/\//i.test(enrichedTopic.url) &&
    !enrichedTopic.url.includes('news.ycombinator.com') &&
    (enrichedTopic.summary || '').length < 900
  ) {
    try {
      options?.onStatus?.(`Scraping source article for Slide ${slideIndex + 1}...`);
      const extracted = await extractArticleFromUrl(enrichedTopic.url);
      if (
        extracted?.ok &&
        extracted.topic?.summary &&
        extracted.topic.summary.length > (enrichedTopic.summary || '').length
      ) {
        enrichedTopic = {
          ...enrichedTopic,
          summary: extracted.topic.summary,
          extractedMetrics:
            extracted.topic.extractedMetrics?.length > 0
              ? extracted.topic.extractedMetrics
              : enrichedTopic.extractedMetrics,
          synthesisPrompt: extracted.topic.synthesisPrompt || enrichedTopic.synthesisPrompt,
        };
      }
    } catch {
      // Proceed with existing summary if offline
    }
  }

  const currentSlide = slides[slideIndex];
  const otherTitles = slides
    .map((s, idx) => (idx !== slideIndex ? s.enTitle : ''))
    .filter(Boolean)
    .join(' | ');

  const targetedPrompt = [
    enrichedTopic.synthesisPrompt,
    `Focus for Slide ${slideIndex + 1} of ${slides.length}: Generate a distinct, high-signal technical insight that does not repeat [${otherTitles}].`,
  ].join('\n');

  let freshDeck: CarouselData;
  try {
    options?.onStatus?.(`Regenerating Slide ${slideIndex + 1} with AI...`);
    freshDeck = await runAutonomousPipeline(targetedPrompt, {
      categoryHint: enrichedTopic.domainCategory,
      postFormat: candidate.postFormat === 'single' ? 'single' : 'carousel',
    });
  } catch {
    freshDeck = synthesizeCarousel({
      prompt: targetedPrompt,
      categoryHint: enrichedTopic.domainCategory,
      postFormat: candidate.postFormat === 'single' ? 'single' : 'carousel',
    });
  }

  const diversifiedFreshSlides = diversifyDeckArchetypesAndVisuals(freshDeck.slides || []);
  const candidatePool = diversifiedFreshSlides.filter(
    (s, idx) =>
      idx === slideIndex ||
      (s.enTitle && s.enTitle.toLowerCase() !== (currentSlide.enTitle || '').toLowerCase())
  );
  const pickedFresh =
    diversifiedFreshSlides[Math.min(slideIndex, diversifiedFreshSlides.length - 1)] ||
    candidatePool[0] ||
    currentSlide;

  const targetType =
    options?.preferredType ||
    (slideIndex === 0
      ? 'hub'
      : slideIndex === slides.length - 1 && currentSlide.type === 'cta'
      ? 'cta'
      : pickedFresh.type || currentSlide.type);

  const mergedSlide = {
    ...pickedFresh,
    type: targetType,
  };

  const reDiversified = diversifyDeckArchetypesAndVisuals(
    slides.map((s, idx) => (idx === slideIndex ? mergedSlide : s))
  );

  // Preserve exact user-selected archetype on the regenerated slide while keeping fresh smart visuals & auto-fitted copy
  const mergedRegenerated: CarouselData['slides'][number] = {
    ...reDiversified[slideIndex],
    type: targetType,
    enTitle: pickedFresh.enTitle || reDiversified[slideIndex]?.enTitle || currentSlide.enTitle,
    arTitle: pickedFresh.arTitle || reDiversified[slideIndex]?.arTitle || currentSlide.arTitle,
    enBody: pickedFresh.enBody || reDiversified[slideIndex]?.enBody || currentSlide.enBody,
    arBody: pickedFresh.arBody || reDiversified[slideIndex]?.arBody || currentSlide.arBody,
  };
  slides[slideIndex] = autoSyncSlideGraphicsFromCopy(
    autoFitSlideCopyToLimits(
      mergedRegenerated,
      slideIndex,
      candidate.postFormat === 'single'
    ),
    slideIndex
  );

  const nextDraftTitle =
    slideIndex === 0 && slides[0]?.enTitle ? slides[0].enTitle : candidate.draftTitle;

  const updatedCandidate: GatheredCandidatePost = {
    ...candidate,
    topic: enrichedTopic,
    draftTitle: nextDraftTitle,
    deck: {
      ...candidate.deck,
      slides,
      sourceMeta: {
        ...candidate.deck.sourceMeta,
        isFallback: false,
      },
    },
    generatedAt: new Date().toISOString(),
  };

  const cacheKey = `${enrichedTopic.id}|${candidate.postFormat}`;
  candidateDeckCache.set(cacheKey, updatedCandidate);
  return updatedCandidate;
}


