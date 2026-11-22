import type { HubNodeReason, SlideData } from '../../../types.ts';
import { CONTENT_QUALITY_FILLER_LABELS } from '../../qaChecks.ts';
import { TECH_ICONS_LIST } from '../../techLogos.ts';
import { HUB_FILLER_TOKENS, STOP_WORDS } from './constants.ts';

/**
 * Matches tech brand logos and semantic vector icons mentioned in slide copy.
 */
export function matchSlideIconsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const matched: string[] = [];
  const addUnique = (icon: string) => {
    if (icon && !matched.includes(icon)) matched.push(icon);
  };

  // 1. Check 35+ curated tech brands & aliases first
  for (const brand of TECH_ICONS_LIST) {
    const terms = [
      brand.name.toLowerCase(),
      brand.title.toLowerCase(),
      ...(brand.aliases || []).map((a) => a.toLowerCase()),
    ];
    for (const term of terms) {
      if (term.length <= 2) {
        const rx = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (rx.test(lower)) {
          addUnique(brand.name);
          break;
        }
      } else if (lower.includes(term)) {
        addUnique(brand.name);
        break;
      }
    }
  }

  const isFinancialOrMacro =
    /\$|\b(?:valuation|billion|trillion|loss|losses|deficit|capital|financing|circular|subsid|taxpayer|retiree|s&p|pension|401k|revenue|spend|spent|cash[- ]?out|stake|economy|economic|inflation|energy\s+bill|gigawatt|nuclear|market|investor|debt|financial)\b|مليار|تريليون|خسائر|تمويل|تقييم|ضرائب|متقاعد|طاقة|اقتصاد|استثمار/i.test(
      lower
    );

  // 2. Semantic domain vector icons from ICONS_REGISTRY
  const domainRules: Array<{ rx: RegExp; icon: string }> = [
    {
      rx: /\$|\b(?:valuation|capital|revenue|spend|spent|cash[- ]?out|financing|billion|trillion|money|price|cost|fund|funding|invest)\b|مليار|تريليون|تمويل|تقييم|دولار|عوائد|إنفاق/i,
      icon: 'dollarSign',
    },
    {
      rx: /\b(?:bank|government|gov|taxpayer|treasury|subsid|backstop|fed|policy|state\s+stake|public\s+fund|wall\s+street)\b|حكومة|ضرائب|دعم|خزانة|مصرف|بنك/i,
      icon: 'landmark',
    },
    {
      rx: /\b(?:loss|losses|deficit|burn|debt|crash|drop|bubble|default|insolven)\b|خسائر|عجز|ديون|انهيار|فقاعة/i,
      icon: 'trendingDown',
    },
    {
      rx: /\b(?:nuclear|gigawatt|gw\b|power\s+plant|grid|energy|electricity|factory|industrial|megawatt)\b|طاقة|كهرباء|نووي|محطة|مفاعل|جيجاوات/i,
      icon: 'factory',
    },
    {
      rx: /\b(?:circular|loop|round[- ]?trip|recycle|self[- ]?reinforc)\b|دائري|حلقة|تدوير/i,
      icon: 'lifecycle',
    },
    {
      rx: /\b(?:retiree|pension|401k|s&p|index\s+fund|household|consumer|worker|employee)\b|متقاعد|معاش|مستهلك|موظف|صناديق/i,
      icon: 'users',
    },
    {
      rx: /\b(?:trade[- ]?off|risk|exposure|gamble|bet|leverage|balance)\b|مخاطر|مفاضلة|رهان|تعرض/i,
      icon: 'scales',
    },
    {
      rx: /security|breach|hack|threat|attack|vulnerability|zero[- ]?trust|firewall|guard|exploit|اختراق|أمن|تهديد|حماية/i,
      icon: 'shieldAlert',
    },
    {
      rx: /auth|encrypt|tls|mtls|crypto|permission|secret|token|password|lock|تشفير|صلاحيات/i,
      icon: 'lock',
    },
    {
      rx: /key|certificate|jwt|oauth|identity|signing|مفتاح|هوية/i,
      icon: 'key',
    },
    {
      rx: /\bai\b|agent|llm|model|neural|inference|prompt|autonomous|ذكاء اصطناعي|وكيل|نموذج/i,
      icon: 'robot',
    },
    {
      rx: /vector|embedding|database|sql|table|index|query|storage|store|cache|قاعدة بيانات|تخزين|فهرس/i,
      icon: 'database',
    },
    {
      rx: /cpu|compute|thread|core|kernel|process|engine|execution|chip|gpu|معالج|نواة|تشغيل|رقائق/i,
      icon: 'cpu',
    },
    {
      rx: /fast|latency|speed|throughput|performance|sub-ms|instant|p99|سرعة|أداء|استجابة/i,
      icon: 'zap',
    },
    {
      rx: /metric|benchmark|telemetry|monitor|observability|rate|score|قياس|مؤشر/i,
      icon: 'gauge',
    },
    {
      rx: /network|mesh|routing|ingress|proxy|gateway|load balanc|cluster|شبكة|توجيه/i,
      icon: 'network',
    },
    {
      rx: /cloud|serverless|region|cdn|distributed|سحابة|موزع/i,
      icon: 'cloud',
    },
    {
      rx: /code|compile|function|script|api|sdk|json|schema|كود|برمجة/i,
      icon: 'code',
    },
    {
      rx: /cli|terminal|shell|bash|command|deploy|طرفية|أوامر/i,
      icon: 'terminal',
    },
    {
      rx: /search|find|scan|lookup|filter|retrieval|بحث|استرجاع/i,
      icon: 'search',
    },
    {
      rx: /layer|stack|tier|hierarchy|pipeline|stage|طبقة|مراحل/i,
      icon: 'layers',
    },
    {
      rx: /git|branch|merge|commit|version|workflow|دمج|نسخة/i,
      icon: 'gitMerge',
    },
    {
      rx: /container|pod|sandbox|isolation|vm|حاوية|عزل/i,
      icon: 'box',
    },
    {
      rx: /disk|wal|log|snapshot|backup|volume|قرص|سجل/i,
      icon: 'hardDrive',
    },
    {
      rx: /user|client|team|organization|access|مستخدم|فريق/i,
      icon: 'users',
    },
    {
      rx: /server|host|node|instance|backend|خادم|عقدة/i,
      icon: 'server',
    },
  ];

  for (const rule of domainRules) {
    if (rule.rx.test(lower)) {
      addUnique(rule.icon);
    }
  }

  // Ensure at least 6 icons are available for Hub / Node fallbacks
  const defaultFallbackPool = isFinancialOrMacro
    ? ['dollarSign', 'landmark', 'factory', 'scales', 'trendingDown', 'lifecycle', 'users', 'cpu']
    : ['cpu', 'shieldAlert', 'database', 'network', 'zap', 'layers', 'server', 'lock'];
  for (const fb of defaultFallbackPool) {
    addUnique(fb);
  }

  return matched;
}

