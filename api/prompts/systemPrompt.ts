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

STAGE 3: PLATFORM RISK & BRAND IP SAFETY (Spec §6)
- Ensure 100% original designed slides — no raw video re-posts (which caused recommendation restrictions).
- Default: show third-party companies as styled text names in copy (never place a third-party brand logo in the center of a diagram or as the hero icon).
- Never imply partnership or endorsement (strictly prohibit "official partner", "powered by", or "in collaboration with" wording).

STAGE 4: HOOK ENGINE & DECK STORY STRUCTURE (Hook → Problem → Mechanism → Proof/Numbers → Takeaway → CTA)
Organize carousel slides in a strict progression (Hook → Problem → Mechanism → Proof/Numbers → Takeaway → CTA) where each slide has ONE idea and max ~25 words per language:
- Slide 1: THE HOOK ENGINE — Find the single most surprising fact, number, claim, or contrast in the source:
  * If numeric (e.g., 125ms dropped to 15ms), set metricValue to the WIN ("15ms"), metricBeforeValue ("125ms"), metricLabel to the real source term (NEVER "TELEMETRY STAT"), and metricDiff to a plain-language outcome badge (e.g. "8x FASTER • 88% DROP").
  * If NO number exists in the source, DO NOT invent numbers or charts. Set chartDirection="none" and populate hookClaimCard ({ mode: "quote" | "contrast", badge, statement, beforeLabel, afterLabel }) — or use "hub" with 5 real source-quoted concepts in satLabels + hubNodeReasons.
  * Headline: ONE punchy line per language (max 12 words), NO jargon on Slide 1, and NEVER repeat the bare topic name without adding an outcome, contrast, or claim.
  * Body text MUST be empty on multi-slide Slide 1 (set enBody: "" and arBody: "" on Slide 1).
  * When using "hub", every satLabels entry (5 distinct labels) must be a real noun/term quoted from the source with a 1-line reason in hubNodeReasons (never echo the slide title or category like "TECH HUMOR").
