import type { Config, Context } from '@netlify/functions';
import { invokeExpressNetlifyBridge } from '../../src/lib/network/netlifyBridge.ts';

export default async function handler(req: Request, context: Context): Promise<Response> {
  return invokeExpressNetlifyBridge(req, context);
}

export const config: Config = {
  path: ['/api/generate', '/api/generate-image', '/api/refine-slide'],
};
