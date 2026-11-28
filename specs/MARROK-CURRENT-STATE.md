# MARROK Content Studio — Current State Specification

**Document Version:** 1.2.0  
**Verification Date:** November 2026  
**Auditor:** Senior Software Architect & Engineering Lead  
**Scope:** Complete Codebase, Test Suite (60 Test Suites / 476 Tests), Local Express Film Studio, Serverless Backend & Build Artifacts  

---

## 1. System Status & Verification Summary

The MARROK Content Studio is a high-grade, production-deployed web application combining a deterministic HTML5 Canvas graphics engine, server-side Gemini AI generation with zero-cost fallback cascades, bilingual English-Arabic typography, in-browser 9:16 procedural motion reel synthesis, multi-act 16:9 & 9:16 HTML/VO Film Studio rendering (`video-studio/`), and multi-channel social media publishing.

### 1.1 High-Level Status Matrix

| Subsystem / Capability | Implementation Status | Test Coverage | Live Verification Notes |
| :--- | :---: | :---: | :--- |
| **HTML5 Canvas Slide Renderer** | **Fully Operational** | 100% (Vitest) | Deterministic pure read-only projection; 1080x1920 @ 95% JPEG quality. |
| **Safe Zone & Collision Engine** | **Fully Operational** | 100% (Vitest) | `SAFE_MARGIN_RIGHT = 930`, `SAFE_FOOTER_CEILING_Y = 1428` strictly enforced; anti-collision vertical clamping. |
| **Mobile Typography Floor** | **Fully Operational** | 100% (Vitest) | Minimum $\ge 24\text{px}$ title/body/diagram floor ($\ge 22\text{px}$ footer) enforced across all presets. |
| **Bilingual EN + AR BiDi Layout** | **Fully Operational** | 100% (Vitest) | Native RTL/LTR direction switching, Arabic glyph shaping, and font stacks. |
| **10 Slide Archetypes** | **Fully Operational** | 100% (Vitest) | `hub`, `row`, `subjectPair`, `number`, `metric`, `code`, `compare`, `image`, `poster`, `cta` all render. |
| **9 Diagram Variants** | **Fully Operational** | 100% (Vitest) | `topology`, `stack`, `isolation`, `takeaway`, `scatter`, `graph`, `clusters`, `split`, `features`. |
| **AI Generation Key Pool Cascade** | **Fully Operational** | 100% (Vitest) | Multi-key failover -> zero-cost Pollinations fallback -> local offline synthesizer. |
| **AI Image & Flux Fallback** | **Fully Operational** | 100% (Vitest) | Gemini 9:16 text-to-image with zero-cost Flux fallback when keys expire. |
| **Single-Slide Video Muxing** | **Fully Operational** | 100% (Vitest) | Browser `MediaRecorder` + audio preservation with MARROK vector chrome. |
| **9:16 Motion Reel Engine (`Create → Reel`)** | **Fully Operational** | 100% (Vitest) | In-browser damped harmonic springs, 48kHz procedural SFX (`click`, `pop`, `thump`, `whoosh`). |
| **Film Studio (`video-studio/`)** | **Fully Operational** | 100% (Vitest) | Multi-act 16:9 & 9:16 deterministic HTML/DOM + ElevenLabs/Gemini VO + FFmpeg sidechain mix & Playwright render (`server.ts`). |
| **Export Formats (5-in-1 ZIP, JPG)**| **Fully Operational** | 100% (Vitest) | Slides, bilingual captions, first comment, citations, metadata all bundled. |
| **Neon PostgreSQL Cloud Vault** | **Operational with Fallback**| 100% (Vitest) | Atomic upserts via `JSONB`; auto-falls back to local JSON and IndexedDB. |
| **Buffer GraphQL Publishing** | **Operational** | Unit Tested | Direct API dispatch for Instagram, Facebook, LinkedIn (10-post free queue). |
| **Zernio REST v1 TikTok Dispatch** | **Operational** | Unit Tested | Multi-slide 9:16 photo carousels to `@marrokorg` with commercial music. |
| **Cloudinary Staging & Auto-Purge** | **Operational** | Unit Tested | SHA-1 signed upload with automatic `+1h` asset cleanup post-publish. |
| **Topic Radar & SSRF-Safe Reader** | **Operational** | Unit Tested | Hacker News, Cloudflare RSS, arXiv; private IP ranges strictly blocked. |

---

## 2. Deep Dive: What Works Completely (Verified)

### 2.1 Pure Deterministic Canvas Pipeline (`src/lib/canvas/`)
- **Render Engine (`renderSlide.ts`):** Operates as a pure projection function: `(ctx, slide, theme, format, options) => void`. There are zero side-effects, zero network calls, and zero asynchronous promises inside the draw loop.
- **Layout Awareness Engine (`layoutAwareness.ts`):** Calculates vertical clearance without overlap. Pre-allocates non-overlapping zones:
  - Graphic-to-Title gap: $\ge 44\text{px}$
  - Title-to-Subtitle gap: $\ge 18\text{px}$
  - Title-to-Body gap: $\ge 36\text{px}$
  - Body paragraph gaps: $\ge 22\text{px}$
