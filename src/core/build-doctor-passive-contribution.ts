import type { BuildDoctorKernelProvenance } from './build-doctor';
import type { BuildProfile } from './build-profiles';
import type { PassiveNodeKind, PassiveNodeRecord, PassiveTreeSnapshot } from './passive-data';
import { indexPassiveNodes } from './passive-data';
import type { PobCalculationKernelVersion, PobPerturbationComparison } from './pob-calculation';
import { reviewedBuildMetrics, type BuildDoctorReviewedMetric } from './build-doctor-reviewed-metrics';

export const BUILD_DOCTOR_PASSIVE_CONTRIBUTION_SCHEMA_VERSION = 1;
export const BUILD_DOCTOR_PASSIVE_CONTRIBUTION_KINDS = ['keystone', 'notable', 'normal'] as const satisfies readonly PassiveNodeKind[];
export type BuildDoctorPassiveContributionKind = typeof BUILD_DOCTOR_PASSIVE_CONTRIBUTION_KINDS[number];

export interface BuildDoctorPassiveCandidate {
  nodeId: number;
  name: string;
  kind: BuildDoctorPassiveContributionKind;
}

export interface BuildDoctorPassiveCandidateListReady {
  schemaVersion: number;
  status: 'ready';
  profileId: string;
  profileName: string;
  treeVersion: string;
  candidates: BuildDoctorPassiveCandidate[];
  message: string;
}

export interface BuildDoctorPassiveCandidateListUnavailable {
  schemaVersion: number;
  status: 'unavailable';
  profileId: string;
  profileName: string;
  message: string;
  candidates: [];
}

export type BuildDoctorPassiveCandidateList = BuildDoctorPassiveCandidateListReady | BuildDoctorPassiveCandidateListUnavailable;

export interface BuildDoctorPassiveContributionReady {
  schemaVersion: number;
  status: 'ready';
  profileId: string;
  profileName: string;
  generatedAt: string;
  node: BuildDoctorPassiveCandidate;
  kernel: BuildDoctorKernelProvenance;
  metrics: BuildDoctorReviewedMetric[];
  changedMetrics: BuildDoctorReviewedMetric[];
  beforeWarnings: string[];
  afterWarnings: string[];
  boundary: string;
}

export interface BuildDoctorPassiveContributionUnavailable {
  schemaVersion: number;
  status: 'unavailable' | 'failed';
  profileId: string;
  profileName: string;
  generatedAt: string;
  nodeId?: number;
  message: string;
}

export type BuildDoctorPassiveContributionAnalysis = BuildDoctorPassiveContributionReady | BuildDoctorPassiveContributionUnavailable;

function normalizedGameVersion(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.trim().replaceAll('_', '.').match(/^(\d+)\.(\d+)/);
  return match ? `${Number(match[1])}.${Number(match[2])}` : undefined;
}

function activeTreeVersion(profile: BuildProfile): string | undefined {
  return profile.build.targetVersion
    ?? profile.build.treeStages.find((stage) => stage.active)?.treeVersion
    ?? profile.build.treeStages[0]?.treeVersion;
}

function activeTreeNodeIds(profile: BuildProfile): number[] {
  const stage = profile.build.treeStages.find((candidate) => candidate.active) ?? profile.build.treeStages[0];
  return [...new Set((stage?.nodeIds ?? []).filter((id) => Number.isSafeInteger(id) && id > 0))];
}

function supportedNode(node: PassiveNodeRecord | undefined): node is PassiveNodeRecord & { kind: BuildDoctorPassiveContributionKind } {
  return Boolean(node)
    && node!.dynamic !== true
    && BUILD_DOCTOR_PASSIVE_CONTRIBUTION_KINDS.includes(node!.kind as BuildDoctorPassiveContributionKind);
}

const KIND_RANK: Record<BuildDoctorPassiveContributionKind, number> = { keystone: 0, notable: 1, normal: 2 };

