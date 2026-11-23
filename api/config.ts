import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { readRuntimeEnv } from '../src/lib/security/env.ts';
import { PRODUCTION_NETLIFY_ORIGIN } from '../src/lib/security/corsPolicy.ts';
import { constantTimeEqualText } from '../src/lib/security/sessionAuth.ts';

export const REQUEST_ID_HEADER = 'X-Request-Id';
const VALID_REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

export interface RequestWithCorrelation extends Request {
  requestId?: string;
}

export function isValidRequestId(raw: unknown): raw is string {
  return typeof raw === 'string' && VALID_REQUEST_ID_RE.test(raw);
}

/**
 * Validates an incoming X-Request-Id header against a strict alphanumeric/dot/dash/underscore allowlist
 * (8-64 chars) to prevent log/CRLF injection, or mints a fresh cryptographic UUID correlation ID.
 */
export function resolveOrCreateRequestId(incoming: unknown): string {
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (isValidRequestId(trimmed)) {
      return trimmed;
    }
  }
  return `req_${crypto.randomUUID()}`;
}

function sanitizeStructuredValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/[\r\n\t\x00-\x1f\x7f]+/g, ' ').slice(0, 240);
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }
  return undefined;
}

/**
 * Emits single-line JSON operational logs with strict control-character stripping.
 * Callers must pass only non-sensitive metadata (never credentials, tokens, cookies, or user content).
 */
