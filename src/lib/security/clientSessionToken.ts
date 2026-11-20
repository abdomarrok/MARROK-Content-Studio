const SESSION_STORAGE_KEY = 'marrok_iframe_session_token_v1';
let memorySessionToken = '';

export function setClientSessionToken(token: string | null | undefined): void {
  const clean = typeof token === 'string' ? token.trim() : '';
  memorySessionToken = clean;
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    if (clean) {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, clean);
    } else {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors in restricted iframes
  }
}

export function getClientSessionToken(): string {
  if (memorySessionToken) return memorySessionToken;
  if (typeof window === 'undefined' || !window.sessionStorage) return '';
  try {
    const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY) || '';
    memorySessionToken = stored;
    return stored;
  } catch {
    return '';
  }
}

export function clearClientSessionToken(): void {
  setClientSessionToken('');
}

export function withClientAuthHeaders(
  headers?: Record<string, string>
): Record<string, string> {
  const base: Record<string, string> = { ...(headers || {}) };
  const token = getClientSessionToken();
  if (token && !base.Authorization && !base.authorization) {
    base.Authorization = `Bearer ${token}`;
  }
  return base;
}

export interface ClientAuthSessionResult {
  authenticated: boolean;
  authConfigured: boolean;
  warmingUp?: boolean;
  username?: string;
  error?: string;
}

export interface ClientLoginResult {
  ok: boolean;
  authConfigured: boolean;
  username?: string;
  error?: string;
}

function isHtmlPayload(res: Response, rawText: string): boolean {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) return true;
  const trimmed = rawText.trimStart();
  return /^<!doctype\b/i.test(trimmed) || /^<html\b/i.test(trimmed);
}

function tryParseJsonObject(rawText: string): Record<string, unknown> | null {
  if (!rawText || !rawText.trim()) return null;
  try {
    const parsed = JSON.parse(rawText);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function isExpressServerHealthy(): Promise<boolean> {
  try {
    const healthRes = await fetch('/api/health', {
      method: 'GET',
      cache: 'no-store',
    });
    const text = await healthRes.text();
    if (isHtmlPayload(healthRes, text)) return false;
    const json = tryParseJsonObject(text);
    return Boolean(healthRes.ok && json?.status === 'ok');
  } catch {
    return false;
  }
}

export async function checkClientAuthSession(): Promise<ClientAuthSessionResult> {
  try {
    const res = await fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'include',
      headers: withClientAuthHeaders(),
      cache: 'no-store',
    });
    const rawText = await res.text();
    if (isHtmlPayload(res, rawText)) {
      const healthy = await isExpressServerHealthy();
      if (healthy) {
        return {
          authenticated: false,
          authConfigured: false,
          error: 'Server authentication secrets are not configured on this deployment (HTTP 503).',
        };
      }
      return {
        authenticated: false,
        authConfigured: true,
        warmingUp: true,
      };
    }

    const data = tryParseJsonObject(rawText) || {};
    const authConfigured = data.authConfigured !== false && res.status !== 503;
    if (res.ok && data.authenticated === true) {
      return {
        authenticated: true,
        authConfigured: true,
        username: typeof data.username === 'string' && data.username ? data.username : 'admin',
      };
    }
    return {
      authenticated: false,
      authConfigured,
      error: typeof data.error === 'string' ? data.error : undefined,
    };
  } catch {
    return {
      authenticated: false,
      authConfigured: true,
    };
  }
}

export async function submitClientLogin(
  username: string,
  password: string
): Promise<ClientLoginResult> {
  const cleanUser = username.trim();
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: cleanUser,
      password,
    }),
  });

  const rawText = await res.text();
  if (isHtmlPayload(res, rawText)) {
    const healthy = await isExpressServerHealthy();
    if (healthy) {
      return {
        ok: false,
        authConfigured: false,
        error:
          'Server authentication secrets (ADMIN_USERNAME, ADMIN_PASSWORD_HASH, SESSION_SECRET) are not configured on this deployment.',
      };
    }
    return {
      ok: false,
      authConfigured: true,
      error: `Preview server is still warming up (HTTP ${res.status}). Please wait a few seconds and try again.`,
    };
  }

  const data = tryParseJsonObject(rawText);
  if (!data) {
    return {
      ok: false,
      authConfigured: res.status !== 503,
      error: `Unexpected server response (${res.status}).`,
    };
  }

  const authConfigured = res.status !== 503 && data.authConfigured !== false;
  if (!res.ok || data.authenticated !== true) {
    return {
      ok: false,
      authConfigured,
      error:
        typeof data.error === 'string' && data.error
          ? data.error
          : `Sign-in failed (${res.status}).`,
    };
  }

  if (typeof data.token === 'string' && data.token) {
    setClientSessionToken(data.token);
  }

  return {
    ok: true,
    authConfigured: true,
    username: typeof data.username === 'string' && data.username ? data.username : cleanUser,
  };
}

