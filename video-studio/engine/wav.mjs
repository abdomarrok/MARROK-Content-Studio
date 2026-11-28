export const SAMPLE_RATE = 48000;
export const BIT_DEPTH = 24;
export const CHANNELS = 2;

const INT24_MAX = 8388607;
const INT24_MIN = -8388608;

/**
 * Compute peak amplitude (0..1+) and dBFS of split stereo Float32 arrays.
 */
export function measureStereoPeak(left, right) {
  let peak = 0;
  for (let i = 0; i < left.length; i++) {
    const al = Math.abs(left[i]);
    const ar = Math.abs(right[i]);
    if (al > peak) peak = al;
    if (ar > peak) peak = ar;
  }
  const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  return { peak, peakDb };
}

/**
 * Compute RMS (in dBFS) of a stereo range [startSec, endSec).
 */
export function measureStereoRmsDb(left, right, startSec, endSec, sampleRate = SAMPLE_RATE) {
  const start = Math.max(0, Math.floor(startSec * sampleRate));
  const end = Math.min(left.length, Math.floor(endSec * sampleRate));
  if (end <= start) return -Infinity;
  let sumSq = 0;
  const count = (end - start) * 2;
  for (let i = start; i < end; i++) {
    sumSq += left[i] * left[i] + right[i] * right[i];
  }
  const rms = Math.sqrt(sumSq / count);
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/**
 * Normalize stereo buffers in place to exact target peak in dBFS (default -3.0 dBFS).
 */
export function normalizeStereoToHeadroom(left, right, targetPeakDb = -3.0) {
  const { peak } = measureStereoPeak(left, right);
  if (peak <= 0) return { peak: 0, peakDb: -Infinity };
  const targetLinear = Math.pow(10, targetPeakDb / 20);
  const gain = targetLinear / peak;
  for (let i = 0; i < left.length; i++) {
    left[i] *= gain;
    right[i] *= gain;
  }
  return measureStereoPeak(left, right);
}

/**
 * Trim any leading samples below thresholdDb so audio begins at sample zero without leading silence.
 */
export function trimLeadingSilence(left, right, thresholdDb = -60) {
  const threshold = Math.pow(10, thresholdDb / 20);
  let start = 0;
  while (start < left.length && Math.abs(left[start]) < threshold && Math.abs(right[start]) < threshold) {
    start++;
  }
  if (start === 0 || start >= left.length) {
    return { left, right, trimmedSamples: 0 };
  }
  const outL = left.subarray(start);
  const outR = right.subarray(start);
  const fadeSamples = Math.min(96, outL.length);
  const copyL = new Float32Array(outL);
  const copyR = new Float32Array(outR);
  for (let i = 0; i < fadeSamples; i++) {
    const w = (i + 1) / fadeSamples;
    copyL[i] *= w;
    copyR[i] *= w;
  }
  return { left: copyL, right: copyR, trimmedSamples: start };
}

/**
 * Encode stereo Float32Arrays into an uncompressed signed 24-bit PCM, 48,000 Hz stereo WAV Buffer.
 */
export function encodeWav24Stereo(left, right, sampleRate = SAMPLE_RATE) {
  const numFrames = left.length;
  const bytesPerSample = BIT_DEPTH / 8;
  const blockAlign = CHANNELS * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const buffer = Buffer.allocUnsafe(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(BIT_DEPTH, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    const lSample = Math.max(-1, Math.min(1, left[i]));
    const rSample = Math.max(-1, Math.min(1, right[i]));

    let lInt = Math.round(lSample * INT24_MAX);
    if (lInt > INT24_MAX) lInt = INT24_MAX;
    if (lInt < INT24_MIN) lInt = INT24_MIN;

    let rInt = Math.round(rSample * INT24_MAX);
    if (rInt > INT24_MAX) rInt = INT24_MAX;
    if (rInt < INT24_MIN) rInt = INT24_MIN;

    buffer[offset++] = lInt & 0xff;
    buffer[offset++] = (lInt >> 8) & 0xff;
    buffer[offset++] = (lInt >> 16) & 0xff;

    buffer[offset++] = rInt & 0xff;
    buffer[offset++] = (rInt >> 8) & 0xff;
    buffer[offset++] = (rInt >> 16) & 0xff;
  }

  return buffer;
}

/**
 * Parse a WAV buffer and return technical specs, peak dBFS, and waveform preview buckets.
 */
export function inspectWavBuffer(buffer, waveformBins = 72) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) {
    throw new Error('Invalid WAV buffer: too small.');
  }
  const riff = buffer.toString('ascii', 0, 4);
  const wave = buffer.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error('Invalid WAV header.');
  }

  let offset = 12;
  let audioFormat = 0;
  let subFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      audioFormat = buffer.readUInt16LE(offset + 8);
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
      if (audioFormat === 0xfffe && chunkSize >= 40 && offset + 34 <= buffer.length) {
        subFormat = buffer.readUInt16LE(offset + 32);
      }
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = Math.min(chunkSize, buffer.length - dataOffset);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0 || channels === 0 || bitsPerSample === 0 || sampleRate === 0) {
    throw new Error('Incomplete WAV chunks.');
  }

  const bytesPerSample = bitsPerSample / 8;
  const frameSize = channels * bytesPerSample;
  const numFrames = Math.floor(dataSize / frameSize);
  const durationSec = numFrames / sampleRate;

  let peak = 0;
  let firstActiveFrame = -1;
  const activeThreshold = Math.pow(10, -54 / 20);
  const bins = new Array(waveformBins).fill(0);
  const framesPerBin = Math.max(1, numFrames / waveformBins);

  for (let f = 0; f < numFrames; f++) {
    let frameMax = 0;
    const base = dataOffset + f * frameSize;
    for (let ch = 0; ch < channels; ch++) {
      const p = base + ch * bytesPerSample;
      let val = 0;
      if (bitsPerSample === 24) {
        let int24 = buffer[p] | (buffer[p + 1] << 8) | (buffer[p + 2] << 16);
        if (int24 & 0x800000) int24 |= ~0xffffff;
        val = Math.abs(int24) / 8388608;
      } else if (bitsPerSample === 16) {
        val = Math.abs(buffer.readInt16LE(p)) / 32768;
      } else if (bitsPerSample === 32 && audioFormat === 3) {
        val = Math.abs(buffer.readFloatLE(p));
      }
      if (val > frameMax) frameMax = val;
    }
    if (frameMax > peak) peak = frameMax;
    if (firstActiveFrame === -1 && frameMax >= activeThreshold) {
      firstActiveFrame = f;
    }
    const binIdx = Math.min(waveformBins - 1, Math.floor(f / framesPerBin));
    if (frameMax > bins[binIdx]) bins[binIdx] = frameMax;
  }

  const peakDb = peak > 0 ? Number((20 * Math.log10(peak)).toFixed(2)) : -Infinity;
  const leadingSilenceMs = firstActiveFrame >= 0
    ? Number(((firstActiveFrame / sampleRate) * 1000).toFixed(2))
    : Number((durationSec * 1000).toFixed(2));

  return {
    audioFormat,
    isPcm: audioFormat === 1 || (audioFormat === 0xfffe && subFormat === 1),
    channels,
    sampleRate,
    bitsPerSample,
    numFrames,
    durationSec: Number(durationSec.toFixed(3)),
    sizeBytes: buffer.length,
    peak: Number(peak.toFixed(4)),
    peakDb,
    leadingSilenceMs,
    waveform: bins.map((v) => Number(Math.min(1, v).toFixed(3))),
  };
}

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[i] = c >>> 0;
}

export function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZipBuffer(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  const dosTime = (12 << 11) | (0 << 5) | 0;
  const dosDate = ((2026 - 1980) << 9) | (11 << 5) | 27;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const dataBuf = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const checksum = crc32(dataBuf);

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    localParts.push(localHeader, dataBuf);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBuf.length;
  }

  const centralDirBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuffer, eocd]);
}
