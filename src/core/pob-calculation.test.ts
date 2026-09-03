import { describe, expect, it } from 'vitest';
import {
  POB_CALCULATION_PROTOCOL_VERSION,
  POB_WORKER_SENTINEL,
  calculationDelta,
  parsePobWorkerProtocolLines,
  validPobCalculationRequest,
  type PobCalculationResult,
} from './pob-calculation';

function result(totalDps: number, physicalMaxHit: number, ehp: number): PobCalculationResult {
  return {
    protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
    requestId: 'test',
    kernel: {
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      pobRepository: 'PathOfBuildingCommunity/PathOfBuilding',
      pobCommit: 'ed354c2f8c42e148bc904c7508dbe851fb2cf952',
      runtime: 'luajit',
      adapterVersion: 'test',
    },
    scenario: { scenario: 'sustained-boss' },
    offence: { totalDps },
    defence: {
      effectiveHitPool: ehp,
      maximumHit: { physical: physicalMaxHit, fire: 60_000 },
    },
    warnings: [],
    elapsedMs: 10,
  };
}

describe('PoB calculation protocol', () => {
  it('computes comparable before/after deltas', () => {
    const delta = calculationDelta(result(10_000_000, 30_000, 80_000), result(11_500_000, 36_000, 84_000));
    expect(delta.totalDps.absolute).toBe(1_500_000);
    expect(delta.totalDps.percent).toBeCloseTo(15);
    expect(delta.maximumHit.physical.percent).toBeCloseTo(20);
    expect(delta.effectiveHitPool.percent).toBeCloseTo(5);
  });

  it('accepts bounded calculation requests and rejects oversized mutation batches', () => {
    expect(validPobCalculationRequest({
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      requestId: 'base',
      operation: 'load-and-calculate',
      xml: '<PathOfBuilding></PathOfBuilding>',
      scenario: { scenario: 'mapping' },
    })).toBe(true);

    expect(validPobCalculationRequest({
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION,
      requestId: 'mutations',
      operation: 'calculate-with-perturbations',
      xml: '<PathOfBuilding></PathOfBuilding>',
      scenario: { scenario: 'custom' },
      perturbations: Array.from({ length: 65 }, (_, index) => ({
        kind: 'synthetic-stat' as const,
        stat: 'test',
        value: index,
      })),
    })).toBe(false);
  });

  it('rejects protocol drift before it reaches a worker', () => {
    expect(validPobCalculationRequest({
      protocolVersion: POB_CALCULATION_PROTOCOL_VERSION + 1,
      requestId: 'bad-version',
      operation: 'health',
    })).toBe(false);
  });

  it('extracts only sentinel-prefixed worker protocol messages from noisy PoB stdout', () => {
    const stdout = [
      'Loading main script...',
      'Path of Building console chatter',
      `${POB_WORKER_SENTINEL}{"protocolVersion":1,"requestId":"health","ok":true,"health":{"status":"ready","kernel":{"protocolVersion":1,"pobRepository":"PathOfBuildingCommunity/PathOfBuilding","pobCommit":"ed354c2f8c42e148bc904c7508dbe851fb2cf952","runtime":"LuaJIT","adapterVersion":"0.1.0"}}}`,
      'more logs',
    ].join('\n');

    const messages = parsePobWorkerProtocolLines(stdout);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ requestId: 'health', ok: true });
  });

  it('surfaces malformed sentinel payloads instead of silently accepting corrupt IPC', () => {
    expect(() => parsePobWorkerProtocolLines(`${POB_WORKER_SENTINEL}{bad json}`)).toThrow();
  });
});
