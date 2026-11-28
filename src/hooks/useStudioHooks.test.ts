import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useStudioHistory } from './useStudioHistory.ts';
import { useSlideNavigation } from './useSlideNavigation.ts';
import { useThemeCadence } from './useThemeCadence.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';
import type { SavedPostRecord } from '../types.ts';

describe('Phase 3 Custom Studio Hooks (useStudioHistory, useSlideNavigation, useThemeCadence)', () => {
  describe('useStudioHistory', () => {
    it('maintains immutable undo/redo history up to maxDepth and supports rapid consecutive updates', () => {
      const onUndo = vi.fn();
      const onRedo = vi.fn();
      const { result } = renderHook(() =>
        useStudioHistory<number>(0, { maxDepth: 3, onUndo, onRedo })
      );

      expect(result.current.state).toBe(0);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);

      // Push 4 states into a maxDepth=3 ring buffer
      act(() => {
        result.current.setState(1);
        result.current.setState((prev) => prev + 1); // 2
        result.current.setState((prev) => prev + 1); // 3
        result.current.setState((prev) => prev + 1); // 4
      });

      expect(result.current.state).toBe(4);
      expect(result.current.pastHistory).toEqual([1, 2, 3]);
      expect(result.current.canUndo).toBe(true);

      // Undo twice
      act(() => {
        result.current.undo();
      });
      expect(result.current.state).toBe(3);
      expect(onUndo).toHaveBeenCalledWith(3);
      expect(result.current.canRedo).toBe(true);

      act(() => {
        result.current.undo();
      });
      expect(result.current.state).toBe(2);

      // Redo once
      act(() => {
        result.current.redo();
      });
      expect(result.current.state).toBe(3);
      expect(onRedo).toHaveBeenCalledWith(3);

      // Replace state without adding history
      act(() => {
        result.current.replaceStateWithoutHistory(99);
      });
      expect(result.current.state).toBe(99);
      expect(result.current.pastHistory).toEqual([1, 2]);
    });

    it('captures beforeEditsStateRef on first edit, toggles Compare Before, and resets on clearHistory', () => {
      const { result } = renderHook(() =>
        useStudioHistory<string>('initial-deck', { maxDepth: 5 })
      );

      expect(result.current.beforeEditsStateRef.current).toBe('initial-deck');
      expect(result.current.isComparingBefore).toBe(false);
      expect(result.current.revisionRef.current).toBe(0);

      // Rapid consecutive updates preserve the original pre-edit baseline
      act(() => {
        result.current.setState('edit-1');
        result.current.setState('edit-2');
        result.current.setState('edit-3');
      });

      expect(result.current.state).toBe('edit-3');
      expect(result.current.beforeEditsStateRef.current).toBe('initial-deck');
      expect(result.current.revisionRef.current).toBe(3);

      // Toggle Compare Before on and off
      act(() => {
        result.current.toggleCompareBefore();
      });
      expect(result.current.isComparingBefore).toBe(true);

      act(() => {
        result.current.toggleCompareBefore(false);
      });
      expect(result.current.isComparingBefore).toBe(false);

      // clearHistory resets stacks, compare mode, and rebases beforeEditsStateRef
      act(() => {
        result.current.toggleCompareBefore(true);
        result.current.clearHistory();
      });
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
      expect(result.current.isComparingBefore).toBe(false);
      expect(result.current.beforeEditsStateRef.current).toBe('edit-3');
    });

    it('preserves the Redo stack across multiple Undos without recording Undo as a forward edit', () => {
      const onChange = vi.fn();
      const { result } = renderHook(() =>
        useStudioHistory<string>('v0', { maxDepth: 10, onChange })
      );

      act(() => {
        result.current.setState('v1');
        result.current.setState('v2');
        result.current.setState('v3');
      });

      expect(onChange).toHaveBeenCalledTimes(3);
      expect(result.current.historyRestoreVersion).toBe(0);
      expect(result.current.pastHistory).toEqual(['v0', 'v1', 'v2']);
      expect(result.current.futureHistory).toEqual([]);

      // Undo twice — must NOT trigger onChange or wipe futureHistory, and increments historyRestoreVersion
      act(() => {
        result.current.undo();
        result.current.undo();
      });

      expect(result.current.state).toBe('v1');
      expect(onChange).toHaveBeenCalledTimes(3);
      expect(result.current.historyRestoreVersion).toBe(2);
      expect(result.current.pastHistory).toEqual(['v0']);
      expect(result.current.futureHistory).toEqual(['v2', 'v3']);
      expect(result.current.canRedo).toBe(true);

      // Redo twice restores v2 then v3 cleanly and increments historyRestoreVersion
      act(() => {
        result.current.redo();
      });
      expect(result.current.state).toBe('v2');
      expect(result.current.historyRestoreVersion).toBe(3);
      expect(result.current.futureHistory).toEqual(['v3']);

      act(() => {
        result.current.redo();
      });
      expect(result.current.state).toBe('v3');
      expect(result.current.historyRestoreVersion).toBe(4);
      expect(result.current.canRedo).toBe(false);
      expect(result.current.pastHistory).toEqual(['v0', 'v1', 'v2']);
    });
  });

  describe('useSlideNavigation', () => {
    it('clamps slide index within [0, slidesCount - 1] and syncs when slidesCount shrinks', () => {
      const onSlideChange = vi.fn();
      const { result, rerender } = renderHook(
        ({ count, externalIdx }) =>
          useSlideNavigation({
            slidesCount: count,
            externalSlideIndex: externalIdx,
            onSlideChange,
          }),
        { initialProps: { count: 8, externalIdx: 0 } }
      );

      expect(result.current.currentSlideIndex).toBe(0);

      act(() => {
        result.current.nextSlide();
      });
      expect(result.current.currentSlideIndex).toBe(1);
      expect(onSlideChange).toHaveBeenCalledWith(1);

      act(() => {
        result.current.changeSlide(50);
      });
      expect(result.current.currentSlideIndex).toBe(7);

      // Shrink deck from 8 slides to 1 slide (single-slide condensation)
      rerender({ count: 1, externalIdx: 7 });
      expect(result.current.currentSlideIndex).toBe(0);
    });
  });

  describe('useThemeCadence', () => {
    it('analyzes posted vault history and avoids repeating the most recently posted theme', () => {
      const postedRecord: SavedPostRecord = {
        id: 'post-1',
        title: 'Kernel eBPF',
        category: 'LINUX KERNEL',
        postStatus: 'posted',
        creatorHandle: '@MARROK',
        slideCount: 8,
        qaPassed: true,
        deck: { ...DEFAULT_STARTER_DECK, theme: 'teal' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        postedAt: new Date().toISOString(),
      };

      const { result } = renderHook(() =>
        useThemeCadence({
          savedPosts: [postedRecord],
          activeThemeId: 'teal',
          prompt: 'Zero-trust mTLS mesh',
          category: 'REVERSE ENGINEERING',
        })
      );

      expect(result.current.cadence.lastPostedThemeId).toBe('teal');
      expect(result.current.cadence.recommendedThemeId).not.toBe('teal');

      const nextPalette = result.current.resolveNextHarmoniousPalette();
      expect(nextPalette.id).not.toBe('teal');
    });
  });
});
