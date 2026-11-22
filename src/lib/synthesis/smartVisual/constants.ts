import { CONTENT_QUALITY_FILLER_LABELS } from '../../qaChecks.ts';

export const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'are', 'was', 'were',
  'have', 'has', 'had', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must',
  'how', 'why', 'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'than', 'then',
  'them', 'they', 'their', 'there', 'here', 'more', 'most', 'some', 'such', 'only', 'over',
  'under', 'between', 'through', 'during', 'before', 'after', 'above', 'below', 'about',
  'against', 'within', 'without', 'along', 'across', 'behind', 'beyond', 'plus', 'except',
  'but', 'not', 'also', 'very', 'just', 'even', 'still', 'already', 'always', 'never',
  'often', 'sometimes', 'usually', 'every', 'each', 'both', 'either', 'neither', 'other',
  'another', 'many', 'much', 'few', 'little', 'all', 'any', 'some', 'none', 'one', 'two',
  'three', 'four', 'five', 'first', 'second', 'third', 'new', 'old', 'high', 'low', 'large',
  'small', 'long', 'short', 'good', 'bad', 'best', 'worst', 'same', 'different', 'able',
  'make', 'makes', 'made', 'using', 'used', 'uses', 'use', 'allow', 'allows', 'allowed',
  'create', 'creates', 'creating', 'become', 'becoming', 'becomes', 'while', 'where',
  // Generic meta/filler words that should never become Hub satellite labels
  'tech', 'humor', 'opinion', 'article', 'story', 'system', 'systems', 'engineering', 'software',
  'technical', 'breakdown', 'mechanisms', 'mechanism', 'operational', 'boundaries', 'boundary',
  'telemetry', 'stat', 'stats', 'metric', 'metrics', 'exposure', 'architecture', 'architectural',
  'stores', 'storing', 'stored', 'runaway', 'stop', 'stops', 'stopping', 'core', 'overview',
  'exploring', 'understanding', 'defining', 'managing', 'connecting', 'explains', 'explained',
  'deep', 'dive', 'guide', 'analysis', 'summary', 'modern', 'traditional', 'legacy',
  // Prepositions, adverbs, verbs & quantifiers that must not be selected as standalone/partial Hub node labels
  'onto', 'inside', 'outside', 'instead', 'rather', 'despite', 'whether', 'because', 'since',
  'until', 'unless', 'fourteen', 'months', 'years', 'days', 'hours', 'minutes',
  'migrated', 'reducing', 'cutting', 'removing', 'automating', 'parsing', 'complete', 'completes',
  'runs', 'running', 'lets', 'let', 'spend', 'spends', 'spent', 'serve', 'serves', 'serving',
  'shipped', 'shipping', 'parses', 'even', 'before', 'after', 'down', 'up', 'trillions', 'millions',
]);

export const GENERIC_PLACEHOLDER_LABELS = new Set([
  'client ingress',
  'control plane',
  'target service',
  'service pod',
  'vcs engine',
  'port 443',
  'policy engine',
  'encrypted pipe',
  'sys_exec.sh',
  'legacy stack',
  'modern engine',
  'system ingress',
  'durable state',
  'execution core',
  'event inbound',
  'target state',
  'standard simplicity',
  'custom architecture',
  'maintenance cost',
  'input stage',
  'core logic',
]);

export function isGenericPlaceholderValue(val?: string): boolean {
  if (!val || !val.trim()) return true;
  const trimmed = val.trim();
  const clean = trimmed.toLowerCase();
  if (GENERIC_PLACEHOLDER_LABELS.has(clean)) return true;
  if (CONTENT_QUALITY_FILLER_LABELS.has(trimmed.toUpperCase())) return true;
  if (/^component\s*0?\d+$/i.test(clean) || /^stage\s*0?\d+$/i.test(clean)) return true;
  return false;
}

export const HUB_FILLER_TOKENS = new Set([
  'tech', 'humor', 'comedy', 'meme', 'opinion', 'satire', 'joke', 'rant',
  'telemetry', 'stat', 'stats', 'metric', 'metrics', 'exposure', 'boundaries',
  'verification', 'observability', 'ingress', 'egress', 'engine', 'architecture',
  'core', 'system', 'systems', 'target', 'state', 'node', 'stage', 'layer',
  'replacing', 'replace', 'explaining', 'building', 'making', 'running', 'working', 'doing',
  'الذي', 'التي', 'كيف', 'لماذا', 'فعليا', 'فعلياً', 'ماذا', 'الأنظمة', 'المعمارية',
]);

export const NON_OWNER_WORDS = new Set([
  'how', 'why', 'when', 'what', 'where', 'who', 'which', 'we', 'they', 'our', 'their', 'this', 'that',
  'team', 'teams', 'engineers', 'engineering', 'developers', 'company', 'companies', 'startup', 'startups',
  'moving', 'migrating', 'switching', 'replacing', 'porting', 'upgrading', 'transitioning', 'building',
  'scaling', 'running', 'storing', 'serving', 'cutting', 'reducing', 'dropping', 'slashing', 'inside',
  'behind', 'lessons', 'production', 'architecture', 'database', 'storage', 'system', 'systems', 'service',
]);

export const KNOWN_STORY_OWNERS = [
  { pattern: /\bdiscord\b/i, name: 'Discord' },
  { pattern: /\buber\b/i, name: 'Uber' },
  { pattern: /\bnetflix\b/i, name: 'Netflix' },
  { pattern: /\bstripe\b/i, name: 'Stripe' },
  { pattern: /\bshopify\b/i, name: 'Shopify' },
  { pattern: /\bairbnb\b/i, name: 'Airbnb' },
  { pattern: /\bgithub\b/i, name: 'GitHub' },
  { pattern: /\bslack\b/i, name: 'Slack' },
  { pattern: /\bcloudflare\b/i, name: 'Cloudflare' },
  { pattern: /\bfigma\b/i, name: 'Figma' },
  { pattern: /\bnotion\b/i, name: 'Notion' },
  { pattern: /\blinear\b/i, name: 'Linear' },
  { pattern: /\bvercel\b/i, name: 'Vercel' },
  { pattern: /\bdatadog\b/i, name: 'Datadog' },
  { pattern: /\bdropbox\b/i, name: 'Dropbox' },
  { pattern: /\blinkedin\b/i, name: 'LinkedIn' },
  { pattern: /\bpinterest\b/i, name: 'Pinterest' },
  { pattern: /\binstacart\b/i, name: 'Instacart' },
  { pattern: /\bcoinbase\b/i, name: 'Coinbase' },
  { pattern: /\bdoorDash\b/i, name: 'DoorDash' },
];
