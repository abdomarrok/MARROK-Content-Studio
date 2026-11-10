import React from 'react';
import {
  Radar,
  RefreshCw,
  Check,
  Edit3,
  Calendar,
  ExternalLink,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  Globe,
  CheckCircle2,
  X,
  Rss,
} from 'lucide-react';
import {
  CarouselData,
  DEFAULT_PALETTES,
  DiagramVariant,
  PostFormat,
  PublishTargetPlatform,
  SlideData,
  SlideType,
  ThemePalette,
} from '../../../types.ts';
import {
  diversifyDeckArchetypesAndVisuals,
  resolveSmartSlideVisuals,
  seedSlideArchetypeData,
} from '../../../lib/synthesizer.ts';
import {
  DAILY_PEAK_TIME_SLOTS,
  PeakProgramDensity,
} from '../../../lib/publish/publishClient.ts';
import {
  clearDismissedGatherTopicIds,
  dismissGatherTopicId,
  GatheredCandidatePost,
  saveCustomRssFeeds,
} from '../../../lib/gather/gatherClient.ts';

const ALL_PLATFORMS: PublishTargetPlatform[] = [
  'instagram',
  'facebook',
  'linkedin',
  'tiktok',
];

const PLATFORM_BADGES: Record<
  PublishTargetPlatform,
  { short: string; label: string; color: string }
> = {
  instagram: { short: 'IG', label: 'Instagram', color: 'text-pink-400 border-pink-400/40 bg-pink-500/10' },
  facebook: { short: 'FB', label: 'Facebook', color: 'text-blue-400 border-blue-400/40 bg-blue-500/10' },
  linkedin: { short: 'LI', label: 'LinkedIn', color: 'text-cyan-400 border-cyan-400/40 bg-cyan-500/10' },
  tiktok: { short: 'TT', label: 'TikTok', color: 'text-emerald-400 border-emerald-400/40 bg-emerald-500/10' },
};

