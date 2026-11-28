import React from 'react';
import { AlertTriangle, Languages, Loader2, RefreshCw } from 'lucide-react';
import {
  CanvasDimensionPreset,
  CarouselData,
  DiagramVariant,
  ElementLayoutOverride,
  GraphicalElementId,
  MotionReelData,
  PostFormat,
  SlideData,
  SlideFieldUpdater,
  SlideType,
  ThemePalette,
} from '../../../types.ts';
import type { ExportBundleMode } from '../../../lib/canvasExporter.ts';
import {
  ViewportCanvas,
  SlideNavigator,
  StageOverlayMode,
  MotionReelViewport,
} from '../index.ts';
import { UnderCanvasDeliveryDock } from './UnderCanvasDeliveryDock.tsx';

export interface OfflineFallbackBannerProps {
  carousel: CarouselData;
  theme: ThemePalette;
  promptInput: string;
  isGenerating: boolean;
  isSyncingAllArabic: boolean;
  onSetPromptInput: React.Dispatch<React.SetStateAction<string>>;
  onSyncAllSlidesArabic: () => void;
  onRetryWithAi: (overridePrompt?: string) => void;
}

export const OfflineFallbackBanner: React.FC<OfflineFallbackBannerProps> = ({
  carousel,
  theme,
  promptInput,
  isGenerating,
  isSyncingAllArabic,
  onSetPromptInput,
  onSyncAllSlidesArabic,
  onRetryWithAi,
}) => (
  <div
    role="status"
    data-testid="offline-fallback-banner"
    className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2 rounded-xl bg-amber-500/[0.06] border border-amber-500/30 text-xs text-amber-100"
  >
    <div className="flex items-center gap-2 min-w-0">
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
      <div className="min-w-0">
        <span className="font-semibold text-amber-200">Offline Draft Fallback</span>
        <span aria-hidden="true" className="text-amber-500/60 mx-1.5">
          ·
        </span>
        <span className="text-amber-100/85">
          Live AI &amp; backup models were unavailable (
          {carousel.sourceMeta?.fallbackReason || 'local synthesizer used'}).
        </span>
      </div>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        data-testid="fallback-sync-all-ar-btn"
        disabled={isSyncingAllArabic || isGenerating}
        onClick={onSyncAllSlidesArabic}
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
            onSetPromptInput(retryPrompt);
          }
          onRetryWithAi(retryPrompt || undefined);
        }}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-45 border border-amber-400/40 text-[11px] font-semibold text-amber-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
      >
        <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
        <span>Retry with AI</span>
      </button>
    </div>
  </div>
);

export interface StudioStageConsoleProps {
  carousel: CarouselData;
  displayedCarousel: CarouselData;
  currentSlide: SlideData;
  currentSlideIndex: number;
  activePostFormat: PostFormat;
  activeReelConfig: MotionReelData;
  activeVideoSlide: SlideData | null;
  theme: ThemePalette;
  isSheetOpen: boolean;
  mobileSheetSnap: 'peek' | 'half' | 'full';
  isComparingBefore: boolean;
  showSafeZones: boolean;
  stageOverlayMode: StageOverlayMode;
  selectedElementId: GraphicalElementId | null;
  selectedMotionSceneId: string | null;
  isMotionExportOpen: boolean;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  isBlocked: boolean;
  hasContentQualityBlocker: boolean;
  blockersCount: number;
  copiedType: 'slide' | 'caption' | null;
  isExportingVideo: boolean;
  videoExportProgress: number;
  isExportingZip: boolean;
  exportProgress: { current: number; total: number } | null;
  isMoreMenuOpen: boolean;
  onSetIsMoreMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSelectMotionScene: (sceneId: string | null) => void;
  onToggleReelSfx: () => void;
  onSyncReelFromCarousel: () => void;
  onRestoreCarousel: () => void;
  onOpenMotionExport: () => void;
  onUploadVideoFile: (file: File) => void;
  onSwitchToVideoCardReel: () => void;
  onPreviousSlide: () => void;
  onNextSlide: () => void;
  onSelectSlide: (idx: number) => void;
  onSelectElement: (id: GraphicalElementId | null) => void;
  onUpdateLayoutOverride: (id: GraphicalElementId, override: ElementLayoutOverride | null) => void;
  onDoubleClickElement: (id: GraphicalElementId) => void;
  onUpdateSlideField: SlideFieldUpdater;
  onDeleteElement: (id: GraphicalElementId) => void;
  onSetStageOverlayMode: (mode: StageOverlayMode) => void;
  onToggleSafeZones: () => void;
  onSelectDimensionPreset: (preset: CanvasDimensionPreset) => void;
  onAddSlide: () => void;
  onDuplicateSlide: () => void;
  onDeleteSlide: () => void;
  onMoveSlide: (direction: 'left' | 'right') => void;
  onOpenContactSheet?: () => void;
  onSetSlideType: (type: SlideType) => void;
  onSelectDiagramVariant: (variant: DiagramVariant) => void;
  onDiversifyDeckVisuals: () => void;
  onCopySlide: () => void;
  onCopyCaption: () => void;
  onExportSingleSlideVideoMp4: (fps?: 30 | 60) => void;
  onExportZip: (mode: ExportBundleMode) => void;
  onOpenPublishScheduleModal?: (tab?: 'single' | 'bulk' | 'storage') => void;
  onInspectBlockers: () => void;
  onShowToast: (msg: string) => void;
}

