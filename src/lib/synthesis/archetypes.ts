import type { SlideData, SlideType } from '../../types.ts';
import { seedSingleSlideTakeaways } from './singleSlideCondenser.ts';
import { resolveSmartSlideVisuals } from './smartVisualDefaults.ts';

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
  const updated: SlideData = {
    ...slide,
    type: targetType,
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
      } else if (!updated.takeaways || updated.takeaways.length === 0 || forceRefresh) {
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
  }

  return updated;
}
