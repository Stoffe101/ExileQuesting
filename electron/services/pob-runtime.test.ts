import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  POB_KERNEL_BUNDLE_SCHEMA_VERSION,
  POB_KERNEL_COMMIT,
  POB_KERNEL_CRITICAL_FILES,
  POB_KERNEL_LUAJIT_COMMIT,
  POB_KERNEL_LUAJIT_REPOSITORY,
  POB_KERNEL_REPOSITORY,
  pobConstraintRuntimeOptions,
  pobKernelBundleRoot,
  pobKernelRuntimeOptions,
  validatePobKernelBundle,
  type PobKernelBundleManifest,
} from './pob-runtime';

const roots: string[] = [];

function hash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function treeHash(entries: Array<{ path: string; buffer: Buffer }>): string {
  const tree = createHash('sha256');
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    tree.update(entry.path, 'utf8');
    tree.update('\0');
    tree.update(String(entry.buffer.length), 'utf8');
    tree.update('\0');
    tree.update(hash(entry.buffer), 'utf8');
    tree.update('\n');
  }
  return tree.digest('hex');
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'exilequesting-pob-runtime-'));
  roots.push(root);
  const criticalFiles = {} as PobKernelBundleManifest['criticalFiles'];
  const treeEntries: Array<{ path: string; buffer: Buffer }> = [];
  for (const [key, relative] of Object.entries(POB_KERNEL_CRITICAL_FILES) as Array<[keyof typeof POB_KERNEL_CRITICAL_FILES, string]>) {
    const absolute = path.join(root, ...relative.split('/'));
    await mkdir(path.dirname(absolute), { recursive: true });
    const buffer = Buffer.from(`fixture:${key}`, 'utf8');
    await writeFile(absolute, buffer);
    treeEntries.push({ path: relative, buffer });
    criticalFiles[key] = { path: relative, size: buffer.length, sha256: hash(buffer) };
  }
  const extraPath = 'pob/src/Modules/Fixture.lua';
  const extraBuffer = Buffer.from('return { fixture = true }\n', 'utf8');
  await mkdir(path.dirname(path.join(root, ...extraPath.split('/'))), { recursive: true });
  await writeFile(path.join(root, ...extraPath.split('/')), extraBuffer);
  treeEntries.push({ path: extraPath, buffer: extraBuffer });

  const manifest: PobKernelBundleManifest = {
    schemaVersion: POB_KERNEL_BUNDLE_SCHEMA_VERSION,
    generatedAt: '2026-09-03T00:00:00.000Z',
    pobRepository: POB_KERNEL_REPOSITORY,
    pobCommit: POB_KERNEL_COMMIT,
    luaJitRepository: POB_KERNEL_LUAJIT_REPOSITORY,
    luaJitCommit: POB_KERNEL_LUAJIT_COMMIT,
    workerAdapterVersion: '0.6.0',
    constraintAdapterVersion: 'constraint-0.1.0',
    fileCount: treeEntries.length,
    totalBytes: treeEntries.reduce((sum, entry) => sum + entry.buffer.length, 0),
    treeSha256: treeHash(treeEntries),
    criticalFiles,
  };
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest), 'utf8');
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('PoB runtime bundle', () => {
  it('resolves packaged and development roots without guessing outside their explicit locations', () => {
    expect(pobKernelBundleRoot({ packaged: true, resourcesPath: 'C:/App/resources', appPath: 'C:/repo' }).replaceAll('\\', '/'))
      .toContain('C:/App/resources/pob-kernel');
    expect(pobKernelBundleRoot({ packaged: false, resourcesPath: 'C:/App/resources', appPath: 'C:/repo' }).replaceAll('\\', '/'))
      .toContain('C:/repo/.pob-runtime');
  });

  it('accepts a correctly pinned bundle and exposes both verified worker paths', async () => {
    const root = await fixture();
    const validated = await validatePobKernelBundle(root);
    expect(validated.manifest.pobCommit).toBe(POB_KERNEL_COMMIT);
    expect(validated.manifest.luaJitCommit).toBe(POB_KERNEL_LUAJIT_COMMIT);
    expect(validated.manifest.constraintAdapterVersion).toBe('constraint-0.1.0');
    const options = pobKernelRuntimeOptions(validated);
    expect(options.runtimeRevision).toBe(POB_KERNEL_LUAJIT_COMMIT);
    expect(options.luaCModulePath).toContain('?.dll');
    expect(options.additionalPathEntries).toEqual([validated.paths.pobRuntimePath]);
    const constraintOptions = pobConstraintRuntimeOptions(validated);
    expect(constraintOptions.workerScriptPath).toBe(validated.paths.constraintWorkerScriptPath);
    expect(constraintOptions.runtimeRevision).toBe(POB_KERNEL_LUAJIT_COMMIT);
  });

  it('fails closed if the calculation worker is changed after staging', async () => {
    const root = await fixture();
    await writeFile(path.join(root, ...POB_KERNEL_CRITICAL_FILES.worker.split('/')), 'tampered', 'utf8');
    await expect(validatePobKernelBundle(root)).rejects.toThrow(/SHA-256|wrong size/i);
  });

  it('fails closed if the constraint worker is changed after staging', async () => {
    const root = await fixture();
    await writeFile(path.join(root, ...POB_KERNEL_CRITICAL_FILES.constraintWorker.split('/')), 'tampered', 'utf8');
    await expect(validatePobKernelBundle(root)).rejects.toThrow(/SHA-256|wrong size/i);
  });

  it('fails closed if a non-critical PoB module changes after staging', async () => {
    const root = await fixture();
    await writeFile(path.join(root, 'pob', 'src', 'Modules', 'Fixture.lua'), 'return { fixture = false }\n', 'utf8');
    await expect(validatePobKernelBundle(root)).rejects.toThrow(/whole-tree|byte-count/i);
  });

  it('fails closed on an unreviewed PoB source pin', async () => {
    const root = await fixture();
    const manifestPath = path.join(root, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as PobKernelBundleManifest;
    manifest.pobCommit = '0'.repeat(40);
    await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');
    await expect(validatePobKernelBundle(root)).rejects.toThrow(/source pin/i);
  });
});
