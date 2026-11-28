# Spec: Merged Deterministic Film Studio (`video-studio/`)

## 1. Overview & Motivation

This specification documents the integration of the multi-project deterministic **Film Studio** (`video-studio/`) into `MARROK-TikTok-Carousel-Studio` (`marrok-content-studio`).

- **Top-Level Navigation (`src/components/Header.tsx`)**: Ordered **Create** → **Film Studio** → **Publish**.
- **Existing `src/lib/motion/` (`Create → Reel`)**: Remains the client-side, serverless-compatible in-browser 9:16 HTML5 Canvas + `WebCodecs`/`MediaRecorder` Motion Reel engine for carousel decks.
- **Merged `video-studio/` (`Film Studio`)**: Adds a config-driven (`project.json`), frame-accurate multi-act `16:9` & `9:16` HTML/DOM + Playwright Chromium + FFmpeg broadcast rendering pipeline, ElevenLabs/Gemini TTS voiceover synthesis with SHA-256 content-hash caching (`audio/.cache-manifest.json`), procedural music + 5 SFX synthesis, dynamic FFmpeg sidechain mixing (`apad` + `asplit=2`), `16:9` / `9:16` / `--fast` exports, standalone Bundled HTML export, and `ffprobe` + `qa-sheet.png` verification.

## 2. Architectural & Security Boundaries

1. **Vercel Hobby `/api` Cap ($\le 12$ Files)**:
   - `api/` must remain untouched at 11 files (`src/test/architectureBoundary.test.ts`).
   - All Film Studio Express routes (`/api/video-studio/*`, `/video-projects/s/:token/:id/*`, `/video-projects/:id/*`, `/engine/motion-sdk.js`, `/video-engine/motion-sdk.js`) are defined in `video-studio/studio/expressRouter.mjs` and mounted exclusively in `server.ts` after importing `app` from `./api/index.ts`.
2. **Fail-Closed Auth, Write Isolation, Streaming & Concurrency Hardening**:
   - Every `/api/video-studio/*` route passes through `api/index.ts`'s fail-closed `sessionAuth` (`401`/`503`), CORS middleware, and `isIsolatedProtectedWrite` (`403` on deploy previews unless `ALLOW_PREVIEW_WRITES=true`).
   - `/video-projects/:id/*` and `/video-projects/s/:token/:id/*` are protected behind session auth (`__Host-marrok_session` cookie, `Authorization: Bearer <token>`, or short-lived HMAC-SHA256 path-scoped preview token `vprev.<exp>.<sig>`) so iframe previews and relative `./assets/*` requests work seamlessly even when third-party cookies are blocked, while restricting files strictly to `scene.html` and `assets/*` (`403` for `project.json`, `audio/*`, and `output/*`).
   - `/engine/motion-sdk.js` and `/video-engine/motion-sdk.js` serve strictly `video-studio/engine/motion-sdk.js`.
   - `sendFileWithRange` streams files via `fs.createReadStream` (supporting `200 OK` and `206 Partial Content` byte ranges without buffering full MP4/WAV files in RAM).
   - `POST /api/video-studio/projects/:id/jobs` enforces a single-active-job concurrency lock (`409 Conflict` when a job is already running) and caps completed job history at `50` entries (`MAX_COMPLETED_JOBS = 50`).
3. **Graceful Degradation & Design System Cohesion**:
   - `VideoStudioWorkspace.tsx` uses MARROK's canonical obsidian-slate tokens (`#080d11`, `#0b1118`, `#121A21`, `#1E2833`) and active `currentPalette.accent`.
   - `GET /api/video-studio/capabilities` separates `serverAvailable` and `ffmpegAvailable`:
     - When `serverAvailable === false` (404 on static/serverless hosting where `server.ts` is not mounted), the UI shows a local-server guidance notice.
     - When `serverAvailable === true && ffmpegAvailable === false` (e.g., AI Studio preview or containers without FFmpeg installed), the UI displays an inline **Preview & Script Mode Active** banner, disables FFmpeg-dependent render/mix buttons with clear reasons, and keeps the 60fps HTML stage preview, `project.json` editing, asset uploads, and standalone Bundled HTML export active.
