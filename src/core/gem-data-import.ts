import { validateGemAcquisitionSnapshot, type GemAcquisitionSnapshot, type GemDataSource } from './gem-data';

interface GemSnapshotMetadata {
  gameVersion: string;
  generatedAt: string;
  source: GemDataSource;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

export function buildGemAcquisitionSnapshot(
  upstreamGems: unknown,
  upstreamQuests: unknown,
  upstreamCharacters: unknown,
  metadata: GemSnapshotMetadata,
): GemAcquisitionSnapshot {
  const gems = Object.values(object(upstreamGems)).flatMap((candidate) => {
    const gem = object(candidate);
    if (typeof gem.id !== 'string' || typeof gem.name !== 'string' || typeof gem.primary_attribute !== 'string' || typeof gem.required_level !== 'number' || typeof gem.is_support !== 'boolean') return [];
    return [{
      id: gem.id,
      name: gem.name,
      primaryAttribute: gem.primary_attribute,
      requiredLevel: gem.required_level,
      isSupport: gem.is_support,
    }];
  });

  const offers: GemAcquisitionSnapshot['offers'] = [];
  for (const candidate of Object.values(object(upstreamQuests))) {
    const quest = object(candidate);
    if (typeof quest.id !== 'string' || typeof quest.name !== 'string') continue;
    const act = Number(quest.act);
    if (!Number.isInteger(act) || act < 1 || act > 10) continue;
    for (const [rewardOfferId, rawOffer] of Object.entries(object(quest.reward_offers))) {
      const offer = object(rawOffer);
      const questNpc = typeof offer.quest_npc === 'string' ? offer.quest_npc : '';
      if (!questNpc) continue;
      for (const [gemId, rawReward] of Object.entries(object(offer.quest))) {
        const reward = object(rawReward);
        offers.push({
          gemId,
          kind: 'quest',
          questId: quest.id,
          questName: quest.name,
          act,
          rewardOfferId,
          questNpc,
          npc: questNpc,
          classes: strings(reward.classes),
        });
      }
      for (const [gemId, rawReward] of Object.entries(object(offer.vendor))) {
        const reward = object(rawReward);
        const npc = typeof reward.npc === 'string' && reward.npc ? reward.npc : questNpc;
        offers.push({
          gemId,
          kind: 'vendor',
          questId: quest.id,
          questName: quest.name,
          act,
          rewardOfferId,
          questNpc,
          npc,
          classes: strings(reward.classes),
        });
      }
    }
  }

  const startingGems: Record<string, string[]> = {};
  for (const [className, rawCharacter] of Object.entries(object(upstreamCharacters))) {
    const character = object(rawCharacter);
    const ids = [character.start_gem_id, character.chest_gem_id].filter((value): value is string => typeof value === 'string' && Boolean(value));
    if (ids.length) startingGems[className] = [...new Set(ids)];
  }

  const snapshot: GemAcquisitionSnapshot = {
    schemaVersion: 1,
    gameVersion: metadata.gameVersion,
    generatedAt: metadata.generatedAt,
    source: metadata.source,
    gems: gems.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    offers: offers.sort((left, right) => left.act - right.act || left.questId.localeCompare(right.questId) || left.kind.localeCompare(right.kind) || left.gemId.localeCompare(right.gemId)),
    startingGems,
  };
  const validated = validateGemAcquisitionSnapshot(snapshot);
  if (!validated) throw new Error('Generated gem acquisition snapshot failed ExileQuesting validation.');
  return validated;
}
