import type { SlideData, SlideType } from '../../types.ts';
import { seedSingleSlideTakeaways } from './singleSlideCondenser.ts';
import { explainArchetypeChoice, resolveSmartSlideVisuals } from './smartVisualDefaults.ts';
import { deriveVisualSpecFromSlide } from './visualSpecBuilder.ts';

/**
 * Instant Content-Aware Archetype Seeder:
 * When switching slide archetype or clicking "Smart Match to Copy" in AutonomousStudio,
 * analyzes the slide's English & Arabic headline/body copy via `resolveSmartSlideVisuals`
 * to seed topic-matched icons, nodes, metrics, comparison columns, step labels, and code diffs.
 */
export function seedSlideArchetypeData(
  slide: SlideData,
  targetType: SlideType,
  slideIndex: number = 0,
  forceRefresh: boolean = false
): SlideData {
  const isTypeChange = slide.type !== targetType;
  const cleanedOverrides =
    isTypeChange && targetType !== 'poster' && slide.layoutOverrides?.takeawaysBlock
      ? (() => {
          const rest = { ...slide.layoutOverrides };
          delete rest.takeawaysBlock;
          return Object.keys(rest).length > 0 ? rest : undefined;
        })()
      : slide.layoutOverrides;

  const updated: SlideData = {
    ...slide,
    type: targetType,
    layoutOverrides: cleanedOverrides,
    ...(isTypeChange && targetType !== 'poster' ? { takeaways: [] } : {}),
  };

  const smart = resolveSmartSlideVisuals(updated, slideIndex, forceRefresh || isTypeChange);

  switch (targetType) {
    case 'metric': {
      updated.metricValue = smart.metricValue;
      updated.metricLabel = smart.metricLabel;
      updated.metricDiff = smart.metricDiff;
      updated.metricIcon = smart.metricIcon;
      break;
    }

    case 'code': {
      updated.codeFileName = smart.codeFileName;
      updated.codeLanguage = smart.codeLanguage;
      updated.codeSnippet = smart.codeSnippet;
      break;
    }

    case 'compare': {
      updated.compareLeftTitle = smart.compareLeftTitle;
      updated.compareLeftBody = smart.compareLeftBody;
      updated.compareRightTitle = smart.compareRightTitle;
      updated.compareRightBody = smart.compareRightBody;
      break;
    }

    case 'hub': {
      updated.centerIcon = smart.centerIcon;
      updated.centerTag = smart.centerTag;
      updated.satLabels = smart.satLabels;
      updated.satIcons = smart.satIcons;
      break;
    }

    case 'cta': {
      if (!updated.ctaText || forceRefresh) {
        updated.ctaText = 'Join Discussion • شارك برأيك';
      }
      break;
    }

    case 'row': {
      updated.diagramVariant = smart.diagramVariant;
      updated.diagramNodes = smart.diagramNodes;
      updated.diagramEdges = smart.diagramEdges;
      updated.diagramFooter = smart.diagramFooter;
      break;
    }

    case 'image': {
      if (!updated.imageFit) {
        updated.imageFit = 'contain';
      }
      break;
    }

    case 'poster': {
      const isFullMemeOrMedia =
        (updated.imageFrameMode === 'full' || Boolean(updated.standaloneMeme)) &&
        Boolean(updated.imageUrl || updated.videoUrl);
      if (isFullMemeOrMedia) {
        updated.takeaways = [];
      } else if (
        forceRefresh ||
        updated.takeaways === undefined ||
        (isTypeChange && updated.takeaways.length === 0)
      ) {
        updated.takeaways = seedSingleSlideTakeaways(updated);
      }
      updated.diagramVariant = smart.diagramVariant;
      updated.diagramNodes = smart.diagramNodes;
      updated.diagramEdges = smart.diagramEdges;
      updated.diagramFooter = smart.diagramFooter;
      break;
    }

    case 'number': {
      updated.stepNumber = smart.stepNumber;
      updated.stepLabel = smart.stepLabel;
      updated.centerIcon = smart.numberIcon;
      break;
    }

    case 'subjectPair': {
      if (smart.subjectPair) {
        updated.subjectPair = {
          ...smart.subjectPair,
          ...(slide.subjectPair || {}),
        };
      } else if (!updated.subjectPair) {
        updated.subjectPair = {
          beforeSystem: '',
          afterSystem: '',
          beforeLabel: 'BEFORE',
          afterLabel: 'AFTER',
          colorMode: 'official',
          logoWidthPct: 11,
          creativeMotif: 'stream-flow',
          flowLabel: '',
        };
      }
      // Also seed topic-matched diagram schematic fields so empty Subject Pair cleanly falls back to Mechanism schematic on canvas
      updated.diagramVariant = updated.diagramVariant || smart.diagramVariant;
      updated.diagramNodes = updated.diagramNodes || smart.diagramNodes;
      updated.diagramEdges = updated.diagramEdges || smart.diagramEdges;
      updated.diagramFooter = updated.diagramFooter || smart.diagramFooter;
      break;
    }

    case 'visual': {
      if (!updated.visualSpec || forceRefresh) {
        updated.visualSpec = deriveVisualSpecFromSlide(
          updated,
          updated.visualSpec?.kind,
          slideIndex
        );
      }
      break;
    }
  }

  if (forceRefresh || isTypeChange || !updated.layoutRationale) {
    updated.layoutRationale = explainArchetypeChoice(updated, slideIndex);
  }

  return updated;
}
