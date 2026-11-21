import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  PublishDispatchState,
  PublishFailureCategory,
  PublishOutboxOperation,
  PublishOutboxPayloadSnapshot,
  PublishOutboxRecord,
  PublishOutboxSummary,
  PublishScheduleMode,
  PublishTargetPlatform,
} from '../../types.ts';

export const DEFAULT_OUTBOX_MAX_ATTEMPTS = 3;
export const DEFAULT_OUTBOX_LEASE_MS = 90_000;
const BASE_TRANSIENT_BACKOFF_MS = 15_000;
const BASE_RATE_LIMIT_BACKOFF_MS = 60_000;
const MAX_RETRY_BACKOFF_MS = 15 * 60_000;

export interface ProviderFailureClassification {
  category: PublishFailureCategory;
  retryable: boolean;
  reason: string;
}

export interface ClassifyProviderFailureInput {
  statusCode?: number;
  message?: string;
  isTimeout?: boolean;
  isNetworkError?: boolean;
  isLocalError?: boolean;
}

/**
 * Classifies an external publishing provider or local persistence failure so automated
 * recovery and retries never blindly re-submit permanent validation/auth errors.
 */
export function classifyProviderFailure(
  input: ClassifyProviderFailureInput
): ProviderFailureClassification {
  const msg = String(input.message || '').trim();
  const lower = msg.toLowerCase();
  const status = typeof input.statusCode === 'number' ? input.statusCode : undefined;

  if (input.isLocalError) {
    return {
      category: 'local_persistence_error',
      retryable: true,
      reason: msg || 'Local persistence or storage error after dispatch',
    };
  }

  if (
    input.isTimeout ||
    /\b(timeout|timed out|abort(ed)?|etimedout|lease expired|interrupted)\b/i.test(lower)
  ) {
    return {
      category: 'timeout_interrupted',
      retryable: true,
      reason: msg || 'Request or worker lease timed out before completion',
    };
  }

  if (
    status === 429 ||
    /\b(429|rate.?limit|too many requests|quota exceeded|throttled)\b/i.test(lower)
  ) {
    return {
      category: 'rate_limited',
      retryable: true,
      reason: msg || 'Provider rate limit encountered (HTTP 429)',
    };
  }

  if (
    (status !== undefined && status >= 500) ||
    /\bhttp 5\d\d\b|bad gateway|service unavailable|gateway timeout|upstream outage|internal server error/i.test(
      lower
    )
  ) {
    return {
      category: 'upstream_5xx',
      retryable: true,
      reason: msg || `Upstream provider server error (${status ?? '5xx'})`,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    /\b(401|403|unauthorized|forbidden|invalid api key|expired token|missing.*key|not configured)\b/i.test(
      lower
    )
  ) {
    return {
      category: 'auth_config',
      retryable: false,
      reason: msg || `Authentication or configuration error (${status ?? '401/403'})`,
    };
  }

  if (
    (status !== undefined && status >= 400 && status < 500) ||
    /\bhttp 4\d\d\b|validation|invalid input|mutationerror|unsupported|missing required|rejected|malformed/i.test(
      lower
    )
  ) {
    return {
      category: 'validation_permanent',
      retryable: false,
      reason: msg || `Permanent request validation error (${status ?? '4xx'})`,
    };
  }

  if (
    input.isNetworkError ||
    /\b(fetch failed|network error|econnreset|econnrefused|enotfound|ehostunreach|socket hang up)\b/i.test(
      lower
    )
  ) {
    return {
      category: 'transient_network',
      retryable: true,
      reason: msg || 'Transient network failure calling provider',
    };
  }

  return {
    category: 'unknown',
    retryable: false,
    reason: msg || 'Unclassified publishing error',
  };
}

export function computeRetryBackoffMs(
  attemptCount: number,
  category?: PublishFailureCategory | null
): number {
  const safeAttempt = Math.max(1, Math.floor(attemptCount || 1));
  const base =
    category === 'rate_limited' ? BASE_RATE_LIMIT_BACKOFF_MS : BASE_TRANSIENT_BACKOFF_MS;
  return Math.min(MAX_RETRY_BACKOFF_MS, base * 2 ** (safeAttempt - 1));
}

export function createInitialOutboxOperations(
  targets: PublishTargetPlatform[],
  nowIso: string = new Date().toISOString()
): Partial<Record<PublishTargetPlatform, PublishOutboxOperation>> {
  const ops: Partial<Record<PublishTargetPlatform, PublishOutboxOperation>> = {};
  for (const service of targets) {
    ops[service] = {
      service,
      provider: service === 'tiktok' ? 'zernio' : 'buffer',
      state: 'pending',
      attemptCount: 0,
      updatedAt: nowIso,
    };
  }
  return ops;
}

export function isOperationConfirmedSuccess(op?: PublishOutboxOperation): boolean {
  if (!op) return false;
  if (op.state === 'succeeded') {
    return Boolean(op.remotePostId || op.bufferPostId || op.zernioPostId);
  }
  return false;
}

/**
 * Transitions any stale 'dispatching' target operations left behind by a crashed worker
 * into 'failed_retryable' ('timeout_interrupted') while preserving already-confirmed
 * remote post IDs so retries never create duplicate external posts.
 */
export function reconcileInterruptedOperations(
  operations: Partial<Record<PublishTargetPlatform, PublishOutboxOperation>>,
  targets: PublishTargetPlatform[],
  nowIso: string = new Date().toISOString()
): Partial<Record<PublishTargetPlatform, PublishOutboxOperation>> {
  const next: Partial<Record<PublishTargetPlatform, PublishOutboxOperation>> = { ...operations };
  for (const service of targets) {
    const existing = next[service];
    if (!existing) {
      next[service] = {
        service,
        provider: service === 'tiktok' ? 'zernio' : 'buffer',
        state: 'pending',
        attemptCount: 0,
        updatedAt: nowIso,
      };
    } else if (existing.state === 'dispatching') {
      next[service] = {
        ...existing,
        state: 'failed_retryable',
        failureCategory: 'timeout_interrupted',
        retryable: true,
        errorMessage:
          existing.errorMessage ||
          'Worker lease expired before external provider response was persisted',
        updatedAt: nowIso,
      };
    }
  }
  return next;
}

export function computeOutboxAggregateState(
  operations: Partial<Record<PublishTargetPlatform, PublishOutboxOperation>>,
  targets: PublishTargetPlatform[],
  attemptCount: number,
  maxAttempts: number
): PublishDispatchState {
  const opList = targets
    .map((t) => operations[t])
    .filter((op): op is PublishOutboxOperation => Boolean(op));

  if (opList.length === 0) return 'completed';
  if (opList.some((op) => op.state === 'dispatching')) {
    return 'dispatching';
  }

  const hasSucceeded = opList.some((op) => op.state === 'succeeded');
  const hasSkippedFallback = opList.some((op) => op.state === 'skipped_fallback');
  const hasRetryableFailure = opList.some((op) => op.state === 'failed_retryable');
  const hasPermanentFailure = opList.some((op) => op.state === 'failed_permanent');
  const hasPending = opList.some((op) => op.state === 'pending');

  if (hasPending && !hasSucceeded && !hasSkippedFallback && !hasRetryableFailure && !hasPermanentFailure) {
    return 'pending';
  }

  if (!hasRetryableFailure && !hasPermanentFailure && !hasPending) {
    return 'completed';
  }

  if (hasSucceeded) {
    return 'partially_completed';
  }

  if (hasRetryableFailure && attemptCount < maxAttempts) {
    return 'failed_retryable';
  }

  return 'failed_permanent';
}

export function selectTargetsPendingExecution(
  record: PublishOutboxRecord,
  requestedTargets?: PublishTargetPlatform[],
  cancelExistingBeforeDispatch = false
): {
  toExecute: PublishTargetPlatform[];
  alreadySucceeded: PublishTargetPlatform[];
} {
  const targetList = requestedTargets && requestedTargets.length > 0 ? requestedTargets : record.targets;
  const toExecute: PublishTargetPlatform[] = [];
  const alreadySucceeded: PublishTargetPlatform[] = [];

  for (const service of targetList) {
    const op = record.operations[service];
    if (!cancelExistingBeforeDispatch && isOperationConfirmedSuccess(op)) {
      alreadySucceeded.push(service);
    } else {
      toExecute.push(service);
    }
  }

  return { toExecute, alreadySucceeded };
}

export function canRetryOutboxRecord(
  record: PublishOutboxRecord,
  nowMs: number = Date.now(),
  ignoreBackoff = false
): boolean {
  if (record.state === 'completed' || record.state === 'cancelled' || record.state === 'failed_permanent') {
    return false;
  }

  const leaseExpiresMs = record.leaseExpiresAt ? Date.parse(record.leaseExpiresAt) : NaN;
  const isLeaseExpired =
    record.state === 'dispatching' && Number.isFinite(leaseExpiresMs) && leaseExpiresMs <= nowMs;

  if (record.state === 'dispatching' && !isLeaseExpired) {
    return false;
  }

  if (record.attemptCount >= record.maxAttempts) {
    return false;
  }

  if (!ignoreBackoff && record.nextRetryAt) {
    const nextRetryMs = Date.parse(record.nextRetryAt);
    if (Number.isFinite(nextRetryMs) && nextRetryMs > nowMs) {
      return false;
    }
  }

  const hasRetryableOrPendingOp = record.targets.some((service) => {
    const op = record.operations[service];
    if (!op) return true;
    if (op.state === 'pending' || op.state === 'failed_retryable') return true;
    if (op.state === 'dispatching' && isLeaseExpired) return true;
    return false;
  });

  return hasRetryableOrPendingOp;
}

export function collectOutboxRemoteIds(
  operations: Partial<Record<PublishTargetPlatform, PublishOutboxOperation>>
): {
  bufferPostIds: string[];
  zernioPostIds: string[];
} {
  const bufferSet = new Set<string>();
  const zernioSet = new Set<string>();
  for (const op of Object.values(operations)) {
    if (!op) continue;
    if (op.bufferPostId) bufferSet.add(op.bufferPostId);
    if (op.zernioPostId) zernioSet.add(op.zernioPostId);
  }
  return {
    bufferPostIds: Array.from(bufferSet),
    zernioPostIds: Array.from(zernioSet),
  };
}

export function finalizeOutboxRecord(
  record: PublishOutboxRecord,
  options: { nowMs?: number; overrideErrorCategory?: PublishFailureCategory; overrideErrorMessage?: string } = {}
): PublishOutboxRecord {
  const nowMs = options.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const reconciledOps = reconcileInterruptedOperations(record.operations, record.targets, nowIso);
  const nextState = computeOutboxAggregateState(
    reconciledOps,
    record.targets,
    record.attemptCount,
    record.maxAttempts
  );

  const failedOps = record.targets
    .map((t) => reconciledOps[t])
    .filter(
      (op): op is PublishOutboxOperation =>
        Boolean(op && (op.state === 'failed_retryable' || op.state === 'failed_permanent'))
    );

  const primaryErrorOp =
    failedOps.find((op) => op.state === 'failed_retryable') || failedOps[0];

  const lastErrorCategory =
    options.overrideErrorCategory ||
    primaryErrorOp?.failureCategory ||
    null;
  const lastErrorMessage =
    options.overrideErrorMessage ||
    (failedOps.length > 0
      ? failedOps
          .map((op) => `${op.service}: ${op.errorMessage || 'Dispatch failed'}`)
          .join('; ')
      : null);

  const canScheduleRetry =
    (nextState === 'failed_retryable' ||
      (nextState === 'partially_completed' &&
        failedOps.some((op) => op.state === 'failed_retryable'))) &&
    record.attemptCount < record.maxAttempts;

  const nextRetryAt = canScheduleRetry
    ? new Date(nowMs + computeRetryBackoffMs(record.attemptCount, lastErrorCategory)).toISOString()
    : null;

  return {
    ...record,
    state: nextState,
    operations: reconciledOps,
    leaseOwner: null,
    leaseExpiresAt: null,
    nextRetryAt,
    lastErrorCategory,
    lastErrorMessage,
    updatedAt: nowIso,
    completedAt: nextState === 'completed' ? record.completedAt || nowIso : null,
  };
}

export function toOutboxSummary(record: PublishOutboxRecord): PublishOutboxSummary {
  return {
    dispatchId: record.id,
    dispatchFingerprint: record.dispatchFingerprint,
    state: record.state,
    attemptCount: record.attemptCount,
    maxAttempts: record.maxAttempts,
    nextRetryAt: record.nextRetryAt ?? null,
    lastErrorCategory: record.lastErrorCategory ?? null,
    lastErrorMessage: record.lastErrorMessage ?? null,
    operations: record.operations,
  };
}

// ---------------------------------------------------------------------------
// Local Disk Sidecar Fallback Store (when DATABASE_URL is unavailable)
// ---------------------------------------------------------------------------

export function resolveOutboxStorageFilePath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.POSTS_STORAGE_FILE && env.POSTS_STORAGE_FILE.trim()) {
    return `${env.POSTS_STORAGE_FILE.trim()}.outbox.json`;
  }
  return path.join(os.tmpdir(), 'marrok-publish-outbox.json');
}

