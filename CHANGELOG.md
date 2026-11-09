# Changelog — MARROK Content Studio

## [1.5.0] — Neon Serverless PostgreSQL Persistence Vault, TikTok Photo Mode Safe-Zone Re-Anchoring & Caption Polish

### 1. Neon Serverless PostgreSQL Content Vault (`api/db/postgres.ts`, `api/controllers/postsController.ts`)
- **Durable Cross-Device Cloud Sync:** Configured Neon Serverless PostgreSQL via connection pooler (`DATABASE_URL`), enabling real-time synchronization of draft decks, scheduled slots, and published history across desktop, mobile, and serverless instances.
- **Idempotent Schema & JSONB Slide Deck Storage:** Automatic startup table creation (`saved_posts`) storing the full bilingual slide deck as `JSONB` alongside indexed relational metadata (`id`, `title`, `post_status`, `scheduled_for`, `title_signature`, `updated_at`).
- **Atomic Upsert & Zero-Duplicates Guarantee:** Implemented `ON CONFLICT (id) DO UPDATE` to completely eliminate the duplicate starter draft copies previously caused by ephemeral `/tmp` resets on serverless cold starts.
- **Hands-Off Auto-Seeding & Offline Fallback:** On first connection, automatically migrates existing seed posts into PostgreSQL. If network connectivity drops or the database URL is unset, the app gracefully falls back to local disk and IndexedDB without crashing.
- **Connection Badges:** Added live `● Neon Postgres` status badges in the `2. Publish & Posts` workspace header and `SavedPostsDrawer`.

### 2. TikTok Photo Mode Safe-Zone Re-Anchoring (`src/lib/canvas/constants.ts`, `src/lib/canvas/background.ts`, `src/lib/canvas/layoutAwareness.ts`)
- **Top Header Re-Anchoring:** Shifted top header floor down to `SAFE_HEADER_Y = 206px` with horizontal safe margins (`136px` left, `920px` right) clearing TikTok's native `←` Back arrow (`x = 48..116`) and `🔍` Search icon (`x = 960..1032`).
- **Visual Card Ceiling Adjustment:** Shifted visual schematic cards to `cardY = 266px` (`translateY = 26px`) on `tiktok-9:16`, preventing visual collision with top header chrome.
- **Pagination Footer MARROK Badge:** Relocated the glowing vector MARROK badge (`22×22px`) + `@MARROK` handle to the left of the pagination dots, with technical slide numbering (`03 / 08`) on the right.

### 3. TikTok Caption Deduplication (`src/lib/publish/publishClient.ts`, `api/controllers/publishController.ts`)
- **Headline Stripping in Dispatch:** Added `stripLeadingDuplicateTikTokTitle()` to strip redundant leading headline copy from the caption body when dispatched to TikTok, preventing TikTok Photo Mode's native headline overlay from displaying the hook line twice.

---

## [1.4.0] — Consolidated Publish & Posts Hub, Zernio Free API + TikTok Commercial Music Library & Buffer Instagram Fix

