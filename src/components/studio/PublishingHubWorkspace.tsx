import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  FileEdit,
  AlertTriangle,
  Plug2,
  ChevronDown,
} from 'lucide-react';
import {
  CarouselData,
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
  derivePostLifecycleStage,
  dispatchPostPublish,
  fetchPublishStatus,
  fetchTikTokCommercialMusic,
  formatLocalDateTimeParts,
  getDefaultUpcomingTimeStr,
  getLocalTodayDateStr,
  MetricoolTemplateOptions,
  PublishStatusResponse,
  resolveNextFutureSlotForTime,
  TikTokCommercialTrack,
  uploadDeckSlidesForPublishing,
} from '../../lib/publish/publishClient.ts';
import { saveValidPost } from '../../lib/storage/postsVaultClient.ts';
import { PostManagerPanel } from './PostManagerPanel.tsx';
import { WeeklyProgramReviewPanel } from './WeeklyProgramReviewPanel.tsx';

export type PublishHubMode = 'inbox' | 'draft' | 'schedule';
export type LegacyCompatibleHubTab =
  | PublishHubMode
  | 'single'
  | 'program'
  | 'posts'
  | 'bulk'
  | 'storage';

interface PublishingHubWorkspaceProps {
  initialTab?: LegacyCompatibleHubTab;
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

function normalizeHubMode(tab?: LegacyCompatibleHubTab): PublishHubMode {
  if (tab === 'inbox' || tab === 'program') return 'inbox';
  if (tab === 'schedule' || tab === 'posts' || tab === 'bulk') return 'schedule';
  return 'draft';
}

export const PublishingHubWorkspace: React.FC<PublishingHubWorkspaceProps> = ({
  initialTab = 'draft',
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
  const [hubMode, setHubMode] = useState<PublishHubMode>(() => normalizeHubMode(initialTab));
  const [showActiveComposer, setShowActiveComposer] = useState<boolean>(
    () => initialTab === 'single'
  );
  const [status, setStatus] = useState<PublishStatusResponse | null>(null);
  const [showConnectionsMenu, setShowConnectionsMenu] = useState<boolean>(false);
  const connectionsMenuRef = useRef<HTMLDivElement | null>(null);

  const [selectedTargets, setSelectedTargets] = useState<PublishTargetPlatform[]>([
    'instagram',
    'facebook',
    'linkedin',
    'tiktok',
  ]);

  const [scheduleMode, setScheduleMode] = useState<PublishScheduleMode>('shareNow');
  const [scheduledDate, setScheduledDate] = useState<string>(getLocalTodayDateStr);
  const [scheduledTime, setScheduledTime] = useState<string>(getDefaultUpcomingTimeStr);
  const [autoCleanupImmediate] = useState<boolean>(true);
  const [lastDispatchSummary, setLastDispatchSummary] = useState<{
    channelResults: ChannelDispatchResult[];
    warnings: string[];
    mode?: PublishScheduleMode;
    scheduledFor?: string | null;
  } | null>(null);

  // Active Deck mandatory safety gate states
  const [activeHumanReviewed, setActiveHumanReviewed] = useState<boolean>(() =>
    Boolean(carousel.sourceMeta?.userReviewed === true || carousel.sourceMeta?.humanApproved === true)
  );
  const [activeNumbersVerified, setActiveNumbersVerified] = useState<boolean>(() =>
    Boolean(carousel.sourceMeta?.verifiedNumbers === true)
  );

  const [templateOpts] = useState<MetricoolTemplateOptions>(
    DEFAULT_METRICOOL_TEMPLATE_OPTIONS
  );

  const [tiktokTracks, setTiktokTracks] = useState<TikTokCommercialTrack[]>([]);
  const [selectedMusicSoundId, setSelectedMusicSoundId] = useState<string>('auto');
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const [stagedUrlsByPostId, setStagedUrlsByPostId] = useState<Record<string, string[]>>({});
  const [stagedPublicIdsByPostId, setStagedPublicIdsByPostId] = useState<Record<string, string[]>>({});

  const [isBusy, setIsBusy] = useState(false);
  const [publishingPostId, setPublishingPostId] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const activePostKey = carousel.id || 'active_studio_deck';

  const loadStatus = useCallback(async () => {
    try {
      const data = await fetchPublishStatus();
      setStatus(data);
      if (data.autoCleanedPostIds && data.autoCleanedPostIds.length > 0) {
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
    if (!showConnectionsMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (connectionsMenuRef.current && !connectionsMenuRef.current.contains(e.target as Node)) {
        setShowConnectionsMenu(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowConnectionsMenu(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [showConnectionsMenu]);

  useEffect(() => {
    setHubMode(normalizeHubMode(initialTab));
    if (initialTab === 'single') {
      setShowActiveComposer(true);
    }
  }, [initialTab]);

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
    setActiveHumanReviewed(
      Boolean(
        carousel.sourceMeta?.userReviewed === true ||
          carousel.sourceMeta?.humanApproved === true
      )
    );
    setActiveNumbersVerified(Boolean(carousel.sourceMeta?.verifiedNumbers === true));
  }, [carousel]);

  const effectiveStorageEngine: SavedPostStorageEngine =
    status?.storageEngine || storageEngine || 'local-disk';

  const connectionIssues = useMemo(() => {
    if (!status) return [];
    const issues: string[] = [];
    if (!status.cloudinaryConfigured) {
      issues.push('Media staging (Cloudinary) required');
    }
    if (
      effectiveStorageEngine !== 'neon-postgres' &&
      effectiveStorageEngine !== 'cloud-kv' &&
      effectiveStorageEngine !== 'local-disk'
    ) {
      issues.push('Offline local browser draft mode');
    }
    if (!status.bufferApiConfigured && !status.zernioApiConfigured) {
      issues.push('No social publishing API connected');
    }
    return issues;
  }, [status, effectiveStorageEngine]);

  const { draftCount, scheduledCount, targetDatePostCount } = useMemo(() => {
    const now = Date.now();
    let draft = 0;
    let scheduled = 0;
    let onDate = 0;
    for (const post of savedPosts) {
      const stage = derivePostLifecycleStage(post, now);
      if (stage === 'draft' || stage === 'attention') draft += 1;
      if (stage === 'scheduled') scheduled += 1;
      const refIso = post.scheduledFor || (post.postStatus === 'posted' ? post.postedAt : undefined);
      if (refIso && formatLocalDateTimeParts(refIso).datePart === scheduledDate) {
        onDate += 1;
      }
    }
    return { draftCount: draft, scheduledCount: scheduled, targetDatePostCount: onDate };
  }, [savedPosts, scheduledDate]);

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
    const picked = candidates[Math.floor(Math.random() * candidates.length)] || pool[0];
    if (picked) {
      setSelectedMusicSoundId(picked.musicSoundId);
      if (playingTrackId && audioRef.current) {
        audioRef.current.pause();
        setPlayingTrackId(null);
      }
      onShowToast(`♪ Selected trending track: ${picked.name} — ${picked.artist}`);
    }
  };

  const handleStageSlidesToCloudinary = async () => {
    if (status && !status.cloudinaryConfigured) {
      onShowToast(
        '⚠️ Cloudinary media staging is required. Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your environment.'
      );
      return;
    }
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
        `✓ Staged ${uploaded.urls.length} slide(s) to Cloudinary media staging`
      );
      await loadStatus();
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Cloudinary staging failed'}`);
    } finally {
      setIsBusy(false);
      setProgressLabel(null);
    }
  };

  // Direct Publish Now action for any Draft or Scheduled post card
  const handlePublishPostNow = async (
    post: SavedPostRecord,
    targetsOverride?: PublishTargetPlatform[]
  ) => {
    if (status && !status.cloudinaryConfigured) {
      onShowToast(
        '⚠️ Cloudinary media staging is required to publish. Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your environment.'
      );
      return;
    }
    const humanOk = Boolean(
      post.humanApproved === true || post.deck?.sourceMeta?.userReviewed === true
    );
    const numbersOk = Boolean(
      post.verifiedNumbers === true || post.deck?.sourceMeta?.verifiedNumbers === true
    );
    if (!humanOk || !numbersOk) {
      onShowToast(
        '⚠️ Review Safety Gate: Confirm "Human Reviewed" and "Claims & Numbers Verified" before publishing.'
      );
      return;
    }

    const activeTargets: PublishTargetPlatform[] =
      targetsOverride && targetsOverride.length > 0
        ? targetsOverride
        : post.publishTargets && post.publishTargets.length > 0
        ? post.publishTargets
        : ['instagram', 'facebook', 'linkedin', 'tiktok'];

    setPublishingPostId(post.id);
    setProgressLabel(`Publishing "${post.title.slice(0, 32)}" immediately...`);
    try {
      const hasTikTok = activeTargets.includes('tiktok');
      const hasOther = activeTargets.some((t) => t !== 'tiktok');
      const primaryPreset = hasTikTok && !hasOther ? 'tiktok-9:16' : 'ig-4:5';

      const uploaded = await uploadDeckSlidesForPublishing(
        post.deck,
        primaryPreset,
        theme,
        (stage) => setProgressLabel(`Staging media: ${stage}`)
      );

      let pubIds = [...uploaded.publicIds];
      let tiktokUrls: string[] | undefined = undefined;
      if (hasTikTok && hasOther && status?.zernioApiConfigured) {
        const uploadedTikTok = await uploadDeckSlidesForPublishing(
          post.deck,
          'tiktok-9:16',
          theme,
          (stage) => setProgressLabel(`TikTok 9:16: ${stage}`)
        );
        tiktokUrls = uploadedTikTok.urls;
        pubIds = Array.from(new Set([...pubIds, ...uploadedTikTok.publicIds]));
      }

      const dispatchRes = await dispatchPostPublish({
        postId: post.id,
        deck: {
          ...post.deck,
          sourceMeta: {
            ...post.deck.sourceMeta,
            userReviewed: true,
            humanApproved: true,
            verifiedNumbers: true,
          },
        },
        title: post.title,
        caption: post.deck?.caption || post.title,
        mode: 'shareNow',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Algiers',
        targets: activeTargets,
        imageUrls: uploaded.urls,
        tiktokImageUrls: tiktokUrls,
        cloudinaryPublicIds: pubIds,
        autoCleanupImmediate: autoCleanupImmediate,
        tiktokSettings: {
          privacyLevel: templateOpts.tiktokPostPrivacy,
          photoCoverIndex: templateOpts.tiktokPhotoCoverIndex,
          autoAddMusic: selectedMusicSoundId !== 'none' && templateOpts.tiktokAutoAddMusic,
          allowComment: !templateOpts.tiktokDisableComments,
          title: deriveMetricoolTikTokTitle(post.deck),
          musicSoundId: activeTikTokTrack?.musicSoundId || 'auto',
        },
      });

      onRefreshVault();
      await loadStatus();

      if ((dispatchRes.bufferFailedCount ?? 0) > 0) {
        onShowToast(`⚠️ ${dispatchRes.warnings?.[0] || 'One or more channels failed'}`);
      } else {
        onShowToast(`✓ Published "${post.title.slice(0, 32)}" immediately!`);
      }
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Publish Now failed'}`);
    } finally {
      setPublishingPostId(null);
      setProgressLabel(null);
    }
  };

  const handleDispatchPublishAndSchedule = async (options?: {
    targetSubset?: PublishTargetPlatform[];
    mergeRemoteIds?: boolean;
    cancelExistingBeforeDispatch?: boolean;
  }) => {
    if (status && !status.cloudinaryConfigured) {
      onShowToast(
        '⚠️ Cloudinary media staging is required to publish or schedule. Please configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your environment.'
      );
      return;
    }
    if (!activeHumanReviewed || !activeNumbersVerified) {
      onShowToast(
        '⚠️ Review Safety Gate: Check "Human Reviewed" and "Claims & Numbers Verified" before scheduling or publishing.'
      );
      return;
    }

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

      const verifiedDeck: CarouselData = {
        ...carousel,
        caption: customCaption,
        sourceMeta: {
          ...carousel.sourceMeta,
          userReviewed: true,
          humanApproved: true,
          verifiedNumbers: true,
        },
      };

      await saveValidPost({
        deck: verifiedDeck,
        postStatus: 'validated',
        title: carousel.slides[0]?.enTitle || 'Untitled Post',
        allowOverride: true,
        userReviewed: true,
        verifiedNumbers: true,
      });

      let urls = stagedUrlsByPostId[activePostKey];
      let pubIds = stagedPublicIdsByPostId[activePostKey] || [];
      let tiktokUrls: string[] | undefined = undefined;

      if (!urls || urls.length === 0) {
        const uploaded = await uploadDeckSlidesForPublishing(
          verifiedDeck,
          renderPreset,
          theme,
          (stage) => setProgressLabel(stage)
        );
        urls = uploaded.urls;
        pubIds = uploaded.publicIds;
        setStagedUrlsByPostId((prev) => ({ ...prev, [activePostKey]: urls }));
        setStagedPublicIdsByPostId((prev) => ({ ...prev, [activePostKey]: pubIds }));
      }

      if (hasTikTokTarget && hasMetaOrLinkedInTarget && status?.zernioApiConfigured) {
        const uploadedTikTok = await uploadDeckSlidesForPublishing(
          verifiedDeck,
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
        deck: verifiedDeck,
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
    <div
      className="flex-1 flex flex-col min-h-0 gap-3 text-slate-200"
      data-testid="publishing-hub-workspace"
    >
      {/* Flattened Top 3-Step Pipeline Navigation: Inbox -> Draft -> Schedule */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0b1218]/95 px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shadow-lg">
        <div
          role="tablist"
          aria-label="Workflow Pipeline"
          className="flex flex-wrap items-center gap-1.5 bg-black/40 p-1 rounded-lg border border-white/10"
        >
          <button
            type="button"
            role="tab"
            aria-selected={hubMode === 'inbox'}
            data-testid="hub-tab-inbox"
            onClick={() => setHubMode('inbox')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              hubMode === 'inbox'
                ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Radar className="w-3.5 h-3.5 text-cyan-400" />
            <span>Inbox</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={hubMode === 'draft'}
            data-testid="hub-tab-draft"
            onClick={() => setHubMode('draft')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              hubMode === 'draft'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileEdit className="w-3.5 h-3.5" />
            <span>Draft</span>
            <span className="text-[11px] font-mono text-slate-300 tabular-nums">
              · {draftCount}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={hubMode === 'schedule'}
            data-testid="hub-tab-schedule"
            onClick={() => setHubMode('schedule')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              hubMode === 'schedule'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Schedule</span>
            <span className="text-[11px] font-mono text-slate-300 tabular-nums">
              · {scheduledCount}
            </span>
          </button>
        </div>

        {/* Right: Quick Active Deck Publisher Trigger + Single Connections Menu (Problem Badge Only) */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            data-testid="toggle-active-composer-btn"
            onClick={() => {
              setHubMode('draft');
              setShowActiveComposer((prev) => !prev);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-bold cursor-pointer whitespace-nowrap transition-colors ${
              showActiveComposer && hubMode === 'draft'
                ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                : 'border-white/15 bg-white/[0.04] hover:bg-white/[0.09] text-slate-200'
            }`}
          >
            <Send className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {showActiveComposer && hubMode === 'draft'
                ? 'Hide Active Deck Composer'
                : 'Publish Active Post'}
            </span>
          </button>

          <div className="relative" ref={connectionsMenuRef}>
            <button
              type="button"
              data-testid="connections-menu-btn"
              aria-expanded={showConnectionsMenu}
              aria-haspopup="menu"
              onClick={() => setShowConnectionsMenu((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                connectionIssues.length > 0
                  ? 'border-amber-400/45 bg-amber-500/12 text-amber-200 hover:bg-amber-500/20'
                  : 'border-white/15 bg-white/[0.04] text-slate-300 hover:text-white hover:bg-white/[0.08]'
              }`}
              title={
                connectionIssues.length > 0
                  ? connectionIssues.join(' · ')
                  : 'View publishing & storage connections'
              }
            >
              {connectionIssues.length > 0 ? (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              ) : (
                <Plug2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <span>Connections</span>
              {connectionIssues.length > 0 && (
                <span
                  data-testid="connections-issue-badge"
                  className="px-1.5 py-0.2 rounded bg-amber-500/25 border border-amber-400/40 text-[10px] font-mono tabular-nums font-bold text-amber-200"
                >
                  {connectionIssues.length}
                </span>
              )}
              <ChevronDown className="w-3 h-3 opacity-75 shrink-0" />
            </button>

            {showConnectionsMenu && (
              <div
                role="menu"
                data-testid="connections-popover"
                className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-white/15 bg-[#080f14] p-3 shadow-2xl z-50 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <span className="font-bold text-white">Connections & Storage</span>
                  <button
                    type="button"
                    onClick={() => void loadStatus()}
                    className="text-[11px] font-mono text-cyan-300 hover:text-cyan-200 cursor-pointer"
                  >
                    Refresh
                  </button>
                </div>

                <div className="space-y-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400 inline-flex items-center gap-1.5">
                      <Database className="w-3 h-3 shrink-0" />
                      <span>Storage</span>
                    </span>
                    <span
                      data-testid="status-db-engine"
                      className={
                        effectiveStorageEngine === 'neon-postgres' ||
                        effectiveStorageEngine === 'cloud-kv'
                          ? 'text-emerald-300 font-semibold'
                          : !status
                          ? 'text-slate-400'
                          : effectiveStorageEngine === 'local-disk'
                          ? 'text-cyan-300'
                          : 'text-amber-300 font-semibold'
                      }
                    >
                      {effectiveStorageEngine === 'neon-postgres'
                        ? 'Neon Postgres'
                        : effectiveStorageEngine === 'cloud-kv'
                        ? 'Cloud KV'
                        : !status
                        ? 'Checking...'
                        : effectiveStorageEngine === 'local-disk'
                        ? 'Local Disk'
                        : 'Offline Local Draft'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400 inline-flex items-center gap-1.5">
                      <Cloud className="w-3 h-3 shrink-0" />
                      <span>Media Staging</span>
                    </span>
                    <span
                      data-testid="status-cloudinary"
                      className={
                        status?.cloudinaryConfigured
                          ? 'text-emerald-300 font-semibold'
                          : !status
                          ? 'text-slate-400'
                          : 'text-amber-300 font-semibold'
                      }
                    >
                      {!status
                        ? 'Checking...'
                        : status.cloudinaryConfigured
                        ? 'Connected'
                        : 'Cloudinary Required'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Buffer (IG · FB · LI)</span>
                    <span
                      className={
                        status?.bufferApiConfigured ? 'text-emerald-300' : 'text-slate-500'
                      }
                    >
                      {status ? (status.bufferApiConfigured ? 'Connected' : 'Not connected') : '...'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Zernio (TikTok)</span>
                    <span
                      className={
                        status?.zernioApiConfigured ? 'text-emerald-300' : 'text-slate-500'
                      }
                    >
                      {status ? (status.zernioApiConfigured ? 'Connected' : 'Not connected') : '...'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Telegram Intake</span>
                    <span
                      data-testid="status-telegram"
                      className={
                        status?.telegramConfigured ? 'text-emerald-300' : 'text-slate-500'
                      }
                    >
                      {status ? (status.telegramConfigured ? 'Connected' : 'Off') : '...'}
                    </span>
                  </div>
                </div>

                {connectionIssues.length > 0 && (
                  <div className="pt-2 border-t border-white/10 text-[11px] text-amber-200 space-y-1">
                    {connectionIssues.map((issue) => (
                      <div key={issue} className="flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                        <span>{issue}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TAB 1: INBOX (Trend Radar, 4-Factor Scoring, Lazy Hook Previews, Move to Draft) */}
      {hubMode === 'inbox' && (
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
            onMovedToDraft={(count) => {
              if (count > 0) {
                onRefreshVault();
              }
            }}
            onRefreshVault={onRefreshVault}
            onRefreshStatus={() => void loadStatus()}
            onShowToast={onShowToast}
          />
        </div>
      )}

      {/* TAB 2: DRAFT (Draft Review Safety Gate + Optional Active Studio Deck Composer) */}
      {hubMode === 'draft' && (
        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto">
          {showActiveComposer && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 shrink-0">
              {/* LEFT COLUMN: Active Deck, Channels, Review Checkboxes, Schedule / Publish Now */}
              <div className="lg:col-span-5 rounded-xl border border-emerald-400/30 bg-[#0b1218]/95 p-4 flex flex-col justify-between gap-4">
                <div className="space-y-4">
                  <div className="p-3 rounded-lg border border-white/10 bg-white/[0.03] flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-300">
                        <span className="uppercase font-bold">
                          {carousel.postFormat || 'carousel'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{carousel.slides.length} Slides</span>
                      </div>
                      <div className="text-sm font-bold text-white truncate mt-0.5">
                        {carousel.slides[0]?.enTitle || 'Untitled Active Post'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onBackToStudio}
                      className="px-3 py-1.5 rounded-md border border-white/15 bg-white/[0.05] hover:bg-white/[0.1] text-xs font-bold text-slate-200 cursor-pointer shrink-0 whitespace-nowrap"
                    >
                      Edit Slides
                    </button>
                  </div>

                  {/* Channels */}
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
                            className={`flex items-center gap-2.5 p-2 rounded-lg border text-left transition-colors cursor-pointer ${
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

                  {/* TikTok Music Picker */}
                  {selectedTargets.includes('tiktok') && (
                    <div className="p-3 rounded-lg border border-cyan-500/25 bg-cyan-500/[0.04] space-y-2">
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
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold border border-cyan-400/40 bg-cyan-500/15 text-cyan-200 cursor-pointer"
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
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border border-white/15 bg-white/[0.05] text-slate-200 cursor-pointer"
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
                        onChange={(e) => setSelectedMusicSoundId(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-md bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
                      >
                        <option value="auto">
                          {tiktokTracks[0]
                            ? `Auto-Pick #1 Trending: ${tiktokTracks[0].name}`
                            : 'Auto-Pick Top Trending Sound'}
                        </option>
                        {tiktokTracks.map((t) => (
                          <option key={t.musicSoundId} value={t.musicSoundId}>
                            #{t.rank} {t.name} — {t.artist} ({t.durationSec}s)
                          </option>
                        ))}
                        <option value="none">No Background Music</option>
                      </select>
                    </div>
                  )}

                  {/* Dispatch Timing */}
                  <div className="space-y-2">
                    <span className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                      2. Publish Now or Schedule
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setScheduleMode('shareNow')}
                        className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                          scheduleMode === 'shareNow'
                            ? 'border-emerald-400 bg-emerald-500/15 text-white'
                            : 'border-white/10 bg-black/20 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="text-xs font-bold">Publish Now</div>
                        <div className="text-[10px] opacity-75">Immediate</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduleMode('customScheduled')}
                        className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                          scheduleMode === 'customScheduled'
                            ? 'border-emerald-400 bg-emerald-500/15 text-white'
                            : 'border-white/10 bg-black/20 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="text-xs font-bold">Schedule</div>
                        <div className="text-[10px] opacity-75">Pick Date &amp; Time</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduleMode('addToQueue')}
                        className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                          scheduleMode === 'addToQueue'
                            ? 'border-emerald-400 bg-emerald-500/15 text-white'
                            : 'border-white/10 bg-black/20 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="text-xs font-bold">Add to Queue</div>
                        <div className="text-[10px] opacity-75">Next Open Slot</div>
                      </button>
                    </div>

                    {scheduleMode === 'customScheduled' && (
                      <div className="space-y-2 pt-1">
                        {targetDatePostCount + 1 > 2 && (
                          <div className="px-2.5 py-1.5 rounded-md border border-amber-400/40 bg-amber-500/10 text-[11px] text-amber-200 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                            <span>
                              {scheduledDate} would exceed recommended 1–2 posts/day cadence.
                            </span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2.5">
                          <input
                            type="date"
                            min={getLocalTodayDateStr()}
                            value={scheduledDate}
                            onChange={(e) => setScheduledDate(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-md bg-black/50 border border-white/15 text-xs text-white font-mono"
                          />
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
                            className="w-full px-2.5 py-1.5 rounded-md bg-black/50 border border-white/15 text-xs text-white font-mono"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400">
                          <span>Peak Times:</span>
                          <div className="flex items-center gap-1">
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
                                }}
                                className={`px-2 py-0.5 rounded font-bold tabular-nums cursor-pointer ${
                                  scheduledTime === peakTime
                                    ? 'bg-emerald-400 text-slate-950'
                                    : 'bg-white/10 text-slate-300'
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

                  {/* Mandatory Review Safety Checkboxes for Active Deck */}
                  <div className="p-2.5 rounded-lg border border-white/10 bg-black/40 space-y-2 text-xs">
                    <div className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                      3. Mandatory Review Gate
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-200 font-semibold">
                        <input
                          type="checkbox"
                          data-testid="active-check-human-reviewed"
                          checked={activeHumanReviewed}
                          onChange={(e) => setActiveHumanReviewed(e.target.checked)}
                          className="rounded border-white/25 text-emerald-500"
                        />
                        <span>Human Reviewed</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-200 font-semibold">
                        <input
                          type="checkbox"
                          data-testid="active-check-numbers-verified"
                          checked={activeNumbersVerified}
                          onChange={(e) => setActiveNumbersVerified(e.target.checked)}
                          className="rounded border-white/25 text-emerald-500"
                        />
                        <span>Claims &amp; Numbers Verified</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Primary CTA + Last Dispatch Feedback */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  {lastDispatchSummary &&
                    (lastDispatchSummary.warnings.length > 0 ||
                      lastDispatchSummary.channelResults.length > 0) && (
                      <div className="p-2.5 rounded-lg border border-white/10 bg-black/50 space-y-1.5 text-[11px]">
                        <div className="flex flex-wrap gap-1.5">
                          {lastDispatchSummary.channelResults.map((ch) => (
                            <span
                              key={ch.service}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                                ch.ok
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {ch.service}: {ch.ok ? `${ch.provider} ✓` : 'Failed'}
                            </span>
                          ))}
                        </div>
                        {lastDispatchSummary.mode && lastDispatchSummary.mode !== 'shareNow' && (
                          <button
                            type="button"
                            onClick={() => setHubMode('schedule')}
                            className="text-[10px] font-mono text-cyan-300 underline cursor-pointer"
                          >
                            View Scheduled Item in Schedule →
                          </button>
                        )}
                      </div>
                    )}

                  {progressLabel && (
                    <div className="p-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 flex items-center gap-2 text-xs font-mono text-cyan-200">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                      <span className="truncate">{progressLabel}</span>
                    </div>
                  )}

                  {status && !status.cloudinaryConfigured && (
                    <div
                      data-testid="cloudinary-required-warning"
                      className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-200 flex items-start gap-2.5"
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-bold text-amber-300">Cloudinary Staging Required</div>
                        <div className="text-[11px] text-amber-200/90 mt-0.5 leading-relaxed">
                          Direct publishing to TikTok and social channels requires Cloudinary to host media slides. Configure <code className="px-1 py-0.5 rounded bg-black/40 font-mono text-[10px]">CLOUDINARY_CLOUD_NAME</code>, <code className="px-1 py-0.5 rounded bg-black/40 font-mono text-[10px]">CLOUDINARY_API_KEY</code>, and <code className="px-1 py-0.5 rounded bg-black/40 font-mono text-[10px]">CLOUDINARY_API_SECRET</code> in your environment variables.
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    data-testid="active-dispatch-btn"
                    disabled={
                      isBusy ||
                      selectedTargets.length === 0 ||
                      !activeHumanReviewed ||
                      !activeNumbersVerified ||
                      Boolean(status && !status.cloudinaryConfigured)
                    }
                    onClick={() => void handleDispatchPublishAndSchedule()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-extrabold text-xs text-slate-950 transition-opacity cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                    style={{ backgroundColor: theme.accent }}
                  >
                    <Send className="w-4 h-4" />
                    <span>
                      {status && !status.cloudinaryConfigured
                        ? 'Cloudinary Staging Required to Publish'
                        : scheduleMode === 'shareNow'
                        ? 'Publish Now'
                        : scheduleMode === 'addToQueue'
                        ? 'Add to Channel Queue'
                        : `Schedule for ${scheduledDate} at ${scheduledTime}`}
                    </span>
                  </button>
                </div>
              </div>

              {/* RIGHT COLUMN: Bilingual Caption + Advanced Options */}
              <div className="lg:col-span-7 rounded-xl border border-white/10 bg-[#0b1218]/95 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Active Post Caption (Bilingual EN / AR)
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoFillActiveFields}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-[11px] font-semibold text-slate-300 cursor-pointer"
                  >
                    <Wand2 className="w-3 h-3 text-emerald-400" />
                    <span>Auto-Fill Metadata</span>
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={customCaption}
                  onChange={(e) => setCustomCaption(e.target.value)}
                  className="w-full p-3 rounded-lg bg-black/40 border border-white/15 text-xs text-slate-100 leading-relaxed resize-y focus:outline-none focus:border-emerald-400"
                />

                <details className="group rounded-lg border border-white/10 bg-black/30 overflow-hidden">
                  <summary className="px-3 py-2 flex items-center justify-between cursor-pointer select-none text-xs font-bold text-slate-300 hover:text-white">
                    <span className="flex items-center gap-2">
                      <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Advanced Platform &amp; Cloudinary Staging Options</span>
                    </span>
                  </summary>
                  <div className="p-3 pt-2 border-t border-white/10 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        maxLength={90}
                        value={tiktokTitle}
                        onChange={(e) => setTiktokTitle(e.target.value)}
                        placeholder="TikTok Photo Title"
                        className="w-full px-2.5 py-1.5 rounded-md bg-slate-950 border border-white/15 text-xs text-white"
                      />
                      <input
                        type="text"
                        maxLength={58}
                        value={documentTitle}
                        onChange={(e) => setDocumentTitle(e.target.value)}
                        placeholder="LinkedIn PDF Document Title"
                        className="w-full px-2.5 py-1.5 rounded-md bg-slate-950 border border-white/15 text-xs text-white"
                      />
                    </div>
                    <textarea
                      rows={2}
                      value={firstComment}
                      onChange={(e) => setFirstComment(e.target.value)}
                      placeholder="First Comment (Citations & Links)"
                      className="w-full px-2.5 py-1.5 rounded-md bg-slate-950 border border-white/15 text-xs text-slate-200 resize-y"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAltTextEditor(!showAltTextEditor)}
                        className="text-[11px] font-mono text-cyan-400 hover:underline cursor-pointer"
                      >
                        {showAltTextEditor
                          ? 'Hide Alt Texts'
                          : `Edit Alt Texts (${altTexts.length})`}
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={handleStageSlidesToCloudinary}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 text-[11px] font-bold text-cyan-200 cursor-pointer"
                        >
                          <Cloud className="w-3.5 h-3.5" />
                          <span>Pre-Stage Media</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleManualCloudinaryCleanup(false)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/10 bg-white/[0.04] text-[11px] font-semibold text-slate-300 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>Clean Expired Media</span>
                        </button>
                      </div>
                    </div>
                    {showAltTextEditor && (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {altTexts.map((alt, idx) => (
                          <input
                            key={idx}
                            type="text"
                            value={alt}
                            onChange={(e) => {
                              const next = [...altTexts];
                              next[idx] = e.target.value;
                              setAltTexts(next);
                            }}
                            className="w-full px-2 py-1 rounded bg-slate-950 border border-white/10 text-[11px] text-slate-200"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </div>
          )}

          {/* Unscheduled Draft Review Queue */}
          <PostManagerPanel
            mode="draft"
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
            onPublishPostNow={handlePublishPostNow}
            publishingPostId={publishingPostId}
            onRefreshVault={onRefreshVault}
            onRefreshStatus={() => void loadStatus()}
            onShowToast={onShowToast}
            onExportVaultJson={onExportVaultJson}
            onImportVaultJson={onImportVaultJson}
          />
        </div>
      )}

      {/* TAB 3: SCHEDULE (Peak Schedule, 7/14d Calendar, Queue + >2/day Cadence Overload Warning + Publish Now) */}
      {hubMode === 'schedule' && (
        <PostManagerPanel
          mode="schedule"
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
          onPublishPostNow={handlePublishPostNow}
          publishingPostId={publishingPostId}
          onRefreshVault={onRefreshVault}
          onRefreshStatus={() => void loadStatus()}
          onShowToast={onShowToast}
          onExportVaultJson={onExportVaultJson}
          onImportVaultJson={onImportVaultJson}
        />
      )}
    </div>
  );
};
