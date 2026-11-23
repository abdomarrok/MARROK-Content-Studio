import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Request, Response } from 'express';
import {
  buildGroundedFitLine,
  buildTriageSignaturePayload,
  isTopicDismissedByTriage,
  parseTriageSignature,
  scoreAndRankTopicBatch,
  type InboxTopicLike,
} from '../lib/gather/inboxEngine.ts';
import {
  clearLocalTriageDecisions,
  fetchTriageDecisions,
  generateGatheredCandidatesInBackground,
  getLocalTriageDecisions,
  logTriageDecision,
  undoTriageDecision,
  type GatheredTopicItem,
} from '../lib/gather/gatherClient.ts';
import {
  CURATED_ENGINEERING_TOPICS,
  handleGetTopicRadar,
  resetRadarCacheForTest,
} from '../../api/controllers/mediaController.ts';
import { WeeklyProgramReviewPanel } from '../components/studio/WeeklyProgramReviewPanel.tsx';
import { DEFAULT_PALETTES, type TriageDecisionRecord } from '../types.ts';

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function makeTopic(overrides: Partial<GatheredTopicItem> & { id: string }): GatheredTopicItem {
  return {
    id: overrides.id,
    title: overrides.title || 'Zero-copy Linux io_uring proxy halves p99 latency',
    url: overrides.url || `https://eng-${overrides.id}.example.dev/article`,
    sourceName: overrides.sourceName || 'Hacker News',
    sourceDomain: overrides.sourceDomain,
    sourceType: overrides.sourceType || 'hn',
    author: overrides.author || 'Systems Team',
    brand: overrides.brand || 'Engineering',
    brandUrl: overrides.brandUrl || `eng-${overrides.id}.example.dev`,
    domainCategory: overrides.domainCategory || 'DISTRIBUTED SYSTEMS',
    publishedAt: overrides.publishedAt || new Date(Date.now() - 2 * 3600_000).toISOString(),
    score: overrides.score ?? 260,
    summary:
      overrides.summary ||
      'Benchmarks showing how io_uring registered buffers cut p99 proxy latency by 48% under 100k RPS load.',
    extractedMetrics: overrides.extractedMetrics ?? ['48% latency drop', '100k RPS'],
    recommendedFormat: overrides.recommendedFormat || 'carousel',
    synthesisPrompt: overrides.synthesisPrompt || 'Technical Topic: io_uring proxy',
    clusteredSources: overrides.clusteredSources,
  };
}

