import type { SavedPostRecord, ThemePalette } from '../../types.ts';
import { BASE_PALETTES, DEFAULT_PALETTES } from './palettes.ts';

export interface CadencePostSummary {
  id: string;
  title: string;
  themeId: string;
  themeName: string;
  accentColor: string;
  dateStr: string;
  isPosted: boolean;
}

export interface TopicAffinityResult {
  topic: string;
  preferredThemeId: string;
  harmonies: string[];
}

export interface ThemeCadenceAnalysis {
  recentCadence: CadencePostSummary[];
  recommendedThemeId: string;
  recommendedPalette: ThemePalette;
  reason: string;
  topicMatch?: {
    detectedTopic: string;
    preferredThemeId: string;
    wasHarmonized: boolean;
    harmonyNote?: string;
  };
  lastPostedThemeId: string | null;
  paletteStats: Record<string, { count: number; lastUsedIndex: number | null }>;
}

export const CADENCE_CORE_PALETTES: string[] = [
  'teal',
  'cyber',
  'violet',
  'blueprint',
  'amber',
  'monochrome',
  'emerald',
];

/**
 * Topic mapping rules:
 * Defines primary theme affinity and ordered harmonious fallbacks
 * when the primary theme would create consecutive duplicate colors.
 */
interface TopicPattern {
  name: string;
  primary: string;
  harmonies: string[];
  regex: RegExp;
}

const TOPIC_PATTERNS: TopicPattern[] = [
  {
    name: 'Security & Reversing',
    primary: 'cyber',
    harmonies: ['violet', 'amber', 'teal'],
    regex: /\b(cve|vulnerability|exploit|zero-day|reverse engineering|malware|sandbox|threat|kernel exploit|ebpf bypass|decompil|ghidra|ida pro|privilege escalation)\b/i,
  },
  {
    name: 'AI & Inference Architecture',
    primary: 'violet',
    harmonies: ['teal', 'blueprint', 'amber'],
    regex: /\b(ai|llm|agent|gpt|claude|gemini|transformer|inference|neural|deep learning|tokens?|model weights|quantization|mixture of experts|moe|reasoning|prompt)\b/i,
  },
  {
    name: 'Distributed Systems & Cloud',
    primary: 'blueprint',
    harmonies: ['teal', 'amber', 'emerald'],
    regex: /\b(cloud|distributed|microservice|kubernetes|docker|cluster|mesh|vcs|git|scion|database|caching|redis|postgres|latency|throughput|network|scale|aws|gcp)\b/i,
  },
  {
    name: 'Economics & Hardware Benchmarks',
    primary: 'amber',
    harmonies: ['cyber', 'teal', 'blueprint'],
    regex: /\b(cost|valuation|loss|revenue|deficit|spending|subsid|capex|gpu|tpu|h100|b200|nvidia|chips?|power grid|gigawatt|retirees|taxpayer|financial|funding|burn rate)\b/i,
  },
  {
    name: 'Low-Level Systems & Linux',
    primary: 'monochrome',
    harmonies: ['emerald', 'teal', 'blueprint'],
    regex: /\b(linux|kernel|ebpf|v8 isolate|microvm|assembly|c\+\+|memory safety|paging|allocator|syscall|posix|terminal)\b/i,
  },
];

/**
 * Detect topic affinity from prompt notes or category
 */
export function detectTopicAffinity(
  prompt?: string,
  category?: string
): TopicAffinityResult | null {
  const combined = `${category || ''} ${prompt || ''}`.trim();
  if (!combined) return null;

  // Category hint explicit matching
  const catUpper = (category || '').toUpperCase();
  if (catUpper.includes('REVERSE') || catUpper.includes('SECURITY')) {
    return { topic: 'Security & Reversing', preferredThemeId: 'cyber', harmonies: ['violet', 'amber', 'teal'] };
  }
  if (catUpper.includes('AI') || catUpper.includes('MODEL') || catUpper.includes('AGENT')) {
    return { topic: 'AI & Inference Architecture', preferredThemeId: 'violet', harmonies: ['teal', 'blueprint', 'amber'] };
  }
  if (catUpper.includes('CLOUD') || catUpper.includes('INFRASTRUCTURE') || catUpper.includes('SYSTEM')) {
    return { topic: 'Distributed Systems & Cloud', preferredThemeId: 'blueprint', harmonies: ['teal', 'amber', 'emerald'] };
  }
  if (catUpper.includes('FINANCE') || catUpper.includes('HARDWARE') || catUpper.includes('ECONOM')) {
    return { topic: 'Economics & Hardware Benchmarks', preferredThemeId: 'amber', harmonies: ['cyber', 'teal', 'blueprint'] };
  }
  if (catUpper.includes('KERNEL') || catUpper.includes('LINUX')) {
    return { topic: 'Low-Level Systems & Linux', preferredThemeId: 'monochrome', harmonies: ['emerald', 'teal', 'blueprint'] };
  }

  // Regex pattern matching on text content
  for (const pattern of TOPIC_PATTERNS) {
    if (pattern.regex.test(combined)) {
      return {
        topic: pattern.name,
        preferredThemeId: pattern.primary,
        harmonies: pattern.harmonies,
      };
    }
  }

  return null;
}

