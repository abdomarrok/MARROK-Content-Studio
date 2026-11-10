import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Check,
  Copy,
  FileText,
  Download,
  Layers,
  LayoutGrid,
  Smartphone,
  BookmarkCheck,
  Film,
  Volume2,
  Code,
  MoreHorizontal,
} from 'lucide-react';
import {
  CarouselData,
  PostFormat,
  SlideData,
  ThemePalette,
  MotionReelData,
  CanvasDimensionPreset,
} from '../../../types.ts';
import {
  downloadSingleSlidePng,
  getCanvasDimensionSpec,
  CANVAS_DIMENSION_PRESET_LIST,
  isVideoSlide,
  type ExportBundleMode,
} from '../../../lib/canvasExporter.ts';
import {
  getMotionTemplate,
  generateCues,
  synthesizeSfxFloat32Buffer,
  encodeWavBlob,
  triggerBlobDownload,
} from '../../../lib/motion/index.ts';

export interface UnderCanvasDeliveryDockProps {
  carousel: CarouselData;
  currentSlide: SlideData;
  currentSlideIndex: number;
  activePostFormat: PostFormat;
  activeReelConfig: MotionReelData;
  theme: ThemePalette;
  isBlocked: boolean;
  blockersCount: number;
  copiedType: 'caption' | 'slide' | null;
  isExportingVideo: boolean;
  videoExportProgress: number;
  isExportingZip: boolean;
  exportProgress: { current: number; total: number } | null;
  isMoreMenuOpen: boolean;
  onSetIsMoreMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSelectDimensionPreset: (preset: CanvasDimensionPreset) => void;
  onCopySlide: () => void;
  onCopyCaption: () => void;
  onExportSingleSlideVideoMp4: (fps?: 30 | 60) => void | Promise<void>;
  onExportZip: (mode: ExportBundleMode) => void;
  onOpenMotionExport: () => void;
  onOpenContactSheet?: () => void;
  onOpenPublishScheduleModal?: (tab?: 'single' | 'bulk' | 'storage') => void;
  onInspectBlockers: () => void;
  onShowToast: (msg: string) => void;
}

