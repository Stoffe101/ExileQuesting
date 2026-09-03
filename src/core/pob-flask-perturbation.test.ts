import { describe, expect, it } from 'vitest';
import {
  POB_CALCULATION_PROTOCOL_VERSION,
  POB_FLASK_SLOTS,
  perturbationEvaluation,
  validPobCalculationRequest,
  type PobCalculationResult,
} from './pob-calculation';

function result(requestId: string, totalDps: number): PobCalculationResult {
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
    defence: {},
    warnings: [],
    elapsedMs: 1,
  };
}

describe('PoB flask availability perturbations', () => {
  it('accepts exactly one of the five explicit PoB flask slots', () => {
    for (const slot of POB_FLASK_SLOTS) {
      expect(validPobCalculationRequest({
        protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
        requestId: `toggle-${slot}`,
        operation: 'calculate-with-perturbations',
        xml: '<PathOfBuilding></PathOfBuilding>',
        scenario: { scenario: 'sustained-boss' },
        perturbations: [{ kind: 'toggle-flask', slot }],
      })).toBe(true);
    }
  });

  it('rejects made-up or non-flask slots before worker execution', () => {
    for (const slot of ['Flask 0', 'Flask 6', 'Belt', 'Tincture 1']) {
      expect(validPobCalculationRequest({
        protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
        requestId: 'bad-flask-slot',
        operation: 'calculate-with-perturbations',
        xml: '<PathOfBuilding></PathOfBuilding>',
        scenario: { scenario: 'custom' },
        perturbations: [{ kind: 'toggle-flask', slot: slot as never }],
      })).toBe(false);
    }
  });

  it('preserves the explicit active-state transition with the numerical evaluation', () => {
    const evaluation = perturbationEvaluation({
      perturbations: [{ kind: 'toggle-flask', slot: 'Flask 2' }],
      before: result('flask-state', 1_000_000),
      after: result('flask-state', 850_000),
      stateTransition: {
        kind: 'flask-active',
        slot: 'Flask 2',
        fromActive: true,
        toActive: false,
      },
    });

    expect(evaluation.stateTransition).toEqual({
      kind: 'flask-active',
      slot: 'Flask 2',
      fromActive: true,
      toActive: false,
    });
    expect(evaluation.delta.totalDps.percent).toBeCloseTo(-15);
  });
});
