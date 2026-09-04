import fs from 'node:fs';

function replaceExact(path, before, after) {
  const current = fs.readFileSync(path, 'utf8');
  if (!current.includes(before)) throw new Error(`Expected text not found in ${path}: ${before.slice(0, 120)}`);
  fs.writeFileSync(path, current.replace(before, after), 'utf8');
}

fs.writeFileSync('src/core/character-campaign.ts', `import { normalizeProgressDocument } from './persistence';
import type { CampaignStep, ProgressHistoryEntry, ZoneEvent } from './types';

export const CHARACTER_CAMPAIGN_SCHEMA_VERSION = 1;
export const MAX_CHARACTER_CAMPAIGN_PROFILES = 64;

export interface CharacterCampaignProfile {
  id: string;
  characterName?: string;
  characterClass?: string;
  provisional: boolean;
  progress: number;
  history: ProgressHistoryEntry[];
  confirmedRewardStepIds: string[];
  lastAreaId?: string;
  lastAreaName?: string;
  characterLevel?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterCampaignDocument {
  schemaVersion: typeof CHARACTER_CAMPAIGN_SCHEMA_VERSION;
  activeProfileId?: string;
  profiles: CharacterCampaignProfile[];
}

type ProfileSeed = Partial<Pick<CharacterCampaignProfile,
  'characterName' | 'characterClass' | 'provisional' | 'progress' | 'history' | 'confirmedRewardStepIds' | 'lastAreaId' | 'lastAreaName' | 'characterLevel'
>>;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function optionalString(value: unknown, max = 256): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;
}

function timestamp(value: unknown, fallback: string): string {
  const candidate = optionalString(value, 80);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : fallback;
}

function normalizedAreaName(value?: string): string | undefined {
  return value?.toLowerCase().replace(/^the\s+/, '').replace(/[.!]$/, '').trim();
}

export function normalizeCharacterName(value?: string): string | undefined {
  return value?.trim().toLocaleLowerCase();
}

export function emptyCharacterCampaignDocument(): CharacterCampaignDocument {
  return { schemaVersion: CHARACTER_CAMPAIGN_SCHEMA_VERSION, profiles: [] };
}

export function createCharacterCampaignProfile(id: string, now: string, seed: ProfileSeed = {}): CharacterCampaignProfile {
  return {
    id,
    characterName: seed.characterName?.trim() || undefined,
    characterClass: seed.characterClass?.trim() || undefined,
    provisional: seed.provisional ?? true,
    progress: Math.max(0, Math.trunc(seed.progress ?? 0)),
    history: [...(seed.history ?? [])].slice(-80),
    confirmedRewardStepIds: [...new Set(seed.confirmedRewardStepIds ?? [])].slice(0, 256),
    lastAreaId: seed.lastAreaId,
    lastAreaName: seed.lastAreaName,
    characterLevel: Number.isFinite(seed.characterLevel) ? Math.max(1, Math.trunc(seed.characterLevel!)) : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeCharacterCampaignDocument(
  value: unknown,
  maxStepIndex: number,
  allowedRewardStepIds?: Set<string>,
): CharacterCampaignDocument {
  const source = record(value);
  const now = new Date(0).toISOString();
  const profiles = Array.isArray(source?.profiles)
    ? source!.profiles.flatMap((candidate): CharacterCampaignProfile[] => {
        const item = record(candidate);
        const id = optionalString(item?.id, 512);
        if (!item || !id) return [];
        const normalizedProgress = normalizeProgressDocument({ progress: item.progress, history: item.history }, maxStepIndex);
        const rewardIds = Array.isArray(item.confirmedRewardStepIds)
          ? item.confirmedRewardStepIds.filter((entry): entry is string => typeof entry === 'string' && entry.length <= 256)
          : [];
        const filteredRewards = allowedRewardStepIds ? rewardIds.filter((entry) => allowedRewardStepIds.has(entry)) : rewardIds;
        const rawLevel = Number(item.characterLevel);
        return [{
          id,
          characterName: optionalString(item.characterName, 256),
          characterClass: optionalString(item.characterClass, 128),
          provisional: item.provisional === true,
          progress: normalizedProgress.progress,
          history: normalizedProgress.history,
          confirmedRewardStepIds: [...new Set(filteredRewards)].slice(0, 256),
          lastAreaId: optionalString(item.lastAreaId, 256),
          lastAreaName: optionalString(item.lastAreaName, 256),
          characterLevel: Number.isFinite(rawLevel) && rawLevel >= 1 && rawLevel <= 100 ? Math.trunc(rawLevel) : undefined,
          createdAt: timestamp(item.createdAt, now),
          updatedAt: timestamp(item.updatedAt, now),
        }];
      }).slice(-MAX_CHARACTER_CAMPAIGN_PROFILES)
    : [];
  const activeProfileId = optionalString(source?.activeProfileId, 512);
  return {
    schemaVersion: CHARACTER_CAMPAIGN_SCHEMA_VERSION,
    activeProfileId: activeProfileId && profiles.some((profile) => profile.id === activeProfileId) ? activeProfileId : profiles[0]?.id,
    profiles,
  };
}

export function characterProfileById(document: CharacterCampaignDocument, id?: string): CharacterCampaignProfile | undefined {
  return id ? document.profiles.find((profile) => profile.id === id) : undefined;
}

export function characterProfileByName(document: CharacterCampaignDocument, name?: string): CharacterCampaignProfile | undefined {
  const normalized = normalizeCharacterName(name);
  if (!normalized) return undefined;
  return [...document.profiles]
    .filter((profile) => normalizeCharacterName(profile.characterName) === normalized)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
}

export function upsertCharacterProfile(document: CharacterCampaignDocument, profile: CharacterCampaignProfile): CharacterCampaignDocument {
  const profiles = [...document.profiles.filter((candidate) => candidate.id !== profile.id), profile]
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .slice(-MAX_CHARACTER_CAMPAIGN_PROFILES);
  return { ...document, activeProfileId: profile.id, profiles };
}

export function removeCharacterProfile(document: CharacterCampaignDocument, id: string): CharacterCampaignDocument {
  const profiles = document.profiles.filter((profile) => profile.id !== id);
  return {
    ...document,
    profiles,
    activeProfileId: document.activeProfileId === id ? profiles[0]?.id : document.activeProfileId,
  };
}

export function isFreshCampaignStart(event: Pick<ZoneEvent, 'areaId' | 'areaName' | 'areaLevel'>): boolean {
  if (event.areaId) return event.areaId === '1_1_1';
  return normalizedAreaName(event.areaName) === 'twilight strand' && event.areaLevel !== undefined && event.areaLevel <= 2;
}

function eventMatchesStep(event: Pick<ZoneEvent, 'areaId' | 'areaName'>, step: CampaignStep): boolean {
  if (event.areaId && step.targetAreaId) return event.areaId === step.targetAreaId;
  const eventName = normalizedAreaName(event.areaName);
  return Boolean(eventName && normalizedAreaName(step.targetArea) === eventName);
}

function eventMatchesProfileArea(event: Pick<ZoneEvent, 'areaId' | 'areaName'>, profile: CharacterCampaignProfile): boolean {
  if (event.areaId && profile.lastAreaId) return event.areaId === profile.lastAreaId;
  const eventName = normalizedAreaName(event.areaName);
  return Boolean(eventName && normalizedAreaName(profile.lastAreaName) === eventName);
}

function profileZoneScore(
  profile: CharacterCampaignProfile,
  event: Pick<ZoneEvent, 'areaId' | 'areaName' | 'areaLevel'>,
  steps: CampaignStep[],
  enabled: (step: CampaignStep, index: number) => boolean,
): number {
  if (eventMatchesProfileArea(event, profile)) return 120;
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < steps.length; index += 1) {
    if (!enabled(steps[index], index) || !eventMatchesStep(event, steps[index])) continue;
    nearest = Math.min(nearest, Math.abs(index - profile.progress));
  }
  if (nearest <= 4) return 100 - nearest * 5;
  if (nearest <= 12) return 72 - nearest;
  if (nearest <= 28) return 44 - nearest;
  if (isFreshCampaignStart(event) && profile.progress <= 3) return 80;
  return 0;
}

export function selectCharacterProfileForZone(
  document: CharacterCampaignDocument,
  event: Pick<ZoneEvent, 'areaId' | 'areaName' | 'areaLevel'>,
  steps: CampaignStep[],
  enabled: (step: CampaignStep, index: number) => boolean,
  currentProfileId?: string,
): CharacterCampaignProfile | undefined {
  const ranked = document.profiles
    .map((profile) => ({ profile, score: profileZoneScore(profile, event, steps, enabled) }))
    .filter((candidate) => candidate.score >= 44)
    .sort((left, right) => right.score - left.score || Date.parse(right.profile.updatedAt) - Date.parse(left.profile.updatedAt));
  if (!ranked.length) return undefined;
  if (ranked[0].profile.id === currentProfileId) return ranked[0].profile;
  if (ranked[1] && ranked[0].score - ranked[1].score < 8 && ranked[1].profile.id !== currentProfileId) return undefined;
  return ranked[0].profile;
}
`, 'utf8');

