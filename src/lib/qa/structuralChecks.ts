import { CarouselData, SlideData } from '../../types.ts';
import {
  CanvasDimensionSpec,
  MIN_BODY_FONT_SIZE,
  MIN_TITLE_FONT_SIZE,
  getCanvasDimensionSpec,
} from '../canvas/constants.ts';
import { computeSlideLayoutAwareness } from '../canvas/layoutAwareness.ts';
import { sanitizeSvgBlueprintMarkup } from '../canvas/svgBlueprint.ts';
import { QACheckResult } from './types.ts';

/** Check slide count is within acceptable range */
export function checkSlideCount(slides: SlideData[], isSingleSlide: boolean = false): QACheckResult {
  const count = slides.length;
  if (isSingleSlide && count === 1) {
    return {
      id: 'slide-count',
      severity: 'pass',
      message: '1 slide — Single-Slide Post format.',
      value: 1,
      limit: '1',
    };
  }
  if (count < 3) {
    return { id: 'slide-count', severity: 'fail', message: `Only ${count} slide(s). Minimum is 3.`, value: count, limit: '3–12' };
  }
  if (count > 12) {
    return { id: 'slide-count', severity: 'warn', message: `${count} slides is very long. Consider trimming to 8–10.`, value: count, limit: '8–10' };
  }
  if (count < 5) {
    return { id: 'slide-count', severity: 'warn', message: `${count} slides is short. Spec recommends 8–10 for full carousels.`, value: count, limit: '8–10' };
  }
  return { id: 'slide-count', severity: 'pass', message: `${count} slides — within range.`, value: count };
}

/** Check first slide (hook/hub) has meaningful content for thumbnail readability */
export function checkFirstFrame(slides: SlideData[], isSingleSlide: boolean = false): QACheckResult[] {
  const results: QACheckResult[] = [];
  if (slides.length === 0) return results;

  const first = slides[0];
  const validCoverTypes: SlideData['type'][] = [
    'hub',
    'row',
    'metric',
    'compare',
    'subjectPair',
    'code',
    'number',
    'poster',
    'image',
    'visual',
  ];
  if (!isSingleSlide && !validCoverTypes.includes(first.type)) {
    results.push({
      id: 'first-frame-type',
      severity: 'warn',
      slideIndex: 0,
      message: `Slide 1 type is "${first.type}" — use a visual cover archetype (hub, metric, compare, subjectPair, visual, or row) for best thumbnail impact.`,
    });
  }

  const isCaptionlessMeme = Boolean(first.imageUrl) || first.imageFrameMode === 'full';
  if ((!first.enTitle || first.enTitle.length < 3) && !isCaptionlessMeme) {
    results.push({
      id: 'first-frame-title',
      severity: 'fail',
      slideIndex: 0,
      field: 'enTitle',
      message: 'Slide 1 has no English headline. The cover must be readable at thumbnail size.',
    });
  }

  return results;
}

/** Check that the last slide is a CTA */
export function checkLastSlideCta(slides: SlideData[], isSingleSlide: boolean = false): QACheckResult {
  if (slides.length === 0) {
    return { id: 'last-slide-cta', severity: 'fail', message: 'No slides in deck.' };
  }
  if (isSingleSlide && slides.length === 1) {
    return {
      id: 'last-slide-cta',
      severity: 'pass',
      message: 'Single-slide post carries standalone footer attribution.',
    };
  }
  const last = slides[slides.length - 1];
  if (last.type !== 'cta') {
    return {
      id: 'last-slide-cta',
      severity: 'warn',
      slideIndex: slides.length - 1,
      message: `Last slide type is "${last.type}" — should be "cta" for engagement.`,
    };
  }
  return { id: 'last-slide-cta', severity: 'pass', message: 'Last slide is CTA.' };
}

