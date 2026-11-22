import type { CarouselData, DiagramVariant, SlideData, SlideType } from '../../../types.ts';
import { isPlaceholderOrEmptyBrandValue } from '../../bundledTechSvgs.ts';
import {
  CHAR_LIMITS,
  CONTENT_QUALITY_FILLER_LABELS,
  SINGLE_SLIDE_CHAR_LIMITS,
} from '../../qaChecks.ts';
import { fixArabicPunctuation } from '../../text/arabicBiDi.ts';
import { autoFitTextToLimits, autoPolishHeadline } from '../../text/headlines.ts';
import { repairAndDeRepeatSlideHeadlines, sanitizeSlide } from '../../text/sanitizer.ts';
import {
  deriveVisualSpecFromSlide,
  detectStrongVisualSpecKind,
} from '../visualSpecBuilder.ts';
import {
  analyzeSlideTextForArchetype,
  deriveSlideCornerTag,
  explainArchetypeChoice,
  inferBestDiagramVariant,
  inferDynamicCoverArchetype,
} from './archetypeInference.ts';
import { isGenericPlaceholderValue, STOP_WORDS } from './constants.ts';
import { applyHookEngineToSlide1 } from './hookEngine.ts';
import { detectSubjectPairFromText } from './subjectPairDetection.ts';
import { extractKeyPhrasesFromSlide, extractSourceQuotedHubNodes } from './textIcons.ts';
import { resolveSmartSlideVisuals } from './visualDefaultsResolver.ts';

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
      assignedSignatures.push(
        slide.type === 'row'
          ? `row:${slide.diagramVariant || 'topology'}`
          : slide.type === 'visual'
          ? `visual:${slide.visualSpec?.kind || 'bar-chart'}`
          : slide.type
      );
      return {
        ...slide,
        storyRole: slide.storyRole || storyRole,
        cornerTag: slide.cornerTag || deriveSlideCornerTag({ ...slide, storyRole }, idx, slides.length),
        layoutRationale: slide.layoutRationale || 'Locked manually via Cascade Lock (preserved during deck sync).',
      };
    }

    // Slide 1 Cover: Always a Hook layout (subjectPair / metric / compare / visual / row / code) — NEVER 'hub'
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
        slide.type === 'image' ||
        slide.type === 'visual';

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
          visualSpec:
            coverType === 'visual'
              ? slide.visualSpec || deriveVisualSpecFromSlide(slide, undefined, 0)
              : slide.visualSpec,
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
        nextCover.type === 'row'
          ? `row:${nextCover.diagramVariant || 'topology'}`
          : nextCover.type === 'visual'
          ? `visual:${nextCover.visualSpec?.kind || 'bar-chart'}`
          : nextCover.type
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

    if (targetType === 'visual') {
      const detectedKind = slide.visualSpec?.kind || detectStrongVisualSpecKind(slide) || undefined;
      const resolvedSpec =
        slide.visualSpec && slide.visualSpec.kind
          ? slide.visualSpec
          : deriveVisualSpecFromSlide(slide, detectedKind, idx);
      const nextVisual: SlideData = {
        ...slide,
        type: 'visual',
        storyRole,
        visualSpec: resolvedSpec,
      };
      nextVisual.cornerTag = deriveSlideCornerTag(nextVisual, idx, slides.length);
      nextVisual.layoutRationale = explainArchetypeChoice(nextVisual, idx, slides.length);
      assignedTypes.push('visual');
      assignedSignatures.push(`visual:${resolvedSpec.kind}`);
      return nextVisual;
    }

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
  const arTitleLimit = isHook ? limits.hookArTitle : limits.arTitle;

  const rawEnTitle = (slide.enTitle || '').trim();
  const rawArTitle = (slide.arTitle || '').trim();
  const rawEnBody = (slide.enBody || '').trim();
  const rawArBody = (slide.arBody || '').trim();

  const fittedEnTitle =
    rawEnTitle.length > enTitleLimit
      ? autoPolishHeadline(autoFitTextToLimits(rawEnTitle, enTitleLimit))
      : rawEnTitle;
  const fittedArTitle =
    rawArTitle.length > arTitleLimit
      ? fixArabicPunctuation(autoFitTextToLimits(rawArTitle, arTitleLimit))
      : fixArabicPunctuation(rawArTitle);
  const fittedEnBody =
    rawEnBody.length > limits.enBody
      ? autoFitTextToLimits(rawEnBody, limits.enBody)
      : rawEnBody;
  const fittedArBody =
    rawArBody.length > limits.arBody
      ? fixArabicPunctuation(autoFitTextToLimits(rawArBody, limits.arBody))
      : fixArabicPunctuation(rawArBody);

  const hooked =
    !isSingle && slideIndex === 0
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
    slide.diagramNodes.slice(0, 3).every((n) => !isGenericPlaceholderValue(n?.label));
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
    visualSpec:
      slide.type === 'visual'
        ? slide.visualSpec || deriveVisualSpecFromSlide(slide, undefined, slideIndex)
        : slide.visualSpec,
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

