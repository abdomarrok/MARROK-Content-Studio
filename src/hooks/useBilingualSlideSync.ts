import React, { useCallback, useMemo, useState } from 'react';
import { fetchAuthedJson, HttpClientError } from '../lib/network/httpClient.ts';
import {
  CarouselData,
  MotionReelData,
  PostFormat,
  SlideData,
  ThemePalette,
} from '../types.ts';
import {
  isVideoSlide,
  analyzeVideoForSlideAndCaption,
  analyzeImageForMemeAndCaption,
} from '../lib/canvasExporter.ts';
import { sanitizeSlide } from '../lib/textSanitizer.ts';
import {
  filterRelevantHookVariants,
  resolveEffectivePostFormat,
  snapshotFormatDraft,
} from '../lib/studio/formatWorkspace.ts';
import { convertCarouselToMotionReel } from '../lib/motion/index.ts';

export interface PhotoCopySuggestion {
  enTitle: string;
  arTitle: string;
  enBody?: string;
  arBody?: string;
}

export interface UploadedImageState {
  base64: string;
  mimeType: string;
  name: string;
}

export interface UseBilingualSlideSyncOptions {
  carousel: CarouselData;
  currentSlideIndex: number;
  currentSlideIndexRef: React.MutableRefObject<number>;
  activePostFormat: PostFormat;
  activeReelConfig: MotionReelData;
  theme: ThemePalette;
  promptInput: string;
  categoryHint: string;
  uploadedImage: UploadedImageState | null;
  applyDeckUpdate: (updater: (prev: CarouselData) => CarouselData) => void;
  changeSlide: (next: number | ((prev: number) => number), nextLength?: number) => void;
  setInspectorTab: React.Dispatch<
    React.SetStateAction<'copy' | 'visual' | 'position' | 'caption' | 'review'>
  >;
  setPipelineStatus: React.Dispatch<React.SetStateAction<string | null>>;
  onShowToast: (msg: string) => void;
}

