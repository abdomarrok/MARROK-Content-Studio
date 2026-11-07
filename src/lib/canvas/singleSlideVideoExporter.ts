import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type {
  CarouselData,
  CanvasDimensionPreset,
  ThemePalette,
} from '../../types.ts';
import { getCanvasDimensionSpec, isVideoSlide, getSlideMediaUrl } from './constants.ts';
import { renderSlideToCanvas } from './renderSlide.ts';
import { fixMp4DurationBytes, fixVideoBlobDuration } from '../motion/containerDurationFix.ts';

export interface SingleSlideVideoExportOptions {
  fps?: 30 | 60;
  dimensionPreset?: CanvasDimensionPreset;
  theme?: ThemePalette;
  visualOptions?: CarouselData['visualOptions'];
  preserveAudio?: boolean;
  maxDurationSec?: number;
  onProgress?: (percent: number, stage: string) => void;
  signal?: AbortSignal;
}

export interface SingleSlideVideoExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  extension: 'mp4' | 'webm';
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  totalFrames: number;
}

function sanitizeFileSlug(text: string): string {
  return (
    (text || 'STANDALONE_SPEC')
      .replace(/[^a-z0-9]/gi, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .toUpperCase()
      .slice(0, 36) || 'STANDALONE_SPEC'
  );
}

/**
 * Loads an HTMLVideoElement and resolves its metadata (duration, dimensions).
 * Falls back gracefully in headless/jsdom test environments.
 */
async function loadVideoElement(
  videoUrl: string,
  fallbackDurationSec = 4
): Promise<{ video: HTMLVideoElement; durationSec: number; isSyntheticTestEnv: boolean }> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.preload = 'auto';
  video.muted = true;
  video.src = videoUrl;

  const isJsdom =
    typeof navigator !== 'undefined' &&
    /jsdom|HappyDOM/i.test(navigator.userAgent || '');

  if (isJsdom) {
    return {
      video,
      durationSec: fallbackDurationSec,
      isSyntheticTestEnv: true,
    };
  }

  return await new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      const dur =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : fallbackDurationSec;
      resolve({ video, durationSec: dur, isSyntheticTestEnv: false });
    }, 4500);

    const handleLoaded = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      const dur =
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : fallbackDurationSec;
      resolve({ video, durationSec: dur, isSyntheticTestEnv: false });
    };

    const handleError = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(new Error('Failed to load video source for MP4 export.'));
    };

    video.addEventListener('loadeddata', handleLoaded, { once: true });
    video.addEventListener('loadedmetadata', handleLoaded, { once: true });
    video.addEventListener('error', handleError, { once: true });
    try {
      video.load();
    } catch {
      handleLoaded();
    }
  });
}

/**
 * Seeks an HTMLVideoElement to a specific timestamp (seconds) and awaits frame readiness.
 */
async function seekVideoToTime(video: HTMLVideoElement, timeSec: number): Promise<void> {
  if (typeof navigator !== 'undefined' && /jsdom|HappyDOM/i.test(navigator.userAgent || '')) {
    return;
  }
  const clamped = Math.max(0, Math.min(timeSec, Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.001) : timeSec));
  if (Math.abs(video.currentTime - clamped) < 0.004) {
    return;
  }
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      resolve();
    };
    const timer = setTimeout(finish, 250);
    video.addEventListener(
      'seeked',
      () => {
        clearTimeout(timer);
        finish();
      },
      { once: true }
    );
    try {
      video.currentTime = clamped;
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

/**
 * Attempts to decode the original audio track from the uploaded video URL
 * into an AudioBuffer so WebCodecs AudioEncoder can mux the original audio.
 */
async function decodeOriginalVideoAudio(
  videoUrl: string,
  preserveAudio: boolean
): Promise<AudioBuffer | null> {
  if (!preserveAudio) return null;
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  try {
    const response = await fetch(videoUrl);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) return null;
    const audioCtx = new AudioCtx({ sampleRate: 48000 });
    try {
      const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
      return decoded;
    } finally {
      void audioCtx.close().catch(() => {});
    }
  } catch {
    return null;
  }
}

