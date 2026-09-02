import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface UpdateHandoffOptions {
  installerPath: string;
  updatesDirectory: string;
  appExecutable?: string;
  parentPid?: number;
  log?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
}

/**
 * The helper deliberately uses a file rather than a nested `cmd /c "..."` one-liner.
 * That keeps Windows quoting predictable and lets us retain a stage trace if installation fails.
 * It is always started with windowsHide=true, so no console window is shown to the user.
 */
export function windowsUpdateLauncherScript(): string {
  return `@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "PARENT_PID=%~1"
set "INSTALLER=%~2"
set "APP_EXE=%~3"
set "RESULT_FILE=%~4"
set "TRACE_FILE=%~5"
set "INSTALL_EXIT=-1"
call :trace "Updater helper started."

:wait_parent
tasklist /FI "PID eq %PARENT_PID%" /NH 2>NUL | find "%PARENT_PID%" >NUL
if not errorlevel 1 (
  >NUL ping 127.0.0.1 -n 2
  goto wait_parent
)
call :trace "Parent ExileQuesting process is gone."

if not exist "%INSTALLER%" (
  call :fail "Downloaded installer no longer exists."
  exit /b 2
)
call :trace "Launching verified NSIS installer."
start "" /wait "%INSTALLER%" /S
set "INSTALL_EXIT=%ERRORLEVEL%"
call :trace "Installer returned exit code %INSTALL_EXIT%."
if not "%INSTALL_EXIT%"=="0" (
  call :fail "Installer returned a non-zero exit code."
  exit /b %INSTALL_EXIT%
)

if not exist "%APP_EXE%" (
  call :fail "Installed ExileQuesting executable was not found after update."
  exit /b 3
)
call :trace "Relaunching ExileQuesting."
start "" "%APP_EXE%"
>"%RESULT_FILE%" echo {"status":"installed","exitCode":0,"relaunched":true,"error":null}
call :trace "Update completed and relaunch was requested."
exit /b 0

:fail
set "FAIL_MESSAGE=%~1"
call :trace "FAILED: %FAIL_MESSAGE%"
>"%RESULT_FILE%" echo {"status":"failed","exitCode":%INSTALL_EXIT%,"relaunched":false,"error":"%FAIL_MESSAGE%"}
exit /b 0

:trace
>>"%TRACE_FILE%" echo [%date% %time%] %~1
exit /b 0
`;
}

export async function scheduleWindowsUpdate(options: UpdateHandoffOptions): Promise<void> {
  await fs.access(options.installerPath);
  await fs.mkdir(options.updatesDirectory, { recursive: true });
  const launcherPath = path.join(options.updatesDirectory, 'apply-update.cmd');
  const resultPath = path.join(options.updatesDirectory, 'last-update-result.json');
  const tracePath = path.join(options.updatesDirectory, 'last-update-trace.log');
  await Promise.all([
    fs.rm(resultPath, { force: true }),
    fs.rm(tracePath, { force: true }),
  ]);
  await fs.writeFile(launcherPath, windowsUpdateLauncherScript(), 'utf8');

  const commandProcessor = process.env.ComSpec || 'cmd.exe';
  const child = spawn(commandProcessor, [
    '/d', '/s', '/c', 'call', launcherPath,
    String(options.parentPid ?? process.pid),
    options.installerPath,
    options.appExecutable ?? process.execPath,
    resultPath,
    tracePath,
  ], {
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  });

  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
  options.log?.info('Scheduled verified hidden NSIS update handoff.', {
    installerPath: options.installerPath,
    launcherPath,
    resultPath,
    tracePath,
  });
}
