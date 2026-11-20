import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import {
  computeTopicViralityScore,
  CURATED_ENGINEERING_TOPICS,
  type GatheredTopicItem,
} from '../../api/controllers/mediaController.ts';
import {
  acceptGatheredCandidatesToDrafts,
  generateGatheredCandidatesInBackground,
  hydrateCandidateDeckOnDemand,
} from '../lib/gather/gatherClient.ts';
import {
  detectSummaryOnlyDraft,
  evaluateGathererCandidateQuality,
} from '../lib/qaChecks.ts';
import { detectCadenceOverloadByDay } from '../lib/publish/publishClient.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';
import {
  DEFAULT_PALETTES,
  type CarouselData,
  type SavedPostRecord,
} from '../types.ts';
import { PublishingHubWorkspace } from '../components/studio/PublishingHubWorkspace.tsx';

function makeValidDeck(overrides?: Partial<CarouselData>): CarouselData {
  const deck: CarouselData = JSON.parse(JSON.stringify(DEFAULT_STARTER_DECK));
  const arWords = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة'];
  deck.slides = deck.slides.map((s, idx) => ({
    ...s,
    type: idx === 0 ? 'metric' : idx === deck.slides.length - 1 ? 'cta' : idx % 2 === 1 ? 'compare' : 'row',
    enTitle:
      idx === 0
        ? '70% lower p99 Postgres latency.'
        : `Stage ${idx + 1}: Production query tuning.`,
    arTitle:
      idx === 0
        ? 'خفض p99 بنسبة 70% في قواعد Postgres.'
        : `المرحلة ${arWords[idx] || 'التالية'}: تحسين استعلامات Postgres.`,
    enBody:
      idx === 0
        ? ''
        : `Partitioning hot Postgres indexes cuts buffer contention across worker stage ${idx + 1}.`,
    arBody:
      idx === 0
        ? ''
        : `تقسيم فهارس Postgres يقلل الضغط على Cache ويحسن الاستجابة في المرحلة ${arWords[idx] || 'الحالية'}.`,
    metricValue: idx === 0 ? '70%' : s.metricValue,
    metricDiff: idx === 0 ? '▼ p99 latency' : s.metricDiff,
    layoutRationale: `Slide ${idx + 1} tailored layout`,
  }));
  return {
    ...deck,
    ...overrides,
  };
}

