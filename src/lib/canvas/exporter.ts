import {
  CanvasDimensionPreset,
  CarouselData,
  DEFAULT_PALETTES,
  ThemePalette,
  VisualSystemOptions,
} from '../../types.ts';
import { CANVAS_DIMENSION_PRESET_LIST, getCanvasDimensionSpec } from './constants.ts';
import { renderSlideToCanvas } from './renderSlide.ts';

export type ExportBundleMode = 'active' | 'dual' | 'all' | CanvasDimensionPreset;

export function getPresetExportFolderName(preset: CanvasDimensionPreset): string {
  switch (preset) {
    case 'tiktok-9:16':
      return 'tiktok-9x16';
    case 'ig-4:5':
      return 'instagram-4x5';
    case 'ig-3:4':
      return 'instagram-3x4';
    case 'ig-1:1':
      return 'instagram-1x1';
    case 'ig-9:16':
      return 'instagram-reels-9x16';
    default:
      return 'tiktok-9x16';
  }
}

export function resolveExportTargetPresets(
  exportMode: ExportBundleMode,
  activePreset?: CanvasDimensionPreset
): CanvasDimensionPreset[] {
  const primary = getCanvasDimensionSpec(activePreset).id;
  if (exportMode === 'all') {
    const ordered: CanvasDimensionPreset[] = [primary];
    for (const spec of CANVAS_DIMENSION_PRESET_LIST) {
      if (!ordered.includes(spec.id)) ordered.push(spec.id);
    }
    return ordered;
  }
  if (exportMode === 'dual') {
    const secondary: CanvasDimensionPreset = primary === 'ig-4:5' ? 'tiktok-9:16' : 'ig-4:5';
    return [primary, secondary];
  }
  if (exportMode === 'active') {
    return [primary];
  }
  return [getCanvasDimensionSpec(exportMode).id];
}

/**
 * Direct Browser Copy: Copy slide image directly to system clipboard at active dimension preset
 */
export async function copySlideToClipboard(
  carousel: CarouselData,
  slideIndex: number,
  customPalette?: ThemePalette,
  visualOptions?: VisualSystemOptions
): Promise<void> {
  const canvas = await renderSlideToCanvas(carousel, slideIndex, undefined, customPalette, visualOptions);

  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Failed to create PNG blob from canvas'));
        return;
      }
      try {
        if (navigator.clipboard && typeof (window as any).ClipboardItem !== 'undefined') {
          const item = new (window as any).ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          resolve();
        } else {
          // Fallback: download if clipboard API image/png not permitted
          downloadSingleSlidePng(carousel, slideIndex, undefined, customPalette, visualOptions);
          resolve();
        }
      } catch (err) {
        console.warn('Clipboard write failed, triggering single download fallback:', err);
        downloadSingleSlidePng(carousel, slideIndex, undefined, customPalette, visualOptions);
        resolve();
      }
    }, 'image/png');
  });
}

/**
 * Web Share API: Share slide image directly on mobile (TikTok, Instagram, WhatsApp, etc.)
 */
export async function shareSlide(
  carousel: CarouselData,
  slideIndex: number,
  customPalette?: ThemePalette,
  visualOptions?: VisualSystemOptions
): Promise<boolean> {
  const canvas = await renderSlideToCanvas(carousel, slideIndex, undefined, customPalette, visualOptions);

  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      try {
        const file = new File([blob], `MARROK_Slide_${slideIndex + 1}.jpg`, { type: 'image/jpeg' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `MARROK Slide ${slideIndex + 1}`,
            text: carousel.caption.substring(0, 100),
          });
          resolve(true);
        } else {
          resolve(false);
        }
      } catch (err) {
        console.warn('Web Share failed:', err);
        resolve(false);
      }
    }, 'image/jpeg', 0.95);
  });
}

/**
 * Trigger immediate download of single slide as JPG at active or overridden dimension preset
 */
