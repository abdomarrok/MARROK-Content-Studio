/**
 * MARROK Content Studio — Permanent Core Engine Benchmark Harness (Phase 2.6.1)
 *
 * Measures pure local business engines strictly through their public facades
 * (zero external network calls, zero AI provider latency).
 *
 * Explicitly separates:
 *  - cold   : cache cleared prior to every measured iteration
 *  - cached : warm memoized hit path (layout LRU cache)
 *  - warm   : post-JIT repeated execution on uncached pure computations
 *
 * Usage:
 *   npm run benchmark
 *   npm run benchmark -- --json
 */
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { DEFAULT_STARTER_DECK } from '../src/lib/presets.ts';
import {
  computeSlideLayoutAwareness,
  slideLayoutCache,
} from '../src/lib/canvas/layoutAwareness.ts';
import {
  diversifyDeckArchetypesAndVisuals,
  resolveSmartSlideVisuals,
} from '../src/lib/synthesis/smartVisualDefaults.ts';
import {
  runPreExportChecklist,
  runQAChecks,
} from '../src/lib/qaChecks.ts';
import { synthesizeUniversalCarousel } from '../src/lib/synthesis/universalExtractor.ts';
import type { CarouselData, SlideData } from '../src/types.ts';

interface BenchmarkRow {
  engine: string;
  mode: 'cold' | 'cached' | 'warm';
  fixture: string;
  fixtureDescription: string;
  inputSize: string;
  warmupIterations: number;
  measuredIterations: number;
  minMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}

function measureWorkload(config: {
  engine: string;
  mode: 'cold' | 'cached' | 'warm';
  fixture: string;
  fixtureDescription: string;
  inputSize: string;
  warmupIterations: number;
  measuredIterations: number;
  beforeEach?: () => void;
  fn: (iter: number) => unknown;
}): BenchmarkRow {
  for (let i = 0; i < config.warmupIterations; i++) {
    config.beforeEach?.();
    config.fn(i);
  }

  const samples: number[] = [];
  for (let i = 0; i < config.measuredIterations; i++) {
    config.beforeEach?.();
    const start = performance.now();
    config.fn(i);
    const end = performance.now();
    samples.push(end - start);
  }

  samples.sort((a, b) => a - b);

  return {
    engine: config.engine,
    mode: config.mode,
    fixture: config.fixture,
    fixtureDescription: config.fixtureDescription,
    inputSize: config.inputSize,
    warmupIterations: config.warmupIterations,
    measuredIterations: config.measuredIterations,
    minMs: round3(samples[0] ?? 0),
    medianMs: round3(percentile(samples, 50)),
    p95Ms: round3(percentile(samples, 95)),
    maxMs: round3(samples[samples.length - 1] ?? 0),
  };
}

// ── Representative Fixtures ────────────────────────────────────────────────

const ONE_SLIDE_POSTER_DECK: CarouselData = {
  ...structuredClone(DEFAULT_STARTER_DECK),
  id: 'bench_one_slide_poster',
  postFormat: 'single',
  dimensionPreset: 'ig-3:4',
  slides: [
    {
      ...structuredClone(DEFAULT_STARTER_DECK.slides[0]),
      type: 'poster',
      enTitle: 'Why Postgres Keyset Pagination Beats OFFSET',
      arTitle: 'لماذا يتفوق Keyset Pagination في PostgreSQL على OFFSET',
      enBody: 'OFFSET scans and discards previous rows at scale, while keyset pagination jumps directly via composite B-Tree indexes.',
      arBody: 'يقوم OFFSET بمسح وتجاهل الصفوف السابقة عند التوسع بينما يقفز Keyset Pagination مباشرة عبر فهرس B-Tree المركب.',
      enCredit: 'Source: MARROK',
      arCredit: 'المصدر: MARROK',
      takeaways: [
        { en: 'O(log N) index seek', ar: 'بحث فهرسي O(log N)', icon: 'zap' },
        { en: 'Zero skipped rows', ar: 'لا صفوف مفقودة أبداً', icon: 'shield' },
        { en: 'Stable under writes', ar: 'ثبات أثناء الكتابة المتزامنة', icon: 'database' },
      ],
    },
  ],
};

const EIGHT_SLIDE_DECK: CarouselData = structuredClone(DEFAULT_STARTER_DECK);

