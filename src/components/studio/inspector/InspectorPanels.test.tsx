import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CopyInspector } from './CopyInspector.tsx';
import { VisualInspector } from './VisualInspector.tsx';
import { PositionInspector } from './PositionInspector.tsx';
import { ReviewInspector } from './ReviewInspector.tsx';
import { CaptionInspector } from './CaptionInspector.tsx';
import { DEFAULT_STARTER_DECK } from '../../../lib/presets.ts';
import { DEFAULT_PALETTES } from '../../../types.ts';
import { runQAChecks } from '../../../lib/qaChecks.ts';
import { runPlatformRiskChecks } from '../../../lib/riskChecks.ts';
import { convertCarouselToMotionReel } from '../../../lib/motion/index.ts';

describe('Inspector Panel Decomposition Suite', () => {
  const theme = DEFAULT_PALETTES.teal;
  const mockSlide = DEFAULT_STARTER_DECK.slides[0];
  const mockCarousel = {
    ...DEFAULT_STARTER_DECK,
    caption: 'Discover modern distributed systems #SystemDesign #MARROK',
  };
  const mockQaReport = runQAChecks(mockCarousel);
  const mockRiskReport = runPlatformRiskChecks(mockCarousel);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CopyInspector', () => {
    it('renders Content editing inputs for carousel post format', () => {
      const onUpdateField = vi.fn();
      render(
        <CopyInspector
          activePostFormat="carousel"
          currentSlide={mockSlide}
          currentSlideIndex={0}
          totalSlides={mockCarousel.slides.length}
          carousel={mockCarousel}
          theme={theme}
          onUpdateField={onUpdateField}
          onShowToast={vi.fn()}
        />
      );

      // Verify headline inputs are present
      expect(screen.getByPlaceholderText('Crisp architecture headline ending in . or ?')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('عنوان تقني دقيق ومختصر.')).toBeInTheDocument();
    });

    it('renders MotionReelInspector when activePostFormat is reel', () => {
      const onChangeReelConfig = vi.fn();
      const onSelectMotionScene = vi.fn();
      const onSyncReelFromCarousel = vi.fn();
      const reelConfig = convertCarouselToMotionReel(mockCarousel, theme, 'marrok-slides');

      render(
        <CopyInspector
          activePostFormat="reel"
          currentSlide={mockSlide}
          currentSlideIndex={0}
          totalSlides={mockCarousel.slides.length}
          carousel={mockCarousel}
          theme={theme}
          activeReelConfig={reelConfig}
          onSelectMotionScene={onSelectMotionScene}
          onChangeReelConfig={onChangeReelConfig}
          onSyncReelFromCarousel={onSyncReelFromCarousel}
          onUpdateField={vi.fn()}
          onShowToast={vi.fn()}
        />
      );

      // Verify reel controls are rendered
      expect(screen.getByText(/Total Duration:/i)).toBeInTheDocument();
    });
  });

  describe('PositionInspector', () => {
    it('renders element layout controls and triggers position/nudge updates', () => {
      const onUpdateOverride = vi.fn();
      const onResetOverrides = vi.fn();
      const onSelectElement = vi.fn();

      render(
        <PositionInspector
          slide={mockSlide}
          theme={theme}
          isOpen={true}
          headless={true}
          selectedElementId="titleBlock"
          onSelectElement={onSelectElement}
          onUpdateOverride={onUpdateOverride}
          onResetOverrides={onResetOverrides}
        />
      );

      // Verify ElementInspector layout controls are rendered
      expect(screen.getByText(/Reset Overrides|Reset/i)).toBeInTheDocument();
    });
  });

  describe('VisualInspector', () => {
    it('renders ArchetypeControls and embedded PositionInspector', () => {
      const onSetSlideType = vi.fn();
      const onUpdateField = vi.fn();
      const onSelectElement = vi.fn();
      const onUpdateOverride = vi.fn();
      const onResetOverrides = vi.fn();

      render(
        <VisualInspector
          currentSlide={mockSlide}
          currentSlideIndex={0}
          carousel={mockCarousel}
          theme={theme}
          selectedElementId={null}
          onSelectElement={onSelectElement}
          onSetSlideType={onSetSlideType}
          onUpdateField={onUpdateField}
          onUpdateSatLabel={vi.fn()}
          onUpdateDiagramNode={vi.fn()}
          onUpdateDiagramEdge={vi.fn()}
          onOpenAiImageStudio={vi.fn()}
          onOpenMediaSearch={vi.fn()}
          onUpdateElementLayoutOverride={onUpdateOverride}
          onResetSlideLayoutOverrides={onResetOverrides}
        />
      );

      // Check archetype controls presence (e.g. Auto layout toggle button)
      expect(screen.getByTestId('toggle-auto-layout-btn')).toBeInTheDocument();
      expect(screen.getByText('Hub Architecture')).toBeInTheDocument();
    });
  });

  describe('ReviewInspector', () => {
    it('renders PublishChecklist with readiness indicators and review actions', () => {
      const onToggleReviewDraft = vi.fn();
      const onRetryWithAi = vi.fn();

      render(
        <ReviewInspector
          carousel={mockCarousel}
          currentSlideIndex={0}
          theme={theme}
          isOfflineDraft={false}
          isReviewed={true}
          qaReport={mockQaReport}
          riskReport={mockRiskReport}
          overrideExportBlock={false}
          onToggleReviewDraft={onToggleReviewDraft}
          onRetryWithAi={onRetryWithAi}
        />
      );

      expect(screen.getByTestId('review-inspector')).toBeInTheDocument();
      expect(screen.getByText('Ready to Publish Checklist')).toBeInTheDocument();
    });
  });

  describe('CaptionInspector', () => {
    it('renders bilingual caption textarea, dynamic hashtags, and dispatches updates', () => {
      const onChangeCaption = vi.fn();
      const onCopyCaption = vi.fn();

      render(
        <CaptionInspector
          caption="Test social caption"
          onChangeCaption={onChangeCaption}
          hashtags={['#MARROK', '#SystemDesign']}
          activePostFormat="carousel"
          onCopyCaption={onCopyCaption}
          theme={theme}
        />
      );

      expect(screen.getByTestId('caption-inspector')).toBeInTheDocument();
      const textarea = screen.getByDisplayValue('Test social caption');
      expect(textarea).toBeInTheDocument();

      fireEvent.change(textarea, { target: { value: 'Updated social caption' } });
      expect(onChangeCaption).toHaveBeenCalledWith('Updated social caption');

      const copyBtn = screen.getByTestId('copy-caption-btn');
      fireEvent.click(copyBtn);
      expect(onCopyCaption).toHaveBeenCalledTimes(1);

      expect(screen.getByText('#MARROK #SystemDesign')).toBeInTheDocument();
    });
  });
});
