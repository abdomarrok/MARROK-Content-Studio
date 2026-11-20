import type { ContentPillarId, TargetPlatform } from '../../types.ts';

export interface ContentPillarConfig {
  id: ContentPillarId;
  label: string;
  badge: string;
  keywords: string[];
  toneGuidance: string;
  topicExamples: string[];
  ctaTemplates: string[];
  qualityChecks: string[];
}

export interface PlatformGuidanceConfig {
  platform: TargetPlatform;
  displayName: string;
  formatRecommendations: string[];
  hookStrategy: string;
  storytellingRules: string[];
  ctaDirectives: string[];
  recommendedDurations?: string;
  defaultSlotDZ: string;
}

export interface PlatformPerformanceBaseline {
  platform: TargetPlatform;
  reportPeriod: string;
  dataSource: 'static-report' | 'live-api';
  metrics: {
    reportedAccountDailyViews?: number;
    summedDailyReachObservations?: number;
    latestFollowerSnapshot?: number;
    approximateFollowerChange?: number;
    totalPublications?: number;
    avgViewsPerPublication?: number;
    calculatedInteractionsPerViewPct?: number; // (likes + comments + shares) / views
    topPerformingFormats: string[];
    strongDistributionExamples: Array<{
      title: string;
      views: number;
      pillar: ContentPillarId;
    }>;
    strongEngagementExamples: Array<{
      title: string;
      pillar: ContentPillarId;
    }>;
    metricoolSuggestedSlotsDZ?: Array<{
      day: string;
      time: string;
      strength: 'strong' | 'experimental';
    }>;
    dataQualifications: string[];
  };
}

