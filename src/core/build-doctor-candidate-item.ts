import {
  POB_REPLACEABLE_ITEM_SLOTS,
  type PobCalculationKernelVersion,
  type PobCalculationResult,
  type PobPerturbationComparison,
  type PobReplaceableItemSlot,
} from './pob-calculation';
import type { BuildDoctorKernelProvenance } from './build-doctor';

export const BUILD_DOCTOR_CANDIDATE_ITEM_SCHEMA_VERSION = 1;

export const BUILD_DOCTOR_REVIEWED_ITEM_METRIC_GROUPS = [
  'offence',
  'survivability',
  'resources',
  'mitigation',
  'resistance',
  'recovery',
] as const;

export type BuildDoctorReviewedItemMetricGroup = typeof BUILD_DOCTOR_REVIEWED_ITEM_METRIC_GROUPS[number];
export type BuildDoctorReviewedItemMetricFormat = 'number' | 'percent' | 'rate';

export interface BuildDoctorReviewedItemMetric {
  key: string;
  label: string;
  group: BuildDoctorReviewedItemMetricGroup;
  format: BuildDoctorReviewedItemMetricFormat;
  before?: number;
  after?: number;
  absoluteChange?: number;
  relativeChangePercent?: number;
  changed: boolean;
}

export interface BuildDoctorCandidateItemReady {
  schemaVersion: number;
  status: 'ready';
  profileId: string;
  profileName: string;
  generatedAt: string;
  slot: PobReplaceableItemSlot;
  candidateLabel: string;
  kernel: BuildDoctorKernelProvenance;
  metrics: BuildDoctorReviewedItemMetric[];
  changedMetrics: BuildDoctorReviewedItemMetric[];
  beforeWarnings: string[];
  afterWarnings: string[];
  boundary: string;
}

export interface BuildDoctorCandidateItemUnavailable {
  schemaVersion: number;
  status: 'unavailable' | 'failed';
  profileId: string;
  profileName: string;
  generatedAt: string;
  slot?: PobReplaceableItemSlot;
  message: string;
}

export type BuildDoctorCandidateItemAnalysis = BuildDoctorCandidateItemReady | BuildDoctorCandidateItemUnavailable;

type MetricDescriptor = {
  key: string;
  label: string;
  group: BuildDoctorReviewedItemMetricGroup;
  format: BuildDoctorReviewedItemMetricFormat;
  read: (result: PobCalculationResult) => number | undefined;
};

function damage(result: PobCalculationResult): number | undefined {
  return result.offence.totalDps
    ?? result.offence.fullDps
    ?? result.offence.combinedDps
    ?? result.offence.hitDps
    ?? result.offence.dotDps;
}

