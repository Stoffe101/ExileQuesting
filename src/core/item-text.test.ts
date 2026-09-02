import { describe, expect, it } from 'vitest';
import { elementalResistanceTotal, parsePoeItemText, slotFromPobSlot } from './item-text';

const rareBoots = `Item Class: Boots
Rarity: Rare
Doom Pace
Two-Toned Boots
--------
Quality: +20% (augmented)
Evasion Rating: 312 (augmented)
Energy Shield: 64 (augmented)
--------
Requirements:
Level: 45
Dex: 68
Int: 68
--------
Sockets: G-G-B-R
--------
Item Level: 67
--------
+12% to Fire and Cold Resistances (implicit)
--------
+78 to maximum Life
+35% to Fire Resistance
+31% to Lightning Resistance
25% increased Movement Speed
+24 to Dexterity
--------`;

describe('Path of Exile item text parser', () => {
  it('parses slot, identity, sockets and common leveling stats', () => {
    const item = parsePoeItemText(rareBoots);
    expect(item.slot).toBe('boots');
    expect(item.rarity).toBe('Rare');
    expect(item.name).toBe('Doom Pace');
    expect(item.baseType).toBe('Two-Toned Boots');
    expect(item.requirements.level).toBe(45);
    expect(item.sockets).toBe(4);
    expect(item.maxLinks).toBe(4);
    expect(item.stats.maximumLife).toBe(78);
    expect(item.stats.fireResistance).toBe(35);
    expect(item.stats.lightningResistance).toBe(31);
    expect(item.stats.movementSpeed).toBe(25);
    expect(item.stats.dexterity).toBe(24);
    expect(elementalResistanceTotal(item)).toBe(66);
  });

  it('parses normal items without inventing a separate display name', () => {
    const item = parsePoeItemText(`Item Class: Body Armours\nRarity: Normal\nSimple Robe\n--------\nSockets: B-B\n--------\nItem Level: 7`);
    expect(item.name).toBe('Simple Robe');
    expect(item.baseType).toBe('Simple Robe');
    expect(item.slot).toBe('body-armour');
    expect(item.maxLinks).toBe(2);
  });

  it('maps PoB equipment slot names into Gear Coach slots', () => {
    expect(slotFromPobSlot('Body Armour')).toBe('body-armour');
    expect(slotFromPobSlot('Weapon 1')).toBe('weapon');
    expect(slotFromPobSlot('Weapon 2')).toBe('offhand');
    expect(slotFromPobSlot('Ring 2')).toBe('ring');
  });
});
