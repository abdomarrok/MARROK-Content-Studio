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
import { stripLeadingDuplicateTikTokTitle } from '../../src/lib/publish/publishClient.ts';

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
      const postedMs = post.postedAt ? Date.parse(post.postedAt) : NaN;
      // Keep immediate-published Cloudinary images live for 1 hour so Buffer's async media worker & Metricool CSV imports never hit 404
      const isImmediatePublishedExpired =
        post.postStatus === 'posted' &&
        !post.scheduledFor &&
        (!Number.isFinite(postedMs) || now >= postedMs + ONE_HOUR_MS);
      const isTargeted =
        Boolean(options?.forceAll) ||
        (Boolean(options?.postId) && post.id === options?.postId);

      if (isTargeted || isScheduleExpired || isImmediatePublishedExpired) {
        await Promise.all(pubIds.map((pid) => destroyCloudinaryAsset(pid, config)));
        cleanedPublicIds.push(...pubIds);
        cleanedPostIds.push(post.id);
        didMutate = true;
        return {
          ...post,
          postStatus: isScheduleExpired ? 'posted' : post.postStatus,
          postedAt: isScheduleExpired ? post.postedAt || post.scheduledFor : post.postedAt,
          cloudinaryPublicIds: [],
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
 * Uploads a base64 JPEG data URL to a public, ephemeral HTTPS host (uguu.se, 3-hour TTL)
 * when Cloudinary credentials are not configured in environment secrets, ensuring Buffer's
 * GraphQL media workers and Metricool CSV imports always receive a public HTTPS image/jpeg URL.
 */
async function uploadSlideToPublicEphemeralHost(
  dataUrl: string,
  publicId: string
): Promise<{ secureUrl: string; publicId: string; provider: 'cloudinary' }> {
  const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const buffer = Buffer.from(base64Part, 'base64');
  const safeName = `${publicId.replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg`;

  const form = new FormData();
  form.append('files[]', new Blob([buffer], { type: 'image/jpeg' }), safeName);

  const res = await fetch('https://uguu.se/upload', {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Public HTTPS staging failed (${res.status})`);
  }

  const payload = (await res.json()) as {
    success?: boolean;
    files?: Array<{ url?: string }>;
  };

  const publicHttpsUrl = payload.files?.[0]?.url;
  if (!publicHttpsUrl || !publicHttpsUrl.startsWith('https://')) {
    throw new Error('Public HTTPS staging did not return a valid https:// URL');
  }

  return {
    secureUrl: publicHttpsUrl,
    publicId: `ephemeral_staging/${publicId}`,
    provider: 'cloudinary',
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
      cloudinaryConfigured: isCloudinaryConfigured(config),
      cloudinaryCloudName: config.cloudinaryCloudName || null,
      bufferApiConfigured: Boolean(config.bufferApiKey),
      zernioApiConfigured: Boolean(config.zernioApiKey),
      zernioMcpUrl: 'https://mcp.zernio.com/mcp',
      autoCleanedPostIds: sweepResult.cleanedPostIds,
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
 * Uploads an array of base64 slide JPEGs to Cloudinary (with signed SHA-1 auth),
 * or to a public ephemeral HTTPS host when Cloudinary secrets are not configured,
 * and returns public HTTPS URLs + public_ids for post-publish cleanup.
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
          }
        }

        // If Cloudinary is not configured or failed, stage to a public ephemeral HTTPS URL
        // so Buffer GraphQL API, Zernio REST API, and Metricool CSV imports can download the JPEG over HTTPS.
        if (!process.env.VITEST) {
          try {
            return await uploadSlideToPublicEphemeralHost(dataUrl, publicId);
          } catch (ephemeralErr) {
            console.warn(
              `[PublishController] Public HTTPS ephemeral staging fallback for slide ${slideIdx}:`,
              ephemeralErr
            );
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
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${zernioApiKey}`,
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return cachedTikTokMusicCatalog?.tracks || FALLBACK_TIKTOK_COMMERCIAL_TRACKS;
    }

    const payload = (await res.json()) as {
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
    };

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
      timezone,
      targets = ['instagram', 'facebook', 'linkedin'],
      imageUrls = [],
      tiktokImageUrls = [],
      cloudinaryPublicIds = [],
      tiktokSettings,
    } = body;

    const validTargets: PublishTargetPlatform[] = Array.isArray(targets)
      ? targets.filter((t): t is PublishTargetPlatform =>
          ['instagram', 'facebook', 'linkedin', 'tiktok'].includes(String(t))
        )
      : ['instagram'];

    const { posts: existingPosts } = await loadStoredPosts();
    const existingRecord = postId ? existingPosts.find((p) => p.id === postId) : undefined;

    const isImmediate = mode === 'shareNow';

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

    const nowIso = new Date().toISOString();
    const currentMonthKey = nowIso.slice(0, 7);
    const bufferPostIds: string[] = [];
    const zernioPostIds: string[] = [];
    const warnings: string[] = [];
    const channelResults: Array<{
      service: PublishTargetPlatform;
      provider: 'buffer' | 'zernio' | 'metricool-csv';
      ok: boolean;
      bufferPostId?: string;
      zernioPostId?: string;
      message?: string;
    }> = [];

    const effectiveTikTokUrls: string[] =
      Array.isArray(tiktokImageUrls) && tiktokImageUrls.length > 0
        ? tiktokImageUrls
        : Array.isArray(imageUrls)
        ? imageUrls
        : [];

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

    const postText = String(caption || deck?.caption || '');

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

      savedRecord = {
        ...targetRecord,
        postStatus: isImmediate ? 'posted' : 'validated',
        updatedAt: nowIso,
        postedAt: isImmediate ? nowIso : undefined,
        scheduledFor: resolvedScheduledFor,
        publishTargets: validTargets,
        hostedSlideUrls: Array.isArray(imageUrls) ? imageUrls : targetRecord.hostedSlideUrls,
        tiktokHostedSlideUrls:
          effectiveTikTokUrls.length > 0
            ? effectiveTikTokUrls
            : targetRecord.tiktokHostedSlideUrls,
        cloudinaryPublicIds: Array.isArray(cloudinaryPublicIds)
          ? cloudinaryPublicIds
          : targetRecord.cloudinaryPublicIds,
        cloudinaryCleanedAt:
          Array.isArray(cloudinaryPublicIds) && cloudinaryPublicIds.length > 0
            ? undefined
            : cloudinaryCleanedAt || targetRecord.cloudinaryCleanedAt,
        bufferPostIds: bufferPostIds.length > 0 ? bufferPostIds : targetRecord.bufferPostIds,
        zernioPostIds: zernioPostIds.length > 0 ? zernioPostIds : targetRecord.zernioPostIds,
        countedInMetricoolMonth:
          validTargets.includes('tiktok') && zernioPostIds.length === 0
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
    const bufferFailedCount = channelResults.filter(
      (r) => (r.provider === 'buffer' || r.provider === 'zernio') && !r.ok
    ).length;

    return res.json({
      ok: true,
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
    return res.status(500).json({ error: msg });
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
      await saveStoredPosts(remainingPosts);
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
      await saveStoredPosts(nextPosts);
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
      await saveStoredPosts(nextPosts);
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
