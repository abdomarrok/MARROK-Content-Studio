import type { CarouselData, DiagramNode, DiagramVariant, SlideData, SlideType } from '../../types.ts';
import { TECH_ICONS_LIST } from '../techLogos.ts';
import { CHAR_LIMITS, SINGLE_SLIDE_CHAR_LIMITS } from '../qaChecks.ts';
import { autoFitTextToLimits, autoPolishHeadline } from '../text/headlines.ts';
import { fixArabicPunctuation } from '../text/arabicBiDi.ts';

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
 * Extracts crisp 1-2 word technical terms/phrases from a slide's title and body.
 */
export function extractKeyPhrasesFromSlide(slide: SlideData): string[] {
  const combined = `${slide.enTitle || ''} ${slide.enBody || ''}`;
  const clean = combined
    .replace(/[`"*_~[\]()<>]/g, ' ')
    .replace(/[—–]/g, ' ');

  const phrases: string[] = [];
  const addPhrase = (raw: string) => {
    const trimmed = raw.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9+%$]+$/g, '').trim();
    if (trimmed.length < 3) return;
    if (STOP_WORDS.has(trimmed.toLowerCase())) return;
    const upper = trimmed.toUpperCase();
    if (!phrases.some((p) => p.toUpperCase() === upper)) {
      phrases.push(trimmed);
    }
  };

  // 1. Capitalized multi-word technical terms or acronyms (e.g. "Zero-Trust", "AI Agent", "HNSW Graph", "Scope Creep")
  const capMatches = clean.match(/\b[A-Z][a-zA-Z0-9+-]*(?:\s+[A-Z][a-zA-Z0-9+-]*)?\b/g) || [];
  for (const m of capMatches) {
    const words = m.split(/\s+/).filter((w) => !STOP_WORDS.has(w.toLowerCase()));
    if (words.length > 0) {
      addPhrase(words.slice(0, 2).join(' '));
    }
  }

  // 2. Meaningful content words from title and body
  const words = clean
    .replace(/[.?!,:;]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w.toLowerCase()));

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const formatted = w.charAt(0).toUpperCase() + w.slice(1);
    addPhrase(formatted);
  }

  // 3. Fallback if slide is purely Arabic or very short
  if (phrases.length < 6) {
    const text = `${slide.enTitle || ''} ${slide.enBody || ''} ${slide.arTitle || ''} ${slide.arBody || ''}`.toLowerCase();
    if (/\$|\b(?:valuation|billion|trillion|loss|losses|deficit|capital|financing|subsid|taxpayer|retiree|revenue|spend|economy|economic|energy)\b|مليار|تريليون|خسائر|تمويل|تقييم|ضرائب|طاقة|اقتصاد/i.test(text)) {
      ['Capital Flow', 'Valuation Risk', 'Circular Finance', 'Unit Deficit', 'Grid Demand', 'Public Backstop'].forEach(addPhrase);
    } else if (/security|breach|threat|ai|permission|اختراق|أمن|ذكاء/i.test(text)) {
      ['Access Control', 'Scope Policy', 'Threat Guard', 'Audit Log', 'Identity Gate', 'Runtime Sandbox'].forEach(addPhrase);
    } else if (/vector|embedding|hnsw|ivf|search|متجهات|بحث/i.test(text)) {
      ['Embedding Vector', 'Index Graph', 'Cosine Top-K', 'Query Router', 'Candidate Scan', 'Memory Buffer'].forEach(addPhrase);
    } else {
      ['Ingress Stage', 'Core Engine', 'State Commit', 'Policy Gate', 'Telemetry Bus', 'Output Sink'].forEach(addPhrase);
    }
  }

  return phrases;
}

/**
 * Heuristic analysis of a slide's headline and body copy to assign the most appropriate
 * content archetype among Metric, Compare, Code, Row, or Number.
 */
export function analyzeSlideTextForArchetype(
  slide: SlideData,
  slideIndex: number = 0
): 'metric' | 'compare' | 'code' | 'row' | 'number' {
  const title = (slide.enTitle || '').trim();
  const body = (slide.enBody || '').trim();
  const arTitle = (slide.arTitle || '').trim();
  const arBody = (slide.arBody || '').trim();
  const arText = `${arTitle} ${arBody}`;
  const fullText = `${title} ${body} ${arText}`;

  let scores: Record<'metric' | 'compare' | 'code' | 'row' | 'number', number> = {
    code: 0,
    compare: 0,
    metric: 0,
    number: 0,
    row: 1, // baseline fallback
  };

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

  // 5. Row (Mechanism / Architecture Schematic) signals
  if (
    /\b(?:architecture|pipeline|topology|workflow|mechanism|diagram|cluster|isolation|routing|traversal|layer|stack|mesh)\b/i.test(
      fullText
    ) ||
    /آلية|معمارية|شبكة|طبقات|مسار|عزل/.test(arText)
  ) {
    scores.row += 2;
  }

  // Pick the highest-scoring archetype (tie-breaking order: code > compare > metric > number > row)
  const candidates: Array<'code' | 'compare' | 'metric' | 'number' | 'row'> = [
    'code',
    'compare',
    'metric',
    'number',
    'row',
  ];
  let best: 'code' | 'compare' | 'metric' | 'number' | 'row' = 'row';
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
  metricValue: string;
  metricLabel: string;
  metricDiff: string;
  metricIcon: string;
  // Code
  codeFileName: string;
  codeLanguage: string;
  codeSnippet: string;
  // Compare
  compareLeftTitle: string;
  compareLeftBody: string;
  compareRightTitle: string;
  compareRightBody: string;
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
  const phrases = extractKeyPhrasesFromSlide(slide);

  const recommendedArchetype = inferBestSlideArchetype(slide, slideIndex);
  const recommendedVariant = inferBestDiagramVariant(slide);
  const activeVariant: DiagramVariant =
    !forceRefresh && slide.diagramVariant ? slide.diagramVariant : recommendedVariant;

  const isFinancialOrMacro =
    /\$|\b(?:valuation|billion|trillion|loss|losses|deficit|capital|financing|circular|subsid|taxpayer|retiree|s&p|pension|401k|revenue|spend|spent|cash[- ]?out|stake|economy|economic|inflation|energy\s+bill|gigawatt|nuclear|market|investor|debt|financial)\b|مليار|تريليون|خسائر|تمويل|تقييم|ضرائب|متقاعد|طاقة|اقتصاد|استثمار/i.test(
      lower
    );

  // 1. HUB DEFAULTS
  const centerIcon =
    !forceRefresh && slide.centerIcon && slide.centerIcon !== 'gitMerge'
      ? slide.centerIcon
      : matchedIcons[0] || (isFinancialOrMacro ? 'dollarSign' : 'cpu');

  const derivedCenterTag = (() => {
    if (isFinancialOrMacro) return 'CAPITAL & ECONOMICS';
    if (/security|breach|threat|permission|اختراق|أمن/.test(lower)) return 'SECURITY CORE';
    if (/ai|agent|llm|model|ذكاء/.test(lower)) return 'AI GOVERNANCE';
    if (/vector|embedding|hnsw|search|متجهات/.test(lower)) return 'VECTOR ENGINE';
    if (/database|sql|storage|cache|بيانات/.test(lower)) return 'DATA ENGINE';
    if (/cloud|kubernetes|docker|mesh|سحابة/.test(lower)) return 'CLUSTER MESH';
    return phrases[0] ? phrases[0].toUpperCase().slice(0, 18) : 'SYSTEM CORE';
  })();

  const centerTag =
    !forceRefresh && slide.centerTag && slide.centerTag.trim() && slide.centerTag !== 'SYSTEM CORE'
      ? slide.centerTag
      : derivedCenterTag;

  const hasCustomSatLabels =
    !forceRefresh &&
    slide.satLabels &&
    slide.satLabels.length >= 2 &&
    !slide.satLabels.every((l) => isGenericPlaceholderValue(l));

  const satLabels = hasCustomSatLabels
    ? slide.satLabels!
    : phrases.slice(0, 6).map((p) => p.toUpperCase().slice(0, 16));

  const defaultSatIcons = ['server', 'database', 'gauge', 'users', 'robot', 'gitMerge'];
  const isDefaultSatIcons =
    !slide.satIcons ||
    slide.satIcons.length === 0 ||
    slide.satIcons.every((ic, idx) => ic === defaultSatIcons[idx]);

  const satIcons =
    !forceRefresh && !isDefaultSatIcons && slide.satIcons
      ? slide.satIcons
      : Array.from({ length: Math.max(satLabels.length, 6) }, (_, i) => matchedIcons[(i + 1) % matchedIcons.length] || matchedIcons[0]);

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

  const diagramNodes: DiagramNode[] = hasCustomNodes
    ? slide.diagramNodes!.slice(0, 3).map((n, i) => ({
        label: n.label || phrases[i] || `Stage 0${i + 1}`,
        sublabel: !isGenericPlaceholderValue(n.sublabel) ? n.sublabel : variantMeta.subs[i],
        status: n.status || variantMeta.statuses[i],
        icon: n.icon || matchedIcons[i % matchedIcons.length] || defaultNodeIcons[i],
      }))
    : [0, 1, 2].map((i) => ({
        label: phrases[i] || `Component 0${i + 1}`,
        sublabel: variantMeta.subs[i],
        status: variantMeta.statuses[i],
        icon: matchedIcons[i % matchedIcons.length] || defaultNodeIcons[i],
      }));

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

  // 4. METRIC ARCHETYPE DEFAULTS
  const extractedMetric = (() => {
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
    const techMetric = fullText.match(/\b(\d+(?:\.\d+)?\s*(?:x|%|ms|μs|ns|GB|MB|TB|rps|req\/s))\b/i);
    if (techMetric) {
      return techMetric[1].replace(/\s+/g, '');
    }
    return isFinancialOrMacro ? '$1.4T' : '10x';
  })();

  const isNegativeContext = /breach|loss|losses|deficit|burn|debt|inflation|spike|hack|threat|risk|drop|latency spike|error|vulnerability|خسائر|عجز|تضخم|اختراق|مخاطر|تهديد/i.test(
    lower
  );

  const metricValue =
    !forceRefresh && slide.metricValue && slide.metricValue !== '0.4ms' && slide.metricValue !== '10x'
      ? slide.metricValue
      : extractedMetric;

  const metricLabel =
    !forceRefresh && slide.metricLabel && slide.metricLabel !== 'p99 Latency' && slide.metricLabel !== 'PERFORMANCE MULTIPLIER'
      ? slide.metricLabel
      : `${(phrases[0] || (isFinancialOrMacro ? 'CAPITAL' : 'SYSTEM')).toUpperCase()} ${isNegativeContext ? 'EXPOSURE METRIC' : 'SCALE METRIC'}`;

  const metricDiff =
    !forceRefresh && slide.metricDiff && slide.metricDiff !== '▲ 94% faster'
      ? slide.metricDiff
      : isNegativeContext
      ? `▼ High ${phrases[1] || (isFinancialOrMacro ? 'Financial' : 'Security')} Exposure`
      : `▲ Verified ${phrases[0] || (isFinancialOrMacro ? 'Capital' : 'Architecture')} Scale`;

  const metricIcon =
    !forceRefresh && slide.metricIcon && slide.metricIcon !== 'zap'
      ? slide.metricIcon
      : matchedIcons[0] || (isFinancialOrMacro ? 'dollarSign' : 'zap');

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

  return {
    recommendedArchetype,
    recommendedVariant,
    centerIcon,
    centerTag,
    satLabels,
    satIcons,
    diagramVariant: activeVariant,
    diagramNodes,
    diagramEdges,
    diagramFooter,
    stepNumber,
    stepLabel,
    numberIcon,
    metricValue,
    metricLabel,
    metricDiff,
    metricIcon,
    codeFileName,
    codeLanguage,
    codeSnippet,
    compareLeftTitle,
    compareLeftBody,
    compareRightTitle,
    compareRightBody,
  };
}

/**
 * Deck-Wide Dynamic Archetype & Graphic Diversifier:
 * Analyzes Slides 2 through N-1 and assigns a rich variety of visual archetypes
 * (`compare`, `code`, `metric`, `number`, and non-repeating `row` diagramVariants)
 * while seeding content-specific nodes, comparisons, metrics, and code snippets from each slide's copy.
 */
export function diversifyDeckArchetypesAndVisuals(slides: SlideData[]): SlideData[] {
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

  return slides.map((slide, idx) => {
    // Keep Slide 1 as Hub and Last Slide as CTA (with refreshed smart visuals if generic)
    if (idx === 0) {
      const smartHub = resolveSmartSlideVisuals(slide, 0, true);
      return {
        ...slide,
        type: 'hub',
        centerIcon: smartHub.centerIcon,
        centerTag: smartHub.centerTag,
        satLabels: smartHub.satLabels,
        satIcons: smartHub.satIcons,
      };
    }

    if (idx === slides.length - 1 && slide.type === 'cta') {
      return slide;
    }

    // Preserve explicit custom images/videos
    if (slide.type === 'image' && (slide.imageUrl || slide.videoUrl)) {
      return slide;
    }

    // Penultimate slide: Takeaway / Trade-off schematic
    if (idx === slides.length - 2 && slides.length >= 5) {
      const smartTakeaway = resolveSmartSlideVisuals(
        { ...slide, type: 'row', diagramVariant: 'takeaway' },
        idx,
        true
      );
      return {
        ...slide,
        type: 'row',
        diagramVariant: 'takeaway',
        diagramNodes: smartTakeaway.diagramNodes,
        diagramEdges: smartTakeaway.diagramEdges,
        diagramFooter: smartTakeaway.diagramFooter,
      };
    }

    let targetType: SlideType = analyzeSlideTextForArchetype(slide, idx);

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

    if (targetType === 'compare') usedCompare = true;
    if (targetType === 'code') usedCode = true;
    if (targetType === 'metric') usedMetric = true;

    const chosenVariant =
      targetType === 'row'
        ? inferBestDiagramVariant(slide) !== 'topology'
          ? inferBestDiagramVariant(slide)
          : variantRotation[variantCursor++ % variantRotation.length]
        : undefined;

    const smart = resolveSmartSlideVisuals(
      {
        ...slide,
        type: targetType,
        diagramVariant: chosenVariant || slide.diagramVariant,
      },
      idx,
      true
    );

    if (targetType === 'compare') {
      return {
        ...slide,
        type: 'compare',
        compareLeftTitle: smart.compareLeftTitle,
        compareLeftBody: smart.compareLeftBody,
        compareRightTitle: smart.compareRightTitle,
        compareRightBody: smart.compareRightBody,
      };
    }

    if (targetType === 'code') {
      return {
        ...slide,
        type: 'code',
        codeFileName: smart.codeFileName,
        codeLanguage: smart.codeLanguage,
        codeSnippet: smart.codeSnippet,
      };
    }

    if (targetType === 'metric') {
      return {
        ...slide,
        type: 'metric',
        metricValue: smart.metricValue,
        metricLabel: smart.metricLabel,
        metricDiff: smart.metricDiff,
        metricIcon: smart.metricIcon,
      };
    }

    if (targetType === 'number') {
      return {
        ...slide,
        type: 'number',
        stepNumber: smart.stepNumber,
        stepLabel: smart.stepLabel,
        centerIcon: smart.numberIcon,
      };
    }

    return {
      ...slide,
      type: 'row',
      diagramVariant: chosenVariant || smart.diagramVariant,
      diagramNodes: smart.diagramNodes,
      diagramEdges: smart.diagramEdges,
      diagramFooter: smart.diagramFooter,
    };
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
  const isHook = slideIndex === 0 && slide.type === 'hub';
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

  return {
    ...slide,
    enTitle: fittedEnTitle || slide.enTitle,
    arTitle: fittedArTitle || slide.arTitle,
    enBody: fittedEnBody || slide.enBody,
    arBody: fittedArBody || slide.arBody,
  };
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
  if (slide.type === 'cta') return slide;
  const smart = resolveSmartSlideVisuals(slide, slideIndex, true);
  return {
    ...slide,
    diagramVariant: slide.diagramVariant || smart.diagramVariant,
    diagramNodes: smart.diagramNodes,
    diagramEdges: smart.diagramEdges,
    diagramFooter: smart.diagramFooter,
    compareLeftTitle: smart.compareLeftTitle,
    compareLeftBody: smart.compareLeftBody,
    compareRightTitle: smart.compareRightTitle,
    compareRightBody: smart.compareRightBody,
    codeFileName: smart.codeFileName,
    codeLanguage: smart.codeLanguage,
    codeSnippet: smart.codeSnippet,
    metricValue: smart.metricValue,
    metricLabel: smart.metricLabel,
    metricDiff: smart.metricDiff,
    metricIcon: smart.metricIcon,
    stepNumber: smart.stepNumber,
    stepLabel: smart.stepLabel,
    centerIcon: smart.centerIcon,
    centerTag: smart.centerTag,
    satLabels: smart.satLabels,
    satIcons: smart.satIcons,
  };
}

/**
 * Zero-Click Deck Finalizer:
 * Automatically diversifies Slides 2–7 across archetypes & 9 schematic variants,
 * synchronizes every slide's graphic elements from its copy, and auto-fits
 * all bilingual headlines and body text to mobile character limits.
 */
export function autoFinalizeCarouselDeck(deck: CarouselData): CarouselData {
  const isSingle = deck.postFormat === 'single' || (deck.slides || []).length === 1;
  const rawSlides = deck.slides || [];
  const diversified =
    !isSingle && rawSlides.length > 2
      ? diversifyDeckArchetypesAndVisuals(rawSlides)
      : rawSlides;

  const finalizedSlides = diversified.map((slide, idx) => {
    const fitted = autoFitSlideCopyToLimits(slide, idx, isSingle);
    return autoSyncSlideGraphicsFromCopy(fitted, idx);
  });

  return {
    ...deck,
    slides: finalizedSlides,
  };
}


