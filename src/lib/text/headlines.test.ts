import { describe, expect, it } from 'vitest';
import {
  enforceHeadlineSpecRule,
  extractCleanHeadline,
  extractCleanSubject,
  extractTopicFromFileName,
  isNonSemanticFileName,
} from './headlines';

describe('isNonSemanticFileName', () => {
  it('identifies pure numeric filenames as non-semantic', () => {
    expect(isNonSemanticFileName('20760.png')).toBe(true);
    expect(isNonSemanticFileName('20760png')).toBe(true);
    expect(isNonSemanticFileName('20760')).toBe(true);
    expect(isNonSemanticFileName('100002345.jpg')).toBe(true);
  });

  it('identifies camera, mobile, and screenshot filenames as non-semantic', () => {
    expect(isNonSemanticFileName('IMG_20760.jpg')).toBe(true);
    expect(isNonSemanticFileName('DSC_0012.JPG')).toBe(true);
    expect(isNonSemanticFileName('PXL_20261027_1052.png')).toBe(true);
    expect(isNonSemanticFileName('Screenshot_20261027-105200.png')).toBe(true);
    expect(isNonSemanticFileName('Screen Shot 2026-10-27 at 10.52.00 AM.png')).toBe(true);
    expect(isNonSemanticFileName('Screenshot.png')).toBe(true);
    expect(isNonSemanticFileName('Capture.PNG')).toBe(true);
    expect(isNonSemanticFileName('pasted image.png')).toBe(true);
    expect(isNonSemanticFileName('image.png')).toBe(true);
    expect(isNonSemanticFileName('photo.jpg')).toBe(true);
  });

  it('identifies hex hashes and uuid filenames as non-semantic', () => {
    expect(isNonSemanticFileName('44b08b41.jpg')).toBe(true);
    expect(isNonSemanticFileName('637edc85.jpg')).toBe(true);
    expect(isNonSemanticFileName('a1b2c3d4-e5f6-7890-abcd-ef1234567890.png')).toBe(true);
  });

  it('recognizes authentic human-named technical topics as semantic', () => {
    expect(isNonSemanticFileName('distributed-caching-architecture.png')).toBe(false);
    expect(isNonSemanticFileName('vector-databases.png')).toBe(false);
    expect(isNonSemanticFileName('zero-trust-mesh.jpg')).toBe(false);
    expect(isNonSemanticFileName('Rust Actix vs Go Gin')).toBe(false);
    expect(isNonSemanticFileName('Scion Architecture')).toBe(false);
  });
});

describe('extractTopicFromFileName', () => {
  it('returns null for non-semantic filenames', () => {
    expect(extractTopicFromFileName('20760.png')).toBeNull();
    expect(extractTopicFromFileName('IMG_20760.jpg')).toBeNull();
    expect(extractTopicFromFileName('Screenshot 2026-10-27.png')).toBeNull();
    expect(extractTopicFromFileName('image.png')).toBeNull();
    expect(extractTopicFromFileName('44b08b41.jpg')).toBeNull();
    expect(extractTopicFromFileName('')).toBeNull();
    expect(extractTopicFromFileName(undefined)).toBeNull();
  });

  it('extracts and formats clean title-cased topic from human-named filenames', () => {
    expect(extractTopicFromFileName('distributed-caching-architecture.png')).toBe('Distributed Caching Architecture');
    expect(extractTopicFromFileName('zero_trust_service_mesh.jpg')).toBe('Zero Trust Service Mesh');
    expect(extractTopicFromFileName('event-driven-microservices.webp')).toBe('Event Driven Microservices');
  });
});

describe('extractCleanSubject with filenames', () => {
  it('falls back to System Architecture when given non-semantic filenames', () => {
    const { cleanSubject, arSubject } = extractCleanSubject('20760.png');
    expect(cleanSubject).toBe('System Architecture');
    expect(arSubject).toBe('الأنظمة المعمارية');
    expect(cleanSubject).not.toContain('20760');
    expect(cleanSubject).not.toContain('png');
  });

  it('falls back to System Architecture when given stripped non-semantic string 20760png', () => {
    const { cleanSubject, arSubject } = extractCleanSubject('20760png');
    expect(cleanSubject).toBe('System Architecture');
    expect(arSubject).toBe('الأنظمة المعمارية');
  });
});

describe('extractCleanHeadline with filenames', () => {
  it('produces clean architectural hook without filename pollution', () => {
    const { headline } = extractCleanHeadline('20760.png');
    expect(headline).toBe('System Architecture, explained.');
    expect(headline).not.toContain('20760');
    expect(headline).not.toContain('png');
  });

  it('does not produce "20760png explained."', () => {
    const headline = enforceHeadlineSpecRule('20760png', { isHook: true, fallbackSubject: 'System' });
    expect(headline).toBe('System, explained.');
    expect(headline).not.toContain('20760');
    expect(headline).not.toContain('png');
  });

  it('preserves mid-headline colons on content slides while removing colons on hook/CTA slides', () => {
    const contentHeadline = enforceHeadlineSpecRule('THE CATCH: APPROVAL IS NOT CONTROL', {
      isHook: false,
      isCta: false,
    });
    expect(contentHeadline).toBe('THE CATCH: APPROVAL IS NOT CONTROL.');

    const hookHeadline = enforceHeadlineSpecRule('THE CATCH: APPROVAL IS NOT CONTROL', {
      isHook: true,
    });
    expect(hookHeadline).toBe('THE CATCH APPROVAL IS NOT CONTROL.');
  });
});

