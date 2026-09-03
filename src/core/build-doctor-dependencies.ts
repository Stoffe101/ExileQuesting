import {
  calculationDelta,
  type PobCalculationDelta,
  type PobFlaskProfile,
  type PobFlaskSlot,
  type PobFlaskUptimeEntry,
  type PobMetricDelta,
  type PobPerturbationComparison,
} from './pob-calculation';
import type { BuildDoctorKernelProvenance } from './build-doctor';

export const BUILD_DOCTOR_DEPENDENCY_SCHEMA_VERSION = 1;

export interface BuildDoctorPobUptimeEstimate {
  status: 'estimated';
  source: 'pob-items-tab-effective-flask-stats';
  averagePercent: number;
  minimumPercent: number;
  sourceLine: string;
}

export interface BuildDoctorPobUptimeUnsupported {
  status: 'unsupported';
  source: 'pob-items-tab-effective-flask-stats';
  message: string;
}

export type BuildDoctorPobUptimeEvidence = BuildDoctorPobUptimeEstimate | BuildDoctorPobUptimeUnsupported;

interface BuildDoctorDependencyIdentity {
  slot: PobFlaskSlot;
  name: string;
  kind: 'utility-availability';
  pobUptime: BuildDoctorPobUptimeEvidence;
}

export interface BuildDoctorMeasuredDependency extends BuildDoctorDependencyIdentity {
  status: 'measured';
  evidence: 'pob-reversible-toggle';
  fromActive: true;
  toActive: false;
  delta: PobCalculationDelta;
  strongestObservedRelativeChangePercent?: number;
}

export interface BuildDoctorUnsupportedDependency extends BuildDoctorDependencyIdentity {
  status: 'unsupported';
  evidence: 'not-measured';
  message: string;
}

export type BuildDoctorConfigurationDependency = BuildDoctorMeasuredDependency | BuildDoctorUnsupportedDependency;

export interface BuildDoctorDependencyScan {
  schemaVersion: number;
  profileId: string;
  profileName: string;
  generatedAt: string;
  status: 'ready' | 'unavailable' | 'failed';
  message: string;
  kernel?: BuildDoctorKernelProvenance;
  dependencies: BuildDoctorConfigurationDependency[];
}

function sameKernel(left: PobPerturbationComparison['before']['kernel'], right: PobPerturbationComparison['after']['kernel']): boolean {
  return left.protocolVersion === right.protocolVersion
    && left.pobRepository === right.pobRepository
    && left.pobCommit === right.pobCommit
    && left.runtimeRevision === right.runtimeRevision
    && left.adapterVersion === right.adapterVersion;
}

function relativeCandidates(delta: PobCalculationDelta): PobMetricDelta[] {
  return [
    delta.totalDps,
    delta.effectiveHitPool,
    delta.maximumHit.physical,
    delta.maximumHit.fire,
    delta.maximumHit.cold,
    delta.maximumHit.lightning,
    delta.maximumHit.chaos,
  ];
}

function cleanMessage(message: string, fallback: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 500) || fallback;
}

function validUptimePercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function pobUptimeEvidence(
  entry: PobFlaskUptimeEntry | undefined,
  unavailableMessage = 'Pinned PoB did not expose a supported uptime estimate for this utility.',
): BuildDoctorPobUptimeEvidence {
  if (entry?.supported === true
    && validUptimePercent(entry.averagePercent)
    && validUptimePercent(entry.minimumPercent)
    && typeof entry.sourceLine === 'string'
    && entry.sourceLine.trim()) {
    return {
      status: 'estimated',
      source: 'pob-items-tab-effective-flask-stats',
      averagePercent: entry.averagePercent,
      minimumPercent: entry.minimumPercent,
      sourceLine: entry.sourceLine,
    };
  }
  return {
    status: 'unsupported',
    source: 'pob-items-tab-effective-flask-stats',
    message: cleanMessage(unavailableMessage, 'Pinned PoB uptime evidence is unavailable for this utility.'),
  };
}

export function strongestObservedRelativeChangePercent(delta: PobCalculationDelta): number | undefined {
  const values = relativeCandidates(delta)
    .map((entry) => entry.percent)
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  if (!values.length) return undefined;
  return values.reduce((strongest, value) => Math.abs(value) > Math.abs(strongest) ? value : strongest, values[0]);
}

