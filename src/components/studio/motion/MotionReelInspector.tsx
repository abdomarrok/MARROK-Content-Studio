import React, { useState, useRef, useEffect } from 'react';
import {
  Film,
  Plus,
  Trash2,
  RefreshCw,
  Volume2,
  Palette,
  Sliders,
  ChevronDown,
  ChevronUp,
  Languages,
  Upload,
  Video,
  Sparkles,
  Download,
  Loader2,
  ArrowUpRight,
} from 'lucide-react';
import { fetchAuthedJson, HttpClientError } from '../../../lib/network/httpClient.ts';
import {
  MotionBrandConfig,
  MotionReelData,
  MotionSceneConfig,
  MotionSfxProfile,
  MotionTemplateId,
  MotionTransitionType,
  SlideData,
  SlideType,
  ThemePalette,
} from '../../../types.ts';
import {
  FONT_OPTIONS,
  MOTION_TEMPLATE_LIST,
  TRANSITION_OPTIONS,
  getMotionTemplate,
  playProceduralSfxCue,
} from '../../../lib/motion/index.ts';
import { isVideoFile } from '../../../lib/canvasExporter.ts';

interface MotionReelInspectorProps {
  reelConfig: MotionReelData;
  theme: ThemePalette;
  selectedSceneId: string | null;
  onSelectScene: (id: string | null) => void;
  onChangeReelConfig: (updated: MotionReelData) => void;
  onSyncFromCarousel: (templateId?: MotionTemplateId, languageMode?: 'ar' | 'en' | 'bilingual') => void;
  onShowToast: (msg: string) => void;
  activeVideoSlide?: SlideData | null;
  isGeneratingFromVideo?: boolean;
  isExportingVideo?: boolean;
  videoExportProgress?: number;
  onUploadVideoFile?: (file: File) => void;
  onAnalyzeUploadedVideo?: () => void;
  onSwitchToVideoCardReel?: () => void;
  onExportVideoCardMp4?: () => void;
  onOpenInFilmStudio?: (projectId: string) => void;
}

