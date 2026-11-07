import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PALETTES, SlideData } from '../../types.ts';
import {
  getPresetExportFolderName,
  resolveExportTargetPresets,
} from '../../lib/canvas/exporter.ts';
import {
  analyzeSlideTextForArchetype,
  inferBestDiagramVariant,
  inferBestSlideArchetype,
  matchSlideIconsFromText,
  resolveSmartSlideVisuals,
} from '../../lib/synthesis/smartVisualDefaults.ts';
import { ArchetypeControls } from './ArchetypeControls.tsx';

describe('ArchetypeControls visual layout editors & smart content-aware defaults', () => {
  const theme = DEFAULT_PALETTES.teal;

  const baseProps = {
    theme,
    isAdvancedCustomizerOpen: true,
    onSetSlideType: vi.fn(),
    onUpdateField: vi.fn(),
    onUpdateCarouselField: vi.fn(),
    onUpdateSatLabel: vi.fn(),
    onUpdateDiagramNode: vi.fn(),
    onUpdateDiagramEdge: vi.fn(),
    onOpenAiImageStudio: vi.fn(),
    onOpenMediaSearch: vi.fn(),
  };

  it('renders all 9 slide layout archetypes in the top switcher including Number', () => {
    const slide: SlideData = {
      type: 'number',
      stepNumber: '02',
      stepLabel: 'STEP 02',
      enTitle: 'First Principle.',
      arTitle: 'المبدأ الأول',
    };

    render(<ArchetypeControls {...baseProps} currentSlide={slide} currentSlideIndex={1} />);

    expect(screen.getByRole('button', { name: /Poster/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hub/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Mechanism/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Number/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Meme \/ Image|Diagram \/ AI/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Code Diff/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Metric/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Compare/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CTA/i })).toBeInTheDocument();
  });

  it('renders the dedicated Number slide visual editor and updates stepNumber and stepLabel', () => {
    const onUpdateField = vi.fn();
    const slide: SlideData = {
      type: 'number',
      stepNumber: '02',
      stepLabel: 'STEP 02',
      enTitle: 'Second stage.',
      arTitle: 'المرحلة الثانية',
    };

    render(
      <ArchetypeControls
        {...baseProps}
        currentSlide={slide}
        currentSlideIndex={1}
        onUpdateField={onUpdateField}
      />
    );

    expect(screen.getByText('Step Counter & Accent Numeral')).toBeInTheDocument();
    const numInput = screen.getByDisplayValue('02');
    fireEvent.change(numInput, { target: { value: '05' } });
    expect(onUpdateField).toHaveBeenCalledWith('stepNumber', '05');

    const labelInput = screen.getByDisplayValue('STEP 02');
    fireEvent.change(labelInput, { target: { value: 'PHASE 02 // INGRESS' } });
    expect(onUpdateField).toHaveBeenCalledWith('stepLabel', 'PHASE 02 // INGRESS');
  });

  it('renders all 9 schematic variants in the Mechanism (row) editor', () => {
    const onUpdateField = vi.fn();
    const slide: SlideData = {
      type: 'row',
      diagramVariant: 'graph',
      enTitle: 'HNSW Traversal.',
      arTitle: 'البحث في الرسم البياني',
    };

    render(
      <ArchetypeControls
        {...baseProps}
        currentSlide={slide}
        onUpdateField={onUpdateField}
      />
    );

    const expectedVariants = [
      'Topology Flow',
      'Layered Stack',
      'Isolation Grid',
      'Key Takeaway',
      'Vector Scatter',
      'HNSW Skip-Graph',
      'IVF Clusters',
      'Hot/Cold Split',
      '3 Feature Cards',
    ];

    for (const label of expectedVariants) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('button', { name: /Hot\/Cold Split/i }));
    expect(onUpdateField).toHaveBeenCalledWith('diagramVariant', 'split');
  });

  it('renders the dedicated CTA Closer Emblem & Attribution Card editor on CTA slides', () => {
    const onUpdateField = vi.fn();
    const onUpdateCarouselField = vi.fn();
    const slide: SlideData = {
      type: 'cta',
      ctaText: 'Join discussion • شارك برأيك',
      url: 'marrok.org',
      enCredit: 'Technical Analysis // Vector Engines',
      arCredit: 'توثيق وتحليل تقني // محركات المتجهات',
    };

    render(
      <ArchetypeControls
        {...baseProps}
        currentSlide={slide}
        onUpdateField={onUpdateField}
        onUpdateCarouselField={onUpdateCarouselField}
      />
    );

    expect(screen.getByText('CTA Closer Emblem & Attribution Card')).toBeInTheDocument();
    const ctaInput = screen.getByDisplayValue('Join discussion • شارك برأيك');
    fireEvent.change(ctaInput, { target: { value: 'Follow @MARROK' } });
    expect(onUpdateField).toHaveBeenCalledWith('ctaText', 'Follow @MARROK');
  });

  it('extracts tech icons, metrics, and best-fit archetype across Metric, Compare, Code, Row, and Number', () => {
    const metricSlide: SlideData = {
      type: 'row',
      enTitle: 'Docker & Postgres cut cloud spend by $6.3B.',
      arTitle: 'دوكر وبوستغريس يخفضان التكلفة بمقدار 6.3 مليارات دولار.',
      enBody: 'Container density improved 94% across Kubernetes clusters.',
      arBody: 'تحسنت كثافة الحاويات بنسبة 94% عبر مجموعات كوبرنيتس.',
    };

    const icons = matchSlideIconsFromText(
      `${metricSlide.enTitle} ${metricSlide.enBody}`
    );
    expect(icons).toContain('docker');
    expect(icons).toContain('postgresql');
    expect(icons).toContain('kubernetes');

    expect(inferBestSlideArchetype(metricSlide, 2, 8)).toBe('metric');
    expect(
      analyzeSlideTextForArchetype({
        type: 'row',
        enTitle: 'SELECT id FROM items ORDER BY embedding',
        enBody: 'Run EXPLAIN ANALYZE on vector_index.sql to verify query execution.',
      })
    ).toBe('code');
    expect(
      analyzeSlideTextForArchetype({
        type: 'row',
        enTitle: 'Step 03: Isolate Untrusted Agents',
        enBody: 'Enforce strict scope policies at the gateway.',
      })
    ).toBe('number');
    expect(
      analyzeSlideTextForArchetype({
        type: 'row',
        enTitle: 'Zero-Trust Isolation Pipeline',
        enBody: 'Ingress requests pass through the policy enforcement boundary.',
      })
    ).toBe('row');

    const resolved = resolveSmartSlideVisuals(metricSlide, 2, false);
    expect(resolved.metricValue).toBe('$6.3B');
    expect(resolved.diagramNodes[0].label).not.toBe('Client Ingress');
  });

  it('triggers Smart Match button to assign the best archetype and update layout configuration', () => {
    const onSetSlideType = vi.fn();
    const onUpdateField = vi.fn();
    const compareSlide: SlideData = {
      type: 'row',
      enTitle: 'Hot RAM Cache vs Cold NVMe Tier.',
      arTitle: 'الذاكرة الساخنة مقابل التخزين البارد.',
      enBody: 'Splitting hot embeddings from cold disk blocks cuts memory cost.',
      arBody: 'فصل المتجهات النشطة عن الأقراص يقلل استهلاك الذاكرة.',
    };

    expect(inferBestDiagramVariant(compareSlide)).toBe('split');
    expect(analyzeSlideTextForArchetype(compareSlide)).toBe('compare');

    render(
      <ArchetypeControls
        {...baseProps}
        currentSlide={compareSlide}
        currentSlideIndex={2}
        onSetSlideType={onSetSlideType}
        onUpdateField={onUpdateField}
      />
    );

    const smartMatchBtn = screen.getByRole('button', { name: /Smart Match/i });
    fireEvent.click(smartMatchBtn);

    expect(onSetSlideType).toHaveBeenCalledWith('compare');
    expect(onUpdateField).toHaveBeenCalledWith('compareLeftTitle', 'HOT RAM CACHE');
    expect(onUpdateField).toHaveBeenCalledWith('compareRightTitle', 'COLD NVME TIER');
  });

  it('resolves all 5 social media export formats and folder names for multi-format ZIP bundles', () => {
    const allFormats = resolveExportTargetPresets('all', 'ig-4:5');
    expect(allFormats).toEqual([
      'ig-4:5',
      'tiktok-9:16',
      'ig-3:4',
      'ig-1:1',
      'ig-9:16',
    ]);
    expect(getPresetExportFolderName('tiktok-9:16')).toBe('tiktok-9x16');
    expect(getPresetExportFolderName('ig-4:5')).toBe('instagram-4x5');
    expect(getPresetExportFolderName('ig-3:4')).toBe('instagram-3x4');
    expect(getPresetExportFolderName('ig-1:1')).toBe('instagram-1x1');
    expect(getPresetExportFolderName('ig-9:16')).toBe('instagram-reels-9x16');
  });

  it('accepts image and video MIME types (.mp4, .webm, .mov) and provides Play/Pause, Mute/Unmute, Fit Mode (Contain/Cover), and 1080x1440 MP4 export controls', () => {
    const onUpdateField = vi.fn();
    const onUpdateSlideFields = vi.fn();
    const onExportVideoMp4 = vi.fn();

    const videoPosterSlide: SlideData = {
      type: 'poster',
      mediaType: 'video',
      videoUrl: 'blob:http://localhost:3000/sample.mp4',
      videoMimeType: 'video/mp4',
      videoFileName: 'architecture-demo.mp4',
      videoDuration: 6.4,
      videoPlaying: true,
      videoMuted: true,
      imageFrameMode: 'full',
      imageFit: 'contain',
      imageBgStyle: 'white',
      brandWatermark: 'bottom-right',
      enTitle: 'Distributed Consensus.',
      arTitle: 'الإجماع الموزع.',
    };

    const { rerender } = render(
      <ArchetypeControls
        {...baseProps}
        currentSlide={videoPosterSlide}
        onUpdateField={onUpdateField}
        onUpdateSlideFields={onUpdateSlideFields}
        onExportVideoMp4={onExportVideoMp4}
        isExportingVideo={false}
        videoExportProgress={0}
      />
    );

    const fileInput = screen.getByTestId('single-slide-media-input') as HTMLInputElement;
    expect(fileInput.accept).toContain('image/*');
    expect(fileInput.accept).toContain('video/mp4');
    expect(fileInput.accept).toContain('video/webm');
    expect(fileInput.accept).toContain('video/quicktime');

    // Verify playback controls in sidebar
    const playToggle = screen.getByTestId('sidebar-video-play-toggle');
    fireEvent.click(playToggle);
    expect(onUpdateField).toHaveBeenCalledWith('videoPlaying', false);

    const muteToggle = screen.getByTestId('sidebar-video-mute-toggle');
    fireEvent.click(muteToggle);
    expect(onUpdateField).toHaveBeenCalledWith('videoMuted', false);

    // Verify fit mode selector (Contain vs Cover)
    const coverBtn = screen.getByTestId('sidebar-video-fit-cover');
    fireEvent.click(coverBtn);
    expect(onUpdateField).toHaveBeenCalledWith('imageFit', 'cover');

    // Verify FPS selection and MP4 export trigger
    fireEvent.click(screen.getByTestId('video-fps-60'));
    fireEvent.click(screen.getByTestId('export-single-slide-mp4-btn'));
    expect(onExportVideoMp4).toHaveBeenCalledWith(60);

    // Verify progress bar renders during MP4 export
    rerender(
      <ArchetypeControls
        {...baseProps}
        currentSlide={videoPosterSlide}
        onUpdateField={onUpdateField}
        onUpdateSlideFields={onUpdateSlideFields}
        onExportVideoMp4={onExportVideoMp4}
        isExportingVideo={true}
        videoExportProgress={64}
        videoExportStage="Rendering frame 38 / 60 (1080×1440 @ 30fps)"
      />
    );
    expect(screen.getByTestId('video-export-progress-bar')).toBeInTheDocument();
    expect(screen.getAllByText(/64%/i).length).toBeGreaterThanOrEqual(1);
  });

  it('renders <video> inside the central white card with layered corner registration marks and @MARROK badge, falling back to <img> for static images', async () => {
    const { ViewportCanvas } = await import('./ViewportCanvas.tsx');
    const onUpdateSlideField = vi.fn();

    const videoSlide: SlideData = {
      type: 'poster',
      mediaType: 'video',
      videoUrl: 'blob:http://localhost:3000/demo-video.mp4',
      videoMimeType: 'video/mp4',
      videoPlaying: true,
      videoMuted: true,
      videoBorderRadius: 8,
      imageFrameMode: 'full',
      imageFit: 'contain',
      imageBgStyle: 'white',
      brandWatermark: 'bottom-right',
      enTitle: 'Video Card Spec.',
      arTitle: 'بطاقة فيديو تقنية.',
    };

    const { rerender } = render(
      <ViewportCanvas
        carousel={{
          category: 'AI & AGENTS',
          theme: 'emerald',
          caption: 'Video Spec Test',
          postFormat: 'single',
          dimensionPreset: 'ig-3:4',
          slides: [videoSlide],
        }}
        currentSlideIndex={0}
        theme={DEFAULT_PALETTES.emerald ? DEFAULT_PALETTES.emerald : Object.values(DEFAULT_PALETTES)[0]}
        showSafeZones={false}
        onToggleSafeZones={() => {}}
        onPreviousSlide={() => {}}
        onNextSlide={() => {}}
        onUpdateSlideField={onUpdateSlideField}
      />
    );

    const videoEl = screen.getByTestId('white-card-video-element') as HTMLVideoElement;
    expect(videoEl).toBeInTheDocument();
    expect(videoEl.tagName).toBe('VIDEO');
    expect(videoEl.playsInline).toBe(true);
    expect(videoEl.loop).toBe(true);
    expect(videoEl.style.objectFit).toBe('contain');
    expect(videoEl.style.borderRadius).toBe('8px');

    // Corner registration marks (top-left, top-right, bottom-left) and @MARROK watermark layered above video
    const marksOverlay = screen.getByTestId('corner-registration-marks');
    const innerSlot = screen.getByTestId('white-card-inner-slot');
    const watermarkBadge = screen.getByTestId('white-card-watermark-badge');

    expect(screen.getByTestId('corner-mark-tl')).toBeInTheDocument();
    expect(screen.getByTestId('corner-mark-tr')).toBeInTheDocument();
    expect(screen.getByTestId('corner-mark-bl')).toBeInTheDocument();
    expect(Number(marksOverlay.style.zIndex)).toBeGreaterThan(Number(innerSlot.style.zIndex));
    expect(Number(watermarkBadge.style.zIndex)).toBeGreaterThan(Number(innerSlot.style.zIndex));
    expect(watermarkBadge.textContent).toContain('@MARROK');

    // Fallback to <img> when static image is provided
    const imageSlide: SlideData = {
      type: 'poster',
      mediaType: 'image',
      imageUrl: '/assets/aistudio/1793547809949_4a78bc04.jpg',
      imageFrameMode: 'full',
      imageFit: 'cover',
      imageBgStyle: 'white',
      brandWatermark: 'bottom-right',
      enTitle: 'Static Image Spec.',
      arTitle: 'بطاقة صورة ثابتة.',
    };

    rerender(
      <ViewportCanvas
        carousel={{
          category: 'AI & AGENTS',
          theme: 'emerald',
          caption: 'Static Image Spec Test',
          postFormat: 'single',
          dimensionPreset: 'ig-3:4',
          slides: [imageSlide],
        }}
        currentSlideIndex={0}
        theme={Object.values(DEFAULT_PALETTES)[0]}
        showSafeZones={false}
        onToggleSafeZones={() => {}}
        onPreviousSlide={() => {}}
        onNextSlide={() => {}}
        onUpdateSlideField={onUpdateSlideField}
      />
    );

    const imgEl = screen.getByTestId('white-card-image-element') as HTMLImageElement;
    expect(imgEl).toBeInTheDocument();
    expect(imgEl.tagName).toBe('IMG');
    expect(imgEl.style.objectFit).toBe('cover');
  });

  it('allows generating slide text & caption from video and auto-reveals slide text on canvas when editing in InlineSlideEditor', async () => {
    const { InlineSlideEditor } = await import('./InlineSlideEditor.tsx');
    const onUpdateField = vi.fn();
    const onGenerateFromVideo = vi.fn();

    const videoSlideInFullMode: SlideData = {
      type: 'poster',
      mediaType: 'video',
      videoUrl: 'blob:http://localhost:3000/demo-clip.mp4',
      videoFileName: 'redis-8-benchmark.mp4',
      imageFrameMode: 'full',
      imageFit: 'contain',
      imageBgStyle: 'white',
      enTitle: 'Old Headline.',
      arTitle: 'عنوان قديم.',
      enBody: 'Old body text.',
      arBody: 'نص قديم.',
    };

    render(
      <InlineSlideEditor
        currentSlide={videoSlideInFullMode}
        currentSlideIndex={0}
        theme={theme}
        isAdvancedCustomizerOpen={false}
        onToggleAdvancedCustomizer={() => {}}
        onUpdateField={onUpdateField}
        isSingleSlide={true}
        onGenerateFromVideo={onGenerateFromVideo}
        isGeneratingFromVideo={false}
      />
    );

    expect(screen.getByTestId('editor-video-text-bar')).toBeInTheDocument();
    const genBtn = screen.getByTestId('editor-generate-from-video-btn');
    fireEvent.click(genBtn);
    expect(onGenerateFromVideo).toHaveBeenCalledTimes(1);

    // Editing English headline while in 'full' mode automatically switches imageFrameMode to 'hero' so slide text is visible below the video card
    const enTitleInput = screen.getByDisplayValue('Old Headline.');
    fireEvent.change(enTitleInput, { target: { value: 'Redis 8 Multi-Threaded Core.' } });
    expect(onUpdateField).toHaveBeenCalledWith('imageFrameMode', 'hero');
    expect(onUpdateField).toHaveBeenCalledWith('enTitle', 'Redis 8 Multi-Threaded Core.');
  });
});


