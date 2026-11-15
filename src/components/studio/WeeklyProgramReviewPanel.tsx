import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CarouselData,
  PostFormat,
  SavedPostRecord,
  ThemePalette,
} from '../../types.ts';
import {
  acceptGatheredCandidatesToDrafts,
  buildLightweightLazyCandidate,
  dismissGatherTopicId,
  extractArticleFromUrl,
  fetchTopicRadar,
  GatheredCandidatePost,
  generateGatheredCandidatesInBackground,
  getSavedCustomRssFeeds,
  hydrateCandidateDeckOnDemand,
  reEvaluateCandidateQuality,
  regenerateSingleCandidateSlideWithAi,
  saveCustomRssFeeds,
} from '../../lib/gather/gatherClient.ts';
import { TopicRadarGatherView } from './review/TopicRadarGatherView.tsx';

interface WeeklyProgramReviewPanelProps {
  savedPosts: SavedPostRecord[];
  activeCarouselId?: string;
  theme: ThemePalette;
  initialSubView?: 'gather' | 'peak-board';
  onEditInStudio: (post: SavedPostRecord) => void;
  onLoadCandidateIntoStudio?: (deck: CarouselData, title: string) => void;
  onMovedToDraft?: (count: number) => void;
  onRefreshVault: () => void;
  onRefreshStatus: () => void;
  onShowToast: (msg: string) => void;
}

