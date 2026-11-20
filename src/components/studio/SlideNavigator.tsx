import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Copy,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Eye,
  ChevronDown,
  Check,
} from 'lucide-react';
import {
  CanvasDimensionPreset,
  CarouselData,
  DiagramVariant,
  HookVariant,
  SlideType,
} from '../../types.ts';
import { getCanvasDimensionSpec } from '../../lib/canvas/constants.ts';
import { StageOverlayMode } from './ViewportCanvas.tsx';

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
}) => {
  const [isGuidesOpen, setIsGuidesOpen] = useState(false);
  const guidesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isGuidesOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (guidesRef.current && !guidesRef.current.contains(e.target as Node)) {
        setIsGuidesOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsGuidesOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isGuidesOpen]);

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
    setIsGuidesOpen(false);
  };

  const activeGuideLabel =
    overlayMode === 'safe'
      ? 'Safe Zones'
      : overlayMode === 'tiktok'
      ? isInstagram
        ? 'IG UI'
        : 'TikTok UI'
      : 'Guides';

  const renderGuidesPopover = () => (
    <div className="relative shrink-0" ref={guidesRef} data-testid="stage-overlay-mode-bar">
      <button
        type="button"
        data-testid="stage-guides-menu-btn"
        onClick={() => setIsGuidesOpen((prev) => !prev)}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
          overlayMode !== 'clean'
            ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
            : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.08] text-slate-300 hover:text-white'
        }`}
        aria-expanded={isGuidesOpen}
        title="Canvas preview overlay (Clean, Safe Zones, Platform UI)"
      >
        <Eye className="w-3 h-3 shrink-0" />
        <span>{activeGuideLabel}</span>
        <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
      </button>

      {isGuidesOpen && (
        <div className="absolute right-0 bottom-full mb-1.5 w-44 rounded-xl bg-[#0c1218] border border-white/12 shadow-2xl p-1 z-50 space-y-0.5 text-xs">
          <button
            type="button"
            data-testid="stage-mode-clean-btn"
            onClick={() => handleSelectMode('clean')}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-slate-200 transition-colors cursor-pointer text-left"
          >
            <span>Clean Preview</span>
            {overlayMode === 'clean' && <Check className="w-3.5 h-3.5 text-cyan-300" />}
          </button>
          <button
            type="button"
            data-testid="toggle-tiktok-safe-zones-btn"
            onClick={() => handleSelectMode(overlayMode === 'safe' ? 'clean' : 'safe')}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-slate-200 transition-colors cursor-pointer text-left"
          >
            <span>Safe Zones</span>
            {overlayMode === 'safe' && <Check className="w-3.5 h-3.5 text-rose-300" />}
          </button>
          <button
            type="button"
            data-testid="stage-mode-tiktok-btn"
            onClick={() => handleSelectMode(overlayMode === 'tiktok' ? 'clean' : 'tiktok')}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-white/[0.08] text-slate-200 transition-colors cursor-pointer text-left"
          >
            <span>{isInstagram ? 'Instagram UI' : 'TikTok UI'}</span>
            {overlayMode === 'tiktok' && <Check className="w-3.5 h-3.5 text-cyan-300" />}
          </button>
        </div>
      )}
    </div>
  );

  if (isSinglePost) {
    return (
      <div className="w-full flex items-center justify-between gap-2 text-xs text-slate-400">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-slate-200 font-medium">
            {carousel.postFormat === 'meme' ? 'Meme Post' : 'Single Slide'}
          </span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="capitalize text-slate-400 truncate">
            {activeSlide?.type || 'poster'}
          </span>
        </div>
        {renderGuidesPopover()}
      </div>
    );
  }

  return (
    <div className="w-full space-y-1.5">
      {/* Compact Slide Controls + Guides Dropdown */}
      <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
        <div className="flex items-center gap-1.5 font-mono tabular-nums shrink-0">
          <span className="text-[11px] whitespace-nowrap">
            <span className="text-white font-semibold">{currentSlideIndex + 1}</span>
            <span className="text-slate-500">/{carousel.slides.length}</span>
          </span>

          <div className="flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.08] rounded-lg p-0.5 shrink-0">
            <button
              type="button"
              onClick={onAddSlide}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-sans font-medium text-slate-200 hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
              title="Add new slide after this one"
            >
              <Plus className="w-3 h-3 text-emerald-400" />
              <span>Add</span>
            </button>
            <button
              type="button"
              onClick={onDuplicateSlide}
              className="p-1 rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Duplicate this slide"
              aria-label="Duplicate current slide"
            >
              <Copy className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={onDeleteSlide}
              disabled={carousel.slides.length <= 3}
              className="hidden sm:inline-flex p-1 rounded text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors cursor-pointer disabled:opacity-30"
              title="Delete slide (minimum 3 slides)"
              aria-label="Delete current slide"
            >
              <Trash2 className="w-3 h-3" />
            </button>
            <span className="hidden sm:inline-block w-px h-3 bg-white/10 mx-0.5" />
            <button
              type="button"
              onClick={() => onMoveSlide('left')}
              disabled={currentSlideIndex === 0}
              className="hidden sm:inline-flex p-1 rounded text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-20 cursor-pointer"
              title="Move slide earlier in deck"
              aria-label="Move slide earlier"
            >
              <ArrowLeft className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onMoveSlide('right')}
              disabled={currentSlideIndex === carousel.slides.length - 1}
              className="hidden sm:inline-flex p-1 rounded text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-20 cursor-pointer"
              title="Move slide later in deck"
              aria-label="Move slide later"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {renderGuidesPopover()}
      </div>

      {/* Storyboard Strip */}
      <div className="flex items-center gap-1 overflow-x-auto py-0.5 no-scrollbar">
        {carousel.slides.map((slide, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSelectSlide(idx)}
            className={`h-7 px-2.5 rounded-lg text-[11px] font-mono tabular-nums font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1 ${
              idx === currentSlideIndex
                ? 'bg-white/15 text-white border border-white/25'
                : 'bg-white/[0.02] text-slate-400 hover:text-white border border-white/[0.06] hover:border-white/15'
            }`}
            title={slide.enTitle || `Slide ${idx + 1}`}
          >
            <span>{idx + 1}</span>
            <span className={`text-[10px] capitalize font-sans ${idx === currentSlideIndex ? 'text-slate-200' : 'text-slate-500'}`}>
              {slide.type}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
