/**
 * MARROK Production Spec System Prompts and Prompt Decorators
 */

import { Type } from '@google/genai';

export const MARROK_SYSTEM_PROMPT = `Role: You are an expert viral copywriter and conversion strategist operating inside MARROK Content Studio & Autonomous Content Pipeline Engine.
Task: Transform ONE raw input (video timeline keyframes, screenshot, YouTube summary, technical or financial analysis article, release notes, repo, or rough notes) into high-converting, dark-themed, bilingual (English and Arabic RTL) carousels, 1-slide infographic posters, or motion reels with high visual hierarchy.

VIRAL COPYWRITER & CONVERSION PIPELINE (MANDATORY 4-STEP PROCESS):
1. EXTRACT CORE VALUE:
   - Identify ONE counter-intuitive insight or painful mistake. Discard generic summaries, sponsor fluff, and affiliate hype.
   - Extract the core subject, creator/channel, publish date, primary source URL into sourceMeta, and 3 to 6 high-impact facts into facts[].
2. DRAFT BODY SLIDES FIRST (SLIDES 2 THROUGH N):
   - Create slides 2 through N adhering strictly to the "1 Idea Per Slide" rule.
   - Keep each body slide concise and punchy (UNDER 20 WORDS per language on body copy) with clear narrative flow from Problem -> Mechanism -> Proof/Numbers -> Specific Tension/Takeaway -> Polarizing CTA Question.
   - Review video timeline keyframes (FRAME #1..#4 with timestamps) for visual cues (UI shifts, metrics, errors, code diffs, architecture transitions) when video input is provided.
3. GENERATE 5 HOOK VARIATIONS (HIGH-STAKES IMPACT + CONCRETE THREAT + OPEN LOOP):
   - Pass the drafted body slides (Slides 2..N) to the hook tier (hookVariants[]) to generate 5 distinct options spanning ALL 4 proven frameworks, leading with urgent stakes, concrete threat/consequence, and an unresolved open loop that compels the reader to swipe:
     * "Contrarian" — exposes a dangerous misconception or hidden blast radius surfaced in Slide 2
     * "Specific Metric" — anchors directly to the verified metric, CVSS score, latency spike, or quantitative failure found in Slide 2
     * "Mistake Callout" — names the concrete production failure mode, exploit path, or architectural bottleneck defined in Slide 2
     * "Curiosity Gap" — opens an urgent unresolved technical loop ("How...", "Why...", "What happens when...") directly tied to Slide 2's mechanism
   - CRITICAL SLIDE 2 GROUNDING RULE: Dynamically derive EVERY Slide 1 hook from the concrete risk, exploit, failure, or metric in Slide 2. Write complete, grammatically natural headlines — NEVER glue fragments like "how discovered by..." and NEVER use dry attribution blurbs ("Discovered by the security research team...") as a hook or teaser.
   - Include framework, tag, score (0-100), selectionReason, hookKicker, coverArchetype, coverStyle ('headline-hero' | 'metric-split' | 'versus-hook' | 'visual-teaser'), enTitle, arTitle, coverTeaserEn, coverTeaserAr, enBody (""), and arBody ("") for all 5 options.
4. AUTOMATED SELECTION & COVER HERO:
   - Score all 5 hooks against virality heuristics (high-stakes urgency, concrete threat/impact, unresolved open loop, direct grounding in Slide 2, 6 to 12 word compliance, zero banned clichés, zero generic filler, zero colons/emojis).
   - Select the highest-scoring hook (selected: true) and promote it to Slide 1 (slides[0]) as a Headline-first Cover Hero:
     * Keep slides[0].enBody = "" and slides[0].arBody = "" (no paragraph body on Slide 1).
     * Supply ONE punchy, distinct single-line swipe bridge in slides[0].coverTeaserEn and slides[0].coverTeaserAr (<= 68 characters, <= 10 words, ZERO colons, ZERO emojis). coverTeaserEn MUST sharpen the open loop and MUST NOT repeat enTitle or recite author/researcher attribution. coverTeaserAr MUST accurately translate coverTeaserEn and MUST NEVER duplicate arTitle.
     * Pick coverStyle ('headline-hero', 'metric-split' ONLY with verified source numbers, 'versus-hook' paired with type 'compare', or 'visual-teaser' paired with 'row'/'visual'/'subjectPair') and set slides[0].showSwipeCue = true.

HARD CONSTRAINTS:
- SLIDE 1 LENGTH: Primary headline (enTitle) MUST be 6 to 12 words (under 8 words preferred for visual impact on a graphic cover). Context teaser (coverTeaserEn / coverTeaserAr) MUST be <= 68 chars on 1 crisp line with clean word boundaries (never truncate mid-word). Keep multi-slide Slide 1 enBody and arBody strictly empty "".
- TONE & AESTHETICS: Bilingual (English and Arabic RTL), dark themed, high visual hierarchy.
- NEGATIVE CONSTRAINTS (STRICT ZERO TOLERANCE):
  * NEVER use emojis inside any slide headline, body, diagram node, or hook variation (emojis belong in social captions only).
  * NEVER use colons (":") in slide headlines, Slide 1 sub-headlines, or hook variations.
  * NEVER use banned clichés anywhere: "Ultimate Guide", "Unlock", "Unlocking", "Game-changing", "Game changer", "Revolutionize", "In this fast-paced world", "Let's dive in".
  * NEVER use generic template filler strings in English or Arabic, including: "Why [Topic] shifts the model", "shifts the model", "المقارنة الحقيقية في الأنظمة المعمارية", "المقارنة الحقيقية في...", "الأنظمة المعمارية", "الاستعلام عبر الشيفرة البرمجية" (unless the slide is literally a SQL query), "advice breaks under real production traffic", "hidden pipeline bottlenecks", or "costing engineering teams speed".
  * Ensure tight narrative flow across all slides.

TOPICAL TONE & EVIDENCE INTEGRITY:
- ENFORCE TOPICAL TONE (ZERO DOMAIN HALLUCINATION): Strictly match terminology and visuals to the input's actual domain:
  * Cybersecurity / CVEs / Vulnerabilities: Use authentic security terminology (exploit path, RCE, sandbox escape, CVSS, attack surface, patch boundary, zero-day mitigation) — NEVER invent database/storage templates like "Hot Memory / Cold Index" or SQL queries.
  * Financial / Economic / Valuation: STRICTLY PROHIBIT IT/software/DevOps terminology (never use "latency", "modular decoupled boundaries", "zero-downtime deployment", "blue-green rollback", "ingress", "p99", or "state persistence"). Use authentic financial terms ("capital", "deficits", "valuation", "subsidies", "circular financing", "taxpayer backstop", "systemic risk").
- NO fabricated benchmarks or numbers when none exist in the source. If there are no numbers, DO NOT invent fake "10x speedup" or "200x" claims.
- PRIORITIZE "GOLDEN" HOOKS & HUMAN/EMOTIONAL STATS: Extract the most striking, concrete figures from the source.

GROUNDING & BRAND IP SAFETY (Spec §5 & §6):
- Ground claims, release dates, financial figures, architectural details, and CVE advisories via Google Search when available; assign verified status ('verified', 'partially_verified', or 'unconfirmed').
- Show third-party companies as styled text names in copy (never imply partnership or "powered by" endorsement).
- STRICT MARROK BRAND LOCK: 'brand' MUST strictly be 'MARROK' and 'brandUrl' MUST strictly be 'marrok.org'. Put external publisher names and URLs strictly inside 'sourceMeta.creator' and 'sourceMeta.url'.

SLIDE ARCHETYPE & STORY PROGRESSION (Hook -> Problem -> Mechanism -> Proof -> Takeaway -> CTA):
- Slide 1 (Winning Cover Hero from Step 4): Pick coverStyle ('headline-hero', 'metric-split', 'versus-hook', or 'visual-teaser') strictly aligned with its focal type ("visual", "metric", "compare", "subjectPair", or "row" — NEVER pick "hub" on Slide 1, and NEVER pair coverStyle "versus-hook" with a non-"compare" slide type). Primary enTitle 6-12 words, 1-line coverTeaserEn / coverTeaserAr <= 68 chars, NO colons, NO emojis, NO clichés, and keep enBody / arBody empty "".
- Slide 2 (Problem / Trigger): What broke at scale, the active exploit/threat, or the painful mistake ("compare", "metric", "visual", "row", or "number"; never repeat Slide 1's archetype). Keep under 20 words per language.
- Slides 3-6 (Mechanisms & Proof): 1 Idea Per Slide, under 20 words per language. Cycle archetypes dynamically ("visual", "compare", "code" ONLY if real code/config exists, "metric", "number", and "row" rotating diagramVariants: 'topology', 'stack', 'isolation', 'takeaway', 'clusters', 'split', 'graph', 'scatter', 'features'). Never repeat the same diagramVariant or visualSpec.kind twice in a row.
- UNIVERSAL VISUAL ENGINE ("visual" archetype + visualSpec): Use "visual" whenever data or architecture is far clearer as a structured visual than a generic box diagram:
  * visualSpec.kind = "bar-chart": Multi-metric benchmarks, latency percentiles (p50/p95/p99), or before/after throughput bars with real units & optional deltaBadge.
  * visualSpec.kind = "sequence": Protocol handshakes, exploit chains, request/response lifecycles, or 2-4 actor message flows with numbered solid/dashed/alert steps.
  * visualSpec.kind = "timeline": Outage postmortems, CVE disclosure/patch escalations, or chronological release milestones (3-5 events with timestamps & severity: info/warn/incident/resolved).
  * visualSpec.kind = "matrix": 2x2 architectural trade-off matrices (xAxisLow/High, yAxisLow/High, 4 quadrant cells with optional highlight).
  * visualSpec.kind = "table": Crisp 2-4 column x 2-5 row benchmark or feature comparison tables (optional highlightColumn index).
  * visualSpec.kind = "callout": Editorial attributed quote or empirical stat callout card (calloutStyle: "quote" or "stat", author/role/source).
  * visualSpec.kind = "svg": Custom vector engineering blueprint in viewBox="0 0 846 490" using ONLY safe SVG primitives (rect, circle, ellipse, line, polyline, polygon, path, text, tspan, g) and MARROK theme tokens ({{accent}}, {{alert}}, {{surface}}, {{surfaceBorder}}, {{textWhite}}, {{textMuted}}, {{baseBg}}, {{gridLine}}). Never emit <script>, <foreignObject>, <image>, or inline event handlers.
- Every "row" slide needs 3 specific diagramNodes (never generic labels like "System Ingress", "Execution Core", "Durable State", "Verification") + 2 diagramEdges + diagramFooter.
- Penultimate Slide (Specific Tension / Takeaway): "row" with diagramVariant 'takeaway' or 'isolation' (or "visual" with kind 'matrix'/'callout'). NEVER title it "The core trade-off." or "المقايضة الجوهرية".
- Final Slide (Marrok CTA): Archetype "cta" with a sharp practitioner question as enTitle/arTitle (NEVER "Join the discussion." or "شارك في النقاش"), ctaText "Join discussion • شارك برأيك", url "marrok.org".

ARABIC RTL COPYWRITING & SEMANTIC FIDELITY RULES:
- STRICT EN-TO-AR ACCURACY: Every Arabic field (arTitle, coverTeaserAr, arBody, takeaway ar) MUST faithfully convey the exact meaning, threat/impact, and technical specifics of its paired English field in natural, idiomatic Modern Standard Arabic (فصحى معاصرة طبيعية واضحة).
- NEVER duplicate arTitle into coverTeaserAr — each must translate its own distinct English counterpart.
- NEVER translate technical terms, system nouns, CVE IDs, product names, protocols, or units into Arabic — keep ALL technical entities in English Latin script inside the Arabic sentence (e.g. Java4Shell, CVE-2026-114938, OpenJDK, RCE, CVSS, Sockets, Latency, Cache, Cluster, Raft, Postgres, Kafka, API, p99, Docker, Kubernetes, OpenAI, Nvidia, Git) and keep numbers + units in English (15ms, 510 GB, 10x, 99.9%).
- NEVER end an Arabic line with a Latin word plus punctuation (finish with an Arabic word before the period to prevent BiDi flipping).
- NEVER use colons ":" or emojis in Arabic slide headlines, cover teasers, or hook titles.

CAPTIONS & METADATA:
- caption: Bilingual publication copy (Arabic first, then English) with non-repetitive scroll-stopping opening hook, bullet takeaways (🔹), operational takeaway, question (👇), source credit, and 8-10 hashtags.
- firstComment, shortCaption, screenHook (no emojis/colons), notesForHuman, scheduleSlot (10:00 DZ, 12:00 DZ, or 18:00 DZ).

Return valid JSON matching the exact schema.`;

