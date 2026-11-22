import type { HookClaimCard, SlideData } from '../../../types.ts';

/**
 * Builds a structured Quote-style claim card or Contrast visual for non-numeric Slide 1 hooks.
 */
export function buildNonNumericHookClaimCard(
  sourceText: string,
  slide?: Partial<SlideData>
): HookClaimCard | undefined {
  const text = `${sourceText || ''} ${slide?.enTitle || ''} ${slide?.enBody || ''}`
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;

  // 1. Detect explicit Contrast ("X instead of Y", "X rather than Y", "X vs Y", "not X — Y")
  const insteadMatch = text.match(
    /([^.!?\n]{4,56}?)\s+(?:instead\s+of|rather\s+than)\s+(?:over\s+)?([^.!?\n]{4,44})/i
  );
  if (insteadMatch) {
    const stripFillers = (s: string, keepTail: boolean) => {
      const cleaned = s
        .replace(/^(?:the\s+same|your|an?|over|on|into|inside|runs?\s+inside)\s+/i, '')
        .trim()
        .split(/\s+/)
        .filter((w) => !/^(?:as|your|the|a|an|for)$/i.test(w));
      const slice = keepTail ? cleaned.slice(-3) : cleaned.slice(0, 3);
      return slice.join(' ').slice(0, 28).trim();
    };
    const afterClean = stripFillers(insteadMatch[1], true);
    const beforeClean = stripFillers(insteadMatch[2], false);
    if (afterClean.length >= 3 && beforeClean.length >= 3 && afterClean.toLowerCase() !== beforeClean.toLowerCase()) {
      return {
        mode: 'contrast',
        badge: 'THE REAL SHIFT',
        statement: `${afterClean} over ${beforeClean}`.slice(0, 72),
        beforeLabel: beforeClean.toUpperCase(),
        afterLabel: afterClean.toUpperCase(),
        attribution: slide?.enCredit ? slide.enCredit.replace(/^Source:\s*/i, '') : undefined,
      };
    }
  }

  const contrastMatch =
    text.match(/([^.!?\n]{4,48}?)\s+(?:vs\.?|versus)\s+([^.!?\n]{4,48})/i) ||
    text.match(/\bnot\s+([^,;.\n]{3,32})[;,—-]+\s*(?:it'?s|but)?\s*([^.!?\n]{4,42})/i);

  if (contrastMatch) {
    const rawSideA = contrastMatch[1].replace(/^[\s•-]+/, '').trim();
    const rawSideB = contrastMatch[2].replace(/^[\s•-]+/, '').trim();
    const cleanA = rawSideA.split(/\s+/).slice(-3).join(' ').slice(0, 28);
    const cleanB = rawSideB.split(/\s+/).slice(0, 3).join(' ').slice(0, 28);
    if (cleanA.length >= 3 && cleanB.length >= 3 && cleanA.toLowerCase() !== cleanB.toLowerCase()) {
      return {
        mode: 'contrast',
        badge: 'THE REAL SHIFT',
        statement: `${cleanA} vs ${cleanB}`.slice(0, 72),
        beforeLabel: cleanA.toUpperCase(),
        afterLabel: cleanB.toUpperCase(),
        attribution: slide?.enCredit ? slide.enCredit.replace(/^Source:\s*/i, '') : undefined,
      };
    }
  }

  // 2. Quote / Contrarian Claim / Question from source sentences (strictly deduped against slide.enTitle)
  const normalizedTitle = (slide?.enTitle || '').trim().toLowerCase();
  const titleTokens = new Set(normalizedTitle.split(/\s+/).filter((w) => w.length > 2));

  const isDuplicateOfTitle = (candidate: string) => {
    const cleanCand = candidate.trim().toLowerCase();
    if (!cleanCand || !normalizedTitle) return false;
    if (cleanCand === normalizedTitle) return true;
    if (cleanCand.includes(normalizedTitle) || normalizedTitle.includes(cleanCand)) return true;
    const candTokens = cleanCand.split(/\s+/).filter((w) => w.length > 2);
    if (candTokens.length === 0 || titleTokens.size === 0) return false;
    const overlap = candTokens.filter((t) => titleTokens.has(t)).length;
    const overlapRatio = overlap / Math.max(candTokens.length, titleTokens.size);
    return overlapRatio >= 0.65;
  };

  const sentences = (sourceText || slide?.enBody || '')
    .split(/(?<=[.?!؟\n])\s+/)
    .map((s) => s.replace(/^[•*-]\s*/, '').replace(/^["'«»]|["'«»]$/g, '').trim())
    .filter((s) => s.length >= 14 && !isDuplicateOfTitle(s));

  const surprising =
    sentences.find((s) => /[?!؟]/.test(s)) ||
    sentences.find((s) =>
      /\b(never|always|nobody|everyone|worst|best|actually|real|secret|truth|stop|mistake|breaks?|friday|coffee|senior|junior)\b/i.test(
        s
      )
    ) ||
    sentences[0];

  if (!surprising) {
    // If no distinct sentence found, do not echo enTitle! Fall back to a distinct contrast statement or observation
    const fallbackObservation =
      slide?.enBody && !isDuplicateOfTitle(slide.enBody)
        ? slide.enBody.slice(0, 90)
        : 'Measured architectural shift in production workloads.';
    return {
      mode: 'quote',
      badge: 'KEY OBSERVATION',
      statement: fallbackObservation,
      attribution: slide?.enCredit ? slide.enCredit.replace(/^Source:\s*/i, '') : undefined,
    };
  }

  const words = surprising.split(/\s+/).filter(Boolean);
  const compactQuote = (words.length > 14 ? words.slice(0, 14).join(' ') : surprising)
    .replace(/[,:;]+$/, '')
    .trim();

  if (!compactQuote) return undefined;

  return {
    mode: 'quote',
    badge: /\?$/.test(compactQuote) ? 'OPEN QUESTION' : 'KEY CLAIM',
    statement: compactQuote,
    attribution: slide?.enCredit ? slide.enCredit.replace(/^Source:\s*/i, '') : undefined,
  };
}
