import React from 'react';
import {
  CanvasDimensionPreset,
  CarouselData,
  ThemePalette,
} from '../../../types.ts';
import type { ExportBundleMode } from '../../../lib/canvas/exporter.ts';
import { QAReport, PreExportCheckId } from '../../../lib/qaChecks.ts';
import { RiskReport } from '../../../lib/riskChecks.ts';
import { PublishChecklist } from '../PublishChecklist.tsx';

export interface ReviewInspectorProps {
  carousel: CarouselData;
  currentSlideIndex: number;
  theme: ThemePalette;
  isOfflineDraft: boolean;
  isReviewed: boolean;
  qaReport: QAReport;
  riskReport?: RiskReport;
  overrideExportBlock?: boolean;
  onToggleOverrideBlock?: (confirmedRiskReason?: string) => void;
  onToggleReviewDraft: () => void;
  onRetryWithAi: () => void;
  onJumpToSlide?: (slideIndex: number) => void;
  onAutoFixPreExportCheck?: (checkId: PreExportCheckId, slideIndex?: number) => void;
  onToggleOfficialBrandIcon?: (brandKey: string, enabled: boolean) => void;
  onUpdateCreator?: (creator: string) => void;
  onSelectDimensionPreset?: (preset: CanvasDimensionPreset) => void;
  onExportZip?: (exportMode: ExportBundleMode) => void;
  onDownloadSingleSlide?: (preset: CanvasDimensionPreset) => void;
  onOpenPublishScheduleModal?: (tab?: 'single' | 'bulk' | 'storage') => void;
  isExportingZip?: boolean;
  onShowToast?: (msg: string) => void;
}

export const ReviewInspector: React.FC<ReviewInspectorProps> = (props) => {
  return (
    <div className="space-y-4 w-full" data-testid="review-inspector">
      <PublishChecklist {...props} />
    </div>
  );
};
