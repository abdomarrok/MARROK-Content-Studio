# MARROK Video Studio — AI Agent Authoring Guide

This repository is a multi-project, deterministic Motion Graphics & Video Studio. Follow these strict rules whenever creating or modifying projects under `projects/<id>/`.

## 1. Scaffolding a New Project

```powershell
npm run video:new -- <project-id> --name "My Brand Film" --duration 20
```

- `<project-id>` must match `/^[a-z0-9][a-z0-9-]{0,62}$/`.
- Every project lives under `video-studio/projects/<id>/`:
  - `project.json` — validated configuration driving audio, voiceovers, timing, and rendering
  - `scene.html` — deterministic motion stage using `/engine/motion-sdk.js`
  - `assets/` — images, SVGs, fonts, custom media
  - `audio/` — untracked generated stems, `.cache-manifest.json`, and `master.wav`
  - `output/` — untracked `silent.mp4`, `final-16x9.mp4`, `final-9x16.mp4`, `qa-sheet.png`, `qa-report.json`

## 2. Deterministic `scene.html` Contract

1. **Always use `engine/motion-sdk.js`:**
   Load `<script src="/engine/motion-sdk.js"></script>` and register your renderer via:
   ```js
   window.StudioSDK.init({
     duration: 15,
     fps: 60,
     render(t, dt, meta) {
       // Purely derive all DOM styles/transforms/text from `t`
     }
   });
   ```
   This wires `window.renderAt(t, dt)`, handles `?render=1`, `?embed=1`, and `?aspect=9:16`, and listens for Studio UI `postMessage` scrub events.
2. **Strictly deterministic:**
   - Never use `Math.random()`, `Date.now()`, `performance.now()`, or `requestAnimationFrame` inside `render(t, dt)` or during `?render=1`.
   - Use `StudioSDK.clamp`, `lerp`, `actProgress`, `stagger`, `typewriter`, `easeOutCubic`, `easeOutExpo`, and `springDeterministic` so every frame is reproducible.
3. **Zero burned-in captions:**
   - Never render subtitle bars or preview captions inside video frames.
   - Hide all preview controls/toasts/captions whenever `body.render-mode` (`?render=1`) OR `body.embed-mode` (`?embed=1`) is active.
4. **Preloaded assets & clean cutouts:**
   - Place project assets in `projects/<id>/assets/` and reference them with `./assets/...`.
   - If using `<canvas>` cutout processing (`processWhiteToTransparent`), resolve `window.__STUDIO_READY__` (or pass `onReady` to `StudioSDK.init`) so `render-video.mjs` waits until transparent cutouts are applied before capturing frame 0.
5. **Vertical (`9:16`) readiness:**
   - Style responsive layout rules under `body.aspect-9x16` (`1080×1920`) if `video.verticalExport.mode` is `"native"`, or leave `mode: "padded"` to frame `16:9` cleanly over `backgroundColor`.

## 3. `project.json` Rules & Voiceover Budgets

Validated by `engine/schema.mjs`:

- **`voice`**: `{ provider: "elevenlabs" | "gemini", voiceId, modelId, seed, settings }`.
- **`acts[]`**:
  - Each act writes `audio/<act.id>.wav` and enters the mix at `startSec`.
  - Keep spoken audio strictly `<= maxDurationSec` so narration never collides with the next act or the final music fade-out.
  - **`voiceOverride`**: set `null` to inherit `project.voice`, or override `{ provider, voiceId, modelId, seed, settings }` on a specific act (e.g., switching an act to Arabic/Darija or a second speaker).
  - **Arabic / Algerian Darija tip**: Use `eleven_multilingual_v2` with full Arabic vowel diacritics (*tashkeel*, e.g. `الفِكْرَة مِنْ عَنْدَك، والتِّكْنُولُوجْيا عْلِينا.`) for natural pronunciation.
- **Hash Cache Protection**:
  - `engine/audio-vo.mjs` stores SHA-256 hashes of every act's text, voice, model, seed, settings, and adjacent same-voice stitching context in `audio/.cache-manifest.json`.
  - Unchanged acts automatically hit cache and never re-call ElevenLabs or Gemini unless `--force` is passed.
- **Music & SFX**:
  - Supports `0..N` acts (including music-only projects) and `0..N` SFX entries.
  - `audio-mix.mjs` pads VO with `apad=whole_dur=<durationSec>` before `asplit=2[vo_sc][vo_mix]` so `sidechaincompress` never truncates the final fade-out, and emits `asplit=N` only when a shared SFX file has multiple timestamps.

## 4. Build, Preview & QA Workflow

```powershell
# 1. Start unified Studio UI (http://localhost:3000 -> Video Studio tab)
npm run dev

# 2. Generate only changed VO stems + DSP stems + master.wav
npm run video:audio -- --project <id>

# 3. Fast 720p/30fps draft render
npm run video:render -- --project <id> --fast

# 4. Full production build (Audio -> 16:9 Render -> Mux -> 9:16 Vertical -> QA)
npm run video:build -- --project <id> --vertical

# 5. Standalone QA verification (ffprobe + output/qa-sheet.png)
npm run video:qa -- --project <id>
```

Always inspect `projects/<id>/output/qa-sheet.png` and `projects/<id>/output/qa-report.json` after building to verify framing, transparency cutouts, duration, and 48 kHz audio sync.
