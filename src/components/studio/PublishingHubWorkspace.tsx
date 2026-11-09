import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Send,
  Calendar,
  Cloud,
  Trash2,
  RefreshCw,
  Sliders,
  Check,
  Wand2,
  Music,
  Play,
  Square,
  Shuffle,
  Database,
  Radar,
} from 'lucide-react';
import {
  CarouselData,
  DEFAULT_PALETTES,
  PublishScheduleMode,
  PublishTargetPlatform,
  SavedPostRecord,
  SavedPostStorageEngine,
  ThemePalette,
} from '../../types.ts';
import {
  buildLocalScheduledIso,
  ChannelDispatchResult,
  cleanupPublishedCloudinaryMedia,
  DEFAULT_METRICOOL_TEMPLATE_OPTIONS,
  deriveMetricoolAltTexts,
  deriveMetricoolDocumentTitle,
  deriveMetricoolFirstComment,
  deriveMetricoolTikTokTitle,
  dispatchPostPublish,
  fetchPublishStatus,
  fetchTikTokCommercialMusic,
  getDefaultUpcomingTimeStr,
  getLocalTodayDateStr,
  MetricoolTemplateOptions,
  PublishStatusResponse,
  resolveNextFutureSlotForTime,
  TikTokCommercialTrack,
  uploadDeckSlidesForPublishing,
} from '../../lib/publish/publishClient.ts';
import { PostManagerPanel } from './PostManagerPanel.tsx';
import { WeeklyProgramReviewPanel } from './WeeklyProgramReviewPanel.tsx';

interface PublishingHubWorkspaceProps {
  initialTab?: 'single' | 'program' | 'posts' | 'bulk' | 'storage';
  carousel: CarouselData;
  theme: ThemePalette;
  savedPosts: SavedPostRecord[];
  storageEngine?: SavedPostStorageEngine;
  onBackToStudio: () => void;
  onSelectPostIntoStudio?: (post: SavedPostRecord) => void;
  onRefreshVault: () => void;
  onShowToast: (msg: string) => void;
  onExportVaultJson?: () => void;
  onImportVaultJson?: (file: File) => void;
}

const PLATFORM_META: Record<
  PublishTargetPlatform,
  { label: string; handle: string; badgeColor: string; providerLabel: string }
> = {
  instagram: {
    label: 'Instagram',
    handle: '@marrok_org',
    badgeColor: '#E1306C',
    providerLabel: 'Buffer API',
  },
  facebook: {
    label: 'Facebook Page',
    handle: 'Marrok (Algiers)',
    badgeColor: '#1877F2',
    providerLabel: 'Buffer API',
  },
  linkedin: {
    label: 'LinkedIn Page',
    handle: 'Marrok',
    badgeColor: '#0A66C2',
    providerLabel: 'Buffer API',
  },
  tiktok: {
    label: 'TikTok',
    handle: '@marrokorg',
    badgeColor: '#00F2FE',
    providerLabel: 'Zernio API',
  },
};

