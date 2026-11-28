import React from 'react';
import {
  Film,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Plus,
  AlertTriangle,
  FileCode2,
} from 'lucide-react';
import { DEFAULT_PALETTES, ThemePalette } from '../../../types.ts';
import { useVideoStudioController } from './useVideoStudioController.ts';
import {
  NewVideoProjectModal,
  VideoStudioInspectorPanels,
} from './VideoStudioInspectorPanels.tsx';

interface VideoStudioWorkspaceProps {
  theme?: ThemePalette;
  initialProjectId?: string | null;
  onShowToast: (msg: string) => void;
  onAuthRequired?: () => void;
}

export const VideoStudioWorkspace: React.FC<VideoStudioWorkspaceProps> = ({
  theme = DEFAULT_PALETTES.teal,
  initialProjectId = null,
  onShowToast,
  onAuthRequired,
}) => {
  const accentColor = theme?.accent || '#37E2C0';
  const ctrl = useVideoStudioController({
    initialProjectId,
    onShowToast,
    onAuthRequired,
  });

  if (ctrl.capabilities.checked && !ctrl.capabilities.serverAvailable) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-2xl border border-[#1E2833] bg-[#0b1118] p-6 text-center space-y-3">
          <Film className="w-8 h-8 mx-auto" style={{ color: accentColor }} />
          <h2 className="text-lg font-bold text-white">Local Film Studio Server Required</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Multi-act HTML/VO film authoring, voiceover caching, and Playwright + FFmpeg rendering run on the local Express server (
            <code className="px-1.5 py-0.5 rounded bg-[#121A21] border border-[#1E2833] text-white font-mono">
              npm run dev
            </code>
            ) or CLI (
            <code className="px-1.5 py-0.5 rounded bg-[#121A21] border border-[#1E2833] text-white font-mono">
              npm run video:build -- --project marrok-brand-film --vertical
            </code>
            ). For in-browser 9:16 social reels, use{' '}
            <strong className="text-white">Create → Reel</strong>.
          </p>
        </div>
      </div>
    );
  }

  const cfg = ctrl.draftConfig || ctrl.details?.config;
  const totalFrames = cfg ? Math.round(cfg.video.durationSec * cfg.video.fps) : 0;
  const curFrame = cfg ? Math.round(ctrl.previewTime * cfg.video.fps) : 0;
  const ffmpegDisabledReason = !ctrl.capabilities.ffmpegAvailable
    ? 'Requires local FFmpeg & ffprobe on PATH'
    : undefined;

  const iframeBasePath = ctrl.previewToken
    ? `/video-projects/s/${encodeURIComponent(ctrl.previewToken)}/${encodeURIComponent(ctrl.selectedId)}/scene.html`
    : `/video-projects/${encodeURIComponent(ctrl.selectedId)}/scene.html`;

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1E2833] bg-[#0b1118] px-4 py-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-white">
            <Film className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
            <span>Film Studio</span>
            <span
              data-testid="film-studio-engine-distinction"
              className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md bg-[#121A21] border border-[#1E2833] text-[10px] font-mono font-normal normal-case tracking-normal text-slate-300"
              title="Multi-Act 16:9 & 9:16 HTML/DOM + Voiceover engine (distinct from Create → Reel's in-browser 9:16 Canvas Motion Reel)"
            >
              Multi-Act 16:9 &amp; 9:16 HTML/VO · Local FFmpeg Engine
            </span>
          </div>
          <select
            value={ctrl.selectedId}
            onChange={(e) => void ctrl.handleSelectProject(e.target.value)}
            aria-label="Select video project"
            className="rounded-lg border border-[#1E2833] bg-[#080d11] px-3 py-1.5 text-xs text-white focus:outline-none"
          >
            {ctrl.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.valid ? `${p.name} (${p.id})` : `${p.id} [invalid]`}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => ctrl.setIsNewModalOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] px-2.5 py-1.5 text-xs font-semibold text-white cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" style={{ color: accentColor }} /> New Project
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono">
          {cfg && (
            <span className="px-2.5 py-1 rounded-lg bg-[#121A21] border border-[#1E2833] text-slate-300">
              {cfg.video.width}×{cfg.video.height} · {cfg.video.fps}fps · {cfg.video.durationSec}s
            </span>
          )}
          <span
            className={`px-2.5 py-1 rounded-lg border ${
              ctrl.masterAudioUrl
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-400/40 bg-amber-500/10 text-amber-300'
            }`}
          >
            {ctrl.masterAudioUrl ? 'Master Audio Synced' : 'Audio Pending'}
          </span>
        </div>
      </div>

      {/* Graceful Degradation Notice when FFmpeg is not available in the container */}
      {ctrl.capabilities.checked &&
        ctrl.capabilities.serverAvailable &&
        !ctrl.capabilities.ffmpegAvailable && (
          <div
            role="status"
            data-testid="film-studio-ffmpeg-notice"
            className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] text-xs text-amber-100"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <span className="font-semibold text-amber-200">Preview &amp; Script Mode Active</span>
                <span aria-hidden="true" className="text-amber-500/60 mx-1.5">
                  ·
                </span>
                <span className="text-amber-100/90">
                  FFmpeg/ffprobe were not detected on <code className="font-mono">PATH</code> in this container. Interactive 60fps HTML stage preview,{' '}
                  <code className="font-mono">project.json</code> editing, and Bundled HTML export work normally; audio mixing &amp; MP4 rendering require local FFmpeg.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={ctrl.handleExportBundledHtml}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-400/40 bg-amber-500/20 hover:bg-amber-500/30 text-[11px] font-semibold text-amber-100 cursor-pointer shrink-0 transition-colors"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>Export Bundled HTML</span>
            </button>
          </div>
        )}

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Left: Synchronized Stage Preview */}
        <section className="lg:col-span-7 rounded-xl border border-[#1E2833] bg-[#0b1118] flex flex-col overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#1E2833] bg-[#080d11]/80 flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-sm font-bold text-white">Synchronized Stage Preview</div>
              <div className="text-[11px] text-slate-400">
                {ctrl.masterAudioUrl
                  ? 'Master clock locked to audio/master.wav'
                  : ctrl.capabilities.ffmpegAvailable
                  ? 'Silent clock (rebuild audio mix for voiceover + music sync)'
                  : 'Silent 60fps DOM clock (FFmpeg required to build audio/master.wav)'}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={ctrl.handleExportBundledHtml}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] text-xs font-medium text-slate-200 cursor-pointer transition-colors"
                title="Bundle scene.html and all project assets into a standalone self-contained HTML file"
              >
                <FileCode2 className="w-3.5 h-3.5" style={{ color: accentColor }} />
                <span>Bundled HTML</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  ctrl.stopPlayback();
                  ctrl.setPreviewAspect((a) => (a === '16:9' ? '9:16' : '16:9'));
                  ctrl.setIframeEpoch((n) => n + 1);
                }}
                className="px-2.5 py-1 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] text-xs font-medium text-slate-200 cursor-pointer transition-colors"
              >
                Aspect: {ctrl.previewAspect}
              </button>
              <button
                type="button"
                onClick={() => ctrl.setSafeZonesVisible((v) => !v)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                  ctrl.safeZonesVisible
                    ? 'border-white/30 bg-white/12 text-white'
                    : 'border-[#1E2833] bg-[#121A21] text-slate-300 hover:text-white'
                }`}
                style={
                  ctrl.safeZonesVisible
                    ? { borderColor: accentColor, color: accentColor }
                    : undefined
                }
              >
                Safe-Zones: {ctrl.safeZonesVisible ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between gap-3">
            <div
              data-testid="film-studio-stage-container"
              data-aspect={ctrl.previewAspect}
              className={`relative bg-[#080d11] rounded-lg overflow-hidden border border-[#1E2833] mx-auto w-full ${
                ctrl.previewAspect === '9:16' ? 'max-w-[300px] aspect-[9/16]' : 'aspect-video'
              }`}
            >
              <iframe
                ref={ctrl.iframeRef}
                key={`${ctrl.selectedId}-${ctrl.previewAspect}-${ctrl.iframeEpoch}-${Boolean(ctrl.previewToken)}`}
                src={`${iframeBasePath}?embed=1${
                  ctrl.previewAspect === '9:16' ? '&aspect=9:16' : ''
                }&e=${ctrl.iframeEpoch}`}
                title="Film Studio Scene Preview"
                className="w-full h-full border-0 block"
                onLoad={() => ctrl.syncStageTime(ctrl.previewTimeRef.current)}
              />
              {ctrl.safeZonesVisible && (
                <div className="absolute inset-0 pointer-events-none z-10">
                  <div
                    className="absolute inset-[12%_10%_22%_8%] border border-dashed rounded-lg"
                    style={{ borderColor: accentColor, backgroundColor: `${accentColor}10` }}
                  >
                    <span
                      className="absolute top-1.5 left-2 text-[10px] font-mono bg-[#080d11]/90 px-1.5 py-0.5 rounded"
                      style={{ color: accentColor }}
                    >
                      TikTok / Reels Safe Zone
                    </span>
                  </div>
                  <div className="absolute right-[3%] bottom-[24%] w-[9%] h-[36%] border border-dashed border-amber-400/75 bg-amber-400/10 rounded" />
                  <div className="absolute left-[3%] right-[14%] bottom-[4%] h-[16%] border border-dashed border-rose-400/75 bg-rose-400/10 rounded" />
                </div>
              )}
            </div>

            {ctrl.masterAudioUrl && (
              <audio
                ref={ctrl.masterAudioRef}
                src={ctrl.masterAudioUrl}
                preload="auto"
                className="hidden"
              />
            )}

            {/* Transport Controls */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => (ctrl.isPlaying ? ctrl.stopPlayback() : ctrl.startPlayback())}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-950 cursor-pointer transition-opacity hover:opacity-90"
                  style={{ backgroundColor: accentColor }}
                >
                  {ctrl.isPlaying ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                  {ctrl.isPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    ctrl.stopPlayback();
                    if (cfg) ctrl.syncStageTime(ctrl.previewTimeRef.current - 1 / cfg.video.fps);
                  }}
                  className="rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] px-2 py-1.5 text-xs text-slate-200 cursor-pointer"
                  title="Step back 1 frame"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    ctrl.stopPlayback();
                    if (cfg) ctrl.syncStageTime(ctrl.previewTimeRef.current + 1 / cfg.video.fps);
                  }}
                  className="rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] px-2 py-1.5 text-xs text-slate-200 cursor-pointer"
                  title="Step forward 1 frame"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
                <input
                  type="range"
                  min={0}
                  max={cfg?.video.durationSec || 37}
                  step={cfg ? 1 / cfg.video.fps : 0.016667}
                  value={ctrl.previewTime}
                  onChange={(e) => {
                    ctrl.stopPlayback();
                    ctrl.syncStageTime(Number(e.target.value));
                  }}
                  className="flex-1 min-w-[120px]"
                  style={{ accentColor }}
                />
                <span className="font-mono text-xs tabular-nums text-slate-300">
                  {ctrl.previewTime.toFixed(2).padStart(5, '0')}s · Frame {curFrame}/{totalFrames}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {cfg?.acts.map((act) => {
                  const active =
                    ctrl.previewTime >= act.startSec &&
                    ctrl.previewTime <= act.startSec + act.maxDurationSec;
                  return (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => {
                        ctrl.stopPlayback();
                        ctrl.syncStageTime(act.startSec);
                      }}
                      className={`px-2 py-1 rounded text-[11px] font-mono cursor-pointer border transition-colors ${
                        active
                          ? 'text-slate-950 font-bold'
                          : 'bg-[#080d11] border-[#1E2833] text-slate-300 hover:border-white/25'
                      }`}
                      style={
                        active
                          ? { backgroundColor: accentColor, borderColor: accentColor }
                          : undefined
                      }
                    >
                      {act.id} ({act.startSec}s)
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Right: Script/Mixer & Build/QA Console */}
        <VideoStudioInspectorPanels
          accentColor={accentColor}
          selectedId={ctrl.selectedId}
          capabilities={ctrl.capabilities}
          ffmpegDisabledReason={ffmpegDisabledReason}
          activeTab={ctrl.activeTab}
          onSelectTab={ctrl.setActiveTab}
          details={ctrl.details}
          draftConfig={ctrl.draftConfig}
          onChangeDraftConfig={ctrl.setDraftConfig}
          isBusyAudio={ctrl.isBusyAudio}
          activeJobId={ctrl.activeJobId}
          jobPct={ctrl.jobPct}
          jobStatus={ctrl.jobStatus}
          jobLogs={ctrl.jobLogs}
          qaSheetUrl={ctrl.qaSheetUrl}
          onSaveConfig={ctrl.handleSaveConfig}
          onRegenerateVo={ctrl.handleRegenerateVo}
          onRebuildMix={ctrl.handleRebuildMix}
          onToggleStemPlay={ctrl.handleToggleStemPlay}
          onBinaryUpload={ctrl.handleBinaryUpload}
          onStartJob={ctrl.handleStartJob}
          onCancelJob={ctrl.handleCancelJob}
          onExportBundledHtml={ctrl.handleExportBundledHtml}
          onAuthenticatedDownload={ctrl.handleAuthenticatedDownload}
        />
      </div>

      {ctrl.isNewModalOpen && (
        <NewVideoProjectModal
          accentColor={accentColor}
          newProjId={ctrl.newProjId}
          newProjName={ctrl.newProjName}
          newProjDuration={ctrl.newProjDuration}
          onChangeId={ctrl.setNewProjId}
          onChangeName={ctrl.setNewProjName}
          onChangeDuration={ctrl.setNewProjDuration}
          onClose={() => ctrl.setIsNewModalOpen(false)}
          onCreate={ctrl.handleCreateProject}
        />
      )}
    </div>
  );
};
