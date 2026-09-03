import {
  BUILD_MECHANIC_EVIDENCE_KINDS,
  validateBuildMechanicGraph,
  type BuildMechanicGraph,
  type BuildMechanicNode,
  type BuildMechanicObservation,
  type BuildMechanicStateTransitionSummary,
} from './build-mechanic-graph';
import {
  POB_CONFIDENCE_CLASSES,
  type PobCalculationConfidence,
} from './pob-calculation';

export const CONFIGURATION_AVAILABILITY_LABELS = [
  'permanent',
  'mapping-credible',
  'boss-sustainable',
  'burst-only',
  'cold-start-unavailable',
  'unproven',
] as const;

export const CONFIGURATION_AVAILABILITY_EVIDENCE_KINDS = [
  'game-data',
  'expert-source',
  'reviewed-rule',
] as const;

export const CONFIGURATION_DEPENDENCY_STATUSES = [
  'configured-dependent',
  'inactive-sensitive',
  'no-reviewed-impact',
] as const;

export type ConfigurationAvailabilityLabel = typeof CONFIGURATION_AVAILABILITY_LABELS[number];
export type ConfigurationAvailabilityEvidenceLabel = Exclude<ConfigurationAvailabilityLabel, 'unproven'>;
export type ConfigurationAvailabilityEvidenceKind = typeof CONFIGURATION_AVAILABILITY_EVIDENCE_KINDS[number];
export type ConfigurationDependencyStatus = typeof CONFIGURATION_DEPENDENCY_STATUSES[number];

export interface ConfigurationAvailabilityEvidence {
  id: string;
  conditionNodeId: string;
  kind: ConfigurationAvailabilityEvidenceKind;
  label: ConfigurationAvailabilityEvidenceLabel;
  confidence: PobCalculationConfidence;
  source: string;
  note?: string;
}

export interface ConfigurationMeasuredImpact {
  evidenceId: string;
  scenario?: string;
  metricId: string;
  metricLabel: string;
  activeValue: number;
  inactiveValue: number;
  activeAbsolute: number;
  activePercentVsInactive?: number;
}

export interface ConfigurationDependencyAvailability {
  labels: ConfigurationAvailabilityLabel[];
  evidence: ConfigurationAvailabilityEvidence[];
}

export interface ConfigurationDependency {
  conditionNodeId: string;
  label: string;
  condition: string;
  slot?: string;
  configuredActive: boolean;
  status: ConfigurationDependencyStatus;
  measuredImpacts: ConfigurationMeasuredImpact[];
  calculationEvidenceIds: string[];
  availability: ConfigurationDependencyAvailability;
}

export interface ConfigurationDoctorReport {
  schemaVersion: 1;
  dependencies: ConfigurationDependency[];
}

function encodedFlaskNodeId(slot: string): string {
  return `condition:flask-active:${encodeURIComponent(slot)}`;
}

function isSupportedAvailabilityEvidenceKind(value: string): value is ConfigurationAvailabilityEvidenceKind {
  return CONFIGURATION_AVAILABILITY_EVIDENCE_KINDS.includes(value as ConfigurationAvailabilityEvidenceKind);
}

function isSupportedAvailabilityLabel(value: string): value is ConfigurationAvailabilityEvidenceLabel {
  return CONFIGURATION_AVAILABILITY_LABELS.includes(value as ConfigurationAvailabilityLabel) && value !== 'unproven';
}

function isSupportedConfidence(value: string): value is PobCalculationConfidence {
  return POB_CONFIDENCE_CLASSES.includes(value as PobCalculationConfidence);
}

function conditionName(node: BuildMechanicNode): string {
  const condition = node.metadata?.condition;
  return typeof condition === 'string' && condition.trim() ? condition : 'unknown';
}

function conditionSlot(node: BuildMechanicNode): string | undefined {
  const slot = node.metadata?.slot;
  return typeof slot === 'string' && slot.trim() ? slot : undefined;
}

function relevantTransition(
  node: BuildMechanicNode,
  transition: BuildMechanicStateTransitionSummary | undefined,
): transition is Extract<BuildMechanicStateTransitionSummary, { kind: 'flask-active' }> {
  if (!transition || transition.kind !== 'flask-active') return false;
  return encodedFlaskNodeId(transition.slot) === node.id;
}