export function passiveContributionCandidates(profile: BuildProfile, snapshot: PassiveTreeSnapshot): BuildDoctorPassiveCandidateList {
  const profileVersion = normalizedGameVersion(activeTreeVersion(profile));
  const dataVersion = normalizedGameVersion(snapshot.gameVersion);
  if (!profileVersion || !dataVersion || profileVersion !== dataVersion) {
    return {
      schemaVersion: BUILD_DOCTOR_PASSIVE_CONTRIBUTION_SCHEMA_VERSION,
      status: 'unavailable',
      profileId: profile.id,
      profileName: profile.name,
      message: `Passive contribution names/types are unavailable because the active PoB tree version (${activeTreeVersion(profile) ?? 'unknown'}) does not match the verified bundled tree (${snapshot.gameVersion}).`,
      candidates: [],
    };
  }

  const index = indexPassiveNodes(snapshot);
  const candidates = activeTreeNodeIds(profile)
    .map((nodeId) => index.get(nodeId))
    .filter(supportedNode)
    .map((node) => ({ nodeId: node.id, name: node.name, kind: node.kind }))
    .sort((left, right) => KIND_RANK[left.kind] - KIND_RANK[right.kind] || left.name.localeCompare(right.name) || left.nodeId - right.nodeId);

  return {
    schemaVersion: BUILD_DOCTOR_PASSIVE_CONTRIBUTION_SCHEMA_VERSION,
    status: 'ready',
    profileId: profile.id,
    profileName: profile.name,
    treeVersion: snapshot.gameVersion,
    candidates,
    message: candidates.length
      ? `${candidates.length} allocated normal/notable/keystone passive points are available for isolated PoB contribution measurement.`
      : 'The active compatible PoB tree did not contain allocated normal/notable/keystone points eligible for isolated contribution measurement.',
  };
}

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

export function readyPassiveContributionAnalysis(input: {
  profileId: string;
  profileName: string;
  generatedAt: string;
  node: BuildDoctorPassiveCandidate;
  comparison: PobPerturbationComparison;
}): BuildDoctorPassiveContributionReady {
  if (input.comparison.perturbations.length !== 1) throw new Error('Build Doctor passive contribution requires exactly one PoB perturbation.');
  const perturbation = input.comparison.perturbations[0];
  if (perturbation.kind !== 'passive-node' || perturbation.operation !== 'deallocate' || perturbation.nodeId !== input.node.nodeId) {
    throw new Error('Build Doctor passive contribution does not match the requested allocated node deallocation.');
  }
  if (!sameKernel(input.comparison.before.kernel, input.comparison.after.kernel)) {
    throw new Error('Build Doctor passive contribution changed PoB kernel provenance between states.');
  }
  const metrics = reviewedBuildMetrics(input.comparison.before, input.comparison.after);
  return {
    schemaVersion: BUILD_DOCTOR_PASSIVE_CONTRIBUTION_SCHEMA_VERSION,
    status: 'ready',
    profileId: input.profileId,
    profileName: input.profileName,
    generatedAt: input.generatedAt,
    node: input.node,
    kernel: kernelProvenance(input.comparison.before.kernel),
    metrics,
    changedMetrics: metrics.filter((metric) => metric.changed),
    beforeWarnings: input.comparison.before.warnings.map((warning) => warning.message),
    afterWarnings: input.comparison.after.warnings.map((warning) => warning.message),
    boundary: 'This is an isolated PoB deallocation sensitivity measurement for one currently allocated point. It does not prove that removing the point leaves a legal connected tree, preserves downstream allocations/masteries/jewels, or defines passive-point efficiency. A legal respec package must be solved separately.',
  };
}

export function unavailablePassiveContributionAnalysis(input: {
  profileId: string;
  profileName: string;
  status: 'unavailable' | 'failed';
  message: string;
  nodeId?: number;
  generatedAt?: string;
}): BuildDoctorPassiveContributionUnavailable {
  return {
    schemaVersion: BUILD_DOCTOR_PASSIVE_CONTRIBUTION_SCHEMA_VERSION,
    status: input.status,
    profileId: input.profileId,
    profileName: input.profileName,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    nodeId: input.nodeId,
    message: input.message.replace(/\s+/g, ' ').trim().slice(0, 800) || 'Passive contribution analysis is unavailable.',
  };
}
