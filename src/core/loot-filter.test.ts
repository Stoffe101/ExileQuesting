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

function profile(withGear = false): BuildProfile {
  const build: PobBuildSummary = {
    root: 'PathOfBuilding', className: 'Witch', level: 20,
    treeStages: [{ id: 'tree:1', title: 'Act 2', kind: 'tree', active: true, ordinal: 1 }],
    skillStages: [{ id: 'skills:1', sourceId: '1', title: 'Act 2', kind: 'skills', active: true, ordinal: 1, skillGroups: [{ label: 'Main', enabled: true, gems: [
      { name: 'Fireball', skillId: 'fire', enabled: true },
      { name: 'Faster Casting', skillId: 'faster', enabled: true },
      { name: 'Added Fire Damage', skillId: 'added', enabled: true },
    ] }] }],
    itemStages: withGear ? [{
      id: 'items:1', sourceId: '10', title: 'Act 2', kind: 'items', active: true, ordinal: 1,
      equipment: [{
        raw: 'Rarity: Rare\nBlaze Pace\nSilk Slippers', rarity: 'Rare', name: 'Blaze Pace', baseType: 'Silk Slippers', slot: 'boots', slotName: 'Boots', itemId: '8',
        requirements: {}, sockets: 0, maxLinks: 0, corrupted: false, mirrored: false, unidentified: false,
        stats: { maximumLife: 30, maximumMana: 0, fireResistance: 20, coldResistance: 0, lightningResistance: 0, chaosResistance: 0, allElementalResistance: 0, strength: 0, dexterity: 0, intelligence: 0, allAttributes: 0, movementSpeed: 15, attackSpeed: 0, castSpeed: 0, increasedDamage: 0, gemLevels: 0, armour: 0, evasion: 0, energyShield: 18, ward: 0 },
        modifierLines: [],
      }],
    }] : [],
    configStages: [], activeSkillGroups: [], warnings: [],
  };
  return { id: 'witch', name: 'Fireball Witch', importedAt: '2026-09-02T00:00:00Z', sourceKind: 'xml', build };
}

describe('build-aware loot filter', () => {
  it('derives optional 3.29 quality-bonus colours from the active PoB gem group', () => {
    const plan = buildLootFilterPlan(profile(), 'aligned:act-2', snapshot);
    expect(plan).toMatchObject({ gameVersion: '3.29', baseTargets: [] });
    expect(plan.linkTargets[0]).toMatchObject({ label: 'Main', links: 3, qualityBonusColours: ['R', 'B', 'B'] });
  });

  it('shows stage-specific gear bases and usable links before falling through to the user base filter', () => {
    const plan = buildLootFilterPlan(profile(true), undefined, snapshot);
    expect(plan.baseTargets[0]).toMatchObject({ slot: 'boots', slotName: 'Boots', baseType: 'Silk Slippers' });
    const output = renderLootFilter(plan, 'NeverSink.filter');
    expect(output).toContain('BaseType "Silk Slippers"');
    expect(output).toContain('BUILD GEAR TARGET · Boots: Silk Slippers');
    expect(output).toContain('SocketGroup >= 3RBB');
    expect(output).toContain('LinkedSockets >= 3');
    expect(output).toContain('colours are optional for gem compatibility in PoE 3.29');
    expect(output).toContain('AreaLevel <= 67');
    expect(output).toContain('SocketGroup RGB');
    expect(output).toContain('LinkedSockets 6');
    expect(output).toContain('Sockets 6');
    expect(output.trimEnd().endsWith('Import "NeverSink.filter"')).toBe(true);
  });
});
