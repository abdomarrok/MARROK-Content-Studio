import type {
  CarouselData,
  HookVariant,
  PostFormat,
  PostFormatDraftSnapshot,
  SlideData,
  ThemePalette,
} from '../../types.ts';
import { condenseCarouselToSingleSlide } from '../synthesis/singleSlideCondenser.ts';
import { applyDeckAwareAutoLayout } from '../synthesis/autoLayoutEngine.ts';
import { synthesizeCarousel } from '../synthesizer.ts';
import { buildCleanMemeCarouselDeck } from '../canvas/videoFrameExtractor.ts';
import { convertCarouselToMotionReel } from '../motion/carouselToReelConverter.ts';

const GENERIC_HOOK_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'what', 'why', 'how',
  'when', 'where', 'your', 'our', 'their', 'about', 'after', 'before', 'under', 'over',
  'more', 'less', 'most', 'very', 'just', 'only', 'than', 'then', 'they', 'them', 'have',
  'does', 'dont', 'breaks', 'break', 'hurt', 'hurts', 'notice', 'teams', 'team', 'mistake',
  'inside', 'system', 'systems', 'architecture', 'architectural', 'production', 'engineering',
  'scale', 'performance', 'modern', 'real', 'true', 'best', 'fast', 'high', 'low', 'data',
  'code', 'apps', 'stack', 'layer', 'layers', 'model', 'models', 'shifts', 'shift',
  'لماذا', 'كيف', 'ماذا', 'عندما', 'قبل', 'بعد', 'على', 'في', 'من', 'إلى', 'عن', 'مع',
  'أنظمة', 'الأنظمة', 'معمارية', 'الإنتاج', 'الأداء', 'التقنية', 'الهندسية', 'نظام',
]);

/**
 * Deeply clones a SlideData object so editing one format workspace
 * can never mutate nested arrays/objects in another format snapshot.
 */
export function cloneSlideData(slide: SlideData): SlideData {
  return {
    ...slide,
    ...(slide.icons ? { icons: slide.icons.map((ic) => ({ ...ic })) } : {}),
    ...(slide.diagramNodes ? { diagramNodes: slide.diagramNodes.map((n) => ({ ...n })) } : {}),
    ...(slide.diagramEdges
      ? {
          diagramEdges: slide.diagramEdges.map((e) =>
            Array.isArray(e) ? ([...e] as typeof e) : e
          ),
        }
      : {}),
    ...(slide.takeaways ? { takeaways: slide.takeaways.map((t) => ({ ...t })) } : {}),
    ...(slide.satLabels ? { satLabels: [...slide.satLabels] } : {}),
    ...(slide.hubNodeReasons ? { hubNodeReasons: slide.hubNodeReasons.map((r) => ({ ...r })) } : {}),
    ...(slide.hookClaimCard ? { hookClaimCard: { ...slide.hookClaimCard } } : {}),
    ...(slide.subjectPair ? { subjectPair: { ...slide.subjectPair } } : {}),
    ...(slide.visualSpec
      ? {
          visualSpec: {
            ...slide.visualSpec,
            ...(slide.visualSpec.bars ? { bars: slide.visualSpec.bars.map((b) => ({ ...b })) } : {}),
            ...(slide.visualSpec.actors ? { actors: [...slide.visualSpec.actors] } : {}),
            ...(slide.visualSpec.steps ? { steps: slide.visualSpec.steps.map((st) => ({ ...st })) } : {}),
            ...(slide.visualSpec.events ? { events: slide.visualSpec.events.map((ev) => ({ ...ev })) } : {}),
            ...(slide.visualSpec.quadrants
              ? { quadrants: slide.visualSpec.quadrants.map((q) => ({ ...q })) }
              : {}),
            ...(slide.visualSpec.columns ? { columns: [...slide.visualSpec.columns] } : {}),
            ...(slide.visualSpec.rows ? { rows: slide.visualSpec.rows.map((r) => [...r]) } : {}),
          },
        }
      : {}),
    ...(slide.brandLogoConfig ? { brandLogoConfig: { ...slide.brandLogoConfig } } : {}),
    ...(slide.layoutOverrides
      ? {
          layoutOverrides: Object.fromEntries(
            Object.entries(slide.layoutOverrides).map(([k, v]) => [k, v ? { ...v } : v])
          ),
        }
      : {}),
  };
}

