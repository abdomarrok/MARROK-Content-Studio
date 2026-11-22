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
| `src/hooks/useDeckHistory.ts` | Multi-level undo/redo ring-buffer history for externally-controlled parent state, synchronous ref mirrors, monotonic async revision guards (`deckRevisionRef`), and compare-before snapshot toggle (`beforeEditsDeckRef`) |
| `src/hooks/useStudioHistory.ts` | Generic self-contained `<T>` immutable state ring-buffer primitive with internal `useState<T>`, synchronous ref mirrors, and keyboard shortcut resilience |
| `src/hooks/useStudioLayoutActions.ts` | Canvas element layout overrides, slide copy auto-fit, element deletion, and deck-wide layout synchronization |
| `src/hooks/useExportActions.ts` | 5-in-1 ZIP export with QA/Platform risk gates, single-slide clipboard copy, and hardware-accelerated MP4 single-slide video export |
| `src/hooks/useMediaIngestion.ts` | Client-side image compression, video storyboard frame extraction, smart dock input, and clipboard paste handler |
| `src/components/studio/inspector/CopyInspector.tsx` | Slide copy and content inspector delegating to `InlineSlideEditor` (bilingual headlines, body copy, hook variants, character counters, 1-tap auto-fit) or `MotionReelInspector` for 9:16 reels |
| `src/components/studio/inspector/VisualInspector.tsx` | Visual archetype coordinator delegating to `ArchetypeControls`, embedding `PositionInspector` in its position slot, and hosting `SlideImageStudio` for AI diagram generation |
| `src/components/studio/inspector/PositionInspector.tsx` | Layout override and positioning inspector wrapping `ElementInspector` for micro-adjustments (dx/dy nudge, scale, alignment, reset overrides, apply to all slides) |
| `src/components/studio/inspector/ReviewInspector.tsx` | Pre-export quality assurance and risk scorecard delegating to `PublishChecklist`, managing source verification, creator attribution, and export safety gates |
| `src/components/studio/inspector/CaptionInspector.tsx` | Social publishing copy inspector for bilingual TikTok/Instagram captions, dynamic topic hashtags, character count limits, video caption extraction, and Send to Publish Hub CTA |
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

### 2.1 Frontend State Architecture & Hook Responsibility Model

1. **State Ownership & Hierarchy**:
   - **Canonical Deck State**: Owned at the workspace root (`PublishingHubWorkspace.tsx` or `App.tsx`) as `[carousel, setCarousel]`. It is passed down to `AutonomousStudio` as `carousel: CarouselData` and `onUpdateCarousel: React.Dispatch<React.SetStateAction<CarouselData>>`. This ensures a single source of truth across the Studio editor, the Post Manager, Vault auto-sync, Theme Customizer, and Export modals.
   - **History Ring Buffer (`useDeckHistory`)**: Wraps the externally controlled `onUpdateCarousel` dispatch without duplicating deck state. Maintains synchronous ref mirrors (`pastRef`, `futureRef`, `carouselRef`) and revision counters (`deckRevisionRef`). It stores `beforeEditsDeckRef` on the first edit to power the Compare-Before view and provides monotonic revision tracking to safely discard stale background AI responses.
   - **Generic History Primitive (`useStudioHistory`)**: A generic, self-contained `<T>` ring-buffer hook owning internal `[state, setState]`. Used for isolated component-local state undo/redo buffers (e.g. specialized standalone editors) without leaking into parent workspace state.
   - **Layout Mutations (`useStudioLayoutActions`)**: Pure immutable slide and element layout operations (`handleUpdateElementLayoutOverride`, `handleUpdateSlideFields`, `handleUpdateCurrentSlide`, `handleDeleteCanvasElement`, `handleAutoFitCurrentSlide`, `handleResetSlideLayoutOverrides`, `handleApplyOverrideToAllSlides`, `handleApplySlideLayoutToAllSlides`). Preserves element identity, cleans empty takeaway overrides, deep-clones layout overrides using `structuredClone`, and strictly protects `manualLayoutLocked` slides.
   - **Export Orchestration (`useExportActions`)**: Encapsulates 5-in-1 multi-slide ZIP packaging, single-slide clipboard copying, and MP4 video generation behind strict QA and Platform Risk gates (`isBlocked`, `qaReport.canExport`, `riskReport.status === 'BLOCK'`).
   - **Media Ingestion (`useMediaIngestion`)**: Coordinates client-side image compression (`compressImageClientSide`), video storyboard keyframe extraction (`extractVideoStoryboardDataUrl`), object URL tracking (`trackAndReplaceBlobUrl`), and clipboard image pasting, with `isMountedRef` lifecycle guards and prompt expansion.
   - **Post Manager Panel Decomposition (`PostManagerPanel`)**: Coordinates Vault post records, filtering, and mutations (`onUpdatePost`, `onDeletePost`, `onBulkSchedule`) while delegating presentation to `PostManagerFilterBar` (search & filter tabs), `PostManagerCalendarView` (7/14-day interactive slots & conflict warnings), and `PostManagerBulkScheduleView` (verified-only cadence scheduling).

