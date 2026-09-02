import type { BuildProfile } from './build-profiles';
import { gemRequirementsForStage, type GemRequirement } from './build-transitions';
import { indexGemData, resolveGemRequirement, type GemAcquisitionOffer, type GemAcquisitionSnapshot, type GemDataRecord } from './gem-data';
import { alignPobStages, type PobAlignedStage, type PobStageAlignmentConfidence } from './pob-stages';

export interface GemAcquisitionSource {
  kind: 'starting' | 'quest' | 'vendor';
  gemId: string;
  act?: number;
  questId?: string;
  questName?: string;
  rewardOfferId?: string;
  /** NPC that completes/unlocks the reward offer. Used to resolve the campaign route. */
  questNpc?: string;
  /** NPC the player actually takes/buys the gem from. */
  npc?: string;
  timingVerified: boolean;
}

export interface GemAcquisitionNeed {
  stageId: string;
  stageTitle: string;
  stageConfidence: PobStageAlignmentConfidence;
  requirement: GemRequirement;
  gem?: GemDataRecord;
  requiredCopies: number;
  preferred?: GemAcquisitionSource;
  alternatives: GemAcquisitionSource[];
  status: 'planned' | 'unknown-gem' | 'unavailable';
}

export interface GemAcquisitionPlan {
  className?: string;
  gameVersion: string;
  sourceCommit: string;
  needs: GemAcquisitionNeed[];
  warnings: string[];
}

function validClass(classes: string[], className?: string): boolean {
  return classes.length === 0 || Boolean(className && classes.includes(className));
}

function timingVerified(stage: PobAlignedStage, offer: GemAcquisitionOffer): boolean {
  if (stage.milestone.kind === 'act') return offer.act <= Number(stage.milestone.value);
  // Level/phase names do not safely prove which quest has already been completed.
  return false;
}

function sourceFromOffer(stage: PobAlignedStage, offer: GemAcquisitionOffer): GemAcquisitionSource {
  return {
    kind: offer.kind,
    gemId: offer.gemId,
    act: offer.act,
    questId: offer.questId,
    questName: offer.questName,
    rewardOfferId: offer.rewardOfferId,
    questNpc: offer.questNpc,
    npc: offer.kind === 'vendor' ? offer.npc : offer.questNpc,
    timingVerified: timingVerified(stage, offer),
  };
}

function sourceRank(source: GemAcquisitionSource): [number, number, string] {
  const kind = source.kind === 'starting' ? 0 : source.kind === 'quest' ? 1 : 2;
  return [kind, source.act ?? 0, source.questId ?? ''];
}

function compareSources(left: GemAcquisitionSource, right: GemAcquisitionSource): number {
  const a = sourceRank(left);
  const b = sourceRank(right);
  return a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]);
}

export function acquisitionSourcesForRequirement(
  stage: PobAlignedStage,
  requirement: GemRequirement,
  className: string | undefined,
  snapshot: GemAcquisitionSnapshot,
): { gem?: GemDataRecord; sources: GemAcquisitionSource[] } {
  const index = indexGemData(snapshot);
  const gem = resolveGemRequirement(requirement, index);
  if (!gem) return { sources: [] };
  const sources: GemAcquisitionSource[] = [];
  if (className && (snapshot.startingGems[className] ?? []).includes(gem.id)) {
    sources.push({ kind: 'starting', gemId: gem.id, timingVerified: true });
  }
  for (const offer of index.offersByGem.get(gem.id) ?? []) {
    if (!validClass(offer.classes, className)) continue;
    sources.push(sourceFromOffer(stage, offer));
  }
  return { gem, sources: sources.sort(compareSources) };
}

/**
 * Returns only new copies the player has ever needed up to each aligned stage.
 * If a gem disappears for one PoB stage and returns later, ExileQuesting assumes the player kept
 * the physical gem and does not tell them to buy it again.
 */
export function buildGemAcquisitionPlan(profile: BuildProfile, snapshot: GemAcquisitionSnapshot): GemAcquisitionPlan {
  const stages = alignPobStages(profile.build);
  const maximumOwned = new Map<string, number>();
  const needs: GemAcquisitionNeed[] = [];
  const warnings: string[] = [];

  for (const stage of stages) {
    for (const requirement of gemRequirementsForStage(stage)) {
      const owned = maximumOwned.get(requirement.key) ?? 0;
      const requiredCopies = Math.max(0, requirement.count - owned);
      maximumOwned.set(requirement.key, Math.max(owned, requirement.count));
      if (!requiredCopies) continue;

      const resolution = acquisitionSourcesForRequirement(stage, requirement, profile.build.className, snapshot);
      const preferred = resolution.sources[0];
      const status: GemAcquisitionNeed['status'] = !resolution.gem ? 'unknown-gem' : preferred ? 'planned' : 'unavailable';
      needs.push({
        stageId: stage.id,
        stageTitle: stage.title,
        stageConfidence: stage.confidence,
        requirement,
        gem: resolution.gem,
        requiredCopies,
        preferred,
        alternatives: preferred ? resolution.sources.slice(1) : [],
        status,
      });
      if (stage.confidence === 'ambiguous') warnings.push(`${requirement.name}: PoB stage alignment is ambiguous, so acquisition timing must be confirmed manually.`);
      if (preferred && !preferred.timingVerified && preferred.kind !== 'starting') warnings.push(`${requirement.name}: source is class-valid, but exact campaign timing is not yet proven for stage “${stage.title}”.`);
      if (status === 'unknown-gem') warnings.push(`${requirement.name}: no unique gem-data match was found.`);
      if (status === 'unavailable') warnings.push(`${requirement.name}: no class-valid starting, quest, or vendor source was found in the bundled snapshot.`);
    }
  }

  return {
    className: profile.build.className,
    gameVersion: snapshot.gameVersion,
    sourceCommit: snapshot.source.commit,
    needs,
    warnings: [...new Set(warnings)],
  };
}
