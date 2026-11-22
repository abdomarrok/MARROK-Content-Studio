import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useExportActions } from './useExportActions.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';
import { DEFAULT_PALETTES } from '../lib/theme/palettes.ts';
import * as canvasExporter from '../lib/canvasExporter.ts';

vi.mock('../lib/canvasExporter.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof canvasExporter>();
  return {
    ...actual,
    copySlideToClipboard: vi.fn().mockResolvedValue(undefined),
  };
});

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

  it('handles slide copy to clipboard and triggers feedback toast', async () => {
    const onShowToast = vi.fn();
    const { result } = renderHook(() =>
      useExportActions({
        carousel: DEFAULT_STARTER_DECK,
        theme: DEFAULT_PALETTES['emerald-glow'] || Object.values(DEFAULT_PALETTES)[0],
        currentSlideIndex: 0,
        isBlocked: false,
        blockersCount: 0,
        isOfflineDraft: false,
        isReviewed: true,
        overrideExportBlock: false,
        confirmedRiskReason: null,
        qaReport: { canExport: true },
        riskReport: { status: 'SAFE' },
        onShowToast,
        setInspectorTab: vi.fn(),
        setMobileStudioTab: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.handleCopySlide();
    });

    expect(onShowToast).toHaveBeenCalledWith(
      expect.stringMatching(/Copied Slide 1 to clipboard!|Failed to copy slide/)
    );
  });
});
