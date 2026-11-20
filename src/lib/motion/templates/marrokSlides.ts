import {
  MotionBrandConfig,
  MotionSceneConfig,
  MotionTemplateConfig,
  MotionTemplateMeta,
} from '../../../types.ts';
import { drawMarrokVectorBadge } from '../../icons.ts';
import {
  DEFAULT_BRAND,
  clamp,
  spring,
  wrapHTML,
  MotionTemplateDefinition,
} from '../base.ts';
import {
  SAFE_LEFT,
  SAFE_WIDTH,
  SAFE_CENTER_X,
  hexToRgba,
  drawMarrokReelBackground,
  drawMarrokReelHeader,
  drawMarrokReelFooter,
  drawMarrokSurfaceCard,
  drawAnimatedBilingualSlideCopy,
} from '../marrokSlideChrome.ts';
import {
  computeSceneTransitionState,
  renderWithTransitionLayer,
} from '../transitions.ts';

const meta: MotionTemplateMeta = {
  id: 'marrok-slides',
  name: 'MARROK Slide Deck',
  description:
    'Animates your full MARROK bilingual slides with the authentic vector logo badge, orbital hub schematics, live code terminals, metric sparklines, and spring typography.',
  category: 'Signature MARROK Format',
  tags: ['Bilingual EN/AR', 'MARROK Logo', 'Slide Schematics', 'Full Deck'],
};

function defaultConfig(brandOverride?: Partial<MotionBrandConfig>): MotionTemplateConfig {
  const brand: MotionBrandConfig = {
    ...DEFAULT_BRAND,
    ...brandOverride,
  };
  return {
    brand,
    duration: 22.5,
    category: 'AI + SECURITY',
    scenes: [
      {
        id: 'scene-1',
        label: 'Slide 01 · Hub Hook',
        text: 'WHY LEGACY KERNELS FAIL',
        enTitle: 'WHY LEGACY KERNELS FAIL UNDER AI WORKLOADS.',
        arTitle: 'لماذا تفشل الأنظمة التقليدية أمام نماذج الذكاء الاصطناعي؟',
        enBody: 'Traditional monolithic memory spaces expose critical attack surfaces during high-throughput inference.',
        arBody: 'الذاكرة المشتركة التقليدية تفتح ثغرات خطيرة أثناء معالجة البيانات الضخمة.',
        slideType: 'hub',
        stepNumber: '01',
        nodes: ['KERNEL', 'ZERO-TRUST', 'SANDBOX', 'TELEMETRY'],
        from: 0,
        to: 4.5,
        springK: 220,
        springD: 20,
      },
      {
        id: 'scene-2',
        label: 'Slide 02 · Architecture',
        text: 'MICRO-VM ISOLATION PIPELINE',
        enTitle: 'THE SOLUTION: HARDWARE MICRO-VM ISOLATION.',
        arTitle: 'عزل فوري عبر الحاويات المصغرة المعزولة عتادياً',
        enBody: 'Every execution context spawns inside a dedicated hypervisor boundary in under 5 milliseconds.',
        arBody: 'كل عملية تعمل داخل بيئة افتراضية معزولة تماماً خلال أجزاء من الثانية.',
        slideType: 'row',
        stepNumber: '02',
        nodes: ['INGEST', 'HYPERVISOR', 'ENCLAVE'],
        from: 4.5,
        to: 9.0,
        springK: 210,
        springD: 22,
      },
      {
        id: 'scene-3',
        label: 'Slide 03 · Live Code',
        text: 'ZERO-COPY POLICY VERIFICATION',
        enTitle: 'RUNTIME CHECK: CRYPTOGRAPHIC ATTESTATION.',
        arTitle: 'التحقق التشفيري الفوري قبل تنفيذ أي تعليمة',
        enBody: 'eBPF probes inspect syscalls at line rate without context-switching overhead.',
        arBody: 'فحص استدعاءات النظام في الوقت الفعلي دون أي تباطؤ في الأداء.',
        slideType: 'code',
        stepNumber: '03',
        codeSnippet:
          '$ marrok-ctl enclave verify --strict\n[OK] attestation_hash: 0x9f4a..e81c\n[OK] seccomp_bpf: 0 violations\n> status: ENFORCED (0.18ms)',
        from: 9.0,
        to: 13.5,
        springK: 210,
        springD: 22,
      },
      {
        id: 'scene-4',
        label: 'Slide 04 · Benchmark',
        text: '200x',
        enTitle: 'BENCHMARK: 200X FASTER CONTAINMENT.',
        arTitle: 'أسرع بـ 200 مرة في عزل التهديدات السيبرانية',
        enBody: 'Sub-millisecond sandbox teardown eliminates lateral movement across cluster nodes.',
        arBody: 'إغلاق فوري للبيئات المخترقة يمنع انتشار الهجوم داخل الشبكة.',
        slideType: 'metric',
        stepNumber: '04',
        metricValue: '200x',
        metricLabel: 'THROUGHPUT & ISOLATION GAIN',
        from: 13.5,
        to: 18.0,
        springK: 240,
        springD: 18,
      },
      {
        id: 'scene-5',
        label: 'Slide 05 · CTA Lockup',
        text: 'FOLLOW @MARROK',
        enTitle: 'SAVE THIS BREAKDOWN & FOLLOW FOR MORE.',
        arTitle: 'احفظ المنشور وتابعنا للمزيد من التحليلات الهندسية',
        enBody: 'Deep systems architecture, cybersecurity, and AI infrastructure every week.',
        arBody: 'شروحات معمقة في هندسة الأنظمة والأمن السيبراني والذكاء الاصطناعي.',
        slideType: 'cta',
        stepNumber: '05',
        ctaText: 'FOLLOW @MARROK',
        from: 18.0,
        to: 22.5,
        springK: 220,
        springD: 20,
      },
    ],
  };
}

