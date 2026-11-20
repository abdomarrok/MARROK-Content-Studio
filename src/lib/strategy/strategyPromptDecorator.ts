import type { ContentPillarId, PublicationObjective, TargetPlatform } from '../../types.ts';
import {
  CONTENT_PILLARS,
  getPlatformGuidance,
  getRelevantInsights,
} from './strategyConfig.ts';

export interface StrategyBrief {
  platform: TargetPlatform;
  pillar: ContentPillarId;
  objective: PublicationObjective;
  platformFormatGuidance: string;
  toneDirection: string;
  hookStrategy: string;
  ctaSuggestion: string;
  relevantBenchmarks: string;
  scheduleRecommendation: string;
  qualityChecks: string[];
  contentWarnings: string[];
}

/**
 * Builds a local fallback StrategyBrief when the remote brief generation is unavailable.
 */
export function buildLocalStrategyBrief(options: {
  topic: string;
  platform: TargetPlatform;
  pillar: ContentPillarId;
  objective: PublicationObjective;
}): StrategyBrief {
  const { platform, pillar, objective } = options;
  const pillarConfig = CONTENT_PILLARS[pillar];
  const platformConfig = getPlatformGuidance(platform);
  const benchmarks = getRelevantInsights(pillar, platform);

  const cta =
    pillarConfig.ctaTemplates[0] ||
    'What is your team’s approach to this engineering challenge? • شاركنا تجربتك';

  return {
    platform,
    pillar,
    objective,
    platformFormatGuidance: platformConfig.formatRecommendations.join('; '),
    toneDirection: pillarConfig.toneGuidance,
    hookStrategy: platformConfig.hookStrategy,
    ctaSuggestion: cta,
    relevantBenchmarks: benchmarks,
    scheduleRecommendation: platformConfig.defaultSlotDZ,
    qualityChecks: pillarConfig.qualityChecks,
    contentWarnings: [
      'Preserve exact technical nouns and version numbers in Latin script inside Arabic sentences.',
      'Distinguish confirmed facts from speculation.',
    ],
  };
}

/**
 * Converts a StrategyBrief into a structured paragraph appended to the user prompt.
 */
export function buildStrategyPromptDecorator(brief: StrategyBrief | null | undefined): string {
  if (!brief) return '';

  const warnings =
    brief.contentWarnings && brief.contentWarnings.length > 0
      ? `\n- STRATEGY CAUTIONS: ${brief.contentWarnings.join('; ')}`
      : '';

  const checks =
    brief.qualityChecks && brief.qualityChecks.length > 0
      ? `\n- DOMAIN VERIFICATION CHECKS: ${brief.qualityChecks.join('; ')}`
      : '';

  return `
=== MARROK CONTENT STRATEGY DIRECTIVES (STRICTLY ENFORCE) ===
- TARGET PLATFORM: ${brief.platform.toUpperCase()} (${brief.platformFormatGuidance})
- STRATEGIC CONTENT PILLAR: ${brief.pillar.toUpperCase()}
- PUBLICATION OBJECTIVE: ${brief.objective.toUpperCase()}
- PILLAR TONE & EVIDENCE RULES: ${brief.toneDirection}
- SCROLL-STOPPING HOOK STRATEGY: ${brief.hookStrategy}
- POLARIZING CTA DIRECTIVE: ${brief.ctaSuggestion}
- HISTORICAL PERFORMANCE BENCHMARKS: ${brief.relevantBenchmarks}
- RECOMMENDED DZ POSTING SLOT: ${brief.scheduleRecommendation}${checks}${warnings}
=== END STRATEGY DIRECTIVES ===
`;
}
