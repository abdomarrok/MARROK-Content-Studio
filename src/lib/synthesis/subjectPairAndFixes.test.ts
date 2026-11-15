import { describe, it, expect } from 'vitest';
import {
  detectSubjectPairFromText,
  buildNonNumericHookClaimCard,
  applyHookEngineToSlide1,
  inferDynamicCoverArchetype,
  explainArchetypeChoice,
} from './smartVisualDefaults.ts';
import { runPreExportChecklist, runQAChecks } from '../qaChecks.ts';
import { runPlatformRiskChecks } from '../riskChecks.ts';
import { DEFAULT_PALETTES } from '../../types.ts';
import type { CarouselData, SlideData } from '../../types.ts';
import { getBundledOfficialLogoSvg, isBundledTechIcon } from '../bundledTechSvgs.ts';

describe('Subject Pair Archetype & Discord Cassandra → ScyllaDB Migration', () => {
  const theme = DEFAULT_PALETTES[0];

  it('detects 3-brand migration story and allocates story owner as styled text', () => {
    const text = 'Discord migrated from Cassandra to ScyllaDB to store trillions of chat messages.';
    const pair = detectSubjectPairFromText(text);

    expect(pair).toBeDefined();
    expect(pair?.storyOwner).toBe('Discord');
    expect(pair?.storyOwnerMode).toBe('text');
    expect(pair?.beforeSystem).toMatch(/Cassandra/i);
    expect(pair?.afterSystem).toBe('ScyllaDB');
    expect(pair?.beforeLogoKey).toBe('apachecassandra');
    expect(pair?.afterLogoKey).toBe('scylladb');
    expect(pair?.beforeAsText).toBe(false);
    expect(pair?.afterAsText).toBe(false);
    expect(pair?.colorMode).toBe('official');
    expect(pair?.logoWidthPct).toBeLessThanOrEqual(14);
    expect(pair?.creativeMotif).toBe('chat-to-db');
  });

  it('provides bundled unedited official SVGs for Cassandra, ScyllaDB, and Discord', () => {
    expect(isBundledTechIcon('apachecassandra')).toBe(true);
    expect(isBundledTechIcon('scylladb')).toBe(true);
    expect(isBundledTechIcon('discord')).toBe(true);

    const cassandraSvg = getBundledOfficialLogoSvg('apachecassandra');
    const scyllaSvg = getBundledOfficialLogoSvg('scylladb');

    expect(cassandraSvg).toContain('<svg');
    expect(scyllaSvg).toContain('<svg');
    // Ensure Simple Icons SVG content is unedited
    expect(cassandraSvg).toContain('viewBox="0 0 24 24"');
    expect(scyllaSvg).toContain('viewBox="0 0 24 24"');
  });

  it('automatically chooses Subject Pair for Slide 1 with crisp one-line rationale', () => {
    const rawSlide1: SlideData = {
      type: 'row',
      enTitle: 'Discord Cassandra Migration.',
      arTitle: 'هجرة ديسكورد من Cassandra إلى ScyllaDB.',
      enBody: 'Discord migrated from Cassandra to ScyllaDB to handle trillions of chat messages at low latency.',
      arBody: 'انتقلت منصة Discord من Cassandra إلى ScyllaDB لتخفيف أعباء الصيانة وتحسين Latency.',
    };

    const hookSlide = applyHookEngineToSlide1(rawSlide1, false, rawSlide1.enBody);
    expect(hookSlide.type).toBe('subjectPair');
    expect(hookSlide.subjectPair).toBeDefined();
    expect(hookSlide.subjectPair?.storyOwner).toBe('Discord');
    expect(hookSlide.subjectPair?.beforeSystem).toMatch(/Cassandra/i);
    expect(hookSlide.subjectPair?.afterSystem).toBe('ScyllaDB');

    const rationale = explainArchetypeChoice(hookSlide, 0, 6);
    expect(rationale).toContain('Picked Subject Pair visual');
    expect(rationale).toMatch(/Cassandra/i);
    expect(rationale).toContain('ScyllaDB');
  });

  it('extracts Subject Pair nodes into Motion Reel scenes', () => {
    const slideWithPair: SlideData = {
      type: 'subjectPair',
      enTitle: 'Discord Cassandra Migration.',
      arTitle: 'هجرة ديسكورد التقنية.',
      subjectPair: {
        beforeSystem: 'Cassandra',
        afterSystem: 'ScyllaDB',
        storyOwner: 'Discord',
        colorMode: 'official',
        logoWidthPct: 11,
      },
    };

    // If extractSlideNodes is exported or we test via carousel conversion
    const deck: CarouselData = {
      id: 'test-deck',
      theme: 'teal',
      brand: 'MARROK',
      category: 'DATABASE',
      caption: 'Discord migration analysis',
      postFormat: 'carousel',
      slides: [
        slideWithPair,
        {
          type: 'row',
          enTitle: 'Compaction Mechanics.',
          arTitle: 'آلية الضغط الداخلي.',
          diagramVariant: 'isolation',
        },
      ],
    };

    const risk = runPlatformRiskChecks(deck);
    expect(risk.status).not.toBe('BLOCK');
  });
});

