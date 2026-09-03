import type {
  PobCalculationConfidence,
  PobCalculationResult,
  PobPerturbation,
  PobPerturbationComparison,
} from './pob-calculation';

export const BUILD_MECHANIC_NODE_KINDS = [
  'skill',
  'support',
  'item',
  'passive',
  'resource',
  'condition',
  'breakpoint',
  'defence',
  'scaling-axis',
  'content-mod',
  'observable',
] as const;

export const BUILD_MECHANIC_EDGE_KINDS = [
  'observed-response',
  'scales',
  'enables',
  'converts',
  'triggers',
  'consumes',
  'requires',
  'caps',
  'conflicts-with',
  'provides-uptime-for',
  'protects-against',
] as const;

export const BUILD_MECHANIC_EVIDENCE_KINDS = [
  'pob-perturbation',
  'pob-calculation',
  'game-data',
  'expert-source',
  'reviewed-rule',
] as const;

export type BuildMechanicNodeKind = typeof BUILD_MECHANIC_NODE_KINDS[number];
export type BuildMechanicEdgeKind = typeof BUILD_MECHANIC_EDGE_KINDS[number];
export type BuildMechanicEvidenceKind = typeof BUILD_MECHANIC_EVIDENCE_KINDS[number];
export type BuildMechanicObservationDirection = 'increase' | 'decrease';