export const WeeklyProgramReviewPanel: React.FC<WeeklyProgramReviewPanelProps> = ({
  savedPosts,
  theme,
  onLoadCandidateIntoStudio,
  onMovedToDraft,
  onRefreshVault,
  onRefreshStatus,
  onShowToast,
}) => {
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [candidates, setCandidates] = useState<GatheredCandidatePost[]>([]);
  const [isScanningTrends, setIsScanningTrends] = useState<boolean>(false);
  const [scanProgressLabel, setScanProgressLabel] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<'auto' | PostFormat>('auto');

  const [customRssFeeds, setCustomRssFeeds] = useState<string[]>(() =>
    getSavedCustomRssFeeds()
  );
  const [urlOrRssInput, setUrlOrRssInput] = useState<string>('');
  const [isExtractingInput, setIsExtractingInput] = useState<boolean>(false);
  const [showRssManager, setShowRssManager] = useState<boolean>(false);

  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [isAcceptingBatch, setIsAcceptingBatch] = useState<boolean>(false);
  const [acceptingSingleId, setAcceptingSingleId] = useState<string | null>(null);
  const [hydratingCandidateId, setHydratingCandidateId] = useState<string | null>(null);
  const [regeneratingSlideKey, setRegeneratingSlideKey] = useState<string | null>(null);

  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
  const [activeOutlineSlideIdx, setActiveOutlineSlideIdx] = useState<number>(0);

  // Lazy Inbox Gatherer: loads ranked trends & fast Slide 1 hooks ONLY (no eager 21x8 AI storm)
  const runBackgroundGatherer = useCallback(
    async (refresh = false) => {
      setIsScanningTrends(true);
      setScanProgressLabel('Scanning Reddit, Hacker News, Lobsters, GitHub & RSS feeds...');
      try {
        const res = await fetchTopicRadar({
          source: sourceFilter,
          category: domainFilter,
          refresh,
          customRssUrls: customRssFeeds,
        });

        const generated = await generateGatheredCandidatesInBackground(
          res.topics || [],
          savedPosts,
          {
            formatOverride: formatFilter,
            lazy: true,
            onProgress: (curr, total, title) => {
              if (!isMountedRef.current) return;
              setScanProgressLabel(
                `Preparing lazy Slide 1 Hook (${curr}/${total}): ${title.slice(0, 42)}...`
              );
            },
          }
        );

        if (!isMountedRef.current) return;
        setCandidates(generated);
        setSelectedCandidateIds((prev) => {
          const validIds = new Set(
            generated
              .filter((c) => !c.alreadyCovered && (c.qualityGate?.passed ?? true))
              .map((c) => c.id)
          );
          const kept = prev.filter((id) => validIds.has(id));
          if (kept.length > 0) return kept;
          return Array.from(validIds).slice(0, 4);
        });
      } catch (err) {
        if (isMountedRef.current) {
          onShowToast(
            `⚠️ ${err instanceof Error ? err.message : 'Failed to scan trend sources'}`
          );
        }
      } finally {
        if (isMountedRef.current) {
          setIsScanningTrends(false);
          setScanProgressLabel(null);
        }
      }
    },
    [sourceFilter, domainFilter, formatFilter, customRssFeeds, savedPosts, onShowToast]
  );

  useEffect(() => {
    void runBackgroundGatherer(false);
  }, [runBackgroundGatherer]);

  const updateCandidateDeck = (
    candidateId: string,
    updater: (prev: GatheredCandidatePost) => GatheredCandidatePost
  ) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? reEvaluateCandidateQuality(updater(c)) : c))
    );
  };

  const handleUpdateCandidateAngle = (candidateId: string, angle: string) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== candidateId) return c;
        return reEvaluateCandidateQuality({
          ...c,
          marrokAngle: angle,
          deck: {
            ...c.deck,
            sourceMeta: {
              ...c.deck.sourceMeta,
              marrokAngle: angle,
            },
          },
        });
      })
    );
  };

  // Lazy on-demand 8-slide generation ONLY when candidate is opened or clicked
  const handleOpenAndHydrateCandidate = async (
    candidate: GatheredCandidatePost,
    slideIndex = 0
  ): Promise<GatheredCandidatePost> => {
    setExpandedCandidateId(candidate.id);
    setActiveOutlineSlideIdx(slideIndex);

    if (candidate.isDeckSynthesized) {
      return candidate;
    }

    setHydratingCandidateId(candidate.id);
    try {
      const hydrated = await hydrateCandidateDeckOnDemand(candidate, {
        useAi: false,
      });
      if (!isMountedRef.current) return hydrated;
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidate.id ? hydrated : c))
      );
      return hydrated;
    } catch (err) {
      if (isMountedRef.current) {
        onShowToast(
          `⚠️ ${err instanceof Error ? err.message : 'Failed to generate slide outline'}`
        );
      }
      return candidate;
    } finally {
      if (isMountedRef.current) {
        setHydratingCandidateId((curr) => (curr === candidate.id ? null : curr));
      }
    }
  };

  const handleAddUrlOrRss = async () => {
    const clean = urlOrRssInput.trim();
    if (!clean) return;

    if (/(\/rss\/?|\/feed\/?|\.rss$|\.xml$|atom\.xml)/i.test(clean)) {
      const updated = Array.from(new Set([clean, ...customRssFeeds])).slice(0, 6);
      setCustomRssFeeds(updated);
      saveCustomRssFeeds(updated);
      setUrlOrRssInput('');
      onShowToast(`Connected RSS source: ${clean} — scanning feed...`);
      void runBackgroundGatherer(true);
      return;
    }

    setIsExtractingInput(true);
    try {
      const res = await extractArticleFromUrl(clean);
      const lazyCand = buildLightweightLazyCandidate(
        res.topic,
        theme.id || 'teal',
        formatFilter
      );
      const hydratedCand = await hydrateCandidateDeckOnDemand(lazyCand, {
        useAi: true,
      });
      if (!isMountedRef.current) return;
      setCandidates((prev) => [
        hydratedCand,
        ...prev.filter((c) => c.id !== hydratedCand.id),
      ]);
      if (!hydratedCand.alreadyCovered && hydratedCand.qualityGate.passed) {
        setSelectedCandidateIds((prev) =>
          prev.includes(hydratedCand.id) ? prev : [hydratedCand.id, ...prev]
        );
      }
      setExpandedCandidateId(hydratedCand.id);
      setActiveOutlineSlideIdx(0);
      setUrlOrRssInput('');
      onShowToast(
        `✓ Extracted & drafted ${hydratedCand.deck.slides.length}-slide outline for "${res.topic.title.slice(0, 38)}"`
      );
    } catch (err) {
      onShowToast(
        `⚠️ ${err instanceof Error ? err.message : 'Failed to extract article URL'}`
      );
    } finally {
      setIsExtractingInput(false);
    }
  };

  const handleRegenerateSingleCandidateSlide = async (
    candidate: GatheredCandidatePost,
    slideIndex: number
  ) => {
    const key = `${candidate.id}:${slideIndex}`;
    setRegeneratingSlideKey(key);
    try {
      const updated = await regenerateSingleCandidateSlideWithAi(
        candidate,
        slideIndex
      );
      if (!isMountedRef.current) return;
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidate.id ? updated : c))
      );
      onShowToast(
        `✨ Regenerated Slide ${slideIndex + 1} for "${updated.draftTitle.slice(0, 32)}"`
      );
    } catch (err) {
      onShowToast(
        `⚠️ ${err instanceof Error ? err.message : 'Failed to regenerate slide'}`
      );
    } finally {
      setRegeneratingSlideKey(null);
    }
  };

  const handleMoveSingleToDraft = async (candidate: GatheredCandidatePost) => {
    setAcceptingSingleId(candidate.id);
    try {
      const result = await acceptGatheredCandidatesToDrafts([candidate], {
        useAiUpgrade: false,
      });

      if (result.draftPosts.length > 0) {
        setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
        setSelectedCandidateIds((prev) => prev.filter((id) => id !== candidate.id));
        onRefreshVault();
        onRefreshStatus();
        onShowToast(
          `✓ Moved "${candidate.draftTitle.slice(0, 34)}" to Draft for human & claims verification`
        );
        onMovedToDraft?.(result.draftPosts.length);
      } else if (result.failedCandidates.length > 0) {
        onShowToast(`⚠️ ${result.failedCandidates[0].error}`);
      }
    } finally {
      setAcceptingSingleId(null);
    }
  };

  const handleQueueSelectedToDrafts = async () => {
    const picked = candidates.filter((c) => selectedCandidateIds.includes(c.id));
    if (picked.length === 0) {
      onShowToast('Select at least 1 valid Inbox card to move to Draft');
      return;
    }

    setIsAcceptingBatch(true);
    try {
      const result = await acceptGatheredCandidatesToDrafts(picked, {
        useAiUpgrade: false,
      });

      if (result.draftPosts.length > 0) {
        const acceptedIds = new Set(picked.map((p) => p.id));
        const failedTitles = new Set(result.failedCandidates.map((f) => f.title));
        const succeeded = picked.filter(
          (c) => acceptedIds.has(c.id) && !failedTitles.has(c.draftTitle)
        );
        const succeededIds = new Set(succeeded.map((c) => c.id));
        setCandidates((prev) => prev.filter((c) => !succeededIds.has(c.id)));
        setSelectedCandidateIds((prev) => prev.filter((id) => !succeededIds.has(id)));
        onRefreshVault();
        onRefreshStatus();
        onShowToast(
          `✓ Queued ${result.draftPosts.length} unscheduled Draft(s) for review (human & numeric verification required before scheduling)`
        );
        onMovedToDraft?.(result.draftPosts.length);
      }

      if (result.failedCandidates.length > 0) {
        onShowToast(
          `⚠️ ${result.failedCandidates.length} candidate(s) blocked: ${result.failedCandidates[0].error}`
        );
      }
    } catch (err) {
      onShowToast(
        `⚠️ ${err instanceof Error ? err.message : 'Failed to queue drafts'}`
      );
    } finally {
      setIsAcceptingBatch(false);
    }
  };

  const handleDismissCandidate = (candidateId: string) => {
    dismissGatherTopicId(candidateId);
    setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
    setSelectedCandidateIds((prev) => prev.filter((id) => id !== candidateId));
    onShowToast('Dismissed candidate from Inbox');
  };

  return (
    <TopicRadarGatherView
      candidates={candidates}
      isScanningTrends={isScanningTrends}
      scanProgressLabel={scanProgressLabel}
      sourceFilter={sourceFilter}
      onSetSourceFilter={setSourceFilter}
      domainFilter={domainFilter}
      onSetDomainFilter={setDomainFilter}
      formatFilter={formatFilter}
      onSetFormatFilter={setFormatFilter}
      customRssFeeds={customRssFeeds}
      onSetCustomRssFeeds={setCustomRssFeeds}
      urlOrRssInput={urlOrRssInput}
      onSetUrlOrRssInput={setUrlOrRssInput}
      isExtractingInput={isExtractingInput}
      onAddUrlOrRss={handleAddUrlOrRss}
      showRssManager={showRssManager}
      onSetShowRssManager={setShowRssManager}
      selectedCandidateIds={selectedCandidateIds}
      onSetSelectedCandidateIds={setSelectedCandidateIds}
      isAcceptingBatch={isAcceptingBatch}
      acceptingSingleId={acceptingSingleId}
      onQueueSelectedToDrafts={handleQueueSelectedToDrafts}
      onMoveSingleToDraft={handleMoveSingleToDraft}
      onDismissCandidate={handleDismissCandidate}
      onRunBackgroundGatherer={runBackgroundGatherer}
      expandedCandidateId={expandedCandidateId}
      onOpenAndHydrateCandidate={handleOpenAndHydrateCandidate}
      onCollapseCandidate={() => setExpandedCandidateId(null)}
      activeOutlineSlideIdx={activeOutlineSlideIdx}
      onSetActiveOutlineSlideIdx={setActiveOutlineSlideIdx}
      onUpdateCandidateDeck={updateCandidateDeck}
      onUpdateCandidateAngle={handleUpdateCandidateAngle}
      hydratingCandidateId={hydratingCandidateId}
      regeneratingSlideKey={regeneratingSlideKey}
      onRegenerateSingleSlide={handleRegenerateSingleCandidateSlide}
      onLoadCandidateIntoStudio={onLoadCandidateIntoStudio}
      onShowToast={onShowToast}
    />
  );
};
