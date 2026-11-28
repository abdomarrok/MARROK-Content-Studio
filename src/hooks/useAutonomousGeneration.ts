import React, { useEffect, useRef, useState } from 'react';
import {
  CarouselData,
  DEFAULT_PALETTES,
  MotionReelData,
  PostFormat,
  SavedPostRecord,
  ThemePalette,
} from '../types.ts';
import { analyzePostHistoryCadence, normalizeThemeId } from '../lib/theme/cadenceEngine.ts';
import { isVideoSlide } from '../lib/canvasExporter.ts';
import { runAutonomousPipeline, enrichAndPaceCarousel } from '../lib/autonomousPipeline.ts';
import {
  synthesizeCarousel,
  validateSourceSufficiency,
  InsufficientSourceError,
} from '../lib/synthesizer.ts';
import { filterRelevantHookVariants } from '../lib/studio/formatWorkspace.ts';
import { convertCarouselToMotionReel } from '../lib/motion/index.ts';
import type { STARTER_TOPICS } from '../components/studio/panels/StudioCommandBar.tsx';
import type { UploadedImageState } from './useBilingualSlideSync.ts';

export function deriveTopicHashtags(carousel: CarouselData): string[] {
  const captionMatches = (carousel.caption || '').match(/#[A-Za-z0-9_\u0600-\u06FF]+/g);
  if (captionMatches && captionMatches.length >= 3) {
    return Array.from(new Set(captionMatches)).slice(0, 6);
  }

  const tags = new Set<string>(['#MARROK', '#SystemDesign']);
  const catWords = (carousel.category || '')
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length >= 3);
  if (catWords.length > 0) {
    tags.add(
      `#${catWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('')}`
    );
  }

  const firstTitleWords = (carousel.slides[0]?.enTitle || '')
    .split(/[^A-Za-z0-9]+/)
    .filter(
      (w) => w.length >= 4 && !/^(with|from|into|beyond|when|what|your|that|this)$/i.test(w)
    );
  for (const w of firstTitleWords.slice(0, 2)) {
    tags.add(`#${w.charAt(0).toUpperCase() + w.slice(1)}`);
  }

  tags.add('#SoftwareEngineering');
  tags.add('#TechInArabic');
  return Array.from(tags).slice(0, 6);
}

export interface UseAutonomousGenerationOptions {
  carousel: CarouselData;
  currentSlideIndex: number;
  activePostFormat: PostFormat;
  activeReelConfig: MotionReelData;
  theme: ThemePalette;
  savedPosts: SavedPostRecord[];
  promptInput: string;
  setPromptInput: React.Dispatch<React.SetStateAction<string>>;
  categoryHint: string;
  activeTab: 'text' | 'radar' | 'youtube' | 'upload';
  uploadedImage: UploadedImageState | null;
  deckRevisionRef: React.MutableRefObject<number>;
  setInputValidationError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setInspectorTab: React.Dispatch<
    React.SetStateAction<'copy' | 'visual' | 'position' | 'caption' | 'review'>
  >;
  onSelectTheme: (palette: ThemePalette) => void;
  onUpdateCarousel: React.Dispatch<React.SetStateAction<CarouselData>>;
  changeSlide: (next: number | ((prev: number) => number), nextLength?: number) => void;
  onShowToast: (msg: string) => void;
}

