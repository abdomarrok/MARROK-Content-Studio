import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Copy,
  FileText,
  Download,
  Sliders,
  Type,
  Layers,
  LayoutGrid,
  BookmarkCheck,
  Film,
  MoreHorizontal,
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
  CANVAS_DIMENSION_PRESET_LIST,
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
  onShowToast,
}) => {
  const activeDimensionSpec = getCanvasDimensionSpec(carousel.dimensionPreset);

  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-[58px] bg-[#080d11]/95 border-t border-white/10 px-2 backdrop-blur-md flex items-center justify-between gap-1 shadow-2xl">
      {/* Direct Step / Inspector Sheet Triggers */}
      <div className="flex items-center gap-1 flex-1 min-w-0">
        {[
          {
            id: 'copy' as const,
            label: activePostFormat === 'reel' ? 'Motion' : 'Slide Text',
            icon: activePostFormat === 'reel' ? Film : Type,
            active: isSheetOpen && inspectorTab === 'copy',
            hidden: false,
          },
          {
            id: 'visual' as const,
            label: 'Design',
            icon: Layers,
            active: isSheetOpen && inspectorTab === 'visual',
            hidden: activePostFormat === 'reel',
          },
          {
            id: 'position' as const,
            label: 'Adjust',
            icon: Sliders,
            active: isSheetOpen && inspectorTab === 'position',
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
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (isSheetOpen && inspectorTab === item.id) {
                    onCloseSheet();
                  } else {
                    onSelectTab(item.id);
                  }
                }}
                className={`flex-1 flex items-center justify-center gap-1 py-2 px-1.5 min-h-[40px] rounded-xl text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap min-w-0 ${
                  item.active
                    ? 'bg-white/15 text-white border border-white/20 shadow-sm'
                    : 'bg-white/[0.03] text-slate-300 border border-white/[0.06] active:bg-white/10'
                }`}
                style={item.active ? { color: theme.accent } : undefined}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.id === 'review' && (
                  <span
                    className={`text-[9px] font-mono tabular-nums px-1 rounded shrink-0 ${
                      isBlocked
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {isBlocked ? blockersCount : 'OK'}
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
            className="p-2 min-h-[40px] min-w-[38px] rounded-xl bg-white/[0.05] border border-white/10 text-slate-300 active:bg-white/15 flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-cyan-400"
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
                {activePostFormat !== 'reel' && (
                  <div className="px-2 py-1 border-b border-white/10 mb-0.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                      Export Dimension Preset
                    </span>
                    <select
                      value={activeDimensionSpec.id}
                      onChange={(e) => {
                        onSelectDimensionPreset(e.target.value as CanvasDimensionPreset);
                        onSetIsMoreMenuOpen(false);
                      }}
                      className="w-full px-2 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs font-mono text-white"
                    >
                      {CANVAS_DIMENSION_PRESET_LIST.map((preset) => (
                        <option key={preset.id} value={preset.id} className="bg-[#080d11] text-slate-200">
                          {preset.shortLabel} ({preset.width}×{preset.height})
                        </option>
                      ))}
                    </select>
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
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
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
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
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
