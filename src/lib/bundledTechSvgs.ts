/**
 * Bundled Unedited Official SVG Registry
 * Single client-bundled, zero-network repository of authentic Simple Icons SVGs.
 * Guarantees 100% offline, CSP-safe, and proxy-independent rendering with official brand hex or monochrome single ink.
 * Verbatim paths from simple-icons: no modifications, no rotations, no effects.
 */

import {
  siApachecassandra,
  siScylladb,
  siDiscord,
  siPostgresql,
  siRedis,
  siApachekafka,
  siKubernetes,
  siDocker,
  siNginx,
  siCloudflare,
  siMongodb,
  siMysql,
  siSqlite,
  siClickhouse,
  siEnvoyproxy,
  siFastapi,
  siPython,
  siGo,
  siRust,
  siTypescript,
  siJavascript,
  siLinux,
  siUbuntu,
  siGit,
  siGithub,
  siGitlab,
  siGooglecloud,
  siTerraform,
  siAnsible,
  siPrometheus,
  siGrafana,
  siAnthropic,
  siReact,
  siNodedotjs,
  siCplusplus,
  siSupabase,
  siElasticsearch,
  siGraphql,
  siNatsdotio,
  siDuckdb,
  siCockroachlabs,
  siRabbitmq,
  siEtcd,
  siTemporal,
  siPydantic,
  siApacheflink,
  siApachespark,
  siTrino,
  siVite,
  siNextdotjs,
  siVercel,
  siNetlify,
  siTailwindcss,
  siDebian,
  siApache,
  siKeycloak,
} from 'simple-icons';

export interface BundledIconMeta {
  key: string;
  title: string;
  slug: string;
  hex: string;
  officialColor: string;
  path: string;
  guidelinesUrl?: string;
  category: string;
  aliases: string[];
}

export interface BundledLogoOptions {
  colorMode?: 'official' | 'mono';
  monoColor?: string; // defaults to #FFFFFF
}

// Low-contrast hex codes on dark OLED backgrounds (#11171D) mapped to high-contrast official ink
const CONTRAST_OVERRIDE_HEX: Record<string, string> = {
  apachekafka: '#FFFFFF',
  rust: '#FFFFFF',
  github: '#FFFFFF',
  nextdotjs: '#FFFFFF',
  vercel: '#FFFFFF',
};

const RAW_CATALOG: Array<{
  icon: { title: string; slug: string; hex: string; path: string; guidelines?: string };
  category: string;
  aliases: string[];
}> = [
  { icon: siApachecassandra, category: 'Databases & Storage', aliases: ['cassandra', 'apache cassandra'] },
  { icon: siScylladb, category: 'Databases & Storage', aliases: ['scylla', 'scylladb'] },
  { icon: siDiscord, category: 'Distributed Systems & Chat', aliases: ['discord'] },
  { icon: siPostgresql, category: 'Databases & Storage', aliases: ['postgres', 'postgresql', 'pg'] },
  { icon: siRedis, category: 'Databases & Caching', aliases: ['redis'] },
  { icon: siApachekafka, category: 'Distributed Messaging', aliases: ['kafka', 'apache kafka'] },
  { icon: siKubernetes, category: 'DevOps & Containers', aliases: ['k8s', 'kubernetes'] },
  { icon: siDocker, category: 'DevOps & Containers', aliases: ['docker'] },
  { icon: siNginx, category: 'Networking & Proxies', aliases: ['nginx'] },
  { icon: siCloudflare, category: 'Networking & Cloud', aliases: ['cloudflare'] },
  { icon: siMongodb, category: 'Databases & Storage', aliases: ['mongodb', 'mongo'] },
  { icon: siMysql, category: 'Databases & Storage', aliases: ['mysql'] },
  { icon: siSqlite, category: 'Databases & Storage', aliases: ['sqlite'] },
  { icon: siClickhouse, category: 'Databases & Analytics', aliases: ['clickhouse'] },
  { icon: siEnvoyproxy, category: 'Networking & Proxies', aliases: ['envoy', 'envoyproxy'] },
  { icon: siFastapi, category: 'Backend & APIs', aliases: ['fastapi'] },
  { icon: siPython, category: 'Languages', aliases: ['python', 'py'] },
  { icon: siGo, category: 'Languages', aliases: ['go', 'golang'] },
  { icon: siRust, category: 'Languages', aliases: ['rust'] },
  { icon: siTypescript, category: 'Languages', aliases: ['typescript', 'ts'] },
  { icon: siJavascript, category: 'Languages', aliases: ['javascript', 'js'] },
  { icon: siLinux, category: 'Operating Systems', aliases: ['linux'] },
  { icon: siUbuntu, category: 'Operating Systems', aliases: ['ubuntu'] },
  { icon: siGit, category: 'VCS & Tooling', aliases: ['git'] },
  { icon: siGithub, category: 'VCS & Tooling', aliases: ['github'] },
  { icon: siGitlab, category: 'VCS & Tooling', aliases: ['gitlab'] },
  { icon: siGooglecloud, category: 'Cloud Infrastructure', aliases: ['gcp', 'google cloud', 'googlecloud'] },
  { icon: siTerraform, category: 'DevOps & IaC', aliases: ['terraform'] },
  { icon: siAnsible, category: 'DevOps & IaC', aliases: ['ansible'] },
  { icon: siPrometheus, category: 'Observability', aliases: ['prometheus'] },
  { icon: siGrafana, category: 'Observability', aliases: ['grafana'] },
  { icon: siAnthropic, category: 'AI Research', aliases: ['anthropic', 'claude'] },
  { icon: siReact, category: 'Frontend', aliases: ['react', 'reactjs'] },
  { icon: siNodedotjs, category: 'Backend', aliases: ['node', 'nodejs', 'nodedotjs'] },
  { icon: siCplusplus, category: 'Languages', aliases: ['cpp', 'c++', 'cplusplus'] },
  { icon: siSupabase, category: 'Databases & Storage', aliases: ['supabase'] },
  { icon: siElasticsearch, category: 'Databases & Search', aliases: ['elasticsearch', 'elastic'] },
  { icon: siGraphql, category: 'Backend & APIs', aliases: ['graphql'] },
  { icon: siNatsdotio, category: 'Distributed Messaging', aliases: ['nats', 'natsdotio'] },
  { icon: siDuckdb, category: 'Databases & Analytics', aliases: ['duckdb'] },
  { icon: siCockroachlabs, category: 'Databases & Storage', aliases: ['cockroachdb', 'cockroachlabs', 'cockroach'] },
  { icon: siRabbitmq, category: 'Distributed Messaging', aliases: ['rabbitmq'] },
  { icon: siEtcd, category: 'Distributed Systems', aliases: ['etcd'] },
  { icon: siTemporal, category: 'Distributed Systems', aliases: ['temporal'] },
  { icon: siPydantic, category: 'Backend & Tooling', aliases: ['pydantic'] },
  { icon: siApacheflink, category: 'Stream Processing', aliases: ['flink', 'apache flink'] },
  { icon: siApachespark, category: 'Data Processing', aliases: ['spark', 'apache spark'] },
  { icon: siTrino, category: 'Data Processing', aliases: ['trino'] },
  { icon: siVite, category: 'Frontend & Tooling', aliases: ['vite'] },
  { icon: siNextdotjs, category: 'Frontend & Frameworks', aliases: ['nextjs', 'nextdotjs', 'next'] },
  { icon: siVercel, category: 'Cloud Infrastructure', aliases: ['vercel'] },
  { icon: siNetlify, category: 'Cloud Infrastructure', aliases: ['netlify'] },
  { icon: siTailwindcss, category: 'Frontend & Styling', aliases: ['tailwind', 'tailwindcss'] },
  { icon: siDebian, category: 'Operating Systems', aliases: ['debian'] },
  { icon: siApache, category: 'Open Source Systems', aliases: ['apache'] },
  { icon: siKeycloak, category: 'Security & Auth', aliases: ['keycloak'] },
];

