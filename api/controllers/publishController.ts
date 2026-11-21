import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type {
  BufferChannelInfo,
  PublishScheduleMode,
  PublishTargetPlatform,
  SavedPostRecord,
} from '../../src/types.ts';
import { getServerConfig, type ServerConfig } from '../config.ts';
import {
  deleteSingleStoredPost,
  loadStoredPosts,
  saveStoredPosts,
  upsertSingleStoredPost,
  validateAndBuildPostRecord,
} from './postsController.ts';
import {
  isEligibleOverduePromotion,
  isPostUnapprovedAutomatedDraft,
} from '../../src/lib/publish/schedulePredicate.ts';
import { stripLeadingDuplicateTikTokTitle } from '../../src/lib/publish/tiktokTitle.ts';
import { fetchJsonWithTimeout } from '../../src/lib/network/httpClient.ts';

const LOCAL_MEDIA_CACHE = new Map<string, { buffer: Buffer; createdAt: number }>();

/**
 * Default channel definitions matching the user's connected Buffer Free (3/3) and Metricool Free accounts.
 */
export const DEFAULT_CONNECTED_CHANNELS: BufferChannelInfo[] = [
  {
    id: '6acf76d3778b240e2f07701c',
    name: 'Instagram',
    service: 'instagram',
    handle: '@marrok_org',
    queuedCount: 0,
    queueLimit: 10,
    provider: 'buffer',
  },
  {
    id: '6acf780f778b240e2f07795c',
    name: 'Facebook Page',
    service: 'facebook',
    handle: 'Marrok (Algiers)',
    queuedCount: 0,
    queueLimit: 10,
    provider: 'buffer',
  },
  {
    id: '6acf76aa778b240e2f076ef0',
    name: 'LinkedIn Page',
    service: 'linkedin',
    handle: 'Marrok',
    queuedCount: 0,
    queueLimit: 10,
    provider: 'buffer',
  },
  {
    id: 'metricool_tt_marrok',
    name: 'TikTok',
    service: 'tiktok',
    handle: '@Marrok',
    queuedCount: 0,
    queueLimit: 20,
    provider: 'metricool',
  },
];

/**
 * Generates a Cloudinary SHA-1 signature for signed upload and destroy requests.
 * Sorts parameter keys alphabetically, formats as key=value&..., and appends apiSecret.
 */
export function signCloudinaryParams(
  params: Record<string, string | number>,
  apiSecret: string
): string {
  const serialized = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');

  return crypto
    .createHash('sha1')
    .update(`${serialized}${apiSecret}`)
    .digest('hex');
}

export function isCloudinaryConfigured(config: ServerConfig = getServerConfig()): boolean {
  return Boolean(
    config.cloudinaryCloudName &&
      config.cloudinaryApiKey &&
      config.cloudinaryApiSecret
  );
}

/**
 * Uploads a base64 JPEG data URL to Cloudinary using signed server credentials.
 */
export async function uploadSlideToCloudinary(
  dataUrl: string,
  publicId: string,
  config: ServerConfig = getServerConfig()
): Promise<{ secureUrl: string; publicId: string; provider: 'cloudinary' }> {
  const folder = 'marrok_staging';
  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(
    config.cloudinaryCloudName
  )}/image/upload`;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signParams: Record<string, string | number> = {
      folder,
      overwrite: 'true',
      public_id: publicId,
      timestamp,
    };
    const signature = signCloudinaryParams(signParams, config.cloudinaryApiSecret);

    const body = new URLSearchParams({
      file: dataUrl,
      api_key: config.cloudinaryApiKey,
      timestamp: String(timestamp),
      folder,
      public_id: publicId,
      overwrite: 'true',
      signature,
    });

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const err = new Error(
          `Cloudinary upload failed (${res.status}): ${errText.slice(0, 200)}`
        );
        if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
          lastErr = err;
          continue;
        }
        throw err;
      }

      const data = (await res.json()) as {
        secure_url?: string;
        url?: string;
        public_id?: string;
      };
      const secureUrl = data.secure_url || data.url;
      if (!secureUrl) {
        throw new Error('Cloudinary response did not contain a secure_url');
      }

      return {
        secureUrl,
        publicId: data.public_id || `${folder}/${publicId}`,
        provider: 'cloudinary',
      };
    } catch (err) {
      lastErr = err;
      if (attempt === 0) {
        continue;
      }
      throw err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('Cloudinary upload failed');
}

/**
 * Permanently deletes a staged image from Cloudinary after the post has been published.
 */
export async function destroyCloudinaryAsset(
  fullPublicId: string,
  config: ServerConfig = getServerConfig()
): Promise<{ publicId: string; deleted: boolean; result: string }> {
  if (!isCloudinaryConfigured(config)) {
    return { publicId: fullPublicId, deleted: false, result: 'cloudinary_not_configured' };
  }

  // Also remove from local fallback cache if present
  LOCAL_MEDIA_CACHE.delete(fullPublicId);

  if (fullPublicId.startsWith('local_staging/')) {
    return { publicId: fullPublicId, deleted: true, result: 'ok_local' };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signParams: Record<string, string | number> = {
    invalidate: 'true',
    public_id: fullPublicId,
    timestamp,
  };

  const signature = signCloudinaryParams(signParams, config.cloudinaryApiSecret);
  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(
    config.cloudinaryCloudName
  )}/image/destroy`;

  const body = new URLSearchParams({
    public_id: fullPublicId,
    invalidate: 'true',
    api_key: config.cloudinaryApiKey,
    timestamp: String(timestamp),
    signature,
  });

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      return { publicId: fullPublicId, deleted: false, result: `http_${res.status}` };
    }

    const data = (await res.json()) as { result?: string };
    const result = data.result || 'ok';
    return {
      publicId: fullPublicId,
      deleted: result === 'ok' || result === 'not found',
      result,
    };
  } catch (err) {
    console.warn(`[CloudinaryCleanup] Failed to destroy ${fullPublicId}:`, err);
    return { publicId: fullPublicId, deleted: false, result: 'network_error' };
  }
}

export const ALLOWED_STAGING_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);
export const MAX_STAGING_SLIDE_BYTES = 4 * 1024 * 1024; // 4 MB per slide

export function validateStagingSlideDataUrl(
  dataUrl: string
): { ok: true; mimeType: string; bytes: number } | { ok: false; status: number; error: string } {
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) {
    return {
      ok: false,
      status: 415,
      error: 'Unsupported slide media format: expected base64 data:image/(jpeg|png|webp) URL.',
    };
  }
  const mimeType = match[1].toLowerCase().trim();
  if (!ALLOWED_STAGING_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      status: 415,
      error: `Unsupported slide MIME type "${mimeType}". Allowed: image/jpeg, image/png, image/webp.`,
    };
  }
  const cleanB64 = match[2].replace(/\s+/g, '');
  const buf = Buffer.from(cleanB64, 'base64');
  if (buf.byteLength === 0) {
    return { ok: false, status: 400, error: 'Slide image payload is empty.' };
  }
  if (buf.byteLength > MAX_STAGING_SLIDE_BYTES) {
    return {
      ok: false,
      status: 413,
      error: `Slide image exceeds maximum staging size of ${Math.round(
        MAX_STAGING_SLIDE_BYTES / (1024 * 1024)
      )} MB.`,
    };
  }
  return { ok: true, mimeType, bytes: buf.byteLength };
}

/**
 * Sweeps Vault posts and destroys staged Cloudinary assets for posts that have:
 * 1. Already been published immediately (postStatus === 'posted' && !scheduledFor)
 * 2. Passed their scheduled publication time + 1 hour buffer
 * 3. Or been explicitly targeted by postId / forceAll
 */