/**
 * Decorates an image generation prompt with technical aesthetic presets and theme hex anchors.
 */
export function decorateImagePrompt(
  rawPrompt: string,
  options?: {
    stylePreset?: string;
    themeAccent?: string;
    themeBg?: string;
    themeSurface?: string;
  }
): string {
  let decorated = rawPrompt.trim();
  const preset = options?.stylePreset || 'blueprint';

  if (preset === 'blueprint') {
    decorated = `Technical software architecture blueprint diagram, isometric system schema, deep carbon dark background (#0c1017), clean neon cyan and emerald vector wireframe lines, high contrast telemetry labels, professional developer infographic, no human faces: ${decorated}`;
  } else if (preset === 'terminal') {
    decorated = `High-tech developer terminal window, dark OLED interface, glowing code syntax, futuristic telemetry HUD brackets, sleek neon accents, ultra-crisp engineering diagram: ${decorated}`;
  } else if (preset === 'flowchart') {
    decorated = `Minimal modern systems flowchart, microservices nodes and data stream pipelines, dark mode UI with sleek accent connections, clean technical vectors: ${decorated}`;
  } else if (preset === 'security') {
    decorated = `Cybersecurity threat intelligence diagram, vulnerability blast radius map, network boundary defense mesh, dark technical theme with neon crimson and teal highlights: ${decorated}`;
  }

  if (options?.themeAccent) {
    const bgDirect = options.themeBg || '#080e12';
    const surfDirect = options.themeSurface || '#0d151c';
    decorated += ` Color palette strictly anchored to: primary accent ${options.themeAccent}, deep OLED background ${bgDirect}, surface container ${surfDirect}. Highly legible dark mode schematic.`;
  }

  return decorated;
}

