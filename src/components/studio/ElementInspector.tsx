import React from 'react';
import {
  SlidersHorizontal,
  Move,
  RotateCcw,
  Maximize2,
  Layers,
  ChevronDown,
  ChevronUp,
  Type,
  Square,
  Sparkles,
  Copy,
  ShieldCheck,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Eye,
  EyeOff,
  ListChecks,
  LayoutTemplate,
  Unlock,
  Lock,
  Crop,
} from 'lucide-react';
import {
  GraphicalElementId,
  ElementLayoutOverride,
  SlideData,
  ThemePalette,
  SlideCompositionPreset,
  TextAlignment,
} from '../../types.ts';
import { clampElementDrag, applySlideCompositionPreset } from '../../lib/canvas/layoutAwareness.ts';

interface ElementInspectorProps {
  slide: SlideData;
  theme: ThemePalette;
  isOpen: boolean;
  onToggleOpen: () => void;
  selectedElementId: GraphicalElementId | null;
  onSelectElement: (id: GraphicalElementId | null) => void;
  onUpdateOverride: (id: GraphicalElementId, override: ElementLayoutOverride | null) => void;
  onResetOverrides: () => void;
  onApplyToAllSlides?: (id: GraphicalElementId, override: ElementLayoutOverride | null) => void;
  onApplySlideLayoutToAllSlides?: () => void;
  onUpdateSlideFields?: (updates: Partial<SlideData>) => void;
  headless?: boolean;
}

const ELEMENT_DEFINITIONS: {
  id: GraphicalElementId;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  desc: string;
  isText?: boolean;
}[] = [
  { id: 'graphicCard', label: 'Visual Archetype Card', icon: Square, desc: 'Central diagram, code block, image, or metric card' },
  { id: 'titleBlock', label: 'English Headline', icon: Type, desc: 'Primary Plus Jakarta Sans headline', isText: true },
  { id: 'arabicTitleBlock', label: 'Arabic Headline', icon: Type, desc: 'Cairo bold headline with accent color', isText: true },
  { id: 'bodyBlock', label: 'English Body Copy', icon: Type, desc: 'Detailed explanation text', isText: true },
  { id: 'arabicBodyBlock', label: 'Arabic Body Copy', icon: Type, desc: 'RTL Arabic explanatory copy', isText: true },
  { id: 'takeawaysBlock', label: 'Key Takeaways List', icon: ListChecks, desc: 'Bento bullet takeaways block' },
  { id: 'headerBadge', label: 'Top MARROK Badge', icon: Sparkles, desc: 'Header branding wordmark & category pill' },
  { id: 'ctaButton', label: 'CTA Pill Button', icon: Square, desc: 'Final action button (CTA slide only)' },
  { id: 'attributionCard', label: 'Attribution Card', icon: Square, desc: 'Brand attribution link (CTA slide only)' },
];

const COMPOSITION_PRESETS: {
  id: SlideCompositionPreset;
  label: string;
  desc: string;
}[] = [
  { id: 'standard', label: 'Standard', desc: 'Visual top, bilingual headlines & copy below' },
  { id: 'headline-first', label: 'Headline First', desc: 'Editorial top headlines, middle visual, bottom copy' },
  { id: 'visual-hero', label: 'Visual Hero', desc: 'Expanded 112% diagram/image card with compact copy' },
  { id: 'split-balanced', label: 'Split Align', desc: 'Left-aligned English + Right-aligned Arabic copy' },
  { id: 'compact-editorial', label: 'Compact', desc: 'Tighter typography with extra breathing room' },
];

