import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Languages,
  Layers,
  Loader2,
  Sparkles,
  ArrowRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  CoverStyle,
  GraphicalElementId,
  HookVariant,
  SlideData,
  SlideFieldUpdater,
  ThemePalette,
} from '../../types.ts';
import { CHAR_LIMITS } from '../../lib/qaChecks.ts';
import {
  COVER_STYLE_OPTIONS,
  resolveSlide1CoverStyle,
} from '../../lib/synthesizer.ts';
import {
  autoFitTextToLimits,
  autoPolishHeadline,
  enforceHeadlineSpecRule,
} from '../../lib/text/headlines.ts';
import {
  sanitizeArabicSlideText,
  splitArabicForBidiRender,
} from '../../lib/text/arabicBiDi.ts';

export interface CoverComposerPanelProps {
  currentSlide: SlideData;
  theme: ThemePalette;
  hookVariants?: HookVariant[];
  selectedElementId?: GraphicalElementId | null;
  onSelectElement?: (id: GraphicalElementId | null) => void;
  onUpdateField: SlideFieldUpdater;
  onApplyCoverStyle: (style: CoverStyle) => void;
  onApplyHookVariant?: (variant: HookVariant) => void;
  onOpenVisualTab: () => void;
  onAutoFitSlide?: () => void;
  onSyncArabic?: () => void;
  isSyncingArabic?: boolean;
}

