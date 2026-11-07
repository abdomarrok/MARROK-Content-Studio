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
  loadStoredPosts,
  saveStoredPosts,
  validateAndBuildPostRecord,
} from './postsController.ts';

const LOCAL_MEDIA_CACHE = new Map<string, { buffer: Buffer; createdAt: number }>();
const MAX_LOCAL_CACHE_ITEMS = 60;

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
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'marrok_staging';
  const signParams: Record<string, string | number> = {
    folder,
    overwrite: 'true',
    public_id: publicId,
    timestamp,
  };

  const signature = signCloudinaryParams(signParams, config.cloudinaryApiSecret);
  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(
    config.cloudinaryCloudName
  )}/image/upload`;

  const body = new URLSearchParams({
    file: dataUrl,
    api_key: config.cloudinaryApiKey,
    timestamp: String(timestamp),
    folder,
    public_id: publicId,
    overwrite: 'true',
    signature,
  });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Cloudinary upload failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as { secure_url?: string; url?: string; public_id?: string };
  const secureUrl = data.secure_url || data.url;
  if (!secureUrl) {
    throw new Error('Cloudinary response did not contain a secure_url');
  }

  return {
    secureUrl,
    publicId: data.public_id || `${folder}/${publicId}`,
    provider: 'cloudinary',
  };
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

/**
 * Stores a base64 JPEG in the local server cache as a resilient fallback when offline.
 */
function storeLocalFallbackMedia(
  dataUrl: string,
  assetKey: string,
  req: Request
): { secureUrl: string; publicId: string; provider: 'local-staging' } {
  const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const buffer = Buffer.from(base64Part, 'base64');

  if (LOCAL_MEDIA_CACHE.size >= MAX_LOCAL_CACHE_ITEMS) {
    const oldestKey = LOCAL_MEDIA_CACHE.keys().next().value;
    if (oldestKey) LOCAL_MEDIA_CACHE.delete(oldestKey);
  }

  const safeKey = assetKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  LOCAL_MEDIA_CACHE.set(`local_staging/${safeKey}`, { buffer, createdAt: Date.now() });

  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
  const origin = process.env.APP_URL && !process.env.APP_URL.includes('localhost')
    ? process.env.APP_URL.replace(/\/+$/, '')
    : `${proto}://${host}`;

  return {
    secureUrl: `${origin}/api/publish/media/${encodeURIComponent(safeKey)}.jpg`,
    publicId: `local_staging/${safeKey}`,
    provider: 'local-staging',
  };
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
  remainingStagedCount: number;
  updatedPosts: SavedPostRecord[];
}> {
  const config = getServerConfig();
  const { posts } = await loadStoredPosts();
  const now = Date.now();
  const ONE_HOUR_MS = 60 * 60 * 1000;

  const cleanedPublicIds: string[] = [];
  const cleanedPostIds: string[] = [];
  let remainingStagedCount = 0;
  let didMutate = false;

  const updatedPosts = await Promise.all(
    posts.map(async (post) => {
      const pubIds = post.cloudinaryPublicIds || [];
      if (pubIds.length === 0 || post.cloudinaryCleanedAt) {
        return post;
      }

      const scheduledMs = post.scheduledFor ? Date.parse(post.scheduledFor) : NaN;
      const isScheduleExpired = Number.isFinite(scheduledMs) && now >= scheduledMs + ONE_HOUR_MS;
      const isImmediatePublished = post.postStatus === 'posted' && !post.scheduledFor;
      const isTargeted =
        Boolean(options?.forceAll) ||
        (Boolean(options?.postId) && post.id === options?.postId);

      if (isTargeted || isScheduleExpired || isImmediatePublished) {
        await Promise.all(pubIds.map((pid) => destroyCloudinaryAsset(pid, config)));
        cleanedPublicIds.push(...pubIds);
        cleanedPostIds.push(post.id);
        didMutate = true;
        return {
          ...post,
          cloudinaryCleanedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      remainingStagedCount += pubIds.length;
      return post;
    })
  );

  if (didMutate) {
    await saveStoredPosts(updatedPosts);
  }

  return {
    cleanedPublicIds,
    cleanedPostIds,
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

/**
 * GET /api/publish/status
 */
export async function handleGetPublishStatus(_req: Request, res: Response) {
  try {
    const config = getServerConfig();
    // Run automatic background sweep for any expired scheduled posts
    const sweepResult = await sweepExpiredCloudinaryAssets();
    const quotaStats = computeFreePlanQuotaStats(sweepResult.updatedPosts);

    return res.json({
      cloudinaryConfigured: isCloudinaryConfigured(config),
      cloudinaryCloudName: config.cloudinaryCloudName || null,
      bufferApiConfigured: Boolean(config.bufferApiKey),
      autoCleanedPostIds: sweepResult.cleanedPostIds,
      ...quotaStats,
    });
  } catch (err) {
    console.error('[PublishController] Failed to get publish status:', err);
    return res.status(500).json({ error: 'Failed to load publishing status' });
  }
}

/**
 * POST /api/publish/upload-media
 * Uploads an array of base64 slide JPEGs to Cloudinary (with signed SHA-1 auth)
 * and returns public HTTPS URLs + Cloudinary public_ids for post-publish cleanup.
 */
export async function handleUploadPublishMedia(req: Request, res: Response) {
  try {
    const config = getServerConfig();
    const { postId = `post_${Date.now()}`, slides } = req.body || {};

    if (!Array.isArray(slides) || slides.length === 0) {
      return res.status(400).json({ error: 'slides array of base64 JPEG dataUrls is required' });
    }

    const cleanPostId = String(postId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
    const batchTs = Math.floor(Date.now() / 1000);
    const canUseCloudinary = isCloudinaryConfigured(config);

    const uploaded = await Promise.all(
      slides.map(async (item: { index?: number; dataUrl?: string }, idx: number) => {
        const slideIdx = typeof item.index === 'number' ? item.index + 1 : idx + 1;
        const dataUrl = String(item.dataUrl || '');
        if (!dataUrl.startsWith('data:image/')) {
          throw new Error(`Slide ${slideIdx} is missing a valid data:image/* payload`);
        }

        const publicId = `${cleanPostId}_s${slideIdx}_${batchTs}`;
        if (canUseCloudinary) {
          try {
            return await uploadSlideToCloudinary(dataUrl, publicId, config);
          } catch (cloudErr) {
            console.warn(
              `[PublishController] Cloudinary upload fallback for slide ${slideIdx}:`,
              cloudErr
            );
            return storeLocalFallbackMedia(dataUrl, publicId, req);
          }
        }
        return storeLocalFallbackMedia(dataUrl, publicId, req);
      })
    );

    return res.json({
      postId: cleanPostId,
      urls: uploaded.map((u) => u.secureUrl),
      publicIds: uploaded.map((u) => u.publicId),
      provider: uploaded[0]?.provider || 'cloudinary',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to upload slide media';
    console.error('[PublishController] Media upload error:', msg);
    return res.status(500).json({ error: msg });
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

/**
 * Dispatches a post to Buffer's GraphQL API if BUFFER_API_KEY is configured.
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
            type: imageUrls.length > 1 ? 'carousel' : 'post',
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
      ...(dueAt && graphqlMode === 'customScheduled' ? { dueAt } : {}),
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
      return { ok: false, message: `Buffer API HTTP ${res.status}` };
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
 * Publishes or schedules a post across selected targets, persists schedule metadata in the Vault,
 * and automatically cleans up Cloudinary media immediately when mode === 'shareNow'.
 */
export async function handleDispatchPublish(req: Request, res: Response) {
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
      targets = ['instagram', 'facebook', 'linkedin'],
      imageUrls = [],
      cloudinaryPublicIds = [],
      autoCleanupImmediate = true,
    } = body;

    const validTargets: PublishTargetPlatform[] = Array.isArray(targets)
      ? targets.filter((t): t is PublishTargetPlatform =>
          ['instagram', 'facebook', 'linkedin', 'tiktok'].includes(String(t))
        )
      : ['instagram'];

    const { posts: existingPosts } = await loadStoredPosts();
    const existingRecord = postId ? existingPosts.find((p) => p.id === postId) : undefined;

    // Build or update the SavedPostRecord in the Vault
    let targetRecord: SavedPostRecord | undefined = existingRecord;
    if (deck) {
      const validation = validateAndBuildPostRecord({
        id: postId,
        deck,
        title,
        postStatus: 'posted',
        allowOverride: true,
        existingRecord,
      });
      if (validation.ok) {
        targetRecord = validation.record;
      }
    }

    const nowIso = new Date().toISOString();
    const currentMonthKey = nowIso.slice(0, 7);
    const bufferPostIds: string[] = [];

    // If Buffer API key is configured on the server, dispatch to Buffer GraphQL API
    if (config.bufferApiKey && Array.isArray(imageUrls) && imageUrls.length > 0) {
      const bufferTargets = validTargets.filter((t) => t !== 'tiktok');
      for (const service of bufferTargets) {
        const ch = DEFAULT_CONNECTED_CHANNELS.find((c) => c.service === service);
        if (!ch) continue;
        const result = await dispatchToBufferGraphQl({
          bufferApiKey: config.bufferApiKey,
          channelId: ch.id,
          service,
          text: String(caption || deck?.caption || ''),
          mode: mode as PublishScheduleMode,
          dueAt: typeof dueAt === 'string' ? dueAt : undefined,
          imageUrls,
        });
        if (result.bufferPostId) {
          bufferPostIds.push(result.bufferPostId);
        }
      }
    }

    // Immediate publish ('shareNow'): automatically clean up staged Cloudinary images right after dispatch!
    let cloudinaryCleanedAt: string | undefined;
    const cleanedIds: string[] = [];
    if (
      mode === 'shareNow' &&
      autoCleanupImmediate &&
      Array.isArray(cloudinaryPublicIds) &&
      cloudinaryPublicIds.length > 0
    ) {
      const destroyResults = await Promise.all(
        cloudinaryPublicIds.map((pid: string) => destroyCloudinaryAsset(String(pid), config))
      );
      for (const r of destroyResults) {
        if (r.deleted) cleanedIds.push(r.publicId);
      }
      cloudinaryCleanedAt = nowIso;
    }

    let savedRecord: SavedPostRecord | null = null;
    let nextPosts = existingPosts;

    if (targetRecord) {
      savedRecord = {
        ...targetRecord,
        postStatus: 'posted',
        updatedAt: nowIso,
        postedAt: mode === 'shareNow' ? nowIso : targetRecord.postedAt || nowIso,
        scheduledFor:
          mode === 'customScheduled' && typeof dueAt === 'string'
            ? dueAt
            : mode === 'addToQueue'
            ? dueAt || new Date(Date.now() + 4 * 3600_000).toISOString()
            : undefined,
        publishTargets: validTargets,
        hostedSlideUrls: Array.isArray(imageUrls) ? imageUrls : targetRecord.hostedSlideUrls,
        cloudinaryPublicIds: Array.isArray(cloudinaryPublicIds)
          ? cloudinaryPublicIds
          : targetRecord.cloudinaryPublicIds,
        cloudinaryCleanedAt: cloudinaryCleanedAt || targetRecord.cloudinaryCleanedAt,
        bufferPostIds: bufferPostIds.length > 0 ? bufferPostIds : targetRecord.bufferPostIds,
        countedInMetricoolMonth: validTargets.includes('tiktok')
          ? currentMonthKey
          : targetRecord.countedInMetricoolMonth,
      };

      nextPosts = [
        savedRecord,
        ...existingPosts.filter((p) => p.id !== savedRecord!.id),
      ];
      await saveStoredPosts(nextPosts);
    }

    const quotaStats = computeFreePlanQuotaStats(nextPosts);

    return res.json({
      ok: true,
      mode,
      scheduledFor: savedRecord?.scheduledFor || null,
      cloudinaryCleaned: Boolean(cloudinaryCleanedAt),
      cleanedPublicIds: cleanedIds,
      post: savedRecord,
      quotaStats,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to dispatch post';
    console.error('[PublishController] Dispatch error:', msg);
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
