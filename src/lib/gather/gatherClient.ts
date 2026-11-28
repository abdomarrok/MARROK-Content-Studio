import type {
  CandidateRiskSignals,
  CarouselData,
  ClusteredSourceItem,
  FeedHealthStatus,
  MetricEvidenceItem,
  PostFormat,
  SavedPostRecord,
  SavedPostStatus,
  SlideData,
  SuggestedCalendarSlot,
  TopicScoreBreakdown,
  TriageAction,
  TriageDecisionRecord,
  TriageSkipReason,
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
import {
  explainArchetypeChoice,
  inferDynamicCoverArchetype,
  resolveSmartSlideVisuals,
} from '../synthesis/smartVisualDefaults.ts';
import {
  evaluateGathererCandidateQuality,
  type GathererQualityGateResult,
} from '../qaChecks.ts';
import { saveValidPost, syncLocalVaultAfterManage } from '../storage/postsVaultClient.ts';
import { fetchAuthedJson } from '../network/httpClient.ts';
import {
  buildGroundedFitLine,
  buildProposedHook,
  buildTriageSignaturePayload,
  canonicalizeStoryUrl,
  computeCandidateRiskSignals,
  computeCalibratedTopicScore,
  extractMetricEvidenceChips,
  formatShortInboxDate,
  isSingleMetricUnverified,
  isTopicDismissedByTriage,
  parseTriageSignature,
  sanitizeFeedDisplayText,
  sanitizeSafeHttpUrl,
  scoreAndRankTopicBatch,
  suggestCalendarSlotForCard,
  validateUserSubmittedUrl,
} from './inboxEngine.ts';

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
  sourceDomain?: string;
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
  publishedDateLabel?: string;
  freshnessTag?: 'fresh' | 'evergreen' | 'Fresh' | 'Evergreen';
  score: number;
  viralityScore?: number;
  scoreBreakdown?: TopicScoreBreakdown;
  viralAngle?: string;
  clientRelevanceReason?: string;
  marrokAngle?: string;
  summary: string;
  extractedMetrics: string[];
  recommendedFormat: 'carousel' | 'single' | 'reel';
  synthesisPrompt: string;
  clusteredSources?: ClusteredSourceItem[];
}

export interface GatheredCandidatePost {
  id: string;
  topic: GatheredTopicItem;
  deck: CarouselData;
  draftTitle: string;
  proposedHookEn: string;
  proposedHookAr: string;
  isUntitledHook: boolean;
  themeId: string;
  postFormat: PostFormat;
  generatedAt: string;
  sourceDomain: string;
  publishedDateLabel: string;
  freshnessTag: 'Fresh' | 'Evergreen';
  scoreBreakdown: TopicScoreBreakdown;
  compositeScore: number;
  marrokAngle: string;
  metricEvidence: MetricEvidenceItem[];
  riskSignals: CandidateRiskSignals;
  clusteredSources: ClusteredSourceItem[];
  suggestedSlot: SuggestedCalendarSlot;
  alreadyCovered?: boolean;
  coveredPostId?: string;
  coveredPostTitle?: string;
  coveredPostStatus?: SavedPostStatus;
  isDeckSynthesized: boolean;
  qualityGate: GathererQualityGateResult;
  summaryOnlyWarning?: string;
}

export interface TopicRadarResponse {
  ok: boolean;
  cached: boolean;
  fetchedAt: string;
  lastScannedAt?: string;
  topics: GatheredTopicItem[];
  feedStatuses?: FeedHealthStatus[];
  warning?: string;
}

export interface ExtractUrlResponse {
  ok: boolean;
  topic: GatheredTopicItem;
  rawTextLength: number;
}

const DISMISSED_TOPICS_KEY = 'marrok_dismissed_gather_topic_ids_v1';
const CUSTOM_RSS_FEEDS_KEY = 'marrok_custom_rss_feeds_v1';
const TRIAGE_DECISIONS_KEY = 'marrok_inbox_triage_decisions_v1';
const TRIAGE_PENDING_SYNC_KEY = 'marrok_inbox_triage_pending_sync_v1';
const TRIAGE_PENDING_UNDO_KEY = 'marrok_inbox_triage_pending_undo_v1';
const candidateDeckCache = new Map<string, GatheredCandidatePost>();

function normalizeTriageRecord(record: TriageDecisionRecord): TriageDecisionRecord {
  const parsed = parseTriageSignature(record.topicSignature);
  const canonicalUrl = canonicalizeStoryUrl(record.canonicalUrl || parsed.canonicalUrl || '');
  const clusteredUrls = Array.isArray(record.clusteredUrls)
    ? Array.from(
        new Set(record.clusteredUrls.map((u) => canonicalizeStoryUrl(u)).filter(Boolean))
      ).slice(0, 8)
    : undefined;
  return {
    ...record,
    canonicalUrl: canonicalUrl || undefined,
    clusteredUrls: clusteredUrls && clusteredUrls.length > 0 ? clusteredUrls : undefined,
  };
}

function getPendingTriageSyncs(): TriageDecisionRecord[] {
  try {
    const raw = localStorage.getItem(TRIAGE_PENDING_SYNC_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as TriageDecisionRecord[]).map(normalizeTriageRecord)
      : [];
  } catch {
    return [];
  }
}

function savePendingTriageSyncs(records: TriageDecisionRecord[]): void {
  try {
    if (records.length === 0) {
      localStorage.removeItem(TRIAGE_PENDING_SYNC_KEY);
    } else {
      localStorage.setItem(TRIAGE_PENDING_SYNC_KEY, JSON.stringify(records.slice(0, 150)));
    }
  } catch {
    // Ignore storage quota errors
  }
}

