import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  trackAndReplaceBlobUrl,
  revokeAllTrackedBlobUrls,
  getTrackedBlobUrlCount,
  findNonPersistableBlobVideoSlides,
} from '../lib/media/blobUrlRegistry.ts';
import { saveValidPost, VaultApiError } from '../lib/storage/postsVaultClient.ts';
import { validateAndBuildPostRecord } from '../../api/controllers/postsController.ts';
import { DEFAULT_STARTER_DECK } from '../lib/presets.ts';

describe('Phase B3.2 — Blob URL Lifecycle Revocation & Non-Persistable Video Guard', () => {
  let originalRevoke: typeof URL.revokeObjectURL | undefined;

  beforeEach(() => {
    revokeAllTrackedBlobUrls();
    originalRevoke = URL.revokeObjectURL;
  });

  afterEach(() => {
    revokeAllTrackedBlobUrls();
    if (originalRevoke) {
      URL.revokeObjectURL = originalRevoke;
    }
    vi.restoreAllMocks();
  });

  it('revokes superseded blob: URLs on replacement and revokes all tracked URLs on cleanup', () => {
    const revokeSpy = vi.fn();
    URL.revokeObjectURL = revokeSpy;

    const b1 = trackAndReplaceBlobUrl('', 'blob:https://marrok-content.netlify.app/clip-1');
    expect(b1).toBe('blob:https://marrok-content.netlify.app/clip-1');
    expect(getTrackedBlobUrlCount()).toBe(1);
    expect(revokeSpy).not.toHaveBeenCalled();

    // Attaching a second clip revokes the first blob URL cleanly
    trackAndReplaceBlobUrl(b1, 'blob:https://marrok-content.netlify.app/clip-2');
    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith('blob:https://marrok-content.netlify.app/clip-1');
    expect(getTrackedBlobUrlCount()).toBe(1);

    // Non-blob URLs (https:, data:) are never registered or passed to revokeObjectURL
    trackAndReplaceBlobUrl('https://cdn.example.com/clip.mp4', 'https://cdn.example.com/clip-2.mp4');
    expect(getTrackedBlobUrlCount()).toBe(1);
    expect(revokeSpy).toHaveBeenCalledTimes(1);

    // Unmount cleanup revokes remaining active blob URLs
    revokeAllTrackedBlobUrls();
    expect(revokeSpy).toHaveBeenCalledTimes(2);
    expect(revokeSpy).toHaveBeenCalledWith('blob:https://marrok-content.netlify.app/clip-2');
    expect(getTrackedBlobUrlCount()).toBe(0);
  });

  it('blocks saving a deck containing an ephemeral blob: videoUrl in both client Vault and server validation', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const blobDeck = {
      ...DEFAULT_STARTER_DECK,
      postFormat: 'single' as const,
      slides: [
        {
          ...DEFAULT_STARTER_DECK.slides[0],
          type: 'poster' as const,
          mediaType: 'video' as const,
          videoUrl: 'blob:https://marrok-content.netlify.app/ephemeral-demo',
          videoFileName: 'demo-clip.mp4',
        },
      ],
    };

    expect(findNonPersistableBlobVideoSlides(blobDeck)).toHaveLength(1);

    await expect(
      saveValidPost({
        deck: blobDeck,
        postStatus: 'validated',
        allowOverride: true,
      })
    ).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof VaultApiError &&
        err.status === 400 &&
        err.code === 'NON_PERSISTABLE_BLOB_VIDEO'
    );

    // Client-side guard stops before making an unnecessary network POST
    expect(fetchSpy).not.toHaveBeenCalled();

    // Server-side defense-in-depth also rejects blob: videoUrl payloads
    const serverCheck = validateAndBuildPostRecord({
      deck: blobDeck,
      postStatus: 'validated',
      allowOverride: true,
    });
    expect(serverCheck.ok).toBe(false);
    if (!serverCheck.ok) {
      expect(serverCheck.error).toMatch(/blob:/i);
    }
  });
});
