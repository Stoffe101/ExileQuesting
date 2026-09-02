import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GameDataManifestEntry } from '../../src/core/game-data-manifest';
import type { PassiveTreeSnapshot } from '../../src/core/passive-data';
import { loadPassiveTreeSnapshot } from './game-data';

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function fileSha256(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

function gitPassiveSnapshot(): PassiveTreeSnapshot {
  const nodes = Array.from({ length: 1000 }, (_, index) => ({
    id: index + 1,
    name: `Passive ${index + 1}`,
    kind: index === 4 ? 'keystone' as const : 'normal' as const,
  }));
  const repository = 'grindinggear/skilltree-export';
  const commit = '8bd138b32ea2631455cac5935bfab089f826094f';
  const sourcePath = 'data.json';
  return {
    schemaVersion: 1,
    gameVersion: '3.29',
    generatedAt: '2026-09-02T21:00:00.000Z',
    source: {
      repository,
      commit,
      path: sourcePath,
      url: `https://raw.githubusercontent.com/${repository}/${commit}/${sourcePath}`,
      sha256: createHash('sha256').update(JSON.stringify(nodes)).digest('hex'),
    },
    nodes,
  };
}

function manifestEntry(snapshot: PassiveTreeSnapshot, raw: string): GameDataManifestEntry {
  return {
    id: 'passive-tree',
    datasetRevision: 2,
    file: 'passive-tree-3.29.json',
    schemaVersion: snapshot.schemaVersion,
    gameVersion: snapshot.gameVersion,
    generatedAt: snapshot.generatedAt,
    sizeBytes: Buffer.byteLength(raw, 'utf8'),
    checksum: { algorithm: 'sha256', scope: 'file', value: fileSha256(raw) },
    source: {
      kind: 'git',
      url: 'https://github.com/grindinggear/skilltree-export',
      repository: snapshot.source.repository,
      revision: snapshot.source.commit,
      paths: [snapshot.source.path!],
    },
  };
}

describe('passive game-data git provenance', () => {
  it('accepts the future GGG export snapshot shape and rejects a mismatched source revision', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'exilequesting-passive-git-'));
    tempDirs.push(directory);
    const file = path.join(directory, 'passive-tree-3.29.json');
    const snapshot = gitPassiveSnapshot();
    const raw = JSON.stringify(snapshot);
    await writeFile(file, raw, 'utf8');

    const entry = manifestEntry(snapshot, raw);
    const valid = await loadPassiveTreeSnapshot(file, undefined, entry);
    expect(valid.status).toBe('ready');
    expect(valid.datasetRevision).toBe(2);
    expect(valid.snapshot?.source.repository).toBe('grindinggear/skilltree-export');

    const wrongRevision: GameDataManifestEntry = {
      ...entry,
      source: { ...entry.source, revision: 'b13a09fe8b8f3bec06c4440bdf90ab20988d327f' },
    };
    const rejected = await loadPassiveTreeSnapshot(file, undefined, wrongRevision);
    expect(rejected.status).toBe('invalid');
    expect(rejected.message).toContain('git source');
  });

  it('rejects a snapshot whose raw URL disagrees with its own repository/commit/path identity', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'exilequesting-passive-git-url-'));
    tempDirs.push(directory);
    const file = path.join(directory, 'passive-tree-3.29.json');
    const snapshot = gitPassiveSnapshot();
    snapshot.source.url = 'https://raw.githubusercontent.com/grindinggear/skilltree-export/not-the-pinned-commit/data.json';
    const raw = JSON.stringify(snapshot);
    await writeFile(file, raw, 'utf8');

    const result = await loadPassiveTreeSnapshot(file, undefined, manifestEntry(snapshot, raw));
    expect(result.status).toBe('invalid');
    expect(result.message).toContain('source URL');
  });
});
