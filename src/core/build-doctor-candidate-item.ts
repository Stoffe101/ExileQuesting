import {
  POB_REPLACEABLE_ITEM_SLOTS,
  type PobCalculationKernelVersion,
  type PobPerturbationComparison,
  type PobReplaceableItemSlot,
} from './pob-calculation';
import type { BuildDoctorKernelProvenance } from './build-doctor';
import { reviewedBuildMetrics, type BuildDoctorReviewedMetric } from './build-doctor-reviewed-metrics';

export const BUILD_DOCTOR_CANDIDATE_ITEM_SCHEMA_VERSION = 1;

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
