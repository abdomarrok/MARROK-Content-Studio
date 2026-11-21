import { describe, it, expect } from 'vitest';
import {
  StaleOutboxLeaseError,
  buildZernioIdempotencyIdentity,
  canRetryOutboxRecord,
  cancelLocalOutboxDispatchesForPost,
  checkpointLocalOutboxRecord,
  claimLocalOutboxDispatch,
  classifyProviderFailure,
  collectOutboxRemoteIds,
  computeOutboxAggregateState,
  computeRetryBackoffMs,
  createNewOutboxRecord,
  evaluateExistingOutboxClaim,
  finalizeOutboxRecord,
  isZernioOperationReconcilable,
  parseRetryAfterHeaderMs,
  reconcileInterruptedOperations,
  selectTargetsPendingExecution,
} from './publishOutbox.ts';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { PublishOutboxRecord } from '../../types.ts';

describe('Durable Publishing Outbox State Machine & Failure Classification', () => {
  it('classifies external provider failures vs local persistence errors accurately', () => {
    expect(classifyProviderFailure({ statusCode: 429, message: 'Too many requests' })).toMatchObject({
      category: 'rate_limited',
      retryable: true,
    });
    expect(classifyProviderFailure({ statusCode: 502, message: 'Bad gateway' })).toMatchObject({
      category: 'upstream_5xx',
      retryable: true,
    });
    expect(classifyProviderFailure({ isTimeout: true, message: 'AbortError: timeout' })).toMatchObject({
      category: 'timeout_interrupted',
      retryable: true,
    });
    expect(classifyProviderFailure({ isNetworkError: true, message: 'fetch failed ECONNRESET' })).toMatchObject({
      category: 'transient_network',
      retryable: true,
    });
    expect(classifyProviderFailure({ statusCode: 401, message: 'Unauthorized token' })).toMatchObject({
      category: 'auth_config',
      retryable: false,
    });
    expect(classifyProviderFailure({ statusCode: 400, message: 'Invalid media aspect ratio' })).toMatchObject({
      category: 'validation_permanent',
      retryable: false,
    });
    expect(classifyProviderFailure({ isLocalError: true, message: 'Neon Postgres timeout' })).toMatchObject({
      category: 'local_persistence_error',
      retryable: true,
    });
  });

  it('transitions interrupted in-flight operations to outcome_unknown while preserving confirmed remote IDs and marking only reconcilable Zernio ops retryable', () => {
    const nowIso = '2026-11-21T12:00:00.000Z';
    const zernioIdem = buildZernioIdempotencyIdentity('fp_rec', 'tiktok');
    const reconciled = reconcileInterruptedOperations(
      {
        instagram: {
          service: 'instagram',
          provider: 'buffer',
          state: 'succeeded',
          attemptCount: 1,
          remotePostId: 'buf_ig_1',
          bufferPostId: 'buf_ig_1',
          updatedAt: nowIso,
          completedAt: nowIso,
        },
        facebook: {
          service: 'facebook',
          provider: 'buffer',
          state: 'dispatching',
          attemptCount: 1,
          updatedAt: nowIso,
        },
        tiktok: {
          service: 'tiktok',
          provider: 'zernio',
          state: 'dispatching',
          attemptCount: 1,
          idempotencyKey: zernioIdem.idempotencyKey,
          externalId: zernioIdem.externalId,
          updatedAt: nowIso,
        },
      },
      ['instagram', 'facebook', 'tiktok', 'linkedin'],
      nowIso
    );

    expect(reconciled.instagram?.state).toBe('succeeded');
    expect(reconciled.instagram?.bufferPostId).toBe('buf_ig_1');
    expect(reconciled.facebook?.state).toBe('outcome_unknown');
    expect(reconciled.facebook?.retryable).toBe(false);
    expect(reconciled.tiktok?.state).toBe('outcome_unknown');
    expect(reconciled.tiktok?.retryable).toBe(true);
    expect(reconciled.tiktok?.failureCategory).toBe('timeout_interrupted');
    expect(isZernioOperationReconcilable(reconciled.tiktok)).toBe(true);
    expect(isZernioOperationReconcilable(reconciled.facebook)).toBe(false);
    expect(reconciled.linkedin?.state).toBe('pending');
  });

  it('computes aggregate states and skips already-succeeded targets on retry', () => {
    const base = createNewOutboxRecord({
      postId: 'post_1',
      dispatchFingerprint: 'fp_abc',
      mode: 'shareNow',
      targets: ['instagram', 'tiktok'],
      payload: {
        caption: 'Hello',
        mode: 'shareNow',
        targets: ['instagram', 'tiktok'],
        imageUrls: ['https://cdn.example.com/1.jpg'],
        tiktokImageUrls: ['https://cdn.example.com/1_tt.jpg'],
        cloudinaryPublicIds: ['p1'],
      },
      leaseOwner: 'worker_1',
      nowMs: Date.parse('2026-11-21T12:00:00.000Z'),
    });

    const partialRecord: PublishOutboxRecord = finalizeOutboxRecord(
      {
        ...base,
        operations: {
          instagram: {
            service: 'instagram',
            provider: 'buffer',
            state: 'succeeded',
            attemptCount: 1,
            remotePostId: 'buf_99',
            bufferPostId: 'buf_99',
            updatedAt: '2026-11-21T12:00:05.000Z',
            completedAt: '2026-11-21T12:00:05.000Z',
          },
          tiktok: {
            service: 'tiktok',
            provider: 'zernio',
            state: 'failed_retryable',
            attemptCount: 1,
            failureCategory: 'upstream_5xx',
            retryable: true,
            statusCode: 503,
            errorMessage: 'Zernio unavailable',
            updatedAt: '2026-11-21T12:00:06.000Z',
          },
        },
      },
      { nowMs: Date.parse('2026-11-21T12:00:06.000Z') }
    );

    expect(partialRecord.state).toBe('partially_completed');
    expect(partialRecord.leaseOwner).toBeNull();
    expect(partialRecord.nextRetryAt).toBeTruthy();

    const selection = selectTargetsPendingExecution(partialRecord);
    expect(selection.alreadySucceeded).toEqual(['instagram']);
    expect(selection.toExecute).toEqual(['tiktok']);

    expect(collectOutboxRemoteIds(partialRecord.operations)).toEqual({
      bufferPostIds: ['buf_99'],
      zernioPostIds: [],
    });

    // Respects backoff unless ignoreBackoff = true
    expect(
      canRetryOutboxRecord(partialRecord, Date.parse('2026-11-21T12:00:10.000Z'), false)
    ).toBe(false);
    expect(
      canRetryOutboxRecord(partialRecord, Date.parse('2026-11-21T12:00:10.000Z'), true)
    ).toBe(true);
    expect(
      canRetryOutboxRecord(partialRecord, Date.parse('2026-11-21T12:05:00.000Z'), false)
    ).toBe(true);
  });

  it('enforces active leases, expired-lease takeover, and retry attempt limits on claim', () => {
    const startMs = Date.parse('2026-11-21T12:00:00.000Z');
    const initial = createNewOutboxRecord({
      postId: 'post_lease',
      dispatchFingerprint: 'fp_lease',
      mode: 'customScheduled',
      targets: ['instagram', 'linkedin'],
      payload: {
        caption: 'Scheduled',
        mode: 'customScheduled',
        targets: ['instagram', 'linkedin'],
        imageUrls: ['https://cdn.example.com/1.jpg'],
        tiktokImageUrls: [],
        cloudinaryPublicIds: [],
      },
      leaseOwner: 'worker_A',
      leaseDurationMs: 60_000,
      maxAttempts: 2,
      nowMs: startMs,
    });

    // Different worker cannot steal an unexpired lease
    const conflictClaim = evaluateExistingOutboxClaim(initial, {
      postId: 'post_lease',
      dispatchFingerprint: 'fp_lease',
      mode: 'customScheduled',
      targets: ['instagram', 'linkedin'],
      payload: initial.payload,
      leaseOwner: 'worker_B',
      maxAttempts: 2,
      nowMs: startMs + 30_000,
    });
    expect(conflictClaim.status).toBe('in_flight');

    // After lease expires, worker_B reclaims it safely
    const takeoverClaim = evaluateExistingOutboxClaim(initial, {
      postId: 'post_lease',
      dispatchFingerprint: 'fp_lease',
      mode: 'customScheduled',
      targets: ['instagram', 'linkedin'],
      payload: initial.payload,
      leaseOwner: 'worker_B',
      maxAttempts: 2,
      nowMs: startMs + 65_000,
    });
    expect(takeoverClaim.status).toBe('claimed');
    if (takeoverClaim.status === 'claimed') {
      expect(takeoverClaim.recoveredFromInterrupt).toBe(true);
      expect(takeoverClaim.record.attemptCount).toBe(2);

      // Once attemptCount hits maxAttempts (2) and fails again, further claims stop
      const exhausted = finalizeOutboxRecord({
        ...takeoverClaim.record,
        operations: {
          instagram: {
            service: 'instagram',
            provider: 'buffer',
            state: 'failed_retryable',
            attemptCount: 2,
            failureCategory: 'upstream_5xx',
            retryable: true,
            updatedAt: new Date(startMs + 70_000).toISOString(),
          },
          linkedin: {
            service: 'linkedin',
            provider: 'buffer',
            state: 'failed_retryable',
            attemptCount: 2,
            failureCategory: 'upstream_5xx',
            retryable: true,
            updatedAt: new Date(startMs + 70_000).toISOString(),
          },
        },
      });
      expect(exhausted.state).toBe('failed_permanent');
      expect(
        computeOutboxAggregateState(
          exhausted.operations,
          exhausted.targets,
          exhausted.attemptCount,
          exhausted.maxAttempts
        )
      ).toBe('failed_permanent');

      const blockedClaim = evaluateExistingOutboxClaim(exhausted, {
        postId: 'post_lease',
        dispatchFingerprint: 'fp_lease',
        mode: 'customScheduled',
        targets: ['instagram', 'linkedin'],
        payload: initial.payload,
        leaseOwner: 'worker_C',
        maxAttempts: 2,
        nowMs: startMs + 120_000,
      });
      expect(blockedClaim.status).toBe('permanent_or_exhausted');
    }
  });

  it('parses Retry-After seconds/dates and applies bounded jitter to exponential backoff', () => {
    const nowMs = Date.parse('2026-11-21T12:00:00.000Z');
    expect(parseRetryAfterHeaderMs('45', nowMs)).toBe(45_000);
    expect(parseRetryAfterHeaderMs('Sat, 21 Nov 2026 12:02:00 GMT', nowMs)).toBe(120_000);
    expect(parseRetryAfterHeaderMs('invalid-date', nowMs)).toBeUndefined();

    expect(computeRetryBackoffMs(1, 'upstream_5xx', { retryAfterMs: 90_000 })).toBe(90_000);
    for (let i = 0; i < 10; i++) {
      const jittered = computeRetryBackoffMs(1, 'rate_limited', { jitter: true });
      expect(jittered).toBeGreaterThanOrEqual(51_000); // 60_000 * 0.85
      expect(jittered).toBeLessThanOrEqual(69_000); // 60_000 * 1.15
    }
  });

  it('rejects stale leaseGeneration checkpoints and cancelled-dispatch checkpoints with StaleOutboxLeaseError', async () => {
    const tmpStorage = path.join(os.tmpdir(), `marrok-fencing-test-${Date.now()}.json`);
    const env = { POSTS_STORAGE_FILE: tmpStorage } as NodeJS.ProcessEnv;

    try {
      const t0 = Date.parse('2026-11-21T12:00:00.000Z');
      const payload = {
        postId: 'post_fence_1',
        caption: 'Fence test',
        mode: 'shareNow' as const,
        targets: ['instagram' as const],
        imageUrls: ['https://cdn.example.com/1.jpg'],
        tiktokImageUrls: [],
        cloudinaryPublicIds: [],
      };

      const claimA = await claimLocalOutboxDispatch(
        {
          postId: 'post_fence_1',
          dispatchFingerprint: 'fp_fence_1',
          mode: 'shareNow',
          targets: ['instagram'],
          payload,
          leaseOwner: 'worker_A',
          leaseDurationMs: 30_000,
          nowMs: t0,
        },
        env
      );
      expect(claimA.status).toBe('claimed');
      if (claimA.status !== 'claimed') return;
      expect(claimA.record.leaseGeneration).toBe(1);

      // Even cancelExistingBeforeDispatch=true cannot steal an unexpired active lease for the same postId
      const blockedSteal = await claimLocalOutboxDispatch(
        {
          postId: 'post_fence_1',
          dispatchFingerprint: 'fp_fence_other',
          mode: 'shareNow',
          targets: ['instagram'],
          payload,
          leaseOwner: 'worker_B',
          cancelExistingBeforeDispatch: true,
          nowMs: t0 + 5_000,
        },
        env
      );
      expect(blockedSteal.status).toBe('in_flight');

      // After expiry, worker_C claims generation 2
      const claimC = await claimLocalOutboxDispatch(
        {
          postId: 'post_fence_1',
          dispatchFingerprint: 'fp_fence_1',
          mode: 'shareNow',
          targets: ['instagram'],
          payload,
          leaseOwner: 'worker_C',
          leaseDurationMs: 30_000,
          nowMs: t0 + 40_000,
        },
        env
      );
      expect(claimC.status).toBe('claimed');
      if (claimC.status !== 'claimed') return;
      expect(claimC.record.leaseGeneration).toBe(2);

      // Stale worker_A checkpoint (generation 1) MUST throw StaleOutboxLeaseError
      await expect(
        checkpointLocalOutboxRecord(
          { ...claimA.record, state: 'failed_retryable' },
          env
        )
      ).rejects.toBeInstanceOf(StaleOutboxLeaseError);

      // Cancelling post increments generation and blocks worker_C checkpointing 'completed'
      await cancelLocalOutboxDispatchesForPost('post_fence_1', env);
      await expect(
        checkpointLocalOutboxRecord(
          { ...claimC.record, state: 'completed' },
          env
        )
      ).rejects.toBeInstanceOf(StaleOutboxLeaseError);
    } finally {
      await fs.unlink(`${tmpStorage}.outbox.json`).catch(() => undefined);
    }
  });
});