/** Check that CTA slide has credit lines when applicable */
export function checkCreditPresence(slides: SlideData[]): QACheckResult[] {
  const results: QACheckResult[] = [];
  const ctaSlides = slides.filter((s) => s.type === 'cta');

  for (const cta of ctaSlides) {
    const idx = slides.indexOf(cta);
    if (!cta.enCredit && !cta.arCredit) {
      results.push({
        id: `missing-credit-${idx}`,
        severity: 'warn',
        slideIndex: idx,
        field: 'enCredit',
        message: `CTA slide ${idx + 1} has no source attribution. Add credit lines for third-party content.`,
      });
    }
  }

  return results;
}

/**
 * Validate archetype-specific fields (codeLanguage, diff prefixes, metric diff polarity, compare titles, cta)
 */
export function checkArchetypeFields(slide: SlideData, idx: number): QACheckResult[] {
  const results: QACheckResult[] = [];

  if (slide.type === 'code') {
    if (!slide.codeSnippet || slide.codeSnippet.trim().length === 0) {
      results.push({
        id: `archetype-code-missing-snippet-${idx}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'codeSnippet',
        message: `Slide ${idx + 1} (code archetype) is missing a codeSnippet.`,
      });
    } else {
      const lines = slide.codeSnippet.split('\n');
      if (lines.length > 7) {
        results.push({
          id: `archetype-code-lines-${idx}`,
          severity: 'warn',
          slideIndex: idx,
          field: 'codeSnippet',
          message: `Slide ${idx + 1} code snippet has ${lines.length} lines (recommended: max 7 for canvas window).`,
          value: lines.length,
          limit: '≤ 7 lines',
        });
      }

      // Check for terminal diff highlighting prefixes ($, +, -, ✔, >, #)
      const hasDiffPrefixes = lines.some((l) => /^[+$>\-✔#]/.test(l.trim()));
      if (!hasDiffPrefixes) {
        results.push({
          id: `archetype-code-prefixes-${idx}`,
          severity: 'warn',
          slideIndex: idx,
          field: 'codeSnippet',
          message: `Slide ${idx + 1} code lines lack diff prefixes ($, +, -, ✔) for terminal syntax highlighting.`,
        });
      }
    }

    if (!slide.codeLanguage || slide.codeLanguage.trim().length === 0) {
      results.push({
        id: `archetype-code-language-${idx}`,
        severity: 'warn',
        slideIndex: idx,
        field: 'codeLanguage',
        message: `Slide ${idx + 1} (code archetype) has no codeLanguage badge specified (e.g. BASH, TS, RUST, YAML).`,
      });
    }
  } else if (slide.type === 'metric') {
    const hasHookClaimCard = Boolean(slide.hookClaimCard?.statement);
    if (!hasHookClaimCard) {
      if (!slide.metricValue || slide.metricValue.trim().length === 0) {
        results.push({
          id: `archetype-metric-missing-value-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'metricValue',
          message: `Slide ${idx + 1} (metric archetype) has no metricValue.`,
        });
      }

      if (!slide.metricDiff || slide.metricDiff.trim().length === 0) {
        results.push({
          id: `archetype-metric-missing-diff-${idx}`,
          severity: 'warn',
          slideIndex: idx,
          field: 'metricDiff',
          message: `Slide ${idx + 1} (metric archetype) is missing a metricDiff comparison badge.`,
        });
      } else {
        // Confirm polarity indicator exists (▲, ▼, +, -)
        const hasPolarity = /[▲▼+\-]/.test(slide.metricDiff);
        if (!hasPolarity) {
          results.push({
            id: `archetype-metric-polarity-${idx}`,
            severity: 'warn',
            slideIndex: idx,
            field: 'metricDiff',
            message: `Slide ${idx + 1} metricDiff ("${slide.metricDiff}") lacks a polarity indicator (▲ or ▼).`,
          });
        }
      }
    }
  } else if (slide.type === 'compare') {
    if (!slide.compareLeftTitle || !slide.compareRightTitle) {
      results.push({
        id: `archetype-compare-titles-${idx}`,
        severity: 'warn',
        slideIndex: idx,
        field: 'compareLeftTitle',
        message: `Slide ${idx + 1} (compare archetype) is missing left or right comparison column titles.`,
      });
    }
  } else if (slide.type === 'cta') {
    if (!slide.ctaText || slide.ctaText.trim().length === 0) {
      results.push({
        id: `archetype-cta-missing-text-${idx}`,
        severity: 'warn',
        slideIndex: idx,
        field: 'ctaText',
        message: `Slide ${idx + 1} (CTA archetype) has no action button text.`,
      });
    }
  } else if (slide.type === 'subjectPair') {
    const pair = slide.subjectPair;
    if (!pair || (!pair.beforeSystem && !pair.afterSystem)) {
      results.push({
        id: `archetype-subjectpair-missing-systems-${idx}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'subjectPair',
        message: `Slide ${idx + 1} (subjectPair archetype) must specify before and after systems.`,
      });
    } else {
      if ((pair.logoWidthPct ?? 11) > 14) {
        results.push({
          id: `archetype-subjectpair-logo-size-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'subjectPair.logoWidthPct',
          message: `Slide ${idx + 1}: Subject Pair logo width (${pair.logoWidthPct}%) exceeds 14% max limit.`,
          value: `${pair.logoWidthPct}%`,
          limit: '≤ 14%',
        });
      }
      let logoCount = 0;
      if (!pair.beforeAsText && pair.beforeLogoKey) logoCount++;
      if (!pair.afterAsText && pair.afterLogoKey) logoCount++;
      if (logoCount > 2) {
        results.push({
          id: `archetype-subjectpair-logo-count-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'subjectPair',
          message: `Slide ${idx + 1}: Subject Pair has ${logoCount} logos (max 2 logos allowed).`,
          value: logoCount,
          limit: '≤ 2 logos',
        });
      }
      if (pair.isEdited || pair.isNonLibrarySource) {
        results.push({
          id: `archetype-subjectpair-edited-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'subjectPair',
          message: `Slide ${idx + 1}: Edited or non-library logo detected in Subject Pair. Use unedited bundled SVG or text name.`,
        });
      }
      if (pair.isMerged || pair.isOverlapping) {
        results.push({
          id: `archetype-subjectpair-merged-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'subjectPair',
          message: `Slide ${idx + 1}: Logos cannot be merged, blended, overlapped, or combined.`,
        });
      }
      if (pair.usesMascot) {
        results.push({
          id: `archetype-subjectpair-mascot-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'subjectPair',
          message: `Slide ${idx + 1}: Mascots are disallowed. Use official mark or styled text name.`,
        });
      }
    }
  } else if (slide.type === 'visual') {
    const spec = slide.visualSpec;
    if (!spec || !spec.kind) {
      results.push({
        id: `archetype-visual-missing-spec-${idx}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'visualSpec',
        message: `Slide ${idx + 1} (visual archetype) is missing a visualSpec configuration.`,
      });
    } else if (spec.kind === 'bar-chart') {
      if (!spec.bars || spec.bars.length === 0) {
        results.push({
          id: `archetype-visual-bars-empty-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} (bar-chart visual) needs at least 1 data bar.`,
        });
      }
    } else if (spec.kind === 'sequence') {
      if (!spec.actors || spec.actors.length < 2 || !spec.steps || spec.steps.length === 0) {
        results.push({
          id: `archetype-visual-sequence-incomplete-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} (sequence visual) requires at least 2 actors and 1 step.`,
        });
      }
    } else if (spec.kind === 'timeline') {
      if (!spec.events || spec.events.length < 2) {
        results.push({
          id: `archetype-visual-timeline-incomplete-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} (timeline visual) requires at least 2 chronological events.`,
        });
      }
    } else if (spec.kind === 'matrix') {
      if (!spec.quadrants || spec.quadrants.length < 2) {
        results.push({
          id: `archetype-visual-matrix-incomplete-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} (matrix visual) requires at least 2 populated quadrants.`,
        });
      }
    } else if (spec.kind === 'table') {
      if (!spec.columns || spec.columns.length < 2 || !spec.rows || spec.rows.length === 0) {
        results.push({
          id: `archetype-visual-table-incomplete-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} (table visual) requires at least 2 columns and 1 data row.`,
        });
      }
    } else if (spec.kind === 'callout') {
      if (!spec.quote?.trim() && !spec.statValue?.trim()) {
        results.push({
          id: `archetype-visual-callout-empty-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} (callout visual) needs a quote statement or hero stat value.`,
        });
      }
    } else if (spec.kind === 'svg') {
      const sanitized = sanitizeSvgBlueprintMarkup(spec.svgCode || '', spec.viewBox);
      if (!sanitized.isValid) {
        results.push({
          id: `archetype-visual-svg-invalid-${idx}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} (custom SVG visual) has empty or invalid SVG markup.`,
        });
      } else if (sanitized.warnings.length > 0) {
        results.push({
          id: `archetype-visual-svg-sanitized-${idx}`,
          severity: 'warn',
          slideIndex: idx,
          field: 'visualSpec',
          message: `Slide ${idx + 1} custom SVG had unsafe elements/attributes stripped during sanitization: ${sanitized.warnings[0]}`,
        });
      }
    }
  }

  return results;
}

/**
 * Check Arabic RTL text safe-zone bounds (right margin clearance >= 135px and vertical boundary y <= 1760)
 */
export function checkArabicSafeZone(slide: SlideData, idx: number, spec = getCanvasDimensionSpec()): QACheckResult[] {
  const results: QACheckResult[] = [];
  const scaleFactor = spec.height / 1920;
  const ceiling = spec.safeFooterCeilingY;

  if (slide.arBody) {
    const lines = slide.arBody.split('\n');
    const maxRecommendedLines = spec.height <= 1080 ? 3 : 4;
    if (lines.length > maxRecommendedLines) {
      results.push({
        id: `arabic-safezone-lines-${idx}`,
        severity: 'warn',
        slideIndex: idx,
        field: 'arBody',
        message: `Slide ${idx + 1} Arabic body has ${lines.length} lines (max ${maxRecommendedLines} recommended to clear fixed footer ceiling y=${ceiling}).`,
        value: lines.length,
        limit: `≤ ${maxRecommendedLines} lines`,
      });
    }

    // Check for overly long unbroken words/tokens in Arabic body that could clip on the right
    const words = slide.arBody.split(/\s+/);
    for (const w of words) {
      if (w.length > 35) {
        results.push({
          id: `arabic-safezone-word-length-${idx}`,
          severity: 'warn',
          slideIndex: idx,
          field: 'arBody',
          message: `Slide ${idx + 1} Arabic body contains an unbroken string of ${w.length} chars ("${w.slice(0, 15)}..."), which may overflow the right safe-zone margin.`,
        });
        break;
      }
    }
    // Check for explicit vertical offset pushing text below active preset footer ceiling
    const arDy = slide.layoutOverrides?.arabicBodyBlock?.dy ?? 0;
    const enDy = slide.layoutOverrides?.bodyBlock?.dy ?? 0;
    const maxArDy = Math.round(120 * scaleFactor);
    const maxEnDy = Math.round(160 * scaleFactor);
    if (arDy > maxArDy || enDy > maxEnDy) {
      results.push({
        id: `vertical-overflow-${idx}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'layoutOverrides',
        message: `Slide ${idx + 1} vertical offset pushes text past the y=${ceiling} footer ceiling (${spec.shortLabel}).`,
        value: Math.max(arDy, enDy),
        limit: `y ≤ ${ceiling}`,
      });
    }
  }

  return results;
}

