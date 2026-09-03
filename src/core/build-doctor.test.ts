import { describe, expect, it } from 'vitest';
import { readyBuildDoctorSnapshot, unavailableBuildDoctorSnapshot } from './build-doctor';
import type { PobCalculationResult, PobConstraintMetrics, PobFlaskInspectionResult } from './pob-calculation';

const baseline: PobCalculationResult = {
  protocolVersion: 1,
  requestId: 'doctor-baseline',
  kernel: {
    protocolVersion: 1,
    pobRepository: 'PathOfBuildingCommunity/PathOfBuilding',
    pobCommit: 'ed354c2f8c42e148bc904c7508dbe851fb2cf952',
    runtime: 'LuaJIT 2.1',
    runtimeRevision: '2460b3ff93a1c955de3d62cfc825de7d68dc272e',
    adapterVersion: '0.6.0',
  },
  scenario: { scenario: 'imported' },
  offence: { totalDps: 1_250_000, critChance: 87.5 },
  defence: { life: 4_200, effectiveHitPool: 83_000, maximumHit: { physical: 18_000 } },
  warnings: [{ code: 'guard-skill-active', message: 'Guard is active.', confidence: 'verified' }],
  elapsedMs: 20,
};

const constraintKernel = {
  pobRepository: baseline.kernel.pobRepository,
  pobCommit: baseline.kernel.pobCommit,
  runtime: baseline.kernel.runtime,
  runtimeRevision: baseline.kernel.runtimeRevision,
  adapterVersion: 'constraint-0.2.0',
};

function integrityMetrics(): PobConstraintMetrics {
  return {
    attributes: {
      strength: { current: 160, required: 155 },
      dexterity: { current: 180, required: 160 },
      intelligence: { current: 220, required: 200 },
    },
    reservation: { manaUnreserved: 120, manaUnreservedPercent: 10, lifeUnreserved: 4_200, lifeUnreservedPercent: 100 },
    spellSuppression: { chance: 82, effectiveChance: 82, overCap: 0, cap: 100 },
    resistances: {
      fire: { current: 75, total: 105, overCap: 30, missing: 0 },
      cold: { current: 75, total: 95, overCap: 20, missing: 0 },
      lightning: { current: 75, total: 90, overCap: 15, missing: 0 },
      chaos: { current: 20, total: 20, overCap: 0, missing: 55 },
    },
  };
}

const flasks: PobFlaskInspectionResult = {
  protocolVersion: 1,
  requestId: 'doctor-flasks',
  kernel: baseline.kernel,
  scenario: { scenario: 'imported' },
  emptyFlaskSlots: 3,
  flasks: [
    {
      slot: 'Flask 1', name: 'Granite Flask', baseName: 'Granite Flask', rarity: 'MAGIC', active: true,
      life: false, mana: false, utility: true, local: { duration: 4 },
      buildModifiers: {
        durationIncrease: 0, chargesUsedIncrease: 0, chargesGainedIncrease: 0, effectIncrease: 0,
        magicUtilityEffectIncrease: 0, genericChargesGeneratedPerSecond: 0, lifeChargesGeneratedPerSecond: 0,
        manaChargesGeneratedPerSecond: 0, utilityChargesGeneratedPerSecond: 0,
        chargesGeneratedPerEmptyFlaskPerSecond: 0, chanceNotConsumeCharges: 0, ironFlaskChargesGeneratedOnWardBreak: 0,
      },
    },
    {
      slot: 'Flask 2', name: 'Quicksilver Flask', baseName: 'Quicksilver Flask', rarity: 'MAGIC', active: false,
      life: false, mana: false, utility: true, local: { duration: 6 },
      buildModifiers: {
        durationIncrease: 0, chargesUsedIncrease: 0, chargesGainedIncrease: 0, effectIncrease: 0,
        magicUtilityEffectIncrease: 0, genericChargesGeneratedPerSecond: 0, lifeChargesGeneratedPerSecond: 0,
        manaChargesGeneratedPerSecond: 0, utilityChargesGeneratedPerSecond: 0,
        chargesGeneratedPerEmptyFlaskPerSecond: 0, chanceNotConsumeCharges: 0, ironFlaskChargesGeneratedOnWardBreak: 0,
      },
    },
  ],
  elapsedMs: 12,
};

