import type { GemRequirement } from './build-transitions';

export interface GemDataSource {
  repository: string;
  commit: string;
  license: string;
  gemsPath: string;
  questsPath: string;
  charactersPath: string;
}

export interface GemDataRecord {
  id: string;
  name: string;
  primaryAttribute: string;
  requiredLevel: number;
  isSupport: boolean;
}

export interface GemAcquisitionOffer {
  gemId: string;
  kind: 'quest' | 'vendor';
  questId: string;
  questName: string;
  act: number;
  rewardOfferId: string;
  questNpc: string;
  npc: string;
  classes: string[];
}

export interface GemAcquisitionSnapshot {
  schemaVersion: 1;
  gameVersion: string;
  generatedAt: string;
  source: GemDataSource;
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

function string(value: unknown, max = 300): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
}

function integer(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

export function normalizeGemName(value: string): string {
  return value.toLowerCase().replace(/&apos;/g, "'").replace(/[^a-z0-9]+/g, '').trim();
}

export function validateGemAcquisitionSnapshot(value: unknown): GemAcquisitionSnapshot | null {
  const root = record(value);
  if (!root || root.schemaVersion !== 1) return null;
  const source = record(root.source);
  const gameVersion = string(root.gameVersion, 40);
  const generatedAt = string(root.generatedAt, 80);
  if (!source || !gameVersion || !generatedAt) return null;
  const repository = string(source.repository, 200);
  const commit = string(source.commit, 100);
  const license = string(source.license, 80);
  const gemsPath = string(source.gemsPath, 300);
  const questsPath = string(source.questsPath, 300);
  const charactersPath = string(source.charactersPath, 300);
  if (!repository || !commit || !license || !gemsPath || !questsPath || !charactersPath) return null;

  const gems: GemDataRecord[] = [];
  if (!Array.isArray(root.gems) || root.gems.length > 5000) return null;
  for (const candidate of root.gems) {
    const item = record(candidate);
    const id = string(item?.id, 300);
    const name = string(item?.name, 160);
    const primaryAttribute = string(item?.primaryAttribute, 40);
    const requiredLevel = integer(item?.requiredLevel, 0, 100);
    if (!item || !id || !name || !primaryAttribute || requiredLevel === undefined || typeof item.isSupport !== 'boolean') return null;
    gems.push({ id, name, primaryAttribute, requiredLevel, isSupport: item.isSupport });
  }

  const offers: GemAcquisitionOffer[] = [];
  if (!Array.isArray(root.offers) || root.offers.length > 100_000) return null;
  for (const candidate of root.offers) {
    const item = record(candidate);
    const gemId = string(item?.gemId, 300);
    const kind = item?.kind === 'quest' || item?.kind === 'vendor' ? item.kind : undefined;
    const questId = string(item?.questId, 100);
    const questName = string(item?.questName, 200);
    const act = integer(item?.act, 1, 10);
    const rewardOfferId = string(item?.rewardOfferId, 100);
    const questNpc = string(item?.questNpc, 160);
    const npc = string(item?.npc, 160);
    const classes = Array.isArray(item?.classes) ? item.classes.filter((entry): entry is string => typeof entry === 'string' && entry.length <= 80).slice(0, 20) : [];
    if (!item || !gemId || !kind || !questId || !questName || act === undefined || !rewardOfferId || !questNpc || !npc) return null;
    offers.push({ gemId, kind, questId, questName, act, rewardOfferId, questNpc, npc, classes });
  }

  const startingGems: Record<string, string[]> = {};
  const starts = record(root.startingGems);
  if (!starts) return null;
  for (const [className, value] of Object.entries(starts)) {
    if (className.length > 80 || !Array.isArray(value)) continue;
    startingGems[className] = value.filter((entry): entry is string => typeof entry === 'string' && entry.length <= 300).slice(0, 10);
  }

  // Schema-valid is not enough for bundled runtime data. Enforce referential integrity here so
  // development, CI and packaged builds all reject polluted/corrupt snapshots the same way.
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
  return normalizeGemName(value.replace(/^Metadata\/Items\/Gems\//i, '').replace(/^(?:SkillGem|SupportGem)/i, ''));
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
