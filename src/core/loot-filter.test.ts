import { describe, expect, it } from 'vitest';
import type { BuildProfile } from './build-profiles';
import { buildGemAcquisitionSnapshot } from './gem-data-import';
import { buildLootFilterPlan, renderLootFilter } from './loot-filter';
import type { PobBuildSummary } from './pob';

const snapshot = buildGemAcquisitionSnapshot({
  fire: { id: 'fire', name: 'Fireball', primary_attribute: 'int', required_level: 1, is_support: false },
  faster: { id: 'faster', name: 'Faster Casting', primary_attribute: 'int', required_level: 18, is_support: true },
  added: { id: 'added', name: 'Added Fire Damage', primary_attribute: 'str', required_level: 8, is_support: true },
}, {
  q: { id: 'q', name: 'Quest', act: '1', reward_offers: { q: { quest_npc: 'Nessa', quest: { fire: { classes: ['Witch'] }, faster: { classes: ['Witch'] }, added: { classes: ['Witch'] } }, vendor: {} } } },
}, {}, {
  gameVersion: '3.29', generatedAt: '2026-09-02T00:00:00Z',
  source: { repository: 'test', commit: 'abc', license: 'MIT', gemsPath: 'gems', questsPath: 'quests', charactersPath: 'characters' },
});

function profile(): BuildProfile {
  const build: PobBuildSummary = {
    root: 'PathOfBuilding', className: 'Witch', level: 20,
    treeStages: [{ id: 'tree:1', title: 'Act 2', kind: 'tree', active: true, ordinal: 1 }],
    skillStages: [{ id: 'skills:1', sourceId: '1', title: 'Act 2', kind: 'skills', active: true, ordinal: 1, skillGroups: [{ label: 'Main', enabled: true, gems: [
      { name: 'Fireball', skillId: 'fire', enabled: true },
      { name: 'Faster Casting', skillId: 'faster', enabled: true },
      { name: 'Added Fire Damage', skillId: 'added', enabled: true },
    ] }] }],
    itemStages: [], configStages: [], activeSkillGroups: [], warnings: [],
  };
  return { id: 'witch', name: 'Fireball Witch', importedAt: '2026-09-02T00:00:00Z', sourceKind: 'xml', build };
}

describe('build-aware loot filter', () => {
  it('derives linked socket colours from the active PoB gem group', () => {
    const plan = buildLootFilterPlan(profile(), 'aligned:act-2', snapshot);
    expect(plan.linkTargets[0]).toMatchObject({ label: 'Main', links: 3, colours: ['R', 'B', 'B'] });
  });

  it('renders narrow high-priority rules and then imports the user base filter', () => {
    const output = renderLootFilter(buildLootFilterPlan(profile(), undefined, snapshot), 'NeverSink.filter');
    expect(output).toContain('SocketGroup >= 3RBB');
    expect(output).toContain('SocketGroup RGB');
    expect(output).toContain('Sockets 6');
    expect(output.trimEnd().endsWith('Import "NeverSink.filter"')).toBe(true);
  });
});