describe('Inbox -> Draft -> Schedule Workflow, Scoring, Quality Gates & Safety', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('computes 4-factor scoring breakdown (freshness, engagement, clientRelevance, platformRisk) and down-ranks old topics', () => {
    const freshScore = computeTopicViralityScore({
      title: 'Cutting Postgres p99 Latency by 70% for SaaS Startups',
      summary:
        'Using partial indexes and connection pooling saved cloud database costs by 45% across production SME APIs.',
      score: 420,
      extractedMetrics: ['70%', '45%'],
      sourceType: 'rss',
      publishedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    });

    const staleScore = computeTopicViralityScore({
      title: 'Cutting Postgres p99 Latency by 70% for SaaS Startups',
      summary:
        'Using partial indexes and connection pooling saved cloud database costs by 45% across production SME APIs.',
      score: 420,
      extractedMetrics: ['70%', '45%'],
      sourceType: 'rss',
      publishedAt: new Date(Date.now() - 40 * 24 * 3600_000).toISOString(),
    });

    expect(freshScore.scoreBreakdown).toMatchObject({
      freshness: expect.any(Number),
      engagement: expect.any(Number),
      clientRelevance: expect.any(Number),
      platformRisk: expect.any(Number),
      freshnessTag: 'fresh',
    });
    expect(staleScore.scoreBreakdown.freshnessTag).toBe('evergreen');
    expect(freshScore.scoreBreakdown.composite).toBeGreaterThan(
      staleScore.scoreBreakdown.composite
    );
    expect(freshScore.marrokAngle.toLowerCase()).toContain('what this means for your product');
  });

  it('flags missing/trivial Marrok angle, summary-only drafts, EN/AR title mismatches, Hub on Slide 1, and 3 identical layouts in a row', () => {
    const cleanDeck = makeValidDeck({
      sourceMeta: {
        marrokAngle:
          'What this means for your product: adopt partial indexes before upgrading RDS instances.',
      },
    });

    // 1. Valid candidate passes cleanly
    const passing = evaluateGathererCandidateQuality({
      title: 'Postgres Indexing Benchmark',
      draftTitle: cleanDeck.slides[0].enTitle,
      summary: 'PostgreSQL 17 introduced vacuum improvements.',
      marrokAngle:
        'What this means for your product: cut database spend by indexing hot tenant queries.',
      deck: cleanDeck,
    });
    expect(passing.passed).toBe(true);
    expect(passing.blockingReasons).toHaveLength(0);

    // 2. Missing Marrok angle blocks Accept
    const missingAngle = evaluateGathererCandidateQuality({
      title: 'Postgres Indexing Benchmark',
      summary: 'PostgreSQL 17 introduced vacuum improvements.',
      marrokAngle: 'Too short',
      deck: cleanDeck,
    });
    expect(missingAngle.passed).toBe(false);
    expect(missingAngle.blockingReasons.some((r) => /Marrok angle/i.test(r))).toBe(true);

    // 3. Slide 1 Hub & 3 identical layouts in a row & EN/AR mismatch & Arabic filler are blocked
    const brokenDeck = makeValidDeck();
    brokenDeck.slides[0].type = 'hub';
    brokenDeck.slides[1].type = 'row';
    brokenDeck.slides[2].type = 'row';
    brokenDeck.slides[3].type = 'row';
    brokenDeck.slides[1].enTitle = 'Seven Words Inside This English Slide Headline';
    brokenDeck.slides[1].arTitle = 'عنوان';
    brokenDeck.slides[2].arBody = 'هذا العنصر يعرض تفاصيل هندسية عامة.';

    const blocked = evaluateGathererCandidateQuality({
      title: 'Postgres Indexing Benchmark',
      summary: 'Postgres indexing article',
      marrokAngle: 'What this means for your product: keep queries predictable at scale.',
      deck: brokenDeck,
    });
    expect(blocked.passed).toBe(false);
    expect(blocked.blockingReasons.some((r) => /Slide 1.*Hook|not Hub/i.test(r))).toBe(true);
    expect(blocked.blockingReasons.some((r) => /3 times in a row/i.test(r))).toBe(true);
    expect(blocked.blockingReasons.some((r) => /EN\/AR title mismatch/i.test(r))).toBe(true);
    expect(blocked.blockingReasons.some((r) => /filler/i.test(r))).toBe(true);

    // 4. Summary-only warning fires when draft repeats source summary with zero product angle
    const summaryAudit = detectSummaryOnlyDraft({
      title: 'Postgres Indexing Benchmark',
      summary:
        'Partitioning hot Postgres indexes cuts buffer contention across worker stage threads in production clusters.',
      marrokAngle: 'Postgres Indexing Benchmark',
      slides: cleanDeck.slides,
    });
    expect(summaryAudit.isSummaryOnly).toBe(true);
  });

  it('uses lazy 1-slide generation in Inbox, hydrates 8-slide storyboard on demand with non-Hub Slide 1 & layoutRationale, and enforces Draft-only queueing without bypassing review', async () => {
    const sampleTopics = CURATED_ENGINEERING_TOPICS.slice(0, 2) as unknown as GatheredTopicItem[];
    const lazyCandidates = await generateGatheredCandidatesInBackground(sampleTopics, [], {
      lazy: true,
    });

    expect(lazyCandidates).toHaveLength(2);
    expect(lazyCandidates[0].isDeckSynthesized).toBe(false);
    expect(lazyCandidates[0].deck.slides).toHaveLength(1);
    expect(lazyCandidates[0].deck.slides[0].type).not.toBe('hub');
    expect(lazyCandidates[0].sourceDomain).toBeTruthy();
    expect(lazyCandidates[0].publishedDateLabel).toBeTruthy();

    // Hydrate on demand -> builds full 8-slide storyboard with layoutRationale & no 3-in-a-row streak
    const hydrated = await hydrateCandidateDeckOnDemand(lazyCandidates[0], { useAi: false });
    expect(hydrated.isDeckSynthesized).toBe(true);
    expect(hydrated.deck.slides.length).toBeGreaterThanOrEqual(6);
    expect(hydrated.deck.slides[0].type).not.toBe('hub');
    for (const slide of hydrated.deck.slides) {
      expect(slide.layoutRationale && slide.layoutRationale.length > 5).toBe(true);
    }

    // Accepting to Draft persists unscheduled Draft with BOTH userReviewed=false AND verifiedNumbers=false
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          storageEngine: 'neon-postgres',
          post: {
            id: 'draft_1',
            title: hydrated.draftTitle,
            category: hydrated.topic.domainCategory,
            postStatus: 'validated',
            humanApproved: false,
            verifiedNumbers: false,
            slideCount: hydrated.deck.slides.length,
            qaPassed: true,
            creatorHandle: '@MARROK',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deck: hydrated.deck,
          },
        }),
      })
    );

    const accepted = await acceptGatheredCandidatesToDrafts([lazyCandidates[0]], {
      useAiUpgrade: false,
    });
    expect(accepted.failedCandidates).toHaveLength(0);
    expect(accepted.draftPosts).toHaveLength(1);
    expect(accepted.draftPosts[0].scheduledFor).toBeUndefined();
    expect(accepted.draftPosts[0].humanApproved).toBe(false);
    expect(accepted.draftPosts[0].verifiedNumbers).toBe(false);
  });

  it('detects >2 posts/day cadence overload accurately', () => {
    const baseDeck = makeValidDeck();
    const posts: SavedPostRecord[] = ['09:00', '12:00', '18:00'].map((t, idx) => ({
      id: `p_${idx}`,
      title: `Post ${idx}`,
      category: 'SYSTEMS',
      creatorHandle: '@MARROK',
      postStatus: 'validated',
      scheduledFor: `2026-12-01T${t}:00.000Z`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slideCount: 8,
      qaPassed: true,
      deck: baseDeck,
    }));

    const overloaded = detectCadenceOverloadByDay(posts, 2);
    expect(overloaded).toHaveLength(1);
    expect(overloaded[0].count).toBe(3);

    const safe = detectCadenceOverloadByDay(posts.slice(0, 2), 2);
    expect(safe).toHaveLength(0);
  });

  it('renders flattened Inbox -> Draft -> Schedule UI, shows Neon + Cloudinary status, enforces 2-flag safety gate before Publish Now, and displays >2/day cadence warning', async () => {
    const validDeck = makeValidDeck({
      sourceMeta: {
        marrokAngle:
          'What this means for your product: shrink database p99 latency before scaling hardware.',
        userReviewed: false,
        verifiedNumbers: false,
      },
    });

    const draftPost: SavedPostRecord = {
      id: 'post_draft_1',
      title: '70% Lower Postgres p99 Latency',
      category: 'DISTRIBUTED SYSTEMS',
      creatorHandle: '@MARROK',
      postStatus: 'validated',
      humanApproved: false,
      verifiedNumbers: false,
      slideCount: 8,
      qaPassed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deck: validDeck,
    };

    const overloadedScheduledPosts: SavedPostRecord[] = [0, 1, 2].map((i) => ({
      id: `post_sched_${i}`,
      title: `Scheduled Optimization #${i + 1}`,
      category: 'DISTRIBUTED SYSTEMS',
      creatorHandle: '@MARROK',
      postStatus: 'validated',
      humanApproved: true,
      verifiedNumbers: true,
      scheduledFor: `2026-12-10T1${i}:00:00.000Z`,
      slideCount: 8,
      qaPassed: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deck: validDeck,
    }));

    const coveredTopicTitle = CURATED_ENGINEERING_TOPICS[0].title;
    const coveredPost: SavedPostRecord = {
      ...draftPost,
      id: 'post_covered_1',
      title: coveredTopicTitle,
      postStatus: 'posted',
      postedAt: '2026-11-10T12:00:00.000Z',
      humanApproved: true,
      verifiedNumbers: true,
      deck: {
        ...validDeck,
        brandUrl: CURATED_ENGINEERING_TOPICS[0].url,
      },
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/publish/status')) {
        return {
          ok: true,
          json: async () => ({
            storageEngine: 'neon-postgres',
            databaseConfigured: true,
            cloudinaryConfigured: true,
            cloudinaryCloudName: 'marrok-cdn',
            bufferApiConfigured: true,
            zernioApiConfigured: true,
            currentMonthKey: '2026-11',
            metricoolUsedThisMonth: 2,
            metricoolMonthlyLimit: 20,
            bufferQueueLimitPerChannel: 10,
            stagedCloudinarySlidesCount: 0,
            cleanedCloudinaryPostsCount: 1,
            channels: [],
          }),
        } as Response;
      }
      if (url.includes('/api/publish/tiktok-music')) {
        return {
          ok: true,
          json: async () => ({ ok: true, source: 'fallback', tracks: [] }),
        } as Response;
      }
      if (url.includes('/api/gather/radar')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            cached: true,
            fetchedAt: new Date().toISOString(),
            topics: CURATED_ENGINEERING_TOPICS.slice(0, 2),
          }),
        } as Response;
      }
      if (url.includes('/api/posts')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            storageEngine: 'neon-postgres',
            post: { ...draftPost, humanApproved: true, verifiedNumbers: true },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ ok: true }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const onRefreshVault = vi.fn();
    const onShowToast = vi.fn();

    render(
      <PublishingHubWorkspace
        initialTab="draft"
        carousel={validDeck}
        theme={DEFAULT_PALETTES.teal}
        savedPosts={[draftPost, coveredPost, ...overloadedScheduledPosts]}
        storageEngine="neon-postgres"
        onBackToStudio={vi.fn()}
        onRefreshVault={onRefreshVault}
        onShowToast={onShowToast}
      />
    );

    // 1. Flattened 3 workflow tabs: Inbox, Draft, Schedule
    expect(screen.getByTestId('hub-tab-inbox')).toBeInTheDocument();
    expect(screen.getByTestId('hub-tab-draft')).toBeInTheDocument();
    expect(screen.getByTestId('hub-tab-schedule')).toBeInTheDocument();

    // 2. Healthy Connections menu has no warning badge, never leaks Cloudinary cloud name, and confirms Neon Postgres + Connected
    expect(screen.queryByTestId('connections-issue-badge')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('marrok-cdn');
    fireEvent.click(screen.getByTestId('connections-menu-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('status-db-engine')).toHaveTextContent('Neon Postgres');
      expect(screen.getByTestId('status-cloudinary')).toHaveTextContent('Connected');
    });
    expect(document.body.textContent).not.toContain('marrok-cdn');
    fireEvent.click(screen.getByTestId('connections-menu-btn'));

    // 3. Draft safety gate disables Publish Now & Schedule until BOTH checkboxes are checked
    const publishNowBtn = screen.getByTestId('draft-publish-now-post_draft_1');
    const scheduleBtn = screen.getByTestId('draft-schedule-btn-post_draft_1');
    expect(publishNowBtn).toBeDisabled();
    expect(scheduleBtn).toBeDisabled();

    const humanCb = screen.getByTestId('check-human-reviewed-post_draft_1');
    const numbersCb = screen.getByTestId('check-numbers-verified-post_draft_1');
    fireEvent.click(humanCb);
    expect(publishNowBtn).toBeDisabled();
    fireEvent.click(numbersCb);

    // Wait for rerender / state update on Draft checkboxes
    await waitFor(() => {
      expect(humanCb).toBeChecked();
      expect(numbersCb).toBeChecked();
    });

    // 4. Switch to Inbox: verify lazy card, sourceDomain, Freshness, Already Covered, and 4-factor breakdown tooltip
    fireEvent.click(screen.getByTestId('hub-tab-inbox'));
    await waitFor(() => {
      expect(screen.getByTestId('inbox-gather-view')).toBeInTheDocument();
      expect(screen.getAllByTestId('already-covered-badge').length).toBeGreaterThanOrEqual(1);
    });

    const uncoveredTopicId = CURATED_ENGINEERING_TOPICS[1].id;
    const card = screen.getByTestId(`inbox-candidate-card-${uncoveredTopicId}`);
    expect(within(card).getByTestId(`source-domain-${uncoveredTopicId}`)).toBeInTheDocument();
    expect(within(card).getByTestId(`published-date-${uncoveredTopicId}`)).toBeInTheDocument();
    expect(within(card).getByTestId(`freshness-tag-${uncoveredTopicId}`)).toBeInTheDocument();
    expect(
      within(card).getByTestId(`score-breakdown-tooltip-${uncoveredTopicId}`)
    ).toHaveTextContent(/Client Relevance/i);

    // Shortening Marrok Angle blocks "Move to Draft"
    const angleInput = within(card).getByTestId(`marrok-angle-input-${uncoveredTopicId}`);
    fireEvent.change(angleInput, { target: { value: 'Too short' } });
    await waitFor(() => {
      expect(within(card).getByTestId(`move-to-draft-${uncoveredTopicId}`)).toBeDisabled();
      expect(within(card).getByTestId(`quality-blocker-${uncoveredTopicId}`)).toBeInTheDocument();
    });

    // Restoring strong angle re-enables Move to Draft, and clicking Inspect lazily generates 8 slides
    fireEvent.change(angleInput, {
      target: {
        value: 'What this means for your product: shrink LLM KV memory footprint in production.',
      },
    });
    await waitFor(() => {
      expect(within(card).getByTestId(`move-to-draft-${uncoveredTopicId}`)).not.toBeDisabled();
    });

    fireEvent.click(within(card).getByTestId(`toggle-slide-preview-${uncoveredTopicId}`));
    await waitFor(() => {
      expect(
        within(card).getByTestId('active-slide-layout-rationale')
      ).toBeInTheDocument();
    });

    // 5. Switch to Schedule: verify >2/day cadence warning banner & Publish Now button on scheduled posts
    fireEvent.click(screen.getByTestId('hub-tab-schedule'));
    await waitFor(() => {
      expect(screen.getByTestId('cadence-overload-warning')).toBeInTheDocument();
      expect(screen.getByTestId('schedule-publish-now-post_sched_0')).toBeInTheDocument();
    });
  });

  it('renders "Cloudinary Required" badge and warning callout, disables publish button, and blocks direct publishing when Cloudinary is unconfigured', async () => {
    const validDeck = makeValidDeck({
      sourceMeta: {
        marrokAngle: 'What this means for your product: verify Cloudinary requirements.',
        userReviewed: true,
        humanApproved: true,
        verifiedNumbers: true,
      },
    });

    const unconfiguredStatus = {
      storageEngine: 'neon-postgres',
      databaseConfigured: true,
      cloudinaryConfigured: false,
      cloudinaryCloudName: null,
      bufferApiConfigured: true,
      zernioApiConfigured: true,
      currentMonthKey: '2026-11',
      metricoolUsedThisMonth: 0,
      metricoolMonthlyLimit: 20,
      bufferQueueLimitPerChannel: 10,
      stagedCloudinarySlidesCount: 0,
      cleanedCloudinaryPostsCount: 0,
      channels: [],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/publish/status')) {
        return {
          ok: true,
          json: async () => unconfiguredStatus,
          text: async () => JSON.stringify(unconfiguredStatus),
          headers: new Headers({ 'Content-Type': 'application/json' }),
        } as unknown as Response;
      }
      if (url.includes('/api/publish/tiktok-music')) {
        return {
          ok: true,
          json: async () => ({ ok: true, source: 'fallback', tracks: [] }),
          text: async () => JSON.stringify({ ok: true, source: 'fallback', tracks: [] }),
          headers: new Headers({ 'Content-Type': 'application/json' }),
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({ ok: true }),
        text: async () => JSON.stringify({ ok: true }),
        headers: new Headers({ 'Content-Type': 'application/json' }),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const onShowToast = vi.fn();

    render(
      <PublishingHubWorkspace
        initialTab="single"
        carousel={validDeck}
        theme={DEFAULT_PALETTES.teal}
        savedPosts={[]}
        storageEngine="neon-postgres"
        onBackToStudio={vi.fn()}
        onRefreshVault={vi.fn()}
        onShowToast={onShowToast}
      />
    );

    // 1. Connections button displays issue badge and popover shows "Cloudinary Required"
    await waitFor(() => {
      expect(screen.getByTestId('connections-issue-badge')).toHaveTextContent('1');
    });
    fireEvent.click(screen.getByTestId('connections-menu-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('status-cloudinary')).toHaveTextContent('Cloudinary Required');
    });

    // 2. Warning banner is rendered
    expect(screen.getByTestId('cloudinary-required-warning')).toBeInTheDocument();
    expect(screen.getByTestId('cloudinary-required-warning')).toHaveTextContent(/Cloudinary Staging Required/i);

    // 3. Dispatch button is disabled and displays warning label
    const dispatchBtn = screen.getByTestId('active-dispatch-btn');
    expect(dispatchBtn).toBeDisabled();
    expect(dispatchBtn).toHaveTextContent('Cloudinary Staging Required to Publish');
  });
});
