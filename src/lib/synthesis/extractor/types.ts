export interface UniversalSynthesisOptions {
  brand?: string;
  brandUrl?: string;
  targetSlideCount?: number;
  domainCategory?: string;
  theme?: string;
  centerIcon?: string;
  satIcons?: string[];
}

export interface ExtractedMetric {
  raw: string;
  value: string;
  unit: string;
  type: 'throughput' | 'memory' | 'latency' | 'multiplier' | 'percent' | 'general';
}

export interface ExtractedEntities {
  isComparative: boolean;
  leftTitle: string;
  leftShort: string;
  leftBullets: string[];
  leftLogo?: string;
  rightTitle: string;
  rightShort: string;
  rightBullets: string[];
  rightLogo?: string;
}

export interface StoryOptions {
  brand: string;
  brandUrl: string;
  targetCount: number;
  domainCategory?: string;
  metrics?: ExtractedMetric[];
}
