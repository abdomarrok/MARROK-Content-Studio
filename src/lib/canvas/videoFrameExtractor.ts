import type { CarouselData, SlideData, ThemePalette } from '../../types.ts';
import { runAutonomousPipeline } from '../autonomousPipeline.ts';
import { sanitizeSlide } from '../text/sanitizer.ts';
import { seedSingleSlideTakeaways } from '../synthesis/singleSlideCondenser.ts';

export interface ExtractedVideoStoryboard {
  base64DataUrl: string;
  dataUrl: string;
  mimeType: 'image/jpeg';
  durationSec: number;
  duration: number;
  width: number;
  height: number;
  fileName: string;
  sizeKb: number;
}

export interface AnalyzeVideoOptions {
  videoSource: File | string;
  videoFileName?: string;
  prompt?: string;
  promptHint?: string;
  categoryHint?: string;
  postFormat?: 'carousel' | 'single';
  theme?: ThemePalette;
  currentSlide?: SlideData;
  onProgress?: (status: string) => void;
  signal?: AbortSignal;
}

export interface AnalyzeVideoResult {
  carousel: CarouselData;
  slideUpdates: Partial<SlideData>;
  caption: string;
  category?: string;
  hookVariants?: CarouselData['hookVariants'];
  storyboard: ExtractedVideoStoryboard;
}

// 1x1 dark slate JPEG fallback for headless/jsdom environments where HTMLCanvasElement.toDataURL or video decoding is unavailable
const SYNTHETIC_STORYBOARD_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

function cleanVideoTopicFromFileName(fileName: string): string {
  const withoutExt = (fileName || 'engineering-video')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(mp4|webm|mov|video|clip|final|export|v\d+)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return withoutExt || 'System Architecture & Engineering Demo';
}

/**
 * Extracts a 2x2 storyboard contact-sheet JPEG (4 keyframes at 12%, 38%, 64%, 88% of duration)
 * from an uploaded video File or URL so Gemini Vision (`/api/generate`) can inspect the visual
 * progression, on-screen text, code, and diagrams in the video.
 */
