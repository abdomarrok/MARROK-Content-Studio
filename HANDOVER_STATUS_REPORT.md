# MARROK Content Studio — Comprehensive Handover & Code Status Report

**Generated Date**: November 20, 2026  
**Branch**: `main`  
**Target Audience**: Subsequent AI Agents and Engineering Contributors  
**System Health**: 100% Passing (TypeScript 0 errors, 49/49 Vitest test suites, 357/357 tests passing, Production Build verified)

---

## 1. Executive Summary

This report documents the architectural advancements, completed features, known infrastructure nuances (specifically around database connections and local DNS on Windows), and the approved roadmap for **Multi-Key Stacking & Rotation per Provider**.

Over the last series of milestones, the following core features have been implemented and verified end-to-end:
1. **Content Strategy Engine (PR 1 - PR 3)**: Deep strategic briefing pipeline grounding carousels with engineering heuristics, platform awareness (TikTok, Instagram, LinkedIn, Facebook), and polarizing CTAs.
2. **Multi-Provider AI Studio Connections & Model Hub**: Comprehensive connection drawer supporting Google Gemini, Anthropic Claude, OpenAI, Groq Cloud, Ollama, and Custom OpenAI-Compatible Endpoints (OpenRouter / DeepSeek / vLLM) with AES-256-GCM encryption at rest.
3. **Automated Model Configuration**: Zero-friction model selection removing manual ID typing; automatically selects recommended stable models (`deepseek/deepseek-chat`, `gpt-4o`, `claude-3-7-sonnet-20250219`, `llama-3.3-70b-versatile`, `gemini-4-hydrogen`).
4. **Resilient Local Vault Fallback**: Instant local disk encryption (`.data/ai_settings.json`) protecting against remote cloud network/DNS stalls.

---

## 2. Codebase & CI Verification Status

