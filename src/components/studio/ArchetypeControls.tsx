import React, { useState } from 'react';
import {
  Cpu,
  Layers,
  Image as ImageIcon,
  Code,
  Gauge,
  Columns,
  ArrowRight,
  ArrowLeftRight,
  LayoutTemplate,
  Hash,
  Wand2,
  Lock,
  Unlock,
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
  explainArchetypeChoice,
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
  SubjectPairArchetypeEditor,
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
  onGenerateFromPhoto?: (file: File, dataUrl: string, mode: 'meme' | 'graphic') => void;
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
  { id: 'subjectPair', label: 'Subject Pair', icon: ArrowLeftRight },
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
  onGenerateFromPhoto,
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
  const isManualLocked = Boolean(currentSlide.manualLayoutLocked);
  const activeRationale =
    currentSlide.layoutRationale ||
    explainArchetypeChoice(currentSlide, currentSlideIndex, totalSlides);

  const renderArchetypeMiniThumbnail = (type: SlideType, isActive: boolean) => {
    const stroke = isActive ? theme.accent : '#94a3b8';
    const fill = isActive ? `${theme.accent}33` : 'rgba(255,255,255,0.06)';
    switch (type) {
      case 'hub':
        return (
          <svg viewBox="0 0 36 24" className="w-8 h-5 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <circle cx="18" cy="12" r="7.5" fill="none" stroke={stroke} strokeWidth="0.9" strokeDasharray="1.5 1.5" opacity="0.65" />
            <rect x="14.5" y="8.5" width="7" height="7" rx="2" fill={fill} stroke={stroke} strokeWidth="1.2" />
            <circle cx="18" cy="3.5" r="1.6" fill={stroke} />
            <circle cx="26" cy="9" r="1.6" fill={stroke} />
            <circle cx="23.5" cy="18.5" r="1.6" fill={stroke} />
            <circle cx="12.5" cy="18.5" r="1.6" fill={stroke} />
            <circle cx="10" cy="9" r="1.6" fill={stroke} />
          </svg>
        );
      case 'row':
        return (
          <svg viewBox="0 0 36 24" className="w-8 h-5 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <rect x="3" y="7" width="7.5" height="10" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.1" />
            <line x1="10.5" y1="12" x2="14" y2="12" stroke={stroke} strokeWidth="1.1" />
            <rect x="14" y="7" width="8" height="10" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.1" />
            <line x1="22" y1="12" x2="25.5" y2="12" stroke={stroke} strokeWidth="1.1" />
            <rect x="25.5" y="7" width="7.5" height="10" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.1" />
          </svg>
        );
      case 'compare':
        return (
          <svg viewBox="0 0 36 24" className="w-8 h-5 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <rect x="3" y="4" width="13.5" height="16" rx="2" fill="rgba(244,63,94,0.18)" stroke="#fb7185" strokeWidth="1.1" />
            <rect x="19.5" y="4" width="13.5" height="16" rx="2" fill={fill} stroke={stroke} strokeWidth="1.1" />
          </svg>
        );
      case 'code':
        return (
          <svg viewBox="0 0 36 24" className="w-8 h-5 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <rect x="3" y="3.5" width="30" height="17" rx="2" fill="rgba(0,0,0,0.65)" stroke={stroke} strokeWidth="1.1" />
            <line x1="6" y1="8.5" x2="19" y2="8.5" stroke="#fb7185" strokeWidth="1.4" />
            <line x1="6" y1="12" x2="27" y2="12" stroke={stroke} strokeWidth="1.4" />
            <line x1="6" y1="15.5" x2="23" y2="15.5" stroke="#34d399" strokeWidth="1.4" />
          </svg>
        );
      case 'metric':
        return (
          <svg viewBox="0 0 36 24" className="w-8 h-5 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <rect x="3.5" y="4" width="29" height="16" rx="2" fill={fill} stroke={stroke} strokeWidth="1.1" />
            <text x="18" y="14.5" textAnchor="middle" fill={stroke} fontSize="7.5" fontWeight="bold" fontFamily="monospace">
              99%
            </text>
          </svg>
        );
      case 'number':
        return (
          <svg viewBox="0 0 36 24" className="w-8 h-5 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <rect x="4" y="4.5" width="12" height="15" rx="2" fill={fill} stroke={stroke} strokeWidth="1.1" />
            <text x="10" y="14.5" textAnchor="middle" fill={stroke} fontSize="7.5" fontWeight="bold" fontFamily="monospace">
              01
            </text>
            <line x1="19" y1="9.5" x2="31" y2="9.5" stroke={stroke} strokeWidth="1.3" />
            <line x1="19" y1="14" x2="28" y2="14" stroke={stroke} strokeWidth="1.1" opacity="0.6" />
          </svg>
        );
      case 'image':
        return (
          <svg viewBox="0 0 36 24" className="w-8 h-5 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <rect x="4" y="3.5" width="28" height="17" rx="2" fill="#f8fafc" stroke={stroke} strokeWidth="1.1" />
            <circle cx="11" cy="9" r="1.8" fill="#0f172a" />
            <path d="M6.5 18 L13.5 11.5 L19 16 L24.5 10 L30 18 Z" fill={stroke} opacity="0.85" />
          </svg>
        );
      case 'poster':
        return (
          <svg viewBox="0 0 36 24" className="w-8 h-5 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <rect x="4" y="3.5" width="28" height="8" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.1" />
            <line x1="5" y1="14.5" x2="31" y2="14.5" stroke={stroke} strokeWidth="1.2" />
            <line x1="5" y1="17.5" x2="26" y2="17.5" stroke={stroke} strokeWidth="1.1" opacity="0.7" />
            <line x1="5" y1="20.5" x2="29" y2="20.5" stroke={stroke} strokeWidth="1.1" opacity="0.5" />
          </svg>
        );
      case 'cta':
      default:
        return (
          <svg viewBox="0 0 36 24" className="w-8 h-5 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <line x1="7" y1="8" x2="29" y2="8" stroke="#f8fafc" strokeWidth="1.4" />
            <rect x="8" y="12.5" width="20" height="6.5" rx="3.2" fill={stroke} />
          </svg>
        );
    }
  };

  const handleSelectVariant = (variantId: DiagramVariant) => {
    const nextSmart = resolveSmartSlideVisuals(
      { ...currentSlide, diagramVariant: variantId },
      currentSlideIndex,
      true
    );
    const nextRationale = explainArchetypeChoice(
      { ...currentSlide, diagramVariant: variantId },
      currentSlideIndex,
      totalSlides
    );
    if (onUpdateSlideFields) {
      onUpdateSlideFields({
        diagramVariant: variantId,
        diagramNodes: nextSmart.diagramNodes,
        diagramEdges: nextSmart.diagramEdges,
        diagramFooter: nextSmart.diagramFooter,
        layoutRationale: nextRationale,
      });
    } else {
      onUpdateField('diagramVariant', variantId);
      onUpdateField('layoutRationale', nextRationale);
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
    const rationale = explainArchetypeChoice(
      { ...currentSlide, type: targetType, diagramVariant: refreshed.diagramVariant },
      currentSlideIndex,
      totalSlides
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
      layoutRationale: rationale,
    };

    if (onUpdateSlideFields) {
      onUpdateSlideFields(updatedFields);
    } else {
      onUpdateField('layoutRationale', rationale);
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

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              data-testid="toggle-cascade-lock-btn"
              onClick={() => onUpdateField('manualLayoutLocked', !isManualLocked)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                isManualLocked
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                  : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/15 text-slate-300 hover:text-white'
              }`}
              title="Cascade Lock: Protect this slide's manually edited layout when running Diversify Deck or Sync Deck"
            >
              {isManualLocked ? (
                <>
                  <Lock className="w-3 h-3 text-amber-300" />
                  <span>Cascade Locked</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3 h-3 text-slate-400" />
                  <span>Cascade Lock</span>
                </>
              )}
            </button>

            {onDiversifyDeckVisuals && totalSlides > 1 && (
              <button
                type="button"
                onClick={onDiversifyDeckVisuals}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/35 text-[11px] font-semibold text-amber-200 transition-colors cursor-pointer whitespace-nowrap"
                title="Auto-diversify unlocked slides across Compare, Code, Metric, and varied Diagram schematics matched to each slide's copy"
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

        {/* One-Line Layout Rationale Banner */}
        <div
          data-testid="layout-rationale-banner"
          className="px-3 py-1.5 rounded-xl bg-black/50 border border-white/10 flex items-center justify-between gap-2 text-[11px] font-mono text-slate-300"
        >
          <span className="truncate">
            <strong className="text-cyan-300 uppercase">{currentSlide.type}</strong>
            {currentSlide.type === 'row' && activeDiagramVariant
              ? ` (${activeDiagramVariant})`
              : ''}
            {' — '}
            {activeRationale}
          </span>
          {isManualLocked && (
            <span className="text-[10px] text-amber-300 shrink-0 font-bold">
              LOCKED
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 bg-black/60 p-1.5 rounded-xl border border-white/10">
          {ARCHETYPES.map((arch) => {
            const Icon = arch.icon;
            const isSelected = currentSlide.type === arch.id;
            const isRecommended = recommendedArchetype === arch.id && !isSelected;
            return (
              <button
                key={arch.id}
                type="button"
                onClick={() => onSetSlideType(arch.id)}
                className={`relative flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-white/20 text-white shadow-sm border border-white/25'
                    : isRecommended
                    ? 'bg-white/[0.05] text-slate-200 border border-cyan-500/35 hover:bg-white/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Icon
                    className="w-3.5 h-3.5 shrink-0"
                    style={{ color: isSelected || isRecommended ? theme.accent : undefined }}
                  />
                  <span className="truncate">{arch.label}</span>
                </div>
                {renderArchetypeMiniThumbnail(arch.id, isSelected)}
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

      {/* ARCHETYPE: SUBJECT PAIR */}
      {currentSlide.type === 'subjectPair' && (
        <SubjectPairArchetypeEditor
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
          onGenerateFromPhoto={onGenerateFromPhoto}
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
