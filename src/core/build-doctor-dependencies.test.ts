import { describe, expect, it } from 'vitest';
import {
  measuredConfigurationDependency,
  rankConfigurationDependencies,
  readyDependencyScan,
  strongestObservedRelativeChangePercent,
  unsupportedConfigurationDependency,
} from './build-doctor-dependencies';
import type { PobCalculationResult, PobPerturbationComparison } from './pob-calculation';

const kernel = {
  protocolVersion: 1,
  pobRepository: 'PathOfBuildingCommunity/PathOfBuilding',
  pobCommit: 'ed354c2f8c42e148bc904c7508dbe851fb2cf952',
  runtime: 'LuaJIT 2.1',
  runtimeRevision: '2460b3ff93a1c955de3d62cfc825de7d68dc272e',
  adapterVersion: '0.5.0',
};

function result(requestId: string, totalDps: number, ehp: number, physicalMaxHit: number): PobCalculationResult {
  return {
    protocolVersion: 1,
    requestId,
    kernel,
    scenario: { scenario: 'imported' },
    offence: { totalDps },
    defence: { effectiveHitPool: ehp, maximumHit: { physical: physicalMaxHit, fire: 60_000, cold: 60_000, lightning: 60_000, chaos: 30_000 } },
    warnings: [],
    elapsedMs: 10,
  };
}

function comparison(slot: 'Flask 1' | 'Flask 2', before: PobCalculationResult, after: PobCalculationResult): PobPerturbationComparison {
  return {
    perturbations: [{ kind: 'toggle-flask', slot }],
    stateTransition: { kind: 'flask-active', slot, fromActive: true, toActive: false },
    before,
    after,
  };
}

describe('Build Doctor configuration dependency evidence', () => {
  it('reports only the reversible PoB delta for an active utility state', () => {
    const dependency = measuredConfigurationDependency(
      { slot: 'Flask 1', name: 'Diamond Flask', active: true, utility: true },
      comparison('Flask 1', result('before', 1_000_000, 100_000, 30_000), result('after', 800_000, 100_000, 30_000)),
    );

    expect(dependency.status).toBe('measured');
    expect(dependency.delta.totalDps).toMatchObject({ before: 1_000_000, after: 800_000, percent: -20 });
    expect(dependency.strongestObservedRelativeChangePercent).toBe(-20);
    expect(dependency.evidence).toBe('pob-reversible-toggle');
  });

  it('uses the largest observed relative change only as a ranking signal', () => {
    const delta = measuredConfigurationDependency(
      { slot: 'Flask 1', name: 'Granite Flask', active: true, utility: true },
      comparison('Flask 1', result('before', 1_000_000, 100_000, 40_000), result('after', 1_000_000, 90_000, 30_000)),
    ).delta;
    expect(strongestObservedRelativeChangePercent(delta)).toBe(-25);
  });

  it('never invents a relative percentage when the before value is zero', () => {
    const dependency = measuredConfigurationDependency(
      { slot: 'Flask 1', name: 'Utility', active: true, utility: true },
      comparison('Flask 1', result('before', 0, 0, 0), result('after', 100, 100, 100)),
    );
    expect(dependency.delta.totalDps.percent).toBeUndefined();
    expect(dependency.delta.effectiveHitPool.percent).toBeUndefined();
  });

  it('rejects evidence whose state transition does not match the inspected slot', () => {
    const bad = comparison('Flask 2', result('before', 100, 100, 100), result('after', 90, 100, 100));
    expect(() => measuredConfigurationDependency(
      { slot: 'Flask 1', name: 'Diamond Flask', active: true, utility: true },
      bad,
    )).toThrow(/does not match/i);
  });

  it('rejects disabled or non-utility entries instead of pretending they were measured dependencies', () => {
    const measured = comparison('Flask 1', result('before', 100, 100, 100), result('after', 90, 100, 100));
    expect(() => measuredConfigurationDependency({ slot: 'Flask 1', name: 'Disabled', active: false, utility: true }, measured)).toThrow(/active utility/i);
    expect(() => measuredConfigurationDependency({ slot: 'Flask 1', name: 'Life Flask', active: true, utility: false }, measured)).toThrow(/active utility/i);
  });

  it('sorts measured dependencies by observed change while keeping unsupported cases explicit', () => {
    const small = measuredConfigurationDependency(
      { slot: 'Flask 1', name: 'Small dependency', active: true, utility: true },
      comparison('Flask 1', result('before', 100, 100, 100), result('after', 90, 100, 100)),
    );
    const large = measuredConfigurationDependency(
      { slot: 'Flask 2', name: 'Large dependency', active: true, utility: true },
      comparison('Flask 2', result('before', 100, 100, 100), result('after', 60, 100, 100)),
    );
    const unsupported = unsupportedConfigurationDependency({ slot: 'Flask 1', name: 'Unsupported' }, 'Calculation unavailable.');

    expect(rankConfigurationDependencies([small, unsupported, large]).map((entry) => entry.name)).toEqual([
      'Large dependency',
      'Small dependency',
      'Unsupported',
    ]);
  });

  it('describes ranking as measured response rather than a build-quality verdict', () => {
    const dependency = measuredConfigurationDependency(
      { slot: 'Flask 1', name: 'Diamond Flask', active: true, utility: true },
      comparison('Flask 1', result('before', 100, 100, 100), result('after', 80, 100, 100)),
    );
    const scan = readyDependencyScan({
      profileId: 'profile',
      profileName: 'Measured build',
      generatedAt: '2026-09-03T11:00:00.000Z',
      kernel,
      dependencies: [dependency],
    });
    expect(scan.status).toBe('ready');
    expect(scan.message).toMatch(/largest observed relative change/i);
    expect(scan.message).not.toMatch(/good|bad|score|boss uptime/i);
  });
});