const REVIEWED_METRICS: readonly MetricDescriptor[] = [
  { key: 'damage', label: 'PoB damage', group: 'offence', format: 'number', read: damage },
  { key: 'effective-trigger-rate', label: 'Effective trigger rate', group: 'offence', format: 'rate', read: (result) => result.offence.effectiveTriggerRate },
  { key: 'speed', label: 'Action speed/rate', group: 'offence', format: 'rate', read: (result) => result.offence.speed },
  { key: 'crit-chance', label: 'Crit chance', group: 'offence', format: 'percent', read: (result) => result.offence.critChance },
  { key: 'effective-hit-pool', label: 'Effective hit pool', group: 'survivability', format: 'number', read: (result) => result.defence.effectiveHitPool },
  { key: 'physical-max-hit', label: 'Physical max hit', group: 'survivability', format: 'number', read: (result) => result.defence.maximumHit?.physical },
  { key: 'fire-max-hit', label: 'Fire max hit', group: 'survivability', format: 'number', read: (result) => result.defence.maximumHit?.fire },
  { key: 'cold-max-hit', label: 'Cold max hit', group: 'survivability', format: 'number', read: (result) => result.defence.maximumHit?.cold },
  { key: 'lightning-max-hit', label: 'Lightning max hit', group: 'survivability', format: 'number', read: (result) => result.defence.maximumHit?.lightning },
  { key: 'chaos-max-hit', label: 'Chaos max hit', group: 'survivability', format: 'number', read: (result) => result.defence.maximumHit?.chaos },
  { key: 'life', label: 'Life', group: 'resources', format: 'number', read: (result) => result.defence.life },
  { key: 'energy-shield', label: 'Energy shield', group: 'resources', format: 'number', read: (result) => result.defence.energyShield },
  { key: 'mana', label: 'Mana', group: 'resources', format: 'number', read: (result) => result.defence.mana },
  { key: 'ward', label: 'Ward', group: 'resources', format: 'number', read: (result) => result.defence.ward },
  { key: 'armour', label: 'Armour', group: 'mitigation', format: 'number', read: (result) => result.defence.armour },
  { key: 'evasion', label: 'Evasion', group: 'mitigation', format: 'number', read: (result) => result.defence.evasion },
  { key: 'spell-suppression', label: 'Spell suppression', group: 'mitigation', format: 'percent', read: (result) => result.defence.spellSuppressionChance },
  { key: 'attack-block', label: 'Attack block', group: 'mitigation', format: 'percent', read: (result) => result.defence.attackBlockChance },
  { key: 'spell-block', label: 'Spell block', group: 'mitigation', format: 'percent', read: (result) => result.defence.spellBlockChance },
  { key: 'fire-resistance', label: 'Fire resistance', group: 'resistance', format: 'percent', read: (result) => result.defence.fireResistance },
  { key: 'cold-resistance', label: 'Cold resistance', group: 'resistance', format: 'percent', read: (result) => result.defence.coldResistance },
  { key: 'lightning-resistance', label: 'Lightning resistance', group: 'resistance', format: 'percent', read: (result) => result.defence.lightningResistance },
  { key: 'chaos-resistance', label: 'Chaos resistance', group: 'resistance', format: 'percent', read: (result) => result.defence.chaosResistance },
  { key: 'fire-overcap', label: 'Fire overcap', group: 'resistance', format: 'percent', read: (result) => result.defence.fireResistanceOverCap },
  { key: 'cold-overcap', label: 'Cold overcap', group: 'resistance', format: 'percent', read: (result) => result.defence.coldResistanceOverCap },
  { key: 'lightning-overcap', label: 'Lightning overcap', group: 'resistance', format: 'percent', read: (result) => result.defence.lightningResistanceOverCap },
  { key: 'chaos-overcap', label: 'Chaos overcap', group: 'resistance', format: 'percent', read: (result) => result.defence.chaosResistanceOverCap },
  { key: 'total-net-recovery', label: 'Total net recovery', group: 'recovery', format: 'rate', read: (result) => result.defence.totalNetRecovery },
  { key: 'life-regen', label: 'Life regen', group: 'recovery', format: 'rate', read: (result) => result.defence.lifeRegen },
  { key: 'energy-shield-regen', label: 'ES regen', group: 'recovery', format: 'rate', read: (result) => result.defence.energyShieldRegen },
  { key: 'life-leech-rate', label: 'Life leech rate', group: 'recovery', format: 'rate', read: (result) => result.defence.lifeLeechRate },
  { key: 'energy-shield-leech-rate', label: 'ES leech rate', group: 'recovery', format: 'rate', read: (result) => result.defence.energyShieldLeechRate },
];

function sameKernel(left: PobCalculationKernelVersion, right: PobCalculationKernelVersion): boolean {
  return left.protocolVersion === right.protocolVersion
    && left.pobRepository === right.pobRepository
    && left.pobCommit === right.pobCommit
    && left.runtimeRevision === right.runtimeRevision
    && left.adapterVersion === right.adapterVersion;
}

function kernelProvenance(kernel: PobCalculationKernelVersion): BuildDoctorKernelProvenance {
  return {
    pobRepository: kernel.pobRepository,
    pobCommit: kernel.pobCommit,
    runtime: kernel.runtime,
    runtimeRevision: kernel.runtimeRevision,
    adapterVersion: kernel.adapterVersion,
  };
}

