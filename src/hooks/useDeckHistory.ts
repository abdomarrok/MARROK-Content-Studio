import { useState, useCallback, useRef } from 'react';
import type { CarouselData } from '../types.ts';

export interface UseDeckHistoryOptions {
  carousel: CarouselData;
  onUpdateCarousel: React.Dispatch<React.SetStateAction<CarouselData>>;
  onShowToast: (msg: string) => void;
  maxDepth?: number;
}

export interface UseDeckHistoryReturn {
  historyPast: CarouselData[];
  historyFuture: CarouselData[];
  canUndo: boolean;
  canRedo: boolean;
  isComparingBefore: boolean;
  setIsComparingBefore: React.Dispatch<React.SetStateAction<boolean>>;
  beforeEditsDeckRef: React.MutableRefObject<CarouselData>;
  deckRevisionRef: React.MutableRefObject<number>;
  applyDeckUpdate: (updater: (prev: CarouselData) => CarouselData) => void;
  handleUndo: () => void;
  handleRedo: () => void;
}

/**
 * Cohesive hook managing deck mutation history, ring-buffered Undo/Redo,
 * and Compare-Before state for the AutonomousStudio canvas.
 */
export function useDeckHistory({
  carousel,
  onUpdateCarousel,
  onShowToast,
  maxDepth = 24,
}: UseDeckHistoryOptions): UseDeckHistoryReturn {
  const [historyPast, setHistoryPast] = useState<CarouselData[]>([]);
  const [historyFuture, setHistoryFuture] = useState<CarouselData[]>([]);
  const [isComparingBefore, setIsComparingBefore] = useState(false);

  const beforeEditsDeckRef = useRef<CarouselData>(carousel);
  const deckRevisionRef = useRef<number>(0);
  const hasHistoryPastRef = useRef<boolean>(historyPast.length > 0);
  const pastRef = useRef<CarouselData[]>(historyPast);
  pastRef.current = historyPast;
  const futureRef = useRef<CarouselData[]>(historyFuture);
  futureRef.current = historyFuture;
  const carouselRef = useRef<CarouselData>(carousel);
  carouselRef.current = carousel;

  const applyDeckUpdate = useCallback(
    (updater: (prev: CarouselData) => CarouselData) => {
      deckRevisionRef.current += 1;
      onUpdateCarousel((prev) => {
        const next = updater(prev);
        if (next !== prev) {
          if (!hasHistoryPastRef.current) {
            beforeEditsDeckRef.current = prev;
            hasHistoryPastRef.current = true;
          }
          const nextPast = [...pastRef.current.slice(-(maxDepth - 1)), prev];
          pastRef.current = nextPast;
          futureRef.current = [];
          setHistoryPast(nextPast);
          setHistoryFuture([]);
        }
        return next;
      });
    },
    [onUpdateCarousel, maxDepth]
  );

  const handleUndo = useCallback(() => {
    const currentPast = pastRef.current;
    if (currentPast.length === 0) return;
    const previousDeck = currentPast[currentPast.length - 1];
    const nextPast = currentPast.slice(0, -1);
    const nextFuture = [carouselRef.current, ...futureRef.current.slice(0, maxDepth - 1)];

    pastRef.current = nextPast;
    futureRef.current = nextFuture;
    hasHistoryPastRef.current = nextPast.length > 0;

    setHistoryPast(nextPast);
    setHistoryFuture(nextFuture);
    deckRevisionRef.current += 1;
    onUpdateCarousel(previousDeck);
    onShowToast('Undid last change');
  }, [onUpdateCarousel, onShowToast, maxDepth]);

  const handleRedo = useCallback(() => {
    const currentFuture = futureRef.current;
    if (currentFuture.length === 0) return;
    const nextDeck = currentFuture[0];
    const nextFuture = currentFuture.slice(1);
    const nextPast = [...pastRef.current.slice(-(maxDepth - 1)), carouselRef.current];

    futureRef.current = nextFuture;
    pastRef.current = nextPast;
    hasHistoryPastRef.current = true;

    setHistoryFuture(nextFuture);
    setHistoryPast(nextPast);
    deckRevisionRef.current += 1;
    onUpdateCarousel(nextDeck);
    onShowToast('Redid change');
  }, [onUpdateCarousel, onShowToast, maxDepth]);

  return {
    historyPast,
    historyFuture,
    canUndo: historyPast.length > 0,
    canRedo: historyFuture.length > 0,
    isComparingBefore,
    setIsComparingBefore,
    beforeEditsDeckRef,
    deckRevisionRef,
    applyDeckUpdate,
    handleUndo,
    handleRedo,
  };
}
