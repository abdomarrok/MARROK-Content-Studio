import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getServerConfig } from '../../api/config.ts';
import {
  buildGeminiContentConfig,
  handleGenerateCarousel,
  handleRefineSlide,
  isGemini4Model,
  resetModelCooldownsForTest,
  setGoogleGenAICtorForTesting,
} from '../../api/controllers/generateController.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';

function createMockResponse() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  };
  return {
    res: res as any,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body as any;
    },
    headers,
  };
}

describe('Phase B3.1 — @google/genai@3.3.0, Verified Model IDs & Bounded Serverless Deadlines', () => {
  const mockedGenerateContent = vi.fn();
  const capturedCtorOptions: Array<{
    apiKey?: string;
    httpOptions?: { headers?: Record<string, string> };
  }> = [];

  beforeEach(() => {
    mockedGenerateContent.mockReset();
    capturedCtorOptions.length = 0;
    resetModelCooldownsForTest();

    setGoogleGenAICtorForTesting(
      class MockGoogleGenAI {
        models = {
          generateContent: mockedGenerateContent,
        };
        constructor(opts: { apiKey: string; httpOptions?: { headers?: Record<string, string> } }) {
          capturedCtorOptions.push(opts);
        }
      }
    );
  });

  afterEach(() => {
    setGoogleGenAICtorForTesting(null);
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY_BACKUP;
  });

  it('ships @google/genai@3.3.0 (real SDK instantiates cleanly) with verified Gemini 4 & 3.x model IDs', async () => {
    const pkgRaw = await fs.readFile(path.resolve(process.cwd(), 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw) as { dependencies?: Record<string, string> };
    const genaiVersion = pkg.dependencies?.['@google/genai'] || '';
    expect(genaiVersion).toMatch(/3\.3\.\d+/);

    // Instantiate the real @google/genai SDK client cleanly to confirm runtime contract compatibility
    const realSdkClient = new GoogleGenAI({
      apiKey: 'AIzaUnitContractCheckOnly',
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
    });
    expect(typeof realSdkClient.models.generateContent).toBe('function');

    const cfg = getServerConfig({});
    expect(cfg.generationModels).toEqual([
      'gemini-4-hydrogen',
      'gemini-3.1-flash-lite',
      'gemini-3.5-flash-lite',
    ]);
    expect(cfg.imageModels).toEqual([
      'gemini-3.1-flash-lite-image',
      'gemini-nano-banana-2.1',
    ]);
  });

  it('omits temperature and deprecated sampling config for gemini-4-* models while keeping it for 3.x models', () => {
    expect(isGemini4Model('gemini-4-hydrogen')).toBe(true);
    expect(isGemini4Model('gemini-4-argon')).toBe(true);
    expect(isGemini4Model('gemini-4-carbon')).toBe(true);
    expect(isGemini4Model('gemini-3.1-flash-lite')).toBe(false);

    const g4Config = buildGeminiContentConfig('gemini-4-hydrogen', {
      systemInstruction: 'sys',
      temperature: 0.2,
      responseMimeType: 'application/json',
    });
    expect(g4Config).not.toHaveProperty('temperature');
    expect(g4Config).not.toHaveProperty('topP');
    expect(g4Config).not.toHaveProperty('topK');
    expect(g4Config).not.toHaveProperty('candidateCount');
    expect(g4Config).not.toHaveProperty('thinkingBudget');
    expect(g4Config.responseMimeType).toBe('application/json');

    const g3Config = buildGeminiContentConfig('gemini-3.1-flash-lite', {
      systemInstruction: 'sys',
      temperature: 0.2,
      responseMimeType: 'application/json',
    });
    expect(g3Config.temperature).toBe(0.2);
  });

  it('executes carousel generation via @google/genai on gemini-4-hydrogen with aistudio-build User-Agent', async () => {
    process.env.GEMINI_API_KEY = 'AIzaTestPrimaryKey123456';
    const validSample = {
      ...DEFAULT_STARTER_DECK,
      slides: DEFAULT_STARTER_DECK.slides.slice(0, 3),
    };

    mockedGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify(validSample),
      candidates: [
        {
          groundingMetadata: {
            webSearchQueries: ['Redis pipelining latency benchmark'],
            groundingChunks: [
              { web: { uri: 'https://redis.io/docs/manual/pipelining/', title: 'Redis Pipelining' } },
            ],
            groundingSupports: [],
          },
        },
      ],
    });

    const mockRes = createMockResponse();
    await handleGenerateCarousel(
      {
        headers: {},
        body: {
          prompt: 'Redis pipelining benchmark cuts round trips by 70%',
          inputMode: 'text',
        },
      } as any,
      mockRes.res
    );

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.headers['x-marrok-model']).toBe('gemini-4-hydrogen');
    expect(mockRes.headers['x-marrok-engine']).toBe('grounded');
    expect(capturedCtorOptions[0]?.httpOptions?.headers?.['User-Agent']).toBe('aistudio-build');
    expect(mockedGenerateContent).toHaveBeenCalledTimes(1);

    const callArg = mockedGenerateContent.mock.calls[0][0];
    expect(callArg.model).toBe('gemini-4-hydrogen');
    expect(callArg.config).not.toHaveProperty('temperature');
    expect(callArg.config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('enforces a single overall AbortSignal deadline on handleRefineSlide across multi-key/multi-model stalls', async () => {
    process.env.GEMINI_API_KEY = 'AIzaStallPrimary123456';
    process.env.GEMINI_API_KEY_BACKUP = 'AIzaStallBackup123456';

    // Simulate network stalls that only reject when the combined abortSignal fires
    mockedGenerateContent.mockImplementation((args: { config?: { abortSignal?: AbortSignal } }) => {
      return new Promise((_resolve, reject) => {
        const signal = args.config?.abortSignal;
        if (signal?.aborted) {
          reject(new Error('Request aborted'));
          return;
        }
        signal?.addEventListener(
          'abort',
          () => {
            reject(new Error('Slide refine deadline aborted'));
          },
          { once: true }
        );
      });
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) {
          reject(new Error('Aborted'));
          return;
        }
        signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
      });
    });

    process.env.FREE_BACKUP_AI_ENABLED = 'false';
    const mockRes = createMockResponse();
    const startedAt = Date.now();
    await handleRefineSlide(
      {
        headers: {},
        body: {
          budgetMs: 700,
          category: 'BACKEND SYSTEMS',
          slide: {
            enTitle: 'Pipelining cuts round trips.',
            arTitle: 'التمرير المتوازي يقلل الرحلات.',
            enBody: 'Batch commands inside one socket write.',
            arBody: 'تجميع الأوامر في كتابة مقبس شبكة واحدة.',
          },
        },
      } as any,
      mockRes.res
    );
    const elapsed = Date.now() - startedAt;
    delete process.env.FREE_BACKUP_AI_ENABLED;

    expect(mockedGenerateContent).toHaveBeenCalled();
    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body.engine).toBe('offline');
    expect(mockRes.body.enTitle).toBe('Pipelining cuts round trips.');
    // Aborted cleanly near the 700ms overall budget instead of hanging across keys+models
    expect(elapsed).toBeGreaterThanOrEqual(450);
    expect(elapsed).toBeLessThan(1800);
  });

  it('recovers immediately via same-model fast JSON mode on HTTP 400 schema-constraint errors without cooling down the model', async () => {
    process.env.GEMINI_API_KEY = 'AIzaTestSchemaRecovery123';
    process.env.FREE_BACKUP_AI_ENABLED = 'false';

    const bodyFirstSample = {
      theme: 'cyber',
      category: 'CYBERSECURITY',
      sourceMeta: { title: 'Java4Shell Advisory', creator: 'Security Research' },
      facts: [{ text: 'CVSS 9.8 critical RCE in OpenJDK', type: 'number', verified: 'unconfirmed' }],
      coreInsight: 'Unpatched OpenJDK classloader paths expose production servers to silent RCE.',
      slide2Draft: {
        enTitle: 'Unpatched JVMs execute untrusted payloads',
        arTitle: 'الإصدارات غير المحدثة تنفذ شيفرات خبيثة',
        enBody: 'Deserializing untrusted streams bypasses sandbox isolation.',
        arBody: 'تمرير البيانات غير الموثوقة يتجاوز العزل.',
      },
      slides: [
        {
          type: 'row',
          enTitle: 'Unpatched JVMs execute untrusted payloads',
          arTitle: 'الإصدارات غير المحدثة تنفذ شيفرات خبيثة',
          enBody: 'Deserializing untrusted streams bypasses sandbox isolation.',
          arBody: 'تمرير البيانات غير الموثوقة يتجاوز العزل.',
        },
        {
          type: 'cta',
          enTitle: 'Patch every OpenJDK runtime today',
          arTitle: 'حدث كل خوادم OpenJDK اليوم',
          enBody: 'Audit running containers and upgrade immediately.',
          arBody: 'افحص الحاويات العاملة وحدثها فورا.',
          ctaText: 'Save this security checklist',
          url: 'https://marrok.org',
        },
      ],
      hookVariants: [
        {
          tag: 'Contrarian',
          framework: 'Contrarian',
          score: 94,
          selected: true,
          enTitle: 'One unpatched OpenJDK node exposes your entire cluster',
          arTitle: 'خادم OpenJDK واحد يكشف كل بيئة الإنتاج',
          enBody: '',
          arBody: '',
          coverStyle: 'headline-hero',
          coverTeaserEn: 'Inside the exploit chain and emergency patch steps',
          coverTeaserAr: 'تفاصيل مسار الاستغلال وخطوات الإغلاق الفوري',
        },
      ],
      selectedHookIndex: 0,
      slide1: {
        type: 'row',
        coverStyle: 'headline-hero',
        enTitle: 'One unpatched OpenJDK node exposes your entire cluster',
        arTitle: 'خادم OpenJDK واحد يكشف كل بيئة الإنتاج',
        enBody: '',
        arBody: '',
        coverTeaserEn: 'Inside the exploit chain and emergency patch steps',
        coverTeaserAr: 'تفاصيل مسار الاستغلال وخطوات الإغلاق الفوري',
        showSwipeCue: true,
      },
      caption: 'Bilingual security alert',
    };

    const schemaTooManyStatesErr = new Error(
      '{"error":{"code":400,"message":"The specified schema produces a constraint that has too many states","status":"INVALID_ARGUMENT"}}'
    );

    // Call 1 (direct schema on gemini-4-hydrogen): fails with 400 schema constraint
    // Call 2 (fast JSON mode on same model without responseSchema): succeeds
    // Call 3 (second request verifying model was NOT put on cooldown): succeeds immediately on same model
    mockedGenerateContent
      .mockRejectedValueOnce(schemaTooManyStatesErr)
      .mockResolvedValueOnce({ text: JSON.stringify(bodyFirstSample) })
      .mockResolvedValueOnce({ text: JSON.stringify(bodyFirstSample) });

    const longPrompt =
      'Java4Shell CVE-2026-114938 is a critical vulnerability in OpenJDK allowing remote code execution across unpatched production clusters when processing untrusted serialized input streams without strict classloader isolation and immediate security patching.';

    const mockRes1 = createMockResponse();
    await handleGenerateCarousel(
      {
        headers: {},
        body: {
          prompt: longPrompt,
          inputMode: 'text',
        },
      } as any,
      mockRes1.res
    );

    expect(mockRes1.statusCode).toBe(200);
    expect(mockRes1.headers['x-marrok-model']).toBe('gemini-4-hydrogen');
    expect(mockRes1.headers['x-marrok-engine']).toBe('ungrounded');
    expect(mockRes1.body?.slides).toHaveLength(3);
    expect(mockedGenerateContent).toHaveBeenCalledTimes(2);

    const firstCall = mockedGenerateContent.mock.calls[0][0];
    const secondCall = mockedGenerateContent.mock.calls[1][0];
    expect(firstCall.model).toBe('gemini-4-hydrogen');
    expect(firstCall.config.responseSchema).toBeDefined();
    expect(secondCall.model).toBe('gemini-4-hydrogen');
    expect(secondCall.config.responseMimeType).toBe('application/json');
    expect(secondCall.config.responseSchema).toBeUndefined();

    // Verify gemini-4-hydrogen was NOT cooled down by the 400 schema error
    const mockRes2 = createMockResponse();
    await handleGenerateCarousel(
      {
        headers: {},
        body: {
          prompt: longPrompt,
          inputMode: 'text',
        },
      } as any,
      mockRes2.res
    );
    expect(mockRes2.statusCode).toBe(200);
    expect(mockRes2.headers['x-marrok-model']).toBe('gemini-4-hydrogen');
    expect(mockedGenerateContent.mock.calls[2][0].model).toBe('gemini-4-hydrogen');

    delete process.env.FREE_BACKUP_AI_ENABLED;
  });
});
