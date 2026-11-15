import type { Request, Response, NextFunction } from 'express';
import { readRuntimeEnv } from '../src/lib/security/env.ts';
import { PRODUCTION_NETLIFY_ORIGIN } from '../src/lib/security/corsPolicy.ts';
import { constantTimeEqualText } from '../src/lib/security/sessionAuth.ts';

export interface ServerConfig {
  geminiApiKey: string;
  geminiApiKeys: string[];
  generationModels: string[];
  imageModels: string[];
  freeBackupEnabled: boolean;
  freeTextBackupModels: string[];
  allowedOrigin: string;
  apiSharedSecret: string;
  rateLimitRpm: number;
  jsonBodyLimit: string;
  isVercel: boolean;
  kvRestUrl: string;
  kvRestToken: string;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
  bufferApiKey: string;
  zernioApiKey: string;
  databaseUrl: string;
  telegramBotToken: string;
  telegramWebhookSecret: string;
  telegramAllowedChatIds: string[];
}

export interface CandidateGeminiKey {
  key: string;
  isCustom: boolean;
  label: string;
}

const DEFAULT_GENERATION_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
];

const DEFAULT_IMAGE_MODELS = [
  'gemini-3.1-flash-lite-image',
  'gemini-nano-banana-2.1',
];

const DEFAULT_FREE_TEXT_BACKUP_MODELS = [
  'openai',
  'mistral',
  'llama',
];

const DEPRECATED_MODEL_MAP: Record<string, string> = {
  'gemini-3.8-flash': 'gemini-4-hydrogen',
  'gemini-2.5-flash': 'gemini-4-hydrogen',
  'gemini-2.5-pro': 'gemini-4-hydrogen',
  'gemini-2.0-flash': 'gemini-4-hydrogen',
  'gemini-2.0-pro': 'gemini-4-hydrogen',
  'gemini-1.5-flash': 'gemini-4-hydrogen',
  'gemini-1.5-pro': 'gemini-4-hydrogen',
  'gemini-pro': 'gemini-4-hydrogen',
  'gemini-2.5-flash-lite': 'gemini-3.1-flash-lite',
  'gemini-2.0-flash-lite': 'gemini-3.1-flash-lite',
  'gemini-1.5-flash-8b': 'gemini-3.1-flash-lite',
};

/**
 * Upgrades deprecated Gemini 1.5/2.0/2.5/3.8 model identifiers to verified active Gemini models
 * so existing environment variables never trigger 404 errors.
 */
export function normalizeGenerationModel(model: string): string {
  const trimmed = model.trim();
  const lower = trimmed.toLowerCase();
  return DEPRECATED_MODEL_MAP[lower] || trimmed;
}

function parseModelList(
  raw: string | undefined,
  fallback: string[],
  normalizeFn?: (m: string) => string
): string[] {
  if (!raw || typeof raw !== 'string') return fallback;
  const models = raw
    .split(',')
    .map((m) => (normalizeFn ? normalizeFn(m) : m.trim()))
    .filter((m) => /^[a-zA-Z0-9._-]+$/.test(m));
  const unique = Array.from(new Set(models));
  return unique.length > 0 ? unique : fallback;
}

function parseApiKeyPool(envOverride?: NodeJS.ProcessEnv): string[] {
  const rawSources = [
    readRuntimeEnv('GEMINI_API_KEY', envOverride),
    readRuntimeEnv('GEMINI_API_KEY_BACKUP', envOverride),
    readRuntimeEnv('GEMINI_API_KEY_2', envOverride),
    readRuntimeEnv('GEMINI_API_KEY_3', envOverride),
    readRuntimeEnv('GEMINI_API_KEYS', envOverride),
  ];

  const keys: string[] = [];
  for (const source of rawSources) {
    if (typeof source !== 'string' || !source.trim()) continue;
    for (const part of source.split(',')) {
      const cleaned = part.trim();
      if (cleaned.length > 5 && cleaned !== 'MY_GEMINI_API_KEY' && !keys.includes(cleaned)) {
        keys.push(cleaned);
      }
    }
  }
  return keys;
}

/**
 * Resolves the prioritized, deduplicated list of Gemini API keys for an incoming request:
 * 1. Client primary key (x-gemini-key / x-gemini-api-key / body.apiKey)
 * 2. Client backup key (x-gemini-backup-key / body.backupApiKey)
 * 3. Server environment key pool (GEMINI_API_KEY, GEMINI_API_KEY_BACKUP, GEMINI_API_KEY_2, GEMINI_API_KEYS)
 */
