import type { CarouselData, DiagramNode, DiagramVariant, HookClaimCard, HubNodeReason, SlideData, SlideType, SubjectPairConfig } from '../../types.ts';
import { TECH_ICONS_LIST } from '../techLogos.ts';
import { getBundledIconMeta, isPlaceholderOrEmptyBrandValue, resolveRealTechSystem } from '../bundledTechSvgs.ts';
import { CHAR_LIMITS, SINGLE_SLIDE_CHAR_LIMITS } from '../qaChecks.ts';
import { autoFitTextToLimits, autoPolishHeadline } from '../text/headlines.ts';
import { fixArabicPunctuation } from '../text/arabicBiDi.ts';
import { repairAndDeRepeatSlideHeadlines } from '../text/sanitizer.ts';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'are', 'was', 'were',
  'have', 'has', 'had', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must',
  'how', 'why', 'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'than', 'then',
  'them', 'they', 'their', 'there', 'here', 'more', 'most', 'some', 'such', 'only', 'over',
  'under', 'between', 'through', 'during', 'before', 'after', 'above', 'below', 'about',
  'against', 'within', 'without', 'along', 'across', 'behind', 'beyond', 'plus', 'except',
  'but', 'not', 'also', 'very', 'just', 'even', 'still', 'already', 'always', 'never',
  'often', 'sometimes', 'usually', 'every', 'each', 'both', 'either', 'neither', 'other',
  'another', 'many', 'much', 'few', 'little', 'all', 'any', 'some', 'none', 'one', 'two',
  'three', 'four', 'five', 'first', 'second', 'third', 'new', 'old', 'high', 'low', 'large',
  'small', 'long', 'short', 'good', 'bad', 'best', 'worst', 'same', 'different', 'able',
  'make', 'makes', 'made', 'using', 'used', 'uses', 'use', 'allow', 'allows', 'allowed',
  'create', 'creates', 'creating', 'become', 'becoming', 'becomes', 'while', 'where',
  // Generic meta/filler words that should never become Hub satellite labels
  'tech', 'humor', 'opinion', 'article', 'story', 'system', 'systems', 'engineering', 'software',
  'technical', 'breakdown', 'mechanisms', 'mechanism', 'operational', 'boundaries', 'boundary',
  'telemetry', 'stat', 'stats', 'metric', 'metrics', 'exposure', 'architecture', 'architectural',
  'stores', 'storing', 'stored', 'runaway', 'stop', 'stops', 'stopping', 'core', 'overview',
  'exploring', 'understanding', 'defining', 'managing', 'connecting', 'explains', 'explained',
  'deep', 'dive', 'guide', 'analysis', 'summary', 'modern', 'traditional', 'legacy',
  // Prepositions, adverbs, verbs & quantifiers that must not be selected as standalone/partial Hub node labels
  'onto', 'inside', 'outside', 'instead', 'rather', 'despite', 'whether', 'because', 'since',
  'until', 'unless', 'fourteen', 'months', 'years', 'days', 'hours', 'minutes',
  'migrated', 'reducing', 'cutting', 'removing', 'automating', 'parsing', 'complete', 'completes',
  'runs', 'running', 'lets', 'let', 'spend', 'spends', 'spent', 'serve', 'serves', 'serving',
  'shipped', 'shipping', 'parses', 'even', 'before', 'after', 'down', 'up', 'trillions', 'millions',
]);

const GENERIC_PLACEHOLDER_LABELS = new Set([
  'client ingress',
  'control plane',
  'target service',
  'service pod',
  'vcs engine',
  'port 443',
  'policy engine',
  'encrypted pipe',
  'sys_exec.sh',
  'legacy stack',
  'modern engine',
  'system ingress',
  'durable state',
  'execution core',
  'event inbound',
  'target state',
  'standard simplicity',
  'custom architecture',
  'maintenance cost',
  'input stage',
  'core logic',
]);

export function isGenericPlaceholderValue(val?: string): boolean {
  if (!val || !val.trim()) return true;
  const clean = val.trim().toLowerCase();
  if (GENERIC_PLACEHOLDER_LABELS.has(clean)) return true;
  if (/^component\s*0?\d+$/i.test(clean) || /^stage\s*0?\d+$/i.test(clean)) return true;
  return false;
}

import { THIRD_PARTY_COMPANY_NAMES } from '../techLogos.ts';

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
    const terms = [brand.name.toLowerCase(), brand.title.toLowerCase(), ...(brand.aliases || []).map((a) => a.toLowerCase())];
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
    { rx: /\$|\b(?:valuation|capital|revenue|spend|spent|cash[- ]?out|financing|billion|trillion|money|price|cost|fund|funding|invest)\b|مليار|تريليون|تمويل|تقييم|دولار|عوائد|إنفاق/i, icon: 'dollarSign' },
    { rx: /\b(?:bank|government|gov|taxpayer|treasury|subsid|backstop|fed|policy|state\s+stake|public\s+fund|wall\s+street)\b|حكومة|ضرائب|دعم|خزانة|مصرف|بنك/i, icon: 'landmark' },
    { rx: /\b(?:loss|losses|deficit|burn|debt|crash|drop|bubble|default|insolven)\b|خسائر|عجز|ديون|انهيار|فقاعة/i, icon: 'trendingDown' },
    { rx: /\b(?:nuclear|gigawatt|gw\b|power\s+plant|grid|energy|electricity|factory|industrial|megawatt)\b|طاقة|كهرباء|نووي|محطة|مفاعل|جيجاوات/i, icon: 'factory' },
    { rx: /\b(?:circular|loop|round[- ]?trip|recycle|self[- ]?reinforc)\b|دائري|حلقة|تدوير/i, icon: 'lifecycle' },
    { rx: /\b(?:retiree|pension|401k|s&p|index\s+fund|household|consumer|worker|employee)\b|متقاعد|معاش|مستهلك|موظف|صناديق/i, icon: 'users' },
    { rx: /\b(?:trade[- ]?off|risk|exposure|gamble|bet|leverage|balance)\b|مخاطر|مفاضلة|رهان|تعرض/i, icon: 'scales' },
    { rx: /security|breach|hack|threat|attack|vulnerability|zero[- ]?trust|firewall|guard|exploit|اختراق|أمن|تهديد|حماية/i, icon: 'shieldAlert' },
    { rx: /auth|encrypt|tls|mtls|crypto|permission|secret|token|password|lock|تشفير|صلاحيات/i, icon: 'lock' },
    { rx: /key|certificate|jwt|oauth|identity|signing|مفتاح|هوية/i, icon: 'key' },
    { rx: /\bai\b|agent|llm|model|neural|inference|prompt|autonomous|ذكاء اصطناعي|وكيل|نموذج/i, icon: 'robot' },
    { rx: /vector|embedding|database|sql|table|index|query|storage|store|cache|قاعدة بيانات|تخزين|فهرس/i, icon: 'database' },
    { rx: /cpu|compute|thread|core|kernel|process|engine|execution|chip|gpu|معالج|نواة|تشغيل|رقائق/i, icon: 'cpu' },
    { rx: /fast|latency|speed|throughput|performance|sub-ms|instant|p99|سرعة|أداء|استجابة/i, icon: 'zap' },
    { rx: /metric|benchmark|telemetry|monitor|observability|rate|score|قياس|مؤشر/i, icon: 'gauge' },
    { rx: /network|mesh|routing|ingress|proxy|gateway|load balanc|cluster|شبكة|توجيه/i, icon: 'network' },
    { rx: /cloud|serverless|region|cdn|distributed|سحابة|موزع/i, icon: 'cloud' },
    { rx: /code|compile|function|script|api|sdk|json|schema|كود|برمجة/i, icon: 'code' },
    { rx: /cli|terminal|shell|bash|command|deploy|طرفية|أوامر/i, icon: 'terminal' },
    { rx: /search|find|scan|lookup|filter|retrieval|بحث|استرجاع/i, icon: 'search' },
    { rx: /layer|stack|tier|hierarchy|pipeline|stage|طبقة|مراحل/i, icon: 'layers' },
    { rx: /git|branch|merge|commit|version|workflow|دمج|نسخة/i, icon: 'gitMerge' },
    { rx: /container|pod|sandbox|isolation|vm|حاوية|عزل/i, icon: 'box' },
    { rx: /disk|wal|log|snapshot|backup|volume|قرص|سجل/i, icon: 'hardDrive' },
    { rx: /user|client|team|organization|access|مستخدم|فريق/i, icon: 'users' },
    { rx: /server|host|node|instance|backend|خادم|عقدة/i, icon: 'server' },
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

const HUB_FILLER_TOKENS = new Set([
  'tech', 'humor', 'comedy', 'meme', 'opinion', 'satire', 'joke', 'rant',
  'telemetry', 'stat', 'stats', 'metric', 'metrics', 'exposure', 'boundaries',
  'verification', 'observability', 'ingress', 'egress', 'engine', 'architecture',
  'core', 'system', 'systems', 'target', 'state', 'node', 'stage', 'layer',
  'الذي', 'التي', 'كيف', 'لماذا', 'فعليا', 'فعلياً', 'ماذا', 'الأنظمة', 'المعمارية',
]);

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

    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 3) return;
    if (words.some((w) => STOP_WORDS.has(w.toLowerCase()))) return;
    if (words.every((w) => HUB_FILLER_TOKENS.has(w.toLowerCase()))) return;
    if (words.some((w) => /^https?$/i.test(w))) return;
    // Do not accept leading/trailing verb forms (-ing/-ed) unless part of a known technical acronym or hyphenated term
    if (
      kind !== 'compound' &&
      kind !== 'metric-noun' &&
      words.some((w) => w.length > 6 && /(?:ing|ated|izes|ized)$/i.test(w) && !/routing|caching|sharding|indexing|pooling|tracing|logging|queuing|streaming/i.test(w))
    ) {
      return;
    }

    const labelWords = words.slice(0, 2);
    const label = labelWords
      .join(' ')
      .toUpperCase()
      .slice(0, 18)
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

  // E. If still fewer than targetCount and title tokens exist cleanly, allow 2-word title noun compounds (never raw single title echo)
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

  const finalNodes = candidates.slice(0, targetCount);
  return {
    satLabels: finalNodes.map((n) => n.label),
    hubNodeReasons: finalNodes,
  };
}

/**
 * Builds a structured Quote-style claim card or Contrast visual for non-numeric Slide 1 hooks.
 */