const DIAGRAM_CARD_Y = 216;
const DIAGRAM_CARD_H = 640;

function drawAnimatedSlideArchetypeContent(
  ctx: CanvasRenderingContext2D,
  scene: MotionSceneConfig,
  brand: MotionBrandConfig,
  t: number
): void {
  const accent = brand.accentColor || '#6EA0FF';

  const cardX = SAFE_LEFT;
  const cardY = DIAGRAM_CARD_Y;
  const cardW = SAFE_WIDTH;
  const cardH = DIAGRAM_CARD_H;

  const slideType = scene.slideType || 'hub';
  const innerCenterX = SAFE_CENTER_X;
  const innerCenterY = cardY + cardH / 2;

  ctx.save();
  ctx.direction = 'ltr';
  ctx.textBaseline = 'middle';

  if (slideType === 'hub') {
    // Orbital Hub Diagram with central MARROK Vector Badge + 4 satellite nodes
    const nodes =
      scene.nodes && scene.nodes.length >= 2
        ? scene.nodes.slice(0, 4)
        : ['KERNEL', 'ZERO-TRUST', 'SANDBOX', 'TELEMETRY'];

    // Outer & inner orbital rings scaled for 640px diagram card
    const ringS = clamp(t / 0.22, 0, 1);
    const ringEase = 1 - Math.pow(1 - ringS, 3);
    ctx.save();
    ctx.strokeStyle = hexToRgba(accent, 0.25);
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.ellipse(innerCenterX, innerCenterY, 305 * ringEase, 195 * ringEase, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = hexToRgba(accent, 0.4);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(innerCenterX, innerCenterY, 92 * ringEase, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const offsets = [
      { dx: -270, dy: -145 },
      { dx: 270, dy: -145 },
      { dx: -270, dy: 145 },
      { dx: 270, dy: 145 },
    ];

    // Connecting lines & animated data packets
    nodes.forEach((nodeLabel, idx) => {
      const off = offsets[idx % offsets.length];
      const rawNode = clamp((t - 0.04 - idx * 0.04) / 0.20, 0, 1);
      const ns = 1 - Math.pow(1 - rawNode, 3);
      const nx = innerCenterX + off.dx * ns;
      const ny = innerCenterY + off.dy * ns;

      ctx.save();
      ctx.globalAlpha = ns;
      ctx.strokeStyle = hexToRgba(accent, 0.45);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(innerCenterX, innerCenterY);
      ctx.lineTo(nx, ny);
      ctx.stroke();

      // Animated data pulse traveling outward along the edge
      const pulseFrac = ((t * 0.85 + idx * 0.25) % 1 + 1) % 1;
      const px = innerCenterX + (nx - innerCenterX) * pulseFrac;
      const py = innerCenterY + (ny - innerCenterY) * pulseFrac;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fill();

      // Satellite Node Pill
      const pillW = 216;
      const pillH = 68;
      ctx.fillStyle = '#0D0E16';
      ctx.strokeStyle = hexToRgba(accent, 0.75);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(nx - pillW / 2, ny - pillH / 2, pillW, pillH, 16);
      ctx.fill();
      ctx.stroke();

      ctx.font = '800 24px "JetBrains Mono", "Plus Jakarta Sans", monospace';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText(nodeLabel.slice(0, 14).toUpperCase(), nx, ny, pillW - 24);
      ctx.restore();
    });

    // Central MARROK Vector Logo Hub Core
    const coreScale = spring(t, 240, 22);
    const coreSize = Math.max(32, 116 * coreScale);
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 26;
    drawMarrokVectorBadge(ctx, innerCenterX, innerCenterY, coreSize, accent, '#0B0C12');
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(
      innerCenterX - coreSize / 2,
      innerCenterY - coreSize / 2,
      coreSize,
      coreSize,
      coreSize * 0.22
    );
    ctx.stroke();
    ctx.restore();
  } else if (slideType === 'metric') {
    // Giant Animated Metric Counter + Sparkline Curve + Benchmark Gauge inside 640px card
    const rawMetric = (scene.metricValue || scene.text || '200x').trim();
    const numMatch = rawMetric.match(/^([<>~]?\s*)(\d+(?:\.\d+)?)(.*)$/);
    const s = clamp(1 - Math.pow(1 - clamp(t / 0.25, 0, 1), 3), 0, 1);

    let displayMetric = rawMetric;
    if (numMatch) {
      const prefix = numMatch[1] || '';
      const targetVal = parseFloat(numMatch[2]);
      const suffix = numMatch[3] || '';
      const hasDecimal = numMatch[2].includes('.');
      const animatedVal = targetVal * s;
      displayMetric = `${prefix}${hasDecimal ? animatedVal.toFixed(1) : Math.round(animatedVal)}${suffix}`;
    }

    // Background sparkline curve inside 640px card
    ctx.save();
    const sparkPoints = [
      { x: cardX + 60, y: cardY + 510 },
      { x: cardX + 220, y: cardY + 470 },
      { x: cardX + 380, y: cardY + 410 },
      { x: cardX + 540, y: cardY + 325 },
      { x: cardX + 700, y: cardY + 220 },
      { x: cardX + 800, y: cardY + 135 },
    ];
    ctx.strokeStyle = hexToRgba(accent, 0.35);
    ctx.lineWidth = 4;
    ctx.beginPath();
    sparkPoints.forEach((pt, idx) => {
      const py = cardY + 530 - (cardY + 530 - pt.y) * clamp(spring(t - idx * 0.04, 180, 22), 0, 1);
      if (idx === 0) ctx.moveTo(pt.x, py);
      else ctx.lineTo(pt.x, py);
    });
    ctx.stroke();

    sparkPoints.forEach((pt, idx) => {
      const py = cardY + 530 - (cardY + 530 - pt.y) * clamp(spring(t - idx * 0.04, 180, 22), 0, 1);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(pt.x, py, 6.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // Big Metric Value
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 28;
    ctx.fillStyle = accent;
    ctx.font = '900 180px "Plus Jakarta Sans", "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.translate(innerCenterX, cardY + 275);
    ctx.scale(0.92 + 0.08 * s, 0.92 + 0.08 * s);
    ctx.fillText(displayMetric, 0, 0, cardW - 80);
    ctx.restore();

    // Metric Label & Progress Gauge Bar
    const metricLabel = (
      scene.metricLabel ||
      scene.enTitle ||
      'VERIFIED BENCHMARK GAIN'
    ).toUpperCase();
    ctx.font = '800 28px "JetBrains Mono", "Plus Jakarta Sans", monospace';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(metricLabel, innerCenterX, cardY + 435, cardW - 90);

    const barW = cardW - 140;
    const barX = cardX + 70;
    const barY = cardY + 510;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, 20, 10);
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * clamp(s, 0.08, 0.92), 20, 10);
    ctx.fill();
  } else if (slideType === 'code') {
    // Live Terminal Code Card inside 640px frame
    const termX = cardX + 36;
    const termY = cardY + 54;
    const termW = cardW - 72;
    const termH = 532;

    ctx.fillStyle = '#08090F';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(termX, termY, termW, termH, 18);
    ctx.fill();
    ctx.stroke();

    // macOS window dots
    const dotColors = ['#FF5F56', '#FFBD2E', '#27C93F'];
    dotColors.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(termX + 28 + i * 24, termY + 28, 7, 0, Math.PI * 2);
      ctx.fill();
    });

    const rawCode =
      scene.codeSnippet ||
      `$ marrok-ctl verify --zero-trust\n[OK] kernel_isolation: ACTIVE\n[OK] attestation_latency: 0.14ms\n> status: VERIFIED_SAFE`;
    const codeLines = rawCode.split('\n').slice(0, 7);

    ctx.font = '600 28px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    codeLines.forEach((line, idx) => {
      const lt = t - 0.04 - idx * 0.06;
      if (lt <= 0) return;
      const charCount = Math.floor(clamp(lt * 4.5, 0, 1) * line.length);
      const visibleText = line.slice(0, charCount);
      const ly = termY + 104 + idx * 62;

      if (line.startsWith('$') || line.startsWith('>')) {
        ctx.fillStyle = accent;
      } else if (line.includes('[OK]') || line.includes('✔') || line.includes('VERIFIED')) {
        ctx.fillStyle = '#34D399';
      } else {
        ctx.fillStyle = '#F1F5F9';
      }
      ctx.fillText(visibleText, termX + 36, ly, termW - 72);
    });
  } else if (slideType === 'cta') {
    // Signature MARROK CTA Card with large Vector Badge & Follow Lockup inside 640px frame
    const badgeScale = spring(t, 220, 20);
    const badgeSize = Math.max(36, 148 * badgeScale);

    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 32;
    drawMarrokVectorBadge(ctx, innerCenterX, cardY + 205, badgeSize, accent, '#0B0C12');
    ctx.restore();

    const ctaBtnS = clamp(1 - Math.pow(1 - clamp((t - 0.06) / 0.20, 0, 1), 3), 0.2, 1);
    const btnW = 580 * ctaBtnS;
    const btnH = 88;
    const btnX = innerCenterX - btnW / 2;
    const btnY = cardY + 350;

    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 20;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, 20);
    ctx.fill();
    ctx.restore();

    ctx.font = '800 32px "Plus Jakarta Sans", "Outfit", sans-serif';
    ctx.fillStyle = '#080A12';
    ctx.textAlign = 'center';
    const ctaLabel = (scene.ctaText || `FOLLOW @${(brand.name || 'MARROK').toUpperCase()}`).toUpperCase();
    ctx.fillText(ctaLabel, innerCenterX, btnY + btnH / 2, btnW - 36);

    ctx.font = '700 24px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.fillText('SAVE · SHARE · SYSTEM ARCHITECTURE', innerCenterX, cardY + 510);
  } else {
    // Default Body Slide ('row' | 'number' | 'compare'): 3-Stage Technical Pipeline Schematic inside 640px frame
    const rawNodes =
      scene.nodes && scene.nodes.length >= 2
        ? scene.nodes.slice(0, 3)
        : ['INGESTION', 'ISOLATION', 'VERIFIED'];

    const boxW = 236;
    const boxH = 220;
    const gap = 42;
    const totalW = rawNodes.length * boxW + (rawNodes.length - 1) * gap;
    const startX = innerCenterX - totalW / 2;
    const boxY = innerCenterY - boxH / 2;

    rawNodes.forEach((nodeTitle, idx) => {
      const rawNode = clamp((t - idx * 0.05) / 0.20, 0, 1);
      const ns = 1 - Math.pow(1 - rawNode, 3);
      const bx = startX + idx * (boxW + gap);
      const by = boxY + (1 - ns) * 20;

      // Connector arrow to next node
      if (idx < rawNodes.length - 1) {
        const lineX1 = bx + boxW;
        const lineX2 = bx + boxW + gap;
        const lineY = boxY + boxH / 2;
        ctx.strokeStyle = hexToRgba(accent, 0.55);
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(lineX1, lineY);
        ctx.lineTo(lineX2, lineY);
        ctx.stroke();

        // Moving pulse dot on connector
        const pulseX = lineX1 + ((t * 1.4 + idx * 0.3) % 1) * gap;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(pulseX, lineY, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.save();
      ctx.globalAlpha = ns;
      ctx.fillStyle = idx === rawNodes.length - 1 ? hexToRgba(accent, 0.16) : '#0C0E16';
      ctx.strokeStyle = idx === rawNodes.length - 1 ? accent : 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 20);
      ctx.fill();
      ctx.stroke();

      // Node step badge
      ctx.font = '800 22px "JetBrains Mono", monospace';
      ctx.fillStyle = accent;
      ctx.textAlign = 'center';
      ctx.fillText(`0${idx + 1}`, bx + boxW / 2, by + 64);

      // Node label
      ctx.font = '800 28px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(nodeTitle.slice(0, 13).toUpperCase(), bx + boxW / 2, by + 132, boxW - 24);
      ctx.restore();
    });
  }

  ctx.restore();
}

