import { describe, expect, it } from 'vitest';
import { runQAChecks } from './qaChecks';
import { runPlatformRiskChecks } from './riskChecks';
import { enrichAndPaceCarousel } from './autonomousPipeline';
import { synthesizeCarousel } from './synthesizer';
import { DEFAULT_STARTER_DECK } from './presets';
import { CarouselData } from '../types';

function cloneStarterDeck(): CarouselData {
  return enrichAndPaceCarousel(JSON.parse(JSON.stringify(DEFAULT_STARTER_DECK)), 'Anthropic Scion');
}

describe('QA Gate & Platform Risk Checks (Phase 4 & 5)', () => {
  it('passes QA on a clean reviewed starter deck with JPG 1080x1920 options', () => {
    const deck = cloneStarterDeck();
    deck.sourceMeta = {
      ...deck.sourceMeta,
      status: 'verified_live',
      isSearchGrounded: true,
      groundingSources: [{ title: 'Anthropic Engineering', url: 'https://www.anthropic.com' }],
      userReviewed: true,
    };
    const report = runQAChecks(deck, { exportFormat: 'jpg', width: 1080, height: 1920 });
    expect(report.failCount).toBe(0);
    expect(report.canExport).toBe(true);
  });

  it('passes QA and Platform Risk checks on a Single-Slide Post (postFormat === "single")', () => {
    const singlePost = synthesizeCarousel({
      prompt: 'Redis 8 multi-threaded engine architecture',
      postFormat: 'single',
    });
    expect(singlePost.postFormat).toBe('single');
    expect(singlePost.slides).toHaveLength(1);
    // PR 3: Credit field must be empty by default
    expect(singlePost.slides[0].enCredit).toBe('');
    singlePost.slides[0].enCredit = 'Redis Engineering';

    singlePost.sourceMeta = {
      ...singlePost.sourceMeta,
      status: 'verified_live',
      isSearchGrounded: true,
      groundingSources: [{ title: 'Redis Engineering', url: 'https://redis.io' }],
      userReviewed: true,
      creator: 'Anthropic Engineering',
    };

    const qa = runQAChecks(singlePost, { exportFormat: 'jpg', width: 1080, height: 1920 });
    expect(qa.failCount).toBe(0);
    expect(qa.canExport).toBe(true);
    expect(qa.results.find((r) => r.id === 'slide-count')?.severity).toBe('pass');

    const risk = runPlatformRiskChecks(singlePost, 'Redis 8 multi-threaded engine architecture');
    expect(risk.status).toBe('PASS');
    expect(risk.blockCount).toBe(0);
  });

  it('fails QA when PNG output or wrong dimensions are requested', () => {
    const deck = cloneStarterDeck();
    const pngReport = runQAChecks(deck, { exportFormat: 'png', width: 1080, height: 1920 });
    expect(pngReport.canExport).toBe(false);
    expect(pngReport.results.some((r) => r.id === 'export-format-png')).toBe(true);

    const dimReport = runQAChecks(deck, { exportFormat: 'jpg', width: 1080, height: 1080 });
    expect(dimReport.canExport).toBe(false);
    expect(dimReport.results.some((r) => r.id === 'export-dimensions')).toBe(true);
  });

  it('fails QA on placeholder text, Arabic line ending with Latin+punctuation, and text below y=1760', () => {
    const deck = cloneStarterDeck();
    deck.slides[1].enBody = 'Lorem ipsum placeholder text in slide.';
    deck.slides[2].arBody = 'هذا السطر ينتهي بكلمة لاتينية مع نقطة Git.';
    deck.slides[3].layoutOverrides = { arabicBodyBlock: { dy: 180 } };

    const report = runQAChecks(deck);
    expect(report.canExport).toBe(false);
    expect(report.results.some((r) => r.id.startsWith('placeholder-1'))).toBe(true);
    expect(report.results.some((r) => r.id.startsWith('arabic-line-end-2'))).toBe(true);
    expect(report.results.some((r) => r.id === 'vertical-overflow-3')).toBe(true);
  });

  it('returns BLOCK in runPlatformRiskChecks for copyrighted IP, raw reposts, or unreviewed numeric claims', () => {
    const deck = cloneStarterDeck();
    deck.sourceMeta = {
      status: 'unverified_draft',
      isSearchGrounded: false,
      userReviewed: false,
    };
    deck.slides[1].enBody = 'Featuring Spider-Man and Taylor Swift in a 200x faster cluster.';
    const risk = runPlatformRiskChecks(deck, 'repost from tiktok.com/@othercreator');
    expect(risk.status).toBe('BLOCK');
    expect(risk.items.find((i) => i.id === 'originality')?.status).toBe('BLOCK');
    expect(risk.items.find((i) => i.id === 'copyright')?.status).toBe('BLOCK');
    expect(risk.items.find((i) => i.id === 'unverified-numbers')?.status).toBe('BLOCK');
  });

  it('returns PASS in runPlatformRiskChecks when grounded, original, and credited', () => {
    const deck = cloneStarterDeck();
    deck.brand = 'MARROK';
    deck.channel = 'Anthropic';
    deck.sourceMeta = {
      status: 'verified_live',
      isSearchGrounded: true,
      groundingSources: [{ title: 'Anthropic Scion', url: 'https://www.anthropic.com' }],
      userReviewed: true,
      creator: 'Anthropic Engineering',
    };
    deck.slides[deck.slides.length - 1].enCredit = 'Source: Anthropic Engineering';
    const risk = runPlatformRiskChecks(deck, 'Anthropic Scion architecture breakdown');
    expect(risk.status).toBe('PASS');
    expect(risk.blockCount).toBe(0);
  });
  it('enforces creator credit rules: brand-only or empty fails on third-party sources, genuine credit passes', () => {
    const deck = cloneStarterDeck();
    deck.brand = 'MARROK';
    deck.sourceMeta = {
      status: 'verified_live',
      isSearchGrounded: true,
      groundingSources: [{ title: 'arXiv:2309.06180', url: 'https://arxiv.org' }],
      userReviewed: true,
      creator: '',
    };
    deck.slides[deck.slides.length - 1].enCredit = '';

    // Empty credit with third-party source -> BLOCK
    let risk = runPlatformRiskChecks(deck);
    expect(risk.items.find((i) => i.id === 'originality')?.status).toBe('BLOCK');

    // Brand-only credit with third-party source -> BLOCK (never consider brand-only as credited)
    deck.slides[deck.slides.length - 1].enCredit = 'Source: MARROK';
    risk = runPlatformRiskChecks(deck);
    expect(risk.items.find((i) => i.id === 'originality')?.status).toBe('BLOCK');

    // Genuine third-party creator credit -> PASS
    deck.slides[deck.slides.length - 1].enCredit = 'Source: Woosuk Kwon et al. / UC Berkeley';
    risk = runPlatformRiskChecks(deck);
    expect(risk.items.find((i) => i.id === 'originality')?.status).toBe('PASS');
  });

  it('does not trigger false positive copyright BLOCK for "Drake" on technical KV-cache topics, but blocks commercial music references', () => {
    const kvDeck = cloneStarterDeck();
    kvDeck.category = 'vLLM KV-Cache & PagedAttention';
    kvDeck.slides[0].enTitle = 'KV Cache Memory Management';
    // Developer referencing the ubiquitous Drake compare meme format
    kvDeck.slides[1].enBody = 'Drake meme: Naive contiguous KV allocation vs PagedAttention virtual blocks.';
    
    const kvRisk = runPlatformRiskChecks(kvDeck, 'vLLM KV cache architecture breakdown');
    expect(kvRisk.items.find((i) => i.id === 'copyright')?.status).toBe('PASS');

    // Commercial music artist reference -> BLOCK
    const musicDeck = cloneStarterDeck();
    musicDeck.slides[1].enBody = 'Listening to Drake song while coding.';
    const musicRisk = runPlatformRiskChecks(musicDeck);
    expect(musicRisk.items.find((i) => i.id === 'copyright')?.status).toBe('BLOCK');
    expect(musicRisk.items.find((i) => i.id === 'copyright')?.message).toContain('Drake');
  });

  it('flags sub-24px text overrides in Checks across every aspect ratio (9:16, 3:4, 4:5, 1:1)', () => {
    for (const preset of ['tiktok-9:16', 'ig-3:4', 'ig-4:5', 'ig-1:1'] as const) {
      const deck = cloneStarterDeck();
      deck.dimensionPreset = preset;
      deck.slides[1].layoutOverrides = {
        bodyBlock: { scale: preset === 'tiktok-9:16' ? 0.5 : 0.65 },
      };

      const report = runQAChecks(deck);
      expect(report.canExport, `${preset} sub-24px should fail Checks`).toBe(false);
      expect(
        report.results.some((r) => r.severity === 'fail' && r.id.startsWith('min-font-size-1-')),
        `${preset} min-font-size failure present`
      ).toBe(true);
    }
  });

  it('emits non-blocking Checks warning only when Arabic copy translates a technical term instead of keeping English', () => {
    const cleanDeck = cloneStarterDeck();
    cleanDeck.sourceMeta = {
      ...cleanDeck.sourceMeta,
      status: 'verified_live',
      userReviewed: true,
    };
    cleanDeck.slides[1].arTitle = 'يقلل Cache زمن p99 حتى 15ms';
    cleanDeck.slides[1].arBody =
      'تتواصل Sockets مع Postgres و Kafka و Raft داخل نفس Cluster عبر API سريع.';

    const cleanReport = runQAChecks(cleanDeck);
    expect(
      cleanReport.results.filter((r) => r.id.startsWith('translated-tech-term-'))
    ).toEqual([]);

    const translatedDeck = cloneStarterDeck();
    translatedDeck.sourceMeta = {
      ...translatedDeck.sourceMeta,
      status: 'verified_live',
      userReviewed: true,
    };
    translatedDeck.slides[1].arTitle = 'تحسين زمن الاستجابة والمقابس';
    translatedDeck.slides[1].arBody =
      'استخدام الذاكرة المؤقتة بحجم 10 جيجابايت قلل الكمون حتى 15 مللي ثانية داخل العنقود.';

    const warnReport = runQAChecks(translatedDeck);
    const termWarnings = warnReport.results.filter((r) =>
      r.id.startsWith('translated-tech-term-')
    );
    expect(termWarnings.length).toBeGreaterThanOrEqual(2);
    expect(termWarnings.every((w) => w.severity === 'warn')).toBe(true);
    // Non-blocking warning must not set canExport false by itself
    expect(warnReport.canExport).toBe(true);
  });

  it('validates per-platform caption length limits (2,200 Instagram/TikTok, 3,000 LinkedIn)', () => {
    const deck = cloneStarterDeck();
    deck.sourceMeta = {
      ...deck.sourceMeta,
      status: 'verified_live',
      userReviewed: true,
    };

    deck.caption = 'Short bilingual caption.';
    const passReport = runQAChecks(deck);
    expect(passReport.results.find((r) => r.id === 'caption-platform-limit')?.severity).toBe('pass');

    deck.caption = 'A'.repeat(2350);
    const igWarnReport = runQAChecks(deck);
    const igCheck = igWarnReport.results.find((r) => r.id === 'caption-platform-limit');
    expect(igCheck?.severity).toBe('warn');
    expect(igCheck?.message).toContain('Instagram & TikTok limit (2200');

    deck.caption = 'B'.repeat(3100);
    const liWarnReport = runQAChecks(deck);
    const liCheck = liWarnReport.results.find((r) => r.id === 'caption-platform-limit');
    expect(liCheck?.severity).toBe('warn');
    expect(liCheck?.message).toContain('LinkedIn (3000)');
  });
});