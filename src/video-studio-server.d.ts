declare module '*video-studio/studio/expressRouter.mjs' {
  import type { Express, Request } from 'express';
  import type { AuthConfigStatus } from './lib/security/sessionAuth.ts';
  export interface VideoStudioAuthOptions {
    getAuthConfig?: () => AuthConfigStatus;
    verifySessionRequest?: (
      req: Request,
      authCfg: AuthConfigStatus,
      candidateTokens?: string[]
    ) => Promise<boolean>;
  }
  export const MAX_COMPLETED_JOBS: number;
  export const MAX_REEL_SCENE_HTML_BYTES: number;
  export function createVideoPreviewToken(sessionSecret: string, ttlSeconds?: number, nowMs?: number): string;
  export function verifyVideoPreviewToken(token: string, sessionSecret: string, nowMs?: number): boolean;
  export function resetVideoStudioJobsForTest(): void;
  export function getVideoStudioJobsSize(): number;
  export function createProjectFromReel(params: {
    id: string;
    name?: string;
    reelConfig: unknown;
    sceneHtml: string;
    overwrite?: boolean;
  }): Promise<{ config: unknown; paths: unknown }>;
  export function registerVideoStudioRoutes(app: Express, authOptions?: VideoStudioAuthOptions): void;
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
