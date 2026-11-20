import type { ThemePalette } from '../../types.ts';

export const DEFAULT_SVG_VIEWBOX = '0 0 846 490';
export const MAX_SVG_BLUEPRINT_LENGTH = 24_000;

export const SVG_THEME_TOKENS = [
  { token: '{{accent}}', label: 'Accent' },
  { token: '{{alert}}', label: 'Alert' },
  { token: '{{surface}}', label: 'Surface' },
  { token: '{{surfaceBorder}}', label: 'Border' },
  { token: '{{textWhite}}', label: 'Primary Text' },
  { token: '{{textMuted}}', label: 'Muted Text' },
  { token: '{{baseBg}}', label: 'Canvas Bg' },
  { token: '{{gridLine}}', label: 'Grid Line' },
] as const;

export interface SvgBlueprintPreset {
  id: string;
  name: string;
  description: string;
  viewBox: string;
  svgCode: string;
}

export const SVG_BLUEPRINT_PRESETS: SvgBlueprintPreset[] = [
  {
    id: 'ring-consensus',
    name: 'Consensus Ring',
    description: 'Consistent hash / Raft quorum ring with active leader',
    viewBox: '0 0 846 490',
    svgCode: `<svg viewBox="0 0 846 490" xmlns="http://www.w3.org/2000/svg">
  <rect x="20" y="20" width="806" height="450" rx="20" fill="{{surface}}" stroke="{{surfaceBorder}}" stroke-width="1.5"/>
  <circle cx="423" cy="245" r="142" fill="none" stroke="{{accent}}" stroke-width="2" stroke-dasharray="6 6" opacity="0.55"/>
  <circle cx="423" cy="245" r="56" fill="{{baseBg}}" stroke="{{accent}}" stroke-width="2.5"/>
  <text x="423" y="238" text-anchor="middle" fill="{{accent}}" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">QUORUM</text>
  <text x="423" y="262" text-anchor="middle" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="22" font-weight="800">3 / 5 ACK</text>
  <line x1="423" y1="189" x2="423" y2="128" stroke="{{accent}}" stroke-width="2"/>
  <line x1="474" y1="222" x2="538" y2="195" stroke="{{accent}}" stroke-width="2"/>
  <line x1="464" y1="286" x2="516" y2="338" stroke="{{accent}}" stroke-width="2"/>
  <line x1="382" y1="286" x2="330" y2="338" stroke="{{alert}}" stroke-width="2" stroke-dasharray="4 4"/>
  <line x1="372" y1="222" x2="308" y2="195" stroke="{{accent}}" stroke-width="2"/>
  <g>
    <rect x="353" y="68" width="140" height="58" rx="12" fill="{{baseBg}}" stroke="{{accent}}" stroke-width="2"/>
    <text x="423" y="94" text-anchor="middle" fill="{{accent}}" font-family="JetBrains Mono, monospace" font-size="14" font-weight="700">LEADER</text>
    <text x="423" y="114" text-anchor="middle" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="18" font-weight="700">Node 01</text>
  </g>
  <g>
    <rect x="538" y="160" width="136" height="56" rx="12" fill="{{baseBg}}" stroke="{{surfaceBorder}}" stroke-width="1.5"/>
    <text x="606" y="185" text-anchor="middle" fill="{{textMuted}}" font-family="JetBrains Mono, monospace" font-size="13">FOLLOWER</text>
    <text x="606" y="205" text-anchor="middle" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="17" font-weight="700">Node 02</text>
  </g>
  <g>
    <rect x="494" y="336" width="136" height="56" rx="12" fill="{{baseBg}}" stroke="{{surfaceBorder}}" stroke-width="1.5"/>
    <text x="562" y="361" text-anchor="middle" fill="{{textMuted}}" font-family="JetBrains Mono, monospace" font-size="13">FOLLOWER</text>
    <text x="562" y="381" text-anchor="middle" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="17" font-weight="700">Node 03</text>
  </g>
  <g>
    <rect x="216" y="336" width="136" height="56" rx="12" fill="{{baseBg}}" stroke="{{alert}}" stroke-width="2"/>
    <text x="284" y="361" text-anchor="middle" fill="{{alert}}" font-family="JetBrains Mono, monospace" font-size="13" font-weight="700">PARTITIONED</text>
    <text x="284" y="381" text-anchor="middle" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="17" font-weight="700">Node 04</text>
  </g>
  <g>
    <rect x="172" y="160" width="136" height="56" rx="12" fill="{{baseBg}}" stroke="{{surfaceBorder}}" stroke-width="1.5"/>
    <text x="240" y="185" text-anchor="middle" fill="{{textMuted}}" font-family="JetBrains Mono, monospace" font-size="13">FOLLOWER</text>
    <text x="240" y="205" text-anchor="middle" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="17" font-weight="700">Node 05</text>
  </g>
</svg>`,
  },
  {
    id: 'cache-hierarchy',
    name: 'Cache Hierarchy',
    description: 'Tiered latency pyramid from L1 RAM to cold object storage',
    viewBox: '0 0 846 490',
    svgCode: `<svg viewBox="0 0 846 490" xmlns="http://www.w3.org/2000/svg">
  <rect x="20" y="20" width="806" height="450" rx="20" fill="{{surface}}" stroke="{{surfaceBorder}}" stroke-width="1.5"/>
  <text x="56" y="64" fill="{{accent}}" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">MEMORY &amp; STORAGE TIERS</text>
  <text x="790" y="64" text-anchor="end" fill="{{textMuted}}" font-family="JetBrains Mono, monospace" font-size="15">LATENCY / CAPACITY</text>
  <rect x="243" y="96" width="360" height="72" rx="12" fill="{{baseBg}}" stroke="{{accent}}" stroke-width="2.2"/>
  <text x="268" y="128" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="22" font-weight="800">L1 In-Process</text>
  <text x="578" y="128" text-anchor="end" fill="{{accent}}" font-family="JetBrains Mono, monospace" font-size="20" font-weight="700">~50 ns</text>
  <text x="268" y="152" fill="{{textMuted}}" font-family="Plus Jakarta Sans, sans-serif" font-size="15">Hot keys in local heap</text>
  <rect x="173" y="186" width="500" height="76" rx="12" fill="{{baseBg}}" stroke="{{surfaceBorder}}" stroke-width="1.8"/>
  <text x="198" y="220" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="22" font-weight="800">L2 Redis / Valkey</text>
  <text x="648" y="220" text-anchor="end" fill="{{accent}}" font-family="JetBrains Mono, monospace" font-size="20" font-weight="700">0.8 ms</text>
  <text x="198" y="246" fill="{{textMuted}}" font-family="Plus Jakarta Sans, sans-serif" font-size="15">Shared cluster memory pool</text>
  <rect x="108" y="280" width="630" height="76" rx="12" fill="{{baseBg}}" stroke="{{surfaceBorder}}" stroke-width="1.8"/>
  <text x="134" y="314" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="22" font-weight="800">L3 NVMe Primary DB</text>
  <text x="712" y="314" text-anchor="end" fill="{{textWhite}}" font-family="JetBrains Mono, monospace" font-size="20" font-weight="700">6 ms</text>
  <text x="134" y="340" fill="{{textMuted}}" font-family="Plus Jakarta Sans, sans-serif" font-size="15">WAL + indexed page cache</text>
  <rect x="56" y="374" width="734" height="72" rx="12" fill="{{baseBg}}" stroke="{{alert}}" stroke-width="1.8"/>
  <text x="82" y="406" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="22" font-weight="800">L4 Object Store Archive</text>
  <text x="764" y="406" text-anchor="end" fill="{{alert}}" font-family="JetBrains Mono, monospace" font-size="20" font-weight="700">45+ ms</text>
  <text x="82" y="430" fill="{{textMuted}}" font-family="Plus Jakarta Sans, sans-serif" font-size="15">Compacted cold partitions &amp; snapshots</text>
</svg>`,
  },
  {
    id: 'circuit-breaker',
    name: 'Circuit Breaker',
    description: 'Closed -> Open -> Half-Open resilience state machine',
    viewBox: '0 0 846 490',
    svgCode: `<svg viewBox="0 0 846 490" xmlns="http://www.w3.org/2000/svg">
  <rect x="20" y="20" width="806" height="450" rx="20" fill="{{surface}}" stroke="{{surfaceBorder}}" stroke-width="1.5"/>
  <text x="56" y="64" fill="{{accent}}" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">CIRCUIT BREAKER STATE MACHINE</text>
  <rect x="64" y="156" width="210" height="128" rx="16" fill="{{baseBg}}" stroke="{{accent}}" stroke-width="2.5"/>
  <text x="169" y="198" text-anchor="middle" fill="{{accent}}" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">STATE 01</text>
  <text x="169" y="232" text-anchor="middle" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="26" font-weight="800">CLOSED</text>
  <text x="169" y="262" text-anchor="middle" fill="{{textMuted}}" font-family="Plus Jakarta Sans, sans-serif" font-size="16">Traffic flows normally</text>
  <rect x="572" y="156" width="210" height="128" rx="16" fill="{{baseBg}}" stroke="{{alert}}" stroke-width="2.5"/>
  <text x="677" y="198" text-anchor="middle" fill="{{alert}}" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">STATE 02</text>
  <text x="677" y="232" text-anchor="middle" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="26" font-weight="800">OPEN</text>
  <text x="677" y="262" text-anchor="middle" fill="{{textMuted}}" font-family="Plus Jakarta Sans, sans-serif" font-size="16">Fail-fast shed load</text>
  <rect x="318" y="324" width="210" height="114" rx="16" fill="{{baseBg}}" stroke="{{surfaceBorder}}" stroke-width="2"/>
  <text x="423" y="362" text-anchor="middle" fill="{{accent}}" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700">STATE 03</text>
  <text x="423" y="394" text-anchor="middle" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="24" font-weight="800">HALF-OPEN</text>
  <text x="423" y="420" text-anchor="middle" fill="{{textMuted}}" font-family="Plus Jakarta Sans, sans-serif" font-size="15">Canary probe requests</text>
  <line x1="274" y1="210" x2="570" y2="210" stroke="{{alert}}" stroke-width="2.5"/>
  <polygon points="570,210 554,201 554,219" fill="{{alert}}"/>
  <text x="423" y="194" text-anchor="middle" fill="{{alert}}" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700">ERROR RATE &gt; THRESHOLD</text>
  <path d="M 677 284 L 677 382 L 530 382" fill="none" stroke="{{textMuted}}" stroke-width="2" stroke-dasharray="6 5"/>
  <polygon points="530,382 546,374 546,390" fill="{{textMuted}}"/>
  <text x="655" y="364" text-anchor="end" fill="{{textMuted}}" font-family="JetBrains Mono, monospace" font-size="14">COOLDOWN EXPIRES</text>
  <path d="M 318 382 L 169 382 L 169 286" fill="none" stroke="{{accent}}" stroke-width="2.2"/>
  <polygon points="169,286 161,302 177,302" fill="{{accent}}"/>
  <text x="184" y="364" fill="{{accent}}" font-family="JetBrains Mono, monospace" font-size="14" font-weight="700">PROBES PASS</text>
</svg>`,
  },
  {
    id: 'request-pipeline',
    name: 'Edge Pipeline',
    description: 'Four-stage ingress -> verify -> route -> commit flow',
    viewBox: '0 0 846 490',
    svgCode: `<svg viewBox="0 0 846 490" xmlns="http://www.w3.org/2000/svg">
  <rect x="20" y="20" width="806" height="450" rx="20" fill="{{surface}}" stroke="{{surfaceBorder}}" stroke-width="1.5"/>
  <text x="54" y="64" fill="{{accent}}" font-family="JetBrains Mono, monospace" font-size="16" font-weight="700">REQUEST EXECUTION PIPELINE</text>
  <rect x="54" y="150" width="160" height="190" rx="14" fill="{{baseBg}}" stroke="{{surfaceBorder}}" stroke-width="1.8"/>
  <text x="134" y="192" text-anchor="middle" fill="{{accent}}" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700">01</text>
  <text x="134" y="238" text-anchor="middle" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="22" font-weight="800">Edge POP</text>
  <text x="134" y="274" text-anchor="middle" fill="{{textMuted}}" font-family="Plus Jakarta Sans, sans-serif" font-size="15">TLS + Rate Limit</text>
  <rect x="246" y="150" width="160" height="190" rx="14" fill="{{baseBg}}" stroke="{{surfaceBorder}}" stroke-width="1.8"/>
  <text x="326" y="192" text-anchor="middle" fill="{{accent}}" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700">02</text>
  <text x="326" y="238" text-anchor="middle" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="22" font-weight="800">Auth Gate</text>
  <text x="326" y="274" text-anchor="middle" fill="{{textMuted}}" font-family="Plus Jakarta Sans, sans-serif" font-size="15">JWT + Policy</text>
  <rect x="438" y="150" width="160" height="190" rx="14" fill="{{baseBg}}" stroke="{{accent}}" stroke-width="2.2"/>
  <text x="518" y="192" text-anchor="middle" fill="{{accent}}" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700">03</text>
  <text x="518" y="238" text-anchor="middle" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="22" font-weight="800">Worker</text>
  <text x="518" y="274" text-anchor="middle" fill="{{textMuted}}" font-family="Plus Jakarta Sans, sans-serif" font-size="15">Stateless Compute</text>
  <rect x="630" y="150" width="160" height="190" rx="14" fill="{{baseBg}}" stroke="{{surfaceBorder}}" stroke-width="1.8"/>
  <text x="710" y="192" text-anchor="middle" fill="{{accent}}" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700">04</text>
  <text x="710" y="238" text-anchor="middle" fill="{{textWhite}}" font-family="Plus Jakarta Sans, sans-serif" font-size="22" font-weight="800">Commit Log</text>
  <text x="710" y="274" text-anchor="middle" fill="{{textMuted}}" font-family="Plus Jakarta Sans, sans-serif" font-size="15">Durable WAL</text>
  <line x1="214" y1="245" x2="244" y2="245" stroke="{{accent}}" stroke-width="2.5"/>
  <line x1="406" y1="245" x2="436" y2="245" stroke="{{accent}}" stroke-width="2.5"/>
  <line x1="598" y1="245" x2="628" y2="245" stroke="{{accent}}" stroke-width="2.5"/>
  <line x1="54" y1="396" x2="790" y2="396" stroke="{{surfaceBorder}}" stroke-width="1"/>
  <text x="54" y="432" fill="{{textMuted}}" font-family="JetBrains Mono, monospace" font-size="15">ZERO-TRUST PATH  ·  END-TO-END TRACED</text>
</svg>`,
  },
];

