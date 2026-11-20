import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  CanvasDimensionPreset,
  CarouselData,
  DEFAULT_PALETTES,
  HookVariant,
  SlideData,
} from '../types.ts';
import {
  synthesizeCarousel,
  applyCoverStyleToSlide,
  applyViralHookTierSelection,
  resolveSlide1CoverStyle,
} from '../lib/synthesizer.ts';
import { parseCarouselData } from '../lib/validation/carousel.ts';
import { computeSlideLayoutAwareness } from '../lib/canvas/layoutAwareness.ts';
import { renderSlideToCanvas } from '../lib/canvas/renderSlide.ts';
import { getCanvasDimensionSpec } from '../lib/canvas/constants.ts';
import { runQAChecks } from '../lib/qaChecks.ts';
import { convertCarouselToMotionReel } from '../lib/motion/carouselToReelConverter.ts';
import { CoverComposerPanel } from '../components/studio/CoverComposerPanel.tsx';
import { InlineSlideEditor } from '../components/studio/InlineSlideEditor.tsx';

function createRecordingCanvas(width = 1080, height = 1920) {
  const drawnTexts: Array<{ text: string; font: string; fontSizePx: number; x: number; y: number }> = [];
  const ctx: any = {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    arc: () => {},
    arcTo: () => {},
    ellipse: () => {},
    rect: () => {},
    roundRect: () => {},
    fill: () => {},
    stroke: () => {},
    clip: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    clearRect: () => {},
    setLineDash: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    drawImage: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    measureText: (str: string) => ({ width: str.length * 11 }),
    font: '700 24px sans-serif',
    fillStyle: '#fff',
    strokeStyle: '#fff',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    direction: 'ltr',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillText: function (text: string, x: number, y: number) {
      const match = String(this.font).match(/(\d+(?:\.\d+)?)px/);
      const fontSizePx = match ? parseFloat(match[1]) : 24;
      drawnTexts.push({ text: String(text), font: String(this.font), fontSizePx, x, y });
    },
    strokeText: () => {},
  };
  const canvas: any = {
    width,
    height,
    getContext: () => ctx,
  };
  return { canvas, drawnTexts };
}

