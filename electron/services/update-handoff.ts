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
  [Parameter(Mandatory=$true)][string]$ResultFile
)
$ErrorActionPreference = 'Stop'
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
  try { Wait-Process -Id $ParentPid -ErrorAction Stop } catch { }
  Start-Sleep -Milliseconds 750
  if (-not (Test-Path -LiteralPath $Installer)) { throw "Downloaded installer no longer exists: $Installer" }
  $install = Start-Process -FilePath $Installer -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
  $result.exitCode = $install.ExitCode
  if ($install.ExitCode -ne 0) { throw "Installer exited with code $($install.ExitCode)." }
  $result.status = 'installed'
  Start-Sleep -Milliseconds 500
  if (-not (Test-Path -LiteralPath $AppExe)) { throw "Installed application executable was not found after update: $AppExe" }
  Start-Process -FilePath $AppExe -WorkingDirectory (Split-Path -Parent $AppExe) | Out-Null
  $result.relaunched = $true
} catch {
  $result.status = 'failed'
  $result.error = $_.Exception.Message
} finally {
  $result.completedAt = (Get-Date).ToString('o')
  $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ResultFile -Encoding UTF8
}
`;
}

export async function scheduleWindowsUpdate(options: UpdateHandoffOptions): Promise<void> {
  await fs.access(options.installerPath);
  await fs.mkdir(options.updatesDirectory, { recursive: true });
  const launcherPath = path.join(options.updatesDirectory, 'apply-update.ps1');
  const resultPath = path.join(options.updatesDirectory, 'last-update-result.json');
  await fs.writeFile(launcherPath, windowsUpdateLauncherScript(), 'utf8');

  const child = spawn('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden',
    '-File', launcherPath,
    '-ParentPid', String(options.parentPid ?? process.pid),
    '-Installer', options.installerPath,
    '-AppExe', options.appExecutable ?? process.execPath,
    '-ResultFile', resultPath,
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
  options.log?.info('Scheduled verified NSIS update handoff.', { installerPath: options.installerPath, launcherPath, resultPath });
}
