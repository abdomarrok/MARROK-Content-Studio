import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  exportSingleSlideVideoMp4,
  seekVideoToTime,
  VideoSeekTimeoutError,
  SingleSlideLayerCache,
} from './singleSlideVideoExporter.ts';
import { BASE_PALETTES } from '../theme/palettes.ts';
import type { CarouselData } from '../../types.ts';

function makeMp4Box(type: string, payload: Uint8Array): Uint8Array {
  const size = 8 + payload.length;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, size, false);
  for (let i = 0; i < 4; i++) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(payload, 8);
  return out;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function buildTruncatedMp4Sample(initialDurationSec = 3.5): Uint8Array {
  const ftyp = makeMp4Box('ftyp', new Uint8Array([0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0]));

  const mvhdPayload = new Uint8Array(100);
  const mvhdView = new DataView(mvhdPayload.buffer);
  mvhdPayload[0] = 0;
  mvhdView.setUint32(12, 1000, false);
  mvhdView.setUint32(16, Math.round(initialDurationSec * 1000), false);
  const mvhd = makeMp4Box('mvhd', mvhdPayload);

  const tkhdPayload = new Uint8Array(84);
  const tkhdView = new DataView(tkhdPayload.buffer);
  tkhdPayload[0] = 0;
  tkhdView.setUint32(20, Math.round(initialDurationSec * 1000), false);
  const tkhd = makeMp4Box('tkhd', tkhdPayload);

  const mdhdPayload = new Uint8Array(24);
  const mdhdView = new DataView(mdhdPayload.buffer);
  mdhdPayload[0] = 0;
  mdhdView.setUint32(12, 30000, false);
  mdhdView.setUint32(16, Math.round(initialDurationSec * 30000), false);
  const mdhd = makeMp4Box('mdhd', mdhdPayload);

  const mehdPayload = new Uint8Array(8);
  const mehdView = new DataView(mehdPayload.buffer);
  mehdPayload[0] = 0;
  mehdView.setUint32(4, Math.round(initialDurationSec * 1000), false);
  const mehd = makeMp4Box('mehd', mehdPayload);
  const mvex = makeMp4Box('mvex', mehd);

  const mdia = makeMp4Box('mdia', mdhd);
  const trak = makeMp4Box('trak', concatBytes(tkhd, mdia));
  const moov = makeMp4Box('moov', concatBytes(mvhd, trak, mvex));

  return concatBytes(ftyp, moov);
}

interface ParsedMp4Durations {
  formatDurationSec: number;
  trackDurationSec: number;
  streamDurationsSec: number[];
  mehdDurationSec: number | null;
}

function readUint64(view: DataView, offset: number): number {
  const hi = view.getUint32(offset, false);
  const lo = view.getUint32(offset + 4, false);
  return hi * 0x100000000 + lo;
}

function parseMp4Durations(bytes: Uint8Array): ParsedMp4Durations {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let movieTimescale = 1000;
  let formatDurationSec = -1;
  let trackDurationSec = -1;
  const streamDurationsSec: number[] = [];
  let mehdDurationSec: number | null = null;

  const containerBoxes = new Set(['moov', 'trak', 'mdia', 'mvex']);

  const walk = (start: number, end: number) => {
    let pos = start;
    while (pos + 8 <= end) {
      let size = view.getUint32(pos, false);
      const type = String.fromCharCode(
        bytes[pos + 4],
        bytes[pos + 5],
        bytes[pos + 6],
        bytes[pos + 7]
      );
      if (size === 0) size = end - pos;
      if (size < 8 || pos + size > end) break;

      const payload = pos + 8;
      if (containerBoxes.has(type)) {
        walk(payload, pos + size);
      } else if (type === 'mvhd') {
        const version = bytes[payload];
        if (version === 1) {
          movieTimescale = view.getUint32(payload + 20, false);
          formatDurationSec = readUint64(view, payload + 24) / movieTimescale;
        } else {
          movieTimescale = view.getUint32(payload + 12, false);
          formatDurationSec = view.getUint32(payload + 16, false) / movieTimescale;
        }
      } else if (type === 'tkhd') {
        const version = bytes[payload];
        if (version === 1) {
          trackDurationSec = readUint64(view, payload + 28) / movieTimescale;
        } else {
          trackDurationSec = view.getUint32(payload + 20, false) / movieTimescale;
        }
      } else if (type === 'mdhd') {
        const version = bytes[payload];
        if (version === 1) {
          const ts = view.getUint32(payload + 20, false);
          streamDurationsSec.push(readUint64(view, payload + 24) / ts);
        } else {
          const ts = view.getUint32(payload + 12, false);
          streamDurationsSec.push(view.getUint32(payload + 16, false) / ts);
        }
      } else if (type === 'mehd') {
        const version = bytes[payload];
        if (version === 1) {
          mehdDurationSec = readUint64(view, payload + 4) / movieTimescale;
        } else {
          mehdDurationSec = view.getUint32(payload + 4, false) / movieTimescale;
        }
      }

      pos += size;
    }
  };

  walk(0, bytes.length);
  return { formatDurationSec, trackDurationSec, streamDurationsSec, mehdDurationSec };
}

