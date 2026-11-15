import { describe, it, expect } from 'vitest';
import {
  detectSubjectPairFromText,
  buildNonNumericHookClaimCard,
  applyHookEngineToSlide1,
  inferDynamicCoverArchetype,
  explainArchetypeChoice,
} from './smartVisualDefaults.ts';
import { synthesizeCarousel } from '../synthesizer.ts';
import { runPreExportChecklist, runQAChecks } from '../qaChecks.ts';
import { runPlatformRiskChecks } from '../riskChecks.ts';
import { DEFAULT_PALETTES } from '../../types.ts';
import type { CarouselData, SlideData } from '../../types.ts';
import {
  getBundledOfficialLogoSvg,
  isBundledTechIcon,
  isPlaceholderOrEmptyBrandValue,
} from '../bundledTechSvgs.ts';
import { renderSlideToCanvas } from '../canvas/renderSlide.ts';
import { computeSlideLayoutAwareness } from '../canvas/layoutAwareness.ts';

describe('Strict Subject Pair Detection — Positive Migration Tests', () => {
  it('1. Positive Test: Discord (Cassandra to ScyllaDB) migration extracts both systems, sets Discord as text owner, and quotes both in rationale', () => {
    const text =
      'How Discord Moved from Cassandra to ScyllaDB to Store Trillions of Chat Messages at Low Latency.';
    const pair = detectSubjectPairFromText(text);

    expect(pair).toBeDefined();
    expect(pair?.storyOwner).toBe('Discord');
    expect(pair?.storyOwnerMode).toBe('text');
    expect(pair?.beforeSystem).toBe('Apache Cassandra');
    expect(pair?.afterSystem).toBe('ScyllaDB');
    expect(pair?.beforeLogoKey).toBe('apachecassandra');
    expect(pair?.afterLogoKey).toBe('scylladb');
    expect(pair?.beforeAsText).toBe(false);
    expect(pair?.afterAsText).toBe(false);
    expect(pair?.colorMode).toBe('official');
    expect(pair?.logoWidthPct).toBeLessThanOrEqual(14);
    expect(pair?.creativeMotif).toBe('chat-to-db');

    const rawSlide1: SlideData = {
      type: 'row',
      enTitle: 'Discord Cassandra to ScyllaDB Migration.',
      arTitle: 'هجرة ديسكورد من Cassandra إلى ScyllaDB.',
      enBody: text,
      arBody: 'انتقلت منصة Discord من Cassandra إلى ScyllaDB لمعالجة تريليونات الرسائل بكفاءة.',
    };

    const hookSlide = applyHookEngineToSlide1(rawSlide1, false, rawSlide1.enBody);
    expect(hookSlide.type).toBe('subjectPair');
    expect(hookSlide.subjectPair?.beforeSystem).toBe('Apache Cassandra');
    expect(hookSlide.subjectPair?.afterSystem).toBe('ScyllaDB');

    const rationale = explainArchetypeChoice(hookSlide, 0, 8);
    expect(rationale).toContain('Picked Subject Pair visual');
    expect(rationale).toContain('"Apache Cassandra"');
    expect(rationale).toContain('"ScyllaDB"');
    expect(rationale).not.toMatch(/System A|System B|Before → After/i);
  });

  it('2. Positive Test: Stripe (MongoDB to PostgreSQL) migration extracts both systems and uses stream-flow motif (no chat bubbles)', () => {
    const text =
      'How Stripe Migrated from MongoDB to PostgreSQL for Zero-Downtime Ledger Transactions.';
    const pair = detectSubjectPairFromText(text);

    expect(pair).toBeDefined();
    expect(pair?.storyOwner).toBe('Stripe');
    expect(pair?.storyOwnerMode).toBe('text');
    expect(pair?.beforeSystem).toBe('MongoDB');
    expect(pair?.afterSystem).toBe('PostgreSQL');
    expect(pair?.beforeLogoKey).toBe('mongodb');
    expect(pair?.afterLogoKey).toBe('postgresql');
    // Not a chat/messages workload -> must NOT use chat-to-db bubbles
    expect(pair?.creativeMotif).toBe('stream-flow');
    expect(pair?.flowLabel).toBe('MONGODB → POSTGRESQL');

    const slide: SlideData = {
      type: 'row',
      enTitle: 'Stripe Ledger Database Migration.',
      arTitle: 'ترحيل قواعد بيانات Stripe المالية.',
      enBody: text,
      arBody: 'هاجرت Stripe من MongoDB إلى PostgreSQL لضمان دقة المعاملات المالية.',
    };
    const hookSlide = applyHookEngineToSlide1(slide, false, slide.enBody);
    expect(hookSlide.type).toBe('subjectPair');
    const rationale = explainArchetypeChoice(hookSlide, 0, 8);
    expect(rationale).toContain('"MongoDB"');
    expect(rationale).toContain('"PostgreSQL"');
  });

  it('provides bundled unedited official SVGs for Cassandra, ScyllaDB, and Discord', () => {
    expect(isBundledTechIcon('apachecassandra')).toBe(true);
    expect(isBundledTechIcon('scylladb')).toBe(true);
    expect(isBundledTechIcon('discord')).toBe(true);

    const cassandraSvg = getBundledOfficialLogoSvg('apachecassandra');
    const scyllaSvg = getBundledOfficialLogoSvg('scylladb');

    expect(cassandraSvg).toContain('<svg');
    expect(scyllaSvg).toContain('<svg');
    expect(cassandraSvg).toContain('viewBox="0 0 24 24"');
    expect(scyllaSvg).toContain('viewBox="0 0 24 24"');
  });
});

