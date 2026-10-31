import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  Globe,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  FileCheck2,
  Download,
  Smartphone,
  Layers,
} from 'lucide-react';
import { CanvasDimensionPreset, CarouselData, ThemePalette } from '../../types.ts';
import { CANVAS_DIMENSION_PRESET_LIST, getCanvasDimensionSpec } from '../../lib/canvas/constants.ts';
import type { ExportBundleMode } from '../../lib/canvas/exporter.ts';
import { isThirdPartySource, getAttributionCredit, isValidCreatorCredit } from '../../lib/riskChecks.ts';
import { QAReport } from '../../lib/qaChecks.ts';
import { RiskReport } from '../../lib/riskChecks.ts';

export interface PublishChecklistProps {
  carousel: CarouselData;
  currentSlideIndex: number;
  theme: ThemePalette;
  isOfflineDraft: boolean;
  isReviewed: boolean;
  qaReport: QAReport;
  riskReport?: RiskReport;
  overrideExportBlock?: boolean;
  onToggleOverrideBlock?: (confirmedRiskReason?: string) => void;
  onToggleReviewDraft: () => void;
  onRetryWithAi: () => void;
  onUpdateCreator?: (creator: string) => void;
  onJumpToSlide?: (slideIndex: number) => void;
  onSelectDimensionPreset?: (preset: CanvasDimensionPreset) => void;
  onExportZip?: (exportMode: ExportBundleMode) => void;
  onDownloadSingleSlide?: (preset: CanvasDimensionPreset) => void;
  isExportingZip?: boolean;
  onShowToast?: (msg: string) => void;
}


export interface PublishBlockersResult {
  engineType: 'grounded' | 'offline' | 'ungrounded';
  creatorCredit: string;
  hasCreatorCredit: boolean;
  sourcesStatus: 'PASS' | 'WARN' | 'BLOCK';
  creditStatus: 'PASS' | 'WARN' | 'BLOCK';
  riskStatus: 'PASS' | 'WARN' | 'BLOCK';
  structureStatus: 'PASS' | 'WARN' | 'BLOCK';
  blockersCount: number;
  isReady: boolean;
}

export function getPublishBlockers(
  carousel: CarouselData,
  isOfflineDraft: boolean,
  isReviewed: boolean,
  qaReport: QAReport,
  riskReport?: RiskReport
): PublishBlockersResult {
  const creatorCredit = getAttributionCredit(carousel);
  const isThirdParty = isThirdPartySource(carousel);
  const hasValidCredit = isValidCreatorCredit(carousel);

  const engineType =
    carousel.sourceMeta?.engine === 'grounded' || carousel.sourceMeta?.status === 'verified_live'
      ? 'grounded'
      : carousel.sourceMeta?.isFallback ||
        carousel.sourceMeta?.engine === 'offline' ||
        carousel.sourceMeta?.engine === 'offline-synthesizer'
      ? 'offline'
      : 'ungrounded';

  const qaFailures = qaReport.results.filter(
    (r) => r.severity === 'fail' && r.id !== 'fallback-draft-blocker'
  );
  const riskBlocks = (riskReport?.items || []).filter((i) => i.status === 'BLOCK');
  const riskWarns = (riskReport?.items || []).filter((i) => i.status === 'WARN');

  const sourcesStatus: 'PASS' | 'WARN' | 'BLOCK' =
    engineType === 'grounded' || isReviewed ? 'PASS' : 'BLOCK';

  // Credit is REQUIRED for third-party sources; never show PASS for empty or brand-only
  const creditStatus: 'PASS' | 'WARN' | 'BLOCK' = hasValidCredit
    ? 'PASS'
    : isThirdParty
    ? 'BLOCK'
    : 'PASS';

  const riskStatus: 'PASS' | 'WARN' | 'BLOCK' =
    riskBlocks.length > 0 ? 'BLOCK' : riskWarns.length > 0 ? 'WARN' : 'PASS';
  const structureStatus: 'PASS' | 'WARN' | 'BLOCK' = qaFailures.length > 0 ? 'BLOCK' : 'PASS';

  const blockersCount =
    (sourcesStatus === 'BLOCK' ? 1 : 0) +
    (creditStatus === 'BLOCK' ? 1 : 0) +
    (riskStatus === 'BLOCK' ? 1 : 0) +
    (structureStatus === 'BLOCK' ? 1 : 0);

  return {
    engineType,
    creatorCredit,
    hasCreatorCredit: hasValidCredit,
    sourcesStatus,
    creditStatus,
    riskStatus,
    structureStatus,
    blockersCount,
    isReady: blockersCount === 0,
  };
}

