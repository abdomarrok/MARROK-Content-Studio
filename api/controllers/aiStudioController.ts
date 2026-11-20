import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Type } from '@google/genai';
import { getServerConfig, resolveRequestGeminiKeys } from '../config.ts';
import { getPostgresPool, loadAiSettingsFromDb, saveAiSettingsToDb } from '../db/postgres.ts';
import { buildGeminiContentConfig, createGoogleGenAIClient } from './generateController.ts';
import type {
  AIProviderId,
  AISettingsState,
  ContentPillarId,
  PublicationObjective,
  TargetPlatform,
} from '../../src/types.ts';
import {
  buildLocalStrategyBrief,
} from '../../src/lib/strategy/strategyPromptDecorator.ts';
import {
  CONTENT_PILLARS,
  detectContentPillar,
  getPlatformGuidance,
  getRelevantInsights,
} from '../../src/lib/strategy/strategyConfig.ts';

const LOCAL_FALLBACK_DIR = path.resolve(process.cwd(), '.data');
const LOCAL_SETTINGS_FILE = path.resolve(LOCAL_FALLBACK_DIR, 'ai_settings.json');

/**
 * Derives a 32-byte AES key from SESSION_SECRET.
 */
function getDerivedEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET || 'marrok-default-insecure-secret-key-32b';
  return crypto.scryptSync(secret, 'marrok_ai_vault_salt', 32);
}

/**
 * Encrypts sensitive text using AES-256-GCM.
 */
export function encryptVaultSecret(plaintext: string): string {
  if (!plaintext) return '';
  const key = getDerivedEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts text previously encrypted with encryptVaultSecret.
 */
export function decryptVaultSecret(encryptedPayload: string): string {
  if (!encryptedPayload) return '';
  try {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) return '';
    const [ivHex, authTagHex, cipherHex] = parts;
    const key = getDerivedEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    return decipher.update(Buffer.from(cipherHex, 'hex'), undefined, 'utf8') + decipher.final('utf8');
  } catch {
    return '';
  }
}

/**
 * Masks an API key for safe client display (never leaks full key).
 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••••••';
  const prefix = trimmed.slice(0, 6);
  const suffix = trimmed.slice(-4);
  return `${prefix}${'•'.repeat(Math.min(16, trimmed.length - 10))}${suffix}`;
}

export function isMaskedKey(key: string): boolean {
  return typeof key === 'string' && key.includes('•');
}

export const DEFAULT_AI_SETTINGS: AISettingsState = {
  activeProviderId: 'gemini',
  fallbackEnabled: true,
  freeBackupEnabled: true,
  providers: {
    gemini: {
      providerId: 'gemini',
      name: 'Google Gemini',
      enabled: true,
      apiKey: '',
      backupApiKey: '',
      selectedModel: 'gemini-4-hydrogen',
      availableModels: [
        'gemini-4-hydrogen',
        'gemini-3.1-flash-lite',
        'gemini-3.5-flash-lite',
      ],
    },
    anthropic: {
      providerId: 'anthropic',
      name: 'Anthropic Claude',
      enabled: Boolean(process.env.ANTHROPIC_API_KEY),
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      selectedModel: 'claude-3-7-sonnet-20250219',
      availableModels: [
        'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
      ],
    },
    openai: {
      providerId: 'openai',
      name: 'OpenAI',
      enabled: Boolean(process.env.OPENAI_API_KEY),
      apiKey: process.env.OPENAI_API_KEY || '',
      selectedModel: 'gpt-4o',
      availableModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
    },
    groq: {
      providerId: 'groq',
      name: 'Groq Cloud',
      enabled: Boolean(process.env.GROQ_API_KEY),
      apiKey: process.env.GROQ_API_KEY || '',
      selectedModel: 'llama-3.3-70b-versatile',
      availableModels: [
        'llama-3.3-70b-versatile',
        'deepseek-r1-distill-llama-70b',
        'mixtral-8x7b-32768',
      ],
    },
    ollama: {
      providerId: 'ollama',
      name: 'Ollama / Local LLM',
      enabled: false,
      baseUrl: 'http://localhost:11434/v1',
      selectedModel: 'llama3',
      availableModels: ['llama3', 'qwen2.5-coder', 'mistral', 'deepseek-r1'],
      isCustomEndpoint: true,
    },
    custom: {
      providerId: 'custom',
      name: 'Custom OpenAI-Compatible',
      enabled: Boolean(process.env.OPENROUTER_API_KEY || process.env.CUSTOM_AI_API_KEY),
      baseUrl: process.env.CUSTOM_AI_BASE_URL || 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY || process.env.CUSTOM_AI_API_KEY || '',
      selectedModel: 'deepseek/deepseek-chat',
      availableModels: [
        'deepseek/deepseek-chat',
        'anthropic/claude-3.5-haiku',
        'meta-llama/llama-3.3-70b-instruct',
      ],
      isCustomEndpoint: true,
    },
  },
};

interface StoredRawSettings {
  activeProviderId: AIProviderId;
  fallbackEnabled: boolean;
  freeBackupEnabled: boolean;
  providers: Record<
    AIProviderId,
    {
      providerId: AIProviderId;
      name: string;
      enabled: boolean;
      encryptedApiKey?: string;
      encryptedBackupApiKey?: string;
      baseUrl?: string;
      selectedModel?: string;
      availableModels: string[];
      isCustomEndpoint?: boolean;
      lastTestedAt?: string;
      lastTestLatencyMs?: number;
      lastTestStatus?: 'ok' | 'error';
      lastTestError?: string;
    }
  >;
}

/**
 * Loads raw encrypted settings from PostgreSQL or local disk.
 */
