import React from 'react';
import {
  AlertTriangle,
  Calendar,
  CalendarDays,
  Download,
  List,
  Search,
  Upload,
  X,
} from 'lucide-react';

export type StatusFilterTab = 'all' | 'draft' | 'scheduled' | 'posted' | 'attention';
export type ManagerViewMode = 'list' | 'calendar' | 'bulk';

export interface PostManagerFilterBarProps {
  mode: 'draft' | 'schedule' | 'all';
  viewMode: ManagerViewMode;
  setViewMode: (v: ManagerViewMode) => void;
  statusTab: StatusFilterTab;
  setStatusTab: (tab: StatusFilterTab) => void;
  counts: {
    all: number;
    draft: number;
    scheduled: number;
    posted: number;
    attention: number;
  };
  draftReadinessFilter: 'all' | 'needs_review' | 'ready';
  setDraftReadinessFilter: (f: 'all' | 'needs_review' | 'ready') => void;
  draftAndReviewCount: number;
  draftNeedsReviewCount: number;
  reviewedReadyDraftsCount: number;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedBulkIdsCount: number;
  onExportVaultJson?: () => void;
  onImportVaultJson?: (file: File) => void;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  cadenceOverloadDays: Array<{ datePart: string; count: number }>;
  onSelectBulkMode: () => void;
}

export const PostManagerFilterBar: React.FC<PostManagerFilterBarProps> = ({
  mode,
  viewMode,
  setViewMode,
  statusTab,
  setStatusTab,
  counts,
  draftReadinessFilter,
  setDraftReadinessFilter,
  draftAndReviewCount,
  draftNeedsReviewCount,
  reviewedReadyDraftsCount,
  searchQuery,
  setSearchQuery,
  onExportVaultJson,
  onImportVaultJson,
  importInputRef,
  cadenceOverloadDays,
  onSelectBulkMode,
}) => {
  return (
    <>
      {/* Cadence Overload Warning Banner (>2 posts/day warning in Schedule or All view) */}
      {(mode === 'schedule' || mode === 'all') && cadenceOverloadDays.length > 0 && (
        <div
          data-testid="cadence-overload-warning"
          className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-100"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
            <span>
              <strong className="font-bold">Cadence Warning (&gt;2 posts/day):</strong>{' '}
              {cadenceOverloadDays
                .map((d) => `${d.datePart} has ${d.count} posts`)
                .join(' · ')}{' '}
              — recommended cadence is 1–2 posts/day.
            </span>
          </div>
        </div>
      )}

      {/* Single Clean Control Bar */}
      <div className="rounded-xl border border-white/10 bg-[#0b1218]/95 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {mode === 'schedule' ? (
            <div className="flex flex-wrap items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/10">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'list'
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Queue ({counts.scheduled})</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'calendar'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Calendar (7/14d)</span>
              </button>
              <button
                type="button"
                onClick={onSelectBulkMode}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'bulk'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Bulk Schedule ({reviewedReadyDraftsCount} verified)</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-xs font-extrabold text-white whitespace-nowrap">
                {mode === 'draft'
                  ? `Draft Review Queue`
                  : `All Posts (${counts.all})`}
              </div>

              {mode === 'draft' && (
                <div
                  role="tablist"
                  aria-label="Draft readiness filter"
                  className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10"
                >
                  {(
                    [
                      { id: 'all', label: 'All', count: draftAndReviewCount },
                      {
                        id: 'needs_review',
                        label: 'Needs Review',
                        count: draftNeedsReviewCount,
                      },
                      {
                        id: 'ready',
                        label: 'Ready to Ship',
                        count: reviewedReadyDraftsCount,
                      },
                    ] as const
                  ).map((f) => {
                    const active = draftReadinessFilter === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-testid={`draft-filter-${f.id}`}
                        onClick={() => setDraftReadinessFilter(f.id)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? f.id === 'ready'
                              ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                              : 'bg-white/12 text-white border border-white/20'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        <span>{f.label}</span>
                        <span className="ml-1 font-mono tabular-nums text-[11px] text-slate-400">
                          {f.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Search (Backup/Restore live in Vault drawer, kept only in legacy all mode) */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {viewMode === 'list' && (
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={mode === 'draft' ? 'Search drafts...' : 'Search posts...'}
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-black/40 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {mode === 'all' && onExportVaultJson && (
              <button
                type="button"
                onClick={onExportVaultJson}
                title="Export all posts as JSON backup"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 text-xs font-semibold cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Backup</span>
              </button>
            )}
            {mode === 'all' && onImportVaultJson && (
              <>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onImportVaultJson(file);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  title="Import posts from JSON backup"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 text-xs font-semibold cursor-pointer shrink-0 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Restore</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Status Filter Strip (Schedule view or All view) */}
        {viewMode === 'list' && mode !== 'draft' && (
          <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-white/[0.08]">
            {(mode === 'schedule'
              ? ([
                  { id: 'scheduled', label: 'Scheduled', count: counts.scheduled },
                  { id: 'posted', label: 'Posted', count: counts.posted },
                  {
                    id: 'all',
                    label: 'All Scheduled & Posted',
                    count: counts.scheduled + counts.posted,
                  },
                ] as const)
              : ([
                  { id: 'all', label: 'All', count: counts.all },
                  { id: 'draft', label: 'Drafts', count: counts.draft },
                  { id: 'scheduled', label: 'Scheduled', count: counts.scheduled },
                  { id: 'posted', label: 'Posted', count: counts.posted },
                  { id: 'attention', label: 'Needs Review', count: counts.attention },
                ] as const)
            ).map((tab) => {
              const active = statusTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap border ${
                    active
                      ? tab.id === 'attention'
                        ? 'bg-rose-500/20 text-rose-200 border-rose-400/40'
                        : tab.id === 'scheduled'
                        ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/40'
                        : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                      : 'bg-black/20 text-slate-400 border-white/10 hover:text-white'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-300">
                    · {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};
