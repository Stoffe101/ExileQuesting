import { describe, expect, it } from 'vitest';
import {
  MAX_POB_PASSIVE_NODE_ID,
  POB_CALCULATION_PROTOCOL_VERSION,
  validPobCalculationRequest,
} from './pob-calculation';

function request(perturbation: {
  kind: 'passive-node';
  operation: 'allocate' | 'deallocate';
  nodeId: number;
}) {
  return {
    protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
    requestId: `passive-${perturbation.operation}`,
    operation: 'calculate-with-perturbations' as const,
    xml: '<PathOfBuilding></PathOfBuilding>',
    scenario: { scenario: 'custom' as const },
    perturbations: [perturbation],
  };
}

describe('PoB passive-node perturbation protocol', () => {
  it('accepts one bounded passive allocation or deallocation request', () => {
    expect(validPobCalculationRequest(request({ kind: 'passive-node', operation: 'allocate', nodeId: 65_536 }))).toBe(true);
    expect(validPobCalculationRequest(request({ kind: 'passive-node', operation: 'deallocate', nodeId: 12_345 }))).toBe(true);
  });

  it('rejects non-integer, zero, negative and oversized node ids', () => {
    for (const nodeId of [0, -1, 12.5, MAX_POB_PASSIVE_NODE_ID + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validPobCalculationRequest(request({ kind: 'passive-node', operation: 'allocate', nodeId }))).toBe(false);
    }
  });

  it('still rejects unsupported perturbation kinds and multi-perturbation packages', () => {
    expect(validPobCalculationRequest({
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      requestId: 'unsupported',
      operation: 'calculate-with-perturbations',
      xml: '<PathOfBuilding></PathOfBuilding>',
      scenario: { scenario: 'custom' },
      perturbations: [{ kind: 'configuration', key: 'condition', value: true }],
    })).toBe(false);

    expect(validPobCalculationRequest({
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      requestId: 'two-passives',
      operation: 'calculate-with-perturbations',
      xml: '<PathOfBuilding></PathOfBuilding>',
      scenario: { scenario: 'custom' },
      perturbations: [
        { kind: 'passive-node', operation: 'deallocate', nodeId: 100 },
        { kind: 'passive-node', operation: 'allocate', nodeId: 101 },
      ],
    })).toBe(false);
  });
});