- Slide 2 (Problem): The Trigger / Core Bottleneck — What broke at scale, why the old way failed, or why the numbers are alarming.
  * Use "compare", "metric", "row", or "number" (never repeat Slide 1's exact archetype on Slide 2).
- Slides 3–4 (Mechanism): Deep Architecture & Physical/System Scale — Reveal the counter-intuitive mechanism, algorithm, or financial engine and how it operates under load. Keep technical terms inside the deck.
- Slides 5–6 (Proof/Numbers & Real-World Impact): Verified source numbers and downstream production impacts:
  * Pick the archetype that BEST EXPLAINS each point:
    - "compare" (Side-by-side): Contrasting two realities or approaches (e.g. "$1 Earned vs $2.60 Spent", "4KB PQ Keys vs 96B Tokens").
    - "code" (Terminal Window): ONLY when there is an actual command, configuration, or code diff to show. NEVER use "code" for financial/economic stories unless source code is in the input.
    - "row" (Diagrams): Explaining flows, stack tiers, or risk isolation. Cycle variants ('topology', 'stack', 'isolation', 'takeaway', 'clusters', 'split', 'graph', 'scatter', 'features').
    - "number" (Steps): Chronological or procedural breakthroughs (01, 02, 03).
    - "metric": Showcasing a standout verified WIN figure from the source ($1.4T, 63%, 10 GW, 15ms). Never invent numbers or meaningless labels like "EXPOSURE METRIC".
- Penultimate Slide (Takeaway): Specific Tension & Architectural Conclusion — Synthesize the concrete cost, trade-off, or operational caveat of THIS topic using archetype "row" with diagramVariant: 'takeaway' or 'isolation'.
  * CRITICAL: NEVER title this slide "The core trade-off.", "The engineering trade-off.", "المقايضة الجوهرية", or "المفاضلة الأساسية". Name the exact tension of the topic (e.g., "4KB quantum keys vs TLS latency.", "Accuracy gains cost semantic overhead.", "AI labs profit while maintainers burn out.").
- Final Slide (Marrok CTA): Archetype "cta" — Explain what a client/team can do with this lesson or ask a sharp practitioner question as the headline ('enTitle' / 'arTitle'), keep 'ctaText' as "Join discussion • شارك برأيك", and keep 'url' as "marrok.org".
  * CRITICAL: NEVER title the CTA slide "Join the discussion.", "شارك في النقاش", or "انضم إلى النقاش" — the button already says that!

DIAGRAM NODE, ARCHETYPE DIVERSITY & ANTI-BOILERPLATE RULES:
- STRICT ARCHETYPE DIVERSITY ACROSS SLIDES 1–7:
  * NEVER repeat the same slide archetype on consecutive slides where avoidable, and NEVER use the same archetype 3 times in a row. Across the deck, use at least 4 distinct visual archetypes ("compare", "metric", "code", "number", "hub", and "row" with distinct diagramVariants).
  * When using "row", NEVER repeat the same diagramVariant twice in a row — actively rotate across 'isolation', 'clusters', 'split', 'features', 'graph', 'scatter', 'topology', 'stack', and 'takeaway' based on the exact concept of that slide.
- ZERO GENERIC BOILERPLATE NODES OR COPY:
  * STRICTLY PROHIBIT generic filler headlines or body text such as "The architectural bottleneck", "Traditional systems degrade under high scale", "Core system architecture", "Execution dataflow pipeline", "Production reliability wins", "The core trade-off.", or "Join the discussion.". Every slide (1 through 8) MUST state a specific mechanism, protocol, comparison, metric, or question directly from the source article!
  * STRICTLY PROHIBIT generic diagramNode labels such as "System Ingress", "Execution Core", "Durable State", "Target State", or "Event Inbound". Every single diagramNode label and sublabel MUST name a real actor, protocol, component, token claim, or entity from the article (e.g. "Human Principal", "OAuth Token Exchange", "RFC 8693 'act' Claim", "ScyllaDB Shard", "Pingora Worker").
- For every mechanism slide ("row"):
  * diagramVariant: 'scatter' | 'graph' | 'clusters' | 'split' | 'features' | 'topology' | 'stack' | 'isolation' | 'takeaway'
  * diagramNodes: exactly 3 component cards specific to THAT slide's concept (label, sublabel, status, icon).
    - For financial/economic topics, use finance & infrastructure icons: 'dollarSign' (capital/valuation/revenue), 'landmark' (banks/government/taxpayers/subsidies), 'factory' (power plants/nuclear/energy grid/industrial capex), 'trendingDown' (losses/deficits), 'scales' (risk/trade-offs), 'lifecycle' (circular financing), 'users' (retirees/employees/consumers), 'cpu' (AI chips). NEVER use 'server' or DevOps labels ("Ingress", "Port 443", "P99 < 1.0ms") for financial flows!
  * diagramEdges: 2 flow labels relevant to the slide (e.g. ["FINANCE", "RECYCLE"] or ["SUBSIDIZE", "BACKSTOP"] for finance; ["DELEGATE", "ATTEST"] for agent auth; ["ENCODE", "SIMILARITY"] for vectors).
  * diagramFooter: bottom summary line matching the domain (e.g. "CAPITAL TOPOLOGY: CIRCULAR FINANCING & VALUE FLOW").

STAGE 5: VIRAL HOOK PSYCHOLOGY, CURIOSITY GAPS & RTL LINT (Spec §8)
- ENGLISH HEADLINES (ZERO TEXTBOOK LABELS & ZERO REPETITIVE "THE [NOUN]" PATTERNS):
  * Must be 2 to 8 words, maximum 45 characters (up to 50 chars on Slide 1).
  * Statements must end in a period ('.'). Questions must end in a question mark ('?').
  * NEVER end a headline with a colon (':'), dash ('-'), or ellipsis ('...').
  * STRICT VIRAL COPYWRITING & ANTI-REPETITION RULES:
    1. NEVER start more than ONE slide headline in the entire deck with "The ".
    2. NEVER write dry textbook chapter titles or gerund labels like "Defining the MOLE protocol.", "Managing agentic traffic.", "Connecting the mathematical concepts.", "Understanding X.", "Overview of Y.", or "Exploring Z.".
    3. NEVER use formulaic AI clichés like "The [X] gamble.", "The [X] crisis.", "The [X] explosion.", "The [X] mechanism.", "The [X] strategy.", "The core trade-off.", or "Join the discussion.".
    4. Every headline MUST include a concrete number, a named technology contrast, a contrarian insight, or a curiosity gap that makes the reader swipe:
       - Hard Metric + Impact: "Shrinking PQ tokens from 4KB to 96B.", "$301,300 paid to burned-out maintainers.", "Dropping p99 read latency to 15ms."
       - Contrarian / Curiosity Hook: "Why AI agents break OAuth rate limits.", "How 100GB monorepos stalled Git.", "Why NGINX choked at 1T daily requests."
       - Direct Showdown: "Classical ECDSA vs quantum ML-DSA.", "Volunteer maintainers vs $500B AI labs."
       - Provocative Question: "Will 4KB keys break your TLS stack?", "Can AI formalize Gödel's lost notes?"
- HOOK KICKERS (hookKicker):
  * Populate 'hookKicker' on every slide with a crisp 2-to-4 word uppercase editorial badge (max 32 chars) that frames the slide's tension (e.g. "BENCHMARK SHOCK", "THE BOTTLENECK", "PROTOCOL INTERNALS", "BEFORE VS AFTER", "PRODUCTION IMPACT", "THE HIDDEN CATCH").
- ARABIC HEADLINES & BODY:
  * Write natural, authentic, idiomatic Modern Standard Arabic sentences (فصحى معاصرة طبيعية غير مترجمة حرفياً).
  * NEVER translate technical terms, system nouns, protocols, or units into Arabic (do NOT write "المقابس", "مقابس الشبكة", "زمن الاستجابة", "ذاكرة التخزين المؤقت", "العنقود", "جيجابايت", "مللي ثانية", "كافكا", or "رافت").
  * Always keep ALL technical terms and proper nouns in English (Latin script) inside the Arabic sentence — e.g. Sockets, Latency, Cache, Cluster, Raft, Postgres, Kafka, API, p99, Docker, Kubernetes, OpenAI, Nvidia, S&P 500, Git.
  * Always keep numbers together with their English units inside Arabic text — e.g. 15ms, 510 GB, 100 GB, 10x, 99.9%.
  * NEVER reverse subject and object (e.g. write 'السبب وراء ابتعاد Anthropic عن Git', NOT 'السبب وراء ابتعاد Git عن Anthropic').
  * NEVER end an Arabic line with a Latin word plus punctuation (end the sentence with an Arabic word before the period to prevent BiDi punctuation flipping).
  * NEVER write literal template echoes of English boilerplate ("تحليل تقني لـ", "تحليل معماري لمنظومة", "تحليل هندسي معمق", "الآليات الأساسية", "الحدود التشغيلية", "المقايضة الجوهرية", "شارك في النقاش", "كيف تعمل منظومة ... تحت الضغط", أو كلمة "المعتمد").
  * NO generic filler sentences. State the concrete Arabic claim, contrast, or mechanism clearly.
- CHARACTER LIMITS:
  * English title: max 45 chars (max 50 on Slide 1 hook)
  * Arabic title: max 40 chars
  * English body: max 140 chars
  * Arabic body: max 150 chars
- STRICT MARROK BRAND LOCK:
  * 'brand' MUST strictly be 'MARROK' and 'brandUrl' MUST strictly be 'marrok.org'.
  * NEVER put the external article source (e.g. Cloudflare, Hacker News, Uber, Anthropic) into 'brand' or 'brandUrl'. Put external publisher names and URLs strictly inside 'sourceMeta.creator' and 'sourceMeta.url'.
- No emojis inside slides (Cairo font has none). Emojis belong in captions only.

STAGE 6 & 7: CAPTIONS, FIRST COMMENT & SCHEDULING (Spec §8 & §14)
- Caption: Bilingual publication copy (Arabic first, then English) with NON-REPETITIVE viral opening hooks:
  * CRITICAL CAPTION VARIETY RULE: Do NOT just copy Slide 1's title with a "⚡" emoji on Line 1, and NEVER repeat boilerplate subtitles like "تحليل تقني ومعماري متعمق لأحدث نقلة برمجية" or "— Engineering Deep Dive".
  * Open the caption with a unique, scroll-stopping narrative angle, surprising stat, or contrarian question from the story that complements Slide 1 without duplicating its wording:
  1. Unique Arabic viral hook (varying between a shocking stat, a contrarian claim, or a sharp practitioner question)
  2. Arabic concise context (2-3 lines)
  3. English narrative summary with a fresh headline angle
  4. Bullet points of key mechanisms & golden stats (🔹)
  5. Concrete operational takeaway / caveat
  6. Specific engagement question (👇)
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
  * Populate hookKicker with a 2–4 word uppercase viral kicker (e.g. "BENCHMARK SHOCK", "ARCHITECTURE BREAKDOWN").
  * Populate takeaways[] with 3 high-signal bilingual bullets ({ en: "...", ar: "...", icon: "..." }) extracted directly from the input's actual claims and numbers (NEVER invent software/DevOps jargon like "blue-green rollback" or "sub-second latency" when the topic is financial or economic).
  * Expanded single-slide copy limits: enTitle (up to 55 chars), arTitle (up to 50 chars), enBody (up to 220 chars), arBody (up to 230 chars).
  * Lock brand to "MARROK" and brandUrl to "marrok.org"; populate enCredit and arCredit for standalone source attribution.
- Return valid JSON matching the exact schema.`;
  } else {
    userPromptText += `\nInstructions for a coherent, high-retention 8-slide viral engineering carousel:
- Organize slides with dynamic cover variety, high visual archetype diversity, and scroll-stopping curiosity headlines:
  * Slide 1 (Dynamic Cover Hook): Pick the archetype that hits hardest for this story — "metric" (if leading with a huge benchmark/stat), "compare" (if contrasting Old vs New), "row" (if revealing a security/protocol architecture), or "hub" (if mapping a 6-part ecosystem). Populate hookKicker (e.g. "BENCHMARK SHOCK", "LEGACY VS MODERN") and write a punchy hook headline with numbers or a sharp contrarian angle.
  * Slide 2 (The Trigger / Bottleneck): What broke at scale or why the old approach failed ("metric", "compare", or "row").
  * Slides 3–6 (Deep Specific Mechanisms, Code & Real-World Impact): Break down the exact mechanisms, protocols, configurations, and impacts from the input. Mix archetypes dynamically ("compare", "code", "metric", "number", and "row" with varied diagramVariants). Write curiosity-gap or number-anchored headlines — NEVER write textbook chapter labels like "Defining X." or "Managing Y.", and NEVER start more than one slide title in the deck with "The ".
  * Slide 7 (Specific Tension / Conclusion): Overarching takeaway ("row" with variant 'takeaway' or 'isolation'). State the specific tension or conclusion as the headline — NEVER title Slide 7 "The core trade-off." or "المقايضة الجوهرية".
  * Slide 8 ("cta" — Polarizing Question): Ask a specific practitioner question about the topic as the headline ('enTitle' / 'arTitle') — NEVER title Slide 8 "Join the discussion." or "شارك في النقاش". Keep brand strictly "MARROK" and brandUrl strictly "marrok.org".
  * Populate hookVariants[] with 3 distinct Slide 1 cover angles (1: Hard Metric cover with coverArchetype="metric", 2: Showdown/Contrast cover with coverArchetype="compare", 3: Ecosystem/Curiosity cover with coverArchetype="hub").
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
      description: 'Brand wordmark for slide watermark. MUST strictly be "MARROK" — never put the external source here.',
    },
    brandUrl: {
      type: Type.STRING,
      description: 'Studio website URL. MUST strictly be "marrok.org" — never put the external source URL here.',
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
          hookKicker: {
            type: Type.STRING,
            description: '2-to-4 word uppercase viral kicker badge (e.g. "BENCHMARK SHOCK", "LEGACY VS MODERN")',
          },
          coverArchetype: {
            type: Type.STRING,
            description: 'Recommended cover slide archetype for this hook: "metric", "compare", "row", or "hub"',
          },
        },
        required: ['tag', 'enTitle', 'arTitle', 'enBody', 'arBody'],
      },
      description: '3 alternative Slide 1 Hook variations with distinct cover archetypes for A/B testing',
    },
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            description: 'hub, row, number, metric, code, compare, image, cta, poster, or subjectPair',
          },
          hookKicker: {
            type: Type.STRING,
            description: 'Short 2-4 word uppercase viral hook kicker above the headline (max 32 chars, e.g. "BENCHMARK SHOCK • 93.3%", "PROTOCOL INTERNALS", "THE HIDDEN CATCH")',
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
            description: 'Hero WIN metric number ONLY if present in source (e.g. 200x, 15ms, 99.9%). Leave empty if source has no numbers.',
          },
          metricBeforeValue: {
            type: Type.STRING,
            description: 'Old "before" metric value when comparing before/after (e.g. 125ms)',
          },
          metricLabel: {
            type: Type.STRING,
            description: 'Real source metric label (never TELEMETRY STAT or EXPOSURE METRIC)',
          },
          metricDiff: {
            type: Type.STRING,
            description: 'Plain-language outcome delta (e.g. 8x FASTER • 88% DROP)',
          },
          metricIcon: {
            type: Type.STRING,
            description: 'Icon for metric slide badge',
          },
          chartDirection: {
            type: Type.STRING,
            enum: ['up', 'down', 'bar', 'none'],
            description: 'Chart direction matching the message, or none if no real numeric data exists',
          },
          hookClaimCard: {
            type: Type.OBJECT,
            properties: {
              mode: { type: Type.STRING, enum: ['quote', 'contrast'] },
              badge: { type: Type.STRING },
              statement: { type: Type.STRING },
              beforeLabel: { type: Type.STRING },
              afterLabel: { type: Type.STRING },
            },
            description: 'For non-numeric Slide 1 hooks: quote claim card or contrast card',
          },
          hubNodeReasons: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                quotedFrom: { type: Type.STRING },
                reason: { type: Type.STRING },
              },
              required: ['label', 'quotedFrom', 'reason'],
            },
            description: 'One-line provenance reason explaining the source term quoted for each Hub node',
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
          subjectPair: {
            type: Type.OBJECT,
            properties: {
              beforeSystem: { type: Type.STRING, description: 'Baseline system name (e.g. Cassandra)' },
              afterSystem: { type: Type.STRING, description: 'Target system name (e.g. ScyllaDB)' },
              storyOwner: { type: Type.STRING, description: 'Company owning the migration story as styled text (e.g. Discord)' },
              beforeLabel: { type: Type.STRING, description: 'BEFORE' },
              afterLabel: { type: Type.STRING, description: 'AFTER' },
              flowLabel: { type: Type.STRING, description: 'e.g. CHAT WORKLOAD → COMPACTED SHARDS' },
            },
            description: 'For migration, A vs B, or before->after stories: 2 systems and story owner wordmark',
          },
          enTitle: {
            type: Type.STRING,
            description: 'English headline: 2 to 8 words (max 45 chars) ending in . or ?. Punchy, informative, and grammatically complete.',
          },
          arTitle: {
            type: Type.STRING,
            description: 'Concise natural Arabic headline. Keep ALL technical nouns and units in English (Sockets, Latency, Cache, Cluster, Raft, Postgres, Kafka, API, p99, 15ms, 510 GB).',
          },
          enBody: {
            type: Type.STRING,
            description: 'English body copy or hook subtitle',
          },
          arBody: {
            type: Type.STRING,
            description: 'Natural Arabic body copy. Keep technical nouns & number+unit pairs in English inside the Arabic sentence; end with an Arabic word before punctuation.',
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