import { sanitizeFullCarousel } from './sanitizer';
import { buildCandidateFromTopicSync } from '../gather/gatherClient';

describe('MARROK brand lock & slide headline de-repetition', () => {
  it('locks brand to MARROK and brandUrl to marrok.org while preserving external source in channel and sourceMeta.url', () => {
    const sanitized = sanitizeFullCarousel({
      theme: 'teal',
      category: 'KUBERNETES & CLOUD',
      brand: 'Cloudflare Engineering',
      brandUrl: 'blog.cloudflare.com',
      caption: 'Post-quantum privacy pass breakdown.',
      slides: [
        {
          type: 'hub',
          enTitle: 'The post-quantum privacy gamble.',
          arTitle: 'مستقبل الخصوصية في عصر الحوسبة الكمية',
          enBody: 'Cloudflare introduces MOLE for post-quantum Privacy Pass.',
          arBody: 'تقدم Cloudflare بروتوكول MOLE للخصوصية الكمية.',
        },
        {
          type: 'compare',
          enTitle: 'The signature size explosion.',
          arTitle: 'تضخم حجم التواقيع الرقمية',
          enBody: 'Post-quantum signatures expand from 64 bytes to kilobytes.',
          arBody: 'تتوسع التواقيع الكمية من 64 بايت إلى عدة كيلوبايت.',
        },
        {
          type: 'code',
          enTitle: 'The Privacy Pass mechanism.',
          arTitle: 'آلية عمل Privacy Pass',
          enBody: 'Blind tokens decouple issuance from redemption.',
          arBody: 'الرموز المعماة تفصل الإصدار عن الاسترداد.',
        },
        {
          type: 'row',
          diagramVariant: 'takeaway',
          enTitle: 'The core trade-off.',
          arTitle: 'المقايضة الجوهرية',
          enBody: ' Eliminating online handshakes saves bandwidth while requiring pre-provisioned client state.',
          arBody: 'إلغاء المصافحة الفورية يوفر النطاق الترددي مقابل تخزين حالة مسبقة لدى العميل.',
        },
        {
          type: 'cta',
          enTitle: 'Join the discussion.',
          arTitle: 'شارك في النقاش',
          enBody: 'Are your edge protocols ready for post-quantum payload sizes?',
          arBody: 'هل بروتوكولات الشبكة لديك جاهزة لأحجام التواقيع الكمية؟',
        },
      ],
    });

    expect(sanitized.brand).toBe('MARROK');
    expect(sanitized.brandUrl).toBe('marrok.org');
    expect(sanitized.channel).toBe('Cloudflare Engineering');
    expect(sanitized.sourceMeta?.url).toBe('blog.cloudflare.com');

    // Strips repetitive leading "The " on mid-deck slides
    expect(sanitized.slides[1].enTitle).toBe('Signature size explosion.');
    expect(sanitized.slides[2].enTitle).toBe('Privacy Pass mechanism.');

    // Replaces generic "The core trade-off." and "Join the discussion." with specific headlines
    expect((sanitized.slides[3].enTitle || '').toLowerCase()).not.toBe('the core trade-off.');
    expect(sanitized.slides[3].enTitle).toContain('Eliminating online handshakes');
    expect(sanitized.slides[3].arTitle).not.toBe('المقايضة الجوهرية');

    expect((sanitized.slides[4].enTitle || '').toLowerCase()).not.toBe('join the discussion.');
    expect(sanitized.slides[4].enTitle).toBe('Are your edge protocols ready?');
    expect(sanitized.slides[4].arTitle).toContain('هل بروتوكولات الشبكة لديك جاهزة');
  });

  it('keeps brand=MARROK and brandUrl=marrok.org when building gathered candidates from external sources', () => {
    const candidate = buildCandidateFromTopicSync(
      {
        id: 'cf_pq_1',
        title: 'Post-Quantum Privacy Pass at Scale',
        url: 'https://blog.cloudflare.com/pq-privacy-pass',
        sourceName: 'Cloudflare Blog RSS',
        sourceType: 'rss',
        brand: 'Cloudflare Engineering',
        brandUrl: 'blog.cloudflare.com',
        domainCategory: 'KUBERNETES & CLOUD',
        publishedAt: '2026-11-13T10:00:00.000Z',
        score: 120,
        summary: 'Cloudflare reduces post-quantum token overhead from 4KB to 96 bytes using MOLE.',
        extractedMetrics: ['4KB', '96 bytes'],
        recommendedFormat: 'carousel',
        synthesisPrompt: 'Post-Quantum Privacy Pass reduces overhead from 4KB to 96 bytes.',
      },
      'teal'
    );

    expect(candidate.deck.brand).toBe('MARROK');
    expect(candidate.deck.brandUrl).toBe('marrok.org');
    expect(candidate.deck.sourceMeta?.channel).toBe('Cloudflare Blog RSS');
    expect(candidate.deck.sourceMeta?.url).toBe('https://blog.cloudflare.com/pq-privacy-pass');
  });

  it('rewrites dry textbook gerund headlines and populates hookKicker badges across slides', () => {
    const sanitized = sanitizeFullCarousel({
      theme: 'teal',
      category: 'KUBERNETES & CLOUD',
      brand: 'MARROK',
      brandUrl: 'marrok.org',
      caption: 'MOLE protocol analysis.',
      slides: [
        {
          type: 'metric',
          enTitle: 'Why 4KB quantum tokens break TLS.',
          arTitle: 'لماذا تكسر تواقيع 4KB بروتوكول TLS',
          enBody: 'Post-quantum lattice signatures inflate HTTP headers by 64x.',
          arBody: 'تضخم التواقيع الكمية ترويسات HTTP بمقدار 64 ضعفاً.',
        },
        {
          type: 'code',
          enTitle: 'Defining the MOLE protocol.',
          arTitle: 'بروتوكول MOLE الجديد',
          enBody: 'MOLE shrinks oblivious PRF proofs down to 96B per token.',
          arBody: 'يقلص بروتوكول MOLE حجم الإثبات إلى 96 بايت.',
        },
        {
          type: 'row',
          diagramVariant: 'isolation',
          enTitle: 'Managing agentic traffic.',
          arTitle: 'إدارة حركة وكلاء الذكاء الاصطناعي',
          enBody: 'Cryptographic rate-limiting isolates autonomous bot bursts.',
          arBody: 'تحديد المعدل التشفيري يعزلاندفاعات الوكلاء.',
        },
        {
          type: 'cta',
          enTitle: 'Will MOLE replace Privacy Pass?',
          arTitle: 'هل يستبدل MOLE بروتوكول Privacy Pass؟',
        },
      ],
    });

    // Slide 1 preserves its dynamic 'metric' cover archetype and receives a hookKicker badge
    expect(sanitized.slides[0].type).toBe('metric');
    expect(sanitized.slides[0].hookKicker).toBeTruthy();

    // Textbook gerunds ("Defining the MOLE protocol.", "Managing agentic traffic.") are rewritten
    expect(sanitized.slides[1].enTitle).not.toMatch(/^Defining\b/i);
    expect(sanitized.slides[1].enTitle).toContain('MOLE protocol');
    expect(sanitized.slides[2].enTitle).not.toMatch(/^Managing\b/i);
    expect(sanitized.slides[2].enTitle).toContain('agentic traffic');
  });
});