/**
 * Check if key text or diagram elements violate active preset safe zones (scaled proportionally from 9:16 to 4:5 and 1:1).
 */
export function checkTikTokSafeZoneViolations(slide: SlideData, idx: number, spec = getCanvasDimensionSpec()): QACheckResult[] {
  const results: QACheckResult[] = [];
  const overrides = slide.layoutOverrides;
  if (!overrides) return results;

  const hScale = spec.height / 1920;
  const wScale = (spec.safeContentWidth || 846) / 846;

  const headerDy = overrides.headerBadge?.dy ?? 0;
  const graphicDy = overrides.graphicCard?.dy ?? 0;
  const titleDy = overrides.titleBlock?.dy ?? 0;
  const arTitleDy = overrides.arabicTitleBlock?.dy ?? 0;
  const bodyDy = overrides.bodyBlock?.dy ?? 0;
  const arBodyDy = overrides.arabicBodyBlock?.dy ?? 0;

  if (
    headerDy < Math.round(-35 * hScale) ||
    graphicDy < Math.round(-75 * hScale) ||
    titleDy < Math.round(-140 * hScale)
  ) {
    results.push({
      id: `tiktok-safezone-top-${idx}`,
      severity: 'fail',
      slideIndex: idx,
      field: 'layoutOverrides',
      message: `Slide ${idx + 1}: Key element sits inside the top UI safe margin (${spec.shortLabel}). Auto-fix to restore top clearance.`,
    });
  }

  if (
    bodyDy > Math.round(75 * hScale) ||
    arBodyDy > Math.round(55 * hScale) ||
    graphicDy > Math.round(140 * hScale) ||
    titleDy > Math.round(110 * hScale) ||
    arTitleDy > Math.round(95 * hScale)
  ) {
    results.push({
      id: `tiktok-safezone-bottom-${idx}`,
      severity: 'fail',
      slideIndex: idx,
      field: 'layoutOverrides',
      message: `Slide ${idx + 1}: Key text or diagram sits past the bottom footer safe ceiling (y=${spec.safeFooterCeilingY}, ${spec.shortLabel}).`,
    });
  }

  const maxRightDx = Math.round(65 * wScale);
  for (const [elKey, ov] of Object.entries(overrides)) {
    if (ov && !ov.hidden && (ov.dx ?? 0) > maxRightDx) {
      results.push({
        id: `tiktok-safezone-right-${idx}-${elKey}`,
        severity: 'fail',
        slideIndex: idx,
        field: 'layoutOverrides',
        message: `Slide ${idx + 1}: Element "${elKey}" sits past the right safe-zone margin (dx=+${ov.dx}px, limit=${maxRightDx}px).`,
      });
      break;
    }
  }

  return results;
}

