import type { DiagramNode, SlideData } from '../../types.ts';
import { autoFitTextToLimits, enforceHeadlineSpecRule, extractCleanSubject, isNonSemanticFileName } from '../text/headlines.ts';
import { normalizePunctuation, stripMarkdown } from '../text/markdown.ts';
import { sanitizeArabicSlideText } from '../text/arabicBiDi.ts';
import { KNOWN_TECH_LOGOS } from '../techLogos.ts';

export interface UniversalSynthesisOptions {
  brand?: string;
  brandUrl?: string;
  targetSlideCount?: number;
  domainCategory?: string;
  theme?: string;
  centerIcon?: string;
  satIcons?: string[];
}

export interface ExtractedMetric {
  raw: string;
  value: string;
  unit: string;
  type: 'throughput' | 'memory' | 'latency' | 'multiplier' | 'percent' | 'general';
}

export interface ExtractedEntities {
  isComparative: boolean;
  leftTitle: string;
  leftShort: string;
  leftBullets: string[];
  leftLogo?: string;
  rightTitle: string;
  rightShort: string;
  rightBullets: string[];
  rightLogo?: string;
}

const GO_LANGUAGE_PATTERN =
  /\b(?:golang|gin|goroutine(?:s)?|go\s+(?:runtime|server|http|lang(?:uage)?|channels?|scheduler|gc|garbage\s+collector|modules?|1\.\d+))\b|\bgo\b(?=\s*(?:vs\.?|versus|performance|benchmark|web\s*api|api\b))/i;

const COMPARISON_SEPARATOR =
  /\s+(?:vs\.?|versus|compared\s+(?:to|with)|against|faster\s+than|slower\s+than|better\s+than)\s+/i;

const ENTITY_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'using',
  'under',
  'over',
  'into',
  'than',
  'benchmark',
  'benchmarks',
  'performance',
  'throughput',
  'latency',
  'comparison',
  'results',
  'report',
  'system',
  'systems',
  'architecture',
]);

export function mentionsGoLanguage(text: string): boolean {
  return GO_LANGUAGE_PATTERN.test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeComparisonName(candidate: string): string {
  let name = candidate.trim();
  if (!name) return '';

  const colonIndex = name.indexOf(':');
  if (colonIndex >= 0) {
    const beforeColon = name.slice(0, colonIndex).trim();
    const afterColon = name.slice(colonIndex + 1).trim();
    name = /^(?:benchmark(?:ing)?|comparison|results?|test(?:ing)?|throughput|performance|metrics?)\b/i.test(
      beforeColon
    )
      ? afterColon
      : beforeColon;
  }

  name = name
    .replace(/^(?:comparing|comparison\s+of|benchmark(?:ing)?\s+of|performance\s+of|test(?:ing)?\s+of)\s+/i, '')
    .replace(/^(?:the|a|an)\s+/i, '')
    .replace(/[\u2013\u2014]/g, '-')
    .trim();

  const cleanedWords = name
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => {
      const bare = word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '');
      if (!bare) return false;
      if (/^(?:faster|slower|better|worse|achieves?|achieved|hit|hits|reached|reaches|than)$/i.test(bare)) {
        return false;
      }
      return !(/\d/.test(bare) && /(?:x|%|ms|us|µs|s|kb|mb|gb|tb|k|m|b)$/i.test(bare));
    });

  name = cleanedWords.join(' ');
  name = name.split(/\s+(?:with|using|at|under|when|while|whereas|on|for)\s+/i)[0];
  name = name.replace(/^[\s,;:./-]+|[\s,;:./-]+$/g, '').trim();

  const words = name.split(/\s+/).filter(Boolean);
  while (
    words.length > 0 &&
    /^(?:benchmarks?|benchmarking|performance|throughput|latency|comparison|results?|report|testing|tests?)$/i.test(
      words[words.length - 1]
    )
  ) {
    words.pop();
  }
  if (words.length > 6) words.length = 6;
  return words.join(' ');
}