/**
 * Constructs user prompt for carousel generation from raw input, category hint, and input mode.
 */
export function buildUserCarouselPrompt(options: {
  rawPrompt?: string;
  safeCategoryHint?: string;
  safeInputMode?: string;
  hasImage?: boolean;
  imageName?: string;
  postFormat?: 'carousel' | 'single';
}): string {
  const isSingle = options.postFormat === 'single';
  const hasVideoTimelineContext =
    /video|storyboard|frame\s*#\d|timeline/i.test(options.rawPrompt || '') ||
    options.safeInputMode === 'video';
  let userPromptText = isSingle
    ? `Generate a publication-ready SINGLE-SLIDE standalone 1080x1920 infographic post (slides array length MUST be 1), 5 scored Hook Variations across Contrarian, Specific Metric, Mistake Callout, and Curiosity Gap, and 2 Caption Variants from this input.\n`
    : `Generate a publication-ready 8-slide MARROK carousel, 5 scored Hook Variations across Contrarian, Specific Metric, Mistake Callout, and Curiosity Gap, and 2 Caption Variants from this input.\n`;

  if (options.safeCategoryHint && options.safeCategoryHint !== 'auto') {
    userPromptText += `Preferred Domain Category: ${options.safeCategoryHint}\n`;
  }
  if (options.safeInputMode) {
    userPromptText += `Input Mode: ${options.safeInputMode}\n`;
  }
  if (options.rawPrompt) {
    userPromptText += `Raw Content / Topic / Transcript:\n"""\n${options.rawPrompt}\n"""\n`;
  }

  if (options.hasImage) {
    userPromptText += `\nMULTIMODAL IMAGE & VIDEO TIMELINE VISUAL CUE ANALYSIS:
- Inspect the attached visual input or video storyboard grid (FRAME #1, FRAME #2, FRAME #3, FRAME #4 with timestamps).
- Review the chronological video timeline for visual cues: UI transitions, latency/metric overlays, terminal output, code diffs, architecture shifts, and visual contrasts between early and late frames.
- Read all visible labels, node titles, component blocks, arrows, protocols, and metrics.
- Formulate the counter-intuitive insight and body slides directly from the visual timeline cues depicted in the frames.
- CRITICAL NEGATIVE CONSTRAINT: Under NO circumstances should an image or video filename (such as "${options.imageName || '20760.png'}") or file extension (.png, .jpg, .webp, .mp4) ever be used as a slide title, headline, or topic.
`;
    if (!options.rawPrompt) {
      userPromptText += isSingle
        ? `- Since no text prompt was provided, derive the standalone single-slide schematic, 5 hook options, and bilingual copy entirely from the visual cues.\n`
        : `- Since no text prompt was provided, derive the full 8-slide narrative, body slides, 5 hook options, and bilingual copy entirely from the visual cues.\n`;
    }
  } else if (hasVideoTimelineContext) {
    userPromptText += `\nVIDEO TIMELINE VISUAL CUES:\n- Review the timeline progression and visual cues mentioned in the input chronologically to anchor Slides 2 through N and the winning Slide 1 hook.\n`;
  }

  if (isSingle) {
    userPromptText += `\nInstructions for a coherent, high-converting SINGLE-SLIDE post:
- Extract ONE counter-intuitive insight or painful mistake (discard generic summaries).
- Populate hookVariants[] with 5 distinct options spanning Contrarian, Specific Metric, Mistake Callout, and Curiosity Gap, score each (0-100), and use the highest-scoring hook (6-12 words headline, optional sub-headline under 8 words) on the slide.
- Populate takeaways[] with 3 high-signal bilingual bullets (< 20 words each) extracted directly from the input's actual claims and numbers.
- ZERO emojis, ZERO colons (":"), and ZERO banned clichés ("Ultimate Guide", "Unlock", "Game-changing") anywhere in slide copy or hooks.
- Lock brand to "MARROK" and brandUrl to "marrok.org"; populate enCredit and arCredit for standalone source attribution.
- Return valid JSON matching the exact schema.`;
  } else {
    userPromptText += `\nInstructions for the 4-Step High-Converting 8-Slide Carousel Pipeline:
1. Extract Core Value (coreInsight + slide2Draft): Commit ONE counter-intuitive insight or painful mistake in coreInsight and draft Slide 2 (the concrete problem/mistake) in slide2Draft before writing body slides or hooks. Discard generic summaries.
2. Draft Body Slides First (slides = Slides 2..8): Adhere strictly to "1 Idea Per Slide" and keep EVERY body slide under 20 words per language with strong narrative flow:
   * Slide 2 (Problem / Mistake): What broke at scale or the costly mistake ("metric", "compare", "visual", or "row").
   * Slides 3-6 (Mechanism & Proof): Exact mechanisms, configurations, or numbers. Mix archetypes dynamically ("visual" with bar-chart/sequence/timeline/matrix/table/callout/svg when appropriate, "compare", "code", "metric", "number", "row" with varied diagramVariants).
   * Slide 7 (Specific Tension / Verdict): Concrete operational cost or tension ("row" with diagramVariant 'takeaway' or 'isolation', or "visual" matrix/callout). NEVER title it "The core trade-off." or "المقايضة الجوهرية".
   * Slide 8 ("cta" — Polarizing Question): Sharp practitioner question as headline ('enTitle' / 'arTitle'). NEVER title it "Join the discussion." or "شارك في النقاش".
3. Generate 5 Hook Variations (hookVariants[]): Dynamically derive 5 distinct Slide 1 options directly from coreInsight, slide2Draft, and the committed body slides across ALL 4 frameworks ("Contrarian", "Specific Metric", "Mistake Callout", "Curiosity Gap") with framework, tag, score (0-100), selectionReason, coverArchetype, coverStyle ('headline-hero' | 'metric-split' | 'versus-hook' | 'visual-teaser'), hookKicker, coverTeaserEn, and coverTeaserAr. Zero generic template phrasing.
4. Automated Selection -> Slide 1 Cover Hero (selectedHookIndex + slide1): Score hooks on scroll-stopping strength, Slide 2 grounding, and zero clichés/generic filler; promote the highest-scoring option into slide1 (with selectedHookIndex) featuring coverStyle, <= 68 char single-line coverTeaserEn / coverTeaserAr, showSwipeCue: true, and empty enBody / arBody ("").
- Hard Constraints:
  * Slide 1 primary enTitle MUST be 6 to 12 words. Context teaser (coverTeaserEn / coverTeaserAr) MUST be <= 68 chars on 1 line with empty Slide 1 enBody / arBody ("").
  * Bilingual (English and Arabic RTL), dark themed, high visual hierarchy.
  * NEVER use emojis, colons (":"), generic filler ("shifts the model", "المقارنة الحقيقية في الأنظمة المعمارية"), or clichés ("Ultimate Guide", "Unlock", "Game-changing") in slides or hooks.
- Return valid JSON matching the exact schema.`;
  }

  return userPromptText;
}