export async function loadRawVaultSettings(): Promise<StoredRawSettings> {
  const pool = getPostgresPool();
  if (pool) {
    try {
      const dbSettings = await Promise.race([
        loadAiSettingsFromDb(pool, 'global'),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Postgres load timeout (1500ms)')), 1500)
        ),
      ]);
      if (dbSettings && typeof dbSettings === 'object') {
        return dbSettings as unknown as StoredRawSettings;
      }
    } catch (err) {
      console.warn('[AI-Vault] Postgres load failed, trying local fallback:', (err as Error).message);
    }
  }

  try {
    if (fs.existsSync(LOCAL_SETTINGS_FILE)) {
      const raw = fs.readFileSync(LOCAL_SETTINGS_FILE, 'utf8');
      return JSON.parse(raw) as StoredRawSettings;
    }
  } catch {
    // Return default settings
  }

  // Build default raw settings
  const rawDefault: StoredRawSettings = {
    activeProviderId: DEFAULT_AI_SETTINGS.activeProviderId,
    fallbackEnabled: DEFAULT_AI_SETTINGS.fallbackEnabled,
    freeBackupEnabled: DEFAULT_AI_SETTINGS.freeBackupEnabled,
    providers: {} as StoredRawSettings['providers'],
  };

  for (const [id, prov] of Object.entries(DEFAULT_AI_SETTINGS.providers)) {
    rawDefault.providers[id as AIProviderId] = {
      ...prov,
      encryptedApiKey: undefined,
      encryptedBackupApiKey: undefined,
    };
  }

  return rawDefault;
}

/**
 * Saves raw encrypted settings to PostgreSQL or local disk.
 */
