# AGENTS.md

## Stack & entrypoints
- Single npm package (no workspaces): React 19 / TS 7 / Vite 8 / Tailwind v4 / Express + `@google/genai`. Node **22** (`.nvmrc`, `engines`) — README/CONTRIBUTING's `>=20` is stale.
- HTTP: `server.ts` -> `api/index.ts` (Vite middleware when `NODE_ENV !== 'production'`, else static `dist/`). UI: `src/main.tsx` -> `src/App.tsx` -> `AutonomousStudio.tsx` or `studio/PublishingHubWorkspace.tsx`.

## Commands
- `npm install` (`.npmrc` sets `legacy-peer-deps`; `package-lock.json` only lockfile). `npm run dev`: Express + Vite on `:3000`, binds `0.0.0.0`, `PORT` overrides.
- `npm run lint` === `npm run typecheck` === `tsc --noEmit`. CI runs install -> lint -> test -> build; run those before finishing.
- `npm test` = Vitest (jsdom, `isolate: false`, setup stubs canvas/image; e2e excluded). One file: `npx vitest run <path>`; filter: `npm test -- <pattern>`; watch: `npm run test:watch`. `SlideImageStudio.test.tsx` can time out under full-suite load; rerun it alone before investigating.
- `npm run test:e2e` = Playwright `e2e/smoke.spec.ts`; auto-starts `npx tsx server.ts` with `DISABLE_HMR=true` (mobile 390px + desktop 1280px); not in CI.
- `npm run start` does not set `NODE_ENV`: production needs `$env:NODE_ENV='production'; npm run start` (PowerShell). `npm run hash-password` -> scrypt hash for `ADMIN_PASSWORD_HASH`.

## Auth & security
- Every `/api/*` route (and its bare alias) fails closed `503` until `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (scrypt), `SESSION_SECRET` (>=16 chars) are set; only `/api/health`, `/health`, `/api/auth/*` are public. Auth is `__Host-marrok_session` cookie, `Bearer` token, or iframe token in `sessionStorage.marrok_iframe_session_token_v1`.
- Cron/webhook callers bypass session only via `x-api-secret: API_SHARED_SECRET`; Telegram webhook also checks `x-telegram-bot-api-secret-token`. Server Gemini keys are only used with a session or matching `x-api-secret` when `API_SHARED_SECRET` is set.
- CORS is an explicit allowlist (`ALLOWED_ORIGINS`/`ALLOWED_ORIGIN`/`APP_URL`); `*` rejected, unknown Origin -> `403`.
- Preview/branch deploys block mutating `/api/posts` and `/api/publish/*` unless `ALLOW_PREVIEW_WRITES=true`.

## API & deployment wiring
- Routes in `api/index.ts` are registered twice: `/api/...` plus a bare alias — keep both. New routes need registration there **and** a Netlify function `config.path`; path sets disjoint, never `/api/*`. `/api` must stay <=12 files recursively (11 now; `apiRouting.test.ts`).
- Vercel: `/api/*` -> `/api/index` (60s/1024MB), then SPA fallback; `api/index.ts` restores the path from `x-matched-path`/`x-forwarded-uri`. Netlify: `/api/*` -> `/.netlify/functions/api/:splat` ahead of SPA fallback, no `force = true`; modular functions are thin wrappers over the same Express app (`src/lib/network/netlifyBridge.ts`).
- `api/` and `netlify/functions/` import graphs must stay Node-only (no browser/canvas/IndexedDB); keep shared Node helpers standalone, e.g. `src/lib/publish/tiktokTitle.ts`.

## AI cascade & storage
- `resolveRequestGeminiKeys` (`api/config.ts`): client primary -> client backup -> server pool (`GEMINI_API_KEY`, `_BACKUP`, `_2`, `_3`, `GEMINI_API_KEYS`), deduped; body `apiKey`/`backupApiKey` also accepted.
- `/api/generate`: 38s total budget, 10s grounded attempt only for short text prompts (<=200 chars, no image), then schema attempts, zero-key Pollinations (`FREE_BACKUP_AI_ENABLED=false` disables), offline synthesizer; no 5xx. `X-Marrok-Engine`/`X-Marrok-Model` headers. Refine 22s; images 23s, default 9:16/1K, edit via `inlineData` <=3.8M base64 chars, pass only `imageConfig` (never `responseMimeType`/`responseSchema`).
- `runAutonomousPipeline`: authentic AI output only gets `sanitizeFullCarousel()` + auto-layout; fitting/pacing rewrite runs only for the offline fallback. Don't "fix" AI copy unless asked.
- Postgres (`api/db/postgres.ts`) is the durable vault (`saved_posts`, JSONB, `ON CONFLICT (id) DO UPDATE`); falls back to `/tmp` + browser IndexedDB. `DATABASE_URL` or `POSTGRES_URL`/`NETLIFY_DATABASE_URL*`.

## Content & export rules
- Edit modular files, not barrels: `src/lib/synthesizer.ts`, `canvasExporter.ts`, `textSanitizer.ts` re-export `synthesis/`, `canvas/`, `text/`.
- `src/lib/canvas/renderSlide.ts` is a pure projection — no sanitizing/mutation in the draw loop. Safe zones/dimensions in `canvas/constants.ts`; clearances and `clampElementDrag()` in `layoutAwareness.ts`; overlay hit-testing in `layoutBounds.ts`. Character limits single-sourced in `qaChecks.ts` (`CHAR_LIMITS` 45/40/140/150, `SINGLE_SLIDE_CHAR_LIMITS` 55/50/220/230, hook 78/68); font floors 24px title/body, 22px footer.
- Slide 1 = hook or `subjectPair`, never `hub`/empty `metric`; `subjectPair` <=2 unedited official SVGs (<=14% slide width / 151px @1080) + "Not affiliated with <Company>"; placeholders/empty brands blocked. Keep `en*`/`ar*` populated except `standaloneMeme`/`imageFrameMode === 'full'`; technical nouns stay Latin, BiDi-isolated in Arabic.
- Static export JPG Q95 (single-slide video defaults `ig-3:4`); QA `FAIL` / risk `BLOCK` block export. Meme = 1-slide full card (`FULL_MEME_CARD_W=1008`, 6px padding, no top-right tag).
- Publishing in `publishClient.ts` + `publishController.ts` (Cloudinary staging + hourly cleanup, Buffer for IG/FB/LI, Zernio for TikTok/IG); motion in `src/lib/motion/`; gathering has Draft-only acceptance behind the 2-flag review gate.
- Vite `DISABLE_HMR=true` disables HMR + file watching (intentional for agent edits; Playwright sets it). `docs/`, `specs/`, audit reports are design context; trust `server.ts`, `api/*`, `src/lib/*` on conflicts.
