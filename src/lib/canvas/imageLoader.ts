import { getIconDataUrl, getIconSvg } from '../icons.ts';

// Bounded LRU image cache for fast re-renders without unbounded memory growth.
export const CANVAS_IMAGE_CACHE = new Map<string, HTMLImageElement>();

const MAX_CACHE_ENTRIES = 80;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
let cacheBytes = 0;

const inFlightIconLoads = new Map<string, Promise<HTMLImageElement>>();
const inFlightWebLoads = new Map<string, Promise<HTMLImageElement>>();

function estimateImageBytes(img: HTMLImageElement): number {
  return Math.max(0, img.naturalWidth * img.naturalHeight * 4);
}

function removeCachedImage(key: string) {
  const existing = CANVAS_IMAGE_CACHE.get(key);
  if (!existing) return;
  cacheBytes = Math.max(0, cacheBytes - estimateImageBytes(existing));
  CANVAS_IMAGE_CACHE.delete(key);
}

function getCachedImage(key: string): HTMLImageElement | null {
  const cached = CANVAS_IMAGE_CACHE.get(key);
  if (!cached) return null;
  if (!cached.complete || cached.naturalWidth === 0 || cached.naturalHeight === 0) {
    removeCachedImage(key);
    return null;
  }
  // Refresh LRU position.
  CANVAS_IMAGE_CACHE.delete(key);
  CANVAS_IMAGE_CACHE.set(key, cached);
  return cached;
}

function setCachedImage(key: string, img: HTMLImageElement) {
  if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) return;
  const bytes = estimateImageBytes(img);
  if (bytes > MAX_CACHE_BYTES) return;

  removeCachedImage(key);
  CANVAS_IMAGE_CACHE.set(key, img);
  cacheBytes += bytes;

  while (CANVAS_IMAGE_CACHE.size > MAX_CACHE_ENTRIES || cacheBytes > MAX_CACHE_BYTES) {
    const oldestKey = CANVAS_IMAGE_CACHE.keys().next().value as string | undefined;
    if (!oldestKey) break;
    removeCachedImage(oldestKey);
  }
}

function dedupeLoad(
  map: Map<string, Promise<HTMLImageElement>>,
  key: string,
  loader: () => Promise<HTMLImageElement>
): Promise<HTMLImageElement> {
  const existing = map.get(key);
  if (existing) return existing;

  const promise = loader();
  map.set(key, promise);
  void promise.finally(() => {
    if (map.get(key) === promise) map.delete(key);
  });
  return promise;
}

export function resetCanvasImageCache() {
  CANVAS_IMAGE_CACHE.clear();
  inFlightIconLoads.clear();
  inFlightWebLoads.clear();
  cacheBytes = 0;
}

/**
 * Creates a guaranteed valid fallback SVG image so canvas operations never crash
 */
