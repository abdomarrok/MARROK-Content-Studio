import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Copy,
  FileText,
  Download,
  Type,
  Layers,
  LayoutGrid,
  BookmarkCheck,
  Film,
  MoreHorizontal,
  Undo2,
  Redo2,
  Eye,
} from 'lucide-react';
import {
  CarouselData,
  PostFormat,
  ThemePalette,
  CanvasDimensionPreset,
} from '../../../types.ts';
import {
  downloadSingleSlidePng,
  getCanvasDimensionSpec,
  type ExportBundleMode,
} from '../../../lib/canvasExporter.ts';

export interface MobileStudioBottomBarProps {
  carousel: CarouselData;
  currentSlideIndex: number;
  activePostFormat: PostFormat;
  theme: ThemePalette;
  isSheetOpen: boolean;
  inspectorTab: 'copy' | 'visual' | 'position' | 'caption' | 'review';
  isBlocked: boolean;
  hasContentQualityBlocker?: boolean;
  blockersCount: number;
  isExportingZip: boolean;
  isMoreMenuOpen: boolean;
  onSetIsMoreMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSelectTab: (tab: 'copy' | 'visual' | 'position' | 'review') => void;
  onCloseSheet: () => void;
  onSelectDimensionPreset: (preset: CanvasDimensionPreset) => void;
  onCopySlide: () => void;
  onCopyCaption: () => void;
  onExportZip: (mode: ExportBundleMode) => void;
  onOpenMotionExport: () => void;
  onOpenContactSheet?: () => void;
  onOpenPublishScheduleModal?: (tab?: 'single' | 'bulk' | 'storage') => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  isComparingBefore?: boolean;
  onCompareBeforeStart?: () => void;
  onCompareBeforeEnd?: () => void;
  onShowToast: (msg: string) => void;
}