export interface BuildMechanicNode {
  id: string;
  kind: BuildMechanicNodeKind;
  label: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface BuildMechanicKernelEvidence {
  protocolVersion: number;
  pobCommit: string;
  runtimeRevision: string;
  adapterVersion: string;
}

export type BuildMechanicPerturbationSummary =
  | { kind: 'replace-item'; slot: string }
  | { kind: 'passive-node'; operation: 'allocate' | 'deallocate'; nodeId: number };

export interface BuildMechanicEvidence {
  id: string;
  kind: BuildMechanicEvidenceKind;
  confidence: PobCalculationConfidence;
  requestId?: string;
  scenario?: string;
  source?: string;
  kernel?: BuildMechanicKernelEvidence;
  perturbation?: BuildMechanicPerturbationSummary;
}

export interface BuildMechanicObservation {
  evidenceId: string;
  metricId: string;
  before: number;
  after: number;
  absolute: number;
  percent?: number;
  direction: BuildMechanicObservationDirection;
}

export interface BuildMechanicEdge {
  id: string;
  from: string;
  to: string;
  kind: BuildMechanicEdgeKind;
  evidenceIds: string[];
  observations?: BuildMechanicObservation[];
}

export interface BuildMechanicGraph {
  schemaVersion: 1;
  nodes: BuildMechanicNode[];
  edges: BuildMechanicEdge[];
  evidence: BuildMechanicEvidence[];
}

export interface BuildMechanicGraphValidation {
  valid: boolean;
  errors: string[];
}

interface MetricDescriptor {
  id: string;
  label: string;
  category: 'offence' | 'defence' | 'recovery' | 'resource';
  unit?: string;
  read: (result: PobCalculationResult) => number | undefined;
}

const METRICS: MetricDescriptor[] = [
  { id: 'total-dps', label: 'Total DPS', category: 'offence', read: (result) => result.offence.totalDps ?? result.offence.combinedDps },
  { id: 'speed', label: 'Action speed / skill rate', category: 'offence', read: (result) => result.offence.speed },
  { id: 'effective-trigger-rate', label: 'Effective trigger rate', category: 'offence', read: (result) => result.offence.effectiveTriggerRate },
  { id: 'crit-chance', label: 'Critical strike chance', category: 'offence', unit: '%', read: (result) => result.offence.critChance },
  { id: 'hit-chance', label: 'Hit chance', category: 'offence', unit: '%', read: (result) => result.offence.hitChance },
  { id: 'life', label: 'Life', category: 'resource', read: (result) => result.defence.life },
  { id: 'energy-shield', label: 'Energy Shield', category: 'resource', read: (result) => result.defence.energyShield },
  { id: 'mana', label: 'Mana', category: 'resource', read: (result) => result.defence.mana },
  { id: 'ward', label: 'Ward', category: 'resource', read: (result) => result.defence.ward },
  { id: 'effective-hit-pool', label: 'Effective Hit Pool', category: 'defence', read: (result) => result.defence.effectiveHitPool },
  { id: 'armour', label: 'Armour', category: 'defence', read: (result) => result.defence.armour },
  { id: 'evasion', label: 'Evasion', category: 'defence', read: (result) => result.defence.evasion },
  { id: 'spell-suppression', label: 'Spell suppression chance', category: 'defence', unit: '%', read: (result) => result.defence.spellSuppressionChance },
  { id: 'attack-block', label: 'Attack block chance', category: 'defence', unit: '%', read: (result) => result.defence.attackBlockChance },
  { id: 'spell-block', label: 'Spell block chance', category: 'defence', unit: '%', read: (result) => result.defence.spellBlockChance },
  { id: 'fire-resistance', label: 'Fire resistance', category: 'defence', unit: '%', read: (result) => result.defence.fireResistance },
  { id: 'cold-resistance', label: 'Cold resistance', category: 'defence', unit: '%', read: (result) => result.defence.coldResistance },
  { id: 'lightning-resistance', label: 'Lightning resistance', category: 'defence', unit: '%', read: (result) => result.defence.lightningResistance },
  { id: 'chaos-resistance', label: 'Chaos resistance', category: 'defence', unit: '%', read: (result) => result.defence.chaosResistance },
  { id: 'physical-max-hit', label: 'Physical maximum hit', category: 'defence', read: (result) => result.defence.maximumHit?.physical },
  { id: 'fire-max-hit', label: 'Fire maximum hit', category: 'defence', read: (result) => result.defence.maximumHit?.fire },
  { id: 'cold-max-hit', label: 'Cold maximum hit', category: 'defence', read: (result) => result.defence.maximumHit?.cold },
  { id: 'lightning-max-hit', label: 'Lightning maximum hit', category: 'defence', read: (result) => result.defence.maximumHit?.lightning },
  { id: 'chaos-max-hit', label: 'Chaos maximum hit', category: 'defence', read: (result) => result.defence.maximumHit?.chaos },
  { id: 'total-net-recovery', label: 'Total net recovery', category: 'recovery', read: (result) => result.defence.totalNetRecovery },
  { id: 'total-degen', label: 'Total degeneration', category: 'recovery', read: (result) => result.defence.totalDegen },
];

function encoded(value: string): string {
  return encodeURIComponent(value);
}

function finite(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

function sameKernel(before: PobCalculationResult, after: PobCalculationResult): boolean {
  return before.kernel.protocolVersion === after.kernel.protocolVersion
    && before.kernel.pobCommit === after.kernel.pobCommit
    && before.kernel.runtimeRevision === after.kernel.runtimeRevision
    && before.kernel.adapterVersion === after.kernel.adapterVersion;
}

function sameScenario(before: PobCalculationResult, after: PobCalculationResult): boolean {
  return JSON.stringify(before.scenario) === JSON.stringify(after.scenario);
}

function perturbationSummary(perturbation: PobPerturbation): BuildMechanicPerturbationSummary {
  if (perturbation.kind === 'replace-item') {
    return { kind: 'replace-item', slot: perturbation.slot };
  }
  if (perturbation.kind === 'passive-node') {
    return { kind: 'passive-node', operation: perturbation.operation, nodeId: perturbation.nodeId };
  }
  throw new Error(`Mechanic graph extraction does not support ${perturbation.kind} perturbations.`);
}

function sourceNode(perturbation: PobPerturbation, requestId: string): BuildMechanicNode {
  if (perturbation.kind === 'passive-node') {
    return {
      id: `passive:${perturbation.nodeId}`,
      kind: 'passive',
      label: `Passive node ${perturbation.nodeId}`,
      metadata: { nodeId: perturbation.nodeId },
    };
  }
  if (perturbation.kind === 'replace-item') {
    return {
      id: `item-candidate:${encoded(perturbation.slot)}:${encoded(requestId)}`,
      kind: 'item',
      label: `Candidate ${perturbation.slot} item`,
      metadata: { slot: perturbation.slot, requestId },
    };
  }
  throw new Error(`Mechanic graph extraction does not support ${perturbation.kind} perturbations.`);
}

function observableNode(metric: MetricDescriptor): BuildMechanicNode {
  return {
    id: `observable:${metric.id}`,
    kind: 'observable',
    label: metric.label,
    metadata: {
      metricId: metric.id,
      category: metric.category,
      ...(metric.unit ? { unit: metric.unit } : {}),
    },
  };
}

function observation(metric: MetricDescriptor, evidenceId: string, before: number, after: number): BuildMechanicObservation | undefined {
  if (before === after) return undefined;
  const absolute = after - before;
  return {
    evidenceId,
    metricId: metric.id,
    before,
    after,
    absolute,
    ...(before !== 0 ? { percent: (absolute / Math.abs(before)) * 100 } : {}),
    direction: absolute > 0 ? 'increase' : 'decrease',
  };
}

export function graphFromPobPerturbation(comparison: PobPerturbationComparison): BuildMechanicGraph {
  if (!Array.isArray(comparison.perturbations) || comparison.perturbations.length !== 1) {
    throw new Error('Mechanic graph extraction requires exactly one PoB perturbation comparison.');
  }
  if (comparison.before.requestId !== comparison.after.requestId) {
    throw new Error('PoB perturbation before/after request ids must match before graph extraction.');
  }
  if (!sameKernel(comparison.before, comparison.after)) {
    throw new Error('PoB perturbation before/after kernel provenance must match before graph extraction.');
  }
  if (!sameScenario(comparison.before, comparison.after)) {
    throw new Error('PoB perturbation before/after scenarios must match before graph extraction.');
  }

  const perturbation = comparison.perturbations[0];
  const summary = perturbationSummary(perturbation);
  const source = sourceNode(perturbation, comparison.before.requestId);
  const evidenceId = `evidence:pob-perturbation:${encoded(comparison.before.requestId)}:${encoded(source.id)}`;
  const evidence: BuildMechanicEvidence = {
    id: evidenceId,
    kind: 'pob-perturbation',
    confidence: 'verified',
    requestId: comparison.before.requestId,
    scenario: comparison.before.scenario.scenario,
    source: 'pinned Path of Building reversible calculation',
    kernel: {
      protocolVersion: comparison.before.kernel.protocolVersion,
      pobCommit: comparison.before.kernel.pobCommit,
      runtimeRevision: comparison.before.kernel.runtimeRevision,
      adapterVersion: comparison.before.kernel.adapterVersion,
    },
    perturbation: summary,
  };

  const nodes = new Map<string, BuildMechanicNode>([[source.id, source]]);
  const edges: BuildMechanicEdge[] = [];
  for (const metric of METRICS) {
    const before = metric.read(comparison.before);
    const after = metric.read(comparison.after);
    if (!finite(before) || !finite(after)) continue;
    const measured = observation(metric, evidenceId, before, after);
    if (!measured) continue;
    const target = observableNode(metric);
    nodes.set(target.id, target);
    edges.push({
      id: `edge:observed-response:${encoded(source.id)}:${encoded(target.id)}`,
      from: source.id,
      to: target.id,
      kind: 'observed-response',
      evidenceIds: [evidenceId],
      observations: [measured],
    });
  }

  const graph: BuildMechanicGraph = {
    schemaVersion: 1,
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => a.id.localeCompare(b.id)),
    evidence: [evidence],
  };
  const validation = validateBuildMechanicGraph(graph);
  if (!validation.valid) throw new Error(`Extracted mechanic graph is invalid: ${validation.errors.join('; ')}`);
  return graph;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mergeBuildMechanicGraphs(graphs: BuildMechanicGraph[]): BuildMechanicGraph {
  const nodes = new Map<string, BuildMechanicNode>();
  const evidence = new Map<string, BuildMechanicEvidence>();
  const edges = new Map<string, BuildMechanicEdge>();

  for (const graph of graphs) {
    const validation = validateBuildMechanicGraph(graph);
    if (!validation.valid) throw new Error(`Cannot merge invalid mechanic graph: ${validation.errors.join('; ')}`);

    for (const node of graph.nodes) {
      const existing = nodes.get(node.id);
      if (existing && !sameJson(existing, node)) throw new Error(`Mechanic graph node ${node.id} has conflicting definitions.`);
      nodes.set(node.id, node);
    }
    for (const item of graph.evidence) {
      const existing = evidence.get(item.id);
      if (existing && !sameJson(existing, item)) throw new Error(`Mechanic graph evidence ${item.id} has conflicting definitions.`);
      evidence.set(item.id, item);
    }
    for (const edge of graph.edges) {
      const existing = edges.get(edge.id);
      if (!existing) {
        edges.set(edge.id, {
          ...edge,
          evidenceIds: [...edge.evidenceIds],
          ...(edge.observations ? { observations: [...edge.observations] } : {}),
        });
        continue;
      }
      if (existing.from !== edge.from || existing.to !== edge.to || existing.kind !== edge.kind) {
        throw new Error(`Mechanic graph edge ${edge.id} has conflicting definitions.`);
      }
      existing.evidenceIds = [...new Set([...existing.evidenceIds, ...edge.evidenceIds])].sort();
      const observations = new Map((existing.observations ?? []).map((item) => [item.evidenceId, item]));
      for (const item of edge.observations ?? []) {
        const prior = observations.get(item.evidenceId);
        if (prior && !sameJson(prior, item)) throw new Error(`Mechanic graph observation ${item.evidenceId} conflicts on edge ${edge.id}.`);
        observations.set(item.evidenceId, item);
      }
      if (observations.size > 0) existing.observations = [...observations.values()].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
    }
  }

  const merged: BuildMechanicGraph = {
    schemaVersion: 1,
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
    evidence: [...evidence.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };
  const validation = validateBuildMechanicGraph(merged);
  if (!validation.valid) throw new Error(`Merged mechanic graph is invalid: ${validation.errors.join('; ')}`);
  return merged;
}

export function validateBuildMechanicGraph(graph: BuildMechanicGraph): BuildMechanicGraphValidation {
  const errors: string[] = [];
  if (graph.schemaVersion !== 1) errors.push(`Unsupported mechanic graph schema version ${graph.schemaVersion}.`);

  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (!node.id.trim() || !node.label.trim()) errors.push('Mechanic graph nodes require non-empty ids and labels.');
    if (!BUILD_MECHANIC_NODE_KINDS.includes(node.kind)) errors.push(`Unsupported mechanic graph node kind ${node.kind}.`);
    if (nodeIds.has(node.id)) errors.push(`Duplicate mechanic graph node ${node.id}.`);
    nodeIds.add(node.id);
  }

  const evidenceIds = new Set<string>();
  for (const item of graph.evidence) {
    if (!item.id.trim()) errors.push('Mechanic graph evidence requires a non-empty id.');
    if (!BUILD_MECHANIC_EVIDENCE_KINDS.includes(item.kind)) errors.push(`Unsupported mechanic graph evidence kind ${item.kind}.`);
    if (evidenceIds.has(item.id)) errors.push(`Duplicate mechanic graph evidence ${item.id}.`);
    evidenceIds.add(item.id);
  }

  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (!edge.id.trim()) errors.push('Mechanic graph edges require a non-empty id.');
    if (!BUILD_MECHANIC_EDGE_KINDS.includes(edge.kind)) errors.push(`Unsupported mechanic graph edge kind ${edge.kind}.`);
    if (edgeIds.has(edge.id)) errors.push(`Duplicate mechanic graph edge ${edge.id}.`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.from)) errors.push(`Mechanic graph edge ${edge.id} references missing source node ${edge.from}.`);
    if (!nodeIds.has(edge.to)) errors.push(`Mechanic graph edge ${edge.id} references missing target node ${edge.to}.`);
    if (edge.evidenceIds.length === 0) errors.push(`Mechanic graph edge ${edge.id} has no evidence.`);
    for (const evidenceId of edge.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) errors.push(`Mechanic graph edge ${edge.id} references missing evidence ${evidenceId}.`);
    }
    for (const item of edge.observations ?? []) {
      if (!edge.evidenceIds.includes(item.evidenceId)) errors.push(`Mechanic graph observation ${item.evidenceId} is not attached to edge evidence.`);
      if (!evidenceIds.has(item.evidenceId)) errors.push(`Mechanic graph observation ${item.evidenceId} references missing evidence.`);
      if (!Number.isFinite(item.before) || !Number.isFinite(item.after) || !Number.isFinite(item.absolute)) {
        errors.push(`Mechanic graph observation ${item.evidenceId} contains non-finite values.`);
      }
      if (item.direction === 'increase' && item.absolute <= 0) errors.push(`Mechanic graph observation ${item.evidenceId} has inconsistent increase direction.`);
      if (item.direction === 'decrease' && item.absolute >= 0) errors.push(`Mechanic graph observation ${item.evidenceId} has inconsistent decrease direction.`);
    }
  }

  return { valid: errors.length === 0, errors };
}
