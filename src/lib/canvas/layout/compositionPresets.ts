import type {
  ElementLayoutOverride,
  GraphicalElementId,
  SlideCompositionPreset,
  SlideData,
} from '../../../types.ts';

/**
 * Applies a 1-click Slide Composition Preset to a slide, setting clean defaults
 * for layoutOverrides, compositionPreset, and freeMoveLayout.
 */
export function applySlideCompositionPreset(
  slide: SlideData,
  preset: SlideCompositionPreset
): SlideData {
  const existingOverrides = slide.layoutOverrides || {};
  const preserveVisibility = (id: GraphicalElementId): ElementLayoutOverride => {
    const prev = existingOverrides[id];
    return prev?.hidden ? { hidden: true } : {};
  };

  if (preset === 'standard') {
    return {
      ...slide,
      compositionPreset: 'standard',
      freeMoveLayout: false,
      layoutOverrides: undefined,
    };
  }

  if (preset === 'headline-first') {
    return {
      ...slide,
      compositionPreset: 'headline-first',
      freeMoveLayout: false,
      layoutOverrides: {
        headerBadge: { ...preserveVisibility('headerBadge') },
        titleBlock: { ...preserveVisibility('titleBlock'), scale: 1.02, align: 'center' },
        arabicTitleBlock: { ...preserveVisibility('arabicTitleBlock'), scale: 1.02, align: 'center' },
        graphicCard: { ...preserveVisibility('graphicCard'), scale: 0.92 },
        bodyBlock: { ...preserveVisibility('bodyBlock'), align: 'center' },
        arabicBodyBlock: { ...preserveVisibility('arabicBodyBlock'), align: 'center' },
      },
    };
  }

  if (preset === 'visual-hero') {
    return {
      ...slide,
      compositionPreset: 'visual-hero',
      freeMoveLayout: false,
      layoutOverrides: {
        graphicCard: { ...preserveVisibility('graphicCard'), scale: 1.12, dy: 12 },
        titleBlock: { ...preserveVisibility('titleBlock'), scale: 0.94, align: 'center' },
        arabicTitleBlock: { ...preserveVisibility('arabicTitleBlock'), scale: 0.94, align: 'center' },
        bodyBlock: { ...preserveVisibility('bodyBlock'), scale: 0.92, align: 'center' },
        arabicBodyBlock: { ...preserveVisibility('arabicBodyBlock'), scale: 0.92, align: 'center' },
      },
    };
  }

  if (preset === 'split-balanced') {
    return {
      ...slide,
      compositionPreset: 'split-balanced',
      freeMoveLayout: false,
      layoutOverrides: {
        graphicCard: { ...preserveVisibility('graphicCard'), scale: 0.96 },
        titleBlock: { ...preserveVisibility('titleBlock'), align: 'left' },
        arabicTitleBlock: { ...preserveVisibility('arabicTitleBlock'), align: 'right' },
        bodyBlock: { ...preserveVisibility('bodyBlock'), align: 'left' },
        arabicBodyBlock: { ...preserveVisibility('arabicBodyBlock'), align: 'right' },
      },
    };
  }

  // compact-editorial
  return {
    ...slide,
    compositionPreset: 'compact-editorial',
    freeMoveLayout: false,
    layoutOverrides: {
      graphicCard: { ...preserveVisibility('graphicCard'), scale: 0.9, dy: -10 },
      titleBlock: { ...preserveVisibility('titleBlock'), scale: 0.9, dy: -8, align: 'center' },
      arabicTitleBlock: { ...preserveVisibility('arabicTitleBlock'), scale: 0.9, dy: -4, align: 'center' },
      bodyBlock: { ...preserveVisibility('bodyBlock'), scale: 0.9, dy: -4, align: 'center' },
      arabicBodyBlock: { ...preserveVisibility('arabicBodyBlock'), scale: 0.9, dy: -4, align: 'center' },
    },
  };
}
