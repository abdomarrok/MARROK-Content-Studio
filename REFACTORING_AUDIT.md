# MARROK Studio — Technical Debt & Refactoring Audit

**Auditor role:** Senior Refactoring Specialist
**Scope:** `api/`, `src/`, `netlify/functions/`, build + type config
**Method:** static scan of all 192 TS/TSX files (77,120 LOC), export-reference analysis, duplicate-symbol graph, async/loop analysis, render-path review, config review.

---

## 0. Executive Summary

The codebase is **functionally strong but structurally heavy**. Correctness, security and provider failover are well engineered. The debt is concentrated in four places:

1. **No TypeScript `strict` mode** — the root cause behind most type-safety debt.
2. **A few mega-files/mega-components** that absorb unrelated responsibilities.
3. **No lint layer** — `npm run lint` is just `tsc --noEmit`, so no rule catches floating promises, unused vars, exhaustive deps, or `any`.
4. **Ad-hoc HTTP handling** — 74 raw `await fetch(...)` call sites with re-implemented retry/timeout/error logic.

### Metrics

| Metric | Value |
|---|---|
| TS/TSX files (all) | 192 |
| Non-test files / LOC | 157 / 69,204 |
| React components | 44 |
| Test files | 46 |
| `strict` mode | **disabled** |
| Explicit `: any` / `as any` | 17 / 7 |
| `@ts-ignore` / `@ts-expect-error` | 7 |
| Empty `catch {}` blocks | 104 |
| Raw `await fetch(` sites | 74 |
| `console.*` calls (non-test) | 75 |
| `React.FC` components | 42 |
| `React.memo` components | **0** |
| Dead exports (verified) | 22 |
| Dead files | 1 |
| Largest file | 4,148 lines (`bundledSavedPosts.ts`) |
| Largest component | 3,048 lines / 39 `useState` (`AutonomousStudio.tsx`) |

---

## 1. Top Findings (severity-ranked)

