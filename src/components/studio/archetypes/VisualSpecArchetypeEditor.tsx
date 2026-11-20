import React, { useState } from 'react';
import {
  BarChart3,
  GitCommitHorizontal,
  Clock,
  Grid2x2,
  Table2,
  Quote,
  Code2,
  Plus,
  Trash2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Star,
  ChevronDown,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  SlideData,
  SlideVisualSpec,
  ThemePalette,
  VisualBarItem,
  VisualMatrixQuadrant,
  VisualSequenceStep,
  VisualSpecKind,
  VisualTimelineEvent,
} from '../../../types.ts';
import {
  SVG_BLUEPRINT_PRESETS,
  SVG_THEME_TOKENS,
  sanitizeSvgBlueprintMarkup,
} from '../../../lib/canvas/svgBlueprint.ts';
import {
  VISUAL_SPEC_KIND_LABELS,
  deriveVisualSpecFromSlide,
} from '../../../lib/synthesis/visualSpecBuilder.ts';

export interface VisualSpecArchetypeEditorProps {
  currentSlide: SlideData;
  currentSlideIndex: number;
  theme: ThemePalette;
  onUpdateField: (field: keyof SlideData, value: any) => void;
  hideModeSwitcher?: boolean;
}

const VISUAL_MODES: {
  kind: VisualSpecKind;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}[] = [
  { kind: 'bar-chart', label: VISUAL_SPEC_KIND_LABELS['bar-chart'], icon: BarChart3 },
  { kind: 'sequence', label: VISUAL_SPEC_KIND_LABELS.sequence, icon: GitCommitHorizontal },
  { kind: 'timeline', label: VISUAL_SPEC_KIND_LABELS.timeline, icon: Clock },
  { kind: 'matrix', label: VISUAL_SPEC_KIND_LABELS.matrix, icon: Grid2x2 },
  { kind: 'table', label: VISUAL_SPEC_KIND_LABELS.table, icon: Table2 },
  { kind: 'callout', label: VISUAL_SPEC_KIND_LABELS.callout, icon: Quote },
  { kind: 'svg', label: VISUAL_SPEC_KIND_LABELS.svg, icon: Code2 },
];

const QUADRANT_POSITIONS = [
  'Top-Left (Low X · High Y)',
  'Top-Right (High X · High Y)',
  'Bottom-Left (Low X · Low Y)',
  'Bottom-Right (High X · Low Y)',
];

const INPUT_CLS =
  'w-full bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400/50 transition-colors';
const LABEL_CLS = 'block text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 mb-1';

function hasKindPayload(spec: SlideVisualSpec, kind: VisualSpecKind): boolean {
  switch (kind) {
    case 'bar-chart':
      return Boolean(spec.bars && spec.bars.length > 0);
    case 'sequence':
      return Boolean(spec.actors && spec.actors.length >= 2 && spec.steps && spec.steps.length > 0);
    case 'timeline':
      return Boolean(spec.events && spec.events.length > 0);
    case 'matrix':
      return Boolean(spec.quadrants && spec.quadrants.length >= 4);
    case 'table':
      return Boolean(spec.columns && spec.columns.length >= 2 && spec.rows && spec.rows.length > 0);
    case 'callout':
      return Boolean(spec.quote?.trim() || spec.statValue?.trim());
    case 'svg':
      return Boolean(spec.svgCode?.trim());
  }
}

