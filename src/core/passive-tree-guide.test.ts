import { describe, expect, it } from 'vitest';
import type { BuildProfile } from './build-profiles';
import { alignedStagesForProfile } from './build-planner';
import type { PassiveTreeSnapshot } from './passive-data';
import { buildPassiveTreeGuidePlan } from './passive-tree-guide';

const snapshot: PassiveTreeSnapshot = {
  schemaVersion: 2,
  gameVersion: '3.29',
  generatedAt: '2026-09-02T00:00:00.000Z',
  source: { url: 'test', sha256: '0'.repeat(64) },
  bounds: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 },
  skillsPerOrbit: [1],
  orbitRadii: [0],
  nodes: [
    { id: 100, name: 'WITCH', kind: 'class-start', classStartIndex: 3, x: 0, y: -800, group: 1, orbit: 0, orbitIndex: 0, out: [101] },
    { id: 101, name: 'Spell Damage', kind: 'normal', x: 0, y: -620, group: 2, orbit: 0, orbitIndex: 0, out: [102] },
    { id: 102, name: 'Mana', kind: 'normal', x: 100, y: -480, group: 3, orbit: 0, orbitIndex: 0, out: [] },
    { id: 200, name: 'TEMPLAR', kind: 'class-start', classStartIndex: 5, x: 700, y: -250, group: 4, orbit: 0, orbitIndex: 0, out: [201] },
    { id: 201, name: 'Strength', kind: 'normal', x: 560, y: -150, group: 5, orbit: 0, orbitIndex: 0, out: [202] },
    { id: 202, name: 'Elemental Damage', kind: 'normal', x: 430, y: -20, group: 6, orbit: 0, orbitIndex: 0, out: [203] },
    { id: 203, name: 'Life', kind: 'normal', x: 300, y: 100, group: 7, orbit: 0, orbitIndex: 0, out: [] },
  ],
};

function emptyBuild(className: string) {
  return {
    root: 'PathOfBuilding' as const,
    className,
    treeStages: [],
    skillStages: [],
    itemStages: [],
    configStages: [],
    activeSkillGroups: [],
    warnings: [],
  };
}

function witchMaxrollProfile(): BuildProfile {
  return {
    id: 'witch-maxroll', name: 'Witch leveling', importedAt: '2026-09-02T00:00:00.000Z', sourceKind: 'maxroll',
    build: emptyBuild('Witch'),
    maxroll: {
      guideUrl: 'https://maxroll.gg/poe/build-guides/test-witch', guideTitle: 'Test Witch', guideSlug: 'test-witch', mode: 'league-start',
      compatibility: 'current', compatibilityMessage: 'current', passiveOperations: [
        { type: 'allocate', nodeId: 101, checkpoint: 1 },
        { type: 'allocate', nodeId: 102, checkpoint: 2 },
      ],
      skillMilestones: [], equipmentMilestones: [], alternateSkillPaths: [],
    },
  };
}

describe('build-agnostic passive tree guide planning', () => {
  it('advances the exact Maxroll target only according to ordered build progression', () => {
    const profile = witchMaxrollProfile();
    const first = buildPassiveTreeGuidePlan(profile, undefined, 0, snapshot);
    const second = buildPassiveTreeGuidePlan(profile, undefined, 1, snapshot);
    const complete = buildPassiveTreeGuidePlan(profile, undefined, 2, snapshot);

    expect(first?.mode).toBe('exact');
    expect(first?.className).toBe('Witch');
    expect(first?.classStartNodeId).toBe(100);
    expect(first?.target).toMatchObject({ nodeId: 101, nodeName: 'Spell Damage', index: 1, total: 2, checkpoint: 1 });

    expect(second?.classStartNodeId).toBe(100);
    expect(second?.target).toMatchObject({ nodeId: 102, nodeName: 'Mana', index: 2, total: 2, checkpoint: 2 });

    expect(complete?.classStartNodeId).toBe(100);
    expect(complete?.target).toBeUndefined();
    expect(complete?.message).toBe('Passive path complete.');
  });

  it('highlights a PoB stage set instead of inventing click order', () => {
    const profile: BuildProfile = {
      id: 'templar-pob', name: 'Templar PoB', importedAt: '2026-09-02T00:00:00.000Z', sourceKind: 'xml',
      build: {
        ...emptyBuild('Templar'),
        treeStages: [
          { id: 'tree:1', title: 'Level 10', kind: 'tree', active: false, ordinal: 1, classId: 5, nodeIds: [200, 201] },
          { id: 'tree:2', title: 'Level 20', kind: 'tree', active: true, ordinal: 2, classId: 5, nodeIds: [200, 201, 202, 203] },
        ],
      },
    };
    const active = alignedStagesForProfile(profile).find((stage) => stage.tree?.active) ?? alignedStagesForProfile(profile).at(-1);
    const plan = buildPassiveTreeGuidePlan(profile, active?.id, 0, snapshot);
    expect(plan?.mode).toBe('stage');
    expect(plan?.classStartNodeId).toBe(200);
    expect(plan?.target).toBeUndefined();
    expect(plan?.stageTargets.map((target) => target.nodeId)).toEqual([202, 203]);
    expect(plan?.message).toContain('does not encode click order');
  });

  it('falls back to the PoB stage marked active when no explicit planner stage is selected', () => {
    const profile: BuildProfile = {
      id: 'templar-active-fallback', name: 'Templar active fallback', importedAt: '2026-09-02T00:00:00.000Z', sourceKind: 'xml',
      build: {
        ...emptyBuild('Templar'),
        treeStages: [
          { id: 'tree:1', title: 'Level 10', kind: 'tree', active: false, ordinal: 1, classId: 5, nodeIds: [200, 201] },
          { id: 'tree:2', title: 'Level 20', kind: 'tree', active: true, ordinal: 2, classId: 5, nodeIds: [200, 201, 202, 203] },
        ],
      },
    };
    const plan = buildPassiveTreeGuidePlan(profile, undefined, 0, snapshot);
    expect(plan?.sourceLabel).toContain('Level 20');
    expect(plan?.stageTargets.map((target) => target.nodeId)).toEqual([202, 203]);
  });
});
