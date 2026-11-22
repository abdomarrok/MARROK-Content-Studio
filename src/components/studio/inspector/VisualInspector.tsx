import React, { Suspense, lazy } from 'react';
import {
  CarouselData,
  CarouselFieldUpdater,
  CoverStyle,
  DiagramNode,
  ElementLayoutOverride,
  GraphicalElementId,
  SlideData,
  SlideFieldUpdater,
  SlideType,
  ThemePalette,
} from '../../../types.ts';
import { ArchetypeControls } from '../ArchetypeControls.tsx';
import { PositionInspector } from './PositionInspector.tsx';

const SlideImageStudio = lazy(() =>
  import('../../SlideImageStudio.tsx').then((m) => ({ default: m.SlideImageStudio }))
);

export interface VisualInspectorProps {
  currentSlide: SlideData;
  currentSlideIndex?: number;
  carousel?: CarouselData;
  theme: ThemePalette;
  selectedElementId: GraphicalElementId | null;
  onSelectElement: (id: GraphicalElementId | null) => void;
  onSetSlideType: (type: SlideType) => void;
  onUpdateField: SlideFieldUpdater;
  onUpdateSlideFields?: (updates: Partial<SlideData>) => void;
  onSmartMatchVisuals?: (useRecommendedArchetype?: boolean) => void;
  onToggleAutoLayout?: () => void;
  onReimagineVisual?: () => void;
  isReimaginingVisual?: boolean;
  onDiversifyDeckVisuals?: () => void;
  onUpdateCarouselField?: CarouselFieldUpdater;
  onUpdateSatLabel: (index: number, value: string) => void;
  onUpdateSatIcon?: (index: number, iconName: string) => void;
  onUpdateCenterIcon?: (iconName: string) => void;
  onUpdateCenterTag?: (tag: string) => void;
  onAddSatNode?: () => void;
  onDeleteSatNode?: (index: number) => void;
  onUpdateDiagramNode: (nodeIndex: number, field: keyof DiagramNode, value: string) => void;
  onUpdateDiagramEdge: (edgeIndex: number, value: string) => void;
  onOpenAiImageStudio: () => void;
  onOpenMediaSearch: () => void;
  onExportVideoMp4?: (fps?: 30 | 60) => void;
  isExportingVideo?: boolean;
  videoExportProgress?: number;
  videoExportStage?: string;
  onGenerateFromVideo?: (fileOrUrl?: File | string) => void;
  isGeneratingFromVideo?: boolean;
  onGenerateFromPhoto?: (file: File, dataUrl: string, mode: 'meme' | 'graphic') => void;
  isPositionSectionOpen?: boolean;
  onTogglePositionSection?: () => void;
  activeOverridesCount?: number;
  onApplyCoverStyle?: (coverStyle: CoverStyle) => void;
  onUpdateElementLayoutOverride: (id: GraphicalElementId, override: ElementLayoutOverride | null) => void;
  onResetSlideLayoutOverrides: () => void;
  onApplyOverrideToAllSlides?: (id: GraphicalElementId, override: ElementLayoutOverride | null) => void;
  onApplySlideLayoutToAllSlides?: () => void;

  // AI Image Studio modal props
  imageStudioTargetIndex?: number | null;
  onApplyStudioImage?: (targetIndex: number, imageUrl: string, prompt?: string, model?: string) => void;
  onCloseStudioImage?: () => void;
  onShowToast?: (msg: string) => void;
}