const VISUAL_SPEC_FULL_SCHEMA = {
  type: Type.OBJECT,
  description: 'Universal Visual Engine spec when slide.type === "visual". Populate only fields matching visualSpec.kind.',
  properties: {
    kind: {
      type: Type.STRING,
      enum: ['bar-chart', 'sequence', 'timeline', 'matrix', 'table', 'callout', 'svg'],
      description: 'Visual renderer mode: bar-chart, sequence, timeline, matrix, table, callout, or svg',
    },
    eyebrow: { type: Type.STRING, description: 'Short uppercase kicker label above the visual header' },
    title: { type: Type.STRING, description: 'Concise visual chart/diagram title' },
    footnote: { type: Type.STRING, description: 'Source note, methodology, or axis caveat' },
    orientation: {
      type: Type.STRING,
      enum: ['horizontal', 'vertical'],
      description: 'Bar chart orientation (default horizontal)',
    },
    unit: { type: Type.STRING, description: 'Explicit metric unit for bar-chart (e.g. ms, %, req/s, GB)' },
    deltaBadge: { type: Type.STRING, description: 'Compact comparison delta badge (e.g. "-84% p99" or "4.2x faster")' },
    bars: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          value: { type: Type.NUMBER },
          displayValue: { type: Type.STRING },
          tone: { type: Type.STRING, enum: ['accent', 'muted', 'alert'] },
          isWinner: { type: Type.BOOLEAN },
        },
        required: ['label', 'value'],
      },
      description: 'Up to 6 bars for kind="bar-chart"',
    },
    actors: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2 to 4 vertical lifeline actor names for kind="sequence"',
    },
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          from: { type: Type.NUMBER, description: '0-based index into actors[]' },
          to: { type: Type.NUMBER, description: '0-based index into actors[]' },
          label: { type: Type.STRING },
          tag: { type: Type.STRING },
          style: { type: Type.STRING, enum: ['solid', 'dashed', 'alert'] },
        },
        required: ['from', 'to', 'label'],
      },
      description: 'Up to 6 directed message steps for kind="sequence"',
    },
    events: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          time: { type: Type.STRING, description: 'Timestamp or phase (e.g. 14:02 UTC or T+12m)' },
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ['info', 'warn', 'incident', 'resolved'] },
        },
        required: ['time', 'title'],
      },
      description: '3 to 5 chronological incident/milestone events for kind="timeline"',
    },
    xAxisLow: { type: Type.STRING },
    xAxisHigh: { type: Type.STRING },
    yAxisLow: { type: Type.STRING },
    yAxisHigh: { type: Type.STRING },
    quadrants: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
          highlight: { type: Type.BOOLEAN },
        },
        required: ['title'],
      },
      description: '4 cells [top-left, top-right, bottom-left, bottom-right] for kind="matrix"',
    },
    columns: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2 to 4 column headers for kind="table"',
    },
    rows: {
      type: Type.ARRAY,
      items: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      description: '2 to 5 rows matching columns.length for kind="table"',
    },
    highlightColumn: { type: Type.NUMBER, description: '0-based winning column index for kind="table"' },
    calloutStyle: {
      type: Type.STRING,
      enum: ['quote', 'stat'],
      description: 'Editorial style for kind="callout"',
    },
    quote: { type: Type.STRING },
    statValue: { type: Type.STRING },
    statLabel: { type: Type.STRING },
    author: { type: Type.STRING },
    role: { type: Type.STRING },
    source: { type: Type.STRING },
    evidence: { type: Type.STRING },
    svgCode: {
      type: Type.STRING,
      description: 'Sanitized SVG markup (viewBox 0 0 846 490) using MARROK tokens {{accent}}, {{alert}}, {{surface}}, {{surfaceBorder}}, {{textWhite}}, {{textMuted}}, {{baseBg}} for kind="svg"',
    },
    viewBox: { type: Type.STRING, description: 'Optional SVG viewBox (default "0 0 846 490")' },
  },
  required: ['kind'],
};

