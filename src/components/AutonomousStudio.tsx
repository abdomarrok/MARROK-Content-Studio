import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import {
  Sparkles,
  MoreHorizontal,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  X,
  Check,
  Copy,
  FileText,
  Youtube,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Trash2,
  SlidersHorizontal,
  Zap,
  ChevronLeft,
  ChevronRight,
  Download,
  Sliders,
  Type,
  Layers,
  LayoutGrid,
  Smartphone,
  BookmarkCheck,
  Film,
  Volume2,
  Code,
  Radar,
  Globe,
} from 'lucide-react';
import {
  extractArticleFromUrl,
  fetchTopicRadar,
  type GatheredTopicItem,
} from '../lib/gather/gatherClient.ts';
import {
  CarouselData,
  PostFormat,
  SlideData,
  SlideType,
  ThemePalette,
  HookVariant,
  DiagramNode,
  DiagramVariant,
  DEFAULT_PALETTES,
  GraphicalElementId,
  ElementLayoutOverride,
  SavedPostStatus,
  MotionReelData,
  MotionTemplateId,
  CanvasDimensionPreset,
  SavedPostRecord,
} from '../types.ts';
import { analyzePostHistoryCadence, normalizeThemeId } from '../lib/theme/cadenceEngine.ts';
import {
  downloadSingleSlidePng,
  copySlideToClipboard,
  downloadAllSlidesZip,
  getCanvasDimensionSpec,
  CANVAS_DIMENSION_PRESET_LIST,
  resolveExportTargetPresets,
  exportSingleSlideVideoMp4,
  isVideoSlide,
  isVideoFile,
  ACCEPTED_SINGLE_SLIDE_MEDIA_ACCEPT,
  extractVideoStoryboardDataUrl,
  analyzeVideoForSlideAndCaption,
  type ExportBundleMode,
} from '../lib/canvasExporter.ts';
import { runAutonomousPipeline, enrichAndPaceCarousel } from '../lib/autonomousPipeline.ts';
import { sanitizeSlide } from '../lib/textSanitizer.ts';
import {
  seedSlideArchetypeData,
  synthesizeCarousel,
  condenseCarouselToSingleSlide,
  resolveSmartSlideVisuals,
  analyzeSlideTextForArchetype,
  diversifyDeckArchetypesAndVisuals,
} from '../lib/synthesizer.ts';
import { runQAChecks, CHAR_LIMITS } from '../lib/qaChecks.ts';
import { runPlatformRiskChecks } from '../lib/riskChecks.ts';
import { autoPolishHeadline, autoFitTextToLimits } from '../lib/text/headlines.ts';
import { fixArabicPunctuation } from '../lib/text/arabicBiDi.ts';
import {
  convertCarouselToMotionReel,
  getMotionTemplate,
  generateCues,
  synthesizeSfxFloat32Buffer,
  encodeWavBlob,
  triggerBlobDownload,
} from '../lib/motion/index.ts';
import {
  ViewportCanvas,
  SlideNavigator,
  InlineSlideEditor,
  ArchetypeControls,
  ExportBar,
  PublishChecklist,
  getPublishBlockers,
  StageOverlayMode,
  ElementInspector,
  MotionReelViewport,
  MotionReelInspector,
  compressImageClientSide,
  useStudioShortcutsAndClipboard,
} from './studio/index.ts';

const SlideImageStudio = lazy(() =>
  import('./SlideImageStudio.tsx').then((m) => ({ default: m.SlideImageStudio }))
);
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
  onSelectTheme: (palette: ThemePalette) => void;
  onOpenThemeCustomizer: () => void;
  onOpenContactSheet?: () => void;
  onOpenPlanInspector?: () => void;
  onOpenPreviewDrawer?: (tab?: 'simulator' | 'polish') => void;
  onOpenSavedPostsDrawer?: () => void;
  onSaveValidPost?: (status: SavedPostStatus, allowOverride?: boolean) => Promise<void>;
  isSavingPost?: boolean;
  onShowToast: (msg: string) => void;
  savedPosts?: SavedPostRecord[];
  onOpenPublishScheduleModal?: (tab?: 'single' | 'bulk' | 'storage') => void;
}

import {
  StudioCommandBar,
  STARTER_TOPICS,
} from './studio/panels/StudioCommandBar.tsx';
import { UnderCanvasDeliveryDock } from './studio/panels/UnderCanvasDeliveryDock.tsx';
import { MobileStudioBottomBar } from './studio/panels/MobileStudioBottomBar.tsx';
import { useSlideNavigation } from '../hooks/useSlideNavigation.ts';
import { useThemeCadence } from '../hooks/useThemeCadence.ts';
import { StudioProvider } from '../context/StudioContext.tsx';

