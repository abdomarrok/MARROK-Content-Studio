import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@netlify/functions';
import { app } from '../../../api/index.ts';

export interface NetlifyLambdaEvent {
  rawUrl?: string;
  path?: string;
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  multiValueHeaders?: Record<string, string[] | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
  rawQuery?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
}

export interface NetlifyLambdaResult {
  statusCode: number;
  headers: Record<string, string>;
  multiValueHeaders?: Record<string, string[]>;
  body: string;
  isBase64Encoded?: boolean;
}

function normalizeNetlifyPath(rawPath: string): string {
  const pathOnly = (rawPath || '/').trim();
  if (pathOnly.startsWith('/.netlify/functions/api/')) {
    return `/api/${pathOnly.slice('/.netlify/functions/api/'.length)}`;
  }
  if (pathOnly === '/.netlify/functions/api') {
    return '/api/health';
  }
  if (pathOnly.startsWith('/.netlify/functions/')) {
    const rest = pathOnly.slice('/.netlify/functions/'.length);
    if (rest === 'proxy') return '/api/proxy-image';
    return `/api/${rest}`;
  }
  return pathOnly;
}

function isBinaryContentType(contentType: string): boolean {
  const ct = (contentType || '').toLowerCase();
  if (!ct) return false;
  if (ct.includes('svg') || ct.includes('json') || ct.startsWith('text/') || ct.includes('xml') || ct.includes('javascript')) {
    return false;
  }
  return (
    ct.startsWith('image/') ||
    ct.startsWith('video/') ||
    ct.startsWith('audio/') ||
    ct.includes('application/octet-stream') ||
    ct.includes('application/zip') ||
    ct.includes('application/pdf')
  );
}

/**
 * Shared Netlify Functions v2 <-> Express Web Request/Response bridge.
 * Preserves multi-value Set-Cookie headers, client IP extraction, and normalizes
 * fallback `/.netlify/functions/api/*` redirect paths back to `/api/*`.
 */
