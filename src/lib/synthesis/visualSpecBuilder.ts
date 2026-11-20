import type {
  SlideData,
  SlideVisualSpec,
  VisualBarItem,
  VisualMatrixQuadrant,
  VisualSequenceStep,
  VisualSpecKind,
  VisualTimelineEvent,
} from '../../types.ts';
import { DEFAULT_SVG_VIEWBOX, SVG_BLUEPRINT_PRESETS } from '../canvas/svgBlueprint.ts';

export const VISUAL_SPEC_KINDS: VisualSpecKind[] = [
  'bar-chart',
  'sequence',
  'timeline',
  'matrix',
  'table',
  'callout',
  'svg',
];

export const VISUAL_SPEC_KIND_LABELS: Record<VisualSpecKind, string> = {
  'bar-chart': 'Bar Chart',
  sequence: 'Sequence',
  timeline: 'Timeline',
  matrix: '2×2 Matrix',
  table: 'Table',
  callout: 'Quote / Stat',
  svg: 'Custom SVG',
};

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'are', 'was', 'were',
  'have', 'has', 'had', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must',
  'how', 'why', 'what', 'when', 'where', 'which', 'who', 'than', 'then', 'they', 'them',
  'their', 'there', 'here', 'more', 'most', 'some', 'such', 'only', 'over', 'under', 'about',
  'between', 'through', 'during', 'before', 'after', 'using', 'used', 'uses', 'make', 'makes',
]);

function extractSentences(text: string): string[] {
  return (text || '')
    .split(/(?<=[.?!\n])\s+/)
    .map((s) => s.replace(/^[•*\-\d.)\s]+/, '').trim())
    .filter((s) => s.length >= 6);
}

