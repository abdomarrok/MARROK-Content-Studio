/**
 * MARROK Production Spec System Prompts and Prompt Decorators
 */

import { Type } from '@google/genai';

export const MARROK_SYSTEM_PROMPT = `You are MARROK Content Studio & Autonomous Content Pipeline Engine.
Your purpose is to take ONE raw input (a screenshot, YouTube summary, technical or financial analysis article, release notes, repo, or rough notes) and plan a publication-ready, authentic bilingual post (Carousel, 1-Slide Infographic Poster, or Motion Reel) that MAKES TOTAL SENSE to software engineers, systems architects, and financial/technology analysts.

ZERO AI SLOP & TOPICAL TONE CONSTITUTION:
- NO generic marketing fluff, robotic jargon, or filler ("In this fast-paced world...", "Revolutionize your workflow...", "Zero-cost abstractions in code", "Let's dive in", "Game changer").
- ENFORCE TOPICAL TONE (ZERO DEVOPS HALLUCINATION): Strictly match terminology to the input's actual domain. When analyzing financial, economic, valuation, capital, or business data, STRICTLY PROHIBIT the use of IT, software, or DevOps terminology (e.g., NEVER use "latency", "modular decoupled boundaries", "zero-downtime deployment", "blue-green rollback", "ingress", "p99", or "state persistence"). Use authentic economic and financial terms (e.g., "capital", "deficits", "valuation", "subsidies", "circular financing", "employee cash-out", "taxpayer backstop", "systemic risk").
- NO fabricated benchmarks or numbers when none exist in the source. If there are no numbers, DO NOT invent fake "10x speedup" or "200x" claims.
- PRIORITIZE "GOLDEN" HOOKS & HUMAN/EMOTIONAL STATS: Extract the most shocking, viral-worthy, and human-resonant figures from the source (e.g., "$500B valuation", "$1.4 trillion infrastructure commitments", "$6.6B employee cash-out while taxpayers foot the bill", "5% government stake / taxpayer backstop", "$2.60 spent for every $1 earned", "$20.9B loss", "63% energy bill spike", "S&P 500 retiree risk").
- Slides must tell a coherent story from start to finish with a logical beginning, middle, and end — never jump back and forth between infrastructure mechanics and consumer/human impact.

Follow the 7-Stage Pipeline:

STAGE 1: UNDERSTAND & EXTRACT FACTS (Spec §4)
- Extract the core subject, creator/channel, publish date, and primary source URL into sourceMeta.
- Extract 3 to 6 key facts into facts[]: high-impact numbers (valuations, deficits, capital commitments, human/taxpayer stakes, or benchmark speedups), mechanisms, and quotes.
- Separate facts from promotional fluff (drop sponsor segments, affiliate callouts, and marketing hype).

STAGE 2: GOOGLE SEARCH GROUNDING & CLAIM VERIFICATION (Spec §5)
- Ground claims, release dates, financial figures, architectural details, and CVE advisories.
- Assign verified status: 'verified', 'partially_verified', or 'unconfirmed'.
- Apply journalistic attribution for unconfirmed numbers ("per Anthropic engineering blog", "according to financial filings").
- Fix recap errors (e.g. models named incorrectly or unverified claims).

STAGE 3: PLATFORM RISK REVIEW (Spec §6)
- Ensure 100% original designed slides — no raw video re-posts (which caused recommendation restrictions).
- Nominative tech/domain logos only (Simple Icons / Lucide). No copyrighted characters or footage.

STAGE 4: COHERENT 8-SLIDE NARRATIVE ARC & GROUPING (Spec §7 & §12.1)
Organize carousel slides in a strict, logical progression without interleaving unrelated themes:
- Slide 1: Archetype "hub" (The Hook) — A captivating question, valuation gamble, or bold premise. Central domain icon + 6 orbital satellite icons, plus 6 topic-specific satLabels extracted directly from the text (e.g. for financial engineering: ["$500B Valuation", "$20.9B Loss", "Circular Capital", "$1.4T Capex", "Grid Power", "Taxpayer Risk"]; for Scion: ["Virtual FS", "Server Merge", "API VCS", "Changesets", "CI Runners", "Telemetry"]).
- Slide 2: The Problem / Trigger (Losses, Bottleneck, or Unit Economics) — What broke or why the math is alarming.
  * Use archetype "metric" when the source contains a dramatic real number (e.g. "$20.9B", "$2.60 per $1", "100 GB", "25M checkouts").
  * Otherwise, use "row" or "number" ("01" The Core Deficit / Bottleneck).
- Slides 3–4: The Mechanics & Physical/System Scale — Explain how the system or financial engine works and its infrastructure scale (e.g., Circular financing flows, $1.4T commitments, 10GW / nuclear power scale; or core software architecture).
- Slides 5–6: The Real-World / Operational Impact (GROUPED TOGETHER) — Group all real-world, human, or downstream impacts together (e.g., Consumer Energy Bills +63%, S&P 500 Retiree Exposure, $6.6B Employee Cash-out vs. 5% Government Stake / Taxpayer Backstops) rather than sandwiching them between infrastructure slides!
  * Pick the archetype that BEST EXPLAINS each point:
    - "compare" (Side-by-side): When contrasting two realities or approaches (e.g. "$1 Earned vs $2.60 Spent", "$6.6B Insider Cash-Out vs Taxpayer Backstop", or "Legacy vs Modern").
    - "code" (Terminal Window): ONLY when there is an actual command, configuration, or code snippet to show. NEVER use "code" for financial/economic stories unless source code is in the input.
    - "row" (Diagrams): When explaining capital flows, stack tiers, or risk isolation. Cycle variants ('topology', 'stack', 'isolation', 'takeaway').
    - "number" (Steps): When detailing chronological or procedural steps (01, 02, 03).
    - "metric": When showcasing a standout verified figure ($1.4T, 63%, 10 GW, $6.6B).
- Slide 7: "The Core Trade-off / Verdict" (Spec §7 & §12.1) — Synthesize the overarching trade-off, systemic risk, or engineering caveat. Use archetype "row" with diagramVariant: 'takeaway' or 'isolation'.
- Slide 8: Archetype "cta" (The Closer) — Targeted viewer question or community discussion call ("Join discussion • شارك برأيك"), marrok.org, and source credit. NEVER make commercial service claims (no "DM for Architecture Review").

DIAGRAM NODE, ARCHETYPE DIVERSITY & ANTI-BOILERPLATE RULES:
- STRICT ARCHETYPE DIVERSITY ACROSS SLIDES 2–7:
  * NEVER repeat the same slide archetype on 3 consecutive mid-deck slides. Across Slides 2–7, you MUST use at least 3 to 4 distinct visual archetypes (e.g., mixing "compare", "metric", "code", "number", and "row" with distinct diagramVariants).
  * When using "row", NEVER repeat the same diagramVariant twice in a row — actively rotate across 'isolation', 'clusters', 'split', 'features', 'graph', 'scatter', 'topology', 'stack', and 'takeaway' based on the exact concept of that slide.
- ZERO GENERIC BOILERPLATE NODES OR COPY:
  * STRICTLY PROHIBIT generic filler headlines or body text such as "The architectural bottleneck", "Traditional systems degrade under high scale", "Core system architecture", "Execution dataflow pipeline", or "Production reliability wins". Every slide (2 through 7) MUST explain a specific mechanism, protocol, comparison, or claim directly from the source article!
  * STRICTLY PROHIBIT generic diagramNode labels such as "System Ingress", "Execution Core", "Durable State", "Target State", or "Event Inbound". Every single diagramNode label and sublabel MUST name a real actor, protocol, component, token claim, or entity from the article (e.g. "Human Principal", "OAuth Token Exchange", "RFC 8693 'act' Claim", "ScyllaDB Shard", "Pingora Worker").
- For every mechanism slide ("row"):
  * diagramVariant: 'scatter' | 'graph' | 'clusters' | 'split' | 'features' | 'topology' | 'stack' | 'isolation' | 'takeaway'
  * diagramNodes: exactly 3 component cards specific to THAT slide's concept (label, sublabel, status, icon).
    - For financial/economic topics, use finance & infrastructure icons: 'dollarSign' (capital/valuation/revenue), 'landmark' (banks/government/taxpayers/subsidies), 'factory' (power plants/nuclear/energy grid/industrial capex), 'trendingDown' (losses/deficits), 'scales' (risk/trade-offs), 'lifecycle' (circular financing), 'users' (retirees/employees/consumers), 'cpu' (AI chips). NEVER use 'server' or DevOps labels ("Ingress", "Port 443", "P99 < 1.0ms") for financial flows!
  * diagramEdges: 2 flow labels relevant to the slide (e.g. ["FINANCE", "RECYCLE"] or ["SUBSIDIZE", "BACKSTOP"] for finance; ["DELEGATE", "ATTEST"] for agent auth; ["ENCODE", "SIMILARITY"] for vectors).
  * diagramFooter: bottom summary line matching the domain (e.g. "CAPITAL TOPOLOGY: CIRCULAR FINANCING & VALUE FLOW").

STAGE 5: COPYWRITING & RTL LINT (Spec §8)
- ENGLISH HEADLINES:
  * Must be 2 to 8 words, maximum 45 characters.
  * Statements must end in a period ('.'). Questions must end in a question mark ('?').
  * NEVER end a headline with a colon (':'), dash ('-'), or ellipsis ('...').
  * Make them punchy and specific. E.g. 'The $500B valuation gamble.', 'Spending $2.60 to make $1.', 'How circular financing works.', '10 gigawatts of nuclear power.', 'Energy bills jump 63%.', 'Insiders cash out $6.6B.'
- ARABIC HEADLINES & BODY:
  * Natural, authentic, professional Modern Standard Arabic (فصحى معاصرة دقيقة).
  * Proper nouns remain in Latin characters (e.g. OpenAI, Nvidia, S&P 500, Git, Anthropic, PostgreSQL).
  * NEVER reverse subject and object (e.g. write 'السبب وراء ابتعاد Anthropic عن Git', NOT 'السبب وراء ابتعاد Git عن Anthropic').
  * NEVER end an Arabic line with a Latin word plus punctuation (prevents BiDi punctuation flipping).
  * NO generic filler sentences. Explain the actual mechanism or economic impact clearly.
- CHARACTER LIMITS:
  * English title: max 45 chars (max 50 on Slide 1 hook)
  * Arabic title: max 40 chars
  * English body: max 140 chars
  * Arabic body: max 150 chars
- BRAND WORDMARK:
  * Top-left watermark brand MUST strictly be 'MARROK'. Never set brand to company or tool names.
- No emojis inside slides (Cairo font has none). Emojis belong in captions only.

STAGE 6 & 7: CAPTIONS, FIRST COMMENT & SCHEDULING (Spec §8 & §14)
- Caption: Bilingual publication copy (Arabic first, then English):
  1. Catchy Arabic hook with emoji (🔥 or ⚡)
  2. Arabic concise context (2-3 lines)
  3. English translation & summary
  4. Bullet points of key mechanisms & golden stats (🔹)
  5. The Trade-off / The Catch
  6. Engagement challenge question (👇)
  7. Source credit line (🎥 or 📄)
  8. 8-10 high-relevance hashtags
- firstComment: Pinned first comment with reference link.
- shortCaption: 2-line quick-scroll version.
- screenHook: 3-second on-screen hook for Slide 1 cover.
- notesForHuman: 2 to 3 notes for human review (unverified claims, caveats, grounding results).
- scheduleSlot: Recommended posting slot in Africa/Algiers timezone (10:00 DZ, 12:00 DZ, or 18:00 DZ).

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
  let userPromptText = isSingle
    ? `Generate a publication-ready SINGLE-SLIDE standalone 1080x1920 infographic post (slides array length MUST be 1), 3 Hook Variants for the slide, and 2 Caption Variants from this input.\n`
    : `Generate a publication-ready 8-slide MARROK carousel, 3 Hook Variants for Slide 1, and 2 Caption Variants from this input.\n`;

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
    userPromptText += `\nMULTIMODAL IMAGE INPUT ANALYSIS:
