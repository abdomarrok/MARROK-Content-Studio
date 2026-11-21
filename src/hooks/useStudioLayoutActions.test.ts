import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useStudioLayoutActions, isDefaultLayoutOverride } from './useStudioLayoutActions.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';
import type { CarouselData } from '../types.ts';

describe('useStudioLayoutActions', () => {
  it('correctly evaluates default vs custom layout overrides', () => {
    expect(isDefaultLayoutOverride(null)).toBe(true);
    expect(isDefaultLayoutOverride(undefined)).toBe(true);
    expect(isDefaultLayoutOverride({ dx: 0, dy: 0, scale: 1, opacity: 1, align: 'center', hidden: false })).toBe(true);
    expect(isDefaultLayoutOverride({ dx: 10 })).toBe(false);
    expect(isDefaultLayoutOverride({ hidden: true })).toBe(false);
  });

  it('updates element layout override on active slide', () => {
    let currentDeck: CarouselData = { ...DEFAULT_STARTER_DECK };
    const applyDeckUpdate = vi.fn((updater) => {
      currentDeck = updater(currentDeck);
    });
    const onShowToast = vi.fn();

    const { result } = renderHook(() =>
      useStudioLayoutActions({
        carousel: currentDeck,
        currentSlideIndex: 0,
        applyDeckUpdate,
        onShowToast,
      })
    );

    act(() => {
      result.current.handleUpdateElementLayoutOverride('titleBlock', { dx: 15, dy: -5 });
    });

    expect(applyDeckUpdate).toHaveBeenCalled();
    expect(currentDeck.slides[0].layoutOverrides?.titleBlock?.dx).toBe(15);
    expect(currentDeck.slides[0].layoutOverrides?.titleBlock?.dy).toBe(-5);

    // Resetting layout override
    act(() => {
      result.current.handleResetSlideLayoutOverrides();
    });
    expect(currentDeck.slides[0].layoutOverrides).toBeUndefined();
    expect(onShowToast).toHaveBeenCalledWith('Reset all layout overrides on this slide');
  });

  it('handles field updates on active slide', () => {
    let currentDeck: CarouselData = { ...DEFAULT_STARTER_DECK };
    const applyDeckUpdate = vi.fn((updater) => {
      currentDeck = updater(currentDeck);
    });
    const onShowToast = vi.fn();

    const { result } = renderHook(() =>
      useStudioLayoutActions({
        carousel: currentDeck,
        currentSlideIndex: 0,
        applyDeckUpdate,
        onShowToast,
      })
    );

    act(() => {
      result.current.handleUpdateSlideFields({ enTitle: 'Updated Headline' });
    });
    expect(applyDeckUpdate).toHaveBeenCalled();
    expect(currentDeck.slides[0].enTitle).toBe('Updated Headline.');
  });
});
