import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveProjectRelative } from './paths.mjs';
import { encodeWav24Stereo, normalizeStereoToHeadroom, SAMPLE_RATE } from './wav.mjs';

const TWO_PI = Math.PI * 2;

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function addPianoNote(left, right, startSec, midi, velocity, durationSec, pan = 0, sampleRate = SAMPLE_RATE) {
  const startIdx = Math.max(0, Math.round(startSec * sampleRate));
  const totalSamples = Math.min(left.length - startIdx, Math.round(durationSec * sampleRate));
  if (totalSamples <= 0) return;

  const baseFreq = midiToFreq(midi);
  const inharmonicity = 0.00018 * Math.pow(baseFreq / 261.63, 1.3);
  const partials = [
    { n: 1, amp: 1.0, decay: 0.72 },
    { n: 2, amp: 0.42, decay: 1.15 },
    { n: 3, amp: 0.2, decay: 1.85 },
    { n: 4, amp: 0.1, decay: 2.8 },
    { n: 5, amp: 0.045, decay: 3.9 },
    { n: 6, amp: 0.02, decay: 5.2 },
  ];

  const autoPan = Math.max(-0.55, Math.min(0.55, ((midi - 62) / 36) * 0.45 + pan));
  const gainL = Math.cos(((autoPan + 1) * Math.PI) / 4) * velocity;
  const gainR = Math.sin(((autoPan + 1) * Math.PI) / 4) * velocity;

  const attackSamples = Math.max(12, Math.round(0.006 * sampleRate));
  const releaseStart = Math.max(attackSamples, Math.round((durationSec - 0.18) * sampleRate));
  const releaseLen = Math.max(1, totalSamples - releaseStart);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let env = 1.0;
    if (i < attackSamples) {
      env = i / attackSamples;
    } else if (i >= releaseStart) {
      const rp = (i - releaseStart) / releaseLen;
      env = Math.cos((rp * Math.PI) / 2);
    }

    let sample = 0;
    for (let p = 0; p < partials.length; p++) {
      const part = partials[p];
      const f = baseFreq * part.n * Math.sqrt(1 + inharmonicity * part.n * part.n);
      if (f > sampleRate * 0.44) continue;
      const pEnv = Math.exp(-t * part.decay * (0.7 + baseFreq / 720));
      sample += Math.sin(TWO_PI * f * t) * part.amp * pEnv;
    }

    if (t < 0.018) {
      const hammer = Math.sin(TWO_PI * (baseFreq * 1.5) * t) * Math.exp(-t * 210) * 0.09;
      sample += hammer;
    }

    const out = sample * env * 0.24;
    left[startIdx + i] += out * gainL;
    right[startIdx + i] += out * gainR;
  }
}

function addElectronicPulse(left, right, startSec, freq, amp, pan, sampleRate = SAMPLE_RATE) {
  const startIdx = Math.max(0, Math.round(startSec * sampleRate));
  const len = Math.min(left.length - startIdx, Math.round(0.16 * sampleRate));
  if (len <= 0) return;
  const gainL = Math.cos(((pan + 1) * Math.PI) / 4) * amp;
  const gainR = Math.sin(((pan + 1) * Math.PI) / 4) * amp;
  for (let i = 0; i < len; i++) {
    const t = i / sampleRate;
    const attack = Math.min(1, t / 0.006);
    const decay = Math.exp(-t * 26);
    const val = (Math.sin(TWO_PI * freq * t) * 0.8 + Math.sin(TWO_PI * freq * 2 * t) * 0.2) * attack * decay;
    left[startIdx + i] += val * gainL;
    right[startIdx + i] += val * gainR;
  }
}