/**
 * Compact visualSpec schema for primary carousel generation so Gemini Flash Lite's
 * constrained-decoding FSM stays well below the maximum state ceiling.
 */
const VISUAL_SPEC_COMPACT_SCHEMA = {
  type: Type.OBJECT,
  description: 'Structured visual spec when slide.type === "visual" (populate only fields matching kind).',
  properties: {
    kind: {
      type: Type.STRING,
      description: 'One of: bar-chart, sequence, timeline, matrix, table, callout, svg',
    },
    title: { type: Type.STRING, description: 'Concise chart/diagram title' },
    unit: { type: Type.STRING, description: 'Unit for bar-chart (ms, %, req/s, GB)' },
    deltaBadge: { type: Type.STRING, description: 'Compact delta badge (e.g. -84% p99)' },
    bars: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          value: { type: Type.NUMBER },
          displayValue: { type: Type.STRING },
        },
        required: ['label', 'value'],
      },
    },
    actors: { type: Type.ARRAY, items: { type: Type.STRING } },
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          from: { type: Type.NUMBER },
          to: { type: Type.NUMBER },
          label: { type: Type.STRING },
        },
        required: ['from', 'to', 'label'],
      },
    },
    events: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          time: { type: Type.STRING },
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
        },
        required: ['time', 'title'],
      },
    },
    quadrants: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
        },
        required: ['title'],
      },
    },
    columns: { type: Type.ARRAY, items: { type: Type.STRING } },
    rows: {
      type: Type.ARRAY,
      items: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    quote: { type: Type.STRING },
    statValue: { type: Type.STRING },
    statLabel: { type: Type.STRING },
    author: { type: Type.STRING },
    svgCode: { type: Type.STRING, description: 'Safe SVG markup (viewBox 0 0 846 490) using MARROK theme tokens' },
  },
  required: ['kind'],
};

