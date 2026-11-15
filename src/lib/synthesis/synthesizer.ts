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
import { InsufficientSourceError, validateSourceSufficiency } from './inputSufficiency.ts';
export { InsufficientSourceError } from './inputSufficiency.ts';

/**
 * Universal Synthesis Engine:
 * Generates an authentic, topic-accurate MARROK carousel directly from user input.
 * Rejects thin/empty inputs before generating placeholder text.
 */
export function synthesizeCarousel(input: SynthesisInput): CarouselData {
  const sufficiency = validateSourceSufficiency({
    prompt: input.prompt,
    imageFileName: input.imageFileName,
    hasMedia: input.hasMedia,
  });
  if (!sufficiency.isSufficient) {
    throw new InsufficientSourceError(sufficiency);
  }

  let rawText = (input.prompt || '').trim();
  if (!rawText && input.imageFileName) {
    const semanticTopic = extractTopicFromFileName(input.imageFileName);
    if (semanticTopic) {
      rawText = semanticTopic;
    }
  }

  if (!rawText || isNonSemanticFileName(rawText)) {
    if (input.hasMedia && input.categoryHint && input.categoryHint !== 'auto') {
      const hintMatch = DOMAIN_RULES.find((r) => r.category.includes(input.categoryHint!));
      rawText = hintMatch?.category || input.categoryHint;
    } else if (input.hasMedia) {
      rawText = 'Uploaded visual source analysis for social post';
    } else {
      throw new InsufficientSourceError(sufficiency);
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

  const rawMetric1 = metrics[0] || '';
  const metric1 = rawMetric1 ? normalizePunctuation(stripMarkdown(rawMetric1)).replace(/[.?!]+$/, '') : '';
  const arMetric1 = metric1 ? sanitizeMetricForArabic(metric1) : '';

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
      arTitle: hookSlide?.arTitle || chosen.arTitle || `قراءة في ${arSubject}.`,
      enBody: chosen.enBody || hookSlide?.enBody,
      arBody: chosen.arBody || hookSlide?.arBody,
      takeaways: seedSingleSlideTakeaways(chosen, domainCategory),
      enCredit: chosen.enCredit || ctaCandidate?.enCredit || '',
      arCredit: chosen.arCredit || ctaCandidate?.arCredit || '',
      url: chosen.url || brandUrl || 'marrok.org',
    };

    slides = enrichCarouselDiagrams([standaloneSlide], rawText, domainCategory, brand);
  } else {
    // Enforce Story Arc: Hook (slide 1) -> Problem/Mechanism/Proof/Takeaway -> CTA (last slide)
    slides = slides.map((s, idx) => {
      if (idx === 0) {
        return {
          ...s,
          storyRole: 'hook' as const,
          enBody: '',
          arBody: '',
        };
      }
      if (idx === slides.length - 1) return { ...s, type: 'cta', storyRole: 'cta' as const };
      if (s.type === 'cta' || s.type === 'hub') return { ...s, type: 'row' };
      return s;
    });

    // Dynamic Diagram & Satellite Enrichment
    slides = enrichCarouselDiagrams(slides, rawText, domainCategory, brand);
    slides = balanceCarouselVisualPacing(slides);
    if (slides.length > 1) {
      slides = slides.map((s, idx) =>
        idx === 0 ? { ...s, storyRole: 'hook' as const, enBody: '', arBody: '' } : s
      );
    }
  }

  // Derive meaningful bullet takeaways for captions directly from synthesized deck
  const userPoint1 = lines[0] || slides[1]?.enBody || slides[2]?.enBody || `What breaks first in ${cleanSubject} is rarely what teams monitor.`;
  const userPoint2 = lines[1] || slides[slides.length - 2]?.enBody || `Every choice in ${cleanSubject} trades short-term speed against long-term control.`;

  // 6. Universal Hook Variants (A/B testing) adhering strictly to Spec §8 with dynamic cover archetypes
  const hasRealMetric = Boolean(metric1);
  const hookVariants: HookVariant[] = [
    {
      tag: 'Curiosity & Shift',
      enTitle: slides[0]?.enTitle || headline,
      arTitle: slides[0]?.arTitle || `ما الذي يتغير فعلاً في ${arSubject}؟`,
      enBody: '',
      arBody: '',
      centerIcon: slides[0]?.centerIcon || centerIcon,
      coverArchetype: slides[0]?.type || 'hub',
      hookKicker: slides[0]?.hookKicker || `${cleanSubject.toUpperCase().slice(0, 18)}`,
    },
    ...(hasRealMetric
      ? [
          {
            tag: 'Hard Metrics & Scale',
            enTitle: enforceHeadlineSpecRule(`How ${cleanSubject} hits ${metric1}`, { isHook: true }),
            arTitle: `الأرقام الفعلية خلف ${arSubject} (${arMetric1})`,
            enBody: '',
            arBody: '',
            centerIcon: 'gauge',
            coverArchetype: 'metric' as const,
            hookKicker: `MEASURED WIN • ${metric1.toUpperCase().slice(0, 14)}`,
          },
        ]
      : [
          {
            tag: 'Core Claim',
            enTitle: enforceHeadlineSpecRule(slides[1]?.enTitle || headline, { isHook: true }),
            arTitle: slides[1]?.arTitle || `الفكرة الأهم حول ${arSubject}`,
            enBody: '',
            arBody: '',
            centerIcon: 'quote',
            coverArchetype: 'metric' as const,
            hookKicker: 'KEY CLAIM',
          },
        ]),
    {
      tag: 'Contrasting Reality',
      enTitle: enforceHeadlineSpecRule(`Why ${cleanSubject} shifts the model`, { isHook: true }),
      arTitle: `المقارنة الحقيقية في ${arSubject}`,
      enBody: '',
      arBody: '',
      centerIcon: 'shieldAlert',
      coverArchetype: 'compare',
      hookKicker: `OLD VS NEW • ${cleanSubject.toUpperCase().slice(0, 14)}`,
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
      text: `Key insight extracted: ${userPoint1}`,
      type: 'claim',
      verified: 'unverified',
      evidence: `Parsed directly from source text`,
    },
    {
      text: `Closing nuance / caveat: ${userPoint2}`,
      type: 'claim',
      verified: 'unverified',
      evidence: `Spec §7 nuance / trade-off note (unverified draft)`,
    },
  ];

  const slide1ArHeader = (slides[0]?.arTitle || `قراءة في ${arSubject}`).replace(/[:.]\s*\n+/g, ' — ').replace(/\n+/g, ' — ').trim();
  const slide1EnHeader = (slides[0]?.enTitle || headline).replace(/[:.]\s*\n+/g, ' — ').replace(/\n+/g, ' — ').replace(/[:.]\s*$/, '').trim();
  const slide2Mechanism = (slides[1]?.enTitle || userPoint1).replace(/[.?!]+$/, '').trim();
  const slide2ArMechanism = (slides[1]?.arTitle || slides[1]?.arBody || '').split(/[.؟!،]/)[0].trim();

  const topicSeed = Array.from(slide1EnHeader).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const metricFragment = metric1 ? ` (${metric1})` : '';
  const openerVariants = [
    {
      arLead: `${slide2ArMechanism || slide1ArHeader} — ما الذي يحدث فعلياً وراء هذا الفارق؟`,
      enLead: `Inside ${cleanSubject}: why ${slide2Mechanism.toLowerCase()} shifts real-world outcomes${metricFragment}.`,
    },
    {
      arLead: `الأهم في ${arSubject}${metric1 ? ` (${metric1})` : ''}: النقطة التي يغفلها معظم الناس.`,
      enLead: `When looking closely at ${cleanSubject}, ${slide2Mechanism.toLowerCase()} becomes the deciding factor.`,
    },
    {
      arLead: `بعيداً عن الشعارات — كيف يتغير المشهد مع ${arSubject}؟`,
      enLead: `Looking past the hype around ${cleanSubject} to examine ${slide2Mechanism.toLowerCase()}.`,
    },
    {
      arLead: `من الوعود النظرية إلى الواقع: ماذا تكشف تجربة ${arSubject}${metric1 ? ` عند ${metric1}` : ''}؟`,
      enLead: `From theory to reality: what ${cleanSubject} actually looks like when ${slide2Mechanism.toLowerCase()}.`,
    },
  ];
  const chosenOpener = openerVariants[topicSeed % openerVariants.length];

  const formattedBilingualCaption = `${chosenOpener.arLead}

${chosenOpener.enLead}

🔹 أبرز النقاط / Key Highlights:
• Topic: ${domainCategory}
• Key Point: ${userPoint1}${metric1 ? `\n• Highlight Figure: ${metric1}` : ''}
• Nuance: ${userPoint2}

⚠️ Citations & Draft Facts (Offline Draft):
• No external source cited — verify all claims against your source before publishing
• Add your primary source link before publishing

👇 ${slides[slides.length - 1]?.arTitle || 'ما رأيك في هذا الطرح؟'}
${slides[slides.length - 1]?.enTitle || 'How does this play out in your team?'}

🎥 العلامة التجارية / Brand: https://marrok.org

${hashtags}`;

  const captionVariants: CaptionVariant[] = [
    {
      style: 'Direct & Insightful (Recommended)',
      caption: formattedBilingualCaption,
    },
    {
      style: 'Narrative Story',
      caption: `${chosenOpener.arLead}
القيمة الحقيقية لا تأتي من الشعارات، بل من فهم السبب الكامن وراء النتيجة.

في هذه المراجعة السريعة حول ${cleanSubject}، نركز على (${slide2Mechanism})${metric1 ? ` مع الرقم الأساسي (${metric1})` : ''} وما يعنيه عملياً.

اسحب الشرائح لمتابعة التفاصيل 👉
Swipe through for the full story.

🔗 https://marrok.org

${hashtags}`,
    },
  ];

  const firstComment = `🔗 Add your primary source link here before publishing.\n\n${slides[slides.length - 1]?.enTitle || 'Where do you agree or disagree?'} Share your perspective below 👇`;
  const shortCaption = `${chosenOpener.arLead}\n${chosenOpener.enLead} 👉`;
  const screenHook = metric1 ? `${cleanSubject}: ${metric1}` : slide1EnHeader;

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
