import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';
import {
  DEFAULT_PALETTES,
  type CarouselData,
  type SavedPostRecord,
} from '../types.ts';
import {
  computeDraftReadiness,
  extractDraftClaimEvidence,
  toggleDraftClaimEvidence,
} from '../lib/publish/draftReviewEngine.ts';
import { parseCarouselData } from '../lib/validation/carousel.ts';
import { PublishingHubWorkspace } from '../components/studio/PublishingHubWorkspace.tsx';
import { Header } from '../components/Header.tsx';

function makeDraftPost(overrides?: Partial<SavedPostRecord>): SavedPostRecord {
  const deck: CarouselData = JSON.parse(JSON.stringify(DEFAULT_STARTER_DECK));
  deck.id = 'draft_sim_1';
  deck.slides = [
    {
      ...deck.slides[0],
      type: 'row',
      enTitle: 'Simulating industrial robot pick and place.',
      arTitle: 'محاكاة التقاط الروبوتات الصناعية.',
      enBody: 'Virtual USD scenes test robot policies before hardware trials.',
      arBody: 'مشاهد USD الافتراضية تختبر سياسات الروبوت قبل التجارب الفعلية.',
      layoutRationale:
        'Picked Mechanism (3-Node Topology) flow mapping "Simulating" -> "Industrial" -> "Robot" (not a two-system migration).',
    },
    {
      ...deck.slides[1],
      type: 'metric',
      enTitle: 'Reaching 496k repository downloads.',
      arTitle: 'الوصول إلى 496k تحميل للمستودع.',
      enBody: 'Open SimReady assets cut scene setup time by 3.2x across labs.',
      arBody: 'أصول SimReady المفتوحة تقلص وقت الإعداد بمقدار 3.2x.',
      metricValue: '496k',
      metricLabel: 'repository downloads',
      metricDiff: '▲ 3.2x faster setup',
      layoutRationale:
        'Picked Metric card to spotlight measured "4." benchmark on "Reaching" -> "Hugging" -> "Face".',
    },
    {
      ...deck.slides[deck.slides.length - 1],
      type: 'cta',
      enTitle: 'How do you test robotic simulation pipelines?',
      arTitle: 'كيف تختبر أنظمة محاكاة الروبوتات؟',
      enBody: 'Follow MARROK for systems engineering breakdowns.',
      arBody: 'تابع MARROK لتحليلات هندسة الأنظمة.',
    },
  ];
  deck.sourceMeta = {
    title: 'NVIDIA SimReady OpenUSD Assets on Hugging Face',
    url: 'https://developer.nvidia.com/blog/simready-openusd-assets/',
    published: new Date(Date.now() - 2 * 3600_000).toISOString(),
    sourceSummary:
      'SimReady OpenUSD assets reached 496k repository downloads on Hugging Face for industrial robot simulation.',
    metricEvidence: [
      {
        id: 'ev_496k',
        label: '496k repository downloads',
        sourceQuote:
          'SimReady OpenUSD assets reached 496k repository downloads on Hugging Face for industrial robot simulation.',
        sourceUrl: 'https://developer.nvidia.com/blog/simready-openusd-assets/',
        verified: false,
      },
    ],
    marrokAngle:
      'What this means for your product: validate robotics workflows in simulation before buying physical cells.',
    userReviewed: false,
    humanApproved: false,
    verifiedNumbers: false,
  };

  return {
    id: 'draft_sim_1',
    title: 'Simulating industrial robot pick and place.',
    category: 'ROBOTICS & SIMULATION',
    creatorHandle: '@MARROK',
    postStatus: 'validated',
    humanApproved: false,
    verifiedNumbers: false,
    slideCount: deck.slides.length,
    qaPassed: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deck,
    ...overrides,
  };
}

