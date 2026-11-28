import React from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  Film,
  Languages,
  Layers,
  Loader2,
  Redo2,
  Sliders,
  Type,
  Undo2,
} from 'lucide-react';
import { GraphicalElementId, PostFormat, ThemePalette } from '../../../types.ts';

export type StudioInspectorTab = 'copy' | 'visual' | 'position' | 'caption' | 'review';

export interface StudioInspectorHeaderProps {
  activePostFormat: PostFormat;
  slidesCount: number;
  currentSlideIndex: number;
  theme: ThemePalette;
  isExpanded: boolean;
  inspectorTab: StudioInspectorTab;
  mobileSheetSnap: 'peek' | 'half' | 'full';
  canUndo: boolean;
  canRedo: boolean;
  isComparingBefore: boolean;
  isSyncingAllArabic: boolean;
  selectedElementId: GraphicalElementId | null;
  activeOverridesCount: number;
  blockersCount: number;
  hasContentQualityBlocker: boolean;
  onSheetDragStart: (e: React.PointerEvent<HTMLDivElement>) => void;
  onSheetDragEnd: (e: React.PointerEvent<HTMLDivElement>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSetIsComparingBefore: (active: boolean) => void;
  onSetMobileSheetSnap: (snap: 'peek' | 'half' | 'full') => void;
  onCloseMobileSheet: () => void;
  onSelectInspectorTab: (tab: StudioInspectorTab) => void;
  onSyncAllSlidesArabic: () => void;
  onOpenPositionInspector: () => void;
}

export const StudioInspectorHeader: React.FC<StudioInspectorHeaderProps> = ({
  activePostFormat,
  slidesCount,
  currentSlideIndex,
  theme,
  isExpanded,
  inspectorTab,
  mobileSheetSnap,
  canUndo,
  canRedo,
  isComparingBefore,
  isSyncingAllArabic,
  selectedElementId,
  activeOverridesCount,
  blockersCount,
  hasContentQualityBlocker,
  onSheetDragStart,
  onSheetDragEnd,
  onUndo,
  onRedo,
  onSetIsComparingBefore,
  onSetMobileSheetSnap,
  onCloseMobileSheet,
  onSelectInspectorTab,
  onSyncAllSlidesArabic,
  onOpenPositionInspector,
}) => (
  <>
    {/* Mobile Draggable Bottom Sheet Handle & Snap Controls (Peek / Half / Full) */}
    <div
      onPointerDown={onSheetDragStart}
      onPointerUp={onSheetDragEnd}
      onPointerCancel={onSheetDragEnd}
      className="lg:hidden flex flex-col border-b border-white/10 bg-black/70 shrink-0 select-none touch-none"
    >
      {/* Drag Pill */}
      <div className="w-full pt-1.5 pb-1 flex items-center justify-center cursor-ns-resize">
        <div className="w-10 h-1 rounded-full bg-white/30" />
      </div>

      <div className="flex items-center justify-between px-3 pb-1.5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: theme.accent }}
          />
          <span className="text-[11px] font-medium text-slate-200 truncate">
            Slide {currentSlideIndex + 1} ·{' '}
            {inspectorTab === 'copy'
              ? activePostFormat === 'reel'
                ? 'Motion'
                : 'Content'
              : inspectorTab === 'visual' || inspectorTab === 'position'
              ? 'Visual'
              : 'Publish'}
          </span>
        </div>

        {/* Undo / Redo / Compare Before + Snap Pills: Peek / Half / Full + Done */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            disabled={!canUndo}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onUndo}
            className="p-1 rounded-md bg-white/[0.04] text-slate-300 hover:text-white border border-white/10 disabled:opacity-35 cursor-pointer"
            title="Undo last edit"
          >
            <Undo2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onRedo}
            className="p-1 rounded-md bg-white/[0.04] text-slate-300 hover:text-white border border-white/10 disabled:opacity-35 cursor-pointer"
            title="Redo edit"
          >
            <Redo2 className="w-3 h-3" />
          </button>
          <button
            type="button"
            onPointerDown={() => onSetIsComparingBefore(true)}
            onPointerUp={() => onSetIsComparingBefore(false)}
            onPointerLeave={() => onSetIsComparingBefore(false)}
            onPointerCancel={() => onSetIsComparingBefore(false)}
            className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold border transition-colors cursor-pointer select-none ${
              isComparingBefore
                ? 'bg-amber-500/25 text-amber-200 border-amber-400'
                : 'bg-white/[0.04] text-slate-300 border-white/10'
            }`}
            title="Press and hold to compare with before edits"
          >
            Before
          </button>

          <span className="w-px h-3 bg-white/10 mx-0.5" />

          {(
            [
              { id: 'peek', label: 'Peek' },
              { id: 'half', label: 'Half' },
              { id: 'full', label: 'Full' },
            ] as const
          ).map((snap) => (
            <button
              key={snap.id}
              type="button"
              data-testid={`sheet-snap-${snap.id}`}
              onClick={() => onSetMobileSheetSnap(snap.id)}
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                mobileSheetSnap === snap.id
                  ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              {snap.label}
            </button>
          ))}

          <button
            type="button"
            onClick={onCloseMobileSheet}
            className="px-1.5 py-0.5 rounded-md bg-white/10 hover:bg-white/15 text-[10px] font-bold text-white flex items-center gap-0.5 cursor-pointer ml-0.5"
            aria-label="Close inspector bottom sheet"
          >
            <ChevronDown className="w-3 h-3" />
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>

    {/* Clean 3-Tab Inspector Bar (Desktop lg:+) */}
    <div
      data-testid="guided-wizard-bar"
      aria-label="Studio Inspector Tabs"
      className="hidden lg:flex items-center justify-between gap-2 px-3.5 py-2 border-b border-white/[0.08] bg-black/25 shrink-0"
    >
      <div className="flex items-center gap-1 shrink-0" role="tablist">
        {activePostFormat === 'reel' ? (
          <>
            <button
              type="button"
              role="tab"
              aria-selected={!isExpanded && inspectorTab === 'copy'}
              data-testid="tab-content"
              onClick={() => onSelectInspectorTab('copy')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                !isExpanded && inspectorTab === 'copy'
                  ? 'bg-white/12 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Film
                className="w-3.5 h-3.5"
                style={!isExpanded && inspectorTab === 'copy' ? { color: theme.accent } : undefined}
              />
              <span>Motion</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={!isExpanded && (inspectorTab === 'review' || inspectorTab === 'caption')}
              data-testid="tab-review"
              onClick={() => onSelectInspectorTab('review')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                hasContentQualityBlocker
                  ? 'bg-rose-500/20 text-rose-200 border border-rose-500/45'
                  : !isExpanded && (inspectorTab === 'review' || inspectorTab === 'caption')
                  ? 'bg-white/12 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 ${hasContentQualityBlocker ? 'text-rose-400' : ''}`}
                style={
                  !hasContentQualityBlocker &&
                  !isExpanded &&
                  (inspectorTab === 'review' || inspectorTab === 'caption')
                    ? { color: theme.accent }
                    : undefined
                }
              />
              <span>Publish</span>
              {blockersCount > 0 ? (
                <span
                  className={`text-[11px] font-mono tabular-nums ${
                    hasContentQualityBlocker ? 'text-rose-200 font-bold' : 'text-amber-300'
                  }`}
                >
                  · {blockersCount}
                </span>
              ) : (
                <span className="text-[11px] font-mono text-emerald-400">· Ready</span>
              )}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              role="tab"
              aria-selected={!isExpanded && inspectorTab === 'copy'}
              data-testid="tab-content"
              onClick={() => onSelectInspectorTab('copy')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                !isExpanded && inspectorTab === 'copy'
                  ? 'bg-white/12 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Type
                className="w-3.5 h-3.5"
                style={!isExpanded && inspectorTab === 'copy' ? { color: theme.accent } : undefined}
              />
              <span>Content</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={!isExpanded && (inspectorTab === 'visual' || inspectorTab === 'position')}
              data-testid="tab-design"
              onClick={() => onSelectInspectorTab('visual')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                !isExpanded && (inspectorTab === 'visual' || inspectorTab === 'position')
                  ? 'bg-white/12 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Layers
                className="w-3.5 h-3.5"
                style={
                  !isExpanded && (inspectorTab === 'visual' || inspectorTab === 'position')
                    ? { color: theme.accent }
                    : undefined
                }
              />
              <span>Visual</span>
              {activeOverridesCount > 0 && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: theme.accent }}
                  title={`${activeOverridesCount} position/scale adjustments active`}
                />
              )}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={!isExpanded && (inspectorTab === 'review' || inspectorTab === 'caption')}
              data-testid="tab-review"
              onClick={() => onSelectInspectorTab('review')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                hasContentQualityBlocker
                  ? 'bg-rose-500/20 text-rose-200 border border-rose-500/45'
                  : !isExpanded && (inspectorTab === 'review' || inspectorTab === 'caption')
                  ? 'bg-white/12 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <CheckCircle2
                className={`w-3.5 h-3.5 ${hasContentQualityBlocker ? 'text-rose-400' : ''}`}
                style={
                  !hasContentQualityBlocker &&
                  !isExpanded &&
                  (inspectorTab === 'review' || inspectorTab === 'caption')
                    ? { color: theme.accent }
                    : undefined
                }
              />
              <span>Publish</span>
              {blockersCount > 0 ? (
                <span
                  className={`text-[11px] font-mono tabular-nums ${
                    hasContentQualityBlocker ? 'text-rose-200 font-bold' : 'text-amber-300'
                  }`}
                >
                  · {blockersCount}
                </span>
              ) : (
                <span className="text-[11px] font-mono text-emerald-400">· Ready</span>
              )}
            </button>
          </>
        )}
      </div>

      {/* Quiet Contextual Right Utilities (No duplicate Undo/Redo) */}
      <div className="flex items-center gap-1.5 shrink-0">
        {activePostFormat !== 'reel' && slidesCount > 1 && (
          <button
            type="button"
            data-testid="inspector-sync-all-ar-btn"
            disabled={isSyncingAllArabic}
            onClick={onSyncAllSlidesArabic}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-45 border border-white/[0.08] text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Translate all slides from English to natural Arabic with AI"
          >
            {isSyncingAllArabic ? (
              <Loader2 className="w-3 h-3 animate-spin" style={{ color: theme.accent }} />
            ) : (
              <Languages className="w-3 h-3" style={{ color: theme.accent }} />
            )}
            <span>{isSyncingAllArabic ? 'Syncing…' : 'Sync All AR'}</span>
          </button>
        )}

        {activePostFormat !== 'reel' && selectedElementId && (
          <button
            type="button"
            onClick={onOpenPositionInspector}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-medium text-cyan-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            title="Open Position & Scale controls for selected canvas element"
          >
            <Sliders className="w-3 h-3" />
            <span>Adjust {selectedElementId}</span>
          </button>
        )}

        <button
          type="button"
          data-testid="desktop-compare-before-btn"
          onPointerDown={() => onSetIsComparingBefore(true)}
          onPointerUp={() => onSetIsComparingBefore(false)}
          onPointerLeave={() => onSetIsComparingBefore(false)}
          onPointerCancel={() => onSetIsComparingBefore(false)}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer select-none ${
            isComparingBefore
              ? 'bg-amber-500/20 text-amber-200'
              : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
          }`}
          title="Press and hold to compare with original before edits"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Compare</span>
        </button>
      </div>
    </div>
  </>
);
