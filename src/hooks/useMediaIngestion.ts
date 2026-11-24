import { useState, useRef, useCallback, useEffect } from 'react';
import type {
  CarouselData,
  SlideType,
  PostFormat,
} from '../types.ts';
import type { GatheredTopicItem } from '../lib/gather/gatherClient.ts';
import {
  isVideoFile,
  extractVideoStoryboardDataUrl,
  buildCleanMemeCarouselDeck,
  applySlideGraphicPhoto,
} from '../lib/canvasExporter.ts';
import { compressImageClientSide } from '../components/studio/index.ts';
import { trackAndReplaceBlobUrl, revokeBlobUrl } from '../lib/media/blobUrlRegistry.ts';
import {
  resolveEffectivePostFormat,
  snapshotFormatDraft,
  filterRelevantHookVariants,
} from '../lib/studio/formatWorkspace.ts';

export interface UploadedImageData {
  base64: string;
  mimeType: string;
  name: string;
  sizeKb: number;
}

export interface UseMediaIngestionProps {
  activePostFormat: PostFormat;
  carousel: CarouselData;
  currentSlideIndexRef: { current: number };
  applyDeckUpdate: (updater: (prev: CarouselData) => CarouselData) => void;
  changeSlide: (newIndex: number, totalSlides?: number) => void;
  onShowToast: (message: string) => void;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  setActiveTab: (tab: 'text' | 'radar' | 'youtube' | 'upload') => void;
  setInspectorTab: (tab: 'copy' | 'visual' | 'position' | 'caption' | 'review') => void;
  onAnalyzePhotoCaption: (
    imageDataUrl?: string,
    mimeType?: string,
    fileName?: string,
    mode?: 'meme' | 'graphic'
  ) => Promise<void>;
  onAnalyzeVideoFile?: (file: File, videoBlobUrl: string, storyboardDataUrl?: string) => Promise<void> | void;
}

