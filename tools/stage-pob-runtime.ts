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
  type PobKernelBundleManifest,
} from '../electron/services/pob-runtime';

interface Arguments {
  pobRoot: string;
  luaJitRoot: string;
  output: string;
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseArguments(): Arguments {
  const pobRoot = argumentValue('--pob-root');
  const luaJitRoot = argumentValue('--luajit-root');
  const output = argumentValue('--output') ?? '.pob-runtime';
  if (!pobRoot || !luaJitRoot) {
    throw new Error('Usage: stage-pob-runtime --pob-root <pinned PoB checkout> --luajit-root <pinned built LuaJIT checkout> [--output .pob-runtime]');
  }
  return { pobRoot: path.resolve(pobRoot), luaJitRoot: path.resolve(luaJitRoot), output: path.resolve(output) };
}

function gitHead(root: string): string {
  return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
}

async function requireFile(filePath: string, label: string): Promise<void> {
  const item = await stat(filePath).catch(() => null);
  if (!item?.isFile()) throw new Error(`${label} is missing: ${filePath}`);
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function filesRecursively(root: string, relative = ''): Promise<string[]> {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.posix.join(relative.replaceAll('\\', '/'), entry.name);
    if (entry.isDirectory()) files.push(...await filesRecursively(root, child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

async function bundleStats(root: string): Promise<{ fileCount: number; totalBytes: number; treeSha256: string }> {
  const files = (await filesRecursively(root)).filter((file) => file !== 'manifest.json').sort();
  const tree = createHash('sha256');
  let totalBytes = 0;
  for (const relative of files) {
    const buffer = await readFile(path.join(root, ...relative.split('/')));
    totalBytes += buffer.length;
    tree.update(relative, 'utf8');
    tree.update('\0');
    tree.update(String(buffer.length), 'utf8');
    tree.update('\0');
    tree.update(sha256(buffer), 'utf8');
    tree.update('\n');
  }
  return { fileCount: files.length, totalBytes, treeSha256: tree.digest('hex') };
}

async function criticalFileMetadata(root: string): Promise<PobKernelBundleManifest['criticalFiles']> {
  const result = {} as PobKernelBundleManifest['criticalFiles'];
  for (const [key, relative] of Object.entries(POB_KERNEL_CRITICAL_FILES) as Array<[keyof typeof POB_KERNEL_CRITICAL_FILES, string]>) {
    const buffer = await readFile(path.join(root, ...relative.split('/')));
    result[key] = { path: relative, size: buffer.length, sha256: sha256(buffer) };
  }
  return result;
}

function adapterVersion(workerText: string, label: string): string {
  const version = workerText.match(/ADAPTER_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
  if (!version) throw new Error(`Could not determine the staged ${label} adapter version.`);
  return version;
}

async function main(): Promise<void> {
  const args = parseArguments();
  const actualPobCommit = gitHead(args.pobRoot);
  const actualLuaJitCommit = gitHead(args.luaJitRoot);
  if (actualPobCommit !== POB_KERNEL_COMMIT) throw new Error(`PoB pin mismatch: expected ${POB_KERNEL_COMMIT}, got ${actualPobCommit}.`);
  if (actualLuaJitCommit !== POB_KERNEL_LUAJIT_COMMIT) throw new Error(`LuaJIT pin mismatch: expected ${POB_KERNEL_LUAJIT_COMMIT}, got ${actualLuaJitCommit}.`);

  const luaJitExe = path.join(args.luaJitRoot, 'src', 'luajit.exe');
  const lua51Dll = path.join(args.luaJitRoot, 'src', 'lua51.dll');
  const worker = path.resolve('tools', 'pob-kernel', 'worker.lua');
  const constraintWorker = path.resolve('tools', 'pob-kernel', 'constraint-worker.lua');
  const pobLicense = path.join(args.pobRoot, 'LICENSE.md');
  const luaJitLicense = path.join(args.luaJitRoot, 'COPYRIGHT');
  for (const [file, label] of [
    [luaJitExe, 'Built LuaJIT executable'],
    [lua51Dll, 'Built LuaJIT lua51.dll'],
    [worker, 'ExileQuesting PoB worker'],
    [constraintWorker, 'ExileQuesting PoB constraint worker'],
    [pobLicense, 'Path of Building license'],
    [luaJitLicense, 'LuaJIT license'],
  ] as const) await requireFile(file, label);

  await rm(args.output, { recursive: true, force: true });
  await mkdir(path.join(args.output, 'pob'), { recursive: true });
  await mkdir(path.join(args.output, 'licenses'), { recursive: true });
  await cp(path.join(args.pobRoot, 'src'), path.join(args.output, 'pob', 'src'), { recursive: true, force: true });
  await cp(path.join(args.pobRoot, 'runtime'), path.join(args.output, 'pob', 'runtime'), { recursive: true, force: true });
  await cp(luaJitExe, path.join(args.output, 'pob', 'runtime', 'luajit.exe'), { force: true });
  await cp(lua51Dll, path.join(args.output, 'pob', 'runtime', 'lua51.dll'), { force: true });
  await cp(worker, path.join(args.output, 'worker.lua'), { force: true });
  await cp(constraintWorker, path.join(args.output, 'constraint-worker.lua'), { force: true });
  await cp(pobLicense, path.join(args.output, 'licenses', 'PathOfBuilding-LICENSE.md'), { force: true });
  await cp(luaJitLicense, path.join(args.output, 'licenses', 'LuaJIT-COPYRIGHT'), { force: true });

  for (const [key, relative] of Object.entries(POB_KERNEL_CRITICAL_FILES)) {
    await requireFile(path.join(args.output, ...relative.split('/')), `Staged critical file ${key}`);
  }

  const workerText = await readFile(path.join(args.output, 'worker.lua'), 'utf8');
  const constraintWorkerText = await readFile(path.join(args.output, 'constraint-worker.lua'), 'utf8');
  const workerAdapterVersion = adapterVersion(workerText, 'PoB worker');
  const constraintAdapterVersion = adapterVersion(constraintWorkerText, 'PoB constraint worker');

  const aggregate = await bundleStats(args.output);
  const manifest: PobKernelBundleManifest = {
    schemaVersion: POB_KERNEL_BUNDLE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    pobRepository: POB_KERNEL_REPOSITORY,
    pobCommit: actualPobCommit,
    luaJitRepository: POB_KERNEL_LUAJIT_REPOSITORY,
    luaJitCommit: actualLuaJitCommit,
    workerAdapterVersion,
    constraintAdapterVersion,
    ...aggregate,
    criticalFiles: await criticalFileMetadata(args.output),
  };
  await writeFile(path.join(args.output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`Staged pinned PoB kernel ${actualPobCommit.slice(0, 12)} / LuaJIT ${actualLuaJitCommit.slice(0, 12)}.`);
  console.log(`Bundle: ${manifest.fileCount} files, ${manifest.totalBytes} bytes, tree SHA-256 ${manifest.treeSha256}.`);
  console.log(`Worker adapters: calculation=${manifest.workerAdapterVersion}, constraints=${manifest.constraintAdapterVersion}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