export const MobileStudioBottomBar: React.FC<MobileStudioBottomBarProps> = ({
  carousel,
  currentSlideIndex,
  activePostFormat,
  theme,
  isSheetOpen,
  inspectorTab,
  isBlocked,
  hasContentQualityBlocker = false,
  blockersCount,
  isExportingZip,
  isMoreMenuOpen,
  onSetIsMoreMenuOpen,
  onSelectTab,
  onCloseSheet,
  onSelectDimensionPreset,
  onCopySlide,
  onCopyCaption,
  onExportZip,
  onOpenMotionExport,
  onOpenContactSheet,
  onOpenPublishScheduleModal,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  isComparingBefore = false,
  onCompareBeforeStart,
  onCompareBeforeEnd,
  onShowToast,
}) => {
  const activeDimensionSpec = getCanvasDimensionSpec(carousel.dimensionPreset);

  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-[56px] bg-[#080d11]/95 border-t border-white/10 px-1.5 backdrop-blur-md flex items-center justify-between gap-1 shadow-2xl">
      {/* Clean Single-Row 3-Tab Bar (Content, Visual, Publish) */}
      <div
        data-testid="mobile-scrollable-tab-bar"
        className="flex items-center gap-1 flex-1 min-w-0 py-1"
      >
        {[
          {
            id: 'copy' as const,
            label: activePostFormat === 'reel' ? 'Motion' : 'Content',
            icon: activePostFormat === 'reel' ? Film : Type,
            active: isSheetOpen && inspectorTab === 'copy',
            hidden: false,
          },
          {
            id: 'visual' as const,
            label: 'Visual',
            icon: Layers,
            active: isSheetOpen && (inspectorTab === 'visual' || inspectorTab === 'position'),
            hidden: activePostFormat === 'reel',
          },
          {
            id: 'review' as const,
            label: 'Publish',
            icon: CheckCircle2,
            active: isSheetOpen && (inspectorTab === 'review' || inspectorTab === 'caption'),
            hidden: false,
          },
        ]
          .filter((item) => !item.hidden)
          .map((item) => {
            const Icon = item.icon;
            const isReviewRed = item.id === 'review' && hasContentQualityBlocker;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`mobile-tab-${item.id}`}
                onClick={() => {
                  if (isSheetOpen && inspectorTab === item.id) {
                    onCloseSheet();
                  } else {
                    onSelectTab(item.id);
                  }
                }}
                className={`flex-1 min-w-0 flex items-center justify-center gap-1 py-2 px-1.5 min-h-[40px] rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isReviewRed
                    ? item.active
                      ? 'bg-rose-500/30 text-rose-200 border border-rose-400/70 shadow-sm'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/55 active:bg-rose-500/30'
                    : item.active
                    ? 'bg-white/15 text-white border border-white/25 shadow-sm'
                    : 'bg-white/[0.04] text-slate-300 border border-white/[0.08] active:bg-white/10'
                }`}
                style={item.active && !isReviewRed ? { color: theme.accent } : undefined}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isReviewRed ? 'text-rose-300' : ''}`} />
                <span>{item.label}</span>
                {item.id === 'review' && (
                  <span
                    data-testid="mobile-pok-status-badge"
                    className={`text-[9px] font-mono tabular-nums px-1 py-0.2 rounded shrink-0 ${
                      isReviewRed
                        ? 'bg-rose-500/40 text-rose-100 border border-rose-400/70'
                        : isBlocked
                        ? 'bg-rose-500/25 text-rose-300 border border-rose-400/40'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/30'
                    }`}
                  >
                    {isBlocked || hasContentQualityBlocker ? `!${Math.max(1, blockersCount)}` : '✓'}
                  </span>
                )}
              </button>
            );
          })}
      </div>

      {/* Mobile More Actions Menu + Primary Export Action */}
      <div className="flex items-center gap-1 shrink-0">
        <div className="relative">
          <button
            type="button"
            onClick={() => onSetIsMoreMenuOpen((prev) => !prev)}
            className="p-2 min-h-[40px] min-w-[34px] rounded-xl bg-white/[0.05] border border-white/10 text-slate-300 active:bg-white/15 flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400"
            aria-label="More slide actions"
            aria-expanded={isMoreMenuOpen}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {isMoreMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => onSetIsMoreMenuOpen(false)}
              />
              <div className="absolute right-0 bottom-full mb-2 w-64 bg-[#0d151e] border border-white/15 rounded-2xl shadow-2xl p-2 z-50 flex flex-col gap-1 text-xs">
                {/* Quick History & Compare Controls */}
                {(onUndo || onRedo || (onCompareBeforeStart && onCompareBeforeEnd)) && (
                  <div className="px-1.5 py-1.5 border-b border-white/10 mb-0.5 flex items-center gap-1">
                    {onUndo && (
                      <button
                        type="button"
                        data-testid="mobile-undo-btn"
                        disabled={!canUndo}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onUndo();
                          onSetIsMoreMenuOpen(false);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-slate-200 disabled:opacity-35 cursor-pointer"
                      >
                        <Undo2 className="w-3 h-3" />
                        <span>Undo</span>
                      </button>
                    )}
                    {onRedo && (
                      <button
                        type="button"
                        data-testid="mobile-redo-btn"
                        disabled={!canRedo}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          onRedo();
                          onSetIsMoreMenuOpen(false);
                        }}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-slate-200 disabled:opacity-35 cursor-pointer"
                      >
                        <Redo2 className="w-3 h-3" />
                        <span>Redo</span>
                      </button>
                    )}
                    {onCompareBeforeStart && onCompareBeforeEnd && (
                      <button
                        type="button"
                        data-testid="mobile-compare-before-btn"
                        onPointerDown={onCompareBeforeStart}
                        onPointerUp={onCompareBeforeEnd}
                        onPointerLeave={onCompareBeforeEnd}
                        onPointerCancel={onCompareBeforeEnd}
                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border text-[11px] font-bold cursor-pointer select-none ${
                          isComparingBefore
                            ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                            : 'bg-white/[0.05] border-white/10 text-slate-200'
                        }`}
                      >
                        <Eye className="w-3 h-3" />
                        <span>Before</span>
                      </button>
                    )}
                  </div>
                )}

                {activePostFormat !== 'reel' && (
                  <div className="px-2 py-1.5 border-b border-white/10 mb-0.5 space-y-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">
                      Export Presets (JPG Quality 92)
                    </span>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'tiktok-9:16', label: '9:16 TikTok' },
                          { id: 'ig-4:5', label: '4:5 IG' },
                          { id: 'ig-1:1', label: '1:1' },
                        ] as const
                      ).map((preset) => {
                        const active = activeDimensionSpec.id === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              onSelectDimensionPreset(preset.id);
                              onSetIsMoreMenuOpen(false);
                            }}
                            className={`px-1.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                              active
                                ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                                : 'bg-black/60 text-slate-300 border border-white/10 hover:text-white'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {onOpenPublishScheduleModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onSetIsMoreMenuOpen(false);
                      onOpenPublishScheduleModal('single');
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-white/10 text-slate-200 transition-colors text-left cursor-pointer"
                  >
                    <BookmarkCheck className="w-4 h-4" style={{ color: theme.accent }} />
                    <span>Publish & Schedule Hub</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    downloadSingleSlidePng(
                      carousel,
                      currentSlideIndex,
                      activePostFormat === 'single'
                        ? `MARROK_Post_${activeDimensionSpec.width}x${activeDimensionSpec.height}.jpg`
                        : `MARROK_Slide_${currentSlideIndex + 1}_${activeDimensionSpec.width}x${activeDimensionSpec.height}.jpg`,
                      theme,
                      carousel.visualOptions
                    );
                    onSetIsMoreMenuOpen(false);
                    onShowToast(
                      `Downloaded Slide ${currentSlideIndex + 1} (${activeDimensionSpec.width}×${activeDimensionSpec.height}) JPG`
                    );
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-white/10 text-slate-200 transition-colors text-left cursor-pointer"
                >
                  <Download className="w-4 h-4 text-cyan-400" />
                  <span>Download Slide JPG ({activeDimensionSpec.shortLabel})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onCopySlide();
                    onSetIsMoreMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-white/10 text-slate-200 transition-colors text-left cursor-pointer"
                >
                  <Copy className="w-4 h-4 text-slate-400" />
                  <span>Copy Slide Image</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onCopyCaption();
                    onSetIsMoreMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-white/10 text-slate-200 transition-colors text-left cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span>Copy Caption Text</span>
                </button>

                {activePostFormat !== 'single' && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenContactSheet?.();
                      onSetIsMoreMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl hover:bg-white/10 text-slate-200 transition-colors text-left cursor-pointer"
                  >
                    <LayoutGrid className="w-4 h-4 text-indigo-400" />
                    <span>All Slides Grid</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            if (isBlocked) {
              onSelectTab('review');
              onShowToast(
                `⚠️ ${blockersCount} item${blockersCount > 1 ? 's' : ''} need attention in Publish before export`
              );
              return;
            }
            if (activePostFormat === 'reel') {
              onOpenMotionExport();
            } else {
              onExportZip('all');
            }
          }}
          disabled={isExportingZip}
          className={`flex items-center gap-1 px-2.5 py-2 min-h-[40px] rounded-xl font-bold text-[11px] transition-all shadow-md cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-cyan-400 whitespace-nowrap ${
            isBlocked
              ? hasContentQualityBlocker
                ? 'bg-rose-500/25 text-rose-200 border border-rose-500/55'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              : 'text-slate-950 active:scale-95'
          }`}
          style={!isBlocked ? { backgroundColor: theme.accent } : undefined}
          title={
            isBlocked
              ? `${blockersCount} item${blockersCount > 1 ? 's' : ''} need attention in Publish`
              : activePostFormat === 'reel'
              ? 'Export Motion Reel Video'
              : 'Export 5-in-1 Ready to Share ZIP (All 5 Social Formats)'
          }
          aria-label={
            isBlocked
              ? `${blockersCount} items need attention before publishing. Tap to review.`
              : 'Export Post Bundle'
          }
        >
          {isExportingZip ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : isBlocked ? (
            <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${hasContentQualityBlocker ? 'text-rose-300' : 'text-amber-400'}`} />
          ) : activePostFormat === 'reel' ? (
            <Film className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
          ) : (
            <Download className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
          )}
          <span>
            {isBlocked
              ? `${blockersCount} Check${blockersCount > 1 ? 's' : ''}`
              : activePostFormat === 'reel'
              ? 'Video'
              : 'Export'}
          </span>
        </button>
      </div>
    </div>
  );
};