/**
 * Check for truncated descriptions ending with trailing "and...", "or...", "with...", or any ellipsis "…" / "..."
 */
export function checkTruncatedDescriptions(slide: SlideData, idx: number): QACheckResult[] {
  const results: QACheckResult[] = [];
  const fields: Array<{ key: 'enTitle' | 'arTitle' | 'enBody' | 'arBody'; label: string }> = [
    { key: 'enTitle', label: 'EN title' },
    { key: 'arTitle', label: 'AR title' },
    { key: 'enBody', label: 'EN body' },
    { key: 'arBody', label: 'AR body' },
  ];

  for (const { key, label } of fields) {
    const val = (slide[key] || '').trim();
    if (!val) continue;
    if (
      /\b(?:and|or|with|to|for|in|of|by)\s*(?:\.{2,}|…)\s*$/i.test(val) ||
      /,\s*(?:and|or)?\s*(?:\.{2,}|…)\s*$/i.test(val) ||
      /(?:\.{3}|…)\s*$/.test(val)
    ) {
      results.push({
        id: `truncated-description-${idx}-${key}`,
        severity: 'fail',
        slideIndex: idx,
        field: key,
        message: `Slide ${idx + 1} ${label}: Truncated text ("${val.slice(-24)}") detected. Never end a line with "…".`,
        value: val,
      });
    }
  }

  return results;
}

