import { describe, expect, it } from 'vitest';
import { defaultBuildProfileName, normalizeBuildProfiles, upsertBuildProfile, type BuildProfile } from './build-profiles';
import type { PobBuildSummary } from './pob';

const build: PobBuildSummary = {
  root: 'PathOfBuilding', className: 'Witch', ascendancy: 'Elementalist', level: 38,
  treeStages: [], skillStages: [], itemStages: [], configStages: [], activeSkillGroups: [], warnings: [],
};

function profile(id: string, importedAt = '2026-09-01T10:00:00Z'): BuildProfile {
  return { id, name: defaultBuildProfileName(build), importedAt, sourceKind: 'export-code', build };
}

describe('build profiles', () => {
  it('uses class and ascendancy as a readable default name', () => {
    expect(defaultBuildProfileName(build)).toBe('Witch · Elementalist');
  });

  it('upserts and bounds local build profiles', () => {
    let profiles: BuildProfile[] = [];
    for (let index = 0; index < 30; index += 1) profiles = upsertBuildProfile(profiles, profile(String(index), `2026-09-01T10:${String(index).padStart(2, '0')}:00Z`));
    expect(profiles).toHaveLength(20);
  });

  it('drops malformed persisted profiles', () => {
    const normalized = normalizeBuildProfiles([profile('good'), { id: 42 }, { id: 'bad', importedAt: 'x', sourceKind: 'wat', build }]);
    expect(normalized.map((item) => item.id)).toEqual(['good']);
  });

  it('migrates v0.1 Build Profiles that predate configuration-stage parsing', () => {
    const legacyBuild = { ...build } as Record<string, unknown>;
    delete legacyBuild.configStages;
    const normalized = normalizeBuildProfiles([{ ...profile('legacy'), build: legacyBuild }]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].build.configStages).toEqual([]);
  });

  it('restores Maxroll provenance, passive operations and Twink equipment references', () => {
    const persisted = {
      id: 'maxroll-ranger',
      name: 'Leveling Twink Ranger',
      importedAt: '2026-09-02T12:00:00.000Z',
      sourceKind: 'maxroll',
      source: 'https://maxroll.gg/poe/build-guides/leveling-twink-ranger',
      build: { ...build, className: 'Ranger', ascendancy: undefined },
      maxroll: {
        guideUrl: 'https://maxroll.gg/poe/build-guides/leveling-twink-ranger',
        guideTitle: 'Leveling Twink Ranger',
        guideSlug: 'leveling-twink-ranger',
        guideModified: '2025-06-13',
        mode: 'twink',
        plannerId: 'gep906sn',
        plannerTreeVersion: '3.25',
        compatibility: 'compatible-ids',
        compatibilityMessage: 'All referenced node IDs resolve in 3.29.',
        passiveOperations: [
          { type: 'allocate', nodeId: 10, checkpoint: 1 },
          { type: 'refund', nodeId: 10, checkpoint: 2 },
        ],
        skillMilestones: ['Level 2', 'Hollow Palm Swap (Level 12)'],
        equipmentMilestones: [{
          id: '5',
          name: 'act 1',
          itemNames: ['Briskwrap'],
          slots: [{
            slot: 'BodyArmour',
            itemId: '28',
            name: 'Briskwrap',
            baseId: 'Metadata/Items/Armours/BodyArmours/BodyDex6',
            uniqueId: 'UniqueBodyDex7',
          }],
        }],
        alternateSkillPaths: [],
      },
    };

    const normalized = normalizeBuildProfiles([persisted]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].sourceKind).toBe('maxroll');
    expect(normalized[0].maxroll?.plannerId).toBe('gep906sn');
    expect(normalized[0].maxroll?.passiveOperations).toHaveLength(2);
    expect(normalized[0].maxroll?.equipmentMilestones[0].slots[0]).toMatchObject({
      slot: 'BodyArmour',
      itemId: '28',
      name: 'Briskwrap',
      uniqueId: 'UniqueBodyDex7',
    });
  });
});
