import type {
  CoverStyle,
  DiagramVariant,
  PostFormat,
  SlideData,
  SlideType,
  VisualSpecKind,
} from '../../types.ts';
import { isPlaceholderOrEmptyBrandValue } from '../bundledTechSvgs.ts';
import { seedSlideArchetypeData } from './archetypes.ts';
import { deriveCoverTeaserForSlide } from './hookTier.ts';
import {
  analyzeSlideTextForArchetype,
  deriveSlideCornerTag,
  detectSubjectPairFromText,
  inferBestDiagramVariant,
  isGenericPlaceholderValue,
  resolveSmartSlideVisuals,
} from './smartVisualDefaults.ts';
import {
  deriveVisualSpecFromSlide,
  extractNumericMentions,
  scoreVisualSpecKinds,
  VISUAL_SPEC_KIND_LABELS,
} from './visualSpecBuilder.ts';

export interface CoverStyleOption {
  id: CoverStyle;
  label: string;
  shortDesc: string;
  focalSlideType: SlideType;
}

export const COVER_STYLE_OPTIONS: CoverStyleOption[] = [
  {
    id: 'headline-hero',
    label: 'Headline Hero',
    shortDesc: 'Oversized hook headline + editorial focal card',
    focalSlideType: 'visual',
  },
  {
    id: 'metric-split',
    label: 'Metric Split',
    shortDesc: 'Hook headline + real measured KPI card',
    focalSlideType: 'metric',
  },
  {
    id: 'versus-hook',
    label: 'Versus Hook',
    shortDesc: 'Bold thesis + Before/After split contrast',
    focalSlideType: 'compare',
  },
  {
    id: 'visual-teaser',
    label: 'Visual Teaser',
    shortDesc: 'Hook + schematic, chart, or brand pair',
    focalSlideType: 'row',
  },
];

function hasRealNumericEvidenceForCover(slide: SlideData, deckSlides: SlideData[] = []): boolean {
  if (slide.metricValue && /\d/.test(slide.metricValue)) return true;
  const combined = `${slide.enTitle || ''} ${slide.coverTeaserEn || ''} ${slide.enBody || ''} ${deckSlides[1]?.enTitle || ''} ${deckSlides[1]?.enBody || ''}`;
  if (extractNumericMentions(combined).length >= 1) return true;
  return /(?:\$\s*\d+|\b\d+(?:[.,]\d+)?\s*(?:%|x|X|ms|μs|ns|KB|MB|GB|TB|GW|rps|req\/s)\b)/i.test(combined);
}

export function resolveSlide1CoverStyle(
  slide: SlideData,
  deckSlides: SlideData[] = []
): CoverStyle {
  if (slide.coverStyle) {
    const style = slide.coverStyle;
    const isCompatible =
      (style === 'versus-hook' && slide.type === 'compare') ||
      (style === 'metric-split' &&
        (slide.type === 'metric' || (slide.type === 'visual' && slide.visualSpec?.kind === 'callout'))) ||
      (style === 'headline-hero' &&
        (slide.type === 'visual' || slide.type === 'number' || slide.type === 'hub' || slide.type === 'cta')) ||
      (style === 'visual-teaser' &&
        (slide.type === 'row' ||
          slide.type === 'subjectPair' ||
          slide.type === 'code' ||
          slide.type === 'image' ||
          slide.type === 'visual'));
    if (isCompatible) return style;
  }
  const text = `${slide.enTitle || ''} ${slide.coverTeaserEn || ''} ${slide.enBody || ''}`.trim();
  if (
    slide.type === 'subjectPair' ||
    slide.subjectPair ||
    (slide.type === 'visual' && slide.visualSpec?.kind && slide.visualSpec.kind !== 'callout') ||
    slide.type === 'code' ||
    slide.type === 'row'
  ) {
    return 'visual-teaser';
  }
  if (
    slide.type === 'compare' ||
    /\b(?:vs\.?|versus|instead\s+of|rather\s+than|before\s+and\s+after)\b/i.test(text)
  ) {
    return 'versus-hook';
  }
  if (slide.type === 'metric' && hasRealNumericEvidenceForCover(slide, deckSlides)) {
    return 'metric-split';
  }
  if (hasRealNumericEvidenceForCover(slide, []) && !slide.hookClaimCard) {
    return 'metric-split';
  }
  return 'headline-hero';
}