describe('Build Doctor snapshot', () => {
  it('preserves deterministic PoB results and their provenance without manufacturing a score', () => {
    const snapshot = readyBuildDoctorSnapshot({
      profileId: 'pob-test', profileName: 'Test build', generatedAt: '2026-09-03T10:00:00.000Z', baseline, flaskInspection: flasks,
      integrity: { metrics: integrityMetrics(), kernel: constraintKernel },
    });
    expect(snapshot.status).toBe('ready');
    expect(snapshot.baseline?.offence.totalDps).toBe(1_250_000);
    expect(snapshot.kernel?.pobCommit).toBe(baseline.kernel.pobCommit);
    expect(snapshot.findings.some((finding) => finding.code === 'guard-skill-active')).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/score/i);
  });

  it('labels imported utility state as configuration evidence rather than encounter sustainability', () => {
    const snapshot = readyBuildDoctorSnapshot({
      profileId: 'pob-test', profileName: 'Test build', generatedAt: '2026-09-03T10:00:00.000Z', baseline, flaskInspection: flasks,
      integrity: { metrics: integrityMetrics(), kernel: constraintKernel },
    });
    const finding = snapshot.findings.find((entry) => entry.code === 'imported-flask-configuration');
    expect(finding?.detail).toContain('configuration evidence');
    expect(finding?.detail).toContain('not a claim');
  });

  it('reports baseline requirement and elemental gaps as attention-required while keeping chaos/suppression contextual', () => {
    const metrics = integrityMetrics();
    metrics.attributes.strength = { current: 145, required: 155 };
    metrics.resistances.fire = { current: 68, total: 68, overCap: 0, missing: 7 };
    const snapshot = readyBuildDoctorSnapshot({
      profileId: 'pob-test', profileName: 'Test build', generatedAt: '2026-09-03T10:00:00.000Z', baseline,
      integrity: { metrics, kernel: constraintKernel },
    });
    expect(snapshot.integrity?.status).toBe('attention-required');
    if (!snapshot.integrity || snapshot.integrity.status === 'unavailable') throw new Error('expected verified integrity');
    expect(snapshot.integrity.warningCount).toBe(2);
    expect(snapshot.integrity.infoCount).toBe(2);
    expect(snapshot.integrity.findings.map((entry) => entry.key)).toEqual(expect.arrayContaining([
      'baseline-strength-requirement', 'baseline-fire-resistance', 'baseline-chaos-resistance', 'baseline-spell-suppression',
    ]));
    expect(snapshot.message).toMatch(/integrity gaps/i);
  });

  it('reports supported checks clear when only contextual defensive posture remains', () => {
    const snapshot = readyBuildDoctorSnapshot({
      profileId: 'pob-test', profileName: 'Test build', generatedAt: '2026-09-03T10:00:00.000Z', baseline,
      integrity: { metrics: integrityMetrics(), kernel: constraintKernel },
    });
    expect(snapshot.integrity?.status).toBe('supported-checks-clear');
    if (!snapshot.integrity || snapshot.integrity.status === 'unavailable') throw new Error('expected verified integrity');
    expect(snapshot.integrity.warningCount).toBe(0);
    expect(snapshot.integrity.infoCount).toBe(2);
    expect(snapshot.integrity.message).toMatch(/contextual defensive posture/i);
  });

  it('keeps baseline numbers usable but marks integrity unavailable when the secondary evidence process fails', () => {
    const snapshot = readyBuildDoctorSnapshot({
      profileId: 'pob-test', profileName: 'Test build', generatedAt: '2026-09-03T10:00:00.000Z', baseline,
      integrityUnavailableMessage: 'Constraint process unavailable.',
    });
    expect(snapshot.status).toBe('ready');
    expect(snapshot.baseline?.offence.totalDps).toBe(1_250_000);
    expect(snapshot.integrity).toMatchObject({ status: 'unavailable', findings: [], warningCount: 0, infoCount: 0 });
    expect(snapshot.integrity?.message).toMatch(/constraint process unavailable/i);
  });

  it('represents old profiles as re-import-required without pretending to calculate them', () => {
    const snapshot = unavailableBuildDoctorSnapshot({
      status: 'reimport-required', profileId: 'legacy', profileName: 'Legacy build', message: 'Re-import this build.',
    });
    expect(snapshot.baseline).toBeUndefined();
    expect(snapshot.integrity).toBeUndefined();
    expect(snapshot.findings).toEqual([]);
  });
});