export async function sweepExpiredCloudinaryAssets(options?: {
  postId?: string;
  forceAll?: boolean;
}): Promise<{
  cleanedPublicIds: string[];
  cleanedPostIds: string[];
  promotedPostIds: string[];
  remainingStagedCount: number;
  updatedPosts: SavedPostRecord[];
}> {
  const config = getServerConfig();
  const { posts } = await loadStoredPosts();
  const now = Date.now();
  const ONE_HOUR_MS = 60 * 60 * 1000;

  const cleanedPublicIds: string[] = [];
  const cleanedPostIds: string[] = [];
  const promotedPostIds: string[] = [];
  const mutatedPosts: SavedPostRecord[] = [];
  let remainingStagedCount = 0;

  const updatedPosts = await Promise.all(
    posts.map(async (post) => {
      let currentPost = post;
      let rowChanged = false;
      const scheduledMs = currentPost.scheduledFor ? Date.parse(currentPost.scheduledFor) : NaN;
      const isUnapprovedAutomatedDraft = isPostUnapprovedAutomatedDraft(currentPost);

      // 1. Unified shared eligibility predicate for scheduled -> posted promotion
      if (isEligibleOverduePromotion(currentPost, now)) {
        currentPost = {
          ...currentPost,
          postStatus: 'posted',
          postedAt: currentPost.postedAt || currentPost.scheduledFor,
          scheduledFor: undefined,
          updatedAt: new Date(now).toISOString(),
        };
        promotedPostIds.push(currentPost.id);
        rowChanged = true;
      }

      const pubIds = currentPost.cloudinaryPublicIds || [];
      if (pubIds.length === 0 || currentPost.cloudinaryCleanedAt) {
        if (rowChanged) mutatedPosts.push(currentPost);
        return currentPost;
      }

      const isTargeted =
        Boolean(options?.forceAll) ||
        (Boolean(options?.postId) && currentPost.id === options?.postId);

      // Never auto-destroy Cloudinary assets if publication failed or is unapproved (unless explicitly targeted)
      if ((currentPost.publishFailed || isUnapprovedAutomatedDraft) && !isTargeted) {
        remainingStagedCount += pubIds.length;
        if (rowChanged) mutatedPosts.push(currentPost);
        return currentPost;
      }

      const isScheduleExpired =
        currentPost.postStatus === 'posted' &&
        Number.isFinite(scheduledMs) &&
        now >= scheduledMs + ONE_HOUR_MS;
      const postedMs = currentPost.postedAt ? Date.parse(currentPost.postedAt) : NaN;
      // Keep published Cloudinary images live for 1 hour after publication so Buffer/Zernio async media workers never hit 404
      const isImmediatePublishedExpired =
        currentPost.postStatus === 'posted' &&
        !currentPost.scheduledFor &&
        (!Number.isFinite(postedMs) || now >= postedMs + ONE_HOUR_MS);

      if (isTargeted || isScheduleExpired || isImmediatePublishedExpired) {
        await Promise.all(pubIds.map((pid) => destroyCloudinaryAsset(pid, config)));
        cleanedPublicIds.push(...pubIds);
        cleanedPostIds.push(currentPost.id);
        const cleanedRecord: SavedPostRecord = {
          ...currentPost,
          cloudinaryPublicIds: [],
          cloudinaryCleanedAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
        };
        mutatedPosts.push(cleanedRecord);
        return cleanedRecord;
      }

      remainingStagedCount += pubIds.length;
      if (rowChanged) mutatedPosts.push(currentPost);
      return currentPost;
    })
  );

  if (mutatedPosts.length === 1) {
    await upsertSingleStoredPost(mutatedPosts[0], updatedPosts);
  } else if (mutatedPosts.length > 1) {
    if (config.databaseUrl) {
      // Persist ONLY mutated rows cleanly in a single UNNEST transaction
      await saveStoredPosts(mutatedPosts);
    } else {
      await saveStoredPosts(updatedPosts);
    }
  }

  return {
    cleanedPublicIds,
    cleanedPostIds,
    promotedPostIds,
    remainingStagedCount,
    updatedPosts,
  };
}

/**
 * Compute monthly Metricool usage & per-channel Buffer queue counts from Vault records.
 */
export function computeFreePlanQuotaStats(posts: SavedPostRecord[]) {
  const now = new Date();
  const currentMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  let metricoolUsedThisMonth = 0;
  let stagedCloudinarySlidesCount = 0;
  let cleanedCloudinaryPostsCount = 0;

  const activeBufferQueueByService: Record<PublishTargetPlatform, number> = {
    instagram: 0,
    facebook: 0,
    linkedin: 0,
    tiktok: 0,
  };

  for (const post of posts) {
    if (post.cloudinaryCleanedAt) {
      cleanedCloudinaryPostsCount += 1;
    } else if (post.cloudinaryPublicIds && post.cloudinaryPublicIds.length > 0) {
      stagedCloudinarySlidesCount += post.cloudinaryPublicIds.length;
    }

    const postMonth =
      post.countedInMetricoolMonth ||
      (post.postedAt ? post.postedAt.slice(0, 7) : post.updatedAt.slice(0, 7));

    if (
      postMonth === currentMonthKey &&
      (post.countedInMetricoolMonth === currentMonthKey ||
        post.publishTargets?.includes('tiktok'))
    ) {
      metricoolUsedThisMonth += 1;
    }

    // Count future scheduled posts in Buffer's 10-slot rolling queue
    if (post.scheduledFor && Date.parse(post.scheduledFor) > Date.now()) {
      for (const target of post.publishTargets || []) {
        if (activeBufferQueueByService[target] !== undefined) {
          activeBufferQueueByService[target] += 1;
        }
      }
    }
  }

  const channels: BufferChannelInfo[] = DEFAULT_CONNECTED_CHANNELS.map((ch) => ({
    ...ch,
    queuedCount:
      ch.provider === 'metricool'
        ? metricoolUsedThisMonth
        : activeBufferQueueByService[ch.service] || 0,
  }));

  return {
    currentMonthKey,
    metricoolUsedThisMonth,
    metricoolMonthlyLimit: 20,
    bufferQueueLimitPerChannel: 10,
    stagedCloudinarySlidesCount,
    cleanedCloudinaryPostsCount,
    channels,
  };
}

// (Removed legacy ephemeral third-party host staging; all media staging uses signed Cloudinary only.)

/**
 * GET /api/publish/status
 */
export async function handleGetPublishStatus(_req: Request, res: Response) {
  try {
    const config = getServerConfig();
    // READ-PURE: never mutate Postgres rows or Cloudinary assets inside GET handlers.
    // Overdue promotion & media cleanup run on the Netlify Scheduled Function / POST cleanup-media.
    const { posts, storageEngine } = await loadStoredPosts();
    const quotaStats = computeFreePlanQuotaStats(posts);

    let liveChannels = quotaStats.channels;
    const bufferMap = config.bufferApiKey
      ? await resolveBufferChannelMap(config.bufferApiKey)
      : new Map<PublishTargetPlatform, string>();
    const zernioMap = config.zernioApiKey
      ? await resolveZernioAccountMap(config.zernioApiKey)
      : new Map<PublishTargetPlatform, { accountId: string; username?: string }>();

    liveChannels = quotaStats.channels.map((ch) => {
      const zernioAcc = zernioMap.get(ch.service);
      const bufferId = bufferMap.get(ch.service);

      // Route TikTok via Zernio whenever Zernio is configured (either discovered account or default Zernio slot)
      if (ch.service === 'tiktok' && (zernioAcc || config.zernioApiKey)) {
        return {
          ...ch,
          id: zernioAcc?.accountId || ch.id,
          handle: zernioAcc?.username ? `@${zernioAcc.username.replace(/^@/, '')}` : ch.handle,
          provider: 'zernio' as const,
          queueLimit: 999,
        };
      }

      // If a non-TikTok channel is connected in Zernio and Buffer isn't configured, mark as Zernio
      if (zernioAcc && !config.bufferApiKey) {
        return {
          ...ch,
          id: zernioAcc.accountId,
          handle: zernioAcc.username ? `@${zernioAcc.username.replace(/^@/, '')}` : ch.handle,
          provider: 'zernio' as const,
          queueLimit: 999,
        };
      }

      if (ch.provider === 'buffer' && bufferId) {
        return { ...ch, id: bufferId };
      }
      return ch;
    });

    return res.json({
      storageEngine,
      databaseConfigured: Boolean(config.databaseUrl),
      cloudinaryConfigured: isCloudinaryConfigured(config),
      cloudinaryCloudName: config.cloudinaryCloudName || null,
      bufferApiConfigured: Boolean(config.bufferApiKey),
      zernioApiConfigured: Boolean(config.zernioApiKey),
      zernioMcpUrl: 'https://mcp.zernio.com/mcp',
      telegramConfigured: Boolean(
        config.telegramBotToken &&
          config.telegramWebhookSecret &&
          config.telegramAllowedChatIds.length > 0
      ),
      autoCleanedPostIds: [],
      ...quotaStats,
      channels: liveChannels,
    });
  } catch (err) {
    console.error('[PublishController] Failed to get publish status:', err);
    return res.status(500).json({ error: 'Failed to load publishing status' });
  }
}

/**
 * POST /api/publish/upload-media
 * Validates MIME & size and uploads slide images exclusively to signed Cloudinary staging.
 * Returns 503 with explicit configuration instructions when Cloudinary secrets are absent.
 */
