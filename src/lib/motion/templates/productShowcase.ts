import {
  MotionBrandConfig,
  MotionTemplateConfig,
  MotionTemplateMeta,
} from '../../../types.ts';
import { drawMarrokVectorBadge } from '../../icons.ts';
import {
  DEFAULT_BRAND,
  clamp,
  spring,
  rng,
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
  id: 'product-showcase',
  name: 'Architecture & Metrics',
  description:
    'Problem hook card, animated terminal UI assembly, staggered mechanism pills, and a 200x benchmark counter with MARROK slide chrome.',
  category: 'Architecture & Metrics',
  tags: ['MARROK Chrome', 'Metric Counter', 'UI Assembly', '5 Scenes'],
};

function defaultConfig(brandOverride?: Partial<MotionBrandConfig>): MotionTemplateConfig {
  const brand: MotionBrandConfig = {
    ...DEFAULT_BRAND,
    ...brandOverride,
  };
  return {
    brand,
    duration: 16,
    category: 'AI + SECURITY',
    scenes: [
      {
        id: 'scene-1',
        label: 'Problem Hook',
        text: 'عنق الزجاجة في الأداء؟',
        enTitle: 'WHY LEGACY ARCHITECTURES STALL',
        arTitle: 'عنق الزجاجة في الأداء المعماري؟',
        enBody: 'Context-switching overhead starves modern GPU & kernel pipelines.',
        arBody: 'تبديل السياق التقليدي يستهلك موارد المعالج والنواة.',
        from: 0,
        to: 3,
        springK: 240,
        springD: 20,
      },
      {
        id: 'scene-2',
        label: 'Architecture Card',
        text: 'معمارية الجيل الجديد',
        enTitle: 'NEXT-GEN ENCLAVE PIPELINE',
        arTitle: 'معمارية الجيل الجديد المعزولة',
        enBody: 'Hardware-backed execution queues with deterministic latency.',
        arBody: 'طوابير معالجة مدعومة عتادياً بزمن استجابة حتمي.',
        from: 3,
        to: 6.5,
        springK: 200,
        springD: 22,
      },
      {
        id: 'scene-3',
        label: 'Feature Stack',
        text: 'معالجة متوازية | ذاكرة معزولة | استجابة فورية',
        enTitle: 'THREE CORE MECHANISMS',
        arTitle: 'الآليات الهندسية الثلاث',
        from: 6.5,
        to: 10.5,
        springK: 210,
        springD: 22,
      },
      {
        id: 'scene-4',
        label: 'Key Metric',
        text: '200x',
        enTitle: '200X THROUGHPUT ACCELERATION',
        arTitle: 'تسارع الأداء بمقدار 200 ضعف',
        enBody: 'Verified across production multi-tenant inference clusters.',
        arBody: 'نتائج موثقة عبر عناقيد الحوسبة الإنتاجية.',
        metricValue: '200x',
        from: 10.5,
        to: 13.5,
        springK: 260,
        springD: 18,
      },
      {
        id: 'scene-5',
        label: 'CTA Card',
        text: 'اكتشف المعمارية الكاملة',
        enTitle: 'FOLLOW @MARROK FOR FULL SPECS',
        arTitle: 'اكتشف المعمارية الكاملة وتابعنا',
        from: 13.5,
        to: 16,
        springK: 220,
        springD: 22,
      },
    ],
  };
}

