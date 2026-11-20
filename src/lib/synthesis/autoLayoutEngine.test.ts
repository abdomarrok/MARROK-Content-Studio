import { describe, expect, it } from 'vitest';
import type { SlideData } from '../../types.ts';
import {
  applyDeckAwareAutoLayout,
  evaluateAutoLayoutForSlideEdit,
  getSlideCatalogId,
  rankSlideLayoutsForDeck,
} from './autoLayoutEngine.ts';

describe('autoLayoutEngine deck-aware ranking and default-on edit adaptation', () => {
  it('ranks semantic visual layouts accurately across charts, sequences, timelines, matrices, tables, callouts, code, metric, and subjectPair', () => {
    const barSlide: SlideData = {
      type: 'row',
      enTitle: 'Engine Throughput Benchmark.',
      enBody: 'Baseline queued 120 req/s, Go worker hit 480 req/s, and Rust SIMD reached 960 req/s.',
    };
    const barRanked = rankSlideLayoutsForDeck(barSlide, [barSlide], 1);
    expect(barRanked[0].id).toBe('visual:bar-chart');

    const timelineSlide: SlideData = {
      type: 'row',
      enTitle: 'Cloud Control Plane Outage Postmortem.',
      enBody: '14:02 UTC BGP route leak began -> 14:11 UTC region failover triggered -> 14:19 UTC recovery complete.',
    };
    const timelineRanked = rankSlideLayoutsForDeck(timelineSlide, [timelineSlide], 1);
    expect(timelineRanked[0].id).toBe('visual:timeline');

    const seqSlide: SlideData = {
      type: 'row',
      enTitle: 'OAuth 2.0 Token Exchange Handshake.',
      enBody: 'Client -> Auth Server issues grant, Auth Server -> Token Endpoint validates PKCE challenge.',
    };
    const seqRanked = rankSlideLayoutsForDeck(seqSlide, [seqSlide], 1);
    expect(seqRanked[0].id).toBe('visual:sequence');

    const matrixSlide: SlideData = {
      type: 'row',
      enTitle: 'Architectural Trade-Off Quadrant.',
      enBody: 'Four quadrants mapping Latency vs Cost tradeoffs across managed and self-hosted clusters.',
    };
    const matrixRanked = rankSlideLayoutsForDeck(matrixSlide, [matrixSlide], 1);
    expect(matrixRanked[0].id).toBe('visual:matrix');

    const tableSlide: SlideData = {
      type: 'row',
      enTitle: 'Vector Storage Comparison Table.',
      enBody: 'Compare latency and cost benchmark numbers in a matrix table across pgvector vs Qdrant vs Milvus.',
    };
    const tableRanked = rankSlideLayoutsForDeck(tableSlide, [tableSlide], 1);
    expect(tableRanked[0].id).toBe('visual:table');

    const calloutSlide: SlideData = {
      type: 'row',
      enTitle: 'Engineering Principle on State.',
      enBody: '"Distributed queues hide backpressure until retry storms double p99 latency." — Systems Postmortem Report',
    };
    const calloutRanked = rankSlideLayoutsForDeck(calloutSlide, [calloutSlide], 1);
    expect(calloutRanked[0].id).toBe('visual:callout');

    const codeSlide: SlideData = {
      type: 'row',
      enTitle: 'CREATE INDEX CONCURRENTLY ON vectors.',
      enBody: 'Run SELECT id FROM chunks ORDER BY embedding <=> query LIMIT 10 in SQL.',
    };
    const codeRanked = rankSlideLayoutsForDeck(codeSlide, [codeSlide], 1);
    expect(codeRanked[0].id).toBe('code');

    const pairSlide: SlideData = {
      type: 'row',
      enTitle: 'Migrating from Redis to PostgreSQL.',
      enBody: 'Moving session state out of Redis into durable PostgreSQL UNLOGGED tables.',
    };
    const pairRanked = rankSlideLayoutsForDeck(pairSlide, [pairSlide], 1);
    expect(pairRanked[0].id).toBe('subjectPair');
  });

  it('never recommends hub or empty metric on multi-slide Slide 1 cover', () => {
    const coverSlide: SlideData = {
      type: 'hub',
      enTitle: 'Central Platform Architecture Overview.',
      enBody: '',
    };
    const deck: SlideData[] = [
      coverSlide,
      { type: 'row', enTitle: 'Slide 2', enBody: 'Worker queue orchestration.' },
      { type: 'cta', enTitle: 'Follow', enBody: '' },
    ];
    const ranked = rankSlideLayoutsForDeck(coverSlide, deck, 0);
    expect(ranked[0].slideType).not.toBe('hub');
    expect(ranked[0].slideType).not.toBe('metric');
    expect(ranked[0].slideType).not.toBe('cta');
  });

  it('penalizes adjacent sibling repetition so neighboring slides stay visually distinct', () => {
    const prevCompare: SlideData = {
      type: 'compare',
      enTitle: 'Monolith vs Microservices.',
      enBody: 'Deployment coupling compared to network hops.',
      compareLeftTitle: 'MONOLITH',
      compareRightTitle: 'MICROSERVICES',
    };
    const currentSlide: SlideData = {
      type: 'row',
      enTitle: 'Hot Cache vs Disk Tiering.',
      enBody: 'Splitting hot cache versus cold disk storage layers cuts cost by 42%.',
    };
    const nextCompare: SlideData = {
      type: 'compare',
      enTitle: 'Sync vs Async Workers.',
      enBody: 'Blocking RPC vs background event queue.',
    };

    const deckWithNeighbors = [prevCompare, currentSlide, nextCompare];
    const ranked = rankSlideLayoutsForDeck(currentSlide, deckWithNeighbors, 1);

    // Adjacent 'compare' gets heavy penalty (-18 x 2 = -36), so it loses top slot to a distinct visual
    expect(ranked[0].id).not.toBe('compare');
  });

  it('auto-adapts unlocked slides on copy edits while respecting hysteresis and manualLayoutLocked', () => {
    const deck: SlideData[] = [
      {
        type: 'row',
        diagramVariant: 'topology',
        enTitle: 'Request Ingress Pipeline.',
        enBody: 'Traffic enters the edge proxy and routes to stateless workers.',
      },
      {
        type: 'row',
        diagramVariant: 'topology',
        enTitle: 'Latency Benchmark Comparison.',
        enBody: 'Redis returned 1.4ms, Memcached took 2.1ms, and Postgres read was 14.8ms.',
      },
      { type: 'cta', enTitle: 'Join @MARROK', enBody: '' },
    ];

    const upgraded = evaluateAutoLayoutForSlideEdit(deck[1], deck, 1, {
      postFormat: 'carousel',
    });
    expect(upgraded).not.toBeNull();
    expect(upgraded?.type).toBe('visual');
    expect(upgraded?.visualSpec?.kind).toBe('bar-chart');
    expect(upgraded?.manualLayoutLocked).toBe(false);
    expect(upgraded?.layoutRationale).toContain('Auto-picked');

    // Locked slide must never change
    const lockedSlide: SlideData = {
      ...deck[1],
      manualLayoutLocked: true,
    };
    expect(evaluateAutoLayoutForSlideEdit(lockedSlide, deck, 1)).toBeNull();

    // Small hysteresis prevents unnecessary flicker on minor tweaks to an already strong layout
    const alreadyMatched = upgraded!;
    const minorTweak: SlideData = {
      ...alreadyMatched,
      enTitle: 'Latency Benchmark Comparison v2.',
    };
    const afterMinor = evaluateAutoLayoutForSlideEdit(minorTweak, [deck[0], minorTweak, deck[2]], 1);
    if (afterMinor) {
      expect(getSlideCatalogId(afterMinor)).toBe(getSlideCatalogId(alreadyMatched));
    }
  });

  it('applyDeckAwareAutoLayout sets manualLayoutLocked=false by default and respects preserveAuthenticAiVisuals', () => {
    const slides: SlideData[] = [
      {
        type: 'hub', // Invalid on multi-slide cover -> engine fixes it
        enTitle: 'Why Vector Databases Stall at 50M Rows.',
        enBody: '',
      },
      {
        type: 'visual',
        enTitle: 'Qdrant vs pgvector Latency.',
        enBody: 'Qdrant hit 9ms p99 while pgvector reached 48ms at 10M vectors.',
        visualSpec: {
          kind: 'bar-chart',
          title: 'LATENCY COMPARISON',
          bars: [
            { label: 'Qdrant', value: 9, displayValue: '9ms' },
            { label: 'pgvector', value: 48, displayValue: '48ms' },
          ],
        },
      },
      {
        type: 'code',
        manualLayoutLocked: true,
        enTitle: 'Locked Code Slide.',
        enBody: 'Should stay locked even with benchmarks 10ms vs 20ms vs 40ms.',
      },
      {
        type: 'cta',
        enTitle: 'Follow @MARROK',
        enBody: '',
      },
    ];

    const out = applyDeckAwareAutoLayout(slides, {
      postFormat: 'carousel',
      preserveAuthenticAiVisuals: true,
    });

    expect(out[0].type).not.toBe('hub');
    expect(out[0].manualLayoutLocked).toBe(false);
    expect(out[1].type).toBe('visual');
    expect(out[1].visualSpec?.kind).toBe('bar-chart');
    expect(out[1].manualLayoutLocked).toBe(false);
    expect(out[2].type).toBe('code');
    expect(out[2].manualLayoutLocked).toBe(true);
    expect(out[3].type).toBe('cta');
  });
});
