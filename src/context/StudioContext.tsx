import React, { createContext, useContext } from 'react';
import type { CarouselData, SlideData, ThemePalette, PostFormat } from '../types.ts';

export interface StudioContextValue {
  carousel: CarouselData;
  currentSlide: SlideData;
  currentSlideIndex: number;
  theme: ThemePalette;
  activePostFormat: PostFormat;
  changeSlide: (
    indexOrUpdater: number | ((prev: number) => number),
    overrideSlidesCount?: number
  ) => void;
  updateCurrentSlide: (updater: (slide: SlideData) => SlideData) => void;
  updateCarousel: React.Dispatch<React.SetStateAction<CarouselData>>;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export const StudioProvider: React.FC<{
  value: StudioContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => {
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
};

export function useStudioContext(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error('useStudioContext must be used within a <StudioProvider>');
  }
  return ctx;
}

export function useOptionalStudioContext(): StudioContextValue | null {
  return useContext(StudioContext);
}
