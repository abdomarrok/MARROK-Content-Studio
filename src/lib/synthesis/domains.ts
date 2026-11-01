import { KNOWN_TECH_LOGOS } from '../icons.ts';

export interface SynthesisInput {
  prompt?: string;
  imageFileName?: string;
  categoryHint?: string;
  inputMode?: string;
  targetSlideCount?: number;
  postFormat?: 'carousel' | 'single';
}

export interface DomainRule {
  category: string;
  theme: string;
  centerIcon: string;
  satIcons: string[];
  keywords: string[];
  metricFallback: string;
}

/**
 * Automatically maps input technical topic or prompt to the best MARROK ThemePalette:
 * - 'teal': SRE / DevTools / Backend / Monorepos / CI/CD
 * - 'cyber': Security / Post-Quantum / Zero-Trust / Exploits / CVEs
 * - 'violet': AI / LLMs / Neural Models / Inference / Transformers
 * - 'blueprint': Cloud / K8s / System Architecture / Infrastructure
 * - 'amber': Databases / SQL / Caching / In-Memory / Distributed Storage
 * - 'emerald': Linux Kernel / eBPF / Low-Level Systems / C++
 */
export function resolveDomainTheme(topicOrText: string): 'teal' | 'cyber' | 'violet' | 'blueprint' | 'amber' | 'emerald' {
  const lower = (topicOrText || '').toLowerCase();

  // 1. Cyber Threat Crimson: Security, Zero-Trust, Post-Quantum, Exploits, CVEs
  if (
    /\b(security|zero[- ]?trust|zerotrust|mtls|post[- ]?quantum|quantum|cve|exploit|malware|reverse|ghidra|ida|disassembl|vulnerab|defectdojo|sast|dast|trivy|semgrep|attack|hacker|firewall|cryptograph|least[- ]?privilege|perimeter|blast radius)\b/i.test(lower)
  ) {
    return 'cyber';
  }

  // 2. Electric AI Violet: AI, LLMs, Neural Models, Inference, Tokens
  if (
    /\b(ai|llm|llms|gpt|gpt-4|claude|gemini|transformer|deep learning|neural|weights|inference|tokens?|embedding|embeddings|rag|agentic|copilot|fine-tuning)\b/i.test(lower)
  ) {
    return 'violet';
  }

  // 3. Matrix Emerald: Linux Kernel, eBPF, Low-Level, Syscalls, Firmware, Systems Runtimes (Rust, Go, C++, Zig, Actix, Gin)
  if (
    /\b(kernel|ebpf|xdp|bpf|linux|syscall|syscalls|assembly|asm|low[- ]?level|firmware|memory safety|c\+\+|driver|rust|golang?|actix|gin|zig|bun)\b/i.test(lower)
  ) {
    return 'emerald';
  }

  // 4. Solarized Amber: Databases, SQL, Caching, Redis, In-Memory, Storage
  if (
    /\b(redis|valkey|memcached|cache|caching|in[- ]?memory|database|sql|nosql|postgres|postgresql|mysql|sqlite|clickhouse|kafka|distributed systems?|storage|replication|raft|paxos|rocksdb|lsm|key[- ]?value)\b/i.test(lower)
  ) {
    return 'amber';
  }

  // 5. Enterprise Blueprint: Cloud, Kubernetes, K8s, Docker, Cloud-Native, System Architecture
  if (
    /\b(kubernetes|k8s|cloud|docker|container|containers|helm|ingress|aws|gcp|azure|serverless|microservices?|service[- ]?mesh|envoy|istio|architecture|system architecture|cluster|infrastructure|terraform)\b/i.test(lower)
  ) {
    return 'blueprint';
  }

  // 6. Terminal Teal (Default MARROK SRE & DevTools): SRE, VCS, Git, CI/CD, Monorepo, DevTools, Performance
  return 'teal';
}

