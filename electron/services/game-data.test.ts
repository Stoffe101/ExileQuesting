import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GameDataManifest, GameDataManifestEntry } from '../../src/core/game-data-manifest';
import type { GemAcquisitionSnapshot } from '../../src/core/gem-data';
import type { PassiveTreeSnapshot } from '../../src/core/passive-data';
import {
  bundledGameDataManifestPath,
  bundledGemDataPath,
  bundledPassiveDataPath,
  loadBundledGameData,
  loadGameDataManifest,
  loadGemAcquisitionSnapshot,
  loadPassiveTreeSnapshot,
} from './game-data';

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'exilequesting-game-data-'));
  tempDirs.push(directory);
  return directory;
}

async function temporaryFile(name: string): Promise<string> {
  return path.join(await temporaryDirectory(), name);
}

function sha256(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

const snapshot: GemAcquisitionSnapshot = {
  schemaVersion: 1,
  gameVersion: '3.29',
  generatedAt: '2026-09-02T00:00:00.000Z',
  source: {
    repository: 'HeartofPhos/exile-leveling',
    commit: 'b7b2dd0ed62ae25cf55c74085fa64a1f4d7cf4ba',
    license: 'MIT',
    gemsPath: 'common/data/json/gems.json',
    questsPath: 'common/data/json/quests.json',
    charactersPath: 'common/data/json/characters.json',
  },
  gems: [{ id: 'Metadata/Items/Gems/SkillGemArc', name: 'Arc', primaryAttribute: 'int', requiredLevel: 12, isSupport: false }],
  offers: [{
    gemId: 'Metadata/Items/Gems/SkillGemArc', kind: 'quest', questId: 'a1q4', questName: 'Breaking Some Eggs', act: 1,
    rewardOfferId: 'a1q4', questNpc: 'Tarkleigh', npc: 'Tarkleigh', classes: ['Witch'],
  }],
  startingGems: { Witch: [] },
};

function passiveSnapshot(): PassiveTreeSnapshot {
  const nodes = Array.from({ length: 1000 }, (_, index) => ({ id: index + 1, name: `Passive ${index + 1}`, kind: index === 4 ? 'keystone' as const : 'normal' as const }));
  return {
    schemaVersion: 1,
    gameVersion: '3.29',
    generatedAt: '2026-09-02T00:00:00.000Z',
    source: {
      url: 'https://www.pathofexile.com/passive-skill-tree',
      sha256: createHash('sha256').update(JSON.stringify(nodes)).digest('hex'),
    },
    nodes,
  };
}

function gemManifestEntry(raw: string): GameDataManifestEntry {
  return {
    id: 'gem-acquisition', datasetRevision: 4, file: 'gem-acquisition-3.29.json', schemaVersion: 1, gameVersion: snapshot.gameVersion,
    generatedAt: snapshot.generatedAt, sizeBytes: Buffer.byteLength(raw, 'utf8'), checksum: { algorithm: 'sha256', scope: 'file', value: sha256(raw) },
    source: {
      kind: 'git', url: 'https://github.com/HeartofPhos/exile-leveling', repository: snapshot.source.repository, revision: snapshot.source.commit,
      license: snapshot.source.license, paths: [snapshot.source.gemsPath, snapshot.source.questsPath, snapshot.source.charactersPath],
    },
  };
}

function passiveManifestEntry(value: PassiveTreeSnapshot, raw: string): GameDataManifestEntry {
  return {
    id: 'passive-tree', datasetRevision: 7, file: 'passive-tree-3.29.json', schemaVersion: value.schemaVersion, gameVersion: value.gameVersion,
    generatedAt: value.generatedAt, sizeBytes: Buffer.byteLength(raw, 'utf8'), checksum: { algorithm: 'sha256', scope: 'file', value: sha256(raw) },
    source: { kind: 'url', url: value.source.url, revision: value.source.sha256, paths: [] },
  };
}

describe('bundled game data', () => {
  it('resolves development and packaged resource paths explicitly', () => {
    const dev = { packaged: false, resourcesPath: 'R', appPath: '/app' };
    const packaged = { packaged: true, resourcesPath: '/resources', appPath: '/app' };
    expect(bundledGameDataManifestPath(dev)).toBe(path.join('/app', 'assets', 'game-data', 'manifest.json'));
    expect(bundledGameDataManifestPath(packaged)).toBe(path.join('/resources', 'game-data', 'manifest.json'));
    expect(bundledGemDataPath(dev)).toBe(path.join('/app', 'assets', 'game-data', 'gem-acquisition-3.29.json'));
    expect(bundledGemDataPath(packaged)).toBe(path.join('/resources', 'game-data', 'gem-acquisition-3.29.json'));
    expect(bundledPassiveDataPath(dev)).toBe(path.join('/app', 'assets', 'game-data', 'passive-tree-3.29.json'));
    expect(bundledPassiveDataPath(packaged)).toBe(path.join('/resources', 'game-data', 'passive-tree-3.29.json'));
  });

  it('loads and validates a bounded gem snapshot with provenance intact', async () => {
    const file = await temporaryFile('gems.json');
    await writeFile(file, JSON.stringify(snapshot), 'utf8');
    const result = await loadGemAcquisitionSnapshot(file);
    expect(result.status).toBe('ready');
    expect(result.snapshot?.source.commit).toBe(snapshot.source.commit);
    expect(result.snapshot?.gems[0].name).toBe('Arc');
  });

  it('loads passive data only when its normalized node checksum matches provenance', async () => {
    const file = await temporaryFile('passives.json');
    const value = passiveSnapshot();
    await writeFile(file, JSON.stringify(value), 'utf8');
    const result = await loadPassiveTreeSnapshot(file);
    expect(result.status).toBe('ready');
    expect(result.snapshot?.nodes).toHaveLength(1000);
    expect(result.snapshot?.source.sha256).toBe(value.source.sha256);

    value.nodes[4] = { ...value.nodes[4], name: 'Tampered Keystone' };
    await writeFile(file, JSON.stringify(value), 'utf8');
    const tampered = await loadPassiveTreeSnapshot(file);
    expect(tampered.status).toBe('invalid');
    expect(tampered.message).toContain('payload checksum mismatch');
  });

  it('rejects schema-valid gem tampering when a vetted manifest entry is supplied', async () => {
    const file = await temporaryFile('gem-acquisition-3.29.json');
    const raw = JSON.stringify(snapshot);
    const entry = gemManifestEntry(raw);
    await writeFile(file, raw, 'utf8');
    const valid = await loadGemAcquisitionSnapshot(file, undefined, entry);
    expect(valid.status).toBe('ready');
    expect(valid.datasetRevision).toBe(4);

    const changed = JSON.stringify({ ...snapshot, gems: [{ ...snapshot.gems[0], name: 'Definitely Not Arc' }] });
    await writeFile(file, changed, 'utf8');
    const tampered = await loadGemAcquisitionSnapshot(file, undefined, entry);
    expect(tampered.status).toBe('invalid');
    expect(tampered.message).toContain('manifest');
  });

  it('rejects a manifest whose metadata does not match an otherwise valid snapshot', async () => {
    const file = await temporaryFile('gem-acquisition-3.29.json');
    const raw = JSON.stringify(snapshot);
    const entry = { ...gemManifestEntry(raw), gameVersion: '3.30' };
    await writeFile(file, raw, 'utf8');
    const result = await loadGemAcquisitionSnapshot(file, undefined, entry);
    expect(result.status).toBe('invalid');
    expect(result.message).toContain('game-version mismatch');
  });

  it('loads the manifest and both required datasets as one fail-closed bundle', async () => {
    const appPath = await temporaryDirectory();
    const root = path.join(appPath, 'assets', 'game-data');
    await mkdir(root, { recursive: true });
    const gemRaw = JSON.stringify(snapshot);
    const passive = passiveSnapshot();
    const passiveRaw = JSON.stringify(passive);
    const manifest: GameDataManifest = { schemaVersion: 1, datasets: [gemManifestEntry(gemRaw), passiveManifestEntry(passive, passiveRaw)] };
    await writeFile(path.join(root, 'gem-acquisition-3.29.json'), gemRaw, 'utf8');
    await writeFile(path.join(root, 'passive-tree-3.29.json'), passiveRaw, 'utf8');
    await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest), 'utf8');

    const result = await loadBundledGameData({ packaged: false, resourcesPath: '', appPath });
    expect(result.manifest.status).toBe('ready');
    expect(result.gems.status).toBe('ready');
    expect(result.passives.status).toBe('ready');
    expect(result.gems.datasetRevision).toBe(4);
    expect(result.passives.datasetRevision).toBe(7);
  });

  it('refuses both datasets when the required bundle manifest is missing', async () => {
    const appPath = await temporaryDirectory();
    const root = path.join(appPath, 'assets', 'game-data');
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'gem-acquisition-3.29.json'), JSON.stringify(snapshot), 'utf8');
    await writeFile(path.join(root, 'passive-tree-3.29.json'), JSON.stringify(passiveSnapshot()), 'utf8');
    const result = await loadBundledGameData({ packaged: false, resourcesPath: '', appPath });
    expect(result.manifest.status).toBe('missing');
    expect(result.gems.status).toBe('invalid');
    expect(result.passives.status).toBe('invalid');
  });

  it('degrades safely when snapshots are missing', async () => {
    const gemFile = await temporaryFile('missing-gems.json');
    const passiveFile = await temporaryFile('missing-passives.json');
    const [gems, passives] = await Promise.all([loadGemAcquisitionSnapshot(gemFile), loadPassiveTreeSnapshot(passiveFile)]);
    expect(gems.status).toBe('missing');
    expect(gems.snapshot).toBeUndefined();
    expect(passives.status).toBe('missing');
    expect(passives.snapshot).toBeUndefined();
  });

  it('rejects malformed and schema-invalid snapshots and manifests', async () => {
    const malformed = await temporaryFile('malformed.json');
    await writeFile(malformed, '{ nope', 'utf8');
    expect((await loadGemAcquisitionSnapshot(malformed)).status).toBe('invalid');
    expect((await loadPassiveTreeSnapshot(malformed)).status).toBe('invalid');
    expect((await loadGameDataManifest(malformed)).status).toBe('invalid');

    const invalid = await temporaryFile('invalid.json');
    await writeFile(invalid, JSON.stringify({ ...snapshot, schemaVersion: 99 }), 'utf8');
    expect((await loadGemAcquisitionSnapshot(invalid)).status).toBe('invalid');
  });
});
