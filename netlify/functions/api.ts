import type { Context } from '@netlify/functions';
import { invokeExpressNetlifyBridge } from '../../src/lib/network/netlifyBridge.ts';

/**
 * Catch-all fallback Netlify Function reached via netlify.toml:
 * `[[redirects]] from = "/api/*" to = "/.netlify/functions/api/:splat" status = 200`
 * Domain routes are handled directly by modular v2 functions (auth, posts, generate, publish, gather, proxy).
 */
export default async function handler(req: Request, context: Context): Promise<Response> {
  return invokeExpressNetlifyBridge(req, context);
}
