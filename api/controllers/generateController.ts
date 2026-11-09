import type { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import type { CarouselData, ExtractedFact, GroundingSource } from '../../src/types.ts';
import { synthesizeCarousel } from '../../src/lib/synthesizer.ts';
import { condenseCarouselToSingleSlide, seedSingleSlideTakeaways } from '../../src/lib/synthesis/index.ts';
import { sanitizeFullCarousel } from '../../src/lib/textSanitizer.ts';
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
} from '../prompts/systemPrompt.ts';
import { parseCarouselData } from '../../src/lib/validation/carousel.ts';
import { parseImageDataUrl, parseRawBase64Image } from '../../src/lib/validation/image.ts';

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

interface GroundingSupportItem {
  segment?: { text?: string };
  groundingChunkIndices?: number[];
}

const TOTAL_REQUEST_BUDGET_MS = 45_000;
const GROUNDED_ATTEMPT_TIMEOUT_MS = 12_000;
const DIRECT_TEXT_TIMEOUT_MS = 16_000;
const DIRECT_IMAGE_TIMEOUT_MS = 28_000;
const FREE_BACKUP_TIMEOUT_MS = 11_000;

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
    data: JSON.parse(JSON.stringify(existing.data)) as CarouselData,
  };
}

function storeCachedGeneration(key: string, entry: Omit<CachedGenerationEntry, 'expiresAt'>): CachedGenerationEntry {
  const fullEntry: CachedGenerationEntry = {
    data: JSON.parse(JSON.stringify(entry.data)) as CarouselData,
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

function classifyModelError(err: unknown): 'overload' | 'not_found' | 'timeout' | 'other' {
  const raw = err instanceof Error ? err.message : String(err);
  const upper = raw.toUpperCase();
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
  const raw = err instanceof Error ? err.message : String(err);
  const sanitized = sanitizeLogText(raw, key)
    .replace(/[{}"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized.slice(0, 90) || 'transient generation notice';
}

const JSON_SCHEMA_COMPACT_GUIDE = `
CRITICAL JSON OUTPUT FORMAT:
Return ONLY a valid raw JSON object (no markdown fences, no commentary) with this exact structure:
{
  "brand": "MARROK",
  "category": "SYSTEM ARCHITECTURE",
  "theme": "teal",
  "caption": "Bilingual English + Arabic caption with hashtags",
  "hookVariants": [
    { "tag": "CONTRARIAN", "enTitle": "Short title.", "arTitle": "عنوان قصير." }
  ],
  "facts": [
    { "text": "Key engineering fact", "verified": "unconfirmed" }
  ],
  "slides": [
    {
      "type": "hub",
      "enTitle": "Headline under 45 chars.",
      "arTitle": "عنوان تقني مختصر.",
      "enBody": "Concise mechanism explanation under 140 chars.",
      "arBody": "شرح تقني دقيق ومختصر باللغة العربية.",
      "icon": "cpu",
      "satellites": [
        { "label": "Node A", "arLabel": "عقدة أ", "sub": "Subtext", "icon": "server" },
        { "label": "Node B", "arLabel": "عقدة ب", "sub": "Subtext", "icon": "shield" },
        { "label": "Node C", "arLabel": "عقدة ج", "sub": "Subtext", "icon": "zap" },
        { "label": "Node D", "arLabel": "عقدة د", "sub": "Subtext", "icon": "lock" }
      ],
      "diagramVariant": "topology",
      "diagramNodes": [
        { "id": "n1", "label": "Ingress", "sublabel": "mTLS", "icon": "globe" },
        { "id": "n2", "label": "Runtime", "sublabel": "Isolate", "icon": "cpu" },
        { "id": "n3", "label": "Storage", "sublabel": "WAL", "icon": "database" }
      ]
    }
  ]
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
          return res.json(JSON.parse(JSON.stringify(coalesced.data)));
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
    parts.push({ text: userPromptText });

    const candidateKeys = resolveRequestGeminiKeys(req, config);

    let jsonResult: CarouselData | null = null;
    let successfulModel = '';
    let wasGroundedWithSources = false;

    const remainingBudgetMs = () => TOTAL_REQUEST_BUDGET_MS - (Date.now() - requestStartTime);

    keyLoop: for (const { key, label } of candidateKeys) {
      if (remainingBudgetMs() < 4000) break;

      const activeAi = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const failedModelsInAttempt = new Set<string>();
      const prioritizedForGrounded = getPrioritizedModels(config.generationModels);
      const primaryModel = prioritizedForGrounded[0] || 'gemini-3.8-flash';

      // Attempt 1: Single Grounded Attempt (only for short text prompts without images)
      if (!isLongInput && !hasImage && remainingBudgetMs() >= 6000) {
        const timeoutMs = Math.min(GROUNDED_ATTEMPT_TIMEOUT_MS, remainingBudgetMs() - 1000);
        try {
          console.info(
            `[AI-Gateway] Trying grounded attempt on ${primaryModel} (${label})...`
          );

          const response = await activeAi.models.generateContent({
            model: primaryModel,
            contents: { parts },
            config: {
              systemInstruction: MARROK_SYSTEM_PROMPT,
              temperature: 0.2,
              tools: [{ googleSearch: {} }],
              responseMimeType: 'application/json',
              responseSchema: CAROUSEL_RESPONSE_SCHEMA,
              abortSignal: AbortSignal.timeout(timeoutMs),
            },
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
          recordModelUnavailable(primaryModel, groundingErr);
          if (classifyModelError(groundingErr) !== 'timeout') {
            failedModelsInAttempt.add(primaryModel);
          }
          console.info(
            `[AI-Gateway] Grounded mode on ${primaryModel} (${label}) unavailable (${formatModelFallbackReason(groundingErr, key)}); cascading to direct schema mode.`
          );
        }
      }

      // Attempt 2: Ungrounded Direct Schema Attempt across prioritized fallback models
      const directCandidates = getPrioritizedModels(config.generationModels, failedModelsInAttempt);
      for (const model of directCandidates) {
        if (remainingBudgetMs() < 4000) break;
        const baseTimeout = hasImage ? DIRECT_IMAGE_TIMEOUT_MS : DIRECT_TEXT_TIMEOUT_MS;
        const timeoutMs = Math.min(baseTimeout, remainingBudgetMs() - 500);

        try {
          console.info(
            `[AI-Gateway] Calling direct schema mode on ${model} (${label})...`
          );

          const directResponse = await activeAi.models.generateContent({
            model,
            contents: { parts },
            config: {
              systemInstruction: MARROK_SYSTEM_PROMPT,
              temperature: 0.2,
              responseMimeType: 'application/json',
              responseSchema: CAROUSEL_RESPONSE_SCHEMA,
              abortSignal: AbortSignal.timeout(timeoutMs),
            },
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
          recordModelUnavailable(model, directErr);
          failedModelsInAttempt.add(model);
          console.info(
            `[AI-Gateway] Direct mode on ${model} (${label}) unavailable (${formatModelFallbackReason(directErr, key)}); trying next fallback.`
          );
        }
      }

      // Attempt 3: Lightweight fast JSON-mode pass without strict responseSchema overhead on Lite/Flash
      if (!jsonResult && !hasImage && remainingBudgetMs() >= 4000) {
        const liteModel =
          config.generationModels.find((m) => m.includes('lite')) ||
          config.generationModels[config.generationModels.length - 1] ||
          'gemini-3.1-flash-lite';
        const timeoutMs = Math.min(9_000, remainingBudgetMs() - 500);
        try {
          console.info(
            `[AI-Gateway] Trying lightweight fast JSON pass on ${liteModel} (${label})...`
          );
          const liteResponse = await activeAi.models.generateContent({
            model: liteModel,
            contents: `${userPromptText}\n\n${JSON_SCHEMA_COMPACT_GUIDE}`,
            config: {
              systemInstruction: MARROK_SYSTEM_PROMPT,
              temperature: 0.2,
              responseMimeType: 'application/json',
              abortSignal: AbortSignal.timeout(timeoutMs),
            },
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
              successfulModel = liteModel;
              wasGroundedWithSources = false;
              modelCooldownUntil.delete(liteModel);
              break keyLoop;
            }
          }
        } catch (liteErr: unknown) {
          console.info(
            `[AI-Gateway] Lightweight JSON pass on ${liteModel} (${label}) unavailable (${formatModelFallbackReason(liteErr, key)}).`
          );
        }
      }
    }

    // Tier 2: Zero-Key Free Pollinations AI Backup (before ever going offline)
    if (!jsonResult && !hasImage && config.freeBackupEnabled && remainingBudgetMs() >= 3500) {
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

      jsonResult = sanitizeFullCarousel(jsonResult);

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
      isSearchGrounded: false,
      status: 'unverified_draft',
      userReviewed: false,
      engine: 'offline',
    };

    res.setHeader('X-Marrok-Engine', 'offline');
    return res.json(synthesizedData);
  } catch (error: unknown) {
    finalizeInFlight(null);
    console.info(
      '[AI-Gateway] Fallback synthesizer activated due to unexpected controller exception:',
      formatModelFallbackReason(error, customKey)
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
      isSearchGrounded: false,
      status: 'unverified_draft',
      userReviewed: false,
      engine: 'offline',
    };
    res.setHeader('X-Marrok-Engine', 'offline');
    return res.json(fallbackData);
  }
}

/**
 * Per-Slide Bilingual AI Refinement Controller
 * Rotates across all available Gemini keys + models, then zero-key Pollinations AI before offline fallback.
 */
export async function handleRefineSlide(req: Request, res: Response) {
  const config = getServerConfig();
  const { slide, mode = 'punchy', category = 'SOFTWARE ARCHITECTURE' } = req.body || {};
  if (!slide || typeof slide !== 'object') {
    return res.status(400).json({ error: 'Slide object is required' });
  }

  const candidateKeys = resolveRequestGeminiKeys(req, config);

  const enTitle = String(slide.enTitle || '').slice(0, 200);
  const arTitle = String(slide.arTitle || '').slice(0, 200);
  const enBody = String(slide.enBody || '').slice(0, 500);
  const arBody = String(slide.arBody || '').slice(0, 500);

  const modeInstructions: Record<string, string> = {
    punchy:
      'Make the English and Arabic headlines sharper, contrarian, and high-impact (<= 42 chars). Tighten body copy to crisp engineering mechanisms (<= 135 chars).',
    shorten:
      'Compress English and Arabic titles and body copy for instant mobile glanceability while preserving exact technical numbers and mechanisms.',
    arabic_sync:
      'Keep the English headline and body accurate, and produce a natural, authoritative Modern Standard Arabic technical translation with proper BiDi terminology.',
    analogy:
      'Reframe the body explanation using a concrete systems engineering mental model or architectural contrast while staying under 135 characters.',
  };

  const directive = modeInstructions[String(mode)] || modeInstructions.punchy;
  const refinePrompt = `Refine this single engineering carousel slide for topic "${String(category).slice(0, 80)}".
Directive: ${directive}
Rules:
- enTitle: 2 to 6 words ending with a period (.) or question mark (?), max 45 characters.
- arTitle: Natural Arabic technical headline ending with . or ؟, max 40 characters.
- enBody: Direct technical explanation, max 140 characters.
- arBody: Natural Arabic technical explanation ending with an Arabic word and period, max 150 characters.
- Return ONLY valid JSON with keys: enTitle, arTitle, enBody, arBody.

Current Slide:
enTitle: ${enTitle}
arTitle: ${arTitle}
enBody: ${enBody}
arBody: ${arBody}`;

  for (const { key, label } of candidateKeys) {
    const activeAi = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const refineModels = getPrioritizedModels(config.generationModels);
    for (const model of refineModels) {
      try {
        const response = await activeAi.models.generateContent({
          model,
          contents: refinePrompt,
          config: {
            temperature: 0.3,
            responseMimeType: 'application/json',
            abortSignal: AbortSignal.timeout(12_000),
          },
        });

        const rawText = response.text;
        if (rawText) {
          const cleanText = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          const parsed = JSON.parse(cleanText);
          if (parsed && typeof parsed.enTitle === 'string' && typeof parsed.enBody === 'string') {
            modelCooldownUntil.delete(model);
            res.setHeader('X-Marrok-Engine', 'ungrounded');
            res.setHeader('X-Marrok-Model', model);
            return res.json({
              enTitle: parsed.enTitle.trim(),
              arTitle: typeof parsed.arTitle === 'string' ? parsed.arTitle.trim() : arTitle,
              enBody: parsed.enBody.trim(),
              arBody: typeof parsed.arBody === 'string' ? parsed.arBody.trim() : arBody,
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

  // Zero-Key Pollinations Free Backup for Slide Refine
  if (config.freeBackupEnabled) {
    for (const freeModel of config.freeTextBackupModels) {
      try {
        const freeRes = await fetch('https://text.pollinations.ai/openai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(9_000),
          body: JSON.stringify({
            model: freeModel,
            temperature: 0.3,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: 'You are a bilingual English and Modern Standard Arabic systems architecture editor. Return ONLY valid JSON with keys: enTitle, arTitle, enBody, arBody.',
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
            const cleanText = rawContent.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
            const parsed = JSON.parse(cleanText);
            if (parsed && typeof parsed.enTitle === 'string' && typeof parsed.enBody === 'string') {
              const modelTag = `pollinations/${freeModel}`;
              res.setHeader('X-Marrok-Engine', 'ungrounded');
              res.setHeader('X-Marrok-Model', modelTag);
              return res.json({
                enTitle: parsed.enTitle.trim(),
                arTitle: typeof parsed.arTitle === 'string' ? parsed.arTitle.trim() : arTitle,
                enBody: parsed.enBody.trim(),
                arBody: typeof parsed.arBody === 'string' ? parsed.arBody.trim() : arBody,
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
    engine: 'offline',
  });
}
