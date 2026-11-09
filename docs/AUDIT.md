# MARROK Content Studio — Staff Engineering Codebase Audit (`Phase 0`)

**Date:** 2026-10-27  
**Scope:** Full-stack architecture, security, reliability, code quality, product safety gates, testing, and developer handoff readiness.

---

## 1. Architecture Map

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (React 19 + Vite 8)                        │
│                                                                             │
│  src/main.tsx -> src/App.tsx -> src/components/AutonomousStudio.tsx         │
│   ├─ Command Bar & Overlay Ingestion Drawer (Text / YouTube / Image OCR)    │
│   ├─ Left Stage:                                                            │
│   │   ├─ ViewportCanvas.tsx (1080×1920 9:16 live canvas + pointer drag)     │
│   │   ├─ SlideNavigator.tsx (storyboard strip + add/clone/delete/move)      │
│   │   └─ Quick Export Dock (JPG, Copy, Contact Sheet, Simulator, ZIP)       │
│   └─ Right 4-Tab Inspector:                                                 │
│       ├─ Copy: InlineSlideEditor.tsx (bilingual copy + live char counters)  │
│       ├─ Visual Layout: ArchetypeControls.tsx + SlideImageStudio.tsx        │
│       ├─ Position: ElementInspector.tsx (dX/dY/scale + anti-collision)      │
│       └─ Caption & QA: ExportBar.tsx + bilingual caption + QA checklist     │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
             ┌──────────────────┴──────────────────┐
             ▼                                     ▼