export const StudioStageConsole: React.FC<StudioStageConsoleProps> = ({
  carousel,
  displayedCarousel,
  currentSlide,
  currentSlideIndex,
  activePostFormat,
  activeReelConfig,
  activeVideoSlide,
  theme,
  isSheetOpen,
  mobileSheetSnap,
  isComparingBefore,
  showSafeZones,
  stageOverlayMode,
  selectedElementId,
  selectedMotionSceneId,
  isMotionExportOpen,
  canvasRef,
  isBlocked,
  hasContentQualityBlocker,
  blockersCount,
  copiedType,
  isExportingVideo,
  videoExportProgress,
  isExportingZip,
  exportProgress,
  isMoreMenuOpen,
  onSetIsMoreMenuOpen,
  onSelectMotionScene,
  onToggleReelSfx,
  onSyncReelFromCarousel,
  onRestoreCarousel,
  onOpenMotionExport,
  onUploadVideoFile,
  onSwitchToVideoCardReel,
  onPreviousSlide,
  onNextSlide,
  onSelectSlide,
  onSelectElement,
  onUpdateLayoutOverride,
  onDoubleClickElement,
  onUpdateSlideField,
  onDeleteElement,
  onSetStageOverlayMode,
  onToggleSafeZones,
  onSelectDimensionPreset,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onMoveSlide,
  onOpenContactSheet,
  onSetSlideType,
  onSelectDiagramVariant,
  onDiversifyDeckVisuals,
  onCopySlide,
  onCopyCaption,
  onExportSingleSlideVideoMp4,
  onExportZip,
  onOpenPublishScheduleModal,
  onInspectBlockers,
  onShowToast,
}) => (
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
        onSelectScene={onSelectMotionScene}
        onToggleSfx={onToggleReelSfx}
        onSyncFromCarousel={onSyncReelFromCarousel}
        onRestoreCarousel={onRestoreCarousel}
        onOpenExportModal={onOpenMotionExport}
        onUploadVideoFile={onUploadVideoFile}
        onSwitchToVideoCardReel={onSwitchToVideoCardReel}
      />
    ) : (
      <div className="flex-1 min-h-0 flex items-center justify-center w-full pt-0.5 sm:pt-0">
        <ViewportCanvas
          carousel={displayedCarousel}
          currentSlideIndex={currentSlideIndex}
          theme={theme}
          showSafeZones={showSafeZones}
          stageOverlayMode={stageOverlayMode}
          onPreviousSlide={onPreviousSlide}
          onNextSlide={onNextSlide}
          canvasRef={canvasRef}
          selectedElementId={selectedElementId}
          onSelectElement={onSelectElement}
          onUpdateLayoutOverride={onUpdateLayoutOverride}
          onDoubleClickElement={onDoubleClickElement}
          onUpdateSlideField={onUpdateSlideField}
          onDeleteElement={onDeleteElement}
          compactMobileStage={isSheetOpen && mobileSheetSnap === 'full'}
          isComparingBefore={isComparingBefore}
        />
      </div>
    )}

    {/* UNIFIED STAGE CONSOLE: Slide Strip + Single Persistent Delivery Bar */}
    <div className="w-full px-3 py-2.5 bg-[#0b1118] border border-white/10 rounded-2xl space-y-2 shadow-xl shrink-0">
      {activePostFormat !== 'reel' && (
        <SlideNavigator
          carousel={carousel}
          currentSlideIndex={currentSlideIndex}
          showSafeZones={showSafeZones}
          stageOverlayMode={stageOverlayMode}
          onSetStageOverlayMode={onSetStageOverlayMode}
          onToggleSafeZones={onToggleSafeZones}
          onSelectDimensionPreset={onSelectDimensionPreset}
          onSelectSlide={onSelectSlide}
          onAddSlide={onAddSlide}
          onDuplicateSlide={onDuplicateSlide}
          onDeleteSlide={onDeleteSlide}
          onMoveSlide={onMoveSlide}
          onOpenContactSheet={onOpenContactSheet}
          onSetSlideType={onSetSlideType}
          onSelectDiagramVariant={onSelectDiagramVariant}
          onDiversifyDeckVisuals={onDiversifyDeckVisuals}
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
        onSetIsMoreMenuOpen={onSetIsMoreMenuOpen}
        onSelectDimensionPreset={onSelectDimensionPreset}
        onCopySlide={onCopySlide}
        onCopyCaption={onCopyCaption}
        onExportSingleSlideVideoMp4={onExportSingleSlideVideoMp4}
        onExportZip={onExportZip}
        onOpenMotionExport={onOpenMotionExport}
        onOpenContactSheet={onOpenContactSheet}
        onOpenPublishScheduleModal={onOpenPublishScheduleModal}
        onInspectBlockers={onInspectBlockers}
        onShowToast={onShowToast}
      />
    </div>
  </div>
);
