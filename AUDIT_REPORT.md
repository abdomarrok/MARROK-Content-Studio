# MARROK TikTok Carousel & Motion Studio — Architecture Audit

## Scorecard

| # | Pillar | Score |
|---|---|---|
| 1 | Functional Correctness & Resilience | **8.5 / 10** |
| 2 | AI Intelligence & Anti-Hallucination | **8.0 / 10** |
| 3 | End-to-End Autonomy | **8.0 / 10** |
| 4 | Social Media Compliance | **8.5 / 10** |
| 5 | Graphic Design & Layout Intelligence | **8.5 / 10** |
| 6 | Format & Creative Psychology | **7.5 / 10** |
| 7 | Potential & Gaps | **7.0 / 10** |
| | **Weighted overall** | **~8.1 / 10** |

---

## 1. Functional Correctness & Resilience — 8.5/10

**Strengths**
- True 3-tier cascade: Gemini key pool → zero-key Pollinations → local synthesizer. `handleGenerateCarousel` (`api/controllers/generateController.ts:450`) dedupes prompt parts, validates input modes/MIME, caps prompt at 50k, and gates on `validateSourceSufficiency` before spending a token (`:505-516`).
- Deadline discipline: 45s global budget via `AbortController` + `setTimeout` (`:571-572`), per-request `AbortSignal.timeout()` on every outbound provider call (publish `20_000`/`12_000`/`8_000`ms in `publishController.ts:139,224,704`).
- Cache + **in-flight coalescing** (`:531-562`) prevents thundering-herd duplicate Gemini spend — genuinely production-grade.
- Provider failover is real, not cosmetic: Buffer primary → Zernio failover → Metricool CSV (`publishController.ts:1457-1560`), TikTok Zernio → Buffer → CSV (`:1562-1644`). Per-channel `channelResults` + `warnings` surface partial failure instead of silently succeeding.
- Cloudinary lifecycle is correct: **no 0ms destroy on `shareNow`** because provider media workers fetch asynchronously; deferred sweep at `+1h` (`:1646-1649`, `sweepExpiredCloudinaryAssets` `:294`).
- Motion export has hardware backpressure (`videoExporter.ts:71-96`), WebCodecs→MediaRecorder fallback, blob URL revocation (`:629-637`).

**Weaknesses (actionable)**
- **Dispatch is not idempotent.** `handleDispatchPublish` re-dispatches to Buffer/Zernio on every call and only cancels prior IDs when the caller passes `cancelExistingBeforeDispatch: true` (`:1387`). A double-click or retried request double-posts. Add a dispatch lock keyed on `postId` + a persisted `dispatchFingerprint`.
- **No transactional outbox.** `upsertSingleStoredPost` (`:1745`) runs *after* remote providers already accepted the post. A crash between dispatch and upsert loses remote IDs → orphaned live posts.
- Blob-URL hygiene is good at the single download helper but not uniformly enforced across canvas/clipboard paths.
- `api/freeAiFallback.ts` referenced in AGENTS.md **does not exist** — fallback lives inline in `generateController.ts:296` and `api/controllers/imageController.ts:27`. Docs drift invites future mis-edits.

## 2. AI Intelligence & Anti-Hallucination — 8.0/10

**Strengths**
- `MARROK_SYSTEM_PROMPT` (`api/prompts/systemPrompt.ts`) encodes a real "ZERO AI SLOP & TOPICAL TONE CONSTITUTION": explicit DevOps-jargon blacklist on financial topics (latency, blue-green, ingress, p99), no-fabricated-benchmark rule, golden-hook exemplars. This is materially better than generic "be helpful" prompts.
- `mapFactsWithGroundingSupports` (`generateController.ts:378-405`) maps Gemini grounding supports back onto the deck, so citations are attached per-claim rather than dumped wholesale.
- Schema-constrained output (`CAROUSEL_RESPONSE_SCHEMA`) + role-specific model chains + cooldown on `overload/not_found` (`:141-241`).
- `validateSourceSufficiency` blocks thin inputs pre-spend; `detectSubjectPairFromText`/`resolveRealTechSystem` (`smartVisualDefaults.ts:605-686`) refuses to invent brand pairs. Placeholder brands (`System A`, `PIPELINE MIGRATION`, `TBD`) are hard-blocked in `bundledTechSvgs.ts` and re-checked in QA.
- Arabic: `arabicBiDi.ts` provides `fixArabicPunctuation`, `isolateEmbeddedLatinInArabic`, `splitArabicForBidiRender`, `sanitizeArabicSlideText` — Latin tech nouns stay LTR inside RTL runs. `checkArabicTranslatedTechTerms` (`qaChecks.ts:378`) warns on over-translation.

