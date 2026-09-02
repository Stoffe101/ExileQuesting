import type { BuildProfile } from './build-profiles';
import { alignPobStages } from './pob-stages';
import { indexPassiveNodes, passiveClassStart, type PassiveNodeKind, type PassiveTreeSnapshot } from './passive-data';

export type PassiveTreeGuideMode = 'exact' | 'stage';

export interface PassiveTreeGuideOperation {
  type: 'allocate' | 'refund';
  nodeId: number;
  checkpoint: number;
}

export interface PassiveTreeGuideTarget {
  nodeId: number;
  nodeName: string;
  nodeKind?: PassiveNodeKind;
  type: 'allocate' | 'refund';
  index?: number;
  total?: number;
  checkpoint?: number;
}

export interface PassiveTreeGuidePlan {
  mode: PassiveTreeGuideMode;
  sourceKind: BuildProfile['sourceKind'];
  sourceLabel: string;
  className?: string;
  classId?: number;
  classStartNodeId?: number;
  operations: PassiveTreeGuideOperation[];
  cursor: number;
  target?: PassiveTreeGuideTarget;
  stageTargets: PassiveTreeGuideTarget[];
  message: string;
}

function clampCursor(cursor: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, Number.isFinite(cursor) ? Math.trunc(cursor) : 0));
}

function nodeTarget(snapshot: PassiveTreeSnapshot | undefined, nodeId: number, type: 'allocate' | 'refund' = 'allocate'): PassiveTreeGuideTarget {
  const node = snapshot ? indexPassiveNodes(snapshot).get(nodeId) : undefined;
  return { nodeId, nodeName: node?.name ?? `Passive node ${nodeId}`, nodeKind: node?.kind, type };
}

function previousTreeNodeIds(stages: ReturnType<typeof alignPobStages>, activeIndex: number): Set<number> {
  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    const nodes = stages[index].tree?.nodeIds;
    if (nodes?.length) return new Set(nodes);
  }
  return new Set<number>();
}

function activeClassId(profile: BuildProfile, activeStageId?: string): number | undefined {
  const stages = alignPobStages(profile.build);
  const active = stages.find((stage) => stage.id === activeStageId) ?? stages.find((stage) => stage.tree?.active) ?? stages.find((stage) => stage.tree);
  return active?.tree?.classId ?? profile.build.treeStages.find((stage) => stage.active)?.classId ?? profile.build.treeStages.find((stage) => stage.classId !== undefined)?.classId;
}

/**
 * Convert any active Build Profile into a passive-tree display plan.
 *
 * Maxroll exposes ordered click history, so ExileQuesting can safely show one
 * exact next passive. PoB tree stages expose allocation sets but not click
 * order. Those are intentionally presented as stage targets instead of
 * inventing an order the source never supplied.
 */
export function buildPassiveTreeGuidePlan(
  profile: BuildProfile | undefined,
  activeStageId: string | undefined,
  passiveCursor: number,
  snapshot?: PassiveTreeSnapshot,
): PassiveTreeGuidePlan | undefined {
  if (!profile) return undefined;

  const requestedClassName = profile.build.className;
  const classId = activeClassId(profile, activeStageId);
  const classStart = snapshot ? passiveClassStart(snapshot, { className: requestedClassName, classId }) : undefined;
  const className = requestedClassName ?? (classStart ? classStart.name[0] + classStart.name.slice(1).toLowerCase() : undefined);
  const classStartNodeId = classStart?.id;

  if (profile.maxroll) {
    const exactAllowed = profile.maxroll.compatibility === 'current' || profile.maxroll.compatibility === 'compatible-ids';
    const operations = exactAllowed ? profile.maxroll.passiveOperations.slice() : [];
    const cursor = clampCursor(passiveCursor, operations.length);
    const operation = operations[cursor];
    const target = operation ? {
      ...nodeTarget(snapshot, operation.nodeId, operation.type),
      index: cursor + 1,
      total: operations.length,
      checkpoint: operation.checkpoint,
    } : undefined;
    return {
      mode: 'exact',
      sourceKind: profile.sourceKind,
      sourceLabel: profile.maxroll.guideTitle,
      className,
      classId,
      classStartNodeId,
      operations,
      cursor,
      target,
      stageTargets: [],
      message: !exactAllowed
        ? profile.maxroll.compatibilityMessage
        : target
          ? `Exact ${className ?? 'build'} passive step ${cursor + 1} of ${operations.length}.`
          : operations.length
            ? 'Passive path complete.'
            : 'This guide does not expose ordered passive progression.',
    };
  }

  const stages = alignPobStages(profile.build);
  if (!stages.length) return {
    mode: 'stage', sourceKind: profile.sourceKind, sourceLabel: profile.name, className, classId, classStartNodeId,
    operations: [], cursor: 0, stageTargets: [], message: 'This build does not expose passive tree stages.',
  };
  const requestedIndex = activeStageId ? stages.findIndex((stage) => stage.id === activeStageId) : -1;
  const flaggedIndex = stages.findIndex((stage) => stage.tree?.active);
  const firstTreeIndex = stages.findIndex((stage) => stage.tree);
  const activeIndex = requestedIndex >= 0 ? requestedIndex : flaggedIndex >= 0 ? flaggedIndex : Math.max(0, firstTreeIndex);
  const active = stages[activeIndex] ?? stages[0];
  const activeNodes = active.tree?.nodeIds ?? [];
  const previous = previousTreeNodeIds(stages, activeIndex);
  const additions = [...new Set(activeNodes)]
    .filter((nodeId) => !previous.has(nodeId) && nodeId !== classStartNodeId)
    .slice(0, 160);
  const stageTargets = additions.map((nodeId) => nodeTarget(snapshot, nodeId));
  return {
    mode: 'stage',
    sourceKind: profile.sourceKind,
    sourceLabel: `${profile.name} · ${active.title}`,
    className,
    classId,
    classStartNodeId,
    operations: [],
    cursor: 0,
    stageTargets,
    message: stageTargets.length
      ? `PoB does not encode click order for this stage. Highlighting ${stageTargets.length} passive${stageTargets.length === 1 ? '' : 's'} added by ${active.title}.`
      : 'The active PoB stage adds no new fixed passive nodes compared with the previous tree stage.',
  };
}
