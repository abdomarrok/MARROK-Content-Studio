import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Palette,
  Maximize2,
  Layers,
  Code,
  GitCompare,
  Gauge,
  Hash,
} from 'lucide-react';
import {
  CanvasDimensionPreset,
  CarouselData,
  DEFAULT_PALETTES,
  DiagramNode,
  DiagramVariant,
  SlideData,
  SlideType,
  ThemePalette,
} from '../../../types.ts';
import { renderSlideToCanvas } from '../../../lib/canvas/renderSlide.ts';
import { getCanvasDimensionSpec } from '../../../lib/canvas/constants.ts';
import { CHAR_LIMITS, SINGLE_SLIDE_CHAR_LIMITS } from '../../../lib/qaChecks.ts';
import {
  autoFitSlideCopyToLimits,
  autoSyncSlideGraphicsFromCopy,
  resolveSmartSlideVisuals,
  seedSlideArchetypeData,
} from '../../../lib/synthesizer.ts';
import { GatheredCandidatePost } from '../../../lib/gather/gatherClient.ts';

const ARCHETYPE_OPTIONS: Array<{
  id: SlideType;
  label: string;
  shortLabel: string;
}> = [
  { id: 'hub', label: 'Hub Network', shortLabel: 'Hub' },
  { id: 'row', label: 'Schematic', shortLabel: 'Diagram' },
  { id: 'compare', label: 'Compare A/B', shortLabel: 'Compare' },
  { id: 'code', label: 'Code Diff', shortLabel: 'Code' },
  { id: 'metric', label: 'Hard Metric', shortLabel: 'Metric' },
  { id: 'number', label: 'Step Number', shortLabel: 'Step #' },
  { id: 'image', label: 'Media Card', shortLabel: 'Media' },
  { id: 'cta', label: 'Outro CTA', shortLabel: 'CTA' },
];

const DIAGRAM_VARIANT_OPTIONS: Array<{
  id: DiagramVariant;
  label: string;
}> = [
  { id: 'topology', label: 'Pipeline' },
  { id: 'isolation', label: 'Sandbox' },
  { id: 'clusters', label: 'Mesh' },
  { id: 'split', label: 'Split' },
  { id: 'graph', label: 'Latency' },
  { id: 'features', label: 'Pillars' },
  { id: 'stack', label: 'Layers' },
  { id: 'scatter', label: 'Matrix' },
  { id: 'takeaway', label: 'Verdict' },
];

const ASPECT_RATIO_OPTIONS: Array<{
  id: CanvasDimensionPreset;
  label: string;
}> = [
  { id: 'tiktok-9:16', label: '9:16 TikTok' },
  { id: 'ig-4:5', label: '4:5 IG' },
  { id: 'ig-3:4', label: '3:4 IG' },
  { id: 'ig-1:1', label: '1:1 Square' },
];

function getArchetypeBadgeStyle(type: SlideType): string {
  switch (type) {
    case 'hub':
      return 'text-cyan-300 bg-cyan-500/15 border-cyan-400/30';
    case 'compare':
      return 'text-amber-300 bg-amber-500/15 border-amber-400/30';
    case 'code':
      return 'text-purple-300 bg-purple-500/15 border-purple-400/30';
    case 'metric':
      return 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30';
    case 'number':
      return 'text-blue-300 bg-blue-500/15 border-blue-400/30';
    case 'cta':
      return 'text-rose-300 bg-rose-500/15 border-rose-400/30';
    default:
      return 'text-slate-200 bg-white/10 border-white/15';
  }
}

interface SlideThumbnailCanvasProps {
  deck: CarouselData;
  slideIndex: number;
  palette: ThemePalette;
  isActive: boolean;
  onSelect: () => void;
}

