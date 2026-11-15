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
});
