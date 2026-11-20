import { CarouselData, DEFAULT_PALETTES, THEME_CONFIGS, ThemePalette, VisualSystemOptions } from '../../types.ts';
import { seedSlideArchetypeData } from '../synthesis/archetypes.ts';
import { isolateEmbeddedLatinInArabic } from '../text/arabicBiDi.ts';
import { getCanvasDimensionSpec, getArchetypeGraphicTransform, isFullMemeSlide } from './constants.ts';
import { computeSlideLayoutAwareness } from './layoutAwareness.ts';
import {
  drawRoundRect,
  drawBaseBackground,
  drawRadialGlow,
  drawEngineeringGrid,
  drawCadReticles,
  drawHeader,
  drawPaginationFooter,
} from './background.ts';
import {
  drawHubSlide,
  drawRowSlide,
  drawNumberSlide,
  drawMetricSlide,
  drawCodeSlide,
  drawCompareSlide,
  drawImageSlide,
  drawCtaSlide,
  drawPosterSlide,
  drawSubjectPairSlide,
  drawVisualSlide,
  drawTakeawaysBlock,
} from './archetypes/index.ts';

/**
 * Render a single MARROK slide to an offscreen or provided canvas at the active dimension preset
 * (TikTok 9:16 1080x1920, Instagram 4:5 1080x1350, Instagram 3:4 1080x1440, Instagram 1:1 1080x1080, or IG Reels 9:16).
 * Note: Pure read-only projection of state; does not re-sanitize or mutate text during drawing.
 */