function impactFromObservation(
  observation: BuildMechanicObservation,
  transition: Extract<BuildMechanicStateTransitionSummary, { kind: 'flask-active' }>,
  metricLabel: string,
  scenario: string | undefined,
): ConfigurationMeasuredImpact {
  const activeValue = transition.fromActive ? observation.before : observation.after;
  const inactiveValue = transition.fromActive ? observation.after : observation.before;
  const activeAbsolute = activeValue - inactiveValue;
  return {
    evidenceId: observation.evidenceId,
    scenario,
    metricId: observation.metricId,
    metricLabel,
    activeValue,
    inactiveValue,
    activeAbsolute,
    ...(inactiveValue !== 0 ? { activePercentVsInactive: (activeAbsolute / Math.abs(inactiveValue)) * 100 } : {}),
  };
}

function conflictingAvailabilityLabels(labels: Set<ConfigurationAvailabilityEvidenceLabel>): string | undefined {
  if (labels.has('permanent') && labels.has('burst-only')) {
    return 'permanent conflicts with burst-only';
  }
  if (labels.has('permanent') && labels.has('cold-start-unavailable')) {
    return 'permanent conflicts with cold-start-unavailable';
  }
  if (labels.has('burst-only') && labels.has('mapping-credible')) {
    return 'burst-only conflicts with mapping-credible';
  }
  if (labels.has('burst-only') && labels.has('boss-sustainable')) {
    return 'burst-only conflicts with boss-sustainable';
  }
  return undefined;
}

export function validateConfigurationAvailabilityEvidence(
  graph: BuildMechanicGraph,
  evidence: ConfigurationAvailabilityEvidence[],
): string[] {
  const errors: string[] = [];
  const graphValidation = validateBuildMechanicGraph(graph);
  if (!graphValidation.valid) {
    errors.push(...graphValidation.errors.map((error) => `Mechanic graph: ${error}`));
    return errors;
  }

  const conditionNodes = new Map(
    graph.nodes.filter((node) => node.kind === 'condition').map((node) => [node.id, node]),
  );
  const ids = new Set<string>();
  const labelsByCondition = new Map<string, Set<ConfigurationAvailabilityEvidenceLabel>>();

  for (const item of evidence) {
    if (!item.id.trim()) errors.push('Availability evidence requires a non-empty id.');
    if (ids.has(item.id)) errors.push(`Duplicate availability evidence id ${item.id}.`);
    ids.add(item.id);

    if (!conditionNodes.has(item.conditionNodeId)) {
      errors.push(`Availability evidence ${item.id} references missing condition node ${item.conditionNodeId}.`);
    }
    if (!isSupportedAvailabilityEvidenceKind(item.kind)) {
      errors.push(`Availability evidence ${item.id} uses unsupported evidence kind ${item.kind}.`);
    }
    if (!isSupportedAvailabilityLabel(item.label)) {
      errors.push(`Availability evidence ${item.id} uses unsupported label ${item.label}.`);
    }
    if (!isSupportedConfidence(item.confidence)) {
      errors.push(`Availability evidence ${item.id} uses unsupported confidence ${item.confidence}.`);
    }
    if (!item.source.trim()) {
      errors.push(`Availability evidence ${item.id} requires a non-empty source.`);
    }

    const labels = labelsByCondition.get(item.conditionNodeId) ?? new Set<ConfigurationAvailabilityEvidenceLabel>();
    if (isSupportedAvailabilityLabel(item.label)) labels.add(item.label);
    labelsByCondition.set(item.conditionNodeId, labels);
  }

  for (const [conditionNodeId, labels] of labelsByCondition) {
    const conflict = conflictingAvailabilityLabels(labels);
    if (conflict) errors.push(`Availability evidence for ${conditionNodeId} is contradictory: ${conflict}.`);
  }

  return errors;
}

function availabilityForCondition(
  conditionNodeId: string,
  evidence: ConfigurationAvailabilityEvidence[],
): ConfigurationDependencyAvailability {
  const relevant = evidence
    .filter((item) => item.conditionNodeId === conditionNodeId)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (relevant.length === 0) {
    return { labels: ['unproven'], evidence: [] };
  }
  const labels = [...new Set(relevant.map((item) => item.label))].sort();
  return { labels, evidence: relevant };
}