### 2.2 Studio Inspector Panel Architecture & Decomposition Model

In Phase 2.3.2, the 5 inspector tabs in `AutonomousStudio.tsx` were decomposed into dedicated components located in `src/components/studio/inspector/`:

1. **`CopyInspector.tsx`**:
   - Isolates Content and Motion editing interfaces.
   - Dispatches slide-level copy changes (`onUpdateField`), archetype switches (`onSetSlideType`), hook variant applications, and 1-tap copy auto-fitting (`onAutoFitSlide`).
   - Dynamically delegates to `MotionReelInspector` when `activePostFormat === 'reel'` and `InlineSlideEditor` for standard carousel/single/meme formats.
2. **`VisualInspector.tsx`**:
   - Coordinates visual archetype selection, layout mode toggling (`onToggleAutoLayout`), and AI visual direction (`onReimagineVisual`).
   - Embeds `PositionInspector` in the collapsible `positionSection` slot of `ArchetypeControls`.
   - Houses the lazy-loaded `SlideImageStudio` for AI-generated diagrams and illustrations.
3. **`PositionInspector.tsx`**:
   - Wraps `ElementInspector` to manage granular, non-destructive canvas element layout overrides (`dx`, `dy`, `scale`, `opacity`, `align`).
   - Supports both headless embedding inside `ArchetypeControls` and standalone inspector usage for the Position tab.
4. **`ReviewInspector.tsx`**:
   - Manages pre-export verification gates, wrapping `PublishChecklist`.
   - Displays real-time QA report badges (`PASS`/`WARN`/`FAIL`) and Platform Risk analysis (`PASS`/`WARN`/`BLOCK`).
   - Enforces the 2-flag human verification requirement (`Human Reviewed` and `Claims & Numbers Verified`) and powers the override dialog.
5. **`CaptionInspector.tsx`**:
   - Dedicated social publishing inspector for TikTok, Instagram, and LinkedIn posting copy.
   - Features real-time character counters, dynamic hashtag derivation, keyframe video caption generation, and the "Send to Publish Hub" CTA.

#### Architectural Evaluation: Context vs. Explicit Props in Subcomponents
An evidence-based audit was conducted regarding whether to introduce a React Context (`PostManagerProvider` or `InspectorProvider`) between parent coordinators and extracted subcomponents:
- **Decision**: Retain explicit, typed props.
- **Rationale**:
  - **Single-Level Depth**: Both `PostManagerPanel` and `AutonomousStudio` render their extracted subcomponents as immediate direct children (depth = 1). No prop drilling occurs through uninvolved intermediate layers.
  - **Traceability & Strict TypeScript Guarantees**: Direct props maintain compile-time type safety and navigation in IDEs, making refactorings immediately validated by `tsc --noEmit`.
  - **Test Isolation**: Subcomponents can be rendered and tested in Vitest without requiring wrapping mock provider boilerplate.
  - **Render Performance**: Explicit props avoid context-wide re-render cascades when unrelated slices of state update, aligning with React 19 compiler optimizations.

### 2.3 Core Engine Architecture & Modularization Model (Phase 2.4)

In Phase 2.4, four heavy internal business engines (~10,800 lines total) were decomposed into dedicated domain sub-packages while maintaining 100% backward compatibility via thin root facades:

1. **`src/lib/qa/` (Modular QA & Pre-Export Engine — decomposed from `qaChecks.ts`, 2,569 lines)**:
   - `types.ts`: QA severity, result, report, checklist types.
   - `constants.ts`: Character limits, typography floors (`>= 24px` titles/bodies, `>= 22px` footers), stop words, boilerplate & cliché patterns.
   - `textChecks.ts`: Length limits, Arabic BiDi isolation, and translation fidelity verification.
   - `contentQualityChecks.ts`: Generic placeholders, buzzword detection, and text repetition.
   - `structuralChecks.ts`: Slide count, CTA slide presence, creator attribution, safe zone margins, and WCAG contrast.
   - `gathererQualityGate.ts`: Summary-only hook detection & headless candidate validation decoupled from browser canvas.
   - `qaEngine.ts`: `runQAChecks` orchestrator.
   - `preExportChecklist.ts`: 12-point `runPreExportChecklist` verification.
   - `index.ts`: Barrel export.
   - `src/lib/qaChecks.ts`: 15-line backward-compatible facade.

2. **`src/lib/synthesis/smartVisual/` (Smart Visual Defaults Engine — decomposed from `smartVisualDefaults.ts`, 2,993 lines)**:
   - `constants.ts`: Stop words, placeholder labels, domain story owners.
   - `textIcons.ts`: `matchSlideIconsFromText`, `extractKeyPhrasesFromSlide`, and `extractSourceQuotedHubNodes`.
   - `subjectPairDetection.ts`: Migration & before-after tech product detection (`detectSubjectPairFromText`).
   - `hookClaimCard.ts`: `buildNonNumericHookClaimCard`.
   - `archetypeInference.ts`: `analyzeSlideTextForArchetype`, `inferBestSlideArchetype`, `inferBestDiagramVariant`, `inferDynamicCoverArchetype`, `deriveSlideCornerTag`, and `explainArchetypeChoice`.
   - `visualDefaultsResolver.ts`: `resolveSmartSlideVisuals` and default visual state resolver.
   - `hookEngine.ts`: `translateSlide1JargonToPlainOutcome` and `applyHookEngineToSlide1`.
   - `deckDiversifier.ts`: `diversifyDeckArchetypesAndVisuals`, `autoFitSlideCopyToLimits`, `autoSyncSlideGraphicsFromCopy`, `autoFinalizeCarouselDeck`, and `cleanCarouselContentQuality`.
   - `index.ts`: Barrel export.
   - `src/lib/synthesis/smartVisualDefaults.ts`: 15-line backward-compatible facade.

3. **`src/lib/canvas/layout/` (Canvas Layout Awareness Engine — decomposed from `layoutAwareness.ts`, 2,188 lines)**:
   - `constants.ts`: Minimum vertical gaps (`MIN_GAP_GRAPHIC_TO_TITLE=44`, `MIN_GAP_TITLES=18`, `MIN_GAP_TITLE_TO_BODY=36`, `MIN_GAP_BODIES=22`, `MIN_GAP_TO_FOOTER=24`).
   - `types.ts`: `TextBlockLayout`, `GraphicCardLayout`, `SwipeCueLayout`, and `ComputedSlideLayout`.
   - `compositionPresets.ts`: `applySlideCompositionPreset`.
   - `measureCache.ts`: Context caching and LRU layout memoization (`slideLayoutCache`, `buildSlideLayoutCacheKey`, `storeComputedLayout`).
   - `ctaLayout.ts`: Dedicated CTA slide layout computation (`computeCtaSlideLayout`).
   - `slideLayoutEngine.ts`: `computeSlideLayoutAwareness` (content text measurement, non-overlapping vertical stacking, progressive compression, vertical boundary enforcement).
   - `dragClamp.ts`: Anti-collision and viewport boundary element drag clamping (`clampElementDrag`).
   - `index.ts`: Barrel export.
   - `src/lib/canvas/layoutAwareness.ts`: 15-line backward-compatible facade.

