export const POB_CALCULATION_PROTOCOL_VERSION = 1;
export const POB_WORKER_SENTINEL = '@@EXILEQUESTING_POB@@';
export const MAX_POB_PERTURBATION_ITEM_TEXT_BYTES = 128 * 1024;
export const MAX_POB_PASSIVE_NODE_ID = 2_147_483_647;

export const POB_SCENARIOS = [
  'imported',
  'mapping',
  'sustained-boss',
  'peak',
  'cold-start',
  'custom',
] as const;

export const POB_CONFIDENCE_CLASSES = [
  'verified',
  'high',
  'medium',
  'experimental',
] as const;

export const POB_REPLACEABLE_ITEM_SLOTS = [
  'Weapon 1',
  'Weapon 2',
  'Helmet',
  'Body Armour',
  'Gloves',
  'Boots',
  'Amulet',
  'Ring 1',
  'Ring 2',
  'Ring 3',
  'Belt',
] as const;

export const POB_FLASK_SLOTS = [
  'Flask 1',
  'Flask 2',
  'Flask 3',
  'Flask 4',
  'Flask 5',
] as const;

export const POB_PASSIVE_NODE_OPERATIONS = ['allocate', 'deallocate'] as const;

export type PobCalculationScenario = typeof POB_SCENARIOS[number];
export type PobCalculationConfidence = typeof POB_CONFIDENCE_CLASSES[number];
export type PobReplaceableItemSlot = typeof POB_REPLACEABLE_ITEM_SLOTS[number];
export type PobFlaskSlot = typeof POB_FLASK_SLOTS[number];
export type PobPassiveNodeOperation = typeof POB_PASSIVE_NODE_OPERATIONS[number];

export interface PobCalculationKernelVersion {
  protocolVersion: number;
  pobRepository: string;
  pobCommit: string;
  runtime: string;
  runtimeRevision: string;
  adapterVersion: string;
}

export interface PobScenarioConfiguration {
  scenario: PobCalculationScenario;
  label?: string;
  enabledConditions?: string[];
  disabledConditions?: string[];
  notes?: string[];
}

export interface PobOffenceMetrics {
  mainSkill?: string;
  skillPart?: string;
  totalDps?: number;
  fullDps?: number;
  combinedDps?: number;
  hitDps?: number;
  dotDps?: number;
  igniteDps?: number;
  bleedDps?: number;
  poisonDps?: number;
  impaleDps?: number;
  averageHit?: number;
  speed?: number;
  hitRate?: number;
  effectiveTriggerRate?: number;
  hitChance?: number;
  critChance?: number;
  critMultiplier?: number;
}

export interface PobMaximumHitMetrics {
  physical?: number;
  fire?: number;
  cold?: number;
  lightning?: number;
  chaos?: number;
}

export interface PobDefenceMetrics {
  life?: number;
  energyShield?: number;
  mana?: number;
  ward?: number;
  effectiveHitPool?: number;
  maximumHit?: PobMaximumHitMetrics;
  armour?: number;
  evasion?: number;
  spellSuppressionChance?: number;
  attackBlockChance?: number;
  spellBlockChance?: number;
  fireResistance?: number;
  coldResistance?: number;
  lightningResistance?: number;
  chaosResistance?: number;
  fireResistanceOverCap?: number;
  coldResistanceOverCap?: number;
  lightningResistanceOverCap?: number;
  chaosResistanceOverCap?: number;
  lifeRegen?: number;
  energyShieldRegen?: number;
  lifeLeechRate?: number;
  energyShieldLeechRate?: number;
  totalNetRecovery?: number;
  netLifeRecovery?: number;
  netManaRecovery?: number;
  netEnergyShieldRecovery?: number;
  totalDegen?: number;
  guardSkillActive?: boolean;
}

export interface PobCalculationWarning {
  code: string;
  message: string;
  confidence: PobCalculationConfidence;
}

export interface PobCalculationResult {
  protocolVersion: number;
  requestId: string;
  kernel: PobCalculationKernelVersion;
  scenario: PobScenarioConfiguration;
  offence: PobOffenceMetrics;
  defence: PobDefenceMetrics;
  warnings: PobCalculationWarning[];
  elapsedMs: number;
}

export type PobPerturbation =
  | {
      kind: 'synthetic-stat';
      stat: string;
      value: number;
      unit?: string;
    }
  | {
      kind: 'disable-gem';
      skillGroup?: number;
      gemName: string;
    }
  | {
      kind: 'replace-item';
      slot: PobReplaceableItemSlot;
      itemText: string;
    }
  | {
      kind: 'passive-node';
      operation: PobPassiveNodeOperation;
      nodeId: number;
    }
  | {
      kind: 'toggle-flask';
      slot: PobFlaskSlot;
    }
  | {
      kind: 'configuration';
      key: string;
      value: boolean | number | string;
    };

export interface PobFlaskStateTransition {
  kind: 'flask-active';
  slot: PobFlaskSlot;
  fromActive: boolean;
  toActive: boolean;
}

export type PobPerturbationStateTransition = PobFlaskStateTransition;

export interface PobLoadAndCalculateRequest {
  protocolVersion: number;
  requestId: string;
  operation: 'load-and-calculate';
  xml: string;
  scenario: PobScenarioConfiguration;
}

export interface PobCalculateWithPerturbationsRequest {
  protocolVersion: number;
  requestId: string;
  operation: 'calculate-with-perturbations';
  xml: string;
  scenario: PobScenarioConfiguration;
  perturbations: PobPerturbation[];
}

