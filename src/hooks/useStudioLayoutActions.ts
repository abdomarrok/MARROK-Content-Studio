import { useCallback } from 'react';
import type {
  CarouselData,
  ElementLayoutOverride,
  GraphicalElementId,
  SlideData,
} from '../types.ts';
import { sanitizeSlide } from '../lib/textSanitizer.ts';
import { CHAR_LIMITS } from '../lib/qaChecks.ts';
import { autoPolishHeadline, autoFitTextToLimits } from '../lib/text/headlines.ts';
import { fixArabicPunctuation } from '../lib/text/arabicBiDi.ts';

export const isDefaultLayoutOverride = (
  override: ElementLayoutOverride | null | undefined
): boolean =>
  !override ||
  ((override.dx === 0 || override.dx === undefined) &&
    (override.dy === 0 || override.dy === undefined) &&
    (override.scale === 1 || override.scale === undefined) &&
    (override.opacity === 1 || override.opacity === undefined) &&
    (override.align === 'center' || override.align === undefined) &&
    !override.hidden);

export interface UseStudioLayoutActionsOptions {
  carousel: CarouselData;
  currentSlideIndex: number;
  applyDeckUpdate: (updater: (prev: CarouselData) => CarouselData) => void;
  onShowToast: (msg: string) => void;
  setSelectedElementId?: (id: GraphicalElementId | null) => void;
}

export interface UseStudioLayoutActionsReturn {
  handleUpdateElementLayoutOverride: (
    elementId: GraphicalElementId,
    override: ElementLayoutOverride | null
  ) => void;
  handleUpdateSlideFields: (updates: Partial<SlideData>) => void;
  handleUpdateCurrentSlide: <K extends keyof SlideData>(field: K, value: SlideData[K]) => void;
  handleDeleteCanvasElement: (elementId: GraphicalElementId) => void;
  handleAutoFitCurrentSlide: () => void;
  handleResetSlideLayoutOverrides: () => void;
  handleApplyOverrideToAllSlides: (
    elementId: GraphicalElementId,
    override: ElementLayoutOverride | null
  ) => void;
  handleApplySlideLayoutToAllSlides: () => void;
}

/**
 * Cohesive hook for canvas element layout overrides, slide field updates,
 * layout reset, auto-fit copy, visual locks, and deck-wide layout synchronization.
 */
