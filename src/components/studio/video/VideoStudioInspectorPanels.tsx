import React from 'react';
import {
  Save,
  RefreshCw,
  Volume2,
  Upload,
  ShieldAlert,
  Download,
  CheckCircle2,
  AlertTriangle,
  Square,
  Sparkles,
  FileCode2,
} from 'lucide-react';
import type {
  ProjectConfig,
  ProjectDetails,
  StemEntry,
  VideoStudioCapabilities,
  VideoStudioJobType,
} from './useVideoStudioController.ts';

export interface VideoStudioInspectorPanelsProps {
  accentColor: string;
  selectedId: string;
  capabilities: VideoStudioCapabilities;
  ffmpegDisabledReason?: string;
  activeTab: 'script' | 'build';
  onSelectTab: (tab: 'script' | 'build') => void;
  details: ProjectDetails | null;
  draftConfig: ProjectConfig | null;
  onChangeDraftConfig: React.Dispatch<React.SetStateAction<ProjectConfig | null>>;
  isBusyAudio: boolean;
  activeJobId: string | null;
  jobPct: number;
  jobStatus: string;
  jobLogs: string;
  qaSheetUrl: string | null;
  onSaveConfig: () => Promise<boolean>;
  onRegenerateVo: (actId?: string | null) => Promise<void>;
  onRebuildMix: () => Promise<void>;
  onToggleStemPlay: (relFile: string) => Promise<void>;
  onBinaryUpload: (file: File, filename: string, target: 'assets' | 'audio') => Promise<void>;
  onStartJob: (type: VideoStudioJobType) => Promise<void>;
  onCancelJob: () => Promise<void>;
  onExportBundledHtml: () => void;
  onAuthenticatedDownload: (relFile: string, downloadName: string) => Promise<void>;
}

