import React, { useState, useRef, useEffect } from 'react';
import {
  Image as ImageIcon,
  Video,
  Upload,
  ClipboardPaste,
  Maximize2,
  Minimize2,
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
  Loader2,
  Sparkles,
} from 'lucide-react';
import {
  CarouselData,
  SlideData,
  SlideType,
  ThemePalette,
} from '../../../types.ts';
import {
  ACCEPTED_SINGLE_SLIDE_MEDIA_ACCEPT,
  isVideoFile,
  isVideoUrl,
  isVideoSlide,
  getSlideMediaUrl,
} from '../../../lib/canvas/constants.ts';

export const EXPECTATIONS_VS_REALITY_MEME_URL = '/assets/aistudio/1793547809949_4a78bc04.jpg';

export interface ImageArchetypeEditorProps {
  currentSlide: SlideData;
  carousel?: CarouselData;
  theme: ThemePalette;
  totalSlides: number;
  onSetSlideType: (type: SlideType) => void;
  onUpdateField: (field: keyof SlideData, value: any) => void;
  onUpdateSlideFields?: (updates: Partial<SlideData>) => void;
  onUpdateCarouselField?: (field: keyof CarouselData, value: any) => void;
  onOpenAiImageStudio: () => void;
  onOpenMediaSearch: () => void;
  onExportVideoMp4?: (fps?: 30 | 60) => void;
  isExportingVideo?: boolean;
  videoExportProgress?: number;
  videoExportStage?: string;
  onGenerateFromVideo?: (fileOrUrl?: File | string) => void;
  isGeneratingFromVideo?: boolean;
}

