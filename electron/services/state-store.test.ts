import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BuildProfile } from '../../src/core/build-profiles';
import { StateStore } from './state-store';

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function store() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'exilequesting-state-'));
  tempDirs.push(directory);
  return { directory, state: new StateStore(directory) };
}

function profile(id: string): BuildProfile {
  return {
    id,
    name: 'Test Witch',
    importedAt: '2026-09-01T20:00:00.000Z',
    sourceKind: 'xml',
    build: {
      root: 'PathOfBuilding',
      className: 'Witch',
      ascendancy: 'Elementalist',
      level: 90,
      treeStages: [],
      skillStages: [],
      itemStages: [],
      activeSkillGroups: [],
      warnings: [],
      notes: '',
    },
  };
}

describe('StateStore build profiles', () => {
  it('round-trips normalized build profiles', async () => {
    const { state } = await store();
    await state.saveBuildProfiles([profile('one')]);
    const loaded = await state.loadBuildProfiles();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ id: 'one', name: 'Test Witch', sourceKind: 'xml' });
  });

  it('serializes concurrent writes to the same state file without temp collisions', async () => {
    const { state, directory } = await store();
    await Promise.all(Array.from({ length: 64 }, (_, index) => state.write('concurrent.json', { index })));
    const saved = JSON.parse(await readFile(path.join(directory, 'concurrent.json'), 'utf8')) as { index: number };
    expect(saved.index).toBe(63);
    const leftovers = (await readdir(directory)).filter((name) => name.includes('concurrent.json.') && name.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('recovers safely from malformed build-profile state', async () => {
    const { state, directory } = await store();
    await writeFile(path.join(directory, 'build-profiles.json'), JSON.stringify([{ id: 4, build: 'oops' }]), 'utf8');
    expect(await state.loadBuildProfiles()).toEqual([]);
  });
});
