import { describe, it, expect } from 'vitest';
import {
  analyzePostHistoryCadence,
  detectTopicAffinity,
  getSmartNextPalette,
  normalizeThemeId,
} from './cadenceEngine.ts';
import type { SavedPostRecord } from '../../types.ts';

function createMockPost(
  id: string,
  theme: string,
  dateIso: string,
  postStatus: 'posted' | 'validated' = 'posted',
  title = 'Test Post'
): SavedPostRecord {
  return {
    id,
    title,
    category: 'SYSTEM DESIGN',
    postStatus,
    createdAt: dateIso,
    updatedAt: dateIso,
    postedAt: postStatus === 'posted' ? dateIso : undefined,
    creatorHandle: '@MARROK',
    slideCount: 8,
    qaPassed: true,
    deck: {
      id,
      theme,
      category: 'SYSTEM DESIGN',
      caption: 'Test caption',
      slides: [
        {
          type: 'hub',
          enTitle: title,
          arTitle: 'عنوان تجريبي',
          enBody: 'English test body',
          arBody: 'نص تجريبي عربي',
        },
      ],
    },
  };
}

describe('cadenceEngine', () => {
  it('handles empty post history safely with valid default', () => {
    const analysis = analyzePostHistoryCadence([]);
    expect(analysis.recommendedThemeId).toBeDefined();
    expect(analysis.recommendedPalette).toBeDefined();
    expect(analysis.recentCadence).toEqual([]);
    expect(analysis.lastPostedThemeId).toBeNull();
  });

  it('strictly prevents consecutive duplicate color posts', () => {
    const posts: SavedPostRecord[] = [
      createMockPost('p1', 'teal', '2026-11-03T10:00:00Z', 'posted', 'Recent Post 1'),
      createMockPost('p2', 'amber', '2026-11-02T10:00:00Z', 'posted', 'Recent Post 2'),
    ];

    const analysis = analyzePostHistoryCadence(posts);
    expect(analysis.lastPostedThemeId).toBe('teal');
    // Recommended theme MUST NOT be teal
    expect(analysis.recommendedThemeId).not.toBe('teal');
  });

  it('resolves topic-color conflict by picking harmonious alternative when topic matches last posted theme', () => {
    // Last posted post was violet (AI)
    const posts: SavedPostRecord[] = [
      createMockPost('p1', 'violet', '2026-11-03T10:00:00Z', 'posted', 'LLM Agent Architectures'),
    ];

    // New post is also about AI / LLM
    const topicContext = {
      prompt: 'In-depth analysis of DeepSeek and OpenAI Mixture of Experts LLM inference latency',
      category: 'AI AGENTS & MODELS',
    };

    const analysis = analyzePostHistoryCadence(posts, 'violet', topicContext);

    // Primary preference for this topic is violet
    expect(analysis.topicMatch?.preferredThemeId).toBe('violet');
    // But violet was just posted, so conflict resolution must be triggered!
    expect(analysis.topicMatch?.wasHarmonized).toBe(true);
    expect(analysis.recommendedThemeId).not.toBe('violet');
    // Should choose one of the harmonious alternatives (e.g. teal or blueprint)
    expect(['teal', 'blueprint', 'amber']).toContain(analysis.recommendedThemeId);
    expect(analysis.reason).toContain('Avoids consecutive Electric');
  });

  it('selects topic primary palette when there is no conflict with recent history', () => {
    // Last posted post was blueprint (Cloud)
    const posts: SavedPostRecord[] = [
      createMockPost('p1', 'blueprint', '2026-11-03T10:00:00Z', 'posted', 'Kubernetes Mesh'),
    ];

    // New post is about Security / CVE
    const topicContext = {
      prompt: 'Kernel exploit analysis: eBPF zero-day vulnerability in Linux memory subsystem',
      category: 'REVERSE ENGINEERING',
    };

    const analysis = analyzePostHistoryCadence(posts, 'blueprint', topicContext);
    expect(analysis.topicMatch?.preferredThemeId).toBe('cyber');
    expect(analysis.topicMatch?.wasHarmonized).toBe(false);
    expect(analysis.recommendedThemeId).toBe('cyber');
  });

  it('fallbacks to drafts/all saved posts when no post is marked as posted yet', () => {
    const posts: SavedPostRecord[] = [
      createMockPost('p1', 'cyber', '2026-11-03T10:00:00Z', 'validated', 'Draft Post 1'),
    ];

    const analysis = analyzePostHistoryCadence(posts);
    expect(analysis.lastPostedThemeId).toBe('cyber');
    expect(analysis.recommendedThemeId).not.toBe('cyber');
  });

  it('normalizes legacy and mixed-case theme keys correctly', () => {
    expect(normalizeThemeId('TEAL')).toBe('teal');
    expect(normalizeThemeId('cyber')).toBe('cyber');
    expect(normalizeThemeId('security')).toBe('teal');
    expect(normalizeThemeId('unknown-random')).toBe('teal');
  });

  it('detects topic affinity across various engineering domains', () => {
    expect(detectTopicAffinity('Ghidra decompiler vulnerability')?.preferredThemeId).toBe('cyber');
    expect(detectTopicAffinity('Transformer token generation and MoE routing')?.preferredThemeId).toBe('violet');
    expect(detectTopicAffinity('Distributed Redis 8 cluster latency')?.preferredThemeId).toBe('blueprint');
    expect(detectTopicAffinity('Nvidia H100 GPU valuation and $20B capex deficit')?.preferredThemeId).toBe('amber');
    expect(detectTopicAffinity('Linux kernel POSIX syscall scheduler')?.preferredThemeId).toBe('monochrome');
  });

  it('getSmartNextPalette returns a valid ThemePalette object', () => {
    const posts: SavedPostRecord[] = [
      createMockPost('p1', 'amber', '2026-11-03T10:00:00Z', 'posted', 'Post 1'),
    ];
    const palette = getSmartNextPalette(posts, 'amber');
    expect(palette).toBeDefined();
    expect(palette.id).not.toBe('amber');
    expect(palette.accent).toBeDefined();
    expect(palette.baseBg).toBeDefined();
  });

  it('auto-promotes due scheduled posts (scheduledFor <= now) for feed color cadence while ignoring future unposted schedules', () => {
    const pastIso = new Date(Date.now() - 2 * 3600_000).toISOString();
    const olderPostedIso = new Date(Date.now() - 24 * 3600_000).toISOString();
    const futureIso = new Date(Date.now() + 24 * 3600_000).toISOString();

    const dueScheduledPost: SavedPostRecord = {
      ...createMockPost('p_due', 'violet', olderPostedIso, 'validated', 'Due Scheduled Post'),
      scheduledFor: pastIso,
      postedAt: undefined,
    };
    const olderPosted: SavedPostRecord = createMockPost(
      'p_older',
      'teal',
      olderPostedIso,
      'posted',
      'Older Posted'
    );
    const futureDraft: SavedPostRecord = {
      ...createMockPost('p_future', 'amber', olderPostedIso, 'validated', 'Future Scheduled Post'),
      scheduledFor: futureIso,
      postedAt: undefined,
    };

    const analysis = analyzePostHistoryCadence([olderPosted, dueScheduledPost, futureDraft]);
    // Due scheduled post ('violet') is the most recent effectively published post, while futureDraft ('amber') is ignored
    expect(analysis.lastPostedThemeId).toBe('violet');
    expect(analysis.recommendedThemeId).not.toBe('violet');
    expect(analysis.recentCadence.map((c) => c.id)).toEqual(['p_due', 'p_older']);
    expect(analysis.recentCadence[0].isPosted).toBe(true);
  });
});

