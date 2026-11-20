import { normalizePunctuation, stripMarkdown } from './markdown.ts';

export interface HeadlineOptions {
  isHook?: boolean;
  isCta?: boolean;
  fallbackSubject?: string;
}

/**
 * Formats headline to meet Spec §8: complete, punchy thought ending in a period or question mark.
 */
export function autoPolishHeadline(title: string): string {
  if (!title) return '';
  let clean = title.trim().replace(/\s+/g, ' ');
  // If ending with punctuation, preserve; otherwise add period or question mark
  if (!/[.?!:]$/.test(clean)) {
    const isDirectQuestion =
      /^(?:is|are|can|could|does|did|should|will|would|do)\b/i.test(clean) ||
      /^(?:why|how|what)\s+(?:do|does|did|is|are|can|could|should|will|would)\b/i.test(clean);
    clean += isDirectQuestion ? '?' : '.';
  }
  return clean;
}

/**
 * Trims text to fit within character limits without breaking words.
 */
export function autoFitTextToLimits(text: string, limit: number): string {
  if (!text || text.length <= limit) return text;
  const words = text.trim().split(/\s+/);
  const kept: string[] = [];
  for (const w of words) {
    const next = [...kept, w].join(' ');
    if (next.length > limit - 1) break;
    kept.push(w);
  }
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  while (
    hasArabic &&
    kept.length > 3 &&
    /^(?:في|من|على|عن|إلى|مع|محل|بدل|بين|بسبب|نحو|و|أو|ثم|ان|أن|لأن)$/.test(
      kept[kept.length - 1].replace(/[.,،؟?!:]/g, '')
    )
  ) {
    kept.pop();
  }
  while (
    !hasArabic &&
    kept.length > 3 &&
    /^(?:from|to|with|of|for|in|on|by|at|and|or|the|a|an|that|as|into|than|via)$/i.test(
      kept[kept.length - 1].replace(/[^a-zA-Z]/g, '')
    )
  ) {
    kept.pop();
  }

  let res = kept.join(' ').replace(/[,:;—–-]+$/, '').trim();
  if (!res) res = text.slice(0, Math.max(1, limit - 1)).trim();

  if (!/[.?!؟]$/.test(res)) {
    const isArabicQuestion =
      hasArabic &&
      (/؟/.test(text) || /^(?:لماذا|كيف|هل|ما|متى|أين|أي)\b/.test(res));
    if (isArabicQuestion) {
      res += '؟';
    } else if (!hasArabic) {
      const isDirectQuestion =
        /^(?:is|are|can|could|does|did|should|will|would|do)\b/i.test(res) ||
        /^(?:why|how|what)\s+(?:do|does|did|is|are|can|could|should|will|would)\b/i.test(res);
      res += isDirectQuestion ? '?' : '.';
    }
  }
  return res;
}

/**
 * Detects whether a string is a non-semantic, machine-generated filename or hash
 * (e.g. "20760.png", "20760png", "IMG_20760.jpg", "Screenshot_20261027.png", "44b08b41.jpg").
 */
export function isNonSemanticFileName(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // 1. Strip extensions (.png, .jpg, etc.) or stripped extensions (e.g. 20760png -> 20760)
  const base = trimmed.replace(/\.(?:png|jpe?g|webp|svg|gif|bmp|tiff|avif)$/i, '').trim();

  // Pure numeric (e.g. "20760" or "20760png")
  if (/^\d+$/i.test(base)) return true;
  if (/^\d+(?:png|jpe?g|webp|svg|gif)$/i.test(trimmed)) return true;

  // Machine generated prefixes from mobile phones, cameras, screenshot tools:
  const nonSemanticPrefixPattern =
    /^(?:img|dsc|pxl|dcim|screenshot|screen\s*shot|capture|snip|photo|image|pasted[-_\s]*image|clipboard|upload|file|attachment|download|asset|pic)(?:$|[-_\s\d])/i;
  const prefixStripper =
    /^(?:img|dsc|pxl|dcim|screenshot|screen\s*shot|capture|snip|photo|image|pasted[-_\s]*image|clipboard|upload|file|attachment|download|asset|pic)/i;

  if (nonSemanticPrefixPattern.test(base)) {
    const remaining = base.replace(prefixStripper, '').replace(/^[-_\s]+/, '').trim();
    if (!remaining) return true;
    // Check if remaining words contain any real substantive words (length >= 3 and not dates/numbers/stopwords)
    const substantiveWords = remaining
      .replace(/[-_\s\d.:()]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^(?:at|am|pm|copy|final|edit|new)$/i.test(w));
    if (substantiveWords.length === 0) return true;
  }
  if (nonSemanticPrefixPattern.test(trimmed)) {
    const remaining = trimmed.replace(prefixStripper, '').replace(/^[-_\s]+/, '').trim();
    if (!remaining) return true;
    const substantiveWords = remaining
      .replace(/[-_\s\d.:()]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^(?:at|am|pm|copy|final|edit|new)$/i.test(w));
    if (substantiveWords.length === 0) return true;
  }

  // Hex hashes or UUIDs (e.g., "637edc85", "44b08b41", UUIDs)
  if (/^[0-9a-f]{8,}$/i.test(base) || /^[0-9a-f]{8,}(?:-[0-9a-f]{4,})*$/i.test(base)) return true;

  // Mixed digit/hyphen strings that have no letters or no English words
  if (/^[\d_\-.\s]+$/.test(base)) return true;

  return false;
}

