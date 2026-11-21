import { createRequestDeadline } from './requestDeadline.ts';

export class HttpClientError extends Error {
  readonly status: number;
  readonly url: string;
  readonly isHtmlResponse: boolean;
  readonly bodySnippet?: string;

  constructor(
    message: string,
    options: {
      status: number;
      url: string;
      isHtmlResponse?: boolean;
      bodySnippet?: string;
    }
  ) {
    super(message);
    this.name = 'HttpClientError';
    this.status = options.status;
    this.url = options.url;
    this.isHtmlResponse = Boolean(options.isHtmlResponse);
    this.bodySnippet = options.bodySnippet;
  }
}

export interface FetchJsonOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  redirect?: RequestRedirect;
  contextLabel?: string;
}

function isHtmlPayload(contentType: string, rawText: string): boolean {
  if (contentType.toLowerCase().includes('text/html')) return true;
  const trimmed = rawText.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html');
}

function extractErrorMessage(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.error === 'string' && record.error.trim()) return record.error.trim();
  if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
  return null;
}

/**
 * Shared isomorphic JSON fetch helper with bounded deadline, HTML error-page detection,
 * and structured error reporting. Safe for both Node API controllers and browser clients.
 */
export async function fetchJsonWithTimeout<T>(
  url: string,
  options: FetchJsonOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 10_000,
    signal,
    redirect,
    contextLabel,
  } = options;

  const label = contextLabel || url;
  const deadline = createRequestDeadline(signal, timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...headers,
      },
      ...(body !== undefined ? { body } : {}),
      ...(redirect ? { redirect } : {}),
      signal: deadline.signal,
    });

    const contentType = res.headers?.get?.('content-type') || '';
    const rawText = await res.text();

    if (isHtmlPayload(contentType, rawText)) {
      throw new HttpClientError(
        `${label} received an HTML response instead of JSON (HTTP ${res.status})`,
        {
          status: res.status,
          url,
          isHtmlResponse: true,
          bodySnippet: rawText.slice(0, 160),
        }
      );
    }

    if (!rawText.trim()) {
      if (!res.ok) {
        throw new HttpClientError(`${label} failed with HTTP ${res.status}`, {
          status: res.status,
          url,
        });
      }
      return {} as T;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      throw new HttpClientError(
        `${label} returned invalid JSON (HTTP ${res.status})`,
        {
          status: res.status,
          url,
          bodySnippet: rawText.slice(0, 160),
        }
      );
    }

    if (!res.ok) {
      const serverMsg = extractErrorMessage(parsed);
      throw new HttpClientError(
        serverMsg || `${label} failed with HTTP ${res.status}`,
        {
          status: res.status,
          url,
          bodySnippet: rawText.slice(0, 160),
        }
      );
    }

    return parsed as T;
  } finally {
    deadline.cleanup();
  }
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  shouldRetry?: (err: unknown) => boolean;
}

export function isTransientHttpFailure(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return false;
  if (err instanceof Error && err.name === 'AbortError') return false;
  if (err instanceof HttpClientError) {
    if (err.isHtmlResponse) return true;
    return err.status === 429 || err.status === 500 || err.status === 502 || err.status === 503 || err.status === 504;
  }
  return true;
}

/**
 * Bounded exponential backoff helper strictly for **idempotent GET/read** operations.
 * Never wrap non-idempotent POST/publish mutations in automatic retries.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const retries = Math.max(0, options.retries ?? 2);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 150);
  const shouldRetry = options.shouldRetry ?? isTransientHttpFailure;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (attempt >= retries || !shouldRetry(err)) {
        throw err;
      }
      const delayMs = baseDelayMs * Math.pow(2, attempt);
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}
