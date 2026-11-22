/**
 * Backward compatibility facade for Smart Visual Defaults Engine.
 *
 * All implementation has been modularized into `src/lib/synthesis/smartVisual/`:
 * - `constants.ts`: Stop words, filler tokens, placeholder patterns
 * - `textIcons.ts`: Logo/icon extraction, key phrase discovery, source-quoted hub nodes
 * - `subjectPairDetection.ts`: Two-system migration & before-after tech product detection
 * - `hookClaimCard.ts`: Non-numeric hook claim & contrast card construction
 * - `archetypeInference.ts`: Content scoring, archetype selection, diagram variant selection
 * - `visualDefaultsResolver.ts`: Smart slide visual defaults resolver
 * - `hookEngine.ts`: Slide 1 hook engine, outcome translation, headline fitting
 * - `deckDiversifier.ts`: Deck diversification, copy fitting, content quality cleaner
 */

export * from './smartVisual/index.ts';
