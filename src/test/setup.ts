import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Silence jsdom "Not implemented: HTMLCanvasElement's getContext()" across component & export tests
if (typeof HTMLCanvasElement !== 'undefined') {
  const createMock2dContext = (canvas: HTMLCanvasElement) => {
    const gradientStub = { addColorStop: vi.fn() };
    return {
      canvas,
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      miterLimit: 10,
      font: '16px sans-serif',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      shadowBlur: 0,
      shadowColor: 'transparent',
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      save: vi.fn(),
      restore: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      translate: vi.fn(),
      transform: vi.fn(),
      setTransform: vi.fn(),
      resetTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      arc: vi.fn(),
      arcTo: vi.fn(),
      ellipse: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      clip: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      measureText: vi.fn((text: string) => ({
        width: String(text || '').length * 9,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 4,
      })),
      createLinearGradient: vi.fn(() => gradientStub),
      createRadialGradient: vi.fn(() => gradientStub),
      createPattern: vi.fn(() => null),
      drawImage: vi.fn(),
      setLineDash: vi.fn(),
      getLineDash: vi.fn(() => []),
      getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
        width: Math.max(1, w || 1),
        height: Math.max(1, h || 1),
        data: new Uint8ClampedArray(Math.max(1, (w || 1) * (h || 1) * 4)),
      })),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  };

  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: function (this: HTMLCanvasElement, contextId: string) {
      if (contextId === '2d') {
        const cache = (this as unknown as { __mock2dCtx?: CanvasRenderingContext2D });
        if (!cache.__mock2dCtx) {
          cache.__mock2dCtx = createMock2dContext(this);
        }
        return cache.__mock2dCtx;
      }
      return null;
    },
  });

  Object.defineProperty(HTMLCanvasElement.prototype, 'toDataURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=='),
  });
}

// Auto-resolve HTMLImageElement onload in jsdom so canvas icon & SVG rendering completes immediately in tests
if (typeof HTMLImageElement !== 'undefined') {
  const originalSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    get() {
      return this.__mockSrc || originalSrcDescriptor?.get?.call(this) || '';
    },
    set(val: string) {
      this.__mockSrc = val;
      Object.defineProperty(this, 'complete', { configurable: true, value: true });
      Object.defineProperty(this, 'naturalWidth', { configurable: true, value: 64 });
      Object.defineProperty(this, 'naturalHeight', { configurable: true, value: 64 });
      queueMicrotask(() => {
        if (typeof this.onload === 'function') {
          this.onload(new Event('load'));
        }
      });
    },
  });
}

// Isolate tests from external live PostgreSQL database unless explicitly configured per-test
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.NETLIFY_DATABASE_URL;
delete process.env.NETLIFY_DATABASE_URL_UNPOOLED;

afterEach(() => {
  cleanup();
  localStorage.clear();
});
