import React from 'react';
import { Plus, Copy, Trash2, ArrowLeft, ArrowRight, LayoutGrid, Wand2 } from 'lucide-react';
import {
  CanvasDimensionPreset,
  CarouselData,
  DiagramVariant,
  HookVariant,
  SlideType,
} from '../../types.ts';
import { getCanvasDimensionSpec } from '../../lib/canvas/constants.ts';
import { StageOverlayMode } from './ViewportCanvas.tsx';

const QUICK_ARCHETYPES: Array<{ id: SlideType; label: string }> = [
  { id: 'hub', label: 'Hub' },
  { id: 'row', label: 'Diagram' },
  { id: 'compare', label: 'Compare' },
  { id: 'code', label: 'Code' },
  { id: 'metric', label: 'Metric' },
  { id: 'number', label: 'Step' },
  { id: 'image', label: 'Media' },
  { id: 'cta', label: 'CTA' },
];

const QUICK_VARIANTS: Array<{ id: DiagramVariant; label: string }> = [
  { id: 'topology', label: 'Topology' },
  { id: 'isolation', label: 'Isolation' },
  { id: 'clusters', label: 'Clusters' },
  { id: 'split', label: 'Hot/Cold' },
  { id: 'features', label: 'Features' },
  { id: 'stack', label: 'Stack' },
  { id: 'graph', label: 'Graph' },
  { id: 'scatter', label: 'Scatter' },
  { id: 'takeaway', label: 'Takeaway' },
];

interface SlideNavigatorProps {
  carousel: CarouselData;
  currentSlideIndex: number;
  showSafeZones?: boolean;
  stageOverlayMode?: StageOverlayMode;
  onSetStageOverlayMode?: (mode: StageOverlayMode) => void;
  onToggleSafeZones?: () => void;
  onSelectDimensionPreset?: (preset: CanvasDimensionPreset) => void;
  onSelectSlide: (index: number) => void;
  onAddSlide: () => void;
  onDuplicateSlide: () => void;
  onDeleteSlide: () => void;
  onMoveSlide: (direction: 'left' | 'right') => void;
  onApplyHookVariant?: (variant: HookVariant) => void;
  onOpenContactSheet?: () => void;
  onSetSlideType?: (type: SlideType) => void;
  onSelectDiagramVariant?: (variant: DiagramVariant) => void;
  onDiversifyDeckVisuals?: () => void;
}

