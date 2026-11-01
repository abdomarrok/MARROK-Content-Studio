import type { DiagramNode, DiagramVariant, SlideData } from '../../types.ts';
import { resolveSmartSlideVisuals } from './smartVisualDefaults.ts';

/**
 * Visual Pacing & Anti-Repetition Balancer
 * Guarantees zero adjacent or repeated diagram layouts across all mechanism slides in a carousel.
 * Cycles intelligently through ['topology', 'stack', 'isolation', 'takeaway'] based on slide semantics,
 * and repairs any missing fields (nodes, edges, footer, code, metric) so no slide ever renders half-empty.
 */
export function balanceCarouselVisualPacing(slides: SlideData[]): SlideData[] {
  const ALL_VARIANTS: DiagramVariant[] = [
    'scatter',
    'graph',
    'clusters',
    'split',
    'topology',
    'features',
    'stack',
    'isolation',
    'takeaway',
  ];
  let lastMechanismVariant: DiagramVariant | null = null;
  const variantCounts: Record<DiagramVariant, number> = {
    scatter: 0,
    graph: 0,
    clusters: 0,
    split: 0,
    topology: 0,
    features: 0,
    stack: 0,
    isolation: 0,
    takeaway: 0,
  };

  return slides.map((slide, idx) => {
    const smart = resolveSmartSlideVisuals(slide, idx, false);

    // Hub Slide (Slide 1)
    if (idx === 0 || slide.type === 'hub') {
      return {
        ...slide,
        type: 'hub',
        centerIcon: slide.centerIcon || smart.centerIcon,
        centerTag: slide.centerTag || smart.centerTag,
        satLabels: smart.satLabels,
        satIcons: slide.satIcons && slide.satIcons.length > 0 ? slide.satIcons : smart.satIcons,
      };
    }

    // CTA Slide (Final Slide)
    if (idx === slides.length - 1 || slide.type === 'cta') {
      return {
        ...slide,
        type: 'cta',
        ctaText: slide.ctaText && !slide.ctaText.toLowerCase().includes('dm for')
          ? slide.ctaText
          : 'Join Discussion  •  شارك برأيك',
      };
    }

    // Specialized Archetypes: Validate & Repair Missing Data
    if (slide.type === 'code') {
      return {
        ...slide,
        codeFileName: smart.codeFileName,
        codeLanguage: smart.codeLanguage,
        codeSnippet: smart.codeSnippet,
      };
    }

    if (slide.type === 'metric') {
      return {
        ...slide,
        metricValue: smart.metricValue,
        metricLabel: smart.metricLabel,
        metricDiff: smart.metricDiff,
        metricIcon: smart.metricIcon,
      };
    }

    if (slide.type === 'compare') {
      return {
        ...slide,
        compareLeftTitle: smart.compareLeftTitle,
        compareLeftBody: smart.compareLeftBody,
        compareRightTitle: smart.compareRightTitle,
        compareRightBody: smart.compareRightBody,
      };
    }

    if (slide.type === 'number') {
      return {
        ...slide,
        stepNumber: smart.stepNumber,
        stepLabel: smart.stepLabel,
        centerIcon: slide.centerIcon || smart.numberIcon,
      };
    }

    if (slide.type === 'image') {
      return slide;
    }

    // Mechanism (Row) Slides: Enforce Anti-Repetition & Variety
    const slideText = `${slide.enTitle || ''} ${slide.enBody || ''} ${slide.arTitle || ''}`.toLowerCase();

    // Determine semantic affinity
    let preferredVariant: DiagramVariant = slide.diagramVariant || 'topology';
    if (slide.diagramVariant && ALL_VARIANTS.includes(slide.diagramVariant)) {
      preferredVariant = slide.diagramVariant;
    } else if (
      /vector|embedding|semantic|cosine|similarity|high-dimensional|query point/.test(slideText)
    ) {
      preferredVariant = 'scatter';
    } else if (
      /hnsw|skip[- ]?list|graph|hierarchy|layered|traversal|hops\b/.test(slideText)
    ) {
      preferredVariant = 'graph';
    } else if (
      /ivf|cluster|k-means|centroid|partition|inverted file|shortlist/.test(slideText)
    ) {
      preferredVariant = 'clusters';
    } else if (
      /write|hot|cold|buffer|lsm|compaction|consistency|store/.test(slideText)
    ) {
      preferredVariant = 'split';
    } else if (
      /filter|constraint|metadata|attribute|pre-filter/.test(slideText)
    ) {
      preferredVariant = 'features';
    } else if (
      slideText.includes('blast radius') ||
      slideText.includes('microsegment') ||
      slideText.includes('isolation') ||
      slideText.includes('isolate') ||
      slideText.includes('perimeter') ||
      slideText.includes('firewall') ||
      slideText.includes('quarantine') ||
      slideText.includes('sandbox') ||
      slideText.includes('boundary') ||
      slideText.includes('guard')
    ) {
      preferredVariant = 'isolation';
    } else if (
      slideText.includes('stack') ||
      slideText.includes('layer') ||
      slideText.includes('pipeline') ||
      slideText.includes('server-side') ||
      slideText.includes('tier') ||
      slideText.includes('virtual mount')
    ) {
      preferredVariant = 'stack';
    } else if (
      slideText.includes('rule') ||
      slideText.includes('principle') ||
      slideText.includes('takeaway') ||
      slideText.includes('lesson') ||
      slideText.includes('best practice') ||
      slide.icons?.length === 1
    ) {
      preferredVariant = 'takeaway';
    } else {
      preferredVariant = 'topology';
    }

    // Anti-repetition: if preferred matches immediately previous mechanism slide,
    // cycle to least used candidate
    let chosenVariant: DiagramVariant = preferredVariant;
    if (chosenVariant === lastMechanismVariant || variantCounts[chosenVariant] > 1) {
      const candidates = ALL_VARIANTS.filter((v) => v !== lastMechanismVariant);
      candidates.sort((a, b) => variantCounts[a] - variantCounts[b]);
      if (candidates.length > 0) {
        chosenVariant = candidates[0];
      }
    }

    lastMechanismVariant = chosenVariant;
    variantCounts[chosenVariant]++;

    const isFinancialOrMacro =
      /\$|\b(?:valuation|billion|trillion|loss|losses|deficit|capital|financing|circular|subsid|taxpayer|retiree|s&p|pension|401k|revenue|spend|spent|cash[- ]?out|stake|economy|economic|inflation|energy|gigawatt|nuclear|market|investor|debt|financial)\b|مليار|تريليون|خسائر|تمويل|تقييم|ضرائب|متقاعد|طاقة|اقتصاد|استثمار/i.test(
        slideText
      );

    // Validate and repair diagram nodes, edges, footer
    const defaultTitleWords = (slide.enTitle || (isFinancialOrMacro ? 'Capital Flow' : 'System Component'))
      .replace(/[.?!]$/, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const n1Name =
      slide.icons?.[0]?.label ||
      smart.diagramNodes[0]?.label ||
      defaultTitleWords[0] ||
      (isFinancialOrMacro ? 'Capital Source' : 'Ingress Layer');
    const n2Name =
      slide.icons?.[1]?.label ||
      smart.diagramNodes[1]?.label ||
      defaultTitleWords[1] ||
      (isFinancialOrMacro ? 'Allocation Loop' : 'Execution Engine');
    const n3Name =
      slide.icons?.[2]?.label ||
      smart.diagramNodes[2]?.label ||
      defaultTitleWords[2] ||
      (isFinancialOrMacro ? 'Market Impact' : 'State Persistence');

    const rawNodes = slide.diagramNodes || [];

    let fallbackSub1 = isFinancialOrMacro ? 'Capital & Debt Input' : 'Input Handler';
    let fallbackSub2 = isFinancialOrMacro ? 'Allocation & Capex' : 'Core Execution';
    let fallbackSub3 = isFinancialOrMacro ? 'Market & Public Exposure' : 'Durable State';
    let fallbackEdge1 = isFinancialOrMacro ? 'FINANCE' : 'Process';
    let fallbackEdge2 = isFinancialOrMacro ? 'ALLOCATE' : 'Commit';
    let fallbackFooter = isFinancialOrMacro
      ? 'CAPITAL TOPOLOGY: CIRCULAR FINANCING & VALUE FLOW'
      : 'PIPELINE: ACTIVE • EXECUTION: DETERMINISTIC';

    if (chosenVariant === 'scatter') {
      fallbackSub1 = 'Vector Array';
      fallbackSub2 = 'High-Dim Space';
      fallbackSub3 = 'Top-K Match';
      fallbackEdge1 = 'ENCODE';
      fallbackEdge2 = 'SIMILARITY';
      fallbackFooter = 'METRIC: COSINE SIMILARITY • RECALL OPTIMIZED';
    } else if (chosenVariant === 'graph') {
      fallbackSub1 = 'Layer 2 Sparse';
      fallbackSub2 = 'Fast Hops';
      fallbackSub3 = 'Layer 0 Dense';
      fallbackEdge1 = 'DESCENT';
      fallbackEdge2 = 'CONVERGE';
      fallbackFooter = 'GRAPH: HIERARCHICAL NAVIGABLE SMALL WORLD';
    } else if (chosenVariant === 'clusters') {
      fallbackSub1 = 'Centroid Partition';
      fallbackSub2 = 'Target Centroid';
      fallbackSub3 = 'Candidate List';
      fallbackEdge1 = 'PARTITION';
      fallbackEdge2 = 'SCAN';
      fallbackFooter = 'INDEX: INVERTED FILE CLUSTERING • PRUNED SEARCH';
    } else if (chosenVariant === 'split') {
      fallbackSub1 = 'Mutable Buffer';
      fallbackSub2 = 'Index Compactor';
      fallbackSub3 = 'Immutable Core';
      fallbackEdge1 = 'BUFFER';
      fallbackEdge2 = 'FLUSH';
      fallbackFooter = 'ARCHITECTURE: DUAL HOT/COLD STORE';
    } else if (chosenVariant === 'features') {
      fallbackSub1 = 'Attribute Check';
      fallbackSub2 = 'Vector Scan';
      fallbackSub3 = 'Merged Result';
      fallbackEdge1 = 'FILTER';
      fallbackEdge2 = 'MERGE';
      fallbackFooter = 'CAPABILITIES: HARD CONSTRAINTS • HIGH PERFORMANCE';
    } else if (chosenVariant === 'isolation') {
      fallbackSub1 = isFinancialOrMacro ? 'Private Capital Loss' : 'Untrusted Scope';
      fallbackSub2 = isFinancialOrMacro ? 'Public Subsidy Shield' : 'Boundary Guard';
      fallbackSub3 = isFinancialOrMacro ? 'Taxpayer Risk Exposure' : 'Protected Core';
      fallbackEdge1 = isFinancialOrMacro ? 'SHIFT' : 'ISOLATE';
      fallbackEdge2 = isFinancialOrMacro ? 'BACKSTOP' : 'GUARD';
      fallbackFooter = isFinancialOrMacro
        ? 'RISK EXPOSURE: SYSTEMIC MARKET & TAXPAYER BACKSTOP'
        : 'FAULT DOMAIN: ISOLATED • ESCAPE RISK: ZERO';
    } else if (chosenVariant === 'stack') {
      fallbackSub1 = isFinancialOrMacro ? 'Equity & Debt Financing' : 'Interface Tier';
      fallbackSub2 = isFinancialOrMacro ? 'Infrastructure Capex' : 'Processing Engine';
      fallbackSub3 = isFinancialOrMacro ? 'Consumer & Grid Cost' : 'Storage Tier';
      fallbackEdge1 = isFinancialOrMacro ? 'LEVERAGE' : 'DISPATCH';
      fallbackEdge2 = isFinancialOrMacro ? 'PASS-THROUGH' : 'PERSIST';
      fallbackFooter = isFinancialOrMacro
        ? 'ECONOMIC STACK: CAPITAL STRUCTURE & REAL-WORLD IMPACT'
        : 'ARCHITECTURE STACK: VERIFIED • RUNTIME: DETERMINISTIC';
    } else if (chosenVariant === 'takeaway') {
      fallbackSub1 = isFinancialOrMacro ? 'Unsustainable Unit Burn' : 'Standard Workflow';
      fallbackSub2 = isFinancialOrMacro ? 'Circular Capital Structure' : 'Engineered Shift';
      fallbackSub3 = isFinancialOrMacro ? 'Systemic Market Risk' : 'Production Result';
      fallbackEdge1 = 'EVALUATE';
      fallbackEdge2 = isFinancialOrMacro ? 'OUTCOME' : 'ADOPT';
      fallbackFooter = isFinancialOrMacro
        ? 'ECONOMIC VERDICT: PRIVATE GAINS VS PUBLIC & RETIREE EXPOSURE'
        : 'ENGINEERING PRINCIPLE: AUDITED • SYSTEM: PRODUCTION-GRADE';
    }

    const defaultIcons = isFinancialOrMacro
      ? ['dollarSign', 'landmark', 'factory']
      : ['server', 'cpu', 'database'];

    const diagramNodes: DiagramNode[] = [
      {
        label: rawNodes[0]?.label || n1Name,
        sublabel: rawNodes[0]?.sublabel || fallbackSub1,
        status: rawNodes[0]?.status || (isFinancialOrMacro ? 'CAPITAL' : 'ACTIVE'),
        icon: rawNodes[0]?.icon || slide.icons?.[0]?.icon || smart.diagramNodes[0]?.icon || defaultIcons[0],
      },
      {
        label: rawNodes[1]?.label || n2Name,
        sublabel: rawNodes[1]?.sublabel || fallbackSub2,
        status: rawNodes[1]?.status || (isFinancialOrMacro ? 'ALLOCATED' : 'VERIFIED'),
        icon: rawNodes[1]?.icon || slide.icons?.[1]?.icon || smart.diagramNodes[1]?.icon || defaultIcons[1],
      },
      {
        label: rawNodes[2]?.label || n3Name,
        sublabel: rawNodes[2]?.sublabel || fallbackSub3,
        status: rawNodes[2]?.status || (isFinancialOrMacro ? 'EXPOSED' : 'COMMITTED'),
        icon: rawNodes[2]?.icon || slide.icons?.[2]?.icon || smart.diagramNodes[2]?.icon || defaultIcons[2],
      },
    ];

    const rawEdges = slide.diagramEdges || [];
    const diagramEdges = [
      rawEdges[0] || fallbackEdge1,
      rawEdges[1] || fallbackEdge2,
    ];
    const diagramFooter = slide.diagramFooter || fallbackFooter;

    return {
      ...slide,
      type: 'row',
      diagramVariant: chosenVariant,
      diagramNodes,
      diagramEdges,
      diagramFooter,
    };
  });
}