function addWarmPad(left, right, startSec, durationSec, midi, amp, sampleRate = SAMPLE_RATE) {
  const startIdx = Math.max(0, Math.round(startSec * sampleRate));
  const totalSamples = Math.min(left.length - startIdx, Math.round(durationSec * sampleRate));
  if (totalSamples <= 0) return;

  const freq = midiToFreq(midi);
  const fadeIn = Math.min(totalSamples * 0.35, Math.round(1.1 * sampleRate));
  const fadeOut = Math.min(totalSamples * 0.35, Math.round(1.1 * sampleRate));

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    let env = 1.0;
    if (i < fadeIn) env = 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeIn);
    else if (i > totalSamples - fadeOut) env = 0.5 - 0.5 * Math.cos((Math.PI * (totalSamples - i)) / fadeOut);

    const l = Math.sin(TWO_PI * (freq - 0.35) * t) * 0.72 + Math.sin(TWO_PI * (freq * 2 - 0.5) * t) * 0.16;
    const r = Math.sin(TWO_PI * (freq + 0.35) * t) * 0.72 + Math.sin(TWO_PI * (freq * 2 + 0.5) * t) * 0.16;

    left[startIdx + i] += l * env * amp;
    right[startIdx + i] += r * env * amp;
  }
}

function applyCleanStudioRoom(left, right, wet = 0.16, sampleRate = SAMPLE_RATE) {
  const tapsL = [
    { ms: 19, g: 0.42 },
    { ms: 37, g: 0.31 },
    { ms: 61, g: 0.21 },
    { ms: 97, g: 0.14 },
  ];
  const tapsR = [
    { ms: 23, g: 0.42 },
    { ms: 43, g: 0.3 },
    { ms: 67, g: 0.2 },
    { ms: 103, g: 0.13 },
  ];
  const outL = new Float32Array(left.length);
  const outR = new Float32Array(right.length);
  let lpL = 0;
  let lpR = 0;
  const alpha = 0.22;

  for (let i = 0; i < left.length; i++) {
    let refL = 0;
    let refR = 0;
    for (let k = 0; k < tapsL.length; k++) {
      const dL = Math.round((tapsL[k].ms / 1000) * sampleRate);
      const dR = Math.round((tapsR[k].ms / 1000) * sampleRate);
      if (i >= dL) refL += right[i - dL] * tapsL[k].g;
      if (i >= dR) refR += left[i - dR] * tapsR[k].g;
    }
    lpL += alpha * (refL - lpL);
    lpR += alpha * (refR - lpR);
    outL[i] = left[i] + lpL * wet;
    outR[i] = right[i] + lpR * wet;
  }
  left.set(outL);
  right.set(outR);
}

function buildMarrok37sSections() {
  return [
    { t: 0.0, root: 50, chord: [62, 66, 69, 73], vel: 0.42, pulse: false, pad: 0.05 },
    { t: 2.0, root: 45, chord: [57, 64, 69, 71], vel: 0.40, pulse: false, pad: 0.05 },
    { t: 4.0, root: 47, chord: [59, 66, 69, 74], vel: 0.46, pulse: true, pad: 0.065 },
    { t: 6.4, root: 43, chord: [55, 62, 66, 71], vel: 0.46, pulse: true, pad: 0.065 },
    { t: 8.4, root: 45, chord: [57, 64, 69, 73], vel: 0.47, pulse: true, pad: 0.07 },
    { t: 10.5, root: 50, chord: [62, 66, 69, 74], vel: 0.50, pulse: true, pad: 0.075 },
    { t: 12.6, root: 47, chord: [59, 62, 66, 73], vel: 0.50, pulse: true, pad: 0.075 },
    { t: 14.7, root: 43, chord: [55, 62, 66, 71], vel: 0.51, pulse: true, pad: 0.08 },
    { t: 16.5, root: 45, chord: [57, 64, 69, 74], vel: 0.52, pulse: true, pad: 0.085 },
    { t: 18.6, root: 50, chord: [62, 66, 73, 76], vel: 0.54, pulse: true, pad: 0.09 },
    { t: 20.8, root: 47, chord: [59, 66, 71, 74], vel: 0.56, pulse: true, pad: 0.095 },
    { t: 23.0, root: 43, chord: [55, 62, 66, 71, 78, 81], vel: 0.72, pulse: true, pad: 0.145, swell: true },
    { t: 25.5, root: 45, chord: [57, 64, 69, 73, 76, 81], vel: 0.74, pulse: true, pad: 0.15, swell: true },
    { t: 28.0, root: 47, chord: [59, 66, 71, 74, 78, 83], vel: 0.72, pulse: true, pad: 0.145, swell: true },
    { t: 30.5, root: 43, chord: [55, 62, 66, 71, 74], vel: 0.56, pulse: false, pad: 0.11 },
    { t: 32.8, root: 45, chord: [57, 64, 69, 73], vel: 0.52, pulse: false, pad: 0.10 },
    { t: 34.5, root: 50, chord: [62, 66, 69, 73, 76], vel: 0.58, pulse: false, pad: 0.12, finale: true },
  ];
}