export async function handleUploadPublishMedia(req: Request, res: Response) {
  try {
    const config = getServerConfig();
    if (!isCloudinaryConfigured(config)) {
      return res.status(503).json({
        error:
          'Cloudinary media staging is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in Netlify Environment Variables.',
      });
    }

    const { postId = `post_${Date.now()}`, slides } = req.body || {};

    if (!Array.isArray(slides) || slides.length === 0) {
      return res.status(400).json({ error: 'slides array of base64 image dataUrls is required' });
    }
    if (slides.length > 35) {
      return res.status(400).json({ error: 'Maximum 35 slides permitted per staging upload batch.' });
    }

    const validatedSlides: Array<{ slideIdx: number; dataUrl: string }> = [];
    for (let idx = 0; idx < slides.length; idx++) {
      const item = slides[idx] as { index?: number; dataUrl?: string };
      const slideIdx = typeof item?.index === 'number' ? item.index + 1 : idx + 1;
      const dataUrl = String(item?.dataUrl || '');
      const check = validateStagingSlideDataUrl(dataUrl);
      if (!check.ok) {
        return res.status(check.status).json({
          error: `Slide ${slideIdx}: ${check.error}`,
        });
      }
      validatedSlides.push({ slideIdx, dataUrl });
    }

    const cleanPostId = String(postId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
    const batchTs = Math.floor(Date.now() / 1000);

    const uploaded = await Promise.all(
      validatedSlides.map(async ({ slideIdx, dataUrl }) => {
        const publicId = `${cleanPostId}_s${slideIdx}_${batchTs}`;
        return uploadSlideToCloudinary(dataUrl, publicId, config);
      })
    );

    return res.json({
      postId: cleanPostId,
      urls: uploaded.map((u) => u.secureUrl),
      publicIds: uploaded.map((u) => u.publicId),
      provider: 'cloudinary',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to upload slide media';
    console.error('[PublishController] Media upload error:', msg);
    return res.status(502).json({ error: msg });
  }
}

/**
 * POST /api/publish/cleanup-media
 * Destroys staged Cloudinary images either for explicit publicIds, a specific postId,
 * or all expired scheduled posts.
 */
export async function handleCleanupPublishMedia(req: Request, res: Response) {
  try {
    const config = getServerConfig();
    const { publicIds, postId, forceAll } = req.body || {};

    if (
      Boolean(forceAll) &&
      config.apiSharedSecret &&
      req.headers['x-api-secret'] !== config.apiSharedSecret
    ) {
      return res.status(401).json({
        error: 'Unauthorized: valid x-api-secret header is required for forceAll cleanup.',
      });
    }

    const directCleaned: string[] = [];
    if (Array.isArray(publicIds) && publicIds.length > 0) {
      const results = await Promise.all(
        publicIds.map((pid: unknown) => destroyCloudinaryAsset(String(pid), config))
      );
      for (const r of results) {
        if (r.deleted) directCleaned.push(r.publicId);
      }
    }

    const sweep = await sweepExpiredCloudinaryAssets({
      postId: typeof postId === 'string' ? postId : undefined,
      forceAll: Boolean(forceAll),
    });

    const allCleanedIds = Array.from(new Set([...directCleaned, ...sweep.cleanedPublicIds]));
    const quotaStats = computeFreePlanQuotaStats(sweep.updatedPosts);

    return res.json({
      cleanedPublicIds: allCleanedIds,
      cleanedPostIds: sweep.cleanedPostIds,
      remainingStagedCount: quotaStats.stagedCloudinarySlidesCount,
      cleanedCloudinaryPostsCount: quotaStats.cleanedCloudinaryPostsCount,
    });
  } catch (err) {
    console.error('[PublishController] Cleanup error:', err);
    return res.status(500).json({ error: 'Failed to clean up Cloudinary media' });
  }
}

let cachedLiveBufferChannels: { channels: Map<PublishTargetPlatform, string>; fetchedAt: number } | null = null;
let cachedLiveZernioAccounts: {
  accounts: Map<PublishTargetPlatform, { accountId: string; username?: string }>;
  fetchedAt: number;
} | null = null;

/**
 * Queries Buffer's GraphQL API for the user's live connected channel IDs so publishing works
 * even if the user's Buffer channel IDs differ from DEFAULT_CONNECTED_CHANNELS.
 */
async function resolveBufferChannelMap(
  bufferApiKey: string
): Promise<Map<PublishTargetPlatform, string>> {
  const fallbackMap = new Map<PublishTargetPlatform, string>();
  for (const ch of DEFAULT_CONNECTED_CHANNELS) {
    if (ch.provider === 'buffer') {
      fallbackMap.set(ch.service, ch.id);
    }
  }

  if (!bufferApiKey) return fallbackMap;
  if (cachedLiveBufferChannels && Date.now() - cachedLiveBufferChannels.fetchedAt < 5 * 60_000) {
    return cachedLiveBufferChannels.channels;
  }

  const query = `
    query GetMarrokChannels {
      account {
        organizations {
          id
          channels {
            id
            name
            service
          }
        }
      }
    }
  `;

  try {
    const res = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bufferApiKey}`,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) return fallbackMap;

    const payload = (await res.json()) as {
      data?: {
        account?: {
          organizations?: Array<{
            channels?: Array<{ id?: string; name?: string; service?: string }>;
          }>;
        };
      };
    };

    const orgs = payload.data?.account?.organizations || [];
    for (const org of orgs) {
      for (const ch of org.channels || []) {
        const svc = String(ch.service || '').toLowerCase();
        if (
          ch.id &&
          (svc === 'instagram' || svc === 'facebook' || svc === 'linkedin' || svc === 'tiktok')
        ) {
          fallbackMap.set(svc as PublishTargetPlatform, ch.id);
        }
      }
    }

    cachedLiveBufferChannels = {
      channels: fallbackMap,
      fetchedAt: Date.now(),
    };
  } catch {
    // Keep fallbackMap on network timeout
  }

  return fallbackMap;
}

/**
 * Queries Zernio's REST API v1 (`GET https://zernio.com/api/v1/accounts`) for connected accounts
 * (e.g. TikTok and Instagram on Zernio's Free Tier).
 */
async function resolveZernioAccountMap(
  zernioApiKey: string
): Promise<Map<PublishTargetPlatform, { accountId: string; username?: string }>> {
  const accountMap = new Map<PublishTargetPlatform, { accountId: string; username?: string }>();
  if (!zernioApiKey) return accountMap;

  if (cachedLiveZernioAccounts && Date.now() - cachedLiveZernioAccounts.fetchedAt < 5 * 60_000) {
    return cachedLiveZernioAccounts.accounts;
  }

  try {
    const res = await fetch('https://zernio.com/api/v1/accounts', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${zernioApiKey}`,
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) return accountMap;

    const payload = (await res.json()) as {
      accounts?: Array<{
        _id?: string;
        id?: string;
        platform?: string;
        username?: string;
        displayName?: string;
        enabled?: boolean;
      }>;
      data?: {
        accounts?: Array<{
          _id?: string;
          id?: string;
          platform?: string;
          username?: string;
          displayName?: string;
          enabled?: boolean;
        }>;
      };
    };

    const list = payload.accounts || payload.data?.accounts || [];
    for (const acc of list) {
      if (acc.enabled === false) continue;
      const svc = String(acc.platform || '').toLowerCase();
      const accId = acc._id || acc.id;
      if (
        accId &&
        (svc === 'tiktok' || svc === 'instagram' || svc === 'facebook' || svc === 'linkedin')
      ) {
        accountMap.set(svc as PublishTargetPlatform, {
          accountId: accId,
          username: acc.username || acc.displayName,
        });
      }
    }

    cachedLiveZernioAccounts = {
      accounts: accountMap,
      fetchedAt: Date.now(),
    };
  } catch {
    // Return empty map on network timeout
  }

  return accountMap;
}

export interface TikTokCommercialMusicTrack {
  musicSoundId: string;
  trackId: string;
  name: string;
  artist: string;
  genres: string[];
  durationSec: number;
  previewUrl: string;
  thumbnailUrl?: string;
  rank: number;
}

const FALLBACK_TIKTOK_COMMERCIAL_TRACKS: TikTokCommercialMusicTrack[] = [
  {
    musicSoundId: '7000018757057955842',
    trackId: '7000018744378574849',
    name: 'Sunset in Girona',
    artist: 'Mark Checkley',
    genres: ['rock', 'pop'],
    durationSec: 60,
    previewUrl: '',
    rank: 1,
  },
  {
    musicSoundId: '6999990790927845377',
    trackId: '6999990773139818497',
    name: 'Someday (Instrumental)',
    artist: '2050',
    genres: ['pop', 'electronic'],
    durationSec: 40,
    previewUrl: '',
    rank: 2,
  },
];

let cachedTikTokMusicCatalog: {
  accountId: string;
  tracks: TikTokCommercialMusicTrack[];
  fetchedAt: number;
} | null = null;

/**
 * Queries Zernio's TikTok Commercial Music Library (`GET https://zernio.com/api/v1/accounts/{accountId}/tiktok/commercial-music`)
 * for trending licensed tracks that can be attached via `tiktokSettings.musicSoundInfo.musicSoundId`.
 */
export async function fetchZernioTikTokCommercialMusic(
  zernioApiKey: string,
  accountId: string
): Promise<TikTokCommercialMusicTrack[]> {
  if (!zernioApiKey || !accountId) {
    return FALLBACK_TIKTOK_COMMERCIAL_TRACKS;
  }

  if (
    cachedTikTokMusicCatalog &&
    cachedTikTokMusicCatalog.accountId === accountId &&
    Date.now() - cachedTikTokMusicCatalog.fetchedAt < 10 * 60_000 &&
    cachedTikTokMusicCatalog.tracks.length > 0
  ) {
    return cachedTikTokMusicCatalog.tracks;
  }

  try {
    const url = `https://zernio.com/api/v1/accounts/${encodeURIComponent(
      accountId
    )}/tiktok/commercial-music?pageSize=25&sortBy=RANK&sortOrder=ASC`;
    const payload = await fetchJsonWithTimeout<{
      tracks?: Array<{
        id?: string;
        name?: string;
        artist?: string;
        genres?: string[];
        durationSec?: number;
        rank?: number;
        previewUrl?: string;
        thumbnailUrl?: string;
        clip?: {
          id?: string;
          durationSec?: number;
          previewUrl?: string;
        };
      }>;
    }>(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${zernioApiKey}`,
      },
      timeoutMs: 8_000,
      contextLabel: 'Zernio TikTok Commercial Music',
    });

    const rawTracks = Array.isArray(payload.tracks) ? payload.tracks : [];
    const normalized: TikTokCommercialMusicTrack[] = rawTracks
      .map((item, idx): TikTokCommercialMusicTrack | null => {
        const musicSoundId = String(item.clip?.id || item.id || '').trim();
        const trackId = String(item.id || musicSoundId).trim();
        if (!musicSoundId) return null;
        return {
          musicSoundId,
          trackId,
          name: String(item.name || `Trending Sound #${idx + 1}`),
          artist: String(item.artist || 'TikTok Commercial Audio'),
          genres: Array.isArray(item.genres) ? item.genres : [],
          durationSec: Number(item.clip?.durationSec || item.durationSec || 30),
          previewUrl: String(item.clip?.previewUrl || item.previewUrl || ''),
          thumbnailUrl: item.thumbnailUrl ? String(item.thumbnailUrl) : undefined,
          rank: Number(item.rank || idx + 1),
        };
      })
      .filter((t): t is TikTokCommercialMusicTrack => t !== null);

    if (normalized.length > 0) {
      cachedTikTokMusicCatalog = {
        accountId,
        tracks: normalized,
        fetchedAt: Date.now(),
      };
      return normalized;
    }
  } catch {
    // Fall back to cached or default catalog on network error
  }

  return cachedTikTokMusicCatalog?.tracks || FALLBACK_TIKTOK_COMMERCIAL_TRACKS;
}

/**
 * GET /api/publish/tiktok-music
 * Returns trending tracks from Zernio's TikTok Commercial Music Library for the user's connected TikTok account.
 */
export async function handleGetTikTokCommercialMusic(_req: Request, res: Response) {
  try {
    const config = getServerConfig();
    if (!config.zernioApiKey) {
      return res.json({
        configured: false,
        accountId: null,
        tracks: FALLBACK_TIKTOK_COMMERCIAL_TRACKS,
      });
    }

    const zernioMap = await resolveZernioAccountMap(config.zernioApiKey);
    const tiktokAcc = zernioMap.get('tiktok');
    const accountId = tiktokAcc?.accountId || '6af067bbe8ca0b316c043c3a';
    const tracks = await fetchZernioTikTokCommercialMusic(config.zernioApiKey, accountId);

    return res.json({
      configured: true,
      accountId,
      username: tiktokAcc?.username || 'marrokorg',
      tracks,
    });
  } catch (err) {
    console.warn('[PublishController] Failed to load TikTok music catalog:', err);
    return res.json({
      configured: false,
      accountId: null,
      tracks: FALLBACK_TIKTOK_COMMERCIAL_TRACKS,
    });
  }
}

/**
 * Dispatches a post to Zernio REST API v1 (`POST https://zernio.com/api/v1/posts`).
 * Supports TikTok Photo Carousels (up to 35 JPEG slides with camelCase `autoAddMusic` + `musicSoundInfo`
 * and compliance flags) and Instagram Carousels.
 */
async function dispatchToZernioApi(params: {
  zernioApiKey: string;
  accountId: string;
  service: PublishTargetPlatform;
  text: string;
  mode: PublishScheduleMode;
  dueAt?: string;
  timezone?: string;
  imageUrls: string[];
  tiktokSettings?: {
    privacyLevel?: string;
    photoCoverIndex?: number;
    autoAddMusic?: boolean;
    allowComment?: boolean;
    title?: string;
    musicSoundId?: string;
  };
}): Promise<{ ok: boolean; zernioPostId?: string; message?: string }> {
  const {
    zernioApiKey,
    accountId,
    service,
    text,
    mode,
    dueAt,
    timezone = 'Africa/Algiers',
    imageUrls,
    tiktokSettings,
  } = params;

  const isImmediate = mode === 'shareNow';
  let effectiveScheduledFor = dueAt;
  if (!isImmediate) {
    const parsedMs = dueAt ? Date.parse(dueAt) : NaN;
    if (!Number.isFinite(parsedMs) || parsedMs <= Date.now() + 60_000) {
      effectiveScheduledFor = new Date(Date.now() + 5 * 60_000).toISOString();
    }
  }

  const shouldAddMusic = tiktokSettings?.autoAddMusic ?? true;
  let resolvedMusicSoundId =
    tiktokSettings?.musicSoundId && tiktokSettings.musicSoundId !== 'none'
      ? tiktokSettings.musicSoundId.trim()
      : '';

  if (
    service === 'tiktok' &&
    shouldAddMusic &&
    (!resolvedMusicSoundId || resolvedMusicSoundId === 'auto')
  ) {
    const catalog = await fetchZernioTikTokCommercialMusic(zernioApiKey, accountId);
    resolvedMusicSoundId = catalog[0]?.musicSoundId || '';
  }

  const buildZernioPayload = (includeExplicitMusicSound: boolean): Record<string, unknown> => {
    const privacyLevel = tiktokSettings?.privacyLevel || 'PUBLIC_TO_EVERYONE';
    const allowComment = tiktokSettings?.allowComment ?? true;
    const photoCoverIndex = tiktokSettings?.photoCoverIndex ?? 0;
    const cleanTitle = tiktokSettings?.title ? tiktokSettings.title.slice(0, 90) : undefined;
    const sanitizedDescription =
      service === 'tiktok'
        ? stripLeadingDuplicateTikTokTitle(text, cleanTitle).slice(0, 4000)
        : text.slice(0, 4000);

    const ttSettingsObj: Record<string, unknown> = {
      // Official Zernio OpenAPI camelCase properties (`#/components/schemas/TikTokPlatformData`)
      privacyLevel,
      allowComment,
      mediaType: 'photo',
      photoCoverIndex,
      description: sanitizedDescription,
      ...(cleanTitle ? { title: cleanTitle } : {}),
      autoAddMusic: shouldAddMusic,
      contentPreviewConfirmed: true,
      expressConsentGiven: true,
      ...(includeExplicitMusicSound && shouldAddMusic && resolvedMusicSoundId
        ? {
            musicSoundInfo: {
              musicSoundId: resolvedMusicSoundId,
            },
          }
        : {}),
      // Backward-compatible snake_case aliases
      privacy_level: privacyLevel,
      allow_comment: allowComment,
      media_type: 'photo',
      photo_cover_index: photoCoverIndex,
      auto_add_music: shouldAddMusic,
      content_preview_confirmed: true,
      express_consent_given: true,
    };

    return {
      content: service === 'tiktok' ? sanitizedDescription : text,
      mediaItems: imageUrls.map((url) => ({
        type: 'image',
        url,
      })),
      platforms: [
        {
          platform: service,
          accountId,
          ...(service === 'tiktok' ? { platformSpecificData: ttSettingsObj } : {}),
        },
      ],
      ...(isImmediate
        ? { publishNow: true }
        : {
            scheduledFor: effectiveScheduledFor,
            timezone,
          }),
      ...(service === 'tiktok' ? { tiktokSettings: ttSettingsObj } : {}),
    };
  };

  const executePost = async (payloadObj: Record<string, unknown>) => {
    return fetch('https://zernio.com/api/v1/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${zernioApiKey}`,
      },
      body: JSON.stringify(payloadObj),
      signal: AbortSignal.timeout(15_000),
    });
  };

  try {
    const hasExplicitSound = Boolean(shouldAddMusic && resolvedMusicSoundId);
    let res = await executePost(buildZernioPayload(hasExplicitSound));

    // Safe fallback: if TikTok's photo endpoint ever rejects a specific musicSoundInfo track ID,
    // immediately retry with `autoAddMusic: true` so the post always succeeds.
    if (!res.ok && hasExplicitSound) {
      res = await executePost(buildZernioPayload(false));
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        message: `Zernio API HTTP ${res.status}${errText ? `: ${errText.slice(0, 140)}` : ''}`,
      };
    }

    const payload = (await res.json()) as {
      post?: { _id?: string; id?: string };
      data?: { post?: { _id?: string; id?: string }; _id?: string; id?: string };
      _id?: string;
      id?: string;
      message?: string;
    };

    const createdId =
      payload.post?._id ||
      payload.post?.id ||
      payload.data?.post?._id ||
      payload.data?.post?.id ||
      payload.data?._id ||
      payload.data?.id ||
      payload._id ||
      payload.id;

    return {
      ok: true,
      zernioPostId: createdId || `zernio_${Date.now()}`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Zernio API network error',
    };
  }
}

/**
 * Deletes/cancels a post on Zernio (`DELETE https://zernio.com/api/v1/posts/{id}`).
 */
async function deleteZernioPostApi(
  zernioApiKey: string,
  zernioPostId: string
): Promise<{ ok: boolean; message?: string }> {
  if (!zernioApiKey || !zernioPostId) {
    return { ok: false, message: 'Missing Zernio API key or post ID' };
  }
  try {
    const res = await fetch(`https://zernio.com/api/v1/posts/${encodeURIComponent(zernioPostId)}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${zernioApiKey}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok || res.status === 404) {
      return { ok: true };
    }
    return { ok: false, message: `Zernio delete HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Zernio delete network error',
    };
  }
}

/**
 * Dispatches a post to Buffer's GraphQL API if BUFFER_API_KEY is configured.
 * Note: Buffer's Instagram metadata enum ONLY accepts 'post', 'story', or 'reel' (never 'carousel').
 * Sending `type: 'post'` with multiple `assets` automatically publishes an Instagram Carousel!
 */
async function dispatchToBufferGraphQl(params: {
  bufferApiKey: string;
  channelId: string;
  service: PublishTargetPlatform;
  text: string;
  mode: PublishScheduleMode;
  dueAt?: string;
  imageUrls: string[];
}): Promise<{ ok: boolean; bufferPostId?: string; message?: string }> {
  const { bufferApiKey, channelId, service, text, mode, dueAt, imageUrls } = params;
  const graphqlMode =
    mode === 'customScheduled'
      ? 'customScheduled'
      : mode === 'shareNow'
      ? 'shareNow'
      : 'addToQueue';

  // Ensure dueAt is strictly in the future when customScheduled is used on the same day
  let effectiveDueAt = dueAt;
  if (graphqlMode === 'customScheduled' && dueAt) {
    const parsedMs = Date.parse(dueAt);
    if (!Number.isFinite(parsedMs) || parsedMs <= Date.now() + 60_000) {
      effectiveDueAt = new Date(Date.now() + 5 * 60_000).toISOString();
    }
  }

  const query = `
    mutation CreateMarrokPost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post {
            id
            status
            dueAt
          }
        }
        ... on MutationError {
          message
        }
      }
    }
  `;

  const metadata =
    service === 'instagram'
      ? {
          instagram: {
            type: 'post',
            shouldShareToFeed: true,
          },
        }
      : service === 'facebook'
      ? {
          facebook: {
            type: 'post',
          },
        }
      : service === 'linkedin'
      ? {
          linkedin: {},
        }
      : undefined;

  const variables = {
    input: {
      text,
      channelId,
      schedulingType: 'automatic',
      needsApproval: false,
      mode: graphqlMode,
      ...(effectiveDueAt && graphqlMode === 'customScheduled' ? { dueAt: effectiveDueAt } : {}),
      ...(metadata ? { metadata } : {}),
      assets: imageUrls.map((url) => ({
        image: { url },
      })),
    },
  };

  try {
    const res = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bufferApiKey}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        ok: false,
        message: `Buffer API HTTP ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ''}`,
      };
    }

    const payload = (await res.json()) as {
      data?: {
        createPost?: {
          post?: { id?: string };
          message?: string;
        };
      };
      errors?: Array<{ message?: string }>;
    };

    const createdId = payload.data?.createPost?.post?.id;
    if (createdId) {
      return { ok: true, bufferPostId: createdId };
    }
    return {
      ok: false,
      message:
        payload.data?.createPost?.message ||
        payload.errors?.[0]?.message ||
        'Buffer GraphQL mutation returned no post ID',
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Buffer API network error',
    };
  }
}