const localFileMutexChain = new Map<string, Promise<unknown>>();

async function withLocalFileMutex<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const prev = localFileMutexChain.get(filePath) || Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  localFileMutexChain.set(filePath, next);
  try {
    return await next;
  } finally {
    if (localFileMutexChain.get(filePath) === next) {
      localFileMutexChain.delete(filePath);
    }
  }
}

async function readOutboxRecordsUnlocked(filePath: string): Promise<PublishOutboxRecord[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PublishOutboxRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeOutboxRecordsUnlocked(
  filePath: string,
  records: PublishOutboxRecord[]
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const trimmed = [...records]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 200);
  const tmpWritePath = `${filePath}.${process.pid}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  await fs.writeFile(tmpWritePath, JSON.stringify(trimmed, null, 2), 'utf-8');
  await fs.rename(tmpWritePath, filePath);
}

export interface ClaimOutboxDispatchParams {
  postId: string;
  dispatchFingerprint: string;
  mode: PublishScheduleMode;
  dueAt?: string;
  timezone?: string;
  targets: PublishTargetPlatform[];
  payload: PublishOutboxPayloadSnapshot;
  leaseOwner: string;
  leaseDurationMs?: number;
  maxAttempts?: number;
  cancelExistingBeforeDispatch?: boolean;
  nowMs?: number;
}

export type ClaimOutboxDispatchOutcome =
  | {
      status: 'claimed';
      record: PublishOutboxRecord;
      recoveredFromInterrupt: boolean;
    }
  | {
      status: 'already_completed';
      record: PublishOutboxRecord;
    }
  | {
      status: 'in_flight';
      record: PublishOutboxRecord;
    }
  | {
      status: 'permanent_or_exhausted';
      record: PublishOutboxRecord;
    };

export function createNewOutboxRecord(params: ClaimOutboxDispatchParams): PublishOutboxRecord {
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const leaseMs = params.leaseDurationMs ?? DEFAULT_OUTBOX_LEASE_MS;
  const leaseExpiresAt = new Date(nowMs + leaseMs).toISOString();
  return {
    id: `outbox_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
    postId: params.postId,
    dispatchFingerprint: params.dispatchFingerprint,
    state: 'dispatching',
    mode: params.mode,
    dueAt: params.dueAt,
    timezone: params.timezone,
    targets: params.targets,
    attemptCount: 1,
    maxAttempts: params.maxAttempts ?? DEFAULT_OUTBOX_MAX_ATTEMPTS,
    leaseOwner: params.leaseOwner,
    leaseExpiresAt,
    nextRetryAt: null,
    lastErrorCategory: null,
    lastErrorMessage: null,
    payload: params.payload,
    operations: createInitialOutboxOperations(params.targets, nowIso),
    createdAt: nowIso,
    updatedAt: nowIso,
    completedAt: null,
  };
}

