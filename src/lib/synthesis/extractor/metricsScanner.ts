import type { SlideData } from '../../../types.ts';
import { isNonSemanticFileName } from '../../text/headlines.ts';
import type { ExtractedEntities, ExtractedMetric } from './types.ts';
import {
  canonicalizeEntity,
  COMPARISON_SEPARATOR,
  entityMentionedInClause,
  mentionsGoLanguage,
  normalizeComparisonName,
  resolveTechLogo,
} from './entityResolution.ts';

export function formatMetricBullet(metric: ExtractedMetric): string {
  if (metric.type === 'throughput') return `• ${metric.value} throughput`;
  if (metric.type === 'memory') return `• ${metric.value} memory footprint`;
  if (metric.type === 'latency') return `• ${metric.value} latency`;
  return `• ${metric.value}`;
}

export function trimSlides(candidates: SlideData[], count: number): SlideData[] {
  if (candidates.length <= count) return candidates;
  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  const middle = candidates.slice(1, candidates.length - 1);
  const needed = Math.max(count - 2, 1);
  return [first, ...middle.slice(0, needed), last];
}

/**
 * Normalizes and strips URLs, Markdown symbols, and timestamps (e.g. YouTube [00:00:00]).
 */
export function cleanRawInput(raw: string): { cleaned: string; lines: string[]; paragraphs: string[] } {
  if (isNonSemanticFileName(raw)) {
    return { cleaned: '', lines: [], paragraphs: [] };
  }
  const withoutUrlsRaw = (raw || '').replace(/https?:\/\/\S+/gi, '').trim();
  let urlDerivedTopic = '';
  if (!withoutUrlsRaw && /https?:\/\//i.test(raw || '')) {
    const urlParts: string[] = [];
    for (const m of (raw || '').matchAll(/https?:\/\/((?:[a-z0-9-]+\.)+[a-z]{2,})(\/[^\s?#]*)?/gi)) {
      const host = (m[1] || '').replace(/^www\./i, '').split('.')[0] || '';
      const slug = (m[2] || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[/_\-.+~]+/g, ' ').trim();
      if (host) urlParts.push(host);
      if (slug) urlParts.push(slug);
    }
    urlDerivedTopic = urlParts.join(' ').trim();
  }
  const withoutUrls = withoutUrlsRaw || urlDerivedTopic;
  // Strip single timestamps (0:00) and timestamp ranges (0:00-1:23 or 21:44-24:34)
  const withoutTimestamps = withoutUrls.replace(
    /\[\d{1,2}:\d{2}(?::\d{2})?(?:\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)?\]|\(\d{1,2}:\d{2}(?::\d{2})?(?:\s*-\s*\d{1,2}:\d{2}(?::\d{2})?)?\)/g,
    ''
  );
  const cleaned = withoutTimestamps
    .replace(/^#+\s*/gm, '')
    .replace(/^[*_~`]+|[*_~`]+$/gm, '')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  const lines = cleaned
    .split(/[\r\n]+/)
    .map((l) => l.replace(/^\s*(?:[-*•]+|\d{1,3}[.)])\s+/, '').replace(/\s+([.,;:!?])/g, '$1').trim())
    .filter((l) => l.length > 5);

  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 15);

  return { cleaned, lines, paragraphs };
}

/**
 * Universal Metric Scanner:
 * Extracts throughput (req/s, rps, ops/sec), memory (MB, GB), speedup multipliers (1.66x),
 * latencies (ms, µs), zero-pause patterns, and percentages.
 */
export function scanMetrics(text: string): ExtractedMetric[] {
  const metrics: ExtractedMetric[] = [];
  const seen = new Set<string>();

  // 1. Throughput (e.g. 129k req/s, 77,000 requests per second, 1.2M ops/sec)
  const throughputRegex = /\b(\d+(?:,\d+)*(?:\.\d+)?(?:k|K|M|B)?)\s*(req\/s|rps|ops\/sec|ops\/s|msg\/s|reqs\/sec|tps|requests\s+per\s+second)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = throughputRegex.exec(text)) !== null) {
    const rawVal = match[1].replace(/,/g, '');
    let cleanVal = rawVal;
    // Format 129000 -> 129k
    if (/^\d{4,}$/.test(rawVal)) {
      const num = Number(rawVal);
      cleanVal = num >= 1000000 ? `${(num / 1000000).toFixed(1)}M` : `${Math.round(num / 1000)}k`;
    }
    const unit = /requests\s+per\s+second/i.test(match[2]) ? 'req/s' : match[2];
    const full = `${cleanVal} ${unit}`;
    if (!seen.has(full.toLowerCase())) {
      seen.add(full.toLowerCase());
      metrics.push({ raw: match[0], value: full, unit, type: 'throughput' });
    }
  }

  // 2. Memory / Footprint (e.g. 13 MB, 38-41 MB, 24 MB)
  const memoryRegex = /\b(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)\s*(MB|GB|KB|TB)\b/gi;
  while ((match = memoryRegex.exec(text)) !== null) {
    const full = `${match[1].replace(/\s+/g, '')} ${match[2]}`;
    if (!seen.has(full.toLowerCase())) {
      seen.add(full.toLowerCase());
      metrics.push({ raw: match[0], value: full, unit: match[2], type: 'memory' });
    }
  }

  // 3. Multiplier / Speedup (e.g. 1.66x, 1.66 times faster, 3x)
  const multiplierRegex = /\b(\d+(?:\.\d+)?)\s*(?:[xX]|times\s+faster|x\s+faster|fold)\b/gi;
  while ((match = multiplierRegex.exec(text)) !== null) {
    const full = `${match[1]}x`;
    if (!seen.has(full.toLowerCase())) {
      seen.add(full.toLowerCase());
      metrics.push({ raw: match[0], value: `${full} speedup`, unit: 'x', type: 'multiplier' });
    }
  }

  // 4. Zero-pause / Zero-overhead / Absolute metrics
  const zeroRegex = /\b(?:zero|0)\s*(?:garbage\s*collection|gc\s*pauses?|allocation|context\s*switches|packet\s*loss|downtime)\b/gi;
  while ((match = zeroRegex.exec(text)) !== null) {
    const full = '0 GC pauses';
    if (!seen.has(full.toLowerCase())) {
      seen.add(full.toLowerCase());
      metrics.push({ raw: match[0], value: full, unit: 'pauses', type: 'latency' });
    }
  }

  // 5. Latency / Pauses (e.g. 1.2ms, 45µs, 30s)
  const latencyRegex = /\b(\d+(?:\.\d+)?)\s*(ms|µs|us|s)\b/gi;
  while ((match = latencyRegex.exec(text)) !== null) {
    const full = `${match[1]} ${match[2]}`;
    if (!seen.has(full.toLowerCase())) {
      seen.add(full.toLowerCase());
      metrics.push({ raw: match[0], value: full, unit: match[2], type: 'latency' });
    }
  }

  // 6. Percentages (e.g. 99.9%, 57%, 32%, 63%, 5%)
  const percentRegex = /\b(\d+(?:\.\d+)?)\s*%\b/gi;
  while ((match = percentRegex.exec(text)) !== null) {
    const full = `${match[1]}%`;
    if (!seen.has(full.toLowerCase())) {
      seen.add(full.toLowerCase());
      metrics.push({ raw: match[0], value: full, unit: '%', type: 'percent' });
    }
  }

  // 7. Financial Currency & Valuation Metrics (e.g. $500B, $1.4 trillion, $20.9B, $6.6B, $2.60)
  const currencyRegex = /\$\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(trillion|billion|million|T|B|M|K)?\b/gi;
  while ((match = currencyRegex.exec(text)) !== null) {
    const rawNum = match[1].replace(/,/g, '');
    const rawUnit = match[2] || '';
    const unitLetter = rawUnit ? rawUnit[0].toUpperCase() : '';
    const full = `$${rawNum}${unitLetter}`;
    if (!seen.has(full.toLowerCase())) {
      seen.add(full.toLowerCase());
      metrics.push({ raw: match[0], value: full, unit: unitLetter || '$', type: 'general' });
    }
  }

  // 8. Power & Energy Scale Metrics (e.g. 10 gigawatts, 10 GW)
  const powerRegex = /\b(\d+(?:\.\d+)?)\s*(gigawatts?|GW|megawatts?|MW)\b/gi;
  while ((match = powerRegex.exec(text)) !== null) {
    const unit = /^g/i.test(match[2]) ? 'GW' : 'MW';
    const full = `${match[1]} ${unit}`;
    if (!seen.has(full.toLowerCase())) {
      seen.add(full.toLowerCase());
      metrics.push({ raw: match[0], value: full, unit, type: 'general' });
    }
  }

  return metrics;
}

