import {
  MotionSceneConfig,
  MotionTransitionType,
  SlideType,
} from '../../types.ts';

export const EXIT_DURATION = 0.20; // 200ms outgoing content exit (never overlaps incoming slide)
export const ENTRY_DURATION = 0.30; // 300ms incoming content entry (never overlaps outgoing slide)

export type ConcreteTransitionMode = Exclude<MotionTransitionType, 'auto'>;

export interface SceneRenderLayer {
  scene: MotionSceneConfig;
  index: number;
  localTime: number;
  role: 'active' | 'outgoing' | 'incoming';
  alpha: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  clipProgress?: number; // [0..1] for kinetic-wipe scanline clip
  clipMode?: 'outgoing' | 'incoming';
  transitionMode: ConcreteTransitionMode;
  transitionProgress: number; // 0 when not transitioning, 0..1 during exit/entry
}

export interface SceneTransitionFrameState {
  activeSceneIdx: number;
  fractionalSceneIdx: number;
  inTransition: boolean;
  transitionMode: ConcreteTransitionMode;
  transitionProgress: number; // 0..1
  cameraPanX: number;
  cameraZoom: number;
  layers: SceneRenderLayer[];
}

import { clamp } from './math.ts';

function easeOutCubic(t: number): number {
  const c = clamp(t, 0, 1);
  return 1 - Math.pow(1 - c, 3);
}

function easeInCubic(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * c;
}

function inferSlideArchetype(scene?: MotionSceneConfig, idx = 0): SlideType {
  if (!scene) return 'row';
  if (scene.slideType) return scene.slideType;
  const lbl = (scene.label || '').toLowerCase();
  if (lbl.includes('hub') || lbl.includes('hook') || lbl.includes('matrix') || idx === 0) {
    return 'hub';
  }
  if (lbl.includes('code') || lbl.includes('terminal') || scene.codeSnippet) {
    return 'code';
  }
  if (lbl.includes('metric') || lbl.includes('benchmark') || scene.metricValue) {
    return 'metric';
  }
  if (lbl.includes('cta') || lbl.includes('follow') || lbl.includes('lockup') || lbl.includes('action')) {
    return 'cta';
  }
  return 'row';
}

/**
 * Resolves the optimal concrete transition mode between `prevScene` and `nextScene`
 * when `nextScene.transition` or `defaultTransition` is set to `'auto'`.
 */
export function resolveSmartTransition(
  prevScene: MotionSceneConfig | undefined,
  nextScene: MotionSceneConfig | undefined,
  defaultTransition: MotionTransitionType = 'auto',
  sceneIndex = 1
): ConcreteTransitionMode {
  const explicit = nextScene?.transition && nextScene.transition !== 'auto'
    ? nextScene.transition
    : defaultTransition !== 'auto'
      ? defaultTransition
      : 'auto';

  if (explicit !== 'auto') {
    return explicit;
  }

  const prevType = inferSlideArchetype(prevScene, Math.max(0, sceneIndex - 1));
  const nextType = inferSlideArchetype(nextScene, sceneIndex);

  // 1. Entering a live code terminal uses a glowing laser blueprint wipe
  if (nextType === 'code') {
    return 'kinetic-wipe';
  }

  // 2. Opening hub -> first mechanism or closing CTA lockup uses 3D Z-depth zoom
  if (prevType === 'hub' && sceneIndex === 1) {
    return 'depth';
  }
  if (nextType === 'cta') {
    return 'depth';
  }

  // 3. Staggered pipe-separated takeaway lists -> next scene uses CAD whip-pan
  if ((prevScene?.text || '').includes('|') || (nextScene?.text || '').includes('|')) {
    return 'whip-pan';
  }

  // 4. Consecutive architectural/metric/row slides morph their shared surface card seamlessly
  if (
    (prevType === 'row' || prevType === 'number' || prevType === 'metric' || prevType === 'compare' || prevType === 'code') &&
    (nextType === 'row' || nextType === 'number' || nextType === 'metric' || nextType === 'compare')
  ) {
    return 'morph';
  }

  return 'morph';
}

/**
 * Computes the single active scene layer for any timestamp `globalTime`.
 * Uses a strictly sequential transition (0.20s exit of outgoing content followed by
 * 0.30s entry of incoming content) so two slides are NEVER rendered on screen at once.
 */
