import type {
  CanvasDimensionPreset,
  SlideData,
} from '../../../types.ts';
import { isFullMemeSlide, isHeroImageSlide } from '../constants.ts';
import type { ComputedSlideLayout, TextBlockLayout } from './types.ts';

// Cached measure canvas context
let measureCtx: CanvasRenderingContext2D | null = null;
let hasAttemptedContext = false;

export function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!hasAttemptedContext) {
    hasAttemptedContext = true;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      measureCtx = canvas.getContext('2d');
    } catch (_) {
      measureCtx = null;
    }
  }
  return measureCtx;
}

export const MAX_LAYOUT_CACHE_ENTRIES = 160;
export const slideLayoutCache = new Map<string, ComputedSlideLayout>();

export function cloneTextBlock(block?: TextBlockLayout): TextBlockLayout | undefined {
  if (!block) return undefined;
  return {
    ...block,
    lines: [...block.lines],
  };
}

export function cloneComputedLayout(layout: ComputedSlideLayout): ComputedSlideLayout {
  return {
    ...layout,
    headerBadge: { ...layout.headerBadge },
    graphicCard: layout.graphicCard ? { ...layout.graphicCard } : undefined,
    titleBlock: cloneTextBlock(layout.titleBlock),
    arabicTitleBlock: cloneTextBlock(layout.arabicTitleBlock),
    coverTeaserBlock: cloneTextBlock(layout.coverTeaserBlock),
    arabicCoverTeaserBlock: cloneTextBlock(layout.arabicCoverTeaserBlock),
    bodyBlock: cloneTextBlock(layout.bodyBlock),
    arabicBodyBlock: cloneTextBlock(layout.arabicBodyBlock),
    swipeCueBox: layout.swipeCueBox ? { ...layout.swipeCueBox } : undefined,
    takeawaysBlock: layout.takeawaysBlock ? { ...layout.takeawaysBlock } : undefined,
    ctaButton: layout.ctaButton ? { ...layout.ctaButton } : undefined,
    attributionCard: layout.attributionCard ? { ...layout.attributionCard } : undefined,
    collisionDetails: layout.collisionDetails ? [...layout.collisionDetails] : undefined,
  };
}

export function buildSlideLayoutCacheKey(
  slide: SlideData,
  hasCtx: boolean,
  preset: CanvasDimensionPreset,
  creatorHandle: string,
  isSlide1Cover: boolean
): string {
  const takeawaysKey = slide.takeaways
    ? slide.takeaways.map((t) => `${t.en || ''}:${t.ar || ''}:${t.icon || ''}`).join(';')
    : '';
  const overridesKey = slide.layoutOverrides ? JSON.stringify(slide.layoutOverrides) : '';
  const compPreset = slide.compositionPreset || 'standard';
  const freeMove = slide.freeMoveLayout ? 1 : 0;
  const heroFrame = isFullMemeSlide(slide) ? 'full' : isHeroImageSlide(slide) ? 'hero' : 'std';
  const visualSpecKey = slide.visualSpec ? `${slide.visualSpec.kind}:${slide.visualSpec.title || ''}` : '';
  const coverKey = isSlide1Cover
    ? `1:${slide.coverStyle || ''}:${slide.coverTeaserEn || ''}:${slide.coverTeaserAr || ''}:${slide.showSwipeCue === false ? 0 : 1}:${slide.swipeCueText || ''}`
    : '0';
  const ctaAndCreditKey = `${slide.ctaText || ''}|${slide.enCredit || ''}|${slide.arCredit || ''}|${slide.url || ''}|${creatorHandle}|${slide.hookKicker || ''}|${slide.storyRole || ''}|${slide.hookClaimCard ? `${slide.hookClaimCard.mode}:${slide.hookClaimCard.statement}` : ''}|${visualSpecKey}|${coverKey}`;
  return `${hasCtx ? 1 : 0}|${preset}|${compPreset}|${freeMove}|${heroFrame}|${slide.type || ''}|${slide.enTitle || ''}|${slide.arTitle || ''}|${slide.enBody || ''}|${slide.arBody || ''}|${takeawaysKey}|${ctaAndCreditKey}|${overridesKey}`;
}

export function storeComputedLayout(key: string, layout: ComputedSlideLayout): ComputedSlideLayout {
  if (slideLayoutCache.has(key)) {
    slideLayoutCache.delete(key);
  } else if (slideLayoutCache.size >= MAX_LAYOUT_CACHE_ENTRIES) {
    const oldestKey = slideLayoutCache.keys().next().value;
    if (oldestKey !== undefined) {
      slideLayoutCache.delete(oldestKey);
    }
  }
  slideLayoutCache.set(key, cloneComputedLayout(layout));
  return layout;
}
