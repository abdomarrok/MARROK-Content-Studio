import { createRequestDeadline } from './requestDeadline.ts';
import { withClientAuthHeaders } from '../security/clientSessionToken.ts';

export class HttpClientError extends Error {
  readonly status: number;
  readonly url: string;
  readonly isHtmlResponse: boolean;
  readonly bodySnippet?: string;
  readonly code?: string;
  readonly data?: unknown;

  constructor(
    message: string,
    options: {
      status: number;
      url: string;
      isHtmlResponse?: boolean;
      bodySnippet?: string;
      code?: string;
      data?: unknown;
    }
  ) {
    super(message);
    this.name = 'HttpClientError';
    this.status = options.status;
    this.url = options.url;
    this.isHtmlResponse = Boolean(options.isHtmlResponse);
    this.bodySnippet = options.bodySnippet;
    this.code = options.code;
    this.data = options.data;
  }
}

export interface FetchJsonOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  redirect?: RequestRedirect;
  credentials?: RequestCredentials;
  cache?: RequestCache;
  contextLabel?: string;
}

export interface FetchAuthedJsonOptions extends Omit<FetchJsonOptions, 'body'> {
  body?: string | object;
  includeGeminiKeys?: boolean;
  retries?: number;
  retryDelayMs?: number;
}

function isHtmlPayload(contentType: string, rawText: string): boolean {
  if (contentType.toLowerCase().includes('text/html')) return true;
  const trimmed = rawText.trimStart().toLowerCase();
  return (
    trimmed.startsWith('<!doctype html') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<head')
  );
}

function extractErrorDetails(parsed: unknown): { message: string | null; code?: string } {
  if (!parsed || typeof parsed !== 'object') return { message: null };
  const record = parsed as Record<string, unknown>;
  const code = typeof record.code === 'string' && record.code.trim() ? record.code.trim() : undefined;
  const baseMsg =
    typeof record.error === 'string' && record.error.trim()
      ? record.error.trim()
      : typeof record.message === 'string' && record.message.trim()
      ? record.message.trim()
      : null;

  if (!baseMsg) return { message: null, code };

  const details =
    Array.isArray(record.details) && typeof record.details[0] === 'string' && record.details[0].trim()
      ? ` (${record.details[0].trim()})`
      : '';
  return { message: `${baseMsg}${details}`, code };
}

/**
 * Safely reads optional user-supplied Gemini API keys from browser localStorage
 * for forwarding to server AI proxy routes.
 */
export function getCustomGeminiHeaders(): Record<string, string> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const headers: Record<string, string> = {};
    const customKey = window.localStorage.getItem('marrok_custom_gemini_key')?.trim();
    const backupKey = window.localStorage.getItem('marrok_custom_gemini_backup_key')?.trim();
    if (customKey) headers['x-gemini-key'] = customKey;
    if (backupKey) headers['x-gemini-backup-key'] = backupKey;
    return headers;
  } catch {
    // Intentional guard for restricted private-browsing / iframe storage environments
    return {};
  }
}

/**
 * Shared isomorphic JSON fetch helper with bounded AbortController deadline,
 * HTML error-page detection, and structured error reporting.
 * Safe for both Node API controllers and browser clients.
 */
export async function fetchJsonWithTimeout<T>(
  url: string,
  options: FetchJsonOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 15_000,
    signal,
    redirect,
    credentials,
    cache,
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
      ...(credentials ? { credentials } : {}),
      ...(cache ? { cache } : {}),
      signal: deadline.signal,
    });

    const contentType = res.headers?.get?.('content-type') || '';
    let rawText = '';
    if (typeof res.text === 'function') {
      rawText = await res.text();
    } else if (typeof res.json === 'function') {
      const direct = await res.json();
      rawText = direct === undefined ? '' : JSON.stringify(direct);
    }

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
      const { message: serverMsg, code } = extractErrorDetails(parsed);
      throw new HttpClientError(
        serverMsg || `${label} failed with HTTP ${res.status}`,
        {
          status: res.status,
          url,
          bodySnippet: rawText.slice(0, 160),
          code,
          data: parsed,
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
  if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return false;
  }
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return false;
  }
  if (err instanceof HttpClientError) {
    // Never retry any 4xx client/auth/not-found/conflict/payload/validation response
    if (err.status >= 400 && err.status < 500) {
      return false;
    }
    if (err.isHtmlResponse) return true;
    return err.status === 500 || err.status === 502 || err.status === 503 || err.status === 504;
  }
  return true;
}

/**
 * Bounded exponential backoff helper strictly for **idempotent GET/read** operations.
 * Never retries 4xx client/auth errors or non-idempotent POST/publish mutations.
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

/**
 * Unified authenticated JSON fetch helper for MARROK browser clients.
 * Automatically includes `credentials: 'include'`, session Bearer auth headers,
 * optional custom Gemini key headers, and AbortController timeout cleanup.
 * Strictly never retries 4xx responses (401/403/404/409/413/422) so AuthGateModal
 * and serverless capability detection behave deterministically.
 */
export async function fetchAuthedJson<T>(
  url: string,
  options: FetchAuthedJsonOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeoutMs = 20_000,
    signal,
    redirect,
    credentials = 'include',
    cache,
    contextLabel,
    includeGeminiKeys = false,
    retries = 0,
    retryDelayMs = 200,
  } = options;

  const serializedBody =
    body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);

  const mergedHeaders = withClientAuthHeaders({
    ...(serializedBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(includeGeminiKeys ? getCustomGeminiHeaders() : {}),
    ...headers,
  });

  const execute = () =>
    fetchJsonWithTimeout<T>(url, {
      method,
      headers: mergedHeaders,
      body: serializedBody,
      timeoutMs,
      signal,
      redirect,
      credentials,
      cache,
      contextLabel,
    });

  if (retries > 0) {
    return withRetry(execute, {
      retries,
      baseDelayMs: retryDelayMs,
      shouldRetry: isTransientHttpFailure,
    });
  }

  return execute();
}
