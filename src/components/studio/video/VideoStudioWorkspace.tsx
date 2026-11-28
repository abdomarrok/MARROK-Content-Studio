import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Film,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Plus,
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
import { DEFAULT_PALETTES, ThemePalette } from '../../../types.ts';
import { withClientAuthHeaders } from '../../../lib/security/clientSessionToken.ts';

interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
  speed?: number;
}

interface VoiceConfig {
  provider: 'elevenlabs' | 'gemini';
  voiceId: string;
  modelId: string;
  seed?: number;
  settings?: VoiceSettings;
}

interface ActConfig {
  id: string;
  label: string;
  startSec: number;
  maxDurationSec: number;
  text: string;
  voiceOverride: Partial<VoiceConfig> | null;
}

interface SfxConfig {
  id: string;
  source: 'dsp' | 'file';
  file: string;
  atSec: number;
  volume?: number;
  volumeDb?: number;
  dspPreset?: string;
}

interface ProjectConfig {
  id: string;
  name: string;
  video: {
    width: number;
    height: number;
    fps: number;
    durationSec: number;
    crf: number;
    preset: string;
    verticalExport: {
      enabled: boolean;
      mode: 'padded' | 'native' | 'crop';
      backgroundColor: string;
    };
  };
  voice: VoiceConfig | null;
  acts: ActConfig[];
  music: {
    source: 'dsp' | 'file';
    file: string;
    gainDb: number;
    fadeOutStartSec: number;
    fadeOutDurationSec: number;
    swellAtSec?: number | null;
    ducking: {
      threshold: number;
      ratio: number;
      attackMs: number;
      releaseMs: number;
    };
  } | null;
  sfx: SfxConfig[];
}

interface StemTech {
  durationSec: number;
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
  peakDb: number;
  leadingSilenceMs: number;
}

interface StemEntry {
  id?: string;
  label?: string;
  file: string;
  ready: boolean;
  tech: StemTech | null;
  cached?: boolean;
  exceedsMaxDuration?: boolean;
  maxDurationSec?: number;
  gainDb?: number;
}

interface ProjectSummary {
  id: string;
  name: string;
  valid: boolean;
  error?: string;
}

interface ProjectDetails {
  config: ProjectConfig;
  previewToken?: string | null;
  stems: {
    acts: StemEntry[];
    music: StemEntry | null;
    sfx: StemEntry[];
    master: StemEntry;
  };
  assets: Array<{ name: string; path: string; sizeBytes: number }>;
  outputs: {
    silent: boolean;
    silentFast: boolean;
    final16x9: boolean;
    finalFast: boolean;
    final9x16: boolean;
    qaSheet: boolean;
  };
  qaReport: {
    passed: boolean;
    errors: string[];
    warnings: string[];
    outputs?: {
      final16x9?: {
        durationSec: number;
        video?: { width: number; height: number; fps: string; nbFrames: number };
        audio?: { codec: string; sampleRate: number };
      } | null;
    };
  } | null;
}

interface VideoStudioWorkspaceProps {
  theme?: ThemePalette;
  onShowToast: (msg: string) => void;
  onAuthRequired?: () => void;
}