4. **`src/lib/synthesis/extractor/` (Universal Ingestion & Synthesis Engine — decomposed from `universalExtractor.ts`, 3,054 lines)**:
   - `types.ts`: `UniversalSynthesisOptions`, `ExtractedMetric`, `ExtractedEntities`, and `StoryOptions`.
   - `entityResolution.ts`: `mentionsGoLanguage`, `normalizeComparisonName`, `tokenizeEntity`, `entityMentionedInClause`, `canonicalizeEntity`, and `resolveTechLogo`.
   - `metricsScanner.ts`: `formatMetricBullet`, `trimSlides`, `cleanRawInput`, `scanMetrics`, `selectWinningHookMetric`, and `parseComparativeEntities`.
   - `domainStoryBuilders.ts`: 11 domain story generators (`buildVcsStory`, `buildContainerStory`, `buildCacheStory`, `buildSecurityStory`, `buildKernelStory`, `buildAiStory`, `buildDatabaseStory`, `buildComparativeStory`, `buildAgentDelegationStory`, `buildHumorOrOpinionStory`, `buildGeneralSystemsStory`).
   - `userPointsBuilder.ts`: `parsePointTopicAndBody` and `buildDeckFromUserPoints`.
   - `universalSynthesizer.ts`: `finalizeSynthesizedDeckSlides` and `synthesizeUniversalCarousel`.
   - `index.ts`: Barrel export.
   - `src/lib/synthesis/universalExtractor.ts`: 7-line backward-compatible facade.

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

---

## 4. Architecture Governance & Dependency Boundary Rules

To prevent architecture erosion and maintain long-term developer velocity, MARROK Content Studio enforces strict directional dependency rules guarded by automated test suites:

### 4.1 Layered Dependency Rules
1. **Frontend Presentation Isolation**:
   - UI components (`src/components/`) depend only on domain types, client hooks (`src/hooks/`), and client SDKs (`postsVaultClient.ts`, `publishClient.ts`, `gatherClient.ts`).
   - UI components must never import Node runtime modules (`fs`, `path`, `child_process`), database drivers (`pg`), or server-only controllers.
   - Sub-panels (`src/components/studio/panels/`) and inspector modules (`src/components/studio/inspector/`) receive state and dispatchers via explicit, strictly typed props.
2. **Serverless API / Browser Decoupling Boundary**:
   - Code inside `api/` and `netlify/functions/` must run strictly in Node.js serverless execution environments.
   - Serverless code must never import browser/canvas modules (`renderSlide.ts`, `exporter.ts`, `imageLoader.ts`, `videoFrameExtractor.ts`), React hooks, or browser IndexedDB stores.
   - Serverless code must never reference DOM globals (`window`, `document`) or Vite's `import.meta.env`.
3. **Core Engine Public Facades**:
   - The four core engines (`qaChecks`, `smartVisualDefaults`, `layoutAwareness`, `universalExtractor`) are decomposed into modular domain packages (`src/lib/qa/`, `src/lib/synthesis/smartVisual/`, `src/lib/canvas/layout/`, `src/lib/synthesis/extractor/`).
   - External consumers must import strictly through the root compatibility facades:
     - `src/lib/qaChecks.ts`
     - `src/lib/synthesis/smartVisualDefaults.ts`
     - `src/lib/canvas/layoutAwareness.ts`
     - `src/lib/synthesis/universalExtractor.ts`
   - Bypassing facades to import internal engine implementation files is prohibited and blocked by `src/test/architectureBoundary.test.ts`.
4. **Vercel Hobby Serverless 12-File Cap**:
   - The total recursive count of `.ts` files in `/api` must remain $\le 12$ (currently 11). All API additions must be housed within existing controller boundaries or shared modules.

---

## 5. Engineering Standards & Coding Conventions

### 5.1 React Components
- **Single Responsibility**: Each component owns one visual surface or user interaction (e.g., `PostManagerCalendarView` strictly renders calendar slots and drag-rescheduling).
- **Explicit Props over Context**: Direct child components (depth = 1) receive explicit, typed props. Do not introduce speculative context providers (`InspectorContext`, `PostManagerContext`) for shallow component trees.
- **Pure Canvas Projection**: `renderSlide.ts` is a read-only 2D canvas projection. Never perform copy sanitization, character limit clamping, or asynchronous data loading inside the canvas draw loop.
- **No Inline Heavy Closures**: Avoid allocating complex inline handlers or arrays inside canvas draw loops or high-frequency render paths.

