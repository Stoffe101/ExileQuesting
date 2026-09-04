import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  POB_KERNEL_BUNDLE_SCHEMA_VERSION,
  POB_KERNEL_COMMIT,
  POB_KERNEL_CRITICAL_FILES,
  POB_KERNEL_LUAJIT_COMMIT,
  POB_KERNEL_LUAJIT_REPOSITORY,
  POB_KERNEL_REPOSITORY,
  POB_KERNEL_SUPPORTED_TREE_VERSIONS,
  type PobKernelBundleManifest,
} from '../electron/services/pob-runtime';

interface Arguments { pobRoot: string; luaJitRoot: string; output: string; }
const MAX_HEADLESS_BUNDLE_BYTES = 240 * 1024 * 1024;
const HEAVY_ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.svg', '.ttf', '.otf']);
const REQUIRED_TREE_SUPPORT_FILES = new Set(['TreeData/3_19/Assets.lua']);

function argumentValue(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function parseArguments(): Arguments {
  const pobRoot = argumentValue('--pob-root'); const luaJitRoot = argumentValue('--luajit-root'); const output = argumentValue('--output') ?? '.pob-runtime';
  if (!pobRoot || !luaJitRoot) throw new Error('Usage: stage-pob-runtime --pob-root <pinned PoB checkout> --luajit-root <pinned built LuaJIT checkout> [--output .pob-runtime]');
  return { pobRoot: path.resolve(pobRoot), luaJitRoot: path.resolve(luaJitRoot), output: path.resolve(output) };
}
function gitHead(root: string): string { return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(); }
async function requireFile(filePath: string, label: string): Promise<void> { const item = await stat(filePath).catch(() => null); if (!item?.isFile()) throw new Error(`${label} is missing: ${filePath}`); }
function sha256(buffer: Buffer): string { return createHash('sha256').update(buffer).digest('hex'); }
async function filesRecursively(root: string, relative = ''): Promise<string[]> {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true }); const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) { const child = path.posix.join(relative.replaceAll('\\', '/'), entry.name); if (entry.isDirectory()) files.push(...await filesRecursively(root, child)); else if (entry.isFile()) files.push(child); }
  return files;
}
async function bundleStats(root: string): Promise<{ fileCount: number; totalBytes: number; treeSha256: string }> {
  const files = (await filesRecursively(root)).filter((file) => file !== 'manifest.json').sort(); const tree = createHash('sha256'); let totalBytes = 0;
  for (const relative of files) { const buffer = await readFile(path.join(root, ...relative.split('/'))); totalBytes += buffer.length; tree.update(relative, 'utf8'); tree.update('\0'); tree.update(String(buffer.length), 'utf8'); tree.update('\0'); tree.update(sha256(buffer), 'utf8'); tree.update('\n'); }
  return { fileCount: files.length, totalBytes, treeSha256: tree.digest('hex') };
}
async function criticalFileMetadata(root: string): Promise<PobKernelBundleManifest['criticalFiles']> {
  const result = {} as PobKernelBundleManifest['criticalFiles'];
  for (const [key, relative] of Object.entries(POB_KERNEL_CRITICAL_FILES) as Array<[keyof typeof POB_KERNEL_CRITICAL_FILES, string]>) { const buffer = await readFile(path.join(root, ...relative.split('/'))); result[key] = { path: relative, size: buffer.length, sha256: sha256(buffer) }; }
  return result;
}
function adapterVersion(workerText: string, label: string): string { const version = workerText.match(/ADAPTER_VERSION\s*=\s*["']([^"']+)["']/)?.[1]; if (!version) throw new Error(`Could not determine the staged ${label} adapter version.`); return version; }
async function copyHeadlessSource(source: string, destination: string): Promise<void> {
  await cp(source, destination, { recursive: true, force: true, filter: (candidate) => {
    const relative = path.relative(source, candidate).replaceAll('\\', '/');
    if (!relative) return true;
    if (relative === 'Assets' || relative.startsWith('Assets/')) return false;
    if (relative === 'TreeData') return true;
    if (relative.startsWith('TreeData/')) {
      if (relative === 'TreeData/3_29' || relative.startsWith('TreeData/3_29/')) return !HEAVY_ASSET_EXTENSIONS.has(path.extname(candidate).toLowerCase());
      if (relative === 'TreeData/legion' || relative.startsWith('TreeData/legion/')) return !HEAVY_ASSET_EXTENSIONS.has(path.extname(candidate).toLowerCase());
      if (relative === 'TreeData/3_19') return true;
      return REQUIRED_TREE_SUPPORT_FILES.has(relative);
    }
    return !HEAVY_ASSET_EXTENSIONS.has(path.extname(candidate).toLowerCase());
  } });
}
async function copyIfPresent(source: string, destination: string): Promise<void> { if ((await stat(source).catch(() => null))?.isFile()) await cp(source, destination, { force: true }); }