/**
 * Selects the strongest positive/win metric for the Slide 1 Hook instead of picking
 * a trade-off/overhead metric simply because it matched an earlier regex pass.
 */
export function selectWinningHookMetric(rawText: string, metrics: ExtractedMetric[]): ExtractedMetric | undefined {
  if (!metrics.length) return undefined;
  if (metrics.length === 1) return metrics[0];

  const lower = rawText.toLowerCase();
  const typePriority: Record<ExtractedMetric['type'], number> = {
    multiplier: 5,
    throughput: 4,
    latency: 4,
    percent: 3,
    general: 2,
    memory: 1,
  };

  let best = metrics[0];
  let bestScore = -Infinity;

  for (const m of metrics) {
    const idx = lower.indexOf(m.raw.toLowerCase());
    const clause =
      idx >= 0 ? lower.slice(Math.max(0, idx - 75), Math.min(lower.length, idx + m.raw.length + 55)) : lower;

    let score = typePriority[m.type] ?? 0;
    if (/\b(?:reduced|reduce|cut|cuts|slashed|slash|dropped|drop|down\s+to|faster|speedup|improved|saved|lower|boosted|reached)\b/.test(clause)) {
      score += 14;
    }
    if (/\b(?:trade-?off|increased|increase|overhead|footprint|spend|burn|deficit|spiked|loss)\b/.test(clause)) {
      score -= 16;
    }
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }

  return best;
}