/**
 * POST /api/publish/dispatch
 * Publishes or schedules a post across selected targets (Buffer GraphQL + Zernio REST API v1 + Metricool CSV fallback)
 * and persists schedule metadata in the Vault.
 * Keeps staged Cloudinary URLs live for 1 hour after publication so Buffer/Zernio async media downloaders
 * and Metricool CSV imports never encounter a 404.
 */
const activeDispatchLocks = new Set<string>();

function normalizeDeterministicValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeDeterministicValue);
  }
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const val = (value as Record<string, unknown>)[key];
      if (val !== undefined) {
        sorted[key] = normalizeDeterministicValue(val);
      }
    }
    return sorted;
  }
  return value;
}

export function computeDispatchFingerprint(input: {
  postId?: string;
  title?: string;
  mode: string;
  dueAt?: string;
  timezone?: string;
  targets: string[];
  text: string;
  imageUrls: string[];
  tiktokImageUrls: string[];
  tiktokSettings?: Record<string, unknown>;
}): string {
  const normalizedTargets = [...input.targets].map((t) => String(t).toLowerCase()).sort();
  const payload = JSON.stringify({
    postId: String(input.postId || input.title || '').trim(),
    mode: String(input.mode || 'addToQueue'),
    dueAt: String(input.dueAt || '').trim(),
    timezone: String(input.timezone || '').trim(),
    targets: normalizedTargets,
    text: String(input.text || '').trim(),
    imageUrls: (input.imageUrls || []).map((u) => String(u).trim()),
    tiktokImageUrls: (input.tiktokImageUrls || []).map((u) => String(u).trim()),
    tiktokSettings:
      input.tiktokSettings && typeof input.tiktokSettings === 'object'
        ? normalizeDeterministicValue(input.tiktokSettings)
        : null,
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

export async function handleDispatchPublish(req: Request, res: Response) {
  let activeLockKey: string | null = null;
  let activePostLockKey: string | null = null;
  let partialTargetRecord: SavedPostRecord | undefined;
  let partialExistingPosts: SavedPostRecord[] = [];
  const partialBufferPostIds: string[] = [];
  const partialZernioPostIds: string[] = [];
  try {
    const config = getServerConfig();
    const body = req.body || {};
    const {
      postId,
      deck,
      title,
      caption,
      mode = 'addToQueue',
      dueAt,
      timezone,
      targets = ['instagram', 'facebook', 'linkedin'],
      imageUrls = [],
      tiktokImageUrls = [],
      cloudinaryPublicIds = [],
      tiktokSettings,
      mergeRemoteIds = false,
      cancelExistingBeforeDispatch = false,
    } = body;

    const validTargets: PublishTargetPlatform[] = Array.isArray(targets)
      ? targets.filter((t): t is PublishTargetPlatform =>
          ['instagram', 'facebook', 'linkedin', 'tiktok'].includes(String(t))
        )
      : ['instagram'];

    const { posts: existingPosts } = await loadStoredPosts();
    partialExistingPosts = existingPosts;
    const existingRecord = postId ? existingPosts.find((p) => p.id === postId) : undefined;

    // Review Safety Gate: never publish or schedule unreviewed / unverified drafts
    const isUnreviewed =
      existingRecord?.humanApproved === false ||
      existingRecord?.deck?.sourceMeta?.userReviewed === false ||
      deck?.sourceMeta?.userReviewed === false ||
      deck?.sourceMeta?.humanApproved === false;
    const isNumbersUnverified =
      existingRecord?.verifiedNumbers === false ||
      existingRecord?.deck?.sourceMeta?.verifiedNumbers === false ||
      deck?.sourceMeta?.verifiedNumbers === false;

    if (isUnreviewed || isNumbersUnverified) {
      return res.status(400).json({
        error: isUnreviewed
          ? 'Review Safety Gate: Mark "Human Reviewed" before publishing or scheduling this post.'
          : 'Review Safety Gate: Verify all claims & numbers before publishing or scheduling this post.',
        code: 'REVIEW_SAFETY_GATE',
      });
    }

    const effectiveTikTokUrls: string[] =
      Array.isArray(tiktokImageUrls) && tiktokImageUrls.length > 0
        ? tiktokImageUrls
        : Array.isArray(imageUrls)
        ? imageUrls
        : [];
    const postText = String(caption || deck?.caption || '');
    const dispatchFingerprint = computeDispatchFingerprint({
      postId: postId || existingRecord?.id || deck?.id,
      title: title || existingRecord?.title || deck?.slides?.[0]?.enTitle,
      mode: String(mode),
      dueAt: typeof dueAt === 'string' ? dueAt : undefined,
      timezone: typeof timezone === 'string' ? timezone : undefined,
      targets: validTargets,
      text: postText,
      imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
      tiktokImageUrls: effectiveTikTokUrls,
      tiktokSettings:
        tiktokSettings && typeof tiktokSettings === 'object'
          ? (tiktokSettings as Record<string, unknown>)
          : undefined,
    });

    // Idempotent Replay Gate: if an identical dispatch payload already succeeded for this post
    // and the caller did not request cancelExistingBeforeDispatch, return the stored result without double-posting.
    const storedFingerprint =
      existingRecord?.lastDispatchFingerprint ||
      existingRecord?.deck?.sourceMeta?.lastDispatchFingerprint;
    const hasCompletedPriorDispatch =
      !existingRecord?.publishFailed &&
      ((existingRecord?.bufferPostIds?.length || 0) > 0 ||
        (existingRecord?.zernioPostIds?.length || 0) > 0 ||
        existingRecord?.postStatus === 'posted' ||
        Boolean(existingRecord?.scheduledFor));

    if (
      !cancelExistingBeforeDispatch &&
      existingRecord &&
      storedFingerprint === dispatchFingerprint &&
      hasCompletedPriorDispatch
    ) {
      const quotaStats = computeFreePlanQuotaStats(existingPosts);
      return res.json({
        ok: true,
        idempotentReplay: true,
        dispatchFingerprint,
        mode,
        scheduledFor: existingRecord.scheduledFor || null,
        cloudinaryCleaned: Boolean(existingRecord.cloudinaryCleanedAt),
        cleanedPublicIds: [],
        post: existingRecord,
        bufferDispatchedCount:
          (existingRecord.bufferPostIds?.length || 0) +
          (existingRecord.zernioPostIds?.length || 0),
        bufferFailedCount: 0,
        channelResults: validTargets.map((service) => ({
          service,
          provider:
            service === 'tiktok'
              ? (existingRecord.zernioPostIds?.length ? 'zernio' : 'metricool-csv')
              : (existingRecord.bufferPostIds?.length
                  ? 'buffer'
                  : existingRecord.zernioPostIds?.length
                  ? 'zernio'
                  : 'metricool-csv'),
          ok: true,
          message: 'Idempotent replay — already dispatched with identical payload',
        })),
        warnings: [],
        quotaStats,
      });
    }

    const candidatePostLock =
      postId || existingRecord?.id ? `post:${String(postId || existingRecord?.id)}` : null;
    if (
      activeDispatchLocks.has(dispatchFingerprint) ||
      (candidatePostLock && activeDispatchLocks.has(candidatePostLock))
    ) {
      return res.status(409).json({
        error: 'An identical publish dispatch is already in progress for this post.',
        code: 'DISPATCH_IN_FLIGHT',
      });
    }
    activeDispatchLocks.add(dispatchFingerprint);
    activeLockKey = dispatchFingerprint;
    if (candidatePostLock) {
      activeDispatchLocks.add(candidatePostLock);
      activePostLockKey = candidatePostLock;
    }

    const isImmediate = mode === 'shareNow';
    const warnings: string[] = [];

    // If user chose "Cancel & Re-Dispatch All", cancel any existing Buffer & Zernio queue IDs first
    if (cancelExistingBeforeDispatch && existingRecord) {
      const priorBufferIds = existingRecord.bufferPostIds || [];
      if (priorBufferIds.length > 0 && config.bufferApiKey) {
        for (const bid of priorBufferIds) {
          await deleteBufferPostGraphQl(config.bufferApiKey, bid).catch(() => null);
        }
      }
      const priorZernioIds = existingRecord.zernioPostIds || [];
      if (priorZernioIds.length > 0 && config.zernioApiKey) {
        for (const zid of priorZernioIds) {
          await deleteZernioPostApi(config.zernioApiKey, zid).catch(() => null);
        }
      }
    }

    // Build or update the SavedPostRecord in the Vault
    let targetRecord: SavedPostRecord | undefined = existingRecord;
    if (deck) {
      const validation = validateAndBuildPostRecord({
        id: postId,
        deck,
        title,
        postStatus: isImmediate ? 'posted' : 'validated',
        allowOverride: true,
        existingRecord,
      });
      if (validation.ok) {
        targetRecord = validation.record;
      }
    }
    partialTargetRecord = targetRecord;

    const nowIso = new Date().toISOString();
    const currentMonthKey = nowIso.slice(0, 7);
    const bufferPostIds = partialBufferPostIds;
    const zernioPostIds = partialZernioPostIds;
    const channelResults: Array<{
      service: PublishTargetPlatform;
      provider: 'buffer' | 'zernio' | 'metricool-csv';
      ok: boolean;
      bufferPostId?: string;
      zernioPostId?: string;
      message?: string;
    }> = [];

    const hasLocalOnlyUrls =
      Array.isArray(imageUrls) &&
      imageUrls.some((u: unknown) => typeof u === 'string' && /localhost|127\.0\.0\.1/.test(u));

    if (hasLocalOnlyUrls) {
      warnings.push(
        'Slide images were staged locally because Cloudinary credentials are not configured; external cloud APIs (Buffer/Zernio/Metricool) require public HTTPS image URLs.'
      );
    }

    const zernioMap = config.zernioApiKey
      ? await resolveZernioAccountMap(config.zernioApiKey)
      : new Map<PublishTargetPlatform, { accountId: string; username?: string }>();
    const bufferMap = config.bufferApiKey
      ? await resolveBufferChannelMap(config.bufferApiKey)
      : new Map<PublishTargetPlatform, string>();

    // 1. Dispatch Instagram, Facebook, LinkedIn (Buffer primary -> Zernio failover -> Metricool CSV fallback)
    const metaLinkedInTargets = validTargets.filter((t) => t !== 'tiktok');
    if (metaLinkedInTargets.length > 0) {
      for (const service of metaLinkedInTargets) {
        const bufferChannelId = bufferMap.get(service);
        const zernioAccount = zernioMap.get(service);

        if (config.bufferApiKey && bufferChannelId && Array.isArray(imageUrls) && imageUrls.length > 0) {
          const result = await dispatchToBufferGraphQl({
            bufferApiKey: config.bufferApiKey,
            channelId: bufferChannelId,
            service,
            text: postText,
            mode: mode as PublishScheduleMode,
            dueAt: typeof dueAt === 'string' ? dueAt : undefined,
            imageUrls,
          });

          if (result.ok && result.bufferPostId) {
            bufferPostIds.push(result.bufferPostId);
            channelResults.push({
              service,
              provider: 'buffer',
              ok: true,
              bufferPostId: result.bufferPostId,
            });
            continue;
          }

          // If Buffer failed for this channel (e.g. Instagram queue full) AND the channel is connected in Zernio, failover automatically!
          if (config.zernioApiKey && zernioAccount) {
            const zernioFallback = await dispatchToZernioApi({
              zernioApiKey: config.zernioApiKey,
              accountId: zernioAccount.accountId,
              service,
              text: postText,
              mode: mode as PublishScheduleMode,
              dueAt: typeof dueAt === 'string' ? dueAt : undefined,
              timezone: typeof timezone === 'string' ? timezone : undefined,
              imageUrls,
            });
            if (zernioFallback.ok && zernioFallback.zernioPostId) {
              zernioPostIds.push(zernioFallback.zernioPostId);
              channelResults.push({
                service,
                provider: 'zernio',
                ok: true,
                zernioPostId: zernioFallback.zernioPostId,
              });
              continue;
            }
          }

          warnings.push(`${service}: ${result.message || 'Buffer dispatch failed'}`);
          channelResults.push({
            service,
            provider: 'buffer',
            ok: false,
            message: result.message || 'Buffer dispatch failed',
          });
          continue;
        }

        // If Buffer isn't configured for this channel, check if Zernio has it connected
        if (config.zernioApiKey && zernioAccount && Array.isArray(imageUrls) && imageUrls.length > 0) {
          const zResult = await dispatchToZernioApi({
            zernioApiKey: config.zernioApiKey,
            accountId: zernioAccount.accountId,
            service,
            text: postText,
            mode: mode as PublishScheduleMode,
            dueAt: typeof dueAt === 'string' ? dueAt : undefined,
            timezone: typeof timezone === 'string' ? timezone : undefined,
            imageUrls,
          });
          if (zResult.ok && zResult.zernioPostId) {
            zernioPostIds.push(zResult.zernioPostId);
            channelResults.push({
              service,
              provider: 'zernio',
              ok: true,
              zernioPostId: zResult.zernioPostId,
            });
          } else {
            warnings.push(`${service}: ${zResult.message || 'Zernio dispatch failed'}`);
            channelResults.push({
              service,
              provider: 'zernio',
              ok: false,
              message: zResult.message || 'Zernio dispatch failed',
            });
          }
          continue;
        }

        // Otherwise fallback to Metricool CSV
        channelResults.push({
          service,
          provider: 'metricool-csv',
          ok: true,
          message: 'Included in Metricool CSV (API key not set for channel)',
        });
      }
    }

    // 2. Dispatch TikTok (Zernio Free API primary -> Buffer if connected -> Metricool CSV fallback)
    if (validTargets.includes('tiktok')) {
      const zernioTikTok = zernioMap.get('tiktok');
      const bufferTikTokId = bufferMap.get('tiktok');

      if (config.zernioApiKey && effectiveTikTokUrls.length > 0) {
        if (!zernioTikTok) {
          warnings.push(
            'tiktok: ZERNIO_API_KEY is set, but no connected TikTok account was found in your Zernio profile (GET /v1/accounts). Prepared Metricool CSV fallback.'
          );
          channelResults.push({
            service: 'tiktok',
            provider: 'metricool-csv',
            ok: true,
            message: 'Connect TikTok in Zernio dashboard; CSV ready as fallback',
          });
        } else {
          const zTikTokResult = await dispatchToZernioApi({
            zernioApiKey: config.zernioApiKey,
            accountId: zernioTikTok.accountId,
            service: 'tiktok',
            text: postText,
            mode: mode as PublishScheduleMode,
            dueAt: typeof dueAt === 'string' ? dueAt : undefined,
            timezone: typeof timezone === 'string' ? timezone : undefined,
            imageUrls: effectiveTikTokUrls,
            tiktokSettings,
          });

          if (zTikTokResult.ok && zTikTokResult.zernioPostId) {
            zernioPostIds.push(zTikTokResult.zernioPostId);
            channelResults.push({
              service: 'tiktok',
              provider: 'zernio',
              ok: true,
              zernioPostId: zTikTokResult.zernioPostId,
            });
          } else {
            warnings.push(`tiktok: ${zTikTokResult.message || 'Zernio TikTok dispatch failed'}`);
            channelResults.push({
              service: 'tiktok',
              provider: 'zernio',
              ok: false,
              message: zTikTokResult.message || 'Zernio TikTok dispatch failed',
            });
          }
        }
      } else if (config.bufferApiKey && bufferTikTokId && effectiveTikTokUrls.length > 0) {
        const bTikTokResult = await dispatchToBufferGraphQl({
          bufferApiKey: config.bufferApiKey,
          channelId: bufferTikTokId,
          service: 'tiktok',
          text: postText,
          mode: mode as PublishScheduleMode,
          dueAt: typeof dueAt === 'string' ? dueAt : undefined,
          imageUrls: effectiveTikTokUrls,
        });
        if (bTikTokResult.ok && bTikTokResult.bufferPostId) {
          bufferPostIds.push(bTikTokResult.bufferPostId);
          channelResults.push({
            service: 'tiktok',
            provider: 'buffer',
            ok: true,
            bufferPostId: bTikTokResult.bufferPostId,
          });
        } else {
          warnings.push(`tiktok: ${bTikTokResult.message || 'Buffer TikTok dispatch failed'}`);
          channelResults.push({
            service: 'tiktok',
            provider: 'buffer',
            ok: false,
            message: bTikTokResult.message || 'Buffer TikTok dispatch failed',
          });
        }
      } else {
        channelResults.push({
          service: 'tiktok',
          provider: 'metricool-csv',
          ok: true,
          message: 'Included in Official Metricool 99-Column CSV (Add ZERNIO_API_KEY for 1-click TikTok API)',
        });
      }
    }

    // NOTE: Do NOT destroy Cloudinary images at 0ms on shareNow!
    // Buffer/Zernio background media workers fetch imageUrls asynchronously over the next 15-60 seconds.
    // sweepExpiredCloudinaryAssets() automatically cleans them up 1 hour after postedAt / scheduledFor.
    const cloudinaryCleanedAt: string | undefined = undefined;
    const cleanedIds: string[] = [];

    const bufferFailedCount = channelResults.filter(
      (r) => (r.provider === 'buffer' || r.provider === 'zernio') && !r.ok
    ).length;
    const apiSucceededCount = channelResults.filter(
      (r) => (r.provider === 'buffer' || r.provider === 'zernio') && r.ok
    ).length;
    const hasPublishFailure = bufferFailedCount > 0;
    const allAttemptedApiChannelsFailed = bufferFailedCount > 0 && apiSucceededCount === 0;

    let savedRecord: SavedPostRecord | null = null;
    let nextPosts = existingPosts;

    if (targetRecord) {
      const resolvedScheduledFor =
        mode === 'customScheduled' && typeof dueAt === 'string' && dueAt.trim()
          ? dueAt.trim()
          : mode === 'addToQueue'
          ? (typeof dueAt === 'string' && dueAt.trim()) ||
            new Date(Date.now() + 4 * 3600_000).toISOString()
          : undefined;

      const mergedPublishTargets: PublishTargetPlatform[] = mergeRemoteIds
        ? Array.from(
            new Set<PublishTargetPlatform>([
              ...(targetRecord.publishTargets || []),
              ...validTargets,
            ])
          )
        : validTargets;

      const mergedBufferPostIds = cancelExistingBeforeDispatch
        ? bufferPostIds
        : mergeRemoteIds
        ? Array.from(new Set([...(targetRecord.bufferPostIds || []), ...bufferPostIds]))
        : bufferPostIds.length > 0
        ? bufferPostIds
        : targetRecord.bufferPostIds;

      const mergedZernioPostIds = cancelExistingBeforeDispatch
        ? zernioPostIds
        : mergeRemoteIds
        ? Array.from(new Set([...(targetRecord.zernioPostIds || []), ...zernioPostIds]))
        : zernioPostIds.length > 0
        ? zernioPostIds
        : targetRecord.zernioPostIds;

      const effectivePostStatus =
        isImmediate && !allAttemptedApiChannelsFailed ? 'posted' : 'validated';

      savedRecord = {
        ...targetRecord,
        postStatus: effectivePostStatus,
        publishFailed: hasPublishFailure,
        updatedAt: nowIso,
        postedAt: effectivePostStatus === 'posted' ? nowIso : undefined,
        scheduledFor: resolvedScheduledFor,
        publishTargets: mergedPublishTargets,
        hostedSlideUrls:
          Array.isArray(imageUrls) && imageUrls.length > 0
            ? imageUrls
            : targetRecord.hostedSlideUrls,
        tiktokHostedSlideUrls:
          effectiveTikTokUrls.length > 0
            ? effectiveTikTokUrls
            : targetRecord.tiktokHostedSlideUrls,
        cloudinaryPublicIds:
          Array.isArray(cloudinaryPublicIds) && cloudinaryPublicIds.length > 0
            ? cloudinaryPublicIds
            : targetRecord.cloudinaryPublicIds,
        cloudinaryCleanedAt:
          Array.isArray(cloudinaryPublicIds) && cloudinaryPublicIds.length > 0
            ? undefined
            : cloudinaryCleanedAt || targetRecord.cloudinaryCleanedAt,
        bufferPostIds: mergedBufferPostIds,
        zernioPostIds: mergedZernioPostIds,
        countedInMetricoolMonth:
          mergedPublishTargets.includes('tiktok') &&
          (!mergedZernioPostIds || mergedZernioPostIds.length === 0)
            ? currentMonthKey
            : targetRecord.countedInMetricoolMonth,
        lastDispatchFingerprint: allAttemptedApiChannelsFailed
          ? targetRecord.lastDispatchFingerprint
          : dispatchFingerprint,
        lastDispatchedAt: allAttemptedApiChannelsFailed
          ? targetRecord.lastDispatchedAt
          : nowIso,
        deck: {
          ...targetRecord.deck,
          sourceMeta: {
            ...targetRecord.deck?.sourceMeta,
            publishFailed: hasPublishFailure,
            lastDispatchFingerprint: allAttemptedApiChannelsFailed
              ? targetRecord.deck?.sourceMeta?.lastDispatchFingerprint
              : dispatchFingerprint,
            lastDispatchedAt: allAttemptedApiChannelsFailed
              ? targetRecord.deck?.sourceMeta?.lastDispatchedAt
              : nowIso,
          },
        },
      };

      nextPosts = [
        savedRecord,
        ...existingPosts.filter((p) => p.id !== savedRecord!.id),
      ];
      await upsertSingleStoredPost(savedRecord, existingPosts);
    }

    const quotaStats = computeFreePlanQuotaStats(nextPosts);

    return res.json({
      ok: true,
      idempotentReplay: false,
      dispatchFingerprint,
      mode,
      scheduledFor: savedRecord?.scheduledFor || null,
      cloudinaryCleaned: false,
      cleanedPublicIds: cleanedIds,
      post: savedRecord,
      bufferDispatchedCount: bufferPostIds.length + zernioPostIds.length,
      bufferFailedCount,
      channelResults,
      warnings,
      quotaStats,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to dispatch post';
    console.error('[PublishController] Dispatch error:', msg);
    if (
      partialTargetRecord &&
      (partialBufferPostIds.length > 0 || partialZernioPostIds.length > 0)
    ) {
      try {
        const failedIso = new Date().toISOString();
        const recoveredRecord: SavedPostRecord = {
          ...partialTargetRecord,
          postStatus: 'validated',
          publishFailed: true,
          updatedAt: failedIso,
          bufferPostIds: Array.from(
            new Set([...(partialTargetRecord.bufferPostIds || []), ...partialBufferPostIds])
          ),
          zernioPostIds: Array.from(
            new Set([...(partialTargetRecord.zernioPostIds || []), ...partialZernioPostIds])
          ),
          deck: {
            ...partialTargetRecord.deck,
            sourceMeta: {
              ...partialTargetRecord.deck?.sourceMeta,
              publishFailed: true,
            },
          },
        };
        await upsertSingleStoredPost(recoveredRecord, partialExistingPosts);
      } catch (persistErr) {
        console.warn('[PublishController] Partial-dispatch recovery persistence failed:', persistErr);
      }
    }
    return res.status(500).json({ error: msg });
  } finally {
    if (activeLockKey) {
      activeDispatchLocks.delete(activeLockKey);
    }
    if (activePostLockKey) {
      activeDispatchLocks.delete(activePostLockKey);
    }
  }
}

/**
 * Cancels/deletes a queued or scheduled post on Buffer via GraphQL when unscheduling,
 * rescheduling, or deleting a post from the Vault.
 */
async function deleteBufferPostGraphQl(
  bufferApiKey: string,
  bufferPostId: string
): Promise<{ ok: boolean; message?: string }> {
  if (!bufferApiKey || !bufferPostId) {
    return { ok: false, message: 'Missing Buffer API key or post ID' };
  }

  const query = `
    mutation DeleteMarrokPost($input: DeletePostInput!) {
      deletePost(input: $input) {
        ... on DeletePostSuccess {
          id
        }
        ... on MutationError {
          message
        }
      }
    }
  `;

  try {
    const res = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bufferApiKey}`,
      },
      body: JSON.stringify({
        query,
        variables: { input: { id: bufferPostId } },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return { ok: false, message: `Buffer delete HTTP ${res.status}` };
    }

    const payload = (await res.json()) as {
      data?: {
        deletePost?: { id?: string; message?: string };
      };
      errors?: Array<{ message?: string }>;
    };

    if (payload.data?.deletePost?.id) {
      return { ok: true };
    }
    return {
      ok: false,
      message:
        payload.data?.deletePost?.message ||
        payload.errors?.[0]?.message ||
        'Buffer post already published or removed',
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Buffer delete network error',
    };
  }
}

/**
 * POST /api/publish/manage-post
 * Unified Post Lifecycle Management endpoint supporting:
 * - action: 'reschedule' -> updates scheduledFor & publishTargets (and optionally re-queues on Buffer & Zernio)
 * - action: 'unschedule' -> cancels any active Buffer/Zernio queued IDs, clears scheduledFor, moves back to 'validated' (Draft)
 * - action: 'cancelAndDelete' -> cancels Buffer/Zernio queued IDs, destroys staged Cloudinary media, and deletes from Vault
 */
export async function handleManagePublishedPost(req: Request, res: Response) {
  try {
    const config = getServerConfig();
    const {
      postId,
      action,
      scheduledFor,
      publishTargets,
      requeueBuffer = false,
    } = req.body || {};

    const cleanId = String(postId || '').trim();
    if (!cleanId) {
      return res.status(400).json({ error: 'postId is required' });
    }

    const { posts } = await loadStoredPosts();
    const existing = posts.find((p) => p.id === cleanId);
    if (!existing) {
      return res.status(404).json({ error: 'Saved post not found in Vault' });
    }

    const cancelledBufferIds: string[] = [];
    const warnings: string[] = [];

    // Helper to cancel existing Buffer & Zernio post IDs if present
    const cancelExistingRemoteQueues = async () => {
      const bIds = existing.bufferPostIds || [];
      if (bIds.length > 0 && config.bufferApiKey) {
        for (const bid of bIds) {
          const resCancel = await deleteBufferPostGraphQl(config.bufferApiKey, bid);
          if (resCancel.ok) {
            cancelledBufferIds.push(bid);
          } else if (resCancel.message) {
            warnings.push(`Buffer (${bid.slice(-6)}): ${resCancel.message}`);
          }
        }
      }

      const zIds = existing.zernioPostIds || [];
      if (zIds.length > 0 && config.zernioApiKey) {
        for (const zid of zIds) {
          const resCancel = await deleteZernioPostApi(config.zernioApiKey, zid);
          if (resCancel.ok) {
            cancelledBufferIds.push(zid);
          } else if (resCancel.message) {
            warnings.push(`Zernio (${zid.slice(-6)}): ${resCancel.message}`);
          }
        }
      }
    };

    if (action === 'cancelAndDelete') {
      await cancelExistingRemoteQueues();

      const pubIds = existing.cloudinaryPublicIds || [];
      const cleanedPublicIds: string[] = [];
      if (pubIds.length > 0 && !existing.cloudinaryCleanedAt) {
        const destroyResults = await Promise.all(
          pubIds.map((pid) => destroyCloudinaryAsset(pid, config))
        );
        for (const r of destroyResults) {
          if (r.deleted) cleanedPublicIds.push(r.publicId);
        }
      }

      const remainingPosts = posts.filter((p) => p.id !== cleanId);
      await deleteSingleStoredPost(cleanId, posts);
      const quotaStats = computeFreePlanQuotaStats(remainingPosts);

      return res.json({
        ok: true,
        action: 'cancelAndDelete',
        deletedId: cleanId,
        cancelledBufferIds,
        cleanedPublicIds,
        post: null,
        posts: remainingPosts,
        warnings,
        quotaStats,
      });
    }

    if (action === 'unschedule') {
      await cancelExistingRemoteQueues();

      const nowIso = new Date().toISOString();
      const updatedRecord: SavedPostRecord = {
        ...existing,
        postStatus: 'validated',
        postedAt: undefined,
        scheduledFor: undefined,
        bufferPostIds: undefined,
        zernioPostIds: undefined,
        updatedAt: nowIso,
      };

      const nextPosts = [
        updatedRecord,
        ...posts.filter((p) => p.id !== cleanId),
      ];
      await upsertSingleStoredPost(updatedRecord, posts);
      const quotaStats = computeFreePlanQuotaStats(nextPosts);

      return res.json({
        ok: true,
        action: 'unschedule',
        cancelledBufferIds,
        post: updatedRecord,
        posts: nextPosts,
        warnings,
        quotaStats,
      });
    }

    if (action === 'reschedule') {
      if (!scheduledFor || typeof scheduledFor !== 'string' || Number.isNaN(Date.parse(scheduledFor))) {
        return res.status(400).json({ error: 'Valid scheduledFor ISO timestamp is required' });
      }

      const approveReviewedOverride = req.body?.approveReviewed === true;
      const verifyNumbersOverride = req.body?.verifyNumbers === true;

      const effectiveReviewed =
        approveReviewedOverride ||
        (existing.humanApproved !== false && existing.deck?.sourceMeta?.userReviewed !== false);
      const effectiveVerified =
        verifyNumbersOverride ||
        (existing.verifiedNumbers !== false && existing.deck?.sourceMeta?.verifiedNumbers !== false);

      if (!effectiveReviewed || !effectiveVerified) {
        return res.status(400).json({
          error: !effectiveReviewed
            ? 'Review Safety Gate: Human review (userReviewed = true) is required before scheduling.'
            : 'Review Safety Gate: Claims & numbers must be verified before scheduling.',
          code: 'REVIEW_SAFETY_GATE',
        });
      }

      const nextTargets: PublishTargetPlatform[] = Array.isArray(publishTargets) && publishTargets.length > 0
        ? publishTargets.filter((t): t is PublishTargetPlatform =>
            ['instagram', 'facebook', 'linkedin', 'tiktok'].includes(String(t))
          )
        : existing.publishTargets && existing.publishTargets.length > 0
        ? existing.publishTargets
        : ['instagram', 'facebook', 'linkedin', 'tiktok'];

      const newBufferIds: string[] = [];
      const newZernioIds: string[] = [];

      if (
        requeueBuffer &&
        existing.hostedSlideUrls &&
        existing.hostedSlideUrls.length > 0
      ) {
        await cancelExistingRemoteQueues();

        if (config.bufferApiKey) {
          const channelMap = await resolveBufferChannelMap(config.bufferApiKey);
          const bufferTargets = nextTargets.filter((t) => t !== 'tiktok');
          for (const service of bufferTargets) {
            const channelId = channelMap.get(service);
            if (!channelId) continue;
            const result = await dispatchToBufferGraphQl({
              bufferApiKey: config.bufferApiKey,
              channelId,
              service,
              text: String(existing.deck?.caption || existing.title || ''),
              mode: 'customScheduled',
              dueAt: scheduledFor,
              imageUrls: existing.hostedSlideUrls,
            });
            if (result.ok && result.bufferPostId) {
              newBufferIds.push(result.bufferPostId);
            } else if (result.message) {
              warnings.push(`${service}: ${result.message}`);
            }
          }
        }

        if (config.zernioApiKey && nextTargets.includes('tiktok')) {
          const zMap = await resolveZernioAccountMap(config.zernioApiKey);
          const zTikTok = zMap.get('tiktok');
          if (zTikTok) {
            const tiktokUrls =
              existing.tiktokHostedSlideUrls && existing.tiktokHostedSlideUrls.length > 0
                ? existing.tiktokHostedSlideUrls
                : existing.hostedSlideUrls;
            const zRes = await dispatchToZernioApi({
              zernioApiKey: config.zernioApiKey,
              accountId: zTikTok.accountId,
              service: 'tiktok',
              text: String(existing.deck?.caption || existing.title || ''),
              mode: 'customScheduled',
              dueAt: scheduledFor,
              imageUrls: tiktokUrls,
            });
            if (zRes.ok && zRes.zernioPostId) {
              newZernioIds.push(zRes.zernioPostId);
            } else if (zRes.message) {
              warnings.push(`tiktok: ${zRes.message}`);
            }
          }
        }
      }

      const nowIso = new Date().toISOString();
      const updatedRecord: SavedPostRecord = {
        ...existing,
        postStatus: 'validated',
        humanApproved: effectiveReviewed ? true : existing.humanApproved,
        verifiedNumbers: effectiveVerified ? true : existing.verifiedNumbers,
        deck: existing.deck
          ? {
              ...existing.deck,
              sourceMeta: {
                ...existing.deck.sourceMeta,
                userReviewed: effectiveReviewed ? true : existing.deck.sourceMeta?.userReviewed,
                humanApproved: effectiveReviewed ? true : existing.deck.sourceMeta?.humanApproved,
                verifiedNumbers: effectiveVerified ? true : existing.deck.sourceMeta?.verifiedNumbers,
              },
            }
          : existing.deck,
        postedAt: undefined,
        scheduledFor,
        publishTargets: nextTargets,
        bufferPostIds: newBufferIds.length > 0 ? newBufferIds : existing.bufferPostIds,
        zernioPostIds: newZernioIds.length > 0 ? newZernioIds : existing.zernioPostIds,
        updatedAt: nowIso,
      };

      const nextPosts = [
        updatedRecord,
        ...posts.filter((p) => p.id !== cleanId),
      ];
      await upsertSingleStoredPost(updatedRecord, posts);
      const quotaStats = computeFreePlanQuotaStats(nextPosts);

      return res.json({
        ok: true,
        action: 'reschedule',
        cancelledBufferIds,
        bufferPostIds: updatedRecord.bufferPostIds || [],
        post: updatedRecord,
        posts: nextPosts,
        warnings,
        quotaStats,
      });
    }

    return res.status(400).json({ error: `Unsupported action: ${String(action)}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to manage post';
    console.error('[PublishController] Manage post error:', msg);
    return res.status(500).json({ error: msg });
  }
}

/**
 * GET /api/publish/media/:assetId
 * Serves local fallback JPEG assets if Cloudinary was unreachable.
 */
export function handleServeStagedMedia(req: Request, res: Response) {
  const rawId = String(req.params.assetId || '').replace(/\.jpg$/i, '');
  const entry = LOCAL_MEDIA_CACHE.get(`local_staging/${rawId}`);
  if (!entry) {
    return res.status(404).send('Staged media asset not found or already cleaned up');
  }
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.send(entry.buffer);
}