### 🔴 C1 — TypeScript `strict` is off (`tsconfig.json:1-27`)
There is no `"strict": true`, no `strictNullChecks`, `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, or `noUncheckedIndexedAccess`.

**Impact:** `undefined` dereferences, silent `any` inference, unused imports, and the 22 dead exports below all pass CI unnoticed. Every downstream type finding in this report is a symptom of this one line.

**Fix:** enable `"strict": true` and add `noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch`. Expect a burst of errors; land it behind a `tsconfig.strict.json` and burn it down per-directory (`src/lib/canvas` → `src/lib/synthesis` → `api/` → components last).

---

### 🔴 C2 — 225 KB seed JSON statically imported into the serverless API (`api/controllers/postsController.ts:19`)
`import { BUNDLED_SAVED_POSTS } from '../../src/lib/storage/bundledSavedPosts.ts'` pulls a **4,148-line / 225 KB literal** into every serverless bundle and cold start, including `/api/health` and auth routes.

**Impact:** cold-start latency + memory on Vercel/Netlify; the file also appears in the Vercel 12-file function constraint surface.

**Fix:** move the seed to `data/seed-posts.json` (already have `resolveJsonModule: true`) and `await import()` it lazily inside `getBundledSeedPosts()`; or read it from disk in the same fallback branch. Client already does the right thing (`postsVaultClient.ts:59` dynamic import + Vite `manualChunks` split at `vite.config.ts:40`).

---

### 🔴 C3 — Mega-context causes full-tree re-renders on every keystroke (`src/components/AutonomousStudio.tsx:2216-2235`, `src/context/StudioContext.tsx:1-42`)
`studioContextValue` is memoized but depends on the **entire `carousel` object**, so every debounced text edit (150 ms) invalidates the context and re-renders all consumers. `AutonomousStudio` itself holds **39 `useState`** hooks (`:234-2191`) and none of the ~90 handlers are wrapped in `useCallback`, so even if children were memoized it would not help (`React.memo` is used **0 times**).

**Impact:** typing latency on mid-range Android; `ViewportCanvas`, `PostManagerPanel`, `PublishingHubWorkspace`, `ThemeCustomizer` all re-render on unrelated state.

**Fix:** split into three contexts (`DeckContext`, `SelectionContext`, `UIContext`) and/or migrate to a tiny external store (`useSyncExternalStore`) with selector subscriptions. Memoize `currentSlide` with `useMemo` on `[carousel.slides, currentSlideIndex]`.

---

### 🟠 H1 — Rate limiting is in-memory and therefore ineffective on serverless (`api/config.ts:289-311`)
`createRateLimiter` uses `const hits = new Map<string, number[]>()` module-level. On Vercel/Netlify each invocation may get a fresh instance, so the 30 rpm limit is per-instance, not per-IP.

**Fix:** atomic counter in Postgres (`INSERT ... ON CONFLICT DO UPDATE`) or Upstash Redis `INCR + EXPIRE`, with the in-memory map as a fast local fallback.

---

### 🟠 H2 — 104 swallowed `catch {}` blocks
Most are intentional offline fallbacks, but they erase diagnosability: file store, KV, Postgres, remote vault sync, Cloudinary cleanup all fail silently.

**Fix:** route through one `safeAsync(label, fn, { fallback })` helper that logs at `warn` with a correlation id once and returns a typed `Result`.

---

### 🟠 H3 — Publish dispatch is not idempotent (`api/controllers/publishController.ts:1333-1768`)
No `dispatchFingerprint`, no lock. Double-submit → duplicate live posts. `upsertSingleStoredPost` runs **after** provider success (`:1745`), so a crash loses remote IDs.

**Fix:** transactional outbox + unique index on `(post_id, dispatch_fingerprint, target)`.

---

### 🟠 H4 — `any` escapes the deck model (`src/components/AutonomousStudio.tsx:1211`)
```ts
const handleUpdateCurrentSlide = (field: keyof SlideData, value: any) => {
```
This is the single write path for all slide edits; `any` here defeats `SlideData` typing everywhere downstream.

**Fix:** `value: SlideData[keyof SlideData]` or a discriminated updater `(field, value)` generic.

---

### 🟡 M1 — No ESLint / Prettier
`"lint": "tsc --noEmit"` means no `eslint-plugin-react-hooks` (`exhaustive-deps`), `no-floating-promises`, `no-explicit-any`, `import/no-cycle`, `unicorn/no-array-for-each`. This is the cheapest quality lever available.

---

### 🟡 M2 — `experimentalDecorators` / `useDefineForClassFields: false` / `allowJs` are dead config
No decorators exist in the codebase (the 3 `^\s*@` matches are watermark strings and a CSS `@import`). Remove all three; they mislead editors and tooling.

---

## 2. DRY — Redundant Logic to Abstract

| # | Duplication | Evidence | Recommendation |
|---|---|---|---|
| D1 | **74 raw `fetch` call sites**, each re-implementing timeout, auth headers, JSON parse, error normalization | `publishController.ts`, `postsController.ts`, `proxyController.ts`, `gatherClient.ts`, `publishClient.ts`, `mediaController.ts` | One `httpClient` with `{ timeoutMs, retries, backoff, headers, parse }`. `src/lib/network/requestDeadline.ts` already exists — use it as the base. |
| D2 | **Retry loops re-implemented 3×** | `publishController.ts:110-172`, `publishClient.ts:473-500`, `imageController.ts` model loop | `withRetry(fn, { attempts, backoffMs, shouldRetry })` |
| D3 | **Three brand/icon registries** | `techLogos.ts` (`TECH_ICONS_LIST` + `KNOWN_TECH_LOGOS`, jsDelivr URLs), `bundledTechSvgs.ts` (bundled `simple-icons`), `icons.ts` (`ICONS_REGISTRY` + re-exports) | One registry with `{ slug, title, aliases, color, svgPath?, cdnUrl? }`; derive the other views. Today a brand can exist in one registry and not the other. |
| D4 | **`slideText` helper duplicated in 5 modules** | `renderRow.ts`, `enrichment.ts`, `pacing.ts`, `singleSlideCondenser.ts`, `riskChecks.ts` | Extract to `src/lib/text/slideText.ts`. |
| D5 | **`clamp` duplicated** | `src/lib/motion/base.ts:16` and `src/lib/motion/transitions.ts:39` | Import from one module. (The copies inside `CORE_UTILS`/chrome template strings are intentional — self-contained HTML export — and should stay.) |
| D6 | **Deep clone via `JSON.parse(JSON.stringify())` at 5 production sites** | `generateController.ts:118,124,548`, `AutonomousStudio.tsx:585,603,1402`, `gatherClient.ts` | `structuredClone()` (used **0 times**, available in Node 22 + modern browsers). |
| D7 | **Post validation spread across three layers** | `src/lib/validation/carousel.ts`, `postsController.validateAndBuildPostRecord`, `qaChecks.ts` | Keep `validation/carousel.ts` as the single schema authority; have QA consume its normalized output instead of re-walking the deck. |
| D8 | **HTML stripping implemented per-controller** | `stripHtmlToCleanText` (`mediaController.ts:448`) re-used implicitly by gather paths | Move to `src/lib/text/html.ts` and share with `gatherClient`. |

> **Not duplication (verified):** `hexToRgba` at `marrokSlideChrome.ts:21` and `:636` — the second lives inside the standalone HTML template string and must remain self-contained. Same for `drawMarrokVectorBadge` at `:644`.

---

## 3. Pruning — Dead Code (verified: exactly one occurrence repo-wide)

### Dead files
- `src/components/PlanInspectorModal.tsx` — entire component never imported.

### Dead exports (22)

| Symbol | Location |
|---|---|
| `countPostgresPosts` | `api/db/postgres.ts:212` |
| `useOptionalStudioContext` | `src/context/StudioContext.tsx:35` |
| `PRESET_CAROUSELS` | `src/lib/presets.ts:208` |
| `qaReportSummary` | `src/lib/qaChecks.ts:2091` |
| `TECH_ICON_META_BY_KEY` | `src/lib/techLogos.ts:77` |
| `CategoryType` | `src/types.ts:4` |
| `ThemeConfig` | `src/types.ts:439` |
| `ChannelRoutingMode` | `src/lib/publish/publishClient.ts:18` |
| `ExtractedUrlPayload` | `api/controllers/mediaController.ts:122` |
| `fetchSafeUrlHtml` | `api/controllers/mediaController.ts:1286` |
| `shareSlide` | `src/lib/canvas/exporter.ts:174` |
| `trackBlobUrl` | `src/lib/media/blobUrlRegistry.ts:9` |
| `getNextUpcomingPeakSlot` | `src/lib/publish/publishClient.ts:846` |
| `acceptGatheredCandidatesIntoSchedule` | `src/lib/gather/gatherClient.ts:971` |
| `loadBrand` | `src/lib/motion/base.ts:106` |
| `saveBrand` | `src/lib/motion/base.ts:119` |
| `TRANSITION_WINDOW` | `src/lib/motion/transitions.ts:9` |
| `MIN_GAP_TO_FOOTER` | `src/lib/canvas/layoutAwareness.ts:29` |
| `FONT_MONO` | `src/lib/canvas/constants.ts:35` |
| `SAFE_MAX_Y` | `src/lib/canvas/constants.ts:25` |
| `SUPPORTED_VIDEO_MIME_TYPES` | `src/lib/canvas/constants.ts:251` |
| `FULL_MEME_CARD_X` | `src/lib/canvas/constants.ts:337` |

> `SAFE_MAX_Y` and `MIN_GAP_TO_FOOTER` are documented in AGENTS.md but unused in code — either wire them into `layoutAwareness` (they read as intended guards) or delete them and the docs.
> `loadBrand`/`saveBrand` suggest an abandoned Motion brand-persistence feature; `blobUrlRegistry.trackBlobUrl` suggests an abandoned leak-tracking feature — decide, don't leave.

### Unused imports / parameters
Not detectable today because `noUnusedLocals`/`noUnusedParameters` are off. Enabling them (see C1) will surface the real list; expect ~20-40 hits.

---

## 4. Modernization

| # | Issue | Evidence | Action |
|---|---|---|---|
| M1 | `strict` off | `tsconfig.json` | Enable (C1) |
| M2 | Dead TS flags | `experimentalDecorators: true`, `useDefineForClassFields: false`, `allowJs: true` | Remove |
| M3 | `target: ES2022` on Node ≥22 | `tsconfig.json` | Move to `ES2023`/`ES2024` (enables `findLast`, `toSorted`, `Object.groupBy`) |
| M4 | `React.FC` everywhere (42×) | e.g. `StudioContext.tsx:20` | React 19: use plain typed props; `FC` no longer adds value and historically added implicit `children` |
| M5 | `JSON.parse(JSON.stringify())` cloning | 5 sites | `structuredClone()` |
| M6 | String surgery without `replaceAll` (0 uses) | sanitizers | `String.prototype.replaceAll` for literal patterns (keep regex where needed) |
| M7 | Express 4.21 | `package.json` | Plan Express 5 migration separately (async error propagation); not urgent |
| M8 | No linter/formatter | `package.json` scripts | Add ESLint 9 flat config + Prettier; enforce in CI |
| M9 | Google Fonts `@import` injected into standalone reel HTML | `src/lib/motion/base.ts:136` | Self-host or make it optional; current export requires network to render correct typography |
| M10 | 118 emoji glyphs in source strings | UI copy | Cosmetic only; ensure they are not used as icon substitutes |
| M11 | `window.setTimeout` mixed with bare `setTimeout` | `AutonomousStudio.tsx:636` | Standardize |

---

## 5. Efficiency

### Verified positives (state them, don't "fix" them)
- **No classic N+1 in Postgres.** Batch upsert uses a single `UNNEST` statement inside `BEGIN/COMMIT` (`api/db/postgres.ts:349-427`). Pool is a singleton, max 5 (`:36-60`).
- **Hacker News fan-out is parallelized** with `Promise.all` (`mediaController.ts:484-495`), not sequential.
- **Client seed vault is code-split** (`vite.config.ts:40`, `postsVaultClient.ts:59`).
- **In-flight coalescing** prevents duplicate AI spend (`generateController.ts:531-562`).

### Real issues

| # | Issue | Evidence | Impact | Fix |
|---|---|---|---|---|
| E1 | Whole-vault load on every request/action; no cache | `loadStoredPosts` (`postsController.ts:362-440`) runs the 4-layer fallback chain (Postgres → KV → file → remote) per call; `handleDispatchPublish:1360` loads **all** posts just to compute quota | O(vault) latency and transfer per action | Add a short-TTL request cache + `SELECT COUNT(*)`/targeted `WHERE id =` instead of full scans |
| E2 | `GET /api/posts` has no pagination/limit | `handleListPosts` (`postsController.ts:840`) | Payload grows with vault (already hundreds of seed records) | `?limit&cursor`; return counts separately |
| E3 | 225 KB static seed in API bundle | C2 | cold start / memory | lazy import |
| E4 | Mega-context re-renders | C3 | input latency | split contexts / store |
| E5 | 1 Hz clock re-renders the whole Post Manager | `PostManagerPanel.tsx:171-183`: `setInterval` → `setNowMs` + `savedPosts.some(...)` | entire 1,768-line panel re-renders every second | isolate clock in a `<RelativeTime>` leaf; pause interval when tab hidden |
| E6 | `TECH_ICONS_LIST.filter(...)` per gather request | `mediaController.ts:35` | trivial but repeated | precompute a slug→icon map at module load |
| E7 | `key={i|index|idx}` in 21 lists | e.g. diagram editors | reorder bugs + unnecessary DOM churn | use stable ids |
| E8 | `React.memo` never used while children receive many inline handlers | all 44 components | any future memoization is defeated | pair memo with `useCallback` or move handlers into context/store |
| E9 | 39 `useState` in one component | `AutonomousStudio.tsx` | every state change re-renders 3k-line tree | `useReducer` domain slices, or split |
| E10 | `console.*` (75) in production paths | `api/**` | noise + slight overhead; no structured logs | `pino`/`console.info` with fields, gate debug |

---

## 6. Recommended Refactoring Roadmap

**Phase 0 — zero risk (1 day)**
1. Delete the 22 dead exports + `PlanInspectorModal.tsx`; remove dead tsconfig flags.
2. Add ESLint 9 + Prettier with `react-hooks`, `no-floating-promises`, `no-explicit-any` (warn), `import/order`.
3. Replace the 5 `JSON.parse(JSON.stringify())` clones with `structuredClone`.

**Phase 1 — config & bundle (2-3 days)**
4. Enable `strict` via `tsconfig.strict.json`, burn down directory by directory.
5. Lazy-load `bundledSavedPosts` in the API.
6. Merge the three icon registries behind one interface.

**Phase 2 — shared infrastructure (1 week)**
7. Introduce `httpClient` (timeout/retry/backoff/auth) and migrate the 74 fetch sites.
8. Add `withRetry` and `safeAsync`; replace the 104 bare `catch {}` with structured warnings.
9. Add atomic rate limiting (Postgres or Upstash).

**Phase 3 — state & render (1-2 weeks)**
10. Split `AutonomousStudio` state into deck/selection/UI stores; add selectors.
11. Split `PostManagerPanel` clock into a leaf; memoize list rows.
12. Decompose `renderDiagram.ts` (1,164 lines) and `qaChecks.ts` (2,160 lines) by archetype/rule family; add visual-regression snapshots.

**Phase 4 — publish reliability**
13. Transactional outbox + dispatch fingerprint (see H3).
14. Paginate `/api/posts`; add vault count endpoint.

---

## 7. Scorecard

| Dimension | Score | Rationale |
|---|---|---|
| Type safety | **4 / 10** | `strict` off, 24 `any` escapes, 7 suppressions |
| DRY | **5 / 10** | 74 raw fetch sites, 3 icon registries, retry re-implemented 3× |
| Dead code hygiene | **6 / 10** | No TODO/FIXME rot; but 22 dead exports + 1 dead file |
| Modernization | **5 / 10** | React 19/Vite 8/TS 7 are modern; tooling (lint), `strict`, TS flags lag |
| Runtime efficiency | **7 / 10** | Good DB batching + coalescing; poor context boundaries and bundle discipline |
| Maintainability | **5 / 10** | 4 of ~157 files hold 10,000+ lines; mega-components |
| **Overall debt** | **5.3 / 10** | Solid engineering, material but addressable structural debt |