export const DOMAIN_RULES: DomainRule[] = [
  {
    category: 'WEB FRAMEWORKS & RUNTIMES',
    theme: 'emerald',
    centerIcon: 'cpu',
    satIcons: ['zap', 'gauge', 'server', 'database', 'activity', 'terminal'],
    keywords: ['rust', 'go', 'golang', 'actix', 'actix-web', 'gin', 'fastapi', 'bun', 'node', 'nodejs', 'benchmark', 'throughput', 'req/s', 'latency', 'runtime'],
    metricFallback: '129k req/s',
  },
  {
    category: 'CYBERSECURITY & ZERO-TRUST MESH',
    theme: 'cyber',
    centerIcon: 'lock',
    satIcons: ['shieldAlert', 'network', 'key', 'server', 'eyeRisk', 'terminal'],
    keywords: ['zero-trust', 'zerotrust', 'mtls', 'egress', 'bastion', 'perimeter', 'least-privilege', 'mesh', 'mutual-tls', 'envoy', 'service-mesh', 'microsegmentation'],
    metricFallback: '100% mTLS encrypted',
  },
  {
    category: 'IN-MEMORY CACHE & DATA STORES',
    theme: 'amber',
    centerIcon: 'https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/redis.svg',
    satIcons: ['database', 'zap', 'hardDrive', 'server', 'cpu', 'activity'],
    keywords: ['redis', 'valkey', 'memcached', 'cache', 'key-value', 'in-memory', 'eviction', 'lru', 'redis 8', 'throughput'],
    metricFallback: '1.2M ops/sec',
  },
  {
    category: 'VCS & DEVSECOPS',
    theme: 'teal',
    centerIcon: 'gitMerge',
    satIcons: ['server', 'cpu', 'database', 'changesets', 'terminal', 'gauge'],
    keywords: ['git', 'vcs', 'monorepo', 'ci/cd', 'devops', 'scion', 'changeset', 'pull request', 'github', 'version control', 'source control', 'agent-scale'],
    metricFallback: '25M checkouts/day',
  },
  {
    category: 'LINUX KERNEL & OBSERVABILITY',
    theme: 'emerald',
    centerIcon: 'terminal',
    satIcons: ['cpu', 'lock', 'server', 'gauge', 'binary', 'codeFile'],
    keywords: ['kernel', 'ebpf', 'c/c++', 'assembly', 'xdp', 'bpf', 'linux', 'syscall'],
    metricFallback: '0 context switches',
  },
  {
    category: 'REVERSE ENGINEERING & EXPLOITS',
    theme: 'cyber',
    centerIcon: 'shieldAlert',
    satIcons: ['binary', 'search', 'lock', 'alerts', 'eyeRisk', 'terminal'],
    keywords: ['cve', 'exploit', 'revers', 'binary', 'ghidra', 'ida', 'malware', 'zero-day', 'disassembler'],
    metricFallback: '30 min turnaround',
  },
  {
    category: 'AI MODELS & INFERENCE',
    theme: 'violet',
    centerIcon: 'brain',
    satIcons: ['cpu', 'robot', 'database', 'lightbulb', 'gauge', 'changesets'],
    keywords: ['llm', 'gpt', 'inference', 'token', 'deep learning', 'weights', 'transformer', 'neural network', 'embedding'],
    metricFallback: '10x token efficiency',
  },
  {
    category: 'KUBERNETES & CLOUD SEC',
    theme: 'blueprint',
    centerIcon: 'server',
    satIcons: ['lock', 'database', 'shieldAlert', 'gitMerge', 'alerts', 'gauge'],
    keywords: ['kubernetes', 'k8s', 'container', 'cloud', 'docker', 'webhook', 'ingress', 'helm', 'cloud-native'],
    metricFallback: '99.99% uptime',
  },
  {
    category: 'DISTRIBUTED SYSTEMS & STORAGE',
    theme: 'amber',
    centerIcon: 'database',
    satIcons: ['hardDrive', 'server', 'network', 'activity', 'cpu', 'zap'],
    keywords: ['database', 'distributed', 'storage', 'postgres', 'clickhouse', 'kafka', 'raft', 'paxos', 'replication', 'acid'],
    metricFallback: '0 ms replication lag',
  },
  {
    category: 'CAPITAL & INFRASTRUCTURE ECONOMICS',
    theme: 'amber',
    centerIcon: 'dollarSign',
    satIcons: ['landmark', 'factory', 'scales', 'trendingDown', 'users', 'lifecycle'],
    keywords: ['valuation', 'billion', 'trillion', 'loss', 'losses', 'deficit', 'capital', 'financing', 'circular', 'subsidy', 'subsidies', 'taxpayer', 'retiree', 'retirees', 'pension', 'revenue', 'cash-out', 'economy', 'economic', 'inflation', 'gigawatt', 'gigawatts', 'nuclear'],
    metricFallback: '$1.4T capital commitment',
  },
];

