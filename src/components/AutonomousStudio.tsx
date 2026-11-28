import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from 'react';
import {
  CarouselData,
  PostFormat,
  ThemePalette,
  DEFAULT_PALETTES,
  GraphicalElementId,
  SavedPostStatus,
  MotionReelData,
  MotionTemplateId,
  CanvasDimensionPreset,
  SavedPostRecord,
} from '../types.ts';
import {
  getCanvasDimensionSpec,
  isVideoSlide,
  formatBilingualExportCaptionWithHashtags,
} from '../lib/canvasExporter.ts';
import { revokeAllTrackedBlobUrls } from '../lib/media/blobUrlRegistry.ts';
import { sanitizeSlide } from '../lib/textSanitizer.ts';
import { applyPreExportAutoFixToDeck } from '../lib/studio/preExportAutoFix.ts';
import {
  switchCarouselPostFormat,
  resolveEffectivePostFormat,
  filterRelevantHookVariants,
} from '../lib/studio/formatWorkspace.ts';
import { runQAChecks, type PreExportCheckId } from '../lib/qaChecks.ts';
import { runPlatformRiskChecks } from '../lib/riskChecks.ts';
import { convertCarouselToMotionReel } from '../lib/motion/index.ts';
import {
  CopyInspector,
  VisualInspector,
  ReviewInspector,
  CaptionInspector,
  getPublishBlockers,
  StageOverlayMode,
  useStudioShortcutsAndClipboard,
} from './studio/index.ts';
import { StudioCommandBar } from './studio/panels/StudioCommandBar.tsx';
import {
  OfflineFallbackBanner,
  StudioStageConsole,
} from './studio/panels/StudioStageConsole.tsx';
import {
  StudioInspectorHeader,
  type StudioInspectorTab,
} from './studio/panels/StudioInspectorHeader.tsx';
import { MobileStudioBottomBar } from './studio/panels/MobileStudioBottomBar.tsx';
import { useSlideNavigation } from '../hooks/useSlideNavigation.ts';
import { useThemeCadence } from '../hooks/useThemeCadence.ts';
import { useStudioLayoutActions } from '../hooks/useStudioLayoutActions.ts';
import { useExportActions } from '../hooks/useExportActions.ts';
import { useMediaIngestion } from '../hooks/useMediaIngestion.ts';
import {
  deriveTopicHashtags,
  useAutonomousGeneration,
} from '../hooks/useAutonomousGeneration.ts';
import { useVisualDirectorActions } from '../hooks/useVisualDirectorActions.ts';
import { useBilingualSlideSync } from '../hooks/useBilingualSlideSync.ts';

const MediaSearchModal = lazy(() =>
  import('./MediaSearchModal.tsx').then((m) => ({ default: m.MediaSearchModal }))
);
const MotionExportModal = lazy(() =>
  import('./studio/motion/MotionExportModal.tsx').then((m) => ({ default: m.MotionExportModal }))
);

interface AutonomousStudioProps {
  carousel: CarouselData;
  theme: ThemePalette;
  activeSlideIndex?: number;
  onSlideChange?: (index: number) => void;
  onUpdateCarousel: React.Dispatch<React.SetStateAction<CarouselData>>;
  canUndo?: boolean;
  canRedo?: boolean;
  historyRestoreVersion?: number;
  onUndo?: () => void;
  onRedo?: () => void;
  isComparingBefore?: boolean;
  onToggleCompareBefore?: (active?: boolean) => void;
  beforeEditsCarousel?: CarouselData;
  onSelectTheme: (palette: ThemePalette) => void;
  onOpenThemeCustomizer: () => void;
  onOpenContactSheet?: () => void;
  onOpenPreviewDrawer?: (tab?: 'simulator' | 'polish') => void;
  onSaveValidPost?: (status: SavedPostStatus, allowOverride?: boolean) => Promise<void>;
  onShowToast: (msg: string) => void;
  savedPosts?: SavedPostRecord[];
  onOpenPublishScheduleModal?: (tab?: 'single' | 'bulk' | 'storage') => void;
  onOpenInFilmStudio?: (projectId: string) => void;
}

