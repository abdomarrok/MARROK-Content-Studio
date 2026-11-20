import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  Check,
  Loader2,
  AlertTriangle,
  Wand2,
  X,
} from 'lucide-react';
import {
  CarouselData,
  DEFAULT_PALETTES,
  SlideData,
  ThemePalette,
} from '../../../types.ts';
import { renderSlideToCanvas } from '../../../lib/canvas/renderSlide.ts';
import { getCanvasDimensionSpec } from '../../../lib/canvas/constants.ts';
import { CHAR_LIMITS, SINGLE_SLIDE_CHAR_LIMITS } from '../../../lib/qaChecks.ts';
import { autoFitSlideCopyToLimits } from '../../../lib/synthesizer.ts';
import { splitArabicForBidiRender } from '../../../lib/text/arabicBiDi.ts';

function formatSlideRoleLabel(slide: SlideData, idx: number, total: number): string {
  if (idx === 0 && slide.type !== 'cta') return 'Hook';
  if (slide.type === 'cta' || (total > 1 && idx === total - 1)) return 'CTA';
  switch (slide.type) {
    case 'compare':
      return 'Compare';
    case 'metric':
      return 'Metric';
    case 'code':
      return 'Code';
    case 'number':
      return 'Step';
    case 'subjectPair':
      return 'Pair';
    case 'image':
      return 'Media';
    case 'poster':
      return 'Poster';
    case 'hub':
      return 'Hub';
    default:
      return 'Diagram';
  }
}

interface DraftSlideThumbProps {
  deck: CarouselData;
  slideIndex: number;
  palette: ThemePalette;
  isActive: boolean;
  hasOverflow: boolean;
  onSelect: () => void;
}

const DraftSlideThumb: React.FC<DraftSlideThumbProps> = ({
  deck,
  slideIndex,
  palette,
  isActive,
  hasOverflow,
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
        // Safe no-op in jsdom / headless unit tests
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
      data-testid={`draft-thumb-slide-${slideIndex}`}
      onClick={onSelect}
      className={`relative rounded-lg overflow-hidden border transition-colors cursor-pointer shrink-0 flex flex-col bg-[#070c10] ${
        isActive
          ? 'border-cyan-400 ring-1 ring-cyan-400/40'
          : hasOverflow
          ? 'border-amber-400/50 opacity-90 hover:opacity-100'
          : 'border-white/15 hover:border-white/35 opacity-80 hover:opacity-100'
      }`}
      style={{ width: 62 }}
      title={`Slide ${slideIndex + 1}: ${slide.enTitle || ''}`}
    >
      <div
        className="w-full relative overflow-hidden bg-[#060a0e]"
        style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
      >
        <canvas ref={canvasRef} className="w-full h-full object-contain block" />
        <span className="absolute top-1 left-1 px-1 rounded bg-black/80 text-[9px] font-mono tabular-nums font-bold text-white">
          S{slideIndex + 1}
        </span>
      </div>
      <div className="px-1 py-0.5 bg-black/90 w-full text-center border-t border-white/10">
        <span className="text-[9px] font-mono text-slate-300 truncate block">
          {formatSlideRoleLabel(slide, slideIndex, deck.slides.length)}
        </span>
      </div>
    </button>
  );
};

export interface DraftBilingualSlideStripProps {
  postId: string;
  slides: SlideData[];
  overflowSlideIndices: number[];
  activeSlideIdx: number | null;
  onSelectSlide: (idx: number) => void;
}

