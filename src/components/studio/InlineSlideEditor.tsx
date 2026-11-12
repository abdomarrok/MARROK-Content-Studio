import React, { useState, useEffect, useRef } from 'react';
import {
  Sliders,
  CheckCircle2,
  Sparkles,
  Plus,
  Trash2,
  ListChecks,
  Video,
  Image as ImageIcon,
  Upload,
  Loader2,
  Eye,
  ChevronDown,
  ChevronUp,
  Layers,
  Code,
  GitCompare,
  Gauge,
  Hash,
  Smile,
  X,
} from 'lucide-react';
import {
  CarouselData,
  SlideData,
  SlideType,
  DiagramVariant,
  ThemePalette,
  GraphicalElementId,
  HookVariant,
} from '../../types.ts';
import { CHAR_LIMITS, SINGLE_SLIDE_CHAR_LIMITS } from '../../lib/qaChecks.ts';
import { seedSingleSlideTakeaways } from '../../lib/synthesis/singleSlideCondenser.ts';
import { seedSlideArchetypeData } from '../../lib/synthesis/archetypes.ts';
import {
  autoFitSlideCopyToLimits,
  autoSyncSlideGraphicsFromCopy,
} from '../../lib/synthesis/smartVisualDefaults.ts';
import { isVideoSlide, isFullMemeSlide } from '../../lib/canvas/constants.ts';
import {
  autoPolishHeadline,
  autoFitTextToLimits,
  enforceHeadlineSpecRule,
} from '../../lib/text/headlines.ts';
import {
  sanitizeArabicSlideText,
  fixArabicPunctuation,
} from '../../lib/text/arabicBiDi.ts';

interface InlineSlideEditorProps {
  currentSlide: SlideData;
  currentSlideIndex: number;
  theme: ThemePalette;
  isAdvancedCustomizerOpen: boolean;
  onToggleAdvancedCustomizer: () => void;
  onUpdateField: (field: keyof SlideData, value: any) => void;
  onSetSlideType?: (targetType: SlideType) => void;
  onSmartMatchVisuals?: () => void;
  onDiversifyDeckVisuals?: () => void;
  selectedElementId?: GraphicalElementId | null;
  onSelectElement?: (id: GraphicalElementId) => void;
  hookVariants?: HookVariant[];
  onApplyHookVariant?: (variant: HookVariant) => void;
  onAutoFitSlide?: () => void;
  onOpenPolishDrawer?: () => void;
  isSingleSlide?: boolean;
  isMemeFormat?: boolean;
  onGenerateFromVideo?: () => void;
  isGeneratingFromVideo?: boolean;
  carouselCategory?: string;
  carouselCaption?: string;
  onUpdateCarouselField?: (field: keyof CarouselData, value: any) => void;
  onUploadMemeOrPhotoFile?: (file: File) => void;
  onUploadSlideGraphicFile?: (file: File) => void;
  onAnalyzePhotoCaption?: () => void;
  isAnalyzingPhoto?: boolean;
  photoCopySuggestion?: {
    enTitle: string;
    arTitle: string;
    enBody?: string;
    arBody?: string;
  } | null;
  onApplyPhotoCopySuggestion?: () => void;
  onDismissPhotoCopySuggestion?: () => void;
}

const INLINE_DIAGRAM_VARIANTS: Array<{ id: DiagramVariant; label: string }> = [
  { id: 'topology', label: 'Pipeline' },
  { id: 'isolation', label: 'Sandbox' },
  { id: 'clusters', label: 'Mesh' },
  { id: 'split', label: 'Split' },
  { id: 'graph', label: 'Latency' },
  { id: 'features', label: 'Pillars' },
  { id: 'stack', label: 'Layers' },
  { id: 'scatter', label: 'Matrix' },
  { id: 'takeaway', label: 'Verdict' },
];

