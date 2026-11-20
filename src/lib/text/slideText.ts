import type { SlideData } from '../../types.ts';

/**
 * Extracts normalized, concatenated text across title and body fields of a slide.
 * Used for archetype inference, layout awareness, NLP pacing, and content quality auditing.
 */
export function extractSlideText(
  slide: Partial<SlideData>,
  options?: { includeArabic?: boolean; lower?: boolean }
): string {
  const parts = [
    slide.enTitle || '',
    slide.enBody || '',
    options?.includeArabic !== false ? slide.arTitle || '' : '',
    options?.includeArabic !== false ? slide.arBody || '' : '',
  ].filter(Boolean);

  const combined = parts.join(' ').trim();
  return options?.lower ? combined.toLowerCase() : combined;
}
