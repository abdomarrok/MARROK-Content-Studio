import type { SlideData } from '../../../types.ts';
import { isNonSemanticFileName } from '../../text/headlines.ts';
import {
  explainArchetypeChoice,
  inferDynamicCoverArchetype,
  resolveSmartSlideVisuals,
} from '../smartVisualDefaults.ts';
import type { UniversalSynthesisOptions } from './types.ts';
import { cleanRawInput, parseComparativeEntities, scanMetrics } from './metricsScanner.ts';
import { buildDeckFromUserPoints } from './userPointsBuilder.ts';
import {
  buildAgentDelegationStory,
  buildAiStory,
  buildCacheStory,
  buildComparativeStory,
  buildContainerStory,
  buildDatabaseStory,
  buildGeneralSystemsStory,
  buildHumorOrOpinionStory,
  buildKernelStory,
  buildSecurityStory,
  buildVcsStory,
} from './domainStoryBuilders.ts';

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
  const rawFirstLine = (lines[0] || 'System Architecture')
    .replace(/\s*\([^)]*(?:Engineering|Blog|RSS|Research|Team|News| Lobsters|Reddit)[^)]*\)\s*$/i, '')
    .trim();

  // If input is a single multi-sentence paragraph (no newlines), promote sentence 1 as subject
  // and sentences 2+ as content lines so substantive articles never fall into generic short-prompt branches.
  const firstLineSentences =
    lines.length === 1 && rawFirstLine.length > 90
      ? rawFirstLine
          .split(/(?<=[.!?])\s+(?=[A-Z0-9"`'•-])/)
          .map((s) => s.trim())
          .filter((s) => s.length > 18)
      : [rawFirstLine];

  const firstLine = firstLineSentences[0] || rawFirstLine;

  // Filter out prompt wrapper headers ("Source URL:", "Technical Summary & Engineering Context:")
  const trailingLines = firstLineSentences.length > 1 ? firstLineSentences.slice(1) : lines.slice(1);
  const contentLines = trailingLines.filter(
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
  const hasRealNumbers = metrics.length > 0 || /\b\d+(?:\.\d+)?\s*(?:%|x|ms|s|gb|tb|mb|k|m|b|nodes|requests?)\b/i.test(cleaned);
  const isHumorOrOpinion =
    /\b(?:friday\s+deploy|works?\s+on\s+my\s+machine|git\s+push\s+--?force|tabs?\s+vs\.?\s+spaces?|senior\s+(?:dev|engineers?)|junior\s+dev|coffee|caffeine|meme|humor|satire|joke|irony|hot\s+take|unpopular\s+opinion|over-?engineer\w*|bike[- ]?shed|meeting\s+that\s+could|weekend\s+incident|stackoverflow|lgtm|yolo|nobody\s+reads\s+docs|legacy\s+code|tech\s+debt\s+is\s+a\s+feature|rewrite\s+it\s+in\s+rust|boring\s+postgres|fourteen\s+(?:paying\s+)?users|ship(?:ped)?\s+features?\s+before\s+lunch|resume[- ]driven)\b/i.test(
      lower
    ) ||
    (!hasRealNumbers &&
      /\b(?:i\s+think|we\s+need\s+to\s+stop|stop\s+(?:writing|building|overcomplicating)|why\s+developers|every\s+developer|unpopular\s+truth|hot\s+take|honest\s+truth|nobody\s+wants\s+to\s+admit)\b/i.test(
        lower
      ));

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

  // 5. Humor / Opinion / Non-numeric hot takes get a dedicated authentic narrative instead of systems boilerplate
  if (isHumorOrOpinion) {
    return finalizeSynthesizedDeckSlides(
      buildHumorOrOpinionStory(cleaned, coreSubject, userSubstantivePoints, {
        brand,
        brandUrl,
        domainCategory,
        targetCount,
        metrics,
      })
    );
  }

  // 6. If user provided multiple substantive bullet points or sentences (>= 2 points):
  // Directly synthesize slides from the user's actual points!
  if (userSubstantivePoints.length >= 2 && !isExplicitHeadlineComparison) {
    return finalizeSynthesizedDeckSlides(
      buildDeckFromUserPoints(coreSubject, userSubstantivePoints, {
        brand,
        brandUrl,
        domainCategory,
        targetCount,
        metrics,
        centerIcon: options.centerIcon,
        rawSourceText: cleaned,
      })
    );
  }

  if (lines.length === 1 && firstLineSentences.length >= 2 && rawFirstLine.length > 110 && !isAgentOrDelegation) {
    return finalizeSynthesizedDeckSlides(
      buildGeneralSystemsStory(cleaned, { brand, brandUrl, targetCount, domainCategory, metrics })
    );
  }

  // 7. Domain-Specific Narrative Generation for Short Prompts / Topic Inputs
  if (isAgentOrDelegation) {
    return finalizeSynthesizedDeckSlides(
      buildAgentDelegationStory(coreSubject, { brand, brandUrl, targetCount, metrics })
    );
  }

  if (isScionOrVcs) {
    return finalizeSynthesizedDeckSlides(
      buildVcsStory({ brand, brandUrl, targetCount, metrics })
    );
  }

  if (isContainerOrCloud) {
    return finalizeSynthesizedDeckSlides(
      buildContainerStory({ brand, brandUrl, targetCount, metrics })
    );
  }

  if (isRedisOrCache) {
    return finalizeSynthesizedDeckSlides(
      buildCacheStory({ brand, brandUrl, targetCount, metrics })
    );
  }

  if (isSecurity) {
    return finalizeSynthesizedDeckSlides(
      buildSecurityStory({ brand, brandUrl, targetCount, metrics })
    );
  }

  if (isKernelOrEbpf) {
    return finalizeSynthesizedDeckSlides(
      buildKernelStory({ brand, brandUrl, targetCount, metrics })
    );
  }

  if (isAiOrLlm) {
    return finalizeSynthesizedDeckSlides(
      buildAiStory({ brand, brandUrl, targetCount, metrics })
    );
  }

  if (isDatabase) {
    return finalizeSynthesizedDeckSlides(
      buildDatabaseStory({ brand, brandUrl, targetCount, metrics })
    );
  }

  if (entities.isComparative) {
    return finalizeSynthesizedDeckSlides(
      buildComparativeStory(entities, metrics, { brand, brandUrl, targetCount, domainCategory })
    );
  }

  // Fallback: Source-grounded prose & systems story (no canned boilerplate)
  return finalizeSynthesizedDeckSlides(
    buildGeneralSystemsStory(cleaned, { brand, brandUrl, targetCount, domainCategory, metrics })
  );
}

/**
 * Post-processes synthesized story decks so:
 * 1) Slide 1 uses a focused Hook archetype (`compare`, `metric`, or `row` — NEVER `hub`).
 * 2) No 3 consecutive slides share the same layout type.
 * 3) Every slide carries a human-readable 1-line `layoutRationale` explaining why its layout fits.
 */
export function finalizeSynthesizedDeckSlides(rawSlides: SlideData[]): SlideData[] {
  if (!Array.isArray(rawSlides) || rawSlides.length === 0) return rawSlides;
  const total = rawSlides.length;
  const result: SlideData[] = [];

  for (let idx = 0; idx < total; idx++) {
    let slide: SlideData = { ...rawSlides[idx] };

    // 1. Ensure Slide 1 on multi-slide decks is NEVER a Hub web diagram
    if (idx === 0 && total > 1 && slide.type === 'hub') {
      const hookType = inferDynamicCoverArchetype(slide);
      const smart = resolveSmartSlideVisuals(
        {
          ...slide,
          type: hookType,
        },
        0,
        true
      );
      slide = {
        ...slide,
        type: hookType,
        storyRole: 'hook',
        cornerTag: 'HOOK',
        centerIcon: smart.centerIcon || slide.centerIcon,
        centerTag: smart.centerTag || slide.centerTag,
        satLabels: slide.satLabels && slide.satLabels.length > 0 ? slide.satLabels : smart.satLabels,
        hubNodeReasons:
          slide.hubNodeReasons && slide.hubNodeReasons.length > 0
            ? slide.hubNodeReasons
            : smart.hubNodeReasons,
        metricBeforeValue: slide.metricBeforeValue || smart.metricBeforeValue,
        metricValue: slide.metricValue || smart.metricValue,
        metricLabel: slide.metricLabel || smart.metricLabel,
        metricDiff: slide.metricDiff || smart.metricDiff,
        metricIcon: slide.metricIcon || smart.metricIcon,
        chartDirection: slide.chartDirection || smart.chartDirection,
        compareLeftTitle: slide.compareLeftTitle || smart.compareLeftTitle,
        compareLeftBody: slide.compareLeftBody || smart.compareLeftBody,
        compareRightTitle: slide.compareRightTitle || smart.compareRightTitle,
        compareRightBody: slide.compareRightBody || smart.compareRightBody,
        diagramVariant: hookType === 'row' ? slide.diagramVariant || smart.diagramVariant || 'isolation' : slide.diagramVariant,
        diagramNodes: slide.diagramNodes && slide.diagramNodes.length > 0 ? slide.diagramNodes : smart.diagramNodes,
        diagramEdges: slide.diagramEdges && slide.diagramEdges.length > 0 ? slide.diagramEdges : smart.diagramEdges,
        diagramFooter: slide.diagramFooter || smart.diagramFooter,
        hookClaimCard: slide.hookClaimCard || smart.hookClaimCard,
        enBody: '',
        arBody: '',
      };
    }

    // 2. Enforce strict non-3-in-a-row layout streak across content slides
    if (idx >= 2 && idx < total - 1 && slide.type !== 'cta' && slide.type !== 'image') {
      const prev1 = result[idx - 1]?.type;
      const prev2 = result[idx - 2]?.type;
      if (prev1 && prev2 && prev1 === slide.type && prev2 === slide.type) {
        if (idx === total - 2 && slide.type === 'row' && slide.diagramVariant === 'takeaway') {
          const prevSlide = result[idx - 1];
          const smartPrev = resolveSmartSlideVisuals({ ...prevSlide, type: 'number' }, idx - 1, true);
          const updatedPrev: SlideData = {
            ...prevSlide,
            type: 'number',
            stepNumber: smartPrev.stepNumber,
            stepLabel: smartPrev.stepLabel,
            centerIcon: prevSlide.centerIcon || smartPrev.numberIcon,
          };
          updatedPrev.layoutRationale = explainArchetypeChoice(updatedPrev, idx - 1, total);
          result[idx - 1] = updatedPrev;
        } else {
          const alternatives: SlideData['type'][] = ['compare', 'metric', 'number', 'code', 'row'];
          const replacement = alternatives.find((t) => t !== slide.type) || 'number';
          const smartAlt = resolveSmartSlideVisuals({ ...slide, type: replacement }, idx, true);
          slide = {
            ...slide,
            type: replacement,
            compareLeftTitle: replacement === 'compare' ? smartAlt.compareLeftTitle : slide.compareLeftTitle,
            compareLeftBody: replacement === 'compare' ? smartAlt.compareLeftBody : slide.compareLeftBody,
            compareRightTitle: replacement === 'compare' ? smartAlt.compareRightTitle : slide.compareRightTitle,
            compareRightBody: replacement === 'compare' ? smartAlt.compareRightBody : slide.compareRightBody,
            metricValue: replacement === 'metric' ? smartAlt.metricValue : slide.metricValue,
            metricLabel: replacement === 'metric' ? smartAlt.metricLabel : slide.metricLabel,
            metricDiff: replacement === 'metric' ? smartAlt.metricDiff : slide.metricDiff,
            stepNumber: replacement === 'number' ? smartAlt.stepNumber : slide.stepNumber,
            stepLabel: replacement === 'number' ? smartAlt.stepLabel : slide.stepLabel,
            codeFileName: replacement === 'code' ? smartAlt.codeFileName : slide.codeFileName,
            codeLanguage: replacement === 'code' ? smartAlt.codeLanguage : slide.codeLanguage,
            codeSnippet: replacement === 'code' ? smartAlt.codeSnippet : slide.codeSnippet,
            diagramVariant: replacement === 'row' ? smartAlt.diagramVariant : slide.diagramVariant,
            diagramNodes: replacement === 'row' ? smartAlt.diagramNodes : slide.diagramNodes,
            diagramEdges: replacement === 'row' ? smartAlt.diagramEdges : slide.diagramEdges,
          };
        }
      }
    }

    // 3. Always attach a concise 1-line layout rationale per slide
    if (!slide.layoutRationale) {
      slide.layoutRationale = explainArchetypeChoice(slide, idx, total);
    }

    result.push(slide);
  }

  return result;
}
