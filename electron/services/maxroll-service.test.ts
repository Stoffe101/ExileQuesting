import { describe, expect, it } from 'vitest';
import type { PobBuildSummary } from '../../src/core/pob';
import { buildGemAcquisitionSnapshot } from '../../src/core/gem-data-import';
import { canonicalizeMaxrollBuildGems, isAllowedMaxrollResponse } from './maxroll-service';

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
  it('allows only expected public Maxroll PoE response routes', () => {
    expect(isAllowedMaxrollResponse('https://maxroll.gg/poe/build-guides/example-guide', 'guide')).toBe(true);
    expect(isAllowedMaxrollResponse('https://www.maxroll.gg/poe/planner/gep906sn', 'planner')).toBe(true);
    expect(isAllowedMaxrollResponse('https://maxroll.gg:443/poe/planner/gep906sn', 'planner')).toBe(true);
    expect(isAllowedMaxrollResponse('http://maxroll.gg/poe/planner/gep906sn', 'planner')).toBe(false);
    expect(isAllowedMaxrollResponse('https://maxroll.gg:8443/poe/planner/gep906sn', 'planner')).toBe(false);
    expect(isAllowedMaxrollResponse('https://maxroll.gg.evil.example/poe/planner/gep906sn', 'planner')).toBe(false);
    expect(isAllowedMaxrollResponse('https://maxroll.gg/other/path', 'guide')).toBe(false);
    expect(isAllowedMaxrollResponse('https://user:pass@maxroll.gg/poe/build-guides/example-guide', 'guide')).toBe(false);
  });

  it('canonicalizes Maxroll alias labels and IDs through bundled game data', () => {
    const snapshot = buildGemAcquisitionSnapshot({
      volley: {
        id: 'Metadata/Items/Gems/SupportGemParallelProjectiles',
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
    }, {
      a1q1: {
        id: 'a1q1', name: 'Enemy at the Gate', act: '1', reward_offers: {
          a1q1: {
            quest_npc: 'Nessa',
            quest: {},
            vendor: {
              'Metadata/Items/Gems/SupportGemParallelProjectiles': { classes: ['Ranger'], npc: 'Nessa' },
              'Metadata/Items/Gems/SkillGemCausticArrow': { classes: ['Ranger'], npc: 'Nessa' },
            },
          },
        },
      },
    }, {}, { gameVersion: '3.29', generatedAt: '2026-09-02T00:00:00.000Z', source });

    const build = canonicalizeMaxrollBuildGems(fixtureBuild(), snapshot);
    const gems = build.skillStages[0].skillGroups?.[0].gems ?? [];
    expect(gems[0]).toMatchObject({
      name: 'Volley Support',
      skillId: 'Metadata/Items/Gems/SupportGemParallelProjectiles',
    });
    expect(gems[1]).toMatchObject({
      name: 'Caustic Arrow',
      skillId: 'Metadata/Items/Gems/SkillGemCausticArrow',
    });
    expect(build.activeSkillGroups[0].gems[0].name).toBe('Volley Support');
  });
});