export function resolveRequestGeminiKeys(
  req: Request,
  config: ServerConfig = getServerConfig()
): CandidateGeminiKey[] {
  const candidates: CandidateGeminiKey[] = [];
  const seen = new Set<string>();

  const addRawKeys = (raw: unknown, isCustom: boolean, baseLabel: string) => {
    if (typeof raw !== 'string' || !raw.trim()) return;
    const parts = raw
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k.length > 5 && k !== 'MY_GEMINI_API_KEY');
    parts.forEach((key, idx) => {
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          key,
          isCustom,
          label: parts.length > 1 ? `${baseLabel} #${idx + 1}` : baseLabel,
        });
      }
    });
  };

  const primaryCustom =
    (req.headers['x-gemini-key'] as string) ||
    (req.headers['x-gemini-api-key'] as string) ||
    req.body?.apiKey;
  const backupCustom =
    (req.headers['x-gemini-backup-key'] as string) ||
    req.body?.backupApiKey;

  addRawKeys(primaryCustom, true, 'custom primary key');
  addRawKeys(backupCustom, true, 'custom backup key');

  const reqWithSession = req as Request & { marrokSession?: { sub: string } };
  const secretHeader = String(req.headers['x-api-secret'] || '');
  const hasSecretMatch = Boolean(
    config.apiSharedSecret &&
      secretHeader &&
      constantTimeEqualText(secretHeader, config.apiSharedSecret)
  );
  const canUseServerKeys =
    config.geminiApiKeys.length > 0 &&
    (!config.apiSharedSecret || hasSecretMatch || Boolean(reqWithSession.marrokSession));

  if (canUseServerKeys) {
    config.geminiApiKeys.forEach((serverKey, idx) => {
      if (!seen.has(serverKey)) {
        seen.add(serverKey);
        candidates.push({
          key: serverKey,
          isCustom: false,
          label: idx === 0 ? 'server primary key' : `server backup key #${idx + 1}`,
        });
      }
    });
  }

  return candidates;
}

/**
 * Validates and normalizes environment configuration at startup using Netlify.env.get() + process.env.
 * Never logs raw secret values. Never defaults CORS to '*'.
 */