export const CONTENT_PILLARS: Record<ContentPillarId, ContentPillarConfig> = {
  cybersecurity: {
    id: 'cybersecurity',
    label: 'Cybersecurity',
    badge: 'SECURITY RESEARCH',
    keywords: [
      'cve', 'vulnerability', 'exploit', 'zero-day', 'rce', 'blast radius',
      'sandbox escape', 'cvss', 'malware', 'defectdojo', 'sast', 'dast',
      'attack surface', 'post-quantum', 'zero-trust', 'mtls', 'patch boundary',
      'reverse engineering', 'buffer overflow', 'brotli', 'injection',
    ],
    toneGuidance:
      'Rigorous, evidence-anchored, and technically authoritative. Never sensationalize or invent CVEs or exploit paths. Distinguish confirmed facts from speculation. Require source verification before generating definitive claims.',
    topicExamples: [
      'Brotli decompression vulnerability in Node.js runtime',
      'ARTEX AI-powered offensive security agents',
      'DefectDojo DevSecOps automated vulnerability triage',
      'JVM Sandbox escape via unchecked reflection bounds',
    ],
    ctaTemplates: [
      'How does your team enforce patch boundaries before public CVE disclosure? • كيف تدير فريقك حدود الترقيع؟',
      'What is your fallback when perimeter authentication fails? • ما هو مسار الطوارئ لديك؟',
      'Are your container images scanned before or after merge? • هل تفحص الحاويات قبل الدمج؟',
    ],
    qualityChecks: [
      'Verify CVE ID and affected version numbers verbatim from source.',
      'Distinguish confirmed exploit from theoretical proof-of-concept.',
      'Never invent database/storage analogies for security flaws.',
    ],
  },
  'artificial-intelligence': {
    id: 'artificial-intelligence',
    label: 'Artificial Intelligence',
    badge: 'AI SYSTEMS & AGENTS',
    keywords: [
      'ai', 'agent', 'agents', 'llm', 'llms', 'inference', 'tokens', 'embedding',
      'embeddings', 'rag', 'context engineering', 'transformer', 'fine-tuning',
      'neural', 'weights', 'mcp', 'copilot', 'autonomous', 'gemini', 'claude',
    ],
    toneGuidance:
      'Pragmatic, architecture-focused, and skeptical of hype. Highlight actual throughput, token budgets, context degradation, and real-world implementation trade-offs.',
    topicExamples: [
      'Context engineering vs RAG for multi-step agent reasoning',
      'Building offline fallback cascades for production LLM gateways',
      'Token budget containment in agentic loops',
      'Deterministic structured outputs with constrained-decoding FSMs',
    ],
    ctaTemplates: [
      'Where do autonomous agents fail first in your production stack? • أين تتعطل الوكلاء أولاً لديك؟',
      'Do you run multi-turn agent loops with or without human approval gates? • كيف تدير بوابات الاعتماد؟',
      'What token budget ceiling do you enforce per user request? • ما هو سقف استهلاك الرموز؟',
    ],
    qualityChecks: [
      'No fabricated benchmark multipliers (e.g. avoid unsupported "100x speedup").',
      'Keep model names and version identifiers exact.',
    ],
  },
  'software-engineering': {
    id: 'software-engineering',
    label: 'Software Engineering',
    badge: 'SYSTEMS ARCHITECTURE',
    keywords: [
      'architecture', 'distributed systems', 'database', 'postgres', 'redis',
      'cache', 'latency', 'p99', 'concurrency', 'raft', 'kafka', 'compiler',
      'rust', 'go', 'golang', 'microservices', 'monorepo', 'wal', 'sharding',
    ],
    toneGuidance:
      'Engineering-first, grounded in production postmortems, performance measurements, and architectural trade-offs. Communicate depth without buzzwords.',
    topicExamples: [
      'Why Discord migrated from Cassandra to ScyllaDB for 125ms -> 15ms latency',
      'Why Anthropic built Scion to replace Git for agent workloads',
      'Single-threaded event loop vs thread-per-core scalability',
      'Zero-copy networking with eBPF and XDP',
    ],
    ctaTemplates: [
      'What is your primary architectural bottleneck under 10x traffic? • أين يقع عنق الزجاجة لديك؟',
      'Do you prefer optimistic locking or distributed consensus for state synchronization? • كيف تفضل مزامنة الحالة؟',
    ],
    qualityChecks: [
      'Verify units (ms, req/s, GB) directly match benchmark claims.',
      'Explain mechanism before showing numbers.',
    ],
  },
  'developer-culture': {
    id: 'developer-culture',
    label: 'Developer Culture & Humor',
    badge: 'DEV LOGIC & CULTURE',
    keywords: [
      'humor', 'meme', 'developer logic', 'code review', 'production outage',
      'on-call', 'friday deploy', 'git rebase', 'junior vs senior', 'refactor',
      'legacy codebase', 'debugging', 'stackoverflow', 'pr review',
    ],
    toneGuidance:
      'Relatable, intelligent developer humor grounded in real production situations. Avoid cheap non-technical jokes; focus on genuine engineering absurdities and ironies.',
    topicExamples: [
      'Deploying on Friday at 4:59 PM: A telemetry horror story',
      'When the hotfix creates three new edge cases in staging',
      'The developer who replaced a 500-line microservice with 1 SQL query',
    ],
    ctaTemplates: [
      'What was the most stressful production bug you diagnosed on call? • ما هو أصعب خطأ واجهته؟',
      'Have you ever had to rollback a migration live in production? • هل اضطررت لاسترجاع ترحيل بيانات حي؟',
    ],
    qualityChecks: [
      'Keep technical punchlines accurate to actual developer tooling.',
      'Balance humor with Marrok professional credibility.',
    ],
  },
  'practical-tech': {
    id: 'practical-tech',
    label: 'Practical Technology',
    badge: 'HANDS-ON TECH & DEMOS',
    keywords: [
      'tutorial', 'demo', 'demonstration', 'workflow', 'dev tool', 'terminal',
      'cli', 'docker', 'kubernetes', 'setup', 'howto', 'robotics', 'hardware',
      'automation', 'script', 'productivity',
    ],
    toneGuidance:
      'Direct, step-by-step, actionable, and visually clear. Focus on immediate utility that developers or SMEs can apply right away.',
    topicExamples: [
      'Setting up mTLS between microservices in 4 terminal commands',
      'Hands-on robotics hardware control pipeline',
      'Automating GitHub Actions artifact caching for 3x faster CI',
    ],
    ctaTemplates: [
      'Which CLI tool has saved your engineering team the most time this quarter? • ما هي الأداة الأكثر توفيراً للوقت؟',
      'Would you like a runnable script or container template for this setup? • هل تحتاج قالباً قابلاً للتشغيل؟',
    ],
    qualityChecks: [
      'Ensure code snippets or commands are syntactically valid and runnable.',
      'Specify exact prerequisite dependencies.',
    ],
  },
};

