import type { Request, Response, NextFunction } from 'express';

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
}

export interface CandidateGeminiKey {
  key: string;
  isCustom: boolean;
  label: string;
}

const DEFAULT_GENERATION_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
];

const DEFAULT_IMAGE_MODELS = [
  'gemini-nano-banana-2.1',
  'gemini-3.1-flash-lite-image',
];

const DEFAULT_FREE_TEXT_BACKUP_MODELS = [
  'openai',
  'mistral',
  'llama',
];

const DEPRECATED_MODEL_MAP: Record<string, string> = {
  'gemini-2.5-flash': 'gemini-3.8-flash',
  'gemini-2.5-pro': 'gemini-3.8-flash',
  'gemini-2.0-flash': 'gemini-3.8-flash',
  'gemini-1.5-flash': 'gemini-3.8-flash',
  'gemini-1.5-pro': 'gemini-3.8-flash',
  'gemini-2.5-flash-lite': 'gemini-3.1-flash-lite',
  'gemini-2.0-flash-lite': 'gemini-3.1-flash-lite',
  'gemini-1.5-flash-8b': 'gemini-3.1-flash-lite',
};

/**
 * Upgrades deprecated Gemini 1.5/2.0/2.5 model identifiers to active Gemini 3.x models
 * so existing environment variables on Vercel or local .env files never trigger 404 errors.
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

function parseApiKeyPool(env: NodeJS.ProcessEnv): string[] {
  const rawSources = [
    env.GEMINI_API_KEY,
    env.GEMINI_API_KEY_BACKUP,
    env.GEMINI_API_KEY_2,
    env.GEMINI_API_KEY_3,
    env.GEMINI_API_KEYS,
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

  const canUseServerKeys =
    config.geminiApiKeys.length > 0 &&
    (!config.apiSharedSecret || req.headers['x-api-secret'] === config.apiSharedSecret);

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
 * Validates and normalizes environment configuration at startup.
 * Never logs raw secret values.
 */
export function getServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const geminiApiKeys = parseApiKeyPool(env);
  const geminiApiKey = geminiApiKeys[0] || (typeof env.GEMINI_API_KEY === 'string' && env.GEMINI_API_KEY.trim() !== 'MY_GEMINI_API_KEY' ? env.GEMINI_API_KEY.trim() : '');
  const generationModels = parseModelList(
    env.GEMINI_GENERATION_MODELS,
    DEFAULT_GENERATION_MODELS,
    normalizeGenerationModel
  );
  const imageModels = parseModelList(env.GEMINI_IMAGE_MODELS, DEFAULT_IMAGE_MODELS);
  const rawFreeBackup = (env.FREE_BACKUP_AI_ENABLED || 'true').trim().toLowerCase();
  const freeBackupEnabled = rawFreeBackup !== 'false' && rawFreeBackup !== '0';
  const freeTextBackupModels = parseModelList(
    env.FREE_TEXT_BACKUP_MODELS,
    DEFAULT_FREE_TEXT_BACKUP_MODELS
  );
  const allowedOrigin = typeof env.ALLOWED_ORIGIN === 'string' && env.ALLOWED_ORIGIN.trim()
    ? env.ALLOWED_ORIGIN.trim()
    : '*';
  const apiSharedSecret = typeof env.API_SHARED_SECRET === 'string' ? env.API_SHARED_SECRET.trim() : '';
  const parsedRpm = Number.parseInt(env.RATE_LIMIT_RPM || '30', 10);
  const rateLimitRpm = Number.isFinite(parsedRpm) && parsedRpm > 0 ? parsedRpm : 30;
  // Vercel serverless function body limit is ~4.5 MB
  const jsonBodyLimit = typeof env.JSON_BODY_LIMIT === 'string' && env.JSON_BODY_LIMIT.trim()
    ? env.JSON_BODY_LIMIT.trim()
    : '4.5mb';
  const isVercel = Boolean(env.VERCEL || env.VERCEL_ENV);
  const kvRestUrl = (env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || '').trim();
  const kvRestToken = (env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || '').trim();
  const cloudinaryCloudName = (env.CLOUDINARY_CLOUD_NAME || '').trim();
  const cloudinaryApiKey = (env.CLOUDINARY_API_KEY || '').trim();
  const cloudinaryApiSecret = (env.CLOUDINARY_API_SECRET || '').trim();
  const bufferApiKey = (env.BUFFER_API_KEY || '').trim();

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