function buildLargeBilingualDeck(): CarouselData {
  const baseSlides = structuredClone(DEFAULT_STARTER_DECK.slides);
  const extraSlides: SlideData[] = [
    {
      type: 'compare',
      enTitle: 'PgBouncer Transaction Pooling vs Direct Links',
      arTitle: 'مقارنة PgBouncer Transaction Pooling والاتصال المباشر',
      enBody: 'Serverless bursts open dozens of cold sockets; transaction pooling multiplexes hundreds of clients onto minimal backend slots.',
      arBody: 'ذروات Serverless تفتح عشرات الاتصالات الباردة بينما يضاعف Transaction Pooling كفاءة الاتصالات الخلفية.',
      compareLeftTitle: 'Direct Pool',
      compareLeftBody: '5 × N sockets\nExhausts DB limits\nCold burst timeouts',
      compareRightTitle: 'Neon Pooler',
      compareRightBody: 'PgBouncer multiplex\n2 sockets / lambda\nZero saturation',
      layoutOverrides: {
        titleBlock: { dx: 0, dy: -6, scale: 0.98 },
        bodyBlock: { dx: 0, dy: 4, scale: 1 },
      },
    },
    {
      type: 'code',
      enTitle: 'Deterministic Composite Keyset Predicate',
      arTitle: 'شرط Keyset المركب والحتمي في الاستعلام',
      enBody: 'Always pair updated_at DESC with id DESC so identical millisecond timestamps remain strictly ordered across pages.',
      arBody: 'اربط دائماً updated_at DESC مع id DESC لضمان ترتيب حتمي للصفوف ذات الطابع الزمني المتطابق.',
      codeLanguage: 'sql',
      codeFileName: 'saved_posts_page.sql',
      codeSnippet: `SELECT * FROM saved_posts\nWHERE (updated_at, id) < ($1, $2)\nORDER BY updated_at DESC, id DESC\nLIMIT $3;`,
      takeaways: [
        { en: 'Deterministic tie-breaker', ar: 'كسر تعادل حتمي', icon: 'check' },
        { en: 'Composite B-Tree index', ar: 'فهرس B-Tree مركب', icon: 'layers' },
      ],
    },
  ];
  const slides = [...baseSlides.slice(0, 7), ...extraSlides, baseSlides[baseSlides.length - 1]];
  return {
    ...structuredClone(DEFAULT_STARTER_DECK),
    id: 'bench_large_bilingual_10_slides',
    category: 'POSTGRESQL SCALABILITY',
    slides,
    sourceMeta: {
      ...DEFAULT_STARTER_DECK.sourceMeta,
      isSearchGrounded: true,
      groundingVerified: true,
      userReviewed: true,
      humanApproved: true,
      verifiedNumbers: true,
      groundingSources: [
        { title: 'Neon Connection Pooling Architecture', url: 'https://neon.tech/docs/connect/connection-pooling' },
        { title: 'PostgreSQL Row-Value Comparison Index Scan', url: 'https://www.postgresql.org/docs/current/indexes-multicolumn.html' },
      ],
    },
  };
}

const LARGE_BILINGUAL_DECK = buildLargeBilingualDeck();

const COMPLEX_LAYOUT_SLIDE: SlideData = {
  ...structuredClone(ONE_SLIDE_POSTER_DECK.slides[0]),
  enTitle: 'Deterministic Keyset Pagination Under Concurrent Production Writes',
  arTitle: 'ترقيم Keyset الحتمي أثناء التحديثات المتزامنة في بيئة الإنتاج',
  enBody: 'Combining composite (updated_at DESC, id DESC) indexes with opaque base64url cursors prevents duplicate records, skipped rows, and OFFSET scan amplification.',
  arBody: 'الجمع بين الفهرس المركب (updated_at DESC, id DESC) ومؤشرات base64url يمنع تكرار السجلات أو فقدانها أثناء الكتابة المتزامنة.',
  coverTeaserEn: 'Zero OFFSET drift at 100k+ rows',
  coverTeaserAr: 'صفر انزياح للصفوف عند تجاوز 100 ألف سجل',
  showSwipeCue: true,
  swipeCueText: 'SWIPE FOR BENCHMARKS',
  layoutOverrides: {
    graphicCard: { dx: 0, dy: -8, scale: 0.96 },
    titleBlock: { dx: 0, dy: 4, scale: 1.02 },
    bodyBlock: { dx: 0, dy: 6, scale: 0.98 },
  },
};

const SHORT_EXTRACTOR_INPUT =
  'PostgreSQL vs MySQL indexing: switching from OFFSET pagination to composite keyset pagination cut p99 latency from 420ms to 14ms across 500k rows.';

