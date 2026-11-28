import { CarouselData, SlideData, ThemePalette } from '../types';
import { sanitizeFullCarousel } from './text/sanitizer';
import { autoFitTextToLimits, autoPolishHeadline } from './text/headlines';
import { fixArabicPunctuation } from './text/arabicBiDi';
import { runQAChecks, CHAR_LIMITS } from './qaChecks';
import {
  synthesizeCarousel,
  resolveDomainTheme,
  enrichCarouselDiagrams,
  balanceCarouselVisualPacing,
  validateSourceSufficiency,
  InsufficientSourceError,
  applyHookEngineToSlide1,
  applyDeckAwareAutoLayout,
  deriveCoverTeaserForSlide,
  resolveSlide1CoverStyle,
} from './synthesis';
import { parseCarouselData } from './validation/carousel';
import { parseImageDataUrl } from './validation/image';
import { createRequestDeadline } from './network/requestDeadline';
import { getCustomGeminiHeaders } from './network/httpClient';
import { withClientAuthHeaders } from './security/clientSessionToken';

const GENERATION_REQUEST_TIMEOUT_MS = 90000;
const IMAGE_REQUEST_TIMEOUT_MS = 50000;

export interface AutonomousPipelineOptions {
  onProgress?: (status: string) => void;
  theme?: ThemePalette;
  generateDiagram?: boolean;
  inputMode?: string;
  imageBase64?: string | null;
  imageMimeType?: string;
  imageName?: string;
  categoryHint?: string;
  postFormat?: 'carousel' | 'single';
  signal?: AbortSignal;
  /** Optional base URL used when running in Node (e.g. CLI/tests/cron) where relative /api/* paths fail URL parsing. */
  apiBaseUrl?: string;
  /** Optional custom fetch implementation (useful in Node or headless runners). */
  fetchFn?: typeof fetch;
  /** Optional server-side direct generator callback to bypass HTTP when running on the backend. */
  directGenerate?: (payload: Record<string, unknown>) => Promise<CarouselData | null>;
}

/**
 * Resolves a relative `/api/*` endpoint safely in both browser and Node runtimes.
 * In Node (where `typeof window === 'undefined'`), `fetch('/api/generate')` throws
 * `TypeError: Failed to parse URL from /api/generate`, so we qualify it with an absolute base URL.
 */
export function resolvePipelineApiUrl(endpointPath: string, apiBaseUrl?: string): string {
  if (/^https?:\/\//i.test(endpointPath)) {
    return endpointPath;
  }
  const normalizedPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;
  if (apiBaseUrl && /^https?:\/\//i.test(apiBaseUrl.trim())) {
    return `${apiBaseUrl.trim().replace(/\/+$/, '')}${normalizedPath}`;
  }
  if (typeof window !== 'undefined' && window.location?.origin && !/^null$/i.test(window.location.origin)) {
    return normalizedPath;
  }
  const envObj =
    typeof process !== 'undefined' && process.env
      ? process.env
      : undefined;
  const envBase =
    envObj?.MARROK_API_BASE_URL ||
    envObj?.VITE_API_BASE_URL ||
    envObj?.DEPLOY_PRIME_URL ||
    envObj?.URL ||
    'http://127.0.0.1:3000';
  return `${envBase.replace(/\/+$/, '')}${normalizedPath}`;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Operation aborted', 'AbortError');
  }
}

/**
 * Enforces Spec §8 sanitization, character limit auto-fitting,
 * headline polishing, multi-node diagram enrichment, and visual pacing.
 */