export const ElementInspector: React.FC<ElementInspectorProps> = ({
  slide,
  theme,
  isOpen,
  onToggleOpen,
  selectedElementId,
  onSelectElement,
  onUpdateOverride,
  onResetOverrides,
  onApplyToAllSlides,
  onApplySlideLayoutToAllSlides,
  onUpdateSlideFields,
  headless = false,
}) => {
  const activeElements = ELEMENT_DEFINITIONS.filter((elem) => {
    if ((elem.id === 'ctaButton' || elem.id === 'attributionCard') && slide.type !== 'cta') return false;
    if (elem.id === 'takeawaysBlock' && (!slide.takeaways || slide.takeaways.length === 0)) return false;
    return true;
  });

  const activeElementId = selectedElementId || activeElements[0]?.id || 'graphicCard';
  const activeElemDef = ELEMENT_DEFINITIONS.find((e) => e.id === activeElementId);
  const currentOverrides = slide.layoutOverrides || {};
  const currentOverride = currentOverrides[activeElementId] || { dx: 0, dy: 0, scale: 1, opacity: 1, align: 'center', hidden: false };

  const dx = currentOverride.dx ?? 0;
  const dy = currentOverride.dy ?? 0;
  const scale = currentOverride.scale ?? 1;
  const opacity = currentOverride.opacity ?? 1;
  const align: TextAlignment = currentOverride.align || 'center';
  const hidden = Boolean(currentOverride.hidden);

  const activePreset: SlideCompositionPreset = slide.compositionPreset || 'standard';
  const isFreeMove = Boolean(slide.freeMoveLayout);

  const handleUpdate = (updates: Partial<ElementLayoutOverride>) => {
    const desiredDx = updates.dx !== undefined ? updates.dx : dx;
    const desiredDy = updates.dy !== undefined ? updates.dy : dy;

    const clamped = clampElementDrag(activeElementId, desiredDx, desiredDy, slide);

    const nextOverride: ElementLayoutOverride = {
      ...currentOverride,
      dx: clamped.dx,
      dy: clamped.dy,
      scale: updates.scale !== undefined ? updates.scale : scale,
      opacity: updates.opacity !== undefined ? updates.opacity : opacity,
      align: updates.align !== undefined ? updates.align : align,
      hidden: updates.hidden !== undefined ? updates.hidden : hidden,
    };
    onUpdateOverride(activeElementId, nextOverride);
  };

  const handleToggleElementVisibility = (id: GraphicalElementId, e: React.MouseEvent) => {
    e.stopPropagation();
    const existing = currentOverrides[id] || {};
    onUpdateOverride(id, {
      ...existing,
      hidden: !existing.hidden,
    });
  };

  const handleSelectCompositionPreset = (preset: SlideCompositionPreset) => {
    if (!onUpdateSlideFields) return;
    const updated = applySlideCompositionPreset(slide, preset);
    onUpdateSlideFields({
      compositionPreset: updated.compositionPreset,
      freeMoveLayout: updated.freeMoveLayout,
      layoutOverrides: updated.layoutOverrides,
    });
  };

  const handleToggleFreeMove = () => {
    if (!onUpdateSlideFields) return;
    onUpdateSlideFields({
      freeMoveLayout: !isFreeMove,
    });
  };

  const handleResetCurrentElement = () => {
    onUpdateOverride(activeElementId, null);
  };

  const hasAnyOverrides =
    Object.keys(currentOverrides).length > 0 || activePreset !== 'standard' || isFreeMove;

  const inspectorContent = (
    <div className={headless ? "space-y-4 text-xs" : "p-4 space-y-4 animate-fade-in text-xs"}>
      {headless && (
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white">Element Adjustments</span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <ShieldCheck className="w-2.5 h-2.5" />
              <span>{isFreeMove ? 'Free Move' : 'Smart Cascade'}</span>
            </span>
            {hasAnyOverrides && (
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider"
                style={{ backgroundColor: `${theme.accent}30`, color: theme.accent }}
              >
                {activePreset !== 'standard' ? activePreset : `${Object.keys(currentOverrides).length} Custom`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {hasAnyOverrides && (
              <button
                type="button"
                onClick={onResetOverrides}
                className="px-2 py-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                title="Reset all layout offsets & preset on this slide"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Slide</span>
              </button>
            )}
          </div>
        </div>
      )}
          {/* 1. Slide Composition Presets & Free Move Mode */}
          {onUpdateSlideFields && slide.type !== 'cta' && (
            <div className="space-y-2 pb-3 border-b border-white/[0.07]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <LayoutTemplate className="w-3 h-3 text-cyan-400" />
                  <span>Slide Composition Preset</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleToggleFreeMove}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-mono font-semibold transition-all cursor-pointer ${
                      isFreeMove
                        ? 'border-amber-400/50 bg-amber-500/15 text-amber-300'
                        : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'
                    }`}
                    title={
                      isFreeMove
                        ? 'Free Move active: blocks move independently without pushing lower blocks'
                        : 'Smart Cascade active: moving a block pushes lower blocks down to prevent overlap'
                    }
                  >
                    {isFreeMove ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    <span>{isFreeMove ? 'Free Move: ON' : 'Cascade Lock'}</span>
                  </button>
                  {onApplySlideLayoutToAllSlides && (
                    <button
                      type="button"
                      onClick={onApplySlideLayoutToAllSlides}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-[10px] font-mono font-semibold text-cyan-300 hover:text-white transition-colors cursor-pointer"
                      title="Apply this slide's preset and layout overrides to all slides in the deck"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Sync Deck</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {COMPOSITION_PRESETS.map((preset) => {
                  const isActive = activePreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectCompositionPreset(preset.id)}
                      className={`px-2.5 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                        isActive
                          ? 'border-cyan-400/60 bg-cyan-500/15 text-white shadow-sm'
                          : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.06] hover:border-white/20'
                      }`}
                      title={preset.desc}
                    >
                      <div
                        className="font-bold text-[11px] truncate"
                        style={isActive ? { color: theme.accent } : undefined}
                      >
                        {preset.label}
                      </div>
                      <div className="text-[9px] text-slate-400 truncate mt-0.5">{preset.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Image Framing Controls (Pan & Zoom inside card when slide.type === 'image') */}
          {slide.type === 'image' && onUpdateSlideFields && (
            <div className="p-3 rounded-xl border border-cyan-500/25 bg-cyan-950/15 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-cyan-300 flex items-center gap-1.5">
                  <Crop className="w-3.5 h-3.5" />
                  <span>Image Crop, Zoom & Pan Framing</span>
                </span>
                {((slide.imageZoom && slide.imageZoom !== 1) ||
                  slide.imagePanX ||
                  slide.imagePanY) && (
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSlideFields({ imageZoom: 1, imagePanX: 0, imagePanY: 0 })
                    }
                    className="text-[10px] font-mono text-slate-300 hover:text-white px-1.5 py-0.5 rounded bg-white/10 cursor-pointer"
                  >
                    Reset Frame
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <div className="flex justify-between text-[10px] text-slate-300 mb-1">
                    <span>Zoom</span>
                    <span className="font-mono">{(slide.imageZoom ?? 1).toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.8"
                    max="2.5"
                    step="0.05"
                    value={slide.imageZoom ?? 1}
                    onChange={(e) => onUpdateSlideFields({ imageZoom: Number(e.target.value) })}
                    className="w-full accent-cyan-400 h-1.5 rounded-lg bg-slate-800 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-300 mb-1">
                    <span>Pan X</span>
                    <span className="font-mono">{slide.imagePanX ?? 0}%</span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="2"
                    value={slide.imagePanX ?? 0}
                    onChange={(e) => onUpdateSlideFields({ imagePanX: Number(e.target.value) })}
                    className="w-full accent-cyan-400 h-1.5 rounded-lg bg-slate-800 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-slate-300 mb-1">
                    <span>Pan Y</span>
                    <span className="font-mono">{slide.imagePanY ?? 0}%</span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="2"
                    value={slide.imagePanY ?? 0}
                    onChange={(e) => onUpdateSlideFields({ imagePanY: Number(e.target.value) })}
                    className="w-full accent-cyan-400 h-1.5 rounded-lg bg-slate-800 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3. Layer Selector with Quick Visibility Toggle */}
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-slate-500" />
                <span>Select Slide Graphical Block</span>
              </span>
              <span className="text-[10px] text-slate-500">Click eye icon to show/hide block</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {activeElements.map((elem) => {
                const Icon = elem.icon;
                const isSelected = activeElementId === elem.id;
                const elemOverride = currentOverrides[elem.id];
                const isModified = Boolean(elemOverride);
                const isHidden = Boolean(elemOverride?.hidden);

                return (
                  <div
                    key={elem.id}
                    onClick={() => onSelectElement(elem.id)}
                    className={`px-2.5 py-2 rounded-xl text-left border flex items-center justify-between gap-1.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-white/40 bg-white/10 text-white shadow-sm'
                        : isHidden
                        ? 'border-white/5 bg-white/[0.01] text-slate-500 opacity-60'
                        : 'border-white/5 bg-white/[0.02] text-slate-300 hover:bg-white/[0.05] hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon
                        className="w-3.5 h-3.5 shrink-0"
                        style={{ color: isSelected ? theme.accent : undefined }}
                      />
                      <span className={`truncate font-medium text-[11px] ${isHidden ? 'line-through' : ''}`}>
                        {elem.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isModified && !isHidden && (
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: theme.accent }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleToggleElementVisibility(elem.id, e)}
                        className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
                        title={isHidden ? 'Show element on slide' : 'Hide element on slide'}
                      >
                        {isHidden ? <EyeOff className="w-3 h-3 text-rose-400" /> : <Eye className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Active Element Fine Controls */}
          <div className="p-3.5 rounded-xl border border-white/10 bg-black/40 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
              <div>
                <span className="font-bold text-white text-[12px] flex items-center gap-2">
                  <span>{activeElemDef?.label}</span>
                  {hidden && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[9px] font-mono">
                      HIDDEN
                    </span>
                  )}
                </span>
                <p className="text-[10px] text-slate-400">{activeElemDef?.desc}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {activeElemDef?.isText && (
                  <div className="flex items-center bg-white/[0.04] border border-white/10 rounded-lg p-0.5">
                    {(['left', 'center', 'right'] as TextAlignment[]).map((alignOption) => {
                      const AlignIcon =
                        alignOption === 'left'
                          ? AlignLeft
                          : alignOption === 'right'
                          ? AlignRight
                          : AlignCenter;
                      const isAlignActive = align === alignOption;
                      return (
                        <button
                          key={alignOption}
                          type="button"
                          onClick={() => handleUpdate({ align: alignOption })}
                          className={`p-1 rounded-md transition-colors cursor-pointer ${
                            isAlignActive
                              ? 'bg-white/15 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                          style={isAlignActive ? { color: theme.accent } : undefined}
                          title={`Align ${alignOption}`}
                        >
                          <AlignIcon className="w-3.5 h-3.5" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {onApplyToAllSlides && (
                  <button
                    type="button"
                    onClick={() => onApplyToAllSlides(activeElementId, currentOverride)}
                    className="text-[10px] text-cyan-300 hover:text-white flex items-center gap-1 px-2 py-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 transition-colors cursor-pointer"
                    title="Apply this element's layout settings to all slides in the deck"
                  >
                    <Copy className="w-2.5 h-2.5" />
                    <span>Apply Block to Deck</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleResetCurrentElement}
                  className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer"
                  title="Reset this element on current slide"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            {/* Horizontal Position (dX) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 flex items-center gap-1">
                  <Move className="w-3 h-3 text-slate-500" />
                  <span>Horizontal Offset (dX)</span>
                </span>
                <div className="flex items-center gap-2">
                  {dx !== 0 && (
                    <button
                      type="button"
                      onClick={() => handleUpdate({ dx: 0 })}
                      className="text-[9px] font-mono text-cyan-400 hover:underline cursor-pointer"
                    >
                      Center X
                    </button>
                  )}
                  <span className="font-mono text-slate-200">{dx > 0 ? `+${dx}` : dx}px</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdate({ dx: dx - 10 })}
                  className="px-2 py-1 rounded bg-white/5 hover:bg-white/15 text-slate-300 font-mono text-[10px] cursor-pointer"
                >
                  -10
                </button>
                <input
                  type="range"
                  min="-260"
                  max="260"
                  step="2"
                  value={dx}
                  onChange={(e) => handleUpdate({ dx: Number(e.target.value) })}
                  className="flex-1 accent-indigo-500 h-1.5 rounded-lg bg-slate-800 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => handleUpdate({ dx: dx + 10 })}
                  className="px-2 py-1 rounded bg-white/5 hover:bg-white/15 text-slate-300 font-mono text-[10px] cursor-pointer"
                >
                  +10
                </button>
              </div>
            </div>

            {/* Vertical Position (dY) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 flex items-center gap-1">
                  <Move className="w-3 h-3 text-slate-500 rotate-90" />
                  <span>Vertical Offset (dY)</span>
                </span>
                <div className="flex items-center gap-2">
                  {dy !== 0 && (
                    <button
                      type="button"
                      onClick={() => handleUpdate({ dy: 0 })}
                      className="text-[9px] font-mono text-cyan-400 hover:underline cursor-pointer"
                    >
                      Reset Y
                    </button>
                  )}
                  <span className="font-mono text-slate-200">{dy > 0 ? `+${dy}` : dy}px</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdate({ dy: dy - 10 })}
                  className="px-2 py-1 rounded bg-white/5 hover:bg-white/15 text-slate-300 font-mono text-[10px] cursor-pointer"
                >
                  -10
                </button>
                <input
                  type="range"
                  min="-450"
                  max="450"
                  step="2"
                  value={dy}
                  onChange={(e) => handleUpdate({ dy: Number(e.target.value) })}
                  className="flex-1 accent-indigo-500 h-1.5 rounded-lg bg-slate-800 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => handleUpdate({ dy: dy + 10 })}
                  className="px-2 py-1 rounded bg-white/5 hover:bg-white/15 text-slate-300 font-mono text-[10px] cursor-pointer"
                >
                  +10
                </button>
              </div>
            </div>

            {/* Scale & Opacity Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Scale multiplier */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Maximize2 className="w-3 h-3 text-slate-500" />
                    <span>Element Scale</span>
                  </span>
                  <span className="font-mono text-slate-200">{Math.round(scale * 100)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleUpdate({ scale: Math.max(0.6, Number((scale - 0.05).toFixed(2))) })}
                    className="px-1.5 py-1 rounded bg-white/5 hover:bg-white/15 text-slate-300 font-mono text-[10px] cursor-pointer"
                  >
                    -5%
                  </button>
                  <input
                    type="range"
                    min="0.6"
                    max="1.5"
                    step="0.02"
                    value={scale}
                    onChange={(e) => handleUpdate({ scale: Number(e.target.value) })}
                    className="flex-1 accent-indigo-500 h-1.5 rounded-lg bg-slate-800 cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdate({ scale: Math.min(1.5, Number((scale + 0.05).toFixed(2))) })}
                    className="px-1.5 py-1 rounded bg-white/5 hover:bg-white/15 text-slate-300 font-mono text-[10px] cursor-pointer"
                  >
                    +5%
                  </button>
                </div>
              </div>

              {/* Opacity multiplier */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Eye className="w-3 h-3 text-slate-500" />
                    <span>Layer Opacity</span>
                  </span>
                  <span className="font-mono text-slate-200">{Math.round(opacity * 100)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="range"
                    min="0.15"
                    max="1"
                    step="0.05"
                    value={opacity}
                    onChange={(e) => handleUpdate({ opacity: Number(e.target.value) })}
                    className="flex-1 accent-indigo-500 h-1.5 rounded-lg bg-slate-800 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            <span>
              Tip: Drag any element on the canvas to move it, drag its 4 corners to resize, or double-click to edit its text.
            </span>
          </div>
        </div>
  );

  if (headless) {
    return inspectorContent;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/80 backdrop-blur-md shadow-xl overflow-hidden transition-all duration-300">
      {/* Header Bar */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none border-b border-white/5 hover:bg-white/[0.02]"
        onClick={onToggleOpen}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
            style={{ backgroundColor: `${theme.accent}20`, color: theme.accent }}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-2 flex-wrap">
              <span>Visual Layout Studio</span>
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="w-2.5 h-2.5" />
                <span>{isFreeMove ? 'Free Move' : 'Smart Cascade'}</span>
              </span>
              {hasAnyOverrides && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider"
                  style={{ backgroundColor: `${theme.accent}30`, color: theme.accent }}
                >
                  {activePreset !== 'standard' ? activePreset : `${Object.keys(currentOverrides).length} Custom`}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400">
              1-click composition presets, corner scaling, alignment & free move
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasAnyOverrides && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onResetOverrides();
              }}
              className="px-2 py-1 text-[11px] font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              title="Reset all layout offsets & preset on this slide"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Slide</span>
            </button>
          )}
          <button
            type="button"
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Collapsible Inspector Content */}
      {isOpen && inspectorContent}
    </div>
  );
};
