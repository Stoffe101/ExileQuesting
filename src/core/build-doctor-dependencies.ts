import {
  calculationDelta,
  type PobCalculationDelta,
  type PobFlaskProfile,
  type PobFlaskSlot,
  type PobMetricDelta,
  type PobPerturbationComparison,
} from './pob-calculation';
import type { BuildDoctorKernelProvenance } from './build-doctor';

export const BUILD_DOCTOR_DEPENDENCY_SCHEMA_VERSION = 1;

export interface BuildDoctorMeasuredDependency {
  status: 'measured';
  slot: PobFlaskSlot;
  name: string;
  kind: 'utility-availability';
  evidence: 'pob-reversible-toggle';
  fromActive: true;
  toActive: false;
  delta: PobCalculationDelta;
  strongestObservedRelativeChangePercent?: number;
}

export interface BuildDoctorUnsupportedDependency {
  status: 'unsupported';
  slot: PobFlaskSlot;
  name: string;
  kind: 'utility-availability';
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
    strongestObservedRelativeChangePercent: strongestObservedRelativeChangePercent(delta),
  };
}

export function unsupportedConfigurationDependency(
  flask: Pick<PobFlaskProfile, 'slot' | 'name'>,
  message: string,
): BuildDoctorUnsupportedDependency {
  return {
    status: 'unsupported',
    slot: flask.slot,
    name: flask.name,
    kind: 'utility-availability',
    evidence: 'not-measured',
    message: message.replace(/\s+/g, ' ').trim().slice(0, 500) || 'PoB could not measure this configuration dependency.',
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
  return {
    schemaVersion: BUILD_DOCTOR_DEPENDENCY_SCHEMA_VERSION,
    profileId: input.profileId,
    profileName: input.profileName,
    generatedAt: input.generatedAt,
    status: 'ready',
    message: dependencies.length
      ? `${measured} active utility configuration ${measured === 1 ? 'dependency was' : 'dependencies were'} measured by reversible PoB calculation${unsupported ? `; ${unsupported} remained unsupported` : ''}. Ranking reflects only the largest observed relative change among reviewed outputs, not encounter uptime or build quality.`
      : 'No active utility configuration dependencies required measurement in the imported PoB state.',
    kernel: input.kernel,
    dependencies,
  };
}
