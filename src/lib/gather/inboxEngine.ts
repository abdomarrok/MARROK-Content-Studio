import type {
  CandidateRiskSignals,
  ClusteredSourceItem,
  MetricEvidenceItem,
  SavedPostRecord,
  SuggestedCalendarSlot,
  TopicScoreBreakdown,
  TriageDecisionRecord,
} from '../../types.ts';

export interface InboxTopicLike {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  sourceDomain?: string;
  sourceType: string;
  author?: string;
  brand?: string;
  brandUrl?: string;
  domainCategory: string;
  publishedAt?: string;
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
  clusteredSources?: ClusteredSourceItem[];
}

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules)/gi,
  /disregard\s+(?:all\s+)?(?:previous|prior|system)\s+(?:instructions|prompts|rules)/gi,
  /(?:system\s*prompt|developer\s*message|new\s*instructions)\s*:/gi,
  /<\|(?:im_start|im_end|system|user|assistant)\|>/gi,
  /<\/?untrusted_source_content>/gi,
];

const BIDI_CONTROL_RE = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\u0000-\u001F\u007F]/g;

/**
 * Sanitizes untrusted feed/article text for safe UI rendering and downstream synthesis.
 * Never allows HTML tags, script payloads, BiDi spoofing chars, or prompt directives through.
 */
export function sanitizeFeedDisplayText(raw: string, maxLen = 600): string {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/javascript\s*:/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .replace(BIDI_CONTROL_RE, '');

  for (const re of PROMPT_INJECTION_PATTERNS) {
    text = text.replace(re, '');
  }

  return text.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function isPrivateOrBlockedHostname(rawHost: string): boolean {
  const host = rawHost.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::' ||
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    host.endsWith('.internal') ||
    host.endsWith('.arpa') ||
    host === 'metadata.google.internal' ||
    host === 'metadata'
  ) {
    return true;
  }

  // Block integer/hex/octal obfuscated IP literals like http://2130706433 or 0x7f000001
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) {
    return true;
  }

  // IPv4 literal checks
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [a, b] = [Number(ipv4Match[1]), Number(ipv4Match[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // Cloud metadata / link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast / reserved
  }

  // IPv6 private / link-local / loopback / v4-mapped
  if (host.includes(':')) {
    if (
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80') ||
      host.startsWith('::ffff:') ||
      host === '::1'
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Validates that a URL is a safe public http(s) URL (no javascript:/file:/data:, no private/loopback IPs).
 */
export function sanitizeSafeHttpUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    if (isPrivateOrBlockedHostname(parsed.hostname)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Validates a user-submitted article or RSS feed URL with SSRF parity before sending to backend.
 */
export function validateUserSubmittedUrl(
  rawUrl: string
): { ok: true; normalizedUrl: string; isRss: boolean } | { ok: false; error: string } {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter a public https:// article or RSS feed URL.' };
  }

  if (/^(javascript|data|file|vbscript|ftp):/i.test(trimmed)) {
    return { ok: false, error: 'Blocked URL scheme. Only public https:// URLs are allowed.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Invalid URL format. Include https:// (e.g. https://blog.cloudflare.com/rss/).' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'Only public http:// or https:// URLs are permitted.' };
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: 'URLs with embedded credentials are not allowed.' };
  }

  if (isPrivateOrBlockedHostname(parsed.hostname)) {
    return {
      ok: false,
      error: 'Private network, localhost, and cloud metadata addresses are blocked for security.',
    };
  }

  if (!parsed.hostname.includes('.')) {
    return { ok: false, error: 'URL must use a public fully-qualified domain name.' };
  }

  const isRss = /(\/rss\/?|\/feed\/?|\.rss$|\.xml$|atom\.xml|rss\.xml)/i.test(
    `${parsed.pathname}${parsed.search}`
  );

  return {
    ok: true,
    normalizedUrl: parsed.toString(),
    isRss,
  };
}

export function extractDomainClean(rawUrl?: string, fallback?: string): string {
  if (rawUrl) {
    try {
      return new URL(rawUrl).hostname.replace(/^www\./i, '').toLowerCase();
    } catch {
      // fall through
    }
  }
  return (fallback || 'source').replace(/^www\./i, '').toLowerCase();
}

export function canonicalizeStoryUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    const keepParams = new URLSearchParams();
    parsed.searchParams.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (
        !lowerKey.startsWith('utm_') &&
        !['ref', 'source', 'fbclid', 'gclid', 'mc_cid', 'mc_eid', 's', 'share'].includes(lowerKey)
      ) {
        keepParams.set(key, val);
      }
    });
    const pathClean = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    const qs = keepParams.toString();
    return `${host}${pathClean}${qs ? `?${qs}` : ''}`;
  } catch {
    return (rawUrl || '').trim().toLowerCase().replace(/\/+$/, '');
  }
}

const TITLE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'how', 'why', 'what', 'when', 'where',
  'that', 'this', 'your', 'our', 'their', 'about', 'over', 'under', 'using', 'built',
  'build', 'building', 'new', 'more', 'less', 'than', 'just', 'now', 'all', 'are', 'was',
  'were', 'can', 'will', 'not', 'but', 'you', 'they', 'its', 'via', 'per', 'daily',
]);

export function extractTopicTokens(text: string): string[] {
  return sanitizeFeedDisplayText(text, 400)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^-+|-+$/g, ''))
    .filter((w) => w.length >= 3 && !TITLE_STOPWORDS.has(w));
}

const AGGREGATOR_DOMAINS = new Set([
  'news.ycombinator.com',
  'reddit.com',
  'old.reddit.com',
  'lobste.rs',
  'x.com',
  'twitter.com',
  't.co',
  'linkedin.com',
  'medium.com',
]);