export function createFallbackIcon(strokeColor: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const fallbackSvg = getIconSvg('gitMerge', strokeColor);
    const fallbackUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fallbackSvg)}`;
    const fb = new Image();
    fb.onload = () => resolve(fb);
    fb.onerror = () => resolve(fb);
    fb.src = fallbackUrl;
  });
}

/**
 * Helper to load an SVG, custom image icon, or web image as an HTMLImageElement
 */
export function loadIconImage(iconName: string, strokeColor: string): Promise<HTMLImageElement> {
  const url = getIconDataUrl(iconName, strokeColor);
  const cached = getCachedImage(url);
  if (cached) return Promise.resolve(cached);

  return dedupeLoad(inFlightIconLoads, url, () => new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const img = new Image();
    // Only set crossOrigin for remote http(s) URLs, never for data: or blob:
    if (!url.startsWith('data:') && !url.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }

    const finish = (result: HTMLImageElement, cache: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (cache) setCachedImage(url, result);
      resolve(result);
    };

    // Safety timeout: never block canvas render for more than 1000ms
    timer = setTimeout(async () => {
      if (settled) return;
      settled = true;
      console.warn(`Timeout loading icon/image: ${iconName}, falling back to SVG`);
      const fb = await createFallbackIcon(strokeColor);
      setCachedImage(url, fb);
      resolve(fb);
    }, 1000);

    img.onload = () => finish(img, true);

    img.onerror = async () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      console.warn(`Failed to load icon/image: ${iconName}, falling back to SVG`);
      const fb = await createFallbackIcon(strokeColor);
      setCachedImage(url, fb);
      resolve(fb);
    };

    img.src = url;
    if (img.complete && img.naturalWidth > 0) {
      finish(img, true);
    }
  }));
}

/**
 * Helper to load full web images / diagrams via CORS proxy with theme recoloring
 */
export function loadWebImage(imageUrl: string, color?: string): Promise<HTMLImageElement> {
  const isSvg = imageUrl.toLowerCase().includes('.svg') || imageUrl.includes('simple-icons');
  let safeUrl = imageUrl;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    const colorParam = isSvg && color ? `&color=${encodeURIComponent(color)}` : '';
    safeUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}${colorParam}`;
  }

  const cached = getCachedImage(safeUrl);
  if (cached) return Promise.resolve(cached);

  return dedupeLoad(inFlightWebLoads, safeUrl, () => new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const img = new Image();
    if (!safeUrl.startsWith('data:') && !safeUrl.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }

    const finish = (cache: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (cache && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        setCachedImage(safeUrl, img);
      }
      resolve(img);
    };

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn(`Timeout loading web image: ${imageUrl}`);
      resolve(img);
    }, 1500);

    img.onload = () => finish(true);
    img.onerror = () => {
      console.warn(`Failed to load web image: ${imageUrl}`);
      finish(false);
    };
    img.src = safeUrl;
    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      finish(true);
    }
  }));
}

/**
 * Safely draws an image to canvas without throwing InvalidStateError on broken images
 */
export function safeDrawImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0 || w <= 0 || h <= 0) {
    return;
  }
  try {
    ctx.drawImage(img, x, y, w, h);
  } catch (err) {
    console.warn('safeDrawImage caught error:', err);
  }
}

let tintScratchCanvas: HTMLCanvasElement | null = null;
let tintScratchCtx: CanvasRenderingContext2D | null = null;

/**
 * Tinted image drawer helper (replaces non-transparent pixels with theme color via source-in)
 */
export function drawTintedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  tintColor?: string
) {
  if (!img || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0 || w <= 0 || h <= 0) {
    return;
  }
  if (!tintColor) {
    safeDrawImage(ctx, img, x, y, w, h);
    return;
  }
  try {
    const targetW = Math.max(1, Math.round(w));
    const targetH = Math.max(1, Math.round(h));
    if (!tintScratchCanvas) {
      tintScratchCanvas = document.createElement('canvas');
      tintScratchCtx = tintScratchCanvas.getContext('2d');
    }
    if (!tintScratchCtx) {
      safeDrawImage(ctx, img, x, y, w, h);
      return;
    }
    if (tintScratchCanvas.width !== targetW || tintScratchCanvas.height !== targetH) {
      tintScratchCanvas.width = targetW;
      tintScratchCanvas.height = targetH;
    } else {
      tintScratchCtx.clearRect(0, 0, targetW, targetH);
    }
    tintScratchCtx.globalCompositeOperation = 'source-over';
    tintScratchCtx.drawImage(img, 0, 0, targetW, targetH);
    tintScratchCtx.globalCompositeOperation = 'source-in';
    tintScratchCtx.fillStyle = tintColor;
    tintScratchCtx.fillRect(0, 0, targetW, targetH);

    ctx.drawImage(tintScratchCanvas, x, y, w, h);
  } catch (_err) {
    safeDrawImage(ctx, img, x, y, w, h);
  }
}

