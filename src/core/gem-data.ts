import type { GemRequirement } from './build-transitions';

export type GemPrimaryAttribute = 'str' | 'dex' | 'int';

export interface GemDataRecord {
  id: string;
  name: string;
  primaryAttribute: GemPrimaryAttribute;
  requiredLevel: number;
  isSupport: boolean;
}

export interface GemAcquisitionOffer {
  gemId: string;
  kind: 'quest' | 'vendor';
  act: number;
  questId: string;
  questName?: string;
  rewardOfferId: string;
  questNpc?: string;
  npc?: string;
  classes: string[];
}

export interface GemAcquisitionSnapshot {
  schemaVersion: 1;
  gameVersion: string;
  generatedAt: string;
  source: {
    repository: string;
    commit: string;
    license: string;
    gemsPath: string;
    questsPath: string;
    charactersPath: string;
  };
  gems: GemDataRecord[];
  offers: GemAcquisitionOffer[];
  startingGems: Record<string, string[]>;
}

export interface GemDataIndex {
  byId: Map<string, GemDataRecord>;
  byName: Map<string, GemDataRecord[]>;
  offersByGem: Map<string, GemAcquisitionOffer[]>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown, max = 500): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;
}

function stringArray(value: unknown, limit = 20): string[] | null {
  if (!Array.isArray(value) || value.length > limit || value.some((entry) => typeof entry !== 'string' || !entry.trim() || entry.length > 160)) return null;
  return value.map((entry) => entry.trim());
}

function integer(value: unknown, min: number, max: number): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

export function normalizeGemName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function validateGemAcquisitionSnapshot(value: unknown): GemAcquisitionSnapshot | null {
  const source = record(value);
  const schemaVersion = integer(source?.schemaVersion, 1, 1);
  const gameVersion = string(source?.gameVersion, 40);
  const generatedAt = string(source?.generatedAt, 80);
  const rawSource = record(source?.source);
  const repository = string(rawSource?.repository, 200);
  const commit = string(rawSource?.commit, 120);
  const license = string(rawSource?.license, 100);
  const gemsPath = string(rawSource?.gemsPath, 400);
  const questsPath = string(rawSource?.questsPath, 400);
  const charactersPath = string(rawSource?.charactersPath, 400);
  if (schemaVersion !== 1 || !gameVersion || !generatedAt || Number.isNaN(Date.parse(generatedAt)) || !repository || !commit || !license || !gemsPath || !questsPath || !charactersPath) return null;

  if (!Array.isArray(source?.gems) || source.gems.length < 1 || source.gems.length > 2000) return null;
  const gems: GemDataRecord[] = [];
  for (const candidate of source.gems) {
    const item = record(candidate);
    const id = string(item?.id, 300);
    const name = string(item?.name, 200);
    const requiredLevel = integer(item?.requiredLevel, 1, 100);
    const primaryAttribute = item?.primaryAttribute;
    if (!id || !name || requiredLevel === undefined || !['str', 'dex', 'int'].includes(String(primaryAttribute)) || typeof item?.isSupport !== 'boolean') return null;
    gems.push({ id, name, requiredLevel, primaryAttribute: primaryAttribute as GemPrimaryAttribute, isSupport: item.isSupport });
  }

  if (!Array.isArray(source?.offers) || source.offers.length > 10000) return null;
  const offers: GemAcquisitionOffer[] = [];
  for (const candidate of source.offers) {
    const item = record(candidate);
    const gemId = string(item?.gemId, 300);
    const kind = item?.kind;
    const act = integer(item?.act, 1, 10);
    const questId = string(item?.questId, 200);
    const rewardOfferId = string(item?.rewardOfferId, 240);
    const classes = stringArray(item?.classes, 20);
    if (!gemId || !['quest', 'vendor'].includes(String(kind)) || act === undefined || !questId || !rewardOfferId || !classes) return null;
    offers.push({
      gemId, kind: kind as GemAcquisitionOffer['kind'], act, questId, rewardOfferId, classes,
      questName: string(item?.questName, 200), questNpc: string(item?.questNpc, 160), npc: string(item?.npc, 160),
    });
  }

  const rawStarting = record(source?.startingGems);
  if (!rawStarting) return null;
  const startingGems: Record<string, string[]> = {};
  for (const [className, ids] of Object.entries(rawStarting)) {
    const parsed = stringArray(ids, 20);
    if (!className.trim() || className.length > 80 || !parsed) return null;
    startingGems[className] = parsed;
  }

  const gemIds = new Set<string>();
  for (const gem of gems) {
    if (gemIds.has(gem.id)) return null;
    gemIds.add(gem.id);
  }
  const offerKeys = new Set<string>();
  for (const offer of offers) {
    if (!gemIds.has(offer.gemId)) return null;
    const key = [offer.gemId, offer.kind, offer.questId, offer.rewardOfferId, offer.npc, [...offer.classes].sort().join(',')].join('|');
    if (offerKeys.has(key)) return null;
    offerKeys.add(key);
  }
  for (const gemIdsForClass of Object.values(startingGems)) {
    if (gemIdsForClass.some((gemId) => !gemIds.has(gemId))) return null;
  }

  return {
    schemaVersion: 1,
    gameVersion,
    generatedAt,
    source: { repository, commit, license, gemsPath, questsPath, charactersPath },
    gems,
    offers,
    startingGems,
  };
}

export function indexGemData(snapshot: GemAcquisitionSnapshot): GemDataIndex {
  const byId = new Map<string, GemDataRecord>();
  const byName = new Map<string, GemDataRecord[]>();
  const offersByGem = new Map<string, GemAcquisitionOffer[]>();
  for (const gem of snapshot.gems) {
    byId.set(gem.id, gem);
    const key = normalizeGemName(gem.name);
    byName.set(key, [...(byName.get(key) ?? []), gem]);
  }
  for (const offer of snapshot.offers) offersByGem.set(offer.gemId, [...(offersByGem.get(offer.gemId) ?? []), offer]);
  return { byId, byName, offersByGem };
}

function normalizedSkillTail(value: string): string {
  return normalizeGemName(
    value
      .replace(/^Metadata\/Items\/Gems\//i, '')
      // PoB commonly uses SkillGem/SupportGem while Maxroll's planner may abbreviate
      // the same stable identity as SkillX/SupportX. Strip either form before comparing
      // tails, but still require exactly one matching bundled gem before accepting it.
      .replace(/^(?:SkillGem|SupportGem|Skill|Support)/i, ''),
  );
}

export function resolveGemRequirement(requirement: GemRequirement, index: GemDataIndex): GemDataRecord | undefined {
  if (requirement.skillId) {
    const exact = index.byId.get(requirement.skillId);
    if (exact) return exact;
    const skillTail = normalizedSkillTail(requirement.skillId);
    const byTail = [...index.byId.values()].filter((gem) => normalizedSkillTail(gem.id) === skillTail);
    if (byTail.length === 1) return byTail[0];
  }
  const byName = index.byName.get(normalizeGemName(requirement.name)) ?? [];
  return byName.length === 1 ? byName[0] : undefined;
}