const MEDIUM_EXTRACTOR_INPUT = `
How Cloudflare reduced Kafka tail latency by 68% while migrating 1.2M events/sec across regional clusters.
1. Problem: Unbounded producer batches caused p99 flush latency to spike above 850ms during traffic bursts.
2. Root cause: Single-partition hotspots saturated disk IOPS and triggered consumer group rebalances every 4 minutes.
3. Architecture shift: Partition keys were salted with tenant hash prefixes, moving from 16 to 128 partitions per topic.
4. Compression tuning: Switching from GZIP to Zstd reduced network egress by 41% with only 3% CPU overhead.
5. Backpressure: Bounded in-flight queues capped memory usage at 256MB per worker node instead of OOM crashes.
6. Outcome: p99 delivery latency dropped from 850ms to 270ms and rebalance storms fell to zero over 30 days.
`.trim();

const LARGE_EXTRACTOR_INPUT = `
Production Postmortem & Architecture Migration: Moving a Multi-Tenant Analytics Pipeline from Redis + MongoDB to Neon PostgreSQL + ClickHouse.

Executive Metrics:
- Query p99 dropped from 1,420ms to 62ms (95.6% improvement) across 48M daily rows.
- Monthly infrastructure spend fell from $18,400 to $6,900 (62.5% reduction).
- Connection pool saturation incidents dropped from 14/week to 0 after adopting PgBouncer transaction pooling with 5s connect timeout and 10s statement timeout.
- Data ingestion throughput increased from 12,000 events/sec to 95,000 events/sec using UNNEST batched upserts.

Detailed Engineering Breakdown:
- Legacy bottleneck: Serverless API functions opened max=10 direct PostgreSQL sockets per warm lambda. During webhook bursts (40 concurrent instances), 400 sockets overwhelmed the 100-connection direct limit and triggered cascading 503 timeouts.
- Fix 1 (Pool Governance): Separated Express long-lived pool sizing (max=5) from serverless function sizing (max=2, allowExitOnIdle=true) and routed all Lambda/Vercel traffic through Neon's -pooler endpoint.
- Fix 2 (Pagination): Replaced naive LIMIT 100 / OFFSET queries with deterministic (updated_at DESC, id DESC) keyset cursors encoded in base64url. Identical timestamps no longer caused skipped or duplicated records during concurrent edits.
- Fix 3 (Observability): Added validated X-Request-Id propagation across CORS, auth, rate-limiter, and error paths so slow queries (>500ms) and provider timeouts correlate to exact user requests without leaking tokens or payloads.
- Fix 4 (Health vs Readiness): Split liveness (/api/health) from database readiness (/api/health?probe=ready) with a strict 2.5s SELECT 1 timeout so optional third-party outages never take down core health checks.
- Fix 5 (Memory Safety): Wrapped WebCodecs VideoFrame/AudioData encode calls and MediaRecorder tracks in strict finally blocks to prevent GPU/IPC memory leaks on aborted exports.
`.repeat(2).trim();

function deckCharCount(deck: CarouselData): number {
  return JSON.stringify(deck).length;
}