export const VideoStudioWorkspace: React.FC<VideoStudioWorkspaceProps> = ({
  theme = DEFAULT_PALETTES.teal,
  onShowToast,
  onAuthRequired,
}) => {
  const accentColor = theme?.accent || '#37E2C0';

  const [capabilities, setCapabilities] = useState<{
    checked: boolean;
    serverAvailable: boolean;
    ffmpegAvailable: boolean;
  }>({ checked: false, serverAvailable: true, ffmpegAvailable: false });

  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>('marrok-brand-film');
  const [details, setDetails] = useState<ProjectDetails | null>(null);
  const [draftConfig, setDraftConfig] = useState<ProjectConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'script' | 'build'>('script');

  // Preview state
  const [previewAspect, setPreviewAspect] = useState<'16:9' | '9:16'>('16:9');
  const [safeZonesVisible, setSafeZonesVisible] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [iframeEpoch, setIframeEpoch] = useState(1);

  // Auth-fetched blob URLs (revoked cleanly)
  const [masterAudioUrl, setMasterAudioUrl] = useState<string | null>(null);
  const [qaSheetUrl, setQaSheetUrl] = useState<string | null>(null);
  const masterBlobRef = useRef<string | null>(null);
  const qaBlobRef = useRef<string | null>(null);
  const stemAudioRef = useRef<{ file: string; audio: HTMLAudioElement; url: string } | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const masterAudioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const previewTimeRef = useRef<number>(0);

  // Jobs & busy state
  const [isBusyAudio, setIsBusyAudio] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobPct, setJobPct] = useState(0);
  const [jobStatus, setJobStatus] = useState('Idle');
  const [jobLogs, setJobLogs] = useState<string>('Ready. Select a render or build action above.');
  const jobAbortRef = useRef<AbortController | null>(null);

  // New project modal
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newProjId, setNewProjId] = useState('');
  const [newProjName, setNewProjName] = useState('');
  const [newProjDuration, setNewProjDuration] = useState(15);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const headers = withClientAuthHeaders(
        init?.headers as Record<string, string> | undefined
      );
      const res = await fetch(url, {
        ...init,
        headers,
        credentials: 'include',
      });
      if (res.status === 401 && onAuthRequired) {
        onAuthRequired();
      }
      return res;
    },
    [onAuthRequired]
  );

  const fetchAuthenticatedBlobUrl = useCallback(
    async (relFile: string): Promise<string | null> => {
      try {
        const res = await authFetch(
          `/api/video-studio/projects/${encodeURIComponent(selectedId)}/files/${relFile}?t=${Date.now()}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return null;
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      } catch {
        return null;
      }
    },
    [authFetch, selectedId]
  );

  const revokeMediaBlobs = useCallback(() => {
    if (masterBlobRef.current) {
      URL.revokeObjectURL(masterBlobRef.current);
      masterBlobRef.current = null;
    }
    if (qaBlobRef.current) {
      URL.revokeObjectURL(qaBlobRef.current);
      qaBlobRef.current = null;
    }
    if (stemAudioRef.current) {
      stemAudioRef.current.audio.pause();
      URL.revokeObjectURL(stemAudioRef.current.url);
      stemAudioRef.current = null;
    }
    setMasterAudioUrl(null);
    setQaSheetUrl(null);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (jobAbortRef.current) jobAbortRef.current.abort();
      if (masterAudioRef.current) masterAudioRef.current.pause();
      revokeMediaBlobs();
    };
  }, [revokeMediaBlobs]);

  const loadProjectDetails = useCallback(
    async (projectId: string) => {
      const res = await authFetch(`/api/video-studio/projects/${encodeURIComponent(projectId)}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ProjectDetails;
      setDetails(data);
      setDraftConfig(structuredClone(data.config));
      if (data.previewToken) {
        setPreviewToken(data.previewToken);
      }

      // Load authenticated audio/master.wav and output/qa-sheet.png blobs
      if (masterBlobRef.current) {
        URL.revokeObjectURL(masterBlobRef.current);
        masterBlobRef.current = null;
      }
      if (data.stems.master.ready) {
        const mRes = await authFetch(
          `/api/video-studio/projects/${encodeURIComponent(projectId)}/files/audio/master.wav?t=${Date.now()}`,
          { cache: 'no-store' }
        );
        if (mRes.ok) {
          const url = URL.createObjectURL(await mRes.blob());
          masterBlobRef.current = url;
          setMasterAudioUrl(url);
        } else {
          setMasterAudioUrl(null);
        }
      } else {
        setMasterAudioUrl(null);
      }

      if (qaBlobRef.current) {
        URL.revokeObjectURL(qaBlobRef.current);
        qaBlobRef.current = null;
      }
      if (data.outputs.qaSheet) {
        const qRes = await authFetch(
          `/api/video-studio/projects/${encodeURIComponent(projectId)}/files/output/qa-sheet.png?t=${Date.now()}`,
          { cache: 'no-store' }
        );
        if (qRes.ok) {
          const url = URL.createObjectURL(await qRes.blob());
          qaBlobRef.current = url;
          setQaSheetUrl(url);
        } else {
          setQaSheetUrl(null);
        }
      } else {
        setQaSheetUrl(null);
      }
    },
    [authFetch]
  );

  const loadWorkspaceInit = useCallback(async () => {
    try {
      const capRes = await authFetch('/api/video-studio/capabilities', { cache: 'no-store' });
      if (capRes.status === 404) {
        setCapabilities({ checked: true, serverAvailable: false, ffmpegAvailable: false });
        return;
      }
      if (!capRes.ok) {
        setCapabilities({ checked: true, serverAvailable: false, ffmpegAvailable: false });
        return;
      }
      const cap = await capRes.json();
      const isServerUp = Boolean(cap.serverAvailable ?? cap.localRenderAvailable);
      setCapabilities({
        checked: true,
        serverAvailable: isServerUp,
        ffmpegAvailable: Boolean(cap.ffmpegAvailable),
      });
      if (cap.previewToken) {
        setPreviewToken(String(cap.previewToken));
      }

      const listRes = await authFetch('/api/video-studio/projects', { cache: 'no-store' });
      if (!listRes.ok) return;
      const listData = await listRes.json();
      const items: ProjectSummary[] = listData.projects || [];
      setProjects(items);
      const initial = items.find((p) => p.id === 'marrok-brand-film')?.id || items[0]?.id;
      if (initial) {
        setSelectedId(initial);
        await loadProjectDetails(initial);
      }
    } catch {
      setCapabilities({ checked: true, serverAvailable: false, ffmpegAvailable: false });
    }
  }, [authFetch, loadProjectDetails]);

  useEffect(() => {
    void loadWorkspaceInit();
  }, [loadWorkspaceInit]);

  const syncStageTime = useCallback(
    (t: number) => {
      const cfg = details?.config;
      if (!cfg) return;
      const clamped = Math.max(0, Math.min(cfg.video.durationSec, t));
      const dt = 1 / cfg.video.fps;
      previewTimeRef.current = clamped;
      setPreviewTime(clamped);

      const win = iframeRef.current?.contentWindow as
        | (Window & { renderAt?: (rawT: number, delta: number) => void })
        | null;
      try {
        if (win && typeof win.renderAt === 'function') {
          win.renderAt(clamped, dt);
        } else if (win) {
          win.postMessage({ type: 'studio:scrub', t: clamped, dt }, '*');
        }
      } catch {
        // ignore cross-frame init race
      }
    },
    [details]
  );

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (masterAudioRef.current && !masterAudioRef.current.paused) {
      masterAudioRef.current.pause();
    }
  }, []);

  const startPlayback = useCallback(() => {
    const cfg = details?.config;
    if (!cfg) return;
    const dur = cfg.video.durationSec;
    let startT = previewTimeRef.current;
    if (startT >= dur - 0.03) startT = 0;

    setIsPlaying(true);
    lastTickRef.current = performance.now();

    const audio = masterAudioRef.current;
    if (masterAudioUrl && audio) {
      audio.currentTime = startT;
      audio.play().catch(() => {});
    }

    const tick = (now: number) => {
      if (masterAudioUrl && audio && !audio.paused) {
        const t = audio.currentTime;
        syncStageTime(t);
        if (audio.ended || t >= dur) {
          syncStageTime(dur);
          stopPlayback();
          return;
        }
      } else {
        const elapsed = (now - lastTickRef.current) / 1000;
        lastTickRef.current = now;
        const nextT = previewTimeRef.current + elapsed;
        if (nextT >= dur) {
          syncStageTime(dur);
          stopPlayback();
          return;
        }
        syncStageTime(nextT);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [details, masterAudioUrl, stopPlayback, syncStageTime]);

  const handleSelectProject = async (id: string) => {
    stopPlayback();
    setSelectedId(id);
    setPreviewTime(0);
    previewTimeRef.current = 0;
    setIframeEpoch((n) => n + 1);
    try {
      await loadProjectDetails(id);
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Failed loading project');
    }
  };

  const handleSaveConfig = async (): Promise<boolean> => {
    if (!draftConfig) return false;
    const res = await authFetch(`/api/video-studio/projects/${encodeURIComponent(selectedId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draftConfig),
    });
    const data = await res.json();
    if (!res.ok) {
      onShowToast(`⚠️ ${data.error || 'Validation failed'}`);
      return false;
    }
    setDetails(data.project);
    setDraftConfig(structuredClone(data.project.config));
    if (data.project?.previewToken) {
      setPreviewToken(data.project.previewToken);
    }
    onShowToast('✓ Saved project.json');
    return true;
  };

  const handleRegenerateVo = async (actId: string | null = null) => {
    if (isBusyAudio || !capabilities.ffmpegAvailable) return;
    setIsBusyAudio(true);
    try {
      const saved = await handleSaveConfig();
      if (!saved) return;
      onShowToast(actId ? `Generating ${actId} + remixing...` : 'Checking cache & generating changed acts...');
      const res = await authFetch(`/api/video-studio/projects/${encodeURIComponent(selectedId)}/audio/vo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Voiceover generation failed');
      await loadProjectDetails(selectedId);
      onShowToast(`✓ Audio mixed (${Number(data.masterDurationSec).toFixed(2)}s)`);
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Audio failed'}`);
    } finally {
      setIsBusyAudio(false);
    }
  };

  const handleRebuildMix = async () => {
    if (isBusyAudio || !capabilities.ffmpegAvailable) return;
    setIsBusyAudio(true);
    try {
      const res = await authFetch(`/api/video-studio/projects/${encodeURIComponent(selectedId)}/audio/mix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Mix failed');
      await loadProjectDetails(selectedId);
      onShowToast(`✓ Master mix rebuilt (${Number(data.masterDurationSec).toFixed(2)}s)`);
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Mix failed'}`);
    } finally {
      setIsBusyAudio(false);
    }
  };

  const handleToggleStemPlay = async (relFile: string) => {
    if (stemAudioRef.current) {
      const prev = stemAudioRef.current;
      prev.audio.pause();
      URL.revokeObjectURL(prev.url);
      stemAudioRef.current = null;
      if (prev.file === relFile) return;
    }
    stopPlayback();
    const url = await fetchAuthenticatedBlobUrl(relFile);
    if (!url) {
      onShowToast(`⚠️ Could not load ${relFile}`);
      return;
    }
    const audio = new Audio(url);
    stemAudioRef.current = { file: relFile, audio, url };
    audio.addEventListener('ended', () => {
      if (stemAudioRef.current?.url === url) {
        URL.revokeObjectURL(url);
        stemAudioRef.current = null;
      }
    });
    audio.play().catch((err) => onShowToast(`⚠️ ${err.message}`));
  };

  const handleBinaryUpload = async (file: File, filename: string, target: 'assets' | 'audio') => {
    if (target === 'audio' && !capabilities.ffmpegAvailable) {
      onShowToast('⚠️ Audio stem conversion requires local FFmpeg on PATH');
      return;
    }
    try {
      const res = await authFetch(
        `/api/video-studio/projects/${encodeURIComponent(selectedId)}/assets?filename=${encodeURIComponent(filename)}&target=${target}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file,
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      await loadProjectDetails(selectedId);
      if (target === 'assets') {
        setIframeEpoch((n) => n + 1);
      }
      onShowToast(`✓ Uploaded ${data.file}`);
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Upload failed'}`);
    }
  };

  const handleAuthenticatedDownload = async (relFile: string, downloadName: string) => {
    const url = await fetchAuthenticatedBlobUrl(relFile);
    if (!url) {
      onShowToast(`⚠️ Could not download ${relFile}`);
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleExportBundledHtml = () => {
    const win = iframeRef.current?.contentWindow as
      | (Window & { exportBundledHTML?: () => Promise<void> | void })
      | null;
    try {
      if (win && typeof win.exportBundledHTML === 'function') {
        void win.exportBundledHTML();
        onShowToast('✓ Exporting standalone bundled HTML from stage...');
        return;
      }
    } catch {
      // fallback below
    }
    onShowToast('Stage preview is still loading — try again in a moment.');
  };

  const handleStartJob = async (type: 'render-fast' | 'render' | 'vertical' | 'build' | 'qa') => {
    if (!capabilities.ffmpegAvailable) {
      onShowToast('⚠️ Local FFmpeg & ffprobe on PATH are required for rendering and QA jobs.');
      return;
    }
    if (jobAbortRef.current) jobAbortRef.current.abort();
    const abortCtrl = new AbortController();
    jobAbortRef.current = abortCtrl;

    setJobLogs(`Starting ${type} job...\n`);
    setJobPct(3);
    setJobStatus(`Running ${type}...`);

    try {
      const res = await authFetch(`/api/video-studio/projects/${encodeURIComponent(selectedId)}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to launch job');
      const jobId = data.jobId as string;
      setActiveJobId(jobId);

      // Authenticated SSE stream using fetch + ReadableStream
      const streamRes = await authFetch(`/api/video-studio/jobs/${encodeURIComponent(jobId)}/stream`, {
        signal: abortCtrl.signal,
      });
      if (!streamRes.ok || !streamRes.body) {
        throw new Error(`Stream error HTTP ${streamRes.status}`);
      }

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          let eventName = 'message';
          let dataRaw = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataRaw += line.slice(5).trim();
          }
          if (!dataRaw) continue;
          const payload = JSON.parse(dataRaw);
          if (eventName === 'progress') {
            const pct = Math.min(100, Math.max(0, Number(payload.pct) || 0));
            setJobPct(pct);
            if (payload.frame && payload.totalFrames) {
              setJobStatus(`Frame ${payload.frame}/${payload.totalFrames} · ${pct}% · ETA ${payload.etaSec ?? 0}s`);
            } else if (payload.stage) {
              setJobStatus(`Stage: ${payload.stage}`);
            }
          } else if (eventName === 'log') {
            setJobLogs((prev) => `${prev}${payload.message}\n`);
          } else if (eventName === 'done') {
            setJobPct(100);
            setJobStatus('Completed');
            setActiveJobId(null);
            await loadProjectDetails(selectedId);
            onShowToast(`✓ ${type} completed`);
          } else if (eventName === 'error') {
            setJobStatus(`Error: ${payload.message}`);
            setJobLogs((prev) => `${prev}ERROR: ${payload.message}\n`);
            setActiveJobId(null);
          } else if (eventName === 'cancelled') {
            setJobStatus('Cancelled');
            setJobLogs((prev) => `${prev}Cancelled by user.\n`);
            setActiveJobId(null);
          }
        }
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : 'Stream error';
        setJobStatus(`Error: ${msg}`);
        onShowToast(`⚠️ ${msg}`);
      }
      setActiveJobId(null);
    }
  };

  const handleCancelJob = async () => {
    if (!activeJobId) return;
    await authFetch(`/api/video-studio/jobs/${encodeURIComponent(activeJobId)}/cancel`, {
      method: 'POST',
    });
    if (jobAbortRef.current) jobAbortRef.current.abort();
    setActiveJobId(null);
  };

  const handleCreateProject = async () => {
    try {
      const res = await authFetch('/api/video-studio/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newProjId.trim(),
          name: newProjName.trim(),
          durationSec: newProjDuration,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create project');
      setIsNewModalOpen(false);
      setNewProjId('');
      setNewProjName('');
      const listRes = await authFetch('/api/video-studio/projects', { cache: 'no-store' });
      const listData = await listRes.json();
      setProjects(listData.projects || []);
      await handleSelectProject(data.project.config.id);
      onShowToast(`✓ Created video-studio/projects/${data.project.config.id}/`);
    } catch (err) {
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Create failed'}`);
    }
  };

  if (capabilities.checked && !capabilities.serverAvailable) {
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

  const cfg = draftConfig || details?.config;
  const totalFrames = cfg ? Math.round(cfg.video.durationSec * cfg.video.fps) : 0;
  const curFrame = cfg ? Math.round(previewTime * cfg.video.fps) : 0;
  const ffmpegDisabledReason = !capabilities.ffmpegAvailable
    ? 'Requires local FFmpeg & ffprobe on PATH'
    : undefined;

  const iframeBasePath = previewToken
    ? `/video-projects/s/${encodeURIComponent(previewToken)}/${encodeURIComponent(selectedId)}/scene.html`
    : `/video-projects/${encodeURIComponent(selectedId)}/scene.html`;

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
            value={selectedId}
            onChange={(e) => handleSelectProject(e.target.value)}
            aria-label="Select video project"
            className="rounded-lg border border-[#1E2833] bg-[#080d11] px-3 py-1.5 text-xs text-white focus:outline-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.valid ? `${p.name} (${p.id})` : `${p.id} [invalid]`}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setIsNewModalOpen(true)}
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
              masterAudioUrl
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-400/40 bg-amber-500/10 text-amber-300'
            }`}
          >
            {masterAudioUrl ? 'Master Audio Synced' : 'Audio Pending'}
          </span>
        </div>
      </div>

      {/* Graceful Degradation Notice when FFmpeg is not available in the container */}
      {capabilities.checked && capabilities.serverAvailable && !capabilities.ffmpegAvailable && (
        <div
          role="status"
          data-testid="film-studio-ffmpeg-notice"
          className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] text-xs text-amber-100"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-amber-200">Preview &amp; Script Mode Active</span>
              <span aria-hidden="true" className="text-amber-500/60 mx-1.5">·</span>
              <span className="text-amber-100/90">
                FFmpeg/ffprobe were not detected on <code className="font-mono">PATH</code> in this container. Interactive 60fps HTML stage preview,{' '}
                <code className="font-mono">project.json</code> editing, and Bundled HTML export work normally; audio mixing &amp; MP4 rendering require local FFmpeg.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleExportBundledHtml}
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
                {masterAudioUrl
                  ? 'Master clock locked to audio/master.wav'
                  : capabilities.ffmpegAvailable
                  ? 'Silent clock (rebuild audio mix for voiceover + music sync)'
                  : 'Silent 60fps DOM clock (FFmpeg required to build audio/master.wav)'}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleExportBundledHtml}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] text-xs font-medium text-slate-200 cursor-pointer transition-colors"
                title="Bundle scene.html and all project assets into a standalone self-contained HTML file"
              >
                <FileCode2 className="w-3.5 h-3.5" style={{ color: accentColor }} />
                <span>Bundled HTML</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  stopPlayback();
                  setPreviewAspect((a) => (a === '16:9' ? '9:16' : '16:9'));
                  setIframeEpoch((n) => n + 1);
                }}
                className="px-2.5 py-1 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] text-xs font-medium text-slate-200 cursor-pointer transition-colors"
              >
                Aspect: {previewAspect}
              </button>
              <button
                type="button"
                onClick={() => setSafeZonesVisible((v) => !v)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                  safeZonesVisible
                    ? 'border-white/30 bg-white/12 text-white'
                    : 'border-[#1E2833] bg-[#121A21] text-slate-300 hover:text-white'
                }`}
                style={safeZonesVisible ? { borderColor: accentColor, color: accentColor } : undefined}
              >
                Safe-Zones: {safeZonesVisible ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between gap-3">
            <div
              className={`relative bg-[#080d11] rounded-lg overflow-hidden border border-[#1E2833] mx-auto w-full ${
                previewAspect === '9:16' ? 'max-w-[300px] aspect-[9/16]' : 'aspect-video'
              }`}
            >
              <iframe
                ref={iframeRef}
                key={`${selectedId}-${previewAspect}-${iframeEpoch}-${Boolean(previewToken)}`}
                src={`${iframeBasePath}?embed=1${
                  previewAspect === '9:16' ? '&aspect=9:16' : ''
                }&e=${iframeEpoch}`}
                title="Film Studio Scene Preview"
                className="w-full h-full border-0 block"
                onLoad={() => syncStageTime(previewTimeRef.current)}
              />
              {safeZonesVisible && (
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

            {masterAudioUrl && (
              <audio ref={masterAudioRef} src={masterAudioUrl} preload="auto" className="hidden" />
            )}

            {/* Transport Controls */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => (isPlaying ? stopPlayback() : startPlayback())}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-950 cursor-pointer transition-opacity hover:opacity-90"
                  style={{ backgroundColor: accentColor }}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopPlayback();
                    if (cfg) syncStageTime(previewTimeRef.current - 1 / cfg.video.fps);
                  }}
                  className="rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] px-2 py-1.5 text-xs text-slate-200 cursor-pointer"
                  title="Step back 1 frame"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopPlayback();
                    if (cfg) syncStageTime(previewTimeRef.current + 1 / cfg.video.fps);
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
                  value={previewTime}
                  onChange={(e) => {
                    stopPlayback();
                    syncStageTime(Number(e.target.value));
                  }}
                  className="flex-1 min-w-[120px]"
                  style={{ accentColor }}
                />
                <span className="font-mono text-xs tabular-nums text-slate-300">
                  {previewTime.toFixed(2).padStart(5, '0')}s · Frame {curFrame}/{totalFrames}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {cfg?.acts.map((act) => {
                  const active =
                    previewTime >= act.startSec &&
                    previewTime <= act.startSec + act.maxDurationSec;
                  return (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => {
                        stopPlayback();
                        syncStageTime(act.startSec);
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
        <section className="lg:col-span-5 rounded-xl border border-[#1E2833] bg-[#0b1118] flex flex-col min-h-0 overflow-hidden">
          <div className="flex border-b border-[#1E2833] bg-[#080d11]/80">
            <button
              type="button"
              onClick={() => setActiveTab('script')}
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
              onClick={() => setActiveTab('build')}
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
                  onClick={handleSaveConfig}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-950 cursor-pointer transition-opacity hover:opacity-90"
                  style={{ backgroundColor: accentColor }}
                >
                  <Save className="w-3.5 h-3.5" /> Save project.json
                </button>
                <button
                  type="button"
                  disabled={isBusyAudio || !capabilities.ffmpegAvailable}
                  onClick={() => handleRegenerateVo(null)}
                  title={ffmpegDisabledReason || 'Generate voiceovers for changed acts and remix master.wav'}
                  className="flex items-center gap-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" style={{ color: accentColor }} /> Regenerate Changed Acts
                </button>
                <button
                  type="button"
                  disabled={isBusyAudio || !capabilities.ffmpegAvailable}
                  onClick={handleRebuildMix}
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
                              onClick={() => handleToggleStemPlay(stem.file)}
                              className="px-2 py-0.5 rounded border border-[#1E2833] bg-[#080d11] hover:bg-white/[0.08] text-[11px] text-white cursor-pointer"
                            >
                              <Volume2 className="w-3 h-3 inline mr-1" />
                              Play
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isBusyAudio || !capabilities.ffmpegAvailable}
                            onClick={() => handleRegenerateVo(act.id)}
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
                          setDraftConfig(next);
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
                              setDraftConfig(next);
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
                              setDraftConfig(next);
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
                            setDraftConfig(next);
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
                              setDraftConfig(next);
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
                              setDraftConfig(next);
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
                  details.stems.master && { label: 'Master Mix', entry: details.stems.master, replaceable: false },
                  details.stems.music && { label: 'Music Bed', entry: details.stems.music, replaceable: true },
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
                            onClick={() => handleToggleStemPlay(entry.file)}
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
                                if (f) void handleBinaryUpload(f, entry.file.split('/').pop() || f.name, 'audio');
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
                        if (f) void handleBinaryUpload(f, f.name, 'assets');
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
                  onClick={() => handleStartJob('render-fast')}
                  className="px-2.5 py-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  Render Draft (720p)
                </button>
                <button
                  type="button"
                  disabled={Boolean(activeJobId) || !capabilities.ffmpegAvailable}
                  title={ffmpegDisabledReason || 'Render master 1920x1080 60fps MP4'}
                  onClick={() => handleStartJob('render')}
                  className="px-2.5 py-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  Render 16:9
                </button>
                <button
                  type="button"
                  disabled={Boolean(activeJobId) || !capabilities.ffmpegAvailable}
                  title={ffmpegDisabledReason || 'Export 1080x1920 9:16 vertical MP4'}
                  onClick={() => handleStartJob('vertical')}
                  className="px-2.5 py-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  Export 9:16
                </button>
                <button
                  type="button"
                  disabled={Boolean(activeJobId) || !capabilities.ffmpegAvailable}
                  title={ffmpegDisabledReason || 'Run complete VO -> DSP -> Mix -> Render -> 9:16 -> QA pipeline'}
                  onClick={() => handleStartJob('build')}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-opacity hover:opacity-90"
                  style={{ backgroundColor: accentColor }}
                >
                  Full Build
                </button>
                <button
                  type="button"
                  disabled={Boolean(activeJobId) || !capabilities.ffmpegAvailable}
                  title={ffmpegDisabledReason || 'Inspect stream technical metrics and generate QA contact sheet'}
                  onClick={() => handleStartJob('qa')}
                  className="px-2.5 py-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  Run QA
                </button>
                {activeJobId && (
                  <button
                    type="button"
                    onClick={handleCancelJob}
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
                  onClick={handleExportBundledHtml}
                  className="flex items-center gap-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] px-2.5 py-1.5 text-xs text-white cursor-pointer transition-colors"
                >
                  <FileCode2 className="w-3.5 h-3.5" style={{ color: accentColor }} /> Bundled HTML
                </button>
                {details.outputs.final16x9 && (
                  <button
                    type="button"
                    onClick={() => handleAuthenticatedDownload('output/final-16x9.mp4', `${selectedId}-16x9.mp4`)}
                    className="flex items-center gap-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] px-2.5 py-1.5 text-xs text-white cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> 16:9 MP4
                  </button>
                )}
                {details.outputs.final9x16 && (
                  <button
                    type="button"
                    onClick={() => handleAuthenticatedDownload('output/final-9x16.mp4', `${selectedId}-9x16.mp4`)}
                    className="flex items-center gap-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] hover:bg-white/[0.08] px-2.5 py-1.5 text-xs text-white cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> 9:16 MP4
                  </button>
                )}
                {details.stems.master.ready && (
                  <button
                    type="button"
                    onClick={() => handleAuthenticatedDownload('audio/master.wav', `${selectedId}-master.wav`)}
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
      </div>

      {/* New Project Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#1E2833] bg-[#0b1118] p-5 space-y-3 shadow-2xl">
            <h3 className="text-base font-bold text-white">Create Film Studio Project</h3>
            <label className="block text-xs text-slate-300">
              Project ID (slug)
              <input
                type="text"
                placeholder="acme-launch-film"
                value={newProjId}
                onChange={(e) => setNewProjId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#1E2833] bg-[#080d11] px-3 py-2 text-xs text-white focus:outline-none"
              />
            </label>
            <label className="block text-xs text-slate-300">
              Display Name
              <input
                type="text"
                placeholder="Acme Launch Film"
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
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
                onChange={(e) => setNewProjDuration(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-[#1E2833] bg-[#080d11] px-3 py-2 text-xs text-white focus:outline-none"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-[#1E2833] bg-[#121A21] text-xs text-slate-300 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateProject}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-950 cursor-pointer"
                style={{ backgroundColor: accentColor }}
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
