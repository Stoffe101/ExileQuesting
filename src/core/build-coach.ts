import type { BuildProfile } from './build-profiles';
import type { GemAcquisitionPlan } from './gem-acquisition';
import type { GemAcquisitionSnapshot } from './gem-data';
import { buildLootFilterPlan, type LootFilterPlan } from './loot-filter';
import { describePassiveMilestone, nextPassiveMilestone, type PassiveMilestone } from './passive-milestones';
import type { PassiveTreeSnapshot } from './passive-data';
import { alignPobStages, type PobStageAlignmentConfidence } from './pob-stages';

export interface BuildCoachGemTask {
  name: string;
  copies: number;
  source?: string;
  timingVerified: boolean;
  status: 'planned' | 'unknown-gem' | 'unavailable';
}

export interface BuildCoachSnapshot {
  profileId: string;
  profileName: string;
  stageId?: string;
  stageTitle?: string;
  stageConfidence?: PobStageAlignmentConfidence;
  currentGemTasks: BuildCoachGemTask[];
  nextPassive?: PassiveMilestone;
  nextPassiveText?: string;
  loot: LootFilterPlan;
  craftingHints: string[];
}

function sourceLabel(source: NonNullable<GemAcquisitionPlan['needs'][number]['preferred']>): string {
  if (source.kind === 'starting') return 'Starting gem';
  const place = source.npc ?? source.questName ?? 'campaign source';
  const act = source.act ? ` · Act ${source.act}` : '';
  return `${source.kind === 'quest' ? 'Quest reward' : 'Vendor'} · ${place}${act}`;
}

function craftingHintsFor(plan: LootFilterPlan): string[] {
  const hints: string[] = [];
  if (plan.linkTargets.length) {
    const best = plan.linkTargets[0];
    hints.push(`Prioritise ${best.links}-linked ${best.colours.join('-')} items for ${best.label}.`);
  }
  if (plan.showChromaticRecipe) hints.push('Linked red-green-blue items vendor for a Chromatic Orb.');
  if (plan.showSixSockets) hints.push('Six-socket items vendor for 7 Jeweller\'s Orbs when they are not six-linked.');
  return hints;
}

export function buildCoachSnapshot(
  profile: BuildProfile,
  activeStageId: string | undefined,
  acquisition: GemAcquisitionPlan,
  gemData: GemAcquisitionSnapshot,
  passiveData?: PassiveTreeSnapshot,
): BuildCoachSnapshot {
  const stages = alignPobStages(profile.build);
  const active = stages.find((stage) => stage.id === activeStageId) ?? stages.find((stage) => [stage.tree, stage.skills, stage.items, stage.config].some((member) => member?.active)) ?? stages[0];
  const loot = buildLootFilterPlan(profile, active?.id, gemData);
  const passive = nextPassiveMilestone(profile, active?.id, passiveData);
  const currentGemTasks = acquisition.needs
    .filter((need) => need.stageId === active?.id)
    .slice(0, 12)
    .map((need) => ({
      name: need.requirement.name,
      copies: need.requiredCopies,
      source: need.preferred ? sourceLabel(need.preferred) : undefined,
      timingVerified: need.preferred?.timingVerified ?? false,
      status: need.status,
    }));

  return {
    profileId: profile.id,
    profileName: profile.name,
    stageId: active?.id,
    stageTitle: active?.title,
    stageConfidence: active?.confidence,
    currentGemTasks,
    nextPassive: passive,
    nextPassiveText: passive ? describePassiveMilestone(passive) : undefined,
    loot,
    craftingHints: craftingHintsFor(loot),
  };
}
