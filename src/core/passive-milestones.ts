import type { BuildProfile } from './build-profiles';
import { buildStageTransitions } from './build-transitions';
import type { PassiveNodeKind, PassiveNodeRecord, PassiveTreeSnapshot } from './passive-data';
import { indexPassiveNodes } from './passive-data';

export interface PassiveMilestoneTarget {
  id: number;
  name: string;
  kind: PassiveNodeKind;
}

export interface PassiveMilestone {
  fromStageId: string;
  toStageId: string;
  toTitle: string;
  confidence: 'high' | 'medium' | 'low' | 'ambiguous';
  totalAllocations: number;
  namedTargets: PassiveMilestoneTarget[];
  unnamedAllocations: number;
  masteryCount: number;
}

const KIND_RANK: Record<PassiveNodeKind, number> = {
  keystone: 0,
  notable: 1,
  mastery: 2,
  ascendancy: 3,
  socket: 4,
  'class-start': 5,
  normal: 6,
};

export function nextPassiveMilestone(
  profile: BuildProfile,
  activeStageId: string | undefined,
  snapshot: PassiveTreeSnapshot | undefined,
): PassiveMilestone | undefined {
  if (!activeStageId) return undefined;
  const transitions = buildStageTransitions(profile);
  const currentIndex = transitions.findIndex((transition) => transition.toStageId === activeStageId);
  if (currentIndex < 0 || currentIndex + 1 >= transitions.length) return undefined;
  const next = transitions[currentIndex + 1];
  const index: Map<number, PassiveNodeRecord> = snapshot ? indexPassiveNodes(snapshot) : new Map<number, PassiveNodeRecord>();
  const namedTargets = next.passiveNodesAdded
    .map((id) => index.get(id))
    .filter((node): node is PassiveNodeRecord => Boolean(node))
    .filter((node) => node.kind !== 'normal' || next.passiveNodesAdded.length <= 6)
    .sort((left, right) => KIND_RANK[left.kind] - KIND_RANK[right.kind] || left.name.localeCompare(right.name))
    .slice(0, 6)
    .map((node) => ({ id: node.id, name: node.name, kind: node.kind }));

  return {
    fromStageId: activeStageId,
    toStageId: next.toStageId,
    toTitle: next.toTitle,
    confidence: next.confidence,
    totalAllocations: next.passiveNodesAdded.length,
    namedTargets,
    unnamedAllocations: Math.max(0, next.passiveNodesAdded.length - namedTargets.length),
    masteryCount: next.masteriesAdded.length,
  };
}

export function describePassiveMilestone(milestone: PassiveMilestone): string {
  if (milestone.namedTargets.length) {
    const names = milestone.namedTargets.slice(0, 2).map((target) => target.name).join(' → ');
    const extra = milestone.totalAllocations > milestone.namedTargets.length
      ? ` + ${milestone.totalAllocations - milestone.namedTargets.length} other allocation${milestone.totalAllocations - milestone.namedTargets.length === 1 ? '' : 's'}`
      : '';
    return `${names}${extra}`;
  }
  return `${milestone.totalAllocations} passive allocation${milestone.totalAllocations === 1 ? '' : 's'} before ${milestone.toTitle}`;
}