function getPendingTriageUndos(): string[] {
  try {
    const raw = localStorage.getItem(TRIAGE_PENDING_UNDO_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function savePendingTriageUndos(ids: string[]): void {
  try {
    if (ids.length === 0) {
      localStorage.removeItem(TRIAGE_PENDING_UNDO_KEY);
    } else {
      localStorage.setItem(
        TRIAGE_PENDING_UNDO_KEY,
        JSON.stringify(Array.from(new Set(ids)).slice(0, 150))
      );
    }
  } catch {
    // Ignore storage quota errors
  }
}

function mergeTriageDecisionLists(
  serverDecisions: TriageDecisionRecord[],
  localDecisions: TriageDecisionRecord[],
  pendingSyncs: TriageDecisionRecord[],
  pendingUndos: string[]
): TriageDecisionRecord[] {
  const undoSet = new Set(pendingUndos);
  const byId = new Map<string, TriageDecisionRecord>();
  const serverTopicActionKeys = new Set<string>();

  for (const raw of serverDecisions) {
    if (!raw?.id || undoSet.has(raw.id)) continue;
    const norm = normalizeTriageRecord({ ...raw, pendingSync: false });
    byId.set(norm.id, norm);
    serverTopicActionKeys.add(`${norm.topicId}::${norm.action}`);
  }

  for (const raw of [...pendingSyncs, ...localDecisions]) {
    if (!raw?.id || undoSet.has(raw.id)) continue;
    if (byId.has(raw.id)) continue;
    const norm = normalizeTriageRecord(raw);
    // Avoid duplicating a pending local record if server already confirmed the same topicId+action
    if (norm.pendingSync && serverTopicActionKeys.has(`${norm.topicId}::${norm.action}`)) {
      continue;
    }
    byId.set(norm.id, norm);
  }

  return Array.from(byId.values())
    .sort((a, b) => {
      const ta = Date.parse(a.createdAt || '') || 0;
      const tb = Date.parse(b.createdAt || '') || 0;
      return tb - ta;
    })
    .slice(0, 300);
}

async function flushPendingTriageOperations(): Promise<void> {
  const pendingSyncs = getPendingTriageSyncs();
  const pendingUndos = getPendingTriageUndos();
  if (pendingSyncs.length === 0 && pendingUndos.length === 0) return;

  if (pendingSyncs.length > 0) {
    const stillPending: TriageDecisionRecord[] = [];
    for (const item of pendingSyncs) {
      try {
        const parsed = parseTriageSignature(item.topicSignature);
        const data = await fetchAuthedJson<{ decision?: TriageDecisionRecord }>(
          '/api/gather/triage',
          {
            method: 'POST',
            timeoutMs: 15_000,
            contextLabel: 'Sync pending triage decision',
            body: {
              topicId: item.topicId,
              topicSignature: parsed.title || item.topicSignature,
              canonicalUrl: item.canonicalUrl || parsed.canonicalUrl,
              clusteredUrls: item.clusteredUrls,
              sourceDomain: item.sourceDomain,
              domainCategory: item.domainCategory,
              action: item.action,
              reason: item.reason,
              snoozeUntil: item.snoozeUntil,
            },
          }
        );
        const confirmed = normalizeTriageRecord({
          ...(data?.decision || item),
          canonicalUrl:
            data?.decision?.canonicalUrl || item.canonicalUrl || parsed.canonicalUrl || undefined,
          clusteredUrls: data?.decision?.clusteredUrls || item.clusteredUrls,
          pendingSync: false,
        });
        const nextLocal = [
          confirmed,
          ...getLocalTriageDecisions().filter(
            (d) => d.id !== item.id && d.id !== confirmed.id
          ),
        ].slice(0, 300);
        saveLocalTriageDecisions(nextLocal);
      } catch (err) {
        console.warn('[GatherClient] Pending triage sync deferred:', err);
        stillPending.push(item);
      }
    }
    savePendingTriageSyncs(stillPending);
  }

  if (pendingUndos.length > 0) {
    const stillPendingUndos: string[] = [];
    for (const id of pendingUndos) {
      try {
        await fetchAuthedJson(`/api/gather/triage/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          timeoutMs: 15_000,
          contextLabel: 'Sync pending triage undo',
        });
      } catch (err) {
        console.warn('[GatherClient] Pending triage undo deferred:', err);
        stillPendingUndos.push(id);
      }
    }
    savePendingTriageUndos(stillPendingUndos);
  }
}

export function getLocalTriageDecisions(): TriageDecisionRecord[] {
  try {
    const raw = localStorage.getItem(TRIAGE_DECISIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as TriageDecisionRecord[]).map(normalizeTriageRecord)
      : [];
  } catch {
    return [];
  }
}

export function saveLocalTriageDecisions(records: TriageDecisionRecord[]): void {
  try {
    localStorage.setItem(TRIAGE_DECISIONS_KEY, JSON.stringify(records.slice(0, 300)));
  } catch {
    // Ignore storage quota errors
  }
}

export function clearLocalTriageDecisions(): void {
  try {
    localStorage.removeItem(TRIAGE_DECISIONS_KEY);
    localStorage.removeItem(TRIAGE_PENDING_SYNC_KEY);
    localStorage.removeItem(TRIAGE_PENDING_UNDO_KEY);
  } catch {
    // Ignore
  }
}

export function isCandidateSkipped(
  topicId: string,
  decisions: TriageDecisionRecord[]
): boolean {
  const latest = decisions.find((d) => d.topicId === topicId);
  return latest?.action === 'skip';
}

export function isCandidateSnoozed(
  topicId: string,
  decisions: TriageDecisionRecord[],
  nowMs = Date.now()
): boolean {
  const latest = decisions.find((d) => d.topicId === topicId);
  if (!latest || latest.action !== 'snooze' || !latest.snoozeUntil) return false;
  const until = Date.parse(latest.snoozeUntil);
  return Number.isFinite(until) && until > nowMs;
}

export async function fetchTriageDecisions(): Promise<TriageDecisionRecord[]> {
  const local = getLocalTriageDecisions();
  const pendingSyncs = getPendingTriageSyncs();
  const pendingUndos = getPendingTriageUndos();

  try {
    const data = await fetchAuthedJson<{ ok?: boolean; decisions?: TriageDecisionRecord[] }>(
      '/api/gather/triage?limit=250',
      {
        method: 'GET',
        timeoutMs: 15_000,
        contextLabel: 'Fetch triage decisions',
      }
    );
    const serverList = Array.isArray(data?.decisions) ? data.decisions : [];
    const merged = mergeTriageDecisionLists(serverList, local, pendingSyncs, pendingUndos);
    saveLocalTriageDecisions(merged);

    if (pendingSyncs.length > 0 || pendingUndos.length > 0) {
      void flushPendingTriageOperations();
    }
    return merged;
  } catch (err) {
    console.warn('[GatherClient] Failed to fetch remote triage decisions, using local cache:', err);
    return mergeTriageDecisionLists([], local, pendingSyncs, pendingUndos);
  }
}

export async function logTriageDecision(payload: {
  topicId: string;
  topicSignature?: string;
  canonicalUrl?: string;
  clusteredUrls?: string[];
  sourceDomain: string;
  domainCategory: string;
  action: TriageAction;
  reason?: TriageSkipReason;
  snoozeUntil?: string;
}): Promise<TriageDecisionRecord> {
  const parsedExisting = parseTriageSignature(payload.topicSignature);
  const cleanTitle = sanitizeFeedDisplayText(
    parsedExisting.title || payload.topicSignature || payload.topicId,
    160
  );
  const canonicalUrl = canonicalizeStoryUrl(
    payload.canonicalUrl || parsedExisting.canonicalUrl || ''
  );
  const clusteredUrls = Array.isArray(payload.clusteredUrls)
    ? Array.from(
        new Set(payload.clusteredUrls.map((u) => canonicalizeStoryUrl(u)).filter(Boolean))
      ).slice(0, 8)
    : undefined;
  const encodedSignature = buildTriageSignaturePayload(cleanTitle, canonicalUrl || undefined);

  const optimisticRecord: TriageDecisionRecord = {
    id: `triage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    topicId: payload.topicId,
    topicSignature: encodedSignature,
    canonicalUrl: canonicalUrl || undefined,
    clusteredUrls: clusteredUrls && clusteredUrls.length > 0 ? clusteredUrls : undefined,
    sourceDomain: payload.sourceDomain,
    domainCategory: payload.domainCategory,
    action: payload.action,
    reason: payload.reason,
    snoozeUntil: payload.snoozeUntil,
    createdAt: new Date().toISOString(),
    pendingSync: true,
  };

  // Persist optimistically before network call so skips survive reloads/failures
  saveLocalTriageDecisions(
    [optimisticRecord, ...getLocalTriageDecisions().filter((d) => d.id !== optimisticRecord.id)].slice(
      0,
      300
    )
  );
  savePendingTriageSyncs([
    optimisticRecord,
    ...getPendingTriageSyncs().filter((d) => d.id !== optimisticRecord.id),
  ]);

  try {
    const data = await fetchAuthedJson<{ ok?: boolean; decision?: TriageDecisionRecord }>(
      '/api/gather/triage',
      {
        method: 'POST',
        timeoutMs: 15_000,
        contextLabel: 'Log triage decision',
        body: {
          ...payload,
          topicSignature: cleanTitle,
          canonicalUrl: canonicalUrl || undefined,
          clusteredUrls: clusteredUrls && clusteredUrls.length > 0 ? clusteredUrls : undefined,
        },
      }
    );
    const saved: TriageDecisionRecord = normalizeTriageRecord({
      ...(data?.decision || optimisticRecord),
      topicSignature: data?.decision?.topicSignature || encodedSignature,
      canonicalUrl: data?.decision?.canonicalUrl || canonicalUrl || undefined,
      clusteredUrls:
        data?.decision?.clusteredUrls ||
        (clusteredUrls && clusteredUrls.length > 0 ? clusteredUrls : undefined),
      pendingSync: false,
    });
    const merged = [
      saved,
      ...getLocalTriageDecisions().filter(
        (d) => d.id !== optimisticRecord.id && d.id !== saved.id
      ),
    ].slice(0, 300);
    saveLocalTriageDecisions(merged);
    savePendingTriageSyncs(
      getPendingTriageSyncs().filter(
        (d) => d.id !== optimisticRecord.id && d.id !== saved.id
      )
    );
    return saved;
  } catch (err) {
    console.warn('[GatherClient] Remote triage persistence deferred (queued locally):', err);
  }

  return optimisticRecord;
}

export async function undoTriageDecision(id: string): Promise<void> {
  const wasOnlyLocalUnsynced = getPendingTriageSyncs().some((d) => d.id === id);
  const nextLocal = getLocalTriageDecisions().filter((d) => d.id !== id);
  saveLocalTriageDecisions(nextLocal);
  savePendingTriageSyncs(getPendingTriageSyncs().filter((d) => d.id !== id));

  if (wasOnlyLocalUnsynced && id.startsWith('triage_')) {
    return;
  }

  savePendingTriageUndos([...getPendingTriageUndos(), id]);
  try {
    await fetchAuthedJson(`/api/gather/triage/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      timeoutMs: 15_000,
      contextLabel: 'Undo triage decision',
    });
    savePendingTriageUndos(getPendingTriageUndos().filter((item) => item !== id));
  } catch (err) {
    console.warn('[GatherClient] Remote triage undo deferred (queued for retry):', err);
  }
}

export async function clearAllHiddenTriageDecisions(): Promise<void> {
  const current = getLocalTriageDecisions();
  const hiddenIds = current
    .filter((d) => d.action === 'skip' || d.action === 'snooze')
    .map((d) => d.id);
  for (const id of hiddenIds) {
    await undoTriageDecision(id);
  }
  clearDismissedGatherTopicIds();
}

export function getDismissedGatherTopicIds(): Set<string> {
  const dismissed = new Set<string>();
  // 1. Derive from authoritative triage decisions (action === 'skip', 'draft', or active 'snooze')
  const decisions = getLocalTriageDecisions();
  const nowMs = Date.now();
  for (const d of decisions) {
    if (d.action === 'skip' || d.action === 'draft') {
      dismissed.add(d.topicId);
    } else if (d.action === 'snooze' && d.snoozeUntil) {
      const until = Date.parse(d.snoozeUntil);
      if (Number.isFinite(until) && until > nowMs) {
        dismissed.add(d.topicId);
      }
    }
  }
  // 2. One-time migration/cleanup of legacy prototype localStorage key if still present
  try {
    const raw = localStorage.getItem(DISMISSED_TOPICS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((id) => dismissed.add(String(id)));
      }
      localStorage.removeItem(DISMISSED_TOPICS_KEY);
    }
  } catch {
    // Ignore
  }
  return dismissed;
}

export function dismissGatherTopicId(topicId: string): void {
  candidateDeckCache.delete(topicId);
  // Persist locally as a triage decision record with action 'skip'
  const decisions = getLocalTriageDecisions();
  if (!decisions.some((d) => d.topicId === topicId)) {
    decisions.unshift({
      id: `triage_local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      topicId,
      sourceDomain: 'local',
      domainCategory: 'DISTRIBUTED SYSTEMS',
      action: 'skip',
      createdAt: new Date().toISOString(),
    });
    saveLocalTriageDecisions(decisions);
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
  return await fetchAuthedJson<TopicRadarResponse>(
    `/api/gather/radar${query ? `?${query}` : ''}`,
    {
      method: 'GET',
      timeoutMs: 25_000,
      contextLabel: 'Fetch topic radar',
    }
  );
}

/**
 * Extracts clean article content, metrics, and metadata from any public https:// URL.
 * Validates URLs client-side with SSRF parity before invoking the server proxy.
 */
export async function extractArticleFromUrl(url: string): Promise<ExtractUrlResponse> {
  const validation = validateUserSubmittedUrl(url);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  return await fetchAuthedJson<ExtractUrlResponse>('/api/gather/extract-url', {
    method: 'POST',
    body: { url: validation.normalizedUrl },
    timeoutMs: 30_000,
    contextLabel: 'Extract URL',
  });
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
    const postMetaUrl = (post.deck?.sourceMeta?.url || '').trim().toLowerCase().replace(/\/+$/, '');
    const postSourceUrls = (post.deck?.sourceMeta?.groundingSources || []).map((s) =>
      (s.url || '').trim().toLowerCase().replace(/\/+$/, '')
    );

    if (
      cleanTopicUrl &&
      (postBrandUrl === cleanTopicUrl ||
        postMetaUrl === cleanTopicUrl ||
        postSourceUrls.includes(cleanTopicUrl))
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

export function deriveSourceDomain(url: string, fallbackSource?: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return (fallbackSource || 'source').toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
  }
}

export function deriveTopicScoringMetadata(
  topic: GatheredTopicItem,
  options?: {
    isVaultDuplicate?: boolean;
    triageDecisions?: TriageDecisionRecord[];
  }
): {
  sourceDomain: string;
  publishedDateLabel: string;
  freshnessTag: 'Fresh' | 'Evergreen';
  scoreBreakdown: TopicScoreBreakdown;
  compositeScore: number;
  marrokAngle: string;
} {
  const sourceDomain = topic.sourceDomain || deriveSourceDomain(topic.url, topic.sourceName);
  const publishedDateLabel = formatShortInboxDate(topic.publishedAt);

  let breakdown: TopicScoreBreakdown;
  let groundedFitLine: string;

  if (topic.scoreBreakdown && topic.scoreBreakdown.relevance !== undefined) {
    breakdown = topic.scoreBreakdown;
    groundedFitLine =
      (topic.marrokAngle || '').trim() ||
      buildGroundedFitLine({
        title: topic.title,
        summary: topic.summary,
        extractedMetrics: topic.extractedMetrics,
        domainCategory: topic.domainCategory,
        sourceDomain,
      }).fitLine;
  } else {
    const calibrated = computeCalibratedTopicScore(
      {
        id: topic.id,
        title: topic.title,
        summary: topic.summary,
        url: topic.url,
        score: topic.score,
        extractedMetrics: topic.extractedMetrics || [],
        sourceType: topic.sourceType,
        sourceDomain,
        author: topic.author,
        publishedAt: topic.publishedAt,
        domainCategory: topic.domainCategory,
        clusteredSources: topic.clusteredSources,
      },
      {
        isVaultDuplicate: options?.isVaultDuplicate,
        triageDecisions: options?.triageDecisions,
      }
    );
    breakdown = calibrated.scoreBreakdown;
    groundedFitLine = (topic.marrokAngle || '').trim() || calibrated.marrokAngle;
  }

  const rawFreshTag: 'fresh' | 'evergreen' =
    breakdown.freshnessTag === 'evergreen' ||
    topic.freshnessTag?.toLowerCase() === 'evergreen'
      ? 'evergreen'
      : 'fresh';
  const freshnessTag: 'Fresh' | 'Evergreen' = rawFreshTag === 'fresh' ? 'Fresh' : 'Evergreen';

  return {
    sourceDomain,
    publishedDateLabel,
    freshnessTag,
    scoreBreakdown: breakdown,
    compositeScore: breakdown.composite,
    marrokAngle: sanitizeFeedDisplayText(groundedFitLine, 220),
  };
}

/**
 * Re-runs the Inbox Quality Gate, Summary-Only originality audit, and Risk Signals
 * whenever the user edits a candidate's Marrok angle, hook, slide copy, or metric verification.
 */
export function reEvaluateCandidateQuality(
  candidate: GatheredCandidatePost
): GatheredCandidatePost {
  const cleanAngle = (candidate.marrokAngle || '').trim();
  const nextDeck: CarouselData = {
    ...candidate.deck,
    sourceMeta: {
      ...candidate.deck.sourceMeta,
      marrokAngle: cleanAngle,
    },
  };
  const qualityGate = evaluateGathererCandidateQuality({
    title: candidate.topic.title,
    draftTitle: candidate.draftTitle,
    summary: candidate.topic.summary,
    marrokAngle: cleanAngle,
    deck: nextDeck,
  });

  const nextRiskSignals = computeCandidateRiskSignals(
    {
      title: candidate.topic.title,
      summary: candidate.topic.summary,
      url: candidate.topic.url,
      sourceType: candidate.topic.sourceType,
      sourceDomain: candidate.sourceDomain,
    },
    candidate.metricEvidence || [],
    candidate.alreadyCovered
      ? { title: candidate.coveredPostTitle || candidate.topic.title }
      : null
  );

  return {
    ...candidate,
    marrokAngle: cleanAngle,
    deck: nextDeck,
    riskSignals: nextRiskSignals,
    qualityGate,
    summaryOnlyWarning: qualityGate.summaryOnlyReason,
  };
}

function buildClusteredSourcesList(topic: GatheredTopicItem, sourceDomain: string): ClusteredSourceItem[] {
  if (Array.isArray(topic.clusteredSources) && topic.clusteredSources.length > 0) {
    return topic.clusteredSources;
  }
  const safeUrl = sanitizeSafeHttpUrl(topic.url);
  if (!safeUrl) return [];
  return [
    {
      sourceName: sanitizeFeedDisplayText(topic.sourceName || topic.brand || sourceDomain, 60),
      sourceType: topic.sourceType || 'rss',
      domain: sourceDomain,
      url: safeUrl,
      title: sanitizeFeedDisplayText(topic.title, 140),
    },
  ];
}

/**
 * Builds a fast, zero-lag lightweight Inbox preview card with ONLY Slide 1 Hook synthesized
 * synchronously (`isDeckSynthesized: false`). Full 8-slide deck generation runs lazily on open or draft queue.
 */
export function buildLightweightLazyCandidate(
  topic: GatheredTopicItem,
  assignedThemeId: string,
  formatOverride: 'auto' | PostFormat = 'auto',
  vaultMatch: SavedPostRecord | null = null,
  options?: {
    savedPosts?: SavedPostRecord[];
    cardRankIndex?: number;
    triageDecisions?: TriageDecisionRecord[];
  }
): GatheredCandidatePost {
  const targetFormat: PostFormat =
    formatOverride !== 'auto' ? formatOverride : topic.recommendedFormat || 'carousel';

  const cleanTopic: GatheredTopicItem = {
    ...topic,
    title: sanitizeFeedDisplayText(topic.title, 220),
    summary: sanitizeFeedDisplayText(topic.summary, 3600),
  };

  const meta = deriveTopicScoringMetadata(cleanTopic, {
    isVaultDuplicate: Boolean(vaultMatch),
    triageDecisions: options?.triageDecisions,
  });

  const proposed = buildProposedHook({
    title: cleanTopic.title,
    summary: cleanTopic.summary,
    extractedMetrics: cleanTopic.extractedMetrics,
    domainCategory: cleanTopic.domainCategory,
  });

  const metricEvidence = extractMetricEvidenceChips({
    id: cleanTopic.id,
    title: cleanTopic.title,
    summary: cleanTopic.summary,
    url: cleanTopic.url,
    extractedMetrics: cleanTopic.extractedMetrics,
  });

  const clusteredSources = buildClusteredSourcesList(cleanTopic, meta.sourceDomain);
  const riskSignals = computeCandidateRiskSignals(
    {
      title: cleanTopic.title,
      summary: cleanTopic.summary,
      url: cleanTopic.url,
      sourceType: cleanTopic.sourceType,
      sourceDomain: meta.sourceDomain,
    },
    metricEvidence,
    vaultMatch
  );
  const suggestedSlot = suggestCalendarSlotForCard(
    options?.savedPosts || [],
    options?.cardRankIndex ?? 0
  );

  const displayHookEn = proposed.isUntitled ? '' : proposed.hookEn;
  const displayHookAr = proposed.isUntitled ? '' : proposed.hookAr;

  const draftSeedSlide: SlideData = {
    type: 'metric',
    storyRole: 'hook',
    enTitle: displayHookEn || cleanTopic.title.slice(0, 48),
    arTitle: displayHookAr || 'أضف عنواناً عربياً مقترحاً للمنشور',
    enBody: targetFormat === 'single' ? meta.marrokAngle.slice(0, 130) : '',
    arBody: targetFormat === 'single' ? 'أثر عملي على أداء وتكلفة أنظمة الشركات الناشئة.' : '',
    metricValue: cleanTopic.extractedMetrics?.[0] || '',
    metricLabel: cleanTopic.domainCategory.split(' ')[0] || 'SYSTEMS',
    cornerTag: 'HOOK',
  };

  const chosenHookType =
    targetFormat === 'single' ? 'poster' : inferDynamicCoverArchetype(draftSeedSlide);
  const smart = resolveSmartSlideVisuals({ ...draftSeedSlide, type: chosenHookType }, 0, true);
  const slide1: SlideData = {
    ...draftSeedSlide,
    type: chosenHookType,
    centerIcon: smart.centerIcon,
    centerTag: smart.centerTag,
    satLabels: smart.satLabels,
    hubNodeReasons: smart.hubNodeReasons,
    metricBeforeValue: smart.metricBeforeValue,
    metricValue: smart.metricValue || draftSeedSlide.metricValue,
    metricLabel: smart.metricLabel || draftSeedSlide.metricLabel,
    metricDiff: smart.metricDiff,
    chartDirection: smart.chartDirection,
    compareLeftTitle: smart.compareLeftTitle,
    compareLeftBody: smart.compareLeftBody,
    compareRightTitle: smart.compareRightTitle,
    compareRightBody: smart.compareRightBody,
    diagramVariant: smart.diagramVariant,
    diagramNodes: smart.diagramNodes,
    diagramEdges: smart.diagramEdges,
    diagramFooter: smart.diagramFooter,
    hookClaimCard: smart.hookClaimCard,
    layoutRationale: explainArchetypeChoice(
      { ...draftSeedSlide, type: chosenHookType },
      0,
      targetFormat === 'single' ? 1 : 8
    ),
  };

  const lightweightDeck: CarouselData = {
    id: `candidate_${cleanTopic.id}`,
    theme: assignedThemeId,
    category: cleanTopic.domainCategory || 'SYSTEMS ARCHITECTURE',
    brand: 'MARROK',
    brandUrl: 'marrok.org',
    channel: cleanTopic.brand || cleanTopic.sourceName,
    postFormat: targetFormat,
    caption: `${displayHookEn || cleanTopic.title}\n\n${meta.marrokAngle}`,
    slides: [slide1],
    sourceMeta: {
      title: cleanTopic.title,
      creator: cleanTopic.author || cleanTopic.sourceName,
      channel: cleanTopic.sourceName,
      published: cleanTopic.publishedAt,
      url: sanitizeSafeHttpUrl(cleanTopic.url) || undefined,
      viralityScore: meta.compositeScore,
      viralAngle: cleanTopic.viralAngle,
      marrokAngle: meta.marrokAngle,
      extractedSourceMetrics: cleanTopic.extractedMetrics || [],
      userReviewed: false,
      verifiedNumbers: false,
      groundingSources: clusteredSources.map((s) => ({
        title: s.title || cleanTopic.title,
        url: s.url,
      })),
    },
  };

  const baseCandidate: GatheredCandidatePost = {
    id: cleanTopic.id,
    topic: cleanTopic,
    deck: lightweightDeck,
    draftTitle: displayHookEn,
    proposedHookEn: displayHookEn,
    proposedHookAr: displayHookAr,
    isUntitledHook: proposed.isUntitled,
    themeId: assignedThemeId,
    postFormat: targetFormat,
    generatedAt: new Date().toISOString(),
    sourceDomain: meta.sourceDomain,
    publishedDateLabel: meta.publishedDateLabel,
    freshnessTag: meta.freshnessTag,
    scoreBreakdown: meta.scoreBreakdown,
    compositeScore: meta.compositeScore,
    marrokAngle: meta.marrokAngle,
    metricEvidence,
    riskSignals,
    clusteredSources,
    suggestedSlot,
    alreadyCovered: Boolean(vaultMatch),
    coveredPostId: vaultMatch?.id,
    coveredPostTitle: vaultMatch?.title,
    coveredPostStatus: vaultMatch?.postStatus,
    isDeckSynthesized: false,
    qualityGate: { passed: true, blockingReasons: [], warnings: [], isSummaryOnly: false },
  };

  return reEvaluateCandidateQuality(baseCandidate);
}

/**
 * Synchronously synthesizes a full GatheredCandidatePost (8-slide carousel or 1-slide poster)
 * with non-Hub Slide 1 Hook, layout diversity, per-slide `layoutRationale`, and quality gate evaluation.
 */
export function buildCandidateFromTopicSync(
  topic: GatheredTopicItem,
  assignedThemeId: string,
  formatOverride: 'auto' | PostFormat = 'auto',
  vaultMatch: SavedPostRecord | null = null,
  options?: {
    savedPosts?: SavedPostRecord[];
    cardRankIndex?: number;
    triageDecisions?: TriageDecisionRecord[];
    preserveMetricEvidence?: MetricEvidenceItem[];
    preserveHookEn?: string;
    preserveHookAr?: string;
  }
): GatheredCandidatePost {
  const targetFormat: PostFormat =
    formatOverride !== 'auto' ? formatOverride : topic.recommendedFormat || 'carousel';

  const cleanTopic: GatheredTopicItem = {
    ...topic,
    title: sanitizeFeedDisplayText(topic.title, 220),
    summary: sanitizeFeedDisplayText(topic.summary, 3600),
  };

  const meta = deriveTopicScoringMetadata(cleanTopic, {
    isVaultDuplicate: Boolean(vaultMatch),
    triageDecisions: options?.triageDecisions,
  });
  const cacheKey = `${cleanTopic.id}|${targetFormat}`;
  const existing = candidateDeckCache.get(cacheKey);
  if (existing && existing.isDeckSynthesized) {
    const mergedMetrics = options?.preserveMetricEvidence || existing.metricEvidence;
    return reEvaluateCandidateQuality({
      ...existing,
      themeId: assignedThemeId,
      metricEvidence: mergedMetrics,
      alreadyCovered: Boolean(vaultMatch),
      coveredPostId: vaultMatch?.id,
      coveredPostTitle: vaultMatch?.title,
      coveredPostStatus: vaultMatch?.postStatus,
      deck: {
        ...existing.deck,
        theme: assignedThemeId,
      },
    });
  }

  let deck = synthesizeCarousel({
    prompt: cleanTopic.synthesisPrompt,
    categoryHint: cleanTopic.domainCategory,
    postFormat: targetFormat === 'single' ? 'single' : 'carousel',
  });

  if (targetFormat === 'single' && deck.slides.length > 1) {
    deck = condenseCarouselToSingleSlide(deck);
  } else if (deck.slides.length > 2) {
    deck = {
      ...deck,
      slides: diversifyDeckArchetypesAndVisuals(deck.slides, { dynamicCover: true }),
    };
  }
  deck = autoFinalizeCarouselDeck(deck);

  const proposed = buildProposedHook({
    title: cleanTopic.title,
    summary: cleanTopic.summary,
    extractedMetrics: cleanTopic.extractedMetrics,
    domainCategory: cleanTopic.domainCategory,
  });

  const hookEn = options?.preserveHookEn || (proposed.isUntitled ? '' : proposed.hookEn);
  const hookAr = options?.preserveHookAr || (proposed.isUntitled ? '' : proposed.hookAr);

  // Guarantee per-slide layoutRationale on every finalized slide
  const finalSlides = deck.slides.map((s, idx) => {
    const patched =
      idx === 0 && hookEn
        ? { ...s, enTitle: hookEn, arTitle: hookAr || s.arTitle }
        : s;
    return {
      ...patched,
      layoutRationale: patched.layoutRationale || explainArchetypeChoice(patched, idx, deck.slides.length),
    };
  });
  deck = { ...deck, slides: finalSlides };

  const metricEvidence =
    options?.preserveMetricEvidence ||
    extractMetricEvidenceChips({
      id: cleanTopic.id,
      title: cleanTopic.title,
      summary: cleanTopic.summary,
      url: cleanTopic.url,
      extractedMetrics: cleanTopic.extractedMetrics,
    });
  const clusteredSources = buildClusteredSourcesList(cleanTopic, meta.sourceDomain);
  const riskSignals = computeCandidateRiskSignals(
    {
      title: cleanTopic.title,
      summary: cleanTopic.summary,
      url: cleanTopic.url,
      sourceType: cleanTopic.sourceType,
      sourceDomain: meta.sourceDomain,
    },
    metricEvidence,
    vaultMatch
  );
  const suggestedSlot = suggestCalendarSlotForCard(
    options?.savedPosts || [],
    options?.cardRankIndex ?? 0
  );

  const draftTitle = hookEn || deck.slides[0]?.enTitle || cleanTopic.title;
  const enrichedDeck: CarouselData = {
    ...deck,
    id: `candidate_${cleanTopic.id}`,
    theme: assignedThemeId,
    category: cleanTopic.domainCategory || deck.category || 'SYSTEMS ARCHITECTURE',
    brand: 'MARROK',
    brandUrl: 'marrok.org',
    channel: cleanTopic.brand || cleanTopic.sourceName || deck.channel,
    postFormat: targetFormat,
    sourceMeta: {
      ...deck.sourceMeta,
      title: cleanTopic.title,
      creator: cleanTopic.author || cleanTopic.sourceName,
      channel: cleanTopic.sourceName,
      published: cleanTopic.publishedAt,
      url: sanitizeSafeHttpUrl(cleanTopic.url) || undefined,
      viralityScore: meta.compositeScore,
      viralAngle: cleanTopic.viralAngle,
      marrokAngle: meta.marrokAngle,
      userReviewed: false,
      verifiedNumbers: false,
      groundingSources: [
        ...clusteredSources.map((s) => ({ title: s.title || cleanTopic.title, url: s.url })),
        ...(deck.sourceMeta?.groundingSources || []),
      ],
    },
  };

  const candidate = reEvaluateCandidateQuality({
    id: cleanTopic.id,
    topic: cleanTopic,
    deck: enrichedDeck,
    draftTitle,
    proposedHookEn: hookEn,
    proposedHookAr: hookAr,
    isUntitledHook: !hookEn && proposed.isUntitled,
    themeId: assignedThemeId,
    postFormat: targetFormat,
    generatedAt: new Date().toISOString(),
    sourceDomain: meta.sourceDomain,
    publishedDateLabel: meta.publishedDateLabel,
    freshnessTag: meta.freshnessTag,
    scoreBreakdown: meta.scoreBreakdown,
    compositeScore: meta.compositeScore,
    marrokAngle: meta.marrokAngle,
    metricEvidence,
    riskSignals,
    clusteredSources,
    suggestedSlot,
    alreadyCovered: Boolean(vaultMatch),
    coveredPostId: vaultMatch?.id,
    coveredPostTitle: vaultMatch?.title,
    coveredPostStatus: vaultMatch?.postStatus,
    isDeckSynthesized: true,
    qualityGate: { passed: true, blockingReasons: [], warnings: [], isSummaryOnly: false },
  });

  candidateDeckCache.set(cacheKey, candidate);
  return candidate;
}

/**
 * Lazy Background Content Gatherer:
 * Clusters overlapping stories across feeds, applies calibrated 5-factor scoring with
 * domain-balance decay, Vault duplicate penalties, triage learning feedback, and anti-rumor capping,
 * hides dismissed/skipped/snoozed items, and prepares fast Slide 1 hook cards with suggested calendar slots.
 */
export async function generateGatheredCandidatesInBackground(
  topics: GatheredTopicItem[],
  savedPosts: SavedPostRecord[],
  options?: {
    formatOverride?: 'auto' | PostFormat;
    lazy?: boolean;
    triageDecisions?: TriageDecisionRecord[];
    onProgress?: (current: number, total: number, currentTitle: string) => void;
  }
): Promise<GatheredCandidatePost[]> {
  const dismissedIds = getDismissedGatherTopicIds();
  const decisions = options?.triageDecisions ?? getLocalTriageDecisions();
  const useLazy = options?.lazy !== false;
  const nowMs = Date.now();

  const eligible = topics.filter(
    (t) =>
      !dismissedIds.has(t.id) &&
      !isTopicDismissedByTriage(t, decisions, nowMs)
  );

  // Cluster overlapping stories and apply calibrated 5-factor batch ranking
  const rankedTopics = scoreAndRankTopicBatch(eligible, {
    savedPosts,
    triageDecisions: decisions,
    isDuplicateFn: (t) => Boolean(isTopicAlreadyInVault(t, savedPosts)),
    nowMs,
  });

  const visibleTopics = rankedTopics
    .map((t) => ({
      topic: t as GatheredTopicItem,
      vaultMatch: isTopicAlreadyInVault(t as GatheredTopicItem, savedPosts),
    }))
    .sort((a, b) => {
      if (Boolean(a.vaultMatch) !== Boolean(b.vaultMatch)) {
        return a.vaultMatch ? 1 : -1;
      }
      return (b.topic.scoreBreakdown?.composite ?? b.topic.viralityScore ?? 0) -
        (a.topic.scoreBreakdown?.composite ?? a.topic.viralityScore ?? 0);
    });

  const candidates: GatheredCandidatePost[] = [];
  const rollingHistory: SavedPostRecord[] = [...savedPosts];

  for (let i = 0; i < visibleTopics.length; i++) {
    const { topic, vaultMatch } = visibleTopics[i];
    options?.onProgress?.(i + 1, visibleTopics.length, topic.title);

    if (i > 0 && i % 4 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const cadence = analyzePostHistoryCadence(rollingHistory, {
      prompt: topic.synthesisPrompt,
      category: topic.domainCategory,
    });
    const assignedThemeId = cadence.recommendedThemeId || 'teal';

    const candidate = useLazy
      ? buildLightweightLazyCandidate(
          topic,
          assignedThemeId,
          options?.formatOverride || 'auto',
          vaultMatch,
          { savedPosts, cardRankIndex: i, triageDecisions: decisions }
        )
      : buildCandidateFromTopicSync(
          topic,
          assignedThemeId,
          options?.formatOverride || 'auto',
          vaultMatch,
          { savedPosts, cardRankIndex: i, triageDecisions: decisions }
        );
    candidates.push(candidate);

    rollingHistory.unshift({
      id: candidate.id,
      title: candidate.draftTitle || topic.title,
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

/**
 * Lazy On-Demand Deck Hydration:
 * Generates the full 8-slide storyboard ONLY when a user opens/inspects a candidate
 * or clicks Move to Draft. Preserves edits to `marrokAngle` and enforces Slide 1 Hook + layout diversity.
 */
export async function hydrateCandidateDeckOnDemand(
  candidate: GatheredCandidatePost,
  options?: {
    useAi?: boolean;
    onStatus?: (msg: string) => void;
  }
): Promise<GatheredCandidatePost> {
  if (candidate.isDeckSynthesized && !options?.useAi) {
    return reEvaluateCandidateQuality(candidate);
  }

  if (options?.useAi) {
    return synthesizeCandidateWithFullAi(candidate, { onStatus: options.onStatus });
  }

  options?.onStatus?.(`Building full ${candidate.postFormat === 'single' ? '1-slide' : '8-slide'} storyboard...`);
  const hydrated = buildCandidateFromTopicSync(
    {
      ...candidate.topic,
      marrokAngle: candidate.marrokAngle,
    },
    candidate.themeId,
    candidate.postFormat,
    candidate.alreadyCovered && candidate.coveredPostId
      ? ({
          id: candidate.coveredPostId,
          title: candidate.coveredPostTitle || candidate.topic.title,
          postStatus: candidate.coveredPostStatus || 'validated',
        } as SavedPostRecord)
      : null,
    {
      preserveMetricEvidence: candidate.metricEvidence,
      preserveHookEn: candidate.draftTitle || candidate.proposedHookEn,
      preserveHookAr: candidate.proposedHookAr,
    }
  );

  return reEvaluateCandidateQuality({
    ...hydrated,
    marrokAngle: candidate.marrokAngle || hydrated.marrokAngle,
    suggestedSlot: candidate.suggestedSlot || hydrated.suggestedSlot,
    clusteredSources: candidate.clusteredSources || hydrated.clusteredSources,
  });
}

export interface AcceptCandidatesResult {
  scheduledPosts: SavedPostRecord[];
  draftPosts: SavedPostRecord[];
  failedCandidates: Array<{ title: string; error: string }>;
}

/**
 * Full AI Synthesis with Deep Article Scraping:
 * Upgrades a gathered candidate post on demand by scraping full article text from its source URL
 * and running `runAutonomousPipeline`, while keeping `userReviewed: false` & `verifiedNumbers: false`.
 */
export async function synthesizeCandidateWithFullAi(
  candidate: GatheredCandidatePost,
  options?: {
    onStatus?: (msg: string) => void;
  }
): Promise<GatheredCandidatePost> {
  let enrichedTopic: GatheredTopicItem = candidate.topic;
  const targetFormat: PostFormat = candidate.postFormat || 'carousel';

  if (
    enrichedTopic.url &&
    /^https?:\/\//i.test(enrichedTopic.url) &&
    !enrichedTopic.url.includes('news.ycombinator.com') &&
    (enrichedTopic.summary || '').length < 900
  ) {
    try {
      options?.onStatus?.(`Scraping full article from ${enrichedTopic.brand || enrichedTopic.sourceName}...`);
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
      // Proceed with existing topic summary if upstream site blocks scraping or is offline
    }
  }

  let aiDeck: CarouselData = candidate.deck;
  try {
    options?.onStatus?.(
      `Synthesizing ${targetFormat === 'single' ? '1-slide infographic' : '8-slide deck'} with AI...`
    );
    aiDeck = await runAutonomousPipeline(
      `${enrichedTopic.synthesisPrompt}\n\nRequired Marrok Angle (what this means for startups/product): ${candidate.marrokAngle}`,
      {
        categoryHint: enrichedTopic.domainCategory,
        postFormat: targetFormat === 'single' ? 'single' : 'carousel',
        onProgress: options?.onStatus,
      }
    );
    if (targetFormat === 'single' && aiDeck.slides.length > 1) {
      aiDeck = condenseCarouselToSingleSlide(aiDeck);
    }
  } catch {
    aiDeck = synthesizeCarousel({
      prompt: enrichedTopic.synthesisPrompt,
      categoryHint: enrichedTopic.domainCategory,
      postFormat: targetFormat === 'single' ? 'single' : 'carousel',
    });
    if (targetFormat === 'single' && aiDeck.slides.length > 1) {
      aiDeck = condenseCarouselToSingleSlide(aiDeck);
    }
  }

  if (aiDeck.slides.length > 2) {
    aiDeck = {
      ...aiDeck,
      slides: diversifyDeckArchetypesAndVisuals(aiDeck.slides, { dynamicCover: true }),
    };
  }
  aiDeck = autoFinalizeCarouselDeck(aiDeck);
  aiDeck = {
    ...aiDeck,
    slides: aiDeck.slides.map((s, idx) => ({
      ...s,
      layoutRationale: s.layoutRationale || explainArchetypeChoice(s, idx, aiDeck.slides.length),
    })),
  };

  const draftTitle = aiDeck.slides[0]?.enTitle || candidate.draftTitle || enrichedTopic.title;
  const upgradedDeck: CarouselData = {
    ...aiDeck,
    id: candidate.deck.id || `candidate_${enrichedTopic.id}`,
    theme: candidate.themeId,
    category: enrichedTopic.domainCategory || aiDeck.category || 'SYSTEMS ARCHITECTURE',
    brand: 'MARROK',
    brandUrl: 'marrok.org',
    channel: enrichedTopic.brand || enrichedTopic.sourceName || aiDeck.channel,
    postFormat: targetFormat,
    sourceMeta: {
      ...aiDeck.sourceMeta,
      title: enrichedTopic.title,
      creator: enrichedTopic.author || enrichedTopic.sourceName,
      channel: enrichedTopic.sourceName,
      published: enrichedTopic.publishedAt,
      url: enrichedTopic.url,
      viralityScore: candidate.compositeScore,
      viralAngle: enrichedTopic.viralAngle,
      marrokAngle: candidate.marrokAngle,
      userReviewed: false,
      verifiedNumbers: false,
      groundingSources: [
        { title: enrichedTopic.title, url: enrichedTopic.url },
        ...(aiDeck.sourceMeta?.groundingSources || []),
      ],
    },
  };

  const upgradedCandidate = reEvaluateCandidateQuality({
    ...candidate,
    topic: enrichedTopic,
    deck: upgradedDeck,
    draftTitle,
    isDeckSynthesized: true,
    generatedAt: new Date().toISOString(),
  });

  const cacheKey = `${enrichedTopic.id}|${targetFormat}`;
  candidateDeckCache.set(cacheKey, upgradedCandidate);
  return upgradedCandidate;
}

/**
 * Moves validated Inbox candidates into the Draft queue (`postStatus: 'validated'`, unscheduled).
 * NEVER bypasses human review (`userReviewed: false`, `verifiedNumbers: false`)
 * and NEVER auto-schedules posts in bulk or individually before human inspection.
 */
export async function acceptGatheredCandidatesToDrafts(
  candidatesList: GatheredCandidatePost[],
  options?: {
    useAiUpgrade?: boolean;
    onProgress?: (current: number, total: number, title: string) => void;
  }
): Promise<AcceptCandidatesResult> {
  const draftPosts: SavedPostRecord[] = [];
  const failedCandidates: Array<{ title: string; error: string }> = [];

  for (let i = 0; i < candidatesList.length; i++) {
    const rawCandidate = candidatesList[i];
    options?.onProgress?.(i + 1, candidatesList.length, rawCandidate.draftTitle);

    try {
      if (rawCandidate.alreadyCovered) {
        throw new Error(
          `Already covered in Vault ("${rawCandidate.coveredPostTitle || rawCandidate.topic.title}")`
        );
      }

      if (isSingleMetricUnverified(rawCandidate.metricEvidence)) {
        throw new Error(
          `Verify "${rawCandidate.metricEvidence[0].label}" against its source quote before adding to drafts.`
        );
      }

      if (rawCandidate.isUntitledHook && !(rawCandidate.draftTitle || '').trim()) {
        throw new Error('Add a 2–5 word hook headline before adding to drafts.');
      }

      if (!rawCandidate.marrokAngle || rawCandidate.marrokAngle.trim().length < 15) {
        throw new Error('Add a Marrok angle (what this means for your product) before adding to drafts.');
      }

      // Lazy full-deck generation only at inspection / acceptance time
      const candidate = await hydrateCandidateDeckOnDemand(rawCandidate, {
        useAi: options?.useAiUpgrade,
      });

      const gate = evaluateGathererCandidateQuality({
        title: candidate.topic.title,
        draftTitle: candidate.draftTitle,
        summary: candidate.topic.summary,
        marrokAngle: candidate.marrokAngle,
        deck: candidate.deck,
      });

      if (!gate.passed) {
        throw new Error(`Quality Gate blocked: ${gate.blockingReasons[0]}`);
      }

      const cleanDeck: CarouselData = {
        ...candidate.deck,
        id: `gather_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        theme: candidate.themeId,
        postFormat: candidate.postFormat,
        sourceMeta: {
          ...candidate.deck.sourceMeta,
          title: candidate.deck.sourceMeta?.title || candidate.topic.title,
          url: candidate.deck.sourceMeta?.url || candidate.topic.url,
          published: candidate.deck.sourceMeta?.published || candidate.topic.publishedAt,
          sourceSummary:
            candidate.deck.sourceMeta?.sourceSummary ||
            (candidate.topic.summary || '').slice(0, 2200),
          metricEvidence:
            candidate.metricEvidence && candidate.metricEvidence.length > 0
              ? candidate.metricEvidence.map((m) => ({ ...m }))
              : candidate.deck.sourceMeta?.metricEvidence,
          extractedSourceMetrics:
            candidate.topic.extractedMetrics && candidate.topic.extractedMetrics.length > 0
              ? candidate.topic.extractedMetrics
              : candidate.deck.sourceMeta?.extractedSourceMetrics,
          marrokAngle: candidate.marrokAngle.trim(),
          userReviewed: false,
          humanApproved: false,
          verifiedNumbers: false,
        },
      };

      const saved = await saveValidPost({
        deck: cleanDeck,
        postStatus: 'validated',
        title: candidate.draftTitle || cleanDeck.slides[0]?.enTitle || candidate.topic.title,
        allowOverride: true,
        userReviewed: false,
        verifiedNumbers: false,
      });

      draftPosts.push({
        ...saved,
        humanApproved: false,
        verifiedNumbers: false,
        scheduledFor: undefined,
      });

      // Unify triage decision: persist action 'draft' with canonical URL + clustered URLs
      void logTriageDecision({
        topicId: candidate.topic.id,
        topicSignature: candidate.topic.title || candidate.draftTitle,
        canonicalUrl: candidate.topic.url,
        clusteredUrls: (candidate.clusteredSources || []).map((s) => s.url),
        sourceDomain: candidate.topic.sourceDomain || candidate.topic.sourceName || 'unknown',
        domainCategory: candidate.topic.domainCategory || 'DISTRIBUTED SYSTEMS',
        action: 'draft',
      }).catch((err) => {
        console.warn('[GatherClient] Failed to record draft triage decision:', err);
      });
      candidateDeckCache.delete(candidate.topic.id);
    } catch (err) {
      failedCandidates.push({
        title: rawCandidate.draftTitle,
        error: err instanceof Error ? err.message : 'Failed to move candidate to Draft',
      });
    }
  }

  return {
    scheduledPosts: draftPosts,
    draftPosts,
    failedCandidates,
  };
}

export interface BatchGatherResult {
  createdPosts: SavedPostRecord[];
  failedTopics: Array<{ title: string; error: string }>;
}

/**
 * Batch-synthesizes selected gathered topics into the Vault as Pending Human Review drafts
 * (`userReviewed: false`, `verifiedNumbers: false`, unscheduled) with rotating theme colors.
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
      const meta = deriveTopicScoringMetadata(topic);
      const cadence = analyzePostHistoryCadence(workingHistory, {
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
        } catch (err) {
          console.warn('[GatherClient] AI pipeline failed for gathered topic, falling back to local synthesizer:', err);
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
        brand: 'MARROK',
        brandUrl: 'marrok.org',
        channel: topic.brand || topic.sourceName || deck.channel,
        postFormat: targetFormat,
        sourceMeta: {
          ...deck.sourceMeta,
          title: topic.title,
          creator: topic.author || topic.sourceName,
          channel: topic.sourceName,
          published: topic.publishedAt,
          url: topic.url,
          marrokAngle: meta.marrokAngle,
          userReviewed: false,
          verifiedNumbers: false,
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
        verifiedNumbers: false,
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
  'the core trade-off.',
  'the core trade-off',
  'join the discussion.',
  'join the discussion',
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

  const diversifiedSlides = diversifyDeckArchetypesAndVisuals(post.deck.slides, {
    dynamicCover: true,
  });
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
      userReviewed: post.deck?.sourceMeta?.userReviewed,
      verifiedNumbers: post.verifiedNumbers ?? post.deck?.sourceMeta?.verifiedNumbers,
    });
  } catch (err) {
    console.warn('[GatherClient] Failed to persist diversified visuals remotely, returning local record:', err);
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
  let scrapedAuthor =
    post.creatorHandle || post.deck?.sourceMeta?.creator || post.deck?.brand || 'MARROK';
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
    } catch (err) {
      console.warn('[GatherClient] Source URL scrape unavailable, using existing post context:', err);
    }
  }

  if (!synthesisPrompt) {
    const existingFacts = (post.deck?.facts || [])
      .map((f) => f.text)
      .filter((t) => t && !t.startsWith('Primary architectural domain:') && !t.startsWith('Brand attribution:'))
      .join('\n• ');
    const captionContext = (post.deck?.caption || '').replace(/⚡[^\n]*\n?/g, '').slice(0, 2400);

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
  } catch (err) {
    console.warn('[GatherClient] Deep AI re-synthesis failed, using local synthesizer fallback:', err);
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
      slides: diversifyDeckArchetypesAndVisuals(upgradedDeck.slides, { dynamicCover: true }),
    };
  }

  const finalDeck: CarouselData = {
    ...upgradedDeck,
    id: post.id,
    theme: post.deck?.theme || upgradedDeck.theme || 'blueprint',
    category: post.category || upgradedDeck.category || 'DISTRIBUTED SYSTEMS',
    brand: 'MARROK',
    brandUrl: 'marrok.org',
    channel: scrapedBrand !== 'MARROK' ? scrapedBrand : post.deck?.channel || scrapedAuthor,
    postFormat: targetFormat,
    sourceMeta: {
      ...upgradedDeck.sourceMeta,
      title: scrapedTitle,
      creator: scrapedAuthor,
      channel: post.deck?.sourceMeta?.channel || scrapedAuthor,
      url: rawSourceUrl || upgradedDeck.sourceMeta?.url,
      published: post.deck?.sourceMeta?.published || new Date().toISOString(),
      marrokAngle: post.deck?.sourceMeta?.marrokAngle,
      userReviewed: false,
      verifiedNumbers: false,
    },
  };

  const finalTitle = finalDeck.slides[0]?.enTitle || scrapedTitle;
  const updatedRecord: SavedPostRecord = {
    ...post,
    title: finalTitle,
    slideCount: finalDeck.slides.length,
    qaPassed: true,
    humanApproved: false,
    verifiedNumbers: false,
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
      userReviewed: false,
      verifiedNumbers: false,
    });
    return {
      ...saved,
      scheduledFor: post.scheduledFor ?? saved.scheduledFor,
      publishTargets: post.publishTargets ?? saved.publishTargets,
      postedAt: post.postedAt ?? saved.postedAt,
    };
  } catch (err) {
    console.warn('[GatherClient] Failed to persist re-synthesized post remotely, returning local record:', err);
    return updatedRecord;
  }
}

/**
 * 1-Click Single-Slide AI Regeneration:
 * Never forces Slide 1 to 'hub'; respects Hook archetypes + layout diversity + layoutRationale.
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
    } catch (err) {
      console.warn('[GatherClient] Article scrape skipped during single-slide regen:', err);
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
  } catch (err) {
    console.warn('[GatherClient] Single-slide AI regen fell back to local synthesizer:', err);
    freshDeck = synthesizeCarousel({
      prompt: targetedPrompt,
      categoryHint: enrichedTopic.domainCategory,
      postFormat: candidate.postFormat === 'single' ? 'single' : 'carousel',
    });
  }

  const diversifiedFreshSlides = diversifyDeckArchetypesAndVisuals(freshDeck.slides || [], {
    dynamicCover: true,
  });
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
      ? inferDynamicCoverArchetype(pickedFresh)
      : slideIndex === slides.length - 1 && currentSlide.type === 'cta'
      ? 'cta'
      : pickedFresh.type || currentSlide.type);

  const mergedSlide = {
    ...pickedFresh,
    type: targetType,
  };

  const reDiversified = diversifyDeckArchetypesAndVisuals(
    slides.map((s, idx) => (idx === slideIndex ? mergedSlide : s)),
    { dynamicCover: true }
  );

  const mergedRegenerated: CarouselData['slides'][number] = {
    ...reDiversified[slideIndex],
    type: targetType,
    enTitle: pickedFresh.enTitle || reDiversified[slideIndex]?.enTitle || currentSlide.enTitle,
    arTitle: pickedFresh.arTitle || reDiversified[slideIndex]?.arTitle || currentSlide.arTitle,
    enBody: pickedFresh.enBody || reDiversified[slideIndex]?.enBody || currentSlide.enBody,
    arBody: pickedFresh.arBody || reDiversified[slideIndex]?.arBody || currentSlide.arBody,
    layoutRationale: explainArchetypeChoice(
      { ...reDiversified[slideIndex], type: targetType },
      slideIndex,
      slides.length
    ),
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

  const updatedCandidate = reEvaluateCandidateQuality({
    ...candidate,
    topic: enrichedTopic,
    draftTitle: nextDraftTitle,
    isDeckSynthesized: true,
    deck: {
      ...candidate.deck,
      slides,
      sourceMeta: {
        ...candidate.deck.sourceMeta,
        isFallback: false,
      },
    },
    generatedAt: new Date().toISOString(),
  });

  const cacheKey = `${enrichedTopic.id}|${candidate.postFormat}`;
  candidateDeckCache.set(cacheKey, updatedCandidate);
  return updatedCandidate;
}