const SlideThumbnailCanvas: React.FC<SlideThumbnailCanvasProps> = ({
  deck,
  slideIndex,
  palette,
  isActive,
  onSelect,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const slide = deck.slides[slideIndex];
  const spec = getCanvasDimensionSpec(deck.dimensionPreset);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas || !slide) return;

    const timer = setTimeout(() => {
      if (cancelled) return;
      renderSlideToCanvas(deck, slideIndex, canvas, palette).catch(() => {
        // Ignore offscreen/jsdom canvas context fallback in headless unit tests
      });
    }, 30);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deck, slide, slideIndex, palette]);

  if (!slide) return null;

  return (
    <button
      type="button"
      data-testid={`candidate-thumb-slide-${slideIndex}`}
      onClick={onSelect}
      className={`group relative rounded-lg overflow-hidden border transition-all cursor-pointer shrink-0 flex flex-col bg-[#070c10] ${
        isActive
          ? 'border-cyan-400 ring-2 ring-cyan-400/30 scale-[1.02]'
          : 'border-white/15 hover:border-white/35 opacity-80 hover:opacity-100'
      }`}
      style={{ width: 64 }}
      title={`Slide ${slideIndex + 1} (${slide.type.toUpperCase()}): ${slide.enTitle || ''}`}
    >
      <div
        className="w-full relative overflow-hidden bg-[#060a0e]"
        style={{
          aspectRatio: `${spec.width} / ${spec.height}`,
        }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain block"
        />
        <span className="absolute top-1 left-1 px-1 py-0.2 rounded bg-black/80 text-[9px] font-mono tabular-nums font-bold text-white border border-white/15">
          S{slideIndex + 1}
        </span>
      </div>
      <div className="px-1 py-0.5 bg-black/90 w-full text-center border-t border-white/10">
        <span className="text-[9px] font-mono uppercase text-slate-300 truncate block">
          {slide.type === 'row' && slide.diagramVariant
            ? slide.diagramVariant.slice(0, 6)
            : slide.type}
        </span>
      </div>
    </button>
  );
};

export interface CandidateSlideStoryboardStripProps {
  slides: SlideData[];
  isExpanded: boolean;
  activeSlideIdx: number;
  onSelectSlide: (idx: number) => void;
}

export const CandidateSlideStoryboardStrip: React.FC<
  CandidateSlideStoryboardStripProps
