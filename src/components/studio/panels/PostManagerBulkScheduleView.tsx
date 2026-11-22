import React from 'react';
import type { SavedPostRecord } from '../../../types.ts';
import {
  getLocalTodayDateStr,
  WeeklyCadencePreset,
} from '../../../lib/publish/publishClient.ts';

export interface PostManagerBulkScheduleViewProps {
  bulkStartDate: string;
  setBulkStartDate: (d: string) => void;
  bulkCadence: WeeklyCadencePreset;
  setBulkCadence: (c: WeeklyCadencePreset) => void;
  bulkTimeStr: string;
  setBulkTimeStr: (t: string) => void;
  reviewedReadyDrafts: SavedPostRecord[];
  selectedBulkIds: string[];
  setSelectedBulkIds: React.Dispatch<React.SetStateAction<string[]>>;
  bulkSlots: Array<{ datePart: string; timePart: string }>;
  isBulkBusy: boolean;
  onApplyBulkSchedule: () => Promise<void> | void;
}

export const PostManagerBulkScheduleView: React.FC<PostManagerBulkScheduleViewProps> = ({
  bulkStartDate,
  setBulkStartDate,
  bulkCadence,
  setBulkCadence,
  bulkTimeStr,
  setBulkTimeStr,
  reviewedReadyDrafts,
  selectedBulkIds,
  setSelectedBulkIds,
  bulkSlots,
  isBulkBusy,
  onApplyBulkSchedule,
}) => {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0b1218]/90 p-4 space-y-4">
      <div className="text-xs text-slate-300">
        Only Drafts with both <strong className="text-emerald-300">Human Reviewed</strong> and{' '}
        <strong className="text-emerald-300">Claims &amp; Numbers Verified</strong> checked appear here (default safe cadence: 1 post/slot per day).
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-slate-300 mb-1">
            Start Date (Local)
          </label>
          <input
            type="date"
            value={bulkStartDate}
            min={getLocalTodayDateStr()}
            onChange={(e) => setBulkStartDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-300 mb-1">
            Posting Cadence (Recommended 1–2/day)
          </label>
          <select
            value={bulkCadence}
            onChange={(e) => setBulkCadence(e.target.value as WeeklyCadencePreset)}
            className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
          >
            <option value="daily">1× Daily (Safe Default)</option>
            <option value="weekdays">Weekdays (Mon–Fri)</option>
            <option value="mon-wed-fri">Mon / Wed / Fri</option>
            <option value="tue-thu-sat">Tue / Thu / Sat</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-300 mb-1">
            Peak Posting Time (24h)
          </label>
          <input
            type="time"
            value={bulkTimeStr}
            onChange={(e) => setBulkTimeStr(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/15 text-xs text-white focus:outline-none focus:border-cyan-400"
          />
        </div>
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {reviewedReadyDrafts.length === 0 ? (
          <div className="p-4 rounded-lg border border-dashed border-white/15 text-center text-xs text-slate-400">
            No verified drafts yet. Open the <strong>Draft</strong> tab and check &ldquo;Human Reviewed&rdquo; + &ldquo;Claims &amp; Numbers Verified&rdquo;.
          </div>
        ) : (
          reviewedReadyDrafts.map((post) => {
            const checked = selectedBulkIds.includes(post.id);
            const orderIdx = selectedBulkIds.indexOf(post.id);
            const assignedSlot = orderIdx >= 0 ? bulkSlots[orderIdx] : null;
            return (
              <div
                key={post.id}
                onClick={() =>
                  setSelectedBulkIds((prev) =>
                    prev.includes(post.id)
                      ? prev.filter((id) => id !== post.id)
                      : [...prev, post.id]
                  )
                }
                className={`p-3 rounded-lg border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                  checked
                    ? 'border-cyan-400/40 bg-cyan-500/10'
                    : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold ${
                      checked
                        ? 'bg-cyan-400 text-slate-950'
                        : 'border border-white/25 text-transparent'
                    }`}
                  >
                    {checked ? orderIdx + 1 : ''}
                  </div>
                  <span className="text-xs font-bold text-white truncate">
                    {post.title}
                  </span>
                </div>
                {assignedSlot && (
                  <span className="text-[11px] font-mono text-cyan-300 tabular-nums shrink-0">
                    {assignedSlot.datePart} · {assignedSlot.timePart.slice(0, 5)}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/10">
        <button
          type="button"
          disabled={isBulkBusy || selectedBulkIds.length === 0}
          onClick={() => void onApplyBulkSchedule()}
          className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-40"
        >
          {isBulkBusy
            ? 'Scheduling...'
            : `Schedule ${selectedBulkIds.length} Verified Draft(s)`}
        </button>
      </div>
    </div>
  );
};
