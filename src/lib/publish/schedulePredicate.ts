import type { SavedPostRecord } from '../../types.ts';

/**
 * Shared overdue scheduled-to-posted eligibility predicate reused identically
 * across Client UI lifecycle classification, Server sweep handlers, and Netlify Scheduled Cron.
 */
export function hasPostDispatchedOrStagedMedia(post: SavedPostRecord): boolean {
  return (
    post.postStatus === 'posted' ||
    Boolean(post.cloudinaryPublicIds && post.cloudinaryPublicIds.length > 0) ||
    Boolean(post.bufferPostIds && post.bufferPostIds.length > 0) ||
    Boolean(post.zernioPostIds && post.zernioPostIds.length > 0)
  );
}

export function isPostUnapprovedAutomatedDraft(post: SavedPostRecord): boolean {
  return (
    post.humanApproved === false ||
    post.deck?.sourceMeta?.humanApproved === false
  );
}

/**
 * True ONLY when a scheduled post has passed its due timestamp, has NOT failed dispatch,
 * has human approval, and actually had media staged or remote post IDs dispatched.
 */
export function isEligibleOverduePromotion(
  post: SavedPostRecord,
  nowMs: number = Date.now()
): boolean {
  const scheduledMs = post.scheduledFor ? Date.parse(post.scheduledFor) : NaN;
  const isScheduleDue = Number.isFinite(scheduledMs) && nowMs >= scheduledMs;
  if (!isScheduleDue) return false;
  if (post.publishFailed) return false;
  if (isPostUnapprovedAutomatedDraft(post)) return false;
  if (!hasPostDispatchedOrStagedMedia(post)) return false;
  return post.postStatus !== 'posted' || Boolean(post.scheduledFor);
}