The codebase currently satisfies all strict architectural constraints defined in [AGENTS.md](file:///c:/Users/888/Desktop/MARROK-Content-Studio/AGENTS.md):

| Check | Command | Status | Notes |
| :--- | :--- | :--- | :--- |
| **TypeScript Typecheck** | `npm run lint` (`tsc --noEmit`) | **PASS** (0 errors) | Strict TS7 types across all modules |
| **Unit & Integration Tests** | `npm test` (`vitest run`) | **PASS** (357/357 tests, 49 files) | Tests auth, routing, vault, canvas, exporters |
| **API Boundary Constraint** | `npx vitest run src/lib/network/apiRouting.test.ts` | **PASS** (12 files) | Strictly `<= 12` files recursively under `/api` |
| **Production Build** | `npm run build` (`vite build`) | **PASS** (1.46s) | Clean asset splitting; zero warnings |
| **Live Browser E2E** | `playwright test e2e/aiSettingsDrawer.spec.ts` | **PASS** (8.3s) | Verified live with Google Chrome channel |

---

## 3. What Has Been Completed

### 3.1 Content Strategy Engine (Two-Stage Synthesis Pipeline)
- **Files Created/Modified**:
  - [src/lib/strategy/strategyConfig.ts](file:///c:/Users/888/Desktop/MARROK-Content-Studio/src/lib/strategy/strategyConfig.ts): Pillar definitions (`architecture`, `production_war_stories`, `dev_culture`, `ai_agentic_workflows`), platform rules, polarizing CTA generators.
  - [src/lib/strategy/strategyPromptDecorator.ts](file:///c:/Users/888/Desktop/MARROK-Content-Studio/src/lib/strategy/strategyPromptDecorator.ts): Decorates prompts with strategic guidelines and platform constraints.
  - [api/controllers/aiStudioController.ts](file:///c:/Users/888/Desktop/MARROK-Content-Studio/api/controllers/aiStudioController.ts): Endpoint `POST /api/strategy-brief` (and bare alias `/strategy-brief`) producing structured JSON brief.
  - [src/lib/autonomousPipeline.ts](file:///c:/Users/888/Desktop/MARROK-Content-Studio/src/lib/autonomousPipeline.ts): Integrates Step 1 (Brief generation) -> Step 2 (Deck synthesis) with fallback to local rule-based decorator.
  - [src/components/PlanInspectorModal.tsx](file:///c:/Users/888/Desktop/MARROK-Content-Studio/src/components/PlanInspectorModal.tsx): Strategy tab inspecting active brief details.

### 3.2 Multi-Provider AI Studio Connections & Model Hub
- **Files Created/Modified**:
  - [src/components/studio/AiSettingsDrawer.tsx](file:///c:/Users/888/Desktop/MARROK-Content-Studio/src/components/studio/AiSettingsDrawer.tsx): UI drawer with provider cards, key inputs, auto-configured model badges, instant ping testing, and tab buffer sync.
  - [src/lib/ai/aiSettingsClient.ts](file:///c:/Users/888/Desktop/MARROK-Content-Studio/src/lib/ai/aiSettingsClient.ts): Client helpers (`fetchAiSettings`, `saveAiSettings`, `testProviderConnection`) with auth header propagation.
  - [api/controllers/aiStudioController.ts](file:///c:/Users/888/Desktop/MARROK-Content-Studio/api/controllers/aiStudioController.ts):
    - `GET /api/ai-settings`: Returns provider state with encrypted secrets safely decrypted and masked (`sk-••••••••1234`).
    - `POST /api/ai-settings`: Accepts updated credentials, encrypts plaintext keys with AES-256-GCM using `SESSION_SECRET`, and persists to vault.
    - `POST /api/ai-settings/test`: Executes lightweight 1-token PING to verify credentials and model responsiveness.
  - [api/controllers/generateController.ts](file:///c:/Users/888/Desktop/MARROK-Content-Studio/api/controllers/generateController.ts): Dispatches generation requests to the active vaulted provider (OpenAI, Claude, Groq, Ollama, OpenRouter/Custom) before falling back to Gemini and zero-key Pollinations backup.

---

## 4. Why the "Connection failed: signal timed out" Error Occurred

During browser testing, the user encountered the error:
> `Connection failed: signal timed out` (red text beside "Test Connection" and toast notification)

### Root Cause Analysis:
1. **Windows Local DNS Bottleneck**:
   The host machine's primary DNS resolver (`10.43.46.168`) times out when performing external DNS lookups for Neon AWS cloud hostnames (e.g. `ep-still-queen-bdi9ylm8-pooler.c-8.us-east-2.aws.neon.tech`).
2. **Masked Key Vault Lookup**:
   When testing an existing connection where the API key is already masked (`••••••••`), the client sends the masked string to the server. The server correctly detects the mask and attempts to load the decrypted key from the database vault via `loadRawVaultSettings()`.
3. **Unreachable / Slow Cloud DB Pool**:
   Because `DATABASE_URL` pointed to an external cloud Neon pooler that was hanging on DNS/TLS handshakes, `loadRawVaultSettings()` spent 10–16 seconds attempting to connect to PostgreSQL.
4. **Client Abort Timeout**:
   `testProviderConnection()` in [src/lib/ai/aiSettingsClient.ts](file:///c:/Users/888/Desktop/MARROK-Content-Studio/src/lib/ai/aiSettingsClient.ts) has an `AbortSignal.timeout(16000)`. Once 16 seconds elapsed, Chrome aborted the fetch request, throwing `AbortError: signal timed out`.

### The Resolution ("Skip DB Connection"):
- In [.env](file:///c:/Users/888/Desktop/MARROK-Content-Studio/.env), `DATABASE_URL` has been commented out.
- The vault controller in [api/controllers/aiStudioController.ts](file:///c:/Users/888/Desktop/MARROK-Content-Studio/api/controllers/aiStudioController.ts) automatically uses the local disk vault fallback:
  ```ts
  const LOCAL_FALLBACK_DIR = path.resolve(process.cwd(), '.data');
  const LOCAL_SETTINGS_FILE = path.resolve(LOCAL_FALLBACK_DIR, 'ai_settings.json');
  ```
- With local disk fallback, `loadRawVaultSettings()` and `saveRawVaultSettings()` execute in **< 1ms**, completely eliminating the timeout and making "Test Connection" and "Save & Vault" instantaneous.

---

## 5. What We Want To Do Next: Multi-Key Stacking & Rotation Plan

The user approved the implementation plan: [multi-key-vault-rotation-plan.md](file:///C:/Users/888/.gemini/antigravity/brain/b9fa58f5-1d88-4892-8833-a2bb37da0e36/multi-key-vault-rotation-plan.md).

### The Objective:
Allow users to stack multiple working API keys for any given provider (e.g., 2+ OpenAI keys, multiple OpenRouter accounts, multiple Claude keys), store and encrypt them in the vault, and automatically failover/rotate between them when one key hits rate limits or quota exhaustion (`credit_balance_exhausted` / HTTP 429).

### Next Agent Implementation Checklist:

#### Step 1: Update Types ([src/types.ts](file:///c:/Users/888/Desktop/MARROK-Content-Studio/src/types.ts))
Add the `AIKeyEntry` interface and update `AIProviderConfig`:
```typescript
export interface AIKeyEntry {
  id: string;
  label: string;
  key: string; // Plaintext when editing, masked when loaded from vault
  enabled: boolean;
  status?: 'active' | 'rate_limited' | 'invalid' | 'untested';
  lastTestedAt?: string;
  lastLatencyMs?: number;
  lastError?: string;
  rateLimitedUntil?: number; // Epoch timestamp for cooldown
}

export interface AIProviderConfig {
  providerId: AIProviderId;
  name: string;
  enabled: boolean;
  keys: AIKeyEntry[]; // Array of stacked keys
  rotationStrategy?: 'priority-failover' | 'round-robin';
  activeKeyIndex?: number;
  // Preserve optional legacy single apiKey & backupApiKey for backward compatibility
  apiKey?: string;
  backupApiKey?: string;
  baseUrl?: string;
  selectedModel: string;
  availableModels: string[];
  isCustomEndpoint?: boolean;
}
```

#### Step 2: Update Server Vault Controller ([api/controllers/aiStudioController.ts](file:///c:/Users/888/Desktop/MARROK-Content-Studio/api/controllers/aiStudioController.ts))
1. Update `StoredRawKeyEntry` to store `{ id, label, encryptedKey, enabled, status, rateLimitedUntil }`.
2. In `loadRawVaultSettings()`: automatically migrate legacy `encryptedApiKey` / `encryptedBackupApiKey` into the `keys` array if `keys` is empty.
3. In `sanitizeSettingsForClient()`: decrypt and mask every key in `keys` (`sk-••••••••1234`).
4. In `handleSaveAiSettings()`: iterate over `keys`, encrypting new plaintext keys with AES-256-GCM while preserving existing ciphertexts for masked keys.
5. In `handleTestConnection()`: accept optional `keyId` to test a specific key in the stack and return per-key status.

#### Step 3: Update Generation Dispatcher ([api/controllers/generateController.ts](file:///c:/Users/888/Desktop/MARROK-Content-Studio/api/controllers/generateController.ts))
1. When generating with an active provider (OpenAI, Anthropic, Groq, Custom):
   - Filter enabled keys: `keys.filter(k => k.enabled && (!k.rateLimitedUntil || k.rateLimitedUntil < Date.now()))`.
   - Order candidate keys according to `rotationStrategy`:
     - `priority-failover`: sequential order (Index 0 -> Index 1 -> ...).
     - `round-robin`: rotate active index on each request.
   - Failover loop: If a key returns HTTP 429 or quota exhaustion (`credit_balance_exhausted`), mark cooldown (`rateLimitedUntil = Date.now() + 60_000`) and immediately try the next key in the pool.
   - If all keys in the provider pool fail, cascade to Gemini primary / backup, then free Pollinations backup.

#### Step 4: Update UI Drawer ([src/components/studio/AiSettingsDrawer.tsx](file:///c:/Users/888/Desktop/MARROK-Content-Studio/src/components/studio/AiSettingsDrawer.tsx))
1. Render a **Key Stack List**:
   - Each key row shows: Label input, masked key input, enable/disable toggle, individual "Ping" test button, and delete icon.
   - "+ Add Another Key" button to append a new empty key slot to the stack.
   - Rotation Strategy dropdown: "Priority Failover (Recommended)" vs "Round-Robin".
   - Retain the Auto-Configured Model badge.

#### Step 5: Verification & Quality Gates
1. Run `npx vitest run src/test/aiSettingsVault.test.ts` to verify multi-key encryption and legacy migration.
2. Run `npx vitest run src/test/strategyAndAiSettings.test.ts` to verify multi-key saving and failover.
3. Run full suite: `npm run lint && npm test && npm run build`.
4. Run live browser test: `npx playwright test e2e/aiSettingsDrawer.spec.ts`.

---

## 6. Current File Architecture & Rules

- **Do NOT add new files to `/api`**: It must remain strictly `<= 12` files recursively (enforced by [apiRouting.test.ts](file:///c:/Users/888/Desktop/MARROK-Content-Studio/src/lib/network/apiRouting.test.ts)).
- **Node-only API imports**: Code under `api/` must never import browser or canvas modules.
- **Never expose raw API keys**: Keys must be masked on client responses and encrypted at rest on disk/DB using AES-256-GCM.
- **Bilingual & Technical Accuracy**: Arabic technical terms must retain Latin names with BiDi isolation (`\u2066...\u2069`) as specified in [AGENTS.md](file:///c:/Users/888/Desktop/MARROK-Content-Studio/AGENTS.md).
