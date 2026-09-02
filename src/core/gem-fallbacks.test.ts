import { describe, expect, it } from 'vitest';
import type { BuildProfile } from './build-profiles';
import { buildGemAcquisitionPlan } from './gem-acquisition';
import { buildGemAcquisitionSnapshot } from './gem-data-import';
import type { PobBuildSummary } from './pob';

const source = {
  repository: 'test/data', commit: 'abc', license: 'MIT', gemsPath: 'gems', questsPath: 'quests', charactersPath: 'characters',
};

const snapshot = buildGemAcquisitionSnapshot({
  arc: { id: 'Metadata/Items/Gems/SkillGemArc', name: 'Arc', primary_attribute: 'int', required_level: 12, is_support: false },
  late: { id: 'Metadata/Items/Gems/SkillGemLate', name: 'Late Gem', primary_attribute: 'dex', required_level: 50, is_support: false },
}, {
  a2: { id: 'a2', name: 'Sharp and Cruel', act: '2', reward_offers: { a2: { quest_npc: 'Yeena', quest: { 'Metadata/Items/Gems/SkillGemArc': { classes: ['Templar'] } }, vendor: {} } } },
  a7: { id: 'a7', name: 'The Silver Locket', act: '7', reward_offers: { a7: { quest_npc: 'Weylam Roth', quest: { 'Metadata/Items/Gems/SkillGemLate': { classes: ['Ranger'] } }, vendor: {} } } },
}, {}, { gameVersion: '3.29', generatedAt: '2026-09-02T00:00:00Z', source });

function profile(stageTitle: string, gems: string[]): BuildProfile {
  const build: PobBuildSummary = {
    root: 'PathOfBuilding', className: 'Witch', level: 70,
    treeStages: [{ id: 'tree:1', title: stageTitle, kind: 'tree', active: true, ordinal: 1 }],
    skillStages: [{ id: 'skills:1', sourceId: '1', title: stageTitle, kind: 'skills', active: true, ordinal: 1, skillGroups: [{ enabled: true, gems: gems.map((name) => ({ name, enabled: true })) }] }],
    itemStages: [], configStages: [], activeSkillGroups: [], warnings: [],
  };
  return { id: stageTitle, name: stageTitle, importedAt: '2026-09-02T00:00:00Z', sourceKind: 'xml', build };
}

describe('universal gem vendor fallbacks', () => {
  it('uses Siosa for an earlier-act gem when the class has no normal source by Act 3', () => {
    const plan = buildGemAcquisitionPlan(profile('Act 3', ['Arc']), snapshot);
    expect(plan.needs[0].preferred).toMatchObject({ fallback: 'siosa', npc: 'Siosa', questName: 'A Fixture of Fate', timingVerified: true });
  });

  it('uses Lilly for an earlier-act gem once Act 6 has been reached', () => {
    const plan = buildGemAcquisitionPlan(profile('Act 6', ['Arc']), snapshot);
    expect(plan.needs[0].preferred).toMatchObject({ fallback: 'lilly', npc: 'Lilly Roth', questName: 'Fallen from Grace', timingVerified: true });
  });

  it('does not claim Lilly bypasses a future quest gate', () => {
    const plan = buildGemAcquisitionPlan(profile('Act 6', ['Late Gem']), snapshot);
    const need = plan.needs[0];
    expect(need.preferred?.timingVerified).toBe(false);
    expect(need.alternatives.some((source) => source.fallback === 'lilly' && source.timingVerified)).toBe(false);
  });
});
