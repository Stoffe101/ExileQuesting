import { describe, expect, it } from 'vitest';
import type { BuildProfile } from './build-profiles';
import { buildCoachSnapshot } from './build-coach';
import type { GemAcquisitionPlan } from './gem-acquisition';
import type { GemAcquisitionSnapshot } from './gem-data';
import type { PassiveTreeSnapshot } from './passive-data';

const gemData: GemAcquisitionSnapshot = {
  schemaVersion: 1,
  gameVersion: '3.29',
  generatedAt: '2026-09-02T00:00:00.000Z',
  source: { repository: 'fixture', commit: 'fixture', license: 'MIT', gemsPath: 'gems', questsPath: 'quests', charactersPath: 'characters' },
  gems: [], offers: [], startingGems: {},
};

const acquisition: GemAcquisitionPlan = {
  className: 'Ranger',
  gameVersion: '3.29',
  sourceCommit: 'fixture',
  needs: [], warnings: [],
};

const passiveData: PassiveTreeSnapshot = {
  schemaVersion: 1,
  gameVersion: '3.29',
  generatedAt: '2026-09-02T00:00:00.000Z',
  source: { url: 'https://www.pathofexile.com/passive-skill-tree', sha256: 'fixture' },
  nodes: [
    { id: 10, name: 'Ballistics', kind: 'notable' },
    { id: 20, name: 'Precise Technique', kind: 'keystone' },
  ],
};

function profile(compatibility: 'current' | 'compatible-ids' | 'stale' = 'compatible-ids'): BuildProfile {
  return {
    id: 'maxroll-fixture',
    name: 'Fixture Ranger',
    importedAt: '2026-09-02T00:00:00.000Z',
    sourceKind: 'maxroll',
    source: 'https://maxroll.gg/poe/build-guides/fixture-ranger-leveling-guide',
    maxroll: {
      guideUrl: 'https://maxroll.gg/poe/build-guides/fixture-ranger-leveling-guide',
      guideTitle: 'Fixture Ranger Leveling Guide',
      guideSlug: 'fixture-ranger-leveling-guide',
      mode: 'league-start',
      plannerTreeVersion: compatibility === 'current' ? '3.29' : '3.25',
      compatibility,
      compatibilityMessage: compatibility === 'stale' ? 'Node mapping is stale.' : 'All node IDs resolve.',
      passiveOperations: [
        { type: 'allocate', nodeId: 10, checkpoint: 1 },
        { type: 'allocate', nodeId: 20, checkpoint: 2 },
      ],
      skillMilestones: ['Level 1 - 12'],
      equipmentMilestones: [],
      alternateSkillPaths: [],
    },
    build: {
      root: 'PathOfBuilding',
      className: 'Ranger',
      skillStages: [{ id: 'skills:1', title: 'Level 1 - 12', kind: 'skills', active: true, ordinal: 1, skillGroups: [] }],
      treeStages: [], itemStages: [], configStages: [], activeSkillGroups: [], warnings: [],
    },
  };
}

describe('Maxroll build coach', () => {
  it('resolves the exact next passive against current bundled node names', () => {
    const coach = buildCoachSnapshot(profile(), undefined, acquisition, gemData, passiveData, 0);
    expect(coach.sourceKind).toBe('maxroll');
    expect(coach.maxroll?.nextPassive).toMatchObject({
      index: 1,
      total: 2,
      nodeId: 10,
      nodeName: 'Ballistics',
      nodeKind: 'notable',
      type: 'allocate',
    });
    expect(coach.nextPassiveText).toBe('Allocate Ballistics');
  });

  it('advances only from the explicit passive cursor and reports completion', () => {
    const second = buildCoachSnapshot(profile(), undefined, acquisition, gemData, passiveData, 1);
    expect(second.maxroll?.nextPassive?.nodeName).toBe('Precise Technique');
    expect(second.maxroll?.passiveCompleted).toBe(1);

    const complete = buildCoachSnapshot(profile(), undefined, acquisition, gemData, passiveData, 2);
    expect(complete.maxroll?.nextPassive).toBeUndefined();
    expect(complete.maxroll?.passiveComplete).toBe(true);
    expect(complete.nextPassiveText).toBe('Maxroll passive path complete');
  });

  it('refuses to present an exact node when compatibility is stale', () => {
    const coach = buildCoachSnapshot(profile('stale'), undefined, acquisition, gemData, passiveData, 0);
    expect(coach.maxroll?.compatibility).toBe('stale');
    expect(coach.maxroll?.nextPassive).toBeUndefined();
    expect(coach.maxroll?.passiveComplete).toBe(false);
    expect(coach.nextPassiveText).toBeUndefined();
  });
});
