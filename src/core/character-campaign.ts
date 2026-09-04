import { normalizeProgressDocument } from './persistence';
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
  return value?.toLowerCase().replace(/^the\s+/, '').replace(/[.!]$/, '').trim();
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
  return score >= 44 ? { profile, score, source: 'route-match', reason: 'Current zone is ' + nearest + ' route step' + (nearest === 1 ? '' : 's') + ' from this saved character cursor.' } : undefined;
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
  // If two non-current candidates are close, or the current profile is the
  // runner-up, the zone alone is not enough evidence to switch characters.
  // Failing closed is safer than letting a revisit/party transition steal the
  // active campaign cursor.
  if (ranked[1] && ranked[0].score - ranked[1].score < 8) return undefined;
  return ranked[0].profile;
}