export function isOriginalEngineeringSource(item: {
  url?: string;
  sourceType?: string;
  sourceDomain?: string;
}): boolean {
  const domain = extractDomainClean(item.url, item.sourceDomain);
  if (AGGREGATOR_DOMAINS.has(domain) || domain.endsWith('.reddit.com')) {
    return false;
  }
  if (
    item.sourceType === 'rss' ||
    item.sourceType === 'curated' ||
    item.sourceType === 'custom-url' ||
    item.sourceType === 'github'
  ) {
    return true;
  }
  // HN / Lobsters / Reddit link pointing directly to an original engineering blog, arxiv, or github
  if (
    domain.startsWith('blog.') ||
    domain.includes('engineering') ||
    domain === 'arxiv.org' ||
    domain === 'github.com' ||
    domain.endsWith('.dev') ||
    domain.endsWith('.io') ||
    /\.(com|org|net)$/.test(domain)
  ) {
    return item.sourceType !== 'reddit' || !domain.includes('reddit.com');
  }
  return false;
}

const RUMOR_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\b(rumou?r|rumou?red|rumou?rs)\b/i, reason: 'Rumor-style source phrasing' },
  { re: /\b(leaked|alleged\s+leak|unconfirmed\s+leak|insider\s+leak)\b/i, reason: 'Unverified leak claim' },
  { re: /\b(allegedly|unconfirmed|unverified\s+report|sources\s+say|anonymous\s+tip|insider\s+claims)\b/i, reason: 'Anonymous or unconfirmed claim' },
  { re: /\b(speculat(?:ion|ing)|hearsay|word\s+on\s+the\s+street|someone\s+on\s+(?:x|twitter)\s+said)\b/i, reason: 'Speculative or hearsay claim' },
];

/**
 * Hard filter detector for rumors, leaks, or unsourced claims that must never rank in the top tier.
 */
export function detectRumorOrUnsourcedClaim(item: {
  title: string;
  summary: string;
  url?: string;
  sourceType?: string;
  sourceDomain?: string;
}): { isRumorOrUnsourced: boolean; reason?: string } {
  const combined = `${item.title || ''} ${item.summary || ''}`;
  for (const { re, reason } of RUMOR_PATTERNS) {
    if (re.test(combined)) {
      return { isRumorOrUnsourced: true, reason };
    }
  }

  if (item.url !== undefined) {
    const safeUrl = sanitizeSafeHttpUrl(item.url);
    if (!safeUrl) {
      return { isRumorOrUnsourced: true, reason: 'No verifiable public source URL' };
    }

    const domain = extractDomainClean(safeUrl, item.sourceDomain);
    if (
      (AGGREGATOR_DOMAINS.has(domain) || domain.endsWith('.reddit.com')) &&
      (!item.summary || item.summary.trim().length < 45)
    ) {
      return { isRumorOrUnsourced: true, reason: 'Unsourced forum post with no primary reference' };
    }
  } else if (item.sourceType !== 'curated' && item.sourceType !== 'rss') {
    return { isRumorOrUnsourced: true, reason: 'No verifiable public source URL' };
  }

  return { isRumorOrUnsourced: false };
}

/**
 * Clusters overlapping stories across feeds (HN, Reddit, Lobsters, RSS, GitHub) into a single
 * canonical card with `clusteredSources[]`, preferring primary engineering blogs over reposts.
 */
export function clusterSimilarTopics<T extends InboxTopicLike>(
  items: T[]
): Array<T & { clusteredSources: ClusteredSourceItem[] }> {
  interface ClusterBucket {
    canonicalUrl: string;
    tokens: Set<string>;
    items: T[];
  }

  const buckets: ClusterBucket[] = [];

  for (const rawItem of items) {
    const cleanTitle = sanitizeFeedDisplayText(rawItem.title, 220);
    const cleanSummary = sanitizeFeedDisplayText(rawItem.summary, 3600);
    const item: T = {
      ...rawItem,
      title: cleanTitle || rawItem.title,
      summary: cleanSummary || rawItem.summary,
    };

    const canonUrl = canonicalizeStoryUrl(item.url || '');
    const tokens = new Set(extractTopicTokens(item.title));

    let matchedBucket: ClusterBucket | null = null;
    for (const bucket of buckets) {
      if (canonUrl && bucket.canonicalUrl && canonUrl === bucket.canonicalUrl) {
        matchedBucket = bucket;
        break;
      }
      if (tokens.size >= 3 && bucket.tokens.size >= 3) {
        let shared = 0;
        tokens.forEach((tok) => {
          if (bucket.tokens.has(tok)) shared += 1;
        });
        const minSize = Math.min(tokens.size, bucket.tokens.size);
        const unionSize = tokens.size + bucket.tokens.size - shared;
        const jaccard = unionSize > 0 ? shared / unionSize : 0;
        const overlapRatio = minSize > 0 ? shared / minSize : 0;
        if ((shared >= 3 && overlapRatio >= 0.55) || jaccard >= 0.48) {
          matchedBucket = bucket;
          break;
        }
      }
    }

    if (matchedBucket) {
      matchedBucket.items.push(item);
      tokens.forEach((t) => matchedBucket!.tokens.add(t));
    } else {
      buckets.push({
        canonicalUrl: canonUrl,
        tokens,
        items: [item],
      });
    }
  }

  const sourcePriority = (it: T): number => {
    const isOrig = isOriginalEngineeringSource(it);
    let p = isOrig ? 100 : 20;
    if (it.sourceType === 'custom-url') p += 40;
    else if (it.sourceType === 'rss') p += 30;
    else if (it.sourceType === 'curated') p += 25;
    else if (it.sourceType === 'github') p += 20;
    else if (it.sourceType === 'hn') p += 10;
    p += Math.min(20, Math.floor((it.summary || '').length / 60));
    p += Math.min(15, (it.extractedMetrics?.length || 0) * 4);
    return p;
  };

  return buckets.map((bucket) => {
    const sorted = [...bucket.items].sort((a, b) => sourcePriority(b) - sourcePriority(a));
    const primary = sorted[0];

    // Deduplicate clustered sources
    const seenSourceKey = new Set<string>();
    const clusteredSources: ClusteredSourceItem[] = [];

    const addSource = (src: ClusteredSourceItem) => {
      const safe = sanitizeSafeHttpUrl(src.url);
      if (!safe) return;
      const key = `${src.sourceType.toLowerCase()}|${src.domain.toLowerCase()}|${src.sourceName.toLowerCase()}`;
      if (seenSourceKey.has(key)) return;
      seenSourceKey.add(key);
      clusteredSources.push({ ...src, url: safe });
    };

    for (const member of sorted) {
      if (Array.isArray(member.clusteredSources) && member.clusteredSources.length > 0) {
        for (const existing of member.clusteredSources) {
          addSource(existing);
        }
      } else {
        addSource({
          sourceName: sanitizeFeedDisplayText(member.sourceName || member.brand || 'Source', 60),
          sourceType: member.sourceType || 'rss',
          domain: extractDomainClean(member.url, member.sourceDomain || member.brandUrl),
          url: member.url,
          title: sanitizeFeedDisplayText(member.title, 140),
        });
      }
    }

    // Merge metrics and pick richest summary
    const metricSet = new Map<string, string>();
    let richestSummary = primary.summary || '';
    let maxScore = Number(primary.score) || 0;
    let earliestOrLatestPub = primary.publishedAt;

    for (const member of sorted) {
      if ((member.summary || '').length > richestSummary.length) {
        richestSummary = member.summary;
      }
      if ((Number(member.score) || 0) > maxScore) {
        maxScore = Number(member.score) || 0;
      }
      if (member.publishedAt && earliestOrLatestPub) {
        if (Date.parse(member.publishedAt) > Date.parse(earliestOrLatestPub)) {
          earliestOrLatestPub = member.publishedAt;
        }
      }
      for (const m of member.extractedMetrics || []) {
        const cleanM = sanitizeFeedDisplayText(m, 64);
        const key = cleanM.toLowerCase();
        if (cleanM && !metricSet.has(key)) {
          metricSet.set(key, cleanM);
        }
      }
    }

    return {
      ...primary,
      summary: richestSummary,
      score: maxScore,
      publishedAt: earliestOrLatestPub,
      extractedMetrics: Array.from(metricSet.values()).slice(0, 5),
      clusteredSources,
    };
  });
}

