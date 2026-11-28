(function (globalScope) {
  'use strict';

  function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function invLerp(a, b, value) {
    if (a === b) return value >= b ? 1 : 0;
    return clamp((value - a) / (b - a), 0, 1);
  }

  function remap(inMin, inMax, outMin, outMax, value) {
    return lerp(outMin, outMax, invLerp(inMin, inMax, value));
  }

  function actProgress(t, start, end) {
    if (end <= start) return t >= start ? 1 : 0;
    return clamp((t - start) / (end - start), 0, 1);
  }

  function easeOutCubic(p) {
    const c = clamp(p, 0, 1);
    return 1 - Math.pow(1 - c, 3);
  }

  function easeInOutCubic(p) {
    const c = clamp(p, 0, 1);
    return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
  }

  function easeOutQuart(p) {
    const c = clamp(p, 0, 1);
    return 1 - Math.pow(1 - c, 4);
  }

  function easeInOutQuart(p) {
    const c = clamp(p, 0, 1);
    return c < 0.5 ? 8 * c * c * c * c : 1 - Math.pow(-2 * c + 2, 4) / 2;
  }

  function easeOutExpo(p) {
    const c = clamp(p, 0, 1);
    return c >= 1 ? 1 : 1 - Math.pow(2, -10 * c);
  }

  /**
   * Closed-form deterministic damped spring response (0 -> 1 over time t >= 0 seconds).
   */
  function springDeterministic(t, stiffness = 180, damping = 18, mass = 1) {
    if (t <= 0) return 0;
    const m = Math.max(0.01, mass);
    const k = Math.max(0.01, stiffness);
    const c = Math.max(0.01, damping);
    const omega0 = Math.sqrt(k / m);
    const zeta = c / (2 * Math.sqrt(k * m));

    if (zeta < 0.999) {
      const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
      const env = Math.exp(-zeta * omega0 * t);
      const val =
        1 - env * (Math.cos(omegaD * t) + ((zeta * omega0) / omegaD) * Math.sin(omegaD * t));
      return Math.abs(1 - val) < 0.0005 && env < 0.001 ? 1 : val;
    }

    if (zeta <= 1.001) {
      const env = Math.exp(-omega0 * t);
      const val = 1 - env * (1 + omega0 * t);
      return Math.abs(1 - val) < 0.0005 && env < 0.001 ? 1 : val;
    }

    const sq = Math.sqrt(zeta * zeta - 1);
    const r1 = -omega0 * (zeta - sq);
    const r2 = -omega0 * (zeta + sq);
    const c2 = r1 / (r1 - r2);
    const c1 = 1 - c2;
    const val = 1 - (c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t));
    return Math.abs(1 - val) < 0.0005 ? 1 : val;
  }

  function stagger(t, start, index, step, duration) {
    const itemStart = start + index * step;
    return actProgress(t, itemStart, itemStart + duration);
  }

  function typewriter(text, p) {
    const str = String(text || '');
    const count = Math.floor(clamp(p, 0, 1) * str.length);
    return str.slice(0, count);
  }

  /**
   * Return element bounds normalized to the unscaled stage coordinate space.
   */
  function getNormalizedRect(el, stageEl) {
    const stage = stageEl || document.getElementById('stage');
    if (!el || !stage) {
      return { x: 0, y: 0, width: 0, height: 0, cx: 0, cy: 0, right: 0, bottom: 0 };
    }
    const elRect = el.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const stageWidth = stage.offsetWidth || 1920;
    const stageHeight = stage.offsetHeight || 1080;
    const scaleX = stageRect.width > 0 ? stageWidth / stageRect.width : 1;
    const scaleY = stageRect.height > 0 ? stageHeight / stageRect.height : 1;

    const x = (elRect.left - stageRect.left) * scaleX;
    const y = (elRect.top - stageRect.top) * scaleY;
    const width = elRect.width * scaleX;
    const height = elRect.height * scaleY;

    return {
      x,
      y,
      width,
      height,
      cx: x + width / 2,
      cy: y + height / 2,
      right: x + width,
      bottom: y + height,
    };
  }

  function init(config) {
    const opts = config || {};
    const duration = Number(opts.duration) || 15;
    const fps = Number(opts.fps) || 60;
    const totalFrames = Math.round(duration * fps);
    const params = new URLSearchParams(window.location.search);
    const isRenderMode = params.get('render') === '1';
    const isEmbedMode = params.get('embed') === '1';
    const aspect = params.get('aspect') || '';

    const stageW = aspect === '9:16' ? 1080 : aspect === '1:1' ? 1080 : Number(opts.width) || 1920;
    const stageH = aspect === '9:16' ? 1920 : aspect === '1:1' ? 1080 : Number(opts.height) || 1080;

    if (isRenderMode) document.body.classList.add('render-mode');
    if (isEmbedMode) document.body.classList.add('embed-mode');
    if (aspect === '9:16') document.body.classList.add('aspect-9x16');
    if (aspect === '1:1') document.body.classList.add('aspect-1x1');

    const stageEl = document.querySelector(opts.stageSelector || '#stage');
    const scalerEl = document.querySelector(opts.scalerSelector || '#stage-scaler');
    if (stageEl) {
      stageEl.style.width = `${stageW}px`;
      stageEl.style.height = `${stageH}px`;
    }
    if (scalerEl) {
      scalerEl.style.width = `${stageW}px`;
      scalerEl.style.height = `${stageH}px`;
    }

    const fitStage = () => {
      if (!scalerEl) return;
      if (isRenderMode) {
        scalerEl.style.transform = 'scale(1)';
        return;
      }
      const padX = isEmbedMode ? 0 : 32;
      const padY = isEmbedMode ? 0 : 96;
      const availW = Math.max(120, window.innerWidth - padX);
      const availH = Math.max(120, window.innerHeight - padY);
      const scale = Math.min(availW / stageW, availH / stageH, 1);
      scalerEl.style.transform = `scale(${Math.max(0.1, scale)})`;
    };

    const renderFn = typeof opts.render === 'function' ? opts.render : () => {};
    let currentTime = 0;

    const renderAt = (rawT, dt) => {
      const t = clamp(Number(rawT) || 0, 0, duration);
      const step = Number(dt) || 1 / fps;
      currentTime = t;
      renderFn(t, step, { duration, fps, totalFrames, stageW, stageH, isRenderMode, isEmbedMode, aspect });
      return { t, dt: step, totalFrames };
    };

    globalScope.renderAt = renderAt;
    globalScope.fitStageToViewport = fitStage;
    globalScope.STUDIO_SCENE_META = {
      duration,
      fps,
      totalFrames,
      width: stageW,
      height: stageH,
      isRenderMode,
      isEmbedMode,
      aspect,
      getCurrentTime: () => currentTime,
    };

    window.addEventListener('message', (event) => {
      const msg = event?.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'studio:scrub') {
        renderAt(msg.t, msg.dt);
      }
    });

    window.addEventListener('resize', fitStage);
    fitStage();

    if (typeof opts.onReady === 'function') {
      globalScope.__STUDIO_READY__ = Promise.resolve()
        .then(() => opts.onReady({ stageW, stageH, aspect, isRenderMode, isEmbedMode }))
        .then(() => renderAt(currentTime, 1 / fps));
    } else {
      globalScope.__STUDIO_READY__ = Promise.resolve(renderAt(0, 1 / fps));
    }

    return {
      duration,
      fps,
      totalFrames,
      width: stageW,
      height: stageH,
      isRenderMode,
      isEmbedMode,
      aspect,
      renderAt,
      fitStage,
    };
  }

  const StudioSDK = {
    clamp,
    lerp,
    invLerp,
    remap,
    actProgress,
    progress: actProgress,
    easeOutCubic,
    easeInOutCubic,
    easeOutQuart,
    easeInOutQuart,
    easeOutExpo,
    springDeterministic,
    stagger,
    typewriter,
    getNormalizedRect,
    init,
  };

  globalScope.StudioSDK = StudioSDK;
})(typeof window !== 'undefined' ? window : globalThis);