function deriveFilmStudioSlugFromReel(reelConfig: MotionReelData): { id: string; name: string } {
  const firstScene = reelConfig.scenes?.[0];
  const rawTitle = (
    firstScene?.enTitle ||
    firstScene?.text ||
    firstScene?.label ||
    reelConfig.brand?.name ||
    'marrok-reel'
  )
    .replace(/\|/g, ' ')
    .trim();

  const slugCore = rawTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 46)
    .replace(/-+$/g, '');

  const id = `reel-${slugCore || reelConfig.templateId || 'motion'}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 62);

  const validId = /^[a-z0-9][a-z0-9-]{0,62}$/.test(id) ? id : 'marrok-promoted-reel';
  const cleanName = rawTitle ? `${rawTitle.slice(0, 48)} (9:16 Reel)` : 'MARROK Promoted 9:16 Reel';
  return { id: validId, name: cleanName };
}

const DOT_COLORS = [
  '#6ea0ff',
  '#a78bfa',
  '#f472b6',
  '#34d399',
  '#fbbf24',
  '#fb923c',
  '#60a5fa',
];

export const MotionReelInspector: React.FC<MotionReelInspectorProps> = ({
  reelConfig,
  theme,
  selectedSceneId,
  onSelectScene,
  onChangeReelConfig,
  onSyncFromCarousel,
  onShowToast,
  activeVideoSlide = null,
  isGeneratingFromVideo = false,
  isExportingVideo = false,
  videoExportProgress = 0,
  onUploadVideoFile,
  onAnalyzeUploadedVideo,
  onSwitchToVideoCardReel,
  onExportVideoCardMp4,
  onOpenInFilmStudio,
}) => {
  const [activeSection, setActiveSection] = useState<'scenes' | 'templates' | 'brand'>('scenes');
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);
  const [filmStudioAvailable, setFilmStudioAvailable] = useState(false);
  const [isPromotingToFilmStudio, setIsPromotingToFilmStudio] = useState(false);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const checkFilmStudioCapabilities = async () => {
      try {
        const data = await fetchAuthedJson<{
          serverAvailable?: boolean;
          localRenderAvailable?: boolean;
        }>('/api/video-studio/capabilities', {
          cache: 'no-store',
          timeoutMs: 10_000,
          signal: controller.signal,
          contextLabel: 'Film Studio capabilities',
        });
        if (isMounted) {
          setFilmStudioAvailable(Boolean(data?.serverAvailable ?? data?.localRenderAvailable));
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        // 404 is expected on serverless deployments where the local Film Studio router is not mounted
        const isExpectedUnavailable =
          err instanceof HttpClientError && (err.status === 404 || err.status === 401);
        if (!isExpectedUnavailable) {
          console.warn('[MotionReelInspector] Film Studio capability check failed:', err);
        }
        if (isMounted) setFilmStudioAvailable(false);
      }
    };
    void checkFilmStudioCapabilities();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, []);

  const handlePromoteToFilmStudio = async () => {
    if (isPromotingToFilmStudio || !filmStudioAvailable) return;
    setIsPromotingToFilmStudio(true);
    try {
      const { id, name } = deriveFilmStudioSlugFromReel(reelConfig);
      const template = getMotionTemplate(reelConfig.templateId);
      const sceneHtml = template.toHTML(reelConfig);

      const data = await fetchAuthedJson<{
        project?: { config?: { id?: string } };
      }>('/api/video-studio/projects/from-reel', {
        method: 'POST',
        timeoutMs: 25_000,
        body: {
          id,
          name,
          reelConfig,
          sceneHtml,
          overwrite: true,
        },
        contextLabel: 'Promote Reel to Film Studio',
      });
      const createdId = data?.project?.config?.id || id;
      onShowToast(`✓ Opened "${createdId}" in Film Studio (1080×1920 · 60fps)`);
      onOpenInFilmStudio?.(createdId);
    } catch (err) {
      console.warn('[MotionReelInspector] Promote to Film Studio failed:', err);
      onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Could not promote Reel to Film Studio'}`);
    } finally {
      setIsPromotingToFilmStudio(false);
    }
  };

  const updateBrand = (updates: Partial<MotionBrandConfig>) => {
    onChangeReelConfig({
      ...reelConfig,
      brand: {
        ...reelConfig.brand,
        ...updates,
      },
    });
  };

  const updateScene = (index: number, updates: Partial<MotionSceneConfig>) => {
    const newScenes = [...reelConfig.scenes];
    newScenes[index] = { ...newScenes[index], ...updates };
    const newDuration = Math.max(...newScenes.map((s) => s.to), 1);
    onChangeReelConfig({
      ...reelConfig,
      scenes: newScenes,
      duration: newDuration,
    });
  };

  const removeScene = (index: number) => {
    if (reelConfig.scenes.length <= 1) return;
    const newScenes = reelConfig.scenes.filter((_, i) => i !== index);
    const newDuration = newScenes.length ? Math.max(...newScenes.map((s) => s.to)) : 1;
    onChangeReelConfig({
      ...reelConfig,
      scenes: newScenes,
      duration: newDuration,
    });
    onShowToast(`Removed Scene #${index + 1}`);
  };

  const addScene = () => {
    const lastScene = reelConfig.scenes[reelConfig.scenes.length - 1];
    const startTime = lastScene ? lastScene.to : 0;
    const endTime = startTime + 3;
    const newId = `scene-${Date.now()}`;
    const newScene: MotionSceneConfig = {
      id: newId,
      label: `Slide 0${reelConfig.scenes.length + 1} · ROW`,
      text: reelConfig.brand.direction === 'rtl' ? 'نص المشهد الجديد' : 'New kinetic scene',
      enTitle: 'NEW ARCHITECTURAL MECHANISM',
      arTitle: 'آلية هندسية جديدة في النظام',
      enBody: 'Direct technical explanation of how this layer operates.',
      arBody: 'شرح تقني مباشر لكيفية عمل هذه الطبقة المعمارية.',
      slideType: 'row',
      stepNumber: String(reelConfig.scenes.length + 1).padStart(2, '0'),
      from: startTime,
      to: endTime,
      springK: 220,
      springD: 22,
    };
    const newScenes = [...reelConfig.scenes, newScene];
    onChangeReelConfig({
      ...reelConfig,
      scenes: newScenes,
      duration: endTime,
    });
    onSelectScene(newId);
    onShowToast(`Added Scene #${newScenes.length}`);
  };

  const handleSwitchTemplate = (templateId: MotionTemplateId) => {
    if (templateId === reelConfig.templateId) return;
    onSyncFromCarousel(templateId, reelConfig.languageMode || 'bilingual');
    onShowToast(`Switched Motion Reel template to ${getMotionTemplate(templateId).meta.name}`);
  };

  const handleSyncColorsFromStudioTheme = () => {
    updateBrand({
      accentColor: theme.accent || '#6EA0FF',
      bgColor: theme.baseBg || '#080A12',
      textColor: theme.textWhite || '#FFFFFF',
    });
    onShowToast(`Synced Motion Reel palette with ${theme.name} theme`);
  };

  return (
    <div className="space-y-4">
      {onUploadVideoFile && (
        <input
          ref={videoInputRef}
          type="file"
          data-testid="reel-inspector-video-input"
          accept=".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUploadVideoFile(file);
            e.target.value = '';
          }}
        />
      )}

      {/* Video-to-Reel Upload & Dual Reel Mode Hub */}
      {onUploadVideoFile && (
        <div
          data-testid="reel-video-upload-hub"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingVideo(true);
          }}
          onDragLeave={() => setIsDraggingVideo(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingVideo(false);
            const file = e.dataTransfer?.files?.[0];
            if (file && isVideoFile(file)) {
              onUploadVideoFile(file);
            }
          }}
          className={`p-3 rounded-xl border transition-all ${
            isDraggingVideo
              ? 'border-cyan-400 bg-cyan-950/35 ring-2 ring-cyan-400/30'
              : activeVideoSlide?.videoUrl
              ? 'border-cyan-500/35 bg-cyan-950/20'
              : 'border-white/12 bg-black/45'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-white/15 bg-white/[0.05]"
                style={{ color: theme.accent }}
              >
                <Video className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                  <span>
                    {activeVideoSlide?.videoUrl
                      ? `Uploaded Video: ${activeVideoSlide.videoFileName || 'video-clip.mp4'}`
                      : 'Create 9:16 Reel from Your Video (.MP4 / .WebM / .MOV)'}
                  </span>
                  {activeVideoSlide?.videoDuration ? (
                    <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/15 px-1.5 py-0.5 rounded border border-cyan-500/30">
                      {activeVideoSlide.videoDuration.toFixed(1)}s
                    </span>
                  ) : null}
                </div>
                <p className="text-[11px] text-slate-400">
                  {activeVideoSlide?.videoUrl
                    ? 'Switch between live 9:16 Video Card Reel (with original audio & MARROK frame) or AI-extracted Motion Scenes below.'
                    : 'Upload or drop a video clip to frame it inside a 9:16 MARROK Reel with preserved audio, or extract keyframes into animated scenes.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              <button
                type="button"
                data-testid="reel-inspector-upload-video-btn"
                onClick={() => videoInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-xs font-bold text-cyan-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5 text-cyan-300" />
                <span>{activeVideoSlide?.videoUrl ? 'Replace Video' : 'Upload Video (.MP4)'}</span>
              </button>

              {activeVideoSlide?.videoUrl && onSwitchToVideoCardReel && (
                <button
                  type="button"
                  data-testid="reel-switch-to-video-card-btn"
                  onClick={onSwitchToVideoCardReel}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-bold text-emerald-100 transition-colors cursor-pointer whitespace-nowrap"
                  title="Edit & preview your uploaded video clip live inside the 9:16 (1080×1920) MARROK card frame with bilingual hook & original audio"
                >
                  <Video className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Open 9:16 Video Clip Stage</span>
                </button>
              )}

              {activeVideoSlide?.videoUrl && onAnalyzeUploadedVideo && (
                <button
                  type="button"
                  data-testid="reel-analyze-video-scenes-btn"
                  disabled={isGeneratingFromVideo}
                  onClick={onAnalyzeUploadedVideo}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/12 disabled:opacity-50 border border-white/15 text-xs font-semibold text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                  title="Extract keyframes from your uploaded video with AI Vision and sync animated Reel scenes + caption"
                >
                  {isGeneratingFromVideo ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
                      <span>Analyzing Video…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                      <span>AI Extract Scenes from Video</span>
                    </>
                  )}
                </button>
              )}

              {activeVideoSlide?.videoUrl && onExportVideoCardMp4 && (
                <button
                  type="button"
                  data-testid="reel-export-uploaded-video-mp4-btn"
                  disabled={isExportingVideo}
                  onClick={onExportVideoCardMp4}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-xs font-bold text-slate-950 transition-colors cursor-pointer whitespace-nowrap shadow-sm"
                  title="Export your uploaded video framed in 1080×1920 MARROK chrome with preserved audio"
                >
                  {isExportingVideo ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>MP4 ({Math.round(videoExportProgress)}%)</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Video Clip MP4</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sub-navigation bar for Motion Reel Inspector */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-black/50 border border-white/10">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveSection('scenes')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSection === 'scenes'
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            style={activeSection === 'scenes' ? { color: theme.accent } : undefined}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Scenes ({reelConfig.scenes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('templates')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSection === 'templates'
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            style={activeSection === 'templates' ? { color: theme.accent } : undefined}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Templates ({MOTION_TEMPLATE_LIST.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('brand')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSection === 'brand'
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            style={activeSection === 'brand' ? { color: theme.accent } : undefined}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Brand & SFX</span>
          </button>
        </div>

        {/* Language / Slide Auto-Sync Controls */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-black/60 p-0.5 rounded-lg border border-white/10 text-[10px] font-bold">
            <button
              type="button"
              onClick={() => onSyncFromCarousel(reelConfig.templateId, 'bilingual')}
              className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                (reelConfig.languageMode || 'bilingual') === 'bilingual'
                  ? 'bg-white/15 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Populate reel scenes with full Bilingual EN + AR MARROK slide copy"
            >
              EN + AR
            </button>
            <button
              type="button"
              onClick={() => onSyncFromCarousel(reelConfig.templateId, 'ar')}
              className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                reelConfig.languageMode === 'ar'
                  ? 'bg-white/15 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Populate reel scenes with Arabic primary titles (RTL)"
            >
              AR (RTL)
            </button>
            <button
              type="button"
              onClick={() => onSyncFromCarousel(reelConfig.templateId, 'en')}
              className={`px-2 py-0.5 rounded-md cursor-pointer transition-colors ${
                reelConfig.languageMode === 'en'
                  ? 'bg-white/15 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Populate reel scenes with English primary titles (LTR)"
            >
              EN (LTR)
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              onSyncFromCarousel(reelConfig.templateId, reelConfig.languageMode || 'bilingual')
            }
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-[11px] font-semibold text-cyan-200 transition-colors cursor-pointer"
            title="Auto-convert active Carousel slides into animated MARROK slide scenes"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Sync from Slides</span>
          </button>

          {filmStudioAvailable && (
            <button
              type="button"
              data-testid="reel-promote-to-film-studio-btn"
              disabled={isPromotingToFilmStudio}
              onClick={() => void handlePromoteToFilmStudio()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#121A21] hover:bg-white/[0.1] disabled:opacity-50 border border-[#1E2833] text-[11px] font-semibold text-white transition-colors cursor-pointer"
              title="Promote this 9:16 Motion Reel into a deterministic Film Studio project (1080×1920 @ 60fps with Act Voiceovers & audio mix)"
            >
              {isPromotingToFilmStudio ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" style={{ color: theme.accent }} />
                  <span>Promoting…</span>
                </>
              ) : (
                <>
                  <Film className="w-3 h-3" style={{ color: theme.accent }} />
                  <span>Open in Film Studio</span>
                  <ArrowUpRight className="w-3 h-3 text-slate-400" />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1: SCENES TIMELINE EDITOR */}
      {activeSection === 'scenes' && (
        <div className="space-y-2.5" id="scenes-list">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <span className="text-xs font-bold text-white block">
                Scene Keyframes, Smart Transitions & Spring Physics
              </span>
              <span className="text-[11px] text-slate-400">
                Total Duration:{' '}
                <strong className="font-mono tabular-nums text-white">
                  {reelConfig.duration.toFixed(1)}s
                </strong>{' '}
                · Use <code className="text-cyan-300 font-mono">|</code> to stagger multiple items
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-black/60 px-2.5 py-1 rounded-xl border border-white/10">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Transitions:
                </span>
                <select
                  value={reelConfig.defaultTransition || 'auto'}
                  onChange={(e) => {
                    const nextMode = e.target.value as MotionTransitionType;
                    onChangeReelConfig({
                      ...reelConfig,
                      defaultTransition: nextMode,
                    });
                  }}
                  className="bg-transparent text-xs font-bold text-cyan-300 focus:outline-none cursor-pointer"
                  title="Default transition choreography between consecutive scenes"
                >
                  {TRANSITION_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id} className="bg-slate-900 text-white">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={addScene}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/15 text-xs font-bold text-white transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Add Scene</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {reelConfig.scenes.map((scene, index) => {
              const isOpen =
                selectedSceneId === scene.id ||
                (!selectedSceneId && index === 0);
              const dotColor = DOT_COLORS[index % DOT_COLORS.length];

              return (
                <div
                  key={scene.id}
                  id={`scene-${scene.id}`}
                  className={`rounded-xl border transition-all ${
                    isOpen
                      ? 'bg-black/60 border-white/25 shadow-lg'
                      : 'bg-black/30 border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Scene Header */}
                  <div
                    onClick={() => onSelectScene(isOpen ? null : scene.id)}
                    className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: dotColor }}
                      />
                      <span className="text-xs font-bold text-white truncate">
                        {index + 1}. {scene.label}
                      </span>
                      <span className="text-[11px] text-slate-400 truncate max-w-[200px]">
                        {scene.text || '(Visual build)'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] font-mono tabular-nums text-slate-300 bg-white/[0.04] px-2 py-0.5 rounded border border-white/5">
                        {scene.from.toFixed(1)}s – {scene.to.toFixed(1)}s
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Scene Body Controls */}
                  {isOpen && (
                    <div className="px-3.5 pb-3.5 pt-2 border-t border-white/10 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                            Slide Graphic Archetype
                          </label>
                          <select
                            value={scene.slideType || 'hub'}
                            onChange={(e) =>
                              updateScene(index, { slideType: e.target.value as SlideType })
                            }
                            className="w-full px-3 py-1.5 rounded-lg bg-black/70 border border-white/15 focus:border-cyan-400/50 text-xs text-white focus:outline-none"
                          >
                            <option value="hub" className="bg-slate-900">Hub Orbital Diagram</option>
                            <option value="row" className="bg-slate-900">3-Stage Pipeline Schematic</option>
                            <option value="metric" className="bg-slate-900">Benchmark Metric + Sparkline</option>
                            <option value="code" className="bg-slate-900">Live Terminal Code Card</option>
                            <option value="cta" className="bg-slate-900">MARROK Follow & CTA Card</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                            Entry Transition
                          </label>
                          <select
                            value={scene.transition || 'auto'}
                            onChange={(e) =>
                              updateScene(index, {
                                transition: e.target.value as MotionTransitionType,
                              })
                            }
                            className="w-full px-3 py-1.5 rounded-lg bg-black/70 border border-white/15 focus:border-cyan-400/50 text-xs text-cyan-200 focus:outline-none"
                          >
                            {TRANSITION_OPTIONS.map((opt) => (
                              <option key={opt.id} value={opt.id} className="bg-slate-900 text-white">
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                            Primary Hook / Staggered (<code className="text-cyan-300">|</code>)
                          </label>
                          <input
                            type="text"
                            dir={reelConfig.brand.direction}
                            value={scene.text}
                            placeholder="Primary hook, metric, or pipe-separated items..."
                            onChange={(e) => updateScene(index, { text: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg bg-black/70 border border-white/15 focus:border-cyan-400/50 text-xs text-white focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                            Scene Label
                          </label>
                          <input
                            type="text"
                            value={scene.label}
                            onChange={(e) => updateScene(index, { label: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg bg-black/70 border border-white/15 focus:border-cyan-400/50 text-xs text-white focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Bilingual MARROK Slide Headlines & Bodies */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                            English Headline (LTR)
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={scene.enTitle || ''}
                            placeholder="ENGLISH SLIDE HEADLINE..."
                            onChange={(e) => updateScene(index, { enTitle: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg bg-black/70 border border-white/15 focus:border-cyan-400/50 text-xs text-white focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                            Arabic Headline (RTL)
                          </label>
                          <input
                            type="text"
                            dir="rtl"
                            value={scene.arTitle || ''}
                            placeholder="العنوان الرئيسي للشريحة بالعربية..."
                            onChange={(e) => updateScene(index, { arTitle: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg bg-black/70 border border-white/15 focus:border-cyan-400/50 text-xs text-white focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                            English Body Copy (LTR)
                          </label>
                          <input
                            type="text"
                            dir="ltr"
                            value={scene.enBody || ''}
                            placeholder="Technical explanation in English..."
                            onChange={(e) => updateScene(index, { enBody: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg bg-black/70 border border-white/15 focus:border-cyan-400/50 text-xs text-slate-200 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                            Arabic Body Copy (RTL)
                          </label>
                          <input
                            type="text"
                            dir="rtl"
                            value={scene.arBody || ''}
                            placeholder="الشرح التقني التفصيلي بالعربية..."
                            onChange={(e) => updateScene(index, { arBody: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-lg bg-black/70 border border-white/15 focus:border-cyan-400/50 text-xs text-slate-200 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Start / End Timing & Spring Sliders */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 items-end">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                            Start (s)
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={scene.from}
                            onChange={(e) => {
                              const val = Math.max(0, parseFloat(e.target.value) || 0);
                              updateScene(index, { from: val, to: Math.max(val + 0.5, scene.to) });
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-black/70 border border-white/15 text-xs font-mono tabular-nums text-white focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                            End (s)
                          </label>
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            value={scene.to}
                            onChange={(e) => {
                              const val = Math.max(
                                scene.from + 0.5,
                                parseFloat(e.target.value) || scene.from + 1
                              );
                              updateScene(index, { to: val });
                            }}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-black/70 border border-white/15 text-xs font-mono tabular-nums text-white focus:outline-none"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                            <span>Spring k</span>
                            <span className="font-mono tabular-nums text-white">
                              {scene.springK}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="60"
                            max="400"
                            value={scene.springK}
                            onChange={(e) =>
                              updateScene(index, {
                                springK: parseInt(e.target.value, 10) || 220,
                              })
                            }
                            className="w-full accent-cyan-400 cursor-pointer"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                            <span>Damping d</span>
                            <span className="font-mono tabular-nums text-white">
                              {scene.springD}
                            </span>
                          </div>
                          <input
                            type="range"
                            min="8"
                            max="40"
                            value={scene.springD}
                            onChange={(e) =>
                              updateScene(index, {
                                springD: parseInt(e.target.value, 10) || 22,
                              })
                            }
                            className="w-full accent-cyan-400 cursor-pointer"
                          />
                        </div>
                      </div>

                      {reelConfig.scenes.length > 1 && (
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => removeScene(index)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove Scene</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 2: TEMPLATES GALLERY */}
      {activeSection === 'templates' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MOTION_TEMPLATE_LIST.map((tpl) => {
            const isSelected = reelConfig.templateId === tpl.meta.id;
            return (
              <div
                key={tpl.meta.id}
                onClick={() => handleSwitchTemplate(tpl.meta.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'bg-white/10 border-cyan-400/60 shadow-lg'
                    : 'bg-black/40 border-white/10 hover:border-white/25 hover:bg-white/[0.04]'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{tpl.meta.category}</span>
                    {isSelected && (
                      <span className="text-cyan-300 font-bold">Active</span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-white">{tpl.meta.name}</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {tpl.meta.description}
                  </p>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-white/10">
                  <span>{tpl.meta.tags.join(' · ')}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SECTION 3: BRAND KIT & PROCEDURAL SFX */}
      {activeSection === 'brand' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-black/50 border border-white/10 space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">
                  Motion Brand Identity & Typography
                </span>
                <span className="text-[11px] text-slate-400">
                  Controls colors, font family, and RTL/LTR direction across all reel scenes
                </span>
              </div>

              <button
                type="button"
                onClick={handleSyncColorsFromStudioTheme}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/15 border border-white/10 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
              >
                <Palette className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                <span>Sync Studio Theme</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Brand Name
                </label>
                <input
                  type="text"
                  value={reelConfig.brand.name}
                  onChange={(e) => updateBrand({ name: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg bg-black/70 border border-white/15 text-xs text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Font Family
                </label>
                <select
                  value={reelConfig.brand.font}
                  onChange={(e) => updateBrand({ font: e.target.value })}
                  className="w-full px-3 py-1.5 rounded-lg bg-black/70 border border-white/15 text-xs text-white focus:outline-none"
                >
                  {FONT_OPTIONS.map((font) => (
                    <option key={font} value={font} className="bg-slate-900 text-white">
                      {font}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Text Direction
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-black/70 p-1 rounded-lg border border-white/15">
                  <button
                    type="button"
                    onClick={() => updateBrand({ direction: 'rtl' })}
                    className={`py-1 rounded text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                      reelConfig.brand.direction === 'rtl'
                        ? 'bg-white/15 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Languages className="w-3 h-3" />
                    <span>RTL ←</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updateBrand({ direction: 'ltr' })}
                    className={`py-1 rounded text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                      reelConfig.brand.direction === 'ltr'
                        ? 'bg-white/15 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>LTR →</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Color Pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Accent Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={reelConfig.brand.accentColor}
                    onChange={(e) => updateBrand({ accentColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border border-white/15"
                  />
                  <input
                    type="text"
                    value={reelConfig.brand.accentColor}
                    onChange={(e) => updateBrand({ accentColor: e.target.value })}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/70 border border-white/15 text-xs font-mono text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Background Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={reelConfig.brand.bgColor}
                    onChange={(e) => updateBrand({ bgColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border border-white/15"
                  />
                  <input
                    type="text"
                    value={reelConfig.brand.bgColor}
                    onChange={(e) => updateBrand({ bgColor: e.target.value })}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/70 border border-white/15 text-xs font-mono text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Text Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={reelConfig.brand.textColor}
                    onChange={(e) => updateBrand({ textColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border border-white/15"
                  />
                  <input
                    type="text"
                    value={reelConfig.brand.textColor}
                    onChange={(e) => updateBrand({ textColor: e.target.value })}
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/70 border border-white/15 text-xs font-mono text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Procedural 48kHz Warm Filtered Foley Synthesizer */}
          <div className="p-4 rounded-xl bg-black/50 border border-white/10 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-white block">
                  48kHz Warm Filtered Acoustic Foley Engine
                </span>
                <span className="text-[11px] text-slate-400">
                  2-pole low-pass & band-pass filtered sound effects matched to slide archetypes and transitions
                </span>
              </div>

              <div className="flex items-center gap-1.5 bg-black/60 p-1 rounded-xl border border-white/10">
                {(
                  [
                    { id: 'warm-foley', label: 'Warm Foley' },
                    { id: 'minimal-sub', label: 'Minimal Sub' },
                    { id: 'silent', label: 'Muted' },
                  ] as Array<{ id: MotionSfxProfile; label: string }>
                ).map((mode) => {
                  const currentProfile: MotionSfxProfile =
                    reelConfig.sfxEnabled === false
                      ? 'silent'
                      : reelConfig.sfxProfile || 'warm-foley';
                  const isActive = currentProfile === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() =>
                        onChangeReelConfig({
                          ...reelConfig,
                          sfxProfile: mode.id,
                          sfxEnabled: mode.id !== 'silent',
                        })
                      }
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                        isActive
                          ? mode.id === 'silent'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {(
                [
                  { voice: 'thump', label: 'Sub Thump', amp: 0.14 },
                  { voice: 'whoosh', label: 'Air Sweep', amp: 0.12 },
                  { voice: 'pop', label: 'Matte Pop', amp: 0.12 },
                  { voice: 'click', label: 'Relay Tick', amp: 0.08 },
                  { voice: 'chime', label: 'Glass Chime', amp: 0.12 },
                ] as const
              ).map(({ voice, label, amp }) => (
                <button
                  key={voice}
                  type="button"
                  onClick={() => playProceduralSfxCue(voice, amp)}
                  className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
