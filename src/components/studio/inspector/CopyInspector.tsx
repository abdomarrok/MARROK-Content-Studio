import React from 'react';
import {
  CarouselData,
  CarouselFieldUpdater,
  CoverStyle,
  HookVariant,
  PostFormat,
  SlideData,
  SlideFieldUpdater,
  SlideType,
  ThemePalette,
  GraphicalElementId,
  MotionReelData,
  MotionTemplateId,
} from '../../../types.ts';
import { InlineSlideEditor } from '../InlineSlideEditor.tsx';
import { MotionReelInspector } from '../motion/MotionReelInspector.tsx';

export interface PhotoCopySuggestion {
  enTitle: string;
  arTitle: string;
  enBody?: string;
  arBody?: string;
}

export interface CopyInspectorProps {
  activePostFormat: PostFormat;
  currentSlide: SlideData;
  currentSlideIndex: number;
  totalSlides: number;
  carousel: CarouselData;
  theme: ThemePalette;
  visibleHookVariants?: HookVariant[];
  selectedElementId?: GraphicalElementId | null;
  isSingleSlide?: boolean;
  isMemeFormat?: boolean;
  isGeneratingFromVideo?: boolean;
  isAnalyzingPhoto?: boolean;
  isSyncingArabic?: boolean;
  photoCopySuggestion?: PhotoCopySuggestion | null;

  // Reel-specific configuration
  activeReelConfig?: MotionReelData;
  selectedMotionSceneId?: string | null;

  // Slide content & archetype update callbacks
  onUpdateField: SlideFieldUpdater;
  onSetSlideType?: (targetType: SlideType) => void;
  onSmartMatchVisuals?: () => void;
  onDiversifyDeckVisuals?: () => void;
  onSelectElement?: (id: GraphicalElementId | null) => void;
  onApplyHookVariant?: (variant: HookVariant) => void;
  onAutoFitSlide?: () => void;
  onOpenPolishDrawer?: () => void;
  onGenerateFromVideo?: () => void;
  onUpdateCarouselField?: CarouselFieldUpdater;
  onUploadMemeOrPhotoFile?: (file: File) => void;
  onUploadSlideGraphicFile?: (file: File) => void;
  onAnalyzePhotoCaption?: () => void;
  onApplyPhotoCopySuggestion?: () => void;
  onDismissPhotoCopySuggestion?: () => void;
  onApplyCoverStyle?: (style: CoverStyle) => void;
  onOpenVisualTab?: () => void;
  onSyncArabic?: () => void;

  // Motion Reel callbacks
  onSelectMotionScene?: (sceneId: string | null) => void;
  onChangeReelConfig?: (updated: MotionReelData) => void;
  onSyncReelFromCarousel?: (templateId?: MotionTemplateId, langMode?: 'en' | 'ar' | 'bilingual') => void;
  activeVideoSlide?: SlideData | null;
  isExportingVideo?: boolean;
  videoExportProgress?: number;
  onUploadVideoFile?: (file: File) => void;
  onAnalyzeUploadedVideo?: () => void;
  onSwitchToVideoCardReel?: () => void;
  onExportVideoCardMp4?: () => void;
  onOpenInFilmStudio?: (projectId: string) => void;
  onShowToast: (msg: string) => void;
}