import { inferDynamicCoverArchetype } from '../synthesis/smartVisualDefaults';
import { computeTopicViralityScore } from '../../../api/controllers/mediaController';

describe('Dynamic Slide 1 Cover Archetypes & Topic Virality Scoring', () => {
  it('selects compare, metric, row, or hub cover archetypes based on Slide 1 story angle', () => {
    expect(
      inferDynamicCoverArchetype({
        type: 'hub',
        enTitle: 'Pingora vs NGINX at 1T requests.',
        arTitle: 'مقارنة Pingora مقابل NGINX',
      })
    ).toBe('compare');

    expect(
      inferDynamicCoverArchetype({
        type: 'hub',
        enTitle: 'The $301,300 open-source funding shock.',
        arTitle: 'صدمة تمويل البرمجيات مفتوحة المصدر',
      })
    ).toBe('metric');

    expect(
      inferDynamicCoverArchetype({
        type: 'hub',
        enTitle: 'Inside the Linux eBPF zero-day sandbox bypass.',
        arTitle: 'تجاوز عزل نواة لينكس',
      })
    ).toBe('row');

    const generalCover = inferDynamicCoverArchetype({
      type: 'hub',
      enTitle: 'Unlocking Gödel’s lost theorems.',
      arTitle: 'فك شفرة نظريات غودل المفقودة',
    });
    expect(generalCover).toBe('metric');
    expect(generalCover).not.toBe('hub');
  });

  it('computes a 58..99 virality score and viral angle badge for Topic Radar stories', () => {
    const res = computeTopicViralityScore({
      title: 'How Cloudflare Replaced NGINX with Rust at 1T+ Requests (70% CPU drop)',
      summary: 'Replacing legacy multi-process proxies with async Rust.',
      score: 640,
      extractedMetrics: ['70% CPU reduction', '67% less memory', '1T+ daily requests'],
      sourceType: 'curated',
    });

    expect(res.viralityScore).toBeGreaterThanOrEqual(80);
    expect(res.viralityScore).toBeLessThanOrEqual(99);
    expect(res.viralAngle).toBe('ARCHITECTURE SHOWDOWN');
  });
});