export function evaluateExistingOutboxClaim(
  existing: PublishOutboxRecord,
  params: ClaimOutboxDispatchParams
): ClaimOutboxDispatchOutcome {
  const nowMs = params.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const leaseMs = params.leaseDurationMs ?? DEFAULT_OUTBOX_LEASE_MS;
  const leaseExpiresAt = new Date(nowMs + leaseMs).toISOString();

  if (params.cancelExistingBeforeDispatch) {
    const resetRecord: PublishOutboxRecord = {
      ...existing,
      id: `outbox_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
      state: 'dispatching',
      mode: params.mode,
      dueAt: params.dueAt,
      timezone: params.timezone,
      targets: params.targets,
      attemptCount: 1,
      maxAttempts: params.maxAttempts ?? existing.maxAttempts ?? DEFAULT_OUTBOX_MAX_ATTEMPTS,
      leaseOwner: params.leaseOwner,
      leaseExpiresAt,
      nextRetryAt: null,
      lastErrorCategory: null,
      lastErrorMessage: null,
      payload: params.payload,
      operations: createInitialOutboxOperations(params.targets, nowIso),
      updatedAt: nowIso,
      completedAt: null,
    };
    return { status: 'claimed', record: resetRecord, recoveredFromInterrupt: false };
  }

  if (existing.state === 'completed') {
    return { status: 'already_completed', record: existing };
  }

  const existingLeaseMs = existing.leaseExpiresAt ? Date.parse(existing.leaseExpiresAt) : NaN;
  const isActiveLease =
    existing.state === 'dispatching' &&
    Number.isFinite(existingLeaseMs) &&
    existingLeaseMs > nowMs &&
    existing.leaseOwner !== params.leaseOwner;

  if (isActiveLease) {
    return { status: 'in_flight', record: existing };
  }

  const isExpiredInterrupt =
    existing.state === 'dispatching' &&
    (!Number.isFinite(existingLeaseMs) || existingLeaseMs <= nowMs);

  const reconciledOps = isExpiredInterrupt
    ? reconcileInterruptedOperations(existing.operations, existing.targets, nowIso)
    : { ...existing.operations };

  for (const t of params.targets) {
    if (!reconciledOps[t]) {
      reconciledOps[t] = {
        service: t,
        provider: t === 'tiktok' ? 'zernio' : 'buffer',
        state: 'pending',
        attemptCount: 0,
        updatedAt: nowIso,
      };
    }
  }

  const maxAttempts = params.maxAttempts ?? existing.maxAttempts ?? DEFAULT_OUTBOX_MAX_ATTEMPTS;
  const hasAnyRetryableOrPendingTarget = params.targets.some((t) => {
    const op = reconciledOps[t];
    return !op || op.state === 'pending' || op.state === 'failed_retryable';
  });

  if (
    existing.state === 'failed_permanent' ||
    existing.attemptCount >= maxAttempts ||
    !hasAnyRetryableOrPendingTarget
  ) {
    return { status: 'permanent_or_exhausted', record: existing };
  }

  const mergedTargets = Array.from(new Set([...existing.targets, ...params.targets]));
  const claimed: PublishOutboxRecord = {
    ...existing,
    state: 'dispatching',
    mode: params.mode,
    dueAt: params.dueAt,
    timezone: params.timezone,
    targets: mergedTargets,
    attemptCount: existing.attemptCount + 1,
    maxAttempts,
    leaseOwner: params.leaseOwner,
    leaseExpiresAt,
    nextRetryAt: null,
    payload: params.payload,
    operations: reconciledOps,
    updatedAt: nowIso,
    completedAt: null,
  };

  return {
    status: 'claimed',
    record: claimed,
    recoveredFromInterrupt: isExpiredInterrupt,
  };
}

export async function claimLocalOutboxDispatch(
  params: ClaimOutboxDispatchParams,
  env: NodeJS.ProcessEnv = process.env
): Promise<ClaimOutboxDispatchOutcome> {
  const filePath = resolveOutboxStorageFilePath(env);
  const nowMs = params.nowMs ?? Date.now();
  return withLocalFileMutex(filePath, async () => {
    const records = await readOutboxRecordsUnlocked(filePath);

    // Check if another active dispatch holds a non-expired lease for the same postId
    const conflictingActive = records.find((r) => {
      if (r.postId !== params.postId) return false;
      if (r.dispatchFingerprint === params.dispatchFingerprint) return false;
      if (r.state !== 'dispatching') return false;
      const leaseMs = r.leaseExpiresAt ? Date.parse(r.leaseExpiresAt) : NaN;
      return Number.isFinite(leaseMs) && leaseMs > nowMs;
    });

    if (conflictingActive && !params.cancelExistingBeforeDispatch) {
      return { status: 'in_flight', record: conflictingActive };
    }

    const existingIdx = records.findIndex(
      (r) => r.dispatchFingerprint === params.dispatchFingerprint
    );

    if (existingIdx === -1) {
      const created = createNewOutboxRecord(params);
      const nextRecords = params.cancelExistingBeforeDispatch
        ? [
            created,
            ...records.map((r) =>
              r.postId === params.postId && r.state !== 'completed' && r.state !== 'cancelled'
                ? { ...r, state: 'cancelled' as PublishDispatchState, leaseOwner: null, leaseExpiresAt: null }
                : r
            ),
          ]
        : [created, ...records];
      await writeOutboxRecordsUnlocked(filePath, nextRecords);
      return { status: 'claimed', record: created, recoveredFromInterrupt: false };
    }

    const outcome = evaluateExistingOutboxClaim(records[existingIdx], params);
    if (outcome.status === 'claimed') {
      const nextRecords = [...records];
      nextRecords[existingIdx] = outcome.record;
      await writeOutboxRecordsUnlocked(filePath, nextRecords);
    }
    return outcome;
  });
}

export async function checkpointLocalOutboxRecord(
  record: PublishOutboxRecord,
  env: NodeJS.ProcessEnv = process.env
): Promise<PublishOutboxRecord> {
  const filePath = resolveOutboxStorageFilePath(env);
  return withLocalFileMutex(filePath, async () => {
    const records = await readOutboxRecordsUnlocked(filePath);
    const idx = records.findIndex(
      (r) => r.id === record.id || r.dispatchFingerprint === record.dispatchFingerprint
    );
    const nextRecords = [...records];
    if (idx === -1) {
      nextRecords.unshift(record);
    } else {
      nextRecords[idx] = record;
    }
    await writeOutboxRecordsUnlocked(filePath, nextRecords);
    return record;
  });
}

export async function queryLocalOutboxDispatches(
  options: { postId?: string; recoverableOnly?: boolean; nowMs?: number } = {},
  env: NodeJS.ProcessEnv = process.env
): Promise<PublishOutboxRecord[]> {
  const filePath = resolveOutboxStorageFilePath(env);
  const records = await withLocalFileMutex(filePath, async () =>
    readOutboxRecordsUnlocked(filePath)
  );
  const nowMs = options.nowMs ?? Date.now();
  return records.filter((r) => {
    if (options.postId && r.postId !== options.postId) return false;
    if (!options.recoverableOnly) return true;
    const leaseMs = r.leaseExpiresAt ? Date.parse(r.leaseExpiresAt) : NaN;
    const expiredDispatching =
      r.state === 'dispatching' && (!Number.isFinite(leaseMs) || leaseMs <= nowMs);
    return (
      r.state === 'partially_completed' ||
      r.state === 'failed_retryable' ||
      expiredDispatching
    );
  });
}

export async function cancelLocalOutboxDispatchesForPost(
  postId: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const filePath = resolveOutboxStorageFilePath(env);
  const nowIso = new Date().toISOString();
  await withLocalFileMutex(filePath, async () => {
    const records = await readOutboxRecordsUnlocked(filePath);
    let changed = false;
    const next = records.map((r) => {
      if (r.postId === postId && r.state !== 'cancelled' && r.state !== 'completed') {
        changed = true;
        return {
          ...r,
          state: 'cancelled' as PublishDispatchState,
          leaseOwner: null,
          leaseExpiresAt: null,
          nextRetryAt: null,
          updatedAt: nowIso,
        };
      }
      return r;
    });
    if (changed) {
      await writeOutboxRecordsUnlocked(filePath, next);
    }
  });
}
