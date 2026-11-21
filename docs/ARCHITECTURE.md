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
│  │  ├─ Carousel | 1-Slide | Meme|Reel │  │  (PublishingHubWorkspace.tsx)│  │
│  │  ├─ Smart Meme & Graphic Workflows │  │  ├─ Inbox: Lazy Radar + 4-   │  │
│  │  ├─ Feed Color Cadence Auto-Rotate │  │  │   Factor Score + Angle Gate│  │
│  │  └─ ViewportCanvas / ReelViewport  │  │  ├─ Draft: 2-Flag Review +   │  │
│  │                                    │  │  │   Publish Now / Composer   │  │
│  └───────┬──────────────────┬─────────┘  │  └─ Schedule: 7/14d Calendar │  │
│          │                  │            │      + >2/day Cadence Warn   │  │
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
│  ├─ POST /api/refine-slide   -> api/controllers/generateController.ts      │
│  ├─ POST /api/generate-image -> api/controllers/imageController.ts         │
│  ├─ GET/POST/PATCH/DELETE /api/posts -> api/controllers/postsController.ts │
│  │    ├─ Authoritative: Neon Serverless PostgreSQL (api/db/postgres.ts;   │
│  │    │   fail-closed 503/502 when DATABASE_URL is set or in prod serverless)│
│  │    ├─ Distributed Infra: Upstash Redis (rate limiting & optional cache) │
│  │    └─ Local Dev/Test + Browser IndexedDB (`offlineDraft` cache/queue)   │
│  ├─ /api/publish/*           -> api/controllers/publishController.ts       │
│  │    ├─ GET  /api/publish/status        (Live Channels + Auto-Sweep)      │
│  │    ├─ GET  /api/publish/tiktok-music  (Zernio TikTok Commercial Music)  │
│  │    ├─ GET  /api/publish/outbox        (Durable Outbox Inspection)       │
│  │    ├─ POST /api/publish/recover       (Lease/Partial Dispatch Recovery) │
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
| `api/db/postgres.ts` | Serverless PostgreSQL layer (`pg.Pool`, SSL enabled, connection pooler) authoritative for all server-managed application records across 6 tables: `saved_posts` (`JSONB` decks, relational indexes, atomic `ON CONFLICT (id) DO UPDATE`), `deleted_post_tombstones` (deletion audit & client cache fencing), `inbox_triage_decisions` (authoritative radar triage decisions), `publish_outbox` (transactional `SELECT ... FOR UPDATE` claiming, `lease_generation` fencing tokens, `dispatch_fingerprint` uniqueness, partial unique index `idx_publish_outbox_active_post` on active `dispatching` posts, per-target remote IDs, and retry/recovery indexes), `auth_revoked_sessions` (distributed JWT revocation with TTL index), and `auth_login_attempts` (distributed brute-force lockouts) |
| `api/controllers/generateController.ts` | Bilingual deck synthesis (Carousel & 1-Slide), `/api/refine-slide`, Google Search `groundingSupports` fact mapping, multi-key Gemini rotation, and zero-key Pollinations AI text fallback |
| `api/controllers/imageController.ts` | Gemini 9:16 image generation/editing with zero-key Pollinations Flux image fallback |
| `api/controllers/postsController.ts` | Content Vault persistence with Neon PostgreSQL (`neon-postgres`) as the authoritative fail-closed store (`503`/`502` `VaultPersistenceUnavailableError` when `DATABASE_URL` fails or is unset in production serverless; zero `/tmp` shadow writes on PG success; legacy `cloud-kv` and remote vault sync retired), paired with local-disk fallback strictly for local dev/tests, and `offlineDraft`-only client resync in `postsVaultClient.ts` |
| `api/controllers/publishController.ts` | Signed SHA-1 Cloudinary upload (`uploadSlideToCloudinary`), automatic post-publish asset destruction (`destroyCloudinaryAsset`, `sweepExpiredCloudinaryAssets`), Buffer GraphQL (`https://api.buffer.com`), Zernio REST v1 (`https://zernio.com/api/v1/posts` with `Idempotency-Key` + `externalId` GET reconciliation), fail-closed `publish_outbox` persistence (`503 OutboxPersistenceUnavailableError` when `DATABASE_URL` fails or is unset in production serverless; local-disk fallback strictly for local dev/tests), `StaleOutboxLeaseError` (`409`), `outcome_unknown` quarantine for Buffer timeouts without cross-provider failover, and `/api/publish/outbox` + cron/API-secret authenticated `/api/publish/recover` (supporting both Netlify scheduled functions and Vercel Cron via `CRON_SECRET` / `API_SHARED_SECRET`) |
| `api/controllers/proxyController.ts` | SSRF-hardened HTTPS image proxy with DNS resolution check, 2 MB cap, and SVG sanitization |
| `api/controllers/mediaController.ts` | Subject-based tech icon & Wikimedia search (`/api/search-media`), automated technical trend radar (`/api/gather/radar` across HN, Lobsters, Reddit, Cloudflare RSS, custom RSS, and curated stories), SSRF-hardened web article reader extraction (`/api/gather/extract-url`), fail-closed Postgres inbox triage persistence (`TriagePersistenceUnavailableError` `503`/`502` in PG or production serverless), and direct Telegram Bot Webhook automation (`/api/gather/telegram-webhook`) |
| `src/lib/security/sessionAuth.ts` | Fail-closed authentication gate (`503` when auth config or `scrypt$` hash format is invalid; fails closed on PostgreSQL outages during session verification and lockout checks), self-healing table bootstrap on `42P01` (fails closed if bootstrap fails), scrypt verification, HMAC-SHA256 cookies (`__Host-marrok_session`), Bearer iframe tokens, and timing-safe webhook/secret checks |
| `src/lib/network/httpClient.ts` | Isomorphic `fetchJsonWithTimeout` + HTML warmup/proxy detection + bounded `withRetry` (for idempotent read paths) built on `requestDeadline.ts` |
| `src/lib/studio/preExportAutoFix.ts` | Pure deterministic deck transformation engine (`applyPreExportAutoFixToDeck`) powering one-tap Pre-Export QA fixes |
| `src/components/AutonomousStudio.tsx` | Phase 1 Unified Autonomous Content Studio coordinator integrating `useSlideNavigation`, `useDeckHistory`, `useStudioLayoutActions`, `useExportActions`, `useMediaIngestion`, and `useThemeCadence` for deterministic canvas rendering, multi-format switching, live AI visual direction, and QA-gated publishing |
| `src/components/studio/PublishingHubWorkspace.tsx` | Flattened Phase 2 Publish Hub (`Inbox · Draft · Schedule`), live Neon/Buffer/Zernio/Cloudinary/Telegram status strip, dual aspect-ratio staging (`4:5` + `9:16`), mandatory 2-flag safety gate, immediate `Publish Now`, and TikTok Background Sound selector |
| `src/components/studio/PostManagerPanel.tsx` | Draft Review Queue & Schedule/Calendar Manager coordinator delegating to `PostManagerFilterBar`, `PostManagerCalendarView`, and `PostManagerBulkScheduleView`, enforcing `Human Reviewed` + `Claims & Numbers Verified` gates, `>2 posts/day` cadence overload warnings, inline rescheduling, and `Publish Now` dispatch |
| `src/components/studio/panels/PostManagerFilterBar.tsx` | Queue/calendar/bulk view mode switcher, status filter tabs, search query input, and cadence overload warning banner |
| `src/components/studio/panels/PostManagerCalendarView.tsx` | 7/14-day interactive calendar grid, open slot indicators, inline quick-reschedule, and verified draft assignment |
| `src/components/studio/panels/PostManagerBulkScheduleView.tsx` | Verified-only draft batch selector, customizable cadence presets (`daily`, `weekdays`, `mon-wed-fri`, `tue-thu-sat`), and peak-time batch scheduler |
| `src/hooks/useDeckHistory.ts` | Multi-level undo/redo ring-buffer history, async revision guards, and compare-before toggle |
| `src/hooks/useStudioLayoutActions.ts` | Canvas element layout overrides, slide copy auto-fit, element deletion, and deck-wide layout synchronization |
| `src/hooks/useExportActions.ts` | 5-in-1 ZIP export with QA/Platform risk gates, single-slide clipboard copy, and hardware-accelerated MP4 single-slide video export |
| `src/hooks/useMediaIngestion.ts` | Client-side image compression, video storyboard frame extraction, smart dock input, and clipboard paste handler |
| `src/components/studio/WeeklyProgramReviewPanel.tsx` | Inbox container managing lazy trend radar scanning, on-demand 8-slide storyboard hydration (`hydrateCandidateDeckOnDemand`), editable `Marrok angle` validation, and safe Draft-only queueing |
| `src/lib/gather/gatherClient.ts` | Client SDK for `/api/gather/*`, managing lazy Slide 1 Hook previews, 4-factor composite scoring (`freshness`, `engagement`, `clientRelevance`, `platformRisk`), `Already Covered` vault deduplication, and quality-gated Draft queueing |
| `src/lib/bundledTechSvgs.ts` | Offline bundled Simple Icons / Devicon SVG catalog (`56` verified icons + named product registry), `resolveRealTechSystem()` strict product resolver, `NON_PRODUCT_WORDS` denylist, and `isPlaceholderOrEmptyBrandValue()` validator |
| `src/lib/synthesis/smartVisualDefaults.ts` | Strict `detectSubjectPairFromText()` migration/comparison detector, topic-aware `analyzeSlideTextForArchetype()` & `explainArchetypeChoice()`, and Slide 1 non-empty metric/hook enforcement |
| `src/lib/publish/tiktokTitle.ts` | Pure standalone string utility (`stripLeadingDuplicateTikTokTitle`) decoupled from browser DOM/Canvas and IndexedDB to guarantee clean Vercel Node.js Serverless function bundling |
| `src/lib/publish/publishOutbox.ts` | Pure Node/universal durable publishing state machine (`classifyProviderFailure`, `reconcileInterruptedOperations` with `outcome_unknown`, `computeOutboxAggregateState`, `evaluateExistingOutboxClaim`, `Retry-After` + bounded-jitter backoff, `leaseGeneration` fencing tokens, `buildZernioIdempotencyIdentity`) plus atomic serialized local-disk sidecar store strictly for non-serverless/test fallback |
| `src/lib/publish/publishClient.ts` | Client SDK for `/api/publish/*` endpoints, dual aspect-ratio slide renderer (`uploadDeckSlidesForPublishing`), TikTok Commercial Music fetcher (`fetchTikTokCommercialMusic`), local-timezone schedule helpers, and metadata auto-derivation |
| `src/lib/theme/cadenceEngine.ts` | Posted history color cadence analyzer (`analyzePostHistoryCadence`, `resolveHarmoniousPaletteWithoutRepetition`) preventing consecutive same-color posts |
| `src/lib/canvas/constants.ts` | Platform dimension presets (`tiktok-9:16`, `ig-4:5`, `ig-3:4`, `ig-1:1`, `ig-9:16`), safe zones, `24px`/`22px` typography floors, and smart aspect-ratio-aware Full Meme bounds (`resolveSmartFullMemeCardBounds`, `FULL_MEME_CARD_W = 1008`, `pad = 6`) |
| `src/lib/canvas/layoutAwareness.ts` | Pure mathematical layout engine enforcing vertical clearances, dynamic dimension scaling, balanced `subjectPair` 540px card positioning, `standaloneMeme` full-bleed layout, and anti-collision drag clamping |
| `src/lib/canvas/renderSlide.ts` | Pure 2D canvas projection across all supported dimensions for Carousel slides, Subject Pair transitions (`renderSubjectPair.ts`), 9 Diagram Schematics (`renderDiagram.ts`), 1-Slide Infographic Posters, Standalone Memes, and Video Slides |
| `src/lib/canvas/videoFrameExtractor.ts` | Extracts 2×2 video keyframe storyboards (`extractVideoStoryboardDataUrl`), builds spotless meme decks (`buildCleanMemeCarouselDeck`), non-destructively inserts slide graphic photos (`applySlideGraphicPhoto`), and runs Vision AI photo analysis (`analyzeImageForMemeAndCaption`) |
| `src/lib/canvas/singleSlideVideoExporter.ts` | Hardware-accelerated / `MediaRecorder` MP4 & WebM exporter (`exportSingleSlideVideo`) rendering MARROK slide chrome over video slides with preserved audio |
| `src/lib/canvas/exporter.ts` | Single JPG Q95 download, clipboard copy, Contact Sheet JPG, and 5-in-1 / Metricool ZIP bundle |
| `src/lib/synthesis/singleSlideCondenser.ts` | Condenses an 8-slide carousel into a 1-slide infographic poster with 3 bilingual takeaways |
| `src/lib/motion/marrokSlideChrome.ts` | Shared MARROK slide environment for Motion Reels (radial glow, 108px grid, CAD reticles, `drawMarrokVectorBadge` header, surface cards, bilingual spring copy, pagination footer) |
| `src/lib/motion/templates/*` | 4 animated 9:16 templates (`marrok-slides`, `kinetic-text`, `brand-intro`, `product-showcase`) |
| `src/lib/motion/sfxSynthesizer.ts` | 48kHz procedural sound synthesizer (`click`, `pop`, `thump`, `whoosh`) and 16-bit WAV encoder |
| `src/lib/motion/videoExporter.ts` | Browser `MediaRecorder` + Web Audio muxed video exporter (`.webm`/`.mp4`), `.wav` export, and standalone `.html` export |
| `src/lib/qaChecks.ts` | Single source of truth for `CHAR_LIMITS`, `SINGLE_SLIDE_CHAR_LIMITS`, `24px`/`22px` typography checks, Arabic English-script tech term checks, Subject Pair brand rules, and zero-placeholder export blocking |
| `src/lib/riskChecks.ts` | Platform safety gate (`PASS` / `WARN` / `BLOCK`) for originality, copyright, brand/logo limits, cover quality, numbers, and repetition |

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