export function cloneSlides(slides: SlideData[]): SlideData[] {
  return (slides || []).map(cloneSlideData);
}

/**
 * Resolves the active PostFormat consistently from explicit postFormat or slide structure.
 */
export function resolveEffectivePostFormat(carousel: CarouselData): PostFormat {
  if (carousel.postFormat === 'reel') return 'reel';
  if (
    carousel.postFormat === 'meme' ||
    (carousel.slides.length === 1 && Boolean(carousel.slides[0]?.standaloneMeme))
  ) {
    return 'meme';
  }
  if (carousel.postFormat === 'single' || carousel.slides.length === 1) {
    return 'single';
  }
  return 'carousel';
}

function extractSignificantTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  const matches = (text || '').toLowerCase().match(/[a-z0-9\u0600-\u06FF]+(?:[._-][a-z0-9]+)*/g) || [];
  for (const raw of matches) {
    const clean = raw.replace(/^[._-]+|[._-]+$/g, '');
    if (clean.length < 3 && !/\d/.test(clean)) continue;
    if (GENERIC_HOOK_STOPWORDS.has(clean)) continue;
    tokens.add(clean);
    // Also index numeric core (e.g. "99.99" from "99.99%")
    if (/\d/.test(clean)) {
      const numCore = clean.replace(/[%xms]+$/i, '');
      if (numCore.length >= 2) tokens.add(numCore);
    }
  }
  return tokens;
}

/**
 * Topic-relevance guard for Slide 1 Viral Hook Presets.
 * Filters out stale hookVariants belonging to a different topic/post (e.g., Postgres/Docker
 * hooks left over on an Uber uptime draft). Returns undefined if none match the active deck.
 */
export function filterRelevantHookVariants(
  hookVariants: HookVariant[] | undefined,
  slides: SlideData[],
  category?: string
): HookVariant[] | undefined {
  if (!Array.isArray(hookVariants) || hookVariants.length === 0) {
    return undefined;
  }

  const deckCorpus = [
    ...(slides || []).map((s) =>
      [
        s.enTitle,
        s.arTitle,
        s.enBody,
        s.arBody,
        s.metricValue,
        s.metricLabel,
        s.compareLeftTitle,
        s.compareRightTitle,
        s.subjectPair?.beforeSystem,
        s.subjectPair?.afterSystem,
        s.subjectPair?.storyOwner,
        ...(s.diagramNodes || []).map((n) => n.label),
      ]
        .filter(Boolean)
        .join(' ')
    ),
    category || '',
  ].join(' ');

  const deckTokens = extractSignificantTokens(deckCorpus);
  if (deckTokens.size === 0) {
    return hookVariants;
  }

  const matched = hookVariants.filter((variant) => {
    const variantTokens = extractSignificantTokens(
      `${variant.enTitle || ''} ${variant.arTitle || ''} ${variant.enBody || ''} ${variant.hookKicker || ''}`
    );
    for (const token of variantTokens) {
      if (deckTokens.has(token)) {
        return true;
      }
    }
    return false;
  });

  return matched.length > 0 ? matched : undefined;
}

/**
 * Snapshots a format's slides cleanly into a cloned formatDrafts map on the carousel.
 */
