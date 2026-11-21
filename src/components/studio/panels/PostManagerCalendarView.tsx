import React from 'react';
import {
  Clock,
  Edit3,
  Plus,
  RotateCcw,
} from 'lucide-react';
import type {
  SavedPostRecord,
} from '../../../types.ts';
import type { PostLifecycleStage } from '../../../lib/publish/publishClient.ts';

export interface CalendarDayItem {
  post: SavedPostRecord;
  stage: PostLifecycleStage;
  timeShort: string;
}

export interface CalendarDayData {
  dateStr: string;
  dayLabel: string;
  subLabel: string;
  isToday: boolean;
  items: CalendarDayItem[];
}

export interface PostManagerCalendarViewProps {
  calendarDaysCount: 7 | 14;
  setCalendarDaysCount: (count: 7 | 14) => void;
  calendarDays: CalendarDayData[];
  onEditInStudio: (post: SavedPostRecord) => void;
  onReschedule: (post: SavedPostRecord) => void;
  onPublishPostNow?: (post: SavedPostRecord) => Promise<void> | void;
  publishingPostId?: string | null;
  busyPostId?: string | null;
  onUnscheduleToDraft: (post: SavedPostRecord) => void;
  assigningDateStr: string | null;
  setAssigningDateStr: (dateStr: string | null) => void;
  reviewedReadyDrafts: SavedPostRecord[];
  onAssignDraft: (post: SavedPostRecord, dateStr: string, timeStr: string) => Promise<void> | void;
}

export const PostManagerCalendarView: React.FC<PostManagerCalendarViewProps> = ({
  calendarDaysCount,
  setCalendarDaysCount,
  calendarDays,
  onEditInStudio,
  onReschedule,
  onPublishPostNow,
  publishingPostId,
  busyPostId,
  onUnscheduleToDraft,
  assigningDateStr,
  setAssigningDateStr,
  reviewedReadyDrafts,
  onAssignDraft,
}) => {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0b1218]/90 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
          Schedule Calendar (Recommended 1–2 Posts / Day)
        </span>
        <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-lg border border-white/10">
          <button
            type="button"
            onClick={() => setCalendarDaysCount(7)}
            className={`px-2.5 py-1 rounded text-xs font-mono font-bold cursor-pointer ${
              calendarDaysCount === 7
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            7 Days
          </button>
          <button
            type="button"
            onClick={() => setCalendarDaysCount(14)}
            className={`px-2.5 py-1 rounded text-xs font-mono font-bold cursor-pointer ${
              calendarDaysCount === 14
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            14 Days
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2.5">
        {calendarDays.map((day) => {
          const overCap = day.items.length > 2;
          return (
            <div
              key={day.dateStr}
              className={`rounded-xl border p-3 flex flex-col justify-between min-h-[160px] transition-colors ${
                overCap
                  ? 'border-amber-400/50 bg-amber-500/[0.06]'
                  : day.isToday
                  ? 'border-emerald-400/40 bg-emerald-500/[0.05]'
                  : 'border-white/10 bg-black/30'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-1 border-b border-white/5 pb-1.5">
                  <span
                    className={`text-xs font-bold ${
                      day.isToday ? 'text-emerald-300' : 'text-white'
                    }`}
                  >
                    {day.dayLabel}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                    {day.subLabel}
                  </span>
                </div>

                {overCap && (
                  <div className="text-[10px] font-mono font-bold text-amber-300">
                    ⚠️ {day.items.length} posts (&gt;2/day cap)
                  </div>
                )}

                {day.items.length === 0 ? (
                  <div className="py-4 text-center text-[11px] text-slate-500">
                    Open slot (10/12/18)
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {day.items.map(({ post, stage, timeShort }) => (
                      <div
                        key={post.id}
                        className={`rounded-lg border p-2 text-xs space-y-1 ${
                          stage === 'scheduled'
                            ? 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
                            : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono font-bold text-[10px] tabular-nums">
                            {timeShort}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              title="Edit in Studio"
                              onClick={() => onEditInStudio(post)}
                              className="hover:text-white cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              title="Reschedule"
                              onClick={() => onReschedule(post)}
                              className="hover:text-white cursor-pointer"
                            >
                              <Clock className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div className="font-semibold truncate" title={post.title}>
                          {post.title}
                        </div>
                        {stage === 'scheduled' && (
                          <div className="flex items-center gap-1 pt-0.5">
                            {onPublishPostNow && (
                              <button
                                type="button"
                                disabled={publishingPostId === post.id || busyPostId === post.id}
                                onClick={() => void onPublishPostNow(post)}
                                className="flex-1 py-1 px-1.5 rounded bg-emerald-500/25 hover:bg-emerald-500/35 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold cursor-pointer"
                              >
                                {publishingPostId === post.id ? '...' : 'Publish Now'}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyPostId === post.id}
                              onClick={() => onUnscheduleToDraft(post)}
                              className="py-1 px-1.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-[10px] font-bold cursor-pointer"
                              title="Move back to Draft"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick "+ Schedule Verified Draft" */}
              <div className="pt-2 mt-2 border-t border-white/5">
                {assigningDateStr === day.dateStr ? (
                  <div className="space-y-1">
                    {reviewedReadyDrafts.length === 0 ? (
                      <div className="text-[10px] text-amber-300">
                        No reviewed &amp; claims-verified drafts ready
                      </div>
                    ) : (
                      <select
                        aria-label={`Assign verified draft to ${day.dateStr}`}
                        defaultValue=""
                        onChange={(e) => {
                          const picked = reviewedReadyDrafts.find(
                            (d) => d.id === e.target.value
                          );
                          if (picked) {
                            void onAssignDraft(picked, day.dateStr, '18:00');
                          }
                        }}
                        className="w-full px-2 py-1 rounded bg-black/80 border border-cyan-400/40 text-[11px] text-white focus:outline-none"
                      >
                        <option value="" disabled>
                          Pick verified draft...
                        </option>
                        {reviewedReadyDrafts.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.title.slice(0, 32)}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => setAssigningDateStr(null)}
                      className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAssigningDateStr(day.dateStr)}
                    className="w-full flex items-center justify-center gap-1 py-1 rounded-md text-[11px] font-semibold text-slate-400 hover:text-cyan-300 hover:bg-white/[0.04] transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Assign Draft</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
