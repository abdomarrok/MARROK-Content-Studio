import React, { useState } from 'react';
import {
  Sparkles,
  Lock,
  Unlock,
  LayoutGrid,
  ChevronDown,
  Sliders,
  Loader2,
  Wand2,
} from 'lucide-react';
import {
  CarouselData,
  CoverStyle,
  SlideData,
  SlideType,
  ThemePalette,
  DiagramVariant,
  DiagramNode,
} from '../../types.ts';
import {
  resolveSmartSlideVisuals,
  explainArchetypeChoice,
} from '../../lib/synthesis/smartVisualDefaults.ts';
import { deriveVisualSpecFromSlide } from '../../lib/synthesis/visualSpecBuilder.ts';
import {
  COVER_STYLE_OPTIONS,
  getSlideCatalogId,
  materializeLayoutForSlide,
  rankSlideLayoutsForDeck,
  resolveSlide1CoverStyle,
} from '../../lib/synthesis/autoLayoutEngine.ts';
import { IconPickerPopover } from './IconPickerPopover.tsx';
import {
  VisualGalleryPicker,
  VisualCatalogEntry,
  getActiveVisualCatalogEntry,
  getCategoryLabel,
  renderVisualThumbnail,
} from './VisualGalleryPicker.tsx';
import {
  HubArchetypeEditor,
  DiagramSchematicEditor,
  NumberArchetypeEditor,
  CodeArchetypeEditor,
  MetricArchetypeEditor,
  CompareArchetypeEditor,
  ImageArchetypeEditor,
  CtaArchetypeEditor,
  SubjectPairArchetypeEditor,
  VisualSpecArchetypeEditor,
  EXPECTATIONS_VS_REALITY_MEME_URL,
} from './archetypes/index.ts';

export { EXPECTATIONS_VS_REALITY_MEME_URL };

export interface ArchetypeControlsProps {
  currentSlide: SlideData;
  currentSlideIndex?: number;
  carousel?: CarouselData;
  theme: ThemePalette;
  isAdvancedCustomizerOpen: boolean;
  onSetSlideType: (type: SlideType) => void;
  onUpdateField: (field: keyof SlideData, value: any) => void;
  onUpdateSlideFields?: (updates: Partial<SlideData>) => void;
  onSmartMatchVisuals?: (useRecommendedArchetype?: boolean) => void;
  onToggleAutoLayout?: () => void;
  onReimagineVisual?: () => void;
  isReimaginingVisual?: boolean;
  onDiversifyDeckVisuals?: () => void;
  onUpdateCarouselField?: (field: keyof CarouselData, value: any) => void;
  onUpdateSatLabel: (index: number, value: string) => void;
  onUpdateSatIcon?: (index: number, iconName: string) => void;
  onUpdateCenterIcon?: (iconName: string) => void;
  onUpdateCenterTag?: (tag: string) => void;
  onAddSatNode?: () => void;
  onDeleteSatNode?: (index: number) => void;
  onUpdateDiagramNode: (nodeIndex: number, field: keyof DiagramNode, value: string) => void;
  onUpdateDiagramEdge: (edgeIndex: number, value: string) => void;
  onOpenAiImageStudio: () => void;
  onOpenMediaSearch: () => void;
  onExportVideoMp4?: (fps?: 30 | 60) => void;
  isExportingVideo?: boolean;
  videoExportProgress?: number;
  videoExportStage?: string;
  onGenerateFromVideo?: (fileOrUrl?: File | string) => void;
  isGeneratingFromVideo?: boolean;
  onGenerateFromPhoto?: (file: File, dataUrl: string, mode: 'meme' | 'graphic') => void;
  /** Optional Position & Scale panel folded cleanly into Visual tab */
  positionSection?: React.ReactNode;
  isPositionSectionOpen?: boolean;
  onTogglePositionSection?: () => void;
  activeOverridesCount?: number;
  onApplyCoverStyle?: (coverStyle: CoverStyle) => void;
}

function normalizeDiagramVariant(raw?: string): DiagramVariant {
  const v = (raw || 'topology').toLowerCase();
  if (v === 'vectors' || v === 'scatter') return 'scatter';
  if (v === 'hnsw' || v === 'hierarchy' || v === 'graph') return 'graph';
  if (v === 'ivf' || v === 'partition' || v === 'clusters') return 'clusters';
  if (v === 'hotcold' || v === 'buffer' || v === 'split') return 'split';
  if (v === 'cards' || v === 'features') return 'features';
  if (v === 'stack') return 'stack';
  if (v === 'isolation') return 'isolation';
  if (v === 'takeaway') return 'takeaway';
  return 'topology';
}