/**
 * Formats timestamps into scannable dates (e.g. "Today", "Yesterday", or "Oct 24")
 */
function formatDateLabel(isoString?: string): string {
  if (!isoString) return 'Draft';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Draft';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 24 && now.getDate() === date.getDate()) {
      return 'Today';
    }
    if (diffHours < 48) {
      return 'Yesterday';
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'Recent';
  }
}

/**
 * Normalizes theme key to valid registered palette ID
 */
export function normalizeThemeId(themeKey?: string): string {
  if (!themeKey) return 'teal';
  const clean = themeKey.trim().toLowerCase();
  if (DEFAULT_PALETTES[clean]) {
    return DEFAULT_PALETTES[clean].id;
  }
  return 'teal';
}

/**
 * Determines whether a post is effectively published (either explicitly marked 'posted'
 * or scheduled with a `scheduledFor` timestamp that has already passed).
 */
export function isPostPublishedOrDue(post: SavedPostRecord, nowMs: number = Date.now()): boolean {
  if (post.postStatus === 'posted') return true;
  if (post.scheduledFor) {
    const scheduledMs = Date.parse(post.scheduledFor);
    if (Number.isFinite(scheduledMs) && scheduledMs <= nowMs) {
      return true;
    }
  }
  return false;
}

/**
 * Core Feed Cadence Analyzer:
 * Evaluates chronological post history, applies recency decay, enforces strict
 * consecutive duplicate prevention, and resolves topic-color conflicts using harmonious alternatives.
 */
