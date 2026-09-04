import { describe, expect, it } from 'vitest';
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