async function main(): Promise<void> {
  const args = parseArguments(); const actualPobCommit = gitHead(args.pobRoot); const actualLuaJitCommit = gitHead(args.luaJitRoot);
  if (actualPobCommit !== POB_KERNEL_COMMIT) throw new Error(`PoB pin mismatch: expected ${POB_KERNEL_COMMIT}, got ${actualPobCommit}.`);
  if (actualLuaJitCommit !== POB_KERNEL_LUAJIT_COMMIT) throw new Error(`LuaJIT pin mismatch: expected ${POB_KERNEL_LUAJIT_COMMIT}, got ${actualLuaJitCommit}.`);
  const luaJitExe = path.join(args.luaJitRoot, 'src', 'luajit.exe'); const lua51Dll = path.join(args.luaJitRoot, 'src', 'lua51.dll');
  const worker = path.resolve('tools', 'pob-kernel', 'worker.lua'); const constraintWorker = path.resolve('tools', 'pob-kernel', 'constraint-worker.lua');
  const pobLicense = path.join(args.pobRoot, 'LICENSE.md'); const luaJitLicense = path.join(args.luaJitRoot, 'COPYRIGHT');
  for (const [file, label] of [[luaJitExe, 'Built LuaJIT executable'], [lua51Dll, 'Built LuaJIT lua51.dll'], [worker, 'ExileQuesting PoB worker'], [constraintWorker, 'ExileQuesting PoB constraint worker'], [pobLicense, 'Path of Building license'], [luaJitLicense, 'LuaJIT license']] as const) await requireFile(file, label);

  await rm(args.output, { recursive: true, force: true });
  const pobDest = path.join(args.output, 'pob'); const runtimeDest = path.join(pobDest, 'runtime');
  await mkdir(runtimeDest, { recursive: true }); await mkdir(path.join(args.output, 'licenses'), { recursive: true }); await mkdir(path.join(args.output, 'smoke'), { recursive: true });
  await copyHeadlessSource(path.join(args.pobRoot, 'src'), path.join(pobDest, 'src'));
  await cp(path.join(args.pobRoot, 'runtime', 'lua'), path.join(runtimeDest, 'lua'), { recursive: true, force: true });
  for (const runtimeFile of ['lua-utf8.dll', 'lzip.dll', 'zlib1.dll', 'zstd.dll']) await copyIfPresent(path.join(args.pobRoot, 'runtime', runtimeFile), path.join(runtimeDest, runtimeFile));
  await cp(luaJitExe, path.join(runtimeDest, 'luajit.exe'), { force: true }); await cp(lua51Dll, path.join(runtimeDest, 'lua51.dll'), { force: true });
  await cp(worker, path.join(args.output, 'worker.lua'), { force: true }); await cp(constraintWorker, path.join(args.output, 'constraint-worker.lua'), { force: true });
  await cp(pobLicense, path.join(args.output, 'licenses', 'PathOfBuilding-LICENSE.md'), { force: true }); await cp(luaJitLicense, path.join(args.output, 'licenses', 'LuaJIT-COPYRIGHT'), { force: true });
  const legacySmoke = await readFile(path.join(args.pobRoot, 'spec', 'TestBuilds', '3.13', 'OccVortex.xml'), 'utf8');
  const currentSmoke = legacySmoke
    .replace('ascendClassName=\"Occultist\"', 'ascendClassName=\"None\"')
    .replace(/<Tree activeSpec=\"1\">[\s\S]*?<\/Tree>/, '<Tree activeSpec=\"1\">\n\t\t<Spec title=\"ExileQuesting 3.29 smoke\" treeVersion=\"3_29\" classId=\"3\" ascendClassId=\"0\" secondaryAscendClassId=\"0\" nodes=\"\" masteryEffects=\"\"/>\n\t</Tree>');
  if (currentSmoke === legacySmoke || !currentSmoke.includes('treeVersion=\"3_29\"')) throw new Error('Could not materialize the current-tree PoB smoke fixture.');
  await writeFile(path.join(args.output, 'smoke', 'OccVortex.xml'), currentSmoke, 'utf8');

  for (const [key, relative] of Object.entries(POB_KERNEL_CRITICAL_FILES)) await requireFile(path.join(args.output, ...relative.split('/')), `Staged critical file ${key}`);
  const workerText = await readFile(path.join(args.output, 'worker.lua'), 'utf8'); const constraintWorkerText = await readFile(path.join(args.output, 'constraint-worker.lua'), 'utf8');
  const aggregate = await bundleStats(args.output);
  if (aggregate.totalBytes > MAX_HEADLESS_BUNDLE_BYTES) throw new Error(`Headless PoB bundle grew to ${aggregate.totalBytes} bytes, above the ${MAX_HEADLESS_BUNDLE_BYTES}-byte release budget.`);
  const manifest: PobKernelBundleManifest = { schemaVersion: POB_KERNEL_BUNDLE_SCHEMA_VERSION, generatedAt: new Date().toISOString(), pobRepository: POB_KERNEL_REPOSITORY, pobCommit: actualPobCommit, luaJitRepository: POB_KERNEL_LUAJIT_REPOSITORY, luaJitCommit: actualLuaJitCommit, workerAdapterVersion: adapterVersion(workerText, 'PoB worker'), constraintAdapterVersion: adapterVersion(constraintWorkerText, 'PoB constraint worker'), supportedTreeVersions: [...POB_KERNEL_SUPPORTED_TREE_VERSIONS], ...aggregate, criticalFiles: await criticalFileMetadata(args.output) };
  await writeFile(path.join(args.output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Staged HEADLESS pinned PoB kernel ${actualPobCommit.slice(0, 12)} / LuaJIT ${actualLuaJitCommit.slice(0, 12)}.`);
  console.log(`Bundle: ${manifest.fileCount} files, ${manifest.totalBytes} bytes, tree SHA-256 ${manifest.treeSha256}.`);
  console.log(`Supported passive-tree versions: ${POB_KERNEL_SUPPORTED_TREE_VERSIONS.join(', ')}.`);
  console.log(`Removed historical passive trees and PoB GUI imagery/runtime; bundle budget ${MAX_HEADLESS_BUNDLE_BYTES} bytes.`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
