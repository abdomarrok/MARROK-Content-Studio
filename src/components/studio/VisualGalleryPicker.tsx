import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  X,
  Sparkles,
  BarChart3,
  Gauge,
  Grid2x2,
  Table2,
  Layers,
  GitCommitHorizontal,
  Clock,
  Cpu,
  ArrowLeftRight,
  LayoutTemplate,
  Columns,
  Code,
  Hash,
  Quote,
  ArrowRight,
  Image as ImageIcon,
  Code2,
  Check,
} from 'lucide-react';
import type {
  DiagramVariant,
  SlideData,
  SlideType,
  ThemePalette,
  VisualSpecKind,
} from '../../types.ts';
import { rankSlideLayoutsForDeck } from '../../lib/synthesis/autoLayoutEngine.ts';

export type VisualGalleryCategory =
  | 'charts'
  | 'diagrams'
  | 'editorial'
  | 'media';

export interface VisualCatalogEntry {
  id: string;
  category: VisualGalleryCategory;
  label: string;
  shortDesc: string;
  slideType: SlideType;
  diagramVariant?: DiagramVariant;
  visualKind?: VisualSpecKind;
  keywords: string[];
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}

export const VISUAL_GALLERY_CATEGORIES: {
  id: VisualGalleryCategory;
  label: string;
  description: string;
}[] = [
  {
    id: 'charts',
    label: 'Charts & Data',
    description: 'Benchmarks, metrics, matrices, and comparison tables',
  },
  {
    id: 'diagrams',
    label: 'Diagrams & Flows',
    description: 'System schematics, lifecycles, timelines, and migrations',
  },
  {
    id: 'editorial',
    label: 'Editorial & Code',
    description: 'Posters, comparisons, code diffs, callouts, and closers',
  },
  {
    id: 'media',
    label: 'Media & Custom',
    description: 'Photos, memes, videos, and custom SVG blueprints',
  },
];