### 5.2 Custom Hooks
- **Cohesive State Slices**: Hooks manage focused concerns (`useDeckHistory` for undo/redo ring buffers, `useStudioLayoutActions` for layout mutations, `useExportActions` for ZIP/video exports, `useMediaIngestion` for image/video processing).
- **Asynchronous Lifecycle Guards**: All hooks with asynchronous operations (AI generation, video extraction, image compression) must use `isMountedRef` guards to prevent state updates on unmounted components.
- **Synchronous Ref Mirrors**: When an externally dispatched action depends on current state without waiting for a re-render cycle, maintain synchronous ref mirrors (`carouselRef`, `pastRef`, `futureRef`).

### 5.3 Domain & Pure Logic
- **Pure Functions**: Content analysis, archetype inference, layout calculations, and outbox state evaluation must remain pure functions taking explicit inputs and returning deterministic outputs.
- **Immutability**: Mutate data structures via immutable clones (`structuredClone` or object spread). Deep cloning via `JSON.parse(JSON.stringify())` is prohibited.
- **BiDi & Arabic Typography**: Technical terms must remain Latin script in Arabic copy. Arabic headlines must end with Arabic words (not Latin words followed by punctuation) to prevent RTL punctuation inversion.

### 5.4 Backend Services & Database
- **Authoritative Neon PostgreSQL**: Neon PostgreSQL is the single source of truth for persistent application state (`saved_posts`, `deleted_post_tombstones`, `inbox_triage_decisions`, `publish_outbox`, `auth_revoked_sessions`, `auth_login_attempts`).
- **Fail-Closed Persistence**: If `DATABASE_URL` is configured or the environment is production serverless, database failures must return `503 Service Unavailable` or `502 Bad Gateway`. Never perform silent `/tmp` shadow writes in production.
- **Idempotent Publishing Outbox**: All social dispatches must use transactional claiming (`SELECT ... FOR UPDATE`), fencing tokens (`lease_generation`), and provider idempotency keys (`Idempotency-Key` + `externalId`). Unconfirmed operations enter `outcome_unknown` quarantine to block duplicate posting.

