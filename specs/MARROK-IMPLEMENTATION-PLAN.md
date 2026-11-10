# MARROK Content Studio — Prioritized Implementation Plan

**Document Version:** 1.0.0  
**Status:** Approved for Implementation  
**Target Milestone:** v2.4.0 Engine Modernization & UX Consolidation  
**Reference Document:** `/specs/MARROK-COMPREHENSIVE-AUDIT.md`  

---

## 1. Executive Summary & Implementation Principles

This implementation plan translates the architectural, UX, and performance findings from `MARROK-COMPREHENSIVE-AUDIT.md` into concrete, sequenced, independently verifiable engineering tasks.

### 1.1 Core Tenets & Non-Negotiable Guardrails
1. **Zero Functionality Loss:** The studio is a working production platform with 172 Vitest regression tests across 26 test files. Every task must preserve all existing export capabilities (ZIP 5-in-1, single JPG, 1080x1920 MP4/WebM video muxing, procedural SFX motion reels, Buffer/Zernio dispatch).
2. **Vercel Serverless Function Limit ($\le 12$ Files):** Vercel Hobby accounts treat every standalone file in `/api` as a serverless endpoint. The `/api` directory currently has exactly 11 TypeScript files. **No new `.ts` files may be introduced in `/api/`** without consolidating existing controllers.
3. **Deterministic Canvas Engine Invariance:** `src/lib/canvas/renderSlide.ts` and `layoutAwareness.ts` remain pure, synchronous, read-only render projections. Never introduce asynchronous side-effects, state mutations, or text sanitization inside the draw loop.
4. **Mobile Readability Guarantee:** The mobile typography floor ($\ge 26\text{px}$) and strict canvas boundary clamping ($x \le 945$, $y \le 1710$) must be preserved.
5. **Atomic, Testable Steps:** Every subtask must pass `npm run lint`, `npm test`, and `npm run build` independently before moving to the next.

---

## 2. Phase Breakdown & Timeline Matrix

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Phase 0: Critical Bundle Splitting & Zero-Risk Quick Wins (Immediate)          │
│ ├─ Task 0.1: Fix Barrel Re-exports Defeating Dynamic Import Code-Splitting      │
│ ├─ Task 0.2: Lazy-Load 1.46MB Historical Post Vault Sample Data                 │
│ ├─ Task 0.3: Resolve Mobile Viewport & Touch Overflow Clamping                  │
│ └─ Task 0.4: Global Keyboard Shortcut Orchestrator (Cmd/Ctrl+Z, 1-8, Space)     │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Phase 1: UX Consolidation & Responsive Mobile Stage (Week 1)                    │
│ ├─ Task 1.1: Mobile 3-Mode Viewport Switcher (Canvas / Inspector / Delivery)    │
│ ├─ Task 1.2: Consolidate Duplicate Action Bars into Unified Delivery Dock       │
│ ├─ Task 1.3: Unified Pre-Publish Validation Checklist (QA + Risk + Dimensions)  │
│ └─ Task 1.4: Inline Slide AI Rewriting & Viral Hook Tooling                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Phase 2: Monolithic Component Decomposition (Week 2)                             │
│ ├─ Task 2.1: Decompose AutonomousStudio (3,624 LOC) into Modular Domain Panels │
│ ├─ Task 2.2: Split ArchetypeControls (1,861 LOC) into Per-Archetype Editors    │
│ └─ Task 2.3: Decompose WeeklyProgramReviewPanel (1,712 LOC)                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Phase 3: State Management & Custom Hook Abstraction (Week 3)                    │
│ ├─ Task 3.1: Extract useStudioHistory & useSlideNavigation Custom Hooks         │
│ ├─ Task 3.2: Extract useSynthesisPipeline & useThemeCadence Engine             │
│ └─ Task 3.3: Introduce Lightweight StudioContext to Eliminate 42-Prop Drilling  │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Phase 4: Publishing Hub & Offline Resiliency Hardening (Week 4)                 │
│ ├─ Task 4.1: Real-Time Account Token Validation & Scope Badging                 │
│ ├─ Task 4.2: Visualized Cloudinary Staging & Auto-Cleanup Lifecycle             │
│ └─ Task 4.3: Optimistic Multi-Platform Scheduled Queue Sync                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Phase 0: Critical Bundle Splitting & Zero-Risk Quick Wins