function metric(descriptor: MetricDescriptor, beforeResult: PobCalculationResult, afterResult: PobCalculationResult): BuildDoctorReviewedItemMetric {
  const before = descriptor.read(beforeResult);
  const after = descriptor.read(afterResult);
  const bothFinite = before !== undefined && after !== undefined && Number.isFinite(before) && Number.isFinite(after);
  const absoluteChange = bothFinite ? after - before : undefined;
  const relativeChangePercent = bothFinite && before !== 0 ? ((after - before) / Math.abs(before)) * 100 : undefined;
  const changed = bothFinite ? Math.abs(after - before) > 1e-9 : before !== after;
  return {
    key: descriptor.key,
    label: descriptor.label,
    group: descriptor.group,
    format: descriptor.format,
    before,
    after,
    absoluteChange,
    relativeChangePercent,
    changed,
  };
}

export function candidateItemLabel(itemText: string): string {
  const lines = itemText.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const rarityIndex = lines.findIndex((line) => line.startsWith('Rarity:'));
  if (rarityIndex >= 0) {
    const name = lines[rarityIndex + 1];
    const base = lines[rarityIndex + 2];
    if (name && base && name !== '--------' && base !== '--------') return `${name} · ${base}`.slice(0, 180);
    if (name && name !== '--------') return name.slice(0, 180);
  }
  return 'Pasted candidate item';
}

export function readyCandidateItemAnalysis(input: {
  profileId: string;
  profileName: string;
  generatedAt: string;
  slot: PobReplaceableItemSlot;
  candidateLabel: string;
  comparison: PobPerturbationComparison;
}): BuildDoctorCandidateItemReady {
  if (!POB_REPLACEABLE_ITEM_SLOTS.includes(input.slot)) throw new Error('Build Doctor candidate item used an unsupported equipment slot.');
  if (input.comparison.perturbations.length !== 1) throw new Error('Build Doctor candidate item comparison requires exactly one PoB perturbation.');
  const perturbation = input.comparison.perturbations[0];
  if (perturbation.kind !== 'replace-item' || perturbation.slot !== input.slot) {
    throw new Error('Build Doctor candidate item comparison does not match the requested equipment slot.');
  }
  if (!sameKernel(input.comparison.before.kernel, input.comparison.after.kernel)) {
    throw new Error('Build Doctor candidate item comparison changed PoB kernel provenance between states.');
  }

  const metrics = REVIEWED_METRICS.map((descriptor) => metric(descriptor, input.comparison.before, input.comparison.after));
  return {
    schemaVersion: BUILD_DOCTOR_CANDIDATE_ITEM_SCHEMA_VERSION,
    status: 'ready',
    profileId: input.profileId,
    profileName: input.profileName,
    generatedAt: input.generatedAt,
    slot: input.slot,
    candidateLabel: input.candidateLabel.replace(/\s+/g, ' ').trim().slice(0, 180) || 'Pasted candidate item',
    kernel: kernelProvenance(input.comparison.before.kernel),
    metrics,
    changedMetrics: metrics.filter((entry) => entry.changed),
    beforeWarnings: input.comparison.before.warnings.map((warning) => warning.message),
    afterWarnings: input.comparison.after.warnings.map((warning) => warning.message),
    boundary: 'This is a deterministic PoB slot-replacement calculation. ExileQuesting has not yet proven item requirements, socket/link migration, reservation changes, trade cost, crafting cost, or coordinated multi-slot/passive transitions for this candidate.',
  };
}

export function unavailableCandidateItemAnalysis(input: {
  profileId: string;
  profileName: string;
  status: 'unavailable' | 'failed';
  message: string;
  slot?: PobReplaceableItemSlot;
  generatedAt?: string;
}): BuildDoctorCandidateItemUnavailable {
  return {
    schemaVersion: BUILD_DOCTOR_CANDIDATE_ITEM_SCHEMA_VERSION,
    status: input.status,
    profileId: input.profileId,
    profileName: input.profileName,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    slot: input.slot,
    message: input.message.replace(/\s+/g, ' ').trim().slice(0, 800) || 'Candidate item analysis is unavailable.',
  };
}
