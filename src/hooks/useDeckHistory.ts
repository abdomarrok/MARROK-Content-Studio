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
  const hasHistoryPastRef = useRef<boolean>(false);
  hasHistoryPastRef.current = historyPast.length > 0;

  const applyDeckUpdate = useCallback(
    (updater: (prev: CarouselData) => CarouselData) => {
      deckRevisionRef.current += 1;
      onUpdateCarousel((prev) => {
        const next = updater(prev);
        if (next !== prev) {
          if (!hasHistoryPastRef.current) {
            beforeEditsDeckRef.current = prev;
          }
          setHistoryPast((h) => [...h.slice(-(maxDepth - 1)), prev]);
          setHistoryFuture([]);
        }
        return next;
      });
    },
    [onUpdateCarousel, maxDepth]
  );

  const handleUndo = useCallback(() => {
    if (historyPast.length === 0) return;
    const previousDeck = historyPast[historyPast.length - 1];
    setHistoryPast((h) => h.slice(0, -1));
    setHistoryFuture((f) => [carousel, ...f.slice(0, maxDepth - 1)]);
    deckRevisionRef.current += 1;
    onUpdateCarousel(previousDeck);
    onShowToast('Undid last change');
  }, [historyPast, carousel, onUpdateCarousel, onShowToast, maxDepth]);

  const handleRedo = useCallback(() => {
    if (historyFuture.length === 0) return;
    const nextDeck = historyFuture[0];
    setHistoryFuture((f) => f.slice(1));
    setHistoryPast((h) => [...h.slice(-(maxDepth - 1)), carousel]);
    deckRevisionRef.current += 1;
    onUpdateCarousel(nextDeck);
    onShowToast('Redid change');
  }, [historyFuture, carousel, onUpdateCarousel, onShowToast, maxDepth]);

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