export const ImageArchetypeEditor: React.FC<ImageArchetypeEditorProps> = ({
  currentSlide,
  carousel,
  theme,
  totalSlides,
  onSetSlideType,
  onUpdateField,
  onUpdateSlideFields,
  onUpdateCarouselField,
  onOpenAiImageStudio,
  onOpenMediaSearch,
  onExportVideoMp4,
  isExportingVideo = false,
  videoExportProgress = 0,
  videoExportStage = '',
  onGenerateFromVideo,
  isGeneratingFromVideo = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [selectedVideoFps, setSelectedVideoFps] = useState<30 | 60>(30);

  const applySlideBatchUpdates = (updates: Partial<SlideData>) => {
    if (onUpdateSlideFields) {
      onUpdateSlideFields(updates);
    } else {
      Object.entries(updates).forEach(([key, val]) => {
        onUpdateField(key as keyof SlideData, val);
      });
    }
  };

  const handleMediaFileUpload = (file: File) => {
    const targetType: SlideType =
      currentSlide.type === 'poster' || carousel?.postFormat === 'single' || totalSlides === 1
        ? 'poster'
        : 'image';

    if (isVideoFile(file)) {
      const applyVideoSource = (videoSrc: string) => {
        if (!videoSrc) return;
        if (currentSlide.type !== targetType) {
          onSetSlideType(targetType);
        }
        if (
          onUpdateCarouselField &&
          (targetType === 'poster' || carousel?.postFormat === 'single' || totalSlides === 1) &&
          !carousel?.dimensionPreset
        ) {
          onUpdateCarouselField('dimensionPreset', 'ig-3:4');
        }
        applySlideBatchUpdates({
          type: targetType,
          mediaType: 'video',
          videoUrl: videoSrc,
          videoMimeType: file.type || 'video/mp4',
          videoFileName: file.name,
          videoMuted: true,
          videoPlaying: true,
          videoBorderRadius: 8,
          imageUrl: '',
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
        if (onGenerateFromVideo) {
          onGenerateFromVideo(file);
        }
      };

      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        try {
          const blobUrl = URL.createObjectURL(file);
          if (blobUrl) {
            applyVideoSource(blobUrl);
            return;
          }
        } catch {
          // Fallback to FileReader below
        }
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        applyVideoSource(dataUrl);
      };
      reader.readAsDataURL(file);
      return;
    }

    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      if (currentSlide.type !== targetType) {
        onSetSlideType(targetType);
      }
      applySlideBatchUpdates({
        type: targetType,
        mediaType: 'image',
        videoUrl: '',
        videoMimeType: undefined,
        videoFileName: undefined,
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
      mediaType: 'image',
      videoUrl: '',
      videoMimeType: undefined,
      videoFileName: undefined,
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
        const item = items[i];
        if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
          const file = item.getAsFile();
          if (file) {
            handleMediaFileUpload(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, [currentSlide.type, carousel?.postFormat, totalSlides]);

  return (
    <div className="pt-3 border-t border-white/[0.08] animate-fade-in">
      <div className="space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {isVideoSlide(currentSlide) ? (
              <Video className="w-4 h-4" style={{ color: theme.accent }} />
            ) : (
              <ImageIcon className="w-4 h-4" style={{ color: theme.accent }} />
            )}
            <div>
              <span className="text-xs font-bold text-white block">
                Branded Meme, Video & Hero Media Frame
              </span>
              <span className="text-[10px] text-slate-400 block">
                Drop an image or video (.mp4, .webm, .mov) inside the white card with @MARROK corner watermark
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              data-testid="upload-media-btn"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Meme / Video</span>
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
            {(currentSlide.imageUrl || currentSlide.videoUrl) && (
              <button
                type="button"
                data-testid="clear-media-btn"
                onClick={() =>
                  applySlideBatchUpdates({
                    mediaType: undefined,
                    videoUrl: '',
                    videoMimeType: undefined,
                    videoFileName: undefined,
                    imageUrl: '',
                    imageFrameMode: 'standard',
                  })
                }
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold cursor-pointer whitespace-nowrap"
                title="Clear attached media and return to schematic diagram"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear Media</span>
              </button>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          data-testid="single-slide-media-input"
          type="file"
          accept={ACCEPTED_SINGLE_SLIDE_MEDIA_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleMediaFileUpload(file);
            e.target.value = '';
          }}
        />

        {/* Drag & Drop Upload Zone + Ready Meme Preset Card */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div
            data-testid="media-drop-zone"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              const file = e.dataTransfer?.files?.[0];
              if (file) handleMediaFileUpload(file);
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
              <span>Drop Image or Video (.mp4, .webm, .mov)</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono">
              <ClipboardPaste className="w-3 h-3" />
              <span>Or press Ctrl+V / Cmd+V to paste media</span>
            </div>
          </div>

          {/* 1-Click Preset: Attached Expectations vs Reality Meme */}
          <button
            type="button"
            onClick={handleApplyExpectationsMemePreset}
            className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              currentSlide.imageUrl === EXPECTATIONS_VS_REALITY_MEME_URL &&
              !isVideoSlide(currentSlide)
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

        {/* Video Playback Controls, Fit Mode Toggle & 1080x1440 MP4 Export Pipeline */}
        {isVideoSlide(currentSlide) && (
          <div
            data-testid="video-preview-and-export-panel"
            className="p-3 rounded-xl bg-cyan-950/25 border border-cyan-500/30 space-y-3"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-cyan-400" />
                <div>
                  <span className="text-xs font-bold text-white block">
                    Video Preview & 1080×1440 MP4 Export
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono block">
                    {currentSlide.videoFileName || 'Active Video Track'}
                    {currentSlide.videoDuration
                      ? ` · ${currentSlide.videoDuration.toFixed(1)}s`
                      : ''}{' '}
                    · Corner registration marks & @MARROK badge layered above video
                  </span>
                </div>
              </div>

              {/* Playback Controls */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  data-testid="sidebar-video-play-toggle"
                  onClick={() =>
                    onUpdateField(
                      'videoPlaying',
                      !(currentSlide.videoPlaying ?? true)
                    )
                  }
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-mono font-bold text-white cursor-pointer"
                >
                  {(currentSlide.videoPlaying ?? true) ? (
                    <>
                      <Pause className="w-3.5 h-3.5 text-amber-400" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Play</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  data-testid="sidebar-video-mute-toggle"
                  onClick={() =>
                    onUpdateField(
                      'videoMuted',
                      !(currentSlide.videoMuted ?? true)
                    )
                  }
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-mono font-bold text-white cursor-pointer"
                >
                  {(currentSlide.videoMuted ?? true) ? (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                      <span>Unmute</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Mute</span>
                    </>
                  )}
                </button>

                <div className="flex items-center bg-black/60 p-0.5 rounded-lg border border-white/15">
                  <button
                    type="button"
                    data-testid="sidebar-video-fit-contain"
                    onClick={() => onUpdateField('imageFit', 'contain')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                      (currentSlide.imageFit || 'contain') === 'contain'
                        ? 'bg-cyan-500/30 text-cyan-200'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Contain (Default for 16:9 videos): Fits full video horizontally inside padded white card"
                  >
                    <Minimize2 className="w-3 h-3" />
                    <span>Contain</span>
                  </button>
                  <button
                    type="button"
                    data-testid="sidebar-video-fit-cover"
                    onClick={() => onUpdateField('imageFit', 'cover')}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                      currentSlide.imageFit === 'cover'
                        ? 'bg-cyan-500/30 text-cyan-200'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Cover (Full Card): Fills inner white card area while respecting padding and corner overlays"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>Cover</span>
                  </button>
                </div>
              </div>
            </div>

            {/* MP4 Export Action Row + FPS Selector */}
            <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-300">Frame Rate:</span>
                <div className="flex items-center bg-black/60 p-0.5 rounded-lg border border-white/15">
                  {([30, 60] as const).map((fpsOpt) => (
                    <button
                      key={fpsOpt}
                      type="button"
                      data-testid={`video-fps-${fpsOpt}`}
                      onClick={() => setSelectedVideoFps(fpsOpt)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                        selectedVideoFps === fpsOpt
                          ? 'bg-white/20 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {fpsOpt} FPS
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {onGenerateFromVideo && (
                  <button
                    type="button"
                    data-testid="sidebar-generate-from-video-btn"
                    disabled={isGeneratingFromVideo}
                    onClick={() => onGenerateFromVideo()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-60 border border-cyan-400/40 text-cyan-200 font-bold text-xs transition-all cursor-pointer"
                    title="Extract keyframes from video and generate bilingual slide headline, body copy, and social media caption"
                  >
                    {isGeneratingFromVideo ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
                        <span>Analyzing Video...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                        <span>Generate Text & Caption from Video</span>
                      </>
                    )}
                  </button>
                )}

                {onExportVideoMp4 && (
                  <button
                    type="button"
                    data-testid="export-single-slide-mp4-btn"
                    disabled={isExportingVideo}
                    onClick={() => onExportVideoMp4(selectedVideoFps)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 font-bold text-xs shadow-lg transition-all cursor-pointer"
                  >
                    {isExportingVideo ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Rendering MP4 ({Math.round(videoExportProgress)}%)...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>Export 1080×1440 MP4</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Progress Bar during MP4 Rendering/Encoding */}
            {isExportingVideo && (
              <div data-testid="video-export-progress-bar" className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono text-cyan-200">
                  <span>{videoExportStage || 'Encoding 1080×1440 MP4 frames...'}</span>
                  <span>{Math.round(videoExportProgress)}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-black/60 overflow-hidden border border-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-150"
                    style={{ width: `${Math.max(4, Math.min(100, videoExportProgress))}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Frame Size, Matte Backdrop, Fit Mode, Filter & Brand Watermark Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* 1. Frame Size Mode */}
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
                  (currentSlide.imageUrl || isVideoSlide(currentSlide) ? 'full' : 'standard');
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

          {/* 2. Media Fit Mode */}
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">
              Media Fit Mode (Contain / Cover)
            </label>
            <div className="grid grid-cols-2 gap-1 bg-black/60 p-0.5 rounded-lg border border-white/10">
              {(['contain', 'cover'] as const).map((fitMode) => {
                const active = (currentSlide.imageFit || 'contain') === fitMode;
                return (
                  <button
                    key={fitMode}
                    type="button"
                    data-testid={`media-fit-${fitMode}`}
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
                  isVideoSlide(currentSlide) ||
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

        {/* Media URL, Color Filter & Caption */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">
              Media URL / Asset Path (Image or .mp4/.webm/.mov)
            </label>
            <input
              type="text"
              data-testid="media-url-input"
              value={getSlideMediaUrl(currentSlide)}
              onChange={(e) => {
                const val = e.target.value;
                if (isVideoUrl(val)) {
                  applySlideBatchUpdates({
                    mediaType: 'video',
                    videoUrl: val,
                    imageUrl: '',
                    imageFrameMode: currentSlide.imageFrameMode || 'full',
                    imageFit: currentSlide.imageFit || 'contain',
                    imageBgStyle: currentSlide.imageBgStyle || 'white',
                    brandWatermark: currentSlide.brandWatermark || 'bottom-right',
                  });
                } else {
                  applySlideBatchUpdates({
                    mediaType: val ? 'image' : undefined,
                    videoUrl: '',
                    imageUrl: val,
                  });
                }
              }}
              placeholder="/assets/... or https://... (.jpg, .png, .mp4)"
              className="w-full bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Color Filter</label>
            <div className="grid grid-cols-4 gap-1 bg-black/60 p-0.5 rounded-lg border border-white/10">
              {(
                [
                  { id: 'clean', label: 'Clean' },
                  { id: 'hud', label: 'Blueprint' },
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
        {(currentSlide.imageUrl || isVideoSlide(currentSlide)) && (
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
  );
};
