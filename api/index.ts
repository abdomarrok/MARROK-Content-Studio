import express from 'express';
import dotenv from 'dotenv';
import { handleProxyImage } from './controllers/proxyController.ts';
import {
  handleSearchMedia,
  handleGetTopicRadar,
  handleExtractUrlContent,
  handleAutopilotGatherAndSynthesize,
  handleTelegramWebhook,
  handleListTriageDecisions,
  handleRecordTriageDecision,
  handleDeleteTriageDecision,
} from './controllers/mediaController.ts';
import { handleGenerateImage } from './controllers/imageController.ts';
import {
  handleGenerateCarousel,
  handleRefineSlide,
  handleDirectVisual,
} from './controllers/generateController.ts';
import {
  handleListPosts,
  handleGetPost,
  handleSavePost,
  handleUpdatePostStatus,
  handleDeletePost,
} from './controllers/postsController.ts';
import {
  handleGetPublishStatus,
  handleGetTikTokCommercialMusic,
  handleUploadPublishMedia,
  handleCleanupPublishMedia,
  handleDispatchPublish,
  handleManagePublishedPost,
  handleServeStagedMedia,
} from './controllers/publishController.ts';
import { getServerConfig, createRateLimiter, securityHeadersMiddleware } from './config.ts';
import { getPostgresPool } from './db/postgres.ts';
import { evaluateCorsOrigin } from '../src/lib/security/corsPolicy.ts';
import { isPreviewWriteBlocked } from '../src/lib/security/env.ts';
import {
  SESSION_COOKIE_NAME,
  checkLoginLockout,
  clearLoginAttempts,
  constantTimeEqualText,
  createSignedSessionToken,
  extractBearerSessionToken,
  getAuthConfigStatus,
  isCronOrWebhookSecretAuthorized,
  parseCookies,
  recordFailedLoginAttempt,
  revokeSessionToken,
  serializeClearSessionCookie,
  serializeSessionCookie,
  verifyPasswordConstantTime,
  verifySessionCookieValue,
} from '../src/lib/security/sessionAuth.ts';

dotenv.config();

const serverConfig = getServerConfig();
const app = express();
const generationLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: serverConfig.rateLimitRpm });
const radarScanLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: Math.max(10, Number(process.env.RADAR_RATE_LIMIT_RPM || 30)),
});

app.use(securityHeadersMiddleware);

// Strict Allowlist CORS & Proxy Path Restoration Middleware
app.use((req, res, next) => {
  const originHeader = req.headers.origin as string | undefined;
  const cors = evaluateCorsOrigin(originHeader);

  res.setHeader('Vary', 'Origin');

  if (!cors.allowed) {
    return res.status(403).json({
      error: cors.reason || 'Cross-origin request denied by CORS policy.',
    });
  }

  if (cors.allowOriginHeader) {
    res.setHeader('Access-Control-Allow-Origin', cors.allowOriginHeader);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-gemini-key, x-gemini-api-key, x-gemini-backup-key, x-api-secret, x-telegram-bot-api-secret-token'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  const forwardedUri = req.headers['x-forwarded-uri'] as string;
  const matchedPath = req.headers['x-matched-path'] as string;

  let targetPath = '';
  if (forwardedUri && forwardedUri.startsWith('/api')) {
    targetPath = forwardedUri;
  } else if (
    matchedPath &&
    matchedPath.startsWith('/api') &&
    matchedPath !== '/api/index' &&
    matchedPath !== '/api/index.js' &&
    matchedPath !== '/api/index.ts'
  ) {
    targetPath = matchedPath;
  }

  if (targetPath) {
    req.url = targetPath;
  }

  return next();
});

app.use(express.json({ limit: serverConfig.jsonBodyLimit }));

// Minimal unauthenticated liveness probe (zero secret telemetry)
app.get(['/api/health', '/health'], (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
  });
});

function resolveClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  return (
    (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// Authentication endpoints (unauthenticated entrypoints; fail closed 503 if auth env vars missing)
app.get(['/api/auth/session', '/auth/session'], async (req, res) => {
  const authCfg = getAuthConfigStatus();
  if (!authCfg.configured) {
    return res.status(503).json({
      authenticated: false,
      authConfigured: false,
      error: 'Server authentication is not configured.',
    });
  }
  const activeConfig = getServerConfig();
  const pool = activeConfig.databaseUrl ? getPostgresPool(activeConfig.databaseUrl) : null;
  const session = await verifySessionCookieValue(
    req.headers.cookie,
    authCfg,
    pool,
    Date.now(),
    req.headers.authorization
  );
  if (!session) {
    return res.status(200).json({
      authenticated: false,
      authConfigured: true,
    });
  }
  return res.status(200).json({
    authenticated: true,
    authConfigured: true,
    username: session.sub,
    expiresAt: session.exp * 1000,
  });
});

function isAiStudioIframeRequest(req: express.Request): boolean {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').toLowerCase();
  const origin = String(req.headers.origin || '').toLowerCase();
  return host.includes('.run.app') || origin.includes('.run.app');
}

app.post(['/api/auth/login', '/auth/login'], async (req, res) => {
  const authCfg = getAuthConfigStatus();
  if (!authCfg.configured) {
    return res.status(503).json({
      error: 'Authentication secrets are not configured on this deployment.',
    });
  }

  const activeConfig = getServerConfig();
  const pool = activeConfig.databaseUrl ? getPostgresPool(activeConfig.databaseUrl) : null;
  const clientIp = resolveClientIp(req);
  const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';
  const attemptKey = `${clientIp}:${rawUsername.toLowerCase() || 'anonymous'}`;
  const ipAttemptKey = `ip:${clientIp}`;

  const [acctLock, ipLock] = await Promise.all([
    checkLoginLockout(attemptKey, pool),
    checkLoginLockout(ipAttemptKey, pool),
  ]);
  if (acctLock.locked || ipLock.locked) {
    const retryAfter = Math.max(acctLock.retryAfterSeconds, ipLock.retryAfterSeconds);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: `Too many failed login attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
      retryAfterSeconds: retryAfter,
    });
  }

  // Always compute scrypt + constant-time username check regardless of which field differs
  const usernameMatches = constantTimeEqualText(rawUsername, authCfg.username);
  const passwordMatches = verifyPasswordConstantTime(rawPassword, authCfg.passwordHash);

  if (!usernameMatches || !passwordMatches) {
    const [acctFail] = await Promise.all([
      recordFailedLoginAttempt(attemptKey, pool),
      recordFailedLoginAttempt(ipAttemptKey, pool),
    ]);
    if (acctFail.locked) {
      res.setHeader('Retry-After', String(acctFail.retryAfterSeconds));
      return res.status(429).json({
        error: 'Too many failed login attempts. Account temporarily locked.',
        retryAfterSeconds: acctFail.retryAfterSeconds,
      });
    }
    return res.status(401).json({
      error: 'Invalid credentials.',
    });
  }

  await Promise.all([
    clearLoginAttempts(attemptKey, pool),
    clearLoginAttempts(ipAttemptKey, pool),
  ]);

  const { token, payload } = createSignedSessionToken(
    authCfg.username,
    authCfg.sessionSecret,
    authCfg.sessionTtlSeconds
  );
  const partitionedIframe = isAiStudioIframeRequest(req);
  res.setHeader(
    'Set-Cookie',
    serializeSessionCookie(token, authCfg.sessionTtlSeconds, { partitionedIframe })
  );
  return res.status(200).json({
    authenticated: true,
    username: payload.sub,
    expiresAt: payload.exp * 1000,
    token,
  });
});

app.post(['/api/auth/logout', '/auth/logout'], async (req, res) => {
  const authCfg = getAuthConfigStatus();
  const activeConfig = getServerConfig();
  const pool = activeConfig.databaseUrl ? getPostgresPool(activeConfig.databaseUrl) : null;
  const cookies = parseCookies(req.headers.cookie);
  const existingToken =
    cookies[SESSION_COOKIE_NAME] || extractBearerSessionToken(req.headers.authorization);
  if (existingToken && authCfg.sessionSecret) {
    await revokeSessionToken(existingToken, authCfg.sessionSecret, pool);
  }
  const partitionedIframe = isAiStudioIframeRequest(req);
  res.setHeader('Set-Cookie', serializeClearSessionCookie({ partitionedIframe }));
  return res.status(200).json({ authenticated: false });
});

// Universal Fail-Closed Authentication Gate for ALL /api/* routes (except auth/health and verified cron/webhook)
app.use(async (req, res, next) => {
  const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
  const isApiRoute =
    pathOnly.startsWith('/api/') ||
    pathOnly.startsWith('/posts') ||
    pathOnly.startsWith('/publish') ||
    pathOnly.startsWith('/gather') ||
    pathOnly.startsWith('/proxy-image') ||
    pathOnly.startsWith('/search-media') ||
    pathOnly.startsWith('/generate') ||
    pathOnly.startsWith('/refine-slide') ||
    pathOnly.startsWith('/direct-visual');

  if (!isApiRoute) {
    return next();
  }

  if (isCronOrWebhookSecretAuthorized(pathOnly, req.headers)) {
    return next();
  }

  const authCfg = getAuthConfigStatus();
  if (!authCfg.configured) {
    return res.status(503).json({
      error: 'Server authentication is not configured (fail closed).',
    });
  }

  const activeConfig = getServerConfig();
  const pool = activeConfig.databaseUrl ? getPostgresPool(activeConfig.databaseUrl) : null;
  const session = await verifySessionCookieValue(
    req.headers.cookie,
    authCfg,
    pool,
    Date.now(),
    req.headers.authorization
  );
  if (!session) {
    return res.status(401).json({
      error: 'Authentication required. Please sign in.',
    });
  }

  (req as express.Request & { marrokSession?: { sub: string; jti: string } }).marrokSession = {
    sub: session.sub,
    jti: session.jti,
  };

  // Deploy Previews must never write to production DB or publishing channels
  const isMutating = req.method !== 'GET' && req.method !== 'HEAD';
  const isIsolatedProtectedWrite =
    pathOnly.startsWith('/api/posts') ||
    pathOnly.startsWith('/posts') ||
    pathOnly.startsWith('/api/publish/') ||
    pathOnly.startsWith('/publish/');
  if (isMutating && isIsolatedProtectedWrite && isPreviewWriteBlocked()) {
    return res.status(403).json({
      error: 'Deploy Previews are read-isolated and cannot mutate production posts or publishing channels.',
    });
  }

  return next();
});

// Authenticated API Controller Handlers
app.get(['/api/proxy-image', '/proxy-image'], handleProxyImage);
app.get(['/api/search-media', '/search-media'], handleSearchMedia);
app.post(['/api/generate-image', '/generate-image'], generationLimiter, handleGenerateImage);
app.post(['/api/generate', '/generate'], generationLimiter, handleGenerateCarousel);
app.post(['/api/refine-slide', '/refine-slide'], generationLimiter, handleRefineSlide);
app.post(['/api/direct-visual', '/direct-visual'], generationLimiter, handleDirectVisual);

// Automated Post Gathering, Quality-Gated Autopilot, Triage Learning & Telegram Webhook Endpoints
app.get(['/api/gather/radar', '/gather/radar'], radarScanLimiter, handleGetTopicRadar);
app.post(['/api/gather/extract-url', '/gather/extract-url'], generationLimiter, handleExtractUrlContent);
app.get(['/api/gather/triage', '/gather/triage'], handleListTriageDecisions);
app.post(['/api/gather/triage', '/gather/triage'], handleRecordTriageDecision);
app.delete(['/api/gather/triage/:id', '/gather/triage/:id'], handleDeleteTriageDecision);
app.post(['/api/gather/autopilot', '/gather/autopilot'], generationLimiter, handleAutopilotGatherAndSynthesize);
app.post(['/api/gather/telegram-webhook', '/gather/telegram-webhook'], generationLimiter, handleTelegramWebhook);

// Validated & Posted Carousels Vault Endpoints
app.get(['/api/posts', '/posts'], handleListPosts);
app.get(['/api/posts/:id', '/posts/:id'], handleGetPost);
app.post(['/api/posts', '/posts'], handleSavePost);
app.patch(['/api/posts/:id/status', '/posts/:id/status'], handleUpdatePostStatus);
app.delete(['/api/posts/:id', '/posts/:id'], handleDeletePost);

// Publishing, Scheduling & Cloudinary Auto-Cleanup Endpoints
app.get(['/api/publish/status', '/publish/status'], handleGetPublishStatus);
app.get(['/api/publish/tiktok-music', '/publish/tiktok-music'], handleGetTikTokCommercialMusic);
app.post(['/api/publish/upload-media', '/publish/upload-media'], handleUploadPublishMedia);
app.post(['/api/publish/cleanup-media', '/publish/cleanup-media'], handleCleanupPublishMedia);
app.post(['/api/publish/dispatch', '/publish/dispatch'], handleDispatchPublish);
app.post(['/api/publish/manage-post', '/publish/manage-post'], handleManagePublishedPost);
app.get(['/api/publish/media/:assetId', '/publish/media/:assetId'], handleServeStagedMedia);

export default app;
export { app };