export const CoverComposerPanel: React.FC<CoverComposerPanelProps> = ({
  currentSlide,
  theme,
  hookVariants,
  selectedElementId,
  onSelectElement,
  onUpdateField,
  onApplyCoverStyle,
  onApplyHookVariant,
  onOpenVisualTab,
  onAutoFitSlide,
  onSyncArabic,
  isSyncingArabic = false,
}) => {
  const activeCoverStyle: CoverStyle = resolveSlide1CoverStyle(currentSlide);

  const [isHooksOpen, setIsHooksOpen] = useState(
    !(currentSlide.enTitle || '').trim()
  );

  const enTitleLimit = CHAR_LIMITS.hookTitle;
  const arTitleLimit = CHAR_LIMITS.hookArTitle;
  const teaserLimit = 68;

  const enTitleLen = (currentSlide.enTitle || '').trim().length;
  const arTitleLen = (currentSlide.arTitle || '').trim().length;
  const teaserEnLen = (currentSlide.coverTeaserEn || '').trim().length;
  const teaserArLen = (currentSlide.coverTeaserAr || '').trim().length;

  const showSwipeCue = currentSlide.showSwipeCue !== false;
  const hasNumericEvidence = /\d/.test(
    `${currentSlide.metricValue || ''} ${currentSlide.enTitle || ''} ${currentSlide.coverTeaserEn || ''}`
  );

  const calloutStatement =
    (currentSlide.type === 'visual' && currentSlide.visualSpec?.quote) ||
    currentSlide.hookClaimCard?.statement ||
    currentSlide.coverTeaserEn ||
    '';

  const handleCalloutStatementChange = (value: string) => {
    if (currentSlide.type === 'visual' && currentSlide.visualSpec) {
      onUpdateField('visualSpec', {
        ...currentSlide.visualSpec,
        kind: 'callout',
        calloutStyle: currentSlide.visualSpec.calloutStyle || 'quote',
        eyebrow: currentSlide.visualSpec.eyebrow || currentSlide.hookKicker || 'COVER THESIS',
        quote: value,
      });
    } else {
      onUpdateField('hookClaimCard', {
        ...(currentSlide.hookClaimCard || {}),
        mode: currentSlide.hookClaimCard?.mode || 'quote',
        badge: currentSlide.hookClaimCard?.badge || 'THESIS',
        statement: value,
      });
    }
  };

  return (
    <div data-testid="cover-composer-panel" className="space-y-4">
      {/* 1. Cover Style Segmented Switcher */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-xs font-semibold text-white">Slide 1 Cover Hero</span>
            <span aria-hidden="true" className="text-slate-600 mx-1.5">·</span>
            <span className="text-[11px] text-slate-400">
              Headline-first composition
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenVisualTab}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Layers className="w-3 h-3" style={{ color: theme.accent }} />
            <span>Visual Tab</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {COVER_STYLE_OPTIONS.map((opt) => {
            const active = activeCoverStyle === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`cover-style-btn-${opt.id}`}
                onClick={() => onApplyCoverStyle(opt.id)}
                title={opt.shortDesc}
                className={`px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                  active
                    ? 'text-white font-semibold'
                    : 'bg-black/40 border-white/[0.08] text-slate-300 hover:text-white hover:border-white/20'
                }`}
                style={
                  active
                    ? {
                        backgroundColor: `${theme.accent}1A`,
                        borderColor: `${theme.accent}80`,
                      }
                    : undefined
                }
              >
                <span className="block text-xs font-semibold truncate">{opt.label}</span>
                <span className="block text-[10px] text-slate-400 truncate mt-0.5">
                  {opt.shortDesc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Hook Angles Switcher */}
      {hookVariants && hookVariants.length > 0 && onApplyHookVariant && (
        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-2">
          <button
            type="button"
            data-testid="cover-hook-angles-toggle"
            onClick={() => setIsHooksOpen((prev) => !prev)}
            className="w-full flex items-center justify-between text-xs text-slate-300 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" style={{ color: theme.accent }} />
              <span className="font-semibold text-white">Hook Angles</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
              {hookVariants.map((v, i) => (
                <button
                  key={i}
                  type="button"
                  data-testid={`cover-hook-variant-${i}`}
                  onClick={() => onApplyHookVariant(v)}
                  className="p-2.5 rounded-lg text-left bg-black/40 hover:bg-white/[0.06] border border-white/[0.08] hover:border-white/20 transition-colors cursor-pointer group"
                  title={v.enTitle}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span
                      className="text-[10px] font-mono font-bold uppercase truncate"
                      style={{ color: theme.accent }}
                    >
                      {v.framework || v.tag}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {typeof v.score === 'number' && (
                        <span className="text-[10px] font-mono tabular-nums text-emerald-300">
                          {v.score}/100
                        </span>
                      )}
                      {v.selected && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[9px] font-mono font-bold uppercase text-amber-300">
                          TOP
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-slate-200 group-hover:text-white line-clamp-2 leading-tight mt-1 font-semibold">
                    {v.enTitle}
                  </div>
                  {v.coverTeaserEn && (
                    <div className="text-[11px] text-slate-400 truncate mt-1">
                      {v.coverTeaserEn}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. Hook Kicker Badge + Bilingual Hook Headlines */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08]">
        <label className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-300 shrink-0 flex items-center gap-1.5">
          <span style={{ color: theme.accent }}>◆</span>
          <span>Hook Kicker</span>
        </label>
        <input
          type="text"
          data-slide-editor-field="hookKicker"
          value={currentSlide.hookKicker || ''}
          onChange={(e) => onUpdateField('hookKicker', e.target.value)}
          placeholder="SYSTEMS ARCHITECTURE"
          className="flex-1 bg-black/60 border border-white/[0.12] focus:border-white/40 rounded-lg px-2.5 py-1 text-xs font-mono text-white uppercase focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div
          className={`space-y-1.5 rounded-xl transition-colors ${
            selectedElementId === 'titleBlock'
              ? 'ring-1 ring-cyan-400/50 bg-cyan-950/10 p-2.5 -mx-2.5'
              : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <span>Cover Hook Headline (English)</span>
              {selectedElementId === 'titleBlock' && (
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
              )}
            </label>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const next = enforceHeadlineSpecRule(currentSlide.enTitle || '', {
                    isHook: true,
                    isCta: false,
                  });
                  onUpdateField('enTitle', autoPolishHeadline(next));
                }}
                className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/10 border border-white/[0.08] text-[10px] font-mono text-slate-300 hover:text-white cursor-pointer transition-colors whitespace-nowrap"
              >
                Punchier
              </button>
              {enTitleLen > enTitleLimit && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateField(
                      'enTitle',
                      autoFitTextToLimits(currentSlide.enTitle || '', enTitleLimit)
                    )
                  }
                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[10px] font-mono text-amber-200 cursor-pointer transition-colors whitespace-nowrap"
                >
                  Trim
                </button>
              )}
              <span
                className={`text-xs font-mono tabular-nums ${
                  enTitleLen > enTitleLimit ? 'text-amber-400 font-bold' : 'text-slate-400'
                }`}
              >
                {enTitleLen}/{enTitleLimit}
              </span>
            </div>
          </div>
          <input
            type="text"
            data-slide-editor-field="titleBlock"
            value={currentSlide.enTitle || ''}
            onFocus={() => onSelectElement?.('titleBlock')}
            onClick={() => onSelectElement?.('titleBlock')}
            onChange={(e) => onUpdateField('enTitle', e.target.value)}
            onBlur={onAutoFitSlide}
            placeholder="Why Your Postgres Queries Stall Under Load?"
            className="w-full bg-black/60 border border-white/[0.12] focus:border-white/40 rounded-xl px-3.5 py-2.5 text-sm text-white font-semibold focus:outline-none transition-colors"
          />
        </div>

        <div
          className={`space-y-1.5 rounded-xl transition-colors ${
            selectedElementId === 'arabicTitleBlock'
              ? 'ring-1 ring-cyan-400/50 bg-cyan-950/10 p-2.5 -mx-2.5'
              : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`text-xs font-mono tabular-nums ${
                  arTitleLen > arTitleLimit ? 'text-amber-400 font-bold' : 'text-slate-400'
                }`}
              >
                {arTitleLen}/{arTitleLimit}
              </span>
              {onSyncArabic && (
                <button
                  type="button"
                  data-testid="cover-sync-ar-btn"
                  disabled={isSyncingArabic || !(currentSlide.enTitle || '').trim()}
                  onClick={onSyncArabic}
                  title="Translate English headline and teaser into natural Arabic with AI"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-45 border border-white/[0.12] text-[10px] font-mono text-white cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  {isSyncingArabic ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" style={{ color: theme.accent }} />
                  ) : (
                    <Languages className="w-2.5 h-2.5" style={{ color: theme.accent }} />
                  )}
                  <span>{isSyncingArabic ? 'Syncing' : 'Sync AR'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  onUpdateField(
                    'arTitle',
                    sanitizeArabicSlideText(currentSlide.arTitle || '', { isTitle: true })
                  )
                }
                className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/10 border border-white/[0.08] text-[10px] font-mono text-slate-300 hover:text-white cursor-pointer transition-colors whitespace-nowrap"
              >
                Fix BiDi
              </button>
              {arTitleLen > arTitleLimit && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateField(
                      'arTitle',
                      autoFitTextToLimits(currentSlide.arTitle || '', arTitleLimit).replace(/[.?!]$/, '')
                    )
                  }
                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[10px] font-mono text-amber-200 cursor-pointer transition-colors whitespace-nowrap"
                >
                  Trim
                </button>
              )}
            </div>
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 font-cairo">
              {selectedElementId === 'arabicTitleBlock' && (
                <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
              )}
              <span>عنوان الغلاف (العربية)</span>
            </label>
          </div>
          <input
            type="text"
            dir="rtl"
            lang="ar"
            aria-label="Cover Arabic Headline"
            data-slide-editor-field="arabicTitleBlock"
            value={currentSlide.arTitle || ''}
            onFocus={() => onSelectElement?.('arabicTitleBlock')}
            onClick={() => onSelectElement?.('arabicTitleBlock')}
            onChange={(e) => onUpdateField('arTitle', e.target.value)}
            onBlur={onAutoFitSlide}
            placeholder="لماذا تتعطل الاستعلامات تحت الضغط العالي؟"
            className="w-full bg-black/60 border border-white/[0.12] focus:border-white/40 rounded-xl px-3.5 py-2.5 text-sm text-white font-semibold focus:outline-none font-cairo text-right transition-colors"
          />
          {/[A-Za-z]/.test(currentSlide.arTitle || '') && (
            <div
              dir="rtl"
              lang="ar"
              className="px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-slate-300 font-cairo text-right"
            >
              {splitArabicForBidiRender(currentSlide.arTitle || '').map((seg, idx) =>
                seg.isLtr ? (
                  <bdi key={idx} dir="ltr" className="font-mono text-cyan-300 px-0.5">
                    {seg.text}
                  </bdi>
                ) : (
                  <span key={idx}>{seg.text}</span>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. One-Line Context Teasers (English + Arabic) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2 border-t border-white/[0.06]">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-slate-200">
              One-Line Teaser (English)
            </label>
            <span
              className={`text-xs font-mono tabular-nums ${
                teaserEnLen > teaserLimit ? 'text-amber-400 font-bold' : 'text-slate-400'
              }`}
            >
              {teaserEnLen}/{teaserLimit}
            </span>
          </div>
          <input
            type="text"
            data-testid="cover-teaser-en-input"
            value={currentSlide.coverTeaserEn || ''}
            onChange={(e) => onUpdateField('coverTeaserEn', e.target.value)}
            placeholder="Three indexing shifts that eliminate tail latency"
            className="w-full bg-black/60 border border-white/[0.12] focus:border-white/40 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none transition-colors"
          />
          {teaserEnLen > teaserLimit && (
            <p className="text-[11px] text-amber-300">
              Keep under 68 chars so the teaser stays cleanly on one cover line.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`text-xs font-mono tabular-nums ${
                  teaserArLen > teaserLimit ? 'text-amber-400 font-bold' : 'text-slate-400'
                }`}
              >
                {teaserArLen}/{teaserLimit}
              </span>
              {onSyncArabic && (
                <button
                  type="button"
                  data-testid="cover-teaser-sync-ar-btn"
                  disabled={isSyncingArabic || (!(currentSlide.coverTeaserEn || '').trim() && !(currentSlide.enTitle || '').trim())}
                  onClick={onSyncArabic}
                  title="Sync Arabic teaser from English teaser"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/10 disabled:opacity-45 border border-white/[0.08] text-[10px] font-mono text-slate-300 hover:text-white cursor-pointer transition-colors whitespace-nowrap shrink-0"
                >
                  {isSyncingArabic ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" style={{ color: theme.accent }} />
                  ) : (
                    <Languages className="w-2.5 h-2.5" style={{ color: theme.accent }} />
                  )}
                  <span>Sync AR</span>
                </button>
              )}
            </div>
            <label className="text-xs font-semibold text-slate-200 font-cairo">
              جملة التمهيد (العربية)
            </label>
          </div>
          <input
            type="text"
            dir="rtl"
            lang="ar"
            aria-label="Arabic Cover Teaser"
            data-testid="cover-teaser-ar-input"
            value={currentSlide.coverTeaserAr || ''}
            onChange={(e) => onUpdateField('coverTeaserAr', e.target.value)}
            placeholder="ثلاث خطوات هندسية تقلل زمن الاستجابة"
            className="w-full bg-black/60 border border-white/[0.12] focus:border-white/40 rounded-xl px-3 py-2 text-xs text-slate-100 font-cairo text-right focus:outline-none transition-colors"
          />
          {teaserArLen > teaserLimit && (
            <p dir="rtl" lang="ar" className="text-[11px] text-amber-300 font-cairo text-right">
              اختصر الجملة إلى 68 حرفاً لتبقى في سطر واحد على الغلاف.
            </p>
          )}
        </div>
      </div>

      {/* 5. Contextual Focal Control (strictly scoped to active CoverStyle) */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-white">
            Focal Visual ·{' '}
            {COVER_STYLE_OPTIONS.find((o) => o.id === activeCoverStyle)?.label || 'Headline Hero'}
          </span>
          {activeCoverStyle === 'visual-teaser' && (
            <button
              type="button"
              data-testid="cover-open-visual-gallery-btn"
              onClick={onOpenVisualTab}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Open Visual Gallery</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {activeCoverStyle === 'metric-split' && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Verified Stat
                </span>
                <input
                  type="text"
                  data-testid="cover-metric-value-input"
                  value={currentSlide.metricValue || ''}
                  onChange={(e) => onUpdateField('metricValue', e.target.value)}
                  placeholder="93.3%"
                  className="w-full bg-black/60 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-xs text-emerald-300 font-mono font-bold focus:outline-none focus:border-white/40"
                />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Metric Label
                </span>
                <input
                  type="text"
                  data-testid="cover-metric-label-input"
                  value={currentSlide.metricLabel || ''}
                  onChange={(e) => onUpdateField('metricLabel', e.target.value)}
                  placeholder="CACHE REDUCTION"
                  className="w-full bg-black/60 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-white/40"
                />
              </div>
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Delta / Context
                </span>
                <input
                  type="text"
                  data-testid="cover-metric-diff-input"
                  value={currentSlide.metricDiff || ''}
                  onChange={(e) => onUpdateField('metricDiff', e.target.value)}
                  placeholder="BENCHMARKED"
                  className="w-full bg-black/60 border border-white/[0.12] rounded-lg px-2.5 py-1.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-white/40"
                />
              </div>
            </div>

            {!hasNumericEvidence && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200">
                <span>
                  No verified figure found yet. Add a grounded metric above or frame as a thesis card.
                </span>
                <button
                  type="button"
                  onClick={() => onApplyCoverStyle('headline-hero')}
                  className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Use Headline Hero
                </button>
              </div>
            )}
          </div>
        )}

        {activeCoverStyle === 'versus-hook' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="bg-black/40 border border-white/[0.08] rounded-lg p-2.5 space-y-1.5">
              <span className="text-[10px] font-mono uppercase text-rose-300 font-semibold block">
                Before / Legacy
              </span>
              <input
                type="text"
                value={currentSlide.compareLeftTitle || ''}
                onChange={(e) => onUpdateField('compareLeftTitle', e.target.value)}
                placeholder="Legacy Monolith"
                className="w-full bg-black/60 border border-white/[0.12] rounded px-2.5 py-1 text-xs text-white font-semibold focus:outline-none focus:border-white/40"
              />
              <input
                type="text"
                value={currentSlide.compareLeftBody || ''}
                onChange={(e) => onUpdateField('compareLeftBody', e.target.value)}
                placeholder="Shared locks & tail spikes"
                className="w-full bg-black/60 border border-white/[0.12] rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-white/40"
              />
            </div>
            <div className="bg-black/40 border border-white/[0.08] rounded-lg p-2.5 space-y-1.5">
              <span className="text-[10px] font-mono uppercase text-emerald-300 font-semibold block">
                After / Modern
              </span>
              <input
                type="text"
                value={currentSlide.compareRightTitle || ''}
                onChange={(e) => onUpdateField('compareRightTitle', e.target.value)}
                placeholder="Partitioned Ring"
                className="w-full bg-black/60 border border-white/[0.12] rounded px-2.5 py-1 text-xs text-white font-semibold focus:outline-none focus:border-white/40"
              />
              <input
                type="text"
                value={currentSlide.compareRightBody || ''}
                onChange={(e) => onUpdateField('compareRightBody', e.target.value)}
                placeholder="Lock-free predictable P99"
                className="w-full bg-black/60 border border-white/[0.12] rounded px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-white/40"
              />
            </div>
          </div>
        )}

        {activeCoverStyle === 'headline-hero' && (
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">
              Thesis Callout Statement
            </span>
            <input
              type="text"
              data-testid="cover-callout-statement-input"
              value={calloutStatement}
              onChange={(e) => handleCalloutStatementChange(e.target.value)}
              placeholder="Concise architectural claim featured beneath the cover headline"
              className="w-full bg-black/60 border border-white/[0.12] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-white/40"
            />
          </div>
        )}

        {activeCoverStyle === 'visual-teaser' && (
          <div className="text-xs text-slate-300 flex flex-wrap items-center justify-between gap-2">
            <span>
              Previewing{' '}
              <span className="font-mono text-white font-semibold">
                {currentSlide.type === 'subjectPair'
                  ? `${currentSlide.subjectPair?.beforeSystem || ''} -> ${currentSlide.subjectPair?.afterSystem || ''}`
                  : currentSlide.type === 'visual'
                  ? currentSlide.visualSpec?.kind || 'diagram'
                  : currentSlide.diagramVariant || currentSlide.type}
              </span>{' '}
              beneath the display hook.
            </span>
          </div>
        )}
      </div>

      {/* 6. Bottom Swipe Prompt Pill Controls */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center gap-2.5">
        <button
          type="button"
          data-testid="toggle-swipe-cue-btn"
          onClick={() => onUpdateField('showSwipeCue', !showSwipeCue)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            showSwipeCue
              ? 'text-white border-white/20 bg-white/[0.06]'
              : 'text-slate-400 border-white/[0.08] bg-black/40 hover:text-white'
          }`}
        >
          {showSwipeCue ? (
            <Eye className="w-3.5 h-3.5" style={{ color: theme.accent }} />
          ) : (
            <EyeOff className="w-3.5 h-3.5 text-slate-500" />
          )}
          <span>{showSwipeCue ? 'Swipe Pill On' : 'Swipe Pill Off'}</span>
        </button>

        <input
          type="text"
          data-testid="swipe-cue-text-input"
          disabled={!showSwipeCue}
          value={currentSlide.swipeCueText ?? 'Swipe to unpack'}
          onChange={(e) => onUpdateField('swipeCueText', e.target.value)}
          placeholder="Swipe to unpack"
          className="flex-1 bg-black/60 border border-white/[0.12] focus:border-white/40 disabled:opacity-40 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
        />
      </div>
    </div>
  );
};