> = ({ slides, isExpanded, activeSlideIdx, onSelectSlide }) => {
  return (
    <div
      data-testid="candidate-storyboard-strip"
      className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5 pt-1"
    >
      {slides.map((slide, sIdx) => {
        const isCurrent = isExpanded && activeSlideIdx === sIdx;
        const badgeClass = getArchetypeBadgeStyle(slide.type);
        const variantLabel =
          slide.type === 'row' && slide.diagramVariant
            ? ` · ${slide.diagramVariant}`
            : '';

        return (
          <button
            key={sIdx}
            type="button"
            data-testid={`storyboard-chip-s${sIdx + 1}`}
            onClick={() => onSelectSlide(sIdx)}
            className={`text-left p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-1 min-w-0 ${
              isCurrent
                ? 'bg-cyan-500/15 border-cyan-400/60 shadow-xs'
                : 'bg-black/40 hover:bg-white/[0.05] border-white/10 hover:border-white/25'
            }`}
            title={`Click to preview & edit Slide ${sIdx + 1}: ${slide.enTitle || ''}`}
          >
            <div className="flex items-center justify-between gap-1 w-full">
              <span
                className={`text-[10px] font-mono tabular-nums font-extrabold ${
                  isCurrent ? 'text-cyan-200' : 'text-slate-300'
                }`}
              >
                S{sIdx + 1}
              </span>
              <span
                className={`px-1.5 py-0.2 rounded text-[9px] font-mono uppercase border truncate max-w-[90px] ${badgeClass}`}
              >
                {slide.type}
                {variantLabel}
              </span>
            </div>
            <div className="text-[11px] font-semibold text-slate-200 truncate w-full">
              {slide.enTitle || `Slide ${sIdx + 1}`}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export interface CandidateSlidePreviewInspectorProps {
  candidate: GatheredCandidatePost;
  activeSlideIdx: number;
  onSetActiveSlideIdx: (idx: number) => void;
  onUpdateCandidateDeck: (
    candidateId: string,
    updater: (prev: GatheredCandidatePost) => GatheredCandidatePost
  ) => void;
  onRegenerateSingleSlide?: (
    candidate: GatheredCandidatePost,
    slideIndex: number
  ) => void;
  isRegeneratingSlide?: boolean;
  onShowToast: (msg: string) => void;
}

export const CandidateSlidePreviewInspector: React.FC<
  CandidateSlidePreviewInspectorProps
> = ({
  candidate,
  activeSlideIdx,
  onSetActiveSlideIdx,
  onUpdateCandidateDeck,
  onRegenerateSingleSlide,
  isRegeneratingSlide = false,
  onShowToast,
}) => {
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showCaptionEditor, setShowCaptionEditor] = useState(false);

  const slides = candidate.deck.slides || [];
  const safeIdx = Math.min(activeSlideIdx, Math.max(0, slides.length - 1));
  const activeSlide = slides[safeIdx];

  const paletteId = candidate.themeId || candidate.deck.theme || 'teal';
  const palette: ThemePalette =
    DEFAULT_PALETTES[paletteId] || DEFAULT_PALETTES.teal;
  const dimensionPreset: CanvasDimensionPreset =
    candidate.deck.dimensionPreset || 'tiktok-9:16';
  const spec = getCanvasDimensionSpec(dimensionPreset);

  const isSingle =
    candidate.deck.postFormat === 'single' ||
    slides.length === 1 ||
    activeSlide?.type === 'poster';
  const limits = isSingle ? SINGLE_SLIDE_CHAR_LIMITS : CHAR_LIMITS;
  const isHook = safeIdx === 0 && activeSlide?.type === 'hub';
  const enTitleLimit = isHook ? limits.hookTitle : limits.enTitle;

  // Keyboard Left / Right arrow navigation when inspector is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onSetActiveSlideIdx(Math.max(0, safeIdx - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onSetActiveSlideIdx(Math.min(slides.length - 1, safeIdx + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [safeIdx, slides.length, onSetActiveSlideIdx]);

  // Render active slide to the live preview canvas
  useEffect(() => {
    let cancelled = false;
    const canvas = mainCanvasRef.current;
    if (!canvas || !activeSlide) return;

    const timer = setTimeout(() => {
      if (cancelled) return;
      renderSlideToCanvas(candidate.deck, safeIdx, canvas, palette).catch(() => {
        // Safe no-op in headless test environments without 2D canvas
      });
    }, 45);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [candidate.deck, activeSlide, safeIdx, palette, dimensionPreset]);

  if (!activeSlide) return null;

  const smartDefaults = resolveSmartSlideVisuals(activeSlide, safeIdx, false);
  const currentNodes: DiagramNode[] =
    activeSlide.diagramNodes && activeSlide.diagramNodes.length >= 3
      ? activeSlide.diagramNodes
      : smartDefaults.diagramNodes;
  const currentEdges: [string, string] =
    activeSlide.diagramEdges && activeSlide.diagramEdges.length >= 2
      ? [activeSlide.diagramEdges[0], activeSlide.diagramEdges[1]]
      : smartDefaults.diagramEdges;

  const updateActiveSlide = (
    patch: Partial<SlideData>,
    options?: { autoSyncGraphics?: boolean }
  ) => {
    onUpdateCandidateDeck(candidate.id, (prev) => {
      const nextSlides = [...(prev.deck.slides || [])];
      if (!nextSlides[safeIdx]) return prev;
      const merged: SlideData = {
        ...nextSlides[safeIdx],
        ...patch,
      };
      nextSlides[safeIdx] = options?.autoSyncGraphics
        ? autoSyncSlideGraphicsFromCopy(merged, safeIdx)
        : merged;

      const nextDraftTitle =
        safeIdx === 0 && patch.enTitle !== undefined
          ? patch.enTitle
          : prev.draftTitle;
      return {
        ...prev,
        draftTitle: nextDraftTitle,
        deck: {
          ...prev.deck,
          title: nextDraftTitle,
          slides: nextSlides,
        },
      };
    });
  };

  const handleAutoFitActiveSlideOnBlur = () => {
    const fitted = autoFitSlideCopyToLimits(activeSlide, safeIdx, isSingle);
    if (
      fitted.enTitle !== activeSlide.enTitle ||
      fitted.arTitle !== activeSlide.arTitle ||
      fitted.enBody !== activeSlide.enBody ||
      fitted.arBody !== activeSlide.arBody
    ) {
      updateActiveSlide(
        {
          enTitle: fitted.enTitle,
          arTitle: fitted.arTitle,
          enBody: fitted.enBody,
          arBody: fitted.arBody,
        },
        { autoSyncGraphics: true }
      );
    }
  };

  const handleSwitchArchetype = (newType: SlideType) => {
    onUpdateCandidateDeck(candidate.id, (prev) => {
      const nextSlides = [...(prev.deck.slides || [])];
      if (nextSlides[safeIdx]) {
        nextSlides[safeIdx] = seedSlideArchetypeData(
          nextSlides[safeIdx],
          newType,
          safeIdx,
          true
        );
      }
      return {
        ...prev,
        deck: { ...prev.deck, slides: nextSlides },
      };
    });
    onShowToast(`Switched Slide ${safeIdx + 1} to ${newType.toUpperCase()}`);
  };

  const handleSwitchVariant = (newVariant: DiagramVariant) => {
    const smart = resolveSmartSlideVisuals(
      { ...activeSlide, diagramVariant: newVariant },
      safeIdx,
      true
    );
    updateActiveSlide({
      diagramVariant: newVariant,
      diagramNodes: smart.diagramNodes,
      diagramEdges: smart.diagramEdges,
      diagramFooter: smart.diagramFooter,
    });
    onShowToast(`Switched schematic layout to ${newVariant.toUpperCase()}`);
  };

  const handleChangeTheme = (newThemeId: string) => {
    onUpdateCandidateDeck(candidate.id, (prev) => ({
      ...prev,
      themeId: newThemeId,
      deck: {
        ...prev.deck,
        theme: newThemeId,
      },
    }));
    const pName = DEFAULT_PALETTES[newThemeId]?.name || newThemeId;
    onShowToast(`Switched post theme to ${pName}`);
  };

  const handleChangeDimensionPreset = (preset: CanvasDimensionPreset) => {
    onUpdateCandidateDeck(candidate.id, (prev) => ({
      ...prev,
      deck: {
        ...prev.deck,
        dimensionPreset: preset,
      },
    }));
  };

  const enTitleLen = (activeSlide.enTitle || '').trim().length;
  const arTitleLen = (activeSlide.arTitle || '').trim().length;
  const enBodyLen = (activeSlide.enBody || '').trim().length;
  const arBodyLen = (activeSlide.arBody || '').trim().length;

  return (
    <div
      data-testid="candidate-slide-preview-inspector"
      className="p-4 rounded-2xl border border-cyan-400/30 bg-[#070c10]/95 space-y-4 animate-fade-in"
    >
      {/* Top Bar: Theme Palette + Aspect Ratio + Single-Slide AI Regenerate + Diversify */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-white/10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold text-white flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              Live Slide Preview & Inspector — Slide {safeIdx + 1} of{' '}
              {slides.length}
            </span>
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            (Use ← / → arrow keys to navigate)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Theme Palette Selector */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/70 border border-white/15">
            <Palette
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: palette.accent }}
            />
            <select
              aria-label="Slide Theme Palette"
              data-testid="candidate-theme-select"
              value={palette.id}
              onChange={(e) => handleChangeTheme(e.target.value)}
              className="bg-transparent text-[11px] font-mono text-slate-200 focus:outline-none cursor-pointer"
            >
              {Array.from(
                new Map(
                  Object.values(DEFAULT_PALETTES).map((p) => [p.id, p])
                ).values()
              ).map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-950 text-white">
                  Theme: {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Aspect Ratio Segmented Selector */}
          <div
            data-testid="candidate-aspect-ratio-group"
            className="flex items-center gap-0.5 p-0.5 rounded-lg bg-black/70 border border-white/15"
          >
            <Maximize2 className="w-3 h-3 text-slate-400 ml-1.5 mr-1 shrink-0" />
            {ASPECT_RATIO_OPTIONS.map((opt) => {
              const active = dimensionPreset === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`aspect-ratio-btn-${opt.id}`}
                  onClick={() => handleChangeDimensionPreset(opt.id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* 1-Click Regenerate Single Slide with AI */}
          {onRegenerateSingleSlide && (
            <button
              type="button"
              data-testid="regenerate-single-slide-btn"
              disabled={isRegeneratingSlide}
              onClick={() => onRegenerateSingleSlide(candidate, safeIdx)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-[11px] font-bold text-cyan-200 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              title="Re-synthesize only this slide from the source article with AI"
            >
              <RefreshCw
                className={`w-3 h-3 ${isRegeneratingSlide ? 'animate-spin' : ''}`}
              />
              <span>
                {isRegeneratingSlide
                  ? `Regenerating S${safeIdx + 1}...`
                  : `Regenerate S${safeIdx + 1} with AI`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Main Split Grid: Left = Live Canvas Stage + 8-Slide Thumb Strip | Right = Copy + Graphic Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT PANE: LIVE CANVAS PREVIEW + PREV/NEXT + THUMBNAIL STRIP */}
        <div className="lg:col-span-5 flex flex-col items-center bg-black/60 border border-white/10 rounded-xl p-3 space-y-3">
          {/* Canvas Navigation Header */}
          <div className="w-full flex items-center justify-between gap-2">
            <button
              type="button"
              data-testid="preview-prev-slide-btn"
              disabled={safeIdx === 0}
              onClick={() => onSetActiveSlideIdx(Math.max(0, safeIdx - 1))}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 disabled:opacity-30 cursor-pointer"
              title="Previous Slide (Left Arrow)"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            <div className="text-center">
              <span className="text-xs font-mono tabular-nums font-bold text-white">
                Slide {safeIdx + 1} / {slides.length}
              </span>
              <span className="block text-[10px] font-mono uppercase text-cyan-300">
                {activeSlide.type}
                {activeSlide.type === 'row' && activeSlide.diagramVariant
                  ? ` · ${activeSlide.diagramVariant}`
                  : ''}{' '}
                · {spec.aspectRatioLabel}
              </span>
            </div>

            <button
              type="button"
              data-testid="preview-next-slide-btn"
              disabled={safeIdx >= slides.length - 1}
              onClick={() =>
                onSetActiveSlideIdx(Math.min(slides.length - 1, safeIdx + 1))
              }
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 disabled:opacity-30 cursor-pointer"
              title="Next Slide (Right Arrow)"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Live 1080x1920 / 1080x1350 Scaled Canvas Container */}
          <div className="relative w-full flex items-center justify-center bg-[#05080c] rounded-xl border border-white/10 p-2 overflow-hidden">
            <div
              className="relative w-full max-w-[270px] rounded-lg overflow-hidden shadow-2xl border border-white/15"
              style={{
                aspectRatio: `${spec.width} / ${spec.height}`,
              }}
            >
              <canvas
                ref={mainCanvasRef}
                data-testid="candidate-live-preview-canvas"
                className="w-full h-full object-contain block"
              />
              {isRegeneratingSlide && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-cyan-200 text-xs font-mono">
                  <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                  <span>Synthesizing Slide {safeIdx + 1}...</span>
                </div>
              )}
            </div>
          </div>

          {/* 8-Slide Visual Canvas Thumbnail Strip */}
          <div className="w-full space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-0.5">
              <span>ALL SLIDES VISUAL STRIP</span>
              <span>Click any slide to inspect</span>
            </div>
            <div
              data-testid="candidate-thumbnail-strip"
              className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5"
            >
              {slides.map((_, sIdx) => (
                <SlideThumbnailCanvas
                  key={sIdx}
                  deck={candidate.deck}
                  slideIndex={sIdx}
                  palette={palette}
                  isActive={sIdx === safeIdx}
                  onSelect={() => onSetActiveSlideIdx(sIdx)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT PANE: ARCHETYPE PILLS + BILINGUAL COPY + DYNAMIC GRAPHIC FIELDS */}
        <div className="lg:col-span-7 space-y-3.5">
          {/* Archetype & Schematic Variant Selector Box */}
          <div className="p-3 rounded-xl bg-black/50 border border-white/10 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-mono uppercase font-bold text-cyan-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>Slide {safeIdx + 1} Visual Archetype</span>
              </span>

              <span
                data-testid="candidate-auto-sync-status"
                className="text-[10px] font-mono text-emerald-300/90"
              >
                Auto-syncs graphics & fits limits as you type
              </span>
            </div>

            {/* Archetype Selector Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {ARCHETYPE_OPTIONS.map((arch) => {
                const active = activeSlide.type === arch.id;
                return (
                  <button
                    key={arch.id}
                    type="button"
                    data-testid={`candidate-arch-pill-${arch.id}`}
                    onClick={() => handleSwitchArchetype(arch.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/50 shadow-xs'
                        : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/10'
                    }`}
                  >
                    {arch.label}
                  </button>
                );
              })}
            </div>

            {/* 9 Schematic Variants when Row or Poster is selected */}
            {(activeSlide.type === 'row' || activeSlide.type === 'poster') && (
              <div className="pt-2 border-t border-white/10 space-y-1.5">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">
                  Diagram Schematic Engine (9 Layouts):
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  {DIAGRAM_VARIANT_OPTIONS.map((v) => {
                    const active =
                      (activeSlide.diagramVariant || 'topology') === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        data-testid={`candidate-variant-pill-${v.id}`}
                        onClick={() => handleSwitchVariant(v.id)}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/50 font-bold'
                            : 'bg-black/50 text-slate-400 hover:text-white border border-white/10'
                        }`}
                      >
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Bilingual Slide Headlines & Bullet Copy */}
          <div className="p-3 rounded-xl bg-black/50 border border-white/10 space-y-2.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400">
                    English Slide Title
                  </label>
                  <span
                    className={`text-[10px] font-mono tabular-nums ${
                      enTitleLen > enTitleLimit
                        ? 'text-amber-400 font-bold'
                        : 'text-slate-500'
                    }`}
                  >
                    {enTitleLen}/{enTitleLimit}
                  </span>
                </div>
                <input
                  type="text"
                  data-testid="candidate-en-title-input"
                  value={activeSlide.enTitle || ''}
                  onChange={(e) =>
                    updateActiveSlide(
                      { enTitle: e.target.value },
                      { autoSyncGraphics: true }
                    )
                  }
                  onBlur={handleAutoFitActiveSlideOnBlur}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-black/80 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400">
                    Arabic Slide Title (RTL)
                  </label>
                  <span
                    className={`text-[10px] font-mono tabular-nums ${
                      arTitleLen > limits.arTitle
                        ? 'text-amber-400 font-bold'
                        : 'text-slate-500'
                    }`}
                  >
                    {arTitleLen}/{limits.arTitle}
                  </span>
                </div>
                <input
                  type="text"
                  dir="rtl"
                  data-testid="candidate-ar-title-input"
                  value={activeSlide.arTitle || ''}
                  onChange={(e) =>
                    updateActiveSlide(
                      { arTitle: e.target.value },
                      { autoSyncGraphics: true }
                    )
                  }
                  onBlur={handleAutoFitActiveSlideOnBlur}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-black/80 border border-white/15 text-xs text-white font-arabic focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400">
                    English Bullet Copy
                  </label>
                  <span
                    className={`text-[10px] font-mono tabular-nums ${
                      enBodyLen > limits.enBody
                        ? 'text-amber-400 font-bold'
                        : 'text-slate-500'
                    }`}
                  >
                    {enBodyLen}/{limits.enBody}
                  </span>
                </div>
                <textarea
                  rows={2}
                  data-testid="candidate-en-body-input"
                  value={activeSlide.enBody || ''}
                  onChange={(e) =>
                    updateActiveSlide(
                      { enBody: e.target.value },
                      { autoSyncGraphics: true }
                    )
                  }
                  onBlur={handleAutoFitActiveSlideOnBlur}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-black/80 border border-white/15 text-xs text-slate-200 resize-none focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400">
                    Arabic Bullet Copy (RTL)
                  </label>
                  <span
                    className={`text-[10px] font-mono tabular-nums ${
                      arBodyLen > limits.arBody
                        ? 'text-amber-400 font-bold'
                        : 'text-slate-500'
                    }`}
                  >
                    {arBodyLen}/{limits.arBody}
                  </span>
                </div>
                <textarea
                  rows={2}
                  dir="rtl"
                  data-testid="candidate-ar-body-input"
                  value={activeSlide.arBody || ''}
                  onChange={(e) =>
                    updateActiveSlide(
                      { arBody: e.target.value },
                      { autoSyncGraphics: true }
                    )
                  }
                  onBlur={handleAutoFitActiveSlideOnBlur}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-black/80 border border-white/15 text-xs text-slate-200 font-arabic resize-none focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* Dynamic Archetype Graphic Inspector (Nodes / Compare / Code / Metric / Step / Hub) */}
          {activeSlide.type !== 'cta' && (
            <div
              data-testid="candidate-graphic-fields-editor"
              className="p-3 rounded-xl bg-black/50 border border-white/10 space-y-2.5"
            >
              {/* ROW / POSTER: 3-Node Schematic Editor */}
              {(activeSlide.type === 'row' || activeSlide.type === 'poster') && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase font-bold text-emerald-300">
                      Schematic Diagram Nodes & Telemetry Labels
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      Updates live on canvas
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[0, 1, 2].map((nIdx) => {
                      const node = currentNodes[nIdx] || {
                        label: `Stage 0${nIdx + 1}`,
                        sublabel: '',
                        status: 'ACTIVE',
                      };
                      return (
                        <div
                          key={nIdx}
                          className="p-2 rounded-lg bg-black/70 border border-white/10 space-y-1.5"
                        >
                          <span className="text-[10px] font-mono text-cyan-300 font-bold block">
                            Node {nIdx + 1}
                          </span>
                          <input
                            type="text"
                            aria-label={`Diagram Node ${nIdx + 1} Label`}
                            value={node.label || ''}
                            onChange={(e) => {
                              const nextNodes = currentNodes.map((item, idx) =>
                                idx === nIdx
                                  ? { ...item, label: e.target.value }
                                  : item
                              );
                              updateActiveSlide({ diagramNodes: nextNodes });
                            }}
                            placeholder={`Node ${nIdx + 1} Title`}
                            className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-xs text-white font-semibold focus:outline-none focus:border-cyan-400"
                          />
                          <input
                            type="text"
                            aria-label={`Diagram Node ${nIdx + 1} Sublabel`}
                            value={node.sublabel || ''}
                            onChange={(e) => {
                              const nextNodes = currentNodes.map((item, idx) =>
                                idx === nIdx
                                  ? { ...item, sublabel: e.target.value }
                                  : item
                              );
                              updateActiveSlide({ diagramNodes: nextNodes });
                            }}
                            placeholder="Sublabel detail"
                            className="w-full px-2 py-1 rounded bg-black/80 border border-white/10 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-400"
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">
                        Edge 1 → 2 Label
                      </label>
                      <input
                        type="text"
                        value={currentEdges[0] || ''}
                        onChange={(e) =>
                          updateActiveSlide({
                            diagramEdges: [e.target.value, currentEdges[1]],
                          })
                        }
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-[11px] font-mono text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">
                        Edge 2 → 3 Label
                      </label>
                      <input
                        type="text"
                        value={currentEdges[1] || ''}
                        onChange={(e) =>
                          updateActiveSlide({
                            diagramEdges: [currentEdges[0], e.target.value],
                          })
                        }
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-[11px] font-mono text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">
                        Diagram Footer Bar
                      </label>
                      <input
                        type="text"
                        value={
                          activeSlide.diagramFooter ?? smartDefaults.diagramFooter
                        }
                        onChange={(e) =>
                          updateActiveSlide({ diagramFooter: e.target.value })
                        }
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-[11px] font-mono text-slate-200"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* COMPARE: Left vs Right Cards */}
              {activeSlide.type === 'compare' && (
                <div className="space-y-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-amber-300 flex items-center gap-1.5">
                    <GitCompare className="w-3.5 h-3.5" />
                    <span>Compare A/B Cards (Before vs. After / Trade-off)</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="p-2.5 rounded-lg bg-black/70 border border-rose-500/25 space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-rose-300 block">
                        Left Card (Legacy / Bottleneck)
                      </label>
                      <input
                        type="text"
                        aria-label="Compare Left Title"
                        value={
                          activeSlide.compareLeftTitle ??
                          smartDefaults.compareLeftTitle
                        }
                        onChange={(e) =>
                          updateActiveSlide({ compareLeftTitle: e.target.value })
                        }
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-xs font-bold text-white"
                      />
                      <textarea
                        rows={3}
                        aria-label="Compare Left Body"
                        value={
                          activeSlide.compareLeftBody ??
                          smartDefaults.compareLeftBody
                        }
                        onChange={(e) =>
                          updateActiveSlide({ compareLeftBody: e.target.value })
                        }
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-[11px] text-slate-300 resize-none"
                      />
                    </div>

                    <div className="p-2.5 rounded-lg bg-black/70 border border-emerald-500/25 space-y-1.5">
                      <label className="text-[10px] font-mono uppercase text-emerald-300 block">
                        Right Card (Engineered / Target)
                      </label>
                      <input
                        type="text"
                        aria-label="Compare Right Title"
                        value={
                          activeSlide.compareRightTitle ??
                          smartDefaults.compareRightTitle
                        }
                        onChange={(e) =>
                          updateActiveSlide({ compareRightTitle: e.target.value })
                        }
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-xs font-bold text-white"
                      />
                      <textarea
                        rows={3}
                        aria-label="Compare Right Body"
                        value={
                          activeSlide.compareRightBody ??
                          smartDefaults.compareRightBody
                        }
                        onChange={(e) =>
                          updateActiveSlide({ compareRightBody: e.target.value })
                        }
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-[11px] text-slate-300 resize-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* CODE: File Name, Language & Snippet */}
              {activeSlide.type === 'code' && (
                <div className="space-y-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-purple-300 flex items-center gap-1.5">
                    <Code className="w-3.5 h-3.5" />
                    <span>Terminal / Code Diff Card</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">
                        File Name Header
                      </label>
                      <input
                        type="text"
                        aria-label="Code File Name"
                        value={
                          activeSlide.codeFileName ?? smartDefaults.codeFileName
                        }
                        onChange={(e) =>
                          updateActiveSlide({ codeFileName: e.target.value })
                        }
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-xs font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">
                        Language Tag
                      </label>
                      <input
                        type="text"
                        aria-label="Code Language"
                        value={
                          activeSlide.codeLanguage ?? smartDefaults.codeLanguage
                        }
                        onChange={(e) =>
                          updateActiveSlide({ codeLanguage: e.target.value })
                        }
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-xs font-mono text-cyan-200"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">
                      Code / Diff Snippet (Prefix lines with - or + for red/green diff)
                    </label>
                    <textarea
                      rows={4}
                      aria-label="Code Snippet"
                      value={
                        activeSlide.codeSnippet ?? smartDefaults.codeSnippet
                      }
                      onChange={(e) =>
                        updateActiveSlide({ codeSnippet: e.target.value })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-black/90 border border-white/15 text-xs font-mono text-emerald-200 resize-none"
                    />
                  </div>
                </div>
              )}

              {/* METRIC: Value, Label & Delta */}
              {activeSlide.type === 'metric' && (
                <div className="space-y-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-emerald-300 flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5" />
                    <span>Hard Benchmark / Metric Card</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">
                        Metric Value
                      </label>
                      <input
                        type="text"
                        aria-label="Metric Value"
                        value={
                          activeSlide.metricValue ?? smartDefaults.metricValue
                        }
                        onChange={(e) =>
                          updateActiveSlide({ metricValue: e.target.value })
                        }
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-xs font-mono font-bold text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">
                        Metric Label
                      </label>
                      <input
                        type="text"
                        aria-label="Metric Label"
                        value={
                          activeSlide.metricLabel ?? smartDefaults.metricLabel
                        }
                        onChange={(e) =>
                          updateActiveSlide({ metricLabel: e.target.value })
                        }
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-xs font-mono text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">
                        Benchmark Delta Badge
                      </label>
                      <input
                        type="text"
                        aria-label="Metric Delta"
                        value={
                          activeSlide.metricDiff ?? smartDefaults.metricDiff
                        }
                        onChange={(e) =>
                          updateActiveSlide({ metricDiff: e.target.value })
                        }
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-xs font-mono text-emerald-300"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* NUMBER: Step Number & Kicker */}
              {activeSlide.type === 'number' && (
                <div className="space-y-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-blue-300 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5" />
                    <span>Numbered Principle / Stage Card</span>
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">
                        Step Number (01–08)
                      </label>
                      <input
                        type="text"
                        aria-label="Step Number"
                        value={
                          activeSlide.stepNumber ?? smartDefaults.stepNumber
                        }
                        onChange={(e) =>
                          updateActiveSlide({ stepNumber: e.target.value })
                        }
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-xs font-mono font-bold text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">
                        Step Kicker Label
                      </label>
                      <input
                        type="text"
                        aria-label="Step Label"
                        value={
                          activeSlide.stepLabel ?? smartDefaults.stepLabel
                        }
                        onChange={(e) =>
                          updateActiveSlide({ stepLabel: e.target.value })
                        }
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-xs font-mono text-cyan-200"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* HUB: Center Core Tag & Satellites */}
              {activeSlide.type === 'hub' && (
                <div className="space-y-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-cyan-300">
                    Hub Core Tag & Satellite Nodes
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">
                        Center Core Tag
                      </label>
                      <input
                        type="text"
                        aria-label="Hub Center Tag"
                        value={
                          activeSlide.centerTag ?? smartDefaults.centerTag
                        }
                        onChange={(e) =>
                          updateActiveSlide({ centerTag: e.target.value })
                        }
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-xs font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 block mb-0.5">
                        Satellite Labels (comma-separated)
                      </label>
                      <input
                        type="text"
                        aria-label="Hub Satellite Labels"
                        value={(
                          activeSlide.satLabels && activeSlide.satLabels.length > 0
                            ? activeSlide.satLabels
                            : smartDefaults.satLabels
                        ).join(', ')}
                        onChange={(e) => {
                          const labels = e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean);
                          updateActiveSlide({ satLabels: labels });
                        }}
                        className="w-full px-2 py-1 rounded bg-black/80 border border-white/15 text-xs font-mono text-slate-200"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Collapsible Social Caption Editor */}
          <div className="p-2.5 rounded-xl bg-black/40 border border-white/10">
            <button
              type="button"
              onClick={() => setShowCaptionEditor((prev) => !prev)}
              className="w-full flex items-center justify-between text-[11px] font-mono text-slate-300 hover:text-white cursor-pointer"
            >
              <span>
                Social Post Caption & Hashtags ({(candidate.deck.caption || '').length}{' '}
                chars)
              </span>
              <span className="text-cyan-300 font-bold">
                {showCaptionEditor ? 'Hide Caption ▲' : 'Edit Caption ▼'}
              </span>
            </button>
            {showCaptionEditor && (
              <div className="pt-2 mt-2 border-t border-white/10">
                <textarea
                  rows={3}
                  value={candidate.deck.caption || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    onUpdateCandidateDeck(candidate.id, (prev) => ({
                      ...prev,
                      deck: { ...prev.deck, caption: val },
                    }));
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-black/80 border border-white/15 text-xs text-slate-300 font-mono resize-none focus:outline-none focus:border-cyan-400"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
