import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Radar,
  RefreshCw,
  Check,
  Edit3,
  Clock,
  Calendar,
  ExternalLink,
  Sparkles,
  Layers,
  RotateCcw,
  Plus,
  ChevronDown,
  ChevronUp,
  Globe,
  CheckCircle2,
  X,
  Rss,
} from 'lucide-react';
import {
  CarouselData,
  DEFAULT_PALETTES,
  PostFormat,
  PublishTargetPlatform,
  SavedPostRecord,
  SlideData,
  ThemePalette,
} from '../../types.ts';
import {
  computePeakProgramScheduleSlots,
  DAILY_PEAK_TIME_SLOTS,
  derivePostLifecycleStage,
  formatLocalDateTimeParts,
  getLocalTodayDateStr,
  getLocalTomorrowDateStr,
  isLocalSlotInFuture,
  managePublishedPost,
  PEAK_SLOT_META,
  PeakProgramDensity,
  PeakTimeSlot,
  resolveNextFutureSlotForTime,
} from '../../lib/publish/publishClient.ts';
import {
  acceptGatheredCandidatesIntoSchedule,
  buildCandidateFromTopicSync,
  clearDismissedGatherTopicIds,
  dismissGatherTopicId,
  extractArticleFromUrl,
  fetchTopicRadar,
  GatheredCandidatePost,
  GatheredTopicItem,
  generateGatheredCandidatesInBackground,
  getSavedCustomRssFeeds,
  saveCustomRssFeeds,
} from '../../lib/gather/gatherClient.ts';
import { saveValidPost } from '../../lib/storage/postsVaultClient.ts';

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

const PLATFORM_BADGES: Record<
  PublishTargetPlatform,
  { short: string; label: string; color: string }
> = {
  instagram: { short: 'IG', label: 'Instagram', color: '#E1306C' },
  facebook: { short: 'FB', label: 'Facebook', color: '#1877F2' },
  linkedin: { short: 'LI', label: 'LinkedIn', color: '#0A66C2' },
  tiktok: { short: 'TT', label: 'TikTok', color: '#00F2FE' },
};

const DOMAIN_FILTERS = [
  { id: 'all', label: 'All Domains' },
  { id: 'AI AGENTS & MODELS', label: 'AI & LLMs' },
  { id: 'KUBERNETES & CLOUD', label: 'Cloud & K8s' },
  { id: 'DISTRIBUTED SYSTEMS', label: 'Distributed Systems' },
  { id: 'LINUX KERNEL', label: 'Linux & Kernel' },
  { id: 'REVERSE ENGINEERING', label: 'Security & RE' },
] as const;

