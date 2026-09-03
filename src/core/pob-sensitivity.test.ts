import { describe, expect, it } from 'vitest';
import { POB_CALCULATION_PROTOCOL_VERSION, type PobCalculationResult } from './pob-calculation';
import { analyzePobSensitivitySweep } from './pob-sensitivity';

function result(requestId: string, totalDps: number, effectiveTriggerRate?: number): PobCalculationResult {
  return {
    protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
    requestId,
    kernel: {
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      pobRepository: 'PathOfBuildingCommunity/PathOfBuilding',
      pobCommit: 'ed354c2f8c42e148bc904c7508dbe851fb2cf952',
      runtime: 'luajit',
      runtimeRevision: 'test',
      adapterVersion: 'test',
    },
    scenario: { scenario: 'custom' },
    offence: { totalDps, effectiveTriggerRate },
    defence: {},
    warnings: [],
    elapsedMs: 1,
  };
}

describe('PoB sensitivity analysis', () => {
  it('sorts samples, preserves traceability and normalizes slope across uneven axis steps', () => {
    const analysis = analyzePobSensitivitySweep({
      axis: { id: 'attack-speed', label: 'Attack speed', unit: '%' },
      metric: 'total-dps',
      samples: [
        { axisValue: 30, result: result('thirty', 1_300) },
        { axisValue: 0, result: result('zero', 1_000) },
        { axisValue: 10, result: result('ten', 1_100) },
      ],
    });

    expect(analysis.samples.map((sample) => sample.axisValue)).toEqual([0, 10, 30]);
    expect(analysis.samples.map((sample) => sample.requestId)).toEqual(['zero', 'ten', 'thirty']);
    expect(analysis.segments[0].slope).toBeCloseTo(10);
    expect(analysis.segments[1].slope).toBeCloseTo(10);
    expect(analysis.breakpointCandidates).toEqual([]);
  });

  it('detects the onset of a measured plateau without claiming a mechanic-specific breakpoint', () => {
    const analysis = analyzePobSensitivitySweep({
      axis: { id: 'trigger-input', label: 'Trigger input' },
      metric: 'effective-trigger-rate',
      samples: [
        { axisValue: 0, result: result('a', 100, 5) },
        { axisValue: 1, result: result('b', 100, 6) },
        { axisValue: 2, result: result('c', 100, 7) },
        { axisValue: 3, result: result('d', 100, 7) },
        { axisValue: 4, result: result('e', 100, 7) },
      ],
    });

    expect(analysis.breakpointCandidates).toEqual([
      expect.objectContaining({
        kind: 'plateau-onset',
        axisValue: 2,
        evidence: 'derived-candidate',
      }),
    ]);
  });

  it('detects a strong slope discontinuity using an explicit conservative threshold', () => {
    const analysis = analyzePobSensitivitySweep({
      axis: { id: 'synthetic-axis', label: 'Synthetic axis' },
      metric: 'total-dps',
      samples: [
        { axisValue: 0, result: result('a', 1_000) },
        { axisValue: 1, result: result('b', 1_100) },
        { axisValue: 2, result: result('c', 1_200) },
        { axisValue: 3, result: result('d', 1_600) },
      ],
    });

    expect(analysis.breakpointCandidates).toEqual([
      expect.objectContaining({
        kind: 'slope-change',
        axisValue: 2,
        slopeRatio: 4,
      }),
    ]);
  });

  it('detects direction changes separately from slope magnitude changes', () => {
    const analysis = analyzePobSensitivitySweep({
      axis: { id: 'tradeoff', label: 'Tradeoff' },
      metric: 'total-dps',
      samples: [
        { axisValue: 0, result: result('a', 1_000) },
        { axisValue: 1, result: result('b', 1_200) },
        { axisValue: 2, result: result('c', 1_100) },
      ],
    });

    expect(analysis.breakpointCandidates).toEqual([
      expect.objectContaining({ kind: 'direction-change', axisValue: 1 }),
    ]);
  });

  it('rejects duplicate axes, unavailable metrics and invalid analysis thresholds', () => {
    expect(() => analyzePobSensitivitySweep({
      axis: { id: 'duplicate', label: 'Duplicate' },
      metric: 'total-dps',
      samples: [
        { axisValue: 1, result: result('a', 1_000) },
        { axisValue: 1, result: result('b', 1_100) },
      ],
    })).toThrow(/unique/);

    expect(() => analyzePobSensitivitySweep({
      axis: { id: 'missing', label: 'Missing metric' },
      metric: 'effective-trigger-rate',
      samples: [
        { axisValue: 0, result: result('a', 1_000) },
        { axisValue: 1, result: result('b', 1_100) },
      ],
    })).toThrow(/unavailable/);

    expect(() => analyzePobSensitivitySweep({
      axis: { id: 'bad-options', label: 'Bad options' },
      metric: 'total-dps',
      samples: [
        { axisValue: 0, result: result('a', 1_000) },
        { axisValue: 1, result: result('b', 1_100) },
      ],
      options: { slopeChangeRatio: 1 },
    })).toThrow(/greater than 1/);
  });
});