fs.writeFileSync('src/core/character-campaign.test.ts', `import { describe, expect, it } from 'vitest';
import {
  characterProfileByName,
  createCharacterCampaignProfile,
  emptyCharacterCampaignDocument,
  isFreshCampaignStart,
  normalizeCharacterCampaignDocument,
  selectCharacterProfileForZone,
  upsertCharacterProfile,
} from './character-campaign';
import type { CampaignStep } from './types';

const steps = [
  { id: 'start', targetAreaId: '1_1_1', targetArea: 'Twilight Strand' },
  { id: 'coast', targetAreaId: '1_1_2', targetArea: 'The Coast' },
  { id: 'act7-a', targetAreaId: '2_7_1', targetArea: 'The Broken Bridge' },
  { id: 'act7-b', targetAreaId: '2_7_2', targetArea: 'The Crossroads' },
] as CampaignStep[];
const enabled = () => true;

describe('per-character campaign progress', () => {
  it('recognizes only the Act 1 Twilight Strand as a fresh campaign start', () => {
    expect(isFreshCampaignStart({ areaId: '1_1_1', areaLevel: 1 })).toBe(true);
    expect(isFreshCampaignStart({ areaId: '2_6_1', areaLevel: 45, areaName: 'Twilight Strand' })).toBe(false);
    expect(isFreshCampaignStart({ areaName: 'Twilight Strand', areaLevel: 1 })).toBe(true);
    expect(isFreshCampaignStart({ areaName: 'Twilight Strand' })).toBe(false);
  });

  it('keeps separate progress for a new character and an Act 7 character', () => {
    const now = '2026-09-04T12:00:00.000Z';
    let document = emptyCharacterCampaignDocument();
    document = upsertCharacterProfile(document, createCharacterCampaignProfile('act7', now, {
      characterName: 'OldMapper', provisional: false, progress: 3, lastAreaId: '2_7_1', characterLevel: 55,
    }));
    document = upsertCharacterProfile(document, createCharacterCampaignProfile('new', '2026-09-04T13:00:00.000Z', {
      characterName: 'FreshWitch', provisional: false, progress: 1, lastAreaId: '1_1_2', characterLevel: 3,
    }));
    expect(characterProfileByName(document, 'OldMapper')?.progress).toBe(3);
    expect(characterProfileByName(document, 'FreshWitch')?.progress).toBe(1);
    expect(selectCharacterProfileForZone(document, { areaId: '2_7_1' }, steps, enabled, 'new')?.id).toBe('act7');
    expect(selectCharacterProfileForZone(document, { areaId: '1_1_2' }, steps, enabled, 'act7')?.id).toBe('new');
  });

  it('normalizes malformed character documents without letting progress escape route bounds', () => {
    const document = normalizeCharacterCampaignDocument({
      activeProfileId: 'x',
      profiles: [{ id: 'x', progress: 9999, history: [], confirmedRewardStepIds: ['passive-ok', 'bad'], provisional: false, createdAt: 'bad', updatedAt: 'bad' }],
    }, 10, new Set(['passive-ok']));
    expect(document.profiles[0].progress).toBe(10);
    expect(document.profiles[0].confirmedRewardStepIds).toEqual(['passive-ok']);
  });
});
`, 'utf8');