describe('Content Inbox — Live Freshness & Permanent Cross-Feed Dismissal', () => {
  beforeEach(() => {
    localStorage.clear();
    clearLocalTriageDecisions();
    resetRadarCacheForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('1. Zero Hardcoded Classics in Live Topic Radar', () => {
    it('returns empty topics with honest warning (zero hardcoded classics) when all live feeds fail', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('Upstream network unreachable');
        })
      );

      const req = { query: { refresh: 'true' } } as unknown as Request;
      const res = createMockRes();
      await handleGetTopicRadar(req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      const body = res.body as {
        ok: boolean;
        topics: GatheredTopicItem[];
        warning?: string;
        feedStatuses?: Array<{ status: string }>;
      };
      expect(body.ok).toBe(true);
      expect(body.topics).toEqual([]);
      expect(body.warning).toBeTruthy();

      const curatedIds = new Set(CURATED_ENGINEERING_TOPICS.map((t) => t.id));
      expect(body.topics.some((t) => curatedIds.has(t.id))).toBe(false);
    });
  });

  describe('2. Permanent Cross-Feed Dismissal Matching (ID, Canonical URL, Clustered URL, Title)', () => {
    it('hides the same story arriving from another feed via canonical URL (stripping utm params and www)', () => {
      const skippedDecision: TriageDecisionRecord = {
        id: 'td_1',
        topicId: 'hn_99881',
        topicSignature: buildTriageSignaturePayload(
          'How Oxide built a bare-metal rack control plane in Rust',
          'https://www.oxide.computer/blog/rack-control-plane/?utm_source=hn&ref=top'
        ),
        canonicalUrl: 'oxide.computer/blog/rack-control-plane',
        sourceDomain: 'oxide.computer',
        domainCategory: 'DISTRIBUTED SYSTEMS',
        action: 'skip',
        reason: 'off-topic',
        createdAt: new Date().toISOString(),
      };

      const lobstersCopy = makeTopic({
        id: 'lobsters_55123',
        sourceName: 'Lobste.rs',
        sourceType: 'lobsters',
        title: 'Oxide Rack Control Plane Architecture',
        url: 'https://oxide.computer/blog/rack-control-plane?utm_medium=rss',
      });

      expect(isTopicDismissedByTriage(lobstersCopy, [skippedDecision])).toBe(true);
    });

    it('hides a story across feeds by normalized title overlap (>= 70%) even with a different URL', () => {
      const skippedDecision: TriageDecisionRecord = {
        id: 'td_2',
        topicId: 'reddit_abc',
        topicSignature: 'Cloudflare replaces legacy NGINX ingress with Pingora Rust proxy',
        sourceDomain: 'reddit.com',
        domainCategory: 'KUBERNETES & CLOUD',
        action: 'skip',
        reason: 'already-covered',
        createdAt: new Date().toISOString(),
      };

      const hnDiscussionCopy = makeTopic({
        id: 'hn_77112',
        sourceName: 'Hacker News',
        sourceType: 'hn',
        title: 'Cloudflare replaces legacy NGINX ingress with Pingora Rust proxy (blog)',
        url: 'https://news.ycombinator.com/item?id=77112',
      });

      expect(isTopicDismissedByTriage(hnDiscussionCopy, [skippedDecision])).toBe(true);
    });

    it('hides a story when any clustered alternate source URL matches a skipped decision', () => {
      const skippedDecision: TriageDecisionRecord = {
        id: 'td_3',
        topicId: 'rss_11',
        topicSignature: 'Inside TigerBeetle deterministic simulation testing',
        canonicalUrl: 'tigerbeetle.com/blog/deterministic-simulation',
        sourceDomain: 'tigerbeetle.com',
        domainCategory: 'DISTRIBUTED SYSTEMS',
        action: 'skip',
        reason: 'too-basic',
        createdAt: new Date().toISOString(),
      };

      const clusteredTopic = makeTopic({
        id: 'hn_442',
        title: 'Deterministic simulation testing for financial ledgers',
        url: 'https://news.ycombinator.com/item?id=442',
        clusteredSources: [
          {
            sourceName: 'TigerBeetle Blog',
            sourceType: 'rss',
            domain: 'tigerbeetle.com',
            url: 'https://tigerbeetle.com/blog/deterministic-simulation/?src=hn',
            title: 'Inside TigerBeetle deterministic simulation testing',
          },
        ],
      });

      expect(isTopicDismissedByTriage(clusteredTopic, [skippedDecision])).toBe(true);
    });

    it('respects snooze expiration (active snooze hides; expired snooze resurfaces)', () => {
      const nowMs = Date.now();
      const topic = makeTopic({
        id: 'hn_snooze_1',
        title: 'eBPF XDP packet filtering at 40Mpps',
        url: 'https://cilium.io/blog/ebpf-xdp-40mpps',
      });

      const activeSnooze: TriageDecisionRecord = {
        id: 'td_snooze_active',
        topicId: topic.id,
        topicSignature: topic.title,
        canonicalUrl: 'cilium.io/blog/ebpf-xdp-40mpps',
        sourceDomain: 'cilium.io',
        domainCategory: 'LINUX KERNEL',
        action: 'snooze',
        snoozeUntil: new Date(nowMs + 3600_000).toISOString(),
        createdAt: new Date(nowMs - 60_000).toISOString(),
      };

      const expiredSnooze: TriageDecisionRecord = {
        ...activeSnooze,
        id: 'td_snooze_expired',
        snoozeUntil: new Date(nowMs - 60_000).toISOString(),
      };

      expect(isTopicDismissedByTriage(topic, [activeSnooze], nowMs)).toBe(true);
      expect(isTopicDismissedByTriage(topic, [expiredSnooze], nowMs)).toBe(false);
    });
  });

  describe('3. Offline Merge-and-Sync Resilience (Never Wipe Local Skips)', () => {
    it('preserves local pendingSync skip when POST fails and subsequent GET returns []', async () => {
      let postAttempts = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          const method = (init?.method || 'GET').toUpperCase();
          if (url.includes('/api/gather/triage') && method === 'POST') {
            postAttempts += 1;
            if (postAttempts === 1) {
              return new Response(JSON.stringify({ error: 'DB offline' }), { status: 503 });
            }
            const parsedBody = JSON.parse(String(init?.body || '{}'));
            return new Response(
              JSON.stringify({
                ok: true,
                decision: {
                  id: 'srv_confirmed_1',
                  ...parsedBody,
                  createdAt: new Date().toISOString(),
                },
              }),
              { status: 201 }
            );
          }
          if (url.includes('/api/gather/triage') && method === 'GET') {
            return new Response(JSON.stringify({ ok: true, decisions: [] }), { status: 200 });
          }
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        })
      );

      const skipped = await logTriageDecision({
        topicId: 'hn_offline_1',
        topicSignature: 'Postgres vacuum freeze tuning guide',
        canonicalUrl: 'https://postgres.example.dev/vacuum-freeze',
        sourceDomain: 'postgres.example.dev',
        domainCategory: 'DISTRIBUTED SYSTEMS',
        action: 'skip',
        reason: 'off-topic',
      });

      expect(skipped.pendingSync).toBe(true);
      expect(getLocalTriageDecisions()).toHaveLength(1);

      // Server returns empty [] (e.g. cold /tmp or reconnect): local skip must NOT be wiped
      const merged = await fetchTriageDecisions();
      expect(merged.some((d) => d.topicId === 'hn_offline_1')).toBe(true);

      // Background retry should have flushed the pending POST
      await waitFor(() => {
        expect(postAttempts).toBe(2);
      });

      // Candidate generator must keep the cross-feed copy hidden
      const candidates = await generateGatheredCandidatesInBackground(
        [
          makeTopic({
            id: 'reddit_copy_1',
            title: 'Postgres vacuum freeze tuning guide',
            url: 'https://postgres.example.dev/vacuum-freeze?utm_source=reddit',
          }),
        ],
        [],
        { triageDecisions: merged }
      );
      expect(candidates).toHaveLength(0);

      // Restoring/undoing removes it cleanly
      const currentId = getLocalTriageDecisions()[0]?.id || skipped.id;
      await undoTriageDecision(currentId);
      expect(getLocalTriageDecisions()).toHaveLength(0);
    });
  });

  describe('4. Story-Specific Fit Lines & Domain Diversity / Rotation', () => {
    it('classifies DeepSeek KV-cache as AI inference (not database) and varies angle across stories', () => {
      const aiFit = buildGroundedFitLine({
        title: 'DeepSeek MLA shrinks KV cache 93.3% at 5.76x throughput',
        summary: 'Multi-Head Latent Attention reduces inference GPU VRAM and token latency.',
        extractedMetrics: ['93.3% KV cache', '5.76x throughput'],
        domainCategory: 'AI AGENTS & MODELS',
        sourceDomain: 'arxiv.org',
      });

      const dbFit = buildGroundedFitLine({
        title: 'Discord moves trillions of messages to ScyllaDB cutting p99 to 15ms',
        summary: 'Replacing 177 Cassandra nodes with 72 ScyllaDB nodes removed GC pauses.',
        extractedMetrics: ['177 to 72 nodes', '15ms p99'],
        domainCategory: 'DISTRIBUTED SYSTEMS',
        sourceDomain: 'discord.com',
      });

      expect(aiFit.fitLine.toLowerCase()).not.toContain('database');
      expect(aiFit.fitLine.toLowerCase()).toMatch(/inference|gpu|kv|vram|ai/);
      expect(aiFit.fitLine).not.toEqual(dbFit.fitLine);
    });

    it('enforces maxPerDomainInTop diversity cap so one domain cannot dominate top slots', () => {
      const now = Date.now();
      const batch: InboxTopicLike[] = [
        ...Array.from({ length: 7 }, (_, i) => ({
          id: `gh_${i}`,
          title: `GitHub breakout tool number ${i} for distributed tracing benchmarks`,
          url: `https://github.com/org-${i}/repo-${i}`,
          sourceName: 'GitHub Trending',
          sourceType: 'github' as const,
          sourceDomain: 'github.com',
          domainCategory: 'DISTRIBUTED SYSTEMS',
          publishedAt: new Date(now - (i + 1) * 3600_000).toISOString(),
          score: 800 - i * 10,
          summary: `Rust observability engine #${i} cuts latency by ${40 + i}% in production.`,
          extractedMetrics: [`${40 + i}% latency`],
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `blog_${i}`,
          title: `Cloud engineering deep dive ${i} on kernel scheduling`,
          url: `https://blog-${i}.systems.dev/post-${i}`,
          sourceName: `Blog ${i}`,
          sourceType: 'rss' as const,
          sourceDomain: `blog-${i}.systems.dev`,
          domainCategory: 'LINUX KERNEL',
          publishedAt: new Date(now - (i + 2) * 3600_000).toISOString(),
          score: 300 - i * 10,
          summary: `Kernel scheduler analysis #${i} improves tail latency by ${25 + i}%.`,
          extractedMetrics: [`${25 + i}% tail latency`],
        })),
      ];

      const ranked = scoreAndRankTopicBatch(batch, {
        nowMs: now,
        maxPerDomainInTop: 3,
      });

      const top8GithubCount = ranked
        .slice(0, 8)
        .filter((item) => item.sourceDomain === 'github.com').length;
      expect(top8GithubCount).toBeLessThanOrEqual(3);
    });
  });

  describe('5. UI Regression: Scan Trends Preserves Skips + Hidden Drawer Restore', () => {
    it('keeps skipped stories hidden across Scan Trends and allows restoring via Hidden drawer', async () => {
      const topicA = makeTopic({
        id: 'live_a',
        title: 'Tailscale NAT traversal hits 92% direct peer connections',
        url: 'https://tailscale.com/blog/nat-traversal-92',
        sourceDomain: 'tailscale.com',
        extractedMetrics: ['92% direct', '14ms RTT'],
      });
      const topicB = makeTopic({
        id: 'live_b',
        title: 'Fly.io Anycast proxy cuts cross-region tail latency 38%',
        url: 'https://fly.io/blog/anycast-proxy-38',
        sourceDomain: 'fly.io',
        extractedMetrics: ['38% p99 drop', '42 regions'],
      });

      let serverDecisions: TriageDecisionRecord[] = [];
      let radarCalls = 0;

      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          const method = (init?.method || 'GET').toUpperCase();

          if (url.includes('/api/gather/radar')) {
            radarCalls += 1;
            return new Response(
              JSON.stringify({
                ok: true,
                cached: false,
                fetchedAt: new Date().toISOString(),
                topics: [topicA, topicB],
                feedStatuses: [
                  { id: 'hn', name: 'Hacker News', status: 'ok', itemCount: 2, fetchedAt: new Date().toISOString() },
                ],
              }),
              { status: 200 }
            );
          }

          if (url.includes('/api/gather/triage') && method === 'GET') {
            return new Response(
              JSON.stringify({ ok: true, decisions: serverDecisions }),
              { status: 200 }
            );
          }

          if (url.includes('/api/gather/triage') && method === 'POST') {
            const payload = JSON.parse(String(init?.body || '{}'));
            const created: TriageDecisionRecord = {
              id: `srv_td_${Date.now()}`,
              topicId: payload.topicId,
              topicSignature: buildTriageSignaturePayload(
                payload.topicSignature,
                payload.canonicalUrl
              ),
              canonicalUrl: payload.canonicalUrl,
              sourceDomain: payload.sourceDomain,
              domainCategory: payload.domainCategory,
              action: payload.action,
              reason: payload.reason,
              snoozeUntil: payload.snoozeUntil,
              createdAt: new Date().toISOString(),
            };
            serverDecisions = [created, ...serverDecisions];
            return new Response(JSON.stringify({ ok: true, decision: created }), { status: 201 });
          }

          if (url.includes('/api/gather/triage/') && method === 'DELETE') {
            const id = decodeURIComponent(url.split('/api/gather/triage/')[1] || '');
            serverDecisions = serverDecisions.filter((d) => d.id !== id);
            return new Response(JSON.stringify({ ok: true, deletedId: id }), { status: 200 });
          }

          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        })
      );

      render(
        <WeeklyProgramReviewPanel
          savedPosts={[]}
          theme={DEFAULT_PALETTES[0]}
          onEditInStudio={vi.fn()}
          onRefreshVault={vi.fn()}
          onRefreshStatus={vi.fn()}
          onShowToast={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('inbox-candidate-card-live_a')).toBeTruthy();
        expect(screen.getByTestId('inbox-candidate-card-live_b')).toBeTruthy();
      });

      // Skip Topic A
      fireEvent.click(screen.getByTestId('skip-menu-btn-live_a'));
      fireEvent.click(screen.getByTestId('skip-reason-live_a-off-topic'));

      await waitFor(() => {
        expect(screen.queryByTestId('inbox-candidate-card-live_a')).toBeNull();
        expect(screen.getByTestId('hidden-topics-toggle-btn').textContent).toContain('Hidden (1)');
      });

      // Click Scan Trends — Topic A must NOT reappear!
      const callsBefore = radarCalls;
      fireEvent.click(screen.getByTestId('scan-trends-btn'));

      await waitFor(() => {
        expect(radarCalls).toBeGreaterThan(callsBefore);
      });
      expect(screen.queryByTestId('inbox-candidate-card-live_a')).toBeNull();
      expect(screen.getByTestId('inbox-candidate-card-live_b')).toBeTruthy();

      // Open Hidden drawer — verify clean human title (no ||url:: delimiter leak)
      fireEvent.click(screen.getByTestId('hidden-topics-toggle-btn'));
      const drawer = await screen.findByTestId('hidden-topics-drawer');
      expect(drawer.textContent).toContain(parseTriageSignature(topicA.title).title);
      expect(drawer.textContent).not.toContain('||url::');

      // Restore Topic A — it should reappear on refresh
      const restoreBtn = screen.getByRole('button', { name: /Restore Tailscale NAT traversal/i });
      fireEvent.click(restoreBtn);

      await waitFor(() => {
        expect(screen.getByTestId('inbox-candidate-card-live_a')).toBeTruthy();
        expect(screen.getByTestId('hidden-topics-toggle-btn').textContent).toContain('Hidden (0)');
      });
    });
  });
});