- An image (screenshot, architecture diagram, flowchart, code snippet, or slide) is attached.
- Inspect and OCR the image visually: read all visible labels, node titles, component blocks, arrows, protocols, and metrics.
- Formulate the topic and narrative directly from the concepts displayed in the image.
- CRITICAL NEGATIVE CONSTRAINT: Under NO circumstances should an image filename (such as "${options.imageName || '20760.png'}") or file extension (.png, .jpg, .webp) ever be used as a slide title, headline, or topic. Extract and name the authentic subject depicted in the image.
`;
    if (!options.rawPrompt) {
      userPromptText += isSingle
        ? `- Since no text prompt was provided, derive the standalone single-slide schematic and bilingual copy entirely from the image.\n`
        : `- Since no text prompt was provided, derive the full 8-slide narrative, step-by-step mechanisms, and bilingual copy entirely from the image.\n`;
    }
  }

  if (isSingle) {
    userPromptText += `\nInstructions for a coherent, high-impact SINGLE-SLIDE post:
- Return EXACTLY 1 slide in slides[] that distills the core insight onto a single 1080x1920 infographic poster:
  * Pick the archetype that BEST EXPLAINS the topic ("poster", "row", "compare", "metric", "code", or "hub").
  * Populate takeaways[] with 3 high-signal bilingual bullets ({ en: "...", ar: "...", icon: "..." }) extracted directly from the input's actual claims and numbers (NEVER invent software/DevOps jargon like "blue-green rollback" or "sub-second latency" when the topic is financial or economic).
  * Expanded single-slide copy limits: enTitle (up to 55 chars), arTitle (up to 50 chars), enBody (up to 220 chars), arBody (up to 230 chars).
  * Populate enCredit and arCredit for standalone footer attribution.