function dependencyForFlaskCondition(
  graph: BuildMechanicGraph,
  node: BuildMechanicNode,
  availabilityEvidence: ConfigurationAvailabilityEvidence[],
): ConfigurationDependency {
  const transitions = graph.evidence
    .filter((item) => relevantTransition(node, item.stateTransition))
    .map((item) => ({ evidence: item, transition: item.stateTransition as Extract<BuildMechanicStateTransitionSummary, { kind: 'flask-active' }> }));

  if (transitions.length === 0) {
    throw new Error(`Configuration Doctor cannot resolve a deterministic baseline state for ${node.id}.`);
  }

  const baselineStates = new Set(transitions.map((item) => item.transition.fromActive));
  if (baselineStates.size !== 1) {
    throw new Error(`Configuration Doctor found conflicting imported active states for ${node.id}.`);
  }
  const configuredActive = transitions[0].transition.fromActive;
  const transitionByEvidence = new Map(transitions.map((item) => [item.evidence.id, item]));
  const metricLabels = new Map(
    graph.nodes
      .filter((candidate) => candidate.kind === 'observable')
      .map((candidate) => [candidate.id, candidate.label]),
  );

  const measuredImpacts: ConfigurationMeasuredImpact[] = [];
  for (const edge of graph.edges) {
    if (edge.from !== node.id || edge.kind !== 'observed-response') continue;
    const metricLabel = metricLabels.get(edge.to) ?? edge.to;
    for (const observation of edge.observations ?? []) {
      const transition = transitionByEvidence.get(observation.evidenceId);
      if (!transition) continue;
      measuredImpacts.push(impactFromObservation(
        observation,
        transition.transition,
        metricLabel,
        transition.evidence.scenario,
      ));
    }
  }

  measuredImpacts.sort((left, right) => {
    const metric = left.metricId.localeCompare(right.metricId);
    return metric !== 0 ? metric : left.evidenceId.localeCompare(right.evidenceId);
  });

  const status: ConfigurationDependencyStatus = measuredImpacts.length === 0
    ? 'no-reviewed-impact'
    : configuredActive
      ? 'configured-dependent'
      : 'inactive-sensitive';

  return {
    conditionNodeId: node.id,
    label: node.label,
    condition: conditionName(node),
    ...(conditionSlot(node) ? { slot: conditionSlot(node) } : {}),
    configuredActive,
    status,
    measuredImpacts,
    calculationEvidenceIds: transitions.map((item) => item.evidence.id).sort(),
    availability: availabilityForCondition(node.id, availabilityEvidence),
  };
}

export function configurationDoctorReport(
  graph: BuildMechanicGraph,
  availabilityEvidence: ConfigurationAvailabilityEvidence[] = [],
): ConfigurationDoctorReport {
  const graphValidation = validateBuildMechanicGraph(graph);
  if (!graphValidation.valid) {
    throw new Error(`Configuration Doctor requires a valid mechanic graph: ${graphValidation.errors.join('; ')}`);
  }

  const availabilityErrors = validateConfigurationAvailabilityEvidence(graph, availabilityEvidence);
  if (availabilityErrors.length > 0) {
    throw new Error(`Configuration Doctor availability evidence is invalid: ${availabilityErrors.join('; ')}`);
  }

  // PoB calculation evidence can establish numerical sensitivity, but it is intentionally
  // excluded from uptime evidence. Only reviewed external/mechanical evidence above may
  // add availability labels.
  for (const item of graph.evidence) {
    if (!BUILD_MECHANIC_EVIDENCE_KINDS.includes(item.kind)) {
      throw new Error(`Configuration Doctor encountered unsupported graph evidence kind ${item.kind}.`);
    }
  }

  const dependencies = graph.nodes
    .filter((node) => node.kind === 'condition' && conditionName(node) === 'flask-active')
    .map((node) => dependencyForFlaskCondition(graph, node, availabilityEvidence))
    .sort((left, right) => left.conditionNodeId.localeCompare(right.conditionNodeId));

  return { schemaVersion: 1, dependencies };
}