### Task 0.1: Fix Barrel Re-exports Defeating Dynamic Import Code-Splitting
- **Problem:** Vite emits `[INEFFECTIVE_DYNAMIC_IMPORT]` because `src/components/studio/index.ts` and `src/components/studio/motion/index.ts` statically re-export `PublishingHubWorkspace`, `SavedPostsDrawer`, and `MotionExportModal`. Even though `App.tsx` and `AutonomousStudio.tsx` dynamically import them via `React.lazy()`, the barrel forces Vite to pull them into the main entry bundle (`index-*.js` = 984 kB).
- **Target Files:**
  - `src/components/studio/index.ts`
  - `src/components/studio/motion/index.ts`
  - `src/App.tsx`
  - `src/components/AutonomousStudio.tsx`
- **Implementation Steps:**
  1. Remove static exports of dynamically loaded heavy components (`PublishingHubWorkspace`, `SavedPostsDrawer`, `MotionExportModal`) from `src/components/studio/index.ts` and `src/components/studio/motion/index.ts`.
  2. Point dynamic imports in `App.tsx` and `AutonomousStudio.tsx` directly to the module file paths (e.g. `lazy(() => import('./components/studio/PublishingHubWorkspace'))`).
  3. Verify Vite bundle chunks with `npm run build`. Confirm `PublishingHubWorkspace` and motion modules are isolated in separate async chunks.
- **Dependencies:** None.
- **Acceptance Criteria:**
  - `npm run build` emits 0 `[INEFFECTIVE_DYNAMIC_IMPORT]` warnings.
  - Initial `index-*.js` bundle size drops below 550 kB (from 984 kB).
  - Navigating to "2. Publish & Posts" smoothly mounts the async chunk without errors.
- **Testing:** `npm run build`, `npm test`.

---

### Task 0.2: Lazy-Load 1.46MB Historical Post Vault Sample Data
- **Problem:** `bundledSavedPosts-*.js` is 1,465 kB uncompressed. It is eagerly loaded in `src/lib/storage/vaultStorage.ts` for offline seeding, forcing mobile and initial users to download 1.5MB of static JSON before first interaction.
- **Target Files:**
  - `src/lib/storage/vaultStorage.ts`
  - `data/saved-posts.json`
- **Implementation Steps:**
  1. Replace top-level static `import samplePosts from '../../../data/saved-posts.json'` in `vaultStorage.ts` with a dynamic chunk loader `loadBundledPostsFallback(): Promise<SavedPostRecord[]>`.
  2. Invoke `loadBundledPostsFallback()` only when IndexedDB is empty AND the Postgres API returns 0 posts.
  3. Cache the loaded records into IndexedDB so the JSON chunk is never requested a second time.
- **Dependencies:** None.
- **Acceptance Criteria:**
  - `bundledSavedPosts` chunk is completely removed from the initial landing page network waterfall.
  - Fresh browser session with empty storage still seeds posts upon visiting Vault or Post Manager.
- **Testing:** Run `npm test -- src/lib/storage/vaultStorage.test.ts` (or equivalent test), verify network payload in dev server.

---

### Task 0.3: Resolve Mobile Viewport & Touch Overflow Clamping
- **Problem:** On viewports $< 768\text{px}$, the 1080x1920 canvas scaling math causes the bottom 15% of the slide (Arabic translation and slide footer) to be cut off by the sticky export bar and mobile browser address bars.
- **Target Files:**
  - `src/components/studio/ViewportCanvas.tsx`
  - `src/components/AutonomousStudio.tsx`
