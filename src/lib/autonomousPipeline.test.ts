import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAutonomousPipeline } from './autonomousPipeline';
import type { CarouselData } from '../types';

const apiDeck: CarouselData = {
  theme: 'teal',
  category: 'SYSTEMS',
  caption: 'Authentic AI output',
  sourceMeta: { engine: 'gemini-ai', isFallback: false },
  slides: [
    { type: 'hub', enTitle: 'Authentic hook', arTitle: 'خطاف' },
    { type: 'row', enTitle: 'Authentic mechanism', arTitle: 'آلية' },
    { type: 'cta', enTitle: 'Authentic close', arTitle: 'ختام', ctaText: 'DM us' },
  ],
};

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
    headers: new Headers(),
  } as Response;
}

describe('runAutonomousPipeline', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses valid API responses and preserves authentic AI output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(apiDeck));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runAutonomousPipeline(
      'How Cloudflare reduced edge worker cold starts by 4x using V8 snapshots',
      { generateDiagram: false }
    );

    expect(result.slides[0].enTitle).toContain('Authentic hook');
    expect(result.sourceMeta?.isFallback).not.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/generate',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('rejects empty or thin inputs before calling /api/generate', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(runAutonomousPipeline('too short')).rejects.toMatchObject({
      name: 'InsufficientSourceError',
      code: 'INSUFFICIENT_SOURCE',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back locally when the API returns malformed carousel JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ theme: 'teal', category: 'X', caption: '', slides: [{ unexpected: true }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await runAutonomousPipeline('Rust vs Go 1.66x faster in 2025', {
      generateDiagram: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.sourceMeta?.engine).toBe('offline-synthesizer');
    expect(result.slides.length).toBeGreaterThanOrEqual(3);
  });

  it('throws before fetching when the caller signal is already aborted', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();

    await expect(
      runAutonomousPipeline('aborted input', { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