export const DraftBilingualSlideStrip: React.FC<DraftBilingualSlideStripProps> = ({
  postId,
  slides,
  overflowSlideIndices,
  activeSlideIdx,
  onSelectSlide,
}) => {
  const overflowSet = new Set(overflowSlideIndices);

  return (
    <div
      data-testid={`draft-bilingual-strip-${postId}`}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"
    >
      {slides.map((slide, sIdx) => {
        const isSelected = activeSlideIdx === sIdx;
        const hasOverflow = overflowSet.has(sIdx);
        const roleLabel = formatSlideRoleLabel(slide, sIdx, slides.length);

        return (
          <button
            key={sIdx}
            type="button"
            data-testid={`draft-slide-chip-${postId}-${sIdx}`}
            onClick={() => onSelectSlide(sIdx)}
            className={`text-left px-2.5 py-2 rounded-lg border transition-colors cursor-pointer space-y-1 min-w-0 ${
              isSelected
                ? 'border-cyan-400/60 bg-cyan-500/10'
                : hasOverflow
                ? 'border-amber-400/35 bg-amber-500/[0.04] hover:border-amber-400/60'
                : 'border-white/10 bg-black/35 hover:border-white/25 hover:bg-white/[0.03]'
            }`}
            title={`Inspect and quick-edit Slide ${sIdx + 1}`}
          >
            <div className="flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums text-slate-400">
              <span className={isSelected ? 'text-cyan-200 font-bold' : 'font-semibold'}>
                S{sIdx + 1} · {roleLabel}
              </span>
              {hasOverflow && (
                <span className="text-amber-300 font-semibold">Over limit</span>
              )}
            </div>

            <div className="text-xs font-semibold text-slate-100 truncate">
              {slide.enTitle?.trim() || `Slide ${sIdx + 1}`}
            </div>

            <div
              dir="rtl"
              lang="ar"
              className={`text-[11px] font-arabic truncate ${
                slide.arTitle?.trim() ? 'text-slate-400' : 'text-amber-300/80'
              }`}
            >
              {slide.arTitle?.trim() || 'عنوان عربي مفقود'}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export interface DraftSlideQuickInspectorProps {
  postId: string;
  deck: CarouselData;
  fallbackTheme: ThemePalette;
  activeSlideIdx: number;
  overflowSlideIndices: number[];
  isSaving?: boolean;
  onSetActiveSlideIdx: (idx: number) => void;
  onSaveDeck: (updatedDeck: CarouselData) => Promise<void> | void;
  onEditInStudio: () => void;
  onClose: () => void;
}

export const DraftSlideQuickInspector: React.FC<DraftSlideQuickInspectorProps> = ({
  postId,
  deck,
  fallbackTheme,
  activeSlideIdx,
  overflowSlideIndices,
  isSaving = false,
  onSetActiveSlideIdx,
  onSaveDeck,
  onEditInStudio,
  onClose,
}) => {
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [localDeck, setLocalDeck] = useState<CarouselData>(deck);
  const [isDirty, setIsDirty] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Sync incoming Vault deck updates when not actively editing unsaved changes
  useEffect(() => {
    setLocalDeck(deck);
    setIsDirty(false);
  }, [deck]);

  const slides = localDeck.slides || [];
  const safeIdx = Math.min(activeSlideIdx, Math.max(0, slides.length - 1));
  const activeSlide = slides[safeIdx];

  const palette: ThemePalette =
    (localDeck.theme && DEFAULT_PALETTES[localDeck.theme]) || fallbackTheme || DEFAULT_PALETTES.teal;
  const spec = getCanvasDimensionSpec(localDeck.dimensionPreset);

  const isSingle =
    localDeck.postFormat === 'single' ||
    slides.length === 1 ||
    activeSlide?.type === 'poster';
  const limits = isSingle ? SINGLE_SLIDE_CHAR_LIMITS : CHAR_LIMITS;
  const isHook = safeIdx === 0 && activeSlide?.type !== 'cta';
  const enTitleLimit = isHook ? limits.hookTitle : limits.enTitle;
  const arTitleLimit = isHook ? limits.hookArTitle : limits.arTitle;
  const enBodyLimit = limits.enBody;
  const arBodyLimit = limits.arBody;

  // Keyboard arrow navigation when inspector is open (skipping inputs)
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

  // Render active slide live on canvas
  useEffect(() => {
    let cancelled = false;
    const canvas = mainCanvasRef.current;
    if (!canvas || !activeSlide) return;

    const timer = setTimeout(() => {
      if (cancelled) return;
      renderSlideToCanvas(localDeck, safeIdx, canvas, palette).catch(() => {
        // Safe no-op in jsdom / headless tests
      });
    }, 40);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [localDeck, activeSlide, safeIdx, palette]);

  if (!activeSlide) return null;

  const updateSlideField = (patch: Partial<SlideData>) => {
    setLocalDeck((prev) => {
      const nextSlides = [...prev.slides];
      if (!nextSlides[safeIdx]) return prev;
      nextSlides[safeIdx] = {
        ...nextSlides[safeIdx],
        ...patch,
      };
      return {
        ...prev,
        slides: nextSlides,
      };
    });
    setIsDirty(true);
    setJustSaved(false);
  };

  const persistNow = async (deckToSave: CarouselData = localDeck) => {
    await onSaveDeck(deckToSave);
    setIsDirty(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  };

  const handleAutoFitActiveSlide = () => {
    const fitted = autoFitSlideCopyToLimits(activeSlide, safeIdx, isSingle);
    const nextSlides = [...localDeck.slides];
    nextSlides[safeIdx] = {
      ...activeSlide,
      enTitle: fitted.enTitle,
      arTitle: fitted.arTitle,
      enBody: fitted.enBody,
      arBody: fitted.arBody,
    };
    const nextDeck: CarouselData = { ...localDeck, slides: nextSlides };
    setLocalDeck(nextDeck);
    void persistNow(nextDeck);
  };

  const enTitleLen = (activeSlide.enTitle || '').trim().length;
  const arTitleLen = (activeSlide.arTitle || '').trim().length;
  const enBodyLen = (activeSlide.enBody || '').trim().length;
  const arBodyLen = (activeSlide.arBody || '').trim().length;
  const hasActiveOverflow =
    enTitleLen > enTitleLimit ||
    arTitleLen > arTitleLimit ||
    enBodyLen > enBodyLimit ||
    arBodyLen > arBodyLimit;

  const overflowSet = new Set(overflowSlideIndices);

  return (
    <div
      data-testid={`draft-slide-inspector-${postId}`}
      className="rounded-xl border border-white/15 bg-[#070d12] p-3.5 space-y-3"
    >
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-white tabular-nums">
            Slide {safeIdx + 1} of {slides.length}
          </span>
          <span className="text-slate-500" aria-hidden="true">
            ·
          </span>
          <span className="font-mono text-[11px] text-cyan-300">
            {formatSlideRoleLabel(activeSlide, safeIdx, slides.length)} · {spec.aspectRatioLabel}
          </span>
          <span className="hidden sm:inline text-slate-500 text-[11px] font-mono">
            (← / →)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isSaving ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-300">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Saving...</span>
            </span>
          ) : isDirty ? (
            <span className="text-[11px] font-mono text-amber-300">Unsaved edits</span>
          ) : justSaved ? (
            <span
              data-testid={`draft-inspector-saved-${postId}`}
              className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-300"
            >
              <Check className="w-3 h-3" />
              <span>Saved</span>
            </span>
          ) : null}

          <button
            type="button"
            onClick={onEditInStudio}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/15 bg-white/[0.04] hover:bg-white/[0.1] text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
          >
            <Edit3 className="w-3 h-3 text-emerald-400" />
            <span>Open Full Editor in Studio</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close slide preview"
            className="p-1 rounded-md border border-white/10 text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main 2-Column Split: Live Canvas Stage | Bilingual Quick-Edit */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Live Canvas + Thumbnail Strip */}
        <div className="lg:col-span-5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              data-testid={`draft-inspector-prev-${postId}`}
              disabled={safeIdx === 0}
              onClick={() => onSetActiveSlideIdx(Math.max(0, safeIdx - 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-slate-200 disabled:opacity-30 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>

            <span className="text-[11px] font-mono tabular-nums text-slate-400">
              {safeIdx + 1} / {slides.length}
            </span>

            <button
              type="button"
              data-testid={`draft-inspector-next-${postId}`}
              disabled={safeIdx >= slides.length - 1}
              onClick={() => onSetActiveSlideIdx(Math.min(slides.length - 1, safeIdx + 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-slate-200 disabled:opacity-30 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-center rounded-lg border border-white/10 bg-[#05080b] p-2">
            <div
              className="relative w-full max-w-[248px] rounded-md overflow-hidden border border-white/15"
              style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
            >
              <canvas
                ref={mainCanvasRef}
                data-testid={`draft-live-canvas-${postId}`}
                className="w-full h-full object-contain block"
              />
            </div>
          </div>

          <div
            data-testid={`draft-thumb-strip-${postId}`}
            className="flex items-center gap-1.5 overflow-x-auto pb-1"
          >
            {slides.map((_, idx) => (
              <DraftSlideThumb
                key={idx}
                deck={localDeck}
                slideIndex={idx}
                palette={palette}
                isActive={idx === safeIdx}
                hasOverflow={overflowSet.has(idx)}
                onSelect={() => onSetActiveSlideIdx(idx)}
              />
            ))}
          </div>
        </div>

        {/* Right: Fast Bilingual Copy Quick-Edit */}
        <div className="lg:col-span-7 space-y-3">
          {hasActiveOverflow && (
            <div className="px-2.5 py-1.5 rounded-md border border-amber-400/35 bg-amber-500/10 text-[11px] text-amber-200 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>Slide {safeIdx + 1} copy exceeds recommended character limits.</span>
              </span>
              <button
                type="button"
                onClick={handleAutoFitActiveSlide}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-400/20 hover:bg-amber-400/30 text-amber-100 font-semibold cursor-pointer whitespace-nowrap"
              >
                <Wand2 className="w-3 h-3" />
                <span>Auto-Fit</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-slate-400">
                  English Headline
                </label>
                <span
                  className={`text-[11px] font-mono tabular-nums ${
                    enTitleLen > enTitleLimit ? 'text-amber-300 font-bold' : 'text-slate-500'
                  }`}
                >
                  {enTitleLen}/{enTitleLimit}
                </span>
              </div>
              <input
                type="text"
                data-testid={`draft-quick-en-title-${postId}`}
                value={activeSlide.enTitle || ''}
                onChange={(e) => updateSlideField({ enTitle: e.target.value })}
                onBlur={() => {
                  if (isDirty) void persistNow();
                }}
                className="w-full px-2.5 py-1.5 rounded-md bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-slate-400">
                  Arabic Headline (RTL)
                </label>
                <span
                  className={`text-[11px] font-mono tabular-nums ${
                    arTitleLen > arTitleLimit ? 'text-amber-300 font-bold' : 'text-slate-500'
                  }`}
                >
                  {arTitleLen}/{arTitleLimit}
                </span>
              </div>
              <input
                type="text"
                dir="rtl"
                lang="ar"
                data-testid={`draft-quick-ar-title-${postId}`}
                value={activeSlide.arTitle || ''}
                onChange={(e) => updateSlideField({ arTitle: e.target.value })}
                onBlur={() => {
                  if (isDirty) void persistNow();
                }}
                className="w-full px-2.5 py-1.5 rounded-md bg-black/60 border border-white/15 text-xs text-white font-arabic focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-slate-400">
                  English Body
                </label>
                <span
                  className={`text-[11px] font-mono tabular-nums ${
                    enBodyLen > enBodyLimit ? 'text-amber-300 font-bold' : 'text-slate-500'
                  }`}
                >
                  {enBodyLen}/{enBodyLimit}
                </span>
              </div>
              <textarea
                rows={3}
                data-testid={`draft-quick-en-body-${postId}`}
                value={activeSlide.enBody || ''}
                onChange={(e) => updateSlideField({ enBody: e.target.value })}
                onBlur={() => {
                  if (isDirty) void persistNow();
                }}
                className="w-full px-2.5 py-1.5 rounded-md bg-black/60 border border-white/15 text-xs text-slate-200 resize-none focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-slate-400">
                  Arabic Body (RTL)
                </label>
                <span
                  className={`text-[11px] font-mono tabular-nums ${
                    arBodyLen > arBodyLimit ? 'text-amber-300 font-bold' : 'text-slate-500'
                  }`}
                >
                  {arBodyLen}/{arBodyLimit}
                </span>
              </div>
              <textarea
                rows={3}
                dir="rtl"
                lang="ar"
                data-testid={`draft-quick-ar-body-${postId}`}
                value={activeSlide.arBody || ''}
                onChange={(e) => updateSlideField({ arBody: e.target.value })}
                onBlur={() => {
                  if (isDirty) void persistNow();
                }}
                className="w-full px-2.5 py-1.5 rounded-md bg-black/60 border border-white/15 text-xs text-slate-200 font-arabic resize-none focus:outline-none focus:border-cyan-400"
              />
              {/[A-Za-z]/.test(activeSlide.arBody || '') && (
                <div
                  dir="rtl"
                  lang="ar"
                  className="mt-1 px-2 py-1 rounded bg-white/[0.03] border border-white/10 text-[11px] text-slate-300 font-arabic text-right"
                >
                  {splitArabicForBidiRender(activeSlide.arBody || '').map((seg, i) =>
                    seg.isLtr ? (
                      <bdi key={i} dir="ltr" className="font-mono text-cyan-300 px-0.5">
                        {seg.text}
                      </bdi>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    )
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Inline Metric Quick-Fix when inspecting a Metric slide */}
          {activeSlide.type === 'metric' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-white/10">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Metric Value
                </label>
                <input
                  type="text"
                  data-testid={`draft-quick-metric-val-${postId}`}
                  value={activeSlide.metricValue || ''}
                  onChange={(e) => updateSlideField({ metricValue: e.target.value })}
                  onBlur={() => {
                    if (isDirty) void persistNow();
                  }}
                  placeholder="e.g. 496k, 70%, 3.2x"
                  className="w-full px-2.5 py-1.5 rounded-md bg-black/60 border border-white/15 text-xs font-mono text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Metric Label / Delta
                </label>
                <input
                  type="text"
                  data-testid={`draft-quick-metric-diff-${postId}`}
                  value={activeSlide.metricDiff || activeSlide.metricLabel || ''}
                  onChange={(e) => updateSlideField({ metricDiff: e.target.value })}
                  onBlur={() => {
                    if (isDirty) void persistNow();
                  }}
                  placeholder="e.g. repository downloads"
                  className="w-full px-2.5 py-1.5 rounded-md bg-black/60 border border-white/15 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          )}

          {/* Save & Unified Studio Handoff Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
            <span className="text-[11px] text-slate-400">
              For layout, diagrams, or AI re-generation, open the unified Create Studio.
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid={`draft-inspector-save-btn-${postId}`}
                disabled={isSaving || !isDirty}
                onClick={() => void persistNow()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Slide Edits</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
