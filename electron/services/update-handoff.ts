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

export function windowsUpdateLauncherScript(): string {
  return `param(
  [Parameter(Mandatory=$true)][int]$ParentPid,
  [Parameter(Mandatory=$true)][string]$Installer,
  [Parameter(Mandatory=$true)][string]$AppExe,
  [Parameter(Mandatory=$true)][string]$ResultFile,
  [Parameter(Mandatory=$true)][string]$TraceFile
)
$ErrorActionPreference = 'Stop'
function Write-Trace([string]$Message) {
  "$(Get-Date -Format o) $Message" | Add-Content -LiteralPath $TraceFile -Encoding UTF8
}
$result = [ordered]@{
  status = 'starting'
  installer = $Installer
  appExe = $AppExe
  exitCode = $null
  relaunched = $false
  error = $null
  completedAt = $null
}
try {
  Write-Trace "Waiting for ExileQuesting process $ParentPid to exit."
  try { Wait-Process -Id $ParentPid -ErrorAction Stop } catch { Write-Trace 'Parent process is already gone.' }
  Start-Sleep -Milliseconds 750
  if (-not (Test-Path -LiteralPath $Installer)) { throw "Downloaded installer no longer exists: $Installer" }
  $installDir = Split-Path -Parent $AppExe
  Write-Trace "Launching verified installer into $installDir."
  # NSIS requires /D to be the final argument and treats the remainder of the command line as the path,
  # which allows install directories containing spaces without quoting the /D value.
  $installArgs = "/S /D=$installDir"
  $install = Start-Process -FilePath $Installer -ArgumentList $installArgs -Wait -PassThru -WindowStyle Hidden
  $result.exitCode = $install.ExitCode
  Write-Trace "Installer exited with code $($install.ExitCode)."
  if ($install.ExitCode -ne 0) { throw "Installer exited with code $($install.ExitCode)." }
  $result.status = 'installed'
  Start-Sleep -Milliseconds 500
  if (-not (Test-Path -LiteralPath $AppExe)) { throw "Installed application executable was not found after update: $AppExe" }
  Write-Trace 'Relaunching ExileQuesting.'
  Start-Process -FilePath $AppExe -WorkingDirectory (Split-Path -Parent $AppExe) | Out-Null
  $result.relaunched = $true
  Write-Trace 'Relaunch request completed.'
} catch {
  $result.status = 'failed'
  $result.error = $_.Exception.Message
  Write-Trace "FAILED: $($_.Exception.Message)"
} finally {
  $result.completedAt = (Get-Date).ToString('o')
  $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ResultFile -Encoding UTF8
  Write-Trace "Result written with status $($result.status)."
}
`;
}

export async function scheduleWindowsUpdate(options: UpdateHandoffOptions): Promise<void> {
  await fs.access(options.installerPath);
  await fs.mkdir(options.updatesDirectory, { recursive: true });
  const launcherPath = path.join(options.updatesDirectory, 'apply-update.ps1');
  const resultPath = path.join(options.updatesDirectory, 'last-update-result.json');
  const tracePath = path.join(options.updatesDirectory, 'last-update-trace.log');
  await Promise.all([
    fs.rm(resultPath, { force: true }),
    fs.rm(tracePath, { force: true }),
  ]);
  await fs.writeFile(launcherPath, windowsUpdateLauncherScript(), 'utf8');

  const child = spawn('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
    '-File', launcherPath,
    '-ParentPid', String(options.parentPid ?? process.pid),
    '-Installer', options.installerPath,
    '-AppExe', options.appExecutable ?? process.execPath,
    '-ResultFile', resultPath,
    '-TraceFile', tracePath,
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
  options.log?.info('Scheduled verified NSIS update handoff.', { installerPath: options.installerPath, launcherPath, resultPath, tracePath });
}
