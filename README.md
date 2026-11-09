# MARROK Content Studio

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![React 19](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS_v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge)
![Google GenAI](https://img.shields.io/badge/Google_GenAI-8E75C2?style=for-the-badge&logo=google&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

<p align="center">
  <strong>Multimodal content studio converting complex engineering breakthroughs, screenshots, code diffs, architecture diagrams, and transcripts into TikTok & Instagram Carousels (9:16, 4:5, 3:4, 1:1), 1-Slide Infographic Posters, 9:16 Motion Reels, and bilingual (English + Arabic) captions.</strong>
</p>

[Architecture](specs/architecture.md) • [Log Steps](specs/logsteps.md) • [Design System](specs/archetypes-and-design-system.md) • [API Specs](specs/api-and-schemas.md)

</div>

---

## ⚡ Highlights & Key Capabilities

### 🧠 Autonomous Creation Engine (`src/lib/autonomousPipeline.ts`)
Creators provide a single input (topic prompt, engineering summary, architecture screenshot, or code diff). The engine autonomously executes a complete end-to-end refinement pipeline:
- **Intelligent Synthesis:** Calls `/api/generate` with zero-latency deterministic fallback (`synthesizer.ts`).
- **Autonomous Visual Pacing Balancer:** Enforces zero adjacent duplicate diagram layouts across `row` slides by rotating through `['topology', 'stack', 'isolation', 'takeaway']` using the least-used variant.
- **Self-Healing Canvas Typography:** Auto-fits text inside pills, badges, node cards, and comparison columns using `fitTextInBox`, stepping down font size or smart-wrapping to 2 lines to prevent any overflow without manual edits.
- **Dynamic Vertical Optical Centering:** Measures exact graphic bottom and bilingual copy block height, distributing vertical breathing room with a 38% top cushion / 62% bottom ratio.
- **Arabic RTL Line-Height & Margin Polish:** Generous line-heights (1.45x–1.55x) prevent ascender/descender clashes with English text, strictly maintaining the right safe margin ($x \le 945$).
- **Markdown & Syntax Stripping:** Eliminates noisy bolding markers (`**`), header symbols (`#`), and stray ellipsis dots that clutter high-impact mobile slides.
- **Arabic BiDi Punctuation Linting:** Automatically detects Latin words in Arabic lines and places punctuation on the correct side, eliminating punctuation jump artifacts.
- **Spec §8 Limit Fitting:** Single source of truth (`CHAR_LIMITS` in `src/lib/qaChecks.ts`) guarantees English headlines stay $\le 45$ chars (`arTitle` $\le 40$) and English body text stays $\le 140$ chars (`arBody` $\le 150$).
- **Auto Architecture Diagram Generation:** Detects technical mechanism slides and generates vertical 9:16 schematics automatically.
- **Pre-Publish QA & Platform Safety Gate:** Runs both structural QA checks (`src/lib/qaChecks.ts`) and platform safety/originality checks (`src/lib/riskChecks.ts`).

### 🛡️ Slide Layout Awareness & Anti-Collision Engine (`src/lib/canvas/layoutAwareness.ts`)
MARROK guarantees that slide elements never collide or overlay each other across all 8 slide archetypes:
- **Zero-Overlap Clearance Guarantee:** Dynamically computes the effective physical bottom of any visual card (factoring in card height, scaling, and $dY$ translations), guaranteeing a minimum $44\text{px}$ positive clearance before the headline starts.
- **Alphabetic Baseline Compensation:** Offsets canvas font baselines (`firstBaselineY = actualTitleTop + fontSize * 0.82`) so tall capital letters never overlap diagram borders.
- **Cascading Vertical Flow:** Each subsequent block strictly flows below its preceding neighbor with guaranteed minimum safe gaps (`MIN_GAP_TITLES = 18px`, `MIN_GAP_TITLE_TO_BODY = 36px`, `MIN_GAP_BODIES = 22px`).
- **Anti-Collision Drag Clamping (`clampElementDrag`):** Restricts viewport pointer dragging, keyboard arrow nudges, and inspector sliders so elements cannot be dragged onto neighboring blocks or outside safe zones.
- **Footer Ceiling Compression Pass:** Automatically compresses and shifts text stacks if long copy or user offsets approach the TikTok pagination dots at $y = 1710\text{px}$.

### 🖼️ AI Architecture Diagram Studio (`gemini-nano-banana-2.1`)
- **Native 9:16 Vertical Diagrams:** Powered by `POST /api/generate-image` utilizing configurable Gemini image models (`GEMINI_IMAGE_MODELS`, default `gemini-nano-banana-2.1,gemini-3.1-flash-lite-image`) with `{ aspectRatio: '9:16', imageSize: '1K' }`.
- **Zero-Config 1-Click Theme Schematic:** Automatically derives the technical diagram prompt from the slide's `enTitle`, `diagramNodes`, and deck's exact hex colors (`theme.accent`, `theme.baseBg`, `theme.surface`), producing a matching dark OLED schematic with 1 click.
- **Prompt-Based Image Editing:** Pass an existing slide diagram with natural language revision directives (validated under Vercel's 4.5 MB payload cap).

### 🎨 The MARROK 8-Archetype Visual System
1. **The Hook (`hub`):** Central customizable hero icon and tag pill connected to 2–6 orbiting satellites (`satLabels`) via dynamic radial vectors.
2. **Technical Diagram (`row`):** 9 technical schematic variants (`topology`, `stack`, `isolation`, `takeaway`, `scatter`, `graph`, `clusters`, `split`, `features`) with connected nodes, connectors, and telemetry bars.
3. **Step Number Counter (`number`):** Giant 220px accent numeral counter with optional micro-badge label for procedural workflows.
4. **Metric Hero Card (`metric`):** Giant high-contrast metric value (e.g. `200x`, `0ms`, `99.9%`), category label, sparkline curve, and delta pill.
5. **Code / Terminal Window (`code`):** Monospace terminal window with macOS dots, line numbers, CRT scanlines, and diff syntax (`$`, `+`, `-`, `✔`).
6. **Comparison Split (`compare`):** Side-by-side legacy vs modern cards with problem/solution bullet points and circular `VS` badge.
7. **Image Visual Card (`image`):** Elevated technical diagram or visual asset container with `contain` or `cover` fit, caption badge, and blueprint grid.
8. **Final CTA (`cta`):** Geometric branding emblem, domain question, CTA pill, and required creator/source attribution credit.

### 📌 Standalone 1-Slide Infographic Poster, Video & Meme Modes (`src/lib/synthesis/singleSlideCondenser.ts`, `src/lib/canvas/singleSlideVideoExporter.ts`)
- **Dual Visual Modes:** Toggle between **Dense Infographic Poster** (`poster` layout with compact top graphic + bilingual headlines + 3 numbered bilingual takeaway cards) and **Standard Slide Archetype**.
- **Standalone Meme Full-Bleed Mode (`standaloneMeme`):** One-click toggle on `image` slides that hides the bottom English/Arabic title and body block and expands the visual frame (`h = 1260px`) so self-contained memes and infographics command the full vertical stage without redundant captions.
- **Single-Slide Video Ingestion & MP4 Export (`videoFrameExtractor.ts` & `singleSlideVideoExporter.ts`):** Upload any `.mp4`/`.webm`/`.mov` clip to extract a 2×2 keyframe storyboard for Gemini Vision analysis, and export a muxed `.mp4`/`.webm` video framed inside MARROK's OLED chrome with original audio preserved.
- **Expanded Copy Limits (`SINGLE_SLIDE_CHAR_LIMITS`):** Supports deeper single-frame breakdowns (`enTitle` $\le 60$, `arTitle` $\le 55$, `enBody` $\le 220$, `arBody` $\le 240$) and 3 bilingual takeaway items.
- **1-Click Carousel Condenser:** Instantly condense any 8-slide carousel into a 1-slide poster (or expand back to 8 slides without losing your work), complete with a clean `SOURCE //` + `@MARROK` footer without carousel pagination dots.

### 🎨 Feed Color Cadence & Smart Palette Rotation (`src/lib/theme/cadenceEngine.ts`)
- **Posted History Cadence Analysis (`analyzePostHistoryCadence`):** Inspects your posted Vault history (`postStatus === 'posted'`) to prevent consecutive same-color posts on your social grid.
- **Harmonious Conflict Resolution (`resolveHarmoniousPaletteWithoutRepetition`):** Automatically rotates to the least-used harmonious palette when an AI-synthesized topic matches a recently used accent color, and displays a live **Recommended Next Palette** banner inside the Theme Customizer.

### 🎬 9:16 Motion Reel Studio (`src/lib/motion/`)
- **Authentic MARROK Slide Chrome in Motion:** Every frame renders MARROK's OLED base background, radial ambient glow, `108px` engineering grid, CAD safe-zone reticles (`SYS_REF // 1080x1920.CAD_SAFE // MOTION_REEL`), glowing `32×32px` `drawMarrokVectorBadge` header + `MARROK` wordmark, elevated dark surface cards, and animated scene pagination footer.
- **4 Spring-Physics Templates:**
  - `marrok-slides` (**MARROK Slide Deck**): Animates your full carousel or single-slide deck with orbital hub schematics, 3-stage pipelines, live typing code terminals, counting benchmark metrics with sparklines, and spring-animated bilingual EN/AR headlines and body copy.
  - `kinetic-text` (**Kinetic Slide Hook**): High-retention staggered Arabic & English typography with MARROK vector badges and surface cards.
  - `brand-intro` (**MARROK Brand Intro**): Staggered geometric matrix build, radial scatter reveal of the MARROK vector logo, and bilingual slide lockup.
  - `product-showcase` (**Architecture & Metrics**): Problem hook card, UI assembly, staggered mechanisms, and a 200x metric counter.
- **48kHz Procedural SFX Synthesizer & Video Exporter:** Synthesizes mathematical sound effects (`click`, `pop`, `thump`, `whoosh`) synced to scene keyframes and exports muxed **1080×1920 WebM/MP4 Video**, **16-bit PCM WAV Audio**, or **Standalone HTML**.

### 🚀 Consolidated Publish & Posts Hub — Direct Buffer + Zernio APIs (`src/components/studio/PublishingHubWorkspace.tsx`, `src/components/studio/PostManagerPanel.tsx`)
Switch between **`1. Create Studio`** and **`2. Publish & Posts (N)`** from the top header to access a unified, 2-tab publishing and post lifecycle workspace:
- **100% Direct 4-Channel API Routing:**
  - **Buffer Free GraphQL API (`https://api.buffer.com`):** Directly publishes or schedules carousels and single-slide posts to **Instagram (`@marrok_org`)**, **Facebook (`Marrok (Algiers)`)**, and **LinkedIn (`Marrok`)** (10-slot rolling queue per channel, using `metadata.instagram.type: 'post'` for native multi-slide Instagram carousels).
  - **Zernio Free REST API v1 (`https://zernio.com/api/v1`) & Hosted MCP Server (`https://mcp.zernio.com/mcp`):** Directly publishes or schedules **TikTok Photo Carousels (`@marrokorg`, up to 35 `9:16` slides)** and **Instagram (`@marrok_org`)** with unlimited posts on Zernio's 2-account Free Tier.
- **TikTok Commercial Music Library Auto-Pick & Audio Preview (`GET /api/publish/tiktok-music`):**
  - Automatically attaches a trending licensed track from Zernio's live TikTok Commercial Music catalog (`autoAddMusic: true` + `musicSoundInfo: { musicSoundId }`) by default, and provides an interactive **TikTok Background Sound** selector with **Preview / Stop** audio playback and **Shuffle** controls.
- **Dual Aspect-Ratio Auto-Staging & Post-Publish Cleanup (`api/controllers/publishController.ts`):**
  - Automatically renders and stages both `4:5` (`1080×1350` for IG/FB/LI) and `9:16` (`1080×1920` for TikTok) slide JPEGs to Cloudinary (`marrok_staging/*`) and sweeps/destroys staged assets `+1 hour` after publication so free storage never fills up.
- **Unified Posts & Calendar Manager (`PostManagerPanel.tsx`):**
  - Manage all **Drafts**, **Scheduled**, **Posted**, and **Needs Review** decks in one place with **List**, **7/14-Day Calendar**, and **Bulk Schedule** views, supporting 1-click **Edit in Studio**, **Reschedule**, **Unschedule to Drafts**, and **Delete** synced across Buffer, Zernio, and Vault.

### 🗄️ Neon Serverless PostgreSQL Content Vault (`api/db/postgres.ts`)
- **Durable Cross-Device Cloud Sync:** Real-time persistence powered by Neon Serverless PostgreSQL with SSL connection pooling (`DATABASE_URL`), keeping draft decks, scheduled slots, and published history identical across desktop computers, tablets, and mobile phones.
- **Atomic Upsert & Zero Duplicates:** Uses `ON CONFLICT (id) DO UPDATE` and normalized title signatures to eliminate duplicate starter drafts across Vercel serverless cold starts.
- **Full Slide Fidelity with JSONB:** Complete bilingual slide typography, diagrams, archetypes, and layout overrides are preserved without rigid table migration friction.
- **Fail-Safe Offline Fallback:** Gracefully falls back to local JSON file storage (`data/saved-posts.json` or `/tmp`) and Browser IndexedDB if the network drops or Neon is temporarily unreachable.

### 📦 Complete Deliverables & 5-in-1 Ready-to-Share Bundle (100% JPG)
1-click export packages everything needed to publish or archive offline:
- `slide1.jpg` through `slideN.jpg` (multi-ratio 9:16, 4:5, 3:4, and 1:1 high-res JPG Q95 slides — never PNG, strictly TikTok & Safe-Zone compliant)
- `caption-bilingual.txt` & `caption.txt` (Ready-to-paste copy with screen hooks, English + Arabic captions, and topic-derived hashtags)
- `first_comment.txt` (Pinned first comment to drive engagement, discussion points, and source links)
- `carousel-manifest.json` & `post_metadata.json` (Full serialized `CarouselData` and grounding provenance for deck archival)
- `claims_citations.txt` (Audit log of claims mapped strictly via Google Search `groundingSupports`)
- `short_caption.txt` (Clean 2-line version for TikTok quick post)
- `README.txt` (Creator publishing guide)

### 📡 Automated Content Gatherer & Weekly Peak-Hour Program Review (`src/components/studio/WeeklyProgramReviewPanel.tsx`, `src/lib/gather/gatherClient.ts`)
- **Live Engineering Trend Radar (`GET /api/gather/radar`):** Continuously scans and aggregates breaking technical breakthroughs from Hacker News, Lobste.rs, Reddit tech communities (`r/programming`, `r/LocalLLaMA`, `r/devops`), Cloudflare Engineering RSS, custom RSS/Atom feeds, and curated architectural deep-dives.
- **SSRF-Hardened URL Reader (`POST /api/gather/extract-url`):** Extracts clean articles, technical metrics, and architectural summaries from any public engineering blog, preventing loopback or private IP access.
- **Peak-Hour Cadence Engine (10:00 · 12:00 · 18:00 DZ):** Auto-schedules approved posts to peak engagement windows while intelligently skipping slots that have already passed in the creator's current local day (`skipPast: true`).
- **Human-in-the-Loop Batch Review:** Lets creators preview candidate titles, trigger background AI draft synthesis with vault deduplication (`isTopicAlreadyInVault`), inspect/edit slide outlines, and approve multi-post weekly schedules into Buffer and Zernio with 1 click.

### 🛡️ Security, Grounding Provenance & Pre-Publish Safety Gate
- **Authentic Grounding Provenance:** Decks are marked `verified_live` (`Grounded`) **only** when Google Search grounding returns actual web sources. Ungrounded LLM outputs are marked `unverified_draft` (`Ungrounded AI`) with `userReviewed = false`, and offline fallback decks are marked `Offline Synthesizer`. Only an explicit human click on **"I reviewed this draft"** sets `userReviewed = true`.
- **Platform Risk & QA Gate (`src/lib/riskChecks.ts` & `src/lib/qaChecks.ts`):** Evaluates Originality, Copyrighted IP/Audio, First-Frame Cover Quality, Unverified Numeric Claims, and Slide Repetition (`PASS` / `WARN` / `BLOCK`), plus placeholder text, Arabic line-ending punctuation, and $y \le 1760$ safe-zone clearance. Blocks export on `BLOCK` / `FAIL` unless explicitly overridden.
- **Brand Logos & Wikimedia Attribution:** Official brand logos (`src/lib/techLogos.ts`) preserve their official colors on neutral tiles by default (SVG recoloring via `/api/proxy-image?color=` is strictly opt-in). When importing diagrams or media from Wikimedia Commons via the Media Search tool, include the author/license attribution in the Creator/Channel Credit field rendered on the CTA slide and in `claims_citations.txt`.

---

## 📂 Documentation Index

- 📋 [**`docs/AUDIT.md`**](docs/AUDIT.md) — Phase 0 Staff Engineering Audit, data flow trace, and risk register.
- 🏗️ [**`docs/ARCHITECTURE.md`**](docs/ARCHITECTURE.md) — System architecture diagram, module boundaries, Vercel Serverless Function limits, and pipeline contracts.
- 🧭 [**`docs/ADR/`**](docs/ADR/) — Architecture Decision Records:
  - [ADR 001: Server-Side Gemini Gateway](docs/ADR/001-server-side-gemini-gateway.md)
  - [ADR 002: Deterministic Canvas Export](docs/ADR/002-deterministic-canvas-export.md)
  - [ADR 003: Neon PostgreSQL Persistence Vault](docs/ADR/003-neon-postgresql-persistence-vault.md)
  - [ADR 004: Content Gathering, Peak-Hour Review & Vercel Serverless Consolidation](docs/ADR/004-content-gathering-and-vercel-serverless-consolidation.md)
- 🔒 [**`SECURITY.md`**](SECURITY.md) — SSRF defenses, SVG sanitization, rate limiting, and secret management.
- 🤝 [**`CONTRIBUTING.md`**](CONTRIBUTING.md) — Development workflow, testing rules, and PR checklist.
- 📝 [**`CHANGELOG.md`**](CHANGELOG.md) — Production handoff changelog and behavior changes.

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js `>= 20.0.0` (see `.nvmrc`)
- `npm` (single lockfile: `package-lock.json`)
- (Optional) Google Gemini API Key (app includes a zero-latency deterministic synthesizer fallback that operates without an API key)

### 2. Installation
```bash
npm install --legacy-peer-deps
```

### 3. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | Optional* | `""` | Primary server-side Gemini API key |
| `GEMINI_API_KEY_BACKUP` | Optional | `""` | Secondary Gemini API key from another account for automatic failover on 429/quota limits |
| `GEMINI_API_KEYS` | Optional | `""` | Comma-separated pool of additional Gemini API keys |
| `FREE_BACKUP_AI_ENABLED` | Optional | `"true"` | Enables zero-key Pollinations AI text + 9:16 Flux image backup before offline fallback |
| `FREE_TEXT_BACKUP_MODELS` | Optional | `"openai,mistral,llama"` | Comma-separated zero-key Pollinations text models |
| `GEMINI_GENERATION_MODELS` | Optional | `gemini-3.8-flash,...` | Comma-separated model cascade for `/api/generate` and `/api/refine-slide` |
| `GEMINI_IMAGE_MODELS` | Optional | `gemini-nano-banana-2.1,...` | Comma-separated model cascade for `/api/generate-image` |
| `CLOUDINARY_CLOUD_NAME` | Optional | `""` | Cloudinary cloud name for temporary slide image staging during publishing |
| `CLOUDINARY_API_KEY` | Optional | `""` | Cloudinary API key for signed uploads and post-publish auto-cleanup |
| `CLOUDINARY_API_SECRET` | Optional | `""` | Cloudinary API secret for SHA-1 signed upload and `image/destroy` cleanup |
| `BUFFER_API_KEY` | Optional | `""` | Buffer Developer API token (`https://api.buffer.com`) for direct IG/FB/LinkedIn publishing |
| `ZERNIO_API_KEY` | Optional | `""` | Zernio API token (`https://zernio.com/api/v1` + `https://mcp.zernio.com/mcp`) for direct TikTok Photo Carousel (with Commercial Music) & Instagram publishing |
| `DATABASE_URL` | Optional | `""` | Neon PostgreSQL connection string (`postgresql://...`) for durable cross-device post sync |
| `ALLOWED_ORIGIN` | Optional | `*` | CORS `Access-Control-Allow-Origin` header value |
| `API_SHARED_SECRET` | Optional | `""` | Shared secret (`x-api-secret`) required when relying on server `GEMINI_API_KEY` |
| `RATE_LIMIT_RPM` | Optional | `30` | Per-IP requests per minute limit on AI endpoints |

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📜 Available Scripts

| Command | Action |
|---|---|
| `npm run dev` | Starts Express backend and Vite development server on port 3000 |
| `npm run typecheck` | Runs TypeScript compiler validation (`tsc --noEmit`) |
| `npm run lint` | Alias for `tsc --noEmit` |
| `npm test` | Runs Vitest unit & integration test suite |
| `npm run build` | Compiles production bundle with Vite into `/dist` |
| `npm run start` | Launches server (`NODE_ENV=production npm run start` serves `/dist`) |
| `npm run clean` | Cleans build artifacts |

---

## ☁️ Deployment (Vercel) & Troubleshooting

1. **Vercel Configuration (`vercel.json`):**
   - `api/index.ts` is configured with `"maxDuration": 60` and `"memory": 1024`.
   - All `/api/*` routes rewrite to `/api/index`, which restores the original path from `x-matched-path` / `x-forwarded-uri`.
2. **Troubleshooting:**
   - **`413 Payload Too Large` on Image Edit:** Vercel serverless functions cap request bodies at ~4.5 MB. The client automatically compresses uploaded screenshots to 1280px JPEG, and `/api/generate-image` rejects base64 payloads exceeding 3.8M chars with a clear message.
   - **Arabic Font Rendering in Export:** Ensure the browser has loaded Google Fonts (`Cairo` and `Plus Jakarta Sans`) before exporting offline. The canvas renderer uses `direction = 'rtl'` and explicit `Cairo` font stacks.
   - **LocalStorage Quota Exceeded:** `src/App.tsx` automatically catches `QuotaExceededError` and strips oversized inline `data:image/` strings from the saved draft so text edits are never lost.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.