export function useBilingualSlideSync({
  carousel,
  currentSlideIndex,
  currentSlideIndexRef,
  activePostFormat,
  activeReelConfig,
  theme,
  promptInput,
  categoryHint,
  uploadedImage,
  applyDeckUpdate,
  changeSlide,
  setInspectorTab,
  setPipelineStatus,
  onShowToast,
}: UseBilingualSlideSyncOptions) {
  const [isSyncingArabic, setIsSyncingArabic] = useState(false);
  const [isSyncingAllArabic, setIsSyncingAllArabic] = useState(false);
  const [isGeneratingFromVideo, setIsGeneratingFromVideo] = useState(false);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [photoCopySuggestion, setPhotoCopySuggestion] = useState<PhotoCopySuggestion | null>(null);

  const handleSyncCurrentSlideArabic = async () => {
    const targetIndex = Math.min(currentSlideIndex, carousel.slides.length - 1);
    const targetSlide = carousel.slides[targetIndex];
    if (!targetSlide) return;
    if (
      !(targetSlide.enTitle || '').trim() &&
      !(targetSlide.enBody || '').trim() &&
      !(targetSlide.coverTeaserEn || '').trim()
    ) {
      onShowToast('Add English copy first before syncing Arabic.');
      return;
    }
    setIsSyncingArabic(true);
    try {
      const isCoverSlide =
        targetIndex === 0 && carousel.slides.length > 1 && activePostFormat === 'carousel';
      const data = await fetchAuthedJson<{
        engine?: string;
        arTitle?: string;
        coverTeaserAr?: string;
        arBody?: string;
        takeaways?: SlideData['takeaways'];
      }>('/api/refine-slide', {
        method: 'POST',
        includeGeminiKeys: true,
        timeoutMs: 75_000,
        contextLabel: 'AI Arabic slide sync',
        body: {
          mode: 'sync_ar',
          slide: targetSlide,
          category: carousel.category || 'SOFTWARE ARCHITECTURE',
          isCover: isCoverSlide,
        },
      });
      if (!data || data.engine === 'offline') {
        onShowToast('Live AI translation temporarily unavailable — keeping current Arabic.');
        return;
      }
      applyDeckUpdate((prev) => {
        if (!prev.slides[targetIndex]) return prev;
        const nextSlides = [...prev.slides];
        const existing = nextSlides[targetIndex];
        nextSlides[targetIndex] = {
          ...existing,
          arTitle:
            typeof data.arTitle === 'string' && data.arTitle.trim()
              ? data.arTitle.trim()
              : existing.arTitle,
          ...(isCoverSlide || typeof data.coverTeaserAr === 'string'
            ? {
                coverTeaserAr:
                  typeof data.coverTeaserAr === 'string' && data.coverTeaserAr.trim()
                    ? data.coverTeaserAr.trim()
                    : existing.coverTeaserAr,
              }
            : {}),
          arBody: isCoverSlide
            ? ''
            : typeof data.arBody === 'string'
            ? data.arBody.trim()
            : existing.arBody,
          ...(Array.isArray(data.takeaways) ? { takeaways: data.takeaways } : {}),
        };
        return { ...prev, slides: nextSlides };
      });
      onShowToast(`Synced Arabic for Slide ${targetIndex + 1} from English.`);
    } catch (err) {
      console.warn('[useBilingualSlideSync] Arabic slide sync failed:', err);
      onShowToast(
        err instanceof HttpClientError
          ? 'Live AI translation unavailable right now — please try again shortly.'
          : 'Could not reach AI translation service.'
      );
    } finally {
      setIsSyncingArabic(false);
    }
  };

  const handleSyncAllSlidesArabic = async () => {
    if (!carousel.slides.length) return;
    setIsSyncingAllArabic(true);
    try {
      interface SyncedArabicSlide {
        index?: number;
        arTitle?: string;
        coverTeaserAr?: string;
        arBody?: string;
      }
      const data = await fetchAuthedJson<{
        engine?: string;
        slides?: SyncedArabicSlide[];
      }>('/api/refine-slide', {
        method: 'POST',
        includeGeminiKeys: true,
        timeoutMs: 90_000,
        contextLabel: 'AI Arabic deck sync',
        body: {
          mode: 'sync_ar_deck',
          slides: carousel.slides,
          category: carousel.category || 'SOFTWARE ARCHITECTURE',
        },
      });
      if (!data || data.engine === 'offline' || !Array.isArray(data.slides)) {
        onShowToast('Live AI translation temporarily unavailable — try again in a moment.');
        return;
      }
      const syncedSlides = data.slides;
      applyDeckUpdate((prev) => {
        const isMultiCarousel = prev.slides.length > 1 && activePostFormat === 'carousel';
        const nextSlides = prev.slides.map((slide, idx) => {
          const synced =
            syncedSlides.find((item) => Number(item?.index) === idx) || syncedSlides[idx];
          if (!synced) return slide;
          const isSlide1Cover = idx === 0 && isMultiCarousel && !slide.standaloneMeme;
          return {
            ...slide,
            arTitle:
              typeof synced.arTitle === 'string' && synced.arTitle.trim()
                ? synced.arTitle.trim()
                : slide.arTitle,
            ...(isSlide1Cover || slide.coverTeaserEn
              ? {
                  coverTeaserAr:
                    typeof synced.coverTeaserAr === 'string' && synced.coverTeaserAr.trim()
                      ? synced.coverTeaserAr.trim()
                      : slide.coverTeaserAr,
                }
              : {}),
            arBody: isSlide1Cover
              ? ''
              : typeof synced.arBody === 'string'
              ? synced.arBody.trim()
              : slide.arBody,
          };
        });
        return { ...prev, slides: nextSlides };
      });
      onShowToast(`Synced Arabic across all ${carousel.slides.length} slides.`);
    } catch (err) {
      console.warn('[useBilingualSlideSync] Arabic deck sync failed:', err);
      onShowToast(
        err instanceof HttpClientError
          ? 'Live AI translation unavailable right now — please try again shortly.'
          : 'Could not reach AI translation service.'
      );
    } finally {
      setIsSyncingAllArabic(false);
    }
  };

  const handleGenerateFromVideo = async (sourceOverride?: File | string) => {
    const activeSlide = carousel.slides[currentSlideIndex] || carousel.slides[0];
    const videoSource = sourceOverride || activeSlide?.videoUrl || '';
    if (!videoSource && !uploadedImage) {
      onShowToast('Please upload a video first to generate slide text and caption.');
      return;
    }

    setIsGeneratingFromVideo(true);
    setPipelineStatus('Analyzing video frames & generating slide copy + social caption...');
    try {
      const targetFormat: 'carousel' | 'single' =
        activePostFormat === 'single' || carousel.slides.length === 1 ? 'single' : 'carousel';
      const fileName =
        sourceOverride instanceof File
          ? sourceOverride.name
          : activeSlide?.videoFileName || uploadedImage?.name || 'video-clip.mp4';

      const result = await analyzeVideoForSlideAndCaption({
        videoSource: videoSource || uploadedImage?.base64 || '',
        videoFileName: fileName,
        prompt: promptInput,
        currentSlide: activeSlide || carousel.slides[0],
        theme,
        categoryHint: categoryHint !== 'auto' ? categoryHint : carousel.category,
        postFormat: targetFormat,
        onProgress: (status) => setPipelineStatus(status),
      });

      applyDeckUpdate((prev) => {
        const targetIndex = Math.min(currentSlideIndexRef.current, prev.slides.length - 1);
        if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
        const current = prev.slides[targetIndex];
        const newSlides = [...prev.slides];
        newSlides[targetIndex] = sanitizeSlide(
          {
            ...current,
            ...result.slideUpdates,
            mediaType: 'video',
            videoUrl: current.videoUrl || result.slideUpdates.videoUrl || '',
            videoMimeType: current.videoMimeType || result.slideUpdates.videoMimeType || 'video/mp4',
            videoFileName: current.videoFileName || fileName,
            imageFrameMode: current.imageFrameMode === 'standard' ? 'standard' : 'hero',
          },
          targetIndex,
          prev.slides.length
        );
        const nextCategory = result.category || prev.category;
        const nextHookVariants =
          result.hookVariants && result.hookVariants.length > 0
            ? result.hookVariants
            : filterRelevantHookVariants(prev.hookVariants, newSlides, nextCategory);
        const updatedCarousel: CarouselData = {
          ...prev,
          category: nextCategory,
          caption: result.caption || prev.caption,
          hookVariants: nextHookVariants,
          slides: newSlides,
        };
        if (prev.postFormat === 'reel' || activePostFormat === 'reel') {
          updatedCarousel.reelConfig = convertCarouselToMotionReel(
            updatedCarousel,
            theme,
            prev.reelConfig?.templateId || activeReelConfig.templateId || 'marrok-slides',
            prev.reelConfig?.languageMode || activeReelConfig.languageMode || 'bilingual'
          );
        }
        return updatedCarousel;
      });

      onShowToast(
        activePostFormat === 'reel'
          ? '✨ Extracted video keyframes into 9:16 Reel scenes & bilingual caption!'
          : '✨ Generated bilingual slide text & social caption from your video!'
      );
    } catch (err) {
      console.error('Video text & caption generation failed:', err);
      onShowToast('Generated fallback slide text & caption from video metadata.');
    } finally {
      setIsGeneratingFromVideo(false);
      setPipelineStatus(null);
    }
  };

  const activeVideoSlide = useMemo(
    () => carousel.slides.find((s) => isVideoSlide(s)) || null,
    [carousel.slides]
  );

  const handleSwitchToVideoCardReel = useCallback(() => {
    const videoSlideIdx = carousel.slides.findIndex((s) => isVideoSlide(s));
    const targetSlide =
      (videoSlideIdx >= 0 ? carousel.slides[videoSlideIdx] : carousel.slides[0]) ||
      carousel.slides[0];
    if (!targetSlide) return;

    applyDeckUpdate((prev) => {
      const prevFormat = resolveEffectivePostFormat(prev);
      const nextDrafts =
        prevFormat !== 'single'
          ? snapshotFormatDraft(
              prev.formatDrafts,
              prevFormat,
              prev.slides,
              currentSlideIndexRef.current
            )
          : prev.formatDrafts;
      const singleVideoSlide: SlideData = sanitizeSlide(
        {
          ...targetSlide,
          type: 'poster',
          mediaType: 'video',
          imageFrameMode: targetSlide.imageFrameMode === 'standard' ? 'standard' : 'hero',
          imageFit: targetSlide.imageFit || 'contain',
          imageBgStyle: targetSlide.imageBgStyle || 'white',
          brandWatermark: targetSlide.brandWatermark || 'bottom-right',
        },
        0,
        1
      );
      return {
        ...prev,
        postFormat: 'single',
        dimensionPreset: 'tiktok-9:16',
        formatDrafts: nextDrafts,
        slides: [singleVideoSlide],
      };
    });
    changeSlide(0, 1);
    setInspectorTab('visual');
    onShowToast('🎬 Opened 9:16 (1080×1920) Video Clip Stage — ready to edit or export MP4!');
  }, [applyDeckUpdate, carousel.slides, changeSlide, currentSlideIndexRef, onShowToast, setInspectorTab]);

  const handleAnalyzePhotoCaption = async (
    imageDataUrlOverride?: string,
    mimeTypeOverride?: string,
    fileNameOverride?: string,
    modeOverride?: 'meme' | 'graphic'
  ) => {
    const activeSlide = carousel.slides[currentSlideIndexRef.current] || carousel.slides[0];
    const imageDataUrl =
      imageDataUrlOverride || activeSlide?.imageUrl || uploadedImage?.base64 || '';
    if (!imageDataUrl) {
      onShowToast('Please upload a meme or photo first.');
      return;
    }

    const effectiveMode: 'meme' | 'graphic' =
      modeOverride ||
      (activePostFormat === 'meme' || Boolean(activeSlide?.standaloneMeme) ? 'meme' : 'graphic');

    setIsAnalyzingPhoto(true);
    try {
      const result = await analyzeImageForMemeAndCaption({
        imageDataUrl,
        imageMimeType: mimeTypeOverride || uploadedImage?.mimeType || 'image/jpeg',
        imageFileName: fileNameOverride || uploadedImage?.name || 'meme-photo.jpg',
        prompt: promptInput,
        theme,
        keepFullMemeMode: effectiveMode === 'meme',
        onProgress: (status) => setPipelineStatus(status),
      });

      if (effectiveMode === 'meme') {
        setPhotoCopySuggestion(null);
        applyDeckUpdate((prev) => {
          const nextCategory = result.category || prev.category;
          return {
            ...prev,
            category: nextCategory,
            caption: result.caption || prev.caption,
            hookVariants:
              result.hookVariants && result.hookVariants.length > 0
                ? result.hookVariants
                : filterRelevantHookVariants(prev.hookVariants, prev.slides, nextCategory),
          };
        });
        onShowToast('✨ Auto-generated category tag & social caption from your meme!');
      } else {
        setPhotoCopySuggestion({
          enTitle: result.suggestedEnTitle,
          arTitle: result.suggestedArTitle,
          enBody: result.suggestedEnBody,
          arBody: result.suggestedArBody,
        });
        onShowToast('✨ Photo analyzed — optional AI headline suggestion ready!');
      }
    } catch (err) {
      console.warn('Photo caption generation fallback used:', err);
    } finally {
      setIsAnalyzingPhoto(false);
      setPipelineStatus(null);
    }
  };

  const handleApplyPhotoCopySuggestion = () => {
    if (!photoCopySuggestion) return;
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndexRef.current, prev.slides.length - 1);
      if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
      const nextSlides = [...prev.slides];
      nextSlides[targetIndex] = sanitizeSlide(
        {
          ...nextSlides[targetIndex],
          enTitle: photoCopySuggestion.enTitle || nextSlides[targetIndex].enTitle,
          arTitle: photoCopySuggestion.arTitle || nextSlides[targetIndex].arTitle,
          enBody: photoCopySuggestion.enBody || nextSlides[targetIndex].enBody,
          arBody: photoCopySuggestion.arBody || nextSlides[targetIndex].arBody,
        },
        targetIndex,
        prev.slides.length
      );
      return { ...prev, slides: nextSlides };
    });
    setPhotoCopySuggestion(null);
    onShowToast('Applied suggested AI headlines & body from photo');
  };

  return {
    isSyncingArabic,
    isSyncingAllArabic,
    isGeneratingFromVideo,
    activeVideoSlide,
    isAnalyzingPhoto,
    photoCopySuggestion,
    setPhotoCopySuggestion,
    handleSyncCurrentSlideArabic,
    handleSyncAllSlidesArabic,
    handleGenerateFromVideo,
    handleSwitchToVideoCardReel,
    handleAnalyzePhotoCaption,
    handleApplyPhotoCopySuggestion,
  };
}
