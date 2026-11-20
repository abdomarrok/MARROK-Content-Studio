import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CarouselData,
  FeedHealthStatus,
  PostFormat,
  SavedPostRecord,
  ThemePalette,
  TriageDecisionRecord,
  TriageSkipReason,
} from '../../types.ts';
import {
  acceptGatheredCandidatesToDrafts,
  buildLightweightLazyCandidate,
  extractArticleFromUrl,
  fetchTopicRadar,
  fetchTriageDecisions,
  GatheredCandidatePost,
  generateGatheredCandidatesInBackground,
  getSavedCustomRssFeeds,
  hydrateCandidateDeckOnDemand,
  logTriageDecision,
  reEvaluateCandidateQuality,
  regenerateSingleCandidateSlideWithAi,
  saveCustomRssFeeds,
  undoTriageDecision,
} from '../../lib/gather/gatherClient.ts';
import {
  computeCalibratedTopicScore,
  isSingleMetricUnverified,
  validateUserSubmittedUrl,
} from '../../lib/gather/inboxEngine.ts';
import {
  InboxUndoEntry,
  SnoozeDuration,
  TopicRadarGatherView,
} from './review/TopicRadarGatherView.tsx';

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

const SKIP_REASON_LABELS: Record<TriageSkipReason, string> = {
  'off-topic': 'Off-topic',
  'too-basic': 'Too basic',
  'already-covered': 'Already covered',
  'cant-verify': "Can't verify",
  risky: 'Risky',
};

const SNOOZE_DURATIONS_MS: Record<SnoozeDuration, { ms: number; label: string }> = {
  '24h': { ms: 24 * 3600_000, label: '24 hours' },
  '3d': { ms: 3 * 24 * 3600_000, label: '3 days' },
  '7d': { ms: 7 * 24 * 3600_000, label: 'next week' },
};