function buildGenericSections(durationSec, swellAtSec) {
  const palette = [
    { root: 50, chord: [62, 66, 69, 73] },
    { root: 45, chord: [57, 64, 69, 71] },
    { root: 47, chord: [59, 66, 69, 74] },
    { root: 43, chord: [55, 62, 66, 71] },
  ];
  const barLen = 2.2;
  const swellStart = Number.isFinite(swellAtSec) ? swellAtSec : durationSec * 0.6;
  const finaleStart = Math.max(0, durationSec - 2.6);
  const sections = [];
  let t = 0;
  let idx = 0;

  while (t < durationSec - 0.5) {
    const base = palette[idx % palette.length];
    const isFinale = t >= finaleStart;
    const isSwell = !isFinale && t >= swellStart;
    const isIntro = t < Math.min(2.4, durationSec * 0.15);
    sections.push({
      t,
      root: isFinale ? 50 : base.root,
      chord: isSwell ? [...base.chord, base.chord[0] + 12] : base.chord,
      vel: isSwell ? 0.72 : isFinale ? 0.56 : 0.48,
      pulse: !isIntro && !isFinale,
      pad: isSwell ? 0.14 : isFinale ? 0.11 : 0.075,
      swell: isSwell,
      finale: isFinale,
    });
    t = Number((t + barLen).toFixed(3));
    idx++;
  }
  return sections;
}

/**
 * Synthesize minimal corporate piano + electronic pulse instrumental bed at exact durationSec.
 * Preserves the exact 37.000s MARROK score when durationSec === 37 and no custom swellAtSec is passed.
 */