export async function saveRawVaultSettings(settings: StoredRawSettings): Promise<void> {
  const pool = getPostgresPool();
  if (pool) {
    try {
      await Promise.race([
        saveAiSettingsToDb(pool, settings as unknown as Record<string, unknown>, 'global'),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Postgres save timeout (1500ms)')), 1500)
        ),
      ]);
      return;
    } catch (err) {
      console.warn('[AI-Vault] Postgres save failed, writing to disk fallback:', (err as Error).message);
    }
  }

  try {
    if (!fs.existsSync(LOCAL_FALLBACK_DIR)) {
      fs.mkdirSync(LOCAL_FALLBACK_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('[AI-Vault] Failed to save local settings fallback:', err);
  }
}

/**
 * Returns decrypted active settings for server-side generation dispatch.
 */
export async function getDecryptedAiSettings(): Promise<{
  activeProviderId: AIProviderId;
  fallbackEnabled: boolean;
  freeBackupEnabled: boolean;
  providers: Record<
    AIProviderId,
    {
      providerId: AIProviderId;
      name: string;
      enabled: boolean;
      apiKey: string;
      backupApiKey?: string;
      baseUrl?: string;
      selectedModel?: string;
    }
  >;
}> {
  const raw = await loadRawVaultSettings();
  const decrypted: Record<AIProviderId, any> = {} as any;

  for (const [id, p] of Object.entries(raw.providers || {})) {
    decrypted[id as AIProviderId] = {
      providerId: p.providerId,
      name: p.name,
      enabled: p.enabled,
      apiKey: p.encryptedApiKey ? decryptVaultSecret(p.encryptedApiKey) : '',
      backupApiKey: p.encryptedBackupApiKey ? decryptVaultSecret(p.encryptedBackupApiKey) : undefined,
      baseUrl: p.baseUrl,
      selectedModel: p.selectedModel,
    };
  }

  return {
    activeProviderId: raw.activeProviderId || 'gemini',
    fallbackEnabled: raw.fallbackEnabled ?? true,
    freeBackupEnabled: raw.freeBackupEnabled ?? true,
    providers: decrypted,
  };
}

/**
 * Sanitizes and masks raw vault settings for safe frontend consumption.
 */
export function sanitizeSettingsForClient(raw: StoredRawSettings): AISettingsState {
  const cleanProviders: Record<AIProviderId, any> = {} as any;

  for (const [id, prov] of Object.entries(raw.providers || {})) {
    const rawKey = prov.encryptedApiKey ? decryptVaultSecret(prov.encryptedApiKey) : '';
    const rawBackup = prov.encryptedBackupApiKey ? decryptVaultSecret(prov.encryptedBackupApiKey) : '';

    cleanProviders[id as AIProviderId] = {
      providerId: prov.providerId,
      name: prov.name,
      enabled: Boolean(prov.enabled),
      apiKey: maskApiKey(rawKey),
      backupApiKey: maskApiKey(rawBackup),
      baseUrl: prov.baseUrl || '',
      selectedModel: prov.selectedModel || '',
      availableModels: prov.availableModels || [],
      isCustomEndpoint: Boolean(prov.isCustomEndpoint),
      lastTestedAt: prov.lastTestedAt,
      lastTestLatencyMs: prov.lastTestLatencyMs,
      lastTestStatus: prov.lastTestStatus,
      lastTestError: prov.lastTestError,
    };
  }

  return {
    activeProviderId: raw.activeProviderId || 'gemini',
    fallbackEnabled: raw.fallbackEnabled ?? true,
    freeBackupEnabled: raw.freeBackupEnabled ?? true,
    providers: cleanProviders,
  };
}

/**
 * GET /api/ai-settings (and bare alias /ai-settings)
 */
export async function handleGetAiSettings(_req: Request, res: Response) {
  try {
    const raw = await loadRawVaultSettings();
    const clientSettings = sanitizeSettingsForClient(raw);
    return res.json(clientSettings);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to retrieve AI settings' });
  }
}

/**
 * POST /api/ai-settings (and bare alias /ai-settings)
 */
export async function handleSaveAiSettings(req: Request, res: Response) {
  try {
    const incoming = req.body as Partial<AISettingsState>;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ error: 'Invalid settings payload' });
    }

    const currentRaw = await loadRawVaultSettings();

    if (incoming.activeProviderId) {
      currentRaw.activeProviderId = incoming.activeProviderId;
    }
    if (typeof incoming.fallbackEnabled === 'boolean') {
      currentRaw.fallbackEnabled = incoming.fallbackEnabled;
    }
    if (typeof incoming.freeBackupEnabled === 'boolean') {
      currentRaw.freeBackupEnabled = incoming.freeBackupEnabled;
    }

    if (incoming.providers && typeof incoming.providers === 'object') {
      for (const [pId, pUpdate] of Object.entries(incoming.providers)) {
        const id = pId as AIProviderId;
        const existing = currentRaw.providers[id] || {
          providerId: id,
          name: pUpdate.name || id,
          enabled: false,
          availableModels: [],
        };

        if (typeof pUpdate.enabled === 'boolean') existing.enabled = pUpdate.enabled;
        if (pUpdate.selectedModel) existing.selectedModel = pUpdate.selectedModel;
        if (pUpdate.baseUrl !== undefined) existing.baseUrl = pUpdate.baseUrl;

        // If a new key is provided (and not already masked with bullets), encrypt and store
        if (typeof pUpdate.apiKey === 'string') {
          const trimmed = pUpdate.apiKey.trim();
          if (trimmed === '') {
            existing.encryptedApiKey = undefined;
          } else if (!isMaskedKey(trimmed)) {
            existing.encryptedApiKey = encryptVaultSecret(trimmed);
          }
        }

        if (typeof pUpdate.backupApiKey === 'string') {
          const trimmed = pUpdate.backupApiKey.trim();
          if (trimmed === '') {
            existing.encryptedBackupApiKey = undefined;
          } else if (!isMaskedKey(trimmed)) {
            existing.encryptedBackupApiKey = encryptVaultSecret(trimmed);
          }
        }

        currentRaw.providers[id] = existing;
      }
    }

    await saveRawVaultSettings(currentRaw);
    const clientSettings = sanitizeSettingsForClient(currentRaw);
    return res.json({ ok: true, settings: clientSettings });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save AI settings' });
  }
}

