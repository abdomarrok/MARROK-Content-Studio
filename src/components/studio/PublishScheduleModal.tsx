import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  Send,
  Calendar,
  Clock,
  Cloud,
  Trash2,
  Check,
  Download,
  RefreshCw,
  Layers,
  CheckSquare,
  Square,
  AlertTriangle,
} from 'lucide-react';
import type {
  CanvasDimensionPreset,
  CarouselData,
  PublishScheduleMode,
  PublishTargetPlatform,
  SavedPostRecord,
  ThemePalette,
} from '../../types.ts';
import { DEFAULT_PALETTES } from '../../types.ts';
import {
  cleanupPublishedCloudinaryMedia,
  computeWeeklyScheduleSlots,
  dispatchPostPublish,
  downloadMetricoolCsvFile,
  fetchPublishStatus,
  generateMetricoolBulkCsv,
  uploadDeckSlidesForPublishing,
  type MetricoolCsvRowInput,
  type PublishStatusResponse,
  type WeeklyCadencePreset,
} from '../../lib/publish/publishClient.ts';

export interface PublishScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'single' | 'bulk' | 'storage';
  carousel: CarouselData;
  theme: ThemePalette;
  savedPosts: SavedPostRecord[];
  onRefreshVault: () => void;
  onShowToast: (msg: string) => void;
}

const PLATFORM_OPTIONS: {
  id: PublishTargetPlatform;
  label: string;
  handle: string;
  providerLabel: string;
  defaultPreset: CanvasDimensionPreset;
}[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    handle: '@marrok_org',
    providerLabel: 'Buffer Free Queue',
    defaultPreset: 'ig-4:5',
  },
  {
    id: 'facebook',
    label: 'Facebook Page',
    handle: 'Marrok',
    providerLabel: 'Buffer Free Queue',
    defaultPreset: 'ig-4:5',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn Page',
    handle: 'Marrok',
    providerLabel: 'Buffer Free Queue',
    defaultPreset: 'ig-4:5',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    handle: '@Marrok',
    providerLabel: 'Metricool Free (20/mo)',
    defaultPreset: 'tiktok-9:16',
  },
];