export async function extractVideoStoryboardDataUrl(
  videoSource: File | string,
  fileNameHint?: string
): Promise<ExtractedVideoStoryboard> {
  const fileName =
    typeof videoSource !== 'string'
      ? videoSource.name || fileNameHint || 'video.mp4'
      : fileNameHint || videoSource.split('/').pop()?.split('?')[0] || 'video.mp4';

  const isJsdom =
    typeof navigator !== 'undefined' &&
    /jsdom|HappyDOM/i.test(navigator.userAgent || '');

  if (isJsdom || typeof document === 'undefined') {
    return {
      base64DataUrl: SYNTHETIC_STORYBOARD_DATA_URL,
      dataUrl: SYNTHETIC_STORYBOARD_DATA_URL,
      mimeType: 'image/jpeg',
      durationSec: 6.0,
      duration: 6.0,
      width: 1280,
      height: 720,
      fileName,
      sizeKb: 4,
    };
  }

  let revokeUrl: string | null = null;
  const videoUrl =
    typeof videoSource === 'string'
      ? videoSource
      : (() => {
          revokeUrl = URL.createObjectURL(videoSource);
          return revokeUrl;
        })();

  try {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = videoUrl;

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const timer = setTimeout(done, 3500);
      video.addEventListener(
        'loadeddata',
        () => {
          clearTimeout(timer);
          done();
        },
        { once: true }
      );
      video.addEventListener(
        'error',
        () => {
          clearTimeout(timer);
          done();
        },
        { once: true }
      );
      try {
        video.load();
      } catch {
        clearTimeout(timer);
        done();
      }
    });

    const durationSec =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 6.0;
    const vidW = video.videoWidth || 1280;
    const vidH = video.videoHeight || 720;

    const canvas = document.createElement('canvas');
    const gridW = 960;
    const gridH = 960;
    canvas.width = gridW;
    canvas.height = gridH;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return {
        base64DataUrl: SYNTHETIC_STORYBOARD_DATA_URL,
        dataUrl: SYNTHETIC_STORYBOARD_DATA_URL,
        mimeType: 'image/jpeg',
        durationSec,
        duration: durationSec,
        width: vidW,
        height: vidH,
        fileName,
        sizeKb: 4,
      };
    }

    ctx.fillStyle = '#080d11';
    ctx.fillRect(0, 0, gridW, gridH);

    const sampleRatios = [0.12, 0.38, 0.64, 0.88];
    const cellW = gridW / 2;
    const cellH = gridH / 2;

    for (let i = 0; i < sampleRatios.length; i++) {
      const targetTime = Math.max(
        0,
        Math.min(durationSec - 0.05, durationSec * sampleRatios[i])
      );
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        const t = setTimeout(finish, 300);
        video.addEventListener(
          'seeked',
          () => {
            clearTimeout(t);
            finish();
          },
          { once: true }
        );
        try {
          video.currentTime = targetTime;
        } catch {
          clearTimeout(t);
          finish();
        }
      });

      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = col * cellW + 8;
      const y = row * cellH + 8;
      const w = cellW - 16;
      const h = cellH - 16;

      ctx.save();
      ctx.fillStyle = '#111827';
      ctx.fillRect(x, y, w, h);

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const aspect = video.videoWidth / video.videoHeight;
        let dw = w;
        let dh = w / aspect;
        if (dh > h) {
          dh = h;
          dw = h * aspect;
        }
        const dx = x + (w - dw) / 2;
        const dy = y + (h - dh) / 2;
        try {
          ctx.drawImage(video, dx, dy, dw, dh);
        } catch {
          // ignore draw error
        }
      }

      // Timestamp badge for AI context
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(x + 8, y + 8, 96, 24);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(`FRAME #${i + 1} (${targetTime.toFixed(1)}s)`, x + 14, y + 24);
      ctx.restore();
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
    const validDataUrl =
      dataUrl && dataUrl.startsWith('data:image/')
        ? dataUrl
        : SYNTHETIC_STORYBOARD_DATA_URL;
    const sizeKb = Math.max(1, Math.round((validDataUrl.length * 0.75) / 1024));

    return {
      base64DataUrl: validDataUrl,
      dataUrl: validDataUrl,
      mimeType: 'image/jpeg',
      durationSec,
      duration: durationSec,
      width: vidW,
      height: vidH,
      fileName,
      sizeKb,
    };
  } finally {
    if (revokeUrl) {
      try {
        URL.revokeObjectURL(revokeUrl);
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Analyzes an uploaded video (via its 2x2 storyboard keyframes + filename + optional user prompt)
 * using the MARROK AI pipeline (`/api/generate` -> free AI backup -> local synthesizer)
 * to generate bilingual English + Arabic slide copy (`enTitle`, `arTitle`, `enBody`, `arBody`, `takeaways`)
 * and a bilingual social media `caption` with hashtags, while preserving the video on the slide.
 */
export async function analyzeVideoForSlideAndCaption(
  options: AnalyzeVideoOptions
): Promise<AnalyzeVideoResult> {
  const {
    videoSource,
    videoFileName,
    prompt,
    promptHint = '',
    categoryHint,
    postFormat = 'single',
    theme,
    currentSlide,
    onProgress,
    signal,
  } = options;

  onProgress?.('Extracting video keyframes for AI analysis...');
  const storyboard = await extractVideoStoryboardDataUrl(videoSource, videoFileName);

  const inferredTopic = cleanVideoTopicFromFileName(storyboard.fileName);
  const userPromptText = (prompt || promptHint || '').trim();
  const existingContext = [
    userPromptText,
    currentSlide?.enTitle && !/Expectations|Architecture Poster|Old Headline/i.test(currentSlide.enTitle)
      ? currentSlide.enTitle
      : '',
  ]
    .filter(Boolean)
    .join(' — ');

  const effectivePrompt =
    existingContext ||
    `Analyze the attached 4-frame video storyboard from "${inferredTopic}" (${storyboard.durationSec.toFixed(
      1
    )}s video). Synthesize a sharp bilingual English + Modern Standard Arabic headline, technical explanation body, 3 key takeaways, and a high-engagement bilingual social media caption with hashtags that accurately describe the video.`;

  onProgress?.('Synthesizing bilingual slide text & social caption from video...');
  const generatedCarousel = await runAutonomousPipeline(effectivePrompt, {
    theme,
    generateDiagram: false,
    inputMode: 'upload',
    imageBase64: storyboard.base64DataUrl,
    imageMimeType: storyboard.mimeType,
    imageName: storyboard.fileName,
    categoryHint,
    postFormat,
    signal,
    onProgress,
  });

  const aiSlide = generatedCarousel.slides[0] || {};
  const resolvedTakeaways =
    aiSlide.takeaways && aiSlide.takeaways.length > 0
      ? aiSlide.takeaways
      : seedSingleSlideTakeaways(aiSlide, generatedCarousel.category);

  const preservedVideoUrl =
    currentSlide?.videoUrl ||
    (typeof videoSource === 'string' && !videoSource.startsWith('data:image/') ? videoSource : '');

  const slideUpdates: Partial<SlideData> = {
    enTitle: aiSlide.enTitle || `${inferredTopic}.`,
    arTitle: aiSlide.arTitle || 'تحليل تقني ومعماري للفيديو.',
    enBody:
      aiSlide.enBody ||
      'Key system behaviors and real-time execution flow captured directly from the video.',
    arBody:
      aiSlide.arBody ||
      'استعراض الآليات الهندسية وتدفق العمليات الفعلي الموضح داخل الفيديو.',
    takeaways: resolvedTakeaways,
    mediaType: 'video',
    videoUrl: preservedVideoUrl,
    videoMimeType: currentSlide?.videoMimeType || 'video/mp4',
    videoDuration: storyboard.durationSec,
    videoFileName: storyboard.fileName,
    imageFrameMode: currentSlide?.imageFrameMode === 'standard' ? 'standard' : 'hero',
  };

  if (currentSlide) {
    const mergedSlide = sanitizeSlide(
      {
        ...currentSlide,
        ...slideUpdates,
        mediaType: 'video',
      },
      0,
      1
    );
    generatedCarousel.slides[0] = mergedSlide;
  }

  return {
    carousel: generatedCarousel,
    slideUpdates,
    caption: generatedCarousel.caption || '',
    category: generatedCarousel.category,
    hookVariants: generatedCarousel.hookVariants,
    storyboard,
  };
}

