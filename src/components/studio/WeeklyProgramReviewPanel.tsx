import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Radar, Clock } from 'lucide-react';
import {
  CarouselData,
  PostFormat,
  PublishTargetPlatform,
  SavedPostRecord,
  SlideData,
  ThemePalette,
} from '../../types.ts';
import {
  computePeakProgramScheduleSlots,
  derivePostLifecycleStage,
  formatLocalDateTimeParts,
  getLocalTodayDateStr,
  getLocalTomorrowDateStr,
  isLocalSlotInFuture,
  managePublishedPost,
  PeakProgramDensity,
  PeakTimeSlot,
  resolveNextFutureSlotForTime,
} from '../../lib/publish/publishClient.ts';
import {
  acceptGatheredCandidatesIntoSchedule,
  buildCandidateFromTopicSync,
  dismissGatherTopicId,
  extractArticleFromUrl,
  fetchTopicRadar,
  GatheredCandidatePost,
  generateGatheredCandidatesInBackground,
  getSavedCustomRssFeeds,
  saveCustomRssFeeds,
  synthesizeCandidateWithFullAi,
} from '../../lib/gather/gatherClient.ts';
import { saveValidPost } from '../../lib/storage/postsVaultClient.ts';
import {
  TopicRadarGatherView,
  PeakScheduleBoardView,
  PeakBoardDaySlot,
} from './review/index.ts';

interface WeeklyProgramReviewPanelProps {
  savedPosts: SavedPostRecord[];
  activeCarouselId?: string;
  theme: ThemePalette;
  initialSubView?: 'gather' | 'peak-board';
  onEditInStudio: (post: SavedPostRecord) => void;
  onLoadCandidateIntoStudio?: (deck: CarouselData, title: string) => void;
  onRefreshVault: () => void;
  onRefreshStatus: () => void;
  onShowToast: (msg: string) => void;
}

const ALL_PLATFORMS: PublishTargetPlatform[] = [
  'instagram',
  'facebook',
  'linkedin',
  'tiktok',
];

