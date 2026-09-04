from pathlib import Path


def replace_once(path: str, before: str, after: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if before not in text:
        raise RuntimeError(f'Expected text not found in {path}: {before[:140]!r}')
    p.write_text(text.replace(before, after, 1), encoding='utf-8')

Path('src/core/character-campaign.ts').write_text("""import { normalizeProgressDocument } from './persistence';
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
  return value?.toLowerCase().replace(/^the\\s+/, '').replace(/[.!]$/, '').trim();
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
  const epoch = new Date(0).toISOString();
  const profiles = Array.isArray(source?.profiles)
    ? source.profiles.flatMap((candidate): CharacterCampaignProfile[] => {
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
          createdAt: timestamp(item.createdAt, epoch),
          updatedAt: timestamp(item.updatedAt, epoch),
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
""", encoding='utf-8')

Path('src/core/character-campaign.test.ts').write_text("""import { describe, expect, it } from 'vitest';
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

  it('selects a saved Act 7 character instead of leaving a new character cursor active', () => {
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
""", encoding='utf-8')

replace_once('src/core/types.ts', """  characterLevel?: number;
  lastError?: string;""", """  characterLevel?: number;
  characterName?: string;
  characterClass?: string;
  lastError?: string;""")
replace_once('src/core/types.ts', """  characterLevel?: number;
  timestamp?: string;
  raw: string;""", """  characterLevel?: number;
  characterName?: string;
  characterClass?: string;
  timestamp?: string;
  raw: string;""")

replace_once('src/core/log-parser.ts', """const CHARACTER_LEVEL = /\\b(?:You|[^\\[\\]:]+\\([^\\)]+\\))\\s+is now level\\s+(\\d+)\\b/i;""", """const NAMED_CHARACTER_LEVEL = /(?:^|:\\s*)([^:\\r\\n]+?)\\s+\\(([^)]+)\\)\\s+is now level\\s+(\\d+)\\b/i;
const YOU_CHARACTER_LEVEL = /\\bYou\\s+(?:are|is)\\s+now level\\s+(\\d+)\\b/i;""")
replace_once('src/core/log-parser.ts', """  const characterLevel = line.match(CHARACTER_LEVEL);
  if (characterLevel) {
    return {
      type: 'character-level',
      characterLevel: Number(characterLevel[1]),
      timestamp: timestampFor(line),
      raw: line,
    };
  }""", """  const namedCharacterLevel = line.match(NAMED_CHARACTER_LEVEL);
  if (namedCharacterLevel) {
    return {
      type: 'character-level',
      characterName: namedCharacterLevel[1]?.trim(),
      characterClass: namedCharacterLevel[2]?.trim(),
      characterLevel: Number(namedCharacterLevel[3]),
      timestamp: timestampFor(line),
      raw: line,
    };
  }

  const youCharacterLevel = line.match(YOU_CHARACTER_LEVEL);
  if (youCharacterLevel) {
    return {
      type: 'character-level',
      characterLevel: Number(youCharacterLevel[1]),
      timestamp: timestampFor(line),
      raw: line,
    };
  }""")
replace_once('src/core/log-parser.ts', """export function latestZoneEvent(events: ZoneEvent[]): ZoneEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === 'area-generated' || event.type === 'area-entered') return event;
  }
  return undefined;
}""", """export function latestZoneEvent(events: ZoneEvent[]): ZoneEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === 'area-generated') return event;
    if (event.type !== 'area-entered') continue;
    for (let generatedIndex = index - 1; generatedIndex >= 0; generatedIndex -= 1) {
      const previous = events[generatedIndex];
      if (previous.type === 'area-entered') break;
      if (previous.type === 'area-generated') return { ...event, areaId: previous.areaId, areaLevel: previous.areaLevel };
    }
    return event;
  }
  return undefined;
}""")

replace_once('src/core/overlay-v2.test.ts', """    expect(event?.type).toBe('character-level');
    expect(event?.characterLevel).toBe(19);""", """    expect(event?.type).toBe('character-level');
    expect(event?.characterLevel).toBe(19);
    expect(event?.characterName).toBe('Stoffe');
    expect(event?.characterClass).toBe('Witch');""")
replace_once('src/core/overlay-v2.test.ts', """  it('finds the latest zone from a bounded log tail', () => {""", """  it('pairs an entered-area startup line with its preceding generated area identity', () => {
    const events = parseLogTail([
      '2026/09/01 18:00:00 [DEBUG Client] Generating level 1 area \"1_1_1\" with seed 1',
      '2026/09/01 18:00:01 [INFO Client] : You have entered Twilight Strand.',
    ].join('\\n'));
    expect(latestZoneEvent(events)).toMatchObject({ areaId: '1_1_1', areaName: 'Twilight Strand', areaLevel: 1 });
  });

  it('finds the latest zone from a bounded log tail', () => {""")

replace_once('electron/services/log-watcher.ts', """      const events = parseLogTail(buffer.subarray(0, bytesRead).toString('utf8'));
      const zone = latestZoneEvent(events);
      const level = [...events].reverse().find((event) => event.type === 'character-level')?.characterLevel;""", """      const events = parseLogTail(buffer.subarray(0, bytesRead).toString('utf8'));
      const zone = latestZoneEvent(events);
      const zoneIndex = zone ? [...events].map((event, index) => ({ event, index })).reverse().find(({ event }) => event.type === 'area-generated' || event.type === 'area-entered')?.index ?? -1 : -1;
      const levelEntry = [...events].map((event, index) => ({ event, index })).reverse().find(({ event }) => event.type === 'character-level');
      const levelEvent = levelEntry?.event;
      const level = levelEvent?.characterLevel;""")
replace_once('electron/services/log-watcher.ts', """          characterLevel: level,
          lastParsedEventAt: new Date().toISOString(),""", """          characterLevel: level,
          characterName: levelEntry && levelEntry.index > zoneIndex ? levelEvent?.characterName : undefined,
          characterClass: levelEntry && levelEntry.index > zoneIndex ? levelEvent?.characterClass : undefined,
          lastParsedEventAt: new Date().toISOString(),""")
replace_once('electron/services/log-watcher.ts', """      await this.hooks.onStartupZone?.(zone);""", """      const startupZone = zone && levelEntry && levelEntry.index > zoneIndex
        ? { ...zone, characterLevel: levelEvent?.characterLevel, characterName: levelEvent?.characterName, characterClass: levelEvent?.characterClass }
        : zone;
      await this.hooks.onStartupZone?.(startupZone);""")
replace_once('electron/services/log-watcher.ts', """            characterLevel: event.characterLevel ?? this.diagnostics.characterLevel,
            lastError: undefined,""", """            characterLevel: event.characterLevel ?? this.diagnostics.characterLevel,
            characterName: event.characterName ?? this.diagnostics.characterName,
            characterClass: event.characterClass ?? this.diagnostics.characterClass,
            lastError: undefined,""")

replace_once('electron/main.ts', """import { calculateXpGuidance } from '../src/core/xp';""", """import { calculateXpGuidance } from '../src/core/xp';
import {
  characterProfileById,
  characterProfileByName,
  createCharacterCampaignProfile,
  emptyCharacterCampaignDocument,
  isFreshCampaignStart,
  normalizeCharacterCampaignDocument,
  removeCharacterProfile,
  selectCharacterProfileForZone,
  upsertCharacterProfile,
  type CharacterCampaignDocument,
  type CharacterCampaignProfile,
} from '../src/core/character-campaign';""")
replace_once('electron/main.ts', """let characterLevel: number | undefined;
let recentAreaIds: string[] = [];""", """let characterLevel: number | undefined;
let characterCampaign: CharacterCampaignDocument = emptyCharacterCampaignDocument();
let activeCharacterProfileId = '';
let recentAreaIds: string[] = [];""")

replace_once('electron/main.ts', """async function saveLootFilterState(): Promise<void> { await store.write('loot-filter.json', lootFilter); }
async function saveSettings(): Promise<void> { await store.saveSettings(settings); }
async function saveProgress(): Promise<void> { await store.write('progress.json', { progress, history: progressHistory, updatedAt: new Date().toISOString() }); }
async function saveRunState(): Promise<void> { await store.write('run.json', { session: runSession, history: runHistory, updatedAt: new Date().toISOString() }); }
async function saveRewardConfirmations(): Promise<void> { await store.write('reward-audit.json', { confirmedStepIds: [...confirmedRewardStepIds], updatedAt: new Date().toISOString() }); }""", """async function saveLootFilterState(): Promise<void> { await store.write('loot-filter.json', lootFilter); }
async function saveSettings(): Promise<void> { await store.saveSettings(settings); }
function activeCharacterProfile(): CharacterCampaignProfile | undefined { return characterProfileById(characterCampaign, activeCharacterProfileId); }
function snapshotActiveCharacter(now = new Date().toISOString()): void {
  const active = activeCharacterProfile();
  if (!active) return;
  characterCampaign = upsertCharacterProfile(characterCampaign, {
    ...active,
    progress,
    history: progressHistory.slice(-80),
    confirmedRewardStepIds: [...confirmedRewardStepIds],
    lastAreaId: currentAreaId || active.lastAreaId,
    lastAreaName: currentZone || active.lastAreaName,
    characterLevel: characterLevel ?? active.characterLevel,
    updatedAt: now,
  });
}
async function saveCharacterCampaign(): Promise<void> {
  snapshotActiveCharacter();
  characterCampaign = { ...characterCampaign, activeProfileId: activeCharacterProfileId || undefined };
  await store.write('campaign-characters.json', characterCampaign);
}
async function saveProgress(): Promise<void> {
  await Promise.all([store.write('progress.json', { progress, history: progressHistory, updatedAt: new Date().toISOString() }), saveCharacterCampaign()]);
}
async function saveRunState(): Promise<void> { await store.write('run.json', { session: runSession, history: runHistory, updatedAt: new Date().toISOString() }); }
async function saveRewardConfirmations(): Promise<void> {
  await Promise.all([store.write('reward-audit.json', { confirmedStepIds: [...confirmedRewardStepIds], updatedAt: new Date().toISOString() }), saveCharacterCampaign()]);
}
async function writeActiveCharacterMirrors(): Promise<void> {
  await Promise.all([
    store.write('progress.json', { progress, history: progressHistory, updatedAt: new Date().toISOString() }),
    store.write('reward-audit.json', { confirmedStepIds: [...confirmedRewardStepIds], updatedAt: new Date().toISOString() }),
    store.write('campaign-characters.json', { ...characterCampaign, activeProfileId: activeCharacterProfileId || undefined }),
  ]);
}
async function activateCharacterProfile(profileId: string, reason: string): Promise<boolean> {
  if (!profileId || profileId === activeCharacterProfileId) return false;
  snapshotActiveCharacter();
  const target = characterProfileById(characterCampaign, profileId);
  if (!target) return false;
  activeCharacterProfileId = target.id;
  characterCampaign = { ...characterCampaign, activeProfileId: target.id };
  progress = target.progress;
  progressHistory = [...target.history];
  confirmedRewardStepIds = new Set(target.confirmedRewardStepIds);
  characterLevel = target.characterLevel;
  currentAreaId = '';
  currentZone = '';
  currentAreaLevel = undefined;
  recentAreaIds = [];
  recentAreaNames = [];
  startupReconciliation = { state: 'none' };
  runSession = emptyRunSession();
  await Promise.all([writeActiveCharacterMirrors(), saveRunState()]);
  sessionGuard?.update(progress, app.getVersion());
  log.info(`Activated campaign character profile ${target.characterName ?? target.id}: ${reason}`);
  return true;
}
async function beginFreshCharacterProfile(reason: string): Promise<void> {
  snapshotActiveCharacter();
  const now = new Date().toISOString();
  const id = `provisional:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const profile = createCharacterCampaignProfile(id, now, { provisional: true, progress: 0, history: [], confirmedRewardStepIds: [], characterLevel: 1 });
  characterCampaign = upsertCharacterProfile(characterCampaign, profile);
  activeCharacterProfileId = id;
  progress = 0;
  progressHistory = [];
  confirmedRewardStepIds = new Set();
  characterLevel = 1;
  currentAreaId = '';
  currentZone = '';
  currentAreaLevel = undefined;
  recentAreaIds = [];
  recentAreaNames = [];
  startupReconciliation = { state: 'none' };
  runSession = emptyRunSession();
  await Promise.all([writeActiveCharacterMirrors(), saveRunState()]);
  sessionGuard?.update(progress, app.getVersion());
  log.info(`Started a fresh campaign character profile: ${reason}`);
}
async function bindCharacterIdentity(event: ZoneEvent): Promise<void> {
  const name = event.characterName?.trim();
  if (!name) return;
  const active = activeCharacterProfile();
  if (active?.characterName?.toLocaleLowerCase() === name.toLocaleLowerCase()) {
    characterCampaign = upsertCharacterProfile(characterCampaign, { ...active, characterClass: event.characterClass ?? active.characterClass, characterLevel: event.characterLevel ?? active.characterLevel, provisional: false, updatedAt: new Date().toISOString() });
    return;
  }
  const existing = characterProfileByName(characterCampaign, name);
  if (existing && existing.id !== active?.id) {
    const provisionalId = active?.provisional ? active.id : undefined;
    await activateCharacterProfile(existing.id, `Client.txt identified ${name}${event.characterClass ? ` (${event.characterClass})` : ''}.`);
    if (provisionalId) characterCampaign = removeCharacterProfile(characterCampaign, provisionalId);
    const selected = activeCharacterProfile();
    if (selected) characterCampaign = upsertCharacterProfile(characterCampaign, { ...selected, characterClass: event.characterClass ?? selected.characterClass, characterLevel: event.characterLevel ?? selected.characterLevel, provisional: false, updatedAt: new Date().toISOString() });
    await writeActiveCharacterMirrors();
    return;
  }
  if (active) {
    characterCampaign = upsertCharacterProfile(characterCampaign, { ...active, characterName: name, characterClass: event.characterClass, characterLevel: event.characterLevel ?? active.characterLevel, provisional: false, updatedAt: new Date().toISOString() });
    await writeActiveCharacterMirrors();
    return;
  }
  const now = new Date().toISOString();
  const profile = createCharacterCampaignProfile(`character:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, now, { characterName: name, characterClass: event.characterClass, provisional: false, progress, history: progressHistory, confirmedRewardStepIds: [...confirmedRewardStepIds], lastAreaId: currentAreaId || undefined, lastAreaName: currentZone || undefined, characterLevel: event.characterLevel });
  characterCampaign = upsertCharacterProfile(characterCampaign, profile);
  activeCharacterProfileId = profile.id;
  await writeActiveCharacterMirrors();
}
function campaignEvent(event: ZoneEvent): boolean {
  if (event.areaId && dataset.areas.some((area) => area.id === event.areaId)) return true;
  const name = event.areaName?.toLowerCase().replace(/^the\\s+/, '').replace(/[.!]$/, '').trim();
  return Boolean(name && dataset.areas.some((area) => area.name.toLowerCase().replace(/^the\\s+/, '').trim() === name));
}
async function selectCharacterForZone(event: ZoneEvent, startup: boolean): Promise<void> {
  if (event.type === 'character-level') return;
  const effectiveEvent = { ...event, areaLevel: event.areaLevel ?? currentAreaLevel };
  if (isFreshCampaignStart(effectiveEvent)) {
    const active = activeCharacterProfile();
    const alreadyFresh = Boolean(active && active.progress <= 3 && (active.lastAreaId === '1_1_1' || (active.provisional && !active.lastAreaId)));
    if (!alreadyFresh) await beginFreshCharacterProfile(startup ? 'Detected Act 1 Twilight Strand during startup.' : 'Detected a new Act 1 Twilight Strand run.');
    return;
  }
  const selected = selectCharacterProfileForZone(characterCampaign, effectiveEvent, progressionSteps(), (step, index) => enabled(step), activeCharacterProfileId);
  if (selected && selected.id !== activeCharacterProfileId) await activateCharacterProfile(selected.id, `Zone ${event.areaId ?? event.areaName ?? 'unknown'} matched this saved character route.`);
}""")

replace_once('electron/main.ts', """  const savedProgress = await store.loadProgress(dataset.steps.length - 1);
  progress = savedProgress.progress;
  progressHistory = savedProgress.history;
  const knownRewardIds = new Set(dataset.steps.filter((step) => step.permanentReward).map((step) => step.id));
  confirmedRewardStepIds = await store.loadRewards(knownRewardIds);""", """  const savedProgress = await store.loadProgress(dataset.steps.length - 1);
  const knownRewardIds = new Set(dataset.steps.filter((step) => step.permanentReward).map((step) => step.id));
  const legacyRewards = await store.loadRewards(knownRewardIds);
  try { characterCampaign = normalizeCharacterCampaignDocument(await store.readUnknown('campaign-characters.json'), dataset.steps.length - 1, knownRewardIds); }
  catch { characterCampaign = emptyCharacterCampaignDocument(); }
  if (!characterCampaign.profiles.length) {
    const now = new Date().toISOString();
    const legacy = createCharacterCampaignProfile(`legacy:${Date.now()}`, now, {
      provisional: savedProgress.progress <= 3,
      progress: savedProgress.progress,
      history: savedProgress.history,
      confirmedRewardStepIds: [...legacyRewards],
    });
    characterCampaign = upsertCharacterProfile(characterCampaign, legacy);
  }
  const active = characterProfileById(characterCampaign, characterCampaign.activeProfileId) ?? characterCampaign.profiles[0];
  activeCharacterProfileId = active.id;
  characterCampaign = { ...characterCampaign, activeProfileId: active.id };
  progress = active.progress;
  progressHistory = [...active.history];
  confirmedRewardStepIds = new Set(active.confirmedRewardStepIds);
  characterLevel = active.characterLevel;
  await writeActiveCharacterMirrors();""")

replace_once('electron/main.ts', """async function handleZoneEvent(event: ZoneEvent): Promise<void> {
  const progressBefore = progress;""", """async function handleZoneEvent(event: ZoneEvent): Promise<void> {
  await selectCharacterForZone(event, false);
  if (event.type === 'character-level') await bindCharacterIdentity(event);
  const progressBefore = progress;""")
replace_once('electron/main.ts', """  appendDetectionTrace({ eventType: event.type, areaId: event.areaId, areaName: event.areaName, areaLevel: event.areaLevel, progressBefore, progressAfter: progress, stepIdBefore, stepIdAfter: dataset.steps[progress]?.id, confidence: decision?.confidence, reason, raw: event.raw });
  broadcastState();
  if (event.type !== 'character-level' && settings.autoShowOnZoneChange && overlayWindow && !overlayWindow.isVisible()) overlayWindow.showInactive();""", """  appendDetectionTrace({ eventType: event.type, areaId: event.areaId, areaName: event.areaName, areaLevel: event.areaLevel, progressBefore, progressAfter: progress, stepIdBefore, stepIdAfter: dataset.steps[progress]?.id, confidence: decision?.confidence, reason, raw: event.raw });
  await saveCharacterCampaign();
  broadcastState();
  if (event.type !== 'character-level' && settings.autoShowOnZoneChange && campaignEvent(event) && overlayWindow && !overlayWindow.isVisible()) overlayWindow.showInactive();""")
replace_once('electron/main.ts', """async function handleStartupZone(event: ZoneEvent | undefined): Promise<void> {
  if (!event) return;
  const progressBefore = progress;""", """async function handleStartupZone(event: ZoneEvent | undefined): Promise<void> {
  if (!event) return;
  await selectCharacterForZone(event, true);
  if (event.characterName) await bindCharacterIdentity(event);
  const progressBefore = progress;""")
replace_once('electron/main.ts', """  });
  broadcastState();
}
async function startLogWatcher(): Promise<void> {""", """  });
  await saveCharacterCampaign();
  broadcastState();
  if (settings.autoShowOnZoneChange && campaignEvent(event) && overlayWindow && !overlayWindow.isVisible()) overlayWindow.showInactive();
}
async function startLogWatcher(): Promise<void> {""")

print('Applied per-character campaign progress and startup overlay fixes.')