const DIAGRAM_NODE_COMPACT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    label: { type: Type.STRING, description: 'Component name e.g. "PgBouncer", "Primary DB", "JVM Sandbox"' },
    sublabel: { type: Type.STRING, description: 'Protocol, port, or spec' },
    status: { type: Type.STRING, description: 'Status pill text e.g. "POOLED", "ACTIVE", "ISOLATED"' },
    icon: { type: Type.STRING, description: 'Lucide icon name e.g. database, server, cpu, lock' },
  },
  required: ['label'],
};

const SUBJECT_PAIR_COMPACT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    beforeSystem: { type: Type.STRING, description: 'Baseline system name (e.g. Cassandra)' },
    afterSystem: { type: Type.STRING, description: 'Target system name (e.g. ScyllaDB)' },
    storyOwner: { type: Type.STRING, description: 'Company owning the migration story as text (e.g. Discord)' },
    flowLabel: { type: Type.STRING, description: 'e.g. CHAT WORKLOAD → COMPACTED SHARDS' },
  },
  description: 'For migration or A vs B stories: 2 verified systems and story owner wordmark',
};

const BODY_SLIDE_ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    type: {
      type: Type.STRING,
      description: 'row, number, metric, code, compare, cta, poster, subjectPair, or visual',
    },
    enTitle: {
      type: Type.STRING,
      description: 'English headline: 2 to 8 words on body & CTA slides (<= 45 chars, zero colons/emojis/cliches/filler).',
    },
    arTitle: {
      type: Type.STRING,
      description: 'Concise natural Arabic headline keeping ALL technical nouns and units in English Latin script.',
    },
    enBody: {
      type: Type.STRING,
      description: 'English body copy under 20 words',
    },
    arBody: {
      type: Type.STRING,
      description: 'Natural Arabic body copy under 20 words keeping tech nouns/units in English; end with an Arabic word before punctuation.',
    },
    diagramVariant: {
      type: Type.STRING,
      description: 'For row slides: topology, stack, isolation, takeaway, scatter, graph, clusters, split, or features',
    },
    diagramNodes: {
      type: Type.ARRAY,
      items: DIAGRAM_NODE_COMPACT_SCHEMA,
      description: 'Exactly 3 topic-specific component cards for row slides',
    },
    diagramEdges: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2 short arrow labels between the 3 diagram nodes',
    },
    diagramFooter: {
      type: Type.STRING,
      description: 'Bottom spec bar line for row slides',
    },
    stepNumber: { type: Type.STRING, description: 'Step numeral e.g. 01, 02, 03 for number slides' },
    stepLabel: { type: Type.STRING, description: 'Step badge e.g. STEP 01 for number slides' },
    metricValue: {
      type: Type.STRING,
      description: 'Hero WIN metric number ONLY if present in source (leave empty if source has no numbers).',
    },
    metricBeforeValue: { type: Type.STRING, description: 'Old baseline value when comparing before/after' },
    metricLabel: { type: Type.STRING, description: 'Real source metric label' },
    metricDiff: { type: Type.STRING, description: 'Plain-language outcome delta' },
    codeSnippet: { type: Type.STRING, description: 'Multi-line code snippet for code slide' },
    codeFileName: { type: Type.STRING, description: 'File or tab name for code window' },
    codeLanguage: { type: Type.STRING, description: 'Language for code slide (bash, rust, python, sql)' },
    compareLeftTitle: { type: Type.STRING, description: 'Left card title for compare slide' },
    compareLeftBody: { type: Type.STRING, description: 'Left card bullet points for compare slide' },
    compareRightTitle: { type: Type.STRING, description: 'Right card title for compare slide' },
    compareRightBody: { type: Type.STRING, description: 'Right card bullet points for compare slide' },
    subjectPair: SUBJECT_PAIR_COMPACT_SCHEMA,
    visualSpec: VISUAL_SPEC_COMPACT_SCHEMA,
    takeaways: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          en: { type: Type.STRING },
          ar: { type: Type.STRING },
        },
        required: ['en', 'ar'],
      },
      description: 'Up to 3 bilingual key takeaway bullets for single-slide poster slides',
    },
    ctaText: { type: Type.STRING, description: 'Pill button text for cta slide' },
    url: { type: Type.STRING, description: 'Website URL for cta slide' },
    enCredit: { type: Type.STRING, description: 'English source attribution footer for cta/poster slide' },
    arCredit: { type: Type.STRING, description: 'Arabic source attribution footer for cta/poster slide' },
  },
  required: ['type', 'enTitle', 'arTitle', 'enBody', 'arBody'],
};

/**
 * Slim Cover Hero schema for Slide 1 (generated AFTER body slides & hookVariants)
 * to keep compiled grammar states well below Gemini Flash Lite's FSM ceiling.
 */
