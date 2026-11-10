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

      const nextPalette = result.current.resolveNextHarmoniousPalette('teal');
      expect(nextPalette.id).not.toBe('teal');
    });
  });
});