export const VisualInspector: React.FC<VisualInspectorProps> = ({
  currentSlide,
  currentSlideIndex = 0,
  carousel,
  theme,
  selectedElementId,
  onSelectElement,
  onSetSlideType,
  onUpdateField,
  onUpdateSlideFields,
  onSmartMatchVisuals,
  onToggleAutoLayout,
  onReimagineVisual,
  isReimaginingVisual,
  onDiversifyDeckVisuals,
  onUpdateCarouselField,
  onUpdateSatLabel,
  onUpdateSatIcon,
  onUpdateCenterIcon,
  onUpdateCenterTag,
  onAddSatNode,
  onDeleteSatNode,
  onUpdateDiagramNode,
  onUpdateDiagramEdge,
  onOpenAiImageStudio,
  onOpenMediaSearch,
  onExportVideoMp4,
  isExportingVideo,
  videoExportProgress,
  videoExportStage,
  onGenerateFromVideo,
  isGeneratingFromVideo,
  onGenerateFromPhoto,
  isPositionSectionOpen,
  onTogglePositionSection,
  activeOverridesCount,
  onApplyCoverStyle,
  onUpdateElementLayoutOverride,
  onResetSlideLayoutOverrides,
  onApplyOverrideToAllSlides,
  onApplySlideLayoutToAllSlides,
  imageStudioTargetIndex = null,
  onApplyStudioImage,
  onCloseStudioImage,
  onShowToast,
}) => {
  return (
    <div className="space-y-4">
      <ArchetypeControls
        currentSlide={currentSlide}
        currentSlideIndex={currentSlideIndex}
        carousel={carousel}
        theme={theme}
        isAdvancedCustomizerOpen={true}
        onSetSlideType={onSetSlideType}
        onUpdateField={onUpdateField}
        onUpdateSlideFields={onUpdateSlideFields}
        onSmartMatchVisuals={onSmartMatchVisuals}
        onToggleAutoLayout={onToggleAutoLayout}
        onReimagineVisual={onReimagineVisual}
        isReimaginingVisual={isReimaginingVisual}
        onDiversifyDeckVisuals={onDiversifyDeckVisuals}
        onUpdateCarouselField={onUpdateCarouselField}
        onUpdateSatLabel={onUpdateSatLabel}
        onUpdateSatIcon={onUpdateSatIcon}
        onUpdateCenterIcon={onUpdateCenterIcon}
        onUpdateCenterTag={onUpdateCenterTag}
        onAddSatNode={onAddSatNode}
        onDeleteSatNode={onDeleteSatNode}
        onUpdateDiagramNode={onUpdateDiagramNode}
        onUpdateDiagramEdge={onUpdateDiagramEdge}
        onOpenAiImageStudio={onOpenAiImageStudio}
        onOpenMediaSearch={onOpenMediaSearch}
        onExportVideoMp4={onExportVideoMp4}
        isExportingVideo={isExportingVideo}
        videoExportProgress={videoExportProgress}
        videoExportStage={videoExportStage}
        onGenerateFromVideo={onGenerateFromVideo}
        isGeneratingFromVideo={isGeneratingFromVideo}
        onGenerateFromPhoto={onGenerateFromPhoto}
        isPositionSectionOpen={isPositionSectionOpen}
        onTogglePositionSection={onTogglePositionSection}
        activeOverridesCount={activeOverridesCount}
        onApplyCoverStyle={onApplyCoverStyle}
        positionSection={
          <PositionInspector
            slide={currentSlide}
            theme={theme}
            isOpen={true}
            headless={true}
            selectedElementId={selectedElementId}
            onSelectElement={onSelectElement}
            onUpdateOverride={onUpdateElementLayoutOverride}
            onResetOverrides={onResetSlideLayoutOverrides}
            onApplyToAllSlides={onApplyOverrideToAllSlides}
            onApplySlideLayoutToAllSlides={onApplySlideLayoutToAllSlides}
            onUpdateSlideFields={onUpdateSlideFields}
          />
        }
      />

      {imageStudioTargetIndex !== null &&
        carousel?.slides &&
        carousel.slides[imageStudioTargetIndex] &&
        onApplyStudioImage &&
        onCloseStudioImage && (
          <Suspense fallback={null}>
            <SlideImageStudio
              slideIndex={imageStudioTargetIndex}
              slide={carousel.slides[imageStudioTargetIndex]}
              theme={theme}
              onApplyImage={onApplyStudioImage}
              onClose={onCloseStudioImage}
              onShowToast={onShowToast}
            />
          </Suspense>
        )}
    </div>
  );
};