export function useMediaIngestion({
  activePostFormat,
  carousel,
  currentSlideIndexRef,
  applyDeckUpdate,
  changeSlide,
  onShowToast,
  isExpanded,
  setIsExpanded,
  setActiveTab,
  setInspectorTab,
  onAnalyzePhotoCaption,
  onAnalyzeVideoFile,
}: UseMediaIngestionProps) {
  const [promptInput, setPromptInput] = useState('');
  const [categoryHint, setCategoryHint] = useState<string>('auto');
  const [inputValidationError, setInputValidationError] = useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = useState<UploadedImageData | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [studioRadarTopics, setStudioRadarTopics] = useState<GatheredTopicItem[]>([]);
  const [isStudioRadarLoading, setIsStudioRadarLoading] = useState(false);
  const [studioCustomUrl, setStudioCustomUrl] = useState('');
  const [isExtractingStudioUrl, setIsExtractingStudioUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Smart Dock Text input with auto-expansion when pasting or typing long material (> 200 chars)
  const handlePromptChange = (val: string) => {
    setPromptInput(val);
    if (inputValidationError) {
      setInputValidationError(null);
    }
    if (val.length > 200 && !isExpanded) {
      setIsExpanded(true);
    }
  };

  // Image or Video Upload with client-side downscaling / storyboard frame extraction
  const handleImageFile = useCallback(
    async (file: File) => {
      setInputValidationError(null);
      if (isVideoFile(file)) {
        let videoBlobUrl = '';
        let storyboardDataUrl = '';
        try {
          videoBlobUrl =
            typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
              ? URL.createObjectURL(file)
              : '';
          let storyboardDuration: number | undefined;
          try {
            const storyboard = await extractVideoStoryboardDataUrl(file);
            storyboardDataUrl = storyboard.dataUrl;
            storyboardDuration = storyboard.duration;
            if (!isMountedRef.current) {
              revokeBlobUrl(videoBlobUrl);
              return;
            }
            setUploadedImage({
              base64: storyboard.dataUrl,
              mimeType: storyboard.mimeType,
              name: file.name,
              sizeKb: Math.max(1, Math.round((storyboard.dataUrl.length * 0.75) / 1024)),
            });
          } catch (storyboardErr) {
            console.warn('Video frame extraction fallback used:', storyboardErr);
          }

          if (!isMountedRef.current) {
            revokeBlobUrl(videoBlobUrl);
            return;
          }

          if (videoBlobUrl) {
            applyDeckUpdate((prev) => {
              const targetIndex =
                activePostFormat === 'reel'
                  ? 0
                  : Math.min(currentSlideIndexRef.current, prev.slides.length - 1);
              if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
              const current = prev.slides[targetIndex];
              trackAndReplaceBlobUrl(current.videoUrl, videoBlobUrl);
              const targetType: SlideType =
                current.type === 'poster' ||
                prev.postFormat === 'single' ||
                activePostFormat === 'reel' ||
                prev.slides.length === 1
                  ? 'poster'
                  : 'image';
              const newSlides = [...prev.slides];
              newSlides[targetIndex] = {
                ...current,
                type: targetType,
                mediaType: 'video',
                videoUrl: videoBlobUrl,
                videoMimeType: file.type || 'video/mp4',
                videoFileName: file.name,
                videoDuration: storyboardDuration || current.videoDuration,
                videoMuted: true,
                videoPlaying: true,
                videoBorderRadius: 8,
                imageFrameMode: 'hero',
                imageFit: current.imageFit || 'contain',
                imageBgStyle: current.imageBgStyle || 'white',
                brandWatermark: current.brandWatermark || 'bottom-right',
              };
              return {
                ...prev,
                dimensionPreset:
                  activePostFormat === 'reel'
                    ? 'tiktok-9:16'
                    : prev.dimensionPreset || 'tiktok-9:16',
                slides: newSlides,
              };
            });
          }
          setIsExpanded(false);
          setActiveTab('upload');
          setInspectorTab('copy');
          onShowToast(
            activePostFormat === 'reel'
              ? `🎬 Attached video "${file.name}" to 9:16 Reel — analyzing frames...`
              : `🎬 Attached video "${file.name}" & extracted keyframes for AI captioning`
          );
          if (onAnalyzeVideoFile) {
            void onAnalyzeVideoFile(file, videoBlobUrl, storyboardDataUrl);
          }
        } catch (err) {
          if (videoBlobUrl) {
            revokeBlobUrl(videoBlobUrl);
          }
          console.warn('Video attachment failed:', err);
          if (isMountedRef.current) {
            onShowToast('Attached video file');
          }
        }
        return;
      }

      if (!file.type.startsWith('image/')) {
        onShowToast('Please select a valid image or video file (PNG, JPG, WebP, MP4, WebM, MOV).');
        return;
      }

      const applyUploadedImageByMode = (
        base64: string,
        mimeType: string,
        sizeKb: number,
        forceMode?: 'meme' | 'graphic'
      ) => {
        setUploadedImage({
          base64,
          mimeType,
          name: file.name,
          sizeKb,
        });

        const resolvedMode: 'meme' | 'graphic' =
          forceMode ||
          (activePostFormat === 'meme' || Boolean(carousel.slides[currentSlideIndexRef.current]?.standaloneMeme)
            ? 'meme'
            : 'graphic');

        if (resolvedMode === 'meme') {
          applyDeckUpdate((prev) => {
            const prevFormat = resolveEffectivePostFormat(prev);
            const nextDrafts =
              prevFormat !== 'meme'
                ? snapshotFormatDraft(prev.formatDrafts, prevFormat, prev.slides, currentSlideIndexRef.current)
                : prev.formatDrafts;
            const memeDeck = buildCleanMemeCarouselDeck(prev, base64, file.name);
            return {
              ...memeDeck,
              postFormat: 'meme',
              formatDrafts: nextDrafts,
              hookVariants: filterRelevantHookVariants(prev.hookVariants, memeDeck.slides, memeDeck.category),
            };
          });
          changeSlide(0, 1);
          setIsExpanded(false);
          setInspectorTab('copy');
          onShowToast('✨ Loaded clean Meme card — generating AI caption...');
          void onAnalyzePhotoCaption(base64, mimeType, file.name, 'meme');
        } else {
          // Normal Slide Graphic Photo Upload: replace ONLY the current slide's graphic slot!
          applyDeckUpdate((prev) => {
            const targetIndex = Math.min(currentSlideIndexRef.current, prev.slides.length - 1);
            if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
            const isSingleDeck = prev.postFormat === 'single' || prev.slides.length === 1;
            const nextSlides = [...prev.slides];
            nextSlides[targetIndex] = applySlideGraphicPhoto(
              nextSlides[targetIndex],
              base64,
              isSingleDeck
            );
            return {
              ...prev,
              slides: nextSlides,
            };
          });
          setIsExpanded(false);
          setInspectorTab('copy');
          onShowToast('Inserted photo into slide graphic slot (slide text & deck preserved)');
          void onAnalyzePhotoCaption(base64, mimeType, file.name, 'graphic');
        }
      };

      try {
        const { base64, mimeType, sizeKb } = await compressImageClientSide(file);
        if (!isMountedRef.current) return;
        applyUploadedImageByMode(base64, mimeType, sizeKb);
      } catch (err) {
        console.warn('Image downscaling failed, using raw fallback:', err);
        const reader = new FileReader();
        reader.onload = () => {
          if (!isMountedRef.current) return;
          const base64 = (reader.result as string) || '';
          const mimeType = file.type || 'image/jpeg';
          const sizeKb = Math.max(1, Math.round(file.size / 1024));
          applyUploadedImageByMode(base64, mimeType, sizeKb);
        };
        reader.readAsDataURL(file);
      }
    },
    [
      activePostFormat,
      applyDeckUpdate,
      carousel.slides,
      changeSlide,
      currentSlideIndexRef,
      onAnalyzePhotoCaption,
      onAnalyzeVideoFile,
      onShowToast,
      setActiveTab,
      setIsExpanded,
      setInspectorTab,
    ]
  );

  const handleUploadMemePhotoFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        void handleImageFile(file);
        return;
      }
      try {
        const { base64, mimeType, sizeKb } = await compressImageClientSide(file);
        if (!isMountedRef.current) return;
        setUploadedImage({ base64, mimeType, name: file.name, sizeKb });
        applyDeckUpdate((prev) => {
          const prevFormat = resolveEffectivePostFormat(prev);
          const nextDrafts =
            prevFormat !== 'meme'
              ? snapshotFormatDraft(prev.formatDrafts, prevFormat, prev.slides, currentSlideIndexRef.current)
              : prev.formatDrafts;
          const memeDeck = buildCleanMemeCarouselDeck(prev, base64, file.name);
          return {
            ...memeDeck,
            postFormat: 'meme',
            formatDrafts: nextDrafts,
            hookVariants: filterRelevantHookVariants(prev.hookVariants, memeDeck.slides, memeDeck.category),
          };
        });
        changeSlide(0, 1);
        setIsExpanded(false);
        setInspectorTab('copy');
        onShowToast('✨ Loaded clean Meme card — generating AI caption...');
        void onAnalyzePhotoCaption(base64, mimeType, file.name, 'meme');
      } catch {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string) || '';
          applyDeckUpdate((prev) => buildCleanMemeCarouselDeck(prev, base64, file.name));
          changeSlide(0, 1);
          setIsExpanded(false);
          void onAnalyzePhotoCaption(base64, file.type || 'image/jpeg', file.name, 'meme');
        };
        reader.readAsDataURL(file);
      }
    },
    [
      applyDeckUpdate,
      changeSlide,
      currentSlideIndexRef,
      handleImageFile,
      onAnalyzePhotoCaption,
      onShowToast,
      setIsExpanded,
      setInspectorTab,
    ]
  );

  const handleUploadSlideGraphicFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        void handleImageFile(file);
        return;
      }
      try {
        const { base64, mimeType, sizeKb } = await compressImageClientSide(file);
        if (!isMountedRef.current) return;
        setUploadedImage({ base64, mimeType, name: file.name, sizeKb });
        applyDeckUpdate((prev) => {
          const targetIndex = Math.min(currentSlideIndexRef.current, prev.slides.length - 1);
          if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
          const isSingleDeck = prev.postFormat === 'single' || prev.slides.length === 1;
          const nextSlides = [...prev.slides];
          nextSlides[targetIndex] = applySlideGraphicPhoto(
            nextSlides[targetIndex],
            base64,
            isSingleDeck
          );
          return { ...prev, slides: nextSlides };
        });
        setIsExpanded(false);
        setInspectorTab('copy');
        onShowToast('Inserted photo into slide graphic slot (slide text & deck preserved)');
        void onAnalyzePhotoCaption(base64, mimeType, file.name, 'graphic');
      } catch {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string) || '';
          applyDeckUpdate((prev) => {
            const targetIndex = Math.min(currentSlideIndexRef.current, prev.slides.length - 1);
            if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
            const isSingleDeck = prev.postFormat === 'single' || prev.slides.length === 1;
            const nextSlides = [...prev.slides];
            nextSlides[targetIndex] = applySlideGraphicPhoto(
              nextSlides[targetIndex],
              base64,
              isSingleDeck
            );
            return { ...prev, slides: nextSlides };
          });
          void onAnalyzePhotoCaption(base64, file.type || 'image/jpeg', file.name, 'graphic');
        };
        reader.readAsDataURL(file);
      }
    },
    [
      applyDeckUpdate,
      currentSlideIndexRef,
      handleImageFile,
      onAnalyzePhotoCaption,
      onShowToast,
      setIsExpanded,
      setInspectorTab,
    ]
  );

  const handleSelectDemoImage = async (imagePath: string, title: string) => {
    try {
      const res = await fetch(imagePath);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = () => {
        if (!isMountedRef.current) return;
        setUploadedImage({
          base64: reader.result as string,
          mimeType: blob.type || 'image/jpeg',
          name: title,
          sizeKb: Math.round(blob.size / 1024),
        });
        setIsExpanded(true);
        setActiveTab('upload');
        onShowToast(`Attached sample slide: ${title}`);
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.warn('Could not load demo image:', err);
    }
  };

  const handlePasteImageFromClipboard = useCallback(
    (file: File) => {
      void handleImageFile(file);
      onShowToast('📋 Screenshot attached directly from clipboard!');
    },
    [handleImageFile, onShowToast]
  );

  const handleClearDock = () => {
    setPromptInput('');
    setInputValidationError(null);
    setUploadedImage(null);
    setCategoryHint('auto');
    onShowToast('Cleared input dock');
  };

  return {
    promptInput,
    setPromptInput,
    categoryHint,
    setCategoryHint,
    inputValidationError,
    setInputValidationError,
    uploadedImage,
    setUploadedImage,
    isDragOver,
    setIsDragOver,
    studioRadarTopics,
    setStudioRadarTopics,
    isStudioRadarLoading,
    setIsStudioRadarLoading,
    studioCustomUrl,
    setStudioCustomUrl,
    isExtractingStudioUrl,
    setIsExtractingStudioUrl,
    fileInputRef,
    handlePromptChange,
    handleImageFile,
    handleUploadMemePhotoFile,
    handleUploadSlideGraphicFile,
    handleSelectDemoImage,
    handlePasteImageFromClipboard,
    handleClearDock,
  };
}