/**
 * POST /api/ai-settings/test (and bare alias /ai-settings/test)
 * Performs a minimal 1-token connection ping to verify credentials and report latency.
 */
export async function handleTestConnection(req: Request, res: Response) {
  const { providerId, apiKey, baseUrl, selectedModel } = req.body || {};
  if (!providerId) {
    return res.status(400).json({ error: 'providerId is required' });
  }

  // Resolve API key: use provided key if unmasked, otherwise fetch from vault
  let effectiveKey = typeof apiKey === 'string' && !isMaskedKey(apiKey) ? apiKey.trim() : '';
  if (!effectiveKey) {
    const raw = await loadRawVaultSettings();
    const stored = raw.providers[providerId as AIProviderId]?.encryptedApiKey;
    if (stored) {
      effectiveKey = decryptVaultSecret(stored);
    }
  }

  const startTime = Date.now();

  try {
    if (providerId === 'gemini') {
      const testKey = effectiveKey || process.env.GEMINI_API_KEY || '';
      if (!testKey) {
        return res.status(400).json({ ok: false, error: 'No Gemini API key configured.' });
      }
      const client = createGoogleGenAIClient(testKey);
      const model = selectedModel || 'gemini-3.1-flash-lite';
      await client.models.generateContent({
        model,
        contents: { parts: [{ text: 'PING' }] },
        config: { maxOutputTokens: 1, abortSignal: AbortSignal.timeout(6000) } as any,
      });
      const latencyMs = Date.now() - startTime;
      return res.json({ ok: true, latencyMs, provider: 'gemini', model });
    }

    if (providerId === 'anthropic') {
      if (!effectiveKey) {
        return res.status(400).json({ ok: false, error: 'No Anthropic API key provided.' });
      }
      const model = selectedModel || 'claude-3-5-haiku-20241022';
      const antRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': effectiveKey,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(6000),
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'PING' }],
        }),
      });
      const latencyMs = Date.now() - startTime;
      if (!antRes.ok) {
        const errText = await antRes.text();
        return res.json({ ok: false, error: `Anthropic HTTP ${antRes.status}: ${errText.slice(0, 120)}`, latencyMs });
      }
      return res.json({ ok: true, latencyMs, provider: 'anthropic', model });
    }

    if (providerId === 'openai' || providerId === 'groq' || providerId === 'ollama' || providerId === 'custom') {
      let endpoint = 'https://api.openai.com/v1/chat/completions';
      let defaultModel = 'gpt-4o-mini';

      if (providerId === 'groq') {
        endpoint = 'https://api.groq.com/openai/v1/chat/completions';
        defaultModel = 'llama-3.3-70b-versatile';
      } else if (providerId === 'ollama') {
        const base = (baseUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
        endpoint = `${base}/chat/completions`;
        defaultModel = selectedModel || 'llama3';
      } else if (providerId === 'custom') {
        const base = (baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
        endpoint = `${base}/chat/completions`;
        defaultModel = selectedModel || 'deepseek/deepseek-chat';
      }

      const model = selectedModel || defaultModel;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (effectiveKey) {
        headers['Authorization'] = `Bearer ${effectiveKey}`;
      }

      const openRes = await fetch(endpoint, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'PING' }],
        }),
      });

      const latencyMs = Date.now() - startTime;
      if (!openRes.ok) {
        const errText = await openRes.text();
        let errMsg = `${providerId} HTTP ${openRes.status}`;
        try {
          const parsed = JSON.parse(errText);
          if (parsed?.error?.message) {
            errMsg = `${providerId}: ${parsed.error.message}`;
          }
        } catch {
          errMsg = `${providerId} HTTP ${openRes.status}: ${errText.slice(0, 150)}`;
        }
        return res.json({ ok: false, error: errMsg, latencyMs });
      }

      return res.json({ ok: true, latencyMs, provider: providerId, model });
    }

    return res.status(400).json({ ok: false, error: `Unknown provider: ${providerId}` });
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    return res.json({
      ok: false,
      error: (err as Error).message.slice(0, 150) || 'Connection timeout',
      latencyMs,
    });
  }
}

