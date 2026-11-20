import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CarouselData, SlideData, SlideVisualSpec, VisualSpecKind } from '../types.ts';
import { THEME_CONFIGS } from '../lib/theme/palettes.ts';
import {
  SVG_BLUEPRINT_PRESETS,
  buildThemedSvgBlueprint,
  sanitizeSvgBlueprintMarkup,
} from '../lib/canvas/svgBlueprint.ts';
import {
  VISUAL_SPEC_KINDS,
  deriveVisualSpecFromSlide,
  detectStrongVisualSpecKind,
} from '../lib/synthesis/visualSpecBuilder.ts';
import { parseCarouselData } from '../lib/validation/carousel.ts';
import {
  cloneSlideData,
  switchCarouselPostFormat,
} from '../lib/studio/formatWorkspace.ts';
import { drawVisualSlide } from '../lib/canvas/archetypes/renderVisual.ts';
import { computeSlideLayoutAwareness } from '../lib/canvas/layoutAwareness.ts';
import type { CanvasDimensionPreset } from '../types.ts';
import {
  analyzeSlideTextForArchetype,
  diversifyDeckArchetypesAndVisuals,
} from '../lib/synthesis/smartVisualDefaults.ts';
import { runQAChecks } from '../lib/qaChecks.ts';
import { VisualSpecArchetypeEditor } from '../components/studio/archetypes/VisualSpecArchetypeEditor.tsx';

function createMockCanvasCtx() {
  const gradient = { addColorStop: vi.fn() };
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    setLineDash: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    drawImage: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: (text || '').length * 11 })),
    createLinearGradient: vi.fn(() => gradient),
    createRadialGradient: vi.fn(() => gradient),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '16px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    direction: 'ltr',
    globalAlpha: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  } as unknown as CanvasRenderingContext2D;
}

const SAMPLE_SPECS: Record<VisualSpecKind, SlideVisualSpec> = {
  'bar-chart': {
    kind: 'bar-chart',
    eyebrow: 'LATENCY BENCHMARK',
    title: 'Tail Latency Across Pool Modes',
    unit: 'ms',
    deltaBadge: '-84% p99',
    orientation: 'horizontal',
    bars: [
      { label: 'Direct Postgres', value: 142, displayValue: '142ms', tone: 'alert' },
      { label: 'Session Pool', value: 68, displayValue: '68ms', tone: 'muted' },
      { label: 'Transaction Pool', value: 22, displayValue: '22ms', tone: 'accent', isWinner: true },
    ],
  },
  sequence: {
    kind: 'sequence',
    eyebrow: 'PROTOCOL HANDSHAKE',
    title: 'Zero-Downtime Lease Renewal',
    actors: ['Client', 'Edge Proxy', 'Primary DB'],
    steps: [
      { from: 0, to: 1, label: 'POST /checkout', tag: 'TLS 1.3', style: 'solid' },
      { from: 1, to: 2, label: 'Acquire Lease', tag: '2ms', style: 'solid' },
      { from: 2, to: 1, label: '200 Lease Granted', style: 'dashed' },
    ],
  },
  timeline: {
    kind: 'timeline',
    eyebrow: 'INCIDENT POSTMORTEM',
    title: 'US-EAST-1 DNS Cascade Breakdown',
    events: [
      { time: '14:02 UTC', title: 'BGP policy push', detail: 'Route table update rolled out', severity: 'info' },
      { time: '14:07 UTC', title: 'Error spike 42%', detail: 'Ingress queue saturated', severity: 'incident' },
      { time: '14:19 UTC', title: 'Rollback verified', detail: 'p99 restored below 18ms', severity: 'resolved' },
    ],
  },
  matrix: {
    kind: 'matrix',
    eyebrow: 'TRADE-OFF MATRIX',
    title: 'Replication Strategy Selection',
    xAxisLow: 'Low Complexity',
    xAxisHigh: 'High Throughput',
    yAxisLow: 'Eventual',
    yAxisHigh: 'Strong Consistency',
    quadrants: [
      { title: 'Single Primary', detail: 'Simple ops, write ceiling' },
      { title: 'Raft Sharded', detail: 'Consistent & scalable', highlight: true },
      { title: 'Async Replica', detail: 'Stale reads under lag' },
      { title: 'CRDT Multi-Master', detail: 'High write speed, merge complexity' },
    ],
  },
  table: {
    kind: 'table',
    eyebrow: 'ENGINE COMPARISON',
    title: 'Message Queue Storage Tiers',
    columns: ['Metric', 'Disk Queue', 'Ring Buffer'],
    rows: [
      ['p99 Latency', '48ms', '1.4ms'],
      ['Throughput', '40k/s', '420k/s'],
      ['Memory Footprint', '2.1 GB', '640 MB'],
    ],
    highlightColumn: 2,
  },
  callout: {
    kind: 'callout',
    eyebrow: 'ENGINEERING REPORT',
    calloutStyle: 'quote',
    quote: 'Eliminating lock contention on the hot shard cut tail latency by 84% without adding nodes.',
    author: 'Systems Engineering Team',
    role: 'Infrastructure Postmortem',
    source: 'engineering.example.org',
  },
  svg: {
    kind: 'svg',
    eyebrow: 'CUSTOM VECTOR BLUEPRINT',
    title: 'Consensus Quorum Ring',
    viewBox: SVG_BLUEPRINT_PRESETS[0].viewBox,
    presetId: SVG_BLUEPRINT_PRESETS[0].id,
    svgCode: SVG_BLUEPRINT_PRESETS[0].svgCode,
  },
};

