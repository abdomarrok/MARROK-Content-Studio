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

  it('renders Inline Graphic Transformer in InlineSlideEditor, switches archetypes dynamically, and auto-syncs graphics live as copy is edited + auto-fits on blur', async () => {
    const { InlineSlideEditor } = await import('./InlineSlideEditor.tsx');
    const onUpdateField = vi.fn();
    const onSetSlideType = vi.fn();
    const onAutoFitSlide = vi.fn();

    const rowSlide: SlideData = {
      type: 'row',
      diagramVariant: 'topology',
      enTitle: 'OAuth 2.0 Token Exchange.',
      arTitle: 'تبادل الرموز عبر OAuth 2.0',
      enBody: 'RFC 8693 binds actor claims to short-lived delegated scopes.',
      arBody: 'يربط المعيار هوية الوكيل بصلاحيات مؤقتة.',
      diagramNodes: [
        { label: 'Human Principal', sublabel: 'sub claim', status: 'ACTIVE', icon: 'shield' },
        { label: 'Token Exchange', sublabel: 'RFC 8693', status: 'ROUTED', icon: 'key' },
        { label: 'Agent Actor', sublabel: 'act claim', status: 'VERIFIED', icon: 'cpu' },
      ],
    };

    render(
      <InlineSlideEditor
        currentSlide={rowSlide}
        currentSlideIndex={2}
        theme={theme}
        isAdvancedCustomizerOpen={false}
        onToggleAdvancedCustomizer={() => {}}
        onUpdateField={onUpdateField}
        onSetSlideType={onSetSlideType}
        onAutoFitSlide={onAutoFitSlide}
        isSingleSlide={false}
      />
    );

    expect(screen.getByTestId('inline-graphic-transformer')).toBeInTheDocument();
    expect(screen.getByTestId('inline-auto-sync-badge')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('inline-arch-compare'));
    expect(onSetSlideType).toHaveBeenCalledWith('compare');

    fireEvent.click(screen.getByTestId('inline-variant-isolation'));
    expect(onUpdateField).toHaveBeenCalledWith('diagramVariant', 'isolation');

    // Editing slide copy automatically syncs diagramNodes in real time without clicking any button
    const titleInput = screen.getByDisplayValue('OAuth 2.0 Token Exchange.');
    fireEvent.change(titleInput, {
      target: { value: 'Ingress Gateway -> Policy Engine -> Worker Sandbox.' },
    });
    expect(onUpdateField).toHaveBeenCalledWith(
      'enTitle',
      'Ingress Gateway -> Policy Engine -> Worker Sandbox.'
    );
    expect(onUpdateField).toHaveBeenCalledWith(
      'diagramNodes',
      expect.arrayContaining([
        expect.objectContaining({ label: expect.any(String) }),
      ])
    );

    // Blurring the input automatically triggers auto-fit
    fireEvent.blur(titleInput);
    expect(onAutoFitSlide).toHaveBeenCalledTimes(1);
  });

  it('renders CandidateSlideStoryboardStrip and CandidateSlidePreviewInspector with live canvas preview, 8-slide thumbnail strip, keyboard navigation, live graphic auto-sync, auto-fit on blur, theme/aspect switching, and single-slide AI regenerate', async () => {
    const {
      CandidateSlidePreviewInspector,
      CandidateSlideStoryboardStrip,
    } = await import('./review/CandidateSlidePreviewInspector.tsx');
    const { buildCandidateFromTopicSync } = await import(
      '../../lib/gather/gatherClient.ts'
    );

    const candidate = buildCandidateFromTopicSync(
      {
        id: 'hn_apple_local_ai',
        title: "Apple's local AI pivot.",
        url: 'https://example.com/apple-local-ai',
        sourceName: 'Hacker News',
        sourceType: 'hn',
        brand: 'APPLE',
        brandUrl: 'apple.com',
        domainCategory: 'AI AGENTS & MODELS',
        publishedAt: new Date().toISOString(),
        score: 420,
        summary:
          'Apple shifts on-device CoreML and MLX inference to unified memory on M4 silicon vs cloud GPU endpoints, cutting p99 latency to 12ms with 0 cloud token leaks.',
        extractedMetrics: ['12ms', '0 leaks'],
        recommendedFormat: 'carousel',
        synthesisPrompt:
          'Technical Topic: Apple local AI pivot on unified memory M4 silicon vs cloud GPU endpoints.',
      },
      'blueprint',
      'carousel'
    );

    const onSelectSlide = vi.fn();
    const { unmount } = render(
      <CandidateSlideStoryboardStrip
        slides={candidate.deck.slides}
        isExpanded={true}
        activeSlideIdx={1}
        onSelectSlide={onSelectSlide}
      />
    );

    expect(screen.getByTestId('candidate-storyboard-strip')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('storyboard-chip-s3'));
    expect(onSelectSlide).toHaveBeenCalledWith(2);
    unmount();

    let currentCandidate = candidate;
    let activeIdx = 1;
    const onSetActiveSlideIdx = vi.fn((nextIdx: number) => {
      activeIdx = nextIdx;
    });
    const onUpdateCandidateDeck = vi.fn(
      (_id: string, updater: (prev: typeof candidate) => typeof candidate) => {
        currentCandidate = updater(currentCandidate);
      }
    );
    const onRegenerateSingleSlide = vi.fn();
    const onShowToast = vi.fn();

    render(
      <CandidateSlidePreviewInspector
        candidate={currentCandidate}
        activeSlideIdx={activeIdx}
        onSetActiveSlideIdx={onSetActiveSlideIdx}
        onUpdateCandidateDeck={onUpdateCandidateDeck}
        onRegenerateSingleSlide={onRegenerateSingleSlide}
        isRegeneratingSlide={false}
        onShowToast={onShowToast}
      />
    );

    // 1. Live canvas preview & 8-slide thumbnail strip + automatic sync status indicator
    expect(screen.getByTestId('candidate-live-preview-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-thumbnail-strip')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-thumb-slide-0')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-thumb-slide-7')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-auto-sync-status')).toBeInTheDocument();

    // 2. Prev/Next buttons & Keyboard arrow navigation
    fireEvent.click(screen.getByTestId('preview-next-slide-btn'));
    expect(onSetActiveSlideIdx).toHaveBeenCalledWith(2);

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onSetActiveSlideIdx).toHaveBeenCalledWith(0);

    // 3. Switch theme palette and aspect ratio inline
    fireEvent.change(screen.getByTestId('candidate-theme-select'), {
      target: { value: 'cyber' },
    });
    expect(currentCandidate.themeId).toBe('cyber');
    expect(currentCandidate.deck.theme).toBe('cyber');

    fireEvent.click(screen.getByTestId('aspect-ratio-btn-ig-4:5'));
    expect(currentCandidate.deck.dimensionPreset).toBe('ig-4:5');

    // 4. Switch archetype & verify editing slide text automatically syncs graphic fields
    fireEvent.click(screen.getByTestId('candidate-arch-pill-compare'));
    expect(currentCandidate.deck.slides[1].type).toBe('compare');

    const enTitleInput = screen.getByTestId('candidate-en-title-input');
    fireEvent.change(enTitleInput, {
      target: { value: 'Cloud GPU Cluster vs M4 Unified Memory.' },
    });
    expect(currentCandidate.deck.slides[1].compareLeftTitle).toBe('CLOUD GPU CLUSTER');
    expect(currentCandidate.deck.slides[1].compareRightTitle).toBe('M4 UNIFIED MEMORY');

    // 5. One-click regenerate single slide with AI
    fireEvent.click(screen.getByTestId('regenerate-single-slide-btn'));
    expect(onRegenerateSingleSlide).toHaveBeenCalledWith(candidate, 1);
  });

  it('separates Dedicated 4th Meme Post Format from Normal Slide Graphic Photo uploads (preserving slide text + offering optional AI headline suggestions)', async () => {
    const { buildCleanMemeCarouselDeck, applySlideGraphicPhoto } = await import(
      '../../lib/canvas/videoFrameExtractor.ts'
    );
    const { seedSlideArchetypeData } = await import('../../lib/synthesis/archetypes.ts');
    const { InlineSlideEditor } = await import('./InlineSlideEditor.tsx');
    const { synthesizeCarousel } = await import('../../lib/synthesizer.ts');

    const baseSecurityDeck = synthesizeCarousel({
      prompt: 'eBPF in-kernel execution stack and cybersecurity sandboxing',
      postFormat: 'single',
    });
    expect(baseSecurityDeck.category).not.toBe('TECH HUMOR & LOGIC');
    expect((baseSecurityDeck.slides[0].takeaways || []).length).toBeGreaterThan(0);

    // 1. Dedicated 4th Meme Format ('meme') clears old template text & takeaways
    const cleanMemeDeck = buildCleanMemeCarouselDeck(
      baseSecurityDeck,
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'Human-logic-ryzen-minecraft.png'
    );

    expect(cleanMemeDeck.postFormat).toBe('meme');
    expect(cleanMemeDeck.category).toBe('');
    expect(cleanMemeDeck.slides).toHaveLength(1);
    expect(cleanMemeDeck.slides[0].type).toBe('poster');
    expect(cleanMemeDeck.slides[0].imageFrameMode).toBe('full');
    expect(cleanMemeDeck.slides[0].standaloneMeme).toBe(true);
    expect(cleanMemeDeck.slides[0].enTitle).toBe('');
    expect(cleanMemeDeck.slides[0].arTitle).toBe('');
    expect(cleanMemeDeck.slides[0].enCredit).toBe('');
    expect(cleanMemeDeck.slides[0].takeaways).toEqual([]);
    expect(cleanMemeDeck.sourceMeta?.creator).toBe('');
    expect(cleanMemeDeck.caption).toContain('Human logic ryzen minecraft');

    // Verify canvas render seeding does NOT re-inject default takeaways on a full meme card
    const seededForRender = seedSlideArchetypeData(cleanMemeDeck.slides[0], 'poster', 0, false);
    expect(seededForRender.takeaways).toEqual([]);

    const onUpdateField = vi.fn();
    const onUpdateCarouselField = vi.fn();
    const onUploadMemeOrPhotoFile = vi.fn();
    const onAnalyzePhotoCaption = vi.fn();

    const { unmount } = render(
      <InlineSlideEditor
        currentSlide={cleanMemeDeck.slides[0]}
        currentSlideIndex={0}
        theme={theme}
        isAdvancedCustomizerOpen={false}
        onToggleAdvancedCustomizer={vi.fn()}
        onUpdateField={onUpdateField}
        isSingleSlide={true}
        isMemeFormat={true}
        carouselCategory={cleanMemeDeck.category}
        carouselCaption={cleanMemeDeck.caption}
        onUpdateCarouselField={onUpdateCarouselField}
        onUploadMemeOrPhotoFile={onUploadMemeOrPhotoFile}
        onAnalyzePhotoCaption={onAnalyzePhotoCaption}
      />
    );

    // Inline Upload / Replace Meme button is present
    expect(screen.getByTestId('inline-upload-meme-btn')).toBeInTheDocument();

    // Normal slide headlines, Key Engineering Takeaways, and Top-Right Header Tag are hidden in Full Meme Card mode
    expect(screen.queryByText('English Headline')).not.toBeInTheDocument();
    expect(screen.queryByText('Key Engineering Takeaways')).not.toBeInTheDocument();
    expect(screen.queryByTestId('editor-meme-category-input')).not.toBeInTheDocument();

    // Social Media Caption input is visible and editable
    const captionInput = screen.getByTestId('editor-meme-caption-input');
    fireEvent.change(captionInput, { target: { value: 'Custom meme caption #TechHumor' } });
    expect(onUpdateCarouselField).toHaveBeenCalledWith('caption', 'Custom meme caption #TechHumor');

    // Regenerate AI Caption button triggers callback
    fireEvent.click(screen.getByTestId('editor-generate-from-photo-btn'));
    expect(onAnalyzePhotoCaption).toHaveBeenCalledTimes(1);
    unmount();

    // 2. Normal Slide Graphic Photo Upload preserves existing titles, body, and takeaways + offers optional AI headline suggestion
    const normalSlideWithPhoto = applySlideGraphicPhoto(
      baseSecurityDeck.slides[0],
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      true
    );
    expect(normalSlideWithPhoto.standaloneMeme).toBe(false);
    expect(normalSlideWithPhoto.enTitle).toBe(baseSecurityDeck.slides[0].enTitle);
    expect(normalSlideWithPhoto.arTitle).toBe(baseSecurityDeck.slides[0].arTitle);
    expect(normalSlideWithPhoto.takeaways).toEqual(baseSecurityDeck.slides[0].takeaways);

    const onApplyPhotoCopySuggestion = vi.fn();
    render(
      <InlineSlideEditor
        currentSlide={normalSlideWithPhoto}
        currentSlideIndex={0}
        theme={theme}
        isAdvancedCustomizerOpen={false}
        onToggleAdvancedCustomizer={vi.fn()}
        onUpdateField={vi.fn()}
        isSingleSlide={true}
        isMemeFormat={false}
        onUploadSlideGraphicFile={vi.fn()}
        photoCopySuggestion={{
          enTitle: 'Ryzen 9 Silicon Pipeline.',
          arTitle: 'معمارية معالجات رايزن 9.',
        }}
        onApplyPhotoCopySuggestion={onApplyPhotoCopySuggestion}
      />
    );

    expect(screen.getByTestId('inline-upload-graphic-btn')).toBeInTheDocument();
    expect(screen.getByText('English Headline')).toBeInTheDocument();
    expect(screen.getByTestId('ai-photo-copy-suggestion-banner')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('apply-photo-suggestion-btn'));
    expect(onApplyPhotoCopySuggestion).toHaveBeenCalledTimes(1);
  });
});