export function enrichAndPaceCarousel(
  carousel: CarouselData,
  rawInput: string = ''
): CarouselData {
  // Step 1: Auto-Sanitize Markdown, Hashes, Orphan Dots & BiDi order
  let cleanCarousel = sanitizeFullCarousel(carousel);

  // Step 2: Auto-Fit Character Limits & Polish Headlines
  const isSingleCarousel = cleanCarousel.postFormat === 'single' || cleanCarousel.slides.length <= 1;
  const polishedSlides: SlideData[] = cleanCarousel.slides.map((slide, idx) => {
    const polishedTitle = autoPolishHeadline(slide.enTitle || '');
    const fittedEnTitle = autoFitTextToLimits(polishedTitle, CHAR_LIMITS.enTitle);
    const fittedEnBody = autoFitTextToLimits(slide.enBody || '', CHAR_LIMITS.enBody);
    const fittedArTitle = autoFitTextToLimits(slide.arTitle || '', CHAR_LIMITS.arTitle);

    const fixedArabicBody = fixArabicPunctuation(slide.arBody || '');
    const fittedArBody = autoFitTextToLimits(fixedArabicBody, CHAR_LIMITS.arBody);

    const updated: SlideData = {
      ...slide,
      enTitle: fittedEnTitle,
      enBody: fittedEnBody,
      arTitle: fittedArTitle,
      arBody: fittedArBody,
    };

    if (!isSingleCarousel && idx === 0) {
      return applyHookEngineToSlide1(updated, false, rawInput);
    }
    return updated;
  });

  // Step 3: Enrich diagrams and satellites with topic-relevant specifications
  const enrichedSlides = enrichCarouselDiagrams(
    polishedSlides,
    rawInput,
    cleanCarousel.category || '',
    cleanCarousel.brand || 'MARROK'
  );
  const balancedSlides =
    isSingleCarousel
      ? enrichedSlides
      : balanceCarouselVisualPacing(enrichedSlides);

  const autoLaidOutSlides = applyDeckAwareAutoLayout(balancedSlides, {
    postFormat: isSingleCarousel ? 'single' : 'carousel',
    preserveAuthenticAiVisuals: true,
  });

  // Re-ensure Slide 1 multi-slide hook rule (zero body text on slide 0) + Cover Hero defaults after pacing
  const finalPacedSlides =
    !isSingleCarousel && autoLaidOutSlides.length > 1
      ? autoLaidOutSlides.map((s, idx) => {
          if (idx !== 0 || s.standaloneMeme) return s;
          const teasers = deriveCoverTeaserForSlide(s, autoLaidOutSlides);
          return {
            ...s,
            storyRole: 'hook' as const,
            compositionPreset: s.manualLayoutLocked ? s.compositionPreset : ('headline-first' as const),
            coverStyle: resolveSlide1CoverStyle(s, autoLaidOutSlides),
            coverTeaserEn: s.coverTeaserEn || teasers.coverTeaserEn,
            coverTeaserAr: s.coverTeaserAr || teasers.coverTeaserAr,
            showSwipeCue: s.showSwipeCue ?? true,
            enBody: '',
            arBody: '',
          };
        })
      : autoLaidOutSlides;

  cleanCarousel = {
    ...cleanCarousel,
    slides: finalPacedSlides,
  };

  // Step 4: Quality verification check
  const qaReport = runQAChecks(cleanCarousel);
  if (qaReport.warnCount > 0) {
    cleanCarousel = sanitizeFullCarousel(cleanCarousel);
  }

  return cleanCarousel;
}

/**
 * Autonomously runs the entire synthesis, sanitization, localization,
 * character limit fitting, visual pacing, and optional 9:16 diagram generation pipeline.
 * No manual knobs needed: the engine does all the work end-to-end.
 */
