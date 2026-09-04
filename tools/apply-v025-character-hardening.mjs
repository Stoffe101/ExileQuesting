import { readFile, writeFile, mkdir } from 'node:fs/promises';

async function text(path) { return readFile(path, 'utf8'); }
async function replaceOnce(path, before, after) {
  const current = await text(path);
  const count = current.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one replacement target, found ${count}`);
  await writeFile(path, current.replace(before, after), 'utf8');
}
async function append(path, value) { await writeFile(path, `${await text(path)}\n${value}\n`, 'utf8'); }

const characterCampaign = `import { normalizeProgressDocument } from './persistence';
import type { CampaignStep, CharacterIdentityConfidence, CharacterIdentitySource, ProgressHistoryEntry, ZoneEvent } from './types';

export const CHARACTER_CAMPAIGN_SCHEMA_VERSION = 2;
export const MAX_CHARACTER_CAMPAIGN_PROFILES = 64;

export interface CharacterCampaignProfile {
  id: string;
  runId: string;
  characterName?: string;
  characterClass?: string;
  leagueId?: string;
  provisional: boolean;
  freshStart: boolean;
  archived: boolean;
  supersededBy?: string;
  progress: number;
  history: ProgressHistoryEntry[];
  confirmedRewardStepIds: string[];
  buildProfileId?: string;
  lastAreaId?: string;
  lastAreaName?: string;
  characterLevel?: number;
  identitySource: CharacterIdentitySource;
  identityConfidence: CharacterIdentityConfidence;
  identityReason?: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface CharacterCampaignDocument {
  schemaVersion: typeof CHARACTER_CAMPAIGN_SCHEMA_VERSION;
  activeProfileId?: string;
  profiles: CharacterCampaignProfile[];
}

export interface CharacterProfileZoneMatch {
  profile: CharacterCampaignProfile;
  score: number;
  source: 'exact-zone' | 'route-match';
  reason: string;
}

type ProfileSeed = Partial<Omit<CharacterCampaignProfile, 'id' | 'runId' | 'createdAt' | 'updatedAt' | 'lastSeenAt'>> & { runId?: string };

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

function identitySource(value: unknown): CharacterIdentitySource {
  return ['fresh-start', 'self-level', 'named-level', 'exact-zone', 'route-match', 'manual', 'legacy', 'unknown'].includes(String(value))
    ? value as CharacterIdentitySource
    : 'unknown';
}

function identityConfidence(value: unknown): CharacterIdentityConfidence {
  return ['verified', 'inferred', 'manual', 'unknown'].includes(String(value))
    ? value as CharacterIdentityConfidence
    : 'unknown';
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
    runId: seed.runId?.trim() || id,
    characterName: seed.characterName?.trim() || undefined,
    characterClass: seed.characterClass?.trim() || undefined,
    leagueId: seed.leagueId?.trim() || undefined,
    provisional: seed.provisional ?? true,
    freshStart: seed.freshStart ?? false,
    archived: seed.archived ?? false,
    supersededBy: seed.supersededBy,
    progress: Math.max(0, Math.trunc(seed.progress ?? 0)),
    history: [...(seed.history ?? [])].slice(-80),
    confirmedRewardStepIds: [...new Set(seed.confirmedRewardStepIds ?? [])].slice(0, 256),
    buildProfileId: seed.buildProfileId,
    lastAreaId: seed.lastAreaId,
    lastAreaName: seed.lastAreaName,
    characterLevel: Number.isFinite(seed.characterLevel) ? Math.max(1, Math.trunc(seed.characterLevel!)) : undefined,
    identitySource: seed.identitySource ?? 'unknown',
    identityConfidence: seed.identityConfidence ?? 'unknown',
    identityReason: seed.identityReason,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
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
        const createdAt = timestamp(item.createdAt, epoch);
        const updatedAt = timestamp(item.updatedAt, createdAt);
        return [{
          id,
          runId: optionalString(item.runId, 512) ?? id,
          characterName: optionalString(item.characterName, 256),
          characterClass: optionalString(item.characterClass, 128),
          leagueId: optionalString(item.leagueId, 128),
          provisional: item.provisional === true,
          freshStart: item.freshStart === true,
          archived: item.archived === true,
          supersededBy: optionalString(item.supersededBy, 512),
          progress: normalizedProgress.progress,
          history: normalizedProgress.history,
          confirmedRewardStepIds: [...new Set(filteredRewards)].slice(0, 256),
          buildProfileId: optionalString(item.buildProfileId, 256),
          lastAreaId: optionalString(item.lastAreaId, 256),
          lastAreaName: optionalString(item.lastAreaName, 256),
          characterLevel: Number.isFinite(rawLevel) && rawLevel >= 1 && rawLevel <= 100 ? Math.trunc(rawLevel) : undefined,
          identitySource: identitySource(item.identitySource),
          identityConfidence: identityConfidence(item.identityConfidence),
          identityReason: optionalString(item.identityReason, 500),
          createdAt,
          updatedAt,
          lastSeenAt: timestamp(item.lastSeenAt, updatedAt),
        }];
      }).slice(-MAX_CHARACTER_CAMPAIGN_PROFILES)
    : [];
  const activeProfileId = optionalString(source?.activeProfileId, 512);
  const active = activeProfileId && profiles.some((profile) => profile.id === activeProfileId && !profile.archived)
    ? activeProfileId
    : profiles.find((profile) => !profile.archived)?.id;
  return { schemaVersion: CHARACTER_CAMPAIGN_SCHEMA_VERSION, activeProfileId: active, profiles };
}

export function characterProfileById(document: CharacterCampaignDocument, id?: string): CharacterCampaignProfile | undefined {
  return id ? document.profiles.find((profile) => profile.id === id) : undefined;
}

