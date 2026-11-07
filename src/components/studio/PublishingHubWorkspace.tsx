import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Send,
  Calendar,
  Clock,
  Cloud,
  Trash2,
  Download,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  Layers,
  ShieldCheck,
  ArrowLeft,
  Table,
  FileSpreadsheet,
  Sliders,
  Check,
  ExternalLink,
  Wand2,
} from 'lucide-react';
import {
  CarouselData,
  DEFAULT_PALETTES,
  PublishScheduleMode,
  PublishTargetPlatform,
  SavedPostRecord,
  ThemePalette,
} from '../../types.ts';
import {
  ChannelRoutingMode,
  cleanupPublishedCloudinaryMedia,
  computeWeeklyScheduleSlots,
  DEFAULT_METRICOOL_TEMPLATE_OPTIONS,
  deriveMetricoolAltTexts,
  deriveMetricoolDocumentTitle,
  deriveMetricoolFirstComment,
  deriveMetricoolTikTokTitle,
  dispatchPostPublish,
  downloadMetricoolCsvFile,
  fetchPublishStatus,
  generateMetricoolBulkCsv,
  MetricoolCsvRowInput,
  MetricoolTemplateOptions,
  OFFICIAL_METRICOOL_CSV_HEADERS,
  PublishStatusResponse,
  uploadDeckSlidesForPublishing,
  WeeklyCadencePreset,
} from '../../lib/publish/publishClient.ts';

interface PublishingHubWorkspaceProps {
  initialTab?: 'single' | 'bulk' | 'storage';
  carousel: CarouselData;
  theme: ThemePalette;
  savedPosts: SavedPostRecord[];
  onBackToStudio: () => void;
  onSelectPostIntoStudio?: (post: SavedPostRecord) => void;
  onRefreshVault: () => void;
  onShowToast: (msg: string) => void;
}

const PLATFORM_META: Record<
  PublishTargetPlatform,
  { label: string; handle: string; badgeColor: string; providerLabel: string }
> = {
  instagram: {
    label: 'Instagram',
    handle: '@marrok_org',
    badgeColor: '#E1306C',
    providerLabel: 'Buffer Free API / CSV',
  },
  facebook: {
    label: 'Facebook Page',
    handle: 'Marrok (Algiers)',
    badgeColor: '#1877F2',
    providerLabel: 'Buffer Free API / CSV',
  },
  linkedin: {
    label: 'LinkedIn Page',
    handle: 'Marrok',
    badgeColor: '#0A66C2',
    providerLabel: 'Buffer Free API / CSV',
  },
  tiktok: {
    label: 'TikTok',
    handle: '@Marrok',
    badgeColor: '#00F2FE',
    providerLabel: 'Metricool Free CSV (20/mo)',
  },
};

