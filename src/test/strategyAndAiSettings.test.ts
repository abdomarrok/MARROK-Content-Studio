import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Server } from 'node:http';
import { app } from '../../api/index.ts';
import {
  setGoogleGenAICtorForTesting,
} from '../../api/controllers/generateController.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';
import {
  createSignedSessionToken,
  hashPasswordScrypt,
  resetAuthStateForTest,
} from '../lib/security/sessionAuth.ts';

describe('Strategy Engine & AI Multi-Provider API Integration', () => {
  let server: Server;
  let baseUrl = '';

  const ADMIN_USER = 'marrok_test_admin';
  const ADMIN_PASS = 'Test-Admin-Password-999!';
  const SESSION_SECRET = '0123456789abcdef0123456789abcdef-session-secret';
  let validToken = '';

  const savedEnv = { ...process.env };

  function setupAuth() {
    process.env.ADMIN_USERNAME = ADMIN_USER;
    process.env.ADMIN_PASSWORD_HASH = hashPasswordScrypt(ADMIN_PASS);
    process.env.SESSION_SECRET = SESSION_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEYS;
    validToken = createSignedSessionToken(ADMIN_USER, SESSION_SECRET).token;
  }

  beforeAll(async () => {
    setupAuth();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://localhost:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    process.env = { ...savedEnv };
    setGoogleGenAICtorForTesting(null);
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    resetAuthStateForTest();
    setupAuth();
    setGoogleGenAICtorForTesting(null);
  });

  it('enforces auth fail-closed on POST /api/strategy-brief and bare /strategy-brief', async () => {
    const resProtected = await fetch(`${baseUrl}/api/strategy-brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Cybersecurity incident' }),
    });
    expect(resProtected.status).toBe(401);

    const resBare = await fetch(`${baseUrl}/strategy-brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Cybersecurity incident' }),
    });
    expect(resBare.status).toBe(401);
  });

  it('generates a structured StrategyBrief via POST /api/strategy-brief and bare /strategy-brief with auth', async () => {
    // Mock GenAI to respond quickly with brief json
    setGoogleGenAICtorForTesting(
      class MockGoogleGenAI {
        models = {
          generateContent: async () => ({
            text: JSON.stringify({
              platformFormatGuidance: 'TikTok 15-25s fast explainer with code highlight',
              toneDirection: 'Direct, technical, zero marketing fluff',
              hookStrategy: 'Expose the exact buffer overflow flaw in line 4',
              ctaSuggestion: 'Would you patch this in production or deprecate the node version?',
              relevantBenchmarks: 'Top performing TikTok videos averaged 343 views on offensive AI agents',
              scheduleRecommendation: 'Thursday 10:00 DZ',
              qualityChecks: ['Verify CVE matches NVD', 'Validate stream chunk boundaries'],
              contentWarnings: ['Do not provide ready-to-run exploit payloads'],
            }),
          }),
        };
      } as any
    );

    const payload = {
      prompt: 'Brotli compression zero-day vulnerability in Node.js server streams',
      targetPlatform: 'tiktok',
      publicationObjective: 'engagement',
      contentPillar: 'cybersecurity',
      apiKey: 'test-fake-key-for-brief-12345',
    };

    const res = await fetch(`${baseUrl}/api/strategy-brief`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.platform).toBe('tiktok');
    expect(data.pillar).toBe('cybersecurity');
    expect(data.objective).toBe('engagement');
    expect(data.hookStrategy).toContain('buffer overflow');
    expect(data.ctaSuggestion).toBeTruthy();
    expect(Array.isArray(data.qualityChecks)).toBe(true);
    expect(data.qualityChecks.length).toBeGreaterThan(0);

    // Test bare route
    const bareRes = await fetch(`${baseUrl}/strategy-brief`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify(payload),
    });
    expect(bareRes.status).toBe(200);
    const bareData = await bareRes.json();
    expect(bareData.platform).toBe('tiktok');
    expect(bareData.pillar).toBe('cybersecurity');
  });

  it('enforces auth and manages AI settings via GET/POST /api/ai-settings', async () => {
    // 1. Unauthenticated GET returns 401
    const unauthGet = await fetch(`${baseUrl}/api/ai-settings`);
    expect(unauthGet.status).toBe(401);

    // 2. Authenticated GET returns default settings
    const getRes = await fetch(`${baseUrl}/api/ai-settings`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    expect(getRes.status).toBe(200);
    const initialSettings = await getRes.json();
    expect(initialSettings.activeProviderId).toBeDefined();
    expect(initialSettings.providers).toBeDefined();

    // 3. Authenticated POST updates settings and masks sensitive keys
    const updatePayload = {
      activeProviderId: 'groq',
      fallbackEnabled: true,
      freeBackupEnabled: true,
      providers: {
        ...initialSettings.providers,
        groq: {
          ...initialSettings.providers.groq,
          enabled: true,
          apiKey: 'gsk_1234567890abcdef1234567890abcdef',
          selectedModel: 'llama-3.3-70b-versatile',
        },
      },
    };

    const postRes = await fetch(`${baseUrl}/api/ai-settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify(updatePayload),
    });
    expect(postRes.status).toBe(200);
    const updatedResponse = await postRes.json();
    expect(updatedResponse.ok).toBe(true);
    expect(updatedResponse.settings.activeProviderId).toBe('groq');
    // Key must be masked for client response
    expect(updatedResponse.settings.providers.groq.apiKey).toContain('••••');
    expect(updatedResponse.settings.providers.groq.apiKey).toMatch(/^gsk_12/);

    // 4. Test bare alias /ai-settings
    const bareGet = await fetch(`${baseUrl}/ai-settings`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    expect(bareGet.status).toBe(200);
    const bareData = await bareGet.json();
    expect(bareData.activeProviderId).toBe('groq');
  });

  it('handles connection ping tests via POST /api/ai-settings/test', async () => {
    const testRes = await fetch(`${baseUrl}/api/ai-settings/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        providerId: 'ollama',
        baseUrl: 'http://127.0.0.1:11434/v1',
        selectedModel: 'llama3',
      }),
    });

    expect(testRes.status).toBe(200);
    const result = await testRes.json();
    expect(typeof result.ok).toBe('boolean');
    expect(typeof result.latencyMs).toBe('number');
  });

  it('accepts strategyContext on POST /api/generate and stamps returned deck metadata', async () => {
    // Reset active provider in settings to gemini first so it does not attempt remote groq call
    await fetch(`${baseUrl}/api/ai-settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        activeProviderId: 'gemini',
        fallbackEnabled: true,
      }),
    });

    // Mock GenAI generation to return a valid deck instantly
    setGoogleGenAICtorForTesting(
      class MockGoogleGenAI {
        models = {
          generateContent: async () => ({
            text: JSON.stringify(DEFAULT_STARTER_DECK),
          }),
        };
      } as any
    );

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        prompt: 'Modern container vulnerability scanner CLI demo',
        topicCategory: 'CYBERSECURITY',
        apiKey: 'test-mock-gemini-key-1234567890',
        strategyContext: {
          targetPlatform: 'linkedin',
          contentPillar: 'cybersecurity',
          publicationObjective: 'authority',
          strategyBrief: 'Target B2B cybersecurity leaders on LinkedIn with clear architectural rigor.',
        },
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.slides).toBeDefined();
    expect(data.targetPlatform).toBe('linkedin');
    expect(data.contentPillar).toBe('cybersecurity');
    expect(data.publicationObjective).toBe('authority');
  });
});