function isCandidateSelectable(c: GatheredCandidatePost): boolean {
  if (c.alreadyCovered) return false;
  if (!(c.qualityGate?.passed ?? true)) return false;
  if (isSingleMetricUnverified(c.metricEvidence)) return false;
  if (c.isUntitledHook && !(c.draftTitle || '').trim()) return false;
  return true;
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
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const [candidates, setCandidates] = useState<GatheredCandidatePost[]>([]);
  const [triageDecisions, setTriageDecisions] = useState<TriageDecisionRecord[]>([]);
  const [feedStatuses, setFeedStatuses] = useState<FeedHealthStatus[]>([]);
  const [lastScannedAt, setLastScannedAt] = useState<string | null>(null);
  const [radarWarning, setRadarWarning] = useState<string | null>(null);

  const [isScanningTrends, setIsScanningTrends] = useState<boolean>(false);
  const [scanProgressLabel, setScanProgressLabel] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<'auto' | PostFormat>('auto');

  const [customRssFeeds, setCustomRssFeeds] = useState<string[]>(() =>
    getSavedCustomRssFeeds()
  );
  const [urlOrRssInput, setUrlOrRssInput] = useState<string>('');
  const [urlValidationError, setUrlValidationError] = useState<string | null>(null);
  const [isExtractingInput, setIsExtractingInput] = useState<boolean>(false);
  const [showRssManager, setShowRssManager] = useState<boolean>(false);

  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [focusedCandidateId, setFocusedCandidateId] = useState<string | null>(null);
  const [lastUndoEntry, setLastUndoEntry] = useState<InboxUndoEntry | null>(null);

  const [isAcceptingBatch, setIsAcceptingBatch] = useState<boolean>(false);
  const [acceptingSingleId, setAcceptingSingleId] = useState<string | null>(null);
  const [hydratingCandidateId, setHydratingCandidateId] = useState<string | null>(null);
  const [regeneratingSlideKey, setRegeneratingSlideKey] = useState<string | null>(null);

  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
  const [activeOutlineSlideIdx, setActiveOutlineSlideIdx] = useState<number>(0);

  const pushUndoEntry = useCallback((entry: InboxUndoEntry) => {
    setLastUndoEntry(entry);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setLastUndoEntry(null);
      }
    }, 9000);
  }, []);

  // Re-score remaining candidates in-place after a triage decision so learning is immediate
  const applyLearningToRemaining = useCallback(
    (list: GatheredCandidatePost[], nextDecisions: TriageDecisionRecord[]) => {
      return list
        .map((cand) => {
          const calibrated = computeCalibratedTopicScore(
            {
              id: cand.topic.id,
              title: cand.topic.title,
              summary: cand.topic.summary,
              url: cand.topic.url,
              score: cand.topic.score,
              extractedMetrics: cand.topic.extractedMetrics || [],
              sourceType: cand.topic.sourceType,
              sourceDomain: cand.sourceDomain,
              author: cand.topic.author,
              publishedAt: cand.topic.publishedAt,
              domainCategory: cand.topic.domainCategory,
              clusteredSources: cand.clusteredSources,
            },
            {
              isVaultDuplicate: Boolean(cand.alreadyCovered),
              triageDecisions: nextDecisions,
            }
          );
          return {
            ...cand,
            scoreBreakdown: calibrated.scoreBreakdown,
            compositeScore: calibrated.scoreBreakdown.composite,
          };
        })
        .sort((a, b) => {
          if (Boolean(a.alreadyCovered) !== Boolean(b.alreadyCovered)) {
            return a.alreadyCovered ? 1 : -1;
          }
          return b.compositeScore - a.compositeScore;
        });
    },
    []
  );

  // Lazy Inbox Gatherer: loads clustered, calibrated 5-factor trends + triage history
  const runBackgroundGatherer = useCallback(
    async (refresh = false) => {
      setIsScanningTrends(true);
      setScanProgressLabel('Scanning engineering feeds...');
      try {
        const [res, decisions] = await Promise.all([
          fetchTopicRadar({
            source: sourceFilter,
            category: domainFilter,
            refresh,
            customRssUrls: customRssFeeds,
          }),
          fetchTriageDecisions(),
        ]);

        if (!isMountedRef.current) return;
        setTriageDecisions(decisions);
        setFeedStatuses(res.feedStatuses || []);
        setLastScannedAt(res.lastScannedAt || res.fetchedAt || new Date().toISOString());
        setRadarWarning(res.warning || null);

        const generated = await generateGatheredCandidatesInBackground(
          res.topics || [],
          savedPosts,
          {
            formatOverride: formatFilter,
            lazy: true,
            triageDecisions: decisions,
            onProgress: (curr, total, title) => {
              if (!isMountedRef.current) return;
              setScanProgressLabel(
                `Ranking stories (${curr}/${total}): ${title.slice(0, 42)}...`
              );
            },
          }
        );

        if (!isMountedRef.current) return;
        setCandidates(generated);
        setFocusedCandidateId((prev) =>
          prev && generated.some((c) => c.id === prev) ? prev : generated[0]?.id || null
        );
        setSelectedCandidateIds((prev) => {
          const validIds = new Set(generated.filter(isCandidateSelectable).map((c) => c.id));
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

  const updateCandidateDeck = useCallback(
    (
      candidateId: string,
      updater: (prev: GatheredCandidatePost) => GatheredCandidatePost
    ) => {
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? reEvaluateCandidateQuality(updater(c)) : c))
      );
    },
    []
  );

  const handleUpdateCandidateHook = useCallback((candidateId: string, hookEn: string) => {
    setCandidates((prev) =>
      prev.map((c) => {
        if (c.id !== candidateId) return c;
        const nextSlides = [...(c.deck.slides || [])];
        if (nextSlides[0]) {
          nextSlides[0] = { ...nextSlides[0], enTitle: hookEn };
        }
        return reEvaluateCandidateQuality({
          ...c,
          draftTitle: hookEn,
          proposedHookEn: hookEn,
          isUntitledHook: !hookEn.trim(),
          deck: {
            ...c.deck,
            slides: nextSlides,
          },
        });
      })
    );
  }, []);

  const handleUpdateCandidateAngle = useCallback((candidateId: string, angle: string) => {
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
  }, []);

  const handleToggleMetricVerified = useCallback(
    (candidateId: string, metricId: string) => {
      setCandidates((prev) =>
        prev.map((c) => {
          if (c.id !== candidateId) return c;
          const nextMetrics = (c.metricEvidence || []).map((m) =>
            m.id === metricId ? { ...m, verified: !m.verified } : m
          );
          return reEvaluateCandidateQuality({
            ...c,
            metricEvidence: nextMetrics,
          });
        })
      );
    },
    []
  );

  const handleOpenAndHydrateCandidate = useCallback(
    async (
      candidate: GatheredCandidatePost,
      slideIndex = 0
    ): Promise<GatheredCandidatePost> => {
      setExpandedCandidateId(candidate.id);
      setActiveOutlineSlideIdx(slideIndex);
      setFocusedCandidateId(candidate.id);

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
    },
    [onShowToast]
  );

  const handleAddUrlOrRss = async () => {
    const clean = urlOrRssInput.trim();
    if (!clean) return;

    const validation = validateUserSubmittedUrl(clean);
    if (!validation.ok) {
      setUrlValidationError(validation.error);
      onShowToast(`⚠️ ${validation.error}`);
      return;
    }
    setUrlValidationError(null);

    if (validation.isRss) {
      const updated = Array.from(new Set([validation.normalizedUrl, ...customRssFeeds])).slice(
        0,
        6
      );
      setCustomRssFeeds(updated);
      saveCustomRssFeeds(updated);
      setUrlOrRssInput('');
      onShowToast(`Connected RSS source — scanning feed...`);
      void runBackgroundGatherer(true);
      return;
    }

    setIsExtractingInput(true);
    try {
      const res = await extractArticleFromUrl(validation.normalizedUrl);
      const lazyCand = buildLightweightLazyCandidate(
        res.topic,
        theme.id || 'teal',
        formatFilter,
        null,
        { savedPosts, cardRankIndex: 0, triageDecisions }
      );
      const hydratedCand = await hydrateCandidateDeckOnDemand(lazyCand, {
        useAi: true,
      });
      if (!isMountedRef.current) return;
      setCandidates((prev) => [
        hydratedCand,
        ...prev.filter((c) => c.id !== hydratedCand.id),
      ]);
      setFocusedCandidateId(hydratedCand.id);
      if (isCandidateSelectable(hydratedCand)) {
        setSelectedCandidateIds((prev) =>
          prev.includes(hydratedCand.id) ? prev : [hydratedCand.id, ...prev]
        );
      }
      setExpandedCandidateId(hydratedCand.id);
      setActiveOutlineSlideIdx(0);
      setUrlOrRssInput('');
      onShowToast(
        `✓ Extracted ${hydratedCand.deck.slides.length}-slide preview for "${(
          hydratedCand.draftTitle || res.topic.title
        ).slice(0, 38)}"`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to extract article URL';
      setUrlValidationError(msg);
      onShowToast(`⚠️ ${msg}`);
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
        `✓ Regenerated Slide ${slideIndex + 1} for "${(
          updated.draftTitle || updated.topic.title
        ).slice(0, 32)}"`
      );
    } catch (err) {
      onShowToast(
        `⚠️ ${err instanceof Error ? err.message : 'Failed to regenerate slide'}`
      );
    } finally {
      setRegeneratingSlideKey(null);
    }
  };

  const handleAddSingleToDrafts = useCallback(
    async (candidate: GatheredCandidatePost) => {
      if (isSingleMetricUnverified(candidate.metricEvidence)) {
        onShowToast(
          `⚠️ Verify "${candidate.metricEvidence[0].label}" inline against its source quote before adding to drafts.`
        );
        return;
      }

      setAcceptingSingleId(candidate.id);
      const originalIndex = candidates.findIndex((c) => c.id === candidate.id);
      try {
        const result = await acceptGatheredCandidatesToDrafts([candidate], {
          useAiUpgrade: false,
        });

        if (result.draftPosts.length > 0) {
          const decision = await logTriageDecision({
            topicId: candidate.topic.id,
            topicSignature: candidate.topic.title,
            sourceDomain: candidate.sourceDomain,
            domainCategory: candidate.topic.domainCategory,
            action: 'draft',
          });
          const nextDecisions = [decision, ...triageDecisions];
          setTriageDecisions(nextDecisions);

          setCandidates((prev) => {
            const remaining = prev.filter((c) => c.id !== candidate.id);
            const nextFocused =
              remaining[Math.min(originalIndex, Math.max(0, remaining.length - 1))]?.id || null;
            setFocusedCandidateId(nextFocused);
            return remaining;
          });
          setSelectedCandidateIds((prev) => prev.filter((id) => id !== candidate.id));

          pushUndoEntry({
            decisionId: decision.id,
            candidate,
            originalIndex: Math.max(0, originalIndex),
            action: 'draft',
            summary: `Added "${(candidate.draftTitle || candidate.topic.title).slice(0, 32)}" to drafts`,
          });

          onRefreshVault();
          onRefreshStatus();
          onMovedToDraft?.(result.draftPosts.length);
        } else if (result.failedCandidates.length > 0) {
          onShowToast(`⚠️ ${result.failedCandidates[0].error}`);
        }
      } finally {
        setAcceptingSingleId(null);
      }
    },
    [candidates, triageDecisions, onMovedToDraft, onRefreshStatus, onRefreshVault, onShowToast, pushUndoEntry]
  );

  const handleBulkAddToDrafts = async () => {
    const picked = candidates.filter(
      (c) => selectedCandidateIds.includes(c.id) && isCandidateSelectable(c)
    );
    if (picked.length === 0) {
      onShowToast('Select at least 1 ready card to add to drafts');
      return;
    }

    setIsAcceptingBatch(true);
    try {
      const result = await acceptGatheredCandidatesToDrafts(picked, {
        useAiUpgrade: false,
      });

      if (result.draftPosts.length > 0) {
        const failedTitles = new Set(result.failedCandidates.map((f) => f.title));
        const succeeded = picked.filter((c) => !failedTitles.has(c.draftTitle));
        const succeededIds = new Set(succeeded.map((c) => c.id));

        const logged = await Promise.all(
          succeeded.map((c) =>
            logTriageDecision({
              topicId: c.topic.id,
              topicSignature: c.topic.title,
              sourceDomain: c.sourceDomain,
              domainCategory: c.topic.domainCategory,
              action: 'draft',
            })
          )
        );
        setTriageDecisions((prev) => [...logged, ...prev]);

        setCandidates((prev) => prev.filter((c) => !succeededIds.has(c.id)));
        setSelectedCandidateIds((prev) => prev.filter((id) => !succeededIds.has(id)));
        onRefreshVault();
        onRefreshStatus();
        onShowToast(
          `✓ Added ${result.draftPosts.length} post(s) to drafts for human & claims verification`
        );
        onMovedToDraft?.(result.draftPosts.length);
      }

      if (result.failedCandidates.length > 0) {
        onShowToast(
          `⚠️ ${result.failedCandidates.length} card(s) blocked: ${result.failedCandidates[0].error}`
        );
      }
    } catch (err) {
      onShowToast(
        `⚠️ ${err instanceof Error ? err.message : 'Failed to add drafts'}`
      );
    } finally {
      setIsAcceptingBatch(false);
    }
  };

  const handleSkipCandidate = useCallback(
    async (candidate: GatheredCandidatePost, reason: TriageSkipReason) => {
      const originalIndex = candidates.findIndex((c) => c.id === candidate.id);
      const decision = await logTriageDecision({
        topicId: candidate.topic.id,
        topicSignature: candidate.topic.title,
        sourceDomain: candidate.sourceDomain,
        domainCategory: candidate.topic.domainCategory,
        action: 'skip',
        reason,
      });

      const nextDecisions = [decision, ...triageDecisions];
      setTriageDecisions(nextDecisions);

      setCandidates((prev) => {
        const remaining = prev.filter((c) => c.id !== candidate.id);
        const reRanked = applyLearningToRemaining(remaining, nextDecisions);
        const nextFocus =
          reRanked[Math.min(Math.max(0, originalIndex), Math.max(0, reRanked.length - 1))]?.id ||
          null;
        setFocusedCandidateId(nextFocus);
        return reRanked;
      });
      setSelectedCandidateIds((prev) => prev.filter((id) => id !== candidate.id));
      if (expandedCandidateId === candidate.id) {
        setExpandedCandidateId(null);
      }

      pushUndoEntry({
        decisionId: decision.id,
        candidate,
        originalIndex: Math.max(0, originalIndex),
        action: 'skip',
        summary: `Skipped (${SKIP_REASON_LABELS[reason]}) — "${(
          candidate.draftTitle || candidate.topic.title
        ).slice(0, 30)}"`,
      });
    },
    [candidates, triageDecisions, expandedCandidateId, applyLearningToRemaining, pushUndoEntry]
  );

  const handleSnoozeCandidate = useCallback(
    async (candidate: GatheredCandidatePost, duration: SnoozeDuration) => {
      const originalIndex = candidates.findIndex((c) => c.id === candidate.id);
      const cfg = SNOOZE_DURATIONS_MS[duration];
      const snoozeUntil = new Date(Date.now() + cfg.ms).toISOString();

      const decision = await logTriageDecision({
        topicId: candidate.topic.id,
        topicSignature: candidate.topic.title,
        sourceDomain: candidate.sourceDomain,
        domainCategory: candidate.topic.domainCategory,
        action: 'snooze',
        snoozeUntil,
      });

      const nextDecisions = [decision, ...triageDecisions];
      setTriageDecisions(nextDecisions);

      setCandidates((prev) => {
        const remaining = prev.filter((c) => c.id !== candidate.id);
        const nextFocus =
          remaining[Math.min(Math.max(0, originalIndex), Math.max(0, remaining.length - 1))]?.id ||
          null;
        setFocusedCandidateId(nextFocus);
        return remaining;
      });
      setSelectedCandidateIds((prev) => prev.filter((id) => id !== candidate.id));
      if (expandedCandidateId === candidate.id) {
        setExpandedCandidateId(null);
      }

      pushUndoEntry({
        decisionId: decision.id,
        candidate,
        originalIndex: Math.max(0, originalIndex),
        action: 'snooze',
        summary: `Snoozed for ${cfg.label} — "${(
          candidate.draftTitle || candidate.topic.title
        ).slice(0, 30)}"`,
      });
    },
    [candidates, triageDecisions, expandedCandidateId, pushUndoEntry]
  );

  const handleUndoLastTriage = useCallback(async () => {
    if (!lastUndoEntry) return;
    const entry = lastUndoEntry;
    setLastUndoEntry(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    if (entry.decisionId) {
      await undoTriageDecision(entry.decisionId);
      setTriageDecisions((prev) => prev.filter((d) => d.id !== entry.decisionId));
    }

    setCandidates((prev) => {
      if (prev.some((c) => c.id === entry.candidate.id)) return prev;
      const copy = [...prev];
      const insertAt = Math.min(entry.originalIndex, copy.length);
      copy.splice(insertAt, 0, entry.candidate);
      return copy;
    });
    setFocusedCandidateId(entry.candidate.id);
  }, [lastUndoEntry]);

  // Keyboard triage shortcuts: J/K (move), D (add to drafts), X (skip), Z (undo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'z' && lastUndoEntry) {
        e.preventDefault();
        void handleUndoLastTriage();
        return;
      }

      if (candidates.length === 0) return;

      const currentIdx = Math.max(
        0,
        candidates.findIndex((c) => c.id === focusedCandidateId)
      );
      const activeCard = candidates[currentIdx] || candidates[0];

      if (key === 'j') {
        e.preventDefault();
        const nextIdx = Math.min(candidates.length - 1, currentIdx + 1);
        setFocusedCandidateId(candidates[nextIdx]?.id || null);
      } else if (key === 'k') {
        e.preventDefault();
        const prevIdx = Math.max(0, currentIdx - 1);
        setFocusedCandidateId(candidates[prevIdx]?.id || null);
      } else if (key === 'd' && activeCard) {
        e.preventDefault();
        if (isCandidateSelectable(activeCard)) {
          void handleAddSingleToDrafts(activeCard);
        } else if (isSingleMetricUnverified(activeCard.metricEvidence)) {
          onShowToast(
            `⚠️ Verify "${activeCard.metricEvidence[0].label}" against its source quote before adding to drafts.`
          );
        } else if (activeCard.alreadyCovered) {
          onShowToast('⚠️ This topic is already covered in your Vault.');
        } else {
          onShowToast(
            `⚠️ ${activeCard.qualityGate?.blockingReasons?.[0] || 'Resolve card blocker before adding to drafts.'}`
          );
        }
      } else if (key === 'x' && activeCard) {
        e.preventDefault();
        void handleSkipCandidate(activeCard, 'off-topic');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    candidates,
    focusedCandidateId,
    lastUndoEntry,
    handleAddSingleToDrafts,
    handleSkipCandidate,
    handleUndoLastTriage,
    onShowToast,
  ]);

  return (
    <TopicRadarGatherView
      candidates={candidates}
      isScanningTrends={isScanningTrends}
      scanProgressLabel={scanProgressLabel}
      feedStatuses={feedStatuses}
      lastScannedAt={lastScannedAt}
      radarWarning={radarWarning}
      sourceFilter={sourceFilter}
      onSetSourceFilter={setSourceFilter}
      domainFilter={domainFilter}
      onSetDomainFilter={setDomainFilter}
      formatFilter={formatFilter}
      onSetFormatFilter={setFormatFilter}
      customRssFeeds={customRssFeeds}
      onSetCustomRssFeeds={setCustomRssFeeds}
      urlOrRssInput={urlOrRssInput}
      onSetUrlOrRssInput={(val) => {
        setUrlOrRssInput(val);
        if (urlValidationError) setUrlValidationError(null);
      }}
      urlValidationError={urlValidationError}
      isExtractingInput={isExtractingInput}
      onAddUrlOrRss={handleAddUrlOrRss}
      showRssManager={showRssManager}
      onSetShowRssManager={setShowRssManager}
      selectedCandidateIds={selectedCandidateIds}
      onSetSelectedCandidateIds={setSelectedCandidateIds}
      focusedCandidateId={focusedCandidateId}
      onSetFocusedCandidateId={setFocusedCandidateId}
      isAcceptingBatch={isAcceptingBatch}
      acceptingSingleId={acceptingSingleId}
      onBulkAddToDrafts={handleBulkAddToDrafts}
      onAddSingleToDrafts={handleAddSingleToDrafts}
      onSkipCandidate={handleSkipCandidate}
      onSnoozeCandidate={handleSnoozeCandidate}
      lastUndoEntry={lastUndoEntry}
      onUndoLastTriage={handleUndoLastTriage}
      onRunBackgroundGatherer={runBackgroundGatherer}
      expandedCandidateId={expandedCandidateId}
      onOpenAndHydrateCandidate={handleOpenAndHydrateCandidate}
      onCollapseCandidate={() => setExpandedCandidateId(null)}
      activeOutlineSlideIdx={activeOutlineSlideIdx}
      onSetActiveOutlineSlideIdx={setActiveOutlineSlideIdx}
      onUpdateCandidateDeck={updateCandidateDeck}
      onUpdateCandidateHook={handleUpdateCandidateHook}
      onUpdateCandidateAngle={handleUpdateCandidateAngle}
      onToggleMetricVerified={handleToggleMetricVerified}
      hydratingCandidateId={hydratingCandidateId}
      regeneratingSlideKey={regeneratingSlideKey}
      onRegenerateSingleSlide={handleRegenerateSingleCandidateSlide}
      onLoadCandidateIntoStudio={onLoadCandidateIntoStudio}
      onShowToast={onShowToast}
    />
  );
};
