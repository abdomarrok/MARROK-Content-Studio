import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Server } from 'http';
import { app } from '../../../api/index.ts';

async function countFilesRecursive(dir: string): Promise<number> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += await countFilesRecursive(full);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

describe('Vercel API Serverless Routing', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('keeps /api file count strictly <= 12 to satisfy Vercel Hobby Serverless Function limit', async () => {
    const apiDir = path.resolve(process.cwd(), 'api');
    const fileCount = await countFilesRecursive(apiDir);
    expect(fileCount).toBeLessThanOrEqual(12);
  });

  it('responds 200 OK on /api/health', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(typeof json.timestamp).toBe('number');
  });

  it('responds 200 OK on un-prefixed /health', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
  });

  it('restores requested route when Vercel rewrites /api/* to /api/index', async () => {
    const res = await fetch(`${baseUrl}/api/index`, {
      headers: {
        'x-matched-path': '/api/index',
        'x-forwarded-uri': '/api/health',
      },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');

    const radarRes = await fetch(`${baseUrl}/api/index`, {
      headers: {
        'x-matched-path': '/api/index',
        'x-forwarded-uri': '/api/gather/radar',
      },
    });
    expect(radarRes.status).toBe(200);
    const radarJson = await radarRes.json();
    expect(radarJson.ok).toBe(true);
    expect(Array.isArray(radarJson.topics)).toBe(true);
  });

  it('handles OPTIONS preflight with permissive CORS', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'OPTIONS',
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

