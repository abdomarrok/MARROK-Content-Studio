# MARROK Content Studio — Architecture Guide

## 1. System Topology Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     Client SPA (React 19 + Vite 8)                         │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Header Switcher: [1. Create Studio]  <--->  [2. Publish & Posts (N)] │  │
│  └──────────────────┬───────────────────────────────────┬───────────────┘  │
│                     ▼                                   ▼                  │
│  ┌────────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │ Phase 1: AutonomousStudio.tsx      │  │ Phase 2: Publish & Posts Hub │  │
│  │  ├─ Carousel | 1-Slide | Reel      │  │  (PublishingHubWorkspace.tsx)│  │
│  │  ├─ Standalone Meme & Video Slide  │  │  ├─ Tab 1: Publish Active    │  │
│  │  ├─ Feed Color Cadence Auto-Rotate │  │  │   (Buffer + Zernio APIs + │  │
│  │  └─ ViewportCanvas / ReelViewport  │  │  │    TikTok Trending Music) │  │
│  └───────┬──────────────────┬─────────┘  │  └─ Tab 2: Posts & Calendar  │  │
│          │                  │            │      (PostManagerPanel.tsx)  │  │
│          ▼                  ▼            └──────────────┬───────────────┘  │
│  ┌────────────────┐ ┌────────────────┐                  │                  │
│  │ Static & Video │ │ Motion Reel    │                  │                  │
│  │ Canvas Engine  │ │ Engine (9:16)  │                  │                  │
│  │ (lib/canvas/*) │ │ (lib/motion/*) │                  │                  │
│  └───────┬────────┘ └───────┬────────┘                  │                  │
└──────────┼──────────────────┼───────────────────────────┼──────────────────┘
           │                  │                           │
           └──────────────────┼───────────────────────────┘
                              │ HTTP JSON (4.5 MB limit, AbortSignal)
                              ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                Express Serverless API Gateway (api/index.ts)               │
│                                                                            │
│  ├─ api/config.ts (Multi-Key Pool, Cloudinary/Buffer/Zernio Env, Limiter)  │
│  ├─ POST /api/generate       -> api/controllers/generateController.ts      │
│  │    ├─ Tier 1: Gemini Key Pool (Primary -> Backup #2 -> Pool Keys)       │
│  │    ├─ Tier 2: Zero-Key Free AI Backup (Pollinations OpenAI-compatible)  │
│  │    └─ Tier 3: Deterministic Local Fallback (synthesizeCarousel)         │
│  ├─ POST /api/refine-slide   -> api/controllers/refineSlideController.ts   │
│  ├─ POST /api/generate-image -> api/controllers/imageController.ts         │
│  ├─ GET/POST/PATCH/DELETE /api/posts -> api/controllers/postsController.ts │
│  │    ├─ Primary: Neon Serverless PostgreSQL (api/db/postgres.ts)          │
│  │    ├─ Tier 2: Vercel KV / Upstash Redis                                 │
│  │    └─ Tier 3: Local Disk / Vercel /tmp + Browser IndexedDB Fallback     │
│  ├─ /api/publish/*           -> api/controllers/publishController.ts       │
│  │    ├─ GET  /api/publish/status        (Live Channels + Auto-Sweep)      │
│  │    ├─ GET  /api/publish/tiktok-music  (Zernio TikTok Commercial Music)  │
│  │    ├─ POST /api/publish/upload-media  (Signed SHA-1 Cloudinary Staging) │
│  │    ├─ POST /api/publish/dispatch      (Buffer GraphQL + Zernio REST v1) │
│  │    ├─ POST /api/publish/manage-post   (Reschedule/Unschedule/Delete)    │
│  ├─ GET  /api/proxy-image    -> api/controllers/proxyController.ts         │
│  └─ GET  /api/search-media   -> api/controllers/mediaController.ts         │
│     GET  /api/gather/radar   -> api/controllers/mediaController.ts         │
│     POST /api/gather/extract -> api/controllers/mediaController.ts         │
└────────────────────────────────────────────────────────────────────────────┘
```

## 2. Module Responsibilities

| Path | Responsibility |
|---|---|
| `api/index.ts` | Express router, Vercel rewrite path restoration (`x-matched-path`), CORS, rate limiting, security headers |
| `api/config.ts` | Startup env validation, `getGeminiKeyPool(req)` multi-key rotation, Cloudinary, Buffer, Zernio & Neon PostgreSQL credentials config, rate limiter |
| `api/db/postgres.ts` | Serverless PostgreSQL layer (`pg.Pool`, SSL enabled, connection pooler) storing posts in `saved_posts` with `JSONB` slide decks, relational indexing (`post_status`, `scheduled_for`, `updated_at`, `title_signature`), idempotent schema init, and atomic upserts (`ON CONFLICT (id) DO UPDATE`) eliminating duplicate drafts across multi-device sessions and serverless restarts |
| `api/freeAiFallback.ts` | Zero-key Pollinations AI text (`openai`/`mistral`) and 9:16 `flux` image fallback when Gemini keys are exhausted |
| `api/controllers/generateController.ts` | Bilingual deck synthesis (Carousel & 1-Slide), Google Search `groundingSupports` fact mapping, multi-key & free AI cascade |
| `api/controllers/postsController.ts` | Content Vault persistence prioritizing Neon PostgreSQL (`neon-postgres`), with automatic seed migration and graceful fallbacks (`cloud-kv`, `local-disk`, `vercel-tmp`) |
| `api/controllers/publishController.ts` | Signed SHA-1 Cloudinary upload (`uploadSlideToCloudinary`), automatic post-publish asset destruction (`destroyCloudinaryAsset`, `sweepExpiredCloudinaryAssets`), Buffer GraphQL API dispatch (`https://api.buffer.com`), Zernio REST API v1 dispatch (`https://zernio.com/api/v1/posts`), and TikTok Commercial Music catalog (`fetchZernioTikTokCommercialMusic`) |
| `api/controllers/proxyController.ts` | SSRF-hardened HTTPS image proxy with DNS resolution check, 2 MB cap, and SVG sanitization |
| `api/controllers/mediaController.ts` | Subject-based tech icon & Wikimedia search (`/api/search-media`), automated technical trend radar (`/api/gather/radar` across HN, Lobsters, Reddit, Cloudflare RSS, custom RSS, and curated stories), and SSRF-hardened web article reader extraction (`/api/gather/extract-url`) |
| `src/components/studio/PublishingHubWorkspace.tsx` | Full-page Phase 2 Publish & Posts Hub with 2 tabs (`Publish Active Post` and `Posts & Calendar`), dual aspect-ratio staging (`4:5` + `9:16`), and TikTok Background Sound selector with audio preview |
| `src/components/studio/PostManagerPanel.tsx` | Unified Post Lifecycle & Calendar Manager (`Posts List`, `7/14-Day Calendar`, `Bulk Schedule`, and `Weekly Program Review` modal trigger) supporting inline rescheduling, unscheduling, and remote queue cancellation across Buffer and Zernio |
| `src/components/studio/WeeklyProgramReviewPanel.tsx` | Modal interface for scanning trend radar topics, background bilingual deck synthesis, human review/editing of slide outlines, and batch scheduling to TikTok/Instagram peak hours (10:00, 12:00, 18:00 DZ local time) |
| `src/lib/gather/gatherClient.ts` | Client SDK for `/api/gather/*`, managing topic radar queries, background candidate generation with vault deduplication (`isTopicAlreadyInVault`), and topic-to-post conversions |
| `src/lib/publish/tiktokTitle.ts` | Pure standalone string utility (`stripLeadingDuplicateTikTokTitle`) decoupled from browser DOM/Canvas and IndexedDB to guarantee clean Vercel Node.js Serverless function bundling |
| `src/lib/publish/publishClient.ts` | Client SDK for `/api/publish/*` endpoints, dual aspect-ratio slide renderer (`uploadDeckSlidesForPublishing`), TikTok Commercial Music fetcher (`fetchTikTokCommercialMusic`), local-timezone schedule helpers, and metadata auto-derivation |
| `src/lib/theme/cadenceEngine.ts` | Posted history color cadence analyzer (`analyzePostHistoryCadence`, `resolveHarmoniousPaletteWithoutRepetition`) preventing consecutive same-color posts |
| `src/lib/canvas/dimensions.ts` | Platform dimension presets (`tiktok-9:16`, `ig-4:5`, `ig-3:4`, `ig-1:1`, `ig-9:16`), safe zones, and TikTok Photo Mode 3:4 viewport bounds |
| `src/lib/canvas/layoutAwareness.ts` | Pure mathematical layout engine enforcing vertical clearances, dynamic dimension scaling, `standaloneMeme` full-bleed layout, and anti-collision drag clamping |
| `src/lib/canvas/renderSlide.ts` | Pure 2D canvas projection across all supported dimensions for Carousel slides, 1-Slide Infographic Posters, Standalone Memes, and Video Slides |
| `src/lib/canvas/videoFrameExtractor.ts` | Extracts a 2×2 keyframe storyboard JPEG (`extractVideoStoryboardDataUrl`) from uploaded videos for Gemini Vision multimodal synthesis |
| `src/lib/canvas/singleSlideVideoExporter.ts` | Hardware-accelerated / `MediaRecorder` MP4 & WebM exporter (`exportSingleSlideVideo`) rendering MARROK slide chrome over video slides with preserved audio |
| `src/lib/canvas/exporter.ts` | Single JPG Q95 download, clipboard copy, Contact Sheet JPG, and 5-in-1 / Metricool ZIP bundle |
| `src/lib/synthesis/singleSlideCondenser.ts` | Condenses an 8-slide carousel into a 1-slide infographic poster with 3 bilingual takeaways |
| `src/lib/motion/marrokSlideChrome.ts` | Shared MARROK slide environment for Motion Reels (radial glow, 108px grid, CAD reticles, `drawMarrokVectorBadge` header, surface cards, bilingual spring copy, pagination footer) |
| `src/lib/motion/templates/*` | 4 animated 9:16 templates (`marrok-slides`, `kinetic-text`, `brand-intro`, `product-showcase`) |
| `src/lib/motion/sfxSynthesizer.ts` | 48kHz procedural sound synthesizer (`click`, `pop`, `thump`, `whoosh`) and 16-bit WAV encoder |
| `src/lib/motion/videoExporter.ts` | Browser `MediaRecorder` + Web Audio muxed video exporter (`.webm`/`.mp4`), `.wav` export, and standalone `.html` export |
| `src/lib/qaChecks.ts` | Single source of truth for `CHAR_LIMITS`, `SINGLE_SLIDE_CHAR_LIMITS`, and pre-export QA checks |
| `src/lib/riskChecks.ts` | Platform safety gate (`PASS` / `WARN` / `BLOCK`) for originality, copyright, cover quality, numbers, and repetition |

---

## 3. Vercel Serverless Architecture & File-Count Rules

- **Hobby Plan 12-Function Cap**: Vercel treats each `.ts` file in `/api` as a standalone Serverless Function and strictly limits Hobby deployments to a maximum of 12 functions. The `/api` directory is architected to remain strictly at **11 files**:
  - `api/index.ts` (router, middleware, path recovery)
  - `api/config.ts` (configuration, multi-key rotation)
  - `api/constants.ts` (tech logos, mime types)
  - `api/db/postgres.ts` (Neon Postgres pooler)
  - `api/prompts/systemPrompt.ts` (system prompt + response schema)
  - `api/controllers/generateController.ts`
  - `api/controllers/imageController.ts`
  - `api/controllers/postsController.ts`
  - `api/controllers/publishController.ts`
  - `api/controllers/proxyController.ts`
  - `api/controllers/mediaController.ts`
- **Regression Guard**: `src/lib/network/apiRouting.test.ts` validates that the recursive file count in `api/` is $\le 12$.
- **Serverless/Client Decoupling**: API controllers must never import modules with DOM, Canvas, or browser `import.meta.env` dependencies. All shared string utilities (such as `tiktokTitle.ts`) must remain pure Node/universal modules.

