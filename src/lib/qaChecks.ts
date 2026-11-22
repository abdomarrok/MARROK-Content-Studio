/**
 * Backward compatibility facade for QA Engine.
 *
 * All implementation has been modularized into `src/lib/qa/`:
 * - `types.ts`: QA definitions & checklist types
 * - `constants.ts`: Character limits, boilerplate patterns, filler labels
 * - `textChecks.ts`: Punctuation, BiDi, character limits, translation fidelity
 * - `contentQualityChecks.ts`: Clichés, placeholders, duplicate body text
 * - `structuralChecks.ts`: Slide counts, safe zones, CTA, WCAG contrast, font floors
 * - `gathererQualityGate.ts`: Summary-only detector & candidate quality gate
 * - `qaEngine.ts`: Full deck QA runner (`runQAChecks`)
 * - `preExportChecklist.ts`: 12-point pre-export checklist (`runPreExportChecklist`)
 */

export * from './qa/index.ts';
