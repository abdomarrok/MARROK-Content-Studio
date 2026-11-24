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

  it('rejects unsupported file formats with an advisory toast', async () => {
    const onShowToast = vi.fn();
    const { result } = renderHook(() =>
      useMediaIngestion({
        activePostFormat: 'carousel',
        carousel: DEFAULT_STARTER_DECK,
        currentSlideIndexRef: { current: 0 },
        applyDeckUpdate: vi.fn(),
        changeSlide: vi.fn(),
        onShowToast,
        isExpanded: false,
        setIsExpanded: vi.fn(),
        setActiveTab: vi.fn(),
        setInspectorTab: vi.fn(),
        onAnalyzePhotoCaption: vi.fn().mockResolvedValue(undefined),
      })
    );

    const textFile = new File(['hello world'], 'readme.txt', { type: 'text/plain' });
    await act(async () => {
      await result.current.handleImageFile(textFile);
    });

    expect(onShowToast).toHaveBeenCalledWith(
      'Please select a valid image or video file (PNG, JPG, WebP, MP4, WebM, MOV).'
    );
  });

  it('attaches an uploaded MP4 video in reel mode, sets 9:16 preset, closes overlay drawer, and triggers AI video analysis', async () => {
    const onShowToast = vi.fn();
    const setIsExpanded = vi.fn();
    const setInspectorTab = vi.fn();
    const onAnalyzeVideoFile = vi.fn().mockResolvedValue(undefined);
    let updatedCarousel = DEFAULT_STARTER_DECK;
    const applyDeckUpdate = vi.fn((updater: (prev: typeof DEFAULT_STARTER_DECK) => typeof DEFAULT_STARTER_DECK) => {
      updatedCarousel = updater(updatedCarousel);
    });

    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:http://localhost:3000/test-reel-video');

    try {
      const { result } = renderHook(() =>
        useMediaIngestion({
          activePostFormat: 'reel',
          carousel: DEFAULT_STARTER_DECK,
          currentSlideIndexRef: { current: 0 },
          applyDeckUpdate,
          changeSlide: vi.fn(),
          onShowToast,
          isExpanded: true,
          setIsExpanded,
          setActiveTab: vi.fn(),
          setInspectorTab,
          onAnalyzePhotoCaption: vi.fn().mockResolvedValue(undefined),
          onAnalyzeVideoFile,
        })
      );

      const videoFile = new File(['fake-mp4-binary'], 'demo-reel.mp4', { type: 'video/mp4' });
      await act(async () => {
        await result.current.handleImageFile(videoFile);
      });

      expect(applyDeckUpdate).toHaveBeenCalled();
      expect(updatedCarousel.dimensionPreset).toBe('tiktok-9:16');
      expect(updatedCarousel.slides[0].mediaType).toBe('video');
      expect(updatedCarousel.slides[0].videoUrl).toBe('blob:http://localhost:3000/test-reel-video');
      expect(updatedCarousel.slides[0].videoFileName).toBe('demo-reel.mp4');
      expect(setIsExpanded).toHaveBeenCalledWith(false);
      expect(setInspectorTab).toHaveBeenCalledWith('copy');
      expect(onAnalyzeVideoFile).toHaveBeenCalledWith(
        videoFile,
        'blob:http://localhost:3000/test-reel-video',
        expect.any(String)
      );
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }
  });
});