export function synthesizeMusicWav(sampleRate = SAMPLE_RATE, options = {}) {
  const durationSec = Number.isFinite(options.durationSec) && options.durationSec > 0 ? options.durationSec : 37.0;
  const useMarrokScore = durationSec === 37.0 && (options.swellAtSec === undefined || options.swellAtSec === null || options.swellAtSec === 23.0);
  const numFrames = Math.round(durationSec * sampleRate);
  const left = new Float32Array(numFrames);
  const right = new Float32Array(numFrames);

  const sections = useMarrokScore
    ? buildMarrok37sSections()
    : buildGenericSections(durationSec, options.swellAtSec);
  const pulseStopSec = useMarrokScore ? 30.5 : Math.max(0, durationSec - 4.0);
  const finalePadStart = Math.max(0, durationSec - 2.6);

  for (let s = 0; s < sections.length; s++) {
    const sec = sections[s];
    const nextT = s < sections.length - 1 ? sections[s + 1].t : durationSec;
    const span = nextT - sec.t;

    addPianoNote(left, right, sec.t, sec.root, sec.vel * 0.92, Math.min(span + 1.4, durationSec - sec.t), -0.15, sampleRate);
    addWarmPad(left, right, sec.t, Math.min(span + 0.6, durationSec - sec.t), sec.root + 12, sec.pad, sampleRate);
    if (sec.swell || sec.finale) {
      addWarmPad(left, right, sec.t, Math.min(span + 0.8, durationSec - sec.t), sec.root + 19, sec.pad * 0.7, sampleRate);
    }

    const step = sec.swell ? 0.28 : 0.34;
    const stepsCount = Math.max(2, Math.floor(span / step));
    for (let k = 0; k < stepsCount; k++) {
      const noteTime = sec.t + k * step;
      if (noteTime >= durationSec - 0.6) break;
      const noteMidi = sec.chord[k % sec.chord.length];
      const accent = k === 0 ? 1.0 : k % 2 === 0 ? 0.82 : 0.68;
      const hold = sec.finale ? Math.max(1.2, durationSec - noteTime) : Math.min(2.2, durationSec - noteTime);
      addPianoNote(left, right, noteTime, noteMidi, sec.vel * accent, hold, 0, sampleRate);
    }

    if (sec.pulse) {
      const pulseFreq = midiToFreq(sec.root + 12);
      const pulseStep = 0.30;
      const count = Math.floor(span / pulseStep);
      for (let p = 0; p < count; p++) {
        const pt = sec.t + p * pulseStep;
        if (pt >= pulseStopSec) break;
        const pAmp = (sec.swell ? 0.11 : 0.065) * (p % 2 === 0 ? 1.0 : 0.58);
        const pan = p % 2 === 0 ? -0.18 : 0.18;
        addElectronicPulse(left, right, pt, pulseFreq, pAmp, pan, sampleRate);
      }
    }
  }

  addWarmPad(left, right, finalePadStart, durationSec - finalePadStart, 62, 0.13, sampleRate);
  addWarmPad(left, right, finalePadStart, durationSec - finalePadStart, 69, 0.09, sampleRate);
  addWarmPad(left, right, finalePadStart, durationSec - finalePadStart, 73, 0.07, sampleRate);

  applyCleanStudioRoom(left, right, 0.17, sampleRate);

  const endDeclick = Math.min(numFrames, Math.round(0.012 * sampleRate));
  for (let i = 0; i < endDeclick; i++) {
    const w = 1 - i / endDeclick;
    left[numFrames - endDeclick + i] *= w;
    right[numFrames - endDeclick + i] *= w;
  }

  normalizeStereoToHeadroom(left, right, -3.0);
  return encodeWav24Stereo(left, right, sampleRate);
}

export function synthesizeTypingWav(sampleRate = SAMPLE_RATE) {
  const durationSec = 1.5;
  const numFrames = Math.round(durationSec * sampleRate);
  const left = new Float32Array(numFrames);
  const right = new Float32Array(numFrames);
  const rng = createRng(20261101);

  const keyTimes = [
    0.000, 0.092, 0.176, 0.278, 0.365,
    0.495, 0.582, 0.664, 0.752, 0.848,
    0.962, 1.054, 1.148, 1.248, 1.355,
  ];

  for (let k = 0; k < keyTimes.length; k++) {
    const startIdx = Math.round(keyTimes[k] * sampleRate);
    const isSpacebar = k === 4 || k === 10;
    const keyLen = Math.min(numFrames - startIdx, Math.round(0.055 * sampleRate));
    const pan = -0.28 + (k / (keyTimes.length - 1)) * 0.56;
    const gainL = Math.cos(((pan + 1) * Math.PI) / 4);
    const gainR = Math.sin(((pan + 1) * Math.PI) / 4);
    const vel = isSpacebar ? 0.92 : 0.68 + rng() * 0.28;
    const bodyFreq = isSpacebar ? 520 : 1450 + rng() * 650;
    const clickFreq = isSpacebar ? 2400 : 3800 + rng() * 1400;

    let lp = 0;
    for (let i = 0; i < keyLen; i++) {
      const t = i / sampleRate;
      const noise = rng() * 2 - 1;
      lp += 0.35 * (noise - lp);
      const clickEnv = Math.exp(-t * 420);
      const bodyEnv = Math.exp(-t * 145);
      const upEnv = t > 0.014 ? Math.exp(-(t - 0.014) * 320) * 0.28 : 0;

      const sig = (
        Math.sin(TWO_PI * clickFreq * t) * clickEnv * 0.45 +
        (noise - lp) * clickEnv * 0.55 +
        Math.sin(TWO_PI * bodyFreq * t) * bodyEnv * 0.38 +
        Math.sin(TWO_PI * (bodyFreq * 1.3) * t) * upEnv * 0.32
      ) * vel;

      left[startIdx + i] += sig * gainL;
      right[startIdx + i] += sig * gainR;
    }
  }

  const fadeOut = Math.round(0.03 * sampleRate);
  for (let i = 0; i < fadeOut; i++) {
    const w = 1 - i / fadeOut;
    left[numFrames - fadeOut + i] *= w;
    right[numFrames - fadeOut + i] *= w;
  }

  normalizeStereoToHeadroom(left, right, -3.0);
  return encodeWav24Stereo(left, right, sampleRate);
}