export function drawMarrokSlidesFrame(
  g: CanvasRenderingContext2D,
  config: MotionTemplateConfig,
  globalTime: number
): void {
  const b: MotionBrandConfig = { ...DEFAULT_BRAND, ...(config?.brand || {}) };
  const scenes = config?.scenes?.length ? config.scenes : defaultConfig(b).scenes;

  const transState = computeSceneTransitionState(
    scenes,
    globalTime,
    config?.defaultTransition || 'auto',
    b.direction || 'rtl'
  );

  g.save();
  // 1. Persistent MARROK Slide Background (Base + Radial Glow + 108px Grid + CAD Reticles)
  drawMarrokReelBackground(
    g,
    config,
    globalTime,
    transState.cameraPanX,
    transState.cameraZoom
  );

  // 2. Persistent MARROK Header with Vector Logo Badge + Wordmark + Category Tag
  drawMarrokReelHeader(g, config, globalTime);

  // 3. Persistent 640px Diagram Container Frame (stays on screen at 100% opacity across transitions)
  const primaryScene = transState.layers[0]?.scene || scenes[transState.activeSceneIdx] || scenes[0];
  const isPipeTakeaways =
    Boolean(primaryScene?.text && primaryScene.text.includes('|')) &&
    !primaryScene?.enBody &&
    !primaryScene?.arBody;

  if (!isPipeTakeaways) {
    drawMarrokSurfaceCard(
      g,
      SAFE_LEFT,
      DIAGRAM_CARD_Y,
      SAFE_WIDTH,
      DIAGRAM_CARD_H,
      b.accentColor,
      b.surfaceColor || '#12131C',
      b.surfaceBorder || '#252838',
      '',
      '',
      1
    );
  }

  // 4. Render Single Active Scene Content Layer (sequential 0.20s exit -> 0.30s entry, never overlapping)
  transState.layers.forEach((layer) => {
    const activeScene = layer.scene;
    renderWithTransitionLayer(g, layer, b.accentColor, (t) => {
      if (
        activeScene.text &&
        activeScene.text.includes('|') &&
        !activeScene.enBody &&
        !activeScene.arBody
      ) {
        const items = activeScene.text
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3);

        items.forEach((item, idx) => {
          const rawEase = clamp((t - idx * 0.05) / 0.18, 0, 1);
          const s = 1 - Math.pow(1 - rawEase, 3);
          const cardY = 260 + idx * 280;

          g.save();
          g.globalAlpha = s;
          g.fillStyle = '#12131C';
          g.strokeStyle = hexToRgba(b.accentColor, 0.5);
          g.lineWidth = 2;
          g.beginPath();
          g.roundRect(SAFE_LEFT, cardY + (1 - s) * 18, SAFE_WIDTH, 220, 22);
          g.fill();
          g.stroke();

          // Left accent bar
          g.fillStyle = b.accentColor;
          g.beginPath();
          g.roundRect(SAFE_LEFT, cardY + 26 + (1 - s) * 18, 6, 168 * s, 3);
          g.fill();

          // Item headline
          const isAr = /[\u0600-\u06FF]/.test(item);
          g.direction = isAr ? 'rtl' : 'ltr';
          g.textAlign = isAr ? 'right' : 'left';
          g.font = isAr
            ? '800 46px "Cairo", sans-serif'
            : '800 44px "Plus Jakarta Sans", sans-serif';
          g.fillStyle = '#FFFFFF';
          g.fillText(
            item,
            isAr ? SAFE_LEFT + SAFE_WIDTH - 36 : SAFE_LEFT + 36,
            cardY + 128 + (1 - s) * 18,
            SAFE_WIDTH - 72
          );
          g.restore();
        });
      } else {
        // Inner diagram schematic inside persistent 640px frame (y = 216..856)
        drawAnimatedSlideArchetypeContent(g, activeScene, b, t);

        // High-contrast 52px/50px Titles + 42px/44px Body Copy starting at y = 920
        drawAnimatedBilingualSlideCopy(g, activeScene, b, t, 920);
      }
    });
  });

  // 5. Persistent MARROK Attribution & Single Smooth Progress Bar Footer
  drawMarrokReelFooter(
    g,
    config,
    globalTime,
    transState.activeSceneIdx,
    scenes.length,
    transState.fractionalSceneIdx
  );

  g.restore();
}

