import type { PobCalculationResult } from './pob-calculation';

export const BUILD_DOCTOR_REVIEWED_METRIC_GROUPS = [
  'offence',
  'survivability',
  'resources',
  'mitigation',
  'resistance',
  'recovery',
] as const;

export type BuildDoctorReviewedMetricGroup = typeof BUILD_DOCTOR_REVIEWED_METRIC_GROUPS[number];
export type BuildDoctorReviewedMetricFormat = 'number' | 'percent' | 'rate';

export interface BuildDoctorReviewedMetric {
  key: string;
  label: string;
  group: BuildDoctorReviewedMetricGroup;
  format: BuildDoctorReviewedMetricFormat;
  before?: number;
  after?: number;
  absoluteChange?: number;
  relativeChangePercent?: number;
  changed: boolean;
}

type MetricDescriptor = {
  key: string;
  label: string;
  group: BuildDoctorReviewedMetricGroup;
  format: BuildDoctorReviewedMetricFormat;
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

function metric(descriptor: MetricDescriptor, beforeResult: PobCalculationResult, afterResult: PobCalculationResult): BuildDoctorReviewedMetric {
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

export function reviewedBuildMetrics(before: PobCalculationResult, after: PobCalculationResult): BuildDoctorReviewedMetric[] {
  return REVIEWED_METRICS.map((descriptor) => metric(descriptor, before, after));
}
