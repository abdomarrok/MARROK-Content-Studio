import { describe, it, expect } from 'vitest';
import {
  applyViralHookTierSelection,
  countHeadlineWords,
  scoreHookVariant,
} from './hookTier.ts';
import {
  CAROUSEL_RESPONSE_SCHEMA,
  MARROK_SYSTEM_PROMPT,
  buildUserCarouselPrompt,
} from '../../../api/prompts/systemPrompt.ts';
import { extractVideoStoryboardDataUrl } from '../canvas/videoFrameExtractor.ts';
import type { CarouselData } from '../../types.ts';

describe('Viral Copywriter Pipeline & Automated 5-Hook Selection Tier', () => {
  it('embeds the 4-step pipeline, hard constraints, negative constraints, and video timeline cues in systemPrompt.ts', () => {
    expect(MARROK_SYSTEM_PROMPT).toContain('expert viral copywriter and conversion strategist');
    expect(MARROK_SYSTEM_PROMPT).toContain('DRAFT BODY SLIDES FIRST');
    expect(MARROK_SYSTEM_PROMPT).toContain('1 Idea Per Slide');
    expect(MARROK_SYSTEM_PROMPT).toContain('UNDER 20 WORDS');
    expect(MARROK_SYSTEM_PROMPT).toContain('GENERATE 5 HOOK VARIATIONS');
    expect(MARROK_SYSTEM_PROMPT).toContain('Contrarian');
    expect(MARROK_SYSTEM_PROMPT).toContain('Specific Metric');
    expect(MARROK_SYSTEM_PROMPT).toContain('Mistake Callout');
    expect(MARROK_SYSTEM_PROMPT).toContain('Curiosity Gap');
    expect(MARROK_SYSTEM_PROMPT).toContain('6 to 12 words');
    expect(MARROK_SYSTEM_PROMPT).toContain('under 8 words');
    expect(MARROK_SYSTEM_PROMPT).toContain('Ultimate Guide');
    expect(MARROK_SYSTEM_PROMPT).toContain('Unlock');
    expect(MARROK_SYSTEM_PROMPT).toContain('Game-changing');
    expect(MARROK_SYSTEM_PROMPT).toContain('video timeline');

    const userPrompt = buildUserCarouselPrompt({
      rawPrompt: 'Analyze Frame #1 and Frame #2 in the video timeline showing Redis connection saturation',
      safeInputMode: 'video',
      hasImage: true,
      postFormat: 'carousel',
    });
    expect(userPrompt).toContain('5 distinct Slide 1 options');
    expect(userPrompt).toContain('under 20 words');
    expect(userPrompt).toContain('6 to 12 words');
    expect(userPrompt).toContain('VIDEO TIMELINE');

    expect(CAROUSEL_RESPONSE_SCHEMA.properties.hookVariants.description).toContain('5 Slide 1 Hook variations');
  });

  it('penalizes banned clichés, colons, and emojis while rewarding specific 6-12 word hooks', () => {
    const bodySlides = [
      {
        type: 'compare' as const,
        enTitle: 'Connection spikes stall Postgres at 85ms.',
        arTitle: 'ارتفاع الاتصالات يبطئ Postgres',
        enBody: 'Direct TCP handshakes exhaust worker memory pools.',
        arBody: 'الاتصالات المباشرة تستنزف الذاكرة بسرعة.',
      },
    ];

    const clicheHook = scoreHookVariant(
      {
        tag: 'Guide',
        enTitle: 'The Ultimate Guide: Unlock Game-changing Postgres 🚀',
        arTitle: 'الدليل الشامل لقواعد البيانات',
        enBody: 'Everything you need to know about scaling databases forever in production',
        arBody: '',
      },
      bodySlides
    );

    const strongMetricHook = scoreHookVariant(
      {
        tag: 'Specific Metric',
        framework: 'Specific Metric',
        enTitle: 'Why direct Postgres connections quietly stall your API at 85ms latency',
        arTitle: 'لماذا تبطئ الاتصالات المباشرة استجابة Postgres عند 85ms',
        enBody: 'PgBouncer cuts pooling overhead dramatically.',
        arBody: '',
      },
      bodySlides
    );

    expect(clicheHook.hasNegativeViolation).toBe(true);
    expect(strongMetricHook.hasNegativeViolation).toBe(false);
    expect(strongMetricHook.wordCount).toBeGreaterThanOrEqual(6);
    expect(strongMetricHook.wordCount).toBeLessThanOrEqual(12);
    expect(strongMetricHook.score).toBeGreaterThan(clicheHook.score + 30);
  });

  it('generates 5 scored hook variations across all 4 frameworks, selects the winner for Slide 1, and enforces constraints', () => {
    const rawCarousel: CarouselData = {
      theme: 'teal',
      category: 'DATABASE SYSTEMS',
      caption: 'Bilingual caption body',
      hookVariants: [
        {
          tag: 'Cliche',
          enTitle: 'The Ultimate Guide: Unlock PgBouncer Pooling 🔥',
          arTitle: 'الدليل الشامل: PgBouncer 🔥',
          enBody: 'Learn everything about connection pooling in production environments today',
          arBody: 'تعلم كل شيء عن إدارة الاتصالات اليوم',
        },
        {
          tag: 'Specific Metric',
          framework: 'Specific Metric',
          enTitle: 'How dropping TCP pooling overhead cut Postgres tail latency by 88%',
          arTitle: 'كيف خفض تقليص الاتصالات زمن Postgres بنسبة 88%',
          enBody: 'Transaction pooling keeps workers lean.',
          arBody: 'التجميع يحافظ على خفة المعالجة.',
        },
      ],
      slides: [
        {
          type: 'hub',
          enTitle: 'Unlock: Postgres Guide 🚀',
          arTitle: 'دليل Postgres 🔥',
          enBody: 'This sub-headline definitely exceeds the strict eight word limit on cover slides.',
          arBody: '',
        },
        {
          type: 'row',
          enTitle: 'Worker threads block on handshakes.',
          arTitle: 'تعطل المسارات عند المصافحة',
          enBody: 'Each unpooled connection consumes 10MB RAM under peak load.',
          arBody: 'كل اتصال مباشر يستهلك 10MB من الذاكرة.',
        },
        {
          type: 'cta',
          enTitle: 'Do your workers pool connections?',
          arTitle: 'هل تستخدم التجميع في بيئتك؟',
          enBody: 'Share your setup below.',
          arBody: 'شاركنا تجربتك بالأسفل.',
        },
      ],
    };

    const result = applyViralHookTierSelection(rawCarousel, 'Postgres transaction pooling reduces tail latency by 88%');
    expect(result.hookVariants).toHaveLength(5);

    const frameworks = new Set((result.hookVariants || []).map((v) => v.framework));
    expect(frameworks.has('Contrarian')).toBe(true);
    expect(frameworks.has('Specific Metric')).toBe(true);
    expect(frameworks.has('Mistake Callout')).toBe(true);
    expect(frameworks.has('Curiosity Gap')).toBe(true);

    const winners = (result.hookVariants || []).filter((v) => v.selected);
    expect(winners).toHaveLength(1);
    expect(winners[0].score).toBe(result.hookVariants?.[0].score);

    const slide1Words = countHeadlineWords(result.slides[0].enTitle);
    expect(slide1Words).toBeGreaterThanOrEqual(6);
    expect(slide1Words).toBeLessThanOrEqual(12);
    expect(result.slides[0].enTitle).not.toMatch(/ultimate guide|unlock|game[- ]?chang/i);
    expect(result.slides[0].enTitle).not.toContain(':');
    expect(result.slides[0].enTitle).not.toMatch(/[\p{Extended_Pictographic}]/u);

    const subWords = countHeadlineWords(result.slides[0].enBody);
    expect(subWords).toBeLessThan(8);
  });

  it('extracts structured chronological timelineCues from video storyboards', async () => {
    const storyboard = await extractVideoStoryboardDataUrl(
      'blob:http://localhost:3000/pgbouncer-latency-trace.mp4',
      'pgbouncer-latency-trace.mp4'
    );
    expect(storyboard.timelineCues).toBeDefined();
    expect(storyboard.timelineCues?.frameCount).toBe(4);
    expect(storyboard.timelineCues?.frameTimestampsSec).toHaveLength(4);
    expect(storyboard.timelineCues?.timelineSummary).toContain('FRAME #1');
    expect(storyboard.timelineCues?.timelineSummary).toContain('FRAME #4');
  });

  it('strictly penalizes generic filler phrases like "shifts the model" and "المقارنة الحقيقية في الأنظمة المعمارية" in scoreHookVariant', () => {
    const bodySlides = [
      {
        type: 'compare' as const,
        enTitle: 'Unbuffered WAL fsync stalls disk writes at 42ms.',
        arTitle: 'تعطل الكتابة في WAL عند 42ms بسبب fsync',
        enBody: 'Group commit batches transaction flushes before disk exhaustion hits.',
        arBody: 'تجميع عمليات الإيداع يقلل تعطل القرص تحت الضغط.',
        metricValue: '42ms',
      },
    ];

    const fillerEn = scoreHookVariant(
      {
        tag: 'Contrarian',
        enTitle: 'Why PostgreSQL shifts the model under heavy load',
        arTitle: 'عنوان قصير حول Postgres فعلياً',
        enBody: '',
        arBody: '',
      },
      bodySlides
    );

    const fillerAr = scoreHookVariant(
      {
        tag: 'Contrarian',
        enTitle: 'Why unbuffered fsync calls slow database transactions down',
        arTitle: 'المقارنة الحقيقية في الأنظمة المعمارية',
        enBody: '',
        arBody: '',
      },
      bodySlides
    );

    const slide2Grounded = scoreHookVariant(
      {
        tag: 'Specific Metric',
        framework: 'Specific Metric',
        enTitle: 'Why unbuffered WAL fsync stalls database writes at 42ms',
        arTitle: 'لماذا يبطئ WAL fsync الكتابة عند 42ms',
        enBody: '',
        arBody: '',
      },
      bodySlides
    );

    expect(fillerEn.hasNegativeViolation).toBe(true);
    expect(fillerEn.reasons.join(' ')).toContain('Generic filler phrase detected');
    expect(fillerAr.hasNegativeViolation).toBe(true);
    expect(slide2Grounded.hasNegativeViolation).toBe(false);
    expect(slide2Grounded.score).toBeGreaterThan(fillerEn.score + 35);
    expect(slide2Grounded.score).toBeGreaterThan(fillerAr.score + 35);
  });

  it('eliminates hardcoded template strings from synthesized hooks and replaces Slide 1 filler even with preserveValidSlide1=true', async () => {
    const { synthesizeCarousel } = await import('./synthesizer.ts');
    const deck = synthesizeCarousel({
      prompt: 'Kafka ISR shrinking drops throughput by 40% during broker disk saturation spikes.',
    });

    const serializedHooks = JSON.stringify({
      slide1: deck.slides[0],
      hookVariants: deck.hookVariants,
    });
    expect(serializedHooks).not.toMatch(/shifts?\s+the\s+model/i);
    expect(serializedHooks).not.toContain('المقارنة الحقيقية في');
    expect(serializedHooks).not.toContain('الأنظمة المعمارية');
    expect(serializedHooks).not.toContain('hidden pipeline bottlenecks');
    expect(serializedHooks).not.toContain('under real production traffic');

    expect(MARROK_SYSTEM_PROMPT).toContain('CRITICAL SLIDE 2 GROUNDING RULE');
    expect(MARROK_SYSTEM_PROMPT).toContain('shifts the model');
    expect(MARROK_SYSTEM_PROMPT).toContain('المقارنة الحقيقية في الأنظمة المعمارية');

    // Also verify preserveValidSlide1 still rejects & replaces a Slide 1 containing "shifts the model"
    const pollutedDeck: CarouselData = {
      theme: 'teal',
      category: 'DISTRIBUTED LOGS',
      caption: 'Kafka ISR saturation behavior',
      slides: [
        {
          type: 'compare',
          enTitle: 'Why Kafka ISR shifts the model for broker replication',
          arTitle: 'المقارنة الحقيقية في الأنظمة المعمارية',
          enBody: '',
          arBody: '',
        },
        {
          type: 'metric',
          metricValue: '40%',
          enTitle: 'Broker disk saturation shrinks active ISR replicas.',
          arTitle: 'تشبع القرص يقلص نسخ ISR بنسبة 40%',
          enBody: 'High iowait forces replication timeouts and drops throughput by 40%.',
          arBody: 'تأخر القرص يرفع زمن الاستجابة ويخفض الإنتاجية بنسبة 40%.',
        },
        {
          type: 'cta',
          enTitle: 'How do you monitor Kafka iowait?',
          arTitle: 'كيف تراقب ضغط القرص في Kafka؟',
          enBody: 'Share your threshold below.',
          arBody: 'شاركنا تجربتك بالأسفل.',
        },
      ],
    };

    const cleaned = applyViralHookTierSelection(pollutedDeck, '', { preserveValidSlide1: true });
    expect(cleaned.slides[0].enTitle).not.toMatch(/shifts?\s+the\s+model/i);
    expect(cleaned.slides[0].arTitle).not.toContain('المقارنة الحقيقية');
    expect(cleaned.slides[0].enTitle?.toLowerCase()).toMatch(/40%|isr|saturation|disk|iowait|replication/);
  });
});
