# MARROK Content Studio — Architecture Guide

## 1. System Topology Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     Client SPA (React 19 + Vite 8)                         │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Header Phase Switcher: [1. Create Studio]  <--->  [2. Publish Hub]   │  │
│  └──────────────────┬───────────────────────────────────┬───────────────┘  │
│                     ▼                                   ▼                  │
│  ┌────────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │ Phase 1: AutonomousStudio.tsx      │  │ Phase 2: PublishingHub       │  │
│  │  ├─ Carousel | 1-Slide | Reel      │  │  (PublishingHubWorkspace.tsx)│  │
│  │  ├─ Standalone Meme & Video Slide  │  │  ├─ Active & Weekly Calendar │  │
│  │  ├─ Feed Color Cadence Auto-Rotate │  │  ├─ 99-Col Metricool CSV     │  │
│  │  └─ ViewportCanvas / ReelViewport  │  │  │   Interactive Preview     │  │
│  └───────┬──────────────────┬─────────┘  │  ├─ Hybrid Channel Router    │  │
│          │                  │            │  │   (Buffer API vs CSV)     │  │
│          ▼                  ▼            │  └─ Quotas & Cloudinary Clean│  │
│  ┌────────────────┐ ┌────────────────┐   └──────────────┬───────────────┘  │
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
│  ├─ api/config.ts (Multi-Key Pool, Cloudinary/Buffer Env, Rate Limiter)    │
│  ├─ POST /api/generate       -> api/controllers/generateController.ts      │
│  │    ├─ Tier 1: Gemini Key Pool (Primary -> Backup #2 -> Pool Keys)       │
│  │    ├─ Tier 2: Zero-Key Free AI Backup (Pollinations OpenAI-compatible)  │
│  │    └─ Tier 3: Deterministic Local Fallback (synthesizeCarousel)         │
│  ├─ POST /api/refine-slide   -> api/controllers/refineSlideController.ts   │
│  ├─ POST /api/generate-image -> api/controllers/imageController.ts         │
│  ├─ GET/POST/PATCH/DELETE /api/posts -> api/controllers/postsController.ts │
│  ├─ /api/publish/*           -> api/controllers/publishController.ts       │
│  │    ├─ GET  /api/publish/status        (Quotas + Auto-Sweep Expired)     │
│  │    ├─ POST /api/publish/upload-media  (Signed SHA-1 Cloudinary Staging) │
│  │    ├─ POST /api/publish/dispatch      (Buffer GraphQL API + Auto-Clean) │
│  │    └─ POST /api/publish/cleanup-media (Cloudinary image/destroy Sweep)  │
│  ├─ GET  /api/proxy-image    -> api/controllers/proxyController.ts         │
│  └─ GET  /api/search-media   -> api/controllers/mediaController.ts         │
└────────────────────────────────────────────────────────────────────────────┘
```

## 2. Module Responsibilities

| Path | Responsibility |
|---|---|
| `api/index.ts` | Express router, Vercel rewrite path restoration (`x-matched-path`), CORS, rate limiting, security headers |
| `api/config.ts` | Startup env validation, `getGeminiKeyPool(req)` multi-key rotation, Cloudinary & Buffer credentials config, rate limiter |
| `api/freeAiFallback.ts` | Zero-key Pollinations AI text (`openai`/`mistral`) and 9:16 `flux` image fallback when Gemini keys are exhausted |
| `api/controllers/generateController.ts` | Bilingual deck synthesis (Carousel & 1-Slide), Google Search `groundingSupports` fact mapping, multi-key & free AI cascade |
| `api/controllers/postsController.ts` | Validated & Posted Vault persistence (`vercel-tmp` / `memory-fallback`), preserving schedule and Cloudinary metadata |
| `api/controllers/publishController.ts` | Signed SHA-1 Cloudinary upload (`uploadSlideToCloudinary`), automatic post-publish asset destruction (`destroyCloudinaryAsset`, `sweepExpiredCloudinaryAssets`), Buffer GraphQL API dispatch (`https://api.buffer.com`), and free-tier quota tracking |
| `api/controllers/proxyController.ts` | SSRF-hardened HTTPS image proxy with DNS resolution check, 2 MB cap, and SVG sanitization |
| `src/components/studio/PublishingHubWorkspace.tsx` | Full-page Phase 2 Publishing & Scheduling Hub with Weekly Calendar Queue, Hybrid Buffer/Metricool Channel Router, Interactive 99-Column Metricool CSV Preview Table, and Cloudinary Cleanup Controls |
| `src/lib/publish/publishClient.ts` | Official 99-column Metricool CSV generator (`OFFICIAL_METRICOOL_CSV_HEADERS`, `generateMetricoolBulkCsv`), auto-derived `TikTok Title` ($\le 90$c), `First Comment Text`, `Document title` ($\le 58$c), `Alt text picture 1..10`, and weekly slot calculator |
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
