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
  const trimmed = key.trim();
  // Prevent lowercase common English words 'go' or 'next' from false-matching Go or Next.js
  if (trimmed === 'go' || trimmed === 'next') return null;
  const clean = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (BUNDLED_TECH_ICONS[clean]) return BUNDLED_TECH_ICONS[clean];
  const direct = trimmed.toLowerCase();
  if (BUNDLED_TECH_ICONS[direct]) return BUNDLED_TECH_ICONS[direct];
  return null;
}

export function isBundledTechIcon(key?: string | null): boolean {
  return Boolean(getBundledIconMeta(key));
}

/**
 * Returns true if a brand/system/flow label is empty, generic filler, or a placeholder
 * such as "System A", "System B", "PIPELINE MIGRATION", "DATASTREAM MIGRATION", "Before", "After", etc.
 */
export function isPlaceholderOrEmptyBrandValue(val?: string | null): boolean {
  if (!val) return true;
  const clean = val.trim();
  if (!clean) return true;
  if (
    /^(?:system\s*[a-z0-9]?|brand\s*[a-z0-9]?|company\s*[a-z0-9]?|product\s*[a-z0-9]?|service\s*[a-z0-9]?|tool\s*[a-z0-9]?|app\s*[a-z0-9]?|db\s*[a-z0-9]?|database\s*[a-z0-9]?|source\s*[a-z0-9]?|target\s*[a-z0-9]?|option\s*[a-z0-9]?)$/i.test(
      clean
    )
  ) {
    return true;
  }
  if (
    /^(?:before|after|legacy|modern|baseline|optimized|old|new|current|previous|next|future|default|custom|unknown|generic|sample|example|demo|test|mock|dummy|placeholder|tbd|todo|n\/a|none|null|undefined|xxx+|\?\?\?+)$/i.test(
      clean
    )
  ) {
    return true;
  }
  if (
    /\b(?:pipeline\s+migration|datastream\s+migration|system\s+[ab12]\b|company\s+[ab12]\b|brand\s+[ab12]\b|product\s+[ab12]\b|before\s*(?:->|→)\s*after|x\s+migrates\s+to\s+y|channel\s+name|your\s+(?:brand|name|company)|lorem\s+ipsum)\b/i.test(
      clean
    )
  ) {
    return true;
  }
  return false;
}

const NON_PRODUCT_WORDS = new Set([
  'system', 'systems', 'service', 'services', 'server', 'servers', 'client', 'clients',
  'database', 'databases', 'storage', 'cache', 'caching', 'cluster', 'clusters', 'node', 'nodes',
  'pipeline', 'pipelines', 'workflow', 'workflows', 'architecture', 'monolith', 'microservices',
  'legacy', 'modern', 'baseline', 'optimized', 'before', 'after', 'old', 'new', 'current', 'next',
  'position', 'positions', 'target', 'targets', 'home', 'bin', 'bins', 'conveyor', 'pallet',
  'camera', 'cameras', 'wrist', 'gripper', 'grippers', 'arm', 'arms', 'robot', 'robots', 'robotics',
  'sensor', 'sensors', 'actuator', 'actuators', 'controller', 'controllers', 'motor', 'motors',
  'simulation', 'simulations', 'reality', 'real', 'virtual', 'physical', 'hardware', 'firmware',
  'training', 'inference', 'pretraining', 'finetuning', 'evaluation', 'benchmark', 'benchmarks',
  'model', 'models', 'transformer', 'transformers', 'diffusion', 'attention', 'layer', 'layers',
  'weights', 'activations', 'gradients', 'tokens', 'embeddings', 'vectors', 'matrix', 'tensor',
  'cpu', 'gpu', 'tpu', 'npu', 'fpga', 'asic', 'ram', 'dram', 'sram', 'nvme', 'ssd', 'hdd', 'disk',
  'memory', 'network', 'socket', 'sockets', 'packet', 'packets', 'thread', 'threads', 'process',
  'kernel', 'userspace', 'bytecode', 'verifier', 'compiler', 'interpreter', 'runtime', 'vm',
  'stage', 'phase', 'step', 'tier', 'level', 'mode', 'state', 'status', 'queue', 'stream', 'topic',
  'table', 'index', 'shard', 'shards', 'partition', 'partitions', 'replica', 'replicas', 'quorum',
  'read', 'reads', 'write', 'writes', 'query', 'queries', 'request', 'requests', 'response',
  'cloud', 'onprem', 'edge', 'local', 'remote', 'public', 'private', 'hybrid', 'production',
  'staging', 'development', 'testing', 'manual', 'automated', 'autonomous', 'sync', 'async',
  'batch', 'streaming', 'realtime', 'offline', 'online', 'rest', 'rpc', 'http', 'https', 'tcp', 'udp',
  'json', 'xml', 'yaml', 'csv', 'html', 'css', 'sql', 'nosql', 'acid', 'base', 'crud', 'api', 'apis',
  'sdk', 'cli', 'gui', 'ui', 'ux', 'ide', 'ci', 'cd', 'devops', 'mlops', 'secops', 'finops',
  'startup', 'startups', 'enterprise', 'team', 'teams', 'engineer', 'engineers', 'developer',
  'company', 'business', 'product', 'platform', 'application', 'app', 'tool', 'tools', 'library',
  'framework', 'module', 'package', 'plugin', 'extension', 'driver', 'agent', 'agents', 'bot', 'bots',
  'pick', 'place', 'grasp', 'pose', 'trajectory', 'kinematics', 'torque', 'force', 'vision', 'lidar',
]);

