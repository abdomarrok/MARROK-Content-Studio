declare module '*video-studio/studio/expressRouter.mjs' {
  import type { Express } from 'express';
  export function registerVideoStudioRoutes(app: Express): void;
}

declare module '*video-studio/engine/schema.mjs' {
  export class ProjectValidationError extends Error {
    issues: string[];
    statusCode: number;
  }
  export function validateProjectConfig(raw: unknown, expectedId?: string | null): any;
  export function resolveEffectiveActVoice(project: any, act: any): any;
  export function loadProjectConfig(projectId: string): Promise<{ config: any; paths: any }>;
}

declare module '*video-studio/engine/audio-mix.mjs' {
  export function buildFfmpegMixPlan(project: any, projectPaths: any, options?: any): {
    args: string[];
    filterComplex: string;
    inputFiles: Array<{ absPath: string; labelPath: string }>;
    outPath: string;
    voCount: number;
    sfxPlacementCount: number;
  };
}

declare module '*video-studio/engine/audio-dsp.mjs' {
  export const DSP_SYNTHESIZERS: Record<string, (sampleRate?: number) => Buffer>;
  export function synthesizeMusicWav(sampleRate?: number, options?: { durationSec?: number; swellAtSec?: number | null }): Buffer;
}

declare module '*video-studio/engine/wav.mjs' {
  export function inspectWavBuffer(buffer: Buffer, waveformBins?: number): any;
  export function encodeWav24Stereo(left: Float32Array, right: Float32Array, sampleRate?: number): Buffer;
  export function normalizeStereoToHeadroom(left: Float32Array, right: Float32Array, targetPeakDb?: number): any;
  export function measureStereoRmsDb(left: Float32Array, right: Float32Array, startSec: number, endSec: number, sampleRate?: number): number;
}

declare module '*video-studio/engine/audio-vo.mjs' {
  export function computeActCacheKey(project: any, act: any, index: number): string;
  export function generateProjectVoiceovers(project: any, projectPaths: any, options?: any): Promise<any[]>;
}

declare module '*video-studio/engine/paths.mjs' {
  export function getProjectPaths(id: string): any;
}
