export type QASeverity = 'pass' | 'warn' | 'fail';

export interface QACheckResult {
  id: string;
  severity: QASeverity;
  slideIndex?: number; // undefined = deck-level check
  field?: string;
  message: string;
  value?: string | number; // current value for display
  limit?: string | number; // limit for display
}

export interface QAReport {
  results: QACheckResult[];
  passCount: number;
  warnCount: number;
  failCount: number;
  canExport: boolean; // true if no 'fail' results
}

export interface QACheckOptions {
  exportFormat?: 'jpg' | 'jpeg' | 'png';
  width?: number;
  height?: number;
}

export type PreExportCheckId =
  | 'contentQuality'
  | 'overflow'
  | 'contrast'
  | 'minFontSize'
  | 'safeZones'
  | 'truncatedCopy'
  | 'bilingualConsistency'
  | 'duplicateLabels'
  | 'chartDirection'
  | 'unverifiedNumbers'
  | 'missingSource'
  | 'brandLogoSafety';

export interface PreExportCheckItem {
  id: PreExportCheckId;
  label: string;
  passed: boolean;
  detail: string;
  fixLabel: string;
  slideIndex?: number;
}

export interface SummaryOnlyDetectionResult {
  isSummaryOnly: boolean;
  overlapRatio: number;
  reason?: string;
}

export interface GathererQualityGateResult {
  passed: boolean;
  blockingReasons: string[];
  warnings: string[];
  isSummaryOnly: boolean;
  summaryOnlyReason?: string;
}