/**
 * Computes learning adjustment from logged triage decisions (draft boosts, skip reasons penalize).
 */
export function computeLearningAdjustment(
  item: { sourceDomain?: string; url?: string; domainCategory?: string; title?: string },
  decisions: TriageDecisionRecord[] = []
): number {
  if (!decisions || decisions.length === 0) return 0;

  const domain = extractDomainClean(item.url, item.sourceDomain);
  const category = (item.domainCategory || '').toUpperCase();
  const titleTokens = new Set(extractTopicTokens(item.title || ''));

  let domainDelta = 0;
  let categoryDelta = 0;
  let topicDelta = 0;

  for (const d of decisions) {
    const sameDomain = domain && d.sourceDomain.toLowerCase() === domain;
    const sameCategory = category && d.domainCategory.toUpperCase() === category;

    if (d.action === 'draft') {
      if (sameDomain) domainDelta += 4;
      if (sameCategory) categoryDelta += 2;
    } else if (d.action === 'skip') {
      const weight =
        d.reason === 'risky'
          ? -9
          : d.reason === 'off-topic'
          ? -7
          : d.reason === 'too-basic' || d.reason === 'cant-verify'
          ? -6
          : -2;
      if (sameDomain) domainDelta += weight;
      if (sameCategory) categoryDelta += Math.round(weight * 0.45);
      if (d.topicSignature && titleTokens.size >= 2) {
        const sigTokens = extractTopicTokens(d.topicSignature);
        const shared = sigTokens.filter((t) => titleTokens.has(t)).length;
        if (shared >= 2) {
          topicDelta += weight;
        }
      }
    }
  }

  const clampedDomain = Math.max(-18, Math.min(12, domainDelta));
  const clampedCat = Math.max(-10, Math.min(8, categoryDelta));
  const clampedTopic = Math.max(-15, Math.min(6, topicDelta));
  return clampedDomain + clampedCat + clampedTopic;
}

