# ADR 004: Automated Content Gathering, Peak-Hour Review Program & Vercel Serverless Consolidation

## Status
Accepted (2026-11-09)

## Context
1. **Automated Content Gathering**: The content studio needed a reliable way to discover high-signal technical breakthroughs across the engineering community (Hacker News, Lobsters, Reddit `r/programming`, `r/LocalLLaMA`, `r/devops`, Cloudflare Engineering Blog, custom RSS feeds) without manual copy-pasting.
2. **Weekly Peak-Hour Review Program**: Content performance on TikTok and Instagram peaks during specific daily slots (10:00, 12:00, and 18:00 local time). The user required a batch review workflow to generate candidate drafts in the background, review and edit copy/schedules, avoid past slots, and approve multi-post weekly schedules with one click.
3. **Vercel Hobby 12-Function Cap**: Vercel's zero-config serverless function detection counts all `.ts` files in `/api` toward the Hobby tier limit of 12 Serverless Functions (`No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan`). Adding separate controller files caused deployments to fail.
4. **Serverless Cross-Contamination**: Backend controllers must never import modules with DOM, Canvas, or browser `import.meta.env` dependencies (`postsVaultClient.ts`, `renderSlide.ts`), which caused CommonJS/esbuild packaging failures during Vercel function deployment.

## Decisions

### 1. Unified Topic Radar & SSRF-Protected Reader (`api/controllers/mediaController.ts`)
- Consolidated `/api/gather/radar` and `/api/gather/extract-url` into `api/controllers/mediaController.ts`.
- **Radar Aggregator**: Bounded 3.5s timeouts with `AbortSignal.timeout()` across Hacker News Firebase API, Lobste.rs JSON, Reddit hot JSON, and Cloudflare RSS, with automatic deduplication, keyword domain classification (`REVERSE ENGINEERING`, `AI AGENTS & MODELS`, `LINUX KERNEL`, `KUBERNETES & CLOUD`, `DISTRIBUTED SYSTEMS`), and quantitative metric extraction.
- **SSRF-Protected Article Reader**: Validates target URLs via `isAllowedProxyUrl()` (rejecting loopback, link-local, private RFC 1918 IPs, and AWS metadata addresses) and checks DNS resolution via `resolveAndValidateHost()`.

### 2. Weekly Peak-Hour Review Program (`WeeklyProgramReviewPanel.tsx` & `gatherClient.ts`)
- **Peak Hour Cadence**: Configured with `DAILY_PEAK_TIME_SLOTS = ['10:00', '12:00', '18:00']`.
- **Past-Slot Guard**: `computeWeeklyScheduleSlots()` accepts `{ skipPast: true }` so slots that have already passed in the creator's current local day are skipped and scheduled for upcoming days.
- **Human-in-the-Loop Review**: Gathers topics into a dedicated review modal, generates bilingual carousel drafts in the background via `/api/generate` with vault deduplication (`isTopicAlreadyInVault`), lets creators inspect and edit slide outlines, and batch-approves them into the publishing calendar.

### 3. Vercel Serverless Function Consolidation & Decoupling
- **Strict File Limit ($\le 12$ Files)**: Merged `gatherController.ts` into `mediaController.ts` and `responseSchema.ts` into `systemPrompt.ts`. The entire `/api` directory is strictly maintained at 11 files:
  1. `api/index.ts` (router, CORS, path restoration)
  2. `api/config.ts` (env & multi-key pool)
  3. `api/constants.ts` (tech logos, mime types)
  4. `api/db/postgres.ts` (Neon Serverless PostgreSQL connection pooler)
  5. `api/prompts/systemPrompt.ts` (MARROK system prompt + `CAROUSEL_RESPONSE_SCHEMA`)
  6. `api/controllers/generateController.ts` (`/api/generate`, `/api/refine-slide`)
  7. `api/controllers/imageController.ts` (`/api/generate-image`)
  8. `api/controllers/postsController.ts` (`/api/posts` CRUD)
  9. `api/controllers/publishController.ts` (`/api/publish/*`)
  10. `api/controllers/proxyController.ts` (`/api/proxy-image`)
  11. `api/controllers/mediaController.ts` (`/api/search-media`, `/api/gather/*`)
- **Decoupled Node Utilities**: Extracted `stripLeadingDuplicateTikTokTitle` into `src/lib/publish/tiktokTitle.ts` so `api/controllers/publishController.ts` has zero imports from browser canvas or storage client libraries.
- **Automated Regression Test**: `src/lib/network/apiRouting.test.ts` runs an automated file counter verifying `countFilesRecursive('api') <= 12`.

## Consequences
- Zero deployment failures on Vercel Hobby accounts.
- Clean separation of serverless backend from browser rendering engines.
- One-click weekly publishing review workflow operating at peak TikTok engagement times.