/**
 * Additional verified named software/database/infrastructure products that may not have a
 * bundled Simple Icon SVG (they render via clean styled text wordmark fallback).
 */
const EXTRA_NAMED_TECH_PRODUCTS: Record<string, string> = {
  dynamodb: 'Amazon DynamoDB',
  'amazon dynamodb': 'Amazon DynamoDB',
  aurora: 'Amazon Aurora',
  'amazon aurora': 'Amazon Aurora',
  redshift: 'Amazon Redshift',
  spanner: 'Cloud Spanner',
  'cloud spanner': 'Cloud Spanner',
  bigtable: 'Cloud Bigtable',
  bigquery: 'BigQuery',
  snowflake: 'Snowflake',
  databricks: 'Databricks',
  memcached: 'Memcached',
  valkey: 'Valkey',
  dragonfly: 'DragonflyDB',
  dragonflydb: 'DragonflyDB',
  mariadb: 'MariaDB',
  oracle: 'Oracle DB',
  sqlserver: 'SQL Server',
  'sql server': 'SQL Server',
  mssql: 'SQL Server',
  couchbase: 'Couchbase',
  couchdb: 'CouchDB',
  neo4j: 'Neo4j',
  influxdb: 'InfluxDB',
  timescaledb: 'TimescaleDB',
  questdb: 'QuestDB',
  pinecone: 'Pinecone',
  milvus: 'Milvus',
  qdrant: 'Qdrant',
  weaviate: 'Weaviate',
  chromadb: 'ChromaDB',
  pgvector: 'pgvector',
  pingora: 'Pingora',
  haproxy: 'HAProxy',
  traefik: 'Traefik',
  caddy: 'Caddy',
  istio: 'Istio',
  linkerd: 'Linkerd',
  consul: 'Consul',
  nomad: 'Nomad',
  aws: 'AWS',
  azure: 'Microsoft Azure',
  heroku: 'Heroku',
  flyio: 'Fly.io',
  'fly.io': 'Fly.io',
  railway: 'Railway',
  digitalocean: 'DigitalOcean',
  linode: 'Linode',
  hetzner: 'Hetzner',
  angular: 'Angular',
  vue: 'Vue.js',
  vuejs: 'Vue.js',
  svelte: 'Svelte',
  solidjs: 'SolidJS',
  remix: 'Remix',
  astro: 'Astro',
  nuxt: 'Nuxt',
  webpack: 'Webpack',
  rollup: 'Rollup',
  esbuild: 'esbuild',
  turbopack: 'Turbopack',
  parcel: 'Parcel',
  biome: 'Biome',
  eslint: 'ESLint',
  prettier: 'Prettier',
  jest: 'Jest',
  vitest: 'Vitest',
  playwright: 'Playwright',
  cypress: 'Cypress',
  selenium: 'Selenium',
  prisma: 'Prisma',
  drizzle: 'Drizzle ORM',
  typeorm: 'TypeORM',
  sequelize: 'Sequelize',
  hibernate: 'Hibernate',
  grpc: 'gRPC',
  trpc: 'tRPC',
  protobuf: 'Protobuf',
  zeromq: 'ZeroMQ',
  activemq: 'ActiveMQ',
  pulsar: 'Apache Pulsar',
  'apache pulsar': 'Apache Pulsar',
  kinesis: 'Amazon Kinesis',
  celery: 'Celery',
  sidekiq: 'Sidekiq',
  bullmq: 'BullMQ',
  airflow: 'Apache Airflow',
  dagster: 'Dagster',
  prefect: 'Prefect',
  pytorch: 'PyTorch',
  tensorflow: 'TensorFlow',
  jax: 'JAX',
  onnx: 'ONNX',
  vllm: 'vLLM',
  tensorrt: 'TensorRT',
  openai: 'OpenAI',
  llama: 'Llama',
  mistral: 'Mistral',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  stripe: 'Stripe',
  auth0: 'Auth0',
  okta: 'Okta',
  clerk: 'Clerk',
  datadog: 'Datadog',
  newrelic: 'New Relic',
  'new relic': 'New Relic',
  sentry: 'Sentry',
  splunk: 'Splunk',
  jaeger: 'Jaeger',
  opentelemetry: 'OpenTelemetry',
  slack: 'Slack',
  ruby: 'Ruby',
  rails: 'Ruby on Rails',
  'ruby on rails': 'Ruby on Rails',
  django: 'Django',
  flask: 'Flask',
  spring: 'Spring Boot',
  'spring boot': 'Spring Boot',
  laravel: 'Laravel',
  php: 'PHP',
  java: 'Java',
  kotlin: 'Kotlin',
  swift: 'Swift',
  scala: 'Scala',
  elixir: 'Elixir',
  erlang: 'Erlang',
  zig: 'Zig',
  csharp: 'C#',
  dotnet: '.NET',
  '.net': '.NET',
  deno: 'Deno',
  bun: 'Bun',
  freebsd: 'FreeBSD',
  redhat: 'Red Hat',
  rhel: 'RHEL',
  centos: 'CentOS',
  alpine: 'Alpine Linux',
  wasm: 'WebAssembly',
  webassembly: 'WebAssembly',
  firecracker: 'Firecracker',
  containerd: 'containerd',
  podman: 'Podman',
  cilium: 'Cilium',
  tailscale: 'Tailscale',
  wireguard: 'WireGuard',
  openssl: 'OpenSSL',
  boringssl: 'BoringSSL',
  rustls: 'rustls',
  raft: 'Raft',
  paxos: 'Paxos',
};

