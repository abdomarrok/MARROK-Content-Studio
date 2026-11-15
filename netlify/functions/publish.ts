import type { Config, Context } from '@netlify/functions';
import {
  invokeUniversalNetlifyHandler,
  type NetlifyLambdaEvent,
  type NetlifyLambdaResult,
} from '../../src/lib/network/netlifyBridge.ts';

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

export const config: Config = {
  path: ['/api/publish/*'],
};