export function snapshotFormatDraft(
  formatDrafts: Partial<Record<PostFormat, PostFormatDraftSnapshot>> | undefined,
  format: PostFormat,
  slides: SlideData[],
  activeSlideIndex: number = 0
): Partial<Record<PostFormat, PostFormatDraftSnapshot>> {
  const nextDrafts: Partial<Record<PostFormat, PostFormatDraftSnapshot>> = {};
  if (formatDrafts) {
    for (const [key, snap] of Object.entries(formatDrafts) as Array<[PostFormat, PostFormatDraftSnapshot | undefined]>) {
      if (snap && Array.isArray(snap.slides) && snap.slides.length > 0) {
        nextDrafts[key] = {
          slides: cloneSlides(snap.slides),
          activeSlideIndex: snap.activeSlideIndex,
          updatedAt: snap.updatedAt,
        };
      }
    }
  }
  if (slides && slides.length > 0) {
    nextDrafts[format] = {
      slides: cloneSlides(slides),
      activeSlideIndex: Math.max(0, Math.min(activeSlideIndex, slides.length - 1)),
      updatedAt: new Date().toISOString(),
    };
  }
  return nextDrafts;
}

export interface SwitchFormatOptions {
  activeSlideIndex: number;
  theme: ThemePalette;
  uploadedImage?: { base64: string; name?: string } | null;
  promptInput?: string;
  categoryHint?: string;
  activeTab?: string;
}

export interface SwitchFormatResult {
  nextCarousel: CarouselData;
  nextSlideIndex: number;
  restoredFromSnapshot: boolean;
  toastMessage: string;
}

/**
 * Losslessly switches a post between Carousel, Single Slide, Meme, and Motion Reel.
 * - Snapshots outgoing format's exact slides into `formatDrafts[currentFormat]`.
 * - Restores `formatDrafts[nextFormat]` verbatim if previously visited for this post.
 * - Seeds `nextFormat` from the best real source slides ONLY on first visit.
 * - Never overwrites Carousel Slide 1 with Single/Meme edits and never leaks across posts.
 */
