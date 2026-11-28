import type {
  DiagramNode,
  DiagramVariant,
  HookClaimCard,
  HubNodeReason,
  SlideData,
  SlideType,
  SubjectPairConfig,
} from '../../../types.ts';
import { CONTENT_QUALITY_FILLER_LABELS } from '../../qaChecks.ts';
import { THIRD_PARTY_COMPANY_NAMES } from '../../techLogos.ts';
import { inferBestDiagramVariant, inferBestSlideArchetype } from './archetypeInference.ts';
import { isGenericPlaceholderValue, STOP_WORDS } from './constants.ts';
import { buildNonNumericHookClaimCard } from './hookClaimCard.ts';
import { detectSubjectPairFromText } from './subjectPairDetection.ts';
import {
  extractKeyPhrasesFromSlide,
  extractSourceQuotedHubNodes,
  matchSlideIconsFromText,
} from './textIcons.ts';

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

  const hasEnglishTitle = /[A-Za-z]{3,}/.test(slide.enTitle || '');
  // Deduplicate any custom satLabels that repeat words, leak Arabic script, truncate with "...", or use filler
  const cleanCustomSatLabels = (slide.satLabels || []).filter((raw) => {
    if (!raw || isGenericPlaceholderValue(raw)) return false;
    const trimmed = raw.trim();
    if (/\.\.\.|…$/.test(trimmed)) return false;
    if (hasEnglishTitle && /[\u0600-\u06FF]/.test(trimmed)) return false;
    const upper = trimmed.toUpperCase();
    const lowerLabel = trimmed.toLowerCase();
    if (STOP_WORDS.has(lowerLabel)) return false;
    if (CONTENT_QUALITY_FILLER_LABELS.has(upper)) return false;
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

  const englishHubSource = `${slide.enTitle || ''} ${slide.enBody || ''}`.trim() || fullText;
  const extractedHub = extractSourceQuotedHubNodes(englishHubSource, {
    titleText: slide.enTitle,
    category: slide.category || centerTag,
    targetCount: 5,
  });

  const satLabels = hasCustomSatLabels
    ? cleanCustomSatLabels.slice(0, 5)
    : extractedHub.satLabels.slice(0, 5);

  const hubNodeReasons: HubNodeReason[] = satLabels.map((lbl, idx) => {
    const matched =
      extractedHub.hubNodeReasons.find((r) => r.label.toUpperCase() === lbl.toUpperCase()) ||
      extractedHub.hubNodeReasons[idx];
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
      : Array.from(
          { length: Math.max(satLabels.length, 5) },
          (_, i) => nonBrandIcons[(i + 1) % nonBrandIcons.length] || nonBrandIcons[0] || 'server'
        );

  // 2. MECHANISM (ROW / POSTER) 3-NODE SCHEMATIC DEFAULTS
  const hasCustomNodes =
    !forceRefresh &&
    slide.diagramNodes &&
    slide.diagramNodes.length >= 3 &&
    slide.diagramNodes.slice(0, 3).every((n) => !isGenericPlaceholderValue(n?.label));

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
    const rawNodes =
      hasCustomNodes && slide.diagramNodes
        ? slide.diagramNodes.slice(0, 3).map((n, i) => ({
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
    const numMatch =
      fullText.match(/(?:step|stage|phase|rule|principle|layer|pillar|#)\s*0?(\d{1,2})\b/i) ||
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
      fullText.matchAll(/\b(\d+(?:\.\d+)?\s*(?:x|%|ms|μs|ns|GB|MB|KB|TB|rps|req\/s|nodes?))\b/gi)
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
        if (/(?:x|ms|μs|rps|req\/s)$/i.test(val)) score += 3;
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
    const cleanPhrase =
      phrases.find(
        (p) =>
          !/\d/.test(p) &&
          p.length >= 4 &&
          !CONTENT_QUALITY_FILLER_LABELS.has(p.trim().toUpperCase())
      ) || 'MEASURED RESULT';
    return cleanPhrase.toUpperCase().slice(0, 24);
  })();

  const isNonsenseMetricLabel = (lbl?: string) =>
    !lbl ||
    CONTENT_QUALITY_FILLER_LABELS.has(lbl.trim().toUpperCase()) ||
    /EXPOSURE\s+METRIC|TELEMETRY\s+STAT|SCALE\s+METRIC|PERFORMANCE\s+MULTIPLIER|^p99\s+latency$|\bTO\s+EXPOSURE\b/i.test(
      lbl
    );

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