describe('Universal Visual Engine', () => {
  describe('SVG Blueprint Sanitizer & Theme Token Injector', () => {
    it('strips scripts, event handlers, foreignObject, image tags, and external URLs while keeping safe vector primitives', () => {
      const maliciousSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
          <script>window.pwned = true;</script>
          <foreignObject width="100" height="100"><div>bad</div></foreignObject>
          <image href="https://evil.test/pixel.png" width="20" height="20"/>
          <rect x="10" y="10" width="200" height="80" fill="{{surface}}" stroke="{{accent}}" onclick="steal()" />
          <a href="javascript:alert(2)"><text x="20" y="50" fill="{{textWhite}}">Safe Label</text></a>
          <circle cx="80" cy="80" r="12" fill="url(https://evil.test/grad)" />
        </svg>
      `;

      const result = sanitizeSvgBlueprintMarkup(maliciousSvg);
      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.svg).not.toMatch(/<script/i);
      expect(result.svg).not.toMatch(/foreignObject/i);
      expect(result.svg).not.toMatch(/<image/i);
      expect(result.svg).not.toMatch(/onload|onclick/i);
      expect(result.svg).not.toMatch(/javascript:/i);
      expect(result.svg).not.toMatch(/https:\/\/evil\.test/i);
      expect(result.svg).toContain('viewBox="0 0 846 490"');
      expect(result.svg).toContain('<rect');
      expect(result.svg).toContain('Safe Label');
    });

    it('injects live MARROK theme palette tokens and produces a valid UTF-8 data URI', () => {
      const theme = THEME_CONFIGS.scion;
      const themed = buildThemedSvgBlueprint(SVG_BLUEPRINT_PRESETS[0].svgCode, theme);

      expect(themed.isValid).toBe(true);
      expect(themed.warnings).toHaveLength(0);
      expect(themed.svg).not.toContain('{{accent}}');
      expect(themed.svg).not.toContain('{{surface}}');
      expect(themed.svg).toContain(theme.accent);
      expect(themed.svg).toContain(theme.surface);
      expect(themed.dataUrl.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    });
  });

  describe('Validation & Per-Format Workspace Isolation', () => {
    it('round-trips all 7 visualSpec kinds through parseCarouselData and sanitizes unsafe SVGs', () => {
      const rawSlides = VISUAL_SPEC_KINDS.map((kind, idx) => ({
        type: 'visual',
        enTitle: `Visual Slide ${idx + 1} ${kind}`,
        arTitle: `شريحة مرئية ${idx + 1}`,
        enBody: `Explaining ${kind} with real architecture telemetry.`,
        arBody: `شرح تفصيلي للمخطط الهندسي.`,
        visualSpec:
          kind === 'svg'
            ? {
                ...SAMPLE_SPECS.svg,
                svgCode: `${SAMPLE_SPECS.svg.svgCode}<script>alert(1)</script>`,
              }
            : SAMPLE_SPECS[kind],
      }));

      const parsed = parseCarouselData({
        theme: 'scion',
        category: 'SYSTEMS ARCHITECTURE',
        caption: 'Bilingual benchmark deck',
        slides: rawSlides,
      });

      expect(parsed).not.toBeNull();
      if (!parsed) throw new Error('Expected parsed carousel data');
      expect(parsed.slides).toHaveLength(VISUAL_SPEC_KINDS.length);
      VISUAL_SPEC_KINDS.forEach((kind, idx) => {
        expect(parsed.slides[idx].type).toBe('visual');
        expect(parsed.slides[idx].visualSpec?.kind).toBe(kind);
      });
      const svgSlide = parsed.slides[parsed.slides.length - 1];
      expect(svgSlide.visualSpec?.svgCode).not.toMatch(/<script/i);
    });

    it('deep-clones visualSpec without shared references and preserves it across format switching', () => {
      const originalSlide: SlideData = {
        type: 'visual',
        enTitle: 'Tail Latency Across Pool Modes',
        arTitle: 'زمن الاستجابة عبر أوضاع التجميع',
        enBody: 'Transaction pooling cuts p99 latency from 142ms to 22ms.',
        arBody: 'يقلل التجميع زمن الاستجابة p99 بشكل كبير.',
        visualSpec: SAMPLE_SPECS['bar-chart'],
      };

      const cloned = cloneSlideData(originalSlide);
      expect(cloned.visualSpec).toEqual(originalSlide.visualSpec);
      expect(cloned.visualSpec?.bars).not.toBe(originalSlide.visualSpec?.bars);
      cloned.visualSpec!.bars![0].value = 999;
      expect(originalSlide.visualSpec?.bars?.[0].value).toBe(142);

      const deck: CarouselData = {
        theme: 'scion',
        category: 'DATABASES',
        caption: 'Postgres pooling breakdown',
        postFormat: 'carousel',
        slides: [
          originalSlide,
          {
            type: 'cta',
            enTitle: 'Which pool mode runs in your prod?',
            arTitle: 'أي وضع تستخدم في الإنتاج؟',
            enBody: 'Share your benchmark.',
            arBody: 'شاركنا تجربتك.',
            ctaText: 'Join discussion',
            url: 'marrok.org',
          },
        ],
      };

      const asSingle = switchCarouselPostFormat(deck, 'single', {
        activeSlideIndex: 0,
        theme: THEME_CONFIGS.scion,
      }).nextCarousel;
      const backToCarousel = switchCarouselPostFormat(asSingle, 'carousel', {
        activeSlideIndex: 0,
        theme: THEME_CONFIGS.scion,
      }).nextCarousel;
      expect(backToCarousel.slides[0].type).toBe('visual');
      expect(backToCarousel.slides[0].visualSpec?.kind).toBe('bar-chart');
      expect(backToCarousel.slides[0].visualSpec?.bars?.[0].value).toBe(142);
    });
  });

  describe('Canvas Renderer & 5-Preset Layout Awareness', () => {
    it('renders all 7 visualSpec kinds cleanly and computes non-overlapping layout across all 5 presets', async () => {
      const ctx = createMockCanvasCtx();
      const theme = THEME_CONFIGS.scion;
      const presets: CanvasDimensionPreset[] = [
        'tiktok-9:16',
        'ig-4:5',
        'ig-3:4',
        'ig-1:1',
        'ig-9:16',
      ];

      for (const kind of VISUAL_SPEC_KINDS) {
        const slide: SlideData = {
          type: 'visual',
          enTitle: SAMPLE_SPECS[kind].title || `Visual ${kind}`,
          arTitle: 'تحليل معماري متقدم للنظام',
          enBody: 'Structured visual layout replacing repetitive generic boxes.',
          arBody: 'عرض بصري منظم يوضح التفاصيل الهندسية بدقة عالية.',
          visualSpec: SAMPLE_SPECS[kind],
        };

        const bottomY = await drawVisualSlide(ctx, slide, theme, {}, 1);
        expect(bottomY).toBe(730);

        for (const preset of presets) {
          const layout = computeSlideLayoutAwareness(slide, {
            theme: 'scion',
            category: 'SYSTEMS',
            caption: 'Benchmark test',
            dimensionPreset: preset,
            slides: [slide],
          });
          expect(layout.graphicCard).toBeDefined();
          expect(layout.graphicCard!.effectiveBottom).toBeGreaterThan(0);
          expect(layout.titleBlock).toBeDefined();
          expect(layout.titleBlock!.top).toBeGreaterThanOrEqual(layout.graphicCard!.effectiveBottom);
        }
      }
    });
  });

  describe('Content-Aware Detection, Diversification & QA Checks', () => {
    it('detects timelines, sequences, matrices, multi-metric bar charts, tables, and quotes automatically', () => {
      expect(
        detectStrongVisualSpecKind({
          type: 'row',
          enTitle: 'DNS Outage Postmortem Timeline',
          enBody: '14:02 UTC route update triggered cascading failure before 14:19 UTC rollback.',
        })
      ).toBe('timeline');

      expect(
        detectStrongVisualSpecKind({
          type: 'row',
          enTitle: 'OAuth Flow Request Lifecycle',
          enBody: 'Client -> Gateway -> Auth Server handshake with token exchange.',
        })
      ).toBe('sequence');

      expect(
        detectStrongVisualSpecKind({
          type: 'row',
          enTitle: 'CAP Theorem 2x2 Trade-off Matrix',
          enBody: 'Consistency vs availability under partition pressure.',
        })
      ).toBe('matrix');

      expect(
        detectStrongVisualSpecKind({
          type: 'row',
          enTitle: 'Latency Breakdown Across Percentiles',
          enBody: 'p50 sits at 4ms, p95 at 18ms, and p99 spikes to 142ms under lock contention.',
        })
      ).toBe('bar-chart');

      expect(
        detectStrongVisualSpecKind({
          type: 'row',
          enTitle: 'Storage Tier Comparison Table',
          enBody: 'Evaluating throughput, latency, and durability guarantees.',
        })
      ).toBe('table');

      expect(
        detectStrongVisualSpecKind({
          type: 'row',
          enTitle: 'Cloudflare Systems Verdict',
          enBody: 'According to the engineering blog, "Lock-free ring buffers removed 84% of tail jitter under peak traffic."',
        })
      ).toBe('callout');
    });

    it('assigns visual archetype via analyzeSlideTextForArchetype and diversifyDeckArchetypesAndVisuals', () => {
      const outageSlide: SlideData = {
        type: 'row',
        enTitle: 'Outage Timeline Breakdown',
        arTitle: 'الخط الزمني لانقطاع الخدمة',
        enBody: '14:02 UTC config push caused cascading failure until 14:25 UTC rollback mitigated traffic.',
        arBody: 'تسبب تحديث الإعدادات في فشل متسلسل قبل التراجع السريع.',
      };
      expect(analyzeSlideTextForArchetype(outageSlide, 2)).toBe('visual');

      const deckSlides: SlideData[] = [
        {
          type: 'metric',
          enTitle: 'How a 12-minute BGP push dropped 42% of traffic',
          arTitle: 'كيف تسبب تحديث BGP في انقطاع 42% من الحركة',
          enBody: '42% error spike in 12 minutes.',
          arBody: 'ارتفاع الأخطاء بنسبة 42%.',
          metricValue: '42%',
          metricDiff: '▲ +42% ERRORS',
        },
        outageSlide,
        {
          type: 'cta',
          enTitle: 'How fast is your BGP rollback?',
          arTitle: 'ما مدى سرعة التراجع لديك؟',
          enBody: 'Drop your runbook below.',
          arBody: 'شاركنا تجربتك.',
          ctaText: 'Join discussion',
          url: 'marrok.org',
        },
      ];

      const diversified = diversifyDeckArchetypesAndVisuals(deckSlides);
      expect(diversified[1].type).toBe('visual');
      expect(diversified[1].visualSpec?.kind).toBe('timeline');
      expect(diversified[1].visualSpec?.events?.length).toBeGreaterThanOrEqual(2);
    });

    it('passes valid visual slides in runQAChecks and flags empty or unsafe SVG blueprints', () => {
      const validDeck: CarouselData = {
        theme: 'scion',
        category: 'DISTRIBUTED SYSTEMS',
        caption: 'Latency benchmark breakdown',
        slides: [
          {
            type: 'visual',
            enTitle: 'Transaction Pooling Cuts p99 Latency',
            arTitle: 'التجميع يخفض زمن الاستجابة p99',
            enBody: 'Comparing direct connections against pooled paths.',
            arBody: 'مقارنة الاتصالات المباشرة مع التجميع.',
            visualSpec: SAMPLE_SPECS['bar-chart'],
          },
          {
            type: 'cta',
            enTitle: 'Which pooler do you run?',
            arTitle: 'أي مجمع اتصالات تستخدم؟',
            enBody: 'Share your setup.',
            arBody: 'شاركنا إعداداتك.',
            ctaText: 'Join discussion',
            url: 'marrok.org',
          },
        ],
      };

      const validReport = runQAChecks(validDeck);
      const visualFailures = validReport.results.filter(
        (c) => c.id.startsWith('archetype-visual-') && c.severity === 'fail'
      );
      expect(visualFailures).toHaveLength(0);

      const brokenDeck: CarouselData = {
        ...validDeck,
        slides: [
          {
            type: 'visual',
            enTitle: 'Broken SVG Slide',
            arTitle: 'مخطط غير صالح',
            enBody: 'Testing invalid SVG check.',
            arBody: 'اختبار التحقق من SVG.',
            visualSpec: {
              kind: 'svg',
              svgCode: '<div>not an svg</div>',
            },
          },
          {
            type: 'visual',
            enTitle: 'Unsafe SVG Slide',
            arTitle: 'مخطط يحتوي على سكربت',
            enBody: 'Testing sanitizer warning check.',
            arBody: 'اختبار تحذير التنظيف.',
            visualSpec: {
              kind: 'svg',
              svgCode: '<svg viewBox="0 0 846 490"><script>bad()</script><rect width="100" height="50"/></svg>',
            },
          },
        ],
      };

      const brokenReport = runQAChecks(brokenDeck);
      expect(
        brokenReport.results.some((c) => c.id === 'archetype-visual-svg-invalid-0' && c.severity === 'fail')
      ).toBe(true);
      expect(
        brokenReport.results.some((c) => c.id === 'archetype-visual-svg-sanitized-1' && c.severity === 'warn')
      ).toBe(true);
    });
  });

  describe('VisualSpecArchetypeEditor Component', () => {
    it('switches modes, triggers Auto-Fill, applies SVG presets/tokens, and shows live sanitization warnings', () => {
      const onUpdateField = vi.fn();
      const baseSlide: SlideData = {
        type: 'visual',
        enTitle: 'Postgres Latency Breakdown',
        arTitle: 'تحليل زمن الاستجابة في Postgres',
        enBody: 'p50 at 4ms, p95 at 18ms, and p99 at 142ms.',
        arBody: 'تحليل دقيق لزمن الاستجابة.',
        visualSpec: SAMPLE_SPECS['bar-chart'],
      };

      const { rerender } = render(
        <VisualSpecArchetypeEditor
          currentSlide={baseSlide}
          currentSlideIndex={1}
          theme={THEME_CONFIGS.scion}
          onUpdateField={onUpdateField}
        />
      );

      // Switch to Timeline mode
      fireEvent.click(screen.getByTestId('visual-mode-timeline'));
      expect(onUpdateField).toHaveBeenCalledWith(
        'visualSpec',
        expect.objectContaining({ kind: 'timeline' })
      );

      // Auto-Fill from Copy
      fireEvent.click(screen.getByTestId('visual-spec-autofill-btn'));
      expect(onUpdateField).toHaveBeenCalledWith(
        'visualSpec',
        expect.objectContaining({ kind: 'bar-chart' })
      );

      // Render in Custom SVG mode with clean preset
      const svgSlide: SlideData = {
        ...baseSlide,
        visualSpec: deriveVisualSpecFromSlide(baseSlide, 'svg', 0),
      };
      rerender(
        <VisualSpecArchetypeEditor
          currentSlide={svgSlide}
          currentSlideIndex={1}
          theme={THEME_CONFIGS.scion}
          onUpdateField={onUpdateField}
        />
      );

      expect(screen.getByTestId('svg-sanitizer-status').textContent).toMatch(/Sanitized & Safe SVG/i);

      // Click preset & token buttons
      fireEvent.click(screen.getByTestId('svg-preset-cache-hierarchy'));
      expect(onUpdateField).toHaveBeenCalledWith(
        'visualSpec',
        expect.objectContaining({ presetId: 'cache-hierarchy' })
      );

      fireEvent.click(screen.getByTestId('svg-token-accent'));
      expect(onUpdateField).toHaveBeenCalledWith(
        'visualSpec',
        expect.objectContaining({ svgCode: expect.stringContaining('{{accent}}') })
      );

      // Render unsafe SVG to confirm live sanitization warning appears
      rerender(
        <VisualSpecArchetypeEditor
          currentSlide={{
            ...svgSlide,
            visualSpec: {
              kind: 'svg',
              svgCode: '<svg viewBox="0 0 846 490"><script>x()</script><rect width="100" height="40"/></svg>',
            },
          }}
          currentSlideIndex={1}
          theme={THEME_CONFIGS.scion}
          onUpdateField={onUpdateField}
        />
      );
      expect(screen.getByTestId('svg-sanitizer-status').textContent).toMatch(/Stripped:/i);
    });
  });
});
