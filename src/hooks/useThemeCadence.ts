import { useMemo, useCallback } from 'react';
import type { SavedPostRecord, ThemePalette } from '../types.ts';
import {
  analyzePostHistoryCadence,
  getSmartNextPalette,
  type ThemeCadenceAnalysis,
} from '../lib/theme/cadenceEngine.ts';

export interface UseThemeCadenceOptions {
  savedPosts: SavedPostRecord[];
  activeThemeId: string;
  prompt?: string;
  category?: string;
}

export interface UseThemeCadenceReturn {
  cadence: ThemeCadenceAnalysis;
  resolveNextHarmoniousPalette: (
    overrideContext?: { prompt?: string; category?: string }
  ) => ThemePalette;
}

/**
 * Exposes live feed color cadence analysis and harmonious palette rotation
 * based on the user's posted Vault history (`postStatus === 'posted'`).
 */
export function useThemeCadence({
  savedPosts,
  prompt = '',
  category = 'auto',
}: UseThemeCadenceOptions): UseThemeCadenceReturn {
  const cadence = useMemo(
    () =>
      analyzePostHistoryCadence(savedPosts, {
        prompt,
        category,
      }),
    [savedPosts, prompt, category]
  );

  const resolveNextHarmoniousPalette = useCallback(
    (
      overrideContext?: { prompt?: string; category?: string }
    ): ThemePalette => {
      return getSmartNextPalette(savedPosts, {
        prompt: overrideContext?.prompt ?? prompt,
        category: overrideContext?.category ?? category,
      });
    },
    [savedPosts, prompt, category]
  );

  return {
    cadence,
    resolveNextHarmoniousPalette,
  };
}
