import type { Request, Response } from 'express';
import dns from 'node:dns';
import net from 'node:net';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB cap per Phase 1 security spec

export const ALLOWED_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
] as const;

export const ALLOWED_SEARCH_IMAGE_HOSTS = new Set([
  'cdn.jsdelivr.net',
  'raw.githubusercontent.com',
  'avatars.githubusercontent.com',
  'github.githubassets.com',
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'images.unsplash.com',
  'unpkg.com',
]);

/**
 * Checks whether an IP belongs to private, loopback, link-local, or cloud metadata ranges.
 */
export function isPrivateOrLoopbackIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return true;
    const [b0, b1] = parts;
    if (b0 === 127) return true; // 127.0.0.0/8 (Loopback)
    if (b0 === 10) return true; // 10.0.0.0/8 (Private)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true; // 172.16.0.0/12 (Private)
    if (b0 === 192 && b1 === 168) return true; // 192.168.0.0/16 (Private)
    if (b0 === 169 && b1 === 254) return true; // 169.254.0.0/16 (Link-local / Cloud metadata: 169.254.169.254)
    if (b0 === 0) return true; // 0.0.0.0/8
    if (b0 === 100 && b1 >= 64 && b1 <= 127) return true; // 100.64.0.0/10 (Shared NAT)
    if (b0 >= 224) return true; // Multicast & reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // fc00::/7 (Unique local)
    if (
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true; // fe80::/10 (Link-local)
    }
    if (normalized.startsWith('::ffff:')) {
      const v4Part = normalized.substring(7);
      return isPrivateOrLoopbackIp(v4Part);
    }
    return false;
  }
  return true;
}

/**
 * Validates hostname against internal/private naming conventions and patterns.
 */
export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower.endsWith('.arpa') ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower === '[::1]'
  ) {
    return true;
  }
  // Decimal integer, octal, or hex IP bypasses (e.g., 2130706433 or 0x7f000001)
  if (/^\d+$/.test(lower) || /^0x[0-9a-f]+$/i.test(lower)) {
    return true;
  }
  return false;
}

/**
 * Validates that a URL string uses https:// and does not target a blocked or private host.
 */
export function isAllowedProxyUrl(rawUrl: string, requireSearchAllowlist = false): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    if (isBlockedHostname(parsed.hostname)) return false;
    if (net.isIP(parsed.hostname) && isPrivateOrLoopbackIp(parsed.hostname)) return false;
    if (requireSearchAllowlist && !ALLOWED_SEARCH_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitizes raw SVG markup by stripping scripts, foreignObject, embedded objects, event handlers, and javascript: URIs.
 */
export function sanitizeSvgContent(svgText: string): string {
  return svgText
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '')
    .replace(/<(?:iframe|object|embed)\b[^>]*>.*?<\/(?:iframe|object|embed)>/gis, '')
    .replace(/<(?:iframe|object|embed)\b[^>]*\/?>/gi, '')
    .replace(/\bon\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '')
    .replace(/(?:href|xlink:href)\s*=\s*["']\s*javascript:[^"']*["']/gi, '');
}

/**
 * Performs DNS resolution to guarantee the host does not resolve to an internal/private address.
 */
