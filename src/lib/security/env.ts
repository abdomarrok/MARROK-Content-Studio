/**
 * Runtime environment reader prioritizing Netlify.env.get() inside Netlify Functions
 * while preserving full compatibility with Node.js process.env and Vitest overrides.
 */

interface NetlifyEnvGlobal {
  Netlify?: {
    env?: {
      get?: (key: string) => string | undefined;
    };
  };
}

export type DeployContextKind = 'production' | 'deploy-preview' | 'branch-deploy' | 'dev';

export function readRuntimeEnv(key: string, envOverride?: NodeJS.ProcessEnv): string {
  if (envOverride && Object.prototype.hasOwnProperty.call(envOverride, key)) {
    const val = envOverride[key];
    return typeof val === 'string' ? val.trim() : '';
  }

  try {
    const netlifyGet = (globalThis as unknown as NetlifyEnvGlobal).Netlify?.env?.get;
    if (typeof netlifyGet === 'function') {
      const nVal = netlifyGet(key);
      if (typeof nVal === 'string' && nVal.trim().length > 0) {
        return nVal.trim();
      }
    }
  } catch {
    // Ignore global access errors in sandboxed runtimes
  }

  const pVal = typeof process !== 'undefined' && process.env ? process.env[key] : undefined;
  return typeof pVal === 'string' ? pVal.trim() : '';
}

export function resolveDeployContext(envOverride?: NodeJS.ProcessEnv): DeployContextKind {
  const rawContext = (
    readRuntimeEnv('DEPLOY_CONTEXT', envOverride) ||
    readRuntimeEnv('CONTEXT', envOverride) ||
    readRuntimeEnv('NETLIFY_CONTEXT', envOverride)
  ).toLowerCase();

  if (rawContext === 'production') return 'production';
  if (rawContext === 'deploy-preview' || rawContext === 'preview') return 'deploy-preview';
  if (rawContext === 'branch-deploy') return 'branch-deploy';

  const nodeEnv = readRuntimeEnv('NODE_ENV', envOverride).toLowerCase();
  const netlifyFlag = readRuntimeEnv('NETLIFY', envOverride).toLowerCase();
  const isDevServer = readRuntimeEnv('NETLIFY_DEV', envOverride).toLowerCase() === 'true';

  if (isDevServer || nodeEnv === 'test' || nodeEnv === 'development' || !nodeEnv) {
    return netlifyFlag === 'true' && nodeEnv === 'production' ? 'production' : 'dev';
  }
  if (nodeEnv === 'production') return 'production';
  return 'dev';
}

export function isDeployPreviewContext(envOverride?: NodeJS.ProcessEnv): boolean {
  const ctx = resolveDeployContext(envOverride);
  return ctx === 'deploy-preview' || ctx === 'branch-deploy';
}

export function isPreviewWriteBlocked(envOverride?: NodeJS.ProcessEnv): boolean {
  if (!isDeployPreviewContext(envOverride)) return false;
  return readRuntimeEnv('ALLOW_PREVIEW_WRITES', envOverride).toLowerCase() !== 'true';
}
