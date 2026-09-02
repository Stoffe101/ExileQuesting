import { describe, expect, it } from 'vitest';
import { buildGemAcquisitionSnapshot } from './gem-data-import';
import { indexGemData, resolveGemRequirement, validateGemAcquisitionSnapshot } from './gem-data';

const source = {
  repository: 'HeartofPhos/exile-leveling',
  commit: 'b7b2dd0ed62ae25cf55c74085fa64a1f4d7cf4ba',
  license: 'MIT',
  gemsPath: 'common/data/json/gems.json',
  questsPath: 'common/data/json/quests.json',
  charactersPath: 'common/data/json/characters.json',
};

const gems = {
  fireball: { id: 'Metadata/Items/Gems/SkillGemFireball', name: 'Fireball', primary_attribute: 'int', required_level: 1, is_support: false },
  arc: { id: 'Metadata/Items/Gems/SkillGemArc', name: 'Arc', primary_attribute: 'int', required_level: 12, is_support: false },
  arcaneSurge: { id: 'Metadata/Items/Gems/SupportGemArcaneSurge', name: 'Arcane Surge Support', primary_attribute: 'int', required_level: 1, is_support: true },
  volley: { id: 'Metadata/Items/Gems/SupportGemParallelProjectiles', name: 'Volley Support', primary_attribute: 'dex', required_level: 4, is_support: true },
  internal: { id: 'Metadata/Items/Gems/SkillGemInternalTest', name: '[DNT] Internal Test', primary_attribute: 'int', required_level: 1, is_support: false },
};

const quests = {
  a1q4: {
    id: 'a1q4', name: 'Breaking Some Eggs', act: '1', reward_offers: {
      a1q4: {
        quest_npc: 'Nessa',
        quest: {
          'Metadata/Items/Gems/SkillGemArc': { classes: ['Witch'] },
          'Metadata/Items/Armours/BodyArmours/BodyDex1': { classes: ['Ranger'] },
        },
        vendor: {
          'Metadata/Items/Gems/SkillGemFireball': { classes: [], npc: 'Nessa' },
          'Metadata/Items/Gems/SupportGemParallelProjectiles': { classes: ['Ranger'], npc: 'Nessa' },
          'Metadata/Items/Weapons/OneHandWeapons/OneHandSwords/OneHandSword1': { classes: [], npc: 'Nessa' },
        },
      },
    },
  },
};

const characters = { Witch: { start_gem_id: 'Metadata/Items/Gems/SkillGemFireball', chest_gem_id: 'Metadata/Items/Gems/SupportGemArcaneSurge' } };

describe('gem data snapshot', () => {
  it('flattens maintained player-acquirable gem, quest and character data with provenance', () => {
    const snapshot = buildGemAcquisitionSnapshot(gems, quests, characters, { gameVersion: '3.29', generatedAt: '2026-09-02T01:00:00.000Z', source });
    expect(snapshot.gems.map((gem) => gem.name)).toEqual(['Arc', 'Arcane Surge Support', 'Fireball', 'Volley Support']);
    expect(snapshot.gems.some((gem) => gem.name.includes('[DNT]'))).toBe(false);
    expect(snapshot.offers).toEqual(expect.arrayContaining([
      expect.objectContaining({ gemId: 'Metadata/Items/Gems/SkillGemArc', kind: 'quest', questId: 'a1q4', npc: 'Nessa', classes: ['Witch'] }),
      expect.objectContaining({ gemId: 'Metadata/Items/Gems/SkillGemFireball', kind: 'vendor', npc: 'Nessa', classes: [] }),
      expect.objectContaining({ gemId: 'Metadata/Items/Gems/SupportGemParallelProjectiles', kind: 'vendor', npc: 'Nessa', classes: ['Ranger'] }),
    ]));
    expect(snapshot.offers.every((offer) => offer.gemId.startsWith('Metadata/Items/Gems/'))).toBe(true);
    expect(snapshot.offers).toHaveLength(3);
    expect(snapshot.startingGems.Witch).toEqual(['Metadata/Items/Gems/SkillGemFireball', 'Metadata/Items/Gems/SupportGemArcaneSurge']);
    expect(snapshot.source.commit).toBe(source.commit);
  });

  it('resolves PoB ids, Maxroll aliases and unique display names conservatively', () => {
    const snapshot = buildGemAcquisitionSnapshot(gems, quests, characters, { gameVersion: '3.29', generatedAt: '2026-09-02T01:00:00.000Z', source });
    const index = indexGemData(snapshot);
    expect(resolveGemRequirement({ key: 'arc', name: 'Anything', skillId: 'Arc', count: 1 }, index)?.name).toBe('Arc');
    expect(resolveGemRequirement({ key: 'volley', name: 'Support Volley', skillId: 'SupportVolley', count: 1 }, index)).toMatchObject({
      id: 'Metadata/Items/Gems/SupportGemParallelProjectiles',
      name: 'Volley Support',
    });
    expect(resolveGemRequirement({ key: 'fireball', name: 'Fireball', count: 1 }, index)?.id).toBe('Metadata/Items/Gems/SkillGemFireball');
  });

  it('rejects malformed snapshots instead of partially trusting them', () => {
    expect(validateGemAcquisitionSnapshot({ schemaVersion: 1, gameVersion: '3.29' })).toBeNull();
  });

  it('rejects structurally valid snapshots with broken gem references', () => {
    const snapshot = buildGemAcquisitionSnapshot(gems, quests, characters, { gameVersion: '3.29', generatedAt: '2026-09-02T01:00:00.000Z', source });
    const broken = { ...snapshot, offers: [{ ...snapshot.offers[0], gemId: 'Metadata/Items/Armours/BodyArmours/BodyDex1' }] };
    expect(validateGemAcquisitionSnapshot(broken)).toBeNull();
  });
});