**Weaknesses**
- **No post-generation verification pass.** Grounding supports are mapped but numbers/claims aren't machine-compared against source text (no NLI/entailment or numeric-diff check). "Verified Numbers" is a human checkbox, not a check.
- Single-shot generation: no self-critique → regenerate loop. QA is a gate, not a repair loop; `runQAChecks` can `FAIL` but doesn't feed failures back into a retry with targeted instructions.
- Grounded mode is only triggered when prompt ≤ 200 chars (`isLongInput` at `:517`) — long, source-rich inputs paradoxically get *less* grounding.

## 3. End-to-End Autonomy — 8.0/10

**Strengths**
- Genuine raw-input→publication path: Topic Radar (`/api/gather/radar`), 4-factor scoring (freshness/engagement/clientRelevance/platformRisk), "Already Covered" vault dedupe, lazy hook hydration (`hydrateCandidateDeckOnDemand`), Draft-only acceptance.
- Feed color cadence is closed-loop over the Vault: `analyzePostHistoryCadence` reads `postStatus === 'posted'` records to avoid consecutive same-palette posts; `autonomousPipeline.ts` auto-rotates during synthesis.
- Scheduling is real: 7–14d calendar, bulk schedule, >2/day warning, peak-slot allocation (`mediaController.ts:1905-1944`), Telegram approval with **persistent callback replay protection** (`:2145-2164`) and `update_id` idempotency.
- 4.5MB body cap + per-IP rate limit + strict CORS allowlist (wildcard rejected) + fail-closed auth (`503` until scrypt/session secrets set).

**Weaknesses**
- **Human review is mandatory**, so "autonomy" stops at Draft. That's a defensible safety choice, but it means no true unattended cadence.
- **No analytics ingestion** — nothing reads back TikTok/IG metrics. Cadence avoids repetition but cannot learn "this hook converted."
- Failed dispatches aren't auto-retried with backoff (manual re-dispatch only); no dead-letter queue.

## 4. Social Media Compliance — 8.5/10

**Strengths**
- Safe zones are centralized in `src/lib/canvas/constants.ts` (`CANVAS_WIDTH=1080`, `SAFE_MARGIN_LEFT=84`, `SAFE_MARGIN_RIGHT=930`, `SAFE_HEADER_Y=206`, `SAFE_FOOTER_CEILING_Y=1428`, `SAFE_MAX_Y=1650`, `PAGINATION_DOT_Y=1472`) and *enforced*, not just drawn: `checkTikTokSafeZoneViolations` (`qaChecks.ts:1360`) and `checkArabicSafeZone` (`:1302`).
- Typography floors are hard-gated across all presets: `MIN_TITLE_FONT_SIZE=24`, `MIN_BODY_FONT_SIZE=24`, `MIN_FOOTER_FONT_SIZE=22`; `checkMinFontSizeViolation` (`qaChecks.ts:1461-1525`) rejects overflow-override scale `< 0.75` or text `< 24px`, and `:2038` rejects any preset spec whose minimums undercut the global floor.
- Export contract: JPG 1080×1920 Q95 only (PNG rejected), exact-dimension check, last-slide CTA, credit presence, first-frame check, duplicate-body check (`runQAChecks` `:1985`).
- 5-in-1 ZIP includes `carousel-manifest.json`, `post_metadata.json`, `claims_citations.txt` — auditable provenance is a differentiator.
- Platform Risk engine is separate from QA (`riskChecks.ts`) with `PASS/WARN/BLOCK` and items `originality | copyright | first-frame | unverified-numbers | repetition`; offline/fallback engines are flagged as third-party.

**Weaknesses**
- TikTok safe-zone constants are **static**; TikTok has changed UI chrome repeatedly. No versioned safe-zone profile / per-platform override set.
- **No caption-limit validation per platform** (IG 2,200 / TikTok 2,200 / LinkedIn 3,000 / X 280). A long `enBody`+caption can pass QA and still be truncated by the network.
- Non-9:16 presets are supported by the canvas spec but there's no automated re-layout verification for `ig-4:5`/`ig-1:1` beyond font-floor checks.
- Alt text exists for Metricool CSV (`buildMetricoolCsvRowFromDeck`) but isn't a universal export artifact.

## 5. Graphic Design & Layout Intelligence — 8.5/10