/**
 * One-Tap Auto-Clean Content:
 * Removes known template clichés, raw filenames, placeholder tokens, filler diagram/metric/hub labels,
 * category echoes, and Slide 1 hook violations across the entire deck so Content Quality Gate passes cleanly.
 */
export function cleanCarouselContentQuality(
  deck: CarouselData,
  promptContext: string = ''
): CarouselData {
  const prevSlides = deck.slides || [];
  const isMulti = deck.postFormat !== 'single' && prevSlides.length > 1;
  const deckCorpus = [
    promptContext,
    deck.sourceMeta?.title || deck.category,
    deck.caption,
    ...prevSlides.map((s) => `${s.enTitle || ''} ${s.enBody || ''}`),
  ]
    .filter(Boolean)
    .join(' ');

  const stripTemplatesAndPlaceholders = (value: string, options?: { isCta?: boolean }): string => {
    let out = (value || '')
      .replace(
        /\bA breakdown of technical mechanisms,?\s*benchmarks,?\s*and production architecture\.?/gi,
        'Technical architecture and benchmark breakdown.'
      )
      .replace(/\ba breakdown of technical mechanisms behind\b/gi, '')
      .replace(/\btechnical breakdown of\b/gi, '')
      .replace(/\bcore mechanisms?\b/gi, 'architecture paths')
      .replace(/\boperational boundaries\b/gi, 'deployment limits')
      .replace(/\bThe core trade-?off\b/gi, 'Key design trade-off')
      .replace(/\b(?:real\s+)?production\s+trade-?offs?\b/gi, 'runtime limits')
      .replace(/\barchitectural\s+trade-?offs?\b/gi, 'design limits')
      .replace(
        /\bWhen system frequency increases, legacy architectures become memory bottlenecks\.?/gi,
        'Higher request rates expose shared memory contention in unsharded paths.'
      )
      .replace(/النقلة المعمارية لمنظومة/g, 'قراءة هندسية في')
      .replace(/تحليل معماري لمنظومة/g, 'قراءة هندسية في')
      .replace(/تحليل هندسي معمق/g, 'آلية العمل')
      .replace(/الآليات الأساسية/g, 'مسارات التنفيذ')
      .replace(/الحدود التشغيلية/g, 'حدود التشغيل الفعلية')
      .replace(/المقايضة الجوهرية/g, 'الموازنة الهندسية')
      .replace(/كيف تعمل منظومة\s+(.*?)\s+تحت الضغط/g, 'أداء $1 تحت الضغط')
      .replace(/شارك في النقاش/g, 'شاركنا رأيك الهندسي')
      .replace(/مقايضات الإنتاج|تنازلات الإنتاج|آليات النظام الأساسية/g, 'حدود التشغيل الفعلية')
      .replace(/هذا العنصر يعرض|تفاصيل هندسية عامة|وصف تقني عام|نص عربي تجريبي/g, 'تفاصيل البنية والتشغيل في بيئة الإنتاج')
      .replace(/\s*المعتمد\b/g, '')
      .replace(/\b(?:IMG|DSC|PXL|Screenshot|Screen\s*Shot)[-_ \d]+\b/gi, ' ')
      .replace(/\b\d+(?:png|jpg|jpeg|webp|svg)\b/gi, ' ')
      .replace(/\.(?:png|jpe?g|webp|svg|gif)\b/gi, ' ')
      .replace(/\[INSERT[^\]]*\]/gi, ' ')
      .replace(/\b(?:CHANNEL NAME|YOUR BRAND|YOUR NAME|YOUR COMPANY|Lorem ipsum|PLACEHOLDER|TODO|TBD)\b/gi, ' ')
      .replace(/\b(?:System|Company|Brand|Product|Tool)\s+[AB12]\b/gi, 'Runtime')
      .replace(/\b(?:PIPELINE|DATASTREAM)\s+MIGRATION\b/gi, 'Workflow Update')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (options?.isCta) {
      out = out.replace(/^Join the discussion\b/i, 'Join the engineering review');
    } else {
      out = out.replace(/\bJoin the discussion\b/gi, 'Join the engineering review');
    }
    return out;
  };

  const categoryNorm = (deck.category || '').trim().toUpperCase();
  const categoryTokens = new Set(
    categoryNorm
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3)
  );

  const deckPhrases = extractKeyPhrasesFromSlide({
    enTitle: promptContext || deck.sourceMeta?.title || '',
    enBody: deckCorpus,
  } as SlideData).filter(
    (p) => !CONTENT_QUALITY_FILLER_LABELS.has(p.trim().toUpperCase()) && !isPlaceholderOrEmptyBrandValue(p)
  );

  const cleanedCaption = stripTemplatesAndPlaceholders(deck.caption || '');

  const cleanedSlides = prevSlides.map((slide, idx) => {
    if (slide.standaloneMeme || slide.imageFrameMode === 'full') {
      return slide;
    }

    let enTitle = stripTemplatesAndPlaceholders(slide.enTitle || '');
    let arTitle = stripTemplatesAndPlaceholders(slide.arTitle || '');
    let enBody = isMulti && idx === 0 ? '' : stripTemplatesAndPlaceholders(slide.enBody || '');
    let arBody = isMulti && idx === 0 ? '' : stripTemplatesAndPlaceholders(slide.arBody || '');
    const ctaText = slide.ctaText
      ? stripTemplatesAndPlaceholders(slide.ctaText, { isCta: true })
      : slide.ctaText;

    // Fix category-echo headlines (no numbers or questions and all tokens belong to category)
    if (enTitle && categoryTokens.size > 0) {
      const hTokens = enTitle
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3);
      if (
        hTokens.length > 0 &&
        hTokens.length <= 4 &&
        hTokens.every((t) => categoryTokens.has(t)) &&
        !/\d|\?/.test(enTitle)
      ) {
        const bodyWords = enBody
          .split(/\s+/)
          .filter((w) => w.length >= 3 && !STOP_WORDS.has(w.toLowerCase()))
          .slice(0, 3)
          .join(' ');
        enTitle = bodyWords ? `${enTitle}: ${bodyWords}` : `${enTitle} in Production`;
      }
    }

    // Ensure arTitle / arBody do not contain >= 3 English words with zero Arabic characters
    if (arTitle && !/[\u0600-\u06FF]/.test(arTitle) && arTitle.split(/\s+/).length >= 3) {
      arTitle = `قراءة هندسية: ${arTitle}`;
    }
    if (arBody && !/[\u0600-\u06FF]/.test(arBody) && arBody.split(/\s+/).length >= 3) {
      arBody = `ملخص تقني: ${arBody}`;
    }

    const hasBadDiagramNode = Boolean(
      slide.diagramNodes?.some(
        (n) =>
          !n?.label ||
          CONTENT_QUALITY_FILLER_LABELS.has(n.label.trim().toUpperCase()) ||
          isPlaceholderOrEmptyBrandValue(n.label) ||
          isGenericPlaceholderValue(n.label)
      )
    );

    const hasBadMetricLabel = Boolean(
      slide.metricLabel &&
        (CONTENT_QUALITY_FILLER_LABELS.has(slide.metricLabel.trim().toUpperCase()) ||
          isPlaceholderOrEmptyBrandValue(slide.metricLabel))
    );

    const hasBadCompare =
      slide.type === 'compare' &&
      (isPlaceholderOrEmptyBrandValue(slide.compareLeftTitle) ||
        isPlaceholderOrEmptyBrandValue(slide.compareRightTitle));

    let nextType = slide.type;
    let nextSubjectPair = slide.subjectPair;
    if (slide.type === 'subjectPair' || slide.subjectPair) {
      const pair = slide.subjectPair;
      const pairInvalid =
        !pair ||
        isPlaceholderOrEmptyBrandValue(pair.beforeSystem) ||
        isPlaceholderOrEmptyBrandValue(pair.afterSystem) ||
        (pair.flowLabel ? isPlaceholderOrEmptyBrandValue(pair.flowLabel) : false) ||
        (pair.storyOwner ? isPlaceholderOrEmptyBrandValue(pair.storyOwner) : false);
      if (pairInvalid) {
        const redetected = detectSubjectPairFromText(`${enTitle} ${enBody} ${deckCorpus}`, slide);
        if (redetected) {
          nextSubjectPair = redetected;
        } else {
          nextSubjectPair = undefined;
          if (nextType === 'subjectPair') {
            nextType = 'row';
          }
        }
      }
    }

    let updated: SlideData = {
      ...slide,
      type: nextType,
      subjectPair: nextSubjectPair,
      enTitle,
      arTitle,
      enBody,
      arBody,
      ctaText,
      diagramNodes: hasBadDiagramNode ? undefined : slide.diagramNodes,
      metricLabel: hasBadMetricLabel ? undefined : slide.metricLabel,
      compareLeftTitle: hasBadCompare ? undefined : slide.compareLeftTitle,
      compareRightTitle: hasBadCompare ? undefined : slide.compareRightTitle,
    };

    // Re-anchor satLabels if present or Hub/topology slide
    const titleEchoTokens = new Set(
      `${enTitle} ${updated.centerTag || ''}`
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3)
    );
    const hasBadSatLabels = Boolean(
      updated.satLabels &&
        updated.satLabels.some((lbl) => {
          const trimmed = (lbl || '').trim();
          const norm = trimmed.toUpperCase();
          if (!norm) return true;
          if (/\.\.\.|…$/.test(trimmed)) return true;
          if (/[A-Za-z]{3,}/.test(enTitle) && /[\u0600-\u06FF]/.test(trimmed)) return true;
          if (CONTENT_QUALITY_FILLER_LABELS.has(norm)) return true;
          if (categoryNorm && norm === categoryNorm) return true;
          const toks = norm.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
          return toks.length === 1 && (categoryTokens.has(toks[0]) || titleEchoTokens.has(toks[0]));
        })
    );

    if (
      updated.type === 'hub' ||
      updated.diagramVariant === 'topology' ||
      hasBadSatLabels
    ) {
      const latinDeckContext = /[A-Za-z]{3,}/.test(enTitle)
        ? deckCorpus.replace(/[\u0600-\u06FF]+/g, ' ')
        : deckCorpus;
      const hubExtracted = extractSourceQuotedHubNodes(
        `${enTitle} ${enBody} ${latinDeckContext}`,
        { titleText: enTitle, category: deck.category, targetCount: 5 }
      );
      if (hubExtracted.satLabels.length > 0) {
        updated = {
          ...updated,
          satLabels: hubExtracted.satLabels,
          hubNodeReasons: hubExtracted.hubNodeReasons,
        };
      } else {
        updated = {
          ...updated,
          satLabels: undefined,
          hubNodeReasons: undefined,
        };
      }
    }

    if (isMulti && idx === 0) {
      updated = applyHookEngineToSlide1(updated, false, deckCorpus);
      updated = {
        ...updated,
        storyRole: 'hook',
        enBody: '',
        arBody: '',
      };
    }

    let synced = autoSyncSlideGraphicsFromCopy(updated, idx);

    // Defensive post-sync pass: guarantee zero filler/echo/placeholder nodes remain
    if (synced.diagramNodes && synced.diagramNodes.length > 0) {
      const usedNodeKeys = new Set<string>();
      const fallbackPool = [
        ...deckPhrases,
        'Signal Path',
        'Policy Gate',
        'Runtime Check',
        'Worker Tier',
        'Audit Trail',
      ];
      synced = {
        ...synced,
        diagramNodes: synced.diagramNodes.map((node, nIdx) => {
          const rawLabel = (node.label || '').trim();
          const upper = rawLabel.toUpperCase();
          const isBad =
            !rawLabel ||
            CONTENT_QUALITY_FILLER_LABELS.has(upper) ||
            isPlaceholderOrEmptyBrandValue(rawLabel) ||
            usedNodeKeys.has(upper);
          if (!isBad) {
            usedNodeKeys.add(upper);
            return node;
          }
          const replacement =
            fallbackPool.find((cand) => {
              const cu = cand.trim().toUpperCase();
              return (
                cu.length >= 3 &&
                !CONTENT_QUALITY_FILLER_LABELS.has(cu) &&
                !isPlaceholderOrEmptyBrandValue(cand) &&
                !usedNodeKeys.has(cu)
              );
            }) || `Path 0${nIdx + 1}`;
          usedNodeKeys.add(replacement.trim().toUpperCase());
          return { ...node, label: replacement };
        }),
      };
    }

    if (
      synced.metricLabel &&
      (CONTENT_QUALITY_FILLER_LABELS.has(synced.metricLabel.trim().toUpperCase()) ||
        isPlaceholderOrEmptyBrandValue(synced.metricLabel))
    ) {
      synced = {
        ...synced,
        metricLabel: 'MEASURED RESULT',
      };
    }

    if (synced.satLabels && synced.satLabels.length > 0) {
      const finalTitleTokens = new Set(
        `${synced.enTitle || ''} ${synced.centerTag || ''}`
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length >= 3)
      );
      const validSatIndices: number[] = [];
      synced.satLabels.forEach((lbl, sIdx) => {
        const trimmed = (lbl || '').trim();
        const norm = trimmed.toUpperCase();
        if (!norm) return;
        if (/\.\.\.|…$/.test(trimmed)) return;
        if (/[A-Za-z]{3,}/.test(synced.enTitle || '') && /[\u0600-\u06FF]/.test(trimmed)) return;
        if (CONTENT_QUALITY_FILLER_LABELS.has(norm)) return;
        if (categoryNorm && norm === categoryNorm) return;
        const toks = norm.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
        if (toks.length === 1 && (categoryTokens.has(toks[0]) || finalTitleTokens.has(toks[0]))) return;
        validSatIndices.push(sIdx);
      });
      if (validSatIndices.length !== synced.satLabels.length) {
        const filteredLabels = validSatIndices.map((sIdx) => synced.satLabels![sIdx]);
        const filteredReasons = synced.hubNodeReasons
          ? validSatIndices
              .map((sIdx) => synced.hubNodeReasons![sIdx])
              .filter(Boolean)
          : undefined;
        synced = {
          ...synced,
          satLabels: filteredLabels.length > 0 ? filteredLabels : undefined,
          hubNodeReasons:
            filteredReasons && filteredReasons.length > 0 ? filteredReasons : undefined,
        };
      }
    }

    // Remove fabricated 'Engineering Technical Report' placeholder credit and stale DevOps cliché takeaways
    if (synced.enCredit && /Engineering Technical Report/i.test(synced.enCredit)) {
      synced = { ...synced, enCredit: deck.brandUrl || '' };
    }
    if (synced.takeaways && synced.takeaways.length > 0) {
      const hasClicheTakeaway = synced.takeaways.some((t) =>
        /Modular decoupled boundaries|Predictable sub-second latency|Zero-downtime deployment pipeline/i.test(t.en || '')
      );
      if (isMulti && synced.type !== 'poster') {
        synced = { ...synced, takeaways: [] };
      } else if (hasClicheTakeaway) {
        synced = {
          ...synced,
          takeaways: synced.takeaways.filter(
            (t) =>
              !/Modular decoupled boundaries|Predictable sub-second latency|Zero-downtime deployment pipeline/i.test(t.en || '')
          ),
        };
      }
    }

    return sanitizeSlide(synced, idx, prevSlides.length);
  });

  const cleanChannel =
    deck.channel && /Engineering Technical Report/i.test(deck.channel)
      ? deck.brandUrl || 'marrok.org'
      : deck.channel;

  return {
    ...deck,
    channel: cleanChannel,
    caption: cleanedCaption,
    slides: cleanedSlides,
  };
}
