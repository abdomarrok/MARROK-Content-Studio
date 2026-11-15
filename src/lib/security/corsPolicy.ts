import { readRuntimeEnv, resolveDeployContext } from './env.ts';

export const PRODUCTION_NETLIFY_ORIGIN = 'https://marrok-content.netlify.app';

const DEV_LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8888',
  'http://127.0.0.1:8888',
];

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '*') return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export interface CorsEvaluationResult {
  allowed: boolean;
  allowOriginHeader: string | null;
  allowedOrigins: string[];
  reason?: string;
}

export function getAllowedOrigins(envOverride?: NodeJS.ProcessEnv): string[] {
  const set = new Set<string>();
  const context = resolveDeployContext(envOverride);

  // Explicit list configured via ALLOWED_ORIGINS or ALLOWED_ORIGIN (wildcard '*' is rejected)
  const rawList = [
    readRuntimeEnv('ALLOWED_ORIGINS', envOverride),
    readRuntimeEnv('ALLOWED_ORIGIN', envOverride),
    readRuntimeEnv('URL', envOverride),
    readRuntimeEnv('APP_URL', envOverride),
  ]
    .filter(Boolean)
    .join(',');

  for (const item of rawList.split(',')) {
    const norm = normalizeOrigin(item);
    if (norm) set.add(norm);
  }

  // Always allow primary production domain unless an explicit test overrides STRICT_CORS_REQUIRE_CONFIG
  const requireExplicitOnly =
    readRuntimeEnv('STRICT_CORS_REQUIRE_CONFIG', envOverride).toLowerCase() === 'true';
  if (!requireExplicitOnly) {
    set.add(PRODUCTION_NETLIFY_ORIGIN);
  }

  // Allow local development origins only outside production context
  if (context === 'dev' && !requireExplicitOnly) {
    for (const devOrigin of DEV_LOCAL_ORIGINS) {
      set.add(devOrigin);
    }
  }

  return Array.from(set);
}

/**
 * Evaluates an incoming Origin header against strict CORS rules.
 * - Rejects wildcard '*'.
 * - Fails closed when Origin is present and not on the explicit allowlist.
 * - Allows localhost ephemeral test ports only in local dev/test contexts when not explicitly restricted.
 */
export function evaluateCorsOrigin(
  requestOrigin: string | undefined | null,
  envOverride?: NodeJS.ProcessEnv
): CorsEvaluationResult {
  const allowedOrigins = getAllowedOrigins(envOverride);
  const rawOrigin = typeof requestOrigin === 'string' ? requestOrigin.trim() : '';

  if (!rawOrigin) {
    // Same-origin non-CORS or server-to-server request (browser fetches across origins always send Origin)
    return {
      allowed: true,
      allowOriginHeader: null,
      allowedOrigins,
    };
  }

  if (rawOrigin === '*') {
    return {
      allowed: false,
      allowOriginHeader: null,
      allowedOrigins,
      reason: 'Wildcard origin is disallowed.',
    };
  }

  const normalized = normalizeOrigin(rawOrigin);
  if (!normalized) {
    return {
      allowed: false,
      allowOriginHeader: null,
      allowedOrigins,
      reason: 'Malformed Origin header.',
    };
  }

  if (allowedOrigins.includes(normalized)) {
    return {
      allowed: true,
      allowOriginHeader: normalized,
      allowedOrigins,
    };
  }

  // Permit ephemeral http://localhost:<port> / http://127.0.0.1:<port> and AI Studio *.run.app preview in dev/test only
  const context = resolveDeployContext(envOverride);
  const requireExplicitOnly =
    readRuntimeEnv('STRICT_CORS_REQUIRE_CONFIG', envOverride).toLowerCase() === 'true';
  if (context === 'dev' && !requireExplicitOnly) {
    try {
      const parsed = new URL(normalized);
      const isLocalhost =
        parsed.protocol === 'http:' &&
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
      const isAiStudioPreview =
        parsed.protocol === 'https:' &&
        (parsed.hostname.endsWith('.run.app') || parsed.hostname === 'aistudio.google.com');
      if (isLocalhost || isAiStudioPreview) {
        return {
          allowed: true,
          allowOriginHeader: normalized,
          allowedOrigins,
        };
      }
    } catch {
      // Ignore parse failure
    }
  }

  // Permit Netlify branch/deploy-preview origins of marrok-content ONLY when explicitly enabled
  const previewBase = readRuntimeEnv('DEPLOY_PRIME_URL', envOverride);
  if (previewBase) {
    const previewNorm = normalizeOrigin(previewBase);
    if (previewNorm && previewNorm === normalized) {
      return {
        allowed: true,
        allowOriginHeader: normalized,
        allowedOrigins,
      };
    }
  }

  return {
    allowed: false,
    allowOriginHeader: null,
    allowedOrigins,
    reason: `Origin "${normalized}" is not in the CORS allowlist.`,
  };
}
