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
  Smartphone,
} from 'lucide-react';
import { CanvasDimensionPreset, CarouselData, ThemePalette } from '../../types.ts';
import { getCanvasDimensionSpec } from '../../lib/canvas/constants.ts';
import type { ExportBundleMode } from '../../lib/canvas/exporter.ts';
import { isThirdPartySource, getAttributionCredit, isValidCreatorCredit } from '../../lib/riskChecks.ts';
import { QAReport, runPreExportChecklist, PreExportCheckId } from '../../lib/qaChecks.ts';
import { RiskReport } from '../../lib/riskChecks.ts';

import { detectMentionedThirdPartyBrands } from '../../lib/techLogos.ts';

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
  onOpenPublishScheduleModal?: (tab?: 'single' | 'bulk' | 'storage') => void;
  onAutoFixPreExportCheck?: (checkId: PreExportCheckId, slideIndex?: number) => void;
  onToggleOfficialBrandIcon?: (brandKey: string, enabled: boolean) => void;
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
  contentQualityStatus: 'PASS' | 'WARN' | 'BLOCK';
  blockersCount: number;
  isReady: boolean;
}

export function getPublishBlockers(
  carousel: CarouselData,
  isOfflineDraft: boolean,
  isReviewed: boolean,
  qaReport: QAReport,
  riskReport?: RiskReport,
  theme?: ThemePalette
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
  const qaWarnings = qaReport.results.filter((r) => r.severity === 'warn');
  const translatedTermWarnings = qaWarnings.filter((r) =>
    r.id.startsWith('translated-tech-term-')
  );
  const contentQualityFailures = qaFailures.filter(
    (r) => r.id.startsWith('content-quality-') || r.id.startsWith('boilerplate-')
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
  const structureStatus: 'PASS' | 'WARN' | 'BLOCK' =
    qaFailures.length > 0 ? 'BLOCK' : translatedTermWarnings.length > 0 ? 'WARN' : 'PASS';
  const contentQualityStatus: 'PASS' | 'WARN' | 'BLOCK' =
    contentQualityFailures.length > 0 ? 'BLOCK' : 'PASS';

  const preExportChecks = runPreExportChecklist(carousel, theme);
  const extraPreExportBlockers = preExportChecks.filter(
    (c) =>
      !c.passed &&
      c.id !== 'contentQuality' &&
      c.id !== 'overflow' &&
      c.id !== 'minFontSize' &&
      c.id !== 'safeZones' &&
      c.id !== 'truncatedCopy' &&
      c.id !== 'missingSource' &&
      c.id !== 'unverifiedNumbers'
  ).length;

  const blockersCount =
    (sourcesStatus === 'BLOCK' ? 1 : 0) +
    (creditStatus === 'BLOCK' ? 1 : 0) +
    (riskStatus === 'BLOCK' ? 1 : 0) +
    (structureStatus === 'BLOCK' ? 1 : 0) +
    extraPreExportBlockers;

  return {
    engineType,
    creatorCredit,
    hasCreatorCredit: hasValidCredit,
    sourcesStatus,
    creditStatus,
    riskStatus,
    structureStatus,
    contentQualityStatus,
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
  onOpenPublishScheduleModal,
  onAutoFixPreExportCheck,
  onToggleOfficialBrandIcon,
  isExportingZip = false,
  onShowToast,
}) => {
  const [isSourcesExpanded, setIsSourcesExpanded] = useState(false);
  const [copiedCitations, setCopiedCitations] = useState(false);
  const [isEditingCredit, setIsEditingCredit] = useState(false);
  const [showOverrideConfirmModal, setShowOverrideConfirmModal] = useState(false);

  const isSinglePost = carousel.postFormat === 'single' || carousel.slides.length === 1;
  const activeDimensionSpec = getCanvasDimensionSpec(carousel.dimensionPreset);
  const preExportChecks = runPreExportChecklist(carousel, theme);
  const mentionedBrands = detectMentionedThirdPartyBrands(
    [
      carousel.category || '',
      carousel.caption || '',
      ...carousel.slides.map(
        (s) =>
          `${s.enTitle || ''} ${s.enBody || ''} ${s.arTitle || ''} ${s.arBody || ''} ${
            s.subjectPair
              ? `${s.subjectPair.beforeSystem || ''} ${s.subjectPair.afterSystem || ''} ${
                  s.subjectPair.storyOwner || ''
                } ${s.subjectPair.beforeLogoKey || ''} ${s.subjectPair.afterLogoKey || ''}`
              : ''
          }`
      ),
    ].join(' ')
  );

  const {
    engineType,
    creatorCredit,
    hasCreatorCredit,
    sourcesStatus,
    creditStatus,
    riskStatus,
    structureStatus,
    contentQualityStatus,
    blockersCount: unifiedBlockersCount,
  } = getPublishBlockers(carousel, isOfflineDraft, isReviewed, qaReport, riskReport, theme);

  const blockersCount = unifiedBlockersCount;
  const contentQualityCheck = preExportChecks.find((c) => c.id === 'contentQuality');
  const hubNodeReasons = carousel.slides.flatMap((s, slideIdx) =>
    (s.hubNodeReasons || []).map((reason) => ({ ...reason, slideIdx }))
  );
  const qaFailures = qaReport.results.filter(
    (r) => r.severity === 'fail' && r.id !== 'fallback-draft-blocker'
  );
  const translatedTermWarnings = qaReport.results.filter(
    (r) => r.severity === 'warn' && r.id.startsWith('translated-tech-term-')
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
                <div className="text-xs font-bold text-white">1. Sources & Numbers Verified</div>
                <div className="text-xs text-slate-400 truncate">
                  {engineType === 'grounded'
                    ? 'Verified live via Google Search grounding sources.'
                    : isReviewed
                    ? 'Draft copy and numeric claims confirmed against source.'
                    : isOfflineDraft
                    ? 'Verify every number against source before publishing.'
                    : 'Generated without live web search — verify numbers against source.'}
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
                  <span>{isReviewed ? 'Verified (Unmark)' : 'Verify against source'}</span>
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
                  <div className="text-xs font-bold text-white">2. Source Attribution ("Source: &lt;name&gt;")</div>
                  <div className="text-xs text-slate-400 truncate">
                    {hasCreatorCredit
                      ? `Source: ${creatorCredit} (Rendered above bottom 420px safe zone)`
                      : isThirdPartySource(carousel)
                      ? 'Attribution required for third-party source (brand-only name does not qualify).'
                      : 'Original MARROK publication (no third-party source).'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!hasCreatorCredit && onUpdateCreator && (
                  <button
                    type="button"
                    onClick={() => onUpdateCreator('Engineering Blog')}
                    className="px-2 py-1 rounded-md bg-white/[0.06] hover:bg-white/10 border border-white/10 text-[11px] font-mono text-slate-200 cursor-pointer transition-colors"
                    title="Auto-fill source attribution"
                  >
                    Set Source
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Edit creator credit"
                  onClick={() => setIsEditingCredit(!isEditingCredit)}
                  className="text-xs text-cyan-300 hover:text-white font-medium cursor-pointer shrink-0"
                >
                  {isEditingCredit ? 'Done' : hasCreatorCredit ? 'Edit' : 'Add Source'}
                </button>
              </div>
            </div>

            {((!hasCreatorCredit && isThirdPartySource(carousel)) || isEditingCredit) && (
              <input
                type="text"
                value={creatorCredit}
                onChange={(e) => onUpdateCreator?.(e.target.value)}
                placeholder="Enter source name (e.g. Discord Engineering, Anthropic Engineering)"
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
                <div className="text-xs font-bold text-white">3. Platform Risk & Recommendation Eligibility</div>
                <div className="text-xs text-slate-400 truncate">
                  {riskBlocks.length > 0
                    ? `${riskBlocks[0].label}: ${riskBlocks[0].message}`
                    : riskWarns.length > 0
                    ? `${riskWarns[0].label}: ${riskWarns[0].message}`
                    : 'Safe from "ineligible for recommendation" flags (no logo misuse, unverified claims, or repost frames).'}
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
          <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-black/40 border border-white/5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="pt-0.5">{renderBadge(structureStatus)}</div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white">4. Structure & Limits</div>
                  <div className="text-xs text-slate-400 truncate">
                    {qaFailures.length > 0
                      ? `${qaFailures[0].message}${qaFailures.length > 1 ? ` (+${qaFailures.length - 1} more)` : ''}`
                      : translatedTermWarnings.length > 0
                      ? `${translatedTermWarnings[0].message}${translatedTermWarnings.length > 1 ? ` (+${translatedTermWarnings.length - 1} more)` : ''}`
                      : 'Safe zones, ≥24px text, ≥22px footer, and Arabic term policy passed.'}
                  </div>
                </div>
              </div>

              {qaFailures.length > 0 ? (
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
              ) : translatedTermWarnings.length > 0 && translatedTermWarnings[0].slideIndex !== undefined && onJumpToSlide ? (
                <div className="shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => onJumpToSlide(translatedTermWarnings[0].slideIndex!)}
                    className="flex items-center gap-1 px-3 py-2 min-h-[44px] rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/35 text-amber-200 text-xs font-semibold cursor-pointer"
                  >
                    <span>Review Slide {translatedTermWarnings[0].slideIndex + 1}</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              ) : null}
            </div>

            {translatedTermWarnings.length > 0 && (
              <div
                data-testid="qa-warnings-list"
                className="pl-10 space-y-1 text-[11px] text-amber-300/90"
              >
                {translatedTermWarnings.slice(0, 3).map((w) => (
                  <div key={w.id} className="truncate">
                    • {w.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Brand Assets & IP Safety Panel (shown when third-party companies are detected) */}
        {mentionedBrands.length > 0 && (
          <div
            data-testid="brand-ip-safety-panel"
            className="pt-3 border-t border-white/10 space-y-2"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-teal-300">
                Brand Assets & IP Safety ({mentionedBrands.length} Company Detected)
              </span>
              <span className="text-[10px] text-slate-400">
                Default: styled text name · Optional: official Simple Icons SVG (≤8% width, corner label only)
              </span>
            </div>

            <div className="space-y-1.5">
              {mentionedBrands.map((brand) => {
                const rawCfg = carousel.officialBrandIcons?.[brand.name];
                const isIconEnabled = typeof rawCfg === 'object' ? Boolean(rawCfg?.enabled) : Boolean(rawCfg);
                return (
                  <div
                    key={brand.name}
                    className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="px-2 py-0.5 rounded text-xs font-bold border border-teal-500/30 bg-teal-500/10 text-teal-300"
                      >
                        {brand.title}
                      </span>
                      <span className="text-[11px] text-slate-300">
                        {isIconEnabled
                          ? 'Official unedited SVG badge enabled (≤8% width, 1 max/slide)'
                          : `Showing as styled text "${brand.title}" in accent color`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {brand.guidelinesUrl && (
                        <a
                          href={brand.guidelinesUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/10 border border-white/10 text-[10px] font-mono text-cyan-300 hover:text-white transition-colors"
                        >
                          <span>Brand guidelines</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                      {onToggleOfficialBrandIcon && (
                        <button
                          type="button"
                          data-testid={`toggle-brand-icon-${brand.name}`}
                          onClick={() => onToggleOfficialBrandIcon(brand.name, !isIconEnabled)}
                          className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                            isIconEnabled
                              ? 'bg-teal-500/20 border-teal-400/50 text-teal-200'
                              : 'bg-white/[0.05] border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          {isIconEnabled ? 'Official Icon: ON' : 'Official Brand Icon: OFF'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-slate-400 italic">
                Note: Third-party brand guidelines vary by company — please review them before publishing. Caption automatically includes "Not affiliated with {mentionedBrands.map((b) => b.title).join(', ')}."
              </p>
            </div>
          </div>
        )}

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
                      • Sources: Unreviewed offline draft requires human review (click "Verify against source")
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
        {/* Hub Node Provenance (Every Hub node quoted from source + 1-line reason) */}
        {hubNodeReasons.length > 0 && (
          <div
            data-testid="hub-node-provenance-panel"
            className="pt-3 border-t border-white/10 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-emerald-300">
                Hub Node Provenance (Source-Quoted Terms)
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {hubNodeReasons.length} nodes grounded across {new Set(hubNodeReasons.map((r) => r.slideIdx)).size} hub slide(s)
              </span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {hubNodeReasons.map((item, idx) => (
                <div
                  key={`${item.slideIdx}-${item.label}-${idx}`}
                  className="px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]"
                >
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] font-mono text-slate-500">S{item.slideIdx + 1}</span>
                    <span className="px-1.5 py-0.5 rounded bg-teal-500/15 border border-teal-500/30 font-mono font-bold text-teal-300 text-[10px]">
                      {item.label}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      "{item.quotedFrom}"
                    </span>
                  </div>
                  <span className="text-slate-300 truncate">{item.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pre-Export Quality, Data Integrity & Safe-Zone Checks with One-Tap Fixes */}
        <div
          data-testid="pre-export-checklist-grid"
          className="pt-3 border-t border-white/10 space-y-2"
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-mono uppercase tracking-wider font-bold ${
                contentQualityStatus === 'BLOCK' ? 'text-rose-400' : 'text-cyan-300'
              }`}
            >
              Pre-Export Gate ({preExportChecks.length} Automated Checks · One-Tap Fixes)
              {contentQualityStatus === 'BLOCK' && contentQualityCheck
                ? ` — Content Quality Blocked`
                : ''}
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {preExportChecks.filter((c) => c.passed).length} / {preExportChecks.length} Passed
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {preExportChecks.map((check) => (
              <div
                key={check.id}
                data-testid={`pre-export-check-${check.id}`}
                className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                  check.passed
                    ? 'bg-black/40 border-white/5'
                    : 'bg-rose-950/20 border-rose-500/35'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {check.passed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    )}
                    <span className="text-xs font-bold text-white truncate">
                      {check.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5 pl-5">
                    {check.detail}
                  </div>
                </div>

                {!check.passed && (
                  <button
                    type="button"
                    data-testid={`one-tap-fix-${check.id}`}
                    onClick={() => {
                      if (onAutoFixPreExportCheck) {
                        onAutoFixPreExportCheck(check.id, check.slideIndex);
                      } else if (check.slideIndex !== undefined && onJumpToSlide) {
                        onJumpToSlide(check.slideIndex);
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/45 text-[10px] font-mono font-bold text-cyan-200 hover:text-white shrink-0 cursor-pointer transition-colors"
                  >
                    {check.fixLabel}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Active Stage Format Summary, Presets Row (9:16 TikTok, 4:5 IG, 1:1) & Schedule Trigger */}
        <div className="pt-2.5 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 font-mono tabular-nums">
              <Smartphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-slate-300 font-semibold">JPG (Q92)</span>
              <span aria-hidden="true">·</span>
              <span>
                {activeDimensionSpec.width}×{activeDimensionSpec.height}
              </span>
            </div>

            {onSelectDimensionPreset && (
              <div
                data-testid="publish-dimension-presets-row"
                className="flex items-center gap-1 bg-black/50 p-0.5 rounded-lg border border-white/10"
              >
                {(
                  [
                    { id: 'tiktok-9:16', label: '9:16 TikTok' },
                    { id: 'ig-4:5', label: '4:5 IG' },
                    { id: 'ig-1:1', label: '1:1' },
                  ] as const
                ).map((preset) => {
                  const active = (carousel.dimensionPreset || 'tiktok-9:16') === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onSelectDimensionPreset(preset.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                        active
                          ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/40'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {onOpenPublishScheduleModal ? (
            <button
              type="button"
              onClick={() => onOpenPublishScheduleModal('single')}
              className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/10 border border-white/15 text-xs font-semibold text-white cursor-pointer transition-colors"
            >
              Schedule & Distribute →
            </button>
          ) : (
            <span className="text-[11px] text-slate-500">
              Export or schedule directly from the under-canvas delivery bar
            </span>
          )}
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
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span className="text-xs font-mono tabular-nums text-slate-300">
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
