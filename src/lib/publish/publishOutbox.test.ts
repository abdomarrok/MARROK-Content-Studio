import { describe, it, expect } from 'vitest';
import {
  canRetryOutboxRecord,
  classifyProviderFailure,
  collectOutboxRemoteIds,
  computeOutboxAggregateState,
  createNewOutboxRecord,
  evaluateExistingOutboxClaim,
  finalizeOutboxRecord,
  reconcileInterruptedOperations,
  selectTargetsPendingExecution,
} from './publishOutbox.ts';
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

  it('transitions interrupted in-flight operations to failed_retryable while preserving confirmed remote IDs', () => {
    const nowIso = '2026-11-21T12:00:00.000Z';
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
        tiktok: {
          service: 'tiktok',
          provider: 'zernio',
          state: 'dispatching',
          attemptCount: 1,
          updatedAt: nowIso,
        },
      },
      ['instagram', 'tiktok', 'linkedin'],
      nowIso
    );

    expect(reconciled.instagram?.state).toBe('succeeded');
    expect(reconciled.instagram?.bufferPostId).toBe('buf_ig_1');
    expect(reconciled.tiktok?.state).toBe('failed_retryable');
    expect(reconciled.tiktok?.failureCategory).toBe('timeout_interrupted');
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
});