function createNoopCanvasContext2D(): CanvasRenderingContext2D {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const target: Record<string, unknown> = {
    measureText: (text: string) => ({ width: (text || '').length * 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  };
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop as string];
      return noop;
    },
    set(obj, prop, value) {
      obj[prop as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error || new Error('Failed to read Blob'));
    reader.readAsArrayBuffer(blob);
  });
}

function make10sVideoCarousel(): CarouselData {
  return {
    theme: 'engineering',
    category: 'Duration Regression',
    postFormat: 'single',
    dimensionPreset: 'ig-3:4',
    caption: 'Test caption',
    slides: [
      {
        type: 'image',
        enTitle: 'DURATION REGRESSION CHECK',
        arTitle: 'اختبار مدة الفيديو',
        enBody: 'Verifying 10s export writes 10s container metadata.',
        arBody: 'التحقق من كتابة مدة ١٠ ثوانٍ بدقة.',
        mediaType: 'video',
        videoUrl: 'blob:https://marrok.local/test-10s-video',
        videoDuration: 10,
      },
    ],
  };
}

describe('singleSlideVideoExporter — duration regression (seconds vs milliseconds)', () => {
  const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(
    window.navigator,
    'userAgent'
  );
  const originalVideoEncoder = (globalThis as Record<string, unknown>).VideoEncoder;
  const originalVideoFrame = (globalThis as Record<string, unknown>).VideoFrame;
  const originalEncodedVideoChunk = (globalThis as Record<string, unknown>).EncodedVideoChunk;
  const originalAudioEncoder = (globalThis as Record<string, unknown>).AudioEncoder;
  const originalAudioData = (globalThis as Record<string, unknown>).AudioData;
  const originalEncodedAudioChunk = (globalThis as Record<string, unknown>).EncodedAudioChunk;
  const originalAudioContext = (globalThis as Record<string, unknown>).AudioContext;
  const originalMediaRecorder = (globalThis as Record<string, unknown>).MediaRecorder;
  const originalMediaStream = (globalThis as Record<string, unknown>).MediaStream;
  const originalFetch = globalThis.fetch;
  const originalCaptureStreamDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    'captureStream'
  );
  const originalSetTimeout = globalThis.setTimeout;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.setTimeout = originalSetTimeout;
    globalThis.fetch = originalFetch;

    if (originalUserAgentDescriptor) {
      Object.defineProperty(window.navigator, 'userAgent', originalUserAgentDescriptor);
    }

    if (originalCaptureStreamDescriptor) {
      Object.defineProperty(
        HTMLCanvasElement.prototype,
        'captureStream',
        originalCaptureStreamDescriptor
      );
    } else {
      delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).captureStream;
    }

    const restoreGlobal = (key: string, value: unknown) => {
      if (value === undefined) {
        delete (globalThis as Record<string, unknown>)[key];
      } else {
        (globalThis as Record<string, unknown>)[key] = value;
      }
    };
    restoreGlobal('VideoEncoder', originalVideoEncoder);
    restoreGlobal('VideoFrame', originalVideoFrame);
    restoreGlobal('EncodedVideoChunk', originalEncodedVideoChunk);
    restoreGlobal('AudioEncoder', originalAudioEncoder);
    restoreGlobal('AudioData', originalAudioData);
    restoreGlobal('EncodedAudioChunk', originalEncodedAudioChunk);
    restoreGlobal('AudioContext', originalAudioContext);
    restoreGlobal('MediaRecorder', originalMediaRecorder);
    restoreGlobal('MediaStream', originalMediaStream);
  });

  function stubBrowserVideoAndCanvas(durationSec: number) {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    });

    const noopCtx = createNoopCanvasContext2D();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => noopCtx);

    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName.toLowerCase() === 'video') {
        let currentTime = 0;
        let paused = true;
        Object.defineProperty(el, 'duration', { configurable: true, get: () => durationSec });
        Object.defineProperty(el, 'videoWidth', { configurable: true, get: () => 1280 });
        Object.defineProperty(el, 'videoHeight', { configurable: true, get: () => 720 });
        Object.defineProperty(el, 'readyState', { configurable: true, get: () => 4 });
        Object.defineProperty(el, 'paused', { configurable: true, get: () => paused });
        Object.defineProperty(el, 'currentTime', {
          configurable: true,
          get: () => currentTime,
          set: (val: number) => {
            currentTime = val;
            queueMicrotask(() => el.dispatchEvent(new Event('seeked')));
          },
        });
        (el as HTMLVideoElement).load = () => {
          queueMicrotask(() => el.dispatchEvent(new Event('loadedmetadata')));
        };
        (el as HTMLVideoElement).play = async () => {
          paused = false;
        };
        (el as HTMLVideoElement).pause = () => {
          paused = true;
        };
      }
      return el;
    }) as typeof document.createElement);

    // Accelerate exporter pacing timers (8ms / 33ms) so 300-frame tests finish instantaneously
    globalThis.setTimeout = ((fn: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (typeof fn === 'function' && (delay ?? 0) <= 100) {
        queueMicrotask(() => fn(...args));
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
      return originalSetTimeout(fn, delay, ...args);
    }) as typeof setTimeout;
  }

  function installFakeWebCodecsVideo() {
    const avcDescription = new Uint8Array([
      0x01, 0x64, 0x00, 0x2a, 0xff, 0xe1, 0x00, 0x04, 0x67, 0x64, 0x00, 0x2a,
      0x01, 0x00, 0x02, 0x68, 0xee,
    ]);
    let configureCalls = 0;

    class FakeVideoFrame {
      timestamp: number;
      duration: number;
      constructor(_source: unknown, init: { timestamp: number; duration?: number }) {
        this.timestamp = init.timestamp;
        this.duration = init.duration ?? 33_333;
      }
      close() {}
    }

    class FakeEncodedVideoChunk {
      type: 'key' | 'delta';
      timestamp: number;
      duration: number;
      byteLength: number;
      private data: Uint8Array;

      constructor(init: {
        type: 'key' | 'delta';
        timestamp: number;
        duration: number;
        data: Uint8Array;
      }) {
        this.type = init.type;
        this.timestamp = init.timestamp;
        this.duration = init.duration;
        this.data = init.data;
        this.byteLength = init.data.byteLength;
      }

      copyTo(dest: Uint8Array | ArrayBuffer | ArrayBufferView) {
        if (dest instanceof Uint8Array) {
          dest.set(this.data);
        } else if (ArrayBuffer.isView(dest)) {
          new Uint8Array(dest.buffer, dest.byteOffset, dest.byteLength).set(this.data);
        } else {
          new Uint8Array(dest).set(this.data);
        }
      }
    }

    class FakeVideoEncoder {
      static async isConfigSupported() {
        return { supported: true };
      }
      state = 'unconfigured';
      encodeQueueSize = 0;
      private onOutput: (chunk: unknown, meta?: unknown) => void;
      private emittedMeta = false;

      constructor(init: { output: (chunk: unknown, meta?: unknown) => void }) {
        this.onOutput = init.output;
      }
      configure() {
        configureCalls++;
        this.state = 'configured';
      }
      encode(frame: FakeVideoFrame, opts?: { keyFrame?: boolean }) {
        const data = new Uint8Array([0x00, 0x00, 0x00, 0x02, 0x65, 0x88]);
        const chunk = new FakeEncodedVideoChunk({
          type: opts?.keyFrame ? 'key' : 'delta',
          timestamp: frame.timestamp,
          duration: frame.duration,
          data,
        });
        const meta = !this.emittedMeta
          ? { decoderConfig: { codec: 'avc1.640034', description: avcDescription } }
          : undefined;
        this.emittedMeta = true;
        this.onOutput(chunk, meta);
      }
      async flush() {}
      close() {
        this.state = 'closed';
      }
    }

    (globalThis as Record<string, unknown>).VideoFrame = FakeVideoFrame;
    (globalThis as Record<string, unknown>).EncodedVideoChunk = FakeEncodedVideoChunk;
    (globalThis as Record<string, unknown>).VideoEncoder = FakeVideoEncoder;

    return {
      getConfigureCalls: () => configureCalls,
    };
  }

  function installFakeSourceAudio(durationSec = 10, sampleRate = 48000, channels = 2) {
    const length = Math.ceil(durationSec * sampleRate);
    const channelData = [new Float32Array(length), new Float32Array(length)];
    const fakeAudioBuffer = {
      sampleRate,
      length,
      duration: durationSec,
      numberOfChannels: channels,
      getChannelData: (idx: number) => channelData[idx] || channelData[0],
    };

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(64),
    })) as unknown as typeof fetch;

    const fakeAudioTrack = { kind: 'audio', stop: () => {} };
    class FakeAudioContext {
      async decodeAudioData() {
        return fakeAudioBuffer;
      }
      createMediaElementSource() {
        return { connect: () => {} };
      }
      createMediaStreamDestination() {
        return {
          stream: {
            getAudioTracks: () => [fakeAudioTrack],
          },
        };
      }
      async close() {}
    }

    (globalThis as Record<string, unknown>).AudioContext = FakeAudioContext;
    return { fakeAudioTrack };
  }

  function installFakeMediaRecorder(sampleDurationSec = 3.5) {
    let startCalls = 0;
    let capturedStreams: Array<{ tracks: unknown[] }> = [];

    const fakeVideoTrack = { kind: 'video', stop: () => {} };
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      configurable: true,
      value: () => ({
        getVideoTracks: () => [fakeVideoTrack],
      }),
    });

    class FakeMediaStream {
      tracks: unknown[];
      constructor(tracks: unknown[] = []) {
        this.tracks = tracks;
        capturedStreams.push(this);
      }
    }

    const sampleBytes = buildTruncatedMp4Sample(sampleDurationSec);
    class FakeMediaRecorder {
      static isTypeSupported(mime: string) {
        return mime === 'video/mp4';
      }
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;

      start() {
        startCalls++;
      }
      stop() {
        const buf = new ArrayBuffer(sampleBytes.byteLength);
        new Uint8Array(buf).set(sampleBytes);
        this.ondataavailable?.({ data: new Blob([buf], { type: 'video/mp4' }) });
        this.onstop?.();
      }
    }

    (globalThis as Record<string, unknown>).MediaStream = FakeMediaStream;
    (globalThis as Record<string, unknown>).MediaRecorder = FakeMediaRecorder;

    return {
      getStartCalls: () => startCalls,
      getCapturedStreams: () => capturedStreams,
    };
  }

  function installFakeAudioEncoder(isSupported: (config: AudioEncoderConfig) => boolean) {
    const probedConfigs: AudioEncoderConfig[] = [];
    const configuredConfigs: AudioEncoderConfig[] = [];

    class FakeAudioData {
      timestamp: number;
      numberOfFrames: number;
      sampleRate: number;
      constructor(init: { timestamp: number; numberOfFrames: number; sampleRate: number }) {
        this.timestamp = init.timestamp;
        this.numberOfFrames = init.numberOfFrames;
        this.sampleRate = init.sampleRate;
      }
      close() {}
    }

    class FakeEncodedAudioChunk {
      type: 'key' | 'delta';
      timestamp: number;
      duration: number;
      byteLength: number;
      private data: Uint8Array;

      constructor(init: {
        type: 'key' | 'delta';
        timestamp: number;
        duration: number;
        data: Uint8Array;
      }) {
        this.type = init.type;
        this.timestamp = init.timestamp;
        this.duration = init.duration;
        this.data = init.data;
        this.byteLength = init.data.byteLength;
      }

      copyTo(dest: Uint8Array | ArrayBuffer | ArrayBufferView) {
        if (dest instanceof Uint8Array) {
          dest.set(this.data);
        } else if (ArrayBuffer.isView(dest)) {
          new Uint8Array(dest.buffer, dest.byteOffset, dest.byteLength).set(this.data);
        } else {
          new Uint8Array(dest).set(this.data);
        }
      }
    }

    class FakeAudioEncoder {
      static async isConfigSupported(config: AudioEncoderConfig) {
        probedConfigs.push({ ...config });
        return { supported: isSupported(config) };
      }
      state = 'unconfigured';
      private onOutput: (chunk: unknown, meta?: unknown) => void;
      private activeCodec = '';
      private emittedMeta = false;

      constructor(init: { output: (chunk: unknown, meta?: unknown) => void }) {
        this.onOutput = init.output;
      }
      configure(config: AudioEncoderConfig) {
        configuredConfigs.push({ ...config });
        this.activeCodec = config.codec;
        this.state = 'configured';
      }
      encode(audioData: FakeAudioData) {
        const data = new Uint8Array([0x21, 0x10, 0x04, 0x60]);
        const durationUs = Math.round((audioData.numberOfFrames / audioData.sampleRate) * 1_000_000);
        const chunk = new FakeEncodedAudioChunk({
          type: 'key',
          timestamp: audioData.timestamp,
          duration: durationUs,
          data,
        });
        const meta = !this.emittedMeta
          ? {
              decoderConfig: {
                codec: this.activeCodec,
                sampleRate: audioData.sampleRate,
                numberOfChannels: 2,
                description:
                  this.activeCodec === 'opus'
                    ? new Uint8Array([
                        0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64,
                        0x01, 0x02, 0x38, 0x01, 0x80, 0xbb, 0x00, 0x00,
                        0x00, 0x00, 0x00,
                      ])
                    : new Uint8Array([0x11, 0x90]),
              },
            }
          : undefined;
        this.emittedMeta = true;
        this.onOutput(chunk, meta);
      }
      async flush() {}
      close() {
        this.state = 'closed';
      }
    }

    (globalThis as Record<string, unknown>).AudioData = FakeAudioData;
    (globalThis as Record<string, unknown>).EncodedAudioChunk = FakeEncodedAudioChunk;
    (globalThis as Record<string, unknown>).AudioEncoder = FakeAudioEncoder;

    return { probedConfigs, configuredConfigs };
  }

  function containsFourCC(bytes: Uint8Array, fourcc: string): boolean {
    const c0 = fourcc.charCodeAt(0);
    const c1 = fourcc.charCodeAt(1);
    const c2 = fourcc.charCodeAt(2);
    const c3 = fourcc.charCodeAt(3);
    for (let i = 0; i <= bytes.length - 4; i++) {
      if (bytes[i] === c0 && bytes[i + 1] === c1 && bytes[i + 2] === c2 && bytes[i + 3] === c3) {
        return true;
      }
    }
    return false;
  }

  it('writes 10s (not 10000s) format and stream duration on the WebCodecs MP4 path', async () => {
    stubBrowserVideoAndCanvas(10);
    installFakeWebCodecsVideo();
    delete (globalThis as Record<string, unknown>).AudioEncoder;

    const result = await exportSingleSlideVideoMp4(make10sVideoCarousel(), 0, {
      fps: 30,
      dimensionPreset: 'ig-3:4',
      preserveAudio: false,
    });

    expect(result.durationSec).toBe(10);
    expect(result.totalFrames).toBe(300);
    expect(result.extension).toBe('mp4');

    const bytes = await readBlobBytes(result.blob);
    const parsed = parseMp4Durations(bytes);

    expect(parsed.formatDurationSec).toBeCloseTo(10, 2);
    expect(parsed.trackDurationSec).toBeCloseTo(10, 2);
    expect(parsed.streamDurationsSec.length).toBeGreaterThanOrEqual(1);
    for (const streamSec of parsed.streamDurationsSec) {
      expect(streamSec).toBeCloseTo(10, 2);
      expect(streamSec).not.toBeCloseTo(10_000, 0);
    }
    expect(parsed.formatDurationSec).not.toBeCloseTo(10_000, 0);
  });

  it('writes 10s (not 10000s) format and stream duration on the MediaRecorder fallback path', async () => {
    stubBrowserVideoAndCanvas(10);
    delete (globalThis as Record<string, unknown>).VideoEncoder;
    delete (globalThis as Record<string, unknown>).VideoFrame;
    installFakeMediaRecorder(3.5);

    const result = await exportSingleSlideVideoMp4(make10sVideoCarousel(), 0, {
      fps: 30,
      dimensionPreset: 'ig-3:4',
      preserveAudio: false,
    });

    expect(result.durationSec).toBe(10);
    expect(result.extension).toBe('mp4');

    const bytes = await readBlobBytes(result.blob);
    const parsed = parseMp4Durations(bytes);

    expect(parsed.formatDurationSec).toBe(10);
    expect(parsed.trackDurationSec).toBe(10);
    expect(parsed.streamDurationsSec).toEqual([10]);
    expect(parsed.mehdDurationSec).toBe(10);
  });

  it('probes AudioEncoder.isConfigSupported and uses AAC (mp4a.40.2 @ 192k) on WebCodecs when supported', async () => {
    stubBrowserVideoAndCanvas(2);
    installFakeWebCodecsVideo();
    installFakeSourceAudio(2, 48000, 2);
    const mr = installFakeMediaRecorder(1);
    const audio = installFakeAudioEncoder((cfg) => cfg.codec === 'mp4a.40.2');

    const result = await exportSingleSlideVideoMp4(make10sVideoCarousel(), 0, {
      fps: 30,
      dimensionPreset: 'ig-3:4',
      preserveAudio: true,
    });

    expect(mr.getStartCalls()).toBe(0);
    expect(audio.probedConfigs).toHaveLength(1);
    expect(audio.probedConfigs[0]).toMatchObject({
      codec: 'mp4a.40.2',
      sampleRate: 48000,
      numberOfChannels: 2,
      bitrate: 192_000,
    });
    expect(audio.configuredConfigs).toHaveLength(1);
    expect(audio.configuredConfigs[0]).toMatchObject({
      codec: 'mp4a.40.2',
      bitrate: 192_000,
    });
    expect(result.warning).toBeUndefined();

    const bytes = await readBlobBytes(result.blob);
    expect(containsFourCC(bytes, 'mp4a')).toBe(true);
    const parsed = parseMp4Durations(bytes);
    expect(parsed.formatDurationSec).toBeCloseTo(2, 2);
    expect(parsed.streamDurationsSec).toHaveLength(2);
    for (const sec of parsed.streamDurationsSec) {
      expect(sec).toBeCloseTo(2, 2);
    }
  });

  it('falls back to Opus (192k) inside WebCodecs MP4 when AAC is unsupported, without falling back to MediaRecorder', async () => {
    stubBrowserVideoAndCanvas(2);
    installFakeWebCodecsVideo();
    installFakeSourceAudio(2, 48000, 2);
    const mr = installFakeMediaRecorder(1);
    const audio = installFakeAudioEncoder((cfg) => cfg.codec === 'opus');

    const result = await exportSingleSlideVideoMp4(make10sVideoCarousel(), 0, {
      fps: 30,
      dimensionPreset: 'ig-3:4',
      preserveAudio: true,
    });

    // Must NOT fall back to MediaRecorder just because AAC is unsupported
    expect(mr.getStartCalls()).toBe(0);
    expect(audio.probedConfigs.map((c) => `${c.codec}@${c.bitrate}`)).toEqual([
      'mp4a.40.2@192000',
      'mp4a.40.2@128000',
      'opus@192000',
    ]);
    expect(audio.configuredConfigs).toHaveLength(1);
    expect(audio.configuredConfigs[0]).toMatchObject({
      codec: 'opus',
      sampleRate: 48000,
      numberOfChannels: 2,
      bitrate: 192_000,
    });
    expect(result.warning).toBeUndefined();

    const bytes = await readBlobBytes(result.blob);
    expect(containsFourCC(bytes, 'Opus')).toBe(true);
    const parsed = parseMp4Durations(bytes);
    expect(parsed.formatDurationSec).toBeCloseTo(2, 2);
    expect(parsed.streamDurationsSec).toHaveLength(2);
    for (const sec of parsed.streamDurationsSec) {
      expect(sec).toBeCloseTo(2, 2);
    }
  });

  it('uses MediaRecorder to preserve audio when neither AAC nor Opus is supported by AudioEncoder', async () => {
    stubBrowserVideoAndCanvas(2);
    const ve = installFakeWebCodecsVideo();
    installFakeSourceAudio(2, 48000, 2);
    const mr = installFakeMediaRecorder(1);
    const audio = installFakeAudioEncoder(() => false);

    const result = await exportSingleSlideVideoMp4(make10sVideoCarousel(), 0, {
      fps: 30,
      dimensionPreset: 'ig-3:4',
      preserveAudio: true,
    });

    expect(audio.probedConfigs.map((c) => `${c.codec}@${c.bitrate}`)).toEqual([
      'mp4a.40.2@192000',
      'mp4a.40.2@128000',
      'opus@192000',
    ]);
    expect(audio.configuredConfigs).toHaveLength(0);
    expect(ve.getConfigureCalls()).toBe(0);
    expect(mr.getStartCalls()).toBe(1);
    expect(mr.getCapturedStreams()[0].tracks).toHaveLength(2);
    expect(result.warning).toBeUndefined();
  });

  it('returns a visible warning when neither AAC nor Opus is supported and MediaRecorder is unavailable', async () => {
    stubBrowserVideoAndCanvas(2);
    const ve = installFakeWebCodecsVideo();
    installFakeSourceAudio(2, 48000, 2);
    delete (globalThis as Record<string, unknown>).MediaRecorder;
    const audio = installFakeAudioEncoder(() => false);

    const result = await exportSingleSlideVideoMp4(make10sVideoCarousel(), 0, {
      fps: 30,
      dimensionPreset: 'ig-3:4',
      preserveAudio: true,
    });

    expect(audio.probedConfigs).toHaveLength(3);
    expect(ve.getConfigureCalls()).toBe(1);
    expect(result.warning).toBeDefined();
    expect(result.warning).toMatch(/original audio was not included/i);
  });

  it('prefers MediaRecorder to keep audio when AudioEncoder is undefined (Safari < 26) and an audio track is present', async () => {
    stubBrowserVideoAndCanvas(2);
    const ve = installFakeWebCodecsVideo();
    installFakeSourceAudio(2, 48000, 2);
    const mr = installFakeMediaRecorder(1);
    delete (globalThis as Record<string, unknown>).AudioEncoder;
    delete (globalThis as Record<string, unknown>).AudioData;

    const result = await exportSingleSlideVideoMp4(make10sVideoCarousel(), 0, {
      fps: 30,
      dimensionPreset: 'ig-3:4',
      preserveAudio: true,
    });

    expect(ve.getConfigureCalls()).toBe(0);
    expect(mr.getStartCalls()).toBe(1);
    expect(mr.getCapturedStreams()[0].tracks).toHaveLength(2);
    expect(result.warning).toBeUndefined();
  });

  it('returns a visible warning when AudioEncoder is undefined, audio is present, and MediaRecorder is unavailable', async () => {
    stubBrowserVideoAndCanvas(2);
    const ve = installFakeWebCodecsVideo();
    installFakeSourceAudio(2, 48000, 2);
    delete (globalThis as Record<string, unknown>).AudioEncoder;
    delete (globalThis as Record<string, unknown>).AudioData;
    delete (globalThis as Record<string, unknown>).MediaRecorder;

    const result = await exportSingleSlideVideoMp4(make10sVideoCarousel(), 0, {
      fps: 30,
      dimensionPreset: 'ig-3:4',
      preserveAudio: true,
    });

    expect(ve.getConfigureCalls()).toBe(1);
    expect(result.warning).toBeDefined();
    expect(result.warning).toMatch(/original audio was not included/i);
  });

  it('propagates VideoSeekTimeoutError from exportSingleSlideVideoMp4 without falling back or drawing a stale frame', async () => {
    vi.useFakeTimers();
    try {
      Object.defineProperty(window.navigator, 'userAgent', {
        configurable: true,
        value:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      });

      const noopCtx = createNoopCanvasContext2D();
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => noopCtx);

      const origCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
        const el = origCreateElement(tagName);
        if (tagName.toLowerCase() === 'video') {
          let currentTime = 0;
          Object.defineProperty(el, 'duration', { configurable: true, get: () => 2 });
          Object.defineProperty(el, 'videoWidth', { configurable: true, get: () => 1280 });
          Object.defineProperty(el, 'videoHeight', { configurable: true, get: () => 720 });
          Object.defineProperty(el, 'readyState', { configurable: true, get: () => 4 });
          Object.defineProperty(el, 'currentTime', {
            configurable: true,
            get: () => currentTime,
            set: (val: number) => {
              currentTime = val;
              // Never emit 'seeked' on frames > 0 to simulate a hung decoder
            },
          });
          (el as HTMLVideoElement).load = () => {
            queueMicrotask(() => el.dispatchEvent(new Event('loadedmetadata')));
          };
        }
        return el;
      }) as typeof document.createElement);

      installFakeWebCodecsVideo();
      const mr = installFakeMediaRecorder(1);
      delete (globalThis as Record<string, unknown>).AudioEncoder;

      const exportPromise = exportSingleSlideVideoMp4(make10sVideoCarousel(), 0, {
        fps: 30,
        dimensionPreset: 'ig-3:4',
        preserveAudio: false,
      });
      const caught = exportPromise.catch((err) => err);

      // Frame 0 is already at currentTime=0; Frame 1 (1/30s) hangs for 2 attempts * 3000ms
      await vi.advanceTimersByTimeAsync(7000);
      const err = await caught;
      expect(err).toBeInstanceOf(VideoSeekTimeoutError);
      expect(mr.getStartCalls()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('singleSlideVideoExporter — Step 1: seekVideoToTime stale-frame protection', () => {
  const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(
    window.navigator,
    'userAgent'
  );

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalUserAgentDescriptor) {
      Object.defineProperty(window.navigator, 'userAgent', originalUserAgentDescriptor);
    }
  });

  function setChromeUserAgent() {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    });
  }

  function createMockSeekableVideo(
    onSeek: (attempt: number, targetTime: number, el: HTMLVideoElement) => void
  ) {
    const el = document.createElement('video');
    let currentTime = 0;
    let seekCount = 0;
    Object.defineProperty(el, 'duration', { configurable: true, get: () => 10 });
    Object.defineProperty(el, 'readyState', { configurable: true, get: () => 4 });
    Object.defineProperty(el, 'currentTime', {
      configurable: true,
      get: () => currentTime,
      set: (val: number) => {
        currentTime = val;
        seekCount++;
        onSeek(seekCount, val, el);
      },
    });
    return { video: el, getSeekCount: () => seekCount };
  }

  it('completes a normal seek on the first attempt once seeked fires', async () => {
    vi.useFakeTimers();
    setChromeUserAgent();

    let settled = false;
    const { video, getSeekCount } = createMockSeekableVideo((_attempt, _t, el) => {
      setTimeout(() => el.dispatchEvent(new Event('seeked')), 20);
    });

    const p = seekVideoToTime(video, 1.5).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(15);
    await p;
    expect(settled).toBe(true);
    expect(getSeekCount()).toBe(1);
    expect(video.currentTime).toBeCloseTo(1.5, 4);
  });

  it('waits through a slow seek (>250ms, within 3s) without capturing early or throwing', async () => {
    vi.useFakeTimers();
    setChromeUserAgent();

    let settled = false;
    const { video, getSeekCount } = createMockSeekableVideo((_attempt, _t, el) => {
      setTimeout(() => el.dispatchEvent(new Event('seeked')), 850);
    });

    const p = seekVideoToTime(video, 4.0).then(() => {
      settled = true;
    });

    // At 300ms (past the old buggy 250ms fallback), it MUST still be waiting for 'seeked'
    await vi.advanceTimersByTimeAsync(300);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(600);
    await p;
    expect(settled).toBe(true);
    expect(getSeekCount()).toBe(1);
  });

  it('retries once when the first seek attempt times out and resolves if the retry succeeds', async () => {
    vi.useFakeTimers();
    setChromeUserAgent();

    const { video, getSeekCount } = createMockSeekableVideo((attempt, _t, el) => {
      if (attempt === 2) {
        setTimeout(() => el.dispatchEvent(new Event('seeked')), 150);
      }
    });

    const p = seekVideoToTime(video, 5.25, { timeoutMs: 3000, retries: 1 });

    // First attempt times out at 3000ms, immediately triggers attempt 2
    await vi.advanceTimersByTimeAsync(3000);
    expect(getSeekCount()).toBe(2);

    // Second attempt fires 'seeked' at +150ms
    await vi.advanceTimersByTimeAsync(200);
    await expect(p).resolves.toBeUndefined();
    expect(getSeekCount()).toBe(2);
  });

  it('throws VideoSeekTimeoutError after retrying once when seek never completes (never draws a stale frame)', async () => {
    vi.useFakeTimers();
    setChromeUserAgent();

    const { video, getSeekCount } = createMockSeekableVideo(() => {
      // Never emits 'seeked'
    });

    const p = seekVideoToTime(video, 7.5, { timeoutMs: 3000, retries: 1 });
    const caught = p.catch((err) => err);

    await vi.advanceTimersByTimeAsync(6100);
    const err = await caught;
    expect(err).toBeInstanceOf(VideoSeekTimeoutError);
    expect((err as VideoSeekTimeoutError).attempts).toBe(2);
    expect((err as VideoSeekTimeoutError).targetTimeSec).toBeCloseTo(7.5, 4);
    expect(getSeekCount()).toBe(2);
  });
});