export async function invokeExpressNetlifyBridge(
  req: Request,
  _context?: Context
): Promise<Response> {
  const url = new URL(req.url);
  const normalizedPath = normalizeNetlifyPath(url.pathname);
  const pathWithQuery = `${normalizedPath}${url.search}`;
  const method = req.method.toUpperCase();

  let bodyBuf = Buffer.alloc(0);
  if (method !== 'GET' && method !== 'HEAD') {
    const ab = await req.arrayBuffer();
    bodyBuf = Buffer.from(ab);
  }

  return await new Promise<Response>((resolve, reject) => {
    const headersRecord: Record<string, string> = {};
    req.headers.forEach((val, key) => {
      headersRecord[key.toLowerCase()] = val;
    });
    if (
      bodyBuf.length > 0 &&
      !headersRecord['content-length'] &&
      !headersRecord['transfer-encoding']
    ) {
      headersRecord['content-length'] = String(bodyBuf.length);
    }

    const rawResponseHeaders = new Map<string, string | string[]>();
    const responseChunks: Buffer[] = [];
    let statusCode = 200;
    let settled = false;

    const mockReq = new Readable({
      autoDestroy: false,
      read() {},
    }) as unknown as IncomingMessage & {
      body?: unknown;
      ip?: string;
      originalUrl?: string;
    };
    mockReq.httpVersion = '1.1';
    mockReq.method = method;
    mockReq.url = pathWithQuery;
    mockReq.originalUrl = pathWithQuery;
    mockReq.headers = headersRecord;
    const clientIp =
      headersRecord['x-nf-client-connection-ip'] ||
      headersRecord['x-forwarded-for']?.split(',')[0]?.trim() ||
      '127.0.0.1';
    mockReq.ip = clientIp;
    (
      mockReq as unknown as {
        socket: {
          remoteAddress: string;
          destroy: () => void;
          writable: boolean;
          readable: boolean;
        };
      }
    ).socket = {
      remoteAddress: clientIp,
      destroy: () => {},
      writable: true,
      readable: true,
    };

    const mockRes = new EventEmitter() as unknown as ServerResponse & {
      statusCode: number;
      headersSent: boolean;
    };
    mockRes.statusCode = 200;
    mockRes.headersSent = false;

    const setHeaderImpl = (
      name: string,
      value: number | string | readonly string[]
    ) => {
      const lower = name.toLowerCase();
      if (Array.isArray(value)) {
        rawResponseHeaders.set(lower, value.map(String));
      } else {
        rawResponseHeaders.set(lower, String(value));
      }
      return mockRes;
    };

    mockRes.setHeader = setHeaderImpl as ServerResponse['setHeader'];
    mockRes.getHeader = ((name: string) =>
      rawResponseHeaders.get(name.toLowerCase())) as ServerResponse['getHeader'];
    mockRes.getHeaders = (() =>
      Object.fromEntries(rawResponseHeaders.entries())) as ServerResponse['getHeaders'];
    mockRes.hasHeader = ((name: string) =>
      rawResponseHeaders.has(name.toLowerCase())) as ServerResponse['hasHeader'];
    mockRes.removeHeader = ((name: string) => {
      rawResponseHeaders.delete(name.toLowerCase());
    }) as ServerResponse['removeHeader'];
    mockRes.writeHead = ((
      code: number,
      headers?: Record<string, string | string[]>
    ) => {
      statusCode = code;
      mockRes.statusCode = code;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          setHeaderImpl(k, v);
        }
      }
      mockRes.headersSent = true;
      return mockRes;
    }) as ServerResponse['writeHead'];

    mockRes.write = ((chunk: unknown) => {
      if (chunk !== undefined && chunk !== null) {
        responseChunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
        );
      }
      return true;
    }) as ServerResponse['write'];

    mockRes.end = ((chunk?: unknown) => {
      if (settled) return mockRes;
      settled = true;
      if (chunk !== undefined && chunk !== null) {
        responseChunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
        );
      }
      statusCode = mockRes.statusCode || statusCode;
      const webHeaders = new Headers();
      for (const [k, v] of rawResponseHeaders.entries()) {
        if (Array.isArray(v)) {
          for (const item of v) webHeaders.append(k, item);
        } else {
          webHeaders.set(k, v);
        }
      }
      const finalBody =
        statusCode === 204 || method === 'HEAD'
          ? null
          : Buffer.concat(responseChunks);
      resolve(
        new Response(finalBody, {
          status: statusCode,
          headers: webHeaders,
        })
      );
      return mockRes;
    }) as ServerResponse['end'];

    try {
      (
        app as unknown as (
          req: IncomingMessage,
          res: ServerResponse,
          next: (err?: unknown) => void
        ) => void
      )(mockReq, mockRes, (err?: unknown) => {
        if (settled) return;
        if (err) {
          reject(err);
        } else {
          settled = true;
          resolve(
            new Response(JSON.stringify({ error: 'API route not found.' }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            })
          );
        }
      });

      queueMicrotask(() => {
        const readableReq = mockReq as unknown as Readable;
        if (bodyBuf.length > 0) {
          readableReq.push(bodyBuf);
        }
        readableReq.push(null);
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Netlify Lambda (`___netlify-bootstrap.mjs` `D.handler(event, context)`) bridge.
 * Converts an AWS Lambda / Netlify Event into a Web Request, executes `invokeExpressNetlifyBridge`,
 * and returns a structured `{ statusCode, headers, multiValueHeaders, body, isBase64Encoded }` result.
 */
export async function invokeExpressNetlifyLambdaEvent(
  event: NetlifyLambdaEvent,
  context?: Context
): Promise<NetlifyLambdaResult> {
  const headersInit = new Headers();
  if (event.headers) {
    for (const [k, v] of Object.entries(event.headers)) {
      if (typeof v === 'string') {
        headersInit.set(k, v);
      }
    }
  }
  if (!headersInit.has('cookie') && event.multiValueHeaders) {
    const multiCookies =
      event.multiValueHeaders.cookie || event.multiValueHeaders.Cookie;
    if (Array.isArray(multiCookies) && multiCookies.length > 0) {
      headersInit.set('cookie', multiCookies.filter(Boolean).join('; '));
    }
  }

  const host =
    headersInit.get('x-forwarded-host') ||
    headersInit.get('host') ||
    'marrok-content.netlify.app';
  const proto = headersInit.get('x-forwarded-proto') || 'https';

  let pathname = '/api/health';
  let search = '';

  if (event.rawUrl) {
    try {
      const parsed = new URL(event.rawUrl);
      pathname = parsed.pathname;
      search = parsed.search;
    } catch {
      // Fallback to event.path below
    }
  }

  if (event.path) {
    const normalizedEventPath = normalizeNetlifyPath(event.path);
    if (normalizedEventPath.startsWith('/api/') || pathname === '/api/health') {
      pathname = normalizedEventPath;
    }
  } else {
    pathname = normalizeNetlifyPath(pathname);
  }

  if (!search) {
    if (event.rawQuery) {
      search = `?${event.rawQuery.replace(/^\?/, '')}`;
    } else if (
      event.queryStringParameters &&
      Object.keys(event.queryStringParameters).length > 0
    ) {
      const usp = new URLSearchParams();
      for (const [k, v] of Object.entries(event.queryStringParameters)) {
        if (typeof v === 'string') usp.set(k, v);
      }
      const qs = usp.toString();
      if (qs) search = `?${qs}`;
    }
  }

  const fullUrl = `${proto}://${host}${pathname}${search}`;
  const method = (event.httpMethod || 'GET').toUpperCase();

  let bodyBytes: Uint8Array | undefined;
  if (method !== 'GET' && method !== 'HEAD' && typeof event.body === 'string' && event.body.length > 0) {
    bodyBytes = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'utf8');
  }

  const webReq = new Request(fullUrl, {
    method,
    headers: headersInit,
    ...(bodyBytes ? { body: bodyBytes as unknown as BodyInit } : {}),
  });

  const webRes = await invokeExpressNetlifyBridge(webReq, context);

  const responseHeaders: Record<string, string> = {};
  const multiValueHeaders: Record<string, string[]> = {};

  webRes.headers.forEach((val, key) => {
    responseHeaders[key] = val;
  });

  const getSetCookieFn = (
    webRes.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  const setCookies =
    typeof getSetCookieFn === 'function'
      ? getSetCookieFn.call(webRes.headers)
      : webRes.headers.get('set-cookie')
      ? [webRes.headers.get('set-cookie')!]
      : [];

  if (setCookies.length > 0) {
    responseHeaders['set-cookie'] = setCookies[0];
    multiValueHeaders['Set-Cookie'] = setCookies;
  }

  const ab = await webRes.arrayBuffer();
  const buf = Buffer.from(ab);
  const isBinary = isBinaryContentType(responseHeaders['content-type'] || '');

  return {
    statusCode: webRes.status,
    headers: responseHeaders,
    ...(Object.keys(multiValueHeaders).length > 0 ? { multiValueHeaders } : {}),
    body: isBinary ? buf.toString('base64') : buf.toString('utf8'),
    ...(isBinary ? { isBase64Encoded: true } : {}),
  };
}

function isWebRequestObject(input: unknown): input is Request {
  return (
    Boolean(input) &&
    typeof input === 'object' &&
    typeof (input as Request).arrayBuffer === 'function' &&
    typeof (input as Request).url === 'string'
  );
}

/**
 * Dual-mode Netlify handler compatible with BOTH:
 * - Netlify CJS/ESM `___netlify-bootstrap.mjs` (`D.handler(event, context)`)
 * - Netlify Functions v2 (`export default (req: Request, context: Context) => Promise<Response>`)
 */
export async function invokeUniversalNetlifyHandler(
  req: Request,
  context?: Context
): Promise<Response>;
export async function invokeUniversalNetlifyHandler(
  event: NetlifyLambdaEvent,
  context?: Context
): Promise<NetlifyLambdaResult>;
export async function invokeUniversalNetlifyHandler(
  reqOrEvent: Request | NetlifyLambdaEvent,
  context?: Context
): Promise<Response | NetlifyLambdaResult> {
  if (isWebRequestObject(reqOrEvent)) {
    return invokeExpressNetlifyBridge(reqOrEvent, context);
  }
  return invokeExpressNetlifyLambdaEvent(reqOrEvent, context);
}
