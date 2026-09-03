import { describe, expect, it } from 'vitest';
import {
  passiveContributionCandidates,
  readyPassiveContributionAnalysis,
  unavailablePassiveContributionAnalysis,
} from './build-doctor-passive-contribution';
import type { BuildProfile } from './build-profiles';
import type { PassiveTreeSnapshot } from './passive-data';
import type { PobCalculationResult, PobPerturbationComparison } from './pob-calculation';

const kernel = {
  protocolVersion: 1,
  pobRepository: 'PathOfBuildingCommunity/PathOfBuilding',
  pobCommit: 'ed354c2f8c42e148bc904c7508dbe851fb2cf952',
  runtime: 'LuaJIT 2.1',
  runtimeRevision: '2460b3ff93a1c955de3d62cfc825de7d68dc272e',
  adapterVersion: '0.6.0',
};

function profile(targetVersion = '3_29'): BuildProfile {
  return {
    id: 'profile', name: 'Endgame build', importedAt: '2026-09-03T12:00:00.000Z', sourceKind: 'xml',
    build: {
      root: 'PathOfBuilding', className: 'Shadow', level: 95, targetVersion, warnings: [], activeSkillGroups: [], skillStages: [], itemStages: [], configStages: [],
      treeStages: [{ id: 'tree:1', title: 'Endgame', kind: 'tree', active: true, ordinal: 1, treeVersion: targetVersion, nodeIds: [30, 20, 10, 40, 50, 60, 20] }],
    },
  };
}

function snapshot(gameVersion = '3.29'): PassiveTreeSnapshot {
  return {
    schemaVersion: 2, gameVersion, generatedAt: '2026-09-03T12:00:00.000Z', source: { url: 'https://example.invalid/tree.json', sha256: 'a'.repeat(64) },
    nodes: [
      { id: 10, name: 'Small Damage', kind: 'normal' },
      { id: 20, name: 'Big Notable', kind: 'notable' },
      { id: 30, name: 'Build Keystone', kind: 'keystone' },
      { id: 40, name: 'Mastery', kind: 'mastery' },
      { id: 50, name: 'Jewel Socket', kind: 'socket' },
      { id: 60, name: 'Dynamic Normal', kind: 'normal', dynamic: true },
    ],
  };
}

function result(requestId: string, damage = 1_000_000, life = 4_000): PobCalculationResult {
  return {
    protocolVersion: 1, requestId, kernel, scenario: { scenario: 'imported' },
    offence: { totalDps: damage },
    defence: { life, effectiveHitPool: 100_000, maximumHit: { physical: 30_000 } },
    warnings: [], elapsedMs: 10,
  };
}

function comparison(nodeId: number, before = result('before'), after = result('after', 900_000, 3_800)): PobPerturbationComparison {
  return { perturbations: [{ kind: 'passive-node', operation: 'deallocate', nodeId }], before, after };
}

describe('Build Doctor passive contribution evidence', () => {
  it('uses compatible verified-tree metadata and exposes only safe normal/notable/keystone candidates', () => {
    const candidates = passiveContributionCandidates(profile(), snapshot());
    expect(candidates.status).toBe('ready');
    if (candidates.status !== 'ready') throw new Error('expected ready candidates');
    expect(candidates.treeVersion).toBe('3.29');
    expect(candidates.candidates).toEqual([
      { nodeId: 30, name: 'Build Keystone', kind: 'keystone' },
      { nodeId: 20, name: 'Big Notable', kind: 'notable' },
      { nodeId: 10, name: 'Small Damage', kind: 'normal' },
    ]);
  });

  it('normalizes PoB underscore versions but rejects actual tree-version mismatches', () => {
    expect(passiveContributionCandidates(profile('3_29'), snapshot('3.29')).status).toBe('ready');
    const stale = passiveContributionCandidates(profile('3_28'), snapshot('3.29'));
    expect(stale.status).toBe('unavailable');
    expect(stale.message).toMatch(/does not match/i);
    expect(stale.candidates).toEqual([]);
  });

  it('preserves exact shared reviewed metrics for one isolated deallocation', () => {
    const analysis = readyPassiveContributionAnalysis({
      profileId: 'profile', profileName: 'Build', generatedAt: '2026-09-03T12:00:00.000Z',
      node: { nodeId: 20, name: 'Big Notable', kind: 'notable' }, comparison: comparison(20),
    });
    expect(analysis.status).toBe('ready');
    expect(analysis.changedMetrics.find((metric) => metric.key === 'damage')).toMatchObject({ before: 1_000_000, after: 900_000, relativeChangePercent: -10 });
    expect(analysis.changedMetrics.find((metric) => metric.key === 'life')).toMatchObject({ before: 4_000, after: 3_800, absoluteChange: -200 });
  });

  it('rejects the wrong node id, allocation direction, or changed kernel provenance', () => {
    const wrongNode = comparison(10);
    expect(() => readyPassiveContributionAnalysis({
      profileId: 'profile', profileName: 'Build', generatedAt: 'x', node: { nodeId: 20, name: 'Big Notable', kind: 'notable' }, comparison: wrongNode,
    })).toThrow(/does not match/i);

    const wrongDirection = comparison(20);
    wrongDirection.perturbations = [{ kind: 'passive-node', operation: 'allocate', nodeId: 20 }];
    expect(() => readyPassiveContributionAnalysis({
      profileId: 'profile', profileName: 'Build', generatedAt: 'x', node: { nodeId: 20, name: 'Big Notable', kind: 'notable' }, comparison: wrongDirection,
    })).toThrow(/does not match/i);

    const changedKernel = comparison(20);
    changedKernel.after.kernel = { ...kernel, adapterVersion: 'other' };
    expect(() => readyPassiveContributionAnalysis({
      profileId: 'profile', profileName: 'Build', generatedAt: 'x', node: { nodeId: 20, name: 'Big Notable', kind: 'notable' }, comparison: changedKernel,
    })).toThrow(/kernel provenance/i);
  });

  it('never promotes isolated deallocation into efficiency or legal-respec advice', () => {
    const analysis = readyPassiveContributionAnalysis({
      profileId: 'profile', profileName: 'Build', generatedAt: 'x', node: { nodeId: 20, name: 'Big Notable', kind: 'notable' }, comparison: comparison(20),
    });
    expect(analysis.boundary).toMatch(/isolated/i);
    expect(analysis.boundary).toMatch(/legal connected tree/i);
    expect(analysis.boundary).toMatch(/downstream/i);
    expect(analysis.boundary).toMatch(/efficiency/i);
    expect(analysis.boundary).not.toMatch(/best|worst|recommended/i);
  });

  it('normalizes unavailable analysis without inventing metrics', () => {
    const unavailable = unavailablePassiveContributionAnalysis({ profileId: 'profile', profileName: 'Build', status: 'failed', nodeId: 20, message: '  Could   not calculate. ' });
    expect(unavailable.message).toBe('Could not calculate.');
    expect('metrics' in unavailable).toBe(false);
  });
});