**Strengths**
- `layoutAwareness.ts` is the strongest single module: measured clearances (`MIN_GAP_GRAPHIC_TO_TITLE=44`, `MIN_GAP_TITLES=18`, `MIN_GAP_TITLE_TO_BODY=36`, `MIN_GAP_BODIES=22`, `MIN_GAP_TO_FOOTER=24`), ceiling compression, font scaling, `clampElementDrag`, and a "Final Unconditional Safe-Zone Boundary Guard" that clamps graphics into `safeFooterCeilingY`/`headerSafeFloorY`.
- `renderSlide.ts` is a pure read-only projection (no sanitization in the draw loop) with `document.fonts.ready` + per-archetype drawers: `hub, row, number, metric, code, compare, image, cta, poster, subjectPair, takeaways`.
- Real archetype depth: 12 renderers incl. `renderDiagram.ts` (47KB, 9 variants: topology/stack/isolation/takeaway/scatter/graph/clusters/split/features), `renderCompare`, `renderSubjectPair`.
- Subject-pair logo logic is disciplined: `detectSubjectPairFromText` only fires for two *verified distinct* software products in a migration/before-after, official SVGs capped at ≤14% slide width / 151px, owner rendered as text wordmark, mandatory `"Not affiliated with <Company>"`, and graceful fallback to `row`.
- Palette system (`palettes.ts`, `specThemes.ts`, `cadenceEngine.ts` topic→palette affinity) keeps the feed visually coherent.

**Weaknesses**
- Collision detection is **bounding-box**, not ink-aware: a diagram's whitespace still "collides." No occlusion metric.
- `renderDiagram.ts` at 47KB and `qaChecks.ts` at 2,160 lines are maintainability hazards; no visual-regression snapshots exist for the 5 presets × 12 archetypes matrix.
- Typography fitting is measurement-driven but not content-aware (no widow/orphan or ragging control).

## 6. Format & Creative Psychology — 7.5/10

**Strengths**
- Enforced narrative arc (Hook→Problem→Mechanism→Proof→Takeaway→CTA) with an explicit headline spec: hook 2–8 words, no colon, must end in `. ? !` (`checkHeadlineSpecRule`, `qaChecks.ts:422`).
- `checkBoilerplatePhrases` (`:800`) and `checkContentQuality` (`:624`) suppress LLM filler; `condenseCarouselToSingleSlide` produces 3 bilingual takeaways for poster decks.
- Format breadth is real: `carousel | single | meme | reel`, with meme-specific smart card hugging (`FULL_MEME_CARD_W=1008`, 6px padding), Vision-AI captioning, and no category tag.
- Motion engine adds 4 templates (`marrok-slides`, `kinetic-text`, `brand-intro`, `product-showcase`) + `resolveSmartTransition`, procedural 48kHz Foley with a true-peak ceiling of 0.85 (`sfxSynthesizer.ts`), and container duration repair for MP4/WebM (`containerDurationFix.ts`).

**Weaknesses**
- **No performance-driven format/hook selection.** Format choice is heuristic/manual; hooks aren't ranked against historical engagement.
- No variant generation (A/B hooks per deck) — one hook per topic.
- Motion scoring is lower-confidence in this audit: templates were reviewed only at signature/structure level, not frame-by-frame.

## 7. Potential & Gaps — 7.0/10

**Missing industry features**
- Analytics feedback loop (TikTok/IG/LinkedIn insights → scoring, hook selection, cadence weighting).
- A/B testing of hooks/captions with automatic winner promotion.
- Self-critique/repair generation loop (QA `FAIL` → targeted regeneration).
- Multi-account / multi-client workspaces with per-brand palettes and tone profiles.
- Trend velocity & saturation prediction (radar scoring uses static 4 factors, not slope of engagement).
- Native video carousel / true Reel publishing (currently photo slides + separate motion export).
- Localization beyond EN/AR; per-platform caption truncation strategy.
- Background job queue for sweeps/dispatch (currently request-scoped + cron function).

**Top-3 highest-ROI architectural improvements**
1. **Idempotent publish + transactional outbox.** Persist an intent record with a `dispatchFingerprint` before provider calls, make `handleDispatchPublish` a no-op on duplicate fingerprints, and reconcile remote IDs in a retryable outbox worker. Eliminates double-posting and orphaned live posts — the highest-severity correctness risk in the system (`publishController.ts:1387-1760`).
2. **Close the analytics loop.** Ingest per-post metrics (views/saves/completion) from Zernio/Buffer, persist to Postgres keyed by `title_signature`, and feed them into `cadenceEngine` + a hook-ranking module. Converts the pipeline from "avoids repetition" to "repeats what worked" — the single largest quality lever.
3. **Split the render/QA monolith + add visual-regression snapshots.** Decompose `renderDiagram.ts` (47KB) and `qaChecks.ts` (2,160 lines) into per-archetype modules, and add Playwright/canvas snapshot tests across 5 presets × 12 archetypes. Locks in the (currently excellent) layout guarantees against regressions and makes the audit-flagged bounding-box collisions fixable incrementally.

**Doc-drift to fix now (cheap, high value)**
- AGENTS.md cites non-existent `api/freeAiFallback.ts`; point it at `generateController.ts:296` / `imageController.ts:27`.
- AGENTS.md safe-zone numbers (1555 ceiling / 365px bottom) disagree with actual `SAFE_FOOTER_CEILING_Y=1428` / `SAFE_MAX_Y=1650` in `constants.ts`. Reconcile so future agents don't "correct" working code.
