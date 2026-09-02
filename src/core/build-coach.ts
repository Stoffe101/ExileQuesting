import type { BuildProfile } from './build-profiles';
import type { GemAcquisitionPlan } from './gem-acquisition';
import type { GemAcquisitionSnapshot } from './gem-data';
import { gearLookForHints, type GearLookForHint } from './gear-coach';
import { buildLootFilterPlan, type LootFilterPlan } from './loot-filter';
import { describePassiveMilestone, nextPassiveMilestone, type PassiveMilestone } from './passive-milestones';
import type { PassiveNodeKind, PassiveTreeSnapshot } from './passive-data';
import { alignPobStages, type PobStageAlignmentConfidence } from './pob-stages';
import { buildVendorSearchPlan, type VendorSearchPlan } from './vendor-search';

export interface BuildCoachGemTask {
  name: string;
  copies: number;
  source?: string;
  timingVerified: boolean;
  status: 'planned' | 'unknown-gem' | 'unavailable';
}

export interface MaxrollPassiveCoachStep {
  index: number;
  total: number;
  completed: number;
  type: 'allocate' | 'refund';
  nodeId: number;
  nodeName: string;
  nodeKind?: PassiveNodeKind;
  checkpoint: number;
}

export interface MaxrollBuildCoach {
  guideTitle: string;
  guideUrl: string;
  mode: 'league-start' | 'twink';
  guideModified?: string;
  plannerTreeVersion?: string;
  compatibility: 'current' | 'compatible-ids' | 'stale' | 'guide-only';
  compatibilityMessage: string;
  nextPassive?: MaxrollPassiveCoachStep;
  passiveComplete: boolean;
  passiveCompleted: number;
  passiveTotal: number;
  skillMilestones: string[];
  equipmentMilestones: Array<{ id: string; name: string; itemNames: string[]; slots: Array<{ slot: string; itemId: string; name?: string; baseId?: string; uniqueId?: string }> }>;
  alternateSkillPaths: string[];
}

export interface BuildCoachSnapshot {
  profileId: string;
  profileName: string;
  sourceKind: BuildProfile['sourceKind'];
  stageId?: string;
  stageTitle?: string;
  stageConfidence?: PobStageAlignmentConfidence;
  currentGemTasks: BuildCoachGemTask[];
  nextPassive?: PassiveMilestone;
  nextPassiveText?: string;
  maxroll?: MaxrollBuildCoach;
  loot: LootFilterPlan;
  gearHints: GearLookForHint[];
  craftingHints: string[];
  vendorSearch: VendorSearchPlan;
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
    hints.push(`Prioritise any ${best.links}-link for ${best.label}; socket colours do not block gems in PoE 3.29.`);
    hints.push(`Matching ${best.qualityBonusColours.join('-')} non-white sockets are an optional +10% gem-quality optimisation.`);
  }
  if (plan.showChromaticRecipe) hints.push('Linked red-green-blue items vendor for a Chromatic Orb.');
  if (plan.showSixSockets) hints.push("Six-socket items vendor for 7 Jeweller's Orbs when they are not six-linked.");
  return hints;
}

function maxrollCoachFor(profile: BuildProfile, passiveCursor: number, passiveData?: PassiveTreeSnapshot): MaxrollBuildCoach | undefined {
  const metadata = profile.maxroll;
  if (!metadata) return undefined;
  const total = metadata.passiveOperations.length;
  const completed = Math.max(0, Math.min(total, Math.trunc(passiveCursor)));
  const exactAllowed = metadata.compatibility === 'current' || metadata.compatibility === 'compatible-ids';
  const operation = exactAllowed ? metadata.passiveOperations[completed] : undefined;
  const node = operation && passiveData ? passiveData.nodes.find((candidate) => candidate.id === operation.nodeId) : undefined;
  const nextPassive = operation ? {
    index: completed + 1,
    total,
    completed,
    type: operation.type,
    nodeId: operation.nodeId,
    nodeName: node?.name ?? `Passive node ${operation.nodeId}`,
    nodeKind: node?.kind,
    checkpoint: operation.checkpoint,
  } satisfies MaxrollPassiveCoachStep : undefined;
  return {
    guideTitle: metadata.guideTitle,
    guideUrl: metadata.guideUrl,
    mode: metadata.mode,
    guideModified: metadata.guideModified,
    plannerTreeVersion: metadata.plannerTreeVersion,
    compatibility: metadata.compatibility,
    compatibilityMessage: metadata.compatibilityMessage,
    nextPassive,
    passiveComplete: total > 0 && completed >= total,
    passiveCompleted: completed,
    passiveTotal: total,
    skillMilestones: metadata.skillMilestones,
    equipmentMilestones: metadata.equipmentMilestones,
    alternateSkillPaths: metadata.alternateSkillPaths,
  };
}

export function buildCoachSnapshot(
  profile: BuildProfile,
  activeStageId: string | undefined,
  acquisition: GemAcquisitionPlan,
  gemData: GemAcquisitionSnapshot,
  passiveData?: PassiveTreeSnapshot,
  passiveCursor = 0,
  characterLevel?: number,
): BuildCoachSnapshot {
  const stages = alignPobStages(profile.build);
  const active = stages.find((stage) => stage.id === activeStageId)
    ?? stages.find((stage) => [stage.tree, stage.skills, stage.items, stage.config].some((member) => member?.active))
    ?? stages[0];
  const loot = buildLootFilterPlan(profile, active?.id, gemData);
  const maxroll = maxrollCoachFor(profile, passiveCursor, passiveData);
  const passive = maxroll ? undefined : nextPassiveMilestone(profile, active?.id, passiveData);
  const currentGemTasks: BuildCoachGemTask[] = acquisition.needs
    .filter((need) => need.stageId === active?.id)
    .slice(0, 12)
    .map((need) => ({
      name: need.requirement.name,
      copies: need.requiredCopies,
      source: need.preferred ? sourceLabel(need.preferred) : undefined,
      timingVerified: need.preferred?.timingVerified ?? false,
      status: need.status,
    }));
  const nextPassiveText = maxroll?.nextPassive
    ? `${maxroll.nextPassive.type === 'refund' ? 'Refund' : 'Allocate'} ${maxroll.nextPassive.nodeName}`
    : passive ? describePassiveMilestone(passive) : maxroll?.passiveComplete ? 'Maxroll passive path complete' : undefined;

  return {
    profileId: profile.id,
    profileName: profile.name,
    sourceKind: profile.sourceKind,
    stageId: active?.id,
    stageTitle: active?.title,
    stageConfidence: active?.confidence,
    currentGemTasks,
    nextPassive: passive,
    nextPassiveText,
    maxroll,
    loot,
    gearHints: gearLookForHints(profile, active?.id, gemData, characterLevel),
    craftingHints: craftingHintsFor(loot),
    vendorSearch: buildVendorSearchPlan(loot, currentGemTasks),
  };
}
