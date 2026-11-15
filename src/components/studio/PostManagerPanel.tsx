import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Edit3,
  Trash2,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Search,
  Download,
  Upload,
  Check,
  X,
  Plus,
  Layers,
  List,
  CalendarDays,
  Sparkles,
  Loader2,
  Send,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  PublishTargetPlatform,
  SavedPostRecord,
  ThemePalette,
} from '../../types.ts';
import {
  diversifySavedPostVisuals,
  isBoilerplateOrLowSignalDeck,
  resynthesizeSavedPostWithDeepAi,
} from '../../lib/gather/gatherClient.ts';
import {
  buildLocalScheduledIso,
  cleanupPublishedCloudinaryMedia,
  computeWeeklyScheduleSlots,
  DAILY_PEAK_TIME_SLOTS,
  derivePostLifecycleStage,
  detectCadenceOverloadByDay,
  formatLocalDateTimeParts,
  getDefaultUpcomingTimeStr,
  getLocalTodayDateStr,
  managePublishedPost,
  PostLifecycleStage,
  resolveNextFutureSlotForTime,
  WeeklyCadencePreset,
} from '../../lib/publish/publishClient.ts';
import { evaluateGathererCandidateQuality } from '../../lib/qaChecks.ts';
import { explainArchetypeChoice } from '../../lib/synthesis/smartVisualDefaults.ts';
import { saveValidPost, syncLocalVaultAfterManage } from '../../lib/storage/postsVaultClient.ts';

interface PostManagerPanelProps {
  mode?: 'draft' | 'schedule' | 'all';
  savedPosts: SavedPostRecord[];
  activeCarouselId?: string;
  theme: ThemePalette;
  onEditInStudio: (post: SavedPostRecord) => void;
  onPublishPostNow?: (
    post: SavedPostRecord,
    targets?: PublishTargetPlatform[]
  ) => Promise<void> | void;
  publishingPostId?: string | null;
  onRefreshVault: () => void;
  onRefreshStatus: () => void;
  onShowToast: (msg: string) => void;
  onExportVaultJson?: () => void;
  onImportVaultJson?: (file: File) => void;
}

type StatusFilterTab = 'all' | 'draft' | 'scheduled' | 'posted' | 'attention';
type ManagerViewMode = 'list' | 'calendar' | 'bulk';

const PLATFORM_BADGES: Record<
  PublishTargetPlatform,
  { short: string; label: string; color: string }
> = {
  instagram: { short: 'IG', label: 'Instagram', color: '#E1306C' },
  facebook: { short: 'FB', label: 'Facebook', color: '#1877F2' },
  linkedin: { short: 'LI', label: 'LinkedIn', color: '#0A66C2' },
  tiktok: { short: 'TT', label: 'TikTok', color: '#00F2FE' },
};

const ALL_PLATFORMS: PublishTargetPlatform[] = [
  'instagram',
  'facebook',
  'linkedin',
  'tiktok',
];

function isPostHumanReviewed(post: SavedPostRecord): boolean {
  return Boolean(
    post.humanApproved === true || post.deck?.sourceMeta?.userReviewed === true
  );
}

function isPostNumbersVerified(post: SavedPostRecord): boolean {
  return Boolean(
    post.verifiedNumbers === true || post.deck?.sourceMeta?.verifiedNumbers === true
  );
}

