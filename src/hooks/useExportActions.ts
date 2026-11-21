import { useState, useCallback } from 'react';
import type {
  CarouselData,
  ThemePalette,
  SavedPostStatus,
} from '../types.ts';
import {
  copySlideToClipboard,
  downloadAllSlidesZip,
  getCanvasDimensionSpec,
  resolveExportTargetPresets,
  exportSingleSlideVideoMp4,
  isVideoSlide,
  type ExportBundleMode,
} from '../lib/canvasExporter.ts';
import { triggerBlobDownload } from '../lib/motion/index.ts';

import type { RiskReport } from '../lib/riskChecks.ts';

export interface UseExportActionsOptions {
  carousel: CarouselData;
  theme: ThemePalette;
  currentSlideIndex: number;
  isBlocked: boolean;
  blockersCount: number;
  isOfflineDraft: boolean;
  isReviewed: boolean;
  overrideExportBlock: boolean;
  confirmedRiskReason: string | null;
  qaReport: { canExport: boolean; hasCriticalFails?: boolean };
  riskReport: RiskReport | { status: 'SAFE' | 'WARN' | 'BLOCK' | 'PASS'; reasons?: string[] };
  onSaveValidPost?: (status: SavedPostStatus, allowOverride?: boolean) => Promise<void>;
  onShowToast: (msg: string) => void;
  setInspectorTab: (tab: 'copy' | 'visual' | 'position' | 'caption' | 'review') => void;
  setMobileStudioTab: (tab: 'canvas' | 'editor') => void;
}

export interface UseExportActionsReturn {
  isExportingZip: boolean;
  exportProgress: { current: number; total: number } | null;
  copiedType: 'caption' | 'slide' | null;
  setCopiedType: React.Dispatch<React.SetStateAction<'caption' | 'slide' | null>>;
  isExportingVideo: boolean;
  videoExportProgress: number;
  videoExportStage: string;
  handleExportZip: (exportMode?: ExportBundleMode) => Promise<void>;
  handleCopySlide: () => Promise<void>;
  handleExportSingleSlideVideoMp4: (fps?: 30 | 60) => Promise<void>;
}

/**
 * Cohesive hook for multi-slide ZIP export, single slide clipboard copy,
 * and MP4 single-slide video export with QA/Platform safety gates.
 */
