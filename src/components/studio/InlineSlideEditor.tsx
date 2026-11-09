import React, { useState, useEffect } from 'react';
import {
  Sliders,
  CheckCircle2,
  Sparkles,
  Wand2,
  Plus,
  Trash2,
  ListChecks,
  Video,
  Loader2,
  Eye,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { SlideData, ThemePalette, GraphicalElementId, HookVariant } from '../../types.ts';
import { CHAR_LIMITS, SINGLE_SLIDE_CHAR_LIMITS } from '../../lib/qaChecks.ts';
import { seedSingleSlideTakeaways } from '../../lib/synthesis/singleSlideCondenser.ts';
import { isVideoSlide, isFullMemeSlide } from '../../lib/canvas/constants.ts';

interface InlineSlideEditorProps {
  currentSlide: SlideData;
  currentSlideIndex: number;
  theme: ThemePalette;
  isAdvancedCustomizerOpen: boolean;
  onToggleAdvancedCustomizer: () => void;
  onUpdateField: (field: keyof SlideData, value: any) => void;
  selectedElementId?: GraphicalElementId | null;
  onSelectElement?: (id: GraphicalElementId) => void;
  hookVariants?: HookVariant[];
  onApplyHookVariant?: (variant: HookVariant) => void;
  onAutoFitSlide?: () => void;
  onOpenPolishDrawer?: () => void;
  isSingleSlide?: boolean;
  onGenerateFromVideo?: () => void;
  isGeneratingFromVideo?: boolean;
}

export const InlineSlideEditor: React.FC<InlineSlideEditorProps> = ({
  currentSlide,
  currentSlideIndex,
  theme,
  onToggleAdvancedCustomizer,
  onUpdateField,
  selectedElementId,
  onSelectElement,
  hookVariants,
  onApplyHookVariant,
  onAutoFitSlide,
  onOpenPolishDrawer,
  isSingleSlide = false,
  onGenerateFromVideo,
  isGeneratingFromVideo = false,
}) => {
  const isCtaSlide = currentSlide.type === 'cta';
  const isSingle = isSingleSlide || currentSlide.type === 'poster';
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
  const isTextHiddenByFullFrame = hasCardMedia && isFullMemeSlide(currentSlide);

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
  };

  return (
    <div className="space-y-4">
      {/* Top Action Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono tabular-nums font-bold text-white">
            Slide {currentSlideIndex + 1}
          </span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="uppercase font-mono text-slate-400">
            {currentSlide.type}
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
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {onAutoFitSlide && (
            <button
              type="button"
              onClick={onAutoFitSlide}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Automatically trim copy and fix punctuation to fit character limits"
            >
              <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Auto-Fit Limits</span>
            </button>
          )}

          {onOpenPolishDrawer && (
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

      {/* Video AI Content Synthesis & Slide Text Visibility Bar */}
      {hasCardMedia && (
        <div
          data-testid="editor-video-text-bar"
          className="p-3 rounded-xl bg-cyan-950/25 border border-cyan-500/30 space-y-2.5"
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {hasVideo ? (
                <Video className="w-4 h-4 text-cyan-400 shrink-0" />
              ) : (
                <Eye className="w-4 h-4 text-cyan-400 shrink-0" />
              )}
              <div>
                <span className="text-xs font-bold text-white block">
                  {hasVideo
                    ? 'Video-Aware Slide Text & Social Caption'
                    : 'Media Card & Slide Text Layout'}
                </span>
                <span className="text-[11px] text-slate-300 block">
                  {isTextHiddenByFullFrame
                    ? 'Currently in Full Card mode (text hidden on slide). Edit any field below or switch layout to display text under the video.'
                    : 'Slide headlines & body are displayed directly below the white media card.'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
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

          {/* Layout Mode Selector right inside Text Editor */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-white/10">
            <span className="text-[11px] font-mono text-slate-300">
              Slide Text Display Mode:
            </span>
            <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded-lg border border-white/15">
              {(
                [
                  {
                    id: 'hero',
                    label: 'Video + Headline & Body',
                    tip: 'Display white video card on top + English/Arabic headlines & body below',
                  },
                  {
                    id: 'standard',
                    label: 'Video + Text + 3 Takeaways',
                    tip: 'Display compact video card + headlines, body & 3 takeaways below',
                  },
                  {
                    id: 'full',
                    label: 'Full Card Only (Hide Slide Text)',
                    tip: 'Full-height white video card with no slide text underneath',
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
                    onClick={() => onUpdateField('imageFrameMode', m.id)}
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

      {/* Slide 1 Viral Hook Presets (Prominently placed above headlines for fast testing) */}
      {currentSlideIndex === 0 && hookVariants && hookVariants.length > 0 && onApplyHookVariant && (
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

      {/* English & Arabic Titles (Side-by-Side on Desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div
          className={`space-y-1.5 rounded-xl transition-colors ${
            selectedElementId === 'titleBlock' ? 'ring-1 ring-cyan-400/50 bg-cyan-950/10 p-2.5 -mx-2.5' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              <span>{isCtaSlide ? 'Call-to-Action Question (English)' : 'English Headline'}</span>
              {selectedElementId === 'titleBlock' && (
                <span className="text-xs font-mono text-cyan-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Selected on Canvas</span>
                </span>
              )}
            </label>
            <span
              className={`text-xs font-mono tabular-nums ${
                enTitleLen > enTitleLimit ? 'text-amber-400 font-bold' : 'text-slate-400'
              }`}
            >
              {enTitleLen} / {enTitleLimit}
            </span>
          </div>
          <input
            type="text"
            data-slide-editor-field="titleBlock"
            value={currentSlide.enTitle || ''}
            onFocus={() => onSelectElement?.('titleBlock')}
            onClick={() => onSelectElement?.('titleBlock')}
            onChange={(e) => handleEditTextWithReveal('enTitle', e.target.value)}
            placeholder={isCtaSlide ? 'Scaling Vector Databases?' : 'Crisp architecture headline ending in . or ?'}
            className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-xl px-3.5 py-2.5 text-sm text-white font-medium focus:outline-none transition-colors"
          />
        </div>

        <div
          className={`space-y-1.5 rounded-xl transition-colors ${
            selectedElementId === 'arabicTitleBlock' ? 'ring-1 ring-cyan-400/50 bg-cyan-950/10 p-2.5 -mx-2.5' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-mono tabular-nums ${
                arTitleLen > limits.arTitle ? 'text-amber-400 font-bold' : 'text-slate-400'
              }`}
            >
              {arTitleLen} / {limits.arTitle}
            </span>
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
            placeholder="عنوان تقني دقيق ومختصر."
            className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-xl px-3.5 py-2.5 text-sm text-white font-medium focus:outline-none font-cairo text-right transition-colors"
          />
        </div>
      </div>

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

      {/* English & Arabic Body Copy (Side-by-Side on Desktop) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2.5 border-t border-white/[0.06]">
        <div
          className={`space-y-1.5 rounded-xl transition-colors ${
            selectedElementId === 'bodyBlock' ? 'ring-1 ring-cyan-400/50 bg-cyan-950/10 p-2.5 -mx-2.5' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
              <span>Technical Mechanism & Details (English)</span>
              {selectedElementId === 'bodyBlock' && (
                <span className="text-xs font-mono text-cyan-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Selected on Canvas</span>
                </span>
              )}
            </label>
            <span
              className={`text-xs font-mono tabular-nums ${
                enBodyLen > limits.enBody ? 'text-amber-400 font-bold' : 'text-slate-400'
              }`}
            >
              {enBodyLen} / {limits.enBody}
            </span>
          </div>
          <textarea
            rows={3}
            data-slide-editor-field="bodyBlock"
            value={currentSlide.enBody || ''}
            onFocus={() => onSelectElement?.('bodyBlock')}
            onClick={() => onSelectElement?.('bodyBlock')}
            onChange={(e) => handleEditTextWithReveal('enBody', e.target.value)}
            placeholder="1-2 sentences explaining how the mechanism works under the hood."
            className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-xl p-3.5 text-xs sm:text-sm text-slate-200 focus:outline-none resize-none leading-relaxed transition-colors"
          />
        </div>

        <div
          className={`space-y-1.5 rounded-xl transition-colors ${
            selectedElementId === 'arabicBodyBlock' ? 'ring-1 ring-cyan-400/50 bg-cyan-950/10 p-2.5 -mx-2.5' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-mono tabular-nums ${
                arBodyLen > limits.arBody ? 'text-amber-400 font-bold' : 'text-slate-400'
              }`}
            >
              {arBodyLen} / {limits.arBody}
            </span>
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
            placeholder="شرح تقني عميق في سطرين."
            className="w-full bg-black/60 border border-white/15 focus:border-white/40 rounded-xl p-3.5 text-xs sm:text-sm text-slate-200 focus:outline-none resize-none leading-relaxed font-cairo text-right transition-colors"
          />
        </div>
      </div>

      {/* Progressive Disclosure: Key Takeaways Bento List */}
      {(isSingle || currentSlide.type === 'poster' || (currentSlide.takeaways && currentSlide.takeaways.length > 0)) && (
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


