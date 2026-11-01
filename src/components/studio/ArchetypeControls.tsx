import React, { useState, useRef, useEffect } from 'react';
import {
  Cpu,
  Layers,
  Image as ImageIcon,
  Code,
  Gauge,
  Columns,
  ArrowRight,
  Plus,
  Trash2,
  Sparkles,
  Tag,
  LayoutTemplate,
  Hash,
  RotateCcw,
  Globe,
  ShieldCheck,
  Wand2,
  Upload,
  ClipboardPaste,
  Maximize2,
  X,
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
import { IconThumbnail, getIconDisplayName } from './IconThumbnail.tsx';

interface ArchetypeControlsProps {
  currentSlide: SlideData;
  currentSlideIndex?: number;
  carousel?: CarouselData;
  theme: ThemePalette;
  isAdvancedCustomizerOpen: boolean;
  onSetSlideType: (type: SlideType) => void;
  onUpdateField: (field: keyof SlideData, value: any) => void;
  onUpdateSlideFields?: (updates: Partial<SlideData>) => void;
  onSmartMatchVisuals?: (useRecommendedArchetype?: boolean) => void;
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
}

const DIAGRAM_VARIANTS: { id: DiagramVariant; label: string }[] = [
  { id: 'topology', label: 'Topology Flow' },
  { id: 'stack', label: 'Layered Stack' },
  { id: 'isolation', label: 'Isolation Grid' },
  { id: 'takeaway', label: 'Key Takeaway' },
  { id: 'scatter', label: 'Vector Scatter' },
  { id: 'graph', label: 'HNSW Skip-Graph' },
  { id: 'clusters', label: 'IVF Clusters' },
  { id: 'split', label: 'Hot/Cold Split' },
  { id: 'features', label: '3 Feature Cards' },
];

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

export const EXPECTATIONS_VS_REALITY_MEME_URL = '/assets/aistudio/1793547809949_4a78bc04.jpg';

export const ArchetypeControls: React.FC<ArchetypeControlsProps> = ({
  currentSlide,
  currentSlideIndex = 0,
  carousel,
  theme,
  onSetSlideType,
  onUpdateField,
  onUpdateSlideFields,
  onSmartMatchVisuals,
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

  const totalSlides = carousel?.slides?.length || 8;
  const smart = resolveSmartSlideVisuals(currentSlide, currentSlideIndex, false);
  const recommendedArchetype = analyzeSlideTextForArchetype(currentSlide, currentSlideIndex);
  const recommendedVariant = smart.recommendedVariant;

  const satIcons =
    currentSlide.satIcons && currentSlide.satIcons.length > 0
      ? currentSlide.satIcons
      : smart.satIcons;

  const satLabels =
    currentSlide.satLabels && currentSlide.satLabels.length > 0
      ? currentSlide.satLabels
      : smart.satLabels;

  const centerIconName = currentSlide.centerIcon || smart.centerIcon || 'cpu';
  const centerIconDisplayName = getIconDisplayName(centerIconName);

  const numberIconName = currentSlide.centerIcon || currentSlide.icons?.[0]?.icon || smart.numberIcon || '';
  const numberIconDisplayName = numberIconName ? getIconDisplayName(numberIconName) : 'None (Clean Line)';

  const metricIconName = currentSlide.metricIcon || smart.metricIcon || 'zap';
  const metricIconDisplayName = getIconDisplayName(metricIconName);

  const activeDiagramVariant = normalizeDiagramVariant(currentSlide.diagramVariant || smart.diagramVariant);
  const autoStepStr = String(currentSlideIndex + 1).padStart(2, '0');
  const currentStepNumber = currentSlide.stepNumber || smart.stepNumber || autoStepStr;
  const currentStepLabel = currentSlide.stepLabel || smart.stepLabel || `STEP ${currentStepNumber}`;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const applySlideBatchUpdates = (updates: Partial<SlideData>) => {
    if (onUpdateSlideFields) {
      onUpdateSlideFields(updates);
    } else {
      (Object.keys(updates) as (keyof SlideData)[]).forEach((key) => {
        onUpdateField(key, updates[key]);
      });
    }
  };

  const handleImageFileUpload = (file?: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const targetType: SlideType =
        currentSlide.type === 'poster' || carousel?.postFormat === 'single' || totalSlides === 1
          ? 'poster'
          : 'image';
      if (currentSlide.type !== targetType) {
        onSetSlideType(targetType);
      }
      applySlideBatchUpdates({
        type: targetType,
        imageUrl: dataUrl,
        imageFrameMode: 'full',
        imageFit: 'contain',
        imageFilter: 'clean',
        imageBgStyle: currentSlide.imageBgStyle || 'white',
        brandWatermark: currentSlide.brandWatermark || 'bottom-right',
        imageCaption: '',
        metricValue: '',
        metricLabel: '',
        metricDiff: '',
        imageZoom: 1,
        imagePanX: 0,
        imagePanY: 0,
        layoutOverrides: undefined,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleApplyExpectationsMemePreset = () => {
    const targetType: SlideType =
      currentSlide.type === 'poster' || carousel?.postFormat === 'single' || totalSlides === 1
        ? 'poster'
        : 'image';
    if (currentSlide.type !== targetType) {
      onSetSlideType(targetType);
    }
    applySlideBatchUpdates({
      type: targetType,
      imageUrl: EXPECTATIONS_VS_REALITY_MEME_URL,
      imageFrameMode: 'full',
      imageFit: 'contain',
      imageFilter: 'clean',
      imageBgStyle: 'white',
      brandWatermark: 'bottom-right',
      imageCaption: '',
      metricValue: '',
      metricLabel: '',
      metricDiff: '',
      imageZoom: 1,
      imagePanX: 0,
      imagePanY: 0,
      layoutOverrides: undefined,
    });
  };

  useEffect(() => {
    if (currentSlide.type !== 'image' && currentSlide.type !== 'poster') return;
    const onWindowPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            handleImageFileUpload(blob);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, [currentSlide.type, currentSlide.imageBgStyle, currentSlide.brandWatermark]);

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
      {/* 1. Always-On Top-Level Slide Layout Archetype Switcher + Smart Match Bar */}
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

      {/* ARCHETYPE: HUB (Central Hero Box & Orbital Satellite Nodes) */}
      {currentSlide.type === 'hub' && (
        <div className="pt-3 border-t border-white/[0.08] space-y-4 animate-fade-in">
          <div className="p-3 bg-black/60 border border-white/10 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                <span>Central Hub Hero Component</span>
              </label>
              <span className="text-[10px] text-slate-400 font-mono">Orbital Core</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-slate-400 font-medium block mb-1">Center Hero Icon</span>
                <button
                  type="button"
                  onClick={() =>
                    setIconPickerState({
                      isOpen: true,
                      title: 'Select Center Hub Hero Icon',
                      currentIcon: centerIconName,
                      onSelect: (icon) => {
                        if (onUpdateCenterIcon) onUpdateCenterIcon(icon);
                        else onUpdateField('centerIcon', icon);
                      },
                    })
                  }
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/15 hover:border-white/30 hover:bg-white/[0.07] text-left transition-all cursor-pointer group"
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center p-1 border shrink-0 transition-all group-hover:scale-105"
                    style={{
                      borderColor: `${theme.accent}40`,
                      backgroundColor: `${theme.accent}15`,
                    }}
                  >
                    <IconThumbnail icon={centerIconName} theme={theme} className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-white truncate">
                      {centerIconDisplayName}
                    </div>
                    <div className="text-[10px] text-slate-400">Click to change icon</div>
                  </div>
                </button>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-medium block mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3 h-3 text-slate-400" />
                    <span>Center Tag Label</span>
                  </span>
                </span>
                <input
                  type="text"
                  value={currentSlide.centerTag ?? smart.centerTag}
                  onChange={(e) => {
                    if (onUpdateCenterTag) onUpdateCenterTag(e.target.value);
                    else onUpdateField('centerTag', e.target.value);
                  }}
                  placeholder={smart.centerTag}
                  className="w-full bg-white/[0.03] border border-white/15 focus:border-white/40 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* Orbital Satellite Nodes (2 to 6 nodes) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                  <span>
                    Orbital Satellite Nodes ({satLabels.length}/6)
                  </span>
                </label>
                <p className="text-[10px] text-slate-400">
                  Smart-extracted from slide copy • Click any icon or label to customize
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onAddSatNode}
                  disabled={satLabels.length >= 6}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/10 text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all cursor-pointer"
                  title="Add Orbital Node (Max 6)"
                >
                  <Plus className="w-3 h-3" style={{ color: theme.accent }} />
                  <span>Add Node</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {satLabels.map((label, idx, arr) => {
                const nodeIconKey = satIcons[idx % satIcons.length] || 'cpu';
                const nodeIconLabel = getIconDisplayName(nodeIconKey);

                return (
                  <div
                    key={idx}
                    className="group relative flex items-center bg-black/60 border border-white/15 focus-within:border-white/40 rounded-xl overflow-hidden pl-2 pr-1.5 py-1.5 transition-all gap-1.5"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setIconPickerState({
                          isOpen: true,
                          title: `Select Node #${idx + 1} Icon`,
                          currentIcon: nodeIconKey,
                          onSelect: (icon) => {
                            if (onUpdateSatIcon) {
                              onUpdateSatIcon(idx, icon);
                            } else {
                              const nextIcons = [...satIcons];
                              nextIcons[idx] = icon;
                              onUpdateField('satIcons', nextIcons);
                            }
                          },
                        })
                      }
                      className="w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 transition-transform hover:scale-110 cursor-pointer"
                      style={{
                        borderColor: `${theme.accent}30`,
                        backgroundColor: `${theme.accent}10`,
                      }}
                      title={`Change icon for Node #${idx + 1} (${nodeIconLabel})`}
                    >
                      <IconThumbnail icon={nodeIconKey} theme={theme} className="w-4 h-4" />
                    </button>

                    <span className="text-[10px] font-mono text-slate-500 font-bold shrink-0">
                      #{idx + 1}
                    </span>

                    <input
                      type="text"
                      value={label}
                      onChange={(e) => onUpdateSatLabel(idx, e.target.value)}
                      placeholder={`Node ${idx + 1}`}
                      className="w-full bg-transparent text-xs text-white font-medium focus:outline-none min-w-0"
                    />

                    {arr.length > 2 && onDeleteSatNode && (
                      <button
                        type="button"
                        onClick={() => onDeleteSatNode(idx)}
                        className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-70 group-hover:opacity-100 shrink-0 cursor-pointer"
                        title={`Delete Node #${idx + 1}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>Minimum 2 nodes • Maximum 6 nodes</span>
              <span>Orbital layout auto-balances angles on canvas</span>
            </div>
          </div>
        </div>
      )}

      {/* ARCHETYPE: MECHANISM & POSTER SLIDES (Row / Poster with All 9 Schematic Engines) */}
      {(currentSlide.type === 'row' || currentSlide.type === 'poster') && (
        <div className="pt-3 border-t border-white/[0.08] space-y-3.5 animate-fade-in">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                <span>Schematic Engine (9 Variants)</span>
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                Best Fit: <strong className="text-white uppercase">{recommendedVariant}</strong>
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 bg-black/60 p-1.5 rounded-xl border border-white/10">
              {DIAGRAM_VARIANTS.map((variant) => {
                const isSelected = activeDiagramVariant === variant.id;
                const isSuggested = recommendedVariant === variant.id && !isSelected;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => handleSelectVariant(variant.id)}
                    className={`flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? 'bg-white/20 text-white shadow-sm border border-white/30'
                        : isSuggested
                        ? 'bg-white/[0.05] text-slate-200 border border-cyan-500/35 hover:bg-white/10'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                    }`}
                    style={isSelected ? { color: theme.accent } : undefined}
                  >
                    <span className="truncate">{variant.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3 Diagram Nodes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <span>Schematic Nodes (3 Components)</span>
              </label>
              <span className="text-[10px] text-slate-400 font-mono">Icon · Status · Label · Spec</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, nIdx) => {
                const smartNode = smart.diagramNodes[nIdx];
                const node = currentSlide.diagramNodes?.[nIdx] || smartNode;
                const nodeIconKey = node?.icon || smartNode?.icon || 'cpu';
                const nodeIconLabel = getIconDisplayName(nodeIconKey);

                return (
                  <div key={nIdx} className="bg-black/50 border border-white/10 rounded-xl p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setIconPickerState({
                              isOpen: true,
                              title: `Select Node #${nIdx + 1} Icon`,
                              currentIcon: nodeIconKey,
                              onSelect: (icon) => onUpdateDiagramNode(nIdx, 'icon', icon),
                            })
                          }
                          className="w-6 h-6 rounded-lg flex items-center justify-center border shrink-0 transition-transform hover:scale-110 cursor-pointer"
                          style={{
                            borderColor: `${theme.accent}30`,
                            backgroundColor: `${theme.accent}10`,
                          }}
                          title={`Change icon for Node #${nIdx + 1} (${nodeIconLabel})`}
                        >
                          <IconThumbnail icon={nodeIconKey} theme={theme} className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[10px] font-bold font-mono text-slate-400">
                          Node #{nIdx + 1}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={node?.status || smartNode?.status || ''}
                        onChange={(e) => onUpdateDiagramNode(nIdx, 'status', e.target.value)}
                        placeholder="STATUS"
                        className="w-20 text-right bg-transparent border-b border-white/15 focus:border-white/40 text-[9px] font-mono text-emerald-400 uppercase focus:outline-none"
                        title="Status Badge (e.g. ACTIVE, VERIFIED, ISOLATED)"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={node?.label ?? smartNode?.label ?? ''}
                        onChange={(e) => onUpdateDiagramNode(nIdx, 'label', e.target.value)}
                        placeholder="Primary Label"
                        className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2 py-1 text-xs text-white font-semibold focus:outline-none"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={node?.sublabel ?? smartNode?.sublabel ?? ''}
                        onChange={(e) => onUpdateDiagramNode(nIdx, 'sublabel', e.target.value)}
                        placeholder="Sublabel / Spec"
                        className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* diagramEdges & diagramFooter */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">
                Connector 1 → 2
              </label>
              <input
                type="text"
                value={currentSlide.diagramEdges?.[0] ?? smart.diagramEdges[0]}
                onChange={(e) => onUpdateDiagramEdge(0, e.target.value)}
                placeholder={smart.diagramEdges[0]}
                className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">
                Connector 2 → 3
              </label>
              <input
                type="text"
                value={currentSlide.diagramEdges?.[1] ?? smart.diagramEdges[1]}
                onChange={(e) => onUpdateDiagramEdge(1, e.target.value)}
                placeholder={smart.diagramEdges[1]}
                className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">
                Footer Telemetry Line
              </label>
              <input
                type="text"
                value={currentSlide.diagramFooter ?? smart.diagramFooter}
                onChange={(e) => onUpdateField('diagramFooter', e.target.value)}
                placeholder={smart.diagramFooter}
                className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
              />
            </div>
          </div>

          {/* Optional Benchmark Metric Tag for Poster */}
          {currentSlide.type === 'poster' && (
            <div className="pt-2 border-t border-white/[0.08] grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">
                  Corner Benchmark Value (Optional)
                </label>
                <input
                  type="text"
                  value={currentSlide.metricValue ?? ''}
                  onChange={(e) => onUpdateField('metricValue', e.target.value)}
                  placeholder="e.g. 200x, 0ms, 99.9%"
                  className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">
                  Benchmark Label / Delta
                </label>
                <input
                  type="text"
                  value={currentSlide.metricLabel ?? ''}
                  onChange={(e) => onUpdateField('metricLabel', e.target.value)}
                  placeholder="e.g. P99 LATENCY or ▲ 12x"
                  className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ARCHETYPE: NUMBER (Step Numeral, Top Kicker Label & Divider Emblem Icon) */}
      {currentSlide.type === 'number' && (
        <div className="pt-3 border-t border-white/[0.08] space-y-3.5 animate-fade-in">
          <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                <span>Step Counter & Accent Numeral</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onUpdateField('stepNumber', autoStepStr);
                  onUpdateField('stepLabel', smart.stepLabel.replace(/^STEP\s*\d+/i, `STEP ${autoStepStr}`));
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-[10px] font-mono text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Sync numeral to current slide position"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Sync Slide #{currentSlideIndex + 1}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* Giant Accent Numeral */}
              <div>
                <label className="text-[10px] text-slate-400 font-medium block mb-1">
                  Big Accent Numeral
                </label>
                <input
                  type="text"
                  value={currentStepNumber}
                  onChange={(e) => onUpdateField('stepNumber', e.target.value)}
                  placeholder="01"
                  maxLength={6}
                  className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-xl px-3 py-2 text-sm text-white font-mono font-bold tabular-nums focus:outline-none"
                />
              </div>

              {/* Top Kicker Badge */}
              <div>
                <label className="text-[10px] text-slate-400 font-medium block mb-1">
                  Top Kicker Label
                </label>
                <input
                  type="text"
                  value={currentStepLabel}
                  onChange={(e) => onUpdateField('stepLabel', e.target.value)}
                  placeholder="STEP 01"
                  className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none"
                />
              </div>

              {/* Optional Divider Emblem Icon */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-400 font-medium">Divider Icon Badge</span>
                  {numberIconName && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onUpdateCenterIcon) onUpdateCenterIcon('');
                        else onUpdateField('centerIcon', '');
                      }}
                      className="text-[9px] font-mono text-slate-400 hover:text-rose-300 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setIconPickerState({
                      isOpen: true,
                      title: 'Select Step Divider Emblem Icon',
                      currentIcon: numberIconName || 'cpu',
                      onSelect: (icon) => {
                        if (onUpdateCenterIcon) onUpdateCenterIcon(icon);
                        else onUpdateField('centerIcon', icon);
                      },
                    })
                  }
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/15 hover:border-white/30 hover:bg-white/[0.07] text-left transition-all cursor-pointer"
                >
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center p-1 border shrink-0"
                    style={{
                      borderColor: `${theme.accent}40`,
                      backgroundColor: `${theme.accent}15`,
                    }}
                  >
                    <IconThumbnail icon={numberIconName || 'cpu'} theme={theme} className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-white truncate">
                      {numberIconDisplayName}
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Quick Step Presets */}
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[10px] font-mono text-slate-400 mr-1">Quick Step:</span>
              {['01', '02', '03', '04', '05', '06'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    onUpdateField('stepNumber', num);
                    if (/^STEP\s*\d+/i.test(currentStepLabel.trim())) {
                      onUpdateField(
                        'stepLabel',
                        currentStepLabel.trim().replace(/^STEP\s*\d+/i, `STEP ${num}`)
                      );
                    }
                  }}
                  className={`px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer tabular-nums ${
                    currentStepNumber === num
                      ? 'bg-white/20 text-white border border-white/30'
                      : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/10'
                  }`}
                  style={currentStepNumber === num ? { color: theme.accent } : undefined}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ARCHETYPE: CODE DIFF */}
      {currentSlide.type === 'code' && (
        <div className="pt-3 border-t border-white/[0.08] animate-fade-in">
          <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 space-y-2.5">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Code className="w-3.5 h-3.5 text-cyan-400" />
              <span>Code Diff & Terminal Controls</span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">File Name</label>
                <input
                  type="text"
                  value={currentSlide.codeFileName ?? smart.codeFileName}
                  onChange={(e) => onUpdateField('codeFileName', e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Language</label>
                <input
                  type="text"
                  value={currentSlide.codeLanguage ?? smart.codeLanguage}
                  onChange={(e) => onUpdateField('codeLanguage', e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white font-mono"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Code Snippet (+ / - diff)</label>
              <textarea
                rows={4}
                value={currentSlide.codeSnippet ?? smart.codeSnippet}
                onChange={(e) => onUpdateField('codeSnippet', e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-lg p-2.5 text-xs text-slate-200 font-mono focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* ARCHETYPE: METRIC CARD */}
      {currentSlide.type === 'metric' && (
        <div className="pt-3 border-t border-white/[0.08] animate-fade-in">
          <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 space-y-3">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-amber-400" />
              <span>Metric Benchmark Card</span>
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Badge Icon</label>
                <button
                  type="button"
                  onClick={() =>
                    setIconPickerState({
                      isOpen: true,
                      title: 'Select Metric Badge Icon',
                      currentIcon: metricIconName,
                      onSelect: (icon) => onUpdateField('metricIcon', icon),
                    })
                  }
                  className="w-full flex items-center gap-2 px-2.5 py-1 rounded-lg bg-black/60 border border-white/10 hover:border-white/30 text-left transition-all cursor-pointer"
                >
                  <IconThumbnail icon={metricIconName} theme={theme} className="w-4 h-4 shrink-0" />
                  <span className="text-xs text-white truncate">{metricIconDisplayName}</span>
                </button>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Metric Value</label>
                <input
                  type="text"
                  value={currentSlide.metricValue ?? smart.metricValue}
                  onChange={(e) => onUpdateField('metricValue', e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white font-mono font-bold tabular-nums"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Label</label>
                <input
                  type="text"
                  value={currentSlide.metricLabel ?? smart.metricLabel}
                  onChange={(e) => onUpdateField('metricLabel', e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Delta / Diff</label>
                <input
                  type="text"
                  value={currentSlide.metricDiff ?? smart.metricDiff}
                  onChange={(e) => onUpdateField('metricDiff', e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-emerald-400 font-mono"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ARCHETYPE: COMPARE */}
      {currentSlide.type === 'compare' && (
        <div className="pt-3 border-t border-white/[0.08] animate-fade-in">
          <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 space-y-2.5">
            <span className="text-xs font-bold text-white flex items-center gap-1.5">
              <Columns className="w-3.5 h-3.5 text-purple-400" />
              <span>Before vs After Architecture Comparison</span>
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 block">Legacy / Baseline (Left)</label>
                <input
                  type="text"
                  value={currentSlide.compareLeftTitle ?? smart.compareLeftTitle}
                  onChange={(e) => onUpdateField('compareLeftTitle', e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-white mb-1"
                />
                <textarea
                  rows={3}
                  value={currentSlide.compareLeftBody ?? smart.compareLeftBody}
                  onChange={(e) => onUpdateField('compareLeftBody', e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-xs text-slate-300 resize-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 block">Optimized / Modern (Right)</label>
                <input
                  type="text"
                  value={currentSlide.compareRightTitle ?? smart.compareRightTitle}
                  onChange={(e) => onUpdateField('compareRightTitle', e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-white mb-1"
                />
                <textarea
                  rows={3}
                  value={currentSlide.compareRightBody ?? smart.compareRightBody}
                  onChange={(e) => onUpdateField('compareRightBody', e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-lg p-2 text-xs text-slate-300 resize-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ARCHETYPE: BRANDED MEME, HERO IMAGE & AI DIAGRAM STUDIO (Available on both Image & Single-Slide Poster) */}
      {(currentSlide.type === 'image' || currentSlide.type === 'poster') && (
        <div className="pt-3 border-t border-white/[0.08] animate-fade-in">
          <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4" style={{ color: theme.accent }} />
                <div>
                  <span className="text-xs font-bold text-white block">
                    Branded Meme & Hero Image Frame
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    Drop a meme/image, pick a ready preset, or add a @MARROK corner watermark
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Meme / Image</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenAiImageStudio}
                  className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  AI Diagram Studio
                </button>
                <button
                  type="button"
                  onClick={onOpenMediaSearch}
                  className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/40 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Search Web
                </button>
                {currentSlide.imageUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      applySlideBatchUpdates({
                        imageUrl: '',
                        imageFrameMode: 'standard',
                      })
                    }
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold cursor-pointer whitespace-nowrap"
                    title="Clear attached image and return to schematic diagram"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Clear Image</span>
                  </button>
                )}
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageFileUpload(file);
                e.target.value = '';
              }}
            />

            {/* Drag & Drop Upload Zone + Ready Meme Preset Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                  const file = e.dataTransfer?.files?.[0];
                  if (file) handleImageFileUpload(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border border-dashed transition-all cursor-pointer text-center ${
                  isDraggingFile
                    ? 'border-emerald-400 bg-emerald-500/15'
                    : 'border-white/20 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/35'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-white mb-1">
                  <Upload className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                  <span>Drop Meme / Image or Click to Browse</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
                  <ClipboardPaste className="w-3 h-3" />
                  <span>Or press Ctrl+V / Cmd+V to paste from clipboard</span>
                </div>
              </div>

              {/* 1-Click Preset: Attached Expectations vs Reality Meme */}
              <button
                type="button"
                onClick={handleApplyExpectationsMemePreset}
                className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  currentSlide.imageUrl === EXPECTATIONS_VS_REALITY_MEME_URL
                    ? 'bg-white/15 border-white/40 shadow-sm'
                    : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/15'
                }`}
              >
                <img
                  src={EXPECTATIONS_VS_REALITY_MEME_URL}
                  alt="Expectations vs Reality AI Meme"
                  referrerPolicy="no-referrer"
                  className="w-12 h-14 object-cover rounded-lg border border-white/20 bg-white shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[10px] font-mono font-bold uppercase"
                      style={{ color: theme.accent }}
                    >
                      Ready Preset
                    </span>
                    <span className="text-[10px] text-slate-400">·</span>
                    <span className="text-[10px] font-mono text-emerald-300">Hero Meme</span>
                  </div>
                  <div className="text-xs font-bold text-white truncate">
                    Expectations vs. Reality (AI Meme)
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    1-click load with white matte + @MARROK badge
                  </div>
                </div>
              </button>
            </div>

            {/* Frame Size, Matte Backdrop, Fit Mode, Filter & Brand Watermark Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* 1. Frame Size Mode (Full Meme No-Text vs Meme + Text vs Standard Card) */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1 flex items-center gap-1">
                  <Maximize2 className="w-3 h-3 text-slate-400" />
                  <span>Meme Layout & Caption</span>
                </label>
                <div className="grid grid-cols-3 gap-1 bg-black/60 p-0.5 rounded-lg border border-white/10">
                  {(
                    [
                      { id: 'full', label: 'Full Meme', tip: 'Full-height meme with no caption underneath' },
                      { id: 'hero', label: '+ Caption', tip: 'Tall meme card with headline & caption below' },
                      { id: 'standard', label: 'Standard', tip: 'Compact card with full text & takeaways' },
                    ] as const
                  ).map((mode) => {
                    const currentMode =
                      currentSlide.imageFrameMode ||
                      (currentSlide.imageUrl ? 'full' : 'standard');
                    const active = currentMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => onUpdateField('imageFrameMode', mode.id)}
                        title={mode.tip}
                        className={`py-1 rounded-md text-[10px] font-mono font-bold transition-colors cursor-pointer whitespace-nowrap ${
                          active ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                        style={active ? { color: theme.accent } : undefined}
                      >
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Image Fit Mode */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Image Fit Mode</label>
                <div className="grid grid-cols-2 gap-1 bg-black/60 p-0.5 rounded-lg border border-white/10">
                  {(['contain', 'cover'] as const).map((fitMode) => {
                    const active = (currentSlide.imageFit || 'contain') === fitMode;
                    return (
                      <button
                        key={fitMode}
                        type="button"
                        onClick={() => onUpdateField('imageFit', fitMode)}
                        className={`py-1 rounded-md text-[11px] font-mono uppercase font-bold transition-colors cursor-pointer ${
                          active ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {fitMode}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Inner Card Matte Backdrop */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Card Backdrop Matte</label>
                <div className="grid grid-cols-3 gap-1 bg-black/60 p-0.5 rounded-lg border border-white/10">
                  {(
                    [
                      { id: 'white', label: 'White' },
                      { id: 'theme', label: 'Theme' },
                      { id: 'obsidian', label: 'Dark' },
                    ] as const
                  ).map((bgOpt) => {
                    const active = (currentSlide.imageBgStyle || 'theme') === bgOpt.id;
                    return (
                      <button
                        key={bgOpt.id}
                        type="button"
                        onClick={() => onUpdateField('imageBgStyle', bgOpt.id)}
                        className={`py-1 rounded-md text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                          active ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {bgOpt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. MARROK Corner Brand Watermark Overlay */}
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  @MARROK Corner Watermark
                </label>
                <div className="grid grid-cols-4 gap-1 bg-black/60 p-0.5 rounded-lg border border-white/10">
                  {(
                    [
                      { id: 'bottom-right', label: 'B-R' },
                      { id: 'top-right', label: 'T-R' },
                      { id: 'bottom-left', label: 'B-L' },
                      { id: 'none', label: 'Off' },
                    ] as const
                  ).map((wm) => {
                    const defaultWm =
                      currentSlide.imageFrameMode === 'hero' ||
                      (currentSlide.type === 'poster' && currentSlide.imageUrl)
                        ? 'bottom-right'
                        : 'none';
                    const active = (currentSlide.brandWatermark ?? defaultWm) === wm.id;
                    return (
                      <button
                        key={wm.id}
                        type="button"
                        onClick={() => onUpdateField('brandWatermark', wm.id)}
                        className={`py-1 rounded-md text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                          active ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                        style={active ? { color: theme.accent } : undefined}
                        title={`Brand watermark position: ${wm.id}`}
                      >
                        {wm.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Image URL, Color Filter & Caption */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Image URL / Asset Path</label>
                <input
                  type="text"
                  value={currentSlide.imageUrl || ''}
                  onChange={(e) => onUpdateField('imageUrl', e.target.value)}
                  placeholder="/assets/... or https://..."
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Color Filter</label>
                <div className="grid grid-cols-4 gap-1 bg-black/60 p-0.5 rounded-lg border border-white/10">
                  {(
                    [
                      { id: 'clean', label: 'Clean' },
                      { id: 'hud', label: 'HUD' },
                      { id: 'tint', label: 'Tint' },
                      { id: 'invert', label: 'Invert' },
                    ] as const
                  ).map((flt) => {
                    const active = (currentSlide.imageFilter || 'clean') === flt.id;
                    return (
                      <button
                        key={flt.id}
                        type="button"
                        onClick={() => onUpdateField('imageFilter', flt.id)}
                        className={`py-1 rounded-md text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                          active ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {flt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Corner Micro-Caption</label>
                <input
                  type="text"
                  value={currentSlide.imageCaption || ''}
                  onChange={(e) => onUpdateField('imageCaption', e.target.value)}
                  placeholder="e.g. EXPECTATIONS VS. REALITY"
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            {/* Zoom & Pan Framing Controls */}
            {currentSlide.imageUrl && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-white/[0.06]">
                <div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-1">
                    <span>Zoom</span>
                    <span className="text-white tabular-nums">
                      {(currentSlide.imageZoom ?? 1).toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2.5}
                    step={0.05}
                    value={currentSlide.imageZoom ?? 1}
                    onChange={(e) => onUpdateField('imageZoom', parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-1">
                    <span>Pan X</span>
                    <span className="text-white tabular-nums">{currentSlide.imagePanX ?? 0}%</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    step={2}
                    value={currentSlide.imagePanX ?? 0}
                    onChange={(e) => onUpdateField('imagePanX', parseInt(e.target.value, 10))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-1">
                    <span>Pan Y</span>
                    <span className="text-white tabular-nums">{currentSlide.imagePanY ?? 0}%</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    step={2}
                    value={currentSlide.imagePanY ?? 0}
                    onChange={(e) => onUpdateField('imagePanY', parseInt(e.target.value, 10))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ARCHETYPE: CTA (Isometric Emblem, Action Pill, Website URL & Verified Attribution Card) */}
      {currentSlide.type === 'cta' && (
        <div className="pt-3 border-t border-white/[0.08] animate-fade-in">
          <div className="p-3.5 rounded-xl bg-black/50 border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                <span>CTA Closer Emblem & Attribution Card</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">Isometric Closer</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Emblem Brand Wordmark</label>
                <input
                  type="text"
                  value={carousel?.brand || 'MARROK'}
                  onChange={(e) => onUpdateCarouselField?.('brand', e.target.value)}
                  placeholder="MARROK"
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Domain Category Badge</label>
                <input
                  type="text"
                  value={carousel?.category || ''}
                  onChange={(e) => onUpdateCarouselField?.('category', e.target.value)}
                  placeholder="SOFTWARE ARCHITECTURE"
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono uppercase"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Action Pill CTA Button</label>
                <input
                  type="text"
                  value={currentSlide.ctaText || ''}
                  onChange={(e) => onUpdateField('ctaText', e.target.value)}
                  placeholder="Join discussion  •  شارك برأيك"
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 flex items-center gap-1 mb-1">
                  <Globe className="w-3 h-3 text-slate-400" />
                  <span>Website / Profile URL</span>
                </label>
                <input
                  type="text"
                  value={currentSlide.url ?? carousel?.brandUrl ?? 'marrok.org'}
                  onChange={(e) => {
                    onUpdateField('url', e.target.value);
                    onUpdateCarouselField?.('brandUrl', e.target.value);
                  }}
                  placeholder="marrok.org"
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  English Source Attribution Line
                </label>
                <input
                  type="text"
                  value={currentSlide.enCredit || ''}
                  onChange={(e) => onUpdateField('enCredit', e.target.value)}
                  placeholder="Technical Analysis // Engineering Architecture"
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">
                  Arabic Source Attribution Line (RTL)
                </label>
                <input
                  type="text"
                  dir="rtl"
                  value={currentSlide.arCredit || ''}
                  onChange={(e) => onUpdateField('arCredit', e.target.value)}
                  placeholder="توثيق وتحليل تقني // هندسة الأنظمة"
                  className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-arabic"
                />
              </div>
            </div>
          </div>
        </div>
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
