import type { CarouselData } from '../../types.ts';

const activeBlobUrls = new Set<string>();

export function isBlobObjectUrl(url: unknown): url is string {
  return typeof url === 'string' && url.trim().toLowerCase().startsWith('blob:');
}

export function trackBlobUrl(url: unknown): string {
  if (!isBlobObjectUrl(url)) return typeof url === 'string' ? url : '';
  const normalized = url.trim();
  activeBlobUrls.add(normalized);
  return normalized;
}

export function revokeBlobUrl(url: unknown): void {
  if (!isBlobObjectUrl(url)) return;
  const normalized = url.trim();
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    try {
      URL.revokeObjectURL(normalized);
    } catch {
      // Ignore already-revoked or invalid blob URLs
    }
  }
  activeBlobUrls.delete(normalized);
}

/**
 * Revokes an older session blob URL (if different from nextUrl) and registers the new blob URL
 * so temporary browser object URLs never leak across repeated video uploads.
 */
export function trackAndReplaceBlobUrl(prevUrl: unknown, nextUrl: unknown): string {
  const prevClean = typeof prevUrl === 'string' ? prevUrl.trim() : '';
  const nextClean = typeof nextUrl === 'string' ? nextUrl.trim() : '';

  if (prevClean && prevClean !== nextClean) {
    revokeBlobUrl(prevClean);
  }
  if (isBlobObjectUrl(nextClean)) {
    activeBlobUrls.add(nextClean);
  }
  return nextClean;
}

export function revokeAllTrackedBlobUrls(): void {
  const urls = Array.from(activeBlobUrls);
  for (const url of urls) {
    revokeBlobUrl(url);
  }
}

export function getTrackedBlobUrlCount(): number {
  return activeBlobUrls.size;
}

export interface NonPersistableBlobVideoSlide {
  slideIndex: number;
  videoUrl: string;
  fileName?: string;
}

/**
 * Detects slides holding ephemeral browser `blob:` video URLs that expire on tab reload
 * and cannot be persisted to PostgreSQL/IndexedDB or dispatched to social APIs.
 */
export function findNonPersistableBlobVideoSlides(
  deck: Pick<CarouselData, 'slides'> | null | undefined
): NonPersistableBlobVideoSlide[] {
  if (!deck || !Array.isArray(deck.slides)) return [];
  const matches: NonPersistableBlobVideoSlide[] = [];
  deck.slides.forEach((slide, idx) => {
    if (isBlobObjectUrl(slide?.videoUrl)) {
      matches.push({
        slideIndex: idx,
        videoUrl: slide.videoUrl.trim(),
        fileName: slide.videoFileName,
      });
    }
  });
  return matches;
}