export async function renderSlideToCanvas(
  carousel: CarouselData,
  slideIndex: number,
  targetCanvas?: HTMLCanvasElement,
  customPalette?: ThemePalette,
  visualOptions?: VisualSystemOptions,
  videoElement?: HTMLVideoElement | null
): Promise<HTMLCanvasElement> {
  // Ensure custom webfonts are loaded
  if (typeof document !== 'undefined' && document.fonts) {
    await document.fonts.ready;
  }

  const spec = getCanvasDimensionSpec(carousel.dimensionPreset);
  const canvas = targetCanvas || document.createElement('canvas');
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  const rawSlide = carousel.slides[slideIndex];
  if (!rawSlide) throw new Error(`Slide at index ${slideIndex} not found`);

  // Seed archetype defaults gracefully if a field is missing
  const slide = seedSlideArchetypeData(rawSlide, rawSlide.type);
  const themeMode = carousel.theme || 'engineering';
  const theme: ThemePalette =
    customPalette ||
    DEFAULT_PALETTES[themeMode] ||
    THEME_CONFIGS[themeMode] ||
    DEFAULT_PALETTES.teal;
  const isMemeSlide =
    carousel.postFormat === 'meme' || Boolean(slide.standaloneMeme) || isFullMemeSlide(slide);
  const categoryTag = isMemeSlide
    ? ''
    : slide.cornerTag || carousel.category || (themeMode === 'security' ? 'SECURITY' : 'ARCHITECTURE');
  const totalSlides = carousel.slides.length;

  // Resolve visual system toggles
  const options: VisualSystemOptions = {
    showCadReticles: visualOptions?.showCadReticles ?? carousel.visualOptions?.showCadReticles ?? customPalette?.showCadReticles ?? true,
    showSparklines: visualOptions?.showSparklines ?? carousel.visualOptions?.showSparklines ?? customPalette?.showSparklines ?? true,
    terminalScanlines: visualOptions?.terminalScanlines ?? carousel.visualOptions?.terminalScanlines ?? customPalette?.terminalScanlines ?? true,
  };

  // 1. Solid Base Background
  drawBaseBackground(ctx, theme, spec);

  // 2. Radial Gradient Glow
  drawRadialGlow(ctx, theme, spec);

  // 3. Engineering Grid Lines
  drawEngineeringGrid(ctx, theme, spec);

  // 3b. Canvas Background CAD Reticles
  if (options.showCadReticles) {
    drawCadReticles(ctx, theme, spec);
  }

  // Pre-compute layout awareness once for the slide
  const layout = computeSlideLayoutAwareness(slide, carousel, slideIndex);

  // 4. Header: Top-Left Authentic MARROK Vector Badge + Brand Wordmark + Slide-Type Corner Tag
  if (!layout.headerBadge.hidden) {
    ctx.save();
    const hCx = layout.headerBadge.x + layout.headerBadge.width / 2;
    const hCy = layout.headerBadge.y + layout.headerBadge.height / 2;
    if (layout.headerBadge.dx !== 0 || layout.headerBadge.dy !== 0) {
      ctx.translate(layout.headerBadge.dx, layout.headerBadge.dy);
    }
    if (layout.headerBadge.scale && layout.headerBadge.scale !== 1) {
      ctx.translate(hCx, hCy);
      ctx.scale(layout.headerBadge.scale, layout.headerBadge.scale);
      ctx.translate(-hCx, -hCy);
    }
    if (layout.headerBadge.opacity !== undefined && layout.headerBadge.opacity < 1) {
      ctx.globalAlpha *= Math.max(0.1, Math.min(1, layout.headerBadge.opacity));
    }
    drawHeader(ctx, carousel, theme, categoryTag, spec);
    ctx.restore();
  }

  // 5. Render Archetype Specific Graphics & Layouts
  const graphicTransform = getArchetypeGraphicTransform(spec, slide.type, slide);
  let yGraphicEnd = graphicTransform.cardY + graphicTransform.cardH;
  const graphicOverride = slide.layoutOverrides?.graphicCard;

  if (slide.type === 'cta') {
    ctx.save();
    yGraphicEnd = await drawCtaSlide(ctx, slide, carousel, theme, options, themeMode);
    ctx.restore();
  } else if (!layout.graphicCard?.hidden) {
    ctx.save();
    const cx = isMemeSlide ? graphicTransform.cardX + graphicTransform.cardW / 2 : spec.safeTextCenterX;
    const cy = graphicTransform.cardY + graphicTransform.cardH / 2;
    const cardShiftX = layout.graphicCard ? layout.graphicCard.dx : graphicOverride?.dx || 0;
    const cardShiftY = layout.graphicCard
      ? layout.graphicCard.y - graphicTransform.cardY
      : graphicOverride?.dy || 0;
    const cardScale = layout.graphicCard?.scale ?? graphicOverride?.scale ?? 1;

    if (cardShiftX !== 0 || cardShiftY !== 0 || cardScale !== 1) {
      ctx.translate(cx + cardShiftX, cy + cardShiftY);
      ctx.scale(cardScale, cardScale);
      ctx.translate(-cx, -cy);
    }
    if (graphicOverride?.opacity !== undefined) {
      ctx.globalAlpha *= Math.max(0.1, Math.min(1, graphicOverride.opacity));
    }

    if (
      graphicTransform.scale !== 1 ||
      graphicTransform.translateX !== 0 ||
      graphicTransform.translateY !== 0
    ) {
      ctx.translate(graphicTransform.translateX, graphicTransform.translateY);
      ctx.scale(graphicTransform.scale, graphicTransform.scale);
    }

    let rawGraphicEnd = 670;
    if (slide.type === 'hub') {
      rawGraphicEnd = await drawHubSlide(ctx, slide, theme, options);
    } else if (slide.type === 'row') {
      rawGraphicEnd = await drawRowSlide(ctx, slide, theme, options, slideIndex);
    } else if (slide.type === 'number') {
      rawGraphicEnd = await drawNumberSlide(ctx, slide, theme, options, slideIndex);
    } else if (slide.type === 'metric') {
      rawGraphicEnd = await drawMetricSlide(ctx, slide, theme, options);
    } else if (slide.type === 'code') {
      rawGraphicEnd = await drawCodeSlide(ctx, slide, theme, options);
    } else if (slide.type === 'compare') {
      rawGraphicEnd = await drawCompareSlide(ctx, slide, theme, options);
    } else if (slide.type === 'image') {
      rawGraphicEnd = await drawImageSlide(ctx, slide, theme, options, carousel.brand || 'MARROK', videoElement, spec);
    } else if (slide.type === 'poster') {
      rawGraphicEnd = await drawPosterSlide(ctx, slide, theme, options, carousel.brand || 'MARROK', videoElement, spec);
    } else if (slide.type === 'subjectPair') {
      rawGraphicEnd = await drawSubjectPairSlide(ctx, slide, theme, options, spec);
    } else if (slide.type === 'visual') {
      rawGraphicEnd = await drawVisualSlide(ctx, slide, theme, options, slideIndex);
    }
    yGraphicEnd = Math.round(rawGraphicEnd * graphicTransform.scale + graphicTransform.translateY);
    ctx.restore();
  }

  // 6. Non-Overlapping Layout-Aware Text Rendering (for hub, row, number, metric, code, compare, image, poster)
  if (slide.type !== 'cta') {
    const graphicBottom =
      layout.graphicCard && !layout.graphicCard.hidden ? layout.graphicCard.effectiveBottom : yGraphicEnd;
    const ceilingY =
      layout.swipeCueBox && !layout.swipeCueBox.hidden
        ? Math.min(spec.safeFooterCeilingY, layout.swipeCueBox.y - 10)
        : spec.safeFooterCeilingY;

    const minTextTop = Math.min(
      layout.titleBlock && !layout.titleBlock.hidden ? layout.titleBlock.top : ceilingY,
      layout.arabicTitleBlock && !layout.arabicTitleBlock.hidden ? layout.arabicTitleBlock.top : ceilingY,
      layout.coverTeaserBlock && !layout.coverTeaserBlock.hidden ? layout.coverTeaserBlock.top : ceilingY,
      layout.arabicCoverTeaserBlock && !layout.arabicCoverTeaserBlock.hidden ? layout.arabicCoverTeaserBlock.top : ceilingY,
      layout.bodyBlock && !layout.bodyBlock.hidden ? layout.bodyBlock.top : ceilingY,
      layout.arabicBodyBlock && !layout.arabicBodyBlock.hidden ? layout.arabicBodyBlock.top : ceilingY,
      graphicBottom
    );
    const clipTop = Math.max(spec.headerY, minTextTop - 52);

    const resolveAlignX = (align: 'left' | 'center' | 'right' = 'center', dx: number = 0) => {
      if (align === 'left') return { x: spec.safeMarginLeft + dx, textAlign: 'left' as CanvasTextAlign };
      if (align === 'right') return { x: spec.safeMarginRight + dx, textAlign: 'right' as CanvasTextAlign };
      return { x: spec.safeTextCenterX + dx, textAlign: 'center' as CanvasTextAlign };
    };

    ctx.save();
    ctx.beginPath();
    // Use generous horizontal bounds (24px margin) so Arabic cursive overhangs on Slide 1 never get clipped at the edge
    ctx.rect(
      24,
      clipTop,
      spec.width - 48,
      Math.max(0, ceilingY - clipTop + 2)
    );
    ctx.clip();

    // 6b. Render Viral Hook Kicker Badge above English Headline at >=24px (when present and clearance permits)
    const rawKicker = (slide.hookKicker || '').trim();
    if (rawKicker && layout.titleBlock && !layout.titleBlock.hidden && layout.titleBlock.lines.length > 0) {
      const tb = layout.titleBlock;
      const kickerFontSize = spec.height < 1920 ? 20 : 24;
      const kickerPillH = spec.height < 1920 ? 32 : 38;
      const kickerBottomY = tb.top - (spec.height < 1920 ? 8 : 10);
      const kickerTopY = kickerBottomY - kickerPillH;
      const headerClearFloor = layout.headerBadge.hidden
        ? spec.headerY
        : layout.headerBadge.y + layout.headerBadge.height + 4;
      const minAllowedKickerTop =
        layout.compositionPreset === 'headline-first'
          ? headerClearFloor
          : graphicBottom + 4;

      if (kickerTopY >= minAllowedKickerTop) {
        const { x, textAlign } = resolveAlignX(tb.align, tb.dx);
        const kickerText = `◆ ${rawKicker.toUpperCase().slice(0, 34)}`;
        ctx.save();
        if (tb.opacity !== undefined && tb.opacity < 1) {
          ctx.globalAlpha *= Math.max(0.1, Math.min(1, tb.opacity));
        }
        ctx.font = `700 ${kickerFontSize}px "JetBrains Mono", monospace`;
        const textW = ctx.measureText(kickerText).width;
        const padX = 16;
        const pillW = Math.min(spec.safeContentWidth, textW + padX * 2);
        const pillX =
          textAlign === 'left'
            ? x
            : textAlign === 'right'
            ? x - pillW
            : x - pillW / 2;

        ctx.fillStyle = `${theme.accent}18`;
        ctx.strokeStyle = `${theme.accent}66`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(pillX, kickerTopY, pillW, kickerPillH, 8);
        } else {
          ctx.rect(pillX, kickerTopY, pillW, kickerPillH);
        }
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = theme.accent;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(kickerText, pillX + pillW / 2, kickerTopY + kickerPillH / 2 + 1);
        ctx.restore();
      }
    }

    // 6c. Render English Headline with Inline Metric & Third-Party Brand Text Highlighting
    if (layout.titleBlock && !layout.titleBlock.hidden && layout.titleBlock.lines.length > 0) {
      const tb = layout.titleBlock;
      const { x, textAlign } = resolveAlignX(tb.align, tb.dx);
      ctx.save();
      if (tb.opacity !== undefined && tb.opacity < 1) {
        ctx.globalAlpha *= Math.max(0.1, Math.min(1, tb.opacity));
      }
      ctx.font = `800 ${tb.fontSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.textBaseline = 'alphabetic';
      let lineY = tb.firstBaselineY;
      for (const line of tb.lines) {
        if (lineY + tb.lineHeight * 0.25 > ceilingY) break;
        drawHeadlineLineWithAccentHighlights(ctx, line, x, lineY, textAlign, theme);
        lineY += tb.lineHeight;
      }
      ctx.restore();
    }

    // 6d. Render Arabic Headline (equal font size & weight 800, with Unicode LRI BiDi isolation for embedded English tokens)
    if (layout.arabicTitleBlock && !layout.arabicTitleBlock.hidden && layout.arabicTitleBlock.lines.length > 0) {
      const atb = layout.arabicTitleBlock;
      const { x, textAlign } = resolveAlignX(atb.align, atb.dx);
      ctx.save();
      if (atb.opacity !== undefined && atb.opacity < 1) {
        ctx.globalAlpha *= Math.max(0.1, Math.min(1, atb.opacity));
      }
      ctx.font = `800 ${atb.fontSize}px "Cairo", sans-serif`;
      ctx.fillStyle = theme.accent;
      ctx.textAlign = textAlign;
      ctx.direction = 'rtl';
      ctx.textBaseline = 'alphabetic';
      let lineY = atb.firstBaselineY;
      for (const line of atb.lines) {
        if (lineY + atb.lineHeight * 0.25 > ceilingY) break;
        ctx.fillText(isolateEmbeddedLatinInArabic(line), x, lineY);
        lineY += atb.lineHeight;
      }
      ctx.restore();
    }

    // 6d-bis. Render Slide 1 Cover One-Line Context Teasers (English + Arabic)
    if (layout.coverTeaserBlock && !layout.coverTeaserBlock.hidden && layout.coverTeaserBlock.lines.length > 0) {
      const etb = layout.coverTeaserBlock;
      const { x, textAlign } = resolveAlignX(etb.align, etb.dx);
      ctx.save();
      if (etb.opacity !== undefined && etb.opacity < 1) {
        ctx.globalAlpha *= Math.max(0.1, Math.min(1, etb.opacity));
      }
      ctx.font = `500 ${etb.fontSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = theme.textEnBody;
      ctx.textAlign = textAlign;
      ctx.direction = 'ltr';
      ctx.textBaseline = 'alphabetic';
      let lineY = etb.firstBaselineY;
      for (const line of etb.lines) {
        if (lineY + etb.lineHeight * 0.25 > ceilingY) break;
        ctx.fillText(line, x, lineY);
        lineY += etb.lineHeight;
      }
      ctx.restore();
    }

    if (layout.arabicCoverTeaserBlock && !layout.arabicCoverTeaserBlock.hidden && layout.arabicCoverTeaserBlock.lines.length > 0) {
      const atb = layout.arabicCoverTeaserBlock;
      const { x, textAlign } = resolveAlignX(atb.align, atb.dx);
      ctx.save();
      if (atb.opacity !== undefined && atb.opacity < 1) {
        ctx.globalAlpha *= Math.max(0.1, Math.min(1, atb.opacity));
      }
      ctx.font = `500 ${atb.fontSize}px "Cairo", sans-serif`;
      ctx.fillStyle = theme.textArBody;
      ctx.textAlign = textAlign;
      ctx.direction = 'rtl';
      ctx.textBaseline = 'alphabetic';
      let lineY = atb.firstBaselineY;
      for (const line of atb.lines) {
        if (lineY + atb.lineHeight * 0.25 > ceilingY) break;
        ctx.fillText(isolateEmbeddedLatinInArabic(line), x, lineY);
        lineY += atb.lineHeight;
      }
      ctx.restore();
    }

    // 6e. Render English Body Copy (equal weight 500 to Arabic body)
    if (layout.bodyBlock && !layout.bodyBlock.hidden && layout.bodyBlock.lines.length > 0) {
      const bb = layout.bodyBlock;
      const { x, textAlign } = resolveAlignX(bb.align, bb.dx);
      ctx.save();
      if (bb.opacity !== undefined && bb.opacity < 1) {
        ctx.globalAlpha *= Math.max(0.1, Math.min(1, bb.opacity));
      }
      ctx.font = `500 ${bb.fontSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = theme.textEnBody;
      ctx.textAlign = textAlign;
      ctx.direction = 'ltr';
      ctx.textBaseline = 'alphabetic';
      let lineY = bb.firstBaselineY;
      for (const line of bb.lines) {
        if (lineY + bb.lineHeight * 0.25 > ceilingY) break;
        ctx.fillText(line, x, lineY);
        lineY += bb.lineHeight;
      }
      ctx.restore();
    }

    // 6f. Render Arabic Body Copy (equal weight 500 to English body, with Unicode LRI BiDi isolation)
    if (layout.arabicBodyBlock && !layout.arabicBodyBlock.hidden && layout.arabicBodyBlock.lines.length > 0) {
      const abb = layout.arabicBodyBlock;
      const { x, textAlign } = resolveAlignX(abb.align, abb.dx);
      ctx.save();
      if (abb.opacity !== undefined && abb.opacity < 1) {
        ctx.globalAlpha *= Math.max(0.1, Math.min(1, abb.opacity));
      }
      ctx.font = `500 ${abb.fontSize}px "Cairo", sans-serif`;
      ctx.fillStyle = theme.textArBody;
      ctx.textAlign = textAlign;
      ctx.direction = 'rtl';
      ctx.textBaseline = 'alphabetic';
      let lineY = abb.firstBaselineY;
      for (const line of abb.lines) {
        if (lineY + abb.lineHeight * 0.25 > ceilingY) break;
        ctx.fillText(isolateEmbeddedLatinInArabic(line), x, lineY);
        lineY += abb.lineHeight;
      }
      ctx.restore();
    }

    ctx.restore();

    // 6g. Render Key Takeaways Block (Single-slide Infographic Posters & Enriched Slides)
    if (
      layout.takeawaysBlock &&
      !layout.takeawaysBlock.hidden &&
      slide.takeaways &&
      slide.takeaways.length > 0
    ) {
      ctx.save();
      if (layout.takeawaysBlock.opacity !== undefined && layout.takeawaysBlock.opacity < 1) {
        ctx.globalAlpha *= Math.max(0.1, Math.min(1, layout.takeawaysBlock.opacity));
      }
      await drawTakeawaysBlock(ctx, slide.takeaways, theme, layout.takeawaysBlock, options);
      ctx.restore();
    }

    // 6h. Render Slide 1 Bottom Swipe Prompt Pill cleanly above safe footer
    if (layout.swipeCueBox && !layout.swipeCueBox.hidden) {
      const box = layout.swipeCueBox;
      const hasArabic = /[\u0600-\u06FF]/.test(box.text);
      const pillLabel = hasArabic ? `← ${box.text}` : `${box.text} →`;
      const fontFamily = hasArabic ? '"Cairo", sans-serif' : '"Plus Jakarta Sans", sans-serif';
      ctx.save();
      ctx.font = `700 ${box.fontSize}px ${fontFamily}`;
      const measuredTextW = typeof ctx.measureText === 'function' ? ctx.measureText(pillLabel).width : 0;
      const pillW = Math.min(spec.safeContentWidth, Math.max(box.width, Math.round(measuredTextW + 56)));
      const pillX = Math.round(spec.safeTextCenterX - pillW / 2);
      drawRoundRect(
        ctx,
        pillX,
        box.y,
        pillW,
        box.height,
        Math.round(box.height / 2),
        `${theme.accent}1A`,
        `${theme.accent}80`,
        1.5
      );
      ctx.fillStyle = theme.textWhite;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pillLabel, spec.safeTextCenterX, box.y + box.height / 2 + 1);
      ctx.restore();
    }
  }

  // 7. Safe-Zone Source & Brand Footer (above TikTok bottom 420px UI zone)
  drawPaginationFooter(ctx, slideIndex, totalSlides, theme, carousel, slide, spec);

  return canvas;
}

const KEY_TECH_HIGHLIGHT_TERMS = new Set([
  'discord', 'anthropic', 'github', 'netflix', 'stripe', 'uber', 'meta', 'google', 'aws', 'apple', 'microsoft',
  'ebpf', 'grpc', 'mtls', 'tls', 'hnsw', 'ivf', 'raft', 'paxos', 'quic', 'http/3', 'rdma', 'nvme',
  'simd', 'avx-512', 'wasm', 'webassembly', 'rust', 'zig', 'golang', 'scylladb', 'clickhouse',
  'postgresql', 'postgres', 'pgvector', 'redis', 'valkey', 'kafka', 'kubernetes', 'k8s', 'docker',
  'cloudflare', 'openai', 'deepseek', 'claude', 'gemini', 'llama', 'vllm', 'tensorrt', 'cuda',
  'triton', 'moa', 'mole', 'rag', 'lora', 'qlora', 'fp8', 'int4', 'int8', 'bf16', 'kv-cache',
  'zero-trust', 'zero-day', 'cve', 'oauth', 'passkeys', 'post-quantum', 'kyber', 'dilithium',
]);

function isHighlightableHeadlineToken(rawToken: string, isAllCapsLine: boolean): boolean {
  const clean = rawToken.replace(/^[^A-Za-z0-9$+-]+|[^A-Za-z0-9%+-]+$/g, '');
  if (!clean || clean.length < 2) return false;

  // 1. Hard numbers, currencies, percentages, multipliers, latencies, byte units
  if (
    /^(?:\$\d[\d,.]*[KMBTkmbt]?|\d[\d,.]*(?:%|x|X|ms|µs|ns|s|KB|MB|GB|TB|PB|B|M|T|K|GW|MW|Gbps|Mbps|RPS|QPS|fps)?|v\d+(?:\.\d+)*)$/i.test(
      clean
    ) &&
    /\d/.test(clean)
  ) {
    return true;
  }

  // 2. Known high-signal systems/AI terms
  if (KEY_TECH_HIGHLIGHT_TERMS.has(clean.toLowerCase())) {
    return true;
  }

  // 3. Technical acronyms (e.g. MOLE, HNSW, S3, L4, L7, P99, CVE-2026) when line itself isn't all caps
  if (!isAllCapsLine && /^[A-Z]{2,6}(?:-[A-Z0-9]+)?$/.test(clean)) {
    const commonStop = new Set(['THE', 'AND', 'FOR', 'WITH', 'FROM', 'INTO', 'WHY', 'HOW', 'NOT', 'ARE', 'WAS', 'CAN', 'ALL', 'NEW']);
    if (!commonStop.has(clean)) return true;
  }

  return false;
}

/**
 * Renders a single line of an English headline with inline accent highlighting
 * for metrics ($301,300, 93.3%, 4KB, 15ms, 10x) and key technical terms (MOLE, eBPF, HNSW, Rust).
 */
function drawHeadlineLineWithAccentHighlights(
  ctx: CanvasRenderingContext2D,
  line: string,
  anchorX: number,
  baselineY: number,
  textAlign: CanvasTextAlign,
  theme: ThemePalette
) {
  const tokens = line.split(/(\s+)/).filter((t) => t.length > 0);
  const alphaLetters = line.replace(/[^A-Za-z]/g, '');
  const isAllCapsLine = alphaLetters.length > 3 && alphaLetters === alphaLetters.toUpperCase();

  let highlightCount = 0;
  const tokenFlags = tokens.map((tok) => {
    if (/^\s+$/.test(tok)) return false;
    if (highlightCount >= 3) return false;
    const match = isHighlightableHeadlineToken(tok, isAllCapsLine);
    if (match) highlightCount++;
    return match;
  });

  // Fast path if no tokens need highlighting or if ctx lacks measurement support
  if (highlightCount === 0 || typeof ctx.measureText !== 'function') {
    ctx.fillStyle = theme.textWhite;
    ctx.textAlign = textAlign;
    ctx.fillText(line, anchorX, baselineY);
    return;
  }

  const totalWidth = ctx.measureText(line).width;
  if (!totalWidth || totalWidth <= 0) {
    ctx.fillStyle = theme.textWhite;
    ctx.textAlign = textAlign;
    ctx.fillText(line, anchorX, baselineY);
    return;
  }

  let cursorX =
    textAlign === 'left'
      ? anchorX
      : textAlign === 'right'
      ? anchorX - totalWidth
      : anchorX - totalWidth / 2;

  ctx.textAlign = 'left';
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    ctx.fillStyle = tokenFlags[i] ? theme.accent : theme.textWhite;
    ctx.fillText(tok, cursorX, baselineY);
    cursorX += ctx.measureText(tok).width;
  }
}