export const VideoStudioInspectorPanels: React.FC<VideoStudioInspectorPanelsProps> = ({
  accentColor,
  selectedId,
  capabilities,
  ffmpegDisabledReason,
  activeTab,
  onSelectTab,
  details,
  draftConfig,
  onChangeDraftConfig,
  isBusyAudio,
  activeJobId,
  jobPct,
  jobStatus,
  jobLogs,
  qaSheetUrl,
  onSaveConfig,
  onRegenerateVo,
  onRebuildMix,
  onToggleStemPlay,
  onBinaryUpload,
  onStartJob,
  onCancelJob,
  onExportBundledHtml,
  onAuthenticatedDownload,
}) => (
  <section className="lg:col-span-5 rounded-xl border border-[#1E2833] bg-[#0b1118] flex flex-col min-h-0 overflow-hidden">
    <div className="flex border-b border-[#1E2833] bg-[#080d11]/80">
      <button
        type="button"
        onClick={() => onSelectTab('script')}
        className={`flex-1 py-2.5 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
          activeTab === 'script'
            ? 'text-white bg-white/[0.04]'
            : 'text-slate-400 border-transparent hover:text-slate-200'
        }`}
        style={activeTab === 'script' ? { borderColor: accentColor } : undefined}
      >
        Script, Voice &amp; Mixer
      </button>
      <button
        type="button"
        onClick={() => onSelectTab('build')}
        className={`flex-1 py-2.5 text-xs font-bold border-b-2 cursor-pointer transition-colors ${
          activeTab === 'build'
            ? 'text-white bg-white/[0.04]'
            : 'text-slate-400 border-transparent hover:text-slate-200'
        }`}
        style={activeTab === 'build' ? { borderColor: accentColor } : undefined}
      >
        Build &amp; QA Console
      </button>
    </div>

    {activeTab === 'script' && draftConfig && details && (
      <div className="p-4 overflow-y-auto space-y-4 flex-1">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onSaveConfig()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-950 cursor-pointer transition-opacity hover:opacity-90"
            style={{ backgroundColor: accentColor }}
          >
            <Save className="w-3.5 h-3.5" /> Save project.json
          </button>
          <button
            type="button"
            disabled={isBusyAudio || !capabilities.ffmpegAvailable}
            onClick={() => void onRegenerateVo(null)}
            title={ffmpegDisabledReason || 'Generate voiceovers for changed acts and remix master.wav'}
            className="flex items-center gap-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" style={{ color: accentColor }} /> Regenerate Changed Acts
          </button>
          <button
            type="button"
            disabled={isBusyAudio || !capabilities.ffmpegAvailable}
            onClick={() => void onRebuildMix()}
            title={ffmpegDisabledReason || 'Rebuild audio/master.wav from voiceover, music, and SFX stems'}
            className="flex items-center gap-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Rebuild Mix
          </button>
        </div>

        <div className="space-y-3">
          {draftConfig.acts.map((act, idx) => {
            const stem = details.stems.acts.find((s) => s.id === act.id);
            const hasOverride = Boolean(act.voiceOverride);
            return (
              <div
                key={act.id}
                className="rounded-xl border border-[#1E2833] bg-[#121A21]/75 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-xs font-bold text-white">
                    {act.id}{' '}
                    <span className="font-normal text-slate-400">· {act.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {stem?.ready && stem.tech ? (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${
                          stem.exceedsMaxDuration
                            ? 'border-rose-500/60 bg-rose-500/20 text-rose-200'
                            : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                        }`}
                      >
                        {stem.tech.durationSec.toFixed(3)}s / {act.maxDurationSec.toFixed(2)}s
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-amber-500/40 bg-amber-500/15 text-amber-200">
                        Pending
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono border border-[#1E2833] bg-[#080d11] text-slate-300">
                      {stem?.cached ? 'Cached' : 'Changed'}
                    </span>
                    {stem?.ready && (
                      <button
                        type="button"
                        onClick={() => void onToggleStemPlay(stem.file)}
                        className="px-2 py-0.5 rounded border border-[#1E2833] bg-[#080d11] hover:bg-white/[0.08] text-[11px] text-white cursor-pointer"
                      >
                        <Volume2 className="w-3 h-3 inline mr-1" />
                        Play
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isBusyAudio || !capabilities.ffmpegAvailable}
                      onClick={() => void onRegenerateVo(act.id)}
                      title={ffmpegDisabledReason || `Regenerate voiceover for ${act.id}`}
                      className="px-2 py-0.5 rounded border border-[#1E2833] bg-[#080d11] hover:bg-white/[0.08] text-[11px] text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>

                <textarea
                  value={act.text}
                  onChange={(e) => {
                    const next = structuredClone(draftConfig);
                    next.acts[idx].text = e.target.value;
                    onChangeDraftConfig(next);
                  }}
                  rows={2}
                  className="w-full rounded-lg border border-[#1E2833] bg-[#080d11] px-2.5 py-1.5 text-xs text-white focus:outline-none"
                />

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-slate-400">
                    Start (s)
                    <input
                      type="number"
                      step="0.1"
                      value={act.startSec}
                      onChange={(e) => {
                        const next = structuredClone(draftConfig);
                        next.acts[idx].startSec = Number(e.target.value);
                        onChangeDraftConfig(next);
                      }}
                      className="mt-0.5 w-full rounded border border-[#1E2833] bg-[#080d11] px-2 py-1 text-xs text-white"
                    />
                  </label>
                  <label className="text-[11px] text-slate-400">
                    Max Duration (s)
                    <input
                      type="number"
                      step="0.1"
                      value={act.maxDurationSec}
                      onChange={(e) => {
                        const next = structuredClone(draftConfig);
                        next.acts[idx].maxDurationSec = Number(e.target.value);
                        onChangeDraftConfig(next);
                      }}
                      className="mt-0.5 w-full rounded border border-[#1E2833] bg-[#080d11] px-2 py-1 text-xs text-white"
                    />
                  </label>
                </div>

                <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasOverride}
                    onChange={(e) => {
                      const next = structuredClone(draftConfig);
                      next.acts[idx].voiceOverride = e.target.checked
                        ? { provider: draftConfig.voice?.provider || 'elevenlabs', voiceId: '' }
                        : null;
                      onChangeDraftConfig(next);
                    }}
                    style={{ accentColor }}
                  />
                  Per-act voiceOverride
                </label>

                {hasOverride && act.voiceOverride && (
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#1E2833] bg-[#080d11]/90 p-2">
                    <select
                      value={act.voiceOverride.provider || ''}
                      onChange={(e) => {
                        const next = structuredClone(draftConfig);
                        const ov = next.acts[idx].voiceOverride || {};
                        const val = e.target.value;
                        if (val === 'elevenlabs' || val === 'gemini') ov.provider = val;
                        else delete ov.provider;
                        next.acts[idx].voiceOverride = ov;
                        onChangeDraftConfig(next);
                      }}
                      className="rounded border border-[#1E2833] bg-[#121A21] px-2 py-1 text-xs text-white"
                    >
                      <option value="">Inherit provider</option>
                      <option value="elevenlabs">elevenlabs</option>
                      <option value="gemini">gemini</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Voice ID"
                      value={act.voiceOverride.voiceId || ''}
                      onChange={(e) => {
                        const next = structuredClone(draftConfig);
                        const ov = next.acts[idx].voiceOverride || {};
                        if (e.target.value) ov.voiceId = e.target.value;
                        else delete ov.voiceId;
                        next.acts[idx].voiceOverride = ov;
                        onChangeDraftConfig(next);
                      }}
                      className="rounded border border-[#1E2833] bg-[#121A21] px-2 py-1 text-xs text-white"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Music, SFX & Assets */}
        <div className="space-y-2 pt-2 border-t border-[#1E2833]">
          <div className="text-xs font-bold text-slate-300">Music, SFX &amp; Custom Stems</div>
          {[
            details.stems.master && {
              label: 'Master Mix',
              entry: details.stems.master,
              replaceable: false,
            },
            details.stems.music && {
              label: 'Music Bed',
              entry: details.stems.music,
              replaceable: true,
            },
            ...details.stems.sfx.map((s) => ({
              label: `SFX (${s.id})`,
              entry: s,
              replaceable: true,
            })),
          ]
            .filter((x): x is { label: string; entry: StemEntry; replaceable: boolean } => Boolean(x))
            .map(({ label, entry, replaceable }) => (
              <div
                key={entry.file}
                className="flex items-center justify-between gap-2 rounded-lg border border-[#1E2833] bg-[#121A21]/75 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    {label} <span className="font-mono text-slate-400">({entry.file})</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    {entry.ready && entry.tech
                      ? `${entry.tech.durationSec.toFixed(3)}s · ${entry.tech.sampleRate / 1000}kHz/${entry.tech.bitsPerSample}b`
                      : 'Pending'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {entry.ready && (
                    <button
                      type="button"
                      onClick={() => void onToggleStemPlay(entry.file)}
                      className="px-2 py-1 rounded border border-[#1E2833] bg-[#080d11] hover:bg-white/[0.08] text-[11px] text-white cursor-pointer"
                    >
                      Play
                    </button>
                  )}
                  {replaceable && (
                    <label
                      title={ffmpegDisabledReason || `Upload custom audio stem for ${entry.file}`}
                      className={`px-2 py-1 rounded border border-[#1E2833] bg-[#080d11] text-[11px] text-white ${
                        capabilities.ffmpegAvailable
                          ? 'hover:bg-white/[0.08] cursor-pointer'
                          : 'opacity-40 cursor-not-allowed'
                      }`}
                    >
                      Replace
                      <input
                        type="file"
                        accept="audio/*"
                        disabled={!capabilities.ffmpegAvailable}
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f)
                            void onBinaryUpload(f, entry.file.split('/').pop() || f.name, 'audio');
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            ))}

          <div className="flex items-center gap-2 pt-1">
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5" style={{ color: accentColor }} /> Upload Asset
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onBinaryUpload(f, f.name, 'assets');
                }}
              />
            </label>
            <span className="text-[11px] font-mono text-slate-400">
              {details.assets.length} file(s) in assets/
            </span>
          </div>
        </div>
      </div>
    )}

    {activeTab === 'build' && details && (
      <div className="p-4 overflow-y-auto space-y-3 flex-1">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(activeJobId) || !capabilities.ffmpegAvailable}
            title={ffmpegDisabledReason || 'Render fast 720p/30fps preview MP4'}
            onClick={() => void onStartJob('render-fast')}
            className="px-2.5 py-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Render Draft (720p)
          </button>
          <button
            type="button"
            disabled={Boolean(activeJobId) || !capabilities.ffmpegAvailable}
            title={ffmpegDisabledReason || 'Render master 1920x1080 60fps MP4'}
            onClick={() => void onStartJob('render')}
            className="px-2.5 py-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Render 16:9
          </button>
          <button
            type="button"
            disabled={Boolean(activeJobId) || !capabilities.ffmpegAvailable}
            title={ffmpegDisabledReason || 'Export 1080x1920 9:16 vertical MP4'}
            onClick={() => void onStartJob('vertical')}
            className="px-2.5 py-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Export 9:16
          </button>
          <button
            type="button"
            disabled={Boolean(activeJobId) || !capabilities.ffmpegAvailable}
            title={ffmpegDisabledReason || 'Run complete VO -> DSP -> Mix -> Render -> 9:16 -> QA pipeline'}
            onClick={() => void onStartJob('build')}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity hover:opacity-90"
            style={{ backgroundColor: accentColor }}
          >
            Full Build
          </button>
          <button
            type="button"
            disabled={Boolean(activeJobId) || !capabilities.ffmpegAvailable}
            title={ffmpegDisabledReason || 'Inspect stream technical metrics and generate QA contact sheet'}
            onClick={() => void onStartJob('qa')}
            className="px-2.5 py-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            Run QA
          </button>
          {activeJobId && (
            <button
              type="button"
              onClick={() => void onCancelJob()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-500/50 bg-rose-500/20 text-xs font-semibold text-rose-200 cursor-pointer"
            >
              <Square className="w-3 h-3" /> Cancel
            </button>
          )}
        </div>

        <div>
          <div className="h-2 rounded-full bg-[#080d11] border border-[#1E2833] overflow-hidden">
            <div
              className="h-full transition-all duration-150"
              style={{ width: `${jobPct}%`, backgroundColor: accentColor }}
            />
          </div>
          <div className="flex justify-between mt-1 text-[11px] font-mono text-slate-300">
            <span>{jobStatus}</span>
            <span>{jobPct}%</span>
          </div>
        </div>

        <pre className="rounded-lg border border-[#1E2833] bg-[#080d11] p-3 font-mono text-[11px] text-slate-300 h-40 overflow-y-auto whitespace-pre-wrap">
          {jobLogs}
        </pre>

        {/* Downloads */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onExportBundledHtml}
            className="flex items-center gap-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] px-2.5 py-1.5 text-xs text-white cursor-pointer transition-colors"
          >
            <FileCode2 className="w-3.5 h-3.5" style={{ color: accentColor }} /> Bundled HTML
          </button>
          {details.outputs.final16x9 && (
            <button
              type="button"
              onClick={() =>
                void onAuthenticatedDownload('output/final-16x9.mp4', `${selectedId}-16x9.mp4`)
              }
              className="flex items-center gap-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] px-2.5 py-1.5 text-xs text-white cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> 16:9 MP4
            </button>
          )}
          {details.outputs.final9x16 && (
            <button
              type="button"
              onClick={() =>
                void onAuthenticatedDownload('output/final-9x16.mp4', `${selectedId}-9x16.mp4`)
              }
              className="flex items-center gap-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] px-2.5 py-1.5 text-xs text-white cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> 9:16 MP4
            </button>
          )}
          {details.stems.master.ready && (
            <button
              type="button"
              onClick={() =>
                void onAuthenticatedDownload('audio/master.wav', `${selectedId}-master.wav`)
              }
              className="flex items-center gap-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] px-2.5 py-1.5 text-xs text-white cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> master.wav
            </button>
          )}
        </div>

        {details.qaReport && (
          <div className="rounded-lg border border-[#1E2833] bg-[#121A21]/75 p-3 space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-bold">
              {details.qaReport.passed ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-300">QA Passed</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span className="text-rose-300">QA Issues Found</span>
                </>
              )}
            </div>
            {details.qaReport.outputs?.final16x9 && (
              <div className="font-mono text-[11px] text-slate-300">
                final-16x9.mp4:{' '}
                {details.qaReport.outputs.final16x9.video?.width}×
                {details.qaReport.outputs.final16x9.video?.height} @{' '}
                {details.qaReport.outputs.final16x9.video?.fps} ·{' '}
                {details.qaReport.outputs.final16x9.durationSec.toFixed(3)}s ·{' '}
                {details.qaReport.outputs.final16x9.audio?.codec}{' '}
                {details.qaReport.outputs.final16x9.audio?.sampleRate}Hz
              </div>
            )}
            {details.qaReport.errors.length > 0 && (
              <div className="text-rose-300 text-[11px]">
                <ShieldAlert className="w-3.5 h-3.5 inline mr-1" />
                {details.qaReport.errors.join('; ')}
              </div>
            )}
          </div>
        )}

        {qaSheetUrl && (
          <img
            src={qaSheetUrl}
            alt="QA Contact Sheet"
            className="w-full rounded-lg border border-[#1E2833]"
          />
        )}
      </div>
    )}
  </section>
);

export interface NewVideoProjectModalProps {
  accentColor: string;
  newProjId: string;
  newProjName: string;
  newProjDuration: number;
  onChangeId: (val: string) => void;
  onChangeName: (val: string) => void;
  onChangeDuration: (val: number) => void;
  onClose: () => void;
  onCreate: () => Promise<void>;
}

export const NewVideoProjectModal: React.FC<NewVideoProjectModalProps> = ({
  accentColor,
  newProjId,
  newProjName,
  newProjDuration,
  onChangeId,
  onChangeName,
  onChangeDuration,
  onClose,
  onCreate,
}) => (
  <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="w-full max-w-md rounded-2xl border border-[#1E2833] bg-[#0b1118] p-5 space-y-3 shadow-2xl">
      <h3 className="text-base font-bold text-white">Create Film Studio Project</h3>
      <label className="block text-xs text-slate-300">
        Project ID (slug)
        <input
          type="text"
          placeholder="acme-launch-film"
          value={newProjId}
          onChange={(e) => onChangeId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[#1E2833] bg-[#080d11] px-3 py-2 text-xs text-white focus:outline-none"
        />
      </label>
      <label className="block text-xs text-slate-300">
        Display Name
        <input
          type="text"
          placeholder="Acme Launch Film"
          value={newProjName}
          onChange={(e) => onChangeName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[#1E2833] bg-[#080d11] px-3 py-2 text-xs text-white focus:outline-none"
        />
      </label>
      <label className="block text-xs text-slate-300">
        Duration (seconds)
        <input
          type="number"
          min={3}
          max={180}
          value={newProjDuration}
          onChange={(e) => onChangeDuration(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-[#1E2833] bg-[#080d11] px-3 py-2 text-xs text-white focus:outline-none"
        />
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] text-xs text-slate-300 hover:text-white cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void onCreate()}
          className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-950 cursor-pointer"
          style={{ backgroundColor: accentColor }}
        >
          Create Project
        </button>
      </div>
    </div>
  </div>
);
