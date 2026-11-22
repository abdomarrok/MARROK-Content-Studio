import { CarouselData, SlideData } from '../../types.ts';
import { SUMMARY_STOP_WORDS } from './constants.ts';
import { checkContentQuality } from './contentQualityChecks.ts';
import { checkArabicTranslatedTechTerms } from './textChecks.ts';
import { GathererQualityGateResult, SummaryOnlyDetectionResult } from './types.ts';

export function extractMeaningfulTokens(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !SUMMARY_STOP_WORDS.has(w));
}

/**
 * Detects whether a draft deck or candidate mainly summarizes the source article
 * without adding a sharp product/startup takeaway ("what it means for your product").
 */
export function detectSummaryOnlyDraft(input: {
  title?: string;
  summary?: string;
  marrokAngle?: string;
  slides?: SlideData[];
}): SummaryOnlyDetectionResult {
  const sourceTokens = new Set(extractMeaningfulTokens(`${input.title || ''} ${input.summary || ''}`));
  const slides = input.slides || [];
  const draftBodyText = slides
    .map((s) => `${s.enTitle || ''} ${s.enBody || ''}`)
    .join(' ');
  const draftTokens = extractMeaningfulTokens(draftBodyText);
  const angle = (input.marrokAngle || '').trim();
  const angleTokens = extractMeaningfulTokens(angle);
  const titleTokens = new Set(extractMeaningfulTokens(input.title || ''));

  const angleRepeatsHeadlineOnly =
    angleTokens.length > 0 &&
    titleTokens.size > 0 &&
    angleTokens.filter((t) => !titleTokens.has(t)).length <= 1;

  if (sourceTokens.size < 4 || draftTokens.length === 0) {
    if (!angle || angle.length < 18 || angleRepeatsHeadlineOnly) {
      return {
        isSummaryOnly: true,
        overlapRatio: 1,
        reason: 'Draft repeats headline without an explicit "what it means for your product" angle.',
      };
    }
    return { isSummaryOnly: false, overlapRatio: 0 };
  }

  let overlapCount = 0;
  let novelCount = 0;
  const seenDraft = new Set<string>();
  for (const tok of draftTokens) {
    if (seenDraft.has(tok)) continue;
    seenDraft.add(tok);
    if (sourceTokens.has(tok)) {
      overlapCount += 1;
    } else {
      novelCount += 1;
    }
  }

  const totalUniqueDraft = Math.max(1, overlapCount + novelCount);
  const overlapRatio = Number((overlapCount / totalUniqueDraft).toFixed(2));

  const isMultiSlide = slides.length > 1;
  const hasStrongAngle =
    angle.length >= 24 &&
    !angleRepeatsHeadlineOnly &&
    /\b(for|product|team|teams|startup|startups|sme|smes|scale|cost|latency|production|ship|avoid|adopt|migration|architecture|users|engineering|means|why|cuts?|reduces?)\b/i.test(
      angle
    );

  // A multi-slide draft that shares >62% vocabulary with the raw source summary without novel framing
  // OR lacks an original non-headline product angle triggers a summary-only originality warning.
  if ((isMultiSlide && overlapRatio >= 0.62 && novelCount < 10) || angleRepeatsHeadlineOnly) {
    return {
      isSummaryOnly: true,
      overlapRatio,
      reason: angleRepeatsHeadlineOnly
        ? 'Draft only echoes the source headline — rewrite the Marrok angle to explain what it means for your product.'
        : `Draft mirrors ${Math.round(overlapRatio * 100)}% of the source summary — add original product implications, tradeoffs, or architecture takeaways.`,
    };
  }

  if (!hasStrongAngle && overlapRatio >= 0.55) {
    return {
      isSummaryOnly: true,
      overlapRatio,
      reason: 'Draft reads close to a source summary. Sharpen the Marrok angle with concrete startup/product impact.',
    };
  }

  return { isSummaryOnly: false, overlapRatio };
}

