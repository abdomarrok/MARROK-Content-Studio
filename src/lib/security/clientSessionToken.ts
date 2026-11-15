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