export const UnderCanvasDeliveryDock: React.FC<UnderCanvasDeliveryDockProps> = ({
  carousel,
  currentSlide,
  currentSlideIndex,
  activePostFormat,
  activeReelConfig,
  theme,
  isBlocked,
  blockersCount,
  copiedType,
  isExportingVideo,
  videoExportProgress,
  isExportingZip,
  exportProgress,
  isMoreMenuOpen,
  onSetIsMoreMenuOpen,
  onSelectDimensionPreset,
  onCopySlide,
  onCopyCaption,
  onExportSingleSlideVideoMp4,
  onExportZip,
  onOpenMotionExport,
  onOpenContactSheet,
  onOpenPublishScheduleModal,
  onInspectBlockers,
  onShowToast,
}) => {
  const activeDimensionSpec = getCanvasDimensionSpec(carousel.dimensionPreset);

  return (
    <div
      data-testid="under-canvas-delivery-bar"
      className={`hidden lg:flex w-full items-center justify-between gap-2 flex-wrap ${
        activePostFormat !== 'reel' ? 'pt-2 border-t border-white/[0.06]' : ''
      }`}
    >
      {/* Left: Readiness Status Badge & Social Dimension Selector */}
      <div className="flex items-center gap-2 text-xs font-mono text-slate-400 flex-wrap">
        <button
          type="button"
          onClick={onInspectBlockers}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-mono tabular-nums font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            isBlocked
              ? 'bg-amber-500/15 border-amber-500/35 text-amber-300 hover:bg-amber-500/25'
              : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/25'
          }`}
          title="View readiness status and pre-export checklist in Publish tab"
        >
          {isBlocked ? (
            <>
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
              <span>
                {blockersCount} Check{blockersCount > 1 ? 's' : ''}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>Ready</span>
            </>
          )}
        </button>

        {activePostFormat === 'reel' ? (
          <span className="text-[11px] font-mono tabular-nums text-slate-300">
            1080×1920 · {activeReelConfig.duration.toFixed(1)}s
          </span>
        ) : (
          <select
            aria-label="Social Media Export Format"
            value={activeDimensionSpec.id}
            onChange={(e) => onSelectDimensionPreset(e.target.value as CanvasDimensionPreset)}
            className="px-2 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/15 text-[11px] font-mono tabular-nums text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
            title="Select Social Media Format for Slide Export"
          >
            {CANVAS_DIMENSION_PRESET_LIST.map((preset) => (
              <option key={preset.id} value={preset.id} className="bg-[#080d11] text-slate-200">
                {preset.shortLabel} ({preset.width}×{preset.height})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Right: Consolidated Delivery Actions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {activePostFormat !== 'reel' && (
          <>
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
                onShowToast(
                  `Downloaded Slide ${currentSlideIndex + 1} (${activeDimensionSpec.width}×${activeDimensionSpec.height}) JPG`
                );
              }}
              className="hidden sm:flex items-center gap-1 py-1.5 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title={`Download Slide ${currentSlideIndex + 1} JPG (${activeDimensionSpec.label})`}
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>JPG</span>
            </button>

            <button
              type="button"
              onClick={onCopySlide}
              className="hidden sm:flex items-center gap-1 py-1.5 px-2.5 rounded-xl bg-white/[0.05] hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Copy current slide image to clipboard"
            >
              {copiedType === 'slide' ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span>{copiedType === 'slide' ? 'Copied' : 'Copy Image'}</span>
            </button>
          </>
        )}

        {activePostFormat !== 'reel' && isVideoSlide(currentSlide) && (
          <button
            type="button"
            data-testid="dock-export-video-mp4-btn"
            onClick={() => onExportSingleSlideVideoMp4(30)}
            disabled={isExportingVideo}
            className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-bold text-emerald-200 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            title="Export 1080×1440 MP4 video with white card frame, registration marks, and audio track"
          >
            {isExportingVideo ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-300" />
                <span>MP4 {Math.round(videoExportProgress)}%</span>
              </>
            ) : (
              <>
                <Film className="w-3.5 h-3.5 text-emerald-300" />
                <span>Export MP4</span>
              </>
            )}
          </button>
        )}

        {/* Secondary Actions 'More' Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => onSetIsMoreMenuOpen((prev) => !prev)}
            className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center"
            title="More export packs & tools (5-in-1 Pack, Dual Pack, Schedule, All Slides Grid)"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {isMoreMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => onSetIsMoreMenuOpen(false)}
              />
              <div className="absolute right-0 bottom-full mb-2 w-68 bg-[#0d151e] border border-white/10 rounded-xl shadow-2xl p-1.5 z-50 flex flex-col gap-0.5 text-xs">
                {onOpenPublishScheduleModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onSetIsMoreMenuOpen(false);
                      onOpenPublishScheduleModal('single');
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-slate-200 transition-colors text-left cursor-pointer"
                  >
                    <BookmarkCheck className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                    <span>Publish & Schedule Studio</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onCopySlide();
                    onSetIsMoreMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-slate-200 transition-colors text-left cursor-pointer"
                >
                  {copiedType === 'slide' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>{copiedType === 'slide' ? 'Copied Image' : 'Copy Slide Image'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onCopyCaption();
                    onSetIsMoreMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-slate-200 transition-colors text-left cursor-pointer"
                >
                  {copiedType === 'caption' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span>{copiedType === 'caption' ? 'Copied Caption Text' : 'Copy Caption Text'}</span>
                </button>

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
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-slate-200 transition-colors text-left cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Download Slide JPG ({activeDimensionSpec.shortLabel})</span>
                </button>

                {activePostFormat !== 'reel' && (
                  <>
                    <div className="h-px bg-white/10 my-1" />
                    <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      Ready-to-Share Social Packs
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onSetIsMoreMenuOpen(false);
                        onExportZip('all');
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 font-semibold transition-colors text-left cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5 text-cyan-400" />
                      <span>5-in-1 Ready to Share (All 5 Formats)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSetIsMoreMenuOpen(false);
                        onExportZip('dual');
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-slate-200 transition-colors text-left cursor-pointer"
                    >
                      <Smartphone className="w-3.5 h-3.5 text-pink-400" />
                      <span>Export Dual Pack (TikTok + IG 4:5)</span>
                    </button>

                    <div className="px-2.5 pt-1 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      Export Individual Format ZIP
                    </div>
                    <div className="grid grid-cols-2 gap-1 px-2 py-1">
                      {CANVAS_DIMENSION_PRESET_LIST.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            onSetIsMoreMenuOpen(false);
                            onExportZip(preset.id);
                          }}
                          className="flex items-center justify-between px-2 py-1 rounded bg-white/[0.04] hover:bg-white/12 border border-white/10 text-[10px] font-mono tabular-nums text-slate-200 cursor-pointer"
                          title={`Export all slides in ${preset.label}`}
                        >
                          <span>{preset.shortLabel}</span>
                          <span className="text-slate-400">{preset.aspectRatioLabel}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {activePostFormat !== 'single' && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenContactSheet?.();
                      onSetIsMoreMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-slate-200 transition-colors text-left cursor-pointer"
                  >
                    <LayoutGrid className="w-3.5 h-3.5 text-indigo-400" />
                    <span>All Slides Grid (Contact Sheet)</span>
                  </button>
                )}

                {activePostFormat === 'reel' && (
                  <>
                    <div className="h-px bg-white/10 my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        const cues = generateCues(activeReelConfig.scenes || []);
                        const { samples, sampleRate } = synthesizeSfxFloat32Buffer(
                          cues,
                          activeReelConfig.duration || 20
                        );
                        const wavBlob = encodeWavBlob(samples, sampleRate);
                        triggerBlobDownload(wavBlob, 'MARROK_MotionReel_SFX.wav');
                        onShowToast('Downloaded 48kHz Procedural SFX WAV track');
                        onSetIsMoreMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-slate-200 transition-colors text-left cursor-pointer"
                    >
                      <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>SFX .WAV</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const tpl = getMotionTemplate(activeReelConfig.templateId);
                        const html = tpl.toHTML(activeReelConfig);
                        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                        triggerBlobDownload(blob, 'MARROK_MotionReel_1080x1920.html');
                        onShowToast('Downloaded standalone HTML5 animation player');
                        onSetIsMoreMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-slate-200 transition-colors text-left cursor-pointer"
                    >
                      <Code className="w-3.5 h-3.5 text-purple-400" />
                      <span>HTML5 Player</span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Primary Export Action Button */}
        {isBlocked ? (
          <button
            type="button"
            onClick={() => {
              onInspectBlockers();
              onShowToast(
                `⚠️ ${blockersCount} item${blockersCount > 1 ? 's' : ''} need attention in Publish before exporting.`
              );
            }}
            className="py-1.5 px-3.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            title="Click to view and resolve blockers in Publish checklist"
          >
            <AlertTriangle className="w-3.5 h-3.5 stroke-[2.5] text-amber-400" />
            <span>
              {blockersCount} Check{blockersCount > 1 ? 's' : ''} Needed →
            </span>
          </button>
        ) : activePostFormat === 'reel' ? (
          <button
            type="button"
            aria-label="Export Post Bundle"
            onClick={onOpenMotionExport}
            className="py-1.5 px-3.5 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-950 transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            style={{ backgroundColor: theme.accent }}
            title="Render & download 1080×1920 Motion Reel video with procedural SFX"
          >
            <Film className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Export Video</span>
          </button>
        ) : (
          <button
            type="button"
            aria-label="Export Post Bundle"
            onClick={() => onExportZip('all')}
            disabled={isExportingZip}
            className="py-1.5 px-3.5 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-950 transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            style={{ backgroundColor: theme.accent }}
            title="Export 5-in-1 Ready to Share ZIP (TikTok 9:16, IG 4:5, IG 3:4, IG 1:1, IG Reels 9:16 + Ready-to-Paste Captions)"
          >
            {isExportingZip && exportProgress ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>
                  {exportProgress.current}/{exportProgress.total}
                </span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Export ZIP</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