export const WeeklyProgramReviewPanel: React.FC<WeeklyProgramReviewPanelProps> = ({
  savedPosts,
  theme,
  initialSubView = 'gather',
  onEditInStudio,
  onLoadCandidateIntoStudio,
  onRefreshVault,
  onRefreshStatus,
  onShowToast,
}) => {
  const [subView, setSubView] = useState<'gather' | 'peak-board'>(initialSubView);

  // Live clock (ticks every 30s so future-only slot validation stays accurate)
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNowDate(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = useMemo(() => getLocalTodayDateStr(nowDate), [nowDate]);
  const tomorrowStr = useMemo(() => getLocalTomorrowDateStr(nowDate), [nowDate]);

  // ── 1. Content Gatherer State ──
  const [candidates, setCandidates] = useState<GatheredCandidatePost[]>([]);
  const [isScanningTrends, setIsScanningTrends] = useState<boolean>(false);
  const [scanProgressLabel, setScanProgressLabel] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<'auto' | PostFormat>('auto');

  // Connected Custom RSS Feeds & Direct Article URL Extractor
  const [customRssFeeds, setCustomRssFeeds] = useState<string[]>(() => getSavedCustomRssFeeds());
  const [urlOrRssInput, setUrlOrRssInput] = useState<string>('');
  const [isExtractingInput, setIsExtractingInput] = useState<boolean>(false);
  const [showRssManager, setShowRssManager] = useState<boolean>(false);

  // Selected candidate IDs for multi-post weekly schedule acceptance
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [programStartDate, setProgramStartDate] = useState<string>(() => getLocalTodayDateStr());
  const [programDensity, setProgramDensity] = useState<PeakProgramDensity>('3x-daily');
  const [requeueBufferOnApprove] = useState<boolean>(true);
  const [isAcceptingBatch, setIsAcceptingBatch] = useState<boolean>(false);
  const [acceptingSingleId, setAcceptingSingleId] = useState<string | null>(null);
  const [synthesizingCandidateId, setSynthesizingCandidateId] = useState<string | null>(null);

  // Per-candidate custom schedule overrides
  const [candidateScheduleOverrides, setCandidateScheduleOverrides] = useState<
    Record<string, { datePart: string; timeShort: string; targets: PublishTargetPlatform[] }>
  >({});

  // Expanded candidate ID for inline editing
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
  const [activeOutlineSlideIdx, setActiveOutlineSlideIdx] = useState<number>(0);

  // ── 2. Scheduled Peak-Hour (10 · 12 · 18) Review Board State ──
  const [boardDaysCount, setBoardDaysCount] = useState<7 | 14>(7);
  const [assigningSlotKey, setAssigningSlotKey] = useState<string | null>(null);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);

  // Inline editor for already-scheduled posts
  const [editingScheduledPostId, setEditingScheduledPostId] = useState<string | null>(null);
  const [editScheduledTitle, setEditScheduledTitle] = useState<string>('');
  const [editScheduledCaption, setEditScheduledCaption] = useState<string>('');
  const [editScheduledSlides, setEditScheduledSlides] = useState<SlideData[]>([]);
  const [editScheduledSlideIdx, setEditScheduledSlideIdx] = useState<number>(0);
  const [isSavingScheduledEdit, setIsSavingScheduledEdit] = useState<boolean>(false);

  const postsWithStage = useMemo(() => {
    const nowMs = nowDate.getTime();
    return savedPosts.map((post) => ({
      post,
      stage: derivePostLifecycleStage(post, nowMs),
    }));
  }, [savedPosts, nowDate]);

  // Occupied future scheduled slot keys (`YYYY-MM-DD|HH:mm`)
  const occupiedSlotKeys = useMemo(() => {
    const set = new Set<string>();
    for (const { post, stage } of postsWithStage) {
      if (stage === 'scheduled' && post.scheduledFor) {
        const parts = formatLocalDateTimeParts(post.scheduledFor);
        set.add(`${parts.datePart}|${parts.timeShort}`);
      }
    }
    return set;
  }, [postsWithStage]);

  // Run background Content Gatherer
  const runBackgroundGatherer = useCallback(
    async (refresh = false) => {
      setIsScanningTrends(true);
      setScanProgressLabel('Scanning social media & RSS trend feeds...');
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
            onProgress: (curr, total, title) => {
              setScanProgressLabel(
                `Generating draft carousel & slide outlines (${curr}/${total}): ${title.slice(0, 42)}...`
              );
            },
          }
        );

        setCandidates(generated);
        setSelectedCandidateIds((prev) => {
          const validPrev = prev.filter((id) => generated.some((c) => c.id === id));
          if (validPrev.length > 0) return validPrev;
          return generated.slice(0, 6).map((c) => c.id);
        });
      } catch (err) {
        onShowToast(
          `⚠️ ${err instanceof Error ? err.message : 'Failed to scan trend sources'}`
        );
      } finally {
        setIsScanningTrends(false);
        setScanProgressLabel(null);
      }
    },
    [sourceFilter, domainFilter, formatFilter, customRssFeeds, savedPosts, onShowToast]
  );

  useEffect(() => {
    void runBackgroundGatherer(false);
  }, [runBackgroundGatherer]);

  // Proposed future slots
  const proposedFutureSlotsByCandidateId = useMemo(() => {
    const orderedIds = [
      ...selectedCandidateIds,
      ...candidates.map((c) => c.id).filter((id) => !selectedCandidateIds.includes(id)),
    ];
    const safeStartDate = programStartDate < todayStr ? todayStr : programStartDate;
    const slots = computePeakProgramScheduleSlots(
      Math.max(1, orderedIds.length),
      safeStartDate,
      programDensity,
      occupiedSlotKeys,
      nowDate
    );

    const map: Record<
      string,
      { datePart: string; timeShort: string; readableLabel: string }
    > = {};
    orderedIds.forEach((id, idx) => {
      const slot = slots[idx];
      if (slot) {
        map[id] = {
          datePart: slot.datePart,
          timeShort: slot.timePart.slice(0, 5),
          readableLabel: slot.readableLabel,
        };
      }
    });
    return map;
  }, [
    selectedCandidateIds,
    candidates,
    programStartDate,
    todayStr,
    programDensity,
    occupiedSlotKeys,
    nowDate,
  ]);

  const getCandidateFutureSchedule = useCallback(
    (candidateId: string): {
      datePart: string;
      timeShort: string;
      targets: PublishTargetPlatform[];
      rolledToTomorrow: boolean;
    } => {
      const override = candidateScheduleOverrides[candidateId];
      if (override) {
        const safe = resolveNextFutureSlotForTime(
          override.datePart,
          override.timeShort,
          nowDate
        );
        return {
          datePart: safe.datePart,
          timeShort: safe.timeShort,
          targets: override.targets,
          rolledToTomorrow: safe.rolledToTomorrow,
        };
      }

      const proposed = proposedFutureSlotsByCandidateId[candidateId];
      const safe = resolveNextFutureSlotForTime(
        proposed?.datePart || todayStr,
        proposed?.timeShort || '18:00',
        nowDate
      );
      return {
        datePart: safe.datePart,
        timeShort: safe.timeShort,
        targets: ALL_PLATFORMS,
        rolledToTomorrow: safe.rolledToTomorrow,
      };
    },
    [candidateScheduleOverrides, proposedFutureSlotsByCandidateId, todayStr, nowDate]
  );

  const updateCandidateSchedule = (
    candidateId: string,
    patch: Partial<{ datePart: string; timeShort: string; targets: PublishTargetPlatform[] }>
  ) => {
    const current = getCandidateFutureSchedule(candidateId);
    const nextDate = patch.datePart !== undefined ? patch.datePart : current.datePart;
    const nextTime = patch.timeShort !== undefined ? patch.timeShort : current.timeShort;
    const nextTargets = patch.targets !== undefined ? patch.targets : current.targets;

    const validated = resolveNextFutureSlotForTime(nextDate, nextTime, nowDate);
    if (validated.rolledToTomorrow && nextDate === todayStr) {
      onShowToast(
        `${nextTime} has already passed today — automatically set to Tomorrow (${validated.datePart}) at ${validated.timeShort}`
      );
    }

    setCandidateScheduleOverrides((prev) => ({
      ...prev,
      [candidateId]: {
        datePart: validated.datePart,
        timeShort: validated.timeShort,
        targets: nextTargets,
      },
    }));

    if (!selectedCandidateIds.includes(candidateId)) {
      setSelectedCandidateIds((prev) => [...prev, candidateId]);
    }
  };

  const updateCandidateDeck = (
    candidateId: string,
    updater: (prev: GatheredCandidatePost) => GatheredCandidatePost
  ) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? updater(c) : c))
    );
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
      const initialCandidate = buildCandidateFromTopicSync(
        res.topic,
        theme.id || 'teal',
        formatFilter
      );
      const newCandidate = await synthesizeCandidateWithFullAi(initialCandidate);
      setCandidates((prev) => [
        newCandidate,
        ...prev.filter((c) => c.id !== newCandidate.id),
      ]);
      setSelectedCandidateIds((prev) =>
        prev.includes(newCandidate.id) ? prev : [newCandidate.id, ...prev]
      );
      setExpandedCandidateId(newCandidate.id);
      setActiveOutlineSlideIdx(0);
      setUrlOrRssInput('');
      onShowToast(
        `✓ Deep-synthesized ${newCandidate.deck.slides.length}-slide deck from "${res.topic.title.slice(0, 38)}..."`
      );
    } catch (err) {
      onShowToast(
        `⚠️ ${err instanceof Error ? err.message : 'Failed to extract URL'}`
      );
    } finally {
      setIsExtractingInput(false);
    }
  };

  const handleSynthesizeCandidateWithAi = async (candidate: GatheredCandidatePost) => {
    setSynthesizingCandidateId(candidate.id);
    try {
      const upgraded = await synthesizeCandidateWithFullAi(candidate);
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidate.id ? upgraded : c))
      );
      setExpandedCandidateId(candidate.id);
      setActiveOutlineSlideIdx(0);
      onShowToast(
        `✨ Deep AI Synthesis complete for "${upgraded.draftTitle.slice(0, 36)}" (${upgraded.deck.slides.length} slides)`
      );
    } catch (err) {
      onShowToast(
        `⚠️ ${err instanceof Error ? err.message : 'Deep AI synthesis failed'}`
      );
    } finally {
      setSynthesizingCandidateId(null);
    }
  };

  const handleAcceptSingleCandidate = async (candidate: GatheredCandidatePost) => {
    setAcceptingSingleId(candidate.id);
    try {
      const sched = getCandidateFutureSchedule(candidate.id);
      const result = await acceptGatheredCandidatesIntoSchedule(
        [
          {
            candidate,
            datePart: sched.datePart,
            timeShort: sched.timeShort,
            targets: sched.targets,
          },
        ],
        {
          requeueBuffer: requeueBufferOnApprove,
          scheduleImmediately: true,
        }
      );

      if (result.scheduledPosts.length > 0) {
        setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
        setSelectedCandidateIds((prev) => prev.filter((id) => id !== candidate.id));
        onRefreshVault();
        onRefreshStatus();
        onShowToast(
          `✓ Accepted & scheduled "${candidate.draftTitle.slice(0, 34)}" for ${sched.datePart} at ${sched.timeShort}`
        );
      } else if (result.failedCandidates.length > 0) {
        onShowToast(`⚠️ ${result.failedCandidates[0].error}`);
      }
    } finally {
      setAcceptingSingleId(null);
    }
  };

  const handleAcceptSelectedBatch = async () => {
    const picked = candidates.filter((c) => selectedCandidateIds.includes(c.id));
    if (picked.length === 0) {
      onShowToast('Select at least 1 possible post to accept into your schedule');
      return;
    }

    setIsAcceptingBatch(true);
    try {
      const scheduleItems = picked.map((cand) => {
        const sched = getCandidateFutureSchedule(cand.id);
        return {
          candidate: cand,
          datePart: sched.datePart,
          timeShort: sched.timeShort,
          targets: sched.targets,
        };
      });

      const result = await acceptGatheredCandidatesIntoSchedule(scheduleItems, {
        requeueBuffer: requeueBufferOnApprove,
        scheduleImmediately: true,
      });

      if (result.scheduledPosts.length > 0) {
        const acceptedIds = new Set(result.scheduledPosts.map((p) => p.id));
        setCandidates((prev) => prev.filter((c) => !acceptedIds.has(c.id)));
        setSelectedCandidateIds((prev) => prev.filter((id) => !acceptedIds.has(id)));
        onRefreshVault();
        onRefreshStatus();
        onShowToast(
          `✓ Successfully accepted & scheduled ${result.scheduledPosts.length} posts into future peak slots!`
        );
      }

      if (result.failedCandidates.length > 0) {
        onShowToast(
          `⚠️ ${result.failedCandidates.length} candidate(s) could not be scheduled: ${result.failedCandidates[0].error}`
        );
      }
    } catch (err) {
      onShowToast(
        `⚠️ ${err instanceof Error ? err.message : 'Batch scheduling failed'}`
      );
    } finally {
      setIsAcceptingBatch(false);
    }
  };

  const handleDismissCandidate = (candidateId: string) => {
    dismissGatherTopicId(candidateId);
    setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
    setSelectedCandidateIds((prev) => prev.filter((id) => id !== candidateId));
    onShowToast('Candidate dismissed from review inbox');
  };

  const handleUnschedulePost = async (post: SavedPostRecord) => {
    setBusyPostId(post.id);
    try {
      await managePublishedPost({ postId: post.id, action: 'unschedule' });
      onRefreshVault();
      onRefreshStatus();
      onShowToast(`Unscheduled "${post.title.slice(0, 32)}"`);
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Failed to unschedule post'}`);
    } finally {
      setBusyPostId(null);
    }
  };

  const openScheduledPostInlineEditor = (post: SavedPostRecord) => {
    setEditingScheduledPostId(post.id);
    setEditScheduledTitle(post.title || '');
    setEditScheduledCaption(post.deck?.caption || '');
    setEditScheduledSlides(
      (post.deck?.slides || []).map((s) => ({ ...s }))
    );
    setEditScheduledSlideIdx(0);
  };

  const handleSaveScheduledPostInlineEdit = async (post: SavedPostRecord) => {
    setIsSavingScheduledEdit(true);
    try {
      const updatedSlides = editScheduledSlides.map((s, idx) =>
        idx === 0 && editScheduledTitle.trim()
          ? { ...s, enTitle: editScheduledTitle.trim() }
          : s
      );
      await saveValidPost({
        deck: {
          ...post.deck,
          id: post.id,
          caption: editScheduledCaption,
          slides: updatedSlides,
          sourceMeta: {
            ...post.deck.sourceMeta,
            userReviewed: true,
          },
        },
        postStatus: post.postStatus === 'posted' ? 'posted' : 'validated',
        title: editScheduledTitle.trim() || post.title,
        allowOverride: true,
        userReviewed: true,
      });
      setEditingScheduledPostId(null);
      onRefreshVault();
      onShowToast(`✓ Saved changes to "${(editScheduledTitle || post.title).slice(0, 32)}"`);
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Failed to save changes'}`);
    } finally {
      setIsSavingScheduledEdit(false);
    }
  };

  // Build Peak Board Days
  const peakBoardDays: PeakBoardDaySlot[] = useMemo(() => {
    const days: PeakBoardDaySlot[] = [];
    const base = new Date(nowDate);
    base.setHours(0, 0, 0, 0);

    for (let i = 0; i < boardDaysCount; i++) {
      const dt = new Date(base);
      dt.setDate(base.getDate() + i);
      const dateStr = getLocalTodayDateStr(dt);
      const dayLabel =
        i === 0
          ? 'Today'
          : i === 1
          ? 'Tomorrow'
          : dt.toLocaleDateString('en-US', { weekday: 'long' });
      const subLabel = dt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      const peakSlots: Record<
        PeakTimeSlot,
        {
          isFuture: boolean;
          items: Array<{ post: SavedPostRecord; stage: string; timeShort: string }>;
        }
      > = {
        '10:00': {
          isFuture: isLocalSlotInFuture(dateStr, '10:00', nowDate),
          items: [],
        },
        '12:00': {
          isFuture: isLocalSlotInFuture(dateStr, '12:00', nowDate),
          items: [],
        },
        '18:00': {
          isFuture: isLocalSlotInFuture(dateStr, '18:00', nowDate),
          items: [],
        },
      };

      for (const { post, stage } of postsWithStage) {
        const refIso =
          post.scheduledFor ||
          (post.postStatus === 'posted' ? post.postedAt : undefined);
        if (!refIso) continue;
        const parts = formatLocalDateTimeParts(refIso);
        if (parts.datePart !== dateStr) continue;

        const hourNum = Number.parseInt(parts.timeShort.split(':')[0] || '18', 10);
        if (parts.timeShort === '10:00' || (hourNum >= 9 && hourNum <= 10)) {
          peakSlots['10:00'].items.push({ post, stage, timeShort: parts.timeShort });
        } else if (parts.timeShort === '12:00' || (hourNum >= 11 && hourNum <= 13)) {
          peakSlots['12:00'].items.push({ post, stage, timeShort: parts.timeShort });
        } else if (parts.timeShort === '18:00' || (hourNum >= 17 && hourNum <= 19)) {
          peakSlots['18:00'].items.push({ post, stage, timeShort: parts.timeShort });
        }
      }

      days.push({
        dateStr,
        dayLabel,
        subLabel,
        isToday: i === 0,
        peakSlots,
      });
    }

    return days;
  }, [boardDaysCount, postsWithStage, nowDate]);

  const scheduledCount = useMemo(
    () => postsWithStage.filter((x) => x.stage === 'scheduled').length,
    [postsWithStage]
  );

  return (
    <div className="space-y-3">
      {/* Top Sub-Navigation */}
      <div className="rounded-2xl border border-white/10 bg-[#0b1218]/95 p-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setSubView('gather')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              subView === 'gather'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radar className="w-3.5 h-3.5 text-cyan-400" />
            <span>1. Content Gatherer (Possible Posts from Trends)</span>
            <span className="px-1.5 py-0.5 rounded bg-black/50 text-[10px] font-mono text-cyan-200 tabular-nums">
              {candidates.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubView('peak-board')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              subView === 'peak-board'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            <span>2. Scheduled Peak Slots (10:00 · 12:00 · 18:00)</span>
            <span className="px-1.5 py-0.5 rounded bg-black/50 text-[10px] font-mono text-emerald-200 tabular-nums">
              {scheduledCount} scheduled
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
          <span>Future-Only Peak Windows:</span>
          <span className="text-cyan-300 font-bold tabular-nums">10:00</span>
          <span aria-hidden="true">·</span>
          <span className="text-emerald-300 font-bold tabular-nums">12:00</span>
          <span aria-hidden="true">·</span>
          <span className="text-amber-300 font-bold tabular-nums">18:00</span>
        </div>
      </div>

      {/* VIEW 1: AUTOMATED CONTENT GATHERER */}
      {subView === 'gather' && (
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
          programStartDate={programStartDate}
          onSetProgramStartDate={setProgramStartDate}
          todayStr={todayStr}
          programDensity={programDensity}
          onSetProgramDensity={setProgramDensity}
          isAcceptingBatch={isAcceptingBatch}
          acceptingSingleId={acceptingSingleId}
          onAcceptSelectedBatch={handleAcceptSelectedBatch}
          onAcceptSingleCandidate={handleAcceptSingleCandidate}
          onDismissCandidate={handleDismissCandidate}
          onRunBackgroundGatherer={runBackgroundGatherer}
          getCandidateFutureSchedule={getCandidateFutureSchedule}
          onUpdateCandidateSchedule={updateCandidateSchedule}
          expandedCandidateId={expandedCandidateId}
          onSetExpandedCandidateId={setExpandedCandidateId}
          activeOutlineSlideIdx={activeOutlineSlideIdx}
          onSetActiveOutlineSlideIdx={setActiveOutlineSlideIdx}
          onUpdateCandidateDeck={updateCandidateDeck}
          synthesizingCandidateId={synthesizingCandidateId}
          onSynthesizeCandidateWithAi={handleSynthesizeCandidateWithAi}
          onLoadCandidateIntoStudio={onLoadCandidateIntoStudio}
          onShowToast={onShowToast}
        />
      )}

      {/* VIEW 2: SCHEDULED PEAK SLOTS REVIEW BOARD */}
      {subView === 'peak-board' && (
        <PeakScheduleBoardView
          boardDays={peakBoardDays}
          boardDaysCount={boardDaysCount}
          onSetBoardDaysCount={setBoardDaysCount}
          assigningSlotKey={assigningSlotKey}
          onSetAssigningSlotKey={setAssigningSlotKey}
          busyPostId={busyPostId}
          candidates={candidates}
          onEditInStudio={onEditInStudio}
          onUnschedulePost={handleUnschedulePost}
          onAssignCandidateToSlot={(candidate, datePart, peakTime) => {
            updateCandidateSchedule(candidate.id, {
              datePart,
              timeShort: peakTime,
            });
            void handleAcceptSingleCandidate(candidate);
          }}
          editingScheduledPostId={editingScheduledPostId}
          editScheduledTitle={editScheduledTitle}
          editScheduledSlides={editScheduledSlides}
          editScheduledSlideIdx={editScheduledSlideIdx}
          isSavingScheduledEdit={isSavingScheduledEdit}
          onStartEditingScheduledPost={openScheduledPostInlineEditor}
          onCancelEditingScheduledPost={() => setEditingScheduledPostId(null)}
          onSaveScheduledPostEdit={handleSaveScheduledPostInlineEdit}
          onSetEditScheduledTitle={setEditScheduledTitle}
          onSetEditScheduledSlideIdx={setEditScheduledSlideIdx}
          onUpdateEditScheduledSlideTitle={(sIdx, val) => {
            setEditScheduledSlides((prev) =>
              prev.map((s, idx) => (idx === sIdx ? { ...s, enTitle: val } : s))
            );
          }}
        />
      )}
    </div>
  );
};