export function applyCoverStyleToSlide(
  slide: SlideData,
  coverStyle: CoverStyle,
  slideIndex: number = 0,
  totalSlides: number = 8,
  lockLayout: boolean = true,
  deckSlides: SlideData[] = []
): SlideData {
  const isMultiCover = slideIndex === 0 && totalSlides > 1 && !slide.standaloneMeme;
  const teasers = isMultiCover ? deriveCoverTeaserForSlide(slide, deckSlides) : undefined;
  const hasRealNum = hasRealNumericEvidenceForCover(slide, deckSlides);

  let working: SlideData = {
    ...slide,
    coverStyle,
    storyRole: isMultiCover ? 'hook' : slide.storyRole,
    compositionPreset: 'headline-first',
    showSwipeCue: isMultiCover ? (slide.showSwipeCue ?? true) : slide.showSwipeCue,
    ...(teasers ? teasers : {}),
    ...(isMultiCover ? { enBody: '', arBody: '' } : {}),
  };

  let rationale = '';

  if (coverStyle === 'metric-split') {
    if (hasRealNum) {
      const explicitMetricValue = working.metricValue && /\d/.test(working.metricValue) ? working.metricValue : undefined;
      const explicitMetricLabel = working.metricLabel?.trim() || undefined;
      const explicitMetricDiff = working.metricDiff?.trim() || undefined;
      working = seedSlideArchetypeData(working, 'metric', slideIndex, true);
      if (explicitMetricValue) working.metricValue = explicitMetricValue;
      if (explicitMetricLabel) working.metricLabel = explicitMetricLabel;
      if (explicitMetricDiff) working.metricDiff = explicitMetricDiff;
      rationale = 'Metric Split cover — pairs headline hook with verified quantitative stat';
    } else {
      const claimText = working.hookClaimCard?.statement || teasers?.coverTeaserEn || working.enTitle || 'Core architectural shift';
      working = {
        ...working,
        type: 'visual',
        visualSpec: {
          kind: 'callout',
          calloutStyle: 'quote',
          eyebrow: working.hookKicker || 'KEY THESIS',
          quote: claimText,
          source: working.enCredit ? working.enCredit.replace(/^Source:\s*/i, '') : undefined,
        },
      };
      rationale = 'Metric Split skipped synthetic numbers — framed verified claim card cleanly';
    }
  } else if (coverStyle === 'versus-hook') {
    working = seedSlideArchetypeData(working, 'compare', slideIndex, true);
    rationale = 'Versus Hook cover — contrasts old vs target architecture below hook';
  } else if (coverStyle === 'visual-teaser') {
    const fullText = `${working.enTitle || ''} ${working.coverTeaserEn || ''} ${working.enBody || ''}`;
    const pair = detectSubjectPairFromText(fullText, working);
    if (pair) {
      working = seedSlideArchetypeData({ ...working, subjectPair: pair }, 'subjectPair', slideIndex, true);
      rationale = `Visual Teaser cover — previews ${pair.beforeSystem} -> ${pair.afterSystem}`;
    } else {
      const vScores = scoreVisualSpecKinds(working);
      const bestNonCallout = (['bar-chart', 'sequence', 'timeline', 'matrix', 'table'] as const)
        .map((kind) => ({ kind, score: vScores[kind].score }))
        .sort((a, b) => b.score - a.score)[0];
      if (bestNonCallout && bestNonCallout.score >= 10) {
        working = {
          ...working,
          type: 'visual',
          visualSpec: deriveVisualSpecFromSlide(working, bestNonCallout.kind, slideIndex),
        };
        rationale = `Visual Teaser cover — previews ${bestNonCallout.kind} visual under hook`;
      } else {
        const variant = inferBestDiagramVariant(working);
        working = seedSlideArchetypeData({ ...working, diagramVariant: variant }, 'row', slideIndex, true);
        rationale = `Visual Teaser cover — previews ${variant} schematic under hook`;
      }
    }
  } else {
    // 'headline-hero'
    const quoteBody =
      working.hookClaimCard?.statement ||
      teasers?.coverTeaserEn ||
      'Architectural reality behind production systems.';
    working = {
      ...working,
      type: 'visual',
      visualSpec: {
        kind: 'callout',
        calloutStyle: 'quote',
        eyebrow: working.hookKicker || 'COVER THESIS',
        quote: quoteBody,
        source: working.enCredit ? working.enCredit.replace(/^Source:\s*/i, '') : undefined,
      },
    };
    rationale = 'Headline Hero cover — oversized display hook above clean thesis callout';
  }

  working.cornerTag = working.cornerTag || deriveSlideCornerTag(working, slideIndex, Math.max(1, totalSlides));
  working.layoutRationale = lockLayout ? `Manual Cover (${rationale})` : `Auto-picked ${rationale}`;
  working.manualLayoutLocked = lockLayout;
  return working;
}

export interface LayoutCatalogDescriptor {
  id: string;
  label: string;
  slideType: SlideType;
  diagramVariant?: DiagramVariant;
  visualKind?: VisualSpecKind;
}

