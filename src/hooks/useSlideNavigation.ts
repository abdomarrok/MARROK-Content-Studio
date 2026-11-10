import { useState, useEffect, useCallback, useRef } from 'react';

export interface UseSlideNavigationOptions {
  slidesCount: number;
  externalSlideIndex?: number;
  onSlideChange?: (index: number) => void;
}

export interface UseSlideNavigationReturn {
  currentSlideIndex: number;
  currentSlideIndexRef: React.MutableRefObject<number>;
  changeSlide: (
    indexOrUpdater: number | ((prev: number) => number),
    overrideSlidesCount?: number
  ) => void;
  nextSlide: () => void;
  prevSlide: () => void;
  firstSlide: () => void;
  lastSlide: () => void;
}

/**
 * Manages active slide cursor navigation with safe [0, slidesCount - 1] clamping,
 * external prop synchronization, and synchronous ref tracking.
 */
export function useSlideNavigation({
  slidesCount,
  externalSlideIndex,
  onSlideChange,
}: UseSlideNavigationOptions): UseSlideNavigationReturn {
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(() => {
    const initial = externalSlideIndex ?? 0;
    return Math.max(0, Math.min(Math.max(0, slidesCount - 1), initial));
  });

  const currentSlideIndexRef = useRef<number>(currentSlideIndex);
  currentSlideIndexRef.current = currentSlideIndex;

  const slidesCountRef = useRef<number>(slidesCount);
  slidesCountRef.current = slidesCount;

  const onSlideChangeRef = useRef(onSlideChange);
  onSlideChangeRef.current = onSlideChange;

  // Sync with external slide index changes (e.g. ContactSheetModal thumbnail click)
  useEffect(() => {
    if (
      externalSlideIndex !== undefined &&
      externalSlideIndex !== currentSlideIndexRef.current
    ) {
      const clamped = Math.max(
        0,
        Math.min(Math.max(0, slidesCount - 1), externalSlideIndex)
      );
      currentSlideIndexRef.current = clamped;
      setCurrentSlideIndex(clamped);
    }
  }, [externalSlideIndex, slidesCount]);

  // Clamp if slidesCount shrinks below currentSlideIndex
  useEffect(() => {
    const maxIdx = Math.max(0, slidesCount - 1);
    if (currentSlideIndexRef.current > maxIdx) {
      currentSlideIndexRef.current = maxIdx;
      setCurrentSlideIndex(maxIdx);
      onSlideChangeRef.current?.(maxIdx);
    }
  }, [slidesCount]);

  const changeSlide = useCallback(
    (
      indexOrUpdater: number | ((prev: number) => number),
      overrideSlidesCount?: number
    ) => {
      const prev = currentSlideIndexRef.current;
      const next =
        typeof indexOrUpdater === 'function'
          ? indexOrUpdater(prev)
          : indexOrUpdater;
      const maxCount = overrideSlidesCount ?? slidesCountRef.current;
      const clamped = Math.max(0, Math.min(Math.max(0, maxCount - 1), next));
      currentSlideIndexRef.current = clamped;
      setCurrentSlideIndex(clamped);
      if (clamped !== prev) {
        onSlideChangeRef.current?.(clamped);
      }
    },
    []
  );

  const nextSlide = useCallback(() => {
    changeSlide((prev) => prev + 1);
  }, [changeSlide]);

  const prevSlide = useCallback(() => {
    changeSlide((prev) => prev - 1);
  }, [changeSlide]);

  const firstSlide = useCallback(() => {
    changeSlide(0);
  }, [changeSlide]);

  const lastSlide = useCallback(() => {
    changeSlide(Math.max(0, slidesCountRef.current - 1));
  }, [changeSlide]);

  return {
    currentSlideIndex,
    currentSlideIndexRef,
    changeSlide,
    nextSlide,
    prevSlide,
    firstSlide,
    lastSlide,
  };
}
