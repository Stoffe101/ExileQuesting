import path from 'node:path';
import { scheduleWindowsUpdate } from '../electron/services/update-handoff';

async function main(): Promise<void> {
  const [installerPath, updatesDirectory, appExecutable] = process.argv.slice(2);
  if (!installerPath || !updatesDirectory || !appExecutable) {
    throw new Error('Usage: smoke-update-handoff <installer> <updates-directory> <installed-executable>');
  }

  await scheduleWindowsUpdate({
    installerPath: path.resolve(installerPath),
    updatesDirectory: path.resolve(updatesDirectory),
    appExecutable: path.resolve(appExecutable),
    // Do not fake this. The detached helper must observe this real harness process
    // disappear before it installs, matching the installed application's handoff.
    parentPid: process.pid,
  });

  console.log(`Updater handoff spawned for ${installerPath}; parent PID ${process.pid} will now exit.`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
