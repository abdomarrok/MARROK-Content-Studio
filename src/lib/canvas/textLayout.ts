export interface FitTextOptions {
  maxLines?: number;
  minFontSize?: number;
  lineHeightFactor?: number;
  ellipsis?: boolean;
}

const MAX_TEXT_LAYOUT_CACHE_ENTRIES = 512;
const wrapLinesCache = new Map<string, string[]>();
const fitTextCache = new Map<string, { fontSize: number; lines: string[]; lineHeight: number }>();

function setBoundedCache<T>(cache: Map<string, T>, key: string, value: T): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= MAX_TEXT_LAYOUT_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, value);
}

function getContextProbeMetric(ctx: CanvasRenderingContext2D): number {
  try {
    return Math.round((ctx.measureText('MW0').width || 0) * 100);
  } catch {
    return 0;
  }
}

/**
 * Wraps text to fit within maxWidth, respecting newlines,
 * preserving NBSP-bound metrics (e.g., "510 GB", "10 ms"),
 * preventing orphan Latin tokens in Arabic, and applying typographic orphan prevention.
 */
export function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  rawText: string,
  maxWidth: number
): string[] {
  if (!rawText) return [];

  const cacheKey = `${ctx.font || ''}|${maxWidth}|${getContextProbeMetric(ctx)}|${rawText}`;
  const cached = wrapLinesCache.get(cacheKey);
  if (cached) {
    return [...cached];
  }

  // Protect units and metrics from being split across lines (e.g. "510 GB", "125 ms", "99.9%", "10x")
  let textWithNbsp = rawText
    .replace(/\b(\d+(?:\.\d+)?)\s+(GB\/s|MB\/s|Gbps|Mbps|GB|TB|MB|KB|ms|s|μs|ns|req|rps|qps|x|X|%|nodes|checkouts|servers|clusters|shards|cores)\b/gi, '$1\u00A0$2')
    .replace(/\b(\d+(?:\.\d+)?)\s+(مللي\s+ثانية|جيجابايت|تيرابايت|ميجابايت|مللي|ثانية|ثواني|ضعفاً|ضعف|مليون|مليار|عقدة|خادم)\b/g, (_, num, unit) => `${num}\u00A0${unit.replace(/\s+/g, '\u00A0')}`);

  // Prevent isolated Latin technical terms and 2-word English phrases (e.g. "Durable Objects") from splitting across lines in Arabic text
  if (/[\u0600-\u06FF]/.test(textWithNbsp)) {
    textWithNbsp = textWithNbsp.replace(
      /\b([A-Za-z][A-Za-z0-9_+-]*)\s+([A-Za-z][A-Za-z0-9_+-]*)\b/g,
      '$1\u00A0$2'
    );
  }
  textWithNbsp = textWithNbsp.replace(/([\u0600-\u06FF]+)\s+([A-Za-z0-9_\-]+)\b/g, '$1\u00A0$2');

  const paragraphs = textWithNbsp.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    const rawWords = para.split(' ');
    const safeWords: string[] = [];

    // Safety check: if an NBSP-bound chunk exceeds maxWidth, unbind \u00A0 back to spaces
    for (const w of rawWords) {
      if (w.includes('\u00A0') && ctx.measureText(w).width > maxWidth) {
        safeWords.push(...w.split('\u00A0'));
      } else {
        safeWords.push(w);
      }
    }

    // Secondary safety: if any single word still exceeds maxWidth, split characters so it cannot overflow canvas
    const expandedWords: string[] = [];
    for (const w of safeWords) {
      if (ctx.measureText(w).width > maxWidth) {
        let chunk = '';
        for (const char of w) {
          if (ctx.measureText(chunk + char).width > maxWidth) {
            if (chunk) expandedWords.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        if (chunk) expandedWords.push(chunk);
      } else {
        expandedWords.push(w);
      }
    }

    let currentLine = '';

    for (const word of expandedWords) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
  }

  // Typographic orphan prevention:
  // If the last line has only 1 word and the preceding line has 3+ words, reflow the last word of the preceding line
  if (lines.length >= 2) {
    const lastLine = lines[lines.length - 1].trim();
    const prevLine = lines[lines.length - 2].trim();
    const lastWords = lastLine.split(/\s+/);
    const prevWords = prevLine.split(/\s+/);

    if (lastWords.length === 1 && prevWords.length >= 3) {
      const candidateWord = prevWords[prevWords.length - 1];
      const candidateLastLine = `${candidateWord} ${lastLine}`;
      if (ctx.measureText(candidateLastLine).width <= maxWidth) {
        prevWords.pop();
        lines[lines.length - 2] = prevWords.join(' ');
        lines[lines.length - 1] = candidateLastLine;
      }
    }
  }

  setBoundedCache(wrapLinesCache, cacheKey, lines);
  return [...lines];
}

/**
 * Unicode-safe truncation with an ellipsis using binary search over code points.
 * Assumes the correct ctx.font is already active.
 */
export function truncateTextToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  ellipsis = '…',
  forceEllipsis = false
): string {
  if (!text) return '';
  if (!forceEllipsis && ctx.measureText(text).width <= maxWidth) return text;

  const chars = Array.from(text);
  const ellipsisWidth = ctx.measureText(ellipsis).width;
  if (ellipsisWidth > maxWidth) return '';

  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = chars.slice(0, mid).join('').trimEnd() + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  const prefix = chars.slice(0, low).join('').trimEnd();
  return prefix ? `${prefix}${ellipsis}` : ellipsis;
}