export const PublishChecklist: React.FC<PublishChecklistProps> = ({
  carousel,
  theme,
  isOfflineDraft,
  isReviewed,
  qaReport,
  riskReport,
  overrideExportBlock = false,
  onToggleOverrideBlock,
  onToggleReviewDraft,
  onRetryWithAi,
  onUpdateCreator,
  onJumpToSlide,
  onSelectDimensionPreset,
  onExportZip,
  onDownloadSingleSlide,
  isExportingZip = false,
  onShowToast,
}) => {
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(false);
  const [copiedCitations, setCopiedCitations] = useState(false);
  const [isEditingCredit, setIsEditingCredit] = useState(false);
  const [showOverrideConfirmModal, setShowOverrideConfirmModal] = useState(false);

  const isSinglePost = carousel.postFormat === 'single' || carousel.slides.length === 1;
  const activeDimensionSpec = getCanvasDimensionSpec(carousel.dimensionPreset);
  const {
    engineType,
    creatorCredit,
    hasCreatorCredit,
    sourcesStatus,
    creditStatus,
    riskStatus,
    structureStatus,
    blockersCount,
  } = getPublishBlockers(carousel, isOfflineDraft, isReviewed, qaReport, riskReport);

  const needsHumanReview = (isOfflineDraft || engineType !== 'grounded') && !isReviewed;
  const qaFailures = qaReport.results.filter(
    (r) => r.severity === 'fail' && r.id !== 'fallback-draft-blocker'
  );
  const riskBlocks = (riskReport?.items || []).filter((i) => i.status === 'BLOCK');
  const riskWarns = (riskReport?.items || []).filter((i) => i.status === 'WARN');
  const isReady = blockersCount === 0 || overrideExportBlock;

  const handleCopyCitations = () => {
    const sources = carousel.sourceMeta?.groundingSources || [];
    const facts = carousel.facts || [];
    const text = `MARROK SOURCES & CITATIONS REPORT
Topic: ${carousel.category}
Engine: ${engineType}
${sources.length > 0 ? `\nSOURCES:\n${sources.map((s) => `• ${s.title}: ${s.url}`).join('\n')}` : ''}
${facts.length > 0 ? `\nFACTS:\n${facts.map((f, i) => `${i + 1}. [${f.verified.toUpperCase()}] ${f.text}`).join('\n')}` : ''}`;
    navigator.clipboard.writeText(text);
    setCopiedCitations(true);
    setTimeout(() => setCopiedCitations(false), 2000);
    onShowToast?.('Copied sources & citations to clipboard!');
  };

  const renderBadge = (status: 'PASS' | 'WARN' | 'BLOCK') => {
    if (status === 'PASS') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>PASS</span>
        </span>
      );
    }
    if (status === 'WARN') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span>WARN</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
        <span>BLOCK</span>
      </span>
    );
  };

  return (
    <div className="w-full space-y-4">
      {/* ONE "Ready to publish" checklist */}
      <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 space-y-4 shadow-xl">
        {/* Card Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            {isReady ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Ready to Publish Checklist
            </h3>
            <span className="text-xs text-slate-400 hidden sm:inline">
              · {isSinglePost ? '1-Slide Poster' : `${carousel.slides.length}-Slide Carousel`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-mono font-bold ${
                isReady ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              {isReady
                ? overrideExportBlock && blockersCount > 0
                  ? 'Override Active'
                  : 'All Checks Passed'
                : `${blockersCount} Action(s) Needed`}
            </span>
          </div>
        </div>

        {/* The 4 Standard Checklist Items */}
        <div className="space-y-3">
          {/* ITEM 1: Sources reviewed */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-black/40 border border-white/5">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="pt-0.5">{renderBadge(sourcesStatus)}</div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white">1. Sources Reviewed</div>
                <div className="text-xs text-slate-400 truncate">
                  {engineType === 'grounded'
                    ? 'Verified live via Google Search grounding sources.'
                    : isReviewed
                    ? 'Draft copy and technical claims confirmed by creator.'
                    : isOfflineDraft
                    ? 'Offline draft — verify claims before publishing.'
                    : 'Generated without live web search — review technical claims.'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center pl-8 sm:pl-0">
              {isOfflineDraft && !isReviewed && (
                <button
                  type="button"
                  onClick={onRetryWithAi}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold cursor-pointer transition-all flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Retry AI</span>
                </button>
              )}
              {engineType !== 'grounded' && (
                <button
                  type="button"
                  onClick={onToggleReviewDraft}
                  className={`px-3 py-2 min-h-[44px] rounded-lg border text-xs font-bold cursor-pointer transition-all flex items-center gap-1 ${
                    isReviewed
                      ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/40 text-emerald-200'
                      : 'bg-amber-500 hover:bg-amber-400 border-amber-400 text-slate-950 font-extrabold shadow-sm'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isReviewed ? 'Reviewed (Unmark)' : 'I reviewed'}</span>
                </button>
              )}
            </div>
          </div>

          {/* ITEM 2: Creator credit */}
          <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-black/40 border border-white/5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {renderBadge(creditStatus)}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white">2. Creator Credit</div>
                  <div className="text-xs text-slate-400 truncate">
                    {hasCreatorCredit
                      ? `Credited: ${creatorCredit} (${isSinglePost ? 'Footer' : 'CTA Slide'})`
                      : isThirdPartySource(carousel)
                      ? 'Attribution required for third-party source (brand-only name does not qualify).'
                      : 'Original MARROK publication (no third-party source).'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsEditingCredit(!isEditingCredit)}
                className="text-xs text-cyan-300 hover:text-white font-medium cursor-pointer shrink-0"
              >
                {isEditingCredit ? 'Done' : hasCreatorCredit ? 'Edit' : 'Add Credit'}
              </button>
            </div>

            {((!hasCreatorCredit && isThirdPartySource(carousel)) || isEditingCredit) && (
              <input
                type="text"
                value={creatorCredit}
                onChange={(e) => onUpdateCreator?.(e.target.value)}
                placeholder="Enter creator or channel handle (e.g. Anthropic Engineering, NIST)"
                className="w-full bg-black/70 border border-white/15 focus:border-cyan-400 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition-all font-mono"
                autoFocus={!hasCreatorCredit}
              />
            )}
          </div>

          {/* ITEM 3: Platform risk */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-black/40 border border-white/5">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="pt-0.5">{renderBadge(riskStatus)}</div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white">3. Platform Risk & Safety</div>
                <div className="text-xs text-slate-400 truncate">
                  {riskBlocks.length > 0
                    ? `${riskBlocks[0].label}: ${riskBlocks[0].message}`
                    : riskWarns.length > 0
                    ? `${riskWarns[0].label}: ${riskWarns[0].message}`
                    : 'Originality, audio/IP, and first-frame retention checks passed.'}
                </div>
              </div>
            </div>

            {riskBlocks.length > 0 && onToggleOverrideBlock && (
              <button
                type="button"
                onClick={() => {
                  if (overrideExportBlock) onToggleOverrideBlock?.();
                  else setShowOverrideConfirmModal(true);
                }}
                className="px-2.5 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs font-semibold cursor-pointer shrink-0"
              >
                {overrideExportBlock ? 'Override Active' : 'Override Risk'}
              </button>
            )}
          </div>

          {/* ITEM 4: Structure & limits */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-black/40 border border-white/5">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="pt-0.5">{renderBadge(structureStatus)}</div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-white">4. Structure & Limits</div>
                <div className="text-xs text-slate-400 truncate">
                  {qaFailures.length > 0
                    ? `${qaFailures[0].message}${qaFailures.length > 1 ? ` (+${qaFailures.length - 1} more)` : ''}`
                    : '1080×1920 safe zones, line heights, and character limits passed.'}
                </div>
              </div>
            </div>

            {qaFailures.length > 0 && (
              <div className="shrink-0 self-end sm:self-center">
                {qaFailures[0].slideIndex !== undefined && onJumpToSlide ? (
                  <button
                    type="button"
                    onClick={() => onJumpToSlide(qaFailures[0].slideIndex!)}
                    className="flex items-center gap-1 px-3 py-2 min-h-[44px] rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-cyan-200 text-xs font-semibold cursor-pointer"
                  >
                    <span>Fix Slide {qaFailures[0].slideIndex + 1}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                ) : onToggleOverrideBlock ? (
                  <button
                    type="button"
                    onClick={() => {
                    if (overrideExportBlock) onToggleOverrideBlock?.();
                    else setShowOverrideConfirmModal(true);
                  }}
                    className="px-2.5 py-1 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs font-semibold cursor-pointer"
                  >
                    {overrideExportBlock ? 'Override Active' : 'Override Limit'}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Override Toggle (shown only when blocked) */}
        {!isReady && onToggleOverrideBlock && (
          <div className="pt-2 border-t border-white/10 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-amber-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overrideExportBlock}
                onChange={() => {
                  if (overrideExportBlock) {
                    onToggleOverrideBlock();
                  } else {
                    setShowOverrideConfirmModal(true);
                  }
                }}
                className="rounded border-white/20 bg-black/60 text-amber-400 focus:ring-0"
              />
              <span>Export anyway (Override warnings)</span>
            </label>
            <span className="text-xs font-mono text-slate-500">Bypasses QA gates</span>
          </div>
        )}

        {/* BLOCK Confirmation Modal Naming Specific Risks */}
        {showOverrideConfirmModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
            <div className="max-w-md w-full bg-[#0d151e] border border-amber-500/40 rounded-2xl p-5 space-y-4 shadow-2xl">
              <div className="flex items-center gap-2.5 text-amber-300">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <h3 className="text-sm font-bold">Confirm Override for Blocking Risks</h3>
              </div>

              <div className="text-xs text-slate-300 space-y-2">
                <p>You are overriding the following blocking issue(s):</p>
                <ul className="space-y-1.5 pl-3 border-l-2 border-amber-500/40">
                  {sourcesStatus === 'BLOCK' && (
                    <li className="text-xs text-amber-200 font-mono">
                      • Sources: Unreviewed offline draft requires human review (click "I reviewed")
                    </li>
                  )}
                  {creditStatus === 'BLOCK' && (
                    <li className="text-xs text-amber-200 font-mono">
                      • Attribution: Third-party source requires valid creator/channel credit
                    </li>
                  )}
                  {riskBlocks.map((r, i) => (
                    <li key={i} className="text-xs text-amber-200 font-mono">
                      • ${r.label}: ${r.message}
                    </li>
                  ))}
                  {qaFailures.map((f, i) => (
                    <li key={i} className="text-xs text-amber-200 font-mono">
                      • Structure & Limits: ${f.message}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-slate-400 pt-1">
                  This override will be permanently recorded in <code>post_metadata.json</code> and the post vault archive.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowOverrideConfirmModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/10 text-xs font-semibold text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const reasons: string[] = [];
                    if (sourcesStatus === 'BLOCK') reasons.push('Unreviewed Sources');
                    if (creditStatus === 'BLOCK') reasons.push('Missing Creator Attribution');
                    riskBlocks.forEach((r) => reasons.push(`${r.label}: ${r.message}`));
                    qaFailures.forEach((f) => reasons.push(`Limit: ${f.message}`));
                    setShowOverrideConfirmModal(false);
                    onToggleOverrideBlock?.(reasons.join(' | '));
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
                >
                  Confirm Override
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Social Media Formats & Multi-Platform Export Matrix */}
      <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 space-y-3 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Social Media Export Formats
              </h3>
              <p className="text-[11px] text-slate-400">
                All 5 TikTok & Instagram safe-zone calibrated dimensions
              </p>
            </div>
          </div>

          {onExportZip && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                disabled={isExportingZip}
                onClick={() => onExportZip('dual')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/12 border border-white/15 text-[11px] font-semibold text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                title="Export TikTok 9:16 (1080×1920) + Instagram 4:5 (1080×1350) Dual Pack ZIP"
              >
                <Layers className="w-3.5 h-3.5 text-pink-400" />
                <span>Dual Pack (TikTok + IG 4:5)</span>
              </button>

              <button
                type="button"
                disabled={isExportingZip}
                onClick={() => onExportZip('all')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-[11px] font-bold text-cyan-200 transition-colors cursor-pointer disabled:opacity-50"
                title="Export all slides in all 5 social media formats (TikTok 9:16, IG 4:5, IG 3:4, IG 1:1, IG Reels 9:16) with ready-to-share captions inside one ZIP"
              >
                <Download className="w-3.5 h-3.5 text-cyan-300" />
                <span>5-in-1 Ready to Share (All 5 Formats ZIP)</span>
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CANVAS_DIMENSION_PRESET_LIST.map((preset) => {
            const isSelected = activeDimensionSpec.id === preset.id;
            const isIG = preset.platform === 'instagram';
            return (
              <div
                key={preset.id}
                className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-white/[0.08] border-cyan-400/50 shadow-sm'
                    : 'bg-black/40 border-white/5 hover:border-white/15'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectDimensionPreset?.(preset.id)}
                  className="flex flex-col text-left min-w-0 flex-1 cursor-pointer"
                  title={`Preview canvas in ${preset.label}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                        isIG
                          ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {preset.shortLabel}
                    </span>
                    <span className="text-xs font-bold text-white truncate">
                      {preset.width}×{preset.height}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] font-mono text-cyan-300">● Active</span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 truncate mt-0.5">
                    {preset.label} · {preset.aspectRatioLabel} Safe Zone
                  </span>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  {onDownloadSingleSlide && (
                    <button
                      type="button"
                      onClick={() => onDownloadSingleSlide(preset.id)}
                      className="px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/15 border border-white/10 text-[10px] font-semibold text-slate-200 transition-colors cursor-pointer"
                      title={`Download current slide JPG in ${preset.label}`}
                    >
                      JPG
                    </button>
                  )}
                  {onExportZip && (
                    <button
                      type="button"
                      disabled={isExportingZip}
                      onClick={() => onExportZip(preset.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-[10px] font-bold text-cyan-200 transition-colors cursor-pointer disabled:opacity-50"
                      title={`Export ${carousel.slides.length} slide${carousel.slides.length === 1 ? '' : 's'} in ${preset.label} ZIP`}
                    >
                      <Download className="w-3 h-3" />
                      <span>ZIP</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Collapsible Sources & Citations Section */}
      <div className="rounded-2xl border border-white/10 bg-slate-950/60 overflow-hidden shadow-lg">
        <button
          type="button"
          onClick={() => setIsSourcesExpanded(!isSourcesExpanded)}
          className="w-full flex items-center justify-between p-3.5 hover:bg-white/[0.02] transition-colors cursor-pointer text-left"
        >
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-xs font-bold text-white">Sources & Grounded Citations</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
              {carousel.sourceMeta?.groundingSources?.length || 0} Sources
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            {isSourcesExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {isSourcesExpanded && (
          <div className="p-4 pt-1 border-t border-white/5 space-y-3 animate-fade-in text-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Grounding sources and claims mapped during synthesis:
              </span>
              <button
                type="button"
                onClick={handleCopyCitations}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 font-semibold cursor-pointer"
              >
                {copiedCitations ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCitations ? 'Copied' : 'Copy Citations'}</span>
              </button>
            </div>

            {/* Source URLs */}
            {(carousel.sourceMeta?.groundingSources || []).length > 0 ? (
              <div className="space-y-1.5">
                {(carousel.sourceMeta?.groundingSources || []).map((source, i) => (
                  <a
                    key={i}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-2 rounded-lg bg-black/40 hover:bg-white/5 border border-white/5 text-slate-300 hover:text-white transition-colors group"
                  >
                    <span className="truncate pr-2">{source.title || source.url}</span>
                    <ExternalLink className="w-3 h-3 shrink-0 text-slate-500 group-hover:text-cyan-400" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                No web search sources attached. Deck generated via local synthesizer or ungrounded model.
              </p>
            )}

            {/* Extracted Facts */}
            {(carousel.facts || []).length > 0 && (
              <div className="pt-2 border-t border-white/5 space-y-1.5">
                <span className="text-xs font-bold text-slate-300 block">Verified Technical Claims:</span>
                {(carousel.facts || []).map((fact, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-lg bg-black/30 border border-white/5 text-xs text-slate-300"
                  >
                    <div className="font-semibold text-white">• {fact.text}</div>
                    {fact.evidence && (
                      <div className="text-xs text-slate-400 mt-0.5 font-mono">
                        Evidence: {fact.evidence}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Backwards compatibility export
export const ExportBar = PublishChecklist;
