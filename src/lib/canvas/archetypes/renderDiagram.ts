import { SlideData, ThemePalette, VisualSystemOptions } from '../../../types.ts';
import { fitTextInBox } from '../textLayout.ts';
import { loadIconImage, safeDrawImage } from '../imageLoader.ts';
import { drawRoundRect } from '../background.ts';
import { SAFE_CONTENT_WIDTH, SAFE_MARGIN_LEFT } from '../constants.ts';
import { resolveSmartSlideVisuals } from '../../synthesis/smartVisualDefaults.ts';

/**
 * Dynamically derives 3 semantic nodes from slide title and body when diagramNodes is missing.
 * Synchronized 1:1 with the Visual Layout Inspector via `resolveSmartSlideVisuals`.
 */
export function deriveDynamicSlideNodes(slide: SlideData): Array<{
  label: string;
  sublabel: string;
  status: string;
  icon: string;
}> {
  const smart = resolveSmartSlideVisuals(slide, 1, false);
  return smart.diagramNodes.map((n, i) => ({
    label: n.label || `Stage 0${i + 1}`,
    sublabel: n.sublabel || `Phase 0${i + 1} Pipeline`,
    status: n.status || (i === 0 ? 'INPUT' : i === 1 ? 'PROCESSING' : 'VERIFIED'),
    icon: n.icon || (i === 0 ? 'server' : i === 1 ? 'cpu' : 'database'),
  }));
}

/**
 * Visual Variant 1: Multi-Node Architecture Topology Flow
 * Replaces static icon boxes with a 3-node connected protocol dataflow sequence.
 * 100% topic-driven by slide.diagramNodes, slide.diagramEdges, and slide.diagramFooter.
 */
