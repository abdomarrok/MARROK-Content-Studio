import type { CaptionVariant, CarouselData, ExtractedFact, HookVariant, PostSourceMeta, SlideData } from '../../types.ts';
import {
  extractCleanHeadline,
  extractTopicFromFileName,
  isNonSemanticFileName,
  normalizePunctuation,
  sanitizeFullCarousel,
  sanitizeMetricForArabic,
  stripMarkdown,
} from '../text/index.ts';
import { enforceHeadlineSpecRule } from '../text/headlines.ts';
import type { DomainRule, SynthesisInput } from './domains.ts';
import {
  DEFAULT_RULE,
  DOMAIN_RULES,
  detectBrandAndUrl,
  extractDynamicIcons,
  extractUserInsights,
  resolveDomainTheme,
} from './domains.ts';
import { enrichCarouselDiagrams } from './enrichment.ts';
import { balanceCarouselVisualPacing } from './pacing.ts';
import { synthesizeUniversalCarousel } from './universalExtractor.ts';
import { seedSingleSlideTakeaways } from './singleSlideCondenser.ts';

/**
 * Universal Synthesis Engine:
 * Generates an authentic, topic-accurate 8-slide MARROK carousel directly from user input.
 * Fully algorithmic extraction: zero hardcoded topic presets.
 */