export interface ResolvedTechSystem {
  title: string;
  logoKey?: string;
  asText: boolean;
}

/**
 * Strictly resolves whether a candidate token from source text is a real, named
 * software/database/cloud/infrastructure product or system.
 * Returns null for generic nouns, hardware/robotics parts, ML concepts, or placeholders.
 */
export function resolveRealTechSystem(rawCandidate?: string | null): ResolvedTechSystem | null {
  if (!rawCandidate) return null;
  const trimmed = rawCandidate
    .trim()
    .replace(/^['"`(\[]+|['"`.,;:!?)\]]+$/g, '')
    .trim();
  if (!trimmed || trimmed.length < 2) return null;
  if (isPlaceholderOrEmptyBrandValue(trimmed)) return null;

  const lower = trimmed.toLowerCase();
  if (NON_PRODUCT_WORDS.has(lower)) return null;

  // Disallow lowercase common English verbs/adjectives that collide with tech names
  if (
    (trimmed === 'go' || trimmed === 'next' || trimmed === 'spark' || trimmed === 'temporal' || trimmed === 'swift' || trimmed === 'rust') &&
    trimmed === lower &&
    (lower === 'go' || lower === 'next' || lower === 'spark' || lower === 'temporal' || lower === 'swift')
  ) {
    return null;
  }

  const bundled = getBundledIconMeta(trimmed);
  if (bundled) {
    return {
      title: bundled.title,
      logoKey: bundled.slug,
      asText: false,
    };
  }

  const alnum = lower.replace(/[^a-z0-9.+#]/g, '');
  if (EXTRA_NAMED_TECH_PRODUCTS[lower]) {
    return {
      title: EXTRA_NAMED_TECH_PRODUCTS[lower],
      logoKey: undefined,
      asText: true,
    };
  }
  if (EXTRA_NAMED_TECH_PRODUCTS[alnum]) {
    return {
      title: EXTRA_NAMED_TECH_PRODUCTS[alnum],
      logoKey: undefined,
      asText: true,
    };
  }

  return null;
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

