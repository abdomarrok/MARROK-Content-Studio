import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CarouselData,
  CoverStyle,
  DiagramNode,
  DiagramVariant,
  HookVariant,
  PostFormat,
  SlideData,
  SlideFieldUpdater,
  SlideType,
} from '../types.ts';
import { sanitizeSlide } from '../lib/textSanitizer.ts';
import {
  seedSlideArchetypeData,
  resolveSmartSlideVisuals,
  analyzeSlideTextForArchetype,
  diversifyDeckArchetypesAndVisuals,
  autoSyncSlideGraphicsFromCopy,
  evaluateAutoLayoutForSlideEdit,
  getSlideCatalogId,
  materializeLayoutForSlide,
  rankSlideLayoutsForDeck,
  findCatalogDescriptor,
  applyCoverStyleToSlide,
  resolveSlide1CoverStyle,
  deriveCoverTeaserForSlide,
} from '../lib/synthesizer.ts';
import { requestAiVisualDirection } from '../lib/studio/visualDirectorClient.ts';
import { resolveEffectivePostFormat } from '../lib/studio/formatWorkspace.ts';

export interface UseVisualDirectorActionsOptions {
  carousel: CarouselData;
  currentSlideIndex: number;
  currentSlideIndexRef: React.MutableRefObject<number>;
  activePostFormat: PostFormat;
  historyRestoreVersion: number;
  isGenerating: boolean;
  applyDeckUpdate: (updater: (prev: CarouselData) => CarouselData) => void;
  changeSlide: (next: number | ((prev: number) => number), nextLength?: number) => void;
  handleUpdateCurrentSlide: SlideFieldUpdater;
  onShowToast: (msg: string) => void;
}

