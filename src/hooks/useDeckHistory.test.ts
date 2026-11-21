import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useDeckHistory } from './useDeckHistory.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';
import type { CarouselData } from '../types.ts';

describe('useDeckHistory', () => {
  it('manages undo/redo ring buffer, revision ref, and compare-before toggle', () => {
    let currentDeck: CarouselData = { ...DEFAULT_STARTER_DECK, id: 'deck-1' };
    const onUpdateCarousel = vi.fn((updater) => {
      currentDeck = typeof updater === 'function' ? updater(currentDeck) : updater;
    });
    const onShowToast = vi.fn();

    const { result, rerender } = renderHook(
      ({ deck }) =>
        useDeckHistory({
          carousel: deck,
          onUpdateCarousel,
          onShowToast,
          maxDepth: 5,
        }),
      { initialProps: { deck: currentDeck } }
    );

    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.deckRevisionRef.current).toBe(0);

    // Apply update 1
    act(() => {
      result.current.applyDeckUpdate((prev) => ({ ...prev, category: 'UPDATE 1' }));
    });
    rerender({ deck: currentDeck });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    expect(result.current.historyPast.length).toBe(1);
    expect(result.current.deckRevisionRef.current).toBe(1);

    // Apply update 2
    act(() => {
      result.current.applyDeckUpdate((prev) => ({ ...prev, category: 'UPDATE 2' }));
    });
    rerender({ deck: currentDeck });

    expect(result.current.historyPast.length).toBe(2);

    // Undo
    act(() => {
      result.current.handleUndo();
    });
    rerender({ deck: currentDeck });

    expect(onUpdateCarousel).toHaveBeenCalled();
    expect(onShowToast).toHaveBeenCalledWith('Undid last change');
    expect(result.current.canRedo).toBe(true);

    // Redo
    act(() => {
      result.current.handleRedo();
    });
    rerender({ deck: currentDeck });

    expect(onShowToast).toHaveBeenCalledWith('Redid change');

    // Compare before
    act(() => {
      result.current.setIsComparingBefore(true);
    });
    expect(result.current.isComparingBefore).toBe(true);
  });
});