export async function downloadSingleSlidePng(
  carousel: CarouselData,
  slideIndex: number,
  filename?: string,
  customPalette?: ThemePalette,
  visualOptions?: VisualSystemOptions,
  dimensionPresetOverride?: CanvasDimensionPreset
): Promise<void> {
  const targetCarousel: CarouselData = dimensionPresetOverride
    ? { ...carousel, dimensionPreset: dimensionPresetOverride }
    : carousel;
  const spec = getCanvasDimensionSpec(targetCarousel.dimensionPreset);
  const canvas = await renderSlideToCanvas(targetCarousel, slideIndex, undefined, customPalette, visualOptions);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download =
    filename ||
    `MARROK_Slide_${slideIndex + 1}_${spec.shortLabel.replace(/[^a-zA-Z0-9]/g, '_')}_${spec.width}x${spec.height}_${carousel.theme}.jpg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 1-click Download All Slides as ZIP containing high-resolution JPGs
 * Spec §9.8: Complete Metricool bundle for TikTok & Instagram across active, dual, or all 5 social media formats.
 * Yields via microtask setTimeout(0) between slide renders so the browser UI never freezes.
 */
export interface ExportOverrideAudit {
  isOverridden: boolean;
  reviewedDraftConfirmation?: boolean;
  confirmedRisk?: string | null;
  overriddenAt?: string | null;
}

export async function downloadAllSlidesZip(
  carousel: CarouselData,
  customPalette?: ThemePalette,
  onProgress?: (current: number, total: number) => void,
  visualOptions?: VisualSystemOptions,
  overrideAudit?: ExportOverrideAudit,
  exportMode: ExportBundleMode = 'all'
): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const total = carousel.slides.length;
  const targetPresets = resolveExportTargetPresets(exportMode, carousel.dimensionPreset);
  const primarySpec = getCanvasDimensionSpec(targetPresets[0]);
  const totalSteps = total * targetPresets.length;
  let stepCounter = 0;

  // Spec §18 Complete Deliverables: Caption, Pinned First Comment, Short Caption, Metadata, and Claims Citations
  // 1. Formatted Bilingual Caption
  let fullCaptionText = carousel.caption || '';
  if (carousel.facts && carousel.facts.length > 0 && !fullCaptionText.includes('Verified Facts:')) {
    const factsBlock = carousel.facts
      .map(
        (f) =>
          `• [${f.verified.toUpperCase()}] ${f.text}${f.sourceTitle ? ` (Ref: ${f.sourceTitle})` : ''}${f.sourceUrl ? `\n  Link: ${f.sourceUrl}` : ''}`
      )
      .join('\n');
    fullCaptionText += `\n\n═════════════════════════════════════\n🔍 Verified Claims & Citations:\n${factsBlock}`;
  }
  const cleanCaptionTxt = fullCaptionText.replace(/\u00A0/g, ' ');
  zip.file('caption.txt', cleanCaptionTxt);

  // ── Metricool & Ready-to-Share Publishing Bundle ──
  const mainCaption = carousel.captionVariants?.[0]?.caption || carousel.caption || '';
  const ctaLine = carousel.slides[carousel.slides.length - 1]?.ctaText || 'DM us  •  رسالة خاصة';
  const screenHookText = carousel.screenHook || carousel.hookVariants?.[0]?.enTitle || carousel.slides[0]?.enTitle || '';

  let metricoolCaption = '';
  if (screenHookText) {
    metricoolCaption += `🎯 ${screenHookText}\n\n`;
  }
  metricoolCaption += mainCaption;

  if (!metricoolCaption.includes('marrok.org') && !metricoolCaption.includes('Reference & Source')) {
    metricoolCaption += `\n\n═════════════════════════════════════\n🎬 MARROK Technical Studio // Verified Engineering Breakdown\n🔗 Reference & Source: https://${carousel.brandUrl || 'marrok.org'}\n💬 Action: [ ${ctaLine} ]\n`;
  }

  if (!metricoolCaption.includes('#')) {
    metricoolCaption += `\n#SoftwareEngineering #SystemDesign #DevOps #MARROK #TechInArabic`;
  }

  const cleanBilingualCaption = metricoolCaption.replace(/\u00A0/g, ' ').trim();
  zip.file('caption-bilingual.txt', cleanBilingualCaption);

  for (let pIdx = 0; pIdx < targetPresets.length; pIdx++) {
    const presetId = targetPresets[pIdx];
    const presetSpec = getCanvasDimensionSpec(presetId);
    const folderName = getPresetExportFolderName(presetId);
    const presetCarousel: CarouselData = {
      ...carousel,
      dimensionPreset: presetId,
    };

    for (let i = 0; i < total; i++) {
      stepCounter += 1;
      if (onProgress) onProgress(stepCounter, totalSteps);
      // Microtask yielding to keep browser UI responsive and allow progress re-renders
      await new Promise((resolve) => setTimeout(resolve, 0));

      const canvas = await renderSlideToCanvas(presetCarousel, i, undefined, customPalette, visualOptions);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      if (blob) {
        if (pIdx === 0) {
          zip.file(`slide${i + 1}.jpg`, blob);
        }
        if (targetPresets.length > 1 || exportMode !== 'active') {
          zip.file(`${folderName}/slide${i + 1}.jpg`, blob);
        }
      }
    }

    // Make each social format folder 100% self-contained and ready to share
    if (targetPresets.length > 1 || exportMode !== 'active') {
      const platformHashtags =
        presetSpec.platform === 'instagram'
          ? '#InstagramReels #InstagramCarousel #SystemDesign #SoftwareEngineering #MARROK #TechInArabic'
          : '#TikTokTech #TikTokPhotoMode #SystemDesign #SoftwareEngineering #MARROK #TechInArabic';
      const folderCaption = `${cleanBilingualCaption}\n${platformHashtags}`;
      zip.file(`${folderName}/caption-ready-to-share.txt`, folderCaption);
      if (carousel.firstComment) {
        zip.file(`${folderName}/first_comment.txt`, carousel.firstComment.replace(/\u00A0/g, ' '));
      }
    }
  }

  const exportedFormatsSummary = targetPresets.map((pid) => {
    const s = getCanvasDimensionSpec(pid);
    return {
      preset: s.id,
      label: s.label,
      shortLabel: s.shortLabel,
      platform: s.platform,
      width: s.width,
      height: s.height,
      aspectRatio: s.aspectRatioLabel,
      folder: getPresetExportFolderName(s.id),
    };
  });

  // 2. Serialized CarouselData + active theme and visualOptions
  const carouselManifest = {
    ...carousel,
    dimensionPreset: primarySpec.id,
    exportedSocialFormats: exportedFormatsSummary,
    activePalette: customPalette || DEFAULT_PALETTES[carousel.theme] || null,
    visualOptions: visualOptions || carousel.visualOptions || {
      showCadReticles: true,
      showSparklines: true,
      terminalScanlines: true,
    },
    exportedAt: new Date().toISOString(),
    generator: 'MARROK Content Studio',
    targetPlatform:
      exportMode === 'all'
        ? 'All Social Media Formats (TikTok 9:16 + IG 4:5 + IG 3:4 + IG 1:1 + IG Reels 9:16)'
        : exportMode === 'dual'
        ? 'Metricool Dual Pack (TikTok 9:16 + Instagram 4:5)'
        : `Metricool / ${primarySpec.label}`,
    format: `${primarySpec.width}x${primarySpec.height} JPG (${primarySpec.aspectRatioLabel} Safe-Zone Compliant)`,
    totalSlides: total,
    slideFiles: Array.from({ length: total }, (_, i) => `slide${i + 1}.jpg`),
  };
  const manifestJson = JSON.stringify(carouselManifest, null, 2);
  zip.file('carousel-manifest.json', manifestJson);

  // 3. Separate dedicated claims & citations verification file
  if (carousel.facts && carousel.facts.length > 0) {
    const claimsReport = `MARROK VERIFIED CLAIMS & GROUNDING REPORT
══════════════════════════════════════════════
Topic: ${carousel.category}
Brand/Source: ${carousel.brand || 'Engineering Source'} (${carousel.brandUrl || 'marrok.org'})
Search Grounded: ${carousel.sourceMeta?.isSearchGrounded ? 'YES (Google Search Grounding)' : 'Synthesizer Intelligence'}
Generated: ${new Date().toISOString()}

EXTRACTED & VERIFIED CLAIMS:
${carousel.facts
  .map(
    (f, idx) =>
      `[#${idx + 1}] ${f.type.toUpperCase()} · Status: ${f.verified.toUpperCase()}
Claim: ${f.text}
Evidence: ${f.evidence || 'Attributed to source documentation'}
${f.sourceTitle ? `Source: ${f.sourceTitle}` : ''}
${f.sourceUrl ? `URL: ${f.sourceUrl}` : ''}
`
  )
  .join('\n')}

GROUNDING QUERIES EXECUTED:
${(carousel.sourceMeta?.groundingQueries || []).map((q) => `• ${q}`).join('\n') || '• Direct contextual extraction'}

AUTHORITATIVE SOURCES & DOCUMENTATION:
${(carousel.sourceMeta?.groundingSources || []).map((s) => `• ${s.title}: ${s.url}`).join('\n') || `• https://${carousel.brandUrl || 'marrok.org'}`}
`;
    zip.file('claims_citations.txt', claimsReport.replace(/\u00A0/g, ' '));
  }

  if (carousel.firstComment) {
    zip.file('first_comment.txt', carousel.firstComment.replace(/\u00A0/g, ' '));
  }
  if (carousel.shortCaption) {
    zip.file('short_caption.txt', carousel.shortCaption.replace(/\u00A0/g, ' '));
  }

  // Structured Post Metadata JSON
  const metadata = {
    exportedAt: new Date().toISOString(),
    generator: 'MARROK Content Studio',
    category: carousel.category,
    theme: carousel.theme,
    dimensionPreset: primarySpec.id,
    dimensions: { width: primarySpec.width, height: primarySpec.height, aspectRatio: primarySpec.aspectRatioLabel },
    exportMode,
    exportedSocialFormats: exportedFormatsSummary,
    totalSlides: carousel.slides.length,
    brand: carousel.brand,
    brandUrl: carousel.brandUrl,
    scheduleSlot: carousel.scheduleSlot,
    sourceMeta: carousel.sourceMeta,
    facts: carousel.facts || [],
    notesForHuman: carousel.notesForHuman || [],
    archetypes: carousel.slides.map((s, idx) => ({ slide: idx + 1, type: s.type, enTitle: s.enTitle, arTitle: s.arTitle })),
    caption: carousel.caption,
    firstComment: carousel.firstComment,
    screenHook: carousel.screenHook,
    captionVariants: carousel.captionVariants || [],
    hookVariants: carousel.hookVariants || [],
    format: `${primarySpec.width}x${primarySpec.height} JPG (${primarySpec.aspectRatioLabel})`,
    overrideAudit: overrideAudit || {
      isOverridden: false,
      reviewedDraftConfirmation: false,
      confirmedRisk: null,
      overriddenAt: null,
    },
  };
  zip.file('post_metadata.json', JSON.stringify(metadata, null, 2));

  const folderLines =
    targetPresets.length > 1 || exportMode !== 'active'
      ? exportedFormatsSummary
          .map(
            (f) =>
              `- ${f.folder}/slide1.jpg..slide${total}.jpg (${f.width}x${f.height} ${f.label})`
          )
          .join('\n') + '\n'
      : '';

  // Quick Creator Publishing Guide
  const readme = `MARROK CONTENT STUDIO · TIKTOK, INSTAGRAM & METRICOOL PUBLISHING BUNDLE
=======================================================================
Deck: ${carousel.category} (${carousel.slides.length} slides)
Theme: ${carousel.theme}
Dimension Preset: ${
    exportMode === 'all'
      ? 'All 5 Social Media Formats (TikTok 9:16, IG 4:5, IG 3:4, IG 1:1, IG Reels 9:16)'
      : exportMode === 'dual'
      ? `${primarySpec.label} + Dual Pack (TikTok 9:16 & Instagram 4:5)`
      : primarySpec.label
  }
Search Grounded: ${carousel.sourceMeta?.isSearchGrounded ? 'YES (Google Search)' : 'Autonomous Synthesizer'}
Created: ${new Date().toLocaleString()}

FILES IN THIS METRICOOL PACKAGE:
- slide1.jpg to slide${total}.jpg (${primarySpec.width}x${primarySpec.height} ${primarySpec.aspectRatioLabel} high-res JPGs, Safe-Zone compliant)
${folderLines}- caption-bilingual.txt (Metricool ready bilingual copy with hook, CTA, and hashtags)
- carousel-manifest.json (Complete serialized CarouselData schema for archiving and re-import)
- caption.txt (Bilingual post caption with hashtags and verification block)
- claims_citations.txt (Audit log of all verified numbers, benchmarks, and source links)
- first_comment.txt (Pinned first comment to drive engagement and save rate)
- short_caption.txt (Clean 2-line version for quick post)
- post_metadata.json (Machine-readable post schema with grounding metadata)

HOW TO PUBLISH TO METRICOOL / TIKTOK / INSTAGRAM:
1. Open Metricool -> New Post -> Select TikTok / Instagram.
2. Drag and drop slide1.jpg through slide${total}.jpg (or select from any social format folder).
3. Open 'caption-bilingual.txt', copy all and paste into post caption.
4. Schedule or publish immediately!
`;
  zip.file('README.txt', readme);

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  const suffix =
    exportMode === 'all'
      ? 'AllSocialFormats'
      : exportMode === 'dual'
      ? 'DualPack'
      : primarySpec.shortLabel.replace(/[^a-zA-Z0-9]/g, '_');
  a.download = `MARROK_${carousel.category.replace(/[^a-zA-Z0-9]/g, '_')}_${suffix}_Carousel.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Spec §10: Contact Sheet Generator for Visual QA
 * Renders all slides tiled in a grid onto a single high-resolution master JPG canvas.
 */
export async function downloadContactSheetJpg(
  carousel: CarouselData,
  customPalette?: ThemePalette,
  onProgress?: (current: number, total: number) => void,
  visualOptions?: VisualSystemOptions
): Promise<void> {
  const spec = getCanvasDimensionSpec(carousel.dimensionPreset);
  const total = carousel.slides.length;
  const cols = total <= 4 ? total : total <= 8 ? 4 : 5;
  const rows = Math.ceil(total / cols);

  const sW = 360;
  const sH = Math.round((sW * spec.height) / spec.width);
  const gap = 32;
  const headerH = 120;
  const pad = 40;

  const masterW = pad * 2 + cols * sW + (cols - 1) * gap;
  const masterH = headerH + pad * 2 + rows * sH + (rows - 1) * gap;

  const master = document.createElement('canvas');
  master.width = masterW;
  master.height = masterH;
  const mctx = master.getContext('2d');
  if (!mctx) return;

  // Background
  mctx.fillStyle = '#080d11';
  mctx.fillRect(0, 0, masterW, masterH);

  // Header banner
  mctx.fillStyle = '#ffffff';
  mctx.font = '800 36px "Plus Jakarta Sans", sans-serif';
  mctx.fillText('MARROK CONTENT STUDIO · VISUAL QA CONTACT SHEET', pad, pad + 38);

  mctx.fillStyle = '#9BA5AB';
  mctx.font = '500 20px "Plus Jakarta Sans", monospace';
  mctx.fillText(
    `Deck: ${carousel.category}   •   Theme: ${carousel.theme}   •   ${total} Slides (${spec.width}×${spec.height} ${spec.aspectRatioLabel})   •   Format: JPG Q95`,
    pad,
    pad + 74
  );

  // Render each slide
  for (let i = 0; i < total; i++) {
    if (onProgress) onProgress(i + 1, total);
    // Yield to let UI update progress
    await new Promise((resolve) => setTimeout(resolve, 0));

    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = pad + c * (sW + gap);
    const y = pad + headerH + r * (sH + gap);

    const slideCanvas = await renderSlideToCanvas(carousel, i, undefined, customPalette, visualOptions);
    mctx.drawImage(slideCanvas, 0, 0, spec.width, spec.height, x, y, sW, sH);

    // Slide border & index tag
    mctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    mctx.lineWidth = 2;
    mctx.strokeRect(x, y, sW, sH);

    mctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    mctx.fillRect(x + 12, y + 12, 80, 28);
    mctx.fillStyle = '#ffffff';
    mctx.font = '700 14px "Plus Jakarta Sans", monospace';
    mctx.fillText(`SLIDE ${String(i + 1).padStart(2, '0')}`, x + 20, y + 31);
  }

  const dataUrl = master.toDataURL('image/jpeg', 0.95);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `MARROK_ContactSheet_${carousel.category.replace(/[^a-zA-Z0-9]/g, '_')}_${spec.shortLabel.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

