import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useExportActions } from './useExportActions.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';
import { DEFAULT_PALETTES } from '../lib/theme/palettes.ts';

describe('useExportActions', () => {
  it('blocks export when checklist blockers are present', async () => {
    const onShowToast = vi.fn();
    const setInspectorTab = vi.fn();
    const setMobileStudioTab = vi.fn();

    const { result } = renderHook(() =>
      useExportActions({
        carousel: DEFAULT_STARTER_DECK,
        theme: DEFAULT_PALETTES['emerald-glow'] || Object.values(DEFAULT_PALETTES)[0],
        currentSlideIndex: 0,
        isBlocked: true,
        blockersCount: 2,
        isOfflineDraft: false,
        isReviewed: false,
        overrideExportBlock: false,
        confirmedRiskReason: null,
        qaReport: { canExport: false },
        riskReport: { status: 'BLOCK' },
        onShowToast,
        setInspectorTab,
        setMobileStudioTab,
      })
    );

    await act(async () => {
      await result.current.handleExportZip();
    });

    expect(setInspectorTab).toHaveBeenCalledWith('review');
    expect(setMobileStudioTab).toHaveBeenCalledWith('editor');
    expect(onShowToast).toHaveBeenCalledWith(
      '⚠️ Export blocked: 2 items need attention in Review checklist.'
    );
  });
});
