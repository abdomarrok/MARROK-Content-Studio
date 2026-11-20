import type { Request, Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  CarouselData,
  CoverStyle,
  DiagramNode,
  ExtractedFact,
  GroundingSource,
  PostFormat,
  SlideData,
  SlideVisualSpec,
} from '../../src/types.ts';
import { synthesizeCarousel } from '../../src/lib/synthesizer.ts';
import {
  applyViralHookTierSelection,
  clampCoverTeaser,
  condenseCarouselToSingleSlide,
  deriveCoverTeaserForSlide,
  findCatalogDescriptor,
  getSlideCatalogId,
  isGenericPlaceholderValue,
  materializeLayoutForSlide,
  rankSlideLayoutsForDeck,
  resolveSlide1CoverStyle,
  seedSingleSlideTakeaways,
} from '../../src/lib/synthesis/index.ts';
import { isPlaceholderOrEmptyBrandValue } from '../../src/lib/bundledTechSvgs.ts';
import { sanitizeSvgBlueprintMarkup } from '../../src/lib/canvas/svgBlueprint.ts';
import { sanitizeArabicSlideText, sanitizeCoverTeaserText, sanitizeFullCarousel } from '../../src/lib/textSanitizer.ts';
import {
  ALLOWED_INPUT_MODES,
  ALLOWED_IMAGE_MIMES,
  sanitizeLogText,
} from '../constants.ts';
import { getServerConfig, resolveRequestGeminiKeys } from '../config.ts';
import {
  MARROK_SYSTEM_PROMPT,
  buildUserCarouselPrompt,
  CAROUSEL_RESPONSE_SCHEMA,
  DIRECT_VISUAL_RESPONSE_SCHEMA,
} from '../prompts/systemPrompt.ts';
import { parseCarouselData } from '../../src/lib/validation/carousel.ts';
import { parseImageDataUrl, parseRawBase64Image } from '../../src/lib/validation/image.ts';
import { validateSourceSufficiency } from '../../src/lib/synthesis/inputSufficiency.ts';
import { getDecryptedAiSettings } from './aiStudioController.ts';
import type { AIProviderId } from '../../src/types.ts';

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

interface GroundingSupportItem {
  segment?: { text?: string };
  groundingChunkIndices?: number[];
}

export interface GoogleGenAIClientLike {
  models: {
    generateContent: (args: any) => Promise<any>;
  };
}

type GoogleGenAICtor = new (opts: {
  apiKey: string;
  httpOptions?: { headers?: Record<string, string> };
}) => GoogleGenAIClientLike;

let customGoogleGenAICtorForTesting: GoogleGenAICtor | null = null;

export function setGoogleGenAICtorForTesting(ctor: GoogleGenAICtor | null): void {
  customGoogleGenAICtorForTesting = ctor;
}

export function createGoogleGenAIClient(apiKey: string): GoogleGenAIClientLike {
  const Ctor: GoogleGenAICtor =
    customGoogleGenAICtorForTesting || (GoogleGenAI as unknown as GoogleGenAICtor);
  return new Ctor({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const TOTAL_REQUEST_BUDGET_MS = 38_000;
const REFINE_TOTAL_BUDGET_MS = 22_000;
const GROUNDED_ATTEMPT_TIMEOUT_MS = 10_000;
const DIRECT_TEXT_TIMEOUT_MS = 14_000;
const DIRECT_IMAGE_TIMEOUT_MS = 16_000;
const FREE_BACKUP_TIMEOUT_MS = 8_000;

const OVERLOAD_COOLDOWN_MS = 60_000;
const NOT_FOUND_COOLDOWN_MS = 300_000;
const modelCooldownUntil = new Map<string, number>();

const GENERATION_CACHE_TTL_MS = 60_000;
const MAX_GENERATION_CACHE_ENTRIES = 50;

interface CachedGenerationEntry {
  data: CarouselData;
  engine: string;
  model: string;
  expiresAt: number;
}

const generationResponseCache = new Map<string, CachedGenerationEntry>();
const inFlightGenerations = new Map<string, Promise<CachedGenerationEntry | null>>();

export function resetGenerationCacheForTest(): void {
  generationResponseCache.clear();
  inFlightGenerations.clear();
}

export function resetModelCooldownsForTest(): void {
  modelCooldownUntil.clear();
  resetGenerationCacheForTest();
}

function buildGenerationCacheKey(params: {
  safePrompt: string;
  safeInputMode: string;
  safeCategoryHint: string;
  postFormat: 'carousel' | 'single';
  imagePayload: { mimeType: string; base64: string } | null;
}): string {
  const { safePrompt, safeInputMode, safeCategoryHint, postFormat, imagePayload } = params;
  const imgFingerprint = imagePayload
    ? `${imagePayload.mimeType}:${imagePayload.base64.length}:${imagePayload.base64.slice(0, 48)}:${imagePayload.base64.slice(-48)}`
    : 'no-img';
  return `${postFormat}|${safeInputMode}|${safeCategoryHint}|${imgFingerprint}|${safePrompt}`;
}

function getCachedGeneration(key: string): CachedGenerationEntry | null {
  const existing = generationResponseCache.get(key);
  if (!existing) return null;
  if (Date.now() > existing.expiresAt) {
    generationResponseCache.delete(key);
    return null;
  }
  return {
    ...existing,
    data: structuredClone(existing.data),
  };
}

function storeCachedGeneration(key: string, entry: Omit<CachedGenerationEntry, 'expiresAt'>): CachedGenerationEntry {
  const fullEntry: CachedGenerationEntry = {
    data: structuredClone(entry.data),
    engine: entry.engine,
    model: entry.model,
    expiresAt: Date.now() + GENERATION_CACHE_TTL_MS,
  };
  if (generationResponseCache.has(key)) {
    generationResponseCache.delete(key);
  } else if (generationResponseCache.size >= MAX_GENERATION_CACHE_ENTRIES) {
    const oldestKey = generationResponseCache.keys().next().value;
    if (oldestKey !== undefined) {
      generationResponseCache.delete(oldestKey);
    }
  }
  generationResponseCache.set(key, fullEntry);
  return fullEntry;
}

function classifyModelError(
  err: unknown
): 'overload' | 'not_found' | 'timeout' | 'schema_constraint' | 'other' {
  const raw = err instanceof Error ? err.message : String(err);
  const upper = raw.toUpperCase();
  if (
    upper.includes('TOO MANY STATES') ||
    upper.includes('CONSTRAINT THAT HAS TOO MANY STATES') ||
    upper.includes('NESTING DEPTH') ||
    (upper.includes('SCHEMA') && upper.includes('400'))
  ) {
    return 'schema_constraint';
  }
  if (
    upper.includes('503') ||
    upper.includes('429') ||
    upper.includes('UNAVAILABLE') ||
    upper.includes('RESOURCE_EXHAUSTED') ||
    upper.includes('HIGH DEMAND') ||
    upper.includes('OVERLOADED') ||
    upper.includes('QUOTA')
  ) {
    return 'overload';
  }
  if (upper.includes('404') || upper.includes('NOT_FOUND') || upper.includes('NO LONGER AVAILABLE')) {
    return 'not_found';
  }
  if (upper.includes('ABORT') || upper.includes('TIMEOUT') || upper.includes('TIMED OUT')) {
    return 'timeout';
  }
  return 'other';
}

export function isGemini4Model(model: string): boolean {
  return /^gemini-4-/i.test(model.trim());
}

/**
 * Builds @google/genai GenerateContentConfig cleanly:
 * Per Gemini 4 API spec, omits deprecated sampling params (temperature, topP, topK, candidateCount, thinkingBudget)
 * when targeting gemini-4-hydrogen, gemini-4-argon, or gemini-4-carbon.
 */
export function buildGeminiContentConfig(
  model: string,
  options: {
    systemInstruction?: string;
    temperature?: number;
    thinkingLevel?: ThinkingLevel;
    tools?: Array<{ googleSearch: Record<string, never> }>;
    responseMimeType?: string;
    responseSchema?: unknown;
    abortSignal?: AbortSignal;
  }
): Record<string, unknown> {
  const cfg: Record<string, unknown> = {};
  if (options.systemInstruction !== undefined) cfg.systemInstruction = options.systemInstruction;
  if (!isGemini4Model(model) && options.temperature !== undefined) {
    cfg.temperature = options.temperature;
  }
  if (options.thinkingLevel !== undefined) {
    cfg.thinkingConfig = { thinkingLevel: options.thinkingLevel };
  }
  if (options.tools !== undefined) cfg.tools = options.tools;
  if (options.responseMimeType !== undefined) cfg.responseMimeType = options.responseMimeType;
  if (options.responseSchema !== undefined) cfg.responseSchema = options.responseSchema;
  if (options.abortSignal !== undefined) cfg.abortSignal = options.abortSignal;
  return cfg;
}

export function createCombinedDeadlineSignal(
  parentSignal: AbortSignal | undefined,
  attemptTimeoutMs: number
): AbortSignal {
  const safeTimeout = Math.max(500, Math.floor(attemptTimeoutMs));
  const stepSignal = AbortSignal.timeout(safeTimeout);
  if (!parentSignal) return stepSignal;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([parentSignal, stepSignal]);
  }
  return stepSignal;
}

export function recordModelUnavailable(model: string, err: unknown): void {
  const kind = classifyModelError(err);
  if (kind === 'overload') {
    modelCooldownUntil.set(model, Date.now() + OVERLOAD_COOLDOWN_MS);
  } else if (kind === 'not_found') {
    modelCooldownUntil.set(model, Date.now() + NOT_FOUND_COOLDOWN_MS);
  }
}

export function getPrioritizedModels(models: string[], excludeInRequest?: Set<string>): string[] {
  const now = Date.now();
  const available: string[] = [];
  const coolingDown: string[] = [];
  const excluded: string[] = [];

  for (const model of models) {
    if (excludeInRequest?.has(model)) {
      excluded.push(model);
      continue;
    }
    const until = modelCooldownUntil.get(model) || 0;
    if (until > now) {
      coolingDown.push(model);
    } else {
      if (until > 0) modelCooldownUntil.delete(model);
      available.push(model);
    }
  }

  return [...available, ...coolingDown, ...excluded];
}

export function formatModelFallbackReason(err: unknown, key?: string): string {
  const kind = classifyModelError(err);
  if (kind === 'overload') return 'HTTP 503/429 temporary high demand';
  if (kind === 'not_found') return 'HTTP 404 model unavailable';
  if (kind === 'timeout') return 'request timeout budget reached';
  if (kind === 'schema_constraint') return 'HTTP 400 schema complexity limit';
  const raw = err instanceof Error ? err.message : String(err);
  const sanitized = sanitizeLogText(raw, key)
    .replace(/[{}"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized.slice(0, 90) || 'transient generation notice';
}

const JSON_SCHEMA_COMPACT_GUIDE = `
CRITICAL JSON OUTPUT FORMAT:
Return ONLY a valid raw JSON object (no markdown fences, no commentary) in this exact body-first field order:
{
  "theme": "teal",
  "category": "SYSTEM ARCHITECTURE",
  "sourceMeta": { "title": "Source title", "creator": "Author or Publisher", "url": "" },
  "facts": [
    { "text": "Key engineering fact", "type": "claim", "verified": "unconfirmed" }
  ],
  "coreInsight": "One concise sentence capturing the counter-intuitive insight or painful mistake.",
  "slide2Draft": {
    "enTitle": "Concrete problem or failure headline",
    "arTitle": "عنوان عربي طبيعي يصف المشكلة",
    "enBody": "Concise under-20-word explanation of what breaks.",
    "arBody": "شرح عربي مختصر أقل من ٢٠ كلمة."
  },
  "slides": [
    {
      "type": "row",
      "enTitle": "Slide 2 problem headline",
      "arTitle": "عنوان الشريحة الثانية",
      "enBody": "Concise problem body under 20 words.",
      "arBody": "نص عربي مختصر للشريحة الثانية.",
      "diagramVariant": "topology",
      "diagramNodes": [
        { "label": "Ingress", "sublabel": "mTLS", "status": "ACTIVE", "icon": "globe" },
        { "label": "Runtime", "sublabel": "Isolate", "status": "ACTIVE", "icon": "cpu" },
        { "label": "Storage", "sublabel": "WAL", "status": "ACTIVE", "icon": "database" }
      ],
      "diagramEdges": ["REQ", "FLUSH"],
      "diagramFooter": "FLOW: INGRESS -> ISOLATE -> WAL"
    }
  ],
  "hookVariants": [
    { "tag": "Contrarian", "framework": "Contrarian", "score": 92, "selected": true, "enTitle": "<6-to-12 word contrarian hook challenging Slide 2 failure without filler>", "arTitle": "<Natural Arabic RTL hook naming Slide 2 failure>", "enBody": "", "arBody": "", "coverStyle": "headline-hero", "coverTeaserEn": "<1-line <=68 char teaser>", "coverTeaserAr": "<جملة تمهيد عربية مختلفة عن العنوان>" },
    { "tag": "Specific Metric", "framework": "Specific Metric", "score": 88, "selected": false, "enTitle": "<6-to-12 word hook anchoring Slide 2 concrete metric without colons or emojis>", "arTitle": "<Arabic RTL metric hook grounded in Slide 2>", "enBody": "", "arBody": "", "coverStyle": "metric-split", "coverTeaserEn": "<1-line <=68 char teaser>", "coverTeaserAr": "<جملة تمهيد عربية>" },
    { "tag": "Mistake Callout", "framework": "Mistake Callout", "score": 85, "selected": false, "enTitle": "<6-to-12 word mistake callout exposing Slide 2 failure mode>", "arTitle": "<Arabic RTL hook calling out Slide 2 mistake>", "enBody": "", "arBody": "", "coverStyle": "visual-teaser", "coverTeaserEn": "<1-line <=68 char teaser>", "coverTeaserAr": "<جملة تمهيد عربية>" },
    { "tag": "Curiosity Gap", "framework": "Curiosity Gap", "score": 84, "selected": false, "enTitle": "<6-to-12 word curiosity question tied directly to Slide 2 mechanism?>", "arTitle": "<Arabic RTL question tied to Slide 2?>", "enBody": "", "arBody": "", "coverStyle": "headline-hero", "coverTeaserEn": "<1-line <=68 char teaser>", "coverTeaserAr": "<جملة تمهيد عربية>" },
    { "tag": "Curiosity Gap", "framework": "Curiosity Gap", "score": 81, "selected": false, "enTitle": "<6-to-12 word secondary curiosity hook bridging Slide 2 to Slide 3>", "arTitle": "<Arabic RTL curiosity hook bridging Slide 2 to Slide 3>", "enBody": "", "arBody": "", "coverStyle": "headline-hero", "coverTeaserEn": "<1-line <=68 char teaser>", "coverTeaserAr": "<جملة تمهيد عربية>" }
  ],
  "selectedHookIndex": 0,
  "slide1": {
    "type": "metric",
    "coverStyle": "metric-split",
    "enTitle": "Primary Slide 1 hook strictly six to twelve words long",
    "arTitle": "عنوان عربي طبيعي مع إبقاء Latency و API بالإنجليزية",
    "enBody": "",
    "arBody": "",
    "coverTeaserEn": "One-line swipe bridge under 68 chars",
    "coverTeaserAr": "جملة تمهيد عربية قصيرة تدفع للسحب",
    "showSwipeCue": true
  },
  "caption": "Bilingual English + Arabic caption with hashtags",
  "brand": "MARROK"
}`;

/**
 * Tier 2 Free Zero-Key AI Fallback via Pollinations OpenAI-compatible endpoint.
 * Used when all configured Gemini API keys hit quota/overload or when no Gemini key is present.
 */
async function generateWithPollinationsFreeBackup(options: {
  userPromptText: string;
  minSlidesRequired: number;
  freeModels: string[];
  getRemainingMs: () => number;
}): Promise<{ data: CarouselData; model: string } | null> {
  const { userPromptText, minSlidesRequired, freeModels, getRemainingMs } = options;

  for (const freeModel of freeModels) {
    const remaining = getRemainingMs();
    if (remaining < 3500) break;
    const timeoutMs = Math.min(FREE_BACKUP_TIMEOUT_MS, remaining - 500);

    try {
      console.info(`[AI-Gateway] Trying zero-key free AI backup model: pollinations/${freeModel}...`);
      const res = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model: freeModel,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `${MARROK_SYSTEM_PROMPT}\n\n${JSON_SCHEMA_COMPACT_GUIDE}`,
            },
            {
              role: 'user',
              content: userPromptText,
            },
          ],
        }),
      });

      if (!res.ok) {
        console.info(`[AI-Gateway] Free backup model pollinations/${freeModel} returned HTTP ${res.status}.`);
        continue;
      }

      const payload = await res.json();
      const rawContent: string =
        payload?.choices?.[0]?.message?.content ||
        (typeof payload === 'string' ? payload : '');

      if (!rawContent) continue;

      const cleaned = rawContent
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');

      const parsed = parseCarouselData(JSON.parse(cleaned), {
        minSlides: minSlidesRequired,
        requireSlideContent: true,
      });

      if (parsed) {
        parsed.facts = mapFactsWithGroundingSupports(parsed.facts, [], []);
        return {
          data: parsed,
          model: `pollinations/${freeModel}`,
        };
      }
    } catch (err: unknown) {
      console.info(
        `[AI-Gateway] Free backup model pollinations/${freeModel} unavailable (${formatModelFallbackReason(err)}); trying next.`
      );
    }
  }

  return null;
}

