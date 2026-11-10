import React from 'react';
import {
  Sparkles,
  RefreshCw,
  X,
  FileText,
  Youtube,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Trash2,
  SlidersHorizontal,
  Zap,
  Layers,
  Film,
  Radar,
  Globe,
} from 'lucide-react';
import {
  extractArticleFromUrl,
  fetchTopicRadar,
  type GatheredTopicItem,
} from '../../../lib/gather/gatherClient.ts';
import {
  PostFormat,
  ThemePalette,
  DEFAULT_PALETTES,
} from '../../../types.ts';
import { ACCEPTED_SINGLE_SLIDE_MEDIA_ACCEPT, isVideoFile } from '../../../lib/canvasExporter.ts';
import type { ThemeCadenceAnalysis } from '../../../lib/theme/cadenceEngine.ts';

export interface StarterTopic {
  name: string;
  desc: string;
  prompt: string;
}

export const STARTER_TOPICS: StarterTopic[] = [
  {
    name: 'Scion Architecture',
    desc: 'Moving Beyond Git with server-authoritative VCS',
    prompt: "Anthropic's Scion: Moving Beyond Git with server-authoritative VCS for AI agents",
  },
  {
    name: 'Val Town MicroVMs',
    desc: 'Serverless TypeScript inside secure isolates',
    prompt: 'Val Town serverless execution inside secure V8 isolates and microVM boundaries',
  },
  {
    name: 'Zero-Trust Mesh',
    desc: 'mTLS egress perimeters & least-privilege tokens',
    prompt: 'Zero-Trust mesh architecture with mTLS egress perimeters and least-privilege tokens',
  },
  {
    name: 'Redis 8 Engine',
    desc: 'Multi-threaded core engine & active clustering',
    prompt: 'Redis 8 architectural leap: multi-threaded core engine and active-active clustering',
  },
];

export const INGEST_TABS = [
  { id: 'text' as const, label: 'Notes / Blog / Code', shortLabel: 'Notes', icon: FileText },
  { id: 'radar' as const, label: 'Topic Radar & URL Gather', shortLabel: 'Radar', icon: Radar },
  { id: 'youtube' as const, label: 'YouTube Summary', shortLabel: 'YouTube', icon: Youtube },
  { id: 'upload' as const, label: 'Screenshot / Image OCR', shortLabel: 'Image OCR', icon: ImageIcon },
];

export const DOMAIN_CATEGORIES = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'REVERSE ENGINEERING', label: 'Reversing & CVEs' },
  { id: 'AI AGENTS & MODELS', label: 'AI & Inference' },
  { id: 'LINUX KERNEL', label: 'Kernel & eBPF' },
  { id: 'KUBERNETES & CLOUD', label: 'Cloud & K8s' },
  { id: 'DISTRIBUTED SYSTEMS', label: 'Distributed Systems' },
];

