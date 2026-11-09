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
} from 'lucide-react';
import type {
  PublishTargetPlatform,
  SavedPostRecord,
  ThemePalette,
} from '../../types.ts';
import {
  buildLocalScheduledIso,
  computeWeeklyScheduleSlots,
  DAILY_PEAK_TIME_SLOTS,
  derivePostLifecycleStage,
  formatLocalDateTimeParts,
  getDefaultUpcomingTimeStr,
  getLocalTodayDateStr,
  managePublishedPost,
  PostLifecycleStage,
  resolveNextFutureSlotForTime,
  WeeklyCadencePreset,
} from '../../lib/publish/publishClient.ts';
import { WeeklyProgramReviewPanel } from './WeeklyProgramReviewPanel.tsx';

interface PostManagerPanelProps {
  savedPosts: SavedPostRecord[];
  activeCarouselId?: string;
  theme: ThemePalette;
  onEditInStudio: (post: SavedPostRecord) => void;
  onRefreshVault: () => void;
  onRefreshStatus: () => void;
  onShowToast: (msg: string) => void;
  onExportVaultJson?: () => void;
  onImportVaultJson?: (file: File) => void;
}

type StatusFilterTab = 'all' | 'draft' | 'scheduled' | 'posted' | 'attention';
type ManagerViewMode = 'list' | 'program-peak' | 'calendar' | 'bulk';

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