export const BUNDLED_TECH_ICONS: Record<string, BundledIconMeta> = (() => {
  const map: Record<string, BundledIconMeta> = {};
  for (const item of RAW_CATALOG) {
    const slug = item.icon.slug.toLowerCase();
    const hex = item.icon.hex.toUpperCase();
    const officialColor = CONTRAST_OVERRIDE_HEX[slug] || `#${hex}`;
    const meta: BundledIconMeta = {
      key: slug,
      title: item.icon.title,
      slug,
      hex,
      officialColor,
      path: item.icon.path,
      guidelinesUrl: item.icon.guidelines,
      category: item.category,
      aliases: item.aliases,
    };

    map[slug] = meta;
    map[item.icon.title.toLowerCase()] = meta;
    for (const a of item.aliases) {
      map[a.toLowerCase()] = meta;
    }
  }
  return map;
})();

export function getBundledIconMeta(key?: string | null): BundledIconMeta | null {
  if (!key) return null;
  const clean = key.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (BUNDLED_TECH_ICONS[clean]) return BUNDLED_TECH_ICONS[clean];
  const direct = key.toLowerCase().trim();
  if (BUNDLED_TECH_ICONS[direct]) return BUNDLED_TECH_ICONS[direct];
  return null;
}

export function isBundledTechIcon(key?: string | null): boolean {
  return Boolean(getBundledIconMeta(key));
}

/**
 * Returns verbatim unedited SVG string for a bundled official logo.
 * Supports official brand color by default and clean monochrome single-ink toggle.
 */
export function getBundledOfficialLogoSvg(
  key?: string | null,
  options: BundledLogoOptions = {}
): string | null {
  const meta = getBundledIconMeta(key);
  if (!meta) return null;

  const colorMode = options.colorMode || 'official';
  const fillColor = colorMode === 'mono' ? options.monoColor || '#FFFFFF' : meta.officialColor;

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 24 24"><title>${meta.title}</title><path fill="${fillColor}" d="${meta.path}"/></svg>`.trim();
}

/**
 * Returns a synchronous data:image/svg+xml data URI for a bundled official logo.
 * Eliminates all network requests and CORS proxy hops for known tech icons.
 */
export function getBundledOfficialLogoDataUrl(
  key?: string | null,
  options: BundledLogoOptions = {}
): string | null {
  const svg = getBundledOfficialLogoSvg(key, options);
  if (!svg) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function listBundledTechIcons(): BundledIconMeta[] {
  const seen = new Set<string>();
  const list: BundledIconMeta[] = [];
  for (const meta of Object.values(BUNDLED_TECH_ICONS)) {
    if (!seen.has(meta.slug)) {
      seen.add(meta.slug);
      list.push(meta);
    }
  }
  return list.sort((a, b) => a.title.localeCompare(b.title));
}