export interface PobHealthRequest {
  protocolVersion: number;
  requestId: string;
  operation: 'health';
}

export type PobCalculationRequest =
  | PobLoadAndCalculateRequest
  | PobCalculateWithPerturbationsRequest
  | PobHealthRequest;

export interface PobWorkerError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface PobWorkerHealth {
  status: 'ready';
  kernel: PobCalculationKernelVersion;
}

export interface PobWorkerCalculationSuccess {
  protocolVersion: number;
  requestId: string;
  ok: true;
  result: PobCalculationResult;
}

export interface PobPerturbationComparison {
  perturbations: PobPerturbation[];
  before: PobCalculationResult;
  after: PobCalculationResult;
  stateTransition?: PobPerturbationStateTransition;
}

export interface PobWorkerPerturbationSuccess {
  protocolVersion: number;
  requestId: string;
  ok: true;
  comparison: PobPerturbationComparison;
}

export interface PobWorkerHealthSuccess {
  protocolVersion: number;
  requestId: string;
  ok: true;
  health: PobWorkerHealth;
}

export interface PobWorkerFailure {
  protocolVersion: number;
  requestId?: string;
  ok: false;
  error: PobWorkerError;
}

export type PobWorkerResponse =
  | PobWorkerCalculationSuccess
  | PobWorkerPerturbationSuccess
  | PobWorkerHealthSuccess
  | PobWorkerFailure;

export interface PobMetricDelta {
  before?: number;
  after?: number;
  absolute?: number;
  percent?: number;
}

export interface PobCalculationDelta {
  totalDps: PobMetricDelta;
  effectiveHitPool: PobMetricDelta;
  maximumHit: {
    physical: PobMetricDelta;
    fire: PobMetricDelta;
    cold: PobMetricDelta;
    lightning: PobMetricDelta;
    chaos: PobMetricDelta;
  };
}

export interface PobPerturbationEvaluation extends PobPerturbationComparison {
  delta: PobCalculationDelta;
}

function metricDelta(before: number | undefined, after: number | undefined): PobMetricDelta {
  if (before === undefined && after === undefined) return {};
  const result: PobMetricDelta = { before, after };
  if (before !== undefined && after !== undefined) {
    result.absolute = after - before;
    if (before !== 0) result.percent = ((after - before) / Math.abs(before)) * 100;
  }
  return result;
}

export function calculationDelta(before: PobCalculationResult, after: PobCalculationResult): PobCalculationDelta {
  return {
    totalDps: metricDelta(before.offence.totalDps ?? before.offence.combinedDps, after.offence.totalDps ?? after.offence.combinedDps),
    effectiveHitPool: metricDelta(before.defence.effectiveHitPool, after.defence.effectiveHitPool),
    maximumHit: {
      physical: metricDelta(before.defence.maximumHit?.physical, after.defence.maximumHit?.physical),
      fire: metricDelta(before.defence.maximumHit?.fire, after.defence.maximumHit?.fire),
      cold: metricDelta(before.defence.maximumHit?.cold, after.defence.maximumHit?.cold),
      lightning: metricDelta(before.defence.maximumHit?.lightning, after.defence.maximumHit?.lightning),
      chaos: metricDelta(before.defence.maximumHit?.chaos, after.defence.maximumHit?.chaos),
    },
  };
}

export function perturbationEvaluation(comparison: PobPerturbationComparison): PobPerturbationEvaluation {
  return {
    ...comparison,
    delta: calculationDelta(comparison.before, comparison.after),
  };
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validEnabledPerturbation(perturbation: PobPerturbation): boolean {
  if (perturbation.kind === 'replace-item') {
    if (!POB_REPLACEABLE_ITEM_SLOTS.includes(perturbation.slot)) return false;
    const itemText = perturbation.itemText;
    return Boolean(itemText.trim()) && utf8ByteLength(itemText) <= MAX_POB_PERTURBATION_ITEM_TEXT_BYTES;
  }
  if (perturbation.kind === 'passive-node') {
    return POB_PASSIVE_NODE_OPERATIONS.includes(perturbation.operation)
      && Number.isSafeInteger(perturbation.nodeId)
      && perturbation.nodeId > 0
      && perturbation.nodeId <= MAX_POB_PASSIVE_NODE_ID;
  }
  if (perturbation.kind === 'toggle-flask') {
    return POB_FLASK_SLOTS.includes(perturbation.slot);
  }
  return false;
}

export function validPobCalculationRequest(request: PobCalculationRequest): boolean {
  if (request.protocolVersion !== POB_CALCULATION_PROTOCOL_VERSION) return false;
  if (!request.requestId.trim() || request.requestId.length > 128) return false;
  if (request.operation === 'health') return true;
  if (!request.xml.trim() || request.xml.length > 16 * 1024 * 1024) return false;
  if (!POB_SCENARIOS.includes(request.scenario.scenario)) return false;
  if (request.operation === 'calculate-with-perturbations') {
    if (!Array.isArray(request.perturbations) || request.perturbations.length !== 1) return false;
    if (!request.perturbations.every(validEnabledPerturbation)) return false;
  }
  return true;
}

export function parsePobWorkerProtocolLines(stdout: string): PobWorkerResponse[] {
  const responses: PobWorkerResponse[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith(POB_WORKER_SENTINEL)) continue;
    const payload = line.slice(POB_WORKER_SENTINEL.length);
    if (!payload) continue;
    responses.push(JSON.parse(payload) as PobWorkerResponse);
  }
  return responses;
}