/**
 * Check minimum font sizes across ALL aspect ratios (9:16, 3:4, 4:5, 1:1):
 * - Title & body text must be >= 24px (MIN_TITLE_FONT_SIZE / MIN_BODY_FONT_SIZE)
 * - Footer text/badge must be >= 22px (MIN_FOOTER_FONT_SIZE)
 */
export function checkMinFontSizeViolation(
  slide: SlideData,
  idx: number,
  spec: CanvasDimensionSpec,
  carousel: CarouselData
): QACheckResult[] {
  const results: QACheckResult[] = [];
  const overrides = slide.layoutOverrides;

  if (overrides) {
    for (const [elKey, ov] of Object.entries(overrides)) {
      if (!ov || ov.hidden || ov.scale === undefined) continue;
      const isTextEl =
        elKey === 'titleBlock' ||
        elKey === 'arabicTitleBlock' ||
        elKey === 'bodyBlock' ||
        elKey === 'arabicBodyBlock';
      const isCompact = spec.height < 1920;
      const baseNominalFont =
        elKey === 'titleBlock' || elKey === 'arabicTitleBlock'
          ? isCompact
            ? 62
            : 72
          : isCompact
          ? spec.height <= 1080
            ? 34
            : 38
          : 44;
      const scaledNominalFont = Math.round(baseNominalFont * ov.scale);
      if (ov.scale < 0.75 || (isTextEl && scaledNominalFont < MIN_BODY_FONT_SIZE)) {
        results.push({
          id: `min-font-size-${idx}-${elKey}`,
          severity: 'fail',
          slideIndex: idx,
          field: 'layoutOverrides',
          message: `Slide ${idx + 1}: "${elKey}" scale (${Math.round(ov.scale * 100)}%) shrinks text below the ${MIN_BODY_FONT_SIZE}px minimum on ${spec.shortLabel}.`,
          value: isTextEl ? `${scaledNominalFont}px` : `${Math.round(ov.scale * 100)}%`,
          limit: `≥ ${MIN_BODY_FONT_SIZE}px`,
        });
      }
    }
  }

  // Verify resolved layout awareness typography sizes strictly meet the >=24px floor on this aspect ratio
  if (!(slide.standaloneMeme || slide.imageFrameMode === 'full')) {
    const layout = computeSlideLayoutAwareness(slide, carousel, idx);
    const textBlocks: Array<{
      key: string;
      minPx: number;
      block: typeof layout.titleBlock;
    }> = [
      { key: 'titleBlock', minPx: MIN_TITLE_FONT_SIZE, block: layout.titleBlock },
      { key: 'arabicTitleBlock', minPx: MIN_TITLE_FONT_SIZE, block: layout.arabicTitleBlock },
      { key: 'coverTeaserBlock', minPx: MIN_BODY_FONT_SIZE, block: layout.coverTeaserBlock },
      { key: 'arabicCoverTeaserBlock', minPx: MIN_BODY_FONT_SIZE, block: layout.arabicCoverTeaserBlock },
      { key: 'bodyBlock', minPx: MIN_BODY_FONT_SIZE, block: layout.bodyBlock },
      { key: 'arabicBodyBlock', minPx: MIN_BODY_FONT_SIZE, block: layout.arabicBodyBlock },
    ];
    for (const { key, minPx, block } of textBlocks) {
      if (block && !block.hidden && block.lines.length > 0 && block.fontSize < minPx) {
        results.push({
          id: `min-font-size-${idx}-${key}-computed`,
          severity: 'fail',
          slideIndex: idx,
          field: key,
          message: `Slide ${idx + 1}: "${key}" resolved to ${block.fontSize}px on ${spec.shortLabel} (minimum ${minPx}px required across all ratios).`,
          value: `${block.fontSize}px`,
          limit: `≥ ${minPx}px`,
        });
      }
    }
  }

  return results;
}

export function parseHexRgb(hex: string): [number, number, number] {
  const clean = (hex || '#000000').replace(/[^0-9a-fA-F]/g, '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  const padded = clean.padEnd(6, '0').slice(0, 6);
  return [
    parseInt(padded.slice(0, 2), 16),
    parseInt(padded.slice(2, 4), 16),
    parseInt(padded.slice(4, 6), 16),
  ];
}

export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function computeWcagContrastRatio(fgHex: string, bgHex: string): number {
  const lumA = relativeLuminance(parseHexRgb(fgHex));
  const lumB = relativeLuminance(parseHexRgb(bgHex));
  const brightest = Math.max(lumA, lumB);
  const darkest = Math.min(lumA, lumB);
  return Number(((brightest + 0.05) / (darkest + 0.05)).toFixed(2));
}