export function useAutonomousGeneration({
  carousel,
  currentSlideIndex,
  activePostFormat,
  activeReelConfig,
  theme,
  savedPosts,
  promptInput,
  setPromptInput,
  categoryHint,
  activeTab,
  uploadedImage,
  deckRevisionRef,
  setInputValidationError,
  setIsExpanded,
  setInspectorTab,
  onSelectTheme,
  onUpdateCarousel,
  changeSlide,
  onShowToast,
}: UseAutonomousGenerationOptions) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [pipelineStatus, setPipelineStatus] = useState<string | null>(null);

  const generationAbortRef = useRef<AbortController | null>(null);
  const generationRunIdRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      generationAbortRef.current?.abort();
      generationAbortRef.current = null;
    };
  }, []);

  const handleRunAutonomousPipeline = async (overridePrompt?: string) => {
    const query = (overridePrompt !== undefined ? overridePrompt : promptInput).trim();
    const pipelineTargetFormat: 'carousel' | 'single' =
      activePostFormat === 'single' ? 'single' : 'carousel';
    const sufficiency = validateSourceSufficiency({
      prompt: query,
      categoryHint,
      imageFileName: uploadedImage?.name,
      hasMedia: Boolean(uploadedImage),
      postFormat: pipelineTargetFormat,
    });
    if (!sufficiency.isSufficient) {
      setInputValidationError(sufficiency.reason);
      onShowToast(sufficiency.reason);
      return;
    }
    setInputValidationError(null);
    setIsExpanded(false);

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    const runId = ++generationRunIdRef.current;
    const startRevision = deckRevisionRef.current;
    const isCurrentRun = () =>
      isMountedRef.current && runId === generationRunIdRef.current && !controller.signal.aborted;

    setIsGenerating(true);
    setPipelineStatus(
      uploadedImage
        ? activePostFormat === 'single'
          ? 'Processing image & synthesizing single-slide post...'
          : activePostFormat === 'reel'
          ? 'Processing image & synthesizing motion reel...'
          : 'Processing image & synthesizing AI carousel...'
        : activePostFormat === 'single'
        ? 'Synthesizing Single-Slide Post...'
        : activePostFormat === 'reel'
        ? 'Synthesizing Motion Reel Scenes...'
        : 'Synthesizing AI Carousel...'
    );

    try {
      const generated = await runAutonomousPipeline(query, {
        theme,
        generateDiagram: !uploadedImage,
        inputMode: activeTab,
        imageBase64: uploadedImage?.base64,
        imageMimeType: uploadedImage?.mimeType,
        imageName: uploadedImage?.name,
        categoryHint: categoryHint !== 'auto' ? categoryHint : undefined,
        postFormat: pipelineTargetFormat,
        signal: controller.signal,
        onProgress: (status) => {
          if (isCurrentRun()) setPipelineStatus(status);
        },
      });

      if (!isCurrentRun()) return;

      if (deckRevisionRef.current !== startRevision) {
        onShowToast(
          'Generation finished, but your newer edits were kept. Re-run to replace the deck.'
        );
        return;
      }

      const cadenceAnalysis = analyzePostHistoryCadence(savedPosts, {
        prompt: query,
        category: generated.category || (categoryHint !== 'auto' ? categoryHint : undefined),
      });

      const rawAiThemeKey = generated.theme ? normalizeThemeId(generated.theme) : null;
      let resolvedTheme = theme;
      let cadenceToastNote = '';

      if (rawAiThemeKey && rawAiThemeKey === cadenceAnalysis.lastPostedThemeId) {
        resolvedTheme = cadenceAnalysis.recommendedPalette;
        cadenceToastNote = ` · Assigned ${resolvedTheme.name.split(' ')[0]} to avoid repeating last post`;
      } else if (rawAiThemeKey && DEFAULT_PALETTES[rawAiThemeKey]) {
        resolvedTheme = DEFAULT_PALETTES[rawAiThemeKey];
      } else {
        resolvedTheme = cadenceAnalysis.recommendedPalette;
      }

      onSelectTheme(resolvedTheme);

      const activeSlideBeforeGen = carousel.slides[currentSlideIndex] || carousel.slides[0];
      const preserveActiveVideo = activeSlideBeforeGen && isVideoSlide(activeSlideBeforeGen);
      const mergedSlides = preserveActiveVideo
        ? generated.slides.map((s, idx) =>
            idx === 0
              ? {
                  ...s,
                  type:
                    activeSlideBeforeGen.type === 'poster' || activePostFormat === 'single'
                      ? ('poster' as const)
                      : ('image' as const),
                  mediaType: 'video' as const,
                  videoUrl: activeSlideBeforeGen.videoUrl,
                  videoMimeType: activeSlideBeforeGen.videoMimeType,
                  videoFileName: activeSlideBeforeGen.videoFileName,
                  videoDuration: activeSlideBeforeGen.videoDuration,
                  videoMuted: activeSlideBeforeGen.videoMuted ?? true,
                  videoPlaying: activeSlideBeforeGen.videoPlaying ?? true,
                  videoBorderRadius: activeSlideBeforeGen.videoBorderRadius ?? 8,
                  imageFrameMode:
                    activeSlideBeforeGen.imageFrameMode === 'standard'
                      ? ('standard' as const)
                      : ('hero' as const),
                  imageFit: activeSlideBeforeGen.imageFit || 'contain',
                  imageBgStyle: activeSlideBeforeGen.imageBgStyle || 'white',
                  brandWatermark: activeSlideBeforeGen.brandWatermark || 'bottom-right',
                }
              : s
          )
        : generated.slides;

      const scopedGeneratedHooks = filterRelevantHookVariants(
        generated.hookVariants,
        mergedSlides,
        generated.category
      );

      const finalGenerated: CarouselData =
        activePostFormat === 'reel'
          ? {
              ...generated,
              slides: mergedSlides,
              formatDrafts: undefined,
              hookVariants: scopedGeneratedHooks,
              theme: resolvedTheme.id,
              postFormat: 'reel',
              reelConfig: convertCarouselToMotionReel(
                { ...generated, slides: mergedSlides },
                resolvedTheme,
                activeReelConfig.templateId || 'kinetic-text',
                activeReelConfig.languageMode || 'ar'
              ),
            }
          : {
              ...generated,
              slides: mergedSlides,
              formatDrafts: undefined,
              hookVariants: scopedGeneratedHooks,
              dimensionPreset: preserveActiveVideo
                ? carousel.dimensionPreset || 'ig-3:4'
                : generated.dimensionPreset,
              theme: resolvedTheme.id,
            };

      onUpdateCarousel(finalGenerated);
      changeSlide(0, finalGenerated.slides.length);
      setIsExpanded(false);
      setInspectorTab('copy');
      if (
        finalGenerated.sourceMeta?.isFallback ||
        finalGenerated.sourceMeta?.engine === 'offline-synthesizer'
      ) {
        onShowToast(
          (activePostFormat === 'single'
            ? 'Offline NLP Engine Activated: Synthesized single-slide post from your notes.'
            : activePostFormat === 'reel'
            ? 'Offline NLP Engine Activated: Synthesized motion reel scenes from your notes.'
            : 'Offline NLP Engine Activated: Synthesized custom slides from your notes.') +
            cadenceToastNote
        );
      } else {
        onShowToast(
          (activePostFormat === 'single'
            ? '✨ Autonomously generated standalone 1080×1920 single-slide post!'
            : activePostFormat === 'reel'
            ? '✨ Autonomously generated 1080×1920 animated Motion Reel!'
            : '✨ Autonomously generated and perfected 8-slide carousel!') + cadenceToastNote
        );
      }
    } catch (err) {
      if (controller.signal.aborted || !isCurrentRun()) return;
      if (
        err instanceof InsufficientSourceError ||
        (err && typeof err === 'object' && (err as { code?: string }).code === 'INSUFFICIENT_SOURCE')
      ) {
        const message =
          err instanceof Error
            ? err.message
            : 'Please paste a real topic or source before generating.';
        setInputValidationError(message);
        onShowToast(message);
        return;
      }
      console.error('Autonomous pipeline error:', err);
      onShowToast('Pipeline error — loaded resilient backup template.');
    } finally {
      if (runId === generationRunIdRef.current) {
        setIsGenerating(false);
        setPipelineStatus(null);
      }
    }
  };

  const handleInstantSynthesize = () => {
    const targetFormat: 'carousel' | 'single' =
      activePostFormat === 'single' ? 'single' : 'carousel';
    const sufficiency = validateSourceSufficiency({
      prompt: promptInput,
      categoryHint,
      imageFileName: uploadedImage?.name,
      hasMedia: Boolean(uploadedImage),
      postFormat: targetFormat,
    });
    if (!sufficiency.isSufficient) {
      setInputValidationError(sufficiency.reason);
      onShowToast(sufficiency.reason);
      return;
    }
    setInputValidationError(null);
    setIsExpanded(false);
    setInspectorTab('copy');
    generationRunIdRef.current += 1;
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setIsGenerating(false);
    setPipelineStatus(null);

    try {
      const generated = synthesizeCarousel({
        prompt: promptInput,
        categoryHint,
        inputMode: activeTab,
        imageFileName: uploadedImage?.name,
        hasMedia: Boolean(uploadedImage),
        postFormat: targetFormat,
      });
      const processed = enrichAndPaceCarousel(generated, promptInput);
      const resolvedTheme =
        processed.theme && DEFAULT_PALETTES[processed.theme]
          ? DEFAULT_PALETTES[processed.theme]
          : theme;
      if (processed.theme && DEFAULT_PALETTES[processed.theme]) {
        onSelectTheme(DEFAULT_PALETTES[processed.theme]);
      }
      const scopedProcessedHooks = filterRelevantHookVariants(
        processed.hookVariants,
        processed.slides,
        processed.category
      );
      const finalProcessed: CarouselData =
        activePostFormat === 'reel'
          ? {
              ...processed,
              formatDrafts: undefined,
              hookVariants: scopedProcessedHooks,
              postFormat: 'reel',
              reelConfig: convertCarouselToMotionReel(
                processed,
                resolvedTheme,
                activeReelConfig.templateId || 'marrok-slides',
                activeReelConfig.languageMode || 'bilingual'
              ),
            }
          : {
              ...processed,
              formatDrafts: undefined,
              hookVariants: scopedProcessedHooks,
            };
      onUpdateCarousel(finalProcessed);
      changeSlide(0, finalProcessed.slides.length);
      onShowToast(
        activePostFormat === 'single'
          ? '⚡ Synthesized standalone Single-Slide Post (Instant Offline Mode)'
          : activePostFormat === 'reel'
          ? '⚡ Synthesized animated Motion Reel (Instant Offline Mode)'
          : `⚡ Synthesized ${finalProcessed.slides.length}-slide carousel (Instant Offline Mode)`
      );
    } catch (err: unknown) {
      if (
        err instanceof InsufficientSourceError ||
        (err && typeof err === 'object' && (err as { code?: string }).code === 'INSUFFICIENT_SOURCE')
      ) {
        const message =
          err instanceof Error
            ? err.message
            : 'Please paste a real topic or source before generating.';
        setInputValidationError(message);
        onShowToast(message);
        return;
      }
      onShowToast(err instanceof Error ? err.message : 'Instant synthesis failed.');
    }
  };

  const handleTriggerStarterTopic = (topic: (typeof STARTER_TOPICS)[number]) => {
    setPromptInput(topic.prompt);
    void handleRunAutonomousPipeline(topic.prompt);
  };

  return {
    isGenerating,
    pipelineStatus,
    setPipelineStatus,
    handleRunAutonomousPipeline,
    handleInstantSynthesize,
    handleTriggerStarterTopic,
  };
}
