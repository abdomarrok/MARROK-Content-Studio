import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@netlify/functions';
import { app } from '../../../api/index.ts';

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
  let normalizedPath = url.pathname;
  if (normalizedPath.startsWith('/.netlify/functions/api/')) {
    normalizedPath = `/api/${normalizedPath.slice('/.netlify/functions/api/'.length)}`;
  } else if (normalizedPath === '/.netlify/functions/api') {
    normalizedPath = '/api/health';
  }
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