export function runAllBenchmarks(): {
  environment: Record<string, unknown>;
  results: BenchmarkRow[];
} {
  const cpus = os.cpus();
  const environment = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    platform: `${os.platform()} ${os.release()} (${os.arch()})`,
    cpuModel: cpus[0]?.model?.trim() || 'unknown',
    cpuCores: cpus.length,
    totalMemoryGb: Math.round((os.totalmem() / 1024 ** 3) * 100) / 100,
    canvasContextAvailable: typeof document !== 'undefined',
  };

  const results: BenchmarkRow[] = [
    // ── 1. Layout Awareness Engine ─────────────────────────────────────────
    measureWorkload({
      engine: 'Layout Awareness',
      mode: 'cold',
      fixture: '1-slide poster (cache cleared)',
      fixtureDescription: 'computeSlideLayoutAwareness on 1-slide bilingual poster with 3 takeaways; slideLayoutCache cleared before every run',
      inputSize: `1 slide (${JSON.stringify(ONE_SLIDE_POSTER_DECK.slides[0]).length} chars)`,
      warmupIterations: 25,
      measuredIterations: 200,
      beforeEach: () => slideLayoutCache.clear(),
      fn: () => computeSlideLayoutAwareness(ONE_SLIDE_POSTER_DECK.slides[0], ONE_SLIDE_POSTER_DECK, 0),
    }),
    measureWorkload({
      engine: 'Layout Awareness',
      mode: 'cached',
      fixture: '1-slide poster (LRU cache hit)',
      fixtureDescription: 'computeSlideLayoutAwareness repeated hit against populated slideLayoutCache (clones cached layout)',
      inputSize: `1 slide (${JSON.stringify(ONE_SLIDE_POSTER_DECK.slides[0]).length} chars)`,
      warmupIterations: 50,
      measuredIterations: 500,
      fn: () => computeSlideLayoutAwareness(ONE_SLIDE_POSTER_DECK.slides[0], ONE_SLIDE_POSTER_DECK, 0),
    }),
    measureWorkload({
      engine: 'Layout Awareness',
      mode: 'cold',
      fixture: 'complex bilingual slide + overrides (cache cleared)',
      fixtureDescription: 'Dense EN+AR slide with teaser, takeaways, swipe cue, and layoutOverrides; cache cleared before every run',
      inputSize: `1 complex slide (${JSON.stringify(COMPLEX_LAYOUT_SLIDE).length} chars)`,
      warmupIterations: 25,
      measuredIterations: 200,
      beforeEach: () => slideLayoutCache.clear(),
      fn: () => computeSlideLayoutAwareness(COMPLEX_LAYOUT_SLIDE, ONE_SLIDE_POSTER_DECK, 0),
    }),
    measureWorkload({
      engine: 'Layout Awareness',
      mode: 'cold',
      fixture: '8-slide deck full pass (cache cleared)',
      fixtureDescription: 'computeSlideLayoutAwareness across all 8 slides of DEFAULT_STARTER_DECK; cache cleared before every deck pass',
      inputSize: `8 slides (${deckCharCount(EIGHT_SLIDE_DECK)} chars)`,
      warmupIterations: 20,
      measuredIterations: 150,
      beforeEach: () => slideLayoutCache.clear(),
      fn: () => {
        for (let i = 0; i < EIGHT_SLIDE_DECK.slides.length; i++) {
          computeSlideLayoutAwareness(EIGHT_SLIDE_DECK.slides[i], EIGHT_SLIDE_DECK, i);
        }
      },
    }),
    measureWorkload({
      engine: 'Layout Awareness',
      mode: 'cached',
      fixture: '8-slide deck full pass (LRU cache hit)',
      fixtureDescription: 'computeSlideLayoutAwareness across all 8 slides served from populated slideLayoutCache',
      inputSize: `8 slides (${deckCharCount(EIGHT_SLIDE_DECK)} chars)`,
      warmupIterations: 30,
      measuredIterations: 300,
      fn: () => {
        for (let i = 0; i < EIGHT_SLIDE_DECK.slides.length; i++) {
          computeSlideLayoutAwareness(EIGHT_SLIDE_DECK.slides[i], EIGHT_SLIDE_DECK, i);
        }
      },
    }),

    // ── 2. Smart Visual Defaults Engine ────────────────────────────────────
    measureWorkload({
      engine: 'Smart Visual Defaults',
      mode: 'warm',
      fixture: '1-slide resolveSmartSlideVisuals',
      fixtureDescription: 'Single-slide icon matching, archetype inference, and visual defaults resolution',
      inputSize: `1 slide (${JSON.stringify(ONE_SLIDE_POSTER_DECK.slides[0]).length} chars)`,
      warmupIterations: 25,
      measuredIterations: 200,
      fn: () => resolveSmartSlideVisuals(ONE_SLIDE_POSTER_DECK.slides[0], 0, true),
    }),
    measureWorkload({
      engine: 'Smart Visual Defaults',
      mode: 'warm',
      fixture: '8-slide deck diversification',
      fixtureDescription: 'diversifyDeckArchetypesAndVisuals across 8-slide DEFAULT_STARTER_DECK',
      inputSize: `8 slides (${deckCharCount(EIGHT_SLIDE_DECK)} chars)`,
      warmupIterations: 20,
      measuredIterations: 150,
      fn: () => diversifyDeckArchetypesAndVisuals(EIGHT_SLIDE_DECK.slides),
    }),
    measureWorkload({
      engine: 'Smart Visual Defaults',
      mode: 'warm',
      fixture: '10-slide large bilingual deck diversification',
      fixtureDescription: 'diversifyDeckArchetypesAndVisuals across 10-slide bilingual deck with compare/code/metric slides',
      inputSize: `10 slides (${deckCharCount(LARGE_BILINGUAL_DECK)} chars)`,
      warmupIterations: 20,
      measuredIterations: 150,
      fn: () => diversifyDeckArchetypesAndVisuals(LARGE_BILINGUAL_DECK.slides),
    }),

    // ── 3. QA Engine ───────────────────────────────────────────────────────
    measureWorkload({
      engine: 'QA Engine',
      mode: 'warm',
      fixture: '1-slide poster runQAChecks',
      fixtureDescription: 'Full QA validation on 1-slide bilingual poster',
      inputSize: `1 slide (${deckCharCount(ONE_SLIDE_POSTER_DECK)} chars)`,
      warmupIterations: 25,
      measuredIterations: 200,
      fn: () => runQAChecks(ONE_SLIDE_POSTER_DECK),
    }),
    measureWorkload({
      engine: 'QA Engine',
      mode: 'warm',
      fixture: '8-slide deck runQAChecks',
      fixtureDescription: 'Full QA suite on 8-slide DEFAULT_STARTER_DECK (text limits, BiDi, structure, contrast)',
      inputSize: `8 slides (${deckCharCount(EIGHT_SLIDE_DECK)} chars)`,
      warmupIterations: 20,
      measuredIterations: 150,
      fn: () => runQAChecks(EIGHT_SLIDE_DECK),
    }),
    measureWorkload({
      engine: 'QA Engine',
      mode: 'warm',
      fixture: '10-slide large bilingual QA + Pre-Export Checklist',
      fixtureDescription: 'Combined runQAChecks + 12-point runPreExportChecklist on 10-slide grounded bilingual deck',
      inputSize: `10 slides (${deckCharCount(LARGE_BILINGUAL_DECK)} chars)`,
      warmupIterations: 15,
      measuredIterations: 100,
      fn: () => {
        runQAChecks(LARGE_BILINGUAL_DECK);
        runPreExportChecklist(LARGE_BILINGUAL_DECK);
      },
    }),

    // ── 4. Universal Extractor Engine ──────────────────────────────────────
    measureWorkload({
      engine: 'Universal Extractor',
      mode: 'warm',
      fixture: 'short prompt (~150 chars)',
      fixtureDescription: 'synthesizeUniversalCarousel on concise comparative engineering prompt',
      inputSize: `${SHORT_EXTRACTOR_INPUT.length} chars`,
      warmupIterations: 15,
      measuredIterations: 100,
      fn: () => synthesizeUniversalCarousel(SHORT_EXTRACTOR_INPUT),
    }),
    measureWorkload({
      engine: 'Universal Extractor',
      mode: 'warm',
      fixture: 'medium engineering brief (~800 chars, numbered points)',
      fixtureDescription: 'synthesizeUniversalCarousel on realistic 6-point Kafka latency case study',
      inputSize: `${MEDIUM_EXTRACTOR_INPUT.length} chars`,
      warmupIterations: 15,
      measuredIterations: 100,
      fn: () => synthesizeUniversalCarousel(MEDIUM_EXTRACTOR_INPUT),
    }),
    measureWorkload({
      engine: 'Universal Extractor',
      mode: 'warm',
      fixture: 'large architectural brief (~3,600 chars, dense metrics)',
      fixtureDescription: 'synthesizeUniversalCarousel on long multi-metric Postgres/ClickHouse migration postmortem',
      inputSize: `${LARGE_EXTRACTOR_INPUT.length} chars`,
      warmupIterations: 10,
      measuredIterations: 60,
      fn: () => synthesizeUniversalCarousel(LARGE_EXTRACTOR_INPUT),
    }),
  ];

  // Leave layout cache clean on exit
  slideLayoutCache.clear();

  return { environment, results };
}

function main() {
  const asJson = process.argv.includes('--json');
  const output = runAllBenchmarks();

  if (asJson) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const env = output.environment;
  console.log('=== MARROK Core Engine Benchmarks (Pure Local Execution) ===');
  console.log(
    `Runtime: Node ${env.nodeVersion} (V8 ${env.v8Version}) | ${env.platform} | CPU: ${env.cpuModel} (${env.cpuCores} cores) | RAM: ${env.totalMemoryGb} GB | Canvas 2D: ${env.canvasContextAvailable ? 'DOM' : 'headless-fallback'}`
  );
  console.log('');
  console.table(
    output.results.map((r) => ({
      Engine: r.engine,
      Mode: r.mode,
      Fixture: r.fixture,
      Input: r.inputSize,
      'Warmup/Iters': `${r.warmupIterations}/${r.measuredIterations}`,
      'Min (ms)': r.minMs,
      'Median (ms)': r.medianMs,
      'p95 (ms)': r.p95Ms,
      'Max (ms)': r.maxMs,
    }))
  );
}

main();