export function computeSceneTransitionState(
  scenes: MotionSceneConfig[],
  globalTime: number,
  defaultTransition: MotionTransitionType = 'auto',
  direction: 'rtl' | 'ltr' = 'rtl'
): SceneTransitionFrameState {
  if (!scenes || scenes.length === 0) {
    return {
      activeSceneIdx: 0,
      fractionalSceneIdx: 0,
      inTransition: false,
      transitionMode: 'morph',
      transitionProgress: 0,
      cameraPanX: 0,
      cameraZoom: 1,
      layers: [],
    };
  }

  // Locate primary scene index
  let activeIdx = scenes.length - 1;
  for (let i = 0; i < scenes.length; i++) {
    const from = scenes[i].from ?? i * 4.5;
    const to = scenes[i].to ?? from + 4.5;
    if (globalTime >= from && globalTime < to) {
      activeIdx = i;
      break;
    }
  }
  if (globalTime < (scenes[0].from ?? 0)) {
    activeIdx = 0;
  }

  const currentScene = scenes[activeIdx];
  const curFrom = currentScene.from ?? activeIdx * 4.5;
  const curTo = currentScene.to ?? curFrom + 4.5;
  const curDur = Math.max(0.8, curTo - curFrom);
  const exitWin = Math.min(EXIT_DURATION, curDur * 0.25);
  const entryWin = Math.min(ENTRY_DURATION, curDur * 0.30);

  const dirSign = direction === 'rtl' ? -1 : 1;
  const localTime = Math.max(0, globalTime - curFrom);

  // 1. Outgoing Exit Phase (final 0.20s of currentScene before nextScene starts)
  if (activeIdx < scenes.length - 1 && globalTime >= curTo - exitWin) {
    const nextScene = scenes[activeIdx + 1];
    const mode = resolveSmartTransition(currentScene, nextScene, defaultTransition, activeIdx + 1);
    const rawExit = clamp((globalTime - (curTo - exitWin)) / exitWin, 0, 1);
    const p = easeInCubic(rawExit);

    return buildExitState(
      currentScene,
      activeIdx,
      localTime,
      mode,
      p,
      dirSign
    );
  }

  // 2. Incoming Entry Phase (first 0.30s of currentScene after prevScene exited)
  if (activeIdx > 0 && globalTime < curFrom + entryWin) {
    const prevScene = scenes[activeIdx - 1];
    const mode = resolveSmartTransition(prevScene, currentScene, defaultTransition, activeIdx);
    const rawEntry = clamp((globalTime - curFrom) / entryWin, 0, 1);
    const p = easeOutCubic(rawEntry);

    return buildEntryState(
      currentScene,
      activeIdx,
      localTime,
      mode,
      p,
      dirSign
    );
  }

  // 3. Standard steady-state single scene hold
  return {
    activeSceneIdx: activeIdx,
    fractionalSceneIdx: activeIdx,
    inTransition: false,
    transitionMode: resolveSmartTransition(
      activeIdx > 0 ? scenes[activeIdx - 1] : undefined,
      currentScene,
      defaultTransition,
      activeIdx
    ),
    transitionProgress: 0,
    cameraPanX: 0,
    cameraZoom: 1,
    layers: [
      {
        scene: currentScene,
        index: activeIdx,
        localTime,
        role: 'active',
        alpha: 1,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        transitionMode: 'morph',
        transitionProgress: 0,
      },
    ],
  };
}

function buildExitState(
  outScene: MotionSceneConfig,
  outIdx: number,
  outLocalTime: number,
  mode: ConcreteTransitionMode,
  p: number,
  dirSign: number
): SceneTransitionFrameState {
  const alpha = clamp(1 - p, 0, 1);
  let scale = 1 - p * 0.015;
  let offsetX = 0;
  let offsetY = -p * 16;
  let cameraPanX = 0;
  let cameraZoom = 1;

  if (mode === 'depth') {
    scale = 1 - p * 0.04;
    offsetY = -p * 20;
    cameraZoom = 1 + p * 0.012;
  } else if (mode === 'whip-pan') {
    offsetX = -p * 120 * dirSign;
    offsetY = 0;
    cameraPanX = -p * 36 * dirSign;
  }

  const outLayer: SceneRenderLayer = {
    scene: outScene,
    index: outIdx,
    localTime: outLocalTime,
    role: 'outgoing',
    alpha,
    scale,
    offsetX,
    offsetY,
    transitionMode: mode,
    transitionProgress: p * 0.4,
  };

  return {
    activeSceneIdx: outIdx,
    fractionalSceneIdx: outIdx + p * 0.4,
    inTransition: true,
    transitionMode: mode,
    transitionProgress: p * 0.4,
    cameraPanX,
    cameraZoom,
    layers: [outLayer],
  };
}