describe('Strict Subject Pair Detection — Negative Tests (No Misfires)', () => {
  it('1. Negative Test: Robotics pick-and-place article ("from bin to conveyor") must NOT select Subject Pair', () => {
    const roboticsTitle = 'Robotic Pick-and-Place: 6-DoF Wrist Camera Force Control.';
    const roboticsBody =
      'Closed-loop visual servoing guides a robotic gripper from bin to conveyor using wrist depth sensing and inverse kinematics.';

    expect(detectSubjectPairFromText(`${roboticsTitle} ${roboticsBody}`)).toBeUndefined();

    const slide1: SlideData = {
      type: 'row',
      enTitle: roboticsTitle,
      arTitle: 'روبوت الالتقاط والنقل عبر الرؤية الحاسوبية.',
      enBody: roboticsBody,
      arBody: 'يوجه نظام الاستشعار البصري ذراع الروبوت من الصندوق إلى الحزام الناقل بدقة.',
    };

    const hookSlide = applyHookEngineToSlide1(slide1, false, roboticsBody);
    expect(hookSlide.type).not.toBe('subjectPair');
    expect(hookSlide.type).toBe('row');
    expect(hookSlide.subjectPair).toBeUndefined();

    const rationale = explainArchetypeChoice(hookSlide, 0, 8);
    expect(rationale).toMatch(/not a two-system migration/i);
    expect(rationale).not.toMatch(/System A|System B|PIPELINE MIGRATION/i);
  });

  it('2. Negative Test: ML paper ("from training to inference") must NOT select Subject Pair', () => {
    const mlTitle = 'FlashAttention-3: Asynchronous Tensor Core Attention.';
    const mlBody =
      'Warp-specialized pipelining overlaps softmax and GEMM from training to inference on H100 GPUs without accuracy loss.';

    expect(detectSubjectPairFromText(`${mlTitle} ${mlBody}`)).toBeUndefined();

    const slide1: SlideData = {
      type: 'row',
      enTitle: mlTitle,
      arTitle: 'تسريع آلية الانتباه في نماذج الذكاء الاصطناعي.',
      enBody: mlBody,
      arBody: 'تسمح جدولة الأنابيب غير المتزامنة بتسريع التدريب والاستدلال على معالجات H100.',
    };

    const hookSlide = applyHookEngineToSlide1(slide1, false, mlBody);
    expect(hookSlide.type).not.toBe('subjectPair');
    expect(hookSlide.subjectPair).toBeUndefined();
  });

  it('3. Negative Test: "How X works" explainer must NOT select Subject Pair', () => {
    const explainerTitle = 'How the Linux eBPF Verifier Enforces Safe Kernel Execution.';
    const explainerBody =
      'Before loading bytecode into kernel space, the static analyzer traverses every control-flow path to bound register state.';

    expect(detectSubjectPairFromText(`${explainerTitle} ${explainerBody}`)).toBeUndefined();

    const slide1: SlideData = {
      type: 'row',
      enTitle: explainerTitle,
      arTitle: 'كيف يضمن مدقق eBPF أمان نواة لينكس.',
      enBody: explainerBody,
      arBody: 'يفحص المحلل الثابت كل مسارات التنفيذ قبل تحميل الشيفرة داخل النواة.',
    };

    const hookSlide = applyHookEngineToSlide1(slide1, false, explainerBody);
    expect(hookSlide.type).not.toBe('subjectPair');
    expect(hookSlide.type).toBe('row');
  });

  it('4. Negative Test: Opinion piece must NOT select Subject Pair', () => {
    const opinionTitle = 'Why Senior Engineers Overcomplicate Boring Monoliths.';
    const opinionBody =
      'Chasing resume-driven distributed architectures before product-market fit burns engineering velocity and on-call sanity.';

    expect(detectSubjectPairFromText(`${opinionTitle} ${opinionBody}`)).toBeUndefined();

    const slide1: SlideData = {
      type: 'row',
      enTitle: opinionTitle,
      arTitle: 'لماذا يعقد المهندسون الأنظمة البسيطة مبكراً.',
      enBody: opinionBody,
      arBody: 'إن تبني البنى الموزعة المعقدة قبل نضج المنتج يستنزف سرعة الفريق الهندسي.',
    };

    const hookSlide = applyHookEngineToSlide1(slide1, false, opinionBody);
    expect(hookSlide.type).not.toBe('subjectPair');
    expect(hookSlide.type).toBe('metric');
    expect(hookSlide.hookClaimCard).toBeDefined();
    expect(hookSlide.layoutRationale).toMatch(/not a two-system migration/i);
  });
});

