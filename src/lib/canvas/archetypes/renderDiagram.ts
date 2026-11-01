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
  const cardH = 490;
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

  // Top Header Tag
  drawRoundRect(ctx, cardX + 32, topY + 22, 360, 40, 10, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.save();
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    isFinancialOrMacro ? 'TOPOLOGY // CAPITAL & VALUE FLOW' : 'TOPOLOGY // PROTOCOL DATAFLOW',
    cardX + 32 + 180,
    topY + 42
  );
  ctx.restore();

  // 2. 3 Connected Component Node Cards
  const nodeW = 246;
  const nodeH = 280;
  const nodeY = topY + 80;
  const gap = 36;
  const nx1 = cardX + 32;
  const nx2 = nx1 + nodeW + gap;
  const nx3 = nx2 + nodeW + gap;

  const derived = deriveDynamicSlideNodes(slide);
  const roles = isFinancialOrMacro ? ['SOURCE', 'MECHANISM', 'IMPACT'] : ['INGRESS', 'PROCESSING', 'TARGET'];
  const nodes = [
    { x: nx1, icon: derived[0].icon, title: derived[0].label, role: roles[0], sub: derived[0].sublabel, status: derived[0].status, statusColor: theme.accent },
    { x: nx2, icon: derived[1].icon, title: derived[1].label, role: roles[1], sub: derived[1].sublabel, status: derived[1].status, statusColor: '#10B981' },
    { x: nx3, icon: derived[2].icon, title: derived[2].label, role: roles[2], sub: derived[2].sublabel, status: derived[2].status, statusColor: theme.accent },
  ];

  for (const n of nodes) {
    drawRoundRect(ctx, n.x, nodeY, nodeW, nodeH, 18, '#0b1319', `${theme.accent}65`, 1.8);

    // Inner icon badge (56x56)
    drawRoundRect(ctx, n.x + 18, nodeY + 18, 56, 56, 14, `${theme.accent}20`, `${theme.accent}70`, 1.2);
    const nImg = await loadIconImage(n.icon, theme.accent);
    safeDrawImage(ctx, nImg, n.x + 28, nodeY + 28, 36, 36);

    // Role Micro-Badge
    ctx.save();
    ctx.font = '700 16px "JetBrains Mono", monospace';
    ctx.fillStyle = theme.microLabel;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(n.role, n.x + 86, nodeY + 44);

    // Primary Title with bold legibility (28px down to 22px)
    const fitTitle = fitTextInBox(ctx, n.title, nodeW - 32, 28, '"Plus Jakarta Sans", sans-serif', '800', {
      minFontSize: 22,
      maxLines: 2,
    });
    ctx.font = `800 ${fitTitle.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    if (fitTitle.lines.length <= 1) {
      ctx.fillText(fitTitle.lines[0] || n.title, n.x + 18, nodeY + 120);
    } else {
      ctx.fillText(fitTitle.lines[0], n.x + 18, nodeY + 108);
      ctx.fillText(fitTitle.lines[1], n.x + 18, nodeY + 108 + fitTitle.lineHeight);
    }

    // High-Contrast Sublabel (22px down to 18px in #E2E8F0)
    const fitSub = fitTextInBox(ctx, n.sub, nodeW - 32, 22, '"Plus Jakarta Sans", sans-serif', '600', {
      minFontSize: 18,
      maxLines: 2,
    });
    ctx.font = `600 ${fitSub.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#E2E8F0';
    const subY = fitTitle.lines.length <= 1 ? nodeY + 164 : nodeY + 176;
    ctx.fillText(fitSub.lines[0] || n.sub, n.x + 18, subY);
    if (fitSub.lines[1]) {
      ctx.fillText(fitSub.lines[1], n.x + 18, subY + fitSub.lineHeight);
    }

    // Bottom Status Pill
    const pillW = 130;
    const pillH = 34;
    drawRoundRect(ctx, n.x + 18, nodeY + nodeH - 46, pillW, pillH, 8, `${n.statusColor}22`, `${n.statusColor}70`, 1.2);
    const fitStatus = fitTextInBox(ctx, `[ ${n.status} ]`, pillW - 10, 16, '"JetBrains Mono", monospace', '700', {
      minFontSize: 13,
    });
    ctx.font = `700 ${fitStatus.fontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = n.statusColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitStatus.lines[0] || `[ ${n.status} ]`, n.x + 18 + pillW / 2, nodeY + nodeH - 29);
    ctx.restore();
  }

  // Connectors between Node 1 -> Node 2 and Node 2 -> Node 3
  const edges = slide.diagramEdges || ['PROCESS', 'COMMIT'];
  const arrowPairs = [
    { x1: nx1 + nodeW, x2: nx2, y: nodeY + nodeH / 2, label: edges[0] || 'DISPATCH' },
    { x1: nx2 + nodeW, x2: nx3, y: nodeY + nodeH / 2, label: edges[1] || 'COMMIT' },
  ];

  for (const ap of arrowPairs) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = `${theme.accent}99`;
    ctx.lineWidth = 2.5;
    ctx.moveTo(ap.x1 + 6, ap.y);
    ctx.lineTo(ap.x2 - 6, ap.y);
    ctx.stroke();

    // Arrowhead pointing right
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.moveTo(ap.x2 - 4, ap.y);
    ctx.lineTo(ap.x2 - 12, ap.y - 6);
    ctx.lineTo(ap.x2 - 12, ap.y + 6);
    ctx.closePath();
    ctx.fill();

    // Edge Label Badge
    const fitEdge = fitTextInBox(ctx, ap.label, gap + 16, 14, '"JetBrains Mono", monospace', '700', { minFontSize: 11 });
    ctx.font = `700 ${fitEdge.fontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'center';
    ctx.fillText(fitEdge.lines[0] || ap.label, (ap.x1 + ap.x2) / 2, ap.y - 12);
    ctx.restore();
  }

  // Bottom Telemetry Footer Bar
  const barY = topY + cardH - 64;
  drawRoundRect(ctx, cardX + 32, barY, cardW - 64, 44, 10, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText =
    slide.diagramFooter ||
    `${derived[0].label.toUpperCase()} ➔ ${derived[1].label.toUpperCase()} ➔ ${derived[2].label.toUpperCase()}`;
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 100, 20, '"JetBrains Mono", monospace', '700', {
    minFontSize: 15,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 22);
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
  const cardH = 490;
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

  // Header Tag
  drawRoundRect(ctx, cardX + 32, topY + 22, 400, 40, 10, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VECTOR EMBEDDINGS // HIGH-DIMENSIONAL SPACE', cardX + 32 + 200, topY + 42);
  ctx.restore();

  // Vector Space Canvas area
  const spaceX = cardX + 32;
  const spaceY = topY + 74;
  const spaceW = cardW - 64;
  const spaceH = 330;

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
    { x: spaceX + 160, y: spaceY + 220 },
    { x: spaceX + 240, y: spaceY + 70 },
    { x: spaceX + 680, y: spaceY + 80 },
    { x: spaceX + 710, y: spaceY + 210 },
    { x: spaceX + 620, y: spaceY + 260 },
    { x: spaceX + 740, y: spaceY + 140 },
  ];
  ctx.fillStyle = '#334155';
  for (const p of bgPoints) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Query Vector Beacon (Highlighted)
  const qx = spaceX + 340;
  const qy = spaceY + 160;

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

  // Query Label Badge
  drawRoundRect(ctx, qx - 70, qy - 48, 140, 30, 8, '#04080a', theme.accent, 1.2);
  ctx.font = '800 16px "JetBrains Mono", monospace';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText('QUERY VECTOR', qx, qy - 28);

  // 3 Nearest Neighbor Candidate Vectors
  const neighbors = [
    { x: spaceX + 440, y: spaceY + 110, score: 'cos θ = 0.94', label: 'NN #1 (Best Match)' },
    { x: spaceX + 470, y: spaceY + 210, score: 'cos θ = 0.89', label: 'NN #2' },
    { x: spaceX + 270, y: spaceY + 250, score: 'cos θ = 0.82', label: 'NN #3' },
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

    // Score Badge
    const bw = 120;
    const bh = 28;
    drawRoundRect(ctx, n.x + 12, n.y - 14, bw, bh, 6, '#060a0d', '#10B981', 1);
    ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.fillStyle = '#34D399';
    ctx.textAlign = 'center';
    ctx.fillText(n.score, n.x + 12 + bw / 2, n.y + 5);
  }
  ctx.restore();

  // Bottom Telemetry Footer
  const barY = topY + cardH - 64;
  drawRoundRect(ctx, cardX + 32, barY, cardW - 64, 44, 10, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText = slide.diagramFooter || 'METRIC: COSINE SIMILARITY • RETRIEVAL: TOP-K NEAREST NEIGHBORS (ANN)';
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 100, 20, '"JetBrains Mono", monospace', '700', {
    minFontSize: 15,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 22);
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
  const cardH = 490;
  const radius = 28;

  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Line & Header Tag
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();

  drawRoundRect(ctx, cardX + 32, topY + 22, 420, 40, 10, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HNSW INDEX // MULTI-LAYER GRAPH TRAVERSAL', cardX + 32 + 210, topY + 42);
  ctx.restore();

  // 3 Horizontal Graph Layers
  const layerX = cardX + 32;
  const layerW = cardW - 64;
  const layerH = 92;
  const startY = topY + 76;
  const gap = 16;

  const layers = [
    {
      y: startY,
      label: 'LAYER 2: SPARSE SKIP GRAPH',
      desc: 'Long-range hops • Fast initial zoom',
      nodes: [{ x: 180, active: true, tag: 'ENTRY' }, { x: 580, active: false }],
      color: theme.accent,
    },
    {
      y: startY + layerH + gap,
      label: 'LAYER 1: INTERMEDIATE GRAPH',
      desc: 'Medium-range links • Local cluster hops',
      nodes: [{ x: 180, active: false }, { x: 380, active: true, tag: 'HOP' }, { x: 580, active: false }, { x: 680, active: false }],
      color: '#38BDF8',
    },
    {
      y: startY + (layerH + gap) * 2,
      label: 'LAYER 0: DENSE BASE VECTOR GRAPH',
      desc: 'Shortest links • Convergence to target nearest neighbor',
      nodes: [{ x: 120, active: false }, { x: 260, active: false }, { x: 380, active: false }, { x: 510, active: true, tag: 'TARGET NN' }, { x: 650, active: false }],
      color: '#10B981',
    },
  ];

  for (const l of layers) {
    drawRoundRect(ctx, layerX, l.y, layerW, layerH, 14, '#0b1319', `${l.color}40`, 1.2);

    // Layer Label Badge
    ctx.save();
    ctx.font = '800 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.fillText(l.label, layerX + 24, l.y + 36);

    ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(l.desc, layerX + 24, l.y + 66);

    // Horizontal Layer Link Line
    ctx.beginPath();
    ctx.strokeStyle = `${l.color}45`;
    ctx.lineWidth = 2;
    ctx.moveTo(layerX + 320, l.y + layerH / 2);
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
        drawRoundRect(ctx, nx - 45, ny - 36, 90, 24, 6, '#04080a', l.color, 1);
        ctx.font = '700 13px "JetBrains Mono", monospace';
        ctx.fillStyle = l.color;
        ctx.textAlign = 'center';
        ctx.fillText(nd.tag, nx, ny - 20);
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
  ctx.moveTo(layerX + 180, startY + layerH / 2);
  ctx.lineTo(layerX + 380, startY + layerH + gap + layerH / 2);
  ctx.lineTo(layerX + 510, startY + (layerH + gap) * 2 + layerH / 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Bottom Telemetry Footer
  const barY = topY + cardH - 64;
  drawRoundRect(ctx, cardX + 32, barY, cardW - 64, 44, 10, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText = slide.diagramFooter || 'SEARCH COMPLEXITY: O(log N) • SKIP-LIST GRAPH NAVIGATION • LOW LATENCY';
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 100, 20, '"JetBrains Mono", monospace', '700', {
    minFontSize: 15,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 22);
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
  const cardH = 490;
  const radius = 28;

  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Line & Header Tag
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();

  drawRoundRect(ctx, cardX + 32, topY + 22, 420, 40, 10, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('IVF CLUSTERING // K-MEANS SPACE PARTITIONING', cardX + 32 + 210, topY + 42);
  ctx.restore();

  // 3 Cluster Partition Cards
  const clusterW = 246;
  const clusterH = 280;
  const clusterY = topY + 80;
  const gap = 36;

  const clusters = [
    {
      x: cardX + 32,
      name: 'CLUSTER A',
      status: 'PRUNED',
      statusColor: '#64748B',
      detail: 'Distant Centroid\n100k Vectors Skipped',
      active: false,
    },
    {
      x: cardX + 32 + clusterW + gap,
      name: 'CLUSTER B (TARGET)',
      status: 'ACTIVE CENTROID',
      statusColor: '#10B981',
      detail: 'Nearest Centroid\nScanning Inverted List',
      active: true,
    },
    {
      x: cardX + 32 + (clusterW + gap) * 2,
      name: 'CLUSTER C',
      status: 'PRUNED',
      statusColor: '#64748B',
      detail: 'Distant Centroid\n100k Vectors Skipped',
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
    const cy = clusterY + 68;

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

    // Cluster Name
    ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = c.active ? '#FFFFFF' : '#94A3B8';
    ctx.textAlign = 'center';
    ctx.fillText(c.name, cx, clusterY + 138);

    // Status Pill
    const pillW = 160;
    const pillH = 34;
    drawRoundRect(ctx, cx - pillW / 2, clusterY + 158, pillW, pillH, 8, `${c.statusColor}22`, c.statusColor, 1.2);
    ctx.font = '700 15px "JetBrains Mono", monospace';
    ctx.fillStyle = c.statusColor;
    ctx.textBaseline = 'middle';
    ctx.fillText(c.status, cx, clusterY + 158 + pillH / 2);

    // Explanatory detail lines
    ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = c.active ? '#E2E8F0' : '#64748B';
    const lines = c.detail.split('\n');
    ctx.fillText(lines[0] || '', cx, clusterY + 226);
    if (lines[1]) ctx.fillText(lines[1], cx, clusterY + 252);

    ctx.restore();
  }

  // Bottom Telemetry Footer
  const barY = topY + cardH - 64;
  drawRoundRect(ctx, cardX + 32, barY, cardW - 64, 44, 10, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText = slide.diagramFooter || 'SEARCH SPACE PRUNED: 80% • QUERY BOUNDED TO CANDIDATE CLUSTERS ONLY';
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 100, 20, '"JetBrains Mono", monospace', '700', {
    minFontSize: 15,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 22);
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
  const cardH = 490;
  const radius = 28;

  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Line & Header Tag
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();

  drawRoundRect(ctx, cardX + 32, topY + 22, 420, 40, 10, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WRITE ARCHITECTURE // HOT BUFFER & COLD INDEX', cardX + 32 + 210, topY + 42);
  ctx.restore();

  // Left & Right Store Cards
  const storeW = 340;
  const storeH = 280;
  const storeY = topY + 80;
  const lx = cardX + 32;
  const rx = cardX + cardW - 32 - storeW;

  // Left: HOT STORE
  drawRoundRect(ctx, lx, storeY, storeW, storeH, 18, '#0b161b', `${theme.accent}65`, 1.8);
  ctx.save();
  drawRoundRect(ctx, lx + 20, storeY + 20, 56, 56, 12, `${theme.accent}20`, theme.accent, 1.5);
  const zapImg = await loadIconImage('zap', theme.accent);
  safeDrawImage(ctx, zapImg, lx + 30, storeY + 30, 36, 36);

  ctx.font = '800 26px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText('HOT STORE', lx + 90, storeY + 46);

  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.fillText('RAM WRITE BUFFER', lx + 90, storeY + 70);

  ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('• Immediate vector inserts', lx + 20, storeY + 124);
  ctx.fillText('• Zero lock contention', lx + 20, storeY + 160);
  ctx.fillText('• High-throughput append', lx + 20, storeY + 196);

  drawRoundRect(ctx, lx + 20, storeY + storeH - 48, 160, 32, 6, `${theme.accent}25`, theme.accent, 1);
  ctx.font = '700 15px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.fillText('[ FAST WRITES ]', lx + 100, storeY + storeH - 28);
  ctx.restore();

  // Right: COLD STORE
  drawRoundRect(ctx, rx, storeY, storeW, storeH, 18, '#0b161b', '#10B98165', 1.8);
  ctx.save();
  drawRoundRect(ctx, rx + 20, storeY + 20, 56, 56, 12, 'rgba(16, 185, 129, 0.20)', '#10B981', 1.5);
  const dbImg = await loadIconImage('database', '#10B981');
  safeDrawImage(ctx, dbImg, rx + 30, storeY + 30, 36, 36);

  ctx.font = '800 26px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText('COLD STORE', rx + 90, storeY + 46);

  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillStyle = '#34D399';
  ctx.fillText('IMMUTABLE HNSW INDEX', rx + 90, storeY + 70);

  ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText('• Read-optimized graph', rx + 20, storeY + 124);
  ctx.fillText('• Compressed segments', rx + 20, storeY + 160);
  ctx.fillText('• High recall accuracy', rx + 20, storeY + 196);

  drawRoundRect(ctx, rx + 20, storeY + storeH - 48, 160, 32, 6, 'rgba(16, 185, 129, 0.25)', '#10B981', 1);
  ctx.font = '700 15px "JetBrains Mono", monospace';
  ctx.fillStyle = '#34D399';
  ctx.textAlign = 'center';
  ctx.fillText('[ OPTIMIZED READS ]', rx + 100, storeY + storeH - 28);
  ctx.restore();

  // Center Sync Connector
  const midX = (lx + storeW + rx) / 2;
  const midY = storeY + storeH / 2;
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = '#FBBF24';
  ctx.lineWidth = 3;
  ctx.moveTo(lx + storeW + 8, midY);
  ctx.lineTo(rx - 8, midY);
  ctx.stroke();

  // Arrowhead pointing to Cold Store
  ctx.fillStyle = '#FBBF24';
  ctx.beginPath();
  ctx.moveTo(rx - 4, midY);
  ctx.lineTo(rx - 14, midY - 8);
  ctx.lineTo(rx - 14, midY + 8);
  ctx.closePath();
  ctx.fill();

  // Center Badge
  drawRoundRect(ctx, midX - 55, midY - 32, 110, 64, 8, '#04080a', '#FBBF24', 1.2);
  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#FBBF24';
  ctx.textAlign = 'center';
  ctx.fillText('ASYNC', midX, midY - 10);
  ctx.fillText('COMPACT', midX, midY + 8);
  ctx.fillText('➔', midX, midY + 24);
  ctx.restore();

  // Bottom Telemetry Footer
  const barY = topY + cardH - 64;
  drawRoundRect(ctx, cardX + 32, barY, cardW - 64, 44, 10, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText = slide.diagramFooter || 'WRITES: BUFFERED IN RAM • INDEX REBUILD: ASYNCHRONOUS BACKGROUND FLUSH';
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 100, 20, '"JetBrains Mono", monospace', '700', {
    minFontSize: 15,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 22);
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
  const cardH = 490;
  const radius = 28;

  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Line & Header Tag
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();

  drawRoundRect(ctx, cardX + 32, topY + 22, 400, 40, 10, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ARCHITECTURAL PRINCIPLES // OVERVIEW', cardX + 32 + 200, topY + 42);
  ctx.restore();

  const nodeW = 246;
  const nodeH = 280;
  const nodeY = topY + 80;
  const gap = 36;

  const derived = deriveDynamicSlideNodes(slide);

  for (let i = 0; i < 3; i++) {
    const nd = derived[i];
    const nx = cardX + 32 + i * (nodeW + gap);

    drawRoundRect(ctx, nx, nodeY, nodeW, nodeH, 18, '#0b1319', `${theme.accent}50`, 1.5);

    // Large 60x60 icon badge
    drawRoundRect(ctx, nx + 20, nodeY + 20, 60, 60, 14, `${theme.accent}20`, theme.accent, 1.5);
    const img = await loadIconImage(nd.icon, theme.accent);
    safeDrawImage(ctx, img, nx + 32, nodeY + 32, 36, 36);

    // Card Index
    ctx.save();
    ctx.font = '800 18px "JetBrains Mono", monospace';
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'right';
    ctx.fillText(`0${i + 1}`, nx + nodeW - 20, nodeY + 42);

    // Title (bold 28px)
    const fitTitle = fitTextInBox(ctx, nd.label, nodeW - 40, 28, '"Plus Jakarta Sans", sans-serif', '800', {
      minFontSize: 22,
      maxLines: 2,
    });
    ctx.font = `800 ${fitTitle.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    ctx.fillText(fitTitle.lines[0] || nd.label, nx + 20, nodeY + 120);
    if (fitTitle.lines[1]) {
      ctx.fillText(fitTitle.lines[1], nx + 20, nodeY + 120 + fitTitle.lineHeight);
    }

    // Sublabel (22px in #E2E8F0)
    const fitSub = fitTextInBox(ctx, nd.sublabel, nodeW - 40, 22, '"Plus Jakarta Sans", sans-serif', '600', {
      minFontSize: 18,
      maxLines: 2,
    });
    ctx.font = `600 ${fitSub.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#E2E8F0';
    const subY = fitTitle.lines.length <= 1 ? nodeY + 164 : nodeY + 176;
    ctx.fillText(fitSub.lines[0] || nd.sublabel, nx + 20, subY);
    if (fitSub.lines[1]) {
      ctx.fillText(fitSub.lines[1], nx + 20, subY + fitSub.lineHeight);
    }

    // Status Pill
    const pillW = 140;
    const pillH = 34;
    drawRoundRect(ctx, nx + 20, nodeY + nodeH - 46, pillW, pillH, 8, `${theme.accent}20`, theme.accent, 1);
    ctx.font = '700 15px "JetBrains Mono", monospace';
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'center';
    ctx.fillText(`[ ${nd.status} ]`, nx + 20 + pillW / 2, nodeY + nodeH - 25);
    ctx.restore();
  }

  // Bottom Telemetry Footer
  const barY = topY + cardH - 64;
  drawRoundRect(ctx, cardX + 32, barY, cardW - 64, 44, 10, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText = slide.diagramFooter || 'ARCHITECTURAL PATTERNS • VERIFIED IN PRODUCTION DEPLOYMENTS';
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 100, 20, '"JetBrains Mono", monospace', '700', {
    minFontSize: 15,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 22);
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
  const cardH = 490;
  const radius = 28;

  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Line & Header Tag
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();

  drawRoundRect(ctx, cardX + 32, topY + 22, 420, 40, 10, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FAULT ISOLATION // COMPONENT BOUNDARY', cardX + 32 + 210, topY + 42);
  ctx.restore();

  const cellW = 246;
  const cellH = 280;
  const cellY = topY + 80;
  const gap = 36;

  const derived = deriveDynamicSlideNodes(slide);

  for (let i = 0; i < 3; i++) {
    const nd = derived[i];
    const cx = cardX + 32 + i * (cellW + gap);
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
      cx + 18,
      cellY + 18,
      56,
      56,
      14,
      isQuarantined ? 'rgba(239, 68, 68, 0.20)' : `${theme.accent}20`,
      isQuarantined ? '#EF4444' : theme.accent,
      1.2
    );
    const img = await loadIconImage(isQuarantined ? 'shieldAlert' : nd.icon, isQuarantined ? '#EF4444' : theme.accent);
    safeDrawImage(ctx, img, cx + 28, cellY + 28, 36, 36);

    ctx.save();
    ctx.font = '700 16px "JetBrains Mono", monospace';
    ctx.fillStyle = isQuarantined ? '#EF4444' : theme.accent;
    ctx.textAlign = 'left';
    ctx.fillText(isQuarantined ? 'RESTRICTED' : 'SECURED', cx + 86, cellY + 44);

    const fitTitle = fitTextInBox(ctx, nd.label, cellW - 32, 28, '"Plus Jakarta Sans", sans-serif', '800', {
      minFontSize: 22,
      maxLines: 2,
    });
    ctx.font = `800 ${fitTitle.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(fitTitle.lines[0] || nd.label, cx + 18, cellY + 118);
    if (fitTitle.lines[1]) {
      ctx.fillText(fitTitle.lines[1], cx + 18, cellY + 118 + fitTitle.lineHeight);
    }

    const fitSub = fitTextInBox(ctx, nd.sublabel, cellW - 32, 22, '"Plus Jakarta Sans", sans-serif', '600', {
      minFontSize: 18,
      maxLines: 2,
    });
    ctx.font = `600 ${fitSub.fontSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#E2E8F0';
    const subY = fitTitle.lines.length <= 1 ? cellY + 164 : cellY + 176;
    ctx.fillText(fitSub.lines[0] || nd.sublabel, cx + 18, subY);
    if (fitSub.lines[1]) {
      ctx.fillText(fitSub.lines[1], cx + 18, subY + fitSub.lineHeight);
    }

    const pillW = 140;
    const pillH = 34;
    drawRoundRect(
      ctx,
      cx + 18,
      cellY + cellH - 46,
      pillW,
      pillH,
      8,
      isQuarantined ? 'rgba(239, 68, 68, 0.20)' : `${theme.accent}20`,
      isQuarantined ? '#EF4444' : theme.accent,
      1
    );
    ctx.font = '700 15px "JetBrains Mono", monospace';
    ctx.fillStyle = isQuarantined ? '#F87171' : theme.accent;
    ctx.textAlign = 'center';
    ctx.fillText(isQuarantined ? '[ ISOLATED ]' : '[ VERIFIED ]', cx + 18 + pillW / 2, cellY + cellH - 25);
    ctx.restore();
  }

  // Bottom Telemetry Footer
  const barY = topY + cardH - 64;
  drawRoundRect(ctx, cardX + 32, barY, cardW - 64, 44, 10, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText = slide.diagramFooter || 'FAULT DOMAIN ISOLATED • LATERAL MOVEMENT: 0% SUCCESS RATE';
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 100, 20, '"JetBrains Mono", monospace', '700', {
    minFontSize: 15,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 22);
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
  const cardH = 490;
  const radius = 28;

  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Line & Header Tag
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();

  drawRoundRect(ctx, cardX + 32, topY + 22, 400, 40, 10, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ARCHITECTURE // THREE-TIER STACK', cardX + 32 + 200, topY + 42);
  ctx.restore();

  const tierW = cardW - 64;
  const tierH = 92;
  const startTierY = topY + 76;
  const gap = 16;
  const derived = deriveDynamicSlideNodes(slide);

  for (let i = 0; i < 3; i++) {
    const nd = derived[i];
    const ty = startTierY + i * (tierH + gap);

    drawRoundRect(ctx, cardX + 32, ty, tierW, tierH, 14, '#0b1319', `${theme.accent}55`, 1.5);

    // Icon Badge (56x56)
    drawRoundRect(ctx, cardX + 48, ty + 18, 56, 56, 12, `${theme.accent}20`, theme.accent, 1.2);
    const img = await loadIconImage(nd.icon, theme.accent);
    safeDrawImage(ctx, img, cardX + 58, ty + 28, 36, 36);

    ctx.save();
    // Layer Tag
    ctx.font = '700 16px "JetBrains Mono", monospace';
    ctx.fillStyle = theme.accent;
    ctx.textAlign = 'left';
    ctx.fillText(`TIER 0${i + 1} // ${nd.status}`, cardX + 120, ty + 36);

    // Layer Title (bold 26px)
    ctx.font = '800 26px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(nd.label, cardX + 120, ty + 68);

    // Layer Sublabel (22px in #E2E8F0)
    ctx.font = '600 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#E2E8F0';
    ctx.textAlign = 'right';
    ctx.fillText(nd.sublabel, cardX + tierW + 16, ty + 54);
    ctx.restore();
  }

  // Bottom Telemetry Footer
  const barY = topY + cardH - 64;
  drawRoundRect(ctx, cardX + 32, barY, cardW - 64, 44, 10, '#04080a', `${theme.accent}35`, 1);

  ctx.save();
  const footerText = slide.diagramFooter || 'END-TO-END SYSTEM PIPELINE ACROSS ALL ARCHITECTURAL TIERS';
  const fitFooter = fitTextInBox(ctx, footerText, cardW - 100, 20, '"JetBrains Mono", monospace', '700', {
    minFontSize: 15,
  });
  ctx.font = `700 ${fitFooter.fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitFooter.lines[0] || footerText, cardX + cardW / 2, barY + 22);
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
  const cardH = 490;
  const radius = 28;

  drawRoundRect(ctx, cardX, topY, cardW, cardH, radius, '#060a0d', `${theme.accent}45`, 2);

  // Top Neon Line & Header Tag
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX + radius + 10, topY);
  ctx.lineTo(cardX + cardW - radius - 10, topY);
  ctx.stroke();

  drawRoundRect(ctx, cardX + 32, topY + 22, 400, 40, 10, `${theme.accent}18`, `${theme.accent}50`, 1.2);
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ARCHITECTURAL PRINCIPLE // THE TRADE-OFF', cardX + 32 + 200, topY + 42);
  ctx.restore();

  // Highlighted Principle Block
  const blockW = cardW - 64;
  const blockH = 170;
  const blockX = cardX + 32;
  const blockY = topY + 76;

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

  const cleanBody = slide.enBody || 'Decoupled architectural components eliminate system bottlenecks and lock-in.';
  const fitBody = fitTextInBox(ctx, cleanBody, blockW - 110, 22, '"Plus Jakarta Sans", sans-serif', '400', {
    minFontSize: 18,
    maxLines: 2,
  });
  ctx.font = `400 ${fitBody.fontSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#CBD5E1';
  ctx.fillText(fitBody.lines[0] || cleanBody, blockX + 100, blockY + 118);
  if (fitBody.lines[1]) {
    ctx.fillText(fitBody.lines[1], blockX + 100, blockY + 118 + fitBody.lineHeight);
  }
  ctx.restore();

  // 2 Comparative Sub-Cards at bottom
  const subW = (blockW - 20) / 2;
  const subH = 150;
  const subY = blockY + blockH + 18;

  // Sub-card 1: Critical Constraint
  drawRoundRect(ctx, blockX, subY, subW, subH, 14, 'rgba(245, 158, 11, 0.08)', 'rgba(245, 158, 11, 0.40)', 1.2);
  ctx.save();
  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillStyle = '#FBBF24';
  ctx.textAlign = 'left';
  ctx.fillText('⚠️ CRITICAL CONSTRAINT', blockX + 18, subY + 36);

  const c1Text1 = slide.diagramNodes?.[1]?.label ? `Beware of ${slide.diagramNodes[1].label.toLowerCase()}` : 'Profile production load and avoid premature';
  const c1Text2 = slide.diagramNodes?.[1]?.sublabel || 'abstractions that bloat system memory.';
  const fitC1Text1 = fitTextInBox(ctx, c1Text1, subW - 36, 20, '"Plus Jakarta Sans", sans-serif', '600', { minFontSize: 16 });
  const fitC1Text2 = fitTextInBox(ctx, c1Text2, subW - 36, 18, '"Plus Jakarta Sans", sans-serif', '400', { minFontSize: 15 });

  ctx.font = `600 ${fitC1Text1.fontSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(fitC1Text1.lines[0] || c1Text1, blockX + 18, subY + 74);
  ctx.font = `400 ${fitC1Text2.fontSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(fitC1Text2.lines[0] || c1Text2, blockX + 18, subY + 106);
  ctx.restore();

  // Sub-card 2: Production Best Practice
  drawRoundRect(ctx, blockX + subW + 20, subY, subW, subH, 14, 'rgba(16, 185, 129, 0.08)', 'rgba(16, 185, 129, 0.40)', 1.2);
  ctx.save();
  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillStyle = '#34D399';
  ctx.textAlign = 'left';
  ctx.fillText('✔ PRODUCTION STANDARD', blockX + subW + 38, subY + 36);

  const c2Text1 = slide.diagramNodes?.[2]?.label ? `Adopt ${slide.diagramNodes[2].label.toLowerCase()}` : 'Decouple core processing from storage';
  const c2Text2 = slide.diagramNodes?.[2]?.sublabel || 'to maintain predictable sub-second p99.';
  const fitC2Text1 = fitTextInBox(ctx, c2Text1, subW - 36, 20, '"Plus Jakarta Sans", sans-serif', '600', { minFontSize: 16 });
  const fitC2Text2 = fitTextInBox(ctx, c2Text2, subW - 36, 18, '"Plus Jakarta Sans", sans-serif', '400', { minFontSize: 15 });

  ctx.font = `600 ${fitC2Text1.fontSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(fitC2Text1.lines[0] || c2Text1, blockX + subW + 38, subY + 74);
  ctx.font = `400 ${fitC2Text2.fontSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(fitC2Text2.lines[0] || c2Text2, blockX + subW + 38, subY + 106);
  ctx.restore();

  return topY + cardH;
}