const SLIDE1_COVER_SCHEMA = {
  type: Type.OBJECT,
  description: 'Selected Slide 1 Cover Hero promoted AFTER hookVariants (multi-slide carousels only). Must set enBody="", arBody="", showSwipeCue=true, coverStyle, coverTeaserEn, and coverTeaserAr, and never use type "hub".',
  properties: {
    type: {
      type: Type.STRING,
      description: 'Cover focal archetype: metric, compare, row, subjectPair, or visual (NEVER hub)',
    },
    coverStyle: {
      type: Type.STRING,
      description: 'Cover Hero style: headline-hero, metric-split, versus-hook (only with type compare), or visual-teaser',
    },
    hookKicker: {
      type: Type.STRING,
      description: 'Short 2-4 word uppercase kicker badge (max 32 chars, no colons/emojis)',
    },
    enTitle: {
      type: Type.STRING,
      description: 'Winning Slide 1 English hook (6 to 12 words, <= 76 chars, zero colons/emojis/cliches)',
    },
    arTitle: {
      type: Type.STRING,
      description: 'Winning Slide 1 natural Arabic hook preserving English tech nouns/units',
    },
    enBody: { type: Type.STRING, description: 'MUST be empty string "" on multi-slide Slide 1' },
    arBody: { type: Type.STRING, description: 'MUST be empty string "" on multi-slide Slide 1' },
    coverTeaserEn: {
      type: Type.STRING,
      description: 'Distinct 1-line English swipe teaser (<= 68 chars, zero colons/emojis)',
    },
    coverTeaserAr: {
      type: Type.STRING,
      description: 'Distinct 1-line Arabic swipe teaser (<= 68 chars, must NOT duplicate arTitle)',
    },
    showSwipeCue: { type: Type.BOOLEAN, description: 'Set true on multi-slide Slide 1' },
    metricValue: { type: Type.STRING, description: 'Verified source metric only when coverStyle is metric-split' },
    metricBeforeValue: { type: Type.STRING },
    metricLabel: { type: Type.STRING },
    metricDiff: { type: Type.STRING },
    compareLeftTitle: { type: Type.STRING },
    compareLeftBody: { type: Type.STRING },
    compareRightTitle: { type: Type.STRING },
    compareRightBody: { type: Type.STRING },
    diagramVariant: { type: Type.STRING },
    diagramNodes: { type: Type.ARRAY, items: DIAGRAM_NODE_COMPACT_SCHEMA },
    diagramEdges: { type: Type.ARRAY, items: { type: Type.STRING } },
    diagramFooter: { type: Type.STRING },
    subjectPair: SUBJECT_PAIR_COMPACT_SCHEMA,
  },
  required: ['type', 'coverStyle', 'enTitle', 'arTitle', 'enBody', 'arBody', 'coverTeaserEn', 'coverTeaserAr', 'showSwipeCue'],
};

