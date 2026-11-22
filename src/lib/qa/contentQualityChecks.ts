import { CarouselData, SlideData } from '../../types.ts';
import { isPlaceholderOrEmptyBrandValue } from '../bundledTechSvgs.ts';
import { QACheckResult } from './types.ts';
import {
  CONTENT_QUALITY_FILLER_LABELS,
  KNOWN_BOILERPLATE_PATTERNS,
} from './constants.ts';

/** Check that slide does not contain unedited generic boilerplate phrases */
export function checkBoilerplatePhrases(slide: SlideData, idx: number): QACheckResult[] {
  const results: QACheckResult[] = [];
  const fieldsToCheck: (keyof SlideData)[] = ['enTitle', 'arTitle', 'enBody', 'arBody', 'ctaText'];

  for (const field of fieldsToCheck) {
    const val = slide[field];
    if (typeof val !== 'string' || !val) continue;

    for (const { pattern, description } of KNOWN_BOILERPLATE_PATTERNS) {
      if (pattern.test(val)) {
        results.push({
          id: `boilerplate-${idx}-${field}`,
          severity: 'fail',
          slideIndex: idx,
          field,
          message: `Slide ${idx + 1} ${field} contains known template boilerplate: ${description}. Replace with authentic content.`,
          value: val.substring(0, 50),
        });
        break;
      }
    }
  }

  return results;
}

