import { describe, expect, it } from 'vitest';
import type { BuildProfile } from './build-profiles';
import { buildGemAcquisitionSnapshot } from './gem-data-import';
import { analyzeGearItem, gearLookForHints } from './gear-coach';
import type { PobBuildSummary } from './pob';

const source = {
  repository: 'fixture/source',
  commit: 'fixture-commit',
  license: 'MIT',
  gemsPath: 'gems.json',
  questsPath: 'quests.json',
  charactersPath: 'characters.json',
};

const gemData = buildGemAcquisitionSnapshot({
  caustic: { id: 'Metadata/Items/Gems/SkillGemCausticArrow', name: 'Caustic Arrow', primary_attribute: 'dex', required_level: 1, is_support: false },
  volley: { id: 'Metadata/Items/Gems/SupportGemParallelProjectiles', name: 'Volley Support', primary_attribute: 'dex', required_level: 4, is_support: true },
  efficacy: { id: 'Metadata/Items/Gems/SupportGemEfficacy', name: 'Efficacy Support', primary_attribute: 'int', required_level: 8, is_support: true },
  void: { id: 'Metadata/Items/Gems/SupportGemVoidManipulation', name: 'Void Manipulation Support', primary_attribute: 'dex', required_level: 8, is_support: true },
}, {
  q1: { id: 'q1', name: 'Fixture quest', act: '1', reward_offers: { q1: { quest_npc: 'Nessa', quest: {}, vendor: {
    'Metadata/Items/Gems/SkillGemCausticArrow': { classes: ['Ranger'], npc: 'Nessa' },
    'Metadata/Items/Gems/SupportGemParallelProjectiles': { classes: ['Ranger'], npc: 'Nessa' },
    'Metadata/Items/Gems/SupportGemEfficacy': { classes: ['Ranger'], npc: 'Nessa' },
    'Metadata/Items/Gems/SupportGemVoidManipulation': { classes: ['Ranger'], npc: 'Nessa' },
  } } } },
}, {}, { gameVersion: '3.29', generatedAt: '2026-09-02T00:00:00.000Z', source });

const targetBootsRaw = `Rarity: RARE
Target Pace
Sharkskin Boots
--------
Requirements:
Level: 28
--------
Sockets: G-G-G-G
--------
Item Level: 35
--------
+60 to maximum Life
+30% to Fire Resistance
+30% to Cold Resistance
20% increased Movement Speed`;

function profile(): BuildProfile {
  const build: PobBuildSummary = {
    root: 'PathOfBuilding', className: 'Ranger', level: 28, targetVersion: '3_29', warnings: [],
    treeStages: [], configStages: [], activeSkillGroups: [],
    skillStages: [{ id: 'skills:1', sourceId: '1', title: 'Level 28', kind: 'skills', active: true, ordinal: 1, skillGroups: [{ label: 'Caustic Arrow', enabled: true, gems: [
      { name: 'Caustic Arrow', skillId: 'Metadata/Items/Gems/SkillGemCausticArrow', enabled: true },
      { name: 'Volley Support', skillId: 'Metadata/Items/Gems/SupportGemParallelProjectiles', enabled: true },
      { name: 'Efficacy Support', skillId: 'Metadata/Items/Gems/SupportGemEfficacy', enabled: true },
      { name: 'Void Manipulation Support', skillId: 'Metadata/Items/Gems/SupportGemVoidManipulation', enabled: true },
    ] }] }],
    itemStages: [{ id: 'items:1', sourceId: '1', title: 'Level 28', kind: 'items', active: true, ordinal: 1, equipment: [{
      raw: targetBootsRaw, itemClass: undefined, rarity: 'RARE', name: 'Target Pace', baseType: 'Sharkskin Boots', slot: 'boots', slotName: 'Boots', itemLevel: 35,
      requirements: { level: 28 }, socketText: 'G-G-G-G', sockets: 4, maxLinks: 4, corrupted: false, mirrored: false, unidentified: false,
      stats: { maximumLife: 60, maximumMana: 0, fireResistance: 30, coldResistance: 30, lightningResistance: 0, chaosResistance: 0, allElementalResistance: 0, strength: 0, dexterity: 0, intelligence: 0, allAttributes: 0, movementSpeed: 20, attackSpeed: 0, castSpeed: 0, increasedDamage: 0, gemLevels: 0, armour: 0, evasion: 0, energyShield: 0, ward: 0 },
      modifierLines: ['+60 to maximum Life', '+30% to Fire Resistance', '+30% to Cold Resistance', '20% increased Movement Speed'],
    }] }],
  };
  return { id: 'build-1', name: 'Caustic Arrow Ranger', importedAt: '2026-09-02T00:00:00.000Z', sourceKind: 'xml', build };
}

const strongBoots = `Item Class: Boots
Rarity: Rare
Storm Pace
Sharkskin Boots
--------
Requirements:
Level: 27
Dex: 44
--------
Sockets: G-G-G-G
--------
Item Level: 38
--------
+72 to maximum Life
+34% to Fire Resistance
+29% to Cold Resistance
+25% to Lightning Resistance
25% increased Movement Speed`;

describe('Gear Coach', () => {
  it('scores a stage-matching leveling item strongly and explains why', () => {
    const result = analyzeGearItem(strongBoots, profile(), 'aligned:level-28', gemData, 30);
    expect(result.item.slot).toBe('boots');
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(['excellent', 'good']).toContain(result.verdict);
    expect(result.target?.baseType).toBe('Sharkskin Boots');
    expect(result.desiredLinks).toBe(4);
    expect(result.reasons.some((reason) => /target base/i.test(reason.label))).toBe(true);
    expect(result.reasons.some((reason) => /movement speed/i.test(reason.label))).toBe(true);
  });

  it('marks an item that cannot yet be equipped as future gear', () => {
    const result = analyzeGearItem(strongBoots.replace('Level: 27', 'Level: 40'), profile(), 'aligned:level-28', gemData, 30);
    expect(result.verdict).toBe('future');
    expect(result.reasons[0].label).toMatch(/Requires level 40/);
  });

  it('produces concise stage-aware LOOK FOR hints', () => {
    const hints = gearLookForHints(profile(), 'aligned:level-28', gemData).map((hint) => hint.label);
    expect(hints.some((hint) => hint.includes('Sharkskin Boots'))).toBe(true);
    expect(hints.some((hint) => hint.includes('4-link'))).toBe(true);
    expect(hints.some((hint) => /movement speed/i.test(hint))).toBe(true);
  });
});