export const DEFAULT_RULE: DomainRule = {
  category: 'SYSTEMS ARCHITECTURE & ENGINEERING',
  theme: 'teal',
  centerIcon: 'cpu',
  satIcons: ['server', 'database', 'gitMerge', 'terminal', 'layers', 'shieldAlert'],
  keywords: [],
  metricFallback: '10x throughput boost',
};

export const ICON_AFFINITY: Record<string, string[]> = {
  dollarSign: ['valuation', 'billion', 'trillion', 'capital', 'financing', 'revenue', 'spend', 'spent', 'cash-out', 'money', 'cost', 'price', 'fund'],
  landmark: ['bank', 'government', 'taxpayer', 'treasury', 'subsidy', 'subsidies', 'backstop', 'stake', 'fed', 'wall street'],
  factory: ['nuclear', 'gigawatt', 'gigawatts', 'power plant', 'grid', 'energy', 'electricity', 'industrial'],
  trendingDown: ['loss', 'losses', 'deficit', 'burn', 'debt', 'crash', 'bubble'],
  trendingUp: ['growth', 'surge', 'valuation', 'rally'],
  lifecycle: ['circular', 'round-trip', 'loop', 'recycle'],
  users: ['retiree', 'retirees', 'pension', '401k', 'consumer', 'employee', 'household', 'taxpayer'],
  cpu: ['core', 'engine', 'execution', 'compute', 'processor', 'runtime', 'microvm', 'chip', 'gpu'],
  server: ['cluster', 'instance', 'host', 'backend', 'node', 'bare-metal'],
  database: ['storage', 'persistence', 'state', 'tables', 'records', 'sql', 'store'],
  hardDrive: ['memory', 'disk', 'cache', 'nvme', 'iops', 'ram', 'shared buffer'],
  zap: ['speed', 'instant', 'fast', 'latency', 'sub-ms', 'throughput', 'boost'],
  activity: ['telemetry', 'metrics', 'monitoring', 'p99', 'sla', 'status', 'health'],
  shieldAlert: ['security', 'threat', 'vulnerability', 'cve', 'quarantine', 'perimeter'],
  lock: ['auth', 'encryption', 'tls', 'cert', 'spiffe', 'token', 'secret'],
  key: ['credential', 'api key', 'x509', 'identity', 'least-privilege'],
  network: ['ingress', 'mesh', 'proxy', 'traffic', 'gateway', 'envoy', 'veth'],
  gitMerge: ['git', 'commit', 'branch', 'merge', 'changeset', 'vcs', 'pr'],
  terminal: ['cli', 'shell', 'bash', 'command', 'syscall', 'exec'],
  binary: ['assembly', 'disasm', 'binary', 'byte', 'opcode', 'hex'],
  robot: ['agent', 'ai worker', 'automation', 'bot', 'client'],
  brain: ['model', 'weights', 'inference', 'embedding', 'transformer'],
  search: ['retrieval', 'rag', 'query', 'vector', 'index'],
  box: ['container', 'pod', 'oci', 'image', 'shim'],
  layers: ['stack', 'tier', 'architecture', 'layered', 'pipeline'],
  codeFile: ['config', 'manifest', 'schema', 'yaml', 'json'],
  scales: ['tradeoff', 'trade-off', 'balance', 'vs', 'compare', 'contrast', 'cost', 'risk', 'exposure'],
  arrowRightLeft: ['migration', 'transition', 'sync', 'transfer', 'switch'],
  checkCircle: ['validated', 'success', 'compliant', 'passed'],
  xCircle: ['flaw', 'bottleneck', 'failed', 'outdated'],
};