export function getServerConfig(envOverride?: NodeJS.ProcessEnv): ServerConfig {
  const geminiApiKeys = parseApiKeyPool(envOverride);
  const primaryKeyEnv = readRuntimeEnv('GEMINI_API_KEY', envOverride);
  const geminiApiKey =
    geminiApiKeys[0] ||
    (primaryKeyEnv && primaryKeyEnv !== 'MY_GEMINI_API_KEY' ? primaryKeyEnv : '');
  const generationModels = parseModelList(
    readRuntimeEnv('GEMINI_GENERATION_MODELS', envOverride) || undefined,
    DEFAULT_GENERATION_MODELS,
    normalizeGenerationModel
  );
  const imageModels = parseModelList(
    readRuntimeEnv('GEMINI_IMAGE_MODELS', envOverride) || undefined,
    DEFAULT_IMAGE_MODELS
  );
  const rawFreeBackup = (readRuntimeEnv('FREE_BACKUP_AI_ENABLED', envOverride) || 'true').toLowerCase();
  const freeBackupEnabled = rawFreeBackup !== 'false' && rawFreeBackup !== '0';
  const freeTextBackupModels = parseModelList(
    readRuntimeEnv('FREE_TEXT_BACKUP_MODELS', envOverride) || undefined,
    DEFAULT_FREE_TEXT_BACKUP_MODELS
  );
  const rawOrigin = readRuntimeEnv('ALLOWED_ORIGIN', envOverride);
  const allowedOrigin = rawOrigin && rawOrigin !== '*' ? rawOrigin : PRODUCTION_NETLIFY_ORIGIN;
  const apiSharedSecret = readRuntimeEnv('API_SHARED_SECRET', envOverride);
  const parsedRpm = Number.parseInt(readRuntimeEnv('RATE_LIMIT_RPM', envOverride) || '30', 10);
  const rateLimitRpm = Number.isFinite(parsedRpm) && parsedRpm > 0 ? parsedRpm : 30;
  const jsonBodyLimit = readRuntimeEnv('JSON_BODY_LIMIT', envOverride) || '4.5mb';
  const isVercel = Boolean(readRuntimeEnv('VERCEL', envOverride) || readRuntimeEnv('VERCEL_ENV', envOverride));
  const kvRestUrl = readRuntimeEnv('KV_REST_API_URL', envOverride) || readRuntimeEnv('UPSTASH_REDIS_REST_URL', envOverride);
  const kvRestToken = readRuntimeEnv('KV_REST_API_TOKEN', envOverride) || readRuntimeEnv('UPSTASH_REDIS_REST_TOKEN', envOverride);
  let cloudinaryCloudName = readRuntimeEnv('CLOUDINARY_CLOUD_NAME', envOverride);
  let cloudinaryApiKey = readRuntimeEnv('CLOUDINARY_API_KEY', envOverride);
  let cloudinaryApiSecret = readRuntimeEnv('CLOUDINARY_API_SECRET', envOverride);
  const rawCloudinaryUrl = readRuntimeEnv('CLOUDINARY_URL', envOverride);
  if ((!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret) && rawCloudinaryUrl) {
    try {
      const parsedCdn = new URL(rawCloudinaryUrl);
      cloudinaryCloudName = cloudinaryCloudName || parsedCdn.hostname;
      cloudinaryApiKey = cloudinaryApiKey || decodeURIComponent(parsedCdn.username);
      cloudinaryApiSecret = cloudinaryApiSecret || decodeURIComponent(parsedCdn.password);
    } catch {
      // Ignore malformed CLOUDINARY_URL
    }
  }
  const bufferApiKey = readRuntimeEnv('BUFFER_API_KEY', envOverride);
  const zernioApiKey = readRuntimeEnv('ZERNIO_API_KEY', envOverride);
  const databaseUrl =
    readRuntimeEnv('DATABASE_URL', envOverride) ||
    readRuntimeEnv('POSTGRES_URL', envOverride) ||
    readRuntimeEnv('NETLIFY_DATABASE_URL', envOverride) ||
    readRuntimeEnv('NETLIFY_DATABASE_URL_UNPOOLED', envOverride);
  const telegramBotToken = readRuntimeEnv('TELEGRAM_BOT_TOKEN', envOverride);
  const telegramWebhookSecret = readRuntimeEnv('TELEGRAM_WEBHOOK_SECRET', envOverride);
  const telegramAllowedChatIds = readRuntimeEnv('TELEGRAM_ALLOWED_CHAT_IDS', envOverride)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  return {
    geminiApiKey,
    geminiApiKeys,
    generationModels,
    imageModels,
    freeBackupEnabled,
    freeTextBackupModels,
    allowedOrigin,
    apiSharedSecret,
    rateLimitRpm,
    jsonBodyLimit,
    isVercel,
    kvRestUrl,
    kvRestToken,
    cloudinaryCloudName,
    cloudinaryApiKey,
    cloudinaryApiSecret,
    bufferApiKey,
    zernioApiKey,
    databaseUrl,
    telegramBotToken,
    telegramWebhookSecret,
    telegramAllowedChatIds,
  };
}

/**
 * Lightweight, zero-dependency per-IP sliding-window rate limiter middleware.
 */
export function createRateLimiter(options?: { windowMs?: number; maxRequests?: number }) {
  const windowMs = options?.windowMs ?? 60_000;
  const hits = new Map<string, number[]>();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const config = getServerConfig();
    const maxRequests = options?.maxRequests ?? config.rateLimitRpm;

    const forwarded = req.headers['x-forwarded-for'];
    const clientIp =
      (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';

    const now = Date.now();
    const cutoff = now - windowMs;
    const recent = (hits.get(clientIp) || []).filter((ts) => ts > cutoff);

    if (recent.length >= maxRequests) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({
        error: 'Rate limit exceeded. Please wait before making more generation requests.',
      });
    }

    recent.push(now);
    hits.set(clientIp, recent);

    // Periodic cleanup of stale IP entries
    if (hits.size > 1000) {
      for (const [ip, timestamps] of hits.entries()) {
        if (timestamps.every((ts) => ts <= cutoff)) {
          hits.delete(ip);
        }
      }
    }

    next();
  };
}

/**
 * Standard HTTP security headers (equivalent to Helmet core protections).
 */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}
