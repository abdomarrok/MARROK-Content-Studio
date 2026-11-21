import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useMediaIngestion } from './useMediaIngestion.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';

describe('useMediaIngestion', () => {
  it('handles prompt changes and auto-expansion', () => {
    const setIsExpanded = vi.fn();
    const { result } = renderHook(() =>
      useMediaIngestion({
        activePostFormat: 'carousel',
        carousel: DEFAULT_STARTER_DECK,
        currentSlideIndexRef: { current: 0 },
        applyDeckUpdate: vi.fn(),
        changeSlide: vi.fn(),
        onShowToast: vi.fn(),
        isExpanded: false,
        setIsExpanded,
        setActiveTab: vi.fn(),
        setInspectorTab: vi.fn(),
        onAnalyzePhotoCaption: vi.fn().mockResolvedValue(undefined),
      })
    );

    act(() => {
      result.current.handlePromptChange('Short prompt');
    });
    expect(result.current.promptInput).toBe('Short prompt');
    expect(setIsExpanded).not.toHaveBeenCalled();

    act(() => {
      result.current.handlePromptChange('A'.repeat(250));
    });
    expect(result.current.promptInput).toBe('A'.repeat(250));
    expect(setIsExpanded).toHaveBeenCalledWith(true);
  });

  it('clears dock state properly', () => {
    const onShowToast = vi.fn();
    const { result } = renderHook(() =>
      useMediaIngestion({
        activePostFormat: 'carousel',
        carousel: DEFAULT_STARTER_DECK,
        currentSlideIndexRef: { current: 0 },
        applyDeckUpdate: vi.fn(),
        changeSlide: vi.fn(),
        onShowToast,
        isExpanded: true,
        setIsExpanded: vi.fn(),
        setActiveTab: vi.fn(),
        setInspectorTab: vi.fn(),
        onAnalyzePhotoCaption: vi.fn().mockResolvedValue(undefined),
      })
    );

    act(() => {
      result.current.setPromptInput('Some topic');
      result.current.setCategoryHint('ai');
      result.current.setInputValidationError('Needs more details');
      result.current.setUploadedImage({
        base64: 'data:image/jpeg;base64,123',
        mimeType: 'image/jpeg',
        name: 'test.jpg',
        sizeKb: 10,
      });
    });

    expect(result.current.promptInput).toBe('Some topic');
    expect(result.current.categoryHint).toBe('ai');
    expect(result.current.inputValidationError).toBe('Needs more details');
    expect(result.current.uploadedImage).not.toBeNull();

    act(() => {
      result.current.handleClearDock();
    });

    expect(result.current.promptInput).toBe('');
    expect(result.current.categoryHint).toBe('auto');
    expect(result.current.inputValidationError).toBeNull();
    expect(result.current.uploadedImage).toBeNull();
    expect(onShowToast).toHaveBeenCalledWith('Cleared input dock');
  });
});
