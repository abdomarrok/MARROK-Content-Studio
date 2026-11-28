# Spec: Merged Deterministic Video Studio (`video-studio/`)

## 1. Overview & Motivation

This specification documents the integration of the multi-project deterministic **Motion Graphics & Video Studio** (`video-studio/`) into `MARROK-TikTok-Carousel-Studio` (`marrok-content-studio`).

- **Existing `src/lib/motion/`**: Remains the client-side, serverless-compatible 9:16 HTML5 Canvas + `WebCodecs`/`MediaRecorder` Motion Reel engine for carousel decks.
- **Merged `video-studio/`**: Adds a config-driven (`project.json`), frame-accurate Playwright Chromium + FFmpeg broadcast rendering pipeline, ElevenLabs/Gemini TTS voiceover synthesis with SHA-256 content-hash caching (`audio/.cache-manifest.json`), procedural music + 5 SFX synthesis, dynamic FFmpeg sidechain mixing (`apad` + `asplit=2`), `16:9` / `9:16` / `--fast` exports, and `ffprobe` + `qa-sheet.png` verification.

## 2. Architectural Boundaries

1. **Vercel Hobby `/api` Cap ($\le 12$ Files)**:
   - `api/` must remain untouched at 11 files (`src/test/architectureBoundary.test.ts`).
   - All Video Studio Express routes (`/api/video-studio/*`, `/video-projects/:id/*`, `/video-engine/*`) are defined in `video-studio/studio/expressRouter.mjs` and mounted exclusively in `server.ts` after importing `app` from `./api/index.ts`.
2. **Fail-Closed Auth & Restricted Preview**:
   - Every `/api/video-studio/*` route passes through `api/index.ts`'s fail-closed `sessionAuth` and CORS middleware (`401` when unauthenticated).
   - Unauthenticated preview paths under `/video-projects/:id/*` are restricted strictly to `scene.html` and `assets/*` (returning `403` for `project.json`, `audio/*`, and `output/*`, which require authenticated `/api/video-studio/projects/:id/files/*`).
3. **Build & Deploy Isolation**:
   - `video-studio/` is excluded from `tsconfig.json`, Vite client bundles (`npm run build`), `.vercelignore`, and Netlify serverless functions.
   - When the React `Video Studio` tab (`src/components/studio/video/VideoStudioWorkspace.tsx`) runs on a serverless deployment where `server.ts` is absent, `/api/video-studio/capabilities` returns `404` and the UI displays a local-engine guidance notice.