/**
 * Calls an OpenAI-compatible endpoint (OpenAI, Groq, Ollama, OpenRouter, DeepSeek).
 */
async function generateWithOpenAiCompatibleEndpoint(options: {
  endpoint: string;
  apiKey?: string;
  model: string;
  prompt: string;
  minSlidesRequired: number;
  timeoutMs: number;
}): Promise<CarouselData | null> {
  const { endpoint, apiKey, model, prompt, minSlidesRequired, timeoutMs } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${MARROK_SYSTEM_PROMPT}\n\n${JSON_SCHEMA_COMPACT_GUIDE}`,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!res.ok) return null;
  const payload = await res.json();
  const rawContent = payload?.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== 'string') return null;
  const cleaned = rawContent.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return parseCarouselData(JSON.parse(cleaned), {
    minSlides: minSlidesRequired,
    requireSlideContent: true,
  });
}

/**
 * Calls Anthropic Claude Messages API.
 */
async function generateWithAnthropicEndpoint(options: {
  apiKey: string;
  model: string;
  prompt: string;
  minSlidesRequired: number;
  timeoutMs: number;
}): Promise<CarouselData | null> {
  const { apiKey, model, prompt, minSlidesRequired, timeoutMs } = options;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      temperature: 0.2,
      system: `${MARROK_SYSTEM_PROMPT}\n\n${JSON_SCHEMA_COMPACT_GUIDE}`,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) return null;
  const payload = await res.json();
  const rawContent = payload?.content?.[0]?.text;
  if (!rawContent || typeof rawContent !== 'string') return null;
  const cleaned = rawContent.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return parseCarouselData(JSON.parse(cleaned), {
    minSlides: minSlidesRequired,
    requireSlideContent: true,
  });
}

/**
 * Maps extracted facts to grounded web sources strictly using groundingSupports/groundingChunks.
 * Never cycles through webSources by index (webSources[i % n]).
 * Leaves sourceUrl empty if a fact is not backed by a grounded chunk.
 */
export function mapFactsWithGroundingSupports(
  facts: ExtractedFact[] | undefined,
  webSources: GroundingSource[],
  groundingSupports: GroundingSupportItem[]
): ExtractedFact[] | undefined {
  if (!facts || facts.length === 0) return facts;
  if (webSources.length === 0) {
    // Strip any unverified/hallucinated URLs when no search grounding sources exist
    return facts.map((fact) => ({
      ...fact,
      verified: fact.verified === 'verified' ? 'unconfirmed' : fact.verified,
      sourceUrl: undefined,
      sourceTitle: undefined,
    }));
  }

  const validSourceUrls = new Set(webSources.map((s) => s.url));

  return facts.map((fact) => {
    const factTokens = fact.text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    let matchedSource: GroundingSource | undefined;

    for (const support of groundingSupports) {
      const segText = (support.segment?.text || '').toLowerCase();
      const chunkIdx = support.groundingChunkIndices?.[0];
      if (!segText || chunkIdx === undefined || !webSources[chunkIdx]) continue;

      const overlapCount = factTokens.filter((tok) => segText.includes(tok)).length;
      if (overlapCount >= 2 || (factTokens.length === 1 && overlapCount === 1)) {
        matchedSource = webSources[chunkIdx];
        break;
      }
    }

    if (matchedSource) {
      return {
        ...fact,
        verified: 'verified',
        sourceUrl: matchedSource.url,
        sourceTitle: matchedSource.title,
      };
    }

    // Keep existing sourceUrl only if it exactly matches one of the grounded webSources
    if (fact.sourceUrl && validSourceUrls.has(fact.sourceUrl)) {
      const exact = webSources.find((s) => s.url === fact.sourceUrl);
      return {
        ...fact,
        sourceUrl: exact?.url,
        sourceTitle: exact?.title || fact.sourceTitle,
      };
    }

    return {
      ...fact,
      sourceUrl: undefined,
      sourceTitle: undefined,
    };
  });
}

/**
 * Autonomous Carousel Generation Controller
 * - Multi-account Gemini API key failover rotation (Primary Key -> Backup Key #2 -> Server Key Pool)
 * - Free-tier Gemini model cascade + lightweight JSON fallback
 * - Zero-key Pollinations AI backup before ever touching the local offline synthesizer
 */
export async function handleGenerateCarousel(req: Request, res: Response) {
  const requestStartTime = Date.now();
  const config = getServerConfig();

  const rawPromptParts = [
    typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '',
    typeof req.body?.topic === 'string' ? req.body.topic.trim() : '',
    typeof req.body?.notes === 'string' ? req.body.notes.trim() : '',
  ].filter(Boolean);

  const uniqueParts = Array.from(new Set(rawPromptParts));
  const combinedPrompt = uniqueParts.join('\n\n');

  const { inputMode, imageBase64, imageMimeType, categoryHint, imageName, postFormat: rawFormat } = req.body || {};
  const postFormat: 'carousel' | 'single' = rawFormat === 'single' ? 'single' : 'carousel';
  const minSlidesRequired = postFormat === 'single' ? 1 : 3;
  const customKey =
    (req.headers['x-gemini-key'] as string) ||
    (req.headers['x-gemini-api-key'] as string) ||
    req.body?.apiKey;

  if (!combinedPrompt && !imageBase64) {
    return res.status(400).json({ error: 'Prompt or image is required' });
  }

  // Validate and sanitize parameters
  const safeInputMode =
    typeof inputMode === 'string' && ALLOWED_INPUT_MODES.has(inputMode) ? inputMode : 'text';
  const safeCategoryHint =
    typeof categoryHint === 'string' ? categoryHint.slice(0, 100).replace(/[<>{}]/g, '') : 'auto';
  const safeMimeType =
    typeof imageMimeType === 'string' && ALLOWED_IMAGE_MIMES.has(imageMimeType)
      ? imageMimeType
      : 'image/jpeg';
  const safePrompt = combinedPrompt.slice(0, 50000);
  const safeImageName = typeof imageName === 'string' ? imageName.slice(0, 200) : '';

  let imagePayload: { mimeType: string; base64: string } | null = null;
  if (typeof imageBase64 === 'string' && imageBase64.length > 0) {
    if (/^data:/i.test(imageBase64)) {
      const parsedDataUrl = parseImageDataUrl(imageBase64);
      if (!parsedDataUrl) {
        return res.status(400).json({ error: 'Uploaded image data URL is invalid or exceeds size limit.' });
      }
      imagePayload = { mimeType: parsedDataUrl.mimeType, base64: parsedDataUrl.base64 };
    } else {
      const parsedBase64 = parseRawBase64Image(imageBase64, safeMimeType);
      if (!parsedBase64) {
        return res.status(400).json({ error: 'Uploaded image payload is invalid or exceeds size limit.' });
      }
      imagePayload = parsedBase64;
    }
  }

  const hasImage = Boolean(imagePayload);
  const sufficiency = validateSourceSufficiency({
    prompt: safePrompt,
    imageFileName: safeImageName,
    hasMedia: hasImage,
  });
  if (!sufficiency.isSufficient) {
    return res.status(400).json({
      error: sufficiency.reason,
      code: 'INSUFFICIENT_SOURCE',
      details: sufficiency,
    });
  }
  const isLongInput = safePrompt.length > 200;
  const bypassCache =
    Boolean(req.body?.forceRefresh) ||
    req.headers['x-cache-bypass'] === 'true' ||
    (process.env.VITEST === 'true' && req.body?.enableCache !== true);

  const cacheKey = buildGenerationCacheKey({
    safePrompt,
    safeInputMode,
    safeCategoryHint,
    postFormat,
    imagePayload,
  });

  if (!bypassCache) {
    const cachedHit = getCachedGeneration(cacheKey);
    if (cachedHit) {
      res.setHeader('X-Marrok-Engine', cachedHit.engine);
      if (cachedHit.model) res.setHeader('X-Marrok-Model', cachedHit.model);
      res.setHeader('X-Marrok-Cache', 'HIT');
      return res.json(cachedHit.data);
    }

    const existingInFlight = inFlightGenerations.get(cacheKey);
    if (existingInFlight) {
      try {
        const coalesced = await existingInFlight;
        if (coalesced) {
          res.setHeader('X-Marrok-Engine', coalesced.engine);
          if (coalesced.model) res.setHeader('X-Marrok-Model', coalesced.model);
          res.setHeader('X-Marrok-Cache', 'COALESCED');
          return res.json(structuredClone(coalesced.data));
        }
      } catch {
        // Fall through to normal execution if in-flight promise rejected
      }
    }
  }

  let resolveInFlight: ((val: CachedGenerationEntry | null) => void) | null = null;
  if (!bypassCache) {
    const inFlightPromise = new Promise<CachedGenerationEntry | null>((resolve) => {
      resolveInFlight = resolve;
    });
    inFlightGenerations.set(cacheKey, inFlightPromise);
  }

  const finalizeInFlight = (entry: CachedGenerationEntry | null) => {
    if (!bypassCache) {
      inFlightGenerations.delete(cacheKey);
      resolveInFlight?.(entry);
    }
  };

  const overallAbort = new AbortController();
  const overallTimer = setTimeout(() => overallAbort.abort(new Error('Generation budget exceeded')), TOTAL_REQUEST_BUDGET_MS);

  try {
    const parts: GeminiPart[] = [];

    if (imagePayload) {
      parts.push({
        inlineData: {
          mimeType: imagePayload.mimeType,
          data: imagePayload.base64,
        },
      });
    }

    const userPromptText = buildUserCarouselPrompt({
      rawPrompt: safePrompt,
      safeCategoryHint,
      safeInputMode,
      hasImage,
      imageName: safeImageName,
      postFormat,
    });

    const strategyObj =
      req.body?.strategyContext && typeof req.body.strategyContext === 'object'
        ? req.body.strategyContext
        : null;

    const rawStrategyContext =
      typeof req.body?.strategyContext === 'string'
        ? req.body.strategyContext.slice(0, 3000).trim()
        : strategyObj?.strategyBrief || '';
    const finalPromptText = rawStrategyContext
      ? `${userPromptText}\n${rawStrategyContext}`
      : userPromptText;

    parts.push({ text: finalPromptText });

    const candidateKeys = resolveRequestGeminiKeys(req, config);

    let jsonResult: CarouselData | null = null;
    let successfulModel = '';
    let wasGroundedWithSources = false;
    const attemptedProviders: string[] = [];
    let lastFailureReason =
      candidateKeys.length === 0
        ? 'No Gemini API key configured on server'
        : 'Upstream AI providers did not return a valid carousel';

    const remainingBudgetMs = () => TOTAL_REQUEST_BUDGET_MS - (Date.now() - requestStartTime);

    // Multi-Provider Active Vault Dispatch (Anthropic, OpenAI, Groq, Ollama, Custom)
    const aiVaultSettings = await getDecryptedAiSettings().catch(() => null);
    const requestedProvider = (req.body?.aiProvider || aiVaultSettings?.activeProviderId || 'gemini') as AIProviderId;

    if (requestedProvider !== 'gemini' && aiVaultSettings?.providers?.[requestedProvider]) {
      const pConfig = aiVaultSettings.providers[requestedProvider];
      if (pConfig.enabled || req.body?.aiProvider) {
        const timeoutMs = Math.min(18000, remainingBudgetMs() - 2000);
        try {
          console.info(`[AI-Gateway] Dispatching to active provider: ${requestedProvider}...`);
          if (requestedProvider === 'anthropic' && pConfig.apiKey) {
            const antRes = await generateWithAnthropicEndpoint({
              apiKey: pConfig.apiKey,
              model: pConfig.selectedModel || 'claude-3-7-sonnet-20250219',
              prompt: finalPromptText,
              minSlidesRequired,
              timeoutMs,
            });
            if (antRes) {
              jsonResult = antRes;
              successfulModel = pConfig.selectedModel || 'claude';
              attemptedProviders.push(`anthropic:${successfulModel}`);
            }
          } else if (
            requestedProvider === 'openai' ||
            requestedProvider === 'groq' ||
            requestedProvider === 'ollama' ||
            requestedProvider === 'custom'
          ) {
            let endpoint = 'https://api.openai.com/v1/chat/completions';
            if (requestedProvider === 'groq') endpoint = 'https://api.groq.com/openai/v1/chat/completions';
            else if (pConfig.baseUrl) endpoint = `${pConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`;

            const openRes = await generateWithOpenAiCompatibleEndpoint({
              endpoint,
              apiKey: pConfig.apiKey,
              model: pConfig.selectedModel || (requestedProvider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o'),
              prompt: finalPromptText,
              minSlidesRequired,
              timeoutMs,
            });
            if (openRes) {
              jsonResult = openRes;
              successfulModel = pConfig.selectedModel || requestedProvider;
              attemptedProviders.push(`${requestedProvider}:${successfulModel}`);
            }
          }
        } catch (provErr) {
          console.info(`[AI-Gateway] Active provider ${requestedProvider} failed (${(provErr as Error).message}); cascading to Gemini.`);
        }
      }
    }

    keyLoop: for (const { key, label } of (jsonResult ? [] : candidateKeys)) {
      if (overallAbort.signal.aborted || remainingBudgetMs() < 3000) break;

      const activeAi = createGoogleGenAIClient(key);

      const failedModelsInAttempt = new Set<string>();
      const prioritizedForGrounded = getPrioritizedModels(config.generationModels);
      const primaryModel = prioritizedForGrounded[0] || 'gemini-4-hydrogen';
      let schemaConstraintModel: string | null = null;

      // Attempt 1: Single Grounded Attempt (only for short text prompts without images)
      if (!isLongInput && !hasImage && !overallAbort.signal.aborted && remainingBudgetMs() >= 4500) {
        const timeoutMs = Math.min(GROUNDED_ATTEMPT_TIMEOUT_MS, remainingBudgetMs() - 1000);
        try {
          console.info(
            `[AI-Gateway] Trying grounded attempt on ${primaryModel} (${label})...`
          );

          const response = await activeAi.models.generateContent({
            model: primaryModel,
            contents: { parts },
            config: buildGeminiContentConfig(primaryModel, {
              systemInstruction: MARROK_SYSTEM_PROMPT,
              temperature: 0.2,
              tools: [{ googleSearch: {} }],
              responseMimeType: 'application/json',
              responseSchema: CAROUSEL_RESPONSE_SCHEMA,
              abortSignal: createCombinedDeadlineSignal(overallAbort.signal, timeoutMs),
            }),
          });

          const rawText = response.text;
          if (rawText) {
            const cleanText = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
            const parsed = parseCarouselData(JSON.parse(cleanText), {
              minSlides: minSlidesRequired,
              requireSlideContent: true,
            });

            if (parsed) {
              const groundingMeta = response.candidates?.[0]?.groundingMetadata;
              const searchQueries: string[] = (groundingMeta?.webSearchQueries as string[]) || [];
              const groundingChunks =
                (groundingMeta?.groundingChunks as Array<{ web?: { uri?: string; title?: string } }>) || [];
              const groundingSupports =
                (groundingMeta?.groundingSupports as GroundingSupportItem[]) || [];
              const webSources: GroundingSource[] = [];

              if (Array.isArray(groundingChunks)) {
                for (const chunk of groundingChunks) {
                  if (chunk?.web?.uri) {
                    webSources.push({
                      title: chunk.web.title || chunk.web.uri,
                      url: chunk.web.uri,
                    });
                  }
                }
              }

              parsed.facts = mapFactsWithGroundingSupports(
                parsed.facts,
                webSources,
                groundingSupports
              );

              parsed.sourceMeta = parsed.sourceMeta || {};
              parsed.sourceMeta.isSearchGrounded = webSources.length > 0;
              if (searchQueries.length > 0) parsed.sourceMeta.groundingQueries = searchQueries;
              if (webSources.length > 0) parsed.sourceMeta.groundingSources = webSources;

              wasGroundedWithSources = webSources.length > 0;
              jsonResult = parsed;
              successfulModel = primaryModel;
              modelCooldownUntil.delete(primaryModel);
              break keyLoop;
            }
          }
        } catch (groundingErr: unknown) {
          const errKind = classifyModelError(groundingErr);
          recordModelUnavailable(primaryModel, groundingErr);
          attemptedProviders.push(`${primaryModel}:grounded`);
          lastFailureReason = formatModelFallbackReason(groundingErr, key);
          if (errKind === 'schema_constraint') {
            schemaConstraintModel = primaryModel;
            console.info(
              `[AI-Gateway] Grounded schema on ${primaryModel} (${label}) hit schema complexity limit; switching immediately to fast JSON mode.`
            );
          } else {
            if (errKind !== 'timeout') {
              failedModelsInAttempt.add(primaryModel);
            }
            console.info(
              `[AI-Gateway] Grounded mode on ${primaryModel} (${label}) unavailable (${lastFailureReason}); cascading to direct schema mode.`
            );
          }
        }
      }

      // Attempt 2: Ungrounded Direct Schema Attempt across prioritized fallback models
      const directCandidates = schemaConstraintModel
        ? []
        : getPrioritizedModels(config.generationModels, failedModelsInAttempt);
      for (const model of directCandidates) {
        if (overallAbort.signal.aborted || remainingBudgetMs() < 3000) break;
        const baseTimeout = hasImage ? DIRECT_IMAGE_TIMEOUT_MS : DIRECT_TEXT_TIMEOUT_MS;
        const timeoutMs = Math.min(baseTimeout, remainingBudgetMs() - 500);

        try {
          console.info(
            `[AI-Gateway] Calling direct schema mode on ${model} (${label})...`
          );

          const directResponse = await activeAi.models.generateContent({
            model,
            contents: { parts },
            config: buildGeminiContentConfig(model, {
              systemInstruction: MARROK_SYSTEM_PROMPT,
              temperature: 0.2,
              responseMimeType: 'application/json',
              responseSchema: CAROUSEL_RESPONSE_SCHEMA,
              abortSignal: createCombinedDeadlineSignal(overallAbort.signal, timeoutMs),
            }),
          });

          const directText = directResponse.text;
          if (directText) {
            const cleanText = directText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
            const parsed = parseCarouselData(JSON.parse(cleanText), {
              minSlides: minSlidesRequired,
              requireSlideContent: true,
            });
            if (parsed) {
              parsed.facts = mapFactsWithGroundingSupports(parsed.facts, [], []);
              jsonResult = parsed;
              successfulModel = model;
              wasGroundedWithSources = false;
              modelCooldownUntil.delete(model);
              break keyLoop;
            }
          }
        } catch (directErr: unknown) {
          const errKind = classifyModelError(directErr);
          recordModelUnavailable(model, directErr);
          attemptedProviders.push(`${model}:schema`);
          lastFailureReason = formatModelFallbackReason(directErr, key);
          if (errKind === 'schema_constraint') {
            schemaConstraintModel = model;
            console.info(
              `[AI-Gateway] Direct schema on ${model} (${label}) hit schema complexity limit; switching immediately to fast JSON mode.`
            );
            break;
          }
          failedModelsInAttempt.add(model);
          console.info(
            `[AI-Gateway] Direct mode on ${model} (${label}) unavailable (${lastFailureReason}); trying next fallback.`
          );
        }
      }

      // Attempt 3: Lightweight fast JSON-mode pass without strict responseSchema overhead
      if (!jsonResult && (!hasImage || schemaConstraintModel) && !overallAbort.signal.aborted && remainingBudgetMs() >= 3000) {
        const jsonFallbackModel =
          schemaConstraintModel ||
          config.generationModels.find((m) => m.includes('lite')) ||
          config.generationModels[config.generationModels.length - 1] ||
          'gemini-3.1-flash-lite';
        const timeoutMs = Math.min(hasImage ? DIRECT_IMAGE_TIMEOUT_MS : 10_000, remainingBudgetMs() - 500);
        try {
          console.info(
            `[AI-Gateway] Trying lightweight fast JSON pass on ${jsonFallbackModel} (${label})...`
          );
          const jsonModeContents = hasImage
            ? { parts: [...parts.slice(0, -1), { text: `${userPromptText}\n\n${JSON_SCHEMA_COMPACT_GUIDE}` }] }
            : `${userPromptText}\n\n${JSON_SCHEMA_COMPACT_GUIDE}`;
          const liteResponse = await activeAi.models.generateContent({
            model: jsonFallbackModel,
            contents: jsonModeContents,
            config: buildGeminiContentConfig(jsonFallbackModel, {
              systemInstruction: MARROK_SYSTEM_PROMPT,
              temperature: 0.2,
              responseMimeType: 'application/json',
              abortSignal: createCombinedDeadlineSignal(overallAbort.signal, timeoutMs),
            }),
          });
          const liteText = liteResponse.text;
          if (liteText) {
            const cleanText = liteText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
            const parsed = parseCarouselData(JSON.parse(cleanText), {
              minSlides: minSlidesRequired,
              requireSlideContent: true,
            });
            if (parsed) {
              parsed.facts = mapFactsWithGroundingSupports(parsed.facts, [], []);
              jsonResult = parsed;
              successfulModel = jsonFallbackModel;
              wasGroundedWithSources = false;
              modelCooldownUntil.delete(jsonFallbackModel);
              break keyLoop;
            }
          }
        } catch (liteErr: unknown) {
          attemptedProviders.push(`${jsonFallbackModel}:lite-json`);
          lastFailureReason = formatModelFallbackReason(liteErr, key);
          console.info(
            `[AI-Gateway] Lightweight JSON pass on ${jsonFallbackModel} (${label}) unavailable (${lastFailureReason}).`
          );
        }
      }
    }

    // Tier 2: Zero-Key Free Pollinations AI Backup with bounded auto-retry (before ever going offline)
    if (!jsonResult && !hasImage && config.freeBackupEnabled && remainingBudgetMs() >= 3500) {
      for (let backupPass = 0; backupPass < 2 && !jsonResult && remainingBudgetMs() >= 3500; backupPass++) {
        if (backupPass > 0) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        attemptedProviders.push(backupPass === 0 ? 'backup-ai' : 'backup-ai:retry');
        const freeBackup = await generateWithPollinationsFreeBackup({
          userPromptText,
          minSlidesRequired,
          freeModels: config.freeTextBackupModels,
          getRemainingMs: remainingBudgetMs,
        });
        if (freeBackup) {
          jsonResult = freeBackup.data;
          successfulModel = freeBackup.model;
          wasGroundedWithSources = false;
        }
      }
      if (!jsonResult) {
        lastFailureReason =
          candidateKeys.length === 0
            ? 'No Gemini API key configured and backup AI models were unavailable'
            : `${lastFailureReason}; backup AI retry also unavailable`;
      }
    }

    if (jsonResult) {
      const engineType = wasGroundedWithSources ? 'grounded' : 'ungrounded';
      jsonResult.brand = 'MARROK';
      jsonResult.postFormat = postFormat;
      if (postFormat === 'single') {
        if (jsonResult.slides.length > 1) {
          jsonResult = condenseCarouselToSingleSlide(jsonResult);
        } else if (jsonResult.slides.length === 1) {
          if (!jsonResult.slides[0].takeaways || jsonResult.slides[0].takeaways.length === 0) {
            jsonResult.slides[0].takeaways = seedSingleSlideTakeaways(jsonResult.slides[0], jsonResult.category);
          }
          if (!jsonResult.slides[0].enCredit) {
            jsonResult.slides[0].enCredit = jsonResult.sourceMeta?.creator || jsonResult.brand || 'MARROK';
          }
        }
      }
      jsonResult.sourceMeta = {
        ...jsonResult.sourceMeta,
        isFallback: false,
        isSearchGrounded: wasGroundedWithSources,
        status: wasGroundedWithSources ? 'verified_live' : 'unverified_draft',
        userReviewed: false, // Only explicit user action in UI may mark userReviewed=true
        engine: engineType,
        model: successfulModel,
      };

      jsonResult = applyViralHookTierSelection(jsonResult, safePrompt, {
        preserveValidSlide1: true,
      });
      jsonResult = sanitizeFullCarousel(jsonResult);

      const targetPlatform = req.body?.targetPlatform || strategyObj?.targetPlatform;
      const contentPillar = req.body?.contentPillar || strategyObj?.contentPillar;
      const publicationObjective = req.body?.publicationObjective || strategyObj?.publicationObjective;

      if (targetPlatform) jsonResult.targetPlatform = targetPlatform;
      if (contentPillar) jsonResult.contentPillar = contentPillar;
      if (publicationObjective) jsonResult.publicationObjective = publicationObjective;
      if (rawStrategyContext || strategyObj) jsonResult.strategyBriefUsed = true;
      if (successfulModel) jsonResult.aiModelUsed = successfulModel;
      jsonResult.aiProviderUsed = requestedProvider;

      if (!bypassCache) {
        const stored = storeCachedGeneration(cacheKey, {
          data: jsonResult,
          engine: engineType,
          model: successfulModel,
        });
        finalizeInFlight(stored);
      } else {
        finalizeInFlight(null);
      }

      res.setHeader('X-Marrok-Engine', engineType);
      res.setHeader('X-Marrok-Model', successfulModel);
      return res.json(jsonResult);
    }

    finalizeInFlight(null);

    // Offline Fallback Synthesizer
    console.info('[AI-Gateway] All AI keys & free backup tiers exhausted. Activating MARROK offline synthesizer.');
    const synthesizedData = synthesizeCarousel({
      prompt: safePrompt,
      categoryHint: safeCategoryHint,
      inputMode: safeInputMode,
      imageFileName: safeImageName,
      postFormat,
    });

    synthesizedData.brand = 'MARROK';
    synthesizedData.postFormat = postFormat;
    synthesizedData.sourceMeta = {
      ...synthesizedData.sourceMeta,
      isFallback: true,
      fallbackReason: lastFailureReason,
      attemptedProviders: Array.from(new Set(attemptedProviders)),
      isSearchGrounded: false,
      status: 'unverified_draft',
      userReviewed: false,
      engine: 'offline',
    };

    res.setHeader('X-Marrok-Engine', 'offline');
    res.setHeader('X-Marrok-Fallback-Reason', lastFailureReason.slice(0, 140));
    return res.json(synthesizedData);
  } catch (error: unknown) {
    finalizeInFlight(null);
    const exceptionReason = formatModelFallbackReason(error, customKey);
    console.info(
      '[AI-Gateway] Fallback synthesizer activated due to unexpected controller exception:',
      exceptionReason
    );
    const fallbackData = synthesizeCarousel({
      prompt: safePrompt,
      categoryHint: safeCategoryHint,
      inputMode: safeInputMode,
      imageFileName: safeImageName,
      postFormat,
    });
    fallbackData.brand = 'MARROK';
    fallbackData.postFormat = postFormat;
    fallbackData.sourceMeta = {
      ...fallbackData.sourceMeta,
      isFallback: true,
      fallbackReason: exceptionReason,
      isSearchGrounded: false,
      status: 'unverified_draft',
      userReviewed: false,
      engine: 'offline',
    };
    res.setHeader('X-Marrok-Engine', 'offline');
    res.setHeader('X-Marrok-Fallback-Reason', exceptionReason.slice(0, 140));
    return res.json(fallbackData);
  } finally {
    clearTimeout(overallTimer);
  }
}

const SYNC_AR_SINGLE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    arTitle: { type: Type.STRING },
    coverTeaserAr: { type: Type.STRING },
    arBody: { type: Type.STRING },
    takeawaysAr: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['arTitle'],
};

const SYNC_AR_DECK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER },
          arTitle: { type: Type.STRING },
          coverTeaserAr: { type: Type.STRING },
          arBody: { type: Type.STRING },
        },
        required: ['index', 'arTitle'],
      },
    },
  },
  required: ['slides'],
};

function sanitizeSyncedArabicField(text: unknown, isTitle: boolean, maxChars: number): string {
  if (typeof text !== 'string' || !text.trim()) return '';
  const cleaned = sanitizeArabicSlideText(text.trim(), { isTitle })
    .replace(/[:：]+/g, isTitle ? ' ' : ':')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  const sliced = cleaned.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > Math.floor(maxChars * 0.55) ? sliced.slice(0, lastSpace) : sliced)
    .replace(/[,،;:\-—–]+$/, '')
    .trim();
}

/**
 * Per-Slide Bilingual AI Refinement & Live Sync AR Controller
 * Supports single-slide refinement, strict EN -> AR live translation (`sync_ar` / `arabic_sync`),
 * and batch deck-wide EN -> AR translation (`sync_ar_deck`).
 * Rotates across Gemini keys + models and zero-key Pollinations backup within a single bounded
 * overall AbortSignal deadline so requests never exceed synchronous serverless timeout limits.
 */
export async function handleRefineSlide(req: Request, res: Response) {
  const config = getServerConfig();
  const {
    slide,
    slides: deckSlidesInput,
    mode = 'punchy',
    category = 'SOFTWARE ARCHITECTURE',
    isCover = false,
  } = req.body || {};

  const normalizedMode = String(mode);
  const isDeckSyncMode = normalizedMode === 'sync_ar_deck';
  const isStrictSyncAr = normalizedMode === 'sync_ar' || normalizedMode === 'arabic_sync';

  if (isDeckSyncMode) {
    if (!Array.isArray(deckSlidesInput) || deckSlidesInput.length === 0) {
      return res.status(400).json({ error: 'Slides array is required for sync_ar_deck mode' });
    }
  } else if (!slide || typeof slide !== 'object') {
    return res.status(400).json({ error: 'Slide object is required' });
  }

  const candidateKeys = resolveRequestGeminiKeys(req, config);
  const safeCategory = String(category || 'SOFTWARE ARCHITECTURE').slice(0, 80);

  const requestedBudgetMs = Number(req.body?.budgetMs);
  const totalBudgetMs =
    Number.isFinite(requestedBudgetMs) && requestedBudgetMs >= 500 && requestedBudgetMs <= REFINE_TOTAL_BUDGET_MS
      ? requestedBudgetMs
      : REFINE_TOTAL_BUDGET_MS;
  const deadlineAt = Date.now() + totalBudgetMs;
  const remainingBudgetMs = () => deadlineAt - Date.now();
  const overallAbort = new AbortController();
  const overallTimer = setTimeout(() => overallAbort.abort(new Error('Slide refine deadline exceeded')), totalBudgetMs);

  try {
    // ── BATCH DECK-WIDE LIVE SYNC AR ─────────────────────────────────────────
    if (isDeckSyncMode) {
      const normalizedSlides = (deckSlidesInput as Array<Record<string, unknown>>)
        .slice(0, 12)
        .map((s, idx) => ({
          index: idx,
          enTitle: String(s?.enTitle || '').slice(0, 200).trim(),
          coverTeaserEn: String(s?.coverTeaserEn || '').slice(0, 140).trim(),
          enBody: String(s?.enBody || '').slice(0, 500).trim(),
          existingArTitle: String(s?.arTitle || '').slice(0, 200).trim(),
          existingCoverTeaserAr: String(s?.coverTeaserAr || '').slice(0, 140).trim(),
          existingArBody: String(s?.arBody || '').slice(0, 500).trim(),
        }));

      const deckPrompt = `Translate every slide's English copy for topic "${safeCategory}" into natural, idiomatic Modern Standard Arabic (فصحى معاصرة طبيعية).
STRICT RULES:
1. Faithfully convey the EXACT technical meaning, threat/impact, and open-loop hook of each English field.
2. Keep ALL technical nouns, CVE IDs, product/brand names, protocols, and number+unit pairs in English Latin script (e.g., Java4Shell, CVE-2026-114938, OpenJDK, RCE, CVSS, API, Latency, Cache, Postgres, p99, 15ms, 93.3%).
3. NEVER copy arTitle into coverTeaserAr — if coverTeaserEn is non-empty, coverTeaserAr MUST translate coverTeaserEn independently (<= 68 chars, zero colons, zero emojis).
4. If enBody is empty "", return arBody as "".
5. NEVER end an Arabic line with a Latin word followed by a period; finish with an Arabic word before punctuation.
6. Return ONLY valid JSON matching { "slides": [{ "index": number, "arTitle": string, "coverTeaserAr": string, "arBody": string }] }.

Slides to translate:
${JSON.stringify(
  normalizedSlides.map(({ index, enTitle, coverTeaserEn, enBody }) => ({
    index,
    enTitle,
    coverTeaserEn,
    enBody,
  })),
  null,
  2
)}`;

      const parseDeckSyncPayload = (rawText: string) => {
        const cleanText = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        const parsed = JSON.parse(cleanText);
        if (!parsed || !Array.isArray(parsed.slides) || parsed.slides.length === 0) return null;
        return normalizedSlides.map((src) => {
          const match = parsed.slides.find((item: any) => Number(item?.index) === src.index) || parsed.slides[src.index];
          const isSlide1 = src.index === 0;
          const arTitle = sanitizeSyncedArabicField(match?.arTitle, true, isSlide1 ? 68 : 48) || src.existingArTitle;
          let coverTeaserAr = src.coverTeaserEn
            ? sanitizeSyncedArabicField(match?.coverTeaserAr, true, 68) || src.existingCoverTeaserAr
            : '';
          if (coverTeaserAr && arTitle && coverTeaserAr === arTitle) {
            coverTeaserAr = src.existingCoverTeaserAr && src.existingCoverTeaserAr !== arTitle ? src.existingCoverTeaserAr : coverTeaserAr;
          }
          const arBody = src.enBody
            ? sanitizeSyncedArabicField(match?.arBody, false, 155) || src.existingArBody
            : '';
          return {
            index: src.index,
            enTitle: src.enTitle,
            coverTeaserEn: src.coverTeaserEn,
            enBody: src.enBody,
            arTitle,
            coverTeaserAr,
            arBody,
          };
        });
      };

      for (const { key, label } of candidateKeys) {
        if (overallAbort.signal.aborted || remainingBudgetMs() < 500) break;
        const activeAi = createGoogleGenAIClient(key);
        const refineModels = getPrioritizedModels(config.generationModels);
        for (const model of refineModels) {
          if (overallAbort.signal.aborted || remainingBudgetMs() < 400) break;
          const stepTimeoutMs = Math.min(11_000, Math.max(400, remainingBudgetMs() - 100));
          try {
            const response = await activeAi.models.generateContent({
              model,
              contents: deckPrompt,
              config: buildGeminiContentConfig(model, {
                temperature: 0.2,
                thinkingLevel: ThinkingLevel.LOW,
                responseMimeType: 'application/json',
                responseSchema: SYNC_AR_DECK_SCHEMA,
                abortSignal: createCombinedDeadlineSignal(overallAbort.signal, stepTimeoutMs),
              }),
            });
            const synced = response.text ? parseDeckSyncPayload(response.text) : null;
            if (synced) {
              modelCooldownUntil.delete(model);
              res.setHeader('X-Marrok-Engine', 'ungrounded');
              res.setHeader('X-Marrok-Model', model);
              return res.json({ slides: synced, engine: 'ungrounded', model });
            }
          } catch (err: unknown) {
            recordModelUnavailable(model, err);
            console.info(
              `[AI-Gateway] Deck Sync AR on ${model} (${label}) unavailable (${formatModelFallbackReason(err, key)}); trying next fallback.`
            );
          }
        }
      }

      if (config.freeBackupEnabled && !overallAbort.signal.aborted && remainingBudgetMs() >= 1500) {
        for (const freeModel of config.freeTextBackupModels) {
          if (overallAbort.signal.aborted || remainingBudgetMs() < 1000) break;
          const stepTimeoutMs = Math.min(7_000, Math.max(500, remainingBudgetMs() - 250));
          try {
            const freeRes = await fetch('https://text.pollinations.ai/openai', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: createCombinedDeadlineSignal(overallAbort.signal, stepTimeoutMs),
              body: JSON.stringify({
                model: freeModel,
                temperature: 0.2,
                response_format: { type: 'json_object' },
                messages: [
                  {
                    role: 'system',
                    content:
                      'You are an expert English-to-Arabic technical translator. Keep all Latin technical nouns, CVEs, brand names, and numeric units in English. Return ONLY valid JSON.',
                  },
                  { role: 'user', content: deckPrompt },
                ],
              }),
            });
            if (freeRes.ok) {
              const payload = await freeRes.json();
              const rawContent: string = payload?.choices?.[0]?.message?.content || '';
              const synced = rawContent ? parseDeckSyncPayload(rawContent) : null;
              if (synced) {
                const modelTag = `pollinations/${freeModel}`;
                res.setHeader('X-Marrok-Engine', 'ungrounded');
                res.setHeader('X-Marrok-Model', modelTag);
                return res.json({ slides: synced, engine: 'ungrounded', model: modelTag });
              }
            }
          } catch {
            // continue to next backup model
          }
        }
      }

      res.setHeader('X-Marrok-Engine', 'offline');
      return res.json({
        slides: normalizedSlides.map((s) => ({
          index: s.index,
          enTitle: s.enTitle,
          coverTeaserEn: s.coverTeaserEn,
          enBody: s.enBody,
          arTitle: s.existingArTitle,
          coverTeaserAr: s.existingCoverTeaserAr,
          arBody: s.existingArBody,
        })),
        engine: 'offline',
        error: 'Live AI translation is temporarily unavailable.',
      });
    }

    // ── SINGLE SLIDE REFINE / LIVE SYNC AR ───────────────────────────────────
    const enTitle = String(slide.enTitle || '').slice(0, 200);
    const arTitle = String(slide.arTitle || '').slice(0, 200);
    const enBody = String(slide.enBody || '').slice(0, 500);
    const arBody = String(slide.arBody || '').slice(0, 500);
    const coverTeaserEn = String(slide.coverTeaserEn || '').slice(0, 140);
    const coverTeaserAr = String(slide.coverTeaserAr || '').slice(0, 140);
    const rawTakeaways = Array.isArray(slide.takeaways) ? slide.takeaways.slice(0, 5) : [];
    const takeawaysEn = rawTakeaways.map((t: any) => String(t?.en || '').slice(0, 120));

    const modeInstructions: Record<string, string> = {
      punchy:
        'Make the English and Arabic headlines sharper, contrarian, and high-impact (<= 42 chars). Tighten body copy to crisp engineering mechanisms (<= 135 chars).',
      shorten:
        'Compress English and Arabic titles and body copy for instant mobile glanceability while preserving exact technical numbers and mechanisms.',
      arabic_sync:
        'Translate the English headline, cover teaser, body, and takeaways faithfully into natural Modern Standard Arabic while keeping ALL technical terms, CVE IDs, product names, and number+unit pairs in English Latin script.',
      sync_ar:
        'Translate the English headline, cover teaser, body, and takeaways faithfully into natural Modern Standard Arabic while keeping ALL technical terms, CVE IDs, product names, and number+unit pairs in English Latin script.',
      analogy:
        'Reframe the body explanation using a concrete systems engineering mental model or architectural contrast while staying under 135 characters.',
    };

    const directive = modeInstructions[normalizedMode] || modeInstructions.punchy;
    const isCoverSlide = Boolean(isCover || coverTeaserEn);

    const refinePrompt = isStrictSyncAr
      ? `Translate the English slide copy below for topic "${safeCategory}" into accurate, idiomatic Modern Standard Arabic (فصحى معاصرة طبيعية).
STRICT RULES:
- DO NOT alter the meaning, add unrelated topics (never write SQL/database phrases unless the English is about SQL), or duplicate arTitle into coverTeaserAr.
- Preserve ALL technical nouns, CVE codes, product/company names, protocols, and number+unit pairs in English Latin script (e.g., Java4Shell, CVE-2026-114938, OpenJDK, RCE, CVSS, Sockets, Latency, Cache, API, 15ms, 93.3%).
- arTitle: Natural Arabic translation of enTitle (${isCoverSlide ? 'max 68 chars' : 'max 45 chars'}), zero colons, zero emojis.
- coverTeaserAr: ${coverTeaserEn ? 'Natural Arabic translation of coverTeaserEn (max 68 chars, distinct from arTitle, zero colons, zero emojis).' : 'Return empty string "".'}
- arBody: ${enBody ? 'Natural Arabic translation of enBody (max 150 chars), ending with an Arabic word before the period.' : 'Return empty string "".'}
${takeawaysEn.length > 0 ? `- takeawaysAr: Array of ${takeawaysEn.length} concise Arabic translations matching takeawaysEn in order (max 80 chars each).` : ''}
- Return ONLY valid JSON with keys: arTitle, coverTeaserAr, arBody${takeawaysEn.length > 0 ? ', takeawaysAr' : ''}.

Source English Slide:
enTitle: ${enTitle}
coverTeaserEn: ${coverTeaserEn}
enBody: ${enBody}
${takeawaysEn.length > 0 ? `takeawaysEn: ${JSON.stringify(takeawaysEn)}` : ''}`
      : `Refine this single engineering carousel slide for topic "${safeCategory}".
Directive: ${directive}
Rules:
- enTitle: 2 to 6 words ending with a period (.) or question mark (?), max 45 characters.
- arTitle: Natural Arabic sentence keeping technical nouns & number+unit pairs in English (e.g. Sockets, Latency, Cache, API, 15ms), max 40 characters.
- enBody: Direct technical explanation, max 140 characters.
- arBody: Natural Arabic sentence keeping technical nouns & number+unit pairs in English without translating them, ending with an Arabic word and period, max 150 characters.
- Return ONLY valid JSON with keys: enTitle, arTitle, enBody, arBody.

Current Slide:
enTitle: ${enTitle}
arTitle: ${arTitle}
enBody: ${enBody}
arBody: ${arBody}`;

    const parseSingleResult = (rawText: string) => {
      const cleanText = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const parsed = JSON.parse(cleanText);
      if (!parsed || typeof parsed !== 'object') return null;

      if (isStrictSyncAr) {
        if (typeof parsed.arTitle !== 'string' || !parsed.arTitle.trim()) return null;
        const nextArTitle = sanitizeSyncedArabicField(parsed.arTitle, true, isCoverSlide ? 68 : 48) || arTitle;
        const nextCoverTeaserAr = coverTeaserEn
          ? sanitizeSyncedArabicField(parsed.coverTeaserAr, true, 68) || coverTeaserAr
          : '';
        const nextArBody = enBody ? sanitizeSyncedArabicField(parsed.arBody, false, 155) || arBody : '';
        const nextTakeaways =
          rawTakeaways.length > 0
            ? rawTakeaways.map((t: any, idx: number) => ({
                en: String(t?.en || ''),
                ar:
                  Array.isArray(parsed.takeawaysAr) && typeof parsed.takeawaysAr[idx] === 'string'
                    ? sanitizeSyncedArabicField(parsed.takeawaysAr[idx], false, 84) || String(t?.ar || '')
                    : String(t?.ar || ''),
              }))
            : undefined;
        return {
          enTitle,
          arTitle: nextArTitle,
          enBody,
          arBody: nextArBody,
          ...(coverTeaserEn || coverTeaserAr ? { coverTeaserEn, coverTeaserAr: nextCoverTeaserAr } : {}),
          ...(nextTakeaways ? { takeaways: nextTakeaways } : {}),
        };
      }

      if (typeof parsed.enTitle === 'string' && typeof parsed.enBody === 'string') {
        return {
          enTitle: parsed.enTitle.trim(),
          arTitle: typeof parsed.arTitle === 'string' ? parsed.arTitle.trim() : arTitle,
          enBody: parsed.enBody.trim(),
          arBody: typeof parsed.arBody === 'string' ? parsed.arBody.trim() : arBody,
        };
      }
      return null;
    };

    for (const { key, label } of candidateKeys) {
      if (overallAbort.signal.aborted || remainingBudgetMs() < 350) break;

      const activeAi = createGoogleGenAIClient(key);
      const refineModels = getPrioritizedModels(config.generationModels);
      for (const model of refineModels) {
        if (overallAbort.signal.aborted || remainingBudgetMs() < 300) break;
        const stepTimeoutMs = Math.min(8_500, Math.max(250, remainingBudgetMs() - 100));

        try {
          const response = await activeAi.models.generateContent({
            model,
            contents: refinePrompt,
            config: buildGeminiContentConfig(model, {
              temperature: isStrictSyncAr ? 0.2 : 0.3,
              ...(isStrictSyncAr ? { thinkingLevel: ThinkingLevel.LOW, responseSchema: SYNC_AR_SINGLE_SCHEMA } : {}),
              responseMimeType: 'application/json',
              abortSignal: createCombinedDeadlineSignal(overallAbort.signal, stepTimeoutMs),
            }),
          });

          const rawText = response.text;
          if (rawText) {
            const parsed = parseSingleResult(rawText);
            if (parsed) {
              modelCooldownUntil.delete(model);
              res.setHeader('X-Marrok-Engine', 'ungrounded');
              res.setHeader('X-Marrok-Model', model);
              return res.json({
                ...parsed,
                engine: 'ungrounded',
                model,
              });
            }
          }
        } catch (err: unknown) {
          recordModelUnavailable(model, err);
          console.info(
            `[AI-Gateway] Slide refine on ${model} (${label}) unavailable (${formatModelFallbackReason(err, key)}); trying next fallback.`
          );
        }
      }
    }

    // Zero-Key Pollinations Free Backup for Slide Refine / Sync AR (within remaining deadline)
    if (config.freeBackupEnabled && !overallAbort.signal.aborted && remainingBudgetMs() >= 1500) {
      for (const freeModel of config.freeTextBackupModels) {
        if (overallAbort.signal.aborted || remainingBudgetMs() < 1000) break;
        const stepTimeoutMs = Math.min(6_000, Math.max(500, remainingBudgetMs() - 250));

        try {
          const freeRes = await fetch('https://text.pollinations.ai/openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: createCombinedDeadlineSignal(overallAbort.signal, stepTimeoutMs),
            body: JSON.stringify({
              model: freeModel,
              temperature: isStrictSyncAr ? 0.2 : 0.3,
              response_format: { type: 'json_object' },
              messages: [
                {
                  role: 'system',
                  content: isStrictSyncAr
                    ? 'You are a bilingual English-to-Arabic technical translator. Keep all English technical terms, CVEs, brand names, and numeric units in Latin script. Return ONLY valid JSON.'
                    : 'You are a bilingual English and Modern Standard Arabic systems architecture editor. Return ONLY valid JSON with keys: enTitle, arTitle, enBody, arBody.',
                },
                {
                  role: 'user',
                  content: refinePrompt,
                },
              ],
            }),
          });

          if (freeRes.ok) {
            const payload = await freeRes.json();
            const rawContent: string = payload?.choices?.[0]?.message?.content || '';
            if (rawContent) {
              const parsed = parseSingleResult(rawContent);
              if (parsed) {
                const modelTag = `pollinations/${freeModel}`;
                res.setHeader('X-Marrok-Engine', 'ungrounded');
                res.setHeader('X-Marrok-Model', modelTag);
                return res.json({
                  ...parsed,
                  engine: 'ungrounded',
                  model: modelTag,
                });
              }
            }
          }
        } catch (_err) {
          // continue to next free model
        }
      }
    }

    res.setHeader('X-Marrok-Engine', 'offline');
    return res.json({
      enTitle,
      arTitle,
      enBody,
      arBody,
      ...(coverTeaserEn || coverTeaserAr ? { coverTeaserEn, coverTeaserAr } : {}),
      engine: 'offline',
    });
  } finally {
    clearTimeout(overallTimer);
  }
}

function buildSiblingAwareDeckStub(
  slide: SlideData,
  slideIndex: number,
  totalSlides: number,
  siblingLayouts: string[]
): SlideData[] {
  const safeTotal = Math.max(1, Math.min(20, Math.max(totalSlides, slideIndex + 1)));
  const stub: SlideData[] = [];
  const siblingEntries: Array<{ idx: number; layoutId: string }> = siblingLayouts.map((raw, i) => {
    const colonIdx = raw.indexOf(':');
    if (colonIdx > 0 && /^s?\d+$/i.test(raw.slice(0, colonIdx).trim())) {
      const parsedIdx = Number(raw.slice(0, colonIdx).replace(/\D/g, '')) - 1;
      const layoutId = raw.slice(colonIdx + 1).trim();
      return {
        idx: Number.isFinite(parsedIdx) && parsedIdx >= 0 ? parsedIdx : i,
        layoutId,
      };
    }
    return { idx: i >= slideIndex ? i + 1 : i, layoutId: raw.trim() };
  });

  for (let i = 0; i < safeTotal; i++) {
    if (i === slideIndex) {
      stub.push(slide);
      continue;
    }
    const sib = siblingEntries.find((s) => s.idx === i);
    const desc = sib ? findCatalogDescriptor(sib.layoutId) : undefined;
    if (desc) {
      stub.push({
        type: desc.slideType,
        ...(desc.diagramVariant ? { diagramVariant: desc.diagramVariant } : {}),
        ...(desc.visualKind ? { visualSpec: { kind: desc.visualKind } } : {}),
        enTitle: `Sibling Slide ${i + 1}`,
      });
    } else {
      stub.push({ type: i === safeTotal - 1 ? 'cta' : 'row', enTitle: `Slide ${i + 1}` });
    }
  }
  return stub;
}

function sanitizeDirectedSlideResponse(
  rawParsed: Record<string, unknown>,
  originalSlide: SlideData,
  slideIndex: number,
  totalSlides: number,
  excludeSet: Set<string>
): {
  slideUpdates: Partial<SlideData>;
  chosenLayoutId: string;
  rationale: string;
} | null {
  const rawChoice = typeof rawParsed.chosenLayoutId === 'string' ? rawParsed.chosenLayoutId.trim() : '';
  const desc = findCatalogDescriptor(rawChoice);
  if (!desc) return null;

  if (desc.slideType === 'image' || desc.slideType === 'cta') return null;
  if (totalSlides > 1 && slideIndex === 0 && desc.slideType === 'hub') {
    return null;
  }
  if (excludeSet.has(desc.id)) return null;

  const baseMaterialized = materializeLayoutForSlide(
    originalSlide,
    { ...desc, score: 100, rationale: desc.label },
    slideIndex,
    totalSlides,
    {
      rationalePrefix: 'AI Visual Director',
      lockLayout: false,
      forceRefreshVisuals: true,
    }
  );

  const cleanRationale =
    typeof rawParsed.rationale === 'string' && rawParsed.rationale.trim().length > 4
      ? rawParsed.rationale.trim().slice(0, 140)
      : baseMaterialized.layoutRationale || `AI picked ${desc.label}`;

  const isMultiCover =
    totalSlides > 1 &&
    slideIndex === 0 &&
    !originalSlide.standaloneMeme &&
    originalSlide.imageFrameMode !== 'full';

  const validCoverStyle = (v: unknown): v is CoverStyle =>
    v === 'headline-hero' || v === 'metric-split' || v === 'versus-hook' || v === 'visual-teaser';

  const nextSlide: SlideData = {
    ...baseMaterialized,
    manualLayoutLocked: false,
    layoutRationale: cleanRationale,
  };

  if (isMultiCover) {
    const inferredCoverStyle: CoverStyle = validCoverStyle(rawParsed.coverStyle)
      ? rawParsed.coverStyle
      : desc.slideType === 'metric'
      ? 'metric-split'
      : desc.slideType === 'compare'
      ? 'versus-hook'
      : desc.slideType === 'subjectPair' || desc.slideType === 'row' || desc.slideType === 'code' || (desc.slideType === 'visual' && desc.visualKind !== 'callout')
      ? 'visual-teaser'
      : 'headline-hero';
    const rawEnTeaser =
      typeof rawParsed.coverTeaserEn === 'string' && rawParsed.coverTeaserEn.trim()
        ? sanitizeCoverTeaserText(rawParsed.coverTeaserEn, false)
        : '';
    const rawArTeaser =
      typeof rawParsed.coverTeaserAr === 'string' && rawParsed.coverTeaserAr.trim()
        ? sanitizeCoverTeaserText(rawParsed.coverTeaserAr, true)
        : '';
    const derived = deriveCoverTeaserForSlide({ ...originalSlide, ...nextSlide });
    nextSlide.coverStyle = inferredCoverStyle;
    nextSlide.storyRole = 'hook';
    nextSlide.compositionPreset = 'headline-first';
    nextSlide.showSwipeCue = originalSlide.showSwipeCue ?? true;
    nextSlide.coverTeaserEn = clampCoverTeaser(rawEnTeaser || derived.coverTeaserEn, false, 68);
    nextSlide.coverTeaserAr = clampCoverTeaser(rawArTeaser || derived.coverTeaserAr, true, 68);
    nextSlide.enBody = '';
    nextSlide.arBody = '';
  }

  if (desc.slideType === 'visual' && desc.visualKind) {
    const rawSpec =
      rawParsed.visualSpec && typeof rawParsed.visualSpec === 'object'
        ? (rawParsed.visualSpec as Record<string, unknown>)
        : null;
    if (rawSpec) {
      const nextSpec: SlideVisualSpec = {
        ...(baseMaterialized.visualSpec || { kind: desc.visualKind }),
        ...(typeof rawSpec.eyebrow === 'string' && rawSpec.eyebrow.trim() ? { eyebrow: rawSpec.eyebrow.trim().slice(0, 36) } : {}),
        ...(typeof rawSpec.title === 'string' && rawSpec.title.trim() ? { title: rawSpec.title.trim().slice(0, 64) } : {}),
        ...(typeof rawSpec.footnote === 'string' && rawSpec.footnote.trim() ? { footnote: rawSpec.footnote.trim().slice(0, 96) } : {}),
        kind: desc.visualKind,
      };

      if (desc.visualKind === 'bar-chart') {
        const rawBars = Array.isArray(rawSpec.bars) ? rawSpec.bars : [];
        const validBars = rawBars
          .filter((b): b is Record<string, unknown> => Boolean(b && typeof b === 'object'))
          .map((b) => ({
            label: String(b.label || '').trim().slice(0, 26),
            value: Number(b.value),
            displayValue: typeof b.displayValue === 'string' ? b.displayValue.trim().slice(0, 18) : undefined,
            tone: (b.tone === 'accent' || b.tone === 'muted' || b.tone === 'alert' ? b.tone : 'muted') as
              | 'accent'
              | 'alert'
              | 'muted',
            isWinner: Boolean(b.isWinner),
          }))
          .filter(
            (b) =>
              b.label.length >= 2 &&
              !isGenericPlaceholderValue(b.label) &&
              !isPlaceholderOrEmptyBrandValue(b.label) &&
              Number.isFinite(b.value) &&
              b.value > 0
          )
          .slice(0, 6);

        if (validBars.length < 2) {
          return null;
        }
        nextSpec.bars = validBars;
        if (typeof rawSpec.unit === 'string') nextSpec.unit = rawSpec.unit.trim().slice(0, 16);
        if (typeof rawSpec.deltaBadge === 'string') nextSpec.deltaBadge = rawSpec.deltaBadge.trim().slice(0, 30);
        if (rawSpec.orientation === 'horizontal' || rawSpec.orientation === 'vertical') {
          nextSpec.orientation = rawSpec.orientation;
        }
      } else if (desc.visualKind === 'sequence') {
        const actors = Array.isArray(rawSpec.actors)
          ? rawSpec.actors
              .map((a) => String(a || '').trim().slice(0, 24))
              .filter((a) => a.length >= 2 && !isGenericPlaceholderValue(a))
              .slice(0, 4)
          : [];
        const steps = Array.isArray(rawSpec.steps)
          ? rawSpec.steps
              .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
              .map((s) => ({
                from: Number(s.from),
                to: Number(s.to),
                label: String(s.label || '').trim().slice(0, 40),
                tag: typeof s.tag === 'string' ? s.tag.trim().slice(0, 14) : undefined,
                style:
                  s.style === 'solid' || s.style === 'dashed' || s.style === 'alert'
                    ? (s.style as 'solid' | 'dashed' | 'alert')
                    : ('solid' as const),
              }))
              .filter(
                (s) =>
                  actors.length >= 2 &&
                  Number.isInteger(s.from) &&
                  Number.isInteger(s.to) &&
                  s.from >= 0 &&
                  s.from < actors.length &&
                  s.to >= 0 &&
                  s.to < actors.length &&
                  s.label.length >= 2
              )
              .slice(0, 6)
          : [];
        if (actors.length >= 2 && steps.length >= 2) {
          nextSpec.actors = actors;
          nextSpec.steps = steps;
        }
      } else if (desc.visualKind === 'timeline') {
        const events = Array.isArray(rawSpec.events)
          ? rawSpec.events
              .filter((ev): ev is Record<string, unknown> => Boolean(ev && typeof ev === 'object'))
              .map((ev) => ({
                time: String(ev.time || '').trim().slice(0, 18),
                title: String(ev.title || '').trim().slice(0, 44),
                detail: typeof ev.detail === 'string' ? ev.detail.trim().slice(0, 72) : undefined,
                severity:
                  ev.severity === 'info' ||
                  ev.severity === 'warn' ||
                  ev.severity === 'incident' ||
                  ev.severity === 'resolved'
                    ? (ev.severity as 'info' | 'warn' | 'incident' | 'resolved')
                    : ('info' as const),
              }))
              .filter((ev) => ev.time.length >= 1 && ev.title.length >= 2)
              .slice(0, 5)
          : [];
        if (events.length >= 2) {
          nextSpec.events = events;
        }
      } else if (desc.visualKind === 'matrix') {
        const quadrants = Array.isArray(rawSpec.quadrants)
          ? rawSpec.quadrants
              .filter((q): q is Record<string, unknown> => Boolean(q && typeof q === 'object'))
              .map((q) => ({
                title: String(q.title || '').trim().slice(0, 32),
                detail: typeof q.detail === 'string' ? q.detail.trim().slice(0, 56) : undefined,
                highlight: Boolean(q.highlight),
              }))
              .filter((q) => q.title.length >= 2)
              .slice(0, 4)
          : [];
        if (quadrants.length === 4) {
          nextSpec.quadrants = quadrants;
          if (typeof rawSpec.xAxisLow === 'string') nextSpec.xAxisLow = rawSpec.xAxisLow.trim().slice(0, 24);
          if (typeof rawSpec.xAxisHigh === 'string') nextSpec.xAxisHigh = rawSpec.xAxisHigh.trim().slice(0, 24);
          if (typeof rawSpec.yAxisLow === 'string') nextSpec.yAxisLow = rawSpec.yAxisLow.trim().slice(0, 24);
          if (typeof rawSpec.yAxisHigh === 'string') nextSpec.yAxisHigh = rawSpec.yAxisHigh.trim().slice(0, 24);
        }
      } else if (desc.visualKind === 'table') {
        const columns = Array.isArray(rawSpec.columns)
          ? rawSpec.columns.map((c) => String(c || '').trim().slice(0, 20)).filter(Boolean).slice(0, 4)
          : [];
        const rows = Array.isArray(rawSpec.rows)
          ? rawSpec.rows
              .filter((r): r is unknown[] => Array.isArray(r))
              .map((r) => r.map((cell) => String(cell ?? '').trim().slice(0, 28)).slice(0, columns.length))
              .filter((r) => r.length === columns.length && r.some(Boolean))
              .slice(0, 5)
          : [];
        if (columns.length >= 2 && rows.length >= 2) {
          nextSpec.columns = columns;
          nextSpec.rows = rows;
          if (typeof rawSpec.highlightColumn === 'number' && rawSpec.highlightColumn >= 0 && rawSpec.highlightColumn < columns.length) {
            nextSpec.highlightColumn = rawSpec.highlightColumn;
          }
        }
      } else if (desc.visualKind === 'callout') {
        if (typeof rawSpec.quote === 'string' && rawSpec.quote.trim().length >= 8) {
          nextSpec.quote = rawSpec.quote.trim().slice(0, 180);
        }
        if (rawSpec.calloutStyle === 'quote' || rawSpec.calloutStyle === 'stat') {
          nextSpec.calloutStyle = rawSpec.calloutStyle;
        }
        if (typeof rawSpec.statValue === 'string') nextSpec.statValue = rawSpec.statValue.trim().slice(0, 20);
        if (typeof rawSpec.statLabel === 'string') nextSpec.statLabel = rawSpec.statLabel.trim().slice(0, 52);
        if (typeof rawSpec.author === 'string') nextSpec.author = rawSpec.author.trim().slice(0, 44);
        if (typeof rawSpec.role === 'string') nextSpec.role = rawSpec.role.trim().slice(0, 44);
        if (typeof rawSpec.source === 'string') nextSpec.source = rawSpec.source.trim().slice(0, 64);
        if (typeof rawSpec.evidence === 'string') nextSpec.evidence = rawSpec.evidence.trim().slice(0, 96);
      } else if (desc.visualKind === 'svg') {
        const rawSvg = typeof rawSpec.svgCode === 'string' ? rawSpec.svgCode : '';
        const viewBox = typeof rawSpec.viewBox === 'string' ? rawSpec.viewBox : undefined;
        const sanitized = sanitizeSvgBlueprintMarkup(rawSvg, viewBox);
        if (!sanitized.isValid) {
          return null;
        }
        nextSpec.svgCode = sanitized.svg;
        nextSpec.viewBox = viewBox || '0 0 846 490';
      }

      nextSlide.visualSpec = nextSpec;
    }
  } else if (desc.slideType === 'row' || desc.slideType === 'poster') {
    if (Array.isArray(rawParsed.diagramNodes) && rawParsed.diagramNodes.length >= 3) {
      const cleanNodes: DiagramNode[] = rawParsed.diagramNodes
        .filter((n): n is Record<string, unknown> => Boolean(n && typeof n === 'object'))
        .slice(0, 3)
        .map((n) => ({
          label: String(n.label || '').trim().slice(0, 28),
          sublabel: typeof n.sublabel === 'string' ? n.sublabel.trim().slice(0, 36) : undefined,
          status: typeof n.status === 'string' ? n.status.trim().toUpperCase().slice(0, 14) : undefined,
          icon: typeof n.icon === 'string' ? n.icon.trim().slice(0, 24) : undefined,
        }))
        .filter(
          (n) =>
            n.label.length >= 2 &&
            !isGenericPlaceholderValue(n.label) &&
            !isPlaceholderOrEmptyBrandValue(n.label)
        );
      if (cleanNodes.length === 3) {
        nextSlide.diagramNodes = cleanNodes;
      }
    }
    if (Array.isArray(rawParsed.diagramEdges) && rawParsed.diagramEdges.length >= 2) {
      const cleanEdges = rawParsed.diagramEdges
        .slice(0, 2)
        .map((e) => String(e || '').trim().slice(0, 24))
        .filter((e) => e.length >= 2 && !isGenericPlaceholderValue(e));
      if (cleanEdges.length === 2) {
        nextSlide.diagramEdges = cleanEdges;
      }
    }
    if (typeof rawParsed.diagramFooter === 'string' && rawParsed.diagramFooter.trim().length >= 3) {
      nextSlide.diagramFooter = rawParsed.diagramFooter.trim().slice(0, 64);
    }
  } else if (desc.slideType === 'compare') {
    const leftT = typeof rawParsed.compareLeftTitle === 'string' ? rawParsed.compareLeftTitle.trim() : '';
    const rightT = typeof rawParsed.compareRightTitle === 'string' ? rawParsed.compareRightTitle.trim() : '';
    if (
      leftT.length >= 2 &&
      rightT.length >= 2 &&
      !isPlaceholderOrEmptyBrandValue(leftT) &&
      !isPlaceholderOrEmptyBrandValue(rightT)
    ) {
      nextSlide.compareLeftTitle = leftT.slice(0, 32);
      nextSlide.compareRightTitle = rightT.slice(0, 32);
    }
    if (typeof rawParsed.compareLeftBody === 'string' && rawParsed.compareLeftBody.trim()) {
      nextSlide.compareLeftBody = rawParsed.compareLeftBody.trim().slice(0, 140);
    }
    if (typeof rawParsed.compareRightBody === 'string' && rawParsed.compareRightBody.trim()) {
      nextSlide.compareRightBody = rawParsed.compareRightBody.trim().slice(0, 140);
    }
  } else if (desc.slideType === 'code') {
    if (typeof rawParsed.codeFileName === 'string' && rawParsed.codeFileName.trim() && !isGenericPlaceholderValue(rawParsed.codeFileName)) {
      nextSlide.codeFileName = rawParsed.codeFileName.trim().slice(0, 36);
    }
    if (typeof rawParsed.codeLanguage === 'string' && rawParsed.codeLanguage.trim()) {
      nextSlide.codeLanguage = rawParsed.codeLanguage.trim().slice(0, 18);
    }
    if (typeof rawParsed.codeSnippet === 'string' && rawParsed.codeSnippet.trim().length >= 10) {
      nextSlide.codeSnippet = rawParsed.codeSnippet.trim().slice(0, 380);
    }
  } else if (desc.slideType === 'metric') {
    const mv = typeof rawParsed.metricValue === 'string' ? rawParsed.metricValue.trim() : '';
    const ml = typeof rawParsed.metricLabel === 'string' ? rawParsed.metricLabel.trim() : '';
    if (mv && !isGenericPlaceholderValue(mv)) {
      nextSlide.metricValue = mv.slice(0, 20);
    }
    if (ml && !isGenericPlaceholderValue(ml) && !isPlaceholderOrEmptyBrandValue(ml)) {
      nextSlide.metricLabel = ml.toUpperCase().slice(0, 36);
    }
    if (typeof rawParsed.metricBeforeValue === 'string' && rawParsed.metricBeforeValue.trim()) {
      nextSlide.metricBeforeValue = rawParsed.metricBeforeValue.trim().slice(0, 20);
    }
    if (typeof rawParsed.metricDiff === 'string' && rawParsed.metricDiff.trim()) {
      nextSlide.metricDiff = rawParsed.metricDiff.trim().slice(0, 36);
    }
  } else if (desc.slideType === 'number') {
    if (typeof rawParsed.stepNumber === 'string' && rawParsed.stepNumber.trim()) {
      nextSlide.stepNumber = rawParsed.stepNumber.trim().slice(0, 6);
    }
    if (typeof rawParsed.stepLabel === 'string' && rawParsed.stepLabel.trim()) {
      nextSlide.stepLabel = rawParsed.stepLabel.trim().toUpperCase().slice(0, 32);
    }
  } else if (desc.slideType === 'hub') {
    if (typeof rawParsed.centerTag === 'string' && rawParsed.centerTag.trim()) {
      nextSlide.centerTag = rawParsed.centerTag.trim().toUpperCase().slice(0, 24);
    }
    if (Array.isArray(rawParsed.satLabels)) {
      const cleanSats = rawParsed.satLabels
        .map((s) => String(s || '').trim().slice(0, 22))
        .filter((s) => s.length >= 2 && !isGenericPlaceholderValue(s) && !isPlaceholderOrEmptyBrandValue(s))
        .slice(0, 5);
      if (cleanSats.length >= 3) {
        nextSlide.satLabels = cleanSats;
      }
    }
  }

  return {
    slideUpdates: nextSlide,
    chosenLayoutId: getSlideCatalogId(nextSlide, desc.diagramVariant),
    rationale: cleanRationale,
  };
}

/**
 * On-Demand AI Visual Director Endpoint (`POST /api/direct-visual`).
 * Invoked when the user clicks "Re-imagine" on a slide in the Visual tab.
 */
export async function handleDirectVisual(req: Request, res: Response) {
  const config = getServerConfig();
  const body = (req.body || {}) as Record<string, unknown>;
  const rawSlide = body.slide as SlideData | undefined;
  if (!rawSlide || typeof rawSlide !== 'object') {
    return res.status(400).json({ error: 'Slide object is required' });
  }

  const slideIndex = Number.isFinite(Number(body.slideIndex)) ? Math.max(0, Number(body.slideIndex)) : 0;
  const totalSlides = Number.isFinite(Number(body.totalSlides)) ? Math.max(1, Number(body.totalSlides)) : 8;
  const category = typeof body.category === 'string' ? body.category.slice(0, 80) : 'SOFTWARE ARCHITECTURE';
  const postFormat: PostFormat =
    body.postFormat === 'single' || body.postFormat === 'meme' || body.postFormat === 'reel'
      ? body.postFormat
      : 'carousel';

  const siblingLayouts = Array.isArray(body.siblingLayouts)
    ? body.siblingLayouts.map((s) => String(s || '').slice(0, 48)).filter(Boolean).slice(0, 12)
    : [];
  const excludeLayouts = Array.isArray(body.excludeLayouts)
    ? body.excludeLayouts.map((s) => String(s || '').slice(0, 48)).filter(Boolean).slice(0, 16)
    : [];
  const excludeSet = new Set(excludeLayouts);

  const deckStub = buildSiblingAwareDeckStub(rawSlide, slideIndex, totalSlides, siblingLayouts);
  const candidateKeys = resolveRequestGeminiKeys(req, config);

  const enTitle = String(rawSlide.enTitle || '').slice(0, 200);
  const arTitle = String(rawSlide.arTitle || '').slice(0, 200);
  const coverTeaserEn = String(rawSlide.coverTeaserEn || '').slice(0, 160);
  const coverTeaserAr = String(rawSlide.coverTeaserAr || '').slice(0, 180);
  const enBody = String(rawSlide.enBody || '').slice(0, 500);
  const arBody = String(rawSlide.arBody || '').slice(0, 500);
  const isMultiCoverRequest =
    totalSlides > 1 &&
    slideIndex === 0 &&
    postFormat === 'carousel' &&
    !rawSlide.standaloneMeme &&
    rawSlide.imageFrameMode !== 'full';

  const directorPrompt = `You are the MARROK AI Visual Director. Analyze this single slide and design its clearest, highest-impact technical visual layout WITHOUT repeating sibling layouts or previously tried layouts.

Context:
- Topic Category: ${category}
- Post Format: ${postFormat}
- Slide Position: Slide ${slideIndex + 1} of ${totalSlides}
- Current Slide Layout: ${getSlideCatalogId(rawSlide)}
- Sibling Slide Layouts in Deck (avoid repeating neighbors): ${siblingLayouts.join(', ') || 'None'}
- Layouts ALREADY tried for this slide (MUST pick a DIFFERENT layout ID unless none remain): ${excludeLayouts.join(', ') || 'None'}

Slide Copy:
- enTitle: ${enTitle}
- arTitle: ${arTitle}
${coverTeaserEn ? `- coverTeaserEn: ${coverTeaserEn}\n` : ''}${coverTeaserAr ? `- coverTeaserAr: ${coverTeaserAr}\n` : ''}- enBody: ${enBody}
- arBody: ${arBody}

Strict Visual Rules:
1. Choose ONE layout ID for chosenLayoutId from the allowed catalog enum.
   - ${isMultiCoverRequest ? 'Slide 1 Cover Hero Rule: NEVER choose "hub". Also select coverStyle ("headline-hero", "metric-split" ONLY with real numbers, "versus-hook", or "visual-teaser") and refine single-line coverTeaserEn / coverTeaserAr (<= 68 chars, zero colons/emojis).' : 'Pick a visual pattern genuinely complementary to sibling slides.'}
   - NEVER invent fake numbers! Do NOT pick "visual:bar-chart" or numeric "metric" unless real numbers exist in the slide copy.
   - NEVER emit placeholder strings ("System A", "System B", "Client Ingress", "Execution Core", "Metric 1", "Current Path").
   - When copy describes protocols/handshakes, prefer "visual:sequence"; outage/postmortem timestamps -> "visual:timeline"; 2x2 axes -> "visual:matrix"; multi-row benchmark comparison -> "visual:table"; attributed report/quote -> "visual:callout"; state machine/ring/hierarchy -> "visual:svg" (valid SVG viewBox="0 0 846 490" with safe tags and {{accent}}/{{alert}}/{{surface}}/{{surfaceBorder}}/{{textWhite}}/{{textMuted}}/{{baseBg}} tokens).
2. Populate ONLY the payload fields matching chosenLayoutId cleanly, plus a 1-sentence "rationale" (< 100 chars).`;

  const requestedBudgetMs = Number(body.budgetMs);
  const totalBudgetMs =
    Number.isFinite(requestedBudgetMs) && requestedBudgetMs >= 400 && requestedBudgetMs <= REFINE_TOTAL_BUDGET_MS
      ? requestedBudgetMs
      : 16_000;
  const deadlineAt = Date.now() + totalBudgetMs;
  const remainingBudgetMs = () => deadlineAt - Date.now();
  const overallAbort = new AbortController();
  const overallTimer = setTimeout(
    () => overallAbort.abort(new Error('Visual director deadline exceeded')),
    totalBudgetMs
  );

  try {
    for (const { key, label } of candidateKeys) {
      if (overallAbort.signal.aborted || remainingBudgetMs() < 350) break;
      const activeAi = createGoogleGenAIClient(key);
      const directModels = getPrioritizedModels(config.generationModels);

      for (const model of directModels) {
        if (overallAbort.signal.aborted || remainingBudgetMs() < 300) break;
        const stepTimeoutMs = Math.min(10_000, Math.max(300, remainingBudgetMs() - 100));

        try {
          const response = await activeAi.models.generateContent({
            model,
            contents: directorPrompt,
            config: buildGeminiContentConfig(model, {
              temperature: 0.25,
              responseMimeType: 'application/json',
              responseSchema: DIRECT_VISUAL_RESPONSE_SCHEMA,
              abortSignal: createCombinedDeadlineSignal(overallAbort.signal, stepTimeoutMs),
            }),
          });

          const rawText = response.text;
          if (!rawText) continue;
          const cleanText = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          const parsed = JSON.parse(cleanText) as Record<string, unknown>;
          const sanitized = sanitizeDirectedSlideResponse(
            parsed,
            rawSlide,
            slideIndex,
            totalSlides,
            excludeSet
          );
          if (sanitized) {
            modelCooldownUntil.delete(model);
            res.setHeader('X-Marrok-Engine', 'ungrounded');
            res.setHeader('X-Marrok-Model', model);
            return res.json({
              ...sanitized,
              engine: 'ungrounded',
              model,
            });
          }
        } catch (err: unknown) {
          recordModelUnavailable(model, err);
          console.info(
            `[AI-Gateway] Direct visual on ${model} (${label}) unavailable (${formatModelFallbackReason(err, key)}); trying fallback.`
          );
        }
      }
    }

    // Graceful deterministic deck-aware fallback (respects excludeLayouts & sibling diversity)
    const ranked = rankSlideLayoutsForDeck(rawSlide, deckStub, slideIndex, {
      postFormat,
      excludeIds: excludeLayouts,
    });
    const fallbackCandidate =
      ranked.find((c) => !excludeSet.has(c.id) && c.slideType !== 'image' && c.slideType !== 'cta') ||
      ranked.find((c) => c.slideType !== 'image' && c.slideType !== 'cta') ||
      ranked[0];

    const fallbackSlide = materializeLayoutForSlide(
      rawSlide,
      fallbackCandidate,
      slideIndex,
      totalSlides,
      {
        rationalePrefix: 'Re-imagined',
        lockLayout: false,
        forceRefreshVisuals: true,
      }
    );

    if (isMultiCoverRequest) {
      const derived = deriveCoverTeaserForSlide(fallbackSlide, deckStub);
      fallbackSlide.coverStyle = fallbackSlide.coverStyle || resolveSlide1CoverStyle(fallbackSlide, deckStub);
      fallbackSlide.storyRole = 'hook';
      fallbackSlide.compositionPreset = 'headline-first';
      fallbackSlide.showSwipeCue = rawSlide.showSwipeCue ?? true;
      fallbackSlide.coverTeaserEn = clampCoverTeaser(fallbackSlide.coverTeaserEn || derived.coverTeaserEn, false, 68);
      fallbackSlide.coverTeaserAr = clampCoverTeaser(fallbackSlide.coverTeaserAr || derived.coverTeaserAr, true, 68);
      fallbackSlide.enBody = '';
      fallbackSlide.arBody = '';
    }

    res.setHeader('X-Marrok-Engine', 'offline');
    res.setHeader('X-Marrok-Model', 'deck-aware-engine');
    return res.json({
      slideUpdates: fallbackSlide,
      chosenLayoutId: fallbackCandidate.id,
      rationale: fallbackSlide.layoutRationale || `Re-imagined ${fallbackCandidate.label}`,
      engine: 'offline',
      model: 'deck-aware-engine',
    });
  } finally {
    clearTimeout(overallTimer);
  }
}