export const SlideNavigator: React.FC<SlideNavigatorProps> = ({
  carousel,
  currentSlideIndex,
  showSafeZones,
  stageOverlayMode,
  onSetStageOverlayMode,
  onToggleSafeZones,
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onMoveSlide,
  onOpenContactSheet,
  onSetSlideType,
  onSelectDiagramVariant,
  onDiversifyDeckVisuals,
}) => {
  const isSinglePost = carousel.postFormat === 'single' || carousel.slides.length === 1;
  const activeSlide = carousel.slides[currentSlideIndex] || carousel.slides[0];
  const overlayMode: StageOverlayMode = stageOverlayMode || (showSafeZones ? 'safe' : 'clean');
  const activeSpec = getCanvasDimensionSpec(carousel.dimensionPreset);
  const isInstagram = activeSpec.platform === 'instagram';

  const handleSelectMode = (mode: StageOverlayMode) => {
    if (onSetStageOverlayMode) {
      onSetStageOverlayMode(mode);
    } else if (onToggleSafeZones) {
      onToggleSafeZones();
    }
  };

  const renderStageToggle = () => (
    <div className="flex items-center gap-0.5 bg-black/70 border border-white/10 rounded-lg p-0.5 text-[11px] font-sans shrink-0">
      <button
        type="button"
        onClick={() => handleSelectMode('clean')}
        className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
          overlayMode === 'clean' ? 'bg-white/20 text-white font-bold' : 'text-slate-400 hover:text-white'
        }`}
        title="Clean preview without overlay"
      >
        Clean
      </button>
      <button
        type="button"
        onClick={() => handleSelectMode('safe')}
        className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
          overlayMode === 'safe'
            ? 'bg-rose-500/25 text-rose-300 font-bold border border-rose-500/40'
            : 'text-slate-400 hover:text-white'
        }`}
        title={`Highlight ${isInstagram ? 'Instagram' : 'TikTok'} safe zone margins`}
      >
        Safe zones
      </button>
      <button
        type="button"
        onClick={() => handleSelectMode('tiktok')}
        className={`px-1.5 py-0.5 rounded cursor-pointer transition-colors whitespace-nowrap ${
          overlayMode === 'tiktok'
            ? 'bg-cyan-500/25 text-cyan-200 font-bold border border-cyan-500/40'
            : 'text-slate-400 hover:text-white'
        }`}
        title={`Simulate realistic ${isInstagram ? 'Instagram' : 'TikTok'} feed icons and chrome`}
      >
        {isInstagram ? 'IG UI' : 'TikTok UI'}
      </button>
    </div>
  );

  if (isSinglePost) {
    return (
      <div className="w-full space-y-1.5">
        <div className="w-full flex items-center justify-between gap-2 text-xs text-slate-300">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-white font-bold">Single Slide</span>
            <span className="text-slate-500">·</span>
            <span className="uppercase text-emerald-300 font-sans font-semibold">
              {activeSlide?.type || 'poster'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenContactSheet && (
              <button
                type="button"
                onClick={onOpenContactSheet}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-[11px] font-sans font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                title="View in All Slides Grid"
              >
                <LayoutGrid className="w-3 h-3 text-cyan-400" />
                <span>Grid</span>
              </button>
            )}
            {renderStageToggle()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-1.5">
      {/* Top Bar: Slide Count, Management Actions & Stage Mode Switcher */}
      <div className="flex items-center justify-between gap-1 text-xs text-slate-400">
        <div className="flex items-center gap-1.5 font-mono tabular-nums min-w-0">
          <span className="text-[11px] whitespace-nowrap shrink-0">
            Slide <span className="text-white font-bold">{currentSlideIndex + 1}</span>/{carousel.slides.length}
          </span>
          <div className="flex items-center gap-0.5 bg-white/[0.03] border border-white/10 rounded-lg p-0.5 shrink-0">
            <button
              type="button"
              onClick={onAddSlide}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-sans font-semibold text-slate-200 hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
              title="Add new slide after this one"
            >
              <Plus className="w-3 h-3 text-emerald-400" />
              <span>Add</span>
            </button>
            <button
              type="button"
              onClick={onDuplicateSlide}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-sans font-semibold text-slate-200 hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
              title="Duplicate this slide" aria-label="Duplicate current slide"
            >
              <Copy className="w-3 h-3 text-cyan-400" />
              <span className="hidden sm:inline">Duplicate</span>
            </button>
            <button
              type="button"
              onClick={onDeleteSlide}
              disabled={carousel.slides.length <= 3}
              className="p-1 rounded text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors cursor-pointer disabled:opacity-30"
              title="Delete slide (minimum 3 slides)" aria-label="Delete current slide"
            >
              <Trash2 className="w-3 h-3" />
            </button>
            <span className="w-px h-3 bg-white/10 mx-0.5" />
            <button
              type="button"
              onClick={() => onMoveSlide('left')}
              disabled={currentSlideIndex === 0}
              className="p-1 rounded text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-20 cursor-pointer"
              title="Move slide earlier in deck" aria-label="Move slide earlier"
            >
              <ArrowLeft className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onMoveSlide('right')}
              disabled={currentSlideIndex === carousel.slides.length - 1}
              className="p-1 rounded text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-20 cursor-pointer"
              title="Move slide later in deck" aria-label="Move slide later"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {onOpenContactSheet && (
            <button
              type="button"
              onClick={onOpenContactSheet}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-[11px] font-sans font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
              title="View all slides in Contact Sheet grid"
            >
              <LayoutGrid className="w-3 h-3 text-cyan-400" />
              <span className="hidden sm:inline">All Slides Grid</span>
              <span className="sm:hidden">Grid</span>
            </button>
          )}
          {renderStageToggle()}
        </div>
      </div>

      {/* Storyboard Strip */}
      <div className="flex items-center gap-1 overflow-x-auto py-0.5">
        {carousel.slides.map((slide, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSelectSlide(idx)}
            className={`h-7 px-2.5 rounded-lg text-[11px] font-mono tabular-nums font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
              idx === currentSlideIndex
                ? 'bg-emerald-500/20 text-white border border-emerald-400/50 shadow-xs'
                : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/[0.06] hover:border-white/15'
            }`}
            title={slide.enTitle || `Slide ${idx + 1}`}
          >
            <span>#{idx + 1}</span>
            <span className={`text-[10px] uppercase font-sans ${idx === currentSlideIndex ? 'text-emerald-300' : 'text-slate-500'}`}>
              {slide.type}
            </span>
          </button>
        ))}
      </div>

      {/* Dynamic Slide Archetype & Graphic Variant Quick Bar */}
      {onSetSlideType && activeSlide && (
        <div className="pt-1 border-t border-white/10 space-y-1">
          <div className="flex items-center justify-between gap-1.5 overflow-x-auto py-0.5">
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[10px] font-mono uppercase text-slate-500 mr-0.5">
                Graphic:
              </span>
              {QUICK_ARCHETYPES.map((arch) => {
                const isSelected = activeSlide.type === arch.id;
                return (
                  <button
                    key={arch.id}
                    type="button"
                    onClick={() => onSetSlideType(arch.id)}
                    className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold transition-colors cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/45'
                        : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/5'
                    }`}
                    title={`Switch Slide ${currentSlideIndex + 1} to ${arch.label} layout`}
                  >
                    {arch.label}
                  </button>
                );
              })}
            </div>

            {onDiversifyDeckVisuals && (
              <button
                type="button"
                onClick={onDiversifyDeckVisuals}
                className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/35 text-[10px] font-sans font-bold text-amber-200 cursor-pointer shrink-0 whitespace-nowrap"
                title="Auto-diversify Slides 2–7 across Compare, Code, Metric, and varied Diagram schematics matched to each slide's copy"
              >
                <Wand2 className="w-2.5 h-2.5" />
                <span>Diversify 2–7</span>
              </button>
            )}
          </div>

          {onSelectDiagramVariant && (activeSlide.type === 'row' || activeSlide.type === 'poster') && (
            <div className="flex items-center gap-1 overflow-x-auto py-0.5">
              <span className="text-[10px] font-mono uppercase text-slate-500 mr-0.5 shrink-0">
                Schematic:
              </span>
              {QUICK_VARIANTS.map((v) => {
                const isSelected = (activeSlide.diagramVariant || 'topology') === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onSelectDiagramVariant(v.id)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/45 font-bold'
                        : 'bg-black/40 text-slate-400 hover:text-white border border-white/5'
                    }`}
                    title={`Switch schematic variant to ${v.label}`}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

