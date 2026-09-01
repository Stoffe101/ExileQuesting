import type { XpGuidance } from './types';

export function experienceSafeZone(characterLevel: number): number {
  return Math.floor(3 + characterLevel / 16);
}

export function calculateXpGuidance(characterLevel?: number, areaLevel?: number): XpGuidance {
  if (!characterLevel || !areaLevel) {
    return { characterLevel, areaLevel, pace: 'unknown', message: 'Waiting for level data.' };
  }

  const safeZone = experienceSafeZone(characterLevel);
  const delta = areaLevel - characterLevel;
  if (delta > safeZone) {
    return {
      characterLevel, areaLevel, pace: 'behind', delta, safeZone,
      message: 'Behind: kill dense normal packs and valuable magic packs while moving.',
    };
  }
  if (-delta > safeZone) {
    return {
      characterLevel, areaLevel, pace: 'overlevelled', delta, safeZone,
      message: 'Overlevelled: skip most normal packs and keep moving.',
    };
  }
  return {
    characterLevel, areaLevel, pace: 'efficient', delta, safeZone,
    message: 'Efficient XP range: keep moving and take good-density packs.',
  };
}