export const LAYOUT_CATALOG_DESCRIPTORS: LayoutCatalogDescriptor[] = [
  { id: 'visual:bar-chart', label: 'Bar & Latency Chart', slideType: 'visual', visualKind: 'bar-chart' },
  { id: 'metric', label: 'Hero Metric', slideType: 'metric' },
  { id: 'visual:matrix', label: '2×2 Trade-off Matrix', slideType: 'visual', visualKind: 'matrix' },
  { id: 'visual:table', label: 'Comparison Table', slideType: 'visual', visualKind: 'table' },
  { id: 'row:topology', label: 'Topology Flow', slideType: 'row', diagramVariant: 'topology' },
  { id: 'row:stack', label: 'Layered Stack', slideType: 'row', diagramVariant: 'stack' },
  { id: 'row:isolation', label: 'Isolation Grid', slideType: 'row', diagramVariant: 'isolation' },
  { id: 'visual:sequence', label: 'Sequence Diagram', slideType: 'visual', visualKind: 'sequence' },
  { id: 'visual:timeline', label: 'Incident Timeline', slideType: 'visual', visualKind: 'timeline' },
  { id: 'hub', label: 'Hub Architecture', slideType: 'hub' },
  { id: 'subjectPair', label: 'Subject Pair', slideType: 'subjectPair' },
  { id: 'row:split', label: 'Hot / Cold Split', slideType: 'row', diagramVariant: 'split' },
  { id: 'row:features', label: '3 Feature Cards', slideType: 'row', diagramVariant: 'features' },
  { id: 'row:takeaway', label: 'Key Takeaway Flow', slideType: 'row', diagramVariant: 'takeaway' },
  { id: 'row:graph', label: 'HNSW Skip-Graph', slideType: 'row', diagramVariant: 'graph' },
  { id: 'row:clusters', label: 'IVF Clusters', slideType: 'row', diagramVariant: 'clusters' },
  { id: 'row:scatter', label: 'Vector Scatter', slideType: 'row', diagramVariant: 'scatter' },
  { id: 'poster', label: 'Poster', slideType: 'poster' },
  { id: 'compare', label: 'Compare', slideType: 'compare' },
  { id: 'code', label: 'Code Diff', slideType: 'code' },
  { id: 'number', label: 'Number', slideType: 'number' },
  { id: 'visual:callout', label: 'Editorial Callout', slideType: 'visual', visualKind: 'callout' },
  { id: 'cta', label: 'CTA', slideType: 'cta' },
  { id: 'image', label: 'Meme / Image', slideType: 'image' },
  { id: 'visual:svg', label: 'Custom SVG Blueprint', slideType: 'visual', visualKind: 'svg' },
];

export interface RankedSlideLayout extends LayoutCatalogDescriptor {
  score: number;
  rationale: string;
}

export function findCatalogDescriptor(id: string): LayoutCatalogDescriptor | undefined {
  return LAYOUT_CATALOG_DESCRIPTORS.find((d) => d.id === id);
}

export function getSlideCatalogId(
  slide: SlideData,
  fallbackVariant?: DiagramVariant
): string {
  if (slide.type === 'visual') {
    const kind = slide.visualSpec?.kind || 'bar-chart';
    return `visual:${kind}`;
  }
  if (slide.type === 'row') {
    return `row:${slide.diagramVariant || fallbackVariant || 'topology'}`;
  }
  return slide.type || 'row:topology';
}

export function isWeakOrPlaceholderVisual(
  slide: SlideData,
  deckSlides: SlideData[] = [],
  slideIndex: number = 0
): boolean {
  if (slideIndex === 0 && deckSlides.length > 1 && slide.type === 'hub') {
    return true;
  }

  if (slide.type === 'subjectPair') {
    const pair = slide.subjectPair;
    if (
      !pair ||
      isPlaceholderOrEmptyBrandValue(pair.beforeSystem) ||
      isPlaceholderOrEmptyBrandValue(pair.afterSystem)
    ) {
      return true;
    }
  }

  if (slide.type === 'visual') {
    const spec = slide.visualSpec;
    if (!spec || !spec.kind) return true;
    if (spec.kind === 'bar-chart') {
      const bars = spec.bars || [];
      if (bars.length < 2) return true;
      const isGenericPlaceholderBars =
        bars.length === 2 &&
        bars[0]?.value === 75 &&
        bars[1]?.value === 25 &&
        /High/i.test(bars[0]?.displayValue || '') &&
        /Low/i.test(bars[1]?.displayValue || '');
      if (isGenericPlaceholderBars) return true;
    }
  }

  if (slide.type === 'metric') {
    if (!slide.metricValue || isGenericPlaceholderValue(slide.metricValue)) {
      return true;
    }
    if (slide.metricLabel && isPlaceholderOrEmptyBrandValue(slide.metricLabel)) {
      return true;
    }
  }

  if (slide.type === 'compare') {
    if (
      !slide.compareLeftTitle ||
      !slide.compareRightTitle ||
      isPlaceholderOrEmptyBrandValue(slide.compareLeftTitle) ||
      isPlaceholderOrEmptyBrandValue(slide.compareRightTitle)
    ) {
      return true;
    }
  }

  if (slide.type === 'code') {
    if (!slide.codeSnippet || slide.codeSnippet.trim().length < 8) {
      return true;
    }
  }

  if (slide.type === 'row') {
    const nodes = slide.diagramNodes || [];
    if (
      nodes.length < 3 ||
      nodes.some((n) => !n?.label || isGenericPlaceholderValue(n.label) || isPlaceholderOrEmptyBrandValue(n.label))
    ) {
      return true;
    }
    const prevSlide = slideIndex > 0 ? deckSlides[slideIndex - 1] : undefined;
    if (prevSlide && getSlideCatalogId(prevSlide) === getSlideCatalogId(slide)) {
      return true;
    }
  }

  return false;
}

