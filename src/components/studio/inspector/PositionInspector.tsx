import React from 'react';
import {
  GraphicalElementId,
  ElementLayoutOverride,
  SlideData,
  ThemePalette,
} from '../../../types.ts';
import { ElementInspector } from '../ElementInspector.tsx';

export interface PositionInspectorProps {
  slide: SlideData;
  theme: ThemePalette;
  isOpen?: boolean;
  headless?: boolean;
  onToggleOpen?: () => void;
  selectedElementId: GraphicalElementId | null;
  onSelectElement: (id: GraphicalElementId | null) => void;
  onUpdateOverride: (id: GraphicalElementId, override: ElementLayoutOverride | null) => void;
  onResetOverrides: () => void;
  onApplyToAllSlides?: (id: GraphicalElementId, override: ElementLayoutOverride | null) => void;
  onApplySlideLayoutToAllSlides?: () => void;
  onUpdateSlideFields?: (updates: Partial<SlideData>) => void;
}

export const PositionInspector: React.FC<PositionInspectorProps> = ({
  slide,
  theme,
  isOpen = true,
  headless = true,
  onToggleOpen = () => {},
  selectedElementId,
  onSelectElement,
  onUpdateOverride,
  onResetOverrides,
  onApplyToAllSlides,
  onApplySlideLayoutToAllSlides,
  onUpdateSlideFields,
}) => {
  return (
    <ElementInspector
      slide={slide}
      theme={theme}
      isOpen={isOpen}
      headless={headless}
      onToggleOpen={onToggleOpen}
      selectedElementId={selectedElementId}
      onSelectElement={onSelectElement}
      onUpdateOverride={onUpdateOverride}
      onResetOverrides={onResetOverrides}
      onApplyToAllSlides={onApplyToAllSlides}
      onApplySlideLayoutToAllSlides={onApplySlideLayoutToAllSlides}
      onUpdateSlideFields={onUpdateSlideFields}
    />
  );
};