export const CopyInspector: React.FC<CopyInspectorProps> = ({
  activePostFormat,
  currentSlide,
  currentSlideIndex,
  totalSlides,
  carousel,
  theme,
  visibleHookVariants = [],
  selectedElementId = null,
  isSingleSlide = false,
  isMemeFormat = false,
  isGeneratingFromVideo = false,
  isAnalyzingPhoto = false,
  isSyncingArabic = false,
  photoCopySuggestion = null,
  activeReelConfig,
  selectedMotionSceneId = null,
  onUpdateField,
  onSetSlideType,
  onSmartMatchVisuals,
  onDiversifyDeckVisuals,
  onSelectElement,
  onApplyHookVariant,
  onAutoFitSlide,
  onOpenPolishDrawer,
  onGenerateFromVideo,
  onUpdateCarouselField,
  onUploadMemeOrPhotoFile,
  onUploadSlideGraphicFile,
  onAnalyzePhotoCaption,
  onApplyPhotoCopySuggestion,
  onDismissPhotoCopySuggestion,
  onApplyCoverStyle,
  onOpenVisualTab,
  onSyncArabic,
  onSelectMotionScene,
  onChangeReelConfig,
  onSyncReelFromCarousel,
  activeVideoSlide = null,
  isExportingVideo = false,
  videoExportProgress = 0,
  onUploadVideoFile,
  onAnalyzeUploadedVideo,
  onSwitchToVideoCardReel,
  onExportVideoCardMp4,
  onOpenInFilmStudio,
  onShowToast,
}) => {
  if (activePostFormat === 'reel' && activeReelConfig && onSelectMotionScene && onChangeReelConfig && onSyncReelFromCarousel) {
    return (
      <MotionReelInspector
        reelConfig={activeReelConfig}
        theme={theme}
        selectedSceneId={selectedMotionSceneId}
        onSelectScene={onSelectMotionScene}
        onChangeReelConfig={onChangeReelConfig}
        onSyncFromCarousel={onSyncReelFromCarousel}
        activeVideoSlide={activeVideoSlide}
        isGeneratingFromVideo={isGeneratingFromVideo}
        isExportingVideo={isExportingVideo}
        videoExportProgress={videoExportProgress}
        onUploadVideoFile={onUploadVideoFile}
        onAnalyzeUploadedVideo={onAnalyzeUploadedVideo}
        onSwitchToVideoCardReel={onSwitchToVideoCardReel}
        onExportVideoCardMp4={onExportVideoCardMp4}
        onOpenInFilmStudio={onOpenInFilmStudio}
        onShowToast={onShowToast}
      />
    );
  }

  return (
    <InlineSlideEditor
      currentSlide={currentSlide}
      currentSlideIndex={currentSlideIndex}
      theme={theme}
      isAdvancedCustomizerOpen={false}
      onToggleAdvancedCustomizer={onOpenVisualTab || (() => {})}
      onUpdateField={onUpdateField}
      onSetSlideType={onSetSlideType}
      onSmartMatchVisuals={onSmartMatchVisuals}
      onDiversifyDeckVisuals={onDiversifyDeckVisuals}
      selectedElementId={selectedElementId}
      onSelectElement={onSelectElement}
      hookVariants={visibleHookVariants}
      onApplyHookVariant={onApplyHookVariant}
      onAutoFitSlide={onAutoFitSlide}
      onOpenPolishDrawer={onOpenPolishDrawer}
      isSingleSlide={isSingleSlide}
      isMemeFormat={isMemeFormat}
      onGenerateFromVideo={onGenerateFromVideo}
      isGeneratingFromVideo={isGeneratingFromVideo}
      carouselCategory={carousel.category}
      carouselCaption={carousel.caption}
      onUpdateCarouselField={onUpdateCarouselField}
      onUploadMemeOrPhotoFile={onUploadMemeOrPhotoFile}
      onUploadSlideGraphicFile={onUploadSlideGraphicFile}
      onAnalyzePhotoCaption={onAnalyzePhotoCaption}
      isAnalyzingPhoto={isAnalyzingPhoto}
      photoCopySuggestion={photoCopySuggestion}
      onApplyPhotoCopySuggestion={onApplyPhotoCopySuggestion}
      onDismissPhotoCopySuggestion={onDismissPhotoCopySuggestion}
      totalSlides={totalSlides}
      onApplyCoverStyle={onApplyCoverStyle}
      onOpenVisualTab={onOpenVisualTab}
      onSyncArabic={onSyncArabic}
      isSyncingArabic={isSyncingArabic}
    />
  );
};
