import type {
  ContentPillarId,
  PublicationObjective,
  TargetPlatform,
} from '../../types.ts';
import {
  buildLocalStrategyBrief,
  StrategyBrief,
} from './strategyPromptDecorator.ts';
import { withClientAuthHeaders } from '../security/clientSessionToken.ts';
import { resolvePipelineApiUrl } from '../autonomousPipeline.ts';

export interface FetchStrategyBriefOptions {
  topic: string;
  platform: TargetPlatform;
  pillar?: ContentPillarId;
  objective?: PublicationObjective;
  postFormat?: string;
  apiBaseUrl?: string;
  signal?: AbortSignal;
}

/**
 * Calls POST /api/strategy-brief to get an AI-tailored or locally assembled strategy brief.
 * Fails gracefully to a locally constructed brief on network/API errors.
 */
export async function fetchStrategyBrief(
  options: FetchStrategyBriefOptions
): Promise<StrategyBrief> {
  const {
    topic,
    platform,
    pillar = 'software-engineering',
    objective = 'discovery',
    postFormat = 'carousel',
    apiBaseUrl,
    signal,
  } = options;

  const fallback = buildLocalStrategyBrief({
    topic,
    platform,
    pillar,
    objective,
  });

  try {
    const url = resolvePipelineApiUrl('/api/strategy-brief', apiBaseUrl);
    const headers = withClientAuthHeaders({ 'Content-Type': 'application/json' });

    const stepSignal = AbortSignal.timeout(7000);
    const combinedSignal = signal
      ? typeof AbortSignal.any === 'function'
        ? AbortSignal.any([signal, stepSignal])
        : stepSignal
      : stepSignal;

    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers,
      signal: combinedSignal,
      body: JSON.stringify({
        topic,
        platform,
        pillar,
        objective,
        postFormat,
      }),
    });

    if (!res.ok) {
      return fallback;
    }

    const data = await res.json();
    if (data && typeof data === 'object' && data.platformFormatGuidance) {
      return {
        ...fallback,
        ...data,
      };
    }
  } catch {
    // Graceful fallback to local brief
  }

  return fallback;
}