/**
 * Extracts crisp, non-overlapping 1-2 word technical terms/phrases from a slide's title and body.
 * Prevents root-word collisions (e.g. "DISCORD" + "STORES TRILLIONS" + "TRILLIONS" + "STORES" or "CLOUD" + "CLOUDFLARE").
 */
export function extractKeyPhrasesFromSlide(slide: SlideData): string[] {
  const combined = `${slide.enTitle || ''} ${slide.enBody || ''}`;
  const clean = combined
    .replace(/[`"*_~[\]()<>]/g, ' ')
    .replace(/[—–]/g, ' ');

  const phrases: string[] = [];
  const usedRootTokens = new Set<string>();

  const normalizeRootToken = (word: string): string => {
    const lower = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (lower.length > 5 && lower.endsWith('s')) return lower.slice(0, -1);
    return lower;
  };

  const addPhrase = (raw: string) => {
    const trimmed = raw.replace(/^[^a-zA-Z0-9$]+|[^a-zA-Z0-9+%$]+$/g, '').trim();
    if (trimmed.length < 3) return;
    const words = trimmed
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase()));
    if (words.length === 0) return;

    const candidate = words.slice(0, 2).join(' ');
    if (candidate.length < 3) return;
    if (STOP_WORDS.has(candidate.toLowerCase())) return;
    if (CONTENT_QUALITY_FILLER_LABELS.has(candidate.toUpperCase())) return;

    const candidateRoots = words.slice(0, 2).map(normalizeRootToken).filter((r) => r.length >= 3);
    if (candidateRoots.length === 0) return;

    // Reject if any root token is already used or is a prefix/substring of an existing root (e.g. CLOUD vs CLOUDFLARE)
    const hasOverlap = candidateRoots.some((root) => {
      if (usedRootTokens.has(root)) return true;
      for (const existing of usedRootTokens) {
        if (root.length >= 4 && existing.length >= 4) {
          if (existing.startsWith(root) || root.startsWith(existing)) return true;
        }
      }
      return false;
    });
    if (hasOverlap) return;

    const upper = candidate.toUpperCase();
    if (!phrases.some((p) => p.toUpperCase() === upper)) {
      phrases.push(candidate);
      candidateRoots.forEach((r) => usedRootTokens.add(r));
    }
  };

  // 1. Hard metrics + noun pairs first (e.g. "93.3% Drop", "100 GB Scale", "4KB Keys")
  const metricMatches =
    clean.match(
      /(?:\$\d[\d,.]*[KMBTkmbt]?|\b\d+(?:\.\d+)?(?:%|x|X|ms|µs|ns|KB|MB|GB|TB|GW|M|B|T))\s+[A-Za-z][A-Za-z0-9-]*/g
    ) || [];
  for (const mm of metricMatches) {
    addPhrase(mm);
  }

  // 2. Capitalized multi-word technical terms or acronyms (e.g. "Zero-Trust", "Durable Objects", "HNSW Graph")
  const capMatches = clean.match(/\b[A-Z][a-zA-Z0-9+-]*(?:\s+[A-Z][a-zA-Z0-9+-]*)?\b/g) || [];
  for (const m of capMatches) {
    addPhrase(m);
  }

  // 2b. High-signal 2-word technical noun compounds in body/title (e.g. "spending caps", "cloud costs", "signature size")
  const compoundNounMatches =
    clean.match(
      /\b(?:spending\s+caps?|cloud\s+costs?|cost\s+caps?|rate\s+limits?|zero[- ]trust|post[- ]quantum|signature\s+sizes?|privacy\s+pass|agentic\s+traffic|memory\s+safety|vector\s+index|cache\s+eviction|cold\s+starts?|edge\s+workers?|state\s+storage|billing\s+guard|token\s+limits?)\b/gi
    ) || [];
  for (const cm of compoundNounMatches) {
    const titleCased = cm
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    addPhrase(titleCased);
  }

  // 3. Meaningful content words from title and body
  const words = clean
    .replace(/[.?!,:;]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w.toLowerCase()));

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const formatted = w.charAt(0).toUpperCase() + w.slice(1);
    addPhrase(formatted);
  }

  return phrases;
}

/**
 * Extracts up to `targetCount` (default 5) non-repeating nouns/terms directly quoted from `sourceText`,
 * filtering out title/category echoes and returning one-line provenance reasons per node.
 */
export function extractSourceQuotedHubNodes(
  sourceText: string,
  options?: { titleText?: string; category?: string; targetCount?: number }
): { satLabels: string[]; hubNodeReasons: HubNodeReason[] } {
  const targetCount = options?.targetCount ?? 5;
  const cleanSource = (sourceText || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[`"*_~[\]()<>]/g, ' ')
    .replace(/[—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanSource) {
    return { satLabels: [], hubNodeReasons: [] };
  }
  const hasLatinScript = /[A-Za-z]{3,}/.test(cleanSource) || /[A-Za-z]{3,}/.test(options?.titleText || '');

  const forbiddenEchoRoots = new Set<string>();
  const addForbiddenText = (txt?: string) => {
    if (!txt) return;
    for (const rawTok of txt.toLowerCase().split(/[^a-z0-9\u0600-\u06FF]+/)) {
      const t = rawTok.trim();
      if (t.length >= 3 && !STOP_WORDS.has(t)) {
        forbiddenEchoRoots.add(t.length > 5 && t.endsWith('s') ? t.slice(0, -1) : t);
      }
    }
  };
  addForbiddenText(options?.category);

  const titleOnlyRoots = new Set<string>();
  if (options?.titleText) {
    for (const rawTok of options.titleText.toLowerCase().split(/[^a-z0-9\u0600-\u06FF]+/)) {
      const t = rawTok.trim();
      if (t.length >= 3 && !STOP_WORDS.has(t)) {
        titleOnlyRoots.add(t.length > 5 && t.endsWith('s') ? t.slice(0, -1) : t);
      }
    }
  }

  const normalizeRoot = (token: string): string => {
    const low = token.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '');
    if (low.length > 5 && low.endsWith('s')) return low.slice(0, -1);
    return low;
  };

  const candidates: HubNodeReason[] = [];
  const usedRoots = new Set<string>();

  const tryRegister = (rawPhrase: string, kind: 'compound' | 'metric-noun' | 'proper-noun' | 'source-term') => {
    const cleaned = rawPhrase
      .replace(/^[^A-Za-z0-9\u0600-\u06FF$]+|[^A-Za-z0-9\u0600-\u06FF%+$]+$/g, '')
      .trim();
    if (cleaned.length < 3) return;
    // Never emit Arabic fragments into English deck orbital nodes
    if (hasLatinScript && /[\u0600-\u06FF]/.test(cleaned)) return;

    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 3) return;
    if (words.some((w) => STOP_WORDS.has(w.toLowerCase()))) return;
    if (words.every((w) => HUB_FILLER_TOKENS.has(w.toLowerCase()))) return;
    if (words.some((w) => /^https?$/i.test(w))) return;
    // Do not accept leading/trailing verb forms (-ing/-ed) unless part of a known technical acronym or hyphenated term
    if (
      kind !== 'compound' &&
      kind !== 'metric-noun' &&
      words.some(
        (w) =>
          w.length > 6 &&
          /(?:ing|ated|izes|ized)$/i.test(w) &&
          !/routing|caching|sharding|indexing|pooling|tracing|logging|queuing|streaming/i.test(w)
      )
    ) {
      return;
    }

    let labelWords = words.slice(0, 2);
    if (labelWords.length === 2 && labelWords.join(' ').length > 14) {
      const shorterWord =
        labelWords[1].length >= 4 && !HUB_FILLER_TOKENS.has(labelWords[1].toLowerCase())
          ? labelWords[1]
          : labelWords[0];
      labelWords = [shorterWord];
    }
    const label = labelWords
      .join(' ')
      .toUpperCase()
      .slice(0, 14)
      .trim();
    if (label.length < 3) return;

    const roots = labelWords.map(normalizeRoot).filter((r) => r.length >= 3);
    if (roots.length === 0) return;

    // Never echo category tags (e.g. TECH / TECH HUMOR)
    if (roots.every((r) => forbiddenEchoRoots.has(r) || HUB_FILLER_TOKENS.has(r))) return;
    // Avoid picking labels that simply repeat headline words (including cross-script or single-word echoes)
    const latinRoots = labelWords
      .filter((w) => /[A-Za-z]/.test(w))
      .map(normalizeRoot)
      .filter((r) => r.length >= 3);
    if (
      (roots.length === 1 && titleOnlyRoots.has(roots[0])) ||
      (latinRoots.length === 1 && titleOnlyRoots.has(latinRoots[0]))
    ) {
      return;
    }

    const alreadyUsed = roots.some((r) => {
      if (usedRoots.has(r)) return true;
      for (const existing of usedRoots) {
        if (r.length >= 4 && existing.length >= 4 && (existing.startsWith(r) || r.startsWith(existing))) {
          return true;
        }
      }
      return false;
    });
    if (alreadyUsed) return;

    const quotedFrom = words.slice(0, 2).join(' ');
    const reasonMap: Record<typeof kind, string> = {
      'metric-noun': `Quoted "${quotedFrom}" directly from source metric claim.`,
      compound: `Quoted "${quotedFrom}" verbatim from source narrative.`,
      'proper-noun': `Quoted "${quotedFrom}" directly from named entity/component in source.`,
      'source-term': `Quoted "${quotedFrom}" directly from key concept in source.`,
    };

    candidates.push({
      label,
      quotedFrom,
      reason: reasonMap[kind],
    });
    roots.forEach((r) => usedRoots.add(r));
  };

  // A. Quoted strings inside source (e.g. "lease tokens", "Friday deploys")
  for (const m of cleanSource.matchAll(/["'«»]([^"'«»]{3,24})["'«»]/g)) {
    tryRegister(m[1], 'compound');
  }

  // B. Number + real noun phrases verbatim in source (e.g. "177 nodes", "99% uptime")
  for (const m of cleanSource.matchAll(
    /(?:\$\d[\d,.]*[KMBTkmbt]?|\b\d+(?:\.\d+)?\s*(?:%|x|ms|s|GB|TB|MB|KB|k)?)\s+([A-Za-z][A-Za-z-]{2,18})/gi
  )) {
    const nounWord = (m[1] || '').toLowerCase();
    if (!STOP_WORDS.has(nounWord) && !/^(?:down|up|over|under|than|per)$/i.test(nounWord)) {
      tryRegister(m[0], 'metric-noun');
    }
  }

  // C. Hyphenated technical compounds & proper/CamelCase nouns (skip generic sentence-initial words)
  for (const m of cleanSource.matchAll(/\b([A-Za-z][a-z0-9]+-[A-Za-z][A-Za-z0-9-]+)\b/g)) {
    tryRegister(m[1], 'compound');
  }
  const sentenceInitialStarts = new Set<number>([0]);
  for (const sm of cleanSource.matchAll(/[.!?]\s+/g)) {
    if (sm.index !== undefined) sentenceInitialStarts.add(sm.index + sm[0].length);
  }
  for (const m of cleanSource.matchAll(/\b([A-Z][a-zA-Z0-9+]+(?:\s+[A-Z][a-zA-Z0-9+]+)?)\b/g)) {
    const pos = m.index ?? 0;
    const raw = m[1];
    const isAllCapsOrCamel = /[A-Z]{2,}|[a-z][A-Z]/.test(raw);
    if (sentenceInitialStarts.has(pos) && !isAllCapsOrCamel && !/\s/.test(raw)) {
      continue;
    }
    tryRegister(raw, 'proper-noun');
  }

  // D. Meaningful adjacent noun-like pairs or standalone nouns in source order (same script only)
  const rawTokens = cleanSource
    .replace(/[.?!,:;]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 3 &&
        !/^\d+$/.test(w) &&
        !STOP_WORDS.has(w.toLowerCase()) &&
        !HUB_FILLER_TOKENS.has(w.toLowerCase())
    );

  for (let i = 0; i < rawTokens.length - 1; i++) {
    const a = rawTokens[i];
    const b = rawTokens[i + 1];
    const bothLatin = /^[A-Za-z0-9-]+$/.test(a) && /^[A-Za-z0-9-]+$/.test(b);
    const bothArabic = /^[\u0600-\u06FF-]+$/.test(a) && /^[\u0600-\u06FF-]+$/.test(b);
    if ((bothLatin || bothArabic) && a.length + b.length + 1 <= 18) {
      tryRegister(`${a} ${b}`, 'source-term');
    }
    if (candidates.length >= targetCount) break;
  }

  for (const tok of rawTokens) {
    if (candidates.length >= targetCount) break;
    tryRegister(tok, 'source-term');
  }

  // E. If still fewer than targetCount, supplement from key phrases or crisp topic stages (never Arabic shards)
  if (candidates.length < targetCount) {
    const fallbackPhrases = extractKeyPhrasesFromSlide({
      type: 'hub',
      enTitle: '',
      enBody: cleanSource,
    });
    for (const p of fallbackPhrases) {
      if (candidates.length >= targetCount) break;
      tryRegister(p, 'source-term');
    }
  }

  if (candidates.length < targetCount && hasLatinScript) {
    const lowerAll = `${cleanSource} ${options?.titleText || ''} ${options?.category || ''}`.toLowerCase();
    const domainNodes = /\b(?:agent|copilot|developer|coding|llm|model|ai|prompt|autonomous)\b/.test(lowerAll)
      ? ['TOOL CALLS', 'SANDBOX', 'DIFF AUDIT', 'TEST SUITE', 'CI GATE', 'CONTEXT']
      : /\b(?:security|auth|cve|sandbox|permission|zero[- ]?trust|token)\b/.test(lowerAll)
      ? ['AUTH GATE', 'SANDBOX', 'POLICY', 'AUDIT LOG', 'SECRET', 'VERIFY']
      : /\b(?:sql|postgres|redis|database|cache|replica|storage|wal)\b/.test(lowerAll)
      ? ['READ POOL', 'WAL LOG', 'INDEX SCAN', 'CACHE TIER', 'SHARD', 'REPLICA']
      : /\b(?:valuation|capital|revenue|market|debt|billion|financial|investor)\b/.test(lowerAll)
      ? ['CAPEX', 'UNIT COST', 'CASHFLOW', 'GRID LOAD', 'RISK', 'MARGIN']
      : ['INGEST', 'ROUTER', 'WORKER', 'STORAGE', 'POLICY', 'TELEMETRY'];

    for (const dn of domainNodes) {
      if (candidates.length >= targetCount) break;
      tryRegister(dn, 'source-term');
    }
  }

  const finalNodes = candidates.slice(0, targetCount);
  return {
    satLabels: finalNodes.map((n) => n.label),
    hubNodeReasons: finalNodes,
  };
}
