import { describe, expect, it } from 'vitest';
import type { PobBuildSummary } from '../../src/core/pob';
import { buildGemAcquisitionSnapshot } from '../../src/core/gem-data-import';
import { canonicalizeMaxrollBuildGems } from './maxroll-service';

const source = {
  repository: 'fixture/source',
  commit: 'fixture-commit',
  license: 'MIT',
  gemsPath: 'gems.json',
  questsPath: 'quests.json',
  charactersPath: 'characters.json',
};

function fixtureBuild(): PobBuildSummary {
  const group = {
    label: 'Main skill',
    enabled: true,
    gems: [
      { name: 'Support Volley', skillId: 'SupportVolley', enabled: true },
      { name: 'Caustic Arrow', skillId: 'CausticArrow', enabled: true },
    ],
  };
  return {
    root: 'PathOfBuilding',
    className: 'Ranger',
    treeStages: [],
    skillStages: [{ id: 'skills:1', title: 'Level 1 - 12', kind: 'skills', active: true, ordinal: 1, skillGroups: [group] }],
    itemStages: [],
    configStages: [],
    activeSkillGroups: [group],
    warnings: [],
  };
}

describe('Maxroll service', () => {
  it('canonicalizes Maxroll metadata-style gem names and IDs through bundled game data', () => {
    const snapshot = buildGemAcquisitionSnapshot({
      volley: {
        id: 'Metadata/Items/Gems/SupportGemVolley',
        name: 'Volley Support',
        primary_attribute: 'dex',
        required_level: 4,
        is_support: true,
      },
      caustic: {
        id: 'Metadata/Items/Gems/SkillGemCausticArrow',
        name: 'Caustic Arrow',
        primary_attribute: 'dex',
        required_level: 1,
        is_support: false,
      },
    }, {}, {}, { gameVersion: '3.29', generatedAt: '2026-09-02T00:00:00.000Z', source });

    const build = canonicalizeMaxrollBuildGems(fixtureBuild(), snapshot);
    const gems = build.skillStages[0].skillGroups?.[0].gems ?? [];
    expect(gems[0]).toMatchObject({
      name: 'Volley Support',
      skillId: 'Metadata/Items/Gems/SupportGemVolley',
    });
    expect(gems[1]).toMatchObject({
      name: 'Caustic Arrow',
      skillId: 'Metadata/Items/Gems/SkillGemCausticArrow',
    });
    expect(build.activeSkillGroups[0].gems[0].name).toBe('Volley Support');
  });
});
