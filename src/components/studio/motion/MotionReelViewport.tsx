import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  RefreshCw,
  Layers,
  Film,
  Upload,
  Video,
} from 'lucide-react';
import { MotionReelData, SlideData, ThemePalette } from '../../../types.ts';
import {
  MOTION_W,
  MOTION_H,
  drawMotionReelFrame,
  generateCues,
  playProceduralSfxCue,
} from '../../../lib/motion/index.ts';
import { isVideoFile } from '../../../lib/canvasExporter.ts';

interface MotionReelViewportProps {
  reelConfig: MotionReelData;
  theme: ThemePalette;
  selectedSceneId?: string | null;
  isExporting?: boolean;
  activeVideoSlide?: SlideData | null;
  onSelectScene?: (sceneId: string) => void;
  onToggleSfx?: () => void;
  onSyncFromCarousel?: () => void;
  onRestoreCarousel?: () => void;
  onOpenExportModal?: () => void;
  onUploadVideoFile?: (file: File) => void;
  onSwitchToVideoCardReel?: () => void;
}

const SCENE_COLORS = [
  '#6ea0ff',
  '#a78bfa',
  '#f472b6',
  '#34d399',
  '#fbbf24',
  '#fb923c',
  '#60a5fa',
];

export const MotionReelViewport: React.FC<MotionReelViewportProps> = ({
  reelConfig,
  theme,
  selectedSceneId,
  isExporting = false,
  activeVideoSlide = null,
  onSelectScene,
  onToggleSfx,
  onSyncFromCarousel,
  onRestoreCarousel,
  onOpenExportModal,
  onUploadVideoFile,
  onSwitchToVideoCardReel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<number>(1);

  const animFrameRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(true);
  const isExportingRef = useRef<boolean>(isExporting);
  const speedRef = useRef<number>(1);
  const reelConfigRef = useRef<MotionReelData>(reelConfig);
  const themeRef = useRef<ThemePalette>(theme);
  const firedCuesRef = useRef<Set<number>>(new Set());

  reelConfigRef.current = reelConfig;
  themeRef.current = theme;
  speedRef.current = speed;
  isExportingRef.current = isExporting;
  isPlayingRef.current = isPlaying && !isExporting;

  const duration = Math.max(1, reelConfig.duration || 20);

  const renderAtTime = useCallback((t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cfg = reelConfigRef.current;
    const th = themeRef.current;
    const mergedCfg: MotionReelData = {
      ...cfg,
      brand: {
        ...cfg.brand,
        surfaceColor: cfg.brand.surfaceColor || th?.surface || '#12131C',
        surfaceBorder: cfg.brand.surfaceBorder || th?.surfaceBorder || '#252838',
        alertColor: cfg.brand.alertColor || th?.alert || '#FF3366',
      },
    };
    drawMotionReelFrame(ctx, mergedCfg.templateId, mergedCfg, t);
  }, []);

  const startLoop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    lastTsRef.current = performance.now();

    const loop = (ts: number) => {
      if (!isPlayingRef.current || isExportingRef.current) return;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;

      const cfg = reelConfigRef.current;
      const dur = Math.max(1, cfg.duration || 20);
      const prevTime = timeRef.current;
      let nextTime = prevTime + dt * speedRef.current;

      if (nextTime >= dur) {
        nextTime = 0;
        firedCuesRef.current.clear();
      }

      // Check procedural SFX cues crossed between prevTime and nextTime
      if (cfg.sfxEnabled !== false && cfg.sfxProfile !== 'silent') {
        const cues = generateCues(
          cfg.scenes || [],
          cfg.sfxProfile || 'warm-foley',
          cfg.defaultTransition || 'auto'
        );
        cues.forEach((cue, idx) => {
          if (cue.t >= prevTime && cue.t < nextTime && !firedCuesRef.current.has(idx)) {
            firedCuesRef.current.add(idx);
            playProceduralSfxCue(cue.type, cue.amp);
          }
        });
      }

      timeRef.current = nextTime;
      setCurrentTime(nextTime);
      renderAtTime(nextTime);
      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
  }, [renderAtTime]);

  useEffect(() => {
    if (!isExporting) {
      renderAtTime(timeRef.current);
    }
  }, [reelConfig, isExporting, renderAtTime]);

  useEffect(() => {
    if (isPlaying && !isExporting) {
      startLoop();
    } else if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, isExporting, startLoop]);

  const togglePlay = () => {
    const next = !isPlaying;
    setIsPlaying(next);
    isPlayingRef.current = next;
    if (next) {
      startLoop();
    } else if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    const newTime = (val / 1000) * duration;
    timeRef.current = newTime;
    firedCuesRef.current.clear();
    setCurrentTime(newTime);
    renderAtTime(newTime);
  };

  const jumpToScene = (sceneFrom: number, sceneId: string) => {
    const clamped = Math.max(0, Math.min(duration - 0.05, sceneFrom + 0.05));
    timeRef.current = clamped;
    firedCuesRef.current.clear();
    setCurrentTime(clamped);
    renderAtTime(clamped);
    onSelectScene?.(sceneId);
  };

  const toggleSpeed = () => {
    const speeds = [0.5, 1, 2];
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
  };

  const scrubberVal = duration > 0 ? Math.round((currentTime / duration) * 1000) : 0;
  const activeScene = reelConfig.scenes.find(
    (s) => currentTime >= s.from && currentTime < s.to
  );

  return (
    <div
      onDragOver={(e) => {
        if (!onUploadVideoFile) return;
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => {
        if (!onUploadVideoFile) return;
        e.preventDefault();
        setIsDraggingOver(false);
        const file = e.dataTransfer?.files?.[0];
        if (file && isVideoFile(file)) {
          onUploadVideoFile(file);
        }
      }}
      className="w-full h-full flex flex-col items-center justify-between gap-2"
    >
      {onUploadVideoFile && (
        <input
          ref={videoInputRef}
          type="file"
          data-testid="reel-viewport-video-input"
          accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUploadVideoFile(file);
            e.target.value = '';
          }}
        />
      )}

      {/* 9:16 Live Motion Canvas Container */}
      <div className="flex-1 min-h-0 flex items-center justify-center w-full">
        <div
          className={`relative h-full max-h-[580px] aspect-[9/16] rounded-2xl overflow-hidden border shadow-2xl bg-[#080A12] group transition-all ${
            isDraggingOver
              ? 'border-cyan-400 ring-2 ring-cyan-400/40'
              : 'border-white/15'
          }`}
        >
          <canvas
            ref={canvasRef}
            width={MOTION_W}
            height={MOTION_H}
            onClick={togglePlay}
            className="w-full h-full object-contain cursor-pointer block"
          />

          {/* Top Overlay Info Bar */}
          <div className="absolute top-2.5 inset-x-2.5 flex items-center justify-between pointer-events-none gap-1.5">
            <div className="px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md border border-white/10 text-[10px] font-mono text-slate-200 flex items-center gap-1.5">
              <Film className="w-3 h-3" style={{ color: theme.accent }} />
              <span className="uppercase">{reelConfig.templateId}</span>
              <span className="text-slate-400">· 9:16 Canvas Reel (In-Browser)</span>
            </div>

            {activeScene && (
              <div className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono text-cyan-300">
                {activeScene.label}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transport Bar & Scene Storyboard Strip */}
      <div className="w-full max-w-[360px] space-y-1.5 shrink-0">
        {/* Transport Controls */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#0b1118]/95 border border-white/10 shadow-lg">
          <button
            type="button"
            id="preview-play"
            onClick={togglePlay}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
          </button>

          <input
            type="range"
            id="preview-scrubber"
            min="0"
            max="1000"
            value={scrubberVal}
            onChange={handleScrub}
            className="flex-1 h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />

          <span
            id="preview-time"
            className="text-[11px] font-mono tabular-nums text-slate-300 shrink-0"
          >
            {currentTime.toFixed(1)} / {duration.toFixed(1)}s
          </span>

          <button
            type="button"
            id="preview-speed"
            onClick={toggleSpeed}
            className="px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/15 border border-white/10 text-[10px] font-mono tabular-nums font-bold text-slate-200 transition-colors cursor-pointer shrink-0"
            title="Playback speed multiplier"
          >
            {speed}×
          </button>

          {onToggleSfx && (
            <button
              type="button"
              onClick={onToggleSfx}
              className={`p-1 rounded border transition-colors cursor-pointer shrink-0 ${
                reelConfig.sfxEnabled !== false
                  ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                  : 'bg-white/[0.04] border-white/10 text-slate-500 hover:text-slate-300'
              }`}
              title={
                reelConfig.sfxEnabled !== false
                  ? 'Procedural SFX Cues Enabled (Click to Mute)'
                  : 'Procedural SFX Cues Muted (Click to Enable)'
              }
            >
              {reelConfig.sfxEnabled !== false ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {/* Scene Jump Strip & Quick Actions */}
        <div className="flex items-center justify-between gap-1.5 px-0.5">
          <div className="flex items-center gap-1 overflow-x-auto py-0.5">
            {reelConfig.scenes.map((scene, idx) => {
              const isCurrent = currentTime >= scene.from && currentTime < scene.to;
              const isSelected = selectedSceneId === scene.id;
              const dotColor = SCENE_COLORS[idx % SCENE_COLORS.length];
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => jumpToScene(scene.from, scene.id)}
                  className={`h-6 px-2 rounded-lg text-[10px] font-mono tabular-nums font-semibold transition-all cursor-pointer shrink-0 flex items-center gap-1 border ${
                    isCurrent || isSelected
                      ? 'bg-white/15 text-white border-white/30 shadow-sm'
                      : 'bg-white/[0.03] text-slate-400 hover:text-white border-white/5'
                  }`}
                  title={`${scene.label} (${scene.from.toFixed(1)}s - ${scene.to.toFixed(1)}s)`}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: dotColor }}
                  />
                  <span>S{idx + 1}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onUploadVideoFile && (
              <button
                type="button"
                data-testid="reel-viewport-upload-video-btn"
                onClick={() => videoInputRef.current?.click()}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 text-[10px] font-sans font-semibold text-emerald-200 transition-colors cursor-pointer"
                title="Upload a video (.mp4, .webm, .mov) to turn into a 9:16 Reel"
              >
                <Upload className="w-2.5 h-2.5" />
                <span>Upload Video</span>
              </button>
            )}
            {activeVideoSlide?.videoUrl && onSwitchToVideoCardReel && (
              <button
                type="button"
                data-testid="reel-viewport-video-card-btn"
                onClick={onSwitchToVideoCardReel}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-[10px] font-sans font-semibold text-cyan-200 transition-colors cursor-pointer"
                title="View uploaded video live in 9:16 MARROK card frame"
              >
                <Video className="w-2.5 h-2.5" />
                <span>Video Clip</span>
              </button>
            )}
            {onSyncFromCarousel && (
              <button
                type="button"
                onClick={onSyncFromCarousel}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-[10px] font-sans font-semibold text-cyan-300 transition-colors cursor-pointer"
                title="Re-sync scenes from your current Carousel slides"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>Sync Slides</span>
              </button>
            )}
            {onRestoreCarousel && (
              <button
                type="button"
                onClick={onRestoreCarousel}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/10 border border-white/10 text-[10px] font-sans font-semibold text-slate-300 transition-colors cursor-pointer"
                title="Return to 8-Slide Carousel view"
              >
                <Layers className="w-2.5 h-2.5 text-cyan-400" />
                <span>Slides</span>
              </button>
            )}
            {onOpenExportModal && (
              <button
                type="button"
                onClick={onOpenExportModal}
                className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-sans font-bold text-slate-950 transition-colors cursor-pointer"
                style={{ backgroundColor: theme.accent }}
              >
                <span>Export</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
