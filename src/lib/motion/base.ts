import {
  MotionBrandConfig,
  MotionSceneConfig,
  MotionTemplateConfig,
  MotionTemplateMeta,
  MotionCueItem,
  MotionSfxProfile,
  MotionTransitionType,
} from '../../types.ts';
import { MARROK_CHROME_SCRIPT } from './marrokSlideChrome.ts';
import { resolveSmartTransition } from './transitions.ts';

import { clamp } from './math.ts';

export const MOTION_W = 1080;
export const MOTION_H = 1920;

export { clamp };

/**
 * Damped harmonic spring oscillator ported 1:1 from abdomarrok/motion-reel
 */
export function spring(t: number, k = 170, d = 26): number {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k);
  const z = d / (2 * w0);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

/**
 * Deterministic Mulberry32 PRNG ported 1:1 from abdomarrok/motion-reel
 */
export function rng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp(t), 3);
}

export function easeInOutCubic(t: number): number {
  const c = clamp(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

export const CORE_UTILS = `
const W = 1080, H = 1920;
const g = document.getElementById('c').getContext('2d');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

function spring(t, k = 170, d = 26) {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k), z = d / (2 * w0);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function easeOutCubic(t) { return 1 - Math.pow(1 - clamp(t), 3); }
function easeInOutCubic(t) { t = clamp(t); return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2; }
`;

export const DEFAULT_BRAND: MotionBrandConfig = {
  name: 'MARROK',
  accentColor: '#6EA0FF',
  bgColor: '#080A12',
  textColor: '#FFFFFF',
  font: 'Cairo',
  direction: 'rtl',
};

export const FONT_OPTIONS = [
  'Cairo',
  'Outfit',
  'Plus Jakarta Sans',
  'IBM Plex Sans Arabic',
  'Noto Sans Arabic',
  'Montserrat',
  'Poppins',
  'Playfair Display',
  'Source Serif 4',
];

export function wrapHTML(config: MotionTemplateConfig, scenesCode: string, extraSetup = ''): string {
  const font = config.brand?.font || 'Cairo';
  const bg = config.brand?.bgColor || '#080A12';
  const dir = config.brand?.direction || 'rtl';

  return `<!doctype html>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;600;700;800&family=Plus+Jakarta+Sans:wght@500;700;800&family=Cairo:wght@600;700;800&family=JetBrains+Mono:wght@600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: ${bg};
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
</style>
<canvas id="c" width="1080" height="1920"></canvas>
<script>
${CORE_UTILS}
${MARROK_CHROME_SCRIPT}
const DUR = ${config.duration || 20};
g.direction = '${dir}';
g.textBaseline = 'alphabetic';
const CONFIG = ${JSON.stringify(config)};
${extraSetup}
${scenesCode}
function draw(t) {
  drawMarrokChrome(g, CONFIG, t);
  let activeIdx = 0;
  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i];
    if (t >= s.from && t < s.to) {
      activeIdx = i;
      break;
    }
  }
  const s = SCENES[activeIdx];
  if (s) {
    const exitWin = 0.20;
    const entryWin = 0.30;
    let alpha = 1;
    let scale = 1;
    let dy = 0;
    if (activeIdx < SCENES.length - 1 && t >= s.to - exitWin) {
      const p = Math.pow(clamp((t - (s.to - exitWin)) / exitWin, 0, 1), 3);
      alpha = 1 - p;
      scale = 1 - 0.015 * p;
      dy = -16 * p;
    } else if (activeIdx > 0 && t < s.from + entryWin) {
      const p = easeOutCubic(clamp((t - s.from) / entryWin, 0, 1));
      alpha = p;
      scale = 0.985 + 0.015 * p;
      dy = (1 - p) * 16;
    }
    if (alpha > 0.01) {
      g.save();
      g.globalAlpha = alpha;
      g.translate(540, 860 + dy);
      g.scale(scale, scale);
      g.translate(-540, -860);
      s.draw(Math.max(0, t - s.from));
      g.restore();
    }
  }
  drawMarrokFooter(g, CONFIG, t, activeIdx, SCENES.length);
}
window.seek = (t) => { draw(t); return true; };
if (!navigator.webdriver) {
  const t0 = performance.now();
  (function loop() { draw(((performance.now() - t0) / 1000) % DUR); requestAnimationFrame(loop); })();
}
</script>`;
}

/**
 * Generates context-aware, warm low-pass filtered Foley cues synchronized to each scene's
 * transition style (`morph`, `depth`, `kinetic-wipe`, `whip-pan`) and slide archetype
 * (`hub`, `row`, `number`, `metric`, `code`, `compare`, `cta`).
 */
export function generateCues(
  scenes: MotionSceneConfig[],
  sfxProfile: MotionSfxProfile = 'warm-foley',
  defaultTransition: MotionTransitionType = 'auto'
): MotionCueItem[] {
  if (!scenes || scenes.length === 0 || sfxProfile === 'silent') {
    return [];
  }

  const cues: MotionCueItem[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const prevScene = i > 0 ? scenes[i - 1] : undefined;
    const from = scene.from ?? i * 4.5;
    const to = scene.to ?? from + 4.5;
    const dur = Math.max(0.5, to - from);
    const transMode = resolveSmartTransition(prevScene, scene, defaultTransition, i);

    // 1. Scene Transition Entry Cue — short whoosh on every transition between slides
    if (i === 0) {
      // Soft sub-bass pulse on initial reel start
      cues.push({ t: Number((from + 0.04).toFixed(3)), type: 'thump', amp: 0.11 });
    } else {
      // Short warm band-pass whoosh on every scene transition cut
      cues.push({ t: Number(Math.max(0, from - 0.08).toFixed(3)), type: 'whoosh', amp: 0.11 });
      if (transMode === 'depth') {
        cues.push({ t: Number(Math.max(0, from + 0.02).toFixed(3)), type: 'thump', amp: 0.08 });
      }
    }

    // Minimal-sub profile emits only the transition cues above
    if (sfxProfile === 'minimal-sub') {
      continue;
    }

    // 2. Archetype-Aware Micro-Events ('warm-foley' profile)
    const slideType = scene.slideType || (i === 0 ? 'hub' : i === scenes.length - 1 ? 'cta' : 'row');
    const isStaggeredPipe = (scene.text || '').includes('|') && !scene.enBody && !scene.arBody;

    if (isStaggeredPipe && dur >= 2.0) {
      // 3 staggered takeaway cards snapping into place
      const itemCount = Math.min(3, (scene.text || '').split('|').filter(Boolean).length);
      for (let k = 0; k < itemCount; k++) {
        const popTime = from + 0.16 + k * 0.16;
        if (popTime < to - 0.2) {
          cues.push({ t: Number(popTime.toFixed(3)), type: 'pop', amp: 0.075 });
        }
      }
    } else if (slideType === 'hub' && dur >= 1.8) {
      // Central hub lock + orbital node pop
      cues.push({ t: Number((from + 0.24).toFixed(3)), type: 'pop', amp: 0.085 });
      if (dur >= 2.6) {
        cues.push({ t: Number((from + 0.46).toFixed(3)), type: 'click', amp: 0.05 });
      }
    } else if (slideType === 'code' && dur >= 1.8) {
      // Soft mechanical terminal relay ticks as code lines type in
      cues.push({ t: Number((from + 0.20).toFixed(3)), type: 'click', amp: 0.055 });
      cues.push({ t: Number((from + 0.36).toFixed(3)), type: 'click', amp: 0.05 });
      if (dur >= 2.5) {
        cues.push({ t: Number((from + 0.54).toFixed(3)), type: 'pop', amp: 0.07 });
      }
    } else if (slideType === 'metric' && dur >= 1.8) {
      // Telemetry counter ticks finishing with a harmonic chime lock
      cues.push({ t: Number((from + 0.18).toFixed(3)), type: 'click', amp: 0.05 });
      cues.push({ t: Number((from + 0.32).toFixed(3)), type: 'click', amp: 0.055 });
      if (dur >= 2.2) {
        cues.push({ t: Number((from + 0.48).toFixed(3)), type: 'chime', amp: 0.085 });
      }
    } else if (slideType === 'cta' && dur >= 1.8) {
      // Closing @MARROK badge lockup with warm harmonic fifth chime
      cues.push({ t: Number((from + 0.28).toFixed(3)), type: 'chime', amp: 0.095 });
    } else if (dur >= 2.0) {
      // Standard architectural row / pipeline stage lock
      cues.push({ t: Number((from + 0.24).toFixed(3)), type: 'pop', amp: 0.075 });
    }
  }

  return cues.sort((a, b) => a.t - b.t);
}

export interface MotionTemplateDefinition {
  meta: MotionTemplateMeta;
  defaultConfig: (brand?: Partial<MotionBrandConfig>) => MotionTemplateConfig;
  toHTML: (config: MotionTemplateConfig) => string;
  drawFrame: (ctx: CanvasRenderingContext2D, config: MotionTemplateConfig, t: number) => void;
}
