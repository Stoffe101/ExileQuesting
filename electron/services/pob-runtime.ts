import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PobKernelRuntimeOptions } from './pob-kernel-service';

export const POB_KERNEL_BUNDLE_SCHEMA_VERSION = 1;
export const POB_KERNEL_REPOSITORY = 'PathOfBuildingCommunity/PathOfBuilding';
export const POB_KERNEL_COMMIT = 'ed354c2f8c42e148bc904c7508dbe851fb2cf952';
export const POB_KERNEL_LUAJIT_REPOSITORY = 'LuaJIT/LuaJIT';
export const POB_KERNEL_LUAJIT_COMMIT = '2460b3ff93a1c955de3d62cfc825de7d68dc272e';

export const POB_KERNEL_CRITICAL_FILES = {
  runtimeExecutable: 'pob/runtime/luajit.exe',
  luaLibrary: 'pob/runtime/lua51.dll',
  utf8Module: 'pob/runtime/lua-utf8.dll',
  headlessWrapper: 'pob/src/HeadlessWrapper.lua',
  worker: 'worker.lua',
  pobLicense: 'licenses/PathOfBuilding-LICENSE.md',
  luaJitLicense: 'licenses/LuaJIT-COPYRIGHT',
} as const;

export interface PobKernelBundleManifest {
  schemaVersion: number;
  generatedAt: string;
  pobRepository: string;
  pobCommit: string;
  luaJitRepository: string;
  luaJitCommit: string;
  workerAdapterVersion: string;
  fileCount: number;
  totalBytes: number;
  treeSha256: string;
  criticalFiles: Record<keyof typeof POB_KERNEL_CRITICAL_FILES, { path: string; size: number; sha256: string }>;
}

export interface PobKernelBundlePaths {
  root: string;
  manifestPath: string;
  runtimePath: string;
  pobSourcePath: string;
  pobRuntimePath: string;
  workerScriptPath: string;
}

