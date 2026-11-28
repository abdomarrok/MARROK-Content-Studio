import { useCallback, useEffect, useRef, useState } from 'react';
import { withClientAuthHeaders } from '../../../lib/security/clientSessionToken.ts';

export interface VoiceSettings {
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
  speed?: number;
}

export interface VoiceConfig {
  provider: 'elevenlabs' | 'gemini';
  voiceId: string;
  modelId: string;
  seed?: number;
  settings?: VoiceSettings;
}

export interface ActConfig {
  id: string;
  label: string;
  startSec: number;
  maxDurationSec: number;
  text: string;
  voiceOverride: Partial<VoiceConfig> | null;
}

export interface SfxConfig {
  id: string;
  source: 'dsp' | 'file';
  file: string;
  atSec: number;
  volume?: number;
  volumeDb?: number;
  dspPreset?: string;
}

export interface ProjectConfig {
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

export interface StemTech {
  durationSec: number;
  sampleRate: number;
  bitsPerSample: number;
  channels: number;
  peakDb: number;
  leadingSilenceMs: number;
}

export interface StemEntry {
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

export interface ProjectSummary {
  id: string;
  name: string;
  valid: boolean;
  error?: string;
}

export interface ProjectDetails {
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

export interface VideoStudioCapabilities {
  checked: boolean;
  serverAvailable: boolean;
  ffmpegAvailable: boolean;
}

export type VideoStudioJobType = 'render-fast' | 'render' | 'vertical' | 'build' | 'qa';

export interface UseVideoStudioControllerOptions {
  initialProjectId?: string | null;
  onShowToast: (msg: string) => void;
  onAuthRequired?: () => void;
}

export function useVideoStudioController({
  initialProjectId = null,
  onShowToast,
  onAuthRequired,
}: UseVideoStudioControllerOptions) {
  const [capabilities, setCapabilities] = useState<VideoStudioCapabilities>({
    checked: false,
    serverAvailable: true,
    ffmpegAvailable: false,
  });

  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>(initialProjectId || 'marrok-brand-film');
  const [details, setDetails] = useState<ProjectDetails | null>(null);
  const [draftConfig, setDraftConfig] = useState<ProjectConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'script' | 'build'>('script');

  // Preview state
  const [previewAspect, setPreviewAspect] = useState<'16:9' | '9:16'>('16:9');
  const [safeZonesVisible, setSafeZonesVisible] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [iframeEpoch, setIframeEpoch] = useState(1);

  // Auth-fetched blob URLs (revoked cleanly on switch/unmount)
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
  const [jobLogs, setJobLogs] = useState<string>(
    'Ready. Select a render or build action above.'
  );
  const jobAbortRef = useRef<AbortController | null>(null);

  // New project modal state
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newProjId, setNewProjId] = useState('');
  const [newProjName, setNewProjName] = useState('');
  const [newProjDuration, setNewProjDuration] = useState(15);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const headers = withClientAuthHeaders(init?.headers as Record<string, string> | undefined);
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
      if (data.config?.video) {
        setPreviewAspect(
          data.config.video.height > data.config.video.width ? '9:16' : '16:9'
        );
      }
      if (data.previewToken) {
        setPreviewToken(data.previewToken);
      }

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
      if (capRes.status === 404 || !capRes.ok) {
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
      const preferred =
        (initialProjectId && items.find((p) => p.id === initialProjectId)?.id) ||
        items.find((p) => p.id === 'marrok-brand-film')?.id ||
        items[0]?.id;
      if (preferred) {
        setSelectedId(preferred);
        await loadProjectDetails(preferred);
      }
    } catch {
      setCapabilities({ checked: true, serverAvailable: false, ffmpegAvailable: false });
    }
  }, [authFetch, initialProjectId, loadProjectDetails]);

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
      onShowToast(
        actId ? `Generating ${actId} + remixing...` : 'Checking cache & generating changed acts...'
      );
      const res = await authFetch(
        `/api/video-studio/projects/${encodeURIComponent(selectedId)}/audio/vo`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actId }),
        }
      );
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
      const res = await authFetch(
        `/api/video-studio/projects/${encodeURIComponent(selectedId)}/audio/mix`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );
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

  const handleStartJob = async (type: VideoStudioJobType) => {
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
      const res = await authFetch(
        `/api/video-studio/projects/${encodeURIComponent(selectedId)}/jobs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to launch job');
      const jobId = data.jobId as string;
      setActiveJobId(jobId);

      // Authenticated SSE stream using fetch + ReadableStream
      const streamRes = await authFetch(
        `/api/video-studio/jobs/${encodeURIComponent(jobId)}/stream`,
        { signal: abortCtrl.signal }
      );
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
              setJobStatus(
                `Frame ${payload.frame}/${payload.totalFrames} · ${pct}% · ETA ${payload.etaSec ?? 0}s`
              );
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

  return {
    capabilities,
    previewToken,
    projects,
    selectedId,
    details,
    draftConfig,
    setDraftConfig,
    activeTab,
    setActiveTab,
    previewAspect,
    setPreviewAspect,
    safeZonesVisible,
    setSafeZonesVisible,
    previewTime,
    isPlaying,
    iframeEpoch,
    setIframeEpoch,
    masterAudioUrl,
    qaSheetUrl,
    iframeRef,
    masterAudioRef,
    previewTimeRef,
    isBusyAudio,
    activeJobId,
    jobPct,
    jobStatus,
    jobLogs,
    isNewModalOpen,
    setIsNewModalOpen,
    newProjId,
    setNewProjId,
    newProjName,
    setNewProjName,
    newProjDuration,
    setNewProjDuration,
    syncStageTime,
    stopPlayback,
    startPlayback,
    handleSelectProject,
    handleSaveConfig,
    handleRegenerateVo,
    handleRebuildMix,
    handleToggleStemPlay,
    handleBinaryUpload,
    handleAuthenticatedDownload,
    handleExportBundledHtml,
    handleStartJob,
    handleCancelJob,
    handleCreateProject,
  };
}
