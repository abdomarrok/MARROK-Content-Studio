import { describe, expect, it } from 'vitest';
import { InsufficientSourceError, synthesizeCarousel } from './synthesizer';

describe('synthesizeCarousel offline citations', () => {
  it('does not fabricate authoritative sources or citations', () => {
    const carousel = synthesizeCarousel({
      prompt: 'Rust Actix reached a 1.66x speedup over Go Gin in 2025 benchmarks.',
    });
    const serialized = JSON.stringify(carousel);

    expect(serialized).not.toContain('USENIX');
    expect(serialized).not.toContain('Official Portal');
    expect(carousel.caption).toContain('No external source cited');
    expect(carousel.caption).toContain('1.66x');
    expect(carousel.sourceMeta?.groundingSources).toEqual([]);
    expect(carousel.facts?.every((fact) => !fact.sourceUrl && !fact.sourceTitle)).toBe(true);
    expect(carousel.firstComment).toContain('Add your primary source link');
  });

  it('rejects empty or thin inputs with InsufficientSourceError instead of fabricating copy', () => {
    expect(() => synthesizeCarousel({ prompt: '' })).toThrow(InsufficientSourceError);
    expect(() => synthesizeCarousel({ prompt: 'AI' })).toThrow(InsufficientSourceError);
    expect(() =>
      synthesizeCarousel({ imageFileName: '20760.png', inputMode: 'upload' })
    ).toThrow(InsufficientSourceError);
  });

  it('eliminates raw non-semantic image filenames like 20760.png from titles and deck when real media is uploaded', () => {
    const carousel = synthesizeCarousel({
      imageFileName: '20760.png',
      inputMode: 'upload',
      hasMedia: true,
    });

    const serialized = JSON.stringify(carousel);
    expect(serialized).not.toContain('20760');
    expect(serialized).not.toContain('20760png');
    expect(serialized).not.toContain('.png');

    // Slide 1 title should be clean, non-template, and have no body copy
    expect(carousel.slides[0]?.enTitle?.length).toBeGreaterThan(8);
    expect(carousel.slides[0]?.enTitle).not.toContain('System Architecture & Engineering.');
    expect(carousel.slides[0]?.arTitle).toMatch(/[\u0600-\u06FF]/);
    expect(carousel.slides[0]?.enBody).toBe('');
    expect(carousel.slides[0]?.arBody).toBe('');
  });

  it('converts human-named technical image filenames into proper topics when media is uploaded', () => {
    const carousel = synthesizeCarousel({
      imageFileName: 'microservices-event-architecture.png',
      inputMode: 'upload',
      hasMedia: true,
    });

    expect(JSON.stringify(carousel).toLowerCase()).toContain('microservices');
    expect(JSON.stringify(carousel)).not.toContain('.png');
  });

  it('uses categoryHint when imageFileName is non-semantic and media is uploaded', () => {
    const carousel = synthesizeCarousel({
      imageFileName: 'IMG_20760.jpg',
      categoryHint: 'CYBERSECURITY & ZERO-TRUST',
      inputMode: 'upload',
      hasMedia: true,
    });

    const serialized = JSON.stringify(carousel);
    expect(serialized).not.toContain('IMG_20760');
    expect(serialized).not.toContain('.jpg');
    expect(carousel.theme).toBe('cyber');
  });
});
