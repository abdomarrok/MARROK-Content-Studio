import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  Sliders,
  Type,
  Layers,
  Languages,
  Loader2,
  Film,
  Undo2,
  Redo2,
  Eye,
} from 'lucide-react';
import { fetchAuthedJson, HttpClientError } from '../lib/network/httpClient.ts';
import {
  CarouselData,
  CoverStyle,
  PostFormat,
  SlideData,
  SlideType,
  ThemePalette,
  HookVariant,
  DiagramNode,
  DiagramVariant,
  DEFAULT_PALETTES,
  GraphicalElementId,
  SavedPostStatus,
  MotionReelData,
  MotionTemplateId,
  CanvasDimensionPreset,
  SavedPostRecord,
} from '../types.ts';
import { analyzePostHistoryCadence, normalizeThemeId } from '../lib/theme/cadenceEngine.ts';
import {
  getCanvasDimensionSpec,
  isVideoSlide,
  analyzeVideoForSlideAndCaption,
  analyzeImageForMemeAndCaption,
  formatBilingualExportCaptionWithHashtags,
} from '../lib/canvasExporter.ts';
import {
  revokeAllTrackedBlobUrls,
} from '../lib/media/blobUrlRegistry.ts';
import { runAutonomousPipeline, enrichAndPaceCarousel } from '../lib/autonomousPipeline.ts';
import { sanitizeSlide } from '../lib/textSanitizer.ts';
import {
  seedSlideArchetypeData,
  synthesizeCarousel,
  resolveSmartSlideVisuals,
  analyzeSlideTextForArchetype,
  diversifyDeckArchetypesAndVisuals,
  autoSyncSlideGraphicsFromCopy,
  validateSourceSufficiency,
  InsufficientSourceError,
  evaluateAutoLayoutForSlideEdit,
  getSlideCatalogId,
  materializeLayoutForSlide,
  rankSlideLayoutsForDeck,
  findCatalogDescriptor,
  applyCoverStyleToSlide,
  resolveSlide1CoverStyle,
  deriveCoverTeaserForSlide,
} from '../lib/synthesizer.ts';
import { requestAiVisualDirection } from '../lib/studio/visualDirectorClient.ts';
import { applyPreExportAutoFixToDeck } from '../lib/studio/preExportAutoFix.ts';
import {
  switchCarouselPostFormat,
  resolveEffectivePostFormat,
  filterRelevantHookVariants,
  snapshotFormatDraft,
} from '../lib/studio/formatWorkspace.ts';
import { runQAChecks, type PreExportCheckId } from '../lib/qaChecks.ts';
import { runPlatformRiskChecks } from '../lib/riskChecks.ts';
import {
  convertCarouselToMotionReel,
} from '../lib/motion/index.ts';
import {
  ViewportCanvas,
  SlideNavigator,
  CopyInspector,
  VisualInspector,
  ReviewInspector,
  CaptionInspector,
  getPublishBlockers,
  StageOverlayMode,
  MotionReelViewport,
  useStudioShortcutsAndClipboard,
} from './studio/index.ts';

const MediaSearchModal = lazy(() =>
  import('./MediaSearchModal.tsx').then((m) => ({ default: m.MediaSearchModal }))
);
const MotionExportModal = lazy(() =>
  import('./studio/motion/MotionExportModal.tsx').then((m) => ({ default: m.MotionExportModal }))
);

function deriveTopicHashtags(carousel: CarouselData): string[] {
  const captionMatches = (carousel.caption || '').match(/#[A-Za-z0-9_\u0600-\u06FF]+/g);
  if (captionMatches && captionMatches.length >= 3) {
    return Array.from(new Set(captionMatches)).slice(0, 6);
  }

  const tags = new Set<string>(['#MARROK', '#SystemDesign']);
  const catWords = (carousel.category || '')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length >= 3);
  if (catWords.length > 0) {
    tags.add(`#${catWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('')}`);
  }

  const firstTitleWords = (carousel.slides[0]?.enTitle || '')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length >= 4 && !/^(with|from|into|beyond|when|what|your|that|this)$/i.test(w));
  for (const w of firstTitleWords.slice(0, 2)) {
    tags.add(`#${w.charAt(0).toUpperCase() + w.slice(1)}`);
  }

  tags.add('#SoftwareEngineering');
  tags.add('#TechInArabic');
  return Array.from(tags).slice(0, 6);
}

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

