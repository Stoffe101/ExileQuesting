import type { PobGemSummary, PobMasterySelection } from './pob';
import { alignPobStages, type PobAlignedStage, type PobStageAlignmentConfidence } from './pob-stages';
import type { BuildProfile } from './build-profiles';

export interface GemRequirement {
  key: string;
  name: string;
  skillId?: string;
  count: number;
}

export interface MasteryRequirement extends PobMasterySelection {}

export interface BuildStageTransition {
  fromStageId?: string;
  toStageId: string;
  toTitle: string;
  confidence: PobStageAlignmentConfidence;
  actionable: boolean;
  introducedGems: GemRequirement[];
  removedGems: GemRequirement[];
  passiveNodesAdded: number[];
  passiveNodesRemoved: number[];
  masteriesAdded: MasteryRequirement[];
  masteriesRemoved: MasteryRequirement[];
}

function normalizeGemName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function gemIdentity(gem: PobGemSummary): string {
  return gem.skillId?.trim() ? `skill:${gem.skillId.trim().toLowerCase()}` : `name:${normalizeGemName(gem.name)}`;
}

export function gemRequirementsForStage(stage: PobAlignedStage): GemRequirement[] {
  const groups = stage.skills?.skillGroups ?? [];
  const requirements = new Map<string, GemRequirement>();
  for (const group of groups) {
    if (!group.enabled) continue;
    for (const gem of group.gems) {
      if (!gem.enabled) continue;
      const key = gemIdentity(gem);
      const current = requirements.get(key);
      if (current) current.count += 1;
      else requirements.set(key, { key, name: gem.name, skillId: gem.skillId, count: 1 });
    }
  }
  return [...requirements.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function countMap(requirements: GemRequirement[]): Map<string, GemRequirement> {
  return new Map(requirements.map((requirement) => [requirement.key, requirement]));
}

function gemDelta(next: GemRequirement[], previous: GemRequirement[]): { added: GemRequirement[]; removed: GemRequirement[] } {
  const nextMap = countMap(next);
  const previousMap = countMap(previous);
  const keys = new Set([...nextMap.keys(), ...previousMap.keys()]);
  const added: GemRequirement[] = [];
  const removed: GemRequirement[] = [];
  for (const key of keys) {
    const after = nextMap.get(key);
    const before = previousMap.get(key);
    const delta = (after?.count ?? 0) - (before?.count ?? 0);
    if (delta > 0 && after) added.push({ ...after, count: delta });
    if (delta < 0 && before) removed.push({ ...before, count: -delta });
  }
  return {
    added: added.sort((left, right) => left.name.localeCompare(right.name)),
    removed: removed.sort((left, right) => left.name.localeCompare(right.name)),
  };
}

function numberDelta(next: number[] = [], previous: number[] = []): { added: number[]; removed: number[] } {
  const nextSet = new Set(next);
  const previousSet = new Set(previous);
  return {
    added: [...nextSet].filter((value) => !previousSet.has(value)).sort((a, b) => a - b),
    removed: [...previousSet].filter((value) => !nextSet.has(value)).sort((a, b) => a - b),
  };
}

function masteryKey(value: PobMasterySelection): string {
  return `${value.nodeId}:${value.effectId}`;
}

function masteryDelta(next: PobMasterySelection[] = [], previous: PobMasterySelection[] = []): { added: PobMasterySelection[]; removed: PobMasterySelection[] } {
  const nextKeys = new Set(next.map(masteryKey));
  const previousKeys = new Set(previous.map(masteryKey));
  return {
    added: next.filter((value) => !previousKeys.has(masteryKey(value))),
    removed: previous.filter((value) => !nextKeys.has(masteryKey(value))),
  };
}

function lowerConfidence(left: PobStageAlignmentConfidence, right: PobStageAlignmentConfidence): PobStageAlignmentConfidence {
  const rank: Record<PobStageAlignmentConfidence, number> = { high: 4, medium: 3, low: 2, ambiguous: 1 };
  return rank[left] <= rank[right] ? left : right;
}

export function buildStageTransitions(profile: BuildProfile): BuildStageTransition[] {
  const stages = alignPobStages(profile.build);
  return stages.map((stage, index) => {
    const previous = stages[index - 1];
    const gems = gemDelta(gemRequirementsForStage(stage), previous ? gemRequirementsForStage(previous) : []);
    const nodes = numberDelta(stage.tree?.nodeIds, previous?.tree?.nodeIds);
    const masteries = masteryDelta(stage.tree?.masterySelections, previous?.tree?.masterySelections);
    const confidence = previous ? lowerConfidence(stage.confidence, previous.confidence) : stage.confidence;
    return {
      fromStageId: previous?.id,
      toStageId: stage.id,
      toTitle: stage.title,
      confidence,
      actionable: confidence !== 'ambiguous',
      introducedGems: gems.added,
      removedGems: gems.removed,
      passiveNodesAdded: nodes.added,
      passiveNodesRemoved: nodes.removed,
      masteriesAdded: masteries.added,
      masteriesRemoved: masteries.removed,
    };
  });
}