┌─────────────────────────────────────┐ ┌─────────────────────────────────────┐
│   CLIENT PIPELINE & CANVAS ENGINE   │ │     EXPRESS API (api/index.ts)      │
│                                     │ │                                     │
│  • src/lib/autonomousPipeline.ts    │ │  • POST /api/generate               │
│  • src/lib/synthesis/* (fallback)   │ │    └─ generateController.ts         │
│  • src/lib/text/* (BiDi & lint)     │ │  • POST /api/refine-slide           │
│  • src/lib/qaChecks.ts              │ │    └─ generateController.ts         │
│  • src/lib/canvas/                  │ │  • POST /api/generate-image         │
│    ├─ renderSlide.ts (1080×1920)    │ │    └─ imageController.ts            │
│    ├─ layoutAwareness.ts            │ │  • GET  /api/proxy-image            │
│    ├─ layoutBounds.ts               │ │    └─ proxyController.ts            │
│    ├─ textLayout.ts                 │ │  • GET  /api/search-media           │
│    ├─ archetypes/render*.ts         │ │    └─ mediaController.ts            │
│    └─ exporter.ts (JPG + ZIP)       │ │                                     │
└─────────────────────────────────────┘ └─────────────────────────────────────┘
```

---

## 2. End-to-End Data Flow

1. **Multimodal Ingestion (`AutonomousStudio.tsx`)**:
   - User enters a topic, pastes engineering notes/YouTube transcript, or attaches/pastes a screenshot (compressed client-side via `compressImageClientSide()` to max 1280px JPEG).
2. **Client Pipeline Orchestration (`src/lib/autonomousPipeline.ts`)**:
   - Calls `POST /api/generate` with an `AbortSignal` deadline (`createRequestDeadline`).
3. **Server AI Gateway (`api/controllers/generateController.ts`)**:
   - Validates input mode, MIME type, and base64 image bounds (`src/lib/validation/image.ts`).
   - Resolves API key (`x-gemini-key` header override or `process.env.GEMINI_API_KEY`).
   - For short prompts ($\le 200$ chars) without images, attempts Google Search Grounding (`tools: [{ googleSearch: {} }]`), extracting `groundingMetadata.groundingChunks` and `webSearchQueries`.
   - Falls back to ungrounded direct JSON schema mode (`CAROUSEL_RESPONSE_SCHEMA`).
   - If all Gemini models fail or no API key is configured, falls back to deterministic local synthesis (`synthesizeCarousel()`).
4. **Post-Processing & Sanitization**:
   - AI-generated decks run through `sanitizeFullCarousel()` (stripping raw markdown markers while preserving authentic copy).
   - Offline fallback decks run through `enrichAndPaceCarousel()` (`autoPolishHeadline`, `autoFitTextToLimits`, `fixArabicPunctuation`, `enrichCarouselDiagrams`, `balanceCarouselVisualPacing`).
5. **1080×1920 Canvas Projection (`src/lib/canvas/renderSlide.ts`)**:
   - Pure read-only rendering pipeline shared between `ViewportCanvas.tsx`, `PreviewAndToolsDrawer.tsx`, `ContactSheetModal.tsx`, and `exporter.ts`.
   - Uses `computeSlideLayoutAwareness()` (`src/lib/canvas/layoutAwareness.ts`) for non-overlapping vertical clearances (`MIN_GAP_GRAPHIC_TO_TITLE = 44`, `MIN_GAP_TITLES = 18`, `MIN_GAP_TITLE_TO_BODY = 36`, `MIN_GAP_BODIES = 22`) and `clampElementDrag()` for anti-collision pointer dragging.
6. **Pre-Publish QA & Export (`src/lib/qaChecks.ts` & `src/lib/canvas/exporter.ts`)**:
   - Evaluates slide count, headline word/punctuation rules, character limits, Arabic BiDi line-ending punctuation jumps, duplicate bodies, and boilerplate strings.
   - Exports single slides, contact sheets, and a Metricool ZIP archive.

---

## 3. Re-Verification of Findings Against Current Codebase

| Area | Item in Handoff Brief | Current Code Status | Action Required |
|---|---|---|---|
| **Phase 0: Duplicated Modules** | `src/lib/synthesizer.ts` vs `src/lib/synthesis/synthesizer.ts`, `textSanitizer.ts` vs `text/sanitizer.ts`, `canvasExporter.ts` vs `canvas/exporter.ts`, `smartEditor.ts` | **ALREADY FIXED**: `src/lib/smartEditor.ts` was deleted. `synthesizer.ts`, `textSanitizer.ts`, and `canvasExporter.ts` are 5-line re-export barrels pointing to their modular directories. | Keep minimal barrels; update internal imports to point directly to modular directories where appropriate. |
| **Phase 1.1: Grounding & Trust Status** | Do not mark `verified_live` or `userReviewed=true` unless grounded; map sources accurately; surface `grounded \| ungrounded \| offline` badge | **NEEDS FIX**: `generateController.ts` lines 236–237 set `status = 'verified_live'` and `userReviewed = true` unconditionally on all AI outputs (even ungrounded Attempt B). Cyclic `webSources[i % n]` was already removed, but `groundingSupports` mapping and `grounded \| ungrounded \| offline` badge need to be added. | Fix in Phase 1. |
| **Phase 1.2: Image Proxy (`/api/proxy-image`)** | `https` only; block private/link-local/metadata IPs + DNS re-check on redirects; allow only `png, jpeg, webp, gif, svg+xml` (415); cap ~2 MB; `X-Content-Type-Options: nosniff` + `CSP: sandbox` | **PARTIALLY FIXED**: `proxyController.ts` already implements `isPrivateOrLoopbackIp`, `resolveAndValidateHost`, and redirect hop validation (`fetchSafeImage`), and rejects non-images with `415`. **Remaining**: enforce `https:` only (currently allows `http:`), reduce `MAX_IMAGE_BYTES` from 5 MB to 2 MB, remove `x-icon` MIME types, add host allowlist option for auto-search, and set `X-Content-Type-Options: nosniff` + `Content-Security-Policy: sandbox` headers. | Fix in Phase 1. |
| **Phase 1.3: Abuse Control & Express Limits** | Per-IP rate limiting on `/api/generate` & `/api/generate-image`, CORS origin config, sane `express.json` limit (~4.5 MB), security headers | **NEEDS FIX**: `api/index.ts` currently uses `express.json({ limit: '50mb' })`, wildcard CORS without origin config, no rate limiter, and no security headers. | Fix in Phase 1. |
| **Phase 1.4: Secrets & Env Validation** | Validate env at startup, never log `x-gemini-key` or bodies, comment `.env.example` | **PARTIALLY FIXED**: `sanitizeLogText()` in `api/constants.ts` redacts keys from logs. **Remaining**: add startup env config validation module (`api/config.ts`) and expand `.env.example` documentation. | Fix in Phase 1. |
| **Phase 2: Reliability & Timeouts** | `AbortSignal` timeouts, cap total request time to Vercel limit, 1 grounded + 1 ungrounded attempt instead of long sequential chains, configurable models, `localStorage` quota safety | **PARTIALLY FIXED**: `AbortController` is already used instead of `Promise.race`. **Remaining**: cap total server cascade time so it never exceeds Vercel's `maxDuration: 60`, make model names configurable via env (`GEMINI_GENERATION_MODELS`, `GEMINI_IMAGE_MODELS`) in `api/config.ts`, and strip oversized base64 images before writing to `localStorage` if quota is exceeded. | Fix in Phase 2. |
| **Phase 3: Constants & Export Format** | Single source of truth for constants (`140` EN / `150` AR body limit), shared drawing path, dynamic hashtags in `AutonomousStudio`, official brand logo colors option, **JPG-only slide export in ZIP** | **NEEDS FIX**: `downloadAllSlidesZip` in `src/lib/canvas/exporter.ts` (lines 118–120) still writes `slide${i + 1}.png` (`image/png`) instead of `slide${i + 1}.jpg` (`image/jpeg`, 0.95)! `README.md` line 33 still says `110` chars instead of `140`. `AutonomousStudio.tsx` still uses hardcoded hashtags instead of `carousel.hashtags`. | Fix in Phase 3. |
| **Phase 4: Product Safety & QA Gate** | Risk-check module (`PASS`/`WARN`/`BLOCK`), creator credit requirement, strict QA gate blocking on placeholder text, Arabic Latin+punctuation line endings, text overflow, or PNG output | **NEEDS FIX**: Create `src/lib/riskChecks.ts` returning `PASS`/`WARN`/`BLOCK`, integrate into `ExportBar` & export handlers with an explicit override confirmation flow, and enforce JPG-only + safe-zone checks in `qaChecks.ts`. | Fix in Phase 4. |
| **Phase 5: Tests, Tooling & CI** | Unit tests for sanitizer, headlines, Arabic BiDi, QA checks, layout math, schema validation, proxy SSRF; archetype canvas snapshot test; `.editorconfig`, CI workflow, package metadata cleanup | **PARTIALLY FIXED**: 15 Vitest suites (74 tests) already exist covering headlines, layoutAwareness, layoutBounds, carousel/image validation, and proxySecurity. **Remaining**: add unit tests for `qaChecks.ts`, `riskChecks.ts`, `sanitizer.ts`, and archetype render snapshots; add `.github/workflows/ci.yml`, `.editorconfig`, `.nvmrc`; rename package from `"react-example"` to `"marrok-tiktok-carousel-studio"` and remove `bun.lock`. | Fix in Phase 5. |
| **Phase 6: Developer Handoff Docs** | `README.md`, `docs/ARCHITECTURE.md`, `docs/ADR/`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md` | **NEEDS FIX**: Create comprehensive developer handoff documentation and ADRs. | Fix in Phase 6. |

---

## 4. Dead Code, Duplicated Logic & Dependency Audit

### 4.1 Dead / Redundant Files
- `bun.lock`: Repository uses `npm` (`package.json` scripts and `.npmrc`); `bun.lock` is redundant and should be removed in Phase 5.
- `src/lib/theme/specThemes.ts`: Check if imported anywhere; if unused, consolidate or remove.

### 4.2 Dependencies (`package.json`)
- `autoprefixer`: Unused because `@tailwindcss/vite` v4 handles CSS prefixing natively without PostCSS/Autoprefixer. Can be removed in Phase 5.
- All other runtime dependencies (`@google/genai`, `express`, `jszip`, `lucide-react`, `react`, `react-dom`, `dotenv`) are actively used and justified.

---

## 5. Ordered Risk List (Highest to Lowest)

1. **[HIGH — Trust & Verification Integrity]** `api/controllers/generateController.ts` marks ungrounded direct-LLM outputs as `status: 'verified_live'` and `userReviewed: true`, masking unverified AI claims as human-reviewed live-grounded facts.
2. **[HIGH — Product Spec Compliance]** `downloadAllSlidesZip()` in `src/lib/canvas/exporter.ts` exports `slide1.png` (`image/png`) inside the ZIP bundle instead of `slide1.jpg` (`image/jpeg`, Q95), violating the TikTok/Metricool JPG requirement.
3. **[HIGH — API Abuse & SSRF Hardening]** `/api/index.ts` accepts `50mb` JSON bodies (exceeding Vercel's 4.5 MB limit) and lacks rate limiting on `/api/generate` and `/api/generate-image`. `/api/proxy-image` allows `http://` URLs, 5 MB payloads, and lacks `X-Content-Type-Options: nosniff` + `Content-Security-Policy: sandbox` headers.
4. **[MEDIUM — Serverless Timeout & Cascade Latency]** Chaining multiple 12s–45s model attempts across multiple keys in `generateController.ts` can exceed Vercel's 60-second function timeout before the local fallback triggers.
5. **[MEDIUM — Product Safety & Pre-Publish Gate]** No dedicated platform risk checker (`PASS`/`WARN`/`BLOCK`) for originality, unverified numeric claims, or cover readability; QA failures currently only show a toast without a structured gate/override.
6. **[LOW — Constants Drift & Hardcoded Hashtags]** `README.md` cites 110 chars for body copy while `CHAR_LIMITS` uses 140/150; `AutonomousStudio.tsx` appends hardcoded hashtags instead of topic-derived hashtags.

---

## 6. Phase 7 Audit & Hardening — Cloud Persistence & TikTok Safe Zones (2026-11-09)

- **Neon PostgreSQL Cloud Content Vault**: Migrated post persistence from ephemeral `/tmp` files to Neon Serverless PostgreSQL with SSL connection pooling (`api/db/postgres.ts`). Idempotent schema initialization, `JSONB` deck storage, and atomic upserts (`ON CONFLICT (id) DO UPDATE`) completely eliminated duplicate starter drafts and enabled true cross-device synchronization.
- **TikTok Photo Mode Safe-Zone Re-Anchoring**: Re-anchored the top header safe-zone floor to `SAFE_HEADER_Y = 206px` with horizontal margins (`136px` left, `920px` right) clearing TikTok's native `←` Back arrow and `🔍` Search icon. Shifted graphic cards to `cardY = 266px` (`translateY = 26px`), and moved the MARROK badge to the pagination footer.
- **TikTok Caption Deduplication**: Added `stripLeadingDuplicateTikTokTitle` to prevent TikTok's Photo Mode headline overlay from duplicating the caption's first line.
