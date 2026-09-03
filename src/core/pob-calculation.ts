export const POB_CALCULATION_PROTOCOL_VERSION = 1;

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

export type PobCalculationScenario = typeof POB_SCENARIOS[number];
export type PobCalculationConfidence = typeof POB_CONFIDENCE_CLASSES[number];

export interface PobCalculationKernelVersion {
  protocolVersion: number;
  pobRepository: string;
  pobCommit: string;
  runtime: string;
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
  combinedDps?: number;
  hitDps?: number;
  dotDps?: number;
  igniteDps?: number;
  bleedDps?: number;
  poisonDps?: number;
  impaleDps?: number;
  averageHit?: number;
  hitRate?: number;
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
  maximumFireResistance?: number;
  maximumColdResistance?: number;
  maximumLightningResistance?: number;
  maximumChaosResistance?: number;
  lifeRegen?: number;
  energyShieldRegen?: number;
  lifeLeechRate?: number;
  energyShieldLeechRate?: number;
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
      slot: string;
      itemText: string;
    }
  | {
      kind: 'passive-node';
      operation: 'allocate' | 'deallocate';
      nodeId: number;
    }
  | {
      kind: 'configuration';
      key: string;
      value: boolean | number | string;
    };

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

export function validPobCalculationRequest(request: PobCalculationRequest): boolean {
  if (request.protocolVersion !== POB_CALCULATION_PROTOCOL_VERSION) return false;
  if (!request.requestId.trim() || request.requestId.length > 128) return false;
  if (request.operation === 'health') return true;
  if (!request.xml.trim() || request.xml.length > 16 * 1024 * 1024) return false;
  if (!POB_SCENARIOS.includes(request.scenario.scenario)) return false;
  if (request.operation === 'calculate-with-perturbations' && request.perturbations.length > 64) return false;
  return true;
}