function toHTML(config: MotionTemplateConfig): string {
  const b: MotionBrandConfig = { ...DEFAULT_BRAND, ...(config?.brand || {}) };
  const scenes = config?.scenes?.length ? config.scenes : defaultConfig(b).scenes;

  const sceneBlocks = scenes.map((sc, i) => {
    const from = sc.from ?? i * 4.5;
    const to = sc.to ?? from + 4.5;
    const k = sc.springK || 220;
    const d = sc.springD || 22;
    const enTitle = sc.enTitle || sc.label || sc.text || '';
    const arTitle = sc.arTitle || sc.text || '';
    const enBody = sc.enBody || '';
    const arBody = sc.arBody || '';

    return `  { from: ${from}, to: ${to}, draw(t) {
    const s = spring(t - 0.04, ${k}, ${d});
    g.save();
    g.fillStyle = '#12131C';
    g.strokeStyle = '${b.accentColor}';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(82, 216, 863, 640, 24);
    g.fill();
    g.stroke();
    drawMarrokVectorBadge(g, 513.5, 536, Math.max(32, 116 * s), '${b.accentColor}', '#0B0C12');

    g.direction = 'ltr';
    g.textAlign = 'left';
    g.fillStyle = '#FFFFFF';
    g.font = '800 52px "Plus Jakarta Sans", sans-serif';
    g.fillText(${JSON.stringify(enTitle.toUpperCase())}, 82, 920, 863);

    g.direction = 'rtl';
    g.textAlign = 'right';
    g.fillStyle = '${b.accentColor}';
    g.font = '800 50px "Cairo", sans-serif';
    g.fillText(${JSON.stringify(arTitle)}, 945, 1000, 863);

    if (${JSON.stringify(enBody)}) {
      g.direction = 'ltr';
      g.textAlign = 'left';
      g.fillStyle = '#F1F5F9';
      g.font = '500 42px "Plus Jakarta Sans", sans-serif';
      g.fillText(${JSON.stringify(enBody)}, 82, 1110, 863);
    }
    if (${JSON.stringify(arBody)}) {
      g.direction = 'rtl';
      g.textAlign = 'right';
      g.fillStyle = '#FFFFFF';
      g.font = '600 44px "Cairo", sans-serif';
      g.fillText(${JSON.stringify(arBody)}, 945, 1220, 863);
    }
    g.restore();
  }}`;
  });

  return wrapHTML(config, `const SCENES = [\n${sceneBlocks.join(',\n')}\n];`);
}

export const marrokSlidesTemplate: MotionTemplateDefinition = {
  meta,
  defaultConfig,
  toHTML,
  drawFrame: drawMarrokSlidesFrame,
};