export async function runAutonomousPipeline(
  rawInput: string,
  options: AutonomousPipelineOptions = {}
): Promise<CarouselData> {
  const {
    onProgress,
    theme,
    generateDiagram = true,
    inputMode,
    imageBase64,
    imageMimeType,
    imageName,
    categoryHint,
    postFormat = 'carousel',
    signal,
    apiBaseUrl,
    fetchFn,
    directGenerate,
  } = options;

  const activeFetch: typeof fetch = fetchFn || fetch;
  const isSinglePost = postFormat === 'single';

  // Step 1: Validate input sufficiency (reject empty / < 20 chars / < 4 meaningful words without media)
  throwIfAborted(signal);
  const sufficiency = validateSourceSufficiency({
    prompt: rawInput,
    imageFileName: imageName,
    hasMedia: Boolean(imageBase64),
  });
  if (!sufficiency.isSufficient) {
    throw new InsufficientSourceError(sufficiency);
  }

  onProgress?.(
    isSinglePost
      ? 'Synthesizing standalone 1080×1920 single-slide post...'
      : 'Synthesizing 8-slide architecture carousel...'
  );
  let rawCarousel: CarouselData | null = null;

  const requestHeaders: Record<string, string> = withClientAuthHeaders({
    'Content-Type': 'application/json',
    ...getCustomGeminiHeaders(),
  });

  const generationPayload: Record<string, unknown> = {
    prompt: rawInput,
    topic: rawInput,
    notes: rawInput,
    inputMode,
    imageBase64,
    imageMimeType,
    imageName,
    categoryHint,
    postFormat,
  };

  const generationDeadline = createRequestDeadline(signal, GENERATION_REQUEST_TIMEOUT_MS);
  try {
    if (directGenerate) {
      const directResult = await directGenerate(generationPayload);
      const parsed = directResult
        ? parseCarouselData(directResult, {
            minSlides: isSinglePost ? 1 : 3,
            requireSlideContent: true,
          })
        : null;
      if (parsed) {
        rawCarousel = parsed;
      }
    } else {
      const generateUrl = resolvePipelineApiUrl('/api/generate', apiBaseUrl);
      const res = await activeFetch(generateUrl, {
        method: 'POST',
        credentials: 'include',
        headers: requestHeaders,
        signal: generationDeadline.signal,
        body: JSON.stringify(generationPayload),
      });

      if (res.ok) {
        const data = await res.json();
        const parsed = parseCarouselData(data, {
          minSlides: isSinglePost ? 1 : 3,
          requireSlideContent: true,
        });
        if (parsed) {
          const headerEngine = res.headers.get('x-marrok-engine') as
            | 'grounded'
            | 'ungrounded'
            | 'offline'
            | 'gemini-ai'
            | 'offline-synthesizer'
            | null;
          const headerFallbackReason = res.headers.get('x-marrok-fallback-reason');
          if (parsed.sourceMeta && headerEngine && !parsed.sourceMeta.engine) {
            parsed.sourceMeta.engine = headerEngine;
          }
          if (parsed.sourceMeta && headerFallbackReason && !parsed.sourceMeta.fallbackReason) {
            parsed.sourceMeta.fallbackReason = headerFallbackReason;
          }
          rawCarousel = parsed;
          if (
            parsed.sourceMeta?.isFallback ||
            parsed.sourceMeta?.engine === 'offline' ||
            parsed.sourceMeta?.engine === 'offline-synthesizer' ||
            headerEngine === 'offline' ||
            headerEngine === 'offline-synthesizer'
          ) {
            onProgress?.('Live AI busy — built clean local fallback draft (you can Retry with AI).');
          }
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    console.warn('API generation failed, falling back to local synthesizer:', err);
  } finally {
    generationDeadline.cleanup();
  }

  throwIfAborted(signal);

  // Fallback to local synthesizer if API fails or returns invalid structure
  if (!rawCarousel) {
    onProgress?.('Live AI unavailable — built clean local fallback draft.');
    rawCarousel = synthesizeCarousel({
      prompt: rawInput,
      categoryHint,
      inputMode,
      imageFileName: imageName,
      hasMedia: Boolean(imageBase64),
      postFormat,
    });
    if (rawCarousel.sourceMeta) {
      rawCarousel.sourceMeta.userReviewed = false;
      rawCarousel.sourceMeta.isFallback = true;
      rawCarousel.sourceMeta.fallbackReason =
        rawCarousel.sourceMeta.fallbackReason || 'Live AI gateway unreachable — local fallback engine used';
    }
  }

  if (isSinglePost) {
    rawCarousel.postFormat = 'single';
    if (rawCarousel.slides.length > 1) {
      rawCarousel.slides = [rawCarousel.slides[0]];
    }
  } else {
    rawCarousel.postFormat = 'carousel';
  }

  // Domain-Aware Theme Routing: match input topic to best visual theme
  const domainTheme = theme?.id || resolveDomainTheme(rawInput);
  if (!rawCarousel.theme || rawCarousel.theme === 'default') {
    rawCarousel.theme = domainTheme;
  }

  // Step 2 & 3: Protect Authentic AI Output vs Fallback Pipeline
  let cleanCarousel: CarouselData;
  if (!rawCarousel.sourceMeta?.isFallback) {
    // 100% Authentic AI Output: Preserve the AI's exact headlines, natural Arabic translations, and diagram nodes,
    // while running deck-aware Auto-Layout with preserveAuthenticAiVisuals: true to fix weak/repetitive slides and default Auto mode on.
    const sanitized = sanitizeFullCarousel(rawCarousel);
    cleanCarousel = {
      ...sanitized,
      slides: applyDeckAwareAutoLayout(sanitized.slides, {
        postFormat: isSinglePost ? 'single' : 'carousel',
        preserveAuthenticAiVisuals: true,
      }),
    };
  } else {
    // Local Synthesis Fallback: Apply layout enrichment and visual pacing
    onProgress?.('Enforcing Spec §8 character limits, polishing headlines & pacing...');
    cleanCarousel = enrichAndPaceCarousel(rawCarousel, rawInput);
  }

  throwIfAborted(signal);

  // Step 4: Auto-Generate 9:16 Architecture Diagram ONLY for slides explicitly designated as 'image'
  if (generateDiagram) {
    const imageSlideIdx = cleanCarousel.slides.findIndex(
      (s) => s.type === 'image' && !s.imageUrl
    );

    if (imageSlideIdx >= 0) {
      const targetSlide = cleanCarousel.slides[imageSlideIdx];
      onProgress?.('Generating native 9:16 architecture diagram...');
      const imageDeadline = createRequestDeadline(signal, IMAGE_REQUEST_TIMEOUT_MS);
      try {
        const diagramPrompt = `Architectural system diagram for ${targetSlide.enTitle || 'distributed systems'}: ${targetSlide.enBody?.slice(0, 120) || ''}. Isometric vector blueprint, high contrast, glowing neon accents, deep carbon background.`;

        const generateImageUrl = resolvePipelineApiUrl('/api/generate-image', apiBaseUrl);
        const imgRes = await activeFetch(generateImageUrl, {
          method: 'POST',
          credentials: 'include',
          headers: requestHeaders,
          signal: imageDeadline.signal,
          body: JSON.stringify({
            prompt: diagramPrompt,
            aspectRatio: '9:16',
            stylePreset: 'blueprint',
          }),
        });

        if (imgRes.ok) {
          const imgData = await imgRes.json();
          const parsedImage = parseImageDataUrl(imgData?.imageUrl);
          if (parsedImage) {
            cleanCarousel.slides[imageSlideIdx] = {
              ...targetSlide,
              type: 'image',
              imageUrl: parsedImage.dataUrl,
              imagePrompt: diagramPrompt,
              imageModel: imgData.model || 'gemini-nano-banana-2.1',
              imageFilter: 'hud',
              imageFit: 'contain',
              imageCaption: targetSlide.enTitle || 'System Architecture',
            };
          }
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        console.warn('Autonomous image generation encountered an error (continuing with vector layout):', err);
      } finally {
        imageDeadline.cleanup();
      }
    }
  }

  throwIfAborted(signal);

  // Step 5: Final Quality Verification Scan
  onProgress?.('Running final QA compliance verification...');
  const qaReport = runQAChecks(cleanCarousel);
  if (qaReport.warnCount > 0) {
    cleanCarousel = sanitizeFullCarousel(cleanCarousel);
  }

  throwIfAborted(signal);
  onProgress?.('Ready!');
  return cleanCarousel;
}
