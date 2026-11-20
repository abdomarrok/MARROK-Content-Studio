import { describe, it, expect } from 'vitest';
import {
  CONTENT_PILLARS,
  HISTORICAL_BASELINES,
  detectContentPillar,
  getPlatformGuidance,
} from './strategyConfig.ts';
import {
  buildLocalStrategyBrief,
  buildStrategyPromptDecorator,
} from './strategyPromptDecorator.ts';

describe('MARROK Content Strategy Config & Pillar Engine', () => {
  it('defines all 5 strategic content pillars with authentic keywords and tone', () => {
    const expectedPillars = [
      'cybersecurity',
      'artificial-intelligence',
      'software-engineering',
      'developer-culture',
      'practical-tech',
    ];
    for (const pillarId of expectedPillars) {
      const pillar = CONTENT_PILLARS[pillarId as keyof typeof CONTENT_PILLARS];
      expect(pillar).toBeDefined();
      expect(pillar.label).toBeTruthy();
      expect(pillar.keywords.length).toBeGreaterThan(5);
      expect(pillar.toneGuidance).toBeTruthy();
      expect(pillar.ctaTemplates.length).toBeGreaterThan(0);
      expect(pillar.qualityChecks.length).toBeGreaterThan(0);
    }
  });

  it('supports all platforms including Instagram, TikTok, LinkedIn, Facebook, and All', () => {
    const platforms = ['instagram', 'tiktok', 'linkedin', 'facebook', 'all'] as const;
    for (const p of platforms) {
      const guidance = getPlatformGuidance(p);
      expect(guidance).toBeDefined();
      expect(guidance.displayName).toBeTruthy();
      expect(guidance.formatRecommendations.length).toBeGreaterThan(0);
      expect(guidance.hookStrategy).toBeTruthy();
    }
  });

  it('detects cybersecurity pillar from vulnerability and exploit keywords', () => {
    expect(detectContentPillar('Node.js Brotli decompression buffer overflow CVE-2026-1194')).toBe('cybersecurity');
    expect(detectContentPillar('DefectDojo automated triage for container security and SAST')).toBe('cybersecurity');
  });

  it('detects AI pillar from agent and inference keywords', () => {
    expect(detectContentPillar('Autonomous AI agent loops with RAG and token budgets')).toBe('artificial-intelligence');
    expect(detectContentPillar('Fine-tuning LLM embeddings for context engineering')).toBe('artificial-intelligence');
  });

  it('detects developer culture and humor from relatable situation keywords', () => {
    expect(detectContentPillar('Friday 5pm deploy creates a hilarious production outage on-call')).toBe('developer-culture');
  });

  it('preserves historical report data qualifications and labels', () => {
    const tk = HISTORICAL_BASELINES.tiktok;
    expect(tk.dataSource).toBe('static-report');
    expect(tk.metrics.calculatedInteractionsPerViewPct).toBe(6.32);
    expect(tk.metrics.dataQualifications.some((q) => q.includes('NOT Metricool reach'))).toBe(true);

    const ig = HISTORICAL_BASELINES.instagram;
    expect(ig.dataSource).toBe('static-report');
    expect(ig.metrics.reportedAccountDailyViews).toBe(7410);
  });

  it('builds a coherent local strategy brief and prompt decorator', () => {
    const brief = buildLocalStrategyBrief({
      topic: 'Brotli zero-day vulnerability in Node.js',
      platform: 'tiktok',
      pillar: 'cybersecurity',
      objective: 'discovery',
    });

    expect(brief.platform).toBe('tiktok');
    expect(brief.pillar).toBe('cybersecurity');
    expect(brief.objective).toBe('discovery');
    expect(brief.ctaSuggestion).toBeTruthy();

    const decorator = buildStrategyPromptDecorator(brief);
    expect(decorator).toContain('TARGET PLATFORM: TIKTOK');
    expect(decorator).toContain('STRATEGIC CONTENT PILLAR: CYBERSECURITY');
    expect(decorator).toContain('PUBLICATION OBJECTIVE: DISCOVERY');
    expect(decorator).toContain('SCROLL-STOPPING HOOK STRATEGY');
  });

  it('returns empty decorator when brief is null or undefined', () => {
    expect(buildStrategyPromptDecorator(null)).toBe('');
    expect(buildStrategyPromptDecorator(undefined)).toBe('');
  });
});
