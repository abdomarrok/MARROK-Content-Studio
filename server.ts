import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { getServerConfig } from './api/config.ts';
import { getPostgresPool } from './api/db/postgres.ts';
import app from './api/index.ts';
import { getAuthConfigStatus, verifySessionRequestOrTokens } from './src/lib/security/sessionAuth.ts';
import { registerVideoStudioRoutes } from './video-studio/studio/expressRouter.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  // Local-only Video Studio API + scoped iframe preview routes (stays outside Vercel/Netlify /api)
  registerVideoStudioRoutes(app, {
    getAuthConfig: getAuthConfigStatus,
    verifySessionRequest: (req, authCfg, candidateTokens) => {
      const dbUrl = getServerConfig().databaseUrl;
      return verifySessionRequestOrTokens(req.headers, authCfg, dbUrl ? getPostgresPool(dbUrl) : null, candidateTokens);
    },
  });

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MARROK Content Studio listening on http://0.0.0.0:${PORT} (${isDev ? 'development' : 'production'})`);
  });
}

startServer();