describe('Slide 1 Cover Hero — Synthesis, Cover Styles & Validation', () => {
  it('generates multi-slide Slide 1 with Headline-first Cover Hero defaults and round-trips through Zod schema', () => {
    const deck = synthesizeCarousel({
      prompt: 'How Rust Zero-Copy Ring Buffers Cut Kafka Tail Latency by 74% at P99.',
    });

    expect(deck.slides.length).toBeGreaterThan(2);
    const slide1 = deck.slides[0];
    expect(slide1.compositionPreset).toBe('headline-first');
    expect(slide1.storyRole).toBe('hook');
    expect(slide1.coverStyle).toBeDefined();
    expect((slide1.coverTeaserEn || '').length).toBeGreaterThan(0);
    expect((slide1.coverTeaserEn || '').length).toBeLessThanOrEqual(68);
    expect((slide1.coverTeaserAr || '').length).toBeGreaterThan(0);
    expect((slide1.coverTeaserAr || '').length).toBeLessThanOrEqual(68);
    expect(slide1.enBody).toBe('');
    expect(slide1.arBody).toBe('');
    expect(slide1.showSwipeCue).not.toBe(false);

    const parsed = parseCarouselData(deck);
    expect(parsed).not.toBeNull();
    if (!parsed) throw new Error('Expected parsed carousel data');
    expect(parsed.slides[0].coverStyle).toBe(slide1.coverStyle);
    expect(parsed.slides[0].coverTeaserEn).toBe(slide1.coverTeaserEn);
    expect(parsed.slides[0].showSwipeCue).toBe(slide1.showSwipeCue);
  });

  it('supports all 4 cover styles and blocks synthetic numbers on ungrounded metric-split', () => {
    const baseSlide: SlideData = {
      type: 'row',
      enTitle: 'Why Raft Consensus Stalls Across Regions?',
      arTitle: 'لماذا يتباطأ إجماع Raft بين المناطق؟',
      enBody: 'Cross-region quorum round trips stall tail writes.',
      arBody: 'رحلات التصويت العابرة للمناطق تبطئ الكتابة.',
      enCredit: 'Distributed Systems Weekly',
    };

    const headlineHero = applyCoverStyleToSlide(baseSlide, 'headline-hero', 0, 7, true, [baseSlide]);
    expect(headlineHero.coverStyle).toBe('headline-hero');
    expect(headlineHero.compositionPreset).toBe('headline-first');
    expect(headlineHero.type).toBe('visual');
    expect(headlineHero.visualSpec?.kind).toBe('callout');
    expect(headlineHero.enBody).toBe('');
    expect(headlineHero.arBody).toBe('');

    const ungroundedMetric = applyCoverStyleToSlide(baseSlide, 'metric-split', 0, 7, true, [baseSlide]);
    expect(ungroundedMetric.coverStyle).toBe('metric-split');
    expect(ungroundedMetric.type).toBe('visual');
    expect(ungroundedMetric.visualSpec?.kind).toBe('callout');

    const numericSlide: SlideData = {
      ...baseSlide,
      enTitle: 'How B-Tree Coalescing Cut Disk IOPS by 62%?',
      metricValue: '62%',
      metricLabel: 'DISK IOPS DROP',
    };
    const groundedMetric = applyCoverStyleToSlide(numericSlide, 'metric-split', 0, 7, true, [numericSlide]);
    expect(groundedMetric.type).toBe('metric');
    expect(groundedMetric.metricValue).toBe('62%');

    const versus = applyCoverStyleToSlide(baseSlide, 'versus-hook', 0, 7, true, [baseSlide]);
    expect(versus.type).toBe('compare');
    expect(versus.compareLeftTitle).toBeTruthy();
    expect(versus.compareRightTitle).toBeTruthy();

    const visualTeaser = applyCoverStyleToSlide(baseSlide, 'visual-teaser', 0, 7, true, [baseSlide]);
    expect(['row', 'subjectPair', 'visual']).toContain(visualTeaser.type);
    expect(resolveSlide1CoverStyle(visualTeaser, [visualTeaser])).toBe('visual-teaser');
  });

  it('populates hookVariants with coverStyle and coverTeaserEn/Ar and syncs teaser to Motion Reel', () => {
    const deck = synthesizeCarousel({
      prompt: 'How Uber Reduced Envoy Mesh Memory Overhead by 45% in Production.',
    });
    const hookEngineDeck = applyViralHookTierSelection(deck);
    expect(hookEngineDeck.hookVariants?.length).toBeGreaterThan(0);
    expect(hookEngineDeck.hookVariants?.[0].coverStyle).toBeDefined();
    expect(hookEngineDeck.hookVariants?.[0].coverTeaserEn).toBeTruthy();

    const reel = convertCarouselToMotionReel(hookEngineDeck, DEFAULT_PALETTES.teal, 'marrok-slides');
    expect(reel.scenes[0].enBody).toBeTruthy();
    expect(reel.scenes[0].arBody).toBeTruthy();
  });

  it('flags overlong cover teasers and ungrounded metric-split in QA checks as warnings', () => {
    const deck = synthesizeCarousel({
      prompt: 'Zero-Trust Kernel Sandboxing for Multi-Tenant AI Sandboxes.',
    });
    deck.slides[0] = {
      ...deck.slides[0],
      coverStyle: 'metric-split',
      metricValue: '',
      enTitle: 'Zero-Trust Kernel Sandboxing for Multi-Tenant AI?',
      coverTeaserEn: 'A very long teaser sentence that exceeds the sixty eight character single line limit on cover',
      coverTeaserAr: 'جملة تمهيدية طويلة جداً تتجاوز الحد الأقصى المسموح به للسطر الواحد على الغلاف الأول',
    };

    const qa = runQAChecks(deck);
    const ids = qa.results.map((c) => c.id);
    expect(ids).toContain('content-quality-slide1-teaser-en-len');
    expect(ids).toContain('content-quality-slide1-teaser-ar-len');
    expect(ids).toContain('content-quality-slide1-metric-split-digits');
  });
});

