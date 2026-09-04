import { describe, expect, it } from 'vitest';
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

  it('restores a clearly different saved character only from unique exact-zone evidence', () => {
    const restoreSteps = [
      { id: 'start', targetAreaId: '1_1_1', targetArea: 'Twilight Strand' },
      { id: 'coast', targetAreaId: '1_1_2', targetArea: 'The Coast' },
      ...Array.from({ length: 32 }, (_, index) => ({ id: `middle-${index}`, targetAreaId: `middle-${index}`, targetArea: `Middle ${index}` })),
      { id: 'act7-a', targetAreaId: '2_7_1', targetArea: 'The Broken Bridge' },
      { id: 'act7-b', targetAreaId: '2_7_2', targetArea: 'The Crossroads' },
    ] as CampaignStep[];
    const act7Index = restoreSteps.findIndex((step) => step.targetAreaId === '2_7_1');
    const now = '2026-09-04T12:00:00.000Z';
    let document = emptyCharacterCampaignDocument();
    document = upsertCharacterProfile(document, createCharacterCampaignProfile('act7', now, {
      characterName: 'OldMapper', provisional: false, progress: act7Index, lastAreaId: '2_7_1', characterLevel: 55,
    }));
    document = upsertCharacterProfile(document, createCharacterCampaignProfile('new', '2026-09-04T13:00:00.000Z', {
      characterName: 'FreshWitch', provisional: false, progress: 1, lastAreaId: '1_1_2', characterLevel: 3,
    }));
    expect(characterProfileByName(document, 'OldMapper')?.progress).toBe(act7Index);
    expect(characterProfileByName(document, 'FreshWitch')?.progress).toBe(1);
    expect(selectCharacterProfileForZone(document, { areaId: '2_7_1' }, restoreSteps, enabled, 'new')?.id).toBe('act7');
    expect(selectCharacterProfileForZone(document, { areaId: '1_1_2' }, restoreSteps, enabled, 'act7')?.id).toBe('new');
  });

  it('keeps a confirmed active character sticky against another profile winning only by route proximity', () => {
    let document = emptyCharacterCampaignDocument();
    document = upsertCharacterProfile(document, createCharacterCampaignProfile('candidate', '2026-09-04T10:00:00.000Z', {
      provisional: false, progress: 2, characterName: 'OtherCharacter', identitySource: 'manual', identityConfidence: 'manual',
    }));
    document = upsertCharacterProfile(document, createCharacterCampaignProfile('current', '2026-09-04T11:00:00.000Z', {
      provisional: false, progress: 0, characterName: 'CurrentCharacter', identitySource: 'manual', identityConfidence: 'manual',
    }));
    const matches = characterProfileMatchesForZone(document, { areaId: '2_7_1' }, steps, enabled);
    expect(matches[0].profile.id).toBe('candidate');
    expect(matches[0].source).toBe('route-match');
    expect(selectCharacterProfileForZone(document, { areaId: '2_7_1' }, steps, enabled, 'current')?.id).toBe('current');
  });

  it('keeps a newly detected fresh run sticky against generic nearby route matches', () => {
    let document = emptyCharacterCampaignDocument();
    document = upsertCharacterProfile(document, createCharacterCampaignProfile('candidate', '2026-09-04T10:00:00.000Z', { progress: 2 }));
    document = upsertCharacterProfile(document, createCharacterCampaignProfile('fresh', '2026-09-04T11:00:00.000Z', {
      provisional: true, freshStart: true, progress: 0, identitySource: 'fresh-start', identityConfidence: 'verified',
    }));
    expect(selectCharacterProfileForZone(document, { areaId: '2_7_1' }, steps, enabled, 'fresh')?.id).toBe('fresh');
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

  it('fails closed when another provisional profile barely outranks the current profile', () => {
    let document = emptyCharacterCampaignDocument();
    document = upsertCharacterProfile(document, createCharacterCampaignProfile('candidate', '2026-09-04T10:00:00.000Z', { progress: 2 }));
    document = upsertCharacterProfile(document, createCharacterCampaignProfile('current', '2026-09-04T11:00:00.000Z', { progress: 3 }));
    const matches = characterProfileMatchesForZone(document, { areaId: '2_7_1' }, steps, enabled);
    expect(matches[0].profile.id).toBe('candidate');
    expect(matches[1].profile.id).toBe('current');
    expect(matches[0].score - matches[1].score).toBeLessThan(8);
    expect(selectCharacterProfileForZone(document, { areaId: '2_7_1' }, steps, enabled, 'current')).toBeUndefined();
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