export function synthesizeWhooshWav(sampleRate = SAMPLE_RATE) {
  const durationSec = 1.0;
  const numFrames = Math.round(durationSec * sampleRate);
  const left = new Float32Array(numFrames);
  const right = new Float32Array(numFrames);
  const rngL = createRng(20261102);
  const rngR = createRng(20261103);

  let lowL = 0, bandL = 0;
  let lowR = 0, bandR = 0;
  let pinkL = 0, pinkR = 0;

  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    const norm = t / durationSec;
    const env = Math.pow(Math.sin(Math.min(1, norm / 0.28) * (Math.PI / 2)), 0.7) * Math.exp(-Math.max(0, norm - 0.22) * 4.4);
    const tailFade = norm > 0.85 ? 1 - (norm - 0.85) / 0.15 : 1;
    const amp = env * tailFade;

    pinkL = pinkL * 0.92 + (rngL() * 2 - 1) * 0.08;
    pinkR = pinkR * 0.92 + (rngR() * 2 - 1) * 0.08;

    const sweep = Math.sin(Math.min(1, norm * 1.15) * Math.PI);
    const cutoff = 240 + sweep * 1080;
    const f = 2 * Math.sin((Math.PI * cutoff) / sampleRate);
    const q = 0.52;

    lowL += f * bandL;
    const highL = pinkL - lowL - q * bandL;
    bandL += f * highL;

    lowR += f * bandR;
    const highR = pinkR - lowR - q * bandR;
    bandR += f * highR;

    const subFreq = 88 - norm * 34;
    const sub = Math.sin(TWO_PI * subFreq * t) * amp * 0.12;

    const pan = -0.3 + norm * 0.6;
    const gL = Math.cos(((pan + 1) * Math.PI) / 4);
    const gR = Math.sin(((pan + 1) * Math.PI) / 4);

    left[i] = (bandL * 1.45 + lowL * 0.35) * amp * gL + sub;
    right[i] = (bandR * 1.45 + lowR * 0.35) * amp * gR + sub;
  }

  normalizeStereoToHeadroom(left, right, -3.0);
  return encodeWav24Stereo(left, right, sampleRate);
}

export function synthesizeUiClickWav(sampleRate = SAMPLE_RATE) {
  const durationSec = 0.25;
  const numFrames = Math.round(durationSec * sampleRate);
  const left = new Float32Array(numFrames);
  const right = new Float32Array(numFrames);
  const rng = createRng(20261104);

  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    const pitch1 = 1950 * Math.exp(-t * 85) + 680;
    const body1 = Math.sin(TWO_PI * pitch1 * t) * Math.exp(-t * 140) * 0.72;
    const snap = (rng() * 2 - 1) * Math.exp(-t * 900) * 0.22;

    let detent = 0;
    if (t >= 0.022) {
      const dt = t - 0.022;
      detent = Math.sin(TWO_PI * 1318.5 * dt) * Math.exp(-dt * 42) * 0.32;
    }

    const endFade = t > 0.21 ? Math.max(0, 1 - (t - 0.21) / 0.04) : 1;
    const mono = (body1 + snap + detent) * endFade;
    left[i] = mono * 0.98;
    right[i] = mono * 1.0;
  }

  normalizeStereoToHeadroom(left, right, -3.0);
  return encodeWav24Stereo(left, right, sampleRate);
}