export interface ValidatedPobKernelBundle {
  paths: PobKernelBundlePaths;
  manifest: PobKernelBundleManifest;
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function validSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function safeCriticalEntry(value: unknown, expectedPath: string): value is { path: string; size: number; sha256: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return entry.path === expectedPath
    && Number.isSafeInteger(entry.size)
    && Number(entry.size) >= 0
    && validSha256(entry.sha256);
}

async function filesRecursively(root: string, relative = ''): Promise<string[]> {
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) throw new Error(`PoB kernel bundle contains unsupported symbolic link ${path.posix.join(relative.replaceAll('\\', '/'), entry.name)}.`);
    const child = path.posix.join(relative.replaceAll('\\', '/'), entry.name);
    if (entry.isDirectory()) files.push(...await filesRecursively(root, child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

async function verifiedTree(root: string): Promise<{ fileCount: number; totalBytes: number; treeSha256: string }> {
  const files = (await filesRecursively(root)).filter((file) => file !== 'manifest.json').sort();
  const tree = createHash('sha256');
  let totalBytes = 0;
  for (const relative of files) {
    const buffer = await fs.readFile(path.join(root, ...relative.split('/')));
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

export function pobKernelBundleRoot(input: {
  packaged: boolean;
  resourcesPath: string;
  appPath: string;
  overrideRoot?: string;
}): string {
  if (input.overrideRoot?.trim()) return path.resolve(input.overrideRoot);
  return input.packaged
    ? path.join(input.resourcesPath, 'pob-kernel')
    : path.join(input.appPath, '.pob-runtime');
}

export function pobKernelBundlePaths(root: string): PobKernelBundlePaths {
  const resolvedRoot = path.resolve(root);
  return {
    root: resolvedRoot,
    manifestPath: path.join(resolvedRoot, 'manifest.json'),
    runtimePath: path.join(resolvedRoot, 'pob', 'runtime', 'luajit.exe'),
    pobSourcePath: path.join(resolvedRoot, 'pob', 'src'),
    pobRuntimePath: path.join(resolvedRoot, 'pob', 'runtime'),
    workerScriptPath: path.join(resolvedRoot, 'worker.lua'),
  };
}

export async function validatePobKernelBundle(root: string): Promise<ValidatedPobKernelBundle> {
  const paths = pobKernelBundlePaths(root);
  const raw = await fs.readFile(paths.manifestPath, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > 512 * 1024) throw new Error('PoB kernel bundle manifest exceeds the 512 KiB safety bound.');
  const manifest = JSON.parse(raw) as PobKernelBundleManifest;

  if (manifest.schemaVersion !== POB_KERNEL_BUNDLE_SCHEMA_VERSION) throw new Error(`PoB kernel bundle schema ${manifest.schemaVersion} is unsupported.`);
  if (manifest.pobRepository !== POB_KERNEL_REPOSITORY || manifest.pobCommit !== POB_KERNEL_COMMIT) throw new Error('PoB kernel bundle source pin does not match the reviewed ExileQuesting pin.');
  if (manifest.luaJitRepository !== POB_KERNEL_LUAJIT_REPOSITORY || manifest.luaJitCommit !== POB_KERNEL_LUAJIT_COMMIT) throw new Error('PoB kernel bundle LuaJIT pin does not match the reviewed ExileQuesting pin.');
  if (!manifest.workerAdapterVersion?.trim() || manifest.workerAdapterVersion.length > 32) throw new Error('PoB kernel bundle worker adapter version is missing or invalid.');
  if (!Number.isSafeInteger(manifest.fileCount) || manifest.fileCount < 1 || !Number.isSafeInteger(manifest.totalBytes) || manifest.totalBytes < 1 || !validSha256(manifest.treeSha256)) {
    throw new Error('PoB kernel bundle aggregate provenance is invalid.');
  }

  for (const [key, expectedRelativePath] of Object.entries(POB_KERNEL_CRITICAL_FILES) as Array<[keyof typeof POB_KERNEL_CRITICAL_FILES, string]>) {
    const entry = manifest.criticalFiles?.[key];
    if (!safeCriticalEntry(entry, expectedRelativePath)) throw new Error(`PoB kernel bundle manifest has invalid critical-file metadata for ${key}.`);
    const absolute = path.join(paths.root, ...expectedRelativePath.split('/'));
    const buffer = await fs.readFile(absolute);
    if (buffer.length !== entry.size) throw new Error(`PoB kernel critical file ${expectedRelativePath} has the wrong size.`);
    if (sha256(buffer) !== entry.sha256.toLowerCase()) throw new Error(`PoB kernel critical file ${expectedRelativePath} failed SHA-256 verification.`);
  }

  const tree = await verifiedTree(paths.root);
  if (tree.fileCount !== manifest.fileCount) throw new Error(`PoB kernel bundle file count mismatch: expected ${manifest.fileCount}, got ${tree.fileCount}.`);
  if (tree.totalBytes !== manifest.totalBytes) throw new Error(`PoB kernel bundle byte-count mismatch: expected ${manifest.totalBytes}, got ${tree.totalBytes}.`);
  if (tree.treeSha256 !== manifest.treeSha256.toLowerCase()) throw new Error('PoB kernel bundle whole-tree SHA-256 verification failed.');

  return { paths, manifest };
}

export function pobKernelRuntimeOptions(bundle: ValidatedPobKernelBundle): PobKernelRuntimeOptions {
  const runtimeCPath = `${path.join(bundle.paths.pobRuntimePath, '?.dll')};${path.join(bundle.paths.pobRuntimePath, '?', '?.dll')}`;
  return {
    runtimePath: bundle.paths.runtimePath,
    pobSourcePath: bundle.paths.pobSourcePath,
    workerScriptPath: bundle.paths.workerScriptPath,
    luaCModulePath: runtimeCPath,
    runtimeRevision: bundle.manifest.luaJitCommit,
    additionalPathEntries: [bundle.paths.pobRuntimePath],
  };
}
