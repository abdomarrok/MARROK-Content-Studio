import express from 'express';
import dotenv from 'dotenv';
import { handleProxyImage } from './controllers/proxyController.ts';
import { handleSearchMedia } from './controllers/mediaController.ts';
import { handleGenerateImage } from './controllers/imageController.ts';
import { handleGenerateCarousel, handleRefineSlide } from './controllers/generateController.ts';
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

dotenv.config();

const serverConfig = getServerConfig();
const app = express();
const generationLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: serverConfig.rateLimitRpm });

app.use(securityHeadersMiddleware);

// CORS & Vercel Path Restoration Middleware
app.use((req, res, next) => {
  const activeConfig = getServerConfig();
  res.header('Access-Control-Allow-Origin', activeConfig.allowedOrigin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-gemini-key, x-gemini-api-key, x-gemini-backup-key, x-api-secret'
  );
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  // Restore rewritten path if served by Vercel serverless
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

  next();
});

// Vercel function body limit is ~4.5 MB
app.use(express.json({ limit: serverConfig.jsonBodyLimit }));

// Quick healthcheck endpoint
app.get(['/api/health', '/health'], (_req, res) => {
  const cfg = getServerConfig();
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    hasApiKey: cfg.geminiApiKeys.length > 0 || Boolean(cfg.geminiApiKey),
    apiKeyCount: cfg.geminiApiKeys.length,
    freeBackupEnabled: cfg.freeBackupEnabled,
  });
});

// Mounted API Controller Handlers
app.get(['/api/proxy-image', '/proxy-image'], handleProxyImage);
app.get(['/api/search-media', '/search-media'], handleSearchMedia);
app.post(['/api/generate-image', '/generate-image'], generationLimiter, handleGenerateImage);
app.post(['/api/generate', '/generate'], generationLimiter, handleGenerateCarousel);
app.post(['/api/refine-slide', '/refine-slide'], generationLimiter, handleRefineSlide);

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