/**
 * Strategy Brief Schema for gemini-3.1-flash-lite
 */
const STRATEGY_BRIEF_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    platformFormatGuidance: { type: Type.STRING },
    toneDirection: { type: Type.STRING },
    hookStrategy: { type: Type.STRING },
    ctaSuggestion: { type: Type.STRING },
    relevantBenchmarks: { type: Type.STRING },
    scheduleRecommendation: { type: Type.STRING },
    qualityChecks: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    contentWarnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: [
    'platformFormatGuidance',
    'toneDirection',
    'hookStrategy',
    'ctaSuggestion',
    'relevantBenchmarks',
    'scheduleRecommendation',
    'qualityChecks',
  ],
};

const STRATEGY_BRIEF_SYSTEM_PROMPT = `You are Marrok Content Studio's strategic director. Given a topic, target platform, content pillar, and objective, produce a focused JSON strategy brief.
Strictly enforce:
1. Technical accuracy: Ground guidance in verified engineering terminology.
2. Platform awareness: TikTok requires aggressive 2-second hooks and single-concept clarity; Instagram requires educational depth and save-worthy carousels; LinkedIn requires architectural trade-offs and B2B engineering credibility; Facebook requires accessible dev explainers.
3. Authentic CTA: Generate a polarizing technical question, NEVER generic clichés like "What do you think?".
4. Return ONLY valid JSON matching the schema.`;

/**
 * POST /api/strategy-brief (and bare alias /strategy-brief)
 * Two-step generation step 1: Produces an actionable strategy brief before carousel synthesis.
 */