export function buildNonNumericHookClaimCard(
  sourceText: string,
  slide?: Partial<SlideData>
): HookClaimCard | undefined {
  const text = `${sourceText || ''} ${slide?.enTitle || ''} ${slide?.enBody || ''}`
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;

  // 1. Detect explicit Contrast ("X instead of Y", "X rather than Y", "X vs Y", "not X — Y")
  const insteadMatch = text.match(
    /([^.!?\n]{4,56}?)\s+(?:instead\s+of|rather\s+than)\s+(?:over\s+)?([^.!?\n]{4,44})/i
  );
  if (insteadMatch) {
    const stripFillers = (s: string, keepTail: boolean) => {
      const cleaned = s
        .replace(/^(?:the\s+same|your|an?|over|on|into|inside|runs?\s+inside)\s+/i, '')
        .trim()
        .split(/\s+/)
        .filter((w) => !/^(?:as|your|the|a|an|for)$/i.test(w));
      const slice = keepTail ? cleaned.slice(-3) : cleaned.slice(0, 3);
      return slice.join(' ').slice(0, 28).trim();
    };
    const afterClean = stripFillers(insteadMatch[1], true);
    const beforeClean = stripFillers(insteadMatch[2], false);
    if (afterClean.length >= 3 && beforeClean.length >= 3 && afterClean.toLowerCase() !== beforeClean.toLowerCase()) {
      return {
        mode: 'contrast',
        badge: 'THE REAL SHIFT',
        statement: `${afterClean} over ${beforeClean}`.slice(0, 72),
        beforeLabel: beforeClean.toUpperCase(),
        afterLabel: afterClean.toUpperCase(),
        attribution: slide?.enCredit ? slide.enCredit.replace(/^Source:\s*/i, '') : undefined,
      };
    }
  }

  const contrastMatch =
    text.match(/([^.!?\n]{4,48}?)\s+(?:vs\.?|versus)\s+([^.!?\n]{4,48})/i) ||
    text.match(/\bnot\s+([^,;.\n]{3,32})[;,—-]+\s*(?:it'?s|but)?\s*([^.!?\n]{4,42})/i);

  if (contrastMatch) {
    const rawSideA = contrastMatch[1].replace(/^[\s•-]+/, '').trim();
    const rawSideB = contrastMatch[2].replace(/^[\s•-]+/, '').trim();
    const cleanA = rawSideA.split(/\s+/).slice(-3).join(' ').slice(0, 28);
    const cleanB = rawSideB.split(/\s+/).slice(0, 3).join(' ').slice(0, 28);
    if (cleanA.length >= 3 && cleanB.length >= 3 && cleanA.toLowerCase() !== cleanB.toLowerCase()) {
      return {
        mode: 'contrast',
        badge: 'THE REAL SHIFT',
        statement: `${cleanA} vs ${cleanB}`.slice(0, 72),
        beforeLabel: cleanA.toUpperCase(),
        afterLabel: cleanB.toUpperCase(),
        attribution: slide?.enCredit ? slide.enCredit.replace(/^Source:\s*/i, '') : undefined,
      };
    }
  }

  // 2. Quote / Contrarian Claim / Question from source sentences (strictly deduped against slide.enTitle)
  const normalizedTitle = (slide?.enTitle || '').trim().toLowerCase();
  const titleTokens = new Set(normalizedTitle.split(/\s+/).filter((w) => w.length > 2));

  const isDuplicateOfTitle = (candidate: string) => {
    const cleanCand = candidate.trim().toLowerCase();
    if (!cleanCand || !normalizedTitle) return false;
    if (cleanCand === normalizedTitle) return true;
    if (cleanCand.includes(normalizedTitle) || normalizedTitle.includes(cleanCand)) return true;
    const candTokens = cleanCand.split(/\s+/).filter((w) => w.length > 2);
    if (candTokens.length === 0 || titleTokens.size === 0) return false;
    const overlap = candTokens.filter((t) => titleTokens.has(t)).length;
    const overlapRatio = overlap / Math.max(candTokens.length, titleTokens.size);
    return overlapRatio >= 0.65;
  };

  const sentences = (sourceText || slide?.enBody || '')
    .split(/(?<=[.?!؟\n])\s+/)
    .map((s) => s.replace(/^[•*-]\s*/, '').replace(/^["'«»]|["'«»]$/g, '').trim())
    .filter((s) => s.length >= 14 && !isDuplicateOfTitle(s));

  const surprising =
    sentences.find((s) => /[?!؟]/.test(s)) ||
    sentences.find((s) => /\b(never|always|nobody|everyone|worst|best|actually|real|secret|truth|stop|mistake|breaks?|friday|coffee|senior|junior)\b/i.test(s)) ||
    sentences[0];

  if (!surprising) {
    // If no distinct sentence found, do not echo enTitle! Fall back to a distinct contrast statement or observation
    const fallbackObservation = slide?.enBody && !isDuplicateOfTitle(slide.enBody)
      ? slide.enBody.slice(0, 90)
      : 'Measured architectural shift in production workloads.';
    return {
      mode: 'quote',
      badge: 'KEY OBSERVATION',
      statement: fallbackObservation,
      attribution: slide?.enCredit ? slide.enCredit.replace(/^Source:\s*/i, '') : undefined,
    };
  }

  const words = surprising.split(/\s+/).filter(Boolean);
  const compactQuote = (words.length > 14 ? words.slice(0, 14).join(' ') : surprising)
    .replace(/[,:;]+$/, '')
    .trim();

  if (!compactQuote) return undefined;

  return {
    mode: 'quote',
    badge: /\?$/.test(compactQuote) ? 'OPEN QUESTION' : 'KEY CLAIM',
    statement: compactQuote,
    attribution: slide?.enCredit ? slide.enCredit.replace(/^Source:\s*/i, '') : undefined,
  };
}

const NON_OWNER_WORDS = new Set([
  'how', 'why', 'when', 'what', 'where', 'who', 'which', 'we', 'they', 'our', 'their', 'this', 'that',
  'team', 'teams', 'engineers', 'engineering', 'developers', 'company', 'companies', 'startup', 'startups',
  'moving', 'migrating', 'switching', 'replacing', 'porting', 'upgrading', 'transitioning', 'building',
  'scaling', 'running', 'storing', 'serving', 'cutting', 'reducing', 'dropping', 'slashing', 'inside',
  'behind', 'lessons', 'production', 'architecture', 'database', 'storage', 'system', 'systems', 'service',
]);

const KNOWN_STORY_OWNERS = [
  { pattern: /\bdiscord\b/i, name: 'Discord' },
  { pattern: /\buber\b/i, name: 'Uber' },
  { pattern: /\bnetflix\b/i, name: 'Netflix' },
  { pattern: /\bstripe\b/i, name: 'Stripe' },
  { pattern: /\bshopify\b/i, name: 'Shopify' },
  { pattern: /\bairbnb\b/i, name: 'Airbnb' },
  { pattern: /\bgithub\b/i, name: 'GitHub' },
  { pattern: /\bslack\b/i, name: 'Slack' },
  { pattern: /\bcloudflare\b/i, name: 'Cloudflare' },
  { pattern: /\bfigma\b/i, name: 'Figma' },
  { pattern: /\bnotion\b/i, name: 'Notion' },
  { pattern: /\blinear\b/i, name: 'Linear' },
  { pattern: /\bvercel\b/i, name: 'Vercel' },
  { pattern: /\bdatadog\b/i, name: 'Datadog' },
  { pattern: /\bdropbox\b/i, name: 'Dropbox' },
  { pattern: /\blinkedin\b/i, name: 'LinkedIn' },
  { pattern: /\bpinterest\b/i, name: 'Pinterest' },
  { pattern: /\binstacart\b/i, name: 'Instacart' },
  { pattern: /\bcoinbase\b/i, name: 'Coinbase' },
  { pattern: /\bdoorDash\b/i, name: 'DoorDash' },
];

function isChatAndStorageTopic(text: string, owner?: string): boolean {
  const combined = `${owner || ''} ${text}`;
  const hasChatSignal = /\b(?:discord|slack|chat|messages?|messaging|channels?|dm|inbox)\b/i.test(combined);
  const hasStorageSignal =
    /\b(?:cassandra|scylla|scylladb|postgres|postgresql|mysql|mongodb|dynamodb|redis|cockroach|clickhouse|sqlite|database|db|storage|shards?|partitions?|reads?|writes?|queries|trillions?)\b/i.test(
      combined
    );
  return hasChatSignal && hasStorageSignal;
}

function buildVerifiedSubjectPairConfig(
  rawA: string,
  rawB: string,
  cleanText: string,
  rawOwner?: string
): SubjectPairConfig | undefined {
  const sysA = resolveRealTechSystem(rawA);
  const sysB = resolveRealTechSystem(rawB);
  if (!sysA || !sysB) return undefined;
  if (sysA.title.toLowerCase() === sysB.title.toLowerCase()) return undefined;

  let ownerName: string | undefined;
  if (rawOwner) {
    const cleanOwner = rawOwner.trim().replace(/^['"`(\[]+|['"`.,;:!?)\]]+$/g, '');
    if (
      cleanOwner.length >= 2 &&
      !NON_OWNER_WORDS.has(cleanOwner.toLowerCase()) &&
      !isPlaceholderOrEmptyBrandValue(cleanOwner) &&
      cleanOwner.toLowerCase() !== sysA.title.toLowerCase() &&
      cleanOwner.toLowerCase() !== sysB.title.toLowerCase() &&
      cleanOwner.toLowerCase() !== rawA.trim().toLowerCase() &&
      cleanOwner.toLowerCase() !== rawB.trim().toLowerCase()
    ) {
      const ownerSys = resolveRealTechSystem(cleanOwner);
      ownerName = ownerSys ? ownerSys.title : cleanOwner.charAt(0).toUpperCase() + cleanOwner.slice(1);
    }
  }

  if (!ownerName) {
    for (const candidate of KNOWN_STORY_OWNERS) {
      if (
        candidate.pattern.test(cleanText) &&
        candidate.name.toLowerCase() !== sysA.title.toLowerCase() &&
        candidate.name.toLowerCase() !== sysB.title.toLowerCase()
      ) {
        ownerName = candidate.name;
        break;
      }
    }
  }

  const isChatDb = isChatAndStorageTopic(cleanText, ownerName);
  const flowLabel = isChatDb
    ? 'CHAT MESSAGES → COMPACTED SHARDS'
    : `${sysA.title.toUpperCase()} → ${sysB.title.toUpperCase()}`;

  return {
    beforeSystem: sysA.title,
    afterSystem: sysB.title,
    beforeLogoKey: sysA.logoKey,
    afterLogoKey: sysB.logoKey,
    beforeAsText: sysA.asText,
    afterAsText: sysB.asText,
    storyOwner: ownerName,
    storyOwnerMode: ownerName ? 'text' : undefined,
    beforeLabel: 'BEFORE',
    afterLabel: 'AFTER',
    colorMode: 'official',
    logoWidthPct: 11,
    creativeMotif: isChatDb ? 'chat-to-db' : 'stream-flow',
    flowLabel,
  };
}

/**
 * Strictly detects migration, replacement, A vs B, or before -> after stories ONLY when
 * TWO real, named software/database/infrastructure products can be extracted with confidence.
 * - Never fabricates placeholders ("System A", "System B", "PIPELINE MIGRATION", "DATASTREAM MIGRATION").
 * - Never triggers on robotics, hardware, ML training-to-inference, or single-system explainers.
 * - Allocates 3-brand stories with the story owner as styled text and the 2 systems in the BEFORE/AFTER slots.
 */
export function detectSubjectPairFromText(
  fullText: string,
  slide?: SlideData
): SubjectPairConfig | undefined {
  if (slide?.subjectPair) {
    const sp = slide.subjectPair;
    if (
      !isPlaceholderOrEmptyBrandValue(sp.beforeSystem) &&
      !isPlaceholderOrEmptyBrandValue(sp.afterSystem) &&
      sp.beforeSystem.trim().toLowerCase() !== sp.afterSystem.trim().toLowerCase()
    ) {
      const sysA = resolveRealTechSystem(sp.beforeSystem);
      const sysB = resolveRealTechSystem(sp.afterSystem);
      if (sysA && sysB) {
        const cleanFlow =
          sp.flowLabel && !isPlaceholderOrEmptyBrandValue(sp.flowLabel)
            ? sp.flowLabel
            : isChatAndStorageTopic(`${fullText} ${sp.beforeSystem} ${sp.afterSystem}`, sp.storyOwner)
            ? 'CHAT MESSAGES → COMPACTED SHARDS'
            : `${sysA.title.toUpperCase()} → ${sysB.title.toUpperCase()}`;
        return {
          ...sp,
          beforeSystem: sp.beforeSystem.trim(),
          afterSystem: sp.afterSystem.trim(),
          beforeLogoKey: sp.beforeLogoKey ?? sysA.logoKey,
          afterLogoKey: sp.afterLogoKey ?? sysB.logoKey,
          storyOwner:
            sp.storyOwner && !isPlaceholderOrEmptyBrandValue(sp.storyOwner)
              ? sp.storyOwner.trim()
              : undefined,
          flowLabel: cleanFlow,
          creativeMotif: isChatAndStorageTopic(
            `${fullText} ${sp.beforeSystem} ${sp.afterSystem}`,
            sp.storyOwner
          )
            ? sp.creativeMotif || 'chat-to-db'
            : 'stream-flow',
        };
      }
    }
  }

  if (!fullText) return undefined;
  const clean = fullText.replace(/\n+/g, ' ');

  // 1. Check 3-brand pattern: "<Company> migrated/moved/switched/replaced from <SysA> to/with <SysB>"
  const threeBrandRegex =
    /\b([A-Za-z0-9._-]+)\s+(?:has\s+|have\s+)?(?:migrated|migrating|switched|switching|moving|moved|replaced|replacing|transitioned|ported|ditched)\s+(?:from\s+)?(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)\s+(?:to|with|for|into)\s+(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)/gi;
  for (const m of clean.matchAll(threeBrandRegex)) {
    const built = buildVerifiedSubjectPairConfig(m[2], m[3], clean, m[1]);
    if (built) return built;
  }

  // 2. Check explicit migration/replacement: "migrated/moved/switched from <SysA> to <SysB>" or "replaced/ditched <SysA> with/for <SysB>"
  const migrationRegex =
    /\b(?:migrated|migrating|migration|switched|switching|switch|moved|moving|move|transitioned|transitioning|ported|porting|upgraded|upgrading)\s+from\s+(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)\s+(?:to|into)\s+(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)/gi;
  for (const m of clean.matchAll(migrationRegex)) {
    const built = buildVerifiedSubjectPairConfig(m[1], m[2], clean);
    if (built) return built;
  }

  const replacedRegex =
    /\b(?:replaced|replacing|replace|ditched|ditching|ditch|swapped|swapping)\s+(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)\s+(?:with|for|to)\s+(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)/gi;
  for (const m of clean.matchAll(replacedRegex)) {
    const built = buildVerifiedSubjectPairConfig(m[1], m[2], clean);
    if (built) return built;
  }

  // 3. Check explicit arrow or head-to-head comparison between two real named systems: "<SysA> -> <SysB>" or "<SysA> vs <SysB>"
  const arrowOrVsRegex =
    /\b(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)\s*(?:->|→|\bvs\.?\b|\bversus\b|\bcompared\s+to\b)\s*(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)/gi;
  for (const m of clean.matchAll(arrowOrVsRegex)) {
    const built = buildVerifiedSubjectPairConfig(m[1], m[2], clean);
    if (built) return built;
  }

  return undefined;
}

/**
 * Heuristic analysis of a slide's headline and body copy to assign the most appropriate
 * content archetype among Metric, Compare, Code, Row, Number, or Subject Pair.
 */
export function analyzeSlideTextForArchetype(
  slide: SlideData,
  slideIndex: number = 0
): 'metric' | 'compare' | 'code' | 'row' | 'number' | 'subjectPair' {
  const title = (slide.enTitle || '').trim();
  const body = (slide.enBody || '').trim();
  const arTitle = (slide.arTitle || '').trim();
  const arBody = (slide.arBody || '').trim();
  const arText = `${arTitle} ${arBody}`;
  const fullText = `${title} ${body} ${arText}`;

  const pair = detectSubjectPairFromText(fullText, slide);
  if (pair && slideIndex === 0) {
    return 'subjectPair';
  }

  let scores: Record<'metric' | 'compare' | 'code' | 'row' | 'number' | 'subjectPair', number> = {
    code: 0,
    compare: 0,
    metric: 0,
    number: 0,
    row: 1, // baseline fallback
    subjectPair: pair ? 8 : 0,
  };

  if (pair && /\b(?:migrat(?:ed|ing|ion)|switched|switching|moving|moved|replaced|transition|vs\.?)\b/i.test(fullText)) {
    scores.subjectPair += 6;
  }

  // 1. Code Diff / Query / CLI / Config detection
  if (
    /\b(?:SELECT\s+.+\s+FROM|EXPLAIN\s+ANALYZE|CREATE\s+INDEX|docker\s+run|kubectl\s+apply|async\s+fn|function\s+\w+|const\s+\w+\s*=|let\s+\w+\s*=|import\s+.+\s+from|curl\s+-X|git\s+commit|npm\s+run|cargo\s+build)\b/i.test(
      fullText
    )
  ) {
    scores.code += 6;
  }
  if (
    /\b(?:\w+\.(?:yaml|yml|json|sql|ts|tsx|rs|py|go|sh|toml)|code\s+diff|code\s+snippet|sql\s+query|cli\s+command|config\s+file|terminal\s+command)\b/i.test(
      fullText
    ) ||
    /كود\s+برمجي|مقتطف\s+كود|سطر\s+الأوامر|استعلام\s+SQL|ملف\s+إعدادات/i.test(arText)
  ) {
    scores.code += 4;
  }
  if (slide.codeSnippet && slide.codeSnippet.trim().length > 10 && !isGenericPlaceholderValue(slide.codeFileName)) {
    scores.code += 3;
  }

  // 2. Compare (Before vs After / Trade-off between two approaches)
  if (
    /\b(?:vs\.?|versus|compared\s+to|instead\s+of|rather\s+than|before\s+and\s+after|before\s+vs|legacy\s+vs|monolith\s+vs|traditional\s+vs|trade-?off\s+between|difference\s+between|pros\s+and\s+cons)\b/i.test(
      fullText
    ) ||
    /مقارنة\s+بين|مقابل|بدلاً\s+من|قبل\s+وبعد|الفرق\s+بين/.test(arText)
  ) {
    scores.compare += 6;
  }
  if (/\b(?:vs\.?|versus)\b/i.test(title) || /مقابل/.test(arTitle)) {
    scores.compare += 3;
  }

  // 3. Numbered Step / Principle / Phase / Stage detection
  if (
    /^(?:step|stage|phase|rule|principle|layer|pillar|#?\d+[.):\s-]|first\s+principle|second\s+stage|third\s+stage|first\s+step|second\s+step|third\s+step)/i.test(
      title
    ) ||
    /^(?:الخطوة|المرحلة|المبدأ|القاعدة|أولاً|ثانياً|ثالثاً|رابعاً|خامساً)/.test(arTitle)
  ) {
    scores.number += 5;
  }
  if (/\b(?:step|stage|phase|rule|principle)\s+#?\d{1,2}\b/i.test(fullText)) {
    scores.number += 3;
  }

  // 4. Metric / Benchmark / Financial or Latency Impact detection
  if (
    /(?:\$\s*\d+(?:[.,]\d+)?\s*(?:T|B|M|K|trillion|billion|million)?|\b\d+(?:[.,]\d+)?\s*(?:x|%|ms|μs|ns|gw|gigawatts?|gb\/s|mb\/s|rps|req\/s|tb|gb|trillion|billion|million|تريليون|مليار|مليارات|مليون|أضعاف|بالمئة))(?:\b|$)/i.test(
      fullText
    )
  ) {
    scores.metric += 5;
  }
  if (
    /(?:\$\s*\d+|\b\d+(?:[.,]\d+)?\s*(?:x|%|ms|μs|ns|T|B|M|K|GW)\b)/i.test(title) ||
    /\b(?:benchmark|p99|p95|throughput|latency\s+drop|cost\s+reduction|cut\s+spend|valuation|loss|deficit|cash[- ]?out)\b/i.test(fullText)
  ) {
    scores.metric += 2;
  }

  // 5. Row (Mechanism / Architecture / Robotics / ML / Explainer Schematic) signals
  if (
    /\b(?:how\s+.+\s+works|architecture|pipeline|topology|workflow|mechanism|diagram|cluster|isolation|routing|traversal|layer|stack|mesh|robot(?:ic|ics|s)?|pick[- ]and[- ]place|gripper|actuator|sensor|kinematics|conveyor|wrist|camera|simulation|hardware|firmware|attention|transformer|diffusion|neural|verifier|bytecode|ebpf|kernel|consensus|quorum)\b/i.test(
      fullText
    ) ||
    /آلية|معمارية|شبكة|طبقات|مسار|عزل|روبوت/.test(arText)
  ) {
    scores.row += 4;
  }

  // Pick the highest-scoring archetype (tie-breaking order: subjectPair > code > compare > metric > number > row)
  const candidates: Array<'subjectPair' | 'code' | 'compare' | 'metric' | 'number' | 'row'> = [
    'subjectPair',
    'code',
    'compare',
    'metric',
    'number',
    'row',
  ];
  let best: 'subjectPair' | 'code' | 'compare' | 'metric' | 'number' | 'row' = 'row';
  let bestScore = scores.row;

  for (const candidate of candidates) {
    if (scores[candidate] > bestScore) {
      best = candidate;
      bestScore = scores[candidate];
    }
  }

  return best;
}

/**
 * Infers the best-fit SlideType archetype from a slide's headline and body content.
 */
export function inferBestSlideArchetype(
  slide: SlideData,
  slideIndex: number = 1,
  totalSlides: number = 8
): SlideType {
  if (slide.type === 'poster') return 'poster';
  if (slide.imageUrl && slide.imageUrl.trim().length > 0 && slide.type === 'image') return 'image';

  return analyzeSlideTextForArchetype(slide, slideIndex);
}

/**
 * Infers the best-fit DiagramVariant among all 9 schematic engines based on slide semantics.
 */
export function inferBestDiagramVariant(slide: SlideData): DiagramVariant {
  const text = `${slide.enTitle || ''} ${slide.enBody || ''} ${slide.arTitle || ''} ${slide.arBody || ''}`.toLowerCase();

  if (/hnsw|skip[- ]?list|graph|hierarchy|traversal|hops\b|mesh|routing|رسم بياني|شبكة/.test(text)) {
    return 'graph';
  }
  if (/ivf|cluster|k-means|centroid|partition|shard|quorum|region|bucket|تجميع|تقسيم/.test(text)) {
    return 'clusters';
  }
  if (/write|hot\s*\/?\s*cold|hot\s+ram|cold\s+nvme|buffer|lsm|compaction|cache\s+vs|ram\s+vs|dual\s+store|sync|replication|ذاكرة|تخزين/.test(text)) {
    return 'split';
  }
  if (
    /security|breach|hack|threat|isolation|isolate|blast\s+radius|firewall|sandbox|boundary|guard|permission|scope\s+creep|zero[- ]?trust|auth|اختراق|أمن|عزل|صلاحيات|مخاطر/.test(
      text
    )
  ) {
    return 'isolation';
  }
  if (/vector|embedding|semantic|cosine|similarity|high-dim|nearest neighbor|ann\b|متجهات|تضمين/.test(text)) {
    return 'scatter';
  }
  if (/stack|layer|tier|kernel|runtime|abstraction|middleware|protocol|طبقات|معمارية/.test(text)) {
    return 'stack';
  }
  if (/takeaway|rule|principle|lesson|trade-?off|catch|bottleneck|verdict|summary|خلاصة|قاعدة|مبدأ/.test(text)) {
    return 'takeaway';
  }
  if (/feature|pillar|capability|benefit|dimension|aspect|three|3\s+|مزايا|خصائص|عناصر/.test(text)) {
    return 'features';
  }
  return 'topology';
}

export interface SmartSlideVisualDefaults {
  recommendedArchetype: SlideType;
  recommendedVariant: DiagramVariant;
  // Hub
  centerIcon: string;
  centerTag: string;
  satLabels: string[];
  hubNodeReasons: HubNodeReason[];
  satIcons: string[];
  // Row / Poster Schematic
  diagramVariant: DiagramVariant;
  diagramNodes: DiagramNode[];
  diagramEdges: [string, string];
  diagramFooter: string;
  // Number
  stepNumber: string;
  stepLabel: string;
  numberIcon: string;
  // Metric
  metricBeforeValue?: string;
  metricValue: string;
  metricLabel: string;
  metricDiff: string;
  metricIcon: string;
  hookClaimCard?: HookClaimCard;
  chartDirection: 'up' | 'down' | 'bar' | 'none';
  // Code
  codeFileName: string;
  codeLanguage: string;
  codeSnippet: string;
  // Compare
  compareLeftTitle: string;
  compareLeftBody: string;
  compareRightTitle: string;
  compareRightBody: string;
  // Subject Pair
  subjectPair?: SubjectPairConfig;
}

/**
 * Derives a semantic slide corner tag matching the slide's story role and content type
 * (BENCHMARK, ARCHITECTURE, COST, COMPARISON, BOTTLENECK, TAKEAWAY, ACTION).
 */
export function deriveSlideCornerTag(
  slide: SlideData,
  slideIndex: number = 0,
  totalSlides: number = 6
): string {
  const fullText = `${slide.enTitle || ''} ${slide.enBody || ''} ${slide.arTitle || ''} ${slide.arBody || ''}`;
  if (slide.type === 'cta' || (totalSlides > 1 && slideIndex === totalSlides - 1) || slide.storyRole === 'cta') {
    return 'ACTION';
  }
  if (slide.storyRole === 'takeaway' || slide.diagramVariant === 'takeaway') {
    return 'TAKEAWAY';
  }
  if (/\b(?:cost|costs|spend|spending|price|pricing|billing|budget|cap|caps|saving|savings|deficit|burn)\b|\$\d|تكلفة|تكاليف|إنفاق/i.test(fullText)) {
    return 'COST';
  }
  if (slide.type === 'metric' || slide.storyRole === 'proof') {
    return 'BENCHMARK';
  }
  if (slide.type === 'compare') {
    return 'COMPARISON';
  }
  if (slide.storyRole === 'problem') {
    return 'BOTTLENECK';
  }
  if (slideIndex === 0 || slide.storyRole === 'hook') {
    return /\d/.test(fullText) ? 'BENCHMARK' : 'ARCHITECTURE';
  }
  return 'ARCHITECTURE';
}

/**
 * Translates technical jargon on Slide 1 Hook into plain business outcomes for startup & SME owners
 * while enforcing max 12 words per headline and hiding Slide 1 body text.
 */
export function translateSlide1JargonToPlainOutcome(text: string): string {
  if (!text) return text;
  return text
    .replace(/\bp99\s+(?:tail\s+|read\s+|write\s+)?latency\b/gi, 'response delay')
    .replace(/\btail\s+latency\b/gi, 'response delay')
    .replace(/\bread\s+latency\b/gi, 'read delay')
    .replace(/\blatency\b/gi, 'response delay')
    .replace(/\bp99\b/gi, 'peak delay')
    .replace(/\bthroughput\b/gi, 'system capacity')
    .replace(/\bshard[- ]per[- ]core\b/gi, 'per-core data split')
    .replace(/\bsharding\b/gi, 'data splitting')
    .replace(/\bgarbage\s+collection\s+pauses?\b/gi, 'memory freezes')
    .replace(/\bgc\s+pauses?\b/gi, 'memory freezes');
}

function capHeadlineToTwelveWords(headline: string, isArabic: boolean = false): string {
  const cleaned = headline.replace(/(?:\.\.\.|…)+$/g, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  const kept = words.slice(0, 12);
  while (
    !isArabic &&
    kept.length > 4 &&
    /^(?:from|to|with|of|for|in|on|by|at|and|or|the|a|an|that|as|into|than|via)$/i.test(
      kept[kept.length - 1].replace(/[^a-zA-Z]/g, '')
    )
  ) {
    kept.pop();
  }
  const sliced = kept.join(' ').replace(/[,:;—–-]+$/, '');
  if (words.length <= 12 && kept.length === words.length) return cleaned;
  if (isArabic) return fixArabicPunctuation(sliced);
  return /[.?!]$/.test(sliced) ? sliced : `${sliced}.`;
}

/**
 * Computes complete, content-aware visual layout defaults from a slide's headline and body copy.
 * Used by both the 1080x1920 Canvas Renderers and the Visual Layout Inspector UI for 1:1 parity.
 */
export function resolveSmartSlideVisuals(
  slide: SlideData,
  slideIndex: number = 0,
  forceRefresh: boolean = false
): SmartSlideVisualDefaults {
  const fullText = `${slide.enTitle || ''} ${slide.enBody || ''} ${slide.arTitle || ''} ${slide.arBody || ''}`;
  const lower = fullText.toLowerCase();
  const matchedIcons = matchSlideIconsFromText(fullText);
  const nonBrandIcons = matchedIcons.filter((ic) => !THIRD_PARTY_COMPANY_NAMES.has(ic.toLowerCase()));
  const phrases = extractKeyPhrasesFromSlide(slide);

  const recommendedArchetype = inferBestSlideArchetype(slide, slideIndex);
  const recommendedVariant = inferBestDiagramVariant(slide);
  const activeVariant: DiagramVariant =
    !forceRefresh && slide.diagramVariant ? slide.diagramVariant : recommendedVariant;

  const isFinancialOrMacro =
    /\$|\b(?:valuation|billion|trillion|loss|losses|deficit|capital|financing|circular|subsid|taxpayer|retiree|s&p|pension|401k|revenue|spend|spent|cash[- ]?out|stake|economy|economic|inflation|energy\s+bill|gigawatt|nuclear|market|investor|debt|financial)\b|مليار|تريليون|خسائر|تمويل|تقييم|ضرائب|متقاعد|طاقة|اقتصاد|استثمار/i.test(
      lower
    );

  // 1. HUB DEFAULTS (Never place a third-party brand logo in the center of a diagram)
  const rawCenterIcon =
    !forceRefresh && slide.centerIcon && slide.centerIcon !== 'gitMerge'
      ? slide.centerIcon
      : nonBrandIcons[0] || (isFinancialOrMacro ? 'dollarSign' : 'cpu');
  const centerIcon = THIRD_PARTY_COMPANY_NAMES.has(rawCenterIcon.toLowerCase())
    ? nonBrandIcons[0] || (isFinancialOrMacro ? 'dollarSign' : 'database')
    : rawCenterIcon;

  const derivedCenterTag = (() => {
    const nonBrandPhrase = phrases.find(
      (p) => !THIRD_PARTY_COMPANY_NAMES.has(p.trim().toLowerCase()) && p.length >= 3 && p.length <= 18
    );
    if (nonBrandPhrase) {
      return nonBrandPhrase.toUpperCase();
    }
    if (isFinancialOrMacro) return 'CAPITAL & ECONOMICS';
    if (/security|breach|threat|permission|اختراق|أمن/.test(lower)) return 'SECURITY CORE';
    if (/ai|agent|llm|model|ذكاء/.test(lower)) return 'AI GOVERNANCE';
    if (/vector|embedding|hnsw|search|متجهات/.test(lower)) return 'VECTOR ENGINE';
    if (/database|sql|storage|cache|message|بيانات|رسائل/.test(lower)) return 'STORAGE ENGINE';
    if (/cloud|kubernetes|docker|mesh|worker|سحابة/.test(lower)) return 'CLOUD RUNTIME';
    return 'SYSTEM CORE';
  })();

  const genericCenterTags = new Set([
    'SYSTEM CORE',
    'CLUSTER MESH',
    'DATA ENGINE',
    'AI GOVERNANCE',
    'TECH',
    'TECH HUMOR',
  ]);
  const centerTag =
    !forceRefresh &&
    slide.centerTag &&
    slide.centerTag.trim() &&
    !genericCenterTags.has(slide.centerTag.trim().toUpperCase()) &&
    !THIRD_PARTY_COMPANY_NAMES.has(slide.centerTag.trim().toLowerCase())
      ? slide.centerTag
      : derivedCenterTag;

  const titleAndCategoryEchoSet = new Set(
    `${slide.enTitle || ''} ${slide.category || ''} ${centerTag}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3)
  );

  // Deduplicate any custom satLabels that repeat words or use generic filler or echo title/category
  const cleanCustomSatLabels = (slide.satLabels || []).filter((raw) => {
    if (!raw || isGenericPlaceholderValue(raw)) return false;
    const upper = raw.trim().toUpperCase();
    const lowerLabel = raw.trim().toLowerCase();
    if (STOP_WORDS.has(lowerLabel)) return false;
    if (upper === 'TECH' || upper === 'TECH HUMOR' || upper === 'TELEMETRY STAT' || upper === 'EXPOSURE METRIC') {
      return false;
    }
    const catUpper = (slide.category || '').trim().toUpperCase();
    if (catUpper && upper === catUpper) return false;
    return true;
  });

  const hasOverlappingCustomLabels = (() => {
    const seenRoots = new Set<string>();
    for (const lbl of cleanCustomSatLabels) {
      const tokens = lbl
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 4);
      for (const tok of tokens) {
        const stem = tok.endsWith('s') && tok.length > 5 ? tok.slice(0, -1) : tok;
        if (seenRoots.has(stem)) return true;
        for (const prev of seenRoots) {
          if (prev.startsWith(stem) || stem.startsWith(prev)) return true;
        }
        seenRoots.add(stem);
      }
    }
    return false;
  })();

  const hasCustomSatLabels =
    !forceRefresh &&
    cleanCustomSatLabels.length >= 5 &&
    !hasOverlappingCustomLabels &&
    cleanCustomSatLabels.every((lbl) => {
      const toks = lbl.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
      return !(toks.length === 1 && titleAndCategoryEchoSet.has(toks[0]));
    });

  const extractedHub = extractSourceQuotedHubNodes(fullText, {
    titleText: slide.enTitle,
    category: slide.category || centerTag,
    targetCount: 5,
  });

  const satLabels = hasCustomSatLabels
    ? cleanCustomSatLabels.slice(0, 5)
    : extractedHub.satLabels.slice(0, 5);

  const hubNodeReasons: HubNodeReason[] = satLabels.map((lbl, idx) => {
    const matched = extractedHub.hubNodeReasons.find(
      (r) => r.label.toUpperCase() === lbl.toUpperCase()
    ) || extractedHub.hubNodeReasons[idx];
    return (
      matched || {
        label: lbl,
        quotedFrom: lbl.toLowerCase(),
        reason: `Quoted source concept representing "${lbl.toLowerCase()}" on this slide.`,
      }
    );
  });

  const defaultSatIcons = ['server', 'database', 'gauge', 'users', 'robot', 'gitMerge'];
  const isDefaultSatIcons =
    !slide.satIcons ||
    slide.satIcons.length === 0 ||
    slide.satIcons.every((ic, idx) => ic === defaultSatIcons[idx]);

  const satIcons =
    !forceRefresh && !isDefaultSatIcons && slide.satIcons
      ? slide.satIcons.map((ic, i) =>
          THIRD_PARTY_COMPANY_NAMES.has(ic.toLowerCase())
            ? nonBrandIcons[(i + 1) % nonBrandIcons.length] || 'server'
            : ic
        )
      : Array.from({ length: Math.max(satLabels.length, 5) }, (_, i) => nonBrandIcons[(i + 1) % nonBrandIcons.length] || nonBrandIcons[0] || 'server');

  // 2. MECHANISM (ROW / POSTER) 3-NODE SCHEMATIC DEFAULTS
  const hasCustomNodes =
    !forceRefresh &&
    slide.diagramNodes &&
    slide.diagramNodes.length >= 3 &&
    !isGenericPlaceholderValue(slide.diagramNodes[0]?.label);

  const variantMeta = (() => {
    switch (activeVariant) {
      case 'isolation':
        return {
          statuses: isFinancialOrMacro ? ['EXPOSED', 'BACKSTOP', 'CONTAINED'] : ['SCOPED', 'ISOLATED', 'GUARDED'],
          subs: isFinancialOrMacro
            ? ['Private Capital Loss', 'Public Subsidy Shield', 'Taxpayer Risk Exposure']
            : ['Untrusted Input Boundary', 'Policy Enforcement Gate', 'Protected Core State'],
          edges: (isFinancialOrMacro ? ['SHIFT', 'BACKSTOP'] : ['INSPECT', 'CONTAIN']) as [string, string],
          footer: isFinancialOrMacro
            ? 'RISK EXPOSURE: SYSTEMIC MARKET & TAXPAYER BACKSTOP'
            : 'SECURITY POSTURE: ZERO-TRUST ISOLATION • BLAST RADIUS CONTAINED',
        };
      case 'scatter':
        return {
          statuses: ['ENCODED', 'INDEXED', 'MATCHED'],
          subs: ['Dense Embedding Array', 'High-Dimensional Space', 'Cosine Nearest Top-K'],
          edges: ['EMBED', 'RANK'] as [string, string],
          footer: 'VECTOR SPACE: COSINE SIMILARITY • RECALL OPTIMIZED',
        };
      case 'graph':
        return {
          statuses: ['ENTRY', 'ROUTED', 'CONVERGED'],
          subs: ['Sparse Entry Layer', 'Greedy Skip-Graph Hops', 'Dense Target Neighborhood'],
          edges: ['TRAVERSE', 'CONVERGE'] as [string, string],
          footer: 'GRAPH TOPOLOGY: MULTI-LAYER SKIP TRAVERSAL',
        };
      case 'clusters':
        return {
          statuses: ['PARTITIONED', 'SHORTLISTED', 'SCANNED'],
          subs: ['Centroid Partition Map', 'Active Target Cluster', 'Pruned Candidate Scan'],
          edges: ['PARTITION', 'PROBE'] as [string, string],
          footer: 'CLUSTER INDEX: SPACE PARTITIONING • FAST PRUNING',
        };
      case 'split':
        return {
          statuses: ['FAST WRITE', 'COMPACTING', 'IMMUTABLE'],
          subs: ['In-Memory Hot Buffer', 'Async Background Flusher', 'Durable Cold Storage'],
          edges: ['BUFFER', 'FLUSH'] as [string, string],
          footer: 'DUAL-TIER ARCHITECTURE: HOT MEMORY + COLD INDEX',
        };
      case 'stack':
        return {
          statuses: isFinancialOrMacro ? ['VALUATION', 'COMMITMENTS', 'IMPACT'] : ['INGRESS', 'RUNTIME', 'PERSISTED'],
          subs: isFinancialOrMacro
            ? ['Equity & Debt Financing', 'Infrastructure Capex', 'Consumer & Grid Cost']
            : ['Interface & API Layer', 'Core Execution Tier', 'Storage & State Layer'],
          edges: (isFinancialOrMacro ? ['LEVERAGE', 'PASS-THROUGH'] : ['DISPATCH', 'COMMIT']) as [string, string],
          footer: isFinancialOrMacro
            ? 'ECONOMIC STACK: CAPITAL STRUCTURE & REAL-WORLD IMPACT'
            : 'LAYERED STACK: DETERMINISTIC VERTICAL EXECUTION',
        };
      case 'takeaway':
        return {
          statuses: ['CONSTRAINT', 'MECHANISM', 'OUTCOME'],
          subs: isFinancialOrMacro
            ? ['Unsustainable Unit Burn', 'Circular Capital Structure', 'Systemic Market Risk']
            : ['Architectural Bottleneck', 'Engineered Design Shift', 'Verified Production Gain'],
          edges: ['EVALUATE', 'OUTCOME'] as [string, string],
          footer: isFinancialOrMacro
            ? 'ECONOMIC VERDICT: PRIVATE GAINS VS PUBLIC & RETIREE EXPOSURE'
            : 'ARCHITECTURAL PRINCIPLE: AUDITED & PRODUCTION-VERIFIED',
        };
      case 'features':
        return {
          statuses: ['PILLAR 01', 'PILLAR 02', 'PILLAR 03'],
          subs: ['Primary System Capability', 'Core Operational Guard', 'Verified Scale Guarantee'],
          edges: ['ALIGN', 'VERIFY'] as [string, string],
          footer: 'CORE CAPABILITIES: HIGH-THROUGHPUT & RESILIENT',
        };
      default:
        return isFinancialOrMacro
          ? {
              statuses: ['CAPITAL', 'ALLOCATED', 'BOOKED'],
              subs: ['Capital & Debt Injection', 'Hardware & Grid Capex', 'Circular Revenue Return'],
              edges: ['FINANCE', 'RECYCLE'] as [string, string],
              footer: 'CAPITAL TOPOLOGY: CIRCULAR FINANCING & VALUE FLOW',
            }
          : {
              statuses: ['ACTIVE', 'VERIFIED', 'SECURED'],
              subs: ['Stage 01 Ingress', 'Stage 02 Processing', 'Stage 03 Target State'],
              edges: ['PROCESS', 'COMMIT'] as [string, string],
              footer: 'SYSTEM TOPOLOGY: END-TO-END DETERMINISTIC PIPELINE',
            };
    }
  })();

  const defaultNodeIcons = isFinancialOrMacro
    ? ['dollarSign', 'landmark', 'factory']
    : ['server', 'cpu', 'database'];

  const diagramNodes: DiagramNode[] = (() => {
    const rawNodes = hasCustomNodes
      ? slide.diagramNodes!.slice(0, 3).map((n, i) => ({
          label: n.label || phrases[i] || `Stage 0${i + 1}`,
          sublabel: !isGenericPlaceholderValue(n.sublabel) ? n.sublabel : variantMeta.subs[i],
          status: n.status || variantMeta.statuses[i],
          icon:
            n.icon && !THIRD_PARTY_COMPANY_NAMES.has(n.icon.toLowerCase())
              ? n.icon
              : matchedIcons[i % matchedIcons.length] || defaultNodeIcons[i],
        }))
      : [0, 1, 2].map((i) => ({
          label: phrases[i] || `Component 0${i + 1}`,
          sublabel: variantMeta.subs[i],
          status: variantMeta.statuses[i],
          icon: matchedIcons[i % matchedIcons.length] || defaultNodeIcons[i],
        }));

    // Deduplicate any repeated node labels
    const seenNodeLabels = new Set<string>();
    return rawNodes.map((node, i) => {
      const key = (node.label || '').trim().toUpperCase();
      if (!key || seenNodeLabels.has(key)) {
        const replacement =
          phrases.find((p) => !seenNodeLabels.has(p.trim().toUpperCase())) ||
          `Stage 0${i + 1}`;
        seenNodeLabels.add(replacement.trim().toUpperCase());
        return { ...node, label: replacement };
      }
      seenNodeLabels.add(key);
      return node;
    });
  })();

  const diagramEdges: [string, string] =
    !forceRefresh &&
    slide.diagramEdges &&
    slide.diagramEdges.length >= 2 &&
    slide.diagramEdges[0] &&
    slide.diagramEdges[0] !== 'Mutual Auth'
      ? [slide.diagramEdges[0], slide.diagramEdges[1] || variantMeta.edges[1]]
      : variantMeta.edges;

  const diagramFooter =
    !forceRefresh && slide.diagramFooter && slide.diagramFooter.trim()
      ? slide.diagramFooter
      : variantMeta.footer;

  // 3. NUMBER ARCHETYPE DEFAULTS
  const extractedNumStr = (() => {
    const numMatch = fullText.match(/(?:step|stage|phase|rule|principle|layer|pillar|#)\s*0?(\d{1,2})\b/i) ||
      (slide.enTitle || '').match(/^0?(\d{1,2})[.):\s-]/);
    if (numMatch) return numMatch[1].padStart(2, '0');
    if (/\bfirst\b|أولاً|الأول/i.test(fullText)) return '01';
    if (/\bsecond\b|ثانياً|الثاني/i.test(fullText)) return '02';
    if (/\bthird\b|ثالثاً|الثالث/i.test(fullText)) return '03';
    if (/\bfourth\b|رابعاً|الرابع/i.test(fullText)) return '04';
    if (/\bfifth\b|خامساً|الخامس/i.test(fullText)) return '05';
    return String(slideIndex + 1).padStart(2, '0');
  })();
  const stepNumber = !forceRefresh && slide.stepNumber ? slide.stepNumber : extractedNumStr;
  const domainKicker = phrases[0] ? `STEP ${stepNumber} // ${phrases[0].toUpperCase().slice(0, 16)}` : `STEP ${stepNumber}`;
  const stepLabel =
    !forceRefresh && slide.stepLabel && !/^STEP\s*\d+$/i.test(slide.stepLabel.trim())
      ? slide.stepLabel
      : domainKicker;
  const numberIcon =
    !forceRefresh && (slide.centerIcon || slide.icons?.[0]?.icon)
      ? (slide.centerIcon || slide.icons?.[0]?.icon)!
      : matchedIcons[0] || (isFinancialOrMacro ? 'dollarSign' : 'cpu');

  // 4. METRIC ARCHETYPE DEFAULTS (Rule 1 Hook Engine + Rule 3 Data Integrity)
  const beforeAfterMatch =
    fullText.match(
      /\b(?:from|dropped\s+from|slashed\s+from|reduced\s+from|cut\s+from|shrinking\s+[\w\s]{0,18}from)\s+(\$?\d+(?:[.,]\d+)?\s*(?:x|%|ms|μs|µs|ns|s|GB|MB|KB|TB|PB|B|M|T|K|nodes?|servers?|cores?)?)\s+(?:to|down\s+to|into|->|→)\s+(\$?\d+(?:[.,]\d+)?\s*(?:x|%|ms|μs|µs|ns|s|GB|MB|KB|TB|PB|B|M|T|K|nodes?|servers?|cores?)?)/i
    ) ||
    fullText.match(
      /(\$?\d+(?:[.,]\d+)?\s*(?:ms|μs|µs|ns|s|%|GB|MB|KB|TB|nodes?))\s*(?:->|→|➔)\s*(\$?\d+(?:[.,]\d+)?\s*(?:ms|μs|µs|ns|s|%|GB|MB|KB|TB|nodes?))/i
    );

  const parsedBeforeValue = slide.metricBeforeValue?.trim() || (beforeAfterMatch ? beforeAfterMatch[1].replace(/\s+/g, '') : undefined);
  const parsedAfterWinValue = beforeAfterMatch ? beforeAfterMatch[2].replace(/\s+/g, '') : undefined;

  const hasSourceNumber = /\d/.test(fullText) || Boolean(slide.metricValue && /\d/.test(slide.metricValue));

  const extractedMetric = (() => {
    if (!hasSourceNumber) return '';
    if (parsedAfterWinValue) return parsedAfterWinValue;
    const currencyMatch = fullText.match(/\$\s*(\d+(?:[.,]\d+)?)\s*(trillion|billion|million|T|B|M|K)?/i);
    if (currencyMatch) {
      const unit = currencyMatch[2] ? currencyMatch[2][0].toUpperCase() : '';
      return `$${currencyMatch[1].replace(',', '.')}${unit}`;
    }
    const arabTrillion = fullText.match(/(\d+(?:[.,]\d+)?)\s*(?:تريليونات|تريليون)\s*(?:دولار)?/);
    if (arabTrillion) {
      return `$${arabTrillion[1].replace(',', '.')}T`;
    }
    const arabBillion = fullText.match(/(\d+(?:[.,]\d+)?)\s*(?:مليارات|مليار)\s*(?:دولار)?/);
    if (arabBillion) {
      return `$${arabBillion[1].replace(',', '.')}B`;
    }
    const gwMatch = fullText.match(/\b(\d+(?:[.,]\d+)?)\s*(?:gigawatts?|GW)\b/i);
    if (gwMatch) {
      return `${gwMatch[1]} GW`;
    }
    // Prefer the WIN / reduction figure when multiple numbers exist
    const allTechMatches = Array.from(
      fullText.matchAll(/\b(\d+(?:\.\d+)?\s*(?:x|%|ms|μs|µs|ns|GB|MB|KB|TB|rps|req\/s|nodes?))\b/gi)
    );
    if (allTechMatches.length > 0) {
      let bestVal = allTechMatches[0][1].replace(/\s+/g, '');
      let bestScore = -Infinity;
      for (const m of allTechMatches) {
        const val = m[1].replace(/\s+/g, '');
        const idx = m.index ?? 0;
        const clause = lower.slice(Math.max(0, idx - 60), Math.min(lower.length, idx + val.length + 45));
        let score = 0;
        if (/\b(?:reduced|reduce|cut|slashed|drop|dropped|down\s+to|faster|speedup|saved|lower)\b/.test(clause)) score += 12;
        if (/\b(?:trade-?off|increased|increase|overhead|footprint|cost|spend|burn)\b/.test(clause)) score -= 14;
        if (/(?:x|ms|μs|µs|rps|req\/s)$/i.test(val)) score += 3;
        if (score > bestScore) {
          bestScore = score;
          bestVal = val;
        }
      }
      return bestVal;
    }
    const plainNum = fullText.match(/\b(\d[\d,.]*)\b/);
    if (plainNum) {
      return plainNum[1];
    }
    return '';
  })();

  const isDropOrReduction =
    /\b(?:drop|dropped|dropping|slash|slashed|slashing|cut|cutting|reduce|reduced|reducing|lower|down|shrink|shrinking|fell|eliminat)\b|خفض|تقليص|انخفاض/i.test(
      lower
    );

  // Always prefer the "after" / win value over the "before" value; never fabricate a metric when source lacks numbers
  const metricValue = (() => {
    if (!hasSourceNumber) {
      return '';
    }
    if (parsedAfterWinValue) {
      return parsedAfterWinValue;
    }
    if (
      !forceRefresh &&
      slide.metricValue &&
      slide.metricValue !== '0.4ms' &&
      slide.metricValue !== '10x' &&
      slide.metricValue !== parsedBeforeValue
    ) {
      return slide.metricValue;
    }
    return extractedMetric;
  })();

  const metricBeforeValue =
    hasSourceNumber && parsedBeforeValue && parsedBeforeValue !== metricValue
      ? parsedBeforeValue
      : undefined;

  // Derive a clean, authentic domain term from the source (never "TELEMETRY STAT" or "EXPOSURE METRIC")
  const derivedRealMetricLabel = (() => {
    if (!hasSourceNumber) return '';
    if (/latency|response|delay|ms\b|مللي\s*ثانية|استجابة/i.test(fullText)) return 'RESPONSE DELAY';
    if (/node|cluster|server|shard|عقدة|خادم/i.test(fullText)) return 'CLUSTER NODES';
    if (/message|chat|trillion|storage|رسالة|تخزين/i.test(fullText)) return 'MESSAGE STORAGE';
    if (/cost|spend|bill|price|\$|تكلفة|إنفاق/i.test(fullText)) return 'CLOUD SPEND';
    if (/memory|ram|buffer|gc\b|ذاكرة/i.test(fullText)) return 'MEMORY FOOTPRINT';
    if (/token|key|signature|kb\b|bytes?|مفتاح/i.test(fullText)) return 'PAYLOAD SIZE';
    const cleanPhrase = phrases.find((p) => !/\d/.test(p) && p.length >= 4) || phrases[0] || 'MEASURED RESULT';
    return cleanPhrase.toUpperCase().slice(0, 24);
  })();

  const isNonsenseMetricLabel = (lbl?: string) =>
    !lbl ||
    /EXPOSURE\s+METRIC|TELEMETRY\s+STAT|SCALE\s+METRIC|PERFORMANCE\s+MULTIPLIER|^p99\s+latency$|\bTO\s+EXPOSURE\b/i.test(lbl);

  const metricLabel = !hasSourceNumber
    ? ''
    : !forceRefresh && slide.metricLabel && !isNonsenseMetricLabel(slide.metricLabel)
    ? slide.metricLabel
    : derivedRealMetricLabel;

  // Compute plain-language outcome badge (e.g. "8x FASTER • 88% DROP")
  const derivedPlainOutcomeBadge = (() => {
    if (!hasSourceNumber) return '';
    if (metricBeforeValue && metricValue) {
      const bNum = parseFloat(metricBeforeValue.replace(/[^0-9.]/g, ''));
      const aNum = parseFloat(metricValue.replace(/[^0-9.]/g, ''));
      if (!isNaN(bNum) && !isNaN(aNum) && bNum > aNum && aNum > 0) {
        const ratio = Math.round(bNum / aNum);
        const pct = Math.round(((bNum - aNum) / bNum) * 100);
        if (ratio >= 2) {
          return `${ratio}x FASTER • ${pct}% DROP`;
        }
        return `${pct}% REDUCTION`;
      }
    }
    const pctInText = fullText.match(/\b(\d{1,3}(?:\.\d+)?)%\b/);
    if (pctInText && isDropOrReduction) {
      return `${pctInText[1]}% LOWER IN PRODUCTION`;
    }
    if (isDropOrReduction) {
      return 'MEASURED REDUCTION';
    }
    return 'MEASURED OUTCOME';
  })();

  const isNonsenseMetricDiff = (diff?: string) =>
    !diff ||
    diff === '▲ 94% faster' ||
    /High\s+.*Exposure|Verified\s+.*Scale|TELEMETRY\s+STAT/i.test(diff);

  const metricDiff = !hasSourceNumber
    ? ''
    : !forceRefresh && slide.metricDiff && !isNonsenseMetricDiff(slide.metricDiff)
    ? slide.metricDiff
    : derivedPlainOutcomeBadge;

  const hookClaimCard = !hasSourceNumber
    ? slide.hookClaimCard || buildNonNumericHookClaimCard(fullText, slide)
    : undefined;

  const chartDirection: 'up' | 'down' | 'bar' | 'none' = (() => {
    if (!hasSourceNumber) return 'none';
    if (slide.chartDirection) return slide.chartDirection;
    if (metricBeforeValue) {
      const bNum = parseFloat(metricBeforeValue.replace(/[^0-9.]/g, ''));
      const aNum = parseFloat(metricValue.replace(/[^0-9.]/g, ''));
      if (!isNaN(bNum) && !isNaN(aNum) && bNum > aNum) return 'down';
    }
    if (isDropOrReduction) return 'down';
    return 'up';
  })();

  const rawMetricIcon =
    !forceRefresh && slide.metricIcon && slide.metricIcon !== 'zap'
      ? slide.metricIcon
      : matchedIcons[0] || (isFinancialOrMacro ? 'dollarSign' : 'zap');
  const metricIcon = THIRD_PARTY_COMPANY_NAMES.has(rawMetricIcon.toLowerCase())
    ? matchedIcons[0] || 'zap'
    : rawMetricIcon;

  // 5. CODE DIFF ARCHETYPE DEFAULTS
  const derivedCode = (() => {
    if (/security|breach|permission|auth|zero[- ]?trust|policy|اختراق|أمن|صلاحيات/.test(lower)) {
      return {
        fileName: 'policy_guard.yaml',
        language: 'yaml',
        snippet: `# Enforce strict zero-trust scope boundary\n- allow_unscoped_agent_actions: true\n+ allow_unscoped_agent_actions: false\n+ require_mutual_tls_attestation: true\n+ max_token_ttl_seconds: 300`,
      };
    }
    if (/vector|pgvector|embedding|cosine|sql|postgres|database|query|متجهات|بيانات/.test(lower)) {
      return {
        fileName: 'vector_index.sql',
        language: 'sql',
        snippet: `-- High-recall HNSW vector similarity lookup\n- SELECT id FROM items WHERE text LIKE '%query%';\n+ SELECT id, 1 - (embedding <=> $1) AS score\n+ FROM items ORDER BY embedding <=> $1 LIMIT 10;`,
      };
    }
    if (/docker|kubernetes|k8s|container|pod|deploy|حاويات/.test(lower)) {
      return {
        fileName: 'deployment.yaml',
        language: 'yaml',
        snippet: `# Production workload isolation spec\n- privileged: true\n+ securityContext:\n+   readOnlyRootFilesystem: true\n+   runAsNonRoot: true`,
      };
    }
    const fnName = (phrases[0] || 'execute_pipeline').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return {
      fileName: `${fnName}.rs`,
      language: 'rust',
      snippet: `// Deterministic ${phrases[0] || 'Runtime'} execution\n- let state = legacy_unbounded_call();\n+ let guard = PolicyEngine::verify(&ctx)?;\n+ let state = guard.execute_bounded().await?;`,
    };
  })();

  const codeFileName =
    !forceRefresh && slide.codeFileName && !isGenericPlaceholderValue(slide.codeFileName)
      ? slide.codeFileName
      : derivedCode.fileName;
  const codeLanguage =
    !forceRefresh && slide.codeLanguage && slide.codeLanguage !== 'bash'
      ? slide.codeLanguage
      : derivedCode.language;
  const codeSnippet =
    !forceRefresh && slide.codeSnippet && slide.codeSnippet.trim()
      ? slide.codeSnippet
      : derivedCode.snippet;

  // 6. COMPARE ARCHETYPE DEFAULTS
  const derivedCompare = (() => {
    const p0 = phrases[0] || 'System Scope';
    const p1 = phrases[1] || 'Policy Control';
    const p2 = phrases[2] || 'Verification';

    const vsMatch = `${slide.enTitle || ''}. ${slide.enBody || ''}`.match(
      /([A-Za-z0-9][A-Za-z0-9\s/-]{1,24}?)\s+(?:vs\.?|versus|compared\s+to|instead\s+of)\s+([A-Za-z0-9][A-Za-z0-9\s/-]{1,24}?)(?:[.,;:!?]|$)/i
    );
    if (vsMatch) {
      const leftClean = vsMatch[1].trim().toUpperCase().slice(0, 22);
      const rightClean = vsMatch[2].trim().toUpperCase().slice(0, 22);
      return {
        leftTitle: leftClean,
        leftBody: `• Legacy ${vsMatch[1].trim()} constraints\n• Higher operational overhead\n• Limited elasticity under load`,
        rightTitle: rightClean,
        rightBody: `• Optimized ${vsMatch[2].trim()} path\n• Sub-millisecond execution\n• Deterministic scaling guarantees`,
      };
    }

    if (/security|breach|threat|permission|ai|اختراق|أمن|ذكاء/.test(lower)) {
      return {
        leftTitle: 'UNSCOPED / DEFAULT',
        leftBody: `• Unchecked ${p0} expansion\n• Implicit trust across ${p1}\n• Blind spots in runtime auditing`,
        rightTitle: 'GOVERNED / ZERO-TRUST',
        rightBody: `• Least-privilege ${p0} bounds\n• Explicit ${p1} attestation\n• Continuous ${p2} telemetry`,
      };
    }
    return {
      leftTitle: `BASELINE ${p0.toUpperCase().slice(0, 14)}`,
      leftBody: `• Sequential ${p0} bottlenecks\n• High overhead during ${p1}\n• Manual recovery on failure`,
      rightTitle: `OPTIMIZED ${p0.toUpperCase().slice(0, 14)}`,
      rightBody: `• Parallel ${p0} execution\n• Sub-millisecond ${p1}\n• Deterministic ${p2} state`,
    };
  })();

  const compareLeftTitle =
    !forceRefresh && slide.compareLeftTitle && !isGenericPlaceholderValue(slide.compareLeftTitle)
      ? slide.compareLeftTitle
      : derivedCompare.leftTitle;
  const compareLeftBody =
    !forceRefresh && slide.compareLeftBody && slide.compareLeftBody.trim()
      ? slide.compareLeftBody
      : derivedCompare.leftBody;
  const compareRightTitle =
    !forceRefresh && slide.compareRightTitle && !isGenericPlaceholderValue(slide.compareRightTitle)
      ? slide.compareRightTitle
      : derivedCompare.rightTitle;
  const compareRightBody =
    !forceRefresh && slide.compareRightBody && slide.compareRightBody.trim()
      ? slide.compareRightBody
      : derivedCompare.rightBody;

  const derivedSubjectPair = detectSubjectPairFromText(fullText, slide);

  return {
    recommendedArchetype,
    recommendedVariant,
    centerIcon,
    centerTag,
    satLabels,
    hubNodeReasons,
    satIcons,
    diagramVariant: activeVariant,
    diagramNodes,
    diagramEdges,
    diagramFooter,
    stepNumber,
    stepLabel,
    numberIcon,
    metricBeforeValue,
    metricValue,
    metricLabel,
    metricDiff,
    metricIcon,
    hookClaimCard,
    chartDirection,
    codeFileName,
    codeLanguage,
    codeSnippet,
    compareLeftTitle,
    compareLeftBody,
    compareRightTitle,
    compareRightBody,
    subjectPair: derivedSubjectPair,
  };
}

/**
 * Rule 1: HOOK ENGINE (Slide 1 of any deck)
 * - Numeric sources: before/after metric focal point with WIN highlighted and jargon translated.
 * - Non-numeric sources: Quote-style claim card or contrast visual (plus Hub when distinct concepts exist), zero fabricated numbers.
 * - Multi-slide decks: strictly 1-line headline per language (<= 12 words EN + AR) and ZERO body text on Slide 1.
 */
export function applyHookEngineToSlide1(
  slide: SlideData,
  isSingleSlide: boolean = false,
  sourceContextText?: string
): SlideData {
  if (isSingleSlide || slide.type === 'poster' || slide.standaloneMeme) {
    return slide;
  }

  const combinedContextForExtraction = [
    sourceContextText || '',
    slide.enTitle || '',
    slide.enBody || '',
    // Only fall back to Arabic text for node extraction if no English text is available
    ...(!/[A-Za-z]{3,}/.test(`${sourceContextText || ''} ${slide.enTitle || ''} ${slide.enBody || ''}`)
      ? [slide.arTitle || '', slide.arBody || '']
      : []),
  ]
    .filter(Boolean)
    .join(' ');

  const smart = resolveSmartSlideVisuals(
    {
      ...slide,
      enBody: slide.enBody || sourceContextText,
    },
    0,
    true
  );

  const hasNumericWin = Boolean(smart.metricValue && /\d/.test(smart.metricValue));
  const quotedHub =
    slide.hubNodeReasons && slide.hubNodeReasons.length >= 4
      ? {
          satLabels: slide.satLabels || smart.satLabels,
          hubNodeReasons: slide.hubNodeReasons,
        }
      : extractSourceQuotedHubNodes(combinedContextForExtraction, {
          titleText: slide.enTitle,
          category: slide.category || slide.centerTag,
          targetCount: 5,
        });

  const nonNumericCard = !hasNumericWin
    ? slide.hookClaimCard || smart.hookClaimCard || buildNonNumericHookClaimCard(combinedContextForExtraction, slide)
    : undefined;

  const plainEnTitle = capHeadlineToTwelveWords(
    translateSlide1JargonToPlainOutcome(slide.enTitle || ''),
    false
  );
  const plainArTitle = capHeadlineToTwelveWords(slide.arTitle || '', true);

  const detectedPair = detectSubjectPairFromText(combinedContextForExtraction, slide);
  const isSubjectPairStory = Boolean(detectedPair);

  // Pick Slide 1 Hook cover layout (NEVER 'hub' per storyboard policy, NEVER empty metric, NEVER subjectPair without two verified real systems):
  const resolvedType: SlideType = (() => {
    if (slide.type === 'image' && (slide.imageUrl || slide.videoUrl)) return 'image';
    if (isSubjectPairStory) return 'subjectPair';
    const dynamicCover = inferDynamicCoverArchetype({
      ...slide,
      enBody: slide.enBody || sourceContextText,
      subjectPair: undefined,
    });
    if (dynamicCover === 'row') return 'row';
    if (hasNumericWin) {
      return slide.type === 'compare' || slide.type === 'code' ? slide.type : 'metric';
    }
    if (dynamicCover === 'compare') return 'compare';
    if (nonNumericCard) {
      return slide.type === 'compare' || slide.type === 'code' ? slide.type : 'metric';
    }
    if (slide.type === 'compare' || slide.type === 'code' || slide.type === 'row') {
      return slide.type;
    }
    return 'row';
  })();

  const finalSatLabels =
    quotedHub.satLabels.length >= 4
      ? quotedHub.satLabels
      : slide.type === 'hub' && slide.satLabels && slide.satLabels.length >= 2
      ? slide.satLabels
      : quotedHub.satLabels.length >= 2
      ? quotedHub.satLabels
      : smart.satLabels;
  const finalReasons =
    quotedHub.hubNodeReasons.length >= 1
      ? quotedHub.hubNodeReasons
      : slide.hubNodeReasons && slide.hubNodeReasons.length >= 1
      ? slide.hubNodeReasons
      : smart.hubNodeReasons;

  const hookSlide: SlideData = {
    ...slide,
    type: resolvedType,
    storyRole: 'hook',
    // Multi-slide Slide 1 never displays body text
    enBody: '',
    arBody: '',
    enTitle: plainEnTitle || slide.enTitle,
    arTitle: plainArTitle || slide.arTitle,
    subjectPair: resolvedType === 'subjectPair' ? detectedPair : undefined,
    diagramVariant: resolvedType === 'row' ? (slide.diagramVariant || smart.diagramVariant) : slide.diagramVariant,
    diagramNodes: smart.diagramNodes,
    diagramEdges: smart.diagramEdges,
    diagramFooter: smart.diagramFooter,
    satLabels: finalSatLabels,
    hubNodeReasons: finalReasons,
    satIcons: smart.satIcons,
    centerIcon: smart.centerIcon,
    centerTag: smart.centerTag,
    metricBeforeValue: hasNumericWin ? smart.metricBeforeValue : undefined,
    metricValue: hasNumericWin ? smart.metricValue : '',
    metricLabel: hasNumericWin ? smart.metricLabel : '',
    metricDiff: hasNumericWin ? smart.metricDiff : '',
    metricIcon: smart.metricIcon,
    hookClaimCard: !hasNumericWin ? nonNumericCard : undefined,
    chartDirection: hasNumericWin ? smart.chartDirection : 'none',
  };

  hookSlide.cornerTag = deriveSlideCornerTag(hookSlide, 0, 6);
  hookSlide.layoutRationale = explainArchetypeChoice(
    { ...hookSlide, enBody: slide.enBody || sourceContextText },
    0,
    6
  );
  return hookSlide;
}

/**
 * Determines the most scroll-stopping Slide 1 cover archetype based on the story angle:
 * - 'subjectPair' ONLY when two real named systems are verified in a migration/replacement/before-after relation
 * - 'row' (mechanism schematic) for robotics, hardware, ML architecture, "how X works" explainers, security/kernel mechanics
 * - 'compare' for head-to-head showdowns or paradigm trade-offs
 * - 'metric' for hard benchmarks, dollar figures, latency drops, or Focused Hook Claim card on opinion/thesis pieces
 */
export function inferDynamicCoverArchetype(slide: SlideData): SlideType {
  if (slide.type === 'image' && (slide.imageUrl || slide.videoUrl)) return 'image';
  if (slide.type === 'poster') return 'poster';

  const title = (slide.enTitle || '').trim();
  const body = (slide.enBody || '').trim();
  const arTitle = (slide.arTitle || '').trim();
  const combined = `${title} ${body} ${arTitle}`;

  // 0. Strict Subject Pair detection: when two real named systems are in a migration/before-after relation
  const hasMigrationOrBeforeAfterCue =
    /\b(?:migrat(?:ed|ing|ion|es)|mov(?:ed|ing)|switch(?:ed|ing)|transition(?:ed|ing)|replac(?:ed|ing)|port(?:ed|ing)|rewrot(?:e|ten)|from\s+[A-Za-z0-9.+_-]+(?:\s+[A-Za-z0-9.+_-]+)?\s+(?:to|onto|into))\b|->|➔|⟶|انتقل|هاجر|هجرة|استبدل/i.test(
      combined
    );
  if (hasMigrationOrBeforeAfterCue && detectSubjectPairFromText(combined, slide)) {
    return 'subjectPair';
  }

  // 1. Robotics, hardware, physical pick-and-place, ML architecture, simulation, "How X works" explainer, or kernel/protocol mechanism -> Row schematic cover
  if (
    /\b(?:how\s+.+\s+works|pick[- ]and[- ]place|robot(?:ic|ics|s)?|gripper|actuator|sensor|kinematics|conveyor|wrist|camera|simulation|hardware|firmware|attention|transformer|diffusion|neural|inference|training|verifier|bytecode|cve-\d{4}|zero[- ]?day|exploit|vulnerability|sandbox|isolation|ebpf|kernel|handshake|protocol|wireguard|mtls|post[- ]?quantum|signature\s+size|quorum|consensus|state\s+machine)\b/i.test(
      combined
    ) ||
    /^how\s+/i.test(title)
  ) {
    return 'row';
  }

  // 2. Hard benchmark / financial shock / latency / scale number in the hook -> Metric cover
  const hasNumbers = /(?:\$\d[\d,.]*\s*[KMBTkmbt]?|\b\d+(?:\.\d+)?\s*(?:%|x|X|ms|µs|ns|s|GB\/s|MB\/s|KB|MB|GB|TB|PB|req\/s|RPS|ops\/s|QPS|tokens\/s|GW|MW|billion|trillion|million)\b)/i.test(
    `${title} ${body}`
  );
  if (hasNumbers) {
    return 'metric';
  }

  // 3. Head-to-head comparison / trade-off angle -> Compare cover
  if (
    /\b(?:vs\.?|versus|compared\s+to|instead\s+of|outperforms|beats|tradeoff|trade-?off)\b/i.test(
      combined
    ) ||
    /مقابل|بدلاً\s+من|مقارنة/.test(arTitle)
  ) {
    return 'compare';
  }

  // 4. Opinion / thesis / non-numeric claim -> Focused Hook Claim card (rendered under 'metric' with hookClaimCard)
  return 'metric';
}

/**
 * Returns a crisp one-line explanation for why "Smart Match" or "Diversify Deck"
 * selected a slide's layout archetype and schematic variant, always quoting concrete terms
 * from the source and never displaying generic placeholders like "System A -> System B".
 */
export function explainArchetypeChoice(
  slide: SlideData,
  slideIndex: number = 0,
  totalSlides: number = 8
): string {
  const fullText = `${slide.enTitle || ''} ${slide.enBody || ''}`.trim();
  const type = slide.type;
  const extractedTerms = extractKeyPhrasesFromSlide(slide).filter(
    (p) => !isPlaceholderOrEmptyBrandValue(p)
  );
  const nodeTerms = (slide.diagramNodes || [])
    .map((n) => (n.label || '').trim())
    .filter((l) => l && !isGenericPlaceholderValue(l) && !isPlaceholderOrEmptyBrandValue(l));
  const concreteTerms = nodeTerms.length >= 2 ? nodeTerms.slice(0, 3) : extractedTerms.slice(0, 3);
  const quotedTermsStr =
    concreteTerms.length >= 2
      ? `"${concreteTerms.join('" -> "')}"`
      : concreteTerms[0]
      ? `"${concreteTerms[0]}"`
      : `"${(slide.enTitle || 'source topic').slice(0, 36)}"`;

  if (type === 'subjectPair') {
    const verifiedPair = detectSubjectPairFromText(fullText, slide);
    if (verifiedPair) {
      const ownerClause = verifiedPair.storyOwner ? ` at ${verifiedPair.storyOwner}` : '';
      return `Picked Subject Pair visual ("${verifiedPair.beforeSystem}" to "${verifiedPair.afterSystem}"${ownerClause}) because source explicitly compares or migrates between these two named systems.`;
    }
    return `Subject Pair skipped because two real system names could not be extracted from ${quotedTermsStr}; use a topic-matched layout.`;
  }
  if (type === 'cta' || (totalSlides > 1 && slideIndex === totalSlides - 1)) {
    return `Picked CTA closer for Slide ${slideIndex + 1} to drive discussion and credit attribution.`;
  }
  if (type === 'compare') {
    const left = slide.compareLeftTitle && !isPlaceholderOrEmptyBrandValue(slide.compareLeftTitle) ? slide.compareLeftTitle : concreteTerms[0];
    const right = slide.compareRightTitle && !isPlaceholderOrEmptyBrandValue(slide.compareRightTitle) ? slide.compareRightTitle : concreteTerms[1];
    if (left && right) {
      return `Picked Compare side-by-side layout contrasting "${left}" vs "${right}" from source (not a two-system migration of named software products).`;
    }
    return `Picked Compare side-by-side layout for ${quotedTermsStr} to contrast architectural trade-offs.`;
  }
  if (type === 'metric') {
    const m = fullText.match(/(?:\$\d[\d,.]*[KMBTkmbt]?|\b\d+(?:\.\d+)?\s*(?:%|x|X|ms|µs|ns|KB|MB|GB|TB|GW|rps|req\/s)\b)/i);
    if (m || (slide.metricValue && /\d/.test(slide.metricValue))) {
      const numVal = (slide.metricValue || m?.[0] || '').trim();
      return `Picked Metric card to spotlight measured "${numVal}" benchmark on ${quotedTermsStr}.`;
    }
    const claimSnippet = (slide.hookClaimCard?.statement || slide.enTitle || 'core thesis').slice(0, 44).trim();
    return `Picked Focused Hook Claim card for "${claimSnippet}" (not a two-system migration or hard metric).`;
  }
  if (type === 'code') {
    return `Picked Code window (${(slide.codeLanguage || 'spec').toUpperCase()}) for ${quotedTermsStr} implementation syntax and diff clarity.`;
  }
  if (type === 'number') {
    return `Picked Numbered Stage (${slide.stepNumber || `0${slideIndex + 1}`}) for sequential progression across ${quotedTermsStr}.`;
  }
  if (type === 'hub') {
    const hubSample = (slide.satLabels || []).slice(0, 3).join(', ') || quotedTermsStr;
    return `Picked Orbital Hub diagram mapping "${hubSample}" ecosystem relationships.`;
  }
  if (type === 'poster') {
    return `Picked Dense Poster layout to pack ${quotedTermsStr} schematic + 3 bilingual takeaways on one frame.`;
  }
  if (type === 'image') {
    return `Picked Media Card layout for ${quotedTermsStr} to frame visual asset within safe-zone chrome.`;
  }

  // Row schematic variants (Mechanism / Robotics / ML / Explainer)
  switch (slide.diagramVariant) {
    case 'isolation':
      return `Picked Mechanism (Isolation Grid) schematic mapping ${quotedTermsStr} security boundaries (not a two-system migration).`;
    case 'graph':
      return `Picked Mechanism (Hierarchical Graph) schematic mapping ${quotedTermsStr} routing and traversal steps (not a two-system migration).`;
    case 'clusters':
      return `Picked Mechanism (Cluster Partition) schematic mapping ${quotedTermsStr} sharding and pruning (not a two-system migration).`;
    case 'split':
      return `Picked Mechanism (Dual-Store Split) schematic contrasting ${quotedTermsStr} hot vs cold paths (not a two-system migration).`;
    case 'stack':
      return `Picked Mechanism (3-Tier Stack) schematic visualizing ${quotedTermsStr} vertical execution layers (not a two-system migration).`;
    case 'scatter':
      return `Picked Mechanism (Vector Scatter) schematic illustrating ${quotedTermsStr} high-dimensional lookup (not a two-system migration).`;
    case 'takeaway':
      return `Picked Architectural Verdict schematic summarizing ${quotedTermsStr} production trade-offs.`;
    case 'features':
      return `Picked 3-Pillar Feature schematic presenting ${quotedTermsStr} capabilities.`;
    default:
      return `Picked Mechanism (3-Node Topology) flow mapping ${quotedTermsStr} from source steps (not a two-system migration).`;
  }
}

/**
 * Deck-Wide Dynamic Archetype & Graphic Diversifier:
 * Analyzes Slides 1 through N-1 and assigns a rich variety of visual archetypes
 * (`compare`, `code`, `metric`, `number`, `hub`, and non-repeating `row` diagramVariants)
 * while seeding content-specific nodes, comparisons, metrics, and code snippets from each slide's copy.
 * Respects `slide.manualLayoutLocked` (Cascade Lock) so manually edited slides are protected.
 */
export function diversifyDeckArchetypesAndVisuals(
  slides: SlideData[],
  options?: { dynamicCover?: boolean }
): SlideData[] {
  if (!slides || slides.length <= 1) return slides;

  const variantRotation: DiagramVariant[] = [
    'isolation',
    'clusters',
    'split',
    'features',
    'graph',
    'topology',
    'stack',
    'scatter',
  ];
  let variantCursor = 0;
  let usedCompare = false;
  let usedCode = false;
  let usedMetric = false;
  let slide1CoverType: SlideType = 'metric';
  const assignedTypes: SlideType[] = [];
  const assignedSignatures: string[] = [];

  return slides.map((slide, idx) => {
    const storyRole: SlideData['storyRole'] =
      idx === 0
        ? 'hook'
        : idx === slides.length - 1
        ? 'cta'
        : idx === slides.length - 2
        ? 'takeaway'
        : idx === 1
        ? 'problem'
        : /\d/.test(`${slide.enTitle || ''} ${slide.enBody || ''}`) && idx >= 3
        ? 'proof'
        : 'mechanism';

    // Cascade Lock: protect slides edited manually by the user
    if (slide.manualLayoutLocked) {
      if (idx === 0) slide1CoverType = slide.type;
      if (slide.type === 'compare') usedCompare = true;
      if (slide.type === 'code') usedCode = true;
      if (slide.type === 'metric') usedMetric = true;
      assignedTypes.push(slide.type);
      assignedSignatures.push(slide.type === 'row' ? `row:${slide.diagramVariant || 'topology'}` : slide.type);
      return {
        ...slide,
        storyRole: slide.storyRole || storyRole,
        cornerTag: slide.cornerTag || deriveSlideCornerTag({ ...slide, storyRole }, idx, slides.length),
        layoutRationale: slide.layoutRationale || 'Locked manually via Cascade Lock (preserved during deck sync).',
      };
    }

    // Slide 1 Cover: Always a Hook layout (subjectPair / metric / compare / row / code) — NEVER 'hub'
    if (idx === 0) {
      const hasValidSubjectPair = Boolean(
        detectSubjectPairFromText(`${slide.enTitle || ''} ${slide.enBody || ''} ${slide.arTitle || ''}`, slide)
      );
      const explicitHookCover =
        (slide.type === 'subjectPair' && hasValidSubjectPair) ||
        slide.type === 'metric' ||
        slide.type === 'compare' ||
        slide.type === 'code' ||
        slide.type === 'row' ||
        slide.type === 'poster' ||
        slide.type === 'image';

      const coverType: SlideType = explicitHookCover
        ? slide.type
        : options?.dynamicCover !== false
        ? inferDynamicCoverArchetype(slide)
        : 'metric';

      slide1CoverType = coverType;
      if (coverType === 'compare') usedCompare = true;
      if (coverType === 'metric') usedMetric = true;
      if (coverType === 'code') usedCode = true;

      const coverVariant: DiagramVariant | undefined =
        coverType === 'row'
          ? slide.diagramVariant ||
            (inferBestDiagramVariant(slide) !== 'topology'
              ? inferBestDiagramVariant(slide)
              : 'topology')
          : slide.diagramVariant;

      const smartCover = resolveSmartSlideVisuals(
        { ...slide, type: coverType, diagramVariant: coverVariant },
        0,
        true
      );

      if (coverType === 'row') {
        variantCursor++;
      }

      const nextCover: SlideData = applyHookEngineToSlide1(
        {
          ...slide,
          type: coverType,
          storyRole: 'hook',
          subjectPair: coverType === 'subjectPair' ? smartCover.subjectPair : undefined,
          centerIcon: smartCover.centerIcon,
          centerTag: smartCover.centerTag,
          satLabels: smartCover.satLabels,
          satIcons: smartCover.satIcons,
          metricBeforeValue: smartCover.metricBeforeValue,
          metricValue: smartCover.metricValue,
          metricLabel: smartCover.metricLabel,
          metricDiff: smartCover.metricDiff,
          metricIcon: smartCover.metricIcon,
          chartDirection: smartCover.chartDirection,
          compareLeftTitle: smartCover.compareLeftTitle,
          compareLeftBody: smartCover.compareLeftBody,
          compareRightTitle: smartCover.compareRightTitle,
          compareRightBody: smartCover.compareRightBody,
          codeFileName: smartCover.codeFileName,
          codeLanguage: smartCover.codeLanguage,
          codeSnippet: smartCover.codeSnippet,
          diagramVariant: coverType === 'row' ? coverVariant || smartCover.diagramVariant : slide.diagramVariant,
          diagramNodes: smartCover.diagramNodes,
          diagramEdges: smartCover.diagramEdges,
          diagramFooter: smartCover.diagramFooter,
        },
        false,
        slide.enBody
      );
      nextCover.cornerTag = deriveSlideCornerTag(nextCover, 0, slides.length);
      nextCover.layoutRationale = explainArchetypeChoice(
        { ...nextCover, enBody: slide.enBody },
        0,
        slides.length
      );
      assignedTypes.push(nextCover.type);
      assignedSignatures.push(
        nextCover.type === 'row' ? `row:${nextCover.diagramVariant || 'topology'}` : nextCover.type
      );
      return nextCover;
    }

    if (idx === slides.length - 1 && slide.type === 'cta') {
      assignedTypes.push('cta');
      assignedSignatures.push('cta');
      return {
        ...slide,
        storyRole: 'cta',
        cornerTag: 'ACTION',
        layoutRationale: explainArchetypeChoice(slide, idx, slides.length),
      };
    }

    // Preserve explicit custom images/videos
    if (slide.type === 'image' && (slide.imageUrl || slide.videoUrl)) {
      assignedTypes.push('image');
      assignedSignatures.push('image');
      return {
        ...slide,
        storyRole,
        cornerTag: deriveSlideCornerTag({ ...slide, storyRole }, idx, slides.length),
        layoutRationale: explainArchetypeChoice(slide, idx, slides.length),
      };
    }

    // Penultimate slide: Takeaway / Trade-off schematic (unless previous 2 slides were already 'row', to avoid a 3-in-a-row streak)
    const prevType1Pre = assignedTypes[assignedTypes.length - 1];
    const prevType2Pre = assignedTypes[assignedTypes.length - 2];
    if (
      idx === slides.length - 2 &&
      slides.length >= 5 &&
      !(prevType1Pre === 'row' && prevType2Pre === 'row')
    ) {
      const smartTakeaway = resolveSmartSlideVisuals(
        { ...slide, type: 'row', diagramVariant: 'takeaway' },
        idx,
        true
      );
      const nextTakeaway: SlideData = {
        ...slide,
        type: 'row',
        storyRole: 'takeaway',
        cornerTag: 'TAKEAWAY',
        diagramVariant: 'takeaway',
        diagramNodes: smartTakeaway.diagramNodes,
        diagramEdges: smartTakeaway.diagramEdges,
        diagramFooter: smartTakeaway.diagramFooter,
      };
      nextTakeaway.layoutRationale = explainArchetypeChoice(nextTakeaway, idx, slides.length);
      assignedTypes.push('row');
      assignedSignatures.push('row:takeaway');
      return nextTakeaway;
    }

    let targetType: SlideType = analyzeSlideTextForArchetype(slide, idx);

    // Prevent Slide 2 from duplicating Slide 1's cover archetype
    if (idx === 1 && targetType === slide1CoverType && slide1CoverType !== 'row') {
      targetType = !usedCompare ? 'compare' : !usedMetric ? 'metric' : 'row';
    }

    // Ensure rich archetype variety across mid-deck slides (Slides 2 to N-2)
    if (targetType === 'row') {
      if (!usedCompare && idx === 1) {
        targetType = 'compare';
      } else if (!usedCode && idx === 3) {
        targetType = 'code';
      } else if (!usedMetric && idx === 4 && /\d/.test(`${slide.enTitle} ${slide.enBody}`)) {
        targetType = 'metric';
      }
    }

    // Also reserve slide N-3 away from 'row' when slide N-4 was 'row' so slide N-2 can cleanly use 'row:takeaway'
    if (
      slides.length >= 5 &&
      idx === slides.length - 3 &&
      targetType === 'row' &&
      prevType1Pre === 'row'
    ) {
      targetType = !usedCompare ? 'compare' : !usedCode ? 'code' : 'number';
    }

    // Strict Anti-Streak Guard: NEVER allow 3 identical archetypes in a row
    const prevType1 = assignedTypes[assignedTypes.length - 1];
    const prevType2 = assignedTypes[assignedTypes.length - 2];
    if (prevType1 && prevType2 && prevType1 === targetType && prevType2 === targetType) {
      const streakBreakers: SlideType[] = ['compare', 'metric', 'number', 'code', 'row'];
      const candidate =
        streakBreakers.find((t) => t !== targetType && t !== prevType1) ||
        (targetType === 'row' ? 'number' : 'row');
      targetType = candidate;
    }

    if (targetType === 'compare') usedCompare = true;
    if (targetType === 'code') usedCode = true;
    if (targetType === 'metric') usedMetric = true;

    let chosenVariant: DiagramVariant | undefined =
      targetType === 'row'
        ? inferBestDiagramVariant(slide) !== 'topology'
          ? inferBestDiagramVariant(slide)
          : variantRotation[variantCursor++ % variantRotation.length]
        : undefined;

    if (targetType === 'row' && chosenVariant) {
      const prevSig1 = assignedSignatures[assignedSignatures.length - 1];
      if (prevSig1 === `row:${chosenVariant}`) {
        chosenVariant =
          variantRotation.find((v) => `row:${v}` !== prevSig1) ||
          variantRotation[variantCursor++ % variantRotation.length];
      }
    }

    const smart = resolveSmartSlideVisuals(
      {
        ...slide,
        type: targetType,
        diagramVariant: chosenVariant || slide.diagramVariant,
      },
      idx,
      true
    );

    if (targetType === 'subjectPair' && smart.subjectPair && slide1CoverType !== 'subjectPair') {
      const nextPair: SlideData = {
        ...slide,
        type: 'subjectPair',
        storyRole,
        subjectPair: smart.subjectPair,
      };
      nextPair.cornerTag = deriveSlideCornerTag(nextPair, idx, slides.length);
      nextPair.layoutRationale = explainArchetypeChoice(nextPair, idx, slides.length);
      assignedTypes.push('subjectPair');
      assignedSignatures.push('subjectPair');
      return nextPair;
    }

    if (targetType === 'compare') {
      const nextCompare: SlideData = {
        ...slide,
        type: 'compare',
        storyRole,
        compareLeftTitle: smart.compareLeftTitle,
        compareLeftBody: smart.compareLeftBody,
        compareRightTitle: smart.compareRightTitle,
        compareRightBody: smart.compareRightBody,
      };
      nextCompare.cornerTag = deriveSlideCornerTag(nextCompare, idx, slides.length);
      nextCompare.layoutRationale = explainArchetypeChoice(nextCompare, idx, slides.length);
      assignedTypes.push('compare');
      assignedSignatures.push('compare');
      return nextCompare;
    }

    if (targetType === 'code') {
      const nextCode: SlideData = {
        ...slide,
        type: 'code',
        storyRole,
        codeFileName: smart.codeFileName,
        codeLanguage: smart.codeLanguage,
        codeSnippet: smart.codeSnippet,
      };
      nextCode.cornerTag = deriveSlideCornerTag(nextCode, idx, slides.length);
      nextCode.layoutRationale = explainArchetypeChoice(nextCode, idx, slides.length);
      assignedTypes.push('code');
      assignedSignatures.push('code');
      return nextCode;
    }

    if (targetType === 'metric') {
      const nextMetric: SlideData = {
        ...slide,
        type: 'metric',
        storyRole: 'proof',
        metricBeforeValue: smart.metricBeforeValue,
        metricValue: smart.metricValue,
        metricLabel: smart.metricLabel,
        metricDiff: smart.metricDiff,
        metricIcon: smart.metricIcon,
        chartDirection: smart.chartDirection,
      };
      nextMetric.cornerTag = deriveSlideCornerTag(nextMetric, idx, slides.length);
      nextMetric.layoutRationale = explainArchetypeChoice(nextMetric, idx, slides.length);
      assignedTypes.push('metric');
      assignedSignatures.push('metric');
      return nextMetric;
    }

    if (targetType === 'number') {
      const nextNum: SlideData = {
        ...slide,
        type: 'number',
        storyRole,
        stepNumber: smart.stepNumber,
        stepLabel: smart.stepLabel,
        centerIcon: smart.numberIcon,
      };
      nextNum.cornerTag = deriveSlideCornerTag(nextNum, idx, slides.length);
      nextNum.layoutRationale = explainArchetypeChoice(nextNum, idx, slides.length);
      assignedTypes.push('number');
      assignedSignatures.push('number');
      return nextNum;
    }

    const finalVariant = chosenVariant || smart.diagramVariant;
    const nextRow: SlideData = {
      ...slide,
      type: 'row',
      storyRole,
      diagramVariant: finalVariant,
      diagramNodes: smart.diagramNodes,
      diagramEdges: smart.diagramEdges,
      diagramFooter: smart.diagramFooter,
    };
    nextRow.cornerTag = deriveSlideCornerTag(nextRow, idx, slides.length);
    nextRow.layoutRationale = explainArchetypeChoice(nextRow, idx, slides.length);
    assignedTypes.push('row');
    assignedSignatures.push(`row:${finalVariant || 'topology'}`);
    return nextRow;
  });
}

/**
 * Automatically fits a slide's English and Arabic headlines and body copy
 * to mobile character limits without requiring a manual "Auto-Fit" button click.
 */
export function autoFitSlideCopyToLimits(
  slide: SlideData,
  slideIndex: number = 0,
  isSingleSlide: boolean = false
): SlideData {
  const isSingle = isSingleSlide || slide.type === 'poster';
  const limits = isSingle ? SINGLE_SLIDE_CHAR_LIMITS : CHAR_LIMITS;
  const isHook = slideIndex === 0 || slide.type === 'hub';
  const enTitleLimit = isHook ? limits.hookTitle : limits.enTitle;

  const rawEnTitle = (slide.enTitle || '').trim();
  const rawArTitle = (slide.arTitle || '').trim();
  const rawEnBody = (slide.enBody || '').trim();
  const rawArBody = (slide.arBody || '').trim();

  const fittedEnTitle =
    rawEnTitle.length > enTitleLimit
      ? autoPolishHeadline(autoFitTextToLimits(rawEnTitle, enTitleLimit))
      : rawEnTitle;
  const fittedArTitle =
    rawArTitle.length > limits.arTitle
      ? fixArabicPunctuation(autoFitTextToLimits(rawArTitle, limits.arTitle))
      : fixArabicPunctuation(rawArTitle);
  const fittedEnBody =
    rawEnBody.length > limits.enBody
      ? autoFitTextToLimits(rawEnBody, limits.enBody)
      : rawEnBody;
  const fittedArBody =
    rawArBody.length > limits.arBody
      ? fixArabicPunctuation(autoFitTextToLimits(rawArBody, limits.arBody))
      : fixArabicPunctuation(rawArBody);

  const hooked = !isSingle && slideIndex === 0
    ? applyHookEngineToSlide1(
        {
          ...slide,
          enTitle: fittedEnTitle || slide.enTitle,
          arTitle: fittedArTitle || slide.arTitle,
          enBody: fittedEnBody || slide.enBody,
          arBody: fittedArBody || slide.arBody,
        },
        false,
        rawEnBody
      )
    : {
        ...slide,
        enTitle: fittedEnTitle || slide.enTitle,
        arTitle: fittedArTitle || slide.arTitle,
        enBody: fittedEnBody || slide.enBody,
        arBody: fittedArBody || slide.arBody,
      };

  return hooked;
}

/**
 * Automatically synchronizes a slide's graphic elements (diagram nodes, edges,
 * compare cards, code blocks, hard metrics, step labels, and hub satellites)
 * directly from its current headline and body copy.
 */
export function autoSyncSlideGraphicsFromCopy(
  slide: SlideData,
  slideIndex: number = 0
): SlideData {
  if (slide.type === 'cta') {
    return {
      ...slide,
      storyRole: 'cta',
      cornerTag: 'ACTION',
    };
  }
  const hasExistingValidNodes =
    slideIndex === 0 &&
    !slide.enBody &&
    slide.diagramNodes &&
    slide.diagramNodes.length >= 3 &&
    !isGenericPlaceholderValue(slide.diagramNodes[0]?.label);
  const smart = resolveSmartSlideVisuals(slide, slideIndex, !hasExistingValidNodes);
  const synced: SlideData = {
    ...slide,
    subjectPair: slide.subjectPair || smart.subjectPair,
    diagramVariant: slide.diagramVariant || smart.diagramVariant,
    diagramNodes: hasExistingValidNodes ? slide.diagramNodes : smart.diagramNodes,
    diagramEdges: hasExistingValidNodes && slide.diagramEdges ? slide.diagramEdges : smart.diagramEdges,
    diagramFooter: hasExistingValidNodes && slide.diagramFooter ? slide.diagramFooter : smart.diagramFooter,
    compareLeftTitle: smart.compareLeftTitle,
    compareLeftBody: smart.compareLeftBody,
    compareRightTitle: smart.compareRightTitle,
    compareRightBody: smart.compareRightBody,
    codeFileName: smart.codeFileName,
    codeLanguage: smart.codeLanguage,
    codeSnippet: smart.codeSnippet,
    metricBeforeValue: smart.metricBeforeValue,
    metricValue: smart.metricValue,
    metricLabel: smart.metricLabel,
    metricDiff: smart.metricDiff,
    metricIcon: smart.metricIcon,
    hookClaimCard: slide.hookClaimCard || smart.hookClaimCard,
    chartDirection: smart.chartDirection,
    stepNumber: smart.stepNumber,
    stepLabel: smart.stepLabel,
    centerIcon: smart.centerIcon,
    centerTag: smart.centerTag,
    satLabels: smart.satLabels,
    hubNodeReasons: smart.hubNodeReasons,
    satIcons: smart.satIcons,
  };
  synced.cornerTag = slide.cornerTag || deriveSlideCornerTag(synced, slideIndex, 8);
  synced.layoutRationale = slide.layoutRationale || explainArchetypeChoice(synced, slideIndex, 8);
  return slideIndex === 0 ? applyHookEngineToSlide1(synced) : synced;
}

/**
 * Zero-Click Deck Finalizer:
 * Automatically diversifies Slides across archetypes & schematic variants,
 * applies the Slide 1 Hook Engine, synchronizes every slide's graphic elements
 * from its copy, and auto-fits all bilingual headlines and body text to mobile limits.
 */
export function autoFinalizeCarouselDeck(deck: CarouselData): CarouselData {
  const isSingle = deck.postFormat === 'single' || (deck.slides || []).length === 1;
  const rawSlides = repairAndDeRepeatSlideHeadlines(deck.slides || []);
  const diversified =
    !isSingle && rawSlides.length > 2
      ? diversifyDeckArchetypesAndVisuals(rawSlides, { dynamicCover: true })
      : rawSlides;

  const finalizedSlides = repairAndDeRepeatSlideHeadlines(diversified).map((slide, idx) => {
    const fitted = autoFitSlideCopyToLimits(slide, idx, isSingle);
    const synced = autoSyncSlideGraphicsFromCopy(fitted, idx);
    if (!isSingle && idx === 0) {
      return {
        ...synced,
        storyRole: 'hook' as const,
        enBody: '',
        arBody: '',
      };
    }
    return synced;
  });

  return {
    ...deck,
    brand: 'MARROK',
    brandUrl: 'marrok.org',
    syncDeckEnabled: deck.syncDeckEnabled ?? true,
    slides: finalizedSlides,
  };
}



