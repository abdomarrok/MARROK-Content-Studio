/**
 * Backward compatibility facade for Canvas Layout Awareness Engine.
 *
 * All implementation has been modularized into `src/lib/canvas/layout/`:
 * - `types.ts`: TextBlockLayout, GraphicCardLayout, SwipeCueLayout, ComputedSlideLayout
 * - `constants.ts`: Minimum clearances (MIN_GAP_*) between graphic, titles, bodies, and footer
 * - `compositionPresets.ts`: 1-click slide composition presets
 * - `measureCache.ts`: Context caching and layout memoization
 * - `ctaLayout.ts`: Dedicated CTA slide layout computation
 * - `slideLayoutEngine.ts`: Core slide layout awareness, vertical stacking & safe-zone fitting
 * - `dragClamp.ts`: Collision-free layout-aware element dragging and clamping
 */

export * from './layout/index.ts';
