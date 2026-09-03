import {
  POB_REPLACEABLE_ITEM_SLOTS,
  type PobCalculationKernelVersion,
  type PobPerturbationComparison,
  type PobReplaceableItemSlot,
} from './pob-calculation';
import type { BuildDoctorKernelProvenance } from './build-doctor';
import { reviewedBuildMetrics, type BuildDoctorReviewedMetric } from './build-doctor-reviewed-metrics';
import { constraintFindings, type PobConstraintComparison, type PobConstraintFinding } from './pob-constraints';

export const BUILD_DOCTOR_CANDIDATE_ITEM_SCHEMA_VERSION = 3;

export interface BuildDoctorCandidateConstraintVerified {
  status: 'verified';
  kernel: BuildDoctorKernelProvenance;
  findings: PobConstraintFinding[];
  message: string;
}

export interface BuildDoctorCandidateConstraintUnavailable {
  status: 'unavailable';
  findings: [];
  message: string;
}

export type BuildDoctorCandidateConstraintEvidence = BuildDoctorCandidateConstraintVerified | BuildDoctorCandidateConstraintUnavailable;

export type BuildDoctorDropInStatus = 'blocked' | 'caution' | 'preserved' | 'unverified';

export interface BuildDoctorDropInVerdict {
  status: BuildDoctorDropInStatus;
  title: string;
  message: string;
  brokenCount: number;
  weakenedBufferCount: number;
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
  metrics: BuildDoctorReviewedMetric[];
  changedMetrics: BuildDoctorReviewedMetric[];
  constraints: BuildDoctorCandidateConstraintEvidence;
  dropIn: BuildDoctorDropInVerdict;
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

function sameKernel(left: PobCalculationKernelVersion, right: PobCalculationKernelVersion): boolean {
  return left.protocolVersion === right.protocolVersion
    && left.pobRepository === right.pobRepository
    && left.pobCommit === right.pobCommit
    && left.runtime === right.runtime
    && left.runtimeRevision === right.runtimeRevision
    && left.adapterVersion === right.adapterVersion;
}

function samePinnedRuntime(left: PobCalculationKernelVersion, right: PobCalculationKernelVersion): boolean {
  return left.protocolVersion === right.protocolVersion
    && left.pobRepository === right.pobRepository
    && left.pobCommit === right.pobCommit
    && left.runtime === right.runtime
    && left.runtimeRevision === right.runtimeRevision;
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

export function candidateDropInVerdict(constraints: BuildDoctorCandidateConstraintEvidence): BuildDoctorDropInVerdict {
  if (constraints.status !== 'verified') {
    return {
      status: 'unverified',
      title: 'Drop-in compatibility unverified',
      message: 'Hard-constraint evidence is unavailable, so ExileQuesting cannot verify this item as a drop-in replacement even if its numerical PoB deltas look favorable.',
      brokenCount: 0,
      weakenedBufferCount: 0,
    };
  }

  const brokenCount = constraints.findings.filter((finding) => finding.state === 'broken').length;
  const weakenedBufferCount = constraints.findings.filter((finding) => finding.state === 'weakened-buffer').length;
  if (brokenCount > 0) {
    return {
      status: 'blocked',
      title: 'Not a drop-in replacement',
      message: `${brokenCount} previously satisfied PoB constraint${brokenCount === 1 ? '' : 's'} become unsatisfied. The item may still belong in a coordinated upgrade package, but it is not a like-for-like replacement under the supported checks.`,
      brokenCount,
      weakenedBufferCount,
    };
  }
  if (weakenedBufferCount > 0) {
    return {
      status: 'caution',
      title: 'Drop-in with reduced buffer',
      message: `No supported PoB constraint becomes unsatisfied, but ${weakenedBufferCount} previously satisfied buffer${weakenedBufferCount === 1 ? '' : 's'} become thinner. Treat the replacement as more fragile until surrounding gear/content requirements are rechecked.`,
      brokenCount,
      weakenedBufferCount,
    };
  }
  return {
    status: 'preserved',
    title: 'Supported drop-in constraints preserved',
    message: 'The replacement preserves every currently supported PoB hard-constraint state. This is not an overall upgrade recommendation; unresolved sockets, reservation, cost and coordinated transitions still apply.',
    brokenCount,
    weakenedBufferCount,
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
  constraint?: {
    comparison: PobConstraintComparison;
    kernel: PobCalculationKernelVersion;
  };
  constraintUnavailableMessage?: string;
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

  let constraints: BuildDoctorCandidateConstraintEvidence;
  if (input.constraint) {
    if (input.constraint.comparison.slot !== input.slot) {
      throw new Error('Build Doctor constraint comparison does not match the requested candidate equipment slot.');
    }
    if (!samePinnedRuntime(input.comparison.before.kernel, input.constraint.kernel)) {
      throw new Error('Build Doctor constraint evidence does not share the candidate calculation PoB/runtime provenance.');
    }
    const findings = constraintFindings(input.constraint.comparison);
    constraints = {
      status: 'verified',
      kernel: kernelProvenance(input.constraint.kernel),
      findings,
      message: findings.length
        ? `${findings.length} PoB-proven constraint transition${findings.length === 1 ? '' : 's'} detected for this replacement.`
        : 'Pinned PoB found no transition in the currently supported hard-constraint checks.',
    };
  } else {
    constraints = {
      status: 'unavailable',
      findings: [],
      message: (input.constraintUnavailableMessage ?? 'Hard-constraint verification was not available for this calculation.').replace(/\s+/g, ' ').trim().slice(0, 700),
    };
  }

  const metrics = reviewedBuildMetrics(input.comparison.before, input.comparison.after);
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
    constraints,
    dropIn: candidateDropInVerdict(constraints),
    beforeWarnings: input.comparison.before.warnings.map((warning) => warning.message),
    afterWarnings: input.comparison.after.warnings.map((warning) => warning.message),
    boundary: 'This is a deterministic PoB slot-replacement calculation. The drop-in verdict only describes preservation of currently supported attribute, resistance-cap and spell-suppression constraint state. ExileQuesting has not yet proven socket/link migration, reservation validity, trade cost, crafting cost, or coordinated multi-slot/passive transitions for this candidate.',
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