export const PostManagerPanel: React.FC<PostManagerPanelProps> = ({
  mode = 'all',
  savedPosts,
  activeCarouselId,
  onEditInStudio,
  onPublishPostNow,
  publishingPostId,
  onRefreshVault,
  onRefreshStatus,
  onShowToast,
  onExportVaultJson,
  onImportVaultJson,
}) => {
  const [statusTab, setStatusTab] = useState<StatusFilterTab>(() =>
    mode === 'draft' ? 'draft' : mode === 'schedule' ? 'scheduled' : 'all'
  );
  const [viewMode, setViewMode] = useState<ManagerViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [calendarDaysCount, setCalendarDaysCount] = useState<7 | 14>(7);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode === 'draft') {
      setViewMode('list');
      setStatusTab('draft');
    } else if (mode === 'schedule') {
      setStatusTab((prev) =>
        prev === 'posted' || prev === 'all' ? prev : 'scheduled'
      );
    }
  }, [mode]);

  // Inline angle draft overrides + optimistic review checklist overrides + storyboard expand
  const [angleDraftById, setAngleDraftById] = useState<Record<string, string>>({});
  const [reviewOverrideById, setReviewOverrideById] = useState<
    Record<string, { userReviewed?: boolean; verifiedNumbers?: boolean }>
  >({});
  const [expandedStoryboardIds, setExpandedStoryboardIds] = useState<Record<string, boolean>>({});

  const effectiveHumanReviewed = (post: SavedPostRecord): boolean =>
    reviewOverrideById[post.id]?.userReviewed ?? isPostHumanReviewed(post);

  const effectiveNumbersVerified = (post: SavedPostRecord): boolean =>
    reviewOverrideById[post.id]?.verifiedNumbers ?? isPostNumbersVerified(post);

  // Per-post inline schedule editor state
  const [editingSchedulePostId, setEditingSchedulePostId] = useState<string | null>(null);
  const [editDateStr, setEditDateStr] = useState<string>(getLocalTodayDateStr);
  const [editTimeStr, setEditTimeStr] = useState<string>(getDefaultUpcomingTimeStr);
  const [editTargets, setEditTargets] = useState<PublishTargetPlatform[]>(ALL_PLATFORMS);
  const [requeueOnBuffer, setRequeueOnBuffer] = useState<boolean>(true);

  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);
  const [assigningDateStr, setAssigningDateStr] = useState<string | null>(null);

  // Bulk schedule state (capped/warned at 1-2 posts/day)
  const [selectedBulkIds, setSelectedBulkIds] = useState<string[]>([]);
  const [bulkCadence, setBulkCadence] = useState<WeeklyCadencePreset>('daily');
  const [bulkStartDate, setBulkStartDate] = useState<string>(getLocalTodayDateStr);
  const [bulkTimeStr, setBulkTimeStr] = useState<string>(getDefaultUpcomingTimeStr);
  const [isBulkBusy, setIsBulkBusy] = useState(false);

  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [resynthesizingPostId, setResynthesizingPostId] = useState<string | null>(null);
  const [isUpgradingAllBoilerplate, setIsUpgradingAllBoilerplate] = useState(false);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      const nextNow = Date.now();
      setNowMs(nextNow);
      const hasNewlyDuePost = savedPosts.some((p) => {
        if (!p.scheduledFor) return false;
        const ms = Date.parse(p.scheduledFor);
        return Number.isFinite(ms) && ms <= nextNow && p.postStatus !== 'posted';
      });
      if (hasNewlyDuePost) {
        onRefreshStatus();
        onRefreshVault();
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, [savedPosts, onRefreshStatus, onRefreshVault]);

  const postsWithStage = useMemo(() => {
    return savedPosts.map((post) => ({
      post,
      stage: derivePostLifecycleStage(post, nowMs),
    }));
  }, [savedPosts, nowMs]);

  const cadenceOverloadDays = useMemo(
    () => detectCadenceOverloadByDay(savedPosts, 2),
    [savedPosts]
  );

  const countsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const post of savedPosts) {
      const refIso =
        post.scheduledFor || (post.postStatus === 'posted' ? post.postedAt : undefined);
      if (!refIso) continue;
      const { datePart } = formatLocalDateTimeParts(refIso);
      if (!datePart) continue;
      map.set(datePart, (map.get(datePart) || 0) + 1);
    }
    return map;
  }, [savedPosts]);

  const counts = useMemo(() => {
    const acc = {
      all: postsWithStage.length,
      draft: 0,
      scheduled: 0,
      posted: 0,
      attention: 0,
    };
    for (const item of postsWithStage) {
      acc[item.stage] += 1;
    }
    return acc;
  }, [postsWithStage]);

  const reviewedReadyDrafts = useMemo(
    () =>
      postsWithStage
        .filter(
          ({ post, stage }) =>
            (stage === 'draft' || stage === 'attention') &&
            (reviewOverrideById[post.id]?.userReviewed ?? isPostHumanReviewed(post)) &&
            (reviewOverrideById[post.id]?.verifiedNumbers ?? isPostNumbersVerified(post))
        )
        .map((x) => x.post),
    [postsWithStage, reviewOverrideById]
  );

  const boilerplatePosts = useMemo(
    () => savedPosts.filter((p) => isBoilerplateOrLowSignalDeck(p.deck)),
    [savedPosts]
  );

  const calendarDays = useMemo(() => {
    const days: Array<{
      dateStr: string;
      dayLabel: string;
      subLabel: string;
      isToday: boolean;
      items: Array<{ post: SavedPostRecord; stage: PostLifecycleStage; timeShort: string }>;
    }> = [];

    const base = new Date();
    base.setHours(0, 0, 0, 0);

    for (let i = 0; i < calendarDaysCount; i++) {
      const dt = new Date(base);
      dt.setDate(base.getDate() + i);
      const dateStr = getLocalTodayDateStr(dt);
      const dayLabel =
        i === 0
          ? 'Today'
          : i === 1
          ? 'Tomorrow'
          : dt.toLocaleDateString('en-US', { weekday: 'short' });
      const subLabel = dt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      const matching = postsWithStage
        .filter(({ post }) => {
          const refIso =
            post.scheduledFor || (post.postStatus === 'posted' ? post.postedAt : undefined);
          if (!refIso) return false;
          const parts = formatLocalDateTimeParts(refIso);
          return parts.datePart === dateStr;
        })
        .map(({ post, stage }) => {
          const refIso = post.scheduledFor || post.postedAt || post.updatedAt;
          const parts = formatLocalDateTimeParts(refIso);
          return {
            post,
            stage,
            timeShort: parts.timeShort,
          };
        })
        .sort((a, b) => a.timeShort.localeCompare(b.timeShort));

      days.push({
        dateStr,
        dayLabel,
        subLabel,
        isToday: i === 0,
        items: matching,
      });
    }

    return days;
  }, [calendarDaysCount, postsWithStage]);

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return postsWithStage
      .filter(({ post, stage }) => {
        if (mode === 'draft') {
          if (stage !== 'draft' && stage !== 'attention') return false;
          if (statusTab === 'attention' && stage !== 'attention') return false;
        } else if (mode === 'schedule') {
          if (statusTab === 'scheduled' && stage !== 'scheduled') return false;
          if (statusTab === 'posted' && stage !== 'posted') return false;
          if (statusTab === 'all' && stage !== 'scheduled' && stage !== 'posted') return false;
        } else if (statusTab !== 'all' && stage !== statusTab) {
          return false;
        }
        if (!q) return true;
        const inTitle = post.title.toLowerCase().includes(q);
        const inCat = post.category.toLowerCase().includes(q);
        const inCaption = (post.deck?.caption || '').toLowerCase().includes(q);
        const inSlides = (post.deck?.slides || []).some(
          (s) =>
            (s.enTitle || '').toLowerCase().includes(q) ||
            (s.arTitle || '').toLowerCase().includes(q)
        );
        return inTitle || inCat || inCaption || inSlides;
      })
      .sort((a, b) => {
        if (statusTab === 'scheduled' && a.post.scheduledFor && b.post.scheduledFor) {
          return Date.parse(a.post.scheduledFor) - Date.parse(b.post.scheduledFor);
        }
        return Date.parse(b.post.updatedAt) - Date.parse(a.post.updatedAt);
      });
  }, [postsWithStage, mode, statusTab, searchQuery]);

  const handleToggleReviewChecklist = async (
    post: SavedPostRecord,
    patch: { userReviewed?: boolean; verifiedNumbers?: boolean; marrokAngle?: string }
  ) => {
    const nextReviewed =
      patch.userReviewed !== undefined ? patch.userReviewed : effectiveHumanReviewed(post);
    const nextVerified =
      patch.verifiedNumbers !== undefined
        ? patch.verifiedNumbers
        : effectiveNumbersVerified(post);
    const nextAngle =
      patch.marrokAngle !== undefined
        ? patch.marrokAngle
        : angleDraftById[post.id] ?? post.deck?.sourceMeta?.marrokAngle ?? '';

    setReviewOverrideById((prev) => ({
      ...prev,
      [post.id]: {
        userReviewed: nextReviewed,
        verifiedNumbers: nextVerified,
      },
    }));

    const updatedPost: SavedPostRecord = {
      ...post,
      humanApproved: nextReviewed,
      verifiedNumbers: nextVerified,
      updatedAt: new Date().toISOString(),
      deck: {
        ...post.deck,
        sourceMeta: {
          ...post.deck?.sourceMeta,
          marrokAngle: nextAngle,
          userReviewed: nextReviewed,
          humanApproved: nextReviewed,
          verifiedNumbers: nextVerified,
        },
      },
    };

    await syncLocalVaultAfterManage({ updatedPost });
    onRefreshVault();

    setBusyPostId(post.id);
    try {
      await saveValidPost({
        deck: updatedPost.deck,
        postStatus: post.postStatus === 'posted' ? 'posted' : 'validated',
        title: post.title,
        allowOverride: true,
        userReviewed: nextReviewed,
        verifiedNumbers: nextVerified,
      });
      onRefreshVault();
      onShowToast(
        nextReviewed && nextVerified
          ? `✓ Verified & ready to publish or schedule: "${post.title.slice(0, 28)}"`
          : `Saved review checklist for "${post.title.slice(0, 28)}"`
      );
    } catch (err) {
      onShowToast(
        `⚠️ ${err instanceof Error ? err.message : 'Failed to save verification flags'}`
      );
    } finally {
      setBusyPostId(null);
    }
  };

  const openScheduleEditor = (post: SavedPostRecord, defaultDateOverride?: string) => {
    setEditingSchedulePostId(post.id);
    setConfirmDeletePostId(null);
    if (defaultDateOverride) {
      setEditDateStr(defaultDateOverride);
      setEditTimeStr('18:00');
    } else if (post.scheduledFor) {
      const parts = formatLocalDateTimeParts(post.scheduledFor);
      setEditDateStr(parts.datePart);
      setEditTimeStr(parts.timeShort);
    } else {
      setEditDateStr(getLocalTodayDateStr());
      setEditTimeStr(getDefaultUpcomingTimeStr());
    }
    setEditTargets(
      post.publishTargets && post.publishTargets.length > 0
        ? post.publishTargets
        : ALL_PLATFORMS
    );
  };

  const toggleEditTarget = (platform: PublishTargetPlatform) => {
    setEditTargets((prev) =>
      prev.includes(platform)
        ? prev.length > 1
          ? prev.filter((p) => p !== platform)
          : prev
        : [...prev, platform]
    );
  };

  const handleSaveReschedule = async (
    post: SavedPostRecord,
    overrideDateStr?: string,
    overrideTimeStr?: string
  ) => {
    const humanReviewed = effectiveHumanReviewed(post);
    const numbersVerified = effectiveNumbersVerified(post);
    if (!humanReviewed || !numbersVerified) {
      onShowToast(
        '⚠️ Review Safety Gate: Confirm both "Human Reviewed" and "Claims & Numbers Verified" before scheduling.'
      );
      return;
    }

    const targetDate = overrideDateStr || editDateStr;
    const targetTime = overrideTimeStr || editTimeStr;
    const scheduledForIso = buildLocalScheduledIso(targetDate, targetTime);

    const existingOnTargetDay = countsByDay.get(targetDate) || 0;
    const isAlreadyOnTargetDay =
      post.scheduledFor && formatLocalDateTimeParts(post.scheduledFor).datePart === targetDate;
    const projectedCount = isAlreadyOnTargetDay ? existingOnTargetDay : existingOnTargetDay + 1;
    if (projectedCount > 2) {
      onShowToast(
        `⚠️ Cadence notice: ${targetDate} now has ${projectedCount} scheduled posts (above recommended 1–2/day).`
      );
    }

    const optimisticPost: SavedPostRecord = {
      ...post,
      humanApproved: true,
      verifiedNumbers: true,
      scheduledFor: scheduledForIso,
      publishTargets: editTargets,
      updatedAt: new Date().toISOString(),
    };
    await syncLocalVaultAfterManage({ updatedPost: optimisticPost });
    onRefreshVault();
    setEditingSchedulePostId(null);
    setAssigningDateStr(null);

    setBusyPostId(post.id);
    try {
      const res = await managePublishedPost({
        postId: post.id,
        action: 'reschedule',
        scheduledFor: scheduledForIso,
        publishTargets: editTargets,
        requeueBuffer: requeueOnBuffer,
        approveReviewed: true,
        verifyNumbers: true,
      });

      onRefreshVault();
      onRefreshStatus();
      onShowToast(
        res.bufferPostIds && res.bufferPostIds.length > 0
          ? `✓ Rescheduled "${post.title.slice(0, 28)}" to ${targetDate} ${targetTime} & synced Buffer`
          : `✓ Scheduled "${post.title.slice(0, 28)}" for ${targetDate} at ${targetTime}`
      );
    } catch (err) {
      await syncLocalVaultAfterManage({ updatedPost: post });
      onRefreshVault();
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Failed to reschedule post'}`);
    } finally {
      setBusyPostId(null);
    }
  };

  const handleUnscheduleToDraft = async (post: SavedPostRecord) => {
    const optimisticPost: SavedPostRecord = {
      ...post,
      scheduledFor: undefined,
      updatedAt: new Date().toISOString(),
    };
    await syncLocalVaultAfterManage({ updatedPost: optimisticPost });
    onRefreshVault();
    setEditingSchedulePostId(null);

    setBusyPostId(post.id);
    try {
      const res = await managePublishedPost({
        postId: post.id,
        action: 'unschedule',
      });
      onRefreshVault();
      onRefreshStatus();
      onShowToast(
        res.cancelledBufferIds.length > 0
          ? `✓ Schedule cancelled (${res.cancelledBufferIds.length} queued slot(s) removed) — moved to Draft`
          : `✓ Schedule cancelled — "${post.title.slice(0, 28)}" moved to Draft`
      );
    } catch (err) {
      await syncLocalVaultAfterManage({ updatedPost: post });
      onRefreshVault();
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Failed to unschedule post'}`);
    } finally {
      setBusyPostId(null);
    }
  };

  const handleCancelAndDelete = async (post: SavedPostRecord) => {
    setBusyPostId(post.id);
    try {
      const res = await managePublishedPost({
        postId: post.id,
        action: 'cancelAndDelete',
      });
      setConfirmDeletePostId(null);
      setEditingSchedulePostId(null);
      onRefreshVault();
      onRefreshStatus();
      onShowToast(
        res.cancelledBufferIds.length > 0
          ? `✓ Deleted post & cancelled ${res.cancelledBufferIds.length} Buffer queue item(s)`
          : `✓ Deleted "${post.title.slice(0, 28)}"`
      );
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Failed to delete post'}`);
    } finally {
      setBusyPostId(null);
    }
  };

  const handlePurgePostCloudinary = async (post: SavedPostRecord) => {
    setBusyPostId(post.id);
    try {
      const res = await cleanupPublishedCloudinaryMedia({ postId: post.id });
      onRefreshVault();
      onRefreshStatus();
      onShowToast(
        res.cleanedPublicIds.length > 0
          ? `✓ Purged ${res.cleanedPublicIds.length} staged Cloudinary slide asset(s)`
          : `✓ Staged Cloudinary media marked clean for "${post.title.slice(0, 28)}"`
      );
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Failed to purge Cloudinary assets'}`);
    } finally {
      setBusyPostId(null);
    }
  };

  const handleResynthesizePost = async (post: SavedPostRecord) => {
    setBusyPostId(post.id);
    setResynthesizingPostId(post.id);
    try {
      const upgraded = await resynthesizeSavedPostWithDeepAi(post);
      onRefreshVault();
      onRefreshStatus();
      onShowToast(
        `✨ Deep AI Re-Synthesized "${upgraded.title.slice(0, 32)}" with diverse graphics`
      );
    } catch (err) {
      onShowToast(
        `⚠️ ${err instanceof Error ? err.message : 'Failed to re-synthesize post'}`
      );
    } finally {
      setBusyPostId(null);
      setResynthesizingPostId(null);
    }
  };

  const handleDiversifyPostVisuals = async (post: SavedPostRecord) => {
    setBusyPostId(post.id);
    try {
      await diversifySavedPostVisuals(post);
      onRefreshVault();
      onShowToast(
        `✓ Diversified Slides 2–7 across Compare, Code, Metric & Schematic diagrams for "${post.title.slice(0, 28)}"`
      );
    } catch (err) {
      onShowToast(
        `⚠️ ${err instanceof Error ? err.message : 'Failed to diversify post visuals'}`
      );
    } finally {
      setBusyPostId(null);
    }
  };

  const handleUpgradeAllBoilerplatePosts = async () => {
    if (boilerplatePosts.length === 0) return;
    setIsUpgradingAllBoilerplate(true);
    let count = 0;
    try {
      for (const post of boilerplatePosts) {
        setResynthesizingPostId(post.id);
        await resynthesizeSavedPostWithDeepAi(post);
        count += 1;
      }
      onRefreshVault();
      onRefreshStatus();
      onShowToast(
        `✨ Upgraded ${count} post(s) with deep article scraping & diverse graphics`
      );
    } catch (err) {
      onShowToast(
        `⚠️ ${err instanceof Error ? err.message : 'Batch upgrade encountered an error'}`
      );
    } finally {
      setResynthesizingPostId(null);
      setIsUpgradingAllBoilerplate(false);
    }
  };

  const bulkSlots = useMemo(
    () =>
      computeWeeklyScheduleSlots(
        Math.max(1, selectedBulkIds.length),
        bulkStartDate,
        bulkCadence,
        bulkTimeStr,
        { skipPast: true }
      ),
    [selectedBulkIds.length, bulkStartDate, bulkCadence, bulkTimeStr]
  );

  const handleApplyBulkSchedule = async () => {
    const selectedRecords = selectedBulkIds
      .map((id) => reviewedReadyDrafts.find((p) => p.id === id))
      .filter((p): p is SavedPostRecord => Boolean(p));

    if (selectedRecords.length === 0) {
      onShowToast(
        'Select at least 1 Human Reviewed & Claims Verified draft to schedule'
      );
      return;
    }

    for (let i = 0; i < selectedRecords.length; i++) {
      const post = selectedRecords[i];
      const slot = bulkSlots[i];
      const dueIso = slot?.isoDate || buildLocalScheduledIso(bulkStartDate, bulkTimeStr);
      await syncLocalVaultAfterManage({
        updatedPost: {
          ...post,
          humanApproved: true,
          verifiedNumbers: true,
          scheduledFor: dueIso,
          publishTargets: ALL_PLATFORMS,
          updatedAt: new Date().toISOString(),
        },
      });
    }
    onRefreshVault();
    setViewMode('calendar');

    setIsBulkBusy(true);
    try {
      for (let i = 0; i < selectedRecords.length; i++) {
        const post = selectedRecords[i];
        const slot = bulkSlots[i];
        const dueIso = slot?.isoDate || buildLocalScheduledIso(bulkStartDate, bulkTimeStr);
        await managePublishedPost({
          postId: post.id,
          action: 'reschedule',
          scheduledFor: dueIso,
          publishTargets: ALL_PLATFORMS,
          requeueBuffer: true,
          approveReviewed: true,
          verifyNumbers: true,
        });
      }

      onRefreshVault();
      onRefreshStatus();
      onShowToast(
        `✓ Scheduled ${selectedRecords.length} verified post(s) onto your calendar`
      );
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Bulk schedule failed'}`);
    } finally {
      setIsBulkBusy(false);
    }
  };

  const draftAndReviewCount = counts.draft + counts.attention;

  return (
    <div
      className="flex-1 flex flex-col min-h-0 gap-3 overflow-y-auto"
      data-testid={mode === 'draft' ? 'draft-manager-panel' : 'schedule-manager-panel'}
    >
      {/* Cadence Overload Warning Banner (>2 posts/day warning in Schedule or All view) */}
      {(mode === 'schedule' || mode === 'all') && cadenceOverloadDays.length > 0 && (
        <div
          data-testid="cadence-overload-warning"
          className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-100"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
            <span>
              <strong className="font-bold">Cadence Warning (&gt;2 posts/day):</strong>{' '}
              {cadenceOverloadDays
                .map((d) => `${d.datePart} has ${d.count} posts`)
                .join(' · ')}{' '}
              — recommended cadence is 1–2 posts/day.
            </span>
          </div>
        </div>
      )}

      {/* Single Clean Control Bar */}
      <div className="rounded-xl border border-white/10 bg-[#0b1218]/95 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {mode === 'schedule' ? (
            <div className="flex flex-wrap items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'list'
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Queue ({counts.scheduled})</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'calendar'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Calendar (7/14d)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedBulkIds.length === 0) {
                    setSelectedBulkIds(reviewedReadyDrafts.slice(0, 4).map((d) => d.id));
                  }
                  setViewMode('bulk');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'bulk'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Bulk Schedule ({reviewedReadyDrafts.length} verified)</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-extrabold text-white">
                {mode === 'draft'
                  ? `Draft Review Queue (${draftAndReviewCount})`
                  : `All Posts (${counts.all})`}
              </span>
              <span className="text-slate-400">
                Verify claims &amp; numbers and confirm human review before scheduling or publishing.
              </span>
            </div>
          )}

          {/* Search + Backup JSON Actions */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {viewMode === 'list' && (
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search posts..."
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-black/40 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {onExportVaultJson && (
              <button
                type="button"
                onClick={onExportVaultJson}
                title="Export all posts as JSON backup"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 text-xs font-semibold cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Backup</span>
              </button>
            )}
            {onImportVaultJson && (
              <>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onImportVaultJson(file);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  title="Import posts from JSON backup"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 text-xs font-semibold cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Restore</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status Filter Strip (Schedule view or All view) */}
        {viewMode === 'list' && mode !== 'draft' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-white/[0.08]">
            {(mode === 'schedule'
              ? ([
                  { id: 'scheduled', label: 'Scheduled', count: counts.scheduled },
                  { id: 'posted', label: 'Posted', count: counts.posted },
                  {
                    id: 'all',
                    label: 'All Scheduled & Posted',
                    count: counts.scheduled + counts.posted,
                  },
                ] as const)
              : ([
                  { id: 'all', label: 'All', count: counts.all },
                  { id: 'draft', label: 'Drafts', count: counts.draft },
                  { id: 'scheduled', label: 'Scheduled', count: counts.scheduled },
                  { id: 'posted', label: 'Posted', count: counts.posted },
                  { id: 'attention', label: 'Needs Review', count: counts.attention },
                ] as const)
            ).map((tab) => {
              const active = statusTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap border ${
                    active
                      ? tab.id === 'attention'
                        ? 'bg-rose-500/20 text-rose-200 border-rose-400/40'
                        : tab.id === 'scheduled'
                        ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40'
                        : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                      : 'bg-black/20 text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-300">
                    · {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* CALENDAR VIEW */}
      {viewMode === 'calendar' && (
        <div className="rounded-xl border border-white/10 bg-[#0b1218]/90 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Schedule Calendar (Recommended 1–2 Posts / Day)
            </span>
            <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => setCalendarDaysCount(7)}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold cursor-pointer ${
                  calendarDaysCount === 7
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setCalendarDaysCount(14)}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold cursor-pointer ${
                  calendarDaysCount === 14
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                14 Days
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
            {calendarDays.map((day) => {
              const overCap = day.items.length > 2;
              return (
                <div
                  key={day.dateStr}
                  className={`rounded-xl border p-3 flex flex-col justify-between min-h-[160px] transition-colors ${
                    overCap
                      ? 'border-amber-400/50 bg-amber-500/[0.06]'
                      : day.isToday
                      ? 'border-emerald-400/40 bg-emerald-500/[0.05]'
                      : 'border-white/10 bg-black/30'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-1 border-b border-white/5 pb-1.5">
                      <span
                        className={`text-xs font-bold ${
                          day.isToday ? 'text-emerald-300' : 'text-white'
                        }`}
                      >
                        {day.dayLabel}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {day.subLabel}
                      </span>
                    </div>

                    {overCap && (
                      <div className="text-[10px] font-mono font-bold text-amber-300">
                        ⚠️ {day.items.length} posts (&gt;2/day cap)
                      </div>
                    )}

                    {day.items.length === 0 ? (
                      <div className="py-4 text-center text-[11px] text-slate-500">
                        Open slot (10/12/18)
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {day.items.map(({ post, stage, timeShort }) => (
                          <div
                            key={post.id}
                            className={`rounded-lg border p-2 text-xs space-y-1 ${
                              stage === 'scheduled'
                                ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
                                : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono font-bold text-[10px] tabular-nums">
                                {timeShort}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  title="Edit in Studio"
                                  onClick={() => onEditInStudio(post)}
                                  className="hover:text-white cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  title="Reschedule"
                                  onClick={() => {
                                    setViewMode('list');
                                    openScheduleEditor(post);
                                  }}
                                  className="hover:text-white cursor-pointer"
                                >
                                  <Clock className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            <div className="font-semibold truncate" title={post.title}>
                              {post.title}
                            </div>
                            {stage === 'scheduled' && (
                              <div className="flex items-center gap-1 pt-0.5">
                                {onPublishPostNow && (
                                  <button
                                    type="button"
                                    disabled={publishingPostId === post.id || busyPostId === post.id}
                                    onClick={() => void onPublishPostNow(post)}
                                    className="flex-1 py-1 px-1.5 rounded bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold cursor-pointer"
                                  >
                                    {publishingPostId === post.id ? '...' : 'Publish Now'}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={busyPostId === post.id}
                                  onClick={() => handleUnscheduleToDraft(post)}
                                  className="py-1 px-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-[10px] font-bold cursor-pointer"
                                  title="Move back to Draft"
                                >
                                  <RotateCcw className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quick "+ Schedule Verified Draft" */}
                  <div className="pt-2 mt-2 border-t border-white/5">
                    {assigningDateStr === day.dateStr ? (
                      <div className="space-y-1">
                        {reviewedReadyDrafts.length === 0 ? (
                          <div className="text-[10px] text-amber-300">
                            No reviewed &amp; claims-verified drafts ready
                          </div>
                        ) : (
                          <select
                            aria-label={`Assign verified draft to ${day.dateStr}`}
                            defaultValue=""
                            onChange={(e) => {
                              const picked = reviewedReadyDrafts.find(
                                (d) => d.id === e.target.value
                              );
                              if (picked) {
                                void handleSaveReschedule(picked, day.dateStr, '18:00');
                              }
                            }}
                            className="w-full px-2 py-1 rounded bg-black/80 border border-cyan-400/40 text-[11px] text-white focus:outline-none"
                          >
                            <option value="" disabled>
                              Pick verified draft...
                            </option>
                            {reviewedReadyDrafts.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.title.slice(0, 32)}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => setAssigningDateStr(null)}
                          className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAssigningDateStr(day.dateStr)}
                        className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[11px] font-semibold text-slate-400 hover:text-cyan-300 hover:bg-white/[0.04] transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Assign Draft</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* BULK SCHEDULE VIEW (Only Verified Drafts Allowed) */}
      {viewMode === 'bulk' && (
        <div className="rounded-xl border border-white/10 bg-[#0b1218]/90 p-4 space-y-4">
          <div className="text-xs text-slate-300">
            Only Drafts with both <strong className="text-emerald-300">Human Reviewed</strong> and{' '}
            <strong className="text-emerald-300">Claims &amp; Numbers Verified</strong> checked appear here (default safe cadence: 1 post/slot per day).
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Start Date (Local)
              </label>
              <input
                type="date"
                value={bulkStartDate}
                min={getLocalTodayDateStr()}
                onChange={(e) => setBulkStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Posting Cadence (Recommended 1–2/day)
              </label>
              <select
                value={bulkCadence}
                onChange={(e) => setBulkCadence(e.target.value as WeeklyCadencePreset)}
                className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="daily">1× Daily (Safe Default)</option>
                <option value="weekdays">Weekdays (Mon–Fri)</option>
                <option value="mon-wed-fri">Mon / Wed / Fri</option>
                <option value="tue-thu-sat">Tue / Thu / Sat</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Peak Posting Time (24h)
              </label>
              <input
                type="time"
                value={bulkTimeStr}
                onChange={(e) => setBulkTimeStr(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {reviewedReadyDrafts.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-white/15 text-center text-xs text-slate-400">
                No verified drafts yet. Open the <strong>Draft</strong> tab and check &ldquo;Human Reviewed&rdquo; + &ldquo;Claims &amp; Numbers Verified&rdquo;.
              </div>
            ) : (
              reviewedReadyDrafts.map((post) => {
                const checked = selectedBulkIds.includes(post.id);
                const orderIdx = selectedBulkIds.indexOf(post.id);
                const assignedSlot = orderIdx >= 0 ? bulkSlots[orderIdx] : null;
                return (
                  <div
                    key={post.id}
                    onClick={() =>
                      setSelectedBulkIds((prev) =>
                        prev.includes(post.id)
                          ? prev.filter((id) => id !== post.id)
                          : [...prev, post.id]
                      )
                    }
                    className={`p-3 rounded-lg border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                      checked
                        ? 'border-cyan-400/40 bg-cyan-500/10'
                        : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold ${
                          checked
                            ? 'bg-cyan-400 text-slate-950'
                            : 'border border-white/25 text-transparent'
                        }`}
                      >
                        {checked ? orderIdx + 1 : ''}
                      </div>
                      <span className="text-xs font-bold text-white truncate">
                        {post.title}
                      </span>
                    </div>
                    {assignedSlot && (
                      <span className="text-[11px] font-mono text-cyan-300 tabular-nums shrink-0">
                        {assignedSlot.datePart} · {assignedSlot.timePart.slice(0, 5)}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              disabled={isBulkBusy || selectedBulkIds.length === 0}
              onClick={handleApplyBulkSchedule}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-40"
            >
              {isBulkBusy
                ? 'Scheduling...'
                : `Schedule ${selectedBulkIds.length} Verified Draft(s)`}
            </button>
          </div>
        </div>
      )}

      {/* LIST VIEW (DRAFT REVIEW OR SCHEDULED/POSTED QUEUE) */}
      {viewMode === 'list' && (
        <div className="rounded-xl border border-white/10 bg-[#0b1218]/90 p-3 sm:p-4 space-y-2.5">
          {boilerplatePosts.length > 0 && mode === 'draft' && (
            <div
              data-testid="vault-boilerplate-upgrade-banner"
              className="rounded-lg border border-amber-400/35 bg-amber-500/10 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5"
            >
              <div className="flex items-center gap-2 text-xs text-amber-100">
                <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                <span>
                  <strong>{boilerplatePosts.length} draft(s)</strong> contain generic offline slides after Slide 1. Upgrade them with full article extraction &amp; diverse schematics.
                </span>
              </div>
              <button
                type="button"
                disabled={isUpgradingAllBoilerplate}
                onClick={() => void handleUpgradeAllBoilerplatePosts()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold transition-colors cursor-pointer disabled:opacity-50"
              >
                {isUpgradingAllBoilerplate ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Upgrading...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Deep Re-Synthesize All</span>
                  </>
                )}
              </button>
            </div>
          )}

          {filteredPosts.length === 0 ? (
            <div className="py-10 text-center space-y-2 rounded-lg border border-dashed border-white/10 bg-black/20">
              <FileText className="w-7 h-7 text-slate-500 mx-auto" />
              <div className="text-sm font-bold text-slate-200">
                {mode === 'draft'
                  ? 'No unscheduled drafts awaiting review'
                  : mode === 'schedule'
                  ? 'No scheduled or posted items yet'
                  : 'No posts match this filter'}
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                {mode === 'draft'
                  ? 'Move candidates from Inbox or save a deck from Create Studio to review and verify them here.'
                  : 'Verify a draft in Draft Review, then click Schedule or Publish Now.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredPosts.map(({ post, stage }) => {
                const isCurrentInStudio = activeCarouselId === post.id;
                const isEditingSchedule = editingSchedulePostId === post.id;
                const isConfirmingDelete = confirmDeletePostId === post.id;
                const isPostBusy =
                  busyPostId === post.id ||
                  resynthesizingPostId === post.id ||
                  publishingPostId === post.id;
                const isPostResynthesizing = resynthesizingPostId === post.id;
                const hasBoilerplateOutline = isBoilerplateOrLowSignalDeck(post.deck);

                const humanReviewed = effectiveHumanReviewed(post);
                const numbersVerified = effectiveNumbersVerified(post);
                const currentAngle =
                  angleDraftById[post.id] ?? post.deck?.sourceMeta?.marrokAngle ?? '';

                const gate = evaluateGathererCandidateQuality({
                  title: post.title,
                  draftTitle: post.deck?.slides?.[0]?.enTitle || post.title,
                  summary: post.deck?.caption || '',
                  marrokAngle: currentAngle || 'Product systems takeaway for engineering teams.',
                  deck: post.deck,
                });

                const canDispatchOrSchedule =
                  humanReviewed &&
                  numbersVerified &&
                  (stage === 'draft' || stage === 'scheduled' ? true : post.qaPassed !== false);

                const scheduleParts = post.scheduledFor
                  ? formatLocalDateTimeParts(post.scheduledFor)
                  : null;
                const effectivePostedIso =
                  post.postedAt || (stage === 'posted' ? post.scheduledFor : undefined);
                const postedParts = effectivePostedIso
                  ? formatLocalDateTimeParts(effectivePostedIso)
                  : null;

                const postTargets: PublishTargetPlatform[] =
                  post.publishTargets && post.publishTargets.length > 0
                    ? post.publishTargets
                    : ALL_PLATFORMS;

                const postFormat =
                  post.deck?.postFormat || (post.slideCount === 1 ? 'single' : 'carousel');
                const isStoryboardOpen = Boolean(expandedStoryboardIds[post.id]);
                const slides = post.deck?.slides || [];

                const targetDayLoad = (countsByDay.get(editDateStr) || 0) +
                  (post.scheduledFor &&
                  formatLocalDateTimeParts(post.scheduledFor).datePart === editDateStr
                    ? 0
                    : 1);

                return (
                  <div
                    key={post.id}
                    data-testid={`post-card-${post.id}`}
                    className={`rounded-xl border p-3.5 transition-colors space-y-2.5 ${
                      isCurrentInStudio
                        ? 'border-emerald-400/40 bg-emerald-500/[0.04]'
                        : stage === 'scheduled'
                        ? 'border-cyan-500/25 bg-cyan-500/[0.03]'
                        : stage === 'attention'
                        ? 'border-rose-500/30 bg-rose-500/[0.04]'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                      {/* Left: Title + Clean Unboxed Editorial Metadata Line */}
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono tabular-nums text-slate-400">
                          {stage === 'scheduled' && (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-300">
                              <Clock className="w-3 h-3" />
                              Scheduled
                              {scheduleParts
                                ? ` · ${scheduleParts.datePart} · ${scheduleParts.timeShort}`
                                : ''}
                            </span>
                          )}
                          {stage === 'posted' && (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" />
                              Posted{postedParts ? ` · ${postedParts.datePart}` : ''}
                            </span>
                          )}
                          {stage === 'draft' && (
                            <span className="font-bold text-slate-300">
                              {humanReviewed && numbersVerified
                                ? 'Verified Draft'
                                : 'Draft · Review Required'}
                            </span>
                          )}
                          {stage === 'attention' && (
                            <span className="inline-flex items-center gap-1 font-bold text-rose-400">
                              <AlertTriangle className="w-3 h-3" />
                              Needs Attention
                            </span>
                          )}

                          <span aria-hidden="true">·</span>
                          <span className="uppercase text-slate-300">
                            {postFormat} · {post.slideCount}s
                          </span>

                          <span aria-hidden="true">·</span>
                          <span className="text-slate-300">
                            {postTargets
                              .map((plat) => PLATFORM_BADGES[plat]?.short)
                              .filter(Boolean)
                              .join(' · ')}
                          </span>

                          {post.cloudinaryPublicIds &&
                            post.cloudinaryPublicIds.length > 0 &&
                            !post.cloudinaryCleanedAt && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="inline-flex items-center gap-1 text-sky-300">
                                  <span>Staged ({post.cloudinaryPublicIds.length})</span>
                                  {stage !== 'scheduled' && (
                                    <button
                                      type="button"
                                      disabled={isPostBusy}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handlePurgePostCloudinary(post);
                                      }}
                                      className="ml-1 underline hover:text-white cursor-pointer"
                                    >
                                      Purge
                                    </button>
                                  )}
                                </span>
                              </>
                            )}
                          {post.cloudinaryCleanedAt && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-slate-500">Staging Purged</span>
                            </>
                          )}
                          {(post.offlineDraft || post.storageEngine === 'browser-vault') && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 font-bold text-amber-300">
                                <AlertTriangle className="w-3 h-3" />
                                Offline Local Draft
                              </span>
                            </>
                          )}
                          {hasBoilerplateOutline && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 font-bold text-amber-300">
                                <AlertTriangle className="w-3 h-3" />
                                Generic Outline
                              </span>
                            </>
                          )}
                        </div>

                        <div className="text-sm font-bold text-white truncate" title={post.title}>
                          {post.title}
                        </div>
                      </div>

                      {/* Right: Action Bar */}
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        {onPublishPostNow && stage !== 'posted' && (
                          <button
                            type="button"
                            data-testid={
                              stage === 'scheduled'
                                ? `schedule-publish-now-${post.id}`
                                : `draft-publish-now-${post.id}`
                            }
                            disabled={isPostBusy || (stage !== 'scheduled' && !canDispatchOrSchedule)}
                            onClick={() => void onPublishPostNow(post, postTargets)}
                            title={
                              stage !== 'scheduled' && !canDispatchOrSchedule
                                ? 'Check both "Human Reviewed" and "Claims & Numbers Verified" before publishing'
                                : 'Publish immediately via Buffer & Zernio'
                            }
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            <Send className="w-3 h-3" />
                            <span>
                              {publishingPostId === post.id ? 'Publishing...' : 'Publish Now'}
                            </span>
                          </button>
                        )}

                        {stage !== 'posted' && (
                          <button
                            type="button"
                            data-testid={`draft-schedule-btn-${post.id}`}
                            disabled={isPostBusy || (stage !== 'scheduled' && !canDispatchOrSchedule)}
                            onClick={() =>
                              isEditingSchedule
                                ? setEditingSchedulePostId(null)
                                : openScheduleEditor(post)
                            }
                            title={
                              stage !== 'scheduled' && !canDispatchOrSchedule
                                ? 'Check both "Human Reviewed" and "Claims & Numbers Verified" before scheduling'
                                : 'Schedule or pick future peak slot'
                            }
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-bold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap ${
                              isEditingSchedule
                                ? 'border-cyan-400 bg-cyan-500/25 text-white'
                                : 'border-cyan-400/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>{stage === 'scheduled' ? 'Reschedule' : 'Schedule'}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isPostBusy}
                          onClick={() => onEditInStudio(post)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] text-slate-200 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Edit in Studio</span>
                        </button>

                        {stage !== 'posted' && (
                          <button
                            type="button"
                            data-testid={`resynthesize-post-${post.id}`}
                            disabled={isPostBusy}
                            onClick={() => void handleResynthesizePost(post)}
                            title="Re-synthesize deck with Full AI & diverse schematics"
                            className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-violet-400/30 bg-violet-500/10 hover:bg-violet-500/20 text-violet-200 text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            {isPostResynthesizing ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            <span className="hidden xl:inline">
                              {isPostResynthesizing ? 'Synthesizing...' : 'Deep AI'}
                            </span>
                          </button>
                        )}

                        {post.slideCount > 2 && stage === 'draft' && (
                          <button
                            type="button"
                            data-testid={`diversify-post-${post.id}`}
                            disabled={isPostBusy}
                            onClick={() => void handleDiversifyPostVisuals(post)}
                            title="Diversify Slides 2–7 layouts"
                            className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            <Layers className="w-3.5 h-3.5 text-cyan-300" />
                          </button>
                        )}

                        {stage === 'scheduled' && (
                          <button
                            type="button"
                            disabled={isPostBusy}
                            onClick={() => handleUnscheduleToDraft(post)}
                            title="Cancel schedule & move back to Draft"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-amber-400/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Cancel Schedule</span>
                          </button>
                        )}

                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1 bg-rose-950/60 border border-rose-500/40 rounded-md px-2 py-1">
                            <button
                              type="button"
                              disabled={isPostBusy}
                              onClick={() => handleCancelAndDelete(post)}
                              className="px-2 py-0.5 rounded bg-rose-500 hover:bg-rose-400 text-white text-[10px] font-bold cursor-pointer"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              disabled={isPostBusy}
                              onClick={() => setConfirmDeletePostId(null)}
                              className="px-1.5 py-0.5 rounded bg-white/10 text-slate-200 text-[10px] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isPostBusy}
                            onClick={() => {
                              setConfirmDeletePostId(post.id);
                              setEditingSchedulePostId(null);
                            }}
                            title="Delete from Vault"
                            className="p-1.5 rounded-md border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* MANDATORY REVIEW SAFETY GATE + MARROK ANGLE + STORYBOARD IN DRAFT */}
                    {(stage === 'draft' || stage === 'attention') && (
                      <div
                        data-testid={`draft-review-gate-${post.id}`}
                        className="pt-2.5 border-t border-white/10 space-y-2.5"
                      >
                        {/* Marrok Angle Editor */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center">
                          <div className="lg:col-span-7 flex items-center gap-2">
                            <span className="text-[10px] font-mono uppercase text-cyan-300 font-bold shrink-0">
                              Marrok Angle:
                            </span>
                            <input
                              type="text"
                              value={currentAngle}
                              onChange={(e) =>
                                setAngleDraftById((prev) => ({
                                  ...prev,
                                  [post.id]: e.target.value,
                                }))
                              }
                              onBlur={() => {
                                if (
                                  angleDraftById[post.id] !== undefined &&
                                  angleDraftById[post.id] !==
                                    (post.deck?.sourceMeta?.marrokAngle || '')
                                ) {
                                  void handleToggleReviewChecklist(post, {
                                    marrokAngle: angleDraftById[post.id],
                                  });
                                }
                              }}
                              placeholder="One line: what this means for your product / startups..."
                              className="flex-1 px-2.5 py-1 rounded-md bg-black/50 border border-white/15 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                            />
                          </div>

                          {/* 2-Checkbox Mandatory Safety Verification Gate */}
                          <div className="lg:col-span-5 flex flex-wrap items-center justify-end gap-3 text-xs">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-200 font-semibold">
                              <input
                                type="checkbox"
                                data-testid={`check-human-reviewed-${post.id}`}
                                checked={humanReviewed}
                                disabled={isPostBusy}
                                onChange={(e) =>
                                  void handleToggleReviewChecklist(post, {
                                    userReviewed: e.target.checked,
                                  })
                                }
                                className="rounded border-white/25 text-emerald-500 focus:ring-0"
                              />
                              <span>Human Reviewed</span>
                            </label>

                            <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-200 font-semibold">
                              <input
                                type="checkbox"
                                data-testid={`check-numbers-verified-${post.id}`}
                                checked={numbersVerified}
                                disabled={isPostBusy}
                                onChange={(e) =>
                                  void handleToggleReviewChecklist(post, {
                                    verifiedNumbers: e.target.checked,
                                  })
                                }
                                className="rounded border-white/25 text-emerald-500 focus:ring-0"
                              />
                              <span>Claims &amp; Numbers Verified</span>
                            </label>
                          </div>
                        </div>

                        {/* Warnings & Quality Gate Signals */}
                        {gate.isSummaryOnly && (
                          <div className="p-2 rounded-md border border-amber-500/35 bg-amber-500/10 text-[11px] text-amber-200 flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>
                              This draft overlaps heavily with the source summary — refine the Marrok angle or copy to add original engineering commentary.
                            </span>
                          </div>
                        )}
                        {!gate.passed && gate.blockingReasons.length > 0 && (
                          <div className="p-2 rounded-md border border-rose-500/35 bg-rose-500/10 text-[11px] text-rose-200 flex items-center gap-2">
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <span>{gate.blockingReasons.join(' · ')}</span>
                          </div>
                        )}

                        {/* Storyboard Layout & 1-Line Rationale Toggle */}
                        {slides.length > 0 && (
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedStoryboardIds((prev) => ({
                                  ...prev,
                                  [post.id]: !prev[post.id],
                                }))
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-300 hover:text-cyan-200 cursor-pointer"
                            >
                              {isStoryboardOpen ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                              <span>
                                {isStoryboardOpen
                                  ? 'Hide Slide Storyboard & Layout Rationale'
                                  : `View ${slides.length}-Slide Storyboard & Layout Rationale (S1: ${slides[0]?.type?.toUpperCase()})`}
                              </span>
                            </button>

                            {isStoryboardOpen && (
                              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                {slides.map((s, sIdx) => (
                                  <div
                                    key={sIdx}
                                    className="p-2 rounded-md border border-white/10 bg-black/40 text-[11px] space-y-0.5"
                                  >
                                    <div className="flex items-center justify-between font-mono text-[10px]">
                                      <span className="font-bold text-cyan-300">
                                        S{sIdx + 1} · {s.type.toUpperCase()}
                                      </span>
                                    </div>
                                    <div className="font-semibold text-white truncate">
                                      {s.enTitle || `Slide ${sIdx + 1}`}
                                    </div>
                                    <div className="text-[10px] text-slate-400 leading-snug">
                                      {s.layoutRationale ||
                                        explainArchetypeChoice(s, sIdx, slides.length)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Inline Reschedule Drawer */}
                    {isEditingSchedule && (
                      <div className="pt-2.5 border-t border-white/10 bg-black/40 rounded-lg p-3 space-y-3">
                        {targetDayLoad > 2 && (
                          <div className="px-2.5 py-1.5 rounded-md border border-amber-400/40 bg-amber-500/15 text-[11px] text-amber-200 flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                            <span>
                              Warning: Scheduling on {editDateStr} puts this day at {targetDayLoad} posts (above recommended 1–2 posts/day).
                            </span>
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                              Date (Local)
                            </label>
                            <input
                              type="date"
                              min={getLocalTodayDateStr()}
                              value={editDateStr}
                              onChange={(e) => setEditDateStr(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-md bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[10px] font-mono uppercase text-slate-400">
                                Time (24h)
                              </label>
                              <div className="flex items-center gap-1">
                                {DAILY_PEAK_TIME_SLOTS.map((pt) => (
                                  <button
                                    key={pt}
                                    type="button"
                                    onClick={() => {
                                      const nextSlot = resolveNextFutureSlotForTime(
                                        editDateStr,
                                        pt
                                      );
                                      setEditDateStr(nextSlot.datePart);
                                      setEditTimeStr(nextSlot.timeShort);
                                    }}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tabular-nums cursor-pointer ${
                                      editTimeStr === pt
                                        ? 'bg-cyan-400 text-slate-950'
                                        : 'bg-white/10 text-slate-300 hover:text-white'
                                    }`}
                                  >
                                    {pt}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <input
                              type="time"
                              value={editTimeStr}
                              onChange={(e) => {
                                const nextSlot = resolveNextFutureSlotForTime(
                                  editDateStr,
                                  e.target.value
                                );
                                setEditDateStr(nextSlot.datePart);
                                setEditTimeStr(nextSlot.timeShort);
                              }}
                              className="w-full px-3 py-1.5 rounded-md bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                              Channels
                            </label>
                            <div className="flex items-center gap-1.5">
                              {ALL_PLATFORMS.map((plat) => {
                                const active = editTargets.includes(plat);
                                const meta = PLATFORM_BADGES[plat];
                                return (
                                  <button
                                    key={plat}
                                    type="button"
                                    onClick={() => toggleEditTarget(plat)}
                                    className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold border transition-colors cursor-pointer ${
                                      active
                                        ? 'bg-cyan-500/20 text-white border-cyan-400/50'
                                        : 'bg-black/40 text-slate-500 border-white/10'
                                    }`}
                                  >
                                    {meta.short}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={requeueOnBuffer}
                              onChange={(e) => setRequeueOnBuffer(e.target.checked)}
                              className="rounded border-white/20 text-cyan-500 focus:ring-0"
                            />
                            <span>Sync updated schedule to Buffer &amp; Zernio</span>
                          </label>

                          <div className="flex items-center gap-2">
                            {stage === 'scheduled' && (
                              <button
                                type="button"
                                disabled={isPostBusy}
                                onClick={() => handleUnscheduleToDraft(post)}
                                className="px-3 py-1.5 rounded-md border border-amber-400/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 text-xs font-bold cursor-pointer"
                              >
                                Move to Draft
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isPostBusy}
                              onClick={() => handleSaveReschedule(post)}
                              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-extrabold cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{isPostBusy ? 'Saving...' : 'Save Schedule'}</span>
                            </button>
                          </div>
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
    </div>
  );
};