/**
 * Dynamically extract relevant icons based on user input keywords and theme context.
 * Automatically resolves official web tech brand logos (Simple Icons) when specific technologies are mentioned.
 */
export function extractDynamicIcons(lowerText: string, fallbackBase: string[]): { centerIcon: string; satIcons: string[] } {
  const scoredIcons: { icon: string; score: number }[] = [];

  // 1. Check for official tech brand logos with strict word-boundary matching
  for (const [techKey, cdnUrl] of Object.entries(KNOWN_TECH_LOGOS)) {
    // Avoid substring false matches (e.g. 'rust' inside 'trust' or 'zero-trust')
    if (techKey === 'rust') {
      const stripped = lowerText.replace(/\bzero[- ]trust\b/gi, '').replace(/\btrust\b/gi, '');
      if (!/\brust\b/i.test(stripped)) {
        continue;
      }
    }
    if (techKey === 'go') {
      if (!/\b(go|golang)\b/i.test(lowerText)) {
        continue;
      }
    }

    const regex = new RegExp(`\\b${techKey}\\b`, 'i');
    if (regex.test(lowerText)) {
      scoredIcons.push({ icon: cdnUrl, score: 10 });
    }
  }

  // 2. Check general conceptual technical icons
  for (const [icon, keywords] of Object.entries(ICON_AFFINITY)) {
    let score = 0;
    for (const kw of keywords) {
      if (lowerText.includes(kw)) {
        score += 2;
      }
    }
    if (score > 0) {
      scoredIcons.push({ icon, score });
    }
  }

  scoredIcons.sort((a, b) => b.score - a.score);

  const centerIcon = scoredIcons[0]?.icon || fallbackBase[0] || 'cpu';

  const satSet = new Set<string>();
  for (const item of scoredIcons) {
    if (item.icon !== centerIcon && satSet.size < 6) {
      satSet.add(item.icon);
    }
  }

  const isFinancialOrMacro = /\$|\b(?:valuation|billion|trillion|loss|losses|deficit|capital|financing|circular|subsid|taxpayer|retiree|revenue|spend|economy|economic|energy|gigawatt|nuclear)\b/i.test(lowerText);
  const defaultFillers = isFinancialOrMacro
    ? ['dollarSign', 'landmark', 'factory', 'scales', 'trendingDown', 'lifecycle', 'users', 'cpu']
    : ['zap', 'layers', 'box', 'shieldAlert', 'database', 'gitMerge', 'server', 'terminal', 'cpu', 'brain'];
  for (const f of [...fallbackBase, ...defaultFillers]) {
    if (f !== centerIcon && satSet.size < 6) {
      satSet.add(f);
    }
  }

  return { centerIcon, satIcons: Array.from(satSet).slice(0, 6) };
}

/**
 * Extracts meaningful lines, bullet points, and metrics from raw technical user input.
 */
export function extractUserInsights(rawText: string): { lines: string[]; metrics: string[] } {
  const lines = rawText
    .split(/[\r\n]+/)
    .map((l) => l.replace(/^\s*(?:[-*•]+|\d{1,3}[.)])\s+/, '').trim())
    .filter((l) => l.length > 15 && !l.startsWith('http'));

  // Extract explicit metrics (e.g. 50x, 25%, 100GB, 25M, 30ms, $50k)
  const metricRegex = /\b\d+(?:\.\d+)?\s*(?:%|x|X|GB|TB|MB|ms|s|req|rps|checkouts|k|M|B)\b/gi;
  const metricsFound = Array.from(new Set(rawText.match(metricRegex) || []));

  return { lines, metrics: metricsFound };
}

/**
 * Brand wordmark is strictly MARROK per brand identity specification.
 * Domain topics and technologies are represented via category tags and slide copy.
 */
export function detectBrandAndUrl(_lowerText: string): { brand: string; brandUrl: string } {
  return { brand: 'MARROK', brandUrl: 'marrok.org' };
}
