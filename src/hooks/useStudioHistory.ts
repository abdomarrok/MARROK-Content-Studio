import React, { useState, useCallback, useRef } from 'react';

export interface UseStudioHistoryOptions<T> {
  maxDepth?: number;
  onUndo?: (restoredState: T) => void;
  onRedo?: (restoredState: T) => void;
  onChange?: (nextState: T, prevState: T) => void;
}

export interface UseStudioHistoryReturn<T> {
  state: T;
  pastHistory: T[];
  futureHistory: T[];
  canUndo: boolean;
  canRedo: boolean;
  setState: React.Dispatch<React.SetStateAction<T>>;
  replaceStateWithoutHistory: React.Dispatch<React.SetStateAction<T>>;
  undo: () => T | null;
  redo: () => T | null;
  clearHistory: () => void;
}

/**
 * Immutable ring-buffer Undo/Redo history hook (default 30 steps).
 * Uses synchronous ref mirrors so rapid consecutive updates or keyboard shortcuts
 * never read stale state closures.
 */
export function useStudioHistory<T>(
  initialValue: T | (() => T),
  options: UseStudioHistoryOptions<T> = {}
): UseStudioHistoryReturn<T> {
  const maxDepth = options.maxDepth ?? 30;

  const [state, setInternalState] = useState<T>(initialValue);
  const [pastHistory, setPastHistory] = useState<T[]>([]);
  const [futureHistory, setFutureHistory] = useState<T[]>([]);

  const stateRef = useRef<T>(state);
  stateRef.current = state;

  const pastRef = useRef<T[]>(pastHistory);
  pastRef.current = pastHistory;

  const futureRef = useRef<T[]>(futureHistory);
  futureRef.current = futureHistory;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const setState: React.Dispatch<React.SetStateAction<T>> = useCallback(
    (updaterOrValue) => {
      const prev = stateRef.current;
      const next =
        typeof updaterOrValue === 'function'
          ? (updaterOrValue as (prevState: T) => T)(prev)
          : updaterOrValue;

      if (next === prev) return;

      const nextPast = [...pastRef.current.slice(-(maxDepth - 1)), prev];
      stateRef.current = next;
      pastRef.current = nextPast;
      futureRef.current = [];

      setInternalState(next);
      setPastHistory(nextPast);
      setFutureHistory([]);

      optionsRef.current.onChange?.(next, prev);
    },
    [maxDepth]
  );

  const replaceStateWithoutHistory: React.Dispatch<React.SetStateAction<T>> = useCallback(
    (updaterOrValue) => {
      const prev = stateRef.current;
      const next =
        typeof updaterOrValue === 'function'
          ? (updaterOrValue as (prevState: T) => T)(prev)
          : updaterOrValue;

      stateRef.current = next;
      setInternalState(next);
    },
    []
  );

  const undo = useCallback((): T | null => {
    const oldPast = pastRef.current;
    if (oldPast.length === 0) return null;

    const previousState = oldPast[oldPast.length - 1];
    const remainingPast = oldPast.slice(0, -1);
    const current = stateRef.current;
    const nextFuture = [current, ...futureRef.current.slice(0, maxDepth - 1)];

    stateRef.current = previousState;
    pastRef.current = remainingPast;
    futureRef.current = nextFuture;

    setPastHistory(remainingPast);
    setFutureHistory(nextFuture);
    setInternalState(previousState);

    optionsRef.current.onUndo?.(previousState);
    return previousState;
  }, [maxDepth]);

  const redo = useCallback((): T | null => {
    const oldFuture = futureRef.current;
    if (oldFuture.length === 0) return null;

    const nextState = oldFuture[0];
    const remainingFuture = oldFuture.slice(1);
    const current = stateRef.current;
    const nextPast = [...pastRef.current.slice(-(maxDepth - 1)), current];

    stateRef.current = nextState;
    pastRef.current = nextPast;
    futureRef.current = remainingFuture;

    setFutureHistory(remainingFuture);
    setPastHistory(nextPast);
    setInternalState(nextState);

    optionsRef.current.onRedo?.(nextState);
    return nextState;
  }, [maxDepth]);

  const clearHistory = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    setPastHistory([]);
    setFutureHistory([]);
  }, []);

  return {
    state,
    pastHistory,
    futureHistory,
    canUndo: pastHistory.length > 0,
    canRedo: futureHistory.length > 0,
    setState,
    replaceStateWithoutHistory,
    undo,
    redo,
    clearHistory,
  };
}
