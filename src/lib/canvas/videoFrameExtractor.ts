import type { CarouselData, SlideData, SlideType, ThemePalette } from '../../types.ts';
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

export interface AnalyzeImageOptions {
  imageDataUrl?: string;
  imageBase64?: string;
  imageMimeType?: string;
  imageFileName?: string;
  prompt?: string;
  theme?: ThemePalette;
  currentSlide?: SlideData;
  keepFullMemeMode?: boolean;
  onProgress?: (status: string) => void;
  signal?: AbortSignal;
}

export interface AnalyzeImageResult {
  carousel: CarouselData;
  slideUpdates: Partial<SlideData>;
  caption: string;
  category: string;
  suggestedEnTitle: string;
  suggestedArTitle: string;
  suggestedEnBody: string;
  suggestedArBody: string;
  hookVariants?: CarouselData['hookVariants'];
}

function cleanImageTopicFromFileName(fileName?: string): string {
  const withoutExt = (fileName || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^(screenshot|img|image|photo|pxl|dsc)[_-]*\d*[_-]*/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return withoutExt || 'Developer Logic & Tech Humor';
}

/**
 * Replaces ONLY the visual graphic slot of a normal slide (in Carousel or Single-Slide mode)
 * while keeping existing slide titles, body copy, takeaways, and footer credits 100% intact.
 */
export function applySlideGraphicPhoto(
  prevSlide: SlideData,
  imageDataUrl: string,
  isSingleSlide = false
): SlideData {
  const targetType: SlideType =
    prevSlide.type === 'poster' || isSingleSlide ? 'poster' : 'image';
  const hasTakeaways = Array.isArray(prevSlide.takeaways) && prevSlide.takeaways.length > 0;
  const preservedFrameMode: 'hero' | 'standard' =
    prevSlide.imageFrameMode === 'standard' || hasTakeaways ? 'standard' : 'hero';

  return {
    ...prevSlide,
    type: targetType,
    mediaType: 'image',
    imageUrl: imageDataUrl,
    videoUrl: '',
    videoMimeType: undefined,
    videoFileName: undefined,
    standaloneMeme: false,
    imageFrameMode: preservedFrameMode,
    imageFit: prevSlide.imageFit || 'contain',
    imageFilter: prevSlide.imageFilter || 'clean',
    imageBgStyle: prevSlide.imageBgStyle || 'white',
    brandWatermark: prevSlide.brandWatermark || 'bottom-right',
    imageZoom: 1,
    imagePanX: 0,
    imagePanY: 0,
  };
}

/**
 * Immediately resets a carousel deck into a clean 1-slide Standalone Meme Post (`postFormat: 'meme'`).
 * Purges any previous template's category ('CYBERSECURITY & SYSTEMS'), takeaways ('In-kernel execution stack'),
 * old slide headlines, and old footer credit ('MARROK Engine') so the user gets a spotless meme frame in 0ms.
 */
export function buildCleanMemeCarouselDeck(
  prevCarousel: CarouselData,
  imageDataUrl: string,
  fileName?: string
): CarouselData {
  const cleanTopic = cleanImageTopicFromFileName(fileName);
  const cleanSlide: SlideData = {
    type: 'poster',
    mediaType: 'image',
    imageUrl: imageDataUrl,
    videoUrl: '',
    videoMimeType: undefined,
    videoFileName: undefined,
    standaloneMeme: true,
    imageFrameMode: 'full',
    imageFit: 'contain',
    imageFilter: 'clean',
    imageBgStyle: 'white',
    brandWatermark: 'bottom-right',
    imageCaption: '',
    enTitle: '',
    arTitle: '',
    enBody: '',
    arBody: '',
    takeaways: [],
    enCredit: '',
    arCredit: '',
    metricValue: '',
    metricLabel: '',
    metricDiff: '',
    imageZoom: 1,
    imagePanX: 0,
    imagePanY: 0,
    layoutOverrides: undefined,
  };

  return {
    ...prevCarousel,
    category: '',
    postFormat: 'meme',
    dimensionPreset: prevCarousel.dimensionPreset || 'tiktok-9:16',
    channel: '',
    caption: `${cleanTopic} — Developer humor & engineering reality.\n\nواقع الهندسة والبرمجة باختصار.\n\n#MARROK #TechHumor #SoftwareEngineering #Programming #TechInArabic`,
    shortCaption: `${cleanTopic} #MARROK #TechHumor`,
    firstComment: '',
    hookVariants: [],
    slides: [cleanSlide],
    sourceMeta: {
      title: cleanTopic,
      engine: 'grounded',
      status: 'verified_live',
      userReviewed: true,
      isFallback: false,
      creator: '',
      channel: '',
    },
  };
}

/**
 * Analyzes an uploaded meme or photo using Vision AI (`/api/generate` with `imageBase64`)
 * to generate a bilingual social media caption with hashtags,
 * and suggested bilingual slide headlines/body (kept optional when uploading a normal slide graphic).
 */
export async function analyzeImageForMemeAndCaption(
  options: AnalyzeImageOptions
): Promise<AnalyzeImageResult> {
  const {
    imageDataUrl,
    imageBase64: rawBase64,
    imageMimeType = 'image/jpeg',
    imageFileName = 'meme-upload.jpg',
    prompt = '',
    theme,
    currentSlide,
    keepFullMemeMode = true,
    onProgress,
    signal,
  } = options;
  const imageBase64 = imageDataUrl || rawBase64 || '';

  const inferredTopic = cleanImageTopicFromFileName(imageFileName);
  const userHint = prompt.trim();
  const effectivePrompt =
    userHint ||
    `Analyze the attached uploaded image ("${inferredTopic}"). Read all visible text, diagrams, humor, or visual flow in the image. Generate a witty and engaging bilingual English + Arabic social media caption with relevant hashtags, and a punchy bilingual headline and body summarizing the image.`;

  onProgress?.('Analyzing uploaded photo & generating AI copy...');
  const generatedCarousel = await runAutonomousPipeline(effectivePrompt, {
    theme,
    generateDiagram: false,
    inputMode: 'upload',
    imageBase64,
    imageMimeType,
    imageName: imageFileName,
    postFormat: 'single',
    signal,
    onProgress,
  });

  const aiSlide = generatedCarousel.slides[0] || {};
  const isFallback =
    generatedCarousel.sourceMeta?.isFallback ||
    generatedCarousel.sourceMeta?.engine === 'offline-synthesizer';

  const resolvedCategory = keepFullMemeMode
    ? ''
    : !isFallback &&
      generatedCarousel.category &&
      !/CYBERSECURITY|REVERSE ENGINEERING/i.test(generatedCarousel.category)
    ? generatedCarousel.category
    : generatedCarousel.category || 'SYSTEMS ARCHITECTURE';

  const resolvedCaption =
    !isFallback && generatedCarousel.caption
      ? generatedCarousel.caption
      : `${inferredTopic} — When human logic meets silicon engineering.\n\nمنطق المطورين وهندسة الحواسيب في صورة واحدة.\n\n#MARROK #TechHumor #SoftwareEngineering #Hardware #TechInArabic`;

  const suggestedEnTitle =
    (!isFallback && aiSlide.enTitle) ? aiSlide.enTitle : `${inferredTopic}.`;
  const suggestedArTitle =
    (!isFallback && aiSlide.arTitle) ? aiSlide.arTitle : 'تحليل بصري وتقني للصورة المرفقة.';
  const suggestedEnBody =
    (!isFallback && aiSlide.enBody)
      ? aiSlide.enBody
      : `Key engineering takeaway and visual insight from ${inferredTopic}.`;
  const suggestedArBody =
    (!isFallback && aiSlide.arBody)
      ? aiSlide.arBody
      : 'الخلاصة الهندسية والتقنية المستخلصة مباشرة من الصورة المرفقة.';

  const slideUpdates: Partial<SlideData> = {
    type: 'poster',
    mediaType: 'image',
    imageUrl: currentSlide?.imageUrl || imageBase64,
    standaloneMeme: keepFullMemeMode,
    imageFrameMode: keepFullMemeMode ? 'full' : 'hero',
    imageFit: currentSlide?.imageFit || 'contain',
    imageBgStyle: currentSlide?.imageBgStyle || 'white',
    brandWatermark: currentSlide?.brandWatermark || 'bottom-right',
    takeaways: keepFullMemeMode ? [] : currentSlide?.takeaways,
    enCredit: currentSlide?.enCredit || '',
    arCredit: currentSlide?.arCredit || '',
    enTitle: keepFullMemeMode ? '' : suggestedEnTitle,
    arTitle: keepFullMemeMode ? '' : suggestedArTitle,
    enBody: keepFullMemeMode ? '' : suggestedEnBody,
    arBody: keepFullMemeMode ? '' : suggestedArBody,
  };

  return {
    carousel: {
      ...generatedCarousel,
      category: resolvedCategory,
      caption: resolvedCaption,
      postFormat: keepFullMemeMode ? 'meme' : 'single',
      slides: [
        {
          ...(currentSlide || aiSlide),
          ...slideUpdates,
        },
      ],
    },
    slideUpdates,
    caption: resolvedCaption,
    category: resolvedCategory,
    suggestedEnTitle,
    suggestedArTitle,
    suggestedEnBody,
    suggestedArBody,
    hookVariants: generatedCarousel.hookVariants,
  };
}



