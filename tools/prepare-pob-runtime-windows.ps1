$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$PobCommit = 'ed354c2f8c42e148bc904c7508dbe851fb2cf952'
$LuaJitCommit = '2460b3ff93a1c955de3d62cfc825de7d68dc272e'
$PobRepository = 'https://github.com/PathOfBuildingCommunity/PathOfBuilding.git'
$LuaJitRepository = 'https://github.com/LuaJIT/LuaJIT.git'

$workspace = Join-Path $env:RUNNER_TEMP 'ExileQuestingPobRuntime'
$pobRoot = Join-Path $workspace 'PathOfBuilding'
$luaJitRoot = Join-Path $workspace 'LuaJIT'
$output = Join-Path (Get-Location) '.pob-runtime'

Remove-Item $workspace -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $workspace -Force | Out-Null

function Get-PinnedRepository([string]$Repository, [string]$Commit, [string]$Destination, [string]$Label) {
  git init $Destination | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not initialize $Label checkout." }
  git -C $Destination remote add origin $Repository
  git -C $Destination fetch --depth=1 origin $Commit
  if ($LASTEXITCODE -ne 0) { throw "Could not fetch pinned $Label commit $Commit." }
  git -C $Destination checkout --detach FETCH_HEAD | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not check out pinned $Label commit $Commit." }
  $actual = (git -C $Destination rev-parse HEAD).Trim()
  if ($actual -ne $Commit) { throw "$Label pin mismatch: expected $Commit, got $actual." }
}

Get-PinnedRepository $PobRepository $PobCommit $pobRoot 'Path of Building'
Get-PinnedRepository $LuaJitRepository $LuaJitCommit $luaJitRoot 'LuaJIT'

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path $vswhere)) { throw 'vswhere.exe was not found on the Windows runner.' }
$vs = (& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
if (-not $vs) { throw 'A Visual Studio installation with the x64 C++ toolchain was not found.' }
$vcvars = Join-Path $vs 'VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path $vcvars)) { throw "vcvars64.bat was not found at $vcvars." }

$luaJitSrc = Join-Path $luaJitRoot 'src'
$buildCommand = "call `"$vcvars`" && cd /d `"$luaJitSrc`" && msvcbuild.bat"
cmd.exe /d /s /c $buildCommand
if ($LASTEXITCODE -ne 0) { throw "Pinned LuaJIT x64 build failed with exit code $LASTEXITCODE." }

$luaJitExe = Join-Path $luaJitSrc 'luajit.exe'
$lua51Dll = Join-Path $luaJitSrc 'lua51.dll'
if (-not (Test-Path $luaJitExe) -or -not (Test-Path $lua51Dll)) { throw 'LuaJIT build did not produce luajit.exe and lua51.dll.' }

npx esbuild tools/stage-pob-runtime.ts --bundle --platform=node --format=esm --outfile=.tmp/stage-pob-runtime.mjs
if ($LASTEXITCODE -ne 0) { throw 'Could not build the PoB runtime staging tool.' }
node .tmp/stage-pob-runtime.mjs --pob-root $pobRoot --luajit-root $luaJitRoot --output $output
if ($LASTEXITCODE -ne 0) { throw 'PoB runtime staging failed.' }

npx esbuild tools/smoke-pob-runtime.ts --bundle --platform=node --format=esm --outfile=.tmp/smoke-pob-runtime.mjs
if ($LASTEXITCODE -ne 0) { throw 'Could not build the PoB runtime smoke tool.' }
node .tmp/smoke-pob-runtime.mjs $output
if ($LASTEXITCODE -ne 0) { throw 'Staged PoB runtime failed health verification.' }

Write-Host "Prepared verified PoB runtime bundle at $output"