function getDefaultScheduleDateStr(): string {
  const tomorrow = new Date(Date.now() + 24 * 3600_000);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const dd = String(tomorrow.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export const PublishScheduleModal: React.FC<PublishScheduleModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'single',
  carousel,
  theme,
  savedPosts,
  onRefreshVault,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'single' | 'bulk' | 'storage'>(initialTab);
  const [statusData, setStatusData] = useState<PublishStatusResponse | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  // Single Post Publish / Schedule States
  const [selectedTargets, setSelectedTargets] = useState<PublishTargetPlatform[]>([
    'instagram',
    'facebook',
    'linkedin',
  ]);
  const [scheduleMode, setScheduleMode] = useState<PublishScheduleMode>('shareNow');
  const [scheduleDate, setScheduleDate] = useState<string>(getDefaultScheduleDateStr);
  const [scheduleTime, setScheduleTime] = useState<string>('18:00');
  const [renderPreset, setRenderPreset] = useState<CanvasDimensionPreset>(
    carousel.dimensionPreset || 'ig-4:5'
  );
  const [autoCleanImmediate, setAutoCleanImmediate] = useState<boolean>(true);
  const [isProcessingSingle, setIsProcessingSingle] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  // Bulk Weekly Calendar Queue States
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [weeklyCadence, setWeeklyCadence] = useState<WeeklyCadencePreset>('mon-wed-fri');
  const [bulkStartDate, setBulkStartDate] = useState<string>(getDefaultScheduleDateStr);
  const [bulkTime, setBulkTime] = useState<string>('18:00');
  const [bulkTargets, setBulkTargets] = useState<PublishTargetPlatform[]>([
    'instagram',
    'facebook',
    'linkedin',
  ]);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [isCleaningCloud, setIsCleaningCloud] = useState(false);

  const loadStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const data = await fetchPublishStatus();
      setStatusData(data);
      if (data.autoCleanedPostIds && data.autoCleanedPostIds.length > 0) {
        onRefreshVault();
      }
    } catch (err) {
      console.warn('Failed to load publish status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [onRefreshVault]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    void loadStatus();
  }, [isOpen, initialTab, loadStatus]);

  // Pre-select validated posts when opening Bulk Queue
  useEffect(() => {
    if (!isOpen) return;
    const validatedIds = savedPosts
      .filter((p) => p.postStatus === 'validated')
      .slice(0, 6)
      .map((p) => p.id);
    if (validatedIds.length > 0 && selectedPostIds.length === 0) {
      setSelectedPostIds(validatedIds);
    }
  }, [isOpen, savedPosts, selectedPostIds.length]);

  const toggleTarget = (platform: PublishTargetPlatform) => {
    setSelectedTargets((prev) => {
      if (prev.includes(platform)) {
        return prev.length > 1 ? prev.filter((p) => p !== platform) : prev;
      }
      const next = [...prev, platform];
      if (platform === 'tiktok' && prev.length === 0) {
        setRenderPreset('tiktok-9:16');
      }
      return next;
    });
  };

  const toggleBulkTarget = (platform: PublishTargetPlatform) => {
    setBulkTargets((prev) => {
      if (prev.includes(platform)) {
        return prev.length > 1 ? prev.filter((p) => p !== platform) : prev;
      }
      return [...prev, platform];
    });
  };

  const togglePostSelection = (id: string) => {
    setSelectedPostIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectedBulkPosts = useMemo(() => {
    return savedPosts.filter((p) => selectedPostIds.includes(p.id));
  }, [savedPosts, selectedPostIds]);

  const weeklySlots = useMemo(() => {
    return computeWeeklyScheduleSlots(
      selectedBulkPosts.length,
      bulkStartDate,
      weeklyCadence,
      bulkTime
    );
  }, [selectedBulkPosts.length, bulkStartDate, weeklyCadence, bulkTime]);

  if (!isOpen) return null;

  const computedSingleDueAtIso = (): string => {
    if (scheduleMode === 'shareNow') {
      return new Date().toISOString();
    }
    if (scheduleMode === 'addToQueue') {
      return new Date(Date.now() + 4 * 3600_000).toISOString();
    }
    const dt = new Date(`${scheduleDate}T${scheduleTime || '18:00'}:00`);
    return Number.isNaN(dt.getTime())
      ? new Date(Date.now() + 24 * 3600_000).toISOString()
      : dt.toISOString();
  };

  const handleSinglePublishOrSchedule = async (exportMetricoolCsvOnly = false) => {
    setIsProcessingSingle(true);
    setProgressMessage('Preparing slide canvases for upload...');
    try {
      const uploadRes = await uploadDeckSlidesForPublishing(
        carousel,
        renderPreset,
        theme,
        (msg) => setProgressMessage(msg)
      );

      const dueAtIso = computedSingleDueAtIso();

      if (exportMetricoolCsvOnly) {
        setProgressMessage('Generating Metricool Bulk CSV with Cloudinary URLs...');
        const csvContent = generateMetricoolBulkCsv([
          {
            text: carousel.caption,
            scheduledDateIso: dueAtIso,
            isDraft: false,
            targets: selectedTargets,
            imageUrls: uploadRes.urls,
          },
        ]);
        const safeTitle = (carousel.slides[0]?.enTitle || carousel.category || 'post')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 32);
        downloadMetricoolCsvFile(csvContent, `MARROK_Metricool_${safeTitle}.csv`);
      }

      setProgressMessage(
        scheduleMode === 'shareNow'
          ? 'Dispatching post & running automatic Cloudinary cleanup...'
          : 'Saving scheduled post & staging Cloudinary URLs...'
      );

      const dispatchRes = await dispatchPostPublish({
        postId: carousel.id || uploadRes.postId,
        deck: carousel,
        title: carousel.slides[0]?.enTitle || carousel.category,
        caption: carousel.caption,
        mode: exportMetricoolCsvOnly ? 'customScheduled' : scheduleMode,
        dueAt: dueAtIso,
        targets: selectedTargets,
        imageUrls: uploadRes.urls,
        cloudinaryPublicIds: uploadRes.publicIds,
        autoCleanupImmediate: exportMetricoolCsvOnly ? false : autoCleanImmediate,
      });

      onRefreshVault();
      await loadStatus();

      if (exportMetricoolCsvOnly) {
        onShowToast(
          `Downloaded Metricool CSV with ${uploadRes.urls.length} Cloudinary slide URL(s). Auto-cleanup scheduled after publish time.`
        );
      } else if (dispatchRes.cloudinaryCleaned) {
        onShowToast(
          `Published ${uploadRes.urls.length} slide(s) & automatically cleaned up Cloudinary storage!`
        );
      } else {
        onShowToast(
          `Scheduled for ${new Date(dueAtIso).toLocaleString()} · Cloudinary will auto-clean after publication.`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Publishing failed';
      onShowToast(`Error: ${msg}`);
    } finally {
      setIsProcessingSingle(false);
      setProgressMessage(null);
    }
  };

  const handleBulkScheduleExecution = async (exportCsv = false) => {
    if (selectedBulkPosts.length === 0) {
      onShowToast('Select at least one post from your Vault to schedule.');
      return;
    }

    setIsProcessingBulk(true);
    const csvRows: MetricoolCsvRowInput[] = [];

    try {
      for (let i = 0; i < selectedBulkPosts.length; i++) {
        const record = selectedBulkPosts[i];
        const slot = weeklySlots[i];
        const dueAtIso = slot?.isoDate || new Date(Date.now() + (i + 1) * 86400_000).toISOString();
        const postPalette = DEFAULT_PALETTES[record.deck.theme] || theme;
        const targetPreset: CanvasDimensionPreset =
          bulkTargets.includes('tiktok') && bulkTargets.length === 1 ? 'tiktok-9:16' : 'ig-4:5';

        let urls = record.hostedSlideUrls || [];
        let pubIds = record.cloudinaryPublicIds || [];

        // Upload to Cloudinary if not currently staged or already cleaned
        if (urls.length === 0 || record.cloudinaryCleanedAt) {
          const uploadRes = await uploadDeckSlidesForPublishing(
            record.deck,
            targetPreset,
            postPalette,
            (msg) =>
              setProgressMessage(`Post ${i + 1}/${selectedBulkPosts.length} (${record.title.slice(0, 24)}): ${msg}`)
          );
          urls = uploadRes.urls;
          pubIds = uploadRes.publicIds;
        }

        setProgressMessage(
          `Scheduling Post ${i + 1}/${selectedBulkPosts.length} for ${slot?.readableLabel || dueAtIso}...`
        );

        await dispatchPostPublish({
          postId: record.id,
          deck: record.deck,
          title: record.title,
          caption: record.deck.caption,
          mode: 'customScheduled',
          dueAt: dueAtIso,
          targets: bulkTargets,
          imageUrls: urls,
          cloudinaryPublicIds: pubIds,
          autoCleanupImmediate: false,
        });

        csvRows.push({
          text: record.deck.caption,
          scheduledDateIso: dueAtIso,
          isDraft: false,
          targets: bulkTargets,
          imageUrls: urls,
        });
      }

      if (exportCsv && csvRows.length > 0) {
        const csvContent = generateMetricoolBulkCsv(csvRows);
        downloadMetricoolCsvFile(
          csvContent,
          `MARROK_Weekly_Batch_${selectedBulkPosts.length}_Posts.csv`
        );
      }

      onRefreshVault();
      await loadStatus();

      onShowToast(
        exportCsv
          ? `Staged ${selectedBulkPosts.length} posts on Cloudinary & downloaded Metricool Weekly CSV!`
          : `Scheduled ${selectedBulkPosts.length} posts across your weekly calendar queue!`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Bulk scheduling failed';
      onShowToast(`Bulk schedule error: ${msg}`);
    } finally {
      setIsProcessingBulk(false);
      setProgressMessage(null);
    }
  };

  const handleManualCloudinaryCleanup = async (forceAll: boolean) => {
    setIsCleaningCloud(true);
    try {
      const res = await cleanupPublishedCloudinaryMedia({ forceAll });
      onRefreshVault();
      await loadStatus();
      if (res.cleanedPublicIds.length > 0) {
        onShowToast(
          `Deleted ${res.cleanedPublicIds.length} staged slide image(s) from Cloudinary (${res.cleanedPostIds.length} post(s)).`
        );
      } else {
        onShowToast(
          forceAll
            ? 'Cloudinary staging folder is already completely clean (0 staged files).'
            : 'No expired published posts waiting for cleanup. Active future schedules were kept safe.'
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cleanup failed';
      onShowToast(`Cleanup error: ${msg}`);
    } finally {
      setIsCleaningCloud(false);
    }
  };

  const metricoolUsed = statusData?.metricoolUsedThisMonth ?? 0;
  const metricoolLimit = statusData?.metricoolMonthlyLimit ?? 20;
  const stagedSlidesCount = statusData?.stagedCloudinarySlidesCount ?? 0;
  const cleanedPostsCount = statusData?.cleanedCloudinaryPostsCount ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-5 animate-fade-in">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#090e14] border border-white/15 rounded-2xl shadow-2xl overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-5 py-4 border-b border-white/10 bg-[#0c131b] flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
              Publish & Schedule Automation Studio
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 flex-wrap font-mono tabular-nums">
              <span>
                Cloudinary: {statusData?.cloudinaryConfigured ? `Connected (${statusData.cloudinaryCloudName})` : 'Local Staging'}
              </span>
              <span aria-hidden="true">·</span>
              <span>Buffer Queue: 3 Channels (10/ch rolling)</span>
              <span aria-hidden="true">·</span>
              <span>
                Metricool Free: {metricoolUsed}/{metricoolLimit} monthly posts
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="Close Publish Studio"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Workflow Switcher */}
        <div className="px-5 py-2.5 bg-[#0a1017] border-b border-white/10 flex items-center justify-between gap-3 overflow-x-auto shrink-0">
          <div className="flex items-center gap-1 p-1 bg-black/60 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('single')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'single'
                  ? 'bg-white/15 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Send className="w-3.5 h-3.5" style={activeTab === 'single' ? { color: theme.accent } : undefined} />
              <span>Publish or Schedule Post</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('bulk')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'bulk'
                  ? 'bg-white/15 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" style={activeTab === 'bulk' ? { color: theme.accent } : undefined} />
              <span>Bulk Weekly Queue ({savedPosts.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('storage')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'storage'
                  ? 'bg-white/15 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cloud className="w-3.5 h-3.5" style={activeTab === 'storage' ? { color: theme.accent } : undefined} />
              <span>Cloudinary Cleanup & Free Quotas</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => void loadStatus()}
            disabled={isLoadingStatus}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Refresh quotas and sweep expired Cloudinary assets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>

        {/* Live Progress Banner */}
        {progressMessage && (
          <div className="px-5 py-2.5 bg-cyan-950/50 border-b border-cyan-500/30 flex items-center gap-2.5 text-xs text-cyan-200 font-mono shrink-0">
            <RefreshCw className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
            <span className="truncate">{progressMessage}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {activeTab === 'single' && (
            <div className="space-y-6">
              {/* Active Deck Summary */}
              <div className="p-4 rounded-xl bg-[#0d151e] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs text-slate-400 font-mono tabular-nums">
                    Active Studio Deck · {carousel.slides.length} Slide{carousel.slides.length === 1 ? '' : 's'} · Theme: {theme.name.split(' ')[0]}
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-white truncate mt-0.5">
                    {carousel.slides[0]?.enTitle || carousel.category || 'Untitled Post'}
                  </h3>
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {carousel.caption.slice(0, 120)}...
                  </p>
                </div>

                {/* Aspect Ratio Selector */}
                <div className="flex items-center gap-1.5 p-1 bg-black/50 rounded-xl border border-white/10 shrink-0">
                  <button
                    type="button"
                    onClick={() => setRenderPreset('ig-4:5')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      renderPreset === 'ig-4:5'
                        ? 'bg-white/15 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    IG/LinkedIn 4:5 (1080×1350)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenderPreset('tiktok-9:16')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      renderPreset === 'tiktok-9:16'
                        ? 'bg-white/15 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    TikTok 9:16 (1080×1920)
                  </button>
                </div>
              </div>

              {/* Step 1: Target Channels */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200">
                    01. Select Target Channels (Buffer Free + Metricool Free)
                  </label>
                  <span className="text-xs text-slate-400 font-mono tabular-nums">
                    {selectedTargets.length} selected
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {PLATFORM_OPTIONS.map((plat) => {
                    const isChecked = selectedTargets.includes(plat.id);
                    const chInfo = statusData?.channels.find((c) => c.service === plat.id);
                    return (
                      <button
                        key={plat.id}
                        type="button"
                        onClick={() => toggleTarget(plat.id)}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                          isChecked
                            ? 'bg-[#111c26] border-white/30 text-white'
                            : 'bg-[#0b1117] border-white/10 text-slate-400 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-white">{plat.label}</span>
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border ${
                              isChecked
                                ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                                : 'border-white/25 bg-black/40'
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                          <div>{plat.handle}</div>
                          <div className="text-slate-500 mt-0.5">
                            {chInfo
                              ? `${chInfo.queuedCount}/${chInfo.queueLimit} ${
                                  plat.id === 'tiktok' ? 'mo' : 'queued'
                                }`
                              : plat.providerLabel}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Step 2: Timing & Cloudinary Auto-Cleanup */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-200 block">
                  02. Choose Publishing Timing & Cloudinary Cleanup
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setScheduleMode('shareNow')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      scheduleMode === 'shareNow'
                        ? 'bg-[#111c26] border-white/30 text-white'
                        : 'bg-[#0b1117] border-white/10 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white">Publish Immediately</span>
                      <Send className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Uploads slides to Cloudinary, dispatches now, and immediately deletes staged images from Cloudinary.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScheduleMode('addToQueue')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      scheduleMode === 'addToQueue'
                        ? 'bg-[#111c26] border-white/30 text-white'
                        : 'bg-[#0b1117] border-white/10 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white">Next Buffer Queue Slot</span>
                      <Layers className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Places post in your next open Buffer queue slot (up to 10/channel). Auto-cleans Cloudinary after publish.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScheduleMode('customScheduled')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      scheduleMode === 'customScheduled'
                        ? 'bg-[#111c26] border-white/30 text-white'
                        : 'bg-[#0b1117] border-white/10 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white">Pick Date & Time</span>
                      <Clock className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Schedule for an exact date and time. Keeps Cloudinary URLs live until 1 hour after publication.
                    </p>
                  </button>
                </div>

                {scheduleMode === 'customScheduled' && (
                  <div className="p-4 rounded-xl bg-[#0d151e] border border-white/10 flex flex-wrap items-center gap-4">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Publication Date</label>
                      <input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-black/60 border border-white/15 text-xs font-mono tabular-nums text-white focus:outline-none focus:border-white/40"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Publication Time (Local)</label>
                      <input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-black/60 border border-white/15 text-xs font-mono tabular-nums text-white focus:outline-none focus:border-white/40"
                      />
                    </div>
                    <div className="text-xs text-slate-400 font-mono tabular-nums pt-4">
                      Auto-cleanup scheduled for 1 hour after {scheduleDate} {scheduleTime}
                    </div>
                  </div>
                )}

                {scheduleMode === 'shareNow' && (
                  <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none pt-1">
                    <input
                      type="checkbox"
                      checked={autoCleanImmediate}
                      onChange={(e) => setAutoCleanImmediate(e.target.checked)}
                      className="rounded border-white/20 bg-black/50"
                    />
                    <span>
                      Automatically delete staged slide images from Cloudinary (`dug1cw6ux`) as soon as publish completes
                    </span>
                  </label>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={isProcessingSingle}
                  onClick={() => void handleSinglePublishOrSchedule(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/12 border border-white/15 text-xs font-semibold text-slate-200 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Download className="w-4 h-4 text-cyan-400" />
                  <span>Stage to Cloudinary & Download Metricool CSV</span>
                </button>

                <button
                  type="button"
                  disabled={isProcessingSingle}
                  onClick={() => void handleSinglePublishOrSchedule(false)}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-slate-950 transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-md"
                  style={{ backgroundColor: theme.accent }}
                >
                  <Send className="w-4 h-4 text-slate-950" />
                  <span>
                    {scheduleMode === 'shareNow'
                      ? 'Publish Now & Auto-Clean Cloudinary'
                      : scheduleMode === 'addToQueue'
                      ? 'Stage & Add to Buffer Queue'
                      : `Schedule Post (${scheduleDate} ${scheduleTime})`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'bulk' && (
            <div className="space-y-5">
              {/* Weekly Cadence Controls */}
              <div className="p-4 rounded-xl bg-[#0d151e] border border-white/10 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-white">
                      Weekly Calendar Queue Generator
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Select multiple Vault posts below to auto-assign optimal weekly slots, upload slides to Cloudinary, and batch-schedule.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedPostIds(
                          savedPosts.filter((p) => p.postStatus === 'validated').map((p) => p.id)
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 cursor-pointer whitespace-nowrap"
                    >
                      Select Validated
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPostIds(savedPosts.map((p) => p.id))}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 cursor-pointer whitespace-nowrap"
                    >
                      Select All ({savedPosts.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPostIds([])}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 cursor-pointer whitespace-nowrap"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/5">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Weekly Cadence</label>
                    <select
                      value={weeklyCadence}
                      onChange={(e) => setWeeklyCadence(e.target.value as WeeklyCadencePreset)}
                      className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none"
                    >
                      <option value="mon-wed-fri">Mon / Wed / Fri (3 posts/week)</option>
                      <option value="tue-thu-sat">Tue / Thu / Sat (3 posts/week)</option>
                      <option value="weekdays">Weekdays Mon–Fri (5 posts/week)</option>
                      <option value="daily">Every Day (7 posts/week)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Start Date</label>
                    <input
                      type="date"
                      value={bulkStartDate}
                      onChange={(e) => setBulkStartDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/15 text-xs font-mono tabular-nums text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Daily Slot Time</label>
                    <input
                      type="time"
                      value={bulkTime}
                      onChange={(e) => setBulkTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/15 text-xs font-mono tabular-nums text-white focus:outline-none"
                    />
                  </div>
                </div>

                {/* Target Networks for Batch */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] text-slate-400 mr-1">Batch Channels:</span>
                  {PLATFORM_OPTIONS.map((plat) => {
                    const active = bulkTargets.includes(plat.id);
                    return (
                      <button
                        key={plat.id}
                        type="button"
                        onClick={() => toggleBulkTarget(plat.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-white/15 border-white/30 text-white'
                            : 'bg-black/40 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {plat.label} ({plat.handle})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* High-Density Vault Queue Selection Table */}
              <div className="border border-white/10 rounded-xl overflow-hidden bg-[#0b1117]">
                <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-[#0f1720] border-b border-white/10 text-[11px] font-semibold text-slate-400">
                  <div className="col-span-5 sm:col-span-5">Vault Post & Theme</div>
                  <div className="col-span-3 sm:col-span-3">Assigned Slot</div>
                  <div className="col-span-2 sm:col-span-2 text-right">Slides</div>
                  <div className="col-span-2 sm:col-span-2 text-right">Cloudinary</div>
                </div>

                <div className="divide-y divide-white/[0.06] max-h-[300px] overflow-y-auto">
                  {savedPosts.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Your Vault is empty. Save validated posts to schedule them in batches.
                    </div>
                  ) : (
                    savedPosts.map((post) => {
                      const isSelected = selectedPostIds.includes(post.id);
                      const selectionOrder = selectedPostIds.indexOf(post.id);
                      const assignedSlot =
                        selectionOrder >= 0 ? weeklySlots[selectionOrder] : undefined;
                      const pal = DEFAULT_PALETTES[post.deck.theme] || DEFAULT_PALETTES.teal;
                      const isStaged =
                        Boolean(post.cloudinaryPublicIds?.length) && !post.cloudinaryCleanedAt;

                      return (
                        <div
                          key={post.id}
                          onClick={() => togglePostSelection(post.id)}
                          className={`grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-xs transition-colors cursor-pointer ${
                            isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.02]'
                          }`}
                        >
                          <div className="col-span-5 sm:col-span-5 flex items-center gap-2.5 min-w-0">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 shrink-0" style={{ color: theme.accent }} />
                            ) : (
                              <Square className="w-4 h-4 text-slate-500 shrink-0" />
                            )}
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
                              style={{ backgroundColor: pal.accent }}
                              title={`Theme: ${pal.name}`}
                            />
                            <div className="min-w-0">
                              <div className="font-semibold text-white truncate">{post.title}</div>
                              <div className="text-[11px] text-slate-400 truncate">
                                {post.postStatus === 'posted' ? 'Posted' : 'Validated'} · {pal.name.split(' ')[0]}
                              </div>
                            </div>
                          </div>

                          <div className="col-span-3 sm:col-span-3 font-mono tabular-nums text-[11px]">
                            {assignedSlot ? (
                              <span className="text-emerald-300">{assignedSlot.readableLabel}</span>
                            ) : post.scheduledFor ? (
                              <span className="text-slate-400">
                                {new Date(post.scheduledFor).toLocaleDateString()}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </div>

                          <div className="col-span-2 sm:col-span-2 text-right font-mono tabular-nums text-slate-300">
                            {post.slideCount}
                          </div>

                          <div className="col-span-2 sm:col-span-2 text-right font-mono text-[11px]">
                            {post.cloudinaryCleanedAt ? (
                              <span className="text-emerald-400">Cleaned</span>
                            ) : isStaged ? (
                              <span className="text-cyan-300">Staged</span>
                            ) : (
                              <span className="text-slate-500">Ready</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Quota Warning if TikTok > 20/mo */}
              {bulkTargets.includes('tiktok') &&
                metricoolUsed + selectedBulkPosts.length > metricoolLimit && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5 text-xs text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Metricool Free allows {metricoolLimit} posts/month ({metricoolUsed} used). Scheduling {selectedBulkPosts.length} more TikTok posts exceeds your monthly cap by {metricoolUsed + selectedBulkPosts.length - metricoolLimit}.
                    </span>
                  </div>
                )}

              {/* Bulk Actions Footer */}
              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={isProcessingBulk || selectedBulkPosts.length === 0}
                  onClick={() => void handleBulkScheduleExecution(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/12 border border-white/15 text-xs font-semibold text-slate-200 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  <Download className="w-4 h-4 text-cyan-400" />
                  <span>
                    Stage Batch to Cloudinary & Download Metricool CSV ({selectedBulkPosts.length})
                  </span>
                </button>

                <button
                  type="button"
                  disabled={isProcessingBulk || selectedBulkPosts.length === 0}
                  onClick={() => void handleBulkScheduleExecution(false)}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-slate-950 transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50 whitespace-nowrap shadow-md"
                  style={{ backgroundColor: theme.accent }}
                >
                  <Calendar className="w-4 h-4 text-slate-950" />
                  <span>
                    Schedule {selectedBulkPosts.length} Post{selectedBulkPosts.length === 1 ? '' : 's'} to Weekly Queue
                  </span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'storage' && (
            <div className="space-y-5">
              {/* Cloudinary Auto-Cleanup Status Card */}
              <div className="p-4 rounded-xl bg-[#0d151e] border border-white/10 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Cloudinary Staging & Post-Publish Auto-Cleanup
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Signed SHA-1 uploads stage rendered slides in <code className="text-slate-200 font-mono">marrok_staging/</code> and automatically destroy them once published.
                    </p>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-emerald-400 shrink-0">
                    {statusData?.cloudinaryConfigured
                      ? `Cloud Active: ${statusData.cloudinaryCloudName}`
                      : 'Local Fallback Mode'}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/10 font-mono tabular-nums">
                  <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                    <div className="text-[11px] text-slate-400">Currently Staged Slides</div>
                    <div className="text-lg font-bold text-white mt-0.5">{stagedSlidesCount}</div>
                    <div className="text-[10px] text-slate-500">Waiting for future schedule slot</div>
                  </div>

                  <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                    <div className="text-[11px] text-slate-400">Auto-Cleaned Posts</div>
                    <div className="text-lg font-bold text-emerald-400 mt-0.5">{cleanedPostsCount}</div>
                    <div className="text-[10px] text-slate-500">Destroyed after publication</div>
                  </div>

                  <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                    <div className="text-[11px] text-slate-400">Metricool Monthly Cap</div>
                    <div className="text-lg font-bold text-cyan-300 mt-0.5">
                      {metricoolUsed} / {metricoolLimit}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Month: {statusData?.currentMonthKey || new Date().toISOString().slice(0, 7)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    disabled={isCleaningCloud}
                    onClick={() => void handleManualCloudinaryCleanup(false)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold text-emerald-200 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCleaningCloud ? 'animate-spin' : ''}`} />
                    <span>Clean Up Published Cloudinary Media Now</span>
                  </button>

                  <button
                    type="button"
                    disabled={isCleaningCloud}
                    onClick={() => void handleManualCloudinaryCleanup(true)}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-xs font-semibold text-rose-300 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Force Purge All Staged Media</span>
                  </button>
                </div>
              </div>

              {/* Free Plan Comparison & Channel Quotas */}
              <div className="border border-white/10 rounded-xl overflow-hidden bg-[#0b1117]">
                <div className="px-4 py-3 bg-[#0f1720] border-b border-white/10 flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    Connected Channels & Free Tier Quotas
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    Buffer Free (10/queue) + Metricool Free (20/mo)
                  </span>
                </div>

                <div className="divide-y divide-white/[0.06]">
                  {(statusData?.channels || []).map((ch) => (
                    <div
                      key={ch.id}
                      className="px-4 py-3 flex items-center justify-between gap-4 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-white">
                          {ch.name} · <span className="font-mono text-slate-300">{ch.handle}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {ch.provider === 'buffer'
                            ? 'Buffer Free Plan · Rolling queue (frees slot as soon as post publishes)'
                            : 'Metricool Free Plan · Monthly planner cap (CSV Bulk Upload supported)'}
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="text-white font-bold">
                          {ch.queuedCount} / {ch.queueLimit}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {ch.provider === 'buffer' ? 'Active in queue' : 'Used this month'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