export async function resolveAndValidateHost(hostname: string): Promise<boolean> {
  if (isBlockedHostname(hostname)) return false;
  if (net.isIP(hostname)) {
    return !isPrivateOrLoopbackIp(hostname);
  }
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) return false;
    for (const addr of addresses) {
      if (isPrivateOrLoopbackIp(addr.address)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely fetches an image over HTTPS following controlled redirects and rejecting private destinations at every hop.
 */
async function fetchSafeImage(
  initialUrl: string,
  requireSearchAllowlist = false,
  maxHops = 3
): Promise<globalThis.Response> {
  let currentUrl = initialUrl;
  for (let hop = 0; hop <= maxHops; hop++) {
    const parsed = new URL(currentUrl);
    if (parsed.protocol !== 'https:') {
      throw new Error('Only https protocol is allowed');
    }

    if (requireSearchAllowlist && !ALLOWED_SEARCH_IMAGE_HOSTS.has(parsed.hostname.toLowerCase())) {
      throw new Error(`Host "${parsed.hostname}" is not in the search media allowlist.`);
    }

    const isSafe = await resolveAndValidateHost(parsed.hostname);
    if (!isSafe) {
      throw new Error(`Target destination "${parsed.hostname}" is restricted or private.`);
    }

    const response = await fetch(currentUrl, {
      headers: {
        'User-Agent': 'MARROK-TikTok-Studio/2.0',
        Accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml',
      },
      signal: AbortSignal.timeout(6000),
      redirect: 'manual',
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Redirect returned with missing Location header');
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return response;
  }
  throw new Error('Too many redirects encountered');
}

export interface SafeRemoteTextOptions {
  maxHops?: number;
  maxBytes?: number;
  timeoutMs?: number;
  acceptHeader?: string;
  userAgent?: string;
  rejectOversize?: boolean;
}

/**
 * Safely fetches remote text/XML/HTML over HTTPS with manual redirect traversal,
 * hop-by-hop DNS & private/metadata IP validation (blocking 169.254.169.254, 127.0.0.1,
 * localhost, and RFC1918/ULA ranges), redirect hop cap, and streaming response byte limit.
 */
export async function fetchSafeRemoteText(
  initialUrl: string,
  options?: SafeRemoteTextOptions
): Promise<{ response: globalThis.Response; finalUrl: string; text: string; byteLength: number }> {
  const maxHops = options?.maxHops ?? 3;
  const maxBytes = options?.maxBytes ?? 400_000;
  const timeoutMs = options?.timeoutMs ?? 6000;
  const acceptHeader = options?.acceptHeader ?? 'text/plain,text/html,application/xml,*/*;q=0.8';
  const userAgent = options?.userAgent ?? 'MARROK-Content-Gatherer/2.0';
  const rejectOversize = options?.rejectOversize ?? false;

  let currentUrl = initialUrl;
  for (let hop = 0; hop <= maxHops; hop++) {
    if (!isAllowedProxyUrl(currentUrl, false)) {
      throw new Error('SSRF_BLOCKED_URL: Invalid or blocked URL. Only public https:// URLs are permitted.');
    }

    const parsed = new URL(currentUrl);
    const isSafe = await resolveAndValidateHost(parsed.hostname);
    if (!isSafe) {
      throw new Error('SSRF_BLOCKED_IP: Target hostname resolved to a restricted or private IP address.');
    }

    const response = await fetch(currentUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': userAgent,
        Accept: acceptHeader,
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Upstream redirect (${response.status}) missing Location header.`);
      }
      if (hop === maxHops) {
        throw new Error(`Exceeded maximum redirect hops (${maxHops}).`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const declaredBytes = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes && rejectOversize) {
        throw new Error(`RESPONSE_TOO_LARGE: Content-Length ${declaredBytes} exceeds ${maxBytes} byte limit.`);
      }
    }

    let text = '';
    let byteLength = 0;
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks: Buffer[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          const remaining = maxBytes - total;
          if (remaining <= 0) {
            if (rejectOversize) {
              throw new Error(`RESPONSE_TOO_LARGE: Stream exceeded ${maxBytes} byte limit.`);
            }
            break;
          }
          if (value.byteLength > remaining) {
            if (rejectOversize) {
              throw new Error(`RESPONSE_TOO_LARGE: Stream exceeded ${maxBytes} byte limit.`);
            }
            chunks.push(Buffer.from(value.subarray(0, remaining)));
            total += remaining;
            break;
          }
          chunks.push(Buffer.from(value));
          total += value.byteLength;
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const combined = Buffer.concat(chunks);
      byteLength = combined.byteLength;
      text = combined.toString('utf-8');
    } else {
      const rawBuf = Buffer.from(await response.arrayBuffer());
      if (rawBuf.byteLength > maxBytes && rejectOversize) {
        throw new Error(`RESPONSE_TOO_LARGE: Payload exceeded ${maxBytes} byte limit.`);
      }
      const capped = rawBuf.byteLength > maxBytes ? rawBuf.subarray(0, maxBytes) : rawBuf;
      byteLength = capped.byteLength;
      text = capped.toString('utf-8');
    }

    return { response, finalUrl: currentUrl, text, byteLength };
  }

  throw new Error('Too many redirects encountered');
}

/**
 * CORS-safe image proxy with strict HTTPS + SSRF protection, 2MB size cap, CSP sandbox headers, and SVG sanitization.
 */
export async function handleProxyImage(req: Request, res: Response) {
  const targetUrl = req.query.url as string;
  const requestedColor = (req.query.color as string) || '';
  const requireSearchAllowlist = req.query.source === 'search';

  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'url query parameter is required' });
  }

  if (!targetUrl.startsWith('https://')) {
    return res.status(400).json({ error: 'Only https protocol is allowed' });
  }

  if (!isAllowedProxyUrl(targetUrl, requireSearchAllowlist)) {
    return res.status(400).json({ error: 'URL host is blocked or not permitted' });
  }

  try {
    const upstreamRes = await fetchSafeImage(targetUrl, requireSearchAllowlist);

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({ error: `Upstream error: ${upstreamRes.statusText}` });
    }

    // 1. Content-Length early exit (2 MB cap)
    const contentLength = upstreamRes.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: 'Image exceeds maximum allowed size (2MB)' });
    }

    // 2. Strict Content-Type validation (reject non-permitted MIME types with 415)
    const rawContentType = (upstreamRes.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
    const isAllowedType = (ALLOWED_CONTENT_TYPES as readonly string[]).includes(rawContentType);

    if (!isAllowedType) {
      return res.status(415).json({
        error: `Unsupported content type "${rawContentType}". Permitted: image/png, image/jpeg, image/webp, image/gif, image/svg+xml.`,
      });
    }

    // 3. Size-capped arrayBuffer read
    const rawBuffer = Buffer.from(await upstreamRes.arrayBuffer());
    if (rawBuffer.byteLength > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: 'Image exceeds maximum allowed size (2MB)' });
    }

    // Apply strict security headers to all proxied image responses
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (rawContentType === 'image/svg+xml') {
      let svgText = sanitizeSvgContent(rawBuffer.toString('utf-8'));

      // Optional opt-in theme recoloring (only when ?color= is explicitly passed)
      let hexColor = requestedColor.trim();
      if (hexColor && /^#?[0-9a-fA-F]{3,8}$/.test(hexColor)) {
        if (!hexColor.startsWith('#')) {
          hexColor = `#${hexColor}`;
        }
        svgText = svgText.replace(/<svg\b([^>]*)>/i, (_match, attrs) => {
          const cleanAttrs = attrs.replace(/\bfill="[^"]*"/gi, '');
          return `<svg ${cleanAttrs} fill="${hexColor}" style="color: ${hexColor}; fill: ${hexColor};">`;
        });
        svgText = svgText.replace(/\bfill="(?:currentColor|#000|#000000|black)"/gi, `fill="${hexColor}"`);
        svgText = svgText.replace(/<path\b((?![^>]*\bfill=)[^>]*)>/gi, `<path fill="${hexColor}" $1>`);
      }

      const modifiedBuffer = Buffer.from(svgText, 'utf-8');
      res.setHeader('Content-Type', 'image/svg+xml;charset=utf-8');
      return res.send(modifiedBuffer);
    }

    res.setHeader('Content-Type', rawContentType);
    return res.send(rawBuffer);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Failed to proxy image:`, msg);
    return res.status(400).json({ error: 'Failed to proxy external image', details: msg });
  }
}
