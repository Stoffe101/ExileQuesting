import { ipcMain } from 'electron';
import { analyzeBuildDoctorProfile } from './build-doctor-service';

let registered = false;

export function registerBuildDoctorIpc(): void {
  if (registered) return;
  registered = true;
  ipcMain.handle('build-doctor:analyze', async (_event, profileId: unknown) => {
    if (typeof profileId !== 'string' || !profileId.trim() || profileId.length > 256) {
      throw new Error('Build Doctor requires a valid build profile id.');
    }
    return analyzeBuildDoctorProfile(profileId);
  });
}