export function useVisualDirectorActions({
  carousel,
  currentSlideIndex,
  currentSlideIndexRef,
  activePostFormat,
  historyRestoreVersion,
  isGenerating,
  applyDeckUpdate,
  changeSlide,
  handleUpdateCurrentSlide,
  onShowToast,
}: UseVisualDirectorActionsOptions) {
  const [isReimaginingVisual, setIsReimaginingVisual] = useState(false);
  const reimagineAbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const triedLayoutsBySlideRef = useRef<Map<number, { textKey: string; triedIds: string[] }>>(
    new Map()
  );
  const lastAutoEvalKeyRef = useRef<string>('');
  const lastSeenRestoreVersionRef = useRef<number>(historyRestoreVersion);
  const latestCarouselRef = useRef(carousel);
  latestCarouselRef.current = carousel;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      reimagineAbortRef.current?.abort();
      reimagineAbortRef.current = null;
    };
  }, []);

  const currentSlide = carousel.slides[currentSlideIndex] || carousel.slides[0];
  const smartCurrentVisuals = useMemo(
    () => resolveSmartSlideVisuals(currentSlide, currentSlideIndex, false),
    [currentSlide, currentSlideIndex]
  );

  // Debounced live copy watcher: upgrades unlocked slide layouts automatically without flickering.
  // Skips history restorations (Undo/Redo via historyRestoreVersion) so Redo stack is never wiped.
  const currentSlideEvalKey = currentSlide
    ? `${currentSlideIndex}|${currentSlide.enTitle || ''}|${currentSlide.arTitle || ''}|${currentSlide.enBody || ''}|${currentSlide.arBody || ''}|${activePostFormat}|${Boolean(currentSlide.manualLayoutLocked)}`
    : '';

  useEffect(() => {
    if (!currentSlideEvalKey) return;
    if (historyRestoreVersion !== lastSeenRestoreVersionRef.current) {
      lastSeenRestoreVersionRef.current = historyRestoreVersion;
      lastAutoEvalKeyRef.current = currentSlideEvalKey;
      return;
    }
    if (!lastAutoEvalKeyRef.current) {
      lastAutoEvalKeyRef.current = currentSlideEvalKey;
      return;
    }
    const [prevIdx] = lastAutoEvalKeyRef.current.split('|');
    const [nextIdx] = currentSlideEvalKey.split('|');
    if (prevIdx !== nextIdx) {
      lastAutoEvalKeyRef.current = currentSlideEvalKey;
      return;
    }
    if (lastAutoEvalKeyRef.current === currentSlideEvalKey) {
      return;
    }

    const slideSnapshot = latestCarouselRef.current.slides[currentSlideIndex];
    if (
      isGenerating ||
      isReimaginingVisual ||
      !slideSnapshot ||
      slideSnapshot.manualLayoutLocked ||
      slideSnapshot.type === 'cta' ||
      slideSnapshot.standaloneMeme ||
      slideSnapshot.imageUrl ||
      slideSnapshot.videoUrl
    ) {
      lastAutoEvalKeyRef.current = currentSlideEvalKey;
      return;
    }

    const targetIdx = currentSlideIndex;
    const timer = window.setTimeout(() => {
      const deckNow = latestCarouselRef.current;
      const slideNow = deckNow.slides[targetIdx];
      if (!slideNow || slideNow.manualLayoutLocked || isReimaginingVisual) return;

      const formatNow = resolveEffectivePostFormat(deckNow);
      const nextSlide = evaluateAutoLayoutForSlideEdit(slideNow, deckNow.slides, targetIdx, {
        postFormat: formatNow,
      });

      lastAutoEvalKeyRef.current = `${targetIdx}|${slideNow.enTitle || ''}|${slideNow.arTitle || ''}|${slideNow.enBody || ''}|${slideNow.arBody || ''}|${formatNow}|${Boolean(slideNow.manualLayoutLocked)}`;

      if (!nextSlide) return;

      applyDeckUpdate((prev) => {
        if (targetIdx < 0 || targetIdx >= prev.slides.length) return prev;
        const newSlides = [...prev.slides];
        newSlides[targetIdx] = sanitizeSlide(nextSlide, targetIdx, prev.slides.length);
        return { ...prev, slides: newSlides };
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    currentSlideEvalKey,
    currentSlideIndex,
    historyRestoreVersion,
    isGenerating,
    isReimaginingVisual,
    applyDeckUpdate,
  ]);

  // Immediate Archetype Switcher: Auto-seeds required fields and locks layout manually
  const handleSetSlideType = (newType: SlideType) => {
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      const current = prev.slides[targetIndex];
      if (!current) return prev;

      const seeded = seedSlideArchetypeData(current, newType, targetIndex, false);
      const lockedSeeded: SlideData = {
        ...seeded,
        manualLayoutLocked: true,
        layoutRationale: `Manual ${newType.toUpperCase()} — locked by creator`,
      };
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = sanitizeSlide(lockedSeeded, targetIndex, prev.slides.length);

      return {
        ...prev,
        slides: newSlides,
        sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
      };
    });
    onShowToast(`Switched layout to ${newType.toUpperCase()} (Manual lock enabled)`);
  };

  // Toggle Auto vs Manual Layout Mode on Active Slide
  const handleToggleAutoLayout = () => {
    const targetIndex = Math.min(
      currentSlideIndexRef.current,
      latestCarouselRef.current.slides.length - 1
    );
    const current = latestCarouselRef.current.slides[targetIndex];
    if (!current) return;

    if (current.manualLayoutLocked) {
      const deckSlides = latestCarouselRef.current.slides;
      const ranked = rankSlideLayoutsForDeck(current, deckSlides, targetIndex, {
        postFormat: activePostFormat,
      });
      const best = ranked[0];
      let chosenLabel = current.type.toUpperCase();
      applyDeckUpdate((prev) => {
        const idx = Math.min(targetIndex, prev.slides.length - 1);
        const curr = prev.slides[idx];
        if (!curr) return prev;
        const updatedSlide = best
          ? materializeLayoutForSlide(curr, best, idx, prev.slides.length, {
              rationalePrefix: 'Auto-picked',
              lockLayout: false,
              forceRefreshVisuals: true,
            })
          : { ...curr, manualLayoutLocked: false };
        if (best) chosenLabel = best.label;
        const newSlides = [...prev.slides];
        newSlides[idx] = sanitizeSlide(updatedSlide, idx, prev.slides.length);
        return {
          ...prev,
          slides: newSlides,
          sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
        };
      });
      lastAutoEvalKeyRef.current = `${targetIndex}|${current.enTitle || ''}|${current.arTitle || ''}|${current.enBody || ''}|${current.arBody || ''}|${activePostFormat}|false`;
      onShowToast(`Auto layout enabled: ${chosenLabel}`);
    } else {
      applyDeckUpdate((prev) => {
        const idx = Math.min(targetIndex, prev.slides.length - 1);
        const curr = prev.slides[idx];
        if (!curr) return prev;
        const newSlides = [...prev.slides];
        newSlides[idx] = {
          ...curr,
          manualLayoutLocked: true,
          layoutRationale:
            curr.layoutRationale || `Manual ${curr.type.toUpperCase()} — locked by creator`,
        };
        return { ...prev, slides: newSlides };
      });
      lastAutoEvalKeyRef.current = `${targetIndex}|${current.enTitle || ''}|${current.arTitle || ''}|${current.enBody || ''}|${current.arBody || ''}|${activePostFormat}|true`;
      onShowToast(`Manual layout locked for Slide ${targetIndex + 1}`);
    }
  };

  // On-Demand AI Visual Director ("Re-imagine")
  const handleReimagineVisual = async () => {
    const deckSnapshot = latestCarouselRef.current;
    const targetIndex = Math.min(currentSlideIndexRef.current, deckSnapshot.slides.length - 1);
    const targetSlide = deckSnapshot.slides[targetIndex];
    if (!targetSlide) return;

    reimagineAbortRef.current?.abort();
    const controller = new AbortController();
    reimagineAbortRef.current = controller;
    setIsReimaginingVisual(true);

    const textKey = `${targetSlide.enTitle || ''}|${targetSlide.enBody || ''}|${targetSlide.arTitle || ''}`;
    const existingEntry = triedLayoutsBySlideRef.current.get(targetIndex);
    const currentCatalogId = getSlideCatalogId(targetSlide);
    const prevTried =
      existingEntry && existingEntry.textKey === textKey ? existingEntry.triedIds : [];
    const excludeLayouts = Array.from(new Set([...prevTried, currentCatalogId]));

    try {
      const result = await requestAiVisualDirection({
        slide: targetSlide,
        slides: deckSnapshot.slides,
        slideIndex: targetIndex,
        category: deckSnapshot.category,
        postFormat: activePostFormat,
        excludeLayouts,
        signal: controller.signal,
      });

      if (!isMountedRef.current || controller.signal.aborted) return;

      triedLayoutsBySlideRef.current.set(targetIndex, {
        textKey,
        triedIds: Array.from(new Set([...excludeLayouts, result.chosenLayoutId])),
      });

      lastAutoEvalKeyRef.current = `${targetIndex}|${targetSlide.enTitle || ''}|${targetSlide.arTitle || ''}|${targetSlide.enBody || ''}|${targetSlide.arBody || ''}|${activePostFormat}|false`;

      applyDeckUpdate((prev) => {
        if (targetIndex < 0 || targetIndex >= prev.slides.length) return prev;
        const curr = prev.slides[targetIndex];
        const merged: SlideData = {
          ...curr,
          ...result.slideUpdates,
          enTitle: curr.enTitle,
          arTitle: curr.arTitle,
          enBody: curr.enBody,
          arBody: curr.arBody,
          manualLayoutLocked: false,
          layoutRationale: result.rationale,
        };
        const newSlides = [...prev.slides];
        newSlides[targetIndex] = sanitizeSlide(merged, targetIndex, prev.slides.length);
        return {
          ...prev,
          slides: newSlides,
          sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
        };
      });

      const chosenDesc = findCatalogDescriptor(result.chosenLayoutId);
      const engineTag = result.engine === 'ungrounded' ? 'AI Visual Director' : 'Smart Director';
      onShowToast(`${engineTag}: switched to ${chosenDesc?.label || result.chosenLayoutId}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      onShowToast(err instanceof Error ? err.message : 'Could not re-imagine visual layout');
    } finally {
      if (reimagineAbortRef.current === controller) {
        reimagineAbortRef.current = null;
        if (isMountedRef.current) {
          setIsReimaginingVisual(false);
        }
      }
    }
  };

  // 1-Click Smart Match Visuals to Slide Copy (sets manualLayoutLocked: false when picking best fit)
  const handleSmartMatchVisuals = (useRecommendedArchetype = true) => {
    let matchedTypeLabel = '';
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      const current = prev.slides[targetIndex];
      if (!current) return prev;

      if (useRecommendedArchetype) {
        const ranked = rankSlideLayoutsForDeck(current, prev.slides, targetIndex, {
          postFormat: resolveEffectivePostFormat(prev),
        });
        const best = ranked[0];
        if (best) {
          matchedTypeLabel = best.label;
          const materialized = materializeLayoutForSlide(current, best, targetIndex, prev.slides.length, {
            rationalePrefix: 'Auto-picked',
            lockLayout: false,
            forceRefreshVisuals: true,
          });
          const newSlides = [...prev.slides];
          newSlides[targetIndex] = sanitizeSlide(materialized, targetIndex, prev.slides.length);
          return {
            ...prev,
            slides: newSlides,
            sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
          };
        }
      }

      const recommendedArchetype = analyzeSlideTextForArchetype(current, targetIndex);
      const targetType: SlideType = useRecommendedArchetype ? recommendedArchetype : current.type;
      matchedTypeLabel = targetType.toUpperCase();

      const seeded = seedSlideArchetypeData(current, targetType, targetIndex, true);
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = sanitizeSlide(
        {
          ...seeded,
          manualLayoutLocked: useRecommendedArchetype ? false : current.manualLayoutLocked,
        },
        targetIndex,
        prev.slides.length
      );

      return {
        ...prev,
        slides: newSlides,
        sourceMeta: prev.sourceMeta ? { ...prev.sourceMeta } : undefined,
      };
    });
    onShowToast(
      useRecommendedArchetype
        ? `Auto-picked ${matchedTypeLabel} for slide copy`
        : `Updated ${matchedTypeLabel} visual elements from slide copy`
    );
  };

  // 1-Click Schematic Variant Switcher from Stage Console (locks manually)
  const handleSelectDiagramVariant = (variant: DiagramVariant) => {
    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      const current = prev.slides[targetIndex];
      if (!current) return prev;

      const refreshed = resolveSmartSlideVisuals(
        { ...current, type: current.type === 'poster' ? 'poster' : 'row', diagramVariant: variant },
        targetIndex,
        true
      );
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = sanitizeSlide(
        {
          ...current,
          type: current.type === 'poster' ? 'poster' : 'row',
          diagramVariant: variant,
          diagramNodes: refreshed.diagramNodes,
          diagramEdges: refreshed.diagramEdges,
          diagramFooter: refreshed.diagramFooter,
          manualLayoutLocked: true,
          layoutRationale: `Manual ${variant.toUpperCase()} — locked by creator`,
        },
        targetIndex,
        prev.slides.length
      );
      return { ...prev, slides: newSlides };
    });
    onShowToast(`Switched diagram schematic to ${variant.toUpperCase()}`);
  };

  // 1-Click Deck-Wide Dynamic Archetype & Graphic Diversifier (Slides 2 to N-1)
  const handleDiversifyDeckVisuals = () => {
    applyDeckUpdate((prev) => {
      const diversified = diversifyDeckArchetypesAndVisuals(prev.slides).map((s, idx, arr) =>
        sanitizeSlide(s, idx, arr.length)
      );
      return {
        ...prev,
        slides: diversified,
      };
    });
    onShowToast('✨ Diversified Slides 2–7 across Compare, Code, Metric & Schematic layouts');
  };

  // Slide Management Handlers
  const handleAddSlide = () => {
    const targetIdx = Math.min(currentSlideIndex + 1, carousel.slides.length);
    const baseSlide: SlideData = {
      type: 'row',
      enTitle: 'Core technical mechanism.',
      arTitle: 'آلية العمل التقنية.',
      enBody: 'Direct architectural explanation of how the system executes under the hood.',
      arBody: 'شرح معماري مباشر لكيفية عمل النظام في الخلفية.',
    };
    const newSlide = seedSlideArchetypeData(baseSlide, 'row', targetIdx, true);
    const nextLength = carousel.slides.length + 1;
    applyDeckUpdate((prev) => {
      const insertAt = Math.min(currentSlideIndex + 1, prev.slides.length);
      const newSlides = [...prev.slides];
      newSlides.splice(insertAt, 0, newSlide);
      return { ...prev, slides: newSlides };
    });
    changeSlide(targetIdx, nextLength);
    onShowToast(`Added slide #${targetIdx + 1}`);
  };

  const handleDuplicateSlide = () => {
    const fromIdx = Math.min(currentSlideIndex, carousel.slides.length - 1);
    if (!carousel.slides[fromIdx]) return;
    const targetIdx = fromIdx + 1;
    const nextLength = carousel.slides.length + 1;
    applyDeckUpdate((prev) => {
      const idx = Math.min(currentSlideIndex, prev.slides.length - 1);
      const current = prev.slides[idx];
      if (!current) return prev;
      const clone = structuredClone(current);
      const newSlides = [...prev.slides];
      newSlides.splice(idx + 1, 0, clone);
      return { ...prev, slides: newSlides };
    });
    changeSlide(targetIdx, nextLength);
    onShowToast(`Duplicated slide #${targetIdx + 1}`);
  };

  const handleDeleteSlide = () => {
    if (carousel.slides.length <= 3) {
      onShowToast('Minimum 3 slides required in carousel');
      return;
    }
    const deleteAt = Math.min(currentSlideIndex, carousel.slides.length - 1);
    const nextLength = carousel.slides.length - 1;
    const newIdx = Math.max(0, Math.min(nextLength - 1, deleteAt - 1));
    applyDeckUpdate((prev) => {
      if (prev.slides.length <= 3) return prev;
      const targetDeleteAt = Math.min(currentSlideIndex, prev.slides.length - 1);
      const newSlides = prev.slides.filter((_, idx) => idx !== targetDeleteAt);
      return {
        ...prev,
        slides: newSlides,
      };
    });
    changeSlide(newIdx, nextLength);
    onShowToast(`Deleted slide #${deleteAt + 1}`);
  };

  const handleMoveSlide = (direction: 'left' | 'right') => {
    const fromIndex = Math.min(currentSlideIndex, carousel.slides.length - 1);
    const targetIndex = direction === 'left' ? fromIndex - 1 : fromIndex + 1;
    if (targetIndex < 0 || targetIndex >= carousel.slides.length) return;
    applyDeckUpdate((prev) => {
      const srcIdx = Math.min(currentSlideIndex, prev.slides.length - 1);
      const dstIdx = direction === 'left' ? srcIdx - 1 : srcIdx + 1;
      if (dstIdx < 0 || dstIdx >= prev.slides.length) return prev;
      const newSlides = [...prev.slides];
      const [removed] = newSlides.splice(srcIdx, 1);
      newSlides.splice(dstIdx, 0, removed);
      return { ...prev, slides: newSlides };
    });
    changeSlide(targetIndex, carousel.slides.length);
    onShowToast(`Moved slide to position #${targetIndex + 1}`);
  };

  const handleApplyCoverStyle = (coverStyle: CoverStyle) => {
    applyDeckUpdate((prev) => {
      if (!prev.slides[0]) return prev;
      const newSlides = [...prev.slides];
      const nextCover = applyCoverStyleToSlide(
        newSlides[0],
        coverStyle,
        0,
        newSlides.length,
        true,
        newSlides
      );
      newSlides[0] = sanitizeSlide(nextCover, 0, newSlides.length);
      return { ...prev, slides: newSlides };
    });
    onShowToast(`Slide 1 Cover style switched to ${coverStyle}`);
  };

  const handleApplyHookVariant = (variant: HookVariant) => {
    applyDeckUpdate((prev) => {
      if (!prev.slides[0]) return prev;
      const newSlides = [...prev.slides];
      const isMultiDeck =
        newSlides.length > 1 && prev.postFormat !== 'single' && prev.postFormat !== 'meme';
      const baseSlide0 = newSlides[0];
      const resolvedStyle =
        variant.coverStyle ||
        baseSlide0.coverStyle ||
        resolveSlide1CoverStyle(
          {
            ...baseSlide0,
            enTitle: variant.enTitle,
            arTitle: variant.arTitle,
          },
          newSlides
        );
      const derivedTeasers = isMultiDeck
        ? deriveCoverTeaserForSlide(
            {
              ...baseSlide0,
              enTitle: variant.enTitle,
              arTitle: variant.arTitle,
              coverTeaserEn: variant.coverTeaserEn || baseSlide0.coverTeaserEn,
              coverTeaserAr: variant.coverTeaserAr || baseSlide0.coverTeaserAr,
            },
            newSlides
          )
        : undefined;

      const updatedSlide0: SlideData = {
        ...baseSlide0,
        type: variant.coverArchetype || baseSlide0.type,
        enTitle: variant.enTitle,
        arTitle: variant.arTitle,
        enBody: isMultiDeck ? '' : variant.enBody,
        arBody: isMultiDeck ? '' : variant.arBody,
        centerIcon: variant.centerIcon || baseSlide0.centerIcon,
        hookKicker: variant.hookKicker || baseSlide0.hookKicker,
        ...(isMultiDeck
          ? {
              storyRole: 'hook' as const,
              compositionPreset: 'headline-first' as const,
              coverStyle: resolvedStyle,
              coverTeaserEn: variant.coverTeaserEn || derivedTeasers?.coverTeaserEn || '',
              coverTeaserAr: variant.coverTeaserAr || derivedTeasers?.coverTeaserAr || '',
              showSwipeCue: baseSlide0.showSwipeCue ?? true,
            }
          : {}),
      };

      const prepared = isMultiDeck
        ? applyCoverStyleToSlide(
            updatedSlide0,
            resolvedStyle,
            0,
            newSlides.length,
            Boolean(baseSlide0.manualLayoutLocked),
            newSlides
          )
        : autoSyncSlideGraphicsFromCopy(
            seedSlideArchetypeData(updatedSlide0, updatedSlide0.type),
            0
          );

      newSlides[0] = sanitizeSlide(prepared, 0, newSlides.length);
      return { ...prev, slides: newSlides };
    });
    onShowToast(
      `Applied "${variant.tag}" Hook${
        variant.coverStyle
          ? ` (${variant.coverStyle})`
          : variant.coverArchetype
          ? ` (${variant.coverArchetype.toUpperCase()} Cover)`
          : ''
      } to Slide 1`
    );
  };

  // Orbital Hub & Diagram Node/Edge CRUD
  const handleUpdateSatLabel = (index: number, value: string) => {
    const currentLabels = [...smartCurrentVisuals.satLabels];
    currentLabels[index] = value;
    handleUpdateCurrentSlide('satLabels', currentLabels);
  };

  const handleUpdateSatIcon = (index: number, iconName: string) => {
    const currentIcons = [...smartCurrentVisuals.satIcons];
    currentIcons[index] = iconName;
    handleUpdateCurrentSlide('satIcons', currentIcons);
    onShowToast(`Updated node #${index + 1} icon to ${iconName}`);
  };

  const handleUpdateCenterIcon = (iconName: string) => {
    handleUpdateCurrentSlide('centerIcon', iconName);
    onShowToast(`Updated central hub icon to ${iconName}`);
  };

  const handleUpdateCenterTag = (tag: string) => {
    handleUpdateCurrentSlide('centerTag', tag);
  };

  const handleAddSatNode = () => {
    const currentLabels = [...smartCurrentVisuals.satLabels];
    if (currentLabels.length >= 6) {
      onShowToast('Maximum 6 orbital nodes reached');
      return;
    }
    const defaultAdditions = [
      'Gateway',
      'Cache Layer',
      'Event Stream',
      'Policy Mesh',
      'Telemetry',
      'Core Engine',
    ];
    const newLabel = defaultAdditions[currentLabels.length] || `Node ${currentLabels.length + 1}`;
    const newLabels = [...currentLabels, newLabel];

    const currentIcons = [...smartCurrentVisuals.satIcons];
    const iconPool = ['zap', 'hardDrive', 'lock', 'terminal', 'cloud', 'activity', 'cpu', 'box'];
    const newIcons = [...currentIcons, iconPool[currentLabels.length % iconPool.length]];

    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = {
        ...newSlides[targetIndex],
        satLabels: newLabels,
        satIcons: newIcons,
      };
      return { ...prev, slides: newSlides };
    });
    onShowToast(`Added orbital node #${newLabels.length}`);
  };

  const handleDeleteSatNode = (indexToDelete: number) => {
    const currentLabels = [...smartCurrentVisuals.satLabels];
    if (currentLabels.length <= 2) {
      onShowToast('Hub diagram requires at least 2 orbital nodes');
      return;
    }
    const newLabels = currentLabels.filter((_, idx) => idx !== indexToDelete);
    const currentIcons = [...smartCurrentVisuals.satIcons];
    const newIcons = currentIcons.filter((_, idx) => idx !== indexToDelete);

    applyDeckUpdate((prev) => {
      const targetIndex = Math.min(currentSlideIndex, prev.slides.length - 1);
      if (targetIndex < 0 || !prev.slides[targetIndex]) return prev;
      const newSlides = [...prev.slides];
      newSlides[targetIndex] = {
        ...newSlides[targetIndex],
        satLabels: newLabels,
        satIcons: newIcons,
      };
      return { ...prev, slides: newSlides };
    });
    onShowToast(`Deleted orbital node #${indexToDelete + 1}`);
  };

  const handleUpdateDiagramNode = (nodeIndex: number, field: keyof DiagramNode, value: string) => {
    const existing = smartCurrentVisuals.diagramNodes.map((n) => ({ ...n }));
    existing[nodeIndex] = {
      ...existing[nodeIndex],
      [field]: value,
    };
    handleUpdateCurrentSlide('diagramNodes', existing);
  };

  const handleUpdateDiagramEdge = (edgeIndex: number, value: string) => {
    const currentEdges = [...smartCurrentVisuals.diagramEdges];
    currentEdges[edgeIndex] = value;
    handleUpdateCurrentSlide('diagramEdges', currentEdges);
  };

  return {
    isReimaginingVisual,
    smartCurrentVisuals,
    handleSetSlideType,
    handleToggleAutoLayout,
    handleReimagineVisual,
    handleSmartMatchVisuals,
    handleSelectDiagramVariant,
    handleDiversifyDeckVisuals,
    handleAddSlide,
    handleDuplicateSlide,
    handleDeleteSlide,
    handleMoveSlide,
    handleApplyCoverStyle,
    handleApplyHookVariant,
    handleUpdateSatLabel,
    handleUpdateSatIcon,
    handleUpdateCenterIcon,
    handleUpdateCenterTag,
    handleAddSatNode,
    handleDeleteSatNode,
    handleUpdateDiagramNode,
    handleUpdateDiagramEdge,
  };
}