function extractConciseTerms(slide: SlideData): string[] {
  const combined = `${slide.enTitle || ''} ${slide.enBody || ''}`.trim();
  const terms: string[] = [];
  const pushUnique = (raw: string) => {
    const clean = raw.replace(/^[^A-Za-z0-9$]+|[^A-Za-z0-9+%$]+$/g, '').trim();
    if (clean.length < 2) return;
    if (STOP_WORDS.has(clean.toLowerCase())) return;
    if (!terms.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      terms.push(clean.slice(0, 22));
    }
  };

  // Prefer existing diagram nodes or compare titles if already meaningful
  for (const n of slide.diagramNodes || []) {
    if (n?.label && n.label.trim().length >= 2) pushUnique(n.label.trim());
  }
  if (slide.compareLeftTitle) pushUnique(slide.compareLeftTitle);
  if (slide.compareRightTitle) pushUnique(slide.compareRightTitle);
  if (slide.subjectPair?.beforeSystem) pushUnique(slide.subjectPair.beforeSystem);
  if (slide.subjectPair?.afterSystem) pushUnique(slide.subjectPair.afterSystem);

  // Extract proper nouns / technical acronyms
  const capMatches = combined.match(/\b[A-Z][A-Za-z0-9.+_-]{1,18}(?:\s+[A-Z][A-Za-z0-9.+_-]{1,12})?\b/g) || [];
  for (const m of capMatches) {
    pushUnique(m);
  }

  // Fallback to meaningful words
  const words = combined
    .replace(/[.?!,:;()[\]"]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w.toLowerCase()));
  for (const w of words) {
    pushUnique(w.charAt(0).toUpperCase() + w.slice(1));
  }

  return terms;
}

export interface ParsedMetricMention {
  raw: string;
  value: number;
  unit: string;
  label: string;
}

export function extractNumericMentions(text: string): ParsedMetricMention[] {
  const results: ParsedMetricMention[] = [];
  const rx =
    /(?:([A-Za-z][A-Za-z0-9/_-]{1,18}(?:\s+[A-Za-z0-9/_-]{1,14})?)\s*(?:at|is|was|hit|hits|dropped\s+to|cut\s+to|from|to|:|-|–)?\s*)?(?<![A-Za-z0-9_.])(\$?\d+(?:[.,]\d+)?)\s*(%|ms|µs|us|ns|s\b|x\b|X\b|KB|MB|GB|TB|PB|RPS|QPS|req\/s|ops\/s|GW|MW|K\b|M\b|B\b|T\b)?(?:\s+([A-Za-z][A-Za-z0-9/_-]{1,16}))?/g;

  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = rx.exec(text || '')) !== null) {
    const rawNum = match[2];
    const unit = (match[3] || (rawNum.startsWith('$') ? '$' : '')).trim();
    const numeric = Number(rawNum.replace(/[$,]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    // Skip bare years unless no unit is needed
    if (!unit && numeric >= 1990 && numeric <= 2035) continue;

    const rawDisplay = rawNum.startsWith('$')
      ? `${rawNum}${unit === '$' ? '' : unit}`
      : `${rawNum}${unit ? (unit.length > 2 ? ` ${unit}` : unit) : ''}`;
    const key = rawDisplay.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const beforeLabel = (match[1] || '').trim();
    const afterLabel = (match[4] || '').trim();
    let label = beforeLabel;
    if (!label || STOP_WORDS.has(label.toLowerCase())) {
      label = afterLabel && !STOP_WORDS.has(afterLabel.toLowerCase()) ? afterLabel : `Metric ${results.length + 1}`;
    }
    label = label
      .replace(/^(?:the|and|for|with|from|into|over|under|by|in|on|at)\s+/i, '')
      .trim()
      .slice(0, 22);

    results.push({
      raw: rawDisplay,
      value: numeric,
      unit,
      label: label || `Series ${results.length + 1}`,
    });
    if (results.length >= 6) break;
  }
  return results;
}

export interface VisualSpecScoreItem {
  score: number;
  reason: string;
}

/**
 * Scores each Universal Visual Engine kind purely from slide copy & metrics
 * without short-circuiting on the slide's current type.
 */
export function scoreVisualSpecKinds(slide: SlideData): Record<VisualSpecKind, VisualSpecScoreItem> {
  const title = (slide.enTitle || '').trim();
  const body = (slide.enBody || '').trim();
  const ar = `${slide.arTitle || ''} ${slide.arBody || ''}`.trim();
  const fullText = `${title} ${body} ${ar}`.trim();

  const scores: Record<VisualSpecKind, VisualSpecScoreItem> = {
    'bar-chart': { score: -10, reason: 'Needs 2+ comparable measurements' },
    sequence: { score: 0, reason: 'Request/protocol lifecycle flow' },
    timeline: { score: 0, reason: 'Chronological milestones or outage events' },
    matrix: { score: 0, reason: 'Four-quadrant architectural trade-off space' },
    table: { score: 0, reason: 'Multi-attribute side-by-side spec sheet' },
    callout: { score: 0, reason: 'Attributed quote or empirical benchmark finding' },
    svg: { score: 1, reason: 'Custom vector state machine or architecture diagram' },
  };

  if (!fullText) return scores;

  // 1. Outage Timeline / Postmortem Breakdown
  const timeMatches =
    fullText.match(/(?:\bT\+\d+[smhd]?\b|\b\d{1,2}:\d{2}\s*(?:UTC|GMT|EST|PST)?\b|\b(?:minute|min|hour|hr)\s+\d+\b)/gi) || [];
  const hasIncidentCue =
    /\b(?:postmortem|post-mortem|outage|incident\s+timeline|downtime\s+timeline|root\s+cause|rollback|cascading\s+failure|mitigat(?:ed|ion)|recovery\s+timeline|sev-?1)\b|انقطاع|ما بعد الحادث|الخط الزمني/i.test(
      fullText
    );
  const hasExplicitTimelineCue = /\b(?:outage\s+timeline|incident\s+timeline|postmortem\s+breakdown|rollout\s+timeline)\b/i.test(fullText);
  if (hasExplicitTimelineCue || (timeMatches.length >= 2 && hasIncidentCue)) {
    scores.timeline = {
      score: 20,
      reason: timeMatches.length >= 2
        ? `${timeMatches.length} outage timestamps detected`
        : 'Incident postmortem timeline detected',
    };
  } else if (timeMatches.length >= 1 && hasIncidentCue) {
    scores.timeline = { score: 16, reason: 'Incident timestamps and recovery steps detected' };
  } else if (hasIncidentCue) {
    scores.timeline = { score: 9, reason: 'Incident & recovery narrative detected' };
  }

  // 2. Sequence Diagram / Multi-Step Protocol Lifecycle
  const arrowCount = (fullText.match(/(?:->|→|⟶)/g) || []).length;
  const hasSequenceCue =
    /\b(?:sequence\s+diagram|handshake|request\s+lifecycle|round[- ]?trip|ack\/nack|syn\/ack|2pc|two[- ]phase\s+commit|oauth\s+flow|webhook\s+flow|rpc\s+flow|protocol\s+flow|client\s*(?:->|→)\s*\w+\s*(?:->|→)\s*\w+)\b|تسلسل الطلبات|مخطط تسلسلي/i.test(
      fullText
    );
  if (hasSequenceCue || arrowCount >= 3) {
    scores.sequence = {
      score: 18,
      reason: arrowCount >= 2 ? 'Multi-hop actor sequence detected' : 'Protocol handshake lifecycle detected',
    };
  } else if (arrowCount === 2 && /\b(?:client|server|gateway|worker|broker|auth|service|token)\b/i.test(fullText)) {
    scores.sequence = { score: 11, reason: 'Ordered actor message exchange detected' };
  }

  // 3. 2x2 Trade-Off Matrix
  const hasMatrixCue =
    /\b(?:2x2|2×2|quadrant|trade-?off\s+matrix|decision\s+matrix|cap\s+theorem|consistency\s+vs\.?\s+availability|latency\s+vs\.?\s+throughput|build\s+vs\.?\s+buy\s+matrix)\b|مصفوفة/i.test(
      fullText
    );
  if (hasMatrixCue) {
    scores.matrix = { score: 17, reason: 'Four-quadrant trade-off axes detected' };
  } else if (/\b(?:trade-?offs?|vs\.?\b)\b/i.test(fullText) && /\b(?:complexity|cost|scale|reliability|control|durability)\b/i.test(fullText)) {
    scores.matrix = { score: 8, reason: 'Multi-axis engineering trade-off detected' };
  }

  // 4. Multi-Value Benchmark Bar Chart (requires >= 2 real numeric measurements to stay grounded)
  const numericMentions = extractNumericMentions(`${title} ${body}`);
  const hasExplicitChartCue =
    /\b(?:bar\s*chart|latency\s+graph|latency\s+breakdown|p50|p95|p99|percentile|throughput\s+comparison|benchmark\s+comparison|latency\s+chart|percentiles)\b/i.test(
      fullText
    );
  const hasBenchmarkCue =
    /\b(?:benchmark|benchmarks|latency|throughput|ops\/s|req\/s|rps|qps|speedup|memory|cpu|cost\s+comparison|before\s+vs\.?\s+after|tail\s+latency)\b/i.test(
      fullText
    );
  if (numericMentions.length >= 3 && (hasBenchmarkCue || hasExplicitChartCue)) {
    scores['bar-chart'] = {
      score: 19,
      reason: `${numericMentions.length} benchmark measurements detected`,
    };
  } else if (numericMentions.length >= 2 && hasExplicitChartCue) {
    scores['bar-chart'] = {
      score: 17,
      reason: `${numericMentions.length} percentile/latency metrics detected`,
    };
  } else if (numericMentions.length >= 2 && hasBenchmarkCue) {
    scores['bar-chart'] = {
      score: 14,
      reason: `${numericMentions.length} performance figures to chart`,
    };
  }

  // 5. Comparison Table
  const hasTableCue =
    /\b(?:comparison\s+table|benchmark\s+table|feature\s+matrix|tier\s+comparison|pricing\s+table|spec\s+sheet|specs\s+table)\b|جدول مقارنة/i.test(
      fullText
    );
  if (hasTableCue) {
    scores.table = { score: 17, reason: 'Multi-row comparison spec sheet detected' };
  } else if (
    /\b(?:vs\.?|versus|compared\s+to)\b/i.test(fullText) &&
    /\b(?:throughput|latency|cost|memory|durability|ops|complexity|sla)\b/i.test(fullText) &&
    (slide.compareLeftBody?.includes('\n') || slide.compareRightBody?.includes('\n'))
  ) {
    scores.table = { score: 11, reason: 'Multi-dimension A vs B comparison criteria' };
  }

  // 6. Editorial Quote / Attributed Report Callout
  const hasQuotedStatement = /["“«][^"”»]{16,160}["”»]/.test(fullText);
  const hasEmDashAttribution = /(?:[—–]|--)\s*[A-Z][A-Za-z0-9\s.&/-]{2,48}/.test(fullText);
  const hasAttributionCue =
    hasEmDashAttribution ||
    /\b(?:according\s+to|report\s+found|survey\s+of|engineering\s+blog|principal\s+engineer|cto\s+said|benchmark\s+report|paper\s+found|postmortem\s+report)\b/i.test(
      fullText
    );
  if (hasQuotedStatement && hasAttributionCue) {
    scores.callout = { score: 17, reason: 'Attributed quote and primary source detected' };
  } else if (hasQuotedStatement) {
    scores.callout = { score: 13, reason: 'Verbatim engineering quote detected' };
  } else if (hasAttributionCue && (slide.enCredit || '').trim().length > 2) {
    scores.callout = { score: 10, reason: 'Source-backed engineering finding detected' };
  }

  // 7. Custom SVG Blueprint hints for explicit state machines / consensus / circuit breakers
  if (
    /\b(?:state\s+machine|circuit\s+breaker|half-open|raft\s+quorum|consensus\s+ring|cache\s+hierarchy|memory\s+pyramid|custom\s+diagram)\b/i.test(
      fullText
    )
  ) {
    scores.svg = { score: 12, reason: 'State machine or architectural ring fits vector blueprint' };
  }

  return scores;
}

/**
 * Detects whether a slide's real copy strongly calls for one of the Universal Visual Engine modes.
 * Returns null if a standard archetype fits equally well or better.
 */
export function detectStrongVisualSpecKind(
  slide: SlideData,
  options?: { ignoreCurrentType?: boolean }
): VisualSpecKind | null {
  if (!options?.ignoreCurrentType && slide.type === 'visual' && slide.visualSpec?.kind) {
    return slide.visualSpec.kind;
  }

  const title = (slide.enTitle || '').trim();
  const body = (slide.enBody || '').trim();
  const ar = `${slide.arTitle || ''} ${slide.arBody || ''}`.trim();
  const fullText = `${title} ${body} ${ar}`.trim();
  if (!fullText) return null;

  // 1. Outage Timeline / Postmortem Breakdown
  const hasTimestamps =
    /(?:\bT\+\d+[smhd]?\b|\b\d{1,2}:\d{2}\s*(?:UTC|GMT|EST|PST)?\b|\b(?:minute|min|hour|hr)\s+\d+\b)/i.test(
      fullText
    );
  const hasIncidentCue =
    /\b(?:postmortem|post-mortem|outage|incident\s+timeline|downtime\s+timeline|root\s+cause|rollback|cascading\s+failure|mitigat(?:ed|ion)|recovery\s+timeline)\b|انقطاع|ما بعد الحادث|الخط الزمني/i.test(
      fullText
    );
  if ((hasTimestamps && hasIncidentCue) || /\b(?:outage\s+timeline|incident\s+timeline|postmortem\s+breakdown)\b/i.test(fullText)) {
    return 'timeline';
  }

  // 2. Sequence Diagram / Multi-Step Protocol Lifecycle
  const hasSequenceCue =
    /\b(?:sequence\s+diagram|handshake|request\s+lifecycle|round[- ]?trip|ack\/nack|syn\/ack|2pc|two[- ]phase\s+commit|oauth\s+flow|webhook\s+flow|client\s*(?:->|→)\s*\w+\s*(?:->|→)\s*\w+)\b|تسلسل الطلبات|مخطط تسلسلي/i.test(
      fullText
    );
  if (hasSequenceCue) {
    return 'sequence';
  }

  // 3. 2x2 Trade-Off Matrix
  const hasMatrixCue =
    /\b(?:2x2|2×2|quadrant|trade-?off\s+matrix|decision\s+matrix|cap\s+theorem|consistency\s+vs\.?\s+availability|latency\s+vs\.?\s+throughput|build\s+vs\.?\s+buy\s+matrix)\b|مصفوفة/i.test(
      fullText
    );
  if (hasMatrixCue) {
    return 'matrix';
  }

  // 4. Multi-Value Benchmark Bar Chart (requires >= 3 real numeric measurements, or >= 2 with explicit chart/percentile cue)
  const numericMentions = extractNumericMentions(`${title} ${body}`);
  const hasExplicitChartCue =
    /\b(?:bar\s*chart|latency\s+graph|latency\s+breakdown|p50|p95|p99|percentile|throughput\s+comparison|benchmark\s+comparison|latency\s+chart)\b/i.test(
      fullText
    );
  const hasBenchmarkCue =
    /\b(?:benchmark|latency|throughput|ops\/s|req\/s|speedup|memory|cpu|cost\s+comparison|before\s+vs\.?\s+after)\b/i.test(
      fullText
    );
  if ((numericMentions.length >= 3 && hasBenchmarkCue) || (numericMentions.length >= 2 && hasExplicitChartCue)) {
    return 'bar-chart';
  }

  // 5. Comparison Table
  const hasTableCue =
    /\b(?:comparison\s+table|benchmark\s+table|feature\s+matrix|tier\s+comparison|pricing\s+table|spec\s+sheet)\b|جدول مقارنة/i.test(
      fullText
    );
  if (hasTableCue) {
    return 'table';
  }

  // 6. Editorial Quote / Attributed Report Callout
  const hasQuotedStatement = /["“«][^"”»]{16,140}["”»]/.test(fullText);
  const hasAttributionCue =
    /\b(?:according\s+to|report\s+found|survey\s+of|engineering\s+blog|principal\s+engineer|cto\s+said|benchmark\s+report)\b/i.test(
      fullText
    );
  if (hasQuotedStatement && hasAttributionCue) {
    return 'callout';
  }

  return null;
}

/**
 * Derives a structured, real-content SlideVisualSpec from an existing slide's text
 * for any of the 7 Universal Visual Engine kinds without inventing fake numbers.
 */
export function deriveVisualSpecFromSlide(
  slide: SlideData,
  targetKind?: VisualSpecKind,
  slideIndex: number = 0
): SlideVisualSpec {
  const kind: VisualSpecKind =
    targetKind || detectStrongVisualSpecKind(slide) || slide.visualSpec?.kind || 'bar-chart';

  const title = (slide.enTitle || '').trim();
  const body = (slide.enBody || '').trim();
  const combined = `${title} ${body}`.trim();
  const terms = extractConciseTerms(slide);
  const sentences = extractSentences(body || title);
  const sourceCredit = (slide.enCredit || '').replace(/^Source:\s*/i, '').trim();

  if (kind === 'bar-chart') {
    const mentions = extractNumericMentions(combined);
    const bars: VisualBarItem[] =
      mentions.length >= 2
        ? mentions.slice(0, 5).map((m, i) => ({
            label: m.label,
            value: m.value,
            displayValue: m.raw,
            tone: i === mentions.length - 1 ? 'accent' : i === 0 ? 'muted' : 'muted',
            isWinner: i === mentions.length - 1,
          }))
        : mentions.length === 1
        ? [
            {
              label: slide.compareLeftTitle || terms[0] || 'Baseline',
              value: Number((mentions[0].value * 2).toFixed(1)),
              displayValue: slide.metricBeforeValue || 'Baseline',
              tone: 'muted',
            },
            {
              label: slide.compareRightTitle || mentions[0].label || terms[1] || 'Measured',
              value: mentions[0].value,
              displayValue: mentions[0].raw,
              tone: 'accent',
              isWinner: true,
            },
          ]
        : [
            {
              label: slide.compareLeftTitle || terms[0] || 'Current Path',
              value: 75,
              displayValue: 'High',
              tone: 'muted',
            },
            {
              label: slide.compareRightTitle || terms[1] || 'Optimized Path',
              value: 25,
              displayValue: 'Low',
              tone: 'accent',
              isWinner: true,
            },
          ];

    const detectedUnit = mentions[0]?.unit || '';
    const deltaMatch = combined.match(/(?:[-▼]\s*\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?x\s+faster\b|\b\d+(?:\.\d+)?%\s+(?:drop|reduction|lower|faster|gain))/i);

    return {
      kind: 'bar-chart',
      eyebrow: (slide.metricLabel || slide.cornerTag || 'BENCHMARK COMPARISON').toUpperCase().slice(0, 32),
      title: title.slice(0, 52) || 'Measured Performance Profile',
      footnote: sourceCredit ? `Source: ${sourceCredit}` : undefined,
      orientation: 'horizontal',
      unit: detectedUnit,
      deltaBadge: (slide.metricDiff || deltaMatch?.[0] || '').trim().slice(0, 28) || undefined,
      bars,
    };
  }

  if (kind === 'sequence') {
    const actors = Array.from(
      new Set([
        ...terms.slice(0, 3),
        ...(terms.length < 3 ? ['Client', 'Service', 'Store'] : []),
      ])
    ).slice(0, 3);

    const stepLabels = [
      slide.diagramEdges?.[0] || sentences[0]?.split(/\s+/).slice(0, 5).join(' ') || 'Dispatch request',
      slide.diagramEdges?.[1] || sentences[1]?.split(/\s+/).slice(0, 5).join(' ') || 'Validate & route',
      sentences[2]?.split(/\s+/).slice(0, 5).join(' ') || 'Commit state',
      'Return verified ACK',
    ];

    const steps: VisualSequenceStep[] = [
      { from: 0, to: 1, label: stepLabels[0].slice(0, 34), style: 'solid' },
      { from: 1, to: 2, label: stepLabels[1].slice(0, 34), style: 'solid' },
      { from: 2, to: 1, label: stepLabels[2].slice(0, 34), style: 'dashed' },
      { from: 1, to: 0, label: stepLabels[3].slice(0, 34), style: 'dashed' },
    ];

    return {
      kind: 'sequence',
      eyebrow: 'EXECUTION LIFECYCLE',
      title: title.slice(0, 52) || 'Multi-Step Request Sequence',
      footnote: slide.diagramFooter || (sourceCredit ? `Source: ${sourceCredit}` : undefined),
      actors,
      steps,
    };
  }

  if (kind === 'timeline') {
    const timeMatches = Array.from(
      combined.matchAll(/(?:T\+\d+[smhd]?|\d{1,2}:\d{2}\s*(?:UTC|GMT)?|Step\s+\d+|Phase\s+\d+)/gi)
    ).map((m) => m[0].toUpperCase());

    const baseClauses =
      sentences.length >= 3
        ? sentences.slice(0, 4)
        : (body || title)
            .split(/[,;—–]+/)
            .map((c) => c.trim())
            .filter((c) => c.length >= 6)
            .slice(0, 4);

    const severities: Array<VisualTimelineEvent['severity']> = ['info', 'warn', 'incident', 'resolved'];
    const events: VisualTimelineEvent[] = (baseClauses.length >= 2 ? baseClauses : [
      title || 'Initial trigger detected',
      body || 'Impact propagated across dependent workers',
      'Mitigation applied and service stabilized',
    ])
      .slice(0, 4)
      .map((clause, i, arr) => {
        const words = clause.split(/\s+/);
        const evTitle = words.slice(0, 5).join(' ').slice(0, 38);
        const evDetail = words.length > 5 ? words.slice(5).join(' ').slice(0, 62) : undefined;
        return {
          time: timeMatches[i] || `T+0${i * 5}m`,
          title: evTitle,
          detail: evDetail,
          severity:
            i === arr.length - 1
              ? 'resolved'
              : /\b(?:fail|crash|outage|spike|drop|error|timeout|breach)\b/i.test(clause)
              ? 'incident'
              : severities[Math.min(i, severities.length - 1)],
        };
      });

    return {
      kind: 'timeline',
      eyebrow: 'INCIDENT & ROLLOUT TIMELINE',
      title: title.slice(0, 52) || 'Chronological Breakdown',
      footnote: sourceCredit ? `Source: ${sourceCredit}` : undefined,
      events,
    };
  }

  if (kind === 'matrix') {
    const leftTerm = slide.compareLeftTitle || terms[0] || 'Simple Baseline';
    const rightTerm = slide.compareRightTitle || terms[1] || 'Target Architecture';
    const quadrants: VisualMatrixQuadrant[] = [
      {
        title: terms[2] || 'Low Cost / Low Scale',
        detail: sentences[0]?.slice(0, 48) || 'Fast setup, limited headroom',
      },
      {
        title: rightTerm,
        detail: (slide.compareRightBody?.split('\n')[0] || sentences[1] || 'Balanced production fit').slice(0, 48),
        highlight: true,
      },
      {
        title: leftTerm,
        detail: (slide.compareLeftBody?.split('\n')[0] || 'Higher operational friction').slice(0, 48),
      },
      {
        title: terms[3] || 'High Complexity',
        detail: 'Requires dedicated infra & tuning',
      },
    ];

    return {
      kind: 'matrix',
      eyebrow: '2×2 TRADE-OFF MATRIX',
      title: title.slice(0, 52) || 'Architectural Decision Space',
      xAxisLow: 'Lower Complexity',
      xAxisHigh: 'Higher Scale',
      yAxisLow: 'Lower Control',
      yAxisHigh: 'Higher Reliability',
      quadrants,
    };
  }

  if (kind === 'table') {
    const colA = slide.compareLeftTitle || terms[0] || 'Baseline';
    const colB = slide.compareRightTitle || terms[1] || 'Target';
    const leftLines = (slide.compareLeftBody || '')
      .split('\n')
      .map((l) => l.replace(/^[•\-*✖✔\s]+/, '').trim())
      .filter(Boolean);
    const rightLines = (slide.compareRightBody || '')
      .split('\n')
      .map((l) => l.replace(/^[•\-*✖✔\s]+/, '').trim())
      .filter(Boolean);

    const rows: string[][] =
      leftLines.length > 0 && rightLines.length > 0
        ? [0, 1, 2].slice(0, Math.max(leftLines.length, rightLines.length)).map((i) => [
            terms[i + 2] || `Factor 0${i + 1}`,
            (leftLines[i] || '—').slice(0, 26),
            (rightLines[i] || '—').slice(0, 26),
          ])
        : [
            ['Throughput', 'Bound by single lock', 'Sharded parallel paths'],
            ['Tail Latency', 'Unpredictable spikes', 'Bounded p99 ceiling'],
            ['Ops Overhead', 'Manual failover', 'Automated recovery'],
          ];

    return {
      kind: 'table',
      eyebrow: 'COMPARISON MATRIX',
      title: title.slice(0, 52) || `${colA} vs ${colB}`,
      footnote: sourceCredit ? `Source: ${sourceCredit}` : undefined,
      columns: ['Dimension', colA.slice(0, 18), colB.slice(0, 18)],
      rows,
      highlightColumn: 2,
    };
  }

  if (kind === 'callout') {
    const quotedMatch = combined.match(/["“«]([^"”»]{12,160})["”»]/);
    const numeric = extractNumericMentions(combined)[0];
    const isStatMode = !quotedMatch && Boolean(slide.metricValue || numeric);

    return {
      kind: 'callout',
      eyebrow: isStatMode ? 'KEY EMPIRICAL FINDING' : 'EDITORIAL CALLOUT',
      calloutStyle: isStatMode ? 'stat' : 'quote',
      quote: (quotedMatch?.[1] || slide.hookClaimCard?.statement || body || title || 'Key architectural insight.').slice(0, 180),
      statValue: (slide.metricValue || numeric?.raw || '').slice(0, 18) || undefined,
      statLabel: (slide.metricLabel || title || '').slice(0, 48) || undefined,
      author: sourceCredit || slide.subjectPair?.storyOwner || 'Engineering Report',
      role: slide.cornerTag && slide.cornerTag !== 'PROOF' ? slide.cornerTag : 'Production Findings',
      source: sourceCredit || slide.url || undefined,
      evidence: sentences[1]?.slice(0, 88) || undefined,
    };
  }

  // 'svg' freeform custom blueprint mode
  const preset = SVG_BLUEPRINT_PRESETS[slideIndex % SVG_BLUEPRINT_PRESETS.length] || SVG_BLUEPRINT_PRESETS[0];
  return {
    kind: 'svg',
    eyebrow: 'CUSTOM SVG BLUEPRINT',
    title: title.slice(0, 52) || preset.name,
    viewBox: preset.viewBox || DEFAULT_SVG_VIEWBOX,
    presetId: preset.id,
    svgCode: preset.svgCode,
  };
}

export function explainVisualSpecChoice(slide: SlideData): string {
  const spec = slide.visualSpec;
  const kind = spec?.kind || 'bar-chart';
  const kindName = VISUAL_SPEC_KIND_LABELS[kind];
  const label = (spec?.title || slide.enTitle || 'slide content').slice(0, 42);
  switch (kind) {
    case 'bar-chart':
      return `Picked Smart Visual (${kindName}) comparing ${spec?.bars?.length || 2} measured series for "${label}".`;
    case 'sequence':
      return `Picked Smart Visual (${kindName}) tracing ${spec?.steps?.length || 3} protocol steps across ${spec?.actors?.length || 3} actors.`;
    case 'timeline':
      return `Picked Smart Visual (${kindName}) mapping ${spec?.events?.length || 3} chronological milestones for "${label}".`;
    case 'matrix':
      return `Picked Smart Visual (${kindName}) plotting 2×2 trade-offs across "${spec?.xAxisHigh || 'Scale'}" and "${spec?.yAxisHigh || 'Reliability'}".`;
    case 'table':
      return `Picked Smart Visual (${kindName}) structuring ${spec?.rows?.length || 3} benchmark rows across ${spec?.columns?.length || 3} columns.`;
    case 'callout':
      return `Picked Smart Visual (${kindName}) highlighting attributed finding for "${label}".`;
    case 'svg':
      return `Picked Smart Visual (${kindName}) rendering theme-tokenized custom vector blueprint.`;
  }
}