export const CAROUSEL_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    theme: {
      type: Type.STRING,
      description: 'Spec theme id: scion, backend, pqc, security_spec, node, ajax, concat, estonia, artcraft, arch, zerobreach, teal, cyber, violet, blueprint, amber, emerald, monochrome',
    },
    category: {
      type: Type.STRING,
      description: 'Specific technical domain category extracted directly from input context',
    },
    sourceMeta: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING },
        title: { type: Type.STRING },
        creator: { type: Type.STRING },
        url: { type: Type.STRING },
        published: { type: Type.STRING },
      },
      description: 'Spec §4: Source metadata extracted from input',
    },
    facts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          type: { type: Type.STRING },
          verified: { type: Type.STRING },
          sourceUrl: { type: Type.STRING },
          sourceTitle: { type: Type.STRING },
        },
        required: ['text', 'type', 'verified'],
      },
      description: 'Spec §4 & §5: Extracted facts with citations',
    },
    coreInsight: {
      type: Type.STRING,
      description: 'One concise sentence stating the single counter-intuitive insight or painful mistake extracted from the input. Committed before drafting slides and hooks.',
    },
    slide2Draft: {
      type: Type.OBJECT,
      properties: {
        enTitle: { type: Type.STRING, description: 'English headline of Slide 2 (the concrete problem, exploit, or failure)' },
        arTitle: { type: Type.STRING, description: 'Natural Arabic headline of Slide 2 preserving English tech terms' },
        enBody: { type: Type.STRING, description: 'English body copy of Slide 2 (under 20 words)' },
        arBody: { type: Type.STRING, description: 'Natural Arabic body copy of Slide 2 (under 20 words)' },
      },
      required: ['enTitle', 'arTitle', 'enBody', 'arBody'],
      description: 'Draft of Slide 2 (Problem / Trigger) committed before body slides and Slide 1 hooks.',
    },
    slides: {
      type: Type.ARRAY,
      items: BODY_SLIDE_ITEM_SCHEMA,
      description: 'For multi-slide carousels: body slides 2 through N (Problem -> Mechanism -> Proof -> Takeaway -> CTA), drafted BEFORE hookVariants and slide1. For single-slide posts: the 1 standalone poster slide.',
    },
    hookVariants: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          tag: { type: Type.STRING },
          framework: {
            type: Type.STRING,
            description: 'One of: "Contrarian", "Specific Metric", "Mistake Callout", "Curiosity Gap"',
          },
          score: { type: Type.NUMBER, description: 'Virality score 0-100' },
          selected: { type: Type.BOOLEAN, description: 'True for the single option promoted to slide1' },
          selectionReason: { type: Type.STRING },
          enTitle: {
            type: Type.STRING,
            description: '6 to 12 words primary hook headline (zero emojis, zero colons, zero clichés)',
          },
          arTitle: { type: Type.STRING },
          enBody: { type: Type.STRING, description: 'Empty string ""' },
          arBody: { type: Type.STRING, description: 'Empty string ""' },
          hookKicker: { type: Type.STRING },
          coverArchetype: {
            type: Type.STRING,
            description: 'Recommended cover archetype: "metric", "compare", "row", "subjectPair", or "visual"',
          },
          coverStyle: {
            type: Type.STRING,
            description: 'One of: headline-hero, metric-split, versus-hook, visual-teaser',
          },
          coverTeaserEn: { type: Type.STRING, description: '1-line English teaser <= 68 chars' },
          coverTeaserAr: { type: Type.STRING, description: '1-line Arabic teaser <= 68 chars (must differ from arTitle)' },
        },
        required: ['tag', 'enTitle', 'arTitle', 'enBody', 'arBody'],
      },
      description: '5 Slide 1 Hook variations generated AFTER coreInsight, slide2Draft, and body slides across Contrarian, Specific Metric, Mistake Callout, and Curiosity Gap, scored against virality heuristics with the highest-scoring option selected for Slide 1',
    },
    selectedHookIndex: {
      type: Type.INTEGER,
      description: '0-based index of the highest-scoring option in hookVariants promoted to slide1',
    },
    slide1: SLIDE1_COVER_SCHEMA,
    caption: {
      type: Type.STRING,
      description: 'Primary bilingual English + Arabic social caption',
    },
    firstComment: {
      type: Type.STRING,
      description: 'Pinned first comment with reference link',
    },
    shortCaption: {
      type: Type.STRING,
      description: '2-line short caption variant',
    },
    screenHook: {
      type: Type.STRING,
      description: '3-second on-screen hook text for Slide 1',
    },
    captionVariants: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          style: { type: Type.STRING },
          caption: { type: Type.STRING },
        },
        required: ['style', 'caption'],
      },
      description: '2 caption style variants (Bulletins vs. Narrative)',
    },
    notesForHuman: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Caveats and verification notes for human review',
    },
    scheduleSlot: {
      type: Type.STRING,
      description: 'Recommended posting slot (e.g. 18:00 DZ)',
    },
    brand: {
      type: Type.STRING,
      description: 'MUST strictly be "MARROK"',
    },
    brandUrl: {
      type: Type.STRING,
      description: 'MUST strictly be "marrok.org"',
    },
  },
  required: ['theme', 'category', 'coreInsight', 'slide2Draft', 'slides', 'hookVariants', 'caption'],
};

export const DIRECT_VISUAL_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    chosenLayoutId: {
      type: Type.STRING,
      enum: [
        'visual:bar-chart',
        'visual:sequence',
        'visual:timeline',
        'visual:matrix',
        'visual:table',
        'visual:callout',
        'visual:svg',
        'metric',
        'compare',
        'code',
        'number',
        'hub',
        'subjectPair',
        'poster',
        'row:topology',
        'row:stack',
        'row:isolation',
        'row:split',
        'row:features',
        'row:takeaway',
        'row:graph',
        'row:clusters',
        'row:scatter',
      ],
      description: 'Exact visual catalog ID chosen to best express this slide copy without repeating sibling layouts or excluded layouts.',
    },
    rationale: {
      type: Type.STRING,
      description: 'Concise 1-sentence plain-language explanation of why this visual fits the slide content (under 110 chars).',
    },
    diagramNodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          sublabel: { type: Type.STRING },
          status: { type: Type.STRING },
          icon: { type: Type.STRING },
        },
        required: ['label'],
      },
      description: '3 concrete system nodes when chosenLayoutId starts with row: or is poster',
    },
    diagramEdges: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2 short edge connector labels between nodes 1->2 and 2->3',
    },
    diagramFooter: { type: Type.STRING },
    compareLeftTitle: { type: Type.STRING },
    compareLeftBody: { type: Type.STRING },
    compareRightTitle: { type: Type.STRING },
    compareRightBody: { type: Type.STRING },
    codeFileName: { type: Type.STRING },
    codeLanguage: { type: Type.STRING },
    codeSnippet: { type: Type.STRING },
    metricValue: { type: Type.STRING },
    metricBeforeValue: { type: Type.STRING },
    metricLabel: { type: Type.STRING },
    metricDiff: { type: Type.STRING },
    stepNumber: { type: Type.STRING },
    stepLabel: { type: Type.STRING },
    centerTag: { type: Type.STRING },
    satLabels: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    coverStyle: {
      type: Type.STRING,
      enum: ['headline-hero', 'metric-split', 'versus-hook', 'visual-teaser'],
      description: 'When directing Slide 1 of a multi-slide carousel, choose the Cover Hero composition style',
    },
    coverTeaserEn: {
      type: Type.STRING,
      description: 'Optional refined 1-line English cover teaser (<= 68 chars, zero colons/emojis) for Slide 1',
    },
    coverTeaserAr: {
      type: Type.STRING,
      description: 'Optional refined 1-line Arabic cover teaser (<= 68 chars) for Slide 1',
    },
    visualSpec: VISUAL_SPEC_FULL_SCHEMA,
  },
  required: ['chosenLayoutId', 'rationale'],
};


