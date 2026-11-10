import React, { useState } from 'react';
import {
  Cpu,
  Layers,
  Image as ImageIcon,
  Code,
  Gauge,
  Columns,
  ArrowRight,
  LayoutTemplate,
  Hash,
  Wand2,
} from 'lucide-react';
import {
  CarouselData,
  SlideData,
  SlideType,
  ThemePalette,
  DiagramVariant,
  DiagramNode,
} from '../../types.ts';
import {
  analyzeSlideTextForArchetype,
  resolveSmartSlideVisuals,
} from '../../lib/synthesis/smartVisualDefaults.ts';
import { IconPickerPopover } from './IconPickerPopover.tsx';
import {
  HubArchetypeEditor,
  DiagramSchematicEditor,
  NumberArchetypeEditor,
  CodeArchetypeEditor,
  MetricArchetypeEditor,
  CompareArchetypeEditor,
  ImageArchetypeEditor,
  CtaArchetypeEditor,
  EXPECTATIONS_VS_REALITY_MEME_URL,
} from './archetypes/index.ts';

export { EXPECTATIONS_VS_REALITY_MEME_URL };

export interface ArchetypeControlsProps {
  currentSlide: SlideData;
  currentSlideIndex?: number;
  carousel?: CarouselData;
  theme: ThemePalette;
  isAdvancedCustomizerOpen: boolean;
  onSetSlideType: (type: SlideType) => void;
  onUpdateField: (field: keyof SlideData, value: any) => void;
  onUpdateSlideFields?: (updates: Partial<SlideData>) => void;
  onSmartMatchVisuals?: (useRecommendedArchetype?: boolean) => void;
  onDiversifyDeckVisuals?: () => void;
  onUpdateCarouselField?: (field: keyof CarouselData, value: any) => void;
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
}

function normalizeDiagramVariant(raw?: string): DiagramVariant {
  const v = (raw || 'topology').toLowerCase();
  if (v === 'vectors' || v === 'scatter') return 'scatter';
  if (v === 'hnsw' || v === 'hierarchy' || v === 'graph') return 'graph';
  if (v === 'ivf' || v === 'partition' || v === 'clusters') return 'clusters';
  if (v === 'hotcold' || v === 'buffer' || v === 'split') return 'split';
  if (v === 'cards' || v === 'features') return 'features';
  if (v === 'stack') return 'stack';
  if (v === 'isolation') return 'isolation';
  if (v === 'takeaway') return 'takeaway';
  return 'topology';
}

const ARCHETYPES: {
  id: SlideType;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}[] = [
  { id: 'poster', label: 'Poster', icon: LayoutTemplate },
  { id: 'hub', label: 'Hub', icon: Cpu },
  { id: 'row', label: 'Mechanism', icon: Layers },
  { id: 'number', label: 'Number', icon: Hash },
  { id: 'image', label: 'Meme / Image', icon: ImageIcon },
  { id: 'code', label: 'Code Diff', icon: Code },
  { id: 'metric', label: 'Metric', icon: Gauge },
  { id: 'compare', label: 'Compare', icon: Columns },
  { id: 'cta', label: 'CTA', icon: ArrowRight },
];