- **Bounds Synchronization (`layoutBounds.ts`):** Computes exact bounding boxes for user dragging and inspector selection overlays. Hit-testing is accurate to the pixel.
- **Safe Zones (`constants.ts`):** Respects TikTok and Instagram UI overlays:
  - Top header safe margin: `SAFE_HEADER_Y = 206px`
  - Left/Right margins: `SAFE_MARGIN_LEFT = 84px`, `SAFE_MARGIN_RIGHT = 930px`
  - Bottom footer ceiling: `SAFE_FOOTER_CEILING_Y = 1428px` (`SAFE_MAX_Y = 1650px`)

### 2.2 Bilingual Typography & Formatting
- **English/Arabic Parity:** Every slide maintains synchronized bilingual fields (`enTitle`/`arTitle`, `enBody`/`arBody`, `enCategory`/`arCategory`).
- **Font Stack Hierarchy:**
  - English: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  - Arabic: `"Cairo", "Tajawal", "Noto Sans Arabic", "Segoe UI", sans-serif`
  - Code: `"JetBrains Mono", "Fira Code", monospace`
- **Text Fitting (`textLayout.ts`):** Dynamic font scaling with hard floor at $24\text{px}$ ($22\text{px}$ for footers). If text cannot fit at $24\text{px}$, lines are intelligently wrapped or clipped with an ellipsis indicator rather than breaking layout.

### 2.3 AI Synthesis Key Cascade (`api/controllers/generateController.ts`)
- **Key Hierarchy:** Client Key $\to$ Client Backup $\to$ Server Key $\to$ Server Backup $\to$ Key Pool.
- **Failover Chain:**
  1. Primary Gemini model attempt with Google Search grounding.
  2. Fallback to ungrounded Gemini attempt if grounded attempt fails or returns invalid schema.
  3. Fallback to free backup AI endpoint (OpenAI-compatible Pollinations API) if Gemini rate limits (`429`) or quota is exceeded.
  4. Final deterministic fallback to local synthesizer (`src/lib/synthesis/synthesizer.ts`) ensuring the user **never receives a 500 error**.

### 2.4 Multi-Format Asset Exporting
- **5-in-1 ZIP Bundle (`src/lib/canvas/exporter.ts`):** Generates production package containing:
  1. `slide1.jpg` ... `slideN.jpg` (1080x1920 Q95)
  2. `caption-bilingual.txt` (formatted with dual-language emojis and hashtags)
  3. `caption.txt` & `short_caption.txt` (platform optimized)
  4. `first_comment.txt` (citations, tags, and engagement hook)
  5. `carousel-manifest.json` & `post_metadata.json`
  6. `claims_citations.txt` & `README.txt`
- **Single-Slide Video Exporter (`singleSlideVideoExporter.ts`):** Merges animated or static slide visuals with uploaded background audio or video into an MP4/WebM file ready for TikTok.
- **Motion Reel Exporter (`src/lib/motion/videoExporter.ts`):** Muxes HTML5 canvas frames with 48kHz procedural sound effects (synthesized in-browser without external audio files) at 30fps or 60fps.

---

## 3. What Works with Conditions / External Credentials

### 3.1 Social Media Direct Publishing
- **Buffer API Integration (`api/controllers/publishController.ts`):**
  - Works with `BUFFER_API_KEY`.
  - Dispatches to Instagram (`@marrok_org`), Facebook (`Marrok (Algiers)`), and LinkedIn (`Marrok`).
  - Constrained by Buffer Free tier limit of **10 queued posts per channel**. If queue is full, the API responds with a descriptive queue full error.
- **Zernio API Integration (`api/controllers/publishController.ts`):**
  - Works with `ZERNIO_API_KEY`.
  - Dispatches up to 35-slide 9:16 carousels to TikTok (`@marrokorg`).
  - Commercial Music search (`/api/publish/tiktok-music`) requires active TikTok account authorization inside Zernio.

### 3.2 Persistent Cloud Vault (`api/db/postgres.ts`)
- **Neon PostgreSQL:**
  - Fully implemented with `pg.Pool`, SSL mode, idempotent table creation (`saved_posts`), and atomic upserts.
  - Active when `DATABASE_URL` is configured in environment.
  - When `DATABASE_URL` is omitted, system gracefully falls back to ephemeral `/tmp` JSON storage and client-side IndexedDB (`src/lib/storage/postsVaultClient.ts`).