export const PLATFORM_GUIDANCE: Record<TargetPlatform, PlatformGuidanceConfig> = {
  tiktok: {
    platform: 'tiktok',
    displayName: 'TikTok',
    formatRecommendations: [
      'Curiosity-driven high-density photo carousels (strongest historical views)',
      '15–25 second focused technical video explainers',
      'Single-concept technical breakdowns with high visual contrast',
    ],
    hookStrategy:
      'Aggressive scroll-stopping open loop. Name the exact production consequence, CVSS threat, or shocking benchmark in the opening 2 seconds. Zero fluff or preamble.',
    storytellingRules: [
      'Strictly ONE main idea per publication.',
      'Fast narrative progression: Problem -> Mechanism -> Punchy Proof -> Sharp Question.',
      'Conversational, crisp wording under 18 words per slide.',
    ],
    ctaDirectives: [
      'Use high-tension polarizing questions.',
      'Keep comment prompts specific to technical trade-offs.',
    ],
    recommendedDurations: '15–25 seconds for video; 4–7 slides for photo carousel.',
    defaultSlotDZ: '10:00 DZ',
  },
  instagram: {
    platform: 'instagram',
    displayName: 'Instagram',
    formatRecommendations: [
      'Reels for discovery and reach expansion (98 avg views vs 25.8 feed posts)',
      'High-retention swipe carousels for educational depth and reference saving',
      'Interactive Stories with polls/stickers for community retention',
    ],
    hookStrategy:
      'Visually striking Cover Hero with clean typography, concise kicker badge, and punchy single-line swipe teaser under 68 characters.',
    storytellingRules: [
      'Educational depth: 1 central idea per slide with clear visual schematics.',
      'Include a distinct, memorable conclusion slide before the CTA.',
      'Optimize for saves and shares (high-utility reference material).',
    ],
    ctaDirectives: [
      'Encourage saves: "Save this reference for your next architecture review."',
      'Clear directional swipe cues.',
    ],
    recommendedDurations: '30–60 seconds for Reels; 6–8 slides for carousels.',
    defaultSlotDZ: '18:00 DZ',
  },
  linkedin: {
    platform: 'linkedin',
    displayName: 'LinkedIn',
    formatRecommendations: [
      'Document/PDF swipe carousel with high-density architectural schematics',
      'In-depth technical breakdown with data tables or benchmark charts',
      'Postmortem engineering lessons with executive summary',
    ],
    hookStrategy:
      'High-credibility engineering insight or counter-intuitive architectural decision. Lead with the business or scalability impact.',
    storytellingRules: [
      'Professional, authoritative engineering voice.',
      'Focus on engineering trade-offs, organizational scale, and production reliability.',
      'Highlight concrete data, methodology, and lessons learned.',
    ],
    ctaDirectives: [
      'Invite senior engineering peer discussion on architectural trade-offs.',
      'Ask specific questions about stack architecture.',
    ],
    defaultSlotDZ: '10:00 DZ',
  },
  facebook: {
    platform: 'facebook',
    displayName: 'Facebook',
    formatRecommendations: [
      'Shareable technical explainer image with structured caption',
      'Accessible software engineering tutorial or tool showcase',
      'Community discussion around relatable developer experiences',
    ],
    hookStrategy:
      'Accessible, relatable technical hook that bridges beginner curiosity and engineering rigor.',
    storytellingRules: [
      'Clear, jargon-demystifying narrative.',
      'Highlight real-world implications of tech news and tools.',
    ],
    ctaDirectives: [
      'Encourage community sharing and comments.',
      'Ask approachable technical questions.',
    ],
    defaultSlotDZ: '18:00 DZ',
  },
  all: {
    platform: 'all',
    displayName: 'Cross-Platform (Instagram + TikTok + LinkedIn + Facebook)',
    formatRecommendations: [
      'Bilingual dark-themed multi-slide carousel adaptable across platforms',
      'Universal 1-slide high-density technical poster',
    ],
    hookStrategy:
      'Universal high-stakes impact hook grounded in concrete numbers and unresolved tension.',
    storytellingRules: [
      'Ensure content works as both a quick TikTok swipe and a deep LinkedIn document read.',
      'Keep headlines concise (6 to 12 words) and body copy under 20 words per slide.',
    ],
    ctaDirectives: [
      'Balanced technical question relevant to both individual engineers and tech leads.',
    ],
    defaultSlotDZ: '10:00 DZ',
  },
};

/**
 * Historical performance baselines from Marrok's Oct 22 – Nov 20, 2026 reports.
 * Labeled strictly as static observation snapshots.
 */