export const InlineSlideEditor: React.FC<InlineSlideEditorProps> = ({
  currentSlide,
  currentSlideIndex,
  theme,
  onToggleAdvancedCustomizer,
  onUpdateField,
  onSetSlideType,
  selectedElementId,
  onSelectElement,
  hookVariants,
  onApplyHookVariant,
  onAutoFitSlide,
  onOpenPolishDrawer,
  isSingleSlide = false,
  isMemeFormat = false,
  onGenerateFromVideo,
  isGeneratingFromVideo = false,
  carouselCategory = '',
  carouselCaption = '',
  onUpdateCarouselField,
  onUploadMemeOrPhotoFile,
  onUploadSlideGraphicFile,
  onAnalyzePhotoCaption,
  isAnalyzingPhoto = false,
  photoCopySuggestion = null,
  onApplyPhotoCopySuggestion,
  onDismissPhotoCopySuggestion,
}) => {
  const inlineMemeFileInputRef = useRef<HTMLInputElement>(null);
  const inlineGraphicFileInputRef = useRef<HTMLInputElement>(null);
  const isCtaSlide = currentSlide.type === 'cta';
  const isSingle = isSingleSlide || isMemeFormat || currentSlide.type === 'poster';
  const limits = isSingle ? SINGLE_SLIDE_CHAR_LIMITS : CHAR_LIMITS;
  const isHook = currentSlideIndex === 0 && currentSlide.type === 'hub';
  const enTitleLimit = isHook ? limits.hookTitle : limits.enTitle;

  const enTitleLen = (currentSlide.enTitle || '').trim().length;
  const arTitleLen = (currentSlide.arTitle || '').trim().length;
  const enBodyLen = (currentSlide.enBody || '').trim().length;
  const arBodyLen = (currentSlide.arBody || '').trim().length;

  const hasVideo = isVideoSlide(currentSlide);
  const hasCardMedia =
    (currentSlide.type === 'poster' || currentSlide.type === 'image') &&
    Boolean(currentSlide.imageUrl || hasVideo);
  const isMemeMode = Boolean(isMemeFormat || currentSlide.standaloneMeme);
  const isTextHiddenByFullFrame =
    (hasCardMedia && isFullMemeSlide(currentSlide)) ||
    (isMemeMode && currentSlide.imageFrameMode !== 'hero' && currentSlide.imageFrameMode !== 'standard');
  const hideSlideCopyForMemeStudio =
    isMemeMode && !hasVideo && currentSlide.imageFrameMode !== 'hero' && currentSlide.imageFrameMode !== 'standard';

  // Progressive disclosure states for secondary sections
  const [isHooksOpen, setIsHooksOpen] = useState(currentSlideIndex === 0);
  const [isTakeawaysOpen, setIsTakeawaysOpen] = useState(
    selectedElementId === 'takeawaysBlock'
  );
  const [isAttributionOpen, setIsAttributionOpen] = useState(
    selectedElementId === 'attributionCard'
  );

  // Auto-expand collapsible section when user clicks or double-clicks that element on canvas
  useEffect(() => {
    if (selectedElementId === 'takeawaysBlock') {
      setIsTakeawaysOpen(true);
    } else if (selectedElementId === 'attributionCard') {
      setIsAttributionOpen(true);
    }
  }, [selectedElementId]);

  const handleEditTextWithReveal = (field: keyof SlideData, value: string) => {
    if (isTextHiddenByFullFrame && value.trim().length > 0) {
      onUpdateField('imageFrameMode', 'hero');
    }
    onUpdateField(field, value);

    // Automatically sync graphic nodes, compare cards, code snippets & metrics live as copy changes
    if (
      !isCtaSlide &&
      !isSingle &&
      (field === 'enTitle' || field === 'arTitle' || field === 'enBody' || field === 'arBody')
    ) {
      const nextSlide: SlideData = { ...currentSlide, [field]: value };
      const synced = autoSyncSlideGraphicsFromCopy(nextSlide, currentSlideIndex);
      const graphicKeys: Array<keyof SlideData> = [
        'diagramVariant',
        'diagramNodes',
        'diagramEdges',
        'diagramFooter',
        'compareLeftTitle',
        'compareLeftBody',
        'compareRightTitle',
        'compareRightBody',
        'codeFileName',
        'codeLanguage',
        'codeSnippet',
        'metricValue',
        'metricLabel',
        'metricDiff',
        'stepNumber',
        'stepLabel',
        'centerTag',
        'satLabels',
      ];
      for (const gKey of graphicKeys) {
        if (synced[gKey] !== undefined && synced[gKey] !== currentSlide[gKey]) {
          onUpdateField(gKey, synced[gKey]);
        }
      }
    }
  };

  const handleAutoFitOnBlur = () => {
    if (onAutoFitSlide) {
      onAutoFitSlide();
      return;
    }
    const fitted = autoFitSlideCopyToLimits(currentSlide, currentSlideIndex, isSingle);
    if (fitted.enTitle !== currentSlide.enTitle) onUpdateField('enTitle', fitted.enTitle);
    if (fitted.arTitle !== currentSlide.arTitle) onUpdateField('arTitle', fitted.arTitle);
    if (fitted.enBody !== currentSlide.enBody) onUpdateField('enBody', fitted.enBody);
    if (fitted.arBody !== currentSlide.arBody) onUpdateField('arBody', fitted.arBody);
  };

  const handleQuickSwitchArchetype = (targetType: SlideType) => {
    if (onSetSlideType) {
      onSetSlideType(targetType);
      return;
    }
    const seeded = seedSlideArchetypeData(currentSlide, targetType);
    (Object.keys(seeded) as Array<keyof SlideData>).forEach((key) => {
      if (seeded[key] !== currentSlide[key]) {
        onUpdateField(key, seeded[key]);
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Top Action Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2 text-xs">
          {isMemeMode ? (
            <>
              <Smile className="w-4 h-4 text-emerald-400" />
              <span className="font-mono font-bold text-white uppercase">
                Dedicated Meme Post Studio
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-[11px] font-mono text-emerald-300/90">
                Clean Full Card · Auto AI Caption
              </span>
            </>
          ) : (
            <>
              <span className="font-mono tabular-nums font-bold text-white">
                Slide {currentSlideIndex + 1}
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="uppercase font-mono text-slate-400">
                {currentSlide.type}
              </span>
              <span
                data-testid="inline-auto-sync-badge"
                className="text-[10px] font-mono text-emerald-300/90 flex items-center gap-1 ml-1"
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Auto-syncs graphic & fits limits</span>
              </span>
              {(enTitleLen > enTitleLimit ||
                arTitleLen > limits.arTitle ||
                enBodyLen > limits.enBody ||
                arBodyLen > limits.arBody) && (
                <>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-amber-400 font-mono text-[11px]">Over Limit</span>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Separated Upload Buttons: Meme Upload (in Meme Mode) vs Normal Slide Graphic Upload (in Carousel / Single Slide Mode) */}
          {isMemeMode && onUploadMemeOrPhotoFile && (
            <>
              <input
                ref={inlineMemeFileInputRef}
                data-testid="inline-meme-file-input"
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadMemeOrPhotoFile(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                data-testid="inline-upload-meme-btn"
                onClick={() => inlineMemeFileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-xs font-semibold text-emerald-200 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Upload or replace your Meme image (keeps card spotless and auto-generates AI social caption)"
              >
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                <span>{currentSlide.imageUrl ? 'Replace Meme Image' : 'Upload Meme Image'}</span>
              </button>
            </>
          )}

          {!isMemeMode && (onUploadSlideGraphicFile || onUploadMemeOrPhotoFile) && (
            <>
              <input
                ref={inlineGraphicFileInputRef}
                data-testid="inline-graphic-file-input"
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (onUploadSlideGraphicFile) {
                      onUploadSlideGraphicFile(file);
                    } else if (onUploadMemeOrPhotoFile) {
                      onUploadMemeOrPhotoFile(file);
                    }
                  }
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                data-testid="inline-upload-graphic-btn"
                onClick={() => inlineGraphicFileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 text-xs font-semibold text-cyan-200 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                title="Insert a normal photo into this slide's graphic slot (keeps your slide titles, body, takeaways, and carousel slides intact)"
              >
                <ImageIcon className="w-3.5 h-3.5 text-cyan-300" />
                <span>{currentSlide.imageUrl ? 'Replace Slide Graphic Photo' : 'Insert Graphic Photo'}</span>
              </button>
            </>
          )}

          {onOpenPolishDrawer && !isMemeMode && (
            <button
              type="button"
              onClick={onOpenPolishDrawer}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Open AI Polish & Slide QA Tools"
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: theme.accent }} />
              <span>AI Polish</span>
            </button>
          )}
        </div>
      </div>

      {/* Empty Meme Dropzone when user switched to 4th Meme tab and hasn't uploaded an image yet */}
      {isMemeMode && !currentSlide.imageUrl && !hasVideo && onUploadMemeOrPhotoFile && (
        <div
          data-testid="meme-empty-dropzone"
          onClick={() => inlineMemeFileInputRef.current?.click()}
          className="p-6 rounded-2xl border-2 border-dashed border-emerald-400/40 bg-emerald-950/15 hover:bg-emerald-950/25 transition-all cursor-pointer flex flex-col items-center justify-center text-center gap-2"
        >
          <Upload className="w-7 h-7 text-emerald-400" />
          <div className="text-sm font-bold text-white">
            Click or Drop Your Meme Image Here
          </div>
          <div className="text-xs text-slate-300 max-w-md">
            Creates a spotless full-height white meme card with @MARROK corner watermark and auto-writes your social media caption with AI Vision.
          </div>
        </div>
      )}

      {/* Optional AI Headline & Copy Suggestion Banner (For Normal Slide Graphic Photo Uploads) */}
      {!isMemeMode && photoCopySuggestion && (
        <div
          data-testid="ai-photo-copy-suggestion-banner"
          className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/40 space-y-2 animate-fade-in"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-200">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>AI Suggested Headlines from Uploaded Graphic Photo</span>
              <span className="text-[10px] font-mono text-slate-300 font-normal">
                (Your current slide text was kept intact)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {onApplyPhotoCopySuggestion && (
                <button
                  type="button"
                  data-testid="apply-photo-suggestion-btn"
                  onClick={onApplyPhotoCopySuggestion}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
                >
                  Apply Suggested Copy
                </button>
              )}
              {onDismissPhotoCopySuggestion && (
                <button
                  type="button"
                  data-testid="dismiss-photo-suggestion-btn"
                  onClick={onDismissPhotoCopySuggestion}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Dismiss suggestion and keep current slide text"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-black/40 p-2.5 rounded-lg border border-white/10">
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400 block">Suggested English</span>
              <span className="text-white font-semibold">{photoCopySuggestion.enTitle}</span>
            </div>
            <div dir="rtl" lang="ar" className="text-right font-cairo">
              <span className="text-[10px] font-mono uppercase text-slate-400 block font-sans">Suggested Arabic</span>
              <span className="text-white font-semibold">{photoCopySuggestion.arTitle}</span>
            </div>
          </div>
        </div>
      )}

      {/* Video / Meme / Photo AI Content Synthesis & Slide Text Visibility Bar */}
      {(hasCardMedia || isMemeMode) && (
        <div
          data-testid="editor-video-text-bar"
          className="p-3 rounded-xl bg-cyan-950/25 border border-cyan-500/30 space-y-2.5"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {hasVideo ? (
                <Video className="w-4 h-4 text-cyan-400 shrink-0" />
              ) : (
                <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <div>
                <span className="text-xs font-bold text-white block">
                  {hasVideo
                    ? 'Video-Aware Slide Text & Social Caption'
                    : 'Meme / Photo Card & AI Social Caption'}
                </span>
                <span className="text-[11px] text-slate-300 block">
                  {isTextHiddenByFullFrame
                    ? hasVideo
                      ? 'Currently in Full Card mode (text hidden on slide). Edit any field below or switch layout to display text under the video.'
                      : 'Clean Full Meme Card active (old template text & takeaways cleared). Customize your header tag and social caption below.'
                    : 'Slide headlines & body are displayed directly below the white media card.'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {!hasVideo && onAnalyzePhotoCaption && (
                <button
                  type="button"
                  data-testid="editor-generate-from-photo-btn"
                  disabled={isAnalyzingPhoto}
                  onClick={onAnalyzePhotoCaption}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  style={{ backgroundColor: theme.accent }}
                  title="Analyze the uploaded meme/photo with AI Vision and generate a matching category tag + bilingual social caption"
                >
                  {isAnalyzingPhoto ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Writing AI Caption...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Regenerate Caption from Photo</span>
                    </>
                  )}
                </button>
              )}
              {hasVideo && onGenerateFromVideo && (
                <button
                  type="button"
                  data-testid="editor-generate-from-video-btn"
                  disabled={isGeneratingFromVideo}
                  onClick={onGenerateFromVideo}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-60 whitespace-nowrap"
                  style={{ backgroundColor: theme.accent }}
                  title="Extract keyframes from the uploaded video and generate bilingual slide text + social media caption"
                >
                  {isGeneratingFromVideo ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Analyzing Video...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate Text & Caption from Video</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Inline Social Media Caption Quick Editor for Meme / Media Cards */}
          {onUpdateCarouselField && (
            <div className="pt-2 border-t border-white/10 space-y-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-slate-300 flex items-center justify-between">
                <span>Social Media Caption (Instagram / TikTok / LinkedIn)</span>
                {isAnalyzingPhoto && (
                  <span className="text-emerald-300 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>AI generating from photo...</span>
                  </span>
                )}
              </label>
              <textarea
                rows={2}
                data-testid="editor-meme-caption-input"
                value={carouselCaption}
                onChange={(e) => onUpdateCarouselField('caption', e.target.value)}
                placeholder="Social caption & hashtags auto-generated from your photo..."
                className="w-full bg-black/60 border border-white/15 focus:border-cyan-400 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 leading-relaxed focus:outline-none resize-y"
              />
            </div>
          )}

          {/* Layout Mode Selector right inside Text Editor */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-white/10">
            <span className="text-[11px] font-mono text-slate-300">
              Slide Text Display Mode:
            </span>
            <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded-lg border border-white/15">
              {(
                [
                  {
                    id: 'full',
                    label: 'Full Meme Card (No Slide Text)',
                    tip: 'Clean full-height white meme/photo card with zero template text underneath',
                  },
                  {
                    id: 'hero',
                    label: `${hasVideo ? 'Video' : 'Photo'} + Headline & Body`,
                    tip: 'Display white media card on top + English/Arabic headlines & body below',
                  },
                  {
                    id: 'standard',
                    label: `${hasVideo ? 'Video' : 'Photo'} + Text + 3 Takeaways`,
                    tip: 'Display compact media card + headlines, body & 3 takeaways below',
                  },
                ] as const
              ).map((m) => {
                const currentMode =
                  currentSlide.imageFrameMode ||
                  (isTextHiddenByFullFrame ? 'full' : 'hero');
                const active = currentMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    data-testid={`editor-frame-mode-${m.id}`}
                    onClick={() => {
                      onUpdateField('imageFrameMode', m.id);
                      if (m.id === 'full') {
                        onUpdateField('standaloneMeme', true);
                        onUpdateField('takeaways', []);
                      } else {
                        onUpdateField('standaloneMeme', false);
                      }
                    }}
                    title={m.tip}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                      active
                        ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/40'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Slide 1 Viral Hook Presets (Hidden in Full Meme Card mode) */}
      {!hideSlideCopyForMemeStudio && currentSlideIndex === 0 && hookVariants && hookVariants.length > 0 && onApplyHookVariant && (
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
          <button
            type="button"
            onClick={() => setIsHooksOpen((prev) => !prev)}
            className="w-full flex items-center justify-between text-xs text-slate-300 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" style={{ color: theme.accent }} />
              <span className="font-semibold text-white">Slide 1 Viral Hook Presets</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span className="text-[11px] font-mono text-slate-400">
                {hookVariants.length} options
              </span>
            </div>
            {isHooksOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {isHooksOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-1 animate-fade-in">
              {hookVariants.map((v, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onApplyHookVariant(v)}
                  className="p-2 rounded-lg text-left bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 transition-all cursor-pointer group"
                  title={v.enTitle}
                >
                  <div className="text-[10px] font-mono font-bold uppercase truncate" style={{ color: theme.accent }}>
                    {v.tag}
                  </div>
                  <div className="text-xs text-slate-200 group-hover:text-white line-clamp-2 leading-tight mt-0.5">
                    {v.enTitle}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* English & Arabic Titles (Hidden in Full Meme Card mode so Meme Studio stays 100% clean) */}
      {!hideSlideCopyForMemeStudio && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div
          className={`space-y-1.5 rounded-xl transition-colors ${
            selectedElementId === 'titleBlock' ? 'ring-1 ring-cyan-400/50 bg-cyan-950/10 p-2.5 -mx-2.5' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              <span>{isCtaSlide ? 'Call-to-Action Question (English)' : 'English Headline'}</span>
              {selectedElementId === 'titleBlock' && (
                <span className="text-xs font-mono text-cyan-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Selected on Canvas</span>
                </span>
              )}
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const next = enforceHeadlineSpecRule(currentSlide.enTitle || '', {
                    isHook,
                    isCta: isCtaSlide,
                  });
                  handleEditTextWithReveal('enTitle', autoPolishHeadline(next));
                }}
                className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[10px] font-mono text-slate-300 hover:text-white cursor-pointer transition-colors"
                title="Make headline punchy and format punctuation to spec"
              >
                Punchier
              </button>
              {enTitleLen > enTitleLimit && (
                <button
                  type="button"
                  onClick={() =>
                    handleEditTextWithReveal(
                      'enTitle',
                      autoFitTextToLimits(currentSlide.enTitle || '', enTitleLimit)
                    )
                  }
                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[10px] font-mono text-amber-200 cursor-pointer transition-colors"
                  title="Trim headline to fit character limit"
                >
                  Trim
                </button>
              )}
              <span
                className={`text-xs font-mono tabular-nums ${
                  enTitleLen > enTitleLimit ? 'text-amber-400 font-bold' : 'text-slate-400'
                }`}
              >
                {enTitleLen} / {enTitleLimit}
              </span>
            </div>
          </div>
          <input
            type="text"
            data-slide-editor-field="titleBlock"
            value={currentSlide.enTitle || ''}
            onFocus={() => onSelectElement?.('titleBlock')}
            onClick={() => onSelectElement?.('titleBlock')}
            onChange={(e) => handleEditTextWithReveal('enTitle', e.target.value)}
            onBlur={handleAutoFitOnBlur}
            placeholder={isCtaSlide ? 'Scaling Vector Databases?' : 'Crisp architecture headline ending in . or ?'}
            className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-xl px-3.5 py-2.5 text-sm text-white font-medium focus:outline-none transition-colors"
          />
        </div>

        <div
          className={`space-y-1.5 rounded-xl transition-colors ${
            selectedElementId === 'arabicTitleBlock' ? 'ring-1 ring-cyan-400/50 bg-cyan-950/10 p-2.5 -mx-2.5' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`text-xs font-mono tabular-nums ${
                  arTitleLen > limits.arTitle ? 'text-amber-400 font-bold' : 'text-slate-400'
                }`}
              >
                {arTitleLen} / {limits.arTitle}
              </span>
              <button
                type="button"
                onClick={() =>
                  handleEditTextWithReveal(
                    'arTitle',
                    sanitizeArabicSlideText(currentSlide.arTitle || '', { isTitle: true })
                  )
                }
                className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[10px] font-mono text-slate-300 hover:text-white cursor-pointer transition-colors"
                title="Sanitize Arabic BiDi punctuation and trailing Latin units"
              >
                Fix BiDi
              </button>
              {arTitleLen > limits.arTitle && (
                <button
                  type="button"
                  onClick={() =>
                    handleEditTextWithReveal(
                      'arTitle',
                      autoFitTextToLimits(currentSlide.arTitle || '', limits.arTitle).replace(/[.?!]$/, '')
                    )
                  }
                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[10px] font-mono text-amber-200 cursor-pointer transition-colors"
                  title="Trim Arabic headline to fit character limit"
                >
                  Trim
                </button>
              )}
            </div>
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-2 font-cairo">
              {selectedElementId === 'arabicTitleBlock' && (
                <span className="text-xs font-mono text-cyan-400 flex items-center gap-1 font-sans">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Selected</span>
                </span>
              )}
              <span>{isCtaSlide ? 'سؤال الدعوة للمشاركة (العربية)' : 'العنوان باللغة العربية'}</span>
            </label>
          </div>
          <input
            type="text"
            dir="rtl"
            lang="ar"
            aria-label="Arabic Headline"
            data-slide-editor-field="arabicTitleBlock"
            value={currentSlide.arTitle || ''}
            onFocus={() => onSelectElement?.('arabicTitleBlock')}
            onClick={() => onSelectElement?.('arabicTitleBlock')}
            onChange={(e) => handleEditTextWithReveal('arTitle', e.target.value)}
            onBlur={handleAutoFitOnBlur}
            placeholder="عنوان تقني دقيق ومختصر."
            className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-xl px-3.5 py-2.5 text-sm text-white font-medium focus:outline-none font-cairo text-right transition-colors"
          />
        </div>
      </div>
      )}

      {/* CTA Button Text field if on CTA slide */}
      {isCtaSlide && (
        <div
          className={`space-y-1.5 rounded-xl transition-colors ${
            selectedElementId === 'ctaButton' ? 'ring-1 ring-cyan-400/50 bg-cyan-950/10 p-2.5 -mx-2.5' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200">
              CTA Pill Button Text
            </label>
            {selectedElementId === 'ctaButton' && (
              <span className="text-xs font-mono text-cyan-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Selected</span>
              </span>
            )}
          </div>
          <input
            type="text"
            data-slide-editor-field="ctaButton"
            value={currentSlide.ctaText || ''}
            onFocus={() => onSelectElement?.('ctaButton')}
            onClick={() => onSelectElement?.('ctaButton')}
            onChange={(e) => onUpdateField('ctaText', e.target.value)}
            placeholder="Join discussion  •  شارك برأيك"
            className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-xl px-3.5 py-2 text-sm text-white font-medium focus:outline-none transition-colors"
          />
        </div>
      )}

      {/* English & Arabic Body Copy (Hidden in Full Meme Card mode) */}
      {!hideSlideCopyForMemeStudio && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2.5 border-t border-white/[0.06]">
        <div
          className={`space-y-1.5 rounded-xl transition-colors ${
            selectedElementId === 'bodyBlock' ? 'ring-1 ring-cyan-400/50 bg-cyan-950/10 p-2.5 -mx-2.5' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              <span>Technical Mechanism & Details (English)</span>
              {selectedElementId === 'bodyBlock' && (
                <span className="text-xs font-mono text-cyan-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Selected on Canvas</span>
                </span>
              )}
            </label>
            <div className="flex items-center gap-1.5">
              {enBodyLen > limits.enBody && (
                <button
                  type="button"
                  onClick={() =>
                    handleEditTextWithReveal(
                      'enBody',
                      autoFitTextToLimits(currentSlide.enBody || '', limits.enBody)
                    )
                  }
                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[10px] font-mono text-amber-200 cursor-pointer transition-colors"
                  title="Trim body text to fit character limit"
                >
                  Trim
                </button>
              )}
              <span
                className={`text-xs font-mono tabular-nums ${
                  enBodyLen > limits.enBody ? 'text-amber-400 font-bold' : 'text-slate-400'
                }`}
              >
                {enBodyLen} / {limits.enBody}
              </span>
            </div>
          </div>
          <textarea
            rows={3}
            data-slide-editor-field="bodyBlock"
            value={currentSlide.enBody || ''}
            onFocus={() => onSelectElement?.('bodyBlock')}
            onClick={() => onSelectElement?.('bodyBlock')}
            onChange={(e) => handleEditTextWithReveal('enBody', e.target.value)}
            onBlur={handleAutoFitOnBlur}
            placeholder="1-2 sentences explaining how the mechanism works under the hood."
            className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-xl p-3.5 text-xs sm:text-sm text-slate-200 focus:outline-none resize-none leading-relaxed transition-colors"
          />
        </div>

        <div
          className={`space-y-1.5 rounded-xl transition-colors ${
            selectedElementId === 'arabicBodyBlock' ? 'ring-1 ring-cyan-400/50 bg-cyan-950/10 p-2.5 -mx-2.5' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`text-xs font-mono tabular-nums ${
                  arBodyLen > limits.arBody ? 'text-amber-400 font-bold' : 'text-slate-400'
                }`}
              >
                {arBodyLen} / {limits.arBody}
              </span>
              <button
                type="button"
                onClick={() =>
                  handleEditTextWithReveal(
                    'arBody',
                    fixArabicPunctuation(sanitizeArabicSlideText(currentSlide.arBody || '', { isTitle: false }))
                  )
                }
                className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[10px] font-mono text-slate-300 hover:text-white cursor-pointer transition-colors"
                title="Sanitize Arabic BiDi punctuation and trailing Latin units"
              >
                Fix BiDi
              </button>
              {arBodyLen > limits.arBody && (
                <button
                  type="button"
                  onClick={() =>
                    handleEditTextWithReveal(
                      'arBody',
                      fixArabicPunctuation(autoFitTextToLimits(currentSlide.arBody || '', limits.arBody))
                    )
                  }
                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[10px] font-mono text-amber-200 cursor-pointer transition-colors"
                  title="Trim Arabic body text to fit character limit"
                >
                  Trim
                </button>
              )}
            </div>
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-2 font-cairo">
              {selectedElementId === 'arabicBodyBlock' && (
                <span className="text-xs font-mono text-cyan-400 flex items-center gap-1 font-sans">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Selected</span>
                </span>
              )}
              <span>شرح الآلية الهندسية (العربية)</span>
            </label>
          </div>
          <textarea
            rows={3}
            dir="rtl"
            lang="ar"
            aria-label="Arabic Body Text"
            data-slide-editor-field="arabicBodyBlock"
            value={currentSlide.arBody || ''}
            onFocus={() => onSelectElement?.('arabicBodyBlock')}
            onClick={() => onSelectElement?.('arabicBodyBlock')}
            onChange={(e) => handleEditTextWithReveal('arBody', e.target.value)}
            onBlur={handleAutoFitOnBlur}
            placeholder="شرح تقني عميق في سطرين."
            className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-xl p-3.5 text-xs sm:text-sm text-slate-200 focus:outline-none resize-none leading-relaxed font-cairo text-right transition-colors"
          />
        </div>
      </div>
      )}

      {/* Dynamic Graphic & Schematic Editor (Inline inside Content Tab so users can switch & edit visuals without tab-hopping) */}
      {!isCtaSlide && !isSingle && !isTextHiddenByFullFrame && (
        <div
          data-testid="inline-graphic-transformer"
          className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mr-1">
                Slide Graphic:
              </span>
              {(
                [
                  { id: 'hub', label: 'Hub', icon: Layers },
                  { id: 'row', label: 'Schematic', icon: Layers },
                  { id: 'compare', label: 'Compare A/B', icon: GitCompare },
                  { id: 'code', label: 'Code Block', icon: Code },
                  { id: 'metric', label: 'Hard Metric', icon: Gauge },
                  { id: 'number', label: 'Step #', icon: Hash },
                ] as const
              ).map((arch) => {
                const IconComp = arch.icon;
                const active = currentSlide.type === arch.id;
                return (
                  <button
                    key={arch.id}
                    type="button"
                    data-testid={`inline-arch-${arch.id}`}
                    onClick={() => handleQuickSwitchArchetype(arch.id)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer border ${
                      active
                        ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50'
                        : 'bg-black/40 text-slate-400 border-white/10 hover:text-white hover:border-white/25'
                    }`}
                  >
                    <IconComp className="w-3 h-3" />
                    <span>{arch.label}</span>
                  </button>
                );
              })}
            </div>

            <span className="text-[10px] font-mono text-emerald-300/90 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Graphics sync live from copy</span>
            </span>
          </div>

          {/* Schematic Variant Pills + Quick Node Label Editors when slide is 'row' */}
          {currentSlide.type === 'row' && (
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] font-mono text-slate-400 mr-1">
                  Diagram Layout:
                </span>
                {INLINE_DIAGRAM_VARIANTS.map((v) => {
                  const active = (currentSlide.diagramVariant || 'topology') === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      data-testid={`inline-variant-${v.id}`}
                      onClick={() => onUpdateField('diagramVariant', v.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition-all cursor-pointer border ${
                        active
                          ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400/50'
                          : 'bg-black/30 text-slate-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </div>

              {currentSlide.diagramNodes && currentSlide.diagramNodes.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {currentSlide.diagramNodes.slice(0, 3).map((node, nIdx) => (
                    <div key={nIdx} className="bg-black/40 border border-white/10 rounded-lg p-2 space-y-1">
                      <span className="text-[9px] font-mono uppercase text-slate-400 block">
                        Node {nIdx + 1} Label
                      </span>
                      <input
                        type="text"
                        value={node.label || ''}
                        onChange={(e) => {
                          const nextNodes = [...(currentSlide.diagramNodes || [])];
                          nextNodes[nIdx] = { ...nextNodes[nIdx], label: e.target.value };
                          onUpdateField('diagramNodes', nextNodes);
                        }}
                        placeholder={`Node ${nIdx + 1}`}
                        className="w-full bg-black/60 border border-white/15 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Inline Compare Left vs Right Editors when slide is 'compare' */}
          {currentSlide.type === 'compare' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-white/[0.06]">
              <div className="bg-black/40 border border-white/10 rounded-lg p-2.5 space-y-1.5">
                <span className="text-[10px] font-mono uppercase text-rose-300 font-bold block">
                  Left Card (Baseline / Legacy)
                </span>
                <input
                  type="text"
                  value={currentSlide.compareLeftTitle || ''}
                  onChange={(e) => onUpdateField('compareLeftTitle', e.target.value)}
                  placeholder="Left Comparison Title"
                  className="w-full bg-black/60 border border-white/15 rounded px-2.5 py-1 text-xs text-white font-bold focus:outline-none focus:border-cyan-400"
                />
                <input
                  type="text"
                  value={currentSlide.compareLeftBody || ''}
                  onChange={(e) => onUpdateField('compareLeftBody', e.target.value)}
                  placeholder="Left mechanism detail"
                  className="w-full bg-black/60 border border-white/15 rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="bg-black/40 border border-white/10 rounded-lg p-2.5 space-y-1.5">
                <span className="text-[10px] font-mono uppercase text-emerald-300 font-bold block">
                  Right Card (Target Architecture)
                </span>
                <input
                  type="text"
                  value={currentSlide.compareRightTitle || ''}
                  onChange={(e) => onUpdateField('compareRightTitle', e.target.value)}
                  placeholder="Right Comparison Title"
                  className="w-full bg-black/60 border border-white/15 rounded px-2.5 py-1 text-xs text-white font-bold focus:outline-none focus:border-cyan-400"
                />
                <input
                  type="text"
                  value={currentSlide.compareRightBody || ''}
                  onChange={(e) => onUpdateField('compareRightBody', e.target.value)}
                  placeholder="Right mechanism detail"
                  className="w-full bg-black/60 border border-white/15 rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          )}

          {/* Inline Code Snippet Editor when slide is 'code' */}
          {currentSlide.type === 'code' && (
            <div className="space-y-2 pt-2 border-t border-white/[0.06]">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={currentSlide.codeFileName || ''}
                  onChange={(e) => onUpdateField('codeFileName', e.target.value)}
                  placeholder="config.ts"
                  className="w-40 bg-black/60 border border-white/15 rounded px-2.5 py-1 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-400"
                />
                <input
                  type="text"
                  value={currentSlide.codeLanguage || ''}
                  onChange={(e) => onUpdateField('codeLanguage', e.target.value)}
                  placeholder="typescript"
                  className="w-28 bg-black/60 border border-white/15 rounded px-2.5 py-1 text-xs text-slate-300 font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>
              <textarea
                rows={4}
                value={currentSlide.codeSnippet || ''}
                onChange={(e) => onUpdateField('codeSnippet', e.target.value)}
                placeholder="// Concise implementation snippet (max 5 lines)"
                className="w-full bg-black/70 border border-white/15 rounded-lg p-2.5 text-xs text-emerald-200 font-mono focus:outline-none focus:border-cyan-400 resize-none"
              />
            </div>
          )}

          {/* Inline Hard Metric Editor when slide is 'metric' */}
          {currentSlide.type === 'metric' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-white/[0.06]">
              <div>
                <span className="text-[9px] font-mono uppercase text-slate-400 block mb-1">
                  Metric Value
                </span>
                <input
                  type="text"
                  value={currentSlide.metricValue || ''}
                  onChange={(e) => onUpdateField('metricValue', e.target.value)}
                  placeholder="99.99%"
                  className="w-full bg-black/60 border border-white/15 rounded px-2.5 py-1 text-xs text-emerald-300 font-mono font-bold focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <span className="text-[9px] font-mono uppercase text-slate-400 block mb-1">
                  Metric Label
                </span>
                <input
                  type="text"
                  value={currentSlide.metricLabel || ''}
                  onChange={(e) => onUpdateField('metricLabel', e.target.value)}
                  placeholder="PRODUCTION SLA"
                  className="w-full bg-black/60 border border-white/15 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <span className="text-[9px] font-mono uppercase text-slate-400 block mb-1">
                  Benchmark Delta
                </span>
                <input
                  type="text"
                  value={currentSlide.metricDiff || ''}
                  onChange={(e) => onUpdateField('metricDiff', e.target.value)}
                  placeholder="VERIFIED BENCHMARK"
                  className="w-full bg-black/60 border border-white/15 rounded px-2.5 py-1 text-xs text-slate-300 font-mono focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progressive Disclosure: Key Takeaways Bento List (Hidden in Full Meme Card mode) */}
      {!isTextHiddenByFullFrame &&
        (isSingle || currentSlide.type === 'poster' || (currentSlide.takeaways && currentSlide.takeaways.length > 0)) && (
        <div
          className={`pt-2 border-t border-white/[0.08] rounded-xl transition-colors ${
            selectedElementId === 'takeawaysBlock' ? 'ring-1 ring-cyan-400/50 bg-cyan-950/10 p-2.5 -mx-2.5' : ''
          }`}
        >
          <button
            type="button"
            onClick={() => setIsTakeawaysOpen((prev) => !prev)}
            className="w-full flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/10 text-xs text-slate-300 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <ListChecks className="w-4 h-4" style={{ color: theme.accent }} />
              <span className="font-semibold text-white">Key Engineering Takeaways</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {(currentSlide.takeaways || []).length} / 3 points
              </span>
              {selectedElementId === 'takeawaysBlock' && (
                <span className="text-xs font-mono text-cyan-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Selected</span>
                </span>
              )}
            </div>
            {isTakeawaysOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {isTakeawaysOpen && (
            <div className="space-y-2.5 pt-3 animate-fade-in">
              <div className="flex items-center justify-end gap-2">
                {(!currentSlide.takeaways || currentSlide.takeaways.length === 0) && (
                  <button
                    type="button"
                    onClick={() => onUpdateField('takeaways', seedSingleSlideTakeaways(currentSlide))}
                    className="px-2 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-xs font-mono font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    Seed 3 Points
                  </button>
                )}
                {currentSlide.takeaways && currentSlide.takeaways.length < 3 && (
                  <button
                    type="button"
                    onClick={() => {
                      const current = currentSlide.takeaways || [];
                      onUpdateField('takeaways', [
                        ...current,
                        {
                          en: 'High-throughput architectural component.',
                          ar: 'ركيزة معمارية أساسية للنظام.',
                          icon: 'checkCircle',
                        },
                      ]);
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-white/[0.05] hover:bg-white/[0.1] text-xs font-mono font-medium text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Point</span>
                  </button>
                )}
              </div>

              {(currentSlide.takeaways || []).map((t, tIdx) => {
                const enLen = (t.en || '').trim().length;
                const arLen = (t.ar || '').trim().length;
                const limitEn = SINGLE_SLIDE_CHAR_LIMITS.takeawayEn;
                const limitAr = SINGLE_SLIDE_CHAR_LIMITS.takeawayAr;

                return (
                  <div
                    key={tIdx}
                    className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2 hover:border-white/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold" style={{ color: theme.accent }}>
                        TAKEAWAY #{tIdx + 1}
                      </span>
                      {(currentSlide.takeaways?.length || 0) > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (currentSlide.takeaways || []).filter((_, i) => i !== tIdx);
                            onUpdateField('takeaways', updated);
                          }}
                          className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition-colors cursor-pointer"
                          title="Delete Takeaway"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* English Takeaway */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-400 font-mono">English Point</span>
                        <span className={`text-xs font-mono tabular-nums ${enLen > limitEn ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>
                          {enLen} / {limitEn}
                        </span>
                      </div>
                      <input
                        type="text"
                        data-slide-editor-field={tIdx === 0 ? 'takeawaysBlock' : undefined}
                        value={t.en || ''}
                        onFocus={() => onSelectElement?.('takeawaysBlock')}
                        onChange={(e) => {
                          const updated = [...(currentSlide.takeaways || [])];
                          updated[tIdx] = { ...updated[tIdx], en: e.target.value };
                          onUpdateField('takeaways', updated);
                        }}
                        placeholder="Concise technical bullet point"
                        className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                      />
                    </div>

                    {/* Arabic Takeaway */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-mono tabular-nums ${arLen > limitAr ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>
                          {arLen} / {limitAr}
                        </span>
                        <span className="text-xs text-slate-400 font-cairo">الخلاصة بالعربية</span>
                      </div>
                      <input
                        type="text"
                        dir="rtl"
                        lang="ar"
                        aria-label={`Arabic Takeaway #${tIdx + 1}`}
                        value={t.ar || ''}
                        onFocus={() => onSelectElement?.('takeawaysBlock')}
                        onChange={(e) => {
                          const updated = [...(currentSlide.takeaways || [])];
                          updated[tIdx] = { ...updated[tIdx], ar: e.target.value };
                          onUpdateField('takeaways', updated);
                        }}
                        placeholder="خلاصة تقنية مكثفة"
                        className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2.5 py-1.5 text-xs text-white font-cairo text-right focus:outline-none"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Progressive Disclosure: Standalone Single-Slide Attribution Footer */}
      {isSingle && (
        <div className="pt-2 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={() => setIsAttributionOpen((prev) => !prev)}
            className="w-full flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/10 text-xs text-slate-300 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Footer Source Attribution</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span className="text-[11px] font-mono text-slate-400 truncate max-w-[180px]">
                {currentSlide.enCredit || 'Optional author/source credit'}
              </span>
            </div>
            {isAttributionOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {isAttributionOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2.5 animate-fade-in">
              <div>
                <span className="text-xs text-slate-400 font-mono block mb-1">Source / Author (English)</span>
                <input
                  type="text"
                  value={currentSlide.enCredit || ''}
                  onChange={(e) => onUpdateField('enCredit', e.target.value)}
                  placeholder="e.g. Arxiv / Dr. Martin Kleppmann"
                  className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
                />
              </div>
              <div>
                <span className="text-xs text-slate-400 font-mono block mb-1">Source / Author (Arabic)</span>
                <input
                  type="text"
                  dir="rtl"
                  lang="ar"
                  aria-label="Source Author in Arabic"
                  value={currentSlide.arCredit || ''}
                  onChange={(e) => onUpdateField('arCredit', e.target.value)}
                  placeholder="المصدر أو المؤلف بالعربية"
                  className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-lg px-2.5 py-1.5 text-xs text-white font-cairo text-right focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};