export const ArchetypeControls: React.FC<ArchetypeControlsProps> = ({
  currentSlide,
  currentSlideIndex = 0,
  carousel,
  theme,
  onSetSlideType,
  onUpdateField,
  onUpdateSlideFields,
  onSmartMatchVisuals,
  onToggleAutoLayout,
  onReimagineVisual,
  isReimaginingVisual = false,
  onDiversifyDeckVisuals,
  onUpdateCarouselField,
  onUpdateSatLabel,
  onUpdateSatIcon,
  onUpdateCenterIcon,
  onUpdateCenterTag,
  onAddSatNode,
  onDeleteSatNode,
  onUpdateDiagramNode,
  onUpdateDiagramEdge,
  onOpenAiImageStudio,
  onOpenMediaSearch,
  onExportVideoMp4,
  isExportingVideo = false,
  videoExportProgress = 0,
  videoExportStage = '',
  onGenerateFromVideo,
  isGeneratingFromVideo = false,
  onGenerateFromPhoto,
  positionSection,
  isPositionSectionOpen = false,
  onTogglePositionSection,
  activeOverridesCount = 0,
  onApplyCoverStyle,
}) => {
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isDeckOptionsOpen, setIsDeckOptionsOpen] = useState(false);
  const [iconPickerState, setIconPickerState] = useState<{
    isOpen: boolean;
    title: string;
    currentIcon: string;
    onSelect: (icon: string) => void;
  }>({
    isOpen: false,
    title: '',
    currentIcon: '',
    onSelect: () => {},
  });

  const handleRequestIconPicker = (config: {
    title: string;
    currentIcon: string;
    onSelect: (icon: string) => void;
  }) => {
    setIconPickerState({
      isOpen: true,
      ...config,
    });
  };

  const totalSlides = carousel?.slides?.length || 8;
  const smart = resolveSmartSlideVisuals(currentSlide, currentSlideIndex, false);
  const recommendedVariant = smart.recommendedVariant;
  const activeDiagramVariant = normalizeDiagramVariant(
    currentSlide.diagramVariant || smart.diagramVariant
  );
  const isManualLocked = Boolean(currentSlide.manualLayoutLocked);
  const activeRationale =
    currentSlide.layoutRationale ||
    explainArchetypeChoice(currentSlide, currentSlideIndex, totalSlides);

  const activeCatalogEntry = getActiveVisualCatalogEntry(
    currentSlide,
    activeDiagramVariant
  );

  const applyLayoutPatch = (patch: Partial<SlideData>) => {
    if (onUpdateSlideFields) {
      onUpdateSlideFields(patch);
      return;
    }
    if (patch.type && patch.type !== currentSlide.type) {
      onSetSlideType(patch.type);
    }
    (Object.keys(patch) as Array<keyof SlideData>).forEach((key) => {
      if (key === 'type') return;
      onUpdateField(key, patch[key]);
    });
  };

  const handleSelectVariant = (variantId: DiagramVariant) => {
    const nextSmart = resolveSmartSlideVisuals(
      { ...currentSlide, diagramVariant: variantId },
      currentSlideIndex,
      true
    );
    const nextRationale = explainArchetypeChoice(
      { ...currentSlide, diagramVariant: variantId },
      currentSlideIndex,
      totalSlides
    );
    if (onUpdateSlideFields) {
      onUpdateSlideFields({
        diagramVariant: variantId,
        diagramNodes: nextSmart.diagramNodes,
        diagramEdges: nextSmart.diagramEdges,
        diagramFooter: nextSmart.diagramFooter,
        layoutRationale: nextRationale,
        manualLayoutLocked: true,
      });
    } else {
      onUpdateField('diagramVariant', variantId);
      onUpdateField('layoutRationale', nextRationale);
      onUpdateField('manualLayoutLocked', true);
    }
  };

  const handleSelectCatalogEntry = (entry: VisualCatalogEntry) => {
    if (entry.slideType === 'row' && entry.diagramVariant) {
      if (currentSlide.type !== 'row') {
        onSetSlideType('row');
      }
      handleSelectVariant(entry.diagramVariant);
      return;
    }

    if (entry.slideType === 'visual' && entry.visualKind) {
      if (currentSlide.type !== 'visual') {
        onSetSlideType('visual');
      }
      const nextSpec = deriveVisualSpecFromSlide(
        currentSlide,
        entry.visualKind,
        currentSlideIndex
      );
      const mergedSpec = currentSlide.visualSpec
        ? { ...currentSlide.visualSpec, ...nextSpec, kind: entry.visualKind }
        : nextSpec;
      const nextRationale = explainArchetypeChoice(
        { ...currentSlide, type: 'visual', visualSpec: mergedSpec },
        currentSlideIndex,
        totalSlides
      );
      if (onUpdateSlideFields) {
        onUpdateSlideFields({
          type: 'visual',
          visualSpec: mergedSpec,
          layoutRationale: nextRationale,
          manualLayoutLocked: true,
        });
      } else {
        onUpdateField('visualSpec', mergedSpec);
        onUpdateField('layoutRationale', nextRationale);
        onUpdateField('manualLayoutLocked', true);
      }
      return;
    }

    onSetSlideType(entry.slideType);
    onUpdateField('manualLayoutLocked', true);
  };

  const handleToggleAutoClick = () => {
    if (onToggleAutoLayout) {
      onToggleAutoLayout();
      return;
    }
    if (isManualLocked) {
      if (onSmartMatchVisuals) {
        onSmartMatchVisuals(true);
        return;
      }
      const slides = carousel?.slides && carousel.slides.length > 0 ? carousel.slides : [currentSlide];
      const ranked = rankSlideLayoutsForDeck(currentSlide, slides, currentSlideIndex, {
        postFormat: carousel?.postFormat,
      });
      const best = ranked[0];
      if (best) {
        const materialized = materializeLayoutForSlide(currentSlide, best, currentSlideIndex, slides.length, {
          rationalePrefix: 'Auto-picked',
          lockLayout: false,
          forceRefreshVisuals: true,
        });
        applyLayoutPatch(materialized);
      } else {
        onUpdateField('manualLayoutLocked', false);
      }
    } else {
      onUpdateField('manualLayoutLocked', true);
    }
  };

  const handleReimagineClick = () => {
    if (onReimagineVisual) {
      onReimagineVisual();
      return;
    }
    const slides = carousel?.slides && carousel.slides.length > 0 ? carousel.slides : [currentSlide];
    const currentId = getSlideCatalogId(currentSlide, activeDiagramVariant);
    const ranked = rankSlideLayoutsForDeck(currentSlide, slides, currentSlideIndex, {
      postFormat: carousel?.postFormat,
      excludeIds: [currentId],
    });
    const nextCandidate =
      ranked.find((c) => c.id !== currentId && c.slideType !== 'image' && c.slideType !== 'cta') ||
      ranked[0];
    if (nextCandidate) {
      const materialized = materializeLayoutForSlide(
        currentSlide,
        nextCandidate,
        currentSlideIndex,
        slides.length,
        {
          rationalePrefix: 'Re-imagined',
          lockLayout: false,
          forceRefreshVisuals: true,
        }
      );
      applyLayoutPatch(materialized);
    }
  };

  const showCoverQuickBar =
    Boolean(onApplyCoverStyle) &&
    currentSlideIndex === 0 &&
    Boolean(carousel && carousel.slides.length > 1) &&
    carousel?.postFormat !== 'single' &&
    carousel?.postFormat !== 'meme' &&
    !currentSlide.standaloneMeme &&
    currentSlide.type !== 'poster';
  const activeCoverStyle =
    currentSlide.coverStyle || resolveSlide1CoverStyle(currentSlide, carousel?.slides);

  return (
    <div className="space-y-4">
      {showCoverQuickBar && onApplyCoverStyle && (
        <div
          data-testid="archetype-cover-style-bar"
          className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.08] space-y-2"
        >
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="font-semibold text-white">Slide 1 Cover Hero Style</span>
            <span className="text-slate-400">Headline-first framing</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {COVER_STYLE_OPTIONS.map((opt) => {
              const active = activeCoverStyle === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`visual-cover-style-${opt.id}`}
                  onClick={() => onApplyCoverStyle(opt.id)}
                  className={`px-2 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer truncate ${
                    active
                      ? 'text-white font-semibold'
                      : 'bg-black/40 border-white/[0.08] text-slate-300 hover:text-white'
                  }`}
                  style={
                    active
                      ? {
                          backgroundColor: `${theme.accent}1A`,
                          borderColor: `${theme.accent}80`,
                        }
                      : undefined
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 1. Calm Active Visual Card (Auto/Manual Status + Re-imagine AI Director + Grouped Gallery) */}
      <div
        data-testid="active-visual-card"
        className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.08]"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {renderVisualThumbnail(activeCatalogEntry, theme, true)}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white truncate">
                {activeCatalogEntry.label}
              </span>
              <button
                type="button"
                data-testid="toggle-auto-layout-btn"
                onClick={handleToggleAutoClick}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  isManualLocked
                    ? 'bg-amber-500/15 border-amber-400/40 text-amber-200 hover:bg-amber-500/25'
                    : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/25'
                }`}
                title={
                  isManualLocked
                    ? 'Manual mode: layout stays locked. Click to restore Auto layout.'
                    : 'Auto mode: layout adapts to your copy and deck flow. Click to lock manually.'
                }
              >
                {isManualLocked ? (
                  <>
                    <Lock className="w-2.5 h-2.5" />
                    <span>Manual</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Auto</span>
                  </>
                )}
              </button>
            </div>
            <div
              data-testid="active-visual-rationale"
              className="text-[11px] text-slate-400 truncate mt-0.5"
              title={activeRationale}
            >
              {getCategoryLabel(activeCatalogEntry.category)} · {activeRationale}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-testid="reimagine-visual-btn"
            disabled={isReimaginingVisual}
            onClick={handleReimagineClick}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] disabled:opacity-60 border border-white/[0.08] text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            title="Ask the AI Visual Director for a fresh layout angle that avoids sibling repetition"
          >
            {isReimaginingVisual ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: theme.accent }} />
            ) : (
              <Wand2 className="w-3.5 h-3.5" style={{ color: theme.accent }} />
            )}
            <span>{isReimaginingVisual ? 'Designing...' : 'Re-imagine'}</span>
          </button>

          <button
            type="button"
            data-testid="open-visual-gallery-btn"
            onClick={() => setIsGalleryOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold text-white transition-colors cursor-pointer whitespace-nowrap hover:brightness-110"
            style={{
              backgroundColor: `${theme.accent}22`,
              borderColor: `${theme.accent}66`,
            }}
          >
            <LayoutGrid className="w-3.5 h-3.5" style={{ color: theme.accent }} />
            <span>Change Layout</span>
          </button>
        </div>
      </div>

      {/* 2. Essentials-First Contextual Editor for Active Visual */}
      {currentSlide.type === 'visual' && (
        <VisualSpecArchetypeEditor
          currentSlide={currentSlide}
          currentSlideIndex={currentSlideIndex}
          theme={theme}
          onUpdateField={onUpdateField}
          hideModeSwitcher={true}
        />
      )}

      {currentSlide.type === 'hub' && (
        <HubArchetypeEditor
          currentSlide={currentSlide}
          theme={theme}
          smart={smart}
          onUpdateField={onUpdateField}
          onUpdateSatLabel={onUpdateSatLabel}
          onUpdateSatIcon={onUpdateSatIcon}
          onUpdateCenterIcon={onUpdateCenterIcon}
          onUpdateCenterTag={onUpdateCenterTag}
          onAddSatNode={onAddSatNode}
          onDeleteSatNode={onDeleteSatNode}
          onRequestIconPicker={handleRequestIconPicker}
        />
      )}

      {(currentSlide.type === 'row' || currentSlide.type === 'poster') && (
        <DiagramSchematicEditor
          currentSlide={currentSlide}
          theme={theme}
          activeDiagramVariant={activeDiagramVariant}
          recommendedVariant={recommendedVariant}
          smart={smart}
          onSelectVariant={handleSelectVariant}
          onUpdateField={onUpdateField}
          onUpdateDiagramNode={onUpdateDiagramNode}
          onUpdateDiagramEdge={onUpdateDiagramEdge}
          onRequestIconPicker={handleRequestIconPicker}
        />
      )}

      {currentSlide.type === 'number' && (
        <NumberArchetypeEditor
          currentSlide={currentSlide}
          currentSlideIndex={currentSlideIndex}
          theme={theme}
          smart={smart}
          onUpdateField={onUpdateField}
          onUpdateCenterIcon={onUpdateCenterIcon}
          onRequestIconPicker={handleRequestIconPicker}
        />
      )}

      {currentSlide.type === 'code' && (
        <CodeArchetypeEditor
          currentSlide={currentSlide}
          smart={smart}
          onUpdateField={onUpdateField}
        />
      )}

      {currentSlide.type === 'metric' && (
        <MetricArchetypeEditor
          currentSlide={currentSlide}
          theme={theme}
          smart={smart}
          onUpdateField={onUpdateField}
          onRequestIconPicker={handleRequestIconPicker}
        />
      )}

      {currentSlide.type === 'compare' && (
        <CompareArchetypeEditor
          currentSlide={currentSlide}
          smart={smart}
          onUpdateField={onUpdateField}
        />
      )}

      {currentSlide.type === 'subjectPair' && (
        <SubjectPairArchetypeEditor
          currentSlide={currentSlide}
          smart={smart}
          onUpdateField={onUpdateField}
        />
      )}

      {(currentSlide.type === 'image' || currentSlide.type === 'poster') && (
        <ImageArchetypeEditor
          currentSlide={currentSlide}
          carousel={carousel}
          theme={theme}
          totalSlides={totalSlides}
          onSetSlideType={onSetSlideType}
          onUpdateField={onUpdateField}
          onUpdateSlideFields={onUpdateSlideFields}
          onUpdateCarouselField={onUpdateCarouselField}
          onOpenAiImageStudio={onOpenAiImageStudio}
          onOpenMediaSearch={onOpenMediaSearch}
          onExportVideoMp4={onExportVideoMp4}
          isExportingVideo={isExportingVideo}
          videoExportProgress={videoExportProgress}
          videoExportStage={videoExportStage}
          onGenerateFromVideo={onGenerateFromVideo}
          isGeneratingFromVideo={isGeneratingFromVideo}
          onGenerateFromPhoto={onGenerateFromPhoto}
        />
      )}

      {currentSlide.type === 'cta' && (
        <CtaArchetypeEditor
          currentSlide={currentSlide}
          carousel={carousel}
          theme={theme}
          onUpdateField={onUpdateField}
          onUpdateCarouselField={onUpdateCarouselField}
        />
      )}

      {/* 3. Progressive Disclosure: Position & Scale (Replaces Separate 4. Adjust Tab) */}
      {positionSection && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          <button
            type="button"
            data-testid="position-scale-accordion-toggle"
            onClick={() => onTogglePositionSection?.()}
            aria-expanded={isPositionSectionOpen}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.03] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              <span>Position &amp; Scale</span>
              {activeOverridesCount > 0 && (
                <span className="text-[11px] font-mono tabular-nums text-cyan-300">
                  · {activeOverridesCount} adjusted
                </span>
              )}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                isPositionSectionOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          {isPositionSectionOpen && (
            <div className="px-3 pb-3 pt-2 border-t border-white/[0.06] animate-fade-in">
              {positionSection}
            </div>
          )}
        </div>
      )}

      {/* 4. Progressive Disclosure: Layout Rationale, Cascade Lock & Deck Diversify */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <button
          type="button"
          data-testid="deck-layout-options-toggle"
          onClick={() => setIsDeckOptionsOpen((prev) => !prev)}
          aria-expanded={isDeckOptionsOpen}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.03] transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            {isManualLocked ? (
              <Lock className="w-3.5 h-3.5 text-amber-300" />
            ) : (
              <Unlock className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>Deck &amp; Layout Options</span>
            {isManualLocked && (
              <span className="text-[11px] text-amber-300">· Locked</span>
            )}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              isDeckOptionsOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isDeckOptionsOpen && (
          <div className="px-3 pb-3 pt-2 border-t border-white/[0.06] space-y-2.5 animate-fade-in">
            <div
              data-testid="layout-rationale-banner"
              className="text-[11px] text-slate-400 leading-relaxed"
            >
              <strong className="text-slate-200">{activeCatalogEntry.label}:</strong>{' '}
              {activeRationale}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                data-testid="toggle-cascade-lock-btn"
                onClick={() => onUpdateField('manualLayoutLocked', !isManualLocked)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                  isManualLocked
                    ? 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-slate-300 hover:text-white'
                }`}
                title="Protect this slide's layout when running Diversify Deck"
              >
                {isManualLocked ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-amber-300" />
                    <span>Cascade Locked</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Cascade Lock</span>
                  </>
                )}
              </button>

              {onDiversifyDeckVisuals && totalSlides > 1 && (
                <button
                  type="button"
                  onClick={onDiversifyDeckVisuals}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                  title="Auto-diversify unlocked slides across charts, code, metrics, and schematics"
                >
                  <Wand2 className="w-3.5 h-3.5" style={{ color: theme.accent }} />
                  <span>Diversify Deck</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Unified Grouped Visual Gallery Modal */}
      <VisualGalleryPicker
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        currentSlide={currentSlide}
        currentSlideIndex={currentSlideIndex}
        slides={carousel?.slides}
        activeEntryId={activeCatalogEntry.id}
        theme={theme}
        onSelectEntry={handleSelectCatalogEntry}
      />

      {/* Vector Icon Picker Modal Popover */}
      <IconPickerPopover
        isOpen={iconPickerState.isOpen}
        title={iconPickerState.title}
        selectedIcon={iconPickerState.currentIcon}
        onSelectIcon={(icon) => {
          iconPickerState.onSelect(icon);
          setIconPickerState((prev) => ({ ...prev, isOpen: false }));
        }}
        onClose={() => setIconPickerState((prev) => ({ ...prev, isOpen: false }))}
        theme={theme}
      />
    </div>
  );
};