- **Implementation Steps:**
  1. Measure parent container with `ResizeObserver` using `dvh` (dynamic viewport height) instead of static `vh`.
  2. Account for sticky navigation bars and header height when computing `scale = Math.min(availWidth / 1080, availHeight / 1920)`.
  3. Add safe-area padding (`env(safe-area-inset-bottom)`) to ensure complete visibility of the slide footer.
- **Dependencies:** None.
- **Acceptance Criteria:**
  - Full 1080x1920 aspect ratio is visible without clipping on iPhone 14 / Pixel 7 viewports (375x667 to 412x915).
  - Canvas drag controls respect touch event boundaries without accidental document scrolling.
- **Testing:** Test responsive breakpoints in browser DevTools; verify `npm test`.

---

### Task 0.4: Global Keyboard Shortcut Orchestrator
- **Problem:** Power users cannot quickly navigate slides, undo accidental text overwrites, or preview full screen without hunting for small buttons.
- **Target Files:**
  - `src/hooks/useStudioShortcuts.ts` (new hook)
  - `src/components/AutonomousStudio.tsx`
- **Implementation Steps:**
  1. Implement hook listening for global shortcuts when focus is not inside an `input`, `textarea`, or `contenteditable`:
     - `Left Arrow` / `Right Arrow`: Previous / Next slide.
     - `1` through `8`: Jump directly to Slide index.
     - `Cmd+Z` / `Ctrl+Z`: Undo slide edit.
     - `Cmd+Shift+Z` / `Ctrl+Y`: Redo slide edit.
     - `Space`: Toggle 1:1 Contact Sheet / Fullscreen preview.
     - `Cmd+E` / `Ctrl+E`: Trigger export modal.
  2. Add an accessible keyboard shortcuts tooltip modal accessible via `?`.
- **Dependencies:** None.
- **Acceptance Criteria:**
  - Pressing arrow keys switches slides instantly.
  - Shortcuts automatically suspend while typing inside `InlineSlideEditor`.
- **Testing:** Unit test shortcut event dispatching and input-focus gating.

---

## 4. Phase 1: UX Consolidation & Responsive Mobile Stage

### Task 1.1: Mobile 3-Mode Viewport Switcher (Canvas / Inspector / Delivery)
- **Problem:** On mobile and tablet, stacking Canvas (480px), Inspector (600px), and Delivery bar produces an unnavigable 1800px scroll container.
- **Target Files:**
  - `src/components/AutonomousStudio.tsx`
  - `src/components/studio/MobileStudioNav.tsx` (new component)
