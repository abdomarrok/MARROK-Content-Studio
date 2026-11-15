import crypto from 'node:crypto';
import type pg from 'pg';
import { readRuntimeEnv } from './env.ts';

export const SESSION_COOKIE_NAME = '__Host-marrok_session';
export const DEFAULT_SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// Deterministic dummy hash used to preserve constant-time execution when user or hash format is invalid
const DUMMY_SALT = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
const DUMMY_DIGEST = crypto.scryptSync('invalid-dummy-password-placeholder', DUMMY_SALT, 64, {
  N: 16384,
  r: 8,
  p: 1,
});

export interface AuthConfigStatus {
  configured: boolean;
  username: string;
  passwordHash: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  missing: string[];
}

export interface SessionTokenPayload {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
}

interface LoginAttemptBucket {
  count: number;
  firstAttemptAt: number;
  lockedUntil: number;
}

const memoryLoginAttempts = new Map<string, LoginAttemptBucket>();
const memoryRevokedJtis = new Map<string, number>(); // jti -> expiresAtMs

export function resetAuthStateForTest(): void {
  memoryLoginAttempts.clear();
  memoryRevokedJtis.clear();
}

export function constantTimeEqualText(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(String(a || ''), 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(String(b || ''), 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Generates an scrypt password hash formatted cleanly as `scrypt$<saltHex>$<derivedHex>`.
 */
export function hashPasswordScrypt(password: string, customSaltHex?: string): string {
  const salt = customSaltHex
    ? Buffer.from(customSaltHex, 'hex')
    : crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored `scrypt$<saltHex>$<derivedHex>` hash
 * using Node native crypto.scryptSync and constant-time crypto.timingSafeEqual.
 */
export function verifyPasswordConstantTime(password: string, storedHash: string): boolean {
  const trimmed = (storedHash || '').trim();
  const parts = trimmed.split('$').filter(Boolean);

  let saltBuf = DUMMY_SALT;
  let expectedBuf = DUMMY_DIGEST;
  let validFormat = false;

  if (parts.length === 3 && parts[0].toLowerCase() === 'scrypt') {
    const saltCandidate = Buffer.from(parts[1], 'hex');
    const hashCandidate = Buffer.from(parts[2], 'hex');
    if (saltCandidate.length >= 8 && hashCandidate.length === 64) {
      saltBuf = saltCandidate;
      expectedBuf = hashCandidate;
      validFormat = true;
    }
  }

  const derived = crypto.scryptSync(String(password || ''), saltBuf, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  const matches = crypto.timingSafeEqual(derived, expectedBuf);
  return validFormat && matches;
}

export function getAuthConfigStatus(envOverride?: NodeJS.ProcessEnv): AuthConfigStatus {
  const username = readRuntimeEnv('ADMIN_USERNAME', envOverride);
  const passwordHash = readRuntimeEnv('ADMIN_PASSWORD_HASH', envOverride);
  const sessionSecret = readRuntimeEnv('SESSION_SECRET', envOverride);

  const missing: string[] = [];
  if (!username) missing.push('ADMIN_USERNAME');
  if (!passwordHash || !passwordHash.startsWith('scrypt$')) missing.push('ADMIN_PASSWORD_HASH');
  if (!sessionSecret || sessionSecret.length < 16) missing.push('SESSION_SECRET');

  const rawTtl = Number.parseInt(readRuntimeEnv('SESSION_TTL_SECONDS', envOverride) || '', 10);
  const sessionTtlSeconds =
    Number.isFinite(rawTtl) && rawTtl >= 300 && rawTtl <= 7 * 24 * 60 * 60
      ? rawTtl
      : DEFAULT_SESSION_TTL_SECONDS;

  return {
    configured: missing.length === 0,
    username,
    passwordHash,
    sessionSecret,
    sessionTtlSeconds,
    missing,
  };
}

function toBase64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64');
}

export function createSignedSessionToken(
  username: string,
  sessionSecret: string,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS,
  nowMs: number = Date.now()
): { token: string; payload: SessionTokenPayload } {
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + Math.max(60, ttlSeconds);
  const jti = crypto.randomUUID();
  const payload: SessionTokenPayload = { sub: username, iat, exp, jti };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', sessionSecret).update(encodedPayload).digest();
  return {
    token: `${encodedPayload}.${toBase64Url(sig)}`,
    payload,
  };
}

export function parseCookies(cookieHeader?: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const rawVal = pair.slice(idx + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(rawVal);
    } catch {
      cookies[key] = rawVal;
    }
  }
  return cookies;
}

export function serializeSessionCookie(
  token: string,
  maxAgeSeconds: number,
  options?: { partitionedIframe?: boolean }
): string {
  const safeMaxAge = Math.max(0, Math.floor(maxAgeSeconds));
  const sameSitePart = options?.partitionedIframe
    ? 'SameSite=None; Partitioned'
    : 'SameSite=Lax';
  // Strict __Host- prefix requirements: Path=/, Secure, no Domain attribute
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; ${sameSitePart}; Max-Age=${safeMaxAge}`;
}

export function serializeClearSessionCookie(options?: { partitionedIframe?: boolean }): string {
  const sameSitePart = options?.partitionedIframe
    ? 'SameSite=None; Partitioned'
    : 'SameSite=Lax';
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; ${sameSitePart}; Max-Age=0`;
}

function sweepExpiredRevocations(nowMs: number): void {
  if (memoryRevokedJtis.size < 100) return;
  for (const [jti, expMs] of memoryRevokedJtis.entries()) {
    if (expMs <= nowMs) memoryRevokedJtis.delete(jti);
  }
}

export async function revokeSessionToken(
  token: string,
  sessionSecret: string,
  pool?: pg.Pool | null
): Promise<void> {
  const verified = verifySignedSessionTokenSignatureOnly(token, sessionSecret);
  if (!verified) return;
  const expMs = verified.exp * 1000;
  memoryRevokedJtis.set(verified.jti, expMs);
  sweepExpiredRevocations(Date.now());

  if (pool) {
    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS auth_revoked_sessions (
          jti VARCHAR(96) PRIMARY KEY,
          expires_at TIMESTAMPTZ NOT NULL
        );`
      );
      await pool.query(
        `INSERT INTO auth_revoked_sessions (jti, expires_at)
         VALUES ($1, to_timestamp($2))
         ON CONFLICT (jti) DO NOTHING`,
        [verified.jti, verified.exp]
      );
      await pool.query(`DELETE FROM auth_revoked_sessions WHERE expires_at < NOW()`);
    } catch {
      // Non-fatal fallback to in-memory denylist
    }
  }
}

function verifySignedSessionTokenSignatureOnly(
  token: string,
  sessionSecret: string,
  nowMs: number = Date.now()
): SessionTokenPayload | null {
  if (!token || !sessionSecret) return null;
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const encodedPayload = token.slice(0, dotIdx);
  const encodedSig = token.slice(dotIdx + 1);
  if (!encodedPayload || !encodedSig) return null;

  let actualSig: Buffer;
  try {
    actualSig = fromBase64Url(encodedSig);
  } catch {
    return null;
  }
  const expectedSig = crypto.createHmac('sha256', sessionSecret).update(encodedPayload).digest();
  if (actualSig.length !== expectedSig.length || !crypto.timingSafeEqual(actualSig, expectedSig)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encodedPayload).toString('utf8')) as SessionTokenPayload;
    if (
      !parsed ||
      typeof parsed.sub !== 'string' ||
      typeof parsed.jti !== 'string' ||
      typeof parsed.exp !== 'number' ||
      typeof parsed.iat !== 'number'
    ) {
      return null;
    }
    if (nowMs >= parsed.exp * 1000) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function extractBearerSessionToken(authHeader?: string | null): string {
  if (!authHeader || typeof authHeader !== 'string') return '';
  const trimmed = authHeader.trim();
  if (!/^bearer\s+/i.test(trimmed)) return '';
  return trimmed.replace(/^bearer\s+/i, '').trim();
}

export async function verifySessionCookieValue(
  cookieHeader: string | undefined | null,
  config: AuthConfigStatus,
  pool?: pg.Pool | null,
  nowMs: number = Date.now(),
  authorizationHeader?: string | null
): Promise<SessionTokenPayload | null> {
  if (!config.configured) return null;
  const cookies = parseCookies(cookieHeader);
  const token = cookies[SESSION_COOKIE_NAME] || extractBearerSessionToken(authorizationHeader);
  if (!token) return null;

  const payload = verifySignedSessionTokenSignatureOnly(token, config.sessionSecret, nowMs);
  if (!payload) return null;

  if (!constantTimeEqualText(payload.sub, config.username)) {
    return null;
  }

  const revokedUntil = memoryRevokedJtis.get(payload.jti);
  if (revokedUntil && revokedUntil > nowMs) {
    return null;
  }

  if (pool) {
    try {
      const res = await pool.query(
        `SELECT 1 FROM auth_revoked_sessions WHERE jti = $1 AND expires_at > NOW() LIMIT 1`,
        [payload.jti]
      );
      if ((res.rowCount || 0) > 0) {
        memoryRevokedJtis.set(payload.jti, payload.exp * 1000);
        return null;
      }
    } catch {
      // Table may not exist yet before first logout; ignore cleanly
    }
  }

  return payload;
}

export async function checkLoginLockout(
  key: string,
  pool?: pg.Pool | null,
  nowMs: number = Date.now()
): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  const bucket = memoryLoginAttempts.get(key);
  if (bucket && bucket.lockedUntil > nowMs) {
    return {
      locked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.lockedUntil - nowMs) / 1000)),
    };
  }

  if (pool) {
    try {
      const res = await pool.query(
        `SELECT locked_until FROM auth_login_attempts WHERE attempt_key = $1 LIMIT 1`,
        [key]
      );
      const lockedUntilRaw = res.rows?.[0]?.locked_until;
      if (lockedUntilRaw) {
        const lockedUntilMs = new Date(lockedUntilRaw).getTime();
        if (lockedUntilMs > nowMs) {
          return {
            locked: true,
            retryAfterSeconds: Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 1000)),
          };
        }
      }
    } catch {
      // Table may not exist yet
    }
  }

  return { locked: false, retryAfterSeconds: 0 };
}

export async function recordFailedLoginAttempt(
  key: string,
  pool?: pg.Pool | null,
  nowMs: number = Date.now()
): Promise<{ locked: boolean; attemptsRemaining: number; retryAfterSeconds: number }> {
  const existing = memoryLoginAttempts.get(key);
  let count = 1;
  let firstAttemptAt = nowMs;

  if (existing && nowMs - existing.firstAttemptAt <= LOGIN_WINDOW_MS) {
    count = existing.count + 1;
    firstAttemptAt = existing.firstAttemptAt;
  }

  const locked = count >= LOGIN_MAX_ATTEMPTS;
  const lockedUntil = locked ? nowMs + LOGIN_LOCKOUT_MS : 0;
  memoryLoginAttempts.set(key, { count, firstAttemptAt, lockedUntil });

  if (pool) {
    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS auth_login_attempts (
          attempt_key VARCHAR(160) PRIMARY KEY,
          attempt_count INTEGER NOT NULL DEFAULT 0,
          first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          locked_until TIMESTAMPTZ
        );`
      );
      await pool.query(
        `INSERT INTO auth_login_attempts (attempt_key, attempt_count, first_attempt_at, locked_until)
         VALUES ($1, $2, to_timestamp($3 / 1000.0), ${locked ? 'to_timestamp($4 / 1000.0)' : 'NULL'})
         ON CONFLICT (attempt_key) DO UPDATE SET
           attempt_count = EXCLUDED.attempt_count,
           first_attempt_at = EXCLUDED.first_attempt_at,
           locked_until = EXCLUDED.locked_until`,
        locked ? [key, count, firstAttemptAt, lockedUntil] : [key, count, firstAttemptAt]
      );
    } catch {
      // Fallback to in-memory lockout tracking
    }
  }

  return {
    locked,
    attemptsRemaining: Math.max(0, LOGIN_MAX_ATTEMPTS - count),
    retryAfterSeconds: locked ? Math.ceil(LOGIN_LOCKOUT_MS / 1000) : 0,
  };
}

export async function clearLoginAttempts(key: string, pool?: pg.Pool | null): Promise<void> {
  memoryLoginAttempts.delete(key);
  if (pool) {
    try {
      await pool.query(`DELETE FROM auth_login_attempts WHERE attempt_key = $1`, [key]);
    } catch {
      // Ignore if table not initialized
    }
  }
}

export function isCronOrWebhookSecretAuthorized(
  pathname: string,
  headers: Record<string, string | string[] | undefined>,
  envOverride?: NodeJS.ProcessEnv
): boolean {
  const cleanPath = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  const headerValue = (name: string): string => {
    const raw = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(raw) ? String(raw[0] || '') : String(raw || '');
  };

  if (cleanPath === '/api/gather/autopilot' || cleanPath === '/gather/autopilot') {
    const expected = readRuntimeEnv('API_SHARED_SECRET', envOverride);
    const provided = headerValue('x-api-secret');
    return Boolean(expected && provided && constantTimeEqualText(provided, expected));
  }

  if (cleanPath === '/api/publish/cleanup-media' || cleanPath === '/publish/cleanup-media') {
    const expected = readRuntimeEnv('API_SHARED_SECRET', envOverride);
    const provided = headerValue('x-api-secret');
    return Boolean(expected && provided && constantTimeEqualText(provided, expected));
  }

  if (cleanPath === '/api/gather/telegram-webhook' || cleanPath === '/gather/telegram-webhook') {
    const expected = readRuntimeEnv('TELEGRAM_WEBHOOK_SECRET', envOverride);
    const provided = headerValue('x-telegram-bot-api-secret-token');
    return Boolean(expected && provided && constantTimeEqualText(provided, expected));
  }

  return false;
}
