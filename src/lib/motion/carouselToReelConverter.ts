import {
  CarouselData,
  MotionBrandConfig,
  MotionReelData,
  MotionSceneConfig,
  MotionTemplateId,
  SlideData,
  ThemePalette,
} from '../../types.ts';
import { DEFAULT_BRAND } from './base.ts';

function cleanHeadline(str?: string, fallback = ''): string {
  const trimmed = (str || '').replace(/\.$/, '').trim();
  return trimmed || fallback;
}

function extractSlideNodes(slide?: SlideData): string[] {
  if (!slide) return ['KERNEL', 'ZERO-TRUST', 'SANDBOX', 'TELEMETRY'];
  if (slide.subjectPair) {
    const p = slide.subjectPair;
    return [
      p.storyOwner ? p.storyOwner.toUpperCase() : 'MIGRATION',
      (p.beforeSystem || 'BEFORE').toUpperCase(),
      '→',
      (p.afterSystem || 'AFTER').toUpperCase(),
    ];
  }
  if (slide.satLabels && slide.satLabels.length >= 2) {
    return slide.satLabels.filter(Boolean).slice(0, 4);
  }
  if (slide.diagramNodes && slide.diagramNodes.length >= 2) {
    return slide.diagramNodes
      .map((n) => n.label || n.sublabel || '')
      .filter(Boolean)
      .slice(0, 4);
  }
  if (slide.takeaways && slide.takeaways.length >= 2) {
    return slide.takeaways
      .map((t) => (t.en || t.ar || '').split(/\s+/).slice(0, 2).join(' '))
      .filter(Boolean)
      .slice(0, 4);
  }
  const words = (slide.enTitle || '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 4);
  if (words.length >= 3) {
    return words.slice(0, 4).map((w) => w.toUpperCase());
  }
  return ['INGESTION', 'ISOLATION', 'VERIFICATION', 'TELEMETRY'];
}

/**
 * Automatically converts a MARROK Carousel or Single-Slide deck into an animated Motion Reel
 * with full MARROK slide chrome, vector logo identity, and bilingual slide fields.
 */
export function convertCarouselToMotionReel(
  carousel: CarouselData,
  theme: ThemePalette,
  templateId: MotionTemplateId = 'marrok-slides',
  languageMode: 'ar' | 'en' | 'bilingual' = 'bilingual'
): MotionReelData {
  const slides = carousel.slides || [];
  const firstSlide = slides[0];
  const ctaSlide = slides[slides.length - 1];
  const bodySlides = slides.length > 2 ? slides.slice(1, slides.length - 1) : slides;

  const isArabic = languageMode === 'ar';
  const brandName = (carousel.brand || 'MARROK').toUpperCase();
  const category = (carousel.category || 'AI + SECURITY').toUpperCase();
  const channel = (carousel.channel || brandName).replace(/^@/, '');

  const brand: MotionBrandConfig = {
    ...DEFAULT_BRAND,
    name: brandName,
    accentColor: theme?.accent || '#6EA0FF',
    bgColor: theme?.baseBg || '#080A12',
    textColor: theme?.textWhite || '#FFFFFF',
    surfaceColor: theme?.surface || '#12131C',
    surfaceBorder: theme?.surfaceBorder || '#252838',
    alertColor: theme?.alert || '#FF3366',
    category,
    channel,
    font: languageMode === 'en' ? 'Plus Jakarta Sans' : 'Cairo',
    direction: languageMode === 'en' ? 'ltr' : 'rtl',
  };

  const pickTitle = (idx: number, arFallback: string, enFallback: string): string => {
    const s = slides[idx];
    if (!s) return isArabic ? arFallback : enFallback;
    if (languageMode === 'ar') return cleanHeadline(s.arTitle || s.enTitle, arFallback);
    if (languageMode === 'en') return cleanHeadline(s.enTitle || s.arTitle, enFallback);
    const ar = cleanHeadline(s.arTitle, '');
    const en = cleanHeadline(s.enTitle, '');
    return ar || en || arFallback;
  };

  const condenseReelBody = (raw?: string, maxChars = 110): string => {
    const clean = (raw || '').replace(/\s+/g, ' ').trim();
    if (!clean || clean.length <= maxChars) return clean;
    // Prefer first complete sentence if it fits within maxChars
    const firstSentence = clean.split(/(?<=[.?!।؟])\s+/)[0];
    if (firstSentence && firstSentence.length >= 24 && firstSentence.length <= maxChars) {
      return firstSentence;
    }
    // Otherwise trim cleanly at a clause or word boundary
    const words = clean.split(' ');
    let out = '';
    for (const w of words) {
      if ((out + ' ' + w).trim().length > maxChars - 1) break;
      out = (out + ' ' + w).trim();
    }
    out = out.replace(/[,;:\-—–]+$/, '').trim();
    if (!/[.?!؟]$/.test(out)) {
      out += '.';
    }
    return out;
  };

  const enrichSceneFromSlide = (
    baseScene: MotionSceneConfig,
    slide?: SlideData,
    stepIdx = 0
  ): MotionSceneConfig => {
    if (!slide) return baseScene;
    return {
      ...baseScene,
      slideType: baseScene.slideType || slide.type || 'hub',
      enTitle: cleanHeadline(slide.enTitle, baseScene.enTitle || baseScene.label),
      arTitle: cleanHeadline(slide.arTitle, baseScene.arTitle || baseScene.text),
      enBody: condenseReelBody(slide.enBody, 110),
      arBody: condenseReelBody(slide.arBody, 115),
      stepNumber: slide.stepNumber || String(stepIdx + 1).padStart(2, '0'),
      metricValue: slide.metricValue || baseScene.metricValue,
      metricLabel: slide.metricLabel || baseScene.metricLabel,
      codeSnippet: slide.codeSnippet || baseScene.codeSnippet,
      nodes: extractSlideNodes(slide),
      ctaText: slide.ctaText || baseScene.ctaText,
    };
  };

  // Extract 3 staggered feature items separated by ' | '
  const extractStaggeredItems = (): string => {
    if (firstSlide?.takeaways && firstSlide.takeaways.length >= 2) {
      return firstSlide.takeaways
        .slice(0, 3)
        .map((t) => cleanHeadline(isArabic ? t.ar || t.en : t.en || t.ar))
        .filter(Boolean)
        .join(' | ');
    }

    const items = bodySlides
      .slice(0, 3)
      .map((s) => cleanHeadline(isArabic ? s.arTitle || s.enTitle : s.enTitle || s.arTitle))
      .filter(Boolean);

    if (items.length >= 2) {
      return items.join(' | ');
    }

    return isArabic
      ? 'عزل النواة | تشفير فوري | صفر ثقة'
      : 'Kernel Isolation | Zero-Trust Mesh | Instant Scale';
  };

  // Extract metric value if any slide has metricValue
  const metricSlide = slides.find((s) => s.metricValue && s.metricValue.trim().length > 0);
  const metricText = metricSlide?.metricValue?.trim() || '200x';

  const ctaText = cleanHeadline(
    isArabic
      ? ctaSlide?.arTitle || ctaSlide?.ctaText || 'تابع للمزيد من التحليلات'
      : ctaSlide?.enTitle || ctaSlide?.ctaText || 'Follow for Deep Tech Breakdowns',
    isArabic ? 'تابع للمزيد من التحليلات' : 'Follow for Deep Tech'
  );

  let scenes: MotionSceneConfig[] = [];

  if (templateId === 'marrok-slides') {
    if (slides.length === 1 && firstSlide) {
      // Single-Slide Poster -> 4 animated MARROK slide scenes (4.5s each = 18.0s)
      scenes = [
        enrichSceneFromSlide(
          {
            id: 'scene-1',
            label: 'Slide 01 · Hook & Hub',
            text: pickTitle(0, 'لماذا تفشل الأنظمة؟', 'Why Legacy Systems Fail'),
            slideType: firstSlide.type || 'hub',
            from: 0,
            to: 4.5,
            springK: 220,
            springD: 20,
          },
          firstSlide,
          0
        ),
        {
          id: 'scene-2',
          label: 'Slide 02 · Key Takeaways (|)',
          text: extractStaggeredItems(),
          enTitle: cleanHeadline(firstSlide.enTitle, 'CORE ARCHITECTURAL TAKEAWAYS'),
          arTitle: cleanHeadline(firstSlide.arTitle, 'الخلاصة الهندسية الأساسية'),
          slideType: 'row',
          stepNumber: '02',
          nodes: extractSlideNodes(firstSlide),
          from: 4.5,
          to: 9.0,
          springK: 210,
          springD: 22,
        },
        enrichSceneFromSlide(
          {
            id: 'scene-3',
            label: 'Slide 03 · Benchmark Metric',
            text: metricText,
            slideType: firstSlide.codeSnippet ? 'code' : 'metric',
            metricValue: metricText,
            from: 9.0,
            to: 13.5,
            springK: 240,
            springD: 18,
          },
          firstSlide,
          2
        ),
        enrichSceneFromSlide(
          {
            id: 'scene-4',
            label: 'Slide 04 · Follow @MARROK',
            text: `FOLLOW @${brandName}`,
            slideType: 'cta',
            ctaText: `FOLLOW @${brandName}`,
            from: 13.5,
            to: 18.0,
            springK: 220,
            springD: 20,
          },
          firstSlide,
          3
        ),
      ];
    } else if (slides.length > 0) {
      // Multi-slide Carousel -> Map slides 1:1 into animated MARROK slide scenes (4.5s per slide for comfortable bilingual reading)
      const targetSlides = slides.slice(0, 8);
      const sceneDur = 4.5;
      scenes = targetSlides.map((slide, idx) => {
        const from = Number((idx * sceneDur).toFixed(1));
        const to = Number(((idx + 1) * sceneDur).toFixed(1));
        const stepStr = String(idx + 1).padStart(2, '0');
        const primaryText =
          slide.type === 'metric' && slide.metricValue
            ? slide.metricValue
            : pickTitle(idx, 'تحليل معماري', 'Architectural Breakdown');

        return enrichSceneFromSlide(
          {
            id: `scene-${idx + 1}`,
            label: `Slide ${stepStr} · ${(slide.type || 'row').toUpperCase()}`,
            text: primaryText,
            slideType: slide.type || (idx === 0 ? 'hub' : idx === targetSlides.length - 1 ? 'cta' : 'row'),
            from,
            to,
            springK: slide.type === 'metric' ? 250 : 220,
            springD: 20,
          },
          slide,
          idx
        );
      });
    }
  } else if (templateId === 'brand-intro') {
    scenes = [
      enrichSceneFromSlide(
        {
          id: 'scene-1',
          label: 'Geometric Build',
          text: '',
          from: 0,
          to: 3,
          springK: 180,
          springD: 22,
        },
        slides[0],
        0
      ),
      enrichSceneFromSlide(
        {
          id: 'scene-2',
          label: 'Logo Reveal',
          text: brandName,
          from: 3,
          to: 6,
          springK: 200,
          springD: 20,
        },
        slides[1] || slides[0],
        1
      ),
      enrichSceneFromSlide(
        {
          id: 'scene-3',
          label: 'Topic Tagline',
          text: pickTitle(0, 'هندسة الأنظمة والأمن السيبراني', 'System Architecture & Security'),
          from: 6,
          to: 9.5,
          springK: 180,
          springD: 22,
        },
        slides[2] || slides[0],
        2
      ),
      enrichSceneFromSlide(
        {
          id: 'scene-4',
          label: 'End Card Lockup',
          text: carousel.category || brandName,
          from: 9.5,
          to: 12.5,
          springK: 190,
          springD: 22,
        },
        ctaSlide,
        3
      ),
    ];
  } else if (templateId === 'product-showcase') {
    scenes = [
      enrichSceneFromSlide(
        {
          id: 'scene-1',
          label: 'Problem Hook',
          text: pickTitle(0, 'عنق الزجاجة في الأداء؟', 'Why Legacy Systems Stall?'),
          from: 0,
          to: 3,
          springK: 240,
          springD: 20,
        },
        slides[0],
        0
      ),
      enrichSceneFromSlide(
        {
          id: 'scene-2',
          label: 'Architecture Reveal',
          text: pickTitle(1, 'معمارية الجيل الجديد', 'Next-Gen Architecture'),
          from: 3,
          to: 6.5,
          springK: 200,
          springD: 22,
        },
        slides[1] || slides[0],
        1
      ),
      {
        id: 'scene-3',
        label: 'Key Mechanisms (|)',
        text: extractStaggeredItems(),
        enTitle: cleanHeadline(slides[2]?.enTitle, 'KEY ARCHITECTURAL MECHANISMS'),
        arTitle: cleanHeadline(slides[2]?.arTitle, 'الآليات المعمارية الأساسية'),
        from: 6.5,
        to: 10.5,
        springK: 210,
        springD: 22,
      },
      enrichSceneFromSlide(
        {
          id: 'scene-4',
          label: 'Benchmark Metric',
          text: metricText,
          metricValue: metricText,
          from: 10.5,
          to: 13.5,
          springK: 260,
          springD: 18,
        },
        metricSlide || slides[3] || slides[0],
        3
      ),
      enrichSceneFromSlide(
        {
          id: 'scene-5',
          label: 'Call to Action',
          text: ctaText,
          from: 13.5,
          to: 16.5,
          springK: 220,
          springD: 22,
        },
        ctaSlide,
        4
      ),
    ];
  } else {
    // kinetic-text (6 scenes)
    scenes = [
      enrichSceneFromSlide(
        {
          id: 'scene-1',
          label: 'Hook Headline',
          text: pickTitle(0, 'لماذا تفشل الأنظمة؟', 'Why Legacy Systems Fail'),
          from: 0,
          to: 3,
          springK: 260,
          springD: 20,
        },
        slides[0],
        0
      ),
      enrichSceneFromSlide(
        {
          id: 'scene-2',
          label: 'Core Reveal',
          text: pickTitle(1, 'الهندسة العكسية والأمن', 'Deep Architectural Breakdown'),
          from: 3,
          to: 6.5,
          springK: 220,
          springD: 22,
        },
        slides[1] || slides[0],
        1
      ),
      {
        id: 'scene-3',
        label: 'Staggered Pillars (|)',
        text: extractStaggeredItems(),
        enTitle: cleanHeadline(slides[2]?.enTitle, 'CORE SYSTEM PILLARS'),
        arTitle: cleanHeadline(slides[2]?.arTitle, 'الركائز الهندسية الأساسية'),
        from: 6.5,
        to: 11,
        springK: 200,
        springD: 22,
      },
      enrichSceneFromSlide(
        {
          id: 'scene-4',
          label: 'Brand Focus',
          text: brandName,
          from: 11,
          to: 14,
          springK: 240,
          springD: 20,
        },
        slides[3] || slides[0],
        3
      ),
      enrichSceneFromSlide(
        {
          id: 'scene-5',
          label: 'Domain Tagline',
          text: category,
          from: 14,
          to: 17,
          springK: 180,
          springD: 24,
        },
        slides[4] || slides[0],
        4
      ),
      enrichSceneFromSlide(
        {
          id: 'scene-6',
          label: 'Call to Action',
          text: ctaText,
          from: 17,
          to: 20,
          springK: 220,
          springD: 22,
        },
        ctaSlide,
        5
      ),
    ];
  }

  const duration = Math.max(...scenes.map((s) => s.to), 12);

  return {
    templateId,
    brand,
    duration,
    scenes,
    sfxEnabled: true,
    sfxProfile: 'warm-foley',
    defaultTransition: 'auto',
    languageMode,
    category,
    channel,
    showCadReticles: carousel.visualOptions?.showCadReticles !== false,
  };
}