export function synthesizeSyncChimeWav(sampleRate = SAMPLE_RATE) {
  const durationSec = 1.0;
  const numFrames = Math.round(durationSec * sampleRate);
  const left = new Float32Array(numFrames);
  const right = new Float32Array(numFrames);

  const notes = [
    { start: 0.0, freq: 880.0, amp: 0.65, decay: 4.4, pan: -0.14 },
    { start: 0.065, freq: 1318.51, amp: 0.58, decay: 3.8, pan: 0.14 },
  ];

  for (const n of notes) {
    const startIdx = Math.round(n.start * sampleRate);
    const gL = Math.cos(((n.pan + 1) * Math.PI) / 4);
    const gR = Math.sin(((n.pan + 1) * Math.PI) / 4);

    for (let i = startIdx; i < numFrames; i++) {
      const t = (i - startIdx) / sampleRate;
      const attack = Math.min(1, t / 0.004);
      const env = attack * Math.exp(-t * n.decay);
      const overtoneEnv = attack * Math.exp(-t * (n.decay * 2.4));

      const valL = (
        Math.sin(TWO_PI * (n.freq - 0.8) * t) * 0.82 * env +
        Math.sin(TWO_PI * (n.freq * 2.0) * t) * 0.15 * overtoneEnv +
        Math.sin(TWO_PI * (n.freq * 2.998) * t) * 0.04 * overtoneEnv
      ) * n.amp;
      const valR = (
        Math.sin(TWO_PI * (n.freq + 0.8) * t) * 0.82 * env +
        Math.sin(TWO_PI * (n.freq * 2.0) * t) * 0.15 * overtoneEnv +
        Math.sin(TWO_PI * (n.freq * 3.002) * t) * 0.04 * overtoneEnv
      ) * n.amp;

      left[i] += valL * gL;
      right[i] += valR * gR;
    }
  }

  const fadeOut = Math.round(0.06 * sampleRate);
  for (let i = 0; i < fadeOut; i++) {
    const w = 1 - i / fadeOut;
    left[numFrames - fadeOut + i] *= w;
    right[numFrames - fadeOut + i] *= w;
  }

  normalizeStereoToHeadroom(left, right, -3.0);
  return encodeWav24Stereo(left, right, sampleRate);
}

export function synthesizeShimmerWav(sampleRate = SAMPLE_RATE) {
  const durationSec = 1.2;
  const numFrames = Math.round(durationSec * sampleRate);
  const left = new Float32Array(numFrames);
  const right = new Float32Array(numFrames);
  const rng = createRng(20261105);

  const sparkles = [
    { start: 0.00, freq: 1174.66, pan: -0.35, amp: 0.42 },
    { start: 0.05, freq: 1479.98, pan: -0.15, amp: 0.45 },
    { start: 0.11, freq: 1760.00, pan: 0.05, amp: 0.48 },
    { start: 0.18, freq: 2217.46, pan: 0.22, amp: 0.36 },
    { start: 0.26, freq: 2349.32, pan: 0.36, amp: 0.32 },
    { start: 0.34, freq: 2637.02, pan: 0.00, amp: 0.24 },
  ];

  for (const s of sparkles) {
    const startIdx = Math.round(s.start * sampleRate);
    const gL = Math.cos(((s.pan + 1) * Math.PI) / 4);
    const gR = Math.sin(((s.pan + 1) * Math.PI) / 4);
    for (let i = startIdx; i < numFrames; i++) {
      const t = (i - startIdx) / sampleRate;
      const env = Math.min(1, t / 0.018) * Math.exp(-t * 3.4);
      const trem = 0.92 + 0.08 * Math.sin(TWO_PI * 6.5 * t);
      const l = Math.sin(TWO_PI * (s.freq - 1.1) * t) * env * trem * s.amp;
      const r = Math.sin(TWO_PI * (s.freq + 1.1) * t) * env * trem * s.amp;
      left[i] += l * gL;
      right[i] += r * gR;
    }
  }

  let prev = 0;
  for (let i = 0; i < numFrames; i++) {
    const t = i / sampleRate;
    const n = rng() * 2 - 1;
    const hp = n - prev * 0.88;
    prev = n;
    const airEnv = Math.sin(Math.min(1, t / 0.35) * (Math.PI / 2)) * Math.exp(-Math.max(0, t - 0.25) * 4.5);
    left[i] += hp * airEnv * 0.025;
    right[i] += hp * airEnv * 0.025;
  }

  const fadeOut = Math.round(0.08 * sampleRate);
  for (let i = 0; i < fadeOut; i++) {
    const w = 1 - i / fadeOut;
    left[numFrames - fadeOut + i] *= w;
    right[numFrames - fadeOut + i] *= w;
  }

  normalizeStereoToHeadroom(left, right, -3.0);
  return encodeWav24Stereo(left, right, sampleRate);
}