export function measuredConfigurationDependency(
  flask: Pick<PobFlaskProfile, 'slot' | 'name' | 'active' | 'utility'>,
  comparison: PobPerturbationComparison,
  uptime: BuildDoctorPobUptimeEvidence = pobUptimeEvidence(undefined),
): BuildDoctorMeasuredDependency {
  if (!flask.utility || !flask.active) throw new Error('Build Doctor dependency measurement requires an active utility flask from the inspected PoB state.');
  if (comparison.perturbations.length !== 1) throw new Error('Build Doctor dependency measurement requires exactly one reversible perturbation.');
  const perturbation = comparison.perturbations[0];
  if (perturbation.kind !== 'toggle-flask' || perturbation.slot !== flask.slot) {
    throw new Error('Build Doctor dependency measurement does not match the inspected utility slot.');
  }
  const transition = comparison.stateTransition;
  if (!transition || transition.kind !== 'flask-active' || transition.slot !== flask.slot || transition.fromActive !== true || transition.toActive !== false) {
    throw new Error('Build Doctor dependency measurement is missing the expected active-to-unavailable PoB state transition.');
  }
  if (!sameKernel(comparison.before.kernel, comparison.after.kernel)) {
    throw new Error('Build Doctor dependency measurement changed PoB kernel provenance between states.');
  }

  const delta = calculationDelta(comparison.before, comparison.after);
  return {
    status: 'measured',
    slot: flask.slot,
    name: flask.name,
    kind: 'utility-availability',
    evidence: 'pob-reversible-toggle',
    fromActive: true,
    toActive: false,
    delta,
    pobUptime: uptime,
    strongestObservedRelativeChangePercent: strongestObservedRelativeChangePercent(delta),
  };
}

export function unsupportedConfigurationDependency(
  flask: Pick<PobFlaskProfile, 'slot' | 'name'>,
  message: string,
  uptime: BuildDoctorPobUptimeEvidence = pobUptimeEvidence(undefined),
): BuildDoctorUnsupportedDependency {
  return {
    status: 'unsupported',
    slot: flask.slot,
    name: flask.name,
    kind: 'utility-availability',
    evidence: 'not-measured',
    message: cleanMessage(message, 'PoB could not measure this configuration dependency.'),
    pobUptime: uptime,
  };
}

export function rankConfigurationDependencies(dependencies: BuildDoctorConfigurationDependency[]): BuildDoctorConfigurationDependency[] {
  return [...dependencies].sort((left, right) => {
    if (left.status !== right.status) return left.status === 'measured' ? -1 : 1;
    if (left.status === 'unsupported' || right.status === 'unsupported') return left.slot.localeCompare(right.slot);
    const leftImpact = Math.abs(left.strongestObservedRelativeChangePercent ?? 0);
    const rightImpact = Math.abs(right.strongestObservedRelativeChangePercent ?? 0);
    return rightImpact - leftImpact || left.slot.localeCompare(right.slot);
  });
}

export function unavailableDependencyScan(input: {
  profileId: string;
  profileName: string;
  status: 'unavailable' | 'failed';
  message: string;
  generatedAt?: string;
}): BuildDoctorDependencyScan {
  return {
    schemaVersion: BUILD_DOCTOR_DEPENDENCY_SCHEMA_VERSION,
    profileId: input.profileId,
    profileName: input.profileName,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    status: input.status,
    message: input.message,
    dependencies: [],
  };
}

export function readyDependencyScan(input: {
  profileId: string;
  profileName: string;
  generatedAt: string;
  kernel: BuildDoctorKernelProvenance;
  dependencies: BuildDoctorConfigurationDependency[];
}): BuildDoctorDependencyScan {
  const dependencies = rankConfigurationDependencies(input.dependencies);
  const measured = dependencies.filter((entry) => entry.status === 'measured').length;
  const unsupported = dependencies.length - measured;
  const uptimeEstimated = dependencies.filter((entry) => entry.pobUptime.status === 'estimated').length;
  return {
    schemaVersion: BUILD_DOCTOR_DEPENDENCY_SCHEMA_VERSION,
    profileId: input.profileId,
    profileName: input.profileName,
    generatedAt: input.generatedAt,
    status: 'ready',
    message: dependencies.length
      ? `${measured} active utility configuration ${measured === 1 ? 'dependency was' : 'dependencies were'} measured by reversible PoB calculation${unsupported ? `; ${unsupported} remained unsupported` : ''}. PoB exposed an average/minimum uptime estimate for ${uptimeEstimated}/${dependencies.length}. Ranking reflects only the largest observed relative change among reviewed outputs; uptime estimates are shown separately and are not multiplied into practical DPS/EHP.`
      : 'No active utility configuration dependencies required measurement in the imported PoB state.',
    kernel: input.kernel,
    dependencies,
  };
}