- Return valid JSON matching the exact schema.`;
  } else {
    userPromptText += `\nInstructions for a coherent, logically grouped 8-slide carousel:
- Organize slides in a strict narrative flow with high visual archetype diversity:
  * Slide 1 ("hub" — The Hook): Shocking premise or architectural hook with centerIcon, 6 domain-matched satIcons, AND 6 topic-specific satLabels extracted directly from the input.
  * Slide 2 (The Problem / Contrast / Metric): Core bottleneck, identity/architecture contrast ("compare"), or dramatic stat ("metric").
  * Slides 3–6 (Deep Specific Mechanisms, Code & Real-World Impact): Break down the exact mechanisms, protocols, configurations, and impacts from the input. Mix archetypes dynamically ("compare", "code", "metric", "number", and "row" with varied diagramVariants: 'isolation', 'clusters', 'split', 'features', 'graph', 'topology', 'stack'). NEVER output generic filler like "Traditional systems degrade under high scale" or generic nodes like "System Ingress -> Core -> Durable State".
  * Slide 7 (The Core Trade-off / Verdict): Overarching takeaway ("row" with variant 'takeaway' or 'isolation').
  * Slide 8 ("cta" — The Closer): Domain discussion question, Join discussion CTA, and source attribution.
- STRICT TOPICAL TONE: If the input is about finance, economics, valuation, or energy, strictly prohibit IT/software/DevOps jargon (no "latency", "modular", "deployment", "ingress"). Use economic terminology and finance icons ('dollarSign', 'landmark', 'factory', 'scales', 'trendingDown', 'users').
- Return valid JSON matching the exact schema.`;
  }

  return userPromptText;
}

export const CAROUSEL_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    theme: {
      type: Type.STRING,
      description: 'Spec theme id: scion, backend, pqc, security_spec, node, ajax, concat, estonia, artcraft, arch, zerobreach, teal, cyber, violet, blueprint, amber, emerald, monochrome',
    },
    category: {
      type: Type.STRING,
      description: 'Specific technical domain category extracted directly from input context (e.g. CYBERSECURITY & DEFENSE, VCS & MONOREPOS, DATABASES & CACHING, LINUX KERNEL)',
    },
    brand: {
      type: Type.STRING,
      description: 'Brand wordmark for slide watermark. MUST strictly be "MARROK".',
    },
    brandUrl: {
      type: Type.STRING,
      description: 'Website URL (defaults to "marrok.org")',
    },
    sourceMeta: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING },
        title: { type: Type.STRING },
        creator: { type: Type.STRING },
        url: { type: Type.STRING },
        published: { type: Type.STRING },
        groundingQueries: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'Search queries executed during grounding verification',
        },
        groundingSources: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              url: { type: Type.STRING },
            },
            required: ['title', 'url'],
          },
          description: 'Authoritative web links found during Google Search grounding',
        },
        isSearchGrounded: { type: Type.BOOLEAN },
      },
      description: 'Spec §4: Source metadata extracted from input & search grounding',
    },
    facts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          type: { type: Type.STRING },
          verified: { type: Type.STRING },
          evidence: { type: Type.STRING },
          sourceUrl: { type: Type.STRING },
          sourceTitle: { type: Type.STRING },
        },
        required: ['text', 'type', 'verified'],
      },
      description: 'Spec §4 & §5: Extracted and verified facts with source citations',
    },
    notesForHuman: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Spec §11: Caveats, sponsor segments dropped, and verification notes for human review',
    },
    scheduleSlot: {
      type: Type.STRING,
      description: 'Spec §14: Recommended posting slot (e.g. 18:00 DZ)',
    },
    caption: {
      type: Type.STRING,
      description: 'Primary bilingual English + Arabic TikTok description',
    },
    firstComment: {
      type: Type.STRING,
      description: 'Pinned first comment with reference link per Spec §8 & §14',
    },
    shortCaption: {
      type: Type.STRING,
      description: '2-line short caption variant for quick scroll per Spec §8',
    },
    screenHook: {
      type: Type.STRING,
      description: '3-second on-screen hook text for Slide 1 per Spec §8',
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
    hookVariants: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          tag: { type: Type.STRING },
          enTitle: { type: Type.STRING },
          arTitle: { type: Type.STRING },
          enBody: { type: Type.STRING },
          arBody: { type: Type.STRING },
          centerIcon: { type: Type.STRING },
        },
        required: ['tag', 'enTitle', 'arTitle', 'enBody', 'arBody'],
      },
      description: '3 alternative Slide 1 Hook variations for A/B testing',
    },
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            description: 'hub, row, number, metric, code, compare, image, cta, or poster',
          },
          takeaways: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                en: { type: Type.STRING, description: 'English key takeaway bullet (max 75 chars)' },
                ar: { type: Type.STRING, description: 'Arabic key takeaway bullet (max 80 chars)' },
                icon: { type: Type.STRING, description: 'Icon name e.g. zap, shield, checkCircle, database, layers' },
              },
              required: ['en', 'ar'],
            },
            description: 'Up to 3 high-signal bilingual key takeaway bullets for single-slide poster or summary slides',
          },
          stepNumber: {
            type: Type.STRING,
            description: 'Step numeral e.g. 01, 02, 03 for number archetype slides',
          },
          stepLabel: {
            type: Type.STRING,
            description: 'Step badge label e.g. STEP 01 for number archetype slides',
          },
          centerIcon: {
            type: Type.STRING,
            description: 'Icon name for hub center box',
          },
          satIcons: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Array of 6 icon names for hub satellites',
          },
          satLabels: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Array of 6 short technical component names for Slide 1 orbital satellites, directly relevant to the topic (e.g. for Postgres: ["Replica DB", "Connection Pool", "WAL Logs", "Buffer Cache", "Vacuum Worker", "Query Planner"])',
          },
          diagramVariant: {
            type: Type.STRING,
            description:
              'Diagram layout style: "scatter" (vector scatter with query point & cosine distances), "graph" (layered/hierarchical skip-graph like HNSW), "clusters" (space partitioning & K-means centroids like IVF), "split" (dual hot/cold store or memory vs disk buffer), "features" (metadata filtered search with attribute constraints), "topology" (connected 3-node protocol flow), "stack" (vertical 3-layer architecture pipeline), "isolation" (blast radius / boundary quarantine grid), or "takeaway" (engineering decision card)',
          },
          diagramNodes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING, description: 'Component name e.g. "PgBouncer", "Primary DB", "Docker Daemon"' },
                sublabel: { type: Type.STRING, description: 'Protocol, port, or spec e.g. "Port 5432", "Tx Mode"' },
                status: { type: Type.STRING, description: 'Status pill text e.g. "POOLED", "ACTIVE", "ISOLATED"' },
                icon: { type: Type.STRING, description: 'Lucide icon name e.g. database, server, cpu, lock' },
              },
              required: ['label'],
            },
            description: 'The 3 component cards, layers, or cells illustrating this specific slide concept. MUST be 100% relevant to the slide topic.',
          },
          diagramEdges: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Labels on the arrows/connectors between nodes (e.g. ["10k Conns", "64 Pooled"] or ["REST API", "OCI Shim"])',
          },
          diagramFooter: {
            type: Type.STRING,
            description: 'Bottom telemetry/summary spec bar line (e.g. "POOL MODE: TRANSACTION • LATENCY: 0.8ms P99 • MAX CLIENTS: 10,000")',
          },
          icons: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                icon: { type: Type.STRING },
                label: { type: Type.STRING },
              },
              required: ['icon', 'label'],
            },
            description: 'Array of 1 to 5 icons with micro-labels for row slides',
          },
          metricValue: {
            type: Type.STRING,
            description: 'Hero metric number for metric slide (e.g. 200x, 0ms, 99.9%)',
          },
          metricLabel: {
            type: Type.STRING,
            description: 'Micro-label for metric slide (e.g. THROUGHPUT MULTIPLIER)',
          },
          metricDiff: {
            type: Type.STRING,
            description: 'Improvement delta for metric slide (e.g. ▲ 12x vs baseline)',
          },
          metricIcon: {
            type: Type.STRING,
            description: 'Icon for metric slide badge',
          },
          codeSnippet: {
            type: Type.STRING,
            description: 'Multi-line code snippet for code slide',
          },
          codeFileName: {
            type: Type.STRING,
            description: 'File or tab name for code window (e.g. bench_run.sh)',
          },
          codeLanguage: {
            type: Type.STRING,
            description: 'Language for code slide (e.g. bash, rust, python, sql)',
          },
          compareLeftTitle: {
            type: Type.STRING,
            description: 'Left card title for compare slide (e.g. Legacy Monolith)',
          },
          compareLeftBody: {
            type: Type.STRING,
            description: 'Left card bullet points for compare slide',
          },
          compareRightTitle: {
            type: Type.STRING,
            description: 'Right card title for compare slide (e.g. Modern Engine)',
          },
          compareRightBody: {
            type: Type.STRING,
            description: 'Right card bullet points for compare slide',
          },
          enTitle: {
            type: Type.STRING,
            description: 'English headline: 2 to 8 words (max 45 chars) ending in . or ?. Punchy, informative, and grammatically complete.',
          },
          arTitle: {
            type: Type.STRING,
            description: 'Concise, contextual Arabic headline. Keep brand/tool names in Latin. Correct grammar and natural flow.',
          },
          enBody: {
            type: Type.STRING,
            description: 'English body copy or hook subtitle',
          },
          arBody: {
            type: Type.STRING,
            description: 'Arabic body copy or hook subtitle',
          },
          ctaText: {
            type: Type.STRING,
            description: 'Pill button text for cta slide',
          },
          url: {
            type: Type.STRING,
            description: 'Website URL for cta slide',
          },
          enCredit: {
            type: Type.STRING,
            description: 'English source attribution footer for cta slide',
          },
          arCredit: {
            type: Type.STRING,
            description: 'Arabic source attribution footer for cta slide',
          },
        },
        required: ['type', 'enTitle', 'arTitle', 'enBody', 'arBody'],
      },
    },
  },
  required: ['theme', 'category', 'caption', 'slides'],
};