/**
 * Attempts to extract a clean, human-authored technical topic from a filename.
 * If the filename is machine-generated or non-semantic, returns null.
 */
export function extractTopicFromFileName(fileName?: string): string | null {
  if (!fileName || !fileName.trim()) return null;
  const cleanName = fileName.trim().split(/[\\/]/).pop() || '';
  if (!cleanName) return null;

  if (isNonSemanticFileName(cleanName)) return null;

  // Strip extension
  const withoutExt = cleanName.replace(/\.(?:png|jpe?g|webp|svg|gif|bmp|tiff|avif)$/i, '').trim();
  if (isNonSemanticFileName(withoutExt)) return null;

  // Replace underscores and hyphens with spaces
  const words = withoutExt
    .replace(/[-_]+/g, ' ')
    .replace(/[:;.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (words.length === 0) return null;

  // Check if words contain at least one meaningful word (length >= 3, contains letters)
  const meaningfulWords = words.filter((w) => /[a-z]/i.test(w) && w.length >= 3);
  if (meaningfulWords.length === 0) return null;

  // Format to Title Case
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Enforces Spec §8 rule on English headlines:
 * - Slide 1 Hook: 6 to 12 words (<= 76 chars), ending in '.', '?', or '!'. Zero colons.
 * - CTA Slide: Up to 8 words, ending in '?', '!', or '.'. Allows question hooks.
 * - Content Slides: Up to 8 words (<= 45 chars), clean punctuation.
 */
export function enforceHeadlineSpecRule(
  rawHeadline: string,
  options: HeadlineOptions | string = {}
): string {
  const opts: HeadlineOptions = typeof options === 'string' ? { fallbackSubject: options } : options;
  const { isHook = false, isCta = false, fallbackSubject = 'System' } = opts;

  if (!rawHeadline || !rawHeadline.trim() || isNonSemanticFileName(rawHeadline)) {
    if (isCta) return 'Need a custom tool?';
    return `${fallbackSubject}, explained.`;
  }

  const trimmed = rawHeadline.trim();
  const isDirectQuestion =
    trimmed.endsWith('?') ||
    /^(?:is|are|can|could|does|did|should|will|would|do)\b/i.test(trimmed) ||
    /^(?:why|how|what)\s+(?:do|does|did|is|are|can|could|should|will|would)\b/i.test(trimmed) ||
    (isCta && /^(?:need|ready|want|scaling)\b/i.test(trimmed));
  let endingPunc = isDirectQuestion ? '?' : '.';
  if (trimmed.endsWith('!')) endingPunc = '!';

  // Clean markdown and symbols; preserve numeric decimals (99.99%, 0.4ms, v2.4) and dotted tech names (Node.js, Next.js)
  const baseClean = stripMarkdown(rawHeadline)
    .replace(/;+/g, ' ')
    .replace(/[?!،؟…]+/g, '')
    .replace(/\./g, (_dot, offset: number, str: string) => {
      const prevChar = offset > 0 ? str[offset - 1] : '';
      const nextChar = offset + 1 < str.length ? str[offset + 1] : '';
      if (/\d/.test(prevChar) && /\d/.test(nextChar)) {
        return '.';
      }
      const before = str.slice(Math.max(0, offset - 10), offset);
      const after = str.slice(offset + 1, offset + 6);
      if (
        /(?:node|next|nuxt|vue|react|svelte|solid|bun|deno|three|d3|p5|socket|chart|express|nest|hono|astro|asp)$/i.test(before) &&
        /^(?:js|ts|net|io)\b/i.test(after)
      ) {
        return '.';
      }
      return '';
    });
  const clean = (
    isHook || isCta
      ? baseClean.replace(/:+/g, ' ')
      : baseClean.replace(/\s*:\s*/g, ': ').replace(/^:\s*|\s*:$/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();

  const words = clean.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    if (isCta) return 'Need a custom tool?';
    return `${fallbackSubject}, explained${endingPunc}`;
  }

  if (words.length === 1) {
    const singleWord = words[0].replace(/:+$/, '');
    if (isNonSemanticFileName(singleWord)) {
      return isCta ? `${fallbackSubject} at scale?` : `${fallbackSubject}, explained${endingPunc}`;
    }
    return isCta ? `${singleWord} at scale?` : `${singleWord}, explained${endingPunc}`;
  }

  const maxWords = isHook ? 12 : isCta ? 8 : 8;
  const maxChars = isHook ? 76 : isCta ? 50 : 45;

  let picked = words.slice(0, maxWords);
  while (picked.length > 2 && picked.join(' ').length > maxChars) {
    picked.pop();
  }

  const joined = picked.join(' ').replace(/:+$/, '').trim();
  return `${joined}${endingPunc}`;
}

/**
 * Extracts a clean technical subject noun phrase and natural Arabic equivalent
 * from raw input, stripping question openers, verbs, and punctuation.
 */
export function extractCleanSubject(rawText: string): { cleanSubject: string; arSubject: string } {
  if (!rawText || !rawText.trim() || isNonSemanticFileName(rawText)) {
    return { cleanSubject: 'System Architecture', arSubject: 'الأنظمة المعمارية' };
  }

  const lower = rawText.toLowerCase();

  if (/\b(?:vector\s*databases?|vector\s*db|embeddings?|pgvector|pinecone|milvus)\b/i.test(lower)) {
    return { cleanSubject: 'Vector Databases', arSubject: 'قواعد البيانات المتجهية' };
  }
  if (/\b(?:scion|anthropic)\b/i.test(lower) && /\bgit\b/i.test(lower)) {
    return { cleanSubject: 'Anthropic Scion', arSubject: 'أنظمة Scion' };
  }
  if (/\bscion\b/i.test(lower)) {
    return { cleanSubject: 'Scion VCS', arSubject: 'منظومة Scion' };
  }
  if (/\bgit\b/i.test(lower)) {
    return { cleanSubject: 'Git Architecture', arSubject: 'معمارية Git' };
  }
  if (/\b(?:docker|container|containers)\b/i.test(lower)) {
    return { cleanSubject: 'Docker Containers', arSubject: 'حاويات Docker' };
  }
  if (/\b(?:redis|valkey)\b/i.test(lower)) {
    return { cleanSubject: 'Redis & Caching', arSubject: 'قواعد Redis' };
  }
  if (/\b(?:postgres|postgresql)\b/i.test(lower)) {
    return { cleanSubject: 'PostgreSQL', arSubject: 'قواعد PostgreSQL' };
  }
  if (/\b(?:sqlite)\b/i.test(lower)) {
    return { cleanSubject: 'SQLite Storage', arSubject: 'SQLite' };
  }
  if (/\b(?:cassandra|scylladb)\b/i.test(lower)) {
    const ownerMatch = rawText.match(/\b(Discord|Slack|Netflix|Apple|Twitter|Uber|Stripe)\b/);
    const prefix = ownerMatch ? `${ownerMatch[1]} ` : '';
    return { cleanSubject: `${prefix}ScyllaDB Migration`.trim(), arSubject: `${prefix}ScyllaDB`.trim() };
  }
  if (/\b(?:ebpf|xdp)\b/i.test(lower)) {
    return { cleanSubject: 'eBPF Systems', arSubject: 'تقنية eBPF' };
  }
  if (/\b(?:zero[- ]?trust|zerotrust|mtls)\b/i.test(lower)) {
    return { cleanSubject: 'Zero-Trust Mesh', arSubject: 'معمارية Zero-Trust' };
  }
  if (/\b(?:k8s|kubernetes)\b/i.test(lower)) {
    return { cleanSubject: 'Kubernetes', arSubject: 'منظومة Kubernetes' };
  }
  if (/\b(?:rust|actix|axum)\b/i.test(lower)) {
    return { cleanSubject: 'Rust Runtime', arSubject: 'أنظمة Rust' };
  }
  if (/\b(?:golang?|gin)\b/i.test(lower)) {
    return { cleanSubject: 'Go Runtime', arSubject: 'محرك Go' };
  }
  if (/\b(?:llm|transformer|gpt|ai)\b/i.test(lower)) {
    return { cleanSubject: 'AI Architecture', arSubject: 'بنية نماذج الذكاء' };
  }

  // Generic fallback: clean question words, verbs, and narrative video preambles
  const withoutUrls = (rawText || '').replace(/https?:\/\/\S+/gi, '').trim();
  let firstLine = withoutUrls.split('\n')[0].trim();

  // Strip file extensions if present (e.g. "architecture.png" -> "architecture")
  firstLine = firstLine.replace(/\.(?:png|jpe?g|webp|svg|gif|bmp|tiff|avif)$/i, '').trim();

  if (isNonSemanticFileName(firstLine)) {
    return { cleanSubject: 'System Architecture', arSubject: 'الأنظمة المعمارية' };
  }

  // Check if firstLine contains an explicit bold topic e.g. "**vector databases**"
  const boldMatch = firstLine.match(/\*\*([^*]{3,40})\*\*/);
  if (boldMatch && boldMatch[1]) {
    const boldClean = boldMatch[1].replace(/[:;]+/g, ' ').trim();
    const titleCase = boldClean
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
    return {
      cleanSubject: titleCase,
      arSubject: `منظومة ${titleCase}`,
    };
  }

  const cleaned = stripMarkdown(firstLine)
    .replace(
      /^(?:this\s+(?:video|article|post|guide|talk|paper)?\s+(?:explains|covers|discusses|breaks\s+down|dives\s+into)\s+(?:the\s+role\s+and\s+architecture\s+of|the\s+architecture\s+of|the\s+internals\s+of|how\s+to\s+build|how)?\s*)/i,
      ''
    )
    .replace(/^(?:why\s+did|why\s+does|why\s+is|how\s+did|how\s+does|how\s+to|how|why|what\s+is|what\s+are|moving\s+beyond|understanding|demystifying|a\s+look\s+at)\s+/i, '')
    .replace(/[:;]+/g, ' ')
    .replace(/[.?!،؟…]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || isNonSemanticFileName(cleaned)) {
    return { cleanSubject: 'System Architecture', arSubject: 'الأنظمة المعمارية' };
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.every((w) => isNonSemanticFileName(w))) {
    return { cleanSubject: 'System Architecture', arSubject: 'الأنظمة المعمارية' };
  }

  const subject = words
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(/\s+(?:Runs|Inside|Moved|From|To|In|On|At|For|With|The|And)$/i, '')
    .trim() || words[0];
  return { cleanSubject: subject, arSubject: subject };
}

/**
 * Cleans user prompt / title into a crisp English headline without markdown.
 * Strictly guarantees a complete, punchy thought ending in '.', '?', or '!'.
 */
export function extractCleanHeadline(
  rawText: string,
  fallbackDomain: string = 'SYSTEMS ARCHITECTURE'
): { headline: string; cleanTitle: string; cleanSubject: string; arSubject: string } {
  const { cleanSubject, arSubject } = extractCleanSubject(rawText);
  if (!rawText || !rawText.trim() || isNonSemanticFileName(rawText)) {
    const fallback = fallbackDomain.split('&')[0].trim();
    const cleanSub = fallback.toLowerCase().includes('architecture')
      ? 'System Architecture'
      : fallback.charAt(0).toUpperCase() + fallback.slice(1).toLowerCase();
    const h = `${cleanSub}, explained.`;
    return { headline: h, cleanTitle: cleanSub, cleanSubject: cleanSub, arSubject };
  }

  // Strip initial URLs
  const withoutUrls = rawText.replace(/https?:\/\/\S+/gi, '').trim();
  let firstLine = withoutUrls.split('\n')[0].trim();
  firstLine = firstLine.replace(/\.(?:png|jpe?g|webp|svg|gif|bmp|tiff|avif)$/i, '').trim();

  let sanitized = stripMarkdown(firstLine);
  sanitized = normalizePunctuation(sanitized);

  // If a colon is present (e.g. "Scion: Moving Beyond Git"), extract the core subject
  let subjectPart = sanitized;
  if (sanitized.includes(':')) {
    const parts = sanitized.split(':').map((p) => p.trim()).filter(Boolean);
    if (parts[0] && parts[0].length >= 3 && parts[0].length <= 50) {
      subjectPart = parts[0];
    } else if (parts[1]) {
      subjectPart = parts[1];
    }
  }

  if (isNonSemanticFileName(subjectPart)) {
    subjectPart = 'System Architecture';
  }

  // Generate crisp hook headline preserving questions if present
  const headline = enforceHeadlineSpecRule(subjectPart, { isHook: true, fallbackSubject: 'Architecture' });
  return { headline, cleanTitle: cleanSubject, cleanSubject, arSubject };
}
