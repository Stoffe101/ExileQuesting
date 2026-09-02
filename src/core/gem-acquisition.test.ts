import { describe, expect, it } from 'vitest';
import type { BuildProfile } from './build-profiles';
import { acquisitionSourcesForRequirement, buildGemAcquisitionPlan } from './gem-acquisition';
import { buildGemAcquisitionSnapshot } from './gem-data-import';
import type { PobBuildSummary } from './pob';
import { alignPobStages } from './pob-stages';

const source = {
  repository: 'HeartofPhos/exile-leveling',
  commit: 'b7b2dd0ed62ae25cf55c74085fa64a1f4d7cf4ba',
  license: 'MIT',
  gemsPath: 'common/data/json/gems.json',
  questsPath: 'common/data/json/quests.json',
  charactersPath: 'common/data/json/characters.json',
};

const snapshot = buildGemAcquisitionSnapshot({
  fireball: { id: 'Metadata/Items/Gems/SkillGemFireball', name: 'Fireball', primary_attribute: 'int', required_level: 1, is_support: false },
  arc: { id: 'Metadata/Items/Gems/SkillGemArc', name: 'Arc', primary_attribute: 'int', required_level: 12, is_support: false },
  faster: { id: 'Metadata/Items/Gems/SupportGemFasterCasting', name: 'Faster Casting', primary_attribute: 'int', required_level: 18, is_support: true },
}, {
  a1q1: {
    id: 'a1q1', name: 'Enemy at the Gate', act: '1', reward_offers: {
      a1q1: {
        quest_npc: 'Nessa',
        quest: { 'Metadata/Items/Gems/SkillGemArc': { classes: ['Witch'] } },
        vendor: { 'Metadata/Items/Gems/SkillGemArc': { classes: ['Templar'], npc: 'Nessa' } },
      },
    },
  },
  a2q1: {
    id: 'a2q1', name: 'Sharp and Cruel', act: '2', reward_offers: {
      a2q1: {
        quest_npc: 'Yeena',
        quest: {},
        vendor: { 'Metadata/Items/Gems/SupportGemFasterCasting': { classes: ['Witch', 'Templar'], npc: 'Yeena' } },
      },
    },
  },
}, {
  Witch: { start_gem_id: 'Metadata/Items/Gems/SkillGemFireball', chest_gem_id: 'Metadata/Items/Gems/SupportGemArcaneSurge' },
}, { gameVersion: '3.29', generatedAt: '2026-09-02T01:00:00.000Z', source });

function profile(): BuildProfile {
  const build: PobBuildSummary = {
    root: 'PathOfBuilding',
    className: 'Witch',
    ascendancy: 'Elementalist',
    level: 20,
    treeStages: [
      { id: 'tree:1', title: 'Act 1', kind: 'tree', active: false, ordinal: 1 },
      { id: 'tree:2', title: 'Act 2', kind: 'tree', active: true, ordinal: 2 },
    ],
    skillStages: [
      {
        id: 'skills:1', sourceId: '1', title: 'Act 1', kind: 'skills', active: false, ordinal: 1,
        skillGroups: [{ enabled: true, gems: [{ name: 'Fireball', skillId: 'Fireball', enabled: true }, { name: 'Arc', skillId: 'Arc', enabled: true }] }],
      },
      {
        id: 'skills:2', sourceId: '2', title: 'Act 2', kind: 'skills', active: true, ordinal: 2,
        skillGroups: [{ enabled: true, gems: [{ name: 'Arc', skillId: 'Arc', enabled: true }, { name: 'Faster Casting', skillId: 'SupportFasterCasting', enabled: true }] }],
      },
    ],
    itemStages: [],
    configStages: [],
    activeSkillGroups: [],
    warnings: [],
  };
  return { id: 'witch', name: 'Witch', importedAt: '2026-09-02T01:00:00Z', sourceKind: 'xml', build };
}

describe('gem acquisition planner', () => {
  it('filters quest/vendor sources by the build class', () => {
    const first = alignPobStages(profile().build)[0];
    const result = acquisitionSourcesForRequirement(first, { key: 'arc', name: 'Arc', skillId: 'Arc', count: 1 }, 'Witch', snapshot);
    expect(result.sources.map((source) => source.kind)).toEqual(['quest']);
    expect(result.sources[0]).toMatchObject({ questName: 'Enemy at the Gate', npc: 'Nessa', timingVerified: true });
  });

  it('prefers character starting gems, then class-valid quest rewards, then vendors', () => {
    const plan = buildGemAcquisitionPlan(profile(), snapshot);
    const byName = new Map(plan.needs.map((need) => [need.requirement.name, need]));
    expect(byName.get('Fireball')?.preferred?.kind).toBe('starting');
    expect(byName.get('Arc')?.preferred?.kind).toBe('quest');
    expect(byName.get('Faster Casting')?.preferred).toMatchObject({ kind: 'vendor', npc: 'Yeena', act: 2, timingVerified: true });
    expect(plan.gameVersion).toBe('3.29');
    expect(plan.sourceCommit).toBe(source.commit);
  });

  it('does not tell the player to reacquire a gem merely because it survived a stage transition', () => {
    const plan = buildGemAcquisitionPlan(profile(), snapshot);
    expect(plan.needs.filter((need) => need.requirement.name === 'Arc')).toHaveLength(1);
  });

  it('surfaces unresolved gem names instead of guessing', () => {
    const value = profile();
    value.build.skillStages[1].skillGroups![0].gems.push({ name: 'Definitely Not A Real Gem', enabled: true });
    const plan = buildGemAcquisitionPlan(value, snapshot);
    expect(plan.needs.find((need) => need.requirement.name === 'Definitely Not A Real Gem')?.status).toBe('unknown-gem');
    expect(plan.warnings.some((warning) => warning.includes('no unique gem-data match'))).toBe(true);
  });
});
