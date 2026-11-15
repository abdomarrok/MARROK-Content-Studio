/**
 * Curated Tech Brand Icons and Logos Catalog
 * Single source of truth shared between client canvas rendering, media search, and API controllers.
 */

export interface TechIconItem {
  name: string;
  title: string;
  url: string;
  category: string;
  aliases?: string[];
  officialColor?: string;
  guidelinesUrl?: string;
}

export const TECH_ICONS_LIST: TechIconItem[] = [
  { name: 'discord', title: 'Discord', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/discord.svg', category: 'Distributed Systems & Chat', officialColor: '#5865F2', guidelinesUrl: 'https://discord.com/branding' },
  { name: 'scylladb', title: 'ScyllaDB', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/scylladb.svg', category: 'Databases & Caching', aliases: ['scylla'], officialColor: '#44C8F5', guidelinesUrl: 'https://www.scylladb.com/' },
  { name: 'apachecassandra', title: 'Apache Cassandra', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/apachecassandra.svg', category: 'Databases & Storage', aliases: ['cassandra'], officialColor: '#1287B1', guidelinesUrl: 'https://cassandra.apache.org/' },
  { name: 'docker', title: 'Docker', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/docker.svg', category: 'DevOps & Containers', officialColor: '#2496ED', guidelinesUrl: 'https://www.docker.com/company/newsroom/media-resources/' },
  { name: 'kubernetes', title: 'Kubernetes', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/kubernetes.svg', category: 'DevOps & Containers', aliases: ['k8s'], officialColor: '#326CE5', guidelinesUrl: 'https://kubernetes.io/community/branding/' },
  { name: 'redis', title: 'Redis', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/redis.svg', category: 'Databases & Caching', officialColor: '#FF4438', guidelinesUrl: 'https://redis.io/legal/trademark-policy/' },
  { name: 'postgresql', title: 'PostgreSQL', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/postgresql.svg', category: 'Databases & Caching', aliases: ['postgres'], officialColor: '#4169E1', guidelinesUrl: 'https://www.postgresql.org/about/policies/trademarks/' },
  { name: 'mysql', title: 'MySQL', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/mysql.svg', category: 'Databases & Caching', officialColor: '#4479A1', guidelinesUrl: 'https://www.mysql.com/about/legal/trademark.html' },
  { name: 'mongodb', title: 'MongoDB', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/mongodb.svg', category: 'Databases & Caching', officialColor: '#47A248', guidelinesUrl: 'https://www.mongodb.com/company/newsroom/brand-resources' },
  { name: 'clickhouse', title: 'ClickHouse', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/clickhouse.svg', category: 'Databases & Analytics', officialColor: '#FFCC01', guidelinesUrl: 'https://clickhouse.com/brand' },
  { name: 'apachekafka', title: 'Apache Kafka', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/apachekafka.svg', category: 'Distributed Systems', aliases: ['kafka'], officialColor: '#FFFFFF', guidelinesUrl: 'https://www.apache.org/foundation/marks/' },
  { name: 'fastapi', title: 'FastAPI', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/fastapi.svg', category: 'Backend & APIs', officialColor: '#009688', guidelinesUrl: 'https://fastapi.tiangolo.com/' },
  { name: 'python', title: 'Python', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/python.svg', category: 'Languages', officialColor: '#3776AB', guidelinesUrl: 'https://www.python.org/psf/trademarks/' },
  { name: 'go', title: 'Go (Golang)', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/go.svg', category: 'Languages', aliases: ['golang'], officialColor: '#00ADD8', guidelinesUrl: 'https://go.dev/blog/go-brand' },
  { name: 'rust', title: 'Rust', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/rust.svg', category: 'Languages', officialColor: '#FFFFFF', guidelinesUrl: 'https://foundation.rust-lang.org/policies/logo-policy-and-media-guide/' },
  { name: 'typescript', title: 'TypeScript', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/typescript.svg', category: 'Languages', officialColor: '#3178C6', guidelinesUrl: 'https://www.typescriptlang.org/branding/' },
  { name: 'javascript', title: 'JavaScript', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/javascript.svg', category: 'Languages', officialColor: '#F7DF1E', guidelinesUrl: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript' },
  { name: 'linux', title: 'Linux', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/linux.svg', category: 'Operating Systems', officialColor: '#FCC624', guidelinesUrl: 'https://www.linuxfoundation.org/legal/trademark-usage' },
  { name: 'ubuntu', title: 'Ubuntu', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/ubuntu.svg', category: 'Operating Systems', officialColor: '#E95420', guidelinesUrl: 'https://canonical.com/legal/intellectual-property-policy' },
  { name: 'git', title: 'Git', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/git.svg', category: 'VCS & Tooling', officialColor: '#F05032', guidelinesUrl: 'https://git-scm.com/downloads/logos' },
  { name: 'github', title: 'GitHub', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/github.svg', category: 'VCS & Tooling', officialColor: '#FFFFFF', guidelinesUrl: 'https://github.com/logos' },
  { name: 'gitlab', title: 'GitLab', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/gitlab.svg', category: 'VCS & Tooling', officialColor: '#FC6D26', guidelinesUrl: 'https://design.gitlab.com/brand-logo/Using-the-GitLab-logo/' },
  { name: 'amazonwebservices', title: 'AWS', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/amazonwebservices.svg', category: 'Cloud Infrastructure', aliases: ['aws'], officialColor: '#FF9900', guidelinesUrl: 'https://aws.amazon.com/trademark-guidelines/' },
  { name: 'googlecloud', title: 'Google Cloud', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/googlecloud.svg', category: 'Cloud Infrastructure', officialColor: '#4285F4', guidelinesUrl: 'https://cloud.google.com/terms' },
  { name: 'microsoftazure', title: 'Microsoft Azure', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/microsoftazure.svg', category: 'Cloud Infrastructure', aliases: ['azure'], officialColor: '#0078D4', guidelinesUrl: 'https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks' },
  { name: 'cloudflare', title: 'Cloudflare', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/cloudflare.svg', category: 'Cloud & Networking', officialColor: '#F38020', guidelinesUrl: 'https://www.cloudflare.com/press-kit/' },
  { name: 'nginx', title: 'Nginx', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/nginx.svg', category: 'Networking', officialColor: '#009639', guidelinesUrl: 'https://www.f5.com/company/policies/trademarks' },
  { name: 'graphql', title: 'GraphQL', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/graphql.svg', category: 'Backend & APIs', officialColor: '#E10098', guidelinesUrl: 'https://graphql.org/brand/' },
  { name: 'terraform', title: 'Terraform', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/terraform.svg', category: 'DevOps & IaC', officialColor: '#844FBA', guidelinesUrl: 'https://www.hashicorp.com/brand' },
  { name: 'ansible', title: 'Ansible', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/ansible.svg', category: 'DevOps & IaC', officialColor: '#EE0000', guidelinesUrl: 'https://www.redhat.com/en/about/brand-standards' },
  { name: 'prometheus', title: 'Prometheus', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/prometheus.svg', category: 'Observability', officialColor: '#E6522C', guidelinesUrl: 'https://www.linuxfoundation.org/legal/trademark-usage' },
  { name: 'grafana', title: 'Grafana', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/grafana.svg', category: 'Observability', officialColor: '#F46800', guidelinesUrl: 'https://grafana.com/legal/trademark-policy/' },
  { name: 'anthropic', title: 'Anthropic', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/anthropic.svg', category: 'AI Research', officialColor: '#D97757', guidelinesUrl: 'https://www.anthropic.com' },
  { name: 'openai', title: 'OpenAI', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/openai.svg', category: 'AI Research', officialColor: '#10A37F', guidelinesUrl: 'https://openai.com/brand' },
  { name: 'react', title: 'React', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/react.svg', category: 'Frontend', officialColor: '#61DAFB', guidelinesUrl: 'https://react.dev/' },
  { name: 'nodejs', title: 'Node.js', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/nodedotjs.svg', category: 'Backend', officialColor: '#5FA04E', guidelinesUrl: 'https://openjsf.org/wp-content/uploads/sites/84/2021/01/Node.js-Trademark-Policy.pdf' },
  { name: 'cplusplus', title: 'C++', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/cplusplus.svg', category: 'Languages', officialColor: '#00599C', guidelinesUrl: 'https://isocpp.org/' },
  { name: 'sqlite', title: 'SQLite', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/sqlite.svg', category: 'Databases', officialColor: '#003B57', guidelinesUrl: 'https://www.sqlite.org/copyright.html' },
  { name: 'supabase', title: 'Supabase', url: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/supabase.svg', category: 'Backend & DB', officialColor: '#3ECF8E', guidelinesUrl: 'https://supabase.com/brand-assets' },
];

/**
 * Direct lookup map from tech brand name or alias to CDN SVG URL.
 */
export const KNOWN_TECH_LOGOS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const item of TECH_ICONS_LIST) {
    map[item.name.toLowerCase()] = item.url;
    if (item.aliases) {
      for (const alias of item.aliases) {
        map[alias.toLowerCase()] = item.url;
      }
    }
  }
  return map;
})();

/**
 * Lookup map from tech brand name or alias to its full TechIconItem metadata.
 */
export const TECH_ICON_META_BY_KEY: Record<string, TechIconItem> = (() => {
  const map: Record<string, TechIconItem> = {};
  for (const item of TECH_ICONS_LIST) {
    map[item.name.toLowerCase()] = item;
    map[item.title.toLowerCase()] = item;
    if (item.aliases) {
      for (const alias of item.aliases) {
        map[alias.toLowerCase()] = item;
      }
    }
  }
  return map;
})();

/**
 * Detects third-party companies/brands named in text (excluding generic programming languages like go/rust/python/c++ unless explicitly a company).
 */
export const THIRD_PARTY_COMPANY_NAMES = new Set([
  'discord',
  'cloudflare',
  'anthropic',
  'openai',
  'docker',
  'kubernetes',
  'redis',
  'postgresql',
  'mysql',
  'mongodb',
  'clickhouse',
  'apachekafka',
  'github',
  'gitlab',
  'amazonwebservices',
  'googlecloud',
  'microsoftazure',
  'nginx',
  'terraform',
  'ansible',
  'prometheus',
  'grafana',
  'supabase',
  'scylladb',
  'apachecassandra',
  'cassandra',
]);

export function detectMentionedThirdPartyBrands(rawText: string): TechIconItem[] {
  if (!rawText) return [];
  const lower = rawText.toLowerCase();
  const found: TechIconItem[] = [];
  const seen = new Set<string>();

  for (const item of TECH_ICONS_LIST) {
    if (!THIRD_PARTY_COMPANY_NAMES.has(item.name)) continue;
    const terms = [item.name.toLowerCase(), item.title.toLowerCase(), ...(item.aliases || []).map((a) => a.toLowerCase())];
    for (const term of terms) {
      const rx = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (rx.test(lower)) {
        if (!seen.has(item.name)) {
          seen.add(item.name);
          found.push(item);
        }
        break;
      }
    }
  }
  return found;
}