export function synthesizeCarousel(input: SynthesisInput): CarouselData {
  let rawText = (input.prompt || '').trim();
  if (!rawText && input.imageFileName) {
    const semanticTopic = extractTopicFromFileName(input.imageFileName);
    if (semanticTopic) {
      rawText = semanticTopic;
    }
  }

  // If input is still empty or a non-semantic filename, fall back to domain hint or system architecture
  if (!rawText || isNonSemanticFileName(rawText)) {
    if (input.categoryHint && input.categoryHint !== 'auto') {
      const hintMatch = DOMAIN_RULES.find((r) => r.category.includes(input.categoryHint!));
      rawText = hintMatch?.category || input.categoryHint;
    } else {
      rawText = 'System Architecture & Engineering';
    }
  }

  const lowerText = rawText.toLowerCase();

  // 1. Scored Domain Detection via Config Rules (highest specificity wins)
  let bestScore = 0;
  let matchedRule: DomainRule | undefined;

  for (const rule of DOMAIN_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      const kwRegex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (kwRegex.test(lowerText)) {
        if (['zero-trust', 'zerotrust', 'mtls', 'scion', 'monorepo', 'redis', 'redis 8', 'valkey', 'ebpf', 'cve', 'actix', 'gin', 'rust', 'go'].includes(kw)) {
          score += 10;
        } else {
          score += 2;
        }
      }
    }
    if (score > bestScore) {
      bestScore = score;
      matchedRule = rule;
    }
  }

  if (input.categoryHint && input.categoryHint !== 'auto') {
    const hintMatch = DOMAIN_RULES.find((r) => r.category.includes(input.categoryHint!));
    matchedRule = hintMatch || {
      ...DEFAULT_RULE,
      category: input.categoryHint.toUpperCase(),
    };
  }

  const autoTheme = resolveDomainTheme(rawText);
  const activeRule = bestScore > 0 && matchedRule ? matchedRule : DEFAULT_RULE;
  const domainCategory = activeRule.category;
  const recommendedTheme = bestScore > 0 && matchedRule ? activeRule.theme : autoTheme;

  // Extract smart subject-aware dynamic icons
  const { centerIcon, satIcons } = extractDynamicIcons(lowerText, activeRule.satIcons);

  // 2. Strict Brand Wordmark (Always MARROK per Spec)
  const { brand, brandUrl } = detectBrandAndUrl(lowerText);

  // 3. Extract Clean Title and User Points
  const { headline, cleanTitle, cleanSubject, arSubject } = extractCleanHeadline(rawText, domainCategory);
  const { lines, metrics } = extractUserInsights(rawText);

  const rawMetric1 = metrics[0] || activeRule.metricFallback;
  const metric1 = normalizePunctuation(stripMarkdown(rawMetric1)).replace(/[.?!]+$/, '');
  const arMetric1 = sanitizeMetricForArabic(metric1);

  // 4. Target Slide Count (Spec §7: 8 slides standard for carousel, 1 slide for Single-Slide Post)
  const isSinglePost = input.postFormat === 'single' || input.targetSlideCount === 1;
  const targetSlideCount = isSinglePost ? 8 : input.targetSlideCount || 8;

  // 5. Universal NLP Text Extractor & Slide Synthesis (Zero hardcoded topic presets)
  let slides: SlideData[] = synthesizeUniversalCarousel(rawText, {
    brand,
    brandUrl,
    targetSlideCount,
    domainCategory,
    theme: recommendedTheme,
    centerIcon,
    satIcons,
  });

  if (isSinglePost) {
    // Pick the highest-signal standalone technical archetype from synthesized candidates
    const hookSlide = slides[0];
    const ctaCandidate = slides[slides.length - 1];
    const codeCandidate = slides.find((s) => s.type === 'code' && s.codeSnippet);
    const compareCandidate = slides.find((s) => s.type === 'compare' && s.compareLeftTitle && s.compareRightTitle);
    const metricCandidate = slides.find((s) => s.type === 'metric' && s.metricValue);
    const schematicCandidate = slides.find((s) => s.type === 'row' && (s.diagramNodes?.length ?? 0) >= 3);

    const chosen =
      codeCandidate ||
      compareCandidate ||
      metricCandidate ||
      schematicCandidate ||
      hookSlide ||
      slides[0];

    const standaloneSlide: SlideData = {
      ...chosen,
      type: chosen.type === 'cta' || chosen.type === 'hub' ? 'poster' : chosen.type,
      enTitle: hookSlide?.enTitle || chosen.enTitle || headline,
      arTitle: hookSlide?.arTitle || chosen.arTitle || `تحليل معماري لمنظومة ${arSubject}.`,
      enBody: chosen.enBody || hookSlide?.enBody,
      arBody: chosen.arBody || hookSlide?.arBody,
      takeaways: seedSingleSlideTakeaways(chosen, domainCategory),
      enCredit: chosen.enCredit || ctaCandidate?.enCredit || '',
      arCredit: chosen.arCredit || ctaCandidate?.arCredit || '',
      url: chosen.url || brandUrl || 'marrok.org',
    };

    slides = enrichCarouselDiagrams([standaloneSlide], rawText, domainCategory, brand);
  } else {
    // Strict Safety Invariant: Guarantee Slide 1 is hub, final slide is cta, and NO mid-deck slide has type 'cta'
    slides = slides.map((s, idx) => {
      if (idx === 0) return { ...s, type: 'hub' };
      if (idx === slides.length - 1) return { ...s, type: 'cta' };
      if (s.type === 'cta' || s.type === 'hub') return { ...s, type: 'row' };
      return s;
    });

    // Dynamic Diagram & Satellite Enrichment
    slides = enrichCarouselDiagrams(slides, rawText, domainCategory, brand);
    slides = balanceCarouselVisualPacing(slides);
  }

  // Derive meaningful bullet takeaways for captions directly from synthesized deck if user provided none
  const userPoint1 = lines[0] || slides[1]?.enBody || slides[2]?.enBody || `Scaling ${cleanSubject} requires rethinking state isolation and memory allocation patterns.`;
  const userPoint2 = lines[1] || slides[slides.length - 2]?.enBody || `Decoupled authoritative state ensures compute resources scale with actual payload size.`;

  // 6. Universal Hook Variants (A/B testing) adhering strictly to Spec §8 with dynamic cover archetypes
  const hookVariants: HookVariant[] = [
    {
      tag: 'Curiosity & Shift',
      enTitle: slides[0]?.enTitle || headline,
      arTitle: slides[0]?.arTitle || `تحليل معماري لمنظومة ${arSubject}`,
      enBody: slides[0]?.enBody || `How architectural redesign solved scalability bottlenecks in ${domainCategory.toLowerCase()}.`,
      arBody: slides[0]?.arBody || `كيف أدت التحديات الهندسية إلى إعادة التفكير بالكامل في بنية النظام.`,
      centerIcon: slides[0]?.centerIcon || centerIcon,
      coverArchetype: 'hub',
      hookKicker: slides[0]?.hookKicker || `ARCHITECTURE SHIFT • ${cleanSubject.toUpperCase().slice(0, 16)}`,
    },
    {
      tag: 'Hard Metrics & Scale',
      enTitle: enforceHeadlineSpecRule(`How ${cleanSubject} hits ${metric1}`, { isHook: true }),
      arTitle: `معايير وأرقام الأداء الحقيقية (${arMetric1})`,
      enBody: `Key production benchmarks (${metric1}) and lessons learned under maximum concurrency.`,
      arBody: `أهم معايير الأداء والدروس المستفادة (${arMetric1}) من تشغيل الأنظمة تحت أقصى ضغط.`,
      centerIcon: 'gauge',
      coverArchetype: 'metric',
      hookKicker: `BENCHMARK SHOCK • ${metric1.toUpperCase().slice(0, 14)}`,
    },
    {
      tag: 'Architecture Showdown',
      enTitle: enforceHeadlineSpecRule(`Why ${cleanSubject} beats legacy limits`, { isHook: true }),
      arTitle: `تجاوز اختناقات النظام المعمارية`,
      enBody: `Moving beyond legacy bottlenecks to build modern high-efficiency software.`,
      arBody: `تجاوز الأساليب القديمة لبناء برمجيات عالية الكفاءة والموثوقية.`,
      centerIcon: 'shieldAlert',
      coverArchetype: 'compare',
      hookKicker: `PARADIGM VS LEGACY • ${cleanSubject.toUpperCase().slice(0, 14)}`,
    },
  ];

  // 7. Generate Dual Captions with Extracted Specifics & Grounding Citations
  const domainTag = domainCategory.replace(/[^a-zA-Z0-9]/g, '');
  const brandTag = brand.replace(/[^a-zA-Z0-9]/g, '');
  const hashtags = `#TechInArabic #هندسة_البرمجيات #${domainTag} #SoftwareEngineering #DevSecOps #TechTrends #SystemDesign #${brandTag} #برمجة`;

  const domainGroundingSources: { title: string; url: string }[] = [];

  const domainGroundingQueries: string[] = [
    `${brand} ${domainCategory} architecture benchmark`,
    `${headline} implementation production trade-offs`,
    `${domainCategory} performance telemetry`,
  ];

  const extractedFacts: ExtractedFact[] = [
    {
      text: `Primary architectural domain: ${domainCategory}`,
      type: 'claim',
      verified: 'unverified',
      evidence: `Synthesizer domain heuristics (unverified offline draft)`,
    },
    {
      text: `Brand attribution: ${brand}`,
      type: 'name',
      verified: 'unverified',
      evidence: `Brand wordmark configured in the studio; not an external source`,
    },
    {
      text: `Production benchmark / headline metric: ${metric1}`,
      type: 'number',
      verified: 'unverified',
      evidence: `Universal extractor metric scan from user input`,
    },
    {
      text: `Core architectural mechanism: ${userPoint1}`,
      type: 'claim',
      verified: 'unverified',
      evidence: `Universal NLP parsed insight from user text`,
    },
    {
      text: `Operational trade-offs and limits: ${userPoint2}`,
      type: 'claim',
      verified: 'unverified',
      evidence: `Spec §7 "Before You Switch / The Catch" hedge (offline draft)`,
    },
  ];

  const slide1ArHeader = (slides[0]?.arTitle || `كيف تعمل منظومة ${arSubject}`).replace(/[:.]\s*\n+/g, ' — ').replace(/\n+/g, ' — ').trim();
  const slide1EnHeader = (slides[0]?.enTitle || headline).replace(/[:.]\s*\n+/g, ' — ').replace(/\n+/g, ' — ').replace(/[:.]\s*$/, '').trim();
  const slide2Mechanism = (slides[1]?.enTitle || userPoint1).replace(/[.?!]+$/, '').trim();
  const slide2ArMechanism = (slides[1]?.arTitle || slides[1]?.arBody || '').split(/[.؟!،]/)[0].trim();

  const topicSeed = Array.from(slide1EnHeader).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const openerVariants = [
    {
      arLead: `${slide2ArMechanism || slide1ArHeader}: أين يكمن الاختناق الفعلي في بيئات الإنتاج؟`,
      enLead: `Inside ${cleanSubject}: why ${slide2Mechanism.toLowerCase()} changes the production calculus (${metric1}).`,
    },
    {
      arLead: `الأرقام وراء ${arSubject} (${metric1}): قراءة في البنية التنفيذية وحدود التوسع.`,
      enLead: `When ${cleanSubject} hits production scale, ${slide2Mechanism.toLowerCase()} becomes the deciding factor.`,
    },
    {
      arLead: `بعيداً عن العناوين السطحية — كيف تعالج منظومة ${arSubject} مشكلة ${slide2ArMechanism || 'الأداء'}؟`,
      enLead: `Breaking down the engineering mechanics behind ${cleanSubject} and ${slide2Mechanism.toLowerCase()}.`,
    },
    {
      arLead: `من النظرية إلى التشغيل الفعلي: ما الذي يكشفه تحليل ${arSubject} عند مستوى ${metric1}؟`,
      enLead: `From architecture to reality: how ${cleanSubject} handles ${slide2Mechanism.toLowerCase()} under load.`,
    },
    {
      arLead: `معادلة التكلفة والأداء في ${arSubject}: قراءة تقنية في ${slide2ArMechanism || 'آليات التنفيذ'}.`,
      enLead: `What the ${metric1} benchmark in ${cleanSubject} reveals about ${slide2Mechanism.toLowerCase()}.`,
    },
  ];
  const chosenOpener = openerVariants[topicSeed % openerVariants.length];

  const formattedBilingualCaption = `${chosenOpener.arLead}

${chosenOpener.enLead}

🔹 أبرز الآليات والنتائج / Key Engineering Takeaways:
• Domain: ${domainCategory}
• Core Mechanism: ${userPoint1}
• Production Metric: ${metric1}
• Operational Trade-off: ${userPoint2}

⚠️ Citations & Draft Facts (Offline Synthesizer Estimate):
• Unverified offline draft — creator review required before publishing
• No external source cited — add your primary source link before publishing

👇 ${slides[slides.length - 1]?.arTitle || 'كيف تتعاملون مع هذا التحدي في بيئات الإنتاج لديكم؟'}
${slides[slides.length - 1]?.enTitle || "What's your take on this architecture?"}

🎥 العلامة التجارية / Brand: https://marrok.org

${hashtags}`;

  const captionVariants: CaptionVariant[] = [
    {
      style: 'Executive Bulletins & Hard Metrics (Recommended)',
      caption: formattedBilingualCaption,
    },
    {
      style: 'Narrative Breakdown & Story',
      caption: `${chosenOpener.arLead}
الحل لا يكمن في الحلول المؤقتة، بل في إعادة تصميم المسار الهندسي من الجذور.

في هذه المراجعة التقنية لمنظومة ${cleanSubject}، نفكك كيف تتكامل آلية (${slide2Mechanism}) لتحقيق نتائج ملموسة (${metric1}) مع موازنة قيود التشغيل.

اسحب الشرائح لمتابعة التفصيل المعماري 👉
Swipe through the slides for the full engineering breakdown.

🔗 https://marrok.org

${hashtags}`,
    },
  ];

  const firstComment = `🔗 Add your primary source link here before publishing.\n\n${slides[slides.length - 1]?.enTitle || 'What are your thoughts on this architecture?'} Share your take below 👇`;
  const shortCaption = `${chosenOpener.arLead}\n${chosenOpener.enLead} 👉`;
  const screenHook = `${cleanSubject}: ${metric1}`;

  const sourceMeta: PostSourceMeta = {
    type: (input.inputMode === 'upload' || Boolean(input.imageFileName)) ? 'screenshot' : (rawText.length > 400 ? 'article' : 'notes'),
    title: headline,
    creator: brand,
    url: brandUrl ? `https://${brandUrl}` : 'https://marrok.org',
    published: new Date().toISOString().split('T')[0],
    isSearchGrounded: false,
    groundingQueries: domainGroundingQueries,
    groundingSources: domainGroundingSources,
    isFallback: true,
    engine: 'offline-synthesizer',
    status: 'unverified_draft',
    userReviewed: false,
  };

  const notesForHuman: string[] = [
    `Unverified offline draft: Synthesized from offline NLP heuristics without active web search grounding. Verify all numbers and claims before publication.`,
    `Review and customize slide copy using the studio editor, or connect a Gemini API key for live search-grounded research.`,
    `Bilingual Arabic typography checked for RTL line-endings and numbers positioned per Spec §9.`,
    `Add a verified primary source link before publishing; the offline draft does not fabricate citations.`,
  ];

  const scheduleSlot = '18:00–21:00 ME / 16:00–19:00 UTC (Peak developer engagement)';

  return sanitizeFullCarousel({
    postFormat: isSinglePost ? 'single' : 'carousel',
    theme: recommendedTheme,
    category: domainCategory,
    brand,
    brandUrl,
    caption: captionVariants[0].caption,
    firstComment,
    shortCaption,
    screenHook,
    sourceMeta,
    facts: extractedFacts,
    notesForHuman,
    scheduleSlot,
    captionVariants,
    hookVariants,
    slides,
  });
}
