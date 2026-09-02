import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GemAcquisitionSnapshot } from '../../src/core/gem-data';
import { bundledGemDataPath, loadGemAcquisitionSnapshot } from './game-data';

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function temporaryFile(name: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'exilequesting-game-data-'));
  tempDirs.push(directory);
  return path.join(directory, name);
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

describe('bundled game data', () => {
  it('resolves development and packaged resource paths explicitly', () => {
    expect(bundledGemDataPath({ packaged: false, resourcesPath: 'R', appPath: '/app' })).toBe(path.join('/app', 'assets', 'game-data', 'gem-acquisition-3.29.json'));
    expect(bundledGemDataPath({ packaged: true, resourcesPath: '/resources', appPath: '/app' })).toBe(path.join('/resources', 'game-data', 'gem-acquisition-3.29.json'));
  });

  it('loads and validates a bounded snapshot with provenance intact', async () => {
    const file = await temporaryFile('gems.json');
    await writeFile(file, JSON.stringify(snapshot), 'utf8');
    const result = await loadGemAcquisitionSnapshot(file);
    expect(result.status).toBe('ready');
    expect(result.snapshot?.source.commit).toBe(snapshot.source.commit);
    expect(result.snapshot?.gems[0].name).toBe('Arc');
  });

  it('degrades safely when the snapshot is missing', async () => {
    const file = await temporaryFile('missing.json');
    const result = await loadGemAcquisitionSnapshot(file);
    expect(result.status).toBe('missing');
    expect(result.snapshot).toBeUndefined();
  });

  it('rejects malformed and schema-invalid snapshots', async () => {
    const malformed = await temporaryFile('malformed.json');
    await writeFile(malformed, '{ nope', 'utf8');
    expect((await loadGemAcquisitionSnapshot(malformed)).status).toBe('invalid');

    const invalid = await temporaryFile('invalid.json');
    await writeFile(invalid, JSON.stringify({ ...snapshot, schemaVersion: 99 }), 'utf8');
    expect((await loadGemAcquisitionSnapshot(invalid)).status).toBe('invalid');
  });
});