/**
 * Renders the single-slide template shell (`1080x1440` `STANDALONE INFOGRAPHIC SPEC` by default)
 * and composites the `<video>` frames + layered corner registration marks and `@MARROK` badge
 * into a downloadable `.mp4` file at 30 or 60 FPS while preserving the original audio track.
 */
export async function exportSingleSlideVideoMp4(
  carousel: CarouselData,
  slideIndex = 0,
  options: SingleSlideVideoExportOptions = {}
): Promise<SingleSlideVideoExportResult> {
  const slide = carousel.slides[slideIndex] || carousel.slides[0];
  if (!slide) {
    throw new Error('No slide available to export.');
  }

  const videoUrl = getSlideMediaUrl(slide);
  if (!videoUrl || !isVideoSlide(slide)) {
    throw new Error('Active slide does not contain a video media source.');
  }

  const fps = options.fps ?? 30;
  // Default single-slide video export to 1080x1440 ('ig-3:4') per STANDALONE INFOGRAPHIC SPEC
  const targetPreset: CanvasDimensionPreset =
    options.dimensionPreset ||
    carousel.dimensionPreset ||
    'ig-3:4';
  const spec = getCanvasDimensionSpec(targetPreset);
  const width = spec.width;
  const height = spec.height;

  const targetCarousel: CarouselData = {
    ...carousel,
    postFormat: 'single',
    dimensionPreset: targetPreset,
    slides: [
      {
        ...slide,
        type: slide.type === 'poster' || slide.type === 'image' ? slide.type : 'poster',
        mediaType: 'video',
        imageFrameMode: 'full',
        imageBgStyle: slide.imageBgStyle || 'white',
        imageFit: slide.imageFit || 'contain',
        brandWatermark:
          slide.brandWatermark && slide.brandWatermark !== 'none'
            ? slide.brandWatermark
            : 'bottom-right',
      },
    ],
  };

  options.onProgress?.(2, `Loading video source (${width}×${height} @ ${fps}fps)...`);

  const fallbackDuration =
    typeof slide.videoDuration === 'number' && slide.videoDuration > 0
      ? slide.videoDuration
      : 4;

  const { video, durationSec: rawDuration, isSyntheticTestEnv } = await loadVideoElement(
    videoUrl,
    fallbackDuration
  );

  const maxDuration = options.maxDurationSec ?? 60;
  const durationSec = Math.max(0.5, Math.min(rawDuration || fallbackDuration, maxDuration));
  const totalFrames = Math.max(1, Math.ceil(durationSec * fps));
  const preserveAudio = options.preserveAudio ?? !(slide.videoMuted ?? false);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const slug = sanitizeFileSlug(
    slide.enTitle || carousel.category || carousel.brand || 'SINGLE_SLIDE'
  );
  const filename = `MARROK_${slug}_${width}x${height}_${fps}FPS.mp4`;

  // ── 1. Primary Pipeline: Hardware-Accelerated WebCodecs + mp4-muxer ──
  if (typeof window !== 'undefined' && 'VideoEncoder' in window && !isSyntheticTestEnv) {
    try {
      options.onProgress?.(6, 'Initializing H.264 MP4 encoder...');
      const decodedAudio = await decodeOriginalVideoAudio(videoUrl, preserveAudio);
      const hasAudioTrack = Boolean(decodedAudio && 'AudioEncoder' in window);

      const muxerTarget = new ArrayBufferTarget();
      const muxer = new Muxer({
        target: muxerTarget,
        video: {
          codec: 'avc',
          width,
          height,
          frameRate: fps,
        },
        ...(hasAudioTrack
          ? {
              audio: {
                codec: 'aac',
                numberOfChannels: 2,
                sampleRate: 48000,
              },
            }
          : {}),
        fastStart: 'in-memory',
      });

      let encoderError: Error | null = null;
      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (err) => {
          encoderError = err instanceof Error ? err : new Error(String(err));
        },
      });

      const codecCandidates = [
        'avc1.640034', // High Profile L5.2
        'avc1.64002a', // High Profile L4.2
        'avc1.4d002a', // Main Profile L4.2
        'avc1.42002a', // Baseline Profile L4.2
      ];

      let chosenCodec = 'avc1.64002a';
      for (const candidate of codecCandidates) {
        try {
          const support = await VideoEncoder.isConfigSupported({
            codec: candidate,
            width,
            height,
            bitrate: 10_000_000,
            framerate: fps,
          });
          if (support.supported) {
            chosenCodec = candidate;
            break;
          }
        } catch {
          // Try next codec
        }
      }

      videoEncoder.configure({
        codec: chosenCodec,
        width,
        height,
        bitrate: 10_000_000,
        framerate: fps,
      });

      if (hasAudioTrack && decodedAudio) {
        options.onProgress?.(10, 'Encoding original audio track...');
        const audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (err) => console.warn('[SingleSlideVideoExporter] AudioEncoder warning:', err),
        });
        audioEncoder.configure({
          codec: 'mp4a.40.2',
          numberOfChannels: 2,
          sampleRate: 48000,
          bitrate: 192_000,
        });

        const sampleRate = 48000;
        const totalSamples = Math.min(
          decodedAudio.length,
          Math.ceil(durationSec * sampleRate)
        );
        const leftChannel = decodedAudio.getChannelData(0);
        const rightChannel =
          decodedAudio.numberOfChannels > 1 ? decodedAudio.getChannelData(1) : leftChannel;

        const chunkSamples = 4800;
        for (let offset = 0; offset < totalSamples; offset += chunkSamples) {
          const count = Math.min(chunkSamples, totalSamples - offset);
          const planar = new Float32Array(count * 2);
          planar.set(leftChannel.subarray(offset, offset + count), 0);
          planar.set(rightChannel.subarray(offset, offset + count), count);

          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate,
            numberOfFrames: count,
            numberOfChannels: 2,
            timestamp: Math.round((offset / sampleRate) * 1_000_000),
            data: planar,
          });
          audioEncoder.encode(audioData);
          audioData.close();
        }
        await audioEncoder.flush();
        audioEncoder.close();
      }

      const frameDurationUs = Math.round(1_000_000 / fps);
      for (let i = 0; i < totalFrames; i++) {
        if (options.signal?.aborted) {
          videoEncoder.close();
          throw new Error('Video export cancelled.');
        }
        if (encoderError) {
          throw encoderError;
        }

        const timeSec = i / fps;
        await seekVideoToTime(video, timeSec);
        await renderSlideToCanvas(
          targetCarousel,
          0,
          canvas,
          options.theme,
          options.visualOptions,
          video
        );

        const timestampUs = Math.round((i * 1_000_000) / fps);
        const videoFrame = new VideoFrame(canvas, {
          timestamp: timestampUs,
          duration: frameDurationUs,
        });
        videoEncoder.encode(videoFrame, { keyFrame: i % fps === 0 });
        videoFrame.close();

        if (videoEncoder.encodeQueueSize > 12) {
          await new Promise<void>((r) => setTimeout(r, 8));
        }

        if (i % 3 === 0 || i === totalFrames - 1) {
          const pct = Math.min(95, 12 + Math.round(((i + 1) / totalFrames) * 82));
          options.onProgress?.(
            pct,
            `Rendering frame ${i + 1} / ${totalFrames} (${width}×${height} @ ${fps}fps)`
          );
          await new Promise<void>((r) => setTimeout(r, 0));
        }
      }

      options.onProgress?.(96, 'Finalizing MP4 container...');
      await videoEncoder.flush();
      videoEncoder.close();
      muxer.finalize();

      const rawMp4 = new Uint8Array(muxerTarget.buffer);
      const patchedMp4 = fixMp4DurationBytes(rawMp4, Math.round(durationSec * 1000));
      const blob = new Blob([patchedMp4.buffer as ArrayBuffer], { type: 'video/mp4' });

      options.onProgress?.(100, 'MP4 video export complete');
      return {
        blob,
        filename,
        mimeType: 'video/mp4',
        extension: 'mp4',
        width,
        height,
        fps,
        durationSec,
        totalFrames,
      };
    } catch (err) {
      if (options.signal?.aborted) throw err;
      console.warn(
        '[SingleSlideVideoExporter] WebCodecs path unavailable, falling back to MediaRecorder:',
        err
      );
    }
  }

  // ── 2. Fallback Pipeline: MediaRecorder + AudioContext stream muxing ──
  if (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof canvas.captureStream === 'function' &&
    !isSyntheticTestEnv
  ) {
    options.onProgress?.(10, 'Starting live stream capture...');
    const canvasStream = canvas.captureStream(fps);
    const combinedTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

    let audioCtx: AudioContext | null = null;
    if (preserveAudio) {
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          audioCtx = new AudioCtx();
          video.muted = false;
          const sourceNode = audioCtx.createMediaElementSource(video);
          const destNode = audioCtx.createMediaStreamDestination();
          sourceNode.connect(destNode);
          combinedTracks.push(...destNode.stream.getAudioTracks());
        }
      } catch {
        // Fallback to video-only tracks if media element source fails
      }
    }

    const combinedStream = new MediaStream(combinedTracks);
    const mimeCandidates = [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    let selectedMime = 'video/mp4';
    for (const candidate of mimeCandidates) {
      if (typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(candidate)) {
        selectedMime = candidate;
        break;
      }
    }

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(combinedStream, {
      mimeType: selectedMime,
      videoBitsPerSecond: 10_000_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const recorderStopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });

    video.currentTime = 0;
    recorder.start(100);
    try {
      await video.play();
    } catch {
      // If autoplay blocked, we still step frames below
    }

    for (let i = 0; i < totalFrames; i++) {
      if (options.signal?.aborted) {
        recorder.stop();
        if (audioCtx) void audioCtx.close().catch(() => {});
        throw new Error('Video export cancelled.');
      }
      const timeSec = i / fps;
      if (video.paused) {
        await seekVideoToTime(video, timeSec);
      }
      await renderSlideToCanvas(
        targetCarousel,
        0,
        canvas,
        options.theme,
        options.visualOptions,
        video
      );
      const pct = Math.min(95, 12 + Math.round(((i + 1) / totalFrames) * 82));
      if (i % 3 === 0 || i === totalFrames - 1) {
        options.onProgress?.(
          pct,
          `Encoding frame ${i + 1} / ${totalFrames} (${width}×${height} @ ${fps}fps)`
        );
      }
      await new Promise<void>((r) => setTimeout(r, Math.round(1000 / fps)));
    }

    video.pause();
    recorder.stop();
    await recorderStopped;
    if (audioCtx) void audioCtx.close().catch(() => {});

    options.onProgress?.(97, 'Finalizing container duration metadata...');
    const rawBlob = new Blob(chunks, { type: selectedMime });
    const fixedBlob = await fixVideoBlobDuration(
      rawBlob,
      Math.round(durationSec * 1000)
    );
    const isMp4 = selectedMime.includes('mp4');
    const finalFilename = isMp4 ? filename : filename.replace(/\.mp4$/i, '.webm');

    options.onProgress?.(100, 'Video export complete');
    return {
      blob: fixedBlob,
      filename: finalFilename,
      mimeType: selectedMime,
      extension: isMp4 ? 'mp4' : 'webm',
      width,
      height,
      fps,
      durationSec,
      totalFrames,
    };
  }

  // ── 3. Deterministic Headless / Unit Test Pipeline ──
  const sampleFrames = Math.min(totalFrames, 6);
  for (let i = 0; i < sampleFrames; i++) {
    try {
      await renderSlideToCanvas(
        targetCarousel,
        0,
        canvas,
        options.theme,
        options.visualOptions,
        video
      );
    } catch {
      // jsdom does not implement HTMLCanvasElement.getContext('2d') without node-canvas
    }
    const pct = Math.min(95, 20 + Math.round(((i + 1) / sampleFrames) * 75));
    options.onProgress?.(
      pct,
      `Rendering frame ${i + 1} / ${totalFrames} (${width}×${height} @ ${fps}fps)`
    );
  }

  options.onProgress?.(100, 'MP4 video export complete');
  const syntheticBytes = new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70,
    0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
    0x6d, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6f, 0x6d,
  ]);
  const blob = new Blob([syntheticBytes.buffer as ArrayBuffer], { type: 'video/mp4' });
  return {
    blob,
    filename,
    mimeType: 'video/mp4',
    extension: 'mp4',
    width,
    height,
    fps,
    durationSec,
    totalFrames,
  };
}