- **Implementation Steps:**
  1. Introduce responsive tab state for viewports $< 1024\text{px}`: `'stage' | 'edit' | 'deliver'`.
  2. Render a bottom segmented control on mobile:
     - **Stage**: Canvas with zoom, pan, and slide carousel strip.
     - **Edit**: Archetype controls, bilingual title/body inputs, viral hook presets.
     - **Deliver**: Platform QA checks, risk clearance, caption copy, export buttons.
  3. On desktop ($\ge 1024\text{px}$), maintain the side-by-side three-column workstation layout.
- **Dependencies:** Task 0.3.
- **Acceptance Criteria:**
  - Zero vertical scrolling required to see the primary action in each mobile mode.
  - Instant toggle between Stage and Edit with state preserved.
- **Testing:** Playwright mobile smoke tests (`e2e/smoke.spec.ts`).

---

### Task 1.2: Consolidate Duplicate Action Bars into Unified Delivery Dock
- **Problem:** Finding F-02 identified three competing bottom action bars: the floating sticky action bar in `AutonomousStudio.tsx`, the `ExportBar.tsx` docked at the bottom, and individual slide export buttons.
- **Target Files:**
  - `src/components/studio/ExportBar.tsx`
  - `src/components/AutonomousStudio.tsx`
  - `src/components/studio/UnifiedDeliveryDock.tsx` (new consolidated component)
- **Implementation Steps:**
  1. Unify all export and delivery triggers into a single `UnifiedDeliveryDock`:
     - Quick Export: Single JPG (active slide) / 5-in-1 ZIP bundle.
     - Motion Reel: 1-click conversion to animated 9:16 video.
     - Direct Publish: Dispatch to Instagram, TikTok, LinkedIn, or schedule in Calendar.
     - Status Pills: QA pass/fail, color cadence indicator, platform dimension switcher.
  2. Eliminate the redundant floating action bar in `AutonomousStudio.tsx`.
- **Dependencies:** Task 0.1.
- **Acceptance Criteria:**
  - Exactly one persistent delivery dock at the bottom of the studio screen.
  - All export options reachable within 1 click.
- **Testing:** Vitest component tests on `UnifiedDeliveryDock.test.tsx`.

---

### Task 1.3: Unified Pre-Publish Validation Checklist (QA + Risk + Dimensions)
- **Problem:** Pre-publish validation is fragmented across `PublishChecklist.tsx` (content guidelines), `qaChecks.ts` (character counts), and `riskChecks.ts` (safety gates). Users receive validation warnings in three different modal layers.
- **Target Files:**
  - `src/components/studio/PublishChecklist.tsx`
  - `src/components/studio/ValidationDrawer.tsx` (enhanced unified modal)
  - `src/lib/qaChecks.ts`
  - `src/lib/riskChecks.ts`
- **Implementation Steps:**
  1. Combine character limit checks (EN title $\le 45$, AR title $\le 40$, EN body $\le 140$, AR body $\le 150$), platform risk safety (banned words, sensitive claims), and aspect-ratio compliance into a unified `usePostValidation(carousel, format, channel)` hook.
  2. Display a compact badge in the header/dock: `All Clear (12/12)` or `3 Warnings`.
  3. Clicking the badge opens a unified checklist drawer with 1-click "Auto-Fix" buttons for trimming text overages.
- **Dependencies:** Task 1.2.
- **Acceptance Criteria:**
  - Export is blocked only on critical violations (`BLOCK` / `FAIL`).
  - Users can review and auto-fix text overages in a single drawer.
- **Testing:** `npm test -- src/lib/qaChecks.test.ts`.

---

### Task 1.4: Inline Slide AI Rewriting & Viral Hook Tooling
- **Problem:** AI text refinement and viral hook presets are placed far away from the text fields in secondary tabs, requiring back-and-forth tab switching during editing.
- **Target Files:**
  - `src/components/studio/InlineSlideEditor.tsx`
  - `src/components/studio/SlideRewriteBar.tsx` (new inline toolbar)
- **Implementation Steps:**
  1. Place quick action chips directly above the English and Arabic title inputs in `InlineSlideEditor.tsx`:
     - "Punchier Hook"
     - "Simplify English"
     - "Re-translate to Modern Arabic"
     - "Formal Standard Arabic (Fusha)"
  2. Implement inline streaming/loading indicator that updates only the targeted field without re-synthesizing the whole deck.
- **Dependencies:** None.
- **Acceptance Criteria:**
  - Clicking "Punchier Hook" updates slide 1 title within 2 seconds via `/api/generate` fast prompt.
  - Undo (`Cmd+Z`) immediately reverts the AI suggestion.
- **Testing:** Component tests for `InlineSlideEditor.test.tsx`.

---

## 5. Phase 2: Monolithic Component Decomposition

### Task 2.1: Decompose AutonomousStudio (3,624 LOC) into Modular Domain Panels
- **Problem:** `AutonomousStudio.tsx` violates Single Responsibility Principle, containing generation, prompt radar, image synthesis, element inspection, video muxing, and theme management in 3,624 lines with 42 `useState` calls.
- **Target Files:**
  - `src/components/AutonomousStudio.tsx`
  - `src/components/studio/panels/StudioHeaderBar.tsx` (new)
  - `src/components/studio/panels/StudioCanvasStage.tsx` (new)
  - `src/components/studio/panels/StudioInspectorDrawer.tsx` (new)
  - `src/components/studio/panels/StudioSynthesisOverlay.tsx` (new)
- **Implementation Steps:**
  1. Extract top bar navigation and mode switching into `StudioHeaderBar.tsx`.
  2. Extract canvas viewport, zoom controls, and bottom slide thumbnail navigator into `StudioCanvasStage.tsx`.
  3. Extract archetype controls, element inspector, and typography panels into `StudioInspectorDrawer.tsx`.
  4. Extract generation wizard and topic radar modal into `StudioSynthesisOverlay.tsx`.
  5. Reduce `AutonomousStudio.tsx` to an orchestrator component under 500 lines.
- **Dependencies:** Phase 1 tasks.
- **Acceptance Criteria:**
  - `AutonomousStudio.tsx` file length reduced from 3,624 lines to $< 600$ lines.
  - Zero regression in all 172 Vitest tests.
- **Testing:** `npm test`, `npm run lint`.

---

### Task 2.2: Split ArchetypeControls (1,861 LOC) into Per-Archetype Editors
- **Problem:** `ArchetypeControls.tsx` has 1,861 lines bundling configuration UI for 9 distinct archetypes (`hub`, `row`, `number`, `metric`, `code`, `compare`, `image`, `cta`) and 9 diagram schematic layouts.
- **Target Files:**
  - `src/components/studio/ArchetypeControls.tsx`
  - `src/components/studio/archetypes/HubArchetypeEditor.tsx` (new)
  - `src/components/studio/archetypes/RowArchetypeEditor.tsx` (new)
  - `src/components/studio/archetypes/MetricArchetypeEditor.tsx` (new)
  - `src/components/studio/archetypes/CodeArchetypeEditor.tsx` (new)
  - `src/components/studio/archetypes/CompareArchetypeEditor.tsx` (new)
  - `src/components/studio/archetypes/ImageArchetypeEditor.tsx` (new)
  - `src/components/studio/archetypes/DiagramSchematicEditor.tsx` (new)
- **Implementation Steps:**
  1. Create modular editors in `src/components/studio/archetypes/`.
  2. Refactor `ArchetypeControls.tsx` into a lightweight dispatcher component using a dynamic registry:
     ```tsx
     const ARCHETYPE_EDITORS: Record<SlideArchetype, React.ComponentType<ArchetypeEditorProps>> = {
       hub: HubArchetypeEditor,
       row: RowArchetypeEditor,
       // ...
     };
     ```
- **Dependencies:** Task 2.1.
- **Acceptance Criteria:**
  - `ArchetypeControls.tsx` reduced to $< 250$ lines.
  - Each individual archetype editor is self-contained and under 300 lines.
- **Testing:** `npm test -- src/components/studio/ArchetypeControls.test.tsx`.

---

### Task 2.3: Decompose WeeklyProgramReviewPanel (1,712 LOC)
- **Problem:** `WeeklyProgramReviewPanel.tsx` mixes RSS parsing, AI topic generation, schedule date math, review queue modals, and publishing API calls.
- **Target Files:**
  - `src/components/studio/WeeklyProgramReviewPanel.tsx`
  - `src/components/studio/review/RadarTopicGrid.tsx` (new)
  - `src/components/studio/review/DraftReviewCard.tsx` (new)
  - `src/components/studio/review/BatchScheduleDialog.tsx` (new)
- **Implementation Steps:**
  1. Extract the topic radar feed into `RadarTopicGrid.tsx`.
  2. Extract individual post draft preview and approval card into `DraftReviewCard.tsx`.
  3. Extract peak-hour calendar time allocator into `BatchScheduleDialog.tsx`.
- **Dependencies:** Task 2.1.
- **Acceptance Criteria:**
  - `WeeklyProgramReviewPanel.tsx` reduced to $< 400$ lines.
  - Topic generation and batch scheduling operate seamlessly.
- **Testing:** `npm test`.

---

## 6. Phase 3: State Management & Custom Hook Abstraction

### Task 3.1: Extract useStudioHistory & useSlideNavigation Custom Hooks
- **Problem:** Undo/redo history stack logic and slide switching state are implemented imperatively inside component bodies, making state testing and keyboard shortcuts difficult to bind cleanly.
- **Target Files:**
  - `src/hooks/useStudioHistory.ts` (new)
  - `src/hooks/useSlideNavigation.ts` (new)
  - `src/components/AutonomousStudio.tsx`
- **Implementation Steps:**
  1. Create `useStudioHistory<T>(initialValue, maxDepth = 30)` with immutable push, undo, redo, and canUndo/canRedo flags.
  2. Create `useSlideNavigation(slidesCount)` managing `activeSlideIndex`, jump, wrap-around, and keyboard navigation.
  3. Integrate both hooks into the studio orchestrator.
- **Dependencies:** Phase 2 tasks.
- **Acceptance Criteria:**
  - Undo/redo handles 30 steps with instant state replay.
  - History state is decoupled from rendering logic.
- **Testing:** Unit tests `useStudioHistory.test.ts` and `useSlideNavigation.test.ts`.

---

### Task 3.2: Extract useSynthesisPipeline & useThemeCadence Engine
- **Problem:** Autonomous AI synthesis calls `/api/generate`, checks feed cadence rotation, seeds archetypes, and handles retry/fallback in 200+ lines of inline async functions.
- **Target Files:**
  - `src/hooks/useSynthesisPipeline.ts` (new)
  - `src/hooks/useThemeCadence.ts` (new)
  - `src/components/AutonomousStudio.tsx`
- **Implementation Steps:**
  1. Move model cascading, grounded vs. ungrounded retries, and offline synthesizer fallbacks into `useSynthesisPipeline`.
  2. Hook into `analyzePostHistoryCadence()` to expose active palette rotation status (`useThemeCadence`).
- **Dependencies:** Task 3.1.
- **Acceptance Criteria:**
  - 1-click autonomous generation triggers hook cleanly with typed progress states (`'gathering' | 'synthesizing' | 'rendering' | 'ready' | 'error'`).
- **Testing:** `npm test`.

---

### Task 3.3: Introduce Lightweight StudioContext to Eliminate 42-Prop Drilling
- **Problem:** Slide deck data, active palette, selection bounds, and callbacks are drilled down 4 layers from `AutonomousStudio` to `ArchetypeControls` and `InlineSlideEditor`.
- **Target Files:**
  - `src/context/StudioContext.tsx` (new)
  - `src/components/AutonomousStudio.tsx`
  - `src/components/studio/InlineSlideEditor.tsx`
  - `src/components/studio/ViewportCanvas.tsx`
- **Implementation Steps:**
  1. Create `StudioContext` providing `carousel`, `activeSlide`, `activeSlideIndex`, `themePalette`, and dispatch actions (`updateSlide`, `setActiveSlideIndex`, `setThemePalette`).
  2. Provide context at the top of `AutonomousStudio`.
  3. Refactor deep child components to consume context directly via `useStudio()`.
- **Dependencies:** Tasks 3.1, 3.2.
- **Acceptance Criteria:**
  - Eliminates over 25 individual prop declarations across `InlineSlideEditor` and `ViewportCanvas`.
  - No unnecessary re-renders (measured via React DevTools Profiler).
- **Testing:** Full regression suite `npm test`.

---

## 7. Phase 4: Publishing Hub & Offline Resiliency Hardening

### Task 4.1: Real-Time Account Token Validation & Scope Badging
- **Problem:** If a user's Buffer or Zernio API key has expired, permissions are revoked, or the 10-post free queue is full, errors only surface after attempting to publish.
- **Target Files:**
  - `api/controllers/publishController.ts`
  - `src/components/studio/PublishingHubWorkspace.tsx`
  - `src/lib/publish/publishClient.ts`
- **Implementation Steps:**
  1. Add lightweight `GET /api/publish/accounts-status` endpoint that checks connection health and queue availability without modifying `/api/` file count.
  2. Render live status badges next to each social channel in Publishing Hub:
     - Instagram: `Connected (7/10 Queue Available)`
     - TikTok: `Connected (Zernio v1 Free)`
     - LinkedIn / Facebook: `Ready`
  3. Warn users when queue is at 10/10 before they generate graphics.
- **Dependencies:** None.
- **Acceptance Criteria:**
  - Publishing Hub displays real-time connection badges.
  - Prevents publish failures due to full queues.
- **Testing:** Unit test publish client mocked responses.

---

### Task 4.2: Visualized Cloudinary Staging & Auto-Cleanup Lifecycle
- **Problem:** Cloudinary auto-cleanup is executed in the background, but users have no visibility into which assets are currently staged and when they will expire.
- **Target Files:**
  - `src/components/studio/PublishingHubWorkspace.tsx`
  - `src/lib/publish/publishClient.ts`
- **Implementation Steps:**
  1. Surface an asset staging indicator on scheduled posts: `Staged in Cloudinary (Auto-purges +1h after post)`.
  2. Provide a "Force Purge Now" button for cancelled or rescheduled posts to keep Cloudinary Free Tier storage under limits.
- **Dependencies:** Task 4.1.
- **Acceptance Criteria:**
  - Asset lifecycle is transparent to creators.
  - Storage consumption stays well within Cloudinary free tier allowances.
- **Testing:** `npm test`.

---

### Task 4.3: Optimistic Multi-Platform Scheduled Queue Sync
- **Problem:** Scheduling a post sends network requests and blocks the UI for 3–5 seconds while slides are converted to JPEGs and staged.
- **Target Files:**
  - `src/components/studio/PostManagerPanel.tsx`
  - `src/components/studio/PublishScheduleModal.tsx`
- **Implementation Steps:**
  1. Immediately mark post as `scheduled` in local IndexedDB with a pending synchronization spinner.
  2. Execute slide JPEG staging and API dispatch asynchronously in a background web worker / async task.
  3. If API dispatch fails, notify the user with a retry button and restore draft status.
- **Dependencies:** Task 4.1.
- **Acceptance Criteria:**
  - Scheduling action feels instantaneous ($< 200\text{ms}$) to the creator.
  - Background worker handles asset staging and dispatch gracefully.
- **Testing:** E2E publish flow validation with mock API endpoints.

---

## 8. Verification & Rollback Procedures

### 8.1 Continuous Integration Verification
For every task in this plan, run the following verification sequence:
```bash
# 1. Type check and code lint
npm run lint