/**
 * Universal Entity & Comparison Parser:
 * Dissects comparison clauses (A vs B, Modern vs Legacy) and attributes facts/metrics to both sides.
 */
export function parseComparativeEntities(rawText: string, metrics: ExtractedMetric[]): ExtractedEntities {
  const sentences = rawText
    .replace(/https?:\/\/\S+/g, '')
    .split(/[\r\n]+|(?<=[a-zA-Z0-9)\]])\.\s+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  let leftName = '';
  let rightName = '';
  const leftSegments: string[] = [];
  const rightSegments: string[] = [];

  for (const sentence of sentences) {
    const comparedLead = sentence.match(/^compared\s+(?:to|with)\s+(.+?)(?:,|;|:)\s*(.+)$/i);
    if (comparedLead?.[1] && comparedLead[2]) {
      const leftCandidate = normalizeComparisonName(comparedLead[1]);
      const rightCandidate = normalizeComparisonName(comparedLead[2]);
      if (!leftName && leftCandidate) leftName = leftCandidate;
      if (!rightName && rightCandidate) rightName = rightCandidate;
      leftSegments.push(comparedLead[1]);
      rightSegments.push(comparedLead[2]);
      continue;
    }

    const parts = sentence.split(COMPARISON_SEPARATOR);
    if (parts.length >= 2) {
      const leftPart = parts[0];
      const rightPart = parts.slice(1).join(' ');
      const leftCandidate = normalizeComparisonName(leftPart);
      const rightCandidate = normalizeComparisonName(rightPart);

      if (!leftName && leftCandidate) leftName = leftCandidate;
      if (!rightName && rightCandidate) rightName = rightCandidate;
      if (!leftPart.includes(':')) leftSegments.push(leftPart);
      if (!rightPart.includes(':')) rightSegments.push(rightPart);
    }
  }

  if (!leftName || !rightName) {
    if (/\b(?:rust|actix|axum)\b/i.test(rawText) && mentionsGoLanguage(rawText)) {
      leftName = /gin/i.test(rawText) ? 'Go Gin API' : 'Go Runtime';
      rightName = /\bactix\b/i.test(rawText) ? 'Rust Actix-web' : /\baxum\b/i.test(rawText) ? 'Rust Axum' : 'Rust Engine';
    } else if (/\bpostgres(?:ql)?\b/i.test(rawText) && /\bmysql\b/i.test(rawText)) {
      leftName = 'MySQL Stack';
      rightName = 'PostgreSQL';
    } else if (/\bkafka\b/i.test(rawText) && /\brabbitmq\b/i.test(rawText)) {
      leftName = 'RabbitMQ Queue';
      rightName = 'Apache Kafka';
    } else if (/\b(?:redis|valkey)\b/i.test(rawText) && /\bmemcached\b/i.test(rawText)) {
      leftName = 'Memcached';
      rightName = /\bvalkey\b/i.test(rawText) ? 'Valkey' : 'Redis';
    }
  }

  const isComparative = Boolean(leftName && rightName);
  if (isComparative) {
    leftName = canonicalizeEntity(leftName, rawText);
    rightName = canonicalizeEntity(rightName, rawText);
  } else {
    // Single system optimization: Modern vs Legacy baseline
    leftName = 'Legacy Architecture';
    rightName = 'Modern System Design';
  }

  const leftBullets: string[] = [];
  const rightBullets: string[] = [];
  const pushMetric = (target: string[], metric: ExtractedMetric) => {
    if (target.length >= 3) return;
    const bullet = formatMetricBullet(metric);
    if (!target.includes(bullet)) target.push(bullet);
  };

  for (const segment of leftSegments) {
    for (const metric of scanMetrics(segment)) pushMetric(leftBullets, metric);
  }
  for (const segment of rightSegments) {
    for (const metric of scanMetrics(segment)) pushMetric(rightBullets, metric);
  }

  for (const sentence of sentences) {
    const colonIndex = sentence.indexOf(':');
    if (colonIndex >= 0) {
      const heading = sentence.slice(0, colonIndex);
      const headingIsLeft = entityMentionedInClause(leftName, heading);
      const headingIsRight = entityMentionedInClause(rightName, heading);
      const headingSide = headingIsLeft !== headingIsRight ? (headingIsLeft ? leftBullets : rightBullets) : null;

      const bodyClauses = sentence
        .slice(colonIndex + 1)
        .split(/[(),;]+|\bwhile\b|\bwhereas\b/i)
        .map((clause) => clause.trim())
        .filter(Boolean);

      for (const clause of bodyClauses) {
        const isLeft = entityMentionedInClause(leftName, clause);
        const isRight = entityMentionedInClause(rightName, clause);
        const target = isLeft !== isRight ? (isLeft ? leftBullets : rightBullets) : headingSide;
        if (!target) continue;
        for (const metric of scanMetrics(clause)) pushMetric(target, metric);
      }
      continue;
    }

    const clauses = sentence.split(/[(),;]+|\bwhile\b|\bwhereas\b/i).map((clause) => clause.trim());
    for (const clause of clauses) {
      if (!clause) continue;
      const isLeft = entityMentionedInClause(leftName, clause);
      const isRight = entityMentionedInClause(rightName, clause);
      if (isLeft === isRight) continue;

      for (const metric of scanMetrics(clause)) {
        pushMetric(isLeft ? leftBullets : rightBullets, metric);
      }
    }
  }

  // Populate dynamic fallbacks if explicit numbers weren't segmented
  if (leftBullets.length === 0) {
    leftBullets.push('• Baseline execution model');
    leftBullets.push('• Higher resource consumption');
    leftBullets.push('• Runtime overhead under load');
  }
  if (rightBullets.length === 0) {
    const topMetric = metrics[0]?.value || 'Measurable throughput win';
    rightBullets.push(`• ${topMetric}`);
    rightBullets.push('• Optimized execution path');
    rightBullets.push('• Lower resource consumption');
  }

  return {
    isComparative,
    leftTitle: leftName,
    leftShort: leftName.split(' ')[0],
    leftBullets: leftBullets.slice(0, 3),
    leftLogo: resolveTechLogo(leftName),
    rightTitle: rightName,
    rightShort: rightName.split(' ')[0],
    rightBullets: rightBullets.slice(0, 3),
    rightLogo: resolveTechLogo(rightName),
  };
}