export const VISUAL_CATALOG: VisualCatalogEntry[] = [
  // ── Charts & Data ────────────────────────────────────────────────────────
  {
    id: 'visual:bar-chart',
    category: 'charts',
    label: 'Bar & Latency Chart',
    shortDesc: 'Horizontal or vertical benchmarks with delta callouts',
    slideType: 'visual',
    visualKind: 'bar-chart',
    keywords: ['bar', 'chart', 'latency', 'p99', 'benchmark', 'throughput', 'graph', 'smart visual'],
    icon: BarChart3,
  },
  {
    id: 'metric',
    category: 'charts',
    label: 'Hero Metric',
    shortDesc: 'Single headline number with before/after impact',
    slideType: 'metric',
    keywords: ['metric', 'kpi', 'stat', 'percent', 'number', 'delta'],
    icon: Gauge,
  },
  {
    id: 'visual:matrix',
    category: 'charts',
    label: '2×2 Trade-off Matrix',
    shortDesc: 'Four-quadrant architecture or strategy positioning',
    slideType: 'visual',
    visualKind: 'matrix',
    keywords: ['matrix', 'quadrant', 'tradeoff', '2x2', 'axis', 'smart visual'],
    icon: Grid2x2,
  },
  {
    id: 'visual:table',
    category: 'charts',
    label: 'Comparison Table',
    shortDesc: 'Multi-column spec sheet with highlighted winner',
    slideType: 'visual',
    visualKind: 'table',
    keywords: ['table', 'matrix', 'columns', 'specs', 'pricing', 'compare', 'smart visual'],
    icon: Table2,
  },

  // ── Diagrams & Flows ─────────────────────────────────────────────────────
  {
    id: 'row:topology',
    category: 'diagrams',
    label: 'Topology Flow',
    shortDesc: 'Three-node connected request or data pipeline',
    slideType: 'row',
    diagramVariant: 'topology',
    keywords: ['mechanism', 'row', 'pipeline', 'flow', 'topology', 'architecture'],
    icon: Layers,
  },
  {
    id: 'row:stack',
    category: 'diagrams',
    label: 'Layered Stack',
    shortDesc: 'Vertical architectural layers from ingress to storage',
    slideType: 'row',
    diagramVariant: 'stack',
    keywords: ['stack', 'layers', 'tiers', 'mechanism', 'row'],
    icon: Layers,
  },
  {
    id: 'row:isolation',
    category: 'diagrams',
    label: 'Isolation Grid',
    shortDesc: 'Sandboxed security zones and policy boundaries',
    slideType: 'row',
    diagramVariant: 'isolation',
    keywords: ['isolation', 'sandbox', 'security', 'zero trust', 'mechanism', 'row'],
    icon: Layers,
  },
  {
    id: 'visual:sequence',
    category: 'diagrams',
    label: 'Sequence Diagram',
    shortDesc: 'Multi-step actor handshakes and protocol messages',
    slideType: 'visual',
    visualKind: 'sequence',
    keywords: ['sequence', 'protocol', 'handshake', 'lifecycle', 'rpc', 'smart visual'],
    icon: GitCommitHorizontal,
  },
  {
    id: 'visual:timeline',
    category: 'diagrams',
    label: 'Incident Timeline',
    shortDesc: 'Timestamped outage postmortem or release milestones',
    slideType: 'visual',
    visualKind: 'timeline',
    keywords: ['timeline', 'outage', 'postmortem', 'incident', 'utc', 'chronology', 'smart visual'],
    icon: Clock,
  },
  {
    id: 'hub',
    category: 'diagrams',
    label: 'Hub Architecture',
    shortDesc: 'Central system core surrounded by satellite services',
    slideType: 'hub',
    keywords: ['hub', 'spoke', 'orbit', 'ecosystem', 'satellites'],
    icon: Cpu,
  },
  {
    id: 'subjectPair',
    category: 'diagrams',
    label: 'Subject Pair',
    shortDesc: 'Official tool-to-tool migration (Before → After)',
    slideType: 'subjectPair',
    keywords: ['migration', 'subject pair', 'replace', 'before after', 'logos'],
    icon: ArrowLeftRight,
  },
  {
    id: 'row:split',
    category: 'diagrams',
    label: 'Hot / Cold Split',
    shortDesc: 'Dual-tier memory, cache, or storage separation',
    slideType: 'row',
    diagramVariant: 'split',
    keywords: ['split', 'hot', 'cold', 'cache', 'tier', 'mechanism', 'row'],
    icon: Layers,
  },
  {
    id: 'row:features',
    category: 'diagrams',
    label: '3 Feature Cards',
    shortDesc: 'Three parallel capabilities or architectural pillars',
    slideType: 'row',
    diagramVariant: 'features',
    keywords: ['features', 'cards', 'pillars', 'benefits', 'mechanism', 'row'],
    icon: Layers,
  },
  {
    id: 'row:takeaway',
    category: 'diagrams',
    label: 'Key Takeaway Flow',
    shortDesc: 'Synthesized engineering verdict schematic',
    slideType: 'row',
    diagramVariant: 'takeaway',
    keywords: ['takeaway', 'verdict', 'summary', 'mechanism', 'row'],
    icon: Layers,
  },
  {
    id: 'row:graph',
    category: 'diagrams',
    label: 'HNSW Skip-Graph',
    shortDesc: 'Hierarchical graph traversal and vector indexing',
    slideType: 'row',
    diagramVariant: 'graph',
    keywords: ['graph', 'hnsw', 'skip', 'vector', 'index', 'mechanism', 'row'],
    icon: Layers,
  },
  {
    id: 'row:clusters',
    category: 'diagrams',
    label: 'IVF Clusters',
    shortDesc: 'Partitioned vector space and shard clusters',
    slideType: 'row',
    diagramVariant: 'clusters',
    keywords: ['clusters', 'ivf', 'shards', 'partitions', 'mechanism', 'row'],
    icon: Layers,
  },
  {
    id: 'row:scatter',
    category: 'diagrams',
    label: 'Vector Scatter',
    shortDesc: 'Embedding distribution across 2D coordinate space',
    slideType: 'row',
    diagramVariant: 'scatter',
    keywords: ['scatter', 'vectors', 'embeddings', 'plot', 'mechanism', 'row'],
    icon: Layers,
  },

  // ── Editorial & Code ─────────────────────────────────────────────────────
  {
    id: 'poster',
    category: 'editorial',
    label: 'Poster',
    shortDesc: 'Dense single-slide brief with schematic & 3 takeaways',
    slideType: 'poster',
    keywords: ['poster', 'single', 'cheatsheet', 'takeaways', 'overview'],
    icon: LayoutTemplate,
  },
  {
    id: 'compare',
    category: 'editorial',
    label: 'Compare',
    shortDesc: 'Two-column Old Way vs New Way contrast card',
    slideType: 'compare',
    keywords: ['compare', 'vs', 'versus', 'diff', 'contrast', 'before', 'after'],
    icon: Columns,
  },
  {
    id: 'code',
    category: 'editorial',
    label: 'Code Diff',
    shortDesc: 'Syntax-highlighted terminal or config diff window',
    slideType: 'code',
    keywords: ['code', 'diff', 'snippet', 'sql', 'terminal', 'config'],
    icon: Code,
  },
  {
    id: 'number',
    category: 'editorial',
    label: 'Number',
    shortDesc: 'Bold accent numeral for numbered lists and steps',
    slideType: 'number',
    keywords: ['number', 'step', 'principle', 'rule', 'list'],
    icon: Hash,
  },
  {
    id: 'visual:callout',
    category: 'editorial',
    label: 'Editorial Callout',
    shortDesc: 'Featured quote, key stat, and verified source card',
    slideType: 'visual',
    visualKind: 'callout',
    keywords: ['callout', 'quote', 'source', 'citation', 'verdict', 'smart visual'],
    icon: Quote,
  },
  {
    id: 'cta',
    category: 'editorial',
    label: 'CTA',
    shortDesc: 'Closing discussion prompt and MARROK attribution',
    slideType: 'cta',
    keywords: ['cta', 'outro', 'closer', 'follow', 'question'],
    icon: ArrowRight,
  },

  // ── Media & Custom ───────────────────────────────────────────────────────
  {
    id: 'image',
    category: 'media',
    label: 'Meme / Image',
    shortDesc: 'Uploaded photo, meme card, video clip, or AI visual',
    slideType: 'image',
    keywords: ['image', 'photo', 'meme', 'video', 'ai', 'media', 'upload'],
    icon: ImageIcon,
  },
  {
    id: 'visual:svg',
    category: 'media',
    label: 'Custom SVG Blueprint',
    shortDesc: 'Freeform sanitized vector diagram with theme tokens',
    slideType: 'visual',
    visualKind: 'svg',
    keywords: ['svg', 'custom', 'blueprint', 'freeform', 'vector', 'smart visual'],
    icon: Code2,
  },
];