export function switchCarouselPostFormat(
  carousel: CarouselData,
  nextFormat: PostFormat,
  options: SwitchFormatOptions
): SwitchFormatResult {
  const currentFormat = resolveEffectivePostFormat(carousel);
  if (currentFormat === nextFormat) {
    return {
      nextCarousel: carousel,
      nextSlideIndex: Math.max(0, Math.min(options.activeSlideIndex, Math.max(0, carousel.slides.length - 1))),
      restoredFromSnapshot: true,
      toastMessage: '',
    };
  }

  // 1. Always preserve the outgoing format verbatim before leaving it
  const nextDrafts = snapshotFormatDraft(
    carousel.formatDrafts,
    currentFormat,
    carousel.slides,
    options.activeSlideIndex
  );

  const existingTarget = nextDrafts[nextFormat];
  const hasUsableTarget =
    Boolean(existingTarget && existingTarget.slides.length > 0) &&
    (nextFormat !== 'carousel' || (existingTarget?.slides.length ?? 0) >= 2);

  // 2. Restore saved format snapshot verbatim when returning to a previously edited format
  if (hasUsableTarget && existingTarget) {
    const restoredSlides = cloneSlides(existingTarget.slides);
    const nextSlideIndex = Math.max(
      0,
      Math.min(existingTarget.activeSlideIndex ?? 0, Math.max(0, restoredSlides.length - 1))
    );

    const nextReelConfig =
      nextFormat === 'reel'
        ? carousel.reelConfig ||
          convertCarouselToMotionReel(
            { ...carousel, slides: restoredSlides },
            options.theme,
            'marrok-slides',
            'bilingual'
          )
        : carousel.reelConfig;

    const labelMap: Record<PostFormat, string> = {
      carousel: `Restored your ${restoredSlides.length}-slide Carousel draft`,
      single: 'Restored your Single Slide draft',
      meme: 'Restored your Meme Studio draft',
      reel: 'Restored your 9:16 Motion Reel draft',
    };

    return {
      nextCarousel: {
        ...carousel,
        postFormat: nextFormat,
        slides: restoredSlides,
        formatDrafts: nextDrafts,
        ...(nextReelConfig ? { reelConfig: nextReelConfig } : {}),
        hookVariants: filterRelevantHookVariants(carousel.hookVariants, restoredSlides, carousel.category),
      },
      nextSlideIndex,
      restoredFromSnapshot: true,
      toastMessage: labelMap[nextFormat],
    };
  }

  // 3. First-time entry into `nextFormat` for this post — derive cleanly without mutating saved drafts
  const bestCarouselSlides =
    nextDrafts.carousel && nextDrafts.carousel.slides.length > 1
      ? nextDrafts.carousel.slides
      : carousel.slides.length > 1
      ? carousel.slides
      : null;

  if (nextFormat === 'single') {
    const sourceDeck: CarouselData = bestCarouselSlides
      ? { ...carousel, slides: cloneSlides(bestCarouselSlides) }
      : { ...carousel, slides: cloneSlides(carousel.slides) };
    const condensed = condenseCarouselToSingleSlide(sourceDeck);
    const singleSlides = applyDeckAwareAutoLayout(
      condensed.slides.map((s) => ({
        ...s,
        standaloneMeme: false,
        imageFrameMode: s.imageUrl
          ? s.imageFrameMode === 'standard'
            ? ('standard' as const)
            : ('hero' as const)
          : s.imageFrameMode,
      })),
      { postFormat: 'single', preserveAuthenticAiVisuals: false }
    );

    return {
      nextCarousel: {
        ...carousel,
        ...condensed,
        postFormat: 'single',
        slides: singleSlides,
        formatDrafts: nextDrafts,
        hookVariants: filterRelevantHookVariants(carousel.hookVariants, singleSlides, carousel.category),
      },
      nextSlideIndex: 0,
      restoredFromSnapshot: false,
      toastMessage: bestCarouselSlides
        ? 'Created Single Slide from your Carousel copy'
        : 'Switched to Single Slide Poster',
    };
  }

  if (nextFormat === 'meme') {
    const existingImageUrl =
      carousel.slides[options.activeSlideIndex]?.imageUrl ||
      carousel.slides[0]?.imageUrl ||
      bestCarouselSlides?.[0]?.imageUrl ||
      options.uploadedImage?.base64 ||
      '';
    const memeDeck = buildCleanMemeCarouselDeck(
      { ...carousel, slides: cloneSlides(carousel.slides) },
      existingImageUrl,
      options.uploadedImage?.name
    );

    return {
      nextCarousel: {
        ...memeDeck,
        postFormat: 'meme',
        formatDrafts: nextDrafts,
        hookVariants: filterRelevantHookVariants(carousel.hookVariants, memeDeck.slides, memeDeck.category),
      },
      nextSlideIndex: 0,
      restoredFromSnapshot: false,
      toastMessage: 'Switched to Dedicated Meme Studio (Carousel preserved)',
    };
  }

  if (nextFormat === 'reel') {
    const reelSourceSlides = bestCarouselSlides ? cloneSlides(bestCarouselSlides) : cloneSlides(carousel.slides);
    const nextReel =
      carousel.reelConfig ||
      convertCarouselToMotionReel(
        { ...carousel, slides: reelSourceSlides },
        options.theme,
        'marrok-slides',
        'bilingual'
      );

    return {
      nextCarousel: {
        ...carousel,
        postFormat: 'reel',
        slides: reelSourceSlides,
        reelConfig: nextReel,
        formatDrafts: nextDrafts,
      },
      nextSlideIndex: 0,
      restoredFromSnapshot: false,
      toastMessage: 'Switched to 9:16 Motion Reel Studio',
    };
  }

  // First-time expansion from Single/Meme -> Carousel (when no carousel snapshot existed yet)
  const currentFirst = carousel.slides[0];
  const richSeedParts = [
    options.promptInput?.trim(),
    currentFirst?.enTitle?.trim(),
    currentFirst?.enBody?.trim(),
    ...(currentFirst?.takeaways || []).map((t) => t.en?.trim()),
    carousel.sourceMeta?.title?.trim(),
    carousel.sourceMeta?.sourceSummary?.trim(),
    carousel.caption?.trim(),
  ].filter((part): part is string => Boolean(part && part.length > 0));
  const seedTopic = richSeedParts.join('\n').trim();

  try {
    const expanded = synthesizeCarousel({
      prompt: seedTopic,
      categoryHint: options.categoryHint,
      inputMode: options.activeTab === 'image' ? 'text' : options.activeTab || 'text',
      postFormat: 'carousel',
    });

    if (currentFirst && expanded.slides.length > 0) {
      expanded.slides[0] = {
        ...expanded.slides[0],
        enTitle: currentFirst.enTitle || expanded.slides[0].enTitle,
        arTitle: currentFirst.arTitle || expanded.slides[0].arTitle,
        enBody: currentFirst.enBody || expanded.slides[0].enBody,
        arBody: currentFirst.arBody || expanded.slides[0].arBody,
        ...(currentFirst.imageUrl ? { imageUrl: currentFirst.imageUrl } : {}),
      };
    }

    const autoExpandedSlides = applyDeckAwareAutoLayout(expanded.slides, {
      postFormat: 'carousel',
      preserveAuthenticAiVisuals: false,
    });

    return {
      nextCarousel: {
        ...carousel,
        postFormat: 'carousel',
        slides: autoExpandedSlides,
        formatDrafts: nextDrafts,
        hookVariants: filterRelevantHookVariants(
          expanded.hookVariants || carousel.hookVariants,
          autoExpandedSlides,
          carousel.category
        ),
      },
      nextSlideIndex: 0,
      restoredFromSnapshot: false,
      toastMessage: `Expanded into ${expanded.slides.length}-slide Carousel`,
    };
  } catch {
    // Source is too thin for autonomous synthesis (e.g., blank Meme card or short headline):
    // promote the current slide cleanly into an editable multi-slide Carousel without throwing or inventing filler claims.
    const promotedSlide1: SlideData = currentFirst
      ? {
          ...cloneSlideData(currentFirst),
          type: currentFirst.type === 'poster' ? (currentFirst.imageUrl ? 'image' : 'row') : currentFirst.type,
          standaloneMeme: false,
          takeaways: [],
          ...(currentFirst.imageUrl && currentFirst.imageFrameMode === 'full'
            ? { imageFrameMode: 'hero' as const }
            : {}),
        }
      : {
          type: 'row',
          storyRole: 'hook',
          enTitle: '',
          arTitle: '',
          enBody: '',
          arBody: '',
        };

    const takeawaySlides: SlideData[] = (currentFirst?.takeaways || [])
      .filter((t) => Boolean((t.en || '').trim() || (t.ar || '').trim()))
      .map((t) => ({
        type: 'row' as const,
        enTitle: t.en || '',
        arTitle: t.ar || '',
        enBody: '',
        arBody: '',
      }));

    const editableMiddleSlides: SlideData[] =
      takeawaySlides.length > 0
        ? takeawaySlides
        : [
            {
              type: 'row',
              enTitle: '',
              arTitle: '',
              enBody: '',
              arBody: '',
            },
          ];

    const ctaSlide: SlideData = {
      type: 'cta',
      enTitle: '',
      arTitle: '',
      enBody: '',
      arBody: '',
      ...(currentFirst?.enCredit ? { enCredit: currentFirst.enCredit } : {}),
      ...(currentFirst?.arCredit ? { arCredit: currentFirst.arCredit } : {}),
      ...(carousel.brandUrl ? { url: carousel.brandUrl } : {}),
    };

    const promotedSlides: SlideData[] = [promotedSlide1, ...editableMiddleSlides, ctaSlide];

    return {
      nextCarousel: {
        ...carousel,
        postFormat: 'carousel',
        slides: promotedSlides,
        formatDrafts: nextDrafts,
        hookVariants: filterRelevantHookVariants(
          carousel.hookVariants,
          promotedSlides,
          carousel.category
        ),
      },
      nextSlideIndex: 0,
      restoredFromSnapshot: false,
      toastMessage: `Switched to ${promotedSlides.length}-slide Carousel (ready to edit or generate)`,
    };
  }
}
