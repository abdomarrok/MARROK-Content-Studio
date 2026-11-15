import React from 'react';
import {
  Radar,
  RefreshCw,
  Check,
  Edit3,
  ExternalLink,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  Globe,
  CheckCircle2,
  X,
  Rss,
  AlertTriangle,
  ShieldAlert,
  Info,
} from 'lucide-react';
import {
  CarouselData,
  DEFAULT_PALETTES,
  PostFormat,
} from '../../../types.ts';
import {
  clearDismissedGatherTopicIds,
  GatheredCandidatePost,
  saveCustomRssFeeds,
} from '../../../lib/gather/gatherClient.ts';
import {
  CandidateSlidePreviewInspector,
  CandidateSlideStoryboardStrip,
} from './CandidateSlidePreviewInspector.tsx';

const SOURCE_FILTERS = [
  { id: 'all', label: 'All Sources' },
  { id: 'github', label: 'GitHub Trending' },
  { id: 'reddit', label: 'Reddit Tech' },
  { id: 'hn', label: 'Hacker News' },
  { id: 'lobsters', label: 'Lobsters' },
  { id: 'blogs', label: 'Engineering & AI RSS' },
] as const;

const DOMAIN_FILTERS = [
  { id: 'all', label: 'All Domains' },
  { id: 'REVERSE ENGINEERING', label: 'Reversing & CVEs' },
  { id: 'AI AGENTS & MODELS', label: 'AI & Models' },
  { id: 'LINUX KERNEL', label: 'Kernel & eBPF' },
  { id: 'KUBERNETES & CLOUD', label: 'Cloud & K8s' },
  { id: 'DISTRIBUTED SYSTEMS', label: 'Distributed Systems' },
] as const;

export interface TopicRadarGatherViewProps {
  candidates: GatheredCandidatePost[];
  isScanningTrends: boolean;
  scanProgressLabel: string | null;
  sourceFilter: string;
  onSetSourceFilter: (src: string) => void;
  domainFilter: string;
  onSetDomainFilter: (dom: string) => void;
  formatFilter: 'auto' | PostFormat;
  onSetFormatFilter: (fmt: 'auto' | PostFormat) => void;
  customRssFeeds: string[];
  onSetCustomRssFeeds: (feeds: string[]) => void;
  urlOrRssInput: string;
  onSetUrlOrRssInput: (val: string) => void;
  isExtractingInput: boolean;
  onAddUrlOrRss: () => void;
  showRssManager: boolean;
  onSetShowRssManager: React.Dispatch<React.SetStateAction<boolean>>;
  selectedCandidateIds: string[];
  onSetSelectedCandidateIds: React.Dispatch<React.SetStateAction<string[]>>;
  isAcceptingBatch: boolean;
  acceptingSingleId: string | null;
  onQueueSelectedToDrafts: () => void;
  onMoveSingleToDraft: (candidate: GatheredCandidatePost) => void;
  onDismissCandidate: (candidateId: string) => void;
  onRunBackgroundGatherer: (refresh?: boolean) => void;
  expandedCandidateId: string | null;
  onOpenAndHydrateCandidate: (
    candidate: GatheredCandidatePost,
    slideIndex?: number
  ) => Promise<GatheredCandidatePost | void> | void;
  onCollapseCandidate: () => void;
  activeOutlineSlideIdx: number;
  onSetActiveOutlineSlideIdx: (idx: number) => void;
  onUpdateCandidateDeck: (
    candidateId: string,
    updater: (prev: GatheredCandidatePost) => GatheredCandidatePost
  ) => void;
  onUpdateCandidateAngle: (candidateId: string, angle: string) => void;
  hydratingCandidateId?: string | null;
  regeneratingSlideKey?: string | null;
  onRegenerateSingleSlide?: (
    candidate: GatheredCandidatePost,
    slideIndex: number
  ) => void;
  onLoadCandidateIntoStudio?: (deck: CarouselData, title: string) => void;
  onShowToast: (msg: string) => void;
}