/**
 * Self-healing typography helper:
 * Measures text width and dynamically scales font size down (to minFontSize) or smart-wraps to maxLines,
 * ensuring pills, badges, node cards, and comparison columns never clip or overflow.
 */
export function fitTextInBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  initialFontSize: number,
  fontFamily: string,
  fontWeight: string | number = '700',
  options: FitTextOptions = {}
): { fontSize: number; lines: string[]; lineHeight: number } {
  const { maxLines = 1, minFontSize = 9, lineHeightFactor = 1.25, ellipsis = true } = options;
  if (!text) {
    return { fontSize: initialFontSize, lines: [], lineHeight: initialFontSize * lineHeightFactor };
  }

  const cleanText = text.trim();
  ctx.font = `${fontWeight} ${initialFontSize}px ${fontFamily}`;
  const probeMetric = getContextProbeMetric(ctx);
  const cacheKey = `${cleanText}|${maxWidth}|${initialFontSize}|${fontFamily}|${fontWeight}|${maxLines}|${minFontSize}|${lineHeightFactor}|${ellipsis ? 1 : 0}|${probeMetric}`;
  const cached = fitTextCache.get(cacheKey);
  if (cached) {
    ctx.font = `${fontWeight} ${cached.fontSize}px ${fontFamily}`;
    return {
      fontSize: cached.fontSize,
      lines: [...cached.lines],
      lineHeight: cached.lineHeight,
    };
  }

  let currentSize = initialFontSize;

  const hasArabicGlyphs = /[\u0600-\u06FF]/.test(cleanText);
  // Give Arabic cursive glyphs a 4% safety buffer inside maxWidth so edge overhangs never clip
  const effectiveMaxWidth = hasArabicGlyphs ? Math.floor(maxWidth * 0.96) : maxWidth;

  if (maxLines === 1) {
    while (currentSize >= minFontSize) {
      ctx.font = `${fontWeight} ${currentSize}px ${fontFamily}`;
      const width = ctx.measureText(cleanText).width;
      if (width <= effectiveMaxWidth) {
        const result = { fontSize: currentSize, lines: [cleanText], lineHeight: currentSize * lineHeightFactor };
        setBoundedCache(fitTextCache, cacheKey, result);
        return { fontSize: result.fontSize, lines: [...result.lines], lineHeight: result.lineHeight };
      }
      currentSize -= 0.5;
    }

    // Never silently clip: scale down slightly further if needed before falling back to ellipsis,
    // while strictly honoring any >= 24px readability floor.
    let emergencySize = minFontSize;
    const emergencyFloor = minFontSize >= 24 ? minFontSize : 11;
    while (emergencySize > emergencyFloor && ctx.measureText(cleanText).width > effectiveMaxWidth) {
      emergencySize -= 0.5;
      ctx.font = `${fontWeight} ${emergencySize}px ${fontFamily}`;
    }
    const finalLine =
      ctx.measureText(cleanText).width > effectiveMaxWidth && ellipsis
        ? truncateTextToWidth(ctx, cleanText, effectiveMaxWidth)
        : cleanText;
    const result = { fontSize: emergencySize, lines: [finalLine], lineHeight: emergencySize * lineHeightFactor };
    setBoundedCache(fitTextCache, cacheKey, result);
    return { fontSize: result.fontSize, lines: [...result.lines], lineHeight: result.lineHeight };
  }

  // Multi-line wrap with font-size scale down if needed
  while (currentSize >= minFontSize) {
    ctx.font = `${fontWeight} ${currentSize}px ${fontFamily}`;
    const wrapped = wrapTextLines(ctx, cleanText, effectiveMaxWidth);
    const allLinesFitWidth = wrapped.every((line) => ctx.measureText(line).width <= effectiveMaxWidth);
    if (wrapped.length <= maxLines && allLinesFitWidth) {
      const result = { fontSize: currentSize, lines: wrapped, lineHeight: currentSize * lineHeightFactor };
      setBoundedCache(fitTextCache, cacheKey, result);
      return { fontSize: result.fontSize, lines: [...result.lines], lineHeight: result.lineHeight };
    }
    currentSize -= 1;
  }

  // If still more than maxLines at minFontSize, step down only for sub-24px micro labels
  let fallbackSize = minFontSize;
  const fallbackFloor = minFontSize >= 24 ? minFontSize : 18;
  while (fallbackSize > fallbackFloor) {
    ctx.font = `${fontWeight} ${fallbackSize}px ${fontFamily}`;
    const candidateLines = wrapTextLines(ctx, cleanText, effectiveMaxWidth);
    if (
      candidateLines.length <= maxLines &&
      candidateLines.every((l) => ctx.measureText(l).width <= effectiveMaxWidth)
    ) {
      const result = {
        fontSize: fallbackSize,
        lines: candidateLines,
        lineHeight: Math.round(fallbackSize * lineHeightFactor),
      };
      setBoundedCache(fitTextCache, cacheKey, result);
      return { fontSize: result.fontSize, lines: [...result.lines], lineHeight: result.lineHeight };
    }
    fallbackSize -= 1;
  }

  // Truncate to maxLines with ellipsis on final line only as last resort
  ctx.font = `${fontWeight} ${fallbackSize}px ${fontFamily}`;
  const allLines = wrapTextLines(ctx, cleanText, effectiveMaxWidth);
  const wrapped = allLines.slice(0, maxLines);
  if (wrapped.length === maxLines && ellipsis) {
    const last = wrapped[maxLines - 1];
    wrapped[maxLines - 1] = allLines.length > maxLines
      ? truncateTextToWidth(ctx, last, effectiveMaxWidth, '…', true)
      : last;
  }

  // Hard safety: guarantee no individual line escapes effectiveMaxWidth
  for (let i = 0; i < wrapped.length; i++) {
    if (ctx.measureText(wrapped[i]).width > effectiveMaxWidth) {
      wrapped[i] = truncateTextToWidth(ctx, wrapped[i], effectiveMaxWidth, '…', true);
    }
  }

  const result = { fontSize: fallbackSize, lines: wrapped, lineHeight: Math.round(fallbackSize * lineHeightFactor) };
  setBoundedCache(fitTextCache, cacheKey, result);
  return { fontSize: result.fontSize, lines: [...result.lines], lineHeight: result.lineHeight };
}
