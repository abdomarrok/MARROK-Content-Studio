import type { Context } from '@netlify/functions';
import {
  invokeUniversalNetlifyHandler,
  type NetlifyLambdaEvent,
  type NetlifyLambdaResult,
} from '../../src/lib/network/netlifyBridge.ts';

/**
 * Catch-all Netlify Function reached via netlify.toml:
 * `[[redirects]] from = "/api/*" to = "/.netlify/functions/api/:splat" status = 200`
 * Exports both `handler` (for `___netlify-bootstrap.mjs` `D.handler`) and `default` (V2 Web Request).
 */
export async function handler(req: Request, context?: Context): Promise<Response>;
export async function handler(
  event: NetlifyLambdaEvent,
  context?: Context
): Promise<NetlifyLambdaResult>;
export async function handler(
  reqOrEvent: Request | NetlifyLambdaEvent,
  context?: Context
): Promise<Response | NetlifyLambdaResult> {
  return invokeUniversalNetlifyHandler(reqOrEvent as Request, context);
}

export default handler;