### 3.3 Cloudinary Staging & Auto-Cleanup
- **Cloud Staging (`src/lib/publish/cloudinarySigning.ts` + `api/controllers/publishController.ts`):**
  - Active when `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are provided.
  - SHA-1 request signing is isolated in strictly server-only `src/lib/publish/cloudinarySigning.ts` (never bundled into client assets).
  - Automatically sweeps and destroys assets $1\text{ hour}$ after scheduled delivery.
  - When secrets are absent, falls back to ephemeral public HTTPS hosting.

---

## 4. Post-Refactor Architecture & Resolved Bottlenecks

### 4.1 Clean Route & Modal Code Splitting
- Heavy workspaces (`PublishingHubWorkspace`, `VideoStudioWorkspace`, `SavedPostsDrawer`, `MotionExportModal`, `ThemeCustomizer`, `SlideImageStudio`, `MediaSearchModal`, `ApiKeyModal`, `ContactSheetModal`) emit as separate lazy Vite chunks with zero `[INEFFECTIVE_DYNAMIC_IMPORT]` or Node-builtin externalization warnings.
- Legacy bundled sample-post JSON seeds have been retired; Vault persistence uses Neon PostgreSQL with honest IndexedDB fallback (`src/lib/storage/postsVaultClient.ts`).

### 4.2 Decomposed Studio & Server Modules
- **Create Workspace (`src/components/AutonomousStudio.tsx`, 1,164 LOC):** Decomposed into cohesive feature hooks and stage UI:
  - `src/hooks/useStudioHistory.ts` (single Undo/Redo + before-edits comparison stack)
  - `src/hooks/useAutonomousGeneration.ts` (AI generation orchestration & pipeline hydration)
  - `src/hooks/useVisualDirectorActions.ts` (auto-layout watcher, slide/diagram CRUD, visual director actions)
  - `src/hooks/useBilingualSlideSync.ts` (Arabic slide/deck sync, vision photo captioning, video storyboard switching)
  - `src/components/studio/panels/StudioStageConsole.tsx` (under-canvas slide strip, delivery bar, fallback banner)
- **Film Studio (`src/components/studio/video/VideoStudioWorkspace.tsx`, 395 LOC):** Controller state, polling, and job actions extracted into `src/components/studio/video/useVideoStudioController.ts` and inspector forms into `VideoStudioInspectorPanels.tsx`. Express routes (`video-studio/studio/expressRouter.mjs`, 1,035 LOC) reuse canonical session auth injected from `server.ts` (`src/lib/security/sessionAuth.ts`).
- **Archetype & Review Panels:** `ArchetypeControls.tsx` (`736 LOC`) and `WeeklyProgramReviewPanel.tsx` (`879 LOC`).
- **Server-Safe Shared Helpers:** Pure text/HTML/scoring/Telegram helpers live in `src/lib/gather/topicTextScoring.ts` (reducing `api/controllers/mediaController.ts` to 2,451 LOC), staging/quota/fingerprint helpers live in `src/lib/publish/publishOutbox.ts`, and SHA-1 Cloudinary signing lives in server-only `src/lib/publish/cloudinarySigning.ts` (reducing `api/controllers/publishController.ts` to 3,284 LOC).
- **Unified HTTP Client (`src/lib/network/httpClient.ts`):** Authenticated client API calls standardize on `fetchAuthedJson`.

### 4.3 Remaining Tracked UX Item
- **Mobile Viewport Tuning:** Small mobile screens (`< 768px`) should continue to be spot-checked whenever adding controls to the bottom stage console or floating toolbar dock.

---

## 5. Non-Negotiable System Constraints & Invariants

1. **Vercel Serverless Function Count ($\le 12$ Files):**
   Vercel Hobby tier counts every TypeScript file in `/api/` as a serverless function. There are currently exactly 11 files in `/api/`:
   - `api/config.ts`
   - `api/constants.ts`
   - `api/db/postgres.ts`
   - `api/index.ts`
   - `api/prompts/systemPrompt.ts`
   - `api/controllers/generateController.ts`
   - `api/controllers/imageController.ts`
   - `api/controllers/mediaController.ts`
   - `api/controllers/postsController.ts`
   - `api/controllers/proxyController.ts`
   - `api/controllers/publishController.ts`
   **Rule:** Never create new `.ts` files inside `/api/` without deleting or combining existing ones.

2. **Deterministic Canvas Engine Invariance:**
   `renderSlide.ts` must remain pure and synchronous. Never introduce async operations, DOM queries, or network requests into the canvas rendering cycle.

3. **Mobile Readability Floor:**
   Title, body, and diagram label elements must never be scaled below $24\text{px}$ ($\ge 22\text{px}$ for footers), regardless of content length. If copy exceeds available clearance, it must be truncated with an ellipsis or reformatted via layout awareness.

4. **Node/Browser Decoupling & Type Hygiene (`src/test/architectureBoundary.test.ts`):**
   Shared utility files (e.g. `src/lib/publish/tiktokTitle.ts`, `src/lib/gather/topicTextScoring.ts`) stay pure with zero browser or canvas imports, while server-only crypto modules (`src/lib/publish/cloudinarySigning.ts`) are banned from client `src/components/` and `src/hooks/`. Production `src/` and `api/` code enforces zero explicit `any` and zero non-null (`!.`) assertions.

---

## 6. Verification Test Baseline

The codebase passes all regression and architecture boundary tests:
```bash
npm run lint && npm run video:lint && npm test && npm run build
```
- **Test Files:** 60 passed (60) — 476 tests passed
- **Pass Rate:** 100%