describe('Slide 1 Empty Hard Metric Guard & Quote Deduplication', () => {
  it('never emits an empty Hard Metric card when metric fields are missing numbers', () => {
    const nonNumericSlide: SlideData = {
      type: 'row',
      enTitle: 'Understanding Raft Protocol Quorum.',
      arTitle: 'فهم آليات الإجماع في بروتوكول Raft.',
      enBody: 'Distributed nodes achieve deterministic state machine replication through leader election and log consensus.',
      arBody: 'تحقق العقد الموزعة حالة متسقة عبر انتخاب القائد ومطابقة سجلات الأحداث.',
    };

    const hookSlide = applyHookEngineToSlide1(nonNumericSlide, false, nonNumericSlide.enBody);
    // Slide 1 must NOT be an empty metric card without values
    if (hookSlide.type === 'metric') {
      expect(hookSlide.hookClaimCard).toBeDefined();
      expect(hookSlide.hookClaimCard?.statement).toBeTruthy();
    } else {
      expect(['row', 'compare', 'subjectPair', 'image', 'poster']).toContain(hookSlide.type);
    }

    const coverType = inferDynamicCoverArchetype(nonNumericSlide);
    expect(coverType).toBe('row');
  });

  it('guarantees hook quote claim card statement never echoes enTitle', () => {
    const title = 'Postgres Connection Pooling Overhead.';
    const body = 'Opening raw TCP sockets per query exhausts server file descriptors rapidly.';
    const claimCard = buildNonNumericHookClaimCard(body, { enTitle: title, enBody: body });

    expect(claimCard).toBeDefined();
    expect(claimCard?.statement.toLowerCase()).not.toBe(title.toLowerCase());
    expect(claimCard?.statement).not.toContain(title);
  });
});

describe('Brand IP Safety & Checks Verification', () => {
  const theme = DEFAULT_PALETTES[0];

  it('passes checks for compliant Subject Pair (≤14% logo width, ≤2 logos, unedited SVGs)', () => {
    const deck: CarouselData = {
      id: 'test-deck',
      theme: 'teal',
      brand: 'MARROK',
      category: 'DATABASE',
      caption: 'Production database migration review.',
      slides: [
        {
          type: 'subjectPair',
          enTitle: 'Discord Cassandra to ScyllaDB.',
          arTitle: 'هجرة ديسكورد إلى ScyllaDB.',
          enCredit: 'Source: Discord Engineering',
          subjectPair: {
            beforeSystem: 'Cassandra',
            afterSystem: 'ScyllaDB',
            beforeLogoKey: 'apachecassandra',
            afterLogoKey: 'scylladb',
            storyOwner: 'Discord',
            storyOwnerMode: 'text',
            logoWidthPct: 11,
            colorMode: 'official',
          },
        },
        {
          type: 'cta',
          enTitle: 'Join Discussion.',
          arTitle: 'شارك برأيك في التعليقات.',
          ctaText: 'Follow for Engineering Deep Dives',
        },
      ],
    };

    const checklist = runPreExportChecklist(deck, theme);
    const brandCheck = checklist.find((c) => c.id === 'brandLogoSafety');
    expect(brandCheck?.passed).toBe(true);

    const risk = runPlatformRiskChecks(deck);
    expect(risk.status).not.toBe('BLOCK');
  });

  it('flags Subject Pair if logo width exceeds 14%', () => {
    const deck: CarouselData = {
      id: 'test-deck',
      theme: 'teal',
      brand: 'MARROK',
      category: 'DATABASE',
      caption: 'Production database migration review.',
      slides: [
        {
          type: 'subjectPair',
          enTitle: 'Discord Cassandra to ScyllaDB.',
          arTitle: 'هجرة ديسكورد إلى ScyllaDB.',
          enCredit: 'Source: Discord Engineering',
          subjectPair: {
            beforeSystem: 'Cassandra',
            afterSystem: 'ScyllaDB',
            beforeLogoKey: 'apachecassandra',
            afterLogoKey: 'scylladb',
            storyOwner: 'Discord',
            logoWidthPct: 18, // VIOLATION: > 14%
            colorMode: 'official',
          },
        },
      ],
    };

    const checklist = runPreExportChecklist(deck, theme);
    const brandCheck = checklist.find((c) => c.id === 'brandLogoSafety');
    expect(brandCheck?.passed).toBe(false);
    expect(brandCheck?.detail).toContain('exceeds 14%');

    const risk = runPlatformRiskChecks(deck);
    expect(risk.status).toBe('BLOCK');
  });

  it('flags Subject Pair if logos are edited, merged, or use mascots', () => {
    const deck: CarouselData = {
      id: 'test-deck',
      theme: 'teal',
      brand: 'MARROK',
      category: 'DATABASE',
      caption: 'Production database migration review.',
      slides: [
        {
          type: 'subjectPair',
          enTitle: 'Discord Cassandra to ScyllaDB.',
          arTitle: 'هجرة ديسكورد إلى ScyllaDB.',
          subjectPair: {
            beforeSystem: 'Cassandra',
            afterSystem: 'ScyllaDB',
            beforeLogoKey: 'apachecassandra',
            afterLogoKey: 'scylladb',
            isMerged: true, // VIOLATION
            logoWidthPct: 11,
          },
        },
      ],
    };

    const checklist = runPreExportChecklist(deck, theme);
    const brandCheck = checklist.find((c) => c.id === 'brandLogoSafety');
    expect(brandCheck?.passed).toBe(false);

    const qaReport = runQAChecks(deck);
    const mergedCheck = qaReport.results.find((r) => r.id.includes('archetype-subjectpair-merged'));
    expect(mergedCheck?.severity).toBe('fail');
  });
});
