import { describe, expect, it } from 'vitest';
import {
  candidateItemLabel,
  readyCandidateItemAnalysis,
  unavailableCandidateItemAnalysis,
} from './build-doctor-candidate-item';
import type { PobCalculationResult, PobPerturbationComparison } from './pob-calculation';

const kernel = {
  protocolVersion: 1,
  pobRepository: 'PathOfBuildingCommunity/PathOfBuilding',
  pobCommit: 'ed354c2f8c42e148bc904c7508dbe851fb2cf952',
  runtime: 'LuaJIT 2.1',
  runtimeRevision: '2460b3ff93a1c955de3d62cfc825de7d68dc272e',
  adapterVersion: '0.6.0',
};

function result(requestId: string, patch: Partial<PobCalculationResult> = {}): PobCalculationResult {
  return {
    protocolVersion: 1,
    requestId,
    kernel,
    scenario: { scenario: 'imported' },
    offence: { totalDps: 5_000_000, critChance: 70 },
    defence: {
      effectiveHitPool: 120_000,
      life: 4_000,
      energyShield: 1_000,
      mana: 900,
      armour: 20_000,
      evasion: 10_000,
      spellSuppressionChance: 100,
      fireResistance: 75,
      coldResistance: 75,
      lightningResistance: 75,
      chaosResistance: 20,
      fireResistanceOverCap: 35,
      coldResistanceOverCap: 30,
      lightningResistanceOverCap: 25,
      chaosResistanceOverCap: 0,
      maximumHit: { physical: 30_000, fire: 55_000, cold: 55_000, lightning: 55_000, chaos: 25_000 },
      totalNetRecovery: 1_500,
    },
    warnings: [],
    elapsedMs: 20,
    ...patch,
  };
}

function comparison(before: PobCalculationResult, after: PobCalculationResult): PobPerturbationComparison {
  return {
    perturbations: [{ kind: 'replace-item', slot: 'Boots', itemText: 'Rarity: Rare\nStorm Pace\nSharkskin Boots' }],
    before,
    after,
  };
}

describe('Build Doctor candidate item analysis', () => {
  it('preserves exact PoB before/after values across reviewed endgame metrics', () => {
    const before = result('before');
    const after = result('after', {
      offence: { totalDps: 5_750_000, critChance: 70 },
      defence: {
        ...before.defence,
        life: 4_200,
        fireResistanceOverCap: 12,
        spellSuppressionChance: 92,
        maximumHit: { ...before.defence.maximumHit, physical: 33_000 },
      },
    });
    const analysis = readyCandidateItemAnalysis({
      profileId: 'profile',
      profileName: 'Endgame build',
      generatedAt: '2026-09-03T12:00:00.000Z',
      slot: 'Boots',
      candidateLabel: 'Storm Pace · Sharkskin Boots',
      comparison: comparison(before, after),
    });

    expect(analysis.status).toBe('ready');
    expect(analysis.kernel.adapterVersion).toBe('0.6.0');
    expect(analysis.changedMetrics.find((entry) => entry.key === 'damage')).toMatchObject({ before: 5_000_000, after: 5_750_000, relativeChangePercent: 15 });
    expect(analysis.changedMetrics.find((entry) => entry.key === 'life')).toMatchObject({ before: 4_000, after: 4_200, absoluteChange: 200 });
    expect(analysis.changedMetrics.find((entry) => entry.key === 'spell-suppression')).toMatchObject({ before: 100, after: 92, absoluteChange: -8 });
    expect(analysis.changedMetrics.find((entry) => entry.key === 'fire-overcap')).toMatchObject({ before: 35, after: 12, absoluteChange: -23 });
    expect(analysis.changedMetrics.find((entry) => entry.key === 'physical-max-hit')).toMatchObject({ before: 30_000, after: 33_000 });
  });

  it('does not invent a relative change percentage from a zero baseline', () => {
    const before = result('before', { defence: { ...result('x').defence, ward: 0 } });
    const after = result('after', { defence: { ...before.defence, ward: 500 } });
    const analysis = readyCandidateItemAnalysis({
      profileId: 'profile', profileName: 'Build', generatedAt: '2026-09-03T12:00:00.000Z', slot: 'Boots', candidateLabel: 'Candidate', comparison: comparison(before, after),
    });
    expect(analysis.metrics.find((entry) => entry.key === 'ward')).toMatchObject({ before: 0, after: 500, absoluteChange: 500, relativeChangePercent: undefined });
  });

  it('rejects a comparison whose perturbation does not match the requested slot', () => {
    const bad = comparison(result('before'), result('after'));
    bad.perturbations = [{ kind: 'replace-item', slot: 'Helmet', itemText: 'Rarity: Rare\nHat\nHubris Circlet' }];
    expect(() => readyCandidateItemAnalysis({
      profileId: 'profile', profileName: 'Build', generatedAt: '2026-09-03T12:00:00.000Z', slot: 'Boots', candidateLabel: 'Candidate', comparison: bad,
    })).toThrow(/does not match/i);
  });

  it('rejects changed kernel provenance instead of comparing unlike calculations', () => {
    const after = result('after');
    after.kernel = { ...kernel, adapterVersion: 'different' };
    expect(() => readyCandidateItemAnalysis({
      profileId: 'profile', profileName: 'Build', generatedAt: '2026-09-03T12:00:00.000Z', slot: 'Boots', candidateLabel: 'Candidate', comparison: comparison(result('before'), after),
    })).toThrow(/kernel provenance/i);
  });

  it('extracts a bounded human label without making item-quality claims', () => {
    expect(candidateItemLabel('Item Class: Boots\nRarity: Rare\nStorm Pace\nSharkskin Boots\n--------\n+80 to maximum Life')).toBe('Storm Pace · Sharkskin Boots');
    expect(candidateItemLabel('unstructured')).toBe('Pasted candidate item');
  });

  it('states the unresolved transition constraints rather than presenting the item as a verified upgrade package', () => {
    const analysis = readyCandidateItemAnalysis({
      profileId: 'profile', profileName: 'Build', generatedAt: '2026-09-03T12:00:00.000Z', slot: 'Boots', candidateLabel: 'Candidate', comparison: comparison(result('before'), result('after')),
    });
    expect(analysis.boundary).toMatch(/requirements/i);
    expect(analysis.boundary).toMatch(/reservation/i);
    expect(analysis.boundary).toMatch(/trade cost/i);
    expect(analysis.boundary).toMatch(/coordinated/i);
    expect(analysis.boundary).not.toMatch(/best|bis|score|recommended/i);
  });

  it('normalizes unavailable errors without fabricating metrics', () => {
    const unavailable = unavailableCandidateItemAnalysis({ profileId: 'profile', profileName: 'Build', status: 'failed', slot: 'Boots', message: '  Candidate   rejected.  ' });
    expect(unavailable.status).toBe('failed');
    expect(unavailable.message).toBe('Candidate rejected.');
    expect('metrics' in unavailable).toBe(false);
  });
});
