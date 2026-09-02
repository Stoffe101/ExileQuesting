import { describe, expect, it } from 'vitest';
import type { GearCoachAnalysis, GearCoachVerdict } from './gear-coach';
import { compareGearAnalyses } from './gear-comparison';
import type { PoeGearSlot, PoeItemStats } from './item-text';

const zeroStats: PoeItemStats = {
  maximumLife: 0,
  maximumMana: 0,
  fireResistance: 0,
  coldResistance: 0,
  lightningResistance: 0,
  chaosResistance: 0,
  allElementalResistance: 0,
  strength: 0,
  dexterity: 0,
  intelligence: 0,
  allAttributes: 0,
  movementSpeed: 0,
  attackSpeed: 0,
  castSpeed: 0,
  increasedDamage: 0,
  gemLevels: 0,
  armour: 0,
  evasion: 0,
  energyShield: 0,
  ward: 0,
};

function analysis(options: {
  name: string;
  slot?: PoeGearSlot;
  score: number;
  verdict?: GearCoachVerdict;
  stats?: Partial<PoeItemStats>;
  maxLinks?: number;
}): GearCoachAnalysis {
  const slot = options.slot ?? 'boots';
  const maxLinks = options.maxLinks ?? 4;
  return {
    item: {
      raw: options.name,
      rarity: 'Rare',
      name: options.name,
      baseType: `${options.name} Base`,
      slot,
      requirements: {},
      sockets: maxLinks,
      maxLinks,
      corrupted: false,
      mirrored: false,
      unidentified: false,
      stats: { ...zeroStats, ...options.stats },
      modifierLines: [],
    },
    score: options.score,
    verdict: options.verdict ?? 'good',
    headline: 'Fixture analysis',
    reasons: [],
    repairHints: [],
    lookFor: [],
  };
}

describe('Gear Coach equipped comparison', () => {
  it('marks a materially stronger same-slot candidate as an upgrade and exposes useful deltas', () => {
    const equipped = analysis({
      name: 'Old Pace',
      score: 52,
      stats: { maximumLife: 40, fireResistance: 20, coldResistance: 20, movementSpeed: 20, evasion: 90 },
    });
    const candidate = analysis({
      name: 'Storm Pace',
      score: 76,
      stats: { maximumLife: 70, fireResistance: 30, coldResistance: 30, lightningResistance: 20, movementSpeed: 25, evasion: 130 },
    });

    const result = compareGearAnalyses(candidate, equipped);
    expect(result.verdict).toBe('upgrade');
    expect(result.scoreDelta).toBe(24);
    expect(result.deltas.find((item) => item.key === 'life')?.delta).toBe(30);
    expect(result.deltas.find((item) => item.key === 'elemental-resistance')?.delta).toBe(40);
    expect(result.deltas.find((item) => item.key === 'movement-speed')?.delta).toBe(5);
    expect(result.reasons.some((reason) => /improves by 24/i.test(reason.label))).toBe(true);
  });

  it('keeps close trade-offs as sidegrades instead of inventing certainty', () => {
    const equipped = analysis({
      name: 'Safe Pace',
      score: 60,
      stats: { maximumLife: 70, fireResistance: 30, coldResistance: 30, lightningResistance: 30, movementSpeed: 20 },
    });
    const candidate = analysis({
      name: 'Fast Pace',
      score: 64,
      stats: { maximumLife: 55, fireResistance: 40, coldResistance: 40, lightningResistance: 40, movementSpeed: 25 },
    });

    const result = compareGearAnalyses(candidate, equipped);
    expect(result.verdict).toBe('sidegrade');
    expect(result.reasons[0].label).toMatch(/stat trade/i);
    expect(result.deltas.some((item) => item.tone === 'positive')).toBe(true);
    expect(result.deltas.some((item) => item.tone === 'negative')).toBe(true);
  });

  it('refuses to make upgrade claims across different gear slots', () => {
    const equipped = analysis({ name: 'Old Helm', slot: 'helmet', score: 45 });
    const candidate = analysis({ name: 'New Boots', slot: 'boots', score: 90 });

    const result = compareGearAnalyses(candidate, equipped);
    expect(result.verdict).toBe('different-slot');
    expect(result.deltas).toHaveLength(0);
    expect(result.reasons[0].tone).toBe('warning');
  });

  it('keeps an unusable higher-scoring candidate in the future category', () => {
    const equipped = analysis({ name: 'Old Pace', score: 50 });
    const candidate = analysis({ name: 'Future Pace', score: 92, verdict: 'future', stats: { maximumLife: 100, movementSpeed: 30 } });

    const result = compareGearAnalyses(candidate, equipped);
    expect(result.verdict).toBe('future');
    expect(result.scoreDelta).toBe(42);
    expect(result.reasons[0].label).toMatch(/cannot be equipped/i);
  });
});
