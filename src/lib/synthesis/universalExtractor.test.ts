import { describe, expect, it } from 'vitest';
import {
  cleanRawInput,
  mentionsGoLanguage,
  parseComparativeEntities,
  scanMetrics,
  synthesizeUniversalCarousel,
} from './universalExtractor';
import { extractCleanSubject } from '../text/headlines';
import { diversifyDeckArchetypesAndVisuals } from './smartVisualDefaults';
import { seedSlideArchetypeData } from './archetypes';

describe('cleanRawInput', () => {
  it('strips list markers without deleting leading years or metrics', () => {
    const { lines } = cleanRawInput(
      '2025 product roadmap for the runtime\n- 1.66x throughput gain in 2025\n2. Go Gin handles 129k req/s'
    );

    expect(lines).toEqual([
      '2025 product roadmap for the runtime',
      '1.66x throughput gain in 2025',
      'Go Gin handles 129k req/s',
    ]);
  });
});

describe('scanMetrics', () => {
  it('preserves multipliers and years from source text', () => {
    const metrics = scanMetrics('In 2025 the new runtime reached 1.66x speedup and 13 MB memory.');

    expect(metrics.map((metric) => metric.value)).toEqual(
      expect.arrayContaining(['13 MB', '1.66x speedup'])
    );
  });
});

describe('parseComparativeEntities', () => {
  it('parses arbitrary comparison labels and assigns metrics to the correct side', () => {
    const entities = parseComparativeEntities(
      'PostgreSQL vs MySQL: Postgres 12ms latency, MySQL 18ms latency',
      scanMetrics('PostgreSQL vs MySQL: Postgres 12ms latency, MySQL 18ms latency')
    );

    expect(entities.isComparative).toBe(true);
    expect(entities.leftTitle).toBe('PostgreSQL');
    expect(entities.rightTitle).toBe('MySQL Stack');
    expect(entities.leftBullets).toEqual(['• 12 ms latency']);
    expect(entities.rightBullets).toEqual(['• 18 ms latency']);
  });

  it('handles Rust/Go comparisons with memory and throughput metrics', () => {
    const raw =
      'Rust Actix 1.66x faster than Go Gin\n- Rust: 1.66x speedup, 13 MB memory\n- Go: 129k req/s, 38 MB memory';
    const entities = parseComparativeEntities(raw, scanMetrics(raw));

    expect(entities.leftTitle).toBe('Rust Actix-web');
    expect(entities.rightTitle).toBe('Go Gin API');
    expect(entities.leftBullets).toEqual(['• 1.66x speedup', '• 13 MB memory footprint']);
    expect(entities.rightBullets).toEqual(['• 129k req/s throughput', '• 38 MB memory footprint']);
  });
});

describe('mentionsGoLanguage', () => {
  it('does not treat ordinary English "go" as the Go language', () => {
    expect(mentionsGoLanguage('I want to go home and go to market')).toBe(false);
    expect(mentionsGoLanguage('Rust vs Go performance')).toBe(true);
    expect(mentionsGoLanguage('The Go runtime scheduler uses goroutines')).toBe(true);
    expect(mentionsGoLanguage('Gin API benchmark')).toBe(true);
  });
});

describe('extractCleanSubject', () => {
  it('extracts technical nouns and clean Arabic subjects without question grammar', () => {
    const gitSubject = extractCleanSubject('Why did Anthropic move beyond Git?');
    expect(gitSubject.cleanSubject).toBe('Anthropic Scion');
    expect(gitSubject.arSubject).toBe('أنظمة Scion');

    const dockerSubject = extractCleanSubject('Docker container security in production');
    expect(dockerSubject.cleanSubject).toBe('Docker Containers');
    expect(dockerSubject.arSubject).toBe('حاويات Docker');

    const redisSubject = extractCleanSubject('Redis 8 vs Valkey: In-memory performance breakdown');
    expect(redisSubject.cleanSubject).toBe('Redis & Caching');
    expect(redisSubject.arSubject).toBe('قواعد Redis');

    const postgresSubject = extractCleanSubject('PostgreSQL connection pooling with PgBouncer');
    expect(postgresSubject.cleanSubject).toBe('PostgreSQL');
    expect(postgresSubject.arSubject).toBe('قواعد PostgreSQL');
  });
});