export function logStructuredEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {}
): void {
  const safeFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    const sanitized = sanitizeStructuredValue(v);
    if (sanitized !== undefined) {
      safeFields[k] = sanitized;
    }
  }
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event: sanitizeStructuredValue(event),
    ...safeFields,
  });
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function requestCorrelationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = resolveOrCreateRequestId(req.headers['x-request-id']);
  (req as RequestWithCorrelation).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  const startedAt = Date.now();
  res.on('finish', () => {
    if (res.statusCode >= 500) {
      const pathOnly = String(req.originalUrl || req.url || '/').split('?')[0];
      logStructuredEvent('error', 'http_server_error', {
        requestId,
        method: req.method,
        path: pathOnly,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    }
  });

  next();
}

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
  const rawTelegramBotToken =
    readRuntimeEnv('TELEGRAM_BOT_TOKEN', envOverride) ||
    readRuntimeEnv('TELEGRAM_TOKEN', envOverride) ||
    readRuntimeEnv('TG_BOT_TOKEN', envOverride);
  const telegramBotToken = rawTelegramBotToken.replace(/^bot(?=\d+:)/i, '');
  const telegramWebhookSecret =
    readRuntimeEnv('TELEGRAM_WEBHOOK_SECRET', envOverride) ||
    readRuntimeEnv('TELEGRAM_SECRET', envOverride) ||
    readRuntimeEnv('TELEGRAM_SECRET_TOKEN', envOverride) ||
    readRuntimeEnv('TG_WEBHOOK_SECRET', envOverride);
  const rawTelegramChatIds =
    readRuntimeEnv('TELEGRAM_ALLOWED_CHAT_IDS', envOverride) ||
    readRuntimeEnv('TELEGRAM_ALLOWED_CHAT_ID', envOverride) ||
    readRuntimeEnv('TELEGRAM_CHAT_IDS', envOverride) ||
    readRuntimeEnv('TELEGRAM_CHAT_ID', envOverride) ||
    readRuntimeEnv('TG_ALLOWED_CHAT_IDS', envOverride) ||
    readRuntimeEnv('TG_CHAT_ID', envOverride);
  const telegramAllowedChatIds = rawTelegramChatIds
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
 * Hybrid per-IP sliding-window rate limiter middleware.
 * Uses atomic Upstash Redis REST transactions (/multi-exec) for distributed sliding-window counter
 * estimation across serverless instances, with fail-safe automatic fallback to process-local
 * in-memory tracking when Redis is unconfigured or unavailable.
 *
 * NOTE ON OUTAGES: Process-local fallback protects the individual serverless instance from crashing
 * or exhausting local resources, but does NOT enforce a unified distributed ceiling across multiple
 * concurrent serverless instances during a Redis outage.
 */
export function createRateLimiter(options?: { windowMs?: number; maxRequests?: number }) {
  const windowMs = options?.windowMs ?? 60_000;
  const hits = new Map<string, number[]>();

  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const config = getServerConfig();
    const maxRequests = options?.maxRequests ?? config.rateLimitRpm;

    const forwarded = req.headers['x-forwarded-for'];
    const clientIp =
      (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';

    const now = Date.now();

    // 1. Distributed sliding-window counter via Upstash Redis REST /multi-exec if configured
    if (config.kvRestUrl && config.kvRestToken && clientIp !== 'unknown') {
      try {
        const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
        const currentBucket = Math.floor(now / windowMs);
        const prevBucket = currentBucket - 1;
        const currentKey = `ratelimit:ip:${encodeURIComponent(clientIp)}:${currentBucket}`;
        const prevKey = `ratelimit:ip:${encodeURIComponent(clientIp)}:${prevBucket}`;
        const cleanUrl = config.kvRestUrl.replace(/\/+$/, '');

        // Atomic transaction: fetch previous window count, increment current window counter, and ensure TTL
        const kvRes = await fetch(`${cleanUrl}/multi-exec`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.kvRestToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify([
            ['GET', prevKey],
            ['INCR', currentKey],
            ['EXPIRE', currentKey, windowSec * 2],
          ]),
          signal: AbortSignal.timeout(1500),
        });

        if (kvRes.ok) {
          const results = (await kvRes.json()) as Array<{ error?: string; result?: unknown }>;
          if (!Array.isArray(results) || results.length < 3) {
            throw new Error('Malformed Upstash /multi-exec transaction response');
          }
          const commandError = results.find((r) => Boolean(r && typeof r === 'object' && r.error));
          if (commandError) {
            throw new Error(`Upstash command error inside transaction: ${commandError.error}`);
          }
          const prevRaw = results[0]?.result;
          const prevHits = typeof prevRaw === 'string' || typeof prevRaw === 'number'
            ? Number.parseInt(String(prevRaw), 10) || 0
            : 0;
          const currentHits = typeof results[1]?.result === 'number'
            ? results[1].result
            : 1;

          // Sliding-window counter approximation: decay previous bucket hits based on elapsed window time
          const timeIntoWindow = now % windowMs;
          const prevWeight = Math.max(0, Math.min(1, (windowMs - timeIntoWindow) / windowMs));
          const estimatedHits = Math.floor(prevHits * prevWeight) + currentHits;

          if (estimatedHits > maxRequests) {
            const reqId = (req as RequestWithCorrelation).requestId;
            logStructuredEvent('warn', 'rate_limit_exceeded', {
              requestId: reqId,
              path: String(req.originalUrl || req.url || '/').split('?')[0],
              backend: 'upstash',
              retryAfterSeconds: windowSec,
            });
            res.setHeader('Retry-After', String(windowSec));
            return res.status(429).json({
              error: 'Rate limit exceeded. Please wait before making more requests.',
              retryAfterSeconds: windowSec,
            });
          }
          return next();
        }
      } catch {
        // Fail-safe: Redis outage/timeout gracefully falls back to local in-memory sliding window
      }
    }

    // 2. In-memory sliding-window fallback
    const cutoff = now - windowMs;
    const recent = (hits.get(clientIp) || []).filter((ts) => ts > cutoff);

    if (recent.length >= maxRequests) {
      const retrySec = Math.ceil(windowMs / 1000);
      const reqId = (req as RequestWithCorrelation).requestId;
      logStructuredEvent('warn', 'rate_limit_exceeded', {
        requestId: reqId,
        path: String(req.originalUrl || req.url || '/').split('?')[0],
        backend: 'memory',
        retryAfterSeconds: retrySec,
      });
      res.setHeader('Retry-After', String(retrySec));
      return res.status(429).json({
        error: 'Rate limit exceeded. Please wait before making more generation requests.',
        retryAfterSeconds: retrySec,
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

    return next();
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