### 1. Zernio Free REST API v1 + Hosted MCP Server & TikTok Commercial Music Library (`api/controllers/publishController.ts`, `src/lib/publish/publishClient.ts`)
- **Direct 4-Channel API Publishing (`Buffer` + `Zernio`):** Integrated Zernio REST API v1 (`GET /v1/accounts`, `POST /v1/posts`, `DELETE /v1/posts/{id}`) alongside Buffer GraphQL API (`https://api.buffer.com`), enabling 1-click direct publishing and scheduling across **Instagram (`@marrok_org`)**, **Facebook (`Marrok (Algiers)`)**, **LinkedIn (`Marrok`)**, and **TikTok (`@marrokorg`)** with zero manual CSV steps.
- **Buffer Instagram Carousel Fix:** Fixed Buffer GraphQL `CreatePostInput.metadata.instagram.type` to always send `'post'` (instead of `'carousel'`, which Buffer's GraphQL enum rejects), allowing multi-image Instagram carousels to publish and schedule cleanly.
- **Dual Aspect-Ratio Auto-Staging:** Automatically renders and stages `ig-4:5` (`1080×1350`) slides for Instagram/Facebook/LinkedIn and native `tiktok-9:16` (`1080×1920`) slides for TikTok when publishing across both ecosystems simultaneously.
- **TikTok Commercial Music Library (`GET /api/publish/tiktok-music`):** Queries `GET https://zernio.com/api/v1/accounts/{accountId}/tiktok/commercial-music` for the top 25 trending licensed tracks, passes camelCase `autoAddMusic: true` and `musicSoundInfo: { musicSoundId }` in `tiktokSettings`, and surfaces a **TikTok Background Sound** selector with **Auto-Pick #1 Trending Track**, **Shuffle**, and live **Audio Preview** in `PublishingHubWorkspace.tsx`.

### 2. Consolidated 2-Tab Publish & Posts Hub (`src/components/studio/PublishingHubWorkspace.tsx`, `src/components/studio/PostManagerPanel.tsx`, `src/components/Header.tsx`)
- **Single Home for All Posts (`2. Publish & Posts (N)`):** Removed the duplicate top-header `Saved Posts / Vault` drawer and consolidated all publishing and post management into two clean tabs: **Publish Active Post** and **Posts & Calendar**.
- **Metricool UI Removal:** Removed legacy Metricool CSV download buttons, `TikTok CSV: X/20` counters, and CSV preview tables from the UI now that Buffer and Zernio handle all 4 channels via direct APIs.

---

## [1.3.0] — Separated Publishing Hub, Official 99-Column Metricool CSV, Cloudinary Auto-Cleanup, Feed Color Cadence & Single-Slide Video

### 1. Separated Full-Page Publishing & Scheduling Hub (`src/components/studio/PublishingHubWorkspace.tsx`, `src/App.tsx`, `src/components/Header.tsx`)
- **Top-Level Phase Switcher (`1. Create Studio` ↔ `2. Publish Hub`):** Separated the publishing workflow from the creation canvas into a dedicated full-page 3-zone workspace featuring an Active Post / Vault Batch Queue selector, Weekly Calendar Cadence Generator (*Mon/Wed/Fri*, *Tue/Thu/Sat*, *Weekdays*, *Daily*), Interactive CSV Preview Table, and Hybrid Channel Router.
- **Official 99-Column Metricool CSV Template Engine (`src/lib/publish/publishClient.ts`):** Implemented `OFFICIAL_METRICOOL_CSV_HEADERS` and `generateMetricoolBulkCsv()` matching `Mtr_calendar_template.csv` with auto-populated `TikTok Title` ($\le 90$ chars), `First Comment Text`, `Document title` ($\le 58$ chars), `Alt text picture 1..10`, `LinkedIn Images as Carousel` (PDF), `TikTok Auto Add Music`, `TikTok Post Privacy`, and `Brand name`.
- **Hybrid Zero-Cost Channel Dispatch (`api/controllers/publishController.ts`):** Connected **Buffer Free GraphQL API** (`https://api.buffer.com`) for Instagram (`@marrok_org`), Facebook (`Marrok`), and LinkedIn (`Marrok`) (10-slot rolling queue per channel) while reserving Metricool Free's 20 posts/month cap for TikTok (`@Marrok`).
- **Signed Cloudinary Staging & Post-Publish Auto-Cleanup:** Added SHA-1 signed slide uploads (`uploadSlideToCloudinary`) to `marrok_staging/*` and automatic asset destruction (`destroyCloudinaryAsset`, `sweepExpiredCloudinaryAssets`) immediately after `shareNow` publish or `+1 hour` after scheduled `dueAt`.

### 2. Feed Color Cadence & Smart Palette Rotation (`src/lib/theme/cadenceEngine.ts`, `src/components/ThemeCustomizer.tsx`)
- **Posted History Cadence Analyzer (`analyzePostHistoryCadence`):** Analyzes posted Vault records (`postStatus === 'posted'`) to prevent consecutive same-color posts on the social grid.
- **Automatic Harmonious Palette Rotation (`resolveHarmoniousPaletteWithoutRepetition`):** Automatically rotates to the closest harmonious palette when an AI-synthesized topic matches a recently used color, and displays a live **Recommended Next Palette** banner with a recent feed color strip in the Theme Customizer.

### 3. Single-Slide Video Ingestion, MP4 Export & Standalone Meme Mode (`src/lib/canvas/singleSlideVideoExporter.ts`, `src/lib/canvas/videoFrameExtractor.ts`, `src/lib/canvas/archetypes/renderImage.ts`)
- **Video Storyboard Extraction & MP4 Export:** Added `extractVideoStoryboardDataUrl()` (2×2 keyframe contact sheet for Gemini Vision video analysis) and `exportSingleSlideVideo()` (hardware-accelerated `mp4-muxer` / `MediaRecorder` MP4 & WebM export with MARROK slide chrome and preserved audio).
- **Standalone Meme Full-Bleed Mode (`standaloneMeme`):** Added one-click `standaloneMeme` support on `image` slides that hides redundant bottom title/body captions and expands the visual frame (`getImageCardRect`) to fill the vertical canvas stage (`h = 1260px`).

---

## [1.2.0] — MARROK Content Studio Rename & Multi-Platform Viewport Engine

### 1. Rebrand to MARROK Content Studio (`marrok-content-studio`)
- Renamed application and package identity from `MARROK TikTok Carousel Studio` (`marrok-carousel-studio`) to **MARROK Content Studio** (`marrok-content-studio`) across `package.json`, `metadata.json`, `index.html`, `server.ts`, `AutonomousStudio.tsx`, `ContactSheetModal.tsx`, `exporter.ts`, and project documentation to reflect its evolution into a multi-format, multi-platform content engine.

### 2. Multi-Platform Canvas Dimensions & Uniform Aspect Scaling (`src/lib/canvas/dimensions.ts`, `src/lib/canvas/layoutAwareness.ts`)
- **5 Platform Presets (`CanvasDimensionId`):** Added `tiktok-9:16` (`1080×1920`), `ig-4:5` (`1080×1350`), `ig-3:4` (`1080×1440`), `ig-1:1` (`1080×1080`), and `ig-reels-9:16` (`1080×1920`) with dedicated safe-zone ceilings, top headers, side margins, and `SYS_REF` CAD reticles.
- **TikTok Photo Mode 3:4 Active Viewport:** Calibrated `tiktok-9:16` default graphic/copy ceiling to `y <= 1510` (`contentTop = 180`) so slides sit cleanly inside TikTok Photo Mode's `1080×1440` active stage above the caption shelf and action rail.
- **Aspect-Aware Graphic & Font Scaling:** Updated `computeSlideLayoutAwareness()` and `renderSlideToCanvas()` so compact dimensions (`ig-1:1`, `ig-4:5`, `ig-3:4`) proportionally scale schematic cards and typography, preventing cramped overlaps or clipped footers.
- **Viewport Safe-Zone & Mobile UX Polish:** Fixed clipped top safe-zone labels, overlapping IG 3:4 grid crop guides, duplicate dimension strings in toast notifications, and responsive header layout across desktop and mobile viewports.

---

## [1.1.0] — Multi-Format Studio: 1-Slide Poster, 9:16 Motion Reel & Multi-Key AI Failover

### 1. Multi-Key Gemini Failover & Zero-Key Free AI Backup Cascade
- **Ordered Gemini Key Pool (`api/config.ts`):** Added `getGeminiKeyPool(req)` supporting primary + backup client keys (`x-gemini-key`, `x-gemini-key-backup`) and server environment keys (`GEMINI_API_KEY`, `GEMINI_API_KEY_BACKUP`, `GEMINI_API_KEY_2`, `GEMINI_API_KEYS`). Automatically rotates to the next key on `429` rate-limit or quota exhaustion.
- **Zero-Key Free AI Backup (`api/freeAiFallback.ts`):** Added `generateCarouselWithFreeBackup()` (Pollinations OpenAI-compatible JSON synthesis) and `generateImageWithFreeBackup()` (Pollinations 9:16 `flux` 1080×1920 image generation) when all Gemini keys are exhausted before falling back to the local offline synthesizer.

### 2. Standalone 1-Slide Infographic Poster Mode
- **Dual Single-Slide Layouts (`src/lib/canvas/renderSlide.ts`, `src/lib/canvas/layoutAwareness.ts`):** Added `SingleSlideVariant = 'poster' | 'standard'`. Poster mode renders a compact top schematic (`300px`), bilingual headlines/bodies with expanded character limits (`SINGLE_SLIDE_CHAR_LIMITS`), and a 3-row numbered bilingual takeaway card stack (`drawSingleSlideTakeaways`).
- **Clean Single-Slide Footer (`src/lib/canvas/background.ts`):** Replaces multi-slide pagination dots with a clean `SOURCE //` attribution + `@MARROK` handle bar when `total === 1`.
- **1-Click Carousel-to-Single Condenser (`src/lib/synthesis/singleSlideCondenser.ts`):** Added `condenseCarouselToSingleSlide()` and top-bar format switcher (`Carousel` · `1-Slide` · `Motion Reel`) with non-destructive slide stashing.

### 3. MARROK 9:16 Motion Reel Studio (`src/lib/motion/`)
- **Authentic MARROK Slide Chrome in Motion (`src/lib/motion/marrokSlideChrome.ts`):** Every Motion Reel frame renders MARROK's OLED background, radial ambient glow, `108px` engineering grid, CAD safe-zone reticles (`SYS_REF // 1080x1920.CAD_SAFE // MOTION_REEL`), glowing `32×32px` `drawMarrokVectorBadge` header + `MARROK` wordmark, elevated surface cards, spring-animated bilingual EN/AR copy, and scene pagination footer.
- **4 Spring-Physics Templates (`src/lib/motion/templates/`):** Added flagship `marrok-slides` (**MARROK Slide Deck**) alongside upgraded `kinetic-text`, `brand-intro`, and `product-showcase` templates.
- **48kHz Procedural SFX & Video Export (`src/lib/motion/sfxSynthesizer.ts`, `src/lib/motion/videoExporter.ts`):** Added mathematical `click`, `pop`, `thump`, and `whoosh` synthesis, 16-bit PCM `.wav` encoding, and in-browser `MediaRecorder` + Web Audio muxed `.webm`/`.mp4` video and standalone `.html` export.

---

## [1.0.0] — Production Handoff Release

### Phase 0: Architecture & Security Audit
- Added `docs/AUDIT.md` with system architecture map, end-to-end data flow trace, re-verification table against current code, duplicate/barrel file inventory, dependency audit, and prioritized risk register.

### Phase 1: Security & Grounding Trust
- **Authentic Grounding Provenance (`api/controllers/generateController.ts`):**
  - Results are marked `status: 'verified_live'` and `engine: 'grounded'` **only** when Google Search grounding returns actual web sources (`webSources.length > 0`).
  - Ungrounded LLM outputs are marked `status: 'unverified_draft'`, `engine: 'ungrounded'`, and `userReviewed: false`.
  - Replaced cyclic fake source assignment (`webSources[i % n]`) with `mapFactsWithGroundingSupports()`, which maps fact citations strictly via `groundingMetadata.groundingSupports` segment indices or leaves `sourceUrl` empty.
  - Added a visible Engine Provenance Badge (`Grounded` / `Ungrounded AI` / `Offline`) in the studio command bar and `ExportBar`.
- **Image Proxy Hardening (`api/controllers/proxyController.ts`):**
  - Enforced `https:` only (`http:` rejected with `400`).
  - Added DNS/IP SSRF validation on initial URLs and all redirect hops, plus `ALLOWED_SEARCH_IMAGE_HOSTS` when `?source=search`.
  - Restricted accepted MIME types to `image/png`, `image/jpeg`, `image/webp`, `image/gif`, and `image/svg+xml` (rejecting others with `415`).
  - Capped response size at `2 MB` and timeout at `6s`, added `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, and added `sanitizeSvgContent()`.
- **Abuse & Secret Controls (`api/config.ts`, `api/index.ts`, `.env.example`):**
  - Added startup environment validator, per-IP rate limiting on `/api/generate`, `/api/refine-slide`, and `/api/generate-image`, security headers middleware, configurable `ALLOWED_ORIGIN`, optional `API_SHARED_SECRET`, and `4.5mb` JSON body limit.

### Phase 2: Reliability
- Replaced manual timers with `AbortSignal.timeout()` across `/api/generate` and `/api/generate-image`, capping `/api/generate` at 45s (1 grounded attempt + 1 ungrounded attempt).
- Made Gemini generation and image models configurable via `GEMINI_GENERATION_MODELS` and `GEMINI_IMAGE_MODELS`.
- Added 413 payload validation in `api/controllers/imageController.ts` and `QuotaExceededError` fallback in `src/App.tsx` (automatically stripping oversized inline `data:image/` strings from `localStorage` drafts).

### Phase 3: Architecture & Code Quality
- Standardized `downloadAllSlidesZip()` (`src/lib/canvas/exporter.ts`) to export `slide1.jpg` ... `slideN.jpg` (`image/jpeg` Q95, never PNG).
- Replaced hardcoded hashtags in `src/components/AutonomousStudio.tsx` with dynamic topic-derived hashtags (`deriveTopicHashtags()`).
- Aligned `README.md` with `CHAR_LIMITS` in `src/lib/qaChecks.ts` (`enBody: 140`, `arBody: 150`).

### Phase 4: Product Safety Rules in Code
- Created `src/lib/riskChecks.ts` (`runPlatformRiskChecks`) returning `PASS` / `WARN` / `BLOCK` across Originality, Copyrighted IP/Audio, First-Frame Cover Quality, Unverified Numeric Claims, and Slide Repetition.
- Added vertical safe-zone overflow (`y > 1760`), PNG format rejection, and dimension validation to `runQAChecks()` (`src/lib/qaChecks.ts`).
- Enforced pre-export safety & QA gate in `AutonomousStudio.tsx` and `ExportBar.tsx`: requires creator/channel attribution on the CTA slide and blocks export on `BLOCK` / `FAIL` unless the creator explicitly toggles **"Override & allow export"**.

### Phase 5 & 6: Tests, Tooling, CI & Documentation
- Expanded `src/lib/network/proxySecurity.test.ts` and added `src/lib/qaAndRiskChecks.test.ts`.
- Renamed package to `marrok-tiktok-carousel-studio`, removed unused `autoprefixer` and `bun.lock`, and added `.nvmrc`, `.editorconfig`, `.github/workflows/ci.yml`, `docs/ARCHITECTURE.md`, `docs/ADR/*`, `CONTRIBUTING.md`, and `SECURITY.md`.

---

## Behavior Changes Summary
1. **Grounding & Review Status:** AI-generated decks without live Google Search sources now start as `status: 'unverified_draft'` and `userReviewed: false` instead of `verified_live` / `userReviewed: true`.
2. **Fact Citations:** Facts without matching `groundingSupports` no longer receive cycled URLs from unrelated search results; their `sourceUrl` remains empty.
3. **ZIP Slide Format:** `downloadAllSlidesZip()` now writes `slide1.jpg` ... `slideN.jpg` (JPEG Q95) instead of `.png` files.
4. **Pre-Export Safety Gate:** Exporting a ZIP when `runQAChecks` fails, `runPlatformRiskChecks` returns `BLOCK`, or Creator Credit is empty now focuses the `Caption & QA` tab and blocks export until fixed or explicitly overridden.
5. **Image Proxy (`/api/proxy-image`):** Rejects `http://` URLs (`400`), non-allowlisted MIME types (`415`), and payloads `> 2 MB` (`413`).