export const PublishingHubWorkspace: React.FC<PublishingHubWorkspaceProps> = ({
  initialTab = 'single',
  carousel,
  theme,
  savedPosts,
  onBackToStudio,
  onRefreshVault,
  onShowToast,
}) => {
  const [hubMode, setHubMode] = useState<'single' | 'bulk' | 'storage'>(initialTab);
  const [status, setStatus] = useState<PublishStatusResponse | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);

  // Channel Selection & Routing Mode
  const [selectedTargets, setSelectedTargets] = useState<PublishTargetPlatform[]>([
    'instagram',
    'facebook',
    'linkedin',
    'tiktok',
  ]);
  const [routingMode, setRoutingMode] = useState<ChannelRoutingMode>('hybrid-buffer-api');

  // Schedule Mode
  const [scheduleMode, setScheduleMode] = useState<PublishScheduleMode>('customScheduled');
  const [scheduledDate, setScheduledDate] = useState<string>(() => {
    const tomorrow = new Date(Date.now() + 24 * 3600_000);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [scheduledTime, setScheduledTime] = useState<string>('18:00');
  const [autoCleanupImmediate, setAutoCleanupImmediate] = useState<boolean>(true);

  // Official Metricool 99-Column Template Options
  const [templateOpts, setTemplateOpts] = useState<MetricoolTemplateOptions>(
    DEFAULT_METRICOOL_TEMPLATE_OPTIONS
  );

  // Editable per-post template fields for the active deck
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

  // Bulk Weekly Calendar State
  const [selectedVaultIds, setSelectedVaultIds] = useState<string[]>([]);
  const [weeklyCadence, setWeeklyCadence] = useState<WeeklyCadencePreset>('mon-wed-fri');
  const [bulkStartDate, setBulkStartDate] = useState<string>(() => {
    const tomorrow = new Date(Date.now() + 24 * 3600_000);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [bulkTimeStr, setBulkTimeStr] = useState<string>('18:00');

  // Inline overrides for rows in the interactive CSV preview table
  const [rowOverrides, setRowOverrides] = useState<
    Record<
      string,
      {
        tiktokTitle?: string;
        firstCommentText?: string;
        documentTitle?: string;
        scheduledDate?: string;
        scheduledTime?: string;
      }
    >
  >({});

  const activePostKey = carousel.id || 'active_studio_deck';

  const loadStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const data = await fetchPublishStatus();
      setStatus(data);
      if (data.autoCleanedPostIds && data.autoCleanedPostIds.length > 0) {
        onShowToast(
          `Auto-cleaned ${data.autoCleanedPostIds.length} published post(s) from Cloudinary`
        );
        onRefreshVault();
      }
    } catch (err) {
      console.warn('Failed to fetch publish status:', err);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [onRefreshVault, onShowToast]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    setHubMode(initialTab);
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

  // Pre-select up to 4 unscheduled/validated Vault posts for Bulk Weekly Queue
  useEffect(() => {
    if (selectedVaultIds.length === 0 && savedPosts.length > 0) {
      const candidates = savedPosts
        .filter((p) => p.postStatus === 'validated' || !p.scheduledFor)
        .slice(0, 4)
        .map((p) => p.id);
      setSelectedVaultIds(
        candidates.length > 0 ? candidates : savedPosts.slice(0, 3).map((p) => p.id)
      );
    }
  }, [savedPosts, selectedVaultIds.length]);

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

  // Compute Weekly Slots for Bulk Queue
  const bulkSlots = useMemo(
    () =>
      computeWeeklyScheduleSlots(
        selectedVaultIds.length,
        bulkStartDate,
        weeklyCadence,
        bulkTimeStr
      ),
    [selectedVaultIds.length, bulkStartDate, weeklyCadence, bulkTimeStr]
  );

  // Build live CSV rows for the Interactive CSV Preview Table
  const csvPreviewRows = useMemo((): MetricoolCsvRowInput[] => {
    // Which targets should be enabled inside the Metricool CSV?
    // If hybrid-buffer-api is chosen, IG/FB/LI go to Buffer API, while TikTok (or all selected if user wants backup) goes to CSV.
    // Wait: if the user downloads the Metricool CSV template, let's enable the platforms according to routingMode:
    // - 'all-metricool-csv': all selectedTargets are true in CSV
    // - 'hybrid-buffer-api': TikTok is true in CSV (plus any selected target if TikTok isn't the only one when downloading CSV)
    const csvTargets: PublishTargetPlatform[] =
      routingMode === 'all-metricool-csv'
        ? selectedTargets
        : selectedTargets.includes('tiktok')
        ? ['tiktok']
        : selectedTargets;

    if (hubMode === 'single') {
      const existingRecord = savedPosts.find((p) => p.id === carousel.id);
      const urls =
        stagedUrlsByPostId[activePostKey] ||
        existingRecord?.hostedSlideUrls ||
        carousel.slides.map(
          (_, i) =>
            `https://res.cloudinary.com/${
              status?.cloudinaryCloudName || 'dug1cw6ux'
            }/image/upload/marrok_staging/${activePostKey}_s${i + 1}.jpg`
        );

      const iso =
        scheduleMode === 'shareNow'
          ? new Date(Date.now() + 10 * 60_000).toISOString()
          : new Date(`${scheduledDate}T${scheduledTime || '18:00'}:00`).toISOString();

      return [
        {
          id: activePostKey,
          postTitle: carousel.slides[0]?.enTitle || 'Active Studio Deck',
          text: customCaption,
          scheduledDateIso: iso,
          isDraft: templateOpts.isDraft,
          targets: csvTargets,
          imageUrls: urls,
          altTexts,
          documentTitle,
          firstCommentText: firstComment,
          tiktokTitle,
          templateOptions: templateOpts,
        },
      ];
    }

    // Bulk Weekly Queue mode
    const selectedRecords = selectedVaultIds
      .map((id) => savedPosts.find((p) => p.id === id))
      .filter((p): p is SavedPostRecord => Boolean(p));

    return selectedRecords.map((record, i) => {
      const slot = bulkSlots[i];
      const ov = rowOverrides[record.id] || {};
      const dateStr = ov.scheduledDate || slot?.datePart || bulkStartDate;
      const timeStr = ov.scheduledTime || (slot?.timePart ? slot.timePart.slice(0, 5) : bulkTimeStr);
      const iso = new Date(`${dateStr}T${timeStr}:00`).toISOString();

      const urls =
        stagedUrlsByPostId[record.id] ||
        record.hostedSlideUrls ||
        record.deck.slides.map(
          (_, idx) =>
            `https://res.cloudinary.com/${
              status?.cloudinaryCloudName || 'dug1cw6ux'
            }/image/upload/marrok_staging/${record.id}_s${idx + 1}.jpg`
        );

      return {
        id: record.id,
        postTitle: record.title,
        text:
          record.deck.caption ||
          `${record.title}\n${record.deck.slides[0]?.arTitle || ''}\n\n#MARROK`,
        scheduledDateIso: iso,
        isDraft: templateOpts.isDraft,
        targets: csvTargets,
        imageUrls: urls,
        altTexts: deriveMetricoolAltTexts(record.deck),
        documentTitle: ov.documentTitle ?? deriveMetricoolDocumentTitle(record.deck),
        firstCommentText: ov.firstCommentText ?? deriveMetricoolFirstComment(record.deck),
        tiktokTitle: (ov.tiktokTitle ?? deriveMetricoolTikTokTitle(record.deck)).slice(0, 90),
        templateOptions: templateOpts,
      };
    });
  }, [
    routingMode,
    selectedTargets,
    hubMode,
    savedPosts,
    carousel,
    stagedUrlsByPostId,
    activePostKey,
    status?.cloudinaryCloudName,
    scheduleMode,
    scheduledDate,
    scheduledTime,
    customCaption,
    templateOpts,
    altTexts,
    documentTitle,
    firstComment,
    tiktokTitle,
    selectedVaultIds,
    bulkSlots,
    rowOverrides,
    bulkStartDate,
    bulkTimeStr,
  ]);

  // Stage slides to Cloudinary (`dug1cw6ux`) without dispatching yet
  const handleStageSlidesToCloudinary = async () => {
    setIsBusy(true);
    try {
      const renderPreset =
        selectedTargets.length === 1 && selectedTargets[0] === 'tiktok'
          ? 'tiktok-9:16'
          : 'ig-4:5';

      if (hubMode === 'single') {
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
      } else {
        const selectedRecords = selectedVaultIds
          .map((id) => savedPosts.find((p) => p.id === id))
          .filter((p): p is SavedPostRecord => Boolean(p));

        for (let i = 0; i < selectedRecords.length; i++) {
          const rec = selectedRecords[i];
          const pal =
            DEFAULT_PALETTES[rec.deck.theme || ''] || theme;
          const uploaded = await uploadDeckSlidesForPublishing(
            rec.deck,
            renderPreset,
            pal,
            (stage) =>
              setProgressLabel(`Post ${i + 1}/${selectedRecords.length}: ${stage}`)
          );
          setStagedUrlsByPostId((prev) => ({ ...prev, [rec.id]: uploaded.urls }));
          setStagedPublicIdsByPostId((prev) => ({
            ...prev,
            [rec.id]: uploaded.publicIds,
          }));
        }
        onShowToast(
          `✓ Staged ${selectedRecords.length} post(s) to Cloudinary for Metricool CSV / Buffer`
        );
      }
      await loadStatus();
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Cloudinary staging failed'}`);
    } finally {
      setIsBusy(false);
      setProgressLabel(null);
    }
  };

  // Download Official 99-Column Metricool CSV Template (staging to Cloudinary first if needed)
  const handleDownloadOfficialMetricoolCsv = async () => {
    setIsBusy(true);
    try {
      const renderPreset =
        selectedTargets.length === 1 && selectedTargets[0] === 'tiktok'
          ? 'tiktok-9:16'
          : 'ig-4:5';

      const updatedUrlsMap = { ...stagedUrlsByPostId };
      const updatedPubIdsMap = { ...stagedPublicIdsByPostId };

      if (hubMode === 'single') {
        if (!updatedUrlsMap[activePostKey] || updatedUrlsMap[activePostKey].length === 0) {
          const uploaded = await uploadDeckSlidesForPublishing(
            carousel,
            renderPreset,
            theme,
            (stage) => setProgressLabel(stage)
          );
          updatedUrlsMap[activePostKey] = uploaded.urls;
          updatedPubIdsMap[activePostKey] = uploaded.publicIds;
          setStagedUrlsByPostId(updatedUrlsMap);
          setStagedPublicIdsByPostId(updatedPubIdsMap);
        }
      } else {
        const selectedRecords = selectedVaultIds
          .map((id) => savedPosts.find((p) => p.id === id))
          .filter((p): p is SavedPostRecord => Boolean(p));

        for (let i = 0; i < selectedRecords.length; i++) {
          const rec = selectedRecords[i];
          if (
            (!updatedUrlsMap[rec.id] || updatedUrlsMap[rec.id].length === 0) &&
            (!rec.hostedSlideUrls || rec.hostedSlideUrls.length === 0)
          ) {
            const pal = DEFAULT_PALETTES[rec.deck.theme || ''] || theme;
            const uploaded = await uploadDeckSlidesForPublishing(
              rec.deck,
              renderPreset,
              pal,
              (stage) =>
                setProgressLabel(`Staging Post ${i + 1}/${selectedRecords.length}: ${stage}`)
            );
            updatedUrlsMap[rec.id] = uploaded.urls;
            updatedPubIdsMap[rec.id] = uploaded.publicIds;
          }
        }
        setStagedUrlsByPostId(updatedUrlsMap);
        setStagedPublicIdsByPostId(updatedPubIdsMap);
      }

      // Rebuild rows with the freshly staged Cloudinary URLs
      const rowsForExport = csvPreviewRows.map((row) => ({
        ...row,
        imageUrls:
          (row.id && updatedUrlsMap[row.id]) || row.imageUrls,
      }));

      const csvContent = generateMetricoolBulkCsv(rowsForExport);
      const filename =
        hubMode === 'single'
          ? `Mtr_calendar_template_${activePostKey.slice(0, 16)}.csv`
          : `Mtr_calendar_template_weekly_${rowsForExport.length}posts_${bulkStartDate}.csv`;
      downloadMetricoolCsvFile(csvContent, filename);

      onShowToast(
        `✓ Downloaded Official 99-Column Metricool CSV (${rowsForExport.length} post${
          rowsForExport.length === 1 ? '' : 's'
        })`
      );
      await loadStatus();
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'CSV export failed'}`);
    } finally {
      setIsBusy(false);
      setProgressLabel(null);
    }
  };

  // Dispatch to Buffer API + Save Schedule to Vault (+ Auto-Cleanup Cloudinary if ShareNow)
  const handleDispatchPublishAndSchedule = async () => {
    if (selectedTargets.length === 0) {
      onShowToast('⚠️ Select at least one target platform');
      return;
    }

    setIsBusy(true);
    try {
      const renderPreset =
        selectedTargets.length === 1 && selectedTargets[0] === 'tiktok'
          ? 'tiktok-9:16'
          : 'ig-4:5';

      if (hubMode === 'single') {
        let urls = stagedUrlsByPostId[activePostKey];
        let pubIds = stagedPublicIdsByPostId[activePostKey];

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

        const dueAtIso =
          scheduleMode === 'customScheduled'
            ? new Date(`${scheduledDate}T${scheduledTime || '18:00'}:00`).toISOString()
            : scheduleMode === 'addToQueue'
            ? new Date(Date.now() + 4 * 3600_000).toISOString()
            : undefined;

        setProgressLabel('Dispatching to Buffer GraphQL API & saving schedule...');
        const dispatchRes = await dispatchPostPublish({
          postId: carousel.id,
          deck: { ...carousel, caption: customCaption },
          title: carousel.slides[0]?.enTitle || 'Untitled Post',
          caption: customCaption,
          mode: scheduleMode,
          dueAt: dueAtIso,
          targets: selectedTargets,
          imageUrls: urls,
          cloudinaryPublicIds: pubIds || [],
          autoCleanupImmediate: scheduleMode === 'shareNow' && autoCleanupImmediate,
        });

        // If TikTok is included or routingMode is all-metricool-csv, also download the Metricool 99-col CSV
        if (selectedTargets.includes('tiktok') || routingMode === 'all-metricool-csv') {
          const rowsForCsv: MetricoolCsvRowInput[] = csvPreviewRows.map((r) => ({
            ...r,
            imageUrls: urls,
          }));
          const csvContent = generateMetricoolBulkCsv(rowsForCsv);
          downloadMetricoolCsvFile(
            csvContent,
            `Mtr_calendar_template_${(carousel.id || 'post').slice(0, 14)}.csv`
          );
        }

        onRefreshVault();
        await loadStatus();

        if (scheduleMode === 'shareNow' && dispatchRes.cloudinaryCleaned) {
          onShowToast('✓ Published to Buffer & auto-cleaned staged images from Cloudinary!');
        } else {
          onShowToast(
            `✓ Scheduled for ${
              dueAtIso ? new Date(dueAtIso).toLocaleString() : 'Next Queue Slot'
            }!`
          );
        }
      } else {
        // Bulk Weekly Queue Dispatch
        const selectedRecords = selectedVaultIds
          .map((id) => savedPosts.find((p) => p.id === id))
          .filter((p): p is SavedPostRecord => Boolean(p));

        if (selectedRecords.length === 0) {
          onShowToast('⚠️ Select at least one Vault post in the left panel');
          return;
        }

        const finalCsvRows: MetricoolCsvRowInput[] = [];

        for (let i = 0; i < selectedRecords.length; i++) {
          const rec = selectedRecords[i];
          const previewRow = csvPreviewRows[i];
          const iso = previewRow?.scheduledDateIso || bulkSlots[i]?.isoDate || new Date().toISOString();
          const pal = DEFAULT_PALETTES[rec.deck.theme || ''] || theme;

          let urls = stagedUrlsByPostId[rec.id] || rec.hostedSlideUrls || [];
          let pubIds = stagedPublicIdsByPostId[rec.id] || rec.cloudinaryPublicIds || [];

          if (urls.length === 0) {
            const uploaded = await uploadDeckSlidesForPublishing(
              rec.deck,
              renderPreset,
              pal,
              (stage) =>
                setProgressLabel(`Post ${i + 1}/${selectedRecords.length}: ${stage}`)
            );
            urls = uploaded.urls;
            pubIds = uploaded.publicIds;
          }

          setProgressLabel(
            `Scheduling Post ${i + 1}/${selectedRecords.length} (${rec.title.slice(0, 22)})...`
          );
          await dispatchPostPublish({
            postId: rec.id,
            deck: rec.deck,
            title: rec.title,
            caption: previewRow?.text || rec.deck.caption || rec.title,
            mode: 'customScheduled',
            dueAt: iso,
            targets: selectedTargets,
            imageUrls: urls,
            cloudinaryPublicIds: pubIds,
            autoCleanupImmediate: false,
          });

          if (previewRow) {
            finalCsvRows.push({
              ...previewRow,
              imageUrls: urls,
            });
          }
        }

        const csvContent = generateMetricoolBulkCsv(finalCsvRows);
        downloadMetricoolCsvFile(
          csvContent,
          `Mtr_calendar_template_weekly_${finalCsvRows.length}posts_${bulkStartDate}.csv`
        );

        onRefreshVault();
        await loadStatus();
        onShowToast(
          `✓ Scheduled ${finalCsvRows.length} posts & downloaded Official Metricool CSV!`
        );
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

  const metricoolUsed = status?.metricoolUsedThisMonth ?? 0;
  const metricoolLimit = status?.metricoolMonthlyLimit ?? 20;
  const metricoolPct = Math.min(100, Math.round((metricoolUsed / metricoolLimit) * 100));

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3 text-slate-200">
      {/* Top Publishing Hub Command Bar */}
      <div className="rounded-2xl border border-white/10 bg-[#0b1218]/95 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToStudio}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] text-xs font-bold text-slate-200 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Studio</span>
          </button>

          <div className="h-5 w-px bg-white/10 hidden sm:block" />

          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-extrabold text-white tracking-tight">
                Publishing & Scheduling Hub
              </span>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Buffer API + Metricool 99-Col CSV
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Cloudinary Signed Staging ({status?.cloudinaryCloudName || 'dug1cw6ux'}) with Post-Publish Auto-Cleanup
            </p>
          </div>
        </div>

        {/* Sub-view Switcher */}
        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setHubMode('single')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              hubMode === 'single'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Active Post</span>
          </button>
          <button
            type="button"
            onClick={() => setHubMode('bulk')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              hubMode === 'bulk'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Weekly Calendar Queue ({selectedVaultIds.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setHubMode('storage')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              hubMode === 'storage'
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Quotas & Cloudinary Cleanup</span>
          </button>
        </div>
      </div>

      {/* Main 3-Zone Publishing Workspace */}
      {hubMode === 'storage' ? (
        <div className="flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-[#0b1218]/90 p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Metricool Free Plan Card */}
            <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Metricool Free Plan (Monthly Cap)
                </span>
                <span className="text-xs font-mono font-bold text-white">
                  {metricoolUsed} / {metricoolLimit} posts
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${metricoolPct}%`,
                    backgroundColor: metricoolPct >= 85 ? '#f43f5e' : '#06b6d4',
                  }}
                />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Metricool Free allows <strong>20 published posts/month</strong> and supports{' '}
                <strong>TikTok (@Marrok)</strong> + CSV Bulk Upload using the official 99-column{' '}
                <code className="text-cyan-300">Mtr_calendar_template.csv</code> format.
              </p>
            </div>

            {/* Buffer Free Plan Card */}
            <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.02] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                  Buffer Free Plan (3 Connected Channels)
                </span>
                <span className="text-xs font-mono font-bold text-emerald-300">
                  API Key Connected
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(status?.channels || [])
                  .filter((c) => c.provider === 'buffer')
                  .map((ch) => (
                    <div
                      key={ch.id}
                      className="p-2.5 rounded-xl border border-white/10 bg-black/30 text-center"
                    >
                      <div className="text-xs font-bold text-white truncate">{ch.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">{ch.handle}</div>
                      <div className="text-xs font-mono text-emerald-400 mt-1">
                        {ch.queuedCount} / {ch.queueLimit} queued
                      </div>
                    </div>
                  ))}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Your Buffer Developer API key dispatches directly to Instagram, Facebook, and LinkedIn with a rolling 10-post queue per channel and no monthly cap.
              </p>
            </div>
          </div>

          {/* Cloudinary Auto-Cleanup Control Card */}
          <div className="p-5 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Cloud className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Cloudinary Signed Staging & Post-Publish Auto-Cleanup
                  </h3>
                  <p className="text-xs text-slate-400">
                    Cloud Name:{' '}
                    <span className="font-mono text-emerald-300">
                      {status?.cloudinaryCloudName || 'dug1cw6ux'}
                    </span>{' '}
                    · Folder: <span className="font-mono text-slate-300">marrok_staging/*</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleManualCloudinaryCleanup(false)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-xs font-bold text-emerald-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Sweep Published Assets</span>
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleManualCloudinaryCleanup(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-bold text-rose-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Force Purge All Staged</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl border border-white/10 bg-black/30">
                <div className="text-[11px] text-slate-400">Currently Staged Slides</div>
                <div className="text-lg font-mono font-bold text-amber-300 mt-0.5">
                  {status?.stagedCloudinarySlidesCount ?? 0} slide(s)
                </div>
              </div>
              <div className="p-3 rounded-xl border border-white/10 bg-black/30">
                <div className="text-[11px] text-slate-400">Auto-Cleaned Posts</div>
                <div className="text-lg font-mono font-bold text-emerald-400 mt-0.5">
                  {status?.cleanedCloudinaryPostsCount ?? 0} post(s)
                </div>
              </div>
              <div className="p-3 rounded-xl border border-white/10 bg-black/30 col-span-2 sm:col-span-1">
                <div className="text-[11px] text-slate-400">Cleanup Policy</div>
                <div className="text-xs font-mono font-semibold text-slate-200 mt-1">
                  Immediate on Publish / +1h after Schedule
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 overflow-y-auto lg:overflow-hidden">
          {/* LEFT PANEL (3 cols): Post Selector & Queue */}
          <div className="lg:col-span-3 rounded-2xl border border-white/10 bg-[#0b1218]/90 p-3.5 flex flex-col min-h-0 gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                {hubMode === 'single' ? '1. Active Studio Post' : '1. Vault Batch Queue'}
              </span>
              {hubMode === 'bulk' && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSelectedVaultIds(savedPosts.map((p) => p.id))}
                    className="text-emerald-400 hover:underline cursor-pointer"
                  >
                    All
                  </button>
                  <span className="text-slate-600">·</span>
                  <button
                    type="button"
                    onClick={() => setSelectedVaultIds([])}
                    className="text-slate-400 hover:underline cursor-pointer"
                  >
                    None
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {hubMode === 'single' ? (
                <div className="p-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-300">
                      Current Deck · {carousel.slides.length} Slides
                    </span>
                    <span
                      className="w-3 h-3 rounded-full border border-white/30"
                      style={{ backgroundColor: theme.accent }}
                    />
                  </div>
                  <div className="text-xs font-bold text-white leading-snug">
                    {carousel.slides[0]?.enTitle || 'Untitled Deck'}
                  </div>
                  {carousel.slides[0]?.arTitle && (
                    <div className="text-[11px] text-slate-300 font-arabic" dir="rtl">
                      {carousel.slides[0].arTitle}
                    </div>
                  )}
                  <div className="pt-1 flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>Format: {carousel.postFormat || 'carousel'}</span>
                    <span>
                      {stagedUrlsByPostId[activePostKey]?.length
                        ? '✓ Hosted on Cloudinary'
                        : 'Auto-stages on Export'}
                    </span>
                  </div>
                </div>
              ) : savedPosts.length === 0 ? (
                <div className="p-4 rounded-xl border border-white/10 bg-black/20 text-xs text-slate-400 text-center">
                  No posts saved in Vault yet. Save posts in the Creation Studio first.
                </div>
              ) : (
                savedPosts.map((post) => {
                  const isChecked = selectedVaultIds.includes(post.id);
                  const slotIdx = selectedVaultIds.indexOf(post.id);
                  const assignedSlot = slotIdx >= 0 ? bulkSlots[slotIdx] : undefined;
                  const pal =
                    DEFAULT_PALETTES[post.deck.theme || 'teal'] || DEFAULT_PALETTES.teal;
                  const isHosted =
                    Boolean(stagedUrlsByPostId[post.id]?.length) ||
                    Boolean(post.hostedSlideUrls?.length);

                  return (
                    <label
                      key={post.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isChecked
                          ? 'border-emerald-500/40 bg-emerald-500/10'
                          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() =>
                          setSelectedVaultIds((prev) =>
                            prev.includes(post.id)
                              ? prev.filter((i) => i !== post.id)
                              : [...prev, post.id]
                          )
                        }
                        className="mt-0.5 rounded border-white/20 text-emerald-500 focus:ring-emerald-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: pal.accent }}
                          />
                          <span className="text-xs font-bold text-white truncate">
                            {post.title}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-1 mt-1 text-[10px] font-mono text-slate-400">
                          <span>{post.slideCount} slides</span>
                          <span className={isHosted ? 'text-emerald-400' : 'text-slate-500'}>
                            {post.cloudinaryCleanedAt
                              ? 'Cleaned'
                              : isHosted
                              ? '✓ Cloudinary'
                              : 'Unstaged'}
                          </span>
                        </div>
                        {assignedSlot && (
                          <div className="mt-1 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono">
                            {assignedSlot.readableLabel}
                          </div>
                        )}
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            {/* Quick Stage to Cloudinary Button */}
            <button
              type="button"
              disabled={isBusy}
              onClick={handleStageSlidesToCloudinary}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-cyan-500/35 bg-cyan-500/10 hover:bg-cyan-500/20 text-xs font-bold text-cyan-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Stage Slides to Cloudinary Now</span>
            </button>
          </div>

          {/* CENTER WORKSPACE (5 cols): Schedule Calendar & Interactive 99-Column Metricool CSV Preview Table */}
          <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-[#0b1218]/90 p-3.5 flex flex-col min-h-0 gap-3 overflow-y-auto">
            {/* Schedule Controls */}
            {hubMode === 'single' ? (
              <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    2. Schedule Timing
                  </span>
                  <button
                    type="button"
                    onClick={handleAutoFillActiveFields}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>Auto-Fill Template Fields</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleMode('shareNow')}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      scheduleMode === 'shareNow'
                        ? 'border-emerald-400 bg-emerald-500/15 text-white'
                        : 'border-white/10 bg-white/[0.02] text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold">Publish Now</div>
                    <div className="text-[10px] opacity-75">Immediate + Clean</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode('customScheduled')}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      scheduleMode === 'customScheduled'
                        ? 'border-emerald-400 bg-emerald-500/15 text-white'
                        : 'border-white/10 bg-white/[0.02] text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold">Pick Date & Time</div>
                    <div className="text-[10px] opacity-75">Calendar Slot</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode('addToQueue')}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      scheduleMode === 'addToQueue'
                        ? 'border-emerald-400 bg-emerald-500/15 text-white'
                        : 'border-white/10 bg-white/[0.02] text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-bold">Next Queue Slot</div>
                    <div className="text-[10px] opacity-75">Buffer Auto-Slot</div>
                  </button>
                </div>

                {scheduleMode === 'customScheduled' && (
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                        Date (YYYY-MM-DD)
                      </label>
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/15 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                        Time (HH:mm)
                      </label>
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/15 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02] space-y-2.5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  2. Weekly Calendar Cadence Generator
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                      Cadence
                    </label>
                    <select
                      value={weeklyCadence}
                      onChange={(e) => setWeeklyCadence(e.target.value as WeeklyCadencePreset)}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-white/15 text-xs text-white"
                    >
                      <option value="mon-wed-fri">Mon / Wed / Fri</option>
                      <option value="tue-thu-sat">Tue / Thu / Sat</option>
                      <option value="weekdays">Weekdays (Mon–Fri)</option>
                      <option value="daily">Daily</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={bulkStartDate}
                      onChange={(e) => setBulkStartDate(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-white/15 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                      Post Time
                    </label>
                    <input
                      type="time"
                      value={bulkTimeStr}
                      onChange={(e) => setBulkTimeStr(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg bg-slate-900 border border-white/15 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Official Metricool Template Fields Editor (Single Mode) */}
            {hubMode === 'single' && (
              <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Metricool Template Fields (Auto-Filled)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAltTextEditor(!showAltTextEditor)}
                    className="text-[11px] font-mono text-cyan-400 hover:underline cursor-pointer"
                  >
                    {showAltTextEditor
                      ? 'Hide Alt Texts'
                      : `Edit Slide Alt Texts (${altTexts.length})`}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                      <span>TikTok Title (Images/Carousel)</span>
                      <span className={tiktokTitle.length > 85 ? 'text-amber-400' : ''}>
                        {tiktokTitle.length}/90
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={90}
                      value={tiktokTitle}
                      onChange={(e) => setTiktokTitle(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/15 text-xs text-white"
                      placeholder="TikTok photo post title (max 90 chars)"
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
                      placeholder="LinkedIn carousel title (max 58 chars)"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">
                    First Comment Text (Citations & Secondary Links)
                  </label>
                  <textarea
                    rows={2}
                    value={firstComment}
                    onChange={(e) => setFirstComment(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/15 text-xs text-slate-200 resize-y"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">
                    Text (Main Bilingual Caption)
                  </label>
                  <textarea
                    rows={3}
                    value={customCaption}
                    onChange={(e) => setCustomCaption(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-white/15 text-xs text-slate-200 resize-y"
                  />
                </div>

                {showAltTextEditor && (
                  <div className="pt-2 border-t border-white/10 space-y-1.5 max-h-40 overflow-y-auto">
                    <div className="text-[10px] font-mono uppercase text-slate-400">
                      Alt text picture 1..{altTexts.length}
                    </div>
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
            )}

            {/* INTERACTIVE 99-COLUMN METRICOOL CSV PREVIEW TABLE */}
            <div className="flex-1 flex flex-col min-h-[220px] rounded-xl border border-cyan-500/25 bg-[#070c10] overflow-hidden">
              <div className="px-3 py-2 border-b border-white/10 bg-cyan-500/[0.06] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Table className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs font-bold text-white">
                    Interactive Metricool CSV Preview ({OFFICIAL_METRICOOL_CSV_HEADERS.length} Official Columns)
                  </span>
                </div>
                <span className="text-[10px] font-mono text-cyan-300">
                  {csvPreviewRows.length} row(s) ready
                </span>
              </div>

              <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-white/10 bg-slate-950/90 text-[10px] font-mono uppercase text-slate-400">
                      <th className="py-2 px-2.5 whitespace-nowrap">Date & Time</th>
                      <th className="py-2 px-2.5 whitespace-nowrap">Networks</th>
                      <th className="py-2 px-2.5 whitespace-nowrap min-w-[180px]">
                        TikTok Title (≤90c)
                      </th>
                      <th className="py-2 px-2.5 whitespace-nowrap min-w-[160px]">
                        First Comment
                      </th>
                      <th className="py-2 px-2.5 whitespace-nowrap">Pictures (1..10)</th>
                      <th className="py-2 px-2.5 whitespace-nowrap">Alt Texts</th>
                      <th className="py-2 px-2.5 whitespace-nowrap">LI Carousel</th>
                      <th className="py-2 px-2.5 whitespace-nowrap">TT Music</th>
                      <th className="py-2 px-2.5 whitespace-nowrap">Brand</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {csvPreviewRows.map((row, idx) => {
                      const dt = new Date(row.scheduledDateIso);
                      const datePart = Number.isNaN(dt.getTime())
                        ? scheduledDate
                        : dt.toISOString().slice(0, 10);
                      const timePart = Number.isNaN(dt.getTime())
                        ? '18:00'
                        : dt.toTimeString().slice(0, 5);
                      const rowId = row.id || `row_${idx}`;

                      return (
                        <tr key={rowId} className="hover:bg-white/[0.02]">
                          <td className="py-2 px-2.5 font-mono text-emerald-300 whitespace-nowrap">
                            <div>{datePart}</div>
                            <div className="text-[10px] text-slate-400">{timePart}:00</div>
                          </td>
                          <td className="py-2 px-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              {row.targets.map((t) => (
                                <span
                                  key={t}
                                  className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-white/10 text-white"
                                >
                                  {t.slice(0, 2)}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 px-2.5">
                            {hubMode === 'single' ? (
                              <input
                                type="text"
                                maxLength={90}
                                value={tiktokTitle}
                                onChange={(e) => setTiktokTitle(e.target.value)}
                                className="w-full px-2 py-1 rounded bg-slate-900 border border-white/10 text-[11px] text-white"
                              />
                            ) : (
                              <input
                                type="text"
                                maxLength={90}
                                value={row.tiktokTitle || ''}
                                onChange={(e) =>
                                  setRowOverrides((prev) => ({
                                    ...prev,
                                    [rowId]: {
                                      ...prev[rowId],
                                      tiktokTitle: e.target.value,
                                    },
                                  }))
                                }
                                className="w-full px-2 py-1 rounded bg-slate-900 border border-white/10 text-[11px] text-white"
                              />
                            )}
                          </td>
                          <td className="py-2 px-2.5">
                            {hubMode === 'single' ? (
                              <input
                                type="text"
                                value={firstComment}
                                onChange={(e) => setFirstComment(e.target.value)}
                                className="w-full px-2 py-1 rounded bg-slate-900 border border-white/10 text-[11px] text-slate-300"
                              />
                            ) : (
                              <input
                                type="text"
                                value={row.firstCommentText || ''}
                                onChange={(e) =>
                                  setRowOverrides((prev) => ({
                                    ...prev,
                                    [rowId]: {
                                      ...prev[rowId],
                                      firstCommentText: e.target.value,
                                    },
                                  }))
                                }
                                className="w-full px-2 py-1 rounded bg-slate-900 border border-white/10 text-[11px] text-slate-300"
                              />
                            )}
                          </td>
                          <td className="py-2 px-2.5 font-mono text-cyan-300 whitespace-nowrap">
                            {row.imageUrls.length} URLs
                          </td>
                          <td className="py-2 px-2.5 font-mono text-slate-300 whitespace-nowrap">
                            {row.altTexts?.filter(Boolean).length || 0} filled
                          </td>
                          <td className="py-2 px-2.5 font-mono whitespace-nowrap">
                            <span
                              className={
                                templateOpts.linkedInImagesAsCarousel
                                  ? 'text-emerald-400'
                                  : 'text-slate-500'
                              }
                            >
                              {String(templateOpts.linkedInImagesAsCarousel)}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 font-mono whitespace-nowrap">
                            <span
                              className={
                                templateOpts.tiktokAutoAddMusic
                                  ? 'text-emerald-400'
                                  : 'text-slate-500'
                              }
                            >
                              {String(templateOpts.tiktokAutoAddMusic)}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 font-mono text-slate-300 whitespace-nowrap">
                            {templateOpts.brandName}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT INSPECTOR (4 cols): Channel Routing, Official Metricool Options & Export/Dispatch Actions */}
          <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-[#0b1218]/90 p-3.5 flex flex-col min-h-0 justify-between gap-3 overflow-y-auto">
            <div className="space-y-3">
              {/* Target Channels */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    3. Target Channels
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">
                    {selectedTargets.length}/4 active
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(PLATFORM_META) as PublishTargetPlatform[]).map((platform) => {
                    const meta = PLATFORM_META[platform];
                    const active = selectedTargets.includes(platform);
                    return (
                      <button
                        key={platform}
                        type="button"
                        onClick={() => togglePlatform(platform)}
                        className={`flex items-start gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'border-white/30 bg-white/[0.08] text-white'
                            : 'border-white/10 bg-white/[0.02] text-slate-400 opacity-60'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                          style={{ backgroundColor: meta.badgeColor }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">{meta.label}</div>
                          <div className="text-[10px] text-slate-400 truncate">{meta.handle}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Channel Routing Mode (Buffer API vs Metricool CSV) */}
              <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02] space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  Channel Routing Strategy
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRoutingMode('hybrid-buffer-api')}
                    className={`p-2 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                      routingMode === 'hybrid-buffer-api'
                        ? 'border-emerald-400/50 bg-emerald-500/15 text-white'
                        : 'border-white/10 bg-black/20 text-slate-400'
                    }`}
                  >
                    <div className="font-bold">
                      Hybrid Zero-Cost (IG/FB/LI → Buffer API · TikTok → Metricool CSV)
                    </div>
                    <div className="text-[10px] opacity-80">
                      Saves your 20/month Metricool Free quota exclusively for TikTok
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoutingMode('all-metricool-csv')}
                    className={`p-2 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                      routingMode === 'all-metricool-csv'
                        ? 'border-cyan-400/50 bg-cyan-500/15 text-white'
                        : 'border-white/10 bg-black/20 text-slate-400'
                    }`}
                  >
                    <div className="font-bold">
                      Include All Selected Channels in Metricool CSV
                    </div>
                    <div className="text-[10px] opacity-80">
                      Marks FB, IG, LI & TikTok as true inside Mtr_calendar_template.csv
                    </div>
                  </button>
                </div>
              </div>

              {/* Official Metricool CSV Template Switches */}
              <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02] space-y-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Metricool CSV Template Options</span>
                </div>

                <label className="flex items-center justify-between gap-2 text-xs text-slate-200 cursor-pointer">
                  <span>LinkedIn Images as Carousel (PDF)</span>
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
                </label>

                <label className="flex items-center justify-between gap-2 text-xs text-slate-200 cursor-pointer">
                  <span>TikTok Auto Add Music</span>
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
                </label>

                <label className="flex items-center justify-between gap-2 text-xs text-slate-200 cursor-pointer">
                  <span>Import as Draft in Metricool</span>
                  <input
                    type="checkbox"
                    checked={templateOpts.isDraft}
                    onChange={(e) =>
                      setTemplateOpts((p) => ({ ...p, isDraft: e.target.checked }))
                    }
                    className="rounded border-white/20 text-emerald-500"
                  />
                </label>

                {hubMode === 'single' && scheduleMode === 'shareNow' && (
                  <label className="flex items-center justify-between gap-2 text-xs text-emerald-300 cursor-pointer pt-1 border-t border-white/10">
                    <span>Auto-delete Cloudinary images after publish</span>
                    <input
                      type="checkbox"
                      checked={autoCleanupImmediate}
                      onChange={(e) => setAutoCleanupImmediate(e.target.checked)}
                      className="rounded border-white/20 text-emerald-500"
                    />
                  </label>
                )}

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 mb-0.5">
                      TikTok Privacy
                    </label>
                    <select
                      value={templateOpts.tiktokPostPrivacy}
                      onChange={(e) =>
                        setTemplateOpts((p) => ({
                          ...p,
                          tiktokPostPrivacy: e.target.value as MetricoolTemplateOptions['tiktokPostPrivacy'],
                        }))
                      }
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-white/15 text-[11px] text-white"
                    >
                      <option value="PUBLIC_TO_EVERYONE">PUBLIC_TO_EVERYONE</option>
                      <option value="MUTUAL_FOLLOW_FRIENDS">MUTUAL_FOLLOW_FRIENDS</option>
                      <option value="SELF_ONLY">SELF_ONLY</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-slate-400 mb-0.5">
                      Brand Name
                    </label>
                    <input
                      type="text"
                      value={templateOpts.brandName}
                      onChange={(e) =>
                        setTemplateOpts((p) => ({ ...p, brandName: e.target.value }))
                      }
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-white/15 text-[11px] text-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Action Footer */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              {progressLabel && (
                <div className="p-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 flex items-center gap-2 text-xs font-mono text-cyan-200">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="truncate">{progressLabel}</span>
                </div>
              )}

              <button
                type="button"
                disabled={isBusy}
                onClick={handleDownloadOfficialMetricoolCsv}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-cyan-400/40 bg-cyan-500/15 hover:bg-cyan-500/25 text-xs font-bold text-cyan-100 transition-all cursor-pointer disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4 text-cyan-300" />
                <span>Download Official Metricool CSV (99 Cols)</span>
              </button>

              <button
                type="button"
                disabled={isBusy || selectedTargets.length === 0}
                onClick={handleDispatchPublishAndSchedule}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs text-slate-950 shadow-lg transition-all cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: theme.accent }}
              >
                <Send className="w-4 h-4" />
                <span>
                  {hubMode === 'single'
                    ? scheduleMode === 'shareNow'
                      ? 'Publish Now via Buffer + Auto-Clean Cloudinary'
                      : 'Schedule Post (Buffer API + Metricool CSV)'
                    : `Batch Schedule ${selectedVaultIds.length} Posts + Download CSV`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