replaceExact('src/core/types.ts', `  characterLevel?: number;\n  lastError?: string;`, `  characterLevel?: number;\n  characterName?: string;\n  characterClass?: string;\n  lastError?: string;`);
replaceExact('src/core/types.ts', `  characterLevel?: number;\n  timestamp?: string;\n  raw: string;`, `  characterLevel?: number;\n  characterName?: string;\n  characterClass?: string;\n  timestamp?: string;\n  raw: string;`);

replaceExact('src/core/log-parser.ts', `const CHARACTER_LEVEL = /\\b(?:You|[^\\[\\]:]+\\([^\\)]+\\))\\s+is now level\\s+(\\d+)\\b/i;`, `const NAMED_CHARACTER_LEVEL = /(?:^|:\\s*)([^:\\r\\n]+?)\\s+\\(([^)]+)\\)\\s+is now level\\s+(\\d+)\\b/i;\nconst YOU_CHARACTER_LEVEL = /\\bYou\\s+(?:are|is)\\s+now level\\s+(\\d+)\\b/i;`);
replaceExact('src/core/log-parser.ts', `  const characterLevel = line.match(CHARACTER_LEVEL);\n  if (characterLevel) {\n    return {\n      type: 'character-level',\n      characterLevel: Number(characterLevel[1]),\n      timestamp: timestampFor(line),\n      raw: line,\n    };\n  }`, `  const namedCharacterLevel = line.match(NAMED_CHARACTER_LEVEL);\n  if (namedCharacterLevel) {\n    return {\n      type: 'character-level',\n      characterName: namedCharacterLevel[1]?.trim(),\n      characterClass: namedCharacterLevel[2]?.trim(),\n      characterLevel: Number(namedCharacterLevel[3]),\n      timestamp: timestampFor(line),\n      raw: line,\n    };\n  }\n\n  const youCharacterLevel = line.match(YOU_CHARACTER_LEVEL);\n  if (youCharacterLevel) {\n    return {\n      type: 'character-level',\n      characterLevel: Number(youCharacterLevel[1]),\n      timestamp: timestampFor(line),\n      raw: line,\n    };\n  }`);
replaceExact('src/core/log-parser.ts', `export function latestZoneEvent(events: ZoneEvent[]): ZoneEvent | undefined {\n  for (let index = events.length - 1; index >= 0; index -= 1) {\n    const event = events[index];\n    if (event.type === 'area-generated' || event.type === 'area-entered') return event;\n  }\n  return undefined;\n}`, `export function latestZoneEvent(events: ZoneEvent[]): ZoneEvent | undefined {\n  for (let index = events.length - 1; index >= 0; index -= 1) {\n    const event = events[index];\n    if (event.type === 'area-generated') return event;\n    if (event.type !== 'area-entered') continue;\n    for (let generatedIndex = index - 1; generatedIndex >= 0; generatedIndex -= 1) {\n      const previous = events[generatedIndex];\n      if (previous.type === 'area-entered') break;\n      if (previous.type === 'area-generated') return { ...event, areaId: previous.areaId, areaLevel: previous.areaLevel };\n    }\n    return event;\n  }\n  return undefined;\n}`);

