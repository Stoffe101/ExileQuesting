import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BuildProfile } from '../../src/core/build-profiles';
import type { PobBuildSummary } from '../../src/core/pob';
import {
  buildCalculationPayloadPath,
  discardPendingPobCalculationPayload,
  loadPobCalculationPayload,
  stagePobCalculationPayload,
} from './pob-calculation-payload';
import { StateStore } from './state-store';

const roots: string[] = [];
const stagedIds = new Set<string>();
const build: PobBuildSummary = {
  root: 'PathOfBuilding', className: 'Witch', ascendancy: 'Occultist', level: 90,
  treeStages: [], skillStages: [], itemStages: [], configStages: [], activeSkillGroups: [], warnings: [],
};
const xml = '<PathOfBuilding><Build level="90" className="Witch" ascendClassName="Occultist"/></PathOfBuilding>';

async function root(): Promise<string> {
  const value = await mkdtemp(path.join(tmpdir(), 'exilequesting-pob-payload-'));
  roots.push(value);
  return value;
}

function profile(id: string): BuildProfile {
  stagedIds.add(id);
  return {
    id,
    name: 'Occultist fixture',
    importedAt: '2026-09-03T10:00:00.000Z',
    sourceKind: 'xml',
    calculation: stagePobCalculationPayload(id, xml),
    build,
  };
}

afterEach(async () => {
  for (const id of stagedIds) discardPendingPobCalculationPayload(id);
  stagedIds.clear();
  await Promise.all(roots.splice(0).map((value) => rm(value, { recursive: true, force: true })));
});

describe('Build Doctor PoB calculation payload storage', () => {
  it('keeps profile JSON small while atomically persisting and restoring verified XML', async () => {
    const directory = await root();
    const store = new StateStore(directory);
    const input = profile('pob-persistent');

    await store.saveBuildProfiles([input]);
    const restored = await store.loadBuildProfiles();

    expect(restored).toHaveLength(1);
    expect(restored[0].calculation).toEqual(input.calculation);
    expect(await loadPobCalculationPayload(directory, restored[0])).toBe(xml);

    const json = await readFile(path.join(directory, 'build-profiles.json'), 'utf8');
    expect(json).not.toContain('<PathOfBuilding>');
    expect(json).toContain(input.calculation!.sha256);
  });

  it('fails closed when persisted XML is modified without matching provenance', async () => {
    const directory = await root();
    const store = new StateStore(directory);
    const input = profile('pob-tamper');
    await store.saveBuildProfiles([input]);

    await writeFile(buildCalculationPayloadPath(directory, input.id), '<PathOfBuilding>tampered</PathOfBuilding>', 'utf8');
    await expect(loadPobCalculationPayload(directory, input)).rejects.toThrow(/size|SHA-256/i);
  });

  it('prunes a calculation payload when its Build Profile is deleted', async () => {
    const directory = await root();
    const store = new StateStore(directory);
    const input = profile('pob-delete');
    await store.saveBuildProfiles([input]);
    expect((await stat(buildCalculationPayloadPath(directory, input.id))).isFile()).toBe(true);

    await store.saveBuildProfiles([]);
    await expect(stat(buildCalculationPayloadPath(directory, input.id))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects unsafe profile ids before they can become filesystem paths', () => {
    expect(() => stagePobCalculationPayload('../escape', xml)).toThrow(/profile id/i);
  });
});