export const ArchetypeControls: React.FC<ArchetypeControlsProps> = ({
  currentSlide,
  currentSlideIndex = 0,
  carousel,
  theme,
  onSetSlideType,
  onUpdateField,
  onUpdateSlideFields,
  onSmartMatchVisuals,
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
  isExportingVideo = false,
  videoExportProgress = 0,
  videoExportStage = '',
  onGenerateFromVideo,
  isGeneratingFromVideo = false,
}) => {
  const [iconPickerState, setIconPickerState] = useState<{
    isOpen: boolean;
    title: string;
    currentIcon: string;
    onSelect: (icon: string) => void;
  }>({
    isOpen: false,
    title: '',
    currentIcon: '',
    onSelect: () => {},
  });

  const handleRequestIconPicker = (config: {
    title: string;
    currentIcon: string;
    onSelect: (icon: string) => void;
  }) => {
    setIconPickerState({
      isOpen: true,
      ...config,
    });
  };

  const totalSlides = carousel?.slides?.length || 8;
  const smart = resolveSmartSlideVisuals(currentSlide, currentSlideIndex, false);
  const recommendedArchetype = analyzeSlideTextForArchetype(currentSlide, currentSlideIndex);
  const recommendedVariant = smart.recommendedVariant;
  const activeDiagramVariant = normalizeDiagramVariant(currentSlide.diagramVariant || smart.diagramVariant);

  const handleSelectVariant = (variantId: DiagramVariant) => {
    const nextSmart = resolveSmartSlideVisuals(
      { ...currentSlide, diagramVariant: variantId },
      currentSlideIndex,
      true
    );
    if (onUpdateSlideFields) {
      onUpdateSlideFields({
        diagramVariant: variantId,
        diagramNodes: nextSmart.diagramNodes,
        diagramEdges: nextSmart.diagramEdges,
        diagramFooter: nextSmart.diagramFooter,
      });
    } else {
      onUpdateField('diagramVariant', variantId);
    }
  };

  const handleTriggerSmartMatch = (switchArchetype: boolean = true) => {
    const targetType: SlideType = switchArchetype
      ? analyzeSlideTextForArchetype(currentSlide, currentSlideIndex)
      : currentSlide.type;
    const refreshed = resolveSmartSlideVisuals(
      { ...currentSlide, type: targetType },
      currentSlideIndex,
      true
    );

    if (onSmartMatchVisuals) {
      onSmartMatchVisuals(switchArchetype);
      return;
    }

    if (switchArchetype) {
      onSetSlideType(targetType);
    }

    const updatedFields: Partial<SlideData> = {
      type: targetType,
      centerIcon: refreshed.centerIcon,
      centerTag: refreshed.centerTag,
      satLabels: refreshed.satLabels,
      satIcons: refreshed.satIcons,
      diagramVariant: refreshed.diagramVariant,
      diagramNodes: refreshed.diagramNodes,
      diagramEdges: refreshed.diagramEdges,
      diagramFooter: refreshed.diagramFooter,
      stepNumber: refreshed.stepNumber,
      stepLabel: refreshed.stepLabel,
      metricValue: refreshed.metricValue,
      metricLabel: refreshed.metricLabel,
      metricDiff: refreshed.metricDiff,
      metricIcon: refreshed.metricIcon,
      codeFileName: refreshed.codeFileName,
      codeLanguage: refreshed.codeLanguage,
      codeSnippet: refreshed.codeSnippet,
      compareLeftTitle: refreshed.compareLeftTitle,
      compareLeftBody: refreshed.compareLeftBody,
      compareRightTitle: refreshed.compareRightTitle,
      compareRightBody: refreshed.compareRightBody,
    };

    if (onUpdateSlideFields) {
      onUpdateSlideFields(updatedFields);
    } else {
      if (targetType === 'metric') {
        onUpdateField('metricValue', refreshed.metricValue);
        onUpdateField('metricLabel', refreshed.metricLabel);
        onUpdateField('metricDiff', refreshed.metricDiff);
        onUpdateField('metricIcon', refreshed.metricIcon);
      } else if (targetType === 'compare') {
        onUpdateField('compareLeftTitle', refreshed.compareLeftTitle);
        onUpdateField('compareLeftBody', refreshed.compareLeftBody);
        onUpdateField('compareRightTitle', refreshed.compareRightTitle);
        onUpdateField('compareRightBody', refreshed.compareRightBody);
      } else if (targetType === 'code') {
        onUpdateField('codeFileName', refreshed.codeFileName);
        onUpdateField('codeLanguage', refreshed.codeLanguage);
        onUpdateField('codeSnippet', refreshed.codeSnippet);
      } else if (targetType === 'number') {
        onUpdateField('stepNumber', refreshed.stepNumber);
        onUpdateField('stepLabel', refreshed.stepLabel);
        onUpdateField('centerIcon', refreshed.numberIcon);
      } else if (targetType === 'row') {
        onUpdateField('diagramVariant', refreshed.diagramVariant);
        onUpdateField('diagramNodes', refreshed.diagramNodes);
        onUpdateField('diagramEdges', refreshed.diagramEdges);
        onUpdateField('diagramFooter', refreshed.diagramFooter);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Top-Level Slide Layout Archetype Switcher + Smart Match Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Slide Layout Archetype
            </label>
            <span className="text-[10px] font-mono text-slate-500">·</span>
            <span className="text-[10px] font-mono text-slate-400">
              Best Fit:{' '}
              <strong className="uppercase" style={{ color: theme.accent }}>
                {recommendedArchetype}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {onDiversifyDeckVisuals && totalSlides > 1 && (
              <button
                type="button"
                onClick={onDiversifyDeckVisuals}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/35 text-[11px] font-semibold text-amber-200 transition-colors cursor-pointer whitespace-nowrap"
                title="Auto-diversify Slides 2–7 across Compare, Code, Metric, and varied Diagram schematics matched to each slide's copy"
              >
                <Wand2 className="w-3 h-3" />
                <span>Diversify Deck (2–7)</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleTriggerSmartMatch(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-[11px] font-semibold text-cyan-200 transition-colors cursor-pointer whitespace-nowrap"
              title="Analyze slide text to assign the most appropriate archetype (Metric, Compare, Code, Row, or Number) and update layout configuration"
            >
              <Wand2 className="w-3 h-3" />
              <span>Smart Match</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 bg-black/60 p-1.5 rounded-xl border border-white/10">
          {ARCHETYPES.map((arch) => {
            const Icon = arch.icon;
            const isSelected = currentSlide.type === arch.id;
            const isRecommended = recommendedArchetype === arch.id && !isSelected;
            return (
              <button
                key={arch.id}
                type="button"
                onClick={() => onSetSlideType(arch.id)}
                className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-white/20 text-white shadow-sm border border-white/25'
                    : isRecommended
                    ? 'bg-white/[0.05] text-slate-200 border border-cyan-500/35 hover:bg-white/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <Icon
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: isSelected || isRecommended ? theme.accent : undefined }}
                />
                <span className="truncate">{arch.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Contextual Archetype Visual Editors */}

      {/* ARCHETYPE: HUB */}
      {currentSlide.type === 'hub' && (
        <HubArchetypeEditor
          currentSlide={currentSlide}
          theme={theme}
          smart={smart}
          onUpdateField={onUpdateField}
          onUpdateSatLabel={onUpdateSatLabel}
          onUpdateSatIcon={onUpdateSatIcon}
          onUpdateCenterIcon={onUpdateCenterIcon}
          onUpdateCenterTag={onUpdateCenterTag}
          onAddSatNode={onAddSatNode}
          onDeleteSatNode={onDeleteSatNode}
          onRequestIconPicker={handleRequestIconPicker}
        />
      )}

      {/* ARCHETYPE: ROW & POSTER SCHEMATICS */}
      {(currentSlide.type === 'row' || currentSlide.type === 'poster') && (
        <DiagramSchematicEditor
          currentSlide={currentSlide}
          theme={theme}
          activeDiagramVariant={activeDiagramVariant}
          recommendedVariant={recommendedVariant}
          smart={smart}
          onSelectVariant={handleSelectVariant}
          onUpdateField={onUpdateField}
          onUpdateDiagramNode={onUpdateDiagramNode}
          onUpdateDiagramEdge={onUpdateDiagramEdge}
          onRequestIconPicker={handleRequestIconPicker}
        />
      )}

      {/* ARCHETYPE: NUMBER */}
      {currentSlide.type === 'number' && (
        <NumberArchetypeEditor
          currentSlide={currentSlide}
          currentSlideIndex={currentSlideIndex}
          theme={theme}
          smart={smart}
          onUpdateField={onUpdateField}
          onUpdateCenterIcon={onUpdateCenterIcon}
          onRequestIconPicker={handleRequestIconPicker}
        />
      )}

      {/* ARCHETYPE: CODE */}
      {currentSlide.type === 'code' && (
        <CodeArchetypeEditor
          currentSlide={currentSlide}
          smart={smart}
          onUpdateField={onUpdateField}
        />
      )}

      {/* ARCHETYPE: METRIC */}
      {currentSlide.type === 'metric' && (
        <MetricArchetypeEditor
          currentSlide={currentSlide}
          theme={theme}
          smart={smart}
          onUpdateField={onUpdateField}
          onRequestIconPicker={handleRequestIconPicker}
        />
      )}

      {/* ARCHETYPE: COMPARE */}
      {currentSlide.type === 'compare' && (
        <CompareArchetypeEditor
          currentSlide={currentSlide}
          smart={smart}
          onUpdateField={onUpdateField}
        />
      )}

      {/* ARCHETYPE: IMAGE & POSTER MEDIA */}
      {(currentSlide.type === 'image' || currentSlide.type === 'poster') && (
        <ImageArchetypeEditor
          currentSlide={currentSlide}
          carousel={carousel}
          theme={theme}
          totalSlides={totalSlides}
          onSetSlideType={onSetSlideType}
          onUpdateField={onUpdateField}
          onUpdateSlideFields={onUpdateSlideFields}
          onUpdateCarouselField={onUpdateCarouselField}
          onOpenAiImageStudio={onOpenAiImageStudio}
          onOpenMediaSearch={onOpenMediaSearch}
          onExportVideoMp4={onExportVideoMp4}
          isExportingVideo={isExportingVideo}
          videoExportProgress={videoExportProgress}
          videoExportStage={videoExportStage}
          onGenerateFromVideo={onGenerateFromVideo}
          isGeneratingFromVideo={isGeneratingFromVideo}
        />
      )}

      {/* ARCHETYPE: CTA */}
      {currentSlide.type === 'cta' && (
        <CtaArchetypeEditor
          currentSlide={currentSlide}
          carousel={carousel}
          theme={theme}
          onUpdateField={onUpdateField}
          onUpdateCarouselField={onUpdateCarouselField}
        />
      )}

      {/* Vector Icon Picker Modal Popover */}
      <IconPickerPopover
        isOpen={iconPickerState.isOpen}
        title={iconPickerState.title}
        selectedIcon={iconPickerState.currentIcon}
        onSelectIcon={(icon) => {
          iconPickerState.onSelect(icon);
          setIconPickerState((prev) => ({ ...prev, isOpen: false }));
        }}
        onClose={() => setIconPickerState((prev) => ({ ...prev, isOpen: false }))}
        theme={theme}
      />
    </div>
  );
};
