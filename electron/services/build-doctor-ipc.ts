import { ipcMain } from 'electron';
import { analyzeBuildDoctorConfigurationDependencies } from './build-doctor-dependency-service';
import { analyzeBuildDoctorProfile } from './build-doctor-service';

let registered = false;

function validatedProfileId(profileId: unknown): string {
  if (typeof profileId !== 'string' || !profileId.trim() || profileId.length > 256) {
    throw new Error('Build Doctor requires a valid build profile id.');
  }
  return profileId;
}

export function registerBuildDoctorIpc(): void {
  if (registered) return;
  registered = true;
  ipcMain.handle('build-doctor:analyze', async (_event, profileId: unknown) => analyzeBuildDoctorProfile(validatedProfileId(profileId)));
  ipcMain.handle('build-doctor:dependencies', async (_event, profileId: unknown) => analyzeBuildDoctorConfigurationDependencies(validatedProfileId(profileId)));
}