export function getActiveVisualCatalogEntry(
  slide: SlideData,
  activeDiagramVariant: DiagramVariant
): VisualCatalogEntry {
  if (slide.type === 'visual') {
    const kind = slide.visualSpec?.kind || 'bar-chart';
    const match = VISUAL_CATALOG.find(
      (item) => item.slideType === 'visual' && item.visualKind === kind
    );
    if (match) return match;
  }
  if (slide.type === 'row') {
    const match = VISUAL_CATALOG.find(
      (item) => item.slideType === 'row' && item.diagramVariant === activeDiagramVariant
    );
    if (match) return match;
  }
  const direct = VISUAL_CATALOG.find((item) => item.slideType === slide.type);
  return direct || VISUAL_CATALOG[4];
}

export function getCategoryLabel(category: VisualGalleryCategory): string {
  return VISUAL_GALLERY_CATEGORIES.find((c) => c.id === category)?.label || 'Layout';
}

export function renderVisualThumbnail(
  entry: VisualCatalogEntry,
  theme: ThemePalette,
  isActive: boolean
): React.ReactNode {
  const stroke = isActive ? theme.accent : '#94a3b8';
  const fill = isActive ? `${theme.accent}28` : 'rgba(255,255,255,0.06)';

  if (entry.slideType === 'visual') {
    switch (entry.visualKind) {
      case 'bar-chart':
        return (
          <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <rect x="4" y="13" width="6" height="7" rx="1" fill={fill} stroke={stroke} strokeWidth="1" />
            <rect x="13" y="8" width="6" height="12" rx="1" fill={fill} stroke={stroke} strokeWidth="1.1" />
            <rect x="22" y="4" width="6" height="16" rx="1" fill={stroke} opacity="0.9" />
          </svg>
        );
      case 'sequence':
        return (
          <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <line x1="8" y1="5" x2="8" y2="20" stroke={stroke} strokeWidth="1" strokeDasharray="1.5 1.5" opacity="0.7" />
            <line x1="18" y1="5" x2="18" y2="20" stroke={stroke} strokeWidth="1" strokeDasharray="1.5 1.5" opacity="0.7" />
            <line x1="28" y1="5" x2="28" y2="20" stroke={stroke} strokeWidth="1" strokeDasharray="1.5 1.5" opacity="0.7" />
            <line x1="8" y1="9" x2="18" y2="9" stroke={stroke} strokeWidth="1.3" />
            <line x1="18" y1="13" x2="28" y2="13" stroke={stroke} strokeWidth="1.3" />
            <line x1="28" y1="17" x2="8" y2="17" stroke={stroke} strokeWidth="1.1" opacity="0.75" />
          </svg>
        );
      case 'timeline':
        return (
          <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <line x1="9" y1="4" x2="9" y2="20" stroke={stroke} strokeWidth="1.2" opacity="0.6" />
            <circle cx="9" cy="7" r="1.8" fill={stroke} />
            <circle cx="9" cy="12" r="1.8" fill="#fb7185" />
            <circle cx="9" cy="17" r="1.8" fill="#34d399" />
            <line x1="14" y1="7" x2="30" y2="7" stroke={stroke} strokeWidth="1.2" />
            <line x1="14" y1="12" x2="26" y2="12" stroke="#fb7185" strokeWidth="1.2" />
            <line x1="14" y1="17" x2="28" y2="17" stroke="#34d399" strokeWidth="1.2" />
          </svg>
        );
      case 'matrix':
        return (
          <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <rect x="4" y="4" width="13" height="7" rx="1" fill={fill} stroke={stroke} strokeWidth="0.9" />
            <rect x="19" y="4" width="13" height="7" rx="1" fill={stroke} opacity="0.35" stroke={stroke} strokeWidth="1.1" />
            <rect x="4" y="13" width="13" height="7" rx="1" fill={fill} stroke={stroke} strokeWidth="0.9" />
            <rect x="19" y="13" width="13" height="7" rx="1" fill={fill} stroke={stroke} strokeWidth="0.9" />
          </svg>
        );
      case 'table':
        return (
          <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <rect x="4" y="4" width="28" height="16" rx="1.5" fill="none" stroke={stroke} strokeWidth="1" />
            <line x1="4" y1="9" x2="32" y2="9" stroke={stroke} strokeWidth="1" />
            <line x1="4" y1="14.5" x2="32" y2="14.5" stroke={stroke} strokeWidth="0.8" opacity="0.5" />
            <line x1="14" y1="4" x2="14" y2="20" stroke={stroke} strokeWidth="0.8" opacity="0.5" />
            <line x1="23" y1="4" x2="23" y2="20" stroke={stroke} strokeWidth="0.8" opacity="0.5" />
          </svg>
        );
      case 'callout':
        return (
          <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <rect x="4" y="4" width="2.2" height="16" rx="1" fill={stroke} />
            <line x1="10" y1="8.5" x2="30" y2="8.5" stroke="#e2e8f0" strokeWidth="1.4" />
            <line x1="10" y1="12.5" x2="25" y2="12.5" stroke={stroke} strokeWidth="1.2" opacity="0.8" />
            <line x1="10" y1="17" x2="19" y2="17" stroke={stroke} strokeWidth="1" opacity="0.5" />
          </svg>
        );
      case 'svg':
      default:
        return (
          <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <path d="M12 8 L7 12 L12 16" fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M24 8 L29 12 L24 16" fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="20" y1="6.5" x2="16" y2="17.5" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        );
    }
  }

  switch (entry.slideType) {
    case 'hub':
      return (
        <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
          <circle cx="18" cy="12" r="7.5" fill="none" stroke={stroke} strokeWidth="0.9" strokeDasharray="1.5 1.5" opacity="0.65" />
          <rect x="14.5" y="8.5" width="7" height="7" rx="2" fill={fill} stroke={stroke} strokeWidth="1.2" />
          <circle cx="18" cy="3.5" r="1.5" fill={stroke} />
          <circle cx="26" cy="9" r="1.5" fill={stroke} />
          <circle cx="23.5" cy="18.5" r="1.5" fill={stroke} />
          <circle cx="12.5" cy="18.5" r="1.5" fill={stroke} />
          <circle cx="10" cy="9" r="1.5" fill={stroke} />
        </svg>
      );
    case 'compare':
      return (
        <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
          <rect x="3" y="4" width="13.5" height="16" rx="2" fill="rgba(244,63,94,0.18)" stroke="#fb7185" strokeWidth="1.1" />
          <rect x="19.5" y="4" width="13.5" height="16" rx="2" fill={fill} stroke={stroke} strokeWidth="1.1" />
        </svg>
      );
    case 'subjectPair':
      return (
        <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
          <rect x="3.5" y="6" width="10" height="12" rx="2" fill={fill} stroke={stroke} strokeWidth="1.1" />
          <path d="M15.5 12 L20.5 12 M18.5 9.8 L20.8 12 L18.5 14.2" fill="none" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="22.5" y="6" width="10" height="12" rx="2" fill={fill} stroke={stroke} strokeWidth="1.1" />
        </svg>
      );
    case 'code':
      return (
        <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
          <rect x="3" y="3.5" width="30" height="17" rx="2" fill="rgba(0,0,0,0.65)" stroke={stroke} strokeWidth="1.1" />
          <line x1="6" y1="8.5" x2="19" y2="8.5" stroke="#fb7185" strokeWidth="1.4" />
          <line x1="6" y1="12" x2="27" y2="12" stroke={stroke} strokeWidth="1.4" />
          <line x1="6" y1="15.5" x2="23" y2="15.5" stroke="#34d399" strokeWidth="1.4" />
        </svg>
      );
    case 'metric':
      return (
        <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
          <rect x="3.5" y="4" width="29" height="16" rx="2" fill={fill} stroke={stroke} strokeWidth="1.1" />
          <text x="18" y="14.5" textAnchor="middle" fill={stroke} fontSize="7.5" fontWeight="bold" fontFamily="monospace">
            99%
          </text>
        </svg>
      );
    case 'number':
      return (
        <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
          <rect x="4" y="4.5" width="12" height="15" rx="2" fill={fill} stroke={stroke} strokeWidth="1.1" />
          <text x="10" y="14.5" textAnchor="middle" fill={stroke} fontSize="7.5" fontWeight="bold" fontFamily="monospace">
            01
          </text>
          <line x1="19" y1="9.5" x2="31" y2="9.5" stroke={stroke} strokeWidth="1.3" />
          <line x1="19" y1="14" x2="28" y2="14" stroke={stroke} strokeWidth="1.1" opacity="0.6" />
        </svg>
      );
    case 'image':
      return (
        <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
          <rect x="4" y="3.5" width="28" height="17" rx="2" fill="#f8fafc" stroke={stroke} strokeWidth="1.1" />
          <circle cx="11" cy="9" r="1.8" fill="#0f172a" />
          <path d="M6.5 18 L13.5 11.5 L19 16 L24.5 10 L30 18 Z" fill={stroke} opacity="0.85" />
        </svg>
      );
    case 'poster':
      return (
        <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
          <rect x="4" y="3.5" width="28" height="8" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.1" />
          <line x1="5" y1="14.5" x2="31" y2="14.5" stroke={stroke} strokeWidth="1.2" />
          <line x1="5" y1="17.5" x2="26" y2="17.5" stroke={stroke} strokeWidth="1.1" opacity="0.7" />
          <line x1="5" y1="20.5" x2="29" y2="20.5" stroke={stroke} strokeWidth="1.1" opacity="0.5" />
        </svg>
      );
    case 'cta':
      return (
        <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
          <line x1="7" y1="8" x2="29" y2="8" stroke="#f8fafc" strokeWidth="1.4" />
          <rect x="8" y="12.5" width="20" height="6.5" rx="3.2" fill={stroke} />
        </svg>
      );
    case 'row':
    default:
      if (entry.diagramVariant === 'stack') {
        return (
          <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <rect x="5" y="4" width="26" height="4.2" rx="1" fill={fill} stroke={stroke} strokeWidth="1" />
            <rect x="5" y="9.9" width="26" height="4.2" rx="1" fill={fill} stroke={stroke} strokeWidth="1" />
            <rect x="5" y="15.8" width="26" height="4.2" rx="1" fill={fill} stroke={stroke} strokeWidth="1" />
          </svg>
        );
      }
      if (entry.diagramVariant === 'split') {
        return (
          <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
            <rect x="4" y="4" width="13" height="16" rx="1.5" fill={stroke} opacity="0.28" stroke={stroke} strokeWidth="1.1" />
            <rect x="19" y="4" width="13" height="16" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1" strokeDasharray="2 1.5" />
          </svg>
        );
      }
      return (
        <svg viewBox="0 0 36 24" className="w-9 h-6 rounded bg-black/50 border border-white/10 shrink-0" aria-hidden="true">
          <rect x="3" y="7" width="7.5" height="10" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.1" />
          <line x1="10.5" y1="12" x2="14" y2="12" stroke={stroke} strokeWidth="1.1" />
          <rect x="14" y="7" width="8" height="10" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.1" />
          <line x1="22" y1="12" x2="25.5" y2="12" stroke={stroke} strokeWidth="1.1" />
          <rect x="25.5" y="7" width="7.5" height="10" rx="1.5" fill={fill} stroke={stroke} strokeWidth="1.1" />
        </svg>
      );
  }
}

export interface VisualGalleryPickerProps {
  isOpen: boolean;
  onClose: () => void;
  currentSlide: SlideData;
  currentSlideIndex: number;
  slides?: SlideData[];
  activeEntryId: string;
  theme: ThemePalette;
  onSelectEntry: (entry: VisualCatalogEntry) => void;
}

export const VisualGalleryPicker: React.FC<VisualGalleryPickerProps> = ({
  isOpen,
  onClose,
  currentSlide,
  currentSlideIndex,
  slides,
  activeEntryId,
  theme,
  onSelectEntry,
}) => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<VisualGalleryCategory | 'all'>('all');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveCategory('all');
    const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const recommendedEntries = useMemo(() => {
    const ranked = rankSlideLayoutsForDeck(
      currentSlide,
      slides && slides.length > 0 ? slides : [currentSlide],
      currentSlideIndex
    );
    const picks: VisualCatalogEntry[] = [];
    for (const candidate of ranked) {
      if (candidate.score < 0 && picks.length > 0) break;
      const found = VISUAL_CATALOG.find((e) => e.id === candidate.id);
      if (found && !picks.some((p) => p.id === found.id)) {
        picks.push(found);
      }
      if (picks.length >= 2) break;
    }
    return picks;
  }, [currentSlide, currentSlideIndex, slides]);

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VISUAL_CATALOG.filter((entry) => {
      if (activeCategory !== 'all' && entry.category !== activeCategory) return false;
      if (!q) return true;
      return (
        entry.label.toLowerCase().includes(q) ||
        entry.shortDesc.toLowerCase().includes(q) ||
        entry.keywords.some((kw) => kw.toLowerCase().includes(q))
      );
    });
  }, [query, activeCategory]);

  if (!isOpen) return null;

  const groupedSections = VISUAL_GALLERY_CATEGORIES.map((cat) => ({
    ...cat,
    items: filteredCatalog.filter((item) => item.category === cat.id),
  })).filter((sec) => sec.items.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-xs animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Choose slide visual layout"
      data-testid="visual-gallery-modal"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[84dvh] flex flex-col rounded-2xl bg-[#0c1218] border border-white/15 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.08]">
          <div>
            <h2 className="text-sm font-bold text-white font-jakarta">
              Choose Slide Visual
            </h2>
            <p className="text-[11px] text-slate-400">
              Select any chart, schematic, editorial card, or custom blueprint.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close visual gallery"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search + Category Filter Row */}
        <div className="px-4 py-2.5 border-b border-white/[0.06] space-y-2 bg-black/25">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              data-testid="visual-gallery-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search layouts (e.g. bar chart, timeline, isolation, code, svg)..."
              className="w-full bg-black/50 border border-white/10 focus:border-white/25 rounded-xl pl-8 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 text-slate-500 hover:text-white cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeCategory === 'all'
                  ? 'bg-white/15 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              All ({VISUAL_CATALOG.length})
            </button>
            {VISUAL_GALLERY_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                data-testid={`visual-gallery-cat-${cat.id}`}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeCategory === cat.id
                    ? 'bg-white/15 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Gallery Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Recommended Section (when not filtering) */}
          {!query && activeCategory === 'all' && recommendedEntries.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                <Sparkles className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                <span>Recommended for this slide</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {recommendedEntries.map((entry) => {
                  const isActive = entry.id === activeEntryId;
                  return (
                    <button
                      key={`rec-${entry.id}`}
                      type="button"
                      onClick={() => {
                        onSelectEntry(entry);
                        onClose();
                      }}
                      className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isActive
                          ? 'bg-white/[0.08] border-white/30'
                          : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07] hover:border-white/20'
                      }`}
                      style={
                        isActive
                          ? { borderColor: `${theme.accent}88` }
                          : undefined
                      }
                    >
                      {renderVisualThumbnail(entry, theme, isActive)}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white truncate">
                            {entry.label}
                          </span>
                          {isActive && (
                            <Check className="w-3.5 h-3.5 shrink-0" style={{ color: theme.accent }} />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-1">
                          {entry.shortDesc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Categorized Sections */}
          {groupedSections.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No layouts match &ldquo;{query}&rdquo;.
            </div>
          ) : (
            groupedSections.map((section) => (
              <div key={section.id} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-200">
                    {section.label}
                  </h3>
                  <span className="text-[11px] text-slate-500 hidden sm:inline">
                    {section.description}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {section.items.map((entry) => {
                    const isActive = entry.id === activeEntryId;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        data-testid={`visual-gallery-item-${entry.id}`}
                        onClick={() => {
                          onSelectEntry(entry);
                          onClose();
                        }}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isActive
                            ? 'bg-white/[0.09] text-white'
                            : 'bg-white/[0.02] border-white/[0.07] hover:bg-white/[0.06] hover:border-white/15'
                        }`}
                        style={
                          isActive
                            ? { borderColor: `${theme.accent}99` }
                            : undefined
                        }
                      >
                        {renderVisualThumbnail(entry, theme, isActive)}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-white truncate">
                              {entry.label}
                            </span>
                            {isActive && (
                              <Check
                                className="w-3.5 h-3.5 shrink-0"
                                style={{ color: theme.accent }}
                              />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-1">
                            {entry.shortDesc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
