import type { Config, Context } from '@netlify/functions';
import {
  recoverAndRetryOutboxDispatches,
  sweepExpiredCloudinaryAssets,
} from '../../api/controllers/publishController.ts';
import { readRuntimeEnv } from '../../src/lib/security/env.ts';
import type { NetlifyLambdaEvent, NetlifyLambdaResult } from '../../src/lib/network/netlifyBridge.ts';

/**
 * Netlify Scheduled Function (UTC cron, <= 30s execution window).
 * Promotes eligible overdue scheduled posts to 'posted', recovers expired/retryable
 * durable publish outbox dispatches, and destroys staged Cloudinary assets +1h after publication,
 * keeping GET endpoints 100% read-pure.
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
  recoveredOutboxCount: number;
  recoveredOutboxIds: string[];
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
      recoveredOutboxCount: 0,
      recoveredOutboxIds: [],
    };
  }

  const runTasks = async () => {
    const outboxRecovery = await recoverAndRetryOutboxDispatches({ limit: 5 }).catch((err) => {
      console.warn('[ScheduledPromote] Outbox recovery warning:', err);
      return {
        checkedCount: 0,
        recoveredIds: [] as string[],
        completedIds: [] as string[],
        skippedIds: [] as string[],
        failedIds: [] as string[],
      };
    });
    const sweep = await sweepExpiredCloudinaryAssets();
    return { outboxRecovery, sweep };
  };

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Scheduled sweep exceeded 25s safety budget')), 25_000);
  });

  const { outboxRecovery, sweep } = await Promise.race([runTasks(), timeoutPromise]);

  return {
    ok: true,
    promotedCount: sweep.promotedPostIds.length,
    promotedPostIds: sweep.promotedPostIds,
    cleanedCount: sweep.cleanedPostIds.length,
    cleanedPostIds: sweep.cleanedPostIds,
    remainingStagedCount: sweep.remainingStagedCount,
    recoveredOutboxCount: outboxRecovery.recoveredIds.length,
    recoveredOutboxIds: outboxRecovery.recoveredIds,
  };
}

function isWebRequest(input: unknown): input is Request {
  return (
    Boolean(input) &&
    typeof input === 'object' &&
    typeof (input as Request).json === 'function'
  );
}

export async function handler(req: Request, context?: Context): Promise<Response>;
export async function handler(
  event: NetlifyLambdaEvent,
  context?: Context
): Promise<NetlifyLambdaResult>;
export async function handler(
  reqOrEvent: Request | NetlifyLambdaEvent,
  _context?: Context
): Promise<Response | NetlifyLambdaResult> {
  const isReq = isWebRequest(reqOrEvent);
  try {
    let nextRun: string | undefined;
    try {
      if (isReq) {
        const payload = (await reqOrEvent.json()) as { next_run?: string };
        nextRun = payload?.next_run;
      } else if (reqOrEvent && typeof reqOrEvent.body === 'string' && reqOrEvent.body) {
        const payload = JSON.parse(reqOrEvent.body) as { next_run?: string };
        nextRun = payload?.next_run;
      }
    } catch {
      // Optional scheduled payload body
    }

    const result = await runScheduledPromotion();
    const bodyStr = JSON.stringify({
      ...result,
      nextRun: nextRun || null,
      ranAt: new Date().toISOString(),
    });

    if (isReq) {
      return new Response(bodyStr, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: bodyStr,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Scheduled promotion failed';
    console.error('[ScheduledPromote]', msg);
    const errBody = JSON.stringify({ ok: false, error: msg });
    if (isReq) {
      return new Response(errBody, {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: errBody,
    };
  }
}

export default handler;

export const config: Config = {
  schedule: '*/15 * * * *',
};