/**
 * Quality Gate run on Inbox Gatherer candidates before Accept / Move to Draft.
 * Blocks EN/AR title mismatch, filler Arabic, template clichés, invalid Slide 1 hubs,
 * 3-in-a-row layout streaks, and missing/trivial Marrok angles.
 */
export function evaluateGathererCandidateQuality(input: {
  title: string;
  draftTitle?: string;
  summary?: string;
  marrokAngle?: string;
  deck: CarouselData;
}): GathererQualityGateResult {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const deck = input.deck;
  const slides = deck?.slides || [];

  // 1. Originality: required editable "Marrok angle"
  const cleanAngle = (input.marrokAngle || deck?.sourceMeta?.marrokAngle || '').trim();
  if (cleanAngle.length < 15) {
    blockingReasons.push(
      'Missing "Marrok angle" (minimum 15 chars explaining what this means for your product).'
    );
  }

  // 2. Run deck content quality checks (template clichés, filler Arabic, topic echoes, Slide 1 rules)
  const contentChecks = checkContentQuality(deck);
  for (const res of contentChecks) {
    if (res.severity === 'fail') {
      if (!blockingReasons.includes(res.message)) {
        blockingReasons.push(res.message);
      }
    } else if (res.severity === 'warn') {
      if (!warnings.includes(res.message)) {
        warnings.push(res.message);
      }
    }
  }

  // 3. EN/AR Title alignment & bilingual completeness per slide
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    if (s.standaloneMeme || s.imageFrameMode === 'full') continue;
    const enTitle = (s.enTitle || '').trim();
    const arTitle = (s.arTitle || '').trim();

    if (!enTitle) {
      blockingReasons.push(`Slide ${i + 1}: Missing English title (enTitle).`);
      continue;
    }

    if (!arTitle || !/[\u0600-\u06FF]/.test(arTitle)) {
      blockingReasons.push(`Slide ${i + 1}: EN/AR title mismatch — missing Arabic translation in arTitle.`);
      continue;
    }

    const enWordCount = enTitle.split(/\s+/).filter(Boolean).length;
    const arWordCount = arTitle.split(/\s+/).filter(Boolean).length;
    if (enWordCount >= 6 && arWordCount <= 1) {
      blockingReasons.push(
        `Slide ${i + 1}: EN/AR title mismatch — English title has ${enWordCount} words while Arabic title has ${arWordCount} word.`
      );
    }

    // Translated tech-term warning
    const arTermWarnings = checkArabicTranslatedTechTerms(s, i);
    for (const w of arTermWarnings) {
      warnings.push(w.message);
    }
  }

  // 4. Storyboard checks: Slide 1 never Hub, and no 3 identical layouts in a row
  const isSingle = deck.postFormat === 'single' || slides.length === 1;
  if (!isSingle && slides.length > 1) {
    if (slides[0]?.type === 'hub') {
      blockingReasons.push('Slide 1 must use a focused Hook layout (not Hub diagram).');
    }
    for (let i = 2; i < slides.length; i++) {
      if (
        slides[i].type === slides[i - 1].type &&
        slides[i - 1].type === slides[i - 2].type &&
        slides[i].type !== 'cta'
      ) {
        blockingReasons.push(
          `Storyboard repeats "${slides[i].type}" 3 times in a row (Slides ${i - 1}–${i + 1}).`
        );
        break;
      }
    }
  }

  // 5. Originality / Summary-only warning
  const summaryAudit = detectSummaryOnlyDraft({
    title: input.title,
    summary: input.summary,
    marrokAngle: cleanAngle,
    slides,
  });
  if (summaryAudit.isSummaryOnly && summaryAudit.reason) {
    warnings.push(summaryAudit.reason);
  }

  return {
    passed: blockingReasons.length === 0,
    blockingReasons,
    warnings,
    isSummaryOnly: summaryAudit.isSummaryOnly,
    summaryOnlyReason: summaryAudit.reason,
  };
}