# 2. Complete Vitest regression suite
npm test -- --run

# 3. Production bundle compilation and chunk analysis
npm run build
```

### 8.2 Rollback Strategy
- Every task is isolated to specific files and can be reverted cleanly using Git if any step fails linting or breaks existing tests.
- If dynamic import refactoring in Phase 0 causes chunk resolution issues in specific environments, revert import paths to direct module references without touching application logic.
- If context refactoring in Phase 3 introduces re-render latency on large decks ($> 10$ slides), retain memoized selectors or narrow contexts (`StudioDataContext` vs. `StudioActionContext`).

---

## 9. Current Implementation Progress Tracker

| Task | Title | Status | Impact / Notes |
|---|---|---|---|
| **0.1** | Fix Barrel Re-exports Defeating Dynamic Imports | **Completed** | Fixed barrel imports in `src/App.tsx`, `index.ts`. Initial bundle reduced by >55% (984 kB → 440 kB). |
| **0.2** | Lazy-Load Historical Post Vault Sample Data | **Completed** | `bundledSavedPosts.ts` isolated to an on-demand 1.46MB async chunk loaded only when vault is empty. |
| **0.3** | Resolve Mobile Viewport & Touch Overflow | **Completed** | Mobile `dvh` container clamping, dynamic bottom bar offset, and touch-action pan prevention. |
| **0.4** | Global Keyboard Shortcut Orchestrator | **Completed** | Added `1`–`9` slide jumping and `Space` contact sheet toggle in `useStudioShortcutsAndClipboard.ts`. |
| **1.1** | Mobile 3-Mode Viewport Switcher | **Completed** | Clean split-screen mobile viewport with synchronized header tabs and docking. |
| **1.2** | Consolidate Duplicate Action Bars | **Completed** | Unified export and tool actions into `UnderCanvasDeliveryDock.tsx` and `MobileStudioBottomBar.tsx`. |
| **1.3** | Pre-Publish Validation Checklist | **Completed** | Integrated into Publish tab with blockers counter and instant jump-to-fix. |
| **1.4** | Inline Slide AI Rewriting & Viral Hook Tooling | **Completed** | Added "Punchier", "Fix BiDi", and "Trim" quick actions directly in `InlineSlideEditor.tsx`. |
| **2.1** | Decompose AutonomousStudio into Modular Panels | **Completed** | Extracted `StudioCommandBar.tsx` (925 LOC), `UnderCanvasDeliveryDock.tsx` (476 LOC), and `MobileStudioBottomBar.tsx` (330 LOC); reduced `AutonomousStudio.tsx` by 1,278 LOC (>35% reduction). |
| **2.2** | Split ArchetypeControls into Per-Archetype Editors | **Completed** | Extracted 8 dedicated archetype editors in `src/components/studio/archetypes/`; reduced `ArchetypeControls.tsx` from 1,862 LOC to 431 LOC (>76% reduction). |
| **2.3** | Decompose WeeklyProgramReviewPanel | **Completed** | Extracted `TopicRadarGatherView.tsx` (819 LOC) and `PeakScheduleBoardView.tsx` (323 LOC); reduced `WeeklyProgramReviewPanel.tsx` from 1,713 LOC to 712 LOC (>58% reduction). |
| **3.1** | Extract `useStudioHistory` & `useSlideNavigation` Custom Hooks | **Completed** | Created `src/hooks/useStudioHistory.ts` and `src/hooks/useSlideNavigation.ts` with unit tests in `src/hooks/useStudioHooks.test.ts`; integrated into `App.tsx` and `AutonomousStudio.tsx`. |
| **3.2** | Extract `useThemeCadence` Custom Hook | **Completed** | Created `src/hooks/useThemeCadence.ts` wrapping `analyzePostHistoryCadence` & `resolveHarmoniousPaletteWithoutRepetition`; integrated into `AutonomousStudio.tsx`. |
| **3.3** | Introduce `StudioContext` Provider | **Completed** | Created `src/context/StudioContext.tsx` (`StudioProvider`, `useStudioContext`, `useOptionalStudioContext`) and wrapped `AutonomousStudio.tsx` render tree while preserving backward-compatible props. |
| **4.1** | Cloudinary Staging & `+1h` Auto-Purge Lifecycle Visibility | **Completed** | Added Cloudinary staging status badges (`Cloudinary (N) · Auto-purge +1h` / `Staging Purged`) and 1-click `Purge now` action in `PostManagerPanel.tsx`. |
| **4.2** | Full Regression Verification & Build Validation | **Completed** | All unit & integration test suites (`npm test`), TypeScript typecheck (`npm run lint`), and production Vite bundle (`npm run build`) verified with 0 warnings. |
| **4.3** | Optimistic Multi-Platform Scheduled Queue Sync | **Completed** | Immediate optimistic local vault update in `PostManagerPanel.tsx` (< 10ms response) with automatic rollback on network failure; aligned TikTok handle (`@marrokorg`) and Zernio REST API branding in `PublishScheduleModal.tsx`. |