/**
 * Unified 25-layout deck-aware scorer.
 * Drives both default-on Auto-Layout and VisualGalleryPicker recommendations so they never disagree.
 */
export function rankSlideLayoutsForDeck(
  slide: SlideData,
  deckSlides: SlideData[],
  slideIndex: number,
  options?: {
    postFormat?: PostFormat;
    excludeIds?: string[];
  }
): RankedSlideLayout[] {
  const safeDeck = deckSlides && deckSlides.length > 0 ? deckSlides : [slide];
  const totalSlides = safeDeck.length;
  const isMultiSlide =
    totalSlides > 1 || slideIndex > 0 || options?.postFormat === 'carousel';
  const isSlide1 = slideIndex === 0;
  const isLastSlide = totalSlides > 1 && slideIndex === totalSlides - 1;
  const isPenultimate = totalSlides > 1 && slideIndex === totalSlides - 2;
  const hasMedia = Boolean(slide.imageUrl || slide.videoUrl);
  const excludeSet = new Set(options?.excludeIds || []);

  const title = (slide.enTitle || '').trim();
  const body = (slide.enBody || '').trim();
  const arTitle = (slide.arTitle || '').trim();
  const arBody = (slide.arBody || '').trim();
  const arText = `${arTitle} ${arBody}`.trim();
  const fullText = `${title} ${body} ${arText}`.trim();

  const visualScores = scoreVisualSpecKinds(slide);
  const verifiedPair = detectSubjectPairFromText(fullText, slide);
  const numericMentions = extractNumericMentions(`${title} ${body}`);
  const preferredVariant = inferBestDiagramVariant(slide);
  const heuristicArchetype = analyzeSlideTextForArchetype(slide, slideIndex, {
    ignoreCurrentType: true,
  });

  const hasExplicitCodeSyntax =
    /\b(?:SELECT\s+.+\s+FROM|EXPLAIN\s+ANALYZE|CREATE\s+INDEX|docker\s+run|kubectl\s+apply|async\s+fn|function\s+\w+|const\s+\w+\s*=|let\s+\w+\s*=|import\s+.+\s+from|curl\s+-X|git\s+commit|npm\s+run|cargo\s+build)\b/i.test(
      fullText
    );
  const hasCodeKeywords =
    /\b(?:\w+\.(?:yaml|yml|json|sql|ts|tsx|rs|py|go|sh|toml)|code\s+diff|code\s+snippet|sql\s+query|cli\s+command|config\s+file|terminal\s+command)\b/i.test(
      fullText
    ) ||
    /كود\s+برمجي|مقتطف\s+كود|سطر\s+الأوامر|استعلام\s+SQL|ملف\s+إعدادات/i.test(arText);
  const hasCompareCue =
    /\b(?:vs\.?|versus|compared\s+to|instead\s+of|rather\s+than|before\s+and\s+after|before\s+vs|legacy\s+vs|monolith\s+vs|traditional\s+vs|trade-?off\s+between|difference\s+between|pros\s+and\s+cons)\b/i.test(
      fullText
    ) || /مقارنة\s+بين|مقابل|بدلاً\s+من|قبل\s+وبعد|الفرق\s+بين/.test(arText);
  const hasStepCue =
    /^(?:step|stage|phase|rule|principle|layer|pillar|#?\d+[.):\s-]|first\s+principle|second\s+stage|third\s+stage|first\s+step|second\s+step|third\s+step)/i.test(
      title
    ) ||
    /^(?:الخطوة|المرحلة|المبدأ|القاعدة|أولاً|ثانياً|ثالثاً|رابعاً|خامساً)/.test(arTitle) ||
    /\b(?:step|stage|phase|rule|principle)\s+#?\d{1,2}\b/i.test(fullText);
  const hasEcosystemHubCue =
    /\b(?:ecosystem|satellites?|plugins?|orchestrat(?:e|or|ion)|control\s+plane|hub|spoke|connected\s+services|federat(?:ed|ion))\b/i.test(
      fullText
    );
  const hasSchematicCue =
    /\b(?:how\s+.+\s+works|architecture|pipeline|topology|workflow|mechanism|diagram|cluster|isolation|routing|traversal|layer|stack|mesh|kernel|consensus|quorum|sandbox|shard|cache)\b/i.test(
      fullText
    ) || /آلية|معمارية|شبكة|طبقات|مسار|عزل/.test(arText);

  // Neighbor & Deck Frequency Telemetry
  const neighborIds = new Set<string>();
  const neighborTypes = new Set<SlideType>();
  const deckIdCounts = new Map<string, number>();

  safeDeck.forEach((other, idx) => {
    if (idx === slideIndex) return;
    const otherId = getSlideCatalogId(other);
    deckIdCounts.set(otherId, (deckIdCounts.get(otherId) || 0) + 1);
    if (Math.abs(idx - slideIndex) === 1) {
      neighborIds.add(otherId);
      neighborTypes.add(other.type);
    }
  });

  const prev1Type = slideIndex >= 1 ? safeDeck[slideIndex - 1]?.type : undefined;
  const prev2Type = slideIndex >= 2 ? safeDeck[slideIndex - 2]?.type : undefined;

  const variantReasons: Record<DiagramVariant, string> = {
    topology: '3-stage execution pipeline matches request flow',
    stack: 'layered execution stack matches tiered architecture',
    isolation: 'isolation grid highlights security & blast-radius boundaries',
    split: 'hot/cold split contrasts dual memory and storage paths',
    features: '3-pillar schematic groups parallel system capabilities',
    takeaway: 'architectural verdict summarizes production trade-offs',
    graph: 'skip-graph layout maps hierarchical traversal & hops',
    clusters: 'cluster partition diagram maps sharding & pruning',
    scatter: 'vector scatter plot frames embedding & similarity space',
  };

  const results: RankedSlideLayout[] = LAYOUT_CATALOG_DESCRIPTORS.map((desc) => {
    let score = 0;
    let rationale = desc.label;

    if (desc.slideType === 'cta') {
      if (isLastSlide || slide.type === 'cta') {
        score = 100;
        rationale = 'Closing CTA anchors discussion and source credit';
      } else {
        score = -100;
        rationale = 'Reserved for closing slide';
      }
    } else if (desc.slideType === 'image') {
      if (hasMedia && (slide.type === 'image' || slide.standaloneMeme || options?.postFormat === 'meme')) {
        score = 95;
        rationale = 'Preserves uploaded photo, meme, or video clip';
      } else if (hasMedia) {
        score = 12;
        rationale = 'Frames attached media within safe-zone chrome';
      } else {
        score = -20;
        rationale = 'Requires an uploaded or generated visual asset';
      }
    } else if (desc.slideType === 'poster') {
      if (options?.postFormat === 'single' || slide.type === 'poster') {
        score = 24;
        rationale = `Single-slide poster with ${preferredVariant} schematic & 3 takeaways`;
      } else if (!isMultiSlide && !options?.postFormat) {
        score = 2;
        rationale = 'Compact single-frame brief with takeaways';
      } else {
        score = -12;
        rationale = 'Designed for single-slide poster decks';
      }
    } else if (desc.slideType === 'visual' && desc.visualKind) {
      const vScore = visualScores[desc.visualKind];
      score = vScore.score;
      rationale = vScore.reason;

      // Slide 1 cannot use bare bar chart unless it actually has >= 2 metrics
      if (isSlide1 && isMultiSlide && desc.visualKind === 'bar-chart' && numericMentions.length < 2) {
        score = -30;
      }
    } else if (desc.slideType === 'subjectPair') {
      if (verifiedPair) {
        score = isSlide1 ? 22 : 17;
        rationale = `Verified tool migration: ${verifiedPair.beforeSystem} → ${verifiedPair.afterSystem}`;
      } else {
        score = -100;
        rationale = 'Requires 2 named software/infrastructure products';
      }
    } else if (desc.slideType === 'hub') {
      const hasHubProvenance = Array.isArray(slide.hubNodeReasons) && slide.hubNodeReasons.length > 0;
      if (isSlide1 && isMultiSlide) {
        score = -100;
        rationale = 'Slide 1 uses focused hooks instead of dense hubs';
      } else if (hasHubProvenance) {
        score = hasEcosystemHubCue ? 13 : 7;
        rationale = hasEcosystemHubCue
          ? 'Central core + satellite nodes match ecosystem overview'
          : 'Maps source-verified services around a core system';
      } else {
        score = -35;
        rationale = 'Hub nodes require source-quoted provenance';
      }
    } else if (desc.slideType === 'code') {
      if (hasExplicitCodeSyntax) {
        score = 21;
        rationale = 'Executable SQL, CLI, or code syntax detected';
      } else if (hasCodeKeywords) {
        score = 15;
        rationale = 'Config, schema, or terminal workflow cues detected';
      } else if (slide.codeSnippet && slide.codeSnippet.trim().length > 10 && !isGenericPlaceholderValue(slide.codeFileName)) {
        score = 10;
        rationale = 'Existing technical code snippet matches copy';
      } else {
        score = 1;
        rationale = 'Code diff block for concrete implementation details';
      }
    } else if (desc.slideType === 'metric') {
      const hasStrongNumber =
        numericMentions.length >= 1 ||
        /(?:\$\s*\d+|\b\d+(?:[.,]\d+)?\s*(?:x|%|ms|μs|ns|GW|TB|GB|rps)\b)/i.test(fullText);
      const hasHardTitleMetric = /(?:\$\s*\d+|\b\d+(?:[.,]\d+)?\s*(?:x|%|ms|μs|ns|GW|TB|GB|rps)\b)/i.test(
        title
      );
      if (hasHardTitleMetric && numericMentions.length <= 2) {
        score = 17;
        rationale = `Spotlights headline metric "${numericMentions[0]?.raw || slide.metricValue || ''}"`.trim();
      } else if (hasStrongNumber && numericMentions.length <= 2) {
        score = 14;
        rationale = 'Highlights key quantitative impact figure';
      } else if (numericMentions.length >= 3 && visualScores['bar-chart'].score >= 14) {
        // Defer to bar-chart when >= 3 benchmark measurements exist
        score = 10;
        rationale = 'Single hero stat summary of benchmark results';
      } else if (isSlide1 && slide.hookClaimCard?.statement) {
        score = 8;
        rationale = 'Focused hook claim card on cover slide';
      } else {
        score = -8;
        rationale = 'Needs a concrete numeric measurement';
      }
    } else if (desc.slideType === 'compare') {
      if (hasCompareCue && /\b(?:vs\.?|versus)\b/i.test(title)) {
        score = 16;
        rationale = 'Head-to-head A vs B contrast in headline';
      } else if (hasCompareCue) {
        score = 14;
        rationale = 'Trade-off comparison between legacy and target approaches';
      } else {
        score = 3;
        rationale = 'Two-column architectural contrast card';
      }
    } else if (desc.slideType === 'number') {
      if (hasStepCue) {
        score = 16;
        rationale = 'Numbered step or principle progression detected';
      } else {
        score = 2;
        rationale = 'Sequential numbered engineering step';
      }
    } else if (desc.slideType === 'row' && desc.diagramVariant) {
      const v = desc.diagramVariant;
      score = hasSchematicCue ? 8 : 6;
      if (v === preferredVariant) {
        score += 7;
        rationale = variantReasons[v];
      } else {
        rationale = variantReasons[v];
      }
      if (v === 'takeaway' && isPenultimate) {
        score += 7;
        rationale = 'Penultimate verdict schematic anchors deck wrap-up';
      }
      if (v === 'topology' && isSlide1 && heuristicArchetype === 'row') {
        score += 2;
      }
    }

    // Penalize Slide 1 against weaker/less-visual formats unless explicitly requested
    if (isSlide1 && isMultiSlide) {
      if (desc.slideType === 'number' && !hasStepCue) score -= 6;
      if (desc.id === 'row:takeaway') score -= 6;
    }

    // Deck-wide neighbor diversity penalties (skipped for CTA/Media overrides)
    if (!isLastSlide && desc.slideType !== 'cta') {
      if (neighborIds.has(desc.id)) {
        score -= 9;
      } else if (neighborTypes.has(desc.slideType) && desc.slideType !== 'poster') {
        score -= 3.5;
      }

      if (prev1Type && prev2Type && prev1Type === desc.slideType && prev2Type === desc.slideType) {
        score -= 10;
      }

      const otherCount = deckIdCounts.get(desc.id) || 0;
      if (otherCount > 0) {
        score -= otherCount * 2.5;
      }
    }

    // User session exclusion (for Re-imagine cycling)
    if (excludeSet.has(desc.id)) {
      score -= 1000;
    }

    return {
      ...desc,
      score: Number(score.toFixed(2)),
      rationale,
    };
  });

  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Applies a chosen ranked layout cleanly onto a slide without losing user copy.
 */
export function materializeLayoutForSlide(
  slide: SlideData,
  target: RankedSlideLayout,
  slideIndex: number,
  totalSlides: number,
  options?: {
    rationalePrefix?: string;
    lockLayout?: boolean;
    forceRefreshVisuals?: boolean;
  }
): SlideData {
  const isTypeChange = slide.type !== target.slideType;
  const forceRefresh = Boolean(options?.forceRefreshVisuals || isTypeChange);
  const prefix = options?.rationalePrefix || 'Auto-picked';

  let workingSlide: SlideData = {
    ...slide,
    ...(target.diagramVariant ? { diagramVariant: target.diagramVariant } : {}),
  };

  let materialized = seedSlideArchetypeData(
    workingSlide,
    target.slideType,
    slideIndex,
    forceRefresh
  );

  if (target.slideType === 'row' && target.diagramVariant) {
    const refreshed = resolveSmartSlideVisuals(
      { ...materialized, type: 'row', diagramVariant: target.diagramVariant },
      slideIndex,
      true
    );
    materialized = {
      ...materialized,
      diagramVariant: target.diagramVariant,
      diagramNodes: refreshed.diagramNodes,
      diagramEdges: refreshed.diagramEdges,
      diagramFooter: refreshed.diagramFooter,
    };
  } else if (target.slideType === 'poster' && target.diagramVariant) {
    const refreshed = resolveSmartSlideVisuals(
      { ...materialized, type: 'poster', diagramVariant: target.diagramVariant },
      slideIndex,
      true
    );
    materialized = {
      ...materialized,
      diagramVariant: target.diagramVariant,
      diagramNodes: refreshed.diagramNodes,
      diagramEdges: refreshed.diagramEdges,
      diagramFooter: refreshed.diagramFooter,
    };
  } else if (target.slideType === 'visual' && target.visualKind) {
    const nextSpec = deriveVisualSpecFromSlide(
      { ...materialized, type: 'visual' },
      target.visualKind,
      slideIndex
    );
    materialized = {
      ...materialized,
      type: 'visual',
      visualSpec: nextSpec,
    };
  }

  // Enforce multi-slide Slide 1 Cover Hero defaults when materializing Slide 1 of a deck
  if (totalSlides > 1 && slideIndex === 0 && !materialized.standaloneMeme && target.slideType !== 'poster') {
    materialized.storyRole = 'hook';
    if (!materialized.manualLayoutLocked) {
      materialized.compositionPreset = 'headline-first';
    }
    const inferredStyle: CoverStyle =
      target.slideType === 'metric'
        ? hasRealNumericEvidenceForCover(materialized, []) ? 'metric-split' : 'headline-hero'
        : target.slideType === 'compare'
          ? 'versus-hook'
          : target.slideType === 'subjectPair' || target.slideType === 'code' || target.slideType === 'row' || (target.slideType === 'visual' && target.visualKind !== 'callout')
            ? 'visual-teaser'
            : 'headline-hero';
    materialized.coverStyle = slide.coverStyle || inferredStyle;
    materialized.showSwipeCue = slide.showSwipeCue ?? true;
    const teasers = deriveCoverTeaserForSlide(materialized);
    materialized.coverTeaserEn = materialized.coverTeaserEn || teasers.coverTeaserEn;
    materialized.coverTeaserAr = materialized.coverTeaserAr || teasers.coverTeaserAr;
    materialized.enBody = '';
    materialized.arBody = '';
  }

  materialized.cornerTag =
    slide.cornerTag ||
    deriveSlideCornerTag(materialized, slideIndex, Math.max(1, totalSlides));
  materialized.layoutRationale = `${prefix} ${target.label} — ${target.rationale}`;
  if (options?.lockLayout !== undefined) {
    materialized.manualLayoutLocked = options.lockLayout;
  } else {
    materialized.manualLayoutLocked = false;
  }

  return materialized;
}

/**
 * Evaluates an unlocked slide during live text edits with typing hysteresis so canvas
 * upgrades smoothly when semantics shift cleanly without flickering mid-sentence.
 */
export function evaluateAutoLayoutForSlideEdit(
  currentSlide: SlideData,
  deckSlides: SlideData[],
  slideIndex: number,
  options?: {
    postFormat?: PostFormat;
    hysteresisMargin?: number;
  }
): SlideData | null {
  if (currentSlide.manualLayoutLocked) return null;
  if (currentSlide.type === 'cta') return null;
  if (currentSlide.imageUrl || currentSlide.videoUrl) return null;
  if (currentSlide.standaloneMeme) return null;

  const combinedText = `${currentSlide.enTitle || ''} ${currentSlide.enBody || ''} ${currentSlide.arTitle || ''} ${currentSlide.arBody || ''}`.trim();
  if (combinedText.length < 8) return null;

  const ranked = rankSlideLayoutsForDeck(currentSlide, deckSlides, slideIndex, {
    postFormat: options?.postFormat,
  });
  if (ranked.length === 0) return null;

  const best = ranked[0];
  const currentId = getSlideCatalogId(currentSlide);
  const currentRank = ranked.find((r) => r.id === currentId);
  const margin = options?.hysteresisMargin ?? 3;

  // On Single Slide posters, keep 'poster' and upgrade its internal schematic + rationale
  if (currentSlide.type === 'poster' && best.slideType === 'poster') {
    const preferredVariant = inferBestDiagramVariant(currentSlide);
    if (preferredVariant !== currentSlide.diagramVariant || !currentSlide.layoutRationale) {
      const updatedPoster = materializeLayoutForSlide(
        currentSlide,
        { ...best, diagramVariant: preferredVariant },
        slideIndex,
        deckSlides.length,
        {
          rationalePrefix: 'Auto-picked',
          lockLayout: false,
        }
      );
      return updatedPoster;
    }
    return null;
  }

  // If the current layout is already a 'visual' winner, refresh its visualSpec cleanly from updated copy
  if (best.id === currentId) {
    if (currentSlide.type === 'visual' && best.visualKind) {
      const nextSpec = deriveVisualSpecFromSlide(currentSlide, best.visualKind, slideIndex);
      const nextRationale = `Auto-picked ${best.label} — ${best.rationale}`;
      if (
        JSON.stringify(nextSpec) !== JSON.stringify(currentSlide.visualSpec) ||
        currentSlide.layoutRationale !== nextRationale
      ) {
        return {
          ...currentSlide,
          visualSpec: nextSpec,
          layoutRationale: nextRationale,
          manualLayoutLocked: false,
        };
      }
    }
    return null;
  }

  const weakCurrent = isWeakOrPlaceholderVisual(currentSlide, deckSlides, slideIndex);
  const currentScore = currentRank ? currentRank.score : -50;
  const beatsWithMargin = best.score - currentScore >= margin;

  if (!weakCurrent && currentScore > 0 && !beatsWithMargin) {
    return null;
  }

  return materializeLayoutForSlide(
    currentSlide,
    best,
    slideIndex,
    deckSlides.length,
    {
      rationalePrefix: 'Auto-picked',
      lockLayout: false,
    }
  );
}

/**
 * Applies deck-aware Auto-Layout sequentially across all unlocked slides in a deck.
 * - Starts every non-locked slide with `manualLayoutLocked: false`.
 * - Respects authentic AI visuals when `preserveAuthenticAiVisuals: true` unless weak,
 *   placeholder-filled, Slide-1 invalid (`hub`), or duplicating its neighbor's exact layout.
 */
export function applyDeckAwareAutoLayout(
  slides: SlideData[],
  options?: {
    postFormat?: PostFormat;
    preserveAuthenticAiVisuals?: boolean;
  }
): SlideData[] {
  if (!slides || slides.length === 0) return slides;

  const working = [...slides];
  const preserveAi = Boolean(options?.preserveAuthenticAiVisuals);

  for (let idx = 0; idx < working.length; idx++) {
    const slide = working[idx];
    if (!slide) continue;

    // Respect manually locked slides completely
    if (slide.manualLayoutLocked) {
      continue;
    }

    // Preserve closing CTA
    if (slide.type === 'cta' || (working.length > 1 && idx === working.length - 1 && slide.type !== 'poster')) {
      working[idx] = {
        ...slide,
        type: 'cta',
        storyRole: 'cta',
        manualLayoutLocked: false,
        layoutRationale: slide.layoutRationale || 'Auto-picked CTA — closing discussion & source credit',
      };
      continue;
    }

    // Preserve user uploaded/generated media & memes
    if (slide.imageUrl || slide.videoUrl || slide.standaloneMeme) {
      working[idx] = {
        ...slide,
        manualLayoutLocked: false,
        layoutRationale: slide.layoutRationale || 'Auto-picked Media — preserves attached visual asset',
      };
      continue;
    }

    const prevId = idx > 0 ? getSlideCatalogId(working[idx - 1]) : '';
    const currId = getSlideCatalogId(slide);
    const hasAdjacentRepeat = Boolean(prevId && currId === prevId && working.length > 1);
    const isWeak = isWeakOrPlaceholderVisual(slide, working, idx);

    if (preserveAi && !isWeak && !hasAdjacentRepeat) {
      const kindLabel =
        slide.type === 'visual' && slide.visualSpec?.kind
          ? VISUAL_SPEC_KIND_LABELS[slide.visualSpec.kind]
          : findCatalogDescriptor(currId)?.label || slide.type.toUpperCase();
      if (
        idx === 0 &&
        working.length > 1 &&
        options?.postFormat !== 'single' &&
        options?.postFormat !== 'meme' &&
        !slide.standaloneMeme &&
        slide.type !== 'poster'
      ) {
        const teasers = deriveCoverTeaserForSlide(slide, working);
        working[idx] = {
          ...slide,
          storyRole: 'hook',
          compositionPreset: slide.compositionPreset || 'headline-first',
          coverStyle: slide.coverStyle || resolveSlide1CoverStyle(slide, working),
          coverTeaserEn: slide.coverTeaserEn || teasers.coverTeaserEn,
          coverTeaserAr: slide.coverTeaserAr || teasers.coverTeaserAr,
          showSwipeCue: slide.showSwipeCue ?? true,
          enBody: '',
          arBody: '',
          manualLayoutLocked: false,
          layoutRationale:
            slide.layoutRationale || `Auto-picked ${kindLabel} — matched slide semantics & deck flow`,
        };
      } else {
        working[idx] = {
          ...slide,
          manualLayoutLocked: false,
          layoutRationale:
            slide.layoutRationale || `Auto-picked ${kindLabel} — matched slide semantics & deck flow`,
        };
      }
      continue;
    }

    const ranked = rankSlideLayoutsForDeck(slide, working, idx, {
      postFormat: options?.postFormat,
    });
    const best = ranked[0];
    if (!best) continue;

    working[idx] = materializeLayoutForSlide(slide, best, idx, working.length, {
      rationalePrefix: 'Auto-picked',
      lockLayout: false,
    });

    // Enforce multi-slide Slide 1 Cover Hero defaults & zero-body hook invariant
    if (
      working.length > 1 &&
      idx === 0 &&
      options?.postFormat !== 'single' &&
      options?.postFormat !== 'meme' &&
      !working[idx].standaloneMeme &&
      working[idx].type !== 'poster'
    ) {
      const teasers = deriveCoverTeaserForSlide(working[idx], working);
      working[idx] = {
        ...working[idx],
        storyRole: 'hook',
        compositionPreset: working[idx].compositionPreset || 'headline-first',
        coverStyle: working[idx].coverStyle || resolveSlide1CoverStyle(working[idx], working),
        coverTeaserEn: working[idx].coverTeaserEn || teasers.coverTeaserEn,
        coverTeaserAr: working[idx].coverTeaserAr || teasers.coverTeaserAr,
        showSwipeCue: working[idx].showSwipeCue ?? true,
        enBody: '',
        arBody: '',
      };
    }
  }

  return working;
}