describe('singleSlideVideoExporter — Step 2: SingleSlideLayerCache reuse & invalidation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stubCanvasAndVideo() {
    const noopCtx = createNoopCanvasContext2D();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => noopCtx);

    const video = document.createElement('video');
    Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => 1920 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => 1080 });
    Object.defineProperty(video, 'readyState', { configurable: true, get: () => 4 });
    return video;
  }

  it('reuses cached static layers across frames and invalidates on slide content, canvas size, or theme changes', async () => {
    const video = stubCanvasAndVideo();
    const targetCanvas = document.createElement('canvas');
    const cache = new SingleSlideLayerCache();

    const carousel = make10sVideoCarousel();
    const themeA = BASE_PALETTES.teal;
    const themeB = BASE_PALETTES.cyber;

    // Frame 0: builds static base + overlay once
    await cache.renderFrame(targetCanvas, carousel, 0, video, themeA);
    expect(cache.buildCount).toBe(1);
    expect(targetCanvas.width).toBe(1080);
    expect(targetCanvas.height).toBe(1440);

    // Frame 1 & 2 with identical inputs: reuses cache without rebuilding
    await cache.renderFrame(targetCanvas, carousel, 0, video, themeA);
    await cache.renderFrame(targetCanvas, carousel, 0, video, themeA);
    expect(cache.buildCount).toBe(1);

    // Slide content changes mid-export -> cache invalidates and rebuilds
    const updatedContent: CarouselData = {
      ...carousel,
      slides: [{ ...carousel.slides[0], enTitle: 'UPDATED MID-EXPORT TITLE' }],
    };
    await cache.renderFrame(targetCanvas, updatedContent, 0, video, themeA);
    expect(cache.buildCount).toBe(2);

    // Canvas size / preset changes mid-export -> cache invalidates and resizes
    const updatedSize: CarouselData = {
      ...updatedContent,
      dimensionPreset: 'ig-4:5',
    };
    await cache.renderFrame(targetCanvas, updatedSize, 0, video, themeA);
    expect(cache.buildCount).toBe(3);
    expect(targetCanvas.width).toBe(1080);
    expect(targetCanvas.height).toBe(1350);

    // Theme changes mid-export -> cache invalidates and rebuilds
    await cache.renderFrame(targetCanvas, updatedSize, 0, video, themeB);
    expect(cache.buildCount).toBe(4);

    // Subsequent frame with same updated state reuses the rebuilt cache
    await cache.renderFrame(targetCanvas, updatedSize, 0, video, themeB);
    expect(cache.buildCount).toBe(4);
  });
});