function buildEntryState(
  inScene: MotionSceneConfig,
  inIdx: number,
  inLocalTime: number,
  mode: ConcreteTransitionMode,
  p: number,
  dirSign: number
): SceneTransitionFrameState {
  const alpha = clamp(p, 0, 1);
  let scale = 0.985 + p * 0.015;
  let offsetX = 0;
  let offsetY = (1 - p) * 16;
  let cameraPanX = 0;
  let cameraZoom = 1;

  if (mode === 'depth') {
    scale = 1.04 - p * 0.04;
    offsetY = (1 - p) * 20;
    cameraZoom = 1 + (1 - p) * 0.012;
  } else if (mode === 'whip-pan') {
    offsetX = (1 - p) * 120 * dirSign;
    offsetY = 0;
    cameraPanX = -(1 - p) * 36 * dirSign;
  }

  const inLayer: SceneRenderLayer = {
    scene: inScene,
    index: inIdx,
    localTime: inLocalTime,
    role: 'incoming',
    alpha,
    scale,
    offsetX,
    offsetY,
    clipProgress: mode === 'kinetic-wipe' ? p : undefined,
    clipMode: mode === 'kinetic-wipe' ? 'incoming' : undefined,
    transitionMode: mode,
    transitionProgress: 0.4 + p * 0.6,
  };

  return {
    activeSceneIdx: inIdx,
    fractionalSceneIdx: inIdx - (1 - p) * 0.6,
    inTransition: true,
    transitionMode: mode,
    transitionProgress: 0.4 + p * 0.6,
    cameraPanX,
    cameraZoom,
    layers: [inLayer],
  };
}

/**
 * Applies the transition layer's alpha, 2D/depth transform, and optional scanline clip region
 * around a scene draw callback.
 */
export function renderWithTransitionLayer(
  ctx: CanvasRenderingContext2D,
  layer: SceneRenderLayer,
  accentColor: string,
  drawCallback: (localTime: number, layer: SceneRenderLayer) => void
): void {
  if (layer.alpha <= 0.01) return;

  ctx.save();
  ctx.globalAlpha *= clamp(layer.alpha, 0, 1);

  // Optional vertical scanline clip for 'kinetic-wipe'
  const wipeTop = 195;
  const wipeBottom = 1740;
  const wipeSpan = wipeBottom - wipeTop;
  const scanY = wipeTop + wipeSpan * clamp(layer.clipProgress ?? 0, 0, 1);

  if (layer.transitionMode === 'kinetic-wipe' && layer.clipProgress !== undefined && typeof ctx.clip === 'function') {
    ctx.beginPath();
    if (layer.clipMode === 'incoming') {
      ctx.rect(0, 0, 1080, scanY);
    } else {
      ctx.rect(0, scanY, 1080, 1920 - scanY);
    }
    ctx.clip();
  }

  // Apply center-pivoted scale and translation
  if (layer.offsetX !== 0 || layer.offsetY !== 0 || Math.abs(layer.scale - 1) > 0.001) {
    const pivotX = 540;
    const pivotY = 860;
    ctx.translate(pivotX + layer.offsetX, pivotY + layer.offsetY);
    ctx.scale(layer.scale, layer.scale);
    ctx.translate(-pivotX, -pivotY);
  }

  drawCallback(layer.localTime, layer);
  ctx.restore();

  // Draw glowing blueprint laser scanline on incoming kinetic-wipe layer
  if (
    layer.transitionMode === 'kinetic-wipe' &&
    layer.role === 'incoming' &&
    layer.clipProgress !== undefined &&
    layer.clipProgress > 0.02 &&
    layer.clipProgress < 0.98
  ) {
    drawScanlineBeam(ctx, scanY, accentColor, layer.clipProgress);
  }
}

function drawScanlineBeam(
  ctx: CanvasRenderingContext2D,
  y: number,
  accent: string,
  progress: number
): void {
  const envelope = Math.sin(progress * Math.PI);
  ctx.save();
  ctx.globalAlpha = 0.85 * envelope;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 18;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(72, y);
  ctx.lineTo(955, y);
  ctx.stroke();

  // Diamond CAD reticles on both ends of the laser scanline
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(72 - 4, y - 4, 8, 8);
  ctx.fillRect(955 - 4, y - 4, 8, 8);
  ctx.restore();
}

export const TRANSITION_OPTIONS: Array<{ id: MotionTransitionType; label: string; badge: string }> = [
  { id: 'auto', label: 'Smart Auto (Archetype-Aware)', badge: 'AUTO' },
  { id: 'morph', label: 'Shared Surface Card Morph', badge: 'MORPH' },
  { id: 'depth', label: '3D Depth Zoom-Through', badge: 'DEPTH' },
  { id: 'kinetic-wipe', label: 'Blueprint Laser Scanline Wipe', badge: 'WIPE' },
  { id: 'whip-pan', label: 'Continuous CAD Whip-Pan', badge: 'PAN' },
];
