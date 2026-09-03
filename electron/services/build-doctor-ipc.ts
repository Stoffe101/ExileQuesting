import { ipcMain } from 'electron';
import { analyzeBuildDoctorCandidateItem } from './build-doctor-candidate-item-service';
import { analyzeBuildDoctorConfigurationDependencies } from './build-doctor-dependency-service';
import {
  analyzeBuildDoctorPassiveContribution,
  listBuildDoctorPassiveContributionCandidates,
} from './build-doctor-passive-contribution-service';
import { analyzeBuildDoctorProfile } from './build-doctor-service';

let registered = false;

function validatedProfileId(profileId: unknown): string {
  if (typeof profileId !== 'string' || !profileId.trim() || profileId.length > 256) {
    throw new Error('Build Doctor requires a valid build profile id.');
  }
  return profileId;
}

function validatedNodeId(nodeId: unknown): number {
  if (!Number.isSafeInteger(nodeId) || Number(nodeId) <= 0) {
    throw new Error('Build Doctor passive contribution requires a positive passive node id.');
  }
  return Number(nodeId);
}

export function registerBuildDoctorIpc(): void {
  if (registered) return;
  registered = true;
  ipcMain.handle('build-doctor:analyze', async (_event, profileId: unknown) => analyzeBuildDoctorProfile(validatedProfileId(profileId)));
  ipcMain.handle('build-doctor:dependencies', async (_event, profileId: unknown) => analyzeBuildDoctorConfigurationDependencies(validatedProfileId(profileId)));
  ipcMain.handle('build-doctor:candidate-item', async (_event, profileId: unknown, slot: unknown, itemText: unknown) => {
    if (typeof slot !== 'string' || typeof itemText !== 'string') throw new Error('Build Doctor candidate item comparison requires a slot and copied item text.');
    return analyzeBuildDoctorCandidateItem(validatedProfileId(profileId), slot, itemText);
  });
  ipcMain.handle('build-doctor:passive-candidates', async (_event, profileId: unknown) => listBuildDoctorPassiveContributionCandidates(validatedProfileId(profileId)));
  ipcMain.handle('build-doctor:passive-contribution', async (_event, profileId: unknown, nodeId: unknown) => analyzeBuildDoctorPassiveContribution(validatedProfileId(profileId), validatedNodeId(nodeId)));
}