export const PostManagerPanel: React.FC<PostManagerPanelProps> = ({
  savedPosts,
  activeCarouselId,
  theme,
  onEditInStudio,
  onRefreshVault,
  onRefreshStatus,
  onShowToast,
  onExportVaultJson,
  onImportVaultJson,
}) => {
  const [statusTab, setStatusTab] = useState<StatusFilterTab>('all');
  const [viewMode, setViewMode] = useState<ManagerViewMode>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [calendarDaysCount, setCalendarDaysCount] = useState<7 | 14>(7);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Per-post inline schedule editor state
  const [editingSchedulePostId, setEditingSchedulePostId] = useState<string | null>(null);
  const [editDateStr, setEditDateStr] = useState<string>(getLocalTodayDateStr);
  const [editTimeStr, setEditTimeStr] = useState<string>(getDefaultUpcomingTimeStr);
  const [editTargets, setEditTargets] = useState<PublishTargetPlatform[]>(ALL_PLATFORMS);
  const [requeueOnBuffer, setRequeueOnBuffer] = useState<boolean>(true);

  // Inline delete confirmation state (avoids window.confirm)
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);

  // Calendar day quick-assign draft picker state
  const [assigningDateStr, setAssigningDateStr] = useState<string | null>(null);

  // Bulk schedule state (integrated inside Posts & Calendar Manager)
  const [selectedBulkIds, setSelectedBulkIds] = useState<string[]>([]);
  const [bulkCadence, setBulkCadence] = useState<WeeklyCadencePreset>('daily');
  const [bulkStartDate, setBulkStartDate] = useState<string>(getLocalTodayDateStr);
  const [bulkTimeStr, setBulkTimeStr] = useState<string>(getDefaultUpcomingTimeStr);
  const [isBulkBusy, setIsBulkBusy] = useState(false);

  // Busy tracking per post ID
  const [busyPostId, setBusyPostId] = useState<string | null>(null);

  // Live clock tick every 15s so scheduled posts flip to 'Posted' automatically as soon as their time arrives
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

  const draftPosts = useMemo(
    () => postsWithStage.filter((x) => x.stage === 'draft').map((x) => x.post),
    [postsWithStage]
  );

  // Build upcoming 7 or 14 local calendar days starting today
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
        if (statusTab !== 'all' && stage !== statusTab) return false;
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
  }, [postsWithStage, statusTab, searchQuery]);

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
    const targetDate = overrideDateStr || editDateStr;
    const targetTime = overrideTimeStr || editTimeStr;
    const scheduledForIso = buildLocalScheduledIso(targetDate, targetTime);

    setBusyPostId(post.id);
    try {
      const res = await managePublishedPost({
        postId: post.id,
        action: 'reschedule',
        scheduledFor: scheduledForIso,
        publishTargets: editTargets,
        requeueBuffer: requeueOnBuffer,
      });

      setEditingSchedulePostId(null);
      setAssigningDateStr(null);
      onRefreshVault();
      onRefreshStatus();
      onShowToast(
        res.bufferPostIds && res.bufferPostIds.length > 0
          ? `✓ Rescheduled "${post.title.slice(0, 28)}" to ${targetDate} ${targetTime} & synced Buffer`
          : `✓ Scheduled "${post.title.slice(0, 28)}" for ${targetDate} at ${targetTime}`
      );
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Failed to reschedule post'}`);
    } finally {
      setBusyPostId(null);
    }
  };

  const handleUnscheduleToDraft = async (post: SavedPostRecord) => {
    setBusyPostId(post.id);
    try {
      const res = await managePublishedPost({
        postId: post.id,
        action: 'unschedule',
      });
      setEditingSchedulePostId(null);
      onRefreshVault();
      onRefreshStatus();
      onShowToast(
        res.cancelledBufferIds.length > 0
          ? `✓ Schedule cancelled (${res.cancelledBufferIds.length} queued slot(s) removed) — moved to Drafts`
          : `✓ Schedule cancelled — "${post.title.slice(0, 28)}" moved to Drafts`
      );
    } catch (err) {
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

  // Bulk schedule slots calculation
  const bulkSlots = useMemo(
    () =>
      computeWeeklyScheduleSlots(
        Math.max(1, selectedBulkIds.length),
        bulkStartDate,
        bulkCadence,
        bulkTimeStr
      ),
    [selectedBulkIds.length, bulkStartDate, bulkCadence, bulkTimeStr]
  );

  const handleApplyBulkSchedule = async () => {
    const selectedRecords = selectedBulkIds
      .map((id) => savedPosts.find((p) => p.id === id))
      .filter((p): p is SavedPostRecord => Boolean(p));

    if (selectedRecords.length === 0) {
      onShowToast('Select at least 1 post to bulk schedule');
      return;
    }

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
        });
      }

      onRefreshVault();
      onRefreshStatus();
      setViewMode('calendar');
      onShowToast(
        `✓ Scheduled ${selectedRecords.length} post(s) onto your calendar & synced Buffer/Zernio`
      );
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Bulk schedule failed'}`);
    } finally {
      setIsBulkBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3 overflow-y-auto">
      {/* Unified Control Bar: View Switcher (List | Calendar | Bulk) + Status Filter Pills + Search */}
      <div className="rounded-2xl border border-white/10 bg-[#0b1218]/95 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Segmented View Switcher: List vs Peak 10·12·18 & Program vs Calendar vs Bulk Schedule */}
          <div className="flex flex-wrap items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Posts List</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('program-peak')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                viewMode === 'program-peak'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Peak 10 · 12 · 18 & Program</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Calendar ({counts.scheduled})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedBulkIds.length === 0) {
                  setSelectedBulkIds(draftPosts.slice(0, 4).map((d) => d.id));
                }
                setViewMode('bulk');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                viewMode === 'bulk'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Bulk Schedule</span>
            </button>
          </div>

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
                  className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-black/40 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
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
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 text-xs font-semibold cursor-pointer shrink-0"
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
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 text-xs font-semibold cursor-pointer shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Restore</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status Filter Tabs (Shown in List View) */}
        {viewMode === 'list' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-white/10">
            {(
              [
                { id: 'all', label: 'All', count: counts.all },
                { id: 'draft', label: 'Drafts', count: counts.draft },
                { id: 'scheduled', label: 'Scheduled', count: counts.scheduled },
                { id: 'posted', label: 'Posted', count: counts.posted },
                { id: 'attention', label: 'Needs Review', count: counts.attention },
              ] as const
            ).map((tab) => {
              const active = statusTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap border ${
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
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-black/40 text-slate-200">
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* VIEW 0: PEAK (10 · 12 · 18) SCHEDULE REVIEW, WEEKLY PROGRAM & AUTO-GATHER */}
      {viewMode === 'program-peak' && (
        <WeeklyProgramReviewPanel
          savedPosts={savedPosts}
          activeCarouselId={activeCarouselId}
          theme={theme}
          onEditInStudio={onEditInStudio}
          onRefreshVault={onRefreshVault}
          onRefreshStatus={onRefreshStatus}
          onShowToast={onShowToast}
        />
      )}

      {/* VIEW 1: CALENDAR VIEW */}
      {viewMode === 'calendar' && (
        <div className="rounded-2xl border border-white/10 bg-[#0b1218]/90 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Schedule Calendar (Local Time)
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
            {calendarDays.map((day) => (
              <div
                key={day.dateStr}
                className={`rounded-xl border p-3 flex flex-col justify-between min-h-[150px] transition-colors ${
                  day.isToday
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
                    <span className="text-[11px] font-mono text-slate-400">
                      {day.subLabel}
                    </span>
                  </div>

                  {day.items.length === 0 ? (
                    <div className="py-4 text-center text-[11px] text-slate-500">
                      Open slot
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
                            <span className="font-mono font-bold text-[10px]">
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
                                title="Reschedule in List"
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
                            <button
                              type="button"
                              disabled={busyPostId === post.id}
                              onClick={() => handleUnscheduleToDraft(post)}
                              title="Cancel schedule on Buffer & Zernio and move to Drafts"
                              className="w-full mt-1 flex items-center justify-center gap-1 py-1 px-2 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-[10px] font-bold transition-colors cursor-pointer"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              <span>
                                {busyPostId === post.id ? 'Cancelling...' : 'Cancel Schedule'}
                              </span>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick "+ Schedule Draft" button for this day */}
                <div className="pt-2 mt-2 border-t border-white/5">
                  {assigningDateStr === day.dateStr ? (
                    <div className="space-y-1">
                      {draftPosts.length === 0 ? (
                        <div className="text-[10px] text-slate-400">
                          No unscheduled drafts
                        </div>
                      ) : (
                        <select
                          aria-label={`Assign draft to ${day.dateStr}`}
                          defaultValue=""
                          onChange={(e) => {
                            const picked = draftPosts.find((d) => d.id === e.target.value);
                            if (picked) {
                              void handleSaveReschedule(picked, day.dateStr, '18:00');
                            }
                          }}
                          className="w-full px-2 py-1 rounded bg-black/80 border border-cyan-400/40 text-[11px] text-white focus:outline-none"
                        >
                          <option value="" disabled>
                            Pick draft...
                          </option>
                          {draftPosts.map((d) => (
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
                      className="w-full flex items-center justify-center gap-1 py-1 rounded-lg text-[11px] font-semibold text-slate-400 hover:text-cyan-300 hover:bg-white/[0.04] transition-colors cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Schedule Draft</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 2: BULK SCHEDULE VIEW */}
      {viewMode === 'bulk' && (
        <div className="rounded-2xl border border-white/10 bg-[#0b1218]/90 p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Start Date (Local)
              </label>
              <input
                type="date"
                value={bulkStartDate}
                onChange={(e) => setBulkStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Posting Cadence
              </label>
              <select
                value={bulkCadence}
                onChange={(e) => setBulkCadence(e.target.value as WeeklyCadencePreset)}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="daily">Daily (Every Day)</option>
                <option value="weekdays">Weekdays (Mon–Fri)</option>
                <option value="mon-wed-fri">Mon / Wed / Fri</option>
                <option value="tue-thu-sat">Tue / Thu / Sat</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Posting Time (24h)
              </label>
              <input
                type="time"
                value={bulkTimeStr}
                onChange={(e) => setBulkTimeStr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {savedPosts.map((post) => {
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
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
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
                    <span className="text-[11px] font-mono text-cyan-300 shrink-0">
                      {assignedSlot.datePart} · {assignedSlot.timePart.slice(0, 5)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              disabled={isBulkBusy || selectedBulkIds.length === 0}
              onClick={handleApplyBulkSchedule}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-40"
            >
              {isBulkBusy
                ? 'Scheduling...'
                : `Schedule ${selectedBulkIds.length} Post(s) via Buffer & Zernio`}
            </button>
          </div>
        </div>
      )}

      {/* VIEW 3: CLEAN POSTS LIST */}
      {viewMode === 'list' && (
        <div className="rounded-2xl border border-white/10 bg-[#0b1218]/90 p-3 sm:p-4 space-y-2.5">
          {filteredPosts.length === 0 ? (
            <div className="py-10 text-center space-y-2 rounded-xl border border-dashed border-white/10 bg-black/20">
              <FileText className="w-6 h-6 text-slate-500 mx-auto" />
              <div className="text-xs font-bold text-slate-300">
                No posts match this filter
              </div>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                Switch status tabs above or clear your search query.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPosts.map(({ post, stage }) => {
                const isCurrentInStudio = activeCarouselId === post.id;
                const isEditingSchedule = editingSchedulePostId === post.id;
                const isConfirmingDelete = confirmDeletePostId === post.id;
                const isPostBusy = busyPostId === post.id;

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

                return (
                  <div
                    key={post.id}
                    className={`rounded-xl border p-3 transition-all space-y-2.5 ${
                      isCurrentInStudio
                        ? 'border-emerald-400/40 bg-emerald-500/[0.04]'
                        : stage === 'scheduled'
                        ? 'border-cyan-500/25 bg-cyan-500/[0.03]'
                        : stage === 'attention'
                        ? 'border-rose-500/30 bg-rose-500/[0.04]'
                        : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      {/* Left: Title + 3 Clean Metadata Pills */}
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* Pill 1: Lifecycle Status */}
                          {stage === 'scheduled' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold tabular-nums bg-amber-500/20 text-amber-200 border border-amber-400/40">
                              <Clock className="w-2.5 h-2.5" />
                              Scheduled
                              {scheduleParts
                                ? ` · ${scheduleParts.datePart} · ${scheduleParts.timeShort}`
                                : ''}
                            </span>
                          )}
                          {stage === 'posted' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Posted{postedParts ? ` · ${postedParts.datePart}` : ''}
                            </span>
                          )}
                          {stage === 'draft' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-500/20 text-slate-300 border border-slate-400/30">
                              Draft
                            </span>
                          )}
                          {stage === 'attention' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-rose-500/20 text-rose-200 border border-rose-400/30">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Needs Review
                            </span>
                          )}

                          {/* Pill 2: Format & Slides */}
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-white/[0.05] text-slate-400 border border-white/10 uppercase">
                            {postFormat} · {post.slideCount}s
                          </span>

                          {/* Pill 3: Compact Target Channels */}
                          <div className="flex items-center gap-1">
                            {postTargets.map((plat) => {
                              const meta = PLATFORM_BADGES[plat];
                              if (!meta) return null;
                              return (
                                <span
                                  key={plat}
                                  title={meta.label}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold text-white"
                                  style={{
                                    backgroundColor: `${meta.color}28`,
                                    border: `1px solid ${meta.color}55`,
                                  }}
                                >
                                  {meta.short}
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        <div className="text-sm font-bold text-white truncate" title={post.title}>
                          {post.title}
                        </div>
                      </div>

                      {/* Right: Streamlined Action Bar */}
                      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                        <button
                          type="button"
                          disabled={isPostBusy}
                          onClick={() => onEditInStudio(post)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-xs font-bold transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit in Studio</span>
                        </button>

                        <button
                          type="button"
                          disabled={isPostBusy}
                          onClick={() =>
                            isEditingSchedule
                              ? setEditingSchedulePostId(null)
                              : openScheduleEditor(post)
                          }
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                            isEditingSchedule
                              ? 'border-cyan-400 bg-cyan-500/25 text-white'
                              : 'border-cyan-400/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>{stage === 'scheduled' ? 'Reschedule' : 'Schedule'}</span>
                        </button>

                        {stage === 'scheduled' && (
                          <button
                            type="button"
                            disabled={isPostBusy}
                            onClick={() => handleUnscheduleToDraft(post)}
                            title="Cancel scheduled post on Buffer & Zernio and move to Drafts"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{isPostBusy ? 'Cancelling...' : 'Cancel Schedule'}</span>
                          </button>
                        )}

                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1 bg-rose-950/60 border border-rose-500/40 rounded-lg px-2 py-1">
                            <button
                              type="button"
                              disabled={isPostBusy}
                              onClick={() => handleCancelAndDelete(post)}
                              className="px-2 py-0.5 rounded bg-rose-500 hover:bg-rose-400 text-white text-[10px] font-bold cursor-pointer"
                            >
                              {isPostBusy ? '...' : 'Confirm Delete'}
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
                            title="Delete from Buffer & Vault"
                            className="p-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline Reschedule Drawer */}
                    {isEditingSchedule && (
                      <div className="pt-2.5 border-t border-white/10 bg-black/40 rounded-xl p-3 space-y-3">
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
                              className="w-full px-3 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
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
                                      if (nextSlot.rolledToTomorrow) {
                                        onShowToast(
                                          `${pt} has passed today — set to Tomorrow (${nextSlot.datePart}) at ${pt}`
                                        );
                                      }
                                    }}
                                    className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold tabular-nums cursor-pointer ${
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
                              className="w-full px-3 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
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
                                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
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
                            <span>Sync updated schedule to Buffer</span>
                          </label>

                          <div className="flex items-center gap-2">
                            {stage === 'scheduled' && (
                              <button
                                type="button"
                                disabled={isPostBusy}
                                onClick={() => handleUnscheduleToDraft(post)}
                                className="px-3 py-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 text-xs font-bold cursor-pointer"
                              >
                                Cancel Schedule (Move to Drafts)
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isPostBusy}
                              onClick={() => handleSaveReschedule(post)}
                              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-extrabold cursor-pointer"
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