const ALLOWED_SVG_TAGS = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'lineargradient',
  'radialgradient',
  'stop',
  'marker',
  'clippath',
  'pattern',
  'title',
  'desc',
]);

const FORBIDDEN_BLOCK_TAGS = [
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'applet',
  'audio',
  'video',
  'canvas',
  'image',
  'style',
  'animate',
  'animatetransform',
  'animatemotion',
  'set',
];

const SAFE_ATTR_NAMES = new Set([
  'xmlns',
  'viewbox',
  'width',
  'height',
  'preserveaspectratio',
  'id',
  'class',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'dx',
  'dy',
  'd',
  'points',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'transform',
  'text-anchor',
  'dominant-baseline',
  'font-family',
  'font-size',
  'font-weight',
  'letter-spacing',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientunits',
  'gradienttransform',
  'markerwidth',
  'markerheight',
  'refx',
  'refy',
  'orient',
  'marker-start',
  'marker-mid',
  'marker-end',
  'clip-path',
  'patternunits',
  'spreadmethod',
  'fx',
  'fy',
  'style',
]);

export interface SanitizedSvgBlueprintResult {
  svg: string;
  dataUrl: string;
  warnings: string[];
  isValid: boolean;
}

function sanitizeViewBox(raw?: string): string {
  if (!raw) return DEFAULT_SVG_VIEWBOX;
  const nums = raw
    .trim()
    .split(/[\s,]+/)
    .map((n) => Number(n));
  if (
    nums.length === 4 &&
    nums.every((n) => Number.isFinite(n)) &&
    nums[2] > 0 &&
    nums[3] > 0 &&
    nums[2] <= 8000 &&
    nums[3] <= 8000
  ) {
    return nums.join(' ');
  }
  return DEFAULT_SVG_VIEWBOX;
}