replaceExact('src/core/overlay-v2.test.ts', `    expect(event?.type).toBe('character-level');\n    expect(event?.characterLevel).toBe(19);`, `    expect(event?.type).toBe('character-level');\n    expect(event?.characterLevel).toBe(19);\n    expect(event?.characterName).toBe('Stoffe');\n    expect(event?.characterClass).toBe('Witch');`);
replaceExact('src/core/overlay-v2.test.ts', `  it('finds the latest zone from a bounded log tail', () => {`, `  it('pairs an entered-area startup line with its preceding generated area identity', () => {\n    const events = parseLogTail([\n      '2026/09/01 18:00:00 [DEBUG Client] Generating level 1 area "1_1_1" with seed 1',\n      '2026/09/01 18:00:01 [INFO Client] : You have entered Twilight Strand.',\n    ].join('\\n'));\n    expect(latestZoneEvent(events)).toMatchObject({ areaId: '1_1_1', areaName: 'Twilight Strand', areaLevel: 1 });\n  });\n\n  it('finds the latest zone from a bounded log tail', () => {`);

replaceExact('electron/services/log-watcher.ts', `      const events = parseLogTail(buffer.subarray(0, bytesRead).toString('utf8'));\n      const zone = latestZoneEvent(events);\n      const level = [...events].reverse().find((event) => event.type === 'character-level')?.characterLevel;`, `      const events = parseLogTail(buffer.subarray(0, bytesRead).toString('utf8'));\n      const zone = latestZoneEvent(events);\n      const zoneIndex = zone ? [...events].map((event, index) => ({ event, index })).reverse().find(({ event }) => event.type === 'area-generated' || event.type === 'area-entered')?.index ?? -1 : -1;\n      const levelEntry = [...events].map((event, index) => ({ event, index })).reverse().find(({ event }) => event.type === 'character-level');\n      const levelEvent = levelEntry?.event;\n      const level = levelEvent?.characterLevel;`);
replaceExact('electron/services/log-watcher.ts', `          characterLevel: level,\n          lastParsedEventAt: new Date().toISOString(),`, `          characterLevel: level,\n          characterName: levelEntry && levelEntry.index > zoneIndex ? levelEvent?.characterName : undefined,\n          characterClass: levelEntry && levelEntry.index > zoneIndex ? levelEvent?.characterClass : undefined,\n          lastParsedEventAt: new Date().toISOString(),`);
replaceExact('electron/services/log-watcher.ts', `      await this.hooks.onStartupZone?.(zone);`, `      const startupZone = zone && levelEntry && levelEntry.index > zoneIndex\n        ? { ...zone, characterLevel: levelEvent?.characterLevel, characterName: levelEvent?.characterName, characterClass: levelEvent?.characterClass }\n        : zone;\n      await this.hooks.onStartupZone?.(startupZone);`);
replaceExact('electron/services/log-watcher.ts', `            characterLevel: event.characterLevel ?? this.diagnostics.characterLevel,\n            lastError: undefined,`, `            characterLevel: event.characterLevel ?? this.diagnostics.characterLevel,\n            characterName: event.characterName ?? this.diagnostics.characterName,\n            characterClass: event.characterClass ?? this.diagnostics.characterClass,\n            lastError: undefined,`);