describe('Draft Review Queue Redesign — Claims, Live Slide Quick-Edit & Unified Studio Workflow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts persisted Inbox evidence and unmatched slide metrics, and preserves metricEvidence through parseCarouselData', () => {
    const post = makeDraftPost();
    const claims = extractDraftClaimEvidence(post);

    expect(claims.length).toBeGreaterThanOrEqual(2);

    const downloadsClaim = claims.find((c) => c.label.includes('496k'));
    expect(downloadsClaim).toBeDefined();
    expect(downloadsClaim?.sourceQuote).toContain('496k repository downloads');
    expect(downloadsClaim?.slideIndices).toContain(1);
    expect(downloadsClaim?.verified).toBe(false);

    const speedupClaim = claims.find((c) => c.label.includes('3.2x'));
    expect(speedupClaim).toBeDefined();
    expect(speedupClaim?.sourceQuote).toBeNull(); // Not in sourceSummary -> warns reviewer
    expect(speedupClaim?.slideIndices).toContain(1);

    // Toggling one of two claims keeps allClaimsVerified false; toggling both sets it true
    const afterFirst = toggleDraftClaimEvidence(claims, downloadsClaim!.id, true);
    expect(afterFirst.allClaimsVerified).toBe(false);
    const afterSecond = toggleDraftClaimEvidence(
      afterFirst.nextClaims,
      speedupClaim!.id,
      true
    );
    expect(afterSecond.allClaimsVerified).toBe(true);

    // parseCarouselData must preserve metricEvidence and sourceSummary across Vault saves
    const parsed = parseCarouselData(post.deck);
    expect(parsed?.sourceMeta?.sourceSummary).toContain('496k repository downloads');
    expect(parsed?.sourceMeta?.metricEvidence).toHaveLength(1);
    expect(parsed?.sourceMeta?.metricEvidence?.[0].label).toBe('496k repository downloads');
  });

  it('computes explicit readiness steps until both human review and claims are verified', () => {
    const post = makeDraftPost();
    const claims = extractDraftClaimEvidence(post);

    const initial = computeDraftReadiness({
      post,
      claims,
      humanReviewed: false,
      numbersVerified: false,
      marrokAngle: post.deck.sourceMeta?.marrokAngle || '',
    });
    expect(initial.canShip).toBe(false);
    expect(initial.summaryLabel).toContain('confirm human review');
    expect(initial.summaryLabel).toContain('verify 2 claims');

    const ready = computeDraftReadiness({
      post,
      claims: claims.map((c) => ({ ...c, verified: true })),
      humanReviewed: true,
      numbersVerified: true,
      marrokAngle: post.deck.sourceMeta?.marrokAngle || '',
    });
    expect(ready.canShip).toBe(true);
    expect(ready.summaryLabel).toBe('Ready to schedule or publish');
  });

  it('renders clean Draft cards without Deep AI / Diversify / Backup / rationale leaks, supports per-claim verification, inline quick-edit, and unified Studio handoff', async () => {
    const post = makeDraftPost();
    const savedPayloads: Array<{ title?: string; deck?: CarouselData }> = [];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/publish/status')) {
        return {
          ok: true,
          json: async () => ({
            storageEngine: 'neon-postgres',
            databaseConfigured: true,
            cloudinaryConfigured: true,
            cloudinaryCloudName: 'secret-cloud',
            bufferApiConfigured: true,
            zernioApiConfigured: true,
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
      if (url.includes('/api/posts') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}'));
        savedPayloads.push(body);
        return {
          ok: true,
          json: async () => ({
            ok: true,
            storageEngine: 'neon-postgres',
            post: {
              ...post,
              title: body.title || post.title,
              humanApproved: Boolean(body.userReviewed),
              verifiedNumbers: Boolean(body.verifiedNumbers),
              deck: body.deck || post.deck,
            },
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ ok: true }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const onSelectPostIntoStudio = vi.fn();
    const onRefreshVault = vi.fn();
    const onShowToast = vi.fn();

    render(
      <PublishingHubWorkspace
        initialTab="draft"
        carousel={post.deck}
        theme={DEFAULT_PALETTES.teal}
        savedPosts={[post]}
        storageEngine="neon-postgres"
        onBackToStudio={vi.fn()}
        onSelectPostIntoStudio={onSelectPostIntoStudio}
        onRefreshVault={onRefreshVault}
        onShowToast={onShowToast}
        onExportVaultJson={vi.fn()}
        onImportVaultJson={vi.fn()}
      />
    );

    const card = screen.getByTestId('post-card-draft_sim_1');

    // 1. Removed cluttered controls & leaked internal rationale text
    expect(screen.queryByTestId('resynthesize-post-draft_sim_1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('diversify-post-draft_sim_1')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Backup$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Restore$/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('not a two-system migration');
    expect(document.body.textContent).not.toContain('Picked Metric card');

    // 2. Bilingual slide strip renders real EN + Arabic copy directly
    expect(within(card).getByTestId('draft-bilingual-strip-draft_sim_1')).toHaveTextContent(
      'محاكاة التقاط الروبوتات الصناعية.'
    );

    // 3. Claims & Numbers section displays source quote AND missing-quote warning
    const claimsSection = within(card).getByTestId('draft-claims-section-draft_sim_1');
    expect(claimsSection).toHaveTextContent('496k repository downloads');
    expect(claimsSection).toHaveTextContent(
      'SimReady OpenUSD assets reached 496k repository downloads on Hugging Face'
    );
    expect(claimsSection).toHaveTextContent('No matching source quote found');

    // 4. Readiness status explains remaining checks, and toggling all claims + Human Reviewed unlocks Publish Now & Schedule
    const publishBtn = within(card).getByTestId('draft-publish-now-draft_sim_1');
    const scheduleBtn = within(card).getByTestId('draft-schedule-btn-draft_sim_1');
    expect(publishBtn).toBeDisabled();
    expect(scheduleBtn).toBeDisabled();
    expect(within(card).getByTestId('draft-readiness-status-draft_sim_1')).toHaveTextContent(
      /Needs:/i
    );

    const claimToggles = within(claimsSection).getAllByRole('checkbox');
    expect(claimToggles.length).toBeGreaterThanOrEqual(2);
    for (const toggle of claimToggles) {
      fireEvent.click(toggle);
    }

    await waitFor(() => {
      expect(within(card).getByTestId('check-numbers-verified-draft_sim_1')).toBeChecked();
    });
    expect(publishBtn).toBeDisabled(); // Still needs Human Reviewed

    fireEvent.click(within(card).getByTestId('check-human-reviewed-draft_sim_1'));
    await waitFor(() => {
      expect(publishBtn).not.toBeDisabled();
      expect(scheduleBtn).not.toBeDisabled();
      expect(within(card).getByTestId('draft-readiness-status-draft_sim_1')).toHaveTextContent(
        'Ready to schedule or publish'
      );
    });

    // 5. Clicking a slide opens the live slide preview + inline quick-edit and saves to Vault
    fireEvent.click(within(card).getByTestId('draft-slide-chip-draft_sim_1-0'));
    const inspector = within(card).getByTestId('draft-slide-inspector-draft_sim_1');
    expect(within(inspector).getByTestId('draft-live-canvas-draft_sim_1')).toBeInTheDocument();

    const enTitleInput = within(inspector).getByTestId('draft-quick-en-title-draft_sim_1');
    fireEvent.change(enTitleInput, {
      target: { value: 'Robot sim cuts hardware trials.' },
    });
    fireEvent.click(within(inspector).getByTestId('draft-inspector-save-btn-draft_sim_1'));

    await waitFor(() => {
      expect(
        savedPayloads.some((p) => p.title === 'Robot sim cuts hardware trials.')
      ).toBe(true);
    });

    // 6. Suggested empty slot is displayed and unified Edit in Studio hands off cleanly
    expect(within(card).getByTestId('draft-suggested-slot-draft_sim_1')).toHaveTextContent(
      /empty/i
    );
    fireEvent.click(within(card).getByTestId('draft-edit-studio-draft_sim_1'));
    expect(onSelectPostIntoStudio).toHaveBeenCalledWith(post);
  });

  it('hides Studio-only active-deck Posted status button when viewing Publish & Posts phase', () => {
    const { rerender } = render(
      <Header
        currentPalette={DEFAULT_PALETTES.teal}
        onOpenThemeCustomizer={vi.fn()}
        onOpenContactSheet={vi.fn()}
        onOpenSavedPostsDrawer={vi.fn()}
        savedPostsCount={18}
        deckStatus="posted"
        onSaveToVault={vi.fn()}
        activePhase="studio"
        onPhaseChange={vi.fn()}
      />
    );
    expect(screen.getAllByText('Posted').length).toBeGreaterThanOrEqual(1);

    rerender(
      <Header
        currentPalette={DEFAULT_PALETTES.teal}
        onOpenThemeCustomizer={vi.fn()}
        onOpenContactSheet={vi.fn()}
        onOpenSavedPostsDrawer={vi.fn()}
        savedPostsCount={18}
        deckStatus="posted"
        onSaveToVault={vi.fn()}
        activePhase="publish"
        onPhaseChange={vi.fn()}
      />
    );
    expect(screen.queryByText('Posted')).not.toBeInTheDocument();
  });
});