export function drawProductShowcaseFrame(
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
  // 1. Authentic MARROK Slide Background + Radial Glow + 108px Grid + CAD Reticles
  drawMarrokReelBackground(
    g,
    config,
    globalTime,
    transState.cameraPanX,
    transState.cameraZoom
  );
  // 2. Authentic MARROK Header with Vector Logo Badge + Wordmark + Category Tag
  drawMarrokReelHeader(g, config, globalTime);

  g.direction = b.direction || 'rtl';
  g.textBaseline = 'alphabetic';

  transState.layers.forEach((layer) => {
    const sc = layer.scene;
    const i = layer.index;

    renderWithTransitionLayer(g, layer, b.accentColor, (t) => {
      const k = sc.springK || 220;
      const d = sc.springD || 22;
      const text = sc.text || '';

      if (i === 0) {
        // Scene 1: Problem Hook Card with Giant Question Mark & Bilingual Copy
        drawMarrokSurfaceCard(
          g,
          SAFE_LEFT,
          216,
          SAFE_WIDTH,
          640,
          b.accentColor,
          b.surfaceColor || '#12131C',
          b.surfaceBorder || '#252838',
          '',
          '',
          1
        );

        g.save();
        g.globalAlpha = clamp((t - 0.08) * 5) * 0.16;
        g.fillStyle = b.accentColor;
        g.font = `900 360px "Plus Jakarta Sans", "${b.font}", sans-serif`;
        g.textAlign = 'center';
        const qs = spring(t - 0.08, 140, 22);
        g.translate(SAFE_CENTER_X, 645);
        g.scale(0.82 + 0.18 * qs, 0.82 + 0.18 * qs);
        g.fillText('?', 0, 0);
        g.restore();

        const s = spring(t - 0.04, k, d);
        g.save();
        g.direction = b.direction;
        g.globalAlpha = clamp(t * 6);
        g.fillStyle = b.textColor;
        g.font = `800 68px "${b.font}", "Cairo", sans-serif`;
        g.textAlign = 'center';
        g.translate(SAFE_CENTER_X, 535);
        g.scale(0.92 + 0.08 * s, 0.92 + 0.08 * s);
        g.fillText(text, 0, 0, SAFE_WIDTH - 80);
        g.restore();

        drawAnimatedBilingualSlideCopy(g, sc, b, t, 920);
      } else if (i === 1) {
        // Scene 2: UI Architecture Card Assembly + Bilingual Copy
        drawMarrokSurfaceCard(
          g,
          SAFE_LEFT,
          216,
          SAFE_WIDTH,
          640,
          b.accentColor,
          b.surfaceColor || '#12131C',
          b.surfaceBorder || '#252838',
          '',
          '',
          1
        );

        const cx = SAFE_LEFT + 44;
        const cy = 275;
        const barS = spring(t - 0.08, 200, 22);
        g.save();
        for (let j = 0; j < 3; j++) {
          g.fillStyle = j === 0 ? '#f87171' : j === 1 ? '#fbbf24' : '#4ade80';
          g.globalAlpha = clamp((t - 0.08 - j * 0.04) * 5) * 0.8;
          g.beginPath();
          g.arc(cx + 18 + j * 24, cy + 16, 6.5 * barS, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();

        const r = rng(11);
        for (let j = 0; j < 5; j++) {
          const elS = spring(t - 0.12 - j * 0.05, 220, 20);
          const elY = cy + 68 + j * 94;
          g.save();
          g.globalAlpha = clamp((t - 0.12 - j * 0.05) * 5);
          if (j === 0) {
            g.fillStyle = b.accentColor;
            g.beginPath();
            g.roundRect(cx + 18, elY, 520 * elS, 18, 9);
            g.fill();
          } else {
            g.fillStyle = 'rgba(255,255,255,0.09)';
            const elW = 320 + r() * 420;
            g.beginPath();
            g.roundRect(cx + 18, elY, elW * elS, 48, 12);
            g.fill();
          }
          g.restore();
        }

        drawAnimatedBilingualSlideCopy(g, sc, b, t, 920);
      } else if (i === 2) {
        // Scene 3: Staggered Feature Cards (pipe-separated)
        const items = text.split('|');
        items.forEach((txt, idx) => {
          const st = t - idx * 0.1;
          const s = spring(st, k, d);
          const y = 230 + idx * 215;

          drawMarrokSurfaceCard(
            g,
            SAFE_LEFT,
            y,
            SAFE_WIDTH,
            195,
            b.accentColor,
            b.surfaceColor || '#12131C',
            b.surfaceBorder || '#252838',
            '',
            '',
            s
          );

          g.save();
          g.direction = b.direction;
          g.globalAlpha = clamp(st * 5);
          g.fillStyle = b.textColor;
          g.font = `800 56px "${b.font}", "Cairo", sans-serif`;
          g.textAlign = 'center';
          g.fillText(txt.trim(), SAFE_CENTER_X, y + 115, SAFE_WIDTH - 90);
          g.restore();
        });

        if (sc.enTitle || sc.arTitle) {
          drawAnimatedBilingualSlideCopy(g, sc, b, t, 920);
        }
      } else if (i === 3) {
        // Scene 4: 200x Metric Benchmark Card + 3 Sub-KPIs + Bilingual Copy
        const s = spring(t - 0.04, k, d);
        drawMarrokSurfaceCard(
          g,
          SAFE_LEFT,
          216,
          SAFE_WIDTH,
          640,
          b.accentColor,
          b.surfaceColor || '#12131C',
          b.surfaceBorder || '#252838',
          '',
          '',
          1
        );

        g.save();
        g.shadowColor = b.accentColor;
        g.shadowBlur = 28;
        g.globalAlpha = clamp(t * 5);
        g.fillStyle = b.accentColor;
        g.font = `900 180px "Plus Jakarta Sans", "${b.font}", sans-serif`;
        g.textAlign = 'center';
        g.translate(SAFE_CENTER_X, 510);
        g.scale(0.92 + 0.08 * s, 0.92 + 0.08 * s);
        g.fillText(sc.metricValue || text || '200x', 0, 0, SAFE_WIDTH - 80);
        g.restore();

        const kpiLabels = [
          ['99.9%', 'Uptime'],
          ['< 5ms', 'Latency'],
          ['0 leaks', 'Isolation'],
        ];
        kpiLabels.forEach(([val, lbl], j) => {
          const ms = spring(t - 0.12 - j * 0.06, 200, 22);
          const boxW = 248;
          const mx = SAFE_LEFT + 36 + j * (boxW + 23);
          g.save();
          g.direction = 'ltr';
          g.globalAlpha = clamp((t - 0.12 - j * 0.06) * 5);
          g.fillStyle = hexToRgba(b.accentColor, 0.12);
          g.strokeStyle = hexToRgba(b.accentColor, 0.4);
          g.lineWidth = 1.5;
          g.beginPath();
          g.roundRect(mx, 645, boxW * clamp(ms, 0.2, 1), 135, 16);
          g.fill();
          g.stroke();

          g.fillStyle = b.textColor;
          g.font = '800 36px "JetBrains Mono", monospace';
          g.textAlign = 'center';
          g.fillText(val, mx + boxW / 2, 704);

          g.fillStyle = '#E2E8F0';
          g.font = '600 22px "Plus Jakarta Sans", sans-serif';
          g.fillText(lbl.toUpperCase(), mx + boxW / 2, 750);
          g.restore();
        });

        drawAnimatedBilingualSlideCopy(g, sc, b, t, 920);
      } else {
        // Scene 5: CTA Card with MARROK Vector Badge
        drawMarrokSurfaceCard(
          g,
          SAFE_LEFT,
          216,
          SAFE_WIDTH,
          640,
          b.accentColor,
          b.surfaceColor || '#12131C',
          b.surfaceBorder || '#252838',
          '',
          '',
          1
        );

        const s1 = spring(t - 0.04, k, d);
        g.save();
        g.shadowColor = b.accentColor;
        g.shadowBlur = 32;
        drawMarrokVectorBadge(
          g,
          SAFE_CENTER_X,
          425,
          Math.max(32, 144 * s1),
          b.accentColor,
          '#0B0C12'
        );
        g.restore();

        const btnS = spring(t - 0.12, 200, 22);
        g.save();
        g.globalAlpha = clamp((t - 0.12) * 5);
        g.fillStyle = b.accentColor;
        const bw = 580 * clamp(btnS, 0.2, 1);
        const bh = 88;
        g.beginPath();
        g.roundRect(SAFE_CENTER_X - bw / 2, 620, bw, bh, 20);
        g.fill();
        g.fillStyle = b.bgColor || '#080A12';
        g.font = `800 36px "${b.font}", "Cairo", sans-serif`;
        g.textAlign = 'center';
        g.fillText(text || b.name, SAFE_CENTER_X, 676, bw - 40);
        g.restore();

        drawAnimatedBilingualSlideCopy(g, sc, b, t, 920);
      }
    });
  });

  // 3. Authentic MARROK Pagination & Attribution Footer
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
    const from = sc.from ?? i * 3;
    const to = sc.to ?? from + 3;
    const k = sc.springK || 220;
    const d = sc.springD || 22;
    const text = sc.text || '';
    return `  { from: ${from}, to: ${to}, draw(t) {
    const s = spring(t - 0.1, ${k}, ${d});
    g.save();
    g.fillStyle = '#12131C';
    g.strokeStyle = '${b.accentColor}';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(82, 220, 863, 470, 24);
    g.fill();
    g.stroke();
    drawMarrokVectorBadge(g, 513.5, 380, Math.max(24, 96 * s), '${b.accentColor}', '#0B0C12');
    g.direction = '${b.direction}'; g.globalAlpha = clamp(t * 5);
    g.fillStyle = '${b.textColor}';
    g.font = '800 72px "${b.font}", sans-serif';
    g.textAlign = 'center';
    g.fillText(${JSON.stringify(text)}, 513.5, 580, 780);
    g.restore();
  }}`;
  });
  return wrapHTML(config, `const SCENES = [\n${sceneBlocks.join(',\n')}\n];`);
}

export const productShowcaseTemplate: MotionTemplateDefinition = {
  meta,
  defaultConfig,
  toHTML,
  drawFrame: drawProductShowcaseFrame,
};