replaceExact('electron/main.ts', `import { calculateXpGuidance } from '../src/core/xp';`, `import { calculateXpGuidance } from '../src/core/xp';\nimport {\n  characterProfileById,\n  characterProfileByName,\n  createCharacterCampaignProfile,\n  emptyCharacterCampaignDocument,\n  isFreshCampaignStart,\n  normalizeCharacterCampaignDocument,\n  removeCharacterProfile,\n  selectCharacterProfileForZone,\n  upsertCharacterProfile,\n  type CharacterCampaignDocument,\n  type CharacterCampaignProfile,\n} from '../src/core/character-campaign';`);
replaceExact('electron/main.ts', `let characterLevel: number | undefined;\nlet recentAreaIds: string[] = [];`, `let characterLevel: number | undefined;\nlet characterCampaign: CharacterCampaignDocument = emptyCharacterCampaignDocument();\nlet activeCharacterProfileId = '';\nlet recentAreaIds: string[] = [];`);

replaceExact('electron/main.ts', `async function saveLootFilterState(): Promise<void> { await store.write('loot-filter.json', lootFilter); }\nasync function saveSettings(): Promise<void> { await store.saveSettings(settings); }\nasync function saveProgress(): Promise<void> { await store.write('progress.json', { progress, history: progressHistory, updatedAt: new Date().toISOString() }); }\nasync function saveRunState(): Promise<void> { await store.write('run.json', { session: runSession, history: runHistory, updatedAt: new Date().toISOString() }); }\nasync function saveRewardConfirmations(): Promise<void> { await store.write('reward-audit.json', { confirmedStepIds: [...confirmedRewardStepIds], updatedAt: new Date().toISOString() }); }`, `async function saveLootFilterState(): Promise<void> { await store.write('loot-filter.json', lootFilter); }\nasync function saveSettings(): Promise<void> { await store.saveSettings(settings); }\nfunction activeCharacterProfile(): CharacterCampaignProfile | undefined { return characterProfileById(characterCampaign, activeCharacterProfileId); }\nfunction snapshotActiveCharacter(now = new Date().toISOString()): void {\n  const active = activeCharacterProfile();\n  if (!active) return;\n  characterCampaign = upsertCharacterProfile(characterCampaign, {\n    ...active,\n    progress,\n    history: progressHistory.slice(-80),\n    confirmedRewardStepIds: [...confirmedRewardStepIds],\n    lastAreaId: currentAreaId || active.lastAreaId,\n    lastAreaName: currentZone || active.lastAreaName,\n    characterLevel: characterLevel ?? active.characterLevel,\n    updatedAt: now,\n  });\n}\nasync function saveCharacterCampaign(): Promise<void> {\n  snapshotActiveCharacter();\n  characterCampaign = { ...characterCampaign, activeProfileId: activeCharacterProfileId || undefined };\n  await store.write('campaign-characters.json', characterCampaign);\n}\nasync function saveProgress(): Promise<void> {\n  await Promise.all([store.write('progress.json', { progress, history: progressHistory, updatedAt: new Date().toISOString() }), saveCharacterCampaign()]);\n}\nasync function saveRunState(): Promise<void> { await store.write('run.json', { session: runSession, history: runHistory, updatedAt: new Date().toISOString() }); }\nasync function saveRewardConfirmations(): Promise<void> {\n  await Promise.all([store.write('reward-audit.json', { confirmedStepIds: [...confirmedRewardStepIds], updatedAt: new Date().toISOString() }), saveCharacterCampaign()]);\n}\nasync function writeActiveCharacterMirrors(): Promise<void> {\n  await Promise.all([\n    store.write('progress.json', { progress, history: progressHistory, updatedAt: new Date().toISOString() }),\n    store.write('reward-audit.json', { confirmedStepIds: [...confirmedRewardStepIds], updatedAt: new Date().toISOString() }),\n    store.write('campaign-characters.json', { ...characterCampaign, activeProfileId: activeCharacterProfileId || undefined }),\n  ]);\n}\nasync function activateCharacterProfile(profileId: string, reason: string): Promise<boolean> {\n  if (!profileId || profileId === activeCharacterProfileId) return false;\n  snapshotActiveCharacter();\n  const target = characterProfileById(characterCampaign, profileId);\n  if (!target) return false;\n  activeCharacterProfileId = target.id;\n  characterCampaign = { ...characterCampaign, activeProfileId: target.id };\n  progress = target.progress;\n  progressHistory = [...target.history];\n  confirmedRewardStepIds = new Set(target.confirmedRewardStepIds);\n  characterLevel = target.characterLevel;\n  currentAreaId = '';\n  currentZone = '';\n  currentAreaLevel = undefined;\n  recentAreaIds = [];\n  recentAreaNames = [];\n  startupReconciliation = { state: 'none' };\n  runSession = emptyRunSession();\n  await Promise.all([writeActiveCharacterMirrors(), saveRunState()]);\n  sessionGuard?.update(progress, app.getVersion());\n  log.info(`Activated campaign character profile ${target.characterName ?? target.id}: ${reason}`);\n  return true;\n}\nasync function beginFreshCharacterProfile(reason: string): Promise<void> {\n  snapshotActiveCharacter();\n  const now = new Date().toISOString();\n  const id = `provisional:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;\n  const profile = createCharacterCampaignProfile(id, now, { provisional: true, progress: 0, history: [], confirmedRewardStepIds: [], characterLevel: 1 });\n  characterCampaign = upsertCharacterProfile(characterCampaign, profile);\n  activeCharacterProfileId = id;\n  progress = 0;\n  progressHistory = [];\n  confirmedRewardStepIds = new Set();\n  characterLevel = 1;\n  currentAreaId = '';\n  currentZone = '';\n  currentAreaLevel = undefined;\n  recentAreaIds = [];\n  recentAreaNames = [];\n  startupReconciliation = { state: 'none' };\n  runSession = emptyRunSession();\n  await Promise.all([writeActiveCharacterMirrors(), saveRunState()]);\n  sessionGuard?.update(progress, app.getVersion());\n  log.info(`Started a fresh campaign character profile: ${reason}`);\n}\nasync function bindCharacterIdentity(event: ZoneEvent): Promise<void> {\n  const name = event.characterName?.trim();\n  if (!name) return;\n  const active = activeCharacterProfile();\n  if (active?.characterName?.toLocaleLowerCase() === name.toLocaleLowerCase()) {\n    characterCampaign = upsertCharacterProfile(characterCampaign, { ...active, characterClass: event.characterClass ?? active.characterClass, characterLevel: event.characterLevel ?? active.characterLevel, provisional: false, updatedAt: new Date().toISOString() });\n    return;\n  }\n  const existing = characterProfileByName(characterCampaign, name);\n  if (existing && existing.id !== active?.id) {\n    const provisionalId = active?.provisional ? active.id : undefined;\n    await activateCharacterProfile(existing.id, `Client.txt identified ${name}${event.characterClass ? ` (${event.characterClass})` : ''}.`);\n    if (provisionalId) characterCampaign = removeCharacterProfile(characterCampaign, provisionalId);\n    const selected = activeCharacterProfile();\n    if (selected) characterCampaign = upsertCharacterProfile(characterCampaign, { ...selected, characterClass: event.characterClass ?? selected.characterClass, characterLevel: event.characterLevel ?? selected.characterLevel, provisional: false, updatedAt: new Date().toISOString() });\n    await writeActiveCharacterMirrors();\n    return;\n  }\n  if (active) {\n    characterCampaign = upsertCharacterProfile(characterCampaign, { ...active, characterName: name, characterClass: event.characterClass, characterLevel: event.characterLevel ?? active.characterLevel, provisional: false, updatedAt: new Date().toISOString() });\n    await writeActiveCharacterMirrors();\n    return;\n  }\n  const now = new Date().toISOString();\n  const profile = createCharacterCampaignProfile(`character:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, now, { characterName: name, characterClass: event.characterClass, provisional: false, progress, history: progressHistory, confirmedRewardStepIds: [...confirmedRewardStepIds], lastAreaId: currentAreaId || undefined, lastAreaName: currentZone || undefined, characterLevel: event.characterLevel });\n  characterCampaign = upsertCharacterProfile(characterCampaign, profile);\n  activeCharacterProfileId = profile.id;\n  await writeActiveCharacterMirrors();\n}\nfunction campaignEvent(event: ZoneEvent): boolean {\n  if (event.areaId && dataset.areas.some((area) => area.id === event.areaId)) return true;\n  const name = event.areaName?.toLowerCase().replace(/^the\\s+/, '').replace(/[.!]$/, '').trim();\n  return Boolean(name && dataset.areas.some((area) => area.name.toLowerCase().replace(/^the\\s+/, '').trim() === name));\n}\nasync function selectCharacterForZone(event: ZoneEvent, startup: boolean): Promise<void> {\n  if (event.type === 'character-level') return;\n  const effectiveEvent = { ...event, areaLevel: event.areaLevel ?? currentAreaLevel };\n  if (isFreshCampaignStart(effectiveEvent)) {\n    const active = activeCharacterProfile();\n    const alreadyFresh = Boolean(active && active.progress <= 3 && (active.lastAreaId === '1_1_1' || (active.provisional && !active.lastAreaId)));\n    if (!alreadyFresh) await beginFreshCharacterProfile(startup ? 'Detected Act 1 Twilight Strand during startup.' : 'Detected a new Act 1 Twilight Strand run.');\n    return;\n  }\n  const selected = selectCharacterProfileForZone(characterCampaign, effectiveEvent, progressionSteps(), (step, index) => enabled(step), activeCharacterProfileId);\n  if (selected && selected.id !== activeCharacterProfileId) await activateCharacterProfile(selected.id, `Zone ${event.areaId ?? event.areaName ?? 'unknown'} matched this saved character route.`);\n}`);

replaceExact('electron/main.ts', `  const savedProgress = await store.loadProgress(dataset.steps.length - 1);\n  progress = savedProgress.progress;\n  progressHistory = savedProgress.history;\n  const knownRewardIds = new Set(dataset.steps.filter((step) => step.permanentReward).map((step) => step.id));\n  confirmedRewardStepIds = await store.loadRewards(knownRewardIds);`, `  const savedProgress = await store.loadProgress(dataset.steps.length - 1);\n  const knownRewardIds = new Set(dataset.steps.filter((step) => step.permanentReward).map((step) => step.id));\n  const legacyRewards = await store.loadRewards(knownRewardIds);\n  try { characterCampaign = normalizeCharacterCampaignDocument(await store.readUnknown('campaign-characters.json'), dataset.steps.length - 1, knownRewardIds); }\n  catch { characterCampaign = emptyCharacterCampaignDocument(); }\n  if (!characterCampaign.profiles.length) {\n    const now = new Date().toISOString();\n    const legacy = createCharacterCampaignProfile(`legacy:${Date.now()}`, now, {\n      provisional: savedProgress.progress <= 3,\n      progress: savedProgress.progress,\n      history: savedProgress.history,\n      confirmedRewardStepIds: [...legacyRewards],\n    });\n    characterCampaign = upsertCharacterProfile(characterCampaign, legacy);\n  }\n  const active = characterProfileById(characterCampaign, characterCampaign.activeProfileId) ?? characterCampaign.profiles[0];\n  activeCharacterProfileId = active.id;\n  characterCampaign = { ...characterCampaign, activeProfileId: active.id };\n  progress = active.progress;\n  progressHistory = [...active.history];\n  confirmedRewardStepIds = new Set(active.confirmedRewardStepIds);\n  characterLevel = active.characterLevel;\n  await writeActiveCharacterMirrors();`);

replaceExact('electron/main.ts', `async function handleZoneEvent(event: ZoneEvent): Promise<void> {\n  const progressBefore = progress;`, `async function handleZoneEvent(event: ZoneEvent): Promise<void> {\n  await selectCharacterForZone(event, false);\n  if (event.type === 'character-level') await bindCharacterIdentity(event);\n  const progressBefore = progress;`);
replaceExact('electron/main.ts', `  appendDetectionTrace({ eventType: event.type, areaId: event.areaId, areaName: event.areaName, areaLevel: event.areaLevel, progressBefore, progressAfter: progress, stepIdBefore, stepIdAfter: dataset.steps[progress]?.id, confidence: decision?.confidence, reason, raw: event.raw });\n  broadcastState();\n  if (event.type !== 'character-level' && settings.autoShowOnZoneChange && overlayWindow && !overlayWindow.isVisible()) overlayWindow.showInactive();`, `  appendDetectionTrace({ eventType: event.type, areaId: event.areaId, areaName: event.areaName, areaLevel: event.areaLevel, progressBefore, progressAfter: progress, stepIdBefore, stepIdAfter: dataset.steps[progress]?.id, confidence: decision?.confidence, reason, raw: event.raw });\n  await saveCharacterCampaign();\n  broadcastState();\n  if (event.type !== 'character-level' && settings.autoShowOnZoneChange && campaignEvent(event) && overlayWindow && !overlayWindow.isVisible()) overlayWindow.showInactive();`);
replaceExact('electron/main.ts', `async function handleStartupZone(event: ZoneEvent | undefined): Promise<void> {\n  if (!event) return;\n  const progressBefore = progress;`, `async function handleStartupZone(event: ZoneEvent | undefined): Promise<void> {\n  if (!event) return;\n  await selectCharacterForZone(event, true);\n  if (event.characterName) await bindCharacterIdentity(event);\n  const progressBefore = progress;`);
replaceExact('electron/main.ts', `  });\n  broadcastState();\n}\nasync function startLogWatcher(): Promise<void> {`, `  });\n  await saveCharacterCampaign();\n  broadcastState();\n  if (settings.autoShowOnZoneChange && campaignEvent(event) && overlayWindow && !overlayWindow.isVisible()) overlayWindow.showInactive();\n}\nasync function startLogWatcher(): Promise<void> {`);

console.log('Applied per-character campaign progress and startup overlay fixes.');