export const AutonomousStudio: React.FC<AutonomousStudioProps> = ({
  carousel,
  theme,
  activeSlideIndex,
  onSlideChange,
  onUpdateCarousel,
  onSelectTheme,
  onOpenThemeCustomizer,
  onOpenContactSheet,
  onOpenPreviewDrawer,
  onOpenSavedPostsDrawer,
  onSaveValidPost,
  isSavingPost = false,
  onShowToast,
  savedPosts = [],
  onOpenPublishScheduleModal,
}) => {
  const [promptInput, setPromptInput] = useState('');
  const [categoryHint, setCategoryHint] = useState<string>('auto');

  // Intelligent Feed Cadence Analysis for Live Context via custom hook
  const { cadence: dockCadence } = useThemeCadence({
    savedPosts,
    activeThemeId: theme.id,
    prompt: promptInput,
    category: categoryHint,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);
  const {
    currentSlideIndex,
    currentSlideIndexRef,
    changeSlide,
  } = useSlideNavigation({
    slidesCount: carousel.slides.length,
    externalSlideIndex: activeSlideIndex,
    onSlideChange,
  });
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [stageOverlayMode, setStageOverlayMode] = useState<StageOverlayMode>('clean');
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [copiedType, setCopiedType] = useState<'caption' | 'slide' | null>(null);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);

  // Right-Hand Tabbed Inspector ('copy' | 'visual' | 'position' | 'caption')
  const [inspectorTab, setInspectorTab] = useState<'copy' | 'visual' | 'position' | 'caption' | 'review'>('copy');

  // Direct Graphical Control & Hit-Testing States
  const [selectedElementId, setSelectedElementId] = useState<GraphicalElementId | null>(null);

  // Unified Smart Dock States
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'text' | 'radar' | 'youtube' | 'upload'>('text');
  const [studioRadarTopics, setStudioRadarTopics] = useState<GatheredTopicItem[]>([]);
  const [isStudioRadarLoading, setIsStudioRadarLoading] = useState(false);
  const [studioCustomUrl, setStudioCustomUrl] = useState('');
  const [isExtractingStudioUrl, setIsExtractingStudioUrl] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<{
    base64: string;
    mimeType: string;
    name: string;
    sizeKb: number;
  } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Deep Customization States
  const [imageStudioTargetIndex, setImageStudioTargetIndex] = useState<number | null>(null);
  const [mediaModalTarget, setMediaModalTarget] = useState<{
    field: 'imageUrl';
    title?: string;
    initialQuery?: string;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Mobile Studio Segmented Mode Switcher ('canvas' | 'editor')
  const [mobileStudioTab, setMobileStudioTab] = useState<'canvas' | 'editor'>('canvas');
  const [isMobileEditorExpanded, setIsMobileEditorExpanded] = useState(false);
  const isSheetOpen = isMobileSheetOpen || mobileStudioTab === 'editor';

  // Motion Reel Studio States
  const [selectedMotionSceneId, setSelectedMotionSceneId] = useState<string | null>(null);
  const [isMotionExportOpen, setIsMotionExportOpen] = useState(false);

  // Async lifecycle guards: only the latest generation/image request may commit.
  const generationAbortRef = useRef<AbortController | null>(null);
  const generationRunIdRef = useRef(0);
  const deckRevisionRef = useRef(0);
  const isMountedRef = useRef(true);
  const stashedCarouselSlidesRef = useRef<SlideData[] | null>(null);

  const activePostFormat: PostFormat =
    carousel.postFormat === 'reel'
      ? 'reel'
      : carousel.postFormat === 'single' || carousel.slides.length === 1
      ? 'single'
      : 'carousel';

  const activeDimensionSpec = getCanvasDimensionSpec(carousel.dimensionPreset);

  const handleSelectDimensionPreset = (preset: CanvasDimensionPreset) => {
    const nextSpec = getCanvasDimensionSpec(preset);
    applyDeckUpdate((prev) => ({
      ...prev,
      dimensionPreset: preset,
    }));
    onShowToast(`Switched canvas to ${nextSpec.label}`);
  };

  const activeReelConfig: MotionReelData =
    carousel.reelConfig || convertCarouselToMotionReel(carousel, theme, 'marrok-slides', 'bilingual');

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

  const handleCondenseToSingleSlide = () => {
    if (carousel.slides.length > 1) {
      stashedCarouselSlidesRef.current = carousel.slides.map((s) => ({ ...s }));
    }
    const condensed = condenseCarouselToSingleSlide(carousel);
    applyDeckUpdate((prev) => ({
      ...prev,
      ...condensed,
      postFormat: 'single',
    }));
    changeSlide(0, 1);
    onShowToast('Condensed to 1-Slide Infographic Poster');
  };

  const handleSwitchPostFormat = (nextFormat: PostFormat) => {
    if (nextFormat === activePostFormat) return;

    if (nextFormat === 'reel') {
      if (carousel.slides.length > 1) {
        stashedCarouselSlidesRef.current = carousel.slides.map((s) => ({ ...s }));
      }
      const nextReel =
        carousel.reelConfig || convertCarouselToMotionReel(carousel, theme, 'marrok-slides', 'bilingual');
      applyDeckUpdate((prev) => ({
        ...prev,
        postFormat: 'reel',
        reelConfig: nextReel,
      }));
      setSelectedMotionSceneId(nextReel.scenes[0]?.id || null);
      if (inspectorTab !== 'caption' && inspectorTab !== 'review') {
        setInspectorTab('copy');
      }
      onShowToast('Switched to 9:16 Motion Reel Studio');
      return;
    }

    if (nextFormat === 'single') {
      handleCondenseToSingleSlide();
      return;
    }

    // Switching from 'single' or 'reel' -> 'carousel'
    if (carousel.slides.length >= 3) {
      applyDeckUpdate((prev) => ({
        ...prev,
        postFormat: 'carousel',
      }));
      changeSlide(0, carousel.slides.length);
      onShowToast(`Switched to ${carousel.slides.length}-slide carousel`);
      return;
    }

    const stashed = stashedCarouselSlidesRef.current;
    if (stashed && stashed.length >= 3) {
      const currentSingle = carousel.slides[0];
      const restored = stashed.map((s, idx) => (idx === 0 && currentSingle ? { ...s, ...currentSingle } : s));
      applyDeckUpdate((prev) => ({
        ...prev,
        postFormat: 'carousel',
        slides: restored,
      }));
      changeSlide(0, restored.length);
      onShowToast(`Restored ${restored.length}-slide carousel`);
      return;
    }

    // Expand a fresh single-slide post into a full 8-slide carousel
    const seedTopic = promptInput.trim() || carousel.slides[0]?.enTitle || carousel.category || 'System Architecture';
    const expanded = synthesizeCarousel({
      prompt: seedTopic,
      categoryHint,
      inputMode: activeTab,
      postFormat: 'carousel',
    });
    const currentFirst = carousel.slides[0];
    if (currentFirst && expanded.slides.length > 0) {
      expanded.slides[0] = {
        ...expanded.slides[0],
        enTitle: currentFirst.enTitle || expanded.slides[0].enTitle,
        arTitle: currentFirst.arTitle || expanded.slides[0].arTitle,
        enBody: currentFirst.enBody || expanded.slides[0].enBody,
        arBody: currentFirst.arBody || expanded.slides[0].arBody,
      };
    }
    applyDeckUpdate((prev) => ({
      ...prev,
      postFormat: 'carousel',
      slides: expanded.slides,
    }));
    changeSlide(0, expanded.slides.length);
    onShowToast(`Expanded into ${expanded.slides.length}-slide carousel`);
  };

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      generationAbortRef.current?.abort();
      generationAbortRef.current = null;
    };
  }, []);

  // Keep the image studio bound to a valid slide in range
  useEffect(() => {
    if (imageStudioTargetIndex !== null && imageStudioTargetIndex >= carousel.slides.length) {
      setImageStudioTargetIndex(null);
    }
  }, [carousel.slides.length, imageStudioTargetIndex]);

  const applyDeckUpdate = (updater: (prev: CarouselData) => CarouselData) => {
    deckRevisionRef.current += 1;
    onUpdateCarousel(updater);
  };

  // Direct Graphical Layout Override Handlers
  const isDefaultLayoutOverride = (override: ElementLayoutOverride | null | undefined): boolean =>
    !override ||
    ((override.dx === 0 || override.dx === undefined) &&
      (override.dy === 0 || override.dy === undefined) &&
      (override.scale === 1 || override.scale === undefined) &&
      (override.opacity === 1 || override.opacity === undefined) &&
      (override.align === 'center' || override.align === undefined) &&
      !override.hidden);

  const handleUpdateElementLayoutOverride = (
    elementId: GraphicalElementId,
    override: ElementLayoutOverride | null
  ) => {
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
      const current = prev.slides[targetIndex];
      const existingOverrides = { ...(current.layoutOverrides || {}) };
      if (isDefaultLayoutOverride(override)) {
        delete existingOverrides[elementId];
      } else if (override) {
        existingOverrides[elementId] = override;
      }
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = {
        ...current,
        layoutOverrides: Object.keys(existingOverrides).length > 0 ? existingOverrides : undefined,
      };
      return { ...prev, slides: newSlides };
    });
  };

  const handleUpdateSlideFields = (updates: Partial<SlideData>) => {
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = sanitizeSlide(
        {
          ...newSlides[targetIndex],
          ...updates,
        },
        targetIndex,
        prev.slides.length
      );
      return {
        ...prev,
        slides: newSlides,
        sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
      };
    });
  };

  const handleResetSlideLayoutOverrides = () => {
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = {
        ...newSlides[targetIndex],
        layoutOverrides: undefined,
        compositionPreset: 'standard',
        freeMoveLayout: false,
        imageZoom: undefined,
        imagePanX: undefined,
        imagePanY: undefined,
      };
      return { ...prev, slides: newSlides };
    });
    onShowToast('Reset all layout overrides on this slide');
  };

  const handleApplyOverrideToAllSlides = (
    elementId: GraphicalElementId,
    override: ElementLayoutOverride | null
  ) => {
    applyDeckUpdate((prev) => {
      const newSlides = prev.slides.map((s) => {
        const existingOverrides = { ...(s.layoutOverrides || {}) };
        if (isDefaultLayoutOverride(override)) {
          delete existingOverrides[elementId];
        } else if (override) {
          existingOverrides[elementId] = { ...override };
        }
        return {
          ...s,
          layoutOverrides: Object.keys(existingOverrides).length > 0 ? existingOverrides : undefined,
        };
      });
      return { ...prev, slides: newSlides };
    });
    onShowToast(`Applied ${elementId} layout to all ${carousel.slides.length} slides`);
  };

  const handleApplySlideLayoutToAllSlides = () => {
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      const sourceSlide = prev.slides[targetIndex];
      if (!sourceSlide) return prev;
      const clonedOverrides = sourceSlide.layoutOverrides
        ? JSON.parse(JSON.stringify(sourceSlide.layoutOverrides))
        : undefined;
      const newSlides = prev.slides.map((s, idx) => {
        if (idx === targetIndex) return s;
        // Preserve CTA slide layout unless source is also CTA
        if (s.type === 'cta' && sourceSlide.type !== 'cta') return s;
        return {
          ...s,
          compositionPreset: sourceSlide.compositionPreset,
          freeMoveLayout: sourceSlide.freeMoveLayout,
          layoutOverrides: clonedOverrides ? JSON.parse(JSON.stringify(clonedOverrides)) : undefined,
        };
      });
      return { ...prev, slides: newSlides };
    });
    onShowToast(`Synced slide layout & composition across deck`);
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

  // Smart Dock Text input with auto-expansion when pasting or typing long material (> 200 chars)
  const handlePromptChange = (val: string) => {
    setPromptInput(val);
    if (val.length > 200 && !isExpanded) {
      setIsExpanded(true);
    }
  };

  // Image or Video Upload with client-side downscaling / storyboard frame extraction
  const handleImageFile = useCallback(async (file: File) => {
    if (isVideoFile(file)) {
      try {
        const videoBlobUrl =
          typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
            ? URL.createObjectURL(file)
            : '';
        const storyboard = await extractVideoStoryboardDataUrl(file);
        setUploadedImage({
          base64: storyboard.dataUrl,
          mimeType: storyboard.mimeType,
          name: file.name,
          sizeKb: Math.max(1, Math.round((storyboard.dataUrl.length * 0.75) / 1024)),
        });
        if (videoBlobUrl) {
          applyDeckUpdate((prev) => {
            const targetIndex = Math.min(currentSlideIndexRef.current, prev.slides.length - 1);
            if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
            const current = prev.slides[targetIndex];
            const targetType: SlideType =
              current.type === 'poster' || prev.postFormat === 'single' || prev.slides.length === 1
                ? 'poster'
                : 'image';
            const newSlides = [...prev.slides];
            newSlides[targetIndex] = {
              ...current,
              type: targetType,
              mediaType: 'video',
              videoUrl: videoBlobUrl,
              videoMimeType: file.type || 'video/mp4',
              videoFileName: file.name,
              videoDuration: storyboard.duration || current.videoDuration,
              videoMuted: true,
              videoPlaying: true,
              videoBorderRadius: 8,
              imageFrameMode: 'hero',
              imageFit: current.imageFit || 'contain',
              imageBgStyle: current.imageBgStyle || 'white',
              brandWatermark: current.brandWatermark || 'bottom-right',
            };
            return {
              ...prev,
              dimensionPreset: prev.dimensionPreset || 'ig-3:4',
              slides: newSlides,
            };
          });
        }
        setIsExpanded(true);
        setActiveTab('upload');
        onShowToast(`Attached video "${file.name}" & extracted keyframes for AI captioning`);
      } catch (err) {
        console.warn('Video frame extraction failed:', err);
        onShowToast('Attached video file');
      }
      return;
    }

    if (!file.type.startsWith('image/')) {
      onShowToast('Please select a valid image or video file (PNG, JPG, WebP, MP4, WebM, MOV).');
      return;
    }
    try {
      const { base64, mimeType, sizeKb } = await compressImageClientSide(file);
      setUploadedImage({
        base64,
        mimeType,
        name: file.name,
        sizeKb,
      });
      setIsExpanded(true);
      setActiveTab('upload');
      onShowToast(`Attached screenshot (${sizeKb} KB)`);
    } catch (err) {
      console.warn('Image downscaling failed, using raw fallback:', err);
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedImage({
          base64: reader.result as string,
          mimeType: file.type || 'image/jpeg',
          name: file.name,
          sizeKb: Math.round(file.size / 1024),
        });
        setIsExpanded(true);
        setActiveTab('upload');
      };
      reader.readAsDataURL(file);
    }
  }, [onShowToast]);

  const handleSelectDemoImage = async (imagePath: string, title: string) => {
    try {
      const res = await fetch(imagePath);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedImage({
          base64: reader.result as string,
          mimeType: blob.type || 'image/jpeg',
          name: title,
          sizeKb: Math.round(blob.size / 1024),
        });
        setIsExpanded(true);
        setActiveTab('upload');
        onShowToast(`Attached sample slide: ${title}`);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.warn('Could not load demo image:', err);
    }
  };

  const handlePasteImageFromClipboard = useCallback(
    (file: File) => {
      handleImageFile(file);
      onShowToast('📋 Screenshot attached directly from clipboard!');
    },
    [handleImageFile, onShowToast]
  );

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

  const handleClearDock = () => {
    setPromptInput('');
    setUploadedImage(null);
    setCategoryHint('auto');
    onShowToast('Cleared input dock');
  };

  // Unified Autonomous Generation Handler
  const handleRunAutonomousPipeline = async (overridePrompt?: string) => {
    const query = (overridePrompt !== undefined ? overridePrompt : promptInput).trim();
    if (!query && !uploadedImage) {
      onShowToast('Please enter a topic, paste notes, or attach a screenshot');
      return;
    }

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
      const cadenceAnalysis = analyzePostHistoryCadence(savedPosts, theme.id, {
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

      if (generated.slides.length > 1) {
        stashedCarouselSlidesRef.current = generated.slides.map((s) => ({ ...s }));
      } else {
        stashedCarouselSlidesRef.current = null;
      }

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

      const finalGenerated: CarouselData =
        activePostFormat === 'reel'
          ? {
              ...generated,
              slides: mergedSlides,
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
    setIsExpanded(false);
    setInspectorTab('copy');
    generationRunIdRef.current += 1;
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setIsGenerating(false);
    setPipelineStatus(null);

    try {
      const targetFormat: 'carousel' | 'single' =
        activePostFormat === 'single' ? 'single' : 'carousel';
      const generated = synthesizeCarousel({
        prompt: promptInput,
        categoryHint,
        inputMode: activeTab,
        imageFileName: uploadedImage?.name,
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
      if (processed.slides.length > 1) {
        stashedCarouselSlidesRef.current = processed.slides.map((s) => ({ ...s }));
      } else {
        stashedCarouselSlidesRef.current = null;
      }
      const finalProcessed: CarouselData =
        activePostFormat === 'reel'
          ? {
              ...processed,
              postFormat: 'reel',
              reelConfig: convertCarouselToMotionReel(
                processed,
                resolvedTheme,
                activeReelConfig.templateId || 'marrok-slides',
                activeReelConfig.languageMode || 'bilingual'
              ),
            }
          : processed;
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
      onShowToast(err instanceof Error ? err.message : 'Instant synthesis failed.');
    }
  };

  const handleTriggerStarterTopic = (topic: typeof STARTER_TOPICS[number]) => {
    setPromptInput(topic.prompt);
    handleRunAutonomousPipeline(topic.prompt);
  };

  // Inline Slide Data Updater
  const handleUpdateCurrentSlide = (field: keyof SlideData, value: any) => {
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      if (targetIndex < 0) return prev;

      const newSlides = [...prev.slides];
      newSlides[targetIndex] = sanitizeSlide(
        {
          ...newSlides[targetIndex],
          [field]: value,
        },
        targetIndex,
        prev.slides.length
      );

      return {
        ...prev,
        slides: newSlides,
        sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
      };
    });
  };

  // 1-Click Auto-Fit Slide Copy to Spec §8 Limits
  const handleAutoFitCurrentSlide = () => {
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      const slide = prev.slides[targetIndex];
      if (!slide) return prev;

      const newSlides = [...prev.slides];
      newSlides[targetIndex] = sanitizeSlide(
        {
          ...slide,
          enTitle: autoFitTextToLimits(autoPolishHeadline(slide.enTitle || ''), CHAR_LIMITS.enTitle),
          arTitle: autoFitTextToLimits(fixArabicPunctuation(slide.arTitle || ''), CHAR_LIMITS.arTitle),
          enBody: autoFitTextToLimits(slide.enBody || '', CHAR_LIMITS.enBody),
          arBody: autoFitTextToLimits(fixArabicPunctuation(slide.arBody || ''), CHAR_LIMITS.arBody),
        },
        targetIndex,
        prev.slides.length
      );

      return { ...prev, slides: newSlides };
    });
    onShowToast(`Auto-fitted Slide ${currentSlideIndex + 1} copy to character limits`);
  };

  // Immediate Archetype Switcher: Auto-seeds required fields on the fly
  const handleSetSlideType = (newType: SlideType) => {
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      const current = prev.slides[targetIndex];
      if (!current) return prev;

      const seeded = seedSlideArchetypeData(current, newType, targetIndex, false);
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = sanitizeSlide(seeded, targetIndex, prev.slides.length);

      return {
        ...prev,
        slides: newSlides,
        sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
      };
    });
    onShowToast(`Switched layout to ${newType.toUpperCase()}`);
  };

  // 1-Click Smart Match Visuals to Slide Copy
  const handleSmartMatchVisuals = (useRecommendedArchetype = true) => {
    let matchedTypeLabel = '';
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      const current = prev.slides[targetIndex];
      if (!current) return prev;

      const recommendedArchetype = analyzeSlideTextForArchetype(current, targetIndex);
      const targetType: SlideType = useRecommendedArchetype
        ? recommendedArchetype
        : current.type;
      matchedTypeLabel = targetType.toUpperCase();

      const seeded = seedSlideArchetypeData(current, targetType, targetIndex, true);
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = sanitizeSlide(seeded, targetIndex, prev.slides.length);

      return {
        ...prev,
        slides: newSlides,
        sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
      };
    });
    onShowToast(
      useRecommendedArchetype
        ? `Smart Match: assigned ${matchedTypeLabel} & updated layout configuration`
        : `Smart-matched ${matchedTypeLabel} visual elements to slide copy`
    );
  };

  // 1-Click Schematic Variant Switcher from Stage Console
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
      const clone = JSON.parse(JSON.stringify(current));
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

  const handleApplyHookVariant = (variant: HookVariant) => {
    applyDeckUpdate((prev) => {
      if (!prev.slides[0]) return prev;
      const newSlides = [...prev.slides];
      newSlides[0] = {
        ...newSlides[0],
        enTitle: variant.enTitle,
        arTitle: variant.arTitle,
        enBody: variant.enBody,
        arBody: variant.arBody,
        centerIcon: variant.centerIcon || newSlides[0].centerIcon,
      };
      return { ...prev, slides: newSlides };
    });
    onShowToast(`Applied "${variant.tag}" Hook to Slide 1`);
  };

  const [overrideExportBlock, setOverrideExportBlock] = useState(false);
  const [confirmedRiskReason, setConfirmedRiskReason] = useState<string | null>(null);

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
  const qaReport = runQAChecks(carousel);
  const riskReport = runPlatformRiskChecks(carousel, promptInput);
  const dynamicHashtags = deriveTopicHashtags(carousel);
  const publishBlockers = getPublishBlockers(carousel, isOfflineDraft, isReviewed, qaReport, riskReport);
  const blockersCount = publishBlockers.blockersCount;
  const isBlocked = blockersCount > 0 && !overrideExportBlock;

  const engineBadge =
    carousel.sourceMeta?.engine === 'grounded' || carousel.sourceMeta?.status === 'verified_live'
      ? { label: 'Grounded', cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' }
      : isOfflineDraft
      ? { label: 'Offline', cls: 'bg-amber-500/15 border-amber-500/30 text-amber-300' }
      : { label: 'Ungrounded AI', cls: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300' };

  // 1-Click Export ZIP with QA & Platform Safety Gate (Defaults to 5-in-1 Ready to Share Pack)
  const handleExportZip = async (exportMode: ExportBundleMode = 'all') => {
    const ctaSlide = carousel.slides[carousel.slides.length - 1];
    const hasCreatorCredit = Boolean(
      (
        carousel.sourceMeta?.creator ||
        carousel.sourceMeta?.channel ||
        carousel.channel ||
        ctaSlide?.enCredit ||
        ''
      ).trim()
    );

    if (isBlocked) {
      setInspectorTab('review');
      setMobileStudioTab('editor');
      onShowToast(
        `⚠️ Export blocked: ${blockersCount} item${blockersCount > 1 ? 's' : ''} need attention in Review checklist.`
      );
      return;
    }

    if (isOfflineDraft && !isReviewed) {
      onShowToast('⚠️ Exporting unreviewed offline draft (Override active)...');
    } else if (!qaReport.canExport || riskReport.status === 'WARN') {
      onShowToast(`⚠️ Exporting with advisory warnings...`);
    }
    setIsExportingZip(true);
    const targetPresets = resolveExportTargetPresets(exportMode, carousel.dimensionPreset);
    const totalCount = carousel.slides.length * targetPresets.length;
    setExportProgress({ current: 0, total: totalCount });
    try {
      const audit = {
        isOverridden: overrideExportBlock,
        reviewedDraftConfirmation: isReviewed,
        confirmedRisk: overrideExportBlock ? confirmedRiskReason : null,
        overriddenAt: overrideExportBlock ? new Date().toISOString() : null,
      };
      await downloadAllSlidesZip(
        carousel,
        theme,
        (current, total) => {
          setExportProgress({ current, total });
        },
        carousel.visualOptions,
        audit,
        exportMode
      );
      if (onSaveValidPost) {
        try {
          await onSaveValidPost('posted', overrideExportBlock);
        } catch {
          // Non-fatal if background post save fails during ZIP download
        }
      }
      if (exportMode === 'all') {
        onShowToast('5-in-1 Ready to Share Pack (TikTok 9:16, IG 4:5, IG 3:4, IG 1:1, IG Reels 9:16 + Captions) exported!');
      } else if (exportMode === 'dual') {
        onShowToast('Dual Pack (TikTok 9:16 + Instagram 4:5) & Metricool bundle exported into ZIP!');
      } else {
        const spec = getCanvasDimensionSpec(targetPresets[0]);
        onShowToast(
          `All ${spec.width}×${spec.height} (${spec.shortLabel}) JPG slides & Metricool bundle exported into ZIP!`
        );
      }
    } catch (err) {
      console.error('ZIP export failed:', err);
      onShowToast('Failed to export ZIP file.');
    } finally {
      setIsExportingZip(false);
      setExportProgress(null);
    }
  };

  // Copy Single Slide
  const handleCopySlide = async () => {
    try {
      await copySlideToClipboard(carousel, currentSlideIndex, theme, carousel.visualOptions);
      setCopiedType('slide');
      onShowToast(`Copied Slide ${currentSlideIndex + 1} to clipboard!`);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      onShowToast('Failed to copy slide.');
    }
  };

  // Single-Slide Video MP4 Export State & Handler
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [videoExportProgress, setVideoExportProgress] = useState(0);
  const [videoExportStage, setVideoExportStage] = useState('');

  const handleExportSingleSlideVideoMp4 = async (fps: 30 | 60 = 30) => {
    const activeSlide = carousel.slides[currentSlideIndex] || carousel.slides[0];
    if (!activeSlide || !isVideoSlide(activeSlide) || isExportingVideo) return;
    setIsExportingVideo(true);
    setVideoExportProgress(2);
    setVideoExportStage('Initializing 1080×1440 MP4 video export...');
    try {
      const targetPreset = carousel.dimensionPreset || 'ig-3:4';
      const result = await exportSingleSlideVideoMp4(carousel, currentSlideIndex, {
        fps,
        dimensionPreset: targetPreset,
        theme,
        visualOptions: carousel.visualOptions,
        preserveAudio: !(activeSlide.videoMuted ?? false),
        onProgress: (pct, stage) => {
          setVideoExportProgress(pct);
          setVideoExportStage(stage);
        },
      });
      triggerBlobDownload(result.blob, result.filename);
      onShowToast(
        `Exported ${result.width}×${result.height} @ ${result.fps}fps .${result.extension} video!`
      );
    } catch (err) {
      console.error('Single-slide video export failed:', err);
      onShowToast(
        err instanceof Error ? err.message : 'Failed to export single-slide MP4 video.'
      );
    } finally {
      setIsExportingVideo(false);
      setVideoExportProgress(0);
      setVideoExportStage('');
    }
  };

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
        return {
          ...prev,
          category: result.category || prev.category,
          caption: result.caption || prev.caption,
          hookVariants: result.hookVariants || prev.hookVariants,
          slides: newSlides,
        };
      });

      onShowToast('✨ Generated bilingual slide text & social caption from your video!');
    } catch (err) {
      console.error('Video text & caption generation failed:', err);
      onShowToast('Generated fallback slide text & caption from video metadata.');
    } finally {
      setIsGeneratingFromVideo(false);
      setPipelineStatus(null);
    }
  };

  // Copy TikTok Caption
  const handleCopyCaption = async () => {
    const rawCaption = carousel.caption || '';
    const hashtagLine = dynamicHashtags.join(' ');
    const text = (rawCaption.includes('#') ? rawCaption : `${rawCaption}\n\n${hashtagLine}`).replace(
      /\u00A0/g,
      ' '
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType('caption');
      onShowToast('Copied TikTok caption and topic hashtags to clipboard!');
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      onShowToast('Failed to copy caption.');
    }
  };

  const currentSlide = carousel.slides[currentSlideIndex] || carousel.slides[0];
  const smartCurrentVisuals = resolveSmartSlideVisuals(currentSlide, currentSlideIndex, false);

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

  const studioContextValue = React.useMemo(
    () => ({
      carousel,
      currentSlide,
      currentSlideIndex,
      theme,
      activePostFormat,
      changeSlide,
      updateCurrentSlide: (updater: (slide: SlideData) => SlideData) => {
        applyDeckUpdate((prev) => {
          const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
          if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
          const nextSlides = [...prev.slides];
          nextSlides[targetIndex] = updater(nextSlides[targetIndex]);
          return { ...prev, slides: nextSlides };
        });
      },
      updateCarousel: onUpdateCarousel,
    }),
    [carousel, currentSlide, currentSlideIndex, theme, activePostFormat, changeSlide, onUpdateCarousel]
  );

  return (
    <StudioProvider value={studioContextValue}>
      <div className="w-full lg:flex-1 lg:min-h-0 flex flex-col gap-3 animate-fade-in">
      {/* 1. Compact Command Bar with Overlay Ingestion Drawer */}
      <StudioCommandBar
        promptInput={promptInput}
        onPromptChange={handlePromptChange}
        onSetPromptInput={setPromptInput}
        categoryHint={categoryHint}
        onSetCategoryHint={setCategoryHint}
        isGenerating={isGenerating}
        pipelineStatus={pipelineStatus}
        activePostFormat={activePostFormat}
        onSwitchPostFormat={handleSwitchPostFormat}
        engineBadge={engineBadge}
        onInspectEngine={() => setInspectorTab("review")}
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



      {/* 2. Fixed Studio Shell: Left 9:16 Stage (Always visible on mobile top half) | Right 4-Tab Categorized Inspector */}
      <div className="lg:flex-1 lg:min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-5 items-stretch">
        {/* Left Column: 9:16 Canvas + Slide Navigator + Single Persistent Under-Canvas Delivery Bar */}
        <div
          className="lg:col-span-5 flex flex-col items-center justify-between w-full lg:h-full lg:min-h-0 gap-1.5 sm:gap-2"
        >
          {activePostFormat === 'reel' ? (
            <MotionReelViewport
              reelConfig={activeReelConfig}
              theme={theme}
              selectedSceneId={selectedMotionSceneId}
              isExporting={isMotionExportOpen}
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
            />
          ) : (
            <>
              <div className="flex-1 min-h-0 flex items-center justify-center w-full pt-0.5 sm:pt-0">
                <ViewportCanvas
                  carousel={carousel}
                  currentSlideIndex={currentSlideIndex}
                  theme={theme}
                  showSafeZones={showSafeZones}
                  stageOverlayMode={stageOverlayMode}
                  onSetStageOverlayMode={setStageOverlayMode}
                  onToggleSafeZones={() => setShowSafeZones(!showSafeZones)}
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
                      setInspectorTab('position');
                    } else {
                      setInspectorTab('copy');
                    }
                  }}
                  onUpdateLayoutOverride={handleUpdateElementLayoutOverride}
                  onDoubleClickElement={handleDoubleClickCanvasElement}
                  onUpdateSlideField={handleUpdateCurrentSlide}
                  compactMobileStage={isSheetOpen}
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

        {/* Right Column (Desktop) & Docked Split-Screen Bottom Editor (Mobile): Live Slide Remains Visible Above! */}
        <div
          role="region"
          aria-label="Slide Inspector and Content Editor"
          className={`lg:col-span-7 flex flex-col bg-[#0b1118]/98 border-white/15 overflow-hidden shadow-[0_-12px_36px_rgba(0,0,0,0.75)] transition-all duration-300 ${
            isSheetOpen
              ? `fixed inset-x-0 bottom-[58px] z-40 ${
                  isMobileEditorExpanded ? 'h-[66dvh]' : 'h-[44dvh]'
                } rounded-t-2xl border-t translate-y-0 visible pointer-events-auto`
              : 'fixed inset-x-0 bottom-0 z-40 h-[44dvh] rounded-t-2xl border-t translate-y-full invisible pointer-events-none'
          } lg:visible lg:static lg:inset-auto lg:z-auto lg:h-full lg:min-h-0 lg:rounded-2xl lg:border lg:shadow-2xl lg:translate-y-0 lg:pointer-events-auto`}
        >
          {/* Mobile Split-Screen Editor Compact Header Bar */}
          <div className="lg:hidden flex items-center justify-between px-3 py-1.5 border-b border-white/10 bg-black/60 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: theme.accent }}
              />
              <span className="text-[11px] font-mono tabular-nums font-bold uppercase tracking-wider text-slate-200 truncate">
                Slide {currentSlideIndex + 1} ·{' '}
                {inspectorTab === 'copy'
                  ? 'Slide Text'
                  : inspectorTab === 'visual'
                  ? `Design (${currentSlide.type})`
                  : inspectorTab === 'position'
                  ? 'Adjust'
                  : 'Publish'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[10px] font-mono text-cyan-300 hover:text-white flex items-center gap-1 cursor-pointer"
                title="Open AI Topic & Source Ingestion"
              >
                <Sparkles className="w-3 h-3" />
                <span>Prompt</span>
              </button>

              <button
                type="button"
                onClick={() => setIsMobileEditorExpanded((prev) => !prev)}
                className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[10px] font-mono text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
                title={isMobileEditorExpanded ? 'Restore 50/50 split-screen view' : 'Expand editor height'}
              >
                <span>{isMobileEditorExpanded ? 'Split View' : 'Expand'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMobileSheetOpen(false);
                  setMobileStudioTab('canvas');
                }}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-bold text-white flex items-center gap-1 cursor-pointer"
                aria-label="Close inspector bottom sheet"
              >
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Done</span>
              </button>
            </div>
          </div>

          {/* Unified Guided Wizard & Categorized Inspector Tab Bar (Desktop lg:+) */}
          <div
            data-testid="guided-wizard-bar"
            aria-label="Guided Creation Steps"
            className="hidden lg:flex items-center justify-between gap-2 px-3 pt-2.5 pb-2 border-b border-white/10 bg-black/40 shrink-0 overflow-x-auto"
          >
            <div className="flex items-center gap-1 sm:gap-1.5">
              {/* Step 1: Ingest (Opens Source / OCR Drawer) */}
              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  isExpanded
                    ? 'bg-white/15 text-white shadow-sm border border-white/15'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <span className="text-[10px] font-mono tabular-nums text-slate-400">1.</span>
                <span>Ingest</span>
              </button>

              {activePostFormat === 'reel' ? (
                <>
                  <button
                    type="button"
                    data-testid="tab-content"
                    onClick={() => {
                      setIsExpanded(false);
                      setInspectorTab('copy');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      !isExpanded && inspectorTab === 'copy'
                        ? 'bg-white/15 text-white shadow-sm border border-white/15'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" style={!isExpanded && inspectorTab === 'copy' ? { color: theme.accent } : undefined} />
                    <span>2. Content & Motion</span>
                    <span className="text-[10px] font-mono uppercase text-slate-400">
                      · {activeReelConfig.templateId}
                    </span>
                  </button>

                  <button
                    type="button"
                    data-testid="tab-review"
                    onClick={() => {
                      setIsExpanded(false);
                      setInspectorTab('review');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      !isExpanded && (inspectorTab === 'review' || inspectorTab === 'caption')
                        ? 'bg-white/15 text-white shadow-sm border border-white/15'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <CheckCircle2
                      className="w-3.5 h-3.5"
                      style={!isExpanded && (inspectorTab === 'review' || inspectorTab === 'caption') ? { color: theme.accent } : undefined}
                    />
                    <span>3. Publish</span>
                    {blockersCount > 0 ? (
                      <span className="text-xs font-mono tabular-nums px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {blockersCount}
                      </span>
                    ) : (
                      <span className="text-xs font-mono uppercase px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        PASS
                      </span>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    data-testid="tab-content"
                    onClick={() => {
                      setIsExpanded(false);
                      setInspectorTab('copy');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      !isExpanded && inspectorTab === 'copy'
                        ? 'bg-white/15 text-white shadow-sm border border-white/15'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <Type className="w-3.5 h-3.5" style={!isExpanded && inspectorTab === 'copy' ? { color: theme.accent } : undefined} />
                    <span>2. Slide Text</span>
                  </button>

                  <button
                    type="button"
                    data-testid="tab-design"
                    onClick={() => {
                      setIsExpanded(false);
                      setInspectorTab('visual');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      !isExpanded && inspectorTab === 'visual'
                        ? 'bg-white/15 text-white shadow-sm border border-white/15'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" style={!isExpanded && inspectorTab === 'visual' ? { color: theme.accent } : undefined} />
                    <span>3. Design</span>
                    <span className="text-[10px] font-mono uppercase text-slate-400">
                      · {currentSlide.type}
                    </span>
                  </button>

                  <button
                    type="button"
                    data-testid="tab-adjust"
                    onClick={() => {
                      setIsExpanded(false);
                      setInspectorTab('position');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      !isExpanded && inspectorTab === 'position'
                        ? 'bg-white/15 text-white shadow-sm border border-white/15'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" style={!isExpanded && inspectorTab === 'position' ? { color: theme.accent } : undefined} />
                    <span>4. Adjust</span>
                    {activeOverridesCount > 0 && (
                      <span className="text-[10px] font-mono tabular-nums text-cyan-300">
                        · {activeOverridesCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    data-testid="tab-review"
                    onClick={() => {
                      setIsExpanded(false);
                      setInspectorTab('review');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      !isExpanded && (inspectorTab === 'review' || inspectorTab === 'caption')
                        ? 'bg-white/15 text-white shadow-sm border border-white/15'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <CheckCircle2
                      className="w-3.5 h-3.5"
                      style={!isExpanded && (inspectorTab === 'review' || inspectorTab === 'caption') ? { color: theme.accent } : undefined}
                    />
                    <span>5. Publish</span>
                    {blockersCount > 0 ? (
                      <span className="text-xs font-mono tabular-nums px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {blockersCount}
                      </span>
                    ) : (
                      <span className="text-xs font-mono uppercase px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        PASS
                      </span>
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Selected Layer Quick Badge */}
            {activePostFormat !== 'reel' && selectedElementId && inspectorTab !== 'position' && (
              <button
                type="button"
                onClick={() => setInspectorTab('position')}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-[11px] font-mono text-cyan-300 hover:bg-cyan-500/20 transition-colors cursor-pointer shrink-0"
                title="Adjust exact position and scale for selected element"
              >
                <span>Layer: {selectedElementId}</span>
              </button>
            )}
          </div>

          {/* Scrollable Tab Viewport */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {/* MOTION REEL INSPECTOR */}
            {activePostFormat === 'reel' && inspectorTab === 'copy' && (
              <MotionReelInspector
                reelConfig={activeReelConfig}
                theme={theme}
                selectedSceneId={selectedMotionSceneId}
                onSelectScene={setSelectedMotionSceneId}
                onChangeReelConfig={(updated) => {
                  applyDeckUpdate((prev) => ({
                    ...prev,
                    reelConfig: updated,
                  }));
                }}
                onSyncFromCarousel={(tplId, langMode) => {
                  handleSyncReelFromCarousel(tplId, langMode);
                }}
                onShowToast={onShowToast}
              />
            )}

            {/* TAB 1: CONTENT (Bilingual Headlines, Body, Hook Variants & Auto-Fit) */}
            {activePostFormat !== 'reel' && inspectorTab === 'copy' && (
              <InlineSlideEditor
                currentSlide={currentSlide}
                currentSlideIndex={currentSlideIndex}
                theme={theme}
                isAdvancedCustomizerOpen={false}
                onToggleAdvancedCustomizer={() => setInspectorTab('visual')}
                onUpdateField={handleUpdateCurrentSlide}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
                hookVariants={carousel.hookVariants}
                onApplyHookVariant={handleApplyHookVariant}
                onAutoFitSlide={handleAutoFitCurrentSlide}
                onOpenPolishDrawer={onOpenPreviewDrawer ? () => onOpenPreviewDrawer('polish') : undefined}
                isSingleSlide={activePostFormat === 'single'}
                onGenerateFromVideo={() => handleGenerateFromVideo()}
                isGeneratingFromVideo={isGeneratingFromVideo}
              />
            )}

            {/* TAB 2: DESIGN (8 Archetypes, Hub/Schematic Nodes, Code, Metrics & AI Image Studio) */}
            {activePostFormat !== 'reel' && inspectorTab === 'visual' && (
              <div className="space-y-4">
                <ArchetypeControls
                  currentSlide={currentSlide}
                  currentSlideIndex={currentSlideIndex}
                  carousel={carousel}
                  theme={theme}
                  isAdvancedCustomizerOpen={true}
                  onSetSlideType={handleSetSlideType}
                  onUpdateField={handleUpdateCurrentSlide}
                  onUpdateSlideFields={handleUpdateSlideFields}
                  onSmartMatchVisuals={handleSmartMatchVisuals}
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
                />

                {imageStudioTargetIndex !== null && carousel.slides[imageStudioTargetIndex] && (
                  <Suspense fallback={null}>
                    <SlideImageStudio
                      slideIndex={imageStudioTargetIndex}
                      slide={carousel.slides[imageStudioTargetIndex]}
                      theme={theme}
                      onApplyImage={(targetIndex, imageUrl, prompt, model) => {
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
                      onClose={() => setImageStudioTargetIndex(null)}
                      onShowToast={onShowToast}
                    />
                  </Suspense>
                )}
              </div>
            )}

            {/* TAB 3: ADJUST (Direct Graphical Layer Offsets, Scale & Anti-Collision Nudge) */}
            {activePostFormat !== 'reel' && inspectorTab === 'position' && (
              <ElementInspector
                slide={currentSlide}
                theme={theme}
                isOpen={true}
                headless={true}
                onToggleOpen={() => {}}
                selectedElementId={selectedElementId}
                onSelectElement={setSelectedElementId}
                onUpdateOverride={handleUpdateElementLayoutOverride}
                onResetOverrides={handleResetSlideLayoutOverrides}
                onApplyToAllSlides={handleApplyOverrideToAllSlides}
                onApplySlideLayoutToAllSlides={handleApplySlideLayoutToAllSlides}
                onUpdateSlideFields={handleUpdateSlideFields}
              />
            )}

            {/* TAB 4: PUBLISH (Unified Ready-to-Publish Checklist, Sources & Bilingual Social Caption) */}
            {(inspectorTab === 'review' || inspectorTab === 'caption') && (
              <div className="space-y-4 w-full">
                <PublishChecklist
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
                        brand: trimmed || prev.brand,
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
                  onExportZip={handleExportZip}
                  onDownloadSingleSlide={(preset) => {
                    const spec = getCanvasDimensionSpec(preset);
                    downloadSingleSlidePng(
                      carousel,
                      currentSlideIndex,
                      undefined,
                      theme,
                      carousel.visualOptions,
                      preset
                    );
                    onShowToast(`Downloaded Slide ${currentSlideIndex + 1} (${spec.label}) JPG`);
                  }}
                  onOpenPublishScheduleModal={onOpenPublishScheduleModal}
                  isExportingZip={isExportingZip}
                  onShowToast={onShowToast}
                />

                {/* Bilingual TikTok / Instagram Posting Copy */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="text-xs font-bold text-white uppercase tracking-wider block">
                        Bilingual TikTok / Instagram Posting Copy
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {activePostFormat === 'single'
                          ? 'Ready to paste directly into TikTok/Instagram or export in your bundle'
                          : 'Included automatically in your Metricool ZIP bundle'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {isVideoSlide(currentSlide) && (
                        <button
                          type="button"
                          data-testid="caption-generate-from-video-btn"
                          disabled={isGeneratingFromVideo}
                          onClick={() => handleGenerateFromVideo()}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-xs text-emerald-200 hover:bg-emerald-500/30 font-semibold cursor-pointer transition-colors disabled:opacity-60"
                          title="Extract keyframes from the active video and generate a bilingual social caption + slide copy"
                        >
                          {isGeneratingFromVideo ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-300" />
                              <span>Analyzing Video...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                              <span>Generate Caption & Text from Video</span>
                            </>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleCopyCaption}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-xs text-cyan-200 hover:bg-cyan-500/25 font-semibold cursor-pointer transition-colors"
                      >
                        {copiedType === 'caption' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedType === 'caption' ? 'Copied!' : 'Copy Caption Text'}</span>
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={5}
                    value={carousel.caption || ''}
                    onChange={(e) =>
                      applyDeckUpdate((prev) => ({
                        ...prev,
                        caption: e.target.value,
                      }))
                    }
                    placeholder="Enter bilingual TikTok caption..."
                    className="w-full p-3 rounded-xl bg-black/70 border border-white/10 focus:border-white/30 text-xs text-slate-200 leading-relaxed focus:outline-none resize-y font-sans"
                  />

                  <div className="text-[11px] font-mono text-slate-400">
                    {dynamicHashtags.join(' ')}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Guided Step Progression Footer inside Inspector (Desktop lg:+) */}
          <div className="hidden lg:flex px-4 py-2.5 bg-black/60 border-t border-white/10 items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <span className="font-mono tabular-nums text-white font-semibold">
                {inspectorTab === 'copy'
                  ? 'Step 2 · Content'
                  : inspectorTab === 'visual'
                  ? 'Step 3 · Design'
                  : inspectorTab === 'position'
                  ? 'Step 4 · Adjust'
                  : activePostFormat === 'reel'
                  ? 'Step 3 · Publish'
                  : 'Step 5 · Publish'}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="hidden sm:inline">
                {inspectorTab === 'copy'
                  ? 'Edit bilingual headlines, body & takeaways'
                  : inspectorTab === 'visual'
                  ? 'Choose slide archetype & diagram variant'
                  : inspectorTab === 'position'
                  ? 'Fine-tune element coordinates & scale'
                  : 'Verify checks, copy caption & export bundle'}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {inspectorTab !== 'copy' && (
                <button
                  type="button"
                  onClick={() => {
                    if (inspectorTab === 'review' || inspectorTab === 'caption') {
                      setInspectorTab(activePostFormat === 'reel' ? 'copy' : 'position');
                    } else if (inspectorTab === 'position') {
                      setInspectorTab('visual');
                    } else {
                      setInspectorTab('copy');
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  ← Previous
                </button>
              )}

              {inspectorTab !== 'review' && inspectorTab !== 'caption' ? (
                <button
                  type="button"
                  onClick={() => {
                    if (inspectorTab === 'copy') {
                      setInspectorTab(activePostFormat === 'reel' ? 'review' : 'visual');
                    } else if (inspectorTab === 'visual') {
                      setInspectorTab('position');
                    } else {
                      setInspectorTab('review');
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/15 border border-white/15 text-xs font-bold text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  {inspectorTab === 'copy'
                    ? activePostFormat === 'reel'
                      ? 'Next: Publish →'
                      : 'Next: Design →'
                    : inspectorTab === 'visual'
                    ? 'Next: Adjust →'
                    : 'Next: Publish →'}
                </button>
              ) : (
                onOpenPublishScheduleModal && (
                  <button
                    type="button"
                    onClick={() => onOpenPublishScheduleModal('single')}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold text-slate-950 transition-all cursor-pointer whitespace-nowrap shadow-sm"
                    style={{ backgroundColor: theme.accent }}
                  >
                    Send to Publish Hub →
                  </button>
                )
              )}
            </div>
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
    </StudioProvider>
  );
};
