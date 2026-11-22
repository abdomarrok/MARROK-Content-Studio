import { KNOWN_TECH_LOGOS } from '../../techLogos.ts';

export const GO_LANGUAGE_PATTERN =
  /\b(?:golang|gin|goroutine(?:s)?|go\s+(?:runtime|server|http|lang(?:uage)?|channels?|scheduler|gc|garbage\s+collector|modules?|1\.\d+))\b|\bgo\b(?=\s*(?:vs\.?|versus|performance|benchmark|web\s*api|api\b))/i;

export const COMPARISON_SEPARATOR =
  /\s+(?:vs\.?|versus|compared\s+(?:to|with)|against|faster\s+than|slower\s+than|better\s+than)\s+/i;

export const ENTITY_STOP_WORDS = new Set([
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

export function normalizeComparisonName(candidate: string): string {
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

export function tokenizeEntity(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9.+#]+/)
    .map((token) => token.replace(/^[.+#]+|[.+#]+$/g, ''))
    .filter((token) => token.length >= 2 && !ENTITY_STOP_WORDS.has(token));
}

export function entityMentionedInClause(name: string, clause: string): boolean {
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

export function canonicalizeEntity(name: string, rawText: string): string {
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
