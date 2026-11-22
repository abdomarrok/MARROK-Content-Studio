import type {
  CanvasDimensionPreset,
  SlideCompositionPreset,
  TextAlignment,
} from '../../../types.ts';

export interface TextBlockLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  top: number;
  bottom: number;
  height: number;
  firstBaselineY: number;
  dx: number;
  dy: number;
  scale: number;
  opacity: number;
  align: TextAlignment;
  hidden: boolean;
}

export interface GraphicCardLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  effectiveTop: number;
  effectiveBottom: number;
  dx: number;
  dy: number;
  scale: number;
  opacity: number;
  hidden: boolean;
}

export interface SwipeCueLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  hidden: boolean;
}

export interface ComputedSlideLayout {
  slideType: string;
  dimensionPreset: CanvasDimensionPreset;
  compositionPreset: SlideCompositionPreset;
  freeMoveLayout: boolean;
  isSlide1Cover?: boolean;
  canvasWidth: number;
  canvasHeight: number;
  headerBadge: {
    x: number;
    y: number;
    width: number;
    height: number;
    dx: number;
    dy: number;
    scale: number;
    opacity: number;
    hidden: boolean;
  };
  graphicCard?: GraphicCardLayout;
  titleBlock?: TextBlockLayout;
  arabicTitleBlock?: TextBlockLayout;
  coverTeaserBlock?: TextBlockLayout;
  arabicCoverTeaserBlock?: TextBlockLayout;
  bodyBlock?: TextBlockLayout;
  arabicBodyBlock?: TextBlockLayout;
  swipeCueBox?: SwipeCueLayout;
  takeawaysBlock?: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    bottom: number;
    dx: number;
    dy: number;
    scale: number;
    opacity: number;
    hidden: boolean;
  };
  ctaButton?: {
    x: number;
    y: number;
    width: number;
    height: number;
    dx: number;
    dy: number;
    scale: number;
    opacity: number;
    hidden: boolean;
  };
  attributionCard?: {
    x: number;
    y: number;
    width: number;
    height: number;
    dx: number;
    dy: number;
    scale: number;
    opacity: number;
    hidden: boolean;
  };
  hasCollisionWarning: boolean;
  collisionDetails?: string[];
}
