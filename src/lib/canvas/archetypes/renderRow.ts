import { SlideData, ThemePalette, VisualSystemOptions } from '../../../types.ts';
import { extractSlideText } from '../../text/slideText.ts';
import {
  drawMultiNodeTopologyFlow,
  drawBlastRadiusIsolationGrid,
  drawLayeredArchitectureStack,
  drawKeyTakeawayCard,
  drawVectorScatterDiagram,
  drawHnswHierarchicalGraph,
  drawIvfClustersDiagram,
  drawHotColdDualStoreDiagram,
  drawFeatureCardsDiagram,
} from './renderDiagram.ts';

/**
 * Archetype 2: Row / Dynamic Technical Schematic
 * Dispatches to bespoke labeled diagrams:
 * - 'scatter' / 'vectors': High-dimensional vector space & cosine nearest neighbors
 * - 'graph' / 'hnsw': Multi-layer skip-graph traversal path
 * - 'clusters' / 'ivf': Space partitioning & target cluster search
 * - 'split' / 'hotcold': Hot RAM buffer vs Cold immutable index
 * - 'features' / 'cards': 3 prominent conceptual feature cards
 * - 'stack': 3-tier architectural layers
 * - 'isolation': Component fault boundary & blast radius containment
 * - 'takeaway': Architectural decision & trade-off card
 * - 'topology': Protocol dataflow pipeline
 */
export async function drawRowSlide(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  options: VisualSystemOptions,
  _slideIndex: number = 1
): Promise<number> {
  const slideText = extractSlideText(slide, { lower: true });
  const variant = (slide.diagramVariant || '').toLowerCase();

  // 1. Explicit diagramVariant Routing
  if (variant === 'scatter' || variant === 'vectors') {
    return drawVectorScatterDiagram(ctx, slide, theme, options, 240);
  }
  if (variant === 'graph' || variant === 'hnsw' || variant === 'hierarchy') {
    return drawHnswHierarchicalGraph(ctx, slide, theme, options, 240);
  }
  if (variant === 'clusters' || variant === 'ivf' || variant === 'partition') {
    return drawIvfClustersDiagram(ctx, slide, theme, options, 240);
  }
  if (variant === 'split' || variant === 'hotcold' || variant === 'buffer') {
    return drawHotColdDualStoreDiagram(ctx, slide, theme, options, 240);
  }
  if (variant === 'features' || variant === 'cards') {
    return drawFeatureCardsDiagram(ctx, slide, theme, options, 240);
  }
  if (variant === 'isolation') {
    // Check if slide is actually about HNSW or IVF (prevents AI wrongly tagging HNSW as isolation)
    if (/hnsw|skip[- ]?list|graph/i.test(slideText)) {
      return drawHnswHierarchicalGraph(ctx, slide, theme, options, 240);
    }
    if (/ivf|cluster|k-means|centroid/i.test(slideText)) {
      return drawIvfClustersDiagram(ctx, slide, theme, options, 240);
    }
    return drawBlastRadiusIsolationGrid(ctx, slide, theme, options, 240);
  }
  if (variant === 'stack') {
    return drawLayeredArchitectureStack(ctx, slide, theme, options, 240);
  }
  if (variant === 'takeaway') {
    return drawKeyTakeawayCard(ctx, slide, theme, options, 240);
  }
  if (variant === 'topology') {
    // Check if slide is actually about semantic search or writes
    if (/semantic search|embedding|high-dimensional|cosine/i.test(slideText)) {
      return drawVectorScatterDiagram(ctx, slide, theme, options, 240);
    }
    if (/write|hot|cold|buffer/i.test(slideText)) {
      return drawHotColdDualStoreDiagram(ctx, slide, theme, options, 240);
    }
    return drawMultiNodeTopologyFlow(ctx, slide, theme, options, 240);
  }

  // 2. Semantic Topic Detection (When variant is not specified or was defaulted)
  if (/\b(?:hot\s*\/?\s*cold|write buffer|writes are|writes and|async flusher|lsm|compaction|consistency)\b/i.test(slideText)) {
    return drawHotColdDualStoreDiagram(ctx, slide, theme, options, 240);
  }

  if (/\b(?:hnsw|skip[- ]?list|graph navigation|layered graph|graph structure)\b/i.test(slideText)) {
    return drawHnswHierarchicalGraph(ctx, slide, theme, options, 240);
  }

  if (/\b(?:ivf|k-means|centroid|clustering|cluster|partitions?|shards?)\b/i.test(slideText)) {
    return drawIvfClustersDiagram(ctx, slide, theme, options, 240);
  }

  if (/\b(?:vector|embedding|embeddings|cosine|similarity|high-dim|semantic search|ann search)\b/i.test(slideText)) {
    return drawVectorScatterDiagram(ctx, slide, theme, options, 240);
  }

  if (/\b(?:takeaway|trade-?off|the catch|drawback|limitations?|caveats?|cost of)\b/i.test(slideText)) {
    return drawKeyTakeawayCard(ctx, slide, theme, options, 240);
  }

  if (/\b(?:blast radius|microsegment|isolation|perimeter|quarantine|sandbox|spiffe)\b/i.test(slideText)) {
    return drawBlastRadiusIsolationGrid(ctx, slide, theme, options, 240);
  }

  if (/\b(?:stack|layers?|tiers?|pipeline|virtual mount|object store|tree)\b/i.test(slideText)) {
    return drawLayeredArchitectureStack(ctx, slide, theme, options, 240);
  }

  if (slide.icons && slide.icons.length >= 3) {
    return drawFeatureCardsDiagram(ctx, slide, theme, options, 240);
  }

  return drawMultiNodeTopologyFlow(ctx, slide, theme, options, 240);
}