function sanitizeInlineStyle(rawStyle: string, warnings: string[]): string {
  if (/@import|expression\s*\(|javascript:|vbscript:|url\s*\(\s*['"]?\s*(?:https?:|\/\/|data:)/i.test(rawStyle)) {
    warnings.push('Stripped unsafe CSS directive or external URL inside style attribute.');
    return '';
  }
  const safeParts: string[] = [];
  for (const decl of rawStyle.split(';')) {
    const idx = decl.indexOf(':');
    if (idx <= 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const val = decl.slice(idx + 1).trim();
    if (!prop || !val) continue;
    if (/^(?:fill|stroke|stroke-width|stroke-dasharray|opacity|fill-opacity|stroke-opacity|font-family|font-size|font-weight|letter-spacing|text-anchor)$/.test(prop)) {
      if (!/url\s*\(\s*['"]?\s*(?!#)/i.test(val)) {
        safeParts.push(`${prop}:${val}`);
      }
    }
  }
  return safeParts.join(';');
}

function sanitizeAttributeList(rawAttrs: string, warnings: string[]): string {
  const cleaned: string[] = [];
  const attrRegex = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(rawAttrs)) !== null) {
    const rawName = match[1];
    const lowerName = rawName.toLowerCase();
    const rawValue = match[2] !== undefined ? match[2] : match[3] || '';

    if (lowerName.startsWith('on')) {
      warnings.push(`Removed inline event handler "${rawName}".`);
      continue;
    }

    if (lowerName === 'href' || lowerName === 'xlink:href') {
      if (/^#[a-zA-Z0-9_-]+$/.test(rawValue.trim())) {
        cleaned.push(`${rawName}="${rawValue.trim()}"`);
      } else {
        warnings.push(`Blocked external or unsafe "${rawName}" reference.`);
      }
      continue;
    }

    if (!SAFE_ATTR_NAMES.has(lowerName)) {
      continue;
    }

    if (/(?:javascript|vbscript|data)\s*:/i.test(rawValue)) {
      warnings.push(`Blocked unsafe URI scheme inside "${rawName}".`);
      continue;
    }

    if (/url\s*\(/i.test(rawValue) && !/^url\s*\(\s*#[a-zA-Z0-9_-]+\s*\)$/i.test(rawValue.trim())) {
      warnings.push(`Blocked external url() reference inside "${rawName}".`);
      continue;
    }

    if (lowerName === 'style') {
      const safeStyle = sanitizeInlineStyle(rawValue, warnings);
      if (safeStyle) cleaned.push(`style="${safeStyle.replace(/"/g, '&quot;')}"`);
      continue;
    }

    const normalizedVal = lowerName === 'viewbox' ? sanitizeViewBox(rawValue) : rawValue;
    cleaned.push(`${rawName}="${normalizedVal.replace(/"/g, '&quot;')}"`);
  }

  return cleaned.length > 0 ? ` ${cleaned.join(' ')}` : '';
}

/**
 * Pure Node + Browser deterministic allowlist SVG sanitizer.
 * Strips XSS vectors (<script>, on* handlers, <foreignObject>, <image>, external URLs)
 * and normalizes the root <svg> viewBox & XML namespace for safe Canvas rasterization.
 */
export function sanitizeSvgBlueprintMarkup(
  rawMarkup: string,
  preferredViewBox?: string
): { svg: string; warnings: string[]; isValid: boolean } {
  const warnings: string[] = [];
  if (!rawMarkup || typeof rawMarkup !== 'string') {
    return { svg: '', warnings: ['SVG blueprint markup is empty.'], isValid: false };
  }

  let input = rawMarkup.trim().slice(0, MAX_SVG_BLUEPRINT_LENGTH);
  if (!input) {
    return { svg: '', warnings: ['SVG blueprint markup is empty.'], isValid: false };
  }

  // Strip XML declarations, DOCTYPE, CDATA, HTML comments
  input = input
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, '');

  // Strip forbidden container & self-closing blocks entirely
  for (const tag of FORBIDDEN_BLOCK_TAGS) {
    const pairedRx = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
    const selfClosingRx = new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi');
    if (pairedRx.test(input)) {
      warnings.push(`Removed disallowed <${tag}> element.`);
      input = input.replace(pairedRx, '');
    }
    if (selfClosingRx.test(input)) {
      warnings.push(`Removed disallowed <${tag}> element.`);
      input = input.replace(selfClosingRx, '');
    }
  }

  // Filter every remaining tag against ALLOWED_SVG_TAGS and sanitize attributes
  let hasRootSvg = false;
  let detectedViewBox: string | undefined;

  const filtered = input.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([^>]*?)(\/?)>/g, (_full, closingSlash, tagName, rawAttrs, selfSlash) => {
    const lowerTag = String(tagName).toLowerCase();
    if (!ALLOWED_SVG_TAGS.has(lowerTag)) {
      warnings.push(`Removed unsupported <${tagName}> element.`);
      return '';
    }
    if (closingSlash === '/') {
      return `</${tagName}>`;
    }
    if (lowerTag === 'svg') {
      hasRootSvg = true;
      const vbMatch = String(rawAttrs).match(/\bviewBox\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      if (vbMatch) {
        detectedViewBox = sanitizeViewBox(vbMatch[1] || vbMatch[2]);
      }
      const safeAttrs = sanitizeAttributeList(String(rawAttrs), warnings);
      return `<svg${safeAttrs}${selfSlash}>`;
    }
    const safeAttrs = sanitizeAttributeList(String(rawAttrs), warnings);
    return `<${tagName}${safeAttrs}${selfSlash}>`;
  });

  const finalViewBox = sanitizeViewBox(preferredViewBox || detectedViewBox || DEFAULT_SVG_VIEWBOX);
  let normalized = filtered.trim();

  if (!normalized) {
    return { svg: '', warnings: [...warnings, 'No valid SVG vector primitives remained after sanitization.'], isValid: false };
  }

  if (!hasRootSvg) {
    normalized = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${finalViewBox}" width="846" height="490" preserveAspectRatio="xMidYMid meet">${normalized}</svg>`;
  } else {
    normalized = normalized.replace(/<svg\b([^>]*)>/i, (_m, attrs) => {
      let nextAttrs = String(attrs || '');
      if (!/\bxmlns\s*=/i.test(nextAttrs)) {
        nextAttrs += ' xmlns="http://www.w3.org/2000/svg"';
      }
      if (!/\bviewBox\s*=/i.test(nextAttrs)) {
        nextAttrs += ` viewBox="${finalViewBox}"`;
      }
      if (!/\bwidth\s*=/i.test(nextAttrs)) {
        nextAttrs += ' width="846"';
      }
      if (!/\bheight\s*=/i.test(nextAttrs)) {
        nextAttrs += ' height="490"';
      }
      if (!/\bpreserveAspectRatio\s*=/i.test(nextAttrs)) {
        nextAttrs += ' preserveAspectRatio="xMidYMid meet"';
      }
      return `<svg${nextAttrs}>`;
    });
  }

  // Deduplicate warnings for clean UI display
  const uniqueWarnings = Array.from(new Set(warnings));
  const hasDrawablePrimitive = /<(?:path|rect|circle|ellipse|line|polyline|polygon|text)\b/i.test(normalized);

  return {
    svg: normalized,
    warnings: uniqueWarnings,
    isValid: hasDrawablePrimitive,
  };
}

/**
 * Replaces MARROK theme tokens (e.g. {{accent}}, {{surface}}, {{textWhite}}) inside
 * sanitized SVG markup with the active ThemePalette colors and encodes a UTF-8 data URI.
 */
export function buildThemedSvgBlueprint(
  rawMarkup: string,
  theme: ThemePalette,
  preferredViewBox?: string
): SanitizedSvgBlueprintResult {
  const sanitized = sanitizeSvgBlueprintMarkup(rawMarkup, preferredViewBox);
  if (!sanitized.svg) {
    return {
      svg: '',
      dataUrl: '',
      warnings: sanitized.warnings,
      isValid: false,
    };
  }

  const tokenMap: Record<string, string> = {
    '{{accent}}': theme.accent || '#00F0FF',
    '{{alert}}': theme.alert || '#F43F5E',
    '{{surface}}': theme.surface || '#111923',
    '{{surfaceBorder}}': theme.surfaceBorder || '#1E2D3D',
    '{{textWhite}}': theme.textWhite || '#F8FAFC',
    '{{textMuted}}': theme.textMuted || '#94A3B8',
    '{{baseBg}}': theme.baseBg || '#080E14',
    '{{gridLine}}': theme.gridLine || 'rgba(148,163,184,0.12)',
    '{{textEnBody}}': theme.textEnBody || '#CBD5E1',
    '{{microLabel}}': theme.microLabel || '#94A3B8',
  };

  let themed = sanitized.svg;
  for (const [token, color] of Object.entries(tokenMap)) {
    themed = themed.split(token).join(color);
  }

  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(themed)}`;
  return {
    svg: themed,
    dataUrl,
    warnings: sanitized.warnings,
    isValid: sanitized.isValid,
  };
}
