import { describe, expect, it } from 'vitest';
import type { BuildProfile } from './build-profiles';
import { nextPassiveMilestone } from './passive-milestones';
import type { PassiveTreeSnapshot } from './passive-data';
import type { PobBuildSummary } from './pob';

const passiveData: PassiveTreeSnapshot = {
  schemaVersion: 1,
  gameVersion: '3.29',
  generatedAt: '2026-09-02T00:00:00Z',
  source: { url: 'https://www.pathofexile.com/passive-skill-tree', sha256: 'abc' },
  nodes: [
    ...Array.from({ length: 1000 }, (_, index) => ({ id: index + 10000, name: `Node ${index}`, kind: 'normal' as const })),
    { id: 20001, name: 'Elemental Overload', kind: 'keystone' },
    { id: 20002, name: 'Heart of Flame', kind: 'notable' },
  ],
};

function profile(): BuildProfile {
  const build: PobBuildSummary = {
    root: 'PathOfBuilding', className: 'Witch',
    treeStages: [
      { id: 'tree:1', title: 'Act 1', kind: 'tree', active: true, ordinal: 1, nodeIds: [10000] },
      { id: 'tree:2', title: 'Act 2', kind: 'tree', active: false, ordinal: 2, nodeIds: [10000, 20001, 20002, 10001] },
    ],
    skillStages: [], itemStages: [], configStages: [], activeSkillGroups: [], warnings: [],
  };
  return { id: 'witch', name: 'Witch', importedAt: '2026-09-02T00:00:00Z', sourceKind: 'xml', build };
}

describe('passive milestone intelligence', () => {
  it('turns raw passive IDs into named notable/keystone targets', () => {
    const milestone = nextPassiveMilestone(profile(), 'aligned:act-1', passiveData);
    expect(milestone?.totalAllocations).toBe(3);
    expect(milestone?.namedTargets.map((target) => target.name)).toEqual(['Elemental Overload', 'Heart of Flame', 'Node 1']);
  });
});