export const DSP_SYNTHESIZERS = {
  'music.wav': synthesizeMusicWav,
  'typing.wav': synthesizeTypingWav,
  'whoosh.wav': synthesizeWhooshWav,
  'ui-click.wav': synthesizeUiClickWav,
  'sync-chime.wav': synthesizeSyncChimeWav,
  'shimmer.wav': synthesizeShimmerWav,
};

export function resolveSfxSynth(sfxItem) {
  const candidates = [
    sfxItem?.dspPreset,
    sfxItem?.id,
    path.basename(sfxItem?.file || '', '.wav'),
    path.basename(sfxItem?.file || ''),
  ].filter(Boolean);

  for (const key of candidates) {
    const normalized = key.endsWith('.wav') ? key : `${key}.wav`;
    if (DSP_SYNTHESIZERS[normalized]) {
      return DSP_SYNTHESIZERS[normalized];
    }
  }
  return null;
}

/**
 * Ensure all project DSP stems (music + SFX with source === 'dsp') exist on disk.
 */
export async function ensureProjectDspStems(project, projectPaths, options = {}) {
  const force = Boolean(options.force);
  const generated = [];

  if (project.music && project.music.source === 'dsp') {
    const musicPath = resolveProjectRelative(projectPaths.root, project.music.file);
    await fs.mkdir(path.dirname(musicPath), { recursive: true });
    let exists = false;
    if (!force) {
      try {
        await fs.access(musicPath);
        exists = true;
      } catch {
        // generate
      }
    }
    if (!exists) {
      const wavBuf = synthesizeMusicWav(SAMPLE_RATE, {
        durationSec: project.video.durationSec,
        swellAtSec: project.music.swellAtSec,
      });
      await fs.writeFile(musicPath, wavBuf);
      generated.push(project.music.file);
    }
  }

  const seenFiles = new Set();
  for (const item of project.sfx || []) {
    if (item.source !== 'dsp') continue;
    const sfxPath = resolveProjectRelative(projectPaths.root, item.file);
    if (seenFiles.has(sfxPath)) continue;
    seenFiles.add(sfxPath);

    await fs.mkdir(path.dirname(sfxPath), { recursive: true });
    let exists = false;
    if (!force) {
      try {
        await fs.access(sfxPath);
        exists = true;
      } catch {
        // generate
      }
    }
    if (!exists) {
      const synth = resolveSfxSynth(item);
      if (!synth) {
        throw new Error(
          `No DSP synthesizer found for SFX "${item.id}" (${item.file}). Use source: "file" or set dspPreset to typing/whoosh/ui-click/sync-chime/shimmer.`
        );
      }
      await fs.writeFile(sfxPath, synth(SAMPLE_RATE));
      generated.push(item.file);
    }
  }

  return generated;
}