export function useStudioLayoutActions({
  carousel,
  currentSlideIndex,
  applyDeckUpdate,
  onShowToast,
  setSelectedElementId,
}: UseStudioLayoutActionsOptions): UseStudioLayoutActionsReturn {
  const handleUpdateElementLayoutOverride = useCallback(
    (elementId: GraphicalElementId, override: ElementLayoutOverride | null) => {
      applyDeckUpdate((prev) => {
        const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
        if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
        const current = prev.slides[targetIndex];
        const existingOverrides = { ...(current.layoutOverrides || {}) };
        if (isDefaultLayoutOverride(override)) {
          delete existingOverrides[elementId];
        } else if (override) {
          existingOverrides[elementId] = override;
        }
        const newSlides = [...prev.slides];
        newSlides[targetIndex] = {
          ...current,
          layoutOverrides: Object.keys(existingOverrides).length > 0 ? existingOverrides : undefined,
        };
        return { ...prev, slides: newSlides };
      });
    },
    [currentSlideIndex, applyDeckUpdate]
  );

  const handleUpdateSlideFields = useCallback(
    (updates: Partial<SlideData>) => {
      applyDeckUpdate((prev) => {
        const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
        if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
        const newSlides = [...prev.slides];
        newSlides[targetIndex] = sanitizeSlide(
          {
            ...newSlides[targetIndex],
            ...updates,
          },
          targetIndex,
          prev.slides.length
        );
        return {
          ...prev,
          slides: newSlides,
          sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
        };
      });
    },
    [currentSlideIndex, applyDeckUpdate]
  );

  const handleUpdateCurrentSlide = useCallback(
    <K extends keyof SlideData>(field: K, value: SlideData[K]) => {
      applyDeckUpdate((prev) => {
        const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
        if (targetIndex < 0) return prev;

        const currentSlideSnapshot = prev.slides[targetIndex];
        let nextOverrides = currentSlideSnapshot.layoutOverrides;
        if (field === 'takeaways' && Array.isArray(value) && value.length === 0 && nextOverrides?.takeawaysBlock) {
          const cleaned = { ...nextOverrides };
          delete cleaned.takeawaysBlock;
          nextOverrides = Object.keys(cleaned).length > 0 ? cleaned : undefined;
        }

        const newSlides = [...prev.slides];
        newSlides[targetIndex] = sanitizeSlide(
          {
            ...currentSlideSnapshot,
            [field]: value,
            layoutOverrides: nextOverrides,
          },
          targetIndex,
          prev.slides.length
        );

        return {
          ...prev,
          slides: newSlides,
          sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
        };
      });
    },
    [currentSlideIndex, applyDeckUpdate]
  );

  const handleDeleteCanvasElement = useCallback(
    (elementId: GraphicalElementId) => {
      if (elementId === 'takeawaysBlock') {
        applyDeckUpdate((prev) => {
          const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
          if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
          const current = prev.slides[targetIndex];
          const nextOverrides = { ...(current.layoutOverrides || {}) };
          delete nextOverrides.takeawaysBlock;
          const newSlides = [...prev.slides];
          newSlides[targetIndex] = {
            ...current,
            takeaways: [],
            layoutOverrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined,
          };
          return { ...prev, slides: newSlides };
        });
        setSelectedElementId?.(null);
        onShowToast('Removed Takeaways card from slide');
        return;
      }

      const current = carousel.slides[currentSlideIndex];
      const existing = current?.layoutOverrides?.[elementId] || {};
      handleUpdateElementLayoutOverride(elementId, {
        ...existing,
        hidden: true,
      });
      setSelectedElementId?.(null);
      onShowToast(`Removed ${elementId} from slide`);
    },
    [carousel.slides, currentSlideIndex, applyDeckUpdate, handleUpdateElementLayoutOverride, onShowToast, setSelectedElementId]
  );

  const handleAutoFitCurrentSlide = useCallback(() => {
    let didChange = false;
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      const slide = prev.slides[targetIndex];
      if (!slide) return prev;
      const isHook = targetIndex === 0 || slide.type === 'hub';
      const enTitleLimit = isHook ? CHAR_LIMITS.hookTitle : CHAR_LIMITS.enTitle;
      const arTitleLimit = isHook ? CHAR_LIMITS.hookArTitle : CHAR_LIMITS.arTitle;

      const fittedSlide = sanitizeSlide(
        {
          ...slide,
          enTitle: autoFitTextToLimits(autoPolishHeadline(slide.enTitle || ''), enTitleLimit),
          arTitle: autoFitTextToLimits(fixArabicPunctuation(slide.arTitle || ''), arTitleLimit),
          enBody: autoFitTextToLimits(slide.enBody || '', CHAR_LIMITS.enBody),
          arBody: autoFitTextToLimits(fixArabicPunctuation(slide.arBody || ''), CHAR_LIMITS.arBody),
        },
        targetIndex,
        prev.slides.length
      );

      if (
        (fittedSlide.enTitle || '') === (slide.enTitle || '') &&
        (fittedSlide.arTitle || '') === (slide.arTitle || '') &&
        (fittedSlide.enBody || '') === (slide.enBody || '') &&
        (fittedSlide.arBody || '') === (slide.arBody || '')
      ) {
        return prev;
      }

      didChange = true;
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = fittedSlide;
      return { ...prev, slides: newSlides };
    });
    if (didChange) {
      onShowToast('Auto-fitted title and body copy within character limits');
    }
  }, [currentSlideIndex, applyDeckUpdate, onShowToast]);

  const handleResetSlideLayoutOverrides = useCallback(() => {
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = {
        ...newSlides[targetIndex],
        layoutOverrides: undefined,
        compositionPreset: 'standard',
        freeMoveLayout: false,
        imageZoom: undefined,
        imagePanX: undefined,
        imagePanY: undefined,
      };
      return { ...prev, slides: newSlides };
    });
    onShowToast('Reset all layout overrides on this slide');
  }, [currentSlideIndex, applyDeckUpdate, onShowToast]);

  const handleApplyOverrideToAllSlides = useCallback(
    (elementId: GraphicalElementId, override: ElementLayoutOverride | null) => {
      applyDeckUpdate((prev) => {
        const newSlides = prev.slides.map((s) => {
          if (s.manualLayoutLocked) return s;
          const existingOverrides = { ...(s.layoutOverrides || {}) };
          if (isDefaultLayoutOverride(override)) {
            delete existingOverrides[elementId];
          } else if (override) {
            existingOverrides[elementId] = { ...override };
          }
          return {
            ...s,
            layoutOverrides: Object.keys(existingOverrides).length > 0 ? existingOverrides : undefined,
          };
        });
        return { ...prev, slides: newSlides };
      });
      onShowToast(`Applied ${elementId} layout to unlocked slides`);
    },
    [applyDeckUpdate, onShowToast]
  );

  const handleApplySlideLayoutToAllSlides = useCallback(() => {
    let lockedSkipped = 0;
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      const sourceSlide = prev.slides[targetIndex];
      if (!sourceSlide) return prev;
      const clonedOverrides = sourceSlide.layoutOverrides
        ? structuredClone(sourceSlide.layoutOverrides)
        : undefined;
      const newSlides = prev.slides.map((s, idx) => {
        if (idx === targetIndex) return s;
        if (s.manualLayoutLocked) {
          lockedSkipped += 1;
          return s;
        }
        // Preserve CTA slide layout unless source is also CTA
        if (s.type === 'cta' && sourceSlide.type !== 'cta') return s;
        return {
          ...s,
          compositionPreset: sourceSlide.compositionPreset,
          freeMoveLayout: sourceSlide.freeMoveLayout,
          diagramVariant:
            s.type === 'row' && sourceSlide.type === 'row' && sourceSlide.diagramVariant
              ? sourceSlide.diagramVariant
              : s.diagramVariant,
          layoutOverrides: clonedOverrides ? structuredClone(clonedOverrides) : undefined,
        };
      });
      return {
        ...prev,
        visualOptions: {
          showCadReticles: prev.visualOptions?.showCadReticles ?? true,
          showSparklines: prev.visualOptions?.showSparklines ?? true,
          terminalScanlines: prev.visualOptions?.terminalScanlines ?? true,
        },
        slides: newSlides,
      };
    });
    onShowToast(
      lockedSkipped > 0
        ? `Synced grid, node style, spacing & type scale (${lockedSkipped} Cascade-Locked slide(s) protected)`
        : 'Synced grid, node style, spacing & type scale across deck'
    );
  }, [currentSlideIndex, applyDeckUpdate, onShowToast]);

  return {
    handleUpdateElementLayoutOverride,
    handleUpdateSlideFields,
    handleUpdateCurrentSlide,
    handleDeleteCanvasElement,
    handleAutoFitCurrentSlide,
    handleResetSlideLayoutOverrides,
    handleApplyOverrideToAllSlides,
    handleApplySlideLayoutToAllSlides,
  };
}