const SOURCE_FILTERS = [
  { id: 'all', label: 'All Social & RSS Trends' },
  { id: 'reddit', label: 'Reddit Tech Trends' },
  { id: 'hn', label: 'Hacker News' },
  { id: 'lobsters', label: 'Lobsters' },
  { id: 'blogs', label: 'Engineering RSS & Blogs' },
] as const;

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
  // Default directly to 'gather' (Automated Content Gatherer Inbox) so the user immediately sees
  // newly gathered trend candidates with draft carousel titles & slide outlines — never their own existing posts.
  const [subView, setSubView] = useState<'gather' | 'peak-board'>(initialSubView);

  // Live clock (ticks every 30s so future-only slot validation stays accurate)
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNowDate(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = useMemo(() => getLocalTodayDateStr(nowDate), [nowDate]);
  const tomorrowStr = useMemo(() => getLocalTomorrowDateStr(nowDate), [nowDate]);

  // ── 1. Automated Content Gatherer State (Background Trend Scan + Auto-Generated Outlines) ──
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
  const [requeueBufferOnApprove, setRequeueBufferOnApprove] = useState<boolean>(true);
  const [isAcceptingBatch, setIsAcceptingBatch] = useState<boolean>(false);
  const [acceptingSingleId, setAcceptingSingleId] = useState<string | null>(null);

  // Per-candidate custom schedule overrides (always validated to be strictly in the future)
  const [candidateScheduleOverrides, setCandidateScheduleOverrides] = useState<
    Record<string, { datePart: string; timeShort: string; targets: PublishTargetPlatform[] }>
  >({});

  // Expanded candidate ID for inline editing of Draft Carousel Title, Slide Outlines, Theme, or Caption
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
  const [activeOutlineSlideIdx, setActiveOutlineSlideIdx] = useState<number>(0);

  // ── 2. Scheduled Peak-Hour (10 · 12 · 18) Review Board State ──
  const [boardDaysCount, setBoardDaysCount] = useState<7 | 14>(7);
  const [assigningSlotKey, setAssigningSlotKey] = useState<string | null>(null);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);

  // Inline editor for already-scheduled posts on the Peak Slots Review board
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

  // Occupied future scheduled slot keys (`YYYY-MM-DD|HH:mm`) so proposed slots never collide
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

  // Run background Content Gatherer: fetches social/RSS trends and generates draft carousel titles + slide outlines
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

  // Compute strictly future proposed peak slots (`10:00`, `12:00`, `18:00`) for all candidates
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

  // Resolves a candidate's effective schedule, strictly clamped to the future so past slots are never offered
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

    // Enforce Strict Future-Only Guard: if the user clicks 10:00 when 10:00 Today has already passed,
    // automatically roll the date to Tomorrow so we never offer a past timestamp!
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

  // Inline mutations on a GatheredCandidatePost's generated draft title, theme, caption, or slide outlines
  const updateCandidateDeck = (
    candidateId: string,
    updater: (prev: GatheredCandidatePost) => GatheredCandidatePost
  ) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? updater(c) : c))
    );
  };

  // Handle adding a direct URL or a custom RSS feed
  const handleAddUrlOrRss = async () => {
    const clean = urlOrRssInput.trim();
    if (!clean) return;

    // Check if user pasted an RSS/Atom feed URL
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
      const newCandidate = buildCandidateFromTopicSync(
        res.topic,
        theme.id || 'teal',
        formatFilter
      );
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
        `✓ Generated draft carousel & ${newCandidate.deck.slides.length}-slide outline from "${res.topic.title.slice(0, 38)}..."`
      );
    } catch (err) {
      onShowToast(
        `⚠️ ${err instanceof Error ? err.message : 'Failed to extract URL'}`
      );
    } finally {
      setIsExtractingInput(false);
    }
  };

  // Accept a single gathered candidate post directly into the user's future schedule
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

  // Accept all selected gathered candidates into the Weekly Peak Schedule
  const handleAcceptSelectedBatch = async () => {
    const picked = candidates.filter((c) => selectedCandidateIds.includes(c.id));
    if (picked.length === 0) {
      onShowToast('Select at least 1 possible post to accept into your schedule');
      return;
    }

    setIsAcceptingBatch(true);
    try {
      const payload = picked.map((candidate) => {
        const sched = getCandidateFutureSchedule(candidate.id);
        return {
          candidate,
          datePart: sched.datePart,
          timeShort: sched.timeShort,
          targets: sched.targets,
        };
      });

      const result = await acceptGatheredCandidatesIntoSchedule(payload, {
        requeueBuffer: requeueBufferOnApprove,
        scheduleImmediately: true,
      });

      const acceptedIds = new Set(picked.map((p) => p.id));
      setCandidates((prev) => prev.filter((c) => !acceptedIds.has(c.id)));
      setSelectedCandidateIds([]);
      onRefreshVault();
      onRefreshStatus();
      setSubView('peak-board');
      onShowToast(
        `✓ Accepted & scheduled ${result.scheduledPosts.length} post(s) into your upcoming 10 · 12 · 18 Peak Schedule!`
      );
    } catch (err) {
      onShowToast(
        `⚠️ ${err instanceof Error ? err.message : 'Failed to schedule batch'}`
      );
    } finally {
      setIsAcceptingBatch(false);
    }
  };

  const handleDismissCandidate = (candidate: GatheredCandidatePost) => {
    dismissGatherTopicId(candidate.topic.id);
    setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
    setSelectedCandidateIds((prev) => prev.filter((id) => id !== candidate.id));
    onShowToast(`Dismissed "${candidate.draftTitle.slice(0, 32)}"`);
  };

  // Reschedule an existing post on the Peak Slots Board to a strictly future slot
  const handleMovePostToFuturePeakSlot = async (
    post: SavedPostRecord,
    datePart: string,
    timeShort: string
  ) => {
    const safeSlot = resolveNextFutureSlotForTime(datePart, timeShort, nowDate);
    setBusyPostId(post.id);
    try {
      await managePublishedPost({
        postId: post.id,
        action: 'reschedule',
        scheduledFor: safeSlot.isoDate,
        publishTargets:
          post.publishTargets && post.publishTargets.length > 0
            ? post.publishTargets
            : ALL_PLATFORMS,
        requeueBuffer: requeueBufferOnApprove,
      });
      setAssigningSlotKey(null);
      onRefreshVault();
      onRefreshStatus();
      onShowToast(
        `✓ Scheduled "${post.title.slice(0, 28)}" for ${safeSlot.datePart} at ${safeSlot.timeShort}`
      );
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Failed to move slot'}`);
    } finally {
      setBusyPostId(null);
    }
  };

  const handleUnschedulePost = async (post: SavedPostRecord) => {
    setBusyPostId(post.id);
    try {
      await managePublishedPost({
        postId: post.id,
        action: 'unschedule',
      });
      onRefreshVault();
      onRefreshStatus();
      onShowToast(`✓ Unscheduled "${post.title.slice(0, 28)}"`);
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Failed to unschedule'}`);
    } finally {
      setBusyPostId(null);
    }
  };

  const openScheduledPostInlineEditor = (post: SavedPostRecord) => {
    if (editingScheduledPostId === post.id) {
      setEditingScheduledPostId(null);
      return;
    }
    setEditingScheduledPostId(post.id);
    setEditScheduledTitle(post.title || post.deck?.slides?.[0]?.enTitle || '');
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

  // Build 7-day or 14-day Peak-Hour Schedule Board (`10:00` · `12:00` · `18:00`)
  const peakBoardDays = useMemo(() => {
    const days: Array<{
      dateStr: string;
      dayLabel: string;
      subLabel: string;
      isToday: boolean;
      peakSlots: Record<
        PeakTimeSlot,
        {
          isFuture: boolean;
          items: Array<{ post: SavedPostRecord; stage: string; timeShort: string }>;
        }
      >;
      customSlotItems: Array<{ post: SavedPostRecord; stage: string; timeShort: string }>;
    }> = [];

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
      const customSlotItems: Array<{
        post: SavedPostRecord;
        stage: string;
        timeShort: string;
      }> = [];

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
        } else {
          customSlotItems.push({ post, stage, timeShort: parts.timeShort });
        }
      }

      days.push({
        dateStr,
        dayLabel,
        subLabel,
        isToday: i === 0,
        peakSlots,
        customSlotItems,
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
      {/* Top Sub-Navigation: 1. Automated Content Gatherer (Possible Posts) | 2. Scheduled Peak Slots (10 · 12 · 18) */}
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

      {/* ═══════════════════════════════════════════════════════════════════════════
          VIEW 1: AUTOMATED CONTENT GATHERER (POSSIBLE POSTS FROM SOCIAL & RSS TRENDS)
          Only shows newly gathered trend candidates with pre-generated draft titles &
          slide outlines — never lists your own existing saved Vault posts.
         ═══════════════════════════════════════════════════════════════════════════ */}
      {subView === 'gather' && (
        <div className="space-y-3">
          {/* Top Control Bar: Trend Source Filters + URL/RSS Input + Weekly Batch Schedule Bar */}
          <div className="rounded-2xl border border-white/10 bg-[#0b1218]/95 p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Radar className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-extrabold text-white">
                    Automated Content Gatherer — Possible Posts from Social & RSS Trends
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Scans Reddit tech communities, Hacker News, Lobsters, and RSS feeds in the background, automatically generating draft carousel titles and 8-slide outlines for you to review and accept into future peak slots.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowRssManager((prev) => !prev)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-bold text-slate-200 cursor-pointer"
                >
                  <Rss className="w-3.5 h-3.5 text-amber-400" />
                  <span>Connected Feeds ({4 + customRssFeeds.length})</span>
                </button>
                <button
                  type="button"
                  disabled={isScanningTrends}
                  onClick={() => {
                    clearDismissedGatherTopicIds();
                    void runBackgroundGatherer(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-cyan-400/35 bg-cyan-500/15 hover:bg-cyan-500/25 text-xs font-bold text-cyan-200 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanningTrends ? 'animate-spin' : ''}`} />
                  <span>{isScanningTrends ? 'Scanning...' : 'Scan Trends Now'}</span>
                </button>
              </div>
            </div>

            {/* Connected Social & RSS Sources Drawer */}
            {showRssManager && (
              <div className="p-3 rounded-xl border border-white/10 bg-black/40 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-200">
                    Active Social & Technical RSS Sources
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Auto-deduplicated against your Vault posts
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-300">
                  <span>Reddit r/programming · r/LocalLLaMA · r/devops</span>
                  <span aria-hidden="true">·</span>
                  <span>Hacker News Top Tech</span>
                  <span aria-hidden="true">·</span>
                  <span>Lobste.rs Hottest</span>
                  <span aria-hidden="true">·</span>
                  <span>Cloudflare Engineering RSS</span>
                </div>
                {customRssFeeds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
                    {customRssFeeds.map((feedUrl) => (
                      <div
                        key={feedUrl}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/10 text-[11px] font-mono text-cyan-200"
                      >
                        <span className="truncate max-w-[240px]">{feedUrl}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = customRssFeeds.filter((u) => u !== feedUrl);
                            setCustomRssFeeds(next);
                            saveCustomRssFeeds(next);
                            onShowToast('Removed custom RSS feed');
                          }}
                          className="text-slate-400 hover:text-rose-400 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Direct Article URL or Custom RSS URL Input Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-xl border border-white/10 bg-black/40">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Globe className="w-4 h-4 text-cyan-400 shrink-0 ml-1" />
                <input
                  type="url"
                  value={urlOrRssInput}
                  onChange={(e) => setUrlOrRssInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleAddUrlOrRss();
                    }
                  }}
                  placeholder="Paste any article URL (to generate a draft carousel outline) or RSS feed URL (https://.../rss)..."
                  className="w-full bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={isExtractingInput || !urlOrRssInput.trim()}
                onClick={() => void handleAddUrlOrRss()}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isExtractingInput ? 'Generating Outline...' : 'Generate Draft Outline / Add RSS'}
              </button>
            </div>

            {/* Source & Domain Filter Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
              <div className="flex flex-wrap items-center gap-1">
                {SOURCE_FILTERS.map((src) => (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => setSourceFilter(src.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      sourceFilter === src.id
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                        : 'text-slate-400 hover:text-white bg-black/30 border border-white/5'
                    }`}
                  >
                    {src.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {DOMAIN_FILTERS.map((dom) => (
                  <button
                    key={dom.id}
                    type="button"
                    onClick={() => setDomainFilter(dom.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                      domainFilter === dom.id
                        ? 'bg-white/15 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {dom.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Multi-Post Weekly Schedule Program Bar (Strictly Future Slots Only) */}
            <div className="p-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-0.5">
                    Start Date (Future Only)
                  </label>
                  <input
                    type="date"
                    min={todayStr}
                    value={programStartDate < todayStr ? todayStr : programStartDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setProgramStartDate(val < todayStr ? todayStr : val);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-0.5">
                    Daily Peak Slot Cadence
                  </label>
                  <select
                    value={programDensity}
                    onChange={(e) => setProgramDensity(e.target.value as PeakProgramDensity)}
                    className="px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-emerald-400"
                  >
                    <option value="3x-daily">3× Daily Peak (10:00 · 12:00 · 18:00)</option>
                    <option value="2x-daily">2× Daily Peak (12:00 · 18:00)</option>
                    <option value="1x-18">1× Daily Evening Prime (18:00)</option>
                    <option value="1x-12">1× Daily Midday Peak (12:00)</option>
                    <option value="1x-10">1× Daily Morning Peak (10:00)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-slate-400 mb-0.5">
                    Outline Format
                  </label>
                  <select
                    value={formatFilter}
                    onChange={(e) => setFormatFilter(e.target.value as 'auto' | PostFormat)}
                    className="px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-emerald-400"
                  >
                    <option value="auto">Auto (8-Slide Carousel / 1-Slide)</option>
                    <option value="carousel">8-Slide Carousel Outlines</option>
                    <option value="single">1-Slide Infographic Outlines</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedCandidateIds(
                      selectedCandidateIds.length === candidates.length
                        ? []
                        : candidates.map((c) => c.id)
                    )
                  }
                  className="px-2.5 py-1.5 rounded-lg border border-white/15 bg-black/40 hover:bg-white/10 text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  {selectedCandidateIds.length === candidates.length && candidates.length > 0
                    ? 'Deselect All'
                    : `Select All (${candidates.length})`}
                </button>

                <button
                  type="button"
                  disabled={isAcceptingBatch || selectedCandidateIds.length === 0}
                  onClick={() => void handleAcceptSelectedBatch()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs cursor-pointer disabled:opacity-50 shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {isAcceptingBatch
                      ? 'Scheduling into Future Slots...'
                      : `Accept & Schedule ${selectedCandidateIds.length} Post(s)`}
                  </span>
                </button>
              </div>
            </div>

            {scanProgressLabel && (
              <div className="px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-xs font-mono text-cyan-200 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span className="truncate">{scanProgressLabel}</span>
              </div>
            )}
          </div>

          {/* List of Possible Posts from Social Media & RSS Trends (With Pre-Generated Titles & Slide Outlines) */}
          {candidates.length === 0 && !isScanningTrends ? (
            <div className="rounded-2xl border border-white/10 bg-[#0b1218]/90 p-8 text-center space-y-3">
              <Radar className="w-8 h-8 text-cyan-400 mx-auto opacity-80" />
              <div className="text-sm font-bold text-white">
                All current trend candidates have been reviewed or scheduled
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Click &ldquo;Scan Trends Now&rdquo; to reset dismissed items and scan social/RSS feeds for fresh topics, or paste any article URL above.
              </p>
              <button
                type="button"
                onClick={() => {
                  clearDismissedGatherTopicIds();
                  void runBackgroundGatherer(true);
                }}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs cursor-pointer"
              >
                Scan Fresh Social & RSS Trends
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {candidates.map((candidate) => {
                const isSelected = selectedCandidateIds.includes(candidate.id);
                const isExpanded = expandedCandidateId === candidate.id;
                const sched = getCandidateFutureSchedule(candidate.id);
                const palette =
                  DEFAULT_PALETTES[candidate.themeId] || DEFAULT_PALETTES.teal;
                const slides = candidate.deck.slides || [];
                const activeSlide =
                  slides[Math.min(activeOutlineSlideIdx, Math.max(0, slides.length - 1))];

                return (
                  <div
                    key={candidate.id}
                    className={`rounded-2xl border transition-all p-4 space-y-3 ${
                      isSelected
                        ? 'border-cyan-400/45 bg-[#0d1720]/95'
                        : 'border-white/10 bg-[#0b1218]/90 hover:border-white/20'
                    }`}
                  >
                    {/* Top Row: Checkbox + Source Trend Metadata + Future Slot Controls + Accept CTA */}
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedCandidateIds((prev) =>
                              prev.includes(candidate.id)
                                ? prev.filter((id) => id !== candidate.id)
                                : [...prev, candidate.id]
                            )
                          }
                          className={`mt-1 w-5 h-5 rounded-md flex items-center justify-center border cursor-pointer shrink-0 ${
                            isSelected
                              ? 'bg-cyan-400 border-cyan-400 text-slate-950 font-bold'
                              : 'border-white/25 bg-black/40 text-transparent hover:border-white/50'
                          }`}
                          title="Select for batch schedule"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>

                        <div className="min-w-0 flex-1 space-y-1">
                          {/* Unboxed Trend Metadata Row */}
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-400">
                            <span className="text-cyan-300 font-bold">
                              {candidate.topic.sourceName}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{candidate.topic.domainCategory}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {slides.length} {slides.length === 1 ? 'Slide' : 'Slides'} Outline
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 text-slate-300">
                              <span
                                className="w-2 h-2 rounded-full inline-block"
                                style={{ backgroundColor: palette.accent }}
                              />
                              {palette.name.split(' ')[0]}
                            </span>
                            <a
                              href={candidate.topic.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-slate-400 hover:text-cyan-300 underline underline-offset-2"
                            >
                              <span>Source</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>

                          {/* Auto-Generated Draft Carousel Title */}
                          <div className="text-sm sm:text-base font-extrabold text-white leading-snug">
                            {candidate.draftTitle}
                          </div>
                          {slides[0]?.arTitle && (
                            <div
                              dir="rtl"
                              className="text-xs font-semibold text-slate-300 font-cairo"
                            >
                              {slides[0].arTitle}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right Column: Strict Future-Only Schedule Picker + Accept / Edit / Dismiss Buttons */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {/* Date Picker (Clamped to >= Today) */}
                        <input
                          type="date"
                          min={todayStr}
                          value={sched.datePart}
                          onChange={(e) =>
                            updateCandidateSchedule(candidate.id, {
                              datePart: e.target.value,
                            })
                          }
                          className="px-2 py-1 rounded-lg bg-black/60 border border-white/15 text-[11px] font-mono text-white focus:outline-none focus:border-cyan-400"
                          title="Scheduled date (future only)"
                        />

                        {/* Quick Peak Slot Buttons (10:00 | 12:00 | 18:00) — Automatically roll to Tomorrow if passed today */}
                        <div className="flex items-center gap-1 bg-black/50 p-1 rounded-lg border border-white/10">
                          {DAILY_PEAK_TIME_SLOTS.map((slot) => {
                            const isSlotFutureOnSelectedDate = isLocalSlotInFuture(
                              sched.datePart,
                              slot,
                              nowDate
                            );
                            const active = sched.timeShort === slot;
                            return (
                              <button
                                key={slot}
                                type="button"
                                onClick={() =>
                                  updateCandidateSchedule(candidate.id, {
                                    timeShort: slot,
                                  })
                                }
                                title={
                                  isSlotFutureOnSelectedDate
                                    ? `Schedule at ${slot} on ${sched.datePart}`
                                    : `${slot} has passed today — clicking schedules for Tomorrow (${tomorrowStr}) at ${slot}`
                                }
                                className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-colors cursor-pointer tabular-nums ${
                                  active
                                    ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                                    : isSlotFutureOnSelectedDate
                                    ? 'text-slate-300 hover:text-white'
                                    : 'text-slate-500 hover:text-amber-300'
                                }`}
                              >
                                {slot}
                                {!isSlotFutureOnSelectedDate && sched.datePart === todayStr
                                  ? ' (+1d)'
                                  : ''}
                              </button>
                            );
                          })}
                        </div>

                        {/* 1-Click Accept into Schedule */}
                        <button
                          type="button"
                          disabled={acceptingSingleId === candidate.id}
                          onClick={() => void handleAcceptSingleCandidate(candidate)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            {acceptingSingleId === candidate.id
                              ? 'Scheduling...'
                              : `Accept (${sched.datePart === todayStr ? 'Today' : sched.datePart === tomorrowStr ? 'Tomorrow' : sched.datePart.slice(5)} · ${sched.timeShort})`}
                          </span>
                        </button>

                        {/* Toggle Slide Outlines & Inline Editor */}
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedCandidateId(isExpanded ? null : candidate.id);
                            setActiveOutlineSlideIdx(0);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] text-xs font-semibold text-slate-200 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{isExpanded ? 'Hide Outline' : 'Edit Outline'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Dismiss Candidate */}
                        <button
                          type="button"
                          onClick={() => handleDismissCandidate(candidate)}
                          title="Dismiss this trend candidate"
                          className="p-1.5 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Always-Visible Compact Slide Outline Strip (Shows Pre-Generated Slide Titles) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
                      {slides.slice(0, 4).map((slide, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            setExpandedCandidateId(candidate.id);
                            setActiveOutlineSlideIdx(idx);
                          }}
                          className="p-2.5 rounded-xl border border-white/10 bg-black/35 hover:border-cyan-400/35 cursor-pointer transition-colors space-y-1"
                        >
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                            <span className="text-cyan-300 font-bold tabular-nums">
                              Slide {idx + 1}/{slides.length}
                            </span>
                            <span className="uppercase">{slide.type}</span>
                          </div>
                          <div className="text-xs font-bold text-slate-100 line-clamp-1">
                            {slide.enTitle}
                          </div>
                          <div className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                            {slide.enBody}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Expanded Inline Editor for Draft Carousel Title, All Slide Outlines, Theme & Caption */}
                    {isExpanded && activeSlide && (
                      <div className="p-3.5 rounded-xl border border-cyan-400/30 bg-black/50 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                          <div className="md:col-span-8">
                            <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                              Draft Carousel Title (Slide 1 Headline)
                            </label>
                            <input
                              type="text"
                              value={candidate.draftTitle}
                              onChange={(e) => {
                                const val = e.target.value;
                                updateCandidateDeck(candidate.id, (prev) => ({
                                  ...prev,
                                  draftTitle: val,
                                  deck: {
                                    ...prev.deck,
                                    slides: prev.deck.slides.map((s, i) =>
                                      i === 0 ? { ...s, enTitle: val } : s
                                    ),
                                  },
                                }));
                              }}
                              className="w-full px-3 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs font-bold text-white focus:outline-none focus:border-cyan-400"
                            />
                          </div>

                          <div className="md:col-span-4">
                            <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                              Theme Palette
                            </label>
                            <select
                              value={candidate.themeId}
                              onChange={(e) => {
                                const nextTheme = e.target.value;
                                updateCandidateDeck(candidate.id, (prev) => ({
                                  ...prev,
                                  themeId: nextTheme,
                                  deck: { ...prev.deck, theme: nextTheme },
                                }));
                              }}
                              className="w-full px-3 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
                            >
                              {Object.values(DEFAULT_PALETTES).map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Slide Selector Tabs (Slide 1 .. Slide N) */}
                        <div className="flex items-center gap-1 overflow-x-auto pb-1">
                          {slides.map((s, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setActiveOutlineSlideIdx(idx)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold cursor-pointer whitespace-nowrap ${
                                activeOutlineSlideIdx === idx
                                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                                  : 'bg-white/[0.04] text-slate-400 hover:text-white'
                              }`}
                            >
                              Slide {idx + 1}: {s.type.toUpperCase()}
                            </button>
                          ))}
                        </div>

                        {/* Active Slide Outline Fields (EN + AR) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <div>
                              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                                Slide {activeOutlineSlideIdx + 1} English Title
                              </label>
                              <input
                                type="text"
                                value={activeSlide.enTitle || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  updateCandidateDeck(candidate.id, (prev) => ({
                                    ...prev,
                                    draftTitle:
                                      activeOutlineSlideIdx === 0 ? val : prev.draftTitle,
                                    deck: {
                                      ...prev.deck,
                                      slides: prev.deck.slides.map((s, i) =>
                                        i === activeOutlineSlideIdx
                                          ? { ...s, enTitle: val }
                                          : s
                                      ),
                                    },
                                  }));
                                }}
                                className="w-full px-3 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                                Slide {activeOutlineSlideIdx + 1} English Outline Body
                              </label>
                              <textarea
                                rows={2}
                                value={activeSlide.enBody || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  updateCandidateDeck(candidate.id, (prev) => ({
                                    ...prev,
                                    deck: {
                                      ...prev.deck,
                                      slides: prev.deck.slides.map((s, i) =>
                                        i === activeOutlineSlideIdx
                                          ? { ...s, enBody: val }
                                          : s
                                      ),
                                    },
                                  }));
                                }}
                                className="w-full px-3 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div>
                              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                                Slide {activeOutlineSlideIdx + 1} Arabic Title (العنوان)
                              </label>
                              <input
                                dir="rtl"
                                type="text"
                                value={activeSlide.arTitle || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  updateCandidateDeck(candidate.id, (prev) => ({
                                    ...prev,
                                    deck: {
                                      ...prev.deck,
                                      slides: prev.deck.slides.map((s, i) =>
                                        i === activeOutlineSlideIdx
                                          ? { ...s, arTitle: val }
                                          : s
                                      ),
                                    },
                                  }));
                                }}
                                className="w-full px-3 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white font-cairo focus:outline-none focus:border-cyan-400"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                                Slide {activeOutlineSlideIdx + 1} Arabic Body (الشرح)
                              </label>
                              <textarea
                                dir="rtl"
                                rows={2}
                                value={activeSlide.arBody || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  updateCandidateDeck(candidate.id, (prev) => ({
                                    ...prev,
                                    deck: {
                                      ...prev.deck,
                                      slides: prev.deck.slides.map((s, i) =>
                                        i === activeOutlineSlideIdx
                                          ? { ...s, arBody: val }
                                          : s
                                      ),
                                    },
                                  }));
                                }}
                                className="w-full px-3 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white font-cairo focus:outline-none focus:border-cyan-400"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                          {onLoadCandidateIntoStudio ? (
                            <button
                              type="button"
                              onClick={() =>
                                onLoadCandidateIntoStudio(
                                  candidate.deck,
                                  candidate.draftTitle
                                )
                              }
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-bold text-slate-200 cursor-pointer"
                            >
                              <Layers className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Open Draft Deck in 9:16 Studio Canvas</span>
                            </button>
                          ) : (
                            <span className="text-[11px] font-mono text-slate-400">
                              Edits are saved automatically into this candidate outline
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => void handleAcceptSingleCandidate(candidate)}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>
                              Accept & Schedule for {sched.datePart} at {sched.timeShort}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════════
          VIEW 2: SCHEDULED PEAK SLOTS REVIEW BOARD (10:00 · 12:00 · 18:00)
          Strict Future-Only Guard: Passed slots on Today never offer a + Schedule button
         ═══════════════════════════════════════════════════════════════════════════ */}
      {subView === 'peak-board' && (
        <div className="rounded-2xl border border-white/10 bg-[#0b1218]/95 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-white">
                Daily Peak-Hour Schedule Review (10:00 · 12:00 · 18:00)
              </h3>
              <p className="text-xs text-slate-400">
                Review and manage your scheduled posts across the 3 daily high-engagement windows. Past windows on Today are locked so you never schedule in the past.
              </p>
            </div>

            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
              {([7, 14] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setBoardDaysCount(days)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                    boardDaysCount === days
                      ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Next {days} Days
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {peakBoardDays.map((day) => (
              <div
                key={day.dateStr}
                className={`rounded-xl border p-3.5 space-y-3 ${
                  day.isToday
                    ? 'border-cyan-400/35 bg-cyan-500/[0.04]'
                    : 'border-white/10 bg-black/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-white">
                      {day.dayLabel}
                    </span>
                    <span className="text-xs font-mono text-slate-400 tabular-nums">
                      {day.subLabel} ({day.dateStr})
                    </span>
                  </div>
                </div>

                {/* 3-Column Peak Slots Grid: 10:00 | 12:00 | 18:00 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {DAILY_PEAK_TIME_SLOTS.map((peakTime) => {
                    const slotData = day.peakSlots[peakTime];
                    const meta = PEAK_SLOT_META[peakTime];
                    const slotKey = `${day.dateStr}|${peakTime}`;

                    return (
                      <div
                        key={peakTime}
                        className={`rounded-xl border p-3 space-y-2 ${
                          !slotData.isFuture && slotData.items.length === 0
                            ? 'border-white/5 bg-black/20 opacity-60'
                            : 'border-white/10 bg-[#0b1218]/90'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-bold text-cyan-300 tabular-nums">
                            {meta.label}
                          </span>
                          {!slotData.isFuture && (
                            <span className="text-[10px] font-mono text-slate-500">
                              Window Passed
                            </span>
                          )}
                        </div>

                        {slotData.items.length > 0 ? (
                          <div className="space-y-2">
                            {slotData.items.map(({ post, stage, timeShort }) => (
                              <div
                                key={post.id}
                                className="p-2.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                                  <span className="text-emerald-300 font-bold tabular-nums">
                                    {timeShort} · {stage.toUpperCase()}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => openScheduledPostInlineEditor(post)}
                                      className="text-slate-300 hover:text-white cursor-pointer"
                                      title="Inline Edit Title & Slides"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onEditInStudio(post)}
                                      className="text-cyan-300 hover:text-white cursor-pointer"
                                      title="Open in 9:16 Studio Canvas"
                                    >
                                      <Layers className="w-3 h-3" />
                                    </button>
                                    {stage === 'scheduled' && (
                                      <button
                                        type="button"
                                        disabled={busyPostId === post.id}
                                        onClick={() => void handleUnschedulePost(post)}
                                        className="text-amber-300 hover:text-rose-300 cursor-pointer"
                                        title="Unschedule post"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div className="text-xs font-bold text-white line-clamp-2">
                                  {post.title}
                                </div>

                                {editingScheduledPostId === post.id && (
                                  <div className="pt-2 mt-2 border-t border-white/15 space-y-2">
                                    <input
                                      type="text"
                                      value={editScheduledTitle}
                                      onChange={(e) => setEditScheduledTitle(e.target.value)}
                                      className="w-full px-2 py-1 rounded bg-black/60 border border-white/15 text-xs text-white"
                                      placeholder="Post Title"
                                    />
                                    {editScheduledSlides.length > 0 && (
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-1 overflow-x-auto">
                                          {editScheduledSlides.map((_, sIdx) => (
                                            <button
                                              key={sIdx}
                                              type="button"
                                              onClick={() => setEditScheduledSlideIdx(sIdx)}
                                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                                editScheduledSlideIdx === sIdx
                                                  ? 'bg-cyan-500/30 text-cyan-200'
                                                  : 'bg-black/40 text-slate-400'
                                              }`}
                                            >
                                              S{sIdx + 1}
                                            </button>
                                          ))}
                                        </div>
                                        <input
                                          type="text"
                                          value={
                                            editScheduledSlides[editScheduledSlideIdx]?.enTitle ||
                                            ''
                                          }
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setEditScheduledSlides((prev) =>
                                              prev.map((s, idx) =>
                                                idx === editScheduledSlideIdx
                                                  ? { ...s, enTitle: val }
                                                  : s
                                              )
                                            );
                                          }}
                                          className="w-full px-2 py-1 rounded bg-black/60 border border-white/15 text-[11px] text-white"
                                        />
                                      </div>
                                    )}
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setEditingScheduledPostId(null)}
                                        className="px-2 py-1 rounded text-[10px] text-slate-300"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isSavingScheduledEdit}
                                        onClick={() => void handleSaveScheduledPostInlineEdit(post)}
                                        className="px-2.5 py-1 rounded bg-emerald-500 text-slate-950 font-bold text-[10px] cursor-pointer"
                                      >
                                        {isSavingScheduledEdit ? 'Saving...' : 'Save'}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : slotData.isFuture ? (
                          assigningSlotKey === slotKey ? (
                            <div className="space-y-1.5">
                              {candidates.length > 0 && (
                                <select
                                  defaultValue=""
                                  onChange={(e) => {
                                    const picked = candidates.find(
                                      (c) => c.id === e.target.value
                                    );
                                    if (picked) {
                                      updateCandidateSchedule(picked.id, {
                                        datePart: day.dateStr,
                                        timeShort: peakTime,
                                      });
                                      void handleAcceptSingleCandidate({
                                        ...picked,
                                      });
                                      setAssigningSlotKey(null);
                                    }
                                  }}
                                  className="w-full px-2 py-1 rounded bg-black/70 border border-cyan-400/40 text-[11px] text-white"
                                >
                                  <option value="" disabled>
                                    Pick a Gathered Trend Post...
                                  </option>
                                  {candidates.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      [Trend] {c.draftTitle.slice(0, 38)}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <button
                                type="button"
                                onClick={() => setAssigningSlotKey(null)}
                                className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAssigningSlotKey(slotKey)}
                              className="w-full py-2 rounded-lg border border-dashed border-white/15 hover:border-cyan-400/40 text-[11px] font-semibold text-slate-400 hover:text-cyan-200 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Schedule into {peakTime}</span>
                            </button>
                          )
                        ) : (
                          <div className="py-2 text-center text-[11px] font-mono text-slate-500">
                            Past window — locked
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