export const VisualSpecArchetypeEditor: React.FC<VisualSpecArchetypeEditorProps> = ({
  currentSlide,
  currentSlideIndex,
  theme,
  onUpdateField,
  hideModeSwitcher = false,
}) => {
  const [isMetaOpen, setIsMetaOpen] = useState(false);

  const spec: SlideVisualSpec =
    currentSlide.visualSpec || deriveVisualSpecFromSlide(currentSlide, undefined, currentSlideIndex);

  const commitSpec = (patch: Partial<SlideVisualSpec>) => {
    onUpdateField('visualSpec', {
      ...spec,
      ...patch,
    });
  };

  const handleSelectKind = (nextKind: VisualSpecKind) => {
    if (nextKind === spec.kind) return;
    if (hasKindPayload(spec, nextKind)) {
      commitSpec({ kind: nextKind });
      return;
    }
    const derived = deriveVisualSpecFromSlide(currentSlide, nextKind, currentSlideIndex);
    // Preserve existing other-mode fields so switching modes back never loses edits
    onUpdateField('visualSpec', {
      ...spec,
      ...derived,
      kind: nextKind,
    });
  };

  const handleAutoFillFromCopy = () => {
    const derived = deriveVisualSpecFromSlide(currentSlide, spec.kind, currentSlideIndex);
    onUpdateField('visualSpec', {
      ...spec,
      ...derived,
      kind: spec.kind,
    });
  };

  const svgValidation =
    spec.kind === 'svg' ? sanitizeSvgBlueprintMarkup(spec.svgCode || '', spec.viewBox) : null;

  return (
    <div
      data-testid="visual-spec-editor"
      className="space-y-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"
    >
      {/* Compact Header + Auto-Fill */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-200">
          {VISUAL_SPEC_KIND_LABELS[spec.kind]} Data
        </span>
        <button
          type="button"
          data-testid="visual-spec-autofill-btn"
          onClick={handleAutoFillFromCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-medium text-slate-200 transition-colors cursor-pointer"
          title="Re-derive visual items directly from this slide's headline and body text"
        >
          <Sparkles className="w-3 h-3" style={{ color: theme.accent }} />
          <span>Auto-Fill from Copy</span>
        </button>
      </div>

      {/* Optional 7-Mode Segmented Switcher (shown when rendered standalone; hidden inside Visual Gallery Studio flow) */}
      {!hideModeSwitcher && (
        <div
          role="tablist"
          aria-label="Visual Engine Modes"
          className="grid grid-cols-2 sm:grid-cols-4 gap-1 bg-black/60 p-1 rounded-lg border border-white/10"
        >
          {VISUAL_MODES.map(({ kind, label, icon: Icon }) => {
            const isActive = spec.kind === kind;
            return (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-testid={`visual-mode-${kind}`}
                onClick={() => handleSelectKind(kind)}
                className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-white/15 text-white border border-white/25'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <Icon
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: isActive ? theme.accent : undefined }}
                />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* MODE 1: BAR CHART */}
      {spec.kind === 'bar-chart' && (() => {
        const bars: VisualBarItem[] = spec.bars && spec.bars.length > 0 ? spec.bars : [
          { label: 'Baseline', value: 100, displayValue: '100', tone: 'muted' },
          { label: 'Optimized', value: 24, displayValue: '24', tone: 'accent', isWinner: true },
        ];
        const updateBar = (index: number, patch: Partial<VisualBarItem>) => {
          const next = bars.map((b, i) => (i === index ? { ...b, ...patch } : b));
          commitSpec({ bars: next });
        };
        return (
          <div className="space-y-3 pt-2 border-t border-white/10">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={LABEL_CLS}>Orientation</label>
                <div className="grid grid-cols-2 gap-1 bg-black/50 p-0.5 rounded-lg border border-white/10">
                  {(['horizontal', 'vertical'] as const).map((orient) => (
                    <button
                      key={orient}
                      type="button"
                      onClick={() => commitSpec({ orientation: orient })}
                      className={`py-1 text-[10px] font-mono uppercase rounded-md cursor-pointer transition-colors ${
                        (spec.orientation || 'horizontal') === orient
                          ? 'bg-white/15 text-white font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {orient === 'horizontal' ? 'Horiz' : 'Vert'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>Unit</label>
                <input
                  type="text"
                  value={spec.unit || ''}
                  onChange={(e) => commitSpec({ unit: e.target.value })}
                  placeholder="ms, %, req/s"
                  className={`${INPUT_CLS} font-mono`}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Delta Callout</label>
                <input
                  type="text"
                  value={spec.deltaBadge || ''}
                  onChange={(e) => commitSpec({ deltaBadge: e.target.value })}
                  placeholder="-84% p99"
                  className={`${INPUT_CLS} font-mono`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className={LABEL_CLS}>Data Series ({bars.length}/6)</span>
                {bars.length < 6 && (
                  <button
                    type="button"
                    onClick={() =>
                      commitSpec({
                        bars: [
                          ...bars,
                          { label: `Series ${bars.length + 1}`, value: 50, tone: 'muted' },
                        ],
                      })
                    }
                    className="flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Bar
                  </button>
                )}
              </div>

              {bars.map((bar, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-1.5 items-center bg-black/30 p-1.5 rounded-lg border border-white/10"
                >
                  <input
                    type="text"
                    value={bar.label}
                    onChange={(e) => updateBar(idx, { label: e.target.value })}
                    placeholder="Series label"
                    className={`${INPUT_CLS} col-span-4`}
                  />
                  <input
                    type="number"
                    value={Number.isFinite(bar.value) ? bar.value : 0}
                    onChange={(e) =>
                      updateBar(idx, { value: Number(e.target.value) || 0 })
                    }
                    placeholder="Val"
                    className={`${INPUT_CLS} col-span-2 font-mono tabular-nums`}
                  />
                  <input
                    type="text"
                    value={bar.displayValue || ''}
                    onChange={(e) => updateBar(idx, { displayValue: e.target.value })}
                    placeholder="Display"
                    className={`${INPUT_CLS} col-span-2 font-mono tabular-nums`}
                  />
                  <select
                    value={bar.tone || 'muted'}
                    onChange={(e) =>
                      updateBar(idx, { tone: e.target.value as VisualBarItem['tone'] })
                    }
                    className={`${INPUT_CLS} col-span-2 px-1.5`}
                  >
                    <option value="accent">Accent</option>
                    <option value="muted">Muted</option>
                    <option value="alert">Alert</option>
                  </select>
                  <div className="col-span-2 flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => updateBar(idx, { isWinner: !bar.isWinner })}
                      className={`p-1.5 rounded-md border cursor-pointer transition-colors ${
                        bar.isWinner
                          ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300'
                          : 'bg-black/40 border-white/10 text-slate-500 hover:text-slate-300'
                      }`}
                      title="Mark as winner / highlight"
                    >
                      <Star className="w-3 h-3" />
                    </button>
                    {bars.length > 1 && (
                      <button
                        type="button"
                        onClick={() => commitSpec({ bars: bars.filter((_, i) => i !== idx) })}
                        className="p-1.5 rounded-md border border-white/10 bg-black/40 text-slate-500 hover:text-rose-400 cursor-pointer"
                        title="Remove bar"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* MODE 2: SEQUENCE DIAGRAM */}
      {spec.kind === 'sequence' && (() => {
        const actors = spec.actors && spec.actors.length >= 2 ? spec.actors : ['Client', 'Gateway', 'Database'];
        const steps: VisualSequenceStep[] = spec.steps && spec.steps.length > 0 ? spec.steps : [
          { from: 0, to: 1, label: 'Send Request', style: 'solid' },
          { from: 1, to: 2, label: 'Query State', style: 'solid' },
        ];
        const updateStep = (index: number, patch: Partial<VisualSequenceStep>) => {
          commitSpec({
            steps: steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
          });
        };
        return (
          <div className="space-y-3 pt-2 border-t border-white/10">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className={LABEL_CLS}>Actors / Lifelines ({actors.length}/4)</span>
                {actors.length < 4 && (
                  <button
                    type="button"
                    onClick={() => commitSpec({ actors: [...actors, `Service ${actors.length + 1}`] })}
                    className="flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Actor
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {actors.map((actor, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <input
                      type="text"
                      value={actor}
                      onChange={(e) => {
                        const next = [...actors];
                        next[idx] = e.target.value;
                        commitSpec({ actors: next });
                      }}
                      placeholder={`Actor ${idx + 1}`}
                      className={INPUT_CLS}
                    />
                    {actors.length > 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextActors = actors.filter((_, i) => i !== idx);
                          const maxIdx = nextActors.length - 1;
                          commitSpec({
                            actors: nextActors,
                            steps: steps.map((s) => ({
                              ...s,
                              from: Math.min(s.from, maxIdx),
                              to: Math.min(s.to, maxIdx),
                            })),
                          });
                        }}
                        className="p-1.5 rounded-md border border-white/10 bg-black/40 text-slate-500 hover:text-rose-400 cursor-pointer shrink-0"
                        title="Remove actor"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className={LABEL_CLS}>Message Steps ({steps.length}/6)</span>
                {steps.length < 6 && (
                  <button
                    type="button"
                    onClick={() =>
                      commitSpec({
                        steps: [
                          ...steps,
                          {
                            from: 0,
                            to: Math.min(1, actors.length - 1),
                            label: 'Next hop',
                            style: 'solid',
                          },
                        ],
                      })
                    }
                    className="flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Step
                  </button>
                )}
              </div>

              {steps.map((step, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-1.5 items-center bg-black/30 p-1.5 rounded-lg border border-white/10"
                >
                  <select
                    value={step.from}
                    onChange={(e) => updateStep(idx, { from: Number(e.target.value) })}
                    className={`${INPUT_CLS} col-span-2 px-1`}
                    title="From actor"
                  >
                    {actors.map((a, ai) => (
                      <option key={ai} value={ai}>
                        {a}
                      </option>
                    ))}
                  </select>
                  <select
                    value={step.to}
                    onChange={(e) => updateStep(idx, { to: Number(e.target.value) })}
                    className={`${INPUT_CLS} col-span-2 px-1`}
                    title="To actor"
                  >
                    {actors.map((a, ai) => (
                      <option key={ai} value={ai}>
                        {a}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={step.label}
                    onChange={(e) => updateStep(idx, { label: e.target.value })}
                    placeholder="Message / payload"
                    className={`${INPUT_CLS} col-span-4`}
                  />
                  <input
                    type="text"
                    value={step.tag || ''}
                    onChange={(e) => updateStep(idx, { tag: e.target.value })}
                    placeholder="Tag"
                    className={`${INPUT_CLS} col-span-2 font-mono`}
                  />
                  <div className="col-span-2 flex items-center gap-1">
                    <select
                      value={step.style || 'solid'}
                      onChange={(e) =>
                        updateStep(idx, { style: e.target.value as VisualSequenceStep['style'] })
                      }
                      className={`${INPUT_CLS} px-1`}
                    >
                      <option value="solid">Solid</option>
                      <option value="dashed">Reply</option>
                      <option value="alert">Alert</option>
                    </select>
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => commitSpec({ steps: steps.filter((_, i) => i !== idx) })}
                        className="p-1.5 rounded-md border border-white/10 bg-black/40 text-slate-500 hover:text-rose-400 cursor-pointer shrink-0"
                        title="Remove step"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* MODE 3: TIMELINE */}
      {spec.kind === 'timeline' && (() => {
        const events: VisualTimelineEvent[] = spec.events && spec.events.length > 0 ? spec.events : [
          { time: 'T+00m', title: 'Initial trigger', detail: 'Config deployed', severity: 'info' },
          { time: 'T+12m', title: 'Mitigation complete', detail: 'Rollback verified', severity: 'resolved' },
        ];
        const updateEvent = (index: number, patch: Partial<VisualTimelineEvent>) => {
          commitSpec({
            events: events.map((ev, i) => (i === index ? { ...ev, ...patch } : ev)),
          });
        };
        return (
          <div className="space-y-2 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className={LABEL_CLS}>Chronological Events ({events.length}/5)</span>
              {events.length < 5 && (
                <button
                  type="button"
                  onClick={() =>
                    commitSpec({
                      events: [
                        ...events,
                        {
                          time: `T+${events.length * 10}m`,
                          title: `Milestone ${events.length + 1}`,
                          detail: '',
                          severity: 'info',
                        },
                      ],
                    })
                  }
                  className="flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Add Event
                </button>
              )}
            </div>

            {events.map((ev, idx) => (
              <div
                key={idx}
                className="space-y-1.5 bg-black/30 p-2 rounded-lg border border-white/10"
              >
                <div className="grid grid-cols-12 gap-1.5 items-center">
                  <input
                    type="text"
                    value={ev.time}
                    onChange={(e) => updateEvent(idx, { time: e.target.value })}
                    placeholder="14:02 UTC"
                    className={`${INPUT_CLS} col-span-3 font-mono tabular-nums`}
                  />
                  <input
                    type="text"
                    value={ev.title}
                    onChange={(e) => updateEvent(idx, { title: e.target.value })}
                    placeholder="Event title"
                    className={`${INPUT_CLS} col-span-5`}
                  />
                  <select
                    value={ev.severity || 'info'}
                    onChange={(e) =>
                      updateEvent(idx, {
                        severity: e.target.value as VisualTimelineEvent['severity'],
                      })
                    }
                    className={`${INPUT_CLS} col-span-3 px-1.5`}
                  >
                    <option value="info">Info</option>
                    <option value="warn">Warning</option>
                    <option value="incident">Incident</option>
                    <option value="resolved">Resolved</option>
                  </select>
                  <div className="col-span-1 flex justify-end">
                    {events.length > 2 && (
                      <button
                        type="button"
                        onClick={() => commitSpec({ events: events.filter((_, i) => i !== idx) })}
                        className="p-1.5 rounded-md border border-white/10 bg-black/40 text-slate-500 hover:text-rose-400 cursor-pointer"
                        title="Remove event"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="text"
                  value={ev.detail || ''}
                  onChange={(e) => updateEvent(idx, { detail: e.target.value })}
                  placeholder="Observed impact or root cause detail"
                  className={INPUT_CLS}
                />
              </div>
            ))}
          </div>
        );
      })()}

      {/* MODE 4: 2x2 MATRIX */}
      {spec.kind === 'matrix' && (() => {
        const quadrants: VisualMatrixQuadrant[] =
          spec.quadrants && spec.quadrants.length === 4
            ? spec.quadrants
            : [
                { title: 'High Control', detail: 'Vertical scaling ceiling' },
                { title: 'Target Sweet Spot', detail: 'Resilient & predictable', highlight: true },
                { title: 'Legacy Bottleneck', detail: 'Fragile manual ops' },
                { title: 'Fast But Fragile', detail: 'Risk under traffic spike' },
              ];
        const updateQuad = (index: number, patch: Partial<VisualMatrixQuadrant>) => {
          commitSpec({
            quadrants: quadrants.map((q, i) => (i === index ? { ...q, ...patch } : q)),
          });
        };
        return (
          <div className="space-y-3 pt-2 border-t border-white/10">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL_CLS}>X Axis Low (Left)</label>
                <input
                  type="text"
                  value={spec.xAxisLow || ''}
                  onChange={(e) => commitSpec({ xAxisLow: e.target.value })}
                  placeholder="Low Complexity"
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>X Axis High (Right)</label>
                <input
                  type="text"
                  value={spec.xAxisHigh || ''}
                  onChange={(e) => commitSpec({ xAxisHigh: e.target.value })}
                  placeholder="High Throughput"
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Y Axis High (Top)</label>
                <input
                  type="text"
                  value={spec.yAxisHigh || ''}
                  onChange={(e) => commitSpec({ yAxisHigh: e.target.value })}
                  placeholder="High Reliability"
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Y Axis Low (Bottom)</label>
                <input
                  type="text"
                  value={spec.yAxisLow || ''}
                  onChange={(e) => commitSpec({ yAxisLow: e.target.value })}
                  placeholder="Low Reliability"
                  className={INPUT_CLS}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {quadrants.map((q, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded-lg border space-y-1.5 ${
                    q.highlight
                      ? 'bg-cyan-500/10 border-cyan-400/40'
                      : 'bg-black/30 border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-slate-400">
                      {QUADRANT_POSITIONS[idx]}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuad(idx, { highlight: !q.highlight })}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer border ${
                        q.highlight
                          ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                          : 'bg-black/40 border-white/10 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {q.highlight ? 'Highlighted' : 'Highlight'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={q.title}
                    onChange={(e) => updateQuad(idx, { title: e.target.value })}
                    placeholder="Quadrant title"
                    className={INPUT_CLS}
                  />
                  <input
                    type="text"
                    value={q.detail || ''}
                    onChange={(e) => updateQuad(idx, { detail: e.target.value })}
                    placeholder="Short trade-off summary"
                    className={INPUT_CLS}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* MODE 5: COMPARISON TABLE */}
      {spec.kind === 'table' && (() => {
        const columns =
          spec.columns && spec.columns.length >= 2
            ? spec.columns
            : ['Dimension', 'Baseline', 'Target'];
        const rows =
          spec.rows && spec.rows.length > 0
            ? spec.rows
            : [
                ['p99 Latency', '120ms', '15ms'],
                ['Throughput', '4k/s', '32k/s'],
              ];

        const updateColumn = (colIdx: number, val: string) => {
          const next = [...columns];
          next[colIdx] = val;
          commitSpec({ columns: next });
        };

        const addColumn = () => {
          if (columns.length >= 4) return;
          commitSpec({
            columns: [...columns, `Col ${columns.length + 1}`],
            rows: rows.map((r) => [...r, '—']),
          });
        };

        const removeColumn = (colIdx: number) => {
          if (columns.length <= 2) return;
          const nextCols = columns.filter((_, i) => i !== colIdx);
          const nextRows = rows.map((r) => r.filter((_, i) => i !== colIdx));
          const nextHighlight =
            typeof spec.highlightColumn === 'number'
              ? spec.highlightColumn === colIdx
                ? undefined
                : spec.highlightColumn > colIdx
                ? spec.highlightColumn - 1
                : spec.highlightColumn
              : undefined;
          commitSpec({ columns: nextCols, rows: nextRows, highlightColumn: nextHighlight });
        };

        const updateCell = (rowIdx: number, colIdx: number, val: string) => {
          const nextRows = rows.map((r, ri) => {
            if (ri !== rowIdx) return r;
            const padded = [...r];
            while (padded.length < columns.length) padded.push('');
            padded[colIdx] = val;
            return padded;
          });
          commitSpec({ rows: nextRows });
        };

        return (
          <div className="space-y-3 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className={LABEL_CLS}>Columns ({columns.length}/4) & Winner Column</span>
              <div className="flex items-center gap-2">
                <select
                  value={typeof spec.highlightColumn === 'number' ? String(spec.highlightColumn) : ''}
                  onChange={(e) =>
                    commitSpec({
                      highlightColumn: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  className="bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none"
                >
                  <option value="">No highlight column</option>
                  {columns.map((c, ci) => (
                    <option key={ci} value={ci}>
                      Highlight: {c || `Col ${ci + 1}`}
                    </option>
                  ))}
                </select>
                {columns.length < 4 && (
                  <button
                    type="button"
                    onClick={addColumn}
                    className="flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Col
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              {/* Header row */}
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr)) 28px` }}
              >
                {columns.map((col, ci) => (
                  <div key={ci} className="flex items-center gap-1">
                    <input
                      type="text"
                      value={col}
                      onChange={(e) => updateColumn(ci, e.target.value)}
                      placeholder={`Col ${ci + 1}`}
                      className={`${INPUT_CLS} font-mono font-bold uppercase text-[11px]`}
                    />
                    {columns.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeColumn(ci)}
                        className="p-1 rounded border border-white/10 text-slate-500 hover:text-rose-400 cursor-pointer"
                        title="Remove column"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                <div />
              </div>

              {/* Data rows */}
              {rows.map((row, ri) => (
                <div
                  key={ri}
                  className="grid gap-1.5 items-center"
                  style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr)) 28px` }}
                >
                  {columns.map((_, ci) => (
                    <input
                      key={ci}
                      type="text"
                      value={row[ci] || ''}
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                      placeholder="Value"
                      className={`${INPUT_CLS} ${ci > 0 ? 'font-mono tabular-nums' : ''}`}
                    />
                  ))}
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => commitSpec({ rows: rows.filter((_, i) => i !== ri) })}
                      className="p-1.5 rounded-md border border-white/10 bg-black/40 text-slate-500 hover:text-rose-400 cursor-pointer"
                      title="Remove row"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  ) : (
                    <div />
                  )}
                </div>
              ))}

              {rows.length < 5 && (
                <button
                  type="button"
                  onClick={() =>
                    commitSpec({
                      rows: [...rows, columns.map((_, ci) => (ci === 0 ? `Metric ${rows.length + 1}` : '—'))],
                    })
                  }
                  className="flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 pt-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Add Row ({rows.length}/5)
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* MODE 6: EDITORIAL QUOTE / STAT CALLOUT */}
      {spec.kind === 'callout' && (
        <div className="space-y-2.5 pt-2 border-t border-white/10">
          <div className="grid grid-cols-2 gap-1 bg-black/50 p-1 rounded-lg border border-white/10">
            {([
              { id: 'quote', label: 'Editorial Quote' },
              { id: 'stat', label: 'Hero Stat Callout' },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => commitSpec({ calloutStyle: opt.id })}
                className={`py-1.5 text-[11px] font-semibold rounded-md cursor-pointer transition-colors ${
                  (spec.calloutStyle || 'quote') === opt.id
                    ? 'bg-white/15 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {spec.calloutStyle === 'stat' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL_CLS}>Hero Stat Value</label>
                <input
                  type="text"
                  value={spec.statValue || ''}
                  onChange={(e) => commitSpec({ statValue: e.target.value })}
                  placeholder="99.99%"
                  className={`${INPUT_CLS} font-mono font-bold tabular-nums`}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Stat Label</label>
                <input
                  type="text"
                  value={spec.statLabel || ''}
                  onChange={(e) => commitSpec({ statLabel: e.target.value })}
                  placeholder="Availability under failover"
                  className={INPUT_CLS}
                />
              </div>
            </div>
          )}

          <div>
            <label className={LABEL_CLS}>
              {spec.calloutStyle === 'stat' ? 'Supporting Statement' : 'Quote Statement'}
            </label>
            <textarea
              rows={3}
              value={spec.quote || ''}
              onChange={(e) => commitSpec({ quote: e.target.value })}
              placeholder="Direct engineering quote or empirical takeaway..."
              className={`${INPUT_CLS} resize-none`}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL_CLS}>Author / Organization</label>
              <input
                type="text"
                value={spec.author || ''}
                onChange={(e) => commitSpec({ author: e.target.value })}
                placeholder="e.g. Cloudflare Systems Team"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Role / Context</label>
              <input
                type="text"
                value={spec.role || ''}
                onChange={(e) => commitSpec({ role: e.target.value })}
                placeholder="e.g. Postmortem Report"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Source Citation</label>
              <input
                type="text"
                value={spec.source || ''}
                onChange={(e) => commitSpec({ source: e.target.value })}
                placeholder="blog.cloudflare.com"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Evidence Note</label>
              <input
                type="text"
                value={spec.evidence || ''}
                onChange={(e) => commitSpec({ evidence: e.target.value })}
                placeholder="Measured over 30-day window"
                className={INPUT_CLS}
              />
            </div>
          </div>
        </div>
      )}

      {/* MODE 7: CUSTOM SVG BLUEPRINT */}
      {spec.kind === 'svg' && (
        <div className="space-y-2.5 pt-2 border-t border-white/10">
          {/* Starter Blueprint Presets */}
          <div>
            <span className={LABEL_CLS}>Starter Blueprints</span>
            <div className="grid grid-cols-2 gap-1.5">
              {SVG_BLUEPRINT_PRESETS.map((preset) => {
                const isSelected = spec.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`svg-preset-${preset.id}`}
                    onClick={() =>
                      commitSpec({
                        presetId: preset.id,
                        viewBox: preset.viewBox,
                        svgCode: preset.svgCode,
                        title: spec.title || preset.name,
                      })
                    }
                    className={`text-left px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-white/15 border-cyan-400/50 text-white'
                        : 'bg-black/40 border-white/10 text-slate-300 hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="text-[11px] font-semibold truncate">{preset.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{preset.description}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Theme Tokens Quick-Insert */}
          <div>
            <span className={LABEL_CLS}>Live MARROK Theme Tokens (Click to Append)</span>
            <div className="flex flex-wrap gap-1">
              {SVG_THEME_TOKENS.map(({ token, label }) => (
                <button
                  key={token}
                  type="button"
                  data-testid={`svg-token-${label.toLowerCase().replace(/\s+/g, '-')}`}
                  onClick={() =>
                    commitSpec({
                      svgCode: `${spec.svgCode || ''}\n<!-- ${label}: ${token} -->`,
                    })
                  }
                  className="px-2 py-0.5 rounded border border-white/15 bg-black/50 hover:bg-white/10 text-[10px] font-mono text-cyan-200 cursor-pointer transition-colors"
                  title={`Insert ${token} (${label})`}
                >
                  {token}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={LABEL_CLS}>SVG viewBox</label>
              <input
                type="text"
                value={spec.viewBox || '0 0 846 490'}
                onChange={(e) => commitSpec({ viewBox: e.target.value })}
                placeholder="0 0 846 490"
                className={`${INPUT_CLS} font-mono`}
              />
            </div>
            <div className="col-span-2 flex items-end">
              {svgValidation && (
                <div
                  data-testid="svg-sanitizer-status"
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 ${
                    !svgValidation.isValid
                      ? 'bg-rose-500/15 border-rose-400/40 text-rose-200'
                      : svgValidation.warnings.length > 0
                      ? 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                      : 'bg-emerald-500/10 border-emerald-400/35 text-emerald-200'
                  }`}
                >
                  {svgValidation.isValid && svgValidation.warnings.length === 0 ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Sanitized &amp; Safe SVG</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        {!svgValidation.isValid
                          ? 'Invalid SVG markup'
                          : `Stripped: ${svgValidation.warnings.join('; ')}`}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>SVG Vector Markup</label>
            <textarea
              data-testid="svg-blueprint-textarea"
              rows={7}
              value={spec.svgCode || ''}
              onChange={(e) => commitSpec({ svgCode: e.target.value, presetId: undefined })}
              placeholder='<svg viewBox="0 0 846 490" xmlns="http://www.w3.org/2000/svg">...</svg>'
              spellCheck={false}
              className={`${INPUT_CLS} font-mono text-[11px] leading-relaxed`}
            />
          </div>
        </div>
      )}

      {/* Progressive Disclosure: Eyebrow, Title & Footnote */}
      <div className="rounded-lg border border-white/[0.07] bg-black/25 overflow-hidden">
        <button
          type="button"
          onClick={() => setIsMetaOpen((prev) => !prev)}
          aria-expanded={isMetaOpen}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.03] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
            <span>Customize Labels &amp; Footnote</span>
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              isMetaOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isMetaOpen && (
          <div className="px-2.5 pb-2.5 pt-2 border-t border-white/[0.06] space-y-2.5 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className={LABEL_CLS}>Eyebrow Kicker</label>
                <input
                  type="text"
                  value={spec.eyebrow || ''}
                  onChange={(e) => commitSpec({ eyebrow: e.target.value })}
                  placeholder="e.g. LATENCY BENCHMARK"
                  className={`${INPUT_CLS} font-mono uppercase`}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Visual Title</label>
                <input
                  type="text"
                  value={spec.title || ''}
                  onChange={(e) => commitSpec({ title: e.target.value })}
                  placeholder="Concise chart or diagram title"
                  className={INPUT_CLS}
                />
              </div>
            </div>
            <div>
              <label className={LABEL_CLS}>Source / Footnote (Optional)</label>
              <input
                type="text"
                value={spec.footnote || ''}
                onChange={(e) => commitSpec({ footnote: e.target.value })}
                placeholder="e.g. Source: Production benchmark on 64-core NVMe cluster"
                className={INPUT_CLS}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