describe('Slide 1 Cover Hero — Layout Awareness & Canvas Rendering Across 5 Presets', () => {
  const presets: CanvasDimensionPreset[] = ['tiktok-9:16', 'ig-4:5', 'ig-3:4', 'ig-1:1', 'ig-9:16'];

  it('renders Headline-first Cover Hero cleanly with >=24px fonts and bottom swipe pill on all 5 presets', async () => {
    const theme = DEFAULT_PALETTES.teal;
    const baseDeck = synthesizeCarousel({
      prompt: 'How Cloudflare Eliminated 88% of Cold Starts Using Isolate Snapshots.',
    });

    for (const preset of presets) {
      const deck: CarouselData = {
        ...baseDeck,
        dimensionPreset: preset,
      };
      const spec = getCanvasDimensionSpec(preset);
      const layout = computeSlideLayoutAwareness(deck.slides[0], deck, 0);

      expect(layout.isSlide1Cover).toBe(true);
      expect(layout.compositionPreset).toBe('headline-first');
      expect(layout.swipeCueBox).toBeDefined();
      expect(layout.swipeCueBox?.hidden).toBe(false);
      expect(layout.swipeCueBox!.y + layout.swipeCueBox!.height).toBeLessThanOrEqual(spec.safeFooterCeilingY);

      expect(layout.titleBlock).toBeDefined();
      expect(layout.arabicTitleBlock).toBeDefined();
      expect(layout.coverTeaserBlock).toBeDefined();
      expect(layout.arabicCoverTeaserBlock).toBeDefined();
      expect(layout.titleBlock!.fontSize).toBeGreaterThanOrEqual(spec.minTitleFontSize ?? 24);
      expect(layout.coverTeaserBlock!.fontSize).toBeGreaterThanOrEqual(24);
      expect(layout.arabicCoverTeaserBlock!.fontSize).toBeGreaterThanOrEqual(24);

      // Headline-first vertical ordering without overlaps
      expect(layout.titleBlock!.bottom).toBeLessThan(layout.arabicTitleBlock!.top);
      expect(layout.arabicTitleBlock!.bottom).toBeLessThan(layout.coverTeaserBlock!.top);
      if (layout.graphicCard && !layout.graphicCard.hidden) {
        expect(layout.arabicCoverTeaserBlock!.bottom).toBeLessThan(layout.graphicCard.effectiveTop);
        expect(layout.graphicCard.effectiveBottom).toBeLessThanOrEqual(layout.swipeCueBox!.y);
      }

      const { canvas, drawnTexts } = createRecordingCanvas(spec.width, spec.height);
      await renderSlideToCanvas(deck, 0, canvas, theme);
      const renderedStrings = drawnTexts.map((d) => d.text);
      expect(renderedStrings.some((t) => t.includes('Swipe'))).toBe(true);
    }
  });

  it('strictly excludes Cover Hero swipe cue and cover layout on Slide 2+, single posters, and meme slides', () => {
    const deck = synthesizeCarousel({
      prompt: 'How Discord Optimizes Real-Time Gateway Fanout at Scale.',
    });

    const slide2Layout = computeSlideLayoutAwareness(deck.slides[1], deck, 1);
    expect(slide2Layout.isSlide1Cover).toBe(false);
    expect(slide2Layout.swipeCueBox).toBeUndefined();
    expect(slide2Layout.coverTeaserBlock).toBeUndefined();

    const singleDeck: CarouselData = {
      ...deck,
      postFormat: 'single',
      slides: [{ ...deck.slides[0], type: 'poster' }],
    };
    const singleLayout = computeSlideLayoutAwareness(singleDeck.slides[0], singleDeck, 0);
    expect(singleLayout.isSlide1Cover).toBe(false);
    expect(singleLayout.swipeCueBox).toBeUndefined();

    const memeDeck: CarouselData = {
      ...deck,
      postFormat: 'meme',
      slides: [{ ...deck.slides[0], type: 'poster', standaloneMeme: true, imageFrameMode: 'full' }],
    };
    const memeLayout = computeSlideLayoutAwareness(memeDeck.slides[0], memeDeck, 0);
    expect(memeLayout.isSlide1Cover).toBe(false);
    expect(memeLayout.swipeCueBox).toBeUndefined();
  });
});