import {
  StudioCommandBar,
  STARTER_TOPICS,
} from './studio/panels/StudioCommandBar.tsx';
import { UnderCanvasDeliveryDock } from './studio/panels/UnderCanvasDeliveryDock.tsx';
import { MobileStudioBottomBar } from './studio/panels/MobileStudioBottomBar.tsx';
import { useSlideNavigation } from '../hooks/useSlideNavigation.ts';
import { useThemeCadence } from '../hooks/useThemeCadence.ts';
import { useStudioLayoutActions } from '../hooks/useStudioLayoutActions.ts';
import { useExportActions } from '../hooks/useExportActions.ts';
import { useMediaIngestion } from '../hooks/useMediaIngestion.ts';

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
  const {
    currentSlideIndex,
    currentSlideIndexRef,
    changeSlide,
  } = useSlideNavigation({
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
  const [inspectorTab, setInspectorTab] = useState<'copy' | 'visual' | 'position' | 'caption' | 'review'>('copy');
  const [isPositionSectionOpen, setIsPositionSectionOpen] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<GraphicalElementId | null>(null);

  // Smart Dock Expansion & Tab
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'text' | 'radar' | 'youtube' | 'upload'>('text');

  // Photo & Video analysis suggestion refs for media ingestion
  const handleAnalyzePhotoCaptionRef = useRef<
    (
      imageDataUrlOverride?: string,
      mimeTypeOverride?: string,
      fileNameOverride?: string,
      modeOverride?: 'meme' | 'graphic'
    ) => Promise<void>
  >(async () => {});
  const handleGenerateFromVideoRef = useRef<
    (sourceOverride?: File | string) => Promise<void>
  >(async () => {});

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

  // Intelligent Feed Cadence Analysis for Live Context via custom hook
  const { cadence: dockCadence } = useThemeCadence({
    savedPosts,
    activeThemeId: theme.id,
    prompt: promptInput,
    category: categoryHint,
  });

  // Layout Actions Hook
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

  const [isGenerating, setIsGenerating] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);

  // Deep Customization States
  const [imageStudioTargetIndex, setImageStudioTargetIndex] = useState<number | null>(null);
  const [mediaModalTarget, setMediaModalTarget] = useState<{
    field: 'imageUrl';
    title?: string;
    initialQuery?: string;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Mobile Studio Segmented Mode Switcher ('canvas' | 'editor') & Draggable Bottom Sheet ('peek' | 'half' | 'full')
  const [mobileStudioTab, setMobileStudioTab] = useState<'canvas' | 'editor'>('canvas');
  const [mobileSheetSnap, setMobileSheetSnap] = useState<'peek' | 'half' | 'full'>('half');
  const isSheetOpen = isMobileSheetOpen || mobileStudioTab === 'editor';
  const sheetDragStartYRef = useRef<number | null>(null);

  // Motion Reel Studio States
  const [selectedMotionSceneId, setSelectedMotionSceneId] = useState<string | null>(null);
  const [isMotionExportOpen, setIsMotionExportOpen] = useState(false);

  // Async lifecycle guards: only the latest generation/image request may commit.
  const generationAbortRef = useRef<AbortController | null>(null);
  const generationRunIdRef = useRef(0);
  const isMountedRef = useRef(true);

  // Smart Auto-Layout & On-Demand AI Visual Director state
  const [isReimaginingVisual, setIsReimaginingVisual] = useState(false);
  const reimagineAbortRef = useRef<AbortController | null>(null);
  const triedLayoutsBySlideRef = useRef<Map<number, { textKey: string; triedIds: string[] }>>(new Map());
  const lastAutoEvalKeyRef = useRef<string>('');
  const latestCarouselRef = useRef(carousel);
  latestCarouselRef.current = carousel;

  useEffect(() => {
    return () => {
      revokeAllTrackedBlobUrls();
    };
  }, []);

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

  const activeReelConfig: MotionReelData = useMemo(
    () =>
      carousel.reelConfig ||
      convertCarouselToMotionReel(carousel, theme, 'marrok-slides', 'bilingual'),
    [carousel, theme]
  );

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

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      generationAbortRef.current?.abort();
      generationAbortRef.current = null;
      reimagineAbortRef.current?.abort();
      reimagineAbortRef.current = null;
    };
  }, []);

  // Keep the image studio bound to a valid slide in range
  useEffect(() => {
    if (imageStudioTargetIndex !== null && imageStudioTargetIndex >= carousel.slides.length) {
      setImageStudioTargetIndex(null);
    }
  }, [carousel.slides.length, imageStudioTargetIndex]);

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
  }, [setIsExpanded]);

  useStudioShortcutsAndClipboard({
    slidesCount: carousel.slides.length,
    isExpanded,
    onCollapseExpanded: handleCollapseExpanded,
    onChangeSlide: changeSlide,
    onPasteImageFile: handlePasteImageFromClipboard,
    onOpenContactSheet,
  });

  // Unified Autonomous Generation Handler
  const handleRunAutonomousPipeline = async (overridePrompt?: string) => {
    const query = (overridePrompt !== undefined ? overridePrompt : promptInput).trim();
    const pipelineTargetFormat: 'carousel' | 'single' =
      activePostFormat === 'single' ? 'single' : 'carousel';
    const sufficiency = validateSourceSufficiency({
      prompt: query,
      categoryHint,
      imageFileName: uploadedImage?.name,
      hasMedia: Boolean(uploadedImage),
      postFormat: pipelineTargetFormat,
    });
    if (!sufficiency.isSufficient) {
      setInputValidationError(sufficiency.reason);
      onShowToast(sufficiency.reason);
      return;
    }
    setInputValidationError(null);

    // Automatically collapse overlay drawer when starting generation
    setIsExpanded(false);

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    const runId = ++generationRunIdRef.current;
    const startRevision = deckRevisionRef.current;
    const isCurrentRun = () =>
      isMountedRef.current && runId === generationRunIdRef.current && !controller.signal.aborted;

    setIsGenerating(true);
    setPipelineStatus(
      uploadedImage
        ? activePostFormat === 'single'
          ? 'Processing image & synthesizing single-slide post...'
          : activePostFormat === 'reel'
          ? 'Processing image & synthesizing motion reel...'
          : 'Processing image & synthesizing AI carousel...'
        : activePostFormat === 'single'
        ? 'Synthesizing Single-Slide Post...'
        : activePostFormat === 'reel'
        ? 'Synthesizing Motion Reel Scenes...'
        : 'Synthesizing AI Carousel...'
    );

    try {
      const pipelineTargetFormat: 'carousel' | 'single' =
        activePostFormat === 'single' ? 'single' : 'carousel';
      const generated = await runAutonomousPipeline(query, {
        theme,
        generateDiagram: !uploadedImage,
        inputMode: activeTab,
        imageBase64: uploadedImage?.base64,
        imageMimeType: uploadedImage?.mimeType,
        imageName: uploadedImage?.name,
        categoryHint: categoryHint !== 'auto' ? categoryHint : undefined,
        postFormat: pipelineTargetFormat,
        signal: controller.signal,
        onProgress: (status) => {
          if (isCurrentRun()) setPipelineStatus(status);
        },
      });

      if (!isCurrentRun()) return;

      if (deckRevisionRef.current !== startRevision) {
        onShowToast('Generation finished, but your newer edits were kept. Re-run to replace the deck.');
        return;
      }

      // Cadence-Aware Auto-Theme Routing:
      // Avoids consecutive duplicate colors and applies topic-harmonic resolution based on posted history
      const cadenceAnalysis = analyzePostHistoryCadence(savedPosts, {
        prompt: query,
        category: generated.category || (categoryHint !== 'auto' ? categoryHint : undefined),
      });

      const rawAiThemeKey = generated.theme ? normalizeThemeId(generated.theme) : null;
      let resolvedTheme = theme;
      let cadenceToastNote = '';

      // If AI proposed a theme that repeats the most recent posted theme, resolve to harmonic cadence
      if (rawAiThemeKey && rawAiThemeKey === cadenceAnalysis.lastPostedThemeId) {
        resolvedTheme = cadenceAnalysis.recommendedPalette;
        cadenceToastNote = ` · Assigned ${resolvedTheme.name.split(' ')[0]} to avoid repeating last post`;
      } else if (rawAiThemeKey && DEFAULT_PALETTES[rawAiThemeKey]) {
        resolvedTheme = DEFAULT_PALETTES[rawAiThemeKey];
      } else {
        // If AI returned fallback theme or none, assign the smart next palette
        resolvedTheme = cadenceAnalysis.recommendedPalette;
      }

      onSelectTheme(resolvedTheme);

      const activeSlideBeforeGen = carousel.slides[currentSlideIndex] || carousel.slides[0];
      const preserveActiveVideo = activeSlideBeforeGen && isVideoSlide(activeSlideBeforeGen);
      const mergedSlides = preserveActiveVideo
        ? generated.slides.map((s, idx) =>
            idx === 0
              ? {
                  ...s,
                  type:
                    activeSlideBeforeGen.type === 'poster' || activePostFormat === 'single'
                      ? ('poster' as const)
                      : ('image' as const),
                  mediaType: 'video' as const,
                  videoUrl: activeSlideBeforeGen.videoUrl,
                  videoMimeType: activeSlideBeforeGen.videoMimeType,
                  videoFileName: activeSlideBeforeGen.videoFileName,
                  videoDuration: activeSlideBeforeGen.videoDuration,
                  videoMuted: activeSlideBeforeGen.videoMuted ?? true,
                  videoPlaying: activeSlideBeforeGen.videoPlaying ?? true,
                  videoBorderRadius: activeSlideBeforeGen.videoBorderRadius ?? 8,
                  imageFrameMode:
                    activeSlideBeforeGen.imageFrameMode === 'standard' ? ('standard' as const) : ('hero' as const),
                  imageFit: activeSlideBeforeGen.imageFit || 'contain',
                  imageBgStyle: activeSlideBeforeGen.imageBgStyle || 'white',
                  brandWatermark: activeSlideBeforeGen.brandWatermark || 'bottom-right',
                }
              : s
          )
        : generated.slides;

      const scopedGeneratedHooks = filterRelevantHookVariants(
        generated.hookVariants,
        mergedSlides,
        generated.category
      );

      const finalGenerated: CarouselData =
        activePostFormat === 'reel'
          ? {
              ...generated,
              slides: mergedSlides,
              formatDrafts: undefined,
              hookVariants: scopedGeneratedHooks,
              theme: resolvedTheme.id,
              postFormat: 'reel',
              reelConfig: convertCarouselToMotionReel(
                { ...generated, slides: mergedSlides },
                resolvedTheme,
                activeReelConfig.templateId || 'kinetic-text',
                activeReelConfig.languageMode || 'ar'
              ),
            }
          : {
              ...generated,
              slides: mergedSlides,
              formatDrafts: undefined,
              hookVariants: scopedGeneratedHooks,
              dimensionPreset: preserveActiveVideo
                ? carousel.dimensionPreset || 'ig-3:4'
                : generated.dimensionPreset,
              theme: resolvedTheme.id,
            };

      onUpdateCarousel(finalGenerated);
      changeSlide(0, finalGenerated.slides.length);
      setIsExpanded(false);
      setInspectorTab('copy');
      if (finalGenerated.sourceMeta?.isFallback || finalGenerated.sourceMeta?.engine === 'offline-synthesizer') {
        onShowToast(
          (activePostFormat === 'single'
            ? 'Offline NLP Engine Activated: Synthesized single-slide post from your notes.'
            : activePostFormat === 'reel'
            ? 'Offline NLP Engine Activated: Synthesized motion reel scenes from your notes.'
            : 'Offline NLP Engine Activated: Synthesized custom slides from your notes.') + cadenceToastNote
        );
      } else {
        onShowToast(
          (activePostFormat === 'single'
            ? '✨ Autonomously generated standalone 1080×1920 single-slide post!'
            : activePostFormat === 'reel'
            ? '✨ Autonomously generated 1080×1920 animated Motion Reel!'
            : '✨ Autonomously generated and perfected 8-slide carousel!') + cadenceToastNote
        );
      }
    } catch (err) {
      if (controller.signal.aborted || !isCurrentRun()) return;
      if (
        err instanceof InsufficientSourceError ||
        (err && typeof err === 'object' && (err as { code?: string }).code === 'INSUFFICIENT_SOURCE')
      ) {
        const message = err instanceof Error ? err.message : 'Please paste a real topic or source before generating.';
        setInputValidationError(message);
        onShowToast(message);
        return;
      }
      console.error('Autonomous pipeline error:', err);
      onShowToast('Pipeline error — loaded resilient backup template.');
    } finally {
      if (runId === generationRunIdRef.current) {
        setIsGenerating(false);
        setPipelineStatus(null);
      }
    }
  };

  // Instant local synthesis fallback (0ms latency, zero network dependence)
  const handleInstantSynthesize = () => {
    const targetFormat: 'carousel' | 'single' =
      activePostFormat === 'single' ? 'single' : 'carousel';
    const sufficiency = validateSourceSufficiency({
      prompt: promptInput,
      categoryHint,
      imageFileName: uploadedImage?.name,
      hasMedia: Boolean(uploadedImage),
      postFormat: targetFormat,
    });
    if (!sufficiency.isSufficient) {
      setInputValidationError(sufficiency.reason);
      onShowToast(sufficiency.reason);
      return;
    }
    setInputValidationError(null);
    setIsExpanded(false);
    setInspectorTab('copy');
    generationRunIdRef.current += 1;
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setIsGenerating(false);
    setPipelineStatus(null);

    try {
      const generated = synthesizeCarousel({
        prompt: promptInput,
        categoryHint,
        inputMode: activeTab,
        imageFileName: uploadedImage?.name,
        hasMedia: Boolean(uploadedImage),
        postFormat: targetFormat,
      });
      const processed = enrichAndPaceCarousel(generated, promptInput);
      const resolvedTheme =
        processed.theme && DEFAULT_PALETTES[processed.theme]
          ? DEFAULT_PALETTES[processed.theme]
          : theme;
      if (processed.theme && DEFAULT_PALETTES[processed.theme]) {
        onSelectTheme(DEFAULT_PALETTES[processed.theme]);
      }
      const scopedProcessedHooks = filterRelevantHookVariants(
        processed.hookVariants,
        processed.slides,
        processed.category
      );
      const finalProcessed: CarouselData =
        activePostFormat === 'reel'
          ? {
              ...processed,
              formatDrafts: undefined,
              hookVariants: scopedProcessedHooks,
              postFormat: 'reel',
              reelConfig: convertCarouselToMotionReel(
                processed,
                resolvedTheme,
                activeReelConfig.templateId || 'marrok-slides',
                activeReelConfig.languageMode || 'bilingual'
              ),
            }
          : {
              ...processed,
              formatDrafts: undefined,
              hookVariants: scopedProcessedHooks,
            };
      onUpdateCarousel(finalProcessed);
      changeSlide(0, finalProcessed.slides.length);
      onShowToast(
        activePostFormat === 'single'
          ? '⚡ Synthesized standalone Single-Slide Post (Instant Offline Mode)'
          : activePostFormat === 'reel'
          ? '⚡ Synthesized animated Motion Reel (Instant Offline Mode)'
          : `⚡ Synthesized ${finalProcessed.slides.length}-slide carousel (Instant Offline Mode)`
      );
    } catch (err: unknown) {
      if (
        err instanceof InsufficientSourceError ||
        (err && typeof err === 'object' && (err as { code?: string }).code === 'INSUFFICIENT_SOURCE')
      ) {
        const message = err instanceof Error ? err.message : 'Please paste a real topic or source before generating.';
        setInputValidationError(message);
        onShowToast(message);
        return;
      }
      onShowToast(err instanceof Error ? err.message : 'Instant synthesis failed.');
    }
  };

  const handleTriggerStarterTopic = (topic: typeof STARTER_TOPICS[number]) => {
    setPromptInput(topic.prompt);
    handleRunAutonomousPipeline(topic.prompt);
  };

  // Immediate Archetype Switcher: Auto-seeds required fields and locks layout manually
  const handleSetSlideType = (newType: SlideType) => {
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      const current = prev.slides[targetIndex];
      if (!current) return prev;

      const seeded = seedSlideArchetypeData(current, newType, targetIndex, false);
      const lockedSeeded: SlideData = {
        ...seeded,
        manualLayoutLocked: true,
        layoutRationale: `Manual ${newType.toUpperCase()} — locked by creator`,
      };
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = sanitizeSlide(lockedSeeded, targetIndex, prev.slides.length);

      return {
        ...prev,
        slides: newSlides,
        sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
      };
    });
    onShowToast(`Switched layout to ${newType.toUpperCase()} (Manual lock enabled)`);
  };

  // Toggle Auto vs Manual Layout Mode on Active Slide
  const handleToggleAutoLayout = () => {
    const targetIndex = Math.min(currentSlideIndexRef.current, latestCarouselRef.current.slides.length - 1);
    const current = latestCarouselRef.current.slides[targetIndex];
    if (!current) return;

    if (current.manualLayoutLocked) {
      const deckSlides = latestCarouselRef.current.slides;
      const ranked = rankSlideLayoutsForDeck(current, deckSlides, targetIndex, {
        postFormat: activePostFormat,
      });
      const best = ranked[0];
      let chosenLabel = current.type.toUpperCase();
      applyDeckUpdate((prev) => {
        const idx = Math.min(targetIndex, prev.slides.length - 1);
        const curr = prev.slides[idx];
        if (!curr) return prev;
        const updatedSlide = best
          ? materializeLayoutForSlide(curr, best, idx, prev.slides.length, {
              rationalePrefix: 'Auto-picked',
              lockLayout: false,
              forceRefreshVisuals: true,
            })
          : { ...curr, manualLayoutLocked: false };
        if (best) chosenLabel = best.label;
        const newSlides = [...prev.slides];
        newSlides[idx] = sanitizeSlide(updatedSlide, idx, prev.slides.length);
        return {
          ...prev,
          slides: newSlides,
          sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
        };
      });
      lastAutoEvalKeyRef.current = `${targetIndex}|${current.enTitle || ''}|${current.arTitle || ''}|${current.enBody || ''}|${current.arBody || ''}|${activePostFormat}|false`;
      onShowToast(`Auto layout enabled: ${chosenLabel}`);
    } else {
      applyDeckUpdate((prev) => {
        const idx = Math.min(targetIndex, prev.slides.length - 1);
        const curr = prev.slides[idx];
        if (!curr) return prev;
        const newSlides = [...prev.slides];
        newSlides[idx] = {
          ...curr,
          manualLayoutLocked: true,
          layoutRationale: curr.layoutRationale || `Manual ${curr.type.toUpperCase()} — locked by creator`,
        };
        return { ...prev, slides: newSlides };
      });
      lastAutoEvalKeyRef.current = `${targetIndex}|${current.enTitle || ''}|${current.arTitle || ''}|${current.enBody || ''}|${current.arBody || ''}|${activePostFormat}|true`;
      onShowToast(`Manual layout locked for Slide ${targetIndex + 1}`);
    }
  };

  // On-Demand AI Visual Director ("Re-imagine")
  const handleReimagineVisual = async () => {
    const deckSnapshot = latestCarouselRef.current;
    const targetIndex = Math.min(currentSlideIndexRef.current, deckSnapshot.slides.length - 1);
    const targetSlide = deckSnapshot.slides[targetIndex];
    if (!targetSlide) return;

    reimagineAbortRef.current?.abort();
    const controller = new AbortController();
    reimagineAbortRef.current = controller;
    setIsReimaginingVisual(true);

    const textKey = `${targetSlide.enTitle || ''}|${targetSlide.enBody || ''}|${targetSlide.arTitle || ''}`;
    const existingEntry = triedLayoutsBySlideRef.current.get(targetIndex);
    const currentCatalogId = getSlideCatalogId(targetSlide);
    const prevTried = existingEntry && existingEntry.textKey === textKey ? existingEntry.triedIds : [];
    const excludeLayouts = Array.from(new Set([...prevTried, currentCatalogId]));

    try {
      const result = await requestAiVisualDirection({
        slide: targetSlide,
        slides: deckSnapshot.slides,
        slideIndex: targetIndex,
        category: deckSnapshot.category,
        postFormat: activePostFormat,
        excludeLayouts,
        signal: controller.signal,
      });

      if (!isMountedRef.current || controller.signal.aborted) return;

      triedLayoutsBySlideRef.current.set(targetIndex, {
        textKey,
        triedIds: Array.from(new Set([...excludeLayouts, result.chosenLayoutId])),
      });

      lastAutoEvalKeyRef.current = `${targetIndex}|${targetSlide.enTitle || ''}|${targetSlide.arTitle || ''}|${targetSlide.enBody || ''}|${targetSlide.arBody || ''}|${activePostFormat}|false`;

      applyDeckUpdate((prev) => {
        if (targetIndex < 0 || targetIndex >= prev.slides.length) return prev;
        const curr = prev.slides[targetIndex];
        const merged: SlideData = {
          ...curr,
          ...result.slideUpdates,
          enTitle: curr.enTitle,
          arTitle: curr.arTitle,
          enBody: curr.enBody,
          arBody: curr.arBody,
          manualLayoutLocked: false,
          layoutRationale: result.rationale,
        };
        const newSlides = [...prev.slides];
        newSlides[targetIndex] = sanitizeSlide(merged, targetIndex, prev.slides.length);
        return {
          ...prev,
          slides: newSlides,
          sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
        };
      });

      const chosenDesc = findCatalogDescriptor(result.chosenLayoutId);
      const engineTag = result.engine === 'ungrounded' ? 'AI Visual Director' : 'Smart Director';
      onShowToast(`${engineTag}: switched to ${chosenDesc?.label || result.chosenLayoutId}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      onShowToast(err instanceof Error ? err.message : 'Could not re-imagine visual layout');
    } finally {
      if (reimagineAbortRef.current === controller) {
        reimagineAbortRef.current = null;
        if (isMountedRef.current) {
          setIsReimaginingVisual(false);
        }
      }
    }
  };

  // 1-Click Smart Match Visuals to Slide Copy (sets manualLayoutLocked: false when picking best fit)
  const handleSmartMatchVisuals = (useRecommendedArchetype = true) => {
    let matchedTypeLabel = '';
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      const current = prev.slides[targetIndex];
      if (!current) return prev;

      if (useRecommendedArchetype) {
        const ranked = rankSlideLayoutsForDeck(current, prev.slides, targetIndex, {
          postFormat: resolveEffectivePostFormat(prev),
        });
        const best = ranked[0];
        if (best) {
          matchedTypeLabel = best.label;
          const materialized = materializeLayoutForSlide(current, best, targetIndex, prev.slides.length, {
            rationalePrefix: 'Auto-picked',
            lockLayout: false,
            forceRefreshVisuals: true,
          });
          const newSlides = [...prev.slides];
          newSlides[targetIndex] = sanitizeSlide(materialized, targetIndex, prev.slides.length);
          return {
            ...prev,
            slides: newSlides,
            sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
          };
        }
      }

      const recommendedArchetype = analyzeSlideTextForArchetype(current, targetIndex);
      const targetType: SlideType = useRecommendedArchetype
        ? recommendedArchetype
        : current.type;
      matchedTypeLabel = targetType.toUpperCase();

      const seeded = seedSlideArchetypeData(current, targetType, targetIndex, true);
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = sanitizeSlide(
        { ...seeded, manualLayoutLocked: useRecommendedArchetype ? false : current.manualLayoutLocked },
        targetIndex,
        prev.slides.length
      );

      return {
        ...prev,
        slides: newSlides,
        sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
      };
    });
    onShowToast(
      useRecommendedArchetype
        ? `Auto-picked ${matchedTypeLabel} for slide copy`
        : `Updated ${matchedTypeLabel} visual elements from slide copy`
    );
  };

  // 1-Click Schematic Variant Switcher from Stage Console (locks manually)
  const handleSelectDiagramVariant = (variant: DiagramVariant) => {
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      const current = prev.slides[targetIndex];
      if (!current) return prev;

      const refreshed = resolveSmartSlideVisuals(
        { ...current, type: current.type === 'poster' ? 'poster' : 'row', diagramVariant: variant },
        targetIndex,
        true
      );
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = sanitizeSlide(
        {
          ...current,
          type: current.type === 'poster' ? 'poster' : 'row',
          diagramVariant: variant,
          diagramNodes: refreshed.diagramNodes,
          diagramEdges: refreshed.diagramEdges,
          diagramFooter: refreshed.diagramFooter,
          manualLayoutLocked: true,
          layoutRationale: `Manual ${variant.toUpperCase()} — locked by creator`,
        },
        targetIndex,
        prev.slides.length
      );
      return { ...prev, slides: newSlides };
    });
    onShowToast(`Switched diagram schematic to ${variant.toUpperCase()}`);
  };

  // 1-Click Deck-Wide Dynamic Archetype & Graphic Diversifier (Slides 2 to N-1)
  const handleDiversifyDeckVisuals = () => {
    applyDeckUpdate((prev) => {
      const diversified = diversifyDeckArchetypesAndVisuals(prev.slides).map((s, idx, arr) =>
        sanitizeSlide(s, idx, arr.length)
      );
      return {
        ...prev,
        slides: diversified,
      };
    });
    onShowToast('✨ Diversified Slides 2–7 across Compare, Code, Metric & Schematic layouts');
  };

  // Explicit confirmation: Creator confirms draft review (advisory status)
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

  // Slide Management Handlers
  const handleAddSlide = () => {
    const targetIdx = Math.min(currentSlideIndex + 1, carousel.slides.length);
    const baseSlide: SlideData = {
      type: 'row',
      enTitle: 'Core technical mechanism.',
      arTitle: 'آلية العمل التقنية.',
      enBody: 'Direct architectural explanation of how the system executes under the hood.',
      arBody: 'شرح معماري مباشر لكيفية عمل النظام في الخلفية.',
    };
    const newSlide = seedSlideArchetypeData(baseSlide, 'row', targetIdx, true);
    const nextLength = carousel.slides.length + 1;
    applyDeckUpdate((prev) => {
      const insertAt = Math.min(currentSlideIndex + 1, prev.slides.length);
      const newSlides = [...prev.slides];
      newSlides.splice(insertAt, 0, newSlide);
      return { ...prev, slides: newSlides };
    });
    changeSlide(targetIdx, nextLength);
    onShowToast(`Added slide #${targetIdx + 1}`);
  };

  const handleDuplicateSlide = () => {
    const fromIdx = Math.min(currentSlideIndex, carousel.slides.length - 1);
    if (!carousel.slides[fromIdx]) return;
    const targetIdx = fromIdx + 1;
    const nextLength = carousel.slides.length + 1;
    applyDeckUpdate((prev) => {
      const idx = Math.min(currentSlideIndex, prev.slides.length - 1);
      const current = prev.slides[idx];
      if (!current) return prev;
      const clone = structuredClone(current);
      const newSlides = [...prev.slides];
      newSlides.splice(idx + 1, 0, clone);
      return { ...prev, slides: newSlides };
    });
    changeSlide(targetIdx, nextLength);
    onShowToast(`Duplicated slide #${targetIdx + 1}`);
  };

  const handleDeleteSlide = () => {
    if (carousel.slides.length <= 3) {
      onShowToast('Minimum 3 slides required in carousel');
      return;
    }
    const deleteAt = Math.min(currentSlideIndex, carousel.slides.length - 1);
    const nextLength = carousel.slides.length - 1;
    const newIdx = Math.max(0, Math.min(nextLength - 1, deleteAt - 1));
    applyDeckUpdate((prev) => {
      if (prev.slides.length <= 3) return prev;
      const targetDeleteAt = Math.min(currentSlideIndex, prev.slides.length - 1);
      const newSlides = prev.slides.filter((_, idx) => idx !== targetDeleteAt);
      return {
        ...prev,
        slides: newSlides,
      };
    });
    changeSlide(newIdx, nextLength);
    onShowToast(`Deleted slide #${deleteAt + 1}`);
  };

  const handleMoveSlide = (direction: 'left' | 'right') => {
    const fromIndex = Math.min(currentSlideIndex, carousel.slides.length - 1);
    const targetIndex = direction === 'left' ? fromIndex - 1 : fromIndex + 1;
    if (targetIndex < 0 || targetIndex >= carousel.slides.length) return;
    applyDeckUpdate((prev) => {
      const srcIdx = Math.min(currentSlideIndex, prev.slides.length - 1);
      const dstIdx = direction === 'left' ? srcIdx - 1 : srcIdx + 1;
      if (dstIdx < 0 || dstIdx >= prev.slides.length) return prev;
      const newSlides = [...prev.slides];
      const [removed] = newSlides.splice(srcIdx, 1);
      newSlides.splice(dstIdx, 0, removed);
      return { ...prev, slides: newSlides };
    });
    changeSlide(targetIndex, carousel.slides.length);
    onShowToast(`Moved slide to position #${targetIndex + 1}`);
  };

  const handleApplyCoverStyle = (coverStyle: CoverStyle) => {
    applyDeckUpdate((prev) => {
      if (!prev.slides[0]) return prev;
      const newSlides = [...prev.slides];
      const nextCover = applyCoverStyleToSlide(
        newSlides[0],
        coverStyle,
        0,
        newSlides.length,
        true,
        newSlides
      );
      newSlides[0] = sanitizeSlide(nextCover, 0, newSlides.length);
      return { ...prev, slides: newSlides };
    });
    onShowToast(`Slide 1 Cover style switched to ${coverStyle}`);
  };

  const handleApplyHookVariant = (variant: HookVariant) => {
    applyDeckUpdate((prev) => {
      if (!prev.slides[0]) return prev;
      const newSlides = [...prev.slides];
      const isMultiDeck =
        newSlides.length > 1 && prev.postFormat !== 'single' && prev.postFormat !== 'meme';
      const baseSlide0 = newSlides[0];
      const resolvedStyle =
        variant.coverStyle ||
        baseSlide0.coverStyle ||
        resolveSlide1CoverStyle(
          {
            ...baseSlide0,
            enTitle: variant.enTitle,
            arTitle: variant.arTitle,
          },
          newSlides
        );
      const derivedTeasers = isMultiDeck
        ? deriveCoverTeaserForSlide(
            {
              ...baseSlide0,
              enTitle: variant.enTitle,
              arTitle: variant.arTitle,
              coverTeaserEn: variant.coverTeaserEn || baseSlide0.coverTeaserEn,
              coverTeaserAr: variant.coverTeaserAr || baseSlide0.coverTeaserAr,
            },
            newSlides
          )
        : undefined;

      const updatedSlide0: SlideData = {
        ...baseSlide0,
        type: variant.coverArchetype || baseSlide0.type,
        enTitle: variant.enTitle,
        arTitle: variant.arTitle,
        enBody: isMultiDeck ? '' : variant.enBody,
        arBody: isMultiDeck ? '' : variant.arBody,
        centerIcon: variant.centerIcon || baseSlide0.centerIcon,
        hookKicker: variant.hookKicker || baseSlide0.hookKicker,
        ...(isMultiDeck
          ? {
              storyRole: 'hook' as const,
              compositionPreset: 'headline-first' as const,
              coverStyle: resolvedStyle,
              coverTeaserEn: variant.coverTeaserEn || derivedTeasers?.coverTeaserEn || '',
              coverTeaserAr: variant.coverTeaserAr || derivedTeasers?.coverTeaserAr || '',
              showSwipeCue: baseSlide0.showSwipeCue ?? true,
            }
          : {}),
      };

      const prepared = isMultiDeck
        ? applyCoverStyleToSlide(
            updatedSlide0,
            resolvedStyle,
            0,
            newSlides.length,
            Boolean(baseSlide0.manualLayoutLocked),
            newSlides
          )
        : autoSyncSlideGraphicsFromCopy(
            seedSlideArchetypeData(updatedSlide0, updatedSlide0.type),
            0
          );

      newSlides[0] = sanitizeSlide(prepared, 0, newSlides.length);
      return { ...prev, slides: newSlides };
    });
    onShowToast(
      `Applied "${variant.tag}" Hook${variant.coverStyle ? ` (${variant.coverStyle})` : variant.coverArchetype ? ` (${variant.coverArchetype.toUpperCase()} Cover)` : ''} to Slide 1`
    );
  };

  const [overrideExportBlock, setOverrideExportBlock] = useState(false);
  const [confirmedRiskReason, setConfirmedRiskReason] = useState<string | null>(null);
  const [isSyncingArabic, setIsSyncingArabic] = useState(false);
  const [isSyncingAllArabic, setIsSyncingAllArabic] = useState(false);

  const handleSyncCurrentSlideArabic = async () => {
    const targetIndex = Math.min(currentSlideIndex, carousel.slides.length - 1);
    const targetSlide = carousel.slides[targetIndex];
    if (!targetSlide) return;
    if (!(targetSlide.enTitle || '').trim() && !(targetSlide.enBody || '').trim() && !(targetSlide.coverTeaserEn || '').trim()) {
      onShowToast('Add English copy first before syncing Arabic.');
      return;
    }
    setIsSyncingArabic(true);
    try {
      const isCoverSlide = targetIndex === 0 && carousel.slides.length > 1 && activePostFormat === 'carousel';
      const data = await fetchAuthedJson<{
        engine?: string;
        arTitle?: string;
        coverTeaserAr?: string;
        arBody?: string;
        takeaways?: SlideData['takeaways'];
      }>('/api/refine-slide', {
        method: 'POST',
        includeGeminiKeys: true,
        timeoutMs: 75_000,
        contextLabel: 'AI Arabic slide sync',
        body: {
          mode: 'sync_ar',
          slide: targetSlide,
          category: carousel.category || 'SOFTWARE ARCHITECTURE',
          isCover: isCoverSlide,
        },
      });
      if (!data || data.engine === 'offline') {
        onShowToast('Live AI translation temporarily unavailable — keeping current Arabic.');
        return;
      }
      applyDeckUpdate((prev) => {
        if (!prev.slides[targetIndex]) return prev;
        const nextSlides = [...prev.slides];
        const existing = nextSlides[targetIndex];
        nextSlides[targetIndex] = {
          ...existing,
          arTitle: typeof data.arTitle === 'string' && data.arTitle.trim() ? data.arTitle.trim() : existing.arTitle,
          ...(isCoverSlide || typeof data.coverTeaserAr === 'string'
            ? {
                coverTeaserAr:
                  typeof data.coverTeaserAr === 'string' && data.coverTeaserAr.trim()
                    ? data.coverTeaserAr.trim()
                    : existing.coverTeaserAr,
              }
            : {}),
          arBody:
            isCoverSlide
              ? ''
              : typeof data.arBody === 'string'
              ? data.arBody.trim()
              : existing.arBody,
          ...(Array.isArray(data.takeaways) ? { takeaways: data.takeaways } : {}),
        };
        return { ...prev, slides: nextSlides };
      });
      onShowToast(`Synced Arabic for Slide ${targetIndex + 1} from English.`);
    } catch (err) {
      console.warn('[AutonomousStudio] Arabic slide sync failed:', err);
      onShowToast(
        err instanceof HttpClientError
          ? 'Live AI translation unavailable right now — please try again shortly.'
          : 'Could not reach AI translation service.'
      );
    } finally {
      setIsSyncingArabic(false);
    }
  };

  const handleSyncAllSlidesArabic = async () => {
    if (!carousel.slides.length) return;
    setIsSyncingAllArabic(true);
    try {
      interface SyncedArabicSlide {
        index?: number;
        arTitle?: string;
        coverTeaserAr?: string;
        arBody?: string;
      }
      const data = await fetchAuthedJson<{
        engine?: string;
        slides?: SyncedArabicSlide[];
      }>('/api/refine-slide', {
        method: 'POST',
        includeGeminiKeys: true,
        timeoutMs: 90_000,
        contextLabel: 'AI Arabic deck sync',
        body: {
          mode: 'sync_ar_deck',
          slides: carousel.slides,
          category: carousel.category || 'SOFTWARE ARCHITECTURE',
        },
      });
      if (!data || data.engine === 'offline' || !Array.isArray(data.slides)) {
        onShowToast('Live AI translation temporarily unavailable — try again in a moment.');
        return;
      }
      const syncedSlides = data.slides;
      applyDeckUpdate((prev) => {
        const isMultiCarousel = prev.slides.length > 1 && activePostFormat === 'carousel';
        const nextSlides = prev.slides.map((slide, idx) => {
          const synced = syncedSlides.find((item) => Number(item?.index) === idx) || syncedSlides[idx];
          if (!synced) return slide;
          const isSlide1Cover = idx === 0 && isMultiCarousel && !slide.standaloneMeme;
          return {
            ...slide,
            arTitle: typeof synced.arTitle === 'string' && synced.arTitle.trim() ? synced.arTitle.trim() : slide.arTitle,
            ...(isSlide1Cover || slide.coverTeaserEn
              ? {
                  coverTeaserAr:
                    typeof synced.coverTeaserAr === 'string' && synced.coverTeaserAr.trim()
                      ? synced.coverTeaserAr.trim()
                      : slide.coverTeaserAr,
                }
              : {}),
            arBody: isSlide1Cover
              ? ''
              : typeof synced.arBody === 'string'
              ? synced.arBody.trim()
              : slide.arBody,
          };
        });
        return { ...prev, slides: nextSlides };
      });
      onShowToast(`Synced Arabic across all ${carousel.slides.length} slides.`);
    } catch (err) {
      console.warn('[AutonomousStudio] Arabic deck sync failed:', err);
      onShowToast(
        err instanceof HttpClientError
          ? 'Live AI translation unavailable right now — please try again shortly.'
          : 'Could not reach AI translation service.'
      );
    } finally {
      setIsSyncingAllArabic(false);
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

  // Video-to-Slide-Text & Social Caption Generation State & Handler
  const [isGeneratingFromVideo, setIsGeneratingFromVideo] = useState(false);

  const handleGenerateFromVideo = async (sourceOverride?: File | string) => {
    const activeSlide = carousel.slides[currentSlideIndex] || carousel.slides[0];
    const videoSource =
      sourceOverride || activeSlide?.videoUrl || '';
    if (!videoSource && !uploadedImage) {
      onShowToast('Please upload a video first to generate slide text and caption.');
      return;
    }

    setIsGeneratingFromVideo(true);
    setPipelineStatus('Analyzing video frames & generating slide copy + social caption...');
    try {
      const targetFormat: 'carousel' | 'single' =
        activePostFormat === 'single' || carousel.slides.length === 1 ? 'single' : 'carousel';
      const fileName =
        sourceOverride instanceof File
          ? sourceOverride.name
          : activeSlide?.videoFileName || uploadedImage?.name || 'video-clip.mp4';

      const result = await analyzeVideoForSlideAndCaption({
        videoSource: videoSource || uploadedImage?.base64 || '',
        videoFileName: fileName,
        prompt: promptInput,
        currentSlide: activeSlide || carousel.slides[0],
        theme,
        categoryHint: categoryHint !== 'auto' ? categoryHint : carousel.category,
        postFormat: targetFormat,
        onProgress: (status) => setPipelineStatus(status),
      });

      applyDeckUpdate((prev) => {
        const targetIndex = Math.min(currentSlideIndexRef.current, prev.slides.length - 1);
        if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
        const current = prev.slides[targetIndex];
        const newSlides = [...prev.slides];
        newSlides[targetIndex] = sanitizeSlide(
          {
            ...current,
            ...result.slideUpdates,
            // Preserve the live video URL if already set in state
            mediaType: 'video',
            videoUrl: current.videoUrl || result.slideUpdates.videoUrl || '',
            videoMimeType: current.videoMimeType || result.slideUpdates.videoMimeType || 'video/mp4',
            videoFileName: current.videoFileName || fileName,
            // Ensure slide text is visible underneath the white video card!
            imageFrameMode:
              current.imageFrameMode === 'standard' ? 'standard' : 'hero',
          },
          targetIndex,
          prev.slides.length
        );
        const nextCategory = result.category || prev.category;
        const nextHookVariants =
          result.hookVariants && result.hookVariants.length > 0
            ? result.hookVariants
            : filterRelevantHookVariants(prev.hookVariants, newSlides, nextCategory);
        const updatedCarousel: CarouselData = {
          ...prev,
          category: nextCategory,
          caption: result.caption || prev.caption,
          hookVariants: nextHookVariants,
          slides: newSlides,
        };
        if (prev.postFormat === 'reel' || activePostFormat === 'reel') {
          updatedCarousel.reelConfig = convertCarouselToMotionReel(
            updatedCarousel,
            theme,
            prev.reelConfig?.templateId || activeReelConfig.templateId || 'marrok-slides',
            prev.reelConfig?.languageMode || activeReelConfig.languageMode || 'bilingual'
          );
        }
        return updatedCarousel;
      });

      onShowToast(
        activePostFormat === 'reel'
          ? '✨ Extracted video keyframes into 9:16 Reel scenes & bilingual caption!'
          : '✨ Generated bilingual slide text & social caption from your video!'
      );
    } catch (err) {
      console.error('Video text & caption generation failed:', err);
      onShowToast('Generated fallback slide text & caption from video metadata.');
    } finally {
      setIsGeneratingFromVideo(false);
      setPipelineStatus(null);
    }
  };
  handleGenerateFromVideoRef.current = handleGenerateFromVideo;

  const activeVideoSlide = useMemo(
    () => carousel.slides.find((s) => isVideoSlide(s)) || null,
    [carousel.slides]
  );

  const handleSwitchToVideoCardReel = useCallback(() => {
    const videoSlideIdx = carousel.slides.findIndex((s) => isVideoSlide(s));
    const targetSlide =
      (videoSlideIdx >= 0 ? carousel.slides[videoSlideIdx] : carousel.slides[0]) ||
      carousel.slides[0];
    if (!targetSlide) return;

    applyDeckUpdate((prev) => {
      const prevFormat = resolveEffectivePostFormat(prev);
      const nextDrafts =
        prevFormat !== 'single'
          ? snapshotFormatDraft(prev.formatDrafts, prevFormat, prev.slides, currentSlideIndexRef.current)
          : prev.formatDrafts;
      const singleVideoSlide: SlideData = sanitizeSlide(
        {
          ...targetSlide,
          type: 'poster',
          mediaType: 'video',
          imageFrameMode: targetSlide.imageFrameMode === 'standard' ? 'standard' : 'hero',
          imageFit: targetSlide.imageFit || 'contain',
          imageBgStyle: targetSlide.imageBgStyle || 'white',
          brandWatermark: targetSlide.brandWatermark || 'bottom-right',
        },
        0,
        1
      );
      return {
        ...prev,
        postFormat: 'single',
        dimensionPreset: 'tiktok-9:16',
        formatDrafts: nextDrafts,
        slides: [singleVideoSlide],
      };
    });
    changeSlide(0, 1);
    setInspectorTab('visual');
    onShowToast('🎬 Opened 9:16 (1080×1920) Video Clip Stage — ready to edit or export MP4!');
  }, [applyDeckUpdate, carousel.slides, changeSlide, currentSlideIndexRef, onShowToast]);

  // Meme / Photo AI Vision Caption & Optional Slide Headline Suggestion Generator
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [photoCopySuggestion, setPhotoCopySuggestion] = useState<{
    enTitle: string;
    arTitle: string;
    enBody?: string;
    arBody?: string;
  } | null>(null);

  const handleAnalyzePhotoCaption = async (
    imageDataUrlOverride?: string,
    mimeTypeOverride?: string,
    fileNameOverride?: string,
    modeOverride?: 'meme' | 'graphic'
  ) => {
    const activeSlide = carousel.slides[currentSlideIndexRef.current] || carousel.slides[0];
    const imageDataUrl =
      imageDataUrlOverride || activeSlide?.imageUrl || uploadedImage?.base64 || '';
    if (!imageDataUrl) {
      onShowToast('Please upload a meme or photo first.');
      return;
    }

    const effectiveMode: 'meme' | 'graphic' =
      modeOverride ||
      (activePostFormat === 'meme' || Boolean(activeSlide?.standaloneMeme) ? 'meme' : 'graphic');

    setIsAnalyzingPhoto(true);
    try {
      const result = await analyzeImageForMemeAndCaption({
        imageDataUrl,
        imageMimeType: mimeTypeOverride || uploadedImage?.mimeType || 'image/jpeg',
        imageFileName: fileNameOverride || uploadedImage?.name || 'meme-photo.jpg',
        prompt: promptInput,
        theme,
        keepFullMemeMode: effectiveMode === 'meme',
        onProgress: (status) => setPipelineStatus(status),
      });

      if (effectiveMode === 'meme') {
        setPhotoCopySuggestion(null);
        applyDeckUpdate((prev) => {
          const nextCategory = result.category || prev.category;
          return {
            ...prev,
            category: nextCategory,
            caption: result.caption || prev.caption,
            hookVariants:
              result.hookVariants && result.hookVariants.length > 0
                ? result.hookVariants
                : filterRelevantHookVariants(prev.hookVariants, prev.slides, nextCategory),
          };
        });
        onShowToast('✨ Auto-generated category tag & social caption from your meme!');
      } else {
        // Normal Slide Graphic mode: keep existing slide text untouched and offer optional 1-click AI headline suggestion!
        setPhotoCopySuggestion({
          enTitle: result.suggestedEnTitle,
          arTitle: result.suggestedArTitle,
          enBody: result.suggestedEnBody,
          arBody: result.suggestedArBody,
        });
        onShowToast('✨ Photo analyzed — optional AI headline suggestion ready!');
      }
    } catch (err) {
      console.warn('Photo caption generation fallback used:', err);
    } finally {
      setIsAnalyzingPhoto(false);
      setPipelineStatus(null);
    }
  };
  handleAnalyzePhotoCaptionRef.current = handleAnalyzePhotoCaption;

  const handleApplyPhotoCopySuggestion = () => {
    if (!photoCopySuggestion) return;
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndexRef.current, prev.slides.length - 1);
      if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
      const nextSlides = [...prev.slides];
      nextSlides[targetIndex] = sanitizeSlide(
        {
          ...nextSlides[targetIndex],
          enTitle: photoCopySuggestion.enTitle || nextSlides[targetIndex].enTitle,
          arTitle: photoCopySuggestion.arTitle || nextSlides[targetIndex].arTitle,
          enBody: photoCopySuggestion.enBody || nextSlides[targetIndex].enBody,
          arBody: photoCopySuggestion.arBody || nextSlides[targetIndex].arBody,
        },
        targetIndex,
        prev.slides.length
      );
      return { ...prev, slides: nextSlides };
    });
    setPhotoCopySuggestion(null);
    onShowToast('Applied suggested AI headlines & body from photo');
  };

  // Copy EN + AR Caption & Hashtags
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

  // One-Tap Pre-Export Auto-Fix Handler
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
  const smartCurrentVisuals = useMemo(
    () => resolveSmartSlideVisuals(currentSlide, currentSlideIndex, false),
    [currentSlide, currentSlideIndex]
  );

  // Debounced live copy watcher: upgrades unlocked slide layouts automatically without flickering
  const currentSlideEvalKey = currentSlide
    ? `${currentSlideIndex}|${currentSlide.enTitle || ''}|${currentSlide.arTitle || ''}|${currentSlide.enBody || ''}|${currentSlide.arBody || ''}|${activePostFormat}|${Boolean(currentSlide.manualLayoutLocked)}`
    : '';

  const lastSeenRestoreVersionRef = useRef<number>(historyRestoreVersion);

  useEffect(() => {
    if (!currentSlideEvalKey) return;
    if (historyRestoreVersion !== lastSeenRestoreVersionRef.current) {
      lastSeenRestoreVersionRef.current = historyRestoreVersion;
      lastAutoEvalKeyRef.current = currentSlideEvalKey;
      return;
    }
    if (!lastAutoEvalKeyRef.current) {
      lastAutoEvalKeyRef.current = currentSlideEvalKey;
      return;
    }
    const [prevIdx] = lastAutoEvalKeyRef.current.split('|');
    const [nextIdx] = currentSlideEvalKey.split('|');
    if (prevIdx !== nextIdx) {
      lastAutoEvalKeyRef.current = currentSlideEvalKey;
      return;
    }
    if (lastAutoEvalKeyRef.current === currentSlideEvalKey) {
      return;
    }

    const slideSnapshot = latestCarouselRef.current.slides[currentSlideIndex];
    if (
      isGenerating ||
      isReimaginingVisual ||
      !slideSnapshot ||
      slideSnapshot.manualLayoutLocked ||
      slideSnapshot.type === 'cta' ||
      slideSnapshot.standaloneMeme ||
      slideSnapshot.imageUrl ||
      slideSnapshot.videoUrl
    ) {
      lastAutoEvalKeyRef.current = currentSlideEvalKey;
      return;
    }

    const targetIdx = currentSlideIndex;
    const timer = window.setTimeout(() => {
      const deckNow = latestCarouselRef.current;
      const slideNow = deckNow.slides[targetIdx];
      if (!slideNow || slideNow.manualLayoutLocked || isReimaginingVisual) return;

      const formatNow = resolveEffectivePostFormat(deckNow);
      const nextSlide = evaluateAutoLayoutForSlideEdit(slideNow, deckNow.slides, targetIdx, {
        postFormat: formatNow,
      });

      lastAutoEvalKeyRef.current = `${targetIdx}|${slideNow.enTitle || ''}|${slideNow.arTitle || ''}|${slideNow.enBody || ''}|${slideNow.arBody || ''}|${formatNow}|${Boolean(slideNow.manualLayoutLocked)}`;

      if (!nextSlide) return;

      applyDeckUpdate((prev) => {
        if (targetIdx < 0 || targetIdx >= prev.slides.length) return prev;
        const newSlides = [...prev.slides];
        newSlides[targetIdx] = sanitizeSlide(nextSlide, targetIdx, prev.slides.length);
        return { ...prev, slides: newSlides };
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [currentSlideEvalKey, currentSlideIndex, historyRestoreVersion, isGenerating, isReimaginingVisual]);

  const handleUpdateSatLabel = (index: number, value: string) => {
    const currentLabels = [...smartCurrentVisuals.satLabels];
    currentLabels[index] = value;
    handleUpdateCurrentSlide('satLabels', currentLabels);
  };

  const handleUpdateSatIcon = (index: number, iconName: string) => {
    const currentIcons = [...smartCurrentVisuals.satIcons];
    currentIcons[index] = iconName;
    handleUpdateCurrentSlide('satIcons', currentIcons);
    onShowToast(`Updated node #${index + 1} icon to ${iconName}`);
  };

  const handleUpdateCenterIcon = (iconName: string) => {
    handleUpdateCurrentSlide('centerIcon', iconName);
    onShowToast(`Updated central hub icon to ${iconName}`);
  };

  const handleUpdateCenterTag = (tag: string) => {
    handleUpdateCurrentSlide('centerTag', tag);
  };

  const handleAddSatNode = () => {
    const currentLabels = [...smartCurrentVisuals.satLabels];
    if (currentLabels.length >= 6) {
      onShowToast('Maximum 6 orbital nodes reached');
      return;
    }
    const defaultAdditions = ['Gateway', 'Cache Layer', 'Event Stream', 'Policy Mesh', 'Telemetry', 'Core Engine'];
    const newLabel = defaultAdditions[currentLabels.length] || `Node ${currentLabels.length + 1}`;
    const newLabels = [...currentLabels, newLabel];

    const currentIcons = [...smartCurrentVisuals.satIcons];
    const iconPool = ['zap', 'hardDrive', 'lock', 'terminal', 'cloud', 'activity', 'cpu', 'box'];
    const newIcons = [...currentIcons, iconPool[currentLabels.length % iconPool.length]];

    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = {
        ...newSlides[targetIndex],
        satLabels: newLabels,
        satIcons: newIcons,
      };
      return { ...prev, slides: newSlides };
    });
    onShowToast(`Added orbital node #${newLabels.length}`);
  };

  const handleDeleteSatNode = (indexToDelete: number) => {
    const currentLabels = [...smartCurrentVisuals.satLabels];
    if (currentLabels.length <= 2) {
      onShowToast('Hub diagram requires at least 2 orbital nodes');
      return;
    }
    const newLabels = currentLabels.filter((_, idx) => idx !== indexToDelete);
    const currentIcons = [...smartCurrentVisuals.satIcons];
    const newIcons = currentIcons.filter((_, idx) => idx !== indexToDelete);

    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = {
        ...newSlides[targetIndex],
        satLabels: newLabels,
        satIcons: newIcons,
      };
      return { ...prev, slides: newSlides };
    });
    onShowToast(`Deleted orbital node #${indexToDelete + 1}`);
  };

  const handleUpdateDiagramNode = (nodeIndex: number, field: keyof DiagramNode, value: string) => {
    const existing = smartCurrentVisuals.diagramNodes.map((n) => ({ ...n }));
    existing[nodeIndex] = {
      ...existing[nodeIndex],
      [field]: value,
    };
    handleUpdateCurrentSlide('diagramNodes', existing);
  };

  const handleUpdateDiagramEdge = (edgeIndex: number, value: string) => {
    const currentEdges = [...smartCurrentVisuals.diagramEdges];
    currentEdges[edgeIndex] = value;
    handleUpdateCurrentSlide('diagramEdges', currentEdges);
  };

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

      {/* 1.5 Honest Offline Fallback Warning Banner (Only when local fallback engine generated the deck) */}
      {isOfflineDraft && activePostFormat !== 'reel' && (
        <div
          role="status"
          data-testid="offline-fallback-banner"
          className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2 rounded-xl bg-amber-500/[0.06] border border-amber-500/30 text-xs text-amber-100"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-amber-200">Offline Draft Fallback</span>
              <span aria-hidden="true" className="text-amber-500/60 mx-1.5">·</span>
              <span className="text-amber-100/85">
                Live AI &amp; backup models were unavailable ({carousel.sourceMeta?.fallbackReason || 'local synthesizer used'}).
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="fallback-sync-all-ar-btn"
              disabled={isSyncingAllArabic || isGenerating}
              onClick={() => void handleSyncAllSlidesArabic()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-45 border border-white/[0.12] text-[11px] font-medium text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {isSyncingAllArabic ? (
                <Loader2 className="w-3 h-3 animate-spin" style={{ color: theme.accent }} />
              ) : (
                <Languages className="w-3 h-3" style={{ color: theme.accent }} />
              )}
              <span>{isSyncingAllArabic ? 'Syncing AR…' : 'Sync All AR'}</span>
            </button>
            <button
              type="button"
              data-testid="fallback-retry-ai-btn"
              disabled={isGenerating}
              onClick={() => {
                const retryPrompt =
                  promptInput.trim() ||
                  carousel.sourceMeta?.title ||
                  carousel.slides[0]?.enTitle ||
                  '';
                if (retryPrompt && !promptInput.trim()) {
                  setPromptInput(retryPrompt);
                }
                void handleRunAutonomousPipeline(retryPrompt || undefined);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-45 border border-amber-400/40 text-[11px] font-semibold text-amber-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
              <span>Retry with AI</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. Fixed Studio Shell: Left Sticky 9:16 Stage | Right Categorized Inspector */}
      <div className="lg:flex-1 lg:min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-5 items-stretch">
        {/* Left Column: Sticky 9:16 Canvas + Slide Navigator + Single Persistent Under-Canvas Delivery Bar */}
        <div
          className={`lg:col-span-5 flex flex-col items-center justify-between w-full lg:h-full lg:min-h-0 gap-1.5 sm:gap-2 ${
            isSheetOpen ? 'sticky top-1 z-20 bg-[#05080c]/95 pb-1 rounded-2xl' : ''
          } lg:static lg:bg-transparent lg:pb-0`}
        >
          {activePostFormat === 'reel' ? (
            <MotionReelViewport
              reelConfig={activeReelConfig}
              theme={theme}
              selectedSceneId={selectedMotionSceneId}
              isExporting={isMotionExportOpen}
              activeVideoSlide={activeVideoSlide}
              onSelectScene={(sceneId) => setSelectedMotionSceneId(sceneId)}
              onToggleSfx={() => {
                applyDeckUpdate((prev) => ({
                  ...prev,
                  reelConfig: {
                    ...activeReelConfig,
                    sfxEnabled: activeReelConfig.sfxEnabled === false ? true : false,
                  },
                }));
              }}
              onSyncFromCarousel={() => {
                handleSyncReelFromCarousel();
                onShowToast('Synced Motion Reel scenes from active slides');
              }}
              onRestoreCarousel={() => handleSwitchPostFormat('carousel')}
              onOpenExportModal={() => setIsMotionExportOpen(true)}
              onUploadVideoFile={(file) => {
                void handleImageFile(file);
              }}
              onSwitchToVideoCardReel={handleSwitchToVideoCardReel}
            />
          ) : (
            <>
              <div className="flex-1 min-h-0 flex items-center justify-center w-full pt-0.5 sm:pt-0">
                <ViewportCanvas
                  carousel={displayedCarousel}
                  currentSlideIndex={currentSlideIndex}
                  theme={theme}
                  showSafeZones={showSafeZones}
                  stageOverlayMode={stageOverlayMode}
                  onPreviousSlide={() => changeSlide((prev) => Math.max(0, prev - 1))}
                  onNextSlide={() => changeSlide((prev) => Math.min(carousel.slides.length - 1, prev + 1))}
                  canvasRef={canvasRef}
                  selectedElementId={selectedElementId}
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
                  compactMobileStage={isSheetOpen && mobileSheetSnap === 'full'}
                  isComparingBefore={isComparingBefore}
                />
              </div>
            </>
          )}

          {/* UNIFIED STAGE CONSOLE: Slide Strip + Single Persistent Delivery Bar */}
          <div className="w-full px-3 py-2.5 bg-[#0b1118] border border-white/10 rounded-2xl space-y-2 shadow-xl shrink-0">
            {activePostFormat !== 'reel' && (
              <SlideNavigator
                carousel={carousel}
                currentSlideIndex={currentSlideIndex}
                showSafeZones={showSafeZones}
                stageOverlayMode={stageOverlayMode}
                onSetStageOverlayMode={setStageOverlayMode}
                onToggleSafeZones={() => setShowSafeZones(!showSafeZones)}
                onSelectDimensionPreset={handleSelectDimensionPreset}
                onSelectSlide={(idx) => changeSlide(idx)}
                onAddSlide={handleAddSlide}
                onDuplicateSlide={handleDuplicateSlide}
                onDeleteSlide={handleDeleteSlide}
                onMoveSlide={handleMoveSlide}
                onOpenContactSheet={onOpenContactSheet}
                onSetSlideType={handleSetSlideType}
                onSelectDiagramVariant={handleSelectDiagramVariant}
                onDiversifyDeckVisuals={handleDiversifyDeckVisuals}
              />
            )}

            <UnderCanvasDeliveryDock
              carousel={carousel}
              currentSlide={currentSlide}
              currentSlideIndex={currentSlideIndex}
              activePostFormat={activePostFormat}
              activeReelConfig={activeReelConfig}
              theme={theme}
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
              onSelectDimensionPreset={handleSelectDimensionPreset}
              onCopySlide={handleCopySlide}
              onCopyCaption={handleCopyCaption}
              onExportSingleSlideVideoMp4={handleExportSingleSlideVideoMp4}
              onExportZip={handleExportZip}
              onOpenMotionExport={() => setIsMotionExportOpen(true)}
              onOpenContactSheet={onOpenContactSheet}
              onOpenPublishScheduleModal={onOpenPublishScheduleModal}
              onInspectBlockers={() => {
                setInspectorTab("review");
                setMobileStudioTab("editor");
              }}
              onShowToast={onShowToast}
            />
          </div>
        </div>

        {/* Right Column (Desktop) & Draggable Bottom Sheet (Mobile: Peek / Half / Full): Live Slide Remains Sticky & Visible Above! */}
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
          {/* Mobile Draggable Bottom Sheet Handle & Snap Controls (Peek / Half / Full) */}
          <div
            onPointerDown={handleSheetDragStart}
            onPointerUp={handleSheetDragEnd}
            onPointerCancel={handleSheetDragEnd}
            className="lg:hidden flex flex-col border-b border-white/10 bg-black/70 shrink-0 select-none touch-none"
          >
            {/* Drag Pill */}
            <div className="w-full pt-1.5 pb-1 flex items-center justify-center cursor-ns-resize">
              <div className="w-10 h-1 rounded-full bg-white/30" />
            </div>

            <div className="flex items-center justify-between px-3 pb-1.5 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: theme.accent }}
                />
                <span className="text-[11px] font-medium text-slate-200 truncate">
                  Slide {currentSlideIndex + 1} ·{' '}
                  {inspectorTab === 'copy'
                    ? activePostFormat === 'reel'
                      ? 'Motion'
                      : 'Content'
                    : inspectorTab === 'visual' || inspectorTab === 'position'
                    ? 'Visual'
                    : 'Publish'}
                </span>
              </div>

              {/* Undo / Redo / Compare Before + Snap Pills: Peek / Half / Full + Done */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={!canUndo}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleUndo}
                  className="p-1 rounded-md bg-white/[0.04] text-slate-300 hover:text-white border border-white/10 disabled:opacity-35 cursor-pointer"
                  title="Undo last edit"
                >
                  <Undo2 className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  disabled={!canRedo}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleRedo}
                  className="p-1 rounded-md bg-white/[0.04] text-slate-300 hover:text-white border border-white/10 disabled:opacity-35 cursor-pointer"
                  title="Redo edit"
                >
                  <Redo2 className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onPointerDown={() => setIsComparingBefore(true)}
                  onPointerUp={() => setIsComparingBefore(false)}
                  onPointerLeave={() => setIsComparingBefore(false)}
                  onPointerCancel={() => setIsComparingBefore(false)}
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold border transition-colors cursor-pointer select-none ${
                    isComparingBefore
                      ? 'bg-amber-500/25 text-amber-200 border-amber-400'
                      : 'bg-white/[0.04] text-slate-300 border-white/10'
                  }`}
                  title="Press and hold to compare with before edits"
                >
                  Before
                </button>

                <span className="w-px h-3 bg-white/10 mx-0.5" />

                {(
                  [
                    { id: 'peek', label: 'Peek' },
                    { id: 'half', label: 'Half' },
                    { id: 'full', label: 'Full' },
                  ] as const
                ).map((snap) => (
                  <button
                    key={snap.id}
                    type="button"
                    data-testid={`sheet-snap-${snap.id}`}
                    onClick={() => setMobileSheetSnap(snap.id)}
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                      mobileSheetSnap === snap.id
                        ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                        : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/10'
                    }`}
                  >
                    {snap.label}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileSheetOpen(false);
                    setMobileStudioTab('canvas');
                  }}
                  className="px-1.5 py-0.5 rounded-md bg-white/10 hover:bg-white/15 text-[10px] font-bold text-white flex items-center gap-0.5 cursor-pointer ml-0.5"
                  aria-label="Close inspector bottom sheet"
                >
                  <ChevronDown className="w-3 h-3" />
                  <span>Done</span>
                </button>
              </div>
            </div>
          </div>

          {/* Clean 3-Tab Inspector Bar (Desktop lg:+) */}
          <div
            data-testid="guided-wizard-bar"
            aria-label="Studio Inspector Tabs"
            className="hidden lg:flex items-center justify-between gap-2 px-3.5 py-2 border-b border-white/[0.08] bg-black/25 shrink-0"
          >
            <div className="flex items-center gap-1 shrink-0" role="tablist">
              {activePostFormat === 'reel' ? (
                <>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!isExpanded && inspectorTab === 'copy'}
                    data-testid="tab-content"
                    onClick={() => {
                      setIsExpanded(false);
                      setInspectorTab('copy');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      !isExpanded && inspectorTab === 'copy'
                        ? 'bg-white/12 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <Film
                      className="w-3.5 h-3.5"
                      style={!isExpanded && inspectorTab === 'copy' ? { color: theme.accent } : undefined}
                    />
                    <span>Motion</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={!isExpanded && (inspectorTab === 'review' || inspectorTab === 'caption')}
                    data-testid="tab-review"
                    onClick={() => {
                      setIsExpanded(false);
                      setInspectorTab('review');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      hasContentQualityBlocker
                        ? 'bg-rose-500/20 text-rose-200 border border-rose-500/45'
                        : !isExpanded && (inspectorTab === 'review' || inspectorTab === 'caption')
                        ? 'bg-white/12 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${hasContentQualityBlocker ? 'text-rose-400' : ''}`}
                      style={
                        !hasContentQualityBlocker && !isExpanded && (inspectorTab === 'review' || inspectorTab === 'caption')
                          ? { color: theme.accent }
                          : undefined
                      }
                    />
                    <span>Publish</span>
                    {blockersCount > 0 ? (
                      <span
                        className={`text-[11px] font-mono tabular-nums ${
                          hasContentQualityBlocker ? 'text-rose-200 font-bold' : 'text-amber-300'
                        }`}
                      >
                        · {blockersCount}
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-emerald-400">· Ready</span>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!isExpanded && inspectorTab === 'copy'}
                    data-testid="tab-content"
                    onClick={() => {
                      setIsExpanded(false);
                      setInspectorTab('copy');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      !isExpanded && inspectorTab === 'copy'
                        ? 'bg-white/12 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <Type
                      className="w-3.5 h-3.5"
                      style={!isExpanded && inspectorTab === 'copy' ? { color: theme.accent } : undefined}
                    />
                    <span>Content</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={!isExpanded && (inspectorTab === 'visual' || inspectorTab === 'position')}
                    data-testid="tab-design"
                    onClick={() => {
                      setIsExpanded(false);
                      setInspectorTab('visual');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      !isExpanded && (inspectorTab === 'visual' || inspectorTab === 'position')
                        ? 'bg-white/12 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <Layers
                      className="w-3.5 h-3.5"
                      style={
                        !isExpanded && (inspectorTab === 'visual' || inspectorTab === 'position')
                          ? { color: theme.accent }
                          : undefined
                      }
                    />
                    <span>Visual</span>
                    {activeOverridesCount > 0 && (
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: theme.accent }}
                        title={`${activeOverridesCount} position/scale adjustments active`}
                      />
                    )}
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={!isExpanded && (inspectorTab === 'review' || inspectorTab === 'caption')}
                    data-testid="tab-review"
                    onClick={() => {
                      setIsExpanded(false);
                      setInspectorTab('review');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      hasContentQualityBlocker
                        ? 'bg-rose-500/20 text-rose-200 border border-rose-500/45'
                        : !isExpanded && (inspectorTab === 'review' || inspectorTab === 'caption')
                        ? 'bg-white/12 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${hasContentQualityBlocker ? 'text-rose-400' : ''}`}
                      style={
                        !hasContentQualityBlocker && !isExpanded && (inspectorTab === 'review' || inspectorTab === 'caption')
                          ? { color: theme.accent }
                          : undefined
                      }
                    />
                    <span>Publish</span>
                    {blockersCount > 0 ? (
                      <span
                        className={`text-[11px] font-mono tabular-nums ${
                          hasContentQualityBlocker ? 'text-rose-200 font-bold' : 'text-amber-300'
                        }`}
                      >
                        · {blockersCount}
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-emerald-400">· Ready</span>
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Quiet Contextual Right Utilities (No duplicate Undo/Redo) */}
            <div className="flex items-center gap-1.5 shrink-0">
              {activePostFormat !== 'reel' && carousel.slides.length > 1 && (
                <button
                  type="button"
                  data-testid="inspector-sync-all-ar-btn"
                  disabled={isSyncingAllArabic}
                  onClick={() => void handleSyncAllSlidesArabic()}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-45 border border-white/[0.08] text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  title="Translate all slides from English to natural Arabic with AI"
                >
                  {isSyncingAllArabic ? (
                    <Loader2 className="w-3 h-3 animate-spin" style={{ color: theme.accent }} />
                  ) : (
                    <Languages className="w-3 h-3" style={{ color: theme.accent }} />
                  )}
                  <span>{isSyncingAllArabic ? 'Syncing…' : 'Sync All AR'}</span>
                </button>
              )}

              {activePostFormat !== 'reel' && selectedElementId && (
                <button
                  type="button"
                  onClick={() => {
                    setInspectorTab('visual');
                    setIsPositionSectionOpen(true);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-medium text-cyan-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                  title="Open Position & Scale controls for selected canvas element"
                >
                  <Sliders className="w-3 h-3" />
                  <span>Adjust {selectedElementId}</span>
                </button>
              )}

              <button
                type="button"
                data-testid="desktop-compare-before-btn"
                onPointerDown={() => setIsComparingBefore(true)}
                onPointerUp={() => setIsComparingBefore(false)}
                onPointerLeave={() => setIsComparingBefore(false)}
                onPointerCancel={() => setIsComparingBefore(false)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer select-none ${
                  isComparingBefore
                    ? 'bg-amber-500/20 text-amber-200'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                }`}
                title="Press and hold to compare with original before edits"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Compare</span>
              </button>
            </div>
          </div>

          {/* Scrollable Tab Viewport */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* TAB 1: CONTENT (Bilingual Headlines, Body, Hook Variants & Auto-Fit / Motion Reel) */}
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
                onOpenPolishDrawer={onOpenPreviewDrawer ? () => onOpenPreviewDrawer('polish') : undefined}
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

            {/* TAB 2 & 3: VISUAL & POSITION (Active Visual Card, Gallery, Essentials, Position & Scale) */}
            {activePostFormat !== 'reel' && (inspectorTab === 'visual' || inspectorTab === 'position') && (
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
                  void handleAnalyzePhotoCaption(dataUrl, file.type || 'image/jpeg', file.name, mode);
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

            {/* TAB 4: PUBLISH (Review Checklist & Social Caption) */}
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
                      if (lastIdx >= 0 && (newSlides[lastIdx].type === 'cta' || newSlides.length === 1)) {
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
          setMobileStudioTab("editor");
        }}
        onCloseSheet={() => {
          setIsMobileSheetOpen(false);
          setMobileStudioTab("canvas");
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
