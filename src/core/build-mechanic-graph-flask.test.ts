import { describe, expect, it } from 'vitest';
import { graphFromPobPerturbation } from './build-mechanic-graph';
import { POB_CALCULATION_PROTOCOL_VERSION, type PobCalculationResult } from './pob-calculation';

function result(requestId: string, totalDps: number, armour: number): PobCalculationResult {
  return {
    protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
    requestId,
    kernel: {
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      pobRepository: 'PathOfBuildingCommunity/PathOfBuilding',
      pobCommit: 'ed354c2f8c42e148bc904c7508dbe851fb2cf952',
      runtime: 'LuaJIT',
      runtimeRevision: '2460b3ff93a1c955de3d62cfc825de7d68dc272e',
      adapterVersion: '0.4.0',
    },
    scenario: { scenario: 'sustained-boss' },
    offence: { totalDps },
    defence: { armour },
    warnings: [],
    elapsedMs: 1,
  };
}

describe('Build mechanic graph flask evidence', () => {
  it('records the exact flask active-state transition alongside observed responses', () => {
    const graph = graphFromPobPerturbation({
      perturbations: [{ kind: 'toggle-flask', slot: 'Flask 3' }],
      before: result('flask-3-off', 1_500_000, 35_000),
      after: result('flask-3-off', 1_200_000, 21_000),
      stateTransition: {
        kind: 'flask-active',
        slot: 'Flask 3',
        fromActive: true,
        toActive: false,
      },
    });

    expect(graph.nodes).toContainEqual(expect.objectContaining({
      id: 'condition:flask-active:Flask%203',
      kind: 'condition',
      label: 'Flask 3 active',
    }));
    expect(graph.evidence[0]).toMatchObject({
      perturbation: { kind: 'toggle-flask', slot: 'Flask 3' },
      stateTransition: {
        kind: 'flask-active',
        slot: 'Flask 3',
        fromActive: true,
        toActive: false,
      },
    });
    expect(graph.edges.map((edge) => edge.to)).toEqual(expect.arrayContaining([
      'observable:total-dps',
      'observable:armour',
    ]));
  });

  it('refuses flask evidence when the worker transition metadata is missing or contradictory', () => {
    const before = result('bad-flask', 100, 100);
    const after = result('bad-flask', 90, 80);

    expect(() => graphFromPobPerturbation({
      perturbations: [{ kind: 'toggle-flask', slot: 'Flask 1' }],
      before,
      after,
    })).toThrow(/requires an explicit flask-active state transition/);

    expect(() => graphFromPobPerturbation({
      perturbations: [{ kind: 'toggle-flask', slot: 'Flask 1' }],
      before,
      after,
      stateTransition: {
        kind: 'flask-active',
        slot: 'Flask 2',
        fromActive: true,
        toActive: false,
      },
    })).toThrow(/does not match/);
  });
});