describe('synthesizeUniversalCarousel (Zero AI Slop)', () => {
  it('generates a topic-accurate VCS & Scion narrative without Rust/Go benchmark leaks', () => {
    const slides = synthesizeUniversalCarousel('Why did Anthropic move beyond Git?');

    expect(slides).toHaveLength(8);
    expect(slides[0].type).toBe('hub');
    expect(slides[0].enTitle).toContain('Anthropic');
    expect(slides[0].satLabels).toEqual(
      expect.arrayContaining(['Virtual FS', 'Server Merge', 'API VCS'])
    );

    // Slide 2 is the 100 GB monorepo scale trigger
    expect(slides[1].type).toBe('metric');
    expect(slides[1].metricValue).toBe('100 GB');

    // Slide 4 is Compare
    expect(slides[3].type).toBe('compare');
    expect(slides[3].compareLeftTitle).toBe('Traditional Git');
    expect(slides[3].compareRightTitle).toBe('Anthropic Scion');

    // Slide 7 is the honest engineering trade-off
    expect(slides[6].type).toBe('row');
    expect(slides[6].diagramVariant).toBe('takeaway');
    expect(slides[6].enTitle).toBe('Not a Git killer.');

    // Slide 8 is the closer CTA
    expect(slides[7].type).toBe('cta');

    // Verify ZERO Rust/Go leaks in VCS story
    const fullText = JSON.stringify(slides);
    expect(fullText).not.toContain('Actix');
    expect(fullText).not.toContain('Gin');
    expect(fullText).not.toContain('129k req/s');
  });

  it('generates a dedicated Docker multi-stage build narrative without VCS or Rust leaks', () => {
    const slides = synthesizeUniversalCarousel('Docker container isolation and minimal images');

    expect(slides).toHaveLength(8);
    expect(slides[0].type).toBe('hub');
    expect(slides[0].satLabels).toEqual(
      expect.arrayContaining(['Multi-Stage', 'Scratch Base', 'Minimal Image'])
    );

    // Slide 3 is the multi-stage Dockerfile
    expect(slides[3].type).toBe('code');
    expect(slides[3].codeLanguage).toBe('dockerfile');
    expect(slides[3].codeSnippet).toContain('FROM scratch');

    // Verify ZERO Git/Scion leaks in Docker story
    const fullText = JSON.stringify(slides);
    expect(fullText).not.toContain('Scion');
    expect(fullText).not.toContain('Anthropic');
    expect(fullText).not.toContain('25M checkouts');
  });

  it('generates a dedicated Redis in-memory narrative without leaks', () => {
    const slides = synthesizeUniversalCarousel('Redis 8 cluster performance and memory tradeoffs');

    expect(slides).toHaveLength(8);
    expect(slides[0].type).toBe('hub');
    expect(slides[0].satLabels).toEqual(
      expect.arrayContaining(['In-Memory', 'Active Sharding', 'LRU Eviction'])
    );

    // Slide 2 is in-memory throughput metric
    expect(slides[1].type).toBe('metric');
    expect(slides[1].metricValue).toBe('1.2M ops');

    // Verify ZERO Docker or Scion leaks in Redis story
    const fullText = JSON.stringify(slides);
    expect(fullText).not.toContain('Dockerfile');
    expect(fullText).not.toContain('Scion');
  });

  it('builds slides directly from user-provided substantive notes', () => {
    const userNotes = `Modernizing Web Gateway
- Replaced reverse proxy with Envoy mesh sidecars
- Reduced P99 response latency by 45ms across services
- Implemented mutual TLS with automatic SPIFFE rotation
- Trade-off: increased proxy memory footprint by 12MB per container`;

    const slides = synthesizeUniversalCarousel(userNotes);

    expect(slides).toHaveLength(8);
    expect(slides[0].type).toBe('hub');
    // Slides reflect the user's specific points
    const fullText = JSON.stringify(slides);
    expect(fullText).toContain('Envoy');
    expect(fullText).toContain('45ms');
    expect(fullText).toContain('SPIFFE');
    expect(slides[7].type).toBe('cta');
  });

  it('correctly processes YouTube vector database summary without generic networking slop', () => {
    const youtubeSummary = `This video explains the role and architecture of **vector databases**, which are designed for semantic search and similarity matching rather than traditional exact lookups (0:00-1:23).

### **Key Concepts**

*   **Vectors (Embeddings):** Data (products, images, text) is converted into high-dimensional arrays of numbers using an embedding model (2:33-4:47).
*   **Similarity Search:** Instead of exact keyword matches, the database finds the "closest" vectors using metrics like **cosine similarity** (4:47-5:55).
*   **ANN (Approximate Nearest Neighbors):** To maintain speed at scale, vector databases use indexing strategies to skip most comparisons, trading a tiny bit of accuracy (**recall**) for low latency (6:00-6:33).

### **Indexing Strategies**

*   **HNSW (Hierarchical Navigable Small World):** The most popular method. It uses a layered, graph-based structure similar to a skip list to navigate high-dimensional space efficiently (6:44-9:48).
*   **IVF (Inverted File Index):** Uses clustering (K-means) to partition the space, searching only within the most relevant clusters (9:48-11:24).

### **Practical Design Considerations**

*   **Filtered Search:** Combining vector similarity with hard constraints (e.g., "in stock," "under $150") using techniques like pre-filtering or metadata-backed indexing (14:01-16:21).
*   **Writes and Consistency:** Inserting new data into an HNSW graph is expensive. Many systems use a "hot" (new data) and "cold" (static index) architecture to handle updates and eventually rebuild the index (16:21-18:02).
*   **Choosing a Database:** For many use cases, standard databases (like *Postgres* with \`pgvector\` or *Elasticsearch*) are sufficient. Purpose-built vector databases like *Pinecone* or *Milvus* are best reserved for massive scale or specific operational needs (18:02-20:19).

### **Interview Tips**

*   Keep architecture "boring": Use a primary database as the source of truth and the vector database as a search index (20:19-21:44).
*   Be prepared to discuss how to handle **model upgrades** (re-embedding data) and the tradeoffs between dimension size, memory, and recall (21:44-24:34).`;

    const slides = synthesizeUniversalCarousel(youtubeSummary);

    expect(slides).toHaveLength(8);

    // Slide 1 Hook headline ends in a period ('.'), not a question mark ('?')
    expect(slides[0].enTitle).toMatch(/\.$/);
    expect(slides[0].enTitle).not.toContain('?');

    // Slide 1 Hub has relevant vector DB satellite labels
    const satPills = slides[0].satLabels || [];
    expect(satPills.some((p) => /embedding|hnsw|ivf|vector|search|filter/i.test(p))).toBe(true);

    // Full deck must contain the core concepts & schematics
    const variants = slides.map((s) => s.diagramVariant);
    const types = slides.map((s) => s.type);

    expect(variants).toContain('scatter');
    expect(variants).toContain('graph');
    expect(variants).toContain('split');
    expect(types).toContain('compare');

    // Strict No-Slop Check: ZERO "Client Ingress", ZERO "Port 443", ZERO "P99 < 1.0ms"
    const jsonStr = JSON.stringify(slides);
    expect(jsonStr).not.toContain('Client Ingress');
    expect(jsonStr).not.toContain('Port 443');
    expect(jsonStr).not.toContain('Zero-Copy Engine');
    expect(jsonStr).not.toContain('LATENCY: P99 < 1.0ms');

    // Timestamp ranges like (0:00-1:23) must be completely stripped
    expect(jsonStr).not.toMatch(/\(\d{1,2}:\d{2}-\d{1,2}:\d{2}\)/);

    // CTA must be discussion-focused
    expect(slides[7].ctaText).toContain('شارك برأيك');
    expect(slides[7].ctaText).not.toContain('DM for Architecture Review');
  });

  it('processes OpenAI financial engineering YouTube summary with zero DevOps hallucinations, golden stats, finance icons, and grouped human impact', () => {
    const financialYoutubeSummary = `OpenAI Financial Engineering & Infrastructure Gamble
- OpenAI reached a $500B valuation despite projecting a massive $20.9B loss and spending $2.60 for every $1 earned.
- Circular financing: tech giants invest billions into OpenAI, which immediately flows back to rent their cloud servers and buy chips.
- Massive $1.4 trillion infrastructure commitments require 10 gigawatts of power—equivalent to 10 nuclear reactors.
- Insiders and employees cashed out $6.6B in secondary sales while taxpayers and a proposed 5% government stake backstop the downside risk.
- Household electricity bills spiked 63% near data center corridors as consumer utility rates subsidize AI power demand.
- Systemic risk to S&P 500 retirees: passive index funds and 401(k) pensions are heavily concentrated in the same interconnected AI bubble.
- The core trade-off: privatized employee windfalls and circular valuation gains versus socialized energy inflation and taxpayer risk.`;

    const slides = synthesizeUniversalCarousel(financialYoutubeSummary);
    expect(slides).toHaveLength(8);

    const fullJson = JSON.stringify(slides);

    // 1. Strictly ZERO software/DevOps hallucinations
    expect(fullJson).not.toContain('Modular decoupled boundaries');
    expect(fullJson).not.toContain('sub-second latency');
    expect(fullJson).not.toContain('blue-green rollback');
    expect(fullJson).not.toContain('Ingress Layer');
    expect(fullJson).not.toContain('Core Engine');

    // 2. Golden data points are extracted and represented
    expect(fullJson).toMatch(/\$500B|\$20\.9B|\$2\.60|\$1\.4\s*(?:trillion|T)|\$6\.6B|63%|10\s*(?:GW|gigawatts)/i);

    // 3. Topology / Hub icons use financial/infrastructure icons (dollarSign, landmark, factory, scales, trendingDown, users, lifecycle)
    expect(slides[0].centerIcon).toBe('dollarSign');
    const topologySlide = slides.find((s) => s.diagramVariant === 'topology');
    expect(topologySlide).toBeDefined();
    expect(topologySlide!.diagramNodes?.some((n) => ['dollarSign', 'landmark', 'factory', 'lifecycle', 'trendingDown', 'scales'].includes(n.icon || ''))).toBe(true);
  });

  it('synthesizes Cloudflare "Agents aren’t humans (but they kinda are)." RSS prompt with deep agent delegation content and zero generic boilerplate', () => {
    const rssPrompt = `Agents aren’t humans (but they kinda are). (Cloudflare Engineering)
Source URL: https://blog.cloudflare.com/trusted-agent-delegation/

Technical Summary & Engineering Context:
AI agents act on behalf of human principals but cannot safely share user passwords or unscoped static API keys. Delegated authentication uses short-lived OAuth token exchange with explicit actor claims and least-privilege tool scopes.`;

    const slides = synthesizeUniversalCarousel(rssPrompt);
    expect(slides).toHaveLength(8);

    const serialized = JSON.stringify(slides);
    // Zero generic boilerplate from old fallback
    expect(serialized).not.toContain('Traditional systems degrade under high scale');
    expect(serialized).not.toContain('The architectural bottleneck.');
    expect(serialized).not.toContain('System Ingress');
    expect(serialized).not.toContain('Durable State');

    // Rich archetype diversity across Slides 2-7 (compare, code, row isolation/takeaway)
    const midTypes = new Set(slides.slice(1, 7).map((s) => s.type));
    expect(midTypes.size).toBeGreaterThanOrEqual(3);
    expect(midTypes.has('compare')).toBe(true);
    expect(midTypes.has('code')).toBe(true);
  });

  it('dynamically diversifies mid-deck archetypes and replaces generic placeholder nodes via diversifyDeckArchetypesAndVisuals', () => {
    const rawSlides = synthesizeUniversalCarousel('Distributed Raft Consensus Quorum');
    const diversified = diversifyDeckArchetypesAndVisuals(rawSlides);

    expect(diversified).toHaveLength(8);
    expect(diversified[0].type).toBe('hub');
    expect(diversified[7].type).toBe('cta');

    const midArchetypes = new Set(diversified.slice(1, 7).map((s) => s.type));
    expect(midArchetypes.size).toBeGreaterThanOrEqual(3);

    // Dynamic single-slide switching populates context-aware fields immediately
    const compareSlide = seedSlideArchetypeData(diversified[2], 'compare', 2);
    expect(compareSlide.type).toBe('compare');
    expect(compareSlide.compareLeftTitle).toBeTruthy();
    expect(compareSlide.compareRightTitle).toBeTruthy();
  });
});


