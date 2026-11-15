import type { Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { sanitizeLogText } from '../constants.ts';
import { getServerConfig, resolveRequestGeminiKeys } from '../config.ts';
import { decorateImagePrompt } from '../prompts/systemPrompt.ts';
import { parseImageDataUrl } from '../../src/lib/validation/image.ts';
import { createCombinedDeadlineSignal } from './generateController.ts';

const VALID_ASPECT_RATIOS = new Set(['9:16', '16:9', '1:1', '4:3', '3:4']);
const TOTAL_IMAGE_BUDGET_MS = 23_000;
const IMAGE_MODEL_TIMEOUT_MS = 18_000;
const FREE_IMAGE_BACKUP_TIMEOUT_MS = 12_000;
const MAX_EDIT_BASE64_CHARS = 3_800_000; // ~2.8 MB raw binary to stay safely under 4.5 MB payload limit

const ASPECT_RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '3:4': { width: 1080, height: 1440 },
};

/**
 * Zero-key free 9:16 image generation fallback via Pollinations Flux.
 * Converts the returned binary image into a validated base64 data URL so canvas rendering and ZIP export work without CORS issues.
 */
async function generateImageWithPollinationsFreeBackup(
  decoratedPrompt: string,
  aspectRatio: string,
  parentSignal?: AbortSignal,
  remainingMs: number = FREE_IMAGE_BACKUP_TIMEOUT_MS
): Promise<{ dataUrl: string; model: string } | null> {
  if (parentSignal?.aborted || remainingMs < 2000) return null;
  const dims = ASPECT_RATIO_DIMENSIONS[aspectRatio] || ASPECT_RATIO_DIMENSIONS['9:16'];
  const compactPrompt = decoratedPrompt.slice(0, 900);
  const seed = Math.floor(1000 + Math.random() * 900000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(compactPrompt)}?width=${dims.width}&height=${dims.height}&model=flux&nologo=true&seed=${seed}`;
  const timeoutMs = Math.min(FREE_IMAGE_BACKUP_TIMEOUT_MS, Math.max(1500, remainingMs - 300));

  try {
    console.info(
      `[Image-Gateway] Trying zero-key free 9:16 image backup (pollinations/flux, ${dims.width}x${dims.height})...`
    );
    const res = await fetch(url, {
      method: 'GET',
      signal: createCombinedDeadlineSignal(parentSignal, timeoutMs),
    });

    if (!res.ok) {
      console.info(`[Image-Gateway] Pollinations image backup returned HTTP ${res.status}.`);
      return null;
    }

    const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
    const mimeType =
      contentType === 'image/png' || contentType === 'image/webp' || contentType === 'image/gif'
        ? contentType
        : 'image/jpeg';

    const arrayBuffer = await res.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength < 256) {
      return null;
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const parsedImage = parseImageDataUrl(`data:${mimeType};base64,${base64}`);
    if (!parsedImage) {
      return null;
    }

    return {
      dataUrl: parsedImage.dataUrl,
      model: 'pollinations-flux-free',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.info(`[Image-Gateway] Pollinations image backup unavailable (${msg.slice(0, 100)}).`);
    return null;
  }
}

/**
 * AI Image Generation & Editing endpoint powered by multi-key Gemini image models
 * with automatic failover to zero-key 9:16 Pollinations Flux within a 23s sync budget.
 */
export async function handleGenerateImage(req: Request, res: Response) {
  const {
    prompt,
    baseImageBase64,
    aspectRatio = '9:16',
    imageSize = '1K',
    stylePreset = 'blueprint',
    themeAccent,
    themeBg,
    themeSurface,
  } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return res.status(400).json({ error: 'Prompt is required for image generation or editing.' });
  }

  const serverConfig = getServerConfig();
  const customKey =
    (req.headers['x-gemini-key'] as string) ||
    (req.headers['x-gemini-api-key'] as string) ||
    req.body?.apiKey;

  if (!customKey && serverConfig.apiSharedSecret) {
    const providedSecret = req.headers['x-api-secret'] as string | undefined;
    if (providedSecret !== serverConfig.apiSharedSecret) {
      return res.status(401).json({
        error: 'Server API key requires valid x-api-secret or a client-provided Gemini API key.',
      });
    }
  }

  const safeAspectRatio = VALID_ASPECT_RATIOS.has(aspectRatio) ? aspectRatio : '9:16';
  const safeImageSize = imageSize === '2K' ? '2K' : '1K';
  const safePrompt = prompt.trim().slice(0, 4000);

  let editImage: ReturnType<typeof parseImageDataUrl> = null;
  if (typeof baseImageBase64 === 'string' && baseImageBase64.length > 0) {
    if (baseImageBase64.length > MAX_EDIT_BASE64_CHARS) {
      return res.status(413).json({
        error: 'Image edit payload exceeds serverless 4.5 MB function limit. Please use an image under 2.5 MB.',
      });
    }
    editImage = parseImageDataUrl(baseImageBase64);
    if (!editImage) {
      return res.status(400).json({
        error: 'Image editing requires a valid PNG, JPEG, WEBP, or GIF data URL within the size limit.',
      });
    }
  }

  const candidateKeys = resolveRequestGeminiKeys(req, serverConfig);

  // Image-to-image editing requires a Gemini API key (or if free backup is explicitly disabled)
  if (candidateKeys.length === 0 && (editImage || !serverConfig.freeBackupEnabled)) {
    return res.status(401).json({ error: 'Gemini API key is required for image generation.' });
  }

  // Apply technical style decorator and theme hex colors
  const decoratedPrompt = decorateImagePrompt(safePrompt, {
    stylePreset,
    themeAccent,
    themeBg,
    themeSurface,
  });

  const candidateModels = serverConfig.imageModels;
  let lastError: unknown = null;

  const deadlineAt = Date.now() + TOTAL_IMAGE_BUDGET_MS;
  const remainingBudgetMs = () => deadlineAt - Date.now();
  const overallAbort = new AbortController();
  const overallTimer = setTimeout(
    () => overallAbort.abort(new Error('Image generation budget exceeded')),
    TOTAL_IMAGE_BUDGET_MS
  );

  try {
    for (const { key, label } of candidateKeys) {
      if (overallAbort.signal.aborted || remainingBudgetMs() < 2500) break;

      const activeAi = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      for (const model of candidateModels) {
        if (overallAbort.signal.aborted || remainingBudgetMs() < 2000) break;
        const stepTimeoutMs = Math.min(IMAGE_MODEL_TIMEOUT_MS, Math.max(1000, remainingBudgetMs() - 400));

        try {
          console.log(
            `Generating/editing image using model: ${model} (${label}, aspectRatio: ${safeAspectRatio})...`
          );

          const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

          // If a data URL was provided, this is an image-to-image edit operation
          if (editImage) {
            parts.push({
              inlineData: {
                data: editImage.base64,
                mimeType: editImage.mimeType,
              },
            });
            parts.push({
              text: `Edit instruction for the provided image: ${decoratedPrompt}. Maintain high visual quality and technical clarity.`,
            });
          } else {
            parts.push({ text: decoratedPrompt });
          }

          const abortSignal = createCombinedDeadlineSignal(overallAbort.signal, stepTimeoutMs);
          const response = await activeAi.models.generateContent({
            model,
            contents: { parts },
            config: {
              imageConfig: {
                aspectRatio: safeAspectRatio,
                imageSize: safeImageSize,
              },
              abortSignal,
            },
          });

          // Scan candidate parts for the generated image
          const candidateParts = response.candidates?.[0]?.content?.parts || [];
          for (const part of candidateParts) {
            if (part.inlineData?.data) {
              const parsedImage = parseImageDataUrl(
                `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
              );
              if (!parsedImage) {
                console.warn(`Image model ${model} returned an invalid or oversized image payload.`);
                continue;
              }
              return res.json({
                imageUrl: parsedImage.dataUrl,
                prompt: decoratedPrompt,
                model,
                aspectRatio: safeAspectRatio,
              });
            }
          }
        } catch (modelErr: unknown) {
          lastError = modelErr;
          const msg = modelErr instanceof Error ? modelErr.message : String(modelErr);
          const cleanNotice = sanitizeLogText(msg, key).replace(/[{}"]/g, '').slice(0, 120);
          console.info(`Image model ${model} (${label}) unavailable (${cleanNotice}); trying next fallback.`);
        }
      }
    }

    // Tier 2: Zero-key 9:16 Pollinations Flux image backup (for text-to-image requests)
    if (!editImage && serverConfig.freeBackupEnabled && !overallAbort.signal.aborted && remainingBudgetMs() >= 2500) {
      const freeBackupImage = await generateImageWithPollinationsFreeBackup(
        decoratedPrompt,
        safeAspectRatio,
        overallAbort.signal,
        remainingBudgetMs()
      );
      if (freeBackupImage) {
        return res.json({
          imageUrl: freeBackupImage.dataUrl,
          prompt: decoratedPrompt,
          model: freeBackupImage.model,
          aspectRatio: safeAspectRatio,
        });
      }
    }

    if (lastError) {
      const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
      const cleanDetails = sanitizeLogText(errMsg, customKey).replace(/[{}"]/g, '').slice(0, 200);
      console.info('Image generation models unavailable:', cleanDetails);
      return res.status(500).json({
        error: 'Failed to generate image',
        details: cleanDetails,
      });
    }

    return res.status(500).json({ error: 'No image data returned from generation models.' });
  } finally {
    clearTimeout(overallTimer);
  }
}


