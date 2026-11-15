import type { Config, Context } from '@netlify/functions';
import { sweepExpiredCloudinaryAssets } from '../../api/controllers/publishController.ts';
import { readRuntimeEnv } from '../../src/lib/security/env.ts';

/**
 * Netlify Scheduled Function v2 (UTC cron, <= 30s execution window).
 * Promotes eligible overdue scheduled posts to 'posted' and destroys staged
 * Cloudinary assets +1h after publication, keeping GET endpoints 100% read-pure.
 */
export async function runScheduledPromotion(env: NodeJS.ProcessEnv = process.env): Promise<{
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  promotedCount: number;
  promotedPostIds: string[];
  cleanedCount: number;
  cleanedPostIds: string[];
  remainingStagedCount: number;
}> {
  const netlifyContext = (readRuntimeEnv('CONTEXT', env) || '').trim().toLowerCase();
  const allowNonProd = readRuntimeEnv('ALLOW_NON_PROD_CRON', env) === 'true';

  if (
    netlifyContext &&
    netlifyContext !== 'production' &&
    !allowNonProd
  ) {
    return {
      ok: true,
      skipped: true,
      reason: `Skipped scheduled promotion in non-production Netlify context (${netlifyContext})`,
      promotedCount: 0,
      promotedPostIds: [],
      cleanedCount: 0,
      cleanedPostIds: [],
      remainingStagedCount: 0,
    };
  }

  const sweepPromise = sweepExpiredCloudinaryAssets();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Scheduled sweep exceeded 25s safety budget')), 25_000);
  });

  const sweep = await Promise.race([sweepPromise, timeoutPromise]);

  return {
    ok: true,
    promotedCount: sweep.promotedPostIds.length,
    promotedPostIds: sweep.promotedPostIds,
    cleanedCount: sweep.cleanedPostIds.length,
    cleanedPostIds: sweep.cleanedPostIds,
    remainingStagedCount: sweep.remainingStagedCount,
  };
}

export default async function handler(req: Request, _context: Context): Promise<Response> {
  try {
    let nextRun: string | undefined;
    try {
      const payload = (await req.json()) as { next_run?: string };
      nextRun = payload?.next_run;
    } catch {
      // Optional scheduled payload body
    }

    const result = await runScheduledPromotion();
    return new Response(
      JSON.stringify({
        ...result,
        nextRun: nextRun || null,
        ranAt: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Scheduled promotion failed';
    console.error('[ScheduledPromote]', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

export const config: Config = {
  schedule: '*/15 * * * *',
};