const SOURCE_FILTERS = [
  { id: 'all', label: 'All Sources' },
  { id: 'reddit', label: 'Reddit Tech' },
  { id: 'hn', label: 'Hacker News' },
  { id: 'lobsters', label: 'Lobsters' },
  { id: 'blogs', label: 'Engineering RSS & Blogs' },
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
  programStartDate: string;
  onSetProgramStartDate: (val: string) => void;
  todayStr: string;
  programDensity: PeakProgramDensity;
  onSetProgramDensity: (d: PeakProgramDensity) => void;
  isAcceptingBatch: boolean;
  acceptingSingleId: string | null;
  onAcceptSelectedBatch: () => void;
  onAcceptSingleCandidate: (candidate: GatheredCandidatePost) => void;
  onDismissCandidate: (candidateId: string) => void;
  onRunBackgroundGatherer: (refresh?: boolean) => void;
  getCandidateFutureSchedule: (candidateId: string) => {
    datePart: string;
    timeShort: string;
    targets: PublishTargetPlatform[];
    rolledToTomorrow: boolean;
  };
  onUpdateCandidateSchedule: (
    candidateId: string,
    patch: Partial<{ datePart: string; timeShort: string; targets: PublishTargetPlatform[] }>
  ) => void;
  expandedCandidateId: string | null;
  onSetExpandedCandidateId: (id: string | null) => void;
  activeOutlineSlideIdx: number;
  onSetActiveOutlineSlideIdx: (idx: number) => void;
  onUpdateCandidateDeck: (
    candidateId: string,
    updater: (prev: GatheredCandidatePost) => GatheredCandidatePost
  ) => void;
  synthesizingCandidateId?: string | null;
  onSynthesizeCandidateWithAi?: (candidate: GatheredCandidatePost) => void;
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
  programStartDate,
  onSetProgramStartDate,
  todayStr,
  programDensity,
  onSetProgramDensity,
  isAcceptingBatch,
  acceptingSingleId,
  onAcceptSelectedBatch,
  onAcceptSingleCandidate,
  onDismissCandidate,
  onRunBackgroundGatherer,
  getCandidateFutureSchedule,
  onUpdateCandidateSchedule,
  expandedCandidateId,
  onSetExpandedCandidateId,
  activeOutlineSlideIdx,
  onSetActiveOutlineSlideIdx,
  onUpdateCandidateDeck,
  synthesizingCandidateId,
  onSynthesizeCandidateWithAi,
  onLoadCandidateIntoStudio,
  onShowToast,
}) => {
  return (
    <div className="space-y-3">
      {/* Top Control Bar: Trend Source Filters + URL/RSS Input + Weekly Batch Schedule Bar */}
      <div className="rounded-2xl border border-white/10 bg-[#0b1218]/95 p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-extrabold text-white">
                Automated Content Gatherer — Possible Posts from Social & RSS Trends
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Scans Reddit tech communities, Hacker News, Lobsters, and RSS feeds in the background, automatically generating draft carousel titles and 8-slide outlines for you to review and accept into future peak slots.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSetShowRssManager((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-xs font-bold text-slate-200 cursor-pointer"
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-cyan-400/35 bg-cyan-500/15 hover:bg-cyan-500/25 text-xs font-bold text-cyan-200 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanningTrends ? 'animate-spin' : ''}`} />
              <span>{isScanningTrends ? 'Scanning...' : 'Scan Trends Now'}</span>
            </button>
          </div>
        </div>

        {/* Connected Social & RSS Sources Drawer */}
        {showRssManager && (
          <div className="p-3 rounded-xl border border-white/10 bg-black/40 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-200">
                Active Social & Technical RSS Sources
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Auto-deduplicated against your Vault posts
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-300">
              <span>Reddit r/programming · r/LocalLLaMA · r/devops</span>
              <span aria-hidden="true">·</span>
              <span>Hacker News Top Tech</span>
              <span aria-hidden="true">·</span>
              <span>Lobste.rs Hottest</span>
              <span aria-hidden="true">·</span>
              <span>Cloudflare Engineering RSS</span>
            </div>
            {customRssFeeds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
                {customRssFeeds.map((feedUrl) => (
                  <div
                    key={feedUrl}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/10 text-[11px] font-mono text-cyan-200"
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

        {/* Direct Article URL or Custom RSS URL Input Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2.5 rounded-xl border border-white/10 bg-black/40">
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
              placeholder="Paste any article URL (to generate a draft carousel outline) or RSS feed URL (https://.../rss)..."
              className="w-full bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            disabled={isExtractingInput || !urlOrRssInput.trim()}
            onClick={onAddUrlOrRss}
            className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs cursor-pointer disabled:opacity-50 shrink-0"
          >
            {isExtractingInput ? 'Generating Outline...' : 'Generate Draft Outline / Add RSS'}
          </button>
        </div>

        {/* Source & Domain Filter Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
          <div className="flex flex-wrap items-center gap-1">
            {SOURCE_FILTERS.map((src) => (
              <button
                key={src.id}
                type="button"
                onClick={() => onSetSourceFilter(src.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
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
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
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

        {/* Multi-Post Weekly Schedule Program Bar */}
        <div className="p-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-0.5">
                Start Date (Future Only)
              </label>
              <input
                type="date"
                min={todayStr}
                value={programStartDate < todayStr ? todayStr : programStartDate}
                onChange={(e) => {
                  const val = e.target.value;
                  onSetProgramStartDate(val < todayStr ? todayStr : val);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white font-mono focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-0.5">
                Daily Peak Slot Cadence
              </label>
              <select
                value={programDensity}
                onChange={(e) => onSetProgramDensity(e.target.value as PeakProgramDensity)}
                className="px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-emerald-400"
              >
                <option value="3x-daily">3× Daily Peak (10:00 · 12:00 · 18:00)</option>
                <option value="2x-daily">2× Daily Peak (12:00 · 18:00)</option>
                <option value="1x-18">1× Daily Evening Prime (18:00)</option>
                <option value="1x-12">1× Daily Midday Peak (12:00)</option>
                <option value="1x-10">1× Daily Morning Peak (10:00)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-0.5">
                Outline Format
              </label>
              <select
                value={formatFilter}
                onChange={(e) => onSetFormatFilter(e.target.value as 'auto' | PostFormat)}
                className="px-2.5 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white focus:outline-none focus:border-emerald-400"
              >
                <option value="auto">Auto (8-Slide Carousel / 1-Slide)</option>
                <option value="carousel">8-Slide Carousel Outlines</option>
                <option value="single">1-Slide Infographic Outlines</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onSetSelectedCandidateIds((prev) =>
                  prev.length === candidates.length
                    ? []
                    : candidates.map((c) => c.id)
                )
              }
              className="px-2.5 py-1.5 rounded-lg border border-white/15 bg-black/40 hover:bg-white/10 text-xs font-semibold text-slate-200 cursor-pointer"
            >
              {selectedCandidateIds.length === candidates.length && candidates.length > 0
                ? 'Deselect All'
                : `Select All (${candidates.length})`}
            </button>

            <button
              type="button"
              disabled={isAcceptingBatch || selectedCandidateIds.length === 0}
              onClick={onAcceptSelectedBatch}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs cursor-pointer disabled:opacity-50 shadow-md"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isAcceptingBatch
                  ? 'Scheduling into Future Slots...'
                  : `Accept & Schedule ${selectedCandidateIds.length} Post(s)`}
              </span>
            </button>
          </div>
        </div>

        {scanProgressLabel && (
          <div className="px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-400/30 text-xs font-mono text-cyan-200 flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span className="truncate">{scanProgressLabel}</span>
          </div>
        )}
      </div>

      {/* List of Possible Posts from Social Media & RSS Trends */}
      {candidates.length === 0 && !isScanningTrends ? (
        <div className="rounded-2xl border border-white/10 bg-[#0b1218]/90 p-8 text-center space-y-3">
          <Radar className="w-8 h-8 text-cyan-400 mx-auto opacity-80" />
          <div className="text-sm font-bold text-white">
            All current trend candidates have been reviewed or scheduled
          </div>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Click &ldquo;Scan Trends Now&rdquo; to reset dismissed items and scan social/RSS feeds for fresh topics, or paste any article URL above.
          </p>
          <button
            type="button"
            onClick={() => {
              clearDismissedGatherTopicIds();
              onRunBackgroundGatherer(true);
            }}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs cursor-pointer"
          >
            Scan Fresh Social & RSS Trends
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map((candidate, cIdx) => {
            const isSelected = selectedCandidateIds.includes(candidate.id);
            const isExpanded = expandedCandidateId === candidate.id;
            const sched = getCandidateFutureSchedule(candidate.id);
            const palette =
              DEFAULT_PALETTES[candidate.themeId] || DEFAULT_PALETTES.teal;
            const slides = candidate.deck.slides || [];
            const activeSlide =
              slides[Math.min(activeOutlineSlideIdx, Math.max(0, slides.length - 1))];

            return (
              <div
                key={`${candidate.id}_${cIdx}`}
                className={`rounded-2xl border transition-all p-4 space-y-3 ${
                  isSelected
                    ? 'border-cyan-400/45 bg-[#0d1720]/95'
                    : 'border-white/10 bg-[#0b1218]/90 hover:border-white/20'
                }`}
              >
                {/* Top Row: Checkbox + Source Trend Metadata + Future Slot Controls + Accept CTA */}
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() =>
                        onSetSelectedCandidateIds((prev) =>
                          prev.includes(candidate.id)
                            ? prev.filter((id) => id !== candidate.id)
                            : [...prev, candidate.id]
                        )
                      }
                      className={`mt-1 w-5 h-5 rounded-md flex items-center justify-center border cursor-pointer shrink-0 ${
                        isSelected
                          ? 'bg-cyan-400 border-cyan-400 text-slate-950 font-bold'
                          : 'border-white/25 bg-black/40 text-transparent hover:border-white/50'
                      }`}
                      title="Select for batch schedule"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>

                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                        <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-bold uppercase">
                          {candidate.topic.sourceName || candidate.topic.sourceType}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-300 uppercase">
                          {candidate.topic.domainCategory}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-bold uppercase">
                          {candidate.deck.postFormat === 'single'
                            ? '1-Slide Infographic'
                            : `${slides.length}-Slide Carousel`}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full font-bold uppercase border"
                          style={{
                            color: palette.accent,
                            borderColor: `${palette.accent}40`,
                            backgroundColor: `${palette.accent}15`,
                          }}
                        >
                          Theme: {palette.name}
                        </span>
                        {candidate.topic.url && (
                          <a
                            href={candidate.topic.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-cyan-300 flex items-center gap-1 ml-auto"
                            title="Open original trend source article"
                          >
                            <span>Source Link</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      {/* Draft Carousel Title (Editable) */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={candidate.draftTitle}
                          onChange={(e) =>
                            onUpdateCandidateDeck(candidate.id, (prev) => ({
                              ...prev,
                              draftTitle: e.target.value,
                              deck: { ...prev.deck, title: e.target.value },
                            }))
                          }
                          className="w-full bg-transparent text-sm font-extrabold text-white hover:bg-white/[0.04] focus:bg-white/[0.08] px-2 py-1 rounded-lg border border-transparent focus:border-white/20 focus:outline-none transition-colors"
                          placeholder="Draft Post Title"
                        />
                      </div>

                      {slides[0]?.arTitle && (
                        <div className="text-xs text-slate-300 font-arabic px-2" dir="rtl">
                          {slides[0].arTitle}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Future Schedule Allocator (Date + Peak Slot + Platforms) */}
                  <div className="flex flex-wrap items-center gap-2 bg-black/50 p-2 rounded-xl border border-white/10 shrink-0">
                    <div>
                      <input
                        type="date"
                        min={todayStr}
                        value={sched.datePart < todayStr ? todayStr : sched.datePart}
                        onChange={(e) => {
                          const val = e.target.value;
                          onUpdateCandidateSchedule(candidate.id, {
                            datePart: val < todayStr ? todayStr : val,
                          });
                        }}
                        className="px-2 py-1 rounded bg-black/70 border border-white/15 text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                        title="Scheduled Date (Strictly Future)"
                      />
                    </div>

                    <div className="flex items-center bg-black/60 p-0.5 rounded-lg border border-white/15">
                      {DAILY_PEAK_TIME_SLOTS.map((slot) => {
                        const active = sched.timeShort === slot;
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() =>
                              onUpdateCandidateSchedule(candidate.id, {
                                timeShort: slot,
                              })
                            }
                            className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                              active
                                ? 'bg-cyan-500/30 text-cyan-200 shadow-xs'
                                : 'text-slate-400 hover:text-white'
                            }`}
                            title={`Assign to ${slot} Peak Window`}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>

                    {/* Platform Target Toggles */}
                    <div className="flex items-center gap-1">
                      {ALL_PLATFORMS.map((plat) => {
                        const active = sched.targets.includes(plat);
                        const b = PLATFORM_BADGES[plat];
                        return (
                          <button
                            key={plat}
                            type="button"
                            onClick={() => {
                              const next = active
                                ? sched.targets.filter((t) => t !== plat)
                                : [...sched.targets, plat];
                              if (next.length > 0) {
                                onUpdateCandidateSchedule(candidate.id, { targets: next });
                              }
                            }}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                              active
                                ? b.color
                                : 'border-white/10 text-slate-500 hover:text-slate-300'
                            }`}
                            title={`Toggle ${b.label}`}
                          >
                            {b.short}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      disabled={acceptingSingleId === candidate.id}
                      onClick={() => onAcceptSingleCandidate(candidate)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer disabled:opacity-50"
                      title="Accept and schedule this post into the selected future peak slot"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{acceptingSingleId === candidate.id ? 'Scheduling...' : 'Schedule'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDismissCandidate(candidate.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                      title="Dismiss candidate from review queue"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Bottom Row: Slide Outline Quick Chips + Expand Outline Editor */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      Slide Outlines:
                    </span>
                    {slides.map((s, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => {
                          onSetExpandedCandidateId(candidate.id);
                          onSetActiveOutlineSlideIdx(sIdx);
                        }}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono transition-colors cursor-pointer ${
                          isExpanded && activeOutlineSlideIdx === sIdx
                            ? 'bg-cyan-500/25 text-cyan-200 border border-cyan-400/35 font-bold'
                            : 'bg-white/[0.04] text-slate-300 hover:text-white border border-white/10'
                        }`}
                        title={`Slide ${sIdx + 1}: ${s.enTitle || s.type}`}
                      >
                        <span>S{sIdx + 1}</span>
                        <span className="text-slate-400 capitalize">({s.type})</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {onSynthesizeCandidateWithAi && (
                      <button
                        type="button"
                        disabled={synthesizingCandidateId === candidate.id}
                        onClick={() => onSynthesizeCandidateWithAi(candidate)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/35 text-amber-200 text-xs font-semibold cursor-pointer disabled:opacity-50"
                        title="Scrape full article from source URL and synthesize all slides with AI"
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${synthesizingCandidateId === candidate.id ? 'animate-spin' : ''}`} />
                        <span>
                          {synthesizingCandidateId === candidate.id
                            ? 'Scraping & Synthesizing...'
                            : candidate.deck.sourceMeta?.isFallback === false
                            ? 'Re-Synthesize AI'
                            : 'Deep AI Synthesize'}
                        </span>
                      </button>
                    )}

                    {onLoadCandidateIntoStudio && (
                      <button
                        type="button"
                        onClick={() =>
                          onLoadCandidateIntoStudio(
                            candidate.deck,
                            candidate.draftTitle
                          )
                        }
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/30 text-cyan-200 text-xs font-semibold cursor-pointer"
                        title="Load this entire generated deck directly into the 9:16 Create Studio"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Open in Studio</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        onSetExpandedCandidateId(isExpanded ? null : candidate.id)
                      }
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 text-xs font-semibold cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3 text-cyan-400" />
                      <span>{isExpanded ? 'Collapse Outline' : 'Inspect & Edit Outline'}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Inline Editor for Candidate's 8 Slide Outlines & Caption */}
                {isExpanded && activeSlide && (
                  <div className="p-3 rounded-xl border border-cyan-400/25 bg-black/60 space-y-3 animate-fade-in">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        <span>
                          Editing Outline for Slide {activeOutlineSlideIdx + 1} of{' '}
                          {slides.length} ({activeSlide.type.toUpperCase()}
                          {activeSlide.type === 'row' && activeSlide.diagramVariant
                            ? ` · ${activeSlide.diagramVariant.toUpperCase()}`
                            : ''}
                          )
                        </span>
                      </span>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label="Slide Archetype"
                          value={activeSlide.type}
                          onChange={(e) => {
                            const newType = e.target.value as SlideType;
                            onUpdateCandidateDeck(candidate.id, (prev) => {
                              const nextSlides = [...(prev.deck.slides || [])];
                              if (nextSlides[activeOutlineSlideIdx]) {
                                nextSlides[activeOutlineSlideIdx] = seedSlideArchetypeData(
                                  nextSlides[activeOutlineSlideIdx],
                                  newType,
                                  activeOutlineSlideIdx,
                                  true
                                );
                              }
                              return { ...prev, deck: { ...prev.deck, slides: nextSlides } };
                            });
                            onShowToast(`Switched Slide ${activeOutlineSlideIdx + 1} to ${newType.toUpperCase()}`);
                          }}
                          className="px-2 py-1 rounded-lg bg-black/80 border border-white/15 text-[11px] font-mono text-cyan-200"
                        >
                          <option value="hub">Archetype: Hub</option>
                          <option value="row">Archetype: Diagram (Row)</option>
                          <option value="compare">Archetype: Compare</option>
                          <option value="code">Archetype: Code Diff</option>
                          <option value="metric">Archetype: Metric</option>
                          <option value="number">Archetype: Step Number</option>
                          <option value="image">Archetype: Media / Meme</option>
                          <option value="cta">Archetype: CTA</option>
                        </select>

                        {(activeSlide.type === 'row' || activeSlide.type === 'poster') && (
                          <select
                            aria-label="Diagram Variant"
                            value={activeSlide.diagramVariant || 'topology'}
                            onChange={(e) => {
                              const newVariant = e.target.value as DiagramVariant;
                              onUpdateCandidateDeck(candidate.id, (prev) => {
                                const nextSlides = [...(prev.deck.slides || [])];
                                const curr = nextSlides[activeOutlineSlideIdx];
                                if (curr) {
                                  const smart = resolveSmartSlideVisuals(
                                    { ...curr, diagramVariant: newVariant },
                                    activeOutlineSlideIdx,
                                    true
                                  );
                                  nextSlides[activeOutlineSlideIdx] = {
                                    ...curr,
                                    diagramVariant: newVariant,
                                    diagramNodes: smart.diagramNodes,
                                    diagramEdges: smart.diagramEdges,
                                    diagramFooter: smart.diagramFooter,
                                  };
                                }
                                return { ...prev, deck: { ...prev.deck, slides: nextSlides } };
                              });
                              onShowToast(`Switched diagram schematic to ${newVariant.toUpperCase()}`);
                            }}
                            className="px-2 py-1 rounded-lg bg-black/80 border border-white/15 text-[11px] font-mono text-emerald-200"
                          >
                            <option value="topology">Variant: Topology</option>
                            <option value="isolation">Variant: Isolation</option>
                            <option value="clusters">Variant: Clusters</option>
                            <option value="split">Variant: Hot/Cold Split</option>
                            <option value="features">Variant: Features</option>
                            <option value="stack">Variant: Layered Stack</option>
                            <option value="graph">Variant: Skip Graph</option>
                            <option value="scatter">Variant: Vector Scatter</option>
                            <option value="takeaway">Variant: Takeaway</option>
                          </select>
                        )}

                        {slides.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateCandidateDeck(candidate.id, (prev) => ({
                                ...prev,
                                deck: {
                                  ...prev.deck,
                                  slides: diversifyDeckArchetypesAndVisuals(prev.deck.slides || []),
                                },
                              }));
                              onShowToast('✨ Diversified Slides 2–7 across Compare, Code, Metric & Schematic layouts');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/35 text-[11px] font-bold text-amber-200 cursor-pointer"
                            title="Auto-diversify Slides 2–7 across Compare, Code, Metric, and varied Diagram schematics"
                          >
                            Diversify Slides 2–7
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                          English Slide Title
                        </label>
                        <input
                          type="text"
                          value={activeSlide.enTitle || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            onUpdateCandidateDeck(candidate.id, (prev) => {
                              const nextSlides = [...(prev.deck.slides || [])];
                              if (nextSlides[activeOutlineSlideIdx]) {
                                nextSlides[activeOutlineSlideIdx] = {
                                  ...nextSlides[activeOutlineSlideIdx],
                                  enTitle: val,
                                };
                              }
                              return { ...prev, deck: { ...prev.deck, slides: nextSlides } };
                            });
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-black/80 border border-white/15 text-xs text-white"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                          Arabic Slide Title (RTL)
                        </label>
                        <input
                          type="text"
                          dir="rtl"
                          value={activeSlide.arTitle || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            onUpdateCandidateDeck(candidate.id, (prev) => {
                              const nextSlides = [...(prev.deck.slides || [])];
                              if (nextSlides[activeOutlineSlideIdx]) {
                                nextSlides[activeOutlineSlideIdx] = {
                                  ...nextSlides[activeOutlineSlideIdx],
                                  arTitle: val,
                                };
                              }
                              return { ...prev, deck: { ...prev.deck, slides: nextSlides } };
                            });
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-black/80 border border-white/15 text-xs text-white font-arabic"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                          English Bullet Copy
                        </label>
                        <textarea
                          rows={2}
                          value={activeSlide.enBody || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            onUpdateCandidateDeck(candidate.id, (prev) => {
                              const nextSlides = [...(prev.deck.slides || [])];
                              if (nextSlides[activeOutlineSlideIdx]) {
                                nextSlides[activeOutlineSlideIdx] = {
                                  ...nextSlides[activeOutlineSlideIdx],
                                  enBody: val,
                                };
                              }
                              return { ...prev, deck: { ...prev.deck, slides: nextSlides } };
                            });
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-black/80 border border-white/15 text-xs text-slate-200 resize-none"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                          Arabic Bullet Copy (RTL)
                        </label>
                        <textarea
                          rows={2}
                          dir="rtl"
                          value={activeSlide.arBody || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            onUpdateCandidateDeck(candidate.id, (prev) => {
                              const nextSlides = [...(prev.deck.slides || [])];
                              if (nextSlides[activeOutlineSlideIdx]) {
                                nextSlides[activeOutlineSlideIdx] = {
                                  ...nextSlides[activeOutlineSlideIdx],
                                  arBody: val,
                                };
                              }
                              return { ...prev, deck: { ...prev.deck, slides: nextSlides } };
                            });
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-black/80 border border-white/15 text-xs text-slate-200 font-arabic resize-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