export function analyzePostHistoryCadence(
  posts: SavedPostRecord[] = [],
  activeThemeId?: string,
  topicContext?: { prompt?: string; category?: string }
): ThemeCadenceAnalysis {
  const nowMs = Date.now();
  // 1. Filter posts: Prefer 'posted' or due scheduled posts; fallback to all saved posts if none are posted yet
  const postedOnly = posts.filter((p) => isPostPublishedOrDue(p, nowMs));
  const sourcePosts = postedOnly.length > 0 ? postedOnly : posts;

  // 2. Sort descending chronologically
  const sortedPosts = [...sourcePosts].sort((a, b) => {
    const timeA = new Date(a.postedAt || a.scheduledFor || a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.postedAt || b.scheduledFor || b.updatedAt || b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  // 3. Build recent cadence summaries (up to 6)
  const recentCadence: CadencePostSummary[] = sortedPosts.slice(0, 6).map((p) => {
    const rawTheme = p.deck?.theme || 'teal';
    const normId = normalizeThemeId(rawTheme);
    const palette = DEFAULT_PALETTES[normId] || BASE_PALETTES.teal;
    const effectiveDate = p.postedAt || p.scheduledFor || p.updatedAt || p.createdAt;
    return {
      id: p.id,
      title: p.title || p.deck?.slides?.[0]?.enTitle || 'Untitled Post',
      themeId: palette.id,
      themeName: palette.name.split(' ')[0],
      accentColor: palette.accent,
      dateStr: formatDateLabel(effectiveDate),
      isPosted: isPostPublishedOrDue(p, nowMs),
    };
  });

  const lastPostedThemeId = recentCadence.length > 0 ? recentCadence[0].themeId : null;

  // 4. Compute usage counts and last-used index across candidate palettes
  const paletteStats: Record<string, { count: number; lastUsedIndex: number | null }> = {};
  for (const pid of CADENCE_CORE_PALETTES) {
    paletteStats[pid] = { count: 0, lastUsedIndex: null };
  }

  recentCadence.forEach((entry, idx) => {
    if (paletteStats[entry.themeId]) {
      paletteStats[entry.themeId].count += 1;
      if (paletteStats[entry.themeId].lastUsedIndex === null) {
        paletteStats[entry.themeId].lastUsedIndex = idx;
      }
    }
  });

  // 5. Detect Topic Affinity if context is provided
  const affinity = detectTopicAffinity(topicContext?.prompt, topicContext?.category);

  // 6. Cadence Scoring for each core palette
  // Higher score = better candidate
  const scores: Record<string, number> = {};
  for (const pid of CADENCE_CORE_PALETTES) {
    scores[pid] = 100; // Base score
  }

  // Recency penalties
  const RECENCY_PENALTIES = [120, 60, 30, 15, 8, 4];
  recentCadence.forEach((entry, idx) => {
    const penalty = RECENCY_PENALTIES[idx] ?? 2;
    if (scores[entry.themeId] !== undefined) {
      scores[entry.themeId] -= penalty;
    }
  });

  // Frequency penalty (reduces dominance of a frequently chosen theme in recent history)
  for (const pid of CADENCE_CORE_PALETTES) {
    scores[pid] -= paletteStats[pid].count * 25;
  }

  // CRITICAL CONSTRAINT: Strict consecutive duplicate prevention
  // If a theme was the immediately preceding post, give it an insurmountable penalty
  if (lastPostedThemeId && scores[lastPostedThemeId] !== undefined) {
    scores[lastPostedThemeId] = -9999;
  }

  // Topic Affinity and Harmonic Conflict Resolution
  let topicMatchInfo: ThemeCadenceAnalysis['topicMatch'];
  if (affinity) {
    const { topic, preferredThemeId, harmonies } = affinity;

    // Check if primary topic conflicts with last posted theme
    if (lastPostedThemeId === preferredThemeId) {
      // Find the first harmonious palette that is NOT the last posted theme
      const harmonyCandidate = harmonies.find((h) => h !== lastPostedThemeId) || 'teal';
      scores[harmonyCandidate] += 80;

      const primaryName = (DEFAULT_PALETTES[preferredThemeId] || BASE_PALETTES.teal).name.split(' ')[0];
      const harmonyName = (DEFAULT_PALETTES[harmonyCandidate] || BASE_PALETTES.teal).name.split(' ')[0];

      topicMatchInfo = {
        detectedTopic: topic,
        preferredThemeId,
        wasHarmonized: true,
        harmonyNote: `Avoids consecutive ${primaryName}. Selected harmonious ${harmonyName} for ${topic}.`,
      };
    } else {
      // Primary matches without conflict
      scores[preferredThemeId] += 90;
      // Also give gentle boost to its harmonies
      harmonies.forEach((h, hIdx) => {
        if (scores[h] !== undefined && h !== lastPostedThemeId) {
          scores[h] += Math.max(10, 30 - hIdx * 10);
        }
      });

      topicMatchInfo = {
        detectedTopic: topic,
        preferredThemeId,
        wasHarmonized: false,
      };
    }
  }

  // 7. Pick highest-scoring candidate
  let bestThemeId = CADENCE_CORE_PALETTES[0];
  let highestScore = -Infinity;

  for (const pid of CADENCE_CORE_PALETTES) {
    if (scores[pid] > highestScore) {
      highestScore = scores[pid];
      bestThemeId = pid;
    }
  }

  // Fallback sanity check: If bestThemeId equals lastPostedThemeId, force alternate
  if (bestThemeId === lastPostedThemeId) {
    const alternative = CADENCE_CORE_PALETTES.find((p) => p !== lastPostedThemeId) || 'teal';
    bestThemeId = alternative;
  }

  const recommendedPalette = DEFAULT_PALETTES[bestThemeId] || BASE_PALETTES.teal;
  const recommendedName = recommendedPalette.name.split(' ')[0];

  // 8. Construct intuitive human-readable reason
  let reason = '';
  if (topicMatchInfo?.wasHarmonized) {
    reason = topicMatchInfo.harmonyNote || `Harmonious ${recommendedName} selected to avoid repeating last post.`;
  } else if (topicMatchInfo && topicMatchInfo.preferredThemeId === bestThemeId) {
    reason = `Matched topic (${topicMatchInfo.detectedTopic}) with fresh cadence.`;
  } else if (lastPostedThemeId) {
    const lastPalette = DEFAULT_PALETTES[lastPostedThemeId] || BASE_PALETTES.teal;
    const lastName = lastPalette.name.split(' ')[0];
    const distance = paletteStats[bestThemeId]?.lastUsedIndex;
    if (distance === null || distance === undefined) {
      reason = `Rotated from ${lastName}: ${recommendedName} has not been posted recently.`;
    } else {
      reason = `Rotated from ${lastName}: creates visual contrast on your social grid.`;
    }
  } else {
    reason = `Recommended base palette for fresh feed presentation.`;
  }

  return {
    recentCadence,
    recommendedThemeId: bestThemeId,
    recommendedPalette,
    reason,
    topicMatch: topicMatchInfo,
    lastPostedThemeId,
    paletteStats,
  };
}

/**
 * Quick helper to get recommended next palette
 */
export function getSmartNextPalette(
  posts: SavedPostRecord[] = [],
  currentThemeId?: string,
  topicContext?: { prompt?: string; category?: string }
): ThemePalette {
  const analysis = analyzePostHistoryCadence(posts, currentThemeId, topicContext);
  return analysis.recommendedPalette;
}
