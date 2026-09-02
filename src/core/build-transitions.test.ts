import { describe, expect, it } from 'vitest';
import type { BuildProfile } from './build-profiles';
import { buildStageTransitions, gemRequirementsForStage } from './build-transitions';
import { alignPobStages } from './pob-stages';
import type { PobBuildSummary } from './pob';

function profile(): BuildProfile {
  const build: PobBuildSummary = {
    root: 'PathOfBuilding',
    className: 'Witch',
    ascendancy: 'Elementalist',
    level: 40,
    treeStages: [
      { id: 'tree:1', title: 'Level 12', kind: 'tree', active: false, ordinal: 1, nodeIds: [1, 2], masterySelections: [{ nodeId: 2, effectId: 101 }] },
      { id: 'tree:2', title: 'Level 28', kind: 'tree', active: true, ordinal: 2, nodeIds: [1, 2, 3], masterySelections: [{ nodeId: 2, effectId: 101 }, { nodeId: 3, effectId: 202 }] },
    ],
    skillStages: [
      {
        id: 'skills:1', sourceId: '10', title: 'Level 12', kind: 'skills', active: false, ordinal: 1,
        skillGroups: [{ label: 'Main', enabled: true, gems: [{ name: 'Rolling Magma', skillId: 'RollingMagma', enabled: true }, { name: 'Combustion', skillId: 'SupportCombustion', enabled: true }] }],
      },
      {
        id: 'skills:2', sourceId: '20', title: 'Level 28', kind: 'skills', active: true, ordinal: 2,
        skillGroups: [
          { label: 'Main', enabled: true, gems: [{ name: 'Armageddon Brand', skillId: 'ArmageddonBrand', enabled: true }, { name: 'Combustion', skillId: 'SupportCombustion', enabled: true }] },
          { label: 'Spare', enabled: false, gems: [{ name: 'Flame Dash', skillId: 'FlameDash', enabled: true }] },
        ],
      },
    ],
    itemStages: [],
    configStages: [],
    activeSkillGroups: [],
    warnings: [],
  };
  return { id: 'profile', name: 'Witch', importedAt: '2026-09-02T01:00:00Z', sourceKind: 'xml', build };
}

describe('build stage transitions', () => {
  it('counts only enabled skill groups and enabled gems for a stage', () => {
    const stages = alignPobStages(profile().build);
    expect(gemRequirementsForStage(stages[1]).map((gem) => gem.name)).toEqual(['Armageddon Brand', 'Combustion']);
  });

  it('derives gem and passive deltas between aligned leveling stages', () => {
    const transitions = buildStageTransitions(profile());
    expect(transitions).toHaveLength(2);
    expect(transitions[0].introducedGems.map((gem) => gem.name)).toEqual(['Combustion', 'Rolling Magma']);
    expect(transitions[0].passiveNodesAdded).toEqual([1, 2]);
    expect(transitions[1].introducedGems.map((gem) => gem.name)).toEqual(['Armageddon Brand']);
    expect(transitions[1].removedGems.map((gem) => gem.name)).toEqual(['Rolling Magma']);
    expect(transitions[1].passiveNodesAdded).toEqual([3]);
    expect(transitions[1].masteriesAdded).toEqual([{ nodeId: 3, effectId: 202 }]);
    expect(transitions[1].actionable).toBe(true);
  });

  it('does not mark an ambiguous transition safe for build advice', () => {
    const value = profile();
    value.build.itemStages = [
      { id: 'items:1', sourceId: '1', title: 'Random Alpha', kind: 'items', active: true, ordinal: 1 },
      { id: 'items:2', sourceId: '2', title: 'Random Beta', kind: 'items', active: false, ordinal: 2 },
      { id: 'items:3', sourceId: '3', title: 'Random Gamma', kind: 'items', active: false, ordinal: 3 },
    ];
    expect(buildStageTransitions(value).some((transition) => !transition.actionable)).toBe(true);
  });
});
