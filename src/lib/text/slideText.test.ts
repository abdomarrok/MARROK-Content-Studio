import { describe, it, expect } from 'vitest';
import { extractSlideText } from './slideText.ts';
import type { SlideData } from '../../types.ts';

describe('extractSlideText', () => {
  const sampleSlide: Partial<SlideData> = {
    enTitle: 'Zero-Trust Architecture',
    enBody: 'Microsegmentation limits lateral blast radius across internal networks.',
    arTitle: 'بنية انعدام الثقة',
    arBody: 'التقسيم الدقيق يحد من نطاق التأثير الجانبي.',
  };

  it('combines English and Arabic titles and bodies by default', () => {
    const text = extractSlideText(sampleSlide);
    expect(text).toContain('Zero-Trust Architecture');
    expect(text).toContain('Microsegmentation');
    expect(text).toContain('بنية انعدام الثقة');
  });

  it('returns lowercase when lower: true is specified', () => {
    const lower = extractSlideText(sampleSlide, { lower: true });
    expect(lower).toContain('zero-trust architecture');
    expect(lower).toContain('blast radius');
  });

  it('excludes Arabic when includeArabic: false is specified', () => {
    const text = extractSlideText(sampleSlide, { includeArabic: false });
    expect(text).toContain('Zero-Trust Architecture');
    expect(text).not.toContain('بنية انعدام الثقة');
  });

  it('handles empty or missing fields gracefully', () => {
    expect(extractSlideText({})).toBe('');
    expect(extractSlideText({ enTitle: 'Only Title' })).toBe('Only Title');
  });
});
