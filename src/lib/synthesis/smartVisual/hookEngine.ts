import type { SlideData, SlideType } from '../../../types.ts';
import { fixArabicPunctuation } from '../../text/arabicBiDi.ts';
import {
  deriveSlideCornerTag,
  explainArchetypeChoice,
  inferDynamicCoverArchetype,
} from './archetypeInference.ts';
import { buildNonNumericHookClaimCard } from './hookClaimCard.ts';
import { detectSubjectPairFromText } from './subjectPairDetection.ts';
import { extractSourceQuotedHubNodes } from './textIcons.ts';
import { resolveSmartSlideVisuals } from './visualDefaultsResolver.ts';

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

export function capHeadlineToTwelveWords(headline: string, isArabic: boolean = false): string {
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
  const titleEchoSet = new Set(
    `${slide.enTitle || ''} ${slide.centerTag || ''}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3)
  );
  const existingSatEchoesTitle = Boolean(
    slide.satLabels?.some((lbl) => {
      const toks = (lbl || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3);
      return toks.length === 1 && titleEchoSet.has(toks[0]);
    })
  );

  const quotedHub =
    !existingSatEchoesTitle && slide.hubNodeReasons && slide.hubNodeReasons.length >= 4
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