export async function handleStrategyBrief(req: Request, res: Response) {
  const {
    topic,
    prompt,
    platform,
    targetPlatform,
    pillar,
    contentPillar,
    objective,
    publicationObjective,
  } = req.body || {};

  const rawTopic = typeof topic === 'string' && topic.trim() ? topic : typeof prompt === 'string' ? prompt : '';
  const safeTopic = rawTopic.slice(0, 1000).trim();

  const rawPlatform = platform || targetPlatform;
  const rawPillar = pillar || contentPillar;
  const rawObjective = objective || publicationObjective;

  const safePlatform: TargetPlatform =
    rawPlatform === 'instagram' || rawPlatform === 'tiktok' || rawPlatform === 'linkedin' || rawPlatform === 'facebook'
      ? rawPlatform
      : 'all';

  const safePillar: ContentPillarId =
    rawPillar && CONTENT_PILLARS[rawPillar as ContentPillarId]
      ? (rawPillar as ContentPillarId)
      : detectContentPillar(safeTopic);

  const safeObjective: PublicationObjective =
    rawObjective === 'engagement' || rawObjective === 'education' || rawObjective === 'authority'
      ? rawObjective
      : 'discovery';

  // Fallback brief ready immediately if AI fails
  const localBrief = buildLocalStrategyBrief({
    topic: safeTopic,
    platform: safePlatform,
    pillar: safePillar,
    objective: safeObjective,
  });

  const config = getServerConfig();
  const candidateKeys = resolveRequestGeminiKeys(req, config);

  if (candidateKeys.length === 0) {
    return res.json(localBrief);
  }

  const primaryKey = candidateKeys[0].key;
  const client = createGoogleGenAIClient(primaryKey);
  const model = 'gemini-3.1-flash-lite';

  try {
    const userPrompt = `Topic: "${safeTopic}"
Target Platform: ${safePlatform}
Strategic Pillar: ${safePillar} (${CONTENT_PILLARS[safePillar].label})
Objective: ${safeObjective}
Historical Benchmarks: ${getRelevantInsights(safePillar, safePlatform)}
Default Slot: ${getPlatformGuidance(safePlatform).defaultSlotDZ}

Produce a strategic brief with:
- platformFormatGuidance: concise format recommendations
- toneDirection: authentic tone rules for this domain
- hookStrategy: opening hook angle
- ctaSuggestion: polarizing closing technical question
- relevantBenchmarks: reference to historical performance data
- scheduleRecommendation: suggested Algeria (DZ) posting window
- qualityChecks: 2 domain verification checks
- contentWarnings: 1-2 risk reminders`;

    const aiRes = await client.models.generateContent({
      model,
      contents: { parts: [{ text: userPrompt }] },
      config: buildGeminiContentConfig(model, {
        systemInstruction: STRATEGY_BRIEF_SYSTEM_PROMPT,
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: STRATEGY_BRIEF_SCHEMA,
        abortSignal: AbortSignal.timeout(6000),
      }) as any,
    });

    const raw = aiRes.text?.trim();
    if (raw) {
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const parsed = JSON.parse(clean);
      return res.json({
        platform: safePlatform,
        pillar: safePillar,
        objective: safeObjective,
        platformFormatGuidance: parsed.platformFormatGuidance || localBrief.platformFormatGuidance,
        toneDirection: parsed.toneDirection || localBrief.toneDirection,
        hookStrategy: parsed.hookStrategy || localBrief.hookStrategy,
        ctaSuggestion: parsed.ctaSuggestion || localBrief.ctaSuggestion,
        relevantBenchmarks: parsed.relevantBenchmarks || localBrief.relevantBenchmarks,
        scheduleRecommendation: parsed.scheduleRecommendation || localBrief.scheduleRecommendation,
        qualityChecks: Array.isArray(parsed.qualityChecks) ? parsed.qualityChecks : localBrief.qualityChecks,
        contentWarnings: Array.isArray(parsed.contentWarnings) ? parsed.contentWarnings : localBrief.contentWarnings,
      });
    }
  } catch (err) {
    console.info('[Strategy-Brief] Live AI brief timed out or unavailable, using local strategic baseline.');
  }

  return res.json(localBrief);
}
