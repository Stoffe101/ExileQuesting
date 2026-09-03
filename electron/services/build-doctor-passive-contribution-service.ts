import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import {
  passiveContributionCandidates,
  readyPassiveContributionAnalysis,
  unavailablePassiveContributionAnalysis,
  type BuildDoctorPassiveCandidateList,
  type BuildDoctorPassiveContributionAnalysis,
} from '../../src/core/build-doctor-passive-contribution';
import type { BuildProfile } from '../../src/core/build-profiles';
import type { PassiveTreeSnapshot } from '../../src/core/passive-data';
import type { PobWorkerPerturbationSuccess, PobWorkerResponse } from '../../src/core/pob-calculation';
import { conciseBuildDoctorError, resolveBuildDoctorCalculationContext } from './build-doctor-context';
import { bundledPassiveDataPath, loadPassiveTreeSnapshot } from './game-data';
import { runPobKernelRequest } from './pob-kernel-service';
import { StateStore } from './state-store';

function perturbationResponse(response: PobWorkerResponse): PobWorkerPerturbationSuccess {
  if (!response.ok || !('comparison' in response)) throw new Error('PoB worker did not return the requested passive-node contribution comparison.');
  return response as PobWorkerPerturbationSuccess;
}

function passiveDataPath(): string {
  return bundledPassiveDataPath({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  });
}

async function verifiedPassiveSnapshot(): Promise<{ snapshot?: PassiveTreeSnapshot; message: string }> {
  const loaded = await loadPassiveTreeSnapshot(passiveDataPath());
  return { snapshot: loaded.snapshot, message: loaded.message };
}

async function findProfile(profileId: string): Promise<BuildProfile> {
  const store = new StateStore(app.getPath('userData'));
  const profile = (await store.loadBuildProfiles()).find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error('Build Doctor could not find the requested build profile.');
  return profile;
}

function unavailableCandidateList(profile: BuildProfile, message: string): BuildDoctorPassiveCandidateList {
  return {
    schemaVersion: 1,
    status: 'unavailable',
    profileId: profile.id,
    profileName: profile.name,
    message: message.replace(/\s+/g, ' ').trim().slice(0, 800) || 'Passive contribution candidates are unavailable.',
    candidates: [],
  };
}

export async function listBuildDoctorPassiveContributionCandidates(profileId: string): Promise<BuildDoctorPassiveCandidateList> {
  const profile = await findProfile(profileId);
  try {
    const passives = await verifiedPassiveSnapshot();
    if (!passives.snapshot) {
      return unavailableCandidateList(profile, `Verified bundled passive-tree data is unavailable. ${passives.message}`);
    }
    return passiveContributionCandidates(profile, passives.snapshot);
  } catch (error) {
    return unavailableCandidateList(profile, `Build Doctor could not load verified passive-tree metadata. ${conciseBuildDoctorError(error)}`);
  }
}

export async function analyzeBuildDoctorPassiveContribution(
  profileId: string,
  nodeId: number,
): Promise<BuildDoctorPassiveContributionAnalysis> {
  const context = await resolveBuildDoctorCalculationContext(profileId);
  if (!context.ok) {
    return unavailablePassiveContributionAnalysis({
      profileId: context.profileId,
      profileName: context.profileName,
      status: 'unavailable',
      message: context.message,
      nodeId,
    });
  }

  const { profile, xml, runtimeOptions } = context;
  if (!Number.isSafeInteger(nodeId) || nodeId <= 0) {
    return unavailablePassiveContributionAnalysis({
      profileId: profile.id,
      profileName: profile.name,
      status: 'failed',
      nodeId,
      message: 'Passive contribution analysis requires a positive allocated passive node id.',
    });
  }

  try {
    const passives = await verifiedPassiveSnapshot();
    if (!passives.snapshot) {
      return unavailablePassiveContributionAnalysis({
        profileId: profile.id,
        profileName: profile.name,
        status: 'unavailable',
        nodeId,
        message: `Verified bundled passive-tree data is unavailable. ${passives.message}`,
      });
    }

    const candidates = passiveContributionCandidates(profile, passives.snapshot);
    if (candidates.status !== 'ready') {
      return unavailablePassiveContributionAnalysis({
        profileId: profile.id,
        profileName: profile.name,
        status: 'unavailable',
        nodeId,
        message: candidates.message,
      });
    }
    const node = candidates.candidates.find((candidate) => candidate.nodeId === nodeId);
    if (!node) {
      return unavailablePassiveContributionAnalysis({
        profileId: profile.id,
        profileName: profile.name,
        status: 'failed',
        nodeId,
        message: 'The requested node is not an eligible allocated normal, notable, or keystone in the active verified PoB tree.',
      });
    }

    const comparison = perturbationResponse(await runPobKernelRequest({
      protocolVersion: 1,
      requestId: `doctor-passive-contribution-${nodeId}-${randomUUID()}`,
      operation: 'calculate-with-perturbations',
      xml,
      scenario: {
        scenario: 'imported',
        label: `Imported PoB state without ${node.name}`,
        notes: ['Isolated one-node deallocation sensitivity only; no legal-respec or passive-efficiency conclusion is inferred.'],
      },
      perturbations: [{ kind: 'passive-node', operation: 'deallocate', nodeId }],
    }, { ...runtimeOptions, timeoutMs: 45_000 })).comparison;

    return readyPassiveContributionAnalysis({
      profileId: profile.id,
      profileName: profile.name,
      generatedAt: new Date().toISOString(),
      node,
      comparison,
    });
  } catch (error) {
    return unavailablePassiveContributionAnalysis({
      profileId: profile.id,
      profileName: profile.name,
      status: 'failed',
      nodeId,
      message: `PoB could not measure this passive point's isolated contribution. No efficiency or respec conclusion was inferred. ${conciseBuildDoctorError(error)}`,
    });
  }
}