describe('No Placeholders on Canvas & Export Blocking Gate', () => {
  const theme = DEFAULT_PALETTES[0];

  it('identifies placeholder and empty brand strings accurately', () => {
    expect(isPlaceholderOrEmptyBrandValue('')).toBe(true);
    expect(isPlaceholderOrEmptyBrandValue('   ')).toBe(true);
    expect(isPlaceholderOrEmptyBrandValue('System A')).toBe(true);
    expect(isPlaceholderOrEmptyBrandValue('System B')).toBe(true);
    expect(isPlaceholderOrEmptyBrandValue('PIPELINE MIGRATION')).toBe(true);
    expect(isPlaceholderOrEmptyBrandValue('DATASTREAM MIGRATION')).toBe(true);
    expect(isPlaceholderOrEmptyBrandValue('Apache Cassandra')).toBe(false);
    expect(isPlaceholderOrEmptyBrandValue('ScyllaDB')).toBe(false);
  });

  it('BLOCKS export in QA Checks, Pre-Export Checklist, and Risk Checks when placeholders or empty brand fields appear', () => {
    const deckWithPlaceholders: CarouselData = {
      id: 'placeholder-deck',
      theme: 'teal',
      brand: 'MARROK',
      category: 'ARCHITECTURE',
      caption: 'Test deck with placeholders',
      slides: [
        {
          type: 'subjectPair',
          enTitle: 'Database Migration Overview.',
          arTitle: 'نظرة عامة على ترحيل البيانات.',
          enCredit: 'Source: Engineering Blog',
          subjectPair: {
            beforeSystem: 'System A',
            afterSystem: 'System B',
            flowLabel: 'PIPELINE MIGRATION',
            logoWidthPct: 11,
          },
        },
        {
          type: 'cta',
          enTitle: 'Follow for More.',
          arTitle: 'تابعنا للمزيد.',
          ctaText: 'Save this post',
        },
      ],
    };

    const qa = runQAChecks(deckWithPlaceholders);
    expect(qa.canExport).toBe(false);
    expect(qa.results.some((r) => r.id.includes('placeholder-0-subjectPair-brands') && r.severity === 'fail')).toBe(true);
    expect(qa.results.some((r) => r.id.includes('placeholder-0-subjectPair-flowLabel') && r.severity === 'fail')).toBe(true);

    const checklist = runPreExportChecklist(deckWithPlaceholders, theme);
    const brandGate = checklist.find((c) => c.id === 'brandLogoSafety');
    const qualityGate = checklist.find((c) => c.id === 'contentQuality');
    expect(brandGate?.passed).toBe(false);
    expect(qualityGate?.passed).toBe(false);

    const risk = runPlatformRiskChecks(deckWithPlaceholders);
    expect(risk.status).toBe('BLOCK');
  });

  it('BLOCKS export when Subject Pair has empty beforeSystem or afterSystem', () => {
    const deckWithEmptyPair: CarouselData = {
      id: 'empty-pair-deck',
      theme: 'teal',
      brand: 'MARROK',
      category: 'ARCHITECTURE',
      caption: 'Test deck with empty Subject Pair',
      slides: [
        {
          type: 'subjectPair',
          enTitle: 'Architecture Shift.',
          arTitle: 'تحول معماري.',
          subjectPair: {
            beforeSystem: '',
            afterSystem: '',
          },
        },
      ],
    };

    const qa = runQAChecks(deckWithEmptyPair);
    expect(qa.canExport).toBe(false);
    const risk = runPlatformRiskChecks(deckWithEmptyPair);
    expect(risk.status).toBe('BLOCK');
  });
});

