import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { TECH_ICONS_LIST } from '../constants.ts';
import { isAllowedProxyUrl, resolveAndValidateHost } from './proxyController.ts';

/**
 * Subject-based media search: official tech icons + Wikimedia technical diagrams.
 */
export async function handleSearchMedia(req: Request, res: Response) {
  const query = ((req.query.q as string) || '').trim().toLowerCase();

  // 1. Filter curated tech brand icons
  const matchedIcons = TECH_ICONS_LIST.filter(
    (item) =>
      !query ||
      item.name.includes(query) ||
      item.title.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
  );

  // 2. Fetch subject-based diagrams / illustrations from Wikimedia Commons API
  const matchedImages: { title: string; url: string; thumbUrl: string; source: string }[] = [];

  if (query && query.length >= 2) {
    try {
      const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
        `${query} diagram OR architecture OR logo`
      )}&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=400&format=json`;

      const wikiRes = await fetch(wikiUrl, {
        headers: { 'User-Agent': 'MARROK-TikTok-Studio/2.0 (marrok.org; technical carousel generator)' },
        signal: AbortSignal.timeout(4000),
      });

      if (wikiRes.ok) {
        const data = await wikiRes.json();
        const pages = data.query?.pages || {};
        for (const pageId of Object.keys(pages)) {
          const info = pages[pageId]?.imageinfo?.[0];
          if (info?.thumburl || info?.url) {
            matchedImages.push({
              title: pages[pageId].title?.replace(/^File:/, '') || query,
              url: info.url,
              thumbUrl: info.thumburl || info.url,
              source: 'Wikimedia Commons',
            });
          }
        }
      }
    } catch (wikiErr) {
      console.warn('Wikimedia media search fallback error:', wikiErr);
    }
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.json({
    icons: matchedIcons.slice(0, 24),
    images: matchedImages.slice(0, 16),
  });
}

// ============================================================================
// Automated Post Gathering & URL Content Extraction
// Consolidated in mediaController.ts to stay strictly under Vercel Hobby's
// 12 Serverless Functions file limit in /api.
// ============================================================================

export type GatherSourceType = 'reddit' | 'hn' | 'lobsters' | 'rss' | 'github' | 'custom-url' | 'curated';

export interface GatheredTopicItem {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  sourceType: GatherSourceType;
  author?: string;
  brand: string;
  brandUrl: string;
  domainCategory:
    | 'REVERSE ENGINEERING'
    | 'AI AGENTS & MODELS'
    | 'LINUX KERNEL'
    | 'KUBERNETES & CLOUD'
    | 'DISTRIBUTED SYSTEMS';
  publishedAt: string;
  score: number;
  summary: string;
  extractedMetrics: string[];
  recommendedFormat: 'carousel' | 'single' | 'reel';
  synthesisPrompt: string;
}

export interface ExtractedUrlPayload {
  ok: boolean;
  topic: GatheredTopicItem;
  rawTextLength: number;
}

const RADAR_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let cachedRadarItems: GatheredTopicItem[] | null = null;
let cachedRadarTimestamp = 0;

const METRIC_REGEX =
  /\b\d+(?:\.\d+)?(?:\s*(?:x|%|ms|µs|us|ns|s|gb\/s|mb\/s|gb|mb|tb|kb|req\/s|rps|qps|tps|ops\/s|tokens\/s|b\b|m\b|k\b))/gi;

/**
 * Classifies a title + summary into one of MARROK's 5 core engineering domains.
 */
export function classifyEngineeringDomain(
  text: string
): GatheredTopicItem['domainCategory'] {
  const lower = text.toLowerCase();
  if (
    /\b(cve-\d+|exploit|vulnerability|zero-day|0day|ghidra|reverse\s*engineer|malware|rce|auth\s*bypass|cryptograph|mtls|zero-trust|seccomp|sandbox)\b/.test(
      lower
    )
  ) {
    return 'REVERSE ENGINEERING';
  }
  if (
    /\b(llm|gpt|claude|gemini|deepseek|transformer|inference|kv-cache|moe|agent|rag|cuda|gpu|tensor|vllm|neural|quantiz|embedding)\b/.test(
      lower
    )
  ) {
    return 'AI AGENTS & MODELS';
  }
  if (
    /\b(linux|kernel|ebpf|xdp|io_uring|syscall|posix|scheduler|cgroups|rust\s+for\s+linux|memory\s+allocator|page\s+table)\b/.test(
      lower
    )
  ) {
    return 'LINUX KERNEL';
  }
  if (
    /\b(kubernetes|k8s|docker|container|envoy|istio|cilium|aws|gcp|cloudflare|serverless|microvm|firecracker|wasm|isolate)\b/.test(
      lower
    )
  ) {
    return 'KUBERNETES & CLOUD';
  }
  return 'DISTRIBUTED SYSTEMS';
}

/**
 * Extracts quantitative benchmark/engineering metrics from text.
 */
export function extractQuantitativeMetrics(text: string): string[] {
  const matches = text.match(METRIC_REGEX) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const clean = m.trim();
    const key = clean.toLowerCase();
    if (!seen.has(key) && clean.length >= 2) {
      seen.add(key);
      out.push(clean);
    }
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * Recommends 'carousel' for deep architectural breakdowns and 'single' (1-slide poster)
 * for concise benchmark releases or security advisories.
 */
export function recommendPostFormat(
  title: string,
  summary: string,
  metrics: string[]
): 'carousel' | 'single' | 'reel' {
  const combined = `${title} ${summary}`.toLowerCase();
  if (
    /\b(architecture|how\s+we|deep\s+dive|under\s+the\s+hood|scaling|postmortem|migrating|designing|internals)\b/.test(
      combined
    ) ||
    summary.length > 360
  ) {
    return 'carousel';
  }
  if (metrics.length >= 2 && summary.length <= 260) {
    return 'single';
  }
  return 'carousel';
}

function deriveBrandFromUrl(rawUrl: string, fallbackSource = 'MARROK'): { brand: string; brandUrl: string } {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (host.includes('cloudflare.com')) return { brand: 'Cloudflare Engineering', brandUrl: host };
    if (host.includes('netflix')) return { brand: 'Netflix TechBlog', brandUrl: host };
    if (host.includes('uber.com')) return { brand: 'Uber Engineering', brandUrl: host };
    if (host.includes('anthropic.com')) return { brand: 'Anthropic Research', brandUrl: host };
    if (host.includes('github.com') || host.includes('github.blog')) return { brand: 'GitHub Engineering', brandUrl: host };
    if (host.includes('discord.com')) return { brand: 'Discord Engineering', brandUrl: host };
    if (host.includes('tailscale.com')) return { brand: 'Tailscale Engineering', brandUrl: host };
    if (host.includes('fly.io')) return { brand: 'Fly.io Engineering', brandUrl: host };
    if (host.includes('arxiv.org')) return { brand: 'arXiv CS Research', brandUrl: host };
    const firstPart = host.split('.')[0] || fallbackSource;
    const capitalized = firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
    return { brand: capitalized, brandUrl: host };
  } catch {
    return { brand: fallbackSource, brandUrl: 'marrok.org' };
  }
}

export function buildSynthesisPromptFromTopic(item: {
  title: string;
  url: string;
  brand: string;
  summary: string;
  extractedMetrics: string[];
}): string {
  const metricsLine =
    item.extractedMetrics.length > 0
      ? `\nKey Quantitative Metrics: ${item.extractedMetrics.join(', ')}`
      : '';
  return `${item.title} (${item.brand})\nSource URL: ${item.url}\n\nTechnical Summary & Engineering Context:\n${item.summary}${metricsLine}`;
}

/**
 * Curated high-signal engineering stories always available as baseline or offline fallback.
 */
export const CURATED_ENGINEERING_TOPICS: GatheredTopicItem[] = [
  {
    id: 'gather_cf_pingora_rust',
    title: 'How Cloudflare Built Pingora: Replacing NGINX with Memory-Safe Rust at 1 Trillion+ Daily Requests',
    url: 'https://blog.cloudflare.com/how-we-built-pingora-the-proxy-that-connects-cloudflare-to-the-internet/',
    sourceName: 'Cloudflare Engineering',
    sourceType: 'curated',
    author: 'Cloudflare Systems Team',
    brand: 'Cloudflare Engineering',
    brandUrl: 'blog.cloudflare.com',
    domainCategory: 'KUBERNETES & CLOUD',
    publishedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    score: 640,
    summary:
      'Cloudflare replaced its legacy multi-process NGINX proxy with Pingora, an async multi-threaded Rust proxy service. By sharing connection pools across worker threads with work-stealing scheduling, Pingora reduced CPU utilization by 70% and memory consumption by 67% while handling over 1 trillion requests per day.',
    extractedMetrics: ['70% CPU reduction', '67% less memory', '1T+ daily requests'],
    recommendedFormat: 'carousel',
    synthesisPrompt:
      'How Cloudflare Built Pingora: Replacing NGINX with Memory-Safe Rust at 1 Trillion+ Daily Requests (Cloudflare Engineering)\nSource URL: https://blog.cloudflare.com/how-we-built-pingora-the-proxy-that-connects-cloudflare-to-the-internet/\n\nTechnical Summary & Engineering Context:\nCloudflare replaced its legacy multi-process NGINX proxy with Pingora, an async multi-threaded Rust proxy service. By sharing connection pools across worker threads with work-stealing scheduling, Pingora reduced CPU utilization by 70% and memory consumption by 67% while handling over 1 trillion requests per day.\nKey Quantitative Metrics: 70% CPU reduction, 67% less memory, 1T+ daily requests',
  },
  {
    id: 'gather_deepseek_mla_kv',
    title: 'DeepSeek Multi-Head Latent Attention (MLA): Compressing KV-Cache by 93.3% for High-Throughput Inference',
    url: 'https://arxiv.org/abs/2405.04434',
    sourceName: 'arXiv CS.CL / AI Systems',
    sourceType: 'curated',
    author: 'DeepSeek-AI Research',
    brand: 'arXiv CS Research',
    brandUrl: 'arxiv.org',
    domainCategory: 'AI AGENTS & MODELS',
    publishedAt: new Date(Date.now() - 4 * 3600_000).toISOString(),
    score: 580,
    summary:
      'Standard Multi-Head Attention bottlenecks LLM decoding on GPU HBM bandwidth due to massive Key-Value (KV) cache growth. Multi-Head Latent Attention (MLA) projects keys and values into a low-rank joint latent vector, shrinking KV-cache memory footprint by 93.3% and boosting generation throughput by 5.76x.',
    extractedMetrics: ['93.3% KV reduction', '5.76x throughput'],
    recommendedFormat: 'carousel',
    synthesisPrompt:
      'DeepSeek Multi-Head Latent Attention (MLA): Compressing KV-Cache by 93.3% for High-Throughput Inference (arXiv CS Research)\nSource URL: https://arxiv.org/abs/2405.04434\n\nTechnical Summary & Engineering Context:\nStandard Multi-Head Attention bottlenecks LLM decoding on GPU HBM bandwidth due to massive Key-Value (KV) cache growth. Multi-Head Latent Attention (MLA) projects keys and values into a low-rank joint latent vector, shrinking KV-cache memory footprint by 93.3% and boosting generation throughput by 5.76x.\nKey Quantitative Metrics: 93.3% KV reduction, 5.76x throughput',
  },
  {
    id: 'gather_discord_trillions_scylla',
    title: 'How Discord Stores Trillions of Messages: Migrating from Cassandra to ScyllaDB with Rust Data Services',
    url: 'https://discord.com/blog/how-discord-stores-trillions-of-messages',
    sourceName: 'Discord Engineering',
    sourceType: 'curated',
    author: 'Bo Ingram',
    brand: 'Discord Engineering',
    brandUrl: 'discord.com',
    domainCategory: 'DISTRIBUTED SYSTEMS',
    publishedAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
    score: 520,
    summary:
      'Facing JVM garbage collection pauses and hot-partition tail latency across 177 Cassandra nodes, Discord re-architected its storage tier onto a 72-node ScyllaDB C++ shard-per-core cluster fronted by a Rust request coalescing layer, dropping p99 read latency from 125ms to 15ms.',
    extractedMetrics: ['177 to 72 nodes', '125ms to 15ms p99', '4ms write latency'],
    recommendedFormat: 'carousel',
    synthesisPrompt:
      'How Discord Stores Trillions of Messages: Migrating from Cassandra to ScyllaDB with Rust Data Services (Discord Engineering)\nSource URL: https://discord.com/blog/how-discord-stores-trillions-of-messages\n\nTechnical Summary & Engineering Context:\nFacing JVM garbage collection pauses and hot-partition tail latency across 177 Cassandra nodes, Discord re-architected its storage tier onto a 72-node ScyllaDB C++ shard-per-core cluster fronted by a Rust request coalescing layer, dropping p99 read latency from 125ms to 15ms.\nKey Quantitative Metrics: 177 to 72 nodes, 125ms to 15ms p99, 4ms write latency',
  },
  {
    id: 'gather_linux_io_uring_ebpf',
    title: 'Zero-Copy Network Telemetry in the Linux Kernel with eBPF Ring Buffers and io_uring Async I/O',
    url: 'https://cilium.io/blog/ebpf-network-performance/',
    sourceName: 'Cilium & Kernel Engineering',
    sourceType: 'curated',
    author: 'Kernel Networking Group',
    brand: 'Cilium Kernel Team',
    brandUrl: 'cilium.io',
    domainCategory: 'LINUX KERNEL',
    publishedAt: new Date(Date.now() - 8 * 3600_000).toISOString(),
    score: 445,
    summary:
      'Bypassing legacy iptables conntrack and context-heavy epoll syscalls using XDP eBPF packet processing and io_uring shared submission/completion rings cuts per-packet CPU overhead by 4.2x and sustains 14.8Mpps line-rate forwarding on 10GbE NICs.',
    extractedMetrics: ['4.2x lower CPU', '14.8Mpps line-rate', '10GbE zero-copy'],
    recommendedFormat: 'single',
    synthesisPrompt:
      'Zero-Copy Network Telemetry in the Linux Kernel with eBPF Ring Buffers and io_uring Async I/O (Cilium Kernel Team)\nSource URL: https://cilium.io/blog/ebpf-network-performance/\n\nTechnical Summary & Engineering Context:\nBypassing legacy iptables conntrack and context-heavy epoll syscalls using XDP eBPF packet processing and io_uring shared submission/completion rings cuts per-packet CPU overhead by 4.2x and sustains 14.8Mpps line-rate forwarding on 10GbE NICs.\nKey Quantitative Metrics: 4.2x lower CPU, 14.8Mpps line-rate, 10GbE zero-copy',
  },
  {
    id: 'gather_tailscale_nat_traversal',
    title: 'How NAT Traversal Works: STUN, TURN, ICE, and Birthday-Paradox UDP Hole Punching Across Carrier-Grade NATs',
    url: 'https://tailscale.com/blog/how-nat-traversal-works',
    sourceName: 'Tailscale Engineering',
    sourceType: 'curated',
    author: 'David Anderson',
    brand: 'Tailscale Engineering',
    brandUrl: 'tailscale.com',
    domainCategory: 'REVERSE ENGINEERING',
    publishedAt: new Date(Date.now() - 11 * 3600_000).toISOString(),
    score: 490,
    summary:
      'Establishing direct peer-to-peer WireGuard tunnels across stateful firewalls and Hard CGNATs requires coordinated STUN endpoint discovery, UPnP/NAT-PMP port mapping, and birthday-paradox simultaneous UDP probing before falling back to DERP encrypted relays.',
    extractedMetrics: ['92% direct P2P tunnels', '256 UDP probes', '0ms relay overhead'],
    recommendedFormat: 'carousel',
    synthesisPrompt:
      'How NAT Traversal Works: STUN, TURN, ICE, and Birthday-Paradox UDP Hole Punching Across Carrier-Grade NATs (Tailscale Engineering)\nSource URL: https://tailscale.com/blog/how-nat-traversal-works\n\nTechnical Summary & Engineering Context:\nEstablishing direct peer-to-peer WireGuard tunnels across stateful firewalls and Hard CGNATs requires coordinated STUN endpoint discovery, UPnP/NAT-PMP port mapping, and birthday-paradox simultaneous UDP probing before falling back to DERP encrypted relays.\nKey Quantitative Metrics: 92% direct P2P tunnels, 256 UDP probes, 0ms relay overhead',
  },
  {
    id: 'gather_uber_odin_db',
    title: 'How Uber Orchestrates Millions of Stateful Database Containers Across Multi-Zone NVMe Clusters',
    url: 'https://www.uber.com/blog/odin-stateful-platform/',
    sourceName: 'Uber Engineering',
    sourceType: 'curated',
    author: 'Uber Storage Platform',
    brand: 'Uber Engineering',
    brandUrl: 'uber.com',
    domainCategory: 'DISTRIBUTED SYSTEMS',
    publishedAt: new Date(Date.now() - 14 * 3600_000).toISOString(),
    score: 410,
    summary:
      'Uber Odin manages stateful MySQL, Cassandra, and AresDB clusters across hundreds of thousands of containers with automated Raft consensus quorum placement, local NVMe disk health scoring, and sub-30-second automated failover.',
    extractedMetrics: ['99.99% availability', '30s auto-failover', '100k+ containers'],
    recommendedFormat: 'single',
    synthesisPrompt:
      'How Uber Orchestrates Millions of Stateful Database Containers Across Multi-Zone NVMe Clusters (Uber Engineering)\nSource URL: https://www.uber.com/blog/odin-stateful-platform/\n\nTechnical Summary & Engineering Context:\nUber Odin manages stateful MySQL, Cassandra, and AresDB clusters across hundreds of thousands of containers with automated Raft consensus quorum placement, local NVMe disk health scoring, and sub-30-second automated failover.\nKey Quantitative Metrics: 99.99% availability, 30s auto-failover, 100k+ containers',
  },
];

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_m, code) => {
      const n = Number.parseInt(code, 10);
      return Number.isFinite(n) ? String.fromCharCode(n) : '';
    });
}

export function stripHtmlToCleanText(html: string, maxLength = 2400): string {
  const withoutScripts = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ');

  const withLineBreaks = withoutScripts
    .replace(/<\/(p|h1|h2|h3|h4|li|pre|blockquote|div|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const decoded = decodeHtmlEntities(withLineBreaks)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 25)
    .join('\n');

  return decoded.slice(0, maxLength).trim();
}

/**
 * Fetches live technical stories from Hacker News Firebase API (bounded timeout).
 */
async function fetchHackerNewsTopTech(limit = 6): Promise<GatheredTopicItem[]> {
  try {
    const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', {
      signal: AbortSignal.timeout(3500),
    });
    if (!topRes.ok) return [];
    const ids = (await topRes.json()) as number[];
    const candidateIds = (ids || []).slice(0, 18);

    const rawItems = await Promise.all(
      candidateIds.map(async (id) => {
        try {
          const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
            signal: AbortSignal.timeout(2500),
          });
          if (!r.ok) return null;
          return await r.json();
        } catch {
          return null;
        }
      })
    );

    const results: GatheredTopicItem[] = [];
    for (const item of rawItems) {
      if (!item || !item.title || !item.url) continue;
      const title = String(item.title).trim();
      if (
        !/\b(rust|go|linux|kernel|ebpf|ai|llm|gpu|database|postgres|sqlite|redis|kubernetes|docker|cloud|security|cve|compiler|wasm|network|distributed|architecture|benchmark|latency|memory|cpu|git|api|open-source|system)\b/i.test(
          title
        )
      ) {
        continue;
      }
      const { brand, brandUrl } = deriveBrandFromUrl(item.url, 'Hacker News');
      const metrics = extractQuantitativeMetrics(title);
      const domainCategory = classifyEngineeringDomain(title);
      const summary = item.text
        ? stripHtmlToCleanText(String(item.text), 500)
        : `Trending engineering breakdown on ${brand} (${item.score || 100} HN points, ${item.descendants || 0} comments): ${title}.`;
      const recommendedFormat = recommendPostFormat(title, summary, metrics);

      results.push({
        id: `hn_${item.id}`,
        title,
        url: String(item.url),
        sourceName: 'Hacker News',
        sourceType: 'hn',
        author: item.by ? String(item.by) : undefined,
        brand,
        brandUrl,
        domainCategory,
        publishedAt: item.time ? new Date(item.time * 1000).toISOString() : new Date().toISOString(),
        score: Number(item.score) || 100,
        summary,
        extractedMetrics: metrics,
        recommendedFormat,
        synthesisPrompt: buildSynthesisPromptFromTopic({
          title,
          url: String(item.url),
          brand,
          summary,
          extractedMetrics: metrics,
        }),
      });
      if (results.length >= limit) break;
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Fetches live technical stories from Lobste.rs JSON feed (bounded timeout).
 */
async function fetchLobstersHottest(limit = 5): Promise<GatheredTopicItem[]> {
  try {
    const res = await fetch('https://lobste.rs/hottest.json', {
      signal: AbortSignal.timeout(3500),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const items = (await res.json()) as any[];
    const results: GatheredTopicItem[] = [];

    for (const item of (items || []).slice(0, 12)) {
      if (!item?.title || !item?.url) continue;
      const title = String(item.title).trim();
      const tags = Array.isArray(item.tags) ? item.tags.join(', ') : '';
      const { brand, brandUrl } = deriveBrandFromUrl(item.url, 'Lobsters');
      const rawDesc = item.description ? stripHtmlToCleanText(String(item.description), 450) : '';
      const summary =
        rawDesc ||
        `Systems & engineering discussion on Lobsters${tags ? ` [${tags}]` : ''}: ${title} (${brand}).`;
      const metrics = extractQuantitativeMetrics(`${title} ${summary}`);
      const domainCategory = classifyEngineeringDomain(`${title} ${tags} ${summary}`);
      const recommendedFormat = recommendPostFormat(title, summary, metrics);

      results.push({
        id: `lobsters_${item.short_id || results.length}`,
        title,
        url: String(item.url),
        sourceName: `Lobsters${tags ? ` · ${tags.split(',')[0]}` : ''}`,
        sourceType: 'lobsters',
        author: item.submitter_user?.username || undefined,
        brand,
        brandUrl,
        domainCategory,
        publishedAt: item.created_at ? new Date(item.created_at).toISOString() : new Date().toISOString(),
        score: Number(item.score) || 50,
        summary,
        extractedMetrics: metrics,
        recommendedFormat,
        synthesisPrompt: buildSynthesisPromptFromTopic({
          title,
          url: String(item.url),
          brand,
          summary,
          extractedMetrics: metrics,
        }),
      });
      if (results.length >= limit) break;
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Lightweight XML/RSS/Atom parser for Cloudflare Engineering Blog.
 */
async function fetchCloudflareEngineeringRss(limit = 4): Promise<GatheredTopicItem[]> {
  try {
    const res = await fetch('https://blog.cloudflare.com/rss/', {
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
    const results: GatheredTopicItem[] = [];

    for (const block of itemMatches.slice(0, limit)) {
      const titleMatch =
        block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) ||
        block.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
      const descMatch =
        block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/i) ||
        block.match(/<description>([\s\S]*?)<\/description>/i);
      const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);

      if (!titleMatch || !linkMatch) continue;
      const title = decodeHtmlEntities(titleMatch[1]).trim();
      const url = linkMatch[1].trim();
      const summary = descMatch
        ? stripHtmlToCleanText(descMatch[1], 480)
        : `Cloudflare Engineering architectural deep-dive: ${title}`;
      const metrics = extractQuantitativeMetrics(`${title} ${summary}`);
      const domainCategory = classifyEngineeringDomain(`${title} ${summary}`);
      const recommendedFormat = recommendPostFormat(title, summary, metrics);

      results.push({
        id: `rss_cf_${crypto.createHash('sha256').update(url).digest('hex').slice(0, 20)}`,
        title,
        url,
        sourceName: 'Cloudflare Blog RSS',
        sourceType: 'rss',
        brand: 'Cloudflare Engineering',
        brandUrl: 'blog.cloudflare.com',
        domainCategory,
        publishedAt: pubDateMatch ? new Date(pubDateMatch[1].trim()).toISOString() : new Date().toISOString(),
        score: 320,
        summary,
        extractedMetrics: metrics,
        recommendedFormat,
        synthesisPrompt: buildSynthesisPromptFromTopic({
          title,
          url,
          brand: 'Cloudflare Engineering',
          summary,
          extractedMetrics: metrics,
        }),
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Fetches trending engineering & AI discussions from Reddit tech communities (r/programming, r/LocalLLaMA, r/devops).
 */
async function fetchRedditTechTrends(limit = 5): Promise<GatheredTopicItem[]> {
  try {
    const res = await fetch(
      'https://www.reddit.com/r/programming+LocalLLaMA+devops/hot.json?limit=15',
      {
        signal: AbortSignal.timeout(3500),
        headers: {
          'User-Agent': 'MARROK-Content-Gatherer/2.0',
          Accept: 'application/json',
        },
      }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as any;
    const children = json?.data?.children || [];
    const results: GatheredTopicItem[] = [];

    for (const child of children) {
      const post = child?.data;
      if (!post || post.stickied || !post.title) continue;
      const title = decodeHtmlEntities(String(post.title)).trim();
      const targetUrl =
        post.url && !String(post.url).includes('reddit.com')
          ? String(post.url)
          : `https://www.reddit.com${post.permalink || ''}`;
      const subreddit = post.subreddit_name_prefixed || 'r/programming';
      const { brand, brandUrl } = deriveBrandFromUrl(targetUrl, `Reddit ${subreddit}`);
      const selftext = post.selftext
        ? stripHtmlToCleanText(String(post.selftext), 460)
        : '';
      const summary =
        selftext ||
        `Trending on ${subreddit} (${post.ups || 120} upvotes, ${post.num_comments || 0} comments): ${title}.`;
      const metrics = extractQuantitativeMetrics(`${title} ${summary}`);
      const domainCategory = classifyEngineeringDomain(`${title} ${subreddit} ${summary}`);
      const recommendedFormat = recommendPostFormat(title, summary, metrics);

      results.push({
        id: `reddit_${post.id || results.length}`,
        title,
        url: targetUrl,
        sourceName: `Reddit · ${subreddit}`,
        sourceType: 'reddit',
        author: post.author ? `u/${post.author}` : undefined,
        brand,
        brandUrl,
        domainCategory,
        publishedAt: post.created_utc
          ? new Date(post.created_utc * 1000).toISOString()
          : new Date().toISOString(),
        score: Number(post.ups) || 150,
        summary,
        extractedMetrics: metrics,
        recommendedFormat,
        synthesisPrompt: buildSynthesisPromptFromTopic({
          title,
          url: targetUrl,
          brand,
          summary,
          extractedMetrics: metrics,
        }),
      });
      if (results.length >= limit) break;
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Fetches and parses any SSRF-validated custom RSS/Atom feed URL supplied by the user.
 */
async function fetchCustomRssFeed(rssUrl: string, limit = 5): Promise<GatheredTopicItem[]> {
  try {
    if (!rssUrl || !isAllowedProxyUrl(rssUrl, false)) return [];
    const parsed = new URL(rssUrl);
    const isSafeHost = await resolveAndValidateHost(parsed.hostname);
    if (!isSafeHost) return [];

    const res = await fetch(rssUrl, {
      signal: AbortSignal.timeout(4000),
      headers: {
        'User-Agent': 'MARROK-Content-Gatherer/2.0',
        Accept: 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*',
      },
    });
    if (!res.ok) return [];
    const xml = (await res.text()).slice(0, 400_000);
    const itemBlocks =
      xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ||
      xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi) ||
      [];
    const { brand, brandUrl } = deriveBrandFromUrl(rssUrl, 'Custom RSS Feed');
    const results: GatheredTopicItem[] = [];

    for (const block of itemBlocks.slice(0, limit)) {
      const titleMatch =
        block.match(/<title[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) ||
        block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const linkMatch =
        block.match(/<link[^>]+href=["']([^"']+)["']/i) ||
        block.match(/<link>([\s\S]*?)<\/link>/i);
      const descMatch =
        block.match(/<(?:description|summary|content)[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/(?:description|summary|content)>/i) ||
        block.match(/<(?:description|summary|content)[^>]*>([\s\S]*?)<\/(?:description|summary|content)>/i);
      const pubDateMatch =
        block.match(/<(?:pubDate|published|updated)>([\s\S]*?)<\/(?:pubDate|published|updated)>/i);

      if (!titleMatch || !linkMatch) continue;
      const title = decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, ' ').trim();
      const url = linkMatch[1].trim();
      if (!title || !url) continue;

      const summary = descMatch
        ? stripHtmlToCleanText(descMatch[1], 480)
        : `${brand} RSS feed update: ${title}`;
      const metrics = extractQuantitativeMetrics(`${title} ${summary}`);
      const domainCategory = classifyEngineeringDomain(`${title} ${summary}`);
      const recommendedFormat = recommendPostFormat(title, summary, metrics);

      results.push({
        id: `rss_custom_${crypto.createHash('sha256').update(url).digest('hex').slice(0, 20)}`,
        title,
        url,
        sourceName: `${brand} RSS`,
        sourceType: 'rss',
        brand,
        brandUrl,
        domainCategory,
        publishedAt: pubDateMatch
          ? new Date(pubDateMatch[1].trim()).toISOString()
          : new Date().toISOString(),
        score: 360,
        summary,
        extractedMetrics: metrics,
        recommendedFormat,
        synthesisPrompt: buildSynthesisPromptFromTopic({
          title,
          url,
          brand,
          summary,
          extractedMetrics: metrics,
        }),
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * GET /api/gather/radar
 * Aggregates live technical stories across Reddit Social Tech Trends, Hacker News, Lobsters, Cloudflare RSS, Custom RSS, and Curated High-Signal topics.
 */
export async function handleGetTopicRadar(req: Request, res: Response): Promise<void> {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const sourceFilter = typeof req.query.source === 'string' ? req.query.source.trim().toLowerCase() : 'all';
    const categoryFilter = typeof req.query.category === 'string' ? req.query.category.trim() : 'all';
    const customRssParam = typeof req.query.customRss === 'string' ? req.query.customRss.trim() : '';

    const now = Date.now();
    if (
      !forceRefresh &&
      !customRssParam &&
      cachedRadarItems &&
      now - cachedRadarTimestamp < RADAR_CACHE_TTL_MS
    ) {
      const filtered = filterRadarItems(cachedRadarItems, sourceFilter, categoryFilter);
      res.json({
        ok: true,
        cached: true,
        fetchedAt: new Date(cachedRadarTimestamp).toISOString(),
        topics: filtered,
      });
      return;
    }

    const customRssUrls = customRssParam
      ? customRssParam
          .split(',')
          .map((u) => u.trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];

    const [redditItems, hnItems, lobstersItems, rssItems, ...customRssBatches] = await Promise.all([
      fetchRedditTechTrends(5),
      fetchHackerNewsTopTech(6),
      fetchLobstersHottest(5),
      fetchCloudflareEngineeringRss(4),
      ...customRssUrls.map((u) => fetchCustomRssFeed(u, 4)),
    ]);

    const customItems = customRssBatches.flat();
    const combinedMap = new Map<string, GatheredTopicItem>();
    for (const item of [
      ...customItems,
      ...redditItems,
      ...rssItems,
      ...hnItems,
      ...lobstersItems,
      ...CURATED_ENGINEERING_TOPICS,
    ]) {
      const key = item.url.toLowerCase().replace(/\/+$/, '');
      if (!combinedMap.has(key)) {
        combinedMap.set(key, item);
      }
    }

    const merged = Array.from(combinedMap.values());
    if (!customRssParam) {
      cachedRadarItems = merged;
      cachedRadarTimestamp = now;
    }

    const filtered = filterRadarItems(merged, sourceFilter, categoryFilter);
    res.json({
      ok: true,
      cached: false,
      fetchedAt: new Date(now).toISOString(),
      topics: filtered,
    });
  } catch (err) {
    res.json({
      ok: true,
      cached: true,
      fetchedAt: new Date().toISOString(),
      topics: CURATED_ENGINEERING_TOPICS,
      warning: err instanceof Error ? err.message : 'Fallback to curated engineering topics',
    });
  }
}

function filterRadarItems(
  items: GatheredTopicItem[],
  sourceFilter: string,
  categoryFilter: string
): GatheredTopicItem[] {
  return items.filter((item) => {
    if (sourceFilter && sourceFilter !== 'all') {
      if (sourceFilter === 'blogs' && item.sourceType !== 'rss' && item.sourceType !== 'curated') {
        return false;
      }
      if (sourceFilter !== 'blogs' && item.sourceType !== sourceFilter) {
        return false;
      }
    }
    if (categoryFilter && categoryFilter !== 'all' && categoryFilter !== 'auto') {
      if (item.domainCategory !== categoryFilter) {
        return false;
      }
    }
    return true;
  });
}

/**
 * POST /api/gather/extract-url
 * SSRF-safe reader extraction for any https:// engineering blog, GitHub repo, or article URL.
 */
export async function handleExtractUrlContent(req: Request, res: Response): Promise<void> {
  const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!rawUrl) {
    res.status(400).json({ error: 'Missing "url" field in request body.' });
    return;
  }

  if (!isAllowedProxyUrl(rawUrl, false)) {
    res.status(400).json({
      error: 'Invalid or blocked URL. Only public https:// URLs are permitted.',
    });
    return;
  }

  try {
    const parsed = new URL(rawUrl);
    const isSafeHost = await resolveAndValidateHost(parsed.hostname);
    if (!isSafeHost) {
      res.status(403).json({
        error: 'Target hostname resolved to a restricted or private IP address.',
      });
      return;
    }

    const response = await fetch(rawUrl, {
      signal: AbortSignal.timeout(7500),
      headers: {
        'User-Agent': 'MARROK-Content-Studio-Reader/2.0 (+https://marrok.org)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      res.status(502).json({
        error: `Upstream URL returned HTTP ${response.status}`,
      });
      return;
    }

    const html = (await response.text()).slice(0, 600_000);
    const ogTitleMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const ogDescMatch =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);

    const rawTitle = ogTitleMatch?.[1] || titleTagMatch?.[1] || parsed.pathname.split('/').pop() || 'Technical Breakdown';
    const title = decodeHtmlEntities(rawTitle).replace(/\s+/g, ' ').trim();
    const metaDesc = ogDescMatch?.[1] ? decodeHtmlEntities(ogDescMatch[1]).replace(/\s+/g, ' ').trim() : '';

    // Focus on <article> or <main> if present
    const articleMatch =
      html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i) ||
      html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
    const bodyText = stripHtmlToCleanText(articleMatch ? articleMatch[1] : html, 2200);
    const combinedSummary = [metaDesc, bodyText].filter(Boolean).join('\n\n').slice(0, 1800).trim();

    const { brand, brandUrl } = deriveBrandFromUrl(rawUrl, 'Engineering Source');
    const metrics = extractQuantitativeMetrics(`${title} ${combinedSummary}`);
    const domainCategory = classifyEngineeringDomain(`${title} ${combinedSummary}`);
    const recommendedFormat = recommendPostFormat(title, combinedSummary, metrics);

    const topic: GatheredTopicItem = {
      id: `url_${crypto.createHash('sha256').update(rawUrl).digest('hex').slice(0, 20)}`,
      title,
      url: rawUrl,
      sourceName: brand,
      sourceType: 'custom-url',
      brand,
      brandUrl,
      domainCategory,
      publishedAt: new Date().toISOString(),
      score: 500,
      summary: combinedSummary || `Technical analysis extracted from ${rawUrl}`,
      extractedMetrics: metrics,
      recommendedFormat,
      synthesisPrompt: buildSynthesisPromptFromTopic({
        title,
        url: rawUrl,
        brand,
        summary: combinedSummary || title,
        extractedMetrics: metrics,
      }),
    };

    res.json({
      ok: true,
      topic,
      rawTextLength: bodyText.length,
    });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to extract content from URL',
    });
  }
}