### 5.5 Environment & Security Configuration
- **Fail-Closed Auth Gate**: Protected `/api/*` routes require `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (`scrypt$...`), and `SESSION_SECRET` (>=16 chars). Invalid hash format or missing configuration returns 503.
- **Zero Hardcoded Secrets**: Secrets must never be committed or logged. Client-side logging must never dump authentication headers, Bearer tokens, or API keys.

---

## 6. Testing Governance & Permanent Quality Gates

### 6.1 Testing Pyramid & Execution Gates
The test suite is organized into distinct layers to balance fast local developer feedback with thorough production verification:

```
┌────────────────────────────────────────────────────────┐
│   Playwright E2E Smoke Tests (npm run test:e2e)        │
│   Desktop & Mobile 390px — 5 Critical User Workflows   │
├────────────────────────────────────────────────────────┤
│   Vitest Integration & API Tests (npm test)            │
│   Auth, CORS, DB Outbox, Cloudinary Sweep, Radars      │
├────────────────────────────────────────────────────────┤
│   Permanent Characterization Tests                     │
│   (src/test/characterization/coreEngines*.test.ts)     │
│   QA Rules, Archetype Inference, Pixel Clearances      │
├────────────────────────────────────────────────────────┤
│   Architecture Boundary Tests                          │
│   (src/test/architectureBoundary.test.ts)              │
│   Facade Imports, Browser Decoupling, API File Count   │
├────────────────────────────────────────────────────────┤
│   TypeScript Strict Typecheck (npm run typecheck)      │
│   tsc --noEmit with "strict": true                     │
└────────────────────────────────────────────────────────┘
```

### 6.2 Permanent Characterization Invariants
Located in `src/test/characterization/coreEnginesCharacterization.test.ts`, these permanent characterization tests guard against regression in:
- **QA Engine**: Canonical character limits (`CHAR_LIMITS.enTitle=45`, `hookTitle=78`), single-slide poster limits, generic placeholder blockers (`System A / System B`), and Arabic translated term rules (`ARABIC_TRANSLATED_TERM_RULES`).
- **Smart Visual Defaults**: Semantic slide archetype inference (`compare`, `code`, `number`), verified 3-brand tech pair detection, non-numeric hook contrast claim cards, and deck diversification.
- **Canvas Layout Awareness**: Subpixel clearances (`MIN_GAP_GRAPHIC_TO_TITLE=44`, `MIN_GAP_TITLES=18`, `MIN_GAP_TITLE_TO_BODY=36`, `MIN_GAP_BODIES=22`, `MIN_GAP_TO_FOOTER=24`), slide 1 hook cover body hiding, and anti-collision drag clamping.
- **Universal Extractor**: Container story canonical sequence (`hub` -> `metric` -> `compare` -> `code` -> `row`), Go language mention disambiguation (`mentionsGoLanguage`), and metric extraction.
- **Publishing Outbox State Machine**: Aggregate status transitions (`pending`, `completed`, `partially_completed`, `quarantined`), retryable vs permanent failure categorization (`rate_limited`, `auth_config`, `timeout_interrupted`).
- **Security Gates**: Strict scrypt hash format validation (`scrypt$N$r$p$salt$hash`).

---

## 7. Error Taxonomy & Observability Standards

### 7.1 Unified Error Taxonomy
All errors across controllers, client SDKs, and business engines map to standard categories:

| Error Category | HTTP Status | Retryable? | Behavior / Handling |
|---|---|---|---|
| `ValidationError` | 400 Bad Request | No | Surface actionable message to user; block export/publish |
| `AuthenticationError` | 401 Unauthorized | No | Prompt re-login; redirect through `AuthGateModal` |
| `AuthorizationError` | 403 Forbidden | No | Reject unauthorized origin or invalid API secret |
| `RateLimitError` | 429 Too Many Requests | Yes | Trigger exponential backoff with jitter; respect `Retry-After` |
| `ExternalProviderError` | 502 Bad Gateway | Yes | Try fallback AI provider (Pollinations/Local) or schedule retry |
| `PersistenceUnavailableError` | 503 Service Unavailable | Yes | Fail closed in production; never allow split-brain disk writes |
| `TimeoutError` | 504 Gateway Timeout | Yes | Abort upstream fetch at 45s; transition outbox to `outcome_unknown` |
| `QuarantineError` | 409 Conflict | Manual | Non-idempotent timeout quarantine; requires admin review |

### 7.2 Observability & Redaction Guidelines
- **Correlation IDs**: Log entries for long-running workflows (AI synthesis, publishing dispatches, Cloudinary sweeps) should include a correlation identifier (`postId` or `leaseToken`).
- **Secret Redaction**: Logging utilities must never print:
  - Passwords or scrypt hashes.
  - Session cookies or Bearer tokens.
  - Gemini, Buffer, Zernio, or Cloudinary API keys.
  - Database connection strings with embedded credentials.

---

## 8. Performance Governance & Resource Budgets

### 8.1 Measured Production Bundle Baseline (Vite v8.3.5)
- **HTML Entry**: `dist/index.html` — `1.92 kB` (0.78 kB gzip)
- **Styles**: `dist/assets/index-*.css` — `113.86 kB` (16.28 kB gzip)
- **Main Client Application**: `dist/assets/index-*.js` — `542.77 kB` (132.65 kB gzip)
- **Canvas Rendering Engine**: `dist/assets/engine-canvas-*.js` — `739.60 kB` (249.77 kB gzip)
- **Publishing Hub Workspace**: `dist/assets/PublishingHubWorkspace-*.js` — `178.74 kB` (41.18 kB gzip)
- **Vendor React**: `dist/assets/vendor-react-*.js` — `210.91 kB` (65.85 kB gzip)
- **Motion Reel Engine**: `dist/assets/engine-motion-*.js` — `68.54 kB` (21.33 kB gzip)
- **Vendor ZIP (JSZip)**: `dist/assets/vendor-zip-*.js` — `95.93 kB` (28.48 kB gzip)
- **Lazy Modals**: `5 kB – 22 kB` each (loaded on demand)

### 8.2 Performance Budgets & Guardrails
1. **Initial Bundle Budget**: Total critical-path JavaScript before gzip must remain $\le 900\text{ kB}$ (gzip $\le 250\text{ kB}$).
2. **Canvas Engine Size**: The `engine-canvas` chunk bundles the offline Simple Icons catalog, mathematical geometry, and typography measurement. It is budget-capped at $\le 800\text{ kB}$ uncompressed.
3. **Execution Deadlines**:
   - `POST /api/generate`: 45s hard budget with `AbortSignal.timeout(45000)`.
   - `GET /api/gather/radar`: 12s timeout per upstream RSS/feed provider.
   - `POST /api/publish/dispatch`: 30s timeout per social provider.
4. **Debounced User Input**: Viewport text inputs must maintain $\ge 150\text{ms}$ debounce to prevent layout thrashing and canvas re-renders during active typing.

---

## 9. AI Developer Guide & Feature Placement Matrix

When extending MARROK Content Studio, AI coding agents and human engineers must implement new functionality in the established architecture locations:

| Feature / Extension | Implementation Path | Facade / Registration |
|---|---|---|
| New Slide Archetype | `src/lib/canvas/` & `src/lib/synthesis/smartVisual/` | Re-export via `smartVisualDefaults.ts` |
| New Inspector Tab | `src/components/studio/inspector/` | Register in `AutonomousStudio.tsx` |
| New PostManager View Mode | `src/components/studio/panels/` | Register in `PostManagerPanel.tsx` |
| New Social Publishing Provider | `api/controllers/publishController.ts` & `src/lib/publish/` | Wire to `publish_outbox.ts` state machine |
| New API Endpoint | `api/index.ts` & Netlify function `config.path` | Keep `/api` file count $\le 12$ |
| Shared State Mutation Hook | `src/hooks/` | Export from `src/hooks/index.ts` |
| Pure Text/Regex Utility | `src/lib/text/` | Pure module, no DOM or Node `fs` |
| Database Schema Evolution | `api/db/postgres.ts` | Add idempotent `CREATE TABLE IF NOT EXISTS` |

---

## 10. Technical Debt Inventory

| Location | Problem | Evidence | Impact | Severity | Recommended Solution | Complexity | Risk |
|---|---|---|---|---|---|---|---|
| `src/lib/synthesis/extractor/metricsScanner.ts:143` | Trailing `\b` in percentage regex prevents matching percentages followed by words (e.g. `"45% reduction"`) | `/\b(\d+(?:\.\d+)?)\s*%\b/gi` fails on `%` non-word boundary | Misses percentage metrics in text extraction | Low | Change regex to `/\b(\d+(?:\.\d+)?)\s*%(?!\w)/gi` | Low | Very Low |
| `src/components/AutonomousStudio.tsx` | Mega-coordinator component (~3,200 lines) with numerous state hooks | Component manages canvas, inspectors, modals, and format switcher | Slower IDE inspection; higher regression risk during edits | Medium | Incrementally extract format switcher and modal state into custom hooks | Medium | Low |
| `src/lib/network/httpClient.ts` | Ad-hoc fetch calls remain in legacy UI components (~40 call sites) | Raw `await fetch()` instead of `fetchJsonWithTimeout` | Inconsistent timeout handling and error normalization in legacy UI modals | Medium | Migrate remaining client fetch calls onto `src/lib/network/httpClient.ts` | Low | Very Low |
| `api/controllers/publishController.ts` | Large publishing controller file (~3,000 lines) combining Buffer, Zernio, Cloudinary, and Outbox | Single controller file manages three external SDKs | Harder to isolate social provider logic | Medium | Extract provider adapters (`bufferAdapter.ts`, `zernioAdapter.ts`) while keeping `/api` file count $\le 12$ via shared sub-directory | Medium | Medium |
| `src/lib/canvas/constants.ts` | Monolithic SVG icon strings inside `bundledTechSvgs.ts` contribute ~120 kB to canvas bundle | Static inline SVG paths for 56 tech icons | Increases canvas engine chunk size | Low | Evaluate lazy-loading tech icon SVGs or dynamic import on demand | Medium | Low |


