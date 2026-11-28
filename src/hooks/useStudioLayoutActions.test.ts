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

  it('handles canvas element deletion for takeawaysBlock vs general element', () => {
    let currentDeck: CarouselData = {
      ...DEFAULT_STARTER_DECK,
      slides: [
        {
          ...DEFAULT_STARTER_DECK.slides[0],
          takeaways: [{ en: 'Point 1', ar: 'نقطة 1' }],
          layoutOverrides: {
            takeawaysBlock: { dx: 10 },
            titleBlock: { dy: 20 },
          },
        },
      ],
    };
    const applyDeckUpdate = vi.fn((updater) => {
      currentDeck = updater(currentDeck);
    });
    const onShowToast = vi.fn();
    const setSelectedElementId = vi.fn();

    const { result } = renderHook(() =>
      useStudioLayoutActions({
        carousel: currentDeck,
        currentSlideIndex: 0,
        applyDeckUpdate,
        onShowToast,
        setSelectedElementId,
      })
    );

    // Delete takeawaysBlock
    act(() => {
      result.current.handleDeleteCanvasElement('takeawaysBlock');
    });
    expect(currentDeck.slides[0].takeaways).toEqual([]);
    expect(currentDeck.slides[0].layoutOverrides?.takeawaysBlock).toBeUndefined();
    expect(setSelectedElementId).toHaveBeenCalledWith(null);
    expect(onShowToast).toHaveBeenCalledWith('Removed Takeaways card from slide');

    // Delete titleBlock
    act(() => {
      result.current.handleDeleteCanvasElement('titleBlock');
    });
    expect(currentDeck.slides[0].layoutOverrides?.titleBlock?.hidden).toBe(true);
    expect(onShowToast).toHaveBeenCalledWith('Removed titleBlock from slide');
  });

  it('skips manualLayoutLocked slides when applying layout to all slides', () => {
    let currentDeck: CarouselData = {
      ...DEFAULT_STARTER_DECK,
      slides: [
        {
          ...DEFAULT_STARTER_DECK.slides[0],
          compositionPreset: 'split-balanced',
          freeMoveLayout: true,
        },
        {
          ...DEFAULT_STARTER_DECK.slides[1],
          manualLayoutLocked: true,
          compositionPreset: 'standard',
        },
        {
          ...DEFAULT_STARTER_DECK.slides[2],
          manualLayoutLocked: false,
          compositionPreset: 'standard',
        },
      ],
    };
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
      result.current.handleApplySlideLayoutToAllSlides();
    });

    // Slide 1 (locked) must NOT change
    expect(currentDeck.slides[1].compositionPreset).toBe('standard');
    // Slide 2 (unlocked) must receive the split-balanced preset
    expect(currentDeck.slides[2].compositionPreset).toBe('split-balanced');
    expect(onShowToast).toHaveBeenCalledWith(
      expect.stringContaining('1 Cascade-Locked slide(s) protected')
    );
  });

  it('keeps deck reference unchanged on handleAutoFitCurrentSlide when copy is already within limits', () => {
    let currentDeck: CarouselData = {
      ...DEFAULT_STARTER_DECK,
      slides: [
        {
          ...DEFAULT_STARTER_DECK.slides[0],
          enTitle: 'Clean Headline.',
          arTitle: 'عنوان واضح',
          enBody: 'Short clean body copy.',
          arBody: 'نص عربي مختصر وواضح.',
        },
      ],
    };
    const initialRef = currentDeck;
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
      result.current.handleAutoFitCurrentSlide();
    });

    expect(currentDeck).toBe(initialRef);
    expect(onShowToast).not.toHaveBeenCalled();

    // When copy actually exceeds limits or needs polishing, it updates and toasts
    currentDeck = {
      ...currentDeck,
      slides: [
        {
          ...currentDeck.slides[0],
          enTitle: 'A very long headline that definitely exceeds the hook character limit by quite a lot of extra words',
        },
      ],
    };
    const longRef = currentDeck;
    act(() => {
      result.current.handleAutoFitCurrentSlide();
    });

    expect(currentDeck).not.toBe(longRef);
    expect(onShowToast).toHaveBeenCalledWith('Auto-fitted title and body copy within character limits');
  });
});
