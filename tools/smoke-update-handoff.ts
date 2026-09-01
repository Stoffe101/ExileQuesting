import path from 'node:path';
import { scheduleWindowsUpdate } from '../electron/services/update-handoff';

const [installerPath, updatesDirectory, appExecutable] = process.argv.slice(2);
if (!installerPath || !updatesDirectory || !appExecutable) {
  throw new Error('Usage: smoke-update-handoff <installer> <updates-directory> <installed-executable>');
}

await scheduleWindowsUpdate({
  installerPath: path.resolve(installerPath),
  updatesDirectory: path.resolve(updatesDirectory),
  appExecutable: path.resolve(appExecutable),
  // The integration smoke deliberately uses a nonexistent parent so the helper
  // immediately exercises install + relaunch instead of waiting for this Node process.
  parentPid: 2_000_000_000,
});

console.log(`Updater handoff spawned for ${installerPath}`);
