import React from 'react';
import { Edit3, Layers, RotateCcw, Plus } from 'lucide-react';
import { SavedPostRecord, SlideData } from '../../../types.ts';
import {
  DAILY_PEAK_TIME_SLOTS,
  PEAK_SLOT_META,
  PeakTimeSlot,
} from '../../../lib/publish/publishClient.ts';
import { GatheredCandidatePost } from '../../../lib/gather/gatherClient.ts';

export interface PeakBoardDaySlot {
  dateStr: string;
  dayLabel: string;
  subLabel: string;
  isToday: boolean;
  peakSlots: Record<
    PeakTimeSlot,
    {
      isFuture: boolean;
      items: {
        post: SavedPostRecord;
        stage: string;
        timeShort: string;
      }[];
    }
  >;
}

export interface PeakScheduleBoardViewProps {
  boardDays: PeakBoardDaySlot[];
  boardDaysCount: 7 | 14;
  onSetBoardDaysCount: (days: 7 | 14) => void;
  assigningSlotKey: string | null;
  onSetAssigningSlotKey: (key: string | null) => void;
  busyPostId: string | null;
  candidates: GatheredCandidatePost[];
  onEditInStudio: (post: SavedPostRecord) => void;
  onUnschedulePost: (post: SavedPostRecord) => void;
  onAssignCandidateToSlot: (candidate: GatheredCandidatePost, dateStr: string, peakTime: PeakTimeSlot) => void;
  editingScheduledPostId: string | null;
  editScheduledTitle: string;
  editScheduledSlides: SlideData[];
  editScheduledSlideIdx: number;
  isSavingScheduledEdit: boolean;
  onStartEditingScheduledPost: (post: SavedPostRecord) => void;
  onCancelEditingScheduledPost: () => void;
  onSaveScheduledPostEdit: (post: SavedPostRecord) => void;
  onSetEditScheduledTitle: (title: string) => void;
  onSetEditScheduledSlideIdx: (idx: number) => void;
  onUpdateEditScheduledSlideTitle: (idx: number, title: string) => void;
}