export function useExportActions({
  carousel,
  theme,
  currentSlideIndex,
  isBlocked,
  blockersCount,
  isOfflineDraft,
  isReviewed,
  overrideExportBlock,
  confirmedRiskReason,
  qaReport,
  riskReport,
  onSaveValidPost,
  onShowToast,
  setInspectorTab,
  setMobileStudioTab,
}: UseExportActionsOptions): UseExportActionsReturn {
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [copiedType, setCopiedType] = useState<'caption' | 'slide' | null>(null);

  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [videoExportProgress, setVideoExportProgress] = useState(0);
  const [videoExportStage, setVideoExportStage] = useState('');

  const handleExportZip = useCallback(
    async (exportMode: ExportBundleMode = 'all') => {
      if (isBlocked) {
        setInspectorTab('review');
        setMobileStudioTab('editor');
        onShowToast(
          `⚠️ Export blocked: ${blockersCount} item${blockersCount > 1 ? 's' : ''} need attention in Review checklist.`
        );
        return;
      }

      if (isOfflineDraft && !isReviewed) {
        onShowToast('⚠️ Exporting unreviewed offline draft (Override active)...');
      } else if (!qaReport.canExport || riskReport.status === 'WARN') {
        onShowToast('⚠️ Exporting with advisory warnings...');
      }
      setIsExportingZip(true);
      const targetPresets = resolveExportTargetPresets(exportMode, carousel.dimensionPreset);
      const totalCount = carousel.slides.length * targetPresets.length;
      setExportProgress({ current: 0, total: totalCount });
      try {
        const audit = {
          isOverridden: overrideExportBlock,
          reviewedDraftConfirmation: isReviewed,
          confirmedRisk: overrideExportBlock ? confirmedRiskReason : null,
          overriddenAt: overrideExportBlock ? new Date().toISOString() : null,
        };
        await downloadAllSlidesZip(
          carousel,
          theme,
          (current, total) => {
            setExportProgress({ current, total });
          },
          carousel.visualOptions,
          audit,
          exportMode
        );
        if (onSaveValidPost) {
          try {
            await onSaveValidPost('posted', overrideExportBlock);
          } catch {
            // Non-fatal if background post save fails during ZIP download
          }
        }
        if (exportMode === 'all') {
          onShowToast(
            '5-in-1 Ready to Share Pack (TikTok 9:16, IG 4:5, IG 3:4, IG 1:1, IG Reels 9:16 + Captions) exported!'
          );
        } else if (exportMode === 'dual') {
          onShowToast('Dual Pack (TikTok 9:16 + Instagram 4:5) & Metricool bundle exported into ZIP!');
        } else {
          const spec = getCanvasDimensionSpec(targetPresets[0]);
          onShowToast(
            `All ${spec.width}×${spec.height} (${spec.shortLabel}) JPG slides & Metricool bundle exported into ZIP!`
          );
        }
      } catch (err) {
        console.error('ZIP export failed:', err);
        onShowToast('Failed to export ZIP file.');
      } finally {
        setIsExportingZip(false);
        setExportProgress(null);
      }
    },
    [
      isBlocked,
      blockersCount,
      isOfflineDraft,
      isReviewed,
      qaReport.canExport,
      riskReport.status,
      carousel,
      theme,
      overrideExportBlock,
      confirmedRiskReason,
      onSaveValidPost,
      onShowToast,
      setInspectorTab,
      setMobileStudioTab,
    ]
  );

  const handleCopySlide = useCallback(async () => {
    try {
      await copySlideToClipboard(carousel, currentSlideIndex, theme, carousel.visualOptions);
      setCopiedType('slide');
      onShowToast(`Copied Slide ${currentSlideIndex + 1} to clipboard!`);
      setTimeout(() => setCopiedType(null), 2000);
    } catch {
      onShowToast('Failed to copy slide.');
    }
  }, [carousel, currentSlideIndex, theme, onShowToast]);

  const handleExportSingleSlideVideoMp4 = useCallback(
    async (fps: 30 | 60 = 30) => {
      const activeSlide = carousel.slides[currentSlideIndex] || carousel.slides[0];
      if (!activeSlide || !isVideoSlide(activeSlide) || isExportingVideo) return;
      setIsExportingVideo(true);
      setVideoExportProgress(2);
      setVideoExportStage('Initializing 1080×1440 MP4 video export...');
      try {
        const targetPreset = carousel.dimensionPreset || 'ig-3:4';
        const result = await exportSingleSlideVideoMp4(carousel, currentSlideIndex, {
          fps,
          dimensionPreset: targetPreset,
          theme,
          visualOptions: carousel.visualOptions,
          preserveAudio: !(activeSlide.videoMuted ?? false),
          onProgress: (pct, stage) => {
            setVideoExportProgress(pct);
            setVideoExportStage(stage);
          },
        });
        triggerBlobDownload(result.blob, result.filename);
        onShowToast(
          result.warning
            ? `Exported ${result.width}×${result.height} @ ${result.fps}fps .${result.extension} — Warning: ${result.warning}`
            : `Exported ${result.width}×${result.height} @ ${result.fps}fps .${result.extension} video!`
        );
      } catch (err) {
        console.error('Single-slide video export failed:', err);
        onShowToast(
          err instanceof Error ? err.message : 'Failed to export single-slide MP4 video.'
        );
      } finally {
        setIsExportingVideo(false);
        setVideoExportProgress(0);
        setVideoExportStage('');
      }
    },
    [carousel, currentSlideIndex, theme, isExportingVideo, onShowToast]
  );

  return {
    isExportingZip,
    exportProgress,
    copiedType,
    setCopiedType,
    isExportingVideo,
    videoExportProgress,
    videoExportStage,
    handleExportZip,
    handleCopySlide,
    handleExportSingleSlideVideoMp4,
  };
}