export function characterProfilesByName(document: CharacterCampaignDocument, name?: string, includeArchived = false): CharacterCampaignProfile[] {
  const normalized = normalizeCharacterName(name);
  if (!normalized) return [];
  return [...document.profiles]
    .filter((profile) => (includeArchived || !profile.archived) && normalizeCharacterName(profile.characterName) === normalized)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function characterProfileByName(document: CharacterCampaignDocument, name?: string): CharacterCampaignProfile | undefined {
  return characterProfilesByName(document, name)[0];
}

export function upsertCharacterProfile(document: CharacterCampaignDocument, profile: CharacterCampaignProfile): CharacterCampaignDocument {
  const profiles = [...document.profiles.filter((candidate) => candidate.id !== profile.id), profile]
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .slice(-MAX_CHARACTER_CAMPAIGN_PROFILES);
  return { ...document, schemaVersion: CHARACTER_CAMPAIGN_SCHEMA_VERSION, activeProfileId: profile.archived ? document.activeProfileId : profile.id, profiles };
}

export function archiveCharacterProfilesByName(document: CharacterCampaignDocument, name: string, exceptId: string, supersededBy: string, now: string): CharacterCampaignDocument {
  const normalized = normalizeCharacterName(name);
  if (!normalized) return document;
  return {
    ...document,
    profiles: document.profiles.map((profile) => profile.id !== exceptId && !profile.archived && normalizeCharacterName(profile.characterName) === normalized
      ? { ...profile, archived: true, supersededBy, updatedAt: now }
      : profile),
  };
}

export function removeCharacterProfile(document: CharacterCampaignDocument, id: string): CharacterCampaignDocument {
  const profiles = document.profiles.filter((profile) => profile.id !== id);
  const activeProfiles = profiles.filter((profile) => !profile.archived);
  return {
    ...document,
    profiles,
    activeProfileId: document.activeProfileId === id ? activeProfiles[0]?.id : document.activeProfileId,
  };
}

export function unlinkBuildProfile(document: CharacterCampaignDocument, buildProfileId: string, now: string): CharacterCampaignDocument {
  return {
    ...document,
    profiles: document.profiles.map((profile) => profile.buildProfileId === buildProfileId
      ? { ...profile, buildProfileId: undefined, updatedAt: now }
      : profile),
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

function profileZoneMatch(
  profile: CharacterCampaignProfile,
  event: Pick<ZoneEvent, 'areaId' | 'areaName' | 'areaLevel'>,
  steps: CampaignStep[],
  enabled: (step: CampaignStep, index: number) => boolean,
): CharacterProfileZoneMatch | undefined {
  if (profile.archived) return undefined;
  if (eventMatchesProfileArea(event, profile)) return { profile, score: 120, source: 'exact-zone', reason: 'Current zone exactly matches this character’s last saved area.' };
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < steps.length; index += 1) {
    if (!enabled(steps[index], index) || !eventMatchesStep(event, steps[index])) continue;
    nearest = Math.min(nearest, Math.abs(index - profile.progress));
  }
  let score = 0;
  if (nearest <= 4) score = 100 - nearest * 5;
  else if (nearest <= 12) score = 72 - nearest;
  else if (nearest <= 28) score = 44 - nearest;
  else if (isFreshCampaignStart(event) && profile.progress <= 3) score = 80;
  return score >= 44 ? { profile, score, source: 'route-match', reason: `Current zone is ${nearest} route step${nearest === 1 ? '' : 's'} from this saved character cursor.` } : undefined;
}

export function characterProfileMatchesForZone(
  document: CharacterCampaignDocument,
  event: Pick<ZoneEvent, 'areaId' | 'areaName' | 'areaLevel'>,
  steps: CampaignStep[],
  enabled: (step: CampaignStep, index: number) => boolean,
): CharacterProfileZoneMatch[] {
  return document.profiles
    .flatMap((profile) => {
      const match = profileZoneMatch(profile, event, steps, enabled);
      return match ? [match] : [];
    })
    .sort((left, right) => right.score - left.score || Date.parse(right.profile.updatedAt) - Date.parse(left.profile.updatedAt));
}

export function selectCharacterProfileForZone(
  document: CharacterCampaignDocument,
  event: Pick<ZoneEvent, 'areaId' | 'areaName' | 'areaLevel'>,
  steps: CampaignStep[],
  enabled: (step: CampaignStep, index: number) => boolean,
  currentProfileId?: string,
): CharacterCampaignProfile | undefined {
  const ranked = characterProfileMatchesForZone(document, event, steps, enabled);
  if (!ranked.length) return undefined;
  if (ranked[0].profile.id === currentProfileId) return ranked[0].profile;
  if (ranked[1] && ranked[0].score - ranked[1].score < 8 && ranked[1].profile.id !== currentProfileId) return undefined;
  return ranked[0].profile;
}
`;
await writeFile('src/core/character-campaign.ts', characterCampaign, 'utf8');

const characterTests = `import { describe, expect, it } from 'vitest';
import {
  archiveCharacterProfilesByName,
  characterProfileByName,
  characterProfileMatchesForZone,
  createCharacterCampaignProfile,
  emptyCharacterCampaignDocument,
  isFreshCampaignStart,
  normalizeCharacterCampaignDocument,
  selectCharacterProfileForZone,
  unlinkBuildProfile,
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

  it('archives an old same-name run so a recreated character cannot inherit it', () => {
    const old = createCharacterCampaignProfile('old', '2026-09-04T10:00:00.000Z', { characterName: 'ReusedName', progress: 3 });
    const fresh = createCharacterCampaignProfile('fresh', '2026-09-04T12:00:00.000Z', { freshStart: true, progress: 0 });
    let document = upsertCharacterProfile(upsertCharacterProfile(emptyCharacterCampaignDocument(), old), fresh);
    document = archiveCharacterProfilesByName(document, 'ReusedName', 'fresh', 'fresh', '2026-09-04T12:05:00.000Z');
    expect(document.profiles.find((profile) => profile.id === 'old')?.archived).toBe(true);
    expect(characterProfileByName(document, 'ReusedName')).toBeUndefined();
  });

  it('exposes ambiguous route candidates instead of silently guessing', () => {
    let document = emptyCharacterCampaignDocument();
    document = upsertCharacterProfile(document, createCharacterCampaignProfile('a', '2026-09-04T10:00:00.000Z', { progress: 2 }));
    document = upsertCharacterProfile(document, createCharacterCampaignProfile('b', '2026-09-04T11:00:00.000Z', { progress: 3 }));
    const matches = characterProfileMatchesForZone(document, { areaId: '2_7_1' }, steps, enabled);
    expect(matches.map((match) => match.profile.id)).toEqual(['a', 'b']);
    expect(selectCharacterProfileForZone(document, { areaId: '2_7_1' }, steps, enabled, 'missing')).toBeUndefined();
  });

  it('removes deleted build links without deleting character progress', () => {
    let document = upsertCharacterProfile(emptyCharacterCampaignDocument(), createCharacterCampaignProfile('x', '2026-09-04T10:00:00.000Z', { progress: 3, buildProfileId: 'build-a' }));
    document = unlinkBuildProfile(document, 'build-a', '2026-09-04T11:00:00.000Z');
    expect(document.profiles[0].progress).toBe(3);
    expect(document.profiles[0].buildProfileId).toBeUndefined();
  });

  it('migrates schema-one character documents and clamps malformed progress', () => {
    const document = normalizeCharacterCampaignDocument({
      schemaVersion: 1,
      activeProfileId: 'x',
      profiles: [{ id: 'x', progress: 9999, history: [], confirmedRewardStepIds: ['passive-ok', 'bad'], provisional: false, createdAt: 'bad', updatedAt: 'bad' }],
    }, 10, new Set(['passive-ok']));
    expect(document.schemaVersion).toBe(2);
    expect(document.profiles[0].progress).toBe(10);
    expect(document.profiles[0].confirmedRewardStepIds).toEqual(['passive-ok']);
    expect(document.profiles[0].runId).toBe('x');
  });
});
`;
await writeFile('src/core/character-campaign.test.ts', characterTests, 'utf8');

await replaceOnce('src/core/types.ts',
  "export type LayoutAuditStatus = 'verified' | 'reviewed' | 'unaudited' | 'outdated';",
  "export type LayoutAuditStatus = 'verified' | 'reviewed' | 'unaudited' | 'outdated';\nexport type CharacterIdentitySource = 'fresh-start' | 'self-level' | 'named-level' | 'exact-zone' | 'route-match' | 'manual' | 'legacy' | 'unknown';\nexport type CharacterIdentityConfidence = 'verified' | 'inferred' | 'manual' | 'unknown';"
);
await replaceOnce('src/core/types.ts',
`export interface AppUpdateState {`,
`export interface CampaignCharacterSummary {
  id: string;
  runId: string;
  characterName?: string;
  characterClass?: string;
  characterLevel?: number;
  leagueId?: string;
  progress: number;
  act?: number;
  provisional: boolean;
  freshStart: boolean;
  archived: boolean;
  buildProfileId?: string;
  buildProfileName?: string;
  identitySource: CharacterIdentitySource;
  identityConfidence: CharacterIdentityConfidence;
  identityReason?: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface CharacterTrackingState {
  activeProfileId?: string;
  active?: CampaignCharacterSummary;
  profiles: CampaignCharacterSummary[];
  ambiguity?: {
    areaId?: string;
    areaName?: string;
    candidateProfileIds: string[];
    reason: string;
  };
}

export interface AppUpdateState {`
);
await replaceOnce('src/core/types.ts',
`  characterLevel?: number;
  xpGuidance: XpGuidance;`,
`  characterLevel?: number;
  characterTracking: CharacterTrackingState;
  xpGuidance: XpGuidance;`
);
await replaceOnce('src/core/types.ts',
`  characterClass?: string;
  timestamp?: string;`,
`  characterClass?: string;
  identityScope?: 'self' | 'named';
  timestamp?: string;`
);

await replaceOnce('src/core/log-parser.ts',
`      characterLevel: Number(namedCharacterLevel[3]),
      timestamp: timestampFor(line),`,
`      characterLevel: Number(namedCharacterLevel[3]),
      identityScope: 'named',
      timestamp: timestampFor(line),`
);
await replaceOnce('src/core/log-parser.ts',
`      characterLevel: Number(youCharacterLevel[1]),
      timestamp: timestampFor(line),`,
`      characterLevel: Number(youCharacterLevel[1]),
      identityScope: 'self',
      timestamp: timestampFor(line),`
);
const parserTest = `import { describe, expect, it } from 'vitest';
import { parseClientLogLine } from './log-parser';

describe('Client.txt character identity scope', () => {
  it('marks named level-up lines as ambiguous observations rather than proof of self', () => {
    const event = parseClientLogLine('2026/09/04 19:00:00 123 [INFO Client 1234] PartyFriend (Witch) is now level 42');
    expect(event).toMatchObject({ type: 'character-level', characterName: 'PartyFriend', characterClass: 'Witch', characterLevel: 42, identityScope: 'named' });
  });

  it('marks explicit You level-up lines as self', () => {
    const event = parseClientLogLine('2026/09/04 19:00:00 123 [INFO Client 1234] You are now level 4');
    expect(event).toMatchObject({ type: 'character-level', characterLevel: 4, identityScope: 'self' });
  });
});
`;
await writeFile('src/core/log-parser-character.test.ts', parserTest, 'utf8');

await replaceOnce('electron/services/log-watcher.ts',
`          characterLevel: level,
          characterName: levelEntry && levelEntry.index > zoneIndex ? levelEvent?.characterName : undefined,
          characterClass: levelEntry && levelEntry.index > zoneIndex ? levelEvent?.characterClass : undefined,`,
`          characterLevel: levelEntry && levelEntry.index > zoneIndex && levelEvent?.identityScope === 'self' ? level : undefined,
          characterName: undefined,
          characterClass: undefined,`
);
await replaceOnce('electron/services/log-watcher.ts',
`      const startupZone = zone && levelEntry && levelEntry.index > zoneIndex
        ? { ...zone, characterLevel: levelEvent?.characterLevel, characterName: levelEvent?.characterName, characterClass: levelEvent?.characterClass }
        : zone;`,
`      const startupZone = zone && levelEntry && levelEntry.index > zoneIndex && levelEvent?.identityScope === 'self'
        ? { ...zone, characterLevel: levelEvent.characterLevel }
        : zone;`
);
await replaceOnce('electron/services/log-watcher.ts',
`            characterLevel: event.characterLevel ?? this.diagnostics.characterLevel,
            characterName: event.characterName ?? this.diagnostics.characterName,
            characterClass: event.characterClass ?? this.diagnostics.characterClass,`,
`            characterLevel: event.type !== 'character-level' || event.identityScope === 'self' ? event.characterLevel ?? this.diagnostics.characterLevel : this.diagnostics.characterLevel,
            characterName: event.identityScope === 'self' ? event.characterName ?? this.diagnostics.characterName : this.diagnostics.characterName,
            characterClass: event.identityScope === 'self' ? event.characterClass ?? this.diagnostics.characterClass : this.diagnostics.characterClass,`
);

await replaceOnce('electron/main.ts',
`  characterProfileById,
  characterProfileByName,
  createCharacterCampaignProfile,`,
`  archiveCharacterProfilesByName,
  characterProfileById,
  characterProfileMatchesForZone,
  createCharacterCampaignProfile,`
);
await replaceOnce('electron/main.ts',
`  selectCharacterProfileForZone,
  upsertCharacterProfile,`,
`  selectCharacterProfileForZone,
  unlinkBuildProfile,
  upsertCharacterProfile,`
);
await replaceOnce('electron/main.ts',
`let characterCampaign: CharacterCampaignDocument = emptyCharacterCampaignDocument();
let activeCharacterProfileId = '';`,
`let characterCampaign: CharacterCampaignDocument = emptyCharacterCampaignDocument();
let activeCharacterProfileId = '';
let characterAmbiguity: RuntimeState['characterTracking']['ambiguity'];`
);
await replaceOnce('electron/main.ts',
`function activeCharacterProfile(): CharacterCampaignProfile | undefined { return characterProfileById(characterCampaign, activeCharacterProfileId); }
function snapshotActiveCharacter(now = new Date().toISOString()): void {`,
`function activeCharacterProfile(): CharacterCampaignProfile | undefined { return characterProfileById(characterCampaign, activeCharacterProfileId); }
function linkedBuildProfile() {
  const buildProfileId = activeCharacterProfile()?.buildProfileId;
  return buildProfileId ? buildProfiles.find((profile) => profile.id === buildProfileId) : undefined;
}
function setActiveCharacterBuildProfile(buildProfileId?: string): void {
  const active = activeCharacterProfile();
  if (!active) return;
  const safeId = buildProfileId && buildProfiles.some((profile) => profile.id === buildProfileId) ? buildProfileId : undefined;
  characterCampaign = upsertCharacterProfile(characterCampaign, { ...active, buildProfileId: safeId, updatedAt: new Date().toISOString() });
}
function characterTrackingState(): RuntimeState['characterTracking'] {
  const profiles = [...characterCampaign.profiles].sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt)).map((profile) => {
    const build = profile.buildProfileId ? buildProfiles.find((candidate) => candidate.id === profile.buildProfileId) : undefined;
    return {
      id: profile.id,
      runId: profile.runId,
      characterName: profile.characterName,
      characterClass: profile.characterClass,
      characterLevel: profile.characterLevel,
      leagueId: profile.leagueId,
      progress: profile.progress,
      act: dataset.steps[Math.max(0, Math.min(profile.progress, dataset.steps.length - 1))]?.act,
      provisional: profile.provisional,
      freshStart: profile.freshStart,
      archived: profile.archived,
      buildProfileId: profile.buildProfileId,
      buildProfileName: build?.name,
      identitySource: profile.identitySource,
      identityConfidence: profile.identityConfidence,
      identityReason: profile.identityReason,
      updatedAt: profile.updatedAt,
      lastSeenAt: profile.lastSeenAt,
    };
  });
  return { activeProfileId: activeCharacterProfileId || undefined, active: profiles.find((profile) => profile.id === activeCharacterProfileId), profiles, ambiguity: characterAmbiguity };
}
function snapshotActiveCharacter(now = new Date().toISOString()): void {`
);
await replaceOnce('electron/main.ts',
`    characterLevel: characterLevel ?? active.characterLevel,
    updatedAt: now,`,
`    characterLevel: characterLevel ?? active.characterLevel,
    updatedAt: now,
    lastSeenAt: now,`
);

const oldActivate = `async function activateCharacterProfile(profileId: string, reason: string): Promise<boolean> {
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
  log.info(\`Activated campaign character profile \${target.characterName ?? target.id}: \${reason}\`);
  return true;
}
async function beginFreshCharacterProfile(reason: string): Promise<void> {
  snapshotActiveCharacter();
  const now = new Date().toISOString();
  const id = \`provisional:\${Date.now()}:\${Math.random().toString(36).slice(2, 8)}\`;
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
  log.info(\`Started a fresh campaign character profile: \${reason}\`);
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
    await activateCharacterProfile(existing.id, \`Client.txt identified \${name}\${event.characterClass ? \` (\${event.characterClass})\` : ''}.\`);
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
  const profile = createCharacterCampaignProfile(\`character:\${Date.now()}:\${Math.random().toString(36).slice(2, 8)}\`, now, { characterName: name, characterClass: event.characterClass, provisional: false, progress, history: progressHistory, confirmedRewardStepIds: [...confirmedRewardStepIds], lastAreaId: currentAreaId || undefined, lastAreaName: currentZone || undefined, characterLevel: event.characterLevel });
  characterCampaign = upsertCharacterProfile(characterCampaign, profile);
  activeCharacterProfileId = profile.id;
  await writeActiveCharacterMirrors();
}`;
const newActivate = `async function activateCharacterProfile(
  profileId: string,
  reason: string,
  source: CharacterCampaignProfile['identitySource'] = 'route-match',
  confidence: CharacterCampaignProfile['identityConfidence'] = 'inferred',
): Promise<boolean> {
  if (!profileId || profileId === activeCharacterProfileId) return false;
  snapshotActiveCharacter();
  const target = characterProfileById(characterCampaign, profileId);
  if (!target || target.archived) return false;
  const now = new Date().toISOString();
  const activated = { ...target, identitySource: source, identityConfidence: confidence, identityReason: reason, updatedAt: now, lastSeenAt: now };
  characterCampaign = upsertCharacterProfile(characterCampaign, activated);
  activeCharacterProfileId = activated.id;
  characterAmbiguity = undefined;
  progress = activated.progress;
  progressHistory = [...activated.history];
  confirmedRewardStepIds = new Set(activated.confirmedRewardStepIds);
  characterLevel = activated.characterLevel;
  currentAreaId = '';
  currentZone = '';
  currentAreaLevel = undefined;
  recentAreaIds = [];
  recentAreaNames = [];
  startupReconciliation = { state: 'none' };
  runSession = emptyRunSession();
  if (activated.buildProfileId && buildProfiles.some((profile) => profile.id === activated.buildProfileId)) {
    buildPlannerState = activateBuildProfile(buildPlannerState, buildProfiles, activated.buildProfileId);
  }
  rebuildBuildGuidance();
  await Promise.all([writeActiveCharacterMirrors(), saveRunState(), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);
  await refreshBuildLootFilter();
  sessionGuard?.update(progress, app.getVersion());
  log.info(\`Activated campaign character profile \${activated.characterName ?? activated.id}: \${reason}\`);
  return true;
}
async function beginFreshCharacterProfile(
  reason: string,
  source: CharacterCampaignProfile['identitySource'] = 'fresh-start',
  confidence: CharacterCampaignProfile['identityConfidence'] = 'verified',
): Promise<void> {
  snapshotActiveCharacter();
  const now = new Date().toISOString();
  const runId = \`run:\${Date.now()}:\${Math.random().toString(36).slice(2, 10)}\`;
  const id = \`provisional:\${runId}\`;
  const profile = createCharacterCampaignProfile(id, now, {
    runId, provisional: true, freshStart: true, progress: 0, history: [], confirmedRewardStepIds: [], characterLevel: 1,
    identitySource: source, identityConfidence: confidence, identityReason: reason,
  });
  characterCampaign = upsertCharacterProfile(characterCampaign, profile);
  activeCharacterProfileId = id;
  characterAmbiguity = undefined;
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
  rebuildBuildGuidance();
  await Promise.all([writeActiveCharacterMirrors(), saveRunState(), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);
  await refreshBuildLootFilter();
  sessionGuard?.update(progress, app.getVersion());
  log.info(\`Started a fresh campaign character profile: \${reason}\`);
}
async function bindCharacterIdentity(event: ZoneEvent): Promise<boolean> {
  const active = activeCharacterProfile();
  const now = new Date().toISOString();
  if (!active) return false;
  if (event.identityScope === 'self' && event.characterLevel) {
    characterLevel = event.characterLevel;
    characterCampaign = upsertCharacterProfile(characterCampaign, {
      ...active, characterLevel: event.characterLevel, identitySource: 'self-level', identityConfidence: 'verified',
      identityReason: 'Client.txt emitted an explicit self level-up event.', updatedAt: now, lastSeenAt: now,
    });
    return true;
  }
  const name = event.characterName?.trim();
  if (!name || event.identityScope !== 'named') return false;
  if (active.characterName?.toLocaleLowerCase() === name.toLocaleLowerCase()) {
    characterLevel = event.characterLevel ?? characterLevel;
    characterCampaign = upsertCharacterProfile(characterCampaign, {
      ...active, characterClass: event.characterClass ?? active.characterClass, characterLevel: event.characterLevel ?? active.characterLevel,
      provisional: false, identitySource: 'named-level', identityConfidence: 'inferred',
      identityReason: 'Named level-up matched the already tracked character.', updatedAt: now, lastSeenAt: now,
    });
    return true;
  }
  const plausibleFreshBind = active.freshStart && !active.characterName && active.progress <= 12
    && event.characterLevel !== undefined && event.characterLevel >= 2 && event.characterLevel <= 8
    && event.characterLevel <= (active.characterLevel ?? 1) + 1;
  if (!plausibleFreshBind) {
    log.info(\`Ignored named Client.txt level-up for \${name}; it is not proof of the active character.\`);
    return false;
  }
  characterCampaign = archiveCharacterProfilesByName(characterCampaign, name, active.id, active.id, now);
  const refreshed = characterProfileById(characterCampaign, active.id) ?? active;
  characterLevel = event.characterLevel;
  characterCampaign = upsertCharacterProfile(characterCampaign, {
    ...refreshed, characterName: name, characterClass: event.characterClass, characterLevel: event.characterLevel,
    provisional: false, identitySource: 'named-level', identityConfidence: 'inferred',
    identityReason: 'Low-level named event matched the protected fresh Act 1 run. Older same-name runs were archived.', updatedAt: now, lastSeenAt: now,
  });
  await writeActiveCharacterMirrors();
  return true;
}`;
await replaceOnce('electron/main.ts', oldActivate, newActivate);

await replaceOnce('electron/main.ts',
`async function selectCharacterForZone(event: ZoneEvent, startup: boolean): Promise<void> {
  if (event.type === 'character-level') return;
  const effectiveEvent = { ...event, areaLevel: event.areaLevel ?? currentAreaLevel };
  if (isFreshCampaignStart(effectiveEvent)) {
    const active = activeCharacterProfile();
    const alreadyFresh = Boolean(active && active.progress <= 3 && (active.lastAreaId === '1_1_1' || (active.provisional && !active.lastAreaId)));
    if (!alreadyFresh) await beginFreshCharacterProfile(startup ? 'Detected Act 1 Twilight Strand during startup.' : 'Detected a new Act 1 Twilight Strand run.');
    return;
  }
  const selected = selectCharacterProfileForZone(characterCampaign, effectiveEvent, progressionSteps(), (step, index) => enabled(step), activeCharacterProfileId);
  if (selected && selected.id !== activeCharacterProfileId) await activateCharacterProfile(selected.id, \`Zone \${event.areaId ?? event.areaName ?? 'unknown'} matched this saved character route.\`);
}`,
`async function selectCharacterForZone(event: ZoneEvent, startup: boolean): Promise<void> {
  if (event.type === 'character-level') return;
  const effectiveEvent = { ...event, areaLevel: event.areaLevel ?? currentAreaLevel };
  if (isFreshCampaignStart(effectiveEvent)) {
    const active = activeCharacterProfile();
    const alreadyFresh = Boolean(active && active.freshStart && active.progress <= 3 && (active.lastAreaId === '1_1_1' || (active.provisional && !active.lastAreaId)));
    if (!alreadyFresh) await beginFreshCharacterProfile(startup ? 'Detected a new Act 1 Twilight Strand run during startup.' : 'Detected a new Act 1 Twilight Strand run.');
    characterAmbiguity = undefined;
    return;
  }
  const steps = progressionSteps();
  const matches = characterProfileMatchesForZone(characterCampaign, effectiveEvent, steps, (step, index) => enabled(step));
  const selected = selectCharacterProfileForZone(characterCampaign, effectiveEvent, steps, (step, index) => enabled(step), activeCharacterProfileId);
  if (selected && selected.id !== activeCharacterProfileId) {
    const match = matches.find((candidate) => candidate.profile.id === selected.id);
    await activateCharacterProfile(selected.id, match?.reason ?? \`Zone \${event.areaId ?? event.areaName ?? 'unknown'} matched this saved character route.\`, match?.source ?? 'route-match', 'inferred');
    return;
  }
  if (!selected && matches.length >= 2 && matches[0].score - matches[1].score < 8) {
    characterAmbiguity = {
      areaId: event.areaId,
      areaName: event.areaName,
      candidateProfileIds: matches.slice(0, 4).map((match) => match.profile.id),
      reason: 'Multiple saved characters fit this zone almost equally well. ExileQuesting refused to guess.',
    };
  } else if (selected) characterAmbiguity = undefined;
}`
);

await replaceOnce('electron/main.ts',
`function rebuildBuildGuidance(): void {
  buildPlannerState = normalizeBuildPlannerState(buildPlannerState, buildProfiles);
  campaignIntelligence = buildCampaignIntelligence(dataset);
  const activeProfile = buildProfiles.find((profile) => profile.id === buildPlannerState.activeProfileId);`,
`function rebuildBuildGuidance(): void {
  buildPlannerState = normalizeBuildPlannerState(buildPlannerState, buildProfiles);
  campaignIntelligence = buildCampaignIntelligence(dataset);
  const activeProfile = linkedBuildProfile();`
);
await replaceOnce('electron/main.ts',
`    planner: buildPlannerSnapshot(buildProfiles, buildPlannerState),`,
`    planner: { ...buildPlannerSnapshot(buildProfiles, buildPlannerState), activeProfileId: activeCharacterProfile()?.buildProfileId },`
);
await replaceOnce('electron/main.ts',
`    settings, dataset: activeDataset, sourceStatus, progress, currentZone: currentZone || undefined, currentAreaId: currentAreaId || undefined, currentAreaLevel, characterLevel,
    xpGuidance: xpGuidance(),`,
`    settings, dataset: activeDataset, sourceStatus, progress, currentZone: currentZone || undefined, currentAreaId: currentAreaId || undefined, currentAreaLevel, characterLevel,
    characterTracking: characterTrackingState(), xpGuidance: xpGuidance(),`
);

await replaceOnce('electron/main.ts',
`    const legacy = createCharacterCampaignProfile(\`legacy:\${Date.now()}\`, now, {
      provisional: savedProgress.progress <= 3,
      progress: savedProgress.progress,
      history: savedProgress.history,
      confirmedRewardStepIds: [...legacyRewards],
    });`,
`    const legacy = createCharacterCampaignProfile(\`legacy:\${Date.now()}\`, now, {
      provisional: savedProgress.progress <= 3,
      freshStart: false,
      progress: savedProgress.progress,
      history: savedProgress.history,
      confirmedRewardStepIds: [...legacyRewards],
      buildProfileId: buildPlannerState.activeProfileId,
      identitySource: 'legacy',
      identityConfidence: 'unknown',
      identityReason: 'Migrated from the pre-character-aware global campaign save.',
    });`
);
await replaceOnce('electron/main.ts',
`  const active = characterProfileById(characterCampaign, characterCampaign.activeProfileId) ?? characterCampaign.profiles[0];
  activeCharacterProfileId = active.id;`,
`  let active = characterProfileById(characterCampaign, characterCampaign.activeProfileId) ?? characterCampaign.profiles.find((profile) => !profile.archived) ?? characterCampaign.profiles[0];
  if (!active.buildProfileId && characterCampaign.profiles.filter((profile) => !profile.archived).length === 1 && buildPlannerState.activeProfileId) {
    active = { ...active, buildProfileId: buildPlannerState.activeProfileId, updatedAt: new Date().toISOString() };
    characterCampaign = upsertCharacterProfile(characterCampaign, active);
  }
  activeCharacterProfileId = active.id;`
);

await replaceOnce('electron/main.ts',
`function updateCurrentArea(event: ZoneEvent): void {
  if (event.areaId) { currentAreaId = event.areaId; currentAreaLevel = event.areaLevel ?? currentAreaLevel; currentZone = dataset.areas.find((area) => area.id === event.areaId)?.name ?? currentZone; }
  if (event.areaName) currentZone = event.areaName;
  if (event.areaLevel) currentAreaLevel = event.areaLevel;
  if (event.characterLevel) characterLevel = event.characterLevel;
}`,
`function updateCurrentArea(event: ZoneEvent): void {
  if (event.areaId) { currentAreaId = event.areaId; currentAreaLevel = event.areaLevel ?? currentAreaLevel; currentZone = dataset.areas.find((area) => area.id === event.areaId)?.name ?? currentZone; }
  if (event.areaName) currentZone = event.areaName;
  if (event.areaLevel) currentAreaLevel = event.areaLevel;
  if (event.characterLevel && (event.type !== 'character-level' || event.identityScope === 'self')) characterLevel = event.characterLevel;
}`
);
await replaceOnce('electron/main.ts',
`async function handleZoneEvent(event: ZoneEvent): Promise<void> {
  await selectCharacterForZone(event, false);
  if (event.type === 'character-level') await bindCharacterIdentity(event);
  const progressBefore = progress;`,
`async function handleZoneEvent(event: ZoneEvent): Promise<void> {
  await selectCharacterForZone(event, false);
  const acceptedCharacterLevel = event.type === 'character-level' ? await bindCharacterIdentity(event) : false;
  const progressBefore = progress;`
);
await replaceOnce('electron/main.ts',
`  if (event.type === 'character-level') {
    rebuildBuildGuidance();
    await store.saveBuildPlanner(buildPlannerState, buildProfiles);
  }`,
`  if (event.type === 'character-level' && acceptedCharacterLevel) {
    rebuildBuildGuidance();
    await store.saveBuildPlanner(buildPlannerState, buildProfiles);
  }`
);
await replaceOnce('electron/main.ts',
`  const reason = event.type === 'character-level' ? \`Character level updated to \${event.characterLevel ?? '?'}.\`
    : !settings.autoAdvance ? 'Automatic route progress is disabled.' : decision ? decision.reason : 'No bounded campaign transition matched this event.';`,
`  const reason = event.type === 'character-level'
    ? acceptedCharacterLevel ? \`Accepted active-character level update to \${event.characterLevel ?? '?'}.\` : \`Ignored named level-up for \${event.characterName ?? 'another player'}; it did not prove active-character identity.\`
    : !settings.autoAdvance ? 'Automatic route progress is disabled.' : decision ? decision.reason : 'No bounded campaign transition matched this event.';`
);

await replaceOnce('electron/main.ts',
`  if (event.characterName) await bindCharacterIdentity(event);`,
`  if (event.characterName || event.identityScope === 'self') await bindCharacterIdentity(event);`
);

await replaceOnce('electron/main.ts',
`  const activeProfile = buildProfiles.find((profile) => profile.id === buildPlannerState.activeProfileId);
  if (!activeProfile) throw new Error('Select or import a Build Profile before using Gear Coach.');`,
`  const activeProfile = linkedBuildProfile();
  if (!activeProfile) throw new Error('Select or import a Build Profile for the active character before using Gear Coach.');`
);
await replaceOnce('electron/main.ts',
`  buildPlannerState = activateBuildProfile(buildPlannerState, buildProfiles, profile.id);
  rebuildBuildGuidance();
  await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);`,
`  buildPlannerState = activateBuildProfile(buildPlannerState, buildProfiles, profile.id);
  setActiveCharacterBuildProfile(profile.id);
  rebuildBuildGuidance();
  await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles), saveCharacterCampaign()]);`
);
await replaceOnce('electron/main.ts',
`    buildPlannerState = activateBuildProfile(buildPlannerState, buildProfiles, id);
    rebuildBuildGuidance();
    await store.saveBuildPlanner(buildPlannerState, buildProfiles);`,
`    buildPlannerState = activateBuildProfile(buildPlannerState, buildProfiles, id);
    setActiveCharacterBuildProfile(id);
    rebuildBuildGuidance();
    await Promise.all([store.saveBuildPlanner(buildPlannerState, buildProfiles), saveCharacterCampaign()]);`
);
await replaceOnce('electron/main.ts',
`    buildProfiles = buildProfiles.filter((profile) => profile.id !== id);
    buildPlannerState = normalizeBuildPlannerState(buildPlannerState, buildProfiles);
    rebuildBuildGuidance();
    await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);`,
`    buildProfiles = buildProfiles.filter((profile) => profile.id !== id);
    characterCampaign = unlinkBuildProfile(characterCampaign, id, new Date().toISOString());
    buildPlannerState = normalizeBuildPlannerState(buildPlannerState, buildProfiles);
    rebuildBuildGuidance();
    await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles), saveCharacterCampaign()]);`
);

await replaceOnce('electron/main.ts',
`  ipcMain.handle('campaign:check', async () => { await checkCampaignUpdates(); return runtimeState(); });`,
`  ipcMain.handle('campaign:check', async () => { await checkCampaignUpdates(); return runtimeState(); });
  ipcMain.handle('character:activate', async (_event, id: unknown) => {
    if (typeof id !== 'string' || id.length > 512) return runtimeState();
    await activateCharacterProfile(id, 'Selected manually from Character Profiles.', 'manual', 'manual');
    broadcastState();
    return runtimeState();
  });
  ipcMain.handle('character:start-new', async () => {
    await beginFreshCharacterProfile('Started manually from Character Profiles.', 'manual', 'manual');
    broadcastState();
    return runtimeState();
  });
  ipcMain.handle('character:reset', async (_event, id: unknown) => {
    if (typeof id !== 'string' || id.length > 512) return runtimeState();
    if (id !== activeCharacterProfileId) await activateCharacterProfile(id, 'Selected for manual campaign reset.', 'manual', 'manual');
    const active = activeCharacterProfile();
    if (!active) return runtimeState();
    const now = new Date().toISOString();
    const reset = { ...active, runId: \`manual-run:\${Date.now()}\`, progress: 0, history: [], confirmedRewardStepIds: [], freshStart: false, provisional: !active.characterName, identitySource: 'manual' as const, identityConfidence: 'manual' as const, identityReason: 'Campaign progress reset manually by the user.', updatedAt: now, lastSeenAt: now };
    characterCampaign = upsertCharacterProfile(characterCampaign, reset);
    progress = 0; progressHistory = []; confirmedRewardStepIds = new Set(); characterAmbiguity = undefined; runSession = emptyRunSession();
    await Promise.all([writeActiveCharacterMirrors(), saveRunState()]);
    sessionGuard?.update(progress, app.getVersion());
    broadcastState();
    return runtimeState();
  });
  ipcMain.handle('character:delete', async (_event, id: unknown) => {
    if (typeof id !== 'string' || id.length > 512) return runtimeState();
    const deletingActive = id === activeCharacterProfileId;
    characterCampaign = removeCharacterProfile(characterCampaign, id);
    if (deletingActive) {
      activeCharacterProfileId = '';
      const next = [...characterCampaign.profiles].filter((profile) => !profile.archived).sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt))[0];
      if (next) await activateCharacterProfile(next.id, 'Previous character profile was deleted; restored the most recently seen profile.', 'manual', 'manual');
      else await beginFreshCharacterProfile('Created an empty profile after deleting the final character.', 'manual', 'manual');
    } else await saveCharacterCampaign();
    broadcastState();
    return runtimeState();
  });`
);

await replaceOnce('electron/main.ts',
`    \`Zone: \${state.currentZone ?? 'unknown'} (\${state.currentAreaId ?? 'no-id'})\`, \`Character/Area: \${state.characterLevel ?? '?'} / \${state.currentAreaLevel ?? '?'}\`,`,
`    \`Zone: \${state.currentZone ?? 'unknown'} (\${state.currentAreaId ?? 'no-id'})\`, \`Character/Area: \${state.characterLevel ?? '?'} / \${state.currentAreaLevel ?? '?'}\`,
    \`Tracking profile: \${state.characterTracking.active?.characterName ?? state.characterTracking.active?.id ?? 'unknown'}; source=\${state.characterTracking.active?.identitySource ?? 'unknown'}; confidence=\${state.characterTracking.active?.identityConfidence ?? 'unknown'}; run=\${state.characterTracking.active?.runId ?? 'unknown'}; build=\${state.characterTracking.active?.buildProfileName ?? 'none'}\`,`
);

await replaceOnce('electron/preload.ts',
`  checkCampaignUpdates: (): Promise<RuntimeState> => ipcRenderer.invoke('campaign:check'),`,
`  checkCampaignUpdates: (): Promise<RuntimeState> => ipcRenderer.invoke('campaign:check'),
  activateCharacterProfile: (id: string): Promise<RuntimeState> => ipcRenderer.invoke('character:activate', id),
  startNewCharacterProfile: (): Promise<RuntimeState> => ipcRenderer.invoke('character:start-new'),
  resetCharacterProfile: (id: string): Promise<RuntimeState> => ipcRenderer.invoke('character:reset', id),
  deleteCharacterProfile: (id: string): Promise<RuntimeState> => ipcRenderer.invoke('character:delete', id),`
);

const characterUi = `import type { RuntimeState } from '../core/types';
import './character-profiles.css';

export default function CharacterProfiles({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  const tracking = state.characterTracking;
  const active = tracking.active;
  const candidates = tracking.ambiguity?.candidateProfileIds.map((id) => tracking.profiles.find((profile) => profile.id === id)).filter(Boolean) ?? [];
  const liveProfiles = tracking.profiles.filter((profile) => !profile.archived);
  const archived = tracking.profiles.filter((profile) => profile.archived);
  const label = (profile: typeof tracking.profiles[number]) => profile.characterName ?? (profile.provisional ? 'New character · awaiting identity' : 'Unnamed character');
  const switchTo = (id: string) => void window.exileQuesting.activateCharacterProfile(id).then(setState);
  const reset = (id: string, name: string) => { if (window.confirm(\`Reset campaign progress for \${name}? Build linkage is kept.\`)) void window.exileQuesting.resetCharacterProfile(id).then(setState); };
  const remove = (id: string, name: string) => { if (window.confirm(\`Delete the ExileQuesting profile for \${name}? This does not delete anything in Path of Exile.\`)) void window.exileQuesting.deleteCharacterProfile(id).then(setState); };

  return <div className="page custom-scrollbar character-page">
    <div className="page-heading"><div><span className="eyebrow">CHARACTER CONTINUITY</span><h1>Character Profiles</h1><p>Campaign cursor, permanent rewards and build context follow the character instead of one global save.</p></div><button className="primary-button" onClick={() => void window.exileQuesting.startNewCharacterProfile().then(setState)}>Start new profile</button></div>
    {tracking.ambiguity && <section className="panel character-ambiguity"><span className="eyebrow">IDENTITY CHECK</span><h2>ExileQuesting refused to guess.</h2><p>{tracking.ambiguity.reason} Choose the character you are actually playing, or start a new profile.</p><div className="character-actions">{candidates.map((profile) => profile && <button key={profile.id} className="ghost-button" onClick={() => switchTo(profile.id)}>{label(profile)} · Act {profile.act ?? '?'}</button>)}<button className="primary-button" onClick={() => void window.exileQuesting.startNewCharacterProfile().then(setState)}>This is a new character</button></div></section>}
    {active && <section className="panel active-character-card"><div><span className="eyebrow">TRACKING NOW</span><h2>{label(active)}</h2><p>{active.characterClass ?? 'Class pending'} · Lv {active.characterLevel ?? '?'} · Act {active.act ?? '?'} · Step {active.progress + 1}</p></div><div className="character-proof"><span>{active.identityConfidence}</span><strong>{active.identitySource.replace('-', ' ')}</strong><small>{active.identityReason ?? 'Waiting for stronger Client.txt evidence.'}</small></div><div className="character-build"><span>Build</span><strong>{active.buildProfileName ?? 'No build linked'}</strong><small>{active.buildProfileName ? 'Switching back to this character restores this build context.' : 'Selecting/importing a build while this character is active links it here.'}</small></div></section>}
    <section className="character-grid">{liveProfiles.map((profile) => <article className={`panel character-card ${profile.id === tracking.activeProfileId ? 'active' : ''}`} key={profile.id}><header><div><span>{profile.characterClass ?? 'Unknown class'}</span><h3>{label(profile)}</h3></div>{profile.id === tracking.activeProfileId && <b>ACTIVE</b>}</header><dl><dt>Level</dt><dd>{profile.characterLevel ?? '?'}</dd><dt>Campaign</dt><dd>Act {profile.act ?? '?'} · step {profile.progress + 1}</dd><dt>Build</dt><dd>{profile.buildProfileName ?? 'None'}</dd><dt>Identity</dt><dd>{profile.identitySource} · {profile.identityConfidence}</dd><dt>Last seen</dt><dd>{new Date(profile.lastSeenAt).toLocaleString()}</dd></dl><div className="character-actions">{profile.id !== tracking.activeProfileId && <button className="primary-button" onClick={() => switchTo(profile.id)}>Switch</button>}<button className="ghost-button" onClick={() => reset(profile.id, label(profile))}>Reset campaign</button><button className="ghost-button danger" onClick={() => remove(profile.id, label(profile))}>Delete</button></div><small className="run-id">Run {profile.runId}</small></article>)}</section>
    {archived.length > 0 && <details className="panel archived-characters"><summary>Archived / superseded runs ({archived.length})</summary>{archived.map((profile) => <div key={profile.id}><span>{label(profile)}</span><small>Act {profile.act ?? '?'} · superseded character-name run · {new Date(profile.lastSeenAt).toLocaleString()}</small><button className="ghost-button danger" onClick={() => remove(profile.id, label(profile))}>Delete archived profile</button></div>)}</details>}
  </div>;
}
`;
await writeFile('src/ui/CharacterProfiles.tsx', characterUi, 'utf8');
const characterCss = `.character-page{display:flex;flex-direction:column;gap:16px}.character-ambiguity{border-color:rgba(255,190,70,.45);background:linear-gradient(135deg,rgba(255,178,43,.08),rgba(17,20,26,.94))}.active-character-card{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:18px;align-items:center}.active-character-card h2{margin:5px 0}.character-proof,.character-build{display:flex;flex-direction:column;gap:4px}.character-proof span,.character-build span{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.character-proof strong{text-transform:capitalize}.character-proof small,.character-build small{color:var(--muted)}.character-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.character-card{display:flex;flex-direction:column;gap:14px}.character-card.active{border-color:rgba(92,214,158,.5)}.character-card header{display:flex;justify-content:space-between;gap:12px}.character-card header span{font-size:11px;color:var(--muted);text-transform:uppercase}.character-card header h3{margin:3px 0 0}.character-card header b{font-size:10px;color:#78d9aa}.character-card dl{display:grid;grid-template-columns:auto 1fr;gap:7px 12px;margin:0}.character-card dt{color:var(--muted)}.character-card dd{margin:0;text-align:right;overflow-wrap:anywhere}.character-actions{display:flex;gap:8px;flex-wrap:wrap}.ghost-button.danger{color:#ef9696}.run-id{color:var(--muted);opacity:.6;overflow-wrap:anywhere}.archived-characters summary{cursor:pointer}.archived-characters>div{display:grid;grid-template-columns:1fr 1.5fr auto;gap:12px;align-items:center;padding:10px 0;border-top:1px solid var(--border)}@media(max-width:900px){.active-character-card{grid-template-columns:1fr}.archived-characters>div{grid-template-columns:1fr}}`;
await writeFile('src/ui/character-profiles.css', characterCss, 'utf8');

await replaceOnce('src/ui/CommandPalette.tsx',
`export type AppTab = 'overview' | 'guide' | 'build' | 'knowledge' | 'settings' | 'diagnostics';`,
`export type AppTab = 'overview' | 'guide' | 'characters' | 'build' | 'knowledge' | 'settings' | 'diagnostics';`
);
await replaceOnce('src/ui/CommandPalette.tsx',
`      { id: 'build', label: 'Open Build & Build Doctor', detail: state.buildCoach?.profileName ?? 'Import or inspect a build', keywords: 'pob maxroll doctor gear upgrade passive gems', run: () => onNavigate('build') },`,
`      { id: 'characters', label: 'Open Character Profiles', detail: state.characterTracking.active?.characterName ?? 'Character continuity and recovery', keywords: 'character profile switch alt resume campaign identity', run: () => onNavigate('characters') },
      { id: 'build', label: 'Open Build & Build Doctor', detail: state.buildCoach?.profileName ?? 'Import or inspect a build', keywords: 'pob maxroll doctor gear upgrade passive gems', run: () => onNavigate('build') },`
);

await replaceOnce('src/ui/ManagerV2.tsx',
`import CampaignGuideV2 from './CampaignGuideV2';`,
`import CampaignGuideV2 from './CampaignGuideV2';
import CharacterProfiles from './CharacterProfiles';`
);
await replaceOnce('src/ui/ManagerV2.tsx',
`  { id: 'guide', label: 'Campaign', icon: '◇' },
  { id: 'build', label: 'Build', icon: '⬡' },`,
`  { id: 'guide', label: 'Campaign', icon: '◇' },
  { id: 'characters', label: 'Characters', icon: '◉' },
  { id: 'build', label: 'Build', icon: '⬡' },`
);
await replaceOnce('src/ui/ManagerV2.tsx',
`function Diagnostics({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  const step = state.dataset.steps[state.progress];`,
`function Diagnostics({ state, setState }: { state: RuntimeState; setState: (state: RuntimeState) => void }) {
  const step = state.dataset.steps[state.progress];
  const tracked = state.characterTracking.active;`
);
await replaceOnce('src/ui/ManagerV2.tsx',
`<dt>Character / area</dt><dd>{state.characterLevel ?? '?'} / {state.currentAreaLevel ?? '?'}</dd></dl></section>`,
`<dt>Character / area</dt><dd>{state.characterLevel ?? '?'} / {state.currentAreaLevel ?? '?'}</dd><dt>Tracked profile</dt><dd>{tracked?.characterName ?? tracked?.id ?? 'Unknown'}</dd><dt>Identity proof</dt><dd>{tracked ? \`${tracked.identitySource} · ${tracked.identityConfidence}\` : 'None'}</dd><dt>Linked build</dt><dd>{tracked?.buildProfileName ?? 'None'}</dd></dl>{tracked?.identityReason && <p className="source-message">{tracked.identityReason}</p>}</section>`
);
await replaceOnce('src/ui/ManagerV2.tsx',
`<span>{state.logConnected ? \`Tracking \${state.currentZone ?? 'zone changes'}\` : 'Manual campaign tracking'}</span>`,
`<span>{state.logConnected ? state.characterTracking.active ? \`Tracking \${state.characterTracking.active.characterName ?? 'new character'} · Lv \${state.characterTracking.active.characterLevel ?? '?'} · Act \${state.characterTracking.active.act ?? '?'}\` : \`Tracking \${state.currentZone ?? 'zone changes'}\` : 'Manual campaign tracking'}</span>`
);
await replaceOnce('src/ui/ManagerV2.tsx',
`{tab === 'guide' && <CampaignGuideV2 state={state} setState={setState} onOpenPassive={() => setPassivePlanOpen(true)} />}{tab === 'build' && <BuildWorkspace />}`,
`{tab === 'guide' && <CampaignGuideV2 state={state} setState={setState} onOpenPassive={() => setPassivePlanOpen(true)} />}{tab === 'characters' && <CharacterProfiles state={state} setState={setState} />}{tab === 'build' && <BuildWorkspace />}`
);

const stageRuntime = `import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  POB_KERNEL_BUNDLE_SCHEMA_VERSION,
  POB_KERNEL_COMMIT,
  POB_KERNEL_CRITICAL_FILES,
  POB_KERNEL_LUAJIT_COMMIT,
  POB_KERNEL_LUAJIT_REPOSITORY,
  POB_KERNEL_REPOSITORY,
  type PobKernelBundleManifest,
} from '../electron/services/pob-runtime';

interface Arguments { pobRoot: string; luaJitRoot: string; output: string; }
const MAX_HEADLESS_BUNDLE_BYTES = 240 * 1024 * 1024;
const HEAVY_ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.svg', '.ttf', '.otf']);

function argumentValue(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function parseArguments(): Arguments {
  const pobRoot = argumentValue('--pob-root'); const luaJitRoot = argumentValue('--luajit-root'); const output = argumentValue('--output') ?? '.pob-runtime';
  if (!pobRoot || !luaJitRoot) throw new Error('Usage: stage-pob-runtime --pob-root <pinned PoB checkout> --luajit-root <pinned built LuaJIT checkout> [--output .pob-runtime]');
  return { pobRoot: path.resolve(pobRoot), luaJitRoot: path.resolve(luaJitRoot), output: path.resolve(output) };
}
function gitHead(root: string): string { return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(); }
async function requireFile(filePath: string, label: string): Promise<void> { const item = await stat(filePath).catch(() => null); if (!item?.isFile()) throw new Error(\`${label} is missing: \${filePath}\`); }
function sha256(buffer: Buffer): string { return createHash('sha256').update(buffer).digest('hex'); }
async function filesRecursively(root: string, relative = ''): Promise<string[]> {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true }); const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) { const child = path.posix.join(relative.replaceAll('\\\\', '/'), entry.name); if (entry.isDirectory()) files.push(...await filesRecursively(root, child)); else if (entry.isFile()) files.push(child); }
  return files;
}
async function bundleStats(root: string): Promise<{ fileCount: number; totalBytes: number; treeSha256: string }> {
  const files = (await filesRecursively(root)).filter((file) => file !== 'manifest.json').sort(); const tree = createHash('sha256'); let totalBytes = 0;
  for (const relative of files) { const buffer = await readFile(path.join(root, ...relative.split('/'))); totalBytes += buffer.length; tree.update(relative, 'utf8'); tree.update('\\0'); tree.update(String(buffer.length), 'utf8'); tree.update('\\0'); tree.update(sha256(buffer), 'utf8'); tree.update('\\n'); }
  return { fileCount: files.length, totalBytes, treeSha256: tree.digest('hex') };
}
async function criticalFileMetadata(root: string): Promise<PobKernelBundleManifest['criticalFiles']> {
  const result = {} as PobKernelBundleManifest['criticalFiles'];
  for (const [key, relative] of Object.entries(POB_KERNEL_CRITICAL_FILES) as Array<[keyof typeof POB_KERNEL_CRITICAL_FILES, string]>) { const buffer = await readFile(path.join(root, ...relative.split('/'))); result[key] = { path: relative, size: buffer.length, sha256: sha256(buffer) }; }
  return result;
}
function adapterVersion(workerText: string, label: string): string { const version = workerText.match(/ADAPTER_VERSION\\s*=\\s*["']([^"']+)["']/)?.[1]; if (!version) throw new Error(\`Could not determine the staged \${label} adapter version.\`); return version; }
async function copyHeadlessSource(source: string, destination: string): Promise<void> {
  await cp(source, destination, { recursive: true, force: true, filter: (candidate) => {
    const relative = path.relative(source, candidate).replaceAll('\\\\', '/');
    if (!relative) return true;
    if (relative === 'Assets' || relative.startsWith('Assets/')) return false;
    return !HEAVY_ASSET_EXTENSIONS.has(path.extname(candidate).toLowerCase());
  } });
}
async function copyIfPresent(source: string, destination: string): Promise<void> { if ((await stat(source).catch(() => null))?.isFile()) await cp(source, destination, { force: true }); }

async function main(): Promise<void> {
  const args = parseArguments(); const actualPobCommit = gitHead(args.pobRoot); const actualLuaJitCommit = gitHead(args.luaJitRoot);
  if (actualPobCommit !== POB_KERNEL_COMMIT) throw new Error(\`PoB pin mismatch: expected \${POB_KERNEL_COMMIT}, got \${actualPobCommit}.\`);
  if (actualLuaJitCommit !== POB_KERNEL_LUAJIT_COMMIT) throw new Error(\`LuaJIT pin mismatch: expected \${POB_KERNEL_LUAJIT_COMMIT}, got \${actualLuaJitCommit}.\`);
  const luaJitExe = path.join(args.luaJitRoot, 'src', 'luajit.exe'); const lua51Dll = path.join(args.luaJitRoot, 'src', 'lua51.dll');
  const worker = path.resolve('tools', 'pob-kernel', 'worker.lua'); const constraintWorker = path.resolve('tools', 'pob-kernel', 'constraint-worker.lua');
  const pobLicense = path.join(args.pobRoot, 'LICENSE.md'); const luaJitLicense = path.join(args.luaJitRoot, 'COPYRIGHT');
  for (const [file, label] of [[luaJitExe, 'Built LuaJIT executable'], [lua51Dll, 'Built LuaJIT lua51.dll'], [worker, 'ExileQuesting PoB worker'], [constraintWorker, 'ExileQuesting PoB constraint worker'], [pobLicense, 'Path of Building license'], [luaJitLicense, 'LuaJIT license']] as const) await requireFile(file, label);

  await rm(args.output, { recursive: true, force: true });
  const pobDest = path.join(args.output, 'pob'); const runtimeDest = path.join(pobDest, 'runtime');
  await mkdir(runtimeDest, { recursive: true }); await mkdir(path.join(args.output, 'licenses'), { recursive: true }); await mkdir(path.join(args.output, 'smoke'), { recursive: true });
  await copyHeadlessSource(path.join(args.pobRoot, 'src'), path.join(pobDest, 'src'));
  await cp(path.join(args.pobRoot, 'runtime', 'lua'), path.join(runtimeDest, 'lua'), { recursive: true, force: true });
  for (const runtimeFile of ['lua-utf8.dll', 'lzip.dll', 'zlib1.dll', 'zstd.dll']) await copyIfPresent(path.join(args.pobRoot, 'runtime', runtimeFile), path.join(runtimeDest, runtimeFile));
  await cp(luaJitExe, path.join(runtimeDest, 'luajit.exe'), { force: true }); await cp(lua51Dll, path.join(runtimeDest, 'lua51.dll'), { force: true });
  await cp(worker, path.join(args.output, 'worker.lua'), { force: true }); await cp(constraintWorker, path.join(args.output, 'constraint-worker.lua'), { force: true });
  await cp(pobLicense, path.join(args.output, 'licenses', 'PathOfBuilding-LICENSE.md'), { force: true }); await cp(luaJitLicense, path.join(args.output, 'licenses', 'LuaJIT-COPYRIGHT'), { force: true });
  await cp(path.join(args.pobRoot, 'spec', 'TestBuilds', '3.13', 'OccVortex.xml'), path.join(args.output, 'smoke', 'OccVortex.xml'), { force: true });

  for (const [key, relative] of Object.entries(POB_KERNEL_CRITICAL_FILES)) await requireFile(path.join(args.output, ...relative.split('/')), \`Staged critical file \${key}\`);
  const workerText = await readFile(path.join(args.output, 'worker.lua'), 'utf8'); const constraintWorkerText = await readFile(path.join(args.output, 'constraint-worker.lua'), 'utf8');
  const aggregate = await bundleStats(args.output);
  if (aggregate.totalBytes > MAX_HEADLESS_BUNDLE_BYTES) throw new Error(\`Headless PoB bundle grew to \${aggregate.totalBytes} bytes, above the \${MAX_HEADLESS_BUNDLE_BYTES}-byte release budget.\`);
  const manifest: PobKernelBundleManifest = { schemaVersion: POB_KERNEL_BUNDLE_SCHEMA_VERSION, generatedAt: new Date().toISOString(), pobRepository: POB_KERNEL_REPOSITORY, pobCommit: actualPobCommit, luaJitRepository: POB_KERNEL_LUAJIT_REPOSITORY, luaJitCommit: actualLuaJitCommit, workerAdapterVersion: adapterVersion(workerText, 'PoB worker'), constraintAdapterVersion: adapterVersion(constraintWorkerText, 'PoB constraint worker'), ...aggregate, criticalFiles: await criticalFileMetadata(args.output) };
  await writeFile(path.join(args.output, 'manifest.json'), \`${JSON.stringify(manifest, null, 2)}\\n\`, 'utf8');
  console.log(\`Staged HEADLESS pinned PoB kernel \${actualPobCommit.slice(0, 12)} / LuaJIT \${actualLuaJitCommit.slice(0, 12)}.\`);
  console.log(\`Bundle: \${manifest.fileCount} files, \${manifest.totalBytes} bytes, tree SHA-256 \${manifest.treeSha256}.\`);
  console.log(\`Removed PoB GUI imagery/runtime; bundle budget \${MAX_HEADLESS_BUNDLE_BYTES} bytes.\`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
`;
await writeFile('tools/stage-pob-runtime.ts', stageRuntime, 'utf8');

await replaceOnce('tools/smoke-pob-runtime.ts',
`import path from 'node:path';`,
`import path from 'node:path';
import { readFile } from 'node:fs/promises';`
);
await replaceOnce('tools/smoke-pob-runtime.ts',
`  if (constraintKernel.protocolVersion !== POB_CONSTRAINT_PROTOCOL_VERSION) throw new Error(\`Packaged constraint protocol mismatch: \${constraintKernel.protocolVersion}.\`);

  console.log(\`PoB runtime health PASS:`,
`  if (constraintKernel.protocolVersion !== POB_CONSTRAINT_PROTOCOL_VERSION) throw new Error(\`Packaged constraint protocol mismatch: \${constraintKernel.protocolVersion}.\`);

  const smokeXml = await readFile(path.join(root, 'smoke', 'OccVortex.xml'), 'utf8');
  const calculationResponse = await runPobKernelRequest({
    protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
    requestId: \`packaged-calculation-\${process.pid}\`,
    operation: 'load-and-calculate',
    xml: smokeXml,
    scenario: { scenario: 'imported', label: 'Headless bundle calculation smoke' },
  }, pobKernelRuntimeOptions(bundle));
  if (!calculationResponse.ok || !('result' in calculationResponse)) throw new Error('Headless PoB bundle initialized but failed a real load-and-calculate smoke.');
  const result = calculationResponse.result;
  if (!Number.isFinite(result.defence.life) || (result.defence.life ?? 0) <= 0) throw new Error('Headless PoB calculation smoke returned no valid life value.');

  console.log(\`PoB runtime health PASS:`
);
await replaceOnce('tools/smoke-pob-runtime.ts',
`  console.log(\`PoB constraint health PASS: adapter=\${constraintKernel.adapterVersion}.\`);`,
`  console.log(\`PoB constraint health PASS: adapter=\${constraintKernel.adapterVersion}.\`);
  console.log(\`PoB real calculation PASS: life=\${result.defence.life}, DPS=\${result.offence.totalDps ?? 'n/a'}.\`);`
);

await replaceOnce('RELEASE_NOTES.md',
`# ExileQuesting v0.2.5`,
`# ExileQuesting v0.2.5

## Character continuity hardening

- Campaign progress, reward confirmations and build context are now character-bound rather than global.
- A protected fresh-run generation prevents deleted/reused character names from inheriting an older run.
- Named Client.txt level-up lines are treated as ambiguous observations unless they match the already tracked character or a tightly bounded fresh Act 1 bind; party members cannot silently switch profiles.
- Character Profiles exposes active identity confidence/provenance, manual switching, ambiguity recovery, per-character reset/delete controls, and archived superseded runs.
- Selecting/importing a PoB or Maxroll build links it to the active character so Passive Plan, gem guidance, Gear Coach and Build Doctor return with that character.

## Smaller Windows package

- The bundled Path of Building kernel is now staged as a headless calculation runtime instead of embedding PoB's full GUI image/runtime payload.
- Historical calculation data is retained, while GUI images and unrelated desktop runtime binaries are excluded.
- A hard bundle-size budget plus a real load-and-calculate smoke test protects both installer size and Build Doctor correctness.`
);

console.log('v0.2.5 character hardening + headless PoB packaging patch applied.');