describe('Slide 1 Verification: Robot Pick-and-Place vs Discord Cassandra to ScyllaDB (Canvas & Checks)', () => {
  const theme = DEFAULT_PALETTES[0];

  function createRecordingCanvas() {
    const drawnTexts: Array<{ text: string; font: string; fontSizePx: number; x: number; y: number }> = [];
    const ctx: any = {
      canvas: { width: 1080, height: 1920 },
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
      width: 1080,
      height: 1920,
      getContext: () => ctx,
    };
    return { canvas, drawnTexts };
  }

  it('renders Robot Pick-and-Place Slide 1 (Mechanism flow) and Discord Slide 1 (Subject Pair) with >= 24px diagram/title labels and passes Checks', async () => {
    // 1. Robot Pick-and-Place Deck
    const robotInput =
      'Robotic Pick-and-Place: 6-DoF wrist camera guides a force-controlled gripper from bin to conveyor using closed-loop visual servoing and inverse kinematics.';
    const robotDeck = synthesizeCarousel({ prompt: robotInput });
    robotDeck.sourceMeta = {
      inputMode: 'topic',
      status: 'verified_live',
      userReviewed: true,
      verifiedNumbers: true,
      creator: 'IEEE Robotics Lab',
    };
    robotDeck.slides[robotDeck.slides.length - 1].enCredit = 'Source: IEEE Robotics Lab';

    const robotSlide1 = robotDeck.slides[0];
    expect(robotSlide1.type).toBe('row');
    expect(robotSlide1.subjectPair).toBeUndefined();

    const { canvas: robotCanvas, drawnTexts: robotTexts } = createRecordingCanvas();
    await renderSlideToCanvas(robotDeck, 0, robotCanvas, theme);

    // Verify zero placeholder strings drawn on Robot Slide 1
    const allRobotStrings = robotTexts.map((t) => t.text).join(' | ');
    expect(allRobotStrings).not.toMatch(/System A|System B|PIPELINE MIGRATION|DATASTREAM MIGRATION/i);

    // Verify all diagram & slide text labels (excluding CAD decorative watermark & footer pagination) are >= 24px
    const contentRobotTexts = robotTexts.filter(
      (t) =>
        !t.text.includes('SYS_REF') &&
        !t.text.includes('MARROK') &&
        !t.text.startsWith('01 /') &&
        !t.text.startsWith('Source:')
    );
    for (const item of contentRobotTexts) {
      expect(item.fontSizePx).toBeGreaterThanOrEqual(24);
    }

    const robotQA = runQAChecks(robotDeck);
    expect(robotQA.canExport).toBe(true);
    const robotChecklist = runPreExportChecklist(robotDeck, theme);
    expect(robotChecklist.every((c) => c.passed)).toBe(true);

    // 2. Discord Cassandra -> ScyllaDB Deck
    const discordInput =
      'How Discord Moved from Cassandra to ScyllaDB to Store Trillions of Chat Messages and Eliminate JVM GC Spikes.';
    const discordDeck = synthesizeCarousel({ prompt: discordInput });
    discordDeck.sourceMeta = {
      inputMode: 'topic',
      status: 'verified_live',
      userReviewed: true,
      verifiedNumbers: true,
      creator: 'Discord Engineering',
    };
    discordDeck.slides[discordDeck.slides.length - 1].enCredit = 'Source: Discord Engineering';

    const discordSlide1 = discordDeck.slides[0];
    expect(discordSlide1.type).toBe('subjectPair');
    expect(discordSlide1.subjectPair?.storyOwner).toBe('Discord');
    expect(discordSlide1.subjectPair?.beforeSystem).toBe('Apache Cassandra');
    expect(discordSlide1.subjectPair?.afterSystem).toBe('ScyllaDB');
    expect(discordSlide1.subjectPair?.logoWidthPct).toBe(11);

    const { canvas: discordCanvas, drawnTexts: discordTexts } = createRecordingCanvas();
    await renderSlideToCanvas(discordDeck, 0, discordCanvas, theme);

    const allDiscordStrings = discordTexts.map((t) => t.text).join(' | ');
    expect(allDiscordStrings).toContain('BEFORE');
    expect(allDiscordStrings).toContain('AFTER');
    expect(allDiscordStrings).toContain('Apache Cassandra');
    expect(allDiscordStrings).toContain('ScyllaDB');
    expect(allDiscordStrings).not.toMatch(/System A|System B|PIPELINE MIGRATION|DATASTREAM MIGRATION/i);

    const contentDiscordTexts = discordTexts.filter(
      (t) =>
        !t.text.includes('SYS_REF') &&
        !t.text.includes('MARROK') &&
        !t.text.startsWith('01 /') &&
        !t.text.startsWith('Source:')
    );
    for (const item of contentDiscordTexts) {
      expect(item.fontSizePx).toBeGreaterThanOrEqual(24);
    }

    // Verify vertical balance in usable safe zone (206px to 1428px)
    const discordLayout = computeSlideLayoutAwareness(discordSlide1, discordDeck);
    expect(discordLayout.graphicCard?.height).toBe(540);
    expect(discordLayout.arabicTitleBlock?.bottom).toBeGreaterThan(1020);
    expect(discordLayout.arabicTitleBlock?.bottom).toBeLessThanOrEqual(1428);

    const discordQA = runQAChecks(discordDeck);
    expect(discordQA.canExport).toBe(true);
    const discordChecklist = runPreExportChecklist(discordDeck, theme);
    expect(discordChecklist.every((c) => c.passed)).toBe(true);
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
