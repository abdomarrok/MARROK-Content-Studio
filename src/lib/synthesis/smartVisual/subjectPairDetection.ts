import type { SlideData, SubjectPairConfig } from '../../../types.ts';
import { isPlaceholderOrEmptyBrandValue, resolveRealTechSystem } from '../../bundledTechSvgs.ts';
import { KNOWN_STORY_OWNERS, NON_OWNER_WORDS } from './constants.ts';

export function isChatAndStorageTopic(text: string, owner?: string): boolean {
  const combined = `${owner || ''} ${text}`;
  const hasChatSignal = /\b(?:discord|slack|chat|messages?|messaging|channels?|dm|inbox)\b/i.test(combined);
  const hasStorageSignal =
    /\b(?:cassandra|scylla|scylladb|postgres|postgresql|mysql|mongodb|dynamodb|redis|cockroach|clickhouse|sqlite|database|db|storage|shards?|partitions?|reads?|writes?|queries|trillions?)\b/i.test(
      combined
    );
  return hasChatSignal && hasStorageSignal;
}

export function buildVerifiedSubjectPairConfig(
  rawA: string,
  rawB: string,
  cleanText: string,
  rawOwner?: string
): SubjectPairConfig | undefined {
  const sysA = resolveRealTechSystem(rawA);
  const sysB = resolveRealTechSystem(rawB);
  if (!sysA || !sysB) return undefined;
  if (sysA.title.toLowerCase() === sysB.title.toLowerCase()) return undefined;

  let ownerName: string | undefined;
  if (rawOwner) {
    const cleanOwner = rawOwner.trim().replace(/^['"`(\[]+|['"`.,;:!?)\]]+$/g, '');
    if (
      cleanOwner.length >= 2 &&
      !NON_OWNER_WORDS.has(cleanOwner.toLowerCase()) &&
      !isPlaceholderOrEmptyBrandValue(cleanOwner) &&
      cleanOwner.toLowerCase() !== sysA.title.toLowerCase() &&
      cleanOwner.toLowerCase() !== sysB.title.toLowerCase() &&
      cleanOwner.toLowerCase() !== rawA.trim().toLowerCase() &&
      cleanOwner.toLowerCase() !== rawB.trim().toLowerCase()
    ) {
      const ownerSys = resolveRealTechSystem(cleanOwner);
      ownerName = ownerSys ? ownerSys.title : cleanOwner.charAt(0).toUpperCase() + cleanOwner.slice(1);
    }
  }

  if (!ownerName) {
    for (const candidate of KNOWN_STORY_OWNERS) {
      if (
        candidate.pattern.test(cleanText) &&
        candidate.name.toLowerCase() !== sysA.title.toLowerCase() &&
        candidate.name.toLowerCase() !== sysB.title.toLowerCase()
      ) {
        ownerName = candidate.name;
        break;
      }
    }
  }

  const isChatDb = isChatAndStorageTopic(cleanText, ownerName);
  const flowLabel = isChatDb
    ? 'CHAT MESSAGES → COMPACTED SHARDS'
    : `${sysA.title.toUpperCase()} → ${sysB.title.toUpperCase()}`;

  return {
    beforeSystem: sysA.title,
    afterSystem: sysB.title,
    beforeLogoKey: sysA.logoKey,
    afterLogoKey: sysB.logoKey,
    beforeAsText: sysA.asText,
    afterAsText: sysB.asText,
    storyOwner: ownerName,
    storyOwnerMode: ownerName ? 'text' : undefined,
    beforeLabel: 'BEFORE',
    afterLabel: 'AFTER',
    colorMode: 'official',
    logoWidthPct: 11,
    creativeMotif: isChatDb ? 'chat-to-db' : 'stream-flow',
    flowLabel,
  };
}

/**
 * Strictly detects migration, replacement, A vs B, or before -> after stories ONLY when
 * TWO real, named software/database/infrastructure products can be extracted with confidence.
 * - Never fabricates placeholders ("System A", "System B", "PIPELINE MIGRATION", "DATASTREAM MIGRATION").
 * - Never triggers on robotics, hardware, ML training-to-inference, or single-system explainers.
 * - Allocates 3-brand stories with the story owner as styled text and the 2 systems in the BEFORE/AFTER slots.
 */
export function detectSubjectPairFromText(
  fullText: string,
  slide?: SlideData
): SubjectPairConfig | undefined {
  if (slide?.subjectPair) {
    const sp = slide.subjectPair;
    if (
      !isPlaceholderOrEmptyBrandValue(sp.beforeSystem) &&
      !isPlaceholderOrEmptyBrandValue(sp.afterSystem) &&
      sp.beforeSystem.trim().toLowerCase() !== sp.afterSystem.trim().toLowerCase()
    ) {
      const sysA = resolveRealTechSystem(sp.beforeSystem);
      const sysB = resolveRealTechSystem(sp.afterSystem);
      if (sysA && sysB) {
        const cleanFlow =
          sp.flowLabel && !isPlaceholderOrEmptyBrandValue(sp.flowLabel)
            ? sp.flowLabel
            : isChatAndStorageTopic(`${fullText} ${sp.beforeSystem} ${sp.afterSystem}`, sp.storyOwner)
            ? 'CHAT MESSAGES → COMPACTED SHARDS'
            : `${sysA.title.toUpperCase()} → ${sysB.title.toUpperCase()}`;
        return {
          ...sp,
          beforeSystem: sp.beforeSystem.trim(),
          afterSystem: sp.afterSystem.trim(),
          beforeLogoKey: sp.beforeLogoKey ?? sysA.logoKey,
          afterLogoKey: sp.afterLogoKey ?? sysB.logoKey,
          storyOwner:
            sp.storyOwner && !isPlaceholderOrEmptyBrandValue(sp.storyOwner)
              ? sp.storyOwner.trim()
              : undefined,
          flowLabel: cleanFlow,
          creativeMotif: isChatAndStorageTopic(
            `${fullText} ${sp.beforeSystem} ${sp.afterSystem}`,
            sp.storyOwner
          )
            ? sp.creativeMotif || 'chat-to-db'
            : 'stream-flow',
        };
      }
    }
  }

  if (!fullText) return undefined;
  const clean = fullText.replace(/\n+/g, ' ');

  // 1. Check 3-brand pattern: "<Company> migrated/moved/switched/replaced from <SysA> to/with <SysB>"
  const threeBrandRegex =
    /\b([A-Za-z0-9._-]+)\s+(?:has\s+|have\s+)?(?:migrated|migrating|switched|switching|moving|moved|replaced|replacing|transitioned|ported|ditched)\s+(?:from\s+)?(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)\s+(?:to|with|for|into)\s+(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)/gi;
  for (const m of clean.matchAll(threeBrandRegex)) {
    const built = buildVerifiedSubjectPairConfig(m[2], m[3], clean, m[1]);
    if (built) return built;
  }

  // 2. Check explicit migration/replacement: "migrated/moved/switched from <SysA> to <SysB>" or "replaced/ditched <SysA> with/for <SysB>"
  const migrationRegex =
    /\b(?:migrated|migrating|migration|switched|switching|switch|moved|moving|move|transitioned|transitioning|ported|porting|upgraded|upgrading)\s+from\s+(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)\s+(?:to|into)\s+(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)/gi;
  for (const m of clean.matchAll(migrationRegex)) {
    const built = buildVerifiedSubjectPairConfig(m[1], m[2], clean);
    if (built) return built;
  }

  const replacedRegex =
    /\b(?:replaced|replacing|replace|ditched|ditching|ditch|swapped|swapping)\s+(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)\s+(?:with|for|to)\s+(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)/gi;
  for (const m of clean.matchAll(replacedRegex)) {
    const built = buildVerifiedSubjectPairConfig(m[1], m[2], clean);
    if (built) return built;
  }

  // 3. Check explicit arrow or head-to-head comparison between two real named systems: "<SysA> -> <SysB>" or "<SysA> vs <SysB>"
  const arrowOrVsRegex =
    /\b(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)\s*(?:->|→|\bvs\.?\b|\bversus\b|\bcompared\s+to\b)\s*(?:Apache\s+|Amazon\s+|Google\s+|Microsoft\s+)?([A-Za-z0-9.+_#-]+)/gi;
  for (const m of clean.matchAll(arrowOrVsRegex)) {
    const built = buildVerifiedSubjectPairConfig(m[1], m[2], clean);
    if (built) return built;
  }

  return undefined;
}