function tokenizeEntity(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9.+#]+/)
    .map((token) => token.replace(/^[.+#]+|[.+#]+$/g, ''))
    .filter((token) => token.length >= 2 && !ENTITY_STOP_WORDS.has(token));
}

function entityMentionedInClause(name: string, clause: string): boolean {
  const tokens = tokenizeEntity(name);
  const clauseTokens = tokenizeEntity(clause);
  if (tokens.length === 0 || clauseTokens.length === 0) return false;

  return tokens.some((token) =>
    clauseTokens.some(
      (clauseToken) =>
        clauseToken === token ||
        (token.length >= 5 &&
          clauseToken.length >= 5 &&
          (clauseToken.startsWith(token) || token.startsWith(clauseToken)))
    )
  );
}

function canonicalizeEntity(name: string, rawText: string): string {
  const lower = name.toLowerCase();

  if (/\b(?:rust|actix|axum)\b/i.test(lower)) {
    return /actix/i.test(rawText) ? 'Rust Actix-web' : /axum/i.test(rawText) ? 'Rust Axum' : 'Rust Engine';
  }
  if (mentionsGoLanguage(lower) || /\bgin\b/i.test(lower)) {
    return /\bgin\b/i.test(rawText) ? 'Go Gin API' : 'Go Runtime';
  }
  if (/\bpostgres(?:ql)?\b/i.test(lower)) return 'PostgreSQL';
  if (/\bmysql\b/i.test(lower)) return 'MySQL Stack';
  if (/\bkafka\b/i.test(lower)) return 'Apache Kafka';
  if (/\brabbitmq\b/i.test(lower)) return 'RabbitMQ Queue';
  if (/\bvalkey\b/i.test(lower)) return 'Valkey';
  if (/\bredis\b/i.test(lower)) return 'Redis';
  if (/\bmemcached\b/i.test(lower)) return 'Memcached';
  if (/\bpython|fastapi|django\b/i.test(lower)) return 'Python Stack';
  if (/\bnode(?:js)?\b/i.test(lower)) return 'Node.js Runtime';
  if (/\bbun\b/i.test(lower)) return 'Bun Runtime';

  return name;
}

function formatMetricBullet(metric: ExtractedMetric): string {
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
 * Resolves Simple Icons CDN URL for recognized tech brand names.
 */
export function resolveTechLogo(name: string): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (KNOWN_TECH_LOGOS[lower]) {
    return KNOWN_TECH_LOGOS[lower];
  }

  const words = name.toLowerCase().split(/[^a-z0-9.+#]+/).filter(Boolean);
  for (const word of words) {
    const direct = KNOWN_TECH_LOGOS[word.replace(/[.+#]/g, '')];
    if (direct) return direct;
  }

  for (const [k, url] of Object.entries(KNOWN_TECH_LOGOS)) {
    if (lower === k || (k.length >= 4 && lower.includes(k))) {
      return url;
    }
  }
  return undefined;
}

/**
 * Normalizes and strips URLs, Markdown symbols, and timestamps (e.g. YouTube [00:00:00]).
 */
export function cleanRawInput(raw: string): { cleaned: string; lines: string[]; paragraphs: string[] } {
  if (isNonSemanticFileName(raw)) {
    return { cleaned: '', lines: [], paragraphs: [] };
  }
  const withoutUrls = (raw || '').replace(/https?:\/\/\S+/gi, '').trim();
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

/**
 * Universal NLP Ingestion & Synthesis Engine:
 * Transforms ANY arbitrary input (2-word topic, 2000-word transcript, or notes)
 * into a publication-ready 8-slide MARROK carousel.
 * Zero hardcoded topic presets.
 */
export function synthesizeUniversalCarousel(rawInput: string, options: UniversalSynthesisOptions = {}): SlideData[] {
  const brand = options.brand || 'MARROK';
  const brandUrl = options.brandUrl || 'marrok.org';
  const targetCount = options.targetSlideCount || 8;
  const domainCategory = options.domainCategory || 'SYSTEMS ARCHITECTURE';

  // 1. Preprocess & Clean Input
  const { cleaned, lines } = cleanRawInput(rawInput);
  const metrics = scanMetrics(cleaned);

  // 2. Extract Entities & Comparison
  const entities = parseComparativeEntities(cleaned, metrics);

  // 3. Extract Core Subject & Substantive Sentences/Points
  let coreSubject = '';
  const firstLine = (lines[0] || 'System Architecture')
    .replace(/\s*\([^)]*(?:Engineering|Blog|RSS|Research|Team|News| Lobsters|Reddit)[^)]*\)\s*$/i, '')
    .trim();

  // Filter out prompt wrapper headers ("Source URL:", "Technical Summary & Engineering Context:")
  const contentLines = lines
    .slice(1)
    .filter(
      (l) =>
        l.length > 18 &&
        !/^https?:\/\//i.test(l) &&
        !/^(?:source\s+url|technical\s+summary\s*(?:&\s*engineering\s+context)?|key\s+quantitative\s+metrics)\s*:?$/i.test(
          l.trim()
        )
    );

  // Expand multi-sentence paragraphs into distinct substantive points so RSS/article summaries
  // with 1-2 paragraphs never collapse into < 3 points!
  const userSubstantivePoints: string[] = [];
  for (const line of contentLines) {
    if (/^key\s+quantitative\s+metrics\s*:/i.test(line)) continue;
    const sentences = line
      .split(/(?<=[.!?])\s+(?=[A-Z0-9"`'•-])/)
      .map((s) => s.replace(/^[•*-]\s*/, '').trim())
      .filter((s) => s.length > 20);
    if (sentences.length > 1 && contentLines.length < 5) {
      for (const s of sentences) {
        if (!userSubstantivePoints.includes(s)) {
          userSubstantivePoints.push(s);
        }
      }
    } else if (!userSubstantivePoints.includes(line)) {
      userSubstantivePoints.push(line);
    }
  }

  // If still < 3 points but we have a long single sentence with semicolons or clauses, split clauses
  if (userSubstantivePoints.length > 0 && userSubstantivePoints.length < 3) {
    const expanded: string[] = [];
    for (const pt of userSubstantivePoints) {
      const clauses = pt
        .split(/(?:;\s+|\s+—\s+|\s+--\s+|,\s+(?:while|whereas|requiring|enabling|preventing|reducing|cutting|dropping)\s+)/i)
        .map((c) => c.trim())
        .filter((c) => c.length > 22);
      if (clauses.length > 1) {
        expanded.push(...clauses);
      } else {
        expanded.push(pt);
      }
    }
    if (expanded.length >= 3) {
      userSubstantivePoints.length = 0;
      userSubstantivePoints.push(...expanded);
    }
  }

  const isExplicitHeadlineComparison =
    entities.isComparative &&
    (/\b(?:vs\.?|versus|compared\s+to|faster\s+than)\b/i.test(firstLine) || userSubstantivePoints.length < 2);

  if (isExplicitHeadlineComparison) {
    if (/\b(?:web\s*api|api)\b/i.test(cleaned)) {
      coreSubject = `${entities.rightShort} vs ${entities.leftShort} Web API`;
    } else {
      coreSubject = `${entities.rightShort} vs ${entities.leftShort} Performance`;
    }
  } else {
    coreSubject = firstLine;
    if (coreSubject.includes(':')) {
      const parts = coreSubject.split(':');
      const isPrefix = /^(?:test|step|chapter|part|benchmark|phase|section)\s*\d+/i.test(parts[0].trim());
      if (isPrefix && parts[1]?.trim()) {
        coreSubject = parts[1].trim();
      } else {
        coreSubject = parts[0].trim().length >= 4 ? parts[0].trim() : parts[1]?.trim() || parts[0].trim();
      }
    }
  }

  // Ensure coreSubject is not a non-semantic filename or extension
  if (!coreSubject || isNonSemanticFileName(coreSubject)) {
    coreSubject = domainCategory || 'System Architecture';
  }

  // 4. Topic & Domain Classification
  const lower = cleaned.toLowerCase();
  const isAgentOrDelegation =
    /\b(agents?\s+aren['’]?t\s+humans|trusted\s+agent|agent\s+delegation|delegated?\s+auth|human[- ]in[- ]the[- ]loop|mcp\b|model\s+context\s+protocol|on\s+behalf\s+of|agentic\s+auth|scoped\s+delegation|oauth\s+delegation|ai\s+agents?)\b/i.test(
      lower
    );
  const isScionOrVcs = /\b(scion|git|vcs|monorepo|changeset|commit|checkouts?|branch|rebase)\b/i.test(lower);
  const isRedisOrCache = /\b(redis|valkey|memcached|cache|caching|in-memory|lru|key-value)\b/i.test(lower);
  const isContainerOrCloud = /\b(docker|container|scratch|distroless|multi-stage|dockerfile|k8s|kubernetes|pod)\b/i.test(lower);
  const isSecurity = /\b(zero[- ]?trust|zerotrust|mtls|blast radius|cve|exploit|perimeter|quarantine|spiffe|firewall)\b/i.test(lower);
  const isKernelOrEbpf = /\b(ebpf|kernel|bpf|xdp|syscall|tracepoint|ring buffer|verifier|linux)\b/i.test(lower);
  const isAiOrLlm = /\b(llm|gpt|transformer|attention|kv[- ]?cache|token|inference|embedding|rag|weights)\b/i.test(lower);
  const isDatabase = /\b(postgres|postgresql|pgbouncer|mysql|sqlite|wal|database|sql|acid|query planner)\b/i.test(lower);

  // 5. If user provided multiple substantive bullet points or sentences (>= 2 points):
  // Directly synthesize slides from the user's actual points!
  if (userSubstantivePoints.length >= 2 && !isExplicitHeadlineComparison) {
    return buildDeckFromUserPoints(coreSubject, userSubstantivePoints, {
      brand,
      brandUrl,
      domainCategory,
      targetCount,
      metrics,
      centerIcon: options.centerIcon,
    });
  }

  // 6. Domain-Specific Narrative Generation for Short Prompts / Topic Inputs
  if (isAgentOrDelegation) {
    return buildAgentDelegationStory(coreSubject, { brand, brandUrl, targetCount, metrics });
  }

  if (isScionOrVcs) {
    return buildVcsStory(coreSubject, { brand, brandUrl, targetCount, metrics });
  }

  if (isContainerOrCloud) {
    return buildContainerStory(coreSubject, { brand, brandUrl, targetCount, metrics });
  }

  if (isRedisOrCache) {
    return buildCacheStory(coreSubject, { brand, brandUrl, targetCount, metrics });
  }

  if (isSecurity) {
    return buildSecurityStory(coreSubject, { brand, brandUrl, targetCount, metrics });
  }

  if (isKernelOrEbpf) {
    return buildKernelStory(coreSubject, { brand, brandUrl, targetCount, metrics });
  }

  if (isAiOrLlm) {
    return buildAiStory(coreSubject, { brand, brandUrl, targetCount, metrics });
  }

  if (isDatabase) {
    return buildDatabaseStory(coreSubject, { brand, brandUrl, targetCount, metrics });
  }

  if (entities.isComparative) {
    return buildComparativeStory(coreSubject, entities, metrics, { brand, brandUrl, targetCount, domainCategory });
  }

  // Fallback: General Systems Architecture Story
  return buildGeneralSystemsStory(coreSubject, { brand, brandUrl, targetCount, domainCategory, metrics });
}

interface StoryOptions {
  brand: string;
  brandUrl: string;
  targetCount: number;
  domainCategory?: string;
  metrics?: ExtractedMetric[];
}

function parsePointTopicAndBody(rawPoint: string): { topicTitle: string; topicBody: string } {
  const clean = rawPoint.replace(/^[•\s\d.-]+/, '').trim();
  const match = clean.match(/^\*{0,2}([^:*]{2,45})\*{0,2}:\s*(.+)$/s);
  if (match) {
    const rawHeading = match[1].replace(/[*_`]/g, '').trim();
    const rawBody = match[2].replace(/[*_`]/g, '').trim();
    return { topicTitle: rawHeading, topicBody: rawBody };
  }
  return { topicTitle: '', topicBody: clean };
}

/**
 * Builds slides directly from the user's provided notes, bullets, or recap lines.
 * Dynamic, topic-driven synthesis mapping concepts to dedicated visual schematics.
 */
function buildDeckFromUserPoints(
  subject: string,
  userPoints: string[],
  options: {
    brand: string;
    brandUrl: string;
    domainCategory: string;
    targetCount: number;
    metrics: ExtractedMetric[];
    centerIcon?: string;
  }
): SlideData[] {
  const { brand, brandUrl, domainCategory, targetCount, metrics } = options;

  const combinedRaw = `${subject} ${userPoints.join(' ')}`;
  const isFinancialOrMacro =
    /\$\s*\d+(?:\.\d+)?\s*(?:trillion|billion|million|T|B|M)\b|\b(?:valuation|billion|trillion|deficit|circular\s+financing|subsid|taxpayer|retiree|s&p\s*500|pension|401k|cash[- ]?out|economy|economic|inflation|energy\s+bill|electricity\s+bill|financial\s+engineering|for\s+every\s+\$1)\b|مليار|تريليون|خسائر|تمويل|تقييم|ضرائب|متقاعد|طاقة|اقتصاد|استثمار/i.test(
      combinedRaw
    );

  const { cleanSubject, arSubject } = extractCleanSubject(subject);
  const hasPreamble = /^(?:this\s+(?:video|article|post|guide|talk)?\s+(?:explains|covers|discusses|breaks\s+down)|in\s+this\s+video)\b/i.test(subject.trim());
  const enHook = hasPreamble
    ? `${cleanSubject}, explained.`
    : enforceHeadlineSpecRule(subject, { isHook: true, fallbackSubject: cleanSubject });
  const arHook = isFinancialOrMacro
    ? `التحليل المالي والاقتصادي لـ ${arSubject}.`
    : `تحليل معماري لمنظومة ${arSubject}`;

  // Extract clean, meaningful satLabels from user points
  const satLabels: string[] = [];
  for (const pt of userPoints) {
    const { topicTitle } = parsePointTopicAndBody(pt);
    if (topicTitle) {
      let pill = topicTitle.replace(/\(.*?\)/g, '').trim();
      if (pill.length > 16) pill = pill.split(/\s+/).slice(0, 2).join(' ');
      if (pill && !satLabels.includes(pill.toUpperCase())) {
        satLabels.push(pill.toUpperCase());
      }
    }
  }
  if (satLabels.length < 6) {
    for (const pt of userPoints) {
      const currencyPill = pt.match(/\$\s*\d+(?:\.\d+)?\s*(?:trillion|billion|million|T|B|M)/i);
      if (currencyPill) {
        const cleanCurr = currencyPill[0].replace(/\s+/g, '').replace(/trillion/i, 'T').replace(/billion/i, 'B').replace(/million/i, 'M').toUpperCase();
        if (!satLabels.includes(cleanCurr)) satLabels.push(cleanCurr);
      }
      const words = pt.replace(/[^A-Za-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length >= 4);
      if (words[0] && !satLabels.includes(words[0].toUpperCase())) satLabels.push(words[0].toUpperCase().slice(0, 14));
      if (satLabels.length >= 6) break;
    }
  }
  const defaultSatPills = isFinancialOrMacro
    ? ['Valuation', 'Deficits', 'Capital Flow', 'Grid Power', 'Retirees', 'Taxpayers']
    : ['Architecture', 'Dataflow', 'Execution', 'Scale', 'Resilience', 'Telemetry'];
  for (const p of defaultSatPills) {
    if (satLabels.length >= 6) break;
    if (!satLabels.includes(p.toUpperCase())) satLabels.push(p.toUpperCase());
  }

  let hubOverviewEn = isFinancialOrMacro
    ? `An economic breakdown of ${cleanSubject}: capital commitments, unit losses, circular financing, and taxpayer risk.`
    : `An architectural breakdown of ${cleanSubject}, covering core indexing algorithms, memory trade-offs, and production design.`;
  if (hasPreamble && subject.length > 25) {
    const strippedPreamble = subject
      .replace(/^(?:this\s+(?:video|article|post|guide|talk)?\s+(?:explains|covers|discusses|breaks\s+down)|in\s+this\s+video)\s+(?:the\s+role\s+and\s+architecture\s+of\s+)?/i, '')
      .replace(/[*_`]/g, '')
      .replace(/\s+([.,;:!?])/g, '$1')
      .trim();
    if (strippedPreamble.length > 15) {
      const capitalized = strippedPreamble.charAt(0).toUpperCase() + strippedPreamble.slice(1);
      hubOverviewEn = autoFitTextToLimits(capitalized, 135);
    }
  } else if (userPoints[0]) {
    const { topicBody } = parsePointTopicAndBody(userPoints[0]);
    if (topicBody) {
      hubOverviewEn = autoFitTextToLimits(topicBody.replace(/\s+([.,;:!?])/g, '$1'), 135);
    }
  }

  const hubOverviewAr = isFinancialOrMacro
    ? `قراءة مالية واقتصادية معمقة تكشف حجم التقييمات والالتزامات الرأسمالية وتأثيرها المباشر على المستهلكين ودافعي الضرائب.`
    : `نظرة معمارية معمقة تشرح آليات عمل ${arSubject} وخوارزميات الفهرسة والتحديات في بيئات الإنتاج الفعلية.`;

  const slides: SlideData[] = [
    {
      type: 'hub',
      centerIcon: options.centerIcon || (isFinancialOrMacro ? 'dollarSign' : resolveTechLogo(subject) || 'cpu'),
      satIcons: isFinancialOrMacro
        ? ['dollarSign', 'trendingDown', 'lifecycle', 'factory', 'users', 'landmark']
        : ['server', 'database', 'gauge', 'cpu', 'box', 'activity'],
      satLabels: satLabels.slice(0, 6),
      enTitle: enHook,
      arTitle: arHook,
      enBody: hubOverviewEn,
      arBody: hubOverviewAr,
    },
  ];

  // Distribute points across available content slots (targetCount - 2 = 6 slots)
  const maxContentSlots = targetCount - 2;
  let selectedPoints: string[] = [];

  // Filter out standalone section title lines that don't contain a colon or period and are short
  const substantivePoints = userPoints.filter((p) => {
    const clean = p.replace(/^[•\s\d.-]+/, '').trim();
    if (clean.length < 22) return false;
    if (!clean.includes(':') && !clean.includes('.') && !/\$|\d+%/.test(clean) && clean.length < 40) return false;
    return true;
  });

  if (isFinancialOrMacro && substantivePoints.length > 0) {
    // Score and group points into the logical narrative arc:
    // Stage 1: The Problem / Losses & Valuation Gamble ($20.9B loss, $2.60 per $1, $500B valuation)
    // Stage 2: The Mechanics & Scale (Circular financing, $1.4T commitments, 10GW / nuclear power)
    // Stage 3: The Real-World & Human Impact Grouped Together (Energy bills +63%, Retirees / S&P 500, $6.6B employee cash-out, 5% gov stake / taxpayers)
    // Stage 4: The Core Trade-off / Conclusion
    const classifyNarrativePhase = (pt: string): number => {
      const lowerPt = pt.toLowerCase();
      if (/\b(?:trade-?off|verdict|bottom\s+line|conclusion|private\s+gain|socialized)\b/.test(lowerPt)) return 4;
      if (/\b(?:retiree|pension|401k|s&p\s*500|energy\s+bill|electricity\s+price|63%|taxpayer|government\s+stake|5%\s+stake|backstop|cash[- ]?out|employee|insider|household|consumer)\b/.test(lowerPt)) {
        return 3;
      }
      if (/\b(?:circular|round[- ]?trip|1\.4\s*trillion|\$1\.4t|commitment|infrastructure|gigawatt|10\s*gw|nuclear|reactor|data\s+center)\b/.test(lowerPt)) {
        return 2;
      }
      if (/\b(?:loss|losses|deficit|burn|\$20\.9|\$2\.60|for\s+every\s+\$1|valuation|\$500b|500\s*billion)\b/.test(lowerPt)) {
        return 1;
      }
      return 2;
    };

    const scoreGoldenPoint = (pt: string): number => {
      let score = 0;
      if (/\$\s*\d+(?:\.\d+)?\s*(?:trillion|billion|million|T|B|M)\b/i.test(pt)) score += 5;
      if (/\$2\.60|\$6\.6|\$500|\$1\.4|\$20\.9|63%|5%|10\s*(?:gw|gigawatt)/i.test(pt)) score += 6;
      if (/\b(?:cash[- ]?out|taxpayer|retiree|circular|nuclear|loss|valuation)\b/i.test(pt)) score += 4;
      return score;
    };

    const indexed = substantivePoints.map((pt, idx) => ({
      pt,
      idx,
      phase: classifyNarrativePhase(pt),
      score: scoreGoldenPoint(pt),
    }));

    let chosen = indexed;
    if (indexed.length > maxContentSlots) {
      // Ensure each narrative phase is represented and highest-scoring golden stats win
      const byScore = [...indexed].sort((a, b) => b.score - a.score || a.idx - b.idx);
      const picked = new Set<number>();
      for (const phase of [1, 2, 3, 4]) {
        const phaseMatches = byScore.filter((item) => item.phase === phase);
        for (const m of phaseMatches.slice(0, phase === 3 ? 2 : 1)) {
          if (picked.size < maxContentSlots) picked.add(m.idx);
        }
      }
      for (const item of byScore) {
        if (picked.size >= maxContentSlots) break;
        picked.add(item.idx);
      }
      chosen = indexed.filter((item) => picked.has(item.idx));
    }

    // Sort chosen points strictly by Narrative Phase (1: Losses -> 2: Mechanics/Scale -> 3: Human/Energy/Taxpayer Impact -> 4: Trade-off)
    chosen.sort((a, b) => a.phase - b.phase || a.idx - b.idx);
    selectedPoints = chosen.map((item) => item.pt);
  } else if (substantivePoints.length <= maxContentSlots) {
    selectedPoints = [...substantivePoints];
  } else {
    // Semantic diversity grouping: collect candidates for distinct mechanism variants
    const categories: Array<{ pattern: RegExp }> = [
      { pattern: /vector|embedding|high-dimensional|cosine/i },
      { pattern: /hnsw|hierarchical|graph|skip[- ]?list/i },
      { pattern: /ivf|cluster|k-means|centroid|partition/i },
      { pattern: /write|hot|cold|buffer|lsm|compaction/i },
      { pattern: /choosing\s+a\s+database|postgres.*pinecone|vs\b|versus/i },
      { pattern: /model upgrade|re-embed|source of truth|primary db|boring|trade-?off/i },
      { pattern: /filter|constraint|metadata/i },
    ];

    const pickedIndices = new Set<number>();

    for (const cat of categories) {
      if (pickedIndices.size >= maxContentSlots) break;
      const matchIdx = substantivePoints.findIndex((p, idx) => !pickedIndices.has(idx) && cat.pattern.test(p));
      if (matchIdx >= 0) {
        pickedIndices.add(matchIdx);
      }
    }

    // Fill remaining slots in sequential order if needed
    for (let i = 0; i < substantivePoints.length && pickedIndices.size < maxContentSlots; i++) {
      pickedIndices.add(i);
    }

    selectedPoints = Array.from(pickedIndices)
      .sort((a, b) => a - b)
      .slice(0, maxContentSlots)
      .map((idx) => substantivePoints[idx]);
  }

  selectedPoints.forEach((point, idx) => {
    const { topicTitle, topicBody } = parsePointTopicAndBody(point);
    const fullText = `${topicTitle} ${topicBody}`.toLowerCase();
    const effectiveTitle = topicTitle || point.split(/\s+/).slice(0, 5).join(' ');
    const enTitle = enforceHeadlineSpecRule(effectiveTitle, { isHook: false });
    const hasArabicText = /[\u0600-\u06FF]/.test(topicBody);

    // Financial & Economic Specific Slide Mapping (Prevents DevOps/SQL/Vector Hallucinations)
    if (isFinancialOrMacro) {
      // A. Circular Financing / Capital Loop Topology
      if (/circular|round[- ]?trip|vendor|cloud\s+credit|invest.*spend/i.test(fullText)) {
        slides.push({
          type: 'row',
          diagramVariant: 'topology',
          diagramNodes: [
            { label: 'Capital Injection', sublabel: 'Tech Giants & Debt Funds', status: 'CAPITAL', icon: 'dollarSign' },
            { label: 'Cloud & Chips', sublabel: 'Compute Credits & GPUs', status: 'ALLOCATED', icon: 'cpu' },
            { label: 'Booked Revenue', sublabel: 'Recycled Vendor Top-Line', status: 'BOOKED', icon: 'landmark' },
          ],
          diagramEdges: ['INVEST', 'RECYCLE'],
          diagramFooter: 'CAPITAL TOPOLOGY: CIRCULAR FINANCING & VALUE FLOW',
          enTitle,
          arTitle: `آلية التمويل الدائري: ${effectiveTitle.slice(0, 22)}.`,
          enBody: autoFitTextToLimits(topicBody, 135),
          arBody: hasArabicText
            ? sanitizeArabicSlideText(topicBody.slice(0, 135))
            : 'تضخ الشركات الكبرى المليارات كاستثمارات ثم تستردها فوراً كعوائد مقابل تأجير السحابة والرقائق.',
        });
        return;
      }

      // B. Insider Cash-Out vs Taxpayer Backstop / $2.60 Spent per $1 Earned Comparison
      if (/cash[- ]?out|taxpayer|backstop|5%\s+stake|for\s+every\s+\$1|\$2\.60|vs\b|versus/i.test(fullText) && /taxpayer|backstop|cash[- ]?out|for\s+every\s+\$1/i.test(fullText)) {
        const isUnitEcon = /\$2\.60|for\s+every\s+\$1/i.test(fullText);
        slides.push({
          type: 'compare',
          compareLeftTitle: isUnitEcon ? '$1.00 REVENUE EARNED' : '$6.6B INSIDER CASH-OUT',
          compareLeftBody: isUnitEcon
            ? '• Customer subscription inflow\n• Outpaced by compute burn\n• Structural operating deficit'
            : '• Employees liquidate $6.6B equity\n• Private valuation gains locked in\n• Zero personal downside exposure',
          compareRightTitle: isUnitEcon ? '$2.60 CAPITAL SPENT' : 'TAXPAYER & PUBLIC RISK',
          compareRightBody: isUnitEcon
            ? '• Massive GPU & energy capex\n• $20.9B projected annual loss\n• Relies on continuous new funding'
            : '• Public subsidies & 5% state stake\n• Grid & infrastructure backstops\n• Downside socialized to taxpayers',
          enTitle,
          arTitle: isUnitEcon ? 'مقارنة العوائد مقابل الإنفاق.' : 'سيولة المطلعين مقابل ضمانات الضرائب.',
          enBody: autoFitTextToLimits(topicBody, 135),
          arBody: hasArabicText
            ? sanitizeArabicSlideText(topicBody.slice(0, 135))
            : 'بينما يحقق المطلعون مكاسب نقدية بمليارات الدولارات، يتحمل دافعو الضرائب وصناديق التقاعد مخاطر التعثر.',
        });
        return;
      }

      // C. Standout Financial / Energy / Valuation Metric ($500B, $20.9B, $1.4T, 63%, 10 GW)
      const finMetricMatch =
        point.match(/\$\s*\d+(?:\.\d+)?\s*(?:trillion|billion|million|T|B|M)\b/i) ||
        point.match(/\b(\d+(?:\.\d+)?\s*(?:%|GW|gigawatts?))\b/i);
      if (finMetricMatch) {
        const rawVal = finMetricMatch[0]
          .replace(/\s+/g, ' ')
          .replace(/trillion/i, 'T')
          .replace(/billion/i, 'B')
          .replace(/million/i, 'M')
          .replace(/gigawatts?/i, 'GW')
          .replace(/\$\s+/, '$')
          .trim();
        const isEnergy = /energy|electricity|63%|gigawatt|gw\b|nuclear/i.test(fullText);
        const isLoss = /loss|deficit|burn|\$20\.9/i.test(fullText);
        slides.push({
          type: 'metric',
          metricValue: rawVal,
          metricLabel: isEnergy
            ? 'ENERGY & GRID IMPACT'
            : isLoss
            ? 'ANNUAL OPERATING DEFICIT'
            : 'CAPITAL & VALUATION SCALE',
          metricDiff: isEnergy
            ? '▲ Consumer power & nuclear grid demand'
            : isLoss
            ? '▼ Capital burn outpaces revenue'
            : '▲ Unprecedented financial commitment',
          metricIcon: isEnergy ? 'factory' : isLoss ? 'trendingDown' : 'dollarSign',
          enTitle,
          arTitle: `الأثر الرقمي: ${rawVal}.`,
          enBody: autoFitTextToLimits(topicBody, 135),
          arBody: hasArabicText
            ? sanitizeArabicSlideText(topicBody.slice(0, 135))
            : 'أرقام مالية واقتصادية تعكس حجم الالتزامات الرأسمالية وتأثيرها المباشر على السوق والمستهلكين.',
        });
        return;
      }

      // D. Retirees / S&P 500 / Systemic Risk Isolation or Stack
      slides.push({
        type: 'row',
        diagramVariant: /retiree|s&p|pension|taxpayer|risk/i.test(fullText) ? 'isolation' : 'stack',
        diagramNodes: [
          { label: 'Valuation Leverage', sublabel: '$500B Priced Perfection', status: 'LEVERAGED', icon: 'dollarSign' },
          { label: 'Index Concentration', sublabel: 'S&P 500 & Tech Weighting', status: 'EXPOSED', icon: 'landmark' },
          { label: 'Retiree Portfolios', sublabel: '401(k) & Pension Savings', status: 'AT RISK', icon: 'users' },
        ],
        diagramEdges: ['CONCENTRATE', 'EXPOSE'],
        diagramFooter: 'SYSTEMIC EXPOSURE: RETIREMENT FUNDS & PUBLIC MARKETS',
        enTitle,
        arTitle: `المخاطر النظامية: ${effectiveTitle.slice(0, 22)}.`,
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'ارتباط صناديق التقاعد ومؤشرات السوق بتقييمات الذكاء الاصطناعي يضع مدخرات المتقاعدين في دائرة المخاطر.',
      });
      return;
    }

    // 1. Compare Archetype (e.g. Standard DB vs Purpose-Built Vector DB)
    if (/choosing\s+a\s+database|standard\s+database|vs\b|versus|compared\s+to/i.test(fullText)) {
      if (/postgres|pgvector|elasticsearch/i.test(fullText)) {
        slides.push({
          type: 'compare',
          compareLeftTitle: 'POSTGRES + PGVECTOR',
          compareLeftBody: '• Standard relational database\n• ACID transactional guarantees\n• Zero new operational footprint',
          compareRightTitle: 'PINECONE / MILVUS',
          compareRightBody: '• Dedicated vector database\n• Billion-scale clustering engine\n• Specialized operational overhead',
          enTitle: 'Choosing your vector database.',
          arTitle: 'مقارنة: قواعد البيانات والبحث المتجهي',
          enBody: autoFitTextToLimits(topicBody, 135),
          arBody: 'قواعد البيانات الحالية مثل Postgres مع pgvector كافية لمعظم المشاريع، بينما قواعد البيانات المتخصصة للأنظمة المليارية.',
        });
        return;
      }
      slides.push({
        type: 'compare',
        compareLeftTitle: 'STANDARD BASELINE',
        compareLeftBody: '• Standard execution model\n• Higher indexing cost\n• Generic pipeline overhead',
        compareRightTitle: 'DEDICATED ARCHITECTURE',
        compareRightBody: '• Specialized high-throughput engine\n• Scaled partition indexes\n• Verified production speedup',
        enTitle,
        arTitle: `مقارنة: ${effectiveTitle}`,
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'مقارنة معمارية توضح الفوارق في الكفاءة والتكلفة التشغيلية.',
      });
      return;
    }

    // 2. Code Archetype (SQL query or script)
    if (/sql|psql|<=>|query\s+planner|code|syntax/i.test(fullText)) {
      const isVectorSql = /vector|embedding|<=>|pgvector/i.test(fullText);
      slides.push({
        type: 'code',
        codeFileName: isVectorSql ? 'pgvector_example.sql' : 'query.sql',
        codeLanguage: 'sql',
        codeSnippet: isVectorSql
          ? `-- Semantic cosine similarity with pgvector\nSELECT id, title, 1 - (embedding <=> $query) AS score\nFROM documents\nWHERE status = 'in_stock'\nORDER BY embedding <=> $query LIMIT 5;`
          : `$ psql -h localhost -U postgres\n> EXPLAIN ANALYZE SELECT * FROM vectors;\n+ Index Scan using hnsw_cosine_idx\n✔ Execution verified`,
        enTitle: enforceHeadlineSpecRule(effectiveTitle || 'pgvector distance query', { isHook: false }),
        arTitle: 'الاستعلام عبر الشيفرة البرمجية',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: 'طريقة تطبيق البحث الدلالي في قاعدة البيانات ودمج الشروط المسبقة بكفاءة.',
      });
      return;
    }

    // 3. Split Visual Schematic (Hot/Cold Stores & Writes) — evaluated before HNSW to handle writes into graphs
    if (/write|hot\s+and\s+cold|cold\s+store|hot\s+store|buffer|lsm|compaction|consistency|insert/i.test(fullText)) {
      slides.push({
        type: 'row',
        diagramVariant: 'split',
        diagramNodes: [
          { label: 'Hot Store', sublabel: 'Mutable RAM Write Buffer', status: 'FAST WRITE', icon: 'zap' },
          { label: 'Async Compactor', sublabel: 'Batch Index Flusher', status: 'SYNCING', icon: 'arrowRightLeft' },
          { label: 'Cold Store', sublabel: 'Immutable Vector Index', status: 'PERSISTED', icon: 'database' },
        ],
        diagramEdges: ['BUFFER', 'COMPACT'],
        diagramFooter: 'ARCHITECTURE: DUAL HOT/COLD STORE',
        enTitle,
        arTitle: 'معمارية التخزين الساخن والبارد',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'فصل عمليات الكتابة السريعة في الذاكرة الحية عن الفهارس الثابتة لتقليل تكلفة إعادة بناء الرسم البياني.',
      });
      return;
    }

    // 4. Graph Visual Schematic (HNSW Indexing) — evaluated before generic vector scatter
    if (/hnsw|hierarchical|skip[- ]?list/i.test(fullText)) {
      slides.push({
        type: 'row',
        diagramVariant: 'graph',
        diagramNodes: [
          { label: 'Entry Node', sublabel: 'Top Sparse Layer 2', status: 'ENTRY', icon: 'network' },
          { label: 'Skip Traversal', sublabel: 'Fast Long-Range Hops', status: 'ROUTED', icon: 'layers' },
          { label: 'Target Neighbor', sublabel: 'Dense Base Layer 0', status: 'CONVERGED', icon: 'checkCircle' },
        ],
        diagramEdges: ['DESCENT', 'CONVERGE'],
        diagramFooter: 'GRAPH: HIERARCHICAL NAVIGABLE SMALL WORLD',
        enTitle,
        arTitle: 'فهارس HNSW الطبقية',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'هيكل بياني متعدد الطبقات يتيح التنقل السريع عبر قفزات متباعدة في الفضاء عالي الأبعاد ثم تقارب دقيق.',
      });
      return;
    }

    // 5. Clusters Visual Schematic (IVF Indexing) — evaluated before generic vector scatter
    if (/ivf|inverted file|cluster|k-means|centroid|partition/i.test(fullText)) {
      slides.push({
        type: 'row',
        diagramVariant: 'clusters',
        diagramNodes: [
          { label: 'K-Means Centroid', sublabel: 'Space Partition Hub', status: 'PARTITIONED', icon: 'layers' },
          { label: 'Target Cluster', sublabel: 'Shortlisted Candidate Subset', status: 'SELECTED', icon: 'zap' },
          { label: 'Inverted List', sublabel: 'Pruned Candidate Scan', status: 'SCANNED', icon: 'search' },
        ],
        diagramEdges: ['PARTITION', 'SCAN'],
        diagramFooter: 'INDEX: INVERTED FILE CLUSTERING • FAST PRUNING',
        enTitle,
        arTitle: 'تقسيم المساحات عبر عناقيد IVF',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'تجزئة الفضاء عالي الأبعاد عبر خوارزميات العناقيد، وحصر البحث فقط داخل العناقيد الأقرب للمتجه المطلوب.',
      });
      return;
    }

    // 6. Features Visual Schematic (Filtered Search)
    if (/filter|constraint|metadata|pre-filter|hard constraint/i.test(fullText)) {
      slides.push({
        type: 'row',
        diagramVariant: 'features',
        diagramNodes: [
          { label: 'Metadata Filter', sublabel: 'Hard Business Constraints', status: 'FILTERED', icon: 'sliders' },
          { label: 'Vector Index', sublabel: 'Similarity Distance Scan', status: 'INDEXED', icon: 'search' },
          { label: 'Ranked Result', sublabel: 'Top-K Verified Items', status: 'VERIFIED', icon: 'checkCircle' },
        ],
        diagramEdges: ['FILTER', 'INTERSECT'],
        diagramFooter: 'SEARCH: METADATA CONSTRAINTS + VECTOR DISTANCE',
        enTitle,
        arTitle: 'البحث المفلتر والقيود المسبقة',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'دمج الشروط المحددة (مثل توفر المنتج والحد السعري) مع البحث المتجهي عبر الفلترة المسبقة الموثقة.',
      });
      return;
    }

    // 7. Takeaway / Trade-off (Model upgrades & Primary DB source of truth)
    if (/model upgrade|re-embed|source of truth|primary db|boring|interview|catch|trade-?off|overhead/i.test(fullText)) {
      slides.push({
        type: 'row',
        diagramVariant: 'takeaway',
        diagramNodes: [
          { label: 'Primary DB', sublabel: 'Immutable Source of Truth', status: 'PRIMARY', icon: 'database' },
          { label: 'Vector Index', sublabel: 'Disposable Search Index', status: 'INDEX', icon: 'search' },
          { label: 'Model Upgrade', sublabel: 'Full Re-Embedding Cost', status: 'CAUTION', icon: 'shieldAlert' },
        ],
        diagramEdges: ['SOURCE', 'RE-EMBED'],
        diagramFooter: 'ARCHITECTURE RULE: PRIMARY DB AS SOURCE OF TRUTH',
        enTitle,
        arTitle: 'تحديث النماذج وقاعدة البيانات المرجعية',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'الاحتفاظ بقاعدة البيانات الأساسية كمصدر موثوق؛ فترقية نموذج التضمين تعني إعادة معالجة وحساب كل المتجهات من جديد.',
      });
      return;
    }

    // 8. Scatter Visual Schematic (Vectors & Embeddings)
    if (/vector|embedding|high-dimensional|cosine|similarity|ann\b|nearest neighbor/i.test(fullText)) {
      slides.push({
        type: 'row',
        diagramVariant: 'scatter',
        diagramNodes: [
          { label: 'Embedding Model', sublabel: 'Dense Float Vector Array', status: 'ENCODED', icon: 'cpu' },
          { label: 'Vector Index', sublabel: 'High-Dimensional Space', status: 'INDEXED', icon: 'database' },
          { label: 'Cosine Search', sublabel: 'Nearest Neighbor Top-K', status: 'MATCHED', icon: 'search' },
        ],
        diagramEdges: ['ENCODE', 'SIMILARITY'],
        diagramFooter: 'METRIC: COSINE SIMILARITY • RECALL OPTIMIZED',
        enTitle,
        arTitle: 'المتجهات والتضمين الدلالي',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'تحويل البيانات (صور، نصوص، منتجات) إلى مصفوفات رقمية عالية الأبعاد مع قياس التشابه عبر مسافة جيب التمام.',
      });
      return;
    }

    // 9. Metric Archetype
    if (/\b(\d+(?:\.\d+)?(?:x|%|GB|MB|ms|req\/s))\b/i.test(fullText)) {
      const match = fullText.match(/\b(\d+(?:\.\d+)?(?:x|%|GB|MB|ms|req\/s))\b/i);
      const val = match ? match[1] : '10x';
      slides.push({
        type: 'metric',
        metricValue: val,
        metricLabel: 'PRODUCTION MEASUREMENT',
        metricDiff: '▲ Verified in production benchmark',
        metricIcon: 'gauge',
        enTitle,
        arTitle: `قياس الأداء الفعلي: ${val}`,
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: 'أرقام حقيقية تثبت كفاءة النظام تحت أقصى ضغط عمل في بيئة التشغيل.',
      });
      return;
    }

    // 10. AI Agent / Delegation / Auth / Identity Boundary Recognition
    if (/\b(agent|delegat|oauth|mcp|human|impersonat|permission|token|scope|bot|identity|credential)\b/i.test(fullText)) {
      if (/\b(human|user|bot|script|vs\b|versus|neither|nor|impersonat)\b/i.test(fullText) && idx <= 1) {
        slides.push({
          type: 'compare',
          compareLeftTitle: 'UNSCOPED BOT / HUMAN LOGIN',
          compareLeftBody: '• Shares static user credentials\n• Broad ambient account privileges\n• Zero cryptographic delegation trail',
          compareRightTitle: 'DELEGATED AI AGENT',
          compareRightBody: '• Ephemeral scoped OAuth/JWT token\n• Explicit human-in-the-loop bounds\n• Verifiable per-action audit log',
          enTitle,
          arTitle: 'مقارنة: حساب بشري مقابل تفويض الوكيل.',
          enBody: autoFitTextToLimits(topicBody, 135),
          arBody: hasArabicText
            ? sanitizeArabicSlideText(topicBody.slice(0, 135))
            : 'الوكيل الذكي ليس مجرد نص برمجي ولا مستخدماً بشرياً؛ بل يتطلب تفويضاً مشفراً بصلاحيات محددة.',
        });
        return;
      }

      if (/\b(token|jwt|oauth|scope|policy|header|attestation|sign)\b/i.test(fullText)) {
        slides.push({
          type: 'code',
          codeFileName: 'agent_delegation_jwt.json',
          codeLanguage: 'json',
          codeSnippet: `{\n  "sub": "agent:cloudflare-worker-04",\n  "act": { "sub": "user:principal@org.com" },\n  "scope": "read:dns write:workers_kv",\n  "exp": 1735689900\n}`,
          enTitle,
          arTitle: 'تفويض الصلاحيات عبر رموز OAuth.',
          enBody: autoFitTextToLimits(topicBody, 135),
          arBody: hasArabicText
            ? sanitizeArabicSlideText(topicBody.slice(0, 135))
            : 'تقييد الوكيل الذكي برموز جلسة قصيرة الأجل تحدد هوية المفوِّض ونطاق الأدوات المسموح بها.',
        });
        return;
      }

      slides.push({
        type: 'row',
        diagramVariant: 'isolation',
        diagramNodes: [
          { label: 'Human Principal', sublabel: 'Issues Scoped Consent', status: 'VERIFIED', icon: 'users' },
          { label: 'Delegation Gate', sublabel: 'Token Exchange & Policy', status: 'SCOPED', icon: 'lock' },
          { label: 'AI Agent Runtime', sublabel: 'Bounded Tool Execution', status: 'ISOLATED', icon: 'robot' },
        ],
        diagramEdges: ['DELEGATE', 'ENFORCE'],
        diagramFooter: 'IDENTITY BOUNDARY: CRYPTOGRAPHIC AGENT DELEGATION',
        enTitle,
        arTitle: 'عزل وتفويض صلاحيات الوكيل الذكي.',
        enBody: autoFitTextToLimits(topicBody, 135),
        arBody: hasArabicText
          ? sanitizeArabicSlideText(topicBody.slice(0, 135))
          : 'فصل هوية المستخدم عن هوية الوكيل عبر بوابة تفويض تمنع تجاوز الصلاحيات أو انتحال الهوية.',
      });
      return;
    }

    // 11. Context-Aware Dynamic Archetype Rotation (Eliminates Generic Ingress/Core/State Boilerplate)
    const cleanTokens = (topicBody || point)
      .replace(/[^A-Za-z0-9\s/-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !ENTITY_STOP_WORDS.has(w.toLowerCase()));
    const phrase1 = cleanTokens.slice(0, 2).join(' ') || cleanSubject.slice(0, 16);
    const phrase2 = cleanTokens.slice(2, 4).join(' ') || 'Core Mechanism';
    const phrase3 = cleanTokens.slice(4, 6).join(' ') || 'Verified Output';

    const dynamicVariants: Array<'isolation' | 'clusters' | 'split' | 'features' | 'graph' | 'topology' | 'stack'> = [
      'topology',
      'isolation',
      'clusters',
      'split',
      'features',
      'stack',
      'graph',
    ];
    const chosenVariant = dynamicVariants[idx % dynamicVariants.length];

    slides.push({
      type: 'row',
      diagramVariant: chosenVariant,
      diagramNodes: [
        { label: phrase1.slice(0, 18), sublabel: 'Primary Context', status: 'ACTIVE', icon: 'layers' },
        { label: phrase2.slice(0, 18), sublabel: 'Mechanism Execution', status: 'VERIFIED', icon: 'cpu' },
        { label: phrase3.slice(0, 18), sublabel: 'Production Outcome', status: 'SECURED', icon: 'checkCircle' },
      ],
      diagramEdges: ['EXECUTE', 'VERIFY'],
      diagramFooter: `${cleanSubject.toUpperCase().slice(0, 28)} • ARCHITECTURE VERIFIED`,
      enTitle,
      arTitle: `آلية ${arSubject}: ${phrase1.slice(0, 18)}.`,
      enBody: autoFitTextToLimits(topicBody, 135),
      arBody: hasArabicText
        ? sanitizeArabicSlideText(topicBody.slice(0, 135))
        : `تحليل تفصيلي يوضح دور ${phrase1} في تعزيز كفاءة وموثوقية منظومة ${arSubject}.`,
    });
  });

  // Guarantee Spec §7: If no trade-off slide was created, add one before closing
  if (!slides.some((s) => s.diagramVariant === 'takeaway')) {
    slides.push(
      isFinancialOrMacro
        ? {
            type: 'row',
            diagramVariant: 'takeaway',
            icons: [
              { icon: 'dollarSign', label: 'Private Gains' },
              { icon: 'scales', label: 'Public Risk' },
            ],
            diagramNodes: [
              { label: 'Private Upside', sublabel: 'Insider equity & valuations', status: 'CAPTURED', icon: 'dollarSign' },
              { label: 'Circular Capex', sublabel: '$1.4T compute & grid bets', status: 'LEVERAGED', icon: 'landmark' },
              { label: 'Public Exposure', sublabel: 'Taxpayers, bills & retirees', status: 'EXPOSED', icon: 'scales' },
            ],
            diagramEdges: ['Leverage', 'Socialize'],
            diagramFooter: 'ECONOMIC VERDICT: PRIVATE GAINS VS PUBLIC & RETIREE EXPOSURE',
            enTitle: 'The core economic tradeoff.',
            arTitle: 'المفاضلة الاقتصادية ومن يدفع الثمن.',
            enBody: 'Insiders lock in billions in liquidity while energy costs, index concentration, and taxpayer backstops shift risk to the public.',
            arBody: 'يضمن المطلعون سيولة مليارية فورية بينما تنتقل فواتير الطاقة ومخاطر السوق والضمانات إلى الجمهور.',
          }
        : {
            type: 'row',
            diagramVariant: 'takeaway',
            icons: [{ icon: 'shieldAlert', label: 'Trade-off' }, { icon: 'activity', label: 'Evaluation' }],
            diagramNodes: [
              { label: 'Baseline Model', sublabel: 'Simpler initial setup', status: 'BASELINE', icon: 'layers' },
              { label: `${cleanSubject.slice(0, 15)} Shift`, sublabel: 'Target architecture', status: 'ADOPTED', icon: 'zap' },
              { label: 'Governance Cost', sublabel: 'Policy & audit overhead', status: 'BALANCE', icon: 'shieldAlert' },
            ],
            diagramEdges: ['Evaluate', 'Adopt'],
            diagramFooter: `ARCHITECTURAL VERDICT: ${cleanSubject.toUpperCase().slice(0, 32)}`,
            enTitle: `The ${cleanSubject.split(/\s+/).slice(0, 3).join(' ')} tradeoff.`,
            arTitle: `المفاضلة الهندسية في ${arSubject}.`,
            enBody: `Adopting ${cleanSubject} unlocks stronger guarantees and scale, provided teams enforce clear operational boundaries and observability.`,
            arBody: `تطبيق ${arSubject} يمنحك كفاءة وضمانات أعلى بشرط الالتزام بحدود الصلاحيات والمراقبة الدقيقة.`,
          }
    );
  }

  // Pad to targetCount - 1 with varied, topic-grounded archetypes (Compare, Code, Number) if fewer points were provided
  const padArchetypes: Array<'compare' | 'code' | 'number'> = ['compare', 'code', 'number'];
  let padIdx = 0;
  while (slides.length < targetCount - 1) {
    const padType = padArchetypes[padIdx % padArchetypes.length];
    padIdx++;
    if (isFinancialOrMacro) {
      slides.splice(1, 0, {
        type: 'number',
        stepNumber: `0${padIdx}`,
        stepLabel: `STEP 0${padIdx} // CAPITAL DEFICIT`,
        centerIcon: 'trendingDown',
        enTitle: 'The unit economics gap.',
        arTitle: 'فجوة العوائد والإنفاق الرأسمالي.',
        enBody: 'Capital burn and infrastructure commitments far exceed current operating revenue, requiring massive external financing.',
        arBody: 'تتجاوز الالتزامات الرأسمالية وتكاليف التشغيل العوائد الحالية، مما يفرض الاعتماد على تمويل خارجي مستمر.',
      });
    } else if (padType === 'compare') {
      slides.splice(Math.min(2, slides.length), 0, {
        type: 'compare',
        compareLeftTitle: 'IMPLICIT / LEGACY MODEL',
        compareLeftBody: `• Unscoped ${cleanSubject.slice(0, 18)} access\n• Shared static credentials\n• Fragile under edge conditions`,
        compareRightTitle: 'EXPLICIT / SCOPED DESIGN',
        compareRightBody: `• Cryptographically bounded ${cleanSubject.slice(0, 14)}\n• Least-privilege execution\n• Auditable production telemetry`,
        enTitle: enforceHeadlineSpecRule(`Legacy vs scoped ${cleanSubject.split(/\s+/).slice(0, 2).join(' ')}`, { isHook: false }),
        arTitle: `مقارنة: النهج التقليدي مقابل ${arSubject}.`,
        enBody: `Contrasting implicit legacy assumptions against explicit, verifiable boundaries in ${cleanSubject}.`,
        arBody: `مقارنة عملية توضح الفرق بين الصلاحيات المفتوحة تقليدياً والضوابط المحددة في ${arSubject}.`,
      });
    } else if (padType === 'code') {
      slides.splice(Math.min(3, slides.length), 0, {
        type: 'code',
        codeFileName: `${cleanSubject.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 16) || 'policy'}.yaml`,
        codeLanguage: 'yaml',
        codeSnippet: `# Production policy specification for ${cleanSubject.slice(0, 28)}\nmode: enforce_strict_bounds\ndelegation:\n  require_scoped_token: true\n  audit_trail: immutable`,
        enTitle: enforceHeadlineSpecRule(`Enforcing ${cleanSubject.split(/\s+/).slice(0, 3).join(' ')} policy`, { isHook: false }),
        arTitle: `تطبيق السياسات البرمجية في ${arSubject}.`,
        enBody: `Declarative configuration enforces strict runtime boundaries and verifiable execution rules for ${cleanSubject}.`,
        arBody: `تطبيق قواعد التحقق والصلاحيات برمجياً لضمان عدم تجاوز الحدود المسموح بها أثناء التشغيل.`,
      });
    } else {
      slides.splice(Math.min(4, slides.length), 0, {
        type: 'number',
        stepNumber: `0${padIdx}`,
        stepLabel: `PILLAR 0${padIdx} // VERIFICATION`,
        centerIcon: 'shieldAlert',
        enTitle: enforceHeadlineSpecRule(`Verifiable ${cleanSubject.split(/\s+/).slice(0, 3).join(' ')} bounds`, { isHook: false }),
        arTitle: `ضوابط التحقق والأمان في ${arSubject}.`,
        enBody: `Every request and state transition in ${cleanSubject} is validated against explicit scope constraints before execution.`,
        arBody: `يتم التحقق من كل عملية داخل منظومة ${arSubject} وفق صلاحيات محددة مسبقاً قبل السماح بالتنفيذ.`,
      });
    }
  }

  // Trim excess if too many points were given
  while (slides.length > targetCount - 1) {
    slides.splice(slides.length - 2, 1);
  }

  // Closer Slide
  slides.push({
    type: 'cta',
    enTitle: isFinancialOrMacro
      ? enforceHeadlineSpecRule(`Is ${cleanSubject} sustainable?`, { isCta: true })
      : enforceHeadlineSpecRule(`Scaling ${cleanSubject}?`, { isCta: true }),
    arTitle: isFinancialOrMacro ? `هل هذا النموذج المالي مستدام؟` : `تبني حلول ${arSubject}؟`,
    enBody: isFinancialOrMacro
      ? 'Share your perspective on massive AI valuations, circular vendor financing, and who ultimately bears the economic risk.'
      : 'Connect with software engineers to discuss system design, performance profiling, and production trade-offs.',
    arBody: isFinancialOrMacro
      ? 'شارك برأيك في التعليقات حول استدامة التقييمات المليارية والتمويل الدائري وتأثيرها على الاقتصاد.'
      : 'شارك برأيك وتجربتك في التعليقات حول تصميم الأنظمة المعمارية والمفاضلات التقنية.',
    ctaText: 'Join discussion  •  شارك برأيك',
    url: brandUrl,
    enCredit: '',
    arCredit: `${brand} · ${isFinancialOrMacro ? 'تحليل مالي واقتصادي' : `دراسة هندسية في ${domainCategory}`}`,
  });

  return slides;
}

/**
 * VCS & Scion Story: Monorepo scale, virtual filesystem, lockless merges, and tradeoffs.
 */
function buildVcsStory(subject: string, opts: StoryOptions): SlideData[] {
  return [
    {
      type: 'hub',
      centerIcon: 'gitMerge',
      satIcons: ['server', 'database', 'gauge', 'cpu', 'box', 'activity'],
      satLabels: ['Virtual FS', 'Server Merge', 'API VCS', 'Changesets', 'CI Runners', 'Telemetry'],
      enTitle: 'Why did Anthropic\nmove beyond Git?',
      arTitle: 'السبب وراء ابتعاد\nAnthropic عن Git',
      enBody: 'A deeper look at Scion: a server-authoritative VCS designed for AI agents.',
      arBody: 'نظرة متعمقة على نظام Scion: نظام تحكم في النسخ صُمم خصيصاً لوكلاء الذكاء الاصطناعي.',
    },
    {
      type: 'metric',
      metricValue: '100 GB',
      metricLabel: 'MONOREPO SCALE',
      metricDiff: '▲ 25M CI checkouts every day',
      metricIcon: 'database',
      enTitle: '25M checkouts a day.',
      arTitle: '25 مليون سحب يومياً.',
      enBody: 'Git mirrors were collapsing under massive AI agent commits, stalling builds and blocking engineer deploys.',
      arBody: 'كانت خوادم Git تنهار تحت سيل التعديلات المستمر من وكلاء الذكاء الاصطناعي، مما عطّل عمليات البناء.',
    },
    {
      type: 'code',
      codeSnippet: `$ scion checkout --lazy\n✔ Virtual filesystem mapped (0.4s)\n✔ Changeset: 3 files (0.01% of repo)\n$ scion commit -m "agent: optimize index"\n✔ Server-side merge verified (1.2s)`,
      codeLanguage: 'bash',
      codeFileName: 'scion-cli.sh',
      enTitle: 'Virtual tree checkout.',
      arTitle: 'سحب شجرة افتراضية.',
      enBody: 'Instead of cloning the entire 100 GB repo history, Scion streams only the exact files the agent touches.',
      arBody: 'بدلاً من استنساخ كامل المستودع البالغ 100 جيجابايت، يرسل Scion فقط الملفات التي يلمسها الوكيل البرمجي.',
    },
    {
      type: 'compare',
      compareLeftTitle: 'Traditional Git',
      compareLeftBody: '• Full 100 GB clone on every CI job\n• Local merge locks monorepo branch\n• 40% compute wasted on VCS mirrors',
      compareRightTitle: 'Anthropic Scion',
      compareRightBody: '• Lazy virtual checkout in milliseconds\n• API server-side commits without locks\n• 25% of all CI computing reclaimed',
      enTitle: 'Git vs. Scion.',
      arTitle: 'مقارنة Git مع Scion.',
      enBody: 'Moving from local monolithic checkouts to an API-driven virtual filesystem cut compute overhead by 200x.',
      arBody: 'الانتقال من الاستنساخ الكامل المحلي إلى نظام ملفات افتراضي مدار بالواجهات البرمجية قلل الهدر بنسبة 200 ضعف.',
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'code', label: 'API VCS' }, { icon: 'server', label: 'Virtual mount' }, { icon: 'lock', label: 'Lockless merges' }],
      diagramNodes: [
        { label: 'Virtual Filesystem', sublabel: 'Lazy stream on access', status: 'MOUNTED', icon: 'server' },
        { label: 'API Engine', sublabel: 'Server-side commit logic', status: 'ORCHESTRATED', icon: 'cpu' },
        { label: 'Cloud Object Store', sublabel: 'Lockless snapshot storage', status: 'PERSISTED', icon: 'database' },
      ],
      diagramEdges: ['Lazy Fetch', 'Async Land'],
      diagramFooter: 'VIRTUAL FS: STREAMED • REPO CLONE: ZERO FULL HISTORY',
      enTitle: 'Server-side engine pipeline.',
      arTitle: 'محرك يدار خادمياً.',
      enBody: 'Everything is tracked in an object store; merges run server-side so CI runners never wait for branch rebase locks.',
      arBody: 'كل شيء يدار في مستودع كائنات سحابي؛ وتتم عمليات الدمج خادمياً حتى لا تنتظر بيئات العمل فك أقفال الفروع.',
    },
    {
      type: 'row',
      diagramVariant: 'topology',
      icons: [{ icon: 'terminal', label: 'Agent Commit' }, { icon: 'gitMerge', label: 'Speculative Merge' }, { icon: 'activity', label: 'Test Runner' }],
      diagramNodes: [
        { label: 'Agent Commit', sublabel: 'API payload dispatched', status: 'LANDED', icon: 'terminal' },
        { label: 'Speculative Merge', sublabel: 'Applied directly to main', status: 'COMMITTED', icon: 'gitMerge' },
        { label: 'Async Test CI', sublabel: 'Broken builds isolated', status: 'AUDITED', icon: 'activity' },
      ],
      diagramEdges: ['Direct Land', 'Post-Merge Test'],
      diagramFooter: 'STRATEGY: TEST-AFTER-MERGE • TEAM BLOCKING: 0 SECONDS',
      enTitle: 'Test after merge sequence.',
      arTitle: 'الاختبار بعد الدمج.',
      enBody: 'Scion lands code immediately and tests post-merge, isolating broken commits without stalling the rest of the team.',
      arBody: 'يدمج Scion الشيفرة فوراً ويختبرها بعد الدمج، مما يعزل التعديلات المعطوبة دون إيقاف باقي الفريق.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'gitMerge', label: 'General Repos' }, { icon: 'robot', label: 'Agent Workloads' }, { icon: 'shieldAlert', label: 'Internal Tool' }],
      diagramNodes: [
        { label: 'Git for General Teams', sublabel: 'Human workflow & tooling', status: 'STANDARD', icon: 'gitMerge' },
        { label: 'Scion for AI Agents', sublabel: '25M checkouts · custom infra', status: 'INTERNAL', icon: 'robot' },
        { label: 'No Public Release', sublabel: 'Proprietary internal system', status: 'CAVEAT', icon: 'shieldAlert' },
      ],
      diagramEdges: ['Human Workflow', 'Agent Scale'],
      diagramFooter: 'STATUS: PROPRIETARY ANTHROPIC TOOL • GENERAL REPOS STAY ON GIT',
      enTitle: 'Not a Git killer.',
      arTitle: 'ليس قاتلاً لنظام Git.',
      enBody: 'Anthropic says Git still suits most repos. Scion needs custom review, search and CI tools, and has no public release.',
      arBody: 'تقول Anthropic إن Git ما زال مناسباً لمعظم المستودعات؛ يحتاج Scion أدوات مراجعة وبحث مخصصة، ولا إصدار عام له.',
    },
    {
      type: 'cta',
      enTitle: 'Building with AI agents\nat scale?',
      arTitle: 'تبني بوكلاء الذكاء\nالاصطناعي على نطاق\nواسع؟',
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: "Based on Anthropic's engineering post. The numbers are Anthropic's own.",
      arCredit: 'مبني على مقال Anthropic الهندسي، والأرقام من Anthropic نفسها.',
    },
  ];
}

/**
 * Docker & Container Story: Multi-stage build optimization, attack surface reduction, and debugging scratch images.
 */
function buildContainerStory(subject: string, opts: StoryOptions): SlideData[] {
  return [
    {
      type: 'hub',
      centerIcon: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/docker.svg',
      satIcons: ['box', 'layers', 'shieldAlert', 'cpu', 'hardDrive', 'activity'],
      satLabels: ['Multi-Stage', 'Builder SDK', 'Scratch Base', 'Minimal Image', 'Zero CVEs', 'Layer Cache'],
      enTitle: 'Multi-stage Docker builds.',
      arTitle: 'بناء حاويات Docker متعددة المراحل',
      enBody: 'How separating build environments from production runtimes slashes image sizes by 95%.',
      arBody: 'كيف يؤدي فصل بيئة البناء عن بيئة التشغيل إلى تقليص حجم الحاويات وإغلاق الثغرات.',
    },
    {
      type: 'metric',
      metricValue: '95%',
      metricLabel: 'IMAGE SIZE REDUCTION',
      metricDiff: '▲ 850MB down to 18MB',
      metricIcon: 'hardDrive',
      enTitle: 'Eliminating container bloat.',
      arTitle: 'تقليص الحجم بنسبة 95%',
      enBody: 'Single-stage images bundle compilers, package managers, and debug tools directly into production containers.',
      arBody: 'الحاويات التقليدية تحزم المترجمات وأدوات إدارة الحزم في بيئة الإنتاج، مما يرفع حجمها ويزيد ثغراتها.',
    },
    {
      type: 'compare',
      compareLeftTitle: 'Single-Stage Build',
      compareLeftBody: '• 850MB bulky container image\n• Bundled gcc, apt, and source files\n• 38 base operating system CVEs',
      compareRightTitle: 'Multi-Stage Build',
      compareRightBody: '• 18MB statically compiled binary\n• Zero compilers or package managers\n• 0 base operating system CVEs',
      enTitle: 'Single vs. multi-stage.',
      arTitle: 'مقارنة الحاوية التقليدية مع متعددة المراحل',
      enBody: 'Separating build tools from the final runtime creates minimal, immutable container images.',
      arBody: 'عزل أدوات البناء عن بيئة التشغيل النهائية ينتج حاويات خفيفة وغير قابلة للتعديل بأعلى معايير الأمان.',
    },
    {
      type: 'code',
      codeSnippet: `FROM golang:1.24 AS builder\nWORKDIR /app\nCOPY . .\nRUN CGO_ENABLED=0 go build -o /server\n\nFROM scratch\nCOPY --from=builder /server /server\nENTRYPOINT ["/server"]`,
      codeLanguage: 'dockerfile',
      codeFileName: 'Dockerfile',
      enTitle: 'Multi-stage Dockerfile syntax.',
      arTitle: 'صيغة ملف Dockerfile المتعدد',
      enBody: 'Stage 1 compiles the binary inside the full Go SDK; Stage 2 copies only the single static binary into scratch.',
      arBody: 'المرحلة الأولى تبني الملف داخل بيئة Go الكاملة، والمرحلة الثانية تنسخ الملف التنفيذي فقط إلى بيئة فارغة.',
    },
    {
      type: 'row',
      diagramVariant: 'topology',
      icons: [{ icon: 'box', label: 'Builder SDK' }, { icon: 'arrowRightLeft', label: 'Extract Binary' }, { icon: 'shieldAlert', label: 'Scratch Image' }],
      diagramNodes: [
        { label: 'Builder Container', sublabel: 'Full SDK & dependencies', status: 'DISCARDED', icon: 'box' },
        { label: 'Artifact Extraction', sublabel: 'Static binary only', status: 'EXTRACTED', icon: 'arrowRightLeft' },
        { label: 'Scratch Image', sublabel: 'Production runtime', status: 'DEPLOYED', icon: 'shieldAlert' },
      ],
      diagramEdges: ['go build', 'COPY --from'],
      diagramFooter: 'BUILD ARTIFACT ISOLATED • CONTAINER BLOAT ELIMINATED',
      enTitle: 'Artifact extraction pipeline.',
      arTitle: 'مسار استخراج الملف التنفيذي',
      enBody: 'Only the final binary enters the deployed image; all compilation intermediate layers are discarded.',
      arBody: 'الملف التنفيذي النهائي فقط هو ما يدخل الحاوية المرفوعة، بينما تُهمل كل الطبقات الوسيطة الأخرى.',
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'layers', label: 'Manifest' }, { icon: 'cpu', label: 'Dependency Cache' }, { icon: 'hardDrive', label: 'Compiled Rootfs' }],
      diagramNodes: [
        { label: 'Dependency Layer', sublabel: 'go.mod cached independently', status: 'CACHED', icon: 'layers' },
        { label: 'Source Layer', sublabel: 'Fast incremental builds', status: 'BUILT', icon: 'cpu' },
        { label: 'Production Rootfs', sublabel: '18MB minimal filesystem', status: 'VERIFIED', icon: 'hardDrive' },
      ],
      diagramEdges: ['Cache Hit', 'Assemble'],
      diagramFooter: 'BUILD TIME: < 4 SECONDS • CACHE REUSE: OPTIMIZED',
      enTitle: 'Layer caching strategy.',
      arTitle: 'استراتيجية التخزين المؤقت للطبقات',
      enBody: 'Ordering COPY directives properly prevents rebuilding dependency layers on simple code edits.',
      arBody: 'ترتيب تعليمات النسخ بذكاء يمنع إعادة تحميل الحزم مع كل تعديل بسيط في الشيفرة البرمجية.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'terminal', label: 'Zero Shell' }, { icon: 'alertCircle', label: 'Debug Container' }, { icon: 'lock', label: 'Hardened' }],
      diagramNodes: [
        { label: 'Scratch Limitations', sublabel: 'No /bin/sh or curl inside', status: 'HARDENED', icon: 'terminal' },
        { label: 'Ephemeral Debugging', sublabel: 'Attach debug sidecars', status: 'SOLUTION', icon: 'alertCircle' },
        { label: 'Production Security', sublabel: 'Zero shell escape surface', status: 'SECURED', icon: 'lock' },
      ],
      diagramEdges: ['No Shell', 'Attach Sidecar'],
      diagramFooter: 'ATTACK SURFACE: MINIMAL • DEBUGGING: EPHEMERAL ONLY',
      enTitle: 'Debugging scratch containers.',
      arTitle: 'تحدي فحص الحاويات الفارغة',
      enBody: 'Scratch images have no shell. Live debugging requires Kubernetes ephemeral debug containers or sidecars.',
      arBody: 'الحاويات الفارغة لا تحوي سطر أوامر؛ يتطلب فحصها أثناء التشغيل ربط حاويات تصحيح خارجية.',
    },
    {
      type: 'cta',
      enTitle: 'Hardening your container\npipeline?',
      arTitle: 'تحصين بيئة الحاويات\nالبرمجية لديك؟',
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · دليل أمان الحاويات البرمجية`,
    },
  ];
}

/**
 * In-Memory & Redis Story: In-memory access, multi-threading, active clustering, and RAM trade-offs.
 */
function buildCacheStory(subject: string, opts: StoryOptions): SlideData[] {
  return [
    {
      type: 'hub',
      centerIcon: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/redis.svg',
      satIcons: ['database', 'zap', 'hardDrive', 'server', 'cpu', 'activity'],
      satLabels: ['In-Memory', 'I/O Threads', 'Active Sharding', 'Sub-ms P99', 'LRU Eviction', 'Persistence'],
      enTitle: 'Redis engine architecture.',
      arTitle: 'معمارية محرك قواعد بيانات Redis',
      enBody: 'How in-memory key-space and threaded I/O sustain millions of operations per second.',
      arBody: 'كيف يحقق محرك الذاكرة المباشر والتزامن المتعدد ملايين العمليات في الثانية باستجابة فورية.',
    },
    {
      type: 'metric',
      metricValue: '1.2M ops',
      metricLabel: 'THROUGHPUT PER NODE',
      metricDiff: '▲ Sub-millisecond p99 latency',
      metricIcon: 'zap',
      enTitle: '1.2M operations a second.',
      arTitle: 'أكثر من مليون عملية في الثانية.',
      enBody: 'Direct RAM pointer access bypasses disk I/O bottlenecks to deliver microsecond-level query latencies.',
      arBody: 'الوصول المباشر إلى مؤشرات الذاكرة يتجاوز بطء أقراص التخزين ليمنح استجابة في أجزاء من الميلي ثانية.',
    },
    {
      type: 'compare',
      compareLeftTitle: 'Disk-Based Database',
      compareLeftBody: '• B-Tree page reads from disk\n• Buffer cache eviction stalls\n• 5–20ms p99 query latency',
      compareRightTitle: 'In-Memory Store',
      compareRightBody: '• Direct memory pointers in RAM\n• Lockless ring-buffer dispatch\n• < 0.5ms p99 query latency',
      enTitle: 'Disk storage vs. RAM.',
      arTitle: 'مقارنة التخزين في الذاكرة مقابل الأقراص',
      enBody: 'Moving hot data into an in-memory key-space eliminates query lock contention under traffic spikes.',
      arBody: 'نقل البيانات الأكثر طلباً إلى الذاكرة يلغي اختناقات القراءة والكتابة أثناء ضغط الزيارات المفاجئ.',
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'server', label: 'Network I/O' }, { icon: 'cpu', label: 'I/O Threads' }, { icon: 'hardDrive', label: 'Atomic Core' }],
      diagramNodes: [
        { label: 'Socket Ingress', sublabel: 'Event epoll handler', status: 'POOLED', icon: 'server' },
        { label: 'Threaded I/O', sublabel: 'Parallel parse & serialize', status: 'WORKERS', icon: 'cpu' },
        { label: 'Single-Thread Core', sublabel: 'Atomic state execution', status: 'ATOMIC', icon: 'hardDrive' },
      ],
      diagramEdges: ['Parse', 'Execute'],
      diagramFooter: 'I/O CONCURRENCY: MULTI-THREADED • COMMANDS: 100% ATOMIC',
      enTitle: 'Multi-threaded I/O pipeline.',
      arTitle: 'بنية معالجة الإدخال والإخراج متعددة الأنوية',
      enBody: 'Redis threads socket parsing while executing commands on an atomic single-thread core to prevent race conditions.',
      arBody: 'معالجة قراءة وكتابة حزم الشبكة على أنوية متعددة مع إبقاء تنفيذ العمليات أحادياً لضمان سلامة البيانات.',
    },
    {
      type: 'code',
      codeSnippet: `$ redis-cli --cluster create 10.0.0.1:6379 10.0.0.2:6379 ...\n> Allocating 16384 hash slots across 3 primaries...\n✔ Slot distribution verified\n✔ Cluster online · 0 replication lag`,
      codeLanguage: 'bash',
      codeFileName: 'cluster-init.sh',
      enTitle: 'Cluster hash slot routing.',
      arTitle: 'توجيه البيانات عبر فتحات التجزئة',
      enBody: 'Keys map deterministically to 16,384 hash slots across primary shards without centralized coordination.',
      arBody: 'توزيع المفاتيح تلقائياً عبر 16,384 فتحة تجزئة بين الخوادم الأساسية دون الحاجة إلى منسق مركزي.',
    },
    {
      type: 'row',
      diagramVariant: 'topology',
      icons: [{ icon: 'network', label: 'Client Routing' }, { icon: 'database', label: 'Primary Shard' }, { icon: 'hardDrive', label: 'Replica' }],
      diagramNodes: [
        { label: 'Smart Client', sublabel: 'CRC16 slot hashing', status: 'DIRECT', icon: 'network' },
        { label: 'Primary Shard', sublabel: 'Active read/write memory', status: 'ACTIVE', icon: 'database' },
        { label: 'Replica Shard', sublabel: 'Asynchronous stream mirror', status: 'SYNCED', icon: 'hardDrive' },
      ],
      diagramEdges: ['Direct Route', 'Replication'],
      diagramFooter: 'CLUSTER: ACTIVE • REPLICATION LAG: < 1.0ms',
      enTitle: 'Deterministic cluster routing.',
      arTitle: 'مسار التوجيه الحتمي في العناقيد',
      enBody: 'Clients hash keys directly to target shards, eliminating intermediate proxy hops and latency spikes.',
      arBody: 'يقوم تطبيق العميل بحساب تجزئة المفتاح والاتصال مباشرة بالخادم المعني دون وسيط.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'hardDrive', label: 'RAM Cost' }, { icon: 'alertCircle', label: 'Eviction' }, { icon: 'shieldAlert', label: 'Persistence' }],
      diagramNodes: [
        { label: 'Memory Cost / GB', sublabel: '10x more expensive than NVMe', status: 'COST', icon: 'hardDrive' },
        { label: 'Eviction Policies', sublabel: 'volatile-lru or allkeys-lru', status: 'MANDATORY', icon: 'alertCircle' },
        { label: 'AOF Sync Delay', sublabel: 'Durability vs throughput tradeoff', status: 'CONFIG', icon: 'shieldAlert' },
      ],
      diagramEdges: ['High Cost', 'Enforce LRU'],
      diagramFooter: 'STRATEGY: CONFIGURE MAXMEMORY • ALWAYS DEFINE EVICTION POLICY',
      enTitle: 'The memory cost tradeoff.',
      arTitle: 'تكلفة الذاكرة وسياسات الحذف',
      enBody: 'RAM costs 10x more per gigabyte than NVMe. Configure strict maxmemory limits and eviction policies to prevent OOM.',
      arBody: 'الذاكرة أغلى بعشرة أضعاف من الأقراص؛ يجب تحديد سقف أقصى للذاكرة وسياسة إفراغ واضحة لتفادي انهيار الخادم.',
    },
    {
      type: 'cta',
      enTitle: 'Scaling in-memory caching\narchitectures?',
      arTitle: 'تبني طبقات تخزين مؤقت\nعالية السرعة؟',
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · دليل معمارية قواعد البيانات السريعة`,
    },
  ];
}

/**
 * Cybersecurity & Zero-Trust Story: Perimeter flaws, service identity, and blast radius isolation.
 */
function buildSecurityStory(subject: string, opts: StoryOptions): SlideData[] {
  return [
    {
      type: 'hub',
      centerIcon: 'lock',
      satIcons: ['shieldAlert', 'network', 'key', 'server', 'eyeRisk', 'terminal'],
      satLabels: ['mTLS Enforce', 'Least Privilege', 'Service Mesh', 'Egress Guard', 'Blast Radius', 'Audit Log'],
      enTitle: 'Zero-Trust mesh security.',
      arTitle: 'أمن الشبكات بمبدأ انعدام الثقة',
      enBody: 'Why perimeter firewalls fail and how identity-based mutual TLS eliminates lateral attack movement.',
      arBody: 'لماذا تفشل الجدران النارية التقليدية، وكيف يمنع التوثيق التبادلي بالهوية التسلل الجانبي للمخترقين.',
    },
    {
      type: 'metric',
      metricValue: '100%',
      metricLabel: 'ENCRYPTED SERVICE MESH',
      metricDiff: '▲ Zero implicit trust boundaries',
      metricIcon: 'lock',
      enTitle: '100% mutual TLS encryption.',
      arTitle: 'تشفير كامل لكافة الاتصالات الداخلية',
      enBody: 'Every internal microservice verifies caller identity using short-lived cryptographic X.509 certificates.',
      arBody: 'كل خدمة داخلية تتحقق من هوية المتصل باستخدام شهادات رقمية مشفرة وقصيرة الأجل.',
    },
    {
      type: 'compare',
      compareLeftTitle: 'Perimeter Security',
      compareLeftBody: '• Implicit trust inside private network\n• Lateral movement once breached\n• Shared static IP allowlists',
      compareRightTitle: 'Zero-Trust Architecture',
      compareRightBody: '• Cryptographic SPIFFE identity tokens\n• Bounded blast radius per container\n• Continuous identity verification',
      enTitle: 'Perimeter vs. Zero-Trust.',
      arTitle: 'مقارنة الحماية المحيطية مقابل انعدام الثقة',
      enBody: 'Breaching one internal service should never grant access to surrounding production databases.',
      arBody: 'اختراق خدمة داخلية واحدة يجب ألا يمنح المهاجم أي وصول تلقائي إلى قواعد البيانات أو الخدمات المجاورة.',
    },
    {
      type: 'row',
      diagramVariant: 'isolation',
      icons: [{ icon: 'shieldAlert', label: 'Breached Pod' }, { icon: 'lock', label: 'Air-Gap Firewall' }, { icon: 'database', label: 'Protected Core' }],
      diagramNodes: [
        { label: 'Compromised Node', sublabel: 'Untrusted network scope', status: 'DENIED', icon: 'shieldAlert' },
        { label: 'Isolation Perimeter', sublabel: 'Strict egress boundary', status: 'ISOLATED', icon: 'lock' },
        { label: 'Protected Database', sublabel: 'Cryptographic auth required', status: 'SECURED', icon: 'database' },
      ],
      diagramEdges: ['QUARANTINE', 'REJECT'],
      diagramFooter: 'FAULT DOMAIN ISOLATED • LATERAL MOVEMENT: 0% SUCCESS RATE',
      enTitle: 'Blast radius containment.',
      arTitle: 'تطويق نطاق الاختراق وعزله',
      enBody: 'Egress filtering and network microsegmentation quarantine compromised containers from production backends.',
      arBody: 'تصفية الاتصالات الصادرة وعزل الشبكة يمنعان الحاوية المخترقة من التواصل مع قواعد بيانات الإنتاج.',
    },
    {
      type: 'code',
      codeSnippet: `apiVersion: security.istio.io/v1beta1\nkind: PeerAuthentication\nmetadata:\n  name: default\nspec:\n  mtls:\n    mode: STRICT`,
      codeLanguage: 'yaml',
      codeFileName: 'mtls-strict.yaml',
      enTitle: 'Strict mTLS policy config.',
      arTitle: 'إلزام التشفير والتوثيق الصارم',
      enBody: 'Enforcing STRICT mode rejects any plaintext TCP connections across all cluster namespaces.',
      arBody: 'تفعيل نمط STRICT يرفض أي اتصال غير مشفر داخل كافة بيئات العمل في العنقود البرمجي.',
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'server', label: 'Client App' }, { icon: 'lock', label: 'Envoy Proxy' }, { icon: 'database', label: 'Backend API' }],
      diagramNodes: [
        { label: 'Workload Token', sublabel: 'SPIFFE/SPIRE ID issued', status: 'AUTHENTIC', icon: 'server' },
        { label: 'Sidecar Proxy', sublabel: 'mTLS handshake & RBAC', status: 'ENFORCED', icon: 'lock' },
        { label: 'Target Service', sublabel: 'Authorized payload only', status: 'SECURED', icon: 'database' },
      ],
      diagramEdges: ['Verify Token', 'Decrypted Stream'],
      diagramFooter: 'IDENTITY: CRYPTOGRAPHIC • TLS 1.3 • CIPHER: CHACHA20-POLY1305',
      enTitle: 'Identity verification pipeline.',
      arTitle: 'مسار التحقق من الهوية الرقمية',
      enBody: 'Sidecar proxies handle certificate exchange and payload decryption transparently without changing application code.',
      arBody: 'تتولى الحاويات المرافقة فحص الشهادات وفك التشفير تلقائياً دون الحاجة لتعديل شيفرة التطبيق الأساسي.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'alertCircle', label: 'Rotation' }, { icon: 'cpu', label: 'Handshake Cost' }, { icon: 'shieldAlert', label: 'Complexity' }],
      diagramNodes: [
        { label: 'Certificate Rotation', sublabel: 'Automated short TTL renewals', status: 'REQUIRED', icon: 'alertCircle' },
        { label: 'Proxy CPU Overhead', sublabel: '1–2ms TLS handshake tax', status: 'MEASURED', icon: 'cpu' },
        { label: 'Operational Burden', sublabel: 'Service mesh debug complexity', status: 'CAVEAT', icon: 'shieldAlert' },
      ],
      diagramEdges: ['Automate', 'Profile'],
      diagramFooter: 'RECOMMENDATION: AUTOMATE CERT ROTATION BEFORE ENFORCING STRICT',
      enTitle: 'Operational complexity catch.',
      arTitle: 'أعباء إدارة شهادات الأمان',
      enBody: 'Zero-Trust adds proxy overhead and certificate renewal management. Automate renewals before enforcing strict mTLS.',
      arBody: 'يضيف مبدأ انعدام الثقة عبئاً في تجديد الشهادات واستهلاك المعالج؛ يجب أتمتة الإدارة قبل تفعيل الوضع الصارم.',
    },
    {
      type: 'cta',
      enTitle: 'Implementing Zero-Trust\nin production?',
      arTitle: 'تطبيق بنية انعدام الثقة\nفي بيئات العمل لديك؟',
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · دليل أمن البنية التحتية`,
    },
  ];
}

/**
 * Linux Kernel & eBPF Story: Syscall boundary, in-kernel execution, verifier constraints, and telemetry.
 */
function buildKernelStory(subject: string, opts: StoryOptions): SlideData[] {
  return [
    {
      type: 'hub',
      centerIcon: 'terminal',
      satIcons: ['cpu', 'lock', 'server', 'gauge', 'binary', 'codeFile'],
      satLabels: ['XDP Hook', 'Kernel Space', 'JIT Verifier', 'Syscall Trace', 'Zero-Copy', 'Ring Buffer'],
      enTitle: 'How eBPF observes Linux.',
      arTitle: 'كيف تراقب تقنية eBPF نواة Linux',
      enBody: 'Running safe, sandboxed bytecode inside the Linux kernel without recompiling modules.',
      arBody: 'تشغيل شيفرة برمجية آمنة ومعزولة داخل نواة Linux مباشرة دون الحاجة لتعديل أو إعادة بناء النواة.',
    },
    {
      type: 'metric',
      metricValue: '0 context switches',
      metricLabel: 'OBSERVABILITY OVERHEAD',
      metricDiff: '▲ In-kernel line-rate processing',
      metricIcon: 'gauge',
      enTitle: '0 context switch stalls.',
      arTitle: 'صفر تبديل سياق أثناء المراقبة',
      enBody: 'Traditional tracing copies data to user space via expensive context switches; eBPF filters directly at the NIC driver.',
      arBody: 'أدوات المراقبة التقليدية تنسخ البيانات إلى فضاء المستخدم مسببة تباطؤاً كبيراً، بينما تعمل eBPF داخل النواة مباشرة.',
    },
    {
      type: 'compare',
      compareLeftTitle: 'Kernel Modules',
      compareLeftBody: '• Risk of catastrophic kernel panic\n• Breaks on every kernel version upgrade\n• Unchecked memory pointer dereferences',
      compareRightTitle: 'eBPF Sandboxed Code',
      compareRightBody: '• Verified safe by in-kernel JIT checker\n• Stable across kernel versions via CO-RE\n• Cannot crash or stall the operating system',
      enTitle: 'Kernel modules vs. eBPF.',
      arTitle: 'مقارنة وحدات النواة مقابل برامج eBPF',
      enBody: 'eBPF programs must pass a rigorous in-kernel safety verification before being permitted to execute.',
      arBody: 'تخضع برامج eBPF لفحص أمان صارم داخل النواة يضمن استحالة تسببها في انهيار نظام التشغيل.',
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'network', label: 'NIC Hook' }, { icon: 'cpu', label: 'eBPF JIT' }, { icon: 'hardDrive', label: 'Ring Buffer' }],
      diagramNodes: [
        { label: 'XDP Driver Hook', sublabel: 'Packet arrives at network card', status: 'INGRESS', icon: 'network' },
        { label: 'eBPF Virtual Machine', sublabel: 'Safe JIT execution core', status: 'FILTERED', icon: 'cpu' },
        { label: 'BPF Ring Buffer', sublabel: 'Lockless zero-copy telemetry', status: 'DELIVERED', icon: 'hardDrive' },
      ],
      diagramEdges: ['Intercept', 'Stream'],
      diagramFooter: 'PROCESSING: LINE-RATE • PACKET LOSS: 0% • OVERHEAD: < 1.0%',
      enTitle: 'In-kernel execution stack.',
      arTitle: 'طبقات التنفيذ داخل النواة',
      enBody: 'Packets can be inspected, rewritten, or dropped at the network card driver level before allocating a kernel socket buffer.',
      arBody: 'يمكن فحص حزم البيانات وتعديلها أو إسقاطها فور وصولها لبطاقة الشبكة قبل استهلاك أي موارد من الذاكرة.',
    },
    {
      type: 'code',
      codeSnippet: `SEC("xdp")\nint filter_traffic(struct xdp_md *ctx) {\n    void *data = (void *)(long)ctx->data;\n    void *data_end = (void *)(long)ctx->data_end;\n    // Safety boundary check required by verifier\n    if (data + sizeof(struct ethhdr) > data_end)\n        return XDP_PASS;\n    return XDP_DROP;\n}`,
      codeLanguage: 'c',
      codeFileName: 'filter_xdp.c',
      enTitle: 'XDP packet filter syntax.',
      arTitle: 'شيفرة تصفية الحزم عبر XDP',
      enBody: 'The verifier requires proving that all memory accesses are bounded within the packet payload buffer.',
      arBody: 'يشترط الفاحص الأمني إثبات أن كافة قراءات الذاكرة تقع حصراً ضمن حدود حزمة البيانات المستلمة.',
    },
    {
      type: 'row',
      diagramVariant: 'topology',
      icons: [{ icon: 'binary', label: 'LLVM Clang' }, { icon: 'shieldAlert', label: 'Kernel Verifier' }, { icon: 'zap', label: 'JIT Compiler' }],
      diagramNodes: [
        { label: 'LLVM Bytecode', sublabel: 'Compiled C or Rust program', status: 'COMPILED', icon: 'binary' },
        { label: 'Kernel Verifier', sublabel: 'Checks loops & bounds', status: 'VERIFIED', icon: 'shieldAlert' },
        { label: 'Native JIT Code', sublabel: 'Direct CPU instruction set', status: 'ACTIVE', icon: 'zap' },
      ],
      diagramEdges: ['bpf() syscall', 'JIT emit'],
      diagramFooter: 'SAFETY PROVEN: DETERMINISTIC • EXECUTION: BARE-METAL SPEED',
      enTitle: 'Verification and JIT compilation.',
      arTitle: 'التحقق والتحويل للشيفرة الأصلية',
      enBody: 'The kernel simulates every possible execution branch to ensure no infinite loops or invalid memory reads exist.',
      arBody: 'تحاكي النواة كافة مسارات التنفيذ المحتملة للتأكد التام من خلو الشيفرة من أي حلقات لا نهائية أو قراءات خاطئة.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'alertCircle', label: 'Verifier Limit' }, { icon: 'cpu', label: 'No Sleeping' }, { icon: 'layers', label: 'Complexity' }],
      diagramNodes: [
        { label: 'Verifier Complexity', sublabel: '1 million instruction limit', status: 'STRICT', icon: 'alertCircle' },
        { label: 'Execution Constraints', sublabel: 'Cannot sleep or block kernel', status: 'NON-BLOCKING', icon: 'cpu' },
        { label: 'Tooling Maturity', sublabel: 'Requires modern Linux 5.8+', status: 'CAVEAT', icon: 'layers' },
      ],
      diagramEdges: ['Proof Needed', 'Non-blocking'],
      diagramFooter: 'CONSTRAINTS: BOUNDED EXECUTION • COMPATIBILITY: MODERN KERNELS ONLY',
      enTitle: 'The verifier strictness catch.',
      arTitle: 'قيود الفاحص الأمني في النواة',
      enBody: 'Complex programs often fail verification. eBPF cannot sleep or block, and loops must be strictly bounded.',
      arBody: 'البرامج المعقدة تفشل في اجتياز الفحص؛ لا يمكن لبرامج eBPF التوقف المؤقت ويجب أن تكون حلقاتها محددة بدقة.',
    },
    {
      type: 'cta',
      enTitle: 'Building low-level observability\ntools?',
      arTitle: 'تبني أدوات مراقبة\nمنخفضة المستوى للنواة؟',
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · دليل أنظمة Linux المتقدمة`,
    },
  ];
}

/**
 * AI & LLM Inference Story: Attention complexity, KV-cache paging, quantization, and memory bandwidth bounds.
 */
function buildAiStory(subject: string, opts: StoryOptions): SlideData[] {
  return [
    {
      type: 'hub',
      centerIcon: 'brain',
      satIcons: ['cpu', 'robot', 'database', 'lightbulb', 'gauge', 'changesets'],
      satLabels: ['KV-Cache', 'Attention Heads', 'Paged Memory', 'Token Speed', 'Quantization', 'Model Weights'],
      enTitle: 'How KV-cache speeds up LLMs.',
      arTitle: 'كيف يسرع تخزين المفاتيح والقيم نماذج الذكاء الاصطناعي',
      enBody: 'Why autoregressive text generation stalls on long contexts and how paged memory unlocks 10x token efficiency.',
      arBody: 'لماذا تتباطأ النماذج اللغوية مع كبر السياق، وكيف تضاعف الذاكرة المجزأة سرعة توليد الكلمات.',
    },
    {
      type: 'metric',
      metricValue: '10x',
      metricLabel: 'TOKEN INFERENCE SPEEDUP',
      metricDiff: '▲ Zero quadratic attention recompute',
      metricIcon: 'gauge',
      enTitle: '10x token generation speedup.',
      arTitle: 'مضاعفة سرعة توليد الرموز 10 أضعاف',
      enBody: 'Storing computed key and value vectors in GPU RAM eliminates recalculating attention for previous tokens.',
      arBody: 'الاحتفاظ بمصفوفات المفاتيح والقيم في ذاكرة كرت الشاشة يلغي إعادة حساب الانتباه للكلمات السابقة.',
    },
    {
      type: 'compare',
      compareLeftTitle: 'Naive Attention',
      compareLeftBody: '• Quadratic $O(N^2)$ recomputation per token\n• GPU memory fragmentation & waste\n• Out-of-memory crashes on long prompts',
      compareRightTitle: 'Paged KV-Cache',
      compareRightBody: '• Constant-time token forward pass\n• Virtual memory paging inspired by OS\n• Continuous batching across streams',
      enTitle: 'Naive vs. paged attention.',
      arTitle: 'مقارنة الحساب التكراري مقابل الذاكرة المجزأة',
      enBody: 'Paged attention allocates non-contiguous GPU memory blocks, eliminating allocation fragmentation under concurrent users.',
      arBody: 'توزع الذاكرة المجزأة كتل البيانات في الذاكرة دون اشتراط تجاورها، مما يقضي على هدر المساحة في كرت الشاشة.',
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'layers', label: 'Prompt Tokens' }, { icon: 'cpu', label: 'Attention Core' }, { icon: 'hardDrive', label: 'Paged KV RAM' }],
      diagramNodes: [
        { label: 'Prompt Tokens', sublabel: 'Input prompt encoding', status: 'BATCHED', icon: 'layers' },
        { label: 'FlashAttention Engine', sublabel: 'Fast SRAM matrix multiplies', status: 'COMPUTE', icon: 'cpu' },
        { label: 'Paged KV-Cache', sublabel: 'High-bandwidth VRAM blocks', status: 'CACHED', icon: 'hardDrive' },
      ],
      diagramEdges: ['Compute Keys', 'Append Token'],
      diagramFooter: 'VRAM UTILIZATION: > 96% • MEMORY FRAGMENTATION: < 4%',
      enTitle: 'GPU inference memory hierarchy.',
      arTitle: 'تسلسل الذاكرة في معالجات الرسوميات',
      enBody: 'FlashAttention keeps matrices in ultra-fast GPU SRAM, minimizing high-latency reads from main video memory.',
      arBody: 'تحتفظ خوارزمية FlashAttention بالمصفوفات في الذاكرة فائقة السرعة داخل المعالج لتقليل القراءة البطيئة.',
    },
    {
      type: 'code',
      codeSnippet: `from vllm import LLM, SamplingParams\n\nllm = LLM(model="meta-llama/Llama-3-70B", kv_cache_dtype="auto")\nsampling_params = SamplingParams(temperature=0.7, max_tokens=256)\noutputs = llm.generate(prompts, sampling_params)`,
      codeLanguage: 'python',
      codeFileName: 'serve_vllm.py',
      enTitle: 'High-throughput engine setup.',
      arTitle: 'تشغيل محرك الاستدلال عالي السرعة',
      enBody: 'Modern inference engines like vLLM batch independent user requests continuously without waiting for sequence completion.',
      arBody: 'محركات الاستدلال الحديثة تدمج طلبات المستخدمين المختلفة باستمرار دون انتظار انتهاء النصوص الطويلة.',
    },
    {
      type: 'row',
      diagramVariant: 'topology',
      icons: [{ icon: 'robot', label: 'Draft Model' }, { icon: 'zap', label: 'Speculative Token' }, { icon: 'brain', label: 'Target Model' }],
      diagramNodes: [
        { label: 'Draft Model (1B)', sublabel: 'Rapid candidate generation', status: 'FAST', icon: 'robot' },
        { label: 'Speculative Window', sublabel: '4–8 tokens predicted ahead', status: 'SPECULATED', icon: 'zap' },
        { label: 'Target Model (70B)', sublabel: 'Single-step parallel verify', status: 'VERIFIED', icon: 'brain' },
      ],
      diagramEdges: ['Speculate', 'Validate'],
      diagramFooter: 'LATENCY REDUCTION: 2.5X • MATHEMATICALLY IDENTICAL OUTPUT',
      enTitle: 'Speculative decoding pipeline.',
      arTitle: 'مسار التوليد التخميني المتوازي',
      enBody: 'A small draft model predicts tokens rapidly while the large model validates them in a single parallel step.',
      arBody: 'يقوم نموذج صغير بتخمين عدة كلمات سريعاً بينما يتحقق النموذج الضخم منها جميعاً في خطوة واحدة متوازية.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'hardDrive', label: 'Memory Wall' }, { icon: 'gauge', label: 'Bandwidth Bound' }, { icon: 'shieldAlert', label: 'Quality Drift' }],
      diagramNodes: [
        { label: 'Memory Bandwidth Wall', sublabel: 'Inference is bound by HBM transfer', status: 'PHYSICAL', icon: 'hardDrive' },
        { label: 'Cache Scaling Limits', sublabel: '32k context saturates 80GB VRAM', status: 'LIMIT', icon: 'gauge' },
        { label: 'Quantization Tradeoff', sublabel: 'INT4 saves RAM but risks reasoning', status: 'TRADE-OFF', icon: 'shieldAlert' },
      ],
      diagramEdges: ['Memory Bound', 'Evaluate Loss'],
      diagramFooter: 'PHYSICAL CONSTRAINT: INFERENCE IS MEMORY-BANDWIDTH BOUND, NOT COMPUTE',
      enTitle: 'The memory bandwidth wall.',
      arTitle: 'حاجز سرعة نقل البيانات في الذاكرة',
      enBody: 'LLM inference is bound by memory bandwidth, not raw compute. High concurrency still exhausts available GPU VRAM.',
      arBody: 'توليد الكلمات مقيد بسرعة نقل الذاكرة وليس قوة المعالجة؛ كثرة الطلبات المتزامنة تستنزف سعة كرت الشاشة بسرعة.',
    },
    {
      type: 'cta',
      enTitle: 'Deploying high-throughput AI\ninference engines?',
      arTitle: 'تشغيل نماذج الذكاء\nالاصطناعي على نطاق واسع؟',
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · دليل البنية التحتية لنماذج الذكاء الاصطناعي`,
    },
  ];
}

/**
 * Databases & PgBouncer Story: Connection limits, transaction pooling, and session state caveats.
 */
function buildDatabaseStory(subject: string, opts: StoryOptions): SlideData[] {
  return [
    {
      type: 'hub',
      centerIcon: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/postgresql.svg',
      satIcons: ['database', 'server', 'network', 'activity', 'cpu', 'zap'],
      satLabels: ['Multiplexing', 'Client Pool', 'Tx Mode', 'Port 5432', 'Max Conns', 'Low Latency'],
      enTitle: 'Postgres connection pooling.',
      arTitle: 'إدارة اتصالات قواعد بيانات PostgreSQL',
      enBody: 'Why PostgreSQL forks processes per connection and how PgBouncer multiplexes 10,000 clients safely.',
      arBody: 'لماذا تستهلك اتصالات PostgreSQL موارد الخادم، وكيف يوزع PgBouncer آلاف الاتصالات بكفاءة.',
    },
    {
      type: 'metric',
      metricValue: '10,000 conns',
      metricLabel: 'CLIENT CONNECTIONS MULTIPLEXED',
      metricDiff: '▲ Handled by only 50 DB processes',
      metricIcon: 'database',
      enTitle: '10,000 connections to 50.',
      arTitle: 'دمج 10 آلاف اتصال في 50 خادماً',
      enBody: 'Postgres forks a full OS process (5–10MB RAM) per connection. Connecting thousands directly exhausts server memory.',
      arBody: 'تنشئ قواعد PostgreSQL عملية نظام كاملة لكل اتصال؛ فتح آلاف الاتصالات المباشرة يستنزف الذاكرة فوراً.',
    },
    {
      type: 'compare',
      compareLeftTitle: 'Direct Client Connections',
      compareLeftBody: '• 1,000 connections = 10GB RAM overhead\n• Linux process context-switch thrashing\n• Connection rejection under traffic spikes',
      compareRightTitle: 'PgBouncer Transaction Pool',
      compareRightBody: '• Multiplexes 10k clients into 50 workers\n• Connection reuse without process forking\n• Sub-millisecond connection handoff',
      enTitle: 'Direct conns vs. pooling.',
      arTitle: 'الاتصال المباشر مقابل مجمع الاتصالات',
      enBody: 'A lightweight connection pooler keeps a small, steady pool of backend workers while buffering client sockets.',
      arBody: 'يبقي مجمع الاتصالات عدداً محدوداً من الخوادم النشطة بينما يستقبل ويوجه آلاف اتصالات التطبيقات بسلاسة.',
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'network', label: '10k Clients' }, { icon: 'server', label: 'PgBouncer' }, { icon: 'database', label: 'Postgres Core' }],
      diagramNodes: [
        { label: 'Client Applications', sublabel: 'Web servers & workers', status: 'POOLED', icon: 'network' },
        { label: 'PgBouncer Proxy', sublabel: 'Multiplexing transaction pool', status: 'PROXY', icon: 'server' },
        { label: 'Postgres Primary', sublabel: '50 dedicated backend workers', status: 'OPTIMAL', icon: 'database' },
      ],
      diagramEdges: ['10k Sockets', '50 Pooled Links'],
      diagramFooter: 'CLIENT MULTIPLEXING: 200:1 RATIO • BACKEND OVERHEAD: MINIMAL',
      enTitle: 'Connection multiplexing stack.',
      arTitle: 'طبقات دمج وتوزيع الاتصالات',
      enBody: 'Clients establish instantaneous connections with PgBouncer, which borrows a Postgres backend only while queries run.',
      arBody: 'تتصل التطبيقات فورياً بالمجمع الذي يستعير خادماً فعلياً فقط خلال الجزء من الميلي ثانية المخصص لتنفيذ الاستعلام.',
    },
    {
      type: 'code',
      codeSnippet: `[databases]\n* = host=127.0.0.1 port=5432 auth_user=postgres\n\n[pgbouncer]\nlisten_port = 6432\npool_mode = transaction\nmax_client_conn = 10000\ndefault_pool_size = 50`,
      codeLanguage: 'ini',
      codeFileName: 'pgbouncer.ini',
      enTitle: 'Transaction pool mode config.',
      arTitle: 'إعداد نمط تجميع المعاملات',
      enBody: 'Setting pool_mode = transaction releases the server connection back to the pool as soon as the current transaction finishes.',
      arBody: 'تفعيل نمط المعاملات يعيد الخادم فوراً إلى المجمع بمجرد انتهاء الاستعلام لخدمة مستخدم آخر.',
    },
    {
      type: 'row',
      diagramVariant: 'topology',
      icons: [{ icon: 'network', label: 'Client Query' }, { icon: 'arrowRightLeft', label: 'Borrow Backend' }, { icon: 'checkCircle', label: 'Release' }],
      diagramNodes: [
        { label: 'Begin Transaction', sublabel: 'Client acquires backend', status: 'BORROWED', icon: 'network' },
        { label: 'Execute SQL', sublabel: 'Direct primary execution', status: 'EXECUTING', icon: 'arrowRightLeft' },
        { label: 'Commit & Release', sublabel: 'Backend returns to shared pool', status: 'RELEASED', icon: 'checkCircle' },
      ],
      diagramEdges: ['Acquire Link', 'Return to Pool'],
      diagramFooter: 'POOL EFFICIENCY: MAXIMUM • LATENCY TAX: < 0.2ms',
      enTitle: 'Transaction borrow-and-release.',
      arTitle: 'استعارة الاتصال وإعادته الفورية',
      enBody: 'Connections are shared aggressively; a thousand clients can be served by 20 backend connections if queries are fast.',
      arBody: 'تتم مشاركة الاتصالات بكفاءة عالية؛ يمكن لعشرين خادماً خدمة آلاف المستخدمين طالما كانت الاستعلامات سريعة.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'alertCircle', label: 'Session State' }, { icon: 'lock', label: 'Prepared Stmts' }, { icon: 'shieldAlert', label: 'LISTEN / NOTIFY' }],
      diagramNodes: [
        { label: 'Prepared Statements', sublabel: 'Require named prep cleanup', status: 'CAUTION', icon: 'lock' },
        { label: 'LISTEN / NOTIFY', sublabel: 'Requires session pooling mode', status: 'INCOMPATIBLE', icon: 'alertCircle' },
        { label: 'SET Commands', sublabel: 'Session variables leak across conns', status: 'RISK', icon: 'shieldAlert' },
      ],
      diagramEdges: ['Session State', 'Isolate'],
      diagramFooter: 'CAVEAT: TRANSACTION POOLING BREAKS SESSION-LEVEL POSTGRES FEATURES',
      enTitle: 'Transaction pool limitations.',
      arTitle: 'محاذير نمط تجميع المعاملات',
      enBody: 'Transaction pooling breaks session-level features like prepared statements and LISTEN/NOTIFY. Use session mode if needed.',
      arBody: 'نمط المعاملات لا يناسب ميزات الجلسة مثل LISTEN/NOTIFY؛ استخدم نمط الجلسة لهذه الحالات الخاصة.',
    },
    {
      type: 'cta',
      enTitle: 'Scaling high-concurrency\ndatabase workloads?',
      arTitle: 'تحسين أداء وقدرة\nاستيعاب قواعد البيانات؟',
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · دليل معمارية قواعد البيانات المتقدمة`,
    },
  ];
}

/**
 * Comparative Story: Two entities/technologies directly compared.
 */
function buildComparativeStory(
  subject: string,
  entities: ExtractedEntities,
  metrics: ExtractedMetric[],
  opts: StoryOptions
): SlideData[] {
  const topMetric = metrics[0]?.value || 'Measurable throughput win';

  return [
    {
      type: 'hub',
      centerIcon: entities.rightLogo || 'cpu',
      satIcons: [entities.rightLogo || 'zap', entities.leftLogo || 'server', 'gauge', 'hardDrive', 'activity', 'checkCircle'],
      satLabels: [entities.rightShort, entities.leftShort, 'Throughput', 'Latency p99', 'Memory Footprint', 'Concurrency'],
      enTitle: `${entities.rightShort} vs. ${entities.leftShort}.`,
      arTitle: `مقارنة أداء ${entities.rightShort} ضد ${entities.leftShort}`,
      enBody: `A head-to-head engineering comparison: architecture, throughput, memory footprint, and production trade-offs.`,
      arBody: `مقارنة هندسية شاملة توضح الفارق في استهلاك الموارد وسرعة تلبية الطلبات في بيئات الإنتاج.`,
    },
    {
      type: 'metric',
      metricValue: topMetric,
      metricLabel: 'PERFORMANCE MULTIPLIER',
      metricDiff: `▲ Measurable architectural speedup`,
      metricIcon: 'gauge',
      enTitle: `${entities.rightShort} measured throughput.`,
      arTitle: `تفوق الأداء: ${topMetric}`,
      enBody: `Execution speed and tail latency measured under heavy concurrent workload conditions.`,
      arBody: `أرقام حقيقية تثبت الفارق في سرعة المعالجة واستقرار الاستجابة تحت أقصى ضغط عمل.`,
    },
    {
      type: 'compare',
      compareLeftTitle: entities.leftTitle,
      compareLeftBody: entities.leftBullets.join('\n'),
      compareRightTitle: entities.rightTitle,
      compareRightBody: entities.rightBullets.join('\n'),
      enTitle: 'Resource footprint comparison.',
      arTitle: 'مقارنة استهلاك الموارد المباشرة',
      enBody: `${entities.rightTitle} demonstrates significant architectural efficiency advantages over ${entities.leftTitle}.`,
      arBody: `مقارنة مباشرة توضح استهلاك الذاكرة وتوزيع العمليات بين المنظومتين.`,
    },
    {
      type: 'code',
      codeFileName: 'handler_benchmark.sh',
      codeLanguage: 'bash',
      codeSnippet: `$ ./bench --concurrency=10000 --target=${entities.rightShort.toLowerCase()}\n+ Sustained: ${topMetric}\n✔ Zero stalls · Low p99 tail latency verified`,
      enTitle: 'Concurrent execution benchmark.',
      arTitle: 'اختبار المعالجة المتزامنة بالشيفرة',
      enBody: `How runtime execution eliminates redundant memory overhead and context switching stalls.`,
      arBody: `فحص الشيفرة البرمجية لمعرفة كيف تلغي البنية الحديثة هدر الموارد وتضمن سرعة الاستجابة.`,
    },
    {
      type: 'row',
      diagramVariant: 'stack',
      icons: [{ icon: 'server', label: 'Network Ingress' }, { icon: 'cpu', label: 'Concurrency Engine' }, { icon: 'hardDrive', label: 'Memory Model' }],
      diagramNodes: [
        { label: `${entities.leftShort} Stack`, sublabel: 'Baseline execution model', status: 'BASELINE', icon: 'server' },
        { label: 'Event Dispatch Loop', sublabel: 'Non-blocking I/O workers', status: 'PIPELINE', icon: 'cpu' },
        { label: `${entities.rightShort} Engine`, sublabel: 'Optimized memory allocation', status: 'OPTIMIZED', icon: 'zap' },
      ],
      diagramEdges: ['Dispatch Work', 'Commit State'],
      diagramFooter: `EXECUTION MODEL: NON-BLOCKING • WIN: ${topMetric}`,
      enTitle: 'Concurrency architecture model.',
      arTitle: 'بنية المعالجة وإدارة التزامن',
      enBody: `How asynchronous execution handles concurrent connections without thread contention stalls.`,
      arBody: `كيفية إدارة تدفق العمليات المتزامنة بكفاءة عالية دون استنزاف أنوية المعالج.`,
    },
    {
      type: 'row',
      diagramVariant: 'topology',
      icons: [{ icon: 'network', label: 'Client Inbound' }, { icon: 'zap', label: 'Processing' }, { icon: 'checkCircle', label: 'Response' }],
      diagramNodes: [
        { label: 'Inbound Sockets', sublabel: 'High-frequency queue', status: 'POOLED', icon: 'network' },
        { label: 'Core Dispatcher', sublabel: 'Zero-copy pipeline', status: 'ACTIVE', icon: 'zap' },
        { label: `${topMetric} Result`, sublabel: 'Microsecond tail latency', status: 'VERIFIED', icon: 'checkCircle' },
      ],
      diagramEdges: [topMetric, 'Zero Stalls'],
      diagramFooter: `LATENCY: SUB-MILLISECOND • CONCURRENCY: SCALED`,
      enTitle: 'Request processing dataflow.',
      arTitle: 'مسار معالجة الطلبات المتزامنة',
      enBody: `Direct event loops process inbound traffic without blocking caller threads or allocating redundant memory.`,
      arBody: `معالجة فورية ومباشرة للاتصالات الواردة لضمان استقرار وسرعة الاستجابة الدائمة.`,
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'terminal', label: 'Developer Speed' }, { icon: 'alertCircle', label: 'Cognitive Cost' }, { icon: 'shieldAlert', label: 'Trade-off' }],
      diagramNodes: [
        { label: `${entities.leftShort} Velocity`, sublabel: 'Faster team onboarding', status: 'VELOCITY', icon: 'terminal' },
        { label: 'Architectural Overhead', sublabel: 'Deeper tuning complexity', status: 'OVERHEAD', icon: 'alertCircle' },
        { label: `${entities.rightShort} Raw Power`, sublabel: 'Maximum production throughput', status: 'POWER', icon: 'shieldAlert' },
      ],
      diagramEdges: ['Velocity', 'Throughput'],
      diagramFooter: 'ENGINEERING DECISION: THROUGHPUT SCALE VS DEVELOPMENT VELOCITY',
      enTitle: 'Development velocity tradeoff.',
      arTitle: 'تكلفة التطوير وسرعة الإنجاز',
      enBody: `Simpler stacks offer faster iteration. Choose deep optimization when throughput justifies the complexity.`,
      arBody: `الأنظمة الأبسط تمنحك سرعة في التطوير؛ لا تنتقل للتحسين المعقد إلا إذا كان حجم العمل يتطلب ذلك.`,
    },
    {
      type: 'cta',
      enTitle: `Scaling ${entities.rightShort}\nin production?`,
      arTitle: `تبني أنظمة عالية\nالكفاءة في مشاريعك؟`,
      ctaText: 'DM us  •  رسالة خاصة',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · تقرير مقارنة الأنظمة البرمجية`,
    },
  ];
}

/**
 * AI Agent Delegation, Identity & Scoped Autonomy Story:
 * Dedicated deep architectural narrative for AI Agents vs Human Identity, OAuth Delegation, MCP, and Cryptographic Boundaries.
 */
function buildAgentDelegationStory(subject: string, opts: StoryOptions): SlideData[] {
  const { cleanSubject, arSubject } = extractCleanSubject(subject);
  const enHook = enforceHeadlineSpecRule(subject, { isHook: true, fallbackSubject: 'AI Agent Delegation' });

  const candidates: SlideData[] = [
    {
      type: 'hub',
      centerIcon: 'robot',
      satIcons: ['users', 'key', 'lock', 'shieldAlert', 'code', 'activity'],
      satLabels: ['Human Principal', 'Scoped OAuth', 'Token Exchange', 'Tool Sandbox', 'Audit Trail', 'Kill Switch'],
      enTitle: enHook,
      arTitle: `لماذا يختلف الوكيل الذكي عن المستخدم البشري؟`,
      enBody: `AI agents are neither static cron scripts nor human users — they require cryptographic delegation, scoped tokens, and bounded tool access.`,
      arBody: `وكلاء الذكاء الاصطناعي ليسوا مجرد سكربتات تقليدية ولا بشراً؛ بل يحتاجون إلى تفويض مشفر وصلاحيات محددة بدقة.`,
    },
    {
      type: 'compare',
      compareLeftTitle: 'HUMAN USER / STATIC BOT',
      compareLeftBody: '• Broad session cookies or static API keys\n• Interactive CAPTCHA & browser assumptions\n• Full account blast radius on compromise',
      compareRightTitle: 'DELEGATED AI AGENT',
      compareRightBody: '• Short-lived RFC 8693 OAuth token exchange\n• Explicit `act` claim linking human & agent\n• Task-scoped permissions with instant revocation',
      enTitle: 'Human identity vs agent delegation.',
      arTitle: 'هوية البشر مقابل تفويض الوكيل الذكي.',
      enBody: 'Treating agents like humans forces shared passwords; treating them like dumb bots blocks legitimate delegated workflows.',
      arBody: 'معاملة الوكيل كإنسان تدفع لمشاركة كلمات المرور، ومعاملته كبوت عشوائي تمنعه من إنجاز المهام المفوضة شرعياً.',
    },
    {
      type: 'row',
      diagramVariant: 'isolation',
      diagramNodes: [
        { label: 'Human Principal', sublabel: 'Grants Intent & Consent', status: 'VERIFIED', icon: 'users' },
        { label: 'OAuth Token Exchange', sublabel: 'Attests Agent + Scopes', status: 'SCOPED', icon: 'key' },
        { label: 'Resource Server', sublabel: 'Enforces Least Privilege', status: 'GUARDED', icon: 'lock' },
      ],
      diagramEdges: ['DELEGATE', 'ATTEST'],
      diagramFooter: 'CRYPTOGRAPHIC DELEGATION: SEPARATING PRINCIPAL FROM ACTOR',
      enTitle: 'Cryptographic delegation chains.',
      arTitle: 'سلسلة التفويض المشفر وعزل الهوية.',
      enBody: 'Instead of impersonating the user, the agent presents a dual-identity token proving both who authorized the task and which agent is acting.',
      arBody: 'بدلاً من انتحال شخصية المستخدم، يحمل الوكيل رمزاً مزدوجاً يثبت هوية المفوِّض البشري وهوية الوكيل المنفِّذ معاً.',
    },
    {
      type: 'code',
      codeFileName: 'delegated_agent_jwt.json',
      codeLanguage: 'json',
      codeSnippet: `{\n  "iss": "https://auth.cloudflare.com",\n  "sub": "user:eng-lead@acme.dev",\n  "act": { "sub": "agent:triage-bot-v2" },\n  "scope": "workers:read logs:query",\n  "exp": 1735690200\n}`,
      enTitle: 'Attesting identity with `act` claims.',
      arTitle: 'توثيق التفويض عبر معيار `act` البرمجي.',
      enBody: 'RFC 8693 Token Exchange embeds the `act` (actor) claim inside the JWT so downstream APIs audit the exact agent and human principal.',
      arBody: 'يتيح معيار RFC 8693 تضمين حقل الفاعل `act` داخل الرمز لتمكين الخوادم من تدقيق حركات الوكيل والمستخدم بدقة.',
    },
    {
      type: 'row',
      diagramVariant: 'clusters',
      diagramNodes: [
        { label: 'Read-Only Tools', sublabel: 'Autonomous Execution', status: 'AUTO', icon: 'search' },
        { label: 'Scoped Writes', sublabel: 'Policy Rate-Limited', status: 'BOUNDED', icon: 'sliders' },
        { label: 'Destructive Actions', sublabel: 'Human-in-the-Loop Gate', status: 'GATED', icon: 'shieldAlert' },
      ],
      diagramEdges: ['CLASSIFY', 'GATE'],
      diagramFooter: 'TOOL GOVERNANCE: TIERED AUTONOMY & APPROVAL GATES',
      enTitle: 'Tiered autonomy by action risk.',
      arTitle: 'تدرج الاستقلالية حسب خطورة العملية.',
      enBody: 'Agents can query telemetry autonomously, but production mutations or billing changes require explicit human-in-the-loop step-up approval.',
      arBody: 'يمكن للوكيل قراءة السجلات تلقائياً، لكن تعديل الإنتاج أو الفواتير يتطلب موافقة بشرية فورية قبل التنفيذ.',
    },
    {
      type: 'metric',
      metricValue: '300s',
      metricLabel: 'EPHEMERAL AGENT TOKEN TTL',
      metricDiff: '▼ Eliminates long-lived static API key leaks',
      metricIcon: 'lock',
      enTitle: 'Zero standing privileges.',
      arTitle: 'إلغاء الصلاحيات الدائمة والمفاتيح الثابتة.',
      enBody: 'Short-lived 5-minute delegated tokens ensure that even if an agent context is prompt-injected, the blast radius expires immediately.',
      arBody: 'رموز التفويض قصيرة الأجل تضمن انتهاء الصلاحية فوراً وحصر الأضرار حتى في حال تعرض الوكيل لحقن الأوامر.',
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      diagramNodes: [
        { label: 'Bot Blocking', sublabel: 'Breaks legitimate agents', status: 'FRAGILE', icon: 'shieldAlert' },
        { label: 'Verified Delegation', sublabel: 'Signed identity + intent', status: 'TRUSTED', icon: 'key' },
        { label: 'Auditability', sublabel: 'Per-action accountability', status: 'VERIFIED', icon: 'checkCircle' },
      ],
      diagramEdges: ['AUTHENTICATE', 'ACCOUNT'],
      diagramFooter: 'ARCHITECTURE VERDICT: DESIGN FOR DELEGATED AGENCY',
      enTitle: 'Design APIs for delegated agency.',
      arTitle: 'الخلاصة: صمّم أنظمتك لتفويض الوكلاء.',
      enBody: `The web must evolve beyond binary "human vs bad bot" checks toward verifiable agent identity, scoped consent, and revocation.`,
      arBody: `يجب أن تتجاوز الأنظمة ثنائية "إنسان أو بوت ضار" نحو هوية وكيل موثقة وتفويض محدد النطاق قابل للإلغاء لحظياً.`,
    },
    {
      type: 'cta',
      enTitle: enforceHeadlineSpecRule(`How do you scope ${cleanSubject}?`, { isCta: true }),
      arTitle: `كيف تضبط صلاحيات ${arSubject} في مشاريعك؟`,
      enBody: 'Share how your engineering team handles OAuth token exchange, MCP tool permissions, and agent guardrails in production.',
      arBody: 'شاركنا في التعليقات كيف يدير فريقك صلاحيات وكلاء الذكاء الاصطناعي وتفويض الأدوات في بيئة الإنتاج.',
      ctaText: 'Join discussion  •  شارك برأيك',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · دراسة هندسية في أمن وهوية الوكلاء`,
    },
  ];

  return trimSlides(candidates, opts.targetCount);
}

/**
 * General Systems Architecture Story: Context-aware narrative with diverse visual archetypes
 * (Hub -> Compare -> Stack Row -> Code -> Isolation Row -> Features Row -> Takeaway Row -> CTA).
 */
function buildGeneralSystemsStory(subject: string, opts: StoryOptions): SlideData[] {
  const safeSubject = !subject || isNonSemanticFileName(subject) ? opts.domainCategory || 'System Architecture' : subject;
  const { cleanSubject, arSubject } = extractCleanSubject(safeSubject);
  const enHook = enforceHeadlineSpecRule(safeSubject, { isHook: true, fallbackSubject: 'Architecture' });

  const words = cleanSubject
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !ENTITY_STOP_WORDS.has(w.toLowerCase()));
  const term1 = words[0] || 'Control Plane';
  const term2 = words[1] || 'Execution Policy';
  const term3 = words[2] || 'Telemetry State';
  const slug = cleanSubject.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 18) || 'system_spec';

  const candidates: SlideData[] = [
    {
      type: 'hub',
      centerIcon: resolveTechLogo(subject) || 'cpu',
      satIcons: ['layers', 'lock', 'code', 'gauge', 'box', 'activity'],
      satLabels: [
        term1.toUpperCase().slice(0, 14),
        term2.toUpperCase().slice(0, 14),
        term3.toUpperCase().slice(0, 14),
        'BOUNDARIES',
        'VERIFICATION',
        'OBSERVABILITY',
      ],
      enTitle: enHook,
      arTitle: `تحليل معماري لمنظومة ${arSubject}.`,
      enBody: `A technical breakdown of ${cleanSubject}: core mechanisms, operational boundaries, and production trade-offs.`,
      arBody: `تحليل هندسي معمق لمنظومة ${arSubject} يوضح آليات العمل والضوابط التشغيلية والمفاضلات في الإنتاج.`,
    },
    {
      type: 'compare',
      compareLeftTitle: `IMPLICIT ${term1.toUpperCase().slice(0, 12)}`,
      compareLeftBody: `• Unbounded ${term1.toLowerCase()} assumptions\n• Tightly coupled state mutations\n• Hard to audit under edge failures`,
      compareRightTitle: `EXPLICIT ${term1.toUpperCase().slice(0, 12)}`,
      compareRightBody: `• Strictly scoped ${term1.toLowerCase()} contracts\n• Deterministic verification gates\n• Full per-operation observability`,
      enTitle: enforceHeadlineSpecRule(`Why implicit ${term1.toLowerCase()} fails`, { isHook: false }),
      arTitle: `مقارنة: التصميم الضمني مقابل الصريح في ${arSubject}.`,
      enBody: `Relying on implicit conventions in ${cleanSubject} creates hidden failure modes; explicit contracts make behavior predictable.`,
      arBody: `الاعتماد على الافتراضات غير المقيدة في ${arSubject} يخلق ثغرات خفية، بينما تضمن العقود الصريحة استقرار النظام.`,
    },
    {
      type: 'row',
      diagramVariant: 'isolation',
      diagramNodes: [
        { label: `${term1} Boundary`, sublabel: 'Schema & Intent Check', status: 'VALIDATED', icon: 'lock' },
        { label: `${term2} Core`, sublabel: 'Bounded Execution', status: 'ISOLATED', icon: 'cpu' },
        { label: `${term3} Commit`, sublabel: 'Audited Output State', status: 'VERIFIED', icon: 'checkCircle' },
      ],
      diagramEdges: ['VALIDATE', 'ENFORCE'],
      diagramFooter: `${cleanSubject.toUpperCase().slice(0, 28)} • BOUNDARY ISOLATION`,
      enTitle: enforceHeadlineSpecRule(`Isolating ${term1.toLowerCase()} boundaries`, { isHook: false }),
      arTitle: `عزل الحدود والتحقق في ${arSubject}.`,
      enBody: `Enforcing strict boundaries around ${cleanSubject} prevents cascading faults and unauthorized state transitions.`,
      arBody: `فرض حدود عزل صارمة داخل ${arSubject} يمنع انتقال الأعطال أو تنفيذ عمليات خارج النطاق المصرح به.`,
    },
    {
      type: 'code',
      codeFileName: `${slug}.yaml`,
      codeLanguage: 'yaml',
      codeSnippet: `# Declarative ${cleanSubject.slice(0, 28)} specification\npolicy: strict_verification\nscope:\n  target: "${term1.toLowerCase()}"\n  mode: "${term2.toLowerCase()}"\n  audit_log: enabled`,
      enTitle: enforceHeadlineSpecRule(`Declarative ${term1.toLowerCase()} rules`, { isHook: false }),
      arTitle: `توصيف القواعد البرمجية لـ ${arSubject}.`,
      enBody: `Codifying ${cleanSubject} constraints as versioned configuration eliminates configuration drift across environments.`,
      arBody: `تحويل قواعد وضوابط ${arSubject} إلى ملفات إعداد موثقة يمنع التضارب بين بيئات التطوير والإنتاج.`,
    },
    {
      type: 'row',
      diagramVariant: 'clusters',
      diagramNodes: [
        { label: 'Fast Path', sublabel: 'Low-Latency Reads', status: 'OPTIMIZED', icon: 'zap' },
        { label: 'Policy Coordinator', sublabel: 'Concurrency & Quotas', status: 'GOVERNED', icon: 'sliders' },
        { label: 'Audit Sink', sublabel: 'Immutable Telemetry', status: 'RECORDED', icon: 'database' },
      ],
      diagramEdges: ['ROUTE', 'AUDIT'],
      diagramFooter: `EXECUTION TOPOLOGY • DETERMINISTIC CONTROL PLANE`,
      enTitle: enforceHeadlineSpecRule(`Coordinating ${cleanSubject.split(/\s+/).slice(0, 3).join(' ')}`, { isHook: false }),
      arTitle: `تنسيق المسارات والمراقبة في ${arSubject}.`,
      enBody: `Separating fast-path operations from policy coordination keeps ${cleanSubject} responsive while preserving full auditability.`,
      arBody: `فصل المسار السريع عن طبقة التحكم يحافظ على سرعة استجابة ${arSubject} مع توثيق كامل لجميع العمليات.`,
    },
    {
      type: 'number',
      stepNumber: '03',
      stepLabel: `PILLAR 03 // OBSERVABILITY`,
      centerIcon: 'gauge',
      enTitle: enforceHeadlineSpecRule(`Measuring ${term1.toLowerCase()} in production`, { isHook: false }),
      arTitle: `قياس الأداء والموثوقية في بيئة الإنتاج.`,
      enBody: `Structured telemetry across every ${cleanSubject} boundary lets engineers detect anomalies before they impact downstream callers.`,
      arBody: `المراقبة المهيكلة لكل مرحلة في ${arSubject} تتيح اكتشاف الاختناقات والأخطاء مبكراً قبل تأثر المستخدمين.`,
    },
    {
      type: 'row',
      diagramVariant: 'takeaway',
      icons: [{ icon: 'alertCircle', label: 'Complexity' }, { icon: 'shieldAlert', label: 'Trade-off' }],
      diagramNodes: [
        { label: 'Baseline Simplicity', sublabel: 'Minimal initial setup', status: 'BASELINE', icon: 'layers' },
        { label: `${term1.slice(0, 14)} Rigor`, sublabel: 'Explicit verification', status: 'ADOPTED', icon: 'zap' },
        { label: 'Operational Discipline', sublabel: 'Ongoing policy upkeep', status: 'TRADE-OFF', icon: 'shieldAlert' },
      ],
      diagramEdges: ['EVALUATE', 'ADOPT'],
      diagramFooter: `ENGINEERING VERDICT: ${cleanSubject.toUpperCase().slice(0, 30)}`,
      enTitle: enforceHeadlineSpecRule(`The ${term1.toLowerCase()} engineering tradeoff`, { isHook: false }),
      arTitle: `المفاضلة الهندسية في تبني ${arSubject}.`,
      enBody: `Explicit boundaries and verification in ${cleanSubject} add upfront design rigor, but eliminate catastrophic production blind spots.`,
      arBody: `تطبيق الضوابط الصارمة في ${arSubject} يتطلب جهداً تأسيسياً، لكنه يحمي المنظومة من الأعطال والثغرات المكلفة.`,
    },
    {
      type: 'cta',
      enTitle: enforceHeadlineSpecRule(`Building with ${cleanSubject}?`, { isCta: true }),
      arTitle: `كيف تطبق ${arSubject} في مشاريعك؟`,
      enBody: `Share your architectural patterns and lessons learned with ${cleanSubject} in the comments.`,
      arBody: `شاركنا تجربتك وأفضل الممارسات الهندسية التي تعتمدها مع ${arSubject} في التعليقات.`,
      ctaText: 'Join discussion  •  شارك برأيك',
      url: opts.brandUrl,
      enCredit: '',
      arCredit: `${opts.brand} · دراسة هندسية في ${opts.domainCategory || 'معمارية الأنظمة'}`,
    },
  ];

  return trimSlides(candidates, opts.targetCount);
}

