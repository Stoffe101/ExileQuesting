import { normalizeProgressDocument } from './persistence';
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
