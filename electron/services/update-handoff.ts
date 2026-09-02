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
  return `@echo off\r\nsetlocal EnableExtensions DisableDelayedExpansion\r\nset "PARENT_PID=%~1"\r\nset "INSTALLER=%~2"\r\nset "APP_EXE=%~3"\r\nset "RESULT_FILE=%~4"\r\nset "TRACE_FILE=%~5"\r\nset "INSTALL_EXIT=-1"\r\nset "RELAUNCH_EXIT=-1"\r\nset /a "WAIT_ATTEMPTS=0"\r\ncall :trace "Updater helper started for parent PID %PARENT_PID%."\r\n\r\n:wait_parent\r\nset "FOUND_PID="\r\nfor /f "tokens=2 delims=," %%P in ('tasklist /FI "PID eq %PARENT_PID%" /FO CSV /NH 2^>NUL') do set "FOUND_PID=%%~P"\r\nif "%FOUND_PID%"=="%PARENT_PID%" (\r\n  set /a "WAIT_ATTEMPTS+=1"\r\n  if %WAIT_ATTEMPTS% GEQ 60 (\r\n    call :fail "Parent ExileQuesting process did not exit within 60 seconds."\r\n    exit /b 4\r\n  )\r\n  >NUL ping 127.0.0.1 -n 2\r\n  goto wait_parent\r\n)\r\ncall :trace "Parent ExileQuesting process is gone."\r\n\r\nif not exist "%INSTALLER%" (\r\n  call :fail "Downloaded installer no longer exists."\r\n  exit /b 2\r\n)\r\ncall :trace "Launching verified NSIS installer."\r\nstart "" /wait "%INSTALLER%" /S\r\nset "INSTALL_EXIT=%ERRORLEVEL%"\r\ncall :trace "Installer returned exit code %INSTALL_EXIT%."\r\nif not "%INSTALL_EXIT%"=="0" (\r\n  call :fail "Installer returned a non-zero exit code."\r\n  exit /b %INSTALL_EXIT%\r\n)\r\n\r\nif not exist "%APP_EXE%" (\r\n  call :fail "Installed ExileQuesting executable was not found after update."\r\n  exit /b 3\r\n)\r\ncall :trace "Relaunching ExileQuesting."\r\nstart "" "%APP_EXE%"\r\nset "RELAUNCH_EXIT=%ERRORLEVEL%"\r\ncall :trace "Relaunch command returned exit code %RELAUNCH_EXIT%."\r\nif not "%RELAUNCH_EXIT%"=="0" (\r\n  call :fail "Windows rejected the ExileQuesting relaunch command."\r\n  exit /b 5\r\n)\r\n>"%RESULT_FILE%" echo {"status":"installed","exitCode":0,"relaunched":true,"error":null}\r\ncall :trace "Update completed and relaunch command succeeded."\r\nexit /b 0\r\n\r\n:fail\r\nset "FAIL_MESSAGE=%~1"\r\ncall :trace "FAILED: %FAIL_MESSAGE%"\r\n>"%RESULT_FILE%" echo {"status":"failed","exitCode":%INSTALL_EXIT%,"relaunched":false,"error":"%FAIL_MESSAGE%"}\r\nexit /b 0\r\n\r\n:trace\r\n>>"%TRACE_FILE%" echo [%date% %time%] %~1\r\nexit /b 0\r\n`;
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