function stableHashFraction(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

export interface CalibratedScoringContext {
  domainOccurrences?: number; // prior occurrences of same domainCategory in batch
  sourceOccurrences?: number; // prior occurrences of same sourceDomain in batch
  isVaultDuplicate?: boolean;
  triageDecisions?: TriageDecisionRecord[];
  nowMs?: number;
}

/**
 * Calibrated 5-factor scoring:
 * Relevance (30%) + Freshness (20%) + Novelty (20%) + Verifiability (20%) + Domain Balance (10%),
 * with Vault duplicate penalties, triage learning feedback, and a hard anti-rumor ceiling (<= 54).
 */
export function computeCalibratedTopicScore(
  item: {
    id?: string;
    title: string;
    summary: string;
    url?: string;
    score: number;
    extractedMetrics: string[];
    sourceType?: string;
    sourceDomain?: string;
    author?: string;
    publishedAt?: string;
    domainCategory?: string;
    clusteredSources?: ClusteredSourceItem[];
  },
  context: CalibratedScoringContext = {}
): {
  viralityScore: number;
  viralAngle: string;
  scoreBreakdown: TopicScoreBreakdown;
  clientRelevanceReason: string;
  marrokAngle: string;
  exactFloatScore: number;
} {
  const combined = sanitizeFeedDisplayText(`${item.title || ''} ${item.summary || ''}`, 2000);
  const lower = combined.toLowerCase();
  const nowMs = context.nowMs ?? Date.now();
  const sourceDomain = extractDomainClean(item.url, item.sourceDomain);
  const isOriginal = isOriginalEngineeringSource({
    url: item.url,
    sourceType: item.sourceType,
    sourceDomain,
  });
  const rumorCheck = detectRumorOrUnsourcedClaim({
    title: item.title,
    summary: item.summary,
    url: item.url,
    sourceType: item.sourceType,
    sourceDomain,
  });

  // 1. Freshness (smooth continuous decay, not flat plateaus)
  const parsedPub = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
  const ageHours = Number.isFinite(parsedPub)
    ? Math.max(0, (nowMs - parsedPub) / 3600_000)
    : 36;
  const isEvergreen =
    item.sourceType === 'curated' ||
    /\b(how\s+we|architecture|internals|postmortem|under\s+the\s+hood|migration|playbook)\b/i.test(
      combined
    );

  let freshnessRaw: number;
  if (ageHours <= 2) {
    freshnessRaw = 96 - ageHours * 0.8;
  } else if (ageHours <= 24) {
    freshnessRaw = 94.4 - (ageHours - 2) * 0.55;
  } else if (ageHours <= 72) {
    freshnessRaw = 82.3 - (ageHours - 24) * 0.28;
  } else if (ageHours <= 7 * 24) {
    freshnessRaw = 68.8 - (ageHours - 72) * 0.14;
  } else if (ageHours <= 30 * 24) {
    freshnessRaw = (isEvergreen ? 56 : 48) - ((ageHours - 168) / 552) * 20;
  } else {
    freshnessRaw = Math.max(14, (isEvergreen ? 38 : 26) - ((ageHours - 720) / 720) * 12);
  }
  const freshness = Math.max(14, Math.min(97, Math.round(freshnessRaw)));
  const freshnessTag: 'fresh' | 'evergreen' = ageHours <= 72 ? 'fresh' : 'evergreen';

  // 2. Audience Relevance (granular additive signal for backend/infra/AI/security/cost builders)
  let relRaw = 42;
  const tier1Matches = (
    lower.match(
      /\b(postgres|postgresql|redis|sqlite|scylla|cassandra|database|latency|p99|cache|kv[- ]?cache|cloud\s*cost|cpu|memory|throughput|proxy|nginx|rust|ebpf|kubernetes|docker|sandbox|zero[- ]?trust|mtls|inference|llm|agent)\b/g
    ) || []
  ).length;
  relRaw += Math.min(34, tier1Matches * 7);

  const tier2Matches = (
    lower.match(
      /\b(production|migration|outage|postmortem|benchmark|startup|sme|scale|self-host|open[- ]?source|api|queue|worker|deploy|failover|sharding|raft|consensus|async|proxies|requests|backend|architecture|cloudflare)\b/g
    ) || []
  ).length;
  relRaw += Math.min(20, tier2Matches * 4.5);
  if ((item.extractedMetrics?.length || 0) >= 2) {
    relRaw += 8;
  }

  if (/\b(beginner|tutorial\s+101|hello\s+world|css\s+trick|meme|wallpaper|gaming|crypto\s+coin)\b/.test(lower)) {
    relRaw -= 24;
  }
  if (/\b(preprint|abstract\s+algebra|theoretical\s+only|toy\s+example)\b/.test(lower)) {
    relRaw -= 14;
  }
  const relevance = Math.max(18, Math.min(96, Math.round(relRaw)));

  // 3. Novelty (architectural contrast, concrete numbers, multi-feed buzz, anti-cliché)
  const rawScore = Math.max(1, Number(item.score) || 30);
  const velocityBoost = Math.min(24, Math.log10(rawScore + 10) * 8.5);
  const clusterCount = Math.max(1, item.clusteredSources?.length || 1);
  const clusterBoost = Math.min(14, (clusterCount - 1) * 7);
  let noveltyRaw = 36 + velocityBoost + clusterBoost;

  let viralAngle = 'SYSTEMS DEEP DIVE';
  if (/\b(vs\.?|versus|replacing|replaced|migrating\s+from|ditched|instead\s+of)\b/i.test(combined)) {
    noveltyRaw += 14;
    viralAngle = 'ARCHITECTURE SHOWDOWN';
  } else if (/\b(cve-\d+|zero[- ]?day|postmortem|outage|breach)\b/i.test(lower)) {
    noveltyRaw += 12;
    viralAngle = 'HIGH-STAKES RISK';
  } else if ((item.extractedMetrics?.length || 0) >= 2) {
    noveltyRaw += 11;
    viralAngle = 'BENCHMARK SHOCK';
  } else if (/\b(mla|kv[- ]?cache|vllm|deepseek|agent|inference|quantiz)\b/i.test(lower)) {
    noveltyRaw += 9;
    viralAngle = 'AI BREAKTHROUGH';
  } else if (item.sourceType === 'github') {
    noveltyRaw += 7;
    viralAngle = 'OPEN-SOURCE BREAKOUT';
  }

  if (/\b(what\s+is|introduction\s+to|getting\s+started|top\s+\d+\s+tips|ultimate\s+guide|beginners?)\b/i.test(lower)) {
    noveltyRaw -= 22;
  }
  const novelty = Math.max(18, Math.min(95, Math.round(noveltyRaw)));

  // 4. Verifiability (primary source, grounded metrics, author/org, no rumor signals)
  let verifRaw = 46;
  if (isOriginal) verifRaw += 22;
  else verifRaw -= 12;

  const metricCount = item.extractedMetrics?.length || 0;
  if (metricCount >= 3) verifRaw += 20;
  else if (metricCount === 2) verifRaw += 15;
  else if (metricCount === 1) verifRaw += 8;
  else verifRaw -= 10;

  if (item.author && item.author.trim().length > 1) verifRaw += 6;
  if (clusterCount >= 2) verifRaw += Math.min(10, (clusterCount - 1) * 5);
  if (metricCount === 0 && (item.summary || '').trim().length < 70) verifRaw -= 14;
  if (rumorCheck.isRumorOrUnsourced) verifRaw -= 40;

  const verifiability = Math.max(10, Math.min(96, Math.round(verifRaw)));

  // 5. Domain Balance (penalize over-represented domains/sources in the batch)
  const priorCat = Math.max(0, context.domainOccurrences || 0);
  const priorSrc = Math.max(0, context.sourceOccurrences || 0);
  const domainBalance = Math.max(20, Math.min(96, Math.round(92 - priorCat * 12 - priorSrc * 16)));

  // Engagement + Platform risk retained for compatibility
  const engagement = Math.max(
    20,
    Math.min(96, Math.round(24 + velocityBoost * 1.9 + Math.min(18, metricCount * 6) + clusterBoost))
  );
  let riskScore = isOriginal ? 8 : 18;
  if (/\b(hack|exploit|weapon|bypass|pirat|crack|leak)\b/i.test(lower)) riskScore += 18;
  if (/\b(layoff|drama|scandal|lawsuit|fired|politic)\b/i.test(lower)) riskScore += 16;
  if (metricCount === 0) riskScore += 8;
  if (rumorCheck.isRumorOrUnsourced) riskScore += 32;
  riskScore = Math.max(4, Math.min(88, riskScore));
  const platformRisk = 100 - riskScore;

  // Duplicate & Learning adjustments
  const duplicatePenalty = context.isVaultDuplicate ? 26 : 0;
  const learningAdjustment = computeLearningAdjustment(
    {
      url: item.url,
      sourceDomain,
      domainCategory: item.domainCategory,
      title: item.title,
    },
    context.triageDecisions || []
  );

  // Calibrated weighted composite
  let exactFloatScore =
    relevance * 0.30 +
    freshnessRaw * 0.20 +
    novelty * 0.20 +
    verifiability * 0.20 +
    domainBalance * 0.10 -
    duplicatePenalty +
    learningAdjustment;

  if (ageHours > 14 * 24) {
    exactFloatScore -= isEvergreen ? 6 : 16;
  } else if (ageHours > 7 * 24) {
    exactFloatScore -= isEvergreen ? 2 : 8;
  }

  // Tiny deterministic sub-point tie-breaker derived from signal fingerprint (<= 0.9 pts)
  exactFloatScore += stableHashFraction(`${item.id || ''}|${item.title}|${sourceDomain}`) * 0.85;

  // Hard anti-rumor filter: rumors, leaks, and unsourced claims never rank in the top tier
  let rumorCapped = false;
  if (rumorCheck.isRumorOrUnsourced && exactFloatScore > 54) {
    exactFloatScore = Math.min(54, exactFloatScore * 0.6);
    rumorCapped = true;
  }

  const composite = Math.max(12, Math.min(96, Math.round(exactFloatScore)));

  const grounded = buildGroundedFitLine({
    title: item.title,
    summary: item.summary,
    extractedMetrics: item.extractedMetrics,
    domainCategory: item.domainCategory || 'DISTRIBUTED SYSTEMS',
    sourceDomain,
  });

  return {
    viralityScore: composite,
    viralAngle,
    exactFloatScore,
    clientRelevanceReason: grounded.reason,
    marrokAngle: grounded.fitLine,
    scoreBreakdown: {
      composite,
      freshness,
      engagement,
      clientRelevance: relevance,
      platformRisk,
      riskScore,
      ageHours: Math.round(ageHours),
      freshnessTag,
      relevance,
      novelty,
      verifiability,
      domainBalance,
      duplicatePenalty,
      learningAdjustment,
      rumorCapped,
      rumorReason: rumorCheck.reason,
    },
  };
}

/**
 * Scores, clusters, and ranks a batch of topics with domain-balance decay, Vault duplicate
 * penalties, triage decision learning, anti-rumor capping, and controlled tie-breaking so
 * a 20-topic batch never clumps more than 3 items onto the same integer score.
 */
export function scoreAndRankTopicBatch<T extends InboxTopicLike>(
  items: T[],
  options?: {
    savedPosts?: SavedPostRecord[];
    triageDecisions?: TriageDecisionRecord[];
    isDuplicateFn?: (item: T) => boolean;
    nowMs?: number;
  }
): Array<T & { clusteredSources: ClusteredSourceItem[]; scoreBreakdown: TopicScoreBreakdown; viralityScore: number }> {
  const clustered = clusterSimilarTopics(items);
  const nowMs = options?.nowMs ?? Date.now();
  const decisions = options?.triageDecisions || [];

  // First pass: base score without batch order bias so highest-signal item per domain gets slot #0
  const prelim = clustered.map((item) => {
    const isDup = options?.isDuplicateFn ? options.isDuplicateFn(item) : false;
    const base = computeCalibratedTopicScore(item, {
      domainOccurrences: 0,
      sourceOccurrences: 0,
      isVaultDuplicate: isDup,
      triageDecisions: decisions,
      nowMs,
    });
    return { item, isDup, prelimFloat: base.exactFloatScore };
  });

  prelim.sort((a, b) => b.prelimFloat - a.prelimFloat);

  // Second pass: apply domain & source balance penalties sequentially
  const catCounts = new Map<string, number>();
  const srcCounts = new Map<string, number>();

  const scored = prelim.map(({ item, isDup }) => {
    const catKey = (item.domainCategory || 'DISTRIBUTED SYSTEMS').toUpperCase();
    const srcKey = extractDomainClean(item.url, item.sourceDomain || item.brandUrl);
    const catPrior = catCounts.get(catKey) || 0;
    const srcPrior = srcCounts.get(srcKey) || 0;
    catCounts.set(catKey, catPrior + 1);
    srcCounts.set(srcKey, srcPrior + 1);

    const res = computeCalibratedTopicScore(item, {
      domainOccurrences: catPrior,
      sourceOccurrences: srcPrior,
      isVaultDuplicate: isDup,
      triageDecisions: decisions,
      nowMs,
    });

    return {
      item: {
        ...item,
        sourceDomain: srcKey,
        freshnessTag: res.scoreBreakdown.freshnessTag,
        scoreBreakdown: res.scoreBreakdown,
        viralityScore: res.viralityScore,
        viralAngle: res.viralAngle,
        clientRelevanceReason: item.clientRelevanceReason || res.clientRelevanceReason,
        marrokAngle: item.marrokAngle || res.marrokAngle,
      },
      exactFloat: res.exactFloatScore,
    };
  });

  scored.sort((a, b) => b.exactFloat - a.exactFloat);

  // Enforce clean ranking spread: cap identical integer scores at max 2 per value (strictly <= 3)
  const scoreFreq = new Map<number, number>();
  for (const entry of scored) {
    let val = entry.item.scoreBreakdown.composite;
    while ((scoreFreq.get(val) || 0) >= 2 && val > 12) {
      val -= 1;
    }
    scoreFreq.set(val, (scoreFreq.get(val) || 0) + 1);
    entry.item.scoreBreakdown = {
      ...entry.item.scoreBreakdown,
      composite: val,
    };
    entry.item.viralityScore = val;
  }

  return scored.map((s) => s.item);
}

/**
 * Generates a concise, grounded 1-line "Why it fits Marrok" explanation strictly from source context.
 */
export function buildGroundedFitLine(item: {
  title: string;
  summary: string;
  extractedMetrics?: string[];
  domainCategory?: string;
  sourceDomain?: string;
}): { fitLine: string; reason: string } {
  const combined = sanitizeFeedDisplayText(`${item.title || ''} ${item.summary || ''}`, 1200).toLowerCase();
  const metric = item.extractedMetrics?.[0] ? sanitizeFeedDisplayText(item.extractedMetrics[0], 32) : '';
  const metricClause = metric ? ` (${metric})` : '';

  if (/\b(rust|nginx|proxy|cpu|memory|allocator|ebpf|io_uring|kernel)\b/.test(combined)) {
    return {
      fitLine: `Backend efficiency and lower compute overhead${metricClause} for lean engineering teams.`,
      reason: 'Directly helps backend teams cut CPU, memory, and infrastructure bills.',
    };
  }
  if (/\b(postgres|postgresql|redis|scylla|cassandra|sqlite|database|p99|sharding|storage)\b/.test(combined)) {
    return {
      fitLine: `Database latency and storage scaling trade-offs${metricClause} for production SaaS stacks.`,
      reason: 'Practical database architecture insight for teams managing growth and tail latency.',
    };
  }
  if (/\b(llm|kv[- ]?cache|inference|agent|deepseek|vllm|gpu|model|token|rag|mla)\b/.test(combined)) {
    return {
      fitLine: `AI inference cost and throughput architecture${metricClause} for product engineering teams.`,
      reason: 'Directly impacts AI feature latency, GPU memory usage, and unit economics.',
    };
  }
  if (/\b(zero[- ]?trust|mtls|cve-|sandbox|wireguard|nat|firewall|auth|security|encryption)\b/.test(combined)) {
    return {
      fitLine: `Network and tenant security mechanics${metricClause} for production cloud services.`,
      reason: 'Actionable security hardening for teams operating customer-facing APIs.',
    };
  }
  if (/\b(kubernetes|container|docker|serverless|microvm|wasm|cloud|failover|cluster)\b/.test(combined)) {
    return {
      fitLine: `Cloud orchestration and reliability patterns${metricClause} for small platform teams.`,
      reason: 'Concrete cloud reliability patterns without enterprise bloat.',
    };
  }

  const domainLabel = (item.domainCategory || 'systems engineering').toLowerCase();
  return {
    fitLine: `Practical ${domainLabel} trade-offs${metricClause} backed by ${item.sourceDomain || 'primary source'}.`,
    reason: `Relevant ${domainLabel} lessons for product engineers.`,
  };
}

/**
 * Generates a crisp 2-5 word proposed hook ending with a period, plus an Arabic RTL line.
 * Falls back to an explicit untitled state when the source lacks a clear hookable subject.
 */
export function buildProposedHook(topic: {
  title: string;
  summary?: string;
  extractedMetrics?: string[];
  domainCategory?: string;
}): {
  hookEn: string;
  hookAr: string;
  isUntitled: boolean;
  leadMetric?: string;
} {
  const cleanTitle = sanitizeFeedDisplayText(topic.title || '', 220);
  const cleanSummary = sanitizeFeedDisplayText(topic.summary || '', 800);
  const leadMetric = topic.extractedMetrics?.[0]
    ? sanitizeFeedDisplayText(topic.extractedMetrics[0], 24)
    : '';
  const compactMetric = leadMetric.match(/[$€£]?\d+(?:\.\d+)?\s*(?:%|x|ms|µs|s|gb|tb|mpps|k\+|t\+)?/i)?.[0]?.trim() || '';

  const words = cleanTitle
    .replace(/[^a-zA-Z0-9\s.+%-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (words.length < 2 || /^(untitled|test|link|post|update|news|article)$/i.test(cleanTitle.trim())) {
    return {
      hookEn: '',
      hookAr: '',
      isUntitled: true,
    };
  }

  const combined = `${cleanTitle} ${cleanSummary}`;
  const lower = combined.toLowerCase();

  // Detect primary tech entity for sharp 2-5 word hook
  const knownEntities: Array<[RegExp, string, string]> = [
    [/\bpingora\b/i, 'Pingora', 'Pingora'],
    [/\brust\b/i, 'Rust', 'Rust'],
    [/\bdeepseek\b/i, 'DeepSeek', 'DeepSeek'],
    [/\bmla\b/i, 'MLA', 'MLA'],
    [/\bdiscord\b/i, 'Discord', 'Discord'],
    [/\bscylladb\b/i, 'ScyllaDB', 'ScyllaDB'],
    [/\bpostgres(?:ql)?\b/i, 'Postgres', 'Postgres'],
    [/\bredis\b/i, 'Redis', 'Redis'],
    [/\bsqlite\b/i, 'SQLite', 'SQLite'],
    [/\bebpf\b/i, 'eBPF', 'eBPF'],
    [/\bio_uring\b/i, 'io_uring', 'io_uring'],
    [/\btailscale\b/i, 'Tailscale', 'Tailscale'],
    [/\bcloudflare\b/i, 'Cloudflare', 'Cloudflare'],
    [/\buber\b/i, 'Uber', 'Uber'],
    [/\bkubernetes|k8s\b/i, 'Kubernetes', 'Kubernetes'],
    [/\benvoy\b/i, 'Envoy', 'Envoy'],
    [/\bwireguard\b/i, 'WireGuard', 'WireGuard'],
    [/\bdocker\b/i, 'Docker', 'Docker'],
    [/\bnginx\b/i, 'NGINX', 'NGINX'],
    [/\blinux\b/i, 'Linux', 'Linux'],
    [/\bvllm\b/i, 'vLLM', 'vLLM'],
    [/\bkv[- ]?cache\b/i, 'KV cache', 'ذاكرة KV'],
  ];

  const matchedEntity = knownEntities.find(([re]) => re.test(combined));
  const entityEn = matchedEntity ? matchedEntity[1] : words.find((w) => w.length >= 3 && !TITLE_STOPWORDS.has(w.toLowerCase())) || words[0];
  const entityAr = matchedEntity ? matchedEntity[2] : entityEn;

  // Build specific 2-5 word hook anchored on action + metric
  let hookEn = '';
  let hookAr = '';

  if (/\bcpu\b/i.test(lower) && compactMetric) {
    hookEn = `${entityEn} cuts CPU by ${compactMetric}.`;
    hookAr = `كيف خفضت ${entityAr} استهلاك المعالج ${compactMetric}`;
  } else if (/\bkv[- ]?cache\b/i.test(lower) && compactMetric) {
    hookEn = `${entityEn} shrinks KV cache ${compactMetric}.`;
    hookAr = `ضغط ذاكرة KV بنسبة ${compactMetric} في ${entityAr}`;
  } else if (/\b(?:p99|latency)\b/i.test(lower) && /\b\d+(?:\.\d+)?\s*ms\b/i.test(combined)) {
    const msMatches = combined.match(/\b\d+(?:\.\d+)?\s*ms\b/gi) || [];
    const targetMs = msMatches.length >= 2 ? msMatches[1] : msMatches[0];
    hookEn = `${entityEn} drops latency to ${targetMs}.`;
    hookAr = `كيف خفضت ${entityAr} زمن الاستجابة إلى ${targetMs}`;
  } else if (/\b(memory|ram)\b/i.test(lower) && compactMetric) {
    hookEn = `${entityEn} cuts memory by ${compactMetric}.`;
    hookAr = `تقليص استهلاك الذاكرة بنسبة ${compactMetric} عبر ${entityAr}`;
  } else if (/\b(throughput|faster|speedup|boost)\b/i.test(lower) && compactMetric) {
    hookEn = `${entityEn} boosts speed ${compactMetric}.`;
    hookAr = `تسريع الأداء بمقدار ${compactMetric} مع ${entityAr}`;
  } else if (/\b(direct|p2p|tunnel|nat)\b/i.test(lower) && compactMetric) {
    hookEn = `${entityEn} reaches ${compactMetric} direct tunnels.`;
    hookAr = `تحقيق ${compactMetric} اتصالاً مباشراً عبر ${entityAr}`;
  } else if (/\b(availability|uptime|failover)\b/i.test(lower) && compactMetric) {
    hookEn = `${entityEn} hits ${compactMetric} uptime.`;
    hookAr = `تحقيق توافر ${compactMetric} في أنظمة ${entityAr}`;
  } else if (/\b(migrat|replac|ditch)\b/i.test(lower)) {
    const secondEntity = knownEntities.find(([re, name]) => name !== entityEn && re.test(combined));
    if (secondEntity) {
      hookEn = `${entityEn} replaces ${secondEntity[1]} at scale.`;
      hookAr = `لماذا استبدلت ${entityAr} نظام ${secondEntity[2]}`;
    } else {
      hookEn = `Why ${entityEn} rewrote its stack.`;
      hookAr = `لماذا أعادت ${entityAr} بناء بنيتها التقنية`;
    }
  } else if (compactMetric) {
    hookEn = `${entityEn} delivers ${compactMetric} gains.`;
    hookAr = `مكاسب أداء ${compactMetric} مع ${entityAr}`;
  } else {
    // Distill clean 3-5 words from title, ensuring it isn't a bare 2-word noun label
    const cleanedTokens = cleanTitle
      .replace(/^(?:how|why|show\s+hn|ask\s+hn|launch\s+hn)\s*[:-]?\s*/i, '')
      .replace(/[:|—–].*$/, '')
      .replace(/[^a-zA-Z0-9\s.+%-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    const core = cleanedTokens.slice(0, 5);
    if (core.length < 2) {
      return { hookEn: '', hookAr: '', isUntitled: true };
    }
    const rawPhrase = core.join(' ').replace(/[.!?]+$/, '');
    hookEn = `${rawPhrase.charAt(0).toUpperCase()}${rawPhrase.slice(1)}.`;
    hookAr = `ما يعنيه ${entityAr} لبنية أنظمتك`;
  }

  // Strictly enforce 2-5 words ending with a period
  const finalWords = hookEn.replace(/[.!?]+$/, '').trim().split(/\s+/).filter(Boolean);
  if (finalWords.length < 2) {
    return { hookEn: '', hookAr: '', isUntitled: true };
  }
  const bounded = finalWords.slice(0, 5).join(' ');
  const normalizedHookEn = `${bounded.replace(/[.,;:!?]+$/, '')}.`;

  return {
    hookEn: normalizedHookEn,
    hookAr: hookAr || `ما يعنيه ${entityAr} لخوادمك`,
    isUntitled: false,
    leadMetric: leadMetric || undefined,
  };
}

/**
 * Extracts quantitative metrics paired with verbatim source sentences so every number chip
 * displays its exact quote on hover/click and supports inline verification.
 */
export function extractMetricEvidenceChips(topic: {
  id: string;
  title: string;
  summary: string;
  url?: string;
  extractedMetrics?: string[];
}): MetricEvidenceItem[] {
  const safeUrl = sanitizeSafeHttpUrl(topic.url) || undefined;
  const cleanSummary = sanitizeFeedDisplayText(topic.summary || '', 2400);
  const cleanTitle = sanitizeFeedDisplayText(topic.title || '', 300);

  const sentences = `${cleanSummary}. ${cleanTitle}`
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);

  const rawMetrics = (topic.extractedMetrics || [])
    .map((m) => sanitizeFeedDisplayText(m, 48))
    .filter(Boolean)
    .slice(0, 4);

  return rawMetrics.map((label, idx) => {
    const numMatch = label.match(/[$€£]?\d+(?:\.\d+)?/);
    const numToken = numMatch ? numMatch[0].toLowerCase() : '';
    const lowerLabel = label.toLowerCase();

    const exactSentence =
      sentences.find((s) => s.toLowerCase().includes(lowerLabel)) ||
      (numToken
        ? sentences.find((s) => s.toLowerCase().includes(numToken))
        : undefined) ||
      sentences[0] ||
      cleanTitle;

    return {
      id: `${topic.id}_metric_${idx}`,
      label,
      sourceQuote: exactSentence.slice(0, 220),
      sourceUrl: safeUrl,
      verified: false,
    };
  });
}

/**
 * Returns true if the card relies on a single quantitative metric that has not been verified inline yet.
 */
export function isSingleMetricUnverified(metrics: MetricEvidenceItem[] = []): boolean {
  return metrics.length === 1 && !metrics[0].verified;
}

/**
 * Computes transparent risk signals (Original vs Repost, Claims status, Vault duplicate status).
 */
export function computeCandidateRiskSignals(
  topic: {
    title: string;
    summary: string;
    url?: string;
    sourceType?: string;
    sourceDomain?: string;
  },
  metrics: MetricEvidenceItem[],
  vaultMatch: { title?: string } | null
): CandidateRiskSignals {
  const original = isOriginalEngineeringSource(topic);
  const rumor = detectRumorOrUnsourcedClaim(topic);

  let claimsStatus: CandidateRiskSignals['claimsStatus'] = 'none';
  if (rumor.isRumorOrUnsourced) {
    claimsStatus = 'needs_review';
  } else if (metrics.length > 0) {
    claimsStatus = metrics.every((m) => m.verified) ? 'verified' : 'needs_review';
  } else {
    claimsStatus = 'verified';
  }

  return {
    origin: original ? 'original' : 'repost',
    originLabel: original ? 'Original' : 'Repost',
    claimsStatus,
    isRumorOrUnsourced: rumor.isRumorOrUnsourced,
    rumorReason: rumor.reason,
    duplicateStatus: vaultMatch ? 'duplicate' : 'none',
    matchedPostTitle: vaultMatch?.title,
  };
}

const DAILY_SLOT_HOURS: Array<{ hour: number; label: '10:00' | '12:00' | '18:00' }> = [
  { hour: 10, label: '10:00' },
  { hour: 12, label: '12:00' },
  { hour: 18, label: '18:00' },
];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Computes upcoming publishing calendar slots (10:00 / 12:00 / 18:00) against existing
 * scheduled Vault posts and identifies which slots are empty.
 */
export function computeUpcomingCalendarSlots(
  savedPosts: SavedPostRecord[],
  daysAhead = 7,
  nowDate: Date = new Date()
): SuggestedCalendarSlot[] {
  const occupiedKeys = new Set<string>();
  for (const post of savedPosts) {
    if (!post.scheduledFor || post.postStatus === 'posted') continue;
    const d = new Date(post.scheduledFor);
    if (Number.isNaN(d.getTime())) continue;
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    // Match nearest slot within +-90 minutes
    const totalMins = d.getHours() * 60 + d.getMinutes();
    for (const slot of DAILY_SLOT_HOURS) {
      if (Math.abs(totalMins - slot.hour * 60) <= 90) {
        occupiedKeys.add(`${dateKey}|${slot.label}`);
      }
    }
  }

  const slots: SuggestedCalendarSlot[] = [];
  const minThresholdMs = nowDate.getTime() + 30 * 60_000;

  for (let dayOffset = 0; dayOffset <= daysAhead; dayOffset++) {
    const dayDate = new Date(
      nowDate.getFullYear(),
      nowDate.getMonth(),
      nowDate.getDate() + dayOffset,
      0,
      0,
      0,
      0
    );
    const dateKey = `${dayDate.getFullYear()}-${dayDate.getMonth()}-${dayDate.getDate()}`;
    const dayLabel =
      dayOffset === 0
        ? 'Today'
        : dayOffset === 1
        ? 'Tomorrow'
        : WEEKDAY_SHORT[dayDate.getDay()];

    for (const slot of DAILY_SLOT_HOURS) {
      const slotDate = new Date(
        dayDate.getFullYear(),
        dayDate.getMonth(),
        dayDate.getDate(),
        slot.hour,
        0,
        0,
        0
      );
      if (slotDate.getTime() < minThresholdMs) continue;
      const isEmpty = !occupiedKeys.has(`${dateKey}|${slot.label}`);
      slots.push({
        iso: slotDate.toISOString(),
        dayLabel,
        timeLabel: slot.label,
        label: `${dayLabel} ${slot.label}${isEmpty ? ' (empty)' : ' (booked)'}`,
        isEmpty,
      });
    }
  }

  return slots;
}

/**
 * Picks a suggested empty slot for a card at `cardRankIndex` so editors see concrete calendar gaps.
 */
export function suggestCalendarSlotForCard(
  savedPosts: SavedPostRecord[],
  cardRankIndex: number,
  nowDate: Date = new Date()
): SuggestedCalendarSlot {
  const allSlots = computeUpcomingCalendarSlots(savedPosts, 10, nowDate);
  const emptySlots = allSlots.filter((s) => s.isEmpty);
  if (emptySlots.length > 0) {
    return emptySlots[cardRankIndex % emptySlots.length];
  }
  return (
    allSlots[cardRankIndex % Math.max(1, allSlots.length)] || {
      iso: new Date(nowDate.getTime() + 24 * 3600_000).toISOString(),
      dayLabel: 'Tomorrow',
      timeLabel: '10:00',
      label: 'Tomorrow 10:00 (empty)',
      isEmpty: true,
    }
  );
}

/**
 * Formats a concise human-friendly publication date (e.g. "Nov 19" or "2h ago").
 */
export function formatShortInboxDate(publishedAt?: string, nowMs = Date.now()): string {
  if (!publishedAt) return 'Recent';
  const parsed = Date.parse(publishedAt);
  if (!Number.isFinite(parsed)) return 'Recent';
  const diffHours = Math.max(0, (nowMs - parsed) / 3600_000);
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${Math.round(diffHours)}h ago`;
  return new Date(parsed).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
