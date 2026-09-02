import { describe, expect, it } from 'vitest';
import type { LootFilterPlan } from './loot-filter';
import { buildVendorSearchPlan, MAX_VENDOR_SEARCH_CHARS, type VendorGemTask } from './vendor-search';

function loot(overrides: Partial<LootFilterPlan> = {}): LootFilterPlan {
  return {
    profileId: 'profile-1',
    profileName: 'Test build',
    gameVersion: '3.29.0',
    stageId: 'stage-1',
    stageTitle: 'Level 12',
    linkTargets: [{
      stageId: 'stage-1',
      stageTitle: 'Level 12',
      label: 'Main skill',
      links: 4,
      qualityBonusColours: ['B', 'B', 'G', 'R'],
      gems: ['Main Skill', 'Support One', 'Support Two', 'Support Three'],
    }],
    baseTargets: [
      { stageId: 'stage-1', stageTitle: 'Level 12', slot: 'weapon', slotName: 'Weapon', baseType: 'Quartz Wand', rarity: 'Rare' },
      { stageId: 'stage-1', stageTitle: 'Level 12', slot: 'boots', slotName: 'Boots', baseType: 'Goathide Boots', rarity: 'Rare' },
      { stageId: 'stage-1', stageTitle: 'Level 12', slot: 'helmet', slotName: 'Helmet', baseType: 'Goldrim', name: 'Goldrim', rarity: 'Unique' },
    ],
    showChromaticRecipe: true,
    showSixSockets: true,
    warnings: [],
    ...overrides,
  };
}

function gem(name: string, source = 'Vendor · Nessa · Act 1', status: VendorGemTask['status'] = 'planned'): VendorGemTask {
  return { name, source, status };
}

describe('buildVendorSearchPlan', () => {
  it('builds one conservative gear scan from links, movement speed and active-stage bases', () => {
    const plan = buildVendorSearchPlan(loot(), []);
    expect(plan.equipment?.query).toContain('sockets: ([rgbw]-){3}[rgbw]');
    expect(plan.equipment?.query).toContain('movement speed');
    expect(plan.equipment?.query).toContain('Quartz Wand');
    expect(plan.equipment?.query).toContain('Goathide Boots');
    expect(plan.equipment?.query).not.toContain('Goldrim');
    expect(plan.equipment?.length).toBe(plan.equipment?.query.length);
    expect(plan.equipment!.length).toBeLessThanOrEqual(MAX_VENDOR_SEARCH_CHARS);
  });

  it('does not create a socket-link expression for two-link targets', () => {
    const plan = buildVendorSearchPlan(loot({
      linkTargets: [{
        stageId: 'stage-1', stageTitle: 'Level 4', label: 'Early skill', links: 2,
        qualityBonusColours: ['B', 'B'], gems: ['Skill', 'Support'],
      }],
    }), []);
    expect(plan.equipment?.query).not.toContain('sockets:');
    expect(plan.equipment?.query).toContain('movement speed');
  });

  it('escapes regex metacharacters in build-derived item and gem names', () => {
    const plan = buildVendorSearchPlan(loot({
      baseTargets: [{
        stageId: 'stage-1', stageTitle: 'Test', slot: 'weapon', slotName: 'Weapon',
        baseType: 'Mage [Test] (Alpha)+ Wand', rarity: 'Rare',
      }],
    }), [gem('Fire (Plus)+ Support')]);
    expect(plan.equipment?.query).toContain('Mage \\[Test\\] \\(Alpha\\)\\+ Wand');
    expect(plan.gems?.query).toContain('Fire \\(Plus\\)\\+ Support');
  });

  it('includes only planned gems whose preferred source is a vendor and deduplicates names', () => {
    const plan = buildVendorSearchPlan(loot(), [
      gem('Flame Dash'),
      gem('Flame Dash', 'Vendor · Yeena · Act 2'),
      gem('Added Lightning Damage'),
      gem('Arcane Surge', 'Quest reward · Breaking Some Eggs · Act 1'),
      gem('Unavailable Gem', 'Vendor · Nessa · Act 1', 'unavailable'),
      gem('Unknown Gem', 'Vendor · Nessa · Act 1', 'unknown-gem'),
    ]);
    expect(plan.gems?.included).toEqual(['Flame Dash', 'Added Lightning Damage']);
    expect(plan.gems?.query).toBe('Flame Dash|Added Lightning Damage');
    expect(plan.gems?.query).not.toContain('Arcane Surge');
    expect(plan.gems?.query).not.toContain('Unavailable Gem');
  });

  it('never exceeds the 250-character search limit and reports omitted lower-priority targets', () => {
    const baseTargets = Array.from({ length: 20 }, (_, index) => ({
      stageId: 'stage-1',
      stageTitle: 'Test',
      slot: 'helmet' as const,
      slotName: `Helmet ${index}`,
      baseType: `Extremely Descriptive Campaign Helmet Base Type Number ${index} With Extra Words`,
      rarity: 'Rare',
    }));
    const gems = Array.from({ length: 20 }, (_, index) => gem(`Extremely Descriptive Support Gem Number ${index} With Extra Words`));
    const plan = buildVendorSearchPlan(loot({ baseTargets }), gems);
    expect(plan.equipment!.length).toBeLessThanOrEqual(MAX_VENDOR_SEARCH_CHARS);
    expect(plan.gems!.length).toBeLessThanOrEqual(MAX_VENDOR_SEARCH_CHARS);
    expect(plan.equipment!.omitted).toBeGreaterThan(0);
    expect(plan.gems!.omitted).toBeGreaterThan(0);
    expect(plan.warnings.length).toBe(2);
  });
});
