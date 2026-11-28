import type { PostFormat, SlideData } from '../../types.ts';
import { withClientAuthHeaders } from '../security/clientSessionToken.ts';
import { getCustomGeminiHeaders } from '../network/httpClient.ts';
import {
  getSlideCatalogId,
  materializeLayoutForSlide,
  rankSlideLayoutsForDeck,
} from '../synthesis/autoLayoutEngine.ts';

export interface DirectVisualRequestParams {
  slide: SlideData;
  slides: SlideData[];
  slideIndex: number;
  category?: string;
  postFormat?: PostFormat;
  excludeLayouts?: string[];
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
}

export interface DirectVisualResponsePayload {
  slideUpdates: Partial<SlideData>;
  chosenLayoutId: string;
  rationale: string;
  engine: 'ungrounded' | 'offline';
  model: string;
}

export async function requestAiVisualDirection(
  params: DirectVisualRequestParams
): Promise<DirectVisualResponsePayload> {
  const {
    slide,
    slides,
    slideIndex,
    category = 'SOFTWARE ARCHITECTURE',
    postFormat = 'carousel',
    excludeLayouts = [],
    signal,
    fetchFn = fetch,
  } = params;

  const siblingLayouts = (slides || [])
    .map((s, idx) => (idx === slideIndex ? null : `S${idx + 1}:${getSlideCatalogId(s)}`))
    .filter((item): item is string => Boolean(item));

  const headers = withClientAuthHeaders({
    'Content-Type': 'application/json',
    ...getCustomGeminiHeaders(),
  });

  try {
    const res = await fetchFn('/api/direct-visual', {
      method: 'POST',
      credentials: 'include',
      headers,
      signal,
      body: JSON.stringify({
        slide,
        slideIndex,
        totalSlides: slides.length || 1,
        category,
        postFormat,
        siblingLayouts,
        excludeLayouts,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as Partial<DirectVisualResponsePayload>;
      if (data && data.slideUpdates && data.chosenLayoutId) {
        return {
          slideUpdates: data.slideUpdates,
          chosenLayoutId: data.chosenLayoutId,
          rationale: data.rationale || `Re-imagined ${data.chosenLayoutId}`,
          engine: data.engine === 'ungrounded' ? 'ungrounded' : 'offline',
          model: data.model || 'gemini-4-hydrogen',
        };
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    console.warn('[visualDirector] AI visual direction failed; falling back to deck-aware engine:', err);
  }

  // Client offline fallback: pick next best non-excluded deck-aware layout
  const excludeSet = new Set(excludeLayouts);
  const ranked = rankSlideLayoutsForDeck(slide, slides, slideIndex, {
    postFormat,
    excludeIds: excludeLayouts,
  });
  const candidate =
    ranked.find((c) => !excludeSet.has(c.id) && c.slideType !== 'image' && c.slideType !== 'cta') ||
    ranked.find((c) => c.slideType !== 'image' && c.slideType !== 'cta') ||
    ranked[0];

  const materialized = materializeLayoutForSlide(
    slide,
    candidate,
    slideIndex,
    slides.length || 1,
    {
      rationalePrefix: 'Re-imagined',
      lockLayout: false,
      forceRefreshVisuals: true,
    }
  );

  return {
    slideUpdates: materialized,
    chosenLayoutId: candidate.id,
    rationale: materialized.layoutRationale || `Re-imagined ${candidate.label}`,
    engine: 'offline',
    model: 'deck-aware-engine',
  };
}
