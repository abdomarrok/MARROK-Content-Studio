import { describe, expect, it } from 'vitest';
import { parseCarouselData } from './carousel';

const validPayload = {
  id: 'deck-1',
  theme: 'cyber',
  category: 'SECURITY',
  caption: 'A bilingual caption',
  brand: 'MARROK',
  sourceMeta: {
    type: 'article',
    engine: 'gemini-ai',
    status: 'verified_live',
    groundingSources: [{ title: 'Example source', url: 'https://example.com' }],
  },
  facts: [
    {
      text: 'Measured 1.66x speedup',
      type: 'number',
      verified: 'partially_verified',
      sourceUrl: 'https://example.com',
    },
  ],
  captionVariants: [{ style: 'Executive', caption: 'Caption variant' }],
  hookVariants: [
    {
      tag: 'Curiosity',
      enTitle: 'Hook',
      arTitle: 'خطاف',
      enBody: 'Body',
      arBody: 'نص',
    },
  ],
  slides: [
    { type: 'hub', enTitle: 'Hook', arTitle: 'خطاف', satLabels: ['Ingress', 'Runtime'] },
    {
      type: 'metric',
      enTitle: 'Throughput',
      metricValue: '129k req/s',
      metricDiff: '▲ 1.66x',
      diagramVariant: 'not-a-real-variant',
    },
    { type: 'cta', enTitle: 'Scale', ctaText: 'DM us', url: 'https://marrok.org' },
  ],
  unknownHostileField: { nested: true },
};

