import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Radar,
  RefreshCw,
  Check,
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
  ShieldCheck,
  Clock,
  Calendar,
  Undo2,
  HelpCircle,
  Link2,
  SkipForward,
  FileCheck2,
  Eye,
} from 'lucide-react';
import {
  CarouselData,
  FeedHealthStatus,
  PostFormat,
  TriageSkipReason,
} from '../../../types.ts';
import {
  clearDismissedGatherTopicIds,
  clearLocalTriageDecisions,
  GatheredCandidatePost,
  saveCustomRssFeeds,
} from '../../../lib/gather/gatherClient.ts';
import {
  isSingleMetricUnverified,
  sanitizeSafeHttpUrl,
} from '../../../lib/gather/inboxEngine.ts';
import {
  CandidateSlidePreviewInspector,
  CandidateSlideStoryboardStrip,
} from './CandidateSlidePreviewInspector.tsx';

export type SnoozeDuration = '24h' | '3d' | '7d';

export interface InboxUndoEntry {
  decisionId?: string;
  candidate: GatheredCandidatePost;
  originalIndex: number;
  action: 'draft' | 'skip' | 'snooze';
  summary: string;
}

const SOURCE_FILTERS = [
  { id: 'all', label: 'All Sources' },
  { id: 'github', label: 'GitHub' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'hn', label: 'Hacker News' },
  { id: 'lobsters', label: 'Lobsters' },
  { id: 'blogs', label: 'Engineering RSS' },
] as const;

const DOMAIN_FILTERS = [
  { id: 'all', label: 'All Domains' },
  { id: 'REVERSE ENGINEERING', label: 'Reversing & CVEs' },
  { id: 'AI AGENTS & MODELS', label: 'AI & Models' },
  { id: 'LINUX KERNEL', label: 'Kernel & eBPF' },
  { id: 'KUBERNETES & CLOUD', label: 'Cloud & K8s' },
  { id: 'DISTRIBUTED SYSTEMS', label: 'Distributed Systems' },
] as const;

const SKIP_REASONS: Array<{ id: TriageSkipReason; label: string }> = [
  { id: 'off-topic', label: 'Off-topic' },
  { id: 'too-basic', label: 'Too basic' },
  { id: 'already-covered', label: 'Already covered' },
  { id: 'cant-verify', label: "Can't verify" },
  { id: 'risky', label: 'Risky' },
];

const SNOOZE_OPTIONS: Array<{ id: SnoozeDuration; label: string }> = [
  { id: '24h', label: '24 hours' },
  { id: '3d', label: '3 days' },
  { id: '7d', label: 'Next week' },
];

const ESTIMATED_CARD_HEIGHT = 272;
const VIRTUALIZE_THRESHOLD = 18;

function isReadyForDraft(c: GatheredCandidatePost): boolean {
  if (c.alreadyCovered) return false;
  if (!(c.qualityGate?.passed ?? true)) return false;
  if (isSingleMetricUnverified(c.metricEvidence)) return false;
  if (c.isUntitledHook && !(c.draftTitle || '').trim()) return false;
  return true;
}

