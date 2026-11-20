/**
 * Mathematical utilities for the MARROK Motion Reel engine.
 */
export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