export async function drawMultiNodeTopologyFlow(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  _options: VisualSystemOptions,
  topY: number = 240
): Promise<number> {
  const cardX = SAFE_MARGIN_LEFT;
  const cardW = SAFE_CONTENT_WIDTH;
  const cardH = 540;
  const radius = 28;

  // 1. Ambient Glow & Deep Glassmorphic Container
  ctx.save();
  const glow = ctx.createRadialGradient(
    cardX + cardW / 2,
    topY + cardH / 2,
    40,
    cardX + cardW / 2,
    topY + cardH / 2,
    cardW / 1.8
  );
  glow.addColorStop(0, `${theme.accent}18`);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(cardX - 30, topY - 30, cardW + 60, cardH + 60);
  ctx.restore();

  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Accent Line
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();
  ctx.restore();

  const slideContextText = `${slide.enTitle || ''} ${slide.enBody || ''} ${slide.arTitle || ''} ${slide.arBody || ''} ${slide.diagramFooter || ''}`;
  const isFinancialOrMacro =
    /\$|\b(?:valuation|billion|trillion|loss|losses|deficit|capital|financing|circular|subsid|taxpayer|retiree|s&p|pension|401k|revenue|spend|spent|cash[- ]?out|stake|economy|economic|inflation|energy|gigawatt|nuclear|market|investor|debt|financial)\b|مليار|تريليون|خسائر|تمويل|تقييم|ضرائب|متقاعد|طاقة|اقتصاد|استثمار/i.test(
      slideContextText
    );

  // Top Header Tag (>= 24px font floor)
  drawRoundRect(ctx, cardX + 28, topY + 20, cardW - 56, 48, 12, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.save();
  const headerTagText = isFinancialOrMacro
    ? 'TOPOLOGY // CAPITAL & VALUE FLOW'
    : 'TOPOLOGY // MECHANISM DATAFLOW';
  const fitHeader = fitTextInBox(ctx, headerTagText, cardW - 84, 24, '"JetBrains Mono", monospace', '700', {
    minFontSize: 24,
    maxLines: 1,
  });
  ctx.font = `700 ${fitHeader.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitHeader.lines[0] || headerTagText, cardX + cardW / 2, topY + 44);
  ctx.restore();

  // 2. 3 Connected Component Node Cards
  const nodeW = 248;
  const nodeH = 356;
  const nodeY = topY + 84;
  const gap = 28;
  const nx1 = cardX + 24;
  const nx2 = nx1 + nodeW + gap;
  const nx3 = nx2 + nodeW + gap;

  const derived = deriveDynamicSlideNodes(slide);
  const roles = isFinancialOrMacro ? ['SOURCE', 'MECHANISM', 'IMPACT'] : ['STAGE 01', 'STAGE 02', 'STAGE 03'];
  const nodes = [
    { x: nx1, icon: derived[0].icon, title: derived[0].label, role: roles[0], sub: derived[0].sublabel, status: derived[0].status, statusColor: theme.accent },
    { x: nx2, icon: derived[1].icon, title: derived[1].label, role: roles[1], sub: derived[1].sublabel, status: derived[1].status, statusColor: '#10B981' },
    { x: nx3, icon: derived[2].icon, title: derived[2].label, role: roles[2], sub: derived[2].sublabel, status: derived[2].status, statusColor: theme.accent },
  ];

  for (const n of nodes) {
    drawRoundRect(ctx, n.x, nodeY, nodeW, nodeH, 18, '#0b1319', `${theme.accent}65`, 1.8);

    // Inner icon badge (56x56)
    drawRoundRect(ctx, n.x + 16, nodeY + 18, 56, 56, 14, `${theme.accent}20`, `${theme.accent}70`, 1.2);
    const nImg = await loadIconImage(n.icon, theme.accent);
    safeDrawImage(ctx, nImg, n.x + 26, nodeY + 28, 36, 36);

    // Role Micro-Badge (>= 24px font floor)
    ctx.save();
    const fitRole = fitTextInBox(ctx, n.role, nodeW - 92, 24, '"JetBrains Mono", monospace', '700', {
      minFontSize: 24,
      maxLines: 1,
    });
    ctx.font = `700 ${fitRole.fontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = theme.microLabel;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitRole.lines[0] || n.role, n.x + 84, nodeY + 46);

    // Primary Title with bold legibility (30px down to 24px minimum)
    const fitTitle = fitTextInBox(ctx, n.title, nodeW - 32, 30, '"Plus Jakarta Sans", sans-serif', '800', {
      minFontSize: 24,
      maxLines: 2,
    });
    ctx.font = `800 ${fitTitle.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'alphabetic';
    if (fitTitle.lines.length <= 1) {
      ctx.fillText(fitTitle.lines[0] || n.title, n.x + 16, nodeY + 126);
    } else {
      ctx.fillText(fitTitle.lines[0], n.x + 16, nodeY + 114);
      ctx.fillText(fitTitle.lines[1], n.x + 16, nodeY + 114 + fitTitle.lineHeight);
    }

    // High-Contrast Sublabel (24px minimum in #E2E8F0)
    const fitSub = fitTextInBox(ctx, n.sub, nodeW - 32, 24, '"Plus Jakarta Sans", sans-serif', '600', {
      minFontSize: 24,
      maxLines: 2,
    });
    ctx.font = `600 ${fitSub.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#E2E8F0';
    const subY = fitTitle.lines.length <= 1 ? nodeY + 184 : nodeY + 206;
    ctx.fillText(fitSub.lines[0] || n.sub, n.x + 16, subY);
    if (fitSub.lines[1]) {
      ctx.fillText(fitSub.lines[1], n.x + 16, subY + fitSub.lineHeight);
    }

    // Bottom Status Pill (24px minimum font floor)
    const pillW = nodeW - 32;
    const pillH = 46;
    drawRoundRect(ctx, n.x + 16, nodeY + nodeH - 60, pillW, pillH, 10, `${n.statusColor}22`, `${n.statusColor}70`, 1.2);
    const fitStatus = fitTextInBox(ctx, n.status, pillW - 16, 24, '"JetBrains Mono", monospace', '700', {
      minFontSize: 24,
      maxLines: 1,
    });
    ctx.font = `700 ${fitStatus.fontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = n.statusColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitStatus.lines[0] || n.status, n.x + 16 + pillW / 2, nodeY + nodeH - 37);
    ctx.restore();
  }

  // Connectors between Node 1 -> Node 2 and Node 2 -> Node 3 (pure vector arrows so no tiny sub-24px text is drawn)
  const arrowPairs = [
    { x1: nx1 + nodeW, x2: nx2, y: nodeY + nodeH / 2 },
    { x1: nx2 + nodeW, x2: nx3, y: nodeY + nodeH / 2 },
  ];

  for (const ap of arrowPairs) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 3;
    ctx.moveTo(ap.x1 + 4, ap.y);
    ctx.lineTo(ap.x2 - 6, ap.y);
    ctx.stroke();

    // Arrowhead pointing right
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.moveTo(ap.x2 - 2, ap.y);
    ctx.lineTo(ap.x2 - 12, ap.y - 7);
    ctx.lineTo(ap.x2 - 12, ap.y + 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Bottom Telemetry Footer Bar (>= 24px font floor)
  const barY = topY + cardH - 76;
  drawRoundRect(ctx, cardX + 24, barY, cardW - 48, 54, 12, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText =
    slide.diagramFooter ||
    `${derived[0].label.toUpperCase()} ➔ ${derived[1].label.toUpperCase()} ➔ ${derived[2].label.toUpperCase()}`;
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 80, 24, '"JetBrains Mono", monospace', '700', {
    minFontSize: 24,
    maxLines: 1,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 27);
  ctx.restore();

  return topY + cardH;
}

/**
 * Visual Variant 2: Vector Scatter Diagram (High-Dimensional Space & Similarity)
 * Dynamic 2D projection with query beacon vector and cosine similarity neighbor links.
 */
export async function drawVectorScatterDiagram(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  _options: VisualSystemOptions,
  topY: number = 240
): Promise<number> {
  const cardX = SAFE_MARGIN_LEFT;
  const cardW = SAFE_CONTENT_WIDTH;
  const cardH = 540;
  const radius = 28;

  // Background card
  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Line
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();

  // Header Tag (>= 24px)
  drawRoundRect(ctx, cardX + 28, topY + 20, cardW - 56, 48, 12, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VECTOR EMBEDDINGS // HIGH-DIM SPACE', cardX + cardW / 2, topY + 44);
  ctx.restore();

  // Vector Space Canvas area
  const spaceX = cardX + 28;
  const spaceY = topY + 82;
  const spaceW = cardW - 56;
  const spaceH = 366;

  drawRoundRect(ctx, spaceX, spaceY, spaceW, spaceH, 16, '#0b1319', `${theme.accent}30`, 1);

  // Coordinate Grid lines
  ctx.save();
  ctx.strokeStyle = `${theme.accent}15`;
  ctx.lineWidth = 1;
  for (let gx = spaceX + 50; gx < spaceX + spaceW; gx += 70) {
    ctx.beginPath();
    ctx.moveTo(gx, spaceY);
    ctx.lineTo(gx, spaceY + spaceH);
    ctx.stroke();
  }
  for (let gy = spaceY + 40; gy < spaceY + spaceH; gy += 60) {
    ctx.beginPath();
    ctx.moveTo(spaceX, gy);
    ctx.lineTo(spaceX + spaceW, gy);
    ctx.stroke();
  }

  // Scattered background vector points (dimmed)
  const bgPoints = [
    { x: spaceX + 110, y: spaceY + 90 },
    { x: spaceX + 160, y: spaceY + 240 },
    { x: spaceX + 240, y: spaceY + 70 },
    { x: spaceX + 680, y: spaceY + 80 },
    { x: spaceX + 710, y: spaceY + 230 },
    { x: spaceX + 620, y: spaceY + 290 },
    { x: spaceX + 740, y: spaceY + 150 },
  ];
  ctx.fillStyle = '#334155';
  for (const p of bgPoints) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Query Vector Beacon (Highlighted)
  const qx = spaceX + 310;
  const qy = spaceY + 180;

  // Expanding radar rings around query
  ctx.beginPath();
  ctx.arc(qx, qy, 65, 0, Math.PI * 2);
  ctx.strokeStyle = `${theme.accent}33`;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 6]);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(qx, qy, 120, 0, Math.PI * 2);
  ctx.strokeStyle = `${theme.accent}18`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  // Query center point with neon glow
  ctx.shadowColor = theme.accent;
  ctx.shadowBlur = 18;
  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(qx, qy, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Query Label Badge (>= 24px)
  drawRoundRect(ctx, qx - 115, qy - 58, 230, 40, 10, '#04080a', theme.accent, 1.2);
  ctx.font = '800 24px "JetBrains Mono", monospace';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('QUERY VECTOR', qx, qy - 38);

  // 3 Nearest Neighbor Candidate Vectors
  const neighbors = [
    { x: spaceX + 460, y: spaceY + 110, score: '0.94' },
    { x: spaceX + 490, y: spaceY + 220, score: '0.89' },
    { x: spaceX + 270, y: spaceY + 280, score: '0.82' },
  ];

  for (const n of neighbors) {
    // Dotted distance connector
    ctx.beginPath();
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 4]);
    ctx.moveTo(qx, qy);
    ctx.lineTo(n.x, n.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Target node point
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(n.x, n.y, 9, 0, Math.PI * 2);
    ctx.fill();

    // Score Badge (>= 24px)
    const bw = 96;
    const bh = 38;
    drawRoundRect(ctx, n.x + 14, n.y - 19, bw, bh, 8, '#060a0d', '#10B981', 1.2);
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillStyle = '#34D399';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(n.score, n.x + 14 + bw / 2, n.y);
  }
  ctx.restore();

  // Bottom Telemetry Footer (>= 24px)
  const barY = topY + cardH - 76;
  drawRoundRect(ctx, cardX + 24, barY, cardW - 48, 54, 12, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText = slide.diagramFooter || 'COSINE SIMILARITY • TOP-K NEAREST NEIGHBORS';
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 80, 24, '"JetBrains Mono", monospace', '700', {
    minFontSize: 24,
    maxLines: 1,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 27);
  ctx.restore();

  return topY + cardH;
}

/**
 * Visual Variant 3: HNSW Hierarchical Graph Traversal
 * Shows 3 stacked skip-graph layers with a downward traversal path.
 */
export async function drawHnswHierarchicalGraph(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  _options: VisualSystemOptions,
  topY: number = 240
): Promise<number> {
  const cardX = SAFE_MARGIN_LEFT;
  const cardW = SAFE_CONTENT_WIDTH;
  const cardH = 540;
  const radius = 28;

  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Line & Header Tag (>= 24px)
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();

  drawRoundRect(ctx, cardX + 28, topY + 20, cardW - 56, 48, 12, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HNSW INDEX // MULTI-LAYER TRAVERSAL', cardX + cardW / 2, topY + 44);
  ctx.restore();

  // 3 Horizontal Graph Layers
  const layerX = cardX + 28;
  const layerW = cardW - 56;
  const layerH = 108;
  const startY = topY + 82;
  const gap = 16;

  const layers = [
    {
      y: startY,
      label: 'LAYER 2: SPARSE SKIP',
      desc: 'Long-range hops',
      nodes: [{ x: 460, active: true, tag: 'ENTRY' }, { x: 680, active: false }],
      color: theme.accent,
    },
    {
      y: startY + layerH + gap,
      label: 'LAYER 1: CLUSTER HOPS',
      desc: 'Medium-range links',
      nodes: [{ x: 460, active: false }, { x: 570, active: true, tag: 'HOP' }, { x: 700, active: false }],
      color: '#38BDF8',
    },
    {
      y: startY + (layerH + gap) * 2,
      label: 'LAYER 0: DENSE BASE',
      desc: 'Nearest neighbor match',
      nodes: [{ x: 450, active: false }, { x: 560, active: false }, { x: 670, active: true, tag: 'TARGET' }],
      color: '#10B981',
    },
  ];

  for (const l of layers) {
    drawRoundRect(ctx, layerX, l.y, layerW, layerH, 14, '#0b1319', `${l.color}40`, 1.2);

    // Layer Label Badge (>= 24px)
    ctx.save();
    ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(l.label, layerX + 22, l.y + 42);

    ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(l.desc, layerX + 22, l.y + 82);

    // Horizontal Layer Link Line
    ctx.beginPath();
    ctx.strokeStyle = `${l.color}45`;
    ctx.lineWidth = 2;
    ctx.moveTo(layerX + 430, l.y + layerH / 2);
    ctx.lineTo(layerX + layerW - 30, l.y + layerH / 2);
    ctx.stroke();

    // Render Nodes on this Layer
    for (const nd of l.nodes) {
      const nx = layerX + nd.x;
      const ny = l.y + layerH / 2;

      ctx.fillStyle = nd.active ? l.color : '#334155';
      ctx.beginPath();
      ctx.arc(nx, ny, nd.active ? 10 : 6, 0, Math.PI * 2);
      ctx.fill();

      if (nd.tag) {
        drawRoundRect(ctx, nx - 58, ny - 44, 116, 32, 8, '#04080a', l.color, 1);
        ctx.font = '700 24px "JetBrains Mono", monospace';
        ctx.fillStyle = l.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(nd.tag, nx, ny - 28);
      }
    }
    ctx.restore();
  }

  // Downward Glowing Traversal Path (Entry -> Layer 1 Hop -> Layer 0 Target)
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = '#FBBF24';
  ctx.lineWidth = 3;
  ctx.setLineDash([4, 4]);
  ctx.moveTo(layerX + 460, startY + layerH / 2);
  ctx.lineTo(layerX + 570, startY + layerH + gap + layerH / 2);
  ctx.lineTo(layerX + 670, startY + (layerH + gap) * 2 + layerH / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Bottom Telemetry Footer (>= 24px)
  const barY = topY + cardH - 76;
  drawRoundRect(ctx, cardX + 24, barY, cardW - 48, 54, 12, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText = slide.diagramFooter || 'SEARCH: O(log N) • MULTI-LAYER GRAPH NAVIGATION';
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 80, 24, '"JetBrains Mono", monospace', '700', {
    minFontSize: 24,
    maxLines: 1,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 27);
  ctx.restore();

  return topY + cardH;
}

/**
 * Visual Variant 4: IVF Space Partitioning & Clusters
 * Shows K-means Voronoi-like clusters with the target centroid illuminated and other clusters pruned.
 */
export async function drawIvfClustersDiagram(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  _options: VisualSystemOptions,
  topY: number = 240
): Promise<number> {
  const cardX = SAFE_MARGIN_LEFT;
  const cardW = SAFE_CONTENT_WIDTH;
  const cardH = 540;
  const radius = 28;

  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Line & Header Tag (>= 24px)
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();

  drawRoundRect(ctx, cardX + 28, topY + 20, cardW - 56, 48, 12, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('IVF CLUSTERING // SPACE PARTITIONING', cardX + cardW / 2, topY + 44);
  ctx.restore();

  // 3 Cluster Partition Cards
  const clusterW = 248;
  const clusterH = 356;
  const clusterY = topY + 84;
  const gap = 28;

  const clusters = [
    {
      x: cardX + 24,
      name: 'CLUSTER A',
      status: 'PRUNED',
      statusColor: '#64748B',
      detail: 'Distant Centroid\nSkipped',
      active: false,
    },
    {
      x: cardX + 24 + clusterW + gap,
      name: 'CLUSTER B',
      status: 'ACTIVE',
      statusColor: '#10B981',
      detail: 'Nearest Centroid\nScanned',
      active: true,
    },
    {
      x: cardX + 24 + (clusterW + gap) * 2,
      name: 'CLUSTER C',
      status: 'PRUNED',
      statusColor: '#64748B',
      detail: 'Distant Centroid\nSkipped',
      active: false,
    },
  ];

  for (const c of clusters) {
    drawRoundRect(
      ctx,
      c.x,
      clusterY,
      clusterW,
      clusterH,
      18,
      c.active ? '#0d1d1f' : '#070b0e',
      c.active ? theme.accent : '#1e293b',
      c.active ? 2.5 : 1
    );

    // Centroid Icon / Hub Circle
    ctx.save();
    const cx = c.x + clusterW / 2;
    const cy = clusterY + 64;

    ctx.fillStyle = c.active ? theme.accent : '#334155';
    ctx.beginPath();
    ctx.arc(cx, cy, c.active ? 28 : 20, 0, Math.PI * 2);
    ctx.fill();

    if (c.active) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Centroid inner dot
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();

    // Cluster Name (>= 24px)
    ctx.font = '800 26px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = c.active ? '#FFFFFF' : '#94A3B8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(c.name, cx, clusterY + 140);

    // Status Pill (>= 24px)
    const pillW = 190;
    const pillH = 44;
    drawRoundRect(ctx, cx - pillW / 2, clusterY + 162, pillW, pillH, 10, `${c.statusColor}22`, c.statusColor, 1.2);
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillStyle = c.statusColor;
    ctx.textBaseline = 'middle';
    ctx.fillText(c.status, cx, clusterY + 162 + pillH / 2);

    // Explanatory detail lines (>= 24px)
    ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = c.active ? '#E2E8F0' : '#64748B';
    ctx.textBaseline = 'alphabetic';
    const lines = c.detail.split('\n');
    ctx.fillText(lines[0] || '', cx, clusterY + 256);
    if (lines[1]) ctx.fillText(lines[1], cx, clusterY + 292);

    ctx.restore();
  }

  // Bottom Telemetry Footer (>= 24px)
  const barY = topY + cardH - 76;
  drawRoundRect(ctx, cardX + 24, barY, cardW - 48, 54, 12, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText = slide.diagramFooter || 'SEARCH SPACE PRUNED • CANDIDATE CLUSTERS ONLY';
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 80, 24, '"JetBrains Mono", monospace', '700', {
    minFontSize: 24,
    maxLines: 1,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 27);
  ctx.restore();

  return topY + cardH;
}

/**
 * Visual Variant 5: Hot / Cold Dual Store Architecture (Writes vs Reads)
 * Side-by-side split showing mutable ingestion buffer on left, async compaction, and cold index on right.
 */
export async function drawHotColdDualStoreDiagram(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  _options: VisualSystemOptions,
  topY: number = 240
): Promise<number> {
  const cardX = SAFE_MARGIN_LEFT;
  const cardW = SAFE_CONTENT_WIDTH;
  const cardH = 540;
  const radius = 28;

  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Line & Header Tag (>= 24px)
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();

  drawRoundRect(ctx, cardX + 28, topY + 20, cardW - 56, 48, 12, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DUAL STORE // HOT BUFFER & COLD INDEX', cardX + cardW / 2, topY + 44);
  ctx.restore();

  // Left & Right Store Cards
  const storeW = 368;
  const storeH = 356;
  const storeY = topY + 84;
  const lx = cardX + 24;
  const rx = cardX + cardW - 24 - storeW;

  // Left: HOT STORE
  drawRoundRect(ctx, lx, storeY, storeW, storeH, 18, '#0b161b', `${theme.accent}65`, 1.8);
  ctx.save();
  drawRoundRect(ctx, lx + 20, storeY + 20, 56, 56, 12, `${theme.accent}20`, theme.accent, 1.5);
  const zapImg = await loadIconImage('zap', theme.accent);
  safeDrawImage(ctx, zapImg, lx + 30, storeY + 30, 36, 36);

  ctx.font = '800 28px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('HOT STORE', lx + 90, storeY + 46);

  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.fillText('RAM BUFFER', lx + 90, storeY + 78);

  ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('• Fast appends', lx + 20, storeY + 140);
  ctx.fillText('• Lock-free writes', lx + 20, storeY + 184);
  ctx.fillText('• Low latency', lx + 20, storeY + 228);

  drawRoundRect(ctx, lx + 20, storeY + storeH - 60, storeW - 40, 44, 8, `${theme.accent}25`, theme.accent, 1);
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FAST WRITES', lx + storeW / 2, storeY + storeH - 38);
  ctx.restore();

  // Right: COLD STORE
  drawRoundRect(ctx, rx, storeY, storeW, storeH, 18, '#0b161b', '#10B98165', 1.8);
  ctx.save();
  drawRoundRect(ctx, rx + 20, storeY + 20, 56, 56, 12, 'rgba(16, 185, 129, 0.20)', '#10B981', 1.5);
  const dbImg = await loadIconImage('database', '#10B981');
  safeDrawImage(ctx, dbImg, rx + 30, storeY + 30, 36, 36);

  ctx.font = '800 28px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('COLD STORE', rx + 90, storeY + 46);

  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = '#34D399';
  ctx.fillText('COMPACT INDEX', rx + 90, storeY + 78);

  ctx.font = '600 24px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('• Read-optimized', rx + 20, storeY + 140);
  ctx.fillText('• Dense segments', rx + 20, storeY + 184);
  ctx.fillText('• High recall', rx + 20, storeY + 228);

  drawRoundRect(ctx, rx + 20, storeY + storeH - 60, storeW - 40, 44, 8, 'rgba(16, 185, 129, 0.25)', '#10B981', 1);
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = '#34D399';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FAST READS', rx + storeW / 2, storeY + storeH - 38);
  ctx.restore();

  // Center Sync Connector Arrow
  const midY = storeY + storeH / 2;
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = '#FBBF24';
  ctx.lineWidth = 3;
  ctx.moveTo(lx + storeW + 6, midY);
  ctx.lineTo(rx - 6, midY);
  ctx.stroke();

  ctx.fillStyle = '#FBBF24';
  ctx.beginPath();
  ctx.moveTo(rx - 2, midY);
  ctx.lineTo(rx - 12, midY - 8);
  ctx.lineTo(rx - 12, midY + 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Bottom Telemetry Footer (>= 24px)
  const barY = topY + cardH - 76;
  drawRoundRect(ctx, cardX + 24, barY, cardW - 48, 54, 12, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText = slide.diagramFooter || 'WRITES: RAM BUFFER • COMPACTION: ASYNC FLUSH';
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 80, 24, '"JetBrains Mono", monospace', '700', {
    minFontSize: 24,
    maxLines: 1,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 27);
  ctx.restore();

  return topY + cardH;
}

/**
 * Visual Variant 6: Large Feature / Concept Cards
 * When a slide explains 3 distinct points or components (not a sequential pipeline).
 */
export async function drawFeatureCardsDiagram(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  _options: VisualSystemOptions,
  topY: number = 240
): Promise<number> {
  const cardX = SAFE_MARGIN_LEFT;
  const cardW = SAFE_CONTENT_WIDTH;
  const cardH = 540;
  const radius = 28;

  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Line & Header Tag (>= 24px)
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();

  drawRoundRect(ctx, cardX + 28, topY + 20, cardW - 56, 48, 12, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ARCHITECTURAL PRINCIPLES // OVERVIEW', cardX + cardW / 2, topY + 44);
  ctx.restore();

  const nodeW = 248;
  const nodeH = 356;
  const nodeY = topY + 84;
  const gap = 28;

  const derived = deriveDynamicSlideNodes(slide);

  for (let i = 0; i < 3; i++) {
    const nd = derived[i];
    const nx = cardX + 24 + i * (nodeW + gap);

    drawRoundRect(ctx, nx, nodeY, nodeW, nodeH, 18, '#0b1319', `${theme.accent}50`, 1.5);

    // Large 60x60 icon badge
    drawRoundRect(ctx, nx + 18, nodeY + 18, 60, 60, 14, `${theme.accent}20`, theme.accent, 1.5);
    const img = await loadIconImage(nd.icon, theme.accent);
    safeDrawImage(ctx, img, nx + 30, nodeY + 30, 36, 36);

    // Card Index (>= 24px)
    ctx.save();
    ctx.font = '800 24px "JetBrains Mono", monospace';
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`0${i + 1}`, nx + nodeW - 18, nodeY + 48);

    // Title (bold 28px down to 24px minimum)
    const fitTitle = fitTextInBox(ctx, nd.label, nodeW - 36, 28, '"Plus Jakarta Sans", sans-serif', '800', {
      minFontSize: 24,
      maxLines: 2,
    });
    ctx.font = `800 ${fitTitle.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fitTitle.lines[0] || nd.label, nx + 18, nodeY + 124);
    if (fitTitle.lines[1]) {
      ctx.fillText(fitTitle.lines[1], nx + 18, nodeY + 124 + fitTitle.lineHeight);
    }

    // Sublabel (24px minimum in #E2E8F0)
    const fitSub = fitTextInBox(ctx, nd.sublabel, nodeW - 36, 24, '"Plus Jakarta Sans", sans-serif', '600', {
      minFontSize: 24,
      maxLines: 2,
    });
    ctx.font = `600 ${fitSub.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#E2E8F0';
    const subY = fitTitle.lines.length <= 1 ? nodeY + 184 : nodeY + 206;
    ctx.fillText(fitSub.lines[0] || nd.sublabel, nx + 18, subY);
    if (fitSub.lines[1]) {
      ctx.fillText(fitSub.lines[1], nx + 18, subY + fitSub.lineHeight);
    }

    // Status Pill (>= 24px)
    const pillW = nodeW - 36;
    const pillH = 44;
    drawRoundRect(ctx, nx + 18, nodeY + nodeH - 58, pillW, pillH, 8, `${theme.accent}20`, theme.accent, 1);
    const fitStatus = fitTextInBox(ctx, nd.status, pillW - 16, 24, '"JetBrains Mono", monospace', '700', {
      minFontSize: 24,
      maxLines: 1,
    });
    ctx.font = `700 ${fitStatus.fontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitStatus.lines[0] || nd.status, nx + 18 + pillW / 2, nodeY + nodeH - 36);
    ctx.restore();
  }

  // Bottom Telemetry Footer (>= 24px)
  const barY = topY + cardH - 76;
  drawRoundRect(ctx, cardX + 24, barY, cardW - 48, 54, 12, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText = slide.diagramFooter || 'ARCHITECTURAL PATTERNS • VERIFIED IN PRODUCTION';
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 80, 24, '"JetBrains Mono", monospace', '700', {
    minFontSize: 24,
    maxLines: 1,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 27);
  ctx.restore();

  return topY + cardH;
}

/**
 * Visual Variant 7: Fault Boundary & Isolation Grid
 */
export async function drawBlastRadiusIsolationGrid(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  _options: VisualSystemOptions,
  topY: number = 240
): Promise<number> {
  const cardX = SAFE_MARGIN_LEFT;
  const cardW = SAFE_CONTENT_WIDTH;
  const cardH = 540;
  const radius = 28;

  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Line & Header Tag (>= 24px)
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();

  drawRoundRect(ctx, cardX + 28, topY + 20, cardW - 56, 48, 12, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FAULT ISOLATION // COMPONENT BOUNDARY', cardX + cardW / 2, topY + 44);
  ctx.restore();

  const cellW = 248;
  const cellH = 356;
  const cellY = topY + 84;
  const gap = 28;

  const derived = deriveDynamicSlideNodes(slide);

  for (let i = 0; i < 3; i++) {
    const nd = derived[i];
    const cx = cardX + 24 + i * (cellW + gap);
    const isQuarantined = i === 0;

    drawRoundRect(
      ctx,
      cx,
      cellY,
      cellW,
      cellH,
      18,
      isQuarantined ? 'rgba(239, 68, 68, 0.08)' : '#0b1319',
      isQuarantined ? '#EF4444' : `${theme.accent}65`,
      isQuarantined ? 2 : 1.5
    );

    // Icon Badge (56x56)
    drawRoundRect(
      ctx,
      cx + 16,
      cellY + 18,
      56,
      56,
      14,
      isQuarantined ? 'rgba(239, 68, 68, 0.20)' : `${theme.accent}20`,
      isQuarantined ? '#EF4444' : theme.accent,
      1.2
    );
    const img = await loadIconImage(isQuarantined ? 'shieldAlert' : nd.icon, isQuarantined ? '#EF4444' : theme.accent);
    safeDrawImage(ctx, img, cx + 26, cellY + 28, 36, 36);

    ctx.save();
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillStyle = isQuarantined ? '#EF4444' : theme.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(isQuarantined ? 'RESTRICTED' : 'SECURED', cx + 82, cellY + 46);

    const fitTitle = fitTextInBox(ctx, nd.label, cellW - 32, 28, '"Plus Jakarta Sans", sans-serif', '800', {
      minFontSize: 24,
      maxLines: 2,
    });
    ctx.font = `800 ${fitTitle.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(fitTitle.lines[0] || nd.label, cx + 16, cellY + 124);
    if (fitTitle.lines[1]) {
      ctx.fillText(fitTitle.lines[1], cx + 16, cellY + 124 + fitTitle.lineHeight);
    }

    const fitSub = fitTextInBox(ctx, nd.sublabel, cellW - 32, 24, '"Plus Jakarta Sans", sans-serif', '600', {
      minFontSize: 24,
      maxLines: 2,
    });
    ctx.font = `600 ${fitSub.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#E2E8F0';
    const subY = fitTitle.lines.length <= 1 ? cellY + 184 : cellY + 206;
    ctx.fillText(fitSub.lines[0] || nd.sublabel, cx + 16, subY);
    if (fitSub.lines[1]) {
      ctx.fillText(fitSub.lines[1], cx + 16, subY + fitSub.lineHeight);
    }

    const pillW = cellW - 32;
    const pillH = 44;
    drawRoundRect(
      ctx,
      cx + 16,
      cellY + cellH - 58,
      pillW,
      pillH,
      8,
      isQuarantined ? 'rgba(239, 68, 68, 0.20)' : `${theme.accent}20`,
      isQuarantined ? '#EF4444' : theme.accent,
      1
    );
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillStyle = isQuarantined ? '#F87171' : theme.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isQuarantined ? 'ISOLATED' : 'VERIFIED', cx + 16 + pillW / 2, cellY + cellH - 36);
    ctx.restore();
  }

  // Bottom Telemetry Footer (>= 24px)
  const barY = topY + cardH - 76;
  drawRoundRect(ctx, cardX + 24, barY, cardW - 48, 54, 12, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText = slide.diagramFooter || 'FAULT DOMAIN ISOLATED • LATERAL MOVEMENT BLOCKED';
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 80, 24, '"JetBrains Mono", monospace', '700', {
    minFontSize: 24,
    maxLines: 1,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 27);
  ctx.restore();

  return topY + cardH;
}

/**
 * Visual Variant 8: Layered Architecture Stack
 */
export async function drawLayeredArchitectureStack(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  _options: VisualSystemOptions,
  topY: number = 240
): Promise<number> {
  const cardX = SAFE_MARGIN_LEFT;
  const cardW = SAFE_CONTENT_WIDTH;
  const cardH = 540;
  const radius = 28;

  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Line & Header Tag (>= 24px)
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();

  drawRoundRect(ctx, cardX + 28, topY + 20, cardW - 56, 48, 12, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ARCHITECTURE // THREE-TIER STACK', cardX + cardW / 2, topY + 44);
  ctx.restore();

  const tierW = cardW - 56;
  const tierH = 108;
  const startTierY = topY + 82;
  const gap = 16;
  const derived = deriveDynamicSlideNodes(slide);

  for (let i = 0; i < 3; i++) {
    const nd = derived[i];
    const ty = startTierY + i * (tierH + gap);

    drawRoundRect(ctx, cardX + 28, ty, tierW, tierH, 14, '#0b1319', `${theme.accent}55`, 1.5);

    // Icon Badge (56x56)
    drawRoundRect(ctx, cardX + 46, ty + 26, 56, 56, 12, `${theme.accent}20`, theme.accent, 1.2);
    const img = await loadIconImage(nd.icon, theme.accent);
    safeDrawImage(ctx, img, cardX + 56, ty + 36, 36, 36);

    ctx.save();
    // Layer Tag (>= 24px)
    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`TIER 0${i + 1} // ${nd.status}`, cardX + 120, ty + 44);

    // Layer Title (bold 28px)
    ctx.font = '800 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(nd.label, cardX + 120, ty + 84);

    // Layer Sublabel (24px in #E2E8F0)
    const fitSub = fitTextInBox(ctx, nd.sublabel, 280, 24, '"Plus Jakarta Sans", sans-serif', '600', {
      minFontSize: 24,
      maxLines: 1,
    });
    ctx.font = `600 ${fitSub.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#E2E8F0';
    ctx.textAlign = 'right';
    ctx.fillText(fitSub.lines[0] || nd.sublabel, cardX + tierW + 8, ty + 64);
    ctx.restore();
  }

  // Bottom Telemetry Footer (>= 24px)
  const barY = topY + cardH - 76;
  drawRoundRect(ctx, cardX + 24, barY, cardW - 48, 54, 12, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText = slide.diagramFooter || 'END-TO-END PIPELINE ACROSS ARCHITECTURAL TIERS';
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 80, 24, '"JetBrains Mono", monospace', '700', {
    minFontSize: 24,
    maxLines: 1,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 27);
  ctx.restore();

  return topY + cardH;
}

/**
 * Visual Variant 9: Key Architectural Takeaway Card
 */
export async function drawKeyTakeawayCard(
  ctx: CanvasRenderingContext2D,
  slide: SlideData,
  theme: ThemePalette,
  _options: VisualSystemOptions,
  topY: number = 240
): Promise<number> {
  const cardX = SAFE_MARGIN_LEFT;
  const cardW = SAFE_CONTENT_WIDTH;
  const cardH = 540;
  const radius = 28;

  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Line & Header Tag (>= 24px)
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();

  drawRoundRect(ctx, cardX + 28, topY + 20, cardW - 56, 48, 12, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ARCHITECTURAL PRINCIPLE // TRADE-OFF', cardX + cardW / 2, topY + 44);
  ctx.restore();

  // Highlighted Principle Block
  const blockW = cardW - 56;
  const blockH = 200;
  const blockX = cardX + 28;
  const blockY = topY + 84;

  drawRoundRect(ctx, blockX, blockY, blockW, blockH, 16, '#0b1319', `${theme.accent}65`, 1.5);
  drawRoundRect(ctx, blockX, blockY, 6, blockH, 3, theme.accent);

  const iconName = slide.diagramNodes?.[0]?.icon || slide.icons?.[0]?.icon || 'shieldAlert';
  const iconImg = await loadIconImage(iconName, theme.accent);
  drawRoundRect(ctx, blockX + 22, blockY + 22, 60, 60, 14, `${theme.accent}20`, `${theme.accent}70`, 1.2);
  safeDrawImage(ctx, iconImg, blockX + 34, blockY + 34, 36, 36);

  ctx.save();
  const cleanTitle = (slide.enTitle || 'Core Architectural Trade-off.').replace(/[.?!]$/, '');
  const fitTitle = fitTextInBox(ctx, cleanTitle, blockW - 110, 32, '"Plus Jakarta Sans", sans-serif', '800', {
    minFontSize: 24,
    maxLines: 2,
  });
  ctx.font = `800 ${fitTitle.fontSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitTitle.lines[0] || cleanTitle, blockX + 100, blockY + 54);
  if (fitTitle.lines[1]) {
    ctx.fillText(fitTitle.lines[1], blockX + 100, blockY + 54 + fitTitle.lineHeight);
  }

  const cleanBody = slide.enBody || 'Decoupled architectural components eliminate system bottlenecks.';
  const fitBody = fitTextInBox(ctx, cleanBody, blockW - 110, 24, '"Plus Jakarta Sans", sans-serif', '500', {
    minFontSize: 24,
    maxLines: 2,
  });
  ctx.font = `500 ${fitBody.fontSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText(fitBody.lines[0] || cleanBody, blockX + 100, blockY + 132);
  if (fitBody.lines[1]) {
    ctx.fillText(fitBody.lines[1], blockX + 100, blockY + 132 + fitBody.lineHeight);
  }
  ctx.restore();

  // 2 Comparative Sub-Cards at bottom
  const subW = (blockW - 20) / 2;
  const subH = 210;
  const subY = blockY + blockH + 20;

  // Sub-card 1: Critical Constraint (>= 24px)
  drawRoundRect(ctx, blockX, subY, subW, subH, 14, 'rgba(245, 158, 11, 0.08)', 'rgba(245, 158, 11, 0.40)', 1.2);
  ctx.save();
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = '#FBBF24';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('CONSTRAINT', blockX + 18, subY + 44);

  const c1Text1 = slide.diagramNodes?.[1]?.label || 'Bound queue depth';
  const c1Text2 = slide.diagramNodes?.[1]?.sublabel || 'Avoid unbounded buffers';
  const fitC1Text1 = fitTextInBox(ctx, c1Text1, subW - 36, 26, '"Plus Jakarta Sans", sans-serif', '700', { minFontSize: 24 });
  const fitC1Text2 = fitTextInBox(ctx, c1Text2, subW - 36, 24, '"Plus Jakarta Sans", sans-serif', '500', { minFontSize: 24 });

  ctx.font = `700 ${fitC1Text1.fontSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(fitC1Text1.lines[0] || c1Text1, blockX + 18, subY + 102);
  ctx.font = `500 ${fitC1Text2.fontSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(fitC1Text2.lines[0] || c1Text2, blockX + 18, subY + 154);
  ctx.restore();

  // Sub-card 2: Production Best Practice (>= 24px)
  drawRoundRect(ctx, blockX + subW + 20, subY, subW, subH, 14, 'rgba(16, 185, 129, 0.08)', 'rgba(16, 185, 129, 0.40)', 1.2);
  ctx.save();
  ctx.font = '700 24px "JetBrains Mono", monospace';
  ctx.fillStyle = '#34D399';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('PRODUCTION', blockX + subW + 38, subY + 44);

  const c2Text1 = slide.diagramNodes?.[2]?.label || 'Isolate hot paths';
  const c2Text2 = slide.diagramNodes?.[2]?.sublabel || 'Predictable p99 latency';
  const fitC2Text1 = fitTextInBox(ctx, c2Text1, subW - 36, 26, '"Plus Jakarta Sans", sans-serif', '700', { minFontSize: 24 });
  const fitC2Text2 = fitTextInBox(ctx, c2Text2, subW - 36, 24, '"Plus Jakarta Sans", sans-serif', '500', { minFontSize: 24 });

  ctx.font = `700 ${fitC2Text1.fontSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(fitC2Text1.lines[0] || c2Text1, blockX + subW + 38, subY + 102);
  ctx.font = `500 ${fitC2Text2.fontSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(fitC2Text2.lines[0] || c2Text2, blockX + subW + 38, subY + 154);
  ctx.restore();

  return topY + cardH;
}