export const AutonomousStudio: React.FC<AutonomousStudioProps> = ({
  carousel,
  theme,
  activeSlideIndex,
  onSlideChange,
  onUpdateCarousel,
  canUndo = false,
  canRedo = false,
  historyRestoreVersion = 0,
  onUndo,
  onRedo,
  isComparingBefore = false,
  onToggleCompareBefore,
  beforeEditsCarousel,
  onSelectTheme,
  onOpenThemeCustomizer,
  onOpenContactSheet,
  onOpenPreviewDrawer,
  onSaveValidPost,
  onShowToast,
  savedPosts = [],
  onOpenPublishScheduleModal,
  onOpenInFilmStudio,
}) => {
  // Navigation Hook
  const { currentSlideIndex, currentSlideIndexRef, changeSlide } = useSlideNavigation({
    slidesCount: carousel.slides.length,
    externalSlideIndex: activeSlideIndex,
    onSlideChange,
  });

  // Single-source-of-truth Undo/Redo & Compare-Before wired from App.tsx's useStudioHistory
  const deckRevisionRef = useRef<number>(0);
  const applyDeckUpdate = useCallback(
    (updater: (prev: CarouselData) => CarouselData) => {
      deckRevisionRef.current += 1;
      onUpdateCarousel(updater);
    },
    [onUpdateCarousel]
  );
  const handleUndo = useCallback(() => {
    deckRevisionRef.current += 1;
    onUndo?.();
  }, [onUndo]);
  const handleRedo = useCallback(() => {
    deckRevisionRef.current += 1;
    onRedo?.();
  }, [onRedo]);
  const setIsComparingBefore = useCallback(
    (active: boolean) => {
      onToggleCompareBefore?.(active);
    },
    [onToggleCompareBefore]
  );

  const activePostFormat: PostFormat = resolveEffectivePostFormat(carousel);

  // Inspector & Viewport States
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [stageOverlayMode, setStageOverlayMode] = useState<StageOverlayMode>('clean');
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<StudioInspectorTab>('copy');
  const [isPositionSectionOpen, setIsPositionSectionOpen] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<GraphicalElementId | null>(null);

  // Smart Dock Expansion & Tab
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'text' | 'radar' | 'youtube' | 'upload'>('text');

  // Deep Customization & Mobile Bottom Sheet States
  const [imageStudioTargetIndex, setImageStudioTargetIndex] = useState<number | null>(null);
  const [mediaModalTarget, setMediaModalTarget] = useState<{
    field: 'imageUrl';
    title?: string;
    initialQuery?: string;
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mobileStudioTab, setMobileStudioTab] = useState<'canvas' | 'editor'>('canvas');
  const [mobileSheetSnap, setMobileSheetSnap] = useState<'peek' | 'half' | 'full'>('half');
  const isSheetOpen = isMobileSheetOpen || mobileStudioTab === 'editor';
  const sheetDragStartYRef = useRef<number | null>(null);

  // Motion Reel Studio States
  const [selectedMotionSceneId, setSelectedMotionSceneId] = useState<string | null>(null);
  const [isMotionExportOpen, setIsMotionExportOpen] = useState(false);

  // Export override states
  const [overrideExportBlock, setOverrideExportBlock] = useState(false);
  const [confirmedRiskReason, setConfirmedRiskReason] = useState<string | null>(null);

  // Photo & Video analysis suggestion refs for media ingestion callbacks
  const handleAnalyzePhotoCaptionRef = useRef<
    (
      imageDataUrlOverride?: string,
      mimeTypeOverride?: string,
      fileNameOverride?: string,
      modeOverride?: 'meme' | 'graphic'
    ) => Promise<void>
  >(async () => {});
  const handleGenerateFromVideoRef = useRef<(sourceOverride?: File | string) => Promise<void>>(
    async () => {}
  );

  // Media Ingestion Hook
  const {
    promptInput,
    setPromptInput,
    categoryHint,
    setCategoryHint,
    inputValidationError,
    setInputValidationError,
    uploadedImage,
    setUploadedImage,
    isDragOver,
    setIsDragOver,
    studioRadarTopics,
    setStudioRadarTopics,
    isStudioRadarLoading,
    setIsStudioRadarLoading,
    studioCustomUrl,
    setStudioCustomUrl,
    isExtractingStudioUrl,
    setIsExtractingStudioUrl,
    fileInputRef,
    handlePromptChange,
    handleImageFile,
    handleUploadMemePhotoFile,
    handleUploadSlideGraphicFile,
    handleSelectDemoImage,
    handlePasteImageFromClipboard,
    handleClearDock,
  } = useMediaIngestion({
    activePostFormat,
    carousel,
    currentSlideIndexRef,
    applyDeckUpdate,
    changeSlide,
    onShowToast,
    isExpanded,
    setIsExpanded,
    setActiveTab,
    setInspectorTab,
    onAnalyzePhotoCaption: (dataUrl, mime, name, mode) =>
      handleAnalyzePhotoCaptionRef.current(dataUrl, mime, name, mode),
    onAnalyzeVideoFile: (file) => handleGenerateFromVideoRef.current(file),
  });

  // Intelligent Feed Cadence Analysis for Live Context
  const { cadence: dockCadence } = useThemeCadence({
    savedPosts,
    activeThemeId: theme.id,
    prompt: promptInput,
    category: categoryHint,
  });

  // Layout Actions Hook (preserves handleAutoFitCurrentSlide no-op guard)
  const {
    handleUpdateElementLayoutOverride,
    handleUpdateSlideFields,
    handleUpdateCurrentSlide,
    handleDeleteCanvasElement,
    handleAutoFitCurrentSlide,
    handleResetSlideLayoutOverrides,
    handleApplyOverrideToAllSlides,
    handleApplySlideLayoutToAllSlides,
  } = useStudioLayoutActions({
    carousel,
    currentSlideIndex,
    applyDeckUpdate,
    onShowToast,
    setSelectedElementId,
  });

  const activeReelConfig: MotionReelData = useMemo(
    () =>
      carousel.reelConfig ||
      convertCarouselToMotionReel(carousel, theme, 'marrok-slides', 'bilingual'),
    [carousel, theme]
  );

  // Autonomous Generation & Instant Offline Synthesis Hook
  const {
    isGenerating,
    pipelineStatus,
    setPipelineStatus,
    handleRunAutonomousPipeline,
    handleInstantSynthesize,
    handleTriggerStarterTopic,
  } = useAutonomousGeneration({
    carousel,
    currentSlideIndex,
    activePostFormat,
    activeReelConfig,
    theme,
    savedPosts,
    promptInput,
    setPromptInput,
    categoryHint,
    activeTab,
    uploadedImage,
    deckRevisionRef,
    setInputValidationError,
    setIsExpanded,
    setInspectorTab,
    onSelectTheme,
    onUpdateCarousel,
    changeSlide,
    onShowToast,
  });

  // Visual Director, Smart Auto-Layout Watcher & Slide/Diagram CRUD Hook
  const {
    isReimaginingVisual,
    handleSetSlideType,
    handleToggleAutoLayout,
    handleReimagineVisual,
    handleSmartMatchVisuals,
    handleSelectDiagramVariant,
    handleDiversifyDeckVisuals,
    handleAddSlide,
    handleDuplicateSlide,
    handleDeleteSlide,
    handleMoveSlide,
    handleApplyCoverStyle,
    handleApplyHookVariant,
    handleUpdateSatLabel,
    handleUpdateSatIcon,
    handleUpdateCenterIcon,
    handleUpdateCenterTag,
    handleAddSatNode,
    handleDeleteSatNode,
    handleUpdateDiagramNode,
    handleUpdateDiagramEdge,
  } = useVisualDirectorActions({
    carousel,
    currentSlideIndex,
    currentSlideIndexRef,
    activePostFormat,
    historyRestoreVersion,
    isGenerating,
    applyDeckUpdate,
    changeSlide,
    handleUpdateCurrentSlide,
    onShowToast,
  });

  // Bilingual Arabic Sync, Photo Vision Captioning & Video Storyboard/Card Reel Hook
  const {
    isSyncingArabic,
    isSyncingAllArabic,
    isGeneratingFromVideo,
    activeVideoSlide,
    isAnalyzingPhoto,
    photoCopySuggestion,
    setPhotoCopySuggestion,
    handleSyncCurrentSlideArabic,
    handleSyncAllSlidesArabic,
    handleGenerateFromVideo,
    handleSwitchToVideoCardReel,
    handleAnalyzePhotoCaption,
    handleApplyPhotoCopySuggestion,
  } = useBilingualSlideSync({
    carousel,
    currentSlideIndex,
    currentSlideIndexRef,
    activePostFormat,
    activeReelConfig,
    theme,
    promptInput,
    categoryHint,
    uploadedImage,
    applyDeckUpdate,
    changeSlide,
    setInspectorTab,
    setPipelineStatus,
    onShowToast,
  });

  handleGenerateFromVideoRef.current = handleGenerateFromVideo;
  handleAnalyzePhotoCaptionRef.current = handleAnalyzePhotoCaption;

  // Revoke tracked blob URLs on unmount
  useEffect(() => {
    return () => {
      revokeAllTrackedBlobUrls();
    };
  }, []);

  // Keep the image studio bound to a valid slide in range
  useEffect(() => {
    if (imageStudioTargetIndex !== null && imageStudioTargetIndex >= carousel.slides.length) {
      setImageStudioTargetIndex(null);
    }
  }, [carousel.slides.length, imageStudioTargetIndex]);

  const visibleHookVariants = useMemo(
    () => filterRelevantHookVariants(carousel.hookVariants, carousel.slides, carousel.category),
    [carousel.hookVariants, carousel.slides, carousel.category]
  );

  const handleSelectDimensionPreset = (preset: CanvasDimensionPreset) => {
    const nextSpec = getCanvasDimensionSpec(preset);
    applyDeckUpdate((prev) => ({
      ...prev,
      dimensionPreset: preset,
    }));
    onShowToast(`Switched canvas to ${nextSpec.label}`);
  };

  const handleSyncReelFromCarousel = (
    templateId: MotionTemplateId = activeReelConfig.templateId || 'marrok-slides',
    languageMode: 'ar' | 'en' | 'bilingual' = activeReelConfig.languageMode || 'bilingual'
  ) => {
    const nextReel = convertCarouselToMotionReel(carousel, theme, templateId, languageMode);
    applyDeckUpdate((prev) => ({
      ...prev,
      postFormat: 'reel',
      reelConfig: nextReel,
    }));
    setSelectedMotionSceneId(nextReel.scenes[0]?.id || null);
  };

  const handleSwitchPostFormat = (nextFormat: PostFormat) => {
    if (nextFormat === activePostFormat) return;

    const result = switchCarouselPostFormat(carousel, nextFormat, {
      activeSlideIndex: currentSlideIndexRef.current,
      theme,
      uploadedImage,
      promptInput,
      categoryHint,
      activeTab,
    });

    applyDeckUpdate(() => result.nextCarousel);
    changeSlide(result.nextSlideIndex, result.nextCarousel.slides.length);

    if (nextFormat === 'meme') {
      setInspectorTab('copy');
    } else if (nextFormat === 'reel') {
      setSelectedMotionSceneId(result.nextCarousel.reelConfig?.scenes[0]?.id || null);
      if (inspectorTab !== 'caption' && inspectorTab !== 'review') {
        setInspectorTab('copy');
      }
    }

    if (result.toastMessage) {
      onShowToast(result.toastMessage);
    }
  };

  const handleDoubleClickCanvasElement = (elementId: GraphicalElementId) => {
    setSelectedElementId(elementId);
    setIsMobileSheetOpen(true);
    setMobileStudioTab('editor');
    if (elementId === 'graphicCard') {
      setInspectorTab('visual');
      return;
    }
    if (elementId === 'headerBadge' || elementId === 'attributionCard') {
      setInspectorTab('position');
      return;
    }
    setInspectorTab('copy');
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-slide-editor-field="${elementId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
      }
    }, 80);
  };

  const handleCollapseExpanded = useCallback(() => {
    setIsExpanded(false);
  }, []);

  useStudioShortcutsAndClipboard({
    slidesCount: carousel.slides.length,
    isExpanded,
    onCollapseExpanded: handleCollapseExpanded,
    onChangeSlide: changeSlide,
    onPasteImageFile: handlePasteImageFromClipboard,
    onOpenContactSheet,
  });

  const handleToggleReviewDraft = () => {
    const newReviewed = !Boolean(carousel.sourceMeta?.userReviewed);
    applyDeckUpdate((prev) => ({
      ...prev,
      sourceMeta: {
        ...prev.sourceMeta,
        userReviewed: newReviewed,
      },
    }));
    if (newReviewed) {
      onShowToast('✓ Draft marked as reviewed. Pre-export QA validation active.');
    } else {
      onShowToast('Draft review unmarked. Advisory QA warnings active.');
    }
  };

  const handleToggleOverrideBlock = (riskReason?: string) => {
    setOverrideExportBlock((prev) => {
      const next = !prev;
      if (next && riskReason) {
        setConfirmedRiskReason(riskReason);
      } else if (!next) {
        setConfirmedRiskReason(null);
      }
      return next;
    });
  };

  const isOfflineDraft = Boolean(
    carousel.sourceMeta?.isFallback ||
      carousel.sourceMeta?.engine === 'offline' ||
      carousel.sourceMeta?.engine === 'offline-synthesizer'
  );
  const isReviewed = Boolean(carousel.sourceMeta?.userReviewed);
  const qaReport = useMemo(() => runQAChecks(carousel), [carousel]);
  const riskReport = useMemo(
    () => runPlatformRiskChecks(carousel, promptInput),
    [carousel, promptInput]
  );
  const dynamicHashtags = useMemo(() => deriveTopicHashtags(carousel), [carousel]);
  const publishBlockers = useMemo(
    () => getPublishBlockers(carousel, isReviewed, qaReport, riskReport, theme),
    [carousel, isReviewed, qaReport, riskReport, theme]
  );
  const blockersCount = publishBlockers.blockersCount;
  const isBlocked = blockersCount > 0 && !overrideExportBlock;
  const hasContentQualityBlocker = publishBlockers.contentQualityStatus === 'BLOCK';

  const {
    isExportingZip,
    exportProgress,
    copiedType,
    setCopiedType,
    isExportingVideo,
    videoExportProgress,
    videoExportStage,
    handleExportZip,
    handleCopySlide,
    handleExportSingleSlideVideoMp4,
  } = useExportActions({
    carousel,
    theme,
    currentSlideIndex,
    isBlocked,
    blockersCount,
    isOfflineDraft,
    isReviewed,
    overrideExportBlock,
    confirmedRiskReason,
    qaReport,
    riskReport,
    onSaveValidPost,
    onShowToast,
    setInspectorTab,
    setMobileStudioTab,
  });

  const handleCopyCaption = async () => {
    const text = formatBilingualExportCaptionWithHashtags(carousel);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType('caption');
      onShowToast('Copied EN + AR caption and hashtags to clipboard!');
      setTimeout(() => setCopiedType(null), 2000);
    } catch (err) {
      console.warn('[AutonomousStudio] Failed to copy caption to clipboard:', err);
      onShowToast('Failed to copy caption.');
    }
  };

  const handleAutoFixPreExportCheck = (checkId: PreExportCheckId, targetSlideIdx?: number) => {
    if (checkId === 'contrast') {
      const highContrastPalette = DEFAULT_PALETTES[theme.id] || DEFAULT_PALETTES.teal;
      onSelectTheme({
        ...theme,
        baseBg: highContrastPalette.baseBg,
        surface: highContrastPalette.surface,
        textWhite: '#F8FAFC',
        textEnBody: '#E2E8F0',
        textArBody: '#F1F5F9',
        accent: highContrastPalette.accent,
      });
      onShowToast('Restored WCAG AA compliant contrast palette');
      return;
    }

    if (checkId === 'unverifiedNumbers' && !isReviewed) {
      handleToggleReviewDraft();
    }

    let resolvedToast = `Auto-fixed ${checkId} check across deck`;
    applyDeckUpdate((prev) => {
      const result = applyPreExportAutoFixToDeck(prev, checkId, {
        targetSlideIdx,
        promptInput,
      });
      resolvedToast = result.toastMessage;
      return result.nextDeck;
    });
    onShowToast(resolvedToast);
  };

  const currentSlide = carousel.slides[currentSlideIndex] || carousel.slides[0];
  const activeOverridesCount = Object.keys(currentSlide.layoutOverrides || {}).length;
  const displayedCarousel =
    isComparingBefore && beforeEditsCarousel ? beforeEditsCarousel : carousel;

  const mobileSheetHeightClass =
    mobileSheetSnap === 'peek'
      ? 'h-[22dvh]'
      : mobileSheetSnap === 'full'
      ? 'h-[76dvh]'
      : 'h-[38dvh]';

  const handleSheetDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    sheetDragStartYRef.current = e.clientY;
  };

  const handleSheetDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (sheetDragStartYRef.current === null) return;
    const deltaY = e.clientY - sheetDragStartYRef.current;
    sheetDragStartYRef.current = null;
    if (deltaY < -35) {
      setMobileSheetSnap((prev) => (prev === 'peek' ? 'half' : 'full'));
    } else if (deltaY > 35) {
      setMobileSheetSnap((prev) => (prev === 'full' ? 'half' : 'peek'));
    }
  };

  return (
    <div className="w-full lg:flex-1 lg:min-h-0 flex flex-col gap-3 animate-fade-in">
      {/* 1. Compact Command Bar with Overlay Ingestion Drawer */}
      <StudioCommandBar
        promptInput={promptInput}
        inputValidationError={inputValidationError}
        onPromptChange={handlePromptChange}
        onSetPromptInput={setPromptInput}
        categoryHint={categoryHint}
        onSetCategoryHint={setCategoryHint}
        isGenerating={isGenerating}
        pipelineStatus={pipelineStatus}
        activePostFormat={activePostFormat}
        onSwitchPostFormat={handleSwitchPostFormat}
        isExpanded={isExpanded}
        onSetIsExpanded={setIsExpanded}
        isSheetOpen={isSheetOpen}
        activeTab={activeTab}
        onSetActiveTab={setActiveTab}
        studioRadarTopics={studioRadarTopics}
        onSetStudioRadarTopics={setStudioRadarTopics}
        isStudioRadarLoading={isStudioRadarLoading}
        onSetIsStudioRadarLoading={setIsStudioRadarLoading}
        studioCustomUrl={studioCustomUrl}
        onSetStudioCustomUrl={setStudioCustomUrl}
        isExtractingStudioUrl={isExtractingStudioUrl}
        onSetIsExtractingStudioUrl={setIsExtractingStudioUrl}
        uploadedImage={uploadedImage}
        onSetUploadedImage={setUploadedImage}
        isDragOver={isDragOver}
        onSetIsDragOver={setIsDragOver}
        fileInputRef={fileInputRef}
        onImageFile={handleImageFile}
        onSelectDemoImage={handleSelectDemoImage}
        onTriggerStarterTopic={handleTriggerStarterTopic}
        onClearDock={handleClearDock}
        onInstantSynthesize={handleInstantSynthesize}
        onRunAutonomousPipeline={handleRunAutonomousPipeline}
        dockCadence={dockCadence}
        theme={theme}
        onSelectTheme={onSelectTheme}
        onOpenThemeCustomizer={onOpenThemeCustomizer}
        onOpenPublishScheduleModal={onOpenPublishScheduleModal}
        onShowToast={onShowToast}
      />

      {/* 1.5 Honest Offline Fallback Warning Banner */}
      {isOfflineDraft && activePostFormat !== 'reel' && (
        <OfflineFallbackBanner
          carousel={carousel}
          theme={theme}
          promptInput={promptInput}
          isGenerating={isGenerating}
          isSyncingAllArabic={isSyncingAllArabic}
          onSetPromptInput={setPromptInput}
          onSyncAllSlidesArabic={() => void handleSyncAllSlidesArabic()}
          onRetryWithAi={(overridePrompt) => void handleRunAutonomousPipeline(overridePrompt)}
        />
      )}

      {/* 2. Fixed Studio Shell: Left Sticky 9:16 Stage | Right Categorized Inspector */}
      <div className="lg:flex-1 lg:min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-5 items-stretch">
        <StudioStageConsole
          carousel={carousel}
          displayedCarousel={displayedCarousel}
          currentSlide={currentSlide}
          currentSlideIndex={currentSlideIndex}
          activePostFormat={activePostFormat}
          activeReelConfig={activeReelConfig}
          activeVideoSlide={activeVideoSlide}
          theme={theme}
          isSheetOpen={isSheetOpen}
          mobileSheetSnap={mobileSheetSnap}
          isComparingBefore={isComparingBefore}
          showSafeZones={showSafeZones}
          stageOverlayMode={stageOverlayMode}
          selectedElementId={selectedElementId}
          selectedMotionSceneId={selectedMotionSceneId}
          isMotionExportOpen={isMotionExportOpen}
          canvasRef={canvasRef}
          isBlocked={isBlocked}
          hasContentQualityBlocker={hasContentQualityBlocker}
          blockersCount={blockersCount}
          copiedType={copiedType}
          isExportingVideo={isExportingVideo}
          videoExportProgress={videoExportProgress}
          isExportingZip={isExportingZip}
          exportProgress={exportProgress}
          isMoreMenuOpen={isMoreMenuOpen}
          onSetIsMoreMenuOpen={setIsMoreMenuOpen}
          onSelectMotionScene={setSelectedMotionSceneId}
          onToggleReelSfx={() => {
            applyDeckUpdate((prev) => ({
              ...prev,
              reelConfig: {
                ...activeReelConfig,
                sfxEnabled: activeReelConfig.sfxEnabled === false ? true : false,
              },
            }));
          }}
          onSyncReelFromCarousel={() => {
            handleSyncReelFromCarousel();
            onShowToast('Synced Motion Reel scenes from active slides');
          }}
          onRestoreCarousel={() => handleSwitchPostFormat('carousel')}
          onOpenMotionExport={() => setIsMotionExportOpen(true)}
          onUploadVideoFile={(file) => {
            void handleImageFile(file);
          }}
          onSwitchToVideoCardReel={handleSwitchToVideoCardReel}
          onPreviousSlide={() => changeSlide((prev) => Math.max(0, prev - 1))}
          onNextSlide={() => changeSlide((prev) => Math.min(carousel.slides.length - 1, prev + 1))}
          onSelectSlide={(idx) => changeSlide(idx)}
          onSelectElement={(id) => {
            setSelectedElementId(id);
            if (!id) return;
            if (id === 'graphicCard' || id === 'attributionCard') {
              setInspectorTab('visual');
            } else if (id === 'headerBadge') {
              setInspectorTab('visual');
              setIsPositionSectionOpen(true);
            } else {
              setInspectorTab('copy');
            }
          }}
          onUpdateLayoutOverride={handleUpdateElementLayoutOverride}
          onDoubleClickElement={handleDoubleClickCanvasElement}
          onUpdateSlideField={handleUpdateCurrentSlide}
          onDeleteElement={handleDeleteCanvasElement}
          onSetStageOverlayMode={setStageOverlayMode}
          onToggleSafeZones={() => setShowSafeZones((prev) => !prev)}
          onSelectDimensionPreset={handleSelectDimensionPreset}
          onAddSlide={handleAddSlide}
          onDuplicateSlide={handleDuplicateSlide}
          onDeleteSlide={handleDeleteSlide}
          onMoveSlide={handleMoveSlide}
          onOpenContactSheet={onOpenContactSheet}
          onSetSlideType={handleSetSlideType}
          onSelectDiagramVariant={handleSelectDiagramVariant}
          onDiversifyDeckVisuals={handleDiversifyDeckVisuals}
          onCopySlide={handleCopySlide}
          onCopyCaption={handleCopyCaption}
          onExportSingleSlideVideoMp4={handleExportSingleSlideVideoMp4}
          onExportZip={handleExportZip}
          onOpenPublishScheduleModal={onOpenPublishScheduleModal}
          onInspectBlockers={() => {
            setInspectorTab('review');
            setMobileStudioTab('editor');
          }}
          onShowToast={onShowToast}
        />

        {/* Right Column (Desktop) & Draggable Bottom Sheet (Mobile: Peek / Half / Full) */}
        <div
          role="region"
          aria-label="Slide Inspector and Content Editor"
          data-testid="mobile-draggable-bottom-sheet"
          data-sheet-snap={mobileSheetSnap}
          className={`lg:col-span-7 flex flex-col bg-[#0b1118]/98 border-white/15 overflow-hidden shadow-[0_-12px_36px_rgba(0,0,0,0.75)] transition-all duration-300 ${
            isSheetOpen
              ? `fixed inset-x-0 bottom-[58px] z-40 ${mobileSheetHeightClass} rounded-t-2xl border-t translate-y-0 visible pointer-events-auto`
              : 'fixed inset-x-0 bottom-0 z-40 h-[38dvh] rounded-t-2xl border-t translate-y-full invisible pointer-events-none'
          } lg:visible lg:static lg:inset-auto lg:z-auto lg:h-full lg:min-h-0 lg:rounded-2xl lg:border lg:shadow-2xl lg:translate-y-0 lg:pointer-events-auto`}
        >
          <StudioInspectorHeader
            activePostFormat={activePostFormat}
            slidesCount={carousel.slides.length}
            currentSlideIndex={currentSlideIndex}
            theme={theme}
            isExpanded={isExpanded}
            inspectorTab={inspectorTab}
            mobileSheetSnap={mobileSheetSnap}
            canUndo={canUndo}
            canRedo={canRedo}
            isComparingBefore={isComparingBefore}
            isSyncingAllArabic={isSyncingAllArabic}
            selectedElementId={selectedElementId}
            activeOverridesCount={activeOverridesCount}
            blockersCount={blockersCount}
            hasContentQualityBlocker={hasContentQualityBlocker}
            onSheetDragStart={handleSheetDragStart}
            onSheetDragEnd={handleSheetDragEnd}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onSetIsComparingBefore={setIsComparingBefore}
            onSetMobileSheetSnap={setMobileSheetSnap}
            onCloseMobileSheet={() => {
              setIsMobileSheetOpen(false);
              setMobileStudioTab('canvas');
            }}
            onSelectInspectorTab={(tab) => {
              setIsExpanded(false);
              setInspectorTab(tab);
            }}
            onSyncAllSlidesArabic={() => void handleSyncAllSlidesArabic()}
            onOpenPositionInspector={() => {
              setInspectorTab('visual');
              setIsPositionSectionOpen(true);
            }}
          />

          {/* Scrollable Tab Viewport */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {inspectorTab === 'copy' && (
              <CopyInspector
                activePostFormat={activePostFormat}
                currentSlide={currentSlide}
                currentSlideIndex={currentSlideIndex}
                totalSlides={carousel.slides.length}
                carousel={carousel}
                theme={theme}
                visibleHookVariants={visibleHookVariants}
                selectedElementId={selectedElementId}
                isSingleSlide={activePostFormat === 'single'}
                isMemeFormat={activePostFormat === 'meme'}
                isGeneratingFromVideo={isGeneratingFromVideo}
                isAnalyzingPhoto={isAnalyzingPhoto}
                isSyncingArabic={isSyncingArabic}
                photoCopySuggestion={photoCopySuggestion}
                activeReelConfig={activeReelConfig}
                selectedMotionSceneId={selectedMotionSceneId}
                onUpdateField={handleUpdateCurrentSlide}
                onSetSlideType={handleSetSlideType}
                onSmartMatchVisuals={handleSmartMatchVisuals}
                onDiversifyDeckVisuals={handleDiversifyDeckVisuals}
                onSelectElement={setSelectedElementId}
                onApplyHookVariant={handleApplyHookVariant}
                onAutoFitSlide={handleAutoFitCurrentSlide}
                onOpenPolishDrawer={
                  onOpenPreviewDrawer ? () => onOpenPreviewDrawer('polish') : undefined
                }
                onGenerateFromVideo={() => handleGenerateFromVideo()}
                onUpdateCarouselField={(field, value) =>
                  applyDeckUpdate((prev) => ({
                    ...prev,
                    [field]: value,
                  }))
                }
                onUploadMemeOrPhotoFile={(file) => {
                  void handleUploadMemePhotoFile(file);
                }}
                onUploadSlideGraphicFile={(file) => {
                  void handleUploadSlideGraphicFile(file);
                }}
                onAnalyzePhotoCaption={() => {
                  void handleAnalyzePhotoCaption();
                }}
                onApplyPhotoCopySuggestion={handleApplyPhotoCopySuggestion}
                onDismissPhotoCopySuggestion={() => setPhotoCopySuggestion(null)}
                onApplyCoverStyle={handleApplyCoverStyle}
                onOpenVisualTab={() => setInspectorTab('visual')}
                onSyncArabic={() => void handleSyncCurrentSlideArabic()}
                onSelectMotionScene={setSelectedMotionSceneId}
                onChangeReelConfig={(updated) => {
                  applyDeckUpdate((prev) => ({
                    ...prev,
                    reelConfig: updated,
                  }));
                }}
                onSyncReelFromCarousel={(tplId, langMode) => {
                  handleSyncReelFromCarousel(tplId, langMode);
                }}
                activeVideoSlide={activeVideoSlide}
                isExportingVideo={isExportingVideo}
                videoExportProgress={videoExportProgress}
                onUploadVideoFile={(file) => {
                  void handleImageFile(file);
                }}
                onAnalyzeUploadedVideo={() => {
                  void handleGenerateFromVideo();
                }}
                onSwitchToVideoCardReel={handleSwitchToVideoCardReel}
                onExportVideoCardMp4={() => {
                  void handleExportSingleSlideVideoMp4(30);
                }}
                onOpenInFilmStudio={onOpenInFilmStudio}
                onShowToast={onShowToast}
              />
            )}

            {activePostFormat !== 'reel' &&
              (inspectorTab === 'visual' || inspectorTab === 'position') && (
                <VisualInspector
                  currentSlide={currentSlide}
                  currentSlideIndex={currentSlideIndex}
                  carousel={carousel}
                  theme={theme}
                  selectedElementId={selectedElementId}
                  onSelectElement={setSelectedElementId}
                  onSetSlideType={handleSetSlideType}
                  onUpdateField={handleUpdateCurrentSlide}
                  onUpdateSlideFields={handleUpdateSlideFields}
                  onSmartMatchVisuals={handleSmartMatchVisuals}
                  onToggleAutoLayout={handleToggleAutoLayout}
                  onReimagineVisual={() => void handleReimagineVisual()}
                  isReimaginingVisual={isReimaginingVisual}
                  onDiversifyDeckVisuals={handleDiversifyDeckVisuals}
                  onUpdateCarouselField={(field, value) =>
                    applyDeckUpdate((prev) => ({
                      ...prev,
                      [field]: value,
                    }))
                  }
                  onUpdateSatLabel={handleUpdateSatLabel}
                  onUpdateSatIcon={handleUpdateSatIcon}
                  onUpdateCenterIcon={handleUpdateCenterIcon}
                  onUpdateCenterTag={handleUpdateCenterTag}
                  onAddSatNode={handleAddSatNode}
                  onDeleteSatNode={handleDeleteSatNode}
                  onUpdateDiagramNode={handleUpdateDiagramNode}
                  onUpdateDiagramEdge={handleUpdateDiagramEdge}
                  onOpenAiImageStudio={() => setImageStudioTargetIndex(currentSlideIndex)}
                  onOpenMediaSearch={() =>
                    setMediaModalTarget({
                      field: 'imageUrl',
                      title: 'Search Architecture Graphic',
                      initialQuery: currentSlide.enTitle?.slice(0, 30) || '',
                    })
                  }
                  onExportVideoMp4={handleExportSingleSlideVideoMp4}
                  isExportingVideo={isExportingVideo}
                  videoExportProgress={videoExportProgress}
                  videoExportStage={videoExportStage}
                  onGenerateFromVideo={(fileOrUrl) => handleGenerateFromVideo(fileOrUrl)}
                  isGeneratingFromVideo={isGeneratingFromVideo}
                  onGenerateFromPhoto={(file, dataUrl, mode) => {
                    void handleAnalyzePhotoCaption(
                      dataUrl,
                      file.type || 'image/jpeg',
                      file.name,
                      mode
                    );
                  }}
                  isPositionSectionOpen={isPositionSectionOpen || inspectorTab === 'position'}
                  onTogglePositionSection={() => {
                    if (inspectorTab === 'position') {
                      setInspectorTab('visual');
                      setIsPositionSectionOpen(false);
                    } else {
                      setIsPositionSectionOpen((prev) => !prev);
                    }
                  }}
                  activeOverridesCount={activeOverridesCount}
                  onApplyCoverStyle={handleApplyCoverStyle}
                  onUpdateElementLayoutOverride={handleUpdateElementLayoutOverride}
                  onResetSlideLayoutOverrides={handleResetSlideLayoutOverrides}
                  onApplyOverrideToAllSlides={handleApplyOverrideToAllSlides}
                  onApplySlideLayoutToAllSlides={handleApplySlideLayoutToAllSlides}
                  imageStudioTargetIndex={imageStudioTargetIndex}
                  onApplyStudioImage={(targetIndex, imageUrl, prompt, model) => {
                    applyDeckUpdate((prev) => {
                      if (targetIndex < 0 || targetIndex >= prev.slides.length) return prev;
                      const newSlides = [...prev.slides];
                      newSlides[targetIndex] = sanitizeSlide(
                        {
                          ...newSlides[targetIndex],
                          imageUrl,
                          imagePrompt: prompt,
                          imageModel: model,
                        },
                        targetIndex,
                        prev.slides.length
                      );
                      return { ...prev, slides: newSlides };
                    });
                    setImageStudioTargetIndex(null);
                    onShowToast(`Applied AI diagram to Slide ${targetIndex + 1}`);
                  }}
                  onCloseStudioImage={() => setImageStudioTargetIndex(null)}
                  onShowToast={onShowToast}
                />
              )}

            {(inspectorTab === 'review' || inspectorTab === 'caption') && (
              <div className="space-y-4 w-full">
                <ReviewInspector
                  carousel={carousel}
                  currentSlideIndex={currentSlideIndex}
                  theme={theme}
                  isOfflineDraft={isOfflineDraft}
                  isReviewed={isReviewed}
                  qaReport={qaReport}
                  riskReport={riskReport}
                  overrideExportBlock={overrideExportBlock}
                  onToggleOverrideBlock={handleToggleOverrideBlock}
                  onToggleReviewDraft={handleToggleReviewDraft}
                  onRetryWithAi={() => handleRunAutonomousPipeline()}
                  onJumpToSlide={(idx: number) => {
                    changeSlide(idx);
                    setInspectorTab('copy');
                  }}
                  onAutoFixPreExportCheck={handleAutoFixPreExportCheck}
                  onToggleOfficialBrandIcon={(brandKey: string, enabled: boolean) => {
                    applyDeckUpdate((prev) => ({
                      ...prev,
                      officialBrandIcons: {
                        ...(prev.officialBrandIcons || {}),
                        [brandKey]: enabled,
                      },
                    }));
                    onShowToast(
                      enabled
                        ? `Enabled official Simple Icons SVG badge (≤8% width) for ${brandKey}`
                        : `Switched ${brandKey} to styled text name`
                    );
                  }}
                  onUpdateCreator={(newCreator: string) => {
                    applyDeckUpdate((prev) => {
                      const trimmed = newCreator.trim();
                      const newSlides = [...prev.slides];
                      const lastIdx = newSlides.length - 1;
                      if (
                        lastIdx >= 0 &&
                        (newSlides[lastIdx].type === 'cta' || newSlides.length === 1)
                      ) {
                        newSlides[lastIdx] = {
                          ...newSlides[lastIdx],
                          enCredit: trimmed ? `Source: ${trimmed}` : '',
                          arCredit: trimmed ? `المصدر: ${trimmed}` : '',
                        };
                      }
                      return {
                        ...prev,
                        brand: 'MARROK',
                        channel: trimmed,
                        slides: newSlides,
                        sourceMeta: {
                          ...prev.sourceMeta,
                          creator: newCreator,
                          channel: newCreator,
                        },
                      };
                    });
                  }}
                  onSelectDimensionPreset={handleSelectDimensionPreset}
                  onOpenPublishScheduleModal={onOpenPublishScheduleModal}
                  onShowToast={onShowToast}
                />

                <CaptionInspector
                  caption={carousel.caption || ''}
                  onChangeCaption={(caption) =>
                    applyDeckUpdate((prev) => ({
                      ...prev,
                      caption,
                    }))
                  }
                  hashtags={dynamicHashtags}
                  activePostFormat={activePostFormat}
                  isVideoSlide={isVideoSlide(currentSlide)}
                  isGeneratingFromVideo={isGeneratingFromVideo}
                  onGenerateFromVideo={() => handleGenerateFromVideo()}
                  copiedType={copiedType}
                  onCopyCaption={handleCopyCaption}
                  theme={theme}
                  onOpenPublishScheduleModal={onOpenPublishScheduleModal}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Docked Single-Row Mobile Navigation & Inspector Bar (58px height) */}
      <MobileStudioBottomBar
        carousel={carousel}
        currentSlideIndex={currentSlideIndex}
        activePostFormat={activePostFormat}
        theme={theme}
        isSheetOpen={isSheetOpen}
        inspectorTab={inspectorTab}
        isBlocked={isBlocked}
        hasContentQualityBlocker={hasContentQualityBlocker}
        blockersCount={blockersCount}
        isExportingZip={isExportingZip}
        isMoreMenuOpen={isMoreMenuOpen}
        onSetIsMoreMenuOpen={setIsMoreMenuOpen}
        onSelectTab={(tab) => {
          setInspectorTab(tab);
          setIsMobileSheetOpen(true);
          setMobileStudioTab('editor');
        }}
        onCloseSheet={() => {
          setIsMobileSheetOpen(false);
          setMobileStudioTab('canvas');
        }}
        onSelectDimensionPreset={handleSelectDimensionPreset}
        onCopySlide={handleCopySlide}
        onCopyCaption={handleCopyCaption}
        onExportZip={handleExportZip}
        onOpenMotionExport={() => setIsMotionExportOpen(true)}
        onOpenContactSheet={onOpenContactSheet}
        onOpenPublishScheduleModal={onOpenPublishScheduleModal}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        isComparingBefore={isComparingBefore}
        onCompareBeforeStart={() => setIsComparingBefore(true)}
        onCompareBeforeEnd={() => setIsComparingBefore(false)}
        onShowToast={onShowToast}
      />

      {/* Motion Reel Export Modal */}
      {isMotionExportOpen && (
        <Suspense fallback={null}>
          <MotionExportModal
            isOpen={isMotionExportOpen}
            reelConfig={activeReelConfig}
            theme={theme}
            onClose={() => setIsMotionExportOpen(false)}
            onShowToast={onShowToast}
          />
        </Suspense>
      )}

      {/* Media Search Modal */}
      {mediaModalTarget && (
        <Suspense fallback={null}>
          <MediaSearchModal
            isOpen={Boolean(mediaModalTarget)}
            theme={theme}
            onClose={() => setMediaModalTarget(null)}
            title={mediaModalTarget.title || 'Search Web Media'}
            initialQuery={mediaModalTarget.initialQuery}
            onSelectUrl={(url: string) => {
              handleUpdateCurrentSlide('imageUrl', url);
              setMediaModalTarget(null);
              onShowToast('Applied web visual to slide');
            }}
          />
        </Suspense>
      )}
    </div>
  );
};