export const HISTORICAL_BASELINES: Record<'instagram' | 'tiktok', PlatformPerformanceBaseline> = {
  tiktok: {
    platform: 'tiktok',
    reportPeriod: '2026-10-22 to 2026-11-20',
    dataSource: 'static-report',
    metrics: {
      totalPublications: 30,
      avgViewsPerPublication: 179,
      latestFollowerSnapshot: 1179,
      approximateFollowerChange: 128,
      calculatedInteractionsPerViewPct: 6.32,
      topPerformingFormats: [
        'Photo publications (24 posts, 4,459 views, 186 avg views)',
        'Video publications (6 posts, 919 views, 153 avg views)',
      ],
      strongDistributionExamples: [
        { title: 'ARTEX AI-powered offensive agents', views: 343, pillar: 'cybersecurity' },
        { title: 'Brotli vulnerability in Node.js', views: 274, pillar: 'cybersecurity' },
        { title: 'Developer Logic & Tech Humor', views: 270, pillar: 'developer-culture' },
        { title: 'Cybersecurity documentaries', views: 245, pillar: 'cybersecurity' },
      ],
      strongEngagementExamples: [
        { title: 'Cybersecurity documentaries', pillar: 'cybersecurity' },
        { title: 'AI context engineering', pillar: 'artificial-intelligence' },
        { title: 'DefectDojo DevSecOps', pillar: 'cybersecurity' },
        { title: 'Developer architecture content', pillar: 'software-engineering' },
      ],
      metricoolSuggestedSlotsDZ: [
        { day: 'Thursday', time: '10:00', strength: 'strong' },
        { day: 'Wednesday', time: '10:00', strength: 'strong' },
        { day: 'Friday', time: '18:00', strength: 'experimental' },
        { day: 'Tuesday', time: '10:00', strength: 'experimental' },
        { day: 'Monday', time: '18:00', strength: 'experimental' },
      ],
      dataQualifications: [
        'Interactions per view (6.32%) is calculated as (likes + comments + shares) / views, NOT Metricool reach engagement.',
        'Historical follower series contains irregular values; endpoint change is approximate (+128).',
        'Sample sizes for photo (24) vs video (6) are unequal; do not conclude photos are inherently superior.',
      ],
    },
  },
  instagram: {
    platform: 'instagram',
    reportPeriod: '2026-10-22 to 2026-11-20',
    dataSource: 'static-report',
    metrics: {
      reportedAccountDailyViews: 7410,
      summedDailyReachObservations: 6650,
      latestFollowerSnapshot: 1242,
      approximateFollowerChange: 1,
      totalPublications: 16,
      topPerformingFormats: [
        'Reels: 98 avg views (294 views / 3 reels) — stronger discovery format',
        'Feed posts: 25.8 avg views (258 views / 10 posts) — reference and educational value',
      ],
      strongDistributionExamples: [
        { title: 'Robotics demonstration', views: 98, pillar: 'practical-tech' },
        { title: 'Developer Logic & Tech Humor', views: 98, pillar: 'developer-culture' },
      ],
      strongEngagementExamples: [
        { title: 'Robotics demonstration', pillar: 'practical-tech' },
        { title: 'Developer Logic & Tech Humor', pillar: 'developer-culture' },
      ],
      dataQualifications: [
        '6,650 summed daily reach observations is NOT unique 30-day reach.',
        'Reels outperform feed posts by ~3.8x in discovery views in this sample period.',
      ],
    },
  },
};

/**
 * Automatically detects the most relevant ContentPillarId from raw text.
 */
export function detectContentPillar(rawText: string): ContentPillarId {
  const text = (rawText || '').toLowerCase();
  if (!text) return 'software-engineering';

  let bestPillar: ContentPillarId = 'software-engineering';
  let maxScore = 0;

  for (const pillar of Object.values(CONTENT_PILLARS)) {
    let score = 0;
    for (const kw of pillar.keywords) {
      if (text.includes(kw)) {
        score += kw.length > 5 ? 2 : 1;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestPillar = pillar.id;
    }
  }

  return bestPillar;
}

/**
 * Returns formatted guidance for a given platform.
 */
export function getPlatformGuidance(platform: TargetPlatform): PlatformGuidanceConfig {
  return PLATFORM_GUIDANCE[platform] || PLATFORM_GUIDANCE.all;
}

/**
 * Returns relevant performance insights string for prompt injection.
 */
export function getRelevantInsights(
  pillarId: ContentPillarId,
  platform: TargetPlatform
): string {
  const insights: string[] = [];

  if (platform === 'tiktok' || platform === 'all') {
    const tk = HISTORICAL_BASELINES.tiktok;
    const matchingTk = tk.metrics.strongDistributionExamples.filter(
      (e) => e.pillar === pillarId
    );
    if (matchingTk.length > 0) {
      insights.push(
        `TikTok Historical Top Performers in ${CONTENT_PILLARS[pillarId].label}: ${matchingTk.map((m) => `"${m.title}" (${m.views} views)`).join(', ')}.`
      );
    }
  }

  if (platform === 'instagram' || platform === 'all') {
    const ig = HISTORICAL_BASELINES.instagram;
    const matchingIg = ig.metrics.strongDistributionExamples.filter(
      (e) => e.pillar === pillarId
    );
    if (matchingIg.length > 0) {
      insights.push(
        `Instagram Historical Discovery Winners in ${CONTENT_PILLARS[pillarId].label}: ${matchingIg.map((m) => `"${m.title}" (~${m.views} views)`).join(', ')}.`
      );
    }
  }

  if (insights.length === 0) {
    insights.push(
      `Historical Benchmark: Focus on high-contrast technical problem statements and verified production figures for optimal distribution.`
    );
  }

  return insights.join(' ');
}