export interface StudioCommandBarProps {
  promptInput: string;
  onPromptChange: (value: string) => void;
  onSetPromptInput: (value: string) => void;
  categoryHint: string;
  onSetCategoryHint: (category: string) => void;
  isGenerating: boolean;
  pipelineStatus: string | null;
  activePostFormat: PostFormat;
  onSwitchPostFormat: (format: PostFormat) => void;
  engineBadge: { label: string; cls: string };
  onInspectEngine: () => void;
  isExpanded: boolean;
  onSetIsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  isSheetOpen: boolean;
  activeTab: 'text' | 'radar' | 'youtube' | 'upload';
  onSetActiveTab: (tab: 'text' | 'radar' | 'youtube' | 'upload') => void;
  studioRadarTopics: GatheredTopicItem[];
  onSetStudioRadarTopics: (topics: GatheredTopicItem[]) => void;
  isStudioRadarLoading: boolean;
  onSetIsStudioRadarLoading: (loading: boolean) => void;
  studioCustomUrl: string;
  onSetStudioCustomUrl: (url: string) => void;
  isExtractingStudioUrl: boolean;
  onSetIsExtractingStudioUrl: (extracting: boolean) => void;
  uploadedImage: {
    base64: string;
    mimeType: string;
    name: string;
    sizeKb: number;
  } | null;
  onSetUploadedImage: (
    img: {
      base64: string;
      mimeType: string;
      name: string;
      sizeKb: number;
    } | null
  ) => void;
  isDragOver: boolean;
  onSetIsDragOver: (drag: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onImageFile: (file: File) => void;
  onSelectDemoImage: (url: string, name: string) => void;
  onTriggerStarterTopic: (topic: StarterTopic) => void;
  onClearDock: () => void;
  onInstantSynthesize: () => void;
  onRunAutonomousPipeline: (overridePrompt?: string) => void;
  dockCadence: ThemeCadenceAnalysis;
  theme: ThemePalette;
  onSelectTheme: (palette: ThemePalette) => void;
  onOpenThemeCustomizer?: () => void;
  onOpenPublishScheduleModal?: (tab?: 'single' | 'bulk' | 'storage') => void;
  onShowToast: (msg: string) => void;
}

export const StudioCommandBar: React.FC<StudioCommandBarProps> = ({
  promptInput,
  onPromptChange,
  onSetPromptInput,
  categoryHint,
  onSetCategoryHint,
  isGenerating,
  pipelineStatus,
  activePostFormat,
  onSwitchPostFormat,
  engineBadge,
  onInspectEngine,
  isExpanded,
  onSetIsExpanded,
  isSheetOpen,
  activeTab,
  onSetActiveTab,
  studioRadarTopics,
  onSetStudioRadarTopics,
  isStudioRadarLoading,
  onSetIsStudioRadarLoading,
  studioCustomUrl,
  onSetStudioCustomUrl,
  isExtractingStudioUrl,
  onSetIsExtractingStudioUrl,
  uploadedImage,
  onSetUploadedImage,
  isDragOver,
  onSetIsDragOver,
  fileInputRef,
  onImageFile,
  onSelectDemoImage,
  onTriggerStarterTopic,
  onClearDock,
  onInstantSynthesize,
  onRunAutonomousPipeline,
  dockCadence,
  theme,
  onSelectTheme,
  onOpenThemeCustomizer,
  onOpenPublishScheduleModal,
  onShowToast,
}) => {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onSetIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        onSetIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onSetIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && (file.type.startsWith('image/') || isVideoFile(file))) {
          onImageFile(file);
        }
      }}
      className={`relative z-30 shrink-0 ${
        isSheetOpen && !isExpanded ? 'hidden lg:block' : 'block'
      }`}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_SINGLE_SLIDE_MEDIA_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImageFile(file);
        }}
      />

      {/* Single-Row Top Command & Ingestion Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onRunAutonomousPipeline();
        }}
        className={`flex flex-nowrap items-center gap-1.5 sm:gap-2 bg-[#0b1118]/95 border rounded-2xl p-1.5 sm:p-2 shadow-xl backdrop-blur-xl transition-all duration-200 ${
          isDragOver
            ? 'border-cyan-400 bg-cyan-950/20 ring-2 ring-cyan-400/40'
            : isExpanded
            ? 'border-white/25 ring-1 ring-white/15'
            : 'border-white/10'
        }`}
      >
        {/* Topic / Notes Input */}
        <div className="relative flex-1 min-w-0 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 shrink-0 ml-1.5" style={{ color: theme.accent }} />
          <input
            type="text"
            value={promptInput}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder="Enter topic, paste notes, or drop a screenshot (e.g. Zero-Trust Mesh, Redis 8)..."
            disabled={isGenerating}
            className="w-full min-w-0 bg-transparent px-1.5 sm:px-2 py-1 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none font-sans"
          />

          {uploadedImage && (
            <div className="flex items-center gap-1 bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[11px] px-1.5 py-0.5 rounded-lg shrink-0">
              <ImageIcon className="w-3 h-3" />
              <span className="truncate max-w-[64px] sm:max-w-[90px] font-mono text-[10px]">
                {uploadedImage.name}
              </span>
              <button
                type="button"
                onClick={() => onSetUploadedImage(null)}
                className="hover:text-white cursor-pointer"
                title="Remove attachment"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Quick Starter Chips (Desktop XL) */}
        {!promptInput && !uploadedImage && !pipelineStatus && (
          <div className="hidden xl:flex items-center gap-1 shrink-0">
            {STARTER_TOPICS.slice(0, 2).map((topic) => (
              <button
                key={topic.name}
                type="button"
                onClick={() => onTriggerStarterTopic(topic)}
                disabled={isGenerating}
                className="px-2 py-0.5 rounded-lg text-[11px] bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 text-slate-400 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                title={topic.desc}
              >
                {topic.name}
              </button>
            ))}
          </div>
        )}

        {/* Pipeline Status Indicator */}
        {pipelineStatus && (
          <div
            className="hidden md:flex items-center gap-1.5 text-[11px] font-mono px-2 shrink-0"
            style={{ color: theme.accent }}
          >
            <RefreshCw className="w-3 h-3 animate-spin" />
            <span className="truncate max-w-[180px]">{pipelineStatus}</span>
          </div>
        )}

        {/* Post Format Segmented Toggle */}
        <div
          role="group"
          aria-label="Post format selector"
          className="hidden sm:flex items-center bg-black/60 p-0.5 rounded-xl border border-white/10 shrink-0"
        >
          <button
            type="button"
            data-testid="format-toggle-carousel"
            onClick={() => onSwitchPostFormat('carousel')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
              activePostFormat === 'carousel'
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            style={activePostFormat === 'carousel' ? { color: theme.accent } : undefined}
            title="Multi-Slide Carousel (8 slides, 1080×1920)"
          >
            <Layers className="w-3 h-3" />
            <span>Carousel</span>
          </button>

          <button
            type="button"
            data-testid="format-toggle-single"
            onClick={() => onSwitchPostFormat('single')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
              activePostFormat === 'single'
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            style={activePostFormat === 'single' ? { color: theme.accent } : undefined}
            title="Standalone Single-Slide Post (1 slide, 1080×1920)"
          >
            <ImageIcon className="w-3 h-3" />
            <span>Single Slide</span>
          </button>

          <button
            type="button"
            data-testid="format-toggle-reel"
            onClick={() => onSwitchPostFormat('reel')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
              activePostFormat === 'reel'
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
            style={activePostFormat === 'reel' ? { color: theme.accent } : undefined}
            title="Animated 9:16 Motion Reel Video (1080×1920 + Procedural SFX)"
          >
            <Film className="w-3 h-3" />
            <span>Motion Reel</span>
          </button>
        </div>

        {/* Engine Provenance Status */}
        <button
          type="button"
          onClick={onInspectEngine}
          className={`hidden md:inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-mono font-bold transition-colors cursor-pointer shrink-0 ${engineBadge.cls}`}
          title="Active synthesis engine & verification status (click to inspect in Publish tab)"
        >
          <span>{engineBadge.label}</span>
        </button>

        {/* Expand Format & Source Ingestion Drawer Button */}
        <button
          type="button"
          onClick={() => onSetIsExpanded((prev) => !prev)}
          className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 min-h-[34px] rounded-xl border text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            isExpanded
              ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
              : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white'
          }`}
          title="Open Format & Multimodal Ingestion Drawer (Notes, YouTube Transcript, Screenshot OCR)"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="sm:hidden text-[11px] font-mono uppercase" style={{ color: theme.accent }}>
            {activePostFormat === 'single' ? '1-Slide' : activePostFormat === 'reel' ? 'Reel' : 'Deck'}
          </span>
          <span className="hidden sm:inline">Sources & Notes</span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 shrink-0" />
          )}
        </button>

        {/* Primary Generate Button */}
        <button
          type="submit"
          disabled={isGenerating}
          className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 min-h-[34px] rounded-xl font-bold text-xs uppercase tracking-wider text-slate-950 transition-all shadow-md cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          style={{ backgroundColor: theme.accent }}
        >
          {isGenerating ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden sm:inline">Generating...</span>
              <span className="sm:hidden">...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 text-slate-950 shrink-0" />
              <span className="hidden sm:inline">
                {activePostFormat === 'single'
                  ? 'Generate Slide'
                  : activePostFormat === 'reel'
                  ? 'Generate Reel'
                  : 'Generate'}
              </span>
              <span className="sm:hidden">Generate</span>
            </>
          )}
        </button>
      </form>

      {/* Floating Overlay Ingestion Drawer */}
      {isExpanded && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[2px]"
            onClick={() => onSetIsExpanded(false)}
          />
          <div className="absolute inset-x-0 top-0 z-40 bg-[#0b1118] border border-white/20 rounded-2xl p-3 sm:p-5 shadow-2xl space-y-3 sm:space-y-3.5 animate-fade-in max-h-[82dvh] overflow-y-auto">
            {/* Row 1: Single-line Header + Clear & Close */}
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-white font-jakarta tracking-wide truncate">
                  Topic & Source Ingestion
                </span>
                <span className="text-[11px] text-slate-400 hidden md:inline truncate">
                  · Paste notes, YouTube transcripts, or screenshots
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {(promptInput || uploadedImage) && (
                  <button
                    type="button"
                    onClick={onClearDock}
                    className="p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer text-xs flex items-center gap-1"
                    title="Clear input"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Clear</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onSetIsExpanded(false)}
                  className="py-1 px-2.5 rounded-lg border border-white/15 bg-white/[0.04] text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer text-xs font-semibold flex items-center gap-1"
                  title="Close drawer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            {/* Row 2: Mode Switcher Tabs + Mobile Format Pill */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="grid grid-cols-2 sm:flex items-center gap-1 bg-black/60 p-1 rounded-xl border border-white/10 w-full sm:w-auto">
                {INGEST_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        onSetActiveTab(tab.id);
                        if (tab.id === 'radar' && studioRadarTopics.length === 0 && !isStudioRadarLoading) {
                          onSetIsStudioRadarLoading(true);
                          fetchTopicRadar()
                            .then((r) => onSetStudioRadarTopics(r.topics || []))
                            .catch(() => {})
                            .finally(() => onSetIsStudioRadarLoading(false));
                        }
                      }}
                      className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-white/15 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                      style={{ color: isActive ? theme.accent : undefined }}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="sm:hidden">{tab.shortLabel}</span>
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Mobile Post Format Selector */}
              <div className="sm:hidden flex items-center justify-between w-full gap-2 pt-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  Output Format:
                </span>
                <div className="flex items-center bg-black/60 p-0.5 rounded-xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => onSwitchPostFormat('carousel')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      activePostFormat === 'carousel'
                        ? 'bg-white/15 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    style={activePostFormat === 'carousel' ? { color: theme.accent } : undefined}
                  >
                    <Layers className="w-3 h-3" />
                    <span>Carousel</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSwitchPostFormat('single')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      activePostFormat === 'single'
                        ? 'bg-white/15 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    style={activePostFormat === 'single' ? { color: theme.accent } : undefined}
                  >
                    <ImageIcon className="w-3 h-3" />
                    <span>1-Slide</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSwitchPostFormat('reel')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      activePostFormat === 'reel'
                        ? 'bg-white/15 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    style={activePostFormat === 'reel' ? { color: theme.accent } : undefined}
                  >
                    <Film className="w-3 h-3" />
                    <span>Reel</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Automated Topic Radar & Direct URL Extractor Panel */}
            {activeTab === 'radar' && (
              <div className="rounded-xl border border-cyan-500/30 bg-black/60 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Radar className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Live Engineering Topic Radar & URL Extractor</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isStudioRadarLoading}
                      onClick={() => {
                        onSetIsStudioRadarLoading(true);
                        fetchTopicRadar({ refresh: true })
                          .then((r) => onSetStudioRadarTopics(r.topics || []))
                          .catch(() => {})
                          .finally(() => onSetIsStudioRadarLoading(false));
                      }}
                      className="px-2 py-1 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/10 text-[11px] font-semibold text-slate-200 cursor-pointer flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${isStudioRadarLoading ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                    {onOpenPublishScheduleModal && (
                      <button
                        type="button"
                        onClick={() => {
                          onSetIsExpanded(false);
                          onOpenPublishScheduleModal('bulk');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-[11px] font-bold cursor-pointer"
                      >
                        Weekly Program & 10/12/18 Review →
                      </button>
                    )}
                  </div>
                </div>

                {/* Direct URL Extractor Bar */}
                <div className="flex items-center gap-2 bg-black/70 p-2 rounded-lg border border-white/15">
                  <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <input
                    type="url"
                    value={studioCustomUrl}
                    onChange={(e) => onSetStudioCustomUrl(e.target.value)}
                    placeholder="Paste any https:// engineering blog, GitHub repo, or article URL to extract..."
                    className="w-full bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none font-mono"
                  />
                  <button
                    type="button"
                    disabled={isExtractingStudioUrl || !studioCustomUrl.trim()}
                    onClick={async () => {
                      onSetIsExtractingStudioUrl(true);
                      try {
                        const res = await extractArticleFromUrl(studioCustomUrl.trim());
                        if (res.topic) {
                          onSetPromptInput(res.topic.synthesisPrompt);
                          onSetCategoryHint(res.topic.domainCategory);
                          onSetStudioCustomUrl('');
                          onShowToast(`✓ Extracted "${res.topic.title.slice(0, 38)}..." into prompt`);
                        }
                      } catch (err) {
                        onShowToast(`⚠️ ${err instanceof Error ? err.message : 'Failed to extract URL'}`);
                      } finally {
                        onSetIsExtractingStudioUrl(false);
                      }
                    }}
                    className="px-3 py-1 rounded bg-cyan-400 text-slate-950 text-[11px] font-extrabold cursor-pointer disabled:opacity-40 shrink-0"
                  >
                    {isExtractingStudioUrl ? 'Extracting...' : 'Extract URL'}
                  </button>
                </div>

                {/* Top Radar Items */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {studioRadarTopics.slice(0, 6).map((item, idx) => (
                    <div
                      key={`${item.id}_${idx}`}
                      className="p-2.5 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] flex flex-col justify-between gap-1.5"
                    >
                      <div>
                        <div className="text-[10px] font-mono text-cyan-300 tabular-nums">
                          {item.sourceName} · {item.domainCategory} · Rec: {item.recommendedFormat}
                        </div>
                        <div className="text-xs font-bold text-white line-clamp-1">
                          {item.title}
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            onSetPromptInput(item.synthesisPrompt);
                            onSetCategoryHint(item.domainCategory);
                            onShowToast(`Loaded "${item.title.slice(0, 32)}..." into prompt`);
                          }}
                          className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold text-white cursor-pointer"
                        >
                          Load into Prompt
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Starter Topics Row inside Expanded Drawer */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <span className="text-[11px] text-slate-400 font-medium shrink-0">Starter Topics:</span>
              {STARTER_TOPICS.map((topic) => (
                <button
                  key={topic.name}
                  type="button"
                  onClick={() => onTriggerStarterTopic(topic)}
                  disabled={isGenerating}
                  className="px-2.5 py-1 rounded-lg text-xs bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3 h-3 text-cyan-400" />
                  <span>{topic.name}</span>
                </button>
              ))}
            </div>

            {/* Smart Multi-Line Textarea */}
            <div className="relative">
              <textarea
                value={promptInput}
                onChange={(e) => onSetPromptInput(e.target.value)}
                rows={4}
                disabled={isGenerating}
                placeholder={
                  activeTab === 'youtube'
                    ? 'Paste YouTube video transcript or summary... e.g.:\nIn this video by Low Level, we explore whether AI can reverse engineer software using Ghidra and automated agent loops...'
                    : activeTab === 'upload'
                    ? 'Additional context or guidance for analyzing the attached screenshot (e.g. highlight the microservice topology and CPU metrics)...'
                    : 'Paste engineering blog post, GitHub README, or system notes... e.g.:\nAnthropic announced Scion, an internal system designed to address Git scaling limitations when thousands of automated AI agents run around the clock...'
                }
                className="w-full bg-black/70 border border-white/15 focus:border-cyan-400/50 rounded-xl p-3 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none transition-all shadow-inner resize-y leading-relaxed font-mono min-h-[96px]"
              />

              <div className="flex items-center justify-between px-3 py-1.5 bg-black/80 border-x border-b border-white/10 rounded-b-xl text-[11px] text-slate-400 font-mono tabular-nums -mt-1.5">
                <span>{promptInput.length.toLocaleString()} characters</span>
                {promptInput.length > 200 ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-emerald-400" />
                    Direct AI Schema Mode
                  </span>
                ) : promptInput.length > 0 ? (
                  <span className="text-cyan-400">Real-Time Grounding Mode</span>
                ) : (
                  <span>Ready for topic or notes</span>
                )}
              </div>
            </div>

            {/* Integrated Screenshot & Attachment Dropzone */}
            {(activeTab === 'upload' || uploadedImage) && (
              <div className="space-y-3">
                {uploadedImage ? (
                  <div className="p-3 rounded-xl bg-cyan-950/20 border border-cyan-500/30 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={uploadedImage.base64}
                        alt="Attached screenshot preview"
                        className="w-12 h-12 object-cover rounded-lg border border-white/20 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{uploadedImage.name}</div>
                        <div className="text-[10px] font-mono tabular-nums text-cyan-300">
                          {uploadedImage.sizeKb} KB · Mobile-optimized JPEG for fast OCR
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSetUploadedImage(null)}
                      className="p-1.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-300 hover:text-white hover:bg-red-500/20 text-xs transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/20 rounded-xl p-4 text-center hover:border-cyan-400/50 hover:bg-white/[0.02] transition-all cursor-pointer bg-black/30"
                  >
                    <div className="flex flex-col items-center justify-center space-y-1">
                      <ImageIcon className="w-5 h-5" style={{ color: theme.accent }} />
                      <div className="text-xs font-bold text-white">
                        Drop screenshot image or click to browse
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Supports PNG, JPG, WebP (or press Ctrl+V anywhere).
                      </p>
                    </div>
                  </div>
                )}

                {/* Sample Slides Selector */}
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-500 font-mono block mb-1.5">
                    Or test with attached architecture samples:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onSelectDemoImage(
                          '/assets/aistudio/slide1-2_637edc85.jpg',
                          'Anthropic Scion Hub Slide'
                        )
                      }
                      className="p-2 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-left text-xs text-slate-300 transition-colors cursor-pointer"
                    >
                      <div className="font-semibold text-white truncate text-[11px]">Slide 1: Scion Hub</div>
                      <div className="text-[10px] text-slate-400">Anthropic move beyond Git</div>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectDemoImage(
                          '/assets/aistudio/slide6-1_44b08b41.jpg',
                          'Anthropic Results Slide'
                        )
                      }
                      className="p-2 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-left text-xs text-slate-300 transition-colors cursor-pointer"
                    >
                      <div className="font-semibold text-white truncate text-[11px]">Slide 6: 3-Metrics</div>
                      <div className="text-[10px] text-slate-400">200x smaller, 25% CPU</div>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onSelectDemoImage(
                          '/assets/aistudio/slide9_a2264cfb.jpg',
                          'Anthropic CTA Slide'
                        )
                      }
                      className="p-2 rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] text-left text-xs text-slate-300 transition-colors cursor-pointer"
                    >
                      <div className="font-semibold text-white truncate text-[11px]">Slide 9: MARROK CTA</div>
                      <div className="text-[10px] text-slate-400">AI agents at scale</div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Collapsible Advanced Options (Feed Cadence & Domain Classification) */}
            <details className="group rounded-xl border border-white/10 bg-black/40 px-3 py-2">
              <summary className="flex items-center justify-between gap-2 cursor-pointer list-none text-[11px] font-mono text-slate-300 select-none">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="uppercase tracking-wider text-[#37E2C0] font-bold">
                    Options
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="truncate">
                    Next Theme:{' '}
                    <strong className="text-white">
                      {dockCadence.recommendedPalette.name.split(' ')[0]}
                    </strong>
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="truncate">
                    Domain:{' '}
                    <strong className="text-white">
                      {DOMAIN_CATEGORIES.find((d) => d.id === categoryHint)?.label || 'Auto'}
                    </strong>
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 transition-transform group-open:rotate-180 shrink-0" />
              </summary>

              <div className="pt-2.5 mt-2 border-t border-white/10 space-y-2.5">
                {/* Feed Cadence Status & Smart Next Theme Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#37E2C0] font-bold">
                      Feed Cadence
                    </span>
                    {dockCadence.lastPostedThemeId ? (
                      <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 shrink-0">
                        <span>Last:</span>
                        <span
                          className="w-2.5 h-2.5 rounded-full inline-block border border-white/20"
                          style={{
                            backgroundColor:
                              DEFAULT_PALETTES[dockCadence.lastPostedThemeId]?.accent || '#37E2C0',
                          }}
                        />
                        <span className="text-slate-200 font-semibold">
                          {DEFAULT_PALETTES[dockCadence.lastPostedThemeId]?.name.split(' ')[0]}
                        </span>
                        <span className="text-white/30 select-none">→</span>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-1.5 text-[11px] min-w-0">
                      <span className="text-slate-400 font-mono shrink-0">Next:</span>
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block border border-white/20 shrink-0"
                        style={{ backgroundColor: dockCadence.recommendedPalette.accent }}
                      />
                      <span className="text-white font-bold truncate">
                        {dockCadence.recommendedPalette.name.split(' ')[0]}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {theme.id !== dockCadence.recommendedThemeId && (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectTheme(dockCadence.recommendedPalette);
                          onShowToast(
                            `Applied ${dockCadence.recommendedPalette.name} based on post history cadence`
                          );
                        }}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer border hover:opacity-90 active:scale-95"
                        style={{
                          borderColor: dockCadence.recommendedPalette.accent + '66',
                          backgroundColor: dockCadence.recommendedPalette.accent + '20',
                          color: dockCadence.recommendedPalette.accent,
                        }}
                        title="Apply recommended palette to ensure feed contrast"
                      >
                        Apply Smart Theme
                      </button>
                    )}
                    {onOpenThemeCustomizer && (
                      <button
                        type="button"
                        onClick={onOpenThemeCustomizer}
                        className="text-[10px] font-mono text-slate-400 hover:text-white transition-colors cursor-pointer underline underline-offset-2"
                      >
                        Theme Studio
                      </button>
                    )}
                  </div>
                </div>

                {/* Domain Classification Pills */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-400 font-medium text-[11px]">Domain:</span>
                  <div className="flex flex-wrap items-center bg-black/60 p-1 rounded-xl border border-white/10 gap-1">
                    {DOMAIN_CATEGORIES.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSetCategoryHint(opt.id)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                          categoryHint === opt.id
                            ? 'bg-white/20 text-white font-bold'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </details>

            {/* Primary Drawer Footer Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onInstantSynthesize}
                disabled={isGenerating}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 font-semibold text-xs tracking-wide transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                title="Generate immediately using local MARROK engine (0ms latency)"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Instant Synthesize</span>
              </button>

              <button
                type="button"
                onClick={() => onRunAutonomousPipeline()}
                disabled={isGenerating}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 sm:px-5 py-2 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-950 transition-all shadow-md cursor-pointer disabled:opacity-75 whitespace-nowrap"
                style={{ backgroundColor: theme.accent }}
              >
                <Sparkles className="w-4 h-4 text-slate-950 shrink-0" />
                <span>Generate Carousel & Caption</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