export const PublishingHubWorkspace: React.FC<PublishingHubWorkspaceProps> = ({
  initialTab = 'single',
  carousel,
  theme,
  savedPosts,
  storageEngine,
  onBackToStudio,
  onSelectPostIntoStudio,
  onRefreshVault,
  onShowToast,
  onExportVaultJson,
  onImportVaultJson,
}) => {
  const normalizedInitial: 'single' | 'program' | 'posts' =
    initialTab === 'program'
      ? 'program'
      : initialTab === 'bulk' || initialTab === 'posts'
      ? 'posts'
      : 'single';
  const [hubMode, setHubMode] = useState<'single' | 'program' | 'posts'>(normalizedInitial);
  const [status, setStatus] = useState<PublishStatusResponse | null>(null);

  // Channel Selection
  const [selectedTargets, setSelectedTargets] = useState<PublishTargetPlatform[]>([
    'instagram',
    'facebook',
    'linkedin',
    'tiktok',
  ]);

  // Schedule Mode (Defaults to today in local timezone, never tomorrow)
  const [scheduleMode, setScheduleMode] = useState<PublishScheduleMode>('customScheduled');
  const [scheduledDate, setScheduledDate] = useState<string>(getLocalTodayDateStr);
  const [scheduledTime, setScheduledTime] = useState<string>(getDefaultUpcomingTimeStr);
  const [autoCleanupImmediate] = useState<boolean>(true);
  const [lastDispatchSummary, setLastDispatchSummary] = useState<{
    channelResults: ChannelDispatchResult[];
    warnings: string[];
    mode?: PublishScheduleMode;
    scheduledFor?: string | null;
  } | null>(null);

  // Platform Options
  const [templateOpts, setTemplateOpts] = useState<MetricoolTemplateOptions>(
    DEFAULT_METRICOOL_TEMPLATE_OPTIONS
  );

  // TikTok Commercial Music Library State (Auto-Pick Trending Default + Preview)
  const [tiktokTracks, setTiktokTracks] = useState<TikTokCommercialTrack[]>([]);
  const [selectedMusicSoundId, setSelectedMusicSoundId] = useState<string>('auto');
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Editable per-post metadata fields for the active deck
  const [customCaption, setCustomCaption] = useState<string>(() => carousel.caption || '');
  const [tiktokTitle, setTiktokTitle] = useState<string>(() =>
    deriveMetricoolTikTokTitle(carousel)
  );
  const [firstComment, setFirstComment] = useState<string>(() =>
    deriveMetricoolFirstComment(carousel)
  );
  const [documentTitle, setDocumentTitle] = useState<string>(() =>
    deriveMetricoolDocumentTitle(carousel)
  );
  const [altTexts, setAltTexts] = useState<string[]>(() =>
    deriveMetricoolAltTexts(carousel)
  );
  const [showAltTextEditor, setShowAltTextEditor] = useState<boolean>(false);

  // Staged Cloudinary URLs for active deck
  const [stagedUrlsByPostId, setStagedUrlsByPostId] = useState<Record<string, string[]>>({});
  const [stagedPublicIdsByPostId, setStagedPublicIdsByPostId] = useState<Record<string, string[]>>({});

  // Progress & Busy State
  const [isBusy, setIsBusy] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const activePostKey = carousel.id || 'active_studio_deck';

  const loadStatus = useCallback(async () => {
    try {
      const data = await fetchPublishStatus();
      setStatus(data);
      if (data.autoCleanedPostIds && data.autoCleanedPostIds.length > 0) {
        // Silently refresh vault in background without showing a popup toast
        onRefreshVault();
      }
    } catch (err) {
      console.warn('Failed to fetch publish status:', err);
    }
  }, [onRefreshVault]);

  const loadTikTokMusic = useCallback(async () => {
    try {
      const catalog = await fetchTikTokCommercialMusic();
      if (Array.isArray(catalog.tracks) && catalog.tracks.length > 0) {
        setTiktokTracks(catalog.tracks);
      }
    } catch (err) {
      console.warn('Failed to fetch TikTok commercial music:', err);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadTikTokMusic();
  }, [loadStatus, loadTikTokMusic]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setHubMode(
      initialTab === 'program'
        ? 'program'
        : initialTab === 'bulk' || initialTab === 'posts'
        ? 'posts'
        : 'single'
    );
  }, [initialTab]);

  // Sync active deck fields when carousel changes
  useEffect(() => {
    setCustomCaption(
      carousel.caption ||
        `${carousel.slides[0]?.enTitle || 'MARROK'}\n${
          carousel.slides[0]?.arTitle || ''
        }\n\n${carousel.slides[0]?.enBody || ''}\n\n#MARROK #SystemDesign`
    );
    setTiktokTitle(deriveMetricoolTikTokTitle(carousel));
    setFirstComment(deriveMetricoolFirstComment(carousel));
    setDocumentTitle(deriveMetricoolDocumentTitle(carousel));
    setAltTexts(deriveMetricoolAltTexts(carousel));
  }, [carousel]);

  const togglePlatform = (platform: PublishTargetPlatform) => {
    setSelectedTargets((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  const handleAutoFillActiveFields = () => {
    setTiktokTitle(deriveMetricoolTikTokTitle(carousel));
    setFirstComment(deriveMetricoolFirstComment(carousel));
    setDocumentTitle(deriveMetricoolDocumentTitle(carousel));
    setAltTexts(deriveMetricoolAltTexts(carousel));
    onShowToast('Auto-filled TikTok Title, First Comment, Document Title & Slide Alt Texts');
  };

  // Resolve the currently active TikTok track object for preview/display
  const activeTikTokTrack: TikTokCommercialTrack | undefined =
    selectedMusicSoundId === 'none'
      ? undefined
      : selectedMusicSoundId === 'auto'
      ? tiktokTracks[0]
      : tiktokTracks.find((t) => t.musicSoundId === selectedMusicSoundId) || tiktokTracks[0];

  const handleToggleAudioPreview = (track?: TikTokCommercialTrack) => {
    const target = track || activeTikTokTrack;
    if (!target || !target.previewUrl) {
      onShowToast('No audio preview URL available for this track');
      return;
    }

    if (playingTrackId === target.musicSoundId && audioRef.current) {
      audioRef.current.pause();
      setPlayingTrackId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(target.previewUrl);
    audio.volume = 0.65;
    audio.onended = () => setPlayingTrackId(null);
    audio.onerror = () => {
      setPlayingTrackId(null);
      onShowToast('Could not play audio preview');
    };
    audioRef.current = audio;
    setPlayingTrackId(target.musicSoundId);
    void audio.play();
  };

  const handleShuffleTrendingTrack = () => {
    if (tiktokTracks.length === 0) return;
    const pool = tiktokTracks.slice(0, Math.min(12, tiktokTracks.length));
    const currentId = activeTikTokTrack?.musicSoundId;
    const candidates = pool.filter((t) => t.musicSoundId !== currentId);
    const picked =
      candidates[Math.floor(Math.random() * candidates.length)] || pool[0];
    if (picked) {
      setSelectedMusicSoundId(picked.musicSoundId);
      if (playingTrackId && audioRef.current) {
        audioRef.current.pause();
        setPlayingTrackId(null);
      }
      onShowToast(`♪ Selected trending track: ${picked.name} — ${picked.artist}`);
    }
  };

  // Stage slides to Cloudinary (`dug1cw6ux`) without dispatching yet
  const handleStageSlidesToCloudinary = async () => {
    setIsBusy(true);
    try {
      const renderPreset =
        selectedTargets.length === 1 && selectedTargets[0] === 'tiktok'
          ? 'tiktok-9:16'
          : 'ig-4:5';

      const uploaded = await uploadDeckSlidesForPublishing(
        carousel,
        renderPreset,
        theme,
        (stage) => setProgressLabel(stage)
      );
      setStagedUrlsByPostId((prev) => ({ ...prev, [activePostKey]: uploaded.urls }));
      setStagedPublicIdsByPostId((prev) => ({
        ...prev,
        [activePostKey]: uploaded.publicIds,
      }));
      onShowToast(
        `✓ Staged ${uploaded.urls.length} slide(s) to Cloudinary (${
          status?.cloudinaryCloudName || 'dug1cw6ux'
        })`
      );
      await loadStatus();
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Cloudinary staging failed'}`);
    } finally {
      setIsBusy(false);
      setProgressLabel(null);
    }
  };

  // Dispatch to Buffer GraphQL + Zernio REST API v1 + Save Schedule to Vault
  const handleDispatchPublishAndSchedule = async (options?: {
    targetSubset?: PublishTargetPlatform[];
    mergeRemoteIds?: boolean;
    cancelExistingBeforeDispatch?: boolean;
  }) => {
    const activeTargets =
      options?.targetSubset && options.targetSubset.length > 0
        ? options.targetSubset
        : selectedTargets;

    if (activeTargets.length === 0) {
      onShowToast('⚠️ Select at least one target platform');
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingTrackId(null);
    }

    setIsBusy(true);
    try {
      const hasTikTokTarget = activeTargets.includes('tiktok');
      const hasMetaOrLinkedInTarget = activeTargets.some((t) => t !== 'tiktok');
      const renderPreset =
        hasTikTokTarget && !hasMetaOrLinkedInTarget ? 'tiktok-9:16' : 'ig-4:5';
      const userTimezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Algiers';

      if (!status?.cloudinaryConfigured) {
        onShowToast(
          '⚠️ Notice: Cloudinary keys are missing on Vercel. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in Vercel settings for direct public hosting.'
        );
      }

      let urls = stagedUrlsByPostId[activePostKey];
      let pubIds = stagedPublicIdsByPostId[activePostKey] || [];
      let tiktokUrls: string[] | undefined = undefined;

      if (!urls || urls.length === 0) {
        const uploaded = await uploadDeckSlidesForPublishing(
          carousel,
          renderPreset,
          theme,
          (stage) => setProgressLabel(stage)
        );
        urls = uploaded.urls;
        pubIds = uploaded.publicIds;
        setStagedUrlsByPostId((prev) => ({ ...prev, [activePostKey]: urls }));
        setStagedPublicIdsByPostId((prev) => ({ ...prev, [activePostKey]: pubIds }));
      }

      // If publishing to BOTH Instagram/Facebook/LinkedIn (4:5) AND TikTok via Zernio API,
      // stage native 9:16 vertical slides specifically for TikTok so neither platform crops or rejects!
      if (hasTikTokTarget && hasMetaOrLinkedInTarget && status?.zernioApiConfigured) {
        const uploadedTikTok = await uploadDeckSlidesForPublishing(
          carousel,
          'tiktok-9:16',
          theme,
          (stage) => setProgressLabel(`TikTok 9:16: ${stage}`)
        );
        tiktokUrls = uploadedTikTok.urls;
        pubIds = Array.from(new Set([...pubIds, ...uploadedTikTok.publicIds]));
      }

      const dueAtIso =
        scheduleMode === 'customScheduled'
          ? buildLocalScheduledIso(scheduledDate, scheduledTime || '18:00')
          : scheduleMode === 'addToQueue'
          ? new Date(Date.now() + 4 * 3600_000).toISOString()
          : undefined;

      const effectiveMusicSoundId =
        selectedMusicSoundId === 'none'
          ? 'none'
          : selectedMusicSoundId === 'auto'
          ? activeTikTokTrack?.musicSoundId || 'auto'
          : selectedMusicSoundId;

      setProgressLabel(
        options?.mergeRemoteIds
          ? `Retrying ${activeTargets.join(', ')}...`
          : options?.cancelExistingBeforeDispatch
          ? 'Cancelling prior queues & re-dispatching all channels...'
          : 'Dispatching to Buffer & Zernio APIs...'
      );
      const dispatchRes = await dispatchPostPublish({
        postId: carousel.id,
        deck: { ...carousel, caption: customCaption },
        title: carousel.slides[0]?.enTitle || 'Untitled Post',
        caption: customCaption,
        mode: scheduleMode,
        dueAt: dueAtIso,
        timezone: userTimezone,
        targets: activeTargets,
        imageUrls: urls,
        tiktokImageUrls: tiktokUrls,
        cloudinaryPublicIds: pubIds,
        autoCleanupImmediate: scheduleMode === 'shareNow' && autoCleanupImmediate,
        mergeRemoteIds: Boolean(options?.mergeRemoteIds),
        cancelExistingBeforeDispatch: Boolean(options?.cancelExistingBeforeDispatch),
        tiktokSettings: {
          privacyLevel: templateOpts.tiktokPostPrivacy,
          photoCoverIndex: templateOpts.tiktokPhotoCoverIndex,
          autoAddMusic: selectedMusicSoundId !== 'none' && templateOpts.tiktokAutoAddMusic,
          allowComment: !templateOpts.tiktokDisableComments,
          title: tiktokTitle,
          musicSoundId: effectiveMusicSoundId,
        },
      });

      const results = dispatchRes.channelResults || [];
      setLastDispatchSummary((prev) => {
        if (options?.mergeRemoteIds && prev) {
          const keptResults = prev.channelResults.filter(
            (r) => !results.some((nr) => nr.service === r.service)
          );
          return {
            channelResults: [...keptResults, ...results],
            warnings: dispatchRes.warnings || [],
            mode: scheduleMode,
            scheduledFor: dispatchRes.scheduledFor,
          };
        }
        return {
          channelResults: results,
          warnings: dispatchRes.warnings || [],
          mode: scheduleMode,
          scheduledFor: dispatchRes.scheduledFor,
        };
      });

      const apiSentCount = dispatchRes.bufferDispatchedCount ?? 0;
      const apiFailedCount = dispatchRes.bufferFailedCount ?? 0;

      onRefreshVault();
      await loadStatus();

      if (apiFailedCount > 0) {
        const firstWarn = dispatchRes.warnings?.[0] || 'One or more channels failed';
        onShowToast(`⚠️ ${firstWarn}`);
      } else if (apiSentCount > 0) {
        onShowToast(
          scheduleMode === 'shareNow'
            ? `✓ Published directly to ${apiSentCount} channel(s) via Buffer & Zernio API!`
            : `✓ Scheduled on ${apiSentCount} channel(s) for ${scheduledDate} ${scheduledTime}!`
        );
      } else {
        onShowToast(`✓ Saved post schedule for ${scheduledDate} ${scheduledTime}`);
      }
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Publishing failed'}`);
    } finally {
      setIsBusy(false);
      setProgressLabel(null);
    }
  };

  const handleManualCloudinaryCleanup = async (forceAll = false) => {
    setIsBusy(true);
    setProgressLabel(
      forceAll
        ? 'Destroying all staged Cloudinary assets...'
        : 'Sweeping expired published Cloudinary assets...'
    );
    try {
      const res = await cleanupPublishedCloudinaryMedia({ forceAll });
      await loadStatus();
      onRefreshVault();
      onShowToast(
        res.cleanedPublicIds.length > 0
          ? `✓ Deleted ${res.cleanedPublicIds.length} staged slide image(s) from Cloudinary`
          : '✓ Cloudinary staging folder is already clean'
      );
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Cleanup failed'}`);
    } finally {
      setIsBusy(false);
      setProgressLabel(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3 text-slate-200">
      {/* Streamlined 3-Tab Navigation Bar */}
      <div className="rounded-2xl border border-white/10 bg-[#0b1218]/95 px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shadow-lg">
        {/* Primary 3-Tab Segmented Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setHubMode('single')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              hubMode === 'single'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Publish Active Post</span>
          </button>
          <button
            type="button"
            onClick={() => setHubMode('program')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              hubMode === 'program'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radar className="w-3.5 h-3.5 text-cyan-400" />
            <span>Gather & Peak (10 · 12 · 18) Program</span>
            <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono text-cyan-200 tabular-nums">
              {
                savedPosts.filter(
                  (p) => p.postStatus !== 'posted' && p.deck?.sourceMeta?.userReviewed === false
                ).length
              }{' '}
              review
            </span>
          </button>
          <button
            type="button"
            onClick={() => setHubMode('posts')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              hubMode === 'posts'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Posts & Calendar</span>
            <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono text-white tabular-nums">
              {savedPosts.length}
            </span>
          </button>
        </div>

        {/* Right: Direct API Connection Badges (Database + Buffer + Zernio) */}
        <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
              storageEngine === 'neon-postgres'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : storageEngine === 'cloud-kv'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : storageEngine === 'local-disk'
                ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                : 'border-white/10 bg-white/[0.03] text-slate-400'
            }`}
            title={
              storageEngine === 'neon-postgres'
                ? 'Durable Neon PostgreSQL cloud pooler connected across all devices'
                : 'Local vault storage'
            }
          >
            <Database className="w-3 h-3" />
            {storageEngine === 'neon-postgres'
              ? 'Neon Postgres'
              : storageEngine === 'cloud-kv'
              ? 'Vercel KV'
              : storageEngine === 'local-disk'
              ? 'Local Disk'
              : 'Local Vault'}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
              status?.bufferApiConfigured
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-white/10 bg-white/[0.03] text-slate-400'
            }`}
          >
            {status?.bufferApiConfigured ? 'Buffer Connected' : 'Buffer: Off'}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
              status?.zernioApiConfigured
                ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                : 'border-white/10 bg-white/[0.03] text-slate-400'
            }`}
          >
            {status?.zernioApiConfigured ? 'Zernio Connected' : 'Zernio: Off'}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
              status?.cloudinaryConfigured
                ? 'border-purple-500/30 bg-purple-500/10 text-purple-300'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            }`}
            title={
              status?.cloudinaryConfigured
                ? `Cloudinary connected (${status.cloudinaryCloudName})`
                : 'Cloudinary environment variables missing on Vercel'
            }
          >
            <Cloud className="w-3 h-3" />
            {status?.cloudinaryConfigured
              ? `Cloudinary: ${status.cloudinaryCloudName || 'Ready'}`
              : 'Cloudinary: Missing Env'}
          </span>
        </div>
      </div>

      {/* TAB 2: GATHER, REVIEW QUEUE & PEAK (10 · 12 · 18) WEEKLY PROGRAM */}
      {hubMode === 'program' ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <WeeklyProgramReviewPanel
            savedPosts={savedPosts}
            activeCarouselId={carousel.id}
            theme={theme}
            onEditInStudio={(post) => {
              if (onSelectPostIntoStudio) {
                onSelectPostIntoStudio(post);
              } else {
                onBackToStudio();
              }
            }}
            onRefreshVault={onRefreshVault}
            onRefreshStatus={() => void loadStatus()}
            onShowToast={onShowToast}
          />
        </div>
      ) : hubMode === 'posts' ? (
        /* TAB 3: UNIFIED POSTS & CALENDAR MANAGER */
        <PostManagerPanel
          savedPosts={savedPosts}
          activeCarouselId={carousel.id}
          theme={theme}
          onEditInStudio={(post) => {
            if (onSelectPostIntoStudio) {
              onSelectPostIntoStudio(post);
            } else {
              onBackToStudio();
            }
          }}
          onRefreshVault={onRefreshVault}
          onRefreshStatus={() => void loadStatus()}
          onShowToast={onShowToast}
          onExportVaultJson={onExportVaultJson}
          onImportVaultJson={onImportVaultJson}
        />
      ) : (
        /* TAB 1: CLEAN PUBLISH ACTIVE POST COMPOSER */
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 overflow-y-auto">
          {/* LEFT COLUMN (5 cols): Active Deck, Channels, TikTok Sound, Schedule & Primary Publish CTA */}
          <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#0b1218]/90 p-4 flex flex-col justify-between gap-4">
            <div className="space-y-4">
              {/* Active Deck Summary Card */}
              <div className="p-3.5 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-300">
                    <span className="uppercase font-bold">
                      {carousel.postFormat || 'carousel'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{carousel.slides.length} Slides</span>
                  </div>
                  <div className="text-sm font-bold text-white truncate mt-1">
                    {carousel.slides[0]?.enTitle || 'Untitled Post'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onBackToStudio}
                  className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-bold text-slate-200 cursor-pointer shrink-0 whitespace-nowrap"
                >
                  Edit Slides
                </button>
              </div>

              {/* 1. Target Channels */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    1. Select Channels
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400 tabular-nums">
                    {selectedTargets.length} selected
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(PLATFORM_META) as PublishTargetPlatform[]).map((platform) => {
                    const meta = PLATFORM_META[platform];
                    const active = selectedTargets.includes(platform);
                    const liveChannel = status?.channels?.find((c) => c.service === platform);
                    const providerLabel =
                      liveChannel?.provider === 'zernio' ||
                      (platform === 'tiktok' && status?.zernioApiConfigured)
                        ? 'Zernio API'
                        : liveChannel?.provider === 'buffer' && status?.bufferApiConfigured
                        ? 'Buffer API'
                        : meta.providerLabel;
                    return (
                      <button
                        key={platform}
                        type="button"
                        onClick={() => togglePlatform(platform)}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'border-emerald-400/40 bg-emerald-500/10 text-white'
                            : 'border-white/10 bg-black/20 text-slate-400 opacity-60 hover:opacity-90'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: meta.badgeColor }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold truncate">{meta.label}</div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {liveChannel?.handle || meta.handle} · {providerLabel}
                          </div>
                        </div>
                        {active && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* TikTok Trending Commercial Music Selector (Shown when TikTok is selected) */}
              {selectedTargets.includes('tiktok') && (
                <div className="p-3 rounded-xl border border-cyan-500/25 bg-cyan-500/[0.04] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-200">
                      <Music className="w-3.5 h-3.5 text-cyan-400" />
                      <span>TikTok Background Sound</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {activeTikTokTrack?.previewUrl && (
                        <button
                          type="button"
                          onClick={() => handleToggleAudioPreview(activeTikTokTrack)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                            playingTrackId === activeTikTokTrack.musicSoundId
                              ? 'border-amber-400/50 bg-amber-500/20 text-amber-200'
                              : 'border-cyan-400/40 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200'
                          }`}
                          title="Preview selected TikTok track"
                        >
                          {playingTrackId === activeTikTokTrack.musicSoundId ? (
                            <>
                              <Square className="w-2.5 h-2.5 fill-current" />
                              <span>Stop</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-2.5 h-2.5 fill-current" />
                              <span>Preview</span>
                            </>
                          )}
                        </button>
                      )}
                      {tiktokTracks.length > 1 && (
                        <button
                          type="button"
                          onClick={handleShuffleTrendingTrack}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 cursor-pointer"
                          title="Pick another trending TikTok track"
                        >
                          <Shuffle className="w-2.5 h-2.5" />
                          <span>Shuffle</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <select
                    aria-label="Select TikTok background sound"
                    value={selectedMusicSoundId}
                    onChange={(e) => {
                      if (playingTrackId && audioRef.current) {
                        audioRef.current.pause();
                        setPlayingTrackId(null);
                      }
                      setSelectedMusicSoundId(e.target.value);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="auto">
                      {tiktokTracks[0]
                        ? `Auto-Pick #1 Trending: ${tiktokTracks[0].name} — ${tiktokTracks[0].artist} (${tiktokTracks[0].durationSec}s)`
                        : 'Auto-Pick Top Trending Sound'}
                    </option>
                    {tiktokTracks.map((t) => (
                      <option key={t.musicSoundId} value={t.musicSoundId}>
                        #{t.rank} {t.name} — {t.artist} ({t.durationSec}s
                        {t.genres.length > 0 ? ` · ${t.genres.slice(0, 2).join('/')}` : ''})
                      </option>
                    ))}
                    <option value="none">No Background Music</option>
                  </select>
                </div>
              )}

              {/* 2. When to Publish */}
              <div className="space-y-2.5">
                <span className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  2. When to Publish
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleMode('customScheduled')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      scheduleMode === 'customScheduled'
                        ? 'border-emerald-400 bg-emerald-500/15 text-white'
                        : 'border-white/10 bg-black/20 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-bold">Schedule</div>
                    <div className="text-[10px] opacity-75">Pick Date & Time</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode('addToQueue')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      scheduleMode === 'addToQueue'
                        ? 'border-emerald-400 bg-emerald-500/15 text-white'
                        : 'border-white/10 bg-black/20 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-bold">Add to Queue</div>
                    <div className="text-[10px] opacity-75">Next Open Slot</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode('shareNow')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      scheduleMode === 'shareNow'
                        ? 'border-emerald-400 bg-emerald-500/15 text-white'
                        : 'border-white/10 bg-black/20 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-bold">Publish Now</div>
                    <div className="text-[10px] opacity-75">Immediate</div>
                  </button>
                </div>

                {scheduleMode === 'customScheduled' && (
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                          Date (Local)
                        </label>
                        <input
                          type="date"
                          min={getLocalTodayDateStr()}
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                          Time (24h)
                        </label>
                        <input
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => {
                            const nextSlot = resolveNextFutureSlotForTime(
                              scheduledDate,
                              e.target.value
                            );
                            setScheduledDate(nextSlot.datePart);
                            setScheduledTime(nextSlot.timeShort);
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 px-1">
                      <span className="text-[10px] font-mono text-slate-400">
                        TikTok & IG Best Times (Future Only):
                      </span>
                      <div className="flex items-center gap-1.5">
                        {(['10:00', '12:00', '18:00'] as const).map((peakTime) => (
                          <button
                            key={peakTime}
                            type="button"
                            onClick={() => {
                              const nextSlot = resolveNextFutureSlotForTime(
                                scheduledDate,
                                peakTime
                              );
                              setScheduledDate(nextSlot.datePart);
                              setScheduledTime(nextSlot.timeShort);
                              if (nextSlot.rolledToTomorrow) {
                                onShowToast(
                                  `${peakTime} has passed today — set to Tomorrow (${nextSlot.datePart}) at ${peakTime}`
                                );
                              }
                            }}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold tabular-nums cursor-pointer transition-colors ${
                              scheduledTime === peakTime
                                ? 'bg-emerald-400 text-slate-950'
                                : 'bg-white/10 text-slate-300 hover:text-white'
                            }`}
                          >
                            {peakTime}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Primary Action Footer */}
            <div className="space-y-2.5 pt-3 border-t border-white/10">
              {lastDispatchSummary &&
                (lastDispatchSummary.warnings.length > 0 ||
                  lastDispatchSummary.channelResults.length > 0) && (
                  <div className="p-3 rounded-xl border border-white/10 bg-black/50 space-y-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-mono uppercase tracking-wider text-slate-300 font-bold text-[10px]">
                        Last Dispatch Status
                      </span>
                      <button
                        type="button"
                        onClick={() => setLastDispatchSummary(null)}
                        className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {lastDispatchSummary.channelResults.map((ch) => (
                        <span
                          key={ch.service}
                          className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                            ch.ok && (ch.provider === 'buffer' || ch.provider === 'zernio')
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : ch.ok
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                          title={ch.message}
                        >
                          {ch.service}:{' '}
                          {ch.provider === 'zernio'
                            ? ch.ok
                              ? 'Zernio ✓'
                              : 'Zernio Failed'
                            : ch.provider === 'buffer'
                            ? ch.ok
                              ? 'Buffer ✓'
                              : 'Buffer Failed'
                            : 'Saved ✓'}
                        </span>
                      ))}
                    </div>
                    {lastDispatchSummary.warnings.map((w, i) => (
                      <div key={i} className="text-[10px] text-amber-300 leading-snug">
                        • {w}
                      </div>
                    ))}
                    {(() => {
                      const failedChannels = lastDispatchSummary.channelResults.filter(
                        (ch) => !ch.ok && (ch.provider === 'buffer' || ch.provider === 'zernio')
                      );
                      if (failedChannels.length === 0) return null;
                      const failedTargets = failedChannels.map((ch) => ch.service);
                      return (
                        <div className="pt-1.5 border-t border-amber-500/25 space-y-1.5">
                          <div className="text-[10px] font-mono text-amber-200">
                            Partial dispatch detected ({failedTargets.join(', ')} failed). Choose how to recover:
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void handleDispatchPublishAndSchedule({
                                  targetSubset: failedTargets,
                                  mergeRemoteIds: true,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold cursor-pointer disabled:opacity-50"
                            >
                              Retry Failed Channels Only ({failedTargets.join(', ')})
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void handleDispatchPublishAndSchedule({
                                  cancelExistingBeforeDispatch: true,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/35 text-amber-200 text-[10px] font-bold cursor-pointer disabled:opacity-50"
                            >
                              Cancel & Re-Dispatch All
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                    {lastDispatchSummary.mode && lastDispatchSummary.mode !== 'shareNow' && (
                      <div className="pt-1 flex items-center justify-between gap-2 border-t border-white/10">
                        <span className="text-[10px] font-mono text-cyan-200">
                          Scheduled (not posted yet)
                        </span>
                        <button
                          type="button"
                          onClick={() => setHubMode('posts')}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-[10px] font-bold cursor-pointer"
                        >
                          View / Cancel Schedule in Posts & Calendar →
                        </button>
                      </div>
                    )}
                  </div>
                )}

              {progressLabel && (
                <div className="p-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 flex items-center gap-2 text-xs font-mono text-cyan-200">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="truncate">{progressLabel}</span>
                </div>
              )}

              <button
                type="button"
                disabled={isBusy || selectedTargets.length === 0}
                onClick={() => void handleDispatchPublishAndSchedule()}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-extrabold text-xs text-slate-950 shadow-lg transition-all cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: theme.accent }}
              >
                <Send className="w-4 h-4" />
                <span>
                  {scheduleMode === 'shareNow'
                    ? 'Publish Now'
                    : scheduleMode === 'addToQueue'
                    ? 'Add to Channel Queue'
                    : `Schedule for ${scheduledDate} at ${scheduledTime}`}
                </span>
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN (7 cols): Caption Editor + Collapsible Advanced Platform & Zernio MCP Options */}
          <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#0b1218]/90 p-4 flex flex-col gap-4 overflow-y-auto">
            {/* Clean Bilingual Caption Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  3. Post Caption (Bilingual EN / AR)
                </label>
                <button
                  type="button"
                  onClick={handleAutoFillActiveFields}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-[11px] font-semibold text-slate-300 cursor-pointer"
                >
                  <Wand2 className="w-3 h-3 text-emerald-400" />
                  <span>Auto-Fill Metadata</span>
                </button>
              </div>
              <textarea
                rows={7}
                value={customCaption}
                onChange={(e) => setCustomCaption(e.target.value)}
                placeholder="Write or edit your post caption..."
                className="w-full p-3 rounded-xl bg-black/40 border border-white/15 text-xs text-slate-100 leading-relaxed resize-y focus:outline-none focus:border-emerald-400"
              />
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                <span>{customCaption.length} characters</span>
                <span>4:5 IG/FB/LI + 9:16 TikTok Auto-Staged</span>
              </div>
            </div>

            {/* Collapsible Advanced Platform & Zernio MCP Options Disclosure */}
            <details className="group rounded-xl border border-white/10 bg-black/30 overflow-hidden">
              <summary className="px-3.5 py-2.5 flex items-center justify-between cursor-pointer select-none text-xs font-bold text-slate-300 hover:text-white">
                <span className="flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Advanced Platform & Zernio MCP Options (TikTok Title, LinkedIn PDF, Alt Texts)</span>
                </span>
                <span className="text-[10px] font-mono text-slate-400 group-open:rotate-180 transition-transform">
                  ▼
                </span>
              </summary>

              <div className="p-3.5 pt-2 border-t border-white/10 space-y-4">
                {/* Zernio Free API & Hosted MCP Server Info Banner */}
                <div className="p-3 rounded-xl border border-cyan-500/25 bg-cyan-500/5 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-cyan-200">
                      Zernio Free API + Hosted MCP Server (TikTok & Instagram)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText('https://mcp.zernio.com/mcp');
                        onShowToast('✓ Copied Zernio MCP Server URL: https://mcp.zernio.com/mcp');
                      }}
                      className="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 font-mono text-[10px] cursor-pointer shrink-0"
                    >
                      Copy MCP URL
                    </button>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Direct API publishing via <code className="text-emerald-300 font-mono">Buffer</code> (Facebook, LinkedIn, Instagram) + <code className="text-cyan-300 font-mono">Zernio</code> (TikTok Photo Carousel with Commercial Music & Instagram failover). Hosted MCP endpoint:{' '}
                    <code className="text-slate-200 font-mono">https://mcp.zernio.com/mcp</code>
                  </p>
                </div>

                {/* Platform-Specific Titles & First Comment */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                      <span>TikTok Photo Title</span>
                      <span>{tiktokTitle.length}/90</span>
                    </div>
                    <input
                      type="text"
                      maxLength={90}
                      value={tiktokTitle}
                      onChange={(e) => setTiktokTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/15 text-xs text-white"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                      <span>LinkedIn PDF Document Title</span>
                      <span>{documentTitle.length}/58</span>
                    </div>
                    <input
                      type="text"
                      maxLength={58}
                      value={documentTitle}
                      onChange={(e) => setDocumentTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/15 text-xs text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">
                    First Comment (Citations & Links)
                  </label>
                  <textarea
                    rows={2}
                    value={firstComment}
                    onChange={(e) => setFirstComment(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/15 text-xs text-slate-200 resize-y"
                  />
                </div>

                {/* Platform Switches */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <label className="flex items-center gap-2 p-2 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateOpts.linkedInImagesAsCarousel}
                      onChange={(e) =>
                        setTemplateOpts((p) => ({
                          ...p,
                          linkedInImagesAsCarousel: e.target.checked,
                        }))
                      }
                      className="rounded border-white/20 text-emerald-500"
                    />
                    <span>LinkedIn PDF Carousel</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateOpts.tiktokAutoAddMusic}
                      onChange={(e) =>
                        setTemplateOpts((p) => ({
                          ...p,
                          tiktokAutoAddMusic: e.target.checked,
                        }))
                      }
                      className="rounded border-white/20 text-emerald-500"
                    />
                    <span>TikTok Auto Add Music</span>
                  </label>
                </div>

                {/* Slide Alt Texts Toggle */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAltTextEditor(!showAltTextEditor)}
                    className="text-[11px] font-mono text-cyan-400 hover:underline cursor-pointer"
                  >
                    {showAltTextEditor
                      ? 'Hide Slide Alt Texts'
                      : `Edit Slide Alt Texts (${altTexts.length})`}
                  </button>
                  {showAltTextEditor && (
                    <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {altTexts.map((alt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-500 w-12 shrink-0">
                            Slide {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={alt}
                            onChange={(e) => {
                              const next = [...altTexts];
                              next[idx] = e.target.value;
                              setAltTexts(next);
                            }}
                            className="flex-1 px-2 py-1 rounded bg-slate-950 border border-white/10 text-[11px] text-slate-200"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Manual Staging & Cleanup Utility Bar */}
                <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleStageSlidesToCloudinary}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-[11px] font-bold text-cyan-200 cursor-pointer"
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    <span>Pre-Stage Slide Images</span>
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleManualCloudinaryCleanup(false)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-semibold text-slate-300 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Clean Expired Staged Media</span>
                  </button>
                </div>
              </div>
            </details>
          </div>
        </div>
      )}
    </div>
  );
};