describe('CoverComposerPanel & InlineSlideEditor Cover Integration', () => {
  afterEach(() => cleanup());

  const theme = DEFAULT_PALETTES.teal;
  const mockVariants: HookVariant[] = [
    {
      tag: 'Benchmark',
      framework: 'Specific Metric',
      score: 94,
      selected: true,
      coverStyle: 'metric-split',
      coverTeaserEn: 'Why index memory dropped sharply under heavy write load',
      coverTeaserAr: 'لماذا انخفض استهلاك الذاكرة تحت ضغط الكتابة',
      enTitle: 'How HNSW Pruning Cut RAM by 68%?',
      arTitle: 'كيف خفض تقليم HNSW الذاكرة بنسبة 68%؟',
      enBody: '',
      arBody: '',
    },
  ];

  const coverSlide: SlideData = {
    type: 'visual',
    coverStyle: 'headline-hero',
    compositionPreset: 'headline-first',
    storyRole: 'hook',
    hookKicker: 'VECTOR ENGINES',
    enTitle: 'Why Vector Indexes Hit OOM Walls?',
    arTitle: 'لماذا تصطدم فهارس المتجهات بحدود الذاكرة؟',
    coverTeaserEn: 'Three memory quantization shifts that keep recall intact',
    coverTeaserAr: 'ثلاث خطوات ضغط تحافظ على دقة الاسترجاع',
    enBody: '',
    arBody: '',
    showSwipeCue: true,
    swipeCueText: 'Swipe to unpack',
    visualSpec: {
      kind: 'callout',
      calloutStyle: 'quote',
      quote: 'Quantized graphs keep P99 latency predictable.',
    },
  };

  it('renders dedicated CoverComposerPanel on multi-slide Slide 1 and handles cover style + teaser + swipe interactions', () => {
    const onUpdateField = vi.fn();
    const onApplyCoverStyle = vi.fn();
    const onApplyHookVariant = vi.fn();
    const onOpenVisualTab = vi.fn();

    render(
      <InlineSlideEditor
        currentSlide={coverSlide}
        currentSlideIndex={0}
        totalSlides={6}
        theme={theme}
        isAdvancedCustomizerOpen={false}
        onToggleAdvancedCustomizer={vi.fn()}
        onUpdateField={onUpdateField}
        hookVariants={mockVariants}
        onApplyHookVariant={onApplyHookVariant}
        onApplyCoverStyle={onApplyCoverStyle}
        onOpenVisualTab={onOpenVisualTab}
      />
    );

    expect(screen.getByTestId('cover-composer-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('inline-graphic-transformer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('cover-style-btn-metric-split'));
    expect(onApplyCoverStyle).toHaveBeenCalledWith('metric-split');

    fireEvent.change(screen.getByTestId('cover-teaser-en-input'), {
      target: { value: 'Updated concise cover teaser line' },
    });
    expect(onUpdateField).toHaveBeenCalledWith('coverTeaserEn', 'Updated concise cover teaser line');

    fireEvent.click(screen.getByTestId('toggle-swipe-cue-btn'));
    expect(onUpdateField).toHaveBeenCalledWith('showSwipeCue', false);

    fireEvent.click(screen.getByTestId('cover-hook-angles-toggle'));
    fireEvent.click(screen.getByTestId('cover-hook-variant-0'));
    expect(onApplyHookVariant).toHaveBeenCalledWith(mockVariants[0]);
  });

  it('shows warning when cover teaser exceeds 68 chars and hides CoverComposerPanel on Slide 2+', () => {
    const longSlide: SlideData = {
      ...coverSlide,
      coverTeaserEn:
        'This teaser sentence is intentionally written to exceed sixty eight characters cleanly for validation testing',
    };

    const { rerender } = render(
      <CoverComposerPanel
        currentSlide={longSlide}
        theme={theme}
        onUpdateField={vi.fn()}
        onApplyCoverStyle={vi.fn()}
        onOpenVisualTab={vi.fn()}
      />
    );

    expect(
      screen.getByText('Keep under 68 chars so the teaser stays cleanly on one cover line.')
    ).toBeInTheDocument();

    const innerSlide: SlideData = {
      type: 'row',
      enTitle: 'Graph Pruning Pass.',
      arTitle: 'تمريرة تقليم الرسم البياني.',
      enBody: 'Removes redundant long-range edges safely.',
      arBody: 'يزيل الحواف الزائدة بأمان.',
    };

    rerender(
      <InlineSlideEditor
        currentSlide={innerSlide}
        currentSlideIndex={1}
        totalSlides={6}
        theme={theme}
        isAdvancedCustomizerOpen={false}
        onToggleAdvancedCustomizer={vi.fn()}
        onUpdateField={vi.fn()}
        onApplyCoverStyle={vi.fn()}
      />
    );

    expect(screen.queryByTestId('cover-composer-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('inline-graphic-transformer')).toBeInTheDocument();
  });
});