export const PeakScheduleBoardView: React.FC<PeakScheduleBoardViewProps> = ({
  boardDays,
  boardDaysCount,
  onSetBoardDaysCount,
  assigningSlotKey,
  onSetAssigningSlotKey,
  busyPostId,
  candidates,
  onEditInStudio,
  onUnschedulePost,
  onAssignCandidateToSlot,
  editingScheduledPostId,
  editScheduledTitle,
  editScheduledSlides,
  editScheduledSlideIdx,
  isSavingScheduledEdit,
  onStartEditingScheduledPost,
  onCancelEditingScheduledPost,
  onSaveScheduledPostEdit,
  onSetEditScheduledTitle,
  onSetEditScheduledSlideIdx,
  onUpdateEditScheduledSlideTitle,
}) => {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b1218]/95 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-white">
            Daily Peak-Hour Schedule Review (10:00 · 12:00 · 18:00)
          </h3>
          <p className="text-xs text-slate-400">
            Review and manage your scheduled posts across the 3 daily high-engagement windows. Past windows on Today are locked so you never schedule in the past.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
          {([7, 14] as const).map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => onSetBoardDaysCount(days)}
              className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                boardDaysCount === days
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Next {days} Days
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {boardDays.map((day) => (
          <div
            key={day.dateStr}
            className={`rounded-xl border p-3.5 space-y-3 ${
              day.isToday
                ? 'border-cyan-400/35 bg-cyan-500/[0.04]'
                : 'border-white/10 bg-black/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-white">
                  {day.dayLabel}
                </span>
                <span className="text-xs font-mono text-slate-400 tabular-nums">
                  {day.subLabel} ({day.dateStr})
                </span>
              </div>
            </div>

            {/* 3-Column Peak Slots Grid: 10:00 | 12:00 | 18:00 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {DAILY_PEAK_TIME_SLOTS.map((peakTime) => {
                const slotData = day.peakSlots[peakTime];
                const meta = PEAK_SLOT_META[peakTime];
                const slotKey = `${day.dateStr}|${peakTime}`;

                return (
                  <div
                    key={peakTime}
                    className={`rounded-xl border p-3 space-y-2 ${
                      !slotData.isFuture && slotData.items.length === 0
                        ? 'border-white/5 bg-black/20 opacity-60'
                        : 'border-white/10 bg-[#0b1218]/90'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-cyan-300 tabular-nums">
                        {meta.label}
                      </span>
                      {!slotData.isFuture && (
                        <span className="text-[10px] font-mono text-slate-500">
                          Window Passed
                        </span>
                      )}
                    </div>

                    {slotData.items.length > 0 ? (
                      <div className="space-y-2">
                        {slotData.items.map(({ post, stage, timeShort }) => (
                          <div
                            key={post.id}
                            className="p-2.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                              <span className="text-emerald-300 font-bold tabular-nums">
                                {timeShort} · {stage.toUpperCase()}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onStartEditingScheduledPost(post)}
                                  className="text-slate-300 hover:text-white cursor-pointer"
                                  title="Inline Edit Title & Slides"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onEditInStudio(post)}
                                  className="text-cyan-300 hover:text-white cursor-pointer"
                                  title="Open in 9:16 Studio Canvas"
                                >
                                  <Layers className="w-3 h-3" />
                                </button>
                                {stage === 'scheduled' && (
                                  <button
                                    type="button"
                                    disabled={busyPostId === post.id}
                                    onClick={() => onUnschedulePost(post)}
                                    className="text-amber-300 hover:text-rose-300 cursor-pointer disabled:opacity-50"
                                    title="Unschedule post"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="text-xs font-bold text-white line-clamp-2">
                              {post.title}
                            </div>

                            {editingScheduledPostId === post.id && (
                              <div className="pt-2 mt-2 border-t border-white/15 space-y-2">
                                <input
                                  type="text"
                                  value={editScheduledTitle}
                                  onChange={(e) => onSetEditScheduledTitle(e.target.value)}
                                  className="w-full px-2 py-1 rounded bg-black/60 border border-white/15 text-xs text-white"
                                  placeholder="Post Title"
                                />
                                {editScheduledSlides.length > 0 && (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1 overflow-x-auto">
                                      {editScheduledSlides.map((_, sIdx) => (
                                        <button
                                          key={sIdx}
                                          type="button"
                                          onClick={() => onSetEditScheduledSlideIdx(sIdx)}
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                            editScheduledSlideIdx === sIdx
                                              ? 'bg-cyan-500/30 text-cyan-200'
                                              : 'bg-black/40 text-slate-400'
                                          }`}
                                        >
                                          S{sIdx + 1}
                                        </button>
                                      ))}
                                    </div>
                                    <input
                                      type="text"
                                      value={
                                        editScheduledSlides[editScheduledSlideIdx]?.enTitle ||
                                        ''
                                      }
                                      onChange={(e) =>
                                        onUpdateEditScheduledSlideTitle(
                                          editScheduledSlideIdx,
                                          e.target.value
                                        )
                                      }
                                      className="w-full px-2 py-1 rounded bg-black/60 border border-white/15 text-[11px] text-white"
                                    />
                                  </div>
                                )}
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={onCancelEditingScheduledPost}
                                    className="px-2 py-1 rounded text-[10px] text-slate-300 cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isSavingScheduledEdit}
                                    onClick={() => onSaveScheduledPostEdit(post)}
                                    className="px-2.5 py-1 rounded bg-emerald-500 text-slate-950 font-bold text-[10px] cursor-pointer disabled:opacity-50"
                                  >
                                    {isSavingScheduledEdit ? 'Saving...' : 'Save'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : slotData.isFuture ? (
                      assigningSlotKey === slotKey ? (
                        <div className="space-y-1.5">
                          {candidates.length > 0 && (
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                const picked = candidates.find(
                                  (c) => c.id === e.target.value
                                );
                                if (picked) {
                                  onAssignCandidateToSlot(picked, day.dateStr, peakTime);
                                  onSetAssigningSlotKey(null);
                                }
                              }}
                              className="w-full px-2 py-1 rounded bg-black/70 border border-cyan-400/40 text-[11px] text-white"
                            >
                              <option value="" disabled>
                                Pick a Gathered Trend Post...
                              </option>
                              {candidates.map((c) => (
                                <option key={c.id} value={c.id}>
                                  [Trend] {c.draftTitle.slice(0, 38)}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            type="button"
                            onClick={() => onSetAssigningSlotKey(null)}
                            className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSetAssigningSlotKey(slotKey)}
                          className="w-full py-2 rounded-lg border border-dashed border-white/15 hover:border-cyan-400/40 text-[11px] font-semibold text-slate-400 hover:text-cyan-200 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Schedule into {peakTime}</span>
                        </button>
                      )
                    ) : (
                      <div className="py-2 text-center text-[11px] font-mono text-slate-500">
                        Past window — locked
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