describe('parseCarouselData', () => {
  it('accepts a valid carousel and strips unknown fields', () => {
    const parsed = parseCarouselData(validPayload, { minSlides: 3, requireSlideContent: true });

    expect(parsed).not.toBeNull();
    expect(parsed?.theme).toBe('cyber');
    expect(parsed?.slides).toHaveLength(3);
    expect(parsed?.slides[1].metricValue).toBe('129k req/s');
    expect(parsed?.slides[1].diagramVariant).toBeUndefined();
    expect(parsed).not.toHaveProperty('unknownHostileField');
    expect(parsed?.sourceMeta?.groundingSources?.[0].url).toBe('https://example.com');
  });

  it('rejects malformed roots and invalid slide arrays', () => {
    expect(parseCarouselData(null)).toBeNull();
    expect(parseCarouselData('{}')).toBeNull();
    expect(parseCarouselData({})).toBeNull();
    expect(parseCarouselData({ slides: [] })).toBeNull();
    expect(parseCarouselData({ slides: [{ enTitle: 'only one' }] }, { minSlides: 3 })).toBeNull();
    expect(parseCarouselData({ slides: [null, {}, {}] })).toBeNull();
  });

  it('infers missing slide types and normalizes optional fields', () => {
    const parsed = parseCarouselData({
      slides: [
        { enTitle: 'First' },
        { type: 'unknown', enTitle: 'Middle', imageFit: 'cover', imageFilter: 'tint' },
        { enTitle: 'Last' },
      ],
    });

    expect(parsed?.slides.map((slide) => slide.type)).toEqual(['hub', 'row', 'cta']);
    expect(parsed?.slides[1].imageFit).toBe('cover');
    expect(parsed?.slides[1].imageFilter).toBe('tint');
  });

  it('requires slide content only when requested', () => {
    const blankDeck = {
      slides: [{ type: 'row' }, { type: 'row' }, { type: 'row' }],
    };

    expect(parseCarouselData(blankDeck)).not.toBeNull();
    expect(parseCarouselData(blankDeck, { requireSlideContent: true })).toBeNull();
  });

  it('drops malformed optional metadata instead of rejecting the deck', () => {
    const parsed = parseCarouselData({
      sourceMeta: {
        type: 'not-a-source',
        groundingSources: [{ title: 'missing url' }, { title: 'ok', url: 'https://example.com' }],
        userReviewed: 'yes',
      },
      facts: [{ text: 'Fact', type: 'invalid-type', verified: 'invalid-status' }],
      slides: [
        { type: 'hub', enTitle: 'One' },
        { type: 'row', enTitle: 'Two' },
        { type: 'cta', enTitle: 'Three' },
      ],
    });

    expect(parsed?.sourceMeta?.type).toBeUndefined();
    expect(parsed?.sourceMeta?.userReviewed).toBeUndefined();
    expect(parsed?.sourceMeta?.groundingSources).toHaveLength(1);
    expect(parsed?.facts?.[0]).toMatchObject({ type: 'claim', verified: 'unverified' });
  });

  it('preserves poster archetype, takeaways, layoutOverrides, video fields, dimensionPreset, and reelConfig', () => {
    const posterDeck = {
      id: 'poster-1',
      postFormat: 'single',
      dimensionPreset: 'ig-4:5',
      reelConfig: {
        templateId: 'marrok-slides',
        duration: 8,
        sfxEnabled: true,
        brand: {
          name: 'MARROK',
          accentColor: '#00f5d4',
          bgColor: '#080d11',
          textColor: '#ffffff',
          font: 'Plus Jakarta Sans',
          direction: 'ltr',
        },
        scenes: [
          {
            id: 'scene-1',
            label: 'Hook',
            text: 'Zero Trust Mesh',
            from: 0,
            to: 4,
            springK: 180,
            springD: 18,
          },
        ],
      },
      slides: [
        {
          type: 'poster',
          enTitle: 'Zero-Trust Service Mesh',
          arTitle: 'شبكة انعدام الثقة',
          enBody: 'Isolate east-west traffic with mTLS.',
          arBody: 'عزل حركة المرور الداخلية.',
          compositionPreset: 'headline-first',
          freeMoveLayout: true,
          imageFrameMode: 'hero',
          imageBgStyle: 'white',
          brandWatermark: 'bottom-right',
          imageZoom: 1.25,
          imagePanX: 12,
          imagePanY: -8,
          mediaType: 'video',
          videoUrl: 'https://example.com/demo.mp4',
          videoMimeType: 'video/mp4',
          videoFileName: 'demo.mp4',
          videoDuration: 14.5,
          videoMuted: false,
          videoPlaying: true,
          videoBorderRadius: 36,
          takeaways: [
            {
              en: 'mTLS Everywhere — Automatic cert rotation',
              ar: 'تشفير شامل — تدوير تلقائي للشهادات',
              icon: 'lock',
            },
          ],
          layoutOverrides: {
            titleBlock: { dx: 15, dy: -24, scale: 1.15, align: 'center', opacity: 0.95 },
            graphicCard: { dx: 0, dy: 30, scale: 0.9, hidden: false },
          },
        },
      ],
    };

    const parsed = parseCarouselData(posterDeck, { minSlides: 3, requireSlideContent: true });
    expect(parsed).not.toBeNull();
    expect(parsed?.postFormat).toBe('single');
    expect(parsed?.dimensionPreset).toBe('ig-4:5');
    expect(parsed?.reelConfig?.templateId).toBe('marrok-slides');
    expect(parsed?.reelConfig?.duration).toBe(8);

    const slide = parsed!.slides[0];
    expect(slide.type).toBe('poster');
    expect(slide.compositionPreset).toBe('headline-first');
    expect(slide.freeMoveLayout).toBe(true);
    expect(slide.imageFrameMode).toBe('hero');
    expect(slide.imageBgStyle).toBe('white');
    expect(slide.brandWatermark).toBe('bottom-right');
    expect(slide.imageZoom).toBe(1.25);
    expect(slide.imagePanX).toBe(12);
    expect(slide.imagePanY).toBe(-8);
    expect(slide.mediaType).toBe('video');
    expect(slide.videoUrl).toBe('https://example.com/demo.mp4');
    expect(slide.videoDuration).toBe(14.5);
    expect(slide.takeaways).toHaveLength(1);
    expect(slide.takeaways?.[0].en).toContain('mTLS Everywhere');
    expect(slide.layoutOverrides?.titleBlock).toMatchObject({
      dx: 15,
      dy: -24,
      scale: 1.15,
      align: 'center',
      opacity: 0.95,
    });
  });

  it('orders CAROUSEL_RESPONSE_SCHEMA body-first before hookVariants and slide1 selection (Phase 1)', async () => {
    const { CAROUSEL_RESPONSE_SCHEMA } = await import('../../../api/prompts/systemPrompt.ts');
    const keys = Object.keys(CAROUSEL_RESPONSE_SCHEMA.properties);
    expect(keys.slice(0, 10)).toEqual([
      'theme',
      'category',
      'sourceMeta',
      'facts',
      'coreInsight',
      'slide2Draft',
      'slides',
      'hookVariants',
      'selectedHookIndex',
      'slide1',
    ]);
  });

  it('parses coreInsight, slide2Draft, selectedHookIndex and prepends separate slide1 onto body slides (Phase 1)', () => {
    const bodyFirstPayload = {
      theme: 'cyber',
      category: 'CYBERSECURITY',
      sourceMeta: { title: 'OpenJDK Advisory', creator: 'Security Team' },
      facts: [{ text: 'CVSS 9.8 critical RCE', type: 'number', verified: 'unconfirmed' }],
      coreInsight: 'Unpatched OpenJDK classloader paths allow silent RCE without authentication.',
      slide2Draft: {
        enTitle: 'Unpatched JVMs execute remote payloads',
        arTitle: 'الإصدارات غير المحدثة تنفذ شيفرات خبيثة',
        enBody: 'Deserializing untrusted streams bypasses sandbox checks.',
        arBody: 'تمرير البيانات غير الموثوقة يتجاوز العزل.',
      },
      slides: [
        { type: 'row', enTitle: 'Slide 2 Problem', arTitle: 'المشكلة', enBody: 'Body 2', arBody: 'نص 2' },
        { type: 'cta', enTitle: 'Are your nodes patched?', arTitle: 'هل حدثت خوادمك؟', enBody: '', arBody: '' },
      ],
      hookVariants: [
        {
          tag: 'Contrarian',
          framework: 'Contrarian',
          enTitle: 'One unpatched OpenJDK node exposes your entire cluster',
          arTitle: 'خادم OpenJDK واحد يكشف كل بيئة الإنتاج',
          enBody: '',
          arBody: '',
        },
      ],
      selectedHookIndex: 0,
      slide1: {
        type: 'metric',
        coverStyle: 'metric-split',
        enTitle: 'One unpatched OpenJDK node exposes your entire cluster',
        arTitle: 'خادم OpenJDK واحد يكشف كل بيئة الإنتاج',
        enBody: '',
        arBody: '',
        coverTeaserEn: 'Inside the exploit path and emergency patch steps',
        coverTeaserAr: 'تفاصيل مسار الاستغلال وخطوات الإغلاق الفوري',
        showSwipeCue: true,
      },
      caption: 'Bilingual security alert',
    };

    const parsed = parseCarouselData(bodyFirstPayload, { minSlides: 3, requireSlideContent: true });
    expect(parsed).not.toBeNull();
    expect(parsed?.coreInsight).toContain('Unpatched OpenJDK');
    expect(parsed?.slide2Draft?.enTitle).toBe('Unpatched JVMs execute remote payloads');
    expect(parsed?.selectedHookIndex).toBe(0);
    expect(parsed?.slides).toHaveLength(3);
    expect(parsed?.slides[0].enTitle).toBe('One unpatched OpenJDK node exposes your entire cluster');
    expect(parsed?.slides[0].coverStyle).toBe('metric-split');
    expect(parsed?.slides[1].enTitle).toBe('Slide 2 Problem');
    expect(parsed?.slides[2].type).toBe('cta');
  });

  it('keeps CAROUSEL_RESPONSE_SCHEMA within Gemini Flash Lite FSM complexity limits while keeping DIRECT_VISUAL_RESPONSE_SCHEMA rich', async () => {
    const { CAROUSEL_RESPONSE_SCHEMA, DIRECT_VISUAL_RESPONSE_SCHEMA } = await import(
      '../../../api/prompts/systemPrompt.ts'
    );

    let enumCount = 0;
    let totalProperties = 0;
    let maxObjectDepth = 0;

    const walk = (node: unknown, depth: number) => {
      if (!node || typeof node !== 'object') return;
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj.enum)) {
        enumCount += 1;
      }
      if (obj.properties && typeof obj.properties === 'object') {
        const nextDepth = depth + 1;
        if (nextDepth > maxObjectDepth) maxObjectDepth = nextDepth;
        for (const child of Object.values(obj.properties as Record<string, unknown>)) {
          totalProperties += 1;
          walk(child, nextDepth);
        }
      }
      if (obj.items && typeof obj.items === 'object') {
        walk(obj.items, depth);
      }
    };

    walk(CAROUSEL_RESPONSE_SCHEMA, 0);

    expect(enumCount).toBe(0);
    expect(totalProperties).toBeLessThanOrEqual(155);
    expect(maxObjectDepth).toBeLessThanOrEqual(4);

    // Slide 1 Cover Hero schema stays compact without duplicating body-only visualSpec/code fields
    const slide1Props = Object.keys(CAROUSEL_RESPONSE_SCHEMA.properties.slide1.properties);
    expect(slide1Props).not.toContain('visualSpec');
    expect(slide1Props).not.toContain('codeSnippet');
    expect(slide1Props).toContain('coverStyle');
    expect(slide1Props).toContain('coverTeaserEn');
    expect(slide1Props).toContain('coverTeaserAr');

    // Direct visual endpoint still retains the full visualSpec schema
    const directVisualProps = Object.keys(DIRECT_VISUAL_RESPONSE_SCHEMA.properties.visualSpec.properties);
    expect(directVisualProps).toContain('orientation');
    expect(directVisualProps).toContain('calloutStyle');
    expect(directVisualProps).toContain('svgCode');
  });
});
