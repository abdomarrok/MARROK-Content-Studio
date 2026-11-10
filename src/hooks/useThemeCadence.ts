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
    requestedThemeId?: string,
    overrideContext?: { prompt?: string; category?: string }
  ) => ThemePalette;
}

/**
 * Exposes live feed color cadence analysis and harmonious palette rotation
 * based on the user's posted Vault history (`postStatus === 'posted'`).
 */
export function useThemeCadence({
  savedPosts,
  activeThemeId,
  prompt = '',
  category = 'auto',
}: UseThemeCadenceOptions): UseThemeCadenceReturn {
  const cadence = useMemo(
    () =>
      analyzePostHistoryCadence(savedPosts, activeThemeId, {
        prompt,
        category,
      }),
    [savedPosts, activeThemeId, prompt, category]
  );

  const resolveNextHarmoniousPalette = useCallback(
    (
      requestedThemeId?: string,
      overrideContext?: { prompt?: string; category?: string }
    ): ThemePalette => {
      return getSmartNextPalette(
        savedPosts,
        requestedThemeId || activeThemeId,
        {
          prompt: overrideContext?.prompt ?? prompt,
          category: overrideContext?.category ?? category,
        }
      );
    },
    [activeThemeId, savedPosts, prompt, category]
  );

  return {
    cadence,
    resolveNextHarmoniousPalette,
  };
}
