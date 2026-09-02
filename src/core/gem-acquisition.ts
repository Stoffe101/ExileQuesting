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
  /** Cross-class vendor fallback that requires an optional/universal vendor unlock. */
  fallback?: 'siosa' | 'lilly';
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

function fallbackSources(stage: PobAlignedStage, gemId: string, offers: GemAcquisitionOffer[]): GemAcquisitionSource[] {
  if (!offers.length) return [];
  const earliestOfferAct = Math.min(...offers.map((offer) => offer.act));
  const stageAct = stage.milestone.kind === 'act' ? Number(stage.milestone.value) : undefined;
  const results: GemAcquisitionSource[] = [];
  const hasSiosa = offers.some((offer) => /\bsiosa\b/i.test(offer.npc ?? '') || /\bsiosa\b/i.test(offer.questNpc ?? ''));
  const hasLilly = offers.some((offer) => /\blilly\s+roth\b/i.test(offer.npc ?? '') || /\blilly\s+roth\b/i.test(offer.questNpc ?? ''));

  // Siosa removes class restrictions after A Fixture of Fate. For an Act 3 target we only call
  // timing verified when the gem's normal quest belongs to an earlier act; by Act 4 all Act 1-3
  // quest gates have safely been passed. Level/phase labels deliberately remain unverified.
  if (!hasSiosa && earliestOfferAct <= 3) {
    const verified = stageAct !== undefined && (stageAct > 3 || (stageAct === 3 && earliestOfferAct < 3));
    results.push({
      kind: 'vendor', gemId, act: 3, questId: 'fallback:a3-siosa', questName: 'A Fixture of Fate',
      rewardOfferId: 'fallback:a3-siosa', questNpc: 'Siosa', npc: 'Siosa', fallback: 'siosa', timingVerified: verified,
    });
  }

  // Lilly removes class restrictions after Fallen from Grace, but she does not bypass future quest
  // progression. A gem from an earlier act is therefore proven available once the player reaches
  // Act 6+ and completes Lilly's unlock; same-act gems remain conservative until their own quest is passed.
  if (!hasLilly && earliestOfferAct <= 10) {
    const verified = stageAct !== undefined && stageAct >= 6 && earliestOfferAct < stageAct;
    results.push({
      kind: 'vendor', gemId, act: 6, questId: 'fallback:a6-lilly', questName: 'Fallen from Grace',
      rewardOfferId: 'fallback:a6-lilly', questNpc: 'Lilly Roth', npc: 'Lilly Roth', fallback: 'lilly', timingVerified: verified,
    });
  }
  return results;
}

function sourceRank(source: GemAcquisitionSource): [number, number, number, number, string] {
  // For Act-labelled PoB stages, never prefer a later quest reward over a source that is already
  // available by the requested Act. Within the same timing confidence, keep the player-friendly
  // preference of starting gem -> free quest reward -> vendor purchase, then prefer normal sources
  // over detour fallbacks.
  const timing = source.timingVerified ? 0 : 1;
  const kind = source.kind === 'starting' ? 0 : source.kind === 'quest' ? 1 : 2;
  const fallback = source.fallback ? 1 : 0;
  return [timing, kind, fallback, source.act ?? 0, source.questId ?? ''];
}

function compareSources(left: GemAcquisitionSource, right: GemAcquisitionSource): number {
  const a = sourceRank(left);
  const b = sourceRank(right);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3] || a[4].localeCompare(b[4]);
}

function dedupeSources(sources: GemAcquisitionSource[]): GemAcquisitionSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.kind}|${source.gemId}|${source.questName ?? ''}|${source.npc ?? ''}|${source.fallback ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  const offers = index.offersByGem.get(gem.id) ?? [];
  for (const offer of offers) {
    if (!validClass(offer.classes, className)) continue;
    sources.push(sourceFromOffer(stage, offer));
  }
  sources.push(...fallbackSources(stage, gem.id, offers));
  return { gem, sources: dedupeSources(sources).sort(compareSources) };
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
      if (preferred?.fallback === 'siosa') warnings.push(`${requirement.name}: cross-class fallback uses Siosa after A Fixture of Fate; carry the required purchase currency into the Library.`);
      if (preferred?.fallback === 'lilly') warnings.push(`${requirement.name}: cross-class fallback uses Lilly Roth after Fallen from Grace and still respects the gem's original quest progression.`);
      if (preferred && !preferred.timingVerified && preferred.kind !== 'starting') warnings.push(`${requirement.name}: source is valid, but exact campaign timing is not yet proven for stage “${stage.title}”.`);
      if (status === 'unknown-gem') warnings.push(`${requirement.name}: no unique gem-data match was found.`);
      if (status === 'unavailable') warnings.push(`${requirement.name}: no starting, quest, vendor, Siosa, or Lilly source was found in the bundled snapshot.`);
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