export const TopicRadarGatherView: React.FC<TopicRadarGatherViewProps> = ({
  candidates,
  isScanningTrends,
  scanProgressLabel,
  sourceFilter,
  onSetSourceFilter,
  domainFilter,
  onSetDomainFilter,
  formatFilter,
  onSetFormatFilter,
  customRssFeeds,
  onSetCustomRssFeeds,
  urlOrRssInput,
  onSetUrlOrRssInput,
  isExtractingInput,
  onAddUrlOrRss,
  showRssManager,
  onSetShowRssManager,
  selectedCandidateIds,
  onSetSelectedCandidateIds,
  isAcceptingBatch,
  acceptingSingleId,
  onQueueSelectedToDrafts,
  onMoveSingleToDraft,
  onDismissCandidate,
  onRunBackgroundGatherer,
  expandedCandidateId,
  onOpenAndHydrateCandidate,
  onCollapseCandidate,
  activeOutlineSlideIdx,
  onSetActiveOutlineSlideIdx,
  onUpdateCandidateDeck,
  onUpdateCandidateAngle,
  hydratingCandidateId,
  regeneratingSlideKey,
  onRegenerateSingleSlide,
  onLoadCandidateIntoStudio,
  onShowToast,
}) => {
  const selectableCandidates = candidates.filter(
    (c) => !c.alreadyCovered && (c.qualityGate?.passed ?? true)
  );

  return (
    <div className="space-y-3" data-testid="inbox-gather-view">
      {/* Top Inbox Toolbar */}
      <div className="rounded-xl border border-white/10 bg-[#0b1218]/95 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-cyan-400 shrink-0" />
              <h3 className="text-sm font-extrabold text-white">
                Content Inbox — Ranked Tech & Startup Trends
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Slide 1 hooks load lazily so browsing stays instant. Sharpen the Marrok product angle, inspect the full 8-slide storyboard on demand, and queue approved candidates to Draft for mandatory human & numeric verification.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSetShowRssManager((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-bold text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <Rss className="w-3.5 h-3.5 text-amber-400" />
              <span>Connected Feeds ({4 + customRssFeeds.length})</span>
            </button>
            <button
              type="button"
              disabled={isScanningTrends}
              onClick={() => {
                clearDismissedGatherTopicIds();
                onRunBackgroundGatherer(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-400/35 bg-cyan-500/15 hover:bg-cyan-500/25 text-xs font-bold text-cyan-200 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isScanningTrends ? 'animate-spin' : ''}`}
              />
              <span>{isScanningTrends ? 'Scanning...' : 'Scan Trends'}</span>
            </button>
          </div>
        </div>

        {showRssManager && (
          <div className="p-3 rounded-xl border border-white/10 bg-black/40 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-200">
                Active Technical & RSS Sources
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Matched Vault posts stay visible with Already Covered tag
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-300">
              <span>Reddit r/programming · r/LocalLLaMA · r/devops</span>
              <span aria-hidden="true">·</span>
              <span>Hacker News Top Tech</span>
              <span aria-hidden="true">·</span>
              <span>Lobste.rs Hottest</span>
              <span aria-hidden="true">·</span>
              <span>Engineering Blogs & GitHub</span>
            </div>
            {customRssFeeds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-white/10">
                {customRssFeeds.map((feedUrl) => (
                  <div
                    key={feedUrl}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.05] border border-white/10 text-[11px] font-mono text-cyan-200"
                  >
                    <span className="truncate max-w-[240px]">{feedUrl}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = customRssFeeds.filter((u) => u !== feedUrl);
                        onSetCustomRssFeeds(next);
                        saveCustomRssFeeds(next);
                        onShowToast('Removed custom RSS feed');
                      }}
                      className="text-slate-400 hover:text-rose-400 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Direct Article URL / Custom RSS Input */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 rounded-lg border border-white/10 bg-black/40">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Globe className="w-4 h-4 text-cyan-400 shrink-0 ml-1" />
            <input
              type="url"
              value={urlOrRssInput}
              onChange={(e) => onSetUrlOrRssInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAddUrlOrRss();
                }
              }}
              placeholder="Paste any engineering article URL or RSS feed URL (https://.../rss)..."
              className="w-full bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            disabled={isExtractingInput || !urlOrRssInput.trim()}
            onClick={onAddUrlOrRss}
            className="px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs cursor-pointer disabled:opacity-50 shrink-0 whitespace-nowrap"
          >
            {isExtractingInput ? 'Extracting...' : 'Add Article / RSS'}
          </button>
        </div>

        {/* Source & Domain Filter Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
          <div className="flex flex-wrap items-center gap-1">
            {SOURCE_FILTERS.map((src) => (
              <button
                key={src.id}
                type="button"
                onClick={() => onSetSourceFilter(src.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  sourceFilter === src.id
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-white bg-black/30 border border-white/5'
                }`}
              >
                {src.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {DOMAIN_FILTERS.map((dom) => (
              <button
                key={dom.id}
                type="button"
                onClick={() => onSetDomainFilter(dom.id)}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  domainFilter === dom.id
                    ? 'bg-white/15 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {dom.label}
              </button>
            ))}
          </div>
        </div>

        {/* Batch Draft Queue Bar (Queue to Draft Only — Never Bypasses Review) */}
        <div className="p-2.5 rounded-lg border border-white/10 bg-black/35 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-0.5">
                Outline Format
              </label>
              <select
                value={formatFilter}
                onChange={(e) => onSetFormatFilter(e.target.value as 'auto' | PostFormat)}
                className="px-2.5 py-1.5 rounded-md bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
              >
                <option value="auto">Auto (Carousel / Single)</option>
                <option value="carousel">8-Slide Carousels</option>
                <option value="single">1-Slide Infographics</option>
              </select>
            </div>
            <div className="text-[11px] text-slate-400">
              Bulk queue saves ready cards as unscheduled Drafts so every claim & number is reviewed before scheduling.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onSetSelectedCandidateIds((prev) =>
                  prev.length === selectableCandidates.length && selectableCandidates.length > 0
                    ? []
                    : selectableCandidates.map((c) => c.id)
                )
              }
              className="px-2.5 py-1.5 rounded-md border border-white/15 bg-black/40 hover:bg-white/10 text-xs font-semibold text-slate-200 cursor-pointer whitespace-nowrap"
            >
              {selectedCandidateIds.length === selectableCandidates.length &&
              selectableCandidates.length > 0
                ? 'Deselect All'
                : `Select Ready (${selectableCandidates.length})`}
            </button>

            <button
              type="button"
              data-testid="bulk-queue-drafts-btn"
              disabled={isAcceptingBatch || selectedCandidateIds.length === 0}
              onClick={onQueueSelectedToDrafts}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs cursor-pointer disabled:opacity-45 whitespace-nowrap"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {isAcceptingBatch
                  ? 'Queueing Drafts...'
                  : `Queue ${selectedCandidateIds.length} to Draft`}
              </span>
            </button>
          </div>
        </div>

        {scanProgressLabel && (
          <div className="px-3 py-1.5 rounded-md bg-cyan-500/10 border border-cyan-400/25 text-xs font-mono text-cyan-200 flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span className="truncate">{scanProgressLabel}</span>
          </div>
        )}
      </div>

      {/* Candidate List */}
      {candidates.length === 0 && !isScanningTrends ? (
        <div className="rounded-xl border border-white/10 bg-[#0b1218]/90 p-8 text-center space-y-3">
          <Radar className="w-8 h-8 text-cyan-400 mx-auto opacity-80" />
          <div className="text-sm font-bold text-white">
            Inbox is clear — no pending candidates
          </div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Click &ldquo;Scan Trends&rdquo; to refresh Reddit, Hacker News, Lobsters, GitHub, and engineering RSS feeds, or paste an article URL above.
          </p>
          <button
            type="button"
            onClick={() => {
              clearDismissedGatherTopicIds();
              onRunBackgroundGatherer(true);
            }}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs cursor-pointer"
          >
            Scan Fresh Tech Trends
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map((candidate, cIdx) => {
            const isSelected = selectedCandidateIds.includes(candidate.id);
            const isExpanded = expandedCandidateId === candidate.id;
            const palette =
              DEFAULT_PALETTES[candidate.themeId] || DEFAULT_PALETTES.teal;
            const slides = candidate.deck.slides || [];
            const activeSlide =
              slides[Math.min(activeOutlineSlideIdx, Math.max(0, slides.length - 1))];
            const gatePassed = candidate.qualityGate?.passed ?? true;
            const isBlocked = Boolean(candidate.alreadyCovered) || !gatePassed;
            const breakdown = candidate.scoreBreakdown;
            const isHydrating = hydratingCandidateId === candidate.id;

            return (
              <div
                key={`${candidate.id}_${cIdx}`}
                data-testid={`inbox-candidate-card-${candidate.id}`}
                className={`rounded-xl border transition-colors p-4 space-y-3 ${
                  candidate.alreadyCovered
                    ? 'border-white/10 bg-[#080d12]/80 opacity-85'
                    : isSelected
                    ? 'border-cyan-400/45 bg-[#0d1720]/95'
                    : 'border-white/10 bg-[#0b1218]/90 hover:border-white/20'
                }`}
              >
                {/* Header Row: Select + Clean Editorial Metadata Line (No Pill Sandwiches) + Draft CTA */}
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      disabled={isBlocked}
                      onClick={() =>
                        onSetSelectedCandidateIds((prev) =>
                          prev.includes(candidate.id)
                            ? prev.filter((id) => id !== candidate.id)
                            : [...prev, candidate.id]
                        )
                      }
                      className={`mt-1 w-5 h-5 rounded flex items-center justify-center border cursor-pointer shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${
                        isSelected && !isBlocked
                          ? 'bg-cyan-400 border-cyan-400 text-slate-950 font-bold'
                          : 'border-white/25 bg-black/40 text-transparent hover:border-white/50'
                      }`}
                      title={
                        isBlocked
                          ? 'Fix blockers or Already Covered status to select'
                          : 'Select for batch queue to Draft'
                      }
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>

                    <div className="space-y-1.5 min-w-0 flex-1">
                      {/* Single-Line Editorial Metadata Row with 4-Factor Breakdown Tooltip */}
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono tabular-nums text-slate-400">
                        {/* Composite Score + 4-Factor Hover/Focus Breakdown Tooltip */}
                        <div className="relative group inline-flex items-center">
                          <button
                            type="button"
                            data-testid={`score-breakdown-trigger-${candidate.id}`}
                            className="inline-flex items-center gap-1 font-extrabold text-amber-300 hover:text-amber-200 cursor-help focus:outline-none"
                            aria-label={`Composite score ${candidate.compositeScore} out of 100. Hover for 4-factor breakdown.`}
                          >
                            <span>SCORE {candidate.compositeScore}</span>
                            <Info className="w-3 h-3 opacity-80" />
                          </button>

                          <div
                            role="tooltip"
                            data-testid={`score-breakdown-tooltip-${candidate.id}`}
                            className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity absolute left-0 top-full mt-1.5 z-30 w-72 p-3 rounded-lg border border-white/15 bg-[#05080b] shadow-2xl text-[11px] text-slate-200 space-y-1.5"
                          >
                            <div className="font-bold text-white border-b border-white/10 pb-1 flex items-center justify-between">
                              <span>4-Factor Candidate Score</span>
                              <span className="text-amber-300 tabular-nums">
                                {candidate.compositeScore}/100
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Freshness</span>
                              <span className="font-bold text-emerald-300 tabular-nums">
                                {breakdown.freshness}/100 ({candidate.freshnessTag})
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">Engagement</span>
                              <span className="font-bold text-cyan-300 tabular-nums">
                                {breakdown.engagement}/100
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">
                                Client Relevance (Startups/SMEs)
                              </span>
                              <span className="font-bold text-sky-300 tabular-nums">
                                {breakdown.clientRelevance}/100
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-slate-400">
                                Platform Risk (Lower is Safer)
                              </span>
                              <span className="font-bold text-amber-300 tabular-nums">
                                {breakdown.platformRisk}/100
                              </span>
                            </div>
                            {candidate.topic.clientRelevanceReason && (
                              <div className="pt-1 border-t border-white/10 text-[10px] text-slate-400 leading-snug">
                                {candidate.topic.clientRelevanceReason}
                              </div>
                            )}
                          </div>
                        </div>

                        <span aria-hidden="true">·</span>
                        <span
                          data-testid={`source-domain-${candidate.id}`}
                          className="text-cyan-300 font-semibold"
                        >
                          {candidate.sourceDomain}
                        </span>

                        <span aria-hidden="true">·</span>
                        <span data-testid={`published-date-${candidate.id}`}>
                          {candidate.publishedDateLabel}
                        </span>

                        <span aria-hidden="true">·</span>
                        <span
                          data-testid={`freshness-tag-${candidate.id}`}
                          className={
                            candidate.freshnessTag === 'Fresh'
                              ? 'text-emerald-300 font-bold'
                              : 'text-slate-300 font-semibold'
                          }
                        >
                          {candidate.freshnessTag}
                        </span>

                        <span aria-hidden="true">·</span>
                        <span className="uppercase text-slate-300">
                          {candidate.postFormat === 'single'
                            ? '1-Slide'
                            : candidate.isDeckSynthesized
                            ? `${slides.length}-Slide Carousel`
                            : 'Carousel (Lazy)'}
                        </span>

                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 text-slate-300">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: palette.accent }}
                          />
                          <span>{palette.name.split(' ')[0]}</span>
                        </span>

                        {candidate.alreadyCovered && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              data-testid="already-covered-badge"
                              className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 font-bold"
                              title={`Matched existing Vault post: ${
                                candidate.coveredPostTitle || 'Existing Post'
                              } (${candidate.coveredPostStatus || 'vault'})`}
                            >
                              Already Covered
                              {candidate.coveredPostTitle
                                ? `: ${candidate.coveredPostTitle.slice(0, 26)}`
                                : ''}
                            </span>
                          </>
                        )}

                        {candidate.topic.url && (
                          <a
                            href={candidate.topic.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-cyan-300 inline-flex items-center gap-1 ml-auto"
                            title="Open original source article"
                          >
                            <span>Source</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      {/* Editable Draft Headline */}
                      <input
                        type="text"
                        aria-label={`Draft Headline for ${candidate.topic.title}`}
                        value={candidate.draftTitle}
                        onChange={(e) =>
                          onUpdateCandidateDeck(candidate.id, (prev) => ({
                            ...prev,
                            draftTitle: e.target.value,
                            deck: { ...prev.deck, title: e.target.value },
                          }))
                        }
                        className="w-full bg-transparent text-sm font-extrabold text-white hover:bg-white/[0.04] focus:bg-white/[0.08] px-2 py-1 rounded-md border border-transparent focus:border-white/20 focus:outline-none transition-colors"
                        placeholder="Draft Post Headline"
                      />

                      {slides[0]?.arTitle && (
                        <div className="text-xs text-slate-300 font-arabic px-2" dir="rtl">
                          {slides[0].arTitle}
                        </div>
                      )}

                      {/* Required Editable "Marrok Angle (what it means for your product)" */}
                      <div className="px-2 pt-1 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono uppercase">
                          <label
                            htmlFor={`marrok-angle-${candidate.id}`}
                            className="text-cyan-300 font-bold"
                          >
                            Marrok Angle (What it means for your product / startup)
                          </label>
                          <span
                            className={
                              candidate.marrokAngle.trim().length < 15
                                ? 'text-rose-400 font-bold'
                                : 'text-slate-500'
                            }
                          >
                            {candidate.marrokAngle.trim().length} chars (min 15)
                          </span>
                        </div>
                        <input
                          id={`marrok-angle-${candidate.id}`}
                          data-testid={`marrok-angle-input-${candidate.id}`}
                          type="text"
                          value={candidate.marrokAngle}
                          onChange={(e) =>
                            onUpdateCandidateAngle(candidate.id, e.target.value)
                          }
                          placeholder="Explain in one crisp line what this trend means for startups/SMEs engineering stacks..."
                          className="w-full px-2.5 py-1.5 rounded-md bg-black/55 border border-white/15 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                        />
                      </div>

                      {/* Quality Gate Blockers + Summary-Only Warning */}
                      {!gatePassed && candidate.qualityGate?.blockingReasons?.length > 0 && (
                        <div
                          data-testid={`quality-blocker-${candidate.id}`}
                          className="mx-2 p-2 rounded-md border border-rose-500/40 bg-rose-500/10 text-[11px] text-rose-200 flex items-start gap-2"
                        >
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold">Accept Blocked:</strong>{' '}
                            {candidate.qualityGate.blockingReasons.join(' · ')}
                          </div>
                        </div>
                      )}

                      {candidate.summaryOnlyWarning && (
                        <div
                          data-testid={`summary-warning-${candidate.id}`}
                          className="mx-2 p-2 rounded-md border border-amber-500/35 bg-amber-500/10 text-[11px] text-amber-200 flex items-start gap-2"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span>{candidate.summaryOnlyWarning}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Controls: Move to Draft (NO Direct Schedule Bypass) + Dismiss */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      data-testid={`move-to-draft-${candidate.id}`}
                      disabled={acceptingSingleId === candidate.id || isBlocked}
                      onClick={() => onMoveSingleToDraft(candidate)}
                      title={
                        candidate.alreadyCovered
                          ? 'Already covered in Vault'
                          : !gatePassed
                          ? candidate.qualityGate.blockingReasons[0] || 'Quality gate blocked'
                          : 'Generate full storyboard & move to Draft for human verification'
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {acceptingSingleId === candidate.id
                          ? 'Moving...'
                          : candidate.alreadyCovered
                          ? 'Covered'
                          : 'Move to Draft'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDismissCandidate(candidate.id)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                      title="Dismiss candidate from Inbox"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Lazy Storyboard Footer & Expand Trigger */}
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[11px] font-mono text-slate-400">
                      {candidate.isDeckSynthesized
                        ? `Full Storyboard Ready (${slides.length} slides — Slide 1 Hook + layout rationale)`
                        : 'Lazy Hook Preview (Slide 1 only — full 8-slide storyboard builds when opened)'}
                    </span>

                    <div className="flex items-center gap-2 shrink-0">
                      {onLoadCandidateIntoStudio && (
                        <button
                          type="button"
                          onClick={async () => {
                            const hydrated = !candidate.isDeckSynthesized
                              ? await onOpenAndHydrateCandidate(candidate, 0)
                              : candidate;
                            const target = hydrated || candidate;
                            onLoadCandidateIntoStudio(
                              target.deck,
                              target.draftTitle
                            );
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-white/15 text-slate-200 text-xs font-semibold cursor-pointer whitespace-nowrap"
                        >
                          <Layers className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Open in Studio</span>
                        </button>
                      )}

                      <button
                        type="button"
                        data-testid={`toggle-slide-preview-${candidate.id}`}
                        onClick={() =>
                          isExpanded
                            ? onCollapseCandidate()
                            : onOpenAndHydrateCandidate(candidate, 0)
                        }
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-cyan-400/35 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        {isHydrating ? (
                          <Sparkles className="w-3 h-3 animate-spin" />
                        ) : (
                          <Edit3 className="w-3 h-3" />
                        )}
                        <span>
                          {isHydrating
                            ? 'Synthesizing Storyboard...'
                            : isExpanded
                            ? 'Collapse Preview'
                            : candidate.isDeckSynthesized
                            ? 'Preview & Inspect'
                            : 'Generate & Inspect 8 Slides'}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Storyboard Strip (Slide 1 only when lazy, full 8 slides once hydrated) */}
                  <CandidateSlideStoryboardStrip
                    slides={slides}
                    isExpanded={isExpanded}
                    activeSlideIdx={Math.min(
                      activeOutlineSlideIdx,
                      Math.max(0, slides.length - 1)
                    )}
                    onSelectSlide={(sIdx) =>
                      onOpenAndHydrateCandidate(candidate, sIdx)
                    }
                  />
                </div>

                {/* Live Canvas Preview + Inspector (Lazy hydrated on expand) */}
                {isExpanded && activeSlide && (
                  <CandidateSlidePreviewInspector
                    candidate={candidate}
                    activeSlideIdx={Math.min(
                      activeOutlineSlideIdx,
                      Math.max(0, slides.length - 1)
                    )}
                    onSetActiveSlideIdx={onSetActiveOutlineSlideIdx}
                    onUpdateCandidateDeck={onUpdateCandidateDeck}
                    onRegenerateSingleSlide={onRegenerateSingleSlide}
                    isRegeneratingSlide={
                      regeneratingSlideKey ===
                      `${candidate.id}:${Math.min(
                        activeOutlineSlideIdx,
                        Math.max(0, slides.length - 1)
                      )}`
                    }
                    onShowToast={onShowToast}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
