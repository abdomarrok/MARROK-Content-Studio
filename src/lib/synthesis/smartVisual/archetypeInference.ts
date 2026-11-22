import type { DiagramVariant, SlideData, SlideType } from '../../../types.ts';
import { isPlaceholderOrEmptyBrandValue } from '../../bundledTechSvgs.ts';
import { detectStrongVisualSpecKind, explainVisualSpecChoice } from '../visualSpecBuilder.ts';
import { isGenericPlaceholderValue } from './constants.ts';
import { detectSubjectPairFromText } from './subjectPairDetection.ts';
import { extractKeyPhrasesFromSlide } from './textIcons.ts';

/**
 * Heuristic analysis of a slide's headline and body copy to assign the most appropriate
 * content archetype among Metric, Compare, Code, Row, Number, or Subject Pair.
 */
export function analyzeSlideTextForArchetype(
  slide: SlideData,
  slideIndex: number = 0,
  options?: { ignoreCurrentType?: boolean }
): 'metric' | 'compare' | 'code' | 'row' | 'number' | 'subjectPair' | 'visual' {
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

  // Respect explicit AI/user 'visual' slide unless caller requested fresh re-evaluation
  if (!options?.ignoreCurrentType && slide.type === 'visual' && slide.visualSpec?.kind) {
    return 'visual';
  }
  const strongVisualKind = detectStrongVisualSpecKind(slide, {
    ignoreCurrentType: options?.ignoreCurrentType,
  });
  if (strongVisualKind && !(pair && slideIndex === 0)) {
    const hasExplicitCodeSyntax =
      /\b(?:SELECT\s+.+\s+FROM|EXPLAIN\s+ANALYZE|CREATE\s+INDEX|docker\s+run|kubectl\s+apply|async\s+fn|function\s+\w+|const\s+\w+\s*=|import\s+.+\s+from)\b/i.test(
        fullText
      );
    if (!hasExplicitCodeSyntax) {
      return 'visual';
    }
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
    /\b(?:benchmark|p99|p95|throughput|latency\s+drop|cost\s+reduction|cut\s+spend|valuation|loss|deficit|cash[- ]?out)\b/i.test(
      fullText
    )
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
  _totalSlides: number = 8
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

  const isCybersecuritySlide =
    /\b(?:cve-\d{4}-\d+|vulnerability|zero[- ]?day|exploit|remote\s+code\s+execution|\brce\b|cvss|sandbox|privilege\s+escalation|payload|malicious|java4shell|log4shell|shellshock|openjdk|patch\s+now|unpatched)\b|security|breach|hack|threat|isolation|isolate|blast\s+radius|firewall|boundary|guard|permission|scope\s+creep|zero[- ]?trust|auth|ثغرة|اختراق|أمن|عزل|صلاحيات|مخاطر/.test(
      text
    );

  if (isCybersecuritySlide) {
    return 'isolation';
  }
  if (/hnsw|skip[- ]?list|graph|hierarchy|traversal|hops\b|mesh|routing|رسم بياني|شبكة/.test(text)) {
    return 'graph';
  }
  if (/ivf|cluster|k-means|centroid|partition|shard|quorum|region|bucket|تجميع|تقسيم/.test(text)) {
    return 'clusters';
  }
  if (
    /hot\s*\/?\s*cold|hot\s+ram|cold\s+nvme|lsm[- ]?tree|compaction|cache\s+vs|ram\s+vs|dual\s+store|write[- ]?ahead|memtable|sstable|تخزين\s+ساخن|ذاكرة\s+مؤقتة/.test(
      text
    ) ||
    (/\b(?:write|buffer|replication)\b/.test(text) && /\b(?:storage|disk|database|index|wal|cache)\b/.test(text))
  ) {
    return 'split';
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
    const hasMeasuredBenchmark =
      /\b\d+(?:\.\d+)?\s*(?:%|x|ms|μs|ns|s|GB|MB|TB|KB|GW|rps|req\/s|qps)\b|\$\s*\d/i.test(fullText);
    return hasMeasuredBenchmark ? 'BENCHMARK' : 'ARCHITECTURE';
  }
  return 'ARCHITECTURE';
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
    const left =
      slide.compareLeftTitle && !isPlaceholderOrEmptyBrandValue(slide.compareLeftTitle)
        ? slide.compareLeftTitle
        : concreteTerms[0];
    const right =
      slide.compareRightTitle && !isPlaceholderOrEmptyBrandValue(slide.compareRightTitle)
        ? slide.compareRightTitle
        : concreteTerms[1];
    if (left && right) {
      return `Picked Compare side-by-side layout contrasting "${left}" vs "${right}" from source (not a two-system migration of named software products).`;
    }
    return `Picked Compare side-by-side layout for ${quotedTermsStr} to contrast architectural trade-offs.`;
  }
  if (type === 'metric') {
    const m = fullText.match(
      /(?:\$\d[\d,.]*[KMBTkmbt]?|\b\d+(?:\.\d+)?\s*(?:%|x|X|ms|µs|ns|KB|MB|GB|TB|GW|rps|req\/s)\b)/i
    );
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
  if (type === 'visual') {
    return explainVisualSpecChoice(slide);
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