/** Check that no two slides share identical body copy */
export function checkDuplicateBodyText(slides: SlideData[]): QACheckResult[] {
  const results: QACheckResult[] = [];
  const seenEn = new Map<string, number>();
  const seenAr = new Map<string, number>();

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];

    // Normalize English body
    const en = (slide.enBody || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (en.length > 20) {
      if (seenEn.has(en)) {
        const prevIdx = seenEn.get(en)!;
        results.push({
          id: `duplicate-en-body-${i}`,
          severity: 'fail',
          slideIndex: i,
          field: 'enBody',
          message: `Slide ${i + 1} English body is identical to Slide ${prevIdx + 1}. Each slide must have unique copy.`,
          value: slide.enBody?.substring(0, 60),
        });
      } else {
        seenEn.set(en, i);
      }
    }

    // Normalize Arabic body
    const ar = (slide.arBody || '')
      .replace(/[^\u0600-\u06FF\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (ar.length > 20) {
      if (seenAr.has(ar)) {
        const prevIdx = seenAr.get(ar)!;
        results.push({
          id: `duplicate-ar-body-${i}`,
          severity: 'fail',
          slideIndex: i,
          field: 'arBody',
          message: `Slide ${i + 1} Arabic body is identical to Slide ${prevIdx + 1}. Each slide must have unique copy.`,
          value: slide.arBody?.substring(0, 60),
        });
      } else {
        seenAr.set(ar, i);
      }
    }
  }

  return results;
}

/** Check for leftover placeholder text, empty brand fields, or default labels */
export function checkPlaceholders(slide: SlideData, idx: number): QACheckResult[] {
  const results: QACheckResult[] = [];
  const placeholderPatterns = [
    /CHANNEL NAME/i,
    /YOUR (?:BRAND|NAME|COMPANY)/i,
    /Lorem ipsum/i,
    /\bTODO\b/i,
    /\bTBD\b/i,
    /PLACEHOLDER/i,
    /\[INSERT/i,
    /XXX/,
    /\bSystem\s+[AB12]\b/i,
    /\bCompany\s+[AB12]\b/i,
    /\bBrand\s+[AB12]\b/i,
    /\bProduct\s+[AB12]\b/i,
    /\bTool\s+[AB12]\b/i,
    /\bPIPELINE\s+MIGRATION\b/i,
    /\bDATASTREAM\s+MIGRATION\b/i,
  ];

  const textFields: (keyof SlideData)[] = ['enTitle', 'arTitle', 'enBody', 'arBody', 'enCredit', 'arCredit', 'ctaText'];

  for (const field of textFields) {
    const text = slide[field];
    if (typeof text !== 'string') continue;

    for (const pattern of placeholderPatterns) {
      if (pattern.test(text)) {
        results.push({
          id: `placeholder-${idx}-${field}`,
          severity: 'fail',
          slideIndex: idx,
          field,
          message: `Slide ${idx + 1} ${field} contains placeholder text: "${text.substring(0, 40)}..."`,
        });
        break;
      }
    }
  }

  // Strict check for Subject Pair empty or placeholder brand fields / default labels
  if (slide.type === 'subjectPair' || slide.subjectPair) {
    const pair = slide.subjectPair;
    if (
      !pair ||
      isPlaceholderOrEmptyBrandValue(pair.beforeSystem) ||
      isPlaceholderOrEmptyBrandValue(pair.afterSystem)
    ) {
      results.push({
        id: `placeholder-${idx}-subjectPair-brands`,
        severity: 'fail',
        slideIndex: idx,
        field: 'subjectPair',
        message: `Slide ${idx + 1}: Subject Pair has empty or placeholder system names ("${pair?.beforeSystem || ''}" / "${pair?.afterSystem || ''}"). Extract two real system names from the source or switch layout.`,
      });
    }
    if (pair?.flowLabel && isPlaceholderOrEmptyBrandValue(pair.flowLabel)) {
      results.push({
        id: `placeholder-${idx}-subjectPair-flowLabel`,
        severity: 'fail',
        slideIndex: idx,
        field: 'subjectPair',
        message: `Slide ${idx + 1}: Subject Pair flow label contains default placeholder text ("${pair.flowLabel}").`,
      });
    }
    if (pair?.storyOwner && isPlaceholderOrEmptyBrandValue(pair.storyOwner)) {
      results.push({
        id: `placeholder-${idx}-subjectPair-storyOwner`,
        severity: 'fail',
        slideIndex: idx,
        field: 'subjectPair',
        message: `Slide ${idx + 1}: Subject Pair story owner contains placeholder text ("${pair.storyOwner}").`,
      });
    }
  }

  // Strict check for Compare empty or placeholder column labels
  if (slide.type === 'compare') {
    if (
      isPlaceholderOrEmptyBrandValue(slide.compareLeftTitle) ||
      isPlaceholderOrEmptyBrandValue(slide.compareRightTitle)
    ) {
      results.push({
        id: `placeholder-${idx}-compare-titles`,
        severity: 'fail',
        slideIndex: idx,
        field: 'compareLeftTitle',
        message: `Slide ${idx + 1}: Compare layout has empty or placeholder column titles ("${slide.compareLeftTitle || ''}" / "${slide.compareRightTitle || ''}").`,
      });
    }
  }

  // Strict check for Diagram Nodes containing placeholder text
  if (Array.isArray(slide.diagramNodes)) {
    for (const node of slide.diagramNodes) {
      if (isPlaceholderOrEmptyBrandValue(node.label)) {
        results.push({
          id: `placeholder-${idx}-diagramNodes`,
          severity: 'fail',
          slideIndex: idx,
          field: 'diagramNodes',
          message: `Slide ${idx + 1}: Diagram node contains empty or placeholder label ("${node.label || ''}").`,
        });
        break;
      }
    }
  }

  return results;
}

/**
 * Content Quality Gate:
 * Blocks export on template clichés, topic-repeating headlines, Hub node echoes/fillers,
 * literal Arabic template echoes, and Slide 1 multi-slide violations.
 */
export function checkContentQuality(carousel: CarouselData): QACheckResult[] {
  const results: QACheckResult[] = [];
  const slides = carousel.slides || [];
  const isSingleSlide = carousel.postFormat === 'single' || slides.length === 1;
  const categoryNorm = (carousel.category || '').trim().toUpperCase();
  const categoryTokens = new Set(
    categoryNorm
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3)
  );

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    if (s.standaloneMeme || s.imageFrameMode === 'full') continue;

    // 1. Headline merely repeats category / topic name without adding a claim or insight
    const cleanHeadline = (s.enTitle || '').trim();
    if (cleanHeadline && categoryTokens.size > 0) {
      const hTokens = cleanHeadline
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3);
      if (hTokens.length > 0 && hTokens.length <= 4) {
        const allInCategory = hTokens.every((t) => categoryTokens.has(t));
        const hasNumberOrQuestion = /\d|\?/.test(cleanHeadline);
        if (allInCategory && !hasNumberOrQuestion) {
          results.push({
            id: `content-quality-headline-echo-${i}`,
            severity: 'fail',
            slideIndex: i,
            field: 'enTitle',
            message: `Slide ${i + 1} headline ("${cleanHeadline}") merely repeats the topic/category name instead of a specific hook or insight.`,
          });
        }
      }
    }

    // 2. Slide 1 Hook discipline on multi-slide decks: zero body copy & <= 12 words
    if (i === 0 && !isSingleSlide && slides.length > 1) {
      if ((s.enBody || '').trim() || (s.arBody || '').trim()) {
        results.push({
          id: `content-quality-slide1-body-0`,
          severity: 'fail',
          slideIndex: 0,
          field: 'enBody',
          message: 'Slide 1 Hook must contain zero body copy (leave enBody & arBody blank on multi-slide decks).',
        });
      }
      const wordCount = cleanHeadline ? cleanHeadline.split(/\s+/).filter(Boolean).length : 0;
      if (wordCount > 12) {
        results.push({
          id: `content-quality-slide1-words-0`,
          severity: 'fail',
          slideIndex: 0,
          field: 'enTitle',
          message: `Slide 1 Hook has ${wordCount} words (max 12 words for scannability).`,
        });
      }
      if (s.type !== 'poster') {
        const teaserEnLen = (s.coverTeaserEn || '').trim().length;
        const teaserArLen = (s.coverTeaserAr || '').trim().length;
        if (teaserEnLen > 68) {
          results.push({
            id: 'content-quality-slide1-teaser-en-len',
            severity: 'warn',
            slideIndex: 0,
            field: 'coverTeaserEn',
            message: `Slide 1 English cover teaser is ${teaserEnLen} chars (keep <= 68 chars for clean 1-line cover framing).`,
          });
        }
        if (teaserArLen > 68) {
          results.push({
            id: 'content-quality-slide1-teaser-ar-len',
            severity: 'warn',
            slideIndex: 0,
            field: 'coverTeaserAr',
            message: `Slide 1 Arabic cover teaser is ${teaserArLen} chars (keep <= 68 chars for clean 1-line cover framing).`,
          });
        }
        if (
          s.coverStyle === 'metric-split' &&
          !/\d/.test(`${s.metricValue || ''} ${s.enTitle || ''} ${s.coverTeaserEn || ''}`)
        ) {
          results.push({
            id: 'content-quality-slide1-metric-split-digits',
            severity: 'warn',
            slideIndex: 0,
            field: 'coverStyle',
            message:
              'Slide 1 uses "Metric Split" cover style without a verified numeric figure — consider "Headline Hero" or add a grounded stat.',
          });
        }
      }
    }

    // 3. Hub node labels: no filler labels, no category/title echoes
    if (s.satLabels && s.satLabels.length > 0) {
      const titleTokens = new Set(
        `${s.enTitle || ''} ${s.centerTag || ''}`
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length >= 3)
      );
      for (const rawLbl of s.satLabels) {
        const norm = (rawLbl || '').trim().toUpperCase();
        if (!norm) continue;
        if (CONTENT_QUALITY_FILLER_LABELS.has(norm)) {
          results.push({
            id: `content-quality-filler-label-${i}`,
            severity: 'fail',
            slideIndex: i,
            field: 'satLabels',
            message: `Slide ${i + 1} Hub node "${norm}" is generic filler — replace with a real noun/term quoted from the source.`,
          });
          break;
        }
        if (categoryNorm && norm === categoryNorm) {
          results.push({
            id: `content-quality-hub-echo-${i}`,
            severity: 'fail',
            slideIndex: i,
            field: 'satLabels',
            message: `Slide ${i + 1} Hub node "${norm}" echoes the category badge instead of a distinct source concept.`,
          });
          break;
        }
        const lblTokens = norm.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
        if (lblTokens.length === 1 && (categoryTokens.has(lblTokens[0]) || titleTokens.has(lblTokens[0]))) {
          results.push({
            id: `content-quality-hub-echo-${i}`,
            severity: 'fail',
            slideIndex: i,
            field: 'satLabels',
            message: `Slide ${i + 1} Hub node "${norm}" echoes the headline/topic ("${s.enTitle}"). Quote distinct source nouns.`,
          });
          break;
        }
      }
      if (s.type === 'hub' && (!s.hubNodeReasons || s.hubNodeReasons.length === 0)) {
        results.push({
          id: `content-quality-hub-provenance-${i}`,
          severity: 'fail',
          slideIndex: i,
          field: 'satLabels',
          message: `Slide ${i + 1} Hub nodes lack source-quoted provenance justification.`,
        });
      }
    }

    // 4. Metric / Diagram filler label check
    if (CONTENT_QUALITY_FILLER_LABELS.has((s.metricLabel || '').trim().toUpperCase())) {
      results.push({
        id: `content-quality-metric-filler-${i}`,
        severity: 'fail',
        slideIndex: i,
        field: 'metricLabel',
        message: `Slide ${i + 1} metric label "${s.metricLabel}" is generic filler.`,
      });
    }
    if (s.diagramNodes && s.diagramNodes.length > 0) {
      const badNode = s.diagramNodes.find((n) =>
        CONTENT_QUALITY_FILLER_LABELS.has((n.label || '').trim().toUpperCase())
      );
      if (badNode) {
        results.push({
          id: `content-quality-node-filler-${i}`,
          severity: 'fail',
          slideIndex: i,
          field: 'diagramNodes',
          message: `Slide ${i + 1} diagram node "${badNode.label}" is generic filler.`,
        });
      }
    }

    // 5. Literal Arabic echo check: arTitle/arBody with >= 3 words must actually contain Arabic letters
    for (const arKey of ['arTitle', 'arBody'] as const) {
      const arText = (s[arKey] || '').trim();
      if (arText && !/[\u0600-\u06FF]/.test(arText) && arText.split(/\s+/).length >= 3) {
        results.push({
          id: `content-quality-arabic-missing-${i}-${arKey}`,
          severity: 'fail',
          slideIndex: i,
          field: arKey,
          message: `Slide ${i + 1} ${arKey} contains English-only text ("${arText.slice(0, 32)}") instead of genuine Arabic.`,
        });
      }
    }
    results.push(...checkBoilerplatePhrases(s, i));
  }

  // Also flag template clichés in the deck caption if present
  const captionText = (carousel.caption || '').trim();
  if (captionText) {
    for (const { pattern, description } of KNOWN_BOILERPLATE_PATTERNS) {
      if (pattern.test(captionText)) {
        results.push({
          id: 'content-quality-caption-boilerplate',
          severity: 'fail',
          field: 'caption',
          message: `Deck caption contains template cliché: ${description}.`,
        });
        break;
      }
    }
  }

  return results;
}
