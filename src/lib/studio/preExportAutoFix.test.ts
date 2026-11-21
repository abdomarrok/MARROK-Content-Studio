import { describe, it, expect } from 'vitest';
import { DEFAULT_STARTER_DECK } from '../presets.ts';
import { applyPreExportAutoFixToDeck } from './preExportAutoFix.ts';

describe('preExportAutoFix pure deck transformations', () => {
  it('infers source attribution from sourceMeta.url hostname on missingSource fix', () => {
    const deck = {
      ...DEFAULT_STARTER_DECK,
      channel: 'Engineering Technical Report',
      brand: 'MARROK',
      brandUrl: 'marrok.org',
      sourceMeta: {
        ...DEFAULT_STARTER_DECK.sourceMeta,
        creator: '',
        channel: '',
        title: '',
        url: 'https://www.cloudflare.com/blog/workers-architecture',
      },
    };

    const { nextDeck, toastMessage } = applyPreExportAutoFixToDeck(deck, 'missingSource');
    expect(toastMessage).toContain('Source attribution');
    expect(nextDeck.channel).toBe('cloudflare.com');
    expect(nextDeck.sourceMeta?.creator).toBe('cloudflare.com');
    const lastSlide = nextDeck.slides[nextDeck.slides.length - 1];
    expect(lastSlide.enCredit).toBe('Source: cloudflare.com');
    expect(lastSlide.arCredit).toBe('المصدر: cloudflare.com');
  });

  it('clamps out-of-bounds layoutOverrides on safeZones fix and raises scale floor on minFontSize fix', () => {
    const deck = {
      ...DEFAULT_STARTER_DECK,
      slides: DEFAULT_STARTER_DECK.slides.map((s, idx) =>
        idx === 0
          ? {
              ...s,
              layoutOverrides: {
                titleBlock: { dx: 180, dy: -120, scale: 0.72 },
              },
            }
          : s
      ),
    };

    const safeZoneFixed = applyPreExportAutoFixToDeck(deck, 'safeZones', { targetSlideIdx: 0 });
    expect(safeZoneFixed.nextDeck.slides[0].layoutOverrides?.titleBlock?.dx).toBe(45);
    expect(safeZoneFixed.nextDeck.slides[0].layoutOverrides?.titleBlock?.dy).toBe(-25);

    const fontFixed = applyPreExportAutoFixToDeck(safeZoneFixed.nextDeck, 'minFontSize', {
      targetSlideIdx: 0,
    });
    expect(fontFixed.nextDeck.slides[0].layoutOverrides?.titleBlock?.scale).toBe(1);
  });

  it('marks unverifiedNumbers across sourceMeta and every slide', () => {
    const deck = {
      ...DEFAULT_STARTER_DECK,
      sourceMeta: { ...DEFAULT_STARTER_DECK.sourceMeta, verifiedNumbers: false },
      slides: DEFAULT_STARTER_DECK.slides.map((s) => ({ ...s, numbersVerified: false })),
    };

    const { nextDeck } = applyPreExportAutoFixToDeck(deck, 'unverifiedNumbers');
    expect(nextDeck.sourceMeta?.verifiedNumbers).toBe(true);
    expect(nextDeck.slides.every((s) => s.numbersVerified === true)).toBe(true);
  });
});