function formatScanTime(iso?: string | null): string {
  if (!iso) return 'Not scanned yet';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Recent';
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface TopicRadarGatherViewProps {
  candidates: GatheredCandidatePost[];
  isScanningTrends: boolean;
  scanProgressLabel: string | null;
  feedStatuses: FeedHealthStatus[];
  lastScannedAt: string | null;
  radarWarning?: string | null;
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
  urlValidationError?: string | null;
  isExtractingInput: boolean;
  onAddUrlOrRss: () => void;
  showRssManager: boolean;
  onSetShowRssManager: React.Dispatch<React.SetStateAction<boolean>>;
  selectedCandidateIds: string[];
  onSetSelectedCandidateIds: React.Dispatch<React.SetStateAction<string[]>>;
  focusedCandidateId: string | null;
  onSetFocusedCandidateId: (id: string | null) => void;
  isAcceptingBatch: boolean;
  acceptingSingleId: string | null;
  onBulkAddToDrafts: () => void;
  onAddSingleToDrafts: (candidate: GatheredCandidatePost) => void;
  onSkipCandidate: (candidate: GatheredCandidatePost, reason: TriageSkipReason) => void;
  onSnoozeCandidate: (candidate: GatheredCandidatePost, duration: SnoozeDuration) => void;
  lastUndoEntry: InboxUndoEntry | null;
  onUndoLastTriage: () => void;
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
  onUpdateCandidateHook: (candidateId: string, hookEn: string) => void;
  onUpdateCandidateAngle: (candidateId: string, angle: string) => void;
  onToggleMetricVerified: (candidateId: string, metricId: string) => void;
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
  feedStatuses,
  lastScannedAt,
  radarWarning,
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
  urlValidationError,
  isExtractingInput,
  onAddUrlOrRss,
  showRssManager,
  onSetShowRssManager,
  selectedCandidateIds,
  onSetSelectedCandidateIds,
  focusedCandidateId,
  onSetFocusedCandidateId,
  isAcceptingBatch,
  acceptingSingleId,
  onBulkAddToDrafts,
  onAddSingleToDrafts,
  onSkipCandidate,
  onSnoozeCandidate,
  lastUndoEntry,
  onUndoLastTriage,
  onRunBackgroundGatherer,
  expandedCandidateId,
  onOpenAndHydrateCandidate,
  onCollapseCandidate,
  activeOutlineSlideIdx,
  onSetActiveOutlineSlideIdx,
  onUpdateCandidateDeck,
  onUpdateCandidateHook,
  onUpdateCandidateAngle,
  onToggleMetricVerified,
  hydratingCandidateId,
  regeneratingSlideKey,
  onRegenerateSingleSlide,
  onLoadCandidateIntoStudio,
  onShowToast,
}) => {
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [openScoreId, setOpenScoreId] = useState<string | null>(null);
  const [openSourcesId, setOpenSourcesId] = useState<string | null>(null);
  const [openMetricKey, setOpenMetricKey] = useState<string | null>(null);
  const [openSkipId, setOpenSkipId] = useState<string | null>(null);
  const [openSnoozeId, setOpenSnoozeId] = useState<string | null>(null);

  // Virtualization window for long lists (> 18 items when no card is expanded)
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollWindow, setScrollWindow] = useState<{ start: number; end: number }>({
    start: 0,
    end: 20,
  });

  const shouldVirtualize =
    candidates.length > VIRTUALIZE_THRESHOLD && !expandedCandidateId;

  useEffect(() => {
    if (!shouldVirtualize) return;
    const updateWindow = () => {
      const el = listContainerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight || 900;
      const topScrolled = Math.max(0, -rect.top);
      const start = Math.max(0, Math.floor(topScrolled / ESTIMATED_CARD_HEIGHT) - 3);
      const visibleCount = Math.ceil(viewportH / ESTIMATED_CARD_HEIGHT) + 6;
      const end = Math.min(candidates.length, start + visibleCount);
      setScrollWindow((prev) =>
        prev.start === start && prev.end === end ? prev : { start, end }
      );
    };

    updateWindow();
    window.addEventListener('scroll', updateWindow, { passive: true });
    window.addEventListener('resize', updateWindow);
    return () => {
      window.removeEventListener('scroll', updateWindow);
      window.removeEventListener('resize', updateWindow);
    };
  }, [shouldVirtualize, candidates.length]);

  const readyCandidates = useMemo(
    () => candidates.filter(isReadyForDraft),
    [candidates]
  );

  const selectedReadyCount = useMemo(() => {
    const readyIds = new Set(readyCandidates.map((c) => c.id));
    return selectedCandidateIds.filter((id) => readyIds.has(id)).length;
  }, [readyCandidates, selectedCandidateIds]);

  const degradedFeeds = useMemo(
    () => feedStatuses.filter((f) => f.status === 'error' || f.status === 'partial'),
    [feedStatuses]
  );

  const visibleSlice = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        items: candidates,
        startIndex: 0,
        topSpacer: 0,
        bottomSpacer: 0,
      };
    }
    const start = Math.min(scrollWindow.start, Math.max(0, candidates.length - 1));
    const end = Math.max(start + 1, Math.min(candidates.length, scrollWindow.end));
    return {
      items: candidates.slice(start, end),
      startIndex: start,
      topSpacer: start * ESTIMATED_CARD_HEIGHT,
      bottomSpacer: Math.max(0, (candidates.length - end) * ESTIMATED_CARD_HEIGHT),
    };
  }, [shouldVirtualize, candidates, scrollWindow]);

  const hasActiveFilter = sourceFilter !== 'all' || domainFilter !== 'all';

  return (
    <div className="space-y-3 relative pb-14" data-testid="inbox-gather-view">
      {/* Compact Inbox Toolbar */}
      <div className="rounded-xl border border-white/10 bg-[#0b1218]/95 p-3.5 space-y-3">
        {/* Top Row: Title + How it works + Feed Health + Scan */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-cyan-400 shrink-0" />
              <h3 className="text-sm font-extrabold text-white whitespace-nowrap">
                Content Inbox
              </h3>
            </div>

            <div className="relative">
              <button
                type="button"
                data-testid="how-it-works-btn"
                aria-expanded={showHowItWorks}
                onClick={() => setShowHowItWorks((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                <span>How it works</span>
              </button>

              {showHowItWorks && (
                <div
                  data-testid="how-it-works-popover"
                  className="absolute left-0 top-full mt-2 w-80 sm:w-96 rounded-xl border border-white/15 bg-[#070d12] p-3.5 shadow-2xl z-40 text-xs text-slate-300 space-y-2"
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                    <span className="font-bold text-white">Inbox Triage Workflow</span>
                    <button
                      type="button"
                      onClick={() => setShowHowItWorks(false)}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="leading-relaxed">
                    Stories from multiple feeds are clustered and ranked by relevance, freshness,
                    novelty, verifiability, and domain balance. Verify single-number claims inline
                    against their source quote before adding to drafts.
                  </p>
                  <p className="leading-relaxed text-slate-400">
                    Cards added to drafts stay unscheduled until human and numeric checks pass in
                    the Draft tab.
                  </p>
                  <div className="pt-1.5 border-t border-white/10 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-slate-400">
                    <span>
                      <kbd className="px-1 py-0.5 rounded bg-white/10 text-slate-200">J</kbd>/
                      <kbd className="px-1 py-0.5 rounded bg-white/10 text-slate-200">K</kbd> move
                    </span>
                    <span>
                      <kbd className="px-1 py-0.5 rounded bg-white/10 text-slate-200">D</kbd> draft
                    </span>
                    <span>
                      <kbd className="px-1 py-0.5 rounded bg-white/10 text-slate-200">X</kbd> skip
                    </span>
                    <span>
                      <kbd className="px-1 py-0.5 rounded bg-white/10 text-slate-200">Z</kbd> undo
                    </span>
                  </div>
                </div>
              )}
            </div>

            {lastScannedAt && (
              <span
                data-testid="inbox-last-scanned"
                className="hidden sm:inline text-[11px] font-mono tabular-nums text-slate-500"
              >
                Last scan {formatScanTime(lastScannedAt)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="feed-health-toggle-btn"
              onClick={() => onSetShowRssManager((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-semibold cursor-pointer whitespace-nowrap transition-colors ${
                degradedFeeds.length > 0
                  ? 'border-amber-400/45 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                  : 'border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-slate-200'
              }`}
            >
              <Rss className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Feeds ({Math.max(4, feedStatuses.length) + customRssFeeds.length})</span>
              {degradedFeeds.length > 0 && (
                <span
                  data-testid="degraded-feeds-badge"
                  className="px-1 rounded bg-amber-500/25 text-[10px] font-mono tabular-nums font-bold text-amber-200"
                >
                  {degradedFeeds.length} issue{degradedFeeds.length > 1 ? 's' : ''}
                </span>
              )}
            </button>

            <button
              type="button"
              data-testid="scan-trends-btn"
              disabled={isScanningTrends}
              onClick={() => {
                clearDismissedGatherTopicIds();
                clearLocalTriageDecisions();
                onRunBackgroundGatherer(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-cyan-400/35 bg-cyan-500/15 hover:bg-cyan-500/25 text-xs font-bold text-cyan-200 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isScanningTrends ? 'animate-spin' : ''}`}
              />
              <span>{isScanningTrends ? 'Scanning...' : 'Scan Trends'}</span>
            </button>
          </div>
        </div>

        {/* Non-blocking partial feed failure notice */}
        {(degradedFeeds.length > 0 || radarWarning) && (
          <div
            data-testid="partial-feed-warning"
            className="px-3 py-1.5 rounded-md border border-amber-500/30 bg-amber-500/[0.07] text-[11px] text-amber-200 flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">
                {degradedFeeds.length > 0
                  ? `${degradedFeeds.map((f) => f.name).join(', ')} returned partial or failed responses — showing available feeds.`
                  : radarWarning}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSetShowRssManager(true)}
              className="text-[11px] font-mono underline text-amber-200 hover:text-white shrink-0 cursor-pointer"
            >
              Feed status
            </button>
          </div>
        )}

        {/* Per-Feed Status & Custom RSS Manager */}
        {showRssManager && (
          <div
            data-testid="feed-health-panel"
            className="p-3 rounded-lg border border-white/10 bg-black/45 space-y-2.5 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-200">Feed Health & Custom RSS</span>
              <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                Last scan: {formatScanTime(lastScannedAt)}
              </span>
            </div>

            {feedStatuses.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {feedStatuses.map((feed) => (
                  <div
                    key={feed.id}
                    data-testid={`feed-status-${feed.id}`}
                    className="p-2 rounded-md border border-white/10 bg-white/[0.02] flex items-center justify-between gap-2 text-[11px] font-mono"
                  >
                    <div className="min-w-0">
                      <div className="text-slate-200 font-semibold truncate">{feed.name}</div>
                      {feed.errorMessage && (
                        <div
                          className="text-[10px] text-amber-300 truncate"
                          title={feed.errorMessage}
                        >
                          {feed.errorMessage}
                        </div>
                      )}
                    </div>
                    <span
                      className={`shrink-0 tabular-nums font-bold ${
                        feed.status === 'ok'
                          ? 'text-emerald-300'
                          : feed.status === 'partial'
                          ? 'text-amber-300'
                          : 'text-rose-400'
                      }`}
                    >
                      {feed.status === 'ok'
                        ? `${feed.itemCount} OK`
                        : feed.status === 'partial'
                        ? `${feed.itemCount} Partial`
                        : 'Error'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11px] font-mono text-slate-400">
                Reddit · Hacker News · Lobste.rs · Engineering RSS & GitHub
              </div>
            )}

            {customRssFeeds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
                {customRssFeeds.map((feedUrl) => (
                  <div
                    key={feedUrl}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.05] border border-white/10 text-[11px] font-mono text-cyan-200"
                  >
                    <span className="truncate max-w-[240px]">{feedUrl}</span>
                    <button
                      type="button"
                      aria-label={`Remove RSS feed ${feedUrl}`}
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

        {/* Direct Article URL / Custom RSS Input (SSRF Validated) */}
        <div className="space-y-1">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-1.5 rounded-lg border border-white/10 bg-black/40">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Globe className="w-4 h-4 text-cyan-400 shrink-0 ml-1" />
              <input
                type="url"
                data-testid="inbox-url-input"
                value={urlOrRssInput}
                onChange={(e) => onSetUrlOrRssInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onAddUrlOrRss();
                  }
                }}
                placeholder="Paste a public engineering article or RSS feed URL (https://...)..."
                className="w-full bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              data-testid="inbox-add-url-btn"
              disabled={isExtractingInput || !urlOrRssInput.trim()}
              onClick={onAddUrlOrRss}
              className="px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs cursor-pointer disabled:opacity-50 shrink-0 whitespace-nowrap"
            >
              {isExtractingInput ? 'Extracting...' : 'Add Article / RSS'}
            </button>
          </div>
          {urlValidationError && (
            <div
              data-testid="inbox-url-error"
              role="alert"
              className="px-2.5 py-1 rounded-md border border-rose-500/35 bg-rose-500/10 text-[11px] text-rose-200 flex items-center gap-1.5"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{urlValidationError}</span>
            </div>
          )}
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

        {/* Unified Bulk Action Bar: "X selected of Y ready" + "Add to drafts" */}
        <div className="px-3 py-2 rounded-lg border border-white/10 bg-black/35 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Outline format"
              value={formatFilter}
              onChange={(e) => onSetFormatFilter(e.target.value as 'auto' | PostFormat)}
              className="px-2.5 py-1.5 rounded-md bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
            >
              <option value="auto">Auto format</option>
              <option value="carousel">8-slide carousels</option>
              <option value="single">1-slide posts</option>
            </select>

            <span
              data-testid="inbox-selection-summary"
              className="text-xs font-mono tabular-nums text-slate-300"
            >
              <strong className="text-white">{selectedReadyCount} selected</strong> of{' '}
              {readyCandidates.length} ready
            </span>

            {readyCandidates.length > 0 && (
              <button
                type="button"
                data-testid="toggle-select-ready-btn"
                onClick={() =>
                  onSetSelectedCandidateIds((prev) =>
                    prev.length === readyCandidates.length
                      ? []
                      : readyCandidates.map((c) => c.id)
                  )
                }
                className="text-xs font-medium text-cyan-300 hover:text-cyan-200 underline underline-offset-2 cursor-pointer whitespace-nowrap"
              >
                {selectedReadyCount === readyCandidates.length ? 'Clear' : 'Select all'}
              </button>
            )}
          </div>

          <button
            type="button"
            data-testid="bulk-queue-drafts-btn"
            disabled={isAcceptingBatch || selectedReadyCount === 0}
            onClick={onBulkAddToDrafts}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs cursor-pointer disabled:opacity-45 whitespace-nowrap"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              {isAcceptingBatch
                ? 'Adding...'
                : selectedReadyCount > 0
                ? `Add to drafts (${selectedReadyCount})`
                : 'Add to drafts'}
            </span>
          </button>
        </div>

        {scanProgressLabel && (
          <div className="px-3 py-1.5 rounded-md bg-cyan-500/10 border border-cyan-400/25 text-xs font-mono text-cyan-200 flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span className="truncate">{scanProgressLabel}</span>
          </div>
        )}
      </div>

      {/* Skeleton Loading State */}
      {isScanningTrends && candidates.length === 0 ? (
        <div data-testid="inbox-skeleton-list" className="space-y-3">
          {[0, 1, 2].map((idx) => (
            <div
              key={idx}
              className="rounded-xl border border-white/10 bg-[#0b1218]/80 p-4 space-y-3 animate-pulse"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="h-5 w-64 rounded bg-white/10" />
                <div className="h-4 w-44 rounded bg-white/10" />
              </div>
              <div className="h-4 w-48 rounded bg-white/[0.06]" />
              <div className="h-8 w-full rounded bg-white/[0.05]" />
              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                <div className="h-4 w-40 rounded bg-white/[0.06]" />
                <div className="flex gap-2">
                  <div className="h-7 w-28 rounded bg-white/10" />
                  <div className="h-7 w-20 rounded bg-white/[0.06]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : candidates.length === 0 ? (
        /* Empty State */
        <div
          data-testid="inbox-empty-state"
          className="rounded-xl border border-white/10 bg-[#0b1218]/90 p-8 text-center space-y-3"
        >
          <Radar className="w-8 h-8 text-cyan-400 mx-auto opacity-80" />
          <div className="text-sm font-bold text-white">
            {hasActiveFilter
              ? 'No stories match these filters'
              : 'Inbox is clear'}
          </div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {hasActiveFilter
              ? 'Reset the source or domain filter to view other ranked stories.'
              : 'Scan engineering feeds for new stories or paste an article URL above.'}
          </p>
          <div className="flex items-center justify-center gap-2">
            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  onSetSourceFilter('all');
                  onSetDomainFilter('all');
                }}
                className="px-3.5 py-1.5 rounded-md border border-white/15 bg-white/[0.05] hover:bg-white/10 text-xs font-semibold text-white cursor-pointer"
              >
                Reset filters
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                clearDismissedGatherTopicIds();
                clearLocalTriageDecisions();
                onRunBackgroundGatherer(true);
              }}
              className="px-4 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs cursor-pointer"
            >
              Scan Trends
            </button>
          </div>
        </div>
      ) : (
        /* Virtualized / Standard Candidate List */
        <div
          ref={listContainerRef}
          data-testid={shouldVirtualize ? 'inbox-virtual-list' : 'inbox-candidate-list'}
          className="space-y-3"
        >
          {visibleSlice.topSpacer > 0 && (
            <div style={{ height: visibleSlice.topSpacer }} aria-hidden="true" />
          )}

          {visibleSlice.items.map((candidate, sliceIdx) => {
            const cIdx = visibleSlice.startIndex + sliceIdx;
            const isSelected = selectedCandidateIds.includes(candidate.id);
            const isFocused = focusedCandidateId === candidate.id;
            const isExpanded = expandedCandidateId === candidate.id;
            const slides = candidate.deck.slides || [];
            const activeSlide =
              slides[Math.min(activeOutlineSlideIdx, Math.max(0, slides.length - 1))];

            const gatePassed = candidate.qualityGate?.passed ?? true;
            const singleMetricBlocked = isSingleMetricUnverified(candidate.metricEvidence);
            const untitledBlocked =
              candidate.isUntitledHook && !(candidate.draftTitle || '').trim();
            const isBlocked =
              Boolean(candidate.alreadyCovered) ||
              !gatePassed ||
              singleMetricBlocked ||
              untitledBlocked;

            const breakdown = candidate.scoreBreakdown;
            const isHydrating = hydratingCandidateId === candidate.id;
            const safeSourceUrl = sanitizeSafeHttpUrl(candidate.topic.url);
            const sourceCount = Math.max(1, candidate.clusteredSources?.length || 1);
            const expectedSlideCount = candidate.postFormat === 'single' ? 1 : 8;
            const previewSlideCount = candidate.isDeckSynthesized
              ? slides.length
              : expectedSlideCount;

            const blockReason = candidate.alreadyCovered
              ? 'Already covered in Vault'
              : singleMetricBlocked
              ? `Verify "${candidate.metricEvidence[0].label}" against its source quote first`
              : untitledBlocked
              ? 'Add a 2–5 word hook headline before adding to drafts'
              : !gatePassed
              ? candidate.qualityGate.blockingReasons[0] || 'Quality gate blocked'
              : undefined;

            return (
              <article
                key={`${candidate.id}_${cIdx}`}
                data-testid={`inbox-candidate-card-${candidate.id}`}
                data-focused={isFocused ? 'true' : 'false'}
                onClick={() => onSetFocusedCandidateId(candidate.id)}
                className={`rounded-xl border transition-colors p-4 space-y-2.5 ${
                  candidate.alreadyCovered
                    ? 'border-white/10 bg-[#080d12]/80 opacity-85'
                    : isFocused
                    ? 'border-cyan-400/65 bg-[#0d1720]/95 ring-1 ring-cyan-400/35'
                    : isSelected
                    ? 'border-cyan-400/40 bg-[#0c151d]/95'
                    : 'border-white/10 bg-[#0b1218]/90 hover:border-white/20'
                }`}
              >
                {/* TOP ROW: Checkbox + 2-5 word Hook (EN + AR) | Right: Fit Score + Fresh + N Sources + Domain/Date */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <button
                      type="button"
                      aria-label={`Select ${candidate.draftTitle || candidate.topic.title}`}
                      disabled={isBlocked}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetSelectedCandidateIds((prev) =>
                          prev.includes(candidate.id)
                            ? prev.filter((id) => id !== candidate.id)
                            : [...prev, candidate.id]
                        );
                      }}
                      className={`mt-1 w-4 h-4 rounded flex items-center justify-center border cursor-pointer shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${
                        isSelected && !isBlocked
                          ? 'bg-cyan-400 border-cyan-400 text-slate-950 font-bold'
                          : 'border-white/25 bg-black/40 text-transparent hover:border-white/50'
                      }`}
                      title={blockReason || 'Select for bulk Add to drafts'}
                    >
                      <Check className="w-3 h-3" />
                    </button>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        {untitledBlocked && (
                          <span
                            data-testid={`untitled-hook-badge-${candidate.id}`}
                            className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/40 text-[10px] font-mono font-bold text-amber-200 shrink-0"
                          >
                            Untitled
                          </span>
                        )}
                        <input
                          type="text"
                          data-testid={`card-hook-input-${candidate.id}`}
                          aria-label={`Proposed hook for ${candidate.topic.title}`}
                          value={candidate.draftTitle}
                          onChange={(e) =>
                            onUpdateCandidateHook(candidate.id, e.target.value)
                          }
                          placeholder="Untitled — add a 2–5 word hook ending with a period."
                          className="w-full bg-transparent text-[15px] font-extrabold text-white placeholder:text-amber-300/70 hover:bg-white/[0.04] focus:bg-white/[0.08] px-1.5 py-0.5 -mx-1.5 rounded border border-transparent focus:border-white/20 focus:outline-none transition-colors"
                        />
                      </div>

                      {candidate.proposedHookAr && (
                        <div
                          dir="rtl"
                          data-testid={`card-hook-ar-${candidate.id}`}
                          className="text-xs text-slate-300 font-arabic"
                        >
                          {candidate.proposedHookAr}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Metadata Stack (Zero-Pill Typography) */}
                  <div className="flex flex-col md:items-end gap-0.5 text-[11px] font-mono tabular-nums text-slate-400 shrink-0 pl-6 md:pl-0">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      {/* Fit Score + 5-Factor Breakdown Popover */}
                      <div className="relative inline-flex items-center group">
                        <button
                          type="button"
                          data-testid={`score-breakdown-trigger-${candidate.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenScoreId((prev) =>
                              prev === candidate.id ? null : candidate.id
                            );
                          }}
                          className={`inline-flex items-center gap-1 font-extrabold cursor-pointer focus:outline-none ${
                            breakdown.rumorCapped
                              ? 'text-rose-300'
                              : candidate.compositeScore >= 75
                              ? 'text-emerald-300 hover:text-emerald-200'
                              : candidate.compositeScore >= 58
                              ? 'text-cyan-300 hover:text-cyan-200'
                              : 'text-amber-300 hover:text-amber-200'
                          }`}
                          aria-label={`Fit score ${candidate.compositeScore}. Click for 5-factor breakdown.`}
                        >
                          <span>Fit {candidate.compositeScore}</span>
                        </button>

                        <div
                          role="tooltip"
                          data-testid={`score-breakdown-tooltip-${candidate.id}`}
                          className={`${
                            openScoreId === candidate.id
                              ? 'opacity-100 pointer-events-auto'
                              : 'pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                          } transition-opacity absolute right-0 top-full mt-1.5 z-40 w-72 p-3 rounded-lg border border-white/15 bg-[#05080b] shadow-2xl text-[11px] text-slate-200 space-y-1.5`}
                        >
                          <div className="font-bold text-white border-b border-white/10 pb-1 flex items-center justify-between">
                            <span>5-Factor Fit Score</span>
                            <span className="text-cyan-300 tabular-nums">
                              {candidate.compositeScore}/100
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Client Relevance (30%)</span>
                            <span className="font-bold text-sky-300 tabular-nums">
                              {breakdown.relevance ?? breakdown.clientRelevance}/100
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Freshness (20%)</span>
                            <span className="font-bold text-emerald-300 tabular-nums">
                              {breakdown.freshness}/100 ({candidate.freshnessTag})
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Novelty (20%)</span>
                            <span className="font-bold text-cyan-300 tabular-nums">
                              {breakdown.novelty ?? breakdown.engagement}/100
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Verifiability (20%)</span>
                            <span className="font-bold text-emerald-300 tabular-nums">
                              {breakdown.verifiability ?? breakdown.platformRisk}/100
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Domain Balance (10%)</span>
                            <span className="font-bold text-slate-200 tabular-nums">
                              {breakdown.domainBalance ?? 80}/100
                            </span>
                          </div>
                          {(breakdown.duplicatePenalty ?? 0) > 0 && (
                            <div className="flex items-center justify-between text-amber-300 pt-1 border-t border-white/10">
                              <span>Vault Duplicate Penalty</span>
                              <span className="font-bold">-{breakdown.duplicatePenalty}</span>
                            </div>
                          )}
                          {(breakdown.learningAdjustment ?? 0) !== 0 && (
                            <div className="flex items-center justify-between text-cyan-300">
                              <span>Triage Learning</span>
                              <span className="font-bold">
                                {(breakdown.learningAdjustment ?? 0) > 0 ? '+' : ''}
                                {breakdown.learningAdjustment}
                              </span>
                            </div>
                          )}
                          {breakdown.rumorCapped && (
                            <div className="pt-1 border-t border-rose-500/20 text-[10px] text-rose-300">
                              Capped below top tier: {breakdown.rumorReason || 'Unverified source'}
                            </div>
                          )}
                        </div>
                      </div>

                      <span aria-hidden="true">·</span>
                      <span
                        data-testid={`freshness-tag-${candidate.id}`}
                        className={
                          candidate.freshnessTag === 'Fresh'
                            ? 'text-emerald-300 font-semibold'
                            : 'text-slate-400'
                        }
                      >
                        {candidate.freshnessTag}
                      </span>

                      {sourceCount > 1 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <div className="relative inline-flex">
                            <button
                              type="button"
                              data-testid={`clustered-sources-btn-${candidate.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenSourcesId((prev) =>
                                  prev === candidate.id ? null : candidate.id
                                );
                              }}
                              className="text-cyan-300 hover:text-cyan-200 font-semibold underline decoration-dotted underline-offset-2 cursor-pointer"
                            >
                              {sourceCount} sources
                            </button>

                            {openSourcesId === candidate.id && (
                              <div
                                data-testid={`clustered-sources-popover-${candidate.id}`}
                                className="absolute right-0 top-full mt-1.5 z-40 w-72 p-2.5 rounded-lg border border-white/15 bg-[#05080b] shadow-2xl space-y-1.5 text-left"
                              >
                                <div className="flex items-center justify-between text-[11px] font-bold text-white border-b border-white/10 pb-1">
                                  <span>Clustered Sources ({sourceCount})</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenSourcesId(null);
                                    }}
                                    className="text-slate-400 hover:text-white cursor-pointer"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                                {candidate.clusteredSources.map((src, sIdx) => (
                                  <a
                                    key={`${src.domain}_${sIdx}`}
                                    href={src.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-white/[0.06] text-[11px] text-slate-200"
                                  >
                                    <span className="truncate">
                                      {src.sourceName} ({src.domain})
                                    </span>
                                    <ExternalLink className="w-3 h-3 text-cyan-400 shrink-0" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      {safeSourceUrl ? (
                        <a
                          href={safeSourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`source-domain-${candidate.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-300 hover:text-cyan-300 inline-flex items-center gap-1"
                          title={`Open ${candidate.sourceDomain}`}
                        >
                          <span>{candidate.sourceDomain}</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                        </a>
                      ) : (
                        <span data-testid={`source-domain-${candidate.id}`}>
                          {candidate.sourceDomain}
                        </span>
                      )}
                      <span aria-hidden="true">·</span>
                      <span data-testid={`published-date-${candidate.id}`}>
                        {candidate.publishedDateLabel}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ROW 2: Grounded 1-Line "Why it fits Marrok" */}
                <div className="pl-6 space-y-1">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                    <label
                      htmlFor={`marrok-angle-${candidate.id}`}
                      className="text-[11px] font-semibold text-slate-400 shrink-0 whitespace-nowrap"
                    >
                      Why it fits Marrok:
                    </label>
                    <input
                      id={`marrok-angle-${candidate.id}`}
                      data-testid={`marrok-angle-input-${candidate.id}`}
                      type="text"
                      value={candidate.marrokAngle}
                      onChange={(e) =>
                        onUpdateCandidateAngle(candidate.id, e.target.value)
                      }
                      onClick={(e) => e.stopPropagation()}
                      placeholder="One crisp line on why this matters for builders..."
                      className="flex-1 min-w-0 px-2 py-1 rounded bg-black/45 border border-white/10 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                    <span
                      className={`text-[10px] font-mono tabular-nums shrink-0 ${
                        candidate.marrokAngle.trim().length < 15
                          ? 'text-rose-400 font-bold'
                          : 'text-slate-500'
                      }`}
                    >
                      {candidate.marrokAngle.trim().length}c
                    </span>
                  </div>
                </div>

                {/* ROW 3: Key Numbers Chips (Quote + Inline Verify) & Risk Signals */}
                <div className="pl-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px]">
                  {/* Numbers */}
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span className="text-slate-500 font-mono">Numbers:</span>
                    {candidate.metricEvidence.length > 0 ? (
                      candidate.metricEvidence.map((metric) => {
                        const metricKey = `${candidate.id}:${metric.id}`;
                        const isPopoverOpen = openMetricKey === metricKey;
                        return (
                          <div key={metric.id} className="relative inline-flex items-center">
                            <button
                              type="button"
                              data-testid={`metric-chip-${metric.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMetricKey((prev) =>
                                  prev === metricKey ? null : metricKey
                                );
                              }}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono text-[11px] cursor-pointer transition-colors ${
                                metric.verified
                                  ? 'border-emerald-400/40 bg-emerald-500/12 text-emerald-200'
                                  : 'border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
                              }`}
                              title={`Inspect source quote for ${metric.label}`}
                            >
                              <span className="font-bold">{metric.label}</span>
                              <span className="opacity-75">
                                {metric.verified ? 'verified ✓' : 'unverified'}
                              </span>
                            </button>

                            {isPopoverOpen && (
                              <div
                                data-testid={`metric-quote-popover-${metric.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute left-0 top-full mt-1.5 z-40 w-80 p-3 rounded-lg border border-white/15 bg-[#05080b] shadow-2xl space-y-2 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1">
                                  <span className="font-mono font-bold text-white">
                                    Source quote — {metric.label}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setOpenMetricKey(null)}
                                    className="text-slate-400 hover:text-white cursor-pointer"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <blockquote className="text-[11px] text-slate-300 leading-relaxed border-l-2 border-cyan-400/50 pl-2 italic">
                                  &ldquo;{metric.sourceQuote}&rdquo;
                                </blockquote>
                                <div className="flex items-center justify-between gap-2 pt-1">
                                  {metric.sourceUrl ? (
                                    <a
                                      href={metric.sourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-300 hover:text-cyan-200"
                                    >
                                      <Link2 className="w-3 h-3" />
                                      <span>Open source</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  ) : (
                                    <span className="text-[10px] text-slate-500">No URL</span>
                                  )}

                                  <button
                                    type="button"
                                    data-testid={`verify-metric-${metric.id}`}
                                    onClick={() => {
                                      onToggleMetricVerified(candidate.id, metric.id);
                                      setOpenMetricKey(null);
                                    }}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                                      metric.verified
                                        ? 'bg-white/10 text-slate-200 hover:bg-white/15'
                                        : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                                    }`}
                                  >
                                    <FileCheck2 className="w-3 h-3" />
                                    <span>
                                      {metric.verified ? 'Mark unverified' : 'Verify number'}
                                    </span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <span className="text-slate-500 font-mono">No numeric claim</span>
                    )}

                    {singleMetricBlocked && (
                      <span
                        data-testid={`verify-required-hint-${candidate.id}`}
                        className="text-[11px] text-amber-300/90"
                      >
                        Click number to verify quote
                      </span>
                    )}
                  </div>

                  {/* Risk Signals (Icon + Text + Color) */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]">
                    <span className="text-slate-500">Risk:</span>

                    <span
                      data-testid={`risk-origin-${candidate.id}`}
                      className={`inline-flex items-center gap-1 ${
                        candidate.riskSignals.origin === 'original'
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                      }`}
                    >
                      {candidate.riskSignals.origin === 'original' ? (
                        <ShieldCheck className="w-3 h-3 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                      )}
                      <span>
                        {candidate.riskSignals.origin === 'original'
                          ? 'Original ✓'
                          : 'Repost ⚠'}
                      </span>
                    </span>

                    <span
                      data-testid={`risk-claims-${candidate.id}`}
                      className={`inline-flex items-center gap-1 ${
                        candidate.riskSignals.claimsStatus === 'verified'
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                      }`}
                    >
                      {candidate.riskSignals.claimsStatus === 'verified' ? (
                        <Check className="w-3 h-3 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                      )}
                      <span>
                        {candidate.riskSignals.claimsStatus === 'verified'
                          ? 'Claims ✓'
                          : 'Claims ⚠'}
                      </span>
                    </span>

                    {candidate.alreadyCovered ? (
                      <span
                        data-testid="already-covered-badge"
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/40 text-amber-200 font-bold"
                        title={`Matched existing Vault post: ${
                          candidate.coveredPostTitle || candidate.topic.title
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>Already covered</span>
                      </span>
                    ) : (
                      <span
                        data-testid={`risk-duplicate-${candidate.id}`}
                        className="text-slate-400"
                      >
                        Duplicate ✗
                      </span>
                    )}
                  </div>
                </div>

                {/* Quality Gate Blockers + Summary-Only Warning */}
                {!gatePassed && candidate.qualityGate?.blockingReasons?.length > 0 && (
                  <div
                    data-testid={`quality-blocker-${candidate.id}`}
                    className="ml-6 p-2 rounded-md border border-rose-500/40 bg-rose-500/10 text-[11px] text-rose-200 flex items-start gap-2"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold">Blocked:</strong>{' '}
                      {candidate.qualityGate.blockingReasons.join(' · ')}
                    </div>
                  </div>
                )}

                {candidate.summaryOnlyWarning && (
                  <div
                    data-testid={`summary-warning-${candidate.id}`}
                    className="ml-6 p-2 rounded-md border border-amber-500/35 bg-amber-500/10 text-[11px] text-amber-200 flex items-start gap-2"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>{candidate.summaryOnlyWarning}</span>
                  </div>
                )}

                {/* ROW 4: Suggested Calendar Slot + Unified Triage Actions */}
                <div className="pl-6 pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2.5">
                  <div
                    data-testid={`suggested-slot-${candidate.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums"
                  >
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-400">Suggested slot:</span>
                    <span
                      className={
                        candidate.suggestedSlot.isEmpty
                          ? 'text-emerald-300 font-semibold'
                          : 'text-slate-300'
                      }
                    >
                      {candidate.suggestedSlot.label}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Primary Action: Add to drafts */}
                    <button
                      type="button"
                      data-testid={`move-to-draft-${candidate.id}`}
                      disabled={acceptingSingleId === candidate.id || isBlocked}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddSingleToDrafts(candidate);
                      }}
                      title={blockReason || 'Add to drafts (D)'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        {acceptingSingleId === candidate.id
                          ? 'Adding...'
                          : candidate.alreadyCovered
                          ? 'Covered'
                          : 'Add to drafts'}
                      </span>
                    </button>

                    {/* Skip ▾ with reason chips */}
                    <div className="relative">
                      <button
                        type="button"
                        data-testid={`skip-menu-btn-${candidate.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenSnoozeId(null);
                          setOpenSkipId((prev) =>
                            prev === candidate.id ? null : candidate.id
                          );
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-white/15 bg-white/[0.04] hover:bg-white/[0.09] text-slate-200 text-xs font-semibold cursor-pointer whitespace-nowrap"
                        title="Skip with reason (X)"
                      >
                        <SkipForward className="w-3 h-3 text-slate-400" />
                        <span>Skip</span>
                        <ChevronDown className="w-3 h-3 opacity-70" />
                      </button>

                      {openSkipId === candidate.id && (
                        <div
                          data-testid={`skip-menu-popover-${candidate.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 bottom-full mb-1.5 z-40 w-44 rounded-lg border border-white/15 bg-[#070d12] p-1.5 shadow-2xl space-y-0.5"
                        >
                          <div className="px-2 py-1 text-[10px] font-mono uppercase text-slate-400">
                            Skip reason
                          </div>
                          {SKIP_REASONS.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              data-testid={`skip-reason-${candidate.id}-${r.id}`}
                              onClick={() => {
                                setOpenSkipId(null);
                                onSkipCandidate(candidate, r.id);
                              }}
                              className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-200 hover:bg-rose-500/15 hover:text-rose-200 cursor-pointer transition-colors"
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Snooze ▾ quick menu (24h / 3d / Next week) */}
                    <div className="relative">
                      <button
                        type="button"
                        data-testid={`snooze-menu-btn-${candidate.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenSkipId(null);
                          setOpenSnoozeId((prev) =>
                            prev === candidate.id ? null : candidate.id
                          );
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-white/15 bg-white/[0.04] hover:bg-white/[0.09] text-slate-200 text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Snooze</span>
                        <ChevronDown className="w-3 h-3 opacity-70" />
                      </button>

                      {openSnoozeId === candidate.id && (
                        <div
                          data-testid={`snooze-menu-popover-${candidate.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 bottom-full mb-1.5 z-40 w-36 rounded-lg border border-white/15 bg-[#070d12] p-1.5 shadow-2xl space-y-0.5"
                        >
                          {SNOOZE_OPTIONS.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              data-testid={`snooze-opt-${candidate.id}-${opt.id}`}
                              onClick={() => {
                                setOpenSnoozeId(null);
                                onSnoozeCandidate(candidate, opt.id);
                              }}
                              className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-200 hover:bg-cyan-500/15 hover:text-cyan-200 cursor-pointer transition-colors"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Preview N slides */}
                    <button
                      type="button"
                      data-testid={`toggle-slide-preview-${candidate.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isExpanded) {
                          onCollapseCandidate();
                        } else {
                          void onOpenAndHydrateCandidate(candidate, 0);
                        }
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-cyan-400/35 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      {isHydrating ? (
                        <Sparkles className="w-3 h-3 animate-spin" />
                      ) : (
                        <Eye className="w-3 h-3" />
                      )}
                      <span>
                        {isHydrating
                          ? 'Building slides...'
                          : isExpanded
                          ? 'Hide preview'
                          : `Preview ${previewSlideCount} slide${previewSlideCount === 1 ? '' : 's'}`}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>

                    {onLoadCandidateIntoStudio && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          const hydrated = !candidate.isDeckSynthesized
                            ? await onOpenAndHydrateCandidate(candidate, 0)
                            : candidate;
                          const target = hydrated || candidate;
                          onLoadCandidateIntoStudio(
                            target.deck,
                            target.draftTitle || target.topic.title
                          );
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-white/15 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        <Layers className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Studio</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Storyboard Strip & Live Inspector */}
                {isExpanded && activeSlide && (
                  <div className="pl-6 space-y-2.5 pt-1" onClick={(e) => e.stopPropagation()}>
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
                  </div>
                )}
              </article>
            );
          })}

          {visibleSlice.bottomSpacer > 0 && (
            <div style={{ height: visibleSlice.bottomSpacer }} aria-hidden="true" />
          )}
        </div>
      )}

      {/* Floating Undo Toast */}
      {lastUndoEntry && (
        <div
          role="status"
          data-testid="inbox-undo-toast"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-cyan-400/40 bg-[#071018]/95 shadow-2xl text-xs text-slate-100"
        >
          <span>{lastUndoEntry.summary}</span>
          <button
            type="button"
            data-testid="inbox-undo-btn"
            onClick={onUndoLastTriage}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold cursor-pointer whitespace-nowrap"
          >
            <Undo2 className="w-3 h-3" />
            <span>Undo (Z)</span>
          </button>
        </div>
      )}
    </div>
  );
